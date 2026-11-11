/* 仅供本地测试：一群假玩家怎么走（纯计算，不碰游戏和数据库）。
 * test/net-traffic.html 用它模拟流量，test/crowd-bots.js 用它在游戏里放假玩家。
 *   XCrowdModel.SPOTS[场景]   去处的坐标：tight 挤在 A3 广场 100 米内 / campus 校园里（教学楼、宿舍、B1）/ map 全图（加上 Bell Avenue、KIP、麦当当）
 *   XCrowdModel.make(i, spots, rnd)  一个人：{x, z, y, h, car, live, st}
 *   XCrowdModel.step(a, dt, spots, rnd)  走一步。站着聊天、走路去别处、开车去远处、偶尔切去菜单/黑洞/后台（live = false）
 *   XCrowdModel.oldSender()  改版前 js/net.js 的发送节奏（每 200 毫秒看一次，动了就整条重发，停着 2 秒一次心跳）
 *   XCrowdModel.rng(seed)    可重复的随机数
 *   XCrowdModel.write(b, o) / leave(b)   在游戏测试页里按新协议写一个假玩家（test/social-bots.js、test/crowd-bots.js 用） */
'use strict';
(() => {
  const CAMPUS = [[-38, 149], [26, 127], [105, 128], [189, 114], [265, 117], [-248, 138], [-3, -127], [132, -136], [204, -134], [-96, -184], [-21, -184], [132, -187], [216, -187], [306, -178], [300, -118], [436, -118], [372, -84], [448, -70], [432, 11]];
  const SPOTS = {
    tight:[[105, 128], [60, 150], [150, 150], [105, 80], [70, 100], [140, 95]],
    campus:CAMPUS,
    map:CAMPUS.concat([[-408, 70], [306, 307], [522, 318], [250, 363], [-640, 918], [-478, 1103]])
  };
  const CARS = ['myvi', 'sedan', 'p911', 'cart', 'myvi', 'sedan'];
  function rng(seed){ let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wrap = a => { a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return isFinite(a) ? a : 0; };
  function make(i, spots, rnd){
    const s = spots[(rnd() * spots.length) | 0];
    return {i, x:s[0] + (rnd() - .5) * 30, z:s[1] + (rnd() - .5) * 30, y:0, h:rnd() * 6.28 - 3.14, car:null, live:true, st:'idle', left:rnd() * 20,
      v:0, cruise:0, tx:0, tz:0, wob:0, wobT:0, kind:CARS[i % CARS.length]};
  }
  function pick(a, spots, rnd){
    const r = rnd();
    if (r < .08){ a.st = 'menu'; a.live = false; a.car = null; a.v = 0; a.left = 20 + rnd() * 60; return; }        // 菜单、黑洞、切到后台
    if (r < .2){ a.st = 'idle'; a.left = 5 + rnd() * 25; return; }
    const drive = r < .45 || (a.car && r < .6);
    let s = spots[(rnd() * spots.length) | 0];
    if (Math.hypot(s[0] - a.x, s[1] - a.z) < 30) s = spots[(rnd() * spots.length) | 0];
    a.tx = s[0] + (rnd() - .5) * 30; a.tz = s[1] + (rnd() - .5) * 30;
    a.st = drive ? 'drive' : 'walk'; a.car = drive ? a.kind : null; a.cruise = drive ? 14 + rnd() * 16 : 5 + rnd() * 2.5; a.left = 150;
  }
  function step(a, dt, spots, rnd){
    a.left -= dt;
    if (a.st === 'menu'){ if (a.left <= 0){ a.live = true; a.st = 'idle'; a.left = 2 + rnd() * 5; } return; }
    if (a.st === 'idle'){ if (a.left <= 0) pick(a, spots, rnd); return; }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if (d < 4 || a.left <= 0){
      a.v = 0; a.st = 'idle'; a.left = 5 + rnd() * 40;
      if (a.car && rnd() < .5) a.car = null;                                     // 下车，或者坐在车里停着
      return;
    }
    /* 方向：朝目标，加一点手抖（走路）或者路的弯（开车），转向速度有上限 */
    a.wobT -= dt;
    if (a.wobT <= 0){ a.wobT = a.car ? 1.5 + rnd() * 3 : .6 + rnd() * 1.2; a.wobGoal = (rnd() - .5) * (a.car ? .9 : .6); }
    a.wob += ((a.wobGoal || 0) - a.wob) * Math.min(1, dt * (a.car ? .8 : 3));
    const want = Math.atan2(dx, dz) + (d > 25 ? a.wob : 0), maxTurn = (a.car ? 1.1 : 7) * dt;
    a.h = wrap(a.h + Math.max(-maxTurn, Math.min(maxTurn, wrap(want - a.h))));
    const vt = Math.min(a.cruise, d * (a.car ? .7 : 2));
    a.v += Math.max(-10 * dt, Math.min((a.car ? 6 : 20) * dt, vt - a.v));
    a.x += Math.sin(a.h) * a.v * dt; a.z += Math.cos(a.h) * a.v * dt;
  }
  /* 改版前 js/net.js 的 sendPresence()：每 200 毫秒检查，位置差 5 厘米或朝向差 0.02 就整条重发，否则 2 秒（不在场景里 4 秒）一次心跳 */
  function oldSender(){
    let last = null, at = -1e9;
    return (a, t, name, uid) => {
      const s = {live:a.live, car:a.live ? a.car : null, x:Math.round(a.x * 100) / 100, z:Math.round(a.z * 100) / 100, y:Math.round(a.y * 100) / 100, h:Math.round(wrap(a.h) * 1000) / 1000};
      const changed = !last || s.live !== last.live || s.car !== last.car
        || (s.live && (Math.abs(s.x - last.x) + Math.abs(s.z - last.z) + Math.abs(s.y - last.y) > .05 || Math.abs(wrap(s.h - last.h)) > .02));
      if (!changed && t - at < (s.live ? 2000 : 4000)) return null;
      last = s; at = t;
      const o = {name, mode:s.live ? 'naiwa' : 'orbit', x:s.x, z:s.z, y:s.y, h:s.h, color:'#f1c84b', t:Date.now()};
      if (s.car) o.car = s.car;
      return o;
    };
  }
  /* 在游戏的测试页里（test/firebase-shared.js 的假数据库）像真玩家一样写新协议：每个假玩家一个 XNet.proto.sender()。
     b 是假玩家（会在上面记 snd、cell、meta），o = {name, mode, x, z, y, h, car?, color, fx?, ride?, rs?, duel?, ds?} */
  function write(b, o){
    const PR = XNet.proto, Mk = window.__mock, TS = {'.sv':'timestamp'}, t = performance.now();
    if (!b.snd){ b.snd = PR.sender(); Mk.put('on/' + b.uid, TS); Mk.disc.set('on/' + b.uid, 1); }
    const s = b.snd.sample({x:o.x, z:o.z, y:o.y, h:o.h, car:o.car || null, duel:o.duel || null}, t);
    s.crowd = b.crowd || 0;
    const meta = {n:o.name, m:o.mode === 'walk' ? 'w' : 'n'};
    if (o.car) meta.k = o.car;
    if (o.color && o.color !== '#f1c84b') meta.c = o.color;
    for (const k of ['fx', 'ride', 'rs', 'duel', 'ds', 'dnd']) if (o[k] != null) meta[k] = o[k];
    const cell = PR.cellKeep(b.cell, o.x, o.z), path = c => 'pres/' + c + '/' + b.uid;
    if (cell !== b.cell || !b.meta){
      const up = {}; up[path(cell)] = Object.assign({p:PR.encP(s), t:TS}, meta);
      if (b.cell && b.cell !== cell){ up[path(b.cell)] = null; Mk.disc.delete(path(b.cell)); }
      Mk.update('', up); Mk.disc.set(path(cell), 1);
      b.cell = cell; b.meta = meta; b.snd.sent(s, t, true, true); return;
    }
    let diff = null;
    for (const k in meta) if (meta[k] !== b.meta[k]) (diff = diff || {})[k] = meta[k];
    for (const k in b.meta) if (!(k in meta)) (diff = diff || {})[k] = null;
    const why = b.snd.decide(s, t, !!diff); if (!why) return;
    const up = diff || {};
    if (why !== 'beat') up.p = PR.encP(s);
    if (why === 'beat' || b.snd.needT(t)) up.t = TS;
    b.snd.sent(s, t, 'p' in up, 't' in up); b.meta = meta;
    Mk.update(path(cell), up);
  }
  /* 下线（切到菜单、黑洞）：从格子里删掉，/on 留着 */
  function leave(b){
    const Mk = window.__mock;
    if (b.cell){ Mk.put('pres/' + b.cell + '/' + b.uid, null); Mk.disc.delete('pres/' + b.cell + '/' + b.uid); }
    b.cell = null; b.meta = null; if (b.snd) b.snd.reset();
  }
  window.XCrowdModel = {SPOTS, rng, make, step, oldSender, wrap, write, leave};
})();
