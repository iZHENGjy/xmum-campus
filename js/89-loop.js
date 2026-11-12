/* XMUM 校园漫游 · 玩法闭环：「下一个目标」一行 + 每日目标
 *
 * 赚钱 → 买车 / 改装 → 比赛 / 挑战 → 排名 / 展示 → 下一个目标 → 回来继续。这个文件只把现成的系统接起来，不加新玩法：
 *
 * ① 下一个目标（钱包面板里、主线任务条下面一行）：按存档挑一个最近的目标，比如「再赚 RM 380 → 保时洁 911」「轮毂坯件 3/5 → 锻造轮毂」
 *    「零件够了 → 去改装店装 双罐氮气」「雪邦单圈进 2:25」。点一下打开对应的面板（车行 / 改装 / 衣橱），或者在指南针上设一个路点（房子、赛车围场）。
 *    主线还有步骤时让给主线（任务条已经在说下一步了），只在主线做完、或者没有主线文件时出现。送单、比赛、室内时收起。
 * ② 每日目标（同一行左边的小牌子「今日 1/3」，点开是一张小卡片）：每天 3 个小目标，按本地日期换。
 *    第一个永远是原来的「今日加急：某个食堂第一单报酬翻倍」（奖励就是那个 ×2，不另外给钱）；另外两个从已经解锁的玩法里抽：
 *    一个赚钱的（送单、顺风车、得来速），一个玩的（挑战赛、竞速、甩保安、特技、B1 小游戏、黑洞、宿舍撤离、雪邦……）。
 *    奖励：赚钱的 RM 30，玩的 RM 40；三个都做完再给 RM 40 和 1 个普通改装道具（轮毂坯件或赛车漆料）；
 *    连续几天全做完，每多一天 +RM 10，最多 +RM 50。一天最多 RM 160 + 1 个普通道具，不碰任何现有掉落率。
 *    进度靠轮询现成的计数（prog.life.deliv / taxi）和 XParts.reward(game, grade) —— 每个玩法结束时本来就会调用它，这里只是旁听。
 *    存在 localStorage 'xmum-daily-v1'（预览版自动加前缀；登录后跟着云存档走）。日期往回调不会刷出新的一天。
 *
 * 不每帧改 DOM：0.5 秒一次 tick，文字变了才写。手机上不挡摇杆和右下按钮：都在右上角钱包面板里。
 * 对外：window.XLoop = {goal()（当前目标对象）, daily()（今天的目标）, open()（打开每日卡片）}；本地 / 预览版另有 XLoop.dev。 */
'use strict';
(() => {
  if (typeof prog === 'undefined' || typeof gx === 'undefined' || typeof earn !== 'function') return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const $id = id => document.getElementById(id);
  const KEY = 'xmum-daily-v1';
  const DEV = !/github\.io$/.test(location.hostname) || /\/preview\//.test(location.pathname);
  const RM_CORE = 30, RM_PLAY = 40, RM_ALL = 40, RM_STREAK = 10, STREAK_MAX = 5;
  const fmt = v => 'RM ' + Math.ceil(v).toLocaleString();

  /* ---------- dates: a plain number 20261112, local time ---------- */
  const dnum = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const today = () => dnum(new Date());
  const prevDay = n => dnum(new Date(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100 - 1));

  /* ---------- the story: chapter 1 keeps the screen calm; while it has a step on, the quest bar is the next goal ---------- */
  const XQ = () => window.XQuest;
  const calm = () => g(() => !!(XQ() && (XQ().calm() || !XQ().unlocked('drive'))), false);
  const storyOn = () => g(() => { const q = XQ(); return !!(q && q.ready && q.chapter() && q.ph !== 'done'); }, false);
  const unl = k => g(() => !XQ() || XQ().unlocked(k), true);
  const ach = id => !!(prog.ach && prog.ach[id]);
  const busy = () => g(() => !!(mission.on || gx.busy() || gx.paused || window.XINDOOR || (typeof ROOM !== 'undefined' && ROOM.in)), false);

  /* =================================================================================================
   * 每日目标
   * ================================================================================================= */
  const MINI = ['arcade', 'hoops', 'canteen', 'kipmart', 'bell', 'mcd', 'durian', 'sukiya'];
  /* kind: core 赚钱 / play 玩。ok() = 这个玩法已经能玩（大多看「玩过一次」的成就或纪录），ev(game, grade) = 这一局算不算，poll = 计数加了多少 */
  const POOL = [
    {id:'deliv3', kind:'core', need:3, text:'送 3 单外卖', poll:'deliv', ok:() => true},
    {id:'taxi2', kind:'core', need:2, text:'顺风车送 2 位同学', poll:'taxi', ok:() => unl('drive') && owned.size > 0},
    {id:'drive1', kind:'core', need:1, text:'得来速或夜宵送一单', ev:gm => gm === 'drive', ok:() => unl('drive') && +prog.best.o_dt > 0},
    {id:'medal', kind:'play', need:1, text:'挑战赛拿一块奖牌', ev:(gm, gr) => gm === 'activity' && gr < 3, ok:() => unl('drive')},
    {id:'race', kind:'play', need:1, text:'跑一场格子旗竞速', ev:gm => gm === 'race' || gm === 'ghost', ok:() => ach('race1')},
    {id:'escape', kind:'play', need:1, text:'甩掉一次 2 星以上的保安', ev:(gm, gr) => gm === 'escape' && gr <= 2, ok:() => unl('drive') && (ach('busted') || ach('escape4') || prog.life.bust > 0)},
    {id:'stunt', kind:'play', need:1, text:'一次特技连击过 1,000 分', ev:gm => gm === 'stunt', ok:() => unl('drive')},
    {id:'mini', kind:'play', need:1, text:'B1 小游戏拿一块奖牌', ev:(gm, gr) => MINI.includes(gm) && gr < 3, ok:() => g(() => Object.keys(mgSave.plays).length > 0, false)},
    {id:'hole', kind:'play', need:1, text:'黑洞模式拿前 2 名', ev:(gm, gr) => gm === 'hole' && gr <= 1, ok:() => true},
    {id:'dorm', kind:'play', need:1, text:'宿舍撤离带东西出来', ev:gm => gm === 'dorm', ok:() => +prog.best.dorm > 0},
    {id:'monkey', kind:'play', need:1, text:'猴子大战拿一块奖牌', ev:(gm, gr) => gm === 'monkey' && gr < 3, ok:() => ach('monkeywar')},
    {id:'heist', kind:'play', need:1, text:'教学楼潜入完成一次委托', ev:gm => gm === 'heist', ok:() => ach('exam') || ach('hw1')},
    {id:'tea', kind:'play', need:1, text:'蜜雪冰橙打一次工', ev:gm => gm === 'tea', ok:() => unl('drive') && prog.best.o_tea != null},
    {id:'thief', kind:'play', need:1, text:'抓住一个偷外卖的小偷', ev:gm => gm === 'thief', ok:() => +prog.best.o_thief > 0},
    {id:'klia', kind:'play', need:1, text:'KLIA 送机一单', ev:gm => gm === 'klia', ok:() => unl('train') && prog.best.klia != null},
    {id:'f1lap', kind:'play', need:1, text:'卡丁车场跑一个计时圈', poll:'lap', ok:() => unl('park') && !!window.XKart && prog.best.kartLap != null}   /* id kept for saved goals; the park-2 circuit is the kart track now */
  ];
  const BY = {}; for (const p of POOL) BY[p.id] = p;
  const HOT = {id:'hot', kind:'hot', need:1, ok:() => true};
  const hotName = () => g(() => { if (!hotPk || hotDay !== dayKey()) refreshHot(); return hotPk.name; }, '食堂');   /* today's canteen (js/50-missions.js picks it on the first frame) */
  const goalText = q => q.id === 'hot' ? `今日加急：${hotName()}送一单` : (BY[q.id] || {}).text || q.id;
  const goalRM = q => q.id === 'hot' ? 0 : q.kind === 'core' ? RM_CORE : RM_PLAY;

  const D = {v:1, day:0, max:0, goals:[], all:false, streak:0, lastFull:0};
  function load(){
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!d || d.v !== 1) return;
      D.day = +d.day || 0; D.max = Math.max(+d.max || 0, D.day); D.all = !!d.all; D.streak = Math.max(0, d.streak | 0); D.lastFull = +d.lastFull || 0;
      D.goals = (Array.isArray(d.goals) ? d.goals : []).filter(q => q && (q.id === 'hot' || BY[q.id])).slice(0, 3)
        .map(q => ({id:q.id, kind:q.id === 'hot' ? 'hot' : BY[q.id].kind, need:q.id === 'hot' ? 1 : BY[q.id].need, n:Math.max(0, q.n | 0), paid:!!q.paid}));
    } catch(e){}
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch(e){} };
  load();

  /* the day's three: the rush order, one money job, one game. Seeded by the date and the player's name, so classmates get different ones */
  function seedRnd(n){
    let h = 2166136261 >>> 0; const s = n + '|' + g(() => XUI.playerName(), '');
    for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  }
  function pick(day){
    const r = seedRnd(day), from = list => list.length ? list[Math.floor(r() * list.length)] : null;
    const core = POOL.filter(p => p.kind === 'core' && g(p.ok, false)), play = POOL.filter(p => p.kind === 'play' && g(p.ok, false));
    /* the money job: prefer something other than plain deliveries, since the rush order is already a delivery */
    const c = from(core.length > 1 ? core.filter(p => p.id !== 'deliv3') : core) || BY.deliv3;
    const p = from(play) || BY.hole;
    return [HOT, c, p].map(q => ({id:q.id, kind:q.kind, need:q.need, n:0, paid:false}));
  }
  /* a new day: a new set. A clock set back to an earlier day keeps the set already given (no farming by changing the date back and forth) */
  function roll(){
    const t = today();
    if (t === D.day && D.goals.length === 3) return false;
    if (t < D.max && D.goals.length === 3) return false;
    D.day = t; D.max = Math.max(D.max, t); D.goals = pick(t); D.all = false;
    if (D.lastFull && D.lastFull !== prevDay(t) && D.lastFull !== t) D.streak = 0;   /* missed a day: the streak starts again */
    save(); return true;
  }

  /* progress: counters only ever add what they grew by since the last look (a cloud save pulled in mid-game jumps by a lot: ignored) */
  const seen = {deliv:+prog.life.deliv || 0, taxi:+prog.life.taxi || 0, lap:null};
  function pollCounters(){
    const out = {};
    for (const k of ['deliv', 'taxi']){ const v = +prog.life[k] || 0, d = v - seen[k]; seen[k] = v; out[k] = d > 0 && d <= 5 ? d : 0; }
    const lap = g(() => XF1.S.lastLap, null); out.lap = lap != null && seen.lap != null && lap !== seen.lap ? 1 : 0; seen.lap = lap;
    return out;
  }
  function bump(q, by){
    if (!by || q.n >= q.need) return;
    q.n = Math.min(q.need, q.n + by); save();
    if (q.n >= q.need) done(q); else if (dl.open) dlRender();
  }
  function done(q){
    if (q.paid) return; q.paid = true;
    const rm = goalRM(q); if (rm) earn(rm);
    g(() => sfx.ding());
    toast('今日目标完成 ✓', goalText(q) + (rm ? ` · +RM ${rm}` : ' · 报酬已经 ×2'), 2600);
    if (D.goals.every(x => x.paid) && !D.all){
      D.all = true;
      D.streak = D.lastFull === prevDay(D.day) ? D.streak + 1 : 1; D.lastFull = D.day;
      const extra = RM_STREAK * Math.min(STREAK_MAX, D.streak - 1), part = Math.random() < .5 ? 'rim' : 'lacq';
      earn(RM_ALL + extra);
      const got = g(() => XParts.grant(part, 1, '今日目标全部完成'), 0);
      setTimeout(() => {
        g(() => sfx.sparkle());
        gxCallout('今日目标全部完成', `+RM ${RM_ALL + extra}` + (got ? ' · 改装道具 ×1' : '') + (D.streak > 1 ? ` · 连续 ${D.streak} 天` : ''), '#4fd18b');
      }, 900);
    }
    save(); if (dl.open) dlRender();
  }
  function tickDaily(){
    if (roll() && dl.open) dlRender();
    const c = pollCounters();
    for (const q of D.goals){
      if (q.paid) continue;
      if (q.id === 'hot'){ if (prog.daily === g(() => dayKey(), '')){ q.n = 1; done(q); } continue; }
      const p = BY[q.id]; if (p && p.poll) bump(q, c[p.poll]);
    }
  }
  /* every game reports its end through XParts.reward(game, grade, why): listen in, call through unchanged */
  if (window.XParts && typeof XParts.reward === 'function'){
    const base = XParts.reward;
    XParts.reward = function(game, grade){
      const r = base.apply(this, arguments);
      g(() => { roll(); for (const q of D.goals){ const p = BY[q.id]; if (!q.paid && p && p.ev && p.ev(game, grade | 0)) bump(q, 1); } });
      return r;
    };
  }

  /* =================================================================================================
   * 下一个目标
   * ================================================================================================= */
  /* aspirational purchases, cheapest first: cars, the workshop's next levels, the race car, the second bay, a house, prestige paint and clothes */
  function ladder(){
    const L = [];
    for (const it of SHOP) if (!owned.has(it.kind)) L.push({key:'car:' + it.kind, name:it.name, rm:it.price, act:{t:'shop'}});
    for (const u of UPG){ const lv = prog.up[u.k] | 0; if (lv < u.cost.length && owned.size) L.push({key:'up:' + u.k, name:`${u.name} ${lv + 1} 级`, rm:u.cost[lv], act:{t:'shop'}}); }
    const F = window.XF1Tune;
    if (F && !g(() => F.hasRaceCar(), true) && unl('park')) L.push({key:'f1car', name:'方程式赛车', rm:3500, act:{t:'way', x:F.door.x, z:F.door.z, label:'赛车围场 · 买方程式赛车'}});
    if (typeof tune !== 'undefined' && tune.first && tune.bays < 2) L.push({key:'bay2', name:'改装店第二个施工位', rm:typeof TN_BAY2 !== 'undefined' ? TN_BAY2 : 800, act:{t:'tune'}});
    const H = window.XHouse;
    if (H && !Object.keys(H.save.own || {}).length){
      const h = H.houses.slice().sort((a, b) => a.price - b.price)[0];
      if (h) L.push({key:'house', name:'房子 No. ' + h.no, rm:h.price, act:{t:'way', x:h.door.x, z:h.door.z, label:'看房 · No. ' + h.no}});
    }
    if (typeof WD_ITEMS !== 'undefined' && typeof wardSave !== 'undefined' && owned.size >= 3){
      const paints = (typeof WD_PAINTS !== 'undefined' ? WD_PAINTS : []).map(p => ({id:p.id, name:p.name, price:p.price, slot:'paint'}))
        .concat((typeof WD_DECALS !== 'undefined' ? WD_DECALS : []).map(p => ({id:p.id, name:p.name, price:p.price, slot:'decal'})));
      for (const it of WD_ITEMS.concat(paints)){
        if (!(it.price >= 1000)) continue;
        const car = it.slot === 'paint' || it.slot === 'decal';
        if ((car ? wardSave.pOwn : wardSave.own).has(it.id)) continue;
        L.push({key:'wd:' + it.slot + ':' + it.id, name:(it.slot === 'decal' ? '车贴 · ' : car ? '车漆 · ' : '衣橱 · ') + it.name, rm:it.price, act:{t:'ward', kind:car ? 'car' : 'naiwa'}, prestige:true});
      }
    }
    return L.sort((a, b) => a.rm - b.rm);
  }
  /* the next tuning item for the car you drive: the one whose parts you are closest to having */
  function tuneGoal(){
    if (typeof tune === 'undefined' || typeof myCar === 'undefined' || !myCar || typeof TN === 'undefined') return null;
    const kind = myCar.kind, c = tnCar(kind), busyK = new Set(tune.jobs.map(j => j.kind + '|' + j.k));
    let best = null, ready = null;
    for (const sl of TN_SLOTS){
      if (!g(() => tnSlotOk(kind, sl), false)) continue;
      for (const it of TN.bySlot[sl.id]){
        if (!it.rm || !g(() => tnItemOk(kind, it), false) || c.own.includes(it.key) || busyK.has(kind + '|' + it.key)) continue;
        if (it.bp && !tune.bp[it.bp]) continue;
        let have = 0, need = 0, miss = null;
        for (const p in it.need){ const n = it.need[p], h = Math.min(n, tune.inv[p] | 0); need += n; have += h; if (h < n && (!miss || n - h < miss.n - miss.h)) miss = {p, n, h}; }
        if (!need) continue;
        const f = have / need;
        /* parts all there: the dearest one you can pay for (a RM 20 rim colour is not much of a goal) */
        if (f >= 1){ if (it.rm >= 100 && it.rm <= money && (!ready || it.rm > ready.it.rm)) ready = {it, f, miss}; continue; }
        if (!best || f > best.f || (f === best.f && it.rm > best.it.rm)) best = {it, f, miss};
      }
    }
    return ready || best;
  }
  const lapFmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const hide = {};   /* goals the player looked at and walked away from: skipped for 10 minutes */
  const fresh = k => !(hide[k] > Date.now());
  function computeGoal(){
    if (typeof SHOP === 'undefined') return null;
    const cash = Math.max(0, +money || 0);
    if (!owned.size){
      const it = SHOP[0]; if (!fresh('car:' + it.kind)) return null;
      return cash >= it.price ? {key:'car:' + it.kind, text:`买得起了：${it.name} · ${fmt(it.price)}`, act:{t:'shop'}, ready:true}
        : {key:'car:' + it.kind, text:`再赚 ${fmt(it.price - cash)} → ${it.name}`, act:{t:'shop'}};
    }
    const T = tuneGoal();
    if (T && T.f >= 1 && fresh('tn:' + T.it.key) && cash >= T.it.rm) return {key:'tn:' + T.it.key, text:`零件够了：去改装店装${T.it.name}`, act:{t:'tune'}, ready:true};
    const L = ladder().filter(x => fresh(x.key));
    /* something you can already afford that is not just a cosmetic: say so */
    const can = L.filter(x => x.rm <= cash && !x.prestige), next = L.find(x => x.rm > cash);
    /* …unless the next big one is nearly there (within a quarter of its price): saving up for the 911 beats a RM 150 engine level */
    const near = next && !next.prestige && next.rm - cash <= next.rm * .25;
    if (can.length && !near){ const x = can[can.length - 1]; return {key:x.key, text:`买得起了：${x.name} · ${fmt(x.rm)}`, act:x.act, ready:true}; }
    if (T && T.f >= .5 && T.miss && fresh('tn:' + T.it.key)){
      const P = TN_PART[T.miss.p];
      return {key:'tn:' + T.it.key, text:`${P ? P.name : T.miss.p} ${T.miss.h}/${T.miss.n} → ${T.it.name}`, act:{t:'tune'}, sub:P ? P.from : ''};
    }
    if (next) return {key:next.key, text:`再赚 ${fmt(next.rm - cash)} → ${next.name}`, act:next.act};
    if (prog.best.kartLap != null && unl('park') && window.XKart){
      const t = Math.floor((prog.best.kartLap - .01) / 5) * 5;
      return {key:'lap', text:`卡丁车单圈进 ${lapFmt(t)}`, sub:`现在最快 ${lapFmt(prog.best.kartLap)}`, act:g(() => ({t:'way', x:XKart.start[0], z:XKart.start[1], label:'二园 · 卡丁车场'}), null)};
    }
    return null;
  }

  /* waypoint on the compass (gx.target): until you get there, 4 minutes pass, or something busier wants the arrow */
  let way = null;
  { const base = gx.target;
    gx.target = function(){
      if (way && !mission.on && !gx.busy()){
        const px = driving ? driving.x : nw.x, pz = driving ? driving.z : nw.z;
        if (Math.hypot(way.x - px, way.z - pz) < 14 || Date.now() > way.until) way = null;
        else return {x:way.x, z:way.z, label:way.label};
      }
      return base.apply(this, arguments);
    }; }
  function act(goal){
    const a = goal && goal.act; if (!a) return;
    g(() => ac());
    if (goal.ready) hide[goal.key] = Date.now() + 10 * 60 * 1000;   /* 「可以买了」 looked at and not bought: show the next one for a while */
    if (a.t === 'shop') g(() => openShop());
    else if (a.t === 'tune') g(() => XTune.open());
    else if (a.t === 'ward') g(() => wardOpen(a.kind));
    else if (a.t === 'way'){ way = {x:a.x, z:a.z, label:a.label, until:Date.now() + 240000}; toast('指南针指过去了', a.label, 2200); }
  }

  /* =================================================================================================
   * 界面：钱包面板里一行（左「今日 1/3」，右目标），一张每日卡片
   * ================================================================================================= */
  const row = document.createElement('div'); row.className = 'lp-row'; row.id = 'lpRow'; row.hidden = true;
  row.innerHTML = '<button type="button" class="lp-day" id="lpDay" aria-haspopup="dialog"></button><button type="button" class="lp-goal" id="lpGoal"></button>';
  { const after = $id('qbar') || $id('mission'); if (after) after.after(row); else { const gs = $id('gstat'); if (gs) gs.appendChild(row); } }
  const dayBtn = row.querySelector('.lp-day'), goalBtn = row.querySelector('.lp-goal');
  let cur = null;
  goalBtn.addEventListener('click', () => act(cur));

  const dl = {open:false};
  const card = document.createElement('div'); card.className = 'panel lp-card'; card.id = 'lpCard'; card.hidden = true;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '今日目标');
  document.body.appendChild(card);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  function dlRender(){
    const n = D.goals.filter(q => q.paid).length, extra = RM_STREAK * Math.min(STREAK_MAX, (D.lastFull === prevDay(D.day) ? D.streak + 1 : 1) - 1);
    const m = Math.floor(D.day / 100) % 100, d = D.day % 100;
    let h = `<button type="button" class="x lp-x" aria-label="关闭">×</button><b class="lp-h">今日目标 <small>${m} 月 ${d} 日 · ${n}/3</small></b><ul class="lp-list">`;
    for (const q of D.goals){
      const rm = goalRM(q);
      h += `<li class="${q.paid ? 'lp-done' : ''}"><i aria-hidden="true">${q.paid ? '✓' : '○'}</i><span>${esc(goalText(q))}` +
        `${q.need > 1 ? ` <em>${q.n}/${q.need}</em>` : ''}</span><small>${q.id === 'hot' ? '报酬 ×2' : 'RM ' + rm}</small></li>`;
    }
    h += '</ul>';
    h += D.all ? `<p class="lp-foot">全做完了${D.streak > 1 ? ` · 已经连续 ${D.streak} 天` : ''}。明天 0 点换新的。</p>`
      : `<p class="lp-foot">三个都做完：+RM ${RM_ALL + extra} 和 1 个改装道具${extra ? `（含连续 ${D.lastFull === prevDay(D.day) ? D.streak + 1 : 1} 天的 +RM ${extra}）` : ''}。<br>每天 0 点换新的，离线也能做。</p>`;
    card.innerHTML = h;
  }
  /* beside the wallet panel when there is room (desktop), under it otherwise (phones): never on top of the money */
  function dlPlace(){
    const gs = $id('gstat'), r = gs && gs.getBoundingClientRect(); if (!r || !r.width) return;
    const W = innerWidth, cw = Math.min(320, W - 24);
    if (r.left - cw - 20 >= 0){ card.style.top = Math.round(r.top) + 'px'; card.style.right = Math.round(W - r.left + 8) + 'px'; }
    else { card.style.top = Math.round(r.bottom + 8) + 'px'; card.style.right = '12px'; }
  }
  function dlOpen(){ roll(); dlRender(); card.hidden = false; dl.open = true; dlPlace(); dayBtn.setAttribute('aria-expanded', 'true'); }
  function dlClose(){ card.hidden = true; dl.open = false; dayBtn.setAttribute('aria-expanded', 'false'); }
  dayBtn.addEventListener('click', () => { g(() => ac()); dl.open ? dlClose() : dlOpen(); });
  card.addEventListener('click', e => { if (e.target.closest('.lp-x')) dlClose(); });
  document.addEventListener('pointerdown', e => { if (dl.open && !card.contains(e.target) && !dayBtn.contains(e.target)) dlClose(); }, true);
  window.addEventListener('keydown', e => { if (dl.open && e.key === 'Escape'){ dlClose(); e.stopPropagation(); } }, true);

  /* ---------- the tick: twice a second, writes only what changed ---------- */
  let last = {row:null, day:'', goal:'', goalHide:null, title:''}, gT = 0;
  function tick(){
    const inGame = mode === 'naiwa' && !g(() => titleOpen, false);
    if (!inGame || calm()){ if (last.row !== false){ row.hidden = true; last.row = false; } if (dl.open) dlClose(); return; }
    tickDaily();
    const dayT = `今日 ${D.goals.filter(q => q.paid).length}/3`;
    if (dayT !== last.day){ dayBtn.textContent = dayT; dayBtn.classList.toggle('lp-all', D.all); last.day = dayT; }
    /* the goal: once a second is plenty */
    const now = Date.now();
    if (now - gT > 900){
      gT = now;
      cur = storyOn() || busy() ? null : g(computeGoal, null);
      const t = cur ? cur.text : '', hd = !cur;
      if (t !== last.goal){ goalBtn.textContent = t; goalBtn.title = cur ? t + (cur.sub ? '\n' + cur.sub : '') + '（点一下）' : ''; goalBtn.classList.toggle('lp-ready', !!(cur && cur.ready)); last.goal = t; }
      if (hd !== last.goalHide){ goalBtn.hidden = hd; last.goalHide = hd; }
    }
    if (last.row !== true){ row.hidden = false; last.row = true; }
  }
  setInterval(() => g(tick), 500);

  window.XLoop = {goal:() => cur, daily:() => JSON.parse(JSON.stringify(D)), open:dlOpen, ladder:() => g(ladder, []), compute:() => g(computeGoal, null)};
  if (DEV) window.XLoop.dev = {
    reset(){ D.day = 0; D.max = 0; D.goals = []; D.all = false; D.streak = 0; D.lastFull = 0; save(); roll(); return D; },
    finish(){ for (const q of D.goals){ q.n = q.need; done(q); } return D; },
    roll, pick, state:D, tick
  };
})();
