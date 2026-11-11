/* 小游戏 · KIP 超市大乱斗
 * 奶娃推着购物车，和两三个 AI 顾客在超市里抢货。每人手上一张三样东西的清单（自己要的东西头顶有箭头）：
 *   开过去就装进车里，推到收银台一件一件扫码才算分（每件 1 分），清单三样都结了账再加 5 分，然后换一张新清单。
 * 对抗：按「冲撞」往前猛冲一段，撞到谁，谁车里掉两件出来（掉一件撞的人加 1 分），谁都能捡。对手也会撞你：先停下来蓄力，地上亮一条红线，
 *   红线变实之后方向就定了，躲开的话他会一头撞上货架晕一会儿。车里东西越多推得越慢。
 * 变化：每局随机一样「今日特价」（每件 2 分）；三次「限时闪购」（某个货架旁出现金色礼盒，值 4 分，所有人都会去抢）；最后 15 秒结账双倍；
 *   后两个场次有扒手混进来，谁车里东西多偷谁，冲撞他能把东西抢回来还加 3 分。
 * 场次：新手场 → 周末场 → 大促场 → 双十一，赢一局升一场，对手更快更爱撞人，得分倍率也更高（×1 / ×1.3 / ×1.6 / ×2）。
 * 入口：KIP 商场门口的粉圈（js/89-outskirts-play.js，用 XMini.startAt 直接进），B1 游戏厅里也有一台。
 * 摇杆 + 一个按钮。示范：自己写的带惯性的移动（不用 ctx.player.walk）、格子寻路的 AI、按横竖屏换镜头方向、ctx.ui 里的清单和排名。
 */
'use strict';
XMini.register((() => {
  const HX = 13.5, HZ = 10.5, GW = 27, GD = 21, TIME = 90, CAP = 5, R = .5, SC = 1.35;
  const VP = 7.4, DASH_V = 17, DASH_T = .3, DASH_CD = 1.6, BOT_DV = 15.5, BOT_DT = .4, WIND = .7, SCAN = .26, N_IT = 28, GOLD = 6, LIST_PTS = 5, N_FIG = 4;
  const KINDS = [
    {e:'🥬', n:'蔬菜', c:'#58b368', x:-8, z:-3}, {e:'🍪', n:'零食', c:'#f0a13a', x:0, z:-3}, {e:'🧃', n:'饮料', c:'#4aa3ff', x:8, z:-3},
    {e:'🍎', n:'水果', c:'#e2574c', x:-8, z:3}, {e:'🥛', n:'牛奶', c:'#7fd0e6', x:0, z:3}, {e:'🧻', n:'纸巾', c:'#b48be0', x:8, z:3},
    {e:'🎁', n:'闪购礼盒', c:'#ffd24a'}];
  const TIERS = [
    {n:'新手场', mult:1, v:4.3, browse:2.1, ag:.1, lock:.36, hate:0, bots:[0, 2], thief:[]},
    {n:'周末场', mult:1.3, v:5.4, browse:.9, ag:.17, lock:.28, hate:.3, bots:[0, 1, 2], thief:[]},
    {n:'大促场', mult:1.6, v:6.2, browse:.4, ag:.28, lock:.21, hate:.5, bots:[0, 1, 2], thief:[38]},
    {n:'双十一', mult:2, v:7.1, browse:0, ag:.42, lock:.14, hate:1, bots:[0, 1, 2], thief:[26, 60]}];
  const BOTS = [{n:'佛系学长', c:'#55d08a', bank:2, ag:.5, dv:-.3}, {n:'砍价阿姨', c:'#e2574c', bank:4, ag:1.5, dv:0}, {n:'代购小哥', c:'#4aa3ff', bank:3, ag:1, dv:.35}];
  const ME_C = '#ff5fa2', FLASH = [18, 42, 64], ZONE = {x0:-4.6, x1:4.6, z0:-9.5, z1:-6.5}, DOOR = [0, 9.7];
  const SOLID = KINDS.slice(0, 6).map(k => [k.x - 2.5, k.x + 2.5, k.z - .5, k.z + .5]).concat([[-4.5, 4.5, -HZ, -9.5]]);
  const SPOTS = KINDS.slice(0, 6).map(k => [-1.8, 0, 1.8].flatMap(dx => [[k.x + dx, k.z - 1.2], [k.x + dx, k.z + 1.2]]));
  const SLOT = [[-.17, .62, -.18], [.17, .62, -.18], [-.17, .62, .26], [.17, .62, .26], [0, .9, .04]];
  const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif', EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mZ = new THREE.Matrix4().makeScale(0, 0, 0), col = new THREE.Color(), _wp = {x:0, z:0};
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  let S = null, lastRank = 4;

  /* ---------- the floor plan: a 1 m grid for the AI, rectangles for collisions ---------- */
  const BLK = new Uint8Array(GW * GD), Q = new Int16Array(GW * GD);
  for (let iz = 0; iz < GD; iz++) for (let ix = 0; ix < GW; ix++){ const x = ix - HX + .5, z = iz - HZ + .5; if (SOLID.some(s => x > s[0] && x < s[1] && z > s[2] - .1 && z < s[3] + .1)) BLK[iz * GW + ix] = 1; }
  const cell = (x, z) => { const ix = Math.floor(x + HX), iz = Math.floor(z + HZ); return ix < 0 || iz < 0 || ix >= GW || iz >= GD ? -1 : iz * GW + ix; };
  function hit(x, z, r){
    if (x < -HX + r || x > HX - r || z < -HZ + r || z > HZ - r) return true;
    for (const s of SOLID) if (x > s[0] - r && x < s[1] + r && z > s[2] - r && z < s[3] + r) return true;
    return false;
  }
  function los(ax, az, bx, bz){
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .6);
    for (let i = 1; i < n; i++) if (hit(ax + (bx - ax) * i / n, az + (bz - az) * i / n, R - .02)) return false;
    return true;
  }
  /* steps to (tx, tz) from every free cell */
  function flood(f, tx, tz){
    f.fill(9999); let c = cell(tx, tz); if (c < 0) return;
    if (BLK[c]) for (const d of [GW, -GW, 1, -1]) if (c + d >= 0 && c + d < BLK.length && !BLK[c + d]){ c += d; break; }
    let h = 0, n = 0; Q[n++] = c; f[c] = 0;
    while (h < n){
      const p = Q[h++], d = f[p] + 1, px = p % GW;
      if (px > 0 && !BLK[p - 1] && f[p - 1] > d){ f[p - 1] = d; Q[n++] = p - 1; }
      if (px < GW - 1 && !BLK[p + 1] && f[p + 1] > d){ f[p + 1] = d; Q[n++] = p + 1; }
      if (p >= GW && !BLK[p - GW] && f[p - GW] > d){ f[p - GW] = d; Q[n++] = p - GW; }
      if (p < GW * (GD - 1) && !BLK[p + GW] && f[p + GW] > d){ f[p + GW] = d; Q[n++] = p + GW; }
    }
  }
  /* where to head right now: straight at the target when nothing is in the way, otherwise the neighbouring cell that is closer to it */
  function steer(o, T){
    if (los(o.x, o.z, T.x, T.z)) return T;
    const c = cell(o.x, o.z); if (c < 0) return T;
    const cx = c % GW, cz = (c / GW) | 0; let best = c, bd = o.field[c];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){
      const nx = cx + dx, nz = cz + dz; if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= GW || nz >= GD) continue;
      const q = nz * GW + nx; if (BLK[q] || (dx && dz && (BLK[cz * GW + nx] || BLK[nz * GW + cx]))) continue;
      const d = o.field[q] + (dx && dz ? .4 : 0); if (d < bd){ bd = d; best = q; }
    }
    _wp.x = best % GW - HX + .5; _wp.z = ((best / GW) | 0) - HZ + .5; return _wp;
  }
  const inZone = s => s.x > ZONE.x0 && s.x < ZONE.x1 && s.z > ZONE.z0 && s.z < ZONE.z1;
  /* move by the velocity, sliding along whatever is in the way; true = ran into something at speed */
  function slide(s, dt){
    let nx = s.x + s.vx * dt, nz = s.z + s.vz * dt, bump = false;
    if (hit(nx, s.z, R)){ nx = s.x; if (Math.abs(s.vx) > 8) bump = true; s.vx = 0; }
    if (hit(nx, nz, R)){ nz = s.z; if (Math.abs(s.vz) > 8) bump = true; s.vz = 0; }
    s.x = nx; s.z = nz; return bump;
  }

  /* ---------- lists, carts, items ---------- */
  function relist(s){ for (let i = 0; i < 3; i++) if (s.got[i] < 2) s.got[i] = s.cart.includes(s.list[i]) ? 1 : 0; s.dirty = true; if (s.me) S.uiDirty = true; }
  function newList(s){
    const a = [0, 1, 2, 3, 4, 5]; for (let i = 5; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    s.list = a.slice(0, 3); s.got = [0, 0, 0]; relist(s);
  }
  const alloc = () => S.items.find(o => !o.on);
  function showItem(it){ it.sp.material = S.mats[it.kind]; it.sp.scale.setScalar(it.kind === GOLD ? 1.9 : 1.3); it.sp.visible = true; S.ringDirty = true; }
  function hideItem(it){ it.on = false; it.sp.visible = false; S.ringDirty = true; }
  /* a fresh one beside its shelf, away from other items and from carts */
  function restock(kind){
    const it = alloc(); if (!it) return;
    const sp = SPOTS[kind]; let best = sp[0], bs = -1;
    for (const p of sp){
      let d = 9; for (const o of S.items) if (o.on) d = Math.min(d, Math.hypot(o.x - p[0], o.z - p[1]));
      for (const s of S.sh) d = Math.min(d, Math.hypot(s.x - p[0], s.z - p[1]) * .6);
      d += Math.random() * 1.5; if (d > bs){ bs = d; best = p; }
    }
    Object.assign(it, {on:true, kind, x:best[0], z:best[1], y:0, vx:0, vy:0, vz:0, free:.3, life:1e9, spilled:false, ph:Math.random() * 6}); showItem(it);
  }
  function drop(kind, x, z, dx, dz){
    const it = alloc(); if (!it) return;
    const a = Math.atan2(dx, dz) + (Math.random() - .5) * 2, v = 3 + Math.random() * 3.5;
    Object.assign(it, {on:true, kind, x, z, y:.9, vx:Math.sin(a) * v, vz:Math.cos(a) * v, vy:4.5 + Math.random() * 2, free:.5, life:10, spilled:true, ph:Math.random() * 6}); showItem(it);
  }
  function spill(s, n, dx, dz){ n = Math.min(n, s.cart.length); for (let i = 0; i < n; i++) drop(s.cart.pop(), s.x, s.z, dx, dz); relist(s); return n; }
  function burst(ctx, x, z, color, n){
    n = ctx.q > 0 ? n : Math.ceil(n / 3);
    for (let i = 0; i < n; i++) ctx.part('dust', x + (Math.random() - .5), .9 + Math.random() * .6, z + (Math.random() - .5), .45, {vx:(Math.random() - .5) * 8, vy:2.5 + Math.random() * 4, vz:(Math.random() - .5) * 8, g:14, life:.7, op:.95, color});
  }

  /* ---------- ramming ---------- */
  function ram(a, b, ctx){
    const head = b.dash > 0 && a.dx * b.dx + a.dz * b.dz < -.3, n = spill(b, 2, a.dx, a.dz);
    Object.assign(b, {stun:1, inv:2.4, vx:a.dx * 9, vz:a.dz * 9, dash:0, wind:0, lock:false, banking:false});
    a.dash = 0; a.vx *= .15; a.vz *= .15; a.rams++; a.pts += n; S.hits++; S.uiDirty = true;
    if (head){ spill(a, 1, b.dx, b.dz); a.stun = .7; a.inv = 1.6; }
    const mine = a.me || b.me;
    ctx.camera.shake(mine ? .9 : .2); if (mine){ ctx.sfx.thud(.8); ctx.noise(.22, .28, 1700, 'bandpass'); } else ctx.noise(.12, .08, 1400, 'bandpass');
    burst(ctx, b.x, b.z, '#ffffff', 8); if (n) burst(ctx, b.x, b.z, '#ffd24a', 6);
    if (a.me){
      ctx.tone('square', 520, 1040, .16, .1);
      ctx.hud.callout(head ? '对撞！' : n ? `撞翻 +${n}` : '撞到了', n ? `${b.name}掉了 ${n} 件，快捡` : `${b.name}车里是空的`, ME_C);
    } else if (b.me){
      ctx.tone('sawtooth', 300, 110, .35, .12); ctx.player.act('jump');
      ctx.hud.callout('被撞了！', n ? `掉了 ${n} 件，抢回来` : '还好车里没东西', '#ff6f61');
    }
  }
  function wallBang(s, ctx){
    s.dash = 0; s.stun = s.me ? .45 : 1.2; s.vx = -s.dx * 3; s.vz = -s.dz * 3; s.lock = false;
    const near = s.me || s.aim === S.sh[0];
    ctx.noise(.18, near ? .25 : .08, 500, 'lowpass'); if (near){ ctx.sfx.thud(.6); ctx.camera.shake(s.me ? .5 : .3); }
    burst(ctx, s.x + s.dx * .8, s.z + s.dz * .8, '#d9d2c2', 6);
    if (!s.me && s.aim === S.sh[0]) ctx.hud.callout('躲开了！', `${s.name}撞上货架晕了，趁现在撞他`, '#55d08a');
  }

  /* ---------- AI shoppers ---------- */
  function think(s, ctx){
    const n = s.cart.length, left = TIME - S.t, me = S.sh[0];
    if (s.cd <= 0 && S.t > 5 && Math.random() < s.ag){
      let v = null, bv = 1.9;
      for (const o of S.sh){
        if (o === s || o.inv > 0 || o.stun > 0) continue;
        const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < 2.4 || d > 6.2) continue;
        const val = o.cart.length + (o.cart.length && inZone(o) ? 1 : 0) + (o.me ? S.tier.hate : 0);
        if (val > bv && los(s.x, s.z, o.x, o.z)){ bv = val; v = o; }
      }
      if (v){
        s.wind = WIND; s.lock = false; s.aim = v;
        if (v === me){ ctx.tone('square', 440, 440, .09, .1); ctx.tone('square', 440, 440, .09, .1, .16); S.warn = WIND + .5; }
        return;
      }
    }
    if (!n) s.banking = false;
    let need = 0; for (let i = 0; i < 3; i++) if (s.got[i] === 0) need++;
    if (n >= CAP || (n > 0 && (n >= s.bank || !need || left < 12))) s.banking = true;
    let best = null, bs = 1e9;
    if (n < CAP) for (const it of S.items){
      if (!it.on || it.y > .4) continue;
      const d = Math.abs(it.x - s.x) + Math.abs(it.z - s.z), want = it.kind === GOLD || s.got[s.list.indexOf(it.kind)] === 0;
      if ((!want && d > (it.kind === S.hot ? 8 : 4.5)) || (s.banking && d > 3.5)) continue;
      const sc = d - (it.kind === GOLD ? 16 : want ? 8 : 0) + (it.ph * 7 + s.i * 3) % 3;   /* a steady per-shopper bias, so they do not all pick the same one */
      if (sc < bs){ bs = sc; best = it; }
    }
    const T = s.tgt; T.it = best;
    if (best){ T.x = best.x; T.z = best.z; }
    else if (s.banking){ T.x = s.bx; T.z = -7.9; }
    else { const i = s.got.indexOf(0), k = KINDS[s.list[i < 0 ? 0 : i]]; T.x = k.x + (s.i - 2) * 1.2; T.z = k.z + (s.i % 2 ? 1.7 : -1.7); }   /* waiting for the shelf to be restocked */
    flood(s.field, T.x, T.z);
  }
  function bot(s, dt, ctx){
    if (s.stun > 0 || s.dash > 0) return;
    if (s.wind > 0){
      s.wind -= dt; const k = Math.exp(-dt * 8), v = s.aim; s.vx *= k; s.vz *= k;
      if (!s.lock){
        const dx = v.x + v.vx * .12 - s.x, dz = v.z + v.vz * .12 - s.z, l = Math.hypot(dx, dz) || 1; s.dx = dx / l; s.dz = dz / l; s.h = Math.atan2(dx, dz);
        if (s.wind <= S.tier.lock){ s.lock = true; if (v.me) ctx.tone('square', 880, 880, .08, .1); }
      }
      if (s.wind <= 0){ s.dash = BOT_DT; s.cd = 3.5 + Math.random() * 2.5; s.think = 0; ctx.noise(.14, v.me ? .12 : .04, 900, 'highpass'); }
      return;
    }
    if (s.browse > 0){ s.browse -= dt; const k = Math.exp(-dt * 8); s.vx *= k; s.vz *= k; return; }   /* looking at the shelf: this is how fast a league shops */
    s.think -= dt;
    if (s.think <= 0 || (s.tgt.it && !s.tgt.it.on)){ s.think = .3 + Math.random() * .15; think(s, ctx); if (s.wind > 0) return; }
    const wp = steer(s, s.tgt), dx = wp.x - s.x, dz = wp.z - s.z, l = Math.hypot(dx, dz), go = l > .25;
    const vmax = s.v * (1 - .03 * s.cart.length), k = Math.min(1, dt * 8);
    s.vx += ((go ? dx / l * vmax : 0) - s.vx) * k; s.vz += ((go ? dz / l * vmax : 0) - s.vz) * k;
    s.stuckT += dt;
    if (s.stuckT > .8){
      if (go && Math.hypot(s.x - s.lx, s.z - s.lz) < .35){ const a = Math.random() * 6.3; s.vx += Math.sin(a) * 5; s.vz += Math.cos(a) * 5; s.think = 0; }
      s.lx = s.x; s.lz = s.z; s.stuckT = 0;
    }
  }
  /* everyone, the player included: stun, the dash and what it hits, then ordinary rolling */
  function step(s, dt, ctx){
    s.inv -= dt; s.cd -= dt;
    if (s.stun > 0){
      s.stun -= dt; s.spin += dt * 11; const k = Math.exp(-dt * 4); s.vx *= k; s.vz *= k; slide(s, dt);
      if (s.stun <= 0){ s.spin = 0; s.think = 0; }
      if (ctx.q > 0 && Math.random() < dt * 7) ctx.part('dust', s.x + (Math.random() - .5), 2.4, s.z + (Math.random() - .5), .3, {vy:.8, life:.5, op:1, color:'#ffd24a'});
      return;
    }
    if (s.dash > 0){
      s.dash -= dt; const v = s.me ? DASH_V : BOT_DV; s.vx = s.dx * v; s.vz = s.dz * v; s.h = Math.atan2(s.dx, s.dz); s.walk += dt * 26;
      if (slide(s, dt)){ wallBang(s, ctx); return; }
      const fx = s.x + s.dx * .7, fz = s.z + s.dz * .7;
      for (const o of S.sh) if (o !== s && o.inv <= 0 && (Math.hypot(o.x - fx, o.z - fz) < 1.3 || Math.hypot(o.x - s.x, o.z - s.z) < 1.3)){ ram(s, o, ctx); return; }
      const th = S.th; if (s.me && th.on && Math.hypot(th.x - fx, th.z - fz) < 1.5){ thiefCaught(ctx); s.dash = 0; s.vx *= .2; s.vz *= .2; return; }
      if (ctx.q > 0) ctx.part('dust', s.x - s.dx * .9, .3, s.z - s.dz * .9, .5, {life:.35, op:.55, color:'#ffffff', grow:1.6});
      if (s.dash <= 0){ s.vx *= .45; s.vz *= .45; }
      return;
    }
    slide(s, dt);
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > .6 && !(s.wind > 0)){ const dh = Math.atan2(s.vx, s.vz) - s.h; s.h += Math.atan2(Math.sin(dh), Math.cos(dh)) * Math.min(1, dt * 14); }
    s.walk += dt * sp * 1.7;
  }

  /* ---------- the pickpocket (later leagues): goes for the fullest cart, takes two things and makes for the door ---------- */
  function thiefSpawn(ctx){
    const th = S.th; Object.assign(th, {on:true, st:'hunt', x:DOOR[0], z:DOOR[1], h:Math.PI, vx:0, vz:0, bag:[], who:null, think:0, t:24, walk:0}); th.tgt.x = 0; th.tgt.z = 0; flood(th.field, 0, 0);
    ctx.tone('square', 660, 440, .2, .1); ctx.tone('square', 660, 440, .2, .1, .25);
    ctx.hud.callout('扒手混进来了！', '谁车里东西多他偷谁 · 冲撞他能抢回来 +3', '#b48be0');
  }
  function thiefCaught(ctx){
    const th = S.th, me = S.sh[0]; th.on = false;
    for (const k of th.bag) drop(k, th.x, th.z, Math.random() - .5, Math.random() - .5);
    me.pts += 3; S.uiDirty = true; S.thGot++;
    ctx.camera.shake(.8); ctx.sfx.thud(.8); burst(ctx, th.x, th.z, '#b48be0', 12);
    for (let i = 0; i < 4; i++) ctx.tone('triangle', 660 * Math.pow(1.19, i), 660 * Math.pow(1.19, i), .14, .12, i * .07);
    ctx.hud.callout('抓住扒手！+3', th.bag.length ? `他偷的 ${th.bag.length} 件掉出来了` : '见义勇为', '#55d08a');
  }
  function thief(dt, ctx){
    const th = S.th; if (!th.on) return;
    th.think -= dt; th.t -= dt;
    if (th.st === 'hunt'){
      if (th.think <= 0){
        th.think = .4; let v = null, bn = 0;
        for (const s of S.sh) if (s.cart.length > bn && s.inv <= 0){ bn = s.cart.length; v = s; }
        th.who = v; th.tgt.x = v ? v.x : 0; th.tgt.z = v ? v.z : 4; flood(th.field, th.tgt.x, th.tgt.z);
      }
      const v = th.who;
      if (v && Math.hypot(v.x - th.x, v.z - th.z) < 1.3 && v.cart.length && v.inv <= 0){
        for (let i = 0; i < 2 && v.cart.length; i++) th.bag.push(v.cart.pop());
        relist(v); v.inv = 1.2; th.st = 'flee'; th.tgt.x = DOOR[0]; th.tgt.z = DOOR[1]; flood(th.field, DOOR[0], DOOR[1]);
        if (v.me){ ctx.tone('sawtooth', 500, 200, .3, .12); ctx.camera.shake(.5); ctx.hud.callout('被扒了！', `少了 ${th.bag.length} 件，冲撞他抢回来`, '#ff6f61'); }
      } else if (th.t <= 0){ th.st = 'flee'; th.tgt.x = DOOR[0]; th.tgt.z = DOOR[1]; flood(th.field, DOOR[0], DOOR[1]); }
    } else if (Math.hypot(th.x - DOOR[0], th.z - DOOR[1]) < 1){
      th.on = false; if (th.bag.length){ ctx.sfx.fail(); ctx.hud.toast('扒手跑了', `带走了 ${th.bag.length} 件东西`, 1800); }
      return;
    }
    const wp = steer(th, th.tgt), dx = wp.x - th.x, dz = wp.z - th.z, l = Math.hypot(dx, dz) || 1, vm = th.st === 'flee' ? 6.6 : 6, k = Math.min(1, dt * 9);
    th.vx += (dx / l * vm - th.vx) * k; th.vz += (dz / l * vm - th.vz) * k; slide(th, dt);
    th.h = Math.atan2(th.vx, th.vz); th.walk += dt * 11;
  }

  /* ---------- building the shop ---------- */
  function build(ctx){
    const Rt = ctx.root, add = m => { Rt.add(m); return m; };
    const apron = add(new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#221d26'}))); apron.position.y = -.03;
    /* floor: pale tiles, each shelf's patch tinted in its colour, the checkout apron in green */
    const px = x => (x + HX) / GW * 512, pz = z => (z + HZ) / GD * 512;
    const floorT = tex(512, 512, g => {
      g.fillStyle = '#cfc7b6'; g.fillRect(0, 0, 512, 512);
      g.fillStyle = '#c3baa7'; for (let i = 0; i < GW; i++) for (let j = 0; j < GD; j++) if ((i + j) % 2) g.fillRect(px(i - HX), pz(j - HZ), 512 / GW, 512 / GD);
      for (const k of KINDS.slice(0, 6)){ g.globalAlpha = .42; g.fillStyle = k.c; rr(g, px(k.x - 3.4), pz(k.z - 2.1), px(k.x + 3.4) - px(k.x - 3.4), pz(k.z + 2.1) - pz(k.z - 2.1), 14); g.fill(); }
      g.globalAlpha = .5; g.fillStyle = '#4fd18b'; rr(g, px(ZONE.x0), pz(ZONE.z0), px(ZONE.x1) - px(ZONE.x0), pz(ZONE.z1) - pz(ZONE.z0), 10); g.fill();
      g.globalAlpha = 1; g.strokeStyle = '#2f9e5b'; g.lineWidth = 5; g.setLineDash([14, 9]); rr(g, px(ZONE.x0), pz(ZONE.z0), px(ZONE.x1) - px(ZONE.x0), pz(ZONE.z1) - pz(ZONE.z0), 10); g.stroke();
    });
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(GW, GD).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({map:floorT, roughness:.9}))); floor.receiveShadow = true;
    /* every box in the shop is one instanced mesh: walls (the two on the camera's side are low), gondolas with coloured goods, tills */
    const B = [], bx = (w, h, d, x, y, z, c) => B.push([w, h, d, x, y, z, c]);
    bx(GW + .8, 2.6, .4, 0, 1.3, -HZ - .2, '#f3ede2'); bx(.4, 2.6, GD, -HX - .2, 1.3, 0, '#f3ede2'); bx(.4, .9, GD, HX + .2, .45, 0, '#e4dccb');
    for (const s of [-1, 1]) bx(HX - 1.8, .9, .4, s * (HX / 2 + .9), .45, HZ + .2, '#e4dccb');
    bx(GW + .8, .14, .46, 0, 2.67, -HZ - .2, '#d22630'); bx(.46, .14, GD, -HX - .2, 2.67, 0, '#1d3f8f');
    KINDS.slice(0, 6).forEach((k, ki) => {
      bx(5, 1.2, 1, k.x, .6, k.z, '#efe9dc'); bx(5.1, .1, 1.1, k.x, 1.25, k.z, k.c);
      const c0 = new THREE.Color(k.c);
      for (let i = 0; i < 7; i++) for (const sz of [-1, 1]) for (const y of [.42, .9]){
        col.copy(c0).offsetHSL(((i * 7 + ki * 3 + (y > .5 ? 2 : 0)) % 5 - 2) * .025, 0, ((i + (sz > 0 ? 1 : 0)) % 3 - 1) * .08);
        bx(.52, .34, .1, k.x - 2.1 + i * .7, y, k.z + sz * .53, '#' + col.getHexString());
      }
    });
    for (const x of [-3, 0, 3]){ bx(2.3, .95, .8, x, .475, -HZ + .5, '#3f4654'); bx(1.5, .06, .5, x - .2, .98, -HZ + .5, '#15171c'); bx(.4, .42, .3, x + .85, 1.18, -HZ + .45, '#4fd18b'); }
    const boxes = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M('#ffffff', {roughness:.8}), B.length));
    B.forEach(([w, h, d, x, y, z, c], i) => { m4.makeScale(w, h, d); m4.setPosition(x, y, z); boxes.setMatrixAt(i, m4); boxes.setColorAt(i, col.set(c)); });
    boxes.castShadow = boxes.receiveShadow = true; boxes.frustumCulled = false;
    /* signs are sprites, so they read the same from either camera side */
    const sign = (w, h, sx, sy, x, y, z, draw) => { const s = add(new THREE.Sprite(new THREE.SpriteMaterial({map:tex(w, h, draw), transparent:true}))); s.scale.set(sx, sy, 1); s.position.set(x, y, z); return s; };
    KINDS.slice(0, 6).forEach((k, ki) => sign(160, 160, 2.1, 2.1, k.x, 2.8, k.z, g => {
      g.fillStyle = k.c; rr(g, 6, 6, 148, 148, 26); g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '84px ' + EMOJI; g.fillText(k.e, 80, 66); g.fillStyle = '#ffffff'; g.font = '900 34px ' + FONT; g.fillText(k.n, 80, 128);
      if (ki === S.hot){ g.fillStyle = '#d22630'; rr(g, 70, 2, 88, 46, 16); g.fill(); g.fillStyle = '#ffe9b0'; g.font = '900 28px ' + FONT; g.fillText('特价2分', 114, 27, 80); }
    }));
    sign(384, 112, 5.4, 1.58, 0, 3.5, -HZ + .3, g => {
      g.fillStyle = '#2f9e5b'; rr(g, 4, 4, 376, 104, 22); g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffff'; g.stroke();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 58px ' + FONT; g.fillText('收银台 结账', 192, 60);
    });
    S.zone = add(new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x1 - ZONE.x0, ZONE.z1 - ZONE.z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#2fbf6e', transparent:true, opacity:.3, depthWrite:false}))); S.zone.position.set(0, .04, (ZONE.z0 + ZONE.z1) / 2);
    /* items: one emoji sprite each, a ring on the floor under it, an arrow over the ones on the player's list */
    S.mats = KINDS.map(k => new THREE.SpriteMaterial({transparent:true, map:tex(96, 96, g => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '76px ' + EMOJI; g.fillText(k.e, 48, 52); })}));
    for (let i = 0; i < N_IT; i++){ const sp = add(new THREE.Sprite(S.mats[0])); sp.visible = false; S.items.push({on:false, sp, kind:0, x:0, z:0, y:0, vx:0, vy:0, vz:0, free:0, life:0, spilled:false, ph:0}); }
    S.rings = add(new THREE.InstancedMesh(new THREE.RingGeometry(.42, .62, 22).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.85, depthWrite:false}), N_IT));
    S.arrows = add(new THREE.InstancedMesh(new THREE.ConeGeometry(.3, .62, 6).rotateX(Math.PI), new THREE.MeshBasicMaterial({color:ME_C}), 10));
    S.beam = add(new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 9, 12, 1, true).translate(0, 4.5, 0), gxGlow('#ffd24a', .34))); S.beam.visible = false;
    for (let i = 0; i < N_IT; i++) S.rings.setColorAt(i, col.set('#ffffff'));   /* before count goes to 0: the colour buffer is sized by count on the first call */
    for (const im of [S.rings, S.arrows]){ im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    /* rival shoppers and the pickpocket: instanced bodies; every trolley and what is in it: instanced too */
    const has = typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined';
    const bodyGeo = has ? npcBodyGeo : new THREE.BoxGeometry(.4, .62, .26).translate(0, 1.17, 0), headGeo = has ? npcHeadGeo : new THREE.SphereGeometry(.15, 10, 8).translate(0, 1.62, 0);
    const legGeo = has ? npcLegGeo : new THREE.BoxGeometry(.13, .8, .15).translate(0, -.4, 0);
    S.body = new THREE.InstancedMesh(bodyGeo, M('#ffffff', {roughness:.8}), N_FIG); S.head = new THREE.InstancedMesh(headGeo, M('#e8b98f', {roughness:.7}), N_FIG);
    S.legL = new THREE.InstancedMesh(legGeo, M('#2a3350', {roughness:.8, vertexColors:has}), N_FIG); S.legR = new THREE.InstancedMesh(legGeo, S.legL.material, N_FIG);
    S.figs = [S.body, S.head, S.legL, S.legR];
    const tg = typeof carGeoCache !== 'undefined' && carGeoCache.trolley;
    const chrome = new THREE.InstancedMesh(tg ? tg.chrome : new THREE.BoxGeometry(.8, .6, 1.15).translate(0, .7, .1), M('#cfd6dc', {roughness:.35, metalness:.6}), 4);
    S.paint = new THREE.InstancedMesh(tg ? tg.paint : new THREE.BoxGeometry(.9, .06, .06).translate(0, 1.08, -.58), M('#ffffff', {roughness:.5}), 4);
    S.carts = [chrome, S.paint]; if (tg) S.carts.push(new THREE.InstancedMesh(tg.trim, M('#2b2d33', {roughness:.7}), 4));
    S.cargo = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M('#ffffff', {roughness:.6}), 4 * CAP);
    for (const im of [...S.figs, ...S.carts, S.cargo]){ im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); add(im); }
    for (let i = 0; i < 4 * CAP; i++){ S.cargo.setMatrixAt(i, mZ); S.cargo.setColorAt(i, col.set('#ffffff')); }
    for (let i = 0; i < N_FIG; i++) for (const im of S.figs) im.setMatrixAt(i, mZ);
    S.body.setColorAt(N_FIG - 1, col.set('#3b3b44'));
    /* each rival: a name tag with score and load, and the red strip that shows where the charge will go */
    const stripMat = new THREE.MeshBasicMaterial({color:'#ff3b30', transparent:true, opacity:.5, depthWrite:false}); S.stripMat = stripMat;
    S.sh.forEach((s, i) => {
      S.paint.setColorAt(i, col.set(s.c)); if (!i) return;
      S.body.setColorAt(i - 1, col.set(s.c));
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
      s.tag = add(new THREE.Sprite(new THREE.SpriteMaterial({map:t, transparent:true, depthTest:false}))); s.tag.scale.set(2.9, .725, 1); s.tagCv = cv; s.tagT = t;
      s.strip = add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 6.4).rotateX(-Math.PI / 2).translate(0, 0, 3.4), stripMat)); s.strip.visible = false; s.strip.position.y = .06;
    });
    S.thTag = sign(160, 64, 2.1, .84, 0, 3, 0, g => { g.fillStyle = '#3b3b44'; rr(g, 3, 3, 154, 58, 20); g.fill(); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 36px ' + FONT; g.fillText('扒手', 80, 34); });
    S.thTag.material.depthTest = false; S.thTag.visible = false;
    S.ready = add(new THREE.Mesh(new THREE.RingGeometry(.95, 1.2, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:ME_C, transparent:true, opacity:.7, depthWrite:false}))); S.ready.position.y = .05;
  }
  function tagDraw(s){
    const key = s.pts + '|' + s.cart.length + '|' + (s.wind > 0 ? 1 : s.stun > 0 ? 2 : 0); if (key === s.key) return; s.key = key;
    const g = s.tagCv.getContext('2d'); g.clearRect(0, 0, 256, 64);
    g.fillStyle = s.wind > 0 ? '#ff3b30' : s.c; rr(g, 3, 3, 250, 58, 22); g.fill(); g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 30px ' + FONT;
    g.fillText(s.wind > 0 ? '要撞人了！' : s.stun > 0 ? `${s.name.slice(-2)} 晕了` : `${s.name.slice(-2)} ${s.pts}分 · ${s.cart.length}件`, 128, 34, 236);
    s.tagT.needsUpdate = true;
  }
  function putFig(i, x, z, h, w, lean){
    const sw = Math.sin(w) * .5;
    mA.makeRotationY(h); mA.setPosition(x, 0, z); mB.makeScale(SC, SC, SC); mA.multiply(mB);
    if (lean){ mB.makeRotationX(lean); mA.multiply(mB); }
    S.body.setMatrixAt(i, mA); S.head.setMatrixAt(i, mA);
    mB.makeRotationX(sw); mB.setPosition(.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legL.setMatrixAt(i, m4);
    mB.makeRotationX(-sw); mB.setPosition(-.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legR.setMatrixAt(i, m4);
  }

  /* ---------- the list and the ranking, in ctx.ui ---------- */
  if (!document.getElementById('kmCss')){
    const st = document.createElement('style'); st.id = 'kmCss'; st.textContent = `
#kmBar{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--safe-t) + var(--edge) + 62px);display:flex;gap:6px 10px;align-items:center;justify-content:center;flex-wrap:wrap;width:max-content;max-width:calc(100% - 16px);pointer-events:none!important;font-size:13px}
.km-list,.km-rank{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--panel-solid);border:1px solid var(--line);color:var(--ink);white-space:nowrap}
.km-list>span{color:var(--muted);font-size:12px}
.km-list i{font-style:normal;font-size:19px;line-height:1;padding:3px 5px;border-radius:9px;border:2px solid var(--c);position:relative}
.km-list i.has{background:var(--c)}
.km-list i.ok{opacity:.5}
.km-list i.ok::after{content:'✓';position:absolute;right:-6px;top:-7px;width:15px;height:15px;border-radius:50%;background:#2f9e5b;color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center}
.km-list b{font-family:var(--display);color:var(--tile)}
.km-rank{gap:9px;font-variant-numeric:tabular-nums}
.km-rank span{display:flex;align-items:center;gap:3px}
.km-rank span::before{content:'';width:9px;height:9px;border-radius:50%;background:var(--c)}
.km-rank span.me{font-weight:700}
.km-res{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:4px;text-align:left;font-size:14px;font-variant-numeric:tabular-nums}
.km-res li{display:flex;gap:8px;align-items:center;padding:5px 10px;border-radius:8px;background:var(--card-bg);border-left:4px solid var(--c)}
.km-res li.me{font-weight:700;background:var(--tile-soft)}
.km-res li b{margin-left:auto;font-family:var(--display)}
@media (max-width:760px){ #kmBar{top:calc(var(--safe-t) + 116px);font-size:12.5px} .km-rank{gap:7px} }`;
    document.head.appendChild(st);
  }
  function uiDraw(){
    const me = S.sh[0];
    S.elList.innerHTML = '<span>清单</span>' + me.list.map((k, i) => `<i style="--c:${KINDS[k].c}" class="${me.got[i] === 2 ? 'ok' : me.got[i] ? 'has' : ''}">${KINDS[k].e}</i>`).join('') + `<b>+${LIST_PTS * (S.dbl ? 2 : 1)}</b><span>特价</span><i style="--c:${KINDS[S.hot].c}">${KINDS[S.hot].e}</i><b>2 分</b>`;
    S.elRank.innerHTML = S.sh.slice().sort((a, b) => b.pts - a.pts || a.i - b.i).map(s => `<span class="${s.me ? 'me' : ''}" style="--c:${s.c}">${s.me ? '你' : s.name.slice(-2)} ${s.pts}</span>`).join('');
  }

  /* ---------- one frame of drawing ---------- */
  function draw(ctx, dt){
    const me = S.sh[0], T = S.t, P = ctx.player, blink = v => v <= 0 || Math.floor(v * 12) % 2 === 0;
    const a0 = me.h + me.spin; P.x = me.x - Math.sin(a0) * .5; P.z = me.z - Math.cos(a0) * .5; P.h = a0; P.visible = blink(me.inv);
    const sp = Math.hypot(me.vx, me.vz); nw.spd = sp; if (sp > .5) nw.walkT += dt * (7 + sp * .7);   /* 奶娃's own walk cycle (what ctx.player.walk would have set) */
    S.sh.forEach((s, i) => {
      const a = s.h + s.spin, sx = Math.sin(a), cz = Math.cos(a), show = blink(s.inv);
      mA.makeRotationY(a); mA.setPosition(s.x + sx * .5, 0, s.z + cz * .5);
      if (s.stun > 0){ mB.makeRotationZ(Math.sin(T * 30) * .14); mA.multiply(mB); }
      mB.makeScale(1.2, 1.2, 1.2); mA.multiply(mB);
      for (const im of S.carts) im.setMatrixAt(i, show ? mA : mZ);
      for (let j = 0; j < CAP; j++){
        if (!show || j >= s.cart.length){ S.cargo.setMatrixAt(i * CAP + j, mZ); continue; }
        const q = SLOT[j]; mB.makeScale(.3, .3, .3); mB.setPosition(q[0], q[1], q[2]); m4.multiplyMatrices(mA, mB); S.cargo.setMatrixAt(i * CAP + j, m4);
      }
      if (s.dirty){ s.dirty = false; for (let j = 0; j < s.cart.length; j++) S.cargo.setColorAt(i * CAP + j, col.set(KINDS[s.cart[j]].c)); S.cargo.instanceColor.needsUpdate = true; }
      if (!i) return;
      if (show) putFig(i - 1, s.x - sx * .45, s.z - cz * .45, a, s.walk, s.wind > 0 ? -.2 : s.dash > 0 ? .3 : .08); else for (const im of S.figs) im.setMatrixAt(i - 1, mZ);
      s.tag.position.set(s.x, 3.25, s.z); tagDraw(s);
      s.strip.visible = s.wind > 0 || s.dash > 0;
      if (s.strip.visible){ s.strip.position.set(s.x, .06, s.z); s.strip.rotation.y = Math.atan2(s.dx, s.dz); }
    });
    let lock = false; for (const s of S.sh) if (s.lock || s.dash > 0) lock = true;
    S.stripMat.opacity = lock ? .85 : .3 + Math.abs(Math.sin(T * 16)) * .25;
    const th = S.th; S.thTag.visible = th.on;
    if (th.on){ putFig(N_FIG - 1, th.x, th.z, th.h, th.walk, .2); S.thTag.position.set(th.x, 3.1, th.z); } else for (const im of S.figs) im.setMatrixAt(N_FIG - 1, mZ);
    for (const im of [...S.figs, ...S.carts, S.cargo]) im.instanceMatrix.needsUpdate = true;
    /* items */
    let n = 0, na = 0, gold = null;
    for (const it of S.items){
      if (!it.on) continue;
      const mine = it.kind < 6 && me.got[me.list.indexOf(it.kind)] === 0, fade = it.life < 2.5 && Math.floor(it.life * 8) % 2 === 0;
      it.sp.visible = !fade; it.sp.position.set(it.x, 1 + it.y + Math.sin(T * 3 + it.ph) * .12, it.z);
      if (it.kind === GOLD && it.y < .1) gold = it;
      const s = it.kind === GOLD ? 1.5 + Math.sin(T * 8) * .15 : mine ? 1.2 + Math.sin(T * 6 + it.ph) * .1 : .8;
      m4.makeScale(s, 1, s); m4.setPosition(it.x, .11, it.z); S.rings.setMatrixAt(n, m4); S.rings.setColorAt(n, col.set(it.kind === GOLD ? '#ffd24a' : mine ? ME_C : KINDS[it.kind].c)); n++;
      if (mine && na < 10 && me.cart.length < CAP){ m4.makeTranslation(it.x, 2.2 + Math.abs(Math.sin(T * 5 + it.ph)) * .35, it.z); S.arrows.setMatrixAt(na++, m4); }
    }
    S.rings.count = n; S.arrows.count = na; S.rings.instanceMatrix.needsUpdate = S.arrows.instanceMatrix.needsUpdate = true; if (S.rings.instanceColor) S.rings.instanceColor.needsUpdate = true;
    S.beam.visible = !!gold; if (gold) S.beam.position.set(gold.x, 0, gold.z);
    const full = me.cart.length >= CAP || (me.cart.length > 0 && !me.got.includes(0));
    S.zone.material.opacity = me.cart.length ? (full ? .45 + Math.sin(T * 9) * .3 : .25 + Math.sin(T * 4) * .1) : .05;
    S.ready.position.set(me.x + Math.sin(a0) * .5, .05, me.z + Math.cos(a0) * .5); S.ready.material.opacity = me.cd <= 0 ? .6 + Math.sin(T * 7) * .2 : .12; S.ready.scale.setScalar(me.cd <= 0 ? 1 : .8);
    /* camera: looks from the south on a wide screen, from the east on a tall one (the shop is wider than it is deep) */
    const port = ctx.aspect < 1;
    if (port !== S.port){ S.port = port; S.yaw = port ? Math.PI / 2 : 0; ctx.camera.follow(S.camT, {dist:port ? 44 : 24, pitch:port ? 1.03 : 1.06, yaw:S.yaw, height:0, lerp:5, fov:55}); for (const s of S.sh) if (s.tag) s.tag.scale.set(port ? 4.4 : 2.9, port ? 1.1 : .725, 1); }
    if (port){ S.camT.x = me.x * .12 - .8; S.camT.z = me.z * .2 - .5; } else { S.camT.x = me.x * .15; S.camT.z = me.z * .12 - 2.5; }
  }
  function finish(ctx){
    const me = S.sh[0], order = S.sh.slice().sort((a, b) => b.pts - a.pts || a.i - b.i), rank = order.indexOf(me) + 1, tier = S.tier, score = Math.round(me.pts * tier.mult);
    lastRank = rank;
    let lv = S.lv, low = +ctx.store.get('low') || 0, note = '';
    if (rank === 1){ if (lv < TIERS.length - 1){ lv++; note = `赢了！下一局升到「${TIERS[lv].n}」，得分 ×${TIERS[lv].mult}`; } else { note = '「双十一」场第一名！'; ctx.unlock('mg_kipmart_win'); } low = 0; }
    else if (rank === order.length && lv > 0){ if (++low >= 2){ lv--; low = 0; note = `连着两局垫底，下一局回到「${TIERS[lv].n}」`; } else note = `再垫底一局就回到「${TIERS[lv - 1].n}」`; }
    else { low = 0; note = `拿到第一名就升到「${(TIERS[lv + 1] || tier).n}」`; }
    ctx.store.set('lv', lv); ctx.store.set('low', low);
    if (me.rams >= 6) ctx.unlock('mg_kipmart_ram');
    if (score >= 150) ctx.unlock('sale');
    const sub = document.createElement('div'), ol = document.createElement('ol'); ol.className = 'km-res';
    order.forEach((s, i) => { const li = document.createElement('li'); li.style.setProperty('--c', s.c); if (s.me) li.className = 'me'; li.textContent = `${i + 1}. ${s.me ? '你' : s.name}`; const b = document.createElement('b'); b.textContent = s.pts + ' 分'; li.append(b); ol.append(li); });
    const p1 = document.createElement('p'); p1.textContent = `「${tier.n}」${tier.mult > 1 ? ` ${me.pts} 分 × ${tier.mult}` : ''} · 清单 ${me.lists} 张 · 撞翻 ${me.rams} 次` + (S.thGot ? ` · 抓扒手 ${S.thGot} 次` : '') + (me.cart.length ? ` · 车里还有 ${me.cart.length} 件没结账` : '');
    const p2 = document.createElement('p'); p2.textContent = note; sub.append(ol, p1, p2);
    ctx.finish(score, {kicker:rank === 1 ? '第 1 名 · 赢了' : `第 ${rank} 名`, sub});
  }

  /* for the card at the mall door (js/89-outskirts-play.js): which league the next round is in; S and nav are there for test scripts */
  window.XKipMart = {
    tier(){ const st = typeof mgSave !== 'undefined' && mgSave.store.kipmart, lv = Math.max(0, Math.min(TIERS.length - 1, (st && +st.lv) || 0)); return Object.assign({lv}, TIERS[lv]); },
    get S(){ return S; }, nav:{flood, steer, hit, los, inZone, KINDS, GW, GD, CAP, GOLD, TIME}
  };

  return {
    id:'kipmart', name:'KIP 超市大乱斗', icon:'🛒', color:ME_C,
    parts:'kipmart',                 // 改装零件掉落表：js/42-tuning.js 的 TN_DROPS.kipmart，按奖牌发，结算面板显示（js/93-tuning-ui.js）
    desc:'推着购物车抢货、撞人、结账，和 AI 顾客比谁分高',
    intro:'抢清单上的三样东西（头顶有箭头），推到收银台结账才算分，凑齐一张清单再加 5 分。按「冲撞」撞别人，他车里的东西会掉出来，掉一件你加 1 分；别人蓄力时地上有红线，躲开他就撞货架。90 秒后分数最高的赢，赢了升到更难的场次。',
    controls:{move:true, a:'冲撞'},
    board:{fmt:v => Math.round(v) + ' 分', max:600},
    medals:[150, 90, 40],
    reward:s => [42, 30, 20, 12][lastRank - 1] + Math.min(15, s * .3),
    achievements:[['mg_kipmart_win', '超市霸主', 'KIP 超市大乱斗在「双十一」场拿到第一名', 80], ['mg_kipmart_ram', '碰碰车手', 'KIP 超市大乱斗一局里撞翻对手 6 次', 40]],
    sky:'#221d26', shadow:19,
    tiers:TIERS,
    start(ctx){
      const lv = Math.max(0, Math.min(TIERS.length - 1, +ctx.store.get('lv') || 0)), tier = TIERS[lv];
      const mk = (i, o) => Object.assign({i, me:false, x:0, z:0, h:Math.PI, vx:0, vz:0, cart:[], list:[0, 1, 2], got:[0, 0, 0], pts:0, stun:0, inv:0, cd:0, dash:0, dx:0, dz:-1, wind:0, lock:false, aim:null,
        tgt:{x:0, z:0, it:null}, think:Math.random() * .3, browse:0, banking:false, field:new Int16Array(GW * GD), walk:0, scan:0, spin:0, rams:0, lists:0, dirty:true, stuckT:0, lx:0, lz:0, key:'', bx:0}, o);
      S = {t:0, lv, tier, sh:[mk(0, {me:true, name:'你', c:ME_C, x:0, z:7.6})], items:[], resp:[], flashI:0, thI:0, dbl:false, hits:0, thGot:0, warn:0, hot:(Math.random() * 6) | 0, uiDirty:true, ringDirty:true, port:null, yaw:0, camT:{x:0, y:0, z:1}, tip:0,
        th:{on:false, st:'', x:0, z:0, h:0, vx:0, vz:0, bag:[], who:null, think:0, t:0, walk:0, tgt:{x:0, z:0}, field:new Int16Array(GW * GD)}};
      tier.bots.forEach((b, j) => { const B = BOTS[b]; S.sh.push(mk(j + 1, {name:B.n, c:B.c, bank:B.bank, ag:B.ag * tier.ag, v:tier.v + B.dv, x:[-7.5, 7.5, -3.8][j], z:[7.6, 7.6, 9.2][j], bx:[-3, 3, 0][j]})); });
      build(ctx);
      for (const s of S.sh) newList(s);
      for (let k = 0; k < 6; k++){ restock(k); restock(k); }
      const bar = document.createElement('div'); bar.id = 'kmBar'; S.elList = document.createElement('div'); S.elList.className = 'km-list'; S.elRank = document.createElement('div'); S.elRank.className = 'km-rank';
      bar.append(S.elList, S.elRank); ctx.ui.append(bar); uiDraw(); S.uiDirty = false;
      ctx.player.show(0, 8.1, Math.PI);
      draw(ctx, 0); ctx.camera.snap();
      ctx.hud.time(TIME); ctx.hud.score(0); ctx.hud.info(tier.n + (tier.mult > 1 ? ' ×' + tier.mult : ''));
      ctx.hud.hint(ctx.touch ? '抢头顶有箭头的东西，推到绿色收银台结账' : '抢头顶有箭头的东西，推到绿色收银台结账 · 空格冲撞');
      ctx.after(1.4, () => ctx.hud.callout('今日特价', `${KINDS[S.hot].e} ${KINDS[S.hot].n}每件 2 分`, KINDS[S.hot].c));
    },
    update(dt, ctx){
      const I = ctx.input, me = S.sh[0], T = (S.t += dt), left = TIME - T;
      ctx.hud.time(left);
      /* events */
      if (S.flashI < FLASH.length && T >= FLASH[S.flashI]){
        S.flashI++; const k = (Math.random() * 6) | 0, K = KINDS[k], it = alloc(), sp = SPOTS[k][(Math.random() * 6) | 0];
        if (it){ Object.assign(it, {on:true, kind:GOLD, x:sp[0], z:sp[1] + Math.sign(sp[1] - K.z) * .6, y:0, vx:0, vy:0, vz:0, free:.8, life:12, spilled:false, ph:0}); showItem(it); }
        ctx.hud.callout('限时闪购！', `${K.e} ${K.n}货架旁的金色礼盒值 4 分`, '#ffd24a'); for (let i = 0; i < 3; i++) ctx.tone('square', 880, 1320, .12, .09, i * .16);
        for (const s of S.sh) s.think = Math.min(s.think, .1 + Math.random() * .3);
      }
      if (!S.dbl && left <= 15){ S.dbl = true; S.uiDirty = true; ctx.hud.callout('最后 15 秒', '结账双倍！把车里的都推去收银台', '#ffd24a'); ctx.tone('square', 660, 660, .12, .1); ctx.tone('square', 990, 990, .25, .1, .14); }
      if (S.thI < S.tier.thief.length && T >= S.tier.thief[S.thI] && !S.th.on){ S.thI++; thiefSpawn(ctx); }
      for (let i = S.resp.length - 1; i >= 0; i--) if (T >= S.resp[i].t){ restock(S.resp[i].k); S.resp.splice(i, 1); }
      /* the player: the stick sets where the trolley wants to go, it takes a moment to get there */
      const sn = Math.sin(S.yaw), cs = Math.cos(S.yaw), ix = -sn * I.y + cs * I.x, iz = -cs * I.y - sn * I.x, il = Math.hypot(ix, iz);
      if (me.stun <= 0 && me.dash <= 0){
        const vmax = VP * (1 - .03 * me.cart.length), k = Math.min(1, dt * (il > .08 ? 9 : 7));
        me.vx += ((il > .08 ? ix * vmax : 0) - me.vx) * k; me.vz += ((il > .08 ? iz * vmax : 0) - me.vz) * k;
        if (I.pressed('a')){
          if (me.cd <= 0){
            me.dx = il > .2 ? ix / il : Math.sin(me.h); me.dz = il > .2 ? iz / il : Math.cos(me.h); me.dash = DASH_T; me.cd = DASH_CD;
            ctx.tone('sawtooth', 200, 560, .17, .08); ctx.noise(.16, .13, 1000, 'highpass');
          } else ctx.tone('square', 160, 160, .04, .04);
        }
      }
      for (let i = 1; i < S.sh.length; i++) bot(S.sh[i], dt, ctx);
      for (const s of S.sh) step(s, dt, ctx);
      thief(dt, ctx);
      /* trolleys shoulder each other aside */
      for (let i = 0; i < S.sh.length; i++) for (let j = i + 1; j < S.sh.length; j++){
        const a = S.sh[i], b = S.sh[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > 1.15 || d < .001) continue;
        const p = (1.15 - d) / 2, ux = dx / d * p, uz = dz / d * p;
        if (!hit(a.x - ux, a.z - uz, R)){ a.x -= ux; a.z -= uz; } if (!hit(b.x + ux, b.z + uz, R)){ b.x += ux; b.z += uz; }
      }
      /* items: spilled ones hop and land, everything on the floor can be driven over */
      for (const it of S.items){
        if (!it.on) continue;
        it.free -= dt; it.life -= dt; if (it.life <= 0){ hideItem(it); continue; }
        if (it.y > 0 || it.vy > 0){
          it.vy -= 20 * dt; it.y += it.vy * dt;
          const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt; if (hit(nx, nz, .3)){ it.vx = it.vz = 0; } else { it.x = nx; it.z = nz; }
          if (it.y <= 0){ it.y = 0; it.vy = it.vx = it.vz = 0; }
          continue;
        }
        if (it.free > 0) continue;
        for (const s of S.sh){
          if (s.stun > 0 || s.cart.length >= CAP) continue;
          const a = s.h, fx = s.x + Math.sin(a) * .45, fz = s.z + Math.cos(a) * .45;
          if (Math.hypot(it.x - fx, it.z - fz) > 1.05 && Math.hypot(it.x - s.x, it.z - s.z) > .9) continue;
          const want = it.kind < 6 && s.got[s.list.indexOf(it.kind)] === 0;
          s.cart.push(it.kind); relist(s); if (!s.me && !it.spilled) s.browse = S.tier.browse * (.6 + Math.random() * .8); if (!it.spilled && it.kind !== GOLD) S.resp.push({k:it.kind, t:T + 2.2}); hideItem(it);
          if (s.me){
            const f = 660 * Math.pow(1.122, s.cart.length - 1); ctx.tone('triangle', f, f * (want ? 1.5 : 1), .11, .13);
            burst(ctx, it.x, it.z, KINDS[it.kind].c, 4);
            if (it.kind === GOLD) ctx.hud.callout('礼盒到手！', '结了账才算 4 分，小心被撞', '#ffd24a');
            else if (s.cart.length === CAP) ctx.hud.callout('车满了', '去收银台结账', '#4fd18b');
            else if (want && !s.got.includes(0)) ctx.hud.callout('清单齐了', `结账 +${LIST_PTS * (S.dbl ? 2 : 1)}，别被撞`, '#4fd18b');
          } else if (it.kind === GOLD) ctx.hud.callout('礼盒被抢了', `在${s.name}车里，撞他`, s.c);
          break;
        }
      }
      /* the till: one beep per item while you stay on the green apron */
      for (const s of S.sh){
        if (!inZone(s) || s.stun > 0 || s.dash > 0 || !s.cart.length){ s.scan = 0; continue; }
        s.scan += dt; if (s.scan < SCAN) continue;
        s.scan = 0; const k = s.cart.pop(), mul = S.dbl ? 2 : 1, i = s.list.indexOf(k);
        s.pts += (k === GOLD ? 4 : k === S.hot ? 2 : 1) * mul; if (i >= 0 && s.got[i] < 2) s.got[i] = 2;
        relist(s); S.uiDirty = true;
        if (s.me){ const f = 880 * Math.pow(1.122, Math.min(7, s.streak = (s.streak || 0) + 1)); ctx.tone('square', f, f, .06, .08); ctx.part('heart', s.x + (Math.random() - .5), 2, s.z + (Math.random() - .5), .7, {vy:2.4, life:.7, op:1, color:'#4fd18b'}); }
        if (s.got[0] === 2 && s.got[1] === 2 && s.got[2] === 2){
          s.pts += LIST_PTS * mul; s.lists++; newList(s);
          if (s.me){ ctx.hud.callout(`清单完成 +${LIST_PTS * mul}`, '换了一张新清单', '#4fd18b'); for (let j = 0; j < 4; j++) ctx.tone('triangle', 660 * Math.pow(1.19, j), 660 * Math.pow(1.19, j), .15, .12, j * .08); burst(ctx, s.x, s.z, '#4fd18b', 10); }
        }
        if (!s.cart.length){ s.banking = false; s.think = 0; if (s.me) s.streak = 0; }
      }
      /* HUD */
      S.warn -= dt;
      if (S.uiDirty){ S.uiDirty = false; uiDraw(); ctx.hud.score(me.pts); }
      const n = me.cart.length, th = S.th;
      ctx.hud.info(`${S.tier.n}${S.tier.mult > 1 ? ' ×' + S.tier.mult : ''} · 车里 ${n}/${CAP}${S.dbl ? ' · 双倍' : ''}`);
      ctx.hud.hint(me.stun > 0 ? '被撞晕了…' : S.warn > 0 ? '有人要撞你！躲开红线' : th.on && th.who === me && th.st === 'hunt' ? '扒手盯上你了，冲撞他' : th.on && th.bag.length ? '冲撞扒手，把东西抢回来 +3'
        : inZone(me) && n ? '结账中，别走开' : n >= CAP ? '车满了，去绿色收银台结账' : n && !me.got.includes(0) ? '清单齐了，去收银台结账' : left <= 15 && n ? '快去结账，双倍！' : '抢头顶有箭头的东西' + (ctx.touch ? '' : ' · 空格冲撞'));
      draw(ctx, dt);
      if (left <= 0) finish(ctx);
    },
    stop(){ nw.spd = 0; S = null; }
  };
})());
