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
const NPC_WALK = 80, NPC_GROUP = 16, NPC_N = NPC_WALK + NPC_GROUP;
/* students are split into instanced parts so legs and arms can swing:
   torso (shirt colour), head + neck (skin), hair/backpack (vertex colours), one leg (pants colour, 2 per student),
   sleeve (shirt) and forearm (skin) (2 per student); skirts, long hair and umbrellas only for the students who have them */
const npcBodyGeo = new THREE.LatheGeometry([[0,.86],[.17,.87],[.18,.95],[.165,1.08],[.185,1.25],[.2,1.36],[.15,1.44],[.07,1.475],[0,1.48]].map(([r, y]) => new THREE.Vector2(r, y)), 8).scale(1, 1, .62);
const npcHeadGeo = geoMerge([nwBlob(.14, 1, 1.08, 1, 0, 1.62, 0, 0, 0, 0, 10, 7), new THREE.CylinderGeometry(.055, .06, .12, 6, 1, true).translate(0, 1.49, 0)]);
const npcGearGeo = (() => {
  const P = [], hair = '#1d1814';
  for (const s of [-1, 1]) P.push(geoTint(new THREE.BoxGeometry(.035, .34, .02).translate(s * .1, 1.22, .11), '#2b2b2b'));
  P.push(geoTint(geoAt(new THREE.SphereGeometry(.153, 10, 4, 0, Math.PI * 2, 0, Math.PI * .56), 0, 1.635, -.01, -.38, 0, 0, 1, 1.06, 1), hair));
  P.push(geoTint(geoAt(roundBox(.3, .36, .14, .05, 1), 0, 1.19, -.19), '#3a4f66'), geoTint(new THREE.BoxGeometry(.22, .14, .05).translate(0, 1.09, -.27), '#33465b'));
  return geoMerge(P);
})();
/* limb geometry hangs from its joint at the origin */
const npcLegGeo = geoMerge([geoTint(nwCapsule(.085, .07, .74, 6, 2), '#ffffff'), geoTint(new THREE.BoxGeometry(.12, .08, .25).translate(0, -.875, .035), '#c9c9c9'),
  geoTint(new THREE.BoxGeometry(.17, .14, .19).translate(-.005, -.05, 0), '#ffffff')]);
const npcSleeveGeo = nwCapsule(.072, .066, .17, 6, 2);
const npcForeGeo = geoMerge([nwCapsule(.05, .045, .25, 6, 2).translate(0, -.2, 0), nwBlob(.055, 1, 1.15, .85, .01, -.49, .01, 0, 0, 0, 6, 4)]);
const npcSkirtGeo = new THREE.CylinderGeometry(.175, .29, .4, 10, 1, true).translate(0, .78, 0);
const npcHairGeo = nwBlob(.16, 1, 1.45, .75, 0, 1.5, -.07, .12, 0, 0, 8, 6);
const npcUmbGeo = geoMerge([geoTint(new THREE.ConeGeometry(.78, .32, 8, 1, true).translate(0, 2.18, 0), '#ffffff'), geoTint(new THREE.CylinderGeometry(.012, .012, 1.0, 4).translate(0, 1.62, 0), '#333333'),
  geoTint(new THREE.SphereGeometry(.03, 4, 3).translate(0, 2.36, 0), '#333333')]).translate(.2, 0, .1);
const npcIm = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; };
const npcBodyIm = npcIm(npcBodyGeo, new THREE.MeshStandardMaterial({roughness:.8}), NPC_N);
const npcHeadIm = npcIm(npcHeadGeo, new THREE.MeshStandardMaterial({roughness:.7}), NPC_N);
const npcGearIm = npcIm(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), NPC_N);
const npcLegIm = npcIm(npcLegGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), NPC_N * 2);
const npcSleeveIm = npcIm(npcSleeveGeo, new THREE.MeshStandardMaterial({roughness:.8}), NPC_N * 2);
const npcForeIm = npcIm(npcForeGeo, new THREE.MeshStandardMaterial({roughness:.7}), NPC_N * 2);
const SHIRTS = ['#c0392b', '#2d5d8a', '#f1c40f', '#ecf0f1', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#ff8fab', '#16a085'], SKIN = ['#f1c9a5', '#d9a37c', '#a8734f', '#e8b98f'];
const PANTS = ['#2e3a52', '#1f1f22', '#55657a', '#b5a07a', '#3c5a8a'], SKIRTS = ['#2e3a52', '#8e2b3a', '#d8c7a1', '#3d6b5a', '#1f1f22'], HAIRS = ['#1d1814', '#2a1d16', '#3b2a1e', '#1d1814'];
const UMBS = ['#c0392b', '#2d5d8a', '#f0c419', '#2d8a6e', '#8e44ad', '#ff8fab', '#34495e', '#e67e22'];
const npcPaths = ROADS_W.slice(1).map(r => ({p:r.p, off:r.m === asphalt ? r.w / 2 + 1.3 : r.m === paving ? r.w / 2 - 1.4 : .6}));
const npcs = [];
const _col = new THREE.Color();
for (let i = 0; i < NPC_WALK; i++){
  const path = npcPaths[(rnd() * npcPaths.length) | 0];
  npcs.push({path, seg:(rnd() * (path.p.length - 1)) | 0, t:rnd(), dir:rnd() < .5 ? 1 : -1, side:rnd() < .5 ? 1 : -1, sp:1 + rnd() * .7,
    x:0, z:0, y:0, h:0, ox:0, oz:0, dodge:0, dvx:0, dvz:0, state:'walk', tilt:0, tdx:0, tdz:0, ph:rnd() * 6});
}
/* small groups chatting on the plazas (their own random stream, so the shared sequence is unchanged) */
const npcGroups = [];
(function(){
  const rr = mkRng(2468), spots = [[94, 127], [146, 127], [44, -139], [70, -140], [366, -124], [420, 7], [150, 190], [200, 125]];
  const sizes = [3, 2, 2, 2, 3, 2, 0, 2];   /* members per group, 16 in all */
  spots.forEach(([gx, gz], k) => {
    const n = sizes[k], g = {x:gx, z:gz, r:.5 + n * .14, talk:0, next:1 + rr() * 3};
    if (!n) return; npcGroups.push(g);
    for (let j = 0; j < n && npcs.length < NPC_N; j++) npcs.push({grp:g, slot:j, ga:j / n * Math.PI * 2 + rr() * .5, x:gx, z:gz, y:0, h:0, ox:0, oz:0, dodge:0, dvx:0, dvz:0, state:'walk', tilt:0, tdx:0, tdz:0, ph:rr() * 6, sp:0});
  });
})();
/* looks: shirt and skin as before for the walkers; every third student wears a skirt (bare legs) and long hair.
   Torso and head are drawn for everyone; limbs, backpack, skirt and hair only for the students near the camera (XQ.cfg.npcDetail),
   packed into the first slots of their meshes each frame, so the colours are kept per student and written along with the matrices. */
const npcSkirtIdx = [], npcHairIdx = [];
npcs.forEach((n, i) => {
  const skin = SKIN[i % SKIN.length], skirt = i % 3 === 1;
  n.cShirt = new THREE.Color(SHIRTS[i % SHIRTS.length]); n.cSkin = new THREE.Color(skin); n.cLeg = new THREE.Color(skirt ? skin : PANTS[i % PANTS.length]);
  npcBodyIm.setColorAt(i, n.cShirt); npcHeadIm.setColorAt(i, n.cSkin);
  for (const s of [0, 1]){ npcSleeveIm.setColorAt(i * 2 + s, n.cShirt); npcForeIm.setColorAt(i * 2 + s, n.cSkin); npcLegIm.setColorAt(i * 2 + s, n.cLeg); }
  if (skirt){ npcSkirtIdx.push(i); n.cSkirt = new THREE.Color(SKIRTS[i % SKIRTS.length]); }
  if (skirt || i % 7 === 3){ npcHairIdx.push(i); n.cHair = new THREE.Color(HAIRS[i % HAIRS.length]); }
  n.walk = n.ph; n.umb = .05 + (i * 7 % 10) / 13;
});
const npcSkirtIm = npcIm(npcSkirtGeo, new THREE.MeshStandardMaterial({roughness:.85, side:THREE.DoubleSide}), npcSkirtIdx.length);
npcSkirtIdx.forEach((i, k) => npcSkirtIm.setColorAt(k, npcs[i].cSkirt));
const npcHairIm = npcIm(npcHairGeo, new THREE.MeshStandardMaterial({roughness:.75}), npcHairIdx.length);
npcHairIdx.forEach((i, k) => npcHairIm.setColorAt(k, npcs[i].cHair));
const npcUmbIm = npcIm(npcUmbGeo, new THREE.MeshStandardMaterial({roughness:.7, vertexColors:true, side:THREE.DoubleSide}), NPC_N);
npcs.forEach((n, i) => npcUmbIm.setColorAt(i, _col.set(UMBS[i % UMBS.length]))); npcUmbIm.count = 0;
function npcStep(n, dt){
  const p = n.path.p; let a = p[n.seg], b = p[n.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  n.t += n.dir * n.sp * (1 + wx.rain * .35) * dt / L;
  if (n.t > 1){ if (n.seg < p.length - 2){ n.seg++; n.t = 0; } else { n.t = 1; n.dir = -1; } }
  else if (n.t < 0){ if (n.seg > 0){ n.seg--; n.t = 1; } else { n.t = 0; n.dir = 1; } }
  a = p[n.seg]; b = p[n.seg + 1]; L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, off = n.path.off * n.side;
  n.x = a[0] + (b[0] - a[0]) * n.t - dz * off + n.ox; n.z = a[1] + (b[1] - a[1]) * n.t + dx * off + n.oz;
  n.h = Math.atan2(dx * n.dir, dz * n.dir);
}
const _nb = new THREE.Matrix4(), _nl = new THREE.Matrix4(), _nr = new THREE.Matrix4(), _nt = new THREE.Matrix4();
/* limb matrix = body · T(joint) · Rz(splay) · Rx(swing) */
function npcLimb(px, py, splay, swing){
  _nl.multiplyMatrices(_nb, _nt.makeTranslation(px, py, 0));
  if (splay) _nl.multiply(_nr.makeRotationZ(splay));
  return _nl.multiply(_nr.makeRotationX(swing));
}
function updateNPCs(dt, T){
  updateProps(dt, T); updateWeather(dt, T);
  const car = driving, csp = car ? Math.hypot(car.vx, car.vz) : 0, rain = wx.rain;
  for (const g of npcGroups){ g.next -= dt; if (g.next <= 0){ g.talk = (g.talk + 1) % 4; g.next = 1.5 + ((g.x * 13 + T * 7) % 3); } }
  let sk = 0, hk = 0, uk = 0, dk = 0;
  const cam = camera.position, dd = lodOverview ? 0 : XQ.cfg.npcDetail * XQ.cfg.npcDetail;
  for (let i = 0; i < NPC_N; i++){
    const n = npcs[i]; let y = 0, tiltX = 0, sc = 1, swing = 0, gest = 0, sway = 0;
    if (n.state === 'walk'){
      if (n.grp){
        const g = n.grp; n.x = g.x + Math.cos(n.ga) * g.r + n.ox; n.z = g.z + Math.sin(n.ga) * g.r + n.oz; n.h = Math.atan2(g.x - n.x, g.z - n.z);
        sway = Math.sin(T * 1.3 + n.ph) * .07;
        if (n.slot === g.talk){ gest = .5 + .5 * Math.sin(T * 5 + n.ph); y = Math.abs(Math.sin(T * 3 + n.ph)) * .015; }
      } else npcStep(n, dt);
      if (n.dodge > 0){
        n.dodge -= dt; n.ox += n.dvx * dt; n.oz += n.dvz * dt; y = Math.sin(Math.PI * Math.max(0, n.dodge) / .45) * .9;
      } else {
        n.ox *= Math.exp(-dt * .35); n.oz *= Math.exp(-dt * .35);
        if (!n.grp && !REDUCED){ n.walk += dt * n.sp * (1 + rain * .35) * 4.6; swing = Math.sin(n.walk) * .5; y = Math.abs(Math.cos(n.walk)) * .045; }
      }
      if (car && csp > 4 && n.dodge <= 0){
        const rx = n.x - car.x, rz = n.z - car.z, ux = car.vx / csp, uz = car.vz / csp, along = rx * ux + rz * uz, lat = rx * uz - rz * ux;
        if (along > 0 && along < 10 + csp * .25 && Math.abs(lat) < car.T.W / 2 + 1.6){
          const sgn = lat >= 0 ? 1 : -1; n.dodge = .45; n.dvx = uz * sgn * 9; n.dvz = -ux * sgn * 9;
          spawnPart('excl', n.x, 2.6, n.z, .8, {vy:1.5, life:.8, op:1, color:'#e74c3c'}); heat += .15; addStunt('擦身而过', 60);
        }
      }
    } else if (n.state === 'fall'){ y = n.y; tiltX = n.tilt; sc = Math.max(.01, 1 - n.tilt * .3); }
    else { sc = 0; }
    _cp.set(n.x, y + (bridgeY(n.x, n.z) || azY(n.x, n.z)), n.z); _cq.setFromAxisAngle(UP, n.h + sway);   /* students crossing the lake bridge walk on its deck, and up the A zone's stairs (js/09-azone.js) */
    if (tiltX){ _cq2.setFromAxisAngle(_ax.set(n.tdz, 0, -n.tdx).normalize(), tiltX); _cq.premultiply(_cq2); }
    _cs.setScalar(sc); _nb.compose(_cp, _cq, _cs);
    npcBodyIm.setMatrixAt(i, _nb); npcHeadIm.setMatrixAt(i, _nb);
    const umb = sc > 0 && n.state === 'walk' && rain > n.umb;
    if (sc > 0 && (n.x - cam.x) * (n.x - cam.x) + (n.z - cam.z) * (n.z - cam.z) < dd){
      npcGearIm.setMatrixAt(dk, _nb);
      for (const s of [-1, 1]){
        const j = dk * 2 + (s > 0 ? 1 : 0);
        npcLegIm.setMatrixAt(j, npcLimb(s * .09, .92, 0, swing * s)); npcLegIm.setColorAt(j, n.cLeg);
        /* the right arm holds the umbrella up, a talker gestures with the left, otherwise arms swing against the legs */
        const arm = s > 0 && umb ? -1.2 : s < 0 && gest ? -.5 - gest * .9 : -swing * s * .8;
        const m = npcLimb(s * .215, 1.39, s * (s > 0 && umb ? .03 : .1), arm);
        npcSleeveIm.setMatrixAt(j, m); npcSleeveIm.setColorAt(j, n.cShirt); npcForeIm.setMatrixAt(j, m); npcForeIm.setColorAt(j, n.cSkin);
      }
      if (n.cSkirt){ npcSkirtIm.setMatrixAt(sk, _nb); npcSkirtIm.setColorAt(sk++, n.cSkirt); }
      if (n.cHair){ npcHairIm.setMatrixAt(hk, _nb); npcHairIm.setColorAt(hk++, n.cHair); }
      dk++;
    }
    if (umb){ npcUmbIm.setMatrixAt(uk, _nb); npcUmbIm.setColorAt(uk++, _col.set(UMBS[i % UMBS.length])); }
  }
  /* only open umbrellas, and the limbs and gear of nearby students, are drawn */
  npcUmbIm.count = uk; npcGearIm.count = dk; npcLegIm.count = npcSleeveIm.count = npcForeIm.count = dk * 2; npcSkirtIm.count = sk; npcHairIm.count = hk;
  for (const im of [npcBodyIm, npcHeadIm, npcGearIm, npcLegIm, npcSleeveIm, npcForeIm, npcSkirtIm, npcHairIm, npcUmbIm]){ im.instanceMatrix.needsUpdate = true; if (im.instanceColor && im !== npcBodyIm && im !== npcHeadIm) im.instanceColor.needsUpdate = true; }
}
