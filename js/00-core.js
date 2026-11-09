/* XMUM 校园漫游 · 渲染器、相机、材质、建筑生成器 */
'use strict';
const $ = s => document.querySelector(s);
const canvas = $('#c');
const TOUCH = matchMedia('(pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true}); }
catch(e){ $('#err').hidden = false; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
sun.castShadow = true; const SM = TOUCH ? 2048 : 4096; sun.shadow.mapSize.set(SM, SM);
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

/* ---------- materials ---------- */
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:0.9, metalness:0}, o || {}));
const granite = M('#b7b0a4'), white = M('#f3efe7'), trim = M('#e6dece'), ridgeMat = M('#7e3019', {roughness:.7});
const darkStone = M('#2f3337', {roughness:.5});
const roofCache = {};
const tileTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 4; i++){ const gr = g.createLinearGradient(i * 16, 0, i * 16 + 16, 0); gr.addColorStop(0, '#8d8d8d'); gr.addColorStop(.5, '#ffffff'); gr.addColorStop(1, '#9a9a9a'); g.fillStyle = gr; g.fillRect(i * 16, 0, 16, 64); }
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let j = 0; j < 4; j++) g.fillRect(0, j * 16 + 14, 64, 2);
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
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of gs){ pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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

/* ---------- facade textures: 0 teaching (rect), 1 teaching (arched), 2 dorm; tone 0-2 = slightly different plaster ---------- */
const WALL_TONES = [['#efe8da', '#f3eee4'], ['#f2e6cf', '#f5ecdb'], ['#ebe8e1', '#eeece7']];
function facadePair(kind, tone, R){
  R = R || rnd;
  const S2 = 256, cell = 64;
  const a = document.createElement('canvas'); a.width = a.height = S2; const g = a.getContext('2d');
  const b = document.createElement('canvas'); b.width = b.height = S2; const e = b.getContext('2d');
  g.fillStyle = WALL_TONES[tone || 0][kind === 2 ? 1 : 0]; g.fillRect(0, 0, S2, S2);
  e.fillStyle = '#000'; e.fillRect(0, 0, S2, S2);
  const glass = (ctx, x, y, w, h) => { const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#6f8c9b'); gr.addColorStop(1, '#2c4250'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); };
  const archPath = (ctx, x, y, w, h) => { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){
    const x = c * cell, y = r * cell;
    g.fillStyle = '#e1d6c2'; g.fillRect(x, y + cell - 7, cell, 7);
    g.fillStyle = '#c9bca5'; g.fillRect(x, y + cell - 7, cell, 1);
    if (kind === 2){
      for (const ox of [7, 35]){
        g.fillStyle = '#dcd2c1'; g.fillRect(x + ox - 2, y + 9, 26, 37);
        glass(g, x + ox, y + 11, 22, 33);
        g.fillStyle = 'rgba(48,38,28,.34)'; g.fillRect(x + ox, y + 11, 22, 4); g.fillRect(x + ox, y + 15, 3, 29);
        g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(x + ox + 13, y + 15); g.lineTo(x + ox + 20, y + 15); g.lineTo(x + ox + 8, y + 44); g.lineTo(x + ox + 3, y + 44); g.fill();
        g.fillStyle = '#e8e1d3'; g.fillRect(x + ox + 10, y + 11, 2, 33);
        if (R() < .6){ e.fillStyle = R() < .75 ? '#ffd08a' : '#eaf4ff'; e.fillRect(x + ox, y + 11, 22, 33); }
      }
      g.fillStyle = '#d6ccbb'; g.fillRect(x + 2, y + 45, 60, 6);
      g.fillStyle = '#b9ae9b'; for (let k = 0; k < 8; k++) g.fillRect(x + 4 + k * 7.5, y + 45, 1.5, 6);
      if (R() < .45){ g.fillStyle = '#c8c8c4'; g.fillRect(x + 46, y + 47, 12, 7); g.fillStyle = '#9a9a96'; g.fillRect(x + 48, y + 49, 8, 1); }
    } else {
      const arch = kind === 1;
      g.fillStyle = '#e6ddcc'; g.fillRect(x, y, 4, cell - 7); g.fillRect(x + 60, y, 4, cell - 7);
      g.fillStyle = '#f8f3ea'; if (arch) archPath(g, x + 12, y + 7, 40, 47); else g.fillRect(x + 12, y + 8, 40, 46); g.fill && arch && g.fill();
      g.fillStyle = '#b5a88f'; if (arch){ archPath(g, x + 15, y + 10, 34, 42); g.fill(); } else g.fillRect(x + 15, y + 11, 34, 41);
      g.save(); if (arch){ archPath(g, x + 17, y + 12, 30, 39); g.clip(); } glass(g, x + 17, y + 12, 30, 39);
      /* deep reveal: shadow along the top/left inside edge, faint reflection streak */
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(x + 36, y + 12); g.lineTo(x + 45, y + 12); g.lineTo(x + 27, y + 51); g.lineTo(x + 18, y + 51); g.fill();
      g.strokeStyle = 'rgba(48,38,28,.42)'; g.lineWidth = 6; if (arch){ archPath(g, x + 18.5, y + 13.5, 30, 39); g.stroke(); } else { g.fillStyle = 'rgba(48,38,28,.42)'; g.fillRect(x + 17, y + 12, 30, 4); g.fillRect(x + 17, y + 16, 3, 35); }
      g.restore();
      g.fillStyle = '#ece5d6'; g.fillRect(x + 31, y + 12, 2, 39); g.fillRect(x + 17, y + 31, 30, 2);
      g.fillStyle = '#d4c7af'; g.fillRect(x + 11, y + 53, 42, 3);
      if (arch){ g.fillStyle = '#d4c7af'; g.beginPath(); g.moveTo(x + 29, y + 7); g.lineTo(x + 35, y + 7); g.lineTo(x + 34, y + 13); g.lineTo(x + 30, y + 13); g.fill(); }
      if (R() < .64){
        e.fillStyle = R() < .78 ? '#ffcf86' : '#eaf4ff';
        if (arch){ archPath(e, x + 17, y + 12, 30, 39); e.fill(); } else e.fillRect(x + 17, y + 12, 30, 39);
        e.fillStyle = '#000'; e.fillRect(x + 31, y + 12, 2, 39); e.fillRect(x + 17, y + 31, 30, 2);
      }
    }
  }
  const mk = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; };
  return new THREE.MeshStandardMaterial({map:mk(a), emissiveMap:mk(b), emissive:0xffffff, emissiveIntensity:0, roughness:.85});
}
const wallMats = [facadePair(0), facadePair(1), facadePair(2)];
for (const t of [1, 2]) for (const k of [0, 1, 2]) wallMats.push(facadePair(k, t, mkRng(900 + t * 10 + k)));
const wallTone = (x, z) => ((Math.round(x) * 73856093 ^ Math.round(z) * 19349663) >>> 0) % 3;
function wallBox(w, h, d, floors){
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, spans = [d, d, 0, 0, w, w];
  for (let f = 0; f < 6; f++){
    const b = spans[f] ? Math.max(1, Math.round(spans[f] / 4.5)) : 0;
    for (let i = 0; i < 4; i++){ const j = f * 4 + i; if (!b) uv.setXY(j, .01, .01); else uv.setXY(j, uv.getX(j) * b / 4, uv.getY(j) * floors / 4); }
  }
  uv.needsUpdate = true; return g;
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
function blocked(x, z){
  if (hitsBuilding(x, z, .5)) return true;
  for (const L of lakes) if (inPoly(x, z, L)) return true;
  return x < -600 || x > 600 || z < -275 || z > 262;
}
function box(w, h, d, mat, x, y, z, parent){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (parent || scene).add(m); return m;
}

/* ---------- curved roof with Minnan swallowtail ridge ---------- */
function roofGeometry(w, d, h, over){
  const W = w / 2 + over, D = d / 2 + over, N = 10, rings = [];
  const fx = W >= D ? W - D + 0.25 : 0.25, fz = W >= D ? 0.25 : D - W + 0.25;
  const vz = [0], vx = [0];
  for (let i = 0; i <= N; i++){
    const s = i / N, hx = W + (fx - W) * s, hz = D + (fz - D) * s, y = h * Math.pow(s, 1.65);
    rings.push([[hx, y, hz], [-hx, y, hz], [-hx, y, -hz], [hx, y, -hz]]);
    if (i){ const p = rings[i - 1][0]; vz.push(vz[i - 1] + Math.hypot(p[2] - hz, p[1] - y)); vx.push(vx[i - 1] + Math.hypot(p[0] - hx, p[1] - y)); }
  }
  const pos = [], uv = [], TU = 1.1, TV = .5;
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
function roofParts(w, d, h, over, ox, oy, oz, out){
  out = out || {tile:[], ridge:[]};
  out.tile.push(roofGeometry(w, d, h, over).translate(ox, oy, oz));
  const W = w / 2 + over, D = d / 2 + over, ridge = Math.abs(W - D) * 2 + 0.5, alongX = W >= D;
  const k = Math.max(0.6, Math.min(1.6, over / 1.8)), hk = Math.max(.6, Math.min(2, h / 6));
  if (ridge > 1.5){
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
    const p0 = [x0, 0, z0], p1 = [x1, 0, z1], q0 = f(x0, z0), q1 = f(x1, z1), L = Math.hypot(x1 - x0, z1 - z0) / 1.1, Lo = L + 2 * ov / 1.1;
    pos.push(...q0, ...p1, ...q1, ...q0, ...p0, ...p1); uv.push(-ov / 1.1, 0, L, sl / .5, Lo - ov / 1.1, 0, -ov / 1.1, 0, 0, sl / .5, L, sl / .5);
    const ft = .28, q0b = [q0[0], q0[1] - ft, q0[2]], q1b = [q1[0], q1[1] - ft, q1[2]];
    pos.push(...q0, ...q1, ...q1b, ...q0, ...q1b, ...q0b); for (let k = 0; k < 6; k++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); return g;
}
const goldMat = M('#d6a63a', {metalness:.6, roughness:.35});
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

/* ---------- buildings ---------- */
const colGeo = new THREE.CylinderGeometry(.34, .4, 1, 12); colGeo.translate(0, .5, 0);
const colMat = M('#f5f0e6', {roughness:.7});
function building(o){
  const xz = o.xz || P(o.px, o.py), x = xz[0], z = xz[1];
  const w = o.w != null ? o.w : S(o.wp), d = o.d != null ? o.d : S(o.dp);
  const rot = -(o.rot || 0) * D2R;
  const info = o.info || o;
  const st = o.struct || newStruct(info), prev = curStruct; curStruct = st;
  st.roofColor = o.roof || '#c4502a';
  const g = new THREE.Group(); g.position.set(x, o.y0 || 0, z); g.rotation.y = rot; scene.add(g); regGroup(st, g);
  const H = o.floors * 3.6, y0 = 1, rmat = roofMat(o.roof || '#c4502a');
  const parts = [], gran = [], walls = [], deco = [], roofs = {tile:[], ridge:[]};
  if (!o.y0){ gran.push(new THREE.BoxGeometry(w + 1.4, 1, d + 1.4).translate(0, .5, 0), new THREE.BoxGeometry(w + .3, 1.3, d + .3).translate(0, 1.6, 0)); }
  const wmat = wallMats[(o.variant || 0) + 3 * wallTone(x, z)];
  walls.push(wallBox(w, H, d, o.floors).translate(0, y0 + H / 2, 0));
  /* cornice cap, a darker frieze under it, and slim corner pilasters */
  tbox(deco, w + .8, .6, d + .8, 0, y0 + H + .3, 0, TRIM);
  tbox(deco, w + .36, .55, d + .36, 0, y0 + H - .27, 0, TRIM2);
  if (H > 5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) tbox(deco, 1, H - .55, 1, sx * (w / 2 - .3), y0 + (H - .55) / 2, sz * (d / 2 - .3), PIL);
  const rh = o.roofH != null ? o.roofH : Math.min(Math.min(w, d) * 0.3, 13), over = o.over != null ? o.over : 2.4;
  roofParts(w + .8, d + .8, rh, over, 0, y0 + H + .6, 0, roofs);
  /* 腰檐: tiled skirt roofs at given floor lines, with a trim band above */
  if (o.waist) for (const f of o.waist){ const yw = y0 + f * 3.6; roofs.tile.push(eaveRing(w + .2, d + .2, 1.7, .95).translate(0, yw, 0)); tbox(deco, w + .5, .4, d + .5, 0, yw + .2, 0, TRIM); }
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
  if (o.bay){
    const bf = o.floors + 1.3, bH = bf * 3.6;
    walls.push(wallBox(bw, bH, 5, bf).translate(0, y0 + bH / 2, d / 2 + 1));
    tbox(deco, bw + .8, .6, 5.8, 0, y0 + bH + .3, d / 2 + 1, TRIM);
    tbox(deco, bw + .36, .55, 5.36, 0, y0 + bH - .27, d / 2 + 1, TRIM2);
    for (const sx of [-1, 1]) tbox(deco, .9, bH - .55, .9, sx * (bw / 2 - .25), y0 + (bH - .55) / 2, d / 2 + 3.25, PIL);
    roofParts(bw + .8, 9, Math.min(7, bw * .34), 2.2, 0, y0 + bH + .6, d / 2 - 1, roofs);
    for (let k = 0; k < 3; k++) gran.push(new THREE.BoxGeometry(bw + 6 - k * 1.6, .35 * (k + 1), 1.3).translate(0, .175 * (k + 1), d / 2 + 3.6 + (2 - k) * 1.3));
    for (const sx of [-1, 1]) cols.push([sx * (bw / 2 - .7), d / 2 + 3.2, 4.6]);
    addBox(x + Math.sin(rot) * (d / 2 + 1), z + Math.cos(rot) * (d / 2 + 1), bw / 2 + .5, 3, rot);
  }
  if (o.arcade){
    const skip = o.bay ? bw / 2 + 1 : (o.portico ? o.portico.w / 2 + 1 : -1);
    for (let cx2 = -w / 2 + 1.6; cx2 <= w / 2 - 1.6 + .01; cx2 += 4.5){ if (Math.abs(cx2) < skip) continue; cols.push([cx2, d / 2 + 1.8, 4.6]); }
    tbox(deco, w + .6, .45, 2.8, 0, y0 + 4.6 + .22, d / 2 + 1.2, TRIM);
    tbox(deco, w + .3, .18, 2.4, 0, y0 + 4.6 + .54, d / 2 + 1.2, TRIM2);
  }
  if (o.portico){
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
  const mk = (geo, mat, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow !== false; m.receiveShadow = true; g.add(m); parts.push(m); return m; };
  if (gran.length) mk(geoMerge(gran), granite);
  mk(geoMergeUV(walls), wmat); mk(geoMerge(deco), decoMat);
  parts.push(...roofMeshes(roofs, rmat, g));
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
    const pz = o.plaque.z != null ? o.plaque.z : o.portico ? d / 2 + 5.03 : o.bay ? d / 2 + 3.53 : d / 2 + .05;
    const pq = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), plaqueMat(o.plaque.text));
    pq.position.set(0, py, pz); g.add(pq); parts.push(pq);
  }
  if (cols.length){
    const im = new THREE.InstancedMesh(colGeo, colMat, cols.length);
    cols.forEach(([cx2, cz2, h], i) => { _cm.compose(_cp.set(cx2, y0, cz2), _cq.identity(), _cs.set(1, h, 1)); im.setMatrixAt(i, _cm); });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im); parts.push(im);
  }
  parts.forEach(m => { m.userData.info = info; pickables.push(m); });
  if (!info._reg){ info._reg = true; infos.push(info); }
  if (info.wx == null){ info.wx = x; info.wz = z; info.wd = d; info.wrot = rot; }
  if (!o.noCollide){ addBox(x, z, w / 2 + .7, d / 2 + .7, rot); addFp({t:0, x, z, w, d, rot}); }
  const top = (o.y0 || 0) + y0 + H + .6 + rh;
  if (o.label !== false) addLabel(o.label || o.name, x, top + 5, z, o.minor);
  curStruct = prev;
  return top;
}
function crossB(o){
  const info = o.info || o, st = o.struct || newStruct(info);
  const balc = o.balc === false ? null : S(o.tp) / 2 + .2;
  const t1 = building(Object.assign({balc, canopy:'end'}, o, {info, struct:st, wp:o.ap, dp:o.tp}));
  building(Object.assign({balc}, o, {info, struct:st, wp:o.tp, dp:o.bp, label:false}));
  return t1;
}
