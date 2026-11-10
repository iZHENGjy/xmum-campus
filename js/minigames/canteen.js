/* 小游戏 · 食堂端盘子（D6 午高峰）
 * 奶娃在打饭窗口（下边）和餐桌（上边）之间来回：端饭上去，再把空盘子送回来，每送到一趟得分。
 * 中间五条过道全是横着走的同学，撞上就洒一盘，三盘洒完或者 60 秒到了就结束。每送一趟，同学走得更快。
 * 只用摇杆（键盘 WASD），示范：ctx.player 走路、ctx.camera.fit 固定俯视、InstancedMesh 人群、HUD、结算。
 */
'use strict';
XMini.register((() => {
  const HX = 8.4, GOAL = 7.7, SPAN = 12, LANES = [5.6, 2.8, 0, -2.8, -5.6], TIME = 60, HIT = .62;
  const SHIRTS = ['#3fd6c6', '#ffc93c', '#7c8cff', '#ff8a3d', '#f4f2ec', '#ff5fa2', '#8bc34a', '#5c6bc0'];
  const m4 = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), col = new THREE.Color();
  let S = null;

  function addStudent(lane){
    /* drop the newcomer into the widest gap of that lane so there is always a way through */
    const xs = lane.xs.slice().sort((a, b) => a - b); let best = -SPAN, gap = -1;
    for (let i = 0; i < xs.length; i++){ const a = xs[i], b = i + 1 < xs.length ? xs[i + 1] : xs[0] + SPAN * 2; if (b - a > gap){ gap = b - a; best = a + (b - a) / 2; } }
    if (!xs.length) best = (Math.random() - .5) * SPAN * 2;
    if (best > SPAN) best -= SPAN * 2;
    lane.xs.push(best); lane.ph.push(Math.random() * 6);
  }
  function build(ctx){
    const R = ctx.root, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#3b332c'})); floor.position.y = -.02; R.add(floor);
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#f3ead8'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e8dcc4'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); return c; })());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 12);
    bx(HX * 2 + 3, .1, 24, new THREE.MeshStandardMaterial({map:tex, roughness:.9}), 0, -.03, 0).castShadow = false;
    /* the five aisles the crowd walks along */
    const aisle = M('#d9c7a6', {roughness:.95});
    for (const z of LANES) bx(HX * 2 + 3, .02, 1.5, aisle, 0, .03, z).castShadow = false;
    /* serving counter (south) with food pans, tables and stools (north) */
    bx(15, 1, 1.1, M('#c9ced3', {roughness:.35, metalness:.5}), 0, .5, 10.4);
    ['#e2b04a', '#c9543a', '#6fae4d', '#f1e6c9', '#a9703f', '#e88f3a'].forEach((c, i) => bx(1.7, .12, .7, M(c, {roughness:.8}), -5.6 + i * 2.25, 1.06, 10.4));
    const sign = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const g = c.getContext('2d');
      g.fillStyle = '#b5442a'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#fff'; g.font = '900 60px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D6 食堂 · 打饭窗口', 256, 50); return c; })());
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({map:sign})); sg.rotation.x = -Math.PI / 2; sg.position.set(0, .04, 12.1); R.add(sg);
    const top = M('#b98a5a', {roughness:.7}), stool = new THREE.InstancedMesh(new THREE.CylinderGeometry(.24, .24, .5, 10), M('#3e6fa3', {roughness:.7}), 16);
    let k = 0;
    for (let i = 0; i < 4; i++){
      const x = -6 + i * 4; bx(2.4, .1, 1.2, top, x, .78, -10.3); bx(.2, .74, .2, M('#6c757d'), x, .37, -10.3);
      for (const [dx, dz] of [[-.7, -1], [.7, -1], [-.7, 1], [.7, 1]]){ m4.makeTranslation(x + dx, .25, -10.3 + dz); stool.setMatrixAt(k++, m4); }
    }
    stool.castShadow = true; R.add(stool);
    /* where to go next: a glowing strip that jumps between the two ends */
    S.goal = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, 1.5).rotateX(-Math.PI / 2), gxGlow('#4fd18b', .5)); S.goal.position.y = .05; R.add(S.goal);
    /* the crowd: body, head and two legs per student, all instanced */
    const has = typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined', N = 32;
    const bodyGeo = has ? npcBodyGeo : new THREE.BoxGeometry(.4, .62, .26).translate(0, 1.17, 0), headGeo = has ? npcHeadGeo : new THREE.SphereGeometry(.15, 10, 8).translate(0, 1.62, 0);
    const legGeo = has ? npcLegGeo : new THREE.BoxGeometry(.13, .8, .15).translate(0, -.4, 0);
    S.body = new THREE.InstancedMesh(bodyGeo, M('#ffffff', {roughness:.8}), N); S.head = new THREE.InstancedMesh(headGeo, M('#e8b98f', {roughness:.7}), N);
    S.legL = new THREE.InstancedMesh(legGeo, M('#2a3350', {roughness:.8, vertexColors:has}), N); S.legR = new THREE.InstancedMesh(legGeo, S.legL.material, N);
    for (let i = 0; i < N; i++) S.body.setColorAt(i, col.set(SHIRTS[i % SHIRTS.length]));
    for (const im of [S.body, S.head, S.legL, S.legR]){ im.castShadow = true; im.frustumCulled = false; im.count = 0; R.add(im); }
    /* the tray 奶娃 carries: food on the way up, empty plates on the way back */
    S.tray = new THREE.Group(); R.add(S.tray);
    box(.9, .05, .6, M('#d94f3d', {roughness:.6}), 0, 0, 0, S.tray);
    S.food = new THREE.Group(); S.plates = new THREE.Group(); S.tray.add(S.food, S.plates);
    box(.3, .14, .3, M('#f6f0dc'), -.22, .1, 0, S.food); box(.26, .12, .26, M('#c9543a'), .14, .09, -.12, S.food); box(.24, .1, .22, M('#6fae4d'), .16, .08, .16, S.food);
    for (let i = 0; i < 3; i++) box(.42, .04, .42, M('#f4f2ec', {roughness:.4}), 0, .05 + i * .05, 0, S.plates);
  }
  function hud(ctx){
    ctx.hud.score(S.score);
    ctx.hud.info('♥'.repeat(S.lives) + '♡'.repeat(3 - S.lives) + (S.streak > 1 ? ` · 连送 ×${S.streak}` : ''));
    ctx.hud.hint(S.dir < 0 ? '把饭端到上面的餐桌' : '把空盘子送回下面的窗口');
    S.goal.position.z = S.dir < 0 ? -8.6 : 8.6; S.food.visible = S.dir < 0; S.plates.visible = S.dir > 0;
  }
  return {
    id:'canteen', name:'食堂端盘子', icon:'🍛', color:'#ff8a3d',
    desc:'D6 午高峰，端着盘子穿过人群',
    intro:'把饭从打饭窗口端到餐桌，再把空盘子送回来，每送到一趟得分，连着送到还有加成。别撞到同学：撞一次洒一盘，三盘洒完就结束。',
    controls:{move:true},
    board:{fmt:v => Math.round(v) + ' 分', max:5000},
    medals:[220, 140, 70],
    reward:s => Math.min(45, 4 + s * .16),
    achievements:[['mg_canteen_clean', '一滴没洒', '食堂端盘子一局没撞到人，还拿到 100 分', 40]],
    sky:'#2a2420', shadow:20,
    start(ctx){
      S = {t:TIME, score:0, lives:3, streak:0, trips:0, dir:-1, level:0, inv:0, hits:0, lanes:[]};
      build(ctx);
      LANES.forEach((z, i) => { const lane = {z, dir:i % 2 ? 1 : -1, v:2.3 + (i * 1.7 % 2.2), xs:[], ph:[]}; S.lanes.push(lane); for (let k = 0; k < 3 + (i % 2); k++) addStudent(lane); });
      ctx.player.show(0, 8.8, Math.PI);
      ctx.camera.fit({w:HX * 2 + 2.5, d:22.5, pitch:1.08, fov:50});
      ctx.hud.time(TIME); hud(ctx);
    },
    update(dt, ctx){
      S.t -= dt; ctx.hud.time(S.t);
      const P = ctx.player, speed = 1 + Math.min(1.3, S.level * .06);
      P.walk(dt, {speed:6, runSpeed:9.5, minX:-HX, maxX:HX, minZ:-9, maxZ:9});
      /* students walk, wrap around, and bump into 奶娃 */
      let n = 0, hit = false;
      for (const L of S.lanes) for (let i = 0; i < L.xs.length; i++){
        let x = L.xs[i] + L.dir * L.v * speed * dt; if (x > SPAN) x -= SPAN * 2; else if (x < -SPAN) x += SPAN * 2; L.xs[i] = x;
        const w = (L.ph[i] += dt * L.v * speed * 2.6), sw = Math.sin(w) * .55, y = Math.abs(Math.cos(w)) * .05;
        mA.makeRotationY(L.dir > 0 ? Math.PI / 2 : -Math.PI / 2); mA.setPosition(x, y, L.z); mB.makeScale(1.3, 1.3, 1.3); mA.multiply(mB);
        S.body.setMatrixAt(n, mA); S.head.setMatrixAt(n, mA);
        mB.makeRotationX(sw); mB.setPosition(.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legL.setMatrixAt(n, m4);
        mB.makeRotationX(-sw); mB.setPosition(-.09, .87, 0); m4.multiplyMatrices(mA, mB); S.legR.setMatrixAt(n, m4);
        n++;
        if (Math.abs(x - P.x) < HIT && Math.abs(L.z - P.z) < HIT) hit = true;
      }
      for (const im of [S.body, S.head, S.legL, S.legR]){ im.count = n; im.instanceMatrix.needsUpdate = true; }
      /* tray in front of 奶娃; she blinks while safe after a spill */
      S.inv -= dt; P.visible = S.inv <= 0 || Math.floor(S.inv * 12) % 2 === 0;
      S.tray.visible = P.visible;
      S.tray.position.set(P.x + Math.sin(P.h) * .62, 1.22 + P.y, P.z + Math.cos(P.h) * .62); S.tray.rotation.y = P.h;
      S.goal.material.opacity = .32 + Math.sin(ctx.elapsed * 5) * .16;
      if (hit && S.inv <= 0){
        S.lives--; S.hits++; S.streak = 0; S.inv = 1.3; ctx.camera.shake(.5); ctx.sfx.thud(.6); ctx.tone('sawtooth', 320, 140, .3, .1);
        const n2 = ctx.q > 0 ? 14 : 6;
        for (let i = 0; i < n2; i++) ctx.part('dust', P.x + (Math.random() - .5), 1.2, P.z + (Math.random() - .5), .45, {vx:(Math.random() - .5) * 6, vy:3 + Math.random() * 3, vz:(Math.random() - .5) * 6, g:14, life:.8, op:.95, color:S.dir < 0 ? '#e2b04a' : '#f4f2ec'});
        ctx.hud.callout(S.dir < 0 ? '洒了！' : '盘子碎了！', S.lives > 0 ? `还剩 ${S.lives} 盘` : '', '#ff6f61');
        if (S.lives <= 0){ hud(ctx); ctx.finish(S.score, {kicker:'洒光了', sub:`送到 ${S.trips} 趟`}); return; }
        P.z = S.dir < 0 ? 8.8 : -8.8; hud(ctx);
      }
      /* reached the far end */
      if ((S.dir < 0 && P.z < -GOAL) || (S.dir > 0 && P.z > GOAL)){
        const gain = 10 + Math.min(5, S.streak) * 2; S.score += gain; S.trips++; S.streak++; S.level++; S.dir = -S.dir;
        if (S.level % 3 === 0){ const L = S.lanes[(S.level / 3) % S.lanes.length | 0]; if (L.xs.length < 6) addStudent(L); }
        ctx.sfx.ding(); ctx.hud.callout('+' + gain, S.dir > 0 ? '送到了，把空盘子带回去' : '盘子还了，再端一份');
        if (ctx.q > 0) for (let i = 0; i < 5; i++) ctx.part('heart', P.x + (Math.random() - .5) * 3, 2 + Math.random(), P.z + (Math.random() - .5) * 2, .8, {vy:2.4, life:1.1, op:1, color:'#ff6fa3'});
        hud(ctx);
      }
      if (S.t <= 0){
        if (S.hits === 0 && S.score >= 100) ctx.unlock('mg_canteen_clean');
        ctx.finish(S.score, {kicker:'下课铃响了', sub:`送到 ${S.trips} 趟` + (S.hits ? `，洒了 ${S.hits} 盘` : '，一滴没洒')});
      }
    },
    stop(){ S = null; }
  };
})());
