/* XMUM 校园漫游 · 汽车游乐园的布景：入口拱门和巨型轮胎、看台和观众、围栏和广告牌、轮胎墙、灯塔、大屏幕、赛事控制塔和维修区、
 * 美食帐篷和售票处、铺装广场、停车场、彩旗串。玩法都在 js/92-stuntpark.js，这里只管好看（大屏幕和观众会对大跳台、大回环、8 字赛道的成绩有反应）。
 *
 * 碰撞只加在离飞行线和车道远的东西上：看台、控制塔、维修区、灯塔、大屏幕腿、拱门柱、帐篷、东西两侧围栏、8 字赛道弯道外的轮胎墙、停着的车。
 * 落地区两边的广告板和北边围栏只是样子（碰撞是平面的，飞在天上的车也会撞上，所以落地区附近一律不加）。
 * 绘制：静态的都合并成几个网格（结构、地面、贴图板、围网、彩旗、灯头、大屏幕），观众和轮胎各用实例化网格；手机上观众和轮胎更少。 */
'use strict';
(() => {
  const P = window.XPark; if (!P || !P.kit) return;
  const {mk, tri, quad, flat, toGeo, UPN, RED, WHITE, ASPH, YEL, DARK} = P.kit;
  const {CX, L1, L1HW, LP, SK, LIP, LAND, RUN, F8} = P;
  const PI2 = Math.PI * 2, rr = mkRng(9203), FILL = TOUCH ? .25 : .55;
  const BOX = {x0:-1001, x1:-799, z0:-471, z1:258};
  const parts = [], tint = (g, c) => parts.push(geoTint(g, c));
  const box = (w, h, d, x, y, z, c, ry) => tint(geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry || 0, 0), c);

  /* ---------- one atlas for every printed board: 16 strips of 1024 × 128 ---------- */
  const CELLS = [
    ['汽车游乐园', '#c8322a', '#ffffff', 'chk'], ['波浪道 · 飞跃峡谷', '#1f2a33', '#ffd23a'], ['360° 大回环', '#1b5aa6', '#ffffff'], ['赛事控制中心', '#1f2a33', '#ffffff'],
    ['售票处 · 免费入场', '#2f6f3e', '#ffffff'], ['烤肠 · 汽水 · 冰淇淋', '#f08a1c', '#ffffff'], ['纪念品 · 奶娃周边', '#b35ad6', '#ffffff'], ['PIT 维修区', '#e8e4dc', '#c8322a'],
    ['奶娃汽水 · 一口气飞 100 米', '#e8412c', '#ffffff'], ['芙蓉湖轮胎 · 抓地一流', '#111111', '#ffd23a'], ['雪邦机油 · 转得更久', '#ffd23a', '#1f2a33'], ['XMUM 车行 · 兰博鸡尼到货', '#2a3f8f', '#ffffff'],
    ['飞跃保险 · 落地才算数', '#2b9a8f', '#ffffff'], ['甜甜圈漂移学校', '#e48aa8', '#ffffff'], ['雪兰莪飞车俱乐部', '#3d3d3d', '#ff8a3d'], ['BIG JUMP · 大跳台', '#ffffff', '#c8322a', 'chk']];
  const atlas = (() => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 2048; const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    CELLS.forEach(([t, bg, fg, deco], i) => {
      const y = i * 128; g.fillStyle = bg; g.fillRect(0, y, 1024, 128);
      if (deco === 'chk') for (let k = 0; k < 64; k++){ g.fillStyle = (k + (k > 31 ? 1 : 0)) % 2 ? '#111111' : '#ffffff'; g.fillRect((k % 32) * 32, y + (k > 31 ? 112 : 0), 32, 16); }
      else { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y + 6, 1024, 4); g.fillRect(0, y + 118, 1024, 4); }
      g.fillStyle = fg; g.font = `900 ${t.length > 9 ? 70 : 88}px sans-serif`; g.fillText(t, 512, y + 66, 980);
    });
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = ANISO; return tex;
  })();
  const AB = {p:[], uv:[], n:[]};
  /* a printed board: centre (x, z), bottom y0, width w, height h, facing f = [fx, fz]; both = also print the back */
  function board(x, z, y0, w, h, f, cell, both){
    const rx = f[1], rz = -f[0], v1 = 1 - cell / 16, v0 = v1 - 1 / 16, o = .03;
    const put = (fx, fz, sx) => {
      const ax = x + fx * o - rx * sx * w / 2, az = z + fz * o - rz * sx * w / 2, bx = x + fx * o + rx * sx * w / 2, bz = z + fz * o + rz * sx * w / 2;
      AB.p.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
      AB.uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1); for (let k = 0; k < 6; k++) AB.n.push(fx, 0, fz);
    };
    put(f[0], f[1], 1); if (both) put(-f[0], -f[1], -1);
  }

  /* ---------- ground: a paved plaza along the road with a food court, concrete under the stands, a car park ---------- */
  const G = mk();
  { const tiles = (x0, z0, x1, z1) => { for (let x = x0; x < x1 - .01; x += 4) for (let z = z0; z < z1 - .01; z += 4) flat(G, x, z, Math.min(x1, x + 4), Math.min(z1, z + 4), .015, ((x / 4 + z / 4) & 1) ? '#9a9387' : '#8c857a'); };   /* mid grey: lighter paving glares white in full sun */
    for (const [a, b] of [[-1000, -928], [-912, -867], [-857, -826], [-818, -800]]) tiles(a, 222, b, 258);
    tiles(-912, 160, -867, 222); tiles(-857, 160, -826, 222);
    for (let k = 0; k < 7; k++) flat(G, CX - RUN.hw + k * 2, 237, CX - RUN.hw + (k + 1) * 2, 241, .05, k % 2 ? '#111111' : '#ffffff');   /* chequered line under the arch */
    flat(G, -998, 46, -950, 90, .015, ASPH);   /* car park */
    for (let k = 0; k <= 10; k++) for (const x of [-994, -970]) flat(G, x, 50 + k * 3.6 - .07, x + 14, 50 + k * 3.6 + .07, .04, '#eeeeea');
  }

  /* ---------- the entrance: an arch over the big-jump run-up, banners over the other two lanes, a giant tyre ---------- */
  { const z = 240, H = 10, xa = CX - 15, xb = CX + 15;
    for (const x of [xa, xb]){ box(2.4, H + 3.4, 2.4, x, (H + 3.4) / 2, z, '#c8322a'); box(2.8, .5, 2.8, x, .25, z, '#e8e4dc'); addBox(x, z, 1.3, 1.3, 0); }
    box(xb - xa + 3, 3.4, 1.6, CX, H + 1.7, z, '#1f2a33');
    board(CX, z + .82, H + .1, xb - xa + 2, 3.2, [0, 1], 0); board(CX, z - .82, H + .1, xb - xa + 2, 3.2, [0, -1], 15);
    for (const [x, hw, cell] of [[L1, L1HW + 5, 1], [LP.x, 7.5, 2]]){
      for (const s of [-1, 1]){ box(.6, 7.6, .6, x + s * hw, 3.8, 250, '#3b3f44'); addBox(x + s * hw, 250, .4, .4, 0); }
      box(2 * hw + .6, 1.8, .4, x, 7.5, 250, '#1f2a33'); board(x, 250.22, 6.7, 2 * hw - .4, 1.6, [0, 1], cell, true);
    }
    /* giant tyre on a plinth, standing up and facing the road */
    const gx = -956, gz = 236, face = .5;
    box(9, 1.2, 4, gx, .6, gz, '#e8e4dc', face); addBox(gx, gz, 4.6, 2.1, -face);
    const t = new THREE.TorusGeometry(4.2, 1.9, 8, 24); tint(geoAt(t, gx, 7.3, gz, 0, face, 0), '#1c1c1e');
    tint(geoAt(new THREE.CylinderGeometry(2.5, 2.5, 1.2, 16), gx, 7.3, gz, Math.PI / 2, face, 0), '#c4c8cc');
    tint(geoAt(new THREE.CylinderGeometry(.9, .9, 1.4, 12), gx, 7.3, gz, Math.PI / 2, face, 0), '#c8322a');
  }

  /* ---------- grandstands with a roof and ads on the fascia; the crowd sits on them ---------- */
  const STANDS = [
    {x:-958, s:1, z0:-40, z1:40, rows:10}, {x:-958, s:1, z0:-170, z1:-90, rows:10},     /* west of the landing strip, looking east */
    {x:-888, s:-1, z0:-120, z1:-50, rows:7},                                         /* east of it, looking west */
    {x:-845, s:-1, z0:-400, z1:-336, rows:8}];                                       /* beside the figure-8, looking west */
  const seats = [];
  for (const S of STANDS){
    const L = S.z1 - S.z0, zc = (S.z0 + S.z1) / 2, D = S.rows * 1.4, top = S.rows * .6 + .4, back = S.x - S.s * D;
    box(D + 2, .1, L + 2, S.x - S.s * D / 2, .02, zc, '#a9a59b');
    for (let r = 0; r < S.rows; r++){
      const h = (r + 1) * .6 + .4, xr = S.x - S.s * (r + .5) * 1.4;
      box(1.4, h, L, xr, h / 2, zc, r % 3 === 0 ? '#c8322a' : r % 3 === 1 ? '#e8e4dc' : '#2f86d6');
      for (let z = S.z0 + .7; z < S.z1 - .5; z += 1.15) if (rr() < FILL) seats.push([xr + S.s * .1, h, z, S.s]);
    }
    const roofY = top + 4.2;
    box(.6, roofY + .6, L, back - S.s * .3, (roofY + .6) / 2, zc, '#8d9196');
    box(D + 2.5, .35, L + 1, S.x - S.s * (D / 2 - 1), roofY, zc, '#e8e4dc');
    for (let z = S.z0 + 6; z < S.z1 - 4; z += 13) board(S.x + S.s * 2.25, z, roofY - .9, 11, 1.4, [S.s, 0], 8 + ((z * 7) & 7));
    box(.3, 1, L, S.x + S.s * .4, .5, zc, '#e8e4dc');
    addBox(S.x - S.s * D / 2, zc, D / 2 + .5, L / 2 + .3, 0);
  }

  /* ---------- race control tower and pit garages beside the figure-8 ---------- */
  { const tx = -975, tz = -345;
    box(7, 13, 7, tx, 6.5, tz, '#d9d4c8'); box(9.4, 4, 9.4, tx, 15, tz, '#5d7fa3'); box(10.4, .5, 10.4, tx, 17.25, tz, '#1f2a33'); box(9.8, .3, 9.8, tx, 13, tz, '#1f2a33');
    for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2; board(tx + Math.sin(a) * 4.75, tz + Math.cos(a) * 4.75, 17.6, 9, 1.1, [Math.sin(a), Math.cos(a)], 3); }
    addBox(tx, tz, 3.8, 3.8, 0);
    const gx = -990, z0 = -440, n = 7, w = 8;
    box(10, 5, n * w, gx, 2.5, z0 + n * w / 2, '#e8e4dc'); box(11, .4, n * w + 1, gx + .5, 5.2, z0 + n * w / 2, '#c8322a');
    for (let k = 0; k < n; k++){ const z = z0 + (k + .5) * w; box(.1, 3.6, w - 1.6, gx + 5.02, 1.8, z, ['#c8322a', '#1b5aa6', '#ffd23a', '#2f6f3e', '#1f2a33', '#e8412c', '#7b7f85'][k]); }
    board(gx + 5.6, z0 + n * w / 2, 5.5, 26, 1.6, [1, 0], 7);
    addBox(gx, z0 + n * w / 2, 5.2, n * w / 2 + .2, 0);
  }

  /* ---------- big screen at the far end of the landing strip, turned toward the ramp ---------- */
  const SC = {x:-968, z:-205, w:20, h:11.25, y0:7};
  { const f = Math.atan2(CX - SC.x, 100 - SC.z), rx = Math.cos(f), rz = -Math.sin(f);
    box(SC.w + 1, SC.h + 1, .8, SC.x, SC.y0 + SC.h / 2, SC.z, '#1f2a33', f);
    for (const s of [-1, 1]){ const lx = SC.x + rx * s * SC.w * .35, lz = SC.z + rz * s * SC.w * .35; box(.8, SC.y0, .8, lx, SC.y0 / 2, lz, '#3b3f44'); addCircle(lx, lz, .6); }
    SC.f = f;
  }

  /* ---------- tents, a ticket booth and kiosks on the plaza ---------- */
  const STRIPE = [['#c8322a', '#ffffff'], ['#1b5aa6', '#ffffff'], ['#ffd23a', '#e8412c'], ['#2f6f3e', '#ffffff']];
  function tent(x, z, w, cell, k){
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.12, 2.6, .12, x + sx * (w / 2 - .1), 1.3, z + sz * (w / 2 - .1), '#d9dcdf');
    const g = new THREE.ConeGeometry(w * .74, 1.8, 8, 1, true).toNonIndexed(), n = g.attributes.position.count, cl = new Float32Array(n * 3), [c0, c1] = STRIPE[k % 4].map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++){ const c = Math.floor(i / 3) % 2 ? c0 : c1; cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv'); g.computeVertexNormals(); parts.push(geoAt(g, x, 3.5, z, 0, Math.PI / 8, 0));
    box(w - .6, 1.1, 1, x, .55, z + w / 2 - .7, '#e8e4dc'); board(x, z + w / 2 - .17, .15, w - .8, .8, [0, 1], cell);
    addBox(x, z, w / 2, w / 2, 0);
  }
  { let k = 0;
    for (const z of [212, 196, 180, 164]){ tent(-898, z, 5, 5 + (k % 2), k); tent(-882, z, 5, 5 + ((k + 1) % 2), k + 1); k++; }
    for (const z of [212, 194, 176]){ tent(-846, z, 5, 6 - (k % 2), k); tent(-836, z, 5, 5, k + 2); k++; }
    box(4, 2.8, 3, -890, 1.4, 250, '#2f6f3e'); box(4.6, .3, 3.6, -890, 2.95, 250, '#e8e4dc'); board(-890, 251.52, 1.2, 3.6, .9, [0, 1], 4); addBox(-890, 250, 2.1, 1.6, 0);
    /* tables with umbrellas in the food court */
    for (const [x, z] of [[-905, 200], [-874, 204], [-905, 180], [-874, 170], [-841, 230], [-831, 232]]){
      box(.08, 2.3, .08, x, 1.15, z, '#d9dcdf'); box(1.2, .06, 1.2, x, .75, z, '#e8e4dc');
      const u = new THREE.ConeGeometry(1.5, .5, 8, 1, true); u.deleteAttribute('uv'); tint(geoAt(u, x, 2.45, z), STRIPE[(x + z) & 3][0]);
    }
  }

  /* ---------- light towers round the edge (the heads glow at night) ---------- */
  const LIGHTS = [[-996, 230], [-996, 20], [-996, -200], [-996, -460], [-804, 230], [-804, 20], [-804, -200], [-804, -460]];
  const glowParts = [];
  for (const [x, z] of LIGHTS){
    tint(geoAt(new THREE.CylinderGeometry(.22, .4, 24, 6, 1, true), x, 12, z), '#9aa0a6'); addCircle(x, z, .6);
    const f = Math.atan2(-900 - x, -100 - z);
    box(4.6, 2.4, .5, x + Math.sin(f) * .6, 24.5, z + Math.cos(f) * .6, '#2b2e33', f);
    glowParts.push(geoAt(new THREE.BoxGeometry(4, 1.9, .1), x + Math.sin(f) * .9, 24.5, z + Math.cos(f) * .9, 0, f, 0));
  }

  /* ---------- fences: posts and rails here, the mesh in its own see-through material below; ads along the landing strip ---------- */
  const FENCE = [[BOX.x0, BOX.z1, BOX.x0, BOX.z0, true], [BOX.x0, BOX.z0, BOX.x1, BOX.z0, false], [BOX.x1, BOX.z0, BOX.x1, BOX.z1, true]];
  for (const [ax, az, bx, bz, solid] of FENCE){
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 5);
    for (let k = 0; k <= n; k++) box(.1, 2.3, .1, ax + (bx - ax) * k / n, 1.15, az + (bz - az) * k / n, '#9aa0a6');
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, along = az === bz;
    box(along ? L : .08, .08, along ? .08 : L, cx, 2.25, cz, '#9aa0a6');
    if (solid) addBox(cx, cz, along ? L / 2 : .15, along ? .15 : L / 2, 0);
  }
  for (const s of [-1, 1]){
    const x = CX + s * 28;
    for (let z = LIP - 5, i = 0; z > LAND.z0 + 4; z -= 6.2, i++){ box(.12, 1.1, 6, x, .55, z - 3, '#e8e4dc'); board(x - s * .07, z - 3, .02, 6, 1.06, [-s, 0], 8 + (i % 8)); }
  }

  /* ---------- tyre walls on the outside of the figure-8 hairpins ---------- */
  const TY = [];
  for (const sx of [-1, 1]) for (const zc of [F8.z + F8.A * .707, F8.z - F8.A * .707]){
    const x = F8.x + sx * (F8.B + F8.hw + 3);
    for (let z = zc - 16; z <= zc + 16; z += .95) for (let d = 0; d < (TOUCH ? 1 : 2); d++) for (let h = 0; h < (TOUCH ? 2 : 3); h++) TY.push([x + sx * d * .9, h * .3 + .15, z + (h % 2) * .4, h === (TOUCH ? 1 : 2) ? (Math.round(z) % 2 ? '#c8322a' : '#f4f1ea') : '#1c1c1e']);
    addBox(x + sx * .45, zc, .9, 16.5, 0);
  }

  /* ---------- billboards on posts round the edge ---------- */
  for (const [x, z, f, cell] of [[-995, 100, [1, 0], 9], [-995, -280, [1, 0], 10], [-805, 100, [-1, 0], 11], [-805, -120, [-1, 0], 12], [-805, -300, [-1, 0], 13], [-960, -466, [0, 1], 14], [-840, -466, [0, 1], 8]]){
    const rx = f[1], rz = -f[0];
    for (const s of [-1, 1]){ box(.35, 8.4, .35, x + rx * s * 4.5, 4.2, z + rz * s * 4.5, '#3b3f44'); addCircle(x + rx * s * 4.5, z + rz * s * 4.5, .35); }
    box(Math.abs(rx) * 12.4 + .3, 4.4, Math.abs(rz) * 12.4 + .3, x - f[0] * .2, 6.6, z - f[1] * .2, '#1f2a33');
    board(x, z, 4.6, 12, 4, f, cell);
  }

  /* ---------- parked cars in the car park (real car models, kept out of the drivable list, each with a collider) ---------- */
  if (typeof makeCar === 'function'){
    const LOT = [['lambo', '#f2c230'], ['p911', '#c8322a'], ['mase', '#1f3a6b'], ['gwag', '#55604a'], ['rr', '#2b2b2e'], ['myvi', '#e8e4dc'], ['p911', '#2f86d6'], ['moto', '#e9ecef']];
    LOT.forEach(([kind, col], i) => {
      const x = i < 4 ? -987 : -963, z = 51.8 + (i % 4) * 7.2 + (i < 4 ? 0 : 3.6), h = i < 4 ? Math.PI / 2 : -Math.PI / 2;
      const c = makeCar(kind, col, x, z, h), k = cars.indexOf(c); if (k >= 0) cars.splice(k, 1);
      c.root.position.set(x, 0, z); c.root.rotation.set(0, h, 0); addBox(x, z, c.T.L / 2, c.T.W / 2 + .1, h - Math.PI / 2);
    });
  }

  /* ---------- bunting: strings of pennants across the run-up and along the landing flags ---------- */
  const BU = mk(), PEN = ['#c8322a', '#ffd23a', '#2f86d6', '#f4f1ea', '#2f6f3e'];
  function bunting(ax, ay, az, bx, by, bz, sag){
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(3, Math.round(L / .9));
    for (let k = 0; k < n; k++){
      const t0 = k / n, t1 = (k + .7) / n, tm = (t0 + t1) / 2;
      const p = t => [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
      const A = p(t0), B = p(t1), M = p(tm); tri(BU, A, B, [M[0], M[1] - .55, M[2]], PEN[k % PEN.length]);
    }
  }
  for (let z = RUN.z1 - 14; z > RUN.z0 + 4; z -= 26) bunting(CX - RUN.hw - 3, 4.4, z, CX + RUN.hw + 3, 4.4, z, .9);
  for (const s of [-1, 1]) for (let d = 0; LIP - d - 25 >= LAND.z0; d += 25) bunting(CX + s * (LAND.hw + 4), 5.9, LIP - d, CX + s * (LAND.hw + 4), 5.9, LIP - d - 25, 1.4);
  for (let t = 0; t < 12; t++){ const a = PI2 * t / 12, b = PI2 * (t + 1) / 12, r = SK.r + 3; bunting(SK.x + Math.cos(a) * r, 3.9, SK.z + Math.sin(a) * r, SK.x + Math.cos(b) * r, 3.9, SK.z + Math.sin(b) * r, .7); }

  /* ---------- the meshes ---------- */
  { const g = toGeo(G); const m = new THREE.Mesh(g, regWet(M('#ffffff', {vertexColors:true, roughness:.9, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-4}), .4)); m.receiveShadow = true; scene.add(m); }
  { const m = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.6, side:THREE.DoubleSide})); m.castShadow = m.receiveShadow = true; scene.add(m); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(AB.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(AB.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(AB.uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map:atlas, roughness:.6, emissive:'#ffffff', emissiveMap:atlas, emissiveIntensity:.12})); m.receiveShadow = true; scene.add(m); P.boardMat = m.material; }
  { const m = new THREE.Mesh(toGeo(BU), M('#ffffff', {vertexColors:true, roughness:.8, side:THREE.DoubleSide})); scene.add(m); }
  const glowMat = new THREE.MeshStandardMaterial({color:'#fff6d8', emissive:'#fff1c0', emissiveIntensity:.2});
  scene.add(new THREE.Mesh(geoMerge(glowParts), glowMat));
  { /* see-through chain-link mesh on the fences */
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = '#c9ced3'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke(); g.strokeRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const p = [], uv = [];
    for (const [ax, az, bx, bz] of FENCE){ const L = Math.hypot(bx - ax, bz - az); p.push(ax, .05, az, bx, .05, bz, bx, 2.25, bz, ax, .05, az, bx, 2.25, bz, ax, 2.25, az); uv.push(0, 0, L / 1.1, 0, L / 1.1, 2, 0, 0, L / 1.1, 2, 0, 2); }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g2.computeVertexNormals();
    scene.add(new THREE.Mesh(g2, new THREE.MeshStandardMaterial({map:tex, alphaTest:.5, transparent:false, side:THREE.DoubleSide, roughness:.6, metalness:.3})));
  }

  /* tyres: one instanced mesh */
  if (TY.length){
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .45, .3, 10), M('#ffffff', {roughness:.85}), TY.length), m4 = new THREE.Matrix4(), c = new THREE.Color();
    TY.forEach(([x, y, z, col], i) => { im.setMatrixAt(i, m4.makeTranslation(x, y, z)); im.setColorAt(i, c.set(col)); });
    im.castShadow = !TOUCH; im.receiveShadow = true; im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(F8.x, 1, F8.z), F8.B + 60); scene.add(im);
  }

  /* ---------- the crowd: bodies and heads, two instanced meshes; they jump up when something big happens ---------- */
  const CR = {body:null, head:null, cheer:0, t:0};
  if (seats.length){
    const SHIRT = ['#c8322a', '#2f86d6', '#ffd23a', '#f4f1ea', '#2f6f3e', '#e48aa8', '#1f2a33', '#ff8a3d'].map(c => new THREE.Color(c)), SKIN = ['#f1c9a5', '#d9a77e', '#a8714a', '#f4d8be'].map(c => new THREE.Color(c));
    const mkIm = (geo, cols) => { const im = new THREE.InstancedMesh(geo, M('#ffffff', {roughness:.8}), seats.length); seats.forEach((_, i) => im.setColorAt(i, cols[(rr() * cols.length) | 0])); im.castShadow = false; im.receiveShadow = true;
      im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(-920, 4, -200), 260); scene.add(im); return im; };
    CR.body = mkIm(new THREE.BoxGeometry(.5, .62, .36).translate(0, .31, 0), SHIRT); CR.head = mkIm(new THREE.BoxGeometry(.3, .3, .3).translate(0, .8, 0), SKIN);
    CR.ph = seats.map(() => rr() * PI2);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  function crowdPose(t){
    if (!CR.body) return;
    seats.forEach(([x, y, z, s], i) => {
      const up = CR.cheer > 0 ? Math.max(0, Math.sin(t * 11 + CR.ph[i])) * .45 * Math.min(1, CR.cheer) : 0;
      _m.compose(_p.set(x, y + up, z), _q.setFromAxisAngle(UP, s * Math.PI / 2), _s); CR.body.setMatrixAt(i, _m); CR.head.setMatrixAt(i, _m);
    });
    CR.body.instanceMatrix.needsUpdate = CR.head.instanceMatrix.needsUpdate = true;
  }
  crowdPose(0);

  /* ---------- the big screen: last jump, records ---------- */
  const scr = document.createElement('canvas'); scr.width = 512; scr.height = 288; const sg = scr.getContext('2d');
  const scrTex = new THREE.CanvasTexture(scr);
  const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(SC.w, SC.h), new THREE.MeshBasicMaterial({map:scrTex, toneMapped:false}));
  scrMesh.position.set(SC.x + Math.sin(SC.f) * .42, SC.y0 + SC.h / 2, SC.z + Math.cos(SC.f) * .42); scrMesh.rotation.y = SC.f; scene.add(scrMesh);
  function screen(big, sub){
    sg.fillStyle = '#0d1420'; sg.fillRect(0, 0, 512, 288);
    sg.fillStyle = '#c8322a'; sg.fillRect(0, 0, 512, 44); sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillStyle = '#ffffff'; sg.font = '800 28px sans-serif'; sg.fillText('汽车游乐园 · 大屏幕', 256, 23);
    sg.fillStyle = '#ffd23a'; sg.font = '900 66px sans-serif'; sg.fillText(big, 256, 112, 490);
    sg.fillStyle = '#e8edf2'; sg.font = '700 26px sans-serif'; sg.fillText(sub, 256, 170, 490);
    const b = prog.best, rec = [b.bigjump != null ? `大跳台 ${b.bigjump} 米` : '大跳台 —', b.loops ? `回环 ${b.loops} 圈` : '回环 —', b.parkLap != null ? `8 字 ${P.fmtT(b.parkLap)}` : '8 字 —'];
    sg.fillStyle = '#1f2a33'; sg.fillRect(0, 222, 512, 66); sg.fillStyle = '#9fd3ff'; sg.font = '700 24px sans-serif'; sg.fillText('纪录  ' + rec.join('  ·  '), 256, 255, 496);
    scrTex.needsUpdate = true;
  }
  screen('飞起来！', '从南边的助跑道全速往北冲上大跳台');
  P.onJump = (d, rec, kmh) => { screen(`${d} 米`, rec ? `新纪录！起飞 ${kmh} km/h` : `起飞 ${kmh} km/h`); if (d >= 30) CR.cheer = d >= 100 ? 3.5 : 2.2; };
  P.onLoop = (n, kmh) => { screen('360° 大回环', `进环 ${kmh} km/h · 一共 ${n} 圈`); CR.cheer = 2; };
  P.onLap = (t, rec) => { screen(`一圈 ${P.fmtT(t)}`, rec ? '8 字赛道 · 新纪录！' : '8 字赛道'); CR.cheer = rec ? 2.5 : 1.2; };

  /* ---------- per frame: the crowd's cheer, lights at night ---------- */
  if (typeof updateOutskirts === 'function'){
    const base = updateOutskirts;
    updateOutskirts = function(dt, T){
      base(dt, T);
      const lamp = typeof cur !== 'undefined' && cur.lamp != null ? cur.lamp : 0;
      glowMat.emissiveIntensity = .2 + lamp * 2.2; if (P.boardMat) P.boardMat.emissiveIntensity = .12 + lamp * .5;
      if (CR.cheer > 0){ CR.cheer -= dt; CR.t += dt; if (camera.position.distanceTo(scrMesh.position) < 700) crowdPose(CR.t); if (CR.cheer <= 0) crowdPose(0); }
    };
  }
  P.deco = {seats:seats.length, tyres:TY.length, CR, screen};
})();
