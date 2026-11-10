/* 小游戏 · 奶娃投篮（B1 室内运动中心）
 * 篮筐挂在滑轨上左右移动，球只会笔直往前飞，要 0.8 秒才到：看准篮筐快滑到奶娃正前方时出手。
 * 空心 3 分，擦筐 2 分；连中 3 个之后「手感火热」每球 +1；最后 10 秒得分翻倍。每投进一球奶娃换个位置。45 秒。
 * 只用一个键（空格 / 点屏幕），示范：ctx.input.pressed、ctx.camera.set 固定镜头、抛物线、粒子、ctx.player.act。
 */
'use strict';
XMini.register((() => {
  const TIME = 45, HZ = -5.2, RIM_Y = 3.05, RIM_R = .46, FLY = .8, G = 20, Z0 = 2.1, Y0 = 2.35, COOL = .5, RANGE = 3.1;
  let S = null;
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };

  function build(ctx){
    const R = ctx.root, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#20262e'})); apron.position.y = -.02; R.add(apron);
    /* wooden court with the painted key under the rail */
    const court = tex(512, 512, g => {
      g.fillStyle = '#d7a868'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 16; i++){ g.fillStyle = i % 2 ? 'rgba(120,70,20,.10)' : 'rgba(255,255,255,.06)'; g.fillRect(i * 32, 0, 32, 512); }
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 492);
      g.fillStyle = 'rgba(181,68,42,.55)'; g.fillRect(176, 10, 160, 210); g.strokeRect(176, 10, 160, 210);
      g.beginPath(); g.arc(256, 220, 80, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(256, 60, 330, .32, Math.PI - .32); g.stroke();
    });
    court.anisotropy = ANISO;
    bx(14, .1, 15, new THREE.MeshStandardMaterial({map:court, roughness:.55}), 0, -.03, -.5).castShadow = false;
    /* back wall with the banner */
    bx(14.4, 5.2, .3, M('#e9e2d2', {roughness:.9}), 0, 2.6, -8.15);
    const banner = tex(1024, 128, g => { g.fillStyle = '#b5442a'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#fff'; g.font = '900 76px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B1 室内运动中心 · 奶娃投篮', 512, 68); });
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), new THREE.MeshBasicMaterial({map:banner})); bn.position.set(0, 4.45, -7.98); R.add(bn);
    /* the rail and the hoop that slides along it */
    const steel = M('#59626c', {roughness:.4, metalness:.6});
    bx(9.6, .16, .16, steel, 0, 4.25, HZ - .55); for (const s of [-1, 1]) bx(.18, 4.25, .18, steel, s * 4.8, 2.12, HZ - .55);
    const H = S.hoop = new THREE.Group(); R.add(H);
    box(.12, .5, .12, steel, 0, 4, HZ - .55, H);
    const board = tex(256, 160, g => { g.fillStyle = '#f7f7f4'; g.fillRect(0, 0, 256, 160); g.strokeStyle = '#c9543a'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 150); g.strokeRect(84, 62, 88, 66); });
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.12, .08), new THREE.MeshStandardMaterial({map:board, roughness:.5})); bb.position.set(0, RIM_Y + .42, HZ - .55); bb.castShadow = true; H.add(bb);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, .035, 8, 28).rotateX(Math.PI / 2), M('#ff6a2a', {roughness:.4, metalness:.3})); rim.position.set(0, RIM_Y, HZ); rim.castShadow = true; H.add(rim);
    S.net = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R * .62, .55, 12, 3, true), new THREE.MeshBasicMaterial({color:'#ffffff', wireframe:true, transparent:true, opacity:.85})); S.net.position.set(0, RIM_Y - .29, HZ); H.add(S.net);
    /* floor guides: where the hoop is, and the straight line the ball will fly along */
    S.spot = new THREE.Mesh(new THREE.RingGeometry(.3, RIM_R, 28).rotateX(-Math.PI / 2), gxGlow('#ff8a3d', .7)); S.spot.position.set(0, .04, HZ); R.add(S.spot);
    S.line = new THREE.Mesh(new THREE.PlaneGeometry(.16, Z0 - HZ).rotateX(-Math.PI / 2), gxGlow('#ffffff', .28)); S.line.position.set(0, .04, (Z0 + HZ) / 2); R.add(S.line);
    /* balls: a small pool, reused */
    const ballGeo = new THREE.SphereGeometry(.24, 14, 10), ballTex = tex(64, 32, g => { g.fillStyle = '#e8792a'; g.fillRect(0, 0, 64, 32); g.strokeStyle = '#3a2412'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(64, 16); g.moveTo(16, 0); g.lineTo(16, 32); g.moveTo(48, 0); g.lineTo(48, 32); g.stroke(); });
    for (let i = 0; i < 4; i++){ const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({map:ballTex, roughness:.7})); m.castShadow = true; m.visible = false; R.add(m); S.balls.push({m, on:false}); }
    S.hand = new THREE.Mesh(ballGeo, S.balls[0].m.material); S.hand.castShadow = true; R.add(S.hand);
  }
  function cam(ctx){
    const a = ctx.aspect, k = a < .7 ? 0 : a < 1.15 ? 1 : 2; if (k === S.camK) return; S.camK = k;
    if (k === 0) ctx.camera.set([0, 8.6, 17.5], [0, 2.3, -3.4], 56); else if (k === 1) ctx.camera.set([0, 6.6, 13], [0, 2.3, -3.2], 54); else ctx.camera.set([0, 5.2, 10.2], [0, 2.3, -3], 50);
  }
  function result(ctx, b, dx){
    const made = Math.abs(dx) < .4, swish = Math.abs(dx) < .17, hx = S.hoop.position.x;
    if (made){
      S.streak++; S.made++; S.best = Math.max(S.best, S.streak);
      let pts = (swish ? 3 : 2) + (S.streak > 3 ? 1 : 0); if (S.t <= 10) pts *= 2;
      S.score += pts; ctx.hud.score(S.score);
      b.vx = (hx - b.x) * 3; b.vz = -.6; b.vy = Math.min(b.vy, -3); S.netT = .35;
      ctx.noise(.22, .2, 3200, 'highpass'); ctx.tone('triangle', swish ? 1320 : 990, swish ? 1760 : 1100, .2, .13, .03);
      ctx.hud.callout('+' + pts, swish ? '空心！' : S.streak > 3 ? '手感火热' : '进了', swish ? '#ffc93c' : undefined);
      const n = ctx.q > 0 ? 8 : 3; for (let i = 0; i < n; i++) ctx.part('dust', hx + (Math.random() - .5) * .6, RIM_Y - .3, HZ + (Math.random() - .5) * .4, .4, {vx:(Math.random() - .5) * 3, vy:1 + Math.random() * 2, vz:(Math.random() - .5) * 2, g:6, life:.7, op:.95, color:swish ? '#ffe28a' : '#ffffff'});
      if (S.streak === 3) ctx.unlock('mg_hoops_fire');
      /* 奶娃 shuffles to a new spot, so the rhythm changes every basket */
      let nx; do { nx = (Math.random() * 2 - 1) * 2.4; } while (Math.abs(nx - S.px) < .9); S.pxTo = nx;
      const lv = Math.floor(S.made / 4); S.w = Math.min(3.1, 1.25 + lv * .22); S.amp = Math.min(RANGE, 2.3 + lv * .12);
    } else {
      S.streak = 0;
      if (Math.abs(dx) < .72){ b.vy = 4.5; b.vx = Math.sign(dx || 1) * -3.2; b.vz = 2.2; ctx.tone('square', 190, 120, .12, .1); ctx.camera.shake(.12); ctx.hud.callout('弹筐', '差一点'); }
    }
    ctx.hud.info(S.streak > 3 ? `🔥 连中 ×${S.streak}` : S.streak > 1 ? `连中 ×${S.streak}` : '');
  }
  return {
    id:'hoops', name:'奶娃投篮', icon:'🏀', color:'#ff5fa2',
    desc:'篮筐会滑，球只会直飞，看准时机出手',
    intro:'篮筐在滑轨上左右移动，球笔直往前飞，要 0.8 秒才到。篮筐快滑到奶娃正前方的白线时出手。空心 3 分，擦筐 2 分，连中三个之后每球再 +1，最后 10 秒得分翻倍。',
    controls:{move:false, a:'投篮', tap:true},
    board:{fmt:v => Math.round(v) + ' 分', max:2000},
    medals:[60, 38, 18],
    reward:s => Math.min(45, 4 + s * .55),
    achievements:[['mg_hoops_fire', '手感火热', '奶娃投篮连中三球', 20]],
    sky:'#1d2229', shadow:18,
    start(ctx){
      S = {t:TIME, score:0, streak:0, best:0, made:0, shots:0, cool:0, ph:Math.random() * 6, w:1.25, amp:2.3, px:0, pxTo:0, netT:0, camK:-1, balls:[], told:false};
      build(ctx); cam(ctx);
      ctx.player.show(0, Z0 + .7, Math.PI);
      ctx.hud.time(TIME); ctx.hud.score(0); ctx.hud.hint(ctx.touch ? '篮筐快到白线时点屏幕出手' : '篮筐快到白线时按空格出手');
    },
    update(dt, ctx){
      S.t -= dt; ctx.hud.time(S.t); cam(ctx);
      if (!S.told && S.t <= 10){ S.told = true; ctx.hud.callout('最后 10 秒', '得分翻倍', '#ffc93c'); ctx.hud.hint(''); }
      /* hoop on the rail, 奶娃 sliding to her next spot */
      S.ph += dt * S.w; const hx = Math.sin(S.ph) * S.amp; S.hoop.position.x = hx; S.spot.position.x = hx;
      S.px += (S.pxTo - S.px) * Math.min(1, dt * 7); ctx.player.x = S.px; ctx.player.h = Math.PI; S.line.position.x = S.px;
      S.netT = Math.max(0, S.netT - dt); S.net.scale.y = 1 + Math.sin(S.netT * 30) * S.netT * .9;
      /* shoot */
      S.cool -= dt;
      const ready = S.cool <= 0 && S.t > 0 && Math.abs(S.pxTo - S.px) < .15;
      S.hand.visible = ready; if (ready) S.hand.position.set(S.px + .34, 1.75 + ctx.player.y, Z0 + .35);
      if (ctx.input.pressed('a') && ready){
        const b = S.balls.find(x => !x.on);
        if (b){
          Object.assign(b, {on:true, t:0, x:S.px, y:Y0, z:Z0, vx:0, vy:(RIM_Y - Y0) / FLY + .5 * G * FLY, vz:(HZ - Z0) / FLY, judged:false, life:0});
          b.m.visible = true; S.cool = COOL; S.shots++; ctx.player.act('jump'); ctx.tone('sine', 300, 540, .13, .12);
        }
      }
      for (const b of S.balls){
        if (!b.on) continue;
        b.t += dt; b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (!b.judged && b.t >= FLY){ b.judged = true; b.y = RIM_Y; b.z = HZ; result(ctx, b, b.x - S.hoop.position.x); }
        if (b.judged){
          if (b.z < HZ - .5 && b.vz < 0){ b.vz = 2.4; ctx.tone('square', 150, 110, .08, .06); }       /* off the wall or the backboard */
          if (b.y < .24 && b.vy < 0){ b.y = .24; b.vy *= -.5; b.vx *= .7; b.vz *= .7; if (Math.abs(b.vy) > 1.5) ctx.sfx.thud(.12); }
          b.life += dt; if (b.life > 1.6){ b.on = false; b.m.visible = false; }
        }
        b.m.position.set(b.x, b.y, b.z); b.m.rotation.x -= dt * 9;
        if (S.streak > 3 && !b.judged && ctx.q > 0 && Math.random() < dt * 40) ctx.part('dust', b.x, b.y, b.z, .5, {vy:1, life:.4, op:.9, color:'#ff8a3d', grow:.8});
      }
      if (S.t <= 0 && !S.balls.some(b => b.on && !b.judged)){
        const pct = S.shots ? Math.round(S.made / S.shots * 100) : 0;
        ctx.finish(S.score, {kicker:'终场哨响', sub:`投 ${S.shots} 进 ${S.made}（${pct}%）· 最多连中 ${S.best} 球`});
      }
    },
    stop(){ S = null; }
  };
})());
