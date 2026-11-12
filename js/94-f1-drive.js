/* XMUM 校园漫游 · 雪邦赛道的手感（js/92-f1park.js 的赛道上才生效，出了赛道一切照旧）
 *
 * 为什么容易飞出去：赛道是 1:1.8 的缩小版，车却是原速（兰博鸡尼 288 km/h），而游戏的车本来没有「抓地极限」：
 *   方向打满在什么速度都能转很小的弯，所以高速时手指一抖车头就甩，键盘一按就是满舵。
 * 这里的做法：
 *   1. 速度越快、转向越稳：最大转向角按「抓地极限」算（能转的最小半径 = 速度² / 侧向抓地力），而且比建议车速宽松 35%，
 *      方向打满最少也留三成转向，所以按住方向一定转得动。
 *   2. 太快进弯不再「拐不过来」（仓库主人反馈）：按着方向往前面那个弯拐、但车速超过这个弯能过的速度时，自动「擦胎减速」
 *      （越快擦得越狠，车稍微往外滑），减到过得去为止；速度对了就不擦，所以会刹车的人照样更快。
 *      赛道路面抓地力随速度变大（下压力），按住漂移照样能甩尾。
 *   刹车辅助（手机上默认开，提示条上可以关）：离慢弯太近又太快时自动松油门、轻踩刹车；按住漂移不管它。
 *   3. 草地中等减速、砂石明显减速，都不会让车打转（出赛道时不能手刹甩尾，车往车头方向走）。
 *   4. 刹车牌：慢弯前 100 米、50 米各一块；屏幕上方有建议过弯速度（按这辆车的抓地力算），绿色刚好、黄色该刹车了、红色太快。点它可以关掉。
 *   5. 回到赛道：T 键或「回赛道」按钮，回到最近一次在赛道上的位置，车头朝前；计时圈加 5 秒罚时。
 *   6. 速度感：越快视野越宽、镜头往弯心看一点；压路肩有震动声，安卓手机还会震一下（点提示条上的「震动」可以关）。
 *   极速：普通车在赛道上不再砍一半（仓库主人：改好的车要能在赛道上爽）。只有 100 m/s（360 km/h）以上的部分算一半，
 *   只削掉离谱的速度；直道是改装车发威的地方，弯道靠上面的擦胎减速 / 刹车自然慢下来。
 *   普通车的改装都算数：引擎（车行改装店和改装车间的引擎件）给加速和极速；轮胎、悬挂、宽体这些给的抓地（T.grip）
 *   换算成过弯抓地 a0 = 13 ×（抓地 / 8.2）^0.6。
 *   赛车（方程式赛车）的特别之处是下压力：侧向抓地 +3、下压力 +0.8，高速弯比任何普通车都稳；改满的普通车直道更快，
 *   跑得好的赛车一圈更快。
 *   刹车牌：慢弯前 100 米、50 米；最慢的几个弯（建议车速 80 km/h 以下）前面还有 200 米。
 * 换赛道：这些手感不绑死在 XF1 上，XF1D.addTrack({PT, N, TAN, NOR, CURV, HWI, HW, KERB, kerbAt, slow, PAD, turnIdx, ROAD?, PIT?, S?})
 *   就能给另一条赛道（比如以后单独的大地图）用同一套转向、擦胎、刹车辅助、刹车牌和回赛道。
 * 赛道界限（F1 规则）：四个轮子都出了路肩超过 1 秒、或者在赛道外抄近路超过 30 米，这一圈不计成绩（照样跑完、照样显示时间）。
 * 对外：window.XF1D = {addTrack(t), tracks, where(car), reset(), opt, cfg, mods, spec(car), adv(spec, track), corners, boards}；
 *   改装（js/92-f1-tuning.js）往 mods 里加函数改 a0 / df / grip / brake / acc / vmax（极速倍数 +）/ off。
 * 设置存 localStorage 'xmum-f1-v1' = {adv, vib}。 */
'use strict';
(() => {
  if (typeof updateCar !== 'function') return;
  const OPT = {adv:true, vib:true, assist:TOUCH};   /* brake assist: on by default on phones */
  try { Object.assign(OPT, JSON.parse(localStorage.getItem('xmum-f1-v1') || '{}')); } catch(e){}
  const optSave = () => { try { localStorage.setItem('xmum-f1-v1', JSON.stringify(OPT)); } catch(e){} };
  const PEN = 5, VKNEE = 100;   /* reset penalty (s); only speed above 100 m/s (360 km/h) counts half on a circuit */
  const CFG = {grip:1.35, floor:.3, scrub:40, sv:1.6, look:1.5, qMax:2, slide:.3, assist:7, adv:1.2};   /* steering cap margin over the advisory grip, least steering kept at full lock, scrub (m/s² when far too fast; × (1 + sv·v/50), faster cars scrub harder), how far ahead it looks (s of travel), lateral grip lost while scrubbing, assist braking (m/s²), advisory grip margin */

  /* ---------- circuits: the handling works on any track registered here (XF1 now; a separate F1 map later) ---------- */
  const TRACKS = [];
  function addTrack(t){
    const N = t.N, segs = t.ROAD ? t.ROAD.p : null;
    Object.assign(t, {wi:i => ((i % N) + N) % N, advCache:{}, PIT:t.PIT || null, KERB:t.KERB || 2.4, HW:t.HW || 7, turnIdx:t.turnIdx || [],
      kerbAt:t.kerbAt || (() => false), slow:t.slow || (() => false),
      onRoad:(x, z) => { if (!segs) return false; for (let i = 0; i < segs.length - 1; i++){ const p = segs[i]; if (Math.abs(p[0] - x) > 40 || Math.abs(p[1] - z) > 40) continue; if (segDist(x, z, p, segs[i + 1]) < t.ROAD.w / 2) return true; } return false; }});
    TRACKS.push(t); if (t.boards !== false) buildBoards(t);
    return t;
  }
  /* where a car is: the circuit it is on, nearest point, offset, surface */
  function where(c){
    let tr = c._f1t && TRACKS.includes(c._f1t) ? c._f1t : null;
    const inBox = t => c.x > t.PAD.x0 - 30 && c.x < t.PAD.x1 + 30 && c.z > t.PAD.z0 - 30 && c.z < t.PAD.z1 + 30;
    if (!tr || !inBox(tr)){ tr = TRACKS.find(inBox) || null; c._f1i = null; }
    c._f1t = tr; if (!tr){ c._f1i = null; return null; }
    const {PT, NOR, HWI, CURV, PIT, N, wi} = tr;
    let bi = -1, bd = 1e18;
    const scan = (a, b) => { for (let k = a; k <= b; k++){ const i = wi(k), dx = c.x - PT[i][0], dz = c.z - PT[i][1], d = dx * dx + dz * dz; if (d < bd){ bd = d; bi = i; } } };
    if (c._f1i != null) scan(c._f1i - 15, c._f1i + 15);
    if (bi < 0 || bd > 900) scan(0, N - 1);
    c._f1i = bi;
    const lat = (c.x - PT[bi][0]) * NOR[bi][0] + (c.z - PT[bi][1]) * NOR[bi][1], a = Math.abs(lat), hw = HWI[bi];
    let s;
    if (a <= hw) s = 'track';
    else if (a <= hw + tr.KERB && tr.kerbAt(bi)) s = 'kerb';
    else if (PIT && Math.sign(lat) === PIT.side && a <= tr.HW + 14 && ((bi - PIT.i0 + 12 + N) % N) < PIT.i1 - PIT.i0 + 24) s = 'track';   /* pit lane */
    else if (tr.onRoad(c.x, c.z)) s = 'road';
    else if (a <= hw + 20 && tr.slow(bi) && Math.sign(lat) === -Math.sign(CURV[bi])) s = 'gravel';
    else s = 'grass';
    return {i:bi, lat, d:Math.sqrt(bd), hw, s, tr};
  }

  /* ---------- per-car numbers on the circuit; tuning parts change them through mods ---------- */
  const mods = window.XF1D_MODS || (window.XF1D_MODS = []);   /* js/92-f1-tuning.js puts the 赛道 parts in here */
  function spec(c){
    /* the car's own grip (stock tyres, 改装店 tyre levels, tuning parts) sets its cornering: a0 = 13 × (grip / 8.2)^0.6 */
    const g = c.T && c.T.grip > 0 ? c.T.grip : 8.2;
    const m = {a0:13 * Math.pow(g / 8.2, .6), df:.6, grip:1, brake:1, acc:1, vmax:0, off:1, tag:''};
    for (const f of mods) try { f(c, m); } catch(e){}
    return m;
  }

  /* ---------- the physics: wraps updateCar (outside the nitro wrapper of js/94-tuning-drive.js) ---------- */
  const base = updateCar;
  updateCar = function(c, dt, inp){
    const moving = inp && (inp.thr || Math.abs(c.vx) + Math.abs(c.vz) > .8);
    const W = moving && !c.air ? where(c) : null;
    c._f1 = W;
    if (!W || W.d > W.hw + 60) return base(c, dt, inp);
    const T = c.T, m = spec(c), fx = Math.sin(c.h), fz = Math.cos(c.h), vf = c.vx * fx + c.vz * fz, v = Math.abs(vf);
    const asphalt = W.s === 'track' || W.s === 'kerb' || W.s === 'road', q = Math.min(CFG.qMax, (v / 50) ** 2);   /* downforce stops growing past ~230 km/h, so 380 km/h straights stay calm */
    let steer = inp.steer, brake = inp.brake, thr = inp.thr;
    /* grip-limited steering, made forgiving (the owner: 「拐弯拐不过来」): the cap uses 1.35× the grip of the advisory speeds,
       and full lock always keeps at least half the normal steering. Asking for more than the grip allows scrubs speed off
       instead (tyres sliding), so arriving too fast means slower through the corner, not straight on into the gravel. */
    const aMax = m.a0 * (asphalt ? 1 + m.df * q : (W.s === 'grass' ? .75 : .6) * m.off) * (brake && asphalt ? 2.2 : 1), vv = Math.max(v, 4);
    const kRaw = Math.atan(T.wb * aMax * CFG.grip / (vv * vv)) * (1 + .025 * v) / T.steer, k = Math.min(1, Math.max(CFG.floor * Math.min(1, (80 / vv) ** 2), kRaw));   /* the floor fades out above 288 km/h (tuned cars): there it would only make the straights twitchy */
    /* scrub: you hold the steering into the corner ahead (same way it bends) but are faster than the car can take it: bleed the
       speed down to what the corner allows. At the right speed nothing happens, so holding a key through a corner costs nothing */
    c._f1want = (c._f1want || 0) + (steer - (c._f1want || 0)) * Math.min(1, dt * 2.5);   /* held steering, not a quick tap on the keys */
    let over = 0;
    if (asphalt && !brake && v > 8 && Math.abs(c._f1want) > .35){
      let kc = 0; const ahead = Math.round(Math.min(CFG.look * 60, 6 + v * CFG.look / 3));   /* looks further ahead the faster you go */
      for (let d = 0; d <= ahead; d += 2){ const cv = W.tr.CURV[W.tr.wi(W.i + d)]; if (Math.sign(cv) === Math.sign(c._f1want)) kc = Math.max(kc, Math.abs(cv)); }
      if (kc > 1 / 400){ const vOk = Math.sqrt(aMax * CFG.grip / kc); if (v > vOk) over = Math.min(1, (v - vOk) / Math.max(4, vOk) * 3) * Math.min(1, Math.abs(c._f1want) * 1.4); }
    }
    steer *= k;
    /* brake assist (touch: on by default): lift and brake gently when well over the speed for the next slow corner; the drift button overrides */
    let assist = 0;
    if (OPT.assist && c === driving && asphalt && !brake && thr >= 0 && v > 15){
      const A = adv(m, W.tr); let need = 99;
      for (const K of A.corners){ const d = W.tr.wi(K.i - W.i) * 3; if (d < 180 && K.v < 40) need = Math.min(need, Math.sqrt(K.v * K.v * 1.1 + 2 * 12 * d)); }
      if (v > need * 1.06){ assist = Math.min(1, (v - need * 1.06) / 6); thr = 0; }
    }
    ST.assist = c === driving ? assist : ST.assist;
    const save0 = T.maxV, save1 = T.grip, save2 = T.acc;
    if (asphalt){
      T.grip = save1 * m.grip * (1 + m.df * q * .8) * (1 - CFG.slide * over); T.acc = save2 * m.acc;   /* asking too much: the tyres slide, the car runs a little wide */
      const top = save0 * (1 + m.vmax), cap = top > VKNEE ? VKNEE + (top - VKNEE) * .5 : top;   /* no halving any more: only past 360 km/h */
      T.maxV = v > cap ? Math.max(cap, v - 9 * dt) : cap;   /* above the circuit top speed: eases down like drag, no sudden clamp */
    } else {
      brake = false;                                         /* no handbrake spins on the grass or in the gravel */
      T.grip = Math.max(save1, 7) * 1.25 * Math.min(1, m.off + .2);
      T.acc = save2 * (W.s === 'gravel' ? .35 : .65);
      T.maxV = Math.min(save0, Math.max(v - 3 * dt, W.s === 'gravel' ? 10 : 32));
    }
    if (thr < 0 && vf > .5) T.acc *= m.brake;               /* the brakes scale with the car's pull (js/40-vehicles.js); carbon brakes add to that */
    try { base(c, dt, {thr, steer, brake}); } finally { T.maxV = save0; T.grip = save1; T.acc = save2; }
    if (!asphalt && !c.air){ const f = Math.exp(-(W.s === 'gravel' ? 2.6 : .5) * dt); c.vx *= f; c.vz *= f; }
    /* scrub and assist: take speed off along the direction of travel */
    const dec = (over > .02 ? CFG.scrub * over * (1 + CFG.sv * v / 50) : 0) + assist * CFG.assist, sp = Math.hypot(c.vx, c.vz);
    if (dec > 0 && sp > 1 && !c.air){
      const f = Math.max(0, 1 - dec * dt / sp); c.vx *= f; c.vz *= f;
      if (over > .3 && typeof skidAt === 'function'){ const hx = Math.sin(c.h), hz = Math.cos(c.h); for (const sx of [-1, 1]) skidAt(c.x - hx * T.wb / 2 + hz * sx * (T.W / 2 - .1), c.z - hz * T.wb / 2 - hx * sx * (T.W / 2 - .1), c.h, c.y); }
      if (c === driving && over > .3){ ST.squeal -= dt; if (ST.squeal <= 0){ ST.squeal = .18; noise(.16, .05, 1800, 'bandpass'); } }
    }
    if (W.s === 'track' && Math.abs(W.lat) < W.hw - 1) c._f1good = W.i;
  };

  /* ---------- advisory corner speeds, from the curvature and this car's grip ---------- */
  function adv(m, tr){
    tr = tr || TRACKS[0]; const {CURV, wi} = tr, advCache = tr.advCache;
    const key = m.a0.toFixed(2) + '|' + m.df.toFixed(3) + '|' + CFG.adv; if (advCache[key]) return advCache[key];
    m = Object.assign({}, m, {a0:m.a0 * CFG.adv});
    const vc = CURV.map(c => { const k = Math.abs(c); if (k < 1e-4) return 99; const den = k - m.a0 * m.df / 2500; return den <= 0 ? 99 : Math.min(99, Math.sqrt(m.a0 / den)); });
    const v = vc.map((_, i) => { let s = 99; for (let d = -3; d <= 3; d++) s = Math.min(s, vc[wi(i + d)]); return s; });
    const corners = tr.turnIdx.map(([n, i0]) => { let bi = i0, bv = 99; for (let d = -9; d <= 9; d++){ const i = wi(i0 + d); if (v[i] < bv){ bv = v[i]; bi = i; } } return {n, i:bi, v:bv * .95}; }).sort((a, b) => a.i - b.i);
    return advCache[key] = {v, corners};
  }

  /* ---------- braking boards: 200 m (the slowest corners), 100 m and 50 m before the slow corners, on the outside ---------- */
  const BOARDS = [];
  let boardTex = null;
  function buildBoards(tr){
    const {PT, N, TAN, NOR, CURV, HWI, KERB, PIT, wi} = tr, segs = tr.ROAD ? tr.ROAD.p : [];
    const tex = boardTex || (boardTex = (() => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
      [['200', '#1f2a33'], ['100', '#1b5aa6'], ['50', '#c8322a']].forEach(([t, bg], k) => { const x = k * 128; g.fillStyle = '#ffffff'; g.fillRect(x, 0, 128, 128); g.fillStyle = bg; g.fillRect(x + 8, 8, 112, 112);
        g.fillStyle = '#ffffff'; g.font = '900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 64, 68, 104); });
      const t = new THREE.CanvasTexture(cv); t.anisotropy = typeof ANISO !== 'undefined' ? ANISO : 1; return t; })());
    const pos = [], uv = [], nrm = [], posts = [], mine = [];
    const clear = (x, z, i) => {
      for (let j = 0; j < N; j += 3) if (Math.min(wi(j - i), wi(i - j)) > 12 && Math.hypot(PT[j][0] - x, PT[j][1] - z) < HWI[j] + KERB + 3) return false;
      if (tr.onRoad(x, z)) return false;
      for (let k = 0; k < segs.length - 1; k++){ const p = segs[k]; if (Math.abs(p[0] - x) < 30 && Math.abs(p[1] - z) < 30 && segDist(x, z, p, segs[k + 1]) < tr.ROAD.w / 2 + 3) return false; }
      return true;
    };
    for (const C of adv({a0:13, df:.6}, tr).corners){
      if (C.v > 38) continue;
      let e = C.i; for (let d = 0; d < 40 && Math.abs(CURV[wi(e)]) > 1 / 90; d++) e = wi(e - 1);   /* where the corner starts */
      const s = CURV[C.i] > 0 ? -1 : 1;
      for (const [dist, cell] of (C.v < 22 ? [[200, 0], [100, 1], [50, 2]] : [[100, 1], [50, 2]])){
        const i = wi(e - Math.round(dist / 3)); let ok = true;
        for (let d = 0; d <= Math.round(dist / 3); d++) if (Math.abs(CURV[wi(i + d)]) > 1 / 60){ ok = false; break; }
        if (!ok) continue;
        if (PIT && s === PIT.side && wi(i - PIT.i0 + 14) < PIT.i1 - PIT.i0 + 28) continue;
        const o = s * (HWI[i] + KERB + 2.2), x = PT[i][0] + NOR[i][0] * o, z = PT[i][1] + NOR[i][1] * o;
        if (!clear(x, z, i)) continue;
        if (mine.some(B => Math.hypot(B.x - x, B.z - z) < 25)) continue;   /* two corners close together (1 and 2): one set of boards */
        const fx = -TAN[i][0], fz = -TAN[i][1], rx = fz, rz = -fx, w = 1.5, y0 = 1.1, h = 1.5, u0 = cell / 4, u1 = u0 + .25;
        const A = [x - rx * w / 2, y0, z - rz * w / 2], B = [x + rx * w / 2, y0, z + rz * w / 2];
        pos.push(...A, ...B, B[0], y0 + h, B[2], ...A, B[0], y0 + h, B[2], A[0], y0 + h, A[2]);
        uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1); for (let q = 0; q < 6; q++) nrm.push(fx, 0, fz);
        posts.push(geoTint(geoAt(new THREE.BoxGeometry(.12, y0 + h, .12), x - fx * .08, (y0 + h) / 2, z - fz * .08), '#9aa0a6'),
          geoTint(geoAt(new THREE.BoxGeometry(w + .1, h + .1, .06), x - fx * .05, y0 + h / 2, z - fz * .05, 0, Math.atan2(fx, fz), 0), '#2b2e33'));
        mine.push({n:C.n, dist, x, z, track:tr.id});
      }
    }
    BOARDS.push(...mine);
    if (pos.length){
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({map:tex, roughness:.6, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.15})); m.receiveShadow = true; scene.add(m);
      const pm = new THREE.Mesh(geoMerge(posts), M('#ffffff', {vertexColors:true, roughness:.6})); pm.castShadow = !TOUCH; scene.add(pm);
      tr.boardMeshes = [m, pm];
    }
  }

  /* ---------- HUD: the advisory chip, the reset button ---------- */
  const css = document.createElement('style');
  css.textContent = `
#f1Adv{position:fixed;z-index:6;left:50%;top:calc(var(--safe-t, 0px) + 74px);transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;white-space:nowrap}
#f1Adv .f1-v{font-family:var(--display, inherit);font-size:18px;font-weight:900}
#f1Adv.ok .f1-v{color:#2e9d5b} #f1Adv.near .f1-v{color:#d9901a} #f1Adv.over .f1-v{color:#d0473b}
#f1Adv.over{box-shadow:0 0 0 2px #d0473b inset}
#f1Adv.off{opacity:.55;font-size:12px;padding:4px 10px}
#f1Adv .f1-vib,#f1Adv .f1-as{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);background:none;color:inherit;font-weight:600}
#f1Adv .f1-muted{color:var(--muted);font-weight:600;font-size:12px}
body.f1-reset #act-q{display:none}   /* 撩头 is disabled while driving: 回赛道 takes its place, so the button grid keeps its height */
@media (pointer:coarse) and (orientation:portrait){#f1Adv{top:auto;bottom:calc(var(--safe-b, 0px) + 264px)}}
@media (pointer:coarse) and (orientation:landscape){#f1Adv{top:calc(var(--safe-t, 0px) + 54px)}}
`;
  document.head.appendChild(css);
  const chip = {html:''};   /* the advisory chip's last HTML, so it is only rewritten when it changes */
  const advEl = document.createElement('div'); advEl.id = 'f1Adv'; advEl.className = 'panel'; advEl.hidden = true; advEl.setAttribute('role', 'button'); advEl.title = '点一下开 / 关建议车速';
  document.body.appendChild(advEl);
  advEl.addEventListener('click', e => {
    ac();
    if (e.target.closest('.f1-as')){ OPT.assist = !OPT.assist; optSave(); chip.html = ''; toast(OPT.assist ? '刹车辅助：开' : '刹车辅助：关', OPT.assist ? '太快进弯时自动松油门、轻踩刹车（按住漂移不管它）' : '全靠自己刹车', 1800); return; }
    if (e.target.closest('.f1-vib')){ OPT.vib = !OPT.vib; optSave(); if (OPT.vib && navigator.vibrate) navigator.vibrate(30); chip.html = ''; return; }
    OPT.adv = !OPT.adv; optSave(); chip.html = ''; toast(OPT.adv ? '建议车速：开' : '建议车速：关', OPT.adv ? '弯前会提示建议过弯速度' : '再点一下提示条可以打开', 1600);
    canvas.focus({preventScroll:true});
  });
  const rBtn = document.createElement('button'); rBtn.type = 'button'; rBtn.id = 'act-f1r'; rBtn.hidden = true;
  rBtn.innerHTML = '<b>回赛道</b><kbd>T</kbd>'; rBtn.setAttribute('aria-label', '回到赛道（计时圈罚 5 秒）');
  { const acts = $('#acts'); if (acts) acts.appendChild(rBtn); }
  rBtn.addEventListener('pointerdown', e => { e.preventDefault(); ac(); reset(); });

  const racing = () => typeof RC !== 'undefined' && RC.st !== 'idle';
  function reset(){
    const c = driving; if (!c || mode !== 'naiwa' || gx.paused || racing()) return false;
    const W = c._f1 || where(c); if (!W || W.d > 150) return false;
    const tr = W.tr, i = tr.wi((c._f1good != null ? c._f1good : W.i) - 3), [x, z] = tr.PT[i], h = Math.atan2(tr.TAN[i][0], tr.TAN[i][1]);
    Object.assign(c, {x, z, h, vx:0, vz:0, y:groundAt(x, z), vy:0, air:false, airT:0, lastVy:0, pitch:0, steer:0, slip:0}); c.root.position.set(x, c.y, z); c.root.rotation.set(0, h, 0);
    c._f1i = i; c._f1good = i; camYaw = h + Math.PI;
    const S = tr.S; if (S){ S.idx = i; if (S.lap){ S.lap.t += PEN; S.lap.offT = 0; S.lap.offP = 0; } }
    gx.callout('回到赛道', S && S.lap ? `计时圈罚时 +${PEN} 秒` : '', '#ff8a3d'); sfx.ding();
    return true;
  }
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyT' || e.repeat || mode !== 'naiwa' || gx.paused || racing() || e.target.tagName === 'INPUT') return;
    if (driving && driving._f1 && reset()) e.preventDefault();
  });

  /* ---------- per frame: track limits, advisory, kerb rumble ---------- */
  const ST = {rumble:0, vibT:0, crunch:0, offWarn:0, lastI:null, assist:0, squeal:0};
  const fmtK = v => Math.max(20, Math.round(v * 3.6 / 5) * 5);
  function f1Frame(dt){
    const c = driving, W = c && !c.air ? c._f1 : null, inCirc = !!(c && W && W.d < W.hw + 60 && mode === 'naiwa');
    { const h = !(inCirc && !racing()); if (rBtn.hidden !== h) rBtn.hidden = h; } document.body.classList.toggle('f1-reset', !rBtn.hidden);
    if (!inCirc){ if (!advEl.hidden) advEl.hidden = true; ST.lastI = null; return; }
    const v = Math.hypot(c.vx, c.vz), tr = W.tr, S = tr.S, half = c.T.W / 2, {kerbAt, KERB, wi} = tr;
    /* track limits: all four wheels past the kerb (or the white line where there is no kerb) */
    const lim = W.hw + (kerbAt(W.i) ? KERB : .5), out = Math.abs(W.lat) - half > lim && W.s !== 'road' && !(W.s === 'track');
    if (S && S.lap){
      const L = S.lap;
      if (out){ L.offT = (L.offT || 0) + dt; if (ST.lastI != null){ const f = wi(W.i - ST.lastI); if (f < 40) L.offP = (L.offP || 0) + f * 3; } }
      else { L.offT = 0; L.offP = 0; }
      if (!L.bad && (L.offT > 1 || L.offP > 30)){
        L.bad = L.offP > 30 ? '在赛道外抄近路，这一圈不计成绩' : '四个轮子出界超过 1 秒，这一圈不计成绩';
        gx.callout('超出赛道界限', L.bad, '#d0473b'); tone('square', 330, 220, .25, .08);
      }
    }
    ST.lastI = W.i;
    /* kerb rumble and gravel crunch, a buzz on Android */
    const onKerb = kerbAt(W.i) && Math.abs(W.lat) + half > W.hw && Math.abs(W.lat) - half < W.hw + KERB;
    if (onKerb && v > 6){
      ST.rumble -= dt; if (ST.rumble <= 0){ ST.rumble = Math.max(.045, 3 / v); tone('square', 92, 58, .05, .05); noise(.05, .05, 320); }
      ST.vibT -= dt; if (OPT.vib && TOUCH && navigator.vibrate && ST.vibT <= 0){ ST.vibT = .16; try { navigator.vibrate(14); } catch(e){} }
      camShake = Math.max(camShake, Math.min(.18, v / 300));
    }
    if (W.s === 'gravel' && v > 3){ ST.crunch -= dt; if (ST.crunch <= 0){ ST.crunch = .11; noise(.12, .07, 900); if (typeof spawnPart === 'function') spawnPart('dust', c.x - Math.sin(c.h) * 1.6, .4, c.z - Math.cos(c.h) * 1.6, 1.2, {vx:-c.vx * .1, vy:1.5, vz:-c.vz * .1, grow:2, life:.7, op:.5, color:'#cdb48a'}); } }
    /* the advisory: the next slow corner within 170 m */
    let html;
    if (!OPT.adv) html = '<span class="f1-muted">建议车速 · 关</span>';
    else {
      const A = adv(spec(c), tr); let C = null, dist = 0;
      for (const K of A.corners){ const d = wi(K.i - W.i); if (d * 3 < 170 && (C == null || d < dist)){ C = K; dist = d; } }
      if (C && C.v < v * 1.06 + (dist * 3 < 40 ? 99 : 0) && C.v < 40){
        const need = Math.sqrt(C.v * C.v + 2 * 20 * dist * 3), cls = v <= C.v * 1.04 ? 'ok' : v <= need ? 'near' : 'over';
        html = `<span>${C.n} 号弯</span><span class="f1-v">${fmtK(C.v)}</span><span class="f1-muted">km/h · ${Math.round(dist * 3)} 米${ST.assist > 0 ? ' · 辅助刹车' : ''}</span>`;
        if (advEl.className !== 'panel ' + cls) advEl.className = 'panel ' + cls;
      } else html = '';
    }
    if (html) html += `<button type="button" class="f1-as" aria-pressed="${OPT.assist}">刹车辅助${OPT.assist ? '开' : '关'}</button>`;
    if (html && TOUCH && navigator.vibrate) html += `<button type="button" class="f1-vib" aria-pressed="${OPT.vib}">震动${OPT.vib ? '开' : '关'}</button>`;
    if (!OPT.adv) advEl.className = 'panel off';
    if (html !== chip.html){ chip.html = html; advEl.innerHTML = html; }
    advEl.hidden = !html;
  }
  {
    const b = gx.update;
    gx.update = function(dt, px, pz){ b.call(this, dt, px, pz); f1Frame(dt); };
    const bl = gx.leave;
    gx.leave = function(){ advEl.hidden = true; rBtn.hidden = true; document.body.classList.remove('f1-reset'); return bl.apply(this, arguments); };
  }

  /* ---------- speed feel: wider view and a look into the corner (added on top of js/90-main.js, taken off again next frame) ---------- */
  if (typeof updateNaiwaMode === 'function'){
    const bNM = updateNaiwaMode;
    let fovAdd = 0, fovSet = null, look = 0;
    updateNaiwaMode = function(dt, T){
      if (fovAdd && fovSet != null && Math.abs(camera.fov - fovSet) < 1e-6) camera.fov -= fovAdd; else fovAdd = 0;
      bNM(dt, T);
      const c = driving, W = c && c._f1, on = !!(c && W && W.d < W.hw + 60);
      const v = c ? Math.hypot(c.vx, c.vz) : 0;
      fovAdd += ((on ? Math.max(0, Math.min(1, (v - 22) / 38)) * 8 : 0) - fovAdd) * Math.min(1, dt * 2);
      look += ((on ? Math.max(-3, Math.min(3, W.tr.CURV[W.tr.wi(W.i + 4 + Math.round(Math.min(30, v * .5 / 3)))] * 120)) * Math.min(1, v / 20) : 0) - look) * Math.min(1, dt * 2.5);
      if (fovAdd > .01){ camera.fov += fovAdd; camera.updateProjectionMatrix(); fovSet = camera.fov; } else { fovAdd = 0; fovSet = null; }
      if (c && Math.abs(look) > .02){ const fx = Math.sin(c.h), fz = Math.cos(c.h); camera.lookAt(camLook.x - fz * look, camLook.y, camLook.z + fx * look); }
    };
  }

  /* the Sepang-style circuit in the 二园 (js/92-f1park.js) */
  const F = window.XF1, main = F ? addTrack(Object.assign({id:'sepang'}, F)) : null;
  window.XF1D = {addTrack, tracks:TRACKS, where, reset, opt:OPT, mods, spec, adv, cfg:CFG, corners:main ? adv({a0:13, df:.6}, main).corners : [], boards:BOARDS, PEN, VKNEE};
})();
