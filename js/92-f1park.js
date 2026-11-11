/* XMUM 校园漫游 · 汽车游乐园二园：雪邦风格的 F1 赛道 + 东边的特技区
 *
 * 位置：Bell Avenue 东南、油棕园公路两边（js/12-terrain.js 的 park2 地块，x -230 ~ 1070，z 675 ~ 1195，压平到 y = 0）。
 *   - 雪邦赛道（西边）：照着雪邦国际赛道的平面图描的，约 1:1.8，一圈约 3 公里、15 个弯、路宽 14 米。油棕园公路在园里那一段
 *     就是它的后直道（路线没改，「油棕园公路冲刺」照样跑），公路往东北出园时在 7、8 号弯之间横穿赛道（平交路口）。
 *     起点线在主直道上，从起点线出发计时：三个计时段、每圈成绩，最快一圈存 prog.best.sepLap（只在本机）。
 *     主直道和后直道之间是主看台，主直道另一边是维修区和赛事控制塔；发卡弯外有砂石缓冲区和轮胎墙。
 *   - 特技区（东边，公路东侧，一圈服务道路围着）：超级大跳台（9 米高，落地区 300 米）、双回环（第二个更大）、
 *     波浪道接三连跳台；一块漂移广场；看台对着大跳台落地区。物理沿用 js/92-stuntpark.js（跳台侧面算墙、凸起会起飞、回环脚本驱动）。
 * 纪录：sepLap（秒）、bigjump2（米）；回环圈数和一园共用 loops。 */
'use strict';
(() => {
  const P = window.XPark; if (!P || !P.kit) return;
  const PAD = OUT_PADS.find(p => p.id === 'park2'); if (!PAD) return;
  const {mk, tri, quad, flat, toGeo, UPN, RED, WHITE, ASPH, PAINT, YEL, DARK} = P.kit;
  const PI2 = Math.PI * 2, rr = mkRng(7719), FILL = TOUCH ? .25 : .55;
  P.BOXES.push({x0:PAD.x0 - 10, x1:PAD.x1 + 10, z0:PAD.z0 - 10, z1:PAD.z1 + 10});

  /* ---------- the circuit: Sepang traced from the reference map (image px, x east, y south), in race order from the start line heading west ---------- */
  const SEP = [[300,353],[248,355],[180,359],[110,363],[55,368],[38,361],[46,346],[58,330],[66,308],[73,288],[83,268],[103,250],[140,233],[180,218],[202,211],[214,222],
    [226,246],[240,272],[254,290],[272,296],[290,288],[304,282],[318,286],[336,300],[356,322],[376,346],[390,364],[398,384],[394,400],[370,406],[320,408],[270,410],
    [248,413],[250,429],[258,446],[262,468],[256,490],[236,484],[200,468],[164,454],[136,462],[110,470],[84,456],[64,432],
    [66,416], [330,372],                       /* the back straight: replaced by the estate road between these two */
    [348,370],[358,362],[352,352],[334,349]];   /* T15 hairpin */
  const TURNS = [[1, 38, 361], [2, 50, 342], [3, 70, 290], [4, 202, 211], [5, 254, 290], [6, 304, 282], [7, 386, 360], [8, 396, 396], [9, 248, 413], [10, 258, 446],
    [11, 256, 490], [12, 164, 454], [13, 110, 470], [14, 64, 432], [15, 356, 360]];
  const T14 = [66, 416], T15 = [330, 372], A = [-60, 1100], SCALE = 1.8, HW = 7;
  const ROAD = OUT_ROADS.find(r => r.id === 'estate');
  const nearest = (pts, x, z) => { let bi = 0, bd = 1e9; pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd){ bd = d; bi = i; } }); return bi; };
  const B0 = ROAD.p[nearest(ROAD.p, 410, 905)], ph = Math.atan2(B0[1] - A[1], B0[0] - A[0]) - Math.atan2(T15[1] - T14[1], T15[0] - T14[0]), cph = Math.cos(ph), sph = Math.sin(ph);
  const map = ([x, y]) => [A[0] + SCALE * ((x - T14[0]) * cph - (y - T14[1]) * sph), A[1] + SCALE * ((x - T14[0]) * sph + (y - T14[1]) * cph)];
  const ctrl = [];
  for (const q of SEP){
    if (q[0] === T14[0] && q[1] === T14[1]){ const i0 = nearest(ROAD.p, ...map(T14)), i1 = nearest(ROAD.p, ...map(T15)); for (let i = i0; i <= i1; i += 2) ctrl.push(ROAD.p[i].slice()); continue; }
    if (q[0] === T15[0] && q[1] === T15[1]) continue;
    ctrl.push(map(q));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const LEN = curve.getLength(), N = Math.round(LEN / 3);
  const PT = curve.getSpacedPoints(N).slice(0, N).map(v => [v.x, v.z]);   /* closed: PT[N] would be PT[0] */
  const wi = i => ((i % N) + N) % N, at = i => PT[wi(i)];
  const TAN = PT.map((_, i) => { const a = at(i - 1), b = at(i + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
  const NOR = TAN.map(([tx, tz]) => [-tz, tx]);   /* left of the direction of travel */
  /* signed curvature (1/m, + turning left), smoothed */
  const CURV = PT.map((_, i) => { const [ax, az] = TAN[wi(i - 2 + N)], [bx, bz] = TAN[wi(i + 2)]; return Math.asin(Math.max(-1, Math.min(1, ax * bz - az * bx))) / 12; });
  const SF = nearest(PT, ...map([262, 354]));   /* start / finish line on the main straight */
  const turnIdx = TURNS.map(([n, x, y]) => [n, nearest(PT, ...map([x, y]))]);

  /* ---------- the stunt zone (east of the public road): service road all round, three lanes running north ---------- */
  const SZ = {x0:650, x1:1045, z0:750, z1:1192};
  const SJ = {x:1000, z:1069, fx:0, fz:-1, L:22, W:14, H:9, park:true};          /* super jump: low end z 1080, lip z 1058 */
  const SJ_LIP = SJ.z - SJ.L / 2, SJ_BASE = SJ.z + SJ.L / 2, SJ_LAND = {hw:17, z1:SJ_LIP, z0:SJ_LIP - 300};
  const LOOP_A = {x:900, z:1100, R:8, w:7, hw:2.8, g:20}, LOOP_B = {x:907, z:1010, R:10, w:7, hw:3.2, g:20};
  const SX = 820;                                                                  /* rollers and the three step-up jumps */
  const ROLL2 = {x:SX, zs:1182, hw:4, len:50, f:u => .7 * (1 - Math.cos(PI2 * u / 10))};
  const KICK = [{x:SX, z:1106, fx:0, fz:-1, L:8, W:8, H:2.4, park:true}, {x:SX, z:1036, fx:0, fz:-1, L:8, W:8, H:3, park:true}, {x:SX, z:955, fx:0, fz:-1, L:10, W:8, H:3.6, park:true}];
  const pw = pts => u => { for (let i = 1; i < pts.length; i++){ const [u0, y0] = pts[i - 1], [u1, y1] = pts[i]; if (u <= u1) return y0 + (y1 - y0) * (u - u0) / (u1 - u0); } return 0; };
  const MOUNDS = [{x:SX, zs:1088, hw:4, len:40, f:pw([[0, 0], [6, 2.6], [10, 2.6], [40, 0]])}, {x:SX, zs:1016, hw:4, len:46, f:pw([[0, 0], [6, 3.2], [10, 3.2], [46, 0]])},
    {x:SX, zs:932, hw:4, len:60, f:pw([[0, 0], [7, 3.6], [11, 3.6], [60, 0]])}];
  const DRIFT = {x:715, z:1095, r:30};
  RAMPS.push(SJ, ...KICK); P.SHAPES.push(ROLL2, ...MOUNDS); P.LOOPS.push(LOOP_A, LOOP_B);

  /* ---------- ground paint: circuit, pit lane, run-offs, stunt-zone lanes and service road (one mesh) ---------- */
  const G = mk(), Y0 = .1, Y1 = .125;
  /* a band beside the circuit from offset o0 to o1 (left +) over points i0..i1, colour per segment */
  function band(i0, i1, o0, o1, y, colAt){
    for (let i = i0; i < i1; i++){
      const a = at(i), b = at(i + 1), na = NOR[wi((i % N) + N)], nb = NOR[wi(((i + 1) % N) + N)];
      const c = colAt(i); if (!c) continue;
      quad(G, [a[0] + na[0] * o0, y, a[1] + na[1] * o0], [b[0] + nb[0] * o0, y, b[1] + nb[1] * o0], [b[0] + nb[0] * o1, y, b[1] + nb[1] * o1], [a[0] + na[0] * o1, y, a[1] + na[1] * o1], c, UPN);
    }
  }
  band(0, N, -HW, HW, Y0, () => ASPH);
  band(0, N, HW - .55, HW - .3, Y1, () => PAINT); band(0, N, -HW + .3, -HW + .55, Y1, () => PAINT);
  /* kerbs where it turns (both sides), gravel traps outside the slow corners */
  const tight = i => Math.abs(CURV[wi((i % N) + N)]) > 1 / 75;
  band(0, N, HW - .2, HW + 1.3, Y1, i => tight(i) || tight(i - 3) || tight(i + 3) ? ((i >> 1) % 2 ? WHITE : RED) : null);
  band(0, N, -HW - 1.3, -HW + .2, Y1, i => tight(i) || tight(i - 3) || tight(i + 3) ? ((i >> 1) % 2 ? WHITE : RED) : null);
  const slow = i => Math.abs(CURV[wi((i % N) + N)]) > 1 / 32;
  const GRAVEL = '#cdb48a';
  band(0, N, HW + 1.3, HW + 15, Y0 - .02, i => slow(i) && CURV[wi(i)] < 0 ? GRAVEL : null);   /* outside of a right-hander is the left side */
  band(0, N, -HW - 15, -HW - 1.3, Y0 - .02, i => slow(i) && CURV[wi(i)] > 0 ? GRAVEL : null);
  /* start / finish: chequered line, grid boxes behind it, a painted name */
  { const [x, z] = at(SF), [tx, tz] = TAN[SF], [nx, nz] = NOR[SF];
    for (let r = 0; r < 2; r++) for (let q = 0; q < 14; q++){ const o0 = -HW + q, o1 = o0 + 1, s0 = r * 1, s1 = s0 + 1;
      quad(G, [x + nx * o0 + tx * s0, Y1 + .01, z + nz * o0 + tz * s0], [x + nx * o1 + tx * s0, Y1 + .01, z + nz * o1 + tz * s0], [x + nx * o1 + tx * s1, Y1 + .01, z + nz * o1 + tz * s1], [x + nx * o0 + tx * s1, Y1 + .01, z + nz * o0 + tz * s1], (r + q) % 2 ? '#111111' : '#ffffff', UPN); }
    for (let k = 1; k <= 10; k++){ const s = -k * 8, o = k % 2 ? 3.5 : -3.5, p = [x + tx * s + nx * o, z + tz * s + nz * o];
      for (const [a, b, c, d] of [[-2, 1.6, -2, -1.6], [-2, 1.6, -1.6, 1.6], [-2, -1.6, -1.6, -1.6]]){ const A0 = [p[0] + tx * a + nx * b, p[1] + tz * a + nz * b], B1 = [p[0] + tx * c + nx * d, p[1] + tz * c + nz * d], l = Math.hypot(B1[0] - A0[0], B1[1] - A0[1]) || 1, mx = -(B1[1] - A0[1]) / l * .12, mz = (B1[0] - A0[0]) / l * .12;
        quad(G, [A0[0] - mx, Y1, A0[1] - mz], [B1[0] - mx, Y1, B1[1] - mz], [B1[0] + mx, Y1, B1[1] + mz], [A0[0] + mx, Y1, A0[1] + mz], PAINT, UPN); }
    }
  }
  /* pit lane: on the outside of the main straight (the side away from the back straight), with a white line and a pit wall */
  const PIT = {i0:SF + 6, i1:SF + 120, side:0};   /* the line is just after the last hairpin, so the pits run on down the straight from it */
  { const [x, z] = at(SF), [nx, nz] = NOR[SF], probe = d => { const q = ROAD.p[nearest(ROAD.p, x + nx * d, z + nz * d)]; return Math.hypot(q[0] - x - nx * d, q[1] - z - nz * d); };
    PIT.side = probe(30) > probe(-30) ? 1 : -1; }
  { const s = PIT.side; band(PIT.i0, PIT.i1, s > 0 ? HW + 4 : -HW - 14, s > 0 ? HW + 14 : -HW - 4, Y0, () => ASPH);
    band(PIT.i0, PIT.i1, s > 0 ? HW + 13.4 : -HW - 13.6, s > 0 ? HW + 13.6 : -HW - 13.4, Y1, () => PAINT);
    band(PIT.i0 - 12, PIT.i0, s > 0 ? HW : -HW - 6, s > 0 ? HW + 6 : -HW, Y0, () => ASPH); band(PIT.i1, PIT.i1 + 12, s > 0 ? HW : -HW - 6, s > 0 ? HW + 6 : -HW, Y0, () => ASPH); }
  /* the stunt zone: service road, lanes, landing strip with lines, drift pad */
  const sRect = (x0, z0, x1, z1, col, y) => flat(G, x0, z0, x1, z1, y == null ? Y0 : y, col || ASPH);
  sRect(SZ.x0 - 5, SZ.z0 - 5, SZ.x1 + 5, SZ.z0 + 5); sRect(SZ.x0 - 5, SZ.z1 - 5, SZ.x1 + 5, SZ.z1 + 5); sRect(SZ.x0 - 5, SZ.z0 - 5, SZ.x0 + 5, SZ.z1 + 5); sRect(SZ.x1 - 5, SZ.z0 - 5, SZ.x1 + 5, SZ.z1 + 5);
  { const r = ROAD.p, i = nearest(r, SZ.x0, SZ.z0); sRect(Math.min(r[i][0], SZ.x0) - 4, SZ.z0 - 5, SZ.x0, SZ.z0 + 5); }   /* joins the public road */
  for (const z of [SZ.z0, SZ.z1]) for (const s of [-1, 1]) sRect(SZ.x0, z + s * 4.6 - .15, SZ.x1, z + s * 4.6 + .15, PAINT, Y1);
  const lane = (x, hw, z0, z1) => { sRect(x - hw, z0, x + hw, z1); for (const s of [-1, 1]) sRect(x + s * (hw - .35) - .18, z0, x + s * (hw - .35) + .18, z1, PAINT, Y1); };
  lane(SJ.x, 8, SJ_BASE, SZ.z1 - 5); lane(SJ.x, SJ_LAND.hw, SJ_LAND.z0, SJ_LIP);
  for (let d = 25; SJ_LIP - d >= SJ_LAND.z0; d += 25){ const z = SJ_LIP - d; sRect(SJ.x - SJ_LAND.hw + .5, z - (d % 100 ? .3 : .55), SJ.x + SJ_LAND.hw - .5, z + (d % 100 ? .3 : .55), d % 100 ? PAINT : '#ffd23a', Y1); }
  for (let z = SZ.z1 - 5, k = 0; z > SJ_BASE; z -= 3, k++) for (const s of [-1, 1]) sRect(SJ.x + s * 8 - .6, Math.max(SJ_BASE, z - 3), SJ.x + s * 8 + .6, z, k % 2 ? WHITE : RED, Y1);
  lane(LOOP_A.x, 3.5, LOOP_A.z, SZ.z1 - 5); lane(LOOP_B.x, 3.8, LOOP_B.z, LOOP_A.z); lane(LOOP_B.x + LOOP_B.w, 3.8, SZ.z0 + 5, LOOP_B.z);
  lane(SX, 4.5, SZ.z0 + 5, SZ.z1 - 5);
  { const ring = (r0, r1, col, y) => { for (let k = 0; k < 72; k++){ const a0 = PI2 * k / 72, a1 = PI2 * (k + 1) / 72, Q = (r, a) => [DRIFT.x + Math.cos(a) * r, y, DRIFT.z + Math.sin(a) * r]; quad(G, Q(r0, a0), Q(r1, a0), Q(r1, a1), Q(r0, a1), typeof col === 'function' ? col(k) : col, UPN); } };
    ring(0, DRIFT.r, ASPH, Y0); ring(DRIFT.r - 1.3, DRIFT.r, k => k % 2 ? WHITE : RED, Y1); ring(9, 9.6, PAINT, Y1); ring(18, 18.5, PAINT, Y1); ring(0, 1.4, '#ffd23a', Y1);
    sRect(DRIFT.x + DRIFT.r - 4, DRIFT.z - 4, SZ.x0 + 5, DRIFT.z + 4); }
  { const m = new THREE.Mesh(toGeo(G), regWet(M('#ffffff', {vertexColors:true, roughness:.85, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-40}), .3)); m.receiveShadow = true; scene.add(m); }   /* stronger than the road's markings (js/13-outskirts.js), so the back straight reads as circuit */

  /* ---------- printed boards: one atlas (turn numbers, names, ads), one mesh ---------- */
  const CELLS = [['雪邦赛道 · 汽车游乐园二园', '#c8322a', '#ffffff'], ['超级大跳台', '#1f2a33', '#ffd23a'], ['双回环', '#1b5aa6', '#ffffff'], ['三连跳', '#2f6f3e', '#ffffff'],
    ['维修区 PIT LANE', '#e8e4dc', '#c8322a'], ['赛事控制中心', '#1f2a33', '#ffffff'], ['奶娃汽水 · 一口气跑一圈', '#e8412c', '#ffffff'], ['芙蓉湖轮胎 · 抓地一流', '#111111', '#ffd23a'],
    ['雪邦机油 · 转得更久', '#ffd23a', '#1f2a33'], ['XMUM 车行 · 兰博鸡尼到货', '#2a3f8f', '#ffffff'], ['飞跃保险 · 落地才算数', '#2b9a8f', '#ffffff'], ['油棕园公路 · 与赛道共用', '#3d3d3d', '#ff8a3d'],
    ['漂移广场', '#e48aa8', '#ffffff'], ['雪兰莪飞车俱乐部', '#3d3d3d', '#ffd23a'], ['START · FINISH', '#ffffff', '#111111', 'chk'], ['小心横穿 · 平交路口', '#ffd23a', '#c8322a']];
  const SH = 112, NUM0 = 16 * SH, atlas = (() => {   /* 16 strips of 1024 x 112, then two rows of 128-px turn numbers: 1024 x 2048 in all */
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 2048; const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    CELLS.forEach(([t, bg, fg, deco], i) => { const y = i * SH; g.fillStyle = bg; g.fillRect(0, y, 1024, SH);
      if (deco === 'chk') for (let k = 0; k < 64; k++){ g.fillStyle = (k + (k > 31 ? 1 : 0)) % 2 ? '#111111' : '#ffffff'; g.fillRect((k % 32) * 32, y + (k > 31 ? SH - 14 : 0), 32, 14); }
      g.fillStyle = fg; g.font = `900 ${t.length > 10 ? 58 : 76}px sans-serif`; g.fillText(t, 512, y + SH / 2 + 2, 980); });
    for (let n = 1; n <= 15; n++){ const x = ((n - 1) % 8) * 128, y = NUM0 + Math.floor((n - 1) / 8) * 128; g.fillStyle = '#ffffff'; g.fillRect(x + 4, y + 4, 120, 120); g.strokeStyle = '#c8322a'; g.lineWidth = 10; g.strokeRect(x + 9, y + 9, 110, 110); g.fillStyle = '#1f2a33'; g.font = '900 72px sans-serif'; g.fillText(String(n), x + 64, y + 68); }
    const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO; return t;
  })();
  const AH = 2048, AB = {p:[], uv:[], n:[]};
  function board(x, z, y0, w, h, f, u0, v0, u1, v1, both){
    const rx = f[1], rz = -f[0], o = .03;
    const put = (fx, fz, sx) => { const ax = x + fx * o - rx * sx * w / 2, az = z + fz * o - rz * sx * w / 2, bx = x + fx * o + rx * sx * w / 2, bz = z + fz * o + rz * sx * w / 2;
      AB.p.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az); AB.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); for (let k = 0; k < 6; k++) AB.n.push(fx, 0, fz); };
    put(f[0], f[1], 1); if (both) put(-f[0], -f[1], -1);
  }
  const strip = (cell, x, z, y0, w, h, f, both) => board(x, z, y0, w, h, f, 0, 1 - (cell + 1) * SH / AH, 1, 1 - cell * SH / AH, both);
  const num = (n, x, z, y0, s, f) => { const c = (n - 1) % 8, r = Math.floor((n - 1) / 8); board(x, z, y0, s, s, f, c / 8, 1 - (NUM0 + (r + 1) * 128) / AH, (c + 1) / 8, 1 - (NUM0 + r * 128) / AH, true); };

  /* ---------- structures (one merged mesh): pits, tower, grandstands, gantry, tyre-wall bases, light masts, stunt kit, arches ---------- */
  const SB = mk(), parts = [], box = (w, h, d, x, y, z, c, ry) => parts.push(geoTint(geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, 0, ry || 0, 0), c));
  const yawOf = ([tx, tz]) => Math.atan2(tx, tz);
  /* pit building: garages along the outside of the pit lane, control tower near the line */
  { const s = PIT.side, off = s * (HW + 20), seg = 12;
    for (let i = PIT.i0; i < PIT.i1; i += seg){
      const [x, z] = at(i + seg / 2), [nx, nz] = NOR[wi(i + seg / 2)], ry = yawOf(TAN[wi(i + seg / 2)]), cx = x + nx * off, cz = z + nz * off;
      box(10, 7, seg * 3 - .4, cx, 3.5, cz, '#e8e4dc', ry);
      const dx = x + nx * (off - s * 5.05), dz = z + nz * (off - s * 5.05);
      for (let d = -1; d <= 1; d++) box(.15, 4.2, 10.4, dx + TAN[wi(i + seg / 2)][0] * d * 12, 2.1, dz + TAN[wi(i + seg / 2)][1] * d * 12, ['#c8322a', '#1b5aa6', '#ffd23a', '#2f6f3e', '#1f2a33', '#e8412c', '#7b7f85'][((i / seg | 0) * 3 + d + 1) % 7], ry);
      addBox(cx, cz, seg * 1.5, 5.2, ry - Math.PI / 2);
    }
    const [x, z] = at(SF + 20), [nx, nz] = NOR[wi(SF + 20)], tx = x + nx * (off + s * 12), tz = z + nz * (off + s * 12), ry = yawOf(TAN[wi(SF + 20)]);
    box(8, 16, 8, tx, 8, tz, '#d9d4c8', ry); box(11, 5, 11, tx, 18.5, tz, '#5d7fa3', ry); box(12, .6, 12, tx, 21.3, tz, '#1f2a33', ry);
    addBox(tx, tz, 4.2, 4.2, -ry);
    for (let k = 0; k < 4; k++){ const a = ry + k * Math.PI / 2; strip(5, tx + Math.sin(a) * 5.8, tz + Math.cos(a) * 5.8, 21.7, 11, 1.4, [Math.sin(a), Math.cos(a)]); }
    const [px, pz] = at(SF + 30), [pnx, pnz] = NOR[wi(SF + 30)]; strip(4, px + pnx * (off - s * 5.6), pz + pnz * (off - s * 5.6), 7.4, 30, 2.6, [-pnx * s, -pnz * s]);
    /* pit wall between the track and the pit lane */
    for (let i = PIT.i0 + 2; i < PIT.i1 - 2; i += 2){ const [ax, az] = at(i), [n1, n2] = NOR[wi(i)]; box(.5, .9, 6.2, ax + n1 * s * (HW + 2), .45, az + n2 * s * (HW + 2), (i >> 1) % 2 ? '#e8e4dc' : '#c8322a', yawOf(TAN[wi(i)])); }
  }
  /* start-light gantry over the line */
  { const [x, z] = at(SF + 2), [nx, nz] = NOR[wi(SF + 2)], ry = yawOf(TAN[wi(SF + 2)]);
    for (const s of [-1, 1]){ box(.8, 9, .8, x + nx * s * (HW + 1.5), 4.5, z + nz * s * (HW + 1.5), '#3b3f44'); addCircle(x + nx * s * (HW + 1.5), z + nz * s * (HW + 1.5), .6); }
    box(2 * HW + 4, 1.4, 1, x, 8.8, z, '#1f2a33', ry);
    strip(14, x, z, 9.6, 2 * HW + 2, 1.6, [-TAN[wi(SF + 2)][0], -TAN[wi(SF + 2)][1]], true);
  }
  /* grandstands: rows of seats, a back wall, a roof, ads on the fascia; the crowd sits on them */
  const seats = [];
  function stand(cx, cz, len, rows, face, roofAds){
    const fx = Math.sin(face), fz = Math.cos(face), rx = fz, rz = -fx, D = rows * 1.4;
    for (let r = 0; r < rows; r++){ const h = (r + 1) * .6 + .4, d = (r + .5) * 1.4, x = cx - fx * d, z = cz - fz * d;
      box(len, h, 1.4, x, h / 2, z, r % 3 === 0 ? '#c8322a' : r % 3 === 1 ? '#e8e4dc' : '#2f86d6', face);
      for (let s = -len / 2 + .7; s < len / 2 - .5; s += 1.15) if (rr() < FILL) seats.push([x + rx * s + fx * .1, h, z + rz * s + fz * .1, face]); }
    const top = rows * .6 + .4, roofY = top + 4.2, bx = cx - fx * (D + .3), bz = cz - fz * (D + .3);
    box(len, roofY + .6, .6, bx, (roofY + .6) / 2, bz, '#8d9196', face);
    box(len + 1, .35, D + 2.5, cx - fx * (D / 2 - 1), roofY, cz - fz * (D / 2 - 1), '#e8e4dc', face);
    if (roofAds) for (let s = -len / 2 + 7; s < len / 2 - 5; s += 13) strip(6 + ((s * 7) & 7), cx + fx * 2.25 + rx * s, cz + fz * 2.25 + rz * s, roofY - .9, 11, 1.4, [fx, fz]);
    addBox(cx - fx * D / 2, cz - fz * D / 2, len / 2 + .3, D / 2 + .5, face);
  }
  /* main grandstand: on the infield of the main straight, facing it (Sepang's sits between the two straights) */
  { const i = SF + 60, [x, z] = at(i), s = -PIT.side, [nx, nz] = NOR[wi(i)], off = s * (HW + 4);
    const face = Math.atan2(-nx * s, -nz * s), ry = yawOf(TAN[wi(i)]);
    stand(x + nx * off, z + nz * off, 120, 10, face, true);
    void ry; }
  /* T15 stand outside the hairpin and a T1 stand */
  for (const [n, d, len, rows] of [[1, 26, 60, 8]]){   /* (no room outside 15: the public road runs past it) */
    const i = turnIdx.find(t => t[0] === n)[1], [x, z] = at(i), c = CURV[wi(i)], s = c > 0 ? -1 : 1, [nx, nz] = NOR[wi(i)];
    stand(x + nx * s * d, z + nz * s * d, len, rows, Math.atan2(-nx * s, -nz * s), true);
  }
  /* stunt zone stands: west of the super-jump landing strip, by the double loop, by the step-up jumps */
  stand(SJ.x - SJ_LAND.hw - 12, 880, 90, 9, Math.PI / 2, true);
  stand(LOOP_A.x - LOOP_A.hw - 6, 1062, 56, 7, Math.PI / 2, true);
  stand(SX - 16, 1010, 90, 8, Math.PI / 2, true);
  /* more stands round the circuit, outside the corners, wherever the footprint is clear of the track and the public road */
  { const clear = (cx, cz, fx, fz, len, D) => {
      const rx = fz, rz = -fx;
      for (let a = -len / 2; a <= len / 2; a += 5) for (let d = -2; d <= D + 4; d += 4){ const x = cx + rx * a - fx * d, z = cz + rz * a - fz * d;
        for (let j = 0; j < N; j += 2) if (Math.hypot(PT[j][0] - x, PT[j][1] - z) < HW + 4) return false;
        const q = ROAD.p[nearest(ROAD.p, x, z)]; if (Math.hypot(q[0] - x, q[1] - z) < ROAD.w / 2 + 4) return false;
        if (x < PAD.x0 + 5 || x > PAD.x1 - 5 || z < PAD.z0 + 5 || z > PAD.z1 - 5) return false; }
      return true; };
    for (const [n, len, rows] of [[4, 70, 8], [9, 60, 8], [11, 70, 8], [13, 50, 7], [5, 50, 7]]){
      const i = turnIdx.find(t => t[0] === n)[1], [x, z] = at(i), s = CURV[wi(i)] > 0 ? -1 : 1, [nx, nz] = NOR[wi(i)];
      for (const d of [24, 30, 38]){
        const cx = x + nx * s * d, cz = z + nz * s * d, face = Math.atan2(-nx * s, -nz * s);
        if (clear(cx, cz, Math.sin(face), Math.cos(face), len, rows * 1.4)){ stand(cx, cz, len, rows, face, true); break; }
      }
    }
  }
  /* a food plaza with tents where the public road comes in at the north (its paving goes in the grass mesh below) */
  const PLAZAS = [];
  { const PZ = {x0:662, x1:760, z0:700, z1:742};
    PLAZAS.push(PZ);
    const STR = [['#c8322a', '#ffffff'], ['#1b5aa6', '#ffffff'], ['#ffd23a', '#e8412c'], ['#2f6f3e', '#ffffff']];
    let k = 0;
    for (let x = PZ.x0 + 8; x < PZ.x1 - 4; x += 13) for (const z of [711, 731]){
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.12, 2.6, .12, x + sx * 2.4, 1.3, z + sz * 2.4, '#d9dcdf');
      const g = new THREE.ConeGeometry(3.7, 1.8, 8, 1, true).toNonIndexed(), n = g.attributes.position.count, cl = new Float32Array(n * 3), [c0, c1] = STR[k++ % 4].map(c => new THREE.Color(c));
      for (let q = 0; q < n; q++){ const c = Math.floor(q / 3) % 2 ? c0 : c1; cl[q * 3] = c.r; cl[q * 3 + 1] = c.g; cl[q * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv'); g.computeVertexNormals(); parts.push(geoAt(g, x, 3.5, z, 0, Math.PI / 8, 0));
      box(4.4, 1.1, 1, x, .55, z + 1.8, '#e8e4dc'); addBox(x, z, 2.5, 2.5, 0);
    }
  }

  /* tyre walls outside the slow corners (instanced tyres; one collider per stretch) */
  const TY = [];
  { let run = null; const flush = () => { if (run && run.length > 6){ const a = run[0], b = run[run.length - 1], cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]); addBox(cx, cz, L / 2 + .5, .7, -Math.atan2(b[1] - a[1], b[0] - a[0])); } run = null; };
    for (let i = 0; i < N; i++){
      const c = CURV[i]; if (!(Math.abs(c) > 1 / 32) || (i % 2)){ if (!(Math.abs(c) > 1 / 32)) flush(); continue; }
      const s = c > 0 ? -1 : 1, [x, z] = at(i), [nx, nz] = NOR[i], o = s * (HW + 16.5), px = x + nx * o, pz = z + nz * o;
      /* not across the public road, the pit lane or another part of the track */
      if (Math.hypot(...ROAD.p[nearest(ROAD.p, px, pz)].map((v, k) => v - [px, pz][k])) < 12){ flush(); continue; }
      let clash = false; for (let j = 0; j < N; j += 4) if (Math.abs(j - i) > 30 && Math.abs(j - i) < N - 30 && Math.hypot(PT[j][0] - px, PT[j][1] - pz) < HW + 6){ clash = true; break; }
      if (clash){ flush(); continue; }
      (run || (run = [])).push([px, pz]);
      for (let h = 0; h < (TOUCH ? 2 : 3); h++) TY.push([px, h * .3 + .15, pz, h === (TOUCH ? 1 : 2) ? ((i >> 1) % 2 ? '#c8322a' : '#f4f1ea') : '#1c1c1e']);
      if (run.length > 18){ flush(); run = [[px, pz]]; }
    }
    flush();
  }

  /* light masts round the park (heads glow at night) */
  const glowParts = [], LIGHTS = [];
  for (let i = 0; i < N; i += 70){ const [x, z] = at(i), c = CURV[i]; const s = c > 0 ? -1 : 1, [nx, nz] = NOR[i], px = x + nx * s * (HW + 32), pz = z + nz * s * (HW + 32);
    if (Math.hypot(...ROAD.p[nearest(ROAD.p, px, pz)].map((v, k) => v - [px, pz][k])) < 14) continue;
    let ok = true; for (let j = 0; j < N; j += 3) if (Math.hypot(PT[j][0] - px, PT[j][1] - pz) < HW + 8){ ok = false; break; } if (ok) LIGHTS.push([px, pz]); }
  LIGHTS.push([SZ.x0 + 12, SZ.z0 + 15], [SZ.x1 - 12, SZ.z0 + 15], [SZ.x0 + 12, SZ.z1 - 15], [SZ.x1 - 12, SZ.z1 - 15], [SJ.x - 30, 980], [SJ.x + 30, 980]);
  for (const [x, z] of LIGHTS){
    parts.push(geoTint(geoAt(new THREE.CylinderGeometry(.22, .4, 24, 6, 1, true), x, 12, z), '#9aa0a6')); addCircle(x, z, .6);
    const f = Math.atan2(250 - x, 950 - z); box(4.6, 2.4, .5, x + Math.sin(f) * .6, 24.5, z + Math.cos(f) * .6, '#2b2e33', f);
    glowParts.push(geoAt(new THREE.BoxGeometry(4, 1.9, .1), x + Math.sin(f) * .9, 24.5, z + Math.cos(f) * .9, 0, f, 0));
  }
  /* turn-number boards on the outside of each corner, ads along the straights */
  for (const [n, i] of turnIdx){ const c = CURV[wi(i)], s = c > 0 ? -1 : 1, [x, z] = at(i), [nx, nz] = NOR[wi(i)], o = s * (HW + 9);
    box(.15, 2.4, .15, x + nx * o, 1.2, z + nz * o, '#9aa0a6'); num(n, x + nx * o, z + nz * o, 2.4, 2.2, [-nx * s, -nz * s]); }
  for (let i = 0; i < N; i += 9){
    if (Math.abs(CURV[i]) > 1 / 120) continue;
    for (const s of [-1, 1]){
      if (i > PIT.i0 - 15 && i < PIT.i1 + 15 && s === PIT.side) continue;
      const [x, z] = at(i), [nx, nz] = NOR[i], o = s * (HW + 6), px = x + nx * o, pz = z + nz * o;
      if (Math.hypot(...ROAD.p[nearest(ROAD.p, px, pz)].map((v, k) => v - [px, pz][k])) < 9) continue;
      let ok = true; for (let j = 0; j < N; j += 3) if (Math.abs(j - i) > 8 && Math.abs(j - i) < N - 8 && Math.hypot(PT[j][0] - px, PT[j][1] - pz) < HW + 3){ ok = false; break; }
      if (!ok) continue;
      box(.12, 1.1, 6, px, .55, pz, '#e8e4dc', yawOf(TAN[i]) + 0);
      strip(6 + ((i / 9) & 7), px - nx * s * .07, pz - nz * s * .07, .02, 6, 1.06, [-nx * s, -nz * s]);
    }
  }

  /* ---------- the stunt kit: super jump, kickers, rollers, mounds, two loops ---------- */
  P.solid(SB, SJ.x, SJ_BASE, SJ.W / 2, P.kickProf(SJ, 12), i => i % 2 ? WHITE : RED, RED, k => k % 2 ? WHITE : RED);
  { const a = Math.atan2(SJ.H, SJ.L), Lr = Math.hypot(SJ.L, SJ.H);
    for (const s of [-1, 1]){ const x = SJ.x + s * (SJ.W / 2 + .18); parts.push(geoTint(geoAt(new THREE.BoxGeometry(.16, .16, Lr), x, SJ.H / 2 + 1.05, SJ.z, a, 0, 0), WHITE));
      for (let k = 0; k <= 8; k++){ const u = SJ.L * k / 8; parts.push(geoTint(geoAt(new THREE.BoxGeometry(.18, 1.1, .18), x, SJ.H * u / SJ.L + .5, SJ_BASE - u), k % 2 ? WHITE : RED)); } } }
  for (const K of KICK) P.solid(SB, K.x, K.z + K.L / 2, K.W / 2, P.kickProf(K, 6), i => i % 2 ? WHITE : RED, RED, k => k % 2 ? WHITE : RED);
  P.solid(SB, ROLL2.x, ROLL2.zs, ROLL2.hw, P.sample(ROLL2.f, ROLL2.len, .5), (i, u0) => Math.floor(u0 / 5) % 2 ? DARK : YEL, DARK);
  for (const Mo of MOUNDS) P.solid(SB, Mo.x, Mo.zs, Mo.hw, P.sample(Mo.f, Mo.len, 1.5), (i, u0) => u0 < 6 ? (i % 2 ? WHITE : RED) : (i % 2 ? '#7b7f85' : '#8f939a'), '#8a6a4a');
  for (const LP of [LOOP_A, LOOP_B]){
    const Nn = 96, Pp = (th, off, d) => { const s = Math.sin(th), c = Math.cos(th), lat = LP.w * th / PI2 + off; return [LP.x + lat, LP.R * (1 - c) + c * d, LP.z - LP.R * s + s * d]; };
    for (let i = 0; i < Nn; i++){
      const t0 = PI2 * i / Nn, t1 = PI2 * (i + 1) / Nn, n = [0, Math.cos((t0 + t1) / 2), Math.sin((t0 + t1) / 2)], no = [0, -n[1], -n[2]];
      quad(SB, Pp(t0, -LP.hw, .03), Pp(t0, LP.hw, .03), Pp(t1, LP.hw, .03), Pp(t1, -LP.hw, .03), Math.floor(i / 4) % 2 ? WHITE : (LP === LOOP_A ? RED : '#1b5aa6'), n);
      quad(SB, Pp(t0, -LP.hw, -.3), Pp(t0, LP.hw, -.3), Pp(t1, LP.hw, -.3), Pp(t1, -LP.hw, -.3), '#8d9196', no);
      for (const s of [-1, 1]){ const off = s * LP.hw; quad(SB, Pp(t0, off, .03), Pp(t1, off, .03), Pp(t1, off, -.3), Pp(t0, off, -.3), WHITE, [s, 0, 0]); }
    }
    const xa = LP.x - LP.hw - 1.6, xb = LP.x + LP.w + LP.hw + 1.6;
    for (const x of [xa, xb]){ box(.7, LP.R, .7, x, LP.R / 2, LP.z, '#3b3f44'); addCircle(x, LP.z, .5); }
    parts.push(geoTint(geoAt(new THREE.CylinderGeometry(.22, .22, xb - xa, 8), (xa + xb) / 2, LP.R, LP.z, 0, 0, Math.PI / 2), '#3b3f44'));
    for (const x of [LP.x - LP.hw - .5, LP.x + LP.w + LP.hw + .5]){ addBox(x, LP.z, .2, LP.R + 1, 0); for (let k = 0; k < 6; k++){ const z0 = LP.z - LP.R - 1 + (2 * LP.R + 2) * k / 6; box(.4, .9, (2 * LP.R + 2) / 6, x, .45, z0 + (LP.R + 1) / 6, k % 2 ? WHITE : RED); } }
  }
  /* banners over the three stunt lanes where they leave the service road */
  for (const [x, hw, cell] of [[SJ.x, 11, 1], [LOOP_A.x, 7, 2], [SX, 8, 3]]){
    for (const s of [-1, 1]){ box(.6, 7.6, .6, x + s * hw, 3.8, SZ.z1 - 12, '#3b3f44'); addBox(x + s * hw, SZ.z1 - 12, .4, .4, 0); }
    box(2 * hw + .6, 1.8, .4, x, 7.5, SZ.z1 - 12, '#1f2a33'); strip(cell, x, SZ.z1 - 11.78, 6.7, 2 * hw - .4, 1.6, [0, 1], true);
  }
  /* entrance arches over the public road where it comes into the park, and a level-crossing sign by the 7–8 crossing */
  function arch(i, cell){
    const [x, z] = ROAD.p[i], a = ROAD.p[Math.max(0, i - 1)], b = ROAD.p[Math.min(ROAD.p.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l, nx = -tz, nz = tx, ry = Math.atan2(tx, tz), w = ROAD.w / 2 + 9;   /* pillars well clear of the tarmac: the road bends at the north gate */
    for (const s of [-1, 1]){ box(2.2, 13, 2.2, x + nx * s * w, 6.5, z + nz * s * w, '#c8322a'); addCircle(x + nx * s * w, z + nz * s * w, 1.3); }
    box(2 * w + 3, 3.2, 1.4, x, 11.4, z, '#1f2a33', ry);
    strip(cell, x - tx * .72, z - tz * .72, 10, 2 * w + 1.6, 2.9, [-tx, -tz]); strip(cell, x + tx * .72, z + tz * .72, 10, 2 * w + 1.6, 2.9, [tx, tz]);
  }
  arch(nearest(ROAD.p, 636, PAD.z0 + 8), 0); arch(nearest(ROAD.p, PAD.x0 + 15, 1135), 0);
  { /* where the public road crosses the circuit */
    let bi = 0, bd = 1e9, bj = 0; for (let j = 0; j < ROAD.p.length; j++){ const [x, z] = ROAD.p[j]; if (z > 905 || z < 700) continue; for (let i = 0; i < N; i += 2){ const d = Math.hypot(PT[i][0] - x, PT[i][1] - z); if (d < bd){ bd = d; bi = i; bj = j; } } }
    if (bd < 6){ const [x, z] = PT[bi], [nx, nz] = NOR[bi]; for (const s of [-1, 1]){ const px = x + nx * s * (HW + 7), pz = z + nz * s * (HW + 7); box(.15, 3, .15, px, 1.5, pz, '#9aa0a6'); strip(15, px, pz, 3, 6, .75, [-nx * s, -nz * s], true); } P.CROSS = [x, z]; }
  }

  /* mown-grass stripes over the whole park, its own mesh with a light depth offset so the public road and the paint stay on top */
  { const GS = mk(), A = new THREE.Color('#38592a'), B = new THREE.Color('#406532');   /* the hills' greens times their grey material (js/12-terrain.js) */
    for (let x = PAD.x0, k = 0; x < PAD.x1; x += 14, k++) flat(GS, x, PAD.z0, Math.min(PAD.x1, x + 14), PAD.z1, .015, k % 2 ? '#' + A.getHexString() : '#' + B.getHexString());
    for (const PZ of PLAZAS) for (let x = PZ.x0; x < PZ.x1; x += 4) for (let z = PZ.z0; z < PZ.z1; z += 4) flat(GS, x, z, Math.min(PZ.x1, x + 4), Math.min(PZ.z1, z + 4), .045, ((x / 4 + z / 4) & 1) ? '#9a9387' : '#8c857a');
    const m = new THREE.Mesh(toGeo(GS), regWet(M('#ffffff', {vertexColors:true, roughness:.95, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-2}), .5)); m.receiveShadow = true; scene.add(m); }

  /* ---------- the meshes ---------- */
  { const sg = toGeo(SB); parts.unshift(sg); const m = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.6, side:THREE.DoubleSide})); m.castShadow = m.receiveShadow = true; scene.add(m); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(AB.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(AB.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(AB.uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map:atlas, roughness:.6, emissive:'#ffffff', emissiveMap:atlas, emissiveIntensity:.12})); m.receiveShadow = true; scene.add(m); var boardMat = m.material; }
  const glowMat = new THREE.MeshStandardMaterial({color:'#fff6d8', emissive:'#fff1c0', emissiveIntensity:.2});
  scene.add(new THREE.Mesh(geoMerge(glowParts), glowMat));
  if (TY.length){
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, .45, .3, 10), M('#ffffff', {roughness:.85}), TY.length), m4 = new THREE.Matrix4(), c = new THREE.Color();
    TY.forEach(([x, y, z, col], i) => { im.setMatrixAt(i, m4.makeTranslation(x, y, z)); im.setColorAt(i, c.set(col)); });
    im.castShadow = !TOUCH; im.receiveShadow = true; im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(200, 1, 930), 520); scene.add(im);
  }
  const CR = {body:null, head:null, cheer:0, t:0, ph:[]};
  if (seats.length){
    const SHIRT = ['#c8322a', '#2f86d6', '#ffd23a', '#f4f1ea', '#2f6f3e', '#e48aa8', '#1f2a33', '#ff8a3d'].map(c => new THREE.Color(c)), SKIN = ['#f1c9a5', '#d9a77e', '#a8714a', '#f4d8be'].map(c => new THREE.Color(c));
    const mkIm = (geo, cols) => { const im = new THREE.InstancedMesh(geo, M('#ffffff', {roughness:.8}), seats.length); seats.forEach((_, i) => im.setColorAt(i, cols[(rr() * cols.length) | 0])); im.receiveShadow = true;
      im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(450, 4, 930), 650); scene.add(im); return im; };
    CR.body = mkIm(new THREE.BoxGeometry(.5, .62, .36).translate(0, .31, 0), SHIRT); CR.head = mkIm(new THREE.BoxGeometry(.3, .3, .3).translate(0, .8, 0), SKIN);
    CR.ph = seats.map(() => rr() * PI2);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  function crowdPose(t){ if (!CR.body) return;
    seats.forEach(([x, y, z, f], i) => { const up = CR.cheer > 0 ? Math.max(0, Math.sin(t * 11 + CR.ph[i])) * .45 * Math.min(1, CR.cheer) : 0;
      _m.compose(_p.set(x, y + up, z), _q.setFromAxisAngle(UP, f), _s); CR.body.setMatrixAt(i, _m); CR.head.setMatrixAt(i, _m); });
    CR.body.instanceMatrix.needsUpdate = CR.head.instanceMatrix.needsUpdate = true; }
  crowdPose(0);

  /* big screens: by the main grandstand (facing the straight) and at the stunt zone (facing the super jump) */
  const SCREENS = [];
  function bigScreen(x, z, f){
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288; const tex = new THREE.CanvasTexture(cv);
    const W = 20, H = 11.25, y0 = 7, rx = Math.cos(f), rz = -Math.sin(f);
    const fr = new THREE.Mesh(geoMerge([geoTint(geoAt(new THREE.BoxGeometry(W + 1, H + 1, .8), x, y0 + H / 2, z, 0, f, 0), '#1f2a33'),
      ...[-1, 1].map(s => geoTint(geoAt(new THREE.BoxGeometry(.8, y0, .8), x + rx * s * W * .35, y0 / 2, z + rz * s * W * .35), '#3b3f44'))]), M('#ffffff', {vertexColors:true, roughness:.6}));
    fr.castShadow = true; scene.add(fr); for (const s of [-1, 1]) addCircle(x + rx * s * W * .35, z + rz * s * W * .35, .6);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({map:tex, toneMapped:false})); m.position.set(x + Math.sin(f) * .42, y0 + H / 2, z + Math.cos(f) * .42); m.rotation.y = f; scene.add(m);
    SCREENS.push({cv, g:cv.getContext('2d'), tex, m});
  }
  { const i = SF + 70, [x, z] = at(i), s = PIT.side, [nx, nz] = NOR[wi(i)], o = s * (HW + 52); bigScreen(x + nx * o, z + nz * o, Math.atan2(-nx * s, -nz * s)); }   /* behind the pits, over their roofs */
  bigScreen(SJ.x - 40, 760, Math.atan2(SJ.x - (SJ.x - 40), SJ_BASE - 760) );
  const fmtT = P.fmtT, fmt2 = t => t == null ? '—' : Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');
  function screens(big, sub){
    for (const S of SCREENS){ const g = S.g;
      g.fillStyle = '#0d1420'; g.fillRect(0, 0, 512, 288); g.fillStyle = '#c8322a'; g.fillRect(0, 0, 512, 44); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; g.font = '800 26px sans-serif'; g.fillText('雪邦赛道 · 汽车游乐园二园', 256, 23);
      g.fillStyle = '#ffd23a'; g.font = '900 64px sans-serif'; g.fillText(big, 256, 112, 490);
      g.fillStyle = '#e8edf2'; g.font = '700 26px sans-serif'; g.fillText(sub, 256, 170, 490);
      const b = prog.best; g.fillStyle = '#1f2a33'; g.fillRect(0, 222, 512, 66); g.fillStyle = '#9fd3ff'; g.font = '700 24px sans-serif';
      g.fillText(`最快一圈 ${fmt2(b.sepLap)}  ·  超级大跳台 ${b.bigjump2 != null ? b.bigjump2 + ' 米' : '—'}`, 256, 255, 496); S.tex.needsUpdate = true; }
  }
  screens('雪邦赛道', '一圈约 ' + (LEN / 1000).toFixed(1) + ' 公里 · 从起点线出发计时');

  /* ---------- labels and the minimap ---------- */
  addLabel('汽车游乐园二园 · 雪邦赛道', ...(() => { const [x, z] = at(SF); return [x, 16, z]; })());
  addLabel('超级大跳台', SJ.x, SJ.H + 5, SJ.z, true); addLabel('双回环', LOOP_A.x + 4, 2 * LOOP_B.R + 5, (LOOP_A.z + LOOP_B.z) / 2, true);
  addLabel('三连跳', SX, 6, 1030, true); addLabel('漂移广场', DRIFT.x, 4, DRIFT.z, true); addLabel('维修区', ...(() => { const [x, z] = at(SF + 60), [nx, nz] = NOR[wi(SF + 60)], o = PIT.side * (HW + 22); return [x + nx * o, 10, z + nz * o]; })(), true);
  for (const [n, i] of turnIdx) if ([1, 4, 9, 15].includes(n)){ const [x, z] = at(i); addLabel(n + ' 号弯', x, 4, z, true); }
  if (typeof drawOutMini === 'function'){
    const miniBase = drawOutMini;
    drawOutMini = function(mg, X, Z, k){
      miniBase(mg, X, Z, k);
      mg.lineJoin = 'round'; mg.lineCap = 'round';
      mg.strokeStyle = '#8f8b84'; mg.lineWidth = Math.max(2.5, HW * 2 * k); mg.beginPath(); for (let i = 0; i <= N; i += 3){ const [x, z] = at(i); i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z)); } mg.closePath(); mg.stroke();
      mg.strokeStyle = '#ffffff'; mg.lineWidth = 1; mg.beginPath(); { const [x, z] = at(SF), [nx, nz] = NOR[SF]; mg.moveTo(X(x + nx * HW), Z(z + nz * HW)); mg.lineTo(X(x - nx * HW), Z(z - nz * HW)); } mg.stroke();
      mg.fillStyle = '#8f8b84';
      const r = (x0, z0, x1, z1) => mg.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
      r(SZ.x0 - 5, SZ.z0 - 5, SZ.x1 + 5, SZ.z0 + 5); r(SZ.x0 - 5, SZ.z1 - 5, SZ.x1 + 5, SZ.z1 + 5); r(SZ.x0 - 5, SZ.z0, SZ.x0 + 5, SZ.z1); r(SZ.x1 - 5, SZ.z0, SZ.x1 + 5, SZ.z1);
      r(SJ.x - 8, SJ_BASE, SJ.x + 8, SZ.z1); r(SJ.x - SJ_LAND.hw, SJ_LAND.z0, SJ.x + SJ_LAND.hw, SJ_LIP); r(LOOP_A.x - 3.5, LOOP_A.z, LOOP_A.x + 3.5, SZ.z1); r(LOOP_B.x + LOOP_B.w - 3.8, SZ.z0, LOOP_B.x + LOOP_B.w + 3.8, LOOP_B.z); r(SX - 4.5, SZ.z0, SX + 4.5, SZ.z1);
      mg.beginPath(); mg.arc(X(DRIFT.x), Z(DRIFT.z), DRIFT.r * k, 0, 7); mg.fill();
      mg.fillStyle = '#e8412c'; mg.beginPath(); mg.moveTo(X(SJ.x), Z(SJ_LIP) - 3); mg.lineTo(X(SJ.x + 7) + 2, Z(SJ_BASE) + 2); mg.lineTo(X(SJ.x - 7) - 2, Z(SJ_BASE) + 2); mg.closePath(); mg.fill();
      mg.strokeStyle = '#e8412c'; mg.lineWidth = 3; for (const LP of [LOOP_A, LOOP_B]){ mg.beginPath(); mg.arc(X(LP.x + LP.w / 2), Z(LP.z), Math.max(3, LP.R * k), 0, 7); mg.stroke(); }
      const [lx, lz] = at(SF);
      if (typeof mini !== 'undefined' && mg.canvas === mini && X(lx) > -80 && X(lx) < mg.canvas.width + 80 && Z(lz) > -20 && Z(lz) < mg.canvas.height + 20){
        mg.font = '700 13px sans-serif'; mg.textAlign = 'center'; mg.lineWidth = 3; mg.strokeStyle = 'rgba(31,42,51,.85)'; mg.strokeText('雪邦赛道', X(lx), Z(lz) - 8); mg.fillStyle = '#ffffff'; mg.fillText('雪邦赛道', X(lx), Z(lz) - 8); mg.textAlign = 'start';
      }
    };
  }

  /* ---------- lap timing: start line, three sectors, best lap ---------- */
  const F1 = {idx:-1, lap:null, msg:'', lastLap:null};
  const SEC = [SF, (SF + Math.round(N / 3)) % N, (SF + Math.round(2 * N / 3)) % N];
  const along = i => ((i - SF) % N + N) % N;   /* how far round from the line, in points */
  if (typeof GX_MORE !== 'undefined') GX_MORE.push({id:'sepLap', name:'汽车游乐园二园 · 雪邦赛道', fmt:v => `最快一圈 ${fmt2(v)}`}, {id:'bigjump2', name:'汽车游乐园二园 · 超级大跳台', fmt:v => `最远 ${Math.round(v)} 米`});
  P.JUMPS.push({r:SJ, key:'bigjump2', name:'超级大跳台', on:(d, rec, kmh) => { screens(`${d} 米`, rec ? `超级大跳台 · 新纪录！起飞 ${kmh} km/h` : `超级大跳台 · 起飞 ${kmh} km/h`); if (d >= 40) CR.cheer = d >= 120 ? 3.5 : 2.2; }});
  const prevLoop = P.onLoop; P.onLoop = (n, kmh) => { if (prevLoop) prevLoop(n, kmh); const c = driving; if (c && c.x > SZ.x0){ screens('双回环', `进环 ${kmh} km/h · 一共 ${n} 圈`); CR.cheer = 1.6; } };
  function f1Update(dt){
    F1.msg = '';
    const c = driving, inP = c && c.x > PAD.x0 - 20 && c.x < PAD.x1 + 20 && c.z > PAD.z0 - 20 && c.z < PAD.z1 + 20;
    if (!c){ F1.lap = null; F1.idx = -1; if (typeof nw !== 'undefined' && nw.x > PAD.x0 && nw.x < PAD.x1 && nw.z > PAD.z0 && nw.z < PAD.z1) F1.msg = '汽车游乐园二园：开车来跑雪邦赛道，东边是超级大跳台和双回环'; return; }
    if (!inP){ F1.lap = null; F1.idx = -1; return; }
    /* where on the circuit (search near the last place; a full search when lost) */
    let bi = -1, bd = 1e9;
    const look = F1.idx < 0 ? [0, N] : [F1.idx - 25, F1.idx + 40];
    for (let i = look[0]; i < look[1]; i++){ const p = at(i), d = (p[0] - c.x) ** 2 + (p[1] - c.z) ** 2; if (d < bd){ bd = d; bi = ((i % N) + N) % N; } }
    bd = Math.sqrt(bd);
    if (bd > 45){ if (F1.lap && bd > 70){ F1.lap = null; P.call('离开赛道太远', '这一圈不算了'); } F1.idx = bd > 60 ? -1 : bi; }
    else if (F1.idx >= 0 && Math.min(((bi - F1.idx) % N + N) % N, ((F1.idx - bi) % N + N) % N) > 60){ F1.lap = null; F1.idx = bi; }   /* jumped across the infield or got moved: start over */
    else {
      const prev = F1.idx;
      if (prev >= 0){
        const a0 = along(prev), a1 = along(bi), fwd = ((bi - prev) % N + N) % N;
        /* distance actually driven round the lap (backwards counts against it), so backing over the line is no lap */
        if (F1.lap) F1.lap.prog += fwd < 60 ? fwd : fwd > N - 60 ? fwd - N : 0;
        if (fwd > 0 && fwd < 60){
          /* crossed the line going forward */
          if (a1 < a0 && a0 > N - 80){
            if (F1.lap && F1.lap.prog > N * .95){
              const t = F1.lap.t, best = prog.best.sepLap, rec = best == null || t < best; F1.lastLap = t;
              if (rec){ prog.best.sepLap = Math.round(t * 100) / 100; saveGame(); }
              addStunt('雪邦赛道一圈', 500); CR.cheer = rec ? 3 : 1.5;
              P.call(`一圈 ${fmt2(t)}`, rec ? (best == null ? '第一圈！纪录已保存' : `新纪录！快了 ${(best - t).toFixed(2)} 秒`) : `纪录 ${fmt2(best)} · 慢了 ${(t - best).toFixed(2)} 秒`);
              screens(fmt2(t), rec ? '新纪录！' : '最快一圈 ' + fmt2(best));
            } else if (!F1.lap) P.call('雪邦赛道 · 计时开始', '跑完一整圈回到起点线');
            F1.lap = {t:0, prog:0, sec:1, splits:[]};
          } else if (F1.lap){
            const s = F1.lap.sec; if (s < 3 && a1 >= along(SEC[s]) && a0 < along(SEC[s])){ F1.lap.splits.push(F1.lap.t); F1.lap.sec++; P.call(`第 ${s} 段 ${fmt2(F1.lap.t - (F1.lap.splits[s - 2] || 0))}`, `用时 ${fmt2(F1.lap.t)}`); }
          }
        }
      }
      F1.idx = bi;
    }
    if (F1.lap){ F1.lap.t += dt; if (F1.lap.t > 600) F1.lap = null; else F1.msg = `雪邦赛道 ${fmt2(F1.lap.t)} · 第 ${F1.lap.sec} 段` + (prog.best.sepLap != null ? ` · 纪录 ${fmt2(prog.best.sepLap)}` : ''); }
    else if (bd < 40 && Math.hypot(c.vx, c.vz) < 22) F1.msg = '雪邦赛道：开过主直道上的起点线开始计时' + (prog.best.sepLap != null ? ` · 纪录 ${fmt2(prog.best.sepLap)}` : '');
    if (!F1.msg && c.x > SZ.x0 - 10 && Math.hypot(c.vx, c.vz) < 22){
      if (Math.abs(c.x - SJ.x) < 10 && c.z > SJ_BASE) F1.msg = '超级大跳台：往北全速冲，9 米高的跳台' + (prog.best.bigjump2 ? ` · 纪录 ${prog.best.bigjump2} 米` : '');
      else if (Math.abs(c.x - LOOP_A.x) < 5 && c.z > LOOP_A.z) F1.msg = `双回环：${Math.ceil(P.lpMin(LOOP_B) * 3.6)} km/h 以上才转得过第二个大环`;
      else if (Math.abs(c.x - SX) < 6 && c.z > 1100) F1.msg = '三连跳：波浪道接三个越来越高的跳台';
    }
  }
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, { update(dt, px, pz){ base.update(dt, px, pz); f1Update(dt); }, prompt(){ return base.prompt() || F1.msg; } });
  }
  if (typeof updateOutskirts === 'function'){
    const base = updateOutskirts;
    updateOutskirts = function(dt, T){
      base(dt, T);
      const lamp = typeof cur !== 'undefined' && cur.lamp != null ? cur.lamp : 0;
      glowMat.emissiveIntensity = .2 + lamp * 2.2; boardMat.emissiveIntensity = .12 + lamp * .5;
      if (CR.cheer > 0){ CR.cheer -= dt; CR.t += dt; if (camera.position.distanceTo(_p.set(300, 0, 930)) < 900) crowdPose(CR.t); if (CR.cheer <= 0) crowdPose(0); }
    };
  }
  window.XF1 = {PT, N, LEN, SF, SEC, TAN, NOR, CURV, turnIdx, PIT, SJ, SJ_LIP, SJ_BASE, LOOP_A, LOOP_B, SX, KICK, MOUNDS, ROLL2, DRIFT, SZ, S:F1, screens, seats:seats.length, tyres:TY.length, map};
})();
