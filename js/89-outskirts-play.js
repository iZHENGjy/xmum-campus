/* XMUM 校园漫游 · 校外玩法：麦当当得来速、KIP 超市大乱斗的入口、山梁拉力、蜜雪冰橙打工、Bell 夜市、抓小偷和通缉榜、跨区外卖
 *
 * 麦当当得来速：开车进点餐圈停稳，选一份（三种脾气不同的单），绕到取餐窗口停准，再限时送回学校。
 *   路上撞车、落地太猛会把餐洒掉，扣报酬。夜晚全是「夜宵加急」，报酬更高、时间更紧。
 * KIP 超市大乱斗：商场门口的粉圈按 F 进门，里面是小游戏 js/minigames/kipmart.js（和 AI 顾客抢货、互撞、结账）。
 *   停车场上的购物车还在，可以坐上去开着玩。
 * 山梁拉力：校门外沿着去 KIP 的山路跑一趟计时赛（直接用 js/85-activities.js 的计时赛）。
 * 蜜雪冰橙打工：走到店门口，按顺序加料，再在指针走到绿色时摇，45 秒内做得越多越好。
 * Bell 夜市：夜晚才摆出来的一排摊位，走过去把五种小吃吃一遍。
 * 偷外卖的小偷：送单途中会有小偷冲上来抢你手上的外卖，倒计时照走，追上去用水枪淋他、开车撞倒他，按 F 拿回来接着送；
 *   取餐点门口也有人偷别人的外卖，抓到有悬赏。通缉榜上六个人，抓完一轮下一轮更快；没追回来的单没钱，还掉「店铺信用」。
 * 跨区外卖：校外多了两个取餐点，出入校门的单按路程加报酬（js/50-missions.js 调 outCross 和 outCred）。
 *
 * 这个文件要排在 js/87-classroom.js 后面加载：它最后一个包住 gx 的钩子。
 */
'use strict';
/* ---------- shared bits ---------- */
const opNight = () => tgt === P3.night;
const opIn = (x, z, R) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1;
const opZone = (x, z) => opIn(x, z, CAMPUS_R) ? 'c' : z < 520 && x > -200 ? 'b' : 'k';   /* campus, Bell side, KIP side */
const opN = k => prog.best[k] | 0;
function opAdd(k){ prog.best[k] = opN(k) + 1; saveGame(); return prog.best[k]; }
const opAng = a => Math.atan2(Math.sin(a), Math.cos(a));
const opFanfare = () => { for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09); };
const OP_MEDAL_C = ['#e3b95a', '#b8c2cc', '#c98a55'];
/* the explanation follows the big stamped word, instead of covering it */
function opLater(t, sub, ms){ const go = () => { if (mode !== 'naiwa') return; if (gxCallEl && !gxCallEl.hidden) setTimeout(go, 350); else toast(t, sub, ms); }; setTimeout(go, 1150); }
/* driving distance between two spots: through the gate, and over the hill road for anything on the KIP side */
const OP_K0 = ROAD.kip.p[0];
function opKipS(x, z){
  const R = ROAD.kip; let bi = 0, bd = 1e9;
  for (let i = 0; i < R.p.length; i += 2){ const d = Math.hypot(R.p[i][0] - x, R.p[i][1] - z); if (d < bd){ bd = d; bi = i; } }
  return R.s[bi] + bd;
}
function opRoute(ax, az, bx, bz){
  const za = opZone(ax, az), zb = opZone(bx, bz), D = Math.hypot;
  if (za === zb) return D(bx - ax, bz - az);
  if (za === 'k') return opRoute(bx, bz, ax, az);
  if (zb === 'k') return (za === 'c' ? D(ax - GX, az - 264) + D(GX - OP_K0[0], 264 - OP_K0[1]) : D(ax - OP_K0[0], az - OP_K0[1])) + opKipS(bx, bz);
  return D(ax - GX, az - 264) + D(bx - GX, bz - 264);
}
/* called by js/50-missions.js: an order that leaves or enters the campus gets a route-based time limit and a pay multiplier */
function outCross(pk, to){
  if (opZone(pk.x, pk.z) === opZone(to.x, to.z)) return null;
  const route = opRoute(pk.x, pk.z, to.x, to.z);
  return {route, limit:Math.round(route / 18 + 20), mult:Math.round((1.2 + route / 3000) * 20) / 20};
}
/* a start ring with its label: true while the player stands in it (after leaving it once, if it was just used) */
function opSpot(color, s, x, z, text, r){
  const mark = gxMarker(color, s); mark.position.set(x, .1, z);
  const lbl = addLabel(text, x, 2.5 + s * 5, z, true); lbl.dead = true;
  return {mark, lbl, x, z, r:r || 6 * s, rearm:false};
}
function opRing(o, show, px, pz){
  show = show && !qCalm();
  o.mark.visible = show; o.lbl.dead = !show; if (!show) return false;
  o.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
  const d = Math.hypot(px - o.x, pz - o.z);
  if (o.rearm){ if (d > o.r + 8) o.rearm = false; return false; }
  return d < o.r;
}
const opHide = o => { o.mark.visible = false; o.lbl.dead = true; };
const opDest = gxMarker('#ffc72c', 1.1);
let opMsg = '', opFBtn = '';

/* achievements: through achAdd() when js/80-gta.js has it; otherwise the save there only keeps ids it knows, so re-read ours after adding them */
const OP_ACH = [['dthru', '得来速常客', '麦当当得来速送达 5 单', 60], ['supper', '夜宵骑士', '夜里送达一单夜宵加急', 40], ['sale', '剁手党', 'KIP 超市大乱斗拿到金牌', 60],
  ['tea', '奶茶大师', '蜜雪冰橙打工拿到金牌', 50], ['cross', '跨区骑手', '累计送出 10 单跨区外卖', 80], ['nmkt', '夜市吃货', '一晚上吃遍夜市五种小吃', 30],
  ['thief1', '见义勇为', '抓住第一个偷外卖的小偷', 30], ['back', '完璧归赵', '被抢走的外卖追回来，还按时送到', 50], ['wanted', '神探奶娃', '把通缉榜上的六个小偷全部抓住', 150]];
if (typeof achAdd === 'function') achAdd(OP_ACH);
else { ACH.push(...OP_ACH); try { const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (d && d.ach) for (const a of OP_ACH) if (d.ach[a[0]]) prog.ach[a[0]] = +d.ach[a[0]] || 1; } catch(e){} }
GX_MORE.push({id:'o_tea', name:'蜜雪冰橙打工', fmt:v => Math.round(v) + ' 分'},
  {id:'o_dt', name:'得来速送达', fmt:v => Math.round(v) + ' 单'}, {id:'o_thief', name:'抓到的小偷', fmt:v => Math.round(v) + ' 个'});

/* ---------- one small panel for the order menu and the tea counter; the game is paused while it is open ---------- */
{ const st = document.createElement('style'); st.textContent = `
#opPanel{position:fixed;z-index:9;left:50%;top:50%;transform:translate(-50%,-50%);width:min(500px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;
  padding:14px 16px 16px;background:var(--panel-solid);border-top:4px solid var(--tile)}
#opPanel h2{font-family:var(--display);font-size:18px;margin:0 36px 8px 0;text-wrap:balance}
.op-note{font-size:12.5px;color:var(--muted);line-height:1.6;margin:0}
.op-card{display:block;width:100%;box-sizing:border-box;text-align:left;padding:10px 12px;margin-top:8px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);
  cursor:pointer;font:inherit;touch-action:manipulation}
.op-card:hover,.op-card:active{border-color:var(--tile)}
.op-card b{font-family:var(--display);font-size:16px}
.op-card kbd{float:right}
.op-card span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;line-height:1.5}
.op-card em{font-style:normal;color:var(--tile);font-weight:700}
.tea-top{display:flex;justify-content:space-between;gap:10px;font-size:13px;font-variant-numeric:tabular-nums}
.tea-top b{font-family:var(--display);font-size:16px}
.tea-bar{height:6px;border-radius:3px;background:var(--chip);overflow:hidden;margin:5px 0 10px}
.tea-bar i{display:block;height:100%;width:100%;background:var(--tile)}
.tea-bar.pat i{background:var(--gold)}
.tea-who{font-size:13px;color:var(--muted);min-height:20px}
.tea-order{display:flex;gap:6px;flex-wrap:wrap;min-height:36px;align-items:center}
.tea-order span{padding:4px 11px;border-radius:999px;border:1px solid var(--line);font-size:14px;background:var(--card-bg)}
.tea-order span.ok{background:var(--ok);color:#fff;border-color:transparent}
.tea-order span.now{border-color:var(--tile);box-shadow:0 0 0 2px var(--tile-soft)}
.tea-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
.tea-grid button,.tea-shake{min-height:58px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);font:inherit;font-size:15px;font-weight:700;cursor:pointer;
  touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:4px}
.tea-grid button:active,.tea-shake:active{background:var(--tile);color:var(--on-accent);border-color:var(--tile)}
.tea-meter{position:relative;height:20px;border-radius:10px;background:var(--chip);margin-top:12px;overflow:hidden}
.tea-meter i{position:absolute;top:0;bottom:0}
.tea-meter .g{left:39%;width:22%;background:var(--ok);opacity:.35}
.tea-meter .p{left:46%;width:8%;background:var(--ok)}
.tea-meter .n{width:4px;margin-left:-2px;background:var(--ink);border-radius:2px;left:0}
.tea-shake{width:100%;margin-top:8px;flex-direction:row;gap:8px}
.tea-shake[disabled]{opacity:.4;cursor:default}
.tea-miss{animation:teaMiss .25s}
@keyframes teaMiss{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@media (prefers-reduced-motion: reduce){ .tea-miss{animation:none} }
body.op-open #acts,body.op-open #joy,body.op-open #prompt{display:none!important}
@media (pointer: coarse){ #opPanel kbd{display:none} }`; document.head.appendChild(st); }
const opPanel = document.createElement('div');
opPanel.className = 'panel'; opPanel.id = 'opPanel'; opPanel.hidden = true; opPanel.setAttribute('role', 'dialog'); opPanel.setAttribute('aria-labelledby', 'opT');
opPanel.innerHTML = '<h2 id="opT"></h2><button type="button" class="x" id="opX" aria-label="关闭">×</button><div id="opBody"></div>';
document.body.appendChild(opPanel);
const opUI = {on:false, key:null, close:null, tick:null};
function opOpen(title, html, onKey, onClose, tick){
  Object.assign(opUI, {on:true, key:onKey, close:onClose, tick:tick || null});
  $('#opT').textContent = title; $('#opBody').innerHTML = html; opPanel.hidden = false; document.body.classList.add('op-open');
  gx.paused = true; for (const k in keys) keys[k] = false; engineUpdate(0, 0, false);
  requestAnimationFrame(opTick);
}
/* quiet = closed by the game (a choice was made, time ran out); otherwise the player backed out and onClose runs */
function opClose(quiet){
  if (!opUI.on) return;
  opUI.on = false; opPanel.hidden = true; document.body.classList.remove('op-open'); gx.paused = false;
  const f = opUI.close; opUI.close = opUI.tick = opUI.key = null; if (f && !quiet) f();
  canvas.focus({preventScroll:true});
}
function opTick(now){
  if (!opUI.on) return;
  if (mode !== 'naiwa' || (typeof titleOpen !== 'undefined' && titleOpen)){ opClose(); return; }
  gx.paused = true;   /* the pause button could have flipped it */
  if (opUI.tick) opUI.tick(now);
  if (opUI.on) requestAnimationFrame(opTick);
}
$('#opX').addEventListener('click', () => opClose());
window.addEventListener('keydown', e => {
  if (!opUI.on) return;
  if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); opClose(); return; }
  if (e.code === 'Tab' || (e.code === 'Enter' && e.target.closest && e.target.closest('#opPanel'))) return;
  e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat && opUI.key) opUI.key(e.code);
}, true);
const OP_DIGIT = {Digit1:0, Digit2:1, Digit3:2, Digit4:3, Numpad1:0, Numpad2:1, Numpad3:2, Numpad4:3};

/* a sign: a canvas texture on a plane */
function opSign(w, h, cw, ch, draw, o){
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = ANISO;
  const paint = () => { draw(cv.getContext('2d'), cw, ch); tex.needsUpdate = true; };
  paint(); document.fonts && document.fonts.ready.then(paint);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial(Object.assign({map:tex, roughness:.7}, o || {})));
  scene.add(m); m.userData.paint = paint; return m;
}
/* standing people as one merged, vertex-coloured mesh (queues, stall customers): list of [x, z, heading, shirt, skin, pants] */
function opPeople(list, parent){
  const parts = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(1, 1, 1), white = new THREE.Color('#ffffff'), c = new THREE.Color();
  for (const [x, z, h, shirt, skin, pants] of list){
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(UP, h), v1);
    const put = (geo, col, lx, ly, rz) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (col === 'keep'){ if (pants){ const a = g.attributes.color; for (let i = 0; i < a.count; i++) if (a.getX(i) > .95 && a.getY(i) > .95 && a.getZ(i) > .95){ c.set(pants); a.setXYZ(i, c.r, c.g, c.b); } } }
      else geoTint(g, col);
      if (rz) g.rotateZ(rz); if (lx != null) g.translate(lx, ly, 0);
      g.applyMatrix4(m4); parts.push(g);
    };
    put(npcBodyGeo, shirt); put(npcHeadGeo, skin); { const g = npcGearGeo.clone(); g.applyMatrix4(m4); parts.push(g); }
    for (const s of [-1, 1]){ put(npcLegGeo, 'keep', s * .09, .92); put(npcSleeveGeo, shirt, s * .215, 1.39, s * .1); put(npcForeGeo, skin, s * .215, 1.39, s * .1); }
  }
  const mesh = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.8}));
  mesh.castShadow = !TOUCH; (parent || scene).add(mesh); return mesh;
}

/* ---------- cross-zone deliveries: two pick-up rings outside the gate ---------- */
{
  const mk = (name, x, z) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:'#ff8a3d', transparent:true, opacity:.45, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
    m.position.set(x, .1, z); scene.add(m);
    return {name, x, z, m, lbl:addLabel('外卖取餐 · ' + name, x, 6.5, z, true), out:true};
  };
  const ui = BELL_SIGN.n.findIndex(si => OUT_SIGNS[si][0] === '星爸爸咖啡');
  PICKUPS.push(mk('星爸爸咖啡', ui >= 0 ? BELL_UNITS[ui] : 283, 309.5), mk('KIP 美食广场', -600, 917.5));   /* in the ring lane, at the crossing to the food-court doors */
}
let opDeliv = deliveries, opWas = 0;

/* ---------- 麦当当得来速 ---------- */
/* in from the north-east corner (Jalan Warisan Sentral 5), south down the east side past the order board, west along the south side to the
   window, out onto Jalan Warisan Sentral 1; the building, the board and the window are always on the driver's right (Malaysia drives on the left).
   It used to start at the west end, which meant a U-turn for anyone coming from the hill road. */
const DT = {st:'', job:null, x:-465 + MDX, z:772 + MDZ, wx:-478 + MDX, wz:792 + MDZ, spillCd:0};
DT.A = opSpot('#ffc72c', .55, DT.x, DT.z, '得来速 · 点餐');
DT.B = opSpot('#4fd18b', .55, DT.wx, DT.wz, '取餐窗口');
{
  /* menu board with its speaker post beside the order bay, a canopy and sign over the pick-up window, an arrow painted at the lane entrance */
  const red = M('#c8102e', {roughness:.6}), grey = M('#4a4d52', {roughness:.6}), bx = DT.x - 4.1, bz = DT.z;
  box(.28, 3.3, 4.4, red, bx, 2.75, bz); box(.2, 1.2, .2, grey, bx, .6, bz - 1.6); box(.2, 1.2, .2, grey, bx, .6, bz + 1.6);
  box(.3, 1.3, .3, grey, bx + .3, .65, bz + 3); box(.2, .42, .42, M('#1d1f24'), bx + .36, 1.45, bz + 3);
  addBox(bx, bz, .25, 2.3, 0);
  const menu = opSign(4, 3, 512, 384, (g, w, h) => {
    g.fillStyle = '#1d1f24'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc72c'; g.fillRect(0, 0, w, 84);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c8102e'; g.font = `900 52px ${OUT_FONT}`; g.fillText('得来速 点餐', w / 2, 44);
    g.textAlign = 'left'; g.font = `700 38px ${OUT_FONT}`;
    [['巨无霸套餐', '#ffffff'], ['麦旋风 ×4', '#9fd8ff'], ['派对桶 + 可乐', '#ffc72c'], ['夜里有夜宵加急', '#ff8a6a']].forEach(([t, col], i) => { g.fillStyle = col; g.fillText('· ' + t, 36, 132 + i * 66); });
  }, {emissive:'#ffffff', emissiveIntensity:.35});
  menu.material.emissiveMap = menu.material.map; menu.position.set(bx + .15, 2.75, bz); menu.rotation.y = Math.PI / 2;   /* faces the lane (east) */
  const wx = DT.wx, wz = 788 + MDZ;
  box(4.6, .22, 2.2, red, wx, 3.1, wz + 1.1).castShadow = !TOUCH;
  const pick = opSign(3, .7, 384, 96, (g, w, h) => { g.fillStyle = '#ffc72c'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 60px ${OUT_FONT}`; g.fillText('取 餐', w / 2, h / 2 + 4); });
  pick.position.set(wx, 3.55, wz + 2.22);
  const arrow = opSign(4.4, 7.4, 256, 432, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 78px ${OUT_FONT}`; g.fillText('得来速', w / 2, h - 60);
    g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2 + 70, 120); g.lineTo(w / 2 + 24, 120); g.lineTo(w / 2 + 24, 270); g.lineTo(w / 2 - 24, 270); g.lineTo(w / 2 - 24, 120); g.lineTo(w / 2 - 70, 120); g.fill();
  }, {transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48});
  arrow.rotation.set(-Math.PI / 2, 0, Math.PI); arrow.position.set(DT.x, .09, DT.z - 11.5);   /* reads upright for a car driving in (heading +z, south) */
}
const DT_MENU = [
  {name:'巨无霸套餐', note:'普通单，稳稳送到就行', risk:'', pay:1, time:1, frag:1},
  {name:'麦旋风 ×4', note:'冰淇淋会化：时间更紧，报酬更高', risk:'会化：时间紧', pay:1.35, time:.82, frag:.7},
  {name:'派对桶 + 可乐 ×6', note:'可乐怕颠：撞车和飞跃洒得多，报酬最高', risk:'怕颠：撞车、飞跃会洒', pay:1.6, time:1, frag:2.2}
];
function dtOpen(){
  const night = opNight(), pool = DESTS.filter(d => opIn(d.x, d.z, CAMPUS_R) && (!night || /^(LY|D)\d/.test(d.name)));
  const cards = DT_MENU.map(m => {
    const to = pool.splice((rnd() * pool.length) | 0, 1)[0], route = opRoute(DT.wx, DT.wz, to.x, to.z);
    const base = Math.round((route / 18 + 20) * m.time * (night ? .92 : 1)), ease = typeof DELIV_EASE === 'number' ? DELIV_EASE : 1;
    const limit = Math.round(base * ease), mult = m.pay * (night ? 1.5 : 1);   /* more time, same pay: the extra seconds (grace) do not count */
    return {m, to, route, limit, grace:limit - base, mult, night, est:Math.round((40 + route * .035 + base * .3) * mult / 5) * 5};
  });
  const pick = i => {
    const c = cards[i]; if (!c) return;
    DT.job = Object.assign(c, {t:c.limit, intact:1, perfect:false, air:0, stolen:false, recovered:false}); DT.st = 'win'; opClose(true); sfx.ding();
    gxCallout('去取餐窗口 →', '点好了：' + c.m.name + ' · 往前开，拐过弯就是绿色的取餐圈', '#4fd18b', 3300);
    toast('点好了：' + c.m.name, '往前开，拐过弯就是取餐窗口（绿圈），停稳取餐', 4600);
  };
  /* the order card of js/89-offers.js: three orders to pick from without stopping the game (the paused menu below is the fallback) */
  if (typeof offerJob === 'function') return {icon:'🍔', title:night ? '麦当当得来速 · 夜宵加急' : '麦当当得来速', desc:night ? '夜宵时段：报酬 ×1.5，时间更紧' : '点一份，绕到取餐窗口拿餐，限时送回学校',
    options:cards.map((c, i) => ({title:c.m.name, tag:night ? '夜宵' : '', desc:'送到 ' + c.to.name, pay:'约 RM ' + c.est, time:c.limit, dist:c.route, risk:c.m.risk, onAccept:() => { if (!DT.st && driving) pick(i); }})),
    onDecline:() => { DT.A.rearm = true; }};
  opOpen(night ? '麦当当得来速 · 夜宵加急' : '麦当当得来速',
    `<p class="op-note">${night ? '夜宵时段：全是加急单，报酬 ×1.5，时间更紧。' : '点一份，绕到取餐窗口拿餐，再限时送回学校。夜里来有夜宵加急单。'}</p>` +
    cards.map((c, i) => `<button type="button" class="op-card" data-i="${i}"><kbd>${i + 1}</kbd><b>${night ? '夜宵 · ' : ''}${c.m.name}</b><span>送到 <em>${c.to.name}</em> · 限时 ${c.limit} 秒 · 约 RM ${c.est}</span><span>${c.m.note}</span></button>`).join(''),
    code => pick(OP_DIGIT[code]), () => { DT.A.rearm = true; });
  $('#opBody').onclick = e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); };
}
function dtEnd(){ DT.st = ''; DT.job = null; DT.A.rearm = true; opHide(DT.B); opDest.visible = false; missionEl.classList.remove('urgent'); }
function dtSpill(v, why){
  const j = DT.job; if (DT.st !== 'go' || !j || !(v > 0)) return;
  j.intact = Math.max(.2, j.intact - v * j.m.frag);
  if (DT.spillCd <= 0){ DT.spillCd = 1.2; gxCallout('洒了！', `${why} · 餐品 ${Math.round(j.intact * 100)}%`, '#ff6f61'); tone('sawtooth', 500, 180, .2, .07); }
}
function dtUpdate(dt, px, pz, sp, free){
  DT.spillCd -= dt;
  if (!DT.st){
    opHide(DT.B);
    const inA = opRing(DT.A, free && Math.abs(px - DT.x) < 420 && Math.abs(pz - DT.z) < 420, px, pz);
    if (!inA) DT.footTold = false;   /* walked out: tell again next time */
    if (inA){
      if (!driving){ opMsg = '得来速只接待开车的：开车进来点餐';
        if (!DT.footTold){ DT.footTold = true; gxCallout('得来速要开车', '上车，开进黄圈才能点单', '#ffc72c', 3300); } }
      else if (typeof offerJob === 'function'){ if (sp > 9) opMsg = '慢下来看菜单'; else offerJob('dt', dtOpen); }
      else if (sp > 2.5) opMsg = '慢下来，停在点餐牌旁边';
      else dtOpen();
    }
    return;
  }
  const j = DT.job; opHide(DT.A);
  if (DT.st === 'win'){
    const d = Math.hypot(px - DT.wx, pz - DT.wz);
    DT.B.rearm = false; opRing(DT.B, true, px, pz);
    missionEl.textContent = `去窗口取餐 · ${Math.round(d)} 米 · ${j.m.name}`;   /* phones show only the first dozen characters of this line, so every status leads with what matters */
    if (d > 110){ dtEnd(); sfx.fail(); toast('这单取消了', '开太远了，回得来速重新点', 2400); return; }
    if (d < 3.6){
      if (!driving) opMsg = '回车上，把车开到窗口旁边';
      else if (sp > 1) opMsg = '停稳在窗口旁边取餐，停得越正小费越多';
      else {
        j.perfect = d < 1.5; DT.st = 'go'; opHide(DT.B); opDest.position.set(j.to.x, .1, j.to.z); sfx.ding();
        gxCallout(j.perfect ? '停得真准' : '拿到了', j.perfect ? '窗口小费 +RM 8' : j.m.name, '#ffc72c');
        toast((j.night ? '夜宵加急：' : '得来速：') + j.m.name + ' → ' + j.to.name, `限时 ${j.limit} 秒，翻过山梁送回学校 · 别把餐洒了`, 3200);
      }
    }
    return;
  }
  j.t -= dt; opDest.visible = true;
  const d = Math.hypot(px - j.to.x, pz - j.to.z);
  if (driving){ if (driving.air) j.air = driving.airT; else { if (j.air > .7) dtSpill(.05 * j.air, '落地太猛'); j.air = 0; } }
  missionEl.textContent = j.stolen ? `被抢了 ${Math.max(0, Math.ceil(j.t))} 秒 · 追上小偷拿回来` : `${Math.max(0, Math.ceil(j.t))} 秒 · 餐品 ${Math.round(j.intact * 100)}% · ${j.night ? '夜宵' : '得来速'} → ${j.to.name} · ${Math.round(d)} 米`;
  missionEl.classList.toggle('urgent', j.t < 12 || !!j.stolen);
  if (d < 6 && j.stolen) opMsg = '外卖还在小偷手里，先追回来';
  else if (d < 6){
    const pay = (40 + j.route * .035 + Math.max(0, j.t - (j.grace || 0))) * j.mult * (.4 + .6 * j.intact) * outCred() + (j.perfect ? 8 : 0), n = opAdd('o_dt');
    sess.deliv++; prog.life.deliv++; earn(pay); sfx.ding(); gxCallout(j.night ? '夜宵送达！' : '送达！', `+RM ${Math.round(pay)}`, '#ffc72c'); if (j.intact > .95) opFanfare(); if (j.recovered) unlock('back');
    for (let i = 0; i < 8; i++) spawnPart('heart', j.to.x + (rnd() - .5) * 4, 2 + rnd() * 2, j.to.z + (rnd() - .5) * 4, .9, {vy:2.5, life:1.4, op:1, color:'#ff6fa3'});
    /* 改装零件 (js/93-tuning-ui.js): a perfect run is the top grade; a night order adds a 霓虹灯管 */
    const loot = window.XParts ? XParts.reward('drive', j.perfect && j.intact > .95 ? 0 : j.intact > .8 ? 1 : 2, j.night ? '送夜宵' : '得来速') : [];
    if (j.night && window.XParts && XParts.grant('neon', 1, '送夜宵')) loot.push({id:'neon', n:1});
    toast((j.night ? '夜宵送达 ' : '得来速送达 ') + j.to.name, `+RM ${pay.toFixed(2)} · 餐品 ${Math.round(j.intact * 100)}%${j.intact > .95 ? '，一滴没洒' : ''}${j.perfect ? ' · 含窗口小费' : ''}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 3400);
    unlock('deliv1'); if (prog.life.deliv >= 25) unlock('deliv25'); if (n >= 5) unlock('dthru'); if (j.night) unlock('supper');
    dtEnd();
  } else if (j.t <= 0){ sfx.fail(); toast(j.m.name + '凉透了', '超时了，这单没拿到钱。回得来速可以再点', 2800); dtEnd(); }
}

/* ---------- 购物车: a tiny, slidey "car" you sit in ---------- */
CAR_T.trolley = {L:1.5, W:.92, H:1.1, wb:.95, r:.11, maxV:13, acc:11, grip:3.6, steer:.7, mass:.3, seat:[0, .44, -.05], name:'购物车', armor:.25};
carGeoCache.trolley = (() => {
  const wire = [], red = [], dark = [], B = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  B(wire, .78, .03, 1.12, 0, .43, .1);
  for (const sx of [-1, 1]){
    for (const y of [.52, .68, .84, .99]) B(wire, .022, .022, 1.12, sx * .39, y, .1);
    for (let z = -.46; z < .68; z += .19) B(wire, .016, .56, .016, sx * .39, .71, z);
    wire.push(rodGeo(.02, .02, [sx * .36, .2, -.45], [sx * .36, .2, .6]), rodGeo(.022, .022, [sx * .36, .2, -.45], [sx * .4, 1.08, -.58]));
  }
  for (const z of [-.46, .66]){ for (const y of [.52, .68, .84, .99]) B(wire, .78, .022, .022, 0, y, z); for (let x = -.3; x < .31; x += .15) B(wire, .016, .56, .016, x, .71, z); }
  B(red, .9, .055, .055, 0, 1.08, -.58); B(red, .74, .26, .03, 0, .82, -.4); for (const sx of [-1, 1]) for (const z of [-.47, .67]) B(red, .07, .1, .07, sx * .39, .99, z);
  for (const sx of [-1, 1]) for (const z of [-.475, .475]) B(dark, .05, .16, .05, sx * .38, .2, z);
  return {chrome:geoMerge(wire), paint:geoMerge(red), trim:geoMerge(dark)};
})();
const OP_CARTS = [0, 1, 2].map(i => { const c = makeCar('trolley', '#d7262d', -620 + i * 1.5, 930.4, Math.PI); c.out = true; if (TOUCH) c.root.traverse(o => { o.castShadow = false; }); return c; });
/* KIP supermarket trolleys at the back door and loose in the south car park: one instanced set (3 draw calls for all of them), pushed out of
   the way by a car or by 奶娃 on foot instead of falling over like the lamps (js/13-outskirts.js leaves kind 'cart' to this) */
const KCART = (() => {
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push(outSpot(-645.6 + i * .36, 1023.6, -Math.PI / 2, 1));
  for (const [x, z, r] of [[-655.8, 1040.5, 2.4], [-621, 1035.2, .5], [-703.7, 1041.3, 4.1], [-588.4, 1039.6, 1.3], [-675.2, 1024.3, 3.6], [-640.6, 1036.4, 5.2]]) spots.push(outSpot(x, z, r, 1));
  const g = carGeoCache.trolley;
  return outSet('cart', spots, [[g.chrome, M('#c9ccd0', {metalness:.6, roughness:.35})], [g.paint, M('#128a3c', {roughness:.5})], [g.trim, M('#2b2d30', {roughness:.7})]], !TOUCH);
})();
const _kc = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _kp = new THREE.Vector3(), _ks = new THREE.Vector3(1, 1, 1);
function kcartPush(px, pz){
  const S = KCART; if (!S || Math.abs(px - S.c.x) > S.R + 10 || Math.abs(pz - S.c.z) > S.R + 10) return;
  const c = driving, sp = c ? Math.hypot(c.vx, c.vz) : 0, hit = c ? carCircles(c, c.x, c.z, c.h).map(([x, z]) => [x, z, c.T.W / 2 + .15]) : [[nw.x, nw.z, .45]];
  let bumped = false;
  S.spots.forEach((o, i) => {
    for (const [hx, hz, r] of hit){
      const dx = o.x - hx, dz = o.z - hz, d = Math.hypot(dx, dz) || .01, need = r + .5;
      if (d >= need) continue;
      /* out along the line from whatever hit it, plus a share of the car's own speed; spun a little; never into a wall */
      let nx = dx / d, nz = dz / d, push = need - d;
      if (c && sp > 1){ const ux = c.vx / sp, uz = c.vz / sp; nx = nx * .5 + ux * .5; nz = nz * .5 + uz * .5; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; push += Math.min(1.2, sp * .04); }
      const x = o.x + nx * push, z = o.z + nz * push; if (hitsBuilding(x, z, .45) || outOfMap(x, z, .45)) continue;
      o.x = x; o.z = z; o.y = o.ty = terrainY(x, z); o.r += (c ? Math.min(.5, sp * .03) : .05) * (i % 2 ? 1 : -1);
      _kc.compose(_kp.set(o.x, o.y, o.z), _kq.setFromAxisAngle(UP, o.r), _ks); for (const im of S.ims){ im.setMatrixAt(i, _kc); im.instanceMatrix.needsUpdate = true; }
      if (c && sp > 5) bumped = true;
    }
  });
  if (bumped && !(kcartPush.cd > performance.now())){ kcartPush.cd = performance.now() + 400; tone('triangle', 900, 600, .08, .05); c.vx *= .97; c.vz *= .97; }
}
/* two ride-hailing cars waiting in the drop-off bay outside the supermarket door (a white Myvi and a silver saloon) with a green
   roof sign and door strip. The name is a pun (抓抓 Grap), like every other brand outside the gate. */
const KGRAB = (() => {
  const green = M('#00a651', {roughness:.5, emissive:'#00a651', emissiveIntensity:.15}), roofG = carGeoCache.grapRoof || (carGeoCache.grapRoof = roundBox(.7, .24, .34, .06));
  const tex = carTextTex('grap', 256, 56, (g, w, h) => { g.fillStyle = '#00a651'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 34px ${OUT_FONT}`; g.fillText('Grap 抓抓车', w / 2, h / 2 + 2); });
  const decal = new THREE.MeshBasicMaterial({map:tex});
  return [['myvi', '#f4f4f2', -642.5, 1029.3, -Math.PI / 2], ['sedan', '#c7c9cc', -635, 1029.3, -Math.PI / 2]].map(([kind, col, x, z, h]) => {
    const c = makeCar(kind, col, x, z, h); c.out = true; c.grap = true;
    const body = c.root.children[0], T = c.T;
    const roof = new THREE.Mesh(roofG, green); roof.position.set(0, T.H + .1, -.15); body.add(roof);
    /* door strips and the two faces of the roof sign in one mesh (one draw call per car) */
    const dg = carGeoCache['grapDecal_' + kind] || (carGeoCache['grapDecal_' + kind] = geoMergeUV([-1, 1].flatMap(s => [
      new THREE.PlaneGeometry(1.5, .33).rotateY(s * Math.PI / 2).translate(s * (T.W / 2 + .025), .72, -.1),
      new THREE.PlaneGeometry(.66, .15).rotateY(s > 0 ? 0 : Math.PI).translate(0, T.H + .1, -.15 + s * .175)])));
    body.add(new THREE.Mesh(dg, decal));
    return c;
  });
})();
/* two more parked cars, so the KIP car park has something to weave around (and to drive home in) */
for (const [kind, col, x, z, h] of [['myvi', '#2d5d8a', -740.4, 875.7, Math.PI], ['sedan', '#6d4c8f', -580.8, 905.6, 0]]) makeCar(kind, col, x, z, h).out = true;

/* ---------- KIP 超市大乱斗: the pink ring at the mall door; the game itself is js/minigames/kipmart.js on the mini-game platform (js/91-arcade.js) ---------- */
const KM = {near:false, door:{x:-640, z:929.6, h:Math.PI, name:'商场门口'}};   /* under the canopy of the main doors */
KM.S = opSpot('#ff5fa2', .55, -640, 930.6, 'KIP 超市大乱斗 · 进门');
function kmOpen(){
  if (!window.XMini || !XMini.startAt || !window.XKipMart) return;
  const g = XMini.games.find(x => x.id === 'kipmart'); if (!g) return;
  const t = XKipMart.tier(), best = XMini.best('kipmart'), go = () => { opClose(true); XMini.startAt('kipmart', KM.door); };
  opOpen('🛒 KIP 超市大乱斗', `<p class="op-note">推着购物车进超市，和 ${t.bots.length} 个顾客抢货。<b>抢</b>清单上的三样东西（头顶有箭头），<b>推到收银台</b>结账才算分，凑齐一张清单再加 5 分。
    按「冲撞」<b>撞</b>别人，他车里的东西会掉出来，掉一件你加 1 分；别人蓄力时地上有红线，躲开他就撞货架。90 秒后分数最高的赢。</p>
    <button type="button" class="op-card" id="kmGo"><kbd>F</kbd><b>开始 · ${t.n}</b><span>${t.mult > 1 ? `得分 ×${t.mult} · ` : ''}赢一局升一场，对手更快更爱撞人${t.thief.length ? '，还有扒手' : ''}</span>
    <span>${best != null ? `最好 <em>${Math.round(best)} 分</em> · ` : ''}金牌 ${g.medals[0]} 分 · 银牌 ${g.medals[1]} 分 · 铜牌 ${g.medals[2]} 分</span></button>`,
    code => { if (code === 'KeyF' || code === 'Enter' || code === 'Space' || code === 'Digit1') go(); });
  $('#kmGo').addEventListener('click', go);
}
function kmUpdate(px, pz, free){
  const was = KM.near; KM.near = false;
  if (opRing(KM.S, free && window.XMini && Math.abs(px - KM.S.x) < 420 && Math.abs(pz - KM.S.z) < 420, px, pz)){
    if (driving) opMsg = driving.kind === 'trolley' ? '超市里有车：下来走进圈里' : '下车走进圈里，进 KIP 超市';
    else if (nw.state !== 'fly'){ KM.near = true; opMsg = TOUCH ? '点「进门」进 KIP 超市 · 购物车大乱斗' : '按 F 进 KIP 超市 · 购物车大乱斗'; opSetF('进门'); }
  }
  if (was && !KM.near && opFBtn === '进门') opSetF('');
}

/* ---------- 山梁拉力: a timed run over the hill road to the KIP car park, on the race engine of js/85-activities.js ---------- */
{
  const R = ROAD.kip, at = s => { let i = 1; while (i < R.s.length - 1 && R.s[i] < s) i++; const t = (s - R.s[i - 1]) / (R.s[i] - R.s[i - 1] || 1); return [R.p[i - 1][0] + (R.p[i][0] - R.p[i - 1][0]) * t, R.p[i - 1][1] + (R.p[i][1] - R.p[i - 1][1]) * t]; };
  const cps = []; for (let s = 170; s < 800; s += 150) cps.push(at(s));
  cps.push([-548, 904], [-596, 898]);
  const a = {id:'ridge', type:'race', name:'山梁拉力', color:'#ff8a3d', start:[at(42)[0] + 13, at(42)[1]], cps, medal:[19, 25, 32], limit:60, pay:[80, 50, 30], intro:'翻过山梁冲到 KIP 停车场，沿着橙圈跑'};
  a.mark = gxMarker(a.color, 1); a.mark.position.set(a.start[0], .1, a.start[1]); a.lbl = addLabel(a.name, a.start[0], 7.5, a.start[1], true); a.lbl.dead = true;
  GX_ACTS.push(a);
}

/* ---------- 蜜雪冰橙打工: add the toppings in order, then shake when the needle is in the green ---------- */
const TEA_ING = ['冰块', '珍珠', '柠檬', '奶盖'], TEA_DUR = 45, TEA_MEDAL = [22, 15, 8], TEA_PAY = [60, 40, 25];
const TEA_WHO = ['赶早八的同学', '刚下课的学姐', '打完球的学长', 'Bell Suites 的住户', '下班的保安大叔', '奶娃的粉丝', '来旅游的阿姨', '隔壁店的老板'];
const TEA = {g:null, x:(OUT_DESTS.find(d => /蜜雪/.test(d.name)) || {x:305.75}).x};
TEA.S = opSpot('#ff6f91', .36, TEA.x + 1.6, 313.2, '蜜雪冰橙 · 打工摇奶茶');
opPeople([[TEA.x - .9, 314.5, 0, '#f1c40f', '#f1c9a5', '#2e3a52'], [TEA.x - .9, 313.4, 0, '#2d5d8a', '#d9a37c', '#1f1f22'], [TEA.x - 1, 312.3, .2, '#ff8fab', '#e8b98f', '#55657a']]);
function teaDraw(){
  const g = TEA.g; if (!g) return;
  $('#teaO').innerHTML = g.order.map((k, i) => `<span class="${i < g.step ? 'ok' : i === g.step && g.phase === 'mix' ? 'now' : ''}">${TEA_ING[k]}</span>`).join('') + `<span class="${g.phase === 'shake' ? 'now' : ''}">摇</span>`;
  $('#teaS').textContent = g.pts + ' 分'; $('#teaK').disabled = g.phase !== 'shake';
}
function teaNext(){
  const g = TEA.g; g.order = [...Array(g.cups >= 6 ? 4 : 3)].map(() => (Math.random() * 4) | 0); g.step = 0; g.phase = 'mix'; g.pat = 1; g.patDur = Math.max(5, 9 - g.cups * .25);
  g.needle = Math.random(); g.dir = Math.random() < .5 ? 1 : -1;
  $('#teaWho').textContent = TEA_WHO[(Math.random() * TEA_WHO.length) | 0] + '点了一杯：'; teaDraw();
}
function teaMiss(){ const g = TEA.g; g.pat -= .16; tone('square', 200, 150, .12, .07); const el = $('#opBody'); el.classList.remove('tea-miss'); void el.offsetWidth; el.classList.add('tea-miss'); }
function teaTap(i){
  const g = TEA.g; if (!g || g.phase !== 'mix' || i == null) return; ac();
  if (i === g.order[g.step]){ g.step++; tone('triangle', 620 + g.step * 110, 620 + g.step * 110, .09, .1); if (g.step >= g.order.length) g.phase = 'shake'; teaDraw(); }
  else teaMiss();
}
function teaShake(){
  const g = TEA.g; if (!g || g.phase !== 'shake') return; ac();
  const off = Math.abs(g.needle - .5);
  if (off > .11){ teaMiss(); return; }
  const perfect = off <= .04; g.cups++; g.pts += perfect ? 2 : 1; if (perfect) g.perfect++;
  noise(.16, .12, 2600, 'highpass'); tone('triangle', perfect ? 1320 : 990, perfect ? 1760 : 990, .16, .12);
  $('#teaWho').textContent = perfect ? '完美！顾客多给了小费' : '做好了，下一位';
  teaNext();
}
function teaTick(now){
  const g = TEA.g; if (!g) return;
  const dt = Math.min(.1, (now - g.last) / 1000); g.last = now;
  g.left -= dt; g.pat -= dt / g.patDur;
  if (g.phase === 'shake'){ g.needle += g.dir * dt * (1.35 + g.cups * .03); if (g.needle > 1){ g.needle = 1; g.dir = -1; } else if (g.needle < 0){ g.needle = 0; g.dir = 1; } }
  if (g.pat <= 0){ tone('sawtooth', 260, 140, .25, .07); teaNext(); $('#teaWho').textContent = '等太久，上一位走了。' + $('#teaWho').textContent; }
  $('#teaT').textContent = Math.max(0, Math.ceil(g.left)) + ' 秒'; $('#teaTB').style.width = Math.max(0, g.left / TEA_DUR * 100) + '%';
  $('#teaPB').style.width = Math.max(0, g.pat * 100) + '%'; $('#teaN').style.left = g.needle * 100 + '%';
  if (g.left <= 0) teaEnd(false);
}
function teaOpen(){
  TEA.g = {left:TEA_DUR, pts:0, cups:0, perfect:0, order:[], step:0, phase:'mix', pat:1, patDur:9, needle:0, dir:1, last:performance.now()};
  opOpen('蜜雪冰橙 · 打工摇奶茶',
    `<div class="tea-top"><span id="teaT">${TEA_DUR} 秒</span><b id="teaS">0 分</b></div><div class="tea-bar"><i id="teaTB"></i></div>
     <div class="tea-who" id="teaWho"></div><div class="tea-order" id="teaO"></div><div class="tea-bar pat"><i id="teaPB"></i></div>
     <div class="tea-grid" id="teaG">${TEA_ING.map((n, i) => `<button type="button" data-i="${i}">${n}<kbd>${i + 1}</kbd></button>`).join('')}</div>
     <div class="tea-meter" aria-hidden="true"><i class="g"></i><i class="p"></i><i class="n" id="teaN"></i></div>
     <button type="button" class="tea-shake" id="teaK" disabled>摇一摇 <kbd>空格</kbd></button>
     <p class="op-note" style="margin-top:8px">照着订单按顺序加料，再在指针走进绿色时摇。压在正中间是「完美」，算 2 分。金牌 ${TEA_MEDAL[0]} 分。</p>`,
    code => { if (code === 'Space' || code === 'Enter') teaShake(); else teaTap(OP_DIGIT[code]); }, () => teaEnd(true), teaTick);
  $('#teaG').addEventListener('pointerdown', e => { const b = e.target.closest('[data-i]'); if (b){ e.preventDefault(); teaTap(+b.dataset.i); } });
  $('#teaK').addEventListener('pointerdown', e => { e.preventDefault(); teaShake(); });
  teaNext(); sfx.ding();
}
function teaEnd(quit){
  const g = TEA.g; if (!g) return; TEA.g = null; TEA.S.rearm = true; opClose(true);
  if (quit){ toast('提前下班了', '这一班不算工钱', 2200); return; }
  const score = g.pts; let medal = 3; for (let i = 0; i < 3; i++) if (score >= TEA_MEDAL[i]){ medal = i; break; }
  const prev = prog.best.o_tea, rec = prev == null || score > prev; if (rec) prog.best.o_tea = score;
  let pay = (medal < 3 ? TEA_PAY[medal] : 8) + score; if (rec && prev != null) pay += 15;
  sess.acts++; if (medal < 3) sess.medals++;
  earn(pay); saveGame();
  const loot = window.XParts ? XParts.reward('tea', medal, '打工' + (GX_MEDAL[medal] || '')) : [];   /* 改装零件, js/93-tuning-ui.js */
  toast(medal < 3 ? `${GX_MEDAL[medal]} · 蜜雪冰橙打工` : '下班了', `做了 ${g.cups} 杯（${g.perfect} 杯完美）· ${score} 分${rec ? (prev != null ? ' · 新纪录！' : '') : ` · 纪录 ${prev} 分`} · 工钱 +RM ${pay}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 3800);
  if (medal < 3){ gxCallout(GX_MEDAL[medal], score + ' 分', OP_MEDAL_C[medal]); opFanfare(); } else sfx.ding();
  if (medal === 0){ unlock('gold'); unlock('tea'); }
}
function teaUpdate(px, pz, free){
  if (opRing(TEA.S, free && Math.abs(px - TEA.S.x) < 300 && Math.abs(pz - TEA.S.z) < 300, px, pz)){
    if (driving) opMsg = '打工要下车：走到蜜雪冰橙门口的圈里';
    else if (nw.state !== 'fly' && !nw.air){
      if (typeof offerJob !== 'function') teaOpen();
      else offerJob('tea', () => ({icon:'🧋', title:'蜜雪冰橙 · 打工摇奶茶', desc:'照订单按顺序加料，指针到绿色时摇', accept:'开工', time:TEA_DUR, pay:'金牌 RM ' + TEA_PAY[0] + '+',
        risk:prog.best.o_tea != null ? `纪录 ${prog.best.o_tea} 分 · 金牌 ${TEA_MEDAL[0]} 分` : `金牌 ${TEA_MEDAL[0]} 分`, onAccept:() => { if (!driving && !opUI.on) teaOpen(); }}));
    }
  }
}

/* ---------- Bell 夜市: stalls along the back lane, only at night ---------- */
const NM_X = [150, 180, 210, 240, 270, 300, 330, 360, 390], NM_Z = 370.4;
const NM_SNACK = {1:'炸鸡排', 3:'烤肠', 4:'榴莲球', 6:'糖葫芦', 7:'叻沙'};
const NM = {k:0, eaten:new Set(), cols:[], lbls:{}, done:false, g:new THREE.Group()};
{
  const st = [], glow = [], pool = [], rr = mkRng(8086), awn = ['#d7262d', '#2d8a6e', '#f08a1c', '#2d5d8a', '#c46bff', '#e0b020'], food = ['#f5d7a1', '#d9534f', '#f0ad4e', '#8fce6a', '#ffffff', '#c98a55'];
  NM_X.forEach((x, i) => {
    const col = awn[i % awn.length];
    tbox(st, 4.2, .9, 1.4, x, .45, NM_Z, '#a9825a'); tbox(st, 4.3, .62, .06, x, .6, NM_Z - .74, col);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tbox(st, .08, 2.7, .08, x + sx * 2.1, 1.35, NM_Z + sz * .95, '#d8d2c8');
    for (let k = 0; k < 6; k++) tbox(st, .74, .08, 2.5, x - 1.85 + k * .74, 2.72, NM_Z, k % 2 ? '#f4f1ea' : col);
    for (let k = 0; k < 6; k++) tbox(st, .42, .16 + rr() * .2, .42, x - 1.6 + k * .64, 1 + rr() * .05, NM_Z - .15 + (rr() - .5) * .5, food[(rr() * food.length) | 0]);
    tbox(glow, .42, .5, .42, x - 2.1, 2.25, NM_Z - 1.05, '#ff5340'); tbox(glow, .42, .5, .42, x + 2.1, 2.25, NM_Z - 1.05, '#ff5340');
    pool.push(new THREE.CircleGeometry(5, 20).rotateX(-Math.PI / 2).translate(x, .08, NM_Z - 1.6));
    const c = addBox(x, NM_Z, 2.2, .8, 0); c.dead = true; NM.cols.push(c);
    if (NM_SNACK[i]){ const L = addLabel('夜市 · ' + NM_SNACK[i], x, 3.6, NM_Z - 1, true); L.dead = true; NM.lbls[i] = L; }
  });
  for (let x = 146; x <= 394; x += 1.6) tbox(glow, .22, .22, .22, x, 2.62 - Math.abs(Math.sin((x - 150) / 30 * Math.PI)) * .3, NM_Z - 1.05, ['#ffd98a', '#ffb0a0', '#bfe3ff', '#d6ffb0'][(x * 5 | 0) % 4]);
  /* only ever seen at night: the stalls are drawn flat, as if lit by their own lamps, with a warm pool of light on the ground in front */
  NM.g.add(new THREE.Mesh(geoMerge(st), new THREE.MeshBasicMaterial({color:'#d9cdbd', vertexColors:true})), new THREE.Mesh(geoMerge(glow), new THREE.MeshBasicMaterial({vertexColors:true})),
    new THREE.Mesh(geoMerge(pool), new THREE.MeshBasicMaterial({color:'#ffb060', transparent:true, opacity:.2, depthWrite:false, blending:THREE.AdditiveBlending, polygonOffset:true, polygonOffsetFactor:-14, polygonOffsetUnits:-56})));
  const sign = opSign(8, 1.5, 512, 96, (g, w, h) => { g.fillStyle = '#7a1420'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd98a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${OUT_FONT}`; g.fillText('Bell 夜市 · Pasar Malam', w / 2, h / 2 + 4, w - 24); }, {emissive:'#ffffff', emissiveIntensity:.9});
  sign.material.emissiveMap = sign.material.map; sign.rotation.y = Math.PI; sign.position.set(270, 4.1, NM_Z - 1.3); NM.g.add(sign);
  const ppl = []; NM_X.forEach((x, i) => { if (i % 2 === 0 || NM_SNACK[i]) ppl.push([x + (rr() - .5) * 2.4, NM_Z - 1.9 - rr() * .5, (rr() - .5) * .5, SHIRTS[(rr() * SHIRTS.length) | 0], SKIN[(rr() * SKIN.length) | 0], PANTS[(rr() * PANTS.length) | 0]]);
    ppl.push([x + (rr() - .5) * 1.6, NM_Z + 1.15, Math.PI + (rr() - .5) * .4, '#ecf0f1', SKIN[(rr() * SKIN.length) | 0], '#1f1f22']); });
  { const m = opPeople(ppl, NM.g); m.material.emissive.set('#6a4a2c'); m.material.emissiveIntensity = .7; m.castShadow = false; }
  NM.g.visible = false; NM.g.scale.y = .001; scene.add(NM.g);
}
NM.S = gxMarker('#ff8a3d', .3);
/* 大胃王争霸赛: the red ring by the empty stall in the middle; the contest itself is js/minigames/bigeat.js on the mini-game platform (js/91-arcade.js) */
const BE = {near:false, door:{x:300, z:NM_Z - 7.5, h:Math.PI, name:'夜市'}};
BE.S = opSpot('#ff3d5a', .45, 300, NM_Z - 3.6, '大胃王争霸赛 · 开吃'); opHide(BE.S);
function beOpen(){
  if (!window.XMini || !XMini.startAt || !window.XBigEat) return;
  const X = XBigEat, go = i => { if (!X.open(i)) return; opClose(true); XMini.startAt('bigeat_' + X.OPS[i].id, BE.door); };
  let next = 0; X.OPS.forEach((o, i) => { if (X.open(i)) next = i; });
  const rows = X.OPS.map((o, i) => {
    const id = 'bigeat_' + o.id, g = XMini.games.find(x => x.id === id), best = XMini.best(id), md = g && best != null ? g.medals.findIndex(m => best <= m) : -1, on = X.open(i);
    return `<button type="button" class="op-card" data-i="${i}"${on ? '' : ' disabled style="opacity:.5;cursor:default"'}><kbd>${i + 1}</kbd><b>${on ? '' : '🔒 '}${o.name} · ${o.who}</b>
      <span>${on ? o.line : '先吃赢' + X.OPS[i - 1].name + '才能挑战'}</span>
      <span>${best != null ? `最好 <em>${(best / 10).toFixed(1)} 秒</em>${md >= 0 ? ' ' + ['🥇', '🥈', '🥉'][md] : ''} · ` : ''}${o.menu.length} 盘 · 金牌 ${(o.medals[0] / 10).toFixed(0)} 秒内吃完</span></button>`;
  }).join('');
  opOpen('🍢 大胃王争霸赛', `<p class="op-note">站到长桌一头，和对手比吃夜市小吃，谁先吃完谁赢。<b>狂点「吃」</b>，点太快会噎住；椰浆饭、叻沙越吃越辣，<b>辣了喝水</b>（一局 3 杯）。赢一位解锁下一位。</p>${rows}`,
    code => { if (code === 'KeyF' || code === 'Enter' || code === 'Space') go(next); else if (/^Digit[1-3]$/.test(code)) go(+code.slice(5) - 1); });
  for (const b of document.querySelectorAll('#opBody .op-card')) b.addEventListener('click', () => go(+b.dataset.i));
}
function beUpdate(px, pz, free){
  const was = BE.near; BE.near = false;
  const other = mission.on || !!gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in);
  if (opRing(BE.S, NM.k > .9 && free && !other && !!window.XBigEat && Math.abs(px - BE.S.x) < 300 && Math.abs(pz - BE.S.z) < 300, px, pz)){
    if (driving) opMsg = '下车走进圈里，参加大胃王争霸赛';
    else if (nw.state !== 'fly'){ BE.near = true; opMsg = TOUCH ? '点「开吃」参加大胃王争霸赛' : '按 F 参加大胃王争霸赛'; opSetF('开吃'); }
  }
  if (was && !BE.near && opFBtn === '开吃') opSetF('');
}
if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ if (BE.near && !driving && nw.state !== 'fly'){ beOpen(); return true; } return base(); }; }
/* the stalls are there in every mode (walking, bird's-eye), so they run on their own frame callback */
(function nmFrame(){
  if (mode !== 'naiwa' && BE.S.mark.visible){ opHide(BE.S); BE.near = false; }
  const want = opNight() && Math.abs(camera.position.x - 270) < 700 && Math.abs(camera.position.z - 370) < 700 ? 1 : 0;
  if (NM.k !== want){
    NM.k = Math.abs(want - NM.k) < .02 ? want : NM.k + (want - NM.k) * .06;
    NM.g.visible = NM.k > .01; NM.g.scale.y = Math.max(.001, NM.k);
    for (const c of NM.cols) c.dead = NM.k < .5;
    if (!want && NM.k < .5 && NM.eaten.size){ NM.eaten.clear(); NM.done = false; }
  }
  requestAnimationFrame(nmFrame);
})();
function nmUpdate(px, pz, free){
  beUpdate(px, pz, free);
  const open = NM.k > .9 && free;
  let best = -1, bd = 1e9;
  for (const i in NM_SNACK){
    const left = open && !NM.eaten.has(i); NM.lbls[i].dead = !left; if (!left) continue;
    const d = Math.hypot(px - NM_X[i], pz - (NM_Z - 3)); if (d < bd){ bd = d; best = +i; }
  }
  NM.S.visible = best >= 0 && bd < 250;
  if (best < 0) return;
  NM.S.position.set(NM_X[best], .1, NM_Z - 3);
  if (bd > 2.6) return;
  if (driving){ opMsg = '下车走过去尝尝'; return; }
  NM.eaten.add(String(best)); const n = NM.eaten.size;
  gxCallout(NM_SNACK[best], `夜市小吃 ${n} / 5`, '#ff8a3d'); gxChime(n);
  for (let k = 0; k < 5; k++) spawnPart('heart', px + (rnd() - .5) * 2, 2.4 + rnd(), pz + (rnd() - .5) * 2, .8, {vy:2.2, life:1.2, op:1, color:'#ff6fa3'});
  if (n >= 5 && !NM.done){
    NM.done = true; const d = new Date(), day = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(), first = prog.best.o_nm !== day, pay = first ? 40 : 10;
    prog.best.o_nm = day; earn(pay); opFanfare(); unlock('nmkt');
    toast('夜市吃了个遍', first ? `五种小吃全打卡 · 摊主们凑了 RM ${pay} 请你当回头客` : `今晚又吃了一轮 · +RM ${pay}`, 3200);
  }
}

/* ---------- 偷外卖的小偷 ----------
 * 抢你的单：送外卖（食堂的单、跨区单、得来速）途中，小偷会从前面冲过来。开得快（54 km/h 以上）他抢不到，还会被撞飞；
 *   慢下来或下了车就会被抢走。被抢之后倒计时照走：追上去，水枪淋他、开车撞倒他，走到身边按 F 把外卖拿回来接着送。
 *   没追回来这单就没钱，店铺信用掉一颗星（信用影响每单的报酬）。
 * 偷别人的单：取餐点门口也有人偷别人的外卖，抓到有悬赏、涨信用。Bell 路口的通缉榜可以直接接悬赏。
 * 通缉榜六个人，抓完一轮下一轮跑得更快；后面的会急转弯、钻小巷。 */
const TH_LIST = [
  {name:'顺手牵羊小李', ride:'foot', v:7.2, bounty:40},
  {name:'抢单飞毛腿', ride:'foot', v:8.6, bounty:55, juke:true},
  {name:'电驴阿强', ride:'bike', v:13.5, bounty:80},
  {name:'小巷泥鳅', ride:'foot', v:9.4, bounty:95, juke:true, alley:true},
  {name:'飞车党老 K', ride:'bike', v:16.5, bounty:120, alley:true},
  {name:'外卖大盗饿魔', ride:'bike', v:18.5, bounty:180, juke:true, alley:true}
];
const TH = {on:false, st:'', own:null, carry:false, quiet:false, who:null, lap:0, x:0, z:0, h:0, fv:0, bv:0, mode:'', down:0, slow:0, t:0, t0:0, tgt:null, retT:0, walk:0, cd:45, bounty:0, said:false, nodes:null,
  hunt:0, missed:false, had:false, at:-1, footT:0, tries:0, burst:0, side:1};
const opOrder = () => DT.st === 'go' ? DT.job : mission.on ? mission : null;   /* the order in hand: both have t, to, stolen */
const opCred = () => prog.best.o_cred == null ? 5 : Math.max(0, Math.min(5, prog.best.o_cred | 0));
const opCredTxt = () => '★'.repeat(opCred()) + '☆'.repeat(5 - opCred());
function opCredAdd(d){ prog.best.o_cred = Math.max(0, Math.min(5, opCred() + d)); saveGame(); if (typeof thBoard !== 'undefined') thBoard.userData.paint(); }
function outCred(){ return .85 + .03 * opCred(); }   /* js/50-missions.js: pay multiplier from 店铺信用 (5 stars = full pay) */
const thFig = (() => {
  const g = new THREE.Group(), mk = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; (par || g).add(m); return m; };
  const dark = M('#26262b', {roughness:.8}), skin = M('#e0ac84', {roughness:.7}), body = new THREE.Group(); g.add(body);
  mk(npcBodyGeo, M('#3b3b44', {roughness:.8}), 0, 0, 0, body); mk(npcHeadGeo, skin, 0, 0, 0, body);
  mk(geoMerge([0, 1, 2].map(i => pplBand(1.02 + i * .13, .055, .006))), M('#e8e6df', {roughness:.8}), 0, 0, 0, body);   /* striped jumper: white bands hugging the torso (js/86-guard.js) */
  mk(pplHeadBand(1.645, .065, .008), M('#111111', {roughness:.6}), 0, 0, 0, body); mk(new THREE.SphereGeometry(.16, 12, 6, 0, 6.3, 0, 1.5), dark, 0, 1.66, 0, body);   /* bandit eye mask and beanie */
  const bag = mk(new THREE.BoxGeometry(.42, .4, .3), M('#ff8a3d', {roughness:.6, emissive:'#7a3008', emissiveIntensity:.5}), 0, 1.22, -.3, body);   /* the stolen takeaway */
  const legs = [-1, 1].map(s => mk(npcLegGeo, M('#2e3a52', {roughness:.8, vertexColors:true}), s * .09, .92, 0, body));
  const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .215, 1.39, 0); a.rotation.z = s * .1; mk(npcSleeveGeo, M('#3b3b44'), 0, 0, 0, a); mk(npcForeGeo, skin, 0, 0, 0, a); body.add(a); return a; });
  const bike = new THREE.Group(), tyre = M('#1c1c1e', {roughness:.7}), frame = M('#2f9e8f', {roughness:.5, metalness:.3});
  /* e-scooter: tyres with grey hubs, a rounded deck, the battery hump over the back wheel, a round stem and bar with grips */
  const hub = M('#9aa0a6', {roughness:.4, metalness:.4});
  for (const z of [-.55, .6]){ const w = mk(new THREE.CylinderGeometry(.24, .24, .1, 14), tyre, 0, .24, z, bike); w.rotation.z = Math.PI / 2; const hb = mk(new THREE.CylinderGeometry(.11, .11, .12, 10), hub, 0, .24, z, bike); hb.rotation.z = Math.PI / 2; }
  mk(roundBox(.3, .08, 1.0, .035, 2), frame, 0, .3, 0, bike); mk(roundBox(.34, .5, .2, .06, 2), frame, 0, .55, -.45, bike);
  mk(new THREE.CylinderGeometry(.035, .035, .9, 8), frame, 0, .75, .55, bike).rotation.x = -.25;
  const bar = mk(new THREE.CylinderGeometry(.025, .025, .6, 8), tyre, 0, 1.2, .44, bike); bar.rotation.z = Math.PI / 2;
  g.add(bike); g.scale.setScalar(1.3); g.visible = false; scene.add(g);
  return {g, body, legs, arms, bike, bag};
})();
const thLbl = addLabel('小偷', 0, 0, 0, true); thLbl.dead = true;
const thFree = (x, z, r) => !hitsBuilding(x, z, r) && !outOfMap(x, z, r) && !lakes.some(L => inPoly(x, z, L));
function thLos(ax, az, bx, bz, r){
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
  for (let i = 1; i < n; i++) if (!thFree(ax + (bx - ax) * i / n, az + (bz - az) * i / n, r)) return false;
  return true;
}
/* places to run to: along every road, through the Bell Avenue walk-through lanes, around the KIP car park */
function thBuildNodes(){
  const seen = new Set(), out = [];
  const add = (x, z, alley) => { const k = Math.round(x / 8) + ',' + Math.round(z / 8); if (seen.has(k) || !thFree(x, z, 1)) return; seen.add(k); out.push({x, z, alley:!!alley}); };
  for (const ax of [229.5, 322]) for (const z of [311, 323, 335, 347, 359]) add(ax, z, true);
  for (let x = -775; x <= -565; x += 30) for (const z of [876, 899, 917]) add(x, z, false);
  for (let x = -745; x <= -560; x += 34) add(x, 931, true);
  for (const x of [-794.8, -770.5, -746.2, -735.5, -700.5]) for (const z of [1060, 1086, 1112]) add(x, z, true);   /* KIP Sentral: lanes and alleys */
  for (const s of roadSegs){
    const n = Math.max(1, Math.round(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 28));
    for (let i = 0; i <= n; i++) add(s.a[0] + (s.b[0] - s.a[0]) * i / n, s.a[1] + (s.b[1] - s.a[1]) * i / n, false);
  }
  TH.nodes = out;
}
/* the node that takes the thief farthest from the player while staying in clear sight of where he is now */
function thPick(px, pz){
  const ax = TH.x - px, az = TH.z - pz, al = Math.hypot(ax, az) || 1, c = [];
  for (const n of TH.nodes){
    const dx = n.x - TH.x, dz = n.z - TH.z, d = Math.hypot(dx, dz);
    if (d < 12 || d > 120) continue;
    c.push([Math.hypot(n.x - px, n.z - pz) - d * .55 + (dx * ax + dz * az) / (d * al) * 30 + (n.alley && TH.who.alley ? 45 : 0) + rnd() * 14, n]);
  }
  c.sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < Math.min(12, c.length); i++) if (thLos(TH.x, TH.z, c[i][1].x, c[i][1].z, .7)) return c[i][1];
  return c.length ? c[0][1] : {x:TH.x + ax / al * 40, z:TH.z + az / al * 40};   /* nothing in plain sight: head for the best one and steer around what is in the way */
}
/* the heading nearest to `want` with a clear run ahead */
function thSteer(want, x, z, look, r){
  for (const a of [0, .45, -.45, .9, -.9, 1.5, -1.5, 2.2, -2.2, Math.PI]){
    const h = want + a, sx = Math.sin(h), cz = Math.cos(h);
    if (thFree(x + sx * look * .5, z + cz * look * .5, r) && thFree(x + sx * look, z + cz * look, r)) return h;
  }
  return want;
}
function thMove(dt, tx, tz, v){
  const T = TH, bike = T.mode === 'bike', h = thSteer(Math.atan2(tx - T.x, tz - T.z), T.x, T.z, bike ? 7 : 3.5, .7);
  T.h += opAng(h - T.h) * Math.min(1, dt * (bike ? 5 : 9)); T.walk += dt * v * 1.5;
  const nx = T.x + Math.sin(T.h) * v * dt, nz = T.z + Math.cos(T.h) * v * dt;
  if (!thFree(nx, nz, .6)) return false;
  T.x = nx; T.z = nz; return true;
}
const thAlarm = () => { tone('square', 880, 660, .18, .09); tone('square', 880, 660, .18, .09, .22); };
/* kind 'hunt': he comes for the order in your hands; 'shop': he has just grabbed someone else's order at `spot` and runs */
function thSpawn(kind, px, pz, spot){
  if (!TH.nodes) thBuildNodes();
  const n = opN('o_thief'), who = TH_LIST[n % TH_LIST.length], lap = Math.floor(n / TH_LIST.length), hunt = kind === 'hunt';
  let nd = null;
  if (hunt){
    /* from ahead, where you can see him coming */
    const o = opOrder(), c = driving, sp = c ? Math.hypot(c.vx, c.vz) : 0; let fx = o.to.x - px, fz = o.to.z - pz; if (c && sp > 4){ fx = c.vx; fz = c.vz; }
    const fl = Math.hypot(fx, fz) || 1, cand = [];
    for (const q of TH.nodes){ const dx = q.x - px, dz = q.z - pz, d = Math.hypot(dx, dz); if (d > 45 && d < 85 && !q.alley) cand.push([(dx * fx + dz * fz) / (d * fl) + rnd() * .3, q]); }
    cand.sort((a, b) => b[0] - a[0]); const zone = opZone(px, pz);
    nd = (cand.find(q => thLos(q[1].x, q[1].z, px, pz, .7)) || cand.find(q => opZone(q[1].x, q[1].z) === zone) || [])[1];   /* somewhere he can actually get to you from */
    if (!nd) return false;
  } else {
    let bd = 30; for (const q of TH.nodes){ const d = Math.hypot(q.x - spot.x, q.z - spot.z); if (d < bd){ bd = d; nd = q; } }
    if (!nd) return false;
  }
  const mode = hunt ? (driving ? 'bike' : who.ride) : who.ride, bounty = Math.round(who.bounty * (1 + .3 * lap) / 5) * 5;
  Object.assign(TH, {on:true, st:hunt ? 'hunt' : 'run', own:null, carry:!hunt, quiet:false, who, lap, x:nd.x, z:nd.z, h:Math.atan2(px - nd.x, pz - nd.z), mode, down:0, slow:0, tgt:null, retT:0, bounty, said:false, hunt:14, missed:false, burst:0, side:rnd() < .5 ? 1 : -1,
    fv:Math.min(10.3, (who.ride === 'foot' ? who.v : 8.4) * (1 + .06 * lap)), bv:Math.min(21, (who.ride === 'bike' ? who.v : 13) * (1 + .06 * lap))});
  TH.t = TH.t0 = mode === 'bike' ? 70 : 55;
  thFig.g.visible = true; thFig.bike.visible = mode === 'bike'; thFig.bag.visible = !hunt; thLbl.dead = false; thLbl.el.textContent = '小偷 · ' + who.name;
  for (let i = 0; i < 6; i++) spawnPart('excl', nd.x + (rnd() - .5) * 3, 2.6 + rnd(), nd.z + (rnd() - .5) * 3, 1, {vy:1.6, life:1.2, op:1, color:'#e74c3c'});
  thAlarm();
  if (hunt){
    gxCallout('小偷盯上你的外卖了！', driving ? '开快点甩掉他' : '快跑，或者用水枪淋他', '#e84d8a');
    if (!opN('o_thTip')){ prog.best.o_thTip = 1; opLater('有小偷想抢你的外卖', '车速 54 以上他抢不到，还会被你撞飞。被抢了就追上去：水枪淋他，走到身边按 F 拿回来', 5200); }
  } else {
    gxCallout('抓小偷！', who.name, '#e84d8a');
    opLater('抓小偷！' + who.name, `偷了别人在「${spot.name}」的外卖，正在${mode === 'bike' ? '骑电动车' : '徒步'}逃跑 · 悬赏 RM ${bounty} · ${mode === 'bike' ? '开车撞倒他，或用水枪淋他' : '追上去按 F，水枪能让他踉跄'}`, 4200);
  }
  return true;
}
function thEnd(){
  if (TH.own){ TH.own.stolen = false; TH.own = null; }
  TH.on = false; thFig.g.visible = false; thLbl.dead = true; if (!opOrder()) missionEl.classList.remove('urgent'); if (opFBtn === '抓住') opSetF(''); TH.cd = 70 + rnd() * 40;
}
/* he has your order now: the delivery clock keeps running */
function thSnatch(o){
  o.stolen = true; Object.assign(TH, {own:o, carry:true, st:'run', tgt:null, retT:0, said:true, burst:1.6});   /* he darts off: for a moment only the water gun can touch him */ thFig.bag.visible = true;
  camShake = Math.max(camShake, 1.4); if (!REDUCED) gxSlow = .7; sfx.fail(); thAlarm();
  for (let i = 0; i < 8; i++) spawnPart('excl', TH.x + (rnd() - .5) * 2, 2.4 + rnd(), TH.z + (rnd() - .5) * 2, 1, {vy:2, life:1, op:1, color:'#e74c3c'});
  toastEl.classList.remove('show'); gxCallout('外卖被抢了！', '追上去拿回来', '#e84d8a');   /* nothing may cover this one */
  opLater('外卖被' + TH.who.name + '抢走了', (TOUCH ? '倒计时还在走：追上他，点「水枪」淋他，走到身边点「抓住」' : '倒计时还在走：追上他，E 水枪淋他，走到身边按 F 拿回来') + (driving ? '，开车撞倒他更快' : ''), 4200);
}
/* the order is gone for good: no pay, one star of 店铺信用 */
function thLost(cancel){
  const o = TH.own; TH.own = null;
  if (o){ o.stolen = false; if (cancel){ if (o === mission) mission.on = false; else dtEnd(); } }
  opCredAdd(-1); sfx.fail(); camShake = Math.max(camShake, .8); toastEl.classList.remove('show'); gxCallout('被偷走了', '店铺信用 ' + opCredTxt(), '#e84d8a');
  opLater('外卖没追回来', `${TH.who.name}带着外卖跑了，这单没钱 · 店铺信用 ${opCredTxt()}`, 3400); thEnd();
}
function thCatch(){
  const n = opAdd('o_thief'), who = TH.who, o = TH.own, quick = !o && TH.carry && TH.t > TH.t0 * .6, pay = TH.bounty + (quick ? 15 : 0), done = n % TH_LIST.length;
  earn(pay); opFanfare(); camShake = Math.max(camShake, .5); if (!REDUCED) gxSlow = .35; addStunt('抓住小偷', 300);
  for (let i = 0; i < 8; i++) spawnPart('heart', TH.x + (rnd() - .5) * 4, 2 + rnd() * 2, TH.z + (rnd() - .5) * 4, .9, {vy:2.5, life:1.4, op:1, color:'#ff6fa3'});
  /* 改装零件 (js/93-tuning-ui.js): a 涡轮 for every thief, clearing the whole board adds a 图纸 and a 赛道引擎核心 */
  const loot = window.XParts ? XParts.reward('thief', done ? 1 : 0, done ? '抓住小偷' : '清空 Bell 通缉榜') : [];
  const board = (done ? `通缉榜 ${done} / ${TH_LIST.length}` : '通缉榜清空了，下一轮的小偷跑得更快') + (loot.length ? ' · 改装：' + XParts.text(loot) : '');
  if (o){
    TH.own = null; o.stolen = false; o.recovered = true; o.t += 10;
    toastEl.classList.remove('show'); gxCallout('外卖拿回来了！', '接着送，顾客多等你 10 秒', '#55d08a'); opLater('抓住了 ' + who.name, `外卖拿回来了，接着送 · 悬赏 +RM ${pay} · ${board}`, 3800);
  } else {
    if (TH.carry) opCredAdd(1);
    gxCallout('抓住了！', `悬赏 +RM ${pay}`, '#55d08a');
    opLater('抓住了 ' + who.name, `${TH.carry ? '外卖还给了失主，店铺信用 ' + opCredTxt() + ' · ' : ''}悬赏 +RM ${pay}${quick ? '（含速战速决 +15）' : ''} · ${board}`, 3800);
  }
  unlock('thief1'); if (!done) unlock('wanted');
  thEnd(); thBoard.userData.paint();
}
/* knocked over (by a car, or tipped off the scooter): lies there for a moment, then gets up and runs on foot */
function thDown(sec, text, sub){
  TH.down = Math.max(2.4, sec - TH.lap * .3); TH.slow = TH.down + 1.5;   /* still dizzy for a moment after getting up */
  if (TH.mode === 'bike'){ TH.mode = 'foot'; thFig.bike.visible = false; }
  if (TH.st === 'hunt'){ TH.st = 'run'; TH.quiet = true; TH.t = TH.t0 = 30; }
  sfx.thud(.7); camShake = Math.max(camShake, .7); dustBurst(TH.x, .5, TH.z, 5, 2.5); if (text) gxCallout(text, sub, '#e84d8a');
}
/* water gun: staggers a runner, tips a scooter over */
function thSoak(power){
  if (!TH.on) return; const p = power > 0 ? power : 1;
  if (typeof splashAt === 'function') splashAt(TH.x, 1.5, TH.z); sfx.splash();
  if (TH.mode === 'bike') thDown(3 * p, '淋翻了！', '小偷从电动车上摔下来了');
  else { TH.slow = Math.max(TH.slow, 2.8 * p * Math.pow(.88, TH.lap)); gxCallout('淋到了', TH.st === 'hunt' ? '他没法抢了' : '小偷踉跄减速，快追', '#4aa3ff'); }
}
if (typeof wgAddTarget === 'function') wgAddTarget(() => TH.on ? [{x:TH.x, z:TH.z, hit:thSoak}] : []);
let thAmmo = typeof WG !== 'undefined' ? WG.ammo : 0;
/* where other people's orders get stolen: every pick-up ring, and the front of 麦当当 */
const TH_SHOPS = PICKUPS.map(p => ({name:p.name, x:p.x, z:p.z})).concat([{name:'麦当当', x:-520 + MDX, z:778 + MDZ}]);   /* the lot in front of 麦当当, beside Jalan Warisan Sentral 1 */
function thNearShop(px, pz, max){ let best = null, bd = max; for (const s of TH_SHOPS){ const d = Math.hypot(s.x - px, s.z - pz); if (d > 28 && d < bd){ bd = d; best = s; } } return best; }
function thUpdate(dt, px, pz, sp, free){
  /* fallback while js/87-classroom.js has no wgAddTarget yet: a shot fired (ammo went down) hits a thief in the front half within range */
  if (typeof WG !== 'undefined'){
    if (WG.ammo < thAmmo && TH.on && !driving && typeof wgAddTarget !== 'function'){
      const dx = TH.x - nw.x, dz = TH.z - nw.z, d = Math.hypot(dx, dz);
      if (d < 16 && Math.abs(opAng(Math.atan2(dx, dz) - nw.h)) < 1.6){ nw.h = Math.atan2(dx, dz); setTimeout(thSoak, Math.min(400, d * 25), 1); }
    }
    thAmmo = WG.ammo;
  }
  const ord = opOrder(), indoor = typeof ROOM !== 'undefined' && ROOM.in, T = TH;
  /* each order rolls once whether someone will come for it (never on your first two deliveries); stepping out of the car brings him at once */
  if (!ord) T.had = false;
  else if (!T.had){
    T.had = true; T.footT = 0; T.tries = 0; const far = ord === DT.job || !!ord.cross, lap = Math.floor(opN('o_thief') / TH_LIST.length);
    T.at = prog.life.deliv >= 2 && rnd() < Math.min(.75, (far ? .5 : .3) + .05 * lap) ? ord.t * (.8 - rnd() * .3) : -1;
  }
  if (ord && !T.on && T.at > 0 && !indoor && nw.state !== 'fly' && ord.t > 14){
    T.footT = driving ? 0 : T.footT + dt;
    if (ord.t <= T.at || T.footT > 1.5){ T.at = !thSpawn('hunt', px, pz) && ++T.tries < 3 ? ord.t - 5 : -1; T.footT = 0; }
  }
  if (!T.on){
    if (opRing(T.B, free && !indoor && Math.abs(px - T.B.x) < 300 && Math.abs(pz - T.B.z) < 300, px, pz)){
      if (sp > 6) opMsg = '慢一点，停下来看通缉榜';
      else {
        const take = () => { if (TH.on) return; T.B.rearm = true; const p = driving || nw, s = thNearShop(p.x, p.z, 500); if (!s || !thSpawn('shop', p.x, p.z, s)) toast('通缉榜', '附近暂时没有线索，过一会儿再来', 2000); };
        if (typeof offerJob !== 'function') take();
        else offerJob('wanted', () => { const n = opN('o_thief'), who = TH_LIST[n % TH_LIST.length], lap = Math.floor(n / TH_LIST.length);
          return {icon:'🚨', title:'通缉榜 · ' + who.name, desc:'偷了别人的外卖，抓住有悬赏' + (lap ? ` · 第 ${lap + 1} 轮，跑得更快` : ''), accept:'接悬赏', pay:Math.round(who.bounty * (1 + .3 * lap) / 5) * 5, time:who.ride === 'bike' ? 70 : 55,
            risk:(who.ride === 'bike' ? '骑电动车：开车撞或水枪淋' : '徒步：追上去，水枪能让他踉跄') + (who.alley ? ' · 会钻小巷' : who.juke ? ' · 会急转弯' : ''), onAccept:take}; });
      }
    }
    if (free && !indoor && heat < 1 && nw.state !== 'fly'){
      const s = thNearShop(px, pz, 130);
      if (s){ T.cd -= dt; if (T.cd <= 0) T.cd = thSpawn('shop', px, pz, s) ? 70 + rnd() * 40 : 8; }
    }
    return;
  }
  opHide(T.B);
  const dP = Math.hypot(px - T.x, pz - T.z);
  if (T.own && (ord !== T.own || !ord.stolen)){ thLost(false); return; }      /* the clock ran out while he had it */
  if (T.down > 0){
    T.down -= dt; T.slow -= dt; if (rnd() < dt * 5) spawnPart('dust', T.x + (rnd() - .5), 1.2 + rnd() * .5, T.z + (rnd() - .5), .35, {vy:1, life:.6, op:1, color:'#ffd24a'});
  } else if (T.st === 'hunt'){
    T.hunt -= dt; T.slow -= dt;
    if (!ord){ thEnd(); return; }
    const c = driving, lead = c ? .45 : .15, hv = T.mode === 'bike' ? Math.max(T.bv, 16.5) : Math.min(10.6, T.fv + 2.4);
    /* straight at you when he can see you; otherwise by way of the node in sight that is nearest to you */
    T.retT -= dt;
    if (T.retT <= 0){
      T.retT = .8; T.tgt = null;
      if (!thLos(T.x, T.z, px, pz, .7)){ let bd = dP; for (const q of T.nodes){ const d = Math.hypot(q.x - px, q.z - pz); if (d < bd && Math.hypot(q.x - T.x, q.z - T.z) < 70 && thLos(T.x, T.z, q.x, q.z, .7)){ bd = d; T.tgt = q; } } }
    }
    if (T.tgt && Math.hypot(T.tgt.x - T.x, T.tgt.z - T.z) < 4) T.tgt = null;
    /* a fast car he will not meet head-on: he swerves to pass alongside (steer into him to send him flying) */
    const off = c && sp >= 15 ? 3.2 * T.side / sp : 0;
    thMove(dt, T.tgt ? T.tgt.x : px + (c ? c.vx * lead + c.vz * off : 0), T.tgt ? T.tgt.z : pz + (c ? c.vz * lead - c.vx * off : 0), hv * (T.slow > 0 ? .35 : 1));
    if (dP < (c ? c.R + 1.3 : 1.7) && T.slow <= 0){
      if (c && sp >= 15){ thDown(5, '撞飞了！', TOUCH ? '想抢外卖？下车点「抓住」领悬赏' : '想抢外卖？下车按 F 领悬赏'); addStunt('撞飞小偷', 200); }
      else thSnatch(ord);
    } else if (!T.missed && c && sp >= 15 && dP < 6 && (T.x - px) * c.vx + (T.z - pz) * c.vz < 0){ T.missed = true; gxCallout('没抢到！', '保持车速，别让他追上', '#55d08a'); addStunt('甩开小偷', 120); tone('triangle', 990, 1320, .15, .1); }
    if (T.st === 'hunt' && T.hunt <= 0){ Object.assign(T, {st:'run', quiet:true, tgt:null, retT:0}); T.t = T.t0 = 25; gxCallout('甩掉了！', '小偷没得手，溜了', '#55d08a'); addStunt('甩掉小偷', 200); sfx.ding(); }
  } else {
    T.retT -= dt; T.slow -= dt; T.burst -= dt;
    if (!T.tgt || T.retT <= 0 || Math.hypot(T.tgt.x - T.x, T.tgt.z - T.z) < 5){ T.tgt = thPick(px, pz); T.retT = T.who.juke && dP < 16 ? .7 : 1.6; }
    if (!thMove(dt, T.tgt.x, T.tgt.z, (T.mode === 'bike' ? T.bv : T.fv) * (T.slow > 0 ? .35 : T.burst > 0 ? 1.5 : 1))) T.retT = Math.min(T.retT, .3);
    if (T.slow > 0 && rnd() < dt * 8) spawnPart('dust', T.x + (rnd() - .5) * .6, 2.2, T.z + (rnd() - .5) * .6, .3, {vy:-1.5, life:.5, op:.9, color:'#9fd8ff'});
    if (driving && sp > 5 && dP < driving.R + 1 && T.burst <= 0){ thDown(5, '撞倒了！', TOUCH ? '下车点「抓住」' : '下车按 F 抓住'); addStunt('撞倒小偷', 150); }   /* a car at speed knocks him over */
  }
  /* the figure */
  const f = thFig, lying = T.down > 0, bike = T.mode === 'bike', gy = groundAt(T.x, T.z), sw = lying || bike ? 0 : Math.sin(T.walk) * .8;
  f.g.position.set(T.x, gy + (lying ? .25 : 0), T.z); f.g.rotation.set(0, T.h, 0); f.bag.visible = T.carry;
  f.body.rotation.set(lying ? -Math.PI / 2 : bike ? .12 : .18, 0, T.slow > 0 && !lying ? Math.sin(performance.now() / 70) * .22 : 0); f.body.position.set(0, bike && !lying ? .22 : lying ? .2 : 0, lying ? .9 : 0);
  f.legs[0].rotation.x = sw; f.legs[1].rotation.x = -sw; f.arms[0].rotation.x = bike ? -1.1 : T.st === 'hunt' ? -1.3 : -sw; f.arms[1].rotation.x = bike ? -1.1 : T.st === 'hunt' ? -1.3 : sw;
  thLbl.pos.set(T.x, gy + 3.2, T.z);
  const can = (T.st === 'run' && T.burst <= 0) || lying || T.slow > 0;
  if (can && dP < 3.2){
    if (driving) opMsg = TOUCH ? '点「下车」，再点「抓住」' : '按 F 下车，再按 F 抓住他';
    else { opMsg = TOUCH ? '点「抓住」！' : '按 F 抓住小偷！'; opSetF('抓住'); }
  } else if (opFBtn === '抓住') opSetF('');
  if (T.own){
    if (dP > 240){ thLost(true); return; }
    if (!driving && dP > 30 && dP < 90 && T.mode === 'bike') opMsg = '他骑着电动车：回车上追，或者等他近了用水枪';
    return;
  }
  if (T.st !== 'run') return;
  T.t -= dt;
  if (!ord){
    missionEl.textContent = `${Math.max(0, Math.ceil(T.t))} 秒 · 抓小偷 · 悬赏 RM ${T.bounty} · ${T.who.name} · ${Math.round(dP)} 米`;
    missionEl.classList.toggle('urgent', T.t < 12);
    if (!T.said && dP < 30 && !driving && !T.down){ T.said = true; if (typeof WG !== 'undefined') toast('小偷：追不上追不上～', TOUCH ? '点「水枪」淋他，他会踉跄' : '按 E 用水枪淋他，他会踉跄', 2000); }
  }
  if (T.t <= 0 || dP > 280){
    if (!T.quiet){ sfx.fail(); toast(T.who.name + '跑掉了', (T.t <= 0 ? '没在时间内抓住' : '跟丢了') + '，别人的外卖没追回来', 2600); }
    thEnd();
  }
}
/* the F button label on phones (js/87-classroom.js resets it every frame, so setting it after that wins) */
function opSetF(t){ opFBtn = t; if (typeof setFLabel === 'function') setFLabel(t); }
function opTryF(){
  if (KM.near && !driving && nw.state !== 'fly'){ kmOpen(); return true; }
  if (TH.on && ((TH.st === 'run' && TH.burst <= 0) || TH.down > 0 || TH.slow > 0) && !driving && nw.state !== 'fly' && Math.hypot(nw.x - TH.x, nw.z - TH.z) < 3.4){ thCatch(); return true; }
  return false;
}
if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ return base() || opTryF(); }; } else window.roomTryF = opTryF;

/* the wanted board by the crossing outside the gate: stop at it to take the next bounty */
const thBoard = opSign(3, 3.75, 512, 640, (g, w, h) => {
  const n = opN('o_thief'), done = n % TH_LIST.length, lap = Math.floor(n / TH_LIST.length);
  g.fillStyle = '#efe3c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a2a1c'; g.fillRect(0, 0, w, 96);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe9b0'; g.font = `900 52px ${OUT_FONT}`; g.fillText('通缉榜 · 偷外卖的', w / 2, 50);
  TH_LIST.forEach((t, i) => {
    const y = 138 + i * 72, got = i < done;
    g.textAlign = 'left'; g.fillStyle = got ? '#9a8f78' : '#2a2018'; g.font = `700 36px ${OUT_FONT}`; g.fillText(`${i + 1}. ${t.name}`, 28, y);
    g.textAlign = 'right'; g.font = `700 30px ${OUT_FONT}`; g.fillStyle = got ? '#2f9e5b' : '#b5442a'; g.fillText(got ? '已落网' : 'RM ' + Math.round(t.bounty * (1 + .3 * lap) / 5) * 5, w - 26, y);
    if (got){ g.strokeStyle = '#9a8f78'; g.lineWidth = 3; g.beginPath(); g.moveTo(24, y); g.lineTo(w - 150, y); g.stroke(); }
  });
  g.textAlign = 'center'; g.fillStyle = '#7a2a1c'; g.font = `700 28px ${OUT_FONT}`; g.fillText(`第 ${lap + 1} 轮 · 店铺信用 ${opCredTxt()}`, w / 2, h - 66);
  g.font = `700 24px ${OUT_FONT}`; g.fillText('站到圈里接下一个悬赏', w / 2, h - 28);
});
thBoard.rotation.y = Math.PI; thBoard.position.set(138, 2.5, 299.4);
{ const wood = M('#7a5a3c', {roughness:.8}); box(3.3, 4.05, .12, wood, 138, 2.5, 299.5); box(.16, 4.6, .16, wood, 136.5, 2.3, 299.6); box(.16, 4.6, .16, wood, 139.5, 2.3, 299.6); addBox(138, 299.55, 1.7, .2, 0); }
TH.B = opSpot('#e84d8a', .34, 138, 296.6, '通缉榜 · 接悬赏');

/* ---------- wire into the game loop: wraps the hooks of js/80-gta.js after 85, 87 and 88 have filled them ---------- */
const opBusy = () => !!DT.st || TH.on;
function opUpdate(dt, px, pz){
  opMsg = '';
  const sp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
  const other = mission.on || !!gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in);
  const mine = opBusy(), free = !other && !mine;
  /* orders delivered by js/50-missions.js: count the cross-zone ones, and the ones that were stolen and won back */
  if (deliveries !== opDeliv){
    opDeliv = deliveries; if (opWas & 1 && opAdd('o_cross') >= 10) unlock('cross'); if (opWas & 2) unlock('back');
  }
  opWas = mission.on ? (mission.cross ? 1 : 0) | (mission.recovered ? 2 : 0) : 0;
  if (mission.on && mission.stolen && Math.hypot(px - mission.to.x, pz - mission.to.z) < 9) opMsg = '外卖还在小偷手里，先追回来';
  dtUpdate(dt, px, pz, sp, free);
  kmUpdate(px, pz, free);
  kcartPush(px, pz);
  teaUpdate(px, pz, free);
  nmUpdate(px, pz, !mine);
  thUpdate(dt, px, pz, sp, free);
  /* riding a shopping trolley: rattling wheels instead of an engine */
  if (driving && driving.kind === 'trolley' && engine && engine.base !== 26) engine.base = 26;
}
function opTarget(){
  if (TH.on && (TH.own || (!opOrder() && TH.st === 'run'))) return {x:TH.x, z:TH.z, label:(TH.own ? '抢你外卖的 ' : '小偷 ') + TH.who.name};
  if (DT.st === 'win') return {x:DT.wx, z:DT.wz, label:'取餐窗口'};
  if (DT.st === 'go') return {x:DT.job.to.x, z:DT.job.to.z, label:'送到 ' + DT.job.to.name};
  return null;
}
function opMini(dot){
  if (TH.on) dot(TH.x, TH.z, '#e84d8a', 9);
  if (DT.st === 'win'){ dot(DT.wx, DT.wz, '#4fd18b', 8); return; }
  if (DT.st === 'go'){ dot(DT.job.to.x, DT.job.to.z, '#ffc72c', 9); return; }
  if (TH.on || mission.on || gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on)) return;
  dot(DT.x, DT.z, '#ffc72c', 7); dot(KM.S.x, KM.S.z, '#ff5fa2', 7); dot(TEA.S.x, TEA.S.z, '#ff6f91', 6); dot(TH.B.x, TH.B.z, '#e84d8a', 5);
  if (NM.k > .9) dot(270, NM_Z, '#ff8a3d', 6);
}
/* everything of ours stops quietly: leaving 奶娃 mode, or getting arrested */
function opStop(){
  opClose(); if (TH.on) thEnd(); if (DT.st) dtEnd();
  opDest.visible = false; opMsg = '';
}
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); opUpdate(dt, px, pz); },
    busy(){ return base.busy() || opBusy(); },
    extBusy(){ return base.extBusy() || opBusy(); },
    prompt(){ return opMsg || base.prompt(); },
    target(){ return opTarget() || base.target(); },
    mini(dot){ base.mini(dot); opMini(dot); },
    onStunt(label, pts){ base.onStunt(label, pts); if (label === '人车分离') dtSpill(.3, '人都飞出去了'); },
    onCrash(grade, kmh){ base.onCrash(grade, kmh); dtSpill(grade === '剐蹭' ? .06 : grade === '重撞' ? .15 : .3, grade); },
    onBust(){
      if (DT.st) toast('这单泡汤了', '被保安抓了，餐也凉了', 2400);
      opStop(); base.onBust();
    },
    leave(){
      opStop(); for (const o of [DT.A, DT.B, KM.S, TEA.S, TH.B]){ opHide(o); o.rearm = false; }
      NM.S.visible = false; for (const i in NM.lbls) NM.lbls[i].dead = true; if (opFBtn) opSetF('');
      base.leave();
    }
  });
}
