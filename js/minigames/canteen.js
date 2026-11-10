/* 小游戏 · 食堂端盘子（D6 午高峰）
 * 奶娃在打饭窗口（下边）和餐桌（上边）之间来回：端饭上去，再把空盘子送回来，每送到一趟得分。
 * 中间五条过道全是横着走的同学，撞上就洒一盘。加分：连着送到（连送）、5 秒内送到（趁热）、贴着同学身边穿过去（擦肩）。
 * 每送一趟同学走得更快，送过几趟之后还会有赶着上课的同学冲过去（过道边先亮红色感叹号）。
 * 五个模式，共用一套场景，每个模式一张榜：
 *   经典     canteen          60 秒，3 盘洒完就结束。
 *   叠盘挑战 canteen_stack    在窗口多站一会儿盘子越叠越高（最多 5 盘），叠得越多走得越慢、越容易被撞，送到的分数涨得更快；空手回窗口不计分。
 *   午高峰   canteen_rush     75 秒，不限盘数，洒一盘扣 3 秒；同学每 4 秒多一个，越走越快，冲刺的同学从第二趟就来。
 *   指定桌号 canteen_table    上边隔成四个卡座，每趟指定一个桌号，走错卡座要退出来重进。
 *   无尽     canteen_endless  没有总时间，每趟有保温时间（9 秒起，每趟少 0.2 秒，最短 4.2 秒），饭凉了或者撞了都丢一盘，每 6 趟补一盘，看能送多少。
 * 只用摇杆（键盘 WASD，Shift 跑），示范：register 的 modes、ctx.player 走路、ctx.camera.fit 固定俯视、InstancedMesh 人群、HUD、结算。
 */
'use strict';
XMini.register((() => {
  const HX = 8.4, GOAL = 7.6, EDGE = 8.7, SPAN = 12, LANES = [5.6, 2.8, 0, -2.8, -5.6], HIT = .6, NEAR = 1.2, N = 40, SC = 1.5;
  const TX = [-6, -2, 2, 6], WALLS = [-8, -4, 0, 4, 8], STACK = [0, 10, 24, 42, 64, 90];
  const CFG = {
    classic:{time:60, lives:3, cap:1.2, runFrom:4},
    stack:{time:60, lives:3, cap:1.2, runFrom:4, stack:true},
    rush:{time:75, lives:0, cap:.9, runFrom:1, rush:true},
    table:{time:60, lives:3, cap:1.2, runFrom:4, table:true, base:14},
    endless:{time:0, lives:3, cap:1.6, runFrom:4, endless:true}
  };
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
  function addAnywhere(){ for (let i = 0, k = (Math.random() * S.lanes.length) | 0; i < S.lanes.length; i++) if (addStudent(S.lanes[(k + i) % S.lanes.length])) return true; return false; }
  function build(ctx){
    const R = ctx.root, C = S.cfg, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, R);
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
    decal('D6 食堂 · 打饭窗口', '#b5442a', 8.75); if (!C.table) decal('餐桌 · 送到这里', '#2f8f5a', -8.75);
    /* serving counter (south) with food pans, tables and stools (north) */
    bx(15, 1, 1.1, M('#aeb4ba', {roughness:.35, metalness:.5}), 0, .5, 10.6);
    ['#e2b04a', '#c9543a', '#6fae4d', '#e9dfc4', '#a9703f', '#e88f3a'].forEach((c, i) => bx(1.7, .12, .7, M(c, {roughness:.8}), -5.6 + i * 2.25, 1.06, 10.6));
    const top = M('#a87a4c', {roughness:.7}), stool = new THREE.InstancedMesh(new THREE.CylinderGeometry(.26, .26, .5, 10), M('#3e6fa3', {roughness:.7}), 16);
    let k = 0;
    for (let i = 0; i < 4; i++){
      const x = TX[i]; bx(2.4, .1, 1.2, top, x, .78, -10.7); bx(.2, .74, .2, M('#6c757d'), x, .37, -10.7);
      for (const [dx, dz] of [[-.7, -1], [.7, -1], [-.7, 1], [.7, 1]]){ m4.makeTranslation(x + dx, .25, -10.7 + dz); stool.setMatrixAt(k++, m4); }
    }
    stool.castShadow = true; R.add(stool);
    /* 指定桌号: four booths with low walls between them, a number over each table */
    S.nums = [];
    if (C.table){
      const wall = M('#7a5a3a', {roughness:.8});
      for (const x of WALLS) bx(.3, .9, 3.2, wall, x, .45, -8.3);
      TX.forEach((x, i) => {
        const t = tex(96, 96, g => { g.fillStyle = '#2f8f5a'; g.beginPath(); g.arc(48, 48, 44, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '900 64px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 48, 52); });
        const s = new THREE.Sprite(new THREE.SpriteMaterial({map:t, depthTest:false, transparent:true})); s.position.set(x, 2.6, -9.6); s.scale.setScalar(1.3); R.add(s); S.nums.push(s);
      });
    }
    /* where to go next: a glowing strip that jumps between the two ends (one booth wide in 指定桌号) */
    S.goal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.9).rotateX(-Math.PI / 2), gxGlow('#4fd18b', .5)); S.goal.position.y = .06; R.add(S.goal);
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
    /* the tray 奶娃 carries: food on the way up (up to five trays in 叠盘挑战), empty plates on the way back */
    S.tray = new THREE.Group(); R.add(S.tray);
    S.food = new THREE.Group(); S.plates = new THREE.Group(); S.tray.add(S.food, S.plates);
    const red = M('#d94f3d', {roughness:.6}), rice = M('#f6f0dc'), meat = M('#c9543a'), veg = M('#6fae4d');
    for (let i = 0; i < (C.stack ? 5 : 1); i++){
      const L = new THREE.Group(); L.position.y = i * .24; S.food.add(L);
      box(.95, .05, .62, red, 0, 0, 0, L); box(.32, .16, .32, rice, -.24, .1, 0, L); box(.28, .13, .28, meat, .14, .09, -.13, L); box(.26, .11, .24, veg, .17, .08, .17, L);
    }
    box(.95, .05, .62, red, 0, 0, 0, S.plates);
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
  const keep = () => Math.max(4.2, 9 - S.level * .2);                      /* 无尽: seconds before the food goes cold */
  function hud(ctx){
    const C = S.cfg, up = S.dir < 0, hearts = C.lives ? '♥'.repeat(Math.max(0, S.lives)) + '♡'.repeat(Math.max(0, 3 - S.lives)) : `洒了 ${S.hits} 盘`;
    ctx.hud.score(S.score);
    ctx.hud.info(hearts + (C.stack && up ? ` · 盘子 ×${S.n}` : C.table && up ? ` · ${S.table + 1} 号桌` : C.endless ? ` · 第 ${S.trips + 1} 趟` : '') + (S.streak > 1 ? ` · 连送 ×${S.streak}` : ''));
    ctx.hud.hint(C.stack ? (up ? (S.n < 5 ? '在窗口站着盘子会越叠越高，叠够了就走' : '叠满 5 盘了，稳住走') : '空手回窗口，再叠一摞')
      : C.table && up ? `把饭端到 ${S.table + 1} 号桌的卡座里` : up ? '把饭端到上面的餐桌' : '把空盘子送回下面的窗口');
    const tb = C.table && up;
    S.goal.position.set(tb ? TX[S.table] : 0, .06, up ? -EDGE : EDGE); S.goal.scale.x = tb ? 3.4 : HX * 2 + 3;
    S.food.visible = up; S.plates.visible = !up && !C.stack;
    S.food.children.forEach((c, i) => { c.visible = i < S.n; });
    S.nums.forEach((s, i) => { const on = tb && i === S.table; s.scale.setScalar(on ? 2.1 : 1.2); s.material.opacity = on ? 1 : .55; });
  }
  /* a new trip toward dir: reset what is counted per trip */
  function trip(ctx, dir){
    const C = S.cfg; S.dir = dir; S.seen.clear(); S.near = 0; S.tripT = 0; S.wrong = -1;
    if (dir < 0){ S.n = 1; S.stackT = 0; if (C.table){ let t; do { t = (Math.random() * 4) | 0; } while (t === S.table); S.table = t; } }
    if (C.endless) S.left = keep();
    hud(ctx);
  }
  function spill(ctx, P, why){
    const C = S.cfg; S.hits++; S.streak = 0; S.inv = 1.6; S.stun = .45; ctx.camera.shake(.6); ctx.sfx.thud(.7); ctx.noise(.25, .3, 2600, 'highpass'); ctx.tone('sawtooth', 320, 130, .32, .1);
    if (C.lives) S.lives--; else S.t -= 3;
    const n = ctx.q > 0 ? 16 : 6, c = S.dir < 0 ? ['#e2b04a', '#c9543a', '#6fae4d'] : ['#f4f2ec', '#e8e4da', '#ffffff'];
    for (let i = 0; i < n; i++) ctx.part('dust', P.x + (Math.random() - .5), 1.2, P.z + (Math.random() - .5), .5, {vx:(Math.random() - .5) * 7, vy:3 + Math.random() * 4, vz:(Math.random() - .5) * 7, g:15, life:.9, op:.95, color:c[i % 3]});
    ctx.hud.callout(why || (S.dir < 0 ? (S.n > 1 ? `${S.n} 盘全洒了！` : '洒了！') : '盘子碎了！'), !C.lives ? '扣 3 秒，回去重新来' : S.lives > 0 ? `还剩 ${S.lives} 盘，回去重新来` : '', '#ff6f61');
    P.act('jump');
  }
  const MODES = [
    {id:'classic', key:'canteen', name:'经典', desc:'D6 午高峰，端着盘子穿过人群',
      intro:'把饭从打饭窗口端到餐桌，再把空盘子送回来，每送到一趟得分。连着送到、5 秒内送到、贴着同学身边穿过去都有加分。撞到同学就洒一盘，三盘洒完就结束。',
      board:{max:5000}, medals:[240, 150, 80], reward:s => Math.min(40, 3 + s * .12)},
    {id:'stack', name:'叠盘挑战', desc:'一次端好几盘：叠得越高分越多，也越难走',
      intro:'在窗口站着，盘子每半秒多叠一盘，最多 5 盘。送到的分数是 10 / 24 / 42 / 64 / 90，但叠得越多走得越慢、越容易被撞，三盘以上不能跑。被撞整摞都洒，丢一条命。空手回窗口不计分，被撞只是晕一下。',
      board:{max:5000}, medals:[210, 135, 70], reward:s => Math.min(40, 3 + s * .16)},
    {id:'rush', name:'午高峰', desc:'75 秒，同学越来越多，洒了扣 3 秒',
      intro:'限时 75 秒，不限盘数：撞到同学洒一盘，扣 3 秒重新来。同学每 4 秒多一个，越走越快，赶着上课冲刺的同学从第二趟就出现。看你能在最挤的时候送多少。',
      board:{max:5000}, medals:[280, 175, 95], reward:s => Math.min(40, 3 + s * .12)},
    {id:'table', name:'指定桌号', desc:'每趟指定一个桌号，走错卡座要退出来',
      intro:'餐桌隔成了 1 到 4 号卡座，每趟饭指定一个桌号（看上面的数字牌和地上的绿色）。端进对的卡座才算送到；空盘子还是送回窗口任何地方。三盘洒完就结束。',
      board:{max:5000}, medals:[215, 135, 75], reward:s => Math.min(40, 3 + s * .16)},
    {id:'endless', name:'无尽', desc:'没有总时间，每趟有保温时间，看能送多少',
      intro:'没有总时间，只有三盘。每趟饭有保温时间（从 9 秒慢慢缩到 4 秒多），超时饭凉了也算洒一盘。同学越来越快越来越多，每送到 6 趟补回一盘。',
      board:{max:20000}, medals:[500, 300, 150], reward:s => Math.min(40, 3 + s * .07)}
  ];
  return {
    id:'canteen', name:'食堂端盘子', icon:'🍛', color:'#ff8a3d',
    desc:'D6 午高峰，端着盘子穿过人群，五个模式',
    modes:MODES,
    controls:{move:true},
    board:{fmt:v => Math.round(v) + ' 分'},
    achievements:[['mg_canteen_clean', '一滴没洒', '食堂端盘子经典模式一局没撞到人，还拿到 150 分', 40], ['mg_canteen_five', '五层高塔', '叠盘挑战一次把 5 盘送到', 40], ['mg_canteen_30', '铁打的饭堂人', '无尽模式送到 30 趟', 60]],
    sky:'#231e1a', shadow:20,
    start(ctx){
      const mode = CFG[ctx.mode] ? ctx.mode : 'classic', C = CFG[mode];
      S = {mode, cfg:C, t:C.time, el:0, score:0, lives:C.lives, streak:0, trips:0, dir:-1, level:0, inv:0, stun:0, hits:0, nextId:1, lanes:[], seen:new Set(), near:0, nearAll:0, tripT:0,
        n:1, stackT:0, maxN:1, carried:0, table:-1, wrong:-1, left:0, growT:0, cold:0,
        run:{on:false, cd:0, warn:0, lane:0, dir:1, x:0, w:0}};
      build(ctx); ctx.debug(S);
      LANES.forEach((z, i) => { const lane = {z, dir:i % 2 ? 1 : -1, v:2 + Math.random() * 1.2 + (i === 2 ? 1 : 0), xs:[], ph:[], id:[]}; S.lanes.push(lane); fillLane(lane); });
      ctx.player.show(0, EDGE, Math.PI);
      ctx.camera.fit({w:HX * 2 + 3.4, d:23, pitch:.92, fov:50});
      trip(ctx, -1);
      if (C.time) ctx.hud.time(C.time); else ctx.hud.time(S.left, true);
    },
    update(dt, ctx){
      const C = S.cfg, P = ctx.player; S.el += dt; S.tripT += dt;
      if (C.time){ S.t -= dt; ctx.hud.time(S.t); } else { S.left -= dt; ctx.hud.time(S.left, true); }
      const speed = 1 + Math.min(C.cap, C.rush ? S.el * .012 + S.level * .03 : S.level * .055), carry = C.stack && S.dir < 0 ? S.n : 1;
      S.stun -= dt;
      if (S.stun <= 0){
        const slow = 1 - .08 * (carry - 1);
        P.walk(dt, {speed:6 * slow, runSpeed:carry >= 3 ? 0 : 9.5 * slow, minX:-HX, maxX:HX, minZ:-9.1, maxZ:9.1,
          blocked:C.table ? (x, z) => z < -6.75 && WALLS.some(w => Math.abs(x - w) < .55) : null});
      }
      /* 叠盘挑战: the pile grows while she waits at the window */
      if (C.stack && S.dir < 0 && P.z > GOAL && S.n < 5){
        S.stackT += dt;
        if (S.stackT > .55){ S.stackT = 0; S.n++; ctx.tone('triangle', 440 * Math.pow(1.19, S.n), 440 * Math.pow(1.19, S.n), .09, .12); ctx.hud.callout('×' + S.n, `送到 +${STACK[S.n]}`, S.n === 5 ? '#ffc93c' : undefined); hud(ctx); }
      }
      /* 午高峰: one more student every four seconds, whatever she does */
      if (C.rush){ S.growT += dt; if (S.growT > 4){ S.growT = 0; addAnywhere(); } }
      /* students walk, wrap around; note the closest call in each lane 奶娃 is crossing */
      let n = 0, hit = false;
      const hitR = HIT + (carry - 1) * .05;
      const judge = (x, z, id) => {
        const dz = Math.abs(z - P.z); if (dz > HIT) return;
        const dx = Math.abs(x - P.x);
        if (dx < hitR) hit = true;
        else if (dx < NEAR && !S.seen.has(id) && S.inv <= 0){ S.seen.add(id); S.near++; ctx.tone('triangle', 1250, 1600, .07, .07); if (ctx.q > 0) ctx.part('dust', (x + P.x) / 2, 1.6, z, .5, {vy:1.5, life:.4, op:.9, color:'#ffe28a', grow:1}); }
      };
      for (const L of S.lanes) for (let i = 0; i < L.xs.length && n < N - 1; i++){
        let x = L.xs[i] + L.dir * L.v * speed * dt; if (x > SPAN) x -= SPAN * 2; else if (x < -SPAN) x += SPAN * 2; L.xs[i] = x;
        put(n++, x, L.z, L.dir, L.ph[i] += dt * L.v * speed * 2.4, 0);
        judge(x, L.z, L.id[i]);
      }
      /* the student who is late for class: a red warning at the edge of an aisle, then a sprint */
      const Rn = S.run;
      if (S.trips >= C.runFrom){
        if (!Rn.on && Rn.warn <= 0){ Rn.cd -= dt; if (Rn.cd <= 0){ Rn.lane = (Math.random() * LANES.length) | 0; Rn.dir = Math.random() < .5 ? -1 : 1; Rn.warn = .9; Rn.id = S.nextId++; ctx.tone('square', 880, 880, .09, .09); ctx.tone('square', 880, 880, .09, .09, .18); } }
        else if (Rn.warn > 0){ Rn.warn -= dt; if (Rn.warn <= 0){ Rn.on = true; Rn.x = -Rn.dir * (SPAN + 1); } }
        else { Rn.x += Rn.dir * 10.5 * dt; Rn.w += dt * 22; if (Math.abs(Rn.x) > SPAN + 1.5){ Rn.on = false; Rn.cd = C.rush ? 2.5 + Math.random() * 2.5 : C.endless ? Math.max(1.5, 4 - S.level * .1) + Math.random() * 3 : 4 + Math.random() * 4; } }
      }
      S.warn.visible = Rn.warn > 0 && Math.floor(Rn.warn * 9) % 2 === 0;
      if (S.warn.visible) S.warn.position.set(-Rn.dir * (HX + .6), 1.6, LANES[Rn.lane]);
      if (Rn.on){ put(N - 1, Rn.x, LANES[Rn.lane], Rn.dir, Rn.w, .28); judge(Rn.x, LANES[Rn.lane], Rn.id); } else { m4.makeScale(0, 0, 0); for (const im of S.ims) im.setMatrixAt(N - 1, m4); }
      if (!S.redSet){ S.redSet = true; S.body.setColorAt(N - 1, col.set('#e5352b')); S.body.instanceColor.needsUpdate = true; }
      for (const im of S.ims){ im.count = N; im.instanceMatrix.needsUpdate = true; }
      for (let i = n; i < N - 1; i++){ m4.makeScale(0, 0, 0); for (const im of S.ims) im.setMatrixAt(i, m4); }
      /* tray in front of 奶娃 (a tall pile sways); she blinks while safe after a spill */
      S.inv -= dt; P.visible = S.inv <= 0 || Math.floor(S.inv * 12) % 2 === 0;
      S.tray.visible = P.visible && (S.food.visible || S.plates.visible);
      S.tray.position.set(P.x + Math.sin(P.h) * .66, 1.24 + P.y, P.z + Math.cos(P.h) * .66); S.tray.rotation.set(0, P.h, carry > 1 ? Math.sin(S.el * 5) * .012 * carry : 0);
      S.goal.material.opacity = .34 + Math.sin(S.el * 5) * .16;
      const over = why => {
        hud(ctx);
        const sub = C.stack ? `送到 ${S.carried} 盘，最多一次 ${S.maxN} 盘` : `送到 ${S.trips} 趟，擦肩 ${S.nearAll} 次`;
        if (S.mode === 'classic' && S.hits === 0 && S.score >= 150 && S.t <= 0) ctx.unlock('mg_canteen_clean');
        ctx.finish(S.score, {kicker:why, sub:sub + (C.endless ? (S.hits - S.cold ? `，撞了 ${S.hits - S.cold} 次` : '') + (S.cold ? `，饭凉了 ${S.cold} 次` : '') : S.hits ? `，洒了 ${S.hits} 盘` : '，一滴没洒')});
      };
      const back = () => { P.z = S.dir < 0 ? EDGE : -EDGE; if (C.table && S.dir > 0) P.x = TX[S.table]; trip(ctx, S.dir); };
      if (hit && S.inv <= 0){
        if (C.stack && S.dir > 0){ S.stun = .5; S.inv = 1; ctx.camera.shake(.3); ctx.sfx.thud(.4); ctx.hud.callout('哎哟', '空着手，没洒', '#b8c2cc'); }
        else {
          spill(ctx, P);
          if (C.lives && S.lives <= 0){ over('洒光了'); return; }
          back();
        }
      }
      /* 无尽: the food went cold */
      if (C.endless && S.left <= 0){
        S.cold++; spill(ctx, P, S.dir < 0 ? '饭凉了！' : '太慢了！');
        if (S.lives <= 0){ over('饭凉了'); return; }
        back();
      }
      /* 指定桌号: stepped into the wrong booth */
      if (C.table && S.dir < 0 && P.z < -GOAL){
        const b = TX.reduce((a, x, i) => (Math.abs(P.x - x) < Math.abs(P.x - TX[a]) ? i : a), 0);
        if (b !== S.table && S.wrong !== b){ S.wrong = b; S.streak = 0; ctx.tone('square', 200, 150, .18, .1); ctx.hud.callout('送错桌了', `这是 ${b + 1} 号，要送 ${S.table + 1} 号桌`, '#ff6f61'); hud(ctx); }
      } else if (P.z > -6.6) S.wrong = -1;
      /* reached the far end */
      const there = S.dir < 0 ? P.z < -GOAL && (!C.table || Math.abs(P.x - TX[S.table]) < 1.9) : P.z > GOAL;
      if (there){
        const up = S.dir < 0;
        if (C.stack && !up){ ctx.tone('triangle', 520, 520, .08, .1); trip(ctx, -1); }
        else {
          const hot = S.tripT < 5 && !C.stack ? 3 : 0, close = S.near * 2, gain = (C.stack ? STACK[S.n] : (C.base && up ? C.base : 10) + Math.min(5, S.streak) * 2) + hot + close;
          S.score += gain; S.trips++; S.streak++; S.level++; S.nearAll += S.near;
          if (C.stack){ S.carried += S.n; S.maxN = Math.max(S.maxN, S.n); if (S.n === 5) ctx.unlock('mg_canteen_five'); }
          if (S.level % 2 === 0) addStudent(S.lanes[(Math.random() * S.lanes.length) | 0]);
          const base = 660 * Math.pow(1.122, Math.min(8, S.streak - 1));
          ctx.tone('triangle', base, base, .16, .15); ctx.tone('triangle', base * 1.5, base * 1.5, .3, .13, .1);
          const tags = []; if (C.stack) tags.push(`${S.n} 盘送到`); if (S.streak > 1) tags.push(`连送 ×${S.streak}`); if (hot) tags.push('趁热 +3'); if (close) tags.push(`擦肩 +${close}`);
          ctx.hud.callout('+' + gain, tags.join(' · ') || (up ? '送到了，把空盘子带回去' : '盘子还了，再端一份'), close || S.n >= 4 ? '#ffc93c' : undefined);
          if (ctx.q > 0) for (let i = 0; i < 6; i++) ctx.part('heart', P.x + (Math.random() - .5) * 3, 2 + Math.random(), P.z + (Math.random() - .5) * 2, .9, {vy:2.4, life:1.1, op:1, color:'#ff6fa3'});
          if (S.trips === C.runFrom) ctx.after(.9, () => ctx.hud.callout('小心', '有同学赶着上课，过道边亮红色感叹号', '#ff6f61'));
          if (C.endless){
            if (S.trips === 30) ctx.unlock('mg_canteen_30');
            if (S.trips % 6 === 0 && S.lives < 3){ S.lives++; ctx.after(.9, () => { ctx.hud.callout('补一盘', '每送到 6 趟补回一盘', '#4fd18b'); ctx.sfx.sparkle(); }); }
          }
          trip(ctx, -S.dir);
        }
      }
      if (C.time && S.t <= 0) over(C.rush ? '午休结束' : '下课铃响了');
    },
    stop(){ S = null; }
  };
})());
