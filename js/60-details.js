/* XMUM 校园漫游 · 长椅、停车场、喷泉、学生 NPC */
'use strict';
/* ---------- street furniture ---------- */
TEX.excl = makeTex(g => { g.fillStyle = '#fff'; g.font = '900 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34); });
function mergeGeos(list){
  const pos = [], nor = [];
  for (const g0 of list){ const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
}
/* park bench: wooden slats on cast-iron side frames; litter bin with rim and lid (vertex-coloured, one draw call each) */
const benchGeo = (() => {
  const wood = ['#9b6a43', '#8d5f3b', '#a5724a', '#93643f'], iron = '#2c2e30', P = [];
  [-.17, -.057, .057, .17].forEach((z, i) => P.push(geoTint(new THREE.BoxGeometry(1.8, .045, .1).translate(0, .46, z), wood[i])));
  [.62, .75, .88].forEach((y, i) => P.push(geoTint(geoAt(new THREE.BoxGeometry(1.8, .085, .035), 0, y, -.25 - (y - .62) * .14, -.14), wood[(i + 1) % 4])));
  for (const x of [-.8, .8]){
    P.push(geoTint(geoAt(new THREE.BoxGeometry(.06, .45, .06), x, .225, .19), iron), geoTint(geoAt(new THREE.BoxGeometry(.06, .96, .06), x, .47, -.24, -.14), iron),
      geoTint(geoAt(new THREE.BoxGeometry(.06, .05, .46), x, .425, -.02), iron), geoTint(geoAt(new THREE.BoxGeometry(.07, .05, .5), x, .66, -.01), iron),
      geoTint(geoAt(new THREE.BoxGeometry(.06, .2, .06), x, .56, .19), iron));
  }
  return geoMerge(P);
})();
const binGeo = geoMerge([geoTint(new THREE.CylinderGeometry(.27, .24, .82, 10, 1, true).translate(0, .43, 0), '#2f6b4f'),
  geoTint(geoAt(new THREE.TorusGeometry(.27, .03, 4, 10), 0, .84, 0, Math.PI / 2), '#24563f'),
  geoTint(new THREE.CylinderGeometry(.2, .29, .1, 10).translate(0, .9, 0), '#1f2a26')]);
const benches = [], bins = [];
function sampleLine(pxLine, step, off, cb){
  const pts = pxPts(pxLine);
  for (let i = 0; i < pts.length - 1; i++){
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], l = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / l, nz = (x1 - x0) / l;
    for (let s2 = step / 2; s2 < l; s2 += step) cb(x0 + (x1 - x0) * s2 / l + nx * off, z0 + (z1 - z0) * s2 / l + nz * off, Math.atan2(-nx * Math.sign(off), -nz * Math.sign(off)));
  }
}
const okSpot = (x, z) => !hitsBuilding(x, z, 1.2) && !onRoad(x, z, .2) && !lakes.some(L => inPoly(x, z, L));
const FRONT_ROAD = [[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]];
for (const off of [-9.6, 9.6]){
  sampleLine(FRONT_ROAD, 24, off, (x, z, h) => { if (okSpot(x, z)) benches.push({x, z, r:h, s:1}); });
  sampleLine(FRONT_ROAD, 24, off * 1.02, (x, z, h) => {});
}
sampleLine(FRONT_ROAD, 24, 9.8, (x, z) => { const q = [x + 2.4, z]; if (okSpot(...q)) bins.push({x:q[0], z:q[1], r:0, s:1}); });
lakeRims.forEach(rim => {
  const cx = rim.reduce((a, p) => a + p[0], 0) / rim.length, cz = rim.reduce((a, p) => a + p[1], 0) / rim.length;
  for (let i = 2; i < rim.length; i += 7){ const [x, z] = rim[i], h = Math.atan2(cx - x, cz - z); const bx = x + Math.sin(h) * -1.4, bz = z + Math.cos(h) * -1.4; if (okSpot(bx, bz)) benches.push({x:bx, z:bz, r:h, s:1}); }
});
knockSets.push({kind:'bench', spots:benches, ims:[instanced(benchGeo, M('#ffffff', {roughness:.75, vertexColors:true}), benches)]});
knockSets.push({kind:'bin', spots:bins, ims:[instanced(binGeo, M('#ffffff', {roughness:.6, vertexColors:true}), bins)]});

/* ---------- parking lots (every car can be driven) ---------- */
function clearArea(cx, cz, hw, hd){
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (Math.abs(o.x - cx) < hw && Math.abs(o.z - cz) < hd){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
  });
}
function lot(cx, cz, w, d, lines){
  clearArea(cx, cz, w / 2 + 2, d / 2 + 2);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), flatMat('#6e6b66', 4)); m.rotation.x = -Math.PI / 2; m.position.set(cx, .046, cz); m.receiveShadow = true; scene.add(m);
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), flatMat('#f1ede4', 8), lines.length);
  lines.forEach(([x, z, lw, ld], i) => { _cm.compose(_cp.set(x, .052, z), _cq.identity(), _cs.set(lw, 1, ld)); im.setMatrixAt(i, _cm); });
  im.frustumCulled = false; scene.add(im);
}
const PALETTE = ['#c0392b', '#2d5d8a', '#1f1f22', '#f0eee8', '#7f8c8d', '#d4a017', '#2e7d5b', '#8e44ad'];
(function(){
  const L1 = [];
  for (let k = 0; k <= 16; k++){ const zz = -18 + k * 3.2; L1.push([502, zz, 6, .14], [536, zz, 6, .14]); }
  lot(519, 8, 46, 60, L1);
  [[502, -11], [502, -1.4], [502, 14.6], [536, -14.2], [536, 1.8], [536, 24.2]].forEach(([x, z], i) => makeCar('sedan', PALETTE[i % PALETTE.length], x, z, x < 519 ? -Math.PI / 2 : Math.PI / 2));
  const L2 = [];
  for (let k = 0; k <= 10; k++) L2.push([-220 + k * 3.2, 200, .14, 6]);
  lot(-204, 200, 38, 14, L2);
  [[-216.8, 200], [-210.4, 200], [-197.6, 200], [-191.2, 200]].forEach(([x, z], i) => makeCar('sedan', PALETTE[(i + 3) % PALETTE.length], x, z, Math.PI));
  addLabel('停车场', 519, 5, 8, true); addLabel('停车场', -204, 5, 200, true);
})();

/* ---------- fountain in the central lake ---------- */
const FOUNT = P(1385, 405);
(function(){
  const [x, z] = FOUNT;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, .35, 8, 40), granite); ring.rotation.x = Math.PI / 2; ring.position.set(x, .15, z); scene.add(ring);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(.35, .6, 1.6, 12), granite); spout.position.set(x, .7, z); scene.add(spout);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(.9, 7, 16, 1, true), new THREE.MeshBasicMaterial({color:'#e6f6ff', transparent:true, opacity:.45, depthWrite:false, side:THREE.DoubleSide}));
  jet.position.set(x, 4.6, z); jet.rotation.x = Math.PI; scene.add(jet);
})();
let fountAcc = 0;
function updateFountain(dt){
  fountAcc += dt * 26;
  while (fountAcc > 1){ fountAcc--; const a = rnd() * 6.283; spawnPart('dust', FOUNT[0], 7.5, FOUNT[1], .9, {vx:Math.cos(a) * 2.2, vy:3 + rnd() * 2, vz:Math.sin(a) * 2.2, g:9, life:1.3, op:.7, grow:.8, color:'#e9f7ff'}); }
}

/* ---------- students walking around ---------- */
const NPC_N = 80;
/* students: shirt (instance colour), skin (instance colour), and hair/trousers/shoes/backpack (vertex colours) — three instanced meshes */
const npcBodyGeo = (() => {
  const torso = new THREE.LatheGeometry([[0,.86],[.17,.87],[.18,.95],[.165,1.08],[.185,1.25],[.2,1.36],[.15,1.44],[.07,1.475],[0,1.48]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  torso.scale(1, 1, .62);
  return geoMerge([torso, ...[-1, 1].map(s => geoAt(nwCapsule(.072, .066, .17, 6, 2), s * .215, 1.39, 0, 0, 0, s * .12))]);
})();
const npcHeadGeo = geoMerge([nwBlob(.14, 1, 1.08, 1, 0, 1.62, 0, 0, 0, 0, 10, 7), new THREE.CylinderGeometry(.055, .06, .12, 6, 1, true).translate(0, 1.49, 0),
  ...[-1, 1].map(s => geoAt(nwCapsule(.05, .045, .25, 6, 2), s * .24, 1.19, 0, 0, 0, s * .06)), ...[-1, 1].map(s => nwBlob(.055, 1, 1.15, .85, s * .257, .9, .01, 0, 0, 0, 6, 4))]);
const npcGearGeo = (() => {
  const P = [], pants = '#2e3a52', hair = '#1d1814';
  for (const s of [-1, 1]){
    P.push(geoTint(geoAt(nwCapsule(.085, .07, .74, 7, 2), s * .09, .92, 0), pants), geoTint(geoAt(roundBox(.12, .08, .25, .035, 1), s * .09, .045, .035), '#ece9e2'),
      geoTint(new THREE.BoxGeometry(.035, .34, .02).translate(s * .1, 1.22, .11), '#2b2b2b'));
  }
  P.push(geoTint(geoAt(roundBox(.33, .14, .19, .06, 1), 0, .87, 0), pants));
  P.push(geoTint(geoAt(new THREE.SphereGeometry(.153, 10, 4, 0, Math.PI * 2, 0, Math.PI * .56), 0, 1.635, -.01, -.38, 0, 0, 1, 1.06, 1), hair));
  P.push(geoTint(geoAt(roundBox(.3, .36, .14, .05, 1), 0, 1.19, -.19), '#3a4f66'), geoTint(new THREE.BoxGeometry(.22, .14, .05).translate(0, 1.09, -.27), '#33465b'));
  return geoMerge(P);
})();
const npcBodyIm = new THREE.InstancedMesh(npcBodyGeo, new THREE.MeshStandardMaterial({roughness:.8}), NPC_N);
const npcHeadIm = new THREE.InstancedMesh(npcHeadGeo, new THREE.MeshStandardMaterial({roughness:.7}), NPC_N);
const npcGearIm = new THREE.InstancedMesh(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), NPC_N);
[npcBodyIm, npcHeadIm, npcGearIm].forEach(im => { im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); });
const SHIRTS = ['#c0392b', '#2d5d8a', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#ff8fab', '#16a085'], SKIN = ['#f1c9a5', '#d9a37c', '#a8734f', '#e8b98f'];
const npcPaths = ROADS_W.slice(1).map(r => ({p:r.p, off:r.m === asphalt ? r.w / 2 + 1.3 : r.m === paving ? r.w / 2 - 1.4 : .6}));
const npcs = [];
const _col = new THREE.Color();
for (let i = 0; i < NPC_N; i++){
  const path = npcPaths[(rnd() * npcPaths.length) | 0];
  npcs.push({path, seg:(rnd() * (path.p.length - 1)) | 0, t:rnd(), dir:rnd() < .5 ? 1 : -1, side:rnd() < .5 ? 1 : -1, sp:1 + rnd() * .7,
    x:0, z:0, y:0, h:0, ox:0, oz:0, dodge:0, dvx:0, dvz:0, state:'walk', tilt:0, tdx:0, tdz:0, ph:rnd() * 6});
  npcBodyIm.setColorAt(i, _col.set(SHIRTS[i % SHIRTS.length])); npcHeadIm.setColorAt(i, _col.set(SKIN[i % SKIN.length]));
}
function npcStep(n, dt){
  const p = n.path.p; let a = p[n.seg], b = p[n.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  n.t += n.dir * n.sp * dt / L;
  if (n.t > 1){ if (n.seg < p.length - 2){ n.seg++; n.t = 0; } else { n.t = 1; n.dir = -1; } }
  else if (n.t < 0){ if (n.seg > 0){ n.seg--; n.t = 1; } else { n.t = 0; n.dir = 1; } }
  a = p[n.seg]; b = p[n.seg + 1]; L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, off = n.path.off * n.side;
  n.x = a[0] + (b[0] - a[0]) * n.t - dz * off + n.ox; n.z = a[1] + (b[1] - a[1]) * n.t + dx * off + n.oz;
  n.h = Math.atan2(dx * n.dir, dz * n.dir);
}
function updateNPCs(dt, T){
  const car = driving, csp = car ? Math.hypot(car.vx, car.vz) : 0;
  for (let i = 0; i < NPC_N; i++){
    const n = npcs[i]; let y = 0, tiltX = 0, sc = 1;
    if (n.state === 'walk'){
      npcStep(n, dt);
      if (n.dodge > 0){
        n.dodge -= dt; n.ox += n.dvx * dt; n.oz += n.dvz * dt; y = Math.sin(Math.PI * Math.max(0, n.dodge) / .45) * .9;
      } else { n.ox *= Math.exp(-dt * .35); n.oz *= Math.exp(-dt * .35); y = Math.abs(Math.sin(T * 7 + n.ph)) * .05; }
      if (car && csp > 4 && n.dodge <= 0){
        const rx = n.x - car.x, rz = n.z - car.z, ux = car.vx / csp, uz = car.vz / csp, along = rx * ux + rz * uz, lat = rx * uz - rz * ux;
        if (along > 0 && along < 10 + csp * .25 && Math.abs(lat) < car.T.W / 2 + 1.6){
          const sgn = lat >= 0 ? 1 : -1; n.dodge = .45; n.dvx = uz * sgn * 9; n.dvz = -ux * sgn * 9;
          spawnPart('excl', n.x, 2.6, n.z, .8, {vy:1.5, life:.8, op:1, color:'#e74c3c'}); heat += .15; addStunt('擦身而过', 60);
        }
      }
    } else if (n.state === 'fall'){ y = n.y; tiltX = n.tilt; sc = Math.max(.01, 1 - n.tilt * .3); }
    else { sc = 0; }
    _cp.set(n.x, y, n.z); _cq.setFromAxisAngle(UP, n.h);
    if (tiltX){ _cq2.setFromAxisAngle(_ax.set(n.tdz, 0, -n.tdx).normalize(), tiltX); _cq.premultiply(_cq2); }
    _cs.setScalar(sc); _cm.compose(_cp, _cq, _cs);
    npcBodyIm.setMatrixAt(i, _cm); npcHeadIm.setMatrixAt(i, _cm); npcGearIm.setMatrixAt(i, _cm);
  }
  npcBodyIm.instanceMatrix.needsUpdate = npcHeadIm.instanceMatrix.needsUpdate = npcGearIm.instanceMatrix.needsUpdate = true;
}
