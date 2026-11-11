/* 仅供本地测试：两个本地假玩家，走 test/firebase-shared.js 的假数据库，和真玩家走同一套 presence 和 /social 消息。
 *   陪练小明（走路）：会回你招呼、接受挑战（三种都会玩）、时不时冒个表情或喊一句
 *   司机阿华（开车）：停在旁边，你走过去选「搭车」他就接你，然后绕圈兜风；也接受挑战
 * 控制台：
 *   XBots.challenge('race' | 'stunt' | 'tag')   小明向你发起挑战（看收到邀请卡的样子）
 *   XBots.askRide()                              你开车时，小明走过来问能不能搭你的车（看司机那边）
 *   XBots.hi() / XBots.say(i) / XBots.emote(i)   小明打招呼、喊第 i 句、做第 i 个表情
 *   XBots.come()                                 两个假玩家挪到你旁边
 */
'use strict';
(() => {
  const TS = {'.sv':'timestamp'};
  const M = () => window.__mock;
  const me = () => XNet.uid;
  const myP = () => (typeof driving !== 'undefined' && driving ? driving : nw);
  const bots = {};
  function mk(id, name, color, car){ return bots[id] = {uid:'bot-' + id, name, color, car, x:0, z:0, y:0, h:0, v:0, fxSeq:Math.floor(Math.random() * 999), fx:'', fxAt:0,
    ride:null, rs:0, duel:null, pax:new Map(), next:6 + Math.random() * 4, wander:Math.random() * 6}; }
  const A = mk('a', '陪练小明', '#4fd1c5', null), B = mk('b', '司机阿华', '#d62828', 'sedan');
  function come(){
    const p = myP();
    A.x = p.x + 5; A.z = p.z - 3; A.h = Math.PI;
    B.x = p.x - 7; B.z = p.z + 5; B.h = 0; B.home = [B.x, B.z]; A.home = [A.x, A.z];
  }
  const send = (b, to, type, data) => M().ref('social/' + to).push({from:b.uid, type, ts:TS, data:JSON.stringify(data || {})});
  const fx = (b, kind, i) => { b.fxSeq = (b.fxSeq + 1) % 10000; b.fx = kind + i + '-' + b.fxSeq; b.fxAt = Date.now(); };
  /* 和真玩家一样走新协议（js/net.js 的 XNet.proto，写入见 test/crowd-model.js）：/pres/{格}/{uid}，航位推算决定发不发；?oldrules 时写旧的 /presence */
  function pres(b){
    const o = {name:b.name, mode:'naiwa', x:+b.x.toFixed(2), z:+b.z.toFixed(2), y:+(b.y || 0).toFixed(2), h:+Math.atan2(Math.sin(b.h), Math.cos(b.h)).toFixed(3), color:b.color, t:TS};
    if (b.car && !b.ride) o.car = b.car;
    if (b.fx && Date.now() - b.fxAt < 8000) o.fx = b.fx;
    if (b.ride){ o.ride = b.ride; o.rs = b.rs; }
    if (b.duel && b.duel.run){ o.duel = b.duel.opp; if (b.duel.g === 'stunt') o.ds = Math.round(b.duel.ds); }
    if (!XNet.netInfo || !XNet.netInfo().gridOK){ M().put('presence/' + b.uid, o); M().disc.set('presence/' + b.uid, 1); return; }
    XCrowdModel.write(b, o);
  }
  /* ---- messages ---- */
  function inbox(b){
    M().ref('social/' + b.uid).on('child_added', s => {
      const m = s.val(); M().put('social/' + b.uid + '/' + s.key, null);
      if (!m || m.from !== me()) return;
      let d = {}; try { d = JSON.parse(m.data || '{}'); } catch(e){}
      setTimeout(() => onMsg(b, m.type, d), 0);
    });
  }
  function onMsg(b, type, d){
    if (type === 'hi') setTimeout(() => fx(b, 'e', 0), 700);
    if (type === 'inv' && d.k === 'ride'){
      setTimeout(() => {
        if (!b.car || b.pax.size >= 2 || b.duel) return send(b, me(), 'ans', {k:'ride', ok:0, why:b.car ? (b.duel ? 'duel' : 'full') : 'driving'});
        const seat = b.pax.size + 1; b.pax.set(me(), {seat, t:Date.now()}); send(b, me(), 'ans', {k:'ride', ok:1, seat});
        setTimeout(() => fx(b, 's', 0), 900);
      }, 1100);
    }
    if (type === 'inv' && d.k === 'duel'){
      setTimeout(() => { if (b.duel || b.ride) return send(b, me(), 'ans', {k:'duel', ok:0, why:'busy'}); b.duel = {g:d.g, opp:me(), wait:Date.now()}; send(b, me(), 'ans', {k:'duel', ok:1}); fx(b, 's', 2); }, 1300);
    }
    if (type === 'ans' && d.k === 'duel' && b.pending === 'duel'){
      b.pending = null; if (!d.ok) return;
      const p = myP(), mx = (p.x + b.x) / 2, mz = (p.z + b.z) / 2, g = b.wantG;
      const go = {g, id:Math.random().toString(36).slice(2, 8), at:Date.now() + 4200};
      if (g === 'race'){ const pool = DESTS.filter(t => !t.far && Math.hypot(t.x - mx, t.z - mz) > 220 && Math.hypot(t.x - mx, t.z - mz) < 480); const t = pool[(Math.random() * pool.length) | 0] || {name:'田径场', x:FIELD.x, z:FIELD.z}; Object.assign(go, {tx:t.x, tz:t.z, tn:t.name}); }
      if (g === 'tag'){ go.it = b.uid; go.cx = mx; go.cz = mz; }
      send(b, me(), 'go', go); startDuel(b, go);
    }
    if (type === 'ans' && d.k === 'ride' && b.pending === 'ride'){
      b.pending = null; if (!d.ok) return;
      b.ride = me(); b.rs = d.seat || 1;
    }
    if (type === 'go' && b.duel && !b.duel.run) startDuel(b, d);
    if (type === 'tag' && b.duel && +d.n === b.duel.tagN + 1){ b.duel.tagN = +d.n; b.duel.it = b.uid; b.duel.frozen = Date.now() + 1500; }
    if (type === 'end' && b.duel){ if (d.cancel || d.quit) b.duel = null; else if (b.duel.g === 'race') b.duel.done = true; }
    if (type === 'bye'){ b.pax.delete(me()); if (b.ride === me()){ b.ride = null; const p = myP(); b.x = p.x + 4; b.z = p.z + 4; } }
  }
  function startDuel(b, go){
    b.duel = Object.assign({opp:me(), run:true, ds:0, tagN:0, lastTag:0, frozen:0}, go);
    if ((go.g === 'race' || go.g === 'stunt') && !b.car) b.car = 'myvi', b.tmpCar = true;
    if (go.g === 'tag' && b.car){ b.carWas = b.car; b.car = null; }
    b.v = 0;
  }
  function endDuel(b){ const D = b.duel; b.duel = null; if (b.tmpCar){ b.car = null; b.tmpCar = false; } if (b.carWas){ b.car = b.carWas; b.carWas = null; } if (D && D.g === 'race' && b.home){ b.x = b.home[0]; b.z = b.home[1]; } }
  /* ---- moving ---- */
  function moveTo(b, tx, tz, v, dt){ const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz); if (d < .01) return 0; const s = Math.min(d, v * dt); b.x += dx / d * s; b.z += dz / d * s; b.h = Math.atan2(dx, dz); return d; }
  function tick(dt){
    if (!window.XNet || !XNet.online || !me()) return;
    const now = Date.now(), p = myP();
    for (const b of [A, B]){
      if (b.x === 0 && b.z === 0) come();
      const D = b.duel;
      if (D && D.run && now >= D.at){
        if (D.g === 'race'){
          b.v = Math.min(15, b.v + 6 * dt);
          if (!D.done && moveTo(b, D.tx, D.tz, b.v, dt) < 7){ D.done = true; send(b, me(), 'end', {id:D.id, t:now - D.at}); fx(b, 's', 4); }
          if (now > D.at + 160000 || (D.done && now > D.at + 3000 && b.v > 0 && Math.hypot(D.tx - b.x, D.tz - b.z) < 8 && !b.waitEnd)){ b.waitEnd = now; }
          if (b.waitEnd && now - b.waitEnd > 6000){ b.waitEnd = 0; endDuel(b); }
        } else if (D.g === 'stunt'){
          const R = 18, a = (now - D.at) / 1000 * .9; b.x = (b.home ? b.home[0] : b.x) + Math.cos(a) * R; b.z = (b.home ? b.home[1] : b.z) + Math.sin(a) * R; b.h = -a;
          D.ds += (40 + Math.random() * 70) * dt;
          if (now > D.at + 60000 && !D.sent){ D.sent = true; send(b, me(), 'end', {id:D.id, s:Math.round(D.ds)}); setTimeout(() => endDuel(b), 3000); }
        } else if (D.g === 'tag'){
          const it = D.it === b.uid, dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
          if (now > D.frozen){
            if (it){ moveTo(b, p.x, p.z, 9.5, dt); if (d < 2 && now - D.lastTag > 2000){ D.tagN++; D.lastTag = now; D.it = me(); send(b, me(), 'tag', {id:D.id, n:D.tagN}); fx(b, 'e', 1); } }
            else if (d < 25){ const fx2 = b.x - dx / (d || 1) * 10, fz2 = b.z - dz / (d || 1) * 10, c = Math.hypot(fx2 - D.cx, fz2 - D.cz) > 45; moveTo(b, c ? D.cx : fx2, c ? D.cz : fz2, 8.5, dt); }
          }
          if (now > D.at + 45000 && !D.sent){ D.sent = true; send(b, me(), 'end', {id:D.id, n:D.tagN, it:D.it === b.uid ? 1 : 0}); setTimeout(() => endDuel(b), 3000); }
        }
      } else if (D && !D.run && now - D.wait > 10000) b.duel = null;
      else if (b.ride){
        const c = driving; if (!c){ b.ride = null; continue; }
        const s = XSocial.seats[c.kind] || XSocial.seats.sedan, st = s[Math.min(s.length, b.rs) - 1];
        const cs = Math.cos(c.h), sn = Math.sin(c.h); b.x = c.x + cs * st[0] + sn * st[2]; b.z = c.z - sn * st[0] + cs * st[2]; b.y = c.y + st[1]; b.h = c.h;
      } else if (b.car){
        const riding = XSocial.riding === b.uid;
        if (riding){ b.v = Math.min(10, b.v + 3 * dt); const a = Math.atan2(b.z - b.home[1], b.x - b.home[0]) + b.v * dt / 30; moveTo(b, b.home[0] + Math.cos(a) * 30, b.home[1] + Math.sin(a) * 30, b.v * 1.2, dt); }
        else { b.v = 0; if (b.pax.size && ![...b.pax.values()].some(x => now - x.t < 8000)) b.pax.clear(); }
      } else {
        b.wander += dt * .5; const R = 2.5; moveTo(b, b.home[0] + Math.cos(b.wander) * R, b.home[1] + Math.sin(b.wander) * R, 1.6, dt);
      }
      if (!b.duel){ b.next -= dt; if (b.next < 0){ b.next = 9 + Math.random() * 7; if (b === A) Math.random() < .5 ? fx(b, 's', (Math.random() * 20) | 0) : fx(b, 'e', (Math.random() * 8) | 0); } }
      if (!b.ride) b.y = groundAt(b.x, b.z);
      pres(b);
    }
  }
  let last = performance.now();
  setInterval(() => { const t = performance.now(), dt = Math.min(.25, (t - last) / 1000); last = t; try { tick(dt); } catch(e){ console.error('[BOTS]', e); } }, 50);
  XNet.ready.then(() => { inbox(A); inbox(B); });
  window.XBots = {
    A, B, come,
    challenge(g){ A.pending = 'duel'; A.wantG = g || 'race'; send(A, me(), 'inv', {k:'duel', g:A.wantG}); },
    askRide(){ const c = driving; if (!c) return '先上车'; A.x = c.x + 4; A.z = c.z + 3; A.pending = 'ride'; send(A, me(), 'inv', {k:'ride'}); },
    hi(){ send(A, me(), 'hi', {}); fx(A, 'e', 0); },
    say(i){ fx(A, 's', i | 0); }, emote(i){ fx(A, 'e', i | 0); }
  };
})();
