/* 小游戏 · 奶娃投篮（B1 室内运动中心，半场）
 * 奶娃在半场里自己跑位，蓝色的防守奶娃一直贴着她。出手：按住蓄力，力量条走到绿色松手（手机上在屏幕上往上滑，滑到绿色松手）。
 * 离篮筐越远要的力量越大、绿区越窄；防守贴在面前绿区再缩一半，他跳起来的时候出手会被盖。
 * 力量条：金色 = 空心，绿色 = 进，绿色上面的蓝色 = 大了一点但打板进，再偏就弹筐，球弹到哪儿地上有圈，先跑到的人拿篮板。
 * 得分：三分线里 2 分，线外 3 分，虚线外 4 分；抢到自己的篮板马上补篮 +1；连进三球「火力全开」每球 +1、绿区变宽。
 * 「变向」（K / 右下按钮）是一个短冲刺，防守贴身时横着甩一下能把他晃倒一秒。
 * 两个模式（各有一张榜）：
 *   计时赛 hoops_rush：60 秒比得分。地上的金色热区里出手得分翻倍，最后 10 秒翻倍，空心加 1 秒。
 *   斗牛   hoops_duel：75 秒 1 对 1，同一个篮筐轮流进攻，换球权要先把球带出三分线。防守时贴上去，他举球时起跳能盖帽。榜上比净胜分。
 * 示范：register 的 modes、ctx.input.drag / swipe、ctx.actor（第二只奶娃）、ctx.screen（把 HTML 摆到场景里的东西旁边）、ctx.camera.follow。
 */
'use strict';
XMini.register((() => {
  const HZ = -6.5, RIM_Y = 3.05, RIM_R = .46, R3 = 6, R4 = 9.4, G = 22, XB = 7.2, ZT = -7.1, ZB = 5.4, BR = .24;
  const SPEED = 7, DASH_V = 17, DASH_T = .16, DASH_CD = 2.4, RATE = 1.25, DRAG = .3, REACH = 1.05, MINC = .07;
  /* per mode: time, shot clock, rival speeds (defending / chasing a loose ball), his reaction to a rebound, his shooting */
  const CFG = {
    rush:{time:60, clock:0, vd:5.5, vr:5.6, react:.4, stumble:1.1, gap:1.55, jump:1.25, jumpAt:.45},
    duel:{time:75, clock:8, vd:5.8, vr:6.6, react:.2, stumble:1, gap:1.35, jump:1.4, jumpAt:.4, p3:.37, p2:.55, wind:.52}
  };
  const FONT = '"Noto Sans SC","Microsoft YaHei",sans-serif', BLUE = '#6ec1ff';
  const hyp = Math.hypot, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a);
  const dHoop = (x, z) => hyp(x, z - HZ), zonePts = d => (d > R4 ? 4 : d > R3 ? 3 : 2);
  const aimAt = d => Math.min(.95, .2 + d * .066), aimW = d => Math.max(.055, .14 - d * .008);
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
  let S = null;

  function build(ctx){
    const R = ctx.root, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
    const flat = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), mat); m.position.set(x, y, z); R.add(m); return m; };
    flat(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({color:'#20262e'}), 0, -.03, 0);
    /* half court, 16 x 15 m, 32 px to the metre; the hoop is at (256, 48) on the canvas */
    const PX = 32, court = tex(512, 480, g => {
      g.fillStyle = '#b98652'; g.fillRect(0, 0, 512, 480);
      for (let i = 0; i < 16; i++){ g.fillStyle = i % 2 ? 'rgba(90,50,10,.12)' : 'rgba(255,240,210,.07)'; g.fillRect(i * 32, 0, 32, 480); }
      const hx = 256, hy = 48;
      g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(hx, hy, R3 * PX, 0, Math.PI); g.fill();
      g.strokeStyle = '#f4efe2'; g.lineWidth = 5; g.strokeRect(8, 8, 496, 464);
      g.fillStyle = 'rgba(181,68,42,.55)'; g.fillRect(hx - 58, 8, 116, 176); g.strokeRect(hx - 58, 8, 116, 176);
      g.beginPath(); g.arc(hx, 184, 58, 0, Math.PI); g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(hx - R3 * PX, 8); g.lineTo(hx - R3 * PX, hy); g.arc(hx, hy, R3 * PX, Math.PI, 0, true); g.lineTo(hx + R3 * PX, 8); g.stroke();
      g.lineWidth = 5; g.setLineDash([16, 12]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(hx, hy, R4 * PX, .2, Math.PI - .2); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '900 34px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('2 分', hx, 150); g.fillText('3 分', hx - 150, 250); g.fillText('3 分', hx + 150, 250); g.fillText('4 分', hx, 410);
    });
    const floor = flat(new THREE.PlaneGeometry(16, 15), new THREE.MeshStandardMaterial({map:court, roughness:.95}), 0, 0, -.5); floor.receiveShadow = true;
    bx(16.6, 6.6, .3, M('#cfc8b8', {roughness:.95}), 0, 3.3, -8.4);
    const banner = tex(1024, 128, g => { g.fillStyle = '#b5442a'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#fff'; g.font = '900 76px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B1 室内运动中心 · 奶娃投篮', 512, 68); });
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.3), new THREE.MeshBasicMaterial({map:banner})); bn.position.set(0, 5.6, -8.23); R.add(bn);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bx(1.1, .5 + i * .5, 13, M(['#3e6fa3', '#365f8c', '#2e5078'][i], {roughness:.8}), s * (8.7 + i * 1.1), .25 + i * .25, -1.2);
    /* the hoop */
    const steel = M('#59626c', {roughness:.4, metalness:.6});
    bx(.22, 3.5, .22, steel, 0, 1.75, HZ - 1.2); bx(.16, .16, .8, steel, 0, 3.4, HZ - .9);
    const board = tex(256, 160, g => { g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#c9543a'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 150); g.strokeRect(84, 62, 88, 66); });
    S.board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.12, .08), new THREE.MeshStandardMaterial({map:board, roughness:.5, emissive:'#ff8a3d', emissiveIntensity:0})); S.board.position.set(0, RIM_Y + .42, HZ - .55); S.board.castShadow = true; R.add(S.board);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, .035, 8, 28).rotateX(Math.PI / 2), M('#ff6a2a', {roughness:.4, metalness:.3})); rim.position.set(0, RIM_Y, HZ); rim.castShadow = true; R.add(rim);
    S.net = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R * .62, .55, 12, 3, true), new THREE.MeshBasicMaterial({color:'#ffffff', wireframe:true, transparent:true, opacity:.85})); S.net.position.set(0, RIM_Y - .29, HZ); R.add(S.net);
    /* floor marks: the ring under 奶娃 (its colour says how many points this spot is worth), where a rebound will land,
       the hot zone (计时赛), and the three-point arc lit up while the ball has to be taken out (斗牛) */
    S.foot = flat(new THREE.RingGeometry(.62, .8, 32), gxGlow('#ffffff', .75), 0, .04, 0);
    S.land = flat(new THREE.RingGeometry(.55, .95, 32), gxGlow('#ff5fa2', .85), 0, .05, 0); S.land.visible = false;
    S.hotM = flat(new THREE.CircleGeometry(1.15, 36), gxGlow('#ffc93c', .5), 0, .035, 0); S.hotM.visible = false;
    S.arc = new THREE.Mesh(new THREE.RingGeometry(R3 - .1, R3 + .1, 64, 1, Math.PI, Math.PI).rotateX(-Math.PI / 2), gxGlow('#4fd18b', .8)); S.arc.position.set(0, .045, HZ); S.arc.visible = false; R.add(S.arc);
    /* ball */
    const ballTex = tex(64, 32, g => { g.fillStyle = '#e8792a'; g.fillRect(0, 0, 64, 32); g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(64, 16); g.moveTo(16, 0); g.lineTo(16, 32); g.moveTo(48, 0); g.lineTo(48, 32); g.stroke(); });
    S.ballMat = new THREE.MeshStandardMaterial({map:ballTex, roughness:.7, emissive:'#ff5a1a', emissiveIntensity:0});
    S.ballM = new THREE.Mesh(new THREE.SphereGeometry(BR, 16, 12), S.ballMat); S.ballM.castShadow = true; R.add(S.ballM);
    /* the rival, and the mark over his head that fills up while he winds up for a shot */
    const A = S.R = ctx.actor({color:BLUE, belly:'#e8f4ff'});
    Object.assign(A, {x:0, z:-2.5, h:0, st:'def', stumble:0, immune:0, jumpT:-1, jcd:0, px:0, pz:1, react:0, wind:0, windT:.6, tx:0, tz:0, plan:'', fake:false, holdT:0, sb:false, rushT:0, poss:0, smart:false});
    S.tell = new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 8), new THREE.MeshBasicMaterial({color:'#ff3b30', transparent:true, opacity:.9, depthTest:false})); S.tell.visible = false; S.tell.renderOrder = 5; R.add(S.tell);
    /* the power meter: HTML, kept next to 奶娃 with ctx.screen */
    const el = (css, parent) => { const e = document.createElement('div'); e.style.cssText = css; (parent || ctx.ui).append(e); return e; };
    S.meter = el('position:fixed;left:0;top:0;width:18px;height:136px;margin:-68px 0 0 -9px;border-radius:9px;background:rgba(10,12,24,.74);border:2px solid rgba(255,255,255,.9);overflow:hidden;pointer-events:none;box-sizing:content-box');
    S.mBank = el('position:absolute;left:0;right:0;background:#7c8cff', S.meter); S.mGreen = el('position:absolute;left:0;right:0;background:#4fd18b', S.meter);
    S.mGold = el('position:absolute;left:0;right:0;background:#ffc93c', S.meter); S.mMark = el('position:absolute;left:-2px;right:-2px;height:5px;margin-bottom:-2.5px;background:#fff;box-shadow:0 0 6px #fff', S.meter);
    S.mTag = el('position:fixed;left:0;top:0;margin:-100px 0 0 0;padding:2px 8px;border-radius:999px;background:rgba(10,12,24,.7);font:700 13px ' + FONT + ';color:#fff;pointer-events:none;white-space:nowrap');
  }

  const duel = () => S.mode === 'duel';
  /* the rival tries harder when he is behind and eases off when he is ahead (斗牛 only) */
  const tough = () => (duel() ? clamp((S.score - S.rs) / 8, -.6, 1) : 0);
  function say(ctx, t, sub, color){ ctx.hud.callout(t, sub || '', color); }
  function puff(ctx, x, y, z, n, color, v){ if (ctx.q === 0) n = Math.ceil(n / 3); for (let i = 0; i < n; i++) ctx.part('dust', x + rnd(-.3, .3), y, z + rnd(-.3, .3), .42, {vx:rnd(-v, v), vy:rnd(.6, v), vz:rnd(-v, v), g:6, life:.7, op:.95, color}); }

  /* how wide the green zone is right now: distance, a defender in her face, on fire, a put-back */
  function meterNow(ctx){
    const P = ctx.player, R = S.R, d = dHoop(P.x, P.z), dr = hyp(R.x - P.x, R.z - P.z);
    const front = ((R.x - P.x) * -P.x + (R.z - P.z) * (HZ - P.z)) / (d || 1) > .25;
    const contest = R.stumble <= 0 && dr < 1.75 && front;
    let w = aimW(d); if (contest) w *= .6; if (S.fire) w *= 1.25; if (S.putT > 0) w *= 1.5;
    return {d, tc:aimAt(d), w, contest, dr, front, pts:zonePts(d)};
  }
  function inHot(P){ return S.mode === 'rush' && hyp(P.x - S.hot.x, P.z - S.hot.z) < 1.2; }
  function moveHot(){
    const k = Math.random(), r = k < .5 ? rnd(3.2, 5.2) : k < .85 ? rnd(6.7, 8) : rnd(9.9, 10.8);
    let x, z, n = 0;
    do { const a = rnd(-1.15, 1.15); x = clamp(Math.sin(a) * r, -6.2, 6.2); z = Math.min(ZB - .7, HZ + Math.cos(a) * r); } while (hyp(x - S.hot.x, z - S.hot.z) < 3 && ++n < 8);
    S.hot.x = x; S.hot.z = z; S.hot.t = 10; S.hotM.position.set(x, .035, z);
  }

  /* ---- the ball ---- */
  function launch(ctx, who, x, z, out, info){
    const B = S.ball, ux = -x, uz = HZ - z, L = hyp(ux, uz) || 1, nx = ux / L, nz = uz / L;
    const T = out === 'swish' ? [0, RIM_Y, HZ] : out === 'in' ? [-nx * .16, RIM_Y, HZ - nz * .16] : out === 'bank' ? [-nx * .25, RIM_Y + .42, HZ - .47]
      : out === 'board' ? [-nx * .7, RIM_Y + .78, HZ - .47] : out === 'rim' ? [-nx * RIM_R, RIM_Y, HZ - nz * RIM_R] : out === 'short' ? [-nx * 1.5, RIM_Y - .8, HZ - nz * 1.5] : [nx * .8, RIM_Y + 1.5, HZ - .47];
    const fly = .5 + L * .05, y0 = 2.35;
    Object.assign(B, {st:'shot', who, out, info:Object.assign({sx:x, sz:z}, info), t:0, fly, x0:x + nx * .3, y0, z0:z + nz * .3, T, vy0:(T[1] - y0) / fly + .5 * G * fly, last:who, kind:'shot'});
    ctx.tone('sine', 300, 560, .12, .12);
  }
  function loose(ctx, kind, ang, r, vy, from){
    const B = S.ball, lx = clamp((from ? from[0] : 0) + Math.sin(ang) * r, -XB + .6, XB - .6), lz = clamp((from ? from[1] : HZ) + Math.cos(ang) * r, ZT + .7, ZB - .2);
    const th = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, B.y - BR))) / G;
    Object.assign(B, {st:'loose', t:0, vx:(lx - B.x) / th, vz:(lz - B.z) / th, vy, bounces:0, lx, lz, kind});
    S.land.position.set(lx, .05, lz); S.land.visible = true; S.R.react = S.M.react * (1 - .3 * tough()); S.chg = null;
  }
  function pass(ctx, to, clear){
    const B = S.ball; Object.assign(B, {st:'pass', to, t:0, x0:B.x, y0:B.y, z0:B.z, clear:!!clear}); S.land.visible = false; S.chg = null;
    if (to === 'r') S.R.st = 'wait';
  }
  function scored(ctx){
    const B = S.ball, I = B.info, swish = B.out === 'swish'; S.netT = .45; ctx.noise(.22, .22, 3200, 'highpass');
    if (B.who === 'p'){
      let pts = I.pts; const tags = [];
      S.made++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); if (I.pts >= 3) S.threes++;
      if (swish){ S.swish++; tags.push('空心'); } else if (B.out === 'bank') tags.push('打板');
      if (I.put){ pts += 1; tags.push('补篮 +1'); }
      if (S.fire){ pts += 1; tags.push('🔥 +1'); }
      if (S.mode === 'rush'){
        if (I.hot){ pts *= 2; tags.push('热区 ×2'); moveHot(); }
        if (S.t <= 10){ pts *= 2; tags.push('最后 10 秒 ×2'); }
        if (swish && S.bonus < 8){ S.bonus++; S.t += 1; tags.push('+1 秒'); }
      }
      S.score += pts;
      const base = 660 * Math.pow(1.122, Math.min(8, S.streak - 1)); ctx.tone('triangle', base, base, .16, .14, .02); if (swish || I.pts > 2) ctx.tone('triangle', base * 1.5, base * 1.5, .26, .13, .1);
      say(ctx, '+' + pts, tags.join(' · ') || (I.pts === 4 ? '超远四分！' : I.pts === 3 ? '三分！' : '进了'), swish || pts >= 4 ? '#ffc93c' : undefined);
      puff(ctx, 0, RIM_Y - .3, HZ, swish ? 12 : 7, swish ? '#ffe28a' : '#ffffff', 3); if (swish) ctx.camera.shake(.12);
      if (!S.fire && S.streak >= 3){ S.fire = true; ctx.unlock('mg_hoops_fire'); ctx.sfx.sparkle(); ctx.after(.8, () => say(ctx, '火力全开', '每球 +1，绿区变宽，投丢就没了', '#ff8a3d')); }
      if (S.mode === 'rush' && S.line && !S.passed && S.score > S.line.v){ S.passed = true; ctx.after(1.5, () => { say(ctx, S.line.top ? '超过榜首了！' : '超过自己的纪录了！', '', '#ffc93c'); ctx.sfx.sparkle(); }); }
      if (S.made >= 2) S.tips = false;
    } else {
      S.rs += I.pts; ctx.tone('sawtooth', 220, 160, .25, .08);
      say(ctx, '对手 +' + I.pts, I.pts === 3 ? '被他投进三分' : '被他打进', BLUE);
    }
    hud(ctx);
  }
  function missed(ctx, o){
    const B = S.ball, I = B.info;
    if (B.who === 'p'){
      const fire = S.fire; S.streak = 0; S.fire = false;
      say(ctx, o === 'rim' ? '弹筐' : o === 'board' ? '砸板' : '三不沾', (I.e < 0 ? '力量小了' : '力量大了') + (I.contest ? ' · 被贴防了' : '') + (fire ? ' · 火力没了' : ''), '#b8c2cc');
    } else say(ctx, '他没进', '抢篮板！', '#4fd18b');
    if (o === 'rim' || o === 'board'){ S.flash = .25; ctx.tone('square', 190, 120, .14, .11); ctx.noise(.08, .12, 900); ctx.camera.shake(.14); } else ctx.tone('sawtooth', 260, 150, .22, .07);
    const back = Math.atan2(I.sx, I.sz - HZ);   /* from the hoop toward the shooter */
    if (o === 'short') loose(ctx, 'miss', back + rnd(-.8, .8), rnd(.5, 1.4), -1, [B.x, B.z]);
    else loose(ctx, 'miss', back + rnd(-1.15, 1.15), o === 'long' ? rnd(2.4, 3.8) : rnd(1.7, 3.5), o === 'long' ? 1 : rnd(3.6, 5.2));
    hud(ctx);
  }
  function grab(ctx, who){
    const B = S.ball, off = who === B.last && B.kind === 'miss'; S.land.visible = false; B.st = who;
    if (who === 'p'){
      S.rebs++; S.needClear = duel() && !off && B.last === 'r'; S.putT = off ? 2.4 : 0; S.clock = S.M.clock;
      ctx.tone('triangle', 520, 780, .12, .13);
      say(ctx, off ? '篮板！' : '抢到了！', off ? '马上补篮：绿区更宽，进了 +1' : S.needClear ? '把球带出三分线再进攻' : '', '#4fd18b');
    } else {
      const R = S.R; ctx.tone('sawtooth', 240, 180, .16, .07);
      if (!duel()){ R.st = 'hold'; R.holdT = .9; say(ctx, '篮板被抢走了', '等他把球传回来', BLUE); }
      else if (off){ R.st = 'wind'; R.wind = 0; R.windT = .45; R.fake = false; say(ctx, '他抢到前场篮板', '快封他！', BLUE); }
      else { rivalPlan(R, true); say(ctx, '篮板被抢走了', '回防！', BLUE); }
    }
    hud(ctx);
  }
  function ball(dt, ctx){
    const B = S.ball, P = ctx.player, R = S.R; B.t += dt;
    if (B.st === 'p'){
      const k = S.chg ? 1 : 0; S.lift += (k - S.lift) * Math.min(1, dt * 14);
      const dy = S.dash || hyp(ctx.input.x, ctx.input.y) > .1 ? Math.abs(Math.sin(ctx.elapsed * 10)) * .75 : Math.abs(Math.sin(ctx.elapsed * 6)) * .45;
      B.x = P.x + Math.sin(P.h + .55) * .5; B.z = P.z + Math.cos(P.h + .55) * .5; B.y = P.y + (BR + .25 + dy) * (1 - S.lift) + 2.3 * S.lift;
    } else if (B.st === 'r'){
      const up = R.st === 'wind' ? Math.min(1, R.wind / .2) : 0, dy = Math.abs(Math.sin(ctx.elapsed * 7)) * .6;
      B.x = R.x + Math.sin(R.h + .55) * .5; B.z = R.z + Math.cos(R.h + .55) * .5; B.y = R.y + (BR + .25 + dy) * (1 - up) + 2.35 * up;
    } else if (B.st === 'shot'){
      const k = Math.min(1, B.t / B.fly);
      B.x = B.x0 + (B.T[0] - B.x0) * k; B.z = B.z0 + (B.T[2] - B.z0) * k; B.y = B.y0 + B.vy0 * B.t - .5 * G * B.t * B.t;
      if (ctx.q > 0 && Math.random() < dt * (S.fire && B.who === 'p' ? 60 : 20)) ctx.part('dust', B.x, B.y, B.z, S.fire ? .55 : .3, {vy:.6, life:.35, op:.8, color:S.fire && B.who === 'p' ? '#ff8a3d' : '#ffffff', grow:.8});
      if (B.t >= B.fly){
        B.x = B.T[0]; B.y = B.T[1]; B.z = B.T[2]; B.t = 0;
        if (B.out === 'swish' || B.out === 'in'){ if (B.out === 'in') ctx.tone('square', 210, 160, .08, .06); B.st = 'drop'; B.vy = -3; scored(ctx); }
        else if (B.out === 'bank'){ B.st = 'bank'; S.flash = .2; ctx.tone('square', 170, 120, .1, .1); ctx.noise(.06, .1, 800); }
        else missed(ctx, B.out);
      }
    } else if (B.st === 'bank'){
      const k = Math.min(1, B.t / .22); B.x = B.T[0] * (1 - k); B.z = B.T[2] + (HZ - B.T[2]) * k; B.y = B.T[1] + (RIM_Y - B.T[1]) * k;
      if (k >= 1){ B.st = 'drop'; B.vy = -3; B.t = 0; scored(ctx); }
    } else if (B.st === 'drop'){
      B.vy -= G * dt; B.y += B.vy * dt; if (B.y < BR){ B.y = BR; B.vy *= -.45; }
      if (B.t > .5){
        if (!duel()) pass(ctx, 'p'); else pass(ctx, B.who === 'p' ? 'r' : 'p', true);
      }
    } else if (B.st === 'pass'){
      const k = Math.min(1, B.t / .35), to = B.to === 'p' ? P : R, tx = to.x, tz = to.z;
      B.x = B.x0 + (tx - B.x0) * k; B.z = B.z0 + (tz - B.z0) * k; B.y = B.y0 + (1.3 - B.y0) * k + Math.sin(k * Math.PI) * .8;
      if (k >= 1){
        B.st = B.to; ctx.tone('triangle', 440, 520, .06, .08);
        if (B.to === 'p'){ S.needClear = B.clear && duel() && dHoop(P.x, P.z) < R3; S.clock = S.M.clock; S.putT = 0; if (S.needClear && S.tips) say(ctx, '你的球', '先带出三分线', '#4fd18b'); }
        else rivalPlan(R, B.clear);
        hud(ctx);
      }
    } else if (B.st === 'loose'){
      B.vy -= G * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      if (B.y < BR && B.vy < 0){ B.y = BR; B.bounces++; S.land.visible = false; if (B.vy < -2){ B.vy *= -.55; ctx.sfx.thud(.1); } else B.vy = 0; B.vx *= .6; B.vz *= .6; }
      if (Math.abs(B.x) > XB){ B.x = Math.sign(B.x) * XB; B.vx *= -.5; } if (B.z < ZT - .6){ B.z = ZT - .6; B.vz *= -.5; } else if (B.z > ZB + .6){ B.z = ZB + .6; B.vz *= -.5; }
      if (B.t > .12 && B.y < 2.5){
        const dp = hyp(P.x - B.x, P.z - B.z), dr = hyp(R.x - B.x, R.z - B.z), pOK = dp < REACH && S.stun <= 0, rOK = dr < REACH - .1 && R.stumble <= 0;
        if (pOK && (!rOK || dp <= dr)) grab(ctx, 'p'); else if (rOK) grab(ctx, 'r');
      }
      if (B.st === 'loose' && B.t > 3.4){ if (duel()) pass(ctx, B.last === 'p' ? 'r' : 'p', true); else pass(ctx, 'p'); }
    }
    S.ballM.position.set(B.x, B.y, B.z); if (B.st !== 'p' && B.st !== 'r') S.ballM.rotation.x -= dt * 9;
  }

  /* ---- 奶娃 ---- */
  function release(ctx, c){
    const P = ctx.player, R = S.R, m = meterNow(ctx); S.chg = null;
    if (c < MINC) return;
    S.shots++; P.act('jump');
    if (R.jumpT > .04 && R.jumpT < .5 && m.dr < 1.5 && m.front){          /* he is in the air in front of her */
      S.streak = 0; S.fire = false; S.stun = .35; ctx.camera.shake(.4); ctx.sfx.thud(.5); ctx.tone('sawtooth', 300, 120, .25, .1);
      say(ctx, '被盖了！', '他跳起来的时候别出手，等他落地', BLUE);
      const B = S.ball; B.who = B.last = 'p'; B.y = 2.6; loose(ctx, 'block', Math.atan2(R.x - P.x, R.z - P.z) + rnd(-.9, .9), rnd(2.2, 3.6), 3, [P.x, P.z]);
      S.putT = 0; hud(ctx); return;
    }
    const e = c - m.tc, a = Math.abs(e), w = m.w;
    const out = a <= w * .38 ? 'swish' : a <= w ? 'in' : e > 0 && e <= w * 1.65 ? 'bank' : e < 0 && e >= -w * 1.8 ? 'rim' : e > 0 && e <= w * 2.5 ? 'board' : e < 0 ? 'short' : 'long';
    launch(ctx, 'p', P.x, P.z, out, {pts:m.pts, e, contest:m.contest, hot:inHot(P), put:S.putT > 0});
    S.putT = 0;
  }
  function player(dt, ctx){
    const P = ctx.player, I = ctx.input, R = S.R, B = S.ball, has = B.st === 'p';
    S.stun -= dt; S.dashCd -= dt; S.putT -= dt;
    if (I.pressed('b') && S.dashCd <= 0 && S.stun <= 0 && !S.chg){
      let dx = I.x, dz = -I.y; const l = hyp(dx, dz);
      if (l < .2){ dx = Math.sin(P.h); dz = Math.cos(P.h); } else { dx /= l; dz /= l; }
      S.dash = {t:DASH_T, dx, dz}; S.dashCd = DASH_CD; ctx.noise(.14, .16, 1800, 'bandpass'); ctx.tone('sine', 520, 260, .12, .06);
      puff(ctx, P.x, .3, P.z, 5, '#ffffff', 2);
      const d = hyp(R.x - P.x, R.z - P.z);                                 /* a sideways burst right under his nose leaves him behind */
      if (has && d < 2.1 && R.stumble <= 0 && R.immune <= 0 && Math.abs((R.x - P.x) / d * dz - (R.z - P.z) / d * dx) > .55){
        R.stumble = S.M.stumble * (1 - .25 * Math.max(0, tough())); R.immune = 3.2; R.rushT = R.stumble + 1; S.ankles++; ctx.sfx.boing();
        say(ctx, '晃倒了！', '他站不稳，快出手', '#ffc93c');
      }
    }
    if (S.dash){
      P.x = clamp(P.x + S.dash.dx * DASH_V * dt, -XB, XB); P.z = clamp(P.z + S.dash.dz * DASH_V * dt, ZT, ZB); S.dash.t -= dt; if (S.dash.t <= 0) S.dash = null;
    } else if (S.stun <= 0) P.walk(dt, {speed:SPEED * (S.chg ? .3 : 1), minX:-XB, maxX:XB, minZ:ZT, maxZ:ZB});
    if (has && (S.chg || hyp(I.x, I.y) < .1)){ let dh = Math.atan2(-P.x, HZ - P.z) - P.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); P.h += dh * Math.min(1, dt * 12); }
    if (S.needClear && dHoop(P.x, P.z) > R3 + .1){ S.needClear = false; ctx.tone('triangle', 660, 880, .1, .1); }
    /* shooting: hold A and let go (the bar runs up and down), or drag upward and let go (the bar follows the finger) */
    if (has){
      const drag = I.drag;
      if (!S.chg && S.stun <= 0 && (I.pressed('a') || (drag && drag.dy > .02))){
        if (S.needClear){ if (S.warnT <= 0){ S.warnT = 1.2; ctx.tone('square', 200, 200, .1, .08); say(ctx, '先出三分线', '换球权之后要把球带出去', '#4fd18b'); } }
        else S.chg = {c:0, dir:1, t:0, key:I.pressed('a')};
      }
      const c = S.chg;
      if (c){
        c.t += dt;
        if (c.key){
          c.c += c.dir * RATE * dt; if (c.c >= 1){ c.c = 1; c.dir = -1; } else if (c.c <= 0){ c.c = 0; c.dir = 1; }
          if (!I.a) release(ctx, c.c);
        } else if (drag) c.c = clamp(drag.dy / DRAG, 0, 1);
        else release(ctx, I.pressed('swipe') && I.swipe ? clamp(I.swipe.dy / DRAG, 0, 1) : c.c);
      }
      if (duel()){ S.clock -= dt; if (S.clock <= 0 && B.st === 'p'){ S.streak = 0; S.fire = false; ctx.sfx.fail(); say(ctx, '进攻超时', '球权给对手', '#b8c2cc'); pass(ctx, 'r', true); } }
    } else {
      S.chg = null;
      if ((I.pressed('a') || I.pressed('tap')) && P.y <= 0 && S.stun <= 0) P.act('jump');     /* defence: jump to block */
    }
    S.warnT -= dt;
  }

  /* ---- the rival ---- */
  function rivalPlan(R, clear){
    const d = dHoop(R.x, R.z), three = Math.random() < (S.rs < S.score ? .6 : .45);
    R.fake = Math.random() < .2 + .2 * Math.max(0, tough()); R.smart = Math.random() < .55 + .3 * tough(); R.windT = S.M.wind * (1 - .12 * tough()); R.sb = false; R.poss = 0;
    const a = rnd(-1.2, 1.2), spot = r => [clamp(Math.sin(a) * r, -6.4, 6.4), Math.min(ZB - .6, HZ + Math.cos(a) * r)];
    if (clear && d < R3 + .2){ R.st = 'clear'; [R.tx, R.tz] = spot(R3 + .7); R.plan = three ? 'three' : 'mid'; }
    else if (three && d > R3 && hyp(S.px - R.x, S.pz - R.z) > 2.2){ R.st = 'wind'; R.wind = 0; }
    else { R.st = 'drive'; [R.tx, R.tz] = three ? spot(R3 + .7) : spot(Math.random() < .35 ? rnd(1.5, 2.2) : rnd(3.4, 4.8)); }
  }
  function rivalShoot(ctx, R){
    const P = ctx.player, B = S.ball, d = dHoop(R.x, R.z), dp = hyp(P.x - R.x, P.z - R.z);
    const front = ((P.x - R.x) * -R.x + (P.z - R.z) * (HZ - R.z)) / (d || 1) > .2;
    R.st = 'def'; S.tell.visible = false;
    if (P.y > .3 && dp < 1.3){
      S.blocks++; ctx.unlock('mg_hoops_block'); ctx.camera.shake(.45); ctx.sfx.thud(.5); ctx.tone('triangle', 700, 1050, .16, .14);
      say(ctx, '盖帽！', '球还没死，抢！', '#ffc93c'); puff(ctx, R.x, 2.6, R.z, 8, '#ffe28a', 3);
      B.who = B.last = 'r'; B.y = 2.6; loose(ctx, 'block', Math.atan2(P.x - R.x, P.z - R.z) + rnd(-.9, .9), rnd(2.2, 3.6), 3, [R.x, R.z]); R.react = .55;
      return;
    }
    const k = tough(); let p = (d > R3 ? S.M.p3 : d > 2.6 ? S.M.p2 : .82) + (k > 0 ? .1 : .06) * k;
    if (dp < 1.5 && front){ p *= .72; S.contests++; }
    const hit = Math.random() < p;
    launch(ctx, 'r', R.x, R.z, hit ? (Math.random() < .4 ? 'swish' : 'in') : Math.random() < .7 ? 'rim' : 'board', {pts:Math.min(3, zonePts(d)), e:0});
  }
  function rival(dt, ctx){
    const R = S.R, P = ctx.player, B = S.ball, k = tough(); S.px = P.x; S.pz = P.z;
    R.stumble -= dt; R.immune -= dt; R.jcd -= dt; R.rushT -= dt;
    if (R.jumpT >= 0){ R.jumpT += dt; R.y = Math.max(0, 7 * R.jumpT - 11.5 * R.jumpT * R.jumpT); if (R.jumpT > .62){ R.jumpT = -1; R.y = 0; } }
    const lag = Math.min(1, dt / .18); R.px += (P.x - R.px) * lag; R.pz += (P.z - R.pz) * lag;      /* he sees her a little late */
    let tx = R.x, tz = R.z, v = 0, face = null; R.up = false; R.lean = 0;
    const dp = hyp(R.x - P.x, R.z - P.z);
    if (R.stumble > 0){ R.lean = Math.sin(ctx.elapsed * 22) * .28; if (ctx.q > 0 && Math.random() < dt * 8) ctx.part('dust', R.x + rnd(-.4, .4), 2.5, R.z, .4, {vy:1, life:.5, op:.9, color:'#ffe28a'}); }
    else if (B.st === 'p' || (B.st === 'pass' && B.to === 'p')){
      const ux = -R.px, uz = HZ - R.pz, L = hyp(ux, uz) || 1, gap = Math.min(Math.max(.2, L - .7), S.chg ? S.M.gap - .3 : S.M.gap);
      tx = R.px + ux / L * gap; tz = R.pz + uz / L * gap; v = S.M.vd * (1 + .1 * k) * (R.rushT > 0 ? 1.25 : 1); face = P; R.up = !!S.chg && dp < 2.2;
      if (S.chg && S.chg.t > S.M.jumpAt - .1 * Math.max(0, k) && dp < S.M.jump && R.jcd <= 0 && R.jumpT < 0){ R.jumpT = 0; R.jcd = 1.3; }
    } else if (B.st === 'shot' || B.st === 'bank' || B.st === 'drop'){ tx = clamp(R.x * .4, -2, 2); tz = HZ + 1.9; v = S.M.vd; }
    else if (B.st === 'loose'){ R.react -= dt; if (R.react <= 0){ tx = B.bounces ? B.x : B.lx; tz = B.bounces ? B.z : B.lz; v = S.M.vr * (1 + .08 * k); } }
    else if (B.st === 'r'){
      if (R.st === 'hold'){ face = P; R.holdT -= dt; if (R.holdT <= 0) pass(ctx, 'p'); }
      else if (R.st === 'clear' || R.st === 'drive'){
        tx = R.tx; tz = R.tz; v = R.st === 'clear' ? 6.3 : 6.6; R.poss += dt;
        /* she is standing in his way: pull up and shoot from here rather than push (he still has to be outside the arc after a change of possession) */
        if (R.poss > (R.st === 'drive' ? 2.2 : 4.5) || (R.st === 'drive' && dp < 1.2 && R.poss > .8)){ R.st = 'wind'; R.wind = 0; }
        else if (hyp(tx - R.x, tz - R.z) < .25){
          if (R.st === 'clear' && R.plan === 'mid'){ R.st = 'drive'; const a = Math.atan2(R.x, R.z - HZ) + rnd(-.5, .5), r = Math.random() < .35 ? rnd(1.5, 2.2) : rnd(3.4, 4.8); R.tx = clamp(Math.sin(a) * r, -6, 6); R.tz = HZ + Math.cos(a) * r; }
          else { R.st = 'wind'; R.wind = 0; }
        }
      } else if (R.st === 'wind'){
        /* she is glued to him: one step back per possession to make room */
        if (!R.sb && R.wind < .1 && dp < 1.5 && R.windT > .42){ R.sb = true; const a = Math.atan2(R.x - P.x, R.z - P.z) + rnd(-.6, .6); R.x = clamp(R.x + Math.sin(a) * 2.3, -6.8, 6.8); R.z = clamp(R.z + Math.cos(a) * 2.3, ZT + .5, ZB); R.windT = Math.min(R.windT, .44); puff(ctx, R.x, .3, R.z, 4, '#ffffff', 2); ctx.noise(.12, .12, 1800, 'bandpass'); }
        if (R.wind === 0) ctx.tone('square', 520, 520, .06, .06);
        R.wind += dt; R.up = true; face = {x:0, z:HZ};
        if (R.fake && R.wind > R.windT - .1){ R.fake = false; R.wind = R.windT - .45; }       /* pump fake */
        if (R.wind >= R.windT){
          if (R.smart && P.y > .3 && dp < 1.4){ R.smart = false; R.wind = R.windT - .4; }      /* she jumped early: hold it until she comes down */
          else rivalShoot(ctx, R);
        }
      } else rivalPlan(R, false);
    }
    let dx = tx - R.x, dz = tz - R.z; const dl = hyp(dx, dz), step = Math.min(dl, v * dt);
    if (B.st === 'r' && dl > .02 && dp < 1.5 && (P.x - R.x) * dx + (P.z - R.z) * dz > 0){            /* go around her, on the side he is already leaning to */
      const side = (P.x - R.x) * dz - (P.z - R.z) * dx > 0 ? 1 : -1, c = Math.cos(1.2 * side), sn = Math.sin(1.2 * side), ox = dx;
      dx = ox * c - dz * sn; dz = ox * sn + dz * c;
    }
    if (dl > .02 && step > 0){ R.x += dx / dl * step; R.z += dz / dl * step; }
    R.spd = dt > 0 ? step / dt : 0;
    const sp = hyp(R.x - P.x, R.z - P.z); if (sp < .85 && sp > .001){ R.x += (R.x - P.x) / sp * (.85 - sp); R.z += (R.z - P.z) / sp * (.85 - sp); }   /* never inside her */
    R.x = clamp(R.x, -XB, XB); R.z = clamp(R.z, ZT, ZB);
    let th = face ? Math.atan2(face.x - R.x, face.z - R.z) : R.spd > .5 ? Math.atan2(dx, dz) : R.h, dh = th - R.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); R.h += dh * Math.min(1, dt * 12);
    R.update(dt);
    const tell = B.st === 'r' && R.st === 'wind'; S.tell.visible = tell;
    if (tell){ const f = clamp(R.wind / R.windT, 0, 1); S.tell.position.set(R.x, 3.3 + R.y, R.z); S.tell.scale.setScalar(.5 + f * 1.3); S.tell.material.color.set(f > .6 ? '#ff3b30' : '#ffc93c'); }
  }

  function hud(ctx){
    if (duel()){
      ctx.hud.score(S.score + ' : ' + S.rs);
      const B = S.ball, mine = B.st === 'p' || (B.st === 'pass' && B.to === 'p'), his = B.st === 'r' || (B.st === 'pass' && B.to === 'r');
      ctx.hud.info((mine ? `进攻 ${Math.max(0, Math.ceil(S.clock))}` : his ? '防守' : '抢球') + (S.fire ? ' · 🔥' : S.streak > 1 ? ` · 连中 ×${S.streak}` : ''));
    } else {
      ctx.hud.score(S.score);
      ctx.hud.info((S.fire ? '🔥 火力全开' : S.streak > 1 ? `连中 ×${S.streak}` : '') + (S.line && !S.passed ? `${S.fire || S.streak > 1 ? ' · ' : ''}${S.line.top ? '榜首' : '纪录'} ${S.line.v}` : ''));
    }
  }
  function cam(ctx){
    const tall = ctx.aspect < .7; if (tall === S.tall) return; S.tall = tall;
    ctx.camera.follow(S.camT, {height:1.5, pitch:tall ? .86 : .66, yaw:0, fov:55, lerp:5, dist:a => (a < .7 ? 22.5 : a < 1.15 ? 19.5 : 16.5)});
  }
  function view(dt, ctx){
    cam(ctx);
    const P = ctx.player, B = S.ball, has = B.st === 'p', m = meterNow(ctx), k = Math.min(1, dt * 4);
    S.camT.x += (clamp(P.x * .5, -3.2, 3.2) - S.camT.x) * k; S.camT.z += (clamp(P.z * .35 - 2.6, -4.2, -1.2) - S.camT.z) * k;
    S.netT = Math.max(0, S.netT - dt); S.net.scale.y = 1 + Math.sin(S.netT * 30) * S.netT * .9;
    S.flash = Math.max(0, S.flash - dt); S.board.material.emissiveIntensity = S.flash * 2.4;
    S.ballMat.emissiveIntensity = S.fire ? .6 : 0;
    const hot = inHot(P);
    S.foot.position.set(P.x, .04, P.z); S.foot.material.color.set(hot ? '#ffc93c' : m.pts === 4 ? '#ff5fa2' : m.pts === 3 ? '#7ce0ff' : '#ffffff');
    S.land.scale.setScalar(1 + Math.sin(ctx.elapsed * 14) * .12);
    S.arc.visible = S.needClear && has; S.arc.material.opacity = .55 + Math.sin(ctx.elapsed * 9) * .3;
    if (S.mode === 'rush'){ S.hot.t -= dt; if (S.hot.t <= 0) moveHot(); S.hotM.material.opacity = (S.hot.t < 2 ? .25 : .42) + Math.sin(ctx.elapsed * 6) * .12; }
    /* meter */
    const show = has && !S.needClear; S.meter.style.display = S.mTag.style.display = show ? '' : 'none';
    if (show){
      const [sx, sy] = ctx.screen(P.x + 1.35, 1.6, P.z), x = Math.min(window.innerWidth - 22, Math.max(22, sx)), pc = v => (clamp(v, 0, 1) * 100).toFixed(1) + '%';
      S.meter.style.transform = `translate(${x.toFixed(0)}px,${sy.toFixed(0)}px)`; S.mTag.style.transform = `translate(${x.toFixed(0)}px,${sy.toFixed(0)}px) translateX(-50%)`; S.meter.style.opacity = S.chg ? 1 : .6;
      const z = (el, a, b) => { el.style.bottom = pc(a); el.style.height = pc(clamp(b, 0, 1) - clamp(a, 0, 1)); };
      z(S.mBank, m.tc + m.w, m.tc + m.w * 1.65); z(S.mGreen, m.tc - m.w, m.tc + m.w); z(S.mGold, m.tc - m.w * .38, m.tc + m.w * .38);
      S.mMark.style.bottom = pc(S.chg ? S.chg.c : 0); S.mMark.style.display = S.chg ? '' : 'none';
      const tag = (hot ? '热区 ×2 · ' : '') + m.pts + ' 分' + (S.putT > 0 ? ' · 补篮' : m.contest ? ' · 被贴防' : '');
      if (S.mTag.textContent !== tag) S.mTag.textContent = tag; S.mTag.style.color = m.contest && S.putT <= 0 ? '#ffb3a6' : hot ? '#ffd76a' : '#fff';
    }
    /* button label and the hint line */
    const lab = has ? '投篮' : duel() ? '盖帽' : '跳'; if (lab !== S.lab){ S.lab = lab; ctx.input.label('a', lab); }
    let tip = '';
    if (has && S.needClear) tip = '先把球带出三分线（亮着的那道弧）';
    else if (S.tips && has) tip = ctx.touch ? '在屏幕上往上滑，力量条到绿色松手 ·「变向」甩开防守' : '按住空格蓄力，力量条到绿色松手 · K 变向甩开防守';
    else if (S.tips && duel() && B.st === 'r') tip = ctx.touch ? '贴上去，他头上的球变红时点屏幕起跳盖帽' : '贴上去，他头上的球变红时按空格起跳盖帽';
    else if (B.st === 'loose') tip = '粉色圈是球落下的地方，先到先得';
    ctx.hud.hint(tip);
  }

  const MODES = [
    {id:'rush', name:'计时赛', desc:'60 秒比得分：跑位、甩开防守、抢热区',
      intro:'60 秒能拿多少分。三分线里 2 分、线外 3 分、虚线外 4 分；站在金色热区里出手得分翻倍。蓝色奶娃会贴防，用「变向」横着甩开他。投丢了去抢篮板，补篮 +1。连进三球火力全开。',
      board:{fmt:v => Math.round(v) + ' 分', max:3000}, medals:[100, 60, 30], reward:s => Math.min(40, 3 + s * .33)},
    {id:'duel', name:'斗牛', desc:'75 秒 1 对 1，同一个篮筐轮流进攻',
      intro:'和蓝色奶娃 1 对 1 打 75 秒。谁拿到球谁进攻，换球权要先把球带出三分线，8 秒内要出手。防守时贴住他，他头上的球变红就起跳盖帽。你领先他会认真起来。榜上比净胜分。',
      board:{fmt:v => '净胜 ' + Math.round(v) + ' 分', max:200}, medals:[10, 5, 1], reward:s => (s > 0 ? Math.min(40, 12 + s * 2.4) : 4)}
  ];
  return {
    id:'hoops', name:'奶娃投篮', icon:'🏀', color:'#ff5fa2',
    parts:'hoops',                 // 改装零件掉落表：js/42-tuning.js 的 TN_DROPS.hoops，按奖牌发，结算面板显示（js/93-tuning-ui.js）
    desc:'半场跑位投篮，有防守、篮板和 1 对 1 斗牛',
    modes:MODES,
    controls:{move:true, a:'投篮', b:'变向', swipe:true, help:{
      touch:'左手摇杆跑位 · 右手在屏幕上往上滑出手（也可以按住「投篮」再松开）·「变向」短冲刺',
      key:'WASD 跑位 · 按住空格蓄力、松开出手（也可以按住鼠标往上拖）· K 变向 · P 暂停'}},
    achievements:[['mg_hoops_fire', '火力全开', '奶娃投篮连进三球', 20], ['mg_hoops_100', '百分先生', '奶娃投篮计时赛单局 100 分', 60], ['mg_hoops_duel', '斗牛王', '奶娃投篮斗牛赢一局', 40], ['mg_hoops_block', '钉板大帽', '斗牛里盖掉对手一球', 20]],
    sky:'#1d2229', shadow:20,
    start(ctx){
      const mode = ctx.mode === 'duel' ? 'duel' : 'rush', M = CFG[mode];
      S = {mode, M, t:M.time, score:0, rs:0, streak:0, bestStreak:0, fire:false, made:0, shots:0, swish:0, threes:0, rebs:0, blocks:0, contests:0, ankles:0, bonus:0,
        ball:{st:'p', x:0, y:1, z:0, t:0, last:'p', kind:''}, chg:null, lift:0, dash:null, dashCd:0, stun:0, putT:0, needClear:false, clock:M.clock, warnT:0,
        hot:{x:0, z:0, t:0}, camT:{x:0, y:0, z:-2.6}, netT:0, flash:0, tips:true, lab:'', line:null, passed:false};
      build(ctx); ctx.debug(S);
      ctx.player.show(0, .6, Math.PI); S.R.x = 0; S.R.z = -1; S.R.px = 0; S.R.pz = .6;
      cam(ctx); ctx.camera.snap();
      if (mode === 'rush'){
        S.hotM.visible = true; moveHot();
        /* something to chase: the top of the leaderboard when online, otherwise your own best */
        if (ctx.best > 0) S.line = {v:ctx.best, top:false};
        ctx.board.top(1).then(rows => { if (S && rows[0] && rows[0].value > 0 && (!S.line || rows[0].value >= S.line.v) && !S.passed){ S.line = {v:Math.round(rows[0].value), top:true}; hud(ctx); } }).catch(() => {});
      }
      ctx.hud.time(S.t); hud(ctx); view(0, ctx);
    },
    update(dt, ctx){
      S.t -= dt; ctx.hud.time(S.t);
      if (S.mode === 'rush' && S.t <= 10 && !S.told){ S.told = true; say(ctx, '最后 10 秒', '得分翻倍', '#ffc93c'); }
      player(dt, ctx); rival(dt, ctx); ball(dt, ctx); view(dt, ctx);
      if (duel()) hud(ctx);
      const st = S.ball.st;
      if (S.t <= 0 && st !== 'shot' && st !== 'bank'){                     /* a shot already in the air still counts */
        const pct = S.shots ? Math.round(S.made / S.shots * 100) : 0, line = `投 ${S.shots} 进 ${S.made}（${pct}%）· 三分 ${S.threes} 个 · 篮板 ${S.rebs} 个`;
        if (!duel()){
          if (S.score >= 100) ctx.unlock('mg_hoops_100');
          ctx.finish(S.score, {kicker:'终场哨响', sub:line + ` · 最多连进 ${S.bestStreak} 球`});
        } else {
          const d = S.score - S.rs; if (d > 0) ctx.unlock('mg_hoops_duel');
          ctx.finish(Math.max(0, d), {kicker:d > 0 ? '赢了！' : d < 0 ? '输了' : '打平', title:`🏀 ${S.score} : ${S.rs}`, big:d > 0 ? `净胜 ${d} 分` : d < 0 ? `输 ${-d} 分` : '平局', sub:line + ` · 盖帽 ${S.blocks} 个`});
        }
      }
    },
    stop(){ S = null; }
  };
})());
