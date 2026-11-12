/* XMUM 校园漫游 · 校园作息：同学跟着钟点走（GTA 的「活的城市」）
 *
 * 校园时钟：天空选「白天」走 07:00–17:00，「黄昏」17:00–20:00，「夜晚」20:00–06:00，各自循环，游戏里 1 分钟 = 现实 1 秒。
 *   切换天空就跳到那一段的开头（白天从 07:00 早高峰开始）。暂停面板里能看现在几点、什么时段。
 * 时段和同学在干什么（还是原来 js/60-details.js 的 96 个同学，只是换角色：人数、draw call 都不变）：
 *   07:00 早八高峰：一大半同学从 LY 宿舍沿路走向 A1–A5 教学楼，到了就进楼（藏起来），再从宿舍那边补上；
 *   09:00 上课时间：路上只剩一半人；
 *   11:30 午饭：D6 和 LY3 食堂门口各排一队，队头隔几秒买到饭走掉，后面往前挪；另有一拨人从教学楼往食堂走，来了就排到队尾；
 *   13:30 下午：照常；
 *   17:00 傍晚：田径场上有人夜跑，下课的同学从教学楼走回宿舍；
 *   20:00 晚上：人少了，几个保安开始沿路巡逻（藏青色上衣）；
 *   23:00 深夜：几乎只剩巡逻的保安，聊天的小群也散了。
 * 换角色只在那个同学不在镜头里（或离镜头 110 米以外）时进行，所以不会当着你的面凭空出现、消失。
 * 走路用的路网：所有人行道 / 路（npcPaths 和环校路）每 8 米取一个点，相距 14 米以内、中间没有楼和水的点连起来，A* 找路。
 * 黑洞模式里不管（全部恢复原样）。
 * 对外：window.XLife = {clock(), phase(), set(hh, mm), roles(), graph}（测试用） */
'use strict';
(() => {
  if (typeof npcs === 'undefined' || typeof npcStep !== 'function' || typeof updateNPCs !== 'function') return;
  const WALKERS = npcs.filter(n => !n.grp), GROUPED = npcs.filter(n => n.grp);
  const W = WALKERS.length;
  const pick = a => a[(rnd() * a.length) | 0];
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- the walk graph ---------- */
  const NODES = [];   /* {x, z, off, nb:[[i, cost]]} */
  {
    const lines = npcPaths.map(p => ({p:p.p, off:p.off})).concat(ROADS_W[0] ? [{p:ROADS_W[0].p, off:ROADS_W[0].w / 2 + 1.3}] : []);
    const walk = (x, z) => !hitsBuilding(x, z, .4) && !outOfMap(x, z, .3) && (!lakes.some(L => inPoly(x, z, L)) || bridgeY(x, z) > 0);
    for (const L of lines){
      let prev = -1;
      for (let i = 0; i < L.p.length - 1; i++){
        const [ax, az] = L.p[i], [bx, bz] = L.p[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 8));
        for (let k = (i ? 1 : 0); k <= n; k++){
          const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, id = NODES.length;
          NODES.push({x, z, off:L.off, nb:[]});
          if (prev >= 0){ const c = Math.hypot(x - NODES[prev].x, z - NODES[prev].z); NODES[prev].nb.push([id, c]); NODES[id].nb.push([prev, c]); }
          prev = id;
        }
      }
    }
    /* junctions: close points of different lines with a clear straight walk between them */
    const cell = new Map(), key = (x, z) => Math.floor(x / 14) + ',' + Math.floor(z / 14);
    NODES.forEach((n, i) => { const k = key(n.x, n.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
    NODES.forEach((a, i) => {
      const cx = Math.floor(a.x / 14), cz = Math.floor(a.z / 14);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of cell.get((cx + dx) + ',' + (cz + dz)) || []){
        if (j <= i || a.nb.some(e => e[0] === j)) continue;
        const b = NODES[j], d = Math.hypot(b.x - a.x, b.z - a.z); if (d > 14) continue;
        let ok = true; for (let s = 1; s < d; s += 1.5){ const t = s / d; if (!walk(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)){ ok = false; break; } }
        if (ok){ a.nb.push([j, d]); b.nb.push([i, d]); }
      }
    });
  }
  function nearestNode(x, z, maxD){
    let best = -1, bd = maxD || 60;
    for (let i = 0; i < NODES.length; i++){ const d = Math.hypot(NODES[i].x - x, NODES[i].z - z); if (d < bd){ bd = d; best = i; } }
    return best;
  }
  /* A* with a straight-line guess; routes are cached */
  const ROUTES = new Map();
  let budget = 1;   /* new routes worked out per frame (the rest wait a frame) */
  function route(a, b){
    const k = a + '>' + b; if (ROUTES.has(k)) return ROUTES.get(k);
    if (budget <= 0) return null; budget--;
    const N = NODES.length, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), open = [a], B = NODES[b];
    const h = i => Math.hypot(NODES[i].x - B.x, NODES[i].z - B.z);
    g[a] = 0; let found = false, guard = 0;
    while (open.length && guard++ < 6000){
      let bi = 0, bf = Infinity; for (let q = 0; q < open.length; q++){ const f = g[open[q]] + h(open[q]); if (f < bf){ bf = f; bi = q; } }
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === b){ found = true; break; }
      if (done[cur]) continue; done[cur] = 1;
      for (const [j, c] of NODES[cur].nb){ if (done[j]) continue; const ng = g[cur] + c; if (ng < g[j]){ g[j] = ng; prev[j] = cur; open.push(j); } }
    }
    let out = null;
    if (found){ out = []; for (let i = b; i >= 0; i = prev[i]) out.push(i); out.reverse(); }
    ROUTES.set(k, out); return out;
  }

  /* ---------- places ---------- */
  const lbl = name => { const L = labels.find(l => l.el.textContent === name); return L ? [L.pos.x, L.pos.z] : null; };
  const nodeAt = (p, r) => p ? nearestNode(p[0], p[1], r || 60) : -1;
  /* the dorm doors face the lake road (south), the teaching blocks face the lake (north) */
  const shift = (p, dz) => p ? [p[0], p[1] + dz] : null;
  const toZ = (p, z) => p ? [p[0], z] : null;
  const DORMS = [...new Set(['LY1', 'LY2', 'LY4', 'LY5', 'LY6', 'LY7', 'LY8', 'LY9'].map(n => nodeAt(toZ(lbl(n), -112), 50)).filter(i => i >= 0))];
  const BLOCKS = [...new Set(['A1', 'A2', 'A3 百姓大楼', 'A4', 'A5'].map(n => nodeAt(shift(lbl(n), -40), 60)).filter(i => i >= 0))];
  /* lunch queues: from the pickup point (the door), the line runs away from the building */
  const QUEUES = [['D6 食堂', 'D6 食堂'], ['LY3 食堂', 'LY3 食堂']].map(([pk, bld]) => {
    const P = PICKUPS.find(p => p.name === pk), b = lbl(bld); if (!P) return null;
    let dx = P.x - (b ? b[0] : P.x), dz = P.z - (b ? b[1] : P.z - 1), l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    /* shift the line sideways so it does not stand on the pickup ring */
    const sx = -dz, sz = dx, x0 = P.x + sx * 11, z0 = P.z + sz * 11;
    const slots = []; for (let s = 0; s < 9; s++) slots.push([x0 + dx * s * .85, z0 + dz * s * .85]);
    return {name:pk, door:[x0 - dx * 1.2, z0 - dz * 1.2], slots, who:[], node:nearestNode(x0 + dx * 8, z0 + dz * 8, 40), t:0};
  }).filter(Boolean);
  /* the guards' beat: the dorm doors, the teaching blocks, the queue corners */
  const BEATS = DORMS.concat(BLOCKS, QUEUES.map(q => q.node).filter(i => i >= 0));
  const TRACK = typeof FIELD !== 'undefined' ? FIELD : null;
  const GUARD_SHIRT = new THREE.Color('#1f3a6b');

  /* ---------- the clock ---------- */
  const BANDS = {day:[7 * 60, 17 * 60], dusk:[17 * 60, 20 * 60], night:[20 * 60, 30 * 60]};
  const PHASES = [
    {id:'rush',  from:7 * 60,       name:'早八高峰', sub:'LY 宿舍的同学正往教学楼赶'},
    {id:'class', from:9 * 60,       name:'上课时间', sub:'路上人少了，大家都在教室里'},
    {id:'lunch', from:11 * 60 + 30, name:'午饭时间', sub:'D6 和 LY3 食堂门口排起了长队'},
    {id:'pm',    from:13 * 60 + 30, name:'下午',     sub:'校园里人来人往'},
    {id:'dusk',  from:17 * 60,      name:'傍晚',     sub:'田径场上有人夜跑，下课的同学往宿舍走'},
    {id:'eve',   from:20 * 60,      name:'晚上',     sub:'路上的人少了，保安开始巡逻'},
    {id:'late',  from:23 * 60,      name:'深夜',     sub:'校园里几乎只剩巡逻的保安'}
  ];
  const bandNow = () => typeof tgt !== 'undefined' && typeof P3 !== 'undefined' ? (tgt === P3.night ? 'night' : tgt === P3.dusk ? 'dusk' : 'day') : 'day';
  const L = {band:bandNow(), min:7 * 60 + 20, phase:null, seen:new Set(), rr:0, frust:new THREE.Frustum(), pm:new THREE.Matrix4(), pt:new THREE.Vector3(), sph:new THREE.Sphere(new THREE.Vector3(), 1.2), paused:false};
  const hhmm = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function phaseAt(m){
    m = m % 1440; let p = PHASES[PHASES.length - 1];
    for (const q of PHASES) if (m >= q.from) p = q;
    if (m < 7 * 60) p = PHASES[PHASES.length - 1];   /* 00:00 – 07:00 is still the late night */
    return p;
  }

  /* ---------- who does what in each phase (by walker index: deterministic, so a phase always looks the same) ---------- */
  function wantRole(i, ph){
    switch (ph){
      case 'rush':  return i < 50 ? 'toClass' : null;
      case 'class': return i < 42 ? 'off' : null;
      case 'lunch': return i < 16 ? 'queue' : i < 34 ? 'toLunch' : null;
      case 'dusk':  return i < 14 ? 'jog' : i < 30 ? 'toDorm' : null;
      case 'eve':   return i < 30 ? 'off' : i < 36 ? 'guard' : null;
      case 'late':  return i < W - 6 ? 'off' : 'guard';
      default: return null;
    }
  }
  /* ---------- placing and moving a walker in a role ---------- */
  function setShirt(n, guard){
    const i = npcs.indexOf(n); if (i < 0) return;
    if (guard){ if (!n.lifeShirt) n.lifeShirt = n.cShirt.clone(); n.cShirt.copy(GUARD_SHIRT); }
    else if (n.lifeShirt){ n.cShirt.copy(n.lifeShirt); n.lifeShirt = null; }
    else return;
    npcBodyIm.setColorAt(i, n.cShirt); if (npcBodyIm.instanceColor) npcBodyIm.instanceColor.needsUpdate = true;
  }
  function startRoute(n, from, to, sp, keep){
    const r = from >= 0 && to >= 0 && from !== to ? route(from, to) : null;
    if (!r || r.length < 2){ const role = n.life ? n.life.role : 'off'; n.life = {role, t:0, done:true}; n.state = 'lifeoff'; return false; }
    n.life.route = r; n.life.ri = 1; n.life.side = (rnd() < .5 ? -1 : 1) * (.3 + rnd() * .7); n.sp = sp || (1.05 + rnd() * .55);
    if (keep === 'mid' && r.length > 4){ n.life.ri = 1 + ((rnd() * (r.length - 3) * .85) | 0); }   /* first fill: people already on their way */
    if (keep !== true){ const a = NODES[r[n.life.ri - 1]]; n.x = a.x; n.z = a.z; n.ox = n.oz = 0; }
    n.state = 'walk'; return true;
  }
  function assign(n, role){
    const i = WALKERS.indexOf(n);
    if (n.life && n.life.q) leaveQueue(n);
    setShirt(n, role === 'guard');
    if (!role){ n.life = null; n.state = 'walk'; n.sp = n.life0sp || n.sp; return; }
    if (n.life0sp == null) n.life0sp = n.sp;
    n.life = {role, t:0};
    if (role === 'off'){ n.state = 'lifeoff'; return; }
    const mid = rnd() < .6 ? 'mid' : false, hurry = 1.25 + rnd() * .5;
    if (role === 'toClass') startRoute(n, pick(DORMS), pick(BLOCKS), hurry, mid);
    else if (role === 'toDorm') startRoute(n, pick(BLOCKS), pick(DORMS), 0, mid);
    else if (role === 'toLunch'){ const Q = QUEUES[i % QUEUES.length]; n.life.qTo = Q; startRoute(n, pick(BLOCKS.concat(DORMS)), Q.node, hurry, mid); }
    else if (role === 'guard'){ n.life.guard = true; startRoute(n, pick(BEATS), pick(BEATS), .85 + rnd() * .2); }
    else if (role === 'queue'){ const Q = QUEUES[i % QUEUES.length]; if (!Q || !joinQueue(n, Q, true)){ n.life.role = 'off'; n.state = 'lifeoff'; } }
    else if (role === 'jog'){ n.life.a = (i % 3) * 2.1 + rnd() * .35;   /* three little packs of runners */ n.life.lane = .8 + (i % 4) * .045; n.life.dir = i % 3 ? 1 : -1; n.sp = 2.3 + rnd() * .5; n.state = 'walk'; }
  }
  function joinQueue(n, Q, jump){
    if (!Q || Q.who.length >= Q.slots.length) return false;
    Q.who.push(n); n.life.q = Q; n.life.role = 'queue';
    const s = Q.slots[Q.who.length - 1];
    if (jump){ n.x = s[0]; n.z = s[1]; }
    n.state = 'walk'; return true;
  }
  function leaveQueue(n){ const Q = n.life.q; if (!Q) return; const k = Q.who.indexOf(n); if (k >= 0) Q.who.splice(k, 1); n.life.q = null; }
  /* the step for a walker in a role (wraps npcStep, js/60-details.js); others walk their path as before */
  function lifeStep(n, dt){
    const R = n.life; R.t += dt;
    if (R.role === 'queue'){
      const Q = R.q, k = Q ? Q.who.indexOf(n) : -1; if (k < 0){ n.sp = 0; n.walk = 0; return; }
      const [sx, sz] = Q.slots[k], dx = sx - n.x, dz = sz - n.z, d = Math.hypot(dx, dz);
      if (d > .08){ const v = Math.min(d, 1.1 * dt); n.x += dx / d * v; n.z += dz / d * v; n.sp = 1.1; n.h = Math.atan2(dx, dz); }
      else { n.sp = 0; n.walk = 0; n.h += wrapA(Math.atan2(Q.door[0] - n.x, Q.door[1] - n.z) - n.h) * Math.min(1, dt * 4); }
      return;
    }
    if (R.role === 'jog' && TRACK){
      R.a += R.dir * n.sp * dt / ((TRACK.rx + TRACK.rz) / 2 * R.lane);
      const x = TRACK.x + Math.cos(R.a) * TRACK.rx * R.lane, z = TRACK.z + Math.sin(R.a) * TRACK.rz * R.lane;
      n.h = Math.atan2(-Math.sin(R.a) * TRACK.rx * R.dir, Math.cos(R.a) * TRACK.rz * R.dir); n.x = x + n.ox; n.z = z + n.oz; return;
    }
    if (R.route){
      const r = R.route, b = NODES[r[R.ri]], a = NODES[r[R.ri - 1]];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const off = Math.min(a.off, b.off, 4) * R.side, tx = b.x - dz * off, tz = b.z + dx * off;
      const ex = tx - (n.x - n.ox), ez = tz - (n.z - n.oz), d = Math.hypot(ex, ez), v = n.sp * (1 + wx.rain * .35) * dt;
      if (d <= v + .05){
        if (++R.ri >= r.length){ arrive(n); return; }
      } else { n.x += ex / d * v; n.z += ez / d * v; n.h += wrapA(Math.atan2(ex, ez) - n.h) * Math.min(1, dt * 6); }
      return;
    }
  }
  function arrive(n){
    const R = n.life;
    if (R.role === 'toLunch' && R.qTo && joinQueue(n, R.qTo, false)) return;
    if (R.role === 'guard'){ const a = R.route[R.route.length - 1]; startRoute(n, a, pick(BEATS), n.sp, true); return; }
    if (R.role === 'queueOut'){ R.role = 'done'; }
    n.state = 'lifeoff'; R.route = null; R.done = true;   /* went into the building: back when out of sight */
  }
  { const s0 = npcStep; npcStep = function(n, dt){ if (n.life && !L.paused) return lifeStep(n, dt); return s0(n, dt); }; }

  /* ---------- the lunch queues move: the front buys and leaves every few seconds ---------- */
  function queues(dt){
    for (const Q of QUEUES){
      Q.t += dt; if (Q.t < 8 + (Q.name.length % 3) * 1.5) continue; Q.t = 0;
      const n = Q.who[0]; if (!n) continue;
      const k = n.life.q && Q.slots[0] ? 1 : 0; if (!k) continue;
      const fd = Math.hypot(n.x - Q.slots[0][0], n.z - Q.slots[0][1]); if (fd > .4) continue;
      leaveQueue(n); n.life.role = 'queueOut'; n.life.q0 = Q; startRoute(n, Q.node, pick(BLOCKS.concat(DORMS)), 0, true);
      if (rnd() < .5) spawnPart('heart', n.x, 2.4, n.z, .6, {vy:1.2, life:1, op:1, color:'#ffb020'});
    }
  }

  /* ---------- the schedule: re-cast walkers when nobody is looking ---------- */
  function unseen(n){
    const cam = camera.position, d = Math.hypot(n.x - cam.x, n.z - cam.z);
    if (d > 110 || n.state !== 'walk') return true;
    L.sph.center.set(n.x, 1, n.z); return !L.frust.intersectsSphere(L.sph);
  }
  function pointUnseen(x, z){
    const cam = camera.position; if (Math.hypot(x - cam.x, z - cam.z) > 110) return true;
    L.sph.center.set(x, 1, z); return !L.frust.intersectsSphere(L.sph);
  }
  function schedule(dt){
    L.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); L.frust.setFromProjectionMatrix(L.pm);
    const ph = L.phase.id;
    /* a few walkers per frame, round robin */
    for (let c = 0; c < 6; c++){
      const i = L.rr = (L.rr + 1) % W, n = WALKERS[i], want = wantRole(i, ph), have = n.life ? n.life.role : null;
      const finished = n.life && n.life.done;   /* walked into a building: send the next one out */
      /* someone who just bought lunch walks off; once out of sight and away from the line, they can queue again (keeps the line long) */
      const recycled = have === 'queueOut' && n.life.q0 && Math.hypot(n.x - n.life.q0.slots[0][0], n.z - n.life.q0.slots[0][1]) > 35;
      const same = have === want || (want === 'queue' && have === 'queueOut' && !recycled) || (want === 'toLunch' && (have === 'queue' || have === 'queueOut'));
      if (same && !finished) continue;
      if (!unseen(n)) continue;
      /* the start point must be out of sight too (no popping out of thin air) */
      if (want && want !== 'off' && want !== 'queue'){
        assign(n, want);
        if (n.state === 'walk' && !pointUnseen(n.x, n.z)){ n.state = 'lifeoff'; n.life.done = true; }   /* try again later */
      } else if (want === 'queue'){ const Q = QUEUES[i % QUEUES.length]; if (Q && pointUnseen(Q.slots[Math.min(Q.slots.length - 1, Q.who.length)][0], Q.slots[Math.min(Q.slots.length - 1, Q.who.length)][1])) assign(n, 'queue'); else if (have !== 'off'){ assign(n, 'off'); } }
      else { assign(n, want); if (!want){ const p = n.path ? n.path.p[n.seg] : null; if (p && !pointUnseen(p[0], p[1])){ n.state = 'lifeoff'; n.life = {role:'off', t:0, done:true}; } } }
    }
    /* the chatting groups break up in the late night */
    const off = ph === 'late';
    for (const n of GROUPED){
      if (off && n.state === 'walk' && unseen(n)){ n.state = 'lifeoff'; n.lifeGrp = true; }
      else if (!off && n.lifeGrp && unseen(n)){ n.state = 'walk'; n.lifeGrp = false; }
    }
  }
  function resetAll(){
    for (const n of WALKERS) if (n.life || n.state === 'lifeoff'){ if (n.life && n.life.q) leaveQueue(n); setShirt(n, false); n.life = null; if (n.state === 'lifeoff') n.state = 'walk'; if (n.life0sp != null) n.sp = n.life0sp; }
    for (const n of GROUPED) if (n.lifeGrp){ n.lifeGrp = false; if (n.state === 'lifeoff') n.state = 'walk'; }
    for (const Q of QUEUES) Q.who.length = 0;
  }

  /* ---------- tick: wraps updateNPCs (runs every frame in every mode) ---------- */
  function tick(dt){
    if (window.XClock) L.min = XClock.hour() * 60;   /* the shared campus clock (js/17-clock.js) */
    else {
      const band = bandNow();
      if (band !== L.band){ L.band = band; L.min = BANDS[band][0]; }
      const [b0, b1] = BANDS[band]; L.min += dt; if (L.min >= b1) L.min = b0 + (L.min - b1);
    }
    const ph = phaseAt(L.min);
    if (ph !== L.phase){
      L.phase = ph;
      if ((mode === 'naiwa' || mode === 'walk') && !L.seen.has(ph.id) && !gx.paused && !document.body.classList.contains('titled')){
        L.seen.add(ph.id);
        const te = document.getElementById('toast');
        if (!(te && te.classList.contains('show'))) toast(`${hhmm(L.min)} · ${ph.name}`, ph.sub, 2600);
      }
    }
    budget = 1; queues(dt); schedule(dt);
  }
  { const u0 = updateNPCs; updateNPCs = function(dt, T){
      const hole = mode === 'hole';
      if (hole && !L.paused){ L.paused = true; resetAll(); }
      else if (!hole && L.paused) L.paused = false;
      const frozen = window.XPhoto && XPhoto.on;   /* photo mode (js/89-photo.js) freezes the world: the clock waits too */
      if (!L.paused && !frozen){ try { tick(dt); } catch(e){ /* a broken schedule must never stop the students */ } }
      return u0.call(this, dt, T);
    }; }

  /* ---------- the pause panel: what time it is on campus ---------- */
  if (typeof gxRenderPause === 'function'){
    const r0 = gxRenderPause;
    gxRenderPause = function(){
      r0.apply(this, arguments);
      const b = $('#gxpBody'), note = b && b.querySelector('.gxp-note'); if (!note) return;
      const s = document.createElement('span'); s.className = 'gxp-clock'; s.textContent = `校园时间 ${hhmm(L.min)} · ${L.phase ? L.phase.name : ''}`;
      note.prepend(s, note.textContent.trim() ? document.createTextNode(' · ') : '');
    };
  }

  window.XLife = {
    clock:() => hhmm(L.min), phase:() => L.phase && L.phase.id, graph:NODES, queues:QUEUES, routeOf:route,
    set(h, m){ if (window.XClock){ XClock.set(h + (m || 0) / 60); L.min = XClock.hour() * 60; return hhmm(L.min); } let v = h * 60 + (m || 0); L.band = bandNow(); if (L.band === 'night' && v < 12 * 60) v += 1440; L.min = v; return hhmm(L.min); },
    roles(){ const o = {}; for (const n of WALKERS){ const r = n.state === 'lifeoff' ? 'hidden' : n.life ? n.life.role : 'walk'; o[r] = (o[r] || 0) + 1; } return o; },
    state:L
  };
})();
