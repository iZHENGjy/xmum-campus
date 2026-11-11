/* XMUM 校园漫游 · 后山：山顶的观景亭、上山的石阶步道、山脊上通往猴山的土路、山坡上的树林。
   山的形状在 js/12-terrain.js（HILL / hillY）。这里的东西都贴着地面（groundAt / terrainY）摆，所以地形再改也会跟着走。
   黑洞模式里校园是平的（TG.flat）：亭子、步道和这些树都收起来，亭子的柱子也不再挡路。 */
'use strict';
const HL = {meshes:[], cols:[], flat:false, Y0:0, x:HILL.sx, z:HILL.sz, rot:0, half:4.8, top:.7, stepD:1.6};
HL.Y0 = terrainY(HL.x, HL.z);
/* the pavilion's own frame: x across, z toward the front (south, where the stone stair comes up) */
const hlW = (lx, lz) => [HL.x + lx * Math.cos(HL.rot) + lz * Math.sin(HL.rot), HL.z - lx * Math.sin(HL.rot) + lz * Math.cos(HL.rot)];
const hlInfo = {name:'后山观景亭', tag:'景观', spawn:[HL.x, HL.z + 9, Math.PI],
  desc:'校园西北角的后山，满山是树林和油棕，山顶有一座两层檐的红顶凉亭。从山脚的石阶步道走上去大约 26 米高，能看到 LY 宿舍楼、音乐岛和整片湖；山脊往东一直通到猴山。'};

/* ---------- the routes: a stone stair up from the forest road, and a dirt track along the ridge to 猴山 ---------- */
/* the stair starts just off the forest road's pavement (the road runs from (-390, -116.4) to (-306, -68.4), 4.8 m half width with the pavement)
   and ends square on the pavilion's front steps, coming straight up from the south */
const HL_STAIR = [[-352.4, -100.9], [-366, -112], [-357, -124], [-336, -128], [-318, -133], [-333, -142], [-318, -150], [-306, -151.6], [-299.6, -152.7], [-296.6, -154.9], [-296, -157.6]];
const HL_ROAD = {a:[-390, -116.4], b:[-306, -68.4]};
const HL_RIDGE = [[-283, -165], [-262, -170], [-240, -168], [-222, -173], [-209, -176]];
function hlCurve(pts, step){
  const cv = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), n = Math.ceil(cv.getLength() / step);
  return cv.getSpacedPoints(n).map(v => [v.x, v.z]);
}
HL.stair = hlCurve(HL_STAIR, .5); HL.ridge = hlCurve(HL_RIDGE, .75);
const hlNear = (x, z, line, w) => { for (let i = 0; i < line.length - 1; i += 2) if (segDist(x, z, line[i], line[Math.min(line.length - 1, i + 2)]) < w) return true; return false; };

/* ---------- trees on the slopes (the old plan had a lawn here, which no tree of js/10-world.js grows on) ---------- */
(function(){
  const rr = mkRng(9071), trees = [], palms = [];
  for (let k = 0, n = 0; n < Math.min(TOUCH ? 120 : 150, XQ.pick(90, 130, 150)) && k < 4000; k++){
    const x = -380 + rr() * 200, z = -232 + rr() * 150, h = terrainY(x, z);
    if (h < 2.5 || !inPoly(x, z, FOREST) || hillTopD(x, z) < 8) continue;
    if (hlNear(x, z, HL.stair, 4) || hlNear(x, z, HL.ridge, 3.5) || Math.hypot(x - HILL.mx, z - HILL.mz) < 30 || hitsBuilding(x, z, 2.5) || onRoad(x, z, 2.5)) continue;
    /* oil palms low down on the south and west, jungle trees everywhere else */
    (rr() < .22 && h < 16 ? palms : trees).push({x, z, r:rr() * 6.28, s:(1.05 + rr() * .45) * (.85 + rr() * .35)}); n++;
  }
  const set = {kind:'tree', spots:trees, ims:[instanced(stumpGeo, bark, trees, LOD_TREE(stumpFarGeo)), instanced(canopyGeo, M('#4f8f3c', {flatShading:true, vertexColors:true}), trees, LOD_TREE(canopyFarGeo))]};
  const pset = {kind:'tree', spots:palms, ims:[instanced(trunkGeo, M('#ffffff', {vertexColors:true, roughness:.95}), palms, LOD_PALM(trunkFarGeo)), instanced(crownGeo, M('#ffffff', {side:THREE.DoubleSide, roughness:.8, vertexColors:true}), palms, LOD_PALM(crownFarGeo))]};
  const c = new THREE.Color();
  trees.forEach((o, i) => { const v = .7 + rr() * .3, hh = rr() - .5; set.ims[1].setColorAt(i, c.setRGB(v * (1 + hh * .3), v, v * (1 - hh * .25))); });
  palms.forEach((o, i) => { const v = .78 + rr() * .2; pset.ims[1].setColorAt(i, c.setRGB(v, v, v * .92)); });
  /* js/13-outskirts.js lifts them onto the hill on its first frame (and drops them back to the ground in black-hole mode) */
  knockSets.push(set, pset);
})();

/* ---------- the paths, draped on the ground (fine samples, so they follow the 12 m triangles of the hill without cutting through) ---------- */
(function(){
  const strip = (line, hw, tread, edge, stepEvery) => {
    const pos = [], col = [], idx = [], c = new THREE.Color();
    let run = 0;
    for (let i = 0; i < line.length; i++){
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, [x, z] = line[i];
      if (i) run += Math.hypot(x - line[i - 1][0], z - line[i - 1][1]);
      const g0 = groundAt(x, z), g1 = i ? groundAt(line[i - 1][0], line[i - 1][1]) : g0, steep = Math.abs(g0 - g1) / Math.max(.2, Math.hypot(x - (i ? line[i - 1][0] : x), z - (i ? line[i - 1][1] : z))) > .1;
      /* on the steep parts a darker band at every ~1.1 m reads as the edge of a step (one sample in, whatever the spacing) */
      const nose = stepEvery && steep && i && Math.floor(run / stepEvery) !== Math.floor((run - Math.hypot(x - line[i - 1][0], z - line[i - 1][1])) / stepEvery);
      for (const o of [-hw - .35, -hw, 0, hw, hw + .35]){
        const px = x + nx * o, pz = z + nz * o, rim = Math.abs(o) > hw;
        pos.push(px, groundAt(px, pz) + (rim ? .03 : .1), pz);
        c.set(rim ? edge : nose ? edge : tread).multiplyScalar(.94 + hash2(i, (o * 10) | 0) * .1); col.push(c.r, c.g, c.b);
      }
      if (i) for (let k = 0; k < 4; k++){ const p = (i - 1) * 5 + k, q = i * 5 + k; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M('#ffffff', {vertexColors:true, roughness:.95, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-16})); m.receiveShadow = true; scene.add(m); HL.meshes.push(m); return m;
  };
  strip(HL.stair, 1.1, '#a49c8e', '#6f685d', 1.1).userData.info = hlInfo;   /* weathered granite: pale, but not paper white in the sun */
  strip(HL.ridge, .9, '#927a55', '#6f5f45', 0);
  /* stone lanterns up the stair, and a sign at its foot */
  const parts = [], lamps = [];
  for (let k = 14; k < HL.stair.length - 6; k += 34){
    const [x, z] = HL.stair[k], [x2, z2] = HL.stair[k + 1], l = Math.hypot(x2 - x, z2 - z) || 1, s = (k / 34) % 2 ? 1 : -1, px = x - (z2 - z) / l * 1.9 * s, pz = z + (x2 - x) / l * 1.9 * s, y = groundAt(px, pz);
    tbox(parts, .5, .25, .5, px, y + .12, pz, '#9a9488'); tbox(parts, .22, .7, .22, px, y + .6, pz, '#a8a294'); tbox(parts, .46, .1, .46, px, y + 1.32, pz, '#8f897d');
    parts.push(geoTint(new THREE.ConeGeometry(.42, .3, 4).rotateY(Math.PI / 4).translate(px, y + 1.52, pz), '#7f796e')); lamps.push(new THREE.BoxGeometry(.3, .32, .3).translate(px, y + 1.11, pz));
  }
  /* the sign at the foot: 2.4 m along the road from where the stair leaves it, on the verge (not on the road), turned to face the road */
  const RD = (() => { const dx = HL_ROAD.b[0] - HL_ROAD.a[0], dz = HL_ROAD.b[1] - HL_ROAD.a[1], l = Math.hypot(dx, dz); return {ux:dx / l, uz:dz / l}; })();
  const SG = {x:HL.stair[0][0] + RD.ux * 2.4 + RD.uz * .5, z:HL.stair[0][1] + RD.uz * 2.4 - RD.ux * .5, ry:Math.atan2(-RD.uz, RD.ux)};
  { const y = groundAt(SG.x, SG.z), q = new THREE.Matrix4().makeRotationY(SG.ry).setPosition(SG.x, 0, SG.z);
    parts.push(geoTint(new THREE.BoxGeometry(.16, 2.2, .16).translate(0, y + 1.1, -.22).applyMatrix4(q), '#5b4630'), geoTint(new THREE.BoxGeometry(1.8, .7, .1).translate(0, y + 1.9, -.1).applyMatrix4(q), '#6e2614')); }
  const m = new THREE.Mesh(geoMerge(parts), decoMat); m.castShadow = m.receiveShadow = true; m.userData.info = hlInfo; pickables.push(m); scene.add(m); HL.meshes.push(m);
  const lm = new THREE.Mesh(geoMerge(lamps), bulbMat); scene.add(lm); HL.meshes.push(lm);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .62), plaqueMat('后山步道')); const [sx, sz] = HL.stair[0];
  sign.position.set(SG.x, groundAt(SG.x, SG.z) + 1.9, SG.z); sign.rotation.y = SG.ry; sign.translateZ(-.04); scene.add(sign); HL.meshes.push(sign);
  addLabel('上山步道', sx, groundAt(sx, sz) + 6, sz, true);
})();

/* ---------- the pavilion: a stone platform, four red columns with benches between them, a painted beam, and two tiers of tiled roof ---------- */
(function(){
  const parts = [], Y = HL.Y0, T = HL.top, h = HL.half, RED = '#a3301f', RED2 = '#7e2416', STONE = '#bdb5a6', STONE2 = '#a59d8e';
  const at = (lx, y, lz) => { const [x, z] = hlW(lx, lz); return [x, y, z]; };
  const g = new THREE.Group(); g.position.set(HL.x, Y, HL.z); g.rotation.y = HL.rot; scene.add(g);
  /* platform with a deep skirt (the slope never shows under it), a kerb, and three steps down the front */
  tbox(parts, h * 2, T + 2.5, h * 2, 0, T / 2 - 1.25, 0, STONE2); tbox(parts, h * 2 + .3, .16, h * 2 + .3, 0, T - .02, 0, STONE);
  /* the floor inside the kerb: darker flagstones in a 1.2 m grid (the kerb alone read as one flat white slab in the sun) */
  tbox(parts, h * 2 - .5, .02, h * 2 - .5, 0, T + .065, 0, '#968f82');
  for (let k = -3; k <= 3; k++){ tbox(parts, h * 2 - .5, .025, .05, 0, T + .07, k * 1.2, '#7a7468'); tbox(parts, .05, .025, h * 2 - .5, k * 1.2, T + .07, 0, '#7a7468'); }
  for (let k = 0; k < 3; k++){ const d = HL.stepD * (k + 1) / 3, y = T * (1 - (k + 1) / 3); tbox(parts, 3.4, y + .3, d, 0, (y - .3) / 2, h + d / 2 - .02, k % 2 ? STONE : STONE2); }
  /* columns on round bases; benches with a leaning back (美人靠) on the three closed sides */
  const C = 3.55, CH = 3.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    parts.push(geoTint(new THREE.CylinderGeometry(.42, .46, .3, 10).translate(sx * C, T + .15, sz * C), STONE2), geoTint(new THREE.CylinderGeometry(.24, .27, CH, 10).translate(sx * C, T + .3 + CH / 2, sz * C), RED));
  }
  for (const [ax, az, side] of [[1, 0, 'e'], [-1, 0, 'w'], [0, -1, 'n']]){
    const L = C * 2 - .5, alongX = !ax, ox = ax * C, oz = az * C;
    const bx = (w, hh, d, x, y, z, col) => alongX ? tbox(parts, w, hh, d, x, y, z, col) : tbox(parts, d, hh, w, z, y, x, col);
    const o = alongX ? oz : ox;
    bx(L, .1, .55, 0, T + .48, o - Math.sign(o) * .1, RED2); bx(L, .45, .12, 0, T + .23, o + Math.sign(o) * .1, RED2);
    for (let k = 0; k <= 8; k++) bx(.06, .55, .06, -L / 2 + L * k / 8, T + .78, o + Math.sign(o) * .22, RED);
    bx(L, .08, .14, 0, T + 1.06, o + Math.sign(o) * .3, RED2);
  }
  /* beams: a red architrave, a painted frieze (blue-green with a gold line) and brackets at each column */
  for (const s of [-1, 1]){
    tbox(parts, C * 2 + .5, .32, .3, 0, T + .3 + CH - .1, s * C, RED2); tbox(parts, .3, .32, C * 2 + .5, s * C, T + .3 + CH - .1, 0, RED2);
    tbox(parts, C * 2 + .6, .42, .34, 0, T + .3 + CH + .27, s * C, '#2f6062'); tbox(parts, .34, .42, C * 2 + .6, s * C, T + .3 + CH + .27, 0, '#2f6062');
    tbox(parts, C * 2 + .62, .06, .36, 0, T + .3 + CH + .2, s * C, '#d6a63a'); tbox(parts, .36, .06, C * 2 + .62, s * C, T + .3 + CH + .2, 0, '#d6a63a');
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tbox(parts, .5, .35, .5, sx * C, T + .3 + CH + .55, sz * C, RED2);
  /* ceiling and the little drum between the two roofs */
  const yR1 = T + .3 + CH + .72;
  tbox(parts, C * 2 + .4, .12, C * 2 + .4, 0, yR1 - .05, 0, '#6b3a22');
  tbox(parts, 4.4, 1.3, 4.4, 0, yR1 + 1.45, 0, RED2); tbox(parts, 4.56, .14, 4.56, 0, yR1 + 2.02, 0, '#2f6062');
  const deco = new THREE.Mesh(geoMerge(parts), decoMat); deco.castShadow = deco.receiveShadow = true;
  g.add(deco);
  /* two tiers of roof: a lower skirt with a flat top round the drum (重檐), and a hipped crown with a gilded pearl */
  const roofs = roofParts(C * 2 + .3, C * 2 + .3, 1.35, 1.5, 0, yR1, 0, null, .6);
  roofParts(4.4, 4.4, 2.3, 1.15, 0, yR1 + 2.1, 0, roofs);
  const rms = roofMeshes(roofs, roofMat('#b4502b'), g);
  const yP = yR1 + 2.1 + 2.3;
  const pearl = new THREE.Mesh(geoMerge([new THREE.CylinderGeometry(.22, .34, .3, 10).translate(0, yP + .3, 0), new THREE.SphereGeometry(.34, 14, 10).translate(0, yP + .72, 0), new THREE.ConeGeometry(.1, .5, 8).translate(0, yP + 1.2, 0)]), goldMat);
  g.add(pearl);
  /* a lantern under the ceiling, lit with the street lamps */
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .55, 8).translate(0, yR1 - .7, 0), bulbMat); g.add(lan);
  [deco, pearl, ...rms].forEach(m => { m.userData.info = hlInfo; pickables.push(m); });
  HL.meshes.push(g);
  /* the four columns and the three bench sides stop you; the front is open */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){ const [x, z] = hlW(sx * C, sz * C); HL.cols.push(addCircle(x, z, .3)); }
  { let [x, z] = hlW(C, 0); HL.cols.push(addBox(x, z, .3, C - .25, HL.rot)); [x, z] = hlW(-C, 0); HL.cols.push(addBox(x, z, .3, C - .25, HL.rot)); [x, z] = hlW(0, -C); HL.cols.push(addBox(x, z, C - .25, .3, HL.rot)); }
  addLabel('后山观景亭', HL.x, Y + yP + 4, HL.z, true);
  if (!hlInfo._reg){ hlInfo._reg = true; infos.push(hlInfo); }
})();

/* the platform and its steps are part of the ground (feet, wheels, cameras) */
function hlFloor(x, z){
  if (HL.flat) return 0;
  const dx = x - HL.x, dz = z - HL.z, lx = dx * Math.cos(HL.rot) - dz * Math.sin(HL.rot), lz = dx * Math.sin(HL.rot) + dz * Math.cos(HL.rot);
  if (Math.abs(lx) > HL.half || lz < -HL.half || lz > HL.half + HL.stepD) return 0;
  if (lz <= HL.half) return HL.Y0 + HL.top;
  if (Math.abs(lx) > 1.7) return 0;
  return HL.Y0 + HL.top * (1 - Math.ceil((lz - HL.half) / HL.stepD * 3 - .001) / 3) + .001;
}
{ const base = groundAt; groundAt = function(x, z){ return hlFloor(x, z) || base(x, z); }; }

/* black-hole mode: the campus is flat, so the hill's things go away (checked once a frame, cheap) */
{ const base = updateOutskirts;
  updateOutskirts = function(dt, T){
    base(dt, T);
    /* first frame: nothing grows or stands on the summit or the paths (including what later files put out) */
    if (!HL.cleared){ HL.cleared = true;
      for (const set of knockSets) set.spots.forEach((o, i) => {
        if (!o.hidden && (hillTopD(o.x, o.z) < 6 || hlNear(o.x, o.z, HL.stair, 2.6) || hlNear(o.x, o.z, HL.ridge, 2.2))){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
      });
    }
    if (HL.flat !== TG.flat){ HL.flat = TG.flat; for (const m of HL.meshes) m.visible = !HL.flat; for (const c of HL.cols) c.dead = HL.flat; }
  };
}
