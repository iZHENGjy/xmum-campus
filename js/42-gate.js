/* XMUM 校园漫游 · 大门和门前：铁艺大门（关着，门外中轴线上是校碑和喷泉池）、罗马柱门廊和门卫亭、两边进出车道的道闸、IN / OUT 牌和锥桶；草坪灯；A 区台地（azBuild，js/09-azone.js）。
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
  gateStoneMat.emissiveIntensity = k * .8;   /* the gilded letters on the name stone (js/10-world.js) */
}
const gatePools = [];   /* [x, y, z, radius]: pools of light on the ground, one instanced mesh, shown with the lamp pools */
const gateClear = [];   /* [x0, z0, x1, z1]: trees, lamps and benches inside these are removed at the end */
const gateLate = [];    /* colliders added on the first frame (gateClearRun), so nothing placed after this file (delivery spots and so on) moves */

/* ---------- the lawn below the A zone's stairs: two rows of low bollards following the curve of the promenade; the statue's round stepped base ---------- */
(function(){
  const A = LAWN_ARC, P2 = [], lamps = [];
  for (const D of [15.6, 28.2]) for (let i = 2; i < A.pts.length - 1; i += 3){
    const p = A.off(i, D); if (!A.ok(p[0], p[1])) continue;
    tbox(P2, .2, .7, .2, p[0], .35, p[1], '#34373c'); lamps.push(new THREE.BoxGeometry(.26, .14, .26).translate(p[0], .77, p[1])); gatePools.push([p[0], .1, p[1], 3.3]);
  }
  /* ---------- the statue stands on a round stepped base ---------- */
  const [sx, sz] = P(AXIS_PX, 738);
  P2.push(geoTint(new THREE.CylinderGeometry(6.4, 6.6, .2, 40).translate(sx, .1, sz), '#a29b8e'), geoTint(new THREE.CylinderGeometry(5.1, 5.2, .22, 40).translate(sx, .31, sz), '#b0a99b'));
  const m = new THREE.Mesh(geoMerge(P2), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  scene.add(new THREE.Mesh(geoMerge(lamps), gateLampMat));
})();
/* the A zone: podium, stairs, walls, garage, the covered walk, the lakeside pavilions; the blocks are lifted onto it (js/09-azone.js) */
azBuild();
/* the gaps in the south hedge are open (the main gate's opening is GATE_GAP, js/12-terrain.js) */
{ const w0 = MAP.wall;
  MAP.wall = (x, z, r) => {
    if (z + r > 260 && z - r < 267) for (const o of SOUTH_OPEN) if (x - r > o.x - o.w / 2 && x + r < o.x + o.w / 2) return false;
    return w0(x, z, r);
  }; }

/* wrought-iron railing as real bars (a texture of bars shimmered and turned to moiré a few metres away): square uprights every 16 cm, each with a gilded
   spear tip, a rail top and bottom, and a band of rings under the top rail. Runs along x at depth z; y0 = top of the plinth, h = height of the bars. */
const ironBarGeo = geoTint(new THREE.CylinderGeometry(.028, .028, 1, 3, 1, true).translate(0, .5, 0).toNonIndexed(), '#17191c');   /* three-sided: 6 triangles a bar */
const ironTipGeo = geoTint(new THREE.ConeGeometry(.06, .2, 3, 1, true).toNonIndexed(), '#c9982e');
const ironRingGeo = geoTint(new THREE.TorusGeometry(.07, .014, 3, 6).toNonIndexed(), '#17191c');
const ironMeshes = [];   /* the bars cast shadows on 高清 only */
XQ.onChange(() => { for (const m of ironMeshes) m.castShadow = XQ.tier > 1; });
function ironRail(list, xa, xb, z, y0, h, sp){
  sp = sp || .16;
  const len = Math.abs(xb - xa), n = Math.max(1, Math.round(len / sp)), x0 = Math.min(xa, xb), d = len / n;
  for (let i = 0; i < n; i++){
    const x = x0 + (i + .5) * d;
    list.push(ironBarGeo.clone().scale(1, h, 1).translate(x, y0, z), ironTipGeo.clone().translate(x, y0 + h + .1, z));
    if (XQ.tier > 1 && i % 2 === 0 && i < n - 1) list.push(   /* rings: 高清 only */ironRingGeo.clone().translate(x + d, y0 + h - .32, z));
  }
  for (const y of [y0 + .1, y0 + h - .2, y0 + h - .44]) tbox(list, len, .05, .055, x0 + len / 2, y, z, '#17191c');
}

/* ---------- the south boundary either side of the gate: the railing on a granite plinth between cream piers; the gaps in the hedge further along ---------- */
(function(){
  const ZF = 263.5, P2 = [], rail = [], glow = [];
  for (const [xa, xb] of SOUTH_RAIL){
    const len = xb - xa, nb = Math.max(1, Math.round(len / 8.5)), bay = len / nb;
    tbox(P2, len, .5, .62, (xa + xb) / 2, .25, ZF, '#b9b1a2'); tbox(P2, len, .08, .72, (xa + xb) / 2, .54, ZF, '#cfc8bb');
    for (let k = 0; k <= nb; k++){
      const x = xa + k * bay;
      tbox(P2, .86, 2.9, .86, x, 1.45, ZF, '#e4ddd0'); tbox(P2, 1.02, .22, 1.02, x, 2.98, ZF, '#f2ede3'); tbox(P2, .62, .16, .62, x, 3.17, ZF, '#e4ddd0');
      P2.push(geoTint(new THREE.SphereGeometry(.2, 8, 6).translate(x, 3.42, ZF).toNonIndexed(), '#c9982e'));
      if (k < nb) ironRail(rail, x + .43, x + bay - .43, ZF, .58, 2.05);
    }
  }
  /* the gaps: a short drive across the verge from the ring road to Jalan Sunsuria, a granite pier with a lamp each side where the hedge stops */
  const apron = [];
  for (const o of SOUTH_OPEN){
    const xa = o.x - o.w / 2, xb = o.x + o.w / 2;
    apron.push(new THREE.PlaneGeometry(o.w - .6, 13.8).rotateX(-Math.PI / 2).translate(o.x, 0, 259.5));
    for (const e of [xa - .55, xb + .55]){
      tbox(P2, 1, 2.1, 1.1, e, 1.05, ZF, '#d8d1c4'); tbox(P2, 1.2, .18, 1.3, e, 2.19, ZF, '#ece6da');
      glow.push(new THREE.BoxGeometry(.42, .42, .42).translate(e, 2.49, ZF)); P2.push(geoTint(new THREE.BoxGeometry(.56, .08, .56).translate(e, 2.74, ZF), '#3a3d42'));
      gatePools.push([e, .1, ZF - 1.5, 4]);
    }
    gateClear.push([xa - 1, 252, xb + 1, 268]);
  }
  const am = new THREE.Mesh(geoMerge(apron), asphalt); am.position.y = .045; am.receiveShadow = true; scene.add(am);
  const m = new THREE.Mesh(geoMerge(P2), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  const rm = new THREE.Mesh(geoMerge(rail), decoMat); rm.castShadow = XQ.tier > 1; ironMeshes.push(rm); scene.add(rm);
  scene.add(new THREE.Mesh(geoMerge(glow), gateLampMat));
})();

/* ---------- the gate: black wrought iron with gilded spear tips under one gilded arch, closed; a flat-roofed porch on white Roman columns each side; the two lanes ----------
   As at the real gate, from the axis outward (GATE_FRONT, js/10-world.js): the iron gate, closed, with the name stone and its pool in front of it; a lane each side,
   cars coming in by the west one and leaving by the east one (Malaysia drives on the left), each past a raised boom on its outer side; then the porches
   (the brick gate pillars, js/13-outskirts.js, stand at their outer ends): the east one shelters the guard booth beside the OUT lane, whose big windows are lit at night; the west one is the way in on foot.
   Nothing here reaches the perimeter road (z < 252), so the race line is clear. */
(function(){
  const GF = GATE_FRONT, GZ = GF.gz, IN = 6.6, P2 = [], glass = [], WHITE = '#eee8dc', IRON = '#17191c', GOLD = '#c9982e';
  const iron = [];
  /* the two leaves meet on the axis under one arch, highest in the middle: a heavy frame, a middle rail, bars up to the arch with gilded tips, a band of gilded
     rings under the arch, a gilded roundel on each leaf; an iron post with a gilded ball each side, the lanes going past it */
  const top = x => 2.6 + .9 * Math.cos(Math.PI / 2 * Math.min(1, Math.abs(x - GX) / (IN - .3)));
  for (const s of [-1, 1]){
    const lx0 = GX + s * (IN - .3), lx1 = GX + s * .03, LX = t => lx0 + (lx1 - lx0) * t;
    for (const t of [0, 1]){ const x = LX(t), h = top(x) + .1; tbox(iron, .12, h, .12, x, h / 2, GZ, IRON); }
    tbox(iron, IN - .33, .14, .09, (lx0 + lx1) / 2, .2, GZ, IRON); tbox(iron, IN - .33, .08, .08, (lx0 + lx1) / 2, 1.42, GZ, IRON);
    for (let i = 1; i < 22; i++){ const x = LX(i / 22), h = top(x) - .2; iron.push(ironBarGeo.clone().scale(1.3, h, 1.3).translate(x, .2, GZ), ironTipGeo.clone().scale(1.2, 1.2, 1.2).translate(x, .2 + h + .12, GZ)); }
    for (let i = 0; i < 16; i++){ const x0 = LX(i / 16), x1 = LX((i + 1) / 16); iron.push(geoTint(rodGeo(.045, .045, [x0, top(x0) - .3, GZ], [x1, top(x1) - .3, GZ], 4).toNonIndexed(), IRON)); }
    for (let i = 0; i < 9; i++){ const x = LX((i + .5) / 9); iron.push(geoTint(new THREE.TorusGeometry(.17, .032, 4, 14).translate(x, top(x) - .62, GZ).toNonIndexed(), GOLD)); }
    for (const r of [.42, .17]) iron.push(geoTint(new THREE.TorusGeometry(r, .04, 4, 22).translate(LX(.5), .82, GZ).toNonIndexed(), GOLD));
    tbox(P2, .55, 3.9, .55, GX + s * IN, 1.95, GZ, IRON); P2.push(geoTint(new THREE.SphereGeometry(.28, 10, 8).translate(GX + s * IN, 4.14, GZ).toNonIndexed(), GOLD));
  }
  gateLate.push(() => addBox(GX, GZ, IN + .3, .35, 0));
  { const fm = new THREE.Mesh(geoMerge(iron), decoMat); fm.castShadow = XQ.tier > 1; ironMeshes.push(fm); scene.add(fm); }

  /* a Roman column: square plinth, moulded base, tapering shaft, flared capital under a square abacus (4.8 m in all) */
  const column = (x, z) => {
    P2.push(geoTint(new THREE.BoxGeometry(.98, .3, .98).translate(x, .15, z), WHITE), geoTint(new THREE.CylinderGeometry(.46, .52, .26, 14).translate(x, .43, z).toNonIndexed(), WHITE),
      geoTint(new THREE.CylinderGeometry(.36, .42, 3.7, 14, 1, true).translate(x, 2.41, z).toNonIndexed(), '#f4efe5'), geoTint(new THREE.CylinderGeometry(.56, .37, .34, 14).translate(x, 4.43, z).toNonIndexed(), WHITE),
      geoTint(new THREE.BoxGeometry(1.06, .2, 1.06).translate(x, 4.7, z), WHITE));
    addCircle(x, z, .62);
  };
  for (const s of [-1, 1]){
    const xc = GX + s * GF.porch, zc = 257.8;
    for (const dx of [-3.6, 0, 3.6]) for (const dz of [-2.6, 2.6]) column(xc + dx, zc + dz);
    tbox(P2, 9.4, .3, 7.4, xc, 4.95, zc, '#e4ddd0'); tbox(P2, 9.9, .5, 7.9, xc, 5.35, zc, WHITE); tbox(P2, 10.3, .16, 8.3, xc, 5.68, zc, '#f6f2ea');   /* frieze, flat roof, cornice */
    for (const dx of [-2.2, 2.2]) glass.push(new THREE.BoxGeometry(1.5, .06, 1.5).translate(xc + dx, 4.78, zc));                                              /* down-lights under the roof */
    gatePools.push([xc, .1, zc, 8.5]);
    gateClear.push([xc - 5.4, zc - 4.4, xc + 5.4, zc + 4.2]);
  }
  /* guard booth under the east porch, on the side of the OUT lane: a low wall, a band of big windows all round, a solid top */
  { const bx = GX + GF.porch - 1.2, bz = 257.8, bw = 4.6, bd = 3.2;
    tbox(P2, bw, 1, bd, bx, .5, bz, WHITE); tbox(P2, bw, 1.3, bd, bx, 3.75, bz, WHITE); tbox(P2, bw + .3, .12, bd + .3, bx, 1.04, bz, '#d9d2c4');
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) tbox(P2, .22, 2.1, .22, bx + sx * (bw / 2 - .11), 2.05, bz + sz2 * (bd / 2 - .11), '#3a3d42');
    tbox(P2, .1, 2.1, .1, bx, 2.05, bz - bd / 2 + .05, '#3a3d42'); tbox(P2, .1, 2.1, .1, bx, 2.05, bz + bd / 2 - .05, '#3a3d42');
    glass.push(new THREE.BoxGeometry(bw - .3, 2.05, bd - .3).translate(bx, 2.07, bz));
    addBox(bx, bz, bw / 2 + .2, bd / 2 + .2, 0); }
  /* west porch: the pedestrian way in, three low turnstile posts and a notice board */
  { const bx = GX - GF.porch, bz = 257.8;
    for (const dx of [-1.6, 0, 1.6]){ tbox(P2, .28, 1.05, .28, bx + dx, .525, bz, '#8f959b'); tbox(P2, .9, .07, .07, bx + dx + .45, .9, bz, '#c9ced3'); }
    tbox(P2, 2.2, 1.5, .1, bx - 2.6, 1.55, bz + 2.2, '#26323c'); tbox(P2, .1, .8, .1, bx - 3.5, .4, bz + 2.2, '#3a3d42'); tbox(P2, .1, .8, .1, bx - 1.7, .4, bz + 2.2, '#3a3d42'); }
  /* granite paving in front of the gate and under the porches, down to the edge of Jalan Sunsuria (its kerb stops across the gateway, where the road
     across the median to Bell Avenue starts; the lanes between are asphalt: js/12-terrain.js) */
  { const xi = GF.lane - GF.lw / 2 - .1, xo = GF.lane + GF.lw / 2 + .1, xe = GF.porch + 5.2, ap = [new THREE.PlaneGeometry(xi * 2, 14).rotateX(-Math.PI / 2).translate(GX, 0, 259)];
    for (const s of [-1, 1]) ap.push(new THREE.PlaneGeometry(xe - xo, 14).rotateX(-Math.PI / 2).translate(GX + s * (xo + xe) / 2, 0, 259));
    const m = new THREE.Mesh(geoMergeUV(ap), regWet(flatMat('#77726a', 6), .35)); m.position.y = .05; m.receiveShadow = true; scene.add(m); }
  /* the lanes: a boom on the outer side of each (by the booth on the east), raised (red and white bands); IN by the west lane for traffic coming in, OUT by the east one */
  for (const s of [-1, 1]){
    const px = GX + s * (GF.lane + GF.lw / 2 - .45), pz = 257.6, A = 1.22, seg = .9;
    tbox(P2, .5, 1.1, .5, px, .55, pz, '#d9d6cf'); tbox(P2, .56, .14, .56, px, 1.1, pz, '#c4502a');
    for (let k = 0; k < 6; k++){ const p0 = [px - s * Math.cos(A) * seg * k, 1.2 + Math.sin(A) * seg * k, pz], p1 = [px - s * Math.cos(A) * seg * (k + 1), 1.2 + Math.sin(A) * seg * (k + 1), pz]; P2.push(geoTint(rodGeo(.07, .06, p0, p1, 6), k % 2 ? '#f4f1ea' : '#c4502a')); }
    gateLate.push(() => addCircle(px, pz, .35));
    gatePools.push([GX + s * GF.lane, .1, 259, 5.2]);
    gateClear.push([GX + Math.min(s * (GF.lane - GF.lw / 2 - .4), s * (GF.lane + GF.lw / 2 + .4)), 244, GX + Math.max(s * (GF.lane - GF.lw / 2 - .4), s * (GF.lane + GF.lw / 2 + .4)), 268]);
  }
  gatePools.push([GX, .1, 263, 4.4]);
  gateClear.push([GX - 7.6, 252, GX + 7.6, 266]);
  /* the axis walk from the front road up to A3's stair, with the statue on it: trees and lamps scattered before it moved over here go */
  gateClear.push([GX - 8.2, AZ.promZ(GX) - 4, GX + 8.2, 214]);
  { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#b3261e'; g.fillRect(128, 0, 128, 64); g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 56); g.strokeRect(132, 4, 120, 56);
    g.fillStyle = '#ffffff'; g.font = '900 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('IN', 64, 34); g.fillText('OUT', 192, 34);
    const quads = [], bz = 262.4;
    const bx = GF.lane + GF.lw / 2 + .3;   /* on the outer edge of each lane, in front of the porch */
    for (const [x, u0, face] of [[GX - bx, 0, 1], [GX + bx, .5, -1]]){
      tbox(P2, .1, 2.2, .1, x, 1.1, bz, '#c9ced3');
      for (const f2 of [1, -1]){ const q = new THREE.PlaneGeometry(1.1, .55), uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * .5); if (f2 * face < 0) q.rotateY(Math.PI); quads.push(q.translate(x, 2.45, bz + f2 * face * .06).toNonIndexed()); }
    }
    scene.add(new THREE.Mesh(geoMergeUV(quads), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv)}))); }
  const m = new THREE.Mesh(geoMerge(P2), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
  scene.add(new THREE.Mesh(geoMerge(glass), gateGlassMat));
  /* traffic cones along the lanes. A car knocks them over (they are an outside set, like the street lamps beyond the gate:
     the campus sets are cleared out of the gateway on the first frame, and these also stay out of the black hole's tally) */
  const coneGeo = geoMerge([geoTint(new THREE.ConeGeometry(.2, .62, 10, 1, true).translate(0, .35, 0).toNonIndexed(), '#f26a1b'), geoTint(new THREE.CylinderGeometry(.115, .15, .13, 10, 1, true).translate(0, .37, 0).toNonIndexed(), '#f6f3ec'),
    geoTint(new THREE.BoxGeometry(.44, .05, .44).translate(0, .025, 0), '#d85a12')]);
  const li = GF.lane - GF.lw / 2 + .5, lo = GF.lane + GF.lw / 2 - .5;
  outSet('cone', [[-li, 254.5], [-li, 257], [li, 254.5], [li, 257], [-lo, 266.6], [-lo, 268.6], [lo, 266.6], [lo, 268.6]].map(([dx, z]) => outSpot(GX + dx, z, 0, 1)), [[coneGeo, M('#ffffff', {vertexColors:true, roughness:.7})]], false);
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
  /* the old inner fence (js/10-world.js FENCE_GHOST) only stood in while the scenery was placed */
  for (const c of FENCE_GHOST){ const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); for (const st of structures){ const j = st.cols.indexOf(c); if (j >= 0) st.cols.splice(j, 1); } }
  /* the axis walks were where the axis used to run, 15 m east of A3's middle, while the scenery was scattered: now they move onto the axis */
  for (const [sg, a, b] of ROAD_SWAP){ sg.a = a; sg.b = b; }
  /* so do the low cheek walls beside the A-zone steps (js/09-azone.js): from now on you walk or drive over them */
  for (const c of AZ.cheeks){ const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); for (const st of structures){ const j = st.cols.indexOf(c); if (j >= 0) st.cols.splice(j, 1); } }
  /* the name stone with its pool, on the axis in front of the gate (eaten with the stone); the closed gate and the boom posts */
  { const G = GATE_FRONT, z0 = G.sz - .95, c = addBox(GX, (z0 + G.pz1) / 2, G.hw, (G.pz1 - z0) / 2, 0), st = structures.find(s => s.info === gateInfo); if (st) st.cols.push(c);
    for (const f of gateLate) f(); }
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
