/* 小游戏 · 奶娃投篮（B1 室内运动中心）
 * 篮筐挂在滑轨上匀速来回，球只会笔直往前飞，0.6 秒才到。地上有两个圈：橙色实心圈是篮筐现在的位置，
 * 白色虚圈是「球飞到时篮筐会在的位置」。白圈压到奶娃面前的白线时出手，就是空心。
 * 空心 3 分并加时 1 秒，擦筐 2 分；连中 3 个之后「手感火热」每球 +1；最后 10 秒得分翻倍。
 * 每投进一球奶娃换个位置，每进 3 球篮筐滑得更快。45 秒起。
 * 只用一个键（空格 / 点屏幕），示范：ctx.input.pressed、ctx.camera.set 固定镜头、抛物线、粒子、ctx.player.act。
 */
'use strict';
XMini.register((() => {
  const TIME = 45, HZ = -5.2, RIM_Y = 3.05, RIM_R = .46, FLY = .6, G = 26, Z0 = 2.1, Y0 = 2.35, COOL = .42, AMP = 2.9, BONUS_MAX = 15;
  const IN_R = .4, SWISH_R = .16, RIM_OUT = .74;
  let S = null;
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
  /* where the hoop will be t seconds from now (it bounces off the ends of the rail) */
  function future(x, dir, v, t){
    x += dir * v * t;
    for (let i = 0; i < 4 && Math.abs(x) > AMP; i++) x = x > AMP ? 2 * AMP - x : -2 * AMP - x;
    return x;
  }
  function build(ctx){
    const R = ctx.root, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#20262e'})); apron.position.y = -.02; R.add(apron);
    /* wooden court with the painted key under the rail */
    const court = tex(512, 512, g => {
      g.fillStyle = '#b98652'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 16; i++){ g.fillStyle = i % 2 ? 'rgba(90,50,10,.12)' : 'rgba(255,240,210,.07)'; g.fillRect(i * 32, 0, 32, 512); }
      g.strokeStyle = '#f4efe2'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 492);
      g.fillStyle = 'rgba(181,68,42,.6)'; g.fillRect(176, 10, 160, 210); g.strokeRect(176, 10, 160, 210);
      g.beginPath(); g.arc(256, 220, 80, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(256, 60, 330, .32, Math.PI - .32); g.stroke();
    });
    court.anisotropy = ANISO;
    bx(15, .1, 16, new THREE.MeshStandardMaterial({map:court, roughness:.95}), 0, -.03, -.3).castShadow = false;
    /* back wall with the banner, a strip of bleachers on each side */
    bx(15.4, 7, .3, M('#cfc8b8', {roughness:.95}), 0, 3.5, -8.45);
    const banner = tex(1024, 128, g => { g.fillStyle = '#b5442a'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#fff'; g.font = '900 76px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B1 室内运动中心 · 奶娃投篮', 512, 68); });
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.3), new THREE.MeshBasicMaterial({map:banner})); bn.position.set(0, 5.75, -8.28); R.add(bn);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) bx(1.1, .5 + i * .5, 11, M(['#3e6fa3', '#365f8c', '#2e5078'][i], {roughness:.8}), s * (7.9 + i * 1.1), .25 + i * .25, -1.5);
    /* the rail and the hoop that slides along it */
    const steel = M('#59626c', {roughness:.4, metalness:.6});
    bx(9.8, .16, .16, steel, 0, 4.25, HZ - .55); for (const s of [-1, 1]) bx(.18, 4.25, .18, steel, s * 4.9, 2.12, HZ - .55);
    const H = S.hoop = new THREE.Group(); R.add(H);
    box(.12, .5, .12, steel, 0, 4, HZ - .55, H);
    const board = tex(256, 160, g => { g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#c9543a'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 150); g.strokeRect(84, 62, 88, 66); });
    S.board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.12, .08), new THREE.MeshStandardMaterial({map:board, roughness:.5, emissive:'#ff8a3d', emissiveIntensity:0})); S.board.position.set(0, RIM_Y + .42, HZ - .55); S.board.castShadow = true; H.add(S.board);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, .035, 8, 28).rotateX(Math.PI / 2), M('#ff6a2a', {roughness:.4, metalness:.3})); rim.position.set(0, RIM_Y, HZ); rim.castShadow = true; H.add(rim);
    S.net = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R * .62, .55, 12, 3, true), new THREE.MeshBasicMaterial({color:'#ffffff', wireframe:true, transparent:true, opacity:.85})); S.net.position.set(0, RIM_Y - .29, HZ); H.add(S.net);
    /* floor guides: hoop now (orange), hoop when the ball lands (white, dashed), and the straight line the ball flies along */
    S.spot = new THREE.Mesh(new THREE.RingGeometry(.3, RIM_R, 28).rotateX(-Math.PI / 2), gxGlow('#ff8a3d', .75)); S.spot.position.set(0, .04, HZ); R.add(S.spot);
    const dash = tex(128, 128, g => { g.strokeStyle = '#fff'; g.lineWidth = 12; g.setLineDash([22, 14]); g.beginPath(); g.arc(64, 64, 50, 0, 7); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(64, 64, 14, 0, 7); g.fill(); });
    S.ghost = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map:dash, transparent:true, depthWrite:false, opacity:.95})); S.ghost.position.set(0, .06, HZ); R.add(S.ghost);
    S.line = new THREE.Mesh(new THREE.PlaneGeometry(.2, Z0 - HZ + .6).rotateX(-Math.PI / 2), gxGlow('#ffffff', .4)); S.line.position.set(0, .05, (Z0 + HZ) / 2 - .3); R.add(S.line);
    /* balls: a small pool, reused */
    const ballGeo = new THREE.SphereGeometry(.24, 14, 10), ballTex = tex(64, 32, g => { g.fillStyle = '#e8792a'; g.fillRect(0, 0, 64, 32); g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(64, 16); g.moveTo(16, 0); g.lineTo(16, 32); g.moveTo(48, 0); g.lineTo(48, 32); g.stroke(); });
    const ballMat = new THREE.MeshStandardMaterial({map:ballTex, roughness:.7, emissive:'#ff5a1a', emissiveIntensity:0}); S.ballMat = ballMat;
    for (let i = 0; i < 4; i++){ const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true; m.visible = false; R.add(m); S.balls.push({m, on:false}); }
    S.hand = new THREE.Mesh(ballGeo, ballMat); S.hand.castShadow = true; R.add(S.hand);
  }
  function cam(ctx){
    const a = ctx.aspect, k = a < .7 ? 0 : a < 1.15 ? 1 : 2; if (k === S.camK) return; S.camK = k;
    if (k === 0) ctx.camera.set([0, 10.5, 19.5], [0, 2, -3.6], 56); else if (k === 1) ctx.camera.set([0, 8.4, 15.5], [0, 2, -3.4], 54); else ctx.camera.set([0, 6.9, 12.6], [0, 2.1, -3.2], 50);
  }
  function info(ctx){ ctx.hud.info(S.streak > 3 ? `🔥 连中 ×${S.streak}` : S.streak > 1 ? `连中 ×${S.streak}` : ''); S.ballMat.emissiveIntensity = S.streak >= 3 ? .55 : 0; }
  function result(ctx, b, dx){
    const ad = Math.abs(dx), hx = S.hx;
    if (ad < IN_R){
      const swish = ad < SWISH_R;
      S.streak++; S.made++; S.best = Math.max(S.best, S.streak); if (swish) S.swish++;
      let pts = (swish ? 3 : 2) + (S.streak > 3 ? 1 : 0); if (S.t <= 10) pts *= 2;
      S.score += pts; ctx.hud.score(S.score);
      if (S.made === 2) ctx.hud.hint('');
      b.vx = (hx - b.x) * 3; b.vz = -.6; b.vy = Math.min(b.vy, -3); S.netT = .4;
      ctx.noise(.22, .22, 3200, 'highpass');
      const base = 660 * Math.pow(1.122, Math.min(8, S.streak - 1));           /* the chime climbs with the streak */
      ctx.tone('triangle', base, base, .16, .14, .02); if (swish) ctx.tone('triangle', base * 1.5, base * 1.5, .26, .13, .1);
      let sub = swish ? '空心！' : '进了';
      if (swish && S.bonus < BONUS_MAX){ S.bonus++; S.t += 1; sub = '空心！+1 秒'; }
      if (S.streak === 3){ sub = '手感火热！之后每球 +1'; ctx.unlock('mg_hoops_fire'); ctx.sfx.sparkle(); }
      ctx.hud.callout('+' + pts, sub, swish ? '#ffc93c' : undefined);
      const n = ctx.q > 0 ? (swish ? 12 : 7) : 3;
      for (let i = 0; i < n; i++) ctx.part('dust', hx + (Math.random() - .5) * .6, RIM_Y - .3, HZ + (Math.random() - .5) * .4, .42, {vx:(Math.random() - .5) * 3.5, vy:1 + Math.random() * 2.5, vz:(Math.random() - .5) * 2, g:6, life:.7, op:.95, color:swish ? '#ffe28a' : '#ffffff'});
      if (swish) ctx.camera.shake(.1);
      /* 奶娃 shuffles to a new spot so the rhythm changes every basket; the hoop speeds up every third one */
      let nx; do { nx = (Math.random() * 2 - 1) * 2.3; } while (Math.abs(nx - S.px) < .9); S.pxTo = nx;
      const v = Math.min(6, 3 + Math.floor(S.made / 3) * .35);
      if (v > S.v + .01){ S.v = v; ctx.after(.7, () => ctx.hud.callout('加速', '篮筐滑得更快了', '#7c8cff')); }
    } else {
      const fire = S.streak >= 3; S.streak = 0;
      if (ad < RIM_OUT){
        b.vy = 4.8; b.vx = Math.sign(dx || 1) * 3.2; b.vz = 2.2; S.flash = .25; ctx.tone('square', 190, 120, .14, .11); ctx.noise(.08, .12, 900); ctx.camera.shake(.16);
        ctx.hud.callout('弹筐', fire ? '手感断了' : dx * S.dir > 0 ? '出手早了一点' : '出手晚了一点', '#b8c2cc');
      } else {
        ctx.tone('sawtooth', 260, 150, .22, .07);
        ctx.hud.callout('三不沾', fire ? '手感断了' : dx * S.dir > 0 ? '出手太早' : '出手太晚', '#b8c2cc');
      }
    }
    info(ctx);
  }
  return {
    id:'hoops', name:'奶娃投篮', icon:'🏀', color:'#ff5fa2',
    desc:'篮筐会滑，球只会直飞，看准时机出手',
    intro:'篮筐在滑轨上来回滑，球笔直往前飞。看地上的白色虚圈：它压到奶娃面前的白线时出手，就是空心。空心 3 分还加时 1 秒，擦筐 2 分，连中三球之后每球再 +1，最后 10 秒得分翻倍。',
    controls:{move:false, a:'投篮', tap:true},
    board:{fmt:v => Math.round(v) + ' 分', max:2000},
    medals:[110, 75, 40],
    reward:s => Math.min(40, 3 + s * .3),
    achievements:[['mg_hoops_fire', '手感火热', '奶娃投篮连中三球', 20], ['mg_hoops_100', '百分先生', '奶娃投篮单局 100 分', 60]],
    sky:'#1d2229', shadow:18,
    start(ctx){
      S = {t:TIME, score:0, streak:0, best:0, made:0, swish:0, shots:0, cool:0, bonus:0, hx:(Math.random() * 2 - 1) * 2, dir:Math.random() < .5 ? -1 : 1, v:3,
        px:0, pxTo:0, netT:0, flash:0, camK:-1, balls:[], told:false};
      build(ctx); cam(ctx);
      ctx.player.show(0, Z0 + .7, Math.PI);
      ctx.hud.time(TIME); ctx.hud.score(0); ctx.hud.hint(ctx.touch ? '白色虚圈压到白线时，点屏幕出手' : '白色虚圈压到白线时，按空格出手');
    },
    update(dt, ctx){
      S.t -= dt; ctx.hud.time(S.t); cam(ctx);
      if (S.t <= 10){
        if (!S.told){ S.told = true; ctx.hud.callout('最后 10 秒', '得分翻倍', '#ffc93c'); ctx.hud.hint(''); }
      } else S.told = false;
      /* hoop on the rail, the two floor rings, 奶娃 sliding to her next spot */
      S.hx += S.dir * S.v * dt; if (Math.abs(S.hx) > AMP){ S.hx = Math.sign(S.hx) * (2 * AMP - Math.abs(S.hx)); S.dir = -S.dir; }
      S.hoop.position.x = S.hx; S.spot.position.x = S.hx; S.ghost.position.x = future(S.hx, S.dir, S.v, FLY);
      S.px += (S.pxTo - S.px) * Math.min(1, dt * 8); ctx.player.x = S.px; ctx.player.h = Math.PI; S.line.position.x = S.px;
      const lined = Math.abs(S.ghost.position.x - S.px);
      S.line.material.opacity = lined < IN_R ? .85 : .4; S.ghost.material.color.set(lined < SWISH_R ? '#ffe28a' : '#ffffff');
      S.netT = Math.max(0, S.netT - dt); S.net.scale.y = 1 + Math.sin(S.netT * 30) * S.netT * .9;
      S.flash = Math.max(0, S.flash - dt); S.board.material.emissiveIntensity = S.flash * 2.4;
      /* shoot */
      S.cool -= dt;
      const ready = S.cool <= 0 && S.t > 0 && Math.abs(S.pxTo - S.px) < .12;
      S.hand.visible = ready; if (ready) S.hand.position.set(S.px + .34, 1.75 + ctx.player.y, Z0 + .35);
      if (ctx.input.pressed('a') && ready){
        const b = S.balls.find(x => !x.on);
        if (b){
          Object.assign(b, {on:true, t:0, x:S.px, y:Y0, z:Z0, vx:0, vy:(RIM_Y - Y0) / FLY + .5 * G * FLY, vz:(HZ - Z0) / FLY, judged:false, life:0});
          b.m.visible = true; S.cool = COOL; S.shots++; ctx.player.act('jump'); ctx.tone('sine', 300, 560, .12, .12);
        }
      }
      for (const b of S.balls){
        if (!b.on) continue;
        b.t += dt; b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (!b.judged && b.t >= FLY){ b.judged = true; b.y = RIM_Y; b.z = HZ; result(ctx, b, b.x - S.hx); }
        if (b.judged){
          if (b.z < HZ - .5 && b.vz < 0){ b.vz = 2.4; ctx.tone('square', 150, 110, .08, .06); }       /* off the wall or the backboard */
          if (b.y < .24 && b.vy < 0){ b.y = .24; b.vy *= -.5; b.vx *= .7; b.vz *= .7; if (Math.abs(b.vy) > 1.5) ctx.sfx.thud(.12); }
          b.life += dt; if (b.life > 1.5){ b.on = false; b.m.visible = false; }
        }
        b.m.position.set(b.x, b.y, b.z); b.m.rotation.x -= dt * 9;
        if (!b.judged && ctx.q > 0 && Math.random() < dt * (S.streak >= 3 ? 60 : 24)) ctx.part('dust', b.x, b.y, b.z, S.streak >= 3 ? .55 : .3, {vy:.6, life:.35, op:.8, color:S.streak >= 3 ? '#ff8a3d' : '#ffffff', grow:.8});
      }
      if (S.t <= 0 && !S.balls.some(b => b.on && !b.judged)){
        const pct = S.shots ? Math.round(S.made / S.shots * 100) : 0;
        if (S.score >= 100) ctx.unlock('mg_hoops_100');
        ctx.finish(S.score, {kicker:'终场哨响', sub:`投 ${S.shots} 进 ${S.made}（${pct}%）· 空心 ${S.swish} 个 · 最多连中 ${S.best} 球`});
      }
    },
    stop(){ S = null; }
  };
})());
