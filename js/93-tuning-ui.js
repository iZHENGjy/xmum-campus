/* XMUM 校园漫游 · 改装车间：界面、施工队列、改装道具和配方背包、道具发放、存档、成就（零件目录和装车在 js/42-tuning.js）
   买车不用等，改装要等：下单时扣金币和道具，进施工位按真实时间计时（存的是时间戳，关掉游戏也照样走），
   完工后提示「回车行提车」，提车时自动装上。施工中的车照样能开，只是新零件还没装。
   施工时间按档：轻改几分钟、中改几十分钟、高级几小时、顶级跨天；新玩家第一单 30 秒完工（只限轻改和中改），先尝到甜头。
   默认 1 个施工位，第二个用 RM 800 解锁；可以花金币或改装图纸加急（越久的单每分钟越便宜）。
   道具和配方只能玩出来：XParts.reward(game, grade) 按 js/42-tuning.js 的 TN_DROPS 发，XParts.grant(id, n, reason) 发单件，
   接口和各玩法的掉落见 docs/tuning.md。
   存档：localStorage 'xmum-tune-v1'（Google 登录的人跟其他 xmum-* 键一起云同步）。
   对外：window.XParts、window.XTune = {open, close, on}；预览版和本地测试页另有 window.XTuneDebug（正式版没有）。 */
'use strict';
const TN_KEY = 'xmum-tune-v1', TN_BAY2 = 800, TN_FIRST_SEC = 30;
const TN_STARTER = {rim:3, lacq:2, cf:1, neon:1};
const TN_SHOWCASE = {rim:'forged', rimc:'gold', size:'s2', wide:'wide', lip:'canard', skirt:'skirt', diff:'diff', hood:'vents', aero:'carbon', wing:'swan', neon:'kit', neonc:'purple', drl:'fang', exh:'quad', low:'l2', camber:'c3'};
const tune = {inv:{}, bp:{}, cars:{}, jobs:[], bays:1, first:false, kit:false, spent:0, trailOff:false, lim:{}};
for (const p of TN_PARTS) tune.inv[p.id] = 0;
function tuneWrite(){ try { localStorage.setItem(TN_KEY, JSON.stringify(tune)); } catch(e){} }
(function tuneLoad(){
  try {
    const d = JSON.parse(localStorage.getItem(TN_KEY) || 'null'); if (!d) return;
    if (d.inv) for (const p of TN_PARTS) tune.inv[p.id] = Math.max(0, Math.min(9999, d.inv[p.id] | 0));
    if (d.bp && typeof d.bp === 'object') for (const b of TN_BPS) if (d.bp[b.id]) tune.bp[b.id] = 1;
    if (d.cars && typeof d.cars === 'object') for (const k of TN_KINDS){
      const c = d.cars[k]; if (!c) continue;
      const own = (Array.isArray(c.own) ? c.own : []).filter(x => TN.byKey[x]), fit = tnFit(c.fit);
      for (const s in fit) if (fit[s] !== TN.stock[s] && !own.includes(s + '.' + fit[s])) fit[s] = TN.stock[s];   /* only what was built */
      tune.cars[k] = {own, fit};
    }
    if (Array.isArray(d.jobs)) tune.jobs = d.jobs.filter(j => j && TN.byKey[j.k] && TN_KINDS.includes(j.kind) && isFinite(j.t1)).slice(0, 2)
      .map(j => ({k:j.k, kind:j.kind, t0:+j.t0 || 0, t1:+j.t1, told:!!j.told}));
    tune.bays = d.bays === 2 ? 2 : 1; tune.first = !!d.first; tune.kit = !!d.kit; tune.spent = Math.max(0, +d.spent || 0); tune.trailOff = !!d.trailOff;
    if (d.lim && typeof d.lim === 'object') for (const g in TN_DROPS){ const l = d.lim[g]; if (l && typeof l.d === 'string') tune.lim[g] = {d:l.d, n:Math.max(0, l.n | 0), t:+l.t || 0}; }
  } catch(e){}
})();
const tnCar = kind => tune.cars[kind] || (tune.cars[kind] = {own:[], fit:tnFit(null)});
const tnIsStock = it => it.id === TN.stock[it.slot];
const tnOwns = (kind, key) => { const it = TN.byKey[key]; return !!it && (tnIsStock(it) || tnCar(kind).own.includes(key)); };
const tnJobOf = (kind, key) => tune.jobs.find(j => j.kind === kind && j.k === key);
const tnLeft = j => Math.max(0, j.t1 - Date.now());
const tnReady = j => tnLeft(j) <= 0;
const tnMods = fit => TN_SLOTS.filter(s => fit[s.id] !== TN.stock[s.id]).length;
const tnThing = id => TN_PART[id] || TN_BP[id];

/* ---------- 改装道具和配方：XParts.grant / XParts.reward are the only ways in ---------- */
const TN_GRADE = ['金牌', '银牌', '铜牌', ''];
const XParts = window.XParts = {
  list:TN_PARTS, bps:TN_BPS, drops:TN_DROPS,
  count:id => TN_BP[id] ? (tune.bp[id] ? 1 : 0) : tune.inv[id] || 0,
  /* give n of part id (or a 配方 'bp_…'); reason is shown to the player ('送外卖', '猴子大战金牌').
     Returns the new count, 0 if the id is unknown. A 配方 you already have turns into one 改装图纸 */
  grant(id, n, reason){
    n = Math.round(n == null ? 1 : +n);
    if (!tnThing(id) || !(n > 0)) return 0;
    if (TN_BP[id]){
      if (tune.bp[id]) return XParts.grant('plan', 1, (reason ? reason + ' · ' : '') + '配方重复，换成图纸');
      tune.bp[id] = 1; tuneWrite(); tnGainShow(id, 1, reason); if (tn.on) tnRender(); return 1;
    }
    tune.inv[id] = Math.min(9999, (tune.inv[id] || 0) + n); tuneWrite();
    tnGainShow(id, n, reason); if (tn.on) tnRender();
    return tune.inv[id];
  },
  /* the drop of one game at one grade (0 best … 3 nothing), from TN_DROPS in js/42-tuning.js.
     Returns what was given, as [{id, n}], for the result screen: XParts.chips(list) / XParts.text(list).
     A table with cd / day (打卡、擦车、特技、喷漆…) gives nothing while it is cooling down or after its daily count; only a real drop counts */
  reward(game, grade, reason){
    const D = TN_DROPS[game], gr = Math.max(0, Math.min(3, grade | 0)), g = D && D.g[gr]; if (!g || !g.length) return [];
    if (!XParts.ready(game)) return [];
    const why = reason || D.name + TN_GRADE[gr], out = [];
    for (const [id0, n, p] of g){
      if (p != null && Math.random() >= p) continue;
      let id = id0;
      if (id === 'bp_*'){ const pool = (TN_BP_POOL[game] || []).filter(b => !tune.bp[b]); id = pool.length ? pool[(Math.random() * pool.length) | 0] : 'plan'; }
      else if (id.includes('|')){ const a = id.split('|'); id = a[(Math.random() * a.length) | 0]; }
      out.push(...XParts.roll(id, n, 1, why));
    }
    if (out.length && (D.cd || D.day)){ const l = tnLim(game); l.n++; l.t = Date.now(); tuneWrite(); }
    return out;
  },
  /* one part with chance p (1 = always), as a list for the result screen; a 配方 you already have comes back as 1 改装图纸 */
  roll(id, n, p, reason){
    if (p != null && Math.random() >= p) return [];
    const dup = TN_BP[id] && tune.bp[id];
    if (!XParts.grant(id, n, reason)) return [];
    return [dup ? {id:'plan', n:1} : {id, n:TN_BP[id] ? 1 : n}];
  },
  /* can this game drop right now? false while its cd runs or once its daily count is used up */
  ready(game){
    const D = TN_DROPS[game]; if (!D) return false; if (!D.cd && !D.day) return true;
    const l = tnLim(game);
    return !(D.day && l.n >= D.day) && !(D.cd && Date.now() - l.t < D.cd * 1000);
  },
  /* the usual drop for a medal (0 金 / 1 银 / 2 铜): 涡轮 / 碳纤维板 / 赛车漆料; no medal (3 or more) gives nothing */
  medal(medal, reason){ return XParts.reward('arcade', medal, reason).length; },
  text:list => (list || []).map(x => `${tnThing(x.id).name}${TN_BP[x.id] ? '' : ' ×' + x.n}`).join('、'),
  /* a row of chips for a result card (HTML string; empty when nothing dropped) */
  chips(list){
    if (!list || !list.length) return '';
    return '<div class="tn-loot"><span>改装零件</span>' + list.map(x => { const t = tnThing(x.id);
      return `<b class="r-${t.rar}" style="--c:${t.color}"><i>${t.ch}</i>${t.name}${TN_BP[x.id] ? '' : ' ×' + x.n}</b>`; }).join('') + '</div>';
  },
  has:id => !!tune.bp[id]
};
/* per-game cooldown and daily count (tune.lim, saved): {d:'2026-11-11', n:drops today, t:last drop ms} */
function tnLim(game){
  const today = typeof dayKey === 'function' ? dayKey() : new Date().toDateString();
  let l = tune.lim[game]; if (!l || l.d !== today) l = tune.lim[game] = {d:today, n:0, t:l ? l.t : 0};
  return l;
}
const tnHas = need => Object.keys(need).every(p => (tune.inv[p] || 0) >= need[p]);
const tnShort = need => Object.keys(need).filter(p => (tune.inv[p] || 0) < need[p]);

/* small chips under the HUD: "+1 轮毂坯件 · 送外卖" */
const tnGainEl = document.createElement('div'); tnGainEl.id = 'tnGain'; tnGainEl.setAttribute('aria-live', 'polite'); document.body.appendChild(tnGainEl);
function tnGainShow(id, n, reason){
  const p = tnThing(id), el = document.createElement('div'); el.className = 'tn-gain r-' + p.rar; el.style.setProperty('--c', p.color);
  el.innerHTML = '<i></i><b></b><span></span>'; el.querySelector('i').textContent = p.ch; el.querySelector('b').textContent = TN_BP[id] ? '新配方：' + p.name : `+${n} ${p.name}`;
  el.querySelector('span').textContent = reason ? '· ' + reason : '';
  tnGainEl.appendChild(el); while (tnGainEl.children.length > 3) tnGainEl.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
  if (p.rar === 'l' || p.rar === 'b'){ for (let i = 0; i < 4; i++) tone('triangle', 784 * Math.pow(1.26, i), 784 * Math.pow(1.26, i), .14, .08, i * .07); }
  else { tone('triangle', 1046, 1046, .08, .07); tone('triangle', 1568, 1568, .12, .06, .07); }
}

/* ---------- where the parts come from ----------
   Each game calls XParts.reward(…) in its own end-of-round code (js/92-racing.js, js/89-dorm.js, js/87-heist.js, js/89-swing-monkeys.js,
   js/89-outskirts-play.js, js/85-activities.js, js/70-hole.js, js/80-gta.js, js/88-wardrobe-ui.js, js/50-missions.js) and shows the chips on its result screen. Here: plain deliveries, the B1 arcade, achievements. */
const tnW = {deliv:prog.life.deliv || 0, dt:+prog.best.o_dt || 0};
function tnWatchDeliv(){
  const d = prog.life.deliv || 0, dt = +prog.best.o_dt || 0;
  /* a 得来速 order pays its own parts (js/89-outskirts-play.js); every other delivery: one 轮毂坯件 */
  if (d > tnW.deliv){ const n = d - tnW.deliv - Math.max(0, dt - tnW.dt); if (n > 0) XParts.grant('rim', n, '送外卖'); }
  tnW.deliv = d; tnW.dt = dt;
}
/* B1 小游戏: a game picks its drop table with `parts:'hoops'` in XMini.register (js/minigames/*); the others get the 'arcade' one */
if (typeof mgFinish === 'function'){
  const base = mgFinish;
  mgFinish = function(score){
    let md = 3, g = null;
    try { g = MG.cur; if (g && arcPlaying() && score != null && isFinite(score)) md = mgMedal(g, Math.round(score * 100) / 100); } catch(e){}
    const r = base.apply(this, arguments);
    if (g && md < 3){
      const loot = XParts.reward(TN_DROPS[g.parts] ? g.parts : 'arcade', md, (g.name || 'B1 小游戏') + GX_MEDAL[md]);
      try { const h = XParts.chips(loot); if (h && typeof mgCard !== 'undefined'){ const el = document.createElement('div'); el.innerHTML = h; mgCard.insertBefore(el.firstChild, mgCard.querySelector('.hrow')); } } catch(e){}
    }
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
achAdd([['tune1', '改装入门', '第一次提到改装好的车', 20], ['tunewide', '宽体怪兽', '一辆车同时装上宽体和尾翼', 60], ['tunefull', '全副武装', '一辆车有 10 项以上改装', 120],
  ['tunebp', '配方收藏家', '集齐 5 张改装配方', 80], ['tunetop', '顶级改装', '提到一件顶级改装', 150]]);

/* ---------- on the cars ---------- */
function tnApplyMine(fit){
  if (!myCar) return;
  tnApply(myCar, fit || tnCar(myCar.kind).fit);
  /* the stats follow what is really fitted, not a preview (and not in the middle of a race: js/92-racing.js holds its own copy) */
  if (!fit && (typeof RC === 'undefined' || RC.st === 'idle')) myCar.T = tunedT(myCar.kind);
}
{ const base = spawnMine; spawnMine = function(kind, x, z, h){ const it = base(kind, x, z, h); tnApplyMine(); return it; }; }
tnApplyMine();
tnApply(showCar, TN_SHOWCASE);   /* the 车行 turntable shows what the workshop can do */
/* 性能改装 (TN_PERF in js/42-tuning.js): the perf fields of the fitted parts, as fractions, on top of the 改装店 levels */
const tnPerf = kind => tnPerfOf(kind, tnCar(kind).fit);
function tnTuned(kind, fit){
  const t = tunedBase(kind); if (!TN_PERF || !TN_KINDS.includes(kind)) return t;
  const p = tnPerfOf(kind, fit || tnCar(kind).fit);
  t.acc *= 1 + p.acc * TN_PERF; t.maxV *= 1 + p.maxV * TN_PERF; t.grip *= 1 + p.grip * TN_PERF; t.steer *= 1 + p.steer * TN_PERF; return t;
}
const tunedBase = tunedT;
tunedT = kind => tnTuned(kind);
if (myCar) myCar.T = tunedT(myCar.kind);
/* 总资产: built parts and the ones in the bays at coins + parts used, unspent parts at their value, 配方 RM 60 each, the second bay at its price */
assetSource('carmods', () => {
  let s = (tune.bays - 1) * TN_BAY2;
  for (const p of TN_PARTS) s += (tune.inv[p.id] || 0) * p.rm;
  for (const b of TN_BPS) if (tune.bp[b.id]) s += b.rm;
  for (const k in tune.cars) s += tnCarAssets(k);
  for (const j of tune.jobs) if (!tune.cars[j.kind]) s += tnWorth(TN.byKey[j.k]);
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
const tnMinFmt = m => m < 60 ? `${m} 分钟` : m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m / 60} 小时`;
/* 新手首单 30 秒只给轻改和中改（开张礼包够做的那些）；高级和顶级照常等，首单优惠留给下一件轻改或中改 */
const tnQuick = it => !tune.first && (it.tier === 'n' || it.tier === 'r');
const tnMinTxt = it => tnQuick(it) ? `${TN_FIRST_SEC} 秒（新手首单）` : tnMinFmt(it.min) + (it.min >= 1200 ? '，明天再来提车' : '') + (!tune.first ? '（新手首单 30 秒只限轻改和中改）' : '');
const tnBpOk = it => !it.bp || !!tune.bp[it.bp];
function tnOrder(key){
  const it = TN.byKey[key], kind = myCar && myCar.kind; if (!it || !kind || !tnItemOk(kind, it)) return false;
  if (tnOwns(kind, key) || tnJobOf(kind, key) || tune.jobs.length >= tune.bays || money < it.rm || !tnHas(it.need) || !tnBpOk(it)) return false;
  money -= it.rm; tune.spent += it.rm; for (const p in it.need) tune.inv[p] -= it.need[p];
  const now = Date.now(), quick = tnQuick(it), sec = quick ? TN_FIRST_SEC : it.min * 60; if (quick) tune.first = true;
  tune.jobs.push({k:key, kind, t0:now, t1:now + sec * 1000, told:false});
  moneyChanged(); tuneWrite();
  tone('square', 220, 180, .12, .05); tone('square', 330, 300, .1, .04, .12);
  return true;
}
/* 加急: RM 12 a minute for the first half hour, then cheaper the longer the job (a 22-hour engine is about RM 3,000);
   or 改装图纸: one for 20 minutes, growing with the square root (22 hours = 9 张) */
const tnRushRM = j => { const m = Math.ceil(tnLeft(j) / 60000); return Math.max(10, Math.round(12 * Math.min(30, m) + 6 * Math.pow(Math.max(0, m - 30), .85))); };
const tnRushPlan = j => Math.max(1, Math.ceil(Math.sqrt(tnLeft(j) / (20 * 60000))));
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
  if (mine){ tn.try[it.slot] = it.id; tnApplyMine(tn.on ? tn.try : null); if (tn.on) myCar.T = tunedT(myCar.kind); tnSparkle(); }
  const name = (SHOP.find(s => s.kind === j.kind) || {}).name || CAR_T[j.kind].name;
  tnDone('提车：' + it.name, mine ? `已经装在你的${name}上了，开出去给大家看看` : `装在你的${name}上了，叫它出来就能看到`);
  unlock('tune1');
  if (it.tier === 'x') unlock('tunetop');
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
  if (Object.keys(tune.bp).length >= 5) unlock('tunebp');
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
  stance:'<path d="M3 12.5h18v-2l-3-1-3-3H9l-3 3-3 1z"/><circle cx="7.5" cy="13.5" r="2"/><circle cx="16.5" cy="13.5" r="2"/><path d="M12 16.5v4M10 18.8l2 1.8 2-1.8"/>',
  perf:'<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4.5-5.5"/><circle cx="12" cy="17" r="1.4"/>',
  skill:'<path d="M9 3h6v3H9z"/><rect x="7.5" y="6" width="9" height="14" rx="3"/><path d="M12 10v6M9.5 13h5"/>',
  trail:'<path d="M3 15c4 0 5-6 9-6s4 4 9 4"/><path d="M3 19c4 0 6-4 10-4s5 2 8 2"/><circle cx="19.5" cy="7" r="1.5"/>'
};
/* one icon per part slot (the tab icon is the fallback): a page of engines no longer shows the same gauge on every card */
const TN_SLOT_ICON = {
  eng:'<path d="M5 9h3V7h7v2h2l2 2h2.5v6H19l-2 2H8.5L7 17H5z"/><path d="M2.5 11v4M5 13H2.5M10 7V4.5h3V7"/><path d="M10 12.5l2-2 1.5 1.5 2-2"/>',
  tyre:'<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="4.6"/><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M5.8 18.2l1.7-1.7M16.5 7.5l1.7-1.7"/>',
  susp:'<path d="M12 2.5v3M12 18.5v3M8 5.5h8M8 18.5h8"/><path d="M8 7.5l8 1.5-8 1.5 8 1.5-8 1.5 8 1.5-8 1.5"/>',
  nos:'<path d="M9.5 3h5v3h-5z"/><rect x="7.5" y="6" width="9" height="14.5" rx="3"/><path d="M13 9.5l-2.5 4h3l-2.5 4"/>',
  skill:'<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="2.2"/><path d="M3.6 10.6c2.6-1 5.6-1.3 8.4-1.3s5.8.3 8.4 1.3M12 14.2v6.6"/>',
  size:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="1.8"/><path d="M12 4.8v5.4M12 13.8v5.4M4.8 12h5.4M13.8 12h5.4"/>',
  otyre:'<circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/><path d="M10 2.6h4l.6 2.6 2.4-1.2 2.8 2.8-1.2 2.4 2.6.6v4l-2.6.6 1.2 2.4-2.8 2.8-2.4-1.2-.6 2.6h-4l-.6-2.6-2.4 1.2-2.8-2.8 1.2-2.4-2.6-.6v-4l2.6-.6L4.2 6.8 7 4l2.4 1.2z"/>',
  wide:'<path d="M6.5 17h11v-3.5l-2-4.5h-7l-2 4.5z"/><path d="M8.5 13.5h7"/><path d="M1.8 13.5h2.7M19.5 13.5h2.7M3.2 11.6l-1.4 1.9 1.4 1.9M20.8 11.6l1.4 1.9-1.4 1.9"/>',
  lip:'<path d="M4 14v-3l3-4.5h10l3 4.5v3z"/><path d="M7.5 11h9"/><path d="M2.5 17.5h19" stroke-width="2.4"/>',
  skirt:'<path d="M2.5 13.5h19v-2l-3-1.2-3.2-3.3H8.6L5.4 10.3l-2.9 1z"/><circle cx="7" cy="14.5" r="1.7"/><circle cx="17" cy="14.5" r="1.7"/><path d="M5 18.5h14" stroke-width="2.4"/>',
  diff:'<path d="M3 7.5h18v5H3z"/><path d="M7.5 7.5v5M16.5 7.5v5"/><path d="M5.5 12.5L4 19M9.5 12.5L9 19M14.5 12.5L15 19M18.5 12.5L20 19"/>',
  hood:'<path d="M6 21V8.5L8.5 3h7L18 8.5V21"/><path d="M9.5 10.5h5M9.5 13.5h5M9.5 16.5h5"/>',
  aero:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h5.3V4M14.7 4v5.3H20M4 14.7h5.3V20M14.7 20v-5.3H20M9.3 9.3h5.4v5.4H9.3z"/>',
  neon:'<path d="M2.5 13.5h19v-2l-3-1.2-3.2-3.3H8.6L5.4 10.3l-2.9 1z"/><path d="M4 17h3M10.5 17h3M17 17h3M5.5 20h2.5M11 20h2M16 20h2.5"/>',
  drl:'<path d="M3.5 7.5c4-1.2 7.5-1.2 9.5 0v9c-2 1.2-5.5 1.2-9.5 0z"/><path d="M6 10.5h4.5"/><path d="M16 8l5-1.2M16 12h5M16 16l5 1.2"/>',
  camber:'<path d="M3.5 5h3.5l3 14H6.5z"/><path d="M20.5 5H17l-3 14h3.5z"/><path d="M10 12h4"/>',
  lift:'<path d="M3 15.5h18v-2l-3-1-3-3H9l-3 3-3 1z"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M12 7V2.5M10 4.4l2-1.9 2 1.9"/>',
  rack:'<path d="M3 17h18v-4H3z"/><path d="M5.5 13l2-4h9l2 4"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/><path d="M5.5 5.5h13M8 5.5V9M16 5.5V9M11 5.5V9M13 5.5V9"/>',
  winch:'<path d="M3 7h18v5.5H3z"/><path d="M7 7v5.5M17 7v5.5"/><path d="M12 12.5v4"/><path d="M12 16.5a2.2 2.2 0 1 1-2.2 2.2"/>',
  fair:'<path d="M3.5 16c.6-5.6 5-10 11-10.5l3.5 3.5-2.8 7z"/><path d="M14.5 5.5L17 3"/><path d="M8 16l2.5-6h5"/>',
  f1wing:'<path d="M2 15.5h20M3.5 15.5v-4h17v4"/><path d="M9 11.5V8h6v3.5"/><path d="M12 8V4.5"/>',
  f1tyre:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6"/>',
  f1brake:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6"/><path d="M14.6 3.8a8.6 8.6 0 0 1 5.6 5.6L17.4 10.6a5.6 5.6 0 0 0-3.9-3.9z"/><path d="M8 9.5h.01M8.5 15h.01M13 17h.01"/>',
  f1body:'<path d="M6 9.5h12l2 10.5H4z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 5 0"/><path d="M9 15h6"/>',
  f1map:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 15.5l3-4 3 2 3-5 3 3"/>'
};
Object.assign(TN_SLOT_ICON, {mexh:TN_ICON.exh, mrim:TN_ICON.wheel, rim:TN_ICON.wheel, low:TN_ICON.stance});
const tnSvg = k => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${TN_SLOT_ICON[k] || TN_ICON[k]}</svg>`;
const tnEl = document.createElement('div');
tnEl.className = 'panel'; tnEl.id = 'tune'; tnEl.hidden = true; tnEl.setAttribute('role', 'dialog'); tnEl.setAttribute('aria-labelledby', 'tuneT');
tnEl.innerHTML = `<button class="x" id="tunex" aria-label="关闭">×</button>
  <div class="shop-h"><h2 id="tuneT">改装车间</h2><span id="tuneMoney">RM 0.00</span></div>
  <div class="tn-inv" id="tuneInv" role="group" aria-label="改装道具和配方"></div>
  <div class="tn-q" id="tuneQ"></div>
  <div class="tn-stats" id="tuneStats" aria-live="polite"></div>
  <div class="wd-tabs" id="tuneTabs" role="tablist"></div>
  <div class="tn-list" id="tuneList"></div>
  <div class="wd-done" id="tuneDone" role="status" aria-live="polite" hidden></div>
  <div class="wd-foot"><div class="wd-sel"><b id="tuneName"></b><span id="tuneDesc"></span><span class="tn-cost" id="tuneCost"></span><div class="tn-where" id="tuneWhere" hidden></div></div><div class="wd-btns"><button class="btn buy" id="tuneGo"></button></div></div>`;
document.body.appendChild(tnEl);
const tn = {on:false, tab:'perf', sel:null, try:{}, yaw:0, pitch:.22, zoom:1, drag:null, wasPaused:false, view:''};
const tnSel = () => tn.sel && TN.byKey[tn.sel];
const tnTabsFor = kind => TN_TABS.filter(([t]) => TN_SLOTS.some(s => s.tab === t && tnSlotOk(kind, s) && TN.bySlot[s.id].some(it => !tnIsStock(it) && tnItemOk(kind, it))));

/* 改前 → 改后: the four numbers of the car as fitted, and as previewed */
const TN_STAT = [['acc', '加速', t => t.acc.toFixed(1), 36], ['maxV', '极速', t => Math.round(t.maxV * 3.6), 100], ['steer', '操控', t => Math.round(t.steer * 100), 1], ['grip', '抓地', t => t.grip.toFixed(1), 11]];
function tnRenderStats(){
  if (!myCar) return;
  const k = myCar.kind, a = tnTuned(k), b = tnTuned(k, tn.try);
  $('#tuneStats').innerHTML = TN_STAT.map(([f, n, show, top]) => {
    const d = b[f] / a[f] - 1, max = f === 'steer' ? 1 : top, ch = Math.abs(d) > .0005;
    return `<div class="${ch ? (d > 0 ? 'up' : 'dn') : ''}"><span>${n}</span><b>${show(a)}${ch ? `<i>→ ${show(b)}</i>` : ''}</b>`
      + `<em style="--a:${Math.min(1, a[f] / max).toFixed(3)};--b:${Math.min(1, b[f] / max).toFixed(3)}"></em></div>`;
  }).join('');
}
function tnRender(){
  if (!tn.on) return;
  $('#tuneMoney').textContent = fmtRM(money);
  $('#tuneT').textContent = '改装车间 · ' + (myCar ? myCar.T.name : '');
  const nbp = Object.keys(tune.bp).length;
  $('#tuneInv').innerHTML = `<button type="button" class="tn-p tn-bpb${tn.sel === 'p:bp' ? ' sel' : ''}" data-p="bp" aria-label="改装配方 ${nbp} / ${TN_BPS.length} 张"><i>配</i><b>${nbp}/${TN_BPS.length}</b></button>`
    + TN_PARTS.map(p => `<button type="button" class="tn-p r-${p.rar}${tn.sel === 'p:' + p.id ? ' sel' : ''}${tune.inv[p.id] ? '' : ' zero'}" data-p="${p.id}" style="--c:${p.color}" aria-label="${p.name}（${TN_RAR[p.rar].name}）${tune.inv[p.id] || 0} 个"><i>${p.ch}</i><b>${tune.inv[p.id] || 0}</b></button>`).join('');
  tnRenderQ(); tnRenderStats();
  const kind = myCar.kind, fit = tnCar(kind).fit, tabs = tnTabsFor(kind);
  if (!tabs.some(([t]) => t === tn.tab)) tn.tab = tabs[0][0];
  $('#tuneTabs').innerHTML = tabs.map(([t, n]) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tn.tab}">${n}</button>`).join('');
  if (tn.sel === 'p:bp'){ tnRenderBps(); tnFoot(); return; }
  const slots = TN_SLOTS.filter(s => s.tab === tn.tab && tnSlotOk(kind, s));
  let h = tn.tab === 'trail' ? `<button type="button" class="tn-tog" id="tuneTrailTog" aria-pressed="${!tune.trailOff}">尾焰特效：${tune.trailOff ? '关' : '开'}<small>${typeof XQ !== 'undefined' && XQ.level === 'low' ? '流畅画质下画简化版' : '只是看的，关掉不影响零件'}</small></button>` : '';
  h += slots.map(s => `<h4>${s.name}</h4><div class="wd-grid" role="listbox" aria-label="${s.name}">` + TN.bySlot[s.id].filter(it => tnItemOk(kind, it) || tnOwns(kind, it.key)).map(it => {
    const own = tnOwns(kind, it.key), on = fit[s.id] === it.id, job = tnJobOf(kind, it.key), sel = tn.sel === it.key, tr = tn.try[s.id] === it.id;
    const tag = on ? '<em class="on">在用</em>' : own ? '<em>已有</em>' : job ? (tnReady(job) ? '<em class="on">待提车</em>' : '<em class="b">施工中</em>')
      : !tnBpOk(it) ? '<em class="lk">缺配方</em>' : `<em class="p">RM ${it.rm.toLocaleString()}</em>`;
    const tier = it.tier !== 'n' ? `<i class="t-${it.tier}">${TN_TIERC[it.tier]}</i>` : '';
    const col = it.col ? ` style="background:${it.col}${s.id === 'neonc' || s.id === 'trailc' ? ';box-shadow:0 0 10px ' + it.col : ''}"` : '';
    return `<button type="button" role="option" class="wd-it tn-it${sel ? ' sel' : ''}${tr && !sel && !on ? ' tr' : ''} tier-${it.tier}" aria-selected="${sel}" data-k="${it.key}">
      <span class="wd-sw tn-ic"${col}>${it.col ? '' : tnSvg(TN_SLOT_ICON[s.id] ? s.id : s.tab)}</span><b>${it.name}</b>${tier}${tag}</button>`;
  }).join('') + '</div>').join('');
  $('#tuneList').innerHTML = h;
  tnFoot();
}
/* the recipe book: which top-tier parts each one unlocks and where it drops */
function tnRenderBps(){
  $('#tuneList').innerHTML = '<h4>改装配方 · 拿到一次永久解锁</h4><div class="tn-bps">' + TN_BPS.map(b => `<div class="tn-bp${tune.bp[b.id] ? ' got' : ''}">
    <i>${b.ch}</i><b>${b.name}</b><span>解锁：${b.for}</span><small>${tune.bp[b.id] ? '已拥有' : '去哪儿拿：' + b.from}</small></div>`).join('') + '</div>';
}
function tnRenderQ(){
  const q = $('#tuneQ'); let h = '';
  /* nothing in the bays: one short line, so the parts list keeps its room on a phone */
  if (!tune.jobs.length) h += `<div class="tn-bay idle"><b>施工位${tune.bays > 1 ? ' ×2' : ''}</b><span>空着 · 选好零件点「下单施工」</span></div>`;
  else for (let i = 0; i < tune.bays; i++){
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
  const where = $('#tuneWhere'); where.hidden = true; where.innerHTML = '';
  if (tn.sel === 'p:bp'){
    name.textContent = `改装配方 ${Object.keys(tune.bp).length} / ${TN_BPS.length}`; desc.textContent = '顶级改装要「配方 + 稀有零件」。宿舍撤离、教学楼潜入最容易出配方；重复的配方换成改装图纸。'; go.hidden = true; return;
  }
  if (tn.sel && tn.sel.startsWith('p:')){
    const p = TN_PART[tn.sel.slice(2)];
    name.textContent = `${p.name} × ${tune.inv[p.id] || 0} · ${TN_RAR[p.rar].name}`; desc.textContent = '去哪儿拿：' + p.from + '。不能用钱买。'; go.hidden = true; return;
  }
  const it = tnSel();
  if (!it){
    name.textContent = '点一个零件预览';
    desc.textContent = !tune.first ? '预览免费，上面的数值会显示改前和改后。新手首单 30 秒完工（只限轻改和中改），之后越高级的改装要等越久，车照样能开'
      : '预览免费，上面的数值会显示改前和改后。轻改几分钟、中改几十分钟、高级几小时、顶级要等一天';
    go.hidden = true; return;
  }
  const kind = myCar.kind, fit = tnCar(kind).fit, job = tnJobOf(kind, it.key), slot = TN_SLOTS.find(s => s.id === it.slot);
  name.textContent = it.name + (it.tier !== 'n' ? ' · ' + TN_TIERC[it.tier] : '');
  desc.textContent = (it.desc || slot.name) + ((it.slot === 'neonc' && fit.neon === 'none' && fit.rim !== 'glow') ? '（要先装底盘霓虹或发光轮毂才看得见）'
    : it.slot === 'trailc' && fit.trail === 'none' ? '（要先装尾焰才看得见）' : '');
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
  const bp = it.bp && TN_BP[it.bp];
  cost.innerHTML = `<span class="${money >= it.rm ? '' : 'no'}">${fmtRM(it.rm)}</span>`
    + (bp ? `<span class="pt bp${tune.bp[bp.id] ? '' : ' no'}" style="--c:${bp.color}"><i>${bp.ch}</i>${bp.name}${tune.bp[bp.id] ? ' ✓' : ''}</span>` : '')
    + Object.keys(it.need).map(p => {
      const P = TN_PART[p], have = tune.inv[p] || 0; return `<span class="pt r-${P.rar}${have >= it.need[p] ? '' : ' no'}" style="--c:${P.color}"><i>${P.ch}</i>${P.name} ${have}/${it.need[p]}</span>`;
    }).join('') + `<span class="tm">${TN_TIER[it.tier]}施工 ${tnMinTxt(it)}</span>`;
  const short = tnShort(it.need);
  /* what is missing and where it drops, right here (before, you had to find its chip in the parts bar, which on a PC ran off the edge) */
  const miss = (bp && !tune.bp[bp.id] ? [bp] : []).concat(short.map(p => TN_PART[p]));
  if (miss.length && tnItemOk(kind, it)){ where.innerHTML = '<em>缺的去哪儿拿</em>' + miss.map(m => `<div><b>${m.name}</b>：${m.from}</div>`).join(''); where.hidden = false; }
  if (!tnItemOk(kind, it)){ go.textContent = '这辆车装不了'; go.disabled = true; go.className = 'btn'; }
  else if (tune.jobs.length >= tune.bays){ go.textContent = '施工位满了'; go.disabled = true; go.className = 'btn'; }
  else if (!tnBpOk(it)){ go.textContent = '缺配方：' + bp.name; go.disabled = true; go.className = 'btn'; }
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
  if (window.XTuneDrive) XTuneDrive.preview(it);
}
function tnGo(){
  const it = tnSel(); if (!it || !myCar) return;
  const kind = myCar.kind, c = tnCar(kind), job = tnJobOf(kind, it.key);
  if (tnOwns(kind, it.key)){
    c.fit[it.slot] = it.id; tuneWrite(); tnApplyMine(tn.try); myCar.T = tunedT(kind); sfx.ding(); tnRender(); tnDone((tnIsStock(it) ? '换回了：' : '装上了：') + it.name, '已存档，下次叫车也是这样');
    if (c.fit.wide !== 'stock' && c.fit.wing !== 'none') unlock('tunewide');
    if (tnMods(c.fit) >= 10) unlock('tunefull');
    return;
  }
  if (job){ if (tnReady(job)) tnPickup(tune.jobs.indexOf(job)); return; }
  const quick = tnQuick(it);
  if (!tnOrder(it.key)) return;
  tnRender();
  tnDone('下单了：' + it.name, quick ? '新手首单，30 秒就好，先在这儿看着它完工' : `${TN_TIER[it.tier]}要 ${tnMinTxt(it)}。车照样能开，完工后会提醒你回车行提车`);
}
/* a shower of sparks round the car when a part goes on */
function tnSparkle(){
  if (!myCar) return;
  for (let i = 0; i < 22; i++){ const a = rnd() * Math.PI * 2, r = myCar.T.L * .55;
    spawnPart('dust', myCar.x + Math.cos(a) * r, myCar.y + .2 + rnd() * myCar.T.H, myCar.z + Math.sin(a) * r, .35 + rnd() * .3, {vy:1.5 + rnd() * 2, g:3, life:.8 + rnd() * .5, op:1, color:rnd() < .5 ? '#ffd25a' : '#ffffff'}); }
  sfx.sparkle(); tone('square', 1400, 1900, .06, .04); tone('square', 1700, 2300, .06, .04, .08);
}
$('#tuneList').addEventListener('click', e => {
  if (e.target.closest('#tuneTrailTog')){ ac(); tune.trailOff = !tune.trailOff; tuneWrite(); tnRender(); return; }
  const b = e.target.closest('[data-k]'); if (b){ ac(); tnPick(b.dataset.k); }
});
$('#tuneInv').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b){ ac(); tnPick('p:' + b.dataset.p); } });
$('#tuneQ').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; ac();
  if (b.dataset.pick != null) tnPickup(+b.dataset.pick);
  else if (b.dataset.rush != null) tnRush(+b.dataset.rush, false);
  else if (b.dataset.rushp != null) tnRush(+b.dataset.rushp, true);
  else if (b.dataset.bay != null) tnBay();
});
$('#tuneTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; ac(); tn.tab = b.dataset.tab; if (tn.sel === 'p:bp') tn.sel = null; tnRender(); tnAim(); });
$('#tuneTabs').addEventListener('keydown', e => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault();
  const tabs = tnTabsFor(myCar.kind), i = tabs.findIndex(x => x[0] === tn.tab); tn.tab = tabs[(i + d + tabs.length) % tabs.length][0]; tnRender(); tnAim();
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
function tnAim(){ const a = {wheel:.9, body:.75, wing:2.5, light:.35, exh:2.75, stance:1.55, perf:.9, skill:2.6, trail:2.9}[tn.tab]; if (a != null && myCar){ tn.yaw = myCar.h + a; tn.pitch = tn.tab === 'light' || tn.tab === 'stance' ? .1 : .22; } }
let tnLast = 0;
function tnFrame(now){
  if (!tn.on) return;
  requestAnimationFrame(tnFrame);
  const dt = Math.min(.05, (now - (tnLast || now)) / 1000); tnLast = now;
  if (!myCar){ tnClose(); return; }
  if (!tn.drag && !REDUCED) tn.yaw += dt * .18;
  const T = myCar.T, W = window.innerWidth, H = window.innerHeight, r = tnEl.getBoundingClientRect(), wide = r.left > W * .3;   /* side panel, not the bottom sheet */
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
  if (window.XTuneDrive) XTuneDrive.showroom(dt);
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
   XTuneDebug.ff(分钟) 施工快进（不填就全部完工）· give('cf', 5) 发道具 · kit(10) 每样道具都发 · bp() 配方全给 ·
   all() 道具 + 配方 + 钱都给够 · car('moto') 送一辆车并叫出来 · drop('race', 0) 按掉落表发一次（有冷却的玩法也照样发）·
   lim() 看每个玩法今天掉了几次、还要冷却几秒 · unlim() 清掉冷却和每日次数 · top('lambo') 全部顶配的金币、改装价值和施工时间 · reset() 清空改装存档 */
const TN_DEV = !/(^|\.)github\.io$/i.test(location.hostname) || /\/preview\//.test(location.pathname);
if (TN_DEV) window.XTuneDebug = {
  ff(min){ for (const j of tune.jobs){ j.t1 = min == null ? Date.now() : j.t1 - min * 60000; j.t0 = Math.min(j.t0, j.t1 - 1000); } tuneWrite(); tnTick(); if (tn.on) tnRender(); return tune.jobs.map(j => j.k + ' ' + tnFmt(tnLeft(j))); },
  give(id, n){ return XParts.grant(id, n == null ? 5 : n, '调试'); },
  kit(n){ for (const p of TN_PARTS) tune.inv[p.id] += n == null ? 10 : n; tuneWrite(); if (tn.on) tnRender(); return Object.assign({}, tune.inv); },
  bp(){ for (const b of TN_BPS) tune.bp[b.id] = 1; tuneWrite(); if (tn.on) tnRender(); return Object.keys(tune.bp); },
  all(){ this.kit(30); this.bp(); money += 50000; tune.first = true; tune.bays = 2; moneyChanged(); tuneWrite(); if (tn.on) tnRender(); return 'ok'; },
  car(kind){ if (!CAR_T[kind] || !SHOP.some(s => s.kind === kind)) return 'no such car'; owned.add(kind); saveGame(); summon(kind); return kind; },
  drop(game, grade){ const l = tune.lim[game]; delete tune.lim[game]; const r = XParts.reward(game, grade == null ? 0 : grade, '调试'); if (l && !r.length) tune.lim[game] = l; return r; },
  lim(){ const o = {}; for (const g in TN_DROPS){ const D = TN_DROPS[g]; if (!D.cd && !D.day) continue; const l = tnLim(g);
    o[g] = `今天 ${l.n} / ${D.day || '∞'}` + (D.cd ? ` · 冷却 ${Math.max(0, Math.ceil(D.cd - (Date.now() - l.t) / 1000))} 秒` : ''); } return o; },
  unlim(){ tune.lim = {}; tuneWrite(); return 'ok'; },
  /* the most expensive item in every slot this car can fit: coins, 改装价值 (coins + parts) and build minutes */
  top(kind){ kind = kind || (myCar && myCar.kind) || 'lambo'; let rm = 0, val = 0, min = 0;
    for (const sl of TN_SLOTS){ if (!tnSlotOk(kind, sl)) continue; const it = TN.bySlot[sl.id].filter(x => tnItemOk(kind, x)).sort((x, y) => y.rm - x.rm)[0]; if (!it || !it.rm) continue; rm += it.rm; val += tnWorth(it); min += it.min; }
    const car = (SHOP.find(s => s.kind === kind) || {}).price || 0;
    return {kind, car, coins:rm, value:val, x:+(val / Math.max(1, car)).toFixed(2), hours:+(min / 60).toFixed(1)}; },
  /* build and fit everything at once on the current car: XTuneDebug.fit({nos:'n3', trail:'plasma'}) */
  fit(f){ if (!myCar) return 'no car'; const c = tnCar(myCar.kind); for (const s in f){ const k = s + '.' + f[s]; if (TN.byKey[k]){ if (!c.own.includes(k)) c.own.push(k); c.fit[s] = f[s]; } } tuneWrite(); tnApplyMine(); return c.fit; },
  reset(){ try { localStorage.removeItem(TN_KEY); } catch(e){} location.reload(); },
  get state(){ return tune; }
};
