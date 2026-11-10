/* 小游戏 · 食堂端盘子（D6 午高峰）
 * 奶娃在打饭窗口（下边）和餐桌（上边）之间来回：端饭上去，再把空盘子送回来，每送到一趟得分。
 * 中间五条过道全是横着走的同学，撞上就洒一盘，三盘洒完或者 60 秒到了就结束。
 * 加分：连着送到（连送）、5 秒内送到（趁热）、贴着同学身边穿过去（擦肩）。每送一趟同学走得更快，
 * 送到第 4 趟之后还会有赶着上课的同学冲过去（过道边先亮红色感叹号）。
 * 只用摇杆（键盘 WASD，Shift 跑），示范：ctx.player 走路、ctx.camera.fit 固定俯视、InstancedMesh 人群、HUD、结算。
 */
'use strict';
XMini.register((() => {
  const HX = 8.4, GOAL = 7.6, EDGE = 8.7, SPAN = 12, LANES = [5.6, 2.8, 0, -2.8, -5.6], TIME = 60, HIT = .6, NEAR = 1.2, N = 40, SC = 1.5;
  const SHIRTS = ['#3fd6c6', '#ffc93c', '#7c8cff', '#ff8a3d', '#f4f2ec', '#ff5fa2', '#8bc34a', '#5c6bc0'];
  const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), col = new THREE.Color();
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
  const FONT = '"Noto Sans SC","Microsoft YaHei",sans-serif';
  let S = null;

  /* a lane: students with uneven gaps (never under 3 m, so there is always a way through) */
  function fillLane(lane){
    let x = -SPAN + Math.random() * 3;
    while (x < SPAN - 3){ lane.xs.push(x); lane.ph.push(Math.random() * 6); lane.id.push(S.nextId++); x += 3 + Math.random() * 3.6; }
  }
  function addStudent(lane){
    const xs = lane.xs.slice().sort((a, b) => a - b); let best = 0, gap = -1;
    for (let i = 0; i < xs.length; i++){ const a = xs[i], b = i + 1 < xs.length ? xs[i + 1] : xs[0] + SPAN * 2; if (b - a > gap){ gap = b - a; best = a + (b - a) / 2; } }
    if (gap < 6.2) return false;
    if (best > SPAN) best -= SPAN * 2;
    lane.xs.push(best); lane.ph.push(Math.random() * 6); lane.id.push(S.nextId++); return true;
  }
  function build(ctx){
    const R = ctx.root, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#2e2823'})); floor.position.y = -.02; R.add(floor);
    const tile = tex(128, 128, g => { g.fillStyle = '#cdbd9c'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#c2b08c'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); });
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(10, 12);
    bx(HX * 2 + 3, .1, 24, new THREE.MeshStandardMaterial({map:tile, roughness:.95}), 0, -.03, 0).castShadow = false;
    /* the five aisles the crowd walks along, darker so the safe strips between them read at a glance */
    const aisle = M('#a08a66', {roughness:.95});
    for (const z of LANES) bx(HX * 2 + 3, .02, 1.5, aisle, 0, .03, z).castShadow = false;
    /* the two ends, named on the floor */
    const decal = (text, color, z) => {
      const t = tex(512, 96, g => { g.fillStyle = color; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = '900 58px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:.92})); m.position.set(0, .045, z); R.add(m);
    };
    decal('D6 食堂 · 打饭窗口', '#b5442a', 8.75); decal('餐桌 · 送到这里', '#2f8f5a', -8.75);
    /* serving counter (south) with food pans, tables and stools (north) */
    bx(15, 1, 1.1, M('#aeb4ba', {roughness:.35, metalness:.5}), 0, .5, 10.6);
    ['#e2b04a', '#c9543a', '#6fae4d', '#e9dfc4', '#a9703f', '#e88f3a'].forEach((c, i) => bx(1.7, .12, .7, M(c, {roughness:.8}), -5.6 + i * 2.25, 1.06, 10.6));
    const top = M('#a87a4c', {roughness:.7}), stool = new THREE.InstancedMesh(new THREE.CylinderGeometry(.26, .26, .5, 10), M('#3e6fa3', {roughness:.7}), 16);
    let k = 0;
    for (let i = 0; i < 4; i++){
      const x = -6 + i * 4; bx(2.4, .1, 1.2, top, x, .78, -10.7); bx(.2, .74, .2, M('#6c757d'), x, .37, -10.7);
      for (const [dx, dz] of [[-.7, -1], [.7, -1], [-.7, 1], [.7, 1]]){ m4.makeTranslation(x + dx, .25, -10.7 + dz); stool.setMatrixAt(k++, m4); }
    }
    stool.castShadow = true; R.add(stool);
    /* where to go next: a glowing strip that jumps between the two ends */
    S.goal = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 3, 1.9).rotateX(-Math.PI / 2), gxGlow('#4fd18b', .5)); S.goal.position.y = .06; R.add(S.goal);
    /* warning mark for the sprinter */
    const bang = tex(64, 64, g => { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 48px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 35); });
    S.warn = new THREE.Sprite(new THREE.SpriteMaterial({map:bang, depthTest:false, transparent:true})); S.warn.scale.setScalar(1.7); S.warn.visible = false; R.add(S.warn);
    /* the crowd: body, head and two legs per student, all instanced; the last slot is the sprinter in red */
    const has = typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined';
    const bodyGeo = has ? npcBodyGeo : new THREE.BoxGeometry(.4, .62, .26).translate(0, 1.17, 0), headGeo = has ? npcHeadGeo : new THREE.SphereGeometry(.15, 10, 8).translate(0, 1.62, 0);
    const legGeo = has ? npcLegGeo : new THREE.BoxGeometry(.13, .8, .15).translate(0, -.4, 0);
    S.body = new THREE.InstancedMesh(bodyGeo, M('#ffffff', {roughness:.8}), N); S.head = new THREE.InstancedMesh(headGeo, M('#e8b98f', {roughness:.7}), N);
    S.legL = new THREE.InstancedMesh(legGeo, M('#2a3350', {roughness:.8, vertexColors:has}), N); S.legR = new THREE.InstancedMesh(legGeo, S.legL.material, N);
    for (let i = 0; i < N; i++) S.body.setColorAt(i, col.set(SHIRTS[i % SHIRTS.length]));
    S.ims = [S.body, S.head, S.legL, S.legR];
    for (const im of S.ims){ im.castShadow = true; im.frustumCulled = false; im.count = 0; R.add(im); }
    /* the tray 奶娃 carries: food on the way up, empty plates on the way back */
    S.tray = new THREE.Group(); R.add(S.tray);
    box(.95, .05, .62, M('#d94f3d', {roughness:.6}), 0, 0, 0, S.tray);
    S.food = new THREE.Group(); S.plates = new THREE.Group(); S.tray.add(S.food, S.plates);
    box(.32, .16, .32, M('#f6f0dc'), -.24, .1, 0, S.food); box(.28, .13, .28, M('#c9543a'), .14, .09, -.13, S.food); box(.26, .11, .24, M('#6fae4d'), .17, .08, .17, S.food);
    for (let i = 0; i < 3; i++) box(.44, .04, .44, M('#f4f2ec', {roughness:.4}), 0, .05 + i * .05, 0, S.plates);
  }
  function put(n, x, z, dir, w, lean){
    const sw = Math.sin(w) * .38, y = Math.abs(Math.cos(w)) * .05;
    mA.makeRotationY(dir > 0 ? Math.PI / 2 : -Math.PI / 2); mA.setPosition(x, y, z); mB.makeScale(SC, SC, SC); mA.multiply(mB);
    if (lean){ mB.makeRotationX(lean); mA.multiply(mB); }
    S.body.setMatrixAt(n, mA); S.head.setMatrixAt(n, mA);
    mB.makeRotationX(sw); mB.setPosition(.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legL.setMatrixAt(n, m4);
    mB.makeRotationX(-sw); mB.setPosition(-.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legR.setMatrixAt(n, m4);
  }
  function hud(ctx){
    ctx.hud.score(S.score);
    ctx.hud.info('♥'.repeat(S.lives) + '♡'.repeat(3 - S.lives) + (S.streak > 1 ? ` · 连送 ×${S.streak}` : ''));
    ctx.hud.hint(S.dir < 0 ? '把饭端到上面的餐桌' : '把空盘子送回下面的窗口');
    S.goal.position.z = S.dir < 0 ? -EDGE : EDGE; S.food.visible = S.dir < 0; S.plates.visible = S.dir > 0;
  }
  function spill(ctx, P){
    S.lives--; S.hits++; S.streak = 0; S.inv = 1.6; S.stun = .45; ctx.camera.shake(.6); ctx.sfx.thud(.7); ctx.noise(.25, .3, 2600, 'highpass'); ctx.tone('sawtooth', 320, 130, .32, .1);
    const n = ctx.q > 0 ? 16 : 6, c = S.dir < 0 ? ['#e2b04a', '#c9543a', '#6fae4d'] : ['#f4f2ec', '#e8e4da', '#ffffff'];
    for (let i = 0; i < n; i++) ctx.part('dust', P.x + (Math.random() - .5), 1.2, P.z + (Math.random() - .5), .5, {vx:(Math.random() - .5) * 7, vy:3 + Math.random() * 4, vz:(Math.random() - .5) * 7, g:15, life:.9, op:.95, color:c[i % 3]});
    ctx.hud.callout(S.dir < 0 ? '洒了！' : '盘子碎了！', S.lives > 0 ? `还剩 ${S.lives} 盘，回去重新来` : '', '#ff6f61');
    P.act('jump');
  }
  return {
    id:'canteen', name:'食堂端盘子', icon:'🍛', color:'#ff8a3d',
    desc:'D6 午高峰，端着盘子穿过人群',
    intro:'把饭从打饭窗口端到餐桌，再把空盘子送回来，每送到一趟得分。连着送到、5 秒内送到、贴着同学身边穿过去都有加分。撞到同学就洒一盘，三盘洒完就结束。',
    controls:{move:true},
    board:{fmt:v => Math.round(v) + ' 分', max:5000},
    medals:[240, 150, 80],
    reward:s => Math.min(40, 3 + s * .12),
    achievements:[['mg_canteen_clean', '一滴没洒', '食堂端盘子一局没撞到人，还拿到 150 分', 40]],
    sky:'#231e1a', shadow:20,
    start(ctx){
      S = {t:TIME, score:0, lives:3, streak:0, trips:0, dir:-1, level:0, inv:0, stun:0, hits:0, nextId:1, lanes:[], seen:new Set(), near:0, tripT:0,
        run:{on:false, cd:0, warn:0, lane:0, dir:1, x:0, w:0}};
      build(ctx);
      LANES.forEach((z, i) => { const lane = {z, dir:i % 2 ? 1 : -1, v:2 + Math.random() * 1.2 + (i === 2 ? 1 : 0), xs:[], ph:[], id:[]}; S.lanes.push(lane); fillLane(lane); });
      ctx.player.show(0, EDGE, Math.PI);
      ctx.camera.fit({w:HX * 2 + 3.4, d:23, pitch:.92, fov:50});
      ctx.hud.time(TIME); hud(ctx);
    },
    update(dt, ctx){
      S.t -= dt; S.tripT += dt; ctx.hud.time(S.t);
      const P = ctx.player, speed = 1 + Math.min(1.2, S.level * .055);
      S.stun -= dt; if (S.stun <= 0) P.walk(dt, {speed:6, runSpeed:9.5, minX:-HX, maxX:HX, minZ:-9.1, maxZ:9.1});
      /* students walk, wrap around; note the closest call in each lane 奶娃 is crossing */
      let n = 0, hit = false;
      const judge = (x, z, id) => {
        const dz = Math.abs(z - P.z); if (dz > HIT) return;
        const dx = Math.abs(x - P.x);
        if (dx < HIT) hit = true;
        else if (dx < NEAR && !S.seen.has(id) && S.inv <= 0){ S.seen.add(id); S.near++; ctx.tone('triangle', 1250, 1600, .07, .07); if (ctx.q > 0) ctx.part('dust', (x + P.x) / 2, 1.6, z, .5, {vy:1.5, life:.4, op:.9, color:'#ffe28a', grow:1}); }
      };
      for (const L of S.lanes) for (let i = 0; i < L.xs.length && n < N - 1; i++){
        let x = L.xs[i] + L.dir * L.v * speed * dt; if (x > SPAN) x -= SPAN * 2; else if (x < -SPAN) x += SPAN * 2; L.xs[i] = x;
        put(n++, x, L.z, L.dir, L.ph[i] += dt * L.v * speed * 2.4, 0);
        judge(x, L.z, L.id[i]);
      }
      /* the student who is late for class: a red warning at the edge of an aisle, then a sprint */
      const Rn = S.run;
      if (S.trips >= 4){
        if (!Rn.on && Rn.warn <= 0){ Rn.cd -= dt; if (Rn.cd <= 0){ Rn.lane = (Math.random() * LANES.length) | 0; Rn.dir = Math.random() < .5 ? -1 : 1; Rn.warn = .9; Rn.id = S.nextId++; ctx.tone('square', 880, 880, .09, .09); ctx.tone('square', 880, 880, .09, .09, .18); } }
        else if (Rn.warn > 0){ Rn.warn -= dt; if (Rn.warn <= 0){ Rn.on = true; Rn.x = -Rn.dir * (SPAN + 1); } }
        else { Rn.x += Rn.dir * 10.5 * dt; Rn.w += dt * 22; if (Math.abs(Rn.x) > SPAN + 1.5){ Rn.on = false; Rn.cd = 4 + Math.random() * 4; } }
      }
      S.warn.visible = Rn.warn > 0 && Math.floor(Rn.warn * 9) % 2 === 0;
      if (S.warn.visible) S.warn.position.set(-Rn.dir * (HX + .6), 1.6, LANES[Rn.lane]);
      if (Rn.on){ put(N - 1, Rn.x, LANES[Rn.lane], Rn.dir, Rn.w, .28); judge(Rn.x, LANES[Rn.lane], Rn.id); } else { m4.makeScale(0, 0, 0); for (const im of S.ims) im.setMatrixAt(N - 1, m4); }
      if (!S.redSet){ S.redSet = true; S.body.setColorAt(N - 1, col.set('#e5352b')); S.body.instanceColor.needsUpdate = true; }
      for (const im of S.ims){ im.count = N; im.instanceMatrix.needsUpdate = true; }
      for (let i = n; i < N - 1; i++){ m4.makeScale(0, 0, 0); for (const im of S.ims) im.setMatrixAt(i, m4); }
      /* tray in front of 奶娃; she blinks while safe after a spill */
      S.inv -= dt; P.visible = S.inv <= 0 || Math.floor(S.inv * 12) % 2 === 0;
      S.tray.visible = P.visible;
      S.tray.position.set(P.x + Math.sin(P.h) * .66, 1.24 + P.y, P.z + Math.cos(P.h) * .66); S.tray.rotation.y = P.h;
      S.goal.material.opacity = .34 + Math.sin(ctx.elapsed * 5) * .16;
      if (hit && S.inv <= 0){
        spill(ctx, P);
        if (S.lives <= 0){ hud(ctx); ctx.finish(S.score, {kicker:'洒光了', sub:`送到 ${S.trips} 趟，擦肩 ${S.nearAll || 0} 次`}); return; }
        P.z = S.dir < 0 ? EDGE : -EDGE; S.seen.clear(); S.near = 0; S.tripT = 0; hud(ctx);
      }
      /* reached the far end */
      if ((S.dir < 0 && P.z < -GOAL) || (S.dir > 0 && P.z > GOAL)){
        const hot = S.tripT < 5 ? 3 : 0, close = S.near * 2, gain = 10 + Math.min(5, S.streak) * 2 + hot + close;
        S.score += gain; S.trips++; S.streak++; S.level++; S.dir = -S.dir; S.nearAll = (S.nearAll || 0) + S.near;
        if (S.level % 2 === 0) addStudent(S.lanes[(Math.random() * S.lanes.length) | 0]);
        const base = 660 * Math.pow(1.122, Math.min(8, S.streak - 1));
        ctx.tone('triangle', base, base, .16, .15); ctx.tone('triangle', base * 1.5, base * 1.5, .3, .13, .1);
        const tags = []; if (S.streak > 1) tags.push(`连送 ×${S.streak}`); if (hot) tags.push('趁热 +3'); if (close) tags.push(`擦肩 +${close}`);
        ctx.hud.callout('+' + gain, tags.join(' · ') || (S.dir > 0 ? '送到了，把空盘子带回去' : '盘子还了，再端一份'), close ? '#ffc93c' : undefined);
        if (ctx.q > 0) for (let i = 0; i < 6; i++) ctx.part('heart', P.x + (Math.random() - .5) * 3, 2 + Math.random(), P.z + (Math.random() - .5) * 2, .9, {vy:2.4, life:1.1, op:1, color:'#ff6fa3'});
        if (S.trips === 4) ctx.after(.9, () => ctx.hud.callout('小心', '有同学赶着上课，过道边亮红色感叹号', '#ff6f61'));
        S.seen.clear(); S.near = 0; S.tripT = 0; hud(ctx);
      }
      if (S.t <= 0){
        if (S.hits === 0 && S.score >= 150) ctx.unlock('mg_canteen_clean');
        ctx.finish(S.score, {kicker:'下课铃响了', sub:`送到 ${S.trips} 趟，擦肩 ${S.nearAll || 0} 次` + (S.hits ? `，洒了 ${S.hits} 盘` : '，一滴没洒')});
      }
    },
    stop(){ S = null; }
  };
})());
