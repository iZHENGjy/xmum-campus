/* hero-car.js : a procedural mid-engine supercar (no model or image files).
   makeHeroCar({paint, quality}) -> {root, wheels, fronts, lights:{head, tail}, paintMat}
   root: origin on the ground at the centre of the wheelbase, +z forward, y up.
   The body is lofted from cross-sections (control points interpolated along z, a Catmull-Rom profile
   per section); details (lights, intakes, shut lines, louvres) are thin patches that follow that surface. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const val = (f, t) => typeof f === 'function' ? f(t) : f;

const QUALITY = {
  low:  {dz:.2,   k:2, arch:6,  seg:14, spoke:1, lod:0},
  mid:  {dz:.075, k:5, arch:12, seg:32, spoke:3, lod:1},
  high: {dz:.045, k:8, arch:20, seg:56, spoke:6, lod:2},
};

/* dimensions */
const AX = 1.35, WR = .36, RA = .395, TRK = .85, WELL = .56;
const WHEEL = {front:{w:.25, dish:.035}, rear:{w:.31, dish:.075}};

/* ---------- small maths ---------- */
/* monotone cubic through [x, y] keys: no overshoot between sections */
function curve(keys){
  const n = keys.length, X = keys.map(k => k[0]), Y = keys.map(k => k[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (Y[i + 1] - Y[i]) / (X[i + 1] - X[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++){
    if (d[i] === 0){ m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9){ const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= X[0]) return Y[0]; if (x >= X[n - 1]) return Y[n - 1];
    let i = 0; while (x > X[i + 1]) i++;
    const h = X[i + 1] - X[i], t = (x - X[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/* centripetal Catmull-Rom, segment s of control list P (P has one phantom point at each end) */
function crPoint(P, s, f){
  const p0 = P[s], p1 = P[s + 1], p2 = P[s + 2], p3 = P[s + 3];
  const dd = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t1 = dd(p0, p1), t2 = t1 + dd(p1, p2), t3 = t2 + dd(p2, p3), t = t1 + (t2 - t1) * f, o = [0, 0];
  for (let c = 0; c < 2; c++){
    const A1 = (t1 - t) / t1 * p0[c] + t / t1 * p1[c];
    const A2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
    const A3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
    const B1 = (t2 - t) / t2 * A1 + t / t2 * A2;
    const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
    o[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
  }
  return o;
}
/* a lofted surface: ctrl(z) gives the half cross-section control points (centre line first);
   P(z, w): w in [-1, 1], |w| runs from the centre line to the lower edge, the sign picks the side */
function makeSurface(ctrl, sweep){
  const cache = new Map();
  const get = z => { let c = cache.get(z); if (!c){ const p = ctrl(z), n = p.length;
    c = [[-p[1][0], p[1][1]], ...p, [2 * p[n - 1][0] - p[n - 2][0], 2 * p[n - 1][1] - p[n - 2][1]]]; if (cache.size > 6000) cache.clear(); cache.set(z, c); } return c; };
  const xy = (z, t) => { const c = get(z), ns = c.length - 3, u = clamp(t, 0, 1) * ns, s = Math.min(ns - 1, Math.floor(u)); return crPoint(c, s, u - s); };
  const raw = (z, w, out) => { const p = xy(z, Math.abs(w)), x = p[0]; return out.set(w < 0 ? -x : x, p[1], z - sweep(z) * x * x); };
  const a = new V3(), b = new V3(), c = new V3(), d = new V3();
  const N = (z, w, out = new V3()) => { const e = .002, w0 = clamp(w - e, -1, 1), w1 = clamp(w + e, -1, 1);
    raw(z, w1, a).sub(raw(z, w0, b)); raw(z + e, w, c).sub(raw(z - e, w, d)); return out.crossVectors(c, a).normalize(); };
  const P = (z, w, off = 0, out = new V3()) => { raw(z, w, out); if (off){ const n = N(z, w); out.addScaledVector(n, off); } return out; };
  return {P, N, xy};
}

/* ---------- geometry helpers (everything is indexed, with position / normal / uv) ---------- */
function prep(g){
  if (!g.index){ const n = g.attributes.position.count, ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  g.clearGroups(); return g;
}
function setUV(g, uv){ const a = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < a.length; i += 2){ a[i] = uv[0]; a[i + 1] = uv[1]; } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return g; }
function mirrorX(g){ const m = g.clone().scale(-1, 1, 1), ix = m.index.array; for (let i = 0; i < ix.length; i += 3){ const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } return m; }
const radial = p => new V3(p.x, p.y - .45, 0);
const dir = (x, y, z) => { const v = new V3(x, y, z); return () => v; };
/* rows of points -> smooth grid; faces are turned to agree with ref(p); filter(i, j) keeps a quad */
function gridGeo(rows, ref = radial, opt = {}){
  const nr = rows.length, nc = rows[0].length, pos = new Float32Array(nr * nc * 3), all = [], sel = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++){ const p = rows[i][j]; pos[(i * nc + j) * 3] = p.x; pos[(i * nc + j) * 3 + 1] = p.y; pos[(i * nc + j) * 3 + 2] = p.z; }
  const jn = opt.wrap ? nc : nc - 1;
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < jn; j++){
    const j2 = (j + 1) % nc, a = i * nc + j, b = i * nc + j2, c = a + nc, d = b + nc;
    all.push(a, c, b, b, c, d); if (!opt.filter || opt.filter(i, j)) sel.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(all); g.computeVertexNormals();
  const nor = g.attributes.normal.array, p = new V3(); let s = 0;
  for (let i = 0; i < nr * nc; i++){ p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); const r = ref(p); s += nor[i * 3] * r.x + nor[i * 3 + 1] * r.y + nor[i * 3 + 2] * r.z; }
  if (s < 0){ for (let i = 0; i < nor.length; i++) nor[i] = -nor[i]; for (let i = 0; i < sel.length; i += 3){ const t = sel[i + 1]; sel[i + 1] = sel[i + 2]; sel[i + 2] = t; } }
  g.setIndex(sel); return prep(g);
}
function capFan(ring, centre, ref){
  const rows = [ring.map(() => centre), ring]; return gridGeo(rows, ref, {wrap:true});
}
/* surface of revolution around x. runs: [{p:[[x, r], ...], uv:[u, v] | fn(i, j, n), smooth}]; the surface faces the
   left of the travel direction in the (x, r) plane; a new run starts a crease unless it says smooth */
function lathe(runs, segs, a0 = 0, a1 = TAU){
  const pos = [], nor = [], uv = [], idx = [];
  const sn = (p, q) => { const dx = q[0] - p[0], dr = q[1] - p[1], l = Math.hypot(dx, dr) || 1; return [-dr / l, dx / l]; };
  runs.forEach((run, ri) => {
    const p = run.p, n = p.length, base = pos.length / 3;
    for (let i = 0; i < n; i++){
      let ax = 0, ar = 0; const add = s => { ax += s[0]; ar += s[1]; };
      if (i > 0) add(sn(p[i - 1], p[i])); if (i < n - 1) add(sn(p[i], p[i + 1]));
      if (i === 0 && run.smooth && ri > 0){ const q = runs[ri - 1].p; add(sn(q[q.length - 2], q[q.length - 1])); }
      if (i === n - 1 && ri < runs.length - 1 && runs[ri + 1].smooth){ const q = runs[ri + 1].p; add(sn(q[0], q[1])); }
      const l = Math.hypot(ax, ar) || 1; ax /= l; ar /= l;
      for (let j = 0; j <= segs; j++){
        const a = a0 + (a1 - a0) * j / segs, c = Math.cos(a), s = Math.sin(a), t = typeof run.uv === 'function' ? run.uv(i, j, n) : run.uv;
        pos.push(p[i][0], p[i][1] * c, p[i][1] * s); nor.push(ax, ar * c, ar * s); uv.push(t[0], t[1]);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++){
      const A = base + i * (segs + 1) + j, B = A + 1, C = A + segs + 1, D = C + 1;
      if (p[i][1] > 1e-6) idx.push(A, B, C); if (p[i + 1][1] > 1e-6) idx.push(B, D, C);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0){
  const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return prep(g);
}
function beam(a, b, wd, ht){
  const g = new THREE.BoxGeometry(wd, ht, a.distanceTo(b)); g.applyMatrix4(new THREE.Matrix4().lookAt(a, b, new V3(0, 1, 0)));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return prep(g);
}
/* a patch that follows surface S between z0..z1 and w0..w1 (numbers, or functions of the 0..1 position along z) */
function patch(S, z0, z1, w0, w1, nz, nw, off){
  const rows = [];
  for (let i = 0; i <= nz; i++){ const f = i / nz, z = lerp(z0, z1, f), a = val(w0, f), b = val(w1, f), row = [];
    for (let j = 0; j <= nw; j++) row.push(S.P(z, lerp(a, b, j / nw), val(off, f))); rows.push(row); }
  return gridGeo(rows);
}
/* a thin line that follows surface S along a path of [z, w] points */
function ribbon(S, path, width, off, step = .05){
  const pts = [];
  for (let i = 0; i < path.length - 1; i++){ const a = path[i], b = path[i + 1], n = Math.max(1, Math.ceil((Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])) / step));
    for (let k = i ? 1 : 0; k <= n; k++) pts.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]); }
  const P = pts.map(q => S.P(q[0], q[1], off)), A = [], B = [], t = new V3(), s = new V3();
  P.forEach((p, k) => { const n = S.N(pts[k][0], pts[k][1]); t.subVectors(P[Math.min(P.length - 1, k + 1)], P[Math.max(0, k - 1)]); s.crossVectors(n, t).normalize().multiplyScalar(width / 2);
    A.push(p.clone().sub(s)); B.push(p.clone().add(s)); });
  return gridGeo([A, B]);
}

/* ---------- the body sections ---------- */
/*   z     top   crest x,y    widest x,y   lower x,y    edge x,y  */
const BODY = [
  [ 2.35, .255,  .40, .254,   .62, .247,   .62, .240,   .58, .235],
  [ 2.32, .31,   .50, .305,   .70, .275,   .70, .245,   .66, .21 ],
  [ 2.22, .385,  .62, .385,   .80, .33,    .80, .26,    .76, .20 ],
  [ 2.00, .47,   .76, .485,    .90, .42,    .90, .29,    .87, .19 ],
  [ 1.75, .56,   .86, .635,    .97, .57,    .97, .35,    .94, .18 ],
  [ 1.35, .67,   .90, .80,   1.00, .72,   .995, .42,    .97, .17 ],
  [ 0.95, .735,  .89, .81,   .985, .70,    .97, .40,    .95, .17 ],
  [ 0.60, .76,   .87, .80,    .96, .64,    .94, .37,    .93, .17 ],
  [ 0.00, .78,   .86, .79,    .95, .62,    .91, .36,    .92, .17 ],
  [-0.55, .82,   .87, .82,    .96, .66,   .885, .38,    .92, .17 ],
  [-0.95, .86,   .89, .88,   1.01, .73,   1.00, .42,    .97, .17 ],
  [-1.35, .865,  .90, .905, 1.025, .76,   1.02, .44,    .99, .18 ],
  [-1.80, .85,   .88, .885,  1.01, .74,   1.00, .48,    .97, .30 ],
  [-2.10, .825,  .85, .85,    .98, .71,    .96, .52,    .93, .40 ],
  [-2.25, .80,   .82, .82,    .95, .69,    .93, .54,    .90, .43 ],
].reverse();
/*   z     top    roof edge x,y   base x,y  */
const CANOPY = [
  [ 1.13, .64,   .62, .58,    .80, .56],
  [ 0.97, .765,  .63, .70,    .81, .62],
  [ 0.63, .945,  .63, .91,    .83, .69],
  [ 0.31, 1.062, .61, 1.018,  .84, .70],
  [ 0.00, 1.10,  .59, 1.05,   .84, .70],
  [-0.45, 1.085, .57, 1.035,  .84, .72],
  [-1.00, 1.00,  .53, .955,   .82, .76],
  [-1.50, .895,  .47, .865,   .74, .79],
  [-1.90, .80,   .42, .785,   .62, .76],
].reverse();
const col = (T, i) => curve(T.map(r => [r[0], r[i]]));
const B = BODY[0].map((_, i) => col(BODY, i)), C = CANOPY[0].map((_, i) => col(CANOPY, i));
const body = makeSurface(z => { const yc = B[1](z), xs = B[2](z), ys = B[3](z);
  return [[0, yc], [.52 * xs, yc + (ys - yc) * .3], [xs, ys], [B[4](z), B[5](z)], [B[6](z), B[7](z)], [B[8](z), B[9](z)]]; }, z => .42 * sstep(1.75, 2.35, z));
const canopy = makeSurface(z => { const yc = C[1](z), xr = C[2](z), yr = C[3](z);
  return [[0, yc], [.5 * xr, yc - (yc - yr) * .22], [xr, yr], [C[4](z), C[5](z)]]; }, z => .3 * sstep(.15, 1.05, z));

/* ---------- textures: one small atlas for the wheels and the bright details ---------- */
const CELL = {side:0, rim:1, rimDark:2, disc:3, caliper:4, chrome:5, plate:6, black:7};
const cellUV = n => [(n + .5) / 8, 1 - .5 / 8];
const TREAD = {u0:5 / 512, u1:251 / 512, v:f => 1 - lerp(133, 251, f) / 512};
const DISC = {u0:261 / 512, u1:507 / 512, v:f => 1 - lerp(133, 251, f) / 512};
let ATLAS = null;
function atlas(){
  if (ATLAS) return ATLAS;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 512; return c; };
  const cc = mk(), co = mk(), a = cc.getContext('2d'), o = co.getContext('2d');
  const orm = (r, m) => `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`;
  a.fillStyle = '#111'; a.fillRect(0, 0, 512, 512); o.fillStyle = orm(.9, 0); o.fillRect(0, 0, 512, 512);
  const cells = [['#1c1c1d', .86, 0], ['#dfe2e6', .2, 1], ['#62656a', .38, 1], ['#7f8286', .4, 1], ['#e0a012', .34, .15], ['#d6d9dc', .14, 1], ['#deded6', .55, 0], ['#060607', .4, .2]];
  cells.forEach((c, i) => { a.fillStyle = c[0]; a.fillRect(i * 64, 0, 64, 64); o.fillStyle = orm(c[1], c[2]); o.fillRect(i * 64, 0, 64, 64); });
  /* tread: u runs round the tyre (mirrored every segment), v across it */
  a.fillStyle = '#131314'; a.fillRect(0, 96, 256, 192); o.fillStyle = orm(.95, 0); o.fillRect(0, 96, 256, 192);
  a.strokeStyle = '#030303'; a.lineCap = 'butt';
  a.lineWidth = 7; for (const y of [166, 192, 218]){ a.beginPath(); a.moveTo(0, y); a.lineTo(256, y); a.stroke(); }
  a.lineWidth = 5; for (let x = -40; x < 256; x += 64){ a.beginPath(); a.moveTo(x, 128); a.lineTo(x + 44, 160); a.stroke(); a.beginPath(); a.moveTo(x, 256); a.lineTo(x + 44, 224); a.stroke(); }
  /* brake disc: u round the disc (mirrored), v along the radius; brushed rings and drilled holes */
  a.fillStyle = '#84878b'; a.fillRect(256, 96, 256, 192); o.fillStyle = orm(.4, 1); o.fillRect(256, 96, 256, 192);
  for (let y = 128; y < 256; y += 3){ a.fillStyle = (y / 3) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)'; a.fillRect(256, y, 256, 2); }
  a.fillStyle = '#17181a'; o.fillStyle = orm(.8, 0);
  for (const [x, y] of [[300, 152], [340, 180], [380, 208], [420, 236], [450, 150], [488, 178]]){ a.beginPath(); a.arc(x, y, 6, 0, TAU); a.fill(); o.beginPath(); o.arc(x, y, 6, 0, TAU); o.fill(); }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const ormT = new THREE.CanvasTexture(co); ormT.colorSpace = THREE.NoColorSpace; ormT.anisotropy = 4;
  return ATLAS = {map, orm:ormT};
}

/* ---------- wheels ---------- */
function wheelGeo(spec, q){
  const h = spec.w / 2, segs = q.seg, parts = [], side = cellUV(CELL.side), rim = cellUV(CELL.rim), dark = cellUV(CELL.rimDark), disc = cellUV(CELL.disc);
  const tile = T => (i, j, n) => [j % 2 ? T.u1 : T.u0, T.v(i / (n - 1))];
  const wall = q.lod ? [[.016, .262], [.005, .275], [0, .298], [.002, .325], [.010, .345], [.030, .3565]] : [[.016, .262], [0, .300], [.008, .342], [.03, .3565]];
  const tread = [0, 1, 2, 3].map(i => [lerp(-h + .03, h - .03, i / 3), i % 3 ? .36 : .3565]);
  parts.push(lathe([
    {p:wall.map(p => [-h + p[0], p[1]]), uv:side},
    {p:tread, uv:tile(TREAD), smooth:true},
    {p:wall.map(p => [h - p[0], p[1]]).reverse(), uv:side, smooth:true},
  ], segs));
  /* rim lip, barrel, hub, disc */
  const xr = h - .022, xh = xr - spec.dish, xd = xh - .05;
  parts.push(lathe([
    {p:[[h - .016, .268], [h - .004, .267], [h, .260], [h - .004, .252], [xr, .247]], uv:rim},
    {p:[[xr, .247], [h - .05, .240], [-h + .02, .236]], uv:dark},
    {p:[[xh - .035, .085], [xh + .004, .085]], uv:dark},
    {p:[[xh + .004, .085], [xh + .012, .06], [xh + .014, .032]], uv:rim},
    {p:[[xh + .014, .032], [xh + .018, .029], [xh + .018, 0]], uv:cellUV(CELL.black)},
    {p:[[xd - .03, .208], [xd, .208]], uv:disc},
    {p:[[xd, .208], [xd, .115]], uv:tile(DISC)},
    {p:[[xd, .115], [xd + .012, .105], [xd + .03, .10], [xd + .03, .07]], uv:disc},
  ], q.lod ? segs : 12));
  /* five twin spokes, dished towards the hub */
  const ns = q.spoke, X = new V3(1, 0, 0);
  for (let i = 0; i < 5; i++) for (const sg of [-1, 1]){
    const fl = [], fr = [], bl = [], br = [];
    for (let k = 0; k <= ns; k++){
      const f = k / ns, r = lerp(.062, .252, f), a = i * TAU / 5 + sg * lerp(.15, .31, f), x = lerp(xh, xr, Math.pow(f, 1.6)) + .004;
      const wf = lerp(.03, .019, f), dp = lerp(.04, .022, f), c = new V3(x, r * Math.cos(a), r * Math.sin(a)), t = new V3(0, -Math.sin(a), Math.cos(a));
      fl.push(c.clone().addScaledVector(t, -wf / 2)); fr.push(c.clone().addScaledVector(t, wf / 2));
      bl.push(c.clone().addScaledVector(t, -wf / 2 - .005).addScaledVector(X, -dp)); br.push(c.clone().addScaledVector(t, wf / 2 + .005).addScaledVector(X, -dp));
    }
    const am = i * TAU / 5 + sg * .23, tm = new V3(0, -Math.sin(am), Math.cos(am));
    parts.push(setUV(gridGeo([fl, fr], () => X), rim), setUV(gridGeo([bl, fl], () => tm.clone().negate()), rim), setUV(gridGeo([fr, br], () => tm), rim));
  }
  return mergeGeometries(parts.map(prep));
}
/* the caliper stays still while the wheel turns: an arc over the disc, centred at angle ac (0 = top, +90deg = forward) */
function caliperGeo(spec, ac, left){
  const h = spec.w / 2, xd = h - .022 - spec.dish - .05, x0 = xd - .05, x1 = xd + .034, r0 = .118, r1 = .23, uv = cellUV(CELL.caliper);
  const a = left ? -ac : ac, prof = [[x0, r1], [x1 - .014, r1], [x1, r1 - .014], [x1, r0], [x0, r0]];
  const runs = []; for (let i = 0; i < prof.length - 1; i++) runs.push({p:[prof[i], prof[i + 1]], uv});
  const g = lathe(runs, 5, a - .5, a + .5), parts = [g];
  for (const e of [-.5, .5]){ const c = Math.cos(a + e), s = Math.sin(a + e), ring = prof.map(p => new V3(p[0], p[1] * c, p[1] * s));
    const ctr = new V3((x0 + x1) / 2, (r0 + r1) / 2 * c, (r0 + r1) / 2 * s), t = new V3(0, -s * e, c * e); parts.push(setUV(capFan(ring, ctr, () => t), uv)); }
  const m = mergeGeometries(parts.map(prep)); if (left) m.rotateY(Math.PI); return m;
}

/* ---------- build all static geometry for one quality ---------- */
const CACHE = {};
function build(q){
  const G = {paint:[], trim:[], glass:[], head:[], tail:[], atlas:[]};
  const both = (list, g) => { list.push(g, mirrorX(g)); };

  /* body shell: sections along z; inside a wheel arch the lower edge follows the arch */
  const zs = [], near = z => Math.abs(Math.abs(z) - AX) < RA + .04;
  for (let z = -2.25; z < 2.15; z += q.dz) if (!near(z)) zs.push(z);
  zs.push(...(q.lod ? [2.2, 2.27, 2.32, 2.35] : [2.24, 2.32, 2.35]));
  for (const zc of [AX, -AX]){ zs.push(zc - RA - .012, zc + RA + .012); for (let i = 0; i <= q.arch; i++) zs.push(zc + RA * Math.cos(Math.PI * i / q.arch)); }
  zs.sort((a, b) => a - b);
  const M = 5 * q.k, rows = [], edge = [];
  for (const z of zs){
    let tc = 1, arch = 0;
    for (const zc of [AX, -AX]){ const dz = Math.abs(z - zc); if (dz <= RA + .0125) arch = zc > 0 ? 1 : 2;
      if (dz <= RA + 1e-6){ const yA = WR + Math.sqrt(Math.max(0, RA * RA - dz * dz)); let py = body.xy(z, .4)[1];
        for (let t = .404; t <= 1.0001; t += .004){ const y = body.xy(z, t)[1]; if (y <= yA){ tc = t - .004 * (yA - y) / Math.max(1e-6, py - y); break; } py = y; } } }
    const row = []; for (let c = 0; c <= 2 * M; c++) row.push(body.P(z, (c - M) / M * tc));
    rows.push(row); edge.push({p:body.P(z, tc), arch, z});
  }
  G.paint.push(gridGeo(rows));
  const nose = rows[rows.length - 1], tail = rows[0], last = edge.length - 1;
  G.paint.push(capFan(nose, new V3(0, .262, 2.345), dir(0, -.4, 1)));
  /* rear panel: a painted frame around a recessed dark grille */
  const inset = tail.map(p => new V3(p.x * .93, .615 + (p.y - .615) * .8, p.z + .05));
  G.paint.push(gridGeo([tail, inset], dir(0, 0, -1)));
  G.trim.push(capFan(inset, new V3(0, .615, inset[0].z), dir(0, 0, -1)));

  /* black lower body: walls from the lower edge down to the floor, wheel-arch liners */
  const yFloor = z => z > 1.76 ? .14 : z < -1.76 ? lerp(.125, .26, sstep(-1.76, -2.25, z)) : .125;
  const G0 = e => new V3(e.p.x - .03, yFloor(e.z), e.p.z);
  const topAt = (z, x) => { for (let t = 0; t <= .4; t += .01){ const p = body.xy(z, t); if (p[0] >= x) return p[1]; } return body.xy(z, .4)[1]; };   /* height of the upper surface at half-width x */
  let run = [edge[0]];
  const flush = () => { if (run.length > 1){ if (run[0].arch && run[1].arch === run[0].arch && run[run.length - 1].arch === run[0].arch){
        both(G.trim, gridGeo([run.map(e => e.p), run.map(e => new V3(.74, Math.min(e.p.y, topAt(e.z, .74) - .03), e.p.z)), run.map(e => new V3(WELL, Math.min(e.p.y, topAt(e.z, WELL) - .04), e.p.z)), run.map(e => new V3(WELL, .12, e.p.z))], dir(-1, -1, 0)));
      } else both(G.trim, gridGeo([run.map(e => e.p), run.map(G0)], dir(1, 0, 0))); } };
  for (let i = 1; i <= last; i++){
    const inA = edge[i - 1].arch && edge[i].arch === edge[i - 1].arch, wasA = run.length > 1 ? (run[0].arch && run[1].arch === run[0].arch) : inA;
    if (inA !== wasA){ flush(); run = [edge[i - 1]]; }
    run.push(edge[i]);
  }
  flush();
  const eT = edge[last], eR = edge[0], mx = p => new V3(-p.x, p.y, p.z);
  G.trim.push(gridGeo([[mx(eT.p), eT.p], [mx(G0(eT)), G0(eT)]], dir(0, 0, 1)));                 /* chin under the nose */
  G.trim.push(gridGeo([[mx(eR.p), eR.p], [mx(G0(eR)), G0(eR)]], dir(0, 0, -1)));                 /* lower rear */
  /* front splitter: follows the nose outline, a little proud of it */
  { const out = [], xT = eT.p.x + .035, zT = eT.p.z + .05, n = q.lod ? 8 : 4;
    for (let i = 0; i < n; i++){ const x = xT * i / n; out.push([x, zT + .13 * (1 - (x / xT) ** 2)]); }
    for (let i = last; i >= 0 && edge[i].z > 1.775; i--) out.push([edge[i].p.x + .035, edge[i].p.z + lerp(.02, .05, sstep(1.78, 2.2, edge[i].z))]);
    const L = out.map(p => new V3(-p[0], .135, p[1])), R = out.map(p => new V3(p[0], .135, p[1]));
    G.trim.push(gridGeo([L, R], dir(0, 1, 0)));
    const loop = [...L.slice().reverse(), ...R.slice(1)];
    G.trim.push(gridGeo([loop, loop.map(p => new V3(p.x, .112, p.z))], p => new V3(p.x, 0, p.z - 1.6))); }
  /* floor, diffuser */
  G.trim.push(box(1.4, .02, 3.9, 0, .112, .15), box(1.86, .02, 1.84, 0, .113, 0));
  G.trim.push(gridGeo([[new V3(-.86, .125, -1.76), new V3(.86, .125, -1.76)], [new V3(-.86, .26, -2.25), new V3(.86, .26, -2.25)]], dir(0, -1, 0)));
  for (const x of q.lod ? [-.6, -.36, -.12, .12, .36, .6] : [-.45, -.15, .15, .45]) G.trim.push(box(.014, .13, .44, x, .19, -2.04));

  /* canopy: windscreen, side windows and the glass engine cover are cut out of one lofted shape */
  { const cz = [], keep = [.95, .29, -.35, -.55];
    for (let z = 1.13; z > -1.9; z -= q.dz * 1.35) if (!keep.some(k => Math.abs(k - z) < q.dz * .5)) cz.push(z);
    cz.push(-1.9, ...keep); cz.sort((a, b) => a - b);
    const Mc = 3 * q.k, k = q.k, cr = cz.map(z => { const row = []; for (let c = 0; c <= 2 * Mc; c++) row.push(canopy.P(z, (c - Mc) / Mc)); return row; });
    const kind = (i, c) => { const j = c < Mc ? Mc - 1 - c : c - Mc, zm = (cz[i] + cz[i + 1]) / 2;
      if (j < 2 * k - 1) return zm > .29 || zm < -.55 ? 'glass' : 'paint';
      if (j < 2 * k) return 'paint';
      return zm > -.35 && zm < .95 ? 'glass' : 'paint'; };
    G.paint.push(gridGeo(cr, radial, {filter:(i, c) => kind(i, c) === 'paint'}));
    G.glass.push(gridGeo(cr, radial, {filter:(i, c) => kind(i, c) === 'glass'}));
    /* engine-cover louvres: painted slats floating over the glass, raised at their rear edge */
    const wl = (2 * k - 1) / Mc - .04;
    for (let i = 0, z = -.70; i < (q.lod ? 6 : 4); i++, z -= q.lod ? .135 : .2){
      G.paint.push(patch(canopy, z, z - .09, -wl, wl, 1, q.lod ? 8 : 4, f => lerp(.004, .03, f)));
      G.trim.push(patch(canopy, z, z - .09, -wl, wl, 1, q.lod ? 8 : 4, f => lerp(.002, .028, f)));
    }
  }

  /* lights, intakes and shut lines follow the body surface */
  const nz = q.lod ? 6 : 3, o = q.lod ? 1 : 4;   /* the coarse shell needs the patches to float higher */
  for (const s of [1, -1]){
    const w0 = f => lerp(.44, .36, f);
    G.glass.push(patch(body, 1.86, 2.26, f => s * w0(f), s * .505, nz, 3, .003 * o));                                   /* headlight lens */
    G.head.push(patch(body, 1.90, 2.245, f => s * (w0(f) + .01), f => s * (w0(f) + .024), nz, 1, .006 * o));          /* LED strips */
    G.head.push(patch(body, 2.05, 2.245, s * .477, s * .491, nz, 1, .006 * o));
    G.trim.push(patch(body, 1.93, 2.30, f => s * lerp(.78, .64, f), f => s * lerp(.86, .96, f), nz, 3, .003 * o));     /* front corner intake */
    G.trim.push(patch(body, -.93, -.60, f => s * lerp(.53, .68, f), f => s * lerp(.86, .75, f), nz, 4, .003 * o));     /* side intake */
    if (q.lod){
      G.trim.push(ribbon(body, [[.90, s * .42], [.86, s * .6], [.80, s * .8], [.78, s * .985]], .009, .0025));    /* door, front */
      G.trim.push(ribbon(body, [[-.34, s * .42], [-.40, s * .6], [-.48, s * .76], [-.50, s * .985]], .009, .0025)); /* door, rear */
    }
  }
  if (q.lod){
    G.trim.push(ribbon(body, [[.90, .37], [1.5, .33], [1.9, .27], [1.99, .17], [2.02, 0], [1.99, -.17], [1.9, -.27], [1.5, -.33], [.90, -.37]], .009, .0025));   /* front lid */
    G.trim.push(ribbon(body, [[-1.75, .37], [-2.0, .33], [-2.09, .2], [-2.11, 0], [-2.09, -.2], [-2.0, -.33], [-1.75, -.37]], .009, .0025));                      /* engine lid */
  }

  /* tail: full-width light bar, exhausts, plate */
  const zr = inset[0].z;
  G.tail.push(box(1.56, .024, .014, 0, .722, zr - .006), box(.024, .06, .014, -.768, .704, zr - .006), box(.024, .06, .014, .768, .704, zr - .006));
  G.atlas.push(setUV(box(.36, .1, .008, 0, .545, zr - .004), cellUV(CELL.plate)));
  if (q.lod) for (const y of [.50, .56, .62, .665]) for (const sx of [-1, 1]) G.atlas.push(setUV(box(.52, .007, .008, sx * .5, y, zr - .004), cellUV(CELL.rimDark)));   /* grille slats */
  for (const x of [-.42, .42]){
    const chrome = cellUV(CELL.chrome), black = cellUV(CELL.black);
    const g = lathe([{p:[[0, .052], [.1, .052]], uv:chrome}, {p:[[.1, .052], [.1, .043]], uv:chrome}, {p:[[.1, .043], [0, .043]], uv:black}, {p:[[.015, .043], [.015, 0]], uv:black}], q.lod ? 16 : 8);
    g.rotateY(Math.PI / 2); g.translate(x, .545, zr + .045); G.atlas.push(g);
  }
  /* rear wing on two pylons */
  { const af = [[0, 0], [-.03, .018], [-.10, .026], [-.20, .016], [-.27, .004], [-.27, -.002], [-.18, -.006], [-.08, -.008], [-.02, -.007]], nx = q.lod ? 8 : 4, wr = [];
    for (let i = 0; i <= nx; i++){ const x = lerp(-.86, .86, i / nx), up = .018 * (1 - (x / .86) ** 2); wr.push(af.map(p => new V3(x, .995 + up + p[1] - p[0] * .16, -1.93 + p[0]))); }
    G.trim.push(gridGeo(wr, p => new V3(0, p.y - 1.02, p.z + 2.06), {wrap:true}));
    for (const x of [-.86, .86]) G.trim.push(box(.012, .08, .29, x, 1.014, -2.065, .16));
    for (const x of [-.44, .44]) G.trim.push(beam(new V3(x, .82, -2.03), new V3(x, 1.0, -2.07), .014, .07)); }
  /* mirrors */
  for (const s of [1, -1]){
    const m = new THREE.SphereGeometry(1, q.lod ? 12 : 8, q.lod ? 8 : 5); m.scale(.1, .05, .06); m.rotateY(s * -.25); m.translate(s * .985, .885, .66); G.paint.push(prep(m));
    G.trim.push(beam(new V3(s * .83, .80, .74), new V3(s * .95, .868, .67), .05, .014));
    G.trim.push(box(.15, .07, .004, s * .975, .885, .615, 0, s * -.25));
  }
  /* rear calipers do not steer, so they live in the static detail mesh */
  for (const s of [1, -1]){ const g = caliperGeo(WHEEL.rear, 1.2, s < 0); g.translate(s * TRK, WR, -AX); G.atlas.push(g); }

  const out = {};
  for (const k of Object.keys(G)) out[k] = mergeGeometries(G[k].map(prep));
  const wf = wheelGeo(WHEEL.front, q), wr = wheelGeo(WHEEL.rear, q);
  out.wheels = [wf, wf.clone().rotateY(Math.PI), wr, wr.clone().rotateY(Math.PI)];
  out.calipers = [caliperGeo(WHEEL.front, -1.2, false), caliperGeo(WHEEL.front, -1.2, true)];
  return out;
}

/* ---------- public ---------- */
export function makeHeroCar({paint = '#7d0a12', quality = 'mid'} = {}){
  const q = QUALITY[quality] || QUALITY.mid, geo = CACHE[quality] || (CACHE[quality] = build(q)), tex = atlas();
  const paintMat = new THREE.MeshPhysicalMaterial({color:paint, metalness:.3, roughness:.4, clearcoat:1, clearcoatRoughness:.05, envMapIntensity:.8});
  const trim = new THREE.MeshStandardMaterial({color:'#101114', roughness:.5, metalness:.15, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-2});
  const glass = new THREE.MeshStandardMaterial({color:'#0a0e12', metalness:.2, roughness:.04, envMapIntensity:1.7, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-2});
  const head = new THREE.MeshStandardMaterial({color:'#fff6e0', emissive:'#fff1c8', emissiveIntensity:3.5, roughness:.2, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-4});
  const tail = new THREE.MeshStandardMaterial({color:'#5a0d09', emissive:'#ff2a1f', emissiveIntensity:2.5, roughness:.3});
  const detail = new THREE.MeshStandardMaterial({map:tex.map, roughnessMap:tex.orm, metalnessMap:tex.orm, roughness:1, metalness:1});
  const root = new THREE.Group(); root.name = 'heroCar';
  const add = (parent, name, g, mat) => { const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  add(root, 'body', geo.paint, paintMat); add(root, 'trim', geo.trim, trim); add(root, 'glass', geo.glass, glass);
  add(root, 'headlights', geo.head, head).castShadow = false; add(root, 'taillights', geo.tail, tail).castShadow = false; add(root, 'details', geo.atlas, detail);
  const wheels = [], fronts = [];
  [[TRK, AX], [-TRK, AX], [TRK, -AX], [-TRK, -AX]].forEach(([x, z], i) => {
    const piv = new THREE.Group(); piv.name = 'wheelpiv'; piv.position.set(x, WR, z); root.add(piv);
    wheels.push(add(piv, 'wheel', geo.wheels[i], detail));
    if (z > 0){ fronts.push(piv); add(piv, 'caliper', geo.calipers[i], detail); }
  });
  return {root, wheels, fronts, lights:{head, tail}, paintMat};
}
