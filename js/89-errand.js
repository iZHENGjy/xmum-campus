/* XMUM 校园漫游 · 采购单：人机奶娃给一张单子，满地图跑去各家店买齐，再送到指定的地方
 *
 * 数据在 js/89-quest-data.js：XQD.shops（店：站的位置、开没开门）、XQD.errands（单子：东西、在哪买、送到哪、报销、送到以后做什么）。
 * 什么时候有单子：主线当前这一步写了 errand:'id'（第 4 章生日火锅局、第 6 章搬家），或者接了写着 errand 的支线（新角色的跑腿）。
 * 玩法：
 *   走到（或开到）单子上的店门口，弹接单卡（js/89-offers.js）：这家店能买的东西和价钱，按 F 买下，真花钱。几张单子要同一家店的东西一次买齐。
 *   冷冻 / 怕凉的东西（cold 秒）买了以后计时，过了时间就坏了（化冻、凉了），要回店里重买。不占后备箱，开什么车、走路都能拎。
 *   买齐了去送：送到的地方再弹一张卡，按 F 送到。报销（refund）把花的钱还给你，支线的奖励照常由 js/89-quest.js 发。
 *   第一次在某家店买某张单子的东西时，店里的人说一句话（gift，送火锅底料之类）。
 * 存档：都在主线存档的 flags 里（js/89-quest.js）：er_单子_东西 = 买的时间，er_单子_spent = 花了多少，er_单子_all = 买齐了，er_单子_done = 送到了。
 * 界面：任务条下面一行袋子（买到的亮、没买的灰、冷冻的带倒计时）；小地图上要去的店是黄点，买齐了送到的地方是绿点；
 *   主线这一步的指南针指最近的一家还要去的店（买齐了指送到的地方）。
 * 对外：window.XErrand = {active(), nextAt(id), count(id), bought(id, item), dev:{fill(id), clear(id)}} */
'use strict';
(() => {
  if (typeof gx === 'undefined' || !window.XQD || !window.XQuest) return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const D = XQD, E = D.errands || {}, SH = D.shops || {};
  const F = () => XQuest.state.flags;
  const flag = (k, v) => XQuest.flag(k, v);
  const setNum = (k, v) => { XQuest.state.flags[k] = v; XQuest.save(); };   /* flag() only flips on / off; a running total needs a plain write */
  const now = () => Date.now();
  const atOf = a => { const v = typeof a === 'function' ? g(a, null) : a; return v && isFinite(v[0]) ? v : null; };
  const here = () => typeof driving !== 'undefined' && driving ? [driving.x, driving.z] : [nw.x, nw.z];

  /* ---------- state ---------- */
  const has = (id, it) => !!F()['er_' + id + '_' + it.id];
  const allIn = id => E[id].items.every(it => has(id, it));
  const done = id => !!F()['er_' + id + '_done'];
  function active(){
    const out = new Set();
    const st = g(() => XQuest.step(), null); if (st && st.errand && E[st.errand]) out.add(st.errand);
    for (const s of D.sides) if (s.errand && E[s.errand] && XQuest.state.sides[s.id] === 'open') out.add(s.errand);
    return [...out].filter(id => !done(id));
  }
  const shopOpen = sid => { const s = SH[sid]; return !s || !s.open || !!g(s.open, true); };
  /* what this shop sells for the lists we carry right now: [{id (errand), it}] */
  function needs(sid, act){
    const out = [];
    for (const id of act) for (const it of E[id].items) if (!has(id, it) && it.shops.includes(sid)) out.push({id, it});
    return out;
  }
  function nextAt(id){
    if (!E[id] || done(id)) return null;
    if (allIn(id)) return atOf(E[id].to.at);
    const [px, pz] = here(); let best = null, bd = 1e9;
    for (const it of E[id].items){
      if (has(id, it)) continue;
      for (const sid of it.shops){ const a = atOf(SH[sid] && SH[sid].at); if (!a) continue; const d = Math.hypot(a[0] - px, a[1] - pz) + (shopOpen(sid) ? 0 : 5000); if (d < bd){ bd = d; best = a; } }
    }
    return best;
  }
  const count = id => E[id] ? [E[id].items.filter(it => has(id, it)).length, E[id].items.length] : null;

  /* ---------- buying, spoiling, delivering ---------- */
  function buy(sid){
    const act = active(), list = needs(sid, act); if (!list.length) return;
    const sum = list.reduce((a, n) => a + (n.it.rm || 0), 0);
    if (sum > 0 && (+g(() => money, 0) || 0) < sum){ g(() => toast('钱不够', `这一单要 RM ${sum}，先去挣点钱`, 2400)); g(() => sfx.fail()); return; }
    if (sum > 0){ money -= sum; g(() => moneyChanged()); }
    const t = now(), gifts = [];
    for (const {id, it} of list){
      flag('er_' + id + '_' + it.id, t); if (it.rm) setNum('er_' + id + '_spent', (+F()['er_' + id + '_spent'] || 0) + it.rm);
      if (allIn(id)) flag('er_' + id + '_all');
      const gk = 'er_' + id + '_g_' + sid, gl = E[id].gift && E[id].gift[sid];
      if (gl && !F()[gk]){ flag(gk); gifts.push(...gl); }
    }
    g(() => sfx.ding());
    g(() => toast(sum ? `买到了 · RM ${sum}` : '拿到了', list.map(n => n.it.icon + ' ' + n.it.name).join('　'), 2400));
    if (gifts.length) setTimeout(() => g(() => XQuest.say(gifts, null)), 500);
    sync(true);
  }
  function spoilCheck(act){
    const t = now();
    for (const id of act) for (const it of E[id].items){
      if (!it.cold || !has(id, it)) continue;
      if (t - F()['er_' + id + '_' + it.id] > it.cold * 1000){
        flag('er_' + id + '_' + it.id, false); flag('er_' + id + '_all', false);
        const sid = it.shops[0];
        g(() => toast(it.icon + ' ' + it.name + it.spoil, '回' + ((SH[sid] || {}).name || '店里') + '再买一份', 3200)); g(() => sfx.fail());
        sync(true);
      }
    }
  }
  function deliver(id){
    if (done(id) || !allIn(id)) return;
    const e = E[id], spent = +F()['er_' + id + '_spent'] || 0;
    flag('er_' + id + '_done');
    g(() => sfx.ding());
    if (e.refund && spent > 0){ g(() => earn(spent)); g(() => toast('送到了 · 报销 RM ' + spent, e.refund, 2800)); }
    else g(() => toast('送到了', e.to.name, 2200));
    sync(true);
    if (e.onDone === 'birthday') birthday();
  }
  /* 生日火锅局: the film (js/89-cine.js), then the step ticks, mum's message and her red packet */
  function birthday(){
    const after = () => {
      flag('q_bday');
      setTimeout(() => { g(() => XQuest.msg('mom_bday2')); }, 1500);
      setTimeout(() => { if (!F().er_bday_hb){ flag('er_bday_hb'); g(() => earn(188)); g(() => toast('🧧 妈妈的红包 · RM 188', '生日快乐', 3000)); } }, 4800);
    };
    if (window.XCine && XCine.play && XCine.play('birthday', {onDone:after})) return;
    after();
  }

  /* ---------- every frame: the cards at the shops and at the drop-off ---------- */
  let ACT = [], actT = 0, shut = '';
  function frame(dt){
    shut = '';
    if (mode !== 'naiwa' || gx.paused || g(() => XCine.busy, false) || g(() => indoorNow(), false)) return;
    if ((actT -= dt) <= 0){ actT = .25; ACT = active(); spoilCheck(ACT); }
    if (!ACT.length || typeof offerJob !== 'function') return;
    const [px, pz] = here();
    for (const sid in SH){
      const a = atOf(SH[sid].at); if (!a || Math.hypot(a[0] - px, a[1] - pz) > 4.5) continue;
      const list = needs(sid, ACT); if (!list.length) continue;
      if (!shopOpen(sid)){ shut = SH[sid].shut || '还没开门'; continue; }
      const sum = list.reduce((s, n) => s + (n.it.rm || 0), 0), cold = list.filter(n => n.it.cold);
      offerJob('er:' + sid, () => ({icon:SH[sid].verb ? '📦' : '🛒', title:SH[sid].name, accept:SH[sid].verb || (sum ? '买下' : '拿上'),
        desc:list.map(n => n.it.icon + ' ' + n.it.name + (n.it.rm ? ' RM ' + n.it.rm : '')).join('　'),
        pay:sum ? '花 RM ' + sum : null, risk:cold.length ? cold.map(n => n.it.name).join('、') + '要在 ' + Math.round(Math.min(...cold.map(n => n.it.cold)) / 60) + ' 分钟内送到' : '',
        onAccept:() => buy(sid)}));
      return;
    }
    for (const id of ACT){
      if (!allIn(id)) continue;
      const a = atOf(E[id].to.at); if (!a || Math.hypot(a[0] - px, a[1] - pz) > 5.5) continue;
      const e = E[id], spent = +F()['er_' + id + '_spent'] || 0;
      offerJob('erto:' + id, () => ({icon:'✅', title:e.title + ' · 送到 ' + e.to.name, accept:'送到',
        desc:e.items.map(it => it.icon).join(' '), pay:e.refund && spent ? '报销 RM ' + spent : null, onAccept:() => deliver(id)}));
      return;
    }
  }
  { const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); g(() => frame(Math.max(0, Math.min(.1, dt || 0)))); },
      prompt(){ const p = base.prompt(); return p || shut; },
      mini(dot){
        if (base.mini) base.mini(dot);
        for (const id of ACT){
          if (allIn(id)){ const a = atOf(E[id].to.at); if (a) dot(a[0], a[1], '#4fd18b', 7); continue; }
          for (const it of E[id].items){ if (has(id, it)) continue; for (const sid of it.shops){ const a = atOf(SH[sid] && SH[sid].at); if (a) dot(a[0], a[1], '#ffd23a', 6); } }
        }
      }
    }); }

  /* ---------- the bag line under the quest bar ---------- */
  { const st = document.createElement('style'); st.textContent = `
.er-bag{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin-top:4px;padding:5px 8px;border-radius:10px;background:rgba(255,210,58,.14);border:1px solid rgba(201,150,20,.35);
  font-size:12px;line-height:1.35;color:var(--ink, #2b2a26);cursor:pointer;text-align:left;width:100%;box-sizing:border-box;font-family:inherit}
.er-bag b{font-weight:800;margin-right:2px;white-space:nowrap}
.er-bag i{font-style:normal;font-size:15px;filter:grayscale(1);opacity:.32}
.er-bag i.on{filter:none;opacity:1}
.er-bag em{font-style:normal;font-size:11px;font-weight:700;color:#c0392b;margin-left:-3px}
.er-bag u{text-decoration:none;font-weight:700;color:#2f8f5b}
body.cine .er-bag{display:none}
`; document.head.appendChild(st); }
  const bags = [];
  const mm = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function sync(force){
    const act = mode === 'naiwa' ? ACT : [];
    while (bags.length < act.length){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'er-bag';
      b.addEventListener('click', () => { g(() => ac()); g(() => XGuide.open('diary')); });
      const anchor = document.getElementById('qbar') || document.getElementById('mission');
      if (!anchor) return; (bags.length ? bags[bags.length - 1] : anchor).after(b); bags.push(b);
    }
    bags.forEach((b, i) => {
      const id = act[i]; b.hidden = !id; if (!id) return;
      const e = E[id], t = now(), [n, of] = count(id);
      let h = `<b>🛒 ${e.title} ${n}/${of}</b>`;
      if (allIn(id)) h += `<u>买齐了 · 送到${e.to.name}</u>`;
      else h += e.items.map(it => { const on = has(id, it); const left = on && it.cold ? it.cold - (t - F()['er_' + id + '_' + it.id]) / 1000 : 0;
        return `<i class="${on ? 'on' : ''}" title="${it.name}">${it.icon}</i>${left > 0 ? `<em>${mm(left)}</em>` : ''}`; }).join('');
      if (force || b.dataset.h !== h){ b.dataset.h = h; b.innerHTML = h; }
    });
  }
  setInterval(() => g(() => sync(false)), 250);

  window.XErrand = {
    active:() => ACT.slice(), nextAt, count, bought:(id, item) => !!(E[id] && F()['er_' + id + '_' + item]),
    dev:{
      fill(id){ for (const it of E[id].items) flag('er_' + id + '_' + it.id, now()); flag('er_' + id + '_all'); sync(true); return '买齐了：' + E[id].title; },
      clear(id){ for (const k of Object.keys(F())) if (k.indexOf('er_' + id + '_') === 0) flag(k, false); sync(true); return '清空了：' + E[id].title; },
      deliver:id => deliver(id), birthday
    }
  };
})();
