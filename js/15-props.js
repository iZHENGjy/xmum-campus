/* XMUM 校园漫游 · 校园小品：斑马线、路灯、巴士站、指示牌、旗杆、单车架、遮阳伞、护柱、花坛和灌木 */
'use strict';
/* everything here uses its own random stream (never rnd()), so trees, lamps and pickups stay where they were */
const propRng = mkRng(31337);
const propDeco = [], signFaces = [];   /* static vertex-coloured parts and textured sign faces, each merged into one mesh at the end */
const PICKUP_XZ = [P(1550, 200), P(1075, 240), P(1590, 400)];
const nearPickup = (x, z, r) => PICKUP_XZ.some(([px, pz]) => Math.hypot(px - x, pz - z) < r);
const nearSpot = (x, z, r) => knockSets.some(set => set.spots.some(o => !o.hidden && Math.hypot(o.x - x, o.z - z) < r));
const propOk = (x, z, pad) => free(x, z, pad) && !nearPickup(x, z, 7) && !nearSpot(x, z, pad + .6);
/* drop knockable trees/lamps that would grow through a prop */
function hideSpotsNear(x, z, r){
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (o.hidden || Math.hypot(o.x - x, o.z - z) > r) return;
    o.hidden = o.down = true; o.s = 0; _cm.makeScale(0, 0, 0);
    for (const im of set.ims){ im.setMatrixAt(i, _cm); im.instanceMatrix.needsUpdate = true; }
  });
}
/* local (lx, lz) of a building given by its plan numbers -> world [x, z] */
function bLocal(px, py, rot, lx, lz){ const [x, z] = P(px, py), r = -rot * D2R; return [x + lx * Math.cos(r) + lz * Math.sin(r), z - lx * Math.sin(r) + lz * Math.cos(r)]; }
/* nearest asphalt road segment */
function roadAt(x, z){
  let best = null, bd = 1e9;
  for (const r of ROADS_W){ if (r.m !== asphalt) continue; for (let i = 0; i < r.p.length - 1; i++){ const d = segDist(x, z, r.p[i], r.p[i + 1]); if (d < bd){ bd = d; best = {a:r.p[i], b:r.p[i + 1], w:r.w}; } } }
  return best;
}
/* push a vertex-coloured, placed box/geometry into the static prop mesh */
const pd = (geo, col, x, y, z, ry) => { propDeco.push(geoTint(geoAt(geo, 0, 0, 0, 0, ry || 0).translate(x, y, z), col)); };
const pBox = (w, h, d, col, x, y, z, ry) => pd(new THREE.BoxGeometry(w, h, d), col, x, y, z, ry);

/* ---------- sign atlas: boards 512x64 in two columns, square signs 128x128 below ---------- */
const signCv = document.createElement('canvas'); signCv.width = signCv.height = 1024;
const signG = signCv.getContext('2d'), signTex = new THREE.CanvasTexture(signCv); signTex.anisotropy = ANISO;
const signPaint = [];
let signBoards = 0, signSquares = 0;
function signSlot(kind, draw){
  let x, y, w, h;
  if (kind === 'board'){ x = (signBoards % 2) * 512; y = Math.floor(signBoards / 2) * 64; w = 512; h = 64; signBoards++; }
  else { x = (signSquares % 8) * 128; y = 768 + Math.floor(signSquares / 8) * 128; w = h = 128; signSquares++; }
  const paint = () => { signG.save(); signG.translate(x, y); signG.beginPath(); signG.rect(0, 0, w, h); signG.clip(); draw(signG, w, h); signG.restore(); };
  signPaint.push(paint); paint();
  return [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024];
}
const SIGN_FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
function boardSlot(text, arrow, bg){
  return signSlot('board', (g, w, h) => {
    g.fillStyle = bg || '#24453f'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, w, 3);
    g.fillStyle = '#f4f1ea'; g.textBaseline = 'middle'; g.font = `700 36px ${SIGN_FONT}`;
    if (arrow === '→'){ g.textAlign = 'left'; g.fillText(text, 18, h / 2 + 2); g.textAlign = 'right'; g.font = '900 44px sans-serif'; g.fillText('→', w - 16, h / 2); }
    else { g.textAlign = 'left'; g.font = '900 44px sans-serif'; g.fillText(arrow || '', 14, h / 2); g.font = `700 36px ${SIGN_FONT}`; g.fillText(text, arrow ? 70 : 18, h / 2 + 2); }
  });
}
/* a textured quad facing +z (before rotation) with its UVs pointing at an atlas slot */
function signQuad(uv, w, h, x, y, z, ry){
  const g = new THREE.PlaneGeometry(w, h), a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  signFaces.push(geoAt(g, 0, 0, 0, 0, ry || 0).translate(x, y, z));
}
/* local offsets rotated by ry, so a sign's parts can be laid out facing +z and then turned */
const rot2 = (lx, lz, ry) => [lx * Math.cos(ry) + lz * Math.sin(ry), -lx * Math.sin(ry) + lz * Math.cos(ry)];

/* ---------- zebra crossings ---------- */
(function(){
  const spots = [];
  const zebra = (x, z) => {
    const r = roadAt(x, z), dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const t = (x - r.a[0]) * ux + (z - r.a[1]) * uz, cx = r.a[0] + ux * t, cz = r.a[1] + uz * t, h = Math.atan2(ux, uz), n = Math.round(r.w / 1.05);
    for (let k = 0; k < n; k++){ const o = -r.w / 2 + .6 + k * (r.w - 1.2) / (n - 1); spots.push([cx - uz * o, cz + ux * o, h]); }
  };
  [[1140, 855], [1220, 855], [1165, 509], [1075, 259], [960, 263], [1300, 262], [1580, 505], [1580, 700], [1640, 340], [1580, 360]].forEach(([px, py]) => zebra(...P(px, py)));
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.55, 3.4).rotateX(-Math.PI / 2), flatMat('#f4f1ea', 9), spots.length);
  spots.forEach(([x, z, h], i) => { _cm.compose(_cp.set(x, .053, z), _cq.setFromAxisAngle(UP, h), _cs.set(1, 1, 1)); im.setMatrixAt(i, _cm); });
  im.frustumCulled = false; im.receiveShadow = true; scene.add(im);
})();

/* ---------- street lights along the campus roads: tall pole, swept arm, flat LED head (glows with the park lamps) ---------- */
const streetSpots = [];
(function(){
  const poleGeo = geoMerge([new THREE.CylinderGeometry(.2, .24, .5, 8).translate(0, .25, 0), new THREE.CylinderGeometry(.07, .11, 7.2, 8, 1, true).translate(0, 4.1, 0),
    rodGeo(.06, .045, [0, 7.3, 0], [.8, 7.65, 0], 6), rodGeo(.045, .04, [.8, 7.65, 0], [1.75, 7.6, 0], 6), new THREE.SphereGeometry(.09, 8, 6).translate(0, 7.72, 0),
    new THREE.BoxGeometry(1, .1, .36).translate(1.95, 7.62, 0)]);
  const headGeo = new THREE.BoxGeometry(.86, .07, .28).translate(1.95, 7.54, 0);
  const lampsNear = (x, z, r) => lampSpots.some(o => Math.hypot(o.x - x, o.z - z) < r) || streetSpots.some(o => Math.hypot(o.x - x, o.z - z) < r);
  for (const idx of [1, 2, 4, 7]){
    const rd = ROADS_W[idx], off = rd.w / 2 + 2.2; let side = 1, acc = 17;
    for (let i = 0; i < rd.p.length - 1; i++){
      const [x0, z0] = rd.p[i], [x1, z1] = rd.p[i + 1], l = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / l, uz = (z1 - z0) / l;
      for (; acc < l; acc += 34){
        for (const sd of [side, -side]){
          const x = x0 + ux * acc - uz * off * sd, z = z0 + uz * acc + ux * off * sd;
          if (!free(x, z, .6) || nearPickup(x, z, 6) || nearSpot(x, z, 1.2) || lampsNear(x, z, 9)) continue;
          /* arm (local +x) points back over the road */
          streetSpots.push({x, z, r:Math.atan2(ux * sd, uz * sd), s:1}); side = -sd; break;
        }
      }
      acc -= l;
    }
  }
  knockSets.push({kind:'lamp', spots:streetSpots, ims:[instanced(poleGeo, M('#596068', {metalness:.45, roughness:.45}), streetSpots), instanced(headGeo, bulbMat, streetSpots)]});
})();

/* ---------- south-gate bus stop (outside the fence, on the ring road) ---------- */
(function(){
  const x = 164, z = 236.4, C = '#c4502a', steel = '#3d4247', glass = '#a9c8d4';
  pBox(8, .14, 3.4, '#b7b0a4', x, .07, z);
  /* paved apron out to the ring road (z 240.6; it was a strip of grass to wade across), a yellow edge strip, a litter bin */
  pBox(8, .1, 2.6, '#8f897e', x, .05, z + 2.95); pBox(7.9, .02, .3, '#e6b52c', x, .15, z + 1.48);
  pd(new THREE.CylinderGeometry(.24, .21, .78, 10), '#2f6f4f', x - 2.9, .53, z + .55); pd(new THREE.CylinderGeometry(.26, .26, .06, 10), '#3d4247', x - 2.9, .95, z + .55);
  for (const lx of [-3.4, 0, 3.4]) pBox(.12, 2.75, .12, steel, x + lx, 1.42, z - 1.2);
  for (const lx of [-3.4, 3.4]) pBox(.1, 2.65, .1, steel, x + lx, 1.37, z + 1.05);
  pd(new THREE.BoxGeometry(7.8, .14, 3.3).rotateX(.07), '#d8d4cc', x, 2.82, z - .05);
  pBox(7.8, .34, .1, C, x, 2.72, z + 1.62); pBox(7.8, .34, .1, C, x, 2.92, z - 1.7);
  pBox(6.8, 1.7, .05, glass, x, 1.45, z - 1.2); pBox(.05, 1.7, 1.9, glass, x - 3.4, 1.45, z - .2);
  pBox(4.2, .07, .48, '#9b6a43', x - .6, .52, z - .8); for (const lx of [-2.4, 1.2]) pBox(.08, .45, .4, steel, x + lx, .27, z - .8);
  /* route panel and the stop's flag sign */
  pBox(.08, 1.7, 1.3, '#2f3337', x + 3.4, 1.35, z + .1);
  signQuad(signSlot('square', (g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#24453f'; g.fillRect(0, 0, w, 30);
    g.fillStyle = '#fff'; g.font = `700 20px ${SIGN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('校巴路线', w / 2, 16);
    g.strokeStyle = '#c4502a'; g.lineWidth = 4; g.beginPath(); g.moveTo(22, 46); g.lineTo(22, 118); g.stroke();
    g.fillStyle = '#222'; g.font = `500 15px ${SIGN_FONT}`; g.textAlign = 'left';
    ['南门站', 'LY 宿舍', 'D6 食堂', '雪邦市区'].forEach((t, i) => { g.beginPath(); g.arc(22, 50 + i * 21, 5, 0, 7); g.fillStyle = i ? '#fff' : '#c4502a'; g.fill(); g.stroke(); g.fillStyle = '#222'; g.fillText(t, 36, 51 + i * 21); });
  }), 1.15, 1.15, x + 3.45, 1.45, z + .1, Math.PI / 2);
  pd(new THREE.CylinderGeometry(.06, .06, 3.2, 8), steel, x + 5.2, 1.6, z + 1.6);
  signQuad(signSlot('square', (g, w, h) => {
    g.fillStyle = '#1f5f8b'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = '#1f5f8b'; g.fillRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#fff'; g.fillRect(30, 26, 68, 46); g.fillStyle = '#1f5f8b'; g.fillRect(36, 32, 56, 20);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(44, 76, 7, 0, 7); g.arc(84, 76, 7, 0, 7); g.fill();
    g.font = `700 22px ${SIGN_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('巴士站', w / 2, 102);
  }), .8, .8, x + 5.2, 2.85, z + 1.67);
  pBox(.82, .82, .04, '#d9dde0', x + 5.2, 2.85, z + 1.63);
  signQuad(boardSlot('南门 巴士站  BUS STOP', '', '#7a2b1a'), 3.6, .45, x, 3.32, z + 1.66);
  pBox(3.7, .52, .08, '#5a1f12', x, 3.32, z + 1.6);
})();

/* ---------- wayfinding: green directory boards on twin posts, Chinese building names ---------- */
function signpost(x, z, ry, boards){
  hideSpotsNear(x, z, 2.2);
  for (const s of [-1, 1]){ const [ox, oz] = rot2(s * 1.45, 0, ry); pd(new THREE.CylinderGeometry(.06, .07, 3.1, 8), '#3d4247', x + ox, 1.55, z + oz); }
  const [cx, cz] = rot2(0, 0, ry);
  boards.forEach(([text, arrow], i) => {
    const y = 2.7 - i * .56, [fx, fz] = rot2(0, .045, ry);
    pBox(2.8, .5, .07, '#1a332e', x + cx, y, z + cz, ry);
    signQuad(boardSlot(text, arrow), 2.7, .4, x + fx, y, z + fz, ry);
  });
  const [bx, bz] = rot2(0, 0, ry); pBox(3.1, .14, .14, '#3d4247', x + bx, 3.06, z + bz, ry);
}
/* each board faces +z (south) unless turned; arrows are as seen by someone facing the board */
signpost(99, 205, 0, [['A3 百姓大楼', '↑'], ['中心湖 · LY 宿舍', '↑'], ['B1 · D6 · 田径场', '→'], ['A1 · 音乐厅 · 二期', '←']]);
signpost(117, 32, 0, [['中心湖 · LY 宿舍区', '↑'], ['D6 食堂 · B1', '→'], ['音乐岛', '←']]);
signpost(...P(1560, 535), 0, [['D6 食堂 · D 区宿舍', '↑'], ['B1 学生活动中心', '→'], ['田径场 · 户外球场', '→'], ['A5 · A4', '←']]);
signpost(...P(1030, 240), 0, [['LY3 食堂', '↑'], ['LY 宿舍区', '↑'], ['南门 · A3', '↓']]);

/* parking signs at the two lots */
(function(){
  const pSlot = signSlot('square', (g, w, h) => {
    g.fillStyle = '#1f5f8b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 74px Arial, sans-serif'; g.fillText('P', w / 2, 56);
    g.font = `700 20px ${SIGN_FONT}`; g.fillText('停车场', w / 2, 102);
  });
  for (const [x, z, ry] of [[494, -24, -Math.PI / 2], [544, 40, Math.PI / 2], [-225, 190.5, Math.PI]]){
    hideSpotsNear(x, z, 1.5);
    pd(new THREE.CylinderGeometry(.05, .05, 2.6, 8), '#3d4247', x, 1.3, z);
    const [fx, fz] = rot2(0, .05, ry); pBox(.92, .92, .05, '#d9dde0', x, 2.45, z, ry); signQuad(pSlot, .86, .86, x + fx, 2.45, z + fz, ry);
  }
})();

/* ---------- flagpoles on the west gate lawn, generic pennant colours (animated in updateProps) ---------- */
const FLAGS = [[82, 186], [88, 186], [94, 186]];
const flagGeo = (() => {
  const parts = [];
  FLAGS.forEach(([x, z], i) => {
    hideSpotsNear(x, z, 3);
    pd(new THREE.CylinderGeometry(.06, .1, 11, 8), '#d8dadc', x, 5.5, z); pBox(1.1, .4, 1.1, '#b7b0a4', x, .2, z);
    const g = new THREE.PlaneGeometry(3, 2, 12, 4); g.translate(1.5 + .08, 0, 0); const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (2 - i + uv.getY(k)) / 3);
    parts.push(g.translate(x, 9.8 - (i === 1 ? 0 : .5), z));
  });
  const g = geoMergeUV(parts), b = g.attributes.position.array.slice(), n = b.length / 3, fx = new Float32Array(n), fi = new Float32Array(n);
  /* per vertex: how far out from the pole (0..1) and which flag, for the ripple */
  for (let i = 0; i < n; i++){ let k = 0; for (let j = 1; j < FLAGS.length; j++) if (Math.abs(b[i * 3] - FLAGS[j][0] - 1.5) < Math.abs(b[i * 3] - FLAGS[k][0] - 1.5)) k = j; fi[i] = k; fx[i] = Math.max(0, (b[i * 3] - FLAGS[k][0] - .08) / 3); }
  g.userData = {base:b, fx, fi}; return g;
})();
FLAGS.forEach(([x, z]) => propDeco.push(geoMerge([geoTint(new THREE.SphereGeometry(.16, 10, 8).translate(x, 11.08, z), '#d6a63a')])));
const flagMesh = (() => {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192; const g = cv.getContext('2d');
  /* three made-up pennants: oxblood with a gold band, navy with white chevron, green with cream bars */
  g.fillStyle = '#9c2f1d'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#e3b34a'; g.fillRect(0, 26, 128, 12);
  g.fillStyle = '#20406a'; g.fillRect(0, 64, 128, 64); g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(0, 64); g.lineTo(44, 96); g.lineTo(0, 128); g.lineTo(0, 116); g.lineTo(28, 96); g.lineTo(0, 76); g.fill();
  g.fillStyle = '#2d7a54'; g.fillRect(0, 128, 128, 64); g.fillStyle = '#f2ead6'; g.fillRect(0, 140, 128, 8); g.fillRect(0, 172, 128, 8);
  const t = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({map:t, side:THREE.DoubleSide, roughness:.85}));
  m.frustumCulled = false; scene.add(m); return m;
})();

/* ---------- bicycle racks beside dorm entrances, B1 and the A row ---------- */
const bikeSpots = [];
(function(){
  const steel = '#9aa0a6', P2 = [];
  for (let k = 0; k < 5; k++){ const x = -1.6 + k * .8; P2.push(geoTint(geoAt(new THREE.TorusGeometry(.36, .025, 3, 6, Math.PI), x, .35, 0, 0, Math.PI / 2), steel)); }
  P2.push(geoTint(new THREE.BoxGeometry(3.6, .05, .06).translate(0, .03, .3), steel), geoTint(new THREE.BoxGeometry(3.6, .05, .06).translate(0, .03, -.3), steel));
  const bike = (x, col, flip) => {
    const s = flip ? -1 : 1, r = (a, b) => geoTint(rodGeo(.025, .025, a, b, 3), col);
    P2.push(geoTint(geoAt(new THREE.TorusGeometry(.32, .035, 3, 10), x, .33, .55 * s, 0, Math.PI / 2), '#222'), geoTint(geoAt(new THREE.TorusGeometry(.32, .035, 3, 10), x, .33, -.5 * s, 0, Math.PI / 2), '#222'),
      r([x, .33, .55 * s], [x, .62, .05 * s]), r([x, .33, -.5 * s], [x, .62, .05 * s]), r([x, .62, .05 * s], [x, .78, -.32 * s]), r([x, .33, -.5 * s], [x, .7, -.38 * s]),
      r([x, .78, -.32 * s], [x, .62, .05 * s]), r([x, .33, .55 * s], [x, .9, .42 * s]), geoTint(new THREE.BoxGeometry(.5, .03, .03).translate(x, .92, .42 * s), '#222'),
      geoTint(new THREE.BoxGeometry(.1, .05, .22).translate(x, .82, -.36 * s), '#222'));
  };
  bike(-1.2, '#c0392b'); bike(-.4, '#2d5d8a', true); bike(1.2, '#e8e4dc');
  const geo = geoMerge(P2);
  const add = (x, z, r) => { if (propOk(x, z, 1.8)) bikeSpots.push({x, z, r, s:1}); };
  [[820, 95], [945, 95], [1200, 90], [1340, 90], [975, 190], [1200, 175], [1320, 178], [870, 205]].forEach(([px, py]) => add(...bLocal(px, py, 0, S(64) / 2 + 3.2, 7.5), Math.PI / 2));
  [[1478, 112, -18], [1468, 212, -18], [1720, 212, 20], [1612, 270, 20], [1740, 292, 20]].forEach(([px, py, r]) => add(...bLocal(px, py, r, S(100) / 2 + 3.2, 7.5), Math.PI / 2 - r * D2R));
  for (const x of [398, 466]) add(x, 8, 0);
  [[900, 640, 95, 18], [1015, 602, 100, 8], [1295, 580, 110, 0], [1425, 585, 110, -3]].forEach(([px, py, wp, r]) => add(...bLocal(px, py, r, S(wp) / 2 - 4, 51 / 2 + 6.2), -r * D2R));
  const bim = instanced(geo, M('#ffffff', {vertexColors:true, roughness:.6, metalness:.2}), bikeSpots); bim.castShadow = false;
  knockSets.push({kind:'bench', spots:bikeSpots, ims:[bim]});
})();

/* ---------- food-court umbrellas outside D6 and LY3: table, four stools, striped canopy ---------- */
const umbSpots = [];
(function(){
  const base = [geoTint(new THREE.CylinderGeometry(.55, .55, .06, 14).translate(0, .74, 0), '#e8e4dc'), geoTint(new THREE.CylinderGeometry(.06, .2, .72, 8).translate(0, .36, 0), '#5a5f66'),
    geoTint(new THREE.CylinderGeometry(.035, .035, 2.4, 6).translate(0, 1.2, 0), '#ddd')];
  for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2 + .4; base.push(geoTint(new THREE.CylinderGeometry(.2, .17, .45, 6).translate(Math.cos(a) * .95, .225, Math.sin(a) * .95), '#c8c2b6')); }
  const canopy = new THREE.ConeGeometry(1.75, .55, 8, 1, true).translate(0, 2.42, 0), cp = canopy.attributes.position, cc = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++){ const a = Math.atan2(cp.getZ(i), cp.getX(i)), v = Math.floor((a + Math.PI) / (Math.PI / 4) + .5) % 2 ? 1 : .93; cc[i * 3] = cc[i * 3 + 1] = cc[i * 3 + 2] = v; }
  canopy.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const tryAdd = (x, z) => { if (propOk(x, z, 2)) umbSpots.push({x, z, r:propRng() * 6.28, s:1}); };
  const [dx, dz] = P(1610, 175), dr = S(45);
  for (const R of [dr + 7, dr + 12]) for (let k = 0; k < 7; k++){ const a = (95 + k * 13 + (R > dr + 8 ? 6 : 0)) * D2R; tryAdd(dx + Math.cos(a) * R, dz + Math.sin(a) * R); }
  const [lx, lz] = P(1075, 115), ld = S(115) / 2;
  for (const s of [-1, 1]) for (const [ox, oz] of [[37, 6], [43, 6], [37, 12], [43, 12], [49, 9]]) tryAdd(lx + s * ox, lz + ld + oz);
  const ims = [instanced(geoMerge(base), M('#ffffff', {vertexColors:true, roughness:.7}), umbSpots), instanced(canopy, M('#ffffff', {vertexColors:true, side:THREE.DoubleSide, roughness:.8}), umbSpots)];
  const cols = ['#c0392b', '#f0c419', '#2d8a6e', '#e67e22', '#2d5d8a', '#f4f1ea'];
  umbSpots.forEach((o, i) => ims[1].setColorAt(i, _gc.set(cols[i % cols.length])));
  ims[0].castShadow = false;
  knockSets.push({kind:'bench', spots:umbSpots, ims});
})();

/* ---------- bollards at the gate entrances, trimmed hedges along the axis, flowering shrubs at building fronts ---------- */
const bollardSpots = [], hedgeSpots = [], shrubSpots = [];
(function(){
  for (const [x0, x1] of [[91.4, 100.6], [139.4, 148.6]]) for (let x = x0; x <= x1 + .01; x += 1.53) bollardSpots.push({x, z:209.5, r:0, s:1});
  const bGeo = geoMerge([geoTint(new THREE.CylinderGeometry(.14, .16, .85, 10).translate(0, .43, 0), '#d9d6cf'), geoTint(new THREE.CylinderGeometry(.165, .165, .1, 10).translate(0, .7, 0), '#c4502a'),
    geoTint(new THREE.SphereGeometry(.14, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .855, 0), '#d9d6cf')]);
  const bol = instanced(bGeo, M('#ffffff', {vertexColors:true, roughness:.6}), bollardSpots); bol.castShadow = false;
  knockSets.push({kind:'bin', spots:bollardSpots, ims:[bol]});

  /* low clipped hedges (static: a hedge shouldn't topple like a lamp post) */
  for (const sx of [-1, 1]) for (let z = 136; z < 211; z += 2.6){ if (z > 168 && z < 185) continue; const x = GX + sx * 10.1; if (!nearSpot(x, z, .9)) hedgeSpots.push([x, z]); }
  const hGeo = roundBox(.8, .72, 2.5, .14, 1);
  hedgeSpots.forEach(([x, z], i) => propDeco.push(geoTint(hGeo.clone().translate(x, .36, z), i % 2 ? '#3e7a35' : '#43803a')));

  /* shrub: two leafy lumps; the upper facets that flower are split into a second mesh so each bush can bloom its own colour */
  const sh = geoMerge([geoAt(new THREE.IcosahedronGeometry(.9, 1), 0, .7, 0, 0, 0, 0, 1.2, .8, 1), geoAt(new THREE.IcosahedronGeometry(.65, 1), .7, .55, .3, 0, 0, 0, 1, .8, 1)]);
  const sp = sh.attributes.position, sn = sh.attributes.normal, rr = mkRng(808), G1 = new THREE.Color('#3f7f37'), G2 = new THREE.Color('#2f6a2c');
  const lp = [], lc = [], fp = [];
  for (let t = 0; t < sp.count; t += 3){
    const up = (sp.getY(t) + sp.getY(t + 1) + sp.getY(t + 2)) / 3 > .5;
    if (up && rr() < .42){ for (let k = 0; k < 3; k++) fp.push(sp.getX(t + k) + sn.getX(t + k) * .04, sp.getY(t + k) + sn.getY(t + k) * .04, sp.getZ(t + k) + sn.getZ(t + k) * .04); }
    else { const c = rr() < .5 ? G1 : G2; for (let k = 0; k < 3; k++){ lp.push(sp.getX(t + k), sp.getY(t + k), sp.getZ(t + k)); lc.push(c.r, c.g, c.b); } }
  }
  const leafG = new THREE.BufferGeometry(); leafG.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); leafG.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3)); leafG.computeVertexNormals();
  const flowG = new THREE.BufferGeometry(); flowG.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); flowG.computeVertexNormals();
  const add = (x, z) => { if (shrubSpots.length < 140 && propOk(x, z, 1.4)) shrubSpots.push({x, z, r:propRng() * 6.28, s:.8 + propRng() * .45}); };
  [[900, 640, 95, 85, 18], [1015, 602, 100, 85, 8], [1295, 580, 110, 85, 0], [1425, 585, 110, 85, -3]].forEach(([px, py, wp, dp, r]) => {
    const w = S(wp), bw = Math.max(10, w * .26) / 2 + 5;
    for (let lx = -w / 2 + 2; lx <= w / 2 - 2; lx += 5.5) if (Math.abs(lx) > bw) add(...bLocal(px, py, r, lx, S(dp) / 2 + 4.4));
  });
  for (let lx = -S(140) / 2 + 3; lx <= S(140) / 2 - 3; lx += 5.5) if (Math.abs(lx) > 29) add(...bLocal(1155, 575, 0, lx, S(115) / 2 + 4.4));
  [[175, 295, -10], [160, 392, 0], [300, 430, 15], [392, 485, -20], [190, 492, 10], [440, 578, 0], [420, 668, 10]].forEach(([px, py, r]) => { for (let lx = -21; lx <= 21; lx += 6) add(...bLocal(px, py, r, lx, S(70) / 2 + 4.4)); });
  { const [dx, dz] = P(1610, 175); for (let k = 0; k < 20; k++){ const a = k / 20 * Math.PI * 2; add(dx + Math.cos(a) * (S(45) + 4.2), dz + Math.sin(a) * (S(45) + 4.2)); } }
  const im = instanced(flowG, M('#ffffff', {roughness:.8}), shrubSpots);
  const blossom = ['#e0245e', '#ff6fae', '#f6a623', '#fff4ec', '#c2185b', '#ff7b39'];
  shrubSpots.forEach((o, i) => im.setColorAt(i, _gc.set(blossom[i % blossom.length])));
  knockSets.push({kind:'bin', spots:shrubSpots, ims:[instanced(leafG, M('#ffffff', {vertexColors:true, roughness:.95}), shrubSpots), im]});
})();

/* ---------- flower beds: a ring round the Tan Kah Kee statue and two long beds flanking the axis ---------- */
(function(){
  const rr = mkRng(4711), fl = ['#e0245e', '#ff7eb6', '#f6c445', '#ff6b35', '#ffffff', '#c2185b', '#8e44ad'], leaf = ['#3f7f37', '#4f9442'];
  const bump = (x, z) => { const f = rr() < .7; pd(new THREE.IcosahedronGeometry(f ? .2 : .26, 0).scale(1, .75, 1), f ? fl[(rr() * fl.length) | 0] : leaf[(rr() * 2) | 0], x, .5 + rr() * .12, z); };
  const [sx, sz] = P(1180, 738);
  pd(new THREE.CylinderGeometry(6.3, 6.4, .42, 40, 1, true), '#b7b0a4', sx, .21, sz); pd(new THREE.CylinderGeometry(4.3, 4.3, .42, 32, 1, true), '#b7b0a4', sx, .21, sz);
  pd(new THREE.RingGeometry(4.3, 6.3, 40, 1).rotateX(-Math.PI / 2), '#5b4636', sx, .4, sz);
  pd(new THREE.TorusGeometry(6.35, .1, 4, 40).rotateX(Math.PI / 2), '#c9c2b4', sx, .42, sz);
  for (let k = 0; k < 90; k++){ const a = rr() * Math.PI * 2, r = 4.55 + rr() * 1.5; bump(sx + Math.cos(a) * r, sz + Math.sin(a) * r); }
  for (const s of [-1, 1]){
    const x = GX + s * 15.5, z0 = 186, z1 = 207, zc = (z0 + z1) / 2;
    hideSpotsNear(x, zc, 1);
    pBox(2.6, .4, z1 - z0, '#5b4636', x, .2, zc); pBox(2.9, .44, .18, '#b7b0a4', x, .22, z0); pBox(2.9, .44, .18, '#b7b0a4', x, .22, z1);
    pBox(.15, .44, z1 - z0, '#b7b0a4', x - 1.38, .22, zc); pBox(.15, .44, z1 - z0, '#b7b0a4', x + 1.38, .22, zc);
    for (let k = 0; k < 70; k++) bump(x + (rr() - .5) * 2.2, z0 + .4 + rr() * (z1 - z0 - .8));
  }
})();

/* ---------- merge the static parts ---------- */
(function(){
  const deco = new THREE.Mesh(geoMerge(propDeco), decoMat); deco.castShadow = deco.receiveShadow = true; scene.add(deco);
  const faces = new THREE.Mesh(geoMergeUV(signFaces), new THREE.MeshStandardMaterial({map:signTex, roughness:.55})); faces.receiveShadow = true; scene.add(faces);
  document.fonts && document.fonts.ready.then(() => { signPaint.forEach(f => f()); signTex.needsUpdate = true; });
})();

/* per-frame prop animation (called from updateNPCs): flags ripple from the pole outwards */
function updateProps(dt, T){
  if (REDUCED) return;
  const p = flagGeo.attributes.position, {base:b, fx:fxA, fi:fiA} = flagGeo.userData;
  for (let i = 0; i < p.count; i++){
    const fx = fxA[i], x0 = b[i * 3], y0 = b[i * 3 + 1], z0 = b[i * 3 + 2], ph = T * 6 - fx * 5 + fiA[i] * 1.3;
    p.setXYZ(i, x0 - fx * .1 * (1 + Math.sin(ph * .5)), y0 - fx * fx * .25, z0 + Math.sin(ph) * .32 * fx);
  }
  p.needsUpdate = true; flagGeo.computeVertexNormals();
}
