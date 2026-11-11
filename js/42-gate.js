/* XMUM 校园漫游 · 大门和门前：铁艺大门、罗马柱门廊和门卫亭、IN / OUT 牌和锥桶，门外校碑小广场的边界；草坪灯；A 区台地（azBuild，js/09-azone.js）。
   加载顺序在 js/40-vehicles.js 之后：这里的碰撞盒是在树和小物件都摆完以后才加的，所以不会挪动它们的位置；
   站在新建筑里、台阶上、草坡上的树和路灯在文件最后清掉。
   夜里的发光都是自发光材质和贴片，没有真实光源；js/18-gfx.js 每帧调 gateNight(lamp)。 */
'use strict';
lateColsSwap();   /* the scenery is placed: buildings that were turned or opened up get their real colliders now (js/00-core.js) */
const gateGlassMat = new THREE.MeshStandardMaterial({color:'#dbe6ec', emissive:'#f2f7ff', emissiveIntensity:0, roughness:.25});   /* booth windows, porch down-lights: white light after dark */
const gateLampMat = new THREE.MeshStandardMaterial({color:'#fff3da', emissive:'#ffd08a', emissiveIntensity:0});                    /* lawn bollards, stair lanterns */
function gateNight(lamp){
  if (!gateCleared) gateClearRun();
  const k = Math.min(1.4, lamp);
  gateGlassMat.emissiveIntensity = .12 + k * 1.15; gateLampMat.emissiveIntensity = k * 1.1;
}
const gatePools = [];   /* [x, y, z, radius]: pools of light on the ground, one instanced mesh, shown with the lamp pools */
const gateClear = [];   /* [x0, z0, x1, z1]: trees, lamps and benches inside these are removed at the end */

/* ---------- the lawn below the A zone's stairs: two rows of low bollards following the curve of the promenade; the statue's round stepped base ---------- */
(function(){
  const A = LAWN_ARC, P2 = [], lamps = [];
  for (const D of [15.6, 28.2]) for (let i = 2; i < A.pts.length - 1; i += 3){
    const p = A.off(i, D); if (!A.ok(p[0], p[1])) continue;
    tbox(P2, .2, .7, .2, p[0], .35, p[1], '#34373c'); lamps.push(new THREE.BoxGeometry(.26, .14, .26).translate(p[0], .77, p[1])); gatePools.push([p[0], .1, p[1], 3.3]);
  }
  /* ---------- the statue stands on a round stepped base ---------- */
  const [sx, sz] = P(1180, 738);
  P2.push(geoTint(new THREE.CylinderGeometry(6.4, 6.6, .2, 40).translate(sx, .1, sz), '#a29b8e'), geoTint(new THREE.CylinderGeometry(5.1, 5.2, .22, 40).translate(sx, .31, sz), '#b0a99b'));
  const m = new THREE.Mesh(geoMerge(P2), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  scene.add(new THREE.Mesh(geoMerge(lamps), gateLampMat));
})();
/* the A zone: podium, stairs, walls, garage, the covered walk, the lakeside pavilions; the blocks are lifted onto it (js/09-azone.js) */
azBuild();
/* the plaza with the name stone, west of the gate, lies outside the hedge: open it (its three hedges are walls) */
{ const G = GATE_PLAZA, w0 = MAP.wall;
  MAP.wall = (x, z, r) => {
    if (x + r > G.x0 - 1.5 && x - r < G.x1 + 1 && z + r > G.z0 - 1 && z - r < G.z1 + 1.5){
      if (z - r < G.z0 + 1) return true;
      if (x - r < G.x0 + 1.5 || x + r > G.x1 - 1) return true;
      return false;
    }
    return w0(x, z, r);
  }; }

/* ---------- the gate: black wrought iron with gilded spear tips, slid open; the same railing either side; IN and OUT boards; a row of cones down the middle ----------
   It stands in the opening of the boundary hedge (z = 263.5), where the road from Jalan Sunsuria comes in. Behind it, a flat-roofed porch on white Roman columns
   to each side of the road: the east one shelters the guard booth, whose big windows are lit at night. Nothing here reaches the perimeter road (z < 252), so the race line is clear. */
(function(){
  const ZF = 263.5, IN = 6.6, OUTX = 16, P2 = [], glass = [], WHITE = '#eee8dc', IRON = '#17191c', GOLD = '#c9982e';
  const iron = paint => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; paint(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = ANISO;
    return new THREE.MeshStandardMaterial({map:t, alphaTest:.5, side:THREE.DoubleSide, roughness:.5, metalness:.45}); };
  const spear = (g, x, y, h) => { g.fillStyle = '#d8a93a'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4.5, y + h * .55); g.lineTo(x + 1.6, y + h); g.lineTo(x - 1.6, y + h); g.lineTo(x - 4.5, y + h * .55); g.closePath(); g.fill(); };
  /* railing: upright bars between two rails, every bar ending in a gilded spear, a ring between each pair under the top rail */
  const fenceMat = iron(g => {
    g.fillStyle = IRON; g.fillRect(0, 30, 256, 6); g.fillRect(0, 108, 256, 7);
    for (let i = 0; i < 8; i++){ const x = i * 32 + 16; g.fillStyle = IRON; g.fillRect(x - 2.5, 20, 5, 108); spear(g, x, 2, 20); g.strokeStyle = IRON; g.lineWidth = 2.5; g.beginPath(); g.arc(x + 16, 46, 7, 0, 7); g.stroke(); }
  });
  /* gate leaf: a heavier frame, the bars rising to an arch in the middle, gilded tips along the arch and a gilded roundel */
  const leafMat = iron(g => {
    const top = x => 34 - 26 * Math.sin(Math.PI * x / 256);
    g.fillStyle = IRON; g.fillRect(0, 26, 7, 102); g.fillRect(249, 26, 7, 102); g.fillRect(0, 118, 256, 10); g.fillRect(0, 76, 256, 5);
    for (let x = 0; x < 256; x += 2) g.fillRect(x, top(x + 1) + 14, 2, 5);
    for (let i = 0; i < 12; i++){ const x = i * 21 + 12; g.fillStyle = IRON; g.fillRect(x - 2.2, top(x) + 12, 4.4, 116); spear(g, x, top(x) - 4, 17); }
    g.strokeStyle = '#d8a93a'; g.lineWidth = 3; g.beginPath(); g.arc(128, 98, 13, 0, 7); g.stroke(); g.beginPath(); g.arc(128, 98, 5, 0, 7); g.stroke();
  });
  const fence = [], leaves = [];
  for (const s of [-1, 1]){
    const xa = GX + s * (IN + .25), xb = GX + s * (OUTX - .2), len = Math.abs(xb - xa);
    const fp = new THREE.PlaneGeometry(len, 2.75), uv = fp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 5.2);
    fence.push(fp.translate((xa + xb) / 2, .35 + 1.375, ZF).toNonIndexed());
    tbox(P2, len, .35, .5, (xa + xb) / 2, .175, ZF, '#b9b1a2');
    for (let k = 0; k <= 3; k++) tbox(P2, .16, 2.6, .16, xa + (xb - xa) * k / 3, 1.65, ZF, IRON);
    /* the leaf, rolled back behind the railing on its track */
    leaves.push(new THREE.PlaneGeometry(6.5, 3.1).translate(GX + s * (IN + .5 + 3.25), 1.6, ZF - .75).toNonIndexed());
    /* gate post with a gilded ball */
    tbox(P2, .55, 3.5, .55, GX + s * IN, 1.75, ZF, IRON); P2.push(geoTint(new THREE.SphereGeometry(.26, 10, 8).translate(GX + s * IN, 3.72, ZF).toNonIndexed(), GOLD));
    addBox(GX + s * (IN + OUTX) / 2, ZF, (OUTX - IN) / 2 + .2, .4, 0);
  }
  tbox(P2, IN * 2 + 14, .05, .14, GX, .06, ZF - .75, '#2a2c30');   /* the track the leaves run on */
  const fm = new THREE.Mesh(geoMergeUV(fence), fenceMat), lm = new THREE.Mesh(geoMergeUV(leaves), leafMat); fm.castShadow = lm.castShadow = true; scene.add(fm, lm);

  /* a Roman column: square plinth, moulded base, tapering shaft, flared capital under a square abacus (4.8 m in all) */
  const column = (x, z) => {
    P2.push(geoTint(new THREE.BoxGeometry(.98, .3, .98).translate(x, .15, z), WHITE), geoTint(new THREE.CylinderGeometry(.46, .52, .26, 14).translate(x, .43, z).toNonIndexed(), WHITE),
      geoTint(new THREE.CylinderGeometry(.36, .42, 3.7, 14, 1, true).translate(x, 2.41, z).toNonIndexed(), '#f4efe5'), geoTint(new THREE.CylinderGeometry(.56, .37, .34, 14).translate(x, 4.43, z).toNonIndexed(), WHITE),
      geoTint(new THREE.BoxGeometry(1.06, .2, 1.06).translate(x, 4.7, z), WHITE));
    addCircle(x, z, .62);
  };
  for (const s of [-1, 1]){
    const xc = GX + s * 12, zc = 257.8;
    for (const dx of [-3.6, 0, 3.6]) for (const dz of [-2.6, 2.6]) column(xc + dx, zc + dz);
    tbox(P2, 9.4, .3, 7.4, xc, 4.95, zc, '#e4ddd0'); tbox(P2, 9.9, .5, 7.9, xc, 5.35, zc, WHITE); tbox(P2, 10.3, .16, 8.3, xc, 5.68, zc, '#f6f2ea');   /* frieze, flat roof, cornice */
    for (const dx of [-2.2, 2.2]) glass.push(new THREE.BoxGeometry(1.5, .06, 1.5).translate(xc + dx, 4.78, zc));                                              /* down-lights under the roof */
    gatePools.push([xc, .1, zc, 8.5]);
    gateClear.push([xc - 5.4, zc - 4.4, xc + 5.4, zc + 4.2]);
  }
  /* guard booth under the east porch: a low wall, a band of big windows all round, a solid top */
  { const bx = GX + 12, bz = 257.8, bw = 4.6, bd = 3.2;
    tbox(P2, bw, 1, bd, bx, .5, bz, WHITE); tbox(P2, bw, 1.3, bd, bx, 3.75, bz, WHITE); tbox(P2, bw + .3, .12, bd + .3, bx, 1.04, bz, '#d9d2c4');
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) tbox(P2, .22, 2.1, .22, bx + sx * (bw / 2 - .11), 2.05, bz + sz2 * (bd / 2 - .11), '#3a3d42');
    tbox(P2, .1, 2.1, .1, bx, 2.05, bz - bd / 2 + .05, '#3a3d42'); tbox(P2, .1, 2.1, .1, bx, 2.05, bz + bd / 2 - .05, '#3a3d42');
    glass.push(new THREE.BoxGeometry(bw - .3, 2.05, bd - .3).translate(bx, 2.07, bz));
    addBox(bx, bz, bw / 2 + .2, bd / 2 + .2, 0); }
  /* west porch: the pedestrian way in, three low turnstile posts and a notice board */
  { const bx = GX - 12, bz = 257.8;
    for (const dx of [-1.6, 0, 1.6]){ tbox(P2, .28, 1.05, .28, bx + dx, .525, bz, '#8f959b'); tbox(P2, .9, .07, .07, bx + dx + .45, .9, bz, '#c9ced3'); }
    tbox(P2, 2.2, 1.5, .1, bx - 2.6, 1.55, bz + 2.2, '#26323c'); tbox(P2, .1, .8, .1, bx - 3.5, .4, bz + 2.2, '#3a3d42'); tbox(P2, .1, .8, .1, bx - 1.7, .4, bz + 2.2, '#3a3d42'); }
  /* granite apron under the porches and across the road */
  { const ap = new THREE.Mesh(new THREE.PlaneGeometry(36, 10.2).rotateX(-Math.PI / 2), regWet(flatMat('#77726a', 6), .35)); ap.position.set(GX, .05, 257.1); ap.receiveShadow = true; scene.add(ap); }
  /* IN on the left for traffic coming in (Malaysia drives on the left), OUT on the other side for traffic leaving */
  { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#b3261e'; g.fillRect(128, 0, 128, 64); g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 56); g.strokeRect(132, 4, 120, 56);
    g.fillStyle = '#ffffff'; g.font = '900 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('IN', 64, 34); g.fillText('OUT', 192, 34);
    const quads = [];
    for (const [x, u0, face] of [[GX - 5.4, 0, 1], [GX + 5.4, .5, -1]]){
      tbox(P2, .1, 1.5, .1, x, .75, ZF - 2.2, '#c9ced3');
      for (const f2 of [1, -1]){ const q = new THREE.PlaneGeometry(1.1, .55), uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * .5); if (f2 * face < 0) q.rotateY(Math.PI); quads.push(q.translate(x, 1.75, ZF - 2.2 + f2 * face * .06).toNonIndexed()); }
    }
    scene.add(new THREE.Mesh(geoMergeUV(quads), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv)}))); }
  const m = new THREE.Mesh(geoMerge(P2), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  scene.add(new THREE.Mesh(geoMerge(glass), gateGlassMat));
  /* traffic cones between the two lanes and by the boards. A car knocks them over (they are an outside set, like the street lamps beyond the gate:
     the campus sets are cleared out of the gateway on the first frame, and these also stay out of the black hole's tally) */
  const coneGeo = geoMerge([geoTint(new THREE.ConeGeometry(.2, .62, 10, 1, true).translate(0, .35, 0).toNonIndexed(), '#f26a1b'), geoTint(new THREE.CylinderGeometry(.115, .15, .13, 10, 1, true).translate(0, .37, 0).toNonIndexed(), '#f6f3ec'),
    geoTint(new THREE.BoxGeometry(.44, .05, .44).translate(0, .025, 0), '#d85a12')]);
  outSet('cone', [[0, 253.8], [0, 256.2], [0, 258.6], [0, 261], [-5, 260.2], [5, 260.2], [0, 266.4], [0, 268.8]].map(([dx, z]) => outSpot(GX + dx, z, 0, 1)), [[coneGeo, M('#ffffff', {vertexColors:true, roughness:.7})]], false);
})();

/* ---------- pools of light under the porches, the stair lanterns and the lawn bollards: one instanced mesh, switched with the street-lamp pools ---------- */
(function(){
  const im = new THREE.InstancedMesh(glowGeo, glowMat, gatePools.length);
  gatePools.forEach(([x, y, z, r], i) => { _cm.compose(_cp.set(x, y + .04, z), _cq.identity(), _cs.set(r, 1, r)); im.setMatrixAt(i, _cm); });
  im.frustumCulled = false; im.visible = false; im.renderOrder = 2; scene.add(im); glowSets.push({im});
})();
/* trees, lamps, benches and bins that were standing where the stair and the porches now are: cleared on the first frame, once every file has added its own */
let gateCleared = false;
function gateClearRun(){
  gateCleared = true;
  /* a campus cat whose spot is now inside a block that was turned moves to the front of it */
  if (typeof cats !== 'undefined') for (const k of cats) for (const c of LATE_REAL){
    const dx = k.hx - c.cx, dz = k.hz - c.cz, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    if (Math.abs(lx) < c.hx + .5 && Math.abs(lz) < c.hz + .5){ const sx = lx * c.c + (c.hz + 7) * c.s, sz = -lx * c.s + (c.hz + 7) * c.c; k.hx = k.x = k.tx = c.cx + sx; k.hz = k.z = k.tz = c.cz + sz; }
  }
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    /* in the way of: the stair or a porch; a block that was turned (its box, with a margin); an arcade walk; a link between two blocks */
    const hit = gateClear.some(([x0, z0, x1, z1]) => o.x > x0 && o.x < x1 && o.z > z0 && o.z < z1)
      || LATE_REAL.some(c => { const dx = o.x - c.cx, dz = o.z - c.cz, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; return Math.abs(lx) < c.hx + 1.4 && Math.abs(lz) < c.hz + 1.4; })
      || GRAND_FRONTS.some(f => { const dx = o.x - f.x, dz = o.z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < f.w / 2 + 1.5 && lz > f.d / 2 - 1 && lz < f.d / 2 + f.depth; })
      || ROW_LINKS.some(([a, b]) => segDist(o.x, o.z, a, b) < 3.6)
      || azClears(set.kind, o.x, o.z);   /* on the A zone's stairs, banks and walls (js/09-azone.js) */
    if (hit){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
  });
}
