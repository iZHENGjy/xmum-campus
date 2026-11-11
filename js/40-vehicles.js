/* XMUM 校园漫游 · 跳台、车辆模型与物理、上下车、步行 */
'use strict';
/* ---------- ramps ---------- */
const rampMat = M('#e1b12c', {roughness:.6});
const RAMPS = [[350, -5, -Math.PI / 2, 11, 6, 3.2],   /* the lake ramp: on the east shore, off the east road (the lake ring road now runs where it used to be) */
  [360, 150, Math.PI, 11, 6, 3.2], [192, 190, Math.PI / 2, 12, 7, 3], [-564, 30, Math.PI, 11, 7, 3.2]].map(([x, z, h, L, W, H]) => {
  const r = {x, z, fx:Math.sin(h), fz:Math.cos(h), L, W, H};
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.lineTo(L / 2, H); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth:W, bevelEnabled:false}); g.translate(0, 0, -W / 2);
  const m = new THREE.Mesh(g, rampMat); m.position.set(x, 0, z); m.rotation.y = Math.atan2(-r.fz, r.fx); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (const sx of [-1, 1]){ const st = box(L * .98, .08, .5, M('#222222'), 0, 0, 0); st.position.set(0, 0, 0); m.add(st); st.position.set(0, H / 2 + .05, sx * (W / 2 - .25)); st.rotation.z = Math.atan2(H, L); }
  return r;
});
/* clear trees and lamps that grew on a ramp */
for (const set of knockSets) set.spots.forEach((o, i) => {
  if (RAMPS.some(r => { const dx = o.x - r.x, dz = o.z - r.z; return Math.abs(dx * r.fx + dz * r.fz) < r.L / 2 + 3 && Math.abs(dx * r.fz - dz * r.fx) < r.W / 2 + 3; })){
    o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0);
  }
});
/* clear the palms, lamps and benches that stood on the strip of land the lake bridge replaced (now water) */
for (const set of knockSets) set.spots.forEach((o, i) => {
  if (!o.hidden && (bridgeY(o.x, o.z) || lakes.some(L => inPoly(o.x, o.z, L)))){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
});
function groundAt(x, z){
  const by = bridgeY(x, z); if (by) return by;   /* on the lake bridge (js/10-world.js) */
  for (const r of RAMPS){
    const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, v = dx * r.fz - dz * r.fx;
    if (Math.abs(v) < r.W / 2 && u > -r.L / 2 && u < r.L / 2) return r.H * (u + r.L / 2) / r.L;
  }
  for (const L of lakes) if (inPoly(x, z, L)) return -.9;
  return typeof terrainY === 'function' ? terrainY(x, z) : 0;   /* hills: js/12-terrain.js */
}

/* ---------- vehicles ---------- */
const CAR_T = {
  bus:   {L:11, W:2.7, H:3.2, wb:6.4, r:.55, maxV:24, acc:8,  grip:4.5, steer:.5,  mass:8,   seat:[.7, .95, 3.6], name:'校巴'},
  sedan: {L:4.4, W:1.85, H:1.45, wb:2.7, r:.36, maxV:44, acc:15, grip:6.5, steer:.55, mass:1.5, seat:[0, .4, -.2], name:'小车'},
  cart:  {L:2.8, W:1.45, H:1.95, wb:1.9, r:.26, maxV:17, acc:10, grip:8,  steer:.6,  mass:.8,  seat:[.22, .8, -.3], name:'高尔夫球车'},
  myvi:  {L:3.7, W:1.7, H:1.55, wb:2.4, r:.32, maxV:38, acc:13, grip:7,  steer:.58, mass:1.1, seat:[0, .4, -.25], name:'Perodua Myvi'},
  p911:  {L:4.5, W:1.85, H:1.25, wb:2.45, r:.35, maxV:62, acc:24, grip:8.2, steer:.56, mass:1.4, seat:[0, .25, -.45], name:'保时洁 911'},
  mase:  {L:5.0, W:1.95, H:1.4, wb:3.0, r:.37, maxV:66, acc:22, grip:7.6, steer:.5,  mass:1.8, seat:[0, .3, -.35], name:'玛莎拉弟 GT'},
  lambo: {L:4.6, W:2.05, H:1.1, wb:2.7, r:.36, maxV:80, acc:30, grip:8.6, steer:.52, mass:1.5, seat:[0, .18, -.25], name:'兰博鸡尼'},
  rr:    {L:5.6, W:2.05, H:1.75, wb:3.4, r:.42, maxV:60, acc:17, grip:6.6, steer:.46, mass:2.6, seat:[0, .45, -.45], name:'劳斯来斯', armor:.6},
  patrol:{L:3.2, W:1.6, H:1.95, wb:2.1, r:.3, maxV:31, acc:15, grip:7.5, steer:.62, mass:1.2, seat:[.24, .8, -.3], name:'保安巡逻车'},
  /* 方盒子豪华越野（只借造型风格）：又高又重又抗撞，极速一般 */
  gwag:  {L:4.7, W:1.98, H:1.98, wb:2.85, r:.42, maxV:54, acc:18, grip:6.6, steer:.5, mass:2.5, seat:[0, .55, -.35], name:'铁方越野', armor:.7},
  /* 运动摩托：两个轮子，过弯会压车（lean = 最大倾角，弧度），轻、快、不抗撞 */
  moto:  {L:2.73, W:1.0, H:1.56, wb:1.85, r:.4, maxV:70, acc:30, grip:7.4, steer:.78, mass:.6, seat:[0, 1.24, -.36], name:'疾风 R 运动摩托', armor:1.45, lean:.62, bike:true}
};
const MOTO_S = 1.3;   /* the motorbike's model and its tuning parts (js/42-tuning.js) are drawn small and scaled by this */
const glassMat = new THREE.MeshStandardMaterial({color:'#1a242b', roughness:.05, metalness:.6, transparent:true, opacity:.84});
const tyreMat = M('#1c1c1e', {roughness:.7}), headMat = new THREE.MeshStandardMaterial({color:'#fff6d8', emissive:'#fff1c0', emissiveIntensity:.1});
const tailMat = new THREE.MeshStandardMaterial({color:'#b3261e', emissive:'#ff3b2f', emissiveIntensity:.1});
const wheelMat = M('#ffffff', {vertexColors:true, roughness:.55, metalness:.25});
const CAR_MAT = {glass:glassMat, head:headMat, tail:tailMat, trim:M('#1b1c1f', {roughness:.55}), chrome:M('#e6e9ec', {metalness:.35, roughness:.22}),
  grey:M('#c3c6c8', {roughness:.5, metalness:.2}), seat:M('#3b342e', {roughness:.85}), white:M('#f3f1ec', {roughness:.45})};
const CAR_ACCENT = {bus:'#c4502a', rr:'#c9c6bd', patrol:'#1f3a6b'};
const carGeoCache = {}, wheelGeoCache = {}, carTexCache = {};
/* tyre + dished rim + five spokes, one vertex-coloured geometry (axle along x, rim face on +x) */
function carWheelGeo(r){
  if (wheelGeoCache[r]) return wheelGeoCache[r];
  const h = Math.max(.12, Math.min(.17, r * .4));
  const pr = [[0, -h], [.66 * r, -h], [.9 * r, -h], [r, -h + .045], [r, h - .045], [.9 * r, h], [.72 * r, h], [.68 * r, h - .025], [.6 * r, h - .045], [.24 * r, h - .06], [.13 * r, h - .03], [0, h - .03]];
  const lg = new THREE.LatheGeometry(pr.map(([a, b]) => new THREE.Vector2(a, b)), 16), n = lg.attributes.position.count, cl = new Float32Array(n * 3);
  const cs = [new THREE.Color('#1d1d1f'), new THREE.Color('#c4c8cc'), new THREE.Color('#8f9499')];
  for (let i = 0; i < n; i++){ const j = i % pr.length, c = cs[j < 7 ? 0 : j < 10 ? 1 : 2]; cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; }
  lg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  const parts = [lg];
  for (let k = 0; k < 5; k++) parts.push(geoTint(geoAt(new THREE.BoxGeometry(.06, .03, .5 * r), 0, h - .05, .36 * r).rotateY(k * Math.PI * 2 / 5), '#b9bdc2'));
  const g = geoMerge(parts); g.rotateZ(-Math.PI / 2);
  return wheelGeoCache[r] = g;
}
/* body panel: a side profile (z forward, y up) extruded across the car with rounded edges and wheel-arch cut-outs,
   then pinched in plan (ends), tapered toward the roof (tumblehome) and tucked under at the sills */
function carShell(T, yb, top, width, o){
  o = o || {};
  let s = new THREE.Shape(); const ra = T.r + (o.ra || .07), yc = T.r, zr = top[top.length - 1][0];
  s.moveTo(zr, yb);
  if (o.arches !== false) for (const zc of [-T.wb / 2, T.wb / 2]){
    const sa = Math.asin(Math.max(-1, Math.min(1, (yb - yc) / ra)));
    for (let i = 0; i <= 12; i++){ const t = Math.PI - sa + (2 * sa - Math.PI) * i / 12; s.lineTo(zc + ra * Math.cos(t), yc + ra * Math.sin(t)); }
  }
  for (const p of top) p.length > 2 ? s.quadraticCurveTo(p[2], p[3], p[0], p[1]) : s.lineTo(p[0], p[1]);
  if (o.clip != null){
    /* keep only the part of the outline above y = clip (used for the painted roof skin over the glasshouse) */
    const src = s.getPoints(8), out = [], c = o.clip;
    for (let i = 0; i < src.length; i++){
      const A = src[i], B = src[(i + 1) % src.length], ia = A.y >= c, ib = B.y >= c;
      if (ia) out.push(A);
      if (ia !== ib){ const t = (c - A.y) / (B.y - A.y); out.push(new THREE.Vector2(A.x + (B.x - A.x) * t, c)); }
    }
    s = new THREE.Shape(out);
  }
  const bev = o.bev != null ? o.bev : .06, d = Math.max(.01, width - 2 * bev), hw = d / 2 + bev;
  const g = new THREE.ExtrudeGeometry(s, {depth:d, bevelEnabled:true, bevelThickness:bev, bevelSize:bev, bevelOffset:-bev, bevelSegments:2, curveSegments:6, steps:1});
  g.deleteAttribute('uv'); g.rotateY(-Math.PI / 2); g.translate(d / 2, 0, 0);
  const p = g.attributes.position; let z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < p.count; i++){ z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); }
  /* plan-view pinch at the ends, tumblehome toward the roof, tuck-under at the sills */
  const f = (y, z) => {
    let k = o.grow || 1;
    if (o.taper){ const [ya, yb2, kk] = o.taper; k *= 1 - kk * Math.min(1, Math.max(0, (y - ya) / (yb2 - ya))); }
    if (o.ends){ const [e, kk] = o.ends, u = Math.max(0, (z - (z1 - e)) / e, (z0 + e - z) / e); k *= 1 - kk * u * u; }
    if (o.tuck){ const [ya, kk] = o.tuck; k *= 1 - kk * Math.max(0, (ya - y) / ya); }
    return k;
  };
  const caps = [], lift = o.clip != null ? .014 : 0;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(Math.abs(x) - hw) < 1e-4) caps.push(i);
    p.setXYZ(i, x * f(y, z) + (o.x || 0), y + lift, z);
  }
  smoothNormals(g, o.smooth || 38);
  /* the big flat side faces get analytic normals so the deformation never shows up as creases */
  const nm = g.attributes.normal, e = .01;
  for (const i of caps){
    const y = p.getY(i) - lift, z = p.getZ(i), sx = Math.sign(nm.getX(i)) || 1;
    const fy = (f(y + e, z) - f(y - e, z)) / (2 * e), fz = (f(y, z + e) - f(y, z - e)) / (2 * e), nx = sx, ny = -hw * fy, nz = -hw * fz, l = Math.hypot(nx, ny, nz);
    nm.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}
function carTaper(g, tp){ const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - tp[2] * Math.min(1, Math.max(0, (p.getY(i) - tp[0]) / (tp[1] - tp[0]))))); return g; }
function carTextTex(key, w, h, draw){
  if (carTexCache[key]) return carTexCache[key];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO; return carTexCache[key] = t;
}
/* every visual part of one car kind, grouped by material key and merged (cached per kind) */
function carParts(kind, T){
  if (carGeoCache[kind]) return carGeoCache[kind];
  const P = {}, put = (k, g) => { (P[k] || (P[k] = [])).push(g); return g; };
  const L2 = T.L / 2, W = T.W, W2 = W / 2;
  const bx = (k, w, h, d, x, y, z, rx, ry, rz) => put(k, geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz));
  const rb = (k, w, h, d, r, x, y, z, rx, ry, rz) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx, ry, rz));
  const el = (k, sx, sy, sz, x, y, z, rx, ry, rz) => put(k, geoAt(new THREE.SphereGeometry(1, 12, 8), x, y, z, rx, ry, rz, sx, sy, sz));
  const cyl = (k, r, h, x, y, z, rx, ry, rz, seg) => put(k, geoAt(new THREE.CylinderGeometry(r, r, h, seg || 14), x, y, z, rx, ry, rz));
  const rod = (k, r, a, b) => put(k, rodGeo(r, r, a, b));
  const shell = (k, yb, top, w, o) => put(k, carShell(T, yb, top, w, o));
  const sym = f => { f(-1); f(1); };
  /* glasshouse + a painted roof skin clamped from the same profile */
  const cabin = (yb, top, w, tp, roofY, roofKey) => {
    shell('glass', yb, top, w, {arches:false, bev:.04, taper:tp, ends:[.3, .1]});
    if (roofY != null) shell(roofKey || 'paint', yb, top, w, {arches:false, bev:.04, taper:tp, ends:[.3, .1], clip:roofY, grow:1.012});
  };
  const pillar = (z, y0, y1, w, tp, rx) => put('paint', carTaper(geoAt(new THREE.BoxGeometry(w, y1 - y0, .09), 0, (y0 + y1) / 2, z, rx || 0), tp));
  const mirrors = (y, z) => sym(s => { rb('paint', .2, .12, .1, .04, s * (W2 + .06), y, z, 0, s * .25, 0); bx('trim', .1, .03, .05, s * (W2 - .02), y - .03, z + .02); });
  const plates = (yf, yr, zf, zr) => { rb('trim', .52, .13, .03, .012, 0, yf, zf); rb('trim', .52, .13, .03, .012, 0, yr, zr); };
  const handles = (zs, y) => sym(s => zs.forEach(z => bx('chrome', .03, .03, .14, s * (W2 + .005), y, z)));
  if (kind === 'sedan'){
    shell('paint', .26, [[2.1, .26], [2.2, .46, 2.2, .28], [2.17, .7], [1.9, .86, 2.15, .84], [.85, .97], [-1.05, .99], [-1.6, 1.0], [-2.1, .94, -2.0, 1.0],
      [-2.2, .66, -2.2, .88], [-2.17, .32], [-2.05, .26, -2.18, .26]], W, {ends:[.65, .14], tuck:[.42, .06], taper:[.8, 1.0, .03]});
    const tp = [.92, 1.45, .2];
    cabin(.9, [[.98, .9], [.12, 1.39], [-.82, 1.42, -.32, 1.47], [-1.62, .93, -1.32, 1.3], [-1.62, .9]], W * .86, tp, 1.34);
    pillar(-.33, .95, 1.38, W * .86 + .02, tp);
    rb('trim', W * .52, .17, .08, .04, 0, .5, 2.17); bx('chrome', W * .5, .02, .02, 0, .56, 2.21);
    sym(s => { rb('head', .44, .13, .12, .05, s * .58, .7, 2.13, -.2, s * .2, 0); rb('tail', .46, .14, .1, .05, s * .6, .82, -2.17, 0, -s * .12, 0); });
    rb('trim', W * .8, .14, .14, .05, 0, .3, 2.15); rb('trim', W * .8, .14, .14, .05, 0, .32, -2.14);
    plates(.3, .33, 2.23, -2.22); mirrors(1.0, .78); handles([.25, -.85], .86);
    sym(s => bx('trim', .012, .5, .012, s * (W2 + .002), .64, -.33));
  } else if (kind === 'myvi'){
    shell('paint', .25, [[1.76, .25], [1.85, .44, 1.86, .27], [1.83, .64], [1.55, .82, 1.82, .8], [.9, .93], [-1.55, 1.0], [-1.82, .92, -1.8, 1.0],
      [-1.85, .4], [-1.74, .25, -1.85, .26]], W, {ends:[.55, .12], tuck:[.42, .06]});
    const tp = [.92, 1.55, .17];
    cabin(.9, [[.98, .9], [.22, 1.44], [-1.42, 1.52, -.6, 1.57], [-1.76, .95, -1.72, 1.32], [-1.76, .9]], W * .88, tp, 1.45);
    pillar(-.42, .95, 1.47, W * .88 + .02, tp);
    rb('paint', W * .74, .05, .26, .02, 0, 1.53, -1.58, .18);
    rb('trim', W * .5, .16, .08, .04, 0, .52, 1.82);
    sym(s => { rb('head', .4, .13, .16, .05, s * .55, .73, 1.76, -.2, s * .4, 0); rb('tail', .13, .34, .08, .04, s * .66, .82, -1.85); });
    rb('trim', W * .82, .14, .14, .05, 0, .3, 1.81); rb('trim', W * .82, .16, .14, .05, 0, .32, -1.81);
    plates(.3, .33, 1.89, -1.89); mirrors(1.02, .82); handles([.3, -.7], .9);
  } else if (kind === 'p911'){
    /* low centre tub with a scooped bonnet, separate fenders that rise over the wheels, round 'frog-eye' lamps, fastback roof, round tail */
    shell('paint', .24, [[2.14, .24], [2.25, .4, 2.26, .26], [2.2, .55], [1.9, .66, 2.15, .66], [.75, .8], [-.85, .84], [-2.1, .62, -1.75, .84],
      [-2.24, .42, -2.26, .56], [-2.14, .24, -2.25, .25]], W - .7, {arches:false, ends:[.5, .1]});
    sym(s => shell('paint', .24, [[2.1, .24], [2.22, .42, 2.24, .25], [2.15, .62], [1.65, .84, 2.05, .84], [1.0, .82, 1.25, .86], [.5, .76], [-.55, .78],
      [-1.0, .88, -.8, .8], [-1.5, .89], [-2.15, .64, -2.0, .88], [-2.25, .42, -2.26, .56], [-2.13, .24, -2.25, .25]], .48, {x:s * (W2 - .24), ends:[.45, .2], tuck:[.4, .05]}));
    const tp = [.78, 1.25, .26];
    cabin(.76, [[.86, .76], [.04, 1.2], [-.6, 1.24, -.28, 1.27], [-1.45, .84, -1.15, 1.17], [-1.45, .76]], W * .8, tp, 1.19);
    sym(s => { el('head', .12, .12, .07, s * .64, .75, 2.02, -.45); el('chrome', .145, .145, .06, s * .64, .745, 1.995, -.45); el('head', .07, .04, .03, s * .55, .5, 2.2); });
    rb('tail', W * .86, .07, .05, .025, 0, .66, -2.16, .25); rb('trim', W * .5, .06, .04, .02, 0, .72, -2.12, .25);
    rb('paint', W * .62, .04, .3, .02, 0, .8, -1.98, .22);
    rb('trim', W * .6, .1, .06, .03, 0, .36, 2.22); sym(s => rb('trim', .3, .1, .06, .03, s * .62, .38, 2.16, 0, s * .3, 0));
    sym(s => cyl('chrome', .045, .1, s * .3, .3, -2.22, Math.PI / 2));
    plates(.48, .48, 2.24, -2.2); mirrors(.92, .72); handles([-.15], .76);
  } else if (kind === 'mase'){
    shell('paint', .25, [[2.4, .25], [2.5, .45, 2.5, .28], [2.46, .62], [2.1, .84, 2.42, .82], [.55, .98], [-1.3, .99], [-2.35, .86, -2.1, .99],
      [-2.5, .52, -2.5, .8], [-2.4, .25, -2.5, .27]], W, {ends:[.75, .16], tuck:[.42, .06], taper:[.8, .99, .03]});
    const tp = [.9, 1.4, .24];
    cabin(.9, [[.66, .9], [-.22, 1.35], [-1.0, 1.38, -.6, 1.42], [-2.0, .95, -1.62, 1.26], [-2.0, .9]], W * .84, tp, 1.31);
    pillar(-.62, .95, 1.33, W * .84 + .02, tp, .25);
    rb('chrome', .98, .44, .06, .18, 0, .55, 2.45); rb('trim', .86, .34, .07, .14, 0, .55, 2.46); bx('chrome', .03, .2, .03, 0, .56, 2.5);
    sym(s => { rb('head', .46, .11, .22, .05, s * .66, .74, 2.28, 0, s * .45, 0); rb('tail', .52, .1, .1, .04, s * .6, .8, -2.42, 0, -s * .35, 0);
      for (let k = 0; k < 3; k++) bx('chrome', .03, .07, .3, s * (W2 + .005), .72, 1.06 - k * .13); cyl('chrome', .05, .12, s * .45, .3, -2.48, Math.PI / 2); cyl('chrome', .05, .12, s * .6, .3, -2.48, Math.PI / 2); });
    rb('trim', W * .9, .12, .12, .05, 0, .3, -2.42);
    plates(.36, .5, 2.5, -2.5); mirrors(1.0, .5); handles([-.35], .88);
  } else if (kind === 'lambo'){
    /* flat wedge: knife-edge nose, cab-forward canopy, fenders above the wheels, side scoops, rear wing */
    shell('paint', .22, [[2.2, .22], [2.3, .34, 2.31, .24], [2.27, .44], [.7, .76], [-.9, .92], [-2.2, .86], [-2.3, .7], [-2.3, .36], [-2.2, .22, -2.3, .23]],
      W - .62, {arches:false, ends:[.5, .12], bev:.05, smooth:30});
    sym(s => shell('paint', .22, [[2.18, .22], [2.3, .36, 2.31, .24], [2.24, .48], [1.3, .82, 1.75, .8], [.75, .74], [-.35, .74], [-.95, .9, -.7, .76],
      [-1.95, .94], [-2.3, .82, -2.25, .94], [-2.3, .36], [-2.18, .22, -2.3, .23]], .5, {x:s * (W2 - .25), ends:[.4, .2], bev:.05, smooth:30}));
    const tp = [.72, 1.1, .3];
    cabin(.72, [[.78, .72], [-.3, 1.1], [-.8, 1.1], [-1.4, .94, -1.15, 1.05], [-1.4, .72]], W * .78, tp, 1.05);
    sym(s => { rb('trim', .1, .3, .7, .04, s * (W2 - .02), .6, -.62, 0, 0, s * .12); rb('head', .5, .05, .14, .02, s * .62, .5, 2.08, 0, s * .32, -s * .12);
      rb('trim', .46, .12, .05, .03, s * .55, .3, 2.27, 0, s * .2, 0); rb('tail', .6, .05, .06, .02, s * .55, .74, -2.3, 0, 0, s * .1); bx('wing0', .05, .3, .05, s * W * .3, .95, -T.L / 2 + .25); });
    rb('wing0', W * .9, .07, .44, .03, 0, 1.12, -T.L / 2 + .25);   /* the stock wing: its own mesh, hidden when a tuned wing goes on (js/42-tuning.js) */ rb('trim', W * .86, .3, .05, .04, 0, .48, -2.29);
    for (let k = 0; k < 4; k++) bx('trim', W * .5, .02, .06, 0, .945 - k * .012, -1.6 - k * .17, .1);
    cyl('chrome', .07, .1, 0, .38, -2.31, Math.PI / 2, 0, 0, 6);
    rb('trim', W * .3, .12, .05, .03, 0, .3, 2.29); plates(.3, .26, 2.3, -2.32); mirrors(.86, .5);
  } else if (kind === 'rr'){
    /* tall slab sides, long flat bonnet, upright chrome temple grille, two-tone roof, small mascot */
    shell('paint', .3, [[2.7, .3], [2.8, .5, 2.8, .33], [2.8, 1.0], [2.6, 1.12, 2.8, 1.12], [.75, 1.14], [-1.7, 1.15], [-2.6, 1.1, -2.42, 1.16],
      [-2.8, .9, -2.8, 1.08], [-2.8, .5], [-2.7, .3, -2.8, .32]], W, {ends:[.5, .07], tuck:[.5, .05], ra:.08});
    const tp = [1.1, 1.75, .14];
    cabin(1.1, [[.88, 1.1], [.22, 1.68], [-1.68, 1.72, -.7, 1.74], [-2.18, 1.14, -2.08, 1.58], [-2.18, 1.1]], W * .9, tp, 1.63, 'accent');
    pillar(-.72, 1.15, 1.66, W * .9 + .02, tp);
    rb('chrome', .8, .6, .1, .04, 0, .8, 2.79); bx('trim', .68, .48, .02, 0, .8, 2.85); for (let k = 0; k < 9; k++) bx('chrome', .018, .48, .03, -.3 + k * .075, .8, 2.855);
    bx('chrome', .03, .1, .05, 0, 1.2, 2.66, -.4); bx('chrome', .14, .02, .05, 0, 1.22, 2.65, -.6);
    sym(s => { rb('head', .36, .11, .08, .03, s * .7, .96, 2.78); rb('tail', .16, .3, .06, .03, s * .82, .88, -2.79); });
    sym(s => bx('chrome', .015, .03, T.L * .82, s * (W2 + .004), 1.0, 0));
    rb('trim', W * .9, .16, .14, .05, 0, .38, 2.78); rb('trim', W * .94, .16, .14, .05, 0, .38, -2.78);
    plates(.6, .62, 2.82, -2.82); mirrors(1.24, .7); handles([.15, -1.2], 1.05);
  } else if (kind === 'bus'){
    /* campus bus: rounded box, full-length window band, orange livery stripe, roof AC pod */
    shell('paint', .4, [[5.4, .4], [5.5, .6, 5.5, .42], [5.48, 2.9], [5.15, 3.2, 5.47, 3.2], [-5.2, 3.2], [-5.5, 2.9, -5.5, 3.2], [-5.5, .6],
      [-5.4, .4, -5.5, .42]], W, {ends:[.45, .04], bev:.1, ra:.08});
    bx('glass', W + .03, 1.0, 9.6, 0, 2.38, -.4); bx('glass', W * .94, 1.7, .05, 0, 2.08, 5.49); bx('glass', W * .8, .85, .05, 0, 2.45, -5.5);
    bx('glass', .04, 2.0, 1.0, W2 + .01, 1.65, 4.35);
    for (let k = 0; k < 8; k++) bx('paint', W + .05, 1.0, .14, 0, 2.38, -5.0 + k * 1.2);
    bx('accent', W + .05, .26, T.L - .5, 0, 1.08, 0); bx('accent', W + .05, .06, T.L - .5, 0, 1.78, -.4);
    rb('grey', 1.5, .3, 2.6, .1, 0, 3.32, -1.2); rb('trim', W * .72, .3, .04, .02, 0, 3.0, 5.5);
    rb('trim', W + .06, .32, .26, .08, 0, .56, 5.45); rb('trim', W + .06, .32, .26, .08, 0, .56, -5.45);
    sym(s => { rb('head', .42, .2, .06, .04, s * .95, .92, 5.5); rb('tail', .22, .45, .06, .04, s * 1.15, 1.0, -5.5);
      rod('trim', .025, [s * W2, 2.7, 5.2], [s * (W2 + .35), 2.75, 5.65]); rb('trim', .08, .38, .16, .03, s * (W2 + .35), 2.5, 5.68); });
    plates(.82, .82, 5.53, -5.53);
  } else if (kind === 'gwag'){
    /* square-box luxury off-roader: upright slab sides, flat bonnet with lamp pods on the wings, round headlamps,
       exposed door hinges, spare wheel on the tailgate. Style only, no maker's name or badge */
    shell('paint', .36, [[2.25, .36], [2.36, .52, 2.36, .37], [2.36, 1.1], [2.3, 1.17, 2.36, 1.17], [1.0, 1.2], [-2.22, 1.22], [-2.34, 1.14, -2.34, 1.22],
      [-2.35, .52], [-2.25, .36, -2.35, .37]], W, {ends:[.2, .03], tuck:[.5, .03], ra:.11, bev:.05});
    const tp = [1.2, 1.98, .05];
    cabin(1.18, [[1.02, 1.18], [.84, 1.9], [-2.16, 1.93], [-2.24, 1.18]], W * .94, tp, 1.84);
    pillar(-.42, 1.22, 1.88, W * .94 + .02, tp); pillar(-1.38, 1.22, 1.9, W * .94 + .02, tp);
    rb('trim', W * .52, .36, .05, .03, 0, .88, 2.37); for (const y of [.76, .88, 1.0]) bx('chrome', W * .5, .025, .02, 0, y, 2.4);
    sym(s => {
      cyl('head', .11, .05, s * .7, .92, 2.37, Math.PI / 2); put('chrome', geoAt(new THREE.TorusGeometry(.12, .02, 6, 18), s * .7, .92, 2.39));
      rb('head', .13, .06, .1, .02, s * .8, 1.22, 2.0);                            /* the lamp pods on the wings */
      rb('tail', .12, .32, .05, .02, s * .87, .95, -2.36);
      rb('trim', .1, .12, 1.15, .04, s * (W2 + .03), .82, T.wb / 2); rb('trim', .1, .12, 1.15, .04, s * (W2 + .03), .82, -T.wb / 2);   /* arch flares */
      rb('trim', .16, .05, 1.5, .02, s * (W2 + .05), .42, -.06);                    /* side step */
      for (const z of [.9, -.1]) for (const y of [.72, 1.06]) bx('chrome', .03, .09, .06, s * (W2 + .01), y, z);
      bx('trim', .012, .6, .012, s * (W2 + .002), .9, -.42);
    });
    rb('trim', W + .06, .22, .22, .06, 0, .5, 2.36); rb('trim', W + .06, .22, .22, .06, 0, .52, -2.36);
    cyl('trim', .4, .26, 0, 1.02, -2.52, Math.PI / 2, 0, 0, 20); cyl('paint', .3, .04, 0, 1.02, -2.66, Math.PI / 2, 0, 0, 20);
    rb('trim', W * .9, .04, 2.4, .02, 0, 1.95, -.7);
    plates(.5, .62, 2.48, -2.48); mirrors(1.36, .9); handles([.4, -.6], 1.02);
  } else if (kind === 'moto'){
    /* sport bike (drawn at 1 / MOTO_S and scaled up at the end, so it stands right next to the big-headed 奶娃): twin-spar frame, fuel tank, sharp nose cowl ('fair', can come off in the workshop), clip-on bars,
       upside-down forks, swingarm, belly exhaust. Style only, no maker's name or badge */
    put('fair', geoAt(roundBox(.42, .36, .52, .1, 2), 0, .86, .64, -.35));
    sym(s => put('fair', geoAt(roundBox(.06, .34, .62, .03, 2), s * .17, .64, .34, 0, s * .06, 0)));
    put('fair', geoAt(roundBox(.28, .14, .5, .05, 2), 0, .36, .2));
    put('fairg', geoAt(roundBox(.3, .2, .025, .01, 2), 0, 1.1, .78, -1.0));
    el('paint', .2, .14, .32, 0, .99, .16);
    rb('paint', .22, .14, .5, .06, 0, .98, -.56, .2); rb('paint', .14, .04, .34, .02, 0, .67, .74, .1);
    rb('seat', .24, .07, .44, .03, 0, .93, -.24, .05);
    sym(s => {
      rod('trim', .035, [s * .12, .97, .44], [s * .12, .6, -.14]);
      rod('chrome', .028, [s * .09, 1.0, .56], [s * .09, .31, .71]);
      rod('trim', .025, [s * .1, .5, -.12], [s * .1, .31, -.71]);
      rod('trim', .016, [s * .09, .99, .5], [s * .3, .98, .45]);
      bx('trim', .1, .02, .04, s * .16, .46, -.2);
    });
    rb('grey', .3, .3, .42, .06, 0, .52, .08);
    rod('chrome', .03, [.08, .34, .16], [.14, .37, -.2]); cyl('chrome', .06, .32, .15, .38, -.33, Math.PI / 2);
    rb('head', .16, .08, .05, .02, 0, .84, .9, -.3); rb('tail', .12, .04, .03, .01, 0, .98, -.83);
    rb('trim', .2, .12, .02, .01, 0, .8, -.86, .3);
  } else {
    /* golf cart / patrol cart: open tub with footwell, bench seat, canopy roof on four posts */
    const pat = kind === 'patrol', f = T.L / 2, yb = .2, top = pat ? .96 : .76, sz = pat ? -.05 : 0;
    shell('paint', yb, [[f - .08, yb], [f, .4, f + .01, .22], [f - .02, top - .14], [f - .3, top, f - .04, top], [.82, top - .03], [.76, .45], [-.02 + sz, .42],
      [-.08 + sz, .66], [-f + .12, .68], [-f, .48, -f, .66], [-f + .08, yb, -f, .22]], W * .96, {ends:[.3, .1], bev:.05});
    rb('seat', W * .86, .16, .58, .07, 0, .76, -.42 + sz); rb('seat', W * .86, .5, .12, .05, 0, 1.1, -.76 + sz, -.14);
    const ry = 1.95, px = W2 - .08, fz = .74, rz = -f + .18;
    rb(pat ? 'paint' : 'white', W + .12, .07, T.L * .84, .03, 0, ry, -.12);
    sym(s => { rod('grey', .035, [s * px, top - .02, fz], [s * px, ry, fz - .3]); rod('grey', .035, [s * px, .66, rz], [s * px, ry, rz + .02]); });
    bx('glass', W - .2, .8, .02, 0, 1.5, fz - .15, -.32);
    rod('trim', .025, [.26, .55, .7], [.26, 1.02, .38]); put('trim', geoAt(new THREE.TorusGeometry(.16, .025, 6, 18), .26, 1.04, .36, -.75));
    rb('trim', W * .92, .12, .1, .04, 0, .3, f + .02); rb('trim', W * .9, .1, .1, .04, 0, .3, -f - .02);
    sym(s => { el('head', .08, .08, .04, s * .45, pat ? .45 : top - .25, f - .01); rb('tail', .12, .08, .04, .02, s * .5, .55, -f); });
    if (pat){
      rb('trim', .95, .08, .32, .03, 0, ry + .07, -.1);
      sym(s => bx('accent', .03, .18, 1.9, s * (W2 + .07), ry - .02, -.12));
      rb('accent', W * .9, .28, .04, .02, 0, top - .2, f + .01);
    }
  }
  const out = {};
  for (const k in P){ out[k] = geoMerge(P[k]); if (kind === 'moto') out[k].scale(MOTO_S, MOTO_S, MOTO_S); }
  return carGeoCache[kind] = out;
}
const cars = [];
function makeCar(kind, color, x, z, h){
  const T = CAR_T[kind], root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.rotation.order = 'YXZ';
  const paint = M(color, {roughness:.32, metalness:.3});
  let lights = null;
  const mats = Object.assign({paint, fair:paint, fairg:glassMat, accent:CAR_ACCENT[kind] ? (CAR_MAT['acc_' + kind] || (CAR_MAT['acc_' + kind] = M(CAR_ACCENT[kind], {roughness:.4, metalness:kind === 'rr' ? .5 : .1}))) : paint}, CAR_MAT);
  const geos = carParts(kind, T);
  /* only the body shell casts a shadow; trim, chrome and wheels (c.fine) are hidden when the car is far away (js/18-gfx.js) */
  const fine = [];
  for (const k in geos){ const m = new THREE.Mesh(geos[k], mats[k] || CAR_MAT.trim); if (k === 'wing0') m.userData.stockWing = true; m.castShadow = k === 'paint' || k === 'accent' || k === 'fair'; m.receiveShadow = k === 'paint'; body.add(m); if (k === 'trim' || k === 'chrome') fine.push(m); if (k === 'fair' || k === 'fairg') m.userData.fair = true; }
  if (kind === 'bus'){
    const tm = new THREE.MeshBasicMaterial({map:carTextTex('bus', 256, 48, g => { g.fillStyle = '#c4502a'; g.font = '700 30px "Noto Sans SC",sans-serif'; g.textBaseline = 'middle'; g.fillText('XMUM 校巴', 8, 26); }), transparent:true});
    for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(4, .75), tm); p.position.set(s * (T.W / 2 + .03), 1.5, 0); p.rotation.y = s * Math.PI / 2; body.add(p); }
  }
  if (kind === 'patrol'){
    lights = [new THREE.MeshStandardMaterial({color:'#b3261e', emissive:'#ff2b2b', emissiveIntensity:.1}), new THREE.MeshStandardMaterial({color:'#1e4fb3', emissive:'#2b6bff', emissiveIntensity:.1})];
    const lg = carGeoCache.patrolBar || (carGeoCache.patrolBar = roundBox(.4, .14, .26, .05));
    for (const i of [0, 1]){ const m = new THREE.Mesh(lg, lights[i]); m.position.set(i ? .21 : -.21, 2.1, -.1); body.add(m); }
    const tm = new THREE.MeshBasicMaterial({map:carTextTex('patrol', 256, 64, (g, w, hh) => { g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 30px "Noto Sans SC",sans-serif'; g.fillText('保安 SECURITY', w / 2, hh / 2 + 2); }), transparent:true});
    const sg = new THREE.PlaneGeometry(T.W * .86, .22);
    const fr = new THREE.Mesh(sg, tm); fr.position.set(0, .76, T.L / 2 + .035); body.add(fr);
  }
  const wheels = [], fronts = [];
  const wg = carWheelGeo(T.r);
  /* a motorbike has one wheel on the centre line at each end */
  for (const sz of [1, -1]) for (const sx of T.bike ? [0] : [-1, 1]){
    const piv = new THREE.Group(); piv.position.set(sx * (T.W / 2 - .08), T.r, sz * T.wb / 2); body.add(piv);
    const w = new THREE.Mesh(wg, wheelMat); w.scale.x = sx || 1; piv.add(w); wheels.push(w); fine.push(w); if (sz > 0) fronts.push(piv);
  }
  root.position.set(x, 0, z); root.rotation.y = h; scene.add(root);
  const c = {kind, T, root, body, wheels, fronts, x, z, h, vx:0, vz:0, y:0, vy:0, lastVy:0, air:false, airT:0, steer:0, slip:0, pitch:0, wet:false,
    R:(T.L + T.W) / 4, mass:T.mass, home:[x, z, h], lights, paint, color0:color, hp:100, wrecked:false, crashCd:0, smokeAcc:0, fine, fineOn:true};
  cars.push(c); return c;
}
/* 奶娃 is far taller than any car: sitting in one, the head comes up through the roof (or the cart's canopy). A dark rubber
   seal traced round the body where it meets the roof makes that read as standing up through a sunroof instead of clipping.
   One tube per car kind and body shape (cached), shown only while someone is at the wheel (enterCar here, online ghosts in js/net.js). */
const NW_RING_KINDS = ['sedan', 'myvi', 'p911', 'mase', 'lambo', 'rr', 'gwag', 'cart', 'patrol'], nwRingCache = {};
function nwRoofRing(kind, shape){
  shape = NW_SHAPES[shape] ? shape : 'std';
  const key = kind + '|' + shape; if (key in nwRingCache) return nwRingCache[key];
  if (!NW_RING_KINDS.includes(kind)) return nwRingCache[key] = null;
  const T = CAR_T[kind], P = carParts(kind, T), seat = T.seat, S = NAI_S;
  const ms = ['paint', 'glass', 'accent', 'white'].filter(k => P[k]).map(k => new THREE.Mesh(P[k], new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
  ms.forEach(m => m.updateMatrixWorld(true));
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), dn = new THREE.Vector3(0, -1, 0);
  const roofAt = (x, z) => { o.set(x, 9, z); rc.set(o, dn); const h = rc.intersectObjects(ms, false); return h.length ? h[0].point.y : null; };
  return nwRingCache[key] = nwWith(shape, sh => {
    const s = sh.s || 1, y0 = roofAt(seat[0], seat[2]), top = seat[1] + S * (s * 1.825 - NW_SIT_DROP);
    if (y0 == null || y0 < seat[1] + .6 || y0 > top - .3) return null;     /* no roof over the seat, or the head fits under it */
    const at = (th, y, off) => { const p = nwOnBody(th, ((y - seat[1]) / S + NW_SIT_DROP) / s, off); return [seat[0] + S * s * p[0], seat[2] + S * s * p[2]]; };
    const pts = [], N = 32;
    for (let i = 0; i < N; i++){
      const th = i / N * Math.PI * 2; let y = y0;
      for (let k = 0; k < 3; k++){ const [x, z] = at(th, y, .02), r = roofAt(x, z); if (r == null) break; y = r; }   /* follow the curve of the roof */
      const [x, z] = at(th, y, .03); pts.push(new THREE.Vector3(x, y + .012, z));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, .05, 6, true); g.keep = true;
    return g;
  });
}
function nwRingOn(c, shape){
  const g = shape === false ? null : nwRoofRing(c.kind, shape);
  if (!g){ if (c.ringM) c.ringM.visible = false; return; }
  if (!c.ringM){ c.ringM = new THREE.Mesh(g, CAR_MAT.trim); c.body.add(c.ringM); }
  c.ringM.geometry = g; c.ringM.visible = true;
}
makeCar('sedan', '#c0392b', 104, 197, Math.PI);
makeCar('bus', '#f4f1ea', ...P(1080, 855), Math.PI / 2);
makeCar('sedan', '#2d5d8a', ...P(1300, 855), Math.PI / 2);
makeCar('sedan', '#1f1f22', ...P(1000, 258), -Math.PI / 2);
makeCar('sedan', '#f0eee8', ...P(1580, 620), Math.PI);
makeCar('cart', '#3f8a5a', ...P(1060, 668), Math.PI / 2);
makeCar('cart', '#f0eee8', ...P(1530, 250), 0);
makeCar('cart', '#3f8a5a', ...P(300, 730), Math.PI / 2);
function carCircles(c, x, z, h){
  const n = c.kind === 'bus' ? 3 : 2, fx = Math.sin(h), fz = Math.cos(h), half = c.T.L / 2 - c.T.W / 2, out = [];
  for (let i = 0; i < n; i++){ const o = n === 1 ? 0 : -half + 2 * half * i / (n - 1); out.push([x + fx * o, z + fz * o]); }
  return out;
}
function carBlocked(c, x, z, h){
  const r = c.T.W / 2 + .1;
  return carCircles(c, x, z, h).some(([px, pz]) => outOfMap(px, pz, r) || hitsBuilding(px, pz, r));
}
let driving = null, camShake = 0;
function updateCar(c, dt, inp){
  const T = c.T;
  let fx = Math.sin(c.h), fz = Math.cos(c.h), rx = fz, rz = -fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const wasWet = c.wet; c.wet = lakes.some(L => inPoly(c.x, c.z, L));
  if (c.wet && !wasWet && Math.hypot(c.vx, c.vz) > 4){ sfx.splash(); for (let i = 0; i < 14; i++) spawnPart('dust', c.x + (rnd() - .5) * 4, .5, c.z + (rnd() - .5) * 4, 2.5, {vx:(rnd() - .5) * 8, vy:6 + rnd() * 6, vz:(rnd() - .5) * 8, g:18, life:1, op:.9, color:'#cfeaf5'}); }
  if (!c.air){
    const thr = c.wrecked ? 0 : inp.thr;
    if (thr > 0) vf += T.acc * thr * dt * (vf < -.5 ? 2.5 : 1) * (c.wet ? .35 : 1);
    else if (thr < 0){ if (vf > .5) vf += T.acc * 2.4 * thr * dt; else vf += T.acc * .7 * thr * dt; }
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
    vf -= vf * (.1 + (c.wet ? 1.5 : 0)) * dt;
    vf = Math.max(-T.maxV * .35, Math.min(T.maxV, vf));
    vl -= vl * Math.min(1, (inp.brake ? 1.1 : T.grip) * dt);
    if (inp.brake) vf -= vf * .55 * dt;
    c.steer += (inp.steer * T.steer - c.steer) * Math.min(1, dt * 7);
    const se = c.steer / (1 + Math.abs(vf) * .025);
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.h += vf / T.wb * Math.tan(se) * dt * (inp.brake ? 1.9 : 1);
    fx = Math.sin(c.h); fz = Math.cos(c.h); rx = fz; rz = -fx;
    c.slip = Math.abs(c.vx * rx + c.vz * rz);
    if (c.slip > 3.5 && !c.wet){ for (const sx of [-1, 1]) skidAt(c.x - fx * T.wb / 2 + rx * sx * (T.W / 2 - .1), c.z - fz * T.wb / 2 + rz * sx * (T.W / 2 - .1), c.h, c.y); }
  } else c.slip = 0;
  c.crashCd -= dt;
  if (carBlocked(c, c.x, c.z, c.h)){
    outer: for (const rr of [.3, .6, 1, 1.6, 2.4, 3.5]) for (let a = 0; a < 8; a++){
      const x = c.x + Math.cos(a * .785) * rr, z = c.z + Math.sin(a * .785) * rr;
      if (!carBlocked(c, x, z, c.h)){ c.x = x; c.z = z; break outer; }
    }
  }
  const ox = c.x, oz = c.z, wedged = false;
  const nSub = Math.max(1, Math.ceil(Math.hypot(c.vx, c.vz) * dt / .7));
  let hit = false;
  for (let si = 1; si <= nSub; si++){
    const nx2 = ox + c.vx * dt * si / nSub, nz2 = oz + c.vz * dt * si / nSub;
    if (!wedged && carBlocked(c, nx2, nz2, c.h)){ hit = true; break; }
    c.x = nx2; c.z = nz2;
  }
  if (hit){
    const rem = dt * .9, okX = !carBlocked(c, c.x + c.vx * rem, c.z, c.h), okZ = !carBlocked(c, c.x, c.z + c.vz * rem, c.h);
    let impact;
    if (okX && !okZ){ impact = Math.abs(c.vz); c.x += c.vx * rem; c.vz *= -.25; c.vx *= .975; }
    else if (okZ && !okX){ impact = Math.abs(c.vx); c.z += c.vz * rem; c.vx *= -.25; c.vz *= .975; }
    else { impact = Math.hypot(c.vx, c.vz); c.vx *= -.3; c.vz *= -.3; }
    if (impact > 5 && c.crashCd <= 0){
      c.crashCd = .35;
      sfx.crash(Math.min(1, impact / 25)); dustBurst(c.x + fx * T.L / 2, 1, c.z + fz * T.L / 2, 5, 3);
      if (c === driving){ camShake = Math.min(2.5, impact / 10); judgeCrash(c, impact); }
    }
  }
  const sp = Math.hypot(c.vx, c.vz);
  if (sp > 4){
    const n = knockAround(c.x + fx * T.L * .35, c.z + fz * T.L * .35, T.W / 2 + 1.1, c.x - fx * 5, c.z - fz * 5);
    if (n){ c.vx *= .86; c.vz *= .86; sfx.thud(.6); if (c === driving){ camShake = Math.max(camShake, .6); heat += n * .12; addStunt('撞倒', 15 * n); } }
  }
  const g = groundAt(c.x, c.z);
  if (c.air){
    c.vy -= 26 * dt; c.y += c.vy * dt; c.airT += dt;
    if (c.y <= g){
      c.y = g; c.air = false;
      if (c.vy < -6){ sfx.thud(Math.min(1, -c.vy / 18)); dustBurst(c.x, .5, c.z, 6, 3); if (c === driving) camShake = Math.min(2, -c.vy / 10); }
      if (c === driving && c.airT > .55) addStunt(c.wet ? '飞进湖里' : '飞跃 ' + c.airT.toFixed(1) + ' 秒', Math.round(c.airT * 400));
      c.vy = 0; c.lastVy = 0;
    }
  } else {
    const vy = (g - c.y) / Math.max(dt, 1e-3);
    if (g < c.y - .3 && c.lastVy > 1){ c.air = true; c.airT = 0; c.vy = c.lastVy * 1.25; }
    else { c.y = g; c.lastVy = Math.max(-5, Math.min(20, vy)); }
  }
  if (c.hp < 45 && c.root.visible){
    c.smokeAcc += dt * (c.hp < 20 ? 14 : 6);
    while (c.smokeAcc > 1){ c.smokeAcc--; spawnPart('dust', c.x + fx * T.L * .38, c.y + T.H * .8, c.z + fz * T.L * .38, 1.2, {vx:(rnd() - .5), vy:2.5, vz:(rnd() - .5), grow:2.2, life:1.6, op:.55, color:c.hp < 20 ? '#2b2b2b' : '#8d8d8d'}); }
  }
  const targetPitch = -Math.atan2(c.air ? c.vy : c.lastVy, Math.max(5, Math.abs(vf))) * .85;
  c.pitch += (targetPitch - c.pitch) * Math.min(1, dt * 8);
  /* body roll; a motorbike leans into the turn instead (T.lean), more the faster it goes */
  const roll = T.lean ? c.steer / T.steer * Math.min(1, Math.abs(vf) / 16) * T.lean * Math.sign(vf || 1) : -c.steer * Math.min(1, Math.abs(vf) / 30) * .12;
  c.root.position.set(c.x, c.y, c.z); c.root.rotation.set(c.pitch, c.h, roll);
  for (const w of c.wheels) w.rotation.x += vf / T.r * dt;
  for (const p of c.fronts) p.rotation.y = c.steer;
}
function carCollisions(){
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++){
    const a = cars[i], b = cars[j]; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.R + b.R;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, ov = min - d, ia = 1 / a.mass, ib = 1 / b.mass;
    const pa = ov * ia / (ia + ib), pb = ov * ib / (ia + ib);
    if (!carBlocked(a, a.x - nx * pa, a.z - nz * pa, a.h)){ a.x -= nx * pa; a.z -= nz * pa; }
    if (!carBlocked(b, b.x + nx * pb, b.z + nz * pb, b.h)){ b.x += nx * pb; b.z += nz * pb; }
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0){
      const jimp = -(1.4) * rv / (ia + ib);
      a.vx -= jimp * ia * nx; a.vz -= jimp * ia * nz; b.vx += jimp * ib * nx; b.vz += jimp * ib * nz;
      if (-rv > 5){ sfx.crash(Math.min(1, -rv / 20)); dustBurst(a.x + nx * a.R, 1, a.z + nz * a.R, 4, 2.5); if (a === driving || b === driving){ camShake = Math.min(2, -rv / 10); if (-rv > 7){ heat += (a.patrol || b.patrol) ? .5 : .3; addStunt('撞车', Math.round(-rv * 8)); } } }
    }
  }
}

/* enter / exit / eject */
function nearestCar(){
  let best = null, bd = 1e9;
  for (const c of cars) if (!c.wrecked) for (const [x, z] of carCircles(c, c.x, c.z, c.h)){ const d = Math.hypot(x - nw.x, z - nw.z) - c.T.W / 2; if (d < bd){ bd = d; best = c; } }
  return bd < 3.2 ? best : null;
}
function enterCar(c){
  driving = c; nw.state = 'sit'; nw.air = false;
  c.body.add(NW.root); NW.root.position.set(...c.T.seat); NW.root.rotation.set(0, 0, 0);
  nwRingOn(c, NW.shape);
  engineStart(c.kind); updateActs();
}
function placeBeside(c){
  const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  for (const s of [1, -1, 2, -2]){
    const x = c.x + rx * s * (c.T.W / 2 + 1.6), z = c.z + rz * s * (c.T.W / 2 + 1.6);
    if (!footBlocked(x, z)){ nw.x = x; nw.z = z; return; }
  }
  nw.x = c.x; nw.z = c.z + c.R + 2;
}
function leaveCar(){
  const c = driving; if (!c) return;
  scene.add(NW.root); NW.root.scale.setScalar(NAI_S); nwRingOn(c, false);
  placeBeside(c); nw.y = groundAt(nw.x, nw.z); nw.h = c.h; nw.state = 'idle'; driving = null; engineStop();
  camYaw = c.h + Math.PI; updateActs();
}
function eject(impact){
  const c = driving; if (!c) return;
  scene.add(NW.root); NW.root.scale.setScalar(NAI_S); nwRingOn(c, false); driving = null; engineStop();
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  nw.x = c.x + fx * (c.T.L / 2 - .5); nw.z = c.z + fz * (c.T.L / 2 - .5); nw.y = c.y + 2;
  nw.vx = -fx * impact * .25; nw.vz = -fz * impact * .25; nw.vy = 11 + impact * .15; nw.h = c.h; nw.spin = 0;
  nw.state = 'fly'; nw.t = 0; camYaw = c.h + Math.PI;
  toast('车祸！奶娃飞出去了', `撞击速度 ${Math.round(impact * 3.6)} km/h`); addStunt('人车分离', 300); updateActs();
}

/* ---------- on foot ---------- */
/* indoors = inside a room built far outside the map: the classroom (js/87-classroom.js), or anything that sets window.XINDOOR
   to its own name while you are inside ('dorm' from js/89-dorm.js). window.XINDOOR_AT = {x, z} is the door on the campus you
   went in through: patrol cars wait there (js/80-gta.js). */
function indoorNow(){ return (typeof ROOM !== 'undefined' && ROOM.in) || !!window.XINDOOR; }
function indoorDoor(){ return typeof ROOM !== 'undefined' && ROOM.in ? ROOM.from : window.XINDOOR ? window.XINDOOR_AT || null : null; }
function footBlocked(x, z){
  if (!indoorNow() && outOfMap(x, z, 0)) return true;   /* indoor rooms sit outside the map */
  if (hitsBuilding(x, z, .9)) return true;
  for (const L of lakes) if (inPoly(x, z, L)) return true;
  for (const c of cars) if (Math.hypot(c.x - x, c.z - z) < c.R * .9) return true;
  return false;
}
function updateFoot(dt){
  nw.t += dt;
  if (nw.state === 'fly'){
    nw.vy -= 24 * dt; nw.spin -= dt * 9;
    const nx = nw.x + nw.vx * dt, nz = nw.z + nw.vz * dt;
    if (!hitsBuilding(nx, nz, .9) && !outOfMap(nx, nz, 0)){ nw.x = nx; nw.z = nz; } else { nw.vx *= -.3; nw.vz *= -.3; }
    nw.y += nw.vy * dt;
    const g = groundAt(nw.x, nw.z);
    if (nw.y <= g && nw.vy < 0){
      nw.y = g; nw.state = 'flop'; nw.t = 0; sfx.thud(.7); sfx.laugh(); dustBurst(nw.x, .4, nw.z, 6, 2.5);
      if (lakes.some(L => inPoly(nw.x, nw.z, L))){ sfx.splash(); nw.state = 'idle'; const s = shoreNear(nw.x, nw.z); nw.x = s[0]; nw.z = s[1]; toast('扑通', '奶娃爬回了岸上'); }
    }
    return;
  }
  const busy = nw.state === 'flop' || nw.state === 'laugh' || nw.state === 'pose';
  if (busy){
    const dur = nw.state === 'flop' ? 2.5 : nw.state === 'pose' ? 2.4 : 2.2;
    if (nw.state !== 'pose' && Math.floor(nw.t / .32) !== Math.floor((nw.t - dt) / .32) && nw.t > .3 && nw.t < dur - .3)
      spawnPart('ha', nw.x + (rnd() - .5) * 2, nw.y + 3 + rnd(), nw.z + (rnd() - .5) * 2, 1.1, {vy:2.2, life:1.1, op:1, color:'#c0392b'});
    if (nw.state === 'pose' && Math.floor(nw.t / .18) !== Math.floor((nw.t - dt) / .18) && nw.t < 1.8)
      spawnPart('heart', nw.x + (rnd() - .5) * 3, nw.y + 2.4 + rnd() * 1.5, nw.z + (rnd() - .5) * 3, .9 + rnd() * .5, {vy:2.5, vx:(rnd() - .5) * 2, life:1.4, op:1, color:'#ff6fa3'});
    if (nw.t > dur) nw.state = 'idle';
  }
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let l = Math.hypot(f, r);
  nw.spd = 0;
  if (l > .08 && !busy){
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    let dx = -s * f + c * r, dz = -c * f - s * r; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const target = Math.atan2(dx, dz); let dh = target - nw.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); nw.h += dh * Math.min(1, dt * 10);
    const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > .95;
    const v = (run ? 11 : 5.5) * Math.min(1, l) * dt;
    const fst = footBlocked(nw.x, nw.z);
    if (fst || !footBlocked(nw.x + dx * v, nw.z)) nw.x += dx * v;
    if (fst || !footBlocked(nw.x, nw.z + dz * v)) nw.z += dz * v;
    nw.spd = v / dt; nw.walkT += dt * (run ? 13 : 9);
    if (Math.floor(nw.walkT / Math.PI) !== Math.floor((nw.walkT - dt * (run ? 13 : 9)) / Math.PI)) knockAround(nw.x, nw.z, 1.6, nw.x - dx, nw.z - dz);
  }
  const g = groundAt(nw.x, nw.z);
  if (nw.air){ nw.vy -= 24 * dt; nw.y += nw.vy * dt; if (nw.y <= g){ nw.y = g; nw.air = false; if (nw.vy < -8){ sfx.thud(.4); dustBurst(nw.x, .3, nw.z, 3, 2); } } }
  else nw.y = g;
}
function shoreNear(x, z){
  for (let r = 4; r < 120; r += 4) for (let a = 0; a < 16; a++){
    const px = x + Math.cos(a / 16 * 6.283) * r, pz = z + Math.sin(a / 16 * 6.283) * r;
    if (!footBlocked(px, pz)) return [px, pz];
  }
  return [114, 200];
}
function footAction(k){
  if (driving || nw.state === 'fly' || nw.state === 'flop') return;
  if (k === 'jump' && !nw.air && nw.state !== 'laugh' && nw.state !== 'pose'){ nw.air = true; nw.vy = 8.5; sfx.boing(); }
  if (k === 'laugh' && !nw.air){ nw.state = 'laugh'; nw.t = 0; sfx.laugh(); }
  if (k === 'pose' && !nw.air){ nw.state = 'pose'; nw.t = 0; sfx.sparkle();
    for (const n of npcs) if (n.state === 'walk' && Math.hypot(n.x - nw.x, n.z - nw.z) < 20) spawnPart('heart', n.x, 2.5, n.z, .8, {vy:2, life:1.4, op:1, color:'#ff6fa3'}); }
}
