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

/* ---------- facade textures: 0 teaching (rect), 1 teaching (arched), 2 dorm ---------- */
function facadePair(kind){
  const S2 = 256, cell = 64;
  const a = document.createElement('canvas'); a.width = a.height = S2; const g = a.getContext('2d');
  const b = document.createElement('canvas'); b.width = b.height = S2; const e = b.getContext('2d');
  g.fillStyle = kind === 2 ? '#f3eee4' : '#efe8da'; g.fillRect(0, 0, S2, S2);
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
        g.fillStyle = '#e8e1d3'; g.fillRect(x + ox + 10, y + 11, 2, 33);
        if (rnd() < .6){ e.fillStyle = rnd() < .75 ? '#ffd08a' : '#eaf4ff'; e.fillRect(x + ox, y + 11, 22, 33); }
      }
      g.fillStyle = '#d6ccbb'; g.fillRect(x + 2, y + 45, 60, 6);
      g.fillStyle = '#b9ae9b'; for (let k = 0; k < 8; k++) g.fillRect(x + 4 + k * 7.5, y + 45, 1.5, 6);
      if (rnd() < .45){ g.fillStyle = '#c8c8c4'; g.fillRect(x + 46, y + 47, 12, 7); g.fillStyle = '#9a9a96'; g.fillRect(x + 48, y + 49, 8, 1); }
    } else {
      const arch = kind === 1;
      g.fillStyle = '#e6ddcc'; g.fillRect(x, y, 4, cell - 7); g.fillRect(x + 60, y, 4, cell - 7);
      g.fillStyle = '#f8f3ea'; if (arch) archPath(g, x + 12, y + 7, 40, 47); else g.fillRect(x + 12, y + 8, 40, 46); g.fill && arch && g.fill();
      g.fillStyle = '#b5a88f'; if (arch){ archPath(g, x + 15, y + 10, 34, 42); g.fill(); } else g.fillRect(x + 15, y + 11, 34, 41);
      g.save(); if (arch){ archPath(g, x + 17, y + 12, 30, 39); g.clip(); } glass(g, x + 17, y + 12, 30, 39); g.restore();
      g.fillStyle = '#ece5d6'; g.fillRect(x + 31, y + 12, 2, 39); g.fillRect(x + 17, y + 31, 30, 2);
      g.fillStyle = '#d4c7af'; g.fillRect(x + 11, y + 53, 42, 3);
      if (arch){ g.fillStyle = '#d4c7af'; g.beginPath(); g.moveTo(x + 29, y + 7); g.lineTo(x + 35, y + 7); g.lineTo(x + 34, y + 13); g.lineTo(x + 30, y + 13); g.fill(); }
      if (rnd() < .64){
        e.fillStyle = rnd() < .78 ? '#ffcf86' : '#eaf4ff';
        if (arch){ archPath(e, x + 17, y + 12, 30, 39); e.fill(); } else e.fillRect(x + 17, y + 12, 30, 39);
        e.fillStyle = '#000'; e.fillRect(x + 31, y + 12, 2, 39); e.fillRect(x + 17, y + 31, 30, 2);
      }
    }
  }
  const mk = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; };
  return new THREE.MeshStandardMaterial({map:mk(a), emissiveMap:mk(b), emissive:0xffffff, emissiveIntensity:0, roughness:.85});
}
const wallMats = [facadePair(0), facadePair(1), facadePair(2)];
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}
const tipGeo = new THREE.ConeGeometry(0.32, 2, 5); tipGeo.translate(0, 1, 0);
const hornGeo = new THREE.ConeGeometry(0.22, 3, 5); hornGeo.translate(0, 1.5, 0);
function makeRoof(w, d, h, over, mat){
  const grp = new THREE.Group();
  const m = new THREE.Mesh(roofGeometry(w, d, h, over), mat); m.castShadow = m.receiveShadow = true; grp.add(m);
  const W = w / 2 + over, D = d / 2 + over, ridge = Math.abs(W - D) * 2 + 0.5, alongX = W >= D;
  const k = Math.max(0.6, Math.min(1.6, over / 1.8)), hk = Math.max(.6, Math.min(2, h / 6));
  if (ridge > 1.5){
    box(alongX ? ridge : 0.7, 0.6 * hk, alongX ? 0.7 : ridge, ridgeMat, 0, h + 0.2, 0, grp);
    for (const e of [-1, 1]) for (const side of [-1, 1]){
      const hm = new THREE.Mesh(hornGeo, ridgeMat); hm.scale.setScalar(hk);
      const dir = alongX ? new THREE.Vector3(e * .9, .75, side * .22) : new THREE.Vector3(side * .22, .75, e * .9);
      hm.position.set(alongX ? e * ridge / 2 : 0, h + .3, alongX ? 0 : e * ridge / 2);
      hm.quaternion.setFromUnitVectors(UP, dir.normalize()); grp.add(hm);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    const c = new THREE.Mesh(tipGeo, mat); c.scale.setScalar(k);
    c.position.set(sx * (W - 0.2), 0.1, sz * (D - 0.2));
    c.quaternion.setFromUnitVectors(UP, new THREE.Vector3(sx * .75, 1, sz * .75).normalize());
    c.castShadow = true; grp.add(c);
  }
  return grp;
}
const goldMat = M('#d6a63a', {metalness:.6, roughness:.35});

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
  const parts = [];
  if (!o.y0){ parts.push(box(w + 1.4, 1, d + 1.4, granite, 0, .5, 0, g)); parts.push(box(w + .3, 1.3, d + .3, granite, 0, 1.6, 0, g)); }
  const body = new THREE.Mesh(wallBox(w, H, d, o.floors), wallMats[o.variant || 0]);
  body.position.y = y0 + H / 2; body.castShadow = body.receiveShadow = true; g.add(body); parts.push(body);
  parts.push(box(w + .8, .6, d + .8, trim, 0, y0 + H + .3, 0, g));
  const rh = o.roofH != null ? o.roofH : Math.min(Math.min(w, d) * 0.3, 13);
  const roof = makeRoof(w + .8, d + .8, rh, o.over != null ? o.over : 2.4, rmat);
  roof.position.y = y0 + H + .6; g.add(roof); parts.push(...roof.children);
  const cols = [];
  const bw = Math.max(10, w * .26);
  if (o.bay){
    const bf = o.floors + 1.3, bH = bf * 3.6;
    const bay = new THREE.Mesh(wallBox(bw, bH, 5, bf), wallMats[o.variant || 0]); bay.position.set(0, y0 + bH / 2, d / 2 + 1);
    bay.castShadow = bay.receiveShadow = true; g.add(bay); parts.push(bay);
    parts.push(box(bw + .8, .6, 5.8, trim, 0, y0 + bH + .3, d / 2 + 1, g));
    const br = makeRoof(bw + .8, 9, Math.min(7, bw * .34), 2.2, rmat); br.position.set(0, y0 + bH + .6, d / 2 - 1); g.add(br); parts.push(...br.children);
    for (let k = 0; k < 3; k++) parts.push(box(bw + 6 - k * 1.6, .35 * (k + 1), 1.3, granite, 0, .175 * (k + 1), d / 2 + 3.6 + (2 - k) * 1.3, g));
    for (const sx of [-1, 1]) cols.push([sx * (bw / 2 - .7), d / 2 + 3.2, 4.6]);
    addBox(x + Math.sin(rot) * (d / 2 + 1), z + Math.cos(rot) * (d / 2 + 1), bw / 2 + .5, 3, rot);
  }
  if (o.arcade){
    const skip = o.bay ? bw / 2 + 1 : (o.portico ? o.portico.w / 2 + 1 : -1);
    for (let cx2 = -w / 2 + 1.6; cx2 <= w / 2 - 1.6 + .01; cx2 += 4.5){ if (Math.abs(cx2) < skip) continue; cols.push([cx2, d / 2 + 1.8, 4.6]); }
    parts.push(box(w + .6, .45, 2.8, trim, 0, y0 + 4.6 + .22, d / 2 + 1.2, g));
  }
  if (o.portico){
    const pw = o.portico.w, ph = o.portico.h, n = Math.max(4, Math.round(pw / 5));
    for (let k = 0; k < n; k++) cols.push([-pw / 2 + pw * k / (n - 1), d / 2 + 3.2, ph]);
    parts.push(box(pw + 3, 1.1, 5.2, trim, 0, y0 + ph + .55, d / 2 + 2.4, g));
    const prf = makeRoof(pw + 3, 5.2, 3.4, 1.8, rmat); prf.position.set(0, y0 + ph + 1.1, d / 2 + 2.4); g.add(prf); parts.push(...prf.children);
    for (let k = 0; k < 4; k++) parts.push(box(pw + 8 - k * 1.6, .32 * (k + 1), 1.3, granite, 0, .16 * (k + 1), d / 2 + 5.4 + (3 - k) * 1.3, g));
    addBox(x + Math.sin(rot) * (d / 2 + 2.6), z + Math.cos(rot) * (d / 2 + 2.6), pw / 2 + 1, 3.2, rot);
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
  const t1 = building(Object.assign({}, o, {info, struct:st, wp:o.ap, dp:o.tp}));
  building(Object.assign({}, o, {info, struct:st, wp:o.tp, dp:o.bp, label:false}));
  return t1;
}
