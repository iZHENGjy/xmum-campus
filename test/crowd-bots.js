/* 仅供本地测试：一群假玩家（test/social.html?crowd=20），走 test/firebase-shared.js 的假数据库。
 * 怎么走见 test/crowd-model.js（站着聊天、走路、开车、偶尔切去菜单）；怎么发和真玩家一样：
 *   新协议：XCrowdModel.write → /pres/{格}/{uid}（js/net.js 的 XNet.proto，航位推算）
 *   &oldrules：数据库没有新规则，大家写旧的 /presence，节奏和改版前的 js/net.js 一样（每 200 毫秒，动了就整条重发）
 * 配合 &netmeter 看本页每秒收多少字节。&storm 一起发表情喊话；&cap=5 把在线上限设成 5（默认 假人数 + 20）；控制台 XCrowdBots.radio(6) 让最近 6 辆车开外放。&scene=tight（默认）| campus | map。&freeze=300 走 300 步后停住（测画面开销用）。控制台：XCrowdBots.A（假玩家列表）、XCrowdBots.stop() */
'use strict';
(() => {
  const Q = new URLSearchParams(location.search), N = Math.max(1, Math.min(80, +Q.get('crowd') || 20));
  const M = XCrowdModel, rnd = M.rng(+Q.get('seed') || 7), spots = M.SPOTS[Q.get('scene')] || M.SPOTS.tight;
  const COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#c46bff', '#4fd1c5', '#d62828', '#457b9d'];
  const pad = s => (s + 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx').slice(0, 28);        // 真 uid 是 28 个字符，路径长度和真的一样
  const A = [];
  for (let i = 0; i < N; i++){ const a = M.make(i, spots, rnd); a.uid = pad('crowd' + i + 'Q'); a.name = '假人' + (i + 1); a.color = COLORS[i % COLORS.length]; a.old = M.oldSender(); A.push(a); }
  let timer = 0, n = 0;
  const FREEZE = +Q.get('freeze') || 0;                 // &freeze=300：走 300 步（30 秒）以后停住，测画面时每次位置都一样
  const STORM = Q.has('storm');                          // &storm：走路的假人每 3 秒有一半机会发表情或喊话
  function tick(){
    if (!window.XNet || !XNet.online || !window.__mock) return;
    const grid = XNet.netInfo && XNet.netInfo().gridOK, Mk = window.__mock;
    n++;
    const still = FREEZE && n > FREEZE;
    for (const a of A){
      if (!still) M.step(a, .1, spots, rnd);
      else a.v = 0;
      a.y = typeof groundAt === 'function' ? groundAt(a.x, a.z) : 0;
      if (grid){
        if (!a.live){ if (a.cell) M.leave(a); continue; }
        if (n % 5 === 0){ let c = 0; for (const b of A) if (b !== a && b.live && b.cell && XNet.proto.around(a.cell || '').includes(b.cell)) c++; a.crowd = c + 1; }
        const o = {name:a.name, mode:'naiwa', x:a.x, z:a.z, y:a.y, h:a.h, car:a.car, color:a.car ? a.color : '#f1c84b'};
        if (STORM && !a.car && n % 30 === a.i % 30 && rnd() < .5){ a.fxSeq = ((a.fxSeq || 0) + 1) % 10000; a.fx = (rnd() < .5 ? 'e' + ((rnd() * 8) | 0) : 's' + ((rnd() * 20) | 0)) + '-' + a.fxSeq; a.fxAt = n; }
        if (a.fx && n - a.fxAt < 80) o.fx = a.fx;
        M.write(a, o);
      } else if (n % 2 === 0){
        const o = a.old(a, performance.now(), a.name, a.uid);
        if (o){ o.t = {'.sv':'timestamp'}; o.y = Math.round(a.y * 100) / 100; if (o.car) o.color = a.color; Mk.put('presence/' + a.uid, o); Mk.botDisc.set('presence/' + a.uid, 1); }
      }
    }
  }
  /* 在线人数上限（/config/maxOnline，js/net.js）：默认放宽到 假人数 + 20，免得自己被排队；&cap=5 测满员排队 */
  if (window.__mock) window.__mock.put('config/maxOnline', +Q.get('cap') || N + 20);
  timer = setInterval(() => { try { tick(); } catch(e){ console.error('[CROWD]', e); } }, 100);
  /* radio(k)：离你最近的 k 辆假人的车开外放（写 /radio/{uid}，和真玩家一样） */
  function radio(k){
    const me = typeof driving !== 'undefined' && driving ? driving : nw;
    const list = A.filter(a => a.car && a.live).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, k);
    for (const a of list){ window.__mock.put('radio/' + a.uid, {s:(a.i % 3), k:1000 + a.i, t:Date.now(), l:false}); window.__mock.botDisc.set('radio/' + a.uid, 1); }
    return list.map(a => [a.name, Math.round(Math.hypot(a.x - me.x, a.z - me.z))]);
  }
  window.XCrowdBots = {A, radio, stop(){ clearInterval(timer); for (const a of A){ M.leave(a); window.__mock.put('on/' + a.uid, null); window.__mock.put('presence/' + a.uid, null); } }};
})();
