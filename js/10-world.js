/* XMUM 校园漫游 · 地面、道路、湖、所有楼、植物、天空、打卡点、昼夜 */
'use strict';
/* ---------- weather state (driven by js/16-weather.js, applied in applyTime) and the surfaces that look wet after rain ---------- */
const wx = {rain:0, wet:0, target:0};
const wetMats = [];
function regWet(m, minR){ wetMats.push([m, m.color.clone(), m.roughness, minR]); return m; }

/* ---------- ground ---------- */
function flatPoly(pts, mat, y, smooth){
  const v = pts.map(p => new THREE.Vector2(p[0], -p[1]));
  const s = new THREE.Shape(); s.moveTo(v[0].x, v[0].y);
  if (smooth) s.splineThru(v.slice(1).concat([v[0]])); else v.slice(1).forEach(q => s.lineTo(q.x, q.y));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 14), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m);
  return {mesh:m, poly:s.getPoints(10).map(p => [p.x, -p.y])};
}
const pxPts = arr => arr.map(p => P(p[0], p[1]));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), regWet(M('#3c5f2e'), .6));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
flatPoly(pxPts([[300,870],[100,820],[25,690],[22,320],[80,120],[240,20],[560,5],[1840,12],[1925,100],[1925,870]]), regWet(flatMat('#466b33', 1), .55), .02, false);
const FOREST = pxPts([[330,60],[760,45],[790,240],[900,290],[980,440],[900,540],[760,600],[560,640],[510,560],[500,440],[330,260],[250,170]]);
flatPoly(FOREST, regWet(flatMat('#365c2c', 2), .6), .03, true);
const LAWN_SQ = pxPts([[385,140],[600,130],[640,200],[630,330],[400,340],[380,250]]);
flatPoly(LAWN_SQ, regWet(flatMat('#527838', 3), .55), .035, false);
const GATE_LAWNS = [pxPts([[890,738],[1000,712],[1166,706],[1166,800],[900,800]]), pxPts([[1194,706],[1350,708],[1500,722],[1500,800],[1194,800]])];
const gateLawnMat = regWet(flatMat('#4f7436', 3), .55);
GATE_LAWNS.forEach(L => flatPoly(L, gateLawnMat, .035, true));

/* ---------- roads ---------- */
const asphalt = regWet(flatMat('#605e5a', 4), .28), paving = regWet(flatMat('#8b8170', 5), .32), pathMat = regWet(flatMat('#92886f', 6), .35);
const ROADS = [
  {w:12, m:asphalt, p:[[300,855],[120,815],[45,690],[40,320],[95,140],[240,40],[560,22],[1000,25],[1500,28],[1830,35],[1905,110],[1905,855],[300,855]]},
  {w:10, m:asphalt, p:[[1905,340],[1580,340]]},
  {w:8,  m:asphalt, p:[[760,265],[1000,258],[1250,262],[1420,262],[1520,295],[1580,340]]},
  {w:8,  m:asphalt, p:[[770,40],[770,265]]},
  {w:8,  m:asphalt, p:[[1580,340],[1580,830]]},
  {w:8,  m:asphalt, p:[[1580,820],[1500,802],[1300,815],[1180,818],[1050,815],[880,798],[760,762],[600,722],[480,700]]},
  {w:12, m:paving,  p:[[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]]},
  {w:8,  m:asphalt, p:[[700,620],[860,560],[1000,520],[1180,508],[1400,516],[1580,520]]},
  {w:7,  m:asphalt, p:[[330,250],[470,330],[580,370]]},
  {w:7,  m:asphalt, p:[[580,370],[700,330],[850,285],[960,265]]},
  {w:7,  m:asphalt, p:[[580,370],[640,440],[760,470],[900,460],[1000,470],[1100,505]]},
  {w:7,  m:asphalt, p:[[260,170],[150,230],[110,330],[110,560],[180,680],[300,730],[470,740],[505,640],[480,520],[430,420],[330,300],[260,170]]},
  {w:16, m:paving,  p:[[1180,800],[1180,665]]},
  {w:9,  m:paving,  p:[[1140,855],[1140,800]]}, {w:9, m:paving, p:[[1220,855],[1220,800]]},
  {w:6,  m:pathMat, p:[[1150,508],[1140,420],[1165,372],[1230,346],[1310,322],[1330,290],[1300,262]]},
  {w:6,  m:pathMat, p:[[960,265],[972,305],[1010,335],[1100,352],[1150,368]]},
  {w:6,  m:pathMat, p:[[780,150],[1560,145]]},
  {w:6,  m:pathMat, p:[[1520,295],[1600,250],[1700,258]]},
  {w:6,  m:pathMat, p:[[1450,500],[1560,520]]}
];
const ROADS_W = ROADS.map(r => ({w:r.w, m:r.m, p:pxPts(r.p)}));
const kerbMat = regWet(flatMat('#a39a8b', 3), .4);
const KERBS = ROADS_W.filter(r => r.m === asphalt).map(r => ({w:r.w + 2.6, m:kerbMat, p:r.p}));
(function buildRoads(){
  const byMat = new Map();
  for (const r of KERBS.concat(ROADS_W)){
    const pos = byMat.get(r.m) || []; byMat.set(r.m, pos); const h = r.w / 2;
    for (let i = 0; i < r.p.length - 1; i++){
      const [x0, z0] = r.p[i], [x1, z1] = r.p[i + 1], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * h, nz = dx / l * h;
      pos.push(x0 + nx, 0, z0 + nz, x1 - nx, 0, z1 - nz, x0 - nx, 0, z0 - nz, x0 + nx, 0, z0 + nz, x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz);
      roadSegs.push({a:r.p[i], b:r.p[i + 1], h});
    }
    for (const [x, z] of r.p) for (let k = 0; k < 12; k++){
      const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
      pos.push(x, 0, z, x + Math.cos(a1) * h, 0, z + Math.sin(a1) * h, x + Math.cos(a0) * h, 0, z + Math.sin(a0) * h);
    }
  }
  byMat.forEach((pos, mat) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = new Float32Array(pos.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    const m = new THREE.Mesh(g, mat); m.position.y = .045; m.receiveShadow = true; scene.add(m);
  });
})();
function segDist(x, z, a, b){
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
(function dashes(){
  const spots = [];
  for (const r of ROADS_W){
    if (r.m !== asphalt || r.w < 8) continue;
    for (let i = 0; i < r.p.length - 1; i++){
      const [x0, z0] = r.p[i], [x1, z1] = r.p[i + 1], l = Math.hypot(x1 - x0, z1 - z0), h = Math.atan2(x1 - x0, z1 - z0);
      for (let s2 = 4; s2 < l - 3; s2 += 8) spots.push([x0 + (x1 - x0) * s2 / l, z0 + (z1 - z0) * s2 / l, h]);
    }
  }
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.22, 3).rotateX(-Math.PI / 2), flatMat('#f1ede4', 8), spots.length);
  spots.forEach(([x, z, h], i) => { _cm.compose(_cp.set(x, .05, z), _cq2.setFromAxisAngle(UP, h), _cs.set(1, 1, 1)); im.setMatrixAt(i, _cm); });
  im.frustumCulled = false; im.receiveShadow = true; scene.add(im);
})();
const onRoad = (x, z, pad) => roadSegs.some(s => segDist(x, z, s.a, s.b) < s.h + pad);

/* ---------- lakes ---------- */
const waterMat = M('#4f877a', {roughness:.18, metalness:.15, polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-36, side:THREE.DoubleSide});
const rimMat = flatMat('#b3a791', 7);
const lakeInfo = {name:'中心湖', tag:'景观', desc:'两片相连的湖，北边是 LY 宿舍区，南边是教学楼。西边那片的尽头是音乐岛。', spawn:[228, 37, 0]};
const LAKE_PX = [
  [[1030,270],[1100,250],[1200,255],[1280,275],[1300,305],[1250,328],[1150,342],[1060,335],[1035,305]],
  [[1180,388],[1262,350],[1350,328],[1440,322],[1500,352],[1530,410],[1540,468],[1480,490],[1380,472],[1290,482],[1200,452],[1172,418]]
];
const lakeRims = [];
LAKE_PX.forEach(px => {
  const cx = px.reduce((s, p) => s + p[0], 0) / px.length, cy = px.reduce((s, p) => s + p[1], 0) / px.length;
  const exp = px.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy); return [x + dx / l * 12, y + dy / l * 12]; });
  lakeRims.push(flatPoly(pxPts(exp), rimMat, .05, true).poly);
  const w = flatPoly(pxPts(px), waterMat, .1, true);
  w.mesh.userData.info = lakeInfo; pickables.push(w.mesh); lakes.push(w.poly);
});
addLabel('中心湖', ...(() => { const p = P(1380, 410); return [p[0], 6, p[1]]; })(), true);

/* low-poly helpers for curved stonework and stepped lawns (all end up in one vertex-coloured mesh per feature) */
function quadGeo(a, b, c, e, col){ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...e], 3)); g.computeVertexNormals(); return geoTint(g, col); }
/* ring sector with a flat top at height y1 and a riser on its inner edge from y0 (angles in radians, measured from +x toward +z) */
function arcStep(list, cx, cz, r0, r1, a0, a1, y0, y1, top, riser, seg){
  for (let i = 0; i < seg; i++){
    const b0 = a0 + (a1 - a0) * i / seg, b1 = a0 + (a1 - a0) * (i + 1) / seg, c0 = Math.cos(b0), s0 = Math.sin(b0), c1 = Math.cos(b1), s1 = Math.sin(b1);
    list.push(quadGeo([cx + c0 * r0, y1, cz + s0 * r0], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], [cx + c1 * r0, y1, cz + s1 * r0], top),
      quadGeo([cx + c0 * r0, y0, cz + s0 * r0], [cx + c0 * r0, y1, cz + s0 * r0], [cx + c1 * r0, y1, cz + s1 * r0], [cx + c1 * r0, y0, cz + s1 * r0], riser));
  }
}

/* 芙蓉湖石拱桥: a nine-arch stone footbridge across the waist of the big lake (to look at: the water under it is still out of bounds) */
(function(){
  const [bx, z0] = P(1290, 341), z1 = P(1290, 484)[1], L = z1 - z0, N = 9, span = L / N, W = 3.8, STONE = '#cdc6b7', DARK = '#a79f90', CAP = '#e2dccf', parts = [];
  const info = {name:'芙蓉湖石拱桥', tag:'景观', desc:'横跨湖面的多孔石拱桥，是湖边最上镜的地方。游戏里只能在岸上看：桥下的水面还是不能走。', spawn:[bx - 16, z0 - 8, -2.2]};
  const deckY = t => 1.1 + 2.3 * (1 - Math.pow(2 * t - 1, 2));   /* gentle camber: higher in the middle */
  const M2 = 8;
  for (let k = 0; k < N; k++){
    const za = z0 + k * span, r = span / 2 - .55, zc = za + span / 2;
    for (let i = 0; i < M2; i++){
      const u0 = i / M2, u1 = (i + 1) / M2, p0 = za + u0 * span, p1 = za + u1 * span, t0 = (p0 - z0) / L, t1 = (p1 - z0) / L;
      const arc = p => { const dz = Math.abs(p - zc); return dz >= r ? -.6 : -.6 + Math.sqrt(r * r - dz * dz) * .62; };   /* flattened arch springing below the water line */
      const a0 = arc(p0), a1 = arc(p1), d0 = deckY(t0) - .25, d1 = deckY(t1) - .25;
      for (const s of [-1, 1]){
        const x = bx + s * W / 2;
        parts.push(s > 0 ? quadGeo([x, a0, p0], [x, d0, p0], [x, d1, p1], [x, a1, p1], STONE) : quadGeo([x, a0, p1], [x, d1, p1], [x, d0, p0], [x, a0, p0], STONE));
        /* parapet */
        const xo = bx + s * (W / 2 + .12), xi = bx + s * (W / 2 - .2), yt0 = deckY(t0) + .85, yt1 = deckY(t1) + .85;
        parts.push(s > 0 ? quadGeo([xo, d0, p0], [xo, yt0, p0], [xo, yt1, p1], [xo, d1, p1], CAP) : quadGeo([xo, d0, p1], [xo, yt1, p1], [xo, yt0, p0], [xo, d0, p0], CAP),
          s > 0 ? quadGeo([xi, yt0, p0], [xi, d0 + .25, p0], [xi, d1 + .25, p1], [xi, yt1, p1], CAP) : quadGeo([xi, yt1, p1], [xi, d1 + .25, p1], [xi, d0 + .25, p0], [xi, yt0, p0], CAP),
          quadGeo([xi, yt0, p0], [xi, yt1, p1], [xo, yt1, p1], [xo, yt0, p0], CAP));
      }
      /* deck and the underside of the arch */
      parts.push(quadGeo([bx - W / 2, d0 + .25, p0], [bx - W / 2, d1 + .25, p1], [bx + W / 2, d1 + .25, p1], [bx + W / 2, d0 + .25, p0], '#bdb5a5'),
        quadGeo([bx - W / 2, a0, p0], [bx + W / 2, a0, p0], [bx + W / 2, a1, p1], [bx - W / 2, a1, p1], DARK));
    }
    /* cutwater pier between two arches */
    if (k) parts.push(geoTint(new THREE.CylinderGeometry(.75, .95, 2.4, 6).translate(bx - W / 2 - .35, .2, za), DARK), geoTint(new THREE.CylinderGeometry(.75, .95, 2.4, 6).translate(bx + W / 2 + .35, .2, za), DARK));
  }
  /* abutments and a few steps down to each bank */
  for (const [zz, dir] of [[z0, -1], [z1, 1]]) for (let i = 0; i < 4; i++) parts.push(geoTint(new THREE.BoxGeometry(W + .5, 1.1 - i * .27, 1).translate(bx, (1.1 - i * .27) / 2, zz + dir * (.5 + i)), STONE));
  const m = new THREE.Mesh(geoMerge(parts), decoMat); m.castShadow = m.receiveShadow = true; m.userData.info = info; pickables.push(m); scene.add(m);
  addLabel('石拱桥', bx, 9, (z0 + z1) / 2, true);
})();

/* Musical Island: a ribbed red-and-white shell, with a fan of grass steps beside it */
structBlock(function(){
  const [x, z] = P(1015, 295);
  const info = {name:'音乐岛', tag:'景观', desc:'湖西端红白相间的贝壳形穹顶，平面图上叫 Musical Island，旁边是一圈草坪台阶。从高处看像一枚扣在湖边的贝壳。', spawn:[-3, -66, 0.4]};
  const base = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, .8, 40), granite); base.position.set(x, .4, z); base.receiveShadow = true; scene.add(base);
  const shellGeo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = shellGeo.attributes.position;
  for (let i = 0; i < p.count; i++){ const vx = p.getX(i), vz = p.getZ(i), a = Math.atan2(vz, vx), f = 1 + .06 * Math.cos(a * 14); p.setX(i, vx * f); p.setZ(i, vz * f); }
  shellGeo.computeVertexNormals();
  /* white panels between red ribs (the ribs sit on the scallop ridges) and red hoops; the dark arch is the open mouth toward the lake */
  const scv = document.createElement('canvas'); scv.width = 512; scv.height = 256; const sg = scv.getContext('2d');
  sg.fillStyle = '#f6f1e8'; sg.fillRect(0, 0, 512, 256);
  sg.fillStyle = '#3b2824'; sg.beginPath(); sg.ellipse(256, 256, 44, 150, 0, 0, 7); sg.fill();
  sg.fillStyle = '#c9382d'; for (let k = 0; k <= 14; k++){ sg.fillRect(k * 512 / 14 - 5, 0, 10, 256); sg.fillRect((k + .5) * 512 / 14 - 1.5, 0, 3, 256); }
  for (let j = 1; j < 7; j++) sg.fillRect(0, 256 * j / 7 - 1.5, 512, 3);
  sg.fillRect(0, 248, 512, 8);
  const stex = new THREE.CanvasTexture(scv); stex.anisotropy = ANISO;
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({map:stex, roughness:.45})); shell.scale.set(11, 7.5, 11); shell.position.set(x, .8, z);
  shell.castShadow = shell.receiveShadow = true; scene.add(shell);
  /* grass steps fanning out on the landward side */
  const steps = [];
  for (let k = 0; k < 3; k++) arcStep(steps, x, z, 16.4 + k * 2.3, 18.7 + k * 2.3, Math.PI * .62, Math.PI * 1.42, k * .32, (k + 1) * .32, k % 2 ? '#476a32' : '#527838', '#cfc9bb', 14);
  const stepMesh = new THREE.Mesh(geoMerge(steps), decoMat); stepMesh.receiveShadow = true; scene.add(stepMesh);
  [base, shell, stepMesh].forEach(m => { m.userData.info = info; pickables.push(m); });
  addCircle(x, z, 15.5); addFp({t:1, x, z, r:15});
  addLabel('音乐岛', x, 14, z, true);
})();

/* ---------- 一主四从: A1–A5 ---------- */
const sideDesc = '"一主四从"里的"从"楼之一：讲堂、课室、电脑室和实验室都在这几栋。';
building({arcade:true, bay:true, gable:true, eaveLight:true, name:'A1', tag:'教学', desc:sideDesc + '它在最西端，紧挨礼堂。', floors:6, px:900, py:640, wp:95, dp:85, rot:18, variant:1, plaque:{text:'A1'}});
const A_ST = [structures[structures.length - 1]];
building({arcade:true, bay:true, gable:true, eaveLight:true, name:'A2', tag:'教学', desc:sideDesc, floors:6, px:1015, py:602, wp:100, dp:85, rot:8, plaque:{text:'A2'}});
A_ST.push(structures[structures.length - 1]);
const a3Info = {name:'A3 百姓大楼', tag:'主楼', floors:9,
  desc:'九层的百姓大楼，是"一主四从"主楼群正中间的主楼，正对正门。图书馆就在这里，2023 年 5 月试开放，可藏书 100 多万册，座位 2000 多个。上面几层是招生、财务等办公室。'};
const a3s = newStruct(a3Info);
/* A3 as it stands: a two-storey arcaded base with a terrace, the nine-storey block rising flush with its front, a skirt of eaves under the top floor
   and a deep hipped roof round a flat skylit top (重檐), and in front six tall round columns on a curved porch above the wide steps. Same footprint and colliders as before. */
building({arcade:true, portico:{w:36, h:13.4, curve:3.4, r:2.1}, flat:true, struct:a3s, px:1155, py:575, wp:140, dp:115, floors:2, info:a3Info, label:false, variant:1, plaque:{text:'百姓大楼', w:5.6, y:15.15, z:40.2}});
A_ST.push(a3s);
const a3t = building({struct:a3s, px:1155, py:585.5, wp:124, dp:92, floors:9, info:a3Info, label:'A3 百姓大楼', variant:0, roofH:8.5, over:3.8, roofCut:.6, noCollide:true, waist:[8], waistOver:3, eaveLight:true});
building({arcade:true, bay:true, gable:true, eaveLight:true, name:'A4', tag:'教学', desc:sideDesc, floors:6, px:1295, py:580, wp:110, dp:85, plaque:{text:'A4'}});
A_ST.push(structures[structures.length - 1]);
building({arcade:true, bay:true, gable:true, eaveLight:true, name:'A5', tag:'教学', desc:sideDesc + '再往东走就是 B1 和运动场。', floors:6, px:1425, py:585, wp:110, dp:85, rot:-3, variant:1, plaque:{text:'A5'}});
A_ST.push(structures[structures.length - 1]);
building({name:'礼堂', tag:'教学', desc:'A1 旁边的礼堂（Auditorium）。', floors:2, px:815, py:680, wp:75, dp:42, rot:18, roof:'#b9b2a6', roofH:4, minor:true, canopy:'front', plaque:{text:'礼堂', w:4, y:5.2, z:12.65}});
const iaec = {name:'国际学术交流中心', tag:'交流', desc:'International Academic Exchange Centre。教学区西边一排两层的小楼。'};
[[565,650],[612,650],[660,648],[706,645]].forEach(([px, py], i) => building({px, py, wp:38, dp:24, floors:2, rot:-3, info:iaec, label:i === 1 ? '国际学术交流中心' : false, minor:true, canopy:'front'}));

/* 连廊: covered walkways joining the arcades of the A row (each hangs off the western building, so it goes when that one is swallowed) */
(function(){
  const A = [[900, 640, 95, 85, 18], [1015, 602, 100, 85, 8], [1155, 575, 140, 115, 0], [1295, 580, 110, 85, 0], [1425, 585, 110, 85, -3]];
  const edge = ([px, py, wp, dp, rot], sx) => { const [x, z] = P(px, py), r = -rot * D2R, lx = sx * S(wp) / 2, lz = S(dp) / 2 + 1.2; return [x + lx * Math.cos(r) + lz * Math.sin(r), z - lx * Math.sin(r) + lz * Math.cos(r)]; };
  const M4 = new THREE.Matrix4(), inv = new THREE.Matrix4();
  for (let i = 0; i < A.length - 1; i++){
    const a = edge(A[i], 1), b = edge(A[i + 1], -1), dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) + 1.2, y = 5.25;
    const deco = [], rp = roofParts(L, 2.6, 1.15, .55, 0, y + .55, 0);
    tbox(deco, L, .5, 3, 0, y + .25, 0, TRIM); tbox(deco, L, .16, 3.3, 0, y + .58, 0, TRIM2);
    for (const e of [-1, 1]) for (const s of [-1, 1]) tbox(deco, .45, y, .45, e * (L / 2 - .5), y / 2, s * 1.1, PIL);
    const st = A_ST[i], g = st.groups[0]; g.updateMatrixWorld(true);
    M4.compose(_cp.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2), _cq.setFromAxisAngle(UP, Math.atan2(-dz, dx)), _cs.set(1, 1, 1)).premultiply(inv.copy(g.matrixWorld).invert());
    const ms = [new THREE.Mesh(geoMerge(deco), decoMat)]; ms[0].castShadow = ms[0].receiveShadow = true; g.add(ms[0]);
    ms.push(...roofMeshes(rp, roofMat('#c4502a'), g));
    for (const m of ms){ m.geometry.applyMatrix4(M4); m.userData.info = st.info; pickables.push(m); }
  }
})();

/* Phase 2 */
const p2 = {name:'研究生研究中心（二期）', tag:'二期', desc:'平面图上用红色虚线圈出的二期项目，标注为研究生研究中心（Postgraduate Research Centre）。', spawn:[-408, 70, 0]};
[[175,295,-10],[160,392,0],[300,430,15],[392,485,-20],[190,492,10],[440,578,0],[420,668,10]].forEach(([px, py, r], i) =>
  building({arcade:true, px, py, rot:r, wp:80, dp:70, floors:4, roof:'#a8552f', info:p2, label:i === 2 ? '研究生研究中心（二期）' : false, minor:true}));

/* LY dorm towers + LY3 dining */
const lyDesc = '校内宿舍楼。十字形平面的高层塔楼，房间带独立卫浴。';
[['LY6',820,95],['LY7',945,95],['LY8',1200,90],['LY9',1340,90],['LY2',975,190],['LY4',1200,175],['LY5',1320,178]].forEach(([n, px, py]) =>
  crossB({name:n, tag:'宿舍', desc:lyDesc, px, py, ap:64, tp:22, bp:64, floors:16, variant:2, roof:'#c24d2a', minor:true, brick:4, crown:true, digit:+n.slice(2)}));
crossB({name:'LY1', tag:'LY 区', desc:'LY 区的一栋。官网的住宿页没有列出它的用途。', px:870, py:205, ap:64, tp:22, bp:64, floors:16, variant:2, roof:'#c24d2a', minor:true, brick:4, crown:true, digit:1});
building({arcade:true, name:'LY3 食堂', tag:'食堂', desc:'LY 宿舍区的食堂（一楼）。南面的半圆形草坪上立着 XMUM 字样。', px:1075, py:115, wp:105, dp:115, floors:3, roofH:10, plaque:{text:'LY3 食堂', w:6, y:7.6}});
(function(){
  const [x, z] = P(1075, 215);
  const semi = new THREE.Mesh(new THREE.CircleGeometry(22, 32, 0, Math.PI), flatMat('#4f7436', 8));
  semi.rotation.x = -Math.PI / 2; semi.position.set(x, .06, z - 14); scene.add(semi);
  /* XMUM spelled in clipped shrubs on a paved bed, readable from the lake side (south) */
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(40, 11), flatMat('#d8b99c', 9)); bed.rotation.x = -Math.PI / 2; bed.position.set(x, .07, z - 7); bed.receiveShadow = true; scene.add(bed);
  const hedge = [], hr = mkRng(888), GREENS = ['#3f7d36', '#4a8a3c', '#37702f'];
  /* a stroke from (u0, v0) to (u1, v1) in letter space: u to the east, v to the north */
  const stroke = (cu, u0, v0, u1, v1) => {
    const ax = x + cu + u0, az = z - 7 - v0, bx = x + cu + u1, bz = z - 7 - v1, len = Math.hypot(bx - ax, bz - az);
    hedge.push(geoTint(geoAt(roundBox(len + 1, .95, 1.15, .28, 1), (ax + bx) / 2, .5, (az + bz) / 2, 0, Math.atan2(-(bz - az), bx - ax), 0), GREENS[(hr() * 3) | 0]));
  };
  const LET = {X:[[-2.4, -3.4, 2.4, 3.4], [-2.4, 3.4, 2.4, -3.4]], M:[[-2.6, -3.4, -2.6, 3.4], [2.6, -3.4, 2.6, 3.4], [-2.6, 3.4, 0, -.6], [2.6, 3.4, 0, -.6]], U:[[-2.4, 3.4, -2.4, -3.4], [2.4, 3.4, 2.4, -3.4], [-2.4, -3.4, 2.4, -3.4]]};
  'XMUM'.split('').forEach((ch, i) => LET[ch].forEach(s => stroke(-13.5 + i * 9, ...s)));
  const word = new THREE.Mesh(geoMerge(hedge), decoMat); word.castShadow = word.receiveShadow = true; scene.add(word);
})();

/* D dorms around D6 dining */
const dDesc = '校内宿舍楼，围着圆形的 D6 食堂，离东门最近。';
[['D5',1478,112,-18],['D4',1468,212,-18],['D2',1720,212,20],['D3',1612,270,20],['D1',1740,292,20]].forEach(([n, px, py, r]) =>
  crossB({name:n, tag:'宿舍', desc:dDesc, px, py, rot:r, ap:100, tp:24, bp:50, floors:7, variant:2, minor:true}));
structBlock(function d6(){
  const [x, z] = P(1610, 175), r = S(45), floors = 3, H = floors * 3.6;
  const info = {name:'D6 食堂', tag:'食堂', desc:'D 区正中的圆形建筑，一楼是食堂。屋顶是一圈白色的环，中间是采光的玻璃顶。', floors, wx:x, wz:z, wd:r * 2, wrot:0};
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.2, r + 1.2, 1, 48), granite); base.position.set(x, .5, z);
  const geo = new THREE.CylinderGeometry(r, r, H, 56, 1, true); const uv = geo.attributes.uv, bays = Math.round(2 * Math.PI * r / 4.5);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bays / 4, uv.getY(i) * floors / 4);
  geoTint(geo, '#ffffff');   /* the wall materials use vertex colours */
  const body = new THREE.Mesh(geo, wallMats[1]); body.position.set(x, 1 + H / 2, z);
  const prof = []; for (let i = 0; i <= 8; i++){ const s = i / 8; prof.push(new THREE.Vector2((r + 3) * (1 - s) + r * .45 * s, 3.2 * Math.pow(s, 1.5))); }
  const roof = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M('#eceae4', {side:THREE.DoubleSide, roughness:.5})); roof.position.set(x, 1 + H, z);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r * .45, r * .45, 2.4, 40), M('#9cc7d8', {roughness:.15, metalness:.3})); glass.position.set(x, 1 + H + 4.4, z);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * .45, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#cfe3ea', {roughness:.2, metalness:.2})); cap.scale.y = .25; cap.position.set(x, 1 + H + 5.6, z);
  /* ground-floor colonnade with a ring awning, ribs running up the white ring roof, and mullions on the glass drum */
  const cols = new THREE.InstancedMesh(colGeo, colMat, 30);
  for (let i = 0; i < 30; i++){ const a = i / 30 * Math.PI * 2; _cm.compose(_cp.set(x + Math.cos(a) * (r + .55), 1, z + Math.sin(a) * (r + .55)), _cq.identity(), _cs.set(.8, 4.1, .8)); cols.setMatrixAt(i, _cm); }
  cols.frustumCulled = false;
  const dk = [geoTint(new THREE.CylinderGeometry(r + 2.3, r + 2.3, .5, 56, 1, true).translate(x, 5.35, z), TRIM),
    geoTint(new THREE.RingGeometry(r - .1, r + 2.3, 56, 1).rotateX(-Math.PI / 2).translate(x, 5.6, z), TRIM2),
    geoTint(new THREE.RingGeometry(r - .1, r + 2.3, 56, 1).rotateX(Math.PI / 2).translate(x, 5.1, z), TRIM)];
  for (let k = 0; k < 24; k++){
    const a = k / 24 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < 8; i++){ const p0 = prof[i], p1 = prof[i + 1]; dk.push(geoTint(rodGeo(.16, .16, [x + ca * p0.x, 1 + H + p0.y + .1, z + sa * p0.x], [x + ca * p1.x, 1 + H + p1.y + .1, z + sa * p1.x], 4), '#d9d5ca')); }
    if (k % 2 === 0) dk.push(geoTint(new THREE.BoxGeometry(.16, 2.4, .16).translate(x + ca * (r * .45 + .03), 1 + H + 4.4, z + sa * (r * .45 + .03)), '#e8e6e0'));
  }
  const ring = new THREE.Mesh(geoMerge(dk), decoMat);
  [base, body, roof, glass, cap, cols, ring].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); m.userData.info = info; pickables.push(m); });
  addCircle(x, z, r + 1.5); addFp({t:1, x, z, r});
  addLabel('D6 食堂', x, 1 + H + 12, z);
})();

/* B1, courts, field */
building({arcade:true, bay:true, name:'B1 学生活动中心', tag:'活动', floors:5, px:1700, py:400, wp:190, dp:88, roofH:7, variant:1,
  desc:'五层的学生活动中心。三楼有室内运动中心、健身房和游泳池；楼里还有课室、电脑室、学生服务大厅、自习区、中医诊所、超市、面包店和餐厅。', skylight:true, plaque:{text:'学生活动中心', w:7}});
const courtsInfo = {name:'户外球场', tag:'运动', desc:'Outdoor Courts：五人足球、网球、排球、篮球。'};
(function(){
  const [x, z] = P(1700, 512), w = S(190), d = S(85);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#3d7d5e'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#f4f1ea'; g.lineWidth = 3;
  for (let i = 0; i < 4; i++){ const cx = 12 + i * 125; g.fillStyle = i % 2 ? '#4a6fa5' : '#b65a3c'; g.fillRect(cx, 20, 112, 216); g.strokeRect(cx + 6, 26, 100, 204); g.beginPath(); g.moveTo(cx + 6, 128); g.lineTo(cx + 106, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({map:t, roughness:.9, polygonOffset:true, polygonOffsetFactor:-8, polygonOffsetUnits:-32}));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .06, z); m.receiveShadow = true; scene.add(m);
  m.userData.info = courtsInfo; pickables.push(m); footprints.push({t:2, x, z, w, d, rot:0, color:'#3d7d5e'});
  addLabel('户外球场', x, 6, z, true);
})();
const [FX, FZ] = P(1690, 690); const FIELD = {x:FX, z:FZ, rx:S(75), rz:S(100)};
const fieldInfo = {name:'田径场', tag:'运动', desc:'Field & Track：红色跑道围着足球场，东侧是看台。', spawn:[FX - 52, FZ, -Math.PI / 2]};
(function(){
  const track = new THREE.Mesh(new THREE.RingGeometry(.78, 1, 80), flatMat('#b9563d', 8));
  track.rotation.x = -Math.PI / 2; track.scale.set(FIELD.rx, FIELD.rz, 1); track.position.set(FIELD.x, .07, FIELD.z); track.receiveShadow = true; scene.add(track);
  const lane = new THREE.Mesh(new THREE.RingGeometry(.885, .892, 80), flatMat('#f4efe6', 9));
  lane.rotation.x = -Math.PI / 2; lane.scale.copy(track.scale); lane.position.set(FIELD.x, .08, FIELD.z); scene.add(lane);
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256; const g = cv.getContext('2d');
  for (let i = 0; i < 10; i++){ g.fillStyle = i % 2 ? '#4f9a45' : '#5ba650'; g.fillRect(0, i * 25.6, 16, 25.6); }
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(1, 80), new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(cv), roughness:.95, polygonOffset:true, polygonOffsetFactor:-8, polygonOffsetUnits:-32}));
  pitch.rotation.x = -Math.PI / 2; pitch.scale.set(FIELD.rx * .78, FIELD.rz * .78, 1); pitch.position.set(FIELD.x, .07, FIELD.z); pitch.receiveShadow = true; scene.add(pitch);
  [track, pitch].forEach(m => { m.userData.info = fieldInfo; pickables.push(m); });
  for (const sz of [-1, 1]){
    const gz = FIELD.z + sz * (FIELD.rz * .78 - 4);
    box(.2, 2.4, .2, white, FIELD.x - 3.6, 1.2, gz); box(.2, 2.4, .2, white, FIELD.x + 3.6, 1.2, gz); box(7.4, .2, .2, white, FIELD.x, 2.4, gz);
  }
  const standX = FIELD.x + FIELD.rx + 6;
  for (let i = 0; i < 4; i++) box(2.4, 1 + i * 1.1, S(150), M(i % 2 ? '#c9c2b6' : '#d8d1c5'), standX + i * 2.4, (1 + i * 1.1) / 2, FIELD.z);
  const sr = makeRoof(4, S(150), 2, 1.5, roofMat('#a8552f')); sr.position.set(standX + 6, 7, FIELD.z); scene.add(sr);
  for (const sz of [-1, 0, 1]) box(.4, 6, .4, white, standX + 7.5, 3.5, FIELD.z + sz * S(70));
  addBox(standX + 3.6, FIELD.z, 5.2, S(75), 0);
  addLabel('田径场', FIELD.x, 8, FIELD.z);
})();

/* ---------- south gate: granite name wall + pool + iron fence ---------- */
const [GX] = P(1180, 0), FENCE_Z = 214;
const gateInfo = {name:'南门（正门）', tag:'正门', spawn:[96, 238, 0],
  desc:'学校正门。黑色花岗岩名墙上刻着中英文校名，前面是一池水。走进来先经过陈嘉庚像，再沿中轴线走到 A3。'};
structBlock(function(){
  const wall = box(36, 3.6, 1.8, darkStone, GX, 1.8, 223); const cap = box(37, .4, 2.4, granite, GX, 3.8, 223);
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 112; const g = cv.getContext('2d');
  const paint = () => {
    g.fillStyle = '#2f3337'; g.fillRect(0, 0, 1024, 112); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d9d4c8'; g.font = '600 22px Georgia, serif'; g.fillText('XIAMEN  UNIVERSITY  MALAYSIA', 512, 20);
    g.fillStyle = '#e3c06a'; g.font = '700 62px "Noto Serif SC","Songti SC",serif'; g.fillText('厦门大学马来西亚分校', 512, 72);
  };
  paint();
  const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(33, 3.6), new THREE.MeshStandardMaterial({map:t, roughness:.4}));
  plaque.position.set(GX, 1.85, 223.92); scene.add(plaque);
  document.fonts && document.fonts.ready.then(() => { paint(); t.needsUpdate = true; });
  box(36, .7, 8, granite, GX, .35, 230.2);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(34.4, 6.6), waterMat); pool.rotation.x = -Math.PI / 2; pool.position.set(GX, .62, 230.2); scene.add(pool);
  [wall, cap, plaque].forEach(m => { m.userData.info = gateInfo; pickables.push(m); });
  addBox(GX, 226.6, 18.3, 5.2, 0);
  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 64; const f = fc.getContext('2d');
  f.fillStyle = '#1d2024'; f.fillRect(0, 2, 64, 5); f.fillRect(0, 50, 64, 4); for (let i = 0; i < 8; i++) f.fillRect(i * 8 + 3, 0, 2.5, 64);
  const ft = new THREE.CanvasTexture(fc); ft.wrapS = THREE.RepeatWrapping;
  const fenceMat = new THREE.MeshStandardMaterial({map:ft, alphaTest:.5, transparent:false, side:THREE.DoubleSide, roughness:.5, metalness:.4});
  for (const [x0, x1] of [[-585, GX - 30], [GX + 30, 590]]){
    const len = x1 - x0, tx = ft.clone(); tx.needsUpdate = true; tx.repeat.set(len / 2.2, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2), fenceMat.clone()); m.material.map = tx;
    m.position.set((x0 + x1) / 2, 1.1, FENCE_Z); m.castShadow = true; scene.add(m);
    addBox((x0 + x1) / 2, FENCE_Z, len / 2, .4, 0);
    for (const px of [x0, x1]) box(1.2, 2.8, 1.2, darkStone, px, 1.4, FENCE_Z);
  }
  addLabel('南门（正门）', GX, 9, 223);
})();
/* Tan Kah Kee statue */
structBlock(function(){
  const [x, z] = P(1180, 738);
  const info = {name:'陈嘉庚像', tag:'雕像', desc:'厦门大学创办人陈嘉庚的塑像。从正门进来先经过他，再往北就是"一主四从"的主楼群。', spawn:[x, z + 14, 0]};
  const bronze = M('#6d5638', {metalness:.55, roughness:.45});
  const ped = box(4.2, 3, 4.2, granite, x, 1.5, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.62, .95, 2.6, 16), bronze); body.position.set(x, 4.3, z);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.42, 16, 12), bronze); head.position.set(x, 5.95, z);
  [body, head].forEach(m => { m.castShadow = true; scene.add(m); });
  [ped, body, head].forEach(m => { m.userData.info = info; pickables.push(m); });
  addCircle(x, z, 3.2); addLabel('陈嘉庚像', x, 9, z, true);
})();
/* East gate */
structBlock(function(){
  const [x, z] = P(1898, 340);
  const info = {name:'东门', tag:'校门', desc:'东门，靠近 B1 学生活动中心和 D 区宿舍。', spawn:[x - 14, z, Math.PI / 2]};
  for (const sz of [-1, 1]){ const p = box(2.4, 8, 2.4, white, x, 4, z + sz * 9); p.userData.info = info; pickables.push(p); addBox(x, z + sz * 9, 1.4, 1.4, 0); }
  const beam = box(2, 1.6, 20.4, white, x, 7.6, z); beam.userData.info = info; pickables.push(beam);
  const r = makeRoof(2.6, 20.6, 1.8, 1.4, roofMat('#c4502a')); r.position.set(x, 8.4, z); scene.add(r);
  addLabel('东门', x, 14, z, true);
})();

/* ---------- the stepped lawns in front of the A row: bands of lighter and darker turf following the curve of the promenade, each edged with a low stone kerb ---------- */
(function(){
  const line = pxPts([[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]]), pts = [];
  for (let i = 0; i < line.length - 1; i++){ const [x0, z0] = line[i], [x1, z1] = line[i + 1], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 5); for (let k = 0; k < n; k++) pts.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]); }
  pts.push(line[line.length - 1]);
  /* smooth the polyline a little, then offset it toward the gate (south = +z) */
  for (let it = 0; it < 6; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4];
  const nor = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return dz * 0 + 1 && [-dz / l, dx / l]; });
  const off = (i, D) => [pts[i][0] + nor[i][0] * D, pts[i][1] + nor[i][1] * D];
  const ok = (x, z) => x > P(905, 0)[0] && x < P(1495, 0)[0] && Math.abs(x - GX) > 11.5;
  const turf = [], kerb = [], D0 = 8.5, BW = 6.2;
  for (let b = 0; b < 4; b++) for (let i = 0; i < pts.length - 1; i++){
    const a0 = off(i, D0 + b * BW), a1 = off(i + 1, D0 + b * BW), c0 = off(i, D0 + (b + 1) * BW), c1 = off(i + 1, D0 + (b + 1) * BW);
    if (!ok(a0[0], a0[1]) || !ok(a1[0], a1[1])) continue;
    if (b % 2 === 0) turf.push(quadGeo([a0[0], 0, a0[1]], [c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [a1[0], 0, a1[1]], '#ffffff'));
    /* kerb along the upper edge of the band: top and the face toward the gate */
    const k0 = off(i, D0 + b * BW + .55), k1 = off(i + 1, D0 + b * BW + .55), h = .3;
    kerb.push(quadGeo([a0[0], h, a0[1]], [k0[0], h, k0[1]], [k1[0], h, k1[1]], [a1[0], h, a1[1]], '#ded8ca'), quadGeo([k0[0], h, k0[1]], [k0[0], 0, k0[1]], [k1[0], 0, k1[1]], [k1[0], h, k1[1]], '#bfb8a8'),
      quadGeo([a0[0], 0, a0[1]], [a0[0], h, a0[1]], [a1[0], h, a1[1]], [a1[0], 0, a1[1]], '#bfb8a8'));
  }
  const tm = new THREE.Mesh(geoMerge(turf), regWet(flatMat('#42622e', 4), .55)); tm.position.y = .04; tm.receiveShadow = true; scene.add(tm);
  const km = new THREE.Mesh(geoMerge(kerb), decoMat); km.receiveShadow = true; scene.add(km);
})();

/* ---------- campus boundary hedge (visible, so the edge never feels like an invisible wall) ---------- */
(function(){
  const hedge = M('#3f6f34', {roughness:.95});
  for (const [x, z, w, d] of [[0, -276.5, 1206, 3], [(GX - 619) / 2, 263.5, GX + 587, 3], [(GX + 619) / 2, 263.5, 587 - GX, 3], [-601.5, -6.5, 3, 540], [601.5, -6.5, 3, 540]]){ const m = box(w, 1.8, d, hedge, x, .9, z); m.castShadow = false; }
})();

/* ---------- vegetation ---------- */
/* coconut palm: ringed, gently curving trunk; two layers of drooping, leafleted fronds; a coconut cluster (vertex colours) */
const palmTrunk = (N, seg) => {
  const pts = [], cols = [];
  for (let i = 0; i <= N; i++){
    const y = 8.4 * i / N, t = y / 8.4, r = (.4 + (.22 - .4) * t) * (1 + .35 * Math.max(0, 1 - y / .7) ** 2) * (i % 2 ? .93 : 1.04);
    pts.push(new THREE.Vector2(i === N ? 0 : r, y));
  }
  const g = new THREE.LatheGeometry(pts, seg), p = g.attributes.position, c = new Float32Array(p.count * 3), A = new THREE.Color('#8f7559'), B = new THREE.Color('#6b5643'), C = new THREE.Color();
  for (let i = 0; i < p.count; i++){
    const j = i % pts.length, y = p.getY(i); p.setX(i, p.getX(i) + .018 * y * y);
    C.copy(j % 2 ? B : A).lerp(new THREE.Color('#7d7a5a'), Math.max(0, (y - 7) / 1.4) * .6); c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
};
const trunkGeo = palmTrunk(12, 6), trunkFarGeo = palmTrunk(4, 4);
/* n = segments along a frond: 6 for the full model, 2 for the far one (same fronds, no coconuts) */
function crownGeometry(n, lite){
  if (!lite) for (let i = 0; i < 20; i++) rnd(); /* keep the shared random sequence (tree/lamp placement) exactly as before */
  const rr = mkRng(7331), pos = [], col = [], C = new THREE.Color(), base = new THREE.Color('#2d6a2c'), tip = new THREE.Color('#62a043'), old = new THREE.Color('#8a9a40');
  const frond = (a, L, rise, droop, wid, age) => {
    const ca = Math.cos(a), sa = Math.sin(a), pts = [];
    for (let i = 0; i <= n; i++){
      const s = i / n, r = L * s, y = rise * s - droop * s * s, w = (wid * Math.sin(Math.PI * Math.min(1, s * 1.08)) + .04) * (i % 2 ? .72 : 1), fold = .22 * w, ey = y - .12 * w;
      pts.push([ca * r - sa * w, ey, sa * r + ca * w], [ca * r, y + fold, sa * r], [ca * r + sa * w, ey, sa * r - ca * w]);
    }
    for (let i = 0; i < n; i++){
      const [l0, c0, r0] = pts.slice(i * 3, i * 3 + 3), [l1, c1, r1] = pts.slice(i * 3 + 3, i * 3 + 6);
      pos.push(...l0, ...c0, ...c1, ...l0, ...c1, ...l1, ...c0, ...r0, ...r1, ...c0, ...r1, ...c1);
      C.copy(base).lerp(tip, (i + .5) / n).lerp(old, age); for (let k = 0; k < 12; k++) col.push(C.r, C.g, C.b);
    }
  };
  for (let k = 0; k < 8; k++) frond(k / 8 * Math.PI * 2 + rr() * .3, 4.2 + rr() * 1.1, 1.0, 2.4 + rr() * .5, .9, .15 + rr() * .35);
  for (let k = 0; k < 4; k++) frond(k / 4 * Math.PI * 2 + .35 + rr() * .3, 3.2 + rr() * .6, 2.0, 1.6, .7, 0);
  const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g0.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g0.computeVertexNormals();
  if (lite){ g0.translate(.018 * 64, 8.2, 0); return g0; }
  const nuts = [];
  for (let k = 0; k < 4; k++){ const a = k / 4 * Math.PI * 2 + .4; nuts.push(geoTint(new THREE.IcosahedronGeometry(.18, 0).translate(Math.cos(a) * .27, -.3 - (k % 2) * .12, Math.sin(a) * .27), k % 3 ? '#5f7a2a' : '#7a5a2a')); }
  nuts.push(geoTint(new THREE.CylinderGeometry(.17, .23, .55, 6, 1, true).translate(0, -.15, 0), '#56703a'));
  const g = geoMerge([g0, ...nuts]); g.translate(.018 * 64, 8.2, 0); return g;
}
const crownGeo = crownGeometry(6), crownFarGeo = crownGeometry(2, true);
/* rain tree: wide umbrella canopy built from jittered faceted lumps (lighter on top), a trunk that forks into limbs */
const canopyGeo = (() => {
  const lumps = [geoAt(new THREE.IcosahedronGeometry(3.1, 1), 0, 5.6, 0, 0, 0, 0, 1.3, .62, 1.3), geoAt(new THREE.IcosahedronGeometry(1.9, 0), .2, 6.5, -.3, 0, 0, 0, 1, .75, 1)];
  for (let k = 0; k < 3; k++){ const a = k / 3 * Math.PI * 2 + .3; lumps.push(geoAt(new THREE.IcosahedronGeometry(1.75 + (k % 2) * .3, 0), Math.cos(a) * 2.5, 5.15 + (k % 3) * .3, Math.sin(a) * 2.5, 0, 0, 0, 1.1, .66, 1.1)); }
  const g = geoMerge(lumps), p = g.attributes.position, c = new Float32Array(p.count * 3), rr = mkRng(4242);
  for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.3 - y * 1.3); p.setXYZ(i, x + h * .22, y + h * .16, z - h * .2); }
  for (let t = 0; t < p.count; t += 3){
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, v = Math.min(1.08, .62 + .2 * (y - 4.4) + (rr() - .5) * .12);
    for (let k = 0; k < 3; k++){ c[(t + k) * 3] = v; c[(t + k) * 3 + 1] = v; c[(t + k) * 3 + 2] = v; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
})();
/* far model of the rain tree: two lumps with the same shading, and a bare four-sided trunk */
const canopyFarGeo = (() => {
  const g = geoMerge([geoAt(new THREE.IcosahedronGeometry(3.35, 0), 0, 5.6, 0, 0, 0, 0, 1.3, .62, 1.3), geoAt(new THREE.IcosahedronGeometry(2.05, 0), .2, 6.5, -.3, 0, 0, 0, 1, .75, 1)]);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let t = 0; t < p.count; t += 3){ const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3, v = Math.min(1.08, .62 + .2 * (y - 4.4)); for (let k = 0; k < 9; k++) c[t * 3 + k] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
})();
const stumpFarGeo = new THREE.CylinderGeometry(.24, .48, 4.6, 4, 1, true).translate(0, 2.3, 0).toNonIndexed();
const stumpGeo = geoMerge([new THREE.CylinderGeometry(.3, .48, 3.4, 7, 1, true).translate(0, 1.7, 0), rodGeo(.26, .16, [0, 3.0, 0], [1.5, 4.9, .5], 5), rodGeo(.26, .16, [0, 3.0, 0], [-1.2, 5.0, .9], 5),
  rodGeo(.24, .14, [0, 3.1, 0], [-.3, 5.1, -1.5], 5)]);
function free(x, z, pad){
  if (hitsBuilding(x, z, pad)) return false;
  if (onRoad(x, z, pad)) return false;
  for (const L of lakeRims) if (inPoly(x, z, L)) return false;
  let ex = (x - FIELD.x) / (FIELD.rx + pad), ez = (z - FIELD.z) / (FIELD.rz + pad); if (ex * ex + ez * ez < 1) return false;
  for (const f of footprints) if (f.t === 2 && Math.abs(x - f.x) < f.w / 2 + pad && Math.abs(z - f.z) < f.d / 2 + pad) return false;
  if (inPoly(x, z, LAWN_SQ)) return false;
  if (z > FENCE_Z - 3) return false;
  return true;
}
const palms = [], trees = [], blooms = [];
const sp = (x, z, s) => ({x, z, r:rnd() * 6.28, s:(s || 1) * (.85 + rnd() * .35)});
for (let z = 140; z <= 206; z += 9) for (const sx of [-1, 1]) palms.push(sp(GX + sx * 11, z));
function alongPath(pxLine, step, offsets, out, pad){
  const pts = pxPts(pxLine);
  for (let i = 0; i < pts.length - 1; i++){
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], l = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / l, nz = (x1 - x0) / l;
    for (let s = 0; s < l; s += step) for (const o of offsets){
      const x = x0 + (x1 - x0) * s / l + nx * o, z = z0 + (z1 - z0) * s / l + nz * o;
      if (free(x, z, pad || 1)) out.push(sp(x, z));
    }
  }
}
alongPath([[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]], 14, [-11, 11], palms);
alongPath([[1580,340],[1580,830]], 16, [-8, 8], palms);
alongPath([[760,265],[1000,258],[1250,262],[1420,262],[1520,295],[1580,340]], 15, [-8, 8], palms);
alongPath([[300,855],[120,815],[45,690],[40,320],[95,140],[240,40],[560,22],[1000,25],[1500,28],[1830,35],[1905,110],[1905,855],[300,855]], 22, [-10], trees, 2);
lakeRims.forEach(rim => { for (let i = 0; i < rim.length; i += 3){ const [x, z] = rim[i]; const o = sp(x, z); if (free(x + .1, z + .1, .5) || !hitsBuilding(x, z, 2)) palms.push(o); } });
for (let n = 0, tries = 0; n < 650 && tries < 9000; tries++){
  const x = -560 + rnd() * 1150, z = -270 + rnd() * 500;
  if (!inPoly(x, z, FOREST) || !free(x, z, 2.5)) continue;
  trees.push(sp(x, z, 1.1 + rnd() * .4)); n++;
}
for (let n = 0, tries = 0; n < 330 && tries < 9000; tries++){
  const x = -570 + rnd() * 1160, z = -265 + rnd() * 470;
  if (inPoly(x, z, FOREST) || !free(x, z, 5)) continue;
  (rnd() < .18 ? blooms : trees).push(sp(x, z)); n++;
}
/* one instanced model per spot, split by map cell (ChunkIM in js/00-core.js): off-screen cells are culled, and with o.far the distant ones use a low-poly model */
function instanced(geo, mat, spots, o){ return new ChunkIM(geo, mat, spots, o); }
const bark = M('#8a6f55');
const LOD_PALM = far => ({far, dist:130, size:14, shadowFar:true}), LOD_TREE = far => ({far, dist:150, size:12, shadowFar:true});
const knockSets = [
  {kind:'tree', spots:palms,  ims:[instanced(trunkGeo, M('#ffffff', {vertexColors:true, roughness:.95}), palms, LOD_PALM(trunkFarGeo)), instanced(crownGeo, M('#ffffff', {side:THREE.DoubleSide, roughness:.8, vertexColors:true}), palms, LOD_PALM(crownFarGeo))]},
  {kind:'tree', spots:trees,  ims:[instanced(stumpGeo, bark, trees, LOD_TREE(stumpFarGeo)), instanced(canopyGeo, M('#4f8f3c', {flatShading:true, vertexColors:true}), trees, LOD_TREE(canopyFarGeo))]},
  {kind:'tree', spots:blooms, ims:[instanced(stumpGeo, bark, blooms, LOD_TREE(stumpFarGeo)), instanced(canopyGeo, M('#e2662c', {flatShading:true, vertexColors:true}), blooms, LOD_TREE(canopyFarGeo))]}
];

/* no two trees quite the same green: a private random stream tints each one (lighter, darker, yellower, bluer) */
(function(){
  const rr = mkRng(31337), c = new THREE.Color();
  const tint = (set, sat, spread) => set.spots.forEach((o, i) => {
    const v = .86 - spread / 2 + rr() * spread, h = rr() - .5;
    c.setRGB(v * (1 + h * sat), v * (1 + Math.abs(h) * .05), v * (1 - h * sat * .8)); set.ims[1].setColorAt(i, c);
  });
  tint(knockSets[0], .16, .22); tint(knockSets[1], .34, .34); tint(knockSets[2], .2, .26);
})();

/* lamps */
const lampSpots = [];
for (let z = 140; z <= 206; z += 16) for (const sx of [-1, 1]) lampSpots.push({x:GX + sx * 8.5, z, r:0, s:1});
(function(){
  const out = []; alongPath([[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]], 24, [-7.5, 7.5], out, .2);
  out.forEach(o => lampSpots.push({x:o.x, z:o.z, r:0, s:1}));
  lakeRims.forEach(rim => { for (let i = 0; i < rim.length; i += 4) lampSpots.push({x:rim[i][0], z:rim[i][1], r:0, s:1}); });
})();
/* lamp: stepped plinth, slim fluted post with collars, and a hexagonal lantern under a cap */
const postGeo = geoMerge([new THREE.CylinderGeometry(.2, .24, .35, 6).translate(0, .175, 0), new THREE.CylinderGeometry(.13, .17, .3, 6).translate(0, .5, 0),
  new THREE.CylinderGeometry(.065, .085, 3.6, 6, 1, true).translate(0, 2.4, 0), new THREE.CylinderGeometry(.1, .1, .08, 6, 1, true).translate(0, 1.4, 0),
  new THREE.CylinderGeometry(.12, .08, .18, 6).translate(0, 4.22, 0), new THREE.CylinderGeometry(.05, .3, .2, 6).translate(0, 4.92, 0), new THREE.ConeGeometry(.06, .22, 6).translate(0, 5.12, 0),
  ...[0, 1, 2, 3, 4, 5].map(k => new THREE.BoxGeometry(.025, .5, .025).translate(Math.cos(k * Math.PI / 3 + Math.PI / 6) * .24, 4.56, Math.sin(k * Math.PI / 3 + Math.PI / 6) * .24))]);
const bulbGeo = new THREE.CylinderGeometry(.26, .2, .48, 6); bulbGeo.translate(0, 4.56, 0);
const postFarGeo = geoMerge([new THREE.CylinderGeometry(.075, .17, 4.3, 3, 1, true).translate(0, 2.15, 0), new THREE.ConeGeometry(.3, .42, 4).translate(0, 5.0, 0)]), bulbFarGeo = new THREE.CylinderGeometry(.26, .2, .48, 4).translate(0, 4.56, 0);
const LOD_LAMP = far => ({far, dist:110, size:6});
const bulbMat = new THREE.MeshStandardMaterial({color:'#fff8ea', emissive:'#ffd59a', emissiveIntensity:0});
knockSets.push({kind:'lamp', spots:lampSpots, ims:[instanced(postGeo, M('#3b3f44', {metalness:.4, roughness:.5}), lampSpots, LOD_LAMP(postFarGeo)), instanced(bulbGeo, bulbMat, lampSpots, LOD_LAMP(bulbFarGeo))]});

/* ---------- sky dressing ---------- */
/* gradient dome: horizon colour (same as the fog) rising to the zenith colour, with a glow and a disc where the sun or moon is.
   Drawn after the opaque scene with depth test on, so only the pixels of open sky are shaded. */
const skyU = {top:{value:new THREE.Color('#4a97e0')}, hor:{value:new THREE.Color('#9fd2ef')}, sunCol:{value:new THREE.Color('#fff4e2')}, sunDir:{value:new THREE.Vector3(0, 1, 0)}, glow:{value:1}};
const sky = new THREE.Mesh(new THREE.SphereGeometry(5200, 24, 12), new THREE.ShaderMaterial({uniforms:skyU, side:THREE.BackSide, depthWrite:false, fog:false,
  vertexShader:'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:`uniform vec3 top, hor, sunCol, sunDir; uniform float glow; varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float h = max(d.y, 0.0), k = 1.0 - pow(1.0 - h, 2.6);
      vec3 c = mix(hor, top, k);
      float s = max(dot(d, sunDir), 0.0);
      c += sunCol * glow * (pow(s, 900.0) * 1.6 + pow(s, 40.0) * 0.22 + pow(s, 5.0) * 0.10) * smoothstep(-0.06, 0.04, d.y);
      gl_FragColor = vec4(c, 1.0);
    }`}));
sky.renderOrder = 100; sky.frustumCulled = false; scene.add(sky);
const starGeo = new THREE.BufferGeometry(); const sv = [];
for (let i = 0; i < 1400; i++){ const a = rnd() * 6.283, e = Math.asin(.08 + rnd() * .92), R = 4000; sv.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
const starMat = new THREE.PointsMaterial({color:'#ffffff', size:1.7, sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false});
const stars = new THREE.Points(starGeo, starMat); scene.add(stars);
const moonMat = new THREE.MeshBasicMaterial({color:'#f4f0da', transparent:true, opacity:0, fog:false});
const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), moonMat); scene.add(moon);
/* cumulus: each cloud is one merged mesh of puffs with a flat base, lit top and a cool grey belly (vertex colours, tinted by time of day) */
const cloudMat = new THREE.MeshLambertMaterial({color:'#ffffff', vertexColors:true, transparent:true, opacity:.95, depthWrite:false});
const clouds = [];
(function(){
  const rr = mkRng(5150), top = new THREE.Color('#ffffff'), belly = new THREE.Color('#b9c3cf'), C = new THREE.Color();
  const puffGeo = (s, sx, sy, sz, x, y, z) => {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
    for (let k = 0; k < p.count; k++){ if (p.getY(k) < -.25) p.setY(k, -.25 - (p.getY(k) + .25) * .12); }
    return g.scale(s * sx, s * sy, s * sz).translate(x, y, z);
  };
  for (let i = 0; i < 16; i++){
    const parts = [];
    /* same rnd() calls as the old per-puff meshes, so everything placed after the clouds stays put */
    for (let j = 0, n = 4 + (rnd() * 4 | 0); j < n; j++){ const s = 18 + rnd() * 18; parts.push(puffGeo(s, 1.4, .55, 1, j * 22 - n * 10 + rnd() * 8, rnd() * 6, rnd() * 18 - 9)); }
    const n2 = 2 + (rr() * 3 | 0);
    for (let j = 0; j < n2; j++){ const s = 12 + rr() * 10; parts.push(puffGeo(s, 1.1, .8, 1, (rr() - .5) * 60, 8 + rr() * 6, (rr() - .5) * 14)); }
    const g = geoMerge(parts), p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++){ C.copy(belly).lerp(top, Math.min(1, Math.max(0, (p.getY(k) + 6) / 20))); c[k * 3] = C.r; c[k * 3 + 1] = C.g; c[k * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, cloudMat); m.renderOrder = -1;
    m.position.set(rnd() * 3000 - 1500, 320 + rnd() * 120, rnd() * 2400 - 1200); scene.add(m); clouds.push(m);
  }
})();

/* ---------- checkpoints ---------- */
const CPW = [
  ['南门', 96, 222], ['A3 百姓大楼', ...P(1180, 668)], ['音乐岛', ...P(975, 330)], ['中心湖', ...P(1360, 505)],
  ['LY3 食堂', ...P(1075, 222)], ['D6 食堂', ...P(1545, 175)], ['田径场', FX, FZ], ['研究生中心', ...P(300, 555)]
];
const CPS = CPW.map(([name, x, z]) => ({name, x, z}));
const coinGeo = new THREE.CylinderGeometry(1.5, 1.5, .32, 36); coinGeo.rotateX(Math.PI / 2);
const coinIn = new THREE.TorusGeometry(1, .13, 8, 36);
const coinMat = M('#e0b23c', {metalness:.65, roughness:.3, emissive:'#7a5208', emissiveIntensity:.5});
const beamGeo = new THREE.CylinderGeometry(.8, .8, 80, 14, 1, true); beamGeo.translate(0, 40, 0);
const chipsEl = $('#chips');
CPS.forEach(cp => {
  const g = new THREE.Group(); g.position.set(cp.x, 2.4, cp.z);
  const coin = new THREE.Mesh(coinGeo, coinMat); coin.castShadow = true; coin.add(new THREE.Mesh(coinIn, coinMat));
  const bm = new THREE.MeshBasicMaterial({color:'#ffd56a', transparent:true, opacity:.24, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide});
  const beam = new THREE.Mesh(beamGeo, bm); beam.position.y = -2.4;
  g.add(coin, beam); scene.add(g);
  Object.assign(cp, {g, coin, bm, done:false, fade:1, phase:rnd() * 6});
  const chip = document.createElement('span'); chip.textContent = cp.name; chipsEl.appendChild(chip); cp.chip = chip;
});
let collected = 0, walkStart = 0, finished = false;

/* ---------- time of day ---------- */
const P3 = {
  /* bg = horizon and fog colour, top = zenith colour, glow = strength of the halo round the sun or moon */
  day:  {bg:'#a8d8f0', top:'#3f8fe0', glow:.9,  hs:'#e2f0ff', hg:'#5a7040', hi:.68, sc:'#fff3dc', si:1.08, d:[.35,.9,.28],  win:0,   lamp:0,   stars:0,  moon:0, cloud:.95, cc:'#ffffff', water:'#4f877a', fn:900, ff:2600},
  dusk: {bg:'#f2a878', top:'#4f5f9e', glow:1.5, hs:'#ffcfa6', hg:'#4a3d38', hi:.5,  sc:'#ffa860', si:1.02, d:[-.9,.26,.25], win:.8,  lamp:.9,  stars:.1, moon:0, cloud:.8,  cc:'#ffcdb6', water:'#7b6f90', fn:700, ff:2200},
  night:{bg:'#142548', top:'#050b1d', glow:.35, hs:'#3a5385', hg:'#0e1218', hi:.42, sc:'#a9bdf5', si:.34, d:[-.35,.85,-.4],win:1.2, lamp:1.5, stars:1,  moon:1, cloud:.14, cc:'#3a4560', water:'#16263f', fn:550, ff:1900}
};
const P3_COL = ['bg','top','hs','hg','sc','cc','water'], P3_NUM = ['hi','si','win','lamp','stars','moon','cloud','fn','ff','glow'];
for (const k in P3){ const p = P3[k]; P3_COL.forEach(f => p[f] = new THREE.Color(p[f])); p.d = new THREE.Vector3(...p.d).normalize(); }
const cur = {d:P3.day.d.clone()};
P3_COL.forEach(f => cur[f] = P3.day[f].clone()); P3_NUM.forEach(f => cur[f] = P3.day[f]);
let tgt = P3.day;
function applyTime(k){
  for (const f of P3_COL) cur[f].lerp(tgt[f], k);
  cur.d.lerp(tgt.d, k).normalize();
  for (const f of P3_NUM) cur[f] += (tgt[f] - cur[f]) * k;
  scene.background.copy(cur.bg); scene.fog.color.copy(cur.bg); scene.fog.near = cur.fn; scene.fog.far = cur.ff;
  skyU.hor.value.copy(cur.bg); skyU.top.value.copy(cur.top); skyU.sunCol.value.copy(cur.sc); skyU.sunDir.value.copy(cur.d); skyU.glow.value = cur.glow;
  sky.position.copy(camera.position);
  hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
  sun.color.copy(cur.sc); sun.intensity = cur.si; sun.position.copy(cur.d).multiplyScalar(1000).add(sun.target.position);
  for (const m of wallMats) m.emissiveIntensity = cur.win;
  eaveMat.emissiveIntensity = Math.min(1.6, cur.lamp * 1.3);
  bulbMat.emissiveIntensity = cur.lamp;
  starMat.opacity = cur.stars; stars.visible = cur.stars > .01;
  moonMat.opacity = cur.moon; moon.visible = cur.moon > .01; moon.position.copy(cur.d).multiplyScalar(3600);
  cloudMat.opacity = cur.cloud; cloudMat.color.copy(cur.cc);
  waterMat.color.copy(cur.water);
  /* afternoon shower: grey the sky, thicken the haze, dim the sun, light the lamps; wet surfaces darken and turn glossy */
  const r = wx.rain;
  if (r > .001){
    const l = (cur.bg.r * .3 + cur.bg.g * .59 + cur.bg.b * .11) * .82;
    _rainC.setRGB(l * .93, l * .98, l * 1.06); scene.background.lerp(_rainC, r * .85); scene.fog.color.copy(scene.background);
    skyU.hor.value.copy(scene.background); skyU.top.value.lerp(_rainC.multiplyScalar(.8), r * .9); skyU.glow.value = cur.glow * (1 - r);
    scene.fog.near = cur.fn * (1 - .6 * r); scene.fog.far = cur.ff * (1 - .45 * r);
    hemi.intensity = cur.hi * (1 - .12 * r); sun.intensity = cur.si * (1 - .7 * r);
    cloudMat.opacity = cur.cloud + (1 - cur.cloud) * r; _rainC.copy(cur.cc).multiplyScalar(.62); cloudMat.color.lerp(_rainC, r);
    waterMat.color.lerp(_rainC.setRGB(l * .55, l * .62, l * .7), r * .6);
    bulbMat.emissiveIntensity = Math.max(cur.lamp, r * .9);
  }
  if (Math.abs(wx.wet - lastWet) > .002 || (wx.wet === 0 && lastWet !== 0)){
    lastWet = wx.wet;
    for (const [m, c, r0, r1] of wetMats){ m.color.copy(c).multiplyScalar(1 - .32 * lastWet); m.roughness = r0 + (r1 - r0) * lastWet; }
  }
}
const _rainC = new THREE.Color(); let lastWet = 0;
document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
  tgt = P3[b.dataset.t];
  document.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));
