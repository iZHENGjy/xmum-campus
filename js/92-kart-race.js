/* XMUM 校园漫游 · 卡丁车比赛：汽车游乐园二园的卡丁车赛道（js/92-f1park.js 的 XKart）接进竞速系统（js/92-racing.js 的 XRace.addTrack）
 *
 * 维修区车道上有一面格子旗（走路或开车进圈都行），赛事卡和别的赛道一样：人机赛、道具赛、影线 1v1，跑 3 圈。
 * 一样的车：开赛时自动给你一辆免费卡丁车（js/92-kart.js 的 XKartRent，你自己的车留在原地），AI 也全开卡丁车，没有氮气、没有改装。
 * AI：沿着一条走线跑（弯前靠外、弯心贴内、出弯放外），各人过弯胆量不同；橡皮筋比别的赛道小，碰撞也软一点。
 * 成绩：卡丁车榜（/mini/race_kart、prog.best.kartLap）只收「干净的计时圈」，规则和自由练习一样（js/94-f1-drive.js 的赛道界限）。
 *   影线 1v1 里计时照常跑，干净的一圈直接上榜，也只有干净的圈才存成影线；人机赛和道具赛有碰撞和道具，圈速不上榜（计时器这时候歇着）。
 * 奖金：和别的赛道同一张名次表，乘 0.6（卡丁车免费、一场三分钟），每天最多 RM 300，过了照样能跑，只是没奖金、不掉零件。
 * 主线第 5 章「二园卡丁车场跑一圈」：跑完一场卡丁车比赛也算（prog.best.kartRace）。 */
'use strict';
(() => {
  const F = window.XF1, K = window.XKart, R = window.XKartRent;
  if (!F || !K || !R || !window.XRace || !XRace.addTrack || !F.kart) return;
  const {PT, N, SF, TAN, NOR, CURV, HWI, HW, PIT} = F, wi = i => ((i % N) + N) % N;

  /* the centre line from the start line round (already every 3 m) */
  const pts = []; for (let j = 0; j < N; j++) pts.push(PT[wi(SF + j)]);

  /* a racing line: out before the corner, in at the apex, out again on the exit (offset to the left +, metres) */
  const avg = (i, a, b) => { let s = 0; for (let d = a; d <= b; d++) s += CURV[wi(i + d)]; return s / (b - a + 1); };
  let LINE = pts.map((_, j) => { const i = wi(SF + j), lim = HWI[i] - 2.4;
    return Math.max(-lim, Math.min(lim, 220 * (avg(i, -6, 6) - .6 * avg(i, 10, 24) - .4 * avg(i, -24, -10)))); });
  for (let pass = 0; pass < 3; pass++) LINE = LINE.map((_, j) => { let s = 0; for (let d = -5; d <= 5; d++) s += LINE[(j + d + N) % N]; return s / 11; });

  /* the grid: the painted boxes behind the line (js/92-f1park.js), 8 m apart, 3.5 m either side */
  const grid = k => {
    const [x, z] = PT[SF], [tx, tz] = TAN[SF], [nx, nz] = NOR[SF], s = -(k + 1) * 8, o = (k + 1) % 2 ? 3.5 : -3.5;
    return [x + tx * s + nx * o, z + tz * s + nz * o, Math.atan2(tx, tz), s];
  };
  /* the flag: on the pit lane, ~60 m down from the hire spot */
  const ei = wi(SF + 30), eo = PIT.side * (HW + 9), evAt = [PT[ei][0] + NOR[ei][0] * eo, PT[ei][1] + NOR[ei][1] * eo];

  const T = XRace.addTrack({
    id:'kart', name:'卡丁车赛道', icon:'🏎️', color:'#18b7a0', laps:3, w:14, closed:true, raw:true, kart:true, pts,
    desc:`汽车游乐园二园的卡丁车赛道跑三圈：一圈 ${(K.len / 1000).toFixed(1)} 公里、${K.turns} 个弯。大家都开一样的卡丁车，拼的是走线和刹车点。`,
    note:'开赛自动给你一辆免费卡丁车（你的车留在原地）。奖金按名次 ×0.6，每天最多 RM 300。',
    evAt, grid, walkIn:true, board:false, aiKind:'kart',
    ai:() => TOUCH ? 4 : 5,
    aLat:[13.5, 17], rub:[.06, .1, 1500], bump:1.05, pay:.6, dayCap:300,
    line:s => LINE[((Math.round(s * N / T.P.L) % N) + N) % N],
    prep(){
      if (typeof nw !== 'undefined' && nw.state === 'fly') return false;
      const k = R.kart();
      if (!driving || driving !== k || k.wrecked) R.rent();
      if (!driving || driving.kind !== 'kart') return false;
      driving.T = Object.assign({}, CAR_T.kart); driving.hp = 100;   /* a stock kart: equal machinery */
      return true;
    },
    /* an AI kart with nobody in it is a low black frame you can't see from 30 m: a driver in the racer's colour, a white helmet (one mesh, made once per kart) */
    aiCar(c, k, color){
      if (c._kDriver) return;
      const g = geoMerge([geoTint(geoAt(roundBox(.46, .5, .32, .1, 2), 0, .72, -.32, -.15, 0, 0), color),
        geoTint(geoAt(new THREE.SphereGeometry(.19, 12, 8), 0, 1.1, -.28), '#f4f1ea'), geoTint(geoAt(new THREE.BoxGeometry(.3, .1, .08), 0, 1.12, -.12), '#1d1f24'),
        ...[-1, 1].map(s => geoTint(geoAt(roundBox(.12, .12, .42, .05, 1), s * .22, .66, -.02, -.5, 0, 0), color))]);
      const m = new THREE.Mesh(g, M('#ffffff', {vertexColors:true, roughness:.6})); m.castShadow = !TOUCH; c.root.add(m); c._kDriver = m;
    },
    lapOk:() => { const L = K.lap(); return !!L && !L.bad; },
    bestLap:() => K.best() == null ? undefined : K.best(),
    boardNote:m => m === 'ghost' ? '干净的一圈记进卡丁车榜' : '人机赛圈速不上卡丁车榜（有碰撞）',
    onFinish(Rs){
      if (Rs.mode === 'ghost' && Rs.done && RC.me && RC.me.cleanBest == null) Rs.sub = '每一圈都出了赛道界限，没有成绩' + (RC.ghost ? ` · 影线 ${RC.ghost.name} ${Math.floor(RC.ghost.t / 60)}:${(RC.ghost.t % 60).toFixed(2).padStart(5, '0')}` : '');
      if (!Rs.done || typeof prog === 'undefined') return;
      const t = RC.me && RC.me.fin;
      if (t && !(prog.best.kartRace <= t)){ prog.best.kartRace = Math.round(t * 100) / 100; if (typeof saveGame === 'function') saveGame(); }
    }
  });
  if (T) window.XKartRace = {track:T, line:LINE, grid};
})();
