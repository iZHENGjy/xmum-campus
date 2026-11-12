/* XMUM 校园漫游 · 隐藏特技跳台（GTA 的 Stunt Jumps）
 *
 * 全图藏了 20 个不起眼的木板跳台 / 土坡：校园环路、后山、校门外的公路、山包、汽车游乐园。小地图上不画。
 *   - 车速够（54 km/h 以上）、车头朝着跳台方向冲上去 → 起跳那一刻慢动作（时间 ×0.35，约 1.2 秒）+ 侧面电影镜头；
 *   - 落地时还在车上、车没报废、飞够 0.8 秒且 15 米 → 算成功。第一次成功：「特技跳台 7/20」，RM 30（每个跳台只给一次）；以后再飞只有普通的飞跃特技分；
 *   - 找全 20 个解锁成就「特技之王」。游戏指南（P）里有一页清单：找到的写名字，没找到的给模糊提示。
 * 慢动作只缩放本机这一帧的 dt（js/90-main.js 里 gx.scale），联机位置照常按真实时间发；不碰 XNet。
 * 跳台不进 RAMPS（那是黄色跳台和「飞跃挑战」用的），这里自己包一层 groundAt：跳台高度叠在地形上，山坡上的也贴着坡。
 * 存档：localStorage「xmum-jumps-v1」= {found:{id: 时间戳}}（xmum- 开头，云存档会一起带上）。
 * 对外：window.XJumps = {list, found(), count(), total, reset()}（测试用） */
'use strict';
(() => {
  if (typeof groundAt !== 'function' || typeof gx === 'undefined') return;
  const KEY = 'xmum-jumps-v1', MIN_V = 15, MIN_AIR = .8, MIN_DIST = 15, FIRST_RM = 30;   /* 只在第一次飞成某个跳台时给（每个跳台一辈子一次）；以后再飞只有普通的飞跃特技分 */
  /* id 只加不改（存档记的是 id）。k: 'r' 公路边的木板跳台，'h' 山顶上的矮土坡（坡后面本来就是下坡） */
  const JUMPS = [
    {id:'ly',     x:-100, z:-256, h:1.564,  k:'r', name:'宿舍后墙',   hint:'LY 宿舍北边，贴着围墙的那段环校路'},
    {id:'nw',     x:-432, z:-240, h:-1.515, k:'r', name:'后山脚下',   hint:'校园西北角，环校路拐弯前'},
    {id:'bridge', x:198,  z:-108, h:1.571,  k:'r', name:'桥头冲刺',   hint:'芙蓉桥东头，往 LY5 的路上'},
    {id:'hall',   x:-142, z:14,   h:1.326,  k:'r', name:'音乐厅小路', hint:'陈华春音乐厅西北边的小路'},
    {id:'a5',     x:294,  z:145,  h:-1.624, k:'r', name:'A5 侧门',    hint:'A5 东边，田径场西侧那条路'},
    {id:'trail',  x:-351, z:-38,  h:.695,   k:'r', name:'步道入口',   hint:'上山步道口附近的岔路'},
    {id:'se',     x:552,  z:150,  h:3.142,  k:'r', name:'东南转角',   hint:'校园东南角，田径场东边的环校路'},
    {id:'east',   x:558,  z:-32,  h:3.142,  k:'r', name:'东墙直道',   hint:'校园东边的环校路，B1 背后'},
    {id:'peak',   x:-316, z:-180, h:2.749,  k:'h', name:'后山飞瀑',   hint:'后山最高处，观景亭旁边，往下冲'},
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
    {id:'park',   x:-975, z:-60,  h:Math.PI, k:'r', name:'游乐园暗门', hint:'汽车游乐园西边那片空地'}
  ];
  const SIZE = {r:{L:9, W:5, H:2.8}, h:{L:6, W:5, H:1.4}};
  for (const J of JUMPS) Object.assign(J, SIZE[J.k], {fx:Math.sin(J.h), fz:Math.cos(J.h)});

  /* ---------- save ---------- */
  let found = {};
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.found && typeof d.found === 'object') for (const J of JUMPS) if (d.found[J.id]) found[J.id] = +d.found[J.id] || 1; } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({found})); } catch(e){} };
  const count = () => JUMPS.filter(J => found[J.id]).length;

  /* ---------- ground: the ramps sit on the terrain (base = the ground the ramp was built on, taken once) ---------- */
  const base0 = groundAt;
  const local = (J, x, z) => { const dx = x - J.x, dz = z - J.z; return {u:dx * J.fx + dz * J.fz, v:dx * J.fz - dz * J.fx}; };
  for (const J of JUMPS){ J.y0 = base0(J.x, J.z); J.yl = base0(J.x + J.fx * J.L / 2, J.z + J.fz * J.L / 2); J.yb = base0(J.x - J.fx * J.L / 2, J.z - J.fz * J.L / 2); }
  groundAt = function(x, z){
    for (let i = 0; i < JUMPS.length; i++){
      const J = JUMPS[i], dx = x - J.x, dz = z - J.z;
      if (dx > 7 || dx < -7 || dz > 7 || dz < -7) continue;
      const u = dx * J.fx + dz * J.fz, v = dx * J.fz - dz * J.fx;
      if (Math.abs(v) < J.W / 2 && u > -J.L / 2 && u < J.L / 2){ const t = (u + J.L / 2) / J.L; return J.yb + (J.yl - J.yb) * t + J.H * t; }
    }
    return base0(x, z);
  };

  /* ---------- clear trees and lamps on the ramp and in the first part of the flight ---------- */
  function clearSpot(J){
    const hit = o => { const a = local(J, o.x, o.z); return a.u > -J.L / 2 - 3 && a.u < J.L / 2 + (J.k === 'h' ? 30 : 18) && Math.abs(a.v) < J.W / 2 + 2.5; };
    if (typeof knockSets !== 'undefined') for (const set of knockSets) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); } });
    if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => { if (!o.hidden && hit(o)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); } });
  }
  try { JUMPS.forEach(clearSpot); } catch(e){}

  /* ---------- one mesh for all twenty: weathered planks on two rails (road), or a packed-dirt lip (hill) ---------- */
  {
    const pos = [], col = [], c = new THREE.Color();
    const tri = (A, B, C, hex) => { c.set(hex); for (const P of [A, B, C]){ pos.push(P[0], P[1], P[2]); col.push(c.r, c.g, c.b); } };
    const quad = (A, B, C, D, hex) => { tri(A, B, C, hex); tri(A, C, D, hex); };
    for (const J of JUMPS){
      const W = (u, v, y) => [J.x + J.fx * u + J.fz * v, y, J.z + J.fz * u - J.fx * v];
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
      if (J.k === 'r') for (const s of [-1, 1]){   /* a faded hazard stripe down each edge: you can spot it if you look */
        for (let i = 0; i < 4; i++){ const ua = -J.L / 2 + J.L * i / 4, ub = ua + J.L / 8, e = .02;
          quad(W(ua, s * (hw - .45), top(ua) + e), W(ub, s * (hw - .45), top(ub) + e), W(ub, s * hw, top(ub) + e), W(ua, s * hw, top(ua) + e), '#c9a13a'); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.92, side:THREE.DoubleSide}));
    m.castShadow = m.receiveShadow = true; m.name = 'stunt-jumps'; scene.add(m);
  }

  /* ---------- the run: take-off on a ramp → slow motion + side camera → landing decides ---------- */
  const R = {car:null, wasAir:false, run:null, cam:null, slowTold:0, lastT:0};
  const _look = new THREE.Vector3();
  function rampAt(c){
    for (const J of JUMPS){
      const a = local(J, c.x, c.z);
      if (a.u > J.L / 2 - 5 && a.u < J.L / 2 + 5 && Math.abs(a.v) < J.W / 2 + 1.5) return J;
    }
    return null;
  }
  function blockedNow(){
    return mode !== 'naiwa' || (typeof indoorNow === 'function' && indoorNow()) || (window.XCine && XCine.busy) || (typeof spray !== 'undefined' && spray.run);
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
    if (!ok || driving !== c || c.wrecked || c.wet){ toast('特技跳台 · 没落稳', ok ? '落地要稳，车还得能开' : '奶娃飞出去了，再来一次', 2000); return; }
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
    const c = driving;
    if (c !== R.car){ if (R.run && R.car) land(R.car, false); R.car = c; R.wasAir = !!(c && c.air); R.run = null; R.cam = null; }
    if (!c) return;
    if (c.air && !R.wasAir && !R.run && !blockedNow()){ const J = rampAt(c); if (J) takeOff(c, J); }
    if (!c.air && R.wasAir && R.run) land(c, true);
    R.wasAir = !!c.air;
    if (R.run){ R.run.t += dt; if (R.run.t > 8){ R.run = null; R.cam = null; } }
    /* the cinematic camera: fixed beside the flight path, turning to follow the car */
    if (R.cam){
      R.cam.t += dt;
      if (!c.air){ R.cam.land = (R.cam.land || 0) + dt; }
      if (R.cam.land > .45 || R.cam.t > 3){ R.cam = null; return; }
      camera.position.copy(R.cam.at); _look.set(c.x, c.y + c.T.H * .5, c.z); camera.lookAt(_look);
      if (camera.fov !== 52){ camera.fov = 52; camera.updateProjectionMatrix(); }
    }
  }
  { const u0 = gx.update; gx.update = function(dt, px, pz){ u0.call(this, dt, px, pz); try { tick(dt); } catch(e){ R.run = null; R.cam = null; } }; }
  { const l0 = gx.leave; gx.leave = function(){ R.run = null; R.cam = null; R.car = null; return l0.apply(this, arguments); }; }

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
    return `<p class="gd-lead">全图藏着 <b>${JUMPS.length} 个特技跳台</b>：木板跳台和山顶的土坡，小地图上不标。开车<b>快速</b>（54 km/h 以上）正对着冲上去，起跳会进慢动作；<b>稳稳落地</b>才算数。</p>
      <div class="sj-bar" role="img" aria-label="已找到 ${n} / ${JUMPS.length}"><i style="width:${Math.round(n / JUMPS.length * 100)}%"></i></div>
      <p class="gd-note">已找到 ${n} / ${JUMPS.length} · 第一次飞成 RM ${FIRST_RM} · 找齐 ${JUMPS.length} 个解锁「特技之王」</p>
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

  window.XJumps = {list:JUMPS, total:JUMPS.length, found:() => Object.assign({}, found), count,
    state:R};
  /* 清空进度只给本地测试和预览版（正式版不暴露，免得在控制台里反复刷首次奖励） */
  if (window.XMUM_FIREBASE === null || /\/preview\//.test(location.pathname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.XJumps.reset = () => { found = {}; save(); };
})();
