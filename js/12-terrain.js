/* XMUM 校园漫游 · 山地地形：高度网格（groundAt 读它）、山坡网格、地图边界、校外道路规划 */
'use strict';
/* Everything placed here uses private generators or pure noise, never rnd(), so the campus layout that later files place stays put. */

/* ---------- map bounds: the campus hedge ring stays a wall, open only where the road leaves the main gate ---------- */
Object.assign(MAP, {x0:-1080, x1:820, z0:-560, z1:1180});
const CAMPUS_R = {x0:-603, x1:603, z0:-278, z1:265};
const GATE_GAP = [GX - GATE_FRONT.lane - GATE_FRONT.lw / 2, GX + GATE_FRONT.lane + GATE_FRONT.lw / 2];   /* the gate and its two lanes: the closed gate, the porches and the stone stop you by their own colliders (js/42-gate.js) */
MAP.wall = (x, z, r) => {
  if (x + r > -603 && x - r < 603){
    if (z + r > -278 && z - r < -275) return true;
    if (z + r > 262 && z - r < 265 && !(x - r > GATE_GAP[0] && x + r < GATE_GAP[1])) return true;
  }
  return z + r > -278 && z - r < 265 && ((x + r > -603 && x - r < -600) || (x + r > 600 && x - r < 603));
};

/* ---------- the plan outside the hedge, traced from OpenStreetMap (real x ≈ game x − 270, real z ≈ game z − 335) ---------- */
/* Jalan Sunsuria runs east–west right outside the south hedge as two one-way carriageways with a planted median.
   Bell Avenue is one long block of back-to-back shophouses just south of it, starting opposite the main gate and running
   ~270 m east to the Bell Suites tower; the Taman Warisan Megah terraces lie behind it. KIP mall and 麦当当 are south-west:
   really 1.5–2 km away, here compressed to about a 30 s drive over a ridge. Pads are flat (y = 0) so nothing ever floats. */
const OUT_PADS = [
  {id:'bell', x0:-45, x1:545, z0:288, z1:470, fall:55},
  {id:'kip',  x0:-778, x1:-490, z0:864, z1:1076, fall:70},
  {id:'mcd',  x0:-503, x1:-406, z0:1065, z1:1137, fall:45}
];
const OUT_ROADS = [
  {id:'artN', kind:'main', w:8, line:[[-1400, 270], [1160, 270]]},
  {id:'artS', kind:'main', w:8, line:[[-1400, 289], [1160, 289]]},
  {id:'gate', kind:'gate', w:10, line:[[GX, 272], [GX, 307]]},   /* from Jalan Sunsuria across the median to Bell Avenue: the gate itself is closed, with the name stone in front */
  {id:'gateW', kind:'lane', w:GATE_FRONT.lw, line:[[GX - GATE_FRONT.lane, 246.6], [GX - GATE_FRONT.lane, 270]]},   /* the two lanes beside the gate: in (west) and out (east) */
  {id:'gateE', kind:'lane', w:GATE_FRONT.lw, line:[[GX + GATE_FRONT.lane, 246.6], [GX + GATE_FRONT.lane, 270]]},
  /* Bell Avenue's lanes: its west end lines up with the gate axis (x = 104), as on the real street */
  {id:'bellF', kind:'lane', w:6, line:[[104, 307], [520, 307], [530, 316], [530, 348]]},
  {id:'bellB', kind:'lane', w:6, line:[[104, 363], [424, 363]]},
  {id:'bellW', kind:'lane', w:6, line:[[104, 307], [104, 363]]},
  /* round the back of Bell Suites to the back lane: the frontage lane used to stop dead on the grass at z 348
     (the Bell street race in js/92-racing.js already ran this way, over the grass) */
  {id:'bellE', kind:'lane', w:6, line:[[530, 348], [519, 366], [440, 366.5], [424, 363]]},
  {id:'drv1', kind:'lane', w:7, line:[[264, 289], [264, 307]]},
  {id:'drv2', kind:'lane', w:7, line:[[299, 289], [299, 307]]},
  {id:'res1', kind:'lane', w:6, line:[[-27, 405.5], [322, 405.5]]},
  {id:'res2', kind:'lane', w:6, line:[[-27, 459], [322, 459]]},
  {id:'resW', kind:'lane', w:5, line:[[-27, 405.5], [-27, 459]]},
  {id:'resA', kind:'lane', w:4.5, line:[[70.5, 405.5], [70.5, 459]]},
  {id:'resB', kind:'lane', w:4.5, line:[[149.5, 405.5], [149.5, 459]]},
  {id:'resC', kind:'lane', w:4.5, line:[[229, 405.5], [229, 459]]},
  {id:'resE', kind:'lane', w:5, line:[[322, 363], [322, 459]]},
  {id:'kip',  kind:'main', w:11, flatAfterZ:700, ctrl:[[-62, 289], [-64, 345], [-95, 430], [-185, 505], [-300, 570], [-420, 630], [-500, 705], [-530, 790], [-527, 880], [-505, 960], [-498, 1040], [-511, 1110], [-520, 1148]]},
  /* 油棕园公路 (js/92-racing.js track): from 麦当当 east through the hills and the oil-palm estate back up to Jalan Sunsuria */
  {id:'estate', kind:'main', w:10, ctrl:[[-505, 1152], [-380, 1160], [-220, 1140], [-60, 1100], [100, 1050], [260, 985], [410, 905], [545, 820], [625, 700], [650, 560], [640, 420], [632, 330], [630, 293]]}
];
OUT_ROADS.forEach(r => {
  const pts = [];
  if (r.ctrl){
    const cv = new THREE.CatmullRomCurve3(r.ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = Math.ceil(cv.getLength() / 4);
    cv.getSpacedPoints(n).forEach(v => pts.push([v.x, v.z]));
  } else for (let i = 0; i < r.line.length - 1; i++){
    const [x0, z0] = r.line[i], [x1, z1] = r.line[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8));
    for (let k = i ? 1 : 0; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
  }
  r.p = pts; r.s = [0]; for (let i = 1; i < pts.length; i++) r.s.push(r.s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  r.y = new Float32Array(pts.length); r.L = r.s[r.s.length - 1];
});

/* ---------- height grid (12 m cells; groundAt and the drawn hills read the very same triangles) ---------- */
const TG = {x0:-1400, z0:-860, C:12, nx:214, nz:193, Y:null, RW:null, RD:null, flat:false, meshes:[], campusMesh:null};
const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rectDist = (x, z, R) => Math.hypot(Math.max(R.x0 - x, 0, x - R.x1), Math.max(R.z0 - z, 0, z - R.z1));
function hash2(i, j){ let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function vnoise(x, z){
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
const fbm = (x, z) => vnoise(x / 380, z / 380) * .58 + vnoise(x / 170 + 31.7, z / 170 - 12.1) * .28 + vnoise(x / 70 - 7.3, z / 70 + 5.9) * .14;
/* 后山: the wooded hill in the north-west of the campus (west of LY1 and the Musical Island, as in the campus 360° tour).
   A summit about 34 m up with a flat top for the pavilion (js/44-hill.js), a ridge running east to 猴山 (js/89-swing-monkeys.js, kept at
   its old spot and given its own knob), and two spurs. s = summit, m = 猴山, flat = radius of the level top. */
/* The summit sits on a vertex of the 12 m height grid and everything within `flat` of it is level, so the 3 × 3 vertices round it
   (a 24 m square) are all at the same height and the pavilion stands on truly flat ground. The hill is long east–west and short
   north–south (the perimeter road to the north and the forest road to the south both need level verges). */
const HILL = {sx:-296, sz:-164, top:27, flat:18, mx:-188, mz:-175};
function hillY(x, z){
  const b = t => t >= 1 ? 0 : (1 - t * t) * (1 - t * t);
  const seg = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return [t, Math.hypot(x - ax - t * dx, z - az - t * dz)]; };
  const dx = x - HILL.sx, dz = z - HILL.sz, k = 1 + 1.25 * smooth01(10, 40, -dz) + .55 * smooth01(10, 40, dz);
  const dS = Math.hypot(dx, dz), dA = Math.hypot(dx, dz * k), dM = Math.hypot(x - HILL.mx, z - HILL.mz);
  let h = HILL.top * b(Math.max(0, dA - HILL.flat) / 112);
  h = Math.max(h, 14 * b(Math.max(0, dM - 10) / 50));
  /* the ridge to 猴山 dips to a saddle on the way; one spur falls away south-west, another south-east toward the forest road */
  let [t, d] = seg(HILL.sx, HILL.sz, HILL.mx, HILL.mz); h = Math.max(h, ((1 - t) * 23 + t * 13 - 5 * Math.sin(Math.PI * t)) * b(d / 30));
  [t, d] = seg(HILL.sx, HILL.sz, -405, -130); h = Math.max(h, (1 - t) * 21 * b(d / 28));
  [t, d] = seg(HILL.sx, HILL.sz, -246, -116); h = Math.max(h, (1 - t) * 17 * b(d / 24));
  /* folds and gullies on the slopes, none on the two level tops */
  h += (fbm(x * 2.2 - 140, z * 2.2 + 90) - .5) * 10 * smooth01(HILL.flat + 2, HILL.flat + 24, dS) * smooth01(9, 26, dM) * smooth01(0, 6, h);
  return Math.max(0, h);
}
/* how far a point is from the level top of the summit (used to keep everything else off it) */
const hillTopD = (x, z) => Math.hypot(x - HILL.sx, z - HILL.sz) - HILL.flat;
function terrainY(x, z){
  if (TG.flat && x > CAMPUS_R.x0 && x < CAMPUS_R.x1 && z > CAMPUS_R.z0 && z < CAMPUS_R.z1) return 0;
  const fx = (x - TG.x0) / TG.C, fz = (z - TG.z0) / TG.C, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= TG.nx - 1 || j >= TG.nz - 1) return 0;
  const u = fx - i, v = fz - j, k = j * TG.nx + i, n = TG.nx, H = TG.Y;
  const y = u + v <= 1 ? H[k] + (H[k + 1] - H[k]) * u + (H[k + n] - H[k]) * v
    : H[k + n + 1] + (H[k + n] - H[k + n + 1]) * (1 - u) + (H[k + 1] - H[k + n + 1]) * (1 - v);
  return y > 0 ? y : 0;
}
(function buildHeights(){
  const {nx, nz, C, x0, z0} = TG, N = nx * nz, H = new Float32Array(N), xMax = x0 + (nx - 1) * C, zMax = z0 + (nz - 1) * C;
  let fb = {x0:1e9, x1:-1e9, z0:1e9, z1:-1e9};
  FOREST.forEach(([x, z]) => { fb.x0 = Math.min(fb.x0, x); fb.x1 = Math.max(fb.x1, x); fb.z0 = Math.min(fb.z0, z); fb.z1 = Math.max(fb.z1, z); });
  const polyEdge = (x, z, poly) => { let d = 1e9; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, z, poly[j], poly[i])); return d; };
  /* 1. raw hills: gentle bumps in the campus forest, rolling hills outside that climb toward the edge of the map */
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){
    const x = x0 + i * C, z = z0 + j * C, k = j * nx + i;
    if (x > CAMPUS_R.x0 && x < CAMPUS_R.x1 && z > CAMPUS_R.z0 && z < CAMPUS_R.z1){
      if (x > fb.x0 && x < fb.x1 && z > fb.z0 && z < fb.z1 && inPoly(x, z, FOREST)){
        const n2 = fbm(x * 1.8 + 500, z * 1.8 - 300), pe = polyEdge(x, z, FOREST);
        H[k] = Math.max(16 * Math.pow(Math.max(0, n2 - .22) / .78, 1.1) * smooth01(6, 55, pe) * smooth01(0, 30, hillTopD(x, z)), hillY(x, z) * smooth01(4, 46, pe));
      }
      continue;
    }
    const d = rectDist(x, z, CAMPUS_R), dm = rectDist(x, z, MAP), de = Math.min(x - x0, xMax - x, z - z0, zMax - z);
    const A = 12 + 22 * smooth01(120, 650, d) + 50 * smooth01(0, 240, dm);
    let h = A * Math.pow(Math.max(0, fbm(x, z) - .28) / .72, 1.25);
    h += 24 * Math.exp(-((x + 330) * (x + 330) + (z - 520) * (z - 520)) / 22500);   /* the ridge the KIP road climbs over */
    H[k] = h * smooth01(16, 100, d) * smooth01(0, 160, de);
  }
  /* 2. keep campus roads, buildings and their surroundings in the forest flat */
  const FM = new Float32Array(N);
  const stamp = (bx0, bz0, bx1, bz1, wf) => {
    const i0 = Math.max(0, Math.ceil((Math.max(bx0, fb.x0 - 60) - x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.min(bx1, fb.x1 + 60) - x0) / C));
    const j0 = Math.max(0, Math.ceil((Math.max(bz0, fb.z0 - 60) - z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.min(bz1, fb.z1 + 60) - z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){ const k = j * nx + i; if (H[k] > 0){ const w = wf(x0 + i * C, z0 + j * C); if (w > FM[k]) FM[k] = w; } }
  };
  for (const s of roadSegs){
    const R = s.h + 45;
    stamp(Math.min(s.a[0], s.b[0]) - R, Math.min(s.a[1], s.b[1]) - R, Math.max(s.a[0], s.b[0]) + R, Math.max(s.a[1], s.b[1]) + R,
      (x, z) => 1 - smooth01(s.h + 17, s.h + 45, segDist(x, z, s.a, s.b)));
  }
  for (const c of colliders){
    const R = (c.t ? c.r : Math.hypot(c.hx, c.hz)) + 42;
    stamp(c.cx - R, c.cz - R, c.cx + R, c.cz + R, (x, z) => {
      const dx = x - c.cx, dz = z - c.cz;
      const d = c.t ? Math.hypot(dx, dz) - c.r : Math.hypot(Math.max(0, Math.abs(dx * c.c - dz * c.s) - c.hx), Math.max(0, Math.abs(dx * c.s + dz * c.c) - c.hz));
      return 1 - smooth01(14, 42, d);
    });
  }
  for (let k = 0; k < N; k++) if (FM[k]) H[k] *= 1 - FM[k];
  /* 3. flat pads for Bell Avenue, 麦当当 and KIP mall */
  function flatPads(){
    for (const p of OUT_PADS){
      const R = p.fall + 4, i0 = Math.max(0, Math.ceil((p.x0 - R - x0) / C)), i1 = Math.min(nx - 1, Math.floor((p.x1 + R - x0) / C));
      const j0 = Math.max(0, Math.ceil((p.z0 - R - z0) / C)), j1 = Math.min(nz - 1, Math.floor((p.z1 + R - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){ const k = j * nx + i; H[k] *= smooth01(4, R, rectDist(x0 + i * C, z0 + j * C, p)); }
    }
  }
  flatPads();
  /* 4. road profiles: the hill road follows the land, smoothed, pinned flat at both ends and held under a 9 % grade */
  const sample = (x, z) => {
    const fx = Math.max(0, Math.min(nx - 1.001, (x - x0) / C)), fz = Math.max(0, Math.min(nz - 1.001, (z - z0) / C)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + nx] * (1 - u) + H[k + nx + 1] * u) * v;
  };
  const avg = (a, s, win) => { const out = new Float32Array(a.length); for (let i = 0; i < a.length; i++){ let sum = 0, n = 0; for (let j = i; j >= 0 && s[i] - s[j] <= win; j--){ sum += a[j]; n++; } for (let j = i + 1; j < a.length && s[j] - s[i] <= win; j++){ sum += a[j]; n++; } out[i] = sum / n; } return out; };
  for (const r of OUT_ROADS){
    if (!r.ctrl) continue;
    let y = Float32Array.from(r.p, ([x, z]) => sample(x, z));
    y = avg(avg(y, r.s, 60), r.s, 60);
    let sEnd = r.L; if (r.flatAfterZ != null) for (let i = 0; i < r.p.length; i++) if (r.p[i][1] > r.flatAfterZ){ sEnd = r.s[i]; break; }
    for (let i = 0; i < y.length; i++) y[i] *= smooth01(40, 130, r.s[i]) * smooth01(30, 130, sEnd - r.s[i]);
    const g = .09;
    for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1] + g * (r.s[i] - r.s[i - 1]));
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + g * (r.s[i + 1] - r.s[i]));
    r.y = avg(y, r.s, 16);
  }
  /* 5. blend the land into every road: flat across the carriageway, easing back to the hills over ~45 m */
  const RD = new Float32Array(N).fill(1e9), RT = new Float32Array(N), RW = new Float32Array(N);
  for (const r of OUT_ROADS){
    const hw = r.w / 2, inner = hw + 17, outer = hw + 62;
    for (let q = 0; q < r.p.length - 1; q++){
      const a = r.p[q], b = r.p[q + 1];
      const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0]) - outer - x0) / C)), i1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0]) + outer - x0) / C));
      const j0 = Math.max(0, Math.ceil((Math.min(a[1], b[1]) - outer - z0) / C)), j1 = Math.min(nz - 1, Math.floor((Math.max(a[1], b[1]) + outer - z0) / C));
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
        const x = x0 + i * C, z = z0 + j * C, k = j * nx + i, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
        const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
        if (d >= outer) continue;
        const w = 1 - smooth01(inner, outer, d); if (w > RW[k]) RW[k] = w;
        if (d < RD[k]){ RD[k] = d; RT[k] = r.y[q] + (r.y[q + 1] - r.y[q]) * t; }
      }
    }
  }
  for (let k = 0; k < N; k++) if (RW[k] > 0) H[k] = H[k] * (1 - RW[k]) + RT[k] * RW[k];
  /* 6. the pads win over the road blend: the 油棕园 road climbs away right next to 麦当当 and its verge used to lift the
     south-east of the car park (drive-thru window, lane) up to 4 m above the drawn asphalt */
  flatPads();
  /* drawn surface sits a few cm under the flat ground, so the flat parts of the world hide it */
  for (let k = 0; k < N; k++) H[k] -= .06;
  TG.Y = H; TG.RW = RW; TG.RD = RD;
})();

/* ---------- drawn hills: one mesh per ninth of the map (frustum-culled), plus the campus forest (hidden in black-hole mode) ---------- */
const terrMat = regWet(M('#b4b4b4', {vertexColors:true, roughness:.95}), .62);   /* grey, not white: the hills' vertex greens were clipping to neon in full sun */
(function buildTerrainMeshes(){
  const {nx, nz, C, x0, z0, Y} = TG, N = nx * nz, nor = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const cLow = new THREE.Color('#4f7a3b'), cMid = new THREE.Color('#3f6f2f'), cHigh = new THREE.Color('#2b5124'), cSoil = new THREE.Color('#9c6440'),
    fLow = new THREE.Color('#4d8a3e'), fHigh = new THREE.Color('#3f7a35'), c = new THREE.Color();
  const at = (i, j) => Y[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){
    const k = j * nx + i, gx = (at(i + 1, j) - at(i - 1, j)) / (2 * C), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * C), l = Math.hypot(gx, 1, gz);
    nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l;
    const x = x0 + i * C, z = z0 + j * C, h = Y[k], slope = Math.hypot(gx, gz), jit = (hash2(i * 7 + 3, j * 5 + 1) - .5) * .08;
    const inC = x > CAMPUS_R.x0 && x < CAMPUS_R.x1 && z > CAMPUS_R.z0 && z < CAMPUS_R.z1;
    if (inC){ c.copy(fLow).lerp(fHigh, smooth01(1, 9, h)).lerp(cHigh, smooth01(10, 34, h) * .55); c.lerp(cSoil, smooth01(.38, .7, slope) * .4); c.multiplyScalar(.9 + .2 * vnoise(x / 40 + 3.3, z / 40 - 8.1)); }
    else { c.copy(cLow).lerp(cMid, smooth01(.5, 6, h)).lerp(cHigh, smooth01(6, 32, h) * .8 + smooth01(.2, .45, slope) * .2); c.lerp(cSoil, smooth01(.45, .75, slope) * .55);
      c.multiplyScalar(.82 + .32 * vnoise(x / 95 + 9.1, z / 95 - 4.7)); }
    c.multiplyScalar(1 + jit); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const groups = new Map(), cw = (nx - 1) / 3, ch = (nz - 1) / 3;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++){
    const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
    if (Y[a] <= 0 && Y[b] <= 0 && Y[cc] <= 0 && Y[d] <= 0) continue;
    const mx = x0 + (i + .5) * C, mz = z0 + (j + .5) * C;
    const key = mx > CAMPUS_R.x0 && mx < CAMPUS_R.x1 && mz > CAMPUS_R.z0 && mz < CAMPUS_R.z1 ? 'campus' : 'c' + Math.min(2, Math.floor(i / cw)) + Math.min(2, Math.floor(j / ch));
    let g = groups.get(key); if (!g){ g = {map:new Map(), pos:[], nor:[], col:[], idx:[]}; groups.set(key, g); }
    const v = k => { let li = g.map.get(k); if (li == null){ li = g.pos.length / 3; g.map.set(k, li); g.pos.push(x0 + (k % nx) * C, Y[k], z0 + Math.floor(k / nx) * C); g.nor.push(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]); g.col.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); } return li; };
    const va = v(a), vb = v(b), vc = v(cc), vd = v(d);
    g.idx.push(va, vc, vb, vb, vc, vd);
  }
  groups.forEach((g, key) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3)); geo.setIndex(g.idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, terrMat); m.receiveShadow = true; scene.add(m); TG.meshes.push(m);
    if (key === 'campus') TG.campusMesh = m;
  });
})();
