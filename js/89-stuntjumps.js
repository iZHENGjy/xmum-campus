/* XMUM 校园漫游 · 隐藏特技跳台（GTA 的 Stunt Jumps）
 *
 * 全图藏了 20 个不起眼的木板跳台 / 土坡：校园环路、后山、校门外的公路、山包、汽车游乐园。小地图上不画。
 *   - 跳台平时收在地里：开车顺着路朝它开过去（25–110 米、车头大致对着它）才从地里升起来，坡口朝着你开来的方向；
 *     每个方向开局算一遍飞行路线：落地前和落地后一段刹车距离里撞上楼、墙、围篱、地图边、游乐园的坡，或者落进湖里，那个方向就不升；
 *     太快的车在坡口被压到这个方向的安全速度（见下面 safety 一节）。木板跳台大多两头都能冲，山顶土坡只能往下坡冲；
 *     开过去几秒、离远了、从背面开回来、进了挑战 / 比赛 / 室内 / 过场 / 主线目标附近，就沉回地里。没升起来的时候不画也没有碰撞。
 *   - 车速够（54 km/h 以上）、车头朝着跳台方向冲上去 → 起跳那一刻慢动作（时间 ×0.35，约 1.2 秒）+ 侧面电影镜头；
 *   - 落地时还在车上、车没报废、飞够 0.8 秒且 15 米 → 算成功。第一次成功：「特技跳台 7/20」，RM 30（每个跳台只给一次）；以后再飞只有普通的飞跃特技分；
 *   - 找全 20 个解锁成就「特技之王」。游戏指南（P）里有一页清单：找到的写名字，没找到的给模糊提示。
 * 慢动作只缩放本机这一帧的 dt（js/90-main.js 里 gx.scale），联机位置照常按真实时间发；不碰 XNet。
 * 跳台不进 RAMPS（那是黄色跳台和「飞跃挑战」用的），这里自己包一层 groundAt：跳台完全升起来以后才有高度，叠在地形上，山坡上的也贴着坡。
 * 存档：localStorage「xmum-jumps-v1」= {found:{id: 时间戳}}（xmum- 开头，云存档会一起带上）。
 * 对外：window.XJumps = {list, found(), count(), total, up(), reset()（测试用）} */
'use strict';
(() => {
  if (typeof groundAt !== 'function' || typeof gx === 'undefined') return;
  const KEY = 'xmum-jumps-v1', MIN_V = 15, MIN_AIR = .8, MIN_DIST = 15, FIRST_RM = 30;   /* 只在第一次飞成某个跳台时给（每个跳台一辈子一次）；以后再飞只有普通的飞跃特技分 */
  /* 出现：25–110 米内开着车朝它来；离开 170 米、开过去 2.5 秒、主线目标 80 米内就收 */
  const SPAWN_R = 110, SPAWN_MIN = 25, KEEP_R = 170, RISE = .45, SINK = .5, PASS_T = 2.5, QUEST_R = 80;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  /* 2026-11 落地安全修正：a5 挪到田径场西侧那条南北路（原位置一边是楼）、peak 往南 3 米并转向东南偏东下坡（原方向 98 米就撞围篱）、
   * park 挪出汽车游乐园到西边空地（原位置在游乐园里，会撞上它自己的跳台和滚筒）。用 XJumps.audit() / XJumps.check() 检查。
  /* id 只加不改（存档记的是 id）。k: 'r' 公路边的木板跳台，'h' 山顶上的矮土坡（坡后面本来就是下坡）。h 是原来的朝向，反过来能不能冲开局自己算 */
  const JUMPS = [
    {id:'ly',     x:-100, z:-256, h:1.564,  k:'r', name:'宿舍后墙',   hint:'LY 宿舍北边，贴着围墙的那段环校路'},
    {id:'nw',     x:-432, z:-240, h:-1.515, k:'r', name:'后山脚下',   hint:'校园西北角，环校路拐弯前'},
    {id:'bridge', x:198,  z:-108, h:1.571,  k:'r', name:'桥头冲刺',   hint:'芙蓉桥东头，往 LY5 的路上'},
    {id:'hall',   x:-142, z:14,   h:1.326,  k:'r', name:'音乐厅小路', hint:'陈华春音乐厅西北边的小路'},
    {id:'a5',     x:360,  z:92,   h:Math.PI, k:'r', name:'A5 侧门',    hint:'A5 东边，田径场西侧那条路'},
    {id:'trail',  x:-351, z:-38,  h:.695,   k:'r', name:'步道入口',   hint:'上山步道口附近的岔路'},
    {id:'se',     x:552,  z:150,  h:3.142,  k:'r', name:'东南转角',   hint:'校园东南角，田径场东边的环校路'},
    {id:'east',   x:558,  z:-32,  h:3.142,  k:'r', name:'东墙直道',   hint:'校园东边的环校路，B1 背后'},
    {id:'peak',   x:-316, z:-183, h:1.833,  k:'h', name:'后山飞瀑',   hint:'后山最高处，观景亭旁边，往下冲'},
    {id:'sunw',   x:-272, z:271,  h:1.571,  k:'r', name:'大路西段',   hint:'正门西边的大路上，往东开'},
    {id:'sune',   x:820,  z:290,  h:-1.571, k:'r', name:'大路东段',   hint:'正门东边很远，快到 ERL 那一段大路'},
    {id:'kipn',   x:-98,  z:438,  h:2.477,  k:'r', name:'下坡弯道',   hint:'去 KIP 的公路，刚出 Bell 不远'},
    {id:'erl',    x:647,  z:624,  h:-.149,  k:'r', name:'车站坡道',   hint:'ERL 站西南边的公路'},
    {id:'south',  x:-282, z:1148, h:1.721,  k:'r', name:'南山公路',   hint:'地图最南边的公路，二园西头的山坡'},
    {id:'prima',  x:-460, z:915,  h:-1.439, k:'r', name:'公寓门口',   hint:'Prima Apartment 门口那条路'},
    {id:'kipw',   x:-787, z:962,  h:0,      k:'r', name:'商场西侧',   hint:'KIP 购物中心西边的路'},
    {id:'ridge',  x:-284, z:636,  h:.785,   k:'h', name:'山梁之巅',   hint:'去 KIP 的公路东边，小山顶上'},
    {id:'ehill',  x:1044, z:348,  h:-2.356, k:'h', name:'东边山包',   hint:'ERL 站北边的山坡，地图东边'},
    {id:'kiphill',x:-692, z:796,  h:0,      k:'h', name:'商场后山',   hint:'KIP 北边的山包'},
    {id:'park',   x:-1054, z:-60, h:Math.PI, k:'r', name:'游乐园暗门', hint:'汽车游乐园西边那片空地'}
  ];
  /* 「圈套」跳台（仓库主人的玩笑）：长得和特技跳台一样，冲上去落进芙蓉湖。不算在 20 个里、不进清单和成就、不给钱；落水只弹「中了我的圈套了吧 😏」。
     一样走下面的安全检查（只是允许落进湖），所以不会撞死人。 */
  const TRAPS = [
    {id:'trap_lake', x:83, z:11, h:1.868, k:'r', trap:true, name:'湖边圈套'}
  ];
  const ALL = JUMPS.concat(TRAPS);
  const SIZE = {r:{L:9, W:5, H:2.8}, h:{L:6, W:5, H:1.4}};
  const ST_OFF = 0, ST_RISE = 1, ST_UP = 2, ST_SINK = 3;
  for (const J of ALL) Object.assign(J, SIZE[J.k], {bx:Math.sin(J.h), bz:Math.cos(J.h), s:1, st:ST_OFF, p:0, pass:0, mesh:{}});

  /* ---------- save ---------- */
  let found = {};
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.found && typeof d.found === 'object') for (const J of JUMPS) if (d.found[J.id]) found[J.id] = +d.found[J.id] || 1; } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({found})); } catch(e){} };
  const count = () => JUMPS.filter(J => found[J.id]).length;

  /* ---------- facing: s = 1 the original way, -1 turned round. fx/fz/yb/yl always describe the current facing ---------- */
  const base0 = groundAt;
  const local = (J, x, z) => { const dx = x - J.x, dz = z - J.z; return {u:dx * J.fx + dz * J.fz, v:dx * J.fz - dz * J.fx}; };
  for (const J of ALL){ J.gp = base0(J.x + J.bx * J.L / 2, J.z + J.bz * J.L / 2); J.gm = base0(J.x - J.bx * J.L / 2, J.z - J.bz * J.L / 2); }
  function orient(J, s){ J.s = s; J.fx = J.bx * s; J.fz = J.bz * s; J.yl = s > 0 ? J.gp : J.gm; J.yb = s > 0 ? J.gm : J.gp; }
  ALL.forEach(J => orient(J, 1));
  /* ---------- safety: what lies ahead of each ramp, each way ----------
   * In the air a car still collides with buildings, walls, the hedge and the map edge (js/40-vehicles.js carBlocked is flat, it ignores
   * height), and above 80 km/h that throws the driver out. So for each facing we scan a straight corridor (car width + a margin) from the
   * run-up through the lip to SCAN m beyond it, and work out with the same numbers as the car physics (lift = 1.25 × slope × speed, capped
   * at 20; gravity 26) how far the car flies at each speed. Safe speed = the highest take-off speed for which every slower speed lands, and
   * rolls a runway of max(35 m, 0.9 s) to brake in, before the first obstacle and not in a lake. Faster than that, the ramp scrubs the car down to it
   * at the lip (in the slow motion you don't notice); a facing whose safe speed is under VS_MIN is not used. The lip also sends the car
   * straight along the ramp (a take-off up to ~37° off its axis would otherwise drift 20+ m sideways out of the checked lane).
   * Scanned one facing per frame once the game runs (the gate adds its late colliders on the first frame). XJumps.audit() prints it all. */
  const SCAN = 320, RUN_UP = 24, CAR_R = 1.15, LANES = [-2.5, -1.25, 0, 1.25, 2.5], VS_MIN = 50, V_TOP = 100;   /* lanes: anywhere across the 5 m ramp; VS_MIN 50 m/s = 180 km/h */
  const slopeOf = (J, s) => (J.H + (s > 0 ? J.gp - J.gm : J.gm - J.gp)) / J.L;
  function scanWay(J, s){
    const fx = J.bx * s, fz = J.bz * s, lipD = J.L / 2, at = (d, o) => [J.x + fx * d + fz * o, J.z + fz * d - fx * o];
    /* js/92-stuntpark.js (and the F1 park boxes) also crash you where the ground steps up more than ~.55 m: a ramp's side, a roller, the mound */
    const parkStep = (x, z, px, pz) => window.XPark && XPark.inPark && XPark.inPark(x, z) && base0(x, z) - base0(px, pz) > .5;
    /* the colliders near this corridor only (same maths as hitsBuilding in js/00-core.js, ~20× cheaper than testing all of them at every step) */
    const ex0 = J.x - fx * (lipD + RUN_UP), ez0 = J.z - fz * (lipD + RUN_UP), ex1 = J.x + fx * (lipD + SCAN), ez1 = J.z + fz * (lipD + SCAN);
    const near = colliders.filter(c => !c.dead && segDist(c.cx, c.cz, [ex0, ez0], [ex1, ez1]) < (c.t ? c.r : Math.hypot(c.hx, c.hz)) + 4 + CAR_R);
    const hitB = (x, z) => near.some(c => { const dx = x - c.cx, dz = z - c.cz; if (c.t) return dx * dx + dz * dz < (c.r + CAR_R) * (c.r + CAR_R); const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; return Math.abs(lx) < c.hx + CAR_R && Math.abs(lz) < c.hz + CAR_R; });
    const bx0 = Math.min(ex0, ex1) - 5, bx1 = Math.max(ex0, ex1) + 5, bz0 = Math.min(ez0, ez1) - 5, bz1 = Math.max(ez0, ez1) + 5;
    const wetL = lakes.filter(L => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of L){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return x1 > bx0 && x0 < bx1 && z1 > bz0 && z0 < bz1; });
    const hit = (x, z, px, pz) => outOfMap(x, z, CAR_R) ? 'map edge / hedge' : hitB(x, z) ? 'building / wall' : parkStep(x, z, px, pz) ? 'stunt park ramp / roller' : '';
    const w = {s, prof:[], wet:[], block:SCAN, what:'', runup:''};
    for (let d = -lipD - RUN_UP; d <= lipD && !w.runup; d += 1.5) for (const o of LANES){ const [x, z] = at(d, o), [px, pz] = at(d - 1.5, o), h = hit(x, z, px, pz); if (h){ w.runup = h + ' ' + Math.round(-d - lipD) + ' m before the ramp'; break; } }
    for (let i = 0; i <= SCAN; i++){
      const [x, z] = at(lipD + i, 0);
      w.prof.push(base0(x, z)); w.wet.push(wetL.length > 0 && wetL.some(L => inPoly(x, z, L)));
      if (w.block === SCAN) for (const o of LANES){ const [px, pz] = at(lipD + i, o), [qx, qz] = at(lipD + i - 1, o), h = hit(px, pz, qx, qz); if (h){ w.block = i; w.what = h; break; } }
    }
    return w;
  }
  /* how far past the lip (m) and how long a take-off at v m/s flies */
  function flight(J, w, v){
    const s = w.s, dt = 1 / 60;
    let vy = 1.25 * Math.min(20, slopeOf(J, s) * v), y = (s > 0 ? J.gp : J.gm) + J.H, d = 0, t = 0;
    while (t < 8){ t += dt; vy -= 26 * dt; y += vy * dt; d += v * dt; if (d >= SCAN || y <= w.prof[Math.floor(d)]) break; }
    return {d, t};
  }
  function safeAt(J, w, v){
    const f = flight(J, w, v), run = Math.max(35, v * .9), end = f.d + run + 2.5;   /* + half a car */
    if (end > w.block) return false;
    if (!J.trap) for (let i = Math.max(0, Math.floor(f.d - 2)); i <= Math.min(SCAN, Math.ceil(f.d + run)); i++) if (w.wet[i]) return false;   /* a 圈套 is meant to land in the lake */
    return true;
  }
  function rateWay(J, s){
    const w = scanWay(J, s);
    let vs = 0;
    if (!w.runup) for (let v = 15; v <= V_TOP; v++){ if (safeAt(J, w, v)) vs = v; else break; }
    w.lift = slopeOf(J, s);
    w.ok = vs >= VS_MIN && w.lift >= .05 && (J.k === 'r' || s > 0);   /* it has to tilt up to throw you (the car only leaves the ground rising > 1 m/s, i.e. lift × speed > 1; a lip on a slope steeper than itself doesn't); hill lips only ever face downhill */
    w.vs = vs;
    return w;
  }
  function judgeWay(J, s){
    const w = rateWay(J, s);
    J.way[s] = w;
    if (w.ok) clearPath(J, w);
    J.dirs = [1, -1].filter(k => J.way[k] && J.way[k].ok);
    return w;
  }
  /* knock-over trees and lamps standing in the car's lane from the run-up to the landing at the safe speed (the azClears idea; the scatter beside the road stays) */
  function clearPath(J, w){
    const f = flight(J, w, w.vs), u1 = J.L / 2 + f.d + 10, fx = J.bx * w.s, fz = J.bz * w.s;
    const hit = o => { const dx = o.x - J.x, dz = o.z - J.z, u = dx * fx + dz * fz, v = dx * fz - dz * fx; return u > -J.L / 2 - 6 && u < u1 && Math.abs(v) < J.W / 2 + 1.5; };
    let n = 0;
    if (typeof knockSets !== 'undefined') for (const set of knockSets) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); n++; } });
    if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); n++; } });
    w.cleared = n;
  }
  for (const J of ALL){ J.way = {}; J.dirs = []; }   /* nothing spawns until its facing has been checked */
  let prepI = 0;
  function prepOne(){   /* one facing per frame */
    while (prepI < ALL.length * 2){
      const J = ALL[prepI >> 1], s = prepI & 1 ? -1 : 1; prepI++;
      if ((J.k === 'h' || J.trap) && s < 0) continue;
      g(() => judgeWay(J, s)); return;
    }
  }

  /* ---------- ground: only a ramp that is fully up has a surface (hidden or moving, it is not there for cars, NPCs or anyone) ---------- */
  groundAt = function(x, z){
    for (let i = 0; i < ALL.length; i++){
      const J = ALL[i];
      if (J.st !== ST_UP) continue;
      const dx = x - J.x, dz = z - J.z;
      if (dx > 7 || dx < -7 || dz > 7 || dz < -7) continue;
      const u = dx * J.fx + dz * J.fz, v = dx * J.fz - dz * J.fx;
      if (Math.abs(v) < J.W / 2 && u > -J.L / 2 && u < J.L / 2){ const t = (u + J.L / 2) / J.L; return J.yb + (J.yl - J.yb) * t + J.H * t; }
    }
    return base0(x, z);
  };

  /* ---------- clear trees and lamps on the ramp and in the first part of the flight (both ways when it can face both) ---------- */
  function clearSpot(J){
    const hit = o => { const a = local(J, o.x, o.z); return a.u > -J.L / 2 - 3 && a.u < J.L / 2 + (J.k === 'h' ? 30 : 18) && Math.abs(a.v) < J.W / 2 + 2.5; };
    if (typeof knockSets !== 'undefined') for (const set of knockSets) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); } });
    if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); } });
  }
  try { for (const J of ALL){ for (const s of J.k === 'r' && !J.trap ? [1, -1] : [1]){ orient(J, s); clearSpot(J); } orient(J, 1); } } catch(e){}

  /* ---------- the models: weathered planks on two rails (road), or a packed-dirt lip (hill); built the first time each facing is needed ---------- */
  const group = new THREE.Group(); group.name = 'stunt-jumps'; group.userData.xp = true;   /* js/98-perf.js: keep out of static batching, these come and go */
  scene.add(group);
  const mat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.92, side:THREE.DoubleSide});
  function build(J){
    const pos = [], col = [], c = new THREE.Color();
    const tri = (A, B, C, hex) => { c.set(hex); for (const P of [A, B, C]){ pos.push(P[0], P[1], P[2]); col.push(c.r, c.g, c.b); } };
    const quad = (A, B, C, D, hex) => { tri(A, B, C, hex); tri(A, C, D, hex); };
    const W = (u, v, y) => [J.fx * u + J.fz * v, y, J.fz * u - J.fx * v];
    const top = u => { const t = (u + J.L / 2) / J.L; return J.yb + (J.yl - J.yb) * t + J.H * t; };
    const bot = u => { const t = (u + J.L / 2) / J.L; return J.yb + (J.yl - J.yb) * t - .35; };
    const n = J.k === 'r' ? 8 : 5, hw = J.W / 2;
    for (let i = 0; i < n; i++){
      const u0 = -J.L / 2 + J.L * i / n, u1 = -J.L / 2 + J.L * (i + 1) / n, t0 = top(u0), t1 = top(u1);
      const hex = J.k === 'r' ? (i % 2 ? '#8a6744' : '#9c774f') : (i % 2 ? '#8b6a46' : '#7d5f3f');
      quad(W(u0, -hw, t0), W(u1, -hw, t1), W(u1, hw, t1), W(u0, hw, t0), hex);                         /* top */
      for (const s of [-1, 1]) quad(W(u0, s * hw, bot(u0)), W(u1, s * hw, bot(u1)), W(u1, s * hw, t1), W(u0, s * hw, t0), J.k === 'r' ? '#5a4330' : '#6b5238');   /* sides */
    }
    const u1 = J.L / 2; quad(W(u1, -hw, bot(u1)), W(u1, hw, bot(u1)), W(u1, hw, top(u1)), W(u1, -hw, top(u1)), J.k === 'r' ? '#4d3a29' : '#5e472f');   /* the lip */
    if (J.k === 'r') for (const s of [-1, 1]){   /* a faded hazard stripe down each edge */
      for (let i = 0; i < 4; i++){ const ua = -J.L / 2 + J.L * i / 4, ub = ua + J.L / 8, e = .02;
        quad(W(ua, s * (hw - .45), top(ua) + e), W(ub, s * (hw - .45), top(ub) + e), W(ub, s * hw, top(ub) + e), W(ua, s * hw, top(ua) + e), '#c9a13a'); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true; m.visible = false; m.position.set(J.x, 0, J.z); m.name = 'stunt-jump-' + J.id + (J.s < 0 ? '-r' : '');
    group.add(m); return m;
  }
  const meshOf = J => J.mesh[J.s] || (J.mesh[J.s] = build(J));

  /* ---------- the run state (declared here: manage() looks at the jump in flight) ---------- */
  const R = {car:null, wasAir:false, run:null, cam:null, slowTold:0, lastT:0, tt:0, trap:null};
  /* 「中了我的圈套了吧 😏」: crash, get thrown out or land in a lake from take-off until 2 s after touching down → a teasing toast instead of the
     plain 「没落稳」 (the owner's joke). No penalty beyond the crash itself; once per jump. */
  const TRAP_T = 2, TEASE = {
    crash:['跳台是我放的，墙也是我放的', '下次看清楚落地点再冲', '这一跳我记在小本本上了', '奶娃：我就知道会这样'],
    lake:['芙蓉湖水温 26°C，欢迎下次再来', '车顺便洗了，不用谢', '这个跳台的终点本来就是湖']};
  function trapTell(kind){
    const T = R.trap; if (!T || T.told) return;
    T.told = true;
    const l = TEASE[kind] || TEASE.crash;
    const sub = l[Math.floor(Math.random() * l.length)];
    g(() => gx.callout('中了我的圈套了吧 😏', sub, '#ff5a8a'));   /* the big pop (the stunt score's toast lands on top of the toast ~2 s later) */
    toast('中了我的圈套了吧 😏', sub, 3000);
  }
  const trapOpen = c => !!(R.trap && !R.trap.told && c === R.trap.car && R.tt <= R.trap.end);
  function blockedNow(){
    return mode !== 'naiwa' || (typeof indoorNow === 'function' && indoorNow()) || (window.XCine && XCine.busy) || (typeof spray !== 'undefined' && spray.run);
  }

  /* ---------- come up out of the ground / sink back ---------- */
  const easeBack = t => { const k = 1.5, a = t - 1; return 1 + (k + 1) * a * a * a + k * a * a; };
  function place(J){
    const m = J.mesh[J.s]; if (!m) return;
    const e = J.st === ST_RISE ? easeBack(J.p) : J.p * J.p;
    m.position.y = -(1 - e) * (J.H + 1.2);   /* starts fully under the road, overshoots a hair, settles */
    m.visible = J.p > 0;
  }
  function puff(J, me){
    const d = Math.hypot(J.x - me.x, J.z - me.z);
    if (d > 90) return;
    if (typeof spawnPart === 'function') for (let i = 0; i < 8; i++){
      const u = (Math.random() - .5) * J.L, v = (Math.random() < .5 ? -1 : 1) * J.W / 2, x = J.x + J.fx * u + J.fz * v, z = J.z + J.fz * u - J.fx * v;
      g(() => spawnPart('dust', x, base0(x, z) + .3, z, 2.2, {vx:J.fz * v * .8, vy:2 + Math.random() * 2, vz:-J.fx * v * .8, g:4, life:.9, op:.55, color:'#b59a72'}));
    }
    if (d < 70) g(() => tone('sine', 120, 70, .28, .04));
  }
  function rise(J, s, me){
    for (const k in J.mesh) J.mesh[k].visible = false;
    orient(J, s); meshOf(J); J.p = 0; J.st = ST_RISE; J.pass = 0; place(J); puff(J, me);
  }
  function hideAll(){ for (const J of ALL){ J.st = ST_OFF; J.p = 0; J.pass = 0; for (const k in J.mesh) J.mesh[k].visible = false; } }

  /* the facing you'd get coming at it now, or 0: driving, moving, 25–110 m away, heading at it and lined up with one of its ways */
  function want(J, c){
    const dx = J.x - c.x, dz = J.z - c.z, d = Math.hypot(dx, dz);
    const sp = Math.hypot(c.vx, c.vz);
    if (sp < 6 || d > SPAWN_R || d < Math.max(SPAWN_MIN, sp * RISE * 1.4 + 8)) return 0;   /* fully up well before the car gets there */
    const vx = c.vx / sp, vz = c.vz / sp, tx = dx / d, tz = dz / d;
    if (vx * tx + vz * tz < .75) return 0;
    for (const s of J.dirs){ const ax = J.bx * s, az = J.bz * s; if (vx * ax + vz * az > .75 && tx * ax + tz * az > .8) return s; }
    return 0;
  }
  /* challenges, races and other mini-games, the story talking or keeping things calm: no ramps */
  function quiet(){
    return blockedNow() || gx.paused || g(() => !!gxA.act, false) || g(() => gx.extBusy(), false)
      || !!(window.XQuest && (XQuest.talking || g(() => XQuest.calm(), false)));
  }
  /* every frame: 20 ramps, a distance check each when they're down */
  function manage(dt){
    prepOne();
    const c = driving, me = c || (typeof nw !== 'undefined' ? nw : null);
    if (!me) return;
    let hush = null, q;
    for (const J of ALL){
      const d = Math.hypot(J.x - me.x, J.z - me.z);
      if (J.st === ST_OFF){
        if (!c || d > SPAWN_R || d < SPAWN_MIN) continue;
        if (hush === null){ hush = quiet(); q = window.XQuest && g(() => XQuest.target(), null); }
        if (hush || (q && Math.hypot(q.x - J.x, q.z - J.z) < QUEST_R)) continue;   /* the story is sending you right here: keep the road clear */
        const s = want(J, c); if (s) rise(J, s, me);
        continue;
      }
      if ((J.st === ST_RISE || J.st === ST_UP) && !(R.run && R.run.J === J)){
        if (hush === null){ hush = quiet(); q = window.XQuest && g(() => XQuest.target(), null); }
        let go = false;
        const under = c && d < 14;   /* never pull it out from under a car */
        if (d > KEEP_R || (hush && !under)) go = true;
        else if (!c){ J.pass += dt; if (J.pass > 8) go = true; }   /* got out and walked off */
        else {
          const along = (c.x - J.x) * J.fx + (c.z - J.z) * J.fz, sp = Math.hypot(c.vx, c.vz);
          if (along > J.L / 2 + 12){
            const back = sp > 4 && (c.vx * (J.x - c.x) + c.vz * (J.z - c.z)) / (sp * d) > .5;
            if (back && d < 90) go = true;   /* coming at its back: sink, and it comes up again facing you */
            else { J.pass += dt; if (J.pass > PASS_T) go = true; }   /* went past it */
          } else J.pass = 0;
        }
        if (go) J.st = ST_SINK;
      }
      if (J.st === ST_RISE){ J.p = Math.min(1, J.p + dt / RISE); if (J.p >= 1) J.st = ST_UP; }
      else if (J.st === ST_SINK){ J.p = Math.max(0, J.p - dt / SINK); if (J.p <= 0){ J.st = ST_OFF; J.pass = 0; } }
      place(J);
    }
  }

  /* ---------- the run: take-off on a ramp → slow motion + side camera → landing decides ---------- */
  const _look = new THREE.Vector3();
  function rampAt(c){
    for (const J of ALL){
      if (J.st !== ST_UP) continue;
      const a = local(J, c.x, c.z);
      if (a.u > J.L / 2 - 5 && a.u < J.L / 2 + 5 && Math.abs(a.v) < J.W / 2 + 1.5) return J;
    }
    return null;
  }
  function camSpot(c, J, sp){
    const vy = Math.max(4, c.vy || 6), T = Math.min(3, 2 * vy / 26 + .4), along = sp * T * .42;
    const mx = c.x + J.fx * along, mz = c.z + J.fz * along, my = c.y + 2;
    /* a spot beside the flight path with no tree or building in the way (trees: the knock sets, js/00-core.js and js/13-outskirts.js) */
    const sets = (typeof knockSets !== 'undefined' ? knockSets : []).concat(typeof OUT_SETS !== 'undefined' ? OUT_SETS : []);
    let best = null, bestN = 1e9;
    for (const lift of [3.5, 8]) for (const d of [11 + sp * .22, 18 + sp * .2, 26]) for (const s of [1, -1]){
      const x = mx + J.fz * d * s, z = mz - J.fx * d * s;
      if (hitsBuilding(x, z, 1.5) || outOfMap(x, z, 1) || (typeof sightBlocked === 'function' && sightBlocked(x, z, mx, mz))) continue;
      const y = Math.max(groundAt(x, z) + lift, my + lift - 2);
      let n = 0;
      const x0 = Math.min(x, mx) - 4, x1 = Math.max(x, mx) + 4, z0 = Math.min(z, mz) - 4, z1 = Math.max(z, mz) + 4, vx = mx - x, vz = mz - z, vv = vx * vx + vz * vz || 1;
      for (const set of sets) for (const o of set.spots){
        if (o.hidden || o.down || o.x < x0 || o.x > x1 || o.z < z0 || o.z > z1) continue;
        const t = Math.max(0, Math.min(1, ((o.x - x) * vx + (o.z - z) * vz) / vv));
        const ry = y + (my - y) * t;   /* the sight line's height there: a tree only blocks it below its crown */
        if (Math.hypot(x + vx * t - o.x, z + vz * t - o.z) < 3.5 && ry < (o.y || 0) + 9 * (o.s || 1)) n++;
      }
      if (n < bestN){ bestN = n; best = new THREE.Vector3(x, y, z); if (!n) return best; }
    }
    if (best && bestN > 0) best.y += 8;   /* still behind leaves: go up and look down on it */
    return best;
  }
  function takeOff(c, J){
    const sp = Math.hypot(c.vx, c.vz), dir = sp > .1 ? (c.vx * J.fx + c.vz * J.fz) / sp : 0;
    if (dir < .8) return;
    if (sp < MIN_V){
      if (!found[J.id] && performance.now() - R.slowTold > 20000){ R.slowTold = performance.now(); toast('这里好像能飞……', '速度再快一点（54 km/h 以上）冲上去试试', 2200); }
      return;
    }
    R.run = {J, x0:c.x, z0:c.z, hp0:c.hp, t:0};
    R.trap = {car:c, J, end:Infinity, told:false};
    if (!REDUCED){
      try { gxSlow = Math.max(gxSlow, 1.2); } catch(e){}   /* js/85-activities.js: gx.scale() turns this into time × 0.35 */
      const at = camSpot(c, J, sp); if (at) R.cam = {at, t:0};
    }
    tone('triangle', 520, 1040, .5, .07);
  }
  function land(c, ok){
    const run = R.run; R.run = null;
    if (!ok) R.cam = null;
    if (!run) return;
    const J = run.J, dist = Math.hypot(c.x - run.x0, c.z - run.z0), air = c.airT || 0;
    if (R.trap && R.trap.car === c) R.trap.end = R.tt + (J.trap ? 4 : TRAP_T);   /* the lake trap: a slow car lands on the bank and rolls in a bit later */
    if (J.trap){ if (!ok || driving !== c || c.wrecked || c.wet) trapTell(c.wet ? 'lake' : 'crash'); return; }   /* no reward; the lake (or 「躲过了」) is told from tick */
    if (!ok || driving !== c || c.wrecked || c.wet){ trapTell(c.wet ? 'lake' : 'crash'); if (R.trap && R.trap.told) return; toast('特技跳台 · 没落稳', ok ? '落地要稳，车还得能开' : '奶娃飞出去了，再来一次', 2000); return; }
    if (air < MIN_AIR || dist < MIN_DIST){ toast('特技跳台 · 差一点', `飞了 ${Math.round(dist)} 米 · 再快点冲`, 1800); return; }
    const first = !found[J.id];
    if (first){ found[J.id] = Date.now(); save(); }
    const n = count();
    gx.callout(`特技跳台 ${n}/${JUMPS.length}`, J.name, '#ffb020');
    if (first){
      earn(FIRST_RM); sfx.sparkle();
      toast(`特技跳台 ${n}/${JUMPS.length}`, `${J.name} · 飞了 ${Math.round(dist)} 米 · 首次 +RM ${FIRST_RM}`, 3200);
      unlock('sj1'); if (n >= JUMPS.length) unlock('sjall');
      if (window.XGuide && XGuide.refresh) XGuide.refresh();
    } else toast(`特技跳台 · ${J.name}`, `飞了 ${Math.round(dist)} 米 · 已收集 ${n}/${JUMPS.length}`, 1800);
  }
  /* runs inside updateNaiwaMode (dt is already slowed), after the car physics and after the game camera was placed */
  function tick(dt){
    dt = Math.min(dt, .1); R.tt += dt;
    if (R.trap && !R.trap.told && R.tt <= R.trap.end && R.trap.car.wet) trapTell('lake');   /* rolled into the lake right after landing */
    if (R.trap && !R.trap.told && R.trap.J.trap && R.tt > R.trap.end){ R.trap.told = true; toast('居然躲过了我的圈套 🤨', '这个跳台本来是送你进湖的', 2400); }
    try { manage(dt); } catch(e){ hideAll(); }
    const c = driving;
    if (c !== R.car){ if (R.run && R.car) land(R.car, false); R.car = c; R.wasAir = !!(c && c.air); R.run = null; R.cam = null; }
    if (!c) return;
    if (c.air && !R.wasAir){
      const J = rampAt(c);
      if (J){
        /* off a stunt ramp faster than this facing's safe speed: the lip scrubs it down, so the landing always fits before the first obstacle */
        const w = J.way[J.s], sp0 = Math.hypot(c.vx, c.vz), along = sp0 > .1 ? (c.vx * J.fx + c.vz * J.fz) / sp0 : 0;
        if (along > .5){ c.vx = J.fx * sp0; c.vz = J.fz * sp0; }   /* off the lip along the ramp, into the lane that was checked */
        const sp = Math.hypot(c.vx, c.vz);
        if (w && w.vs && sp > w.vs){ const k = w.vs / sp; c.vx *= k; c.vz *= k; if (c.vy > 0) c.vy *= k; }
        if (!R.run && !blockedNow()) takeOff(c, J);
      }
    }
    if (!c.air && R.wasAir && R.run) land(c, true);
    R.wasAir = !!c.air;
    if (R.run){
      R.run.t += dt; if (R.run.t > 8){ R.run = null; R.cam = null; }
      else if (c.air){ const J = R.run.J, want = Math.atan2(J.fx, J.fz), d = Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)); c.h += d * Math.min(1, dt * 5); }
    }
    /* the cinematic camera: fixed beside the flight path, turning to follow the car */
    if (R.cam){
      R.cam.t += dt;
      if (!c.air){ R.cam.land = (R.cam.land || 0) + dt; }
      if (R.cam.land > .45 || R.cam.t > 3){ R.cam = null; return; }
      camera.position.copy(R.cam.at); _look.set(c.x, c.y + c.T.H * .5, c.z); camera.lookAt(_look);
      if (camera.fov !== 52){ camera.fov = 52; camera.updateProjectionMatrix(); }
    }
  }
  /* car-to-car pushes (js/40-vehicles.js carCollisions) are flat too: a car flying 10 m over traffic or a parked car got shoved sideways out of its
     checked lane. During a stunt-jump flight, high above the ground, the flying car sits that out. */
  if (typeof judgeCrash === 'function'){
    const jc0 = judgeCrash;
    judgeCrash = function(c, impact){
      const r = jc0.apply(this, arguments);
      if (impact * 3.6 >= 18 && trapOpen(c)) trapTell('crash');   /* js/80-gta.js ignores anything under 18 km/h too */
      return r;
    };
  }
  if (typeof carCollisions === 'function'){
    const cc0 = carCollisions;
    carCollisions = function(){
      const c = driving;
      if (R.run && c && c.air && c.y - base0(c.x, c.z) > 1.6){ const x = c.x, z = c.z; c.x = c.z = 1e7; try { return cc0.apply(this, arguments); } finally { c.x = x; c.z = z; } }
      return cc0.apply(this, arguments);
    };
  }
  { const u0 = gx.update; gx.update = function(dt, px, pz){ u0.call(this, dt, px, pz); try { tick(dt); } catch(e){ R.run = null; R.cam = null; } }; }
  { const l0 = gx.leave; gx.leave = function(){ R.run = null; R.cam = null; R.car = null; hideAll(); return l0.apply(this, arguments); }; }

  /* ---------- achievements ---------- */
  if (typeof achAdd === 'function') achAdd([['sj1', '第一跳', '找到第一个隐藏特技跳台', 20], ['sjall', '特技之王', `找齐全部 ${JUMPS.length} 个隐藏特技跳台`, 200]]);

  /* ---------- the list: a page in the game guide (P) and a line in the pause panel ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
  const st = document.createElement('style');
  st.textContent = `.sj-list{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}
.gd-txt ul.sj-list li::before{content:none}
.gd-txt ul.sj-list li{padding:6px 9px;line-height:1.35}
.sj-list li{display:flex;gap:8px;align-items:flex-start;padding:6px 9px;border-radius:var(--r-sm,8px);background:var(--chip,rgba(0,0,0,.05));font-size:13px;line-height:1.35}
.sj-list li i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;background:rgba(0,0,0,.12);color:var(--muted,#666)}
.sj-list li.on i{background:#ffb020;color:#fff}
.sj-list li b{display:block;font-weight:600}.sj-list li span{color:var(--muted,#666)}
.sj-bar{height:8px;border-radius:4px;background:rgba(0,0,0,.1);overflow:hidden;margin:6px 0 2px}.sj-bar i{display:block;height:100%;background:#ffb020}
.gxp-sj{display:flex;align-items:center;gap:10px;margin:8px 0 0;font-size:13px}.gxp-sj .btn{padding:4px 10px;font-size:12.5px}`;
  document.head.appendChild(st);
  const art = `<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="0" y="96" width="240" height="24" fill="#74a955" opacity=".55"/>
    <path d="M20 96 L92 96 L92 70 Z" fill="#9c774f" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
    <path d="M96 66 C130 30 170 28 206 70" stroke="#ffb020" stroke-width="3" stroke-dasharray="6 6" fill="none"/>
    <g transform="translate(140 30) rotate(-8)"><rect x="-20" y="-7" width="40" height="13" rx="4" fill="var(--tile)" stroke="var(--ink)" stroke-width="2"/><rect x="-10" y="-14" width="20" height="9" rx="3" fill="#cfe3ef" stroke="var(--ink)" stroke-width="2"/><circle cx="-11" cy="7" r="5" fill="var(--ink)"/><circle cx="12" cy="7" r="5" fill="var(--ink)"/></g>
    <text x="186" y="30" font-size="20" font-weight="700" fill="#ffb020">×0.35</text></svg>`;
  function body(){
    const n = count();
    return `<p class="gd-lead">全图藏着 <b>${JUMPS.length} 个特技跳台</b>：木板跳台和山顶的土坡，小地图上不标。跳台平时收在地里，<b>开车经过时才会从地里升起来</b>，坡口朝着你开来的方向（有些跳台另一头落地会撞东西，只朝一个方向；山顶的土坡只能往下坡冲）。<b>快速</b>（54 km/h 以上）正对着冲上去，起跳会进慢动作；<b>稳稳落地</b>才算数。</p>
      <div class="sj-bar" role="img" aria-label="已找到 ${n} / ${JUMPS.length}"><i style="width:${Math.round(n / JUMPS.length * 100)}%"></i></div>
      <p class="gd-note">已找到 ${n} / ${JUMPS.length} · 第一次飞成 RM ${FIRST_RM} · 找齐 ${JUMPS.length} 个解锁「特技之王」 · 下面的提示是跳台所在的那段路，顺着路开过去就会出现 · 另外还藏着一个不算数的「圈套」跳台 😏</p>
      <ul class="sj-list">${JUMPS.map((J, i) => found[J.id]
        ? `<li class="on"><i>✓</i><div><b>${esc(J.name)}</b><span>${esc(J.hint)}</span></div></li>`
        : `<li><i>${i + 1}</i><div><b>？？？</b><span>${esc(J.hint)}</span></div></li>`).join('')}</ul>`;
  }
  if (window.XGuide && XGuide.addPage) XGuide.addPage({id:'jumps', t:'隐藏特技跳台', art, body});
  if (typeof gxRenderPause === 'function'){
    const r0 = gxRenderPause;
    gxRenderPause = function(){
      r0.apply(this, arguments);
      const b = $('#gxpBody'); if (!b) return;
      const d = document.createElement('div'); d.className = 'gxp-sj';
      d.innerHTML = `<span>隐藏特技跳台 <b>${count()} / ${JUMPS.length}</b></span>`;
      if (window.XGuide){ const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn'; btn.textContent = '看清单';
        btn.addEventListener('click', () => { gx.togglePause(); XGuide.open('jumps'); }); d.appendChild(btn); }
      const h = b.querySelector('h3'); h ? b.insertBefore(d, h) : b.appendChild(d);
    };
  }

  /* dev check: XJumps.audit() → one row per ramp and facing; console.table too. ok = false means that facing never spawns.
   * Run it after moving buildings, walls, roads or the hedge near a ramp: a row that turns bad names what is in the way and where. */
  function audit(){
    const rows = [], kmh = v => Math.round(v * 3.6);
    for (const J of ALL) for (const s of J.k === 'r' && !J.trap ? [1, -1] : [1]){
      const w = J.way[s] || judgeWay(J, s), f38 = flight(J, w, 38), fTop = w.vs ? flight(J, w, w.vs) : null;
      rows.push({id:J.id, name:J.name, way:s > 0 ? 'forward' : 'reverse', ok:w.ok, safeKmh:kmh(w.vs),
        clearM:w.block >= SCAN ? '>' + SCAN : w.block, blockedBy:w.runup || w.what || '-',
        at137:`${Math.round(f38.d)} m / ${f38.t.toFixed(2)} s`, atSafe:fTop ? `${Math.round(fTop.d)} m / ${fTop.t.toFixed(2)} s` : '-',
        lift:+w.lift.toFixed(2), find137:f38.t >= MIN_AIR && f38.d >= MIN_DIST, cleared:w.cleared || 0});   /* find137: a stock Myvi flat out (137 km/h) can count it */
    }
    try { console.table(rows); } catch(e){}
    return rows;
  }

  window.XJumps = {list:JUMPS, total:JUMPS.length, found:() => Object.assign({}, found), count,
    traps:TRAPS, up:() => ALL.filter(J => J.st !== ST_OFF).map(J => J.id + (J.s < 0 ? '↩' : '') + ':' + ['off', 'rise', 'up', 'sink'][J.st]),
    state:R, audit,
    /* dev: rate a spot before putting a ramp there → {forward, reverse} safe km/h (0 = blocked) and what blocks it */
    check(x, z, h, k){
      const J = Object.assign({x, z, h, k:k || 'r'}, SIZE[k || 'r'], {bx:Math.sin(h), bz:Math.cos(h)});
      J.gp = base0(x + J.bx * J.L / 2, z + J.bz * J.L / 2); J.gm = base0(x - J.bx * J.L / 2, z - J.bz * J.L / 2);
      const r = {}; for (const s of J.k === 'r' ? [1, -1] : [1]){ const w = rateWay(J, s); r[s > 0 ? 'forward' : 'reverse'] = {kmh:Math.round(w.vs * 3.6), ok:w.ok, clear:w.block, by:w.runup || w.what || '-', lift:+w.lift.toFixed(2), drop:+(w.prof[0] - w.prof[Math.min(SCAN, 40)]).toFixed(1), air137:+flight(J, w, 38).t.toFixed(2)}; }
      return r;
    }};
  /* 清空进度只给本地测试和预览版（正式版不暴露，免得在控制台里反复刷首次奖励） */
  if (window.XMUM_FIREBASE === null || /\/preview\//.test(location.pathname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.XJumps.reset = () => { found = {}; save(); };
})();
