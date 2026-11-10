/* XMUM 校园漫游 · 改装车间：界面、施工队列、改装道具背包、道具发放、存档、成就（零件目录和装车在 js/42-tuning.js）
   买车不用等，改装要等：下单时扣金币和道具，进施工位按真实时间计时（存的是时间戳，关掉游戏也照样走），
   完工后提示「回车行提车」，提车时自动装上。施工中的车照样能开，只是新零件还没装。
   默认 1 个施工位，第二个用 RM 800 解锁；可以花金币或改装图纸加急。新玩家第一单 30 秒完工，先尝到甜头。
   道具只能玩出来：XParts.grant(id, n, reason)，接口和各玩法的掉落见 docs/tuning.md。
   存档：localStorage 'xmum-tune-v1'（Google 登录的人跟其他 xmum-* 键一起云同步）。
   对外：window.XParts、window.XTune = {open, close, on}；预览版和本地测试页另有 window.XTuneDebug（正式版没有）。 */
'use strict';
const TN_KEY = 'xmum-tune-v1', TN_BAY2 = 800, TN_FIRST_SEC = 30;
const TN_STARTER = {rim:3, lacq:2, cf:1, neon:1};
const TN_SHOWCASE = {rim:'forged', rimc:'gold', size:'s2', wide:'wide', lip:'canard', skirt:'skirt', diff:'diff', hood:'vents', aero:'carbon', wing:'swan', neon:'kit', neonc:'purple', drl:'fang', exh:'quad', low:'l2', camber:'c3'};
const tune = {inv:{}, cars:{}, jobs:[], bays:1, first:false, kit:false, spent:0};
for (const p of TN_PARTS) tune.inv[p.id] = 0;
function tuneWrite(){ try { localStorage.setItem(TN_KEY, JSON.stringify(tune)); } catch(e){} }
(function tuneLoad(){
  try {
    const d = JSON.parse(localStorage.getItem(TN_KEY) || 'null'); if (!d) return;
    if (d.inv) for (const p of TN_PARTS) tune.inv[p.id] = Math.max(0, Math.min(9999, d.inv[p.id] | 0));
    if (d.cars && typeof d.cars === 'object') for (const k of TN_KINDS){
      const c = d.cars[k]; if (!c) continue;
      const own = (Array.isArray(c.own) ? c.own : []).filter(x => TN.byKey[x]), fit = tnFit(c.fit);
      for (const s in fit) if (fit[s] !== TN.stock[s] && !own.includes(s + '.' + fit[s])) fit[s] = TN.stock[s];   /* only what was built */
      tune.cars[k] = {own, fit};
    }
    if (Array.isArray(d.jobs)) tune.jobs = d.jobs.filter(j => j && TN.byKey[j.k] && TN_KINDS.includes(j.kind) && isFinite(j.t1)).slice(0, 2)
      .map(j => ({k:j.k, kind:j.kind, t0:+j.t0 || 0, t1:+j.t1, told:!!j.told}));
    tune.bays = d.bays === 2 ? 2 : 1; tune.first = !!d.first; tune.kit = !!d.kit; tune.spent = Math.max(0, +d.spent || 0);
  } catch(e){}
})();
const tnCar = kind => tune.cars[kind] || (tune.cars[kind] = {own:[], fit:tnFit(null)});
const tnIsStock = it => it.id === TN.stock[it.slot];
const tnOwns = (kind, key) => { const it = TN.byKey[key]; return !!it && (tnIsStock(it) || tnCar(kind).own.includes(key)); };
const tnJobOf = (kind, key) => tune.jobs.find(j => j.kind === kind && j.k === key);
const tnLeft = j => Math.max(0, j.t1 - Date.now());
const tnReady = j => tnLeft(j) <= 0;
const tnMods = fit => TN_SLOTS.filter(s => fit[s.id] !== TN.stock[s.id]).length;

/* ---------- 改装道具: XParts.grant is the one way in ---------- */
const XParts = window.XParts = {
  list:TN_PARTS,
  count:id => tune.inv[id] || 0,
  /* give n of part id; reason is shown to the player ('送外卖', '猴子大战金牌'). Returns the new count, 0 if the id is unknown */
  grant(id, n, reason){
    n = Math.round(n == null ? 1 : +n);
    if (!TN_PART[id] || !(n > 0)) return 0;
    tune.inv[id] = Math.min(9999, (tune.inv[id] || 0) + n); tuneWrite();
    tnGainShow(id, n, reason); if (tn.on) tnRender();
    return tune.inv[id];
  },
  /* the usual drop for a medal (0 金 / 1 银 / 2 铜): 涡轮 / 碳纤维板 / 赛车漆料; no medal (3 or more) gives nothing */
  medal(medal, reason){ const id = ['turbo', 'cf', 'lacq'][medal]; return id ? XParts.grant(id, 1, reason) : 0; }
};
const tnHas = need => Object.keys(need).every(p => (tune.inv[p] || 0) >= need[p]);
const tnShort = need => Object.keys(need).filter(p => (tune.inv[p] || 0) < need[p]);

/* small chips under the HUD: "+1 轮毂坯件 · 送外卖" */
const tnGainEl = document.createElement('div'); tnGainEl.id = 'tnGain'; tnGainEl.setAttribute('aria-live', 'polite'); document.body.appendChild(tnGainEl);
function tnGainShow(id, n, reason){
  const p = TN_PART[id], el = document.createElement('div'); el.className = 'tn-gain'; el.style.setProperty('--c', p.color);
  el.innerHTML = '<i></i><b></b><span></span>'; el.querySelector('i').textContent = p.ch; el.querySelector('b').textContent = `+${n} ${p.name}`;
  el.querySelector('span').textContent = reason ? '· ' + reason : '';
  tnGainEl.appendChild(el); while (tnGainEl.children.length > 3) tnGainEl.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
  tone('triangle', 1046, 1046, .08, .07); tone('triangle', 1568, 1568, .12, .06, .07);
}

/* ---------- where the parts come from (dev: 外卖, 得来速, 小偷, 通缉榜, 猴子大战, 宿舍撤离, B1 奖牌, 挑战赛, 成就) ----------
   each game's own end-of-round function is wrapped and called through, so nothing in those files changes */
const tnW = {deliv:prog.life.deliv || 0, dt:+prog.best.o_dt || 0};
function tnWatchDeliv(){
  const d = prog.life.deliv || 0, dt = +prog.best.o_dt || 0;
  if (d > tnW.deliv){
    const n = d - tnW.deliv, drive = dt > tnW.dt;
    XParts.grant('rim', n, drive ? '得来速' : '送外卖');
    if (drive){ XParts.grant('lacq', dt - tnW.dt, '得来速'); if (typeof opNight === 'function' && opNight()) XParts.grant('neon', 1, '送夜宵'); }
  }
  tnW.deliv = d; tnW.dt = dt;
}
if (typeof thCatch === 'function'){
  const base = thCatch;
  thCatch = function(){
    const n0 = +prog.best.o_thief || 0, r = base.apply(this, arguments), n = +prog.best.o_thief || 0;
    XParts.grant('turbo', 1, '抓住小偷');
    if (typeof TH_LIST !== 'undefined' && n > n0 && n % TH_LIST.length === 0) XParts.grant('plan', 1, '清空 Bell 通缉榜');
    return r;
  };
}
if (typeof mkWarEnd === 'function'){
  const base = mkWarEnd;
  mkWarEnd = function(win){
    let md = -1;
    try { const w = MK.war; if (win && w){ const f = Math.max(0, w.limit - w.t) / w.limit; md = f >= MK_MEDAL[0] ? 0 : f >= MK_MEDAL[1] ? 1 : 2; } } catch(e){}
    const r = base.apply(this, arguments);
    if (md >= 0) XParts.grant('cf', 3 - md, '猴子大战' + GX_MEDAL[md]);
    return r;
  };
}
if (typeof dmFinish === 'function'){
  const base = dmFinish;
  dmFinish = function(){
    let n = 0, v = 0;
    try { const items = dmBagItems().filter(it => !it.key); n = items.length; v = items.reduce((s, it) => s + it.v, 0); } catch(e){}
    const r = base.apply(this, arguments);
    if (n){ XParts.grant('neon', 1, '宿舍撤离'); if (v >= 150) XParts.grant('cf', 1, '宿舍撤离 RM ' + Math.round(v)); }
    return r;
  };
}
if (typeof mgFinish === 'function'){
  const base = mgFinish;
  mgFinish = function(score){
    let md = 3;
    try { const g = MG.cur; if (g && arcPlaying() && score != null && isFinite(score)) md = mgMedal(g, Math.round(score * 100) / 100); } catch(e){}
    const r = base.apply(this, arguments);
    if (md < 3) XParts.medal(md, 'B1 小游戏' + GX_MEDAL[md]);
    return r;
  };
}
if (typeof gxFinish === 'function'){
  const base = gxFinish;
  gxFinish = function(score){
    let md = 3;
    try { const a = gxA.act, low = a.type === 'race'; for (let i = 0; i < 3; i++) if (low ? score <= a.medal[i] : score >= a.medal[i]){ md = i; break; } } catch(e){}
    const r = base.apply(this, arguments);
    if (md === 0) XParts.grant('cf', 1, '挑战赛金牌');
    if (md < 3) XParts.grant('lacq', 1, '挑战赛' + GX_MEDAL[md]);
    return r;
  };
}
{
  const base = unlock;
  unlock = function(id){
    const had = !!prog.ach[id], r = base.apply(this, arguments);
    if (!had && prog.ach[id]){ const a = ACH.find(x => x[0] === id); XParts.grant('plan', 1, '成就「' + (a ? a[1] : id) + '」'); }
    return r;
  };
}
achAdd([['tune1', '改装入门', '第一次提到改装好的车', 20], ['tunewide', '宽体怪兽', '一辆车同时装上宽体和尾翼', 60], ['tunefull', '全副武装', '一辆车有 10 项以上改装', 120]]);

/* ---------- on the cars ---------- */
function tnApplyMine(fit){ if (myCar) tnApply(myCar, fit || tnCar(myCar.kind).fit); }
{ const base = spawnMine; spawnMine = function(kind, x, z, h){ const it = base(kind, x, z, h); tnApplyMine(); return it; }; }
tnApplyMine();
tnApply(showCar, TN_SHOWCASE);   /* the 车行 turntable shows what the workshop can do */
/* 性能改装 (off while TN_PERF = 0 in js/42-tuning.js): the perf fields of the fitted parts, as fractions */
function tnPerf(kind){
  const o = {acc:0, maxV:0, grip:0}, f = tnCar(kind).fit;
  for (const s of TN_SLOTS){ const it = TN.byKey[s.id + '.' + f[s.id]]; for (const k in o) o[k] += it.perf[k]; }
  return o;
}
{
  const base = tunedT;
  tunedT = function(kind){
    const t = base(kind); if (!TN_PERF || !TN_KINDS.includes(kind)) return t;
    const p = tnPerf(kind); t.acc *= 1 + p.acc * TN_PERF; t.maxV *= 1 + p.maxV * TN_PERF; t.grip *= 1 + p.grip * TN_PERF; return t;
  };
}
/* 总资产: built parts and the ones in the bays at coins + parts used, unspent parts at their value, the second bay at its price */
assetSource('carmods', () => {
  let s = (tune.bays - 1) * TN_BAY2;
  for (const p of TN_PARTS) s += (tune.inv[p.id] || 0) * p.rm;
  for (const k in tune.cars) for (const key of tune.cars[k].own) if (TN.byKey[key]) s += tnWorth(TN.byKey[key]);
  for (const j of tune.jobs) s += tnWorth(TN.byKey[j.k]);
  return s;
});
/* online: other players see the fit of your own car while you drive it (js/net.js /looks, at most 120 characters) */
if (window.XWard){
  const base = XWard.lookStr.bind(XWard);
  XWard.lookStr = function(){
    const s = base(); if (!(driving && driving === myCar)) return s;
    const t = tnToken(tnCar(myCar.kind).fit); if (!t) return s;
    const o = s ? s + ',' + t : t; return o.length <= 120 ? o : s;
  };
}

/* ---------- ordering, the bays, picking up ---------- */
const tnFmt = ms => { const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60, p = v => String(v).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`; };
const tnMinTxt = it => !tune.first ? `${TN_FIRST_SEC} 秒（新手首单）` : it.min >= 60 ? `${it.min / 60} 小时` : `${it.min} 分钟`;
function tnOrder(key){
  const it = TN.byKey[key], kind = myCar && myCar.kind; if (!it || !kind) return false;
  if (tnOwns(kind, key) || tnJobOf(kind, key) || tune.jobs.length >= tune.bays || money < it.rm || !tnHas(it.need)) return false;
  money -= it.rm; tune.spent += it.rm; for (const p in it.need) tune.inv[p] -= it.need[p];
  const now = Date.now(), sec = tune.first ? it.min * 60 : TN_FIRST_SEC; tune.first = true;
  tune.jobs.push({k:key, kind, t0:now, t1:now + sec * 1000, told:false});
  moneyChanged(); tuneWrite();
  tone('square', 220, 180, .12, .05); tone('square', 330, 300, .1, .04, .12);
  return true;
}
const tnRushRM = j => Math.max(10, Math.ceil(tnLeft(j) / 60000) * 12);            /* RM 12 a minute */
const tnRushPlan = j => Math.max(1, Math.ceil(tnLeft(j) / (20 * 60000)));          /* one 改装图纸 per 20 minutes */
function tnRush(i, plan){
  const j = tune.jobs[i]; if (!j || tnReady(j)) return;
  if (plan){ const n = tnRushPlan(j); if (tune.inv.plan < n) return; tune.inv.plan -= n; }
  else { const c = tnRushRM(j); if (money < c) return; money -= c; moneyChanged(); }
  j.t1 = Date.now(); j.told = true; tuneWrite(); sfx.ding();
  tnRender(); tnDone('加急完工：' + TN.byKey[j.k].name, '点「提车」装上');
}
function tnPickup(i){
  const j = tune.jobs[i]; if (!j || !tnReady(j)) return;
  tune.jobs.splice(i, 1);
  const it = TN.byKey[j.k], c = tnCar(j.kind);
  if (!c.own.includes(j.k)) c.own.push(j.k);
  c.fit[it.slot] = it.id; tuneWrite();
  const mine = myCar && myCar.kind === j.kind;
  if (mine){ tn.try[it.slot] = it.id; tnApplyMine(tn.on ? tn.try : null); tnSparkle(); if (TN_PERF) myCar.T = tunedT(myCar.kind); }
  const name = (SHOP.find(s => s.kind === j.kind) || {}).name || CAR_T[j.kind].name;
  tnDone('提车：' + it.name, mine ? `已经装在你的${name}上了，开出去给大家看看` : `装在你的${name}上了，叫它出来就能看到`);
  unlock('tune1');
  if (c.fit.wide !== 'stock' && c.fit.wing !== 'none') unlock('tunewide');
  if (tnMods(c.fit) >= 10) unlock('tunefull');
  tnBadge(); if (tn.on) tnRender();
}
function tnBay(){
  if (tune.bays >= 2 || money < TN_BAY2) return;
  money -= TN_BAY2; tune.spent += TN_BAY2; tune.bays = 2; moneyChanged(); tuneWrite(); sfx.sparkle();
  tnRender(); tnDone('第二个施工位开好了', '现在可以同时改两样');
}
/* finished while you were away / while you play: tell once, then the 车行 button shows a badge until you pick it up */
function tnTick(){
  let fresh = null;
  for (const j of tune.jobs) if (!j.told && tnReady(j)){ j.told = true; fresh = j; }
  if (fresh){
    tuneWrite(); const it = TN.byKey[fresh.k];
    if (!tn.on){ toast('改装完工：' + it.name, '回车行提车：「XMUM 车行」→「改装车间」', 4200); tone('triangle', 784, 784, .14, .12); tone('triangle', 1175, 1175, .3, .12, .14); }
  }
  tnBadge();
  if (tn.on){ tnRenderQ(); if (fresh) tnRender(); else if (tnSel() && tnJobOf(myCar.kind, tn.sel)) tnFoot(); }
}
function tnBadge(){
  const n = tune.jobs.filter(tnReady).length, b = $('#garageBtn'); if (!b) return;
  b.classList.toggle('tn-ready', n > 0); b.dataset.tn = n ? String(n) : '';
  b.setAttribute('aria-label', n ? `XMUM 车行，有 ${n} 辆改装车可以提` : 'XMUM 车行');
}
setInterval(tnTick, 1000);

/* ---------- panel ---------- */
const TN_ICON = {
  wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3.5v6M12 14.5v6M3.8 9.4l5.8 1.8M14.4 12.8l5.8 1.8M6.8 19.2l3.6-5M13.6 9.8l3.6-5"/>',
  body:'<path d="M2.5 15.5h19v-2.2l-3-1.3-3.2-3.5H8.6L5.4 12l-2.9 1z"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/>',
  wing:'<path d="M3 8.5h18l-1.5 2.5H4.5z"/><path d="M7 11v6M17 11v6M3 8.5v3M21 8.5v3"/>',
  light:'<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V15h7v-1.1A6 6 0 0 0 12 3z"/>',
  exh:'<circle cx="8" cy="12" r="4"/><circle cx="16.5" cy="12" r="4"/><circle cx="8" cy="12" r="1.6"/><circle cx="16.5" cy="12" r="1.6"/>',
  stance:'<path d="M3 12.5h18v-2l-3-1-3-3H9l-3 3-3 1z"/><circle cx="7.5" cy="13.5" r="2"/><circle cx="16.5" cy="13.5" r="2"/><path d="M12 16.5v4M10 18.8l2 1.8 2-1.8"/>'
};
const tnSvg = tab => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${TN_ICON[tab]}</svg>`;
const tnEl = document.createElement('div');
tnEl.className = 'panel'; tnEl.id = 'tune'; tnEl.hidden = true; tnEl.setAttribute('role', 'dialog'); tnEl.setAttribute('aria-labelledby', 'tuneT');
tnEl.innerHTML = `<button class="x" id="tunex" aria-label="关闭">×</button>
  <div class="shop-h"><h2 id="tuneT">改装车间</h2><span id="tuneMoney">RM 0.00</span></div>
  <div class="tn-inv" id="tuneInv" role="group" aria-label="改装道具背包"></div>
  <div class="tn-q" id="tuneQ"></div>
  <div class="wd-tabs" id="tuneTabs" role="tablist"></div>
  <div class="tn-list" id="tuneList"></div>
  <div class="wd-done" id="tuneDone" role="status" aria-live="polite" hidden></div>
  <div class="wd-foot"><div class="wd-sel"><b id="tuneName"></b><span id="tuneDesc"></span><span class="tn-cost" id="tuneCost"></span></div><div class="wd-btns"><button class="btn buy" id="tuneGo"></button></div></div>`;
document.body.appendChild(tnEl);
const tn = {on:false, tab:'wheel', sel:null, try:{}, yaw:0, pitch:.22, zoom:1, drag:null, wasPaused:false, view:''};
const tnSel = () => tn.sel && TN.byKey[tn.sel];

function tnRender(){
  if (!tn.on) return;
  $('#tuneMoney').textContent = fmtRM(money);
  $('#tuneT').textContent = '改装车间 · ' + (myCar ? myCar.T.name : '');
  $('#tuneInv').innerHTML = TN_PARTS.map(p => `<button type="button" class="tn-p${tn.sel === 'p:' + p.id ? ' sel' : ''}" data-p="${p.id}" style="--c:${p.color}" aria-label="${p.name} ${tune.inv[p.id] || 0} 个"><i>${p.ch}</i><b>${tune.inv[p.id] || 0}</b></button>`).join('');
  tnRenderQ();
  $('#tuneTabs').innerHTML = TN_TABS.map(([t, n]) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tn.tab}">${n}</button>`).join('');
  const kind = myCar.kind, fit = tnCar(kind).fit;
  $('#tuneList').innerHTML = TN_SLOTS.filter(s => s.tab === tn.tab).map(s => `<h4>${s.name}</h4><div class="wd-grid" role="listbox" aria-label="${s.name}">` + TN.bySlot[s.id].map(it => {
    const own = tnOwns(kind, it.key), on = fit[s.id] === it.id, job = tnJobOf(kind, it.key), sel = tn.sel === it.key, tr = tn.try[s.id] === it.id;
    const tag = on ? '<em class="on">在用</em>' : own ? '<em>已有</em>' : job ? (tnReady(job) ? '<em class="on">待提车</em>' : '<em class="b">施工中</em>') : `<em class="p">RM ${it.rm.toLocaleString()}</em>`;
    const tier = it.tier !== 'n' ? `<i class="t-${it.tier}">${WD_TIER[it.tier]}</i>` : '';
    const col = it.col ? ` style="background:${it.col}${s.id === 'neonc' ? ';box-shadow:0 0 10px ' + it.col : ''}"` : '';
    return `<button type="button" role="option" class="wd-it tn-it${sel ? ' sel' : ''}${tr && !sel && !on ? ' tr' : ''} tier-${it.tier}" aria-selected="${sel}" data-k="${it.key}">
      <span class="wd-sw tn-ic"${col}>${it.col ? '' : tnSvg(s.tab)}</span><b>${it.name}</b>${tier}${tag}</button>`;
  }).join('') + '</div>').join('');
  tnFoot();
}
function tnRenderQ(){
  const q = $('#tuneQ'); let h = '';
  for (let i = 0; i < tune.bays; i++){
    const j = tune.jobs[i];
    if (!j){ h += `<div class="tn-bay idle"><b>施工位 ${i + 1}</b><span>空着 · 选好零件点「下单施工」</span></div>`; continue; }
    const it = TN.byKey[j.k], car = (SHOP.find(s => s.kind === j.kind) || {}).name || '', left = tnLeft(j), k = Math.min(1, 1 - left / Math.max(1, j.t1 - j.t0));
    h += `<div class="tn-bay${left ? '' : ' ready'}" style="--k:${k.toFixed(3)}"><b>${it.name}</b><span>${myCar && j.kind !== myCar.kind ? car + ' · ' : ''}${left ? '还剩 ' + tnFmt(left) : '完工了'}</span>`
      + (left ? `<button type="button" class="btn" data-rush="${i}"${money < tnRushRM(j) ? ' disabled' : ''}>加急 ${fmtRM(tnRushRM(j))}</button><button type="button" class="btn" data-rushp="${i}"${tune.inv.plan < tnRushPlan(j) ? ' disabled' : ''} aria-label="用 ${tnRushPlan(j)} 张改装图纸加急">图纸 ×${tnRushPlan(j)}</button>`
        : `<button type="button" class="btn buy" data-pick="${i}">提车</button>`) + '</div>';
  }
  if (tune.bays < 2) h += `<button type="button" class="tn-bay2" data-bay${money < TN_BAY2 ? ' disabled' : ''}>＋ 开第二个施工位 · ${fmtRM(TN_BAY2)}</button>`;
  q.innerHTML = h;
}
function tnFoot(){
  const go = $('#tuneGo'), cost = $('#tuneCost'), name = $('#tuneName'), desc = $('#tuneDesc');
  go.hidden = false; go.disabled = false; go.className = 'btn buy'; cost.innerHTML = '';
  if (tn.sel && tn.sel.startsWith('p:')){
    const p = TN_PART[tn.sel.slice(2)];
    name.textContent = `${p.name} × ${tune.inv[p.id] || 0}`; desc.textContent = '去哪儿拿：' + p.from + '。不能用钱买。'; go.hidden = true; return;
  }
  const it = tnSel();
  if (!it){
    name.textContent = '点一个零件预览';
    desc.textContent = !tune.first ? '预览免费。新手首单 30 秒完工，之后的改装要等真实时间，车照样能开' : '预览免费。下单后要等施工，车照样能开；拖动画面转着看';
    go.hidden = true; return;
  }
  const kind = myCar.kind, fit = tnCar(kind).fit, job = tnJobOf(kind, it.key), slot = TN_SLOTS.find(s => s.id === it.slot);
  name.textContent = it.name + (it.tier !== 'n' ? ' · ' + WD_TIER[it.tier] : '');
  desc.textContent = (it.desc || slot.name) + ((it.slot === 'neonc' && fit.neon === 'none' && fit.rim !== 'glow') ? '（要先装底盘霓虹或发光轮毂才看得见）' : '');
  if (tnOwns(kind, it.key)){
    if (fit[it.slot] === it.id){ go.textContent = '正在用'; go.disabled = true; go.className = 'btn'; }
    else go.textContent = tnIsStock(it) ? '换回原厂' : '装上';
    return;
  }
  if (job){
    if (tnReady(job)) go.textContent = '提车';
    else { go.textContent = '施工中 · ' + tnFmt(tnLeft(job)); go.disabled = true; go.className = 'btn'; }
    return;
  }
  cost.innerHTML = `<span class="${money >= it.rm ? '' : 'no'}">${fmtRM(it.rm)}</span>` + Object.keys(it.need).map(p => {
    const P = TN_PART[p], have = tune.inv[p] || 0; return `<span class="pt${have >= it.need[p] ? '' : ' no'}" style="--c:${P.color}"><i>${P.ch}</i>${P.name} ${have}/${it.need[p]}</span>`;
  }).join('') + `<span class="tm">施工 ${tnMinTxt(it)}</span>`;
  const short = tnShort(it.need);
  if (tune.jobs.length >= tune.bays){ go.textContent = '施工位满了'; go.disabled = true; go.className = 'btn'; }
  else if (short.length){ go.textContent = '缺 ' + short.map(p => TN_PART[p].name).join('、'); go.disabled = true; go.className = 'btn'; }
  else if (money < it.rm){ go.textContent = '还差 ' + fmtRM(Math.ceil(it.rm - money)); go.disabled = true; go.className = 'btn'; }
  else go.textContent = '下单施工';
}
function tnDone(title, sub){
  const el = $('#tuneDone'); el.innerHTML = '<b></b><span></span>'; el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub || '';
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
function tnPick(key){
  $('#tuneDone').hidden = true;
  if (key.startsWith('p:')){ tn.sel = tn.sel === key ? null : key; tnRender(); return; }
  const it = TN.byKey[key]; if (!it) return;
  tn.sel = key; tn.try[it.slot] = it.id; tnApplyMine(tn.try); tnRender(); tone('triangle', 660, 880, .08, .05);
}
function tnGo(){
  const it = tnSel(); if (!it || !myCar) return;
  const kind = myCar.kind, c = tnCar(kind), job = tnJobOf(kind, it.key);
  if (tnOwns(kind, it.key)){
    c.fit[it.slot] = it.id; tuneWrite(); tnApplyMine(tn.try); sfx.ding(); tnRender(); tnDone((tnIsStock(it) ? '换回了：' : '装上了：') + it.name, '已存档，下次叫车也是这样');
    if (c.fit.wide !== 'stock' && c.fit.wing !== 'none') unlock('tunewide');
    if (tnMods(c.fit) >= 10) unlock('tunefull');
    return;
  }
  if (job){ if (tnReady(job)) tnPickup(tune.jobs.indexOf(job)); return; }
  const quick = !tune.first;
  if (!tnOrder(it.key)) return;
  tnRender();
  tnDone('下单了：' + it.name, quick ? '新手首单，30 秒就好，先在这儿看着它完工' : `施工 ${tnMinTxt(it)}。车照样能开，完工后会提醒你回车行提车`);
}
/* a shower of sparks round the car when a part goes on */
function tnSparkle(){
  if (!myCar) return;
  for (let i = 0; i < 22; i++){ const a = rnd() * Math.PI * 2, r = myCar.T.L * .55;
    spawnPart('dust', myCar.x + Math.cos(a) * r, myCar.y + .2 + rnd() * myCar.T.H, myCar.z + Math.sin(a) * r, .35 + rnd() * .3, {vy:1.5 + rnd() * 2, g:3, life:.8 + rnd() * .5, op:1, color:rnd() < .5 ? '#ffd25a' : '#ffffff'}); }
  sfx.sparkle(); tone('square', 1400, 1900, .06, .04); tone('square', 1700, 2300, .06, .04, .08);
}
$('#tuneList').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b){ ac(); tnPick(b.dataset.k); } });
$('#tuneInv').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b){ ac(); tnPick('p:' + b.dataset.p); } });
$('#tuneQ').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; ac();
  if (b.dataset.pick != null) tnPickup(+b.dataset.pick);
  else if (b.dataset.rush != null) tnRush(+b.dataset.rush, false);
  else if (b.dataset.rushp != null) tnRush(+b.dataset.rushp, true);
  else if (b.dataset.bay != null) tnBay();
});
$('#tuneTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; ac(); tn.tab = b.dataset.tab; tnRender(); tnAim(); });
$('#tuneTabs').addEventListener('keydown', e => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault();
  const i = TN_TABS.findIndex(x => x[0] === tn.tab); tn.tab = TN_TABS[(i + d + TN_TABS.length) % TN_TABS.length][0]; tnRender(); tnAim();
  const n = $('#tuneTabs [aria-selected="true"]'); if (n) n.focus();
});
$('#tuneGo').addEventListener('click', () => { ac(); tnGo(); });
$('#tunex').addEventListener('click', () => tnClose());

/* ---------- open / close, turntable camera ---------- */
function tnOpen(){
  if (tn.on) return;
  if (mode !== 'naiwa'){ if (typeof titleOpen !== 'undefined' && titleOpen) XUI.closeTitle('naiwa'); else setMode('naiwa'); }
  if (!myCar){ toast('先去车行买辆车', '改装只给你自己的车，最便宜的 Myvi 只要 RM 60', 2600); return; }
  closeShop(); if (typeof ward !== 'undefined' && ward.on) wardClose(); if (gx.paused) gx.togglePause();
  tn.try = Object.assign({}, tnCar(myCar.kind).fit); tn.sel = null; tn.zoom = 1;
  tn.wasPaused = gx.paused; gx.paused = true; tn.on = true; keys.Space = false; engineUpdate(0, 0, false);
  tn.yaw = myCar.h + .8; tn.pitch = .22;
  document.body.classList.add('wd-open', 'tn-open'); tnEl.hidden = false; tnRender();
  /* first visit: a starter pack so the first job can start right away (and a 图纸 for every four achievements already won) */
  if (!tune.kit){
    tune.kit = true; const old = Math.floor(Object.keys(prog.ach).length / 4);
    for (const p in TN_STARTER) tune.inv[p] += TN_STARTER[p]; if (old) tune.inv.plan += old; tuneWrite(); tnRender(); sfx.sparkle();
    tnDone('开张礼包', `送你 轮毂坯件 ×3、赛车漆料 ×2、碳纤维板 ×1、霓虹灯管 ×1${old ? `，还有老玩家的改装图纸 ×${old}（每 4 个成就一张）` : ''}。先试试轮毂，第一单 30 秒完工`);
  }
  const f = $('#tuneTabs [aria-selected="true"]'); if (f) f.focus({preventScroll:true});
  requestAnimationFrame(tnFrame);
}
function tnClose(){
  if (!tn.on) return;
  const fit = myCar ? tnCar(myCar.kind).fit : {}, tried = TN_SLOTS.some(s => tn.try[s.id] !== fit[s.id]);
  tn.on = false; tnEl.hidden = true; document.body.classList.remove('tn-open'); $('#tuneDone').hidden = true;
  if (typeof ward === 'undefined' || !ward.on) document.body.classList.remove('wd-open');
  tnApplyMine();
  if (tried) toast('刚才只是预览，车还是原来的样子', '选好后点「下单施工」，完工回车行提车才装上', 3000);
  gx.paused = tn.wasPaused; camera.clearViewOffset(); tn.view = ''; camera.near = .3; camera.updateProjectionMatrix();
  canvas.focus({preventScroll:true});
}
/* turn the car to show the part being looked at */
function tnAim(){ const a = {wheel:.9, body:.75, wing:2.5, light:.35, exh:2.75, stance:1.55}[tn.tab]; if (a != null && myCar){ tn.yaw = myCar.h + a; tn.pitch = tn.tab === 'light' || tn.tab === 'stance' ? .1 : .22; } }
let tnLast = 0;
function tnFrame(now){
  if (!tn.on) return;
  requestAnimationFrame(tnFrame);
  const dt = Math.min(.05, (now - (tnLast || now)) / 1000); tnLast = now;
  if (!myCar){ tnClose(); return; }
  if (!tn.drag && !REDUCED) tn.yaw += dt * .18;
  const T = myCar.T, W = window.innerWidth, H = window.innerHeight, wide = W > 760, r = tnEl.getBoundingClientRect();
  const ox = wide ? Math.round(r.width / 2 + 8) : 0, oy = wide ? 0 : Math.round((H - r.top) / 2), key = W + 'x' + H + ':' + ox + ',' + oy;
  if (key !== tn.view){ tn.view = key; camera.setViewOffset(W, H, ox, oy, W, H); }
  /* back off until the whole car fits the part of the screen the panel leaves free (FOV 50: half-height = d · tan 25°) */
  const regW = wide ? W - r.width - 32 : W, regH = wide ? H : Math.max(140, r.top), t25 = Math.tan(25 * Math.PI / 180);
  const d = Math.max(T.L * .7 + 2.2, (T.L * .58 + .45) / (t25 * regW / H), (T.H * .5 + .75) / (t25 * regH / H)) * tn.zoom;
  /* clip away hedges and trees between the camera and the car, but not the ground in front of it */
  const near = Math.max(.3, Math.min(d - (T.L * .62 + .8), d * .4));
  if (camera.fov !== 50 || Math.abs(camera.near - near) > .01){ camera.fov = 50; camera.near = near; camera.updateProjectionMatrix(); }
  const tx = myCar.x, ty = myCar.y + T.H * .38, tz = myCar.z, cp = Math.cos(tn.pitch);
  camera.position.set(tx + Math.sin(tn.yaw) * cp * d, ty + Math.sin(tn.pitch) * d + .25, tz + Math.cos(tn.yaw) * cp * d);
  camera.lookAt(tx, ty, tz);
  fitShadow(Math.round(tx / 20) * 20, Math.round(tz / 20) * 20, 60);
  tnNeonGlow();
}
canvas.addEventListener('pointerdown', e => { if (tn.on) tn.drag = {id:e.pointerId, x:e.clientX, y:e.clientY}; });
window.addEventListener('pointermove', e => {
  if (!tn.drag || e.pointerId !== tn.drag.id) return;
  tn.yaw -= (e.clientX - tn.drag.x) * .008; tn.pitch = Math.max(-.02, Math.min(1.1, tn.pitch + (e.clientY - tn.drag.y) * .005));
  tn.drag.x = e.clientX; tn.drag.y = e.clientY;
});
const tnUp = e => { if (tn.drag && e.pointerId === tn.drag.id) tn.drag = null; };
window.addEventListener('pointerup', tnUp); window.addEventListener('pointercancel', tnUp);
canvas.addEventListener('wheel', e => { if (!tn.on) return; e.preventDefault(); tn.zoom = Math.max(.6, Math.min(1.6, tn.zoom * (e.deltaY > 0 ? 1.08 : .93))); }, {passive:false});
window.addEventListener('keydown', e => {
  if (!tn.on) return;
  if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); tnClose(); return; }
  if (e.target.closest && e.target.closest('#tune') && /^(Enter|Space|Tab|Arrow)/.test(e.code)) return;
  e.stopImmediatePropagation();
}, true);

/* ---------- per frame while playing: exhaust flames, neon brighter after dark ---------- */
const tnFx = {sp:0, acc:0, hot:0, pop:0};
function tnNeonGlow(){ const lamp = typeof cur !== 'undefined' ? Math.min(1, cur.lamp || 0) : 0; for (const k in tnNeonMats) tnNeonMats[k].pool.opacity = .3 + .62 * lamp; }
function tnFlame(c, n, big){
  /* from the car's own position and heading (its matrices are only refreshed when a frame is drawn) */
  const fx = Math.sin(c.h), fz = Math.cos(c.h), y0 = c.y + c.body.position.y;
  for (const t of c.tn.tips) for (let i = 0; i < n; i++){
    const v = (big ? 4 : 2.5) + rnd() * 2.5, wx = c.x + t[0] * fz + t[2] * fx, wz = c.z - t[0] * fx + t[2] * fz;
    spawnPart('dust', wx, y0 + t[1], wz, (big ? .3 : .2) + rnd() * .12, {grow:1.6, vx:c.vx - fx * v, vy:.2 + rnd() * .4, vz:c.vz - fz * v, life:.1 + rnd() * .1, op:1, color:rnd() < .45 ? '#ffd65a' : rnd() < .5 ? '#ff7a1f' : '#6aa8ff'});
  }
}
function tnFxUpdate(dt){
  tnNeonGlow();
  const c = driving; tnFx.pop -= dt;
  if (!c || !c.tn || !c.tn.tips.length || !(dt > 0)){ tnFx.sp = 0; tnFx.acc = 0; tnFx.hot = 0; return; }
  const sp = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h), a = (sp - tnFx.sp) / dt; tnFx.sp = sp;
  tnFx.acc += (a - tnFx.acc) * Math.min(1, dt * 10);
  const quad = c.tn.exh === 'quad';
  if (tnFx.acc > 3.5 && sp > 3){ tnFx.hot = Math.min(1, tnFx.hot + dt * 2.5); if (rnd() < dt * (quad ? 22 : 14) * tnFx.hot) tnFlame(c, 1, false); }
  else if (tnFx.hot > .7 && tnFx.acc < -1.5 && sp > 9 && tnFx.pop <= 0){
    /* lift off at speed: a backfire */
    tnFx.pop = .6; tnFx.hot = 0; tnFlame(c, quad ? 3 : 2, true);
    noise(.12, .32, 700); tone('square', 110, 45, .1, .1); if (quad){ noise(.08, .25, 900); tone('square', 95, 40, .08, .08, .09); }
  } else tnFx.hot = Math.max(0, tnFx.hot - dt * .8);
}
{
  const up = gx.update;
  gx.update = function(dt, px, pz){ up.call(this, dt, px, pz); tnWatchDeliv(); tnFxUpdate(dt); };
}

/* ---------- entry points: the 车行 panel, the pause menu ---------- */
{
  const row = $('#shop .wd-entry');
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn tn-entry'; b.textContent = '改装车间';
  b.addEventListener('click', () => { ac(); tnOpen(); });
  if (row) row.appendChild(b); else { const r = document.createElement('div'); r.className = 'wd-entry'; r.appendChild(b); $('#shop').insertBefore(r, $('#shopList')); }
}
{
  const go = $('#gxpShop'); if (go){ const b = document.createElement('button'); b.className = 'btn'; b.id = 'gxpTune'; b.textContent = '改装';
    b.addEventListener('click', () => { ac(); tnOpen(); }); go.parentNode.insertBefore(b, go); }
}
tnBadge();

window.XTune = {open:tnOpen, close:tnClose, get on(){ return tn.on; }};

/* ---------- test switch: preview build and local test pages only, never on the live game ----------
   XTuneDebug.ff(分钟) 施工快进（不填就全部完工）· give('cf', 5) 发道具 · kit(10) 每样道具都发 · reset() 清空改装存档 */
const TN_DEV = !/(^|\.)github\.io$/i.test(location.hostname) || /\/preview\//.test(location.pathname);
if (TN_DEV) window.XTuneDebug = {
  ff(min){ for (const j of tune.jobs){ j.t1 = min == null ? Date.now() : j.t1 - min * 60000; j.t0 = Math.min(j.t0, j.t1 - 1000); } tuneWrite(); tnTick(); if (tn.on) tnRender(); return tune.jobs.map(j => j.k + ' ' + tnFmt(tnLeft(j))); },
  give(id, n){ return XParts.grant(id, n == null ? 5 : n, '调试'); },
  kit(n){ for (const p of TN_PARTS) tune.inv[p.id] += n == null ? 10 : n; tuneWrite(); if (tn.on) tnRender(); return Object.assign({}, tune.inv); },
  reset(){ try { localStorage.removeItem(TN_KEY); } catch(e){} location.reload(); },
  get state(){ return tune; }
};
