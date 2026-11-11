/* XMUM 校园漫游 · 陈华春音乐厅（Tan Hua Choon Auditorium），A1 西边，607 个座位。
   照校园 360° 全景还原：米白色石材，正面是一道外凸的弧形大立面，顶上一圈厚重的弧形檐口；六根粗大的方柱，正门两边两根圆柱，
   柱子之间是深蓝色的竖条玻璃窗，正门上方竖写金色大字「陈华春音乐厅」，台阶上摆一排盆栽，门前是一大片灰色石砖广场。
   广场留给豪车展台（js/94-showcase.js）：AUDI_PLAZA 给出它的位置、朝向和范围，那边按这个摆就行。
   在 js/10-world.js 里先放了一个跟旧礼堂一样大的占位碰撞框（AUDI_GHOST），树和小物件按它摆好以后，这里换成真的。 */
'use strict';
const AUDI = (() => {
  const [x, z] = P(815, 680), rot = 18 * D2R;   /* same spot and heading as the old 礼堂: the front faces the road along the south hedge */
  return {x, z, rot, R:55, ZF:12.5, W:21, BACK:-22, HF:21};
})();
/* local (x across the front, z out of the front) -> world */
const audiW = (lx, lz) => [AUDI.x + lx * Math.cos(AUDI.rot) + lz * Math.sin(AUDI.rot), AUDI.z - lx * Math.sin(AUDI.rot) + lz * Math.cos(AUDI.rot)];
/* the plaza in front, in the building's frame: from the steps to the road (its east edge stays clear of the A-row podium).
   The road runs past at an angle (its pavement edge is z ≈ 61.6 + .69 x here): the south-west corner is cut along it so the setts
   stop at the pavement instead of lying over it, and an 8 m walk on the door's axis carries the plaza (and the showcase's red carpet) out to it. */
const AUDI_PLAZA = (() => {
  const kerb = x => 61.6 + .6926 * x;
  const loc = [[-25, 7], [21.5, 7], [21.5, 30], [17.5, 51], [4, 51], [4, kerb(4)], [-4, kerb(-4)], [-4, 51], [-15.6, 51], [-25, 44.5]];
  const [cx, cz] = audiW(-3.5, 33);
  /* x, z, rot: centre and heading of the open part (local +z toward the road), hw / hd: half width and depth of the clear flat area */
  return {x:cx, z:cz, rot:AUDI.rot, hw:21, hd:17, poly:loc.map(([a, b]) => audiW(a, b))};
})();
const audiInfo = {name:'陈华春音乐厅', tag:'礼堂', floors:4, spawn:[...audiW(0, 30), AUDI.rot + Math.PI],
  desc:'陈华春音乐厅（Tan Hua Choon Auditorium），A1 西边那栋米白色石材的大楼，有 607 个座位。毕业典礼、学术会议、讲座和文艺演出都在这里办。' +
    '正面是一道弧形的大立面：六根粗大的方柱、正门两边两根圆柱，柱间是深蓝色的竖条玻璃窗，正门上方竖写着金色的「陈华春音乐厅」。门前是一大片灰色石砖广场。'};

(function(){
  const {R, ZF, W, BACK, HF} = AUDI, C0 = ZF - R, TH = Math.asin(W / R);
  const st = newStruct(audiInfo), prev = curStruct; curStruct = st;
  const g = new THREE.Group(); g.position.set(AUDI.x, 0, AUDI.z); g.rotation.y = AUDI.rot; scene.add(g); regGroup(st, g);
  /* ---- stone: one texture of coursed ashlar (0.6 m courses, 1.2 m blocks) mapped in metres on every face ---- */
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c2 = cv.getContext('2d'), rr = mkRng(6071);
  c2.fillStyle = '#f6ede0'; c2.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let b = -1; b < 3; b++){
    const x0 = b * 128 + (r % 2) * 64, v = 238 + rr() * 16 | 0; c2.fillStyle = `rgb(${v},${v - 8},${v - 22})`; c2.fillRect(x0 + 2, r * 64 + 2, 124, 60);
  }
  c2.fillStyle = 'rgba(176,166,150,.7)'; for (let r = 0; r < 4; r++){ c2.fillRect(0, r * 64, 256, 2); for (let b = -1; b < 3; b++) c2.fillRect(b * 128 + (r % 2) * 64, r * 64, 2, 64); }
  const stoneTex = new THREE.CanvasTexture(cv); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.anisotropy = ANISO;
  const stoneMat = regWet(new THREE.MeshStandardMaterial({color:'#ffffff', map:stoneTex, roughness:.78, vertexColors:true}), .4);
  const glassMat = new THREE.MeshStandardMaterial({color:'#2b4470', roughness:.22, metalness:.3, emissive:'#ffcf8f', emissiveIntensity:0});
  AUDI.glass = glassMat;
  const stone = [], deco = [], glass = [];
  /* planar UVs in metres: walls take (along, up), level faces take (x, z) */
  const uvMetres = geo => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++){
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ay > .7){ uv[i * 2] = p.getX(i) / 2.4; uv[i * 2 + 1] = p.getZ(i) / 2.4; }
      else { uv[i * 2] = (ax > az ? p.getZ(i) : p.getX(i)) / 2.4; uv[i * 2 + 1] = p.getY(i) / 2.4; }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
  };
  const sTint = (geo, col) => geoTint(geo.index ? geo.toNonIndexed() : geo, col || '#ffffff');
  /* a point on the front at angle t (0 = middle), and the facing there */
  const arcAt = (t, out) => [(R + out) * Math.sin(t), C0 + (R + out) * Math.cos(t)];
  /* plan shape: the front arc (pushed out by `out`) and a straight back, extruded from y0 to y1 */
  const slab = (out, back, side, y0, y1, col) => {
    const t1 = Math.asin(Math.min(.999, side / (R + out))), s = new THREE.Shape(), N = 40;
    for (let i = 0; i <= N; i++){ const t = -t1 + 2 * t1 * i / N, [x, z] = arcAt(t, out); i ? s.lineTo(x, -z) : s.moveTo(x, -z); }
    s.lineTo(side, -back); s.lineTo(-side, -back); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {depth:y1 - y0, bevelEnabled:false, curveSegments:4}); geo.rotateX(-Math.PI / 2); geo.translate(0, y0, 0);
    return sTint(smoothNormals(geo, 25), col);
  };
  /* a box standing on the front at angle t, pushed out by `out`, turned to face out */
  const onArc = (list, t, out, w, h, d, y, col) => { const [x, z] = arcAt(t, out); list.push(sTint(new THREE.BoxGeometry(w, h, d).rotateY(t).translate(x, y, z), col)); };
  const tAt = x => Math.asin(x / R);
  /* body, the heavy cornice (a fascia, a deep slab, a thin cap), a parapet round the flat roof */
  stone.push(slab(0, BACK, W, 0, HF, '#f2ede3'));
  stone.push(slab(1.1, BACK - .6, W + .6, HF - .9, HF, '#ebe5d9'), slab(2.2, BACK - 1.4, W + 1.4, HF, HF + 1.25, '#f4efe6'), slab(2.5, BACK - 1.6, W + 1.6, HF + 1.25, HF + 1.5, '#d9d2c4'));
  stone.push(slab(1.6, BACK - 1, W + 1, HF + 1.5, HF + 2.6, '#ece6da'));
  /* a stage house rising at the back */
  stone.push(sTint(new THREE.BoxGeometry(W * 1.3, 6, 13).translate(0, HF + 3, BACK + 8), '#ece6da'));
  /* plinth and two steps along the front */
  stone.push(slab(3.8, BACK - .3, W + 3.6, 0, .18, '#d3ccbe'), slab(2.6, BACK - .3, W + 2.4, .18, .36, '#ddd6c8'), slab(1.4, BACK - .2, W + 1.2, .36, .5, '#e4ded1'));
  /* six square pillars: a stepped base, the shaft, a capital under the cornice */
  for (const px of [-18.6, -12.3, -7.3, 7.3, 12.3, 18.6]){
    const t = tAt(px);
    onArc(stone, t, 1.3, 4.3, 1.1, 3.9, .5 + .55, '#e2dbcd'); onArc(stone, t, 1.3, 3.9, .4, 3.6, 1.65 + .2, '#ebe5d9');
    /* the shaft is battered like the real piers: wider at the foot (3.7 x 3.35 m), narrowing to 3.25 x 2.95 m under the capital */
    { const H = HF - 2.9, [x, z] = arcAt(t, 1.3), fr = new THREE.CylinderGeometry(Math.SQRT2 * .88, Math.SQRT2, H, 4, 1).rotateY(Math.PI / 4).toNonIndexed();
      fr.computeVertexNormals(); stone.push(geoTint(fr.scale(1.85, 1, 1.675).rotateY(t).translate(x, 1.85 + H / 2, z), '#f0ebe1')); }
    onArc(stone, t, 1.3, 3.8, .55, 3.5, HF - .85, '#e6dfd2');
  }
  /* glass between the pillars: tall dark-blue strips, broken by two stone bands */
  for (const [a, b] of [[-17, -14], [-10.6, -9], [9, 10.6], [14, 17]]){
    const t = tAt((a + b) / 2), w = b - a - .2;
    for (const [y0, y1] of [[1.3, 7.2], [7.9, 12.6], [13.3, HF - 1.4]]) onArc(glass, t, .06, w, y1 - y0, .12, (y0 + y1) / 2, '#ffffff');
    for (const yb of [7.55, 12.95]) onArc(stone, t, .1, w + .2, .7, .5, yb, '#e3dccf');
  }
  /* the middle bay: glazing round the lobby behind the round columns, a lighter recessed panel above the doors with the name on it */
  onArc(glass, 0, .06, 11, 6.6, .12, .55 + 3.3, '#ffffff');
  onArc(stone, 0, .08, 11.2, .55, .3, 7.15, '#e3dccf');
  onArc(deco, 0, .1, 5.4, HF - 8.4, .14, 7.4 + (HF - 8.4) / 2, '#f3efe6');
  for (let k = -2; k <= 2; k++) onArc(deco, tAt(k * 1.05), .2, .1, 6.1, .12, .55 + 3.05, '#3a3f45');   /* door mullions */
  onArc(deco, 0, .2, 5.4, .14, .14, 3.2, '#3a3f45');
  /* two round columns either side of the doors */
  for (const px of [-3.9, 3.9]){
    const [cx, cz] = arcAt(tAt(px), 1.9);
    stone.push(sTint(new THREE.CylinderGeometry(1.5, 1.6, 1, 20).translate(cx, .5 + .5, cz), '#e2dbcd'), sTint(new THREE.CylinderGeometry(1.18, 1.25, HF - 2.6, 20).translate(cx, 1.5 + (HF - 2.6) / 2, cz), '#f0ebe1'),
      sTint(new THREE.CylinderGeometry(1.5, 1.25, .6, 20).translate(cx, HF - .8, cz), '#e6dfd2'), sTint(new THREE.CylinderGeometry(1.55, 1.55, .3, 20).translate(cx, HF - .35, cz), '#e6dfd2'));
  }
  /* potted palms along the top step, leaving the doors clear */
  const rp = mkRng(3307);
  for (let k = 0; k < 18; k++){
    const px = -19.5 + 39 * k / 17; if (Math.abs(px) < 2.8) continue;
    const t = tAt(px), [x, zz] = arcAt(t, 3 + (Math.abs(px) < 6 ? .4 : 0)), pot = rp() < .25 ? '#25407a' : rp() < .5 ? '#2f5b3a' : '#a85a35';
    deco.push(geoTint(new THREE.CylinderGeometry(.36, .27, .62, 10).translate(x, .5 + .31, zz).toNonIndexed(), pot));
    for (let j = 0; j < 6; j++){ const a = j / 6 * Math.PI * 2 + rp(), lean = .25 + rp() * .25, L = .9 + rp() * .6;
      deco.push(geoTint(new THREE.ConeGeometry(.09, L, 4).translate(0, L / 2, 0).rotateZ(lean).rotateY(a).translate(x, .5 + .6, zz).toNonIndexed(), j % 2 ? '#3d7a34' : '#4d8c3c')); }
  }
  /* down-lights under the cornice, lit at night with the street lamps */
  const lights = [];
  for (const px of [-15.5, -9.8, -5.6, 0, 5.6, 9.8, 15.5]){ const [x, zz] = arcAt(tAt(px), 1.6); lights.push(new THREE.BoxGeometry(.5, .14, .5).translate(x, HF - .95, zz)); }
  const mk = (geo, mat, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow !== false; m.receiveShadow = true; g.add(m); m.userData.info = audiInfo; pickables.push(m); return m; };
  mk(uvMetres(geoMergeUV(stone)), stoneMat);
  mk(geoMerge(deco), decoMat); mk(geoMerge(glass), glassMat, false); mk(geoMerge(lights), bulbMat, false);
  /* the name, written top to bottom in gilt on the panel over the doors */
  { const tc = document.createElement('canvas'); tc.width = 128; tc.height = 768; const t2 = tc.getContext('2d'), tex = new THREE.CanvasTexture(tc); tex.anisotropy = ANISO;
    const paint = () => { t2.clearRect(0, 0, 128, 768); t2.textAlign = 'center'; t2.textBaseline = 'middle'; t2.font = '700 96px "Noto Serif SC","Songti SC","STKaiti",serif';
      '陈华春音乐厅'.split('').forEach((ch, i) => { const y = 64 + i * 128; t2.fillStyle = 'rgba(90,60,20,.55)'; t2.fillText(ch, 67, y + 3); t2.fillStyle = '#d9ad4f'; t2.fillText(ch, 64, y); }); tex.needsUpdate = true; };
    paint(); document.fonts && document.fonts.ready.then(paint);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 9), new THREE.MeshStandardMaterial({map:tex, transparent:true, metalness:.25, roughness:.4, depthWrite:false, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.3}));
    const [x, zz] = arcAt(0, .2); name.position.set(x, 14.3, zz); g.add(name); name.userData.info = audiInfo; pickables.push(name); }
  /* colliders: the hall, and the row of pillars and steps in front */
  const box = (lx, lz, hx, hz) => { const [x, zz] = audiW(lx, lz); return addBox(x, zz, hx, hz, AUDI.rot); };
  box(0, (BACK + ZF) / 2 - 1, W + .8, (ZF - BACK) / 2 + .2); box(0, ZF + 1.6, 14.5, 1.6);
  addFp({t:0, x:audiW(0, (BACK + ZF) / 2)[0], z:audiW(0, (BACK + ZF) / 2)[1], w:W * 2, d:ZF - BACK, rot:AUDI.rot});
  Object.assign(audiInfo, {wx:AUDI.x, wz:AUDI.z, wd:ZF - BACK, wrot:AUDI.rot}); infos.push(audiInfo); audiInfo._reg = true;
  addLabel('陈华春音乐厅', AUDI.x, HF + 9, AUDI.z, true);
  curStruct = prev;
  /* the stand-in from js/10-world.js goes */
  { const i = colliders.indexOf(AUDI_GHOST); if (i >= 0) colliders.splice(i, 1); }
})();

/* ---------- the plaza: grey granite setts from the steps to the road ---------- */
(function(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'), rr = mkRng(4417);
  g.fillStyle = '#5a5855'; g.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) for (let k = 0; k < 17; k++){
    const v = 112 + rr() * 42 | 0, x = k * 16 - (r % 2) * 8 + rr() * 2, y = r * 16 + rr() * 2;
    g.fillStyle = `rgb(${v},${v - 2},${v - 6})`; g.beginPath(); g.moveTo(x + 2, y + 1); g.lineTo(x + 14, y + 1.5); g.lineTo(x + 14.5, y + 14); g.lineTo(x + 1.5, y + 14.5); g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / 2.6, 1 / 2.6); tex.anisotropy = ANISO;
  const mat = regWet(new THREE.MeshStandardMaterial({map:tex, roughness:.85, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-40, side:THREE.DoubleSide}), .3);
  const pl = flatPoly(AUDI_PLAZA.poly, mat, .06, false); pl.mesh.userData.info = audiInfo; pickables.push(pl.mesh);
  /* a pale granite band along the foot of the steps */
  const band = [], {R, ZF} = AUDI, C0 = ZF - R;
  for (let i = 0; i < 24; i++){
    const t0 = -.43 + .86 * i / 24, t1 = -.43 + .86 * (i + 1) / 24, p = (t, r) => audiW(r * Math.sin(t), C0 + r * Math.cos(t));
    const [a, b2, c, e] = [p(t0, R + 3.8), p(t0, R + 5.4), p(t1, R + 5.4), p(t1, R + 3.8)];
    band.push(quadGeo([a[0], .075, a[1]], [b2[0], .075, b2[1]], [c[0], .075, c[1]], [e[0], .075, e[1]], '#a9a397'));
  }
  const bm = new THREE.Mesh(geoMerge(band), M('#ffffff', {vertexColors:true, roughness:.8, polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48, side:THREE.DoubleSide})); bm.receiveShadow = true; scene.add(bm);
  /* nothing stands on the plaza or in the hall: trees, palms and lamps from the old lawn and the promenade go */
  const inHall = (x, z) => { const dx = x - AUDI.x, dz = z - AUDI.z, lx = dx * Math.cos(AUDI.rot) - dz * Math.sin(AUDI.rot), lz = dx * Math.sin(AUDI.rot) + dz * Math.cos(AUDI.rot); return Math.abs(lx) < AUDI.W + 4 && lz > AUDI.BACK - 4 && lz < AUDI.ZF + 6; };
  /* on the first frame, so the benches and bins that js/60-details.js puts out later go too */
  let done = false; const base = updateOutskirts;
  updateOutskirts = function(dt, T){
    base(dt, T);
    if (done) return; done = true;
    for (const set of knockSets) set.spots.forEach((o, i) => {
      if (!o.hidden && (inPoly(o.x, o.z, AUDI_PLAZA.poly) || inHall(o.x, o.z))){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
    });
  };
})();

/* the tall windows glow a little after dark */
{ const base = applyTime; applyTime = function(k){ base(k); AUDI.glass.emissiveIntensity = Math.min(.35, cur.win * .3); }; }
