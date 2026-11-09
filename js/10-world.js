/* XMUM 校园漫游 · 地面、道路、湖、所有楼、植物、天空、打卡点、昼夜 */
'use strict';
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), M('#4f7a3b'));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
flatPoly(pxPts([[300,870],[100,820],[25,690],[22,320],[80,120],[240,20],[560,5],[1840,12],[1925,100],[1925,870]]), flatMat('#74a955', 1), .02, false);
const FOREST = pxPts([[330,60],[760,45],[790,240],[900,290],[980,440],[900,540],[760,600],[560,640],[510,560],[500,440],[330,260],[250,170]]);
flatPoly(FOREST, flatMat('#4d8a3e', 2), .03, true);
const LAWN_SQ = pxPts([[385,140],[600,130],[640,200],[630,330],[400,340],[380,250]]);
flatPoly(LAWN_SQ, flatMat('#8cbf62', 3), .035, false);
const GATE_LAWNS = [pxPts([[890,738],[1000,712],[1166,706],[1166,800],[900,800]]), pxPts([[1194,706],[1350,708],[1500,722],[1500,800],[1194,800]])];
GATE_LAWNS.forEach(L => flatPoly(L, flatMat('#8cc461', 3), .035, true));

/* ---------- roads ---------- */
const asphalt = flatMat('#74716b', 4), paving = flatMat('#9c917e', 5), pathMat = flatMat('#a59a86', 6);
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
const kerbMat = flatMat('#b9b0a0', 3);
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
const waterMat = M('#3f8fb0', {roughness:.18, metalness:.15, polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-36, side:THREE.DoubleSide});
const rimMat = flatMat('#cfc2aa', 7);
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

/* Musical Island: pink shell dome */
structBlock(function(){
  const [x, z] = P(1015, 295);
  const info = {name:'音乐岛', tag:'景观', desc:'湖西端的粉色贝壳形圆顶，平面图上叫 Musical Island。从高处看像一枚扣在湖边的贝壳。', spawn:[-3, -66, 0.4]};
  const base = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, .8, 40), granite); base.position.set(x, .4, z); base.receiveShadow = true; scene.add(base);
  const shellGeo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = shellGeo.attributes.position;
  for (let i = 0; i < p.count; i++){ const vx = p.getX(i), vz = p.getZ(i), a = Math.atan2(vz, vx), f = 1 + .06 * Math.cos(a * 14); p.setX(i, vx * f); p.setZ(i, vz * f); }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, M('#e6a7b4', {roughness:.5})); shell.scale.set(11, 7.5, 11); shell.position.set(x, .8, z);
  shell.castShadow = shell.receiveShadow = true; scene.add(shell);
  [base, shell].forEach(m => { m.userData.info = info; pickables.push(m); });
  addCircle(x, z, 15.5); addFp({t:1, x, z, r:15});
  addLabel('音乐岛', x, 14, z, true);
})();

/* ---------- 一主四从: A1–A5 ---------- */
const sideDesc = '"一主四从"里的"从"楼之一：讲堂、课室、电脑室和实验室都在这几栋。';
building({arcade:true, bay:true, name:'A1', tag:'教学', desc:sideDesc + '它在最西端，紧挨礼堂。', floors:6, px:900, py:640, wp:95, dp:85, rot:18, variant:1});
building({arcade:true, bay:true, name:'A2', tag:'教学', desc:sideDesc, floors:6, px:1015, py:602, wp:100, dp:85, rot:8});
const a3Info = {name:'A3 百姓大楼', tag:'主楼', floors:9,
  desc:'九层的百姓大楼，是"一主四从"主楼群正中间的主楼，正对正门。图书馆就在这里，2023 年 5 月试开放，可藏书 100 多万册，座位 2000 多个。上面几层是招生、财务等办公室。'};
const a3s = newStruct(a3Info);
building({arcade:true, portico:{w:36, h:13}, struct:a3s, px:1155, py:575, wp:140, dp:115, floors:5, info:a3Info, label:false, variant:1, roofH:9});
const a3t = building({struct:a3s, px:1155, py:575, wp:72, dp:58, floors:9, info:a3Info, label:false, variant:1, roofH:4, over:2.8, noCollide:true});
const a3c = building({struct:a3s, px:1155, py:575, wp:34, dp:26, floors:1.6, y0:a3t - 3.4, info:a3Info, label:'A3 百姓大楼', roofH:7, over:2.4, noCollide:true});
building({arcade:true, bay:true, name:'A4', tag:'教学', desc:sideDesc, floors:6, px:1295, py:580, wp:110, dp:85});
building({arcade:true, bay:true, name:'A5', tag:'教学', desc:sideDesc + '再往东走就是 B1 和运动场。', floors:6, px:1425, py:585, wp:110, dp:85, rot:-3, variant:1});
building({name:'礼堂', tag:'教学', desc:'A1 旁边的礼堂（Auditorium）。', floors:2, px:815, py:680, wp:75, dp:42, rot:18, roof:'#b9b2a6', roofH:4, minor:true});
const iaec = {name:'国际学术交流中心', tag:'交流', desc:'International Academic Exchange Centre。教学区西边一排两层的小楼。'};
[[565,650],[612,650],[660,648],[706,645]].forEach(([px, py], i) => building({px, py, wp:38, dp:24, floors:2, rot:-3, info:iaec, label:i === 1 ? '国际学术交流中心' : false, minor:true}));

/* Phase 2 */
const p2 = {name:'研究生研究中心（二期）', tag:'二期', desc:'平面图上用红色虚线圈出的二期项目，标注为研究生研究中心（Postgraduate Research Centre）。', spawn:[-408, 70, 0]};
[[175,295,-10],[160,392,0],[300,430,15],[392,485,-20],[190,492,10],[440,578,0],[420,668,10]].forEach(([px, py, r], i) =>
  building({arcade:true, px, py, rot:r, wp:80, dp:70, floors:4, roof:'#a8552f', info:p2, label:i === 2 ? '研究生研究中心（二期）' : false, minor:true}));

/* LY dorm towers + LY3 dining */
const lyDesc = '校内宿舍楼。十字形平面的高层塔楼，房间带独立卫浴。';
[['LY6',820,95],['LY7',945,95],['LY8',1200,90],['LY9',1340,90],['LY2',975,190],['LY4',1200,175],['LY5',1320,178]].forEach(([n, px, py]) =>
  crossB({name:n, tag:'宿舍', desc:lyDesc, px, py, ap:64, tp:22, bp:64, floors:16, variant:2, roof:'#c24d2a', minor:true}));
crossB({name:'LY1', tag:'LY 区', desc:'LY 区的一栋。官网的住宿页没有列出它的用途。', px:870, py:205, ap:64, tp:22, bp:64, floors:16, variant:2, roof:'#c24d2a', minor:true});
building({arcade:true, name:'LY3 食堂', tag:'食堂', desc:'LY 宿舍区的食堂（一楼）。南面的半圆形草坪上立着 XMUM 字样。', px:1075, py:115, wp:105, dp:115, floors:3, roofH:10});
(function(){
  const [x, z] = P(1075, 215);
  const semi = new THREE.Mesh(new THREE.CircleGeometry(22, 32, 0, Math.PI), flatMat('#8cc461', 8));
  semi.rotation.x = -Math.PI / 2; semi.position.set(x, .06, z - 14); scene.add(semi);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#c0392b'; g.font = '900 120px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('XMUM', 256, 70);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
  const word = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshStandardMaterial({map:t, alphaTest:.5, side:THREE.DoubleSide}));
  word.position.set(x, 2.3, z - 4); word.castShadow = true; scene.add(word);
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
  const body = new THREE.Mesh(geo, wallMats[1]); body.position.set(x, 1 + H / 2, z);
  const prof = []; for (let i = 0; i <= 8; i++){ const s = i / 8; prof.push(new THREE.Vector2((r + 3) * (1 - s) + r * .45 * s, 3.2 * Math.pow(s, 1.5))); }
  const roof = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), M('#eceae4', {side:THREE.DoubleSide, roughness:.5})); roof.position.set(x, 1 + H, z);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r * .45, r * .45, 2.4, 40), M('#9cc7d8', {roughness:.15, metalness:.3})); glass.position.set(x, 1 + H + 4.4, z);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * .45, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#cfe3ea', {roughness:.2, metalness:.2})); cap.scale.y = .25; cap.position.set(x, 1 + H + 5.6, z);
  [base, body, roof, glass, cap].forEach(m => { m.castShadow = m.receiveShadow = true; scene.add(m); m.userData.info = info; pickables.push(m); });
  addCircle(x, z, r + 1.5); addFp({t:1, x, z, r});
  addLabel('D6 食堂', x, 1 + H + 12, z);
})();

/* B1, courts, field */
building({arcade:true, bay:true, name:'B1 学生活动中心', tag:'活动', floors:5, px:1700, py:400, wp:190, dp:88, roofH:7, variant:1,
  desc:'五层的学生活动中心。三楼有室内运动中心、健身房和游泳池；楼里还有课室、电脑室、学生服务大厅、自习区、中医诊所、超市、面包店和餐厅。'});
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

/* ---------- campus boundary hedge (visible, so the edge never feels like an invisible wall) ---------- */
(function(){
  const hedge = M('#3f6f34', {roughness:.95});
  for (const [x, z, w, d] of [[0, -276.5, 1206, 3], [0, 263.5, 1206, 3], [-601.5, -6.5, 3, 540], [601.5, -6.5, 3, 540]]){ const m = box(w, 1.8, d, hedge, x, .9, z); m.castShadow = false; }
})();

/* ---------- vegetation ---------- */
const trunkGeo = new THREE.CylinderGeometry(.22, .4, 8.4, 7, 6); trunkGeo.translate(0, 4.2, 0);
(function(){ const p = trunkGeo.attributes.position; for (let i = 0; i < p.count; i++){ const y = p.getY(i); p.setX(i, p.getX(i) + .018 * y * y); } trunkGeo.computeVertexNormals(); })();
function crownGeometry(){
  const pos = [], F = 10;
  for (let k = 0; k < F; k++){
    const a = k / F * Math.PI * 2 + rnd() * .3, L = 4 + rnd() * 1.2, ca = Math.cos(a), sa = Math.sin(a), pts = [];
    for (let i = 0; i <= 6; i++){
      const s = i / 6, r = L * s, y = 1.1 * s - 2.1 * s * s, w = .85 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + .04;
      pts.push([ca * r - sa * w, y, sa * r + ca * w], [ca * r, y + .18 * w, sa * r], [ca * r + sa * w, y, sa * r - ca * w]);
    }
    for (let i = 0; i < 6; i++){
      const [l0, c0, r0] = pts.slice(i * 3, i * 3 + 3), [l1, c1, r1] = pts.slice(i * 3 + 3, i * 3 + 6);
      pos.push(...l0, ...c0, ...c1, ...l0, ...c1, ...l1, ...c0, ...r0, ...r1, ...c0, ...r1, ...c1);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  g.translate(.018 * 64, 8.2, 0); return g;
}
const crownGeo = crownGeometry();
const canopyGeo = new THREE.IcosahedronGeometry(3.1, 1); canopyGeo.scale(1.25, .85, 1.25); canopyGeo.translate(0, 5.4, 0);
const stumpGeo = new THREE.CylinderGeometry(.3, .45, 3.6, 6); stumpGeo.translate(0, 1.8, 0);
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
function instanced(geo, mat, spots){
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach((o, i) => { p.set(o.x, 0, o.z); q.setFromAxisAngle(UP, o.r); s.setScalar(o.s); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im;
}
const bark = M('#8a6f55');
const knockSets = [
  {kind:'tree', spots:palms,  ims:[instanced(trunkGeo, bark, palms), instanced(crownGeo, M('#3f7d38', {side:THREE.DoubleSide, roughness:.8}), palms)]},
  {kind:'tree', spots:trees,  ims:[instanced(stumpGeo, bark, trees), instanced(canopyGeo, M('#4b8a3b', {flatShading:true}), trees)]},
  {kind:'tree', spots:blooms, ims:[instanced(stumpGeo, bark, blooms), instanced(canopyGeo, M('#d8652e', {flatShading:true}), blooms)]}
];

/* lamps */
const lampSpots = [];
for (let z = 140; z <= 206; z += 16) for (const sx of [-1, 1]) lampSpots.push({x:GX + sx * 8.5, z, r:0, s:1});
(function(){
  const out = []; alongPath([[760,725],[900,702],[1050,675],[1180,665],[1320,668],[1500,675],[1580,700]], 24, [-7.5, 7.5], out, .2);
  out.forEach(o => lampSpots.push({x:o.x, z:o.z, r:0, s:1}));
  lakeRims.forEach(rim => { for (let i = 0; i < rim.length; i += 4) lampSpots.push({x:rim[i][0], z:rim[i][1], r:0, s:1}); });
})();
const postGeo = new THREE.CylinderGeometry(.09, .12, 4.4, 6); postGeo.translate(0, 2.2, 0);
const bulbGeo = new THREE.SphereGeometry(.34, 10, 8); bulbGeo.translate(0, 4.55, 0);
const bulbMat = new THREE.MeshStandardMaterial({color:'#fff8ea', emissive:'#ffd59a', emissiveIntensity:0});
knockSets.push({kind:'lamp', spots:lampSpots, ims:[instanced(postGeo, M('#3b3f44', {metalness:.4, roughness:.5}), lampSpots), instanced(bulbGeo, bulbMat, lampSpots)]});

/* ---------- sky dressing ---------- */
const starGeo = new THREE.BufferGeometry(); const sv = [];
for (let i = 0; i < 1400; i++){ const a = rnd() * 6.283, e = Math.asin(.08 + rnd() * .92), R = 4000; sv.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
const starMat = new THREE.PointsMaterial({color:'#ffffff', size:1.7, sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false});
const stars = new THREE.Points(starGeo, starMat); scene.add(stars);
const moonMat = new THREE.MeshBasicMaterial({color:'#f4f0da', transparent:true, opacity:0, fog:false});
const moon = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), moonMat); scene.add(moon);
const cloudMat = new THREE.MeshLambertMaterial({color:'#ffffff', transparent:true, opacity:.95, flatShading:true});
const puff = new THREE.IcosahedronGeometry(1, 1), clouds = [];
for (let i = 0; i < 16; i++){
  const c = new THREE.Group();
  for (let j = 0, n = 4 + (rnd() * 4 | 0); j < n; j++){
    const m = new THREE.Mesh(puff, cloudMat), s = 18 + rnd() * 18;
    m.scale.set(s * 1.4, s * .55, s); m.position.set(j * 22 - n * 10 + rnd() * 8, rnd() * 6, rnd() * 18 - 9); c.add(m);
  }
  c.position.set(rnd() * 3000 - 1500, 320 + rnd() * 120, rnd() * 2400 - 1200); scene.add(c); clouds.push(c);
}

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
  day:  {bg:'#9fd2ef', hs:'#dff0ff', hg:'#5d7340', hi:.72, sc:'#fff4e2', si:1.05, d:[.35,.9,.28],  win:0,   lamp:0,   stars:0,  moon:0, cloud:.95, cc:'#ffffff', water:'#3f8fb0', fn:900, ff:2600},
  dusk: {bg:'#eea47c', hs:'#ffd2a8', hg:'#4d4038', hi:.55, sc:'#ffae66', si:.95, d:[-.9,.26,.25], win:.8,  lamp:.9,  stars:.1, moon:0, cloud:.8,  cc:'#ffd2bd', water:'#7b6f90', fn:700, ff:2200},
  night:{bg:'#0a1630', hs:'#3a5385', hg:'#0e1218', hi:.42, sc:'#a9bdf5', si:.34, d:[-.35,.85,-.4],win:1.2, lamp:1.5, stars:1,  moon:1, cloud:.14, cc:'#3a4560', water:'#16263f', fn:550, ff:1900}
};
for (const k in P3){ const p = P3[k]; ['bg','hs','hg','sc','cc','water'].forEach(f => p[f] = new THREE.Color(p[f])); p.d = new THREE.Vector3(...p.d).normalize(); }
const cur = {bg:P3.day.bg.clone(), hs:P3.day.hs.clone(), hg:P3.day.hg.clone(), sc:P3.day.sc.clone(), cc:P3.day.cc.clone(), water:P3.day.water.clone(), d:P3.day.d.clone(),
  hi:.72, si:1.05, win:0, lamp:0, stars:0, moon:0, cloud:.95, fn:900, ff:2600};
let tgt = P3.day;
function applyTime(k){
  ['bg','hs','hg','sc','cc','water'].forEach(f => cur[f].lerp(tgt[f], k));
  cur.d.lerp(tgt.d, k).normalize();
  ['hi','si','win','lamp','stars','moon','cloud','fn','ff'].forEach(f => cur[f] += (tgt[f] - cur[f]) * k);
  scene.background.copy(cur.bg); scene.fog.color.copy(cur.bg); scene.fog.near = cur.fn; scene.fog.far = cur.ff;
  hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
  sun.color.copy(cur.sc); sun.intensity = cur.si; sun.position.copy(cur.d).multiplyScalar(1000).add(sun.target.position);
  for (const m of wallMats) m.emissiveIntensity = cur.win;
  bulbMat.emissiveIntensity = cur.lamp;
  starMat.opacity = cur.stars; stars.visible = cur.stars > .01;
  moonMat.opacity = cur.moon; moon.visible = cur.moon > .01; moon.position.copy(cur.d).multiplyScalar(3600);
  cloudMat.opacity = cur.cloud; cloudMat.color.copy(cur.cc);
  waterMat.color.copy(cur.water);
}
document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
  tgt = P3[b.dataset.t];
  document.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
}));
