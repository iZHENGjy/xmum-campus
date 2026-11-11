/* XMUM 校园漫游 · 渲染器、相机、材质、建筑生成器 */
'use strict';
const $ = s => document.querySelector(s);
const canvas = $('#c');
const TOUCH = matchMedia('(pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
/* 画质档位在 js/quality.js（window.XQ）；像素比和阴影在下面的 applyQuality 里按档位设 */
try { renderer = new THREE.WebGLRenderer({canvas, antialias:XQ.aa}); }
catch(e){ $('#err').hidden = false; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, XQ.cfg.pr));
const ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

/* map-pixel -> metres. Pixels refer to the campus plan (Sept 2025), enlarged 3x. North is up. */
const SC = 0.6, CX = 980, CY = 444, D2R = Math.PI / 180;
const P = (px, py) => [(px - CX) * SC, (py - CY) * SC];
const S = v => v * SC;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd2ef');
scene.fog = new THREE.Fog('#9fd2ef', 900, 2600);
const camera = new THREE.PerspectiveCamera(50, 1, 2, 6000);
camera.position.set(170, 470, 760);

const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(60, 0, 0);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 30; controls.maxDistance = 1400;
controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 0.3;

const UP = new THREE.Vector3(0, 1, 0);
let seed = 20250901;
function rnd(){ seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
/* private generator for model details, so decorating never shifts the shared rnd() sequence that places things */
function mkRng(s){ return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight('#dff0ff', '#5d7340', 0.72); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e2', 1.05);
sun.castShadow = true; sun.shadow.mapSize.set(XQ.cfg.smap || 1024, XQ.cfg.smap || 1024);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 2400;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
scene.add(sun); scene.add(sun.target);
let shadowHalf = 0;
function fitShadow(cx, cz, half){
  const c = sun.shadow.camera;
  if (half !== shadowHalf){ c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.updateProjectionMatrix(); shadowHalf = half; }
  sun.target.position.set(cx, 0, cz);
}
fitShadow(0, 0, 640);
/* quality tier -> resolution and shadows (called now and again whenever the tier changes) */
function applyQuality(){
  const c = XQ.cfg, on = c.shadow > 0, type = c.shadow > 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, c.pr) * XQ.scale);
  const recompile = renderer.shadowMap.enabled !== on || renderer.shadowMap.type !== type;
  renderer.shadowMap.enabled = on; renderer.shadowMap.type = type; sun.castShadow = on;
  if (on && sun.shadow.mapSize.x !== c.smap){ sun.shadow.mapSize.set(c.smap, c.smap); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (recompile) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  renderer.shadowMap.needsUpdate = true;
  if (typeof resize === 'function') resize();
}
XQ.onChange(applyQuality);

/* ---------- materials ---------- */
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:0.9, metalness:0}, o || {}));
const granite = M('#b7b0a4'), white = M('#f3efe7'), trim = M('#e6dece'), ridgeMat = M('#7e3019', {roughness:.7});
const darkStone = M('#2f3337', {roughness:.5});
const roofCache = {};
/* barrel tiles (瓦垄): two ridges and two courses per repeat. Each ridge is shaded like a half pipe, each course ends in a shadow line where
   the next one overlaps it, and every tile is a touch lighter or darker than its neighbours. One repeat covers TILE_U x TILE_V metres. */
const TILE_U = 1.7, TILE_V = 2.2;
const tileTex = (() => {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), rr = mkRng(1717);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){
    const x = i * 64, y = j * 64, v = Math.round(214 + rr() * 34), gr = g.createLinearGradient(x, 0, x + 64, 0);
    const col = k => `rgb(${Math.round(v * k)},${Math.round(v * k)},${Math.round(v * k)})`;
    gr.addColorStop(0, col(.5)); gr.addColorStop(.1, col(.74)); gr.addColorStop(.36, col(1.08)); gr.addColorStop(.62, col(.9)); gr.addColorStop(.9, col(.66)); gr.addColorStop(1, col(.5));
    g.fillStyle = gr; g.fillRect(x, y, 64, 64);
    const sh = g.createLinearGradient(0, y + 44, 0, y + 64); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(.8, 'rgba(0,0,0,.3)'); sh.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = sh; g.fillRect(x, y + 44, 64, 20);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(x + 8, y, 48, 3);
  }
  for (let k = 0; k < 260; k++){ g.fillStyle = rr() < .5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'; g.fillRect(rr() * N, rr() * N, 2 + rr() * 5, 1 + rr() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t;
})();
const roofMat = c => roofCache[c] || (roofCache[c] = M(c, {roughness:.62, side:THREE.DoubleSide, map:tileTex}));
function flatMat(c, po, extra){ return M(c, Object.assign({polygonOffset:true, polygonOffsetFactor:-po, polygonOffsetUnits:-po * 4, side:THREE.DoubleSide}, extra || {})); }

/* ---------- shared low-poly geometry helpers (merge parts so a model costs one draw call per material) ---------- */
const _gc = new THREE.Color();
/* paint a whole geometry one colour (for vertexColors materials) */
function geoTint(geo, col){
  _gc.set(col); const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++){ a[i * 3] = _gc.r; a[i * 3 + 1] = _gc.g; a[i * 3 + 2] = _gc.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
/* merge geometries into one non-indexed geometry (position + normal, plus colour if every part has one) */
function geoMerge(list){
  const gs = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of gs){ if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; }
  const col = gs.every(g => g.attributes.color), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = col ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of gs){ pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (cl) cl.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (cl) g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  return g;
}
/* like geoMerge, but keeps texture coordinates (zeros for parts without them) so textured parts can share one mesh */
function geoMergeUV(list){
  const gs = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of gs){ if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = gs.some(g => g.attributes.color) ? new Float32Array(n * 3).fill(1) : null;
  let o = 0;
  for (const g of gs){ pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/* average normals of coincident vertices whose faces bend less than maxDeg (smooths seams/bevels, keeps hard creases) */
function smoothNormals(geo, maxDeg){
  geo.computeVertexNormals();
  const p = geo.attributes.position, nm = geo.attributes.normal, n = p.count, cosT = Math.cos((maxDeg == null ? 60 : maxDeg) * D2R), map = new Map(), out = new Float32Array(n * 3);
  /* non-indexed: weight each corner by its triangle's area, so big flat faces keep crisp normals next to small bevel faces */
  const wt = new Float32Array(n).fill(1);
  if (!geo.index) for (let t = 0; t + 2 < n; t += 3){
    const ax = p.getX(t + 1) - p.getX(t), ay = p.getY(t + 1) - p.getY(t), az = p.getZ(t + 1) - p.getZ(t), bx = p.getX(t + 2) - p.getX(t), by = p.getY(t + 2) - p.getY(t), bz = p.getZ(t + 2) - p.getZ(t);
    wt[t] = wt[t + 1] = wt[t + 2] = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) + 1e-7;
  }
  const key = i => Math.round(p.getX(i) * 1e3) + ',' + Math.round(p.getY(i) * 1e3) + ',' + Math.round(p.getZ(i) * 1e3);
  for (let i = 0; i < n; i++){ const k = key(i); let a = map.get(k); if (!a) map.set(k, a = []); a.push(i); }
  map.forEach(a => {
    for (const i of a){
      let x = 0, y = 0, z = 0; const ix = nm.getX(i), iy = nm.getY(i), iz = nm.getZ(i);
      for (const j of a){ const jx = nm.getX(j), jy = nm.getY(j), jz = nm.getZ(j); if (ix * jx + iy * jy + iz * jz >= cosT){ x += jx * wt[j]; y += jy * wt[j]; z += jz * wt[j]; } }
      const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
  });
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3)); return geo;
}
/* box with rounded edges (r = corner radius), centred on the origin */
function roundBox(w, h, d, r, seg){
  seg = seg || 3;
  r = Math.max(.002, Math.min(r, w / 2 - .003, h / 2 - .003, d / 2 - .003));
  const b = r * .75, x = w / 2 - r, y = h / 2 - r, pts = [];
  /* corner arcs only (no duplicate points, which would make the bevel spike) */
  for (const [cx, cy, a0] of [[x, -y, -Math.PI / 2], [x, y, 0], [-x, y, Math.PI / 2], [-x, -y, Math.PI]])
    for (let i = 0; i <= seg; i++){ const a = a0 + i / seg * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {depth:d - 2 * b, bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelOffset:-b, bevelSegments:seg, curveSegments:seg});
  g.translate(0, 0, -(d - 2 * b) / 2); g.deleteAttribute('uv'); return smoothNormals(g, 50);
}
/* tapered cylinder from point a to point b */
function rodGeo(r0, r1, a, b, seg){
  const A = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(b[0], b[1], b[2]).sub(A), L = d.length();
  const m = new THREE.Matrix4().compose(A.addScaledVector(d, .5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1));
  return new THREE.CylinderGeometry(r1, r0, L, seg || 8, 1, true).applyMatrix4(m);
}
/* place a geometry: translate, then rotate (Euler XYZ), returns it */
const _gm = new THREE.Matrix4(), _ge = new THREE.Euler();
function geoAt(geo, x, y, z, rx, ry, rz, sx, sy, sz){
  _gm.compose(_cp.set(x || 0, y || 0, z || 0), _cq.setFromEuler(_ge.set(rx || 0, ry || 0, rz || 0)), _cs.set(sx || 1, sy || sx || 1, sz || sx || 1));
  return geo.applyMatrix4(_gm);
}

/* ---------- chunked instancing ----------
   Looks like one InstancedMesh to the game code (setMatrixAt / setColorAt / castShadow / visible), but is split by map cell so that
   off-screen cells are culled and only cells near the camera use the full model:
   - `all`: one mesh holding every instance. With a far model it draws the distant ones (near cells are zeroed out in it);
            without one it is only shown from high above, where everything is on screen anyway.
   - one mesh per cell with the full model, shown while the camera is within range. Only these cast shadows at street level. */
const lodSets = [], _zeroM = new THREE.Matrix4().makeScale(0, 0, 0), _lm = new THREE.Matrix4();
function shareGeo(geo, sphere){ const g = new THREE.BufferGeometry(); g.attributes = geo.attributes; g.index = geo.index; g.groups = geo.groups; g.boundingSphere = sphere; return g; }
class ChunkIM {
  /* o: {far: low-poly geometry, dist: metres within which the full model is used (times XQ.cfg.lod), cell, size: reach of one instance,
         shadow: casts, shadowFar: the far model casts too when seen from above, fill: fn(o, i) -> matrix in _cm (default: x, y, z, r, s)} */
  constructor(geo, mat, spots, o){
    o = o || {};
    const n = spots.length, cell = o.cell || 150, size = o.size || 12;
    this.count = n; this.size = size; this.far = o.far || null; this.dist = o.dist || 220; this.cast = o.shadow !== false; this.castFar = !!o.shadowFar; this._vis = true;
    this.m = new Float32Array(n * 16); this.ci = new Uint16Array(n); this.li = new Uint16Array(n); this.chunks = [];
    this.instanceMatrix = {needsUpdate:false}; this.instanceColor = {needsUpdate:false};
    const cells = new Map();
    spots.forEach((s, i) => { const k = Math.floor(s.x / cell) + ',' + Math.floor(s.z / cell); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); });
    cells.forEach(idx => {
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
      for (const i of idx){ const s = spots[i], y = s.y || 0; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + size / 2, (z0 + z1) / 2), rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + size * 1.6;
      const im = new THREE.InstancedMesh(shareGeo(geo, new THREE.Sphere(c, rad)), mat, idx.length);
      im.castShadow = this.cast; im.receiveShadow = true; im.visible = false; im.frustumCulled = true;   /* r128 turns culling off for InstancedMesh by default */
      scene.add(im);
      idx.forEach((i, l) => { this.ci[i] = this.chunks.length; this.li[i] = l; });
      this.chunks.push({im, idx, c, rad, near:false});
    });
    const all = this.all = new THREE.InstancedMesh(this.far || geo, o.farMat || mat, n);
    all.frustumCulled = false; all.castShadow = false; all.receiveShadow = true; scene.add(all);
    spots.forEach((s, i) => { if (o.fill) o.fill(s, i); else _cm.compose(_cp.set(s.x, s.y || 0, s.z), _cq.setFromAxisAngle(UP, s.r || 0), _cs.setScalar(s.s == null ? 1 : s.s)); this.setMatrixAt(i, _cm); });
    lodSets.push(this);
  }
  setMatrixAt(i, m){
    m.toArray(this.m, i * 16);
    const ch = this.chunks[this.ci[i]], e = m.elements; ch.im.setMatrixAt(this.li[i], m); ch.im.instanceMatrix.needsUpdate = true;
    /* an instance moved outside its cell's bounds (lifted onto a hill, knocked away): grow the bounds so it is not culled */
    const reach = Math.hypot(e[12] - ch.c.x, e[13] - ch.c.y, e[14] - ch.c.z) + this.size;
    if (reach > ch.rad && e[0] * e[0] + e[1] * e[1] + e[2] * e[2] > 1e-6){ ch.rad = reach; ch.im.geometry.boundingSphere.radius = reach; }
    if (!(this.far && ch.near)){ this.all.setMatrixAt(i, m); this.all.instanceMatrix.needsUpdate = true; }
  }
  getMatrixAt(i, m){ return m.fromArray(this.m, i * 16); }
  setColorAt(i, c){
    const im = this.chunks[this.ci[i]].im; im.setColorAt(this.li[i], c); im.instanceColor.needsUpdate = true;
    this.all.setColorAt(i, c); this.all.instanceColor.needsUpdate = true;
  }
  get castShadow(){ return this.cast; }
  set castShadow(v){ this.cast = !!v; for (const ch of this.chunks) ch.im.castShadow = this.cast; }
  set receiveShadow(v){ this.all.receiveShadow = v; for (const ch of this.chunks) ch.im.receiveShadow = v; }
  get visible(){ return this._vis; }
  set visible(v){ this._vis = !!v; if (!v){ this.all.visible = false; for (const ch of this.chunks){ ch.im.visible = false; } } }
  set frustumCulled(v){}
  /* cam: camera position; overview: the camera is high above the map */
  update(cam, overview){
    const far = this.far, all = this.all, D = far ? this.dist * XQ.cfg.lod : XQ.cfg.props;
    let dirty = false;
    for (const ch of this.chunks){
      const near = this._vis && !overview && cam.distanceTo(ch.c) - ch.rad < D;
      if (near === ch.near){ if (ch.im.visible !== near) ch.im.visible = near; continue; }
      ch.near = near; ch.im.visible = near;
      if (far){ dirty = true; for (const i of ch.idx) all.setMatrixAt(i, near ? _zeroM : _lm.fromArray(this.m, i * 16)); }
    }
    if (dirty) all.instanceMatrix.needsUpdate = true;
    all.visible = this._vis && (far ? true : overview);
    all.castShadow = this.cast && overview && (far ? this.castFar : XQ.tier > 1);
  }
}
let lodOverview = false;
function updateLod(){
  const y = camera.position.y; if (lodOverview ? y < 130 : y > 160) lodOverview = !lodOverview;
  for (const s of lodSets) s.update(camera.position, lodOverview);
}

/* ---------- facade textures: 0 teaching (rect), 1 teaching (arched), 2 dorm, 3 dorm on a red-brick base; tone 0-2 = slightly different plaster ----------
   Painted at 256 px, or 512 px on the higher quality tiers (same drawing, scaled). One texture is 4 bays x 4 floors and repeats over the wall.
   Besides the windows there is what keeps a wall from looking like plastic: a moulding and its shadow at every floor line, mottled plaster,
   rain streaks under the sills, the odd air-conditioner, and curtains that are not all drawn the same. */
const WALL_TONES = [['#efe8da', '#f3eee4'], ['#f2e6cf', '#f5ecdb'], ['#ebe8e1', '#eeece7']];
const FACADE_PX = XQ.cfg.tex || 256;
function facadePair(kind, tone, R){
  R = R || rnd;
  const S2 = 256, cell = 64, K = FACADE_PX / S2, D = mkRng(4000 + kind * 37 + (tone || 0) * 11);   /* D: decoration only, never touches the shared sequence */
  const a = document.createElement('canvas'); a.width = a.height = FACADE_PX; const g = a.getContext('2d');
  const b = document.createElement('canvas'); b.width = b.height = FACADE_PX; const e = b.getContext('2d');
  g.scale(K, K); e.scale(K, K);
  const brick = kind === 3;
  g.fillStyle = brick ? '#b4583c' : WALL_TONES[tone || 0][kind === 2 ? 1 : 0]; g.fillRect(0, 0, S2, S2);
  e.fillStyle = '#000'; e.fillRect(0, 0, S2, S2);
  if (brick){
    /* running bond: courses 4 px high, bricks 10 px long, a third of them a shade off */
    for (let y = 0; y < S2; y += 4) for (let x = (y / 4 % 2) * 5 - 10; x < S2; x += 10){
      const t = D(); g.fillStyle = t < .16 ? '#9c4630' : t < .32 ? '#c2674a' : t < .4 ? '#8a3f2c' : '#b4583c'; g.fillRect(x + .5, y + .5, 9.2, 3.2);
    }
    g.fillStyle = 'rgba(236,222,200,.2)'; for (let y = 0; y < S2; y += 4) g.fillRect(0, y, S2, .6);
  } else {
    /* mottled plaster: soft lighter and darker patches */
    for (let k = 0; k < 46; k++){ const x = D() * S2, y = D() * S2, r = 10 + D() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r), dk = D() < .55;
      gr.addColorStop(0, dk ? 'rgba(96,82,60,.07)' : 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  }
  const glass = (ctx, x, y, w, h) => { const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#6f8c9b'); gr.addColorStop(1, '#2c4250'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); };
  const archPath = (ctx, x, y, w, h) => { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); };
  /* rain streak: a faint grey run below a sill or ledge */
  const streak = (x, y, w, h, al) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(70,62,50,${al})`); gr.addColorStop(1, 'rgba(70,62,50,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  /* curtain or blind half drawn across a pane */
  const curtain = (x, y, w, h) => { const t = D(); if (t > .55) return; g.fillStyle = t < .2 ? 'rgba(236,228,210,.5)' : t < .38 ? 'rgba(190,205,214,.42)' : 'rgba(214,196,170,.45)'; if (D() < .5) g.fillRect(x, y, w, h * (.25 + D() * .4)); else g.fillRect(x, y, w * (.3 + D() * .25), h); };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){
    const x = c * cell, y = r * cell;
    /* floor-line moulding: a lit top edge, the band, and the shadow it throws on the wall below (drawn at the top of the cell underneath) */
    g.fillStyle = brick ? '#e6dccb' : '#e1d6c2'; g.fillRect(x, y + cell - 7, cell, 7);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x, y + cell - 7, cell, 1);
    g.fillStyle = brick ? '#b9ad98' : '#c0b29a'; g.fillRect(x, y + cell - 1.6, cell, 1.6);
    { const gr = g.createLinearGradient(0, y, 0, y + 6); gr.addColorStop(0, 'rgba(52,42,30,.3)'); gr.addColorStop(1, 'rgba(52,42,30,0)'); g.fillStyle = gr; g.fillRect(x, y, cell, 6); }
    if (kind >= 2){
      for (const ox of [7, 35]){
        g.fillStyle = brick ? '#efe7d8' : '#dcd2c1'; g.fillRect(x + ox - 2, y + 9, 26, 37);
        glass(g, x + ox, y + 11, 22, 33); curtain(x + ox, y + 11, 22, 33);
        g.fillStyle = 'rgba(48,38,28,.34)'; g.fillRect(x + ox, y + 11, 22, 4); g.fillRect(x + ox, y + 15, 3, 29);
        g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(x + ox + 13, y + 15); g.lineTo(x + ox + 20, y + 15); g.lineTo(x + ox + 8, y + 44); g.lineTo(x + ox + 3, y + 44); g.fill();
        g.fillStyle = '#e8e1d3'; g.fillRect(x + ox + 10, y + 11, 2, 33); g.fillRect(x + ox, y + 24, 22, 1.5);
        if (R() < .6){ e.fillStyle = R() < .75 ? '#ffd08a' : '#eaf4ff'; e.fillRect(x + ox, y + 11, 22, 33); e.fillStyle = 'rgba(0,0,0,.55)'; e.fillRect(x + ox + 10, y + 11, 2, 33); }
      }
      g.fillStyle = brick ? '#e3dac9' : '#d6ccbb'; g.fillRect(x + 2, y + 45, 60, 6);
      g.fillStyle = brick ? '#c2b7a3' : '#b9ae9b'; for (let k = 0; k < 8; k++) g.fillRect(x + 4 + k * 7.5, y + 45, 1.5, 6);
      g.fillStyle = 'rgba(40,32,24,.28)'; g.fillRect(x + 2, y + 51, 60, 1.6);
      if (R() < .45){ g.fillStyle = '#c8c8c4'; g.fillRect(x + 46, y + 47, 12, 7); g.fillStyle = '#9a9a96'; g.fillRect(x + 48, y + 49, 8, 1); g.fillRect(x + 48, y + 51, 8, 1); g.fillStyle = 'rgba(30,30,30,.35)'; g.fillRect(x + 46, y + 54, 12, 1.4); streak(x + 48, y + 55, 4, 7, .2); }
      if (D() < .5) streak(x + 6 + D() * 44, y + 52, 3 + D() * 4, 5, brick ? .22 : .13);
    } else {
      const arch = kind === 1;
      g.fillStyle = '#e6ddcc'; g.fillRect(x, y, 4, cell - 7); g.fillRect(x + 60, y, 4, cell - 7);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 60, y, 1, cell - 7); g.fillStyle = 'rgba(60,48,34,.16)'; g.fillRect(x + 4, y, 1.2, cell - 7);
      g.fillStyle = '#f8f3ea'; if (arch) archPath(g, x + 12, y + 7, 40, 47); else g.fillRect(x + 12, y + 8, 40, 46); g.fill && arch && g.fill();
      g.fillStyle = '#b5a88f'; if (arch){ archPath(g, x + 15, y + 10, 34, 42); g.fill(); } else g.fillRect(x + 15, y + 11, 34, 41);
      g.save(); if (arch){ archPath(g, x + 17, y + 12, 30, 39); g.clip(); } glass(g, x + 17, y + 12, 30, 39); curtain(x + 17, y + 12, 30, 39);
      /* deep reveal: shadow along the top/left inside edge, faint reflection streak */
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(x + 36, y + 12); g.lineTo(x + 45, y + 12); g.lineTo(x + 27, y + 51); g.lineTo(x + 18, y + 51); g.fill();
      g.strokeStyle = 'rgba(48,38,28,.42)'; g.lineWidth = 6; if (arch){ archPath(g, x + 18.5, y + 13.5, 30, 39); g.stroke(); } else { g.fillStyle = 'rgba(48,38,28,.42)'; g.fillRect(x + 17, y + 12, 30, 4); g.fillRect(x + 17, y + 16, 3, 35); }
      g.restore();
      /* glazing bars: a cross, plus a transom line for the square windows */
      g.fillStyle = '#ece5d6'; g.fillRect(x + 31, y + 12, 2, 39); g.fillRect(x + 17, y + 31, 30, 2); g.fillRect(x + 24, y + 33, 1, 18); g.fillRect(x + 39, y + 33, 1, 18);
      g.fillStyle = '#d4c7af'; g.fillRect(x + 11, y + 53, 42, 3); g.fillStyle = 'rgba(40,32,24,.3)'; g.fillRect(x + 11, y + 56, 42, 1.3);
      streak(x + 13 + D() * 8, y + 57, 4 + D() * 5, 6, .12); if (D() < .5) streak(x + 36 + D() * 10, y + 57, 3 + D() * 3, 6, .1);
      if (arch){ g.fillStyle = '#d4c7af'; g.beginPath(); g.moveTo(x + 29, y + 7); g.lineTo(x + 35, y + 7); g.lineTo(x + 34, y + 13); g.lineTo(x + 30, y + 13); g.fill(); }
      if (R() < .64){
        e.fillStyle = R() < .78 ? '#ffcf86' : '#eaf4ff';
        /* teaching blocks are mostly dark after hours: only about one window in five stays lit (the facade lighting does the rest) */
        if (D() < .3){
          if (arch){ archPath(e, x + 17, y + 12, 30, 39); e.fill(); } else e.fillRect(x + 17, y + 12, 30, 39);
          e.fillStyle = '#000'; e.fillRect(x + 31, y + 12, 2, 39); e.fillRect(x + 17, y + 31, 30, 2);
        }
      }
    }
  }
  const mk = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; };
  /* vertexColors: wallBox darkens the foot of the wall and the strip under the eaves */
  return new THREE.MeshStandardMaterial({map:mk(a), emissiveMap:mk(b), emissive:0xffffff, emissiveIntensity:0, roughness:.85, vertexColors:true});
}
const wallMats = [facadePair(0), facadePair(1), facadePair(2)];
for (const t of [1, 2]) for (const k of [0, 1, 2]) wallMats.push(facadePair(k, t, mkRng(900 + t * 10 + k)));
const brickMat = facadePair(3, 0, mkRng(977)); wallMats.push(brickMat);
const wallTone = (x, z) => ((Math.round(x) * 73856093 ^ Math.round(z) * 19349663) >>> 0) % 3;
/* the four walls of a block (no top or bottom), textured one bay per ~4.5 m and one cell per floor. Vertex colours shade it like ambient occlusion:
   dirty and dark at the foot, lighter above, a shadow band under the eaves. o: {foot:false} for an upper storey that does not stand on the ground. */
function wallBox(w, h, d, floors, o){
  const pos = [], uv = [], col = [], nor = [], foot = !(o && o.foot === false), hx = w / 2, hz = d / 2;
  const ys = [-h / 2, Math.min(-h / 2 + 2.6, 0), Math.max(h / 2 - 1.5, 0), h / 2], cs = [foot ? .7 : .9, 1, 1, .8];
  const faces = [[[hx, hz], [hx, -hz], d, [1, 0, 0]], [[-hx, -hz], [-hx, hz], d, [-1, 0, 0]], [[-hx, hz], [hx, hz], w, [0, 0, 1]], [[hx, -hz], [-hx, -hz], w, [0, 0, -1]]];
  for (const [A, B, span, n] of faces){
    const bays = Math.max(1, Math.round(span / 4.5)) / 4;
    for (let k = 0; k < 3; k++){
      const y0 = ys[k], y1 = ys[k + 1], v0 = (y0 + h / 2) / h * floors / 4, v1 = (y1 + h / 2) / h * floors / 4, c0 = cs[k], c1 = cs[k + 1];
      const P = [[A[0], y0, A[1], 0, v0, c0], [B[0], y0, B[1], bays, v0, c0], [B[0], y1, B[1], bays, v1, c1], [A[0], y1, A[1], 0, v1, c1]];
      for (const i of [0, 1, 2, 0, 2, 3]){ const p = P[i]; pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); col.push(p[5], p[5], p[5]); nor.push(n[0], n[1], n[2]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/* ---------- night facade lighting ----------
   No real lights: thin additive quads laid on the walls, each fading from its bright end to nothing (the fade is the texture, the colour is per vertex).
   Uplights wash the pilasters from the ground, an orange glow hangs under the eaves, a few blue strips and bands pick out the upper floors, and the arcade glows from inside.
   One extra mesh per lit building, hidden by day and on 流畅; js/18-gfx.js fades washMat in with the street lamps. */
const washTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(.12, '#d8d8d8'); gr.addColorStop(.45, '#5a5a5a'); gr.addColorStop(.8, '#161616'); gr.addColorStop(1, '#000000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c);
})();
const washMat = new THREE.MeshBasicMaterial({map:washTex, vertexColors:true, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:false});
washMat.color.setScalar(0);
const washMeshes = [], WASH_WARM = [1, .84, .6], WASH_ORANGE = [1, .5, .14], WASH_BLUE = [.16, .4, 1], WASH_VIOLET = [.5, .28, 1];
/* aviation obstruction lights on the dorm towers (the airport is close by): filled in by crossB, drawn by js/18-gfx.js */
const AVI_LIGHTS = [];
/* a quad on a wall of a block centred on the origin: alongX faces +-z, otherwise +-x. t0..t1 along the wall, ya = bright end, yb = dark end, out = distance of the wall from the centre (signed) */
function washQuad(q, alongX, t0, t1, ya, yb, out, col, va, vb){
  const P4 = alongX ? [[t0, ya, out], [t1, ya, out], [t1, yb, out], [t0, yb, out]] : [[out, ya, t0], [out, ya, t1], [out, yb, t1], [out, yb, t0]], V = [va == null ? 0 : va, va == null ? 0 : va, vb == null ? 1 : vb, vb == null ? 1 : vb];
  for (const i of [0, 1, 2, 0, 2, 3]){ q.p.push(P4[i][0], P4[i][1], P4[i][2]); q.u.push(.5, V[i]); q.c.push(col[0], col[1], col[2]); }
}
function washMesh(q, parent){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(q.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(q.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(q.c, 3));
  const m = new THREE.Mesh(g, washMat); m.renderOrder = 2; m.visible = false; parent.add(m); washMeshes.push(m); return m;
}

/* ---------- registries ---------- */
const infos = [], colliders = [], footprints = [], pickables = [], labels = [], lakes = [], roadSegs = [];
const structures = []; let curStruct = null;
function newStruct(info){ const st = {info, groups:[], cols:[], fps:[], lbls:[], roofColor:'#c4502a', gone:false, shake:0}; structures.push(st); return st; }
function regGroup(st, g){ g.rotation.order = 'YXZ'; g.userData.base = g.position.clone(); st.groups.push(g); }
const labelBox = $('#labels');
function addLabel(text, x, y, z, minor){
  const el = document.createElement('div'); el.className = 'lbl' + (minor ? ' minor' : ''); el.textContent = text;
  labelBox.appendChild(el); const L = {el, pos:new THREE.Vector3(x, y, z), minor}; labels.push(L); if (curStruct) curStruct.lbls.push(L); return L;
}
function addBox(cx, cz, hx, hz, rot){ const c = {t:0, cx, cz, hx, hz, c:Math.cos(rot), s:Math.sin(rot)}; colliders.push(c); if (curStruct) curStruct.cols.push(c); return c; }
function addCircle(cx, cz, r){ const c = {t:1, cx, cz, r}; colliders.push(c); if (curStruct) curStruct.cols.push(c); return c; }
function addFp(f){ footprints.push(f); if (curStruct) curStruct.fps.push(f); }
/* wraps everything a block adds to the scene into one movable group, so it can be swallowed later */
function structBlock(fn){
  const st = newStruct(null), prev = curStruct; curStruct = st;
  const n = scene.children.length; fn(); const objs = scene.children.slice(n);
  let cx = 0, cz = 0; st.cols.forEach(c => { cx += c.cx; cz += c.cz; }); if (st.cols.length){ cx /= st.cols.length; cz /= st.cols.length; }
  const g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
  for (const o of objs){ o.position.x -= cx; o.position.z -= cz; g.add(o); if (!st.info && o.userData.info) st.info = o.userData.info; }
  regGroup(st, g); curStruct = prev; return () => {};
}
const _cm = new THREE.Matrix4(), _cp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cs = new THREE.Vector3();
function inPoly(x, z, poly){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
function hitsBuilding(x, z, R){
  for (const c of colliders){
    if (c.dead) continue;
    const dx = x - c.cx, dz = z - c.cz;
    if (c.t){ if (dx * dx + dz * dz < (c.r + R) * (c.r + R)) return true; }
    else { const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; if (Math.abs(lx) < c.hx + R && Math.abs(lz) < c.hz + R) return true; }
  }
  return false;
}
/* walkable / drivable area; js/12-terrain.js widens it past the hedge and adds the hedge as a wall */
const MAP = {x0:-600, x1:600, z0:-275, z1:262, wall:null};
function outOfMap(x, z, r){ r = r || 0; return x - r < MAP.x0 || x + r > MAP.x1 || z - r < MAP.z0 || z + r > MAP.z1 || (MAP.wall ? MAP.wall(x, z, r) : false); }
function blocked(x, z){
  if (hitsBuilding(x, z, .5)) return true;
  for (const L of lakes) if (inPoly(x, z, L)) return true;
  return outOfMap(x, z, 0);
}
function box(w, h, d, mat, x, y, z, parent){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (parent || scene).add(m); return m;
}

/* ---------- curved roof with Minnan swallowtail ridge ---------- */
function roofGeometry(w, d, h, over, cut){
  const W = w / 2 + over, D = d / 2 + over, N = 10, rings = [], ct = cut || 1;
  /* cut < 1: the slopes stop part-way and leave a flat top (A3's roof round its skylight) */
  const fx = W + ((W >= D ? W - D + 0.25 : 0.25) - W) * ct, fz = D + ((W >= D ? 0.25 : D - W + 0.25) - D) * ct;
  const vz = [0], vx = [0];
  for (let i = 0; i <= N; i++){
    const s = i / N, hx = W + (fx - W) * s, hz = D + (fz - D) * s, y = h * Math.pow(s, 1.65);
    rings.push([[hx, y, hz], [-hx, y, hz], [-hx, y, -hz], [hx, y, -hz]]);
    if (i){ const p = rings[i - 1][0]; vz.push(vz[i - 1] + Math.hypot(p[2] - hz, p[1] - y)); vx.push(vx[i - 1] + Math.hypot(p[0] - hx, p[1] - y)); }
  }
  const pos = [], uv = [], TU = TILE_U, TV = TILE_V;
  const uvOf = (pt, i, j) => j % 2 === 0 ? [pt[0] / TU, vz[i] / TV] : [pt[2] / TU, vx[i] / TV];
  const quad = (a, b, c, e, ua, ub, uc, ue) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue); };
  for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++){
    const a = rings[i][j], b = rings[i][(j + 1) % 4], c = rings[i + 1][(j + 1) % 4], e = rings[i + 1][j];
    quad(a, b, c, e, uvOf(a, i, j), uvOf(b, i, j), uvOf(c, i + 1, j), uvOf(e, i + 1, j));
  }
  const z2 = [0, 0], t = rings[N], b = rings[0];
  quad(t[0], t[1], t[2], t[3], z2, z2, z2, z2); quad(b[3], b[2], b[1], b[0], z2, z2, z2, z2);
  /* eave fascia: gives the tiled sheet a visible thickness along its edges */
  const ft = Math.min(.6, .2 + over * .11);
  for (let j = 0; j < 4; j++){ const a = b[j], c = b[(j + 1) % 4]; quad(a, c, [c[0], c[1] - ft, c[2]], [a[0], a[1] - ft, a[2]], z2, z2, z2, z2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}
const tipGeo = new THREE.ConeGeometry(0.32, 2, 5); tipGeo.translate(0, 1, 0);
const hornGeo = new THREE.ConeGeometry(0.22, 3, 5); hornGeo.translate(0, 1.5, 0);
/* roof pieces as geometry (offset by ox/oy/oz): tiled sheet + upturned eave tips share the tile material, ridge + swallowtail horns share ridgeMat.
   Collecting them lets a whole building's roofs render in two draw calls instead of ten per roof. */
function roofParts(w, d, h, over, ox, oy, oz, out, cut){
  out = out || {tile:[], ridge:[]};
  out.tile.push(roofGeometry(w, d, h, over, cut).translate(ox, oy, oz));
  const W = w / 2 + over, D = d / 2 + over, ridge = Math.abs(W - D) * 2 + 0.5, alongX = W >= D;
  const k = Math.max(0.6, Math.min(1.6, over / 1.8)), hk = Math.max(.6, Math.min(2, h / 6));
  if (cut && cut < 1){
    /* a ridge course round the flat top, with a horn at each corner */
    const tx = W + ((alongX ? W - D + .25 : .25) - W) * cut, tz = D + ((alongX ? .25 : D - W + .25) - D) * cut;
    for (const s of [-1, 1]){ out.ridge.push(new THREE.BoxGeometry(tx * 2 + .8, .7, .8).translate(ox, oy + h + .25, oz + s * tz), new THREE.BoxGeometry(.8, .7, tz * 2 + .8).translate(ox + s * tx, oy + h + .25, oz)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){ _cm.compose(_cp.set(ox + sx * tx, oy + h + .4, oz + sz * tz), _cq.setFromUnitVectors(UP, new THREE.Vector3(sx * .7, .8, sz * .7).normalize()), _cs.setScalar(hk)); out.ridge.push(hornGeo.clone().applyMatrix4(_cm)); }
  } else if (ridge > 1.5){
    out.ridge.push(new THREE.BoxGeometry(alongX ? ridge : 0.7, 0.6 * hk, alongX ? 0.7 : ridge).translate(ox, oy + h + .2, oz));
    for (const e of [-1, 1]) for (const side of [-1, 1]){
      const dir = alongX ? new THREE.Vector3(e * .9, .75, side * .22) : new THREE.Vector3(side * .22, .75, e * .9);
      _cm.compose(_cp.set(ox + (alongX ? e * ridge / 2 : 0), oy + h + .3, oz + (alongX ? 0 : e * ridge / 2)), _cq.setFromUnitVectors(UP, dir.normalize()), _cs.setScalar(hk));
      out.ridge.push(hornGeo.clone().applyMatrix4(_cm));
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    _cm.compose(_cp.set(ox + sx * (W - 0.2), oy + 0.1, oz + sz * (D - 0.2)), _cq.setFromUnitVectors(UP, new THREE.Vector3(sx * .75, 1, sz * .75).normalize()), _cs.setScalar(k));
    out.tile.push(tipGeo.clone().applyMatrix4(_cm));
  }
  return out;
}
/* 闽南 gable roof: two curved tiled slopes meeting at a swallowtail ridge, closed at each end by a white gable wall (山墙) with a round vent.
   L = length along the ridge, S = span across it. axis 'x': ridge along x; 'z': along z. Walls go to out.wall (untinted) for the caller's trim mesh. */
function gableParts(L, S, h, over, ox, oy, oz, out, axis){
  const N = 8, D = S / 2 + over, Wx = L / 2 + .9, pos = [], uv = [], wall = [], prof = s => h * Math.pow(Math.max(0, s), 1.65), ft = .34;
  const quad = (a, b, c, e, ua, ub, uc, ue) => { pos.push(...a, ...b, ...c, ...a, ...c, ...e); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue); };
  for (const side of [-1, 1]){
    let len = 0;
    for (let j = 0; j < N; j++){
      const s0 = j / N, s1 = (j + 1) / N, z0 = side * D * (1 - s0), z1 = side * D * (1 - s1), y0 = prof(s0), y1 = prof(s1), l = Math.hypot(z1 - z0, y1 - y0);
      const a = [-Wx, y0, z0], b = [Wx, y0, z0], c = [Wx, y1, z1], e = [-Wx, y1, z1], u0 = -Wx / TILE_U, u1 = Wx / TILE_U, v0 = len / TILE_V, v1 = (len + l) / TILE_V;
      if (side > 0) quad(a, b, c, e, [u0, v0], [u1, v0], [u1, v1], [u0, v1]); else quad(b, a, e, c, [u1, v0], [u0, v0], [u0, v1], [u1, v1]);
      len += l;
    }
    /* eave fascia */
    const zf = side * D, z2 = [0, 0];
    if (side > 0) quad([-Wx, -ft, zf], [Wx, -ft, zf], [Wx, 0, zf], [-Wx, 0, zf], z2, z2, z2, z2); else quad([Wx, -ft, zf], [-Wx, -ft, zf], [-Wx, 0, zf], [Wx, 0, zf], z2, z2, z2, z2);
  }
  const tile = new THREE.BufferGeometry(); tile.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tile.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tile.computeVertexNormals();
  /* gable walls: from the eave line up to just under the tiles, following the curve of the slope */
  const M2 = 12, hw = S / 2;
  for (const e of [-1, 1]){
    const p = [], x = e * L / 2;
    for (let k = 0; k < M2; k++){
      const za = -hw + 2 * hw * k / M2, zb = -hw + 2 * hw * (k + 1) / M2, ya = prof(1 - Math.abs(za) / D) - .1, yb = prof(1 - Math.abs(zb) / D) - .1;
      if (e > 0) p.push(x, -.3, zb, x, -.3, za, x, ya, za, x, -.3, zb, x, ya, za, x, yb, zb); else p.push(x, -.3, za, x, -.3, zb, x, yb, zb, x, -.3, za, x, yb, zb, x, ya, za);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); wall.push(g);
  }
  const ridge = [new THREE.BoxGeometry(L + 1.8, .7, .75).translate(0, h + .15, 0)], hk = Math.max(.7, Math.min(2, h / 6)), vent = [];
  for (const e of [-1, 1]){
    for (const side of [-1, 1]){ _cm.compose(_cp.set(e * (L / 2 + .9), h + .3, 0), _cq.setFromUnitVectors(UP, new THREE.Vector3(e * .9, .75, side * .22).normalize()), _cs.setScalar(hk)); ridge.push(hornGeo.clone().applyMatrix4(_cm)); }
    if (h > 4.5) vent.push(new THREE.CylinderGeometry(Math.min(1.3, h * .13), Math.min(1.3, h * .13), .12, 14).rotateZ(Math.PI / 2).translate(e * (L / 2 + .07), h * .44, 0));
  }
  const tips = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ _cm.compose(_cp.set(sx * (Wx - .2), .1, sz * (D - .2)), _cq.setFromUnitVectors(UP, new THREE.Vector3(sx * .3, 1, sz * .9).normalize()), _cs.setScalar(Math.max(0.6, Math.min(1.6, over / 1.8)))); tips.push(tipGeo.clone().applyMatrix4(_cm)); }
  const place = g => { if (axis === 'z') g.rotateY(Math.PI / 2); return g.translate(ox, oy, oz); };
  out.tile.push(place(tile)); tips.forEach(g => out.tile.push(place(g))); ridge.forEach(g => out.ridge.push(place(g)));
  out.wall = out.wall || []; wall.forEach(g => out.wall.push(place(g)));
  out.vent = out.vent || []; vent.forEach(g => out.vent.push(place(g)));
  return out;
}
/* 风车顶 (the A-row side blocks, as seen from the air): four fan-shaped tiled roofs at the corners, sloping out and down from round the middle,
   with a low glazed pyramid in the middle that shows between them along the axes, and a little hipped turret at each corner.
   Tiles go to out.tile, the glass to out.glass (vertex-coloured), its white glazing bars to deco. */
function millParts(w, d, h, over, oy, out, deco){
  const W = w / 2, D = d / 2, m = Math.min(W, D), r0 = m * .3, NA = 10, NR = 7, span = .58;
  const edge = a => Math.min(W / Math.max(1e-3, Math.abs(Math.cos(a))), D / Math.max(1e-3, Math.abs(Math.sin(a)))) + over;
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]){
    const ac = Math.atan2(sz * D, sx * W), pos = [], uv = [];
    const pt = (i, j) => { const a = ac - span + 2 * span * i / NA, s = j / NR, r = r0 + (edge(a) - r0) * s, y = oy + h * Math.pow(1 - s, 1.4) + .5 * Math.max(0, s - .85) / .15;
      return {p:[Math.cos(a) * r, y, Math.sin(a) * r], u:(a - ac) * (r0 + r) / 2 / TILE_U, v:r / TILE_V}; };
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++){
      const A = pt(i, j), B = pt(i + 1, j), C = pt(i + 1, j + 1), E = pt(i, j + 1);
      for (const q of [A, C, B, A, E, C]){ pos.push(...q.p); uv.push(q.u, q.v); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    out.tile.push(g);
    /* the turret at the corner */
    const tx = sx * (W - 3), tz = sz * (D - 3);
    tbox(deco, 4.6, 3.2, 4.6, tx, oy + 1.4, tz, PIL); tbox(deco, 5.1, .4, 5.1, tx, oy + 3.1, tz, TRIM);
    roofParts(4.6, 4.6, 1.9, .9, tx, oy + 3.3, tz, out);
  }
  /* glazed pyramid in the middle, corners on the axes, with white bars up its edges and round it */
  const hg = h * .62, gl = new THREE.ConeGeometry(m, hg, 4, 1).scale(W / m, 1, D / m).translate(0, oy + hg / 2 - .3, 0).toNonIndexed();
  (out.glass = out.glass || []).push(geoTint(gl, '#2c4258'));
  const apex = [0, oy + hg - .3, 0];
  for (const c of [[W, 0], [-W, 0], [0, D], [0, -D]]) deco.push(geoTint(rodGeo(.16, .16, apex, [c[0], oy - .3, c[1]], 4), '#eeeae2'));
  for (const f of [.35, .7]){ const yy = oy - .3 + hg * f, k = 1 - f, ring = [[W * k, 0], [0, D * k], [-W * k, 0], [0, -D * k]];
    for (let i = 0; i < 4; i++){ const a = ring[i], b = ring[(i + 1) % 4]; deco.push(geoTint(rodGeo(.12, .12, [a[0], yy, a[1]], [b[0], yy, b[1]], 4), '#eeeae2')); } }
  return out;
}
const millGlassMat = M('#ffffff', {vertexColors:true, roughness:.22, metalness:.45});
function roofMeshes(rp, mat, parent){
  const out = [new THREE.Mesh(geoMergeUV(rp.tile), mat)];
  if (rp.ridge.length) out.push(new THREE.Mesh(geoMerge(rp.ridge), ridgeMat));
  out.forEach(m => { m.castShadow = m.receiveShadow = true; parent.add(m); });
  return out;
}
function makeRoof(w, d, h, over, mat){
  const grp = new THREE.Group(); roofMeshes(roofParts(w, d, h, over, 0, 0, 0), mat, grp); return grp;
}
/* 腰檐: a tiled skirt roof wrapped round a wall at one floor line (top edge at y=0 against the wall, sloping out and down) */
function eaveRing(w, d, ov, drop){
  const pos = [], uv = [], a = [[w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]], sl = Math.hypot(ov, drop);
  for (let j = 0; j < 4; j++){
    const [x0, z0] = a[j], [x1, z1] = a[(j + 1) % 4], f = (x, z) => [x + Math.sign(x) * ov, -drop, z + Math.sign(z) * ov];
    const p0 = [x0, 0, z0], p1 = [x1, 0, z1], q0 = f(x0, z0), q1 = f(x1, z1), L = Math.hypot(x1 - x0, z1 - z0) / TILE_U, Lo = L + 2 * ov / TILE_U;
    pos.push(...q0, ...p1, ...q1, ...q0, ...p0, ...p1); uv.push(-ov / TILE_U, 0, L, sl / TILE_V, Lo - ov / TILE_U, 0, -ov / TILE_U, 0, 0, sl / TILE_V, L, sl / TILE_V);
    const ft = .28, q0b = [q0[0], q0[1] - ft, q0[2]], q1b = [q1[0], q1[1] - ft, q1[2]];
    pos.push(...q0, ...q1, ...q1b, ...q0, ...q1b, ...q0b); for (let k = 0; k < 6; k++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
const goldMat = M('#d6a63a', {metalness:.6, roughness:.35});
/* a dark line tucked under the eaves that glows gold after dark (lit in applyTime, js/10-world.js) */
const eaveMat = new THREE.MeshStandardMaterial({color:'#5b4630', emissive:'#ffb347', emissiveIntensity:0, roughness:.8});
/* trims, pilasters, balconies and canopies are vertex-coloured and merged into one mesh per building */
const decoMat = M('#ffffff', {vertexColors:true, roughness:.88});
const glassRoofMat = M('#9cc7d8', {roughness:.15, metalness:.3});
const TRIM = '#e6dece', TRIM2 = '#d6c9b1', PIL = '#efe8da', BALC = '#e9e2d4', BALC2 = '#cfc6b6', RAIL = '#474c52';
function tbox(list, w, h, d, x, y, z, col){ list.push(geoTint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col)); }
/* gold-on-oxblood name boards (one material per text, repainted once the web font arrives) */
const plaqueCache = {};
function plaqueMat(text){
  if (plaqueCache[text]) return plaqueCache[text];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d'), t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
  const paint = () => {
    g.fillStyle = '#6e2614'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#d6a63a'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = '#ecc66e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${text.length > 4 ? 64 : 76}px "Noto Serif SC","Songti SC",serif`; g.fillText(text, 256, 68); t.needsUpdate = true;
  };
  paint(); document.fonts && document.fonts.ready.then(paint);
  return plaqueCache[text] = new THREE.MeshStandardMaterial({map:t, roughness:.5});
}

/* ---------- colliders that change after the scenery is placed ----------
   Trees, lamps and props are scattered around the colliders that exist while js/10-world.js and js/15-props.js run. A building that has since been
   turned or opened up (o.placeRot, o.grand) registers its old box as a stand-in for that phase and keeps its real one switched off;
   lateColsSwap() (called from js/42-gate.js, after the scattering) drops the stand-ins and switches the real ones on. Nothing else in the world moves. */
const LATE_COLS = [], LATE_REAL = [], GRAND_FRONTS = [], ROW_LINKS = [];   /* GRAND_FRONTS: arcades to keep clear; ROW_LINKS: centre lines of the walks between the blocks */
function lateColsSwap(){
  for (const [c, gh, st] of LATE_COLS){
    if (c){ c.dead = false; LATE_REAL.push(c); }
    let i = colliders.indexOf(gh); if (i >= 0) colliders.splice(i, 1);
    i = st.cols.indexOf(gh); if (i >= 0) st.cols.splice(i, 1);
  }
  LATE_COLS.length = 0;
}
/* an arch between two piers, as a flat plate in the plane z = 0 seen from both sides: solid from the curve up to yTop */
function archGeo(xa, xb, yTop){
  const c = (xa + xb) / 2, R = Math.max(.6, (xb - xa) / 2 - .5), ys = yTop - .3 - R, N = 8, p = [];
  const quad = (x0, ya, x1, yb) => p.push(x0, ya, 0, x1, yb, 0, x1, yTop, 0, x0, ya, 0, x1, yTop, 0, x0, yTop, 0, x1, yb, 0, x0, ya, 0, x0, yTop, 0, x1, yb, 0, x0, yTop, 0, x1, yTop, 0);
  quad(xa, ys, c - R, ys); quad(c + R, ys, xb, ys);
  for (let j = 0; j < N; j++){ const a0 = Math.PI - Math.PI * j / N, a1 = Math.PI - Math.PI * (j + 1) / N; quad(c + R * Math.cos(a0), ys + R * Math.sin(a0), c + R * Math.cos(a1), ys + R * Math.sin(a1)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}

/* ---------- buildings ---------- */
const colGeo = new THREE.CylinderGeometry(.34, .4, 1, 12); colGeo.translate(0, .5, 0);
const colMat = M('#f5f0e6', {roughness:.7});
function building(o){
  const xz = o.xz || P(o.px, o.py), x = xz[0], z = xz[1];
  const w = o.w != null ? o.w : S(o.wp), d = o.d != null ? o.d : S(o.dp);
  const rot = -(o.rot || 0) * D2R;
  const rotP = o.placeRot != null ? -o.placeRot * D2R : null;   /* the way it faced when the scenery was placed */
  const info = o.info || o;
  const st = o.struct || newStruct(info), prev = curStruct; curStruct = st;
  st.roofColor = o.roof || '#c4502a';
  const g = new THREE.Group(); g.position.set(x, o.y0 || 0, z); g.rotation.y = rot; scene.add(g); regGroup(st, g);
  const H = o.floors * 3.6, y0 = 1, rmat = roofMat(o.roof || '#c4502a');
  const parts = [], gran = [], walls = [], wallsB = [], deco = [], glow = [], roofs = {tile:[], ridge:[], wall:[], vent:[]};
  if (!o.y0){ gran.push(new THREE.BoxGeometry(w + 1.4, 1, d + 1.4).translate(0, .5, 0), new THREE.BoxGeometry(w + .3, 1.3, d + .3).translate(0, 1.6, 0)); }
  const wmat = wallMats[(o.variant || 0) + 3 * wallTone(x, z)];
  /* o.brick: the lowest floors are red brick (LY towers), in their own mesh; the plaster above then does not get the dark foot */
  if (o.brick && o.brick < o.floors){
    const hb = o.brick * 3.6;
    wallsB.push(wallBox(w, hb, d, o.brick).translate(0, y0 + hb / 2, 0)); walls.push(wallBox(w, H - hb, d, o.floors - o.brick, {foot:false}).translate(0, y0 + hb + (H - hb) / 2, 0));
    tbox(deco, w + .5, .45, d + .5, 0, y0 + hb, 0, TRIM);
  } else walls.push(wallBox(w, H, d, o.floors, {foot:!o.y0}).translate(0, y0 + H / 2, 0));
  /* cornice cap, a darker frieze under it, and slim corner pilasters */
  tbox(deco, w + .8, .6, d + .8, 0, y0 + H + .3, 0, TRIM);
  tbox(deco, w + .36, .55, d + .36, 0, y0 + H - .27, 0, TRIM2);
  if (H > 5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) tbox(deco, 1, H - .55, 1, sx * (w / 2 - .3), y0 + (H - .55) / 2, sz * (d / 2 - .3), PIL);
  /* relief that catches light: a string course at every floor line, and shallow pilasters between every other bay */
  if (o.balc == null && o.relief !== false && o.floors >= 2){
    for (let fl = 1; fl < o.floors; fl++) if (!(o.waist && o.waist.indexOf(fl) >= 0)) tbox(deco, w + .26, .2, d + .26, 0, y0 + fl * 3.6 - .08, 0, TRIM2);
    if (H > 5) for (const [span, alongX] of [[w, true], [d, false]]){
      const nb = Math.max(1, Math.round(span / 4.5)), half = (alongX ? d : w) / 2 + .07;
      for (let k = 2; k < nb - 1; k += 2){ const t = -span / 2 + span * k / nb; for (const s of [-1, 1]) alongX ? tbox(deco, .52, H - .6, .2, t, y0 + (H - .6) / 2, s * half, PIL) : tbox(deco, .2, H - .6, .52, s * half, y0 + (H - .6) / 2, t, PIL); }
    }
  }
  /* night lighting (o.wash): see washMat above. o.wash can be {top:'blue'} for a blue band round the top floor instead of the orange glow, {accent:colour} for the strips */
  let wq = null;
  if (o.wash){
    wq = {p:[], u:[], c:[]};
    const acc = o.wash.accent || WASH_BLUE, up = Math.min(H - .8, 17);
    for (const [span, alongX] of [[w, true], [d, false]]){
      const nb = Math.max(1, Math.round(span / 4.5)), out = (alongX ? d : w) / 2 + .3;
      for (const s of [-1, 1]){
        /* uplight on every pilaster (corners included), a slim accent strip on the upper floors in every fourth bay */
        for (let k = 0; k <= nb; k += 2){ const t = Math.max(-span / 2 + .45, Math.min(span / 2 - .45, -span / 2 + span * k / nb)); washQuad(wq, alongX, t - .55, t + .55, y0 + .15, y0 + .15 + up, s * out, WASH_WARM); }
        if (H > 12) for (let k = 3; k < nb - 1; k += 4){ const t = -span / 2 + span * k / nb; washQuad(wq, alongX, t - .16, t + .16, y0 + H - 1.2, y0 + H * .42, s * (out - .2), acc, 0, .7); }
        /* under the eaves: orange, or a blue band round the top floor */
        if (o.wash.top === 'blue') washQuad(wq, alongX, -span / 2, span / 2, y0 + H - .3, y0 + H - 3.5, s * (out - .2), WASH_BLUE, .05, .55);
        else if (!o.flat) washQuad(wq, alongX, -span / 2, span / 2, y0 + H - .1, y0 + H - 3.4, s * (out - .2), WASH_ORANGE, 0, .8);
        if (o.waist) for (const fw of o.waist) washQuad(wq, alongX, -span / 2, span / 2, y0 + fw * 3.6 - .5, y0 + fw * 3.6 - 3, s * (out - .2), WASH_ORANGE, 0, .85);
      }
    }
    /* the arcade glows from inside */
    if (o.arcade) washQuad(wq, true, -w / 2, w / 2, y0 + 4.5, y0, d / 2 + .12, WASH_WARM, .3, .62);
  }
  const rh = o.flat ? 0 : o.roofH != null ? o.roofH : Math.min(Math.min(w, d) * 0.3, 13), over = o.over != null ? o.over : 2.4;
  if (o.flat){
    /* roof terrace: the cornice slab is the floor, with a parapet round it */
    for (const s of [-1, 1]){ tbox(deco, w + .8, 1.05, .3, 0, y0 + H + 1.1, s * (d / 2 + .25), BALC); tbox(deco, .3, 1.05, d + .2, s * (w / 2 + .25), y0 + H + 1.1, 0, BALC); }
  } else if (o.mill) millParts(w + .8, d + .8, rh * .7, over, y0 + H + .6, roofs, deco);
  else if (o.gable) gableParts(w >= d ? w + .8 : d + .8, w >= d ? d + .8 : w + .8, rh, over, 0, y0 + H + .6, 0, roofs, w >= d ? 'x' : 'z');
  else roofParts(w + .8, d + .8, rh, over, 0, y0 + H + .6, 0, roofs, o.roofCut);
  if (o.roofCut && o.roofCut < 1){
    /* the flat top inside the ridge course: a grey deck with a glazed skylight */
    const W2 = (w + .8) / 2 + over, D2 = (d + .8) / 2 + over, tx = W2 + ((W2 >= D2 ? W2 - D2 + .25 : .25) - W2) * o.roofCut, tz = D2 + ((W2 >= D2 ? .25 : D2 - W2 + .25) - D2) * o.roofCut;
    const yt = y0 + H + .6 + rh + .12;
    if (o.dome){
      /* A3 (the library): a white frame round a dark square, and in it a round glazed dome over the atrium */
      const q = Math.min(tx, tz) * .78, R = q * .78;
      tbox(deco, tx * 2 - .4, .4, tz * 2 - .4, 0, yt, 0, '#b9b2a6'); tbox(deco, q * 2, .5, q * 2, 0, yt + .08, 0, '#353d45');
      for (const s of [-1, 1]){ tbox(deco, q * 2 + 1.2, .9, .6, 0, yt + .3, s * (q + .3), '#f1ece2'); tbox(deco, .6, .9, q * 2 + 1.2, s * (q + .3), yt + .3, 0, '#f1ece2'); }
      parts.push(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .42, 1).translate(0, yt + .3, 0), glassRoofMat), {castShadow:true}));
      g.add(parts[parts.length - 1]);
      deco.push(geoTint(new THREE.TorusGeometry(R, .22, 4, 40).rotateX(Math.PI / 2).translate(0, yt + .32, 0), '#f1ece2'));
      for (let k = 0; k < 12; k++){ const a = k / 12 * Math.PI * 2; for (let j = 0; j < 4; j++){ const b0 = j / 4 * Math.PI / 2, b1 = (j + 1) / 4 * Math.PI / 2;
        deco.push(geoTint(rodGeo(.09, .09, [Math.cos(a) * Math.cos(b0) * R, yt + .3 + Math.sin(b0) * R * .42, Math.sin(a) * Math.cos(b0) * R], [Math.cos(a) * Math.cos(b1) * R, yt + .3 + Math.sin(b1) * R * .42, Math.sin(a) * Math.cos(b1) * R], 4), '#e8e6e0')); } }
    } else { tbox(deco, tx * 2 - .4, .4, tz * 2 - .4, 0, yt, 0, '#8d9296'); tbox(deco, tx * 1.1, .9, tz * .9, 0, y0 + H + .6 + rh + .7, 0, '#a9cbd6'); }
  }
  /* gold light under the eaves at night */
  if (o.eaveLight && !o.flat){
    /* a painted beam right under the eaves, on the sides that have them (a gable roof: two) */
    const ey = y0 + H + .28, gx = !o.gable || w >= d, gz = !o.gable || w < d;
    for (const s of [-1, 1]){ if (gx) glow.push(new THREE.BoxGeometry(w + 1, .62, .14).translate(0, ey, s * (d / 2 + .48))); if (gz) glow.push(new THREE.BoxGeometry(.14, .62, d + 1).translate(s * (w / 2 + .48), ey, 0)); }
  }
  /* 腰檐: tiled skirt roofs at given floor lines, with a trim band above */
  if (o.waist) for (const f of o.waist){
    const yw = y0 + f * 3.6, ov = o.waistOver || 1.7; roofs.tile.push(eaveRing(w + .2, d + .2, ov, ov * .56).translate(0, yw, 0)); tbox(deco, w + .5, .4, d + .5, 0, yw + .2, 0, TRIM);
    if (o.eaveLight) for (const s of [-1, 1]){ glow.push(new THREE.BoxGeometry(w + .5, .5, .14).translate(0, yw - .45, s * (d / 2 + .2)), new THREE.BoxGeometry(.14, .5, d + .5).translate(s * (w / 2 + .2), yw - .45, 0)); }
  }
  /* open terraces stepping out below the roof (LY3 食堂): a slab and a railing at each of the first floor lines, the lower one deeper */
  if (o.terraces) for (let k = 1; k <= o.terraces; k++){
    const t = (o.terraces - k + 1) * 1.6 + .6, yt = y0 + k * 3.6;
    tbox(deco, w + t * 2, .34, d + t * 2, 0, yt - .1, 0, BALC);
    for (const s of [-1, 1]){ tbox(deco, w + t * 2, .9, .14, 0, yt + .5, s * (d / 2 + t - .07), BALC2); tbox(deco, .14, .9, d + t * 2, s * (w / 2 + t - .07), yt + .5, 0, BALC2); }
  }
  /* big storey number on the two end faces of a tower arm (LY 宿舍), built from seven-segment bars */
  if (o.digit != null){
    const SEG = {0:'abcdef', 1:'bc', 2:'abged', 3:'abgcd', 4:'fgbc', 5:'afgcd', 6:'afgedc', 7:'abc', 8:'abcdefg', 9:'abcdfg'}[o.digit] || '', hD = 5.2, wD = 2.8, t = .55, yD = y0 + H - 7.5, alongX = w >= d;
    const bars = {a:[0, hD / 2, wD, t], g:[0, 0, wD, t], d:[0, -hD / 2, wD, t], f:[-wD / 2, hD / 4, t, hD / 2 + t], b:[wD / 2, hD / 4, t, hD / 2 + t], e:[-wD / 2, -hD / 4, t, hD / 2 + t], c:[wD / 2, -hD / 4, t, hD / 2 + t]};
    for (const s of [-1, 1]) for (const ch of SEG){ const [bx, by, bw2, bh] = bars[ch];
      if (alongX) tbox(deco, .16, bh, bw2, s * (w / 2 + .09), yD + by, -s * bx, '#4b5158'); else tbox(deco, bw2, bh, .16, s * bx, yD + by, s * (d / 2 + .09), '#4b5158'); }
  }
  /* dorm balconies: a parapet slab at every floor line along the long faces (skipping where the other arm of the cross meets),
     with full-height fins between the flats and a dark handrail on top */
  if (o.balc != null){
    const alongX = w >= d, L = alongX ? w : d, half = (alongX ? d : w) / 2, cut = o.balc;
    for (const side of [-1, 1]) for (const [a, b] of [[-L / 2 + .8, -cut], [cut, L / 2 - .8]]){
      const len = b - a, mid = (a + b) / 2; if (len < 2) continue;
      const put = (along, y, out, sl, h, dp, col) => alongX ? tbox(deco, sl, h, dp, along, y, side * (half + out), col) : tbox(deco, dp, h, sl, side * (half + out), y, along, col);
      for (let f = 1; f < o.floors; f++){ const yf = y0 + f * 3.6; put(mid, yf + .45, .5, len, .9, 1, BALC); put(mid, yf + .95, 1, len, .07, .07, RAIL); }
      const nb = Math.max(1, Math.round(len / 4.5));
      for (let k = 0; k <= nb; k++) put(a + len * k / nb, y0 + 3.6 + (H - 3.6) / 2, .55, .22, H - 3.6, 1.1, BALC2);
    }
  }
  const cols = [];
  const bw = Math.max(10, w * .26);
  /* off = distance of the box's centre in front of the building's centre. real === false: only the stand-in (see LATE_COLS) */
  const colBox = (off, hx, hz, real) => {
    let c = null;
    if (real !== false) c = addBox(x + Math.sin(rot) * off, z + Math.cos(rot) * off, hx, hz, rot);
    if (rotP != null || real === false){ const rg = rotP != null ? rotP : rot; if (c) c.dead = true; LATE_COLS.push([c, addBox(x + Math.sin(rg) * off, z + Math.cos(rg) * off, hx, hz, rg), st]); }
    return c;
  };
  const deep = o.grand || o.arcade === 'deep', AD = 4.4, zc = d / 2 + AD, yP = y0 + 4.6;   /* deep arcade: columns AD in front of the wall, standing on the ground; yP = its ceiling */
  if (o.bay && o.grand){
    /* the entrance tower of a grand block: an open porch at ground level that the arcade runs straight through (four piers, two columns, arches),
       the tower above it, an open lookout storey under the gable */
    const bf = o.floors + 1.3, bH = bf * 3.6, zb0 = d / 2 - 1.5, zb1 = zc + .6, bd = zb1 - zb0, bz = (zb0 + zb1) / 2, yL = y0 + bH + .6, LH = 3.3, px2 = bw / 2 - .6;
    walls.push(wallBox(bw, bH - 4.6, bd, bf - 4.6 / 3.6, {foot:false}).translate(0, yP + (bH - 4.6) / 2, bz));
    tbox(deco, bw + .8, .6, bd + .8, 0, y0 + bH + .3, bz, TRIM); tbox(deco, bw + .36, .55, bd + .36, 0, y0 + bH - .27, bz, TRIM2);
    tbox(deco, bw + .6, .55, bd + .6, 0, yP + .1, bz, TRIM);
    for (const sx of [-1, 1]){
      tbox(deco, .9, bH - 5.2, .9, sx * (bw / 2 - .25), yP + .4 + (bH - 5.2) / 2, zb1 - .25, PIL);
      for (const zz of [d / 2 + 1.1, zb1 - .6]){ tbox(deco, 1.2, yP, 1.2, sx * px2, yP / 2, zz, PIL); tbox(gran, 1.5, .5, 1.5, sx * px2, .25, zz, '#b7b0a4'); }
      deco.push(geoTint(archGeo(d / 2 + 1.7, zb1 - 1.2, yP).rotateY(-Math.PI / 2).translate(sx * px2, 0, 0), TRIM));
      cols.push([sx * px2 / 3, zb1 - .6, yP, 1.5, 0]);
    }
    { const xs = [-px2 + .6, -px2 / 3, px2 / 3, px2 - .6]; for (let k = 0; k < 3; k++) deco.push(geoTint(archGeo(xs[k], xs[k + 1], yP).translate(0, 0, zb1 - .6), TRIM)); }
    /* lookout: corner piers, a railing, a dark stair core, its own cornice */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tbox(deco, .85, LH, .85, sx * (bw / 2 - .42), yL + LH / 2, bz + sz * (bd / 2 - .42), PIL);
    for (const s of [-1, 1]){ tbox(deco, bw - .8, .95, .14, 0, yL + .47, bz + s * (bd / 2 - .42), BALC2); tbox(deco, .14, .95, bd - .8, s * (bw / 2 - .42), yL + .47, bz, BALC2); }
    tbox(deco, bw - 3.4, LH, bd - 3, 0, yL + LH / 2, bz, '#5a5f66'); tbox(deco, bw + .9, .5, bd + .9, 0, yL + LH + .25, bz, TRIM);
    if (o.gable) gableParts(10, bw + .8, Math.min(8, bw * .46), 1.3, 0, yL + LH + .5, zb1 - 5, roofs, 'z');
    else roofParts(bw + .8, bd + .8, Math.min(7, bw * .34), 2.2, 0, yL + LH + .5, bz, roofs);
    if (wq){
      for (const sx of [-1, 1]) washQuad(wq, true, sx * (bw / 2 - .25) - .5, sx * (bw / 2 - .25) + .5, yP + .5, y0 + bH - .6, zb1 + .28, WASH_WARM);
      washQuad(wq, true, -bw / 2, bw / 2, y0 + bH - .1, y0 + bH - 3.2, zb1 + .08, WASH_ORANGE, 0, .8);
      washQuad(wq, true, -bw / 2 + 1.7, bw / 2 - 1.7, yL + LH, yL, bz + bd / 2 - 1.45, WASH_ORANGE, .1, .6);   /* the lookout glows from inside */
      washQuad(wq, true, -px2, px2, yP, y0 - 1, d / 2 + .14, WASH_WARM, .2, .55);                                /* and so does the porch */
    }
    colBox(d / 2 + 1, bw / 2 + .5, 3, false);   /* the porch is open: the old solid tower only stands in while the scenery is placed */
  } else if (o.bay){
    const bf = o.floors + 1.3, bH = bf * 3.6;
    walls.push(wallBox(bw, bH, 5, bf).translate(0, y0 + bH / 2, d / 2 + 1));
    tbox(deco, bw + .8, .6, 5.8, 0, y0 + bH + .3, d / 2 + 1, TRIM);
    tbox(deco, bw + .36, .55, 5.36, 0, y0 + bH - .27, d / 2 + 1, TRIM2);
    for (const sx of [-1, 1]) tbox(deco, .9, bH - .55, .9, sx * (bw / 2 - .25), y0 + (bH - .55) / 2, d / 2 + 3.25, PIL);
    if (o.gable) gableParts(10, bw + .8, Math.min(8, bw * .46), 1.3, 0, y0 + bH + .6, d / 2 - 1.5, roofs, 'z');
    else roofParts(bw + .8, 9, Math.min(7, bw * .34), 2.2, 0, y0 + bH + .6, d / 2 - 1, roofs);
    for (let k = 0; k < 3; k++) gran.push(new THREE.BoxGeometry(bw + 6 - k * 1.6, .35 * (k + 1), 1.3).translate(0, .175 * (k + 1), d / 2 + 3.6 + (2 - k) * 1.3));
    /* the steps used to climb to a blank wall: a glazed entrance (three pairs of doors in a stone frame) under a flat canopy on two slim columns */
    { const fz = d / 2 + 3.5, dw = Math.min(9, bw * .45), yb = 1.05, dh = 3.1;
      tbox(deco, dw + 1.2, dh + .6, .16, 0, yb + (dh + .6) / 2, fz + .02, '#d9d2c4'); tbox(deco, dw, dh, .16, 0, yb + dh / 2, fz + .06, '#26343c');
      for (let k = 1; k < 6; k++) tbox(deco, k % 2 ? .07 : .14, dh, .2, -dw / 2 + dw * k / 6, yb + dh / 2, fz + .08, '#8f979c');
      tbox(deco, dw, .12, .2, 0, yb + 2.45, fz + .08, '#8f979c');
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) tbox(deco, .05, .5, .06, -dw / 2 + dw * (2 * k + 1) / 6 + s * .18, yb + 1.25, fz + .19, '#c9ced2');
      const cy = yb + dh + .75, cd = 3.2;
      tbox(deco, dw + 3, .3, cd, 0, cy, fz + cd / 2, TRIM); tbox(deco, dw + 3.1, .45, .16, 0, cy - .05, fz + cd, TRIM2); tbox(deco, dw + 2.6, .04, cd - .3, 0, cy - .17, fz + cd / 2, '#fdf6e3');
      for (const s of [-1, 1]){
        const lx = s * (dw / 2 + 1.1), lz = fz + cd - .35; cols.push([lx, lz, cy - .15 - .35, .45, .35]);
        /* the columns collide once the scenery is placed (LATE_COLS), so nothing that was scattered moves */
        const c = addCircle(x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot), .3); c.dead = true; LATE_COLS.push([c, undefined, st]);
      }
      if (wq) washQuad(wq, true, -dw / 2, dw / 2, yb + dh, yb, fz + .3, WASH_WARM, .25, .7); }
    for (const sx of [-1, 1]) cols.push([sx * (bw / 2 - .7), d / 2 + 3.2, 4.6]);
    if (wq){ for (const sx of [-1, 1]) washQuad(wq, true, sx * (bw / 2 - .25) - .5, sx * (bw / 2 - .25) + .5, y0 + 4.9, y0 + bH - .6, d / 2 + 3.78, WASH_WARM); washQuad(wq, true, -bw / 2, bw / 2, y0 + bH - .1, y0 + bH - 3.2, d / 2 + 3.56, WASH_ORANGE, 0, .8); }
    colBox(d / 2 + 1, bw / 2 + .5, 3);
  }
  if (o.arcade && deep){
    GRAND_FRONTS.push({x, z, rot, w, d, depth:AD + 1.4});
    /* a tall arcade you can walk along: fat columns on the ground 4.4 m out from the wall, round arches between them, a flat roof over the walk */
    const skip = o.bay ? bw / 2 - .1 : (o.portico ? o.portico.w / 2 + 1.5 : -1), n = Math.max(2, Math.round((w - 2.4) / 4.5)), xs = [];
    for (let k = 0; k <= n; k++) xs.push(-w / 2 + 1.2 + (w - 2.4) * k / n);
    for (const cx2 of xs) if (Math.abs(cx2) > skip) cols.push([cx2, zc, yP, 1.5, 0]);
    for (let k = 0; k < n; k++){
      let xa = xs[k], xb = xs[k + 1]; if (Math.abs(xa) <= skip && Math.abs(xb) <= skip) continue;
      if (Math.abs(xa) <= skip) xa = skip; if (Math.abs(xb) <= skip) xb = -skip;
      if (xb - xa > 1.6) deco.push(geoTint(archGeo(xa, xb, yP).translate(0, 0, zc), TRIM));
    }
    tbox(deco, w + 1.4, .12, AD + 1.5, 0, .06, d / 2 + (AD + 1.5) / 2, '#8a8377');   /* paved floor of the walk */
    for (const [xa, xb] of skip > 0 ? [[-w / 2 - .5, -skip], [skip, w / 2 + .5]] : [[-w / 2 - .5, w / 2 + .5]]){
      tbox(deco, xb - xa, .5, AD + .9, (xa + xb) / 2, yP + .25, d / 2 + (AD + .9) / 2 - .1, TRIM); tbox(deco, xb - xa + .3, .18, AD + 1.2, (xa + xb) / 2, yP + .59, d / 2 + (AD + .9) / 2 - .1, TRIM2);
    }
  } else if (o.arcade){
    const skip = o.bay ? bw / 2 + 1 : (o.portico ? o.portico.w / 2 + 1 : -1);
    for (let cx2 = -w / 2 + 1.6; cx2 <= w / 2 - 1.6 + .01; cx2 += 4.5){ if (Math.abs(cx2) < skip) continue; cols.push([cx2, d / 2 + 1.8, 4.6]); }
    tbox(deco, w + .6, .45, 2.8, 0, y0 + 4.6 + .22, d / 2 + 1.2, TRIM);
    tbox(deco, w + .3, .18, 2.4, 0, y0 + 4.6 + .54, d / 2 + 1.2, TRIM2);
  }
  if (o.portico && o.portico.curve){
    /* A3: six tall round columns on a shallow arc, carrying a curved entablature with a balustrade; flat deck behind it */
    const pw = o.portico.w, ph = o.portico.h, n = 6, sag = o.portico.curve, cr = o.portico.r || 2, zc = k => d / 2 + (deep ? AD : 1.3) + sag * (1 - Math.pow(2 * k / (n - 1) - 1, 2)), xc = k => -pw / 2 + 1.5 + (pw - 3) * k / (n - 1);
    for (let k = 0; k < n; k++){
      /* with a deep arcade the columns stand out on the line of its own columns, on the ground, and the walk passes behind them */
      if (deep) cols.push([xc(k), zc(k), ph + y0, cr, 0]); else cols.push([xc(k), zc(k), ph, cr]);
      gran.push(new THREE.CylinderGeometry(cr * .56, cr * .6, deep ? 1.4 : .7, 14).translate(xc(k), deep ? .7 : y0 + .35, zc(k)));
      deco.push(geoTint(new THREE.CylinderGeometry(cr * .52, cr * .4, .7, 14).translate(xc(k), y0 + ph - .35, zc(k)), TRIM));
    }
    for (let k = -1; k < n; k++){
      const k0 = Math.max(0, k), k1 = Math.min(n - 1, k + 1), ext = k < 0 ? -1 : k === n - 1 ? 1 : 0;
      const ax = xc(k0) + (ext < 0 ? -1.6 : 0), az = zc(k0) - (ext < 0 ? .5 : 0), bx = xc(k1) + (ext > 0 ? 1.6 : 0), bz = zc(k1) - (ext > 0 ? .5 : 0), len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(-(bz - az), bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      deco.push(geoTint(geoAt(new THREE.BoxGeometry(len + .3, 1.5, 1.9), mx, y0 + ph + .75, mz, 0, ang, 0), TRIM), geoTint(geoAt(new THREE.BoxGeometry(len + .5, .35, 2.4), mx, y0 + ph + 1.67, mz, 0, ang, 0), TRIM2),
        geoTint(geoAt(new THREE.BoxGeometry(len + .3, .9, .22), mx, y0 + ph + 2.3, mz + .95, 0, ang, 0), BALC));
      if (!ext) tbox(deco, bx - ax + .1, .5, mz - d / 2 + .6, mx, y0 + ph + 1.5, (d / 2 + mz + .6) / 2, TRIM2);
    }
    if (o.portico.steps !== false) for (let k = 0; k < 4; k++) gran.push(new THREE.BoxGeometry(pw + 10 - k * 1.8, .32 * (k + 1), 1.4).translate(0, .16 * (k + 1), d / 2 + 5.6 + (3 - k) * 1.4));
    if (deep){
      /* the porch is open like the arcade either side of it: only the six columns are solid (the old box stands in while the scenery is placed) */
      colBox(d / 2 + 2.6, pw / 2 + 1, 3.2, false);
      for (let k = 0; k < n; k++){ const lx = xc(k), lz = zc(k); addCircle(x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot), cr * .42 + .25); }
    } else addBox(x + Math.sin(rot) * (d / 2 + 2.6), z + Math.cos(rot) * (d / 2 + 2.6), pw / 2 + 1, 3.2, rot);
  } else if (o.portico){
    const pw = o.portico.w, ph = o.portico.h, n = Math.max(4, Math.round(pw / 5));
    for (let k = 0; k < n; k++) cols.push([-pw / 2 + pw * k / (n - 1), d / 2 + 3.2, ph]);
    tbox(deco, pw + 3, 1.1, 5.2, 0, y0 + ph + .55, d / 2 + 2.4, TRIM);
    tbox(deco, pw + 2.2, .3, 4.6, 0, y0 + ph - .1, d / 2 + 2.4, TRIM2);
    roofParts(pw + 3, 5.2, 3.4, 1.8, 0, y0 + ph + 1.1, d / 2 + 2.4, roofs);
    for (let k = 0; k < 4; k++) gran.push(new THREE.BoxGeometry(pw + 8 - k * 1.6, .32 * (k + 1), 1.3).translate(0, .16 * (k + 1), d / 2 + 5.4 + (3 - k) * 1.3));
    addBox(x + Math.sin(rot) * (d / 2 + 2.6), z + Math.cos(rot) * (d / 2 + 2.6), pw / 2 + 1, 3.2, rot);
  }
  /* entrance canopy: on the front, or on the +x end of a dorm arm */
  if (o.canopy){
    const end = o.canopy === 'end', cw = 6.5, cd = 2.8, yc = y0 + 3.3;
    if (end){ tbox(deco, cd, .35, cw, w / 2 + cd / 2, yc, 0, TRIM); tbox(deco, .2, .5, cw, w / 2 + cd - .1, yc - .25, 0, TRIM2); tbox(deco, .5, 3.3, cw + 1.2, w / 2 + .25, y0 + 1.65, 0, BALC2); }
    else { tbox(deco, cw, .35, cd, 0, yc, d / 2 + cd / 2, TRIM); tbox(deco, cw, .5, .2, 0, yc - .25, d / 2 + cd - .1, TRIM2); tbox(deco, cw + 1.2, 3.3, .5, 0, y0 + 1.65, d / 2 + .25, BALC2); }
  }
  if (o.extra) o.extra(deco);   /* extra trim from the caller, in this building's own coordinates (crossB: the masts of the aviation lights) */
  const mk = (geo, mat, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow !== false; m.receiveShadow = true; g.add(m); parts.push(m); return m; };
  /* white gable walls and their dark round vents go into the trim mesh */
  roofs.wall.forEach(g2 => deco.push(geoTint(g2, '#f4f0e8'))); roofs.vent.forEach(g2 => deco.push(geoTint(g2, '#5a5550')));
  if (gran.length) mk(geoMerge(gran), granite);
  mk(geoMergeUV(walls), wmat); if (wallsB.length) mk(geoMergeUV(wallsB), brickMat); mk(geoMerge(deco), decoMat);
  if (glow.length) mk(geoMerge(glow), eaveMat, false);
  if (wq && wq.p.length) washMesh(wq, g);
  parts.push(...roofMeshes(roofs, rmat, g));
  if (roofs.glass) mk(geoMerge(roofs.glass), millGlassMat);
  const roofTop = y0 + H + .6 + rh;
  /* gilded pearl on the ridge of a crowning roof */
  if (o.finial){
    const hk = Math.max(.6, Math.min(2, rh / 6)), yt = roofTop + .2 + .3 * hk;
    mk(geoMerge([new THREE.CylinderGeometry(.55, .8, .6, 10).translate(0, yt + .3, 0), new THREE.SphereGeometry(.85, 14, 10).translate(0, yt + 1.4, 0), new THREE.ConeGeometry(.22, 1.1, 8).translate(0, yt + 2.6, 0)]), goldMat);
  }
  /* glazed barrel skylight along the ridge (B1's pool and sports hall) */
  if (o.skylight){
    const W2 = (w + .8) / 2 + over, D2 = (d + .8) / 2 + over, ridge = Math.abs(W2 - D2) * 2, alongX = W2 >= D2, L = ridge * .82;
    const sk = new THREE.CylinderGeometry(2.3, 2.3, L, 14, 1, false, 0, Math.PI); sk.rotateZ(Math.PI / 2); if (!alongX) sk.rotateY(Math.PI / 2);
    mk(sk.translate(0, roofTop - .25, 0), glassRoofMat);
    const ribs = []; for (let k = 0; k <= 8; k++){ const t = -L / 2 + L * k / 8; ribs.push(geoTint(new THREE.TorusGeometry(2.33, .07, 4, 10, Math.PI).rotateY(alongX ? Math.PI / 2 : 0).translate(alongX ? t : 0, roofTop - .25, alongX ? 0 : t), '#e8e6e0')); }
    mk(geoMerge(ribs), decoMat);
  }
  if (o.plaque){
    /* defaults: over the porch of the bay tower, or on the portico lintel */
    const pw = o.plaque.w || 5, py = o.plaque.y != null ? o.plaque.y : o.portico ? y0 + o.portico.h + .55 : y0 + 6.3;
    const pz = o.plaque.z != null ? o.plaque.z : o.portico ? d / 2 + 5.03 : o.bay && o.grand ? d / 2 + 5.04 : o.bay ? d / 2 + 3.53 : d / 2 + .05;
    const pq = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), plaqueMat(o.plaque.text));
    pq.position.set(0, py, pz); g.add(pq); parts.push(pq);
  }
  if (cols.length){
    const im = new THREE.InstancedMesh(colGeo, colMat, cols.length);
    cols.forEach(([cx2, cz2, h, r, yb], i) => { _cm.compose(_cp.set(cx2, yb != null ? yb : y0, cz2), _cq.identity(), _cs.set(r || 1, h, r || 1)); im.setMatrixAt(i, _cm); });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im); parts.push(im);
  }
  parts.forEach(m => { m.userData.info = info; pickables.push(m); });
  if (!info._reg){ info._reg = true; infos.push(info); }
  if (info.wx == null){ info.wx = x; info.wz = z; info.wd = d; info.wrot = rot; }
  if (!o.noCollide){ colBox(0, w / 2 + .7, d / 2 + .7); addFp({t:0, x, z, w, d, rot}); }
  const top = (o.y0 || 0) + y0 + H + .6 + rh;
  if (o.label !== false) addLabel(o.label || o.name, x, top + 5, z, o.minor);
  curStruct = prev;
  return top;
}
function crossB(o){
  const info = o.info || o, st = o.struct || newStruct(info);
  /* where the arms meet, the first arm's balconies run up to the second arm's wall and the second arm's stop just past them,
     so the two never overlap in the inner corner (they used to share an 0.8 m square there and flicker) */
  const balc = o.balc === false ? null : S(o.tp) / 2, balc2 = balc == null ? null : balc + 1.12;
  const t1 = building(Object.assign({balc, canopy:'end'}, o, {info, struct:st, wp:o.ap, dp:o.tp, label:o.crown ? false : o.label}));
  building(Object.assign({balc:balc2}, o, {info, struct:st, wp:o.tp, dp:o.bp, label:false}));
  if (!o.crown) return t1;
  /* a little pavilion where the arms cross: two more storeys under their own hipped roof */
  const cw = S(o.tp) + 3.2, cy0 = o.floors * 3.6 - 1.2;
  const a1 = S(o.ap) / 2 - 1, a2 = S(o.bp) / 2 - 1, ya = 1 + o.floors * 3.6 + .6 + Math.min(S(o.tp) * .3, 13) + .9;
  /* each blue light sits on a slim mast that rises out of the hipped end of its arm (it used to hang in the air over the roof), with a dark lamp housing */
  const masts = deco => { for (const [lx, lz] of [[a1, 0], [-a1, 0], [0, a2], [0, -a2]]){
    const yb = 1 + o.floors * 3.6 - cy0, yt = ya - cy0;
    deco.push(geoTint(new THREE.CylinderGeometry(.05, .08, yt - yb - .1, 5, 1, true).translate(lx, (yb + yt - .1) / 2, lz), '#3d4247'),
      geoTint(new THREE.CylinderGeometry(.16, .13, .22, 8).translate(lx, yt - .2, lz), '#2b2f33'), geoTint(new THREE.CylinderGeometry(.11, .16, .08, 8).translate(lx, yt + .04, lz), '#2b2f33'));
  } };
  const top = building({struct:st, info, px:o.px, py:o.py, rot:o.rot, w:cw, d:cw, floors:2.2, y0:cy0, variant:o.variant, roof:o.roof, roofH:5, over:2.3, noCollide:true, relief:false, label:o.label || o.name, minor:o.minor, finial:true, extra:masts});
  /* red beacon (slow flash) on the crown, steady blue lights at the four arm ends */
  { const c = o.xz || P(o.px, o.py), r = -(o.rot || 0) * D2R;
    const put = (lx, lz, y, red) => AVI_LIGHTS.push({st, x:c[0] + lx * Math.cos(r) + lz * Math.sin(r), y, z:c[1] - lx * Math.sin(r) + lz * Math.cos(r), red});
    put(0, 0, top + 3.6, true); put(a1, 0, ya, false); put(-a1, 0, ya, false); put(0, a2, ya, false); put(0, -a2, ya, false); }
  return top;
}
