/* XMUM 校园漫游 · 地平线式竞速：赛事点、五条赛道、人机对手、道具赛、影线 1v1、赛道排行榜
 *
 * 玩法：奶娃模式里地图上有几个带格子旗的赛事点，开车进圈弹出赛事卡，选「人机赛」「道具赛」或「影线 1v1」。
 *   人机赛：3–5 辆 AI 车沿赛道样条跑，有橡皮筋难度（落后会追、领先会松），偶尔会犯错（手抖、晚刹车），卡住会倒车或归位。
 *   道具赛：赛道上有问号箱，撞开得到一个道具（X 键或「道具」按钮）：加速、水弹（淋到的车打滑）、洒奶茶（留在地上的滑坑）、护盾。
 *   影线 1v1：和自己或排行榜上别人的最佳影子比。影子是那一圈 / 那一趟每 0.1 秒一个采样（位置、高度、朝向），差分压缩成字符串。
 * 纪录：localStorage 'xmum-race-v1' = {best:{track:{run, lap}}, ghost:{track:{t, car, color, d}}, wins:{track:n}}；
 *   在线时把成绩交给 B1 游戏厅的小游戏榜 /mini/race_{track}（XNet.miniSubmit，值 = 1,000,000 − 百分之一秒，越大越好），
 *   影子写到 /ghosts/{track}/{uid} = {name, time(ms), car, color, d, ts}（规则见 database.rules.json：只能写自己的、名字要和注册昵称一致、只能变快、大小有限）。
 *   离线或预览版只用本机影子。道具赛的成绩不上榜、不存影子。
 * 接入：只新增这个文件；在 gx 钩子链上挂 update / busy / prompt / target / mini / leave / togglePause，和其它玩法文件一样。
 *   AI 车不放进 cars（主循环会把 cars 里的车刹住），由这里自己 updateCar、自己处理和玩家、停放车之间的碰撞（不加保安警戒）。
 * 测试：没有画面的标签页不跑动画帧，用 XRace.sim.step(秒, each) 按 60 帧 / 秒推进（见文件末尾）。
 */
'use strict';
const RC_KEY = 'xmum-race-v1', RC_MAX = 1e6, RC_DT = .1;
const rcSave = {best:{}, ghost:{}, wins:{}, day:{}};   /* day: {track:{d:'2026-11-12', n:prize races today}} for tracks with a daily prize cap (T.dayCap) */
(function(){ try { const d = JSON.parse(localStorage.getItem(RC_KEY) || 'null'); if (d) for (const k of ['best', 'ghost', 'wins', 'day']) if (d[k] && typeof d[k] === 'object') rcSave[k] = d[k]; } catch(e){} })();
function rcWrite(){ try { localStorage.setItem(RC_KEY, JSON.stringify(rcSave)); } catch(e){} }
const rcFmt = t => { if (!(t >= 0) || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };

/* ---------- track paths: centripetal Catmull-Rom through the waypoints, resampled every 3 m ---------- */
function rcPath(pts, closed){
  const cv = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  const sp = cv.getSpacedPoints(Math.max(16, Math.ceil(cv.getLength() / 3))); if (closed) sp.pop();
  const N = sp.length, X = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N), S = new Float32Array(N + 1);
  sp.forEach((v, i) => { X[i] = v.x; Z[i] = v.z; });
  for (let i = 1; i <= N; i++){ const j = i % N; S[i] = S[i - 1] + (i < N || closed ? Math.hypot(X[j] - X[i - 1], Z[j] - Z[i - 1]) : 0); }
  for (let i = 0; i < N; i++){
    const a = closed ? (i + N - 1) % N : Math.max(0, i - 1), b = closed ? (i + 1) % N : Math.min(N - 1, i + 1), l = Math.hypot(X[b] - X[a], Z[b] - Z[a]) || 1;
    TX[i] = (X[b] - X[a]) / l; TZ[i] = (Z[b] - Z[a]) / l;
  }
  return {X, Z, TX, TZ, S, N, closed, L:closed ? S[N] : S[N - 1]};
}
/* a closed path from points that are already evenly spaced (a circuit that has its own centre line, e.g. the kart track): no resampling */
function rcPathRaw(pts){
  const N = pts.length, X = new Float32Array(N), Z = new Float32Array(N), TX = new Float32Array(N), TZ = new Float32Array(N), S = new Float32Array(N + 1);
  pts.forEach(([x, z], i) => { X[i] = x; Z[i] = z; });
  for (let i = 1; i <= N; i++){ const j = i % N; S[i] = S[i - 1] + Math.hypot(X[j] - X[i - 1], Z[j] - Z[i - 1]); }
  for (let i = 0; i < N; i++){ const a = (i + N - 1) % N, b = (i + 1) % N, l = Math.hypot(X[b] - X[a], Z[b] - Z[a]) || 1; TX[i] = (X[b] - X[a]) / l; TZ[i] = (Z[b] - Z[a]) / l; }
  return {X, Z, TX, TZ, S, N, closed:true, L:S[N]};
}
/* point and direction at arc length s */
function rcAt(P, s){
  if (P.closed){ s %= P.L; if (s < 0) s += P.L; } else s = Math.max(0, Math.min(P.L, s));
  let lo = 0, hi = P.closed ? P.N : P.N - 1;
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (P.S[m] <= s) lo = m; else hi = m; }
  const j = hi % P.N, t = (s - P.S[lo]) / ((P.S[hi] - P.S[lo]) || 1);
  return [P.X[lo] + (P.X[j] - P.X[lo]) * t, P.Z[lo] + (P.Z[j] - P.Z[lo]) * t, P.TX[lo] + (P.TX[j] - P.TX[lo]) * t, P.TZ[lo] + (P.TZ[j] - P.TZ[lo]) * t];
}
/* nearest sample: local search around the hint, global if lost; returns {i, s, d (distance), lat (+ = left of the direction of travel)} */
function rcNear(P, x, z, hint){
  let bi = -1, bd = 1e18;
  const scan = (a, b) => { for (let k = a; k <= b; k++){ const i = P.closed ? ((k % P.N) + P.N) % P.N : k; if (i < 0 || i >= P.N) continue; const dx = x - P.X[i], dz = z - P.Z[i], d = dx * dx + dz * dz; if (d < bd){ bd = d; bi = i; } } };
  if (hint != null && hint >= 0) scan(hint - 40, hint + 40);
  if (bi < 0 || bd > 1600) scan(0, P.N - 1);
  const i = bi, n = P.closed ? (i + 1) % P.N : Math.min(P.N - 1, i + 1), sx = P.X[n] - P.X[i], sz = P.Z[n] - P.Z[i], sl = sx * sx + sz * sz || 1;
  const t = n === i ? 0 : Math.max(0, Math.min(1, ((x - P.X[i]) * sx + (z - P.Z[i]) * sz) / sl));
  return {i, s:P.S[i] + (P.S[i + 1] - P.S[i]) * t, d:Math.sqrt(bd), lat:(x - P.X[i]) * -P.TZ[i] + (z - P.Z[i]) * P.TX[i]};
}

/* ---------- the five tracks ---------- */
const rcRoad = id => (typeof ROAD !== 'undefined' && ROAD[id]) || OUT_ROADS.find(r => r.id === id);
const rcEvery = (pts, n) => pts.filter((_, i) => i % n === 0 || i === pts.length - 1);
const RC_TRACKS = [
  /* the outer ring road; at the south-west and south-east corners it slips round the ends of the south fence (the road itself runs into it there) */
  {id:'campus', name:'校园环线', icon:'🏫', color:'#4aa3ff', laps:1, w:10, closed:true,
    desc:'绕校园外环跑一整圈，西边路上有个黄色跳台，南边两个角要从栅栏尽头绕过去。路上停着的车开赛前会挪到路边。',
    pts:[[192, 246.6], [-100, 246.6], [-408, 246.6], [-505, 240], [-578, 236], [-594, 214], [-586, 182]].concat(
      [[45, 690], [40, 320], [95, 140], [240, 40], [560, 22], [1000, 25], [1500, 28], [1830, 35], [1905, 110]].map(p => P(p[0], p[1])),
      [[555, 150], [582, 186], [595, 214], [584, 240], [550, 246.6], [400, 246.6]])},
  {id:'bell', name:'Bell 街区街道赛', icon:'🏙️', color:'#ff5fa2', laps:3, w:6, closed:true,
    desc:'绕 Bell Avenue 店屋跑三圈：前巷、Bell Suites、后巷，窄路急弯，小心路边的人。',
    pts:[[104, 333], [106, 313], [118, 307], [300, 307], [512, 307], [529, 318], [531, 348], [518, 367], [430, 367], [300, 363], [118, 363], [106, 357]]},
  {id:'ridge', name:'山梁拉力', icon:'⛰️', color:'#ff8a3d', laps:0, w:11, closed:false,
    desc:'从 Jalan Sunsuria 出发，翻过约 20 米高的山梁冲到 KIP 停车场。',
    pts:() => [[60, 289], [-30, 289]].concat(rcEvery(rcRoad('kip').p.filter(p => p[1] < 880), 6).slice(1), [[-540, 904], [-596, 900]])},
  {id:'offroad', name:'山野越野', icon:'🌄', color:'#8bc34a', laps:2, w:14, closed:true, trail:true,
    desc:'离开公路翻山越岭跑两圈，沿着土路走，坡顶冲快了会飞起来。',
    pts:[[-130, 335], [-260, 330], [-400, 350], [-520, 420], [-580, 520], [-540, 620], [-450, 680], [-360, 640], [-330, 560], [-260, 470], [-180, 420]]},
  {id:'estate', name:'油棕园公路冲刺', icon:'🌴', color:'#f2c230', laps:0, w:10, closed:false,
    desc:'从 KIP 出发，顺着山路往南，穿过南边山里的油棕园，冲回 Jalan Sunsuria。',
    pts:() => rcEvery(rcRoad('kip').p.filter(p => p[1] > 935), 6).concat(rcEvery(rcRoad('estate').p, 6).slice(1), [[630, 300]])}
];
function rcPrep(T){
  let pts = typeof T.pts === 'function' ? T.pts() : T.pts;
  if (T.raw){ T.P = rcPathRaw(pts); T.s0 = 0; T.s1 = T.P.L * T.laps; }
  else {
  if (!T.closed){
    /* a run-up behind the start line for the grid */
    const [x0, z0] = pts[0], [x1, z1] = pts[1], l = Math.hypot(x1 - x0, z1 - z0) || 1, ux = (x1 - x0) / l, uz = (z1 - z0) / l;
    pts = [[x0 - ux * 46, z0 - uz * 46], [x0 - ux * 22, z0 - uz * 22]].concat(pts);
  }
  T.P = rcPath(pts, T.closed);
  T.s0 = T.closed ? 0 : rcNear(T.P, pts[2][0], pts[2][1]).s;
  T.s1 = T.closed ? T.P.L * T.laps : T.P.L - 4;
  }
  const len = T.closed ? T.P.L : T.s1 - T.s0, nc = Math.max(3, Math.round(len / 120));
  T.len = len; T.cps = [];
  for (let lap = 0; lap < (T.closed ? T.laps : 1); lap++) for (let k = 1; k <= nc; k++) T.cps.push(T.s0 + lap * len + len * k / nc);
  T.ncp = nc;
}
RC_TRACKS.forEach(rcPrep);

/* ---------- world dressing: event flags, start/finish lines, the off-road trail, checkpoint rings ---------- */
const rcGlow = (c, op) => new THREE.MeshBasicMaterial({color:c, transparent:true, opacity:op, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending});
const rcCheckTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++){ g.fillStyle = (i + j) % 2 ? '#1d1f24' : '#f4f1ea'; g.fillRect(i * 8, j * 8, 8, 8); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
})();
const rcRingGeo = new THREE.CylinderGeometry(1, 1, 3.6, 40, 1, true).translate(0, 1.8, 0);
const rcFlagGeo = (() => { const g = new THREE.PlaneGeometry(3.2, 2.1); g.translate(1.6, 6.9, 0); return g; })();
const rcPoleGeo = new THREE.CylinderGeometry(.09, .12, 8, 6).translate(0, 4, 0);
const rcPoleMat = M('#e8e6e0', {metalness:.4, roughness:.4}), rcFlagMat = new THREE.MeshStandardMaterial({map:rcCheckTex, side:THREE.DoubleSide, roughness:.8});
function rcFlag(T){
  const s = T.closed ? 6 : T.s0 - 18, [x, z, tx, tz] = rcAt(T.P, s), o = -(T.w / 2 + 6), ex = T.evAt ? T.evAt[0] : x - tz * o, ez = T.evAt ? T.evAt[1] : z + tx * o, ey = groundAt(ex, ez);
  const g = new THREE.Group(); g.position.set(ex, ey, ez);
  const ring = new THREE.Mesh(rcRingGeo, rcGlow(T.color, .5)); ring.scale.set(6.5, 1, 6.5);
  const pole = new THREE.Mesh(rcPoleGeo, rcPoleMat), flag = new THREE.Mesh(rcFlagGeo, rcFlagMat); flag.rotation.y = Math.atan2(tx, tz);
  pole.castShadow = flag.castShadow = true; g.add(ring, pole, flag); g.visible = false; scene.add(g);
  T.ev = {x:ex, z:ez, g, ring, lbl:addLabel(T.icon + ' ' + T.name, ex, ey + 10, ez, true)}; T.ev.lbl.dead = true;
}
RC_TRACKS.forEach(rcFlag);
/* start and finish lines (checkered strips across the road) and the dirt trail of the off-road track: one mesh each */
(function(){
  const pos = [], uv = [], put = (T, s) => {
    const [x, z, tx, tz] = rcAt(T.P, s), h = T.w / 2 + .6, nx = -tz, nz = tx, a = [x + nx * h, z + nz * h], b = [x - nx * h, z - nz * h], d = [tx * 1.2, tz * 1.2];
    const q = [[a[0] - d[0], a[1] - d[1]], [b[0] - d[0], b[1] - d[1]], [b[0] + d[0], b[1] + d[1]], [a[0] + d[0], a[1] + d[1]]].map(([px, pz]) => [px, groundAt(px, pz) + .09, pz]);
    const U = [[0, 0], [T.w / 1.2 + 1, 0], [T.w / 1.2 + 1, 2], [0, 2]];
    for (const k of [0, 1, 2, 0, 2, 3]){ pos.push(...q[k]); uv.push(...U[k]); }
  };
  for (const T of RC_TRACKS){ put(T, T.s0); if (!T.closed) put(T, T.s1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map:rcCheckTex, roughness:.8, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-40, side:THREE.DoubleSide}));
  m.receiveShadow = true; scene.add(m);
  for (const T of RC_TRACKS){
    if (!T.trail) continue;
    const tp = [], P2 = T.P, hw = 4.5;
    for (let i = 0; i <= P2.N; i++){
      const j = i % P2.N, x = P2.X[j], z = P2.Z[j], nx = -P2.TZ[j], nz = P2.TX[j], A = [x + nx * hw, 0, z + nz * hw], B = [x - nx * hw, 0, z - nz * hw];
      A[1] = groundAt(A[0], A[2]) + .1; B[1] = groundAt(B[0], B[2]) + .1; tp.push([A, B]);
    }
    /* the trail stops at the asphalt and kerbs of the roads it crosses (it used to be painted over the KIP hill road) */
    const onRoad = (x, z) => typeof OUT_ROADS !== 'undefined' && OUT_ROADS.some(r => r.p.some((p, q) => q < r.p.length - 1 && Math.abs(p[0] - x) < 40 && Math.abs(p[1] - z) < 40 && segDist(x, z, p, r.p[q + 1]) < r.w / 2 + 1.6));
    const pp = []; for (let i = 0; i < tp.length - 1; i++){
      const [A, B] = tp[i], [C, D] = tp[i + 1];
      if ([A, B, C, D].some(P => onRoad(P[0], P[2])) || onRoad((A[0] + D[0]) / 2, (A[2] + D[2]) / 2)) continue;
      pp.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, M('#7d5f42', {roughness:1, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-16, side:THREE.DoubleSide})); tm.receiveShadow = true; scene.add(tm);
    /* clear the hill trees off the trail (moved far away, so a reset in black-hole mode can't stand them back up on it) */
    if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => {
      if (o.hidden || rcNear(P2, o.x, o.z).d > T.w / 2 + 3) return;
      o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0);
    });
  }
})();
const rcCp = [0, 1].map(k => { const m = new THREE.Mesh(rcRingGeo, rcGlow('#ffffff', k ? .18 : .45)); m.visible = false; scene.add(m); return m; });
const rcFinishMat = rcGlow('#ffffff', .6);

/* the old 山梁拉力 timed run (js/89-outskirts-play.js) is now a track here */
{ const i = typeof GX_ACTS !== 'undefined' ? GX_ACTS.findIndex(a => a.id === 'ridge') : -1; if (i >= 0){ const a = GX_ACTS[i]; a.mark.visible = false; a.lbl.dead = true; GX_ACTS.splice(i, 1); } }
if (typeof mgAch === 'function') mgAch([['race1', '初次发车', '跑完第一场竞速', 10], ['racewin', '冠军', '赢下一场人机赛或道具赛', 40], ['ghostwin', '超越影线', '在影线 1v1 里跑赢对手', 30], ['raceall', '全图车手', '五条赛道都跑完过', 60]]);

/* ---------- ghost cars: see-through copies of a car model (not in cars, never collide) ---------- */
const rcGhostCache = {};
function rcGhostCar(kind, color){
  kind = CAR_T[kind] ? kind : 'sedan';
  const key = kind + color; if (rcGhostCache[key]) return rcGhostCache[key];
  const T = CAR_T[kind], g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color, transparent:true, opacity:.42, depthWrite:false, roughness:.4, emissive:color, emissiveIntensity:.25});
  const geos = carParts(kind, T); for (const k in geos) g.add(new THREE.Mesh(geos[k], mat));
  const wg = carWheelGeo(T.r); for (const sz of [1, -1]) for (const sx of [-1, 1]){ const w = new THREE.Mesh(wg, mat); w.position.set(sx * (T.W / 2 - .08), T.r, sz * T.wb / 2); w.scale.x = sx; g.add(w); }
  g.rotation.order = 'YXZ'; g.visible = false; scene.add(g);
  return rcGhostCache[key] = g;
}

/* ---------- ghost data: samples [x, z, y, h] every 0.1 s, quantised, delta + zigzag + base-64 varints ---------- */
const RC_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', RC_Q = [10, 10, 10, 100];
function rcEnc(a){
  let out = ''; const prev = [0, 0, 0, 0];
  for (let i = 0; i < a.length; i++){
    const k = i % 4, q = Math.round(a[i] * RC_Q[k]); let d = q - prev[k]; prev[k] = q;
    let v = d >= 0 ? d * 2 : -d * 2 - 1;
    do { const six = v % 32; v = Math.floor(v / 32); out += RC_B64[six + (v ? 32 : 0)]; } while (v);
  }
  return out;
}
function rcDec(str){
  const out = [], prev = [0, 0, 0, 0]; let v = 0, mul = 1, k = 0;
  for (let i = 0; i < str.length; i++){
    const c = RC_B64.indexOf(str[i]); if (c < 0) return null;
    v += (c & 31) * mul;
    if (c & 32){ mul *= 32; continue; }
    const d = v % 2 ? -(v + 1) / 2 : v / 2; prev[k] += d; out.push(prev[k] / RC_Q[k]); k = (k + 1) % 4; v = 0; mul = 1;
  }
  return out.length >= 8 && out.length % 4 === 0 ? out : null;
}
/* a playable ghost: samples plus the track progress at every sample (for the live time gap) */
function rcGhostFrom(T, src){
  const a = rcDec(src.d || ''); if (!a) return null;
  const n = a.length / 4, prog = new Float32Array(n); let hint = -1, d = 0, s0 = null;
  for (let i = 0; i < n; i++){
    const q = rcNear(T.P, a[i * 4], a[i * 4 + 1], hint); hint = q.i;
    if (s0 == null){ s0 = q.s; } else { let ds = q.s - s0; if (T.P.closed){ if (ds > T.P.L / 2) ds -= T.P.L; if (ds < -T.P.L / 2) ds += T.P.L; } d += ds; s0 = q.s; }
    prog[i] = d;
  }
  return {a, n, prog, t:+src.t || n * RC_DT, car:src.car || 'sedan', color:/^#[0-9a-fA-F]{6}$/.test(src.color || '') ? src.color : '#8fd3ff', name:src.name || '我的影线', mesh:null};
}
function rcGhostPose(G, t){
  const f = Math.max(0, Math.min(G.n - 1.001, t / RC_DT)), i = Math.floor(f), u = f - i, a = G.a, o = i * 4, p = o + 4;
  return [a[o] + (a[p] - a[o]) * u, a[o + 1] + (a[p + 1] - a[o + 1]) * u, a[o + 2] + (a[p + 2] - a[o + 2]) * u, a[o + 3] + (a[p + 3] - a[o + 3]) * u];
}
/* time at which the ghost had covered `prog` metres (binary search on its progress) */
function rcGhostTimeAt(G, prog){
  let lo = 0, hi = G.n - 1; if (prog <= G.prog[0]) return 0; if (prog >= G.prog[hi]) return hi * RC_DT;
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (G.prog[m] <= prog) lo = m; else hi = m; }
  return (lo + (prog - G.prog[lo]) / ((G.prog[hi] - G.prog[lo]) || 1)) * RC_DT;
}

/* ---------- online: track boards on the B1 arcade's /mini, ghosts on /ghosts ---------- */
const rcOnline = () => !!(window.XNet && XNet.online && window.firebase && firebase.database);
function rcSubmit(T, time, samples, car, color){
  if (!rcOnline()) return;
  if (T.board !== false) try { XNet.miniSubmit('race_' + T.id, RC_MAX - Math.round(time * 100)); } catch(e){}   /* board:false: the track keeps its own board (the kart track: clean laps, js/92-f1park.js) */
  const name = XNet.claimedName ? XNet.claimedName() : '';
  if (!name || !samples) return;
  try {
    firebase.database().ref('ghosts/' + T.id + '/' + XNet.uid).set({name, time:Math.round(time * 1000), car, color, d:samples, ts:Date.now()})
      .catch(e => console.warn('[race] 影线上传失败（可能服务器上已有更快的）', e && e.code));
  } catch(e){}
}
function rcGhostList(T){
  if (!rcOnline()) return Promise.resolve([]);
  try { return Promise.race([
    (q => (q.limitToFirst ? q.limitToFirst(8) : q.limitToLast(8)))(firebase.database().ref('ghosts/' + T.id).orderByChild('time')).once('value').then(snap => {
      const out = []; snap.forEach(c => { const v = c.val() || {}; if (c.key !== XNet.uid && typeof v.d === 'string') out.push({uid:c.key, name:String(v.name || '?').slice(0, 16), t:(+v.time || 0) / 1000, car:v.car, color:v.color, d:v.d}); });
      return out;
    }),
    new Promise(res => setTimeout(() => res([]), 8000))
  ]).catch(() => []); } catch(e){ return Promise.resolve([]); }
}
/* the track boards show up in the leaderboard dialog next to the arcade games (js/ui-title.js reads XMini.games / XMini.board) */
if (window.XMini){
  const baseBoard = XMini.board.bind(XMini), gd = Object.getOwnPropertyDescriptor(XMini, 'games');
  XMini.board = id => {
    const T = RC_TRACKS.find(t => 'race_' + t.id === id && t.board !== false); if (!T) return baseBoard(id);
    const what = T.closed ? '最快单圈' : '最快完赛';
    return {name:T.name, icon:T.icon, fmt:v => rcFmt((RC_MAX - (+v || 0)) / 100), what:`${T.icon} ${T.name} · ${what}（人机赛和影线 1v1 都算，道具赛不算）`,
      local:() => { const b = rcSave.best[T.id], t = b && (T.closed ? b.lap : b.run); return t ? RC_MAX - Math.round(t * 100) : 0; },
      empty:`还没跑过「${T.name}」，去地图上找格子旗`, top:n => (window.XNet && XNet.miniTop ? XNet.miniTop('race_' + T.id, n) : Promise.resolve([]))};
  };
  if (gd && gd.get) Object.defineProperty(XMini, 'games', {configurable:true, get(){ return gd.get.call(XMini).concat(RC_TRACKS.filter(t => t.board !== false).map(t => ({id:'race_' + t.id, name:t.name, icon:t.icon, board:true}))); }});
}

/* ---------- race state ---------- */
const RC_AI = [['阿杰', '#e74c3c', 'p911'], ['Mei', '#3498db', 'mase'], ['Ravi', '#f1c40f', 'myvi'], ['小林', '#2ecc71', 'sedan'], ['Aisyah', '#9b59b6', 'lambo']];
const RC = {st:'idle', T:null, mode:'', racers:[], me:null, t:0, cd:0, beep:0, ghost:null, rec:[], recT:0, lapRec:[], moved:[], saveT:null, rearm:null, msg:'', wrongT:0,
  items:[], shots:[], puddles:[], pool:[], endT:0, result:null};
let rcPromptMsg = '';
const rcRand = mkRng(8128);

/* AI cars: created once, reused, kept out of `cars`. A track with aiKind (the kart track) gets its own set of that car, in the same names and colours */
function rcAiCar(k, kind0){
  const key = kind0 ? kind0 + k : k;
  if (RC.pool[key]) return RC.pool[key];
  const [name, color, kind] = RC_AI[k], c = makeCar(kind0 || kind, color, 0, 6000 + k * 20, 0);
  cars.splice(cars.indexOf(c), 1); c.root.visible = false; c.rcName = name;
  return RC.pool[key] = c;
}
/* today's prize races on a track with a daily cap (T.dayCap) */
function rcDay(T){
  const today = typeof dayKey === 'function' ? dayKey() : new Date().toDateString();
  let d = rcSave.day[T.id]; if (!d || d.d !== today) d = rcSave.day[T.id] = {d:today, n:0};
  return d;
}

/* ---------- start / finish ---------- */
function rcGrid(T, k){
  if (T.grid) return T.grid(k);
  const row = Math.floor(k / 2), side = k % 2 ? 1 : -1, s = T.s0 - 9 - row * 8.5, [x, z, tx, tz] = rcAt(T.P, s), o = side * Math.min(3, T.w / 2 - 1.4);
  return [x - tz * o, z + tx * o, Math.atan2(tx, tz), s];
}
const rcAiN = T => T.ai ? T.ai() : TOUCH ? 3 : 4;
function rcPlace(c, x, z, h){ Object.assign(c, {x, z, h, vx:0, vz:0, y:groundAt(x, z), vy:0, air:false, airT:0, lastVy:0, pitch:0, steer:0, slip:0}); c.root.position.set(x, c.y, z); c.root.rotation.set(0, h, 0); }
function rcStart(T, mode, ghostSrc){
  if (T.prep && T.prep(mode) === false) return false;   /* the kart track: puts you in a hired kart first */
  const c = driving; if (!c || c.wrecked){ toast('先开一辆好车', '赛车要自己开着车来', 2200); return false; }
  rcCardClose();
  heat = 0; try { despawnChasers(); } catch(e){}
  if (mission.on){ mission.on = false; toast('外卖单先放一放', '比赛期间不接单', 1800); }
  RC.saveT = c.T; c.T = Object.assign({}, c.T); c.hp = 100; c.rcBaseV = c.T.maxV; c.rcBaseA = c.T.acc;
  /* move parked cars off the racing line, put them back afterwards */
  RC.moved = [];
  for (const o of cars){
    if (o === c || !o.root.visible) continue;
    const q = rcNear(T.P, o.x, o.z); if (q.d > T.w / 2 + 3) continue;
    const [px, pz, tx, tz] = rcAt(T.P, q.s);
    for (const off of [T.w / 2 + 5, -(T.w / 2 + 5), T.w / 2 + 9, -(T.w / 2 + 9)]){
      const nx = px - tz * off, nz = pz + tx * off;
      if (!carBlocked(o, nx, nz, o.h) && rcNear(T.P, nx, nz, q.i).d > T.w / 2 + 2){ RC.moved.push([o, o.x, o.z, o.h]); rcPlace(o, nx, nz, o.h); break; }
    }
  }
  const n = mode === 'ghost' ? 0 : rcAiN(T), racers = [];
  for (let k = 0; k < n; k++){
    const a = rcAiCar(k, T.aiKind), base = CAR_T[a.kind], skill = .9 + .1 * (k % 3) / 2 + rcRand() * .04;
    a.T = Object.assign({}, base, {maxV:c.rcBaseV * skill, acc:c.rcBaseA * (.92 + rcRand() * .08), grip:Math.max(base.grip, 7.2)});
    Object.assign(a, {hp:100, wrecked:false, rcBaseV:a.T.maxV, rcBaseA:a.T.acc}); a.root.visible = true; if (!a.root.parent) scene.add(a.root);
    if (T.aiCar) T.aiCar(a, k, RC_AI[k][1]);   /* the kart track sits a driver in each kart */
    /* aLat: how hard this driver takes the corners (m/s² of side grip it trusts); the kart track sets its own range */
    const aLat = T.aLat ? T.aLat[0] + (T.aLat[1] - T.aLat[0]) * Math.min(1, (skill - .9) / .14 + (rcRand() - .5) * .3) : 10.5;
    racers.push({car:a, ai:true, name:a.rcName, color:RC_AI[k][1], skill, aLat, lane:0, laneT:0, errT:6 + rcRand() * 14, err:'', errLeft:0, stuck:0, rev:0, offT:0});
  }
  racers.push({car:c, ai:false, name:typeof uiName !== 'undefined' && uiName ? uiName : '奶娃', color:'#ff8a3d'});
  racers.forEach((r, k) => {
    const [x, z, h, s] = rcGrid(T, k); rcPlace(r.car, x, z, h);
    const q = rcNear(T.P, x, z);
    Object.assign(r, {d:s, s:q.s, hint:q.i, lat:q.lat, off:q.d, next:0, fin:null, lapStart:0, best:null, cleanBest:null, item:null, itemT:0, shield:0, spin:0, spinDir:1, boost:0});
  });
  RC.ghost = null;
  if (mode === 'ghost' && ghostSrc){ const G = rcGhostFrom(T, ghostSrc); if (G){ G.mesh = rcGhostCar(G.car, G.color); RC.ghost = G; } }
  Object.assign(RC, {st:'count', T, mode, racers, me:racers[racers.length - 1], t:0, cd:3, beep:4, rec:[], recT:0, lapRec:[], wrongT:0, endT:0, result:null});
  for (const s of RC.shots) s.m.visible = false; RC.shots.length = 0; for (const p of RC.puddles) p.m.visible = false; RC.puddles.length = 0;
  rcItemsBuild(mode === 'items');
  for (const m of rcCp){ m.material.color.set(T.color); }
  rcHudShow(true); sfx.ding();
  toast(T.icon + ' ' + T.name, {ai:'人机赛', items:'道具赛 · X 键或「道具」按钮用道具', ghost:RC.ghost ? `影线 1v1 · 对手 ${RC.ghost.name} ${rcFmt(RC.ghost.t)}` : '计时赛 · 跑完会存下你的影线'}[mode], 2800);
  return true;
}
function rcCleanup(){
  const c = RC.me && RC.me.car;
  if (c && RC.saveT){ c.T = RC.saveT; }
  RC.saveT = null;
  for (const r of RC.racers) if (r.ai){ r.car.root.visible = false; r.car.x = 0; r.car.z = 6000; r.car.vx = r.car.vz = 0; if (r.shieldM) r.shieldM.visible = false; }
  for (const [o, x, z, h] of RC.moved) if (o !== driving && cars.includes(o)) rcPlace(o, x, z, h);
  RC.moved = []; RC.racers = []; RC.me = null;
  if (RC.ghost && RC.ghost.mesh) RC.ghost.mesh.visible = false; RC.ghost = null;
  for (const m of rcCp) m.visible = false;
  rcItemsBuild(false); for (const s of RC.shots) s.m.visible = false; RC.shots.length = 0; for (const p of RC.puddles) p.m.visible = false; RC.puddles.length = 0;
  rcHudShow(false); missionEl.classList.remove('urgent');
  if (RC.T) RC.rearm = RC.T; RC.st = 'idle'; RC.T = null;
}
function rcAbort(quiet){ if (RC.st === 'idle') return; const T = RC.T; rcCleanup(); if (!quiet && T) toast('退出了「' + T.name + '」', '回到格子旗可以再来', 2200); }

/* the player crossed the line (or everyone else did and the clock ran out) */
function rcFinish(){
  const T = RC.T, me = RC.me, rs = RC.racers.slice();
  for (const r of rs) if (r.fin == null && r !== me && r.d > 0 && RC.t > 1){ const v = r.d / RC.t; r.fin = RC.t + Math.max(.1, (T.s1 - r.d) / Math.max(5, v)); r.est = true; }
  const prog = r => r.fin != null ? 1e9 - r.fin : r.d;
  rs.sort((a, b) => prog(b) - prog(a));
  const place = rs.indexOf(me) + 1, done = me.fin != null, mode = RC.mode;
  const runT = done ? me.fin : null, lap = T.lapOk ? me.cleanBest : me.best;   /* lapOk (the kart track): only laps inside the track limits count as records and ghosts */
  /* records, ghost, boards (not for item races) */
  const rec = rcSave.best[T.id] || (rcSave.best[T.id] = {}); let newRec = false;
  const mainT = T.closed ? lap : runT;
  /* RC.nos: nitro or a driving skill was used (js/94-tuning-drive.js), so the run stays off the board and is not kept as a ghost */
  if (mode !== 'items' && mainT && !RC.nos){
    if (!(rec[T.closed ? 'lap' : 'run'] <= mainT)){ rec[T.closed ? 'lap' : 'run'] = Math.round(mainT * 100) / 100; newRec = true; }
    const g = rcSave.ghost[T.id];
    const recArr = T.closed ? RC.bestRec : RC.rec;
    if (recArr && recArr.length >= 8 && (!g || mainT < g.t)){
      const d = rcEnc(recArr); rcSave.ghost[T.id] = {t:mainT, car:me.car.kind, color:'#' + me.car.paint.color.getHexString(), d};
      rcSubmit(T, mainT, d, me.car.kind, '#' + me.car.paint.color.getHexString());
    } else if (newRec) rcSubmit(T, mainT, null);
  }
  if (mode !== 'items' && runT && !RC.nos && !(rec.run <= runT)) rec.run = Math.round(runT * 100) / 100;
  /* pay and achievements */
  let pay = 0, head = '', sub = '';
  const k = T.pay || Math.max(.6, Math.min(1.5, T.len * (T.closed ? T.laps : 1) / 1400));
  if (mode === 'ghost'){
    const G = RC.ghost, win = !!(G && mainT && mainT < G.t);
    pay = done ? Math.round((win ? 70 : 15) * k) : 0;
    head = !G ? (done ? '计时完成' : '没跑完') : win ? '跑赢了影线！' : done ? '输给了影线' : '没跑完';
    sub = (mainT ? (T.closed ? '最快圈 ' : '用时 ') + rcFmt(mainT) : '') + (G ? ` · 影线 ${G.name} ${rcFmt(G.t)}` : '');
    if (win) unlock('ghostwin');
  } else {
    pay = done ? Math.round([160, 100, 60, 30, 15, 10][place - 1] * k) : 0;
    head = done ? `第 ${place} 名` : '没跑完'; sub = runT ? '完赛 ' + rcFmt(runT) + (lap && T.closed ? ' · 最快圈 ' + rcFmt(lap) : '') : '';
    if (done && place === 1){ unlock('racewin'); rcSave.wins[T.id] = (rcSave.wins[T.id] || 0) + 1; }
  }
  const allDone = () => RC_TRACKS.every(t => t.extra || (rcSave.best[t.id] && rcSave.best[t.id].done)), allBefore = allDone();   /* 全图车手: the five road tracks (an added track such as the kart one does not count) */
  if (done){ unlock('race1'); rec.done = 1; if (allDone()) unlock('raceall'); }
  /* a daily prize cap (T.dayCap, RM per day): past it the race still counts, it just pays nothing and drops no parts */
  let capped = false, dayLeft = null;
  if (T.dayCap && pay){ const D = rcDay(T), left = Math.max(0, T.dayCap - D.n); capped = left <= 0; pay = Math.min(pay, left); D.n += pay; dayLeft = T.dayCap - D.n; }
  rcWrite(); if (pay) earn(pay);
  /* 改装零件 (js/93-tuning-ui.js): by place, or for beating the ghost; the first win on a track brings the 氮气 recipe, all five tracks the engine one */
  let loot = [];
  if (window.XParts && done && !capped){
    const P = window.XParts, ghostWin = mode === 'ghost' && head.startsWith('跑赢');
    loot = mode === 'ghost' ? P.reward('ghost', ghostWin ? 0 : 3, ghostWin ? '跑赢影线' : '影线 1v1') : P.reward('race', place - 1, `竞速第 ${place} 名`);
    const bp = (id, why) => { const had = P.has(id); if (P.grant(id, 1, why)) loot.push({id:had ? 'plan' : id, n:1}); };
    if (mode !== 'ghost' && place === 1 && rcSave.wins[T.id] === 1) bp('bp_nitro', '第一次在「' + T.name + '」夺冠');
    if (!allBefore && allDone()) bp('bp_race', '五条赛道都跑完');
  }
  if (done && (place === 1 && mode !== 'ghost' || head.startsWith('跑赢'))) for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09); else sfx.ding();
  gx.callout(head, sub, T.color);
  const lines = mode === 'ghost' ? [] : rs.map((r, i) => `${i + 1}. ${r.ai ? r.name : '你'} · ${r.fin != null ? (r.est ? '约 ' : '') + rcFmt(r.fin) : '未完赛'}`);
  RC.result = {T, mode, head, sub, pay, newRec, lines, loot, nos:!!RC.nos, capped, dayLeft, done};
  if (T.onFinish) try { T.onFinish(RC.result, me); } catch(e){ console.warn(e); }
  rcCleanup();
  rcCardResult(RC.result);
}

/* ---------- per-frame race logic ---------- */
const rcCurv = (T, s, sp) => {
  const [, , tx, tz] = rcAt(T.P, s); let k = 0;
  for (const d of [10, 22, 38, 60, 90]){ if (d > sp * 2.6 + 18) break; const [, , ux, uz] = rcAt(T.P, s + d); k = Math.max(k, Math.acos(Math.max(-1, Math.min(1, tx * ux + tz * uz))) / d); }
  return k;
};
function rcAiDrive(r, dt, lead){
  const c = r.car, T = RC.T, sp = Math.hypot(c.vx, c.vz), fx = Math.sin(c.h), fz = Math.cos(c.h);
  /* lane: drift to a new line now and then, sidestep a slower car right ahead */
  r.laneT -= dt; if (r.laneT <= 0){ r.laneT = 3 + rcRand() * 4; r.laneGoal = (rcRand() * 2 - 1) * Math.max(0, T.w / 2 - 2.2) * (T.line ? .25 : 1); }   /* on a track with a racing line: stay close to it */
  for (const o of RC.racers){
    if (o === r) continue; const ds = o.d - r.d;
    if (ds > 0 && ds < 11 + sp * .3){
      const q = rcNear(T.P, o.car.x, o.car.z, o.hint), base = T.line ? T.line(r.s) : 0;
      if (Math.abs(q.lat - base - r.lane) < 2.6) r.laneGoal = (q.lat > base + r.lane ? q.lat - 3.2 : q.lat + 3.2) - base;
    }
  }
  r.laneGoal = Math.max(-(T.w / 2 - 1.6), Math.min(T.w / 2 - 1.6, r.laneGoal || 0));
  r.lane += (r.laneGoal - r.lane) * Math.min(1, dt * 1.2);
  const look = 7 + sp * .55, [px, pz, tx, tz] = rcAt(T.P, r.s + look), ln = T.line ? Math.max(-(T.w / 2 - 1.6), Math.min(T.w / 2 - 1.6, T.line(r.s + look) + r.lane)) : r.lane, gx2 = px - tz * ln, gz = pz + tx * ln;
  let dh = Math.atan2(gx2 - c.x, gz - c.z) - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  /* rubber band against the player, corner speed from the curvature ahead, the odd mistake */
  const gap = RC.me ? RC.me.d - r.d : 0, rb = T.rub || [.14, .16, 500], rub = gap > 0 ? 1 + Math.min(rb[0], gap / rb[2]) : 1 - Math.min(rb[1], -gap / (rb[2] * .84));   /* rub: [most help when behind, most slowdown when ahead, metres per 100 %] */
  r.errT -= dt;
  if (r.errT <= 0 && !r.errLeft){ r.err = rcRand() < .55 ? 'wobble' : 'late'; r.errLeft = r.err === 'wobble' ? 1.1 : 2.6; r.errT = 10 + rcRand() * (28 - r.skill * 14); }
  if (r.errLeft){ r.errLeft = Math.max(0, r.errLeft - dt); if (!r.errLeft) r.err = ''; }
  c.T.maxV = r.car.rcBaseV * rub * (r.boost > 0 ? 1.35 : 1); c.T.acc = r.car.rcBaseA * (r.boost > 0 ? 2 : 1);
  const vCorner = Math.sqrt((r.aLat || 10.5) / Math.max(rcCurv(T, r.s, sp), 1e-4)) * (r.err === 'late' ? 1.3 : 1);
  const vT = Math.min(c.T.maxV, vCorner) * (lead && RC.mode !== 'ghost' ? .99 : 1);
  let steer = Math.max(-1, Math.min(1, dh * 2.4)), thr = sp < vT ? 1 : sp > vT + 2.5 ? -1 : .15;
  if (r.err === 'wobble') steer = Math.max(-1, Math.min(1, steer + Math.sin(RC.t * 9 + r.skill * 40) * .7));
  /* stuck: back out; lost: put back on the track */
  const fwd = c.vx * fx + c.vz * fz;
  if (r.rev > 0){ r.rev -= dt; thr = -1; steer = -Math.sign(dh || 1); }
  else if (RC.st === 'run' && Math.abs(fwd) < 1.5 && RC.t > 4){ r.stuck += dt; if (r.stuck > 1.1){ r.stuck = 0; r.rev = 1.1; r.revN = (r.revN || 0) + 1; } }
  else { r.stuck = Math.max(0, r.stuck - dt); if (sp > 6) r.revN = 0; }
  const q = rcNear(T.P, c.x, c.z, r.hint); r.offT = q.d > T.w / 2 + 22 ? r.offT + dt : 0;
  if (r.offT > 2.5 || r.revN > 2){ const [x, z, ttx, ttz] = rcAt(T.P, r.s - 4); rcPlace(c, x - ttz * r.lane, z + ttx * r.lane, Math.atan2(ttx, ttz)); r.offT = 0; r.revN = 0; r.rev = 0; }
  if (r.spin > 0){ thr = 0; steer = 0; }
  c.inp = {thr, steer, brake:false};
  updateCar(c, dt, c.inp);
}
/* car-to-car push for the racers (the same maths as carCollisions in js/40-vehicles.js, without security heat or stunt points) */
function rcBump(a, b){
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.R + b.R;
  if (d >= min || d < 1e-4) return;
  const nx = dx / d, nz = dz / d, ov = min - d, ia = 1 / a.mass, ib = 1 / b.mass, pa = ov * ia / (ia + ib), pb = ov * ib / (ia + ib);
  if (!carBlocked(a, a.x - nx * pa, a.z - nz * pa, a.h)){ a.x -= nx * pa; a.z -= nz * pa; }
  if (!carBlocked(b, b.x + nx * pb, b.z + nz * pb, b.h)){ b.x += nx * pb; b.z += nz * pb; }
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv < 0){
    const j = -(RC.T && RC.T.bump || 1.3) * rv / (ia + ib); a.vx -= j * ia * nx; a.vz -= j * ia * nz; b.vx += j * ib * nx; b.vz += j * ib * nz;
    if (-rv > 5 && (a === driving || b === driving)){ sfx.crash(Math.min(1, -rv / 22) * .7); camShake = Math.max(camShake, Math.min(1.4, -rv / 14)); }
  }
}
function rcProgress(r, dt){
  const T = RC.T, c = r.car, q = rcNear(T.P, c.x, c.z, r.hint);
  let ds = q.s - r.s; if (T.P.closed){ if (ds > T.P.L / 2) ds -= T.P.L; if (ds < -T.P.L / 2) ds += T.P.L; }
  r.hint = q.i; r.s = q.s; r.lat = q.lat; r.off = q.d;
  if (Math.abs(ds) > 60) ds = 0;                                   /* teleport or a jump across the infield: ignore */
  r.d += ds;
  const cp = T.cps[r.next];
  if (cp != null){
    if (r.d > cp + 30) r.d = cp + 30;                                /* no progress past a checkpoint you skipped */
    let hit = r.d >= cp - 2 && q.d < T.w / 2 + 14;
    /* the summed progress can fall a few metres behind (an ignored jump, a 回赛道); the finish sits 4 m before the end of an open road,
       where the projection stops growing, so it could never be reached. Standing at the checkpoint itself counts too, as long as
       you have come most of the way along the road (no cutting across to it) */
    if (!hit && r.d >= cp - 60){
      const [px, pz] = rcAt(T.P, T.closed ? ((cp % T.P.L) + T.P.L) % T.P.L : cp);
      if (Math.hypot(c.x - px, c.z - pz) < T.w / 2 + 8){ hit = true; r.d = Math.max(r.d, cp); }
    }
    if (hit){
      r.next++;
      if (T.closed && r.next % T.ncp === 0){
        const lt = RC.t - r.lapStart; r.lapStart = RC.t; if (r.best == null || lt < r.best) r.best = lt;
        if (r === RC.me){ const ok = !T.lapOk || T.lapOk(); if (ok && (r.cleanBest == null || lt < r.cleanBest)) r.cleanBest = lt; rcLapDone(lt, ok); }
      }
      if (r === RC.me && r.next < T.cps.length) rcChime(r.next);
      if (r.next >= T.cps.length && r.fin == null){ r.fin = RC.t; if (!T.closed && !r.ai && (r.best == null || r.fin < r.best)) r.best = r.fin; if (!r.ai) RC.recDone = true; }
    }
  }
}
const rcChime = n => { for (let i = 0; i < 3; i++) tone('triangle', 660 * Math.pow(1.26, i + (n % 4) * .5), 660 * Math.pow(1.26, i + (n % 4) * .5), .14, .12, i * .06); };
function rcLapDone(lt, ok){
  const T = RC.T, me = RC.me;
  if (RC.mode !== 'items' && ok !== false && (!RC.bestRecT || lt < RC.bestRecT)){ RC.bestRec = RC.lapRec.slice(); RC.bestRecT = lt; }
  RC.lapRec = [];
  const lapN = Math.floor(me.next / T.ncp);
  if (lapN < T.laps) gx.callout(`第 ${lapN + 1} 圈`, '上一圈 ' + rcFmt(lt), T.color);
}
function rcRecord(dt){
  const c = RC.me.car; RC.recT += dt;
  while (RC.recT >= RC_DT){ RC.recT -= RC_DT; const s = [c.x, c.z, c.y, c.h]; RC.rec.push(...s); RC.lapRec.push(...s); }
}
function rcUpdate(dt){
  const T = RC.T, me = RC.me; if (!T || !me) return;
  /* the player's car may have been swapped or wrecked */
  if (driving !== me.car && RC.st !== 'count'){ RC.msg = TOUCH ? '回到赛车上（点「上车」）' : '回到赛车上（按 F）'; } else RC.msg = '';
  heat = 0;
  if (RC.st === 'count'){
    RC.cd -= dt; const n = Math.ceil(RC.cd);
    for (const r of RC.racers){ const [x, z, h] = rcGrid(T, RC.racers.indexOf(r)); rcPlace(r.car, x, z, h); }
    if (n < RC.beep){ RC.beep = n; if (n > 0){ gx.callout(String(n), T.name, T.color); tone('square', 660, 660, .14, .09); } else { gx.callout('出发！', '', T.color); tone('square', 1320, 1320, .3, .12); } }
    if (RC.cd <= 0){ RC.st = 'run'; RC.t = 0; RC.bestRec = null; RC.bestRecT = 0; RC.recDone = false; }
    rcShowCps(); rcHud(); return;
  }
  RC.t += dt;
  const lead = RC.racers.reduce((a, r) => (r.d > a.d ? r : a), RC.racers[0]);
  for (const r of RC.racers) if (r.ai) rcAiDrive(r, dt, r === lead);
  /* collisions: racers with each other and with every other car */
  const rc = RC.racers.map(r => r.car);
  for (let i = 0; i < rc.length; i++){
    if (!RC.racers[i].ai) continue;
    for (let j = 0; j < rc.length; j++) if (j !== i && (j > i || !RC.racers[j].ai)) rcBump(rc[i], rc[j]);
    for (const o of cars) if (o !== rc[i] && o !== RC.me.car && o.root.visible && Math.abs(o.x - rc[i].x) < 8 && Math.abs(o.z - rc[i].z) < 8) rcBump(rc[i], o);
  }
  for (const r of RC.racers){ rcProgress(r, dt); rcEffects(r, dt); }
  rcItems(dt);
  if (me.fin == null) rcRecord(dt);
  /* ghost */
  const G = RC.ghost;
  if (G){
    const t = T.closed ? (RC.t % G.t) : Math.min(RC.t, G.t), [x, z, y, h] = rcGhostPose(G, t);
    G.mesh.visible = true; G.mesh.position.set(x, y, z); G.mesh.rotation.set(0, h, 0);
  }
  /* wrong way */
  const c = me.car, sp = Math.hypot(c.vx, c.vz), [, , tx, tz] = rcAt(T.P, me.s);
  RC.wrongT = (c.vx * tx + c.vz * tz) < -5 ? RC.wrongT + dt : 0;
  /* done: the player is over the line, or everyone else is and 45 s have passed */
  if (me.fin != null){ rcFinish(); return; }
  if (RC.racers.length > 1 && RC.racers.every(r => r === me || r.fin != null)){ RC.endT += dt; if (RC.endT > 45){ rcFinish(); return; } }
  rcShowCps(); rcHud();
}
function rcShowCps(){
  const T = RC.T, me = RC.me, c0 = T.cps[me.next], c1 = T.cps[me.next + 1];
  for (const [m, cs, k] of [[rcCp[0], c0, 0], [rcCp[1], c1, 1]]){
    m.visible = cs != null; if (cs == null) continue;
    const s = T.closed ? cs % T.P.L : cs, [x, z] = rcAt(T.P, s);
    m.position.set(x, groundAt(x, z), z); m.scale.set(T.w / 2 + 2, 1 + (k ? 0 : Math.sin(performance.now() / 200) * .12), T.w / 2 + 2);
    if (!k) m.material = me.next === T.cps.length - 1 ? rcFinishMat : m.userData.mat || (m.userData.mat = m.material);
  }
}

/* ---------- items: ? boxes across the track; boost, water bomb, spilled milk tea, shield ---------- */
const rcBoxTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#ffb627'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#fff3c4'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.fillStyle = '#ffffff'; g.font = '900 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35); return new THREE.CanvasTexture(cv); })();
const rcBoxIm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({map:rcBoxTex, emissive:'#ff9f1a', emissiveIntensity:.45, transparent:true, opacity:.92}), 24);
rcBoxIm.frustumCulled = false; rcBoxIm.count = 0; scene.add(rcBoxIm);
const RC_ITEMS = {boost:['加速', '🚀'], water:['水弹', '💧'], tea:['洒奶茶', '🧋'], shield:['护盾', '🛡️']};
function rcItemsBuild(on){
  RC.items.length = 0;
  if (on){
    const T = RC.T, span = T.closed ? T.P.L : T.s1 - T.s0;
    for (const f of [.16, .4, .64, .86]){
      const s = T.s0 + span * f, [x, z, tx, tz] = rcAt(T.P, s);
      for (const o of T.w < 8 ? [-1.6, 1.6] : [-T.w / 3, 0, T.w / 3]) RC.items.push({x:x - tz * o, z:z + tx * o, y:groundAt(x - tz * o, z + tx * o), t:0});
    }
  }
  rcBoxIm.count = RC.items.length;
}
function rcGive(r){
  const back = RC.racers.filter(o => o.d > r.d).length, k = rcRand() * (1 + back * .15);
  r.item = k > 1 ? 'boost' : k < .3 ? 'boost' : k < .6 ? 'water' : k < .82 ? 'tea' : 'shield';
  r.itemT = 1.2 + rcRand() * 3;
  if (r === RC.me){ gx.callout(RC_ITEMS[r.item][1] + ' ' + RC_ITEMS[r.item][0], TOUCH ? '点「道具」用' : '按 X 用', RC.T.color); tone('triangle', 880, 1320, .16, .1); rcHudItem(); }
}
function rcUse(r){
  const it = r.item; if (!it) return; r.item = null; const c = r.car, fx = Math.sin(c.h), fz = Math.cos(c.h);
  if (it === 'boost'){ r.boost = 1.6; if (r === RC.me) tone('sawtooth', 220, 880, .4, .08); }
  else if (it === 'shield'){ r.shield = 7; }
  else if (it === 'tea'){
    const p = RC.puddles.find(q => !q.m.visible) || (() => { const m = new THREE.Mesh(new THREE.CircleGeometry(2.1, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({color:'#9b6a3f', roughness:.25, transparent:true, opacity:.88, polygonOffset:true, polygonOffsetFactor:-11, polygonOffsetUnits:-44})); scene.add(m); const q = {m}; RC.puddles.push(q); return q; })();
    const x = c.x - fx * (c.T.L / 2 + 2.2), z = c.z - fz * (c.T.L / 2 + 2.2);
    Object.assign(p, {x, z, t:22, own:r, arm:.6}); p.m.position.set(x, groundAt(x, z) + .08, z); p.m.visible = true;
  } else if (it === 'water'){
    const tgt = RC.racers.filter(o => o !== r && o.d > r.d && o.d - r.d < 160).sort((a, b) => a.d - b.d)[0] || null;
    const s = RC.shots.find(q => !q.m.visible) || (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(.65, 12, 8), new THREE.MeshStandardMaterial({color:'#4fb7ff', emissive:'#1d6fd6', emissiveIntensity:.5, transparent:true, opacity:.85})); scene.add(m); const q = {m}; RC.shots.push(q); return q; })();
    Object.assign(s, {x:c.x + fx * (c.T.L / 2 + 1), z:c.z + fz * (c.T.L / 2 + 1), y:c.y + 1.2, own:r, tgt, life:3.2, v:Math.hypot(c.vx, c.vz) + 34, h:c.h}); s.m.visible = true;
    if (r === RC.me) tone('square', 520, 260, .18, .08);
  }
  if (r === RC.me) rcHudItem();
}
function rcHit(r, why){
  if (r.shield > 0){ r.shield = 0; if (r === RC.me) gx.callout('护盾挡住了', why, '#4fd1ff'); return; }
  r.spin = 1.25; r.spinDir = rcRand() < .5 ? -1 : 1; r.car.vx *= .55; r.car.vz *= .55;
  for (let k = 0; k < 10; k++) spawnPart('dust', r.car.x + (rcRand() - .5) * 3, r.car.y + 1, r.car.z + (rcRand() - .5) * 3, 1.2, {vx:(rcRand() - .5) * 7, vy:3 + rcRand() * 3, vz:(rcRand() - .5) * 7, g:12, life:.8, op:.9, color:why === '水弹' ? '#9fd8ff' : '#c9955f'});
  if (r === RC.me){ gx.callout('打滑了！', '被' + why + '命中', '#ff6b6b'); sfx.crash(.4); camShake = Math.max(camShake, .8); }
}
function rcEffects(r, dt){
  const c = r.car;
  if (r.boost > 0){
    r.boost -= dt; const fx = Math.sin(c.h), fz = Math.cos(c.h);
    if (!r.ai){ c.T.maxV = c.rcBaseV * 1.35; c.T.acc = c.rcBaseA * 2; if (r.boost <= 0){ c.T.maxV = c.rcBaseV; c.T.acc = c.rcBaseA; } }
    if (!c.air){ c.vx += fx * 16 * dt; c.vz += fz * 16 * dt; }
    if (rcRand() < .7) spawnPart('dust', c.x - fx * c.T.L / 2, c.y + .5, c.z - fz * c.T.L / 2, .8, {vx:-fx * 6, vy:1, vz:-fz * 6, life:.35, op:.9, color:'#ffa53a'});
  }
  if (r.spin > 0){ r.spin -= dt; c.h += r.spinDir * 7 * dt * Math.min(1, r.spin + .3); c.vx *= Math.exp(-1.6 * dt); c.vz *= Math.exp(-1.6 * dt); }
  if (r.shield > 0){
    r.shield -= dt;
    if (!r.shieldM){ r.shieldM = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), rcGlow('#4fd1ff', .22)); scene.add(r.shieldM); }
    r.shieldM.visible = true; r.shieldM.position.set(c.x, c.y + c.T.H * .5, c.z); r.shieldM.scale.set(c.T.W * .9, c.T.H * .9, c.T.L * .62);
  } else if (r.shieldM) r.shieldM.visible = false;
  /* AI items: boost on a straight, water at someone ahead, tea when someone is right behind, shield straight away */
  if (r.ai && r.item){
    r.itemT -= dt; if (r.itemT > 0) return;
    const it = r.item, sp = Math.hypot(c.vx, c.vz);
    const ok = it === 'shield' || (it === 'boost' && rcCurv(RC.T, r.s, sp) < .01) || (it === 'water' && RC.racers.some(o => o !== r && o.d > r.d && o.d - r.d < 90))
      || (it === 'tea' && RC.racers.some(o => o !== r && o.d < r.d && r.d - o.d < 35)) || r.itemT < -8;
    if (ok) rcUse(r);
  }
}
function rcItems(dt){
  const T0 = performance.now() / 1000;
  RC.items.forEach((b, i) => {
    if (b.t > 0) b.t -= dt;
    const up = b.t <= 0;
    if (up) for (const r of RC.racers) if (!r.item && Math.abs(r.car.x - b.x) < 2.4 && Math.abs(r.car.z - b.z) < 2.4){ b.t = 4; rcGive(r); spawnPart('dust', b.x, b.y + 1, b.z, 1, {vy:3, life:.5, op:1, color:'#ffd27a'}); break; }
    _cp.set(b.x, b.y + 1.3 + Math.sin(T0 * 2 + i) * .2, b.z); _cq.setFromAxisAngle(UP, T0 * 1.6 + i); _cs.setScalar(b.t > 0 ? 0 : 1);
    _cm.compose(_cp, _cq, _cs); rcBoxIm.setMatrixAt(i, _cm);
  });
  if (RC.items.length) rcBoxIm.instanceMatrix.needsUpdate = true;
  for (const s of RC.shots){
    if (!s.m.visible) continue;
    s.life -= dt; if (s.life <= 0){ s.m.visible = false; continue; }
    if (s.tgt){ const want = Math.atan2(s.tgt.car.x - s.x, s.tgt.car.z - s.z); let dh = want - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.h += Math.max(-2.5 * dt, Math.min(2.5 * dt, dh)); }
    s.x += Math.sin(s.h) * s.v * dt; s.z += Math.cos(s.h) * s.v * dt; s.y += (groundAt(s.x, s.z) + 1.2 - s.y) * Math.min(1, dt * 6);
    s.m.position.set(s.x, s.y, s.z);
    if (hitsBuilding(s.x, s.z, .3)){ s.m.visible = false; continue; }
    for (const r of RC.racers) if (r !== s.own && Math.hypot(r.car.x - s.x, r.car.z - s.z) < 2.6){ s.m.visible = false; rcHit(r, '水弹'); sfx.splash && sfx.splash(); break; }
  }
  for (const p of RC.puddles){
    if (!p.m.visible) continue;
    p.t -= dt; p.arm -= dt; if (p.t <= 0){ p.m.visible = false; continue; }
    for (const r of RC.racers) if ((r !== p.own || p.arm <= 0) && Math.hypot(r.car.x - p.x, r.car.z - p.z) < 2.3 && !r.car.air){ p.m.visible = false; rcHit(r, '奶茶'); break; }
  }
}

/* ---------- HUD, buttons, cards ---------- */
(function(){
  const css = document.createElement('style');
  css.textContent = `
#rcHud{position:fixed;z-index:6;left:calc(var(--safe-l, 0px) + 14px);top:50%;transform:translateY(-50%);padding:10px 14px;min-width:150px;font-variant-numeric:tabular-nums;pointer-events:none}
#rcHud .rc-pos{font-family:var(--display, inherit);font-size:34px;font-weight:900;line-height:1;color:var(--tile)}
#rcHud .rc-pos small{font-size:15px;color:var(--muted);font-weight:600}
#rcHud .rc-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-top:4px}
#rcHud .rc-row span{color:var(--muted)}
#rcHud .rc-gap.ahead{color:#2e9d5b} #rcHud .rc-gap.behind{color:#d0473b}
#rcHud .rc-warn{margin-top:6px;font-weight:700;color:#d0473b;font-size:13px}
#rcBtns{position:fixed;z-index:7;left:calc(var(--safe-l, 0px) + 14px);top:calc(50% + 74px);display:flex;gap:6px}
#rcBtns button,#rcItem{min-height:36px;padding:5px 11px;border-radius:var(--r-lg, 14px);border:1px solid var(--line);background:var(--panel);color:var(--ink, #222);font-weight:700;font-size:13px;cursor:pointer}
#rcItem{position:fixed;z-index:7;left:calc(var(--safe-l, 0px) + 14px);top:calc(50% + 118px);min-width:120px;min-height:46px;font-size:15px}
#rcItem[disabled]{opacity:.45}
#rcBtns kbd,#rcItem kbd{font-size:10px;margin-left:4px;opacity:.6}
@media (pointer:coarse){#rcItem{left:auto;top:auto;right:calc(var(--safe-r, 0px) + 16px);bottom:calc(var(--safe-b, 0px) + 222px);min-width:104px;min-height:58px;font-size:16px}#rcBtns kbd,#rcItem kbd{display:none}}
/* an item race on the kart track: the corner-speed chip of js/94-f1-drive.js (#f1Adv, added to the page after #rcItem) sits just above the item button in portrait */
@media (pointer:coarse) and (orientation:portrait){#rcItem:not([hidden]) ~ #f1Adv{bottom:calc(var(--safe-b, 0px) + 290px + max(0px, (var(--tc-s, 1) - 1) * 170px))}}
#rcCard{position:fixed;z-index:30;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 28px));max-height:calc(100vh - 40px);overflow:auto;padding:18px 18px 16px;box-sizing:border-box}
#rcCard h2{margin:2px 0 6px;font-size:22px} #rcCard p{margin:4px 0;font-size:14px;line-height:1.5}
#rcCard .rc-meta{font-size:13px;color:var(--muted);margin:6px 0 10px}
#rcCard .rc-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
#rcCard .rc-modes .btn{min-height:46px;font-size:14px;font-weight:700}
#rcCard .rc-list{list-style:none;margin:6px 0;padding:0;font-size:13px}
#rcCard .rc-list li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--line)}
#rcCard .rc-list button{font-size:12px}
#rcCard h3{font-size:13px;margin:12px 0 2px;color:var(--muted)}
@media (max-width:560px){#rcHud{top:248px;transform:none;padding:8px 10px;min-width:118px}#rcHud .rc-pos{font-size:26px}#rcHud .rc-row{font-size:12px}#rcBtns{top:392px}}
`;
  document.head.appendChild(css);
})();
const rcHudEl = document.createElement('div'); rcHudEl.id = 'rcHud'; rcHudEl.className = 'panel'; rcHudEl.hidden = true; rcHudEl.setAttribute('aria-live', 'off'); document.body.appendChild(rcHudEl);
const rcBtns = document.createElement('div'); rcBtns.id = 'rcBtns'; rcBtns.hidden = true;
rcBtns.innerHTML = '<button type="button" id="rcReset">回赛道<kbd>T</kbd></button><button type="button" id="rcQuit">退出比赛</button>';
document.body.appendChild(rcBtns);
const rcItemBtn = document.createElement('button'); rcItemBtn.type = 'button'; rcItemBtn.id = 'rcItem'; rcItemBtn.disabled = true; rcItemBtn.hidden = true; rcItemBtn.innerHTML = '道具<kbd>X</kbd>';
document.body.appendChild(rcItemBtn);
rcItemBtn.addEventListener('pointerdown', e => { e.preventDefault(); ac(); if (RC.st === 'run' && RC.me && driving === RC.me.car) rcUse(RC.me); });
rcBtns.querySelector('#rcReset').addEventListener('click', () => { ac(); rcResetCar(); canvas.focus({preventScroll:true}); });
rcBtns.querySelector('#rcQuit').addEventListener('click', () => { ac(); rcAbort(); canvas.focus({preventScroll:true}); });
function rcHudShow(on){ rcHudEl.hidden = !on; rcBtns.hidden = !on; rcItemBtn.hidden = !(on && RC.mode === 'items'); rcHudCache = ''; if (on) rcHudItem(); }
function rcHudItem(){ const it = RC.me && RC.me.item; rcItemBtn.disabled = !it; rcItemBtn.firstChild.textContent = it ? RC_ITEMS[it][1] + ' ' + RC_ITEMS[it][0] : '道具'; }
function rcResetCar(){
  if (RC.st !== 'run' || !RC.me) return;
  if (driving !== RC.me.car){ if (RC.me.car.wrecked || nw.state === 'fly') return; if (driving) leaveCar(); enterCar(RC.me.car); }   /* on foot: 回赛道 puts you back in too */
  const T = RC.T, me = RC.me, s = Math.max(me.next > 0 ? T.cps[me.next - 1] : me.d - 6, me.d - 6);
  me.d = s; const ss = T.closed ? ((s % T.P.L) + T.P.L) % T.P.L : s, [x, z, tx, tz] = rcAt(T.P, ss);
  rcPlace(me.car, x, z, Math.atan2(tx, tz)); me.hint = rcNear(T.P, x, z).i; me.s = rcNear(T.P, x, z, me.hint).s; me.spin = 0;
  camYaw = me.car.h + Math.PI;
}
let rcHudCache = '';
function rcHud(){
  const T = RC.T, me = RC.me, n = RC.racers.length;
  const prog = r => r.fin != null ? 1e9 - r.fin : r.d, place = RC.racers.filter(r => prog(r) > prog(me)).length + 1;
  const lap = T.closed ? Math.min(T.laps, Math.floor(me.next / T.ncp) + 1) : 0;
  let gap = '';
  const G = RC.ghost;
  if (G && RC.st === 'run'){
    const lapT = T.closed ? RC.t - me.lapStart : RC.t, myProg = T.closed ? me.d - Math.floor(me.next / T.ncp) * T.P.L : me.d - T.s0;
    const g = lapT - rcGhostTimeAt(G, myProg); gap = `<div class="rc-row"><span>影线 ${G.name}</span><b class="rc-gap ${g <= 0 ? 'ahead' : 'behind'}">${g <= 0 ? '−' : '+'}${Math.abs(g).toFixed(2)}</b></div>`;
  }
  const pos = RC.mode === 'ghost' ? `<div class="rc-pos">${T.icon}<small> ${T.closed ? `第 ${lap}/${T.laps} 圈` : '冲刺'}</small></div>` : `<div class="rc-pos">${place}<small>/${n} 名</small></div>`;
  const warn = RC.msg || (RC.wrongT > 1.2 ? '逆行了！掉头' : me.off > T.w / 2 + 25 ? (TOUCH ? '离赛道太远，点「回赛道」' : '离赛道太远，按 T 回赛道') : '');
  const html = pos + (T.closed && RC.mode !== 'ghost' ? `<div class="rc-row"><span>圈</span><b>${lap}/${T.laps}</b></div>` : '') +
    `<div class="rc-row"><span>用时</span><b>${rcFmt(RC.st === 'count' ? 0 : RC.t)}</b></div>` +
    (T.closed ? `<div class="rc-row"><span>最快圈</span><b>${rcFmt(me.best)}</b></div>` : '') + gap +
    `<div class="rc-row"><span>检查点</span><b>${T.closed ? Math.min(T.ncp, me.next - (lap - 1) * T.ncp) : me.next}/${T.closed ? T.ncp : T.cps.length}</b></div>` + (warn ? `<div class="rc-warn">${warn}</div>` : '');
  if (html !== rcHudCache){ rcHudCache = html; rcHudEl.innerHTML = html; }
  const t = `${T.name} · ${rcFmt(RC.st === 'count' ? 0 : RC.t)}` + (RC.mode !== 'ghost' ? ` · 第 ${place}/${n} 名` : '');
  if (missionEl.textContent !== t) missionEl.textContent = t;
}

const rcCard = document.createElement('div'); rcCard.id = 'rcCard'; rcCard.className = 'panel'; rcCard.hidden = true;
rcCard.setAttribute('role', 'dialog'); rcCard.setAttribute('aria-modal', 'true'); rcCard.setAttribute('aria-labelledby', 'rcCardT');
document.body.appendChild(rcCard);
let rcCardFor = null;
function rcCardOpen(T){
  rcCardFor = T; gx.paused = true; engineUpdate(0, 0, false);
  if (driving){ driving.vx = driving.vz = 0; }
  const b = rcSave.best[T.id] || {}, g = rcSave.ghost[T.id], km = (T.len * (T.closed ? T.laps : 1) / 1000).toFixed(1);
  rcCard.innerHTML = `<button class="x" type="button" id="rcX" aria-label="关闭">×</button>
    <div class="eyebrow">赛事 · ${T.closed ? T.laps + ' 圈' : '冲刺'} · ${km} 公里</div><h2 id="rcCardT">${T.icon} ${T.name}</h2><p>${T.desc}</p>
    <div class="rc-meta">本机最好：${T.closed ? '单圈 ' + rcFmt(T.bestLap ? T.bestLap() : b.lap) + ' · 完赛 ' + rcFmt(b.run) : rcFmt(b.run)}${rcSave.wins[T.id] ? ` · 赢过 ${rcSave.wins[T.id]} 场` : ''}${T.dayCap ? ` · 今日奖金 RM ${rcDay(T).n}/${T.dayCap}` : ''}</div>
    <div class="rc-modes"><button class="btn primary" type="button" data-m="ai">人机赛</button><button class="btn primary" type="button" data-m="items">道具赛</button><button class="btn primary" type="button" data-m="ghost">影线 1v1</button></div>
    <p class="rc-meta">${T.note ? T.note + '<br>' : ''}人机赛：${rcAiN(T)} 辆 AI ${T.aiKind ? CAR_T[T.aiKind].name : '车'}，按名次发奖金。道具赛：撞开问号箱拿道具（${TOUCH ? '点「道具」' : 'X 键'}用）。影线 1v1：没有 AI，和一辆半透明的影子车比${T.closed ? '单圈' : '用时'}。</p>
    <div id="rcGhosts" hidden><h3>选一个影线对手</h3><ul class="rc-list" id="rcGl"></ul></div>
    <h3>排行榜前三</h3><ul class="rc-list" id="rcTop"><li>${rcOnline() ? '读取中…' : window.XNet && XNet.offText ? XNet.offText() : '联机未开启，成绩只存在本机'}</li></ul>`;
  rcCard.hidden = false;
  rcCard.querySelector('#rcX').addEventListener('click', rcCardClose);
  rcCard.querySelectorAll('[data-m]').forEach(bt => bt.addEventListener('click', () => {
    ac(); const m = bt.dataset.m;
    if (m !== 'ghost'){ gx.paused = false; rcStart(T, m); return; }
    const box = rcCard.querySelector('#rcGhosts'), ul = rcCard.querySelector('#rcGl'); box.hidden = false; ul.innerHTML = '';
    const add = (label, t, src) => { const li = document.createElement('li'); li.innerHTML = `<span>${label}</span><span>${rcFmt(t)} <button class="btn" type="button">比一场</button></span>`;
      li.querySelector('button').addEventListener('click', () => { gx.paused = false; rcStart(T, 'ghost', src); }); ul.appendChild(li); };
    if (g) add('我的影线', g.t, Object.assign({name:'我的影线'}, g));
    const solo = document.createElement('li'); solo.innerHTML = `<span>${g ? '不要对手，单人计时' : '还没有影线：先跑一次计时，会自动存下'}</span><span><button class="btn" type="button">计时赛</button></span>`;
    solo.querySelector('button').addEventListener('click', () => { gx.paused = false; rcStart(T, 'ghost', null); }); ul.appendChild(solo);
    if (rcOnline()){
      const wait = document.createElement('li'); wait.textContent = '正在读取排行榜上的影线…'; ul.appendChild(wait);
      rcGhostList(T).then(list => { if (rcCardFor !== T) return; wait.remove(); for (const o of list) add('🏁 ' + o.name, o.t, o); if (!list.length){ const li = document.createElement('li'); li.textContent = '排行榜上还没有别人的影线'; ul.appendChild(li); } });
    }
  }));
  if (rcOnline() && window.XNet.miniTop) XNet.miniTop('race_' + T.id, 3).then(rows => {
    const ul = rcCard.querySelector('#rcTop'); if (!ul || rcCardFor !== T) return; ul.innerHTML = '';
    if (!rows.length) ul.innerHTML = '<li>还没人上榜，去当第一个</li>';
    rows.forEach((r, i) => { const li = document.createElement('li'); li.append(`${i + 1}. ${String(r.name || '?').slice(0, 16)}`); const v = document.createElement('b'); v.textContent = rcFmt((RC_MAX - r.value) / 100); li.append(v); ul.appendChild(li); });
  });
  rcCard.querySelector('[data-m="ai"]').focus({preventScroll:true});
}
function rcCardClose(){ if (rcCard.hidden) return; rcCard.hidden = true; if (rcCardFor && RC.st === 'idle') RC.rearm = rcCardFor; rcCardFor = null; gx.paused = false; canvas.focus({preventScroll:true}); }
function rcCardResult(R){
  rcCardFor = R.T; gx.paused = true; engineUpdate(0, 0, false);
  rcCard.innerHTML = `<button class="x" type="button" id="rcX" aria-label="关闭">×</button>
    <div class="eyebrow">${R.T.icon} ${R.T.name} · ${{ai:'人机赛', items:'道具赛', ghost:'影线 1v1'}[R.mode]}</div><h2 id="rcCardT">${R.head}</h2><p>${R.sub || ''}${R.newRec ? ' · 新纪录！' : ''}</p>
    ${R.lines.length ? `<ul class="rc-list">${R.lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
    <p class="rc-meta">${R.capped ? `今天的奖金领满了（每天 RM ${R.T.dayCap}），明天再来` : R.pay ? '奖金 +RM ' + R.pay + (R.dayLeft != null ? ` · 今天还能领 RM ${R.dayLeft}` : '') : R.done ? '这场没有奖金' : '没跑完，没有奖金'}${R.mode === 'items' ? ' · 道具赛不上榜' : R.nos ? ' · 用了氮气或技能，这场不上榜' : R.T.boardNote ? ' · ' + R.T.boardNote(R.mode) : ''}</p>${window.XParts ? XParts.chips(R.loot) : ''}
    <div class="hrow"><button class="btn primary" type="button" id="rcAgain">再来一场</button><button class="btn" type="button" id="rcOk">好</button></div>`;
  rcCard.hidden = false;
  const close = () => { rcCard.hidden = true; rcCardFor = null; gx.paused = false; canvas.focus({preventScroll:true}); };
  rcCard.querySelector('#rcX').addEventListener('click', close); rcCard.querySelector('#rcOk').addEventListener('click', close);
  rcCard.querySelector('#rcAgain').addEventListener('click', () => { close(); RC.rearm = null; rcCardOpen(R.T); });
  rcCard.querySelector('#rcOk').focus({preventScroll:true});
}

/* ---------- event points (idle) ---------- */
function rcIdle(dt, px, pz, hide){
  hide = hide || qCalm();
  rcPromptMsg = '';
  const now = performance.now();
  for (const T of RC_TRACKS){
    const e = T.ev; e.g.visible = !hide; e.lbl.dead = hide; if (hide) continue;
    e.ring.scale.y = 1 + Math.sin(now / 330) * .15;
    const d = Math.hypot(px - e.x, pz - e.z);
    if (RC.rearm === T){ if (d > 16) RC.rearm = null; continue; }
    if (d < 7){
      const sp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
      if (!driving && T.walkIn){ if (nw.state !== 'fly'){ rcCardOpen(T); break; } }
      else if (!driving) rcPromptMsg = `开车进圈参加「${T.name}」`;
      else if (sp > 14) rcPromptMsg = `慢一点进圈 · ${T.name}`;
      else { rcCardOpen(T); break; }
    }
  }
}
function rcHideEvents(){ for (const T of RC_TRACKS){ T.ev.g.visible = false; T.ev.lbl.dead = true; } }
rcHideEvents();

window.addEventListener('keydown', e => {
  if (e.repeat || mode !== 'naiwa' || e.target.tagName === 'INPUT') return;
  if (!rcCard.hidden){ if (e.code === 'Escape'){ e.stopImmediatePropagation(); rcCard.querySelector('#rcX').click(); } return; }
  if (RC.st !== 'run' || gx.paused) return;
  if (e.code === 'KeyX' && RC.me && driving === RC.me.car){ rcUse(RC.me); e.preventDefault(); }
  if (e.code === 'KeyT'){ rcResetCar(); e.preventDefault(); }
}, true);

/* ---------- hook into the game ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      if (RC.st === 'idle') rcIdle(dt, px, pz, base.busy() || base.extBusy() || mission.on);
      else { rcHideEvents(); rcUpdate(dt); }
    },
    busy(){ return RC.st !== 'idle' || base.busy(); },
    extBusy(){ return RC.st !== 'idle' || base.extBusy(); },
    prompt(){ return RC.st !== 'idle' ? (RC.msg || '') : rcPromptMsg || base.prompt(); },
    target(){
      if (RC.st === 'idle') return base.target();
      const T = RC.T, cs = T.cps[RC.me.next]; if (cs == null) return base.target();
      const [x, z] = rcAt(T.P, T.closed ? cs % T.P.L : cs); return {x, z, label:RC.me.next === T.cps.length - 1 ? '终点' : `${T.name} · 检查点`};
    },
    mini(dot){
      base.mini(dot);
      if (RC.st === 'idle'){ if (!base.busy() && !mission.on) for (const T of RC_TRACKS) dot(T.ev.x, T.ev.z, T.color, 6); return; }
      const T = RC.T, cs = T.cps[RC.me.next]; if (cs != null){ const [x, z] = rcAt(T.P, T.closed ? cs % T.P.L : cs); dot(x, z, T.color, 8); }
      for (const r of RC.racers) if (r.ai) dot(r.car.x, r.car.z, r.color, 4);
      if (RC.ghost && RC.ghost.mesh.visible) dot(RC.ghost.mesh.position.x, RC.ghost.mesh.position.z, '#8fd3ff', 4);
    },
    onBust(){ rcAbort(true); base.onBust(); },
    leave(){ rcCardClose(); rcAbort(true); rcHideEvents(); RC.rearm = null; base.leave(); },
    togglePause(){ if (!rcCard.hidden){ rcCard.querySelector('#rcX').click(); return; } base.togglePause(); }
  });
}

/* ---------- for testing without animation frames (a hidden tab): XRace.sim.step(sec, each) ---------- */
/* ---------- in a race you stay in your own car ----------
   A hard bump (80 km/h and up, easy against the AI) or F at speed used to throw 奶娃 out; F then got you into whatever car was
   nearest, often a rival's, and from then on none of your checkpoints counted. Now: no ejecting from the race car, F while in
   it does nothing (退出比赛 is the way out), and F on foot gets you back into your own race car, never someone else's. */
const rcLive = () => !!RC.me && (RC.st === 'run' || RC.st === 'count');
function raceTryF(){
  if (!rcLive()) return false;
  const mc = RC.me.car;
  if (driving === mc){ toast('比赛进行中', '想退出就点「退出比赛」', 1600); return true; }
  if (driving){ leaveCar(); }
  if (nw.state === 'fly') return true;
  if (mc.wrecked){ toast('赛车撞坏了', '点「退出比赛」再来一场', 1800); return true; }
  if (Math.hypot(mc.x - nw.x, mc.z - nw.z) < 40){ enterCar(mc); return true; }
  toast('离你的赛车太远了', TOUCH ? '点「回赛道」直接回到车上' : '按 T 直接回到车上', 1800); return true;
}
{
  const baseEject = eject;
  window.eject = function(impact){
    if (rcLive() && driving === RC.me.car && !RC.me.car.wrecked){ camShake = Math.max(camShake, Math.min(1.4, impact / 25)); return; }
    return baseEject.apply(this, arguments);
  };
}
/* a track from another file (it may be built after this one loads, like the kart track in js/92-kart-race.js). Optional fields:
   raw (pts already spaced every few metres, closed), evAt [x, z] for the flag, grid(k) → [x, z, h, s], ai() AI count, aiKind (every AI drives this car),
   aLat [lo, hi] corner grip of the AI, rub [up, down, metres] rubber band, bump (push of a hit), line(s) racing-line offset (+ left), pay (prize factor), dayCap (RM a day),
   prep(mode) (before the start; false cancels), lapOk() (is the lap that just ended clean), bestLap(), board:false (no /mini/race_<id> board of its own),
   boardNote(mode), walkIn (on foot opens the card), note (a line on the card), onFinish(result, me), extra (not one of the five for 全图车手) */
function rcAddTrack(T){
  if (RC_TRACKS.some(t => t.id === T.id)) return null;
  T.extra = true; rcPrep(T); rcFlag(T); RC_TRACKS.push(T); T.ev.g.visible = false; T.ev.lbl.dead = true;
  return T;
}
window.XRace = {
  tracks:RC_TRACKS, state:RC, start:rcStart, addTrack:rcAddTrack, abort:rcAbort, enc:rcEnc, dec:rcDec, near:rcNear, at:rcAt,
  sim:{
    step(sec, each){
      const dt = 1 / 60; let n = Math.round(sec / dt), t = performance.now() / 1000;
      while (n-- > 0){ if (each && each(dt) === false) break; if (!gx.paused) updateNaiwaMode(dt, t += dt); }
      renderer.render(scene, camera);
    }
  }
};
