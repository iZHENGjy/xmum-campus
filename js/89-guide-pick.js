/* XMUM 校园漫游 · 头上的指南针指什么，自己选
 *
 * 仓库主人：「头上的指引可以选择不同的指引，比如选择分支指引」。
 * 指南针左边一个 🎯 小按钮，点开一张小菜单：
 *   自动（原来的样子：正在做的事 → 送外卖 → 主线 → 最近的取餐点）· 主线 · 某一条支线（接了的才列出来）· 外卖 · 每日目标 · 关掉
 * 选了以后一直记着（localStorage xmum-guide），刷新也在。
 * 比赛、挑战、被保安追这些「正在做的事」照样优先用它们自己的箭头（它们比你选的更急），做完又回到你选的。
 * 找好友的导航也优先，但它是你自己点的：菜单最上面会列出来，在菜单里另选一项就把找好友的导航取消。
 * 怎么接：js/50-missions.js 的 updateCompass 开头问一句 XGuidePick.pick(px, pz)：返回 {x, z, label} 就指那里，返回 {text} 就只显示文字、
 *   不画箭头，返回 null 就照原来的规则。
 * 对外：window.XGuidePick = {pick(px, pz), mode, set(mode), open()} */
'use strict';
(() => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const KEY = 'xmum-guide';
  let mode = g(() => localStorage.getItem(KEY), '') || 'auto';
  const set = m => { mode = m || 'auto'; g(() => localStorage.setItem(KEY, mode)); sync(); };
  const strip = t => String(t || '').replace(/（.*?）/g, '');

  /* the nearest pick-up ring (chapter 1 for a new player: campus ones only, like js/50-missions.js) */
  function nearestPick(px, pz){
    const c1 = g(() => XQuest.ch1Deliv(), false); let best = null, bd = 1e9;
    for (const pk of g(() => PICKUPS, [])){ if (!pk || (c1 && pk.out)) continue; const d = Math.hypot(pk.x - px, pk.z - pz); if (d < bd){ bd = d; best = pk; } }
    return best;
  }
  const openSides = () => g(() => XQD.sides.filter(s => XQuest.state.sides[s.id] === 'open'), []);

  function pick(px, pz){
    if (mode === 'auto') return null;
    /* something happening right now keeps its own arrow: a race / challenge / activity, the paint-shop run while wanted, a friend you are going to */
    if (g(() => gx.busy() || gx.extBusy(), false) || g(() => heat >= 1, false) || g(() => XFriends.nav, null)) return null;
    if (mode === 'off') return {text:'指南针关了 · 点 🎯 再打开'};
    if (mode === 'deliv'){
      if (g(() => mission.on, false)) return {x:mission.to.x, z:mission.to.z, label:'送到 ' + mission.to.name};
      const pk = nearestPick(px, pz); return pk ? {x:pk.x, z:pk.z, label:'取餐 ' + pk.name} : {text:'附近没有取餐点'};
    }
    if (mode === 'main'){
      if (!window.XQuest) return null;
      const t = g(() => XQuest.target(), null); if (t) return t;
      const st = g(() => XQuest.step(), null);
      return {text:st ? '主线 · ' + strip(st.text) : '主线都做完了'};
    }
    if (mode === 'daily'){
      const L = g(() => XLoop.today(), []).filter(q => !q.paid && q.n < q.need);
      if (!L.length) return {text:'今天的目标都完成了 🎉'};
      const q = L[0], lab = '每日 · ' + q.text + (q.need > 1 ? ` ${q.n}/${q.need}` : '');
      if (q.deliv){ if (g(() => mission.on, false)) return {x:mission.to.x, z:mission.to.z, label:'送到 ' + mission.to.name};
        /* 今日加急 names its shop: go there, not just to the nearest ring */
        const named = g(() => PICKUPS.find(p => p && q.text.indexOf(p.name) >= 0), null), pk = named || nearestPick(px, pz); if (pk) return {x:pk.x, z:pk.z, label:lab}; }
      return {text:lab};
    }
    if (mode.indexOf('side:') === 0){
      const id = mode.slice(5), s = openSides().find(x => x.id === id);
      if (!s){ set('auto'); return null; }   /* done or gone: back to automatic */
      if (s.errand){ const a = g(() => XErrand.nextAt(s.errand), null); if (a) return {x:a[0], z:a[1], label:'支线 · ' + s.text}; }
      if (s.at){ const a = typeof s.at === 'function' ? g(s.at, null) : s.at; if (a) return {x:a[0], z:a[1], label:'支线 · ' + s.text}; }
      return {text:'支线 · ' + s.text};
    }
    return null;
  }

  /* ---------- the 🎯 button on the compass and its menu ---------- */
  const st = document.createElement('style'); st.textContent = `
#gPick{all:unset;flex:none;display:grid;place-items:center;width:26px;height:26px;margin:-4px 2px -4px -6px;border-radius:8px;cursor:pointer;font-size:15px;line-height:1}
#gPick:hover{background:var(--chip, rgba(0,0,0,.06))}
#gPick:focus-visible{outline:2px solid var(--tile)}
#gPick.set{background:color-mix(in srgb, var(--tile) 18%, transparent)}
@media (pointer:coarse){ #gPick{width:34px;height:34px;margin:-6px 2px -6px -8px} }
#gPickMenu{position:fixed;z-index:30;min-width:200px;max-width:min(300px,calc(100vw - 24px));max-height:min(60vh,420px);overflow:auto;padding:6px;border-radius:14px;
  background:var(--panel-solid,#fff);box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:13px}
#gPickMenu[hidden]{display:none}
#gPickMenu h5{margin:6px 8px 4px;font-size:11.5px;color:var(--muted);font-weight:700}
#gPickMenu button{all:unset;box-sizing:border-box;display:flex;gap:8px;align-items:center;width:100%;padding:8px 10px;border-radius:9px;cursor:pointer;color:var(--ink);min-height:36px}
#gPickMenu button:hover,#gPickMenu button:focus-visible{background:var(--chip, rgba(0,0,0,.06))}
#gPickMenu button[aria-checked="true"]{font-weight:700;color:var(--tile)}
#gPickMenu button i{font-style:normal;width:18px;text-align:center;flex:none}
#gPickMenu button span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  document.head.appendChild(st);
  const comp = document.getElementById('compass');
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'gPick'; btn.textContent = '🎯';
  btn.title = '指南针指什么'; btn.setAttribute('aria-label', '选择指南针指什么'); btn.setAttribute('aria-haspopup', 'menu');
  if (comp) comp.prepend(btn);
  const menu = document.createElement('div'); menu.id = 'gPickMenu'; menu.hidden = true; menu.setAttribute('role', 'menu'); document.body.appendChild(menu);
  const NAMES = {auto:'自动', main:'主线', deliv:'外卖', daily:'每日目标', off:'关掉'};
  function render(){
    const fr = g(() => XFriends.nav ? XFriends.navName : '', '');
    const it = (m, icon, text) => { const on = mode === m && !fr; return `<button type="button" role="menuitemradio" aria-checked="${on}" data-m="${m}"><i>${on ? '✓' : icon}</i><span>${text}</span></button>`; };
    let h = '<h5>指南针指什么</h5>' + (fr ? `<button type="button" role="menuitemradio" aria-checked="true" data-m="friend"><i>✓</i><span>⭐ 正在找 ${fr.replace(/[<>&]/g, '')}（选别的就取消）</span></button>` : '')
      + it('auto', '✨', '自动（正在做的事优先，再到主线）') + it('main', '★', '主线');
    const S = openSides();
    if (S.length){ h += '<h5>支线</h5>'; for (const s of S) h += it('side:' + s.id, '📌', s.text.replace(/[<>&]/g, '')); }
    h += '<h5>别的</h5>' + it('deliv', '🛵', '外卖（取餐点 / 送达点）') + it('daily', '📅', '每日目标') + it('off', '🚫', '关掉指南针');
    menu.innerHTML = h;
  }
  function place(){
    const r = (comp || btn).getBoundingClientRect(), w = menu.offsetWidth, hgt = menu.offsetHeight;
    let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8;
    if (y + hgt > innerHeight - 8) y = Math.max(8, r.top - hgt - 8);   /* the compass sits low on phones held sideways / short screens */
    menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px'; menu.style.top = y + 'px';
  }
  function open(){ render(); menu.hidden = false; place(); const c = menu.querySelector('[aria-checked="true"]') || menu.querySelector('button'); g(() => c.focus({preventScroll:true})); }
  function close(){ if (menu.hidden) return; menu.hidden = true; g(() => canvas.focus({preventScroll:true})); }
  btn.addEventListener('click', e => { e.stopPropagation(); g(() => ac()); menu.hidden ? open() : close(); });
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  menu.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return;
    if (b.dataset.m === 'friend'){ close(); return; }   /* keep finding the friend */
    const stopped = g(() => XFriends.stopNav(), false);   /* picking anything else ends the friend navigation */
    set(b.dataset.m); close();
    g(() => toast('指南针', (stopped ? '不找好友了 · ' : '') + (b.dataset.m === 'auto' ? '自动：正在做的事优先，再到主线' : '指向：' + b.querySelector('span').textContent), 1800)); });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); }, true);
  window.addEventListener('keydown', e => { if (!menu.hidden && e.code === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); } }, true);
  function sync(){ btn.classList.toggle('set', mode !== 'auto'); btn.title = '指南针指什么（现在：' + (NAMES[mode] || '支线') + '）'; }
  sync();

  /* ---------- 「指南针可以换」的提示：新老玩家接下来的头两次接任务时各弹一次（主人：「新老用户在下次接取任务的前两次都提示」） ----------
     接任务 = 出现了新的主线步骤、接了一条支线、接了一单外卖、多了一张跑腿单。每秒比一次，刚进游戏的第一次只记下来不弹。
     次数记在 localStorage xmum-guide-tip（满 2 次就不再弹）；点过 🎯 换过指引的人也不再弹。 */
  const TIP_KEY = 'xmum-guide-tip', TIP_MAX = 2;
  let tipN = +g(() => localStorage.getItem(TIP_KEY), 0) || 0, tipEl = null, tipT = 0, last = null;
  const tipSt = document.createElement('style'); tipSt.textContent = `
#gPickTip{position:fixed;z-index:31;max-width:min(300px,calc(100vw - 24px));box-sizing:border-box;padding:9px 12px 10px;border-radius:12px;background:#1f2a36;color:#fff;
  font-size:13px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.3);display:flex;gap:10px;align-items:flex-start}
#gPickTip[hidden]{display:none}
#gPickTip::before{content:'';position:absolute;left:var(--ax,24px);top:-6px;width:12px;height:12px;background:#1f2a36;transform:rotate(45deg)}
#gPickTip b{color:#ffd24a}
#gPickTip button{all:unset;flex:none;cursor:pointer;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.16);font-weight:700;font-size:12.5px;margin-top:1px}
#gPickTip button:focus-visible{outline:2px solid #ffd24a}`;
  document.head.appendChild(tipSt);
  function tipHide(){ if (tipEl) tipEl.hidden = true; clearTimeout(tipT); }
  function tipShow(){
    if (tipN >= TIP_MAX || !comp || comp.hidden || !btn.offsetParent) return false;
    if (!tipEl){
      tipEl = document.createElement('div'); tipEl.id = 'gPickTip'; tipEl.setAttribute('role', 'status');
      tipEl.innerHTML = '<span>🎯 点指南针左边的 <b>🎯</b> 可以换它指什么：主线、某条支线、外卖、每日目标，或者关掉。</span><button type="button">知道了</button>';
      tipEl.querySelector('button').addEventListener('click', () => { tipHide(); g(() => canvas.focus({preventScroll:true})); });
      document.body.appendChild(tipEl);
    }
    tipEl.hidden = false;
    const r = btn.getBoundingClientRect(), w = tipEl.offsetWidth, x = Math.max(12, Math.min(innerWidth - w - 12, r.left - 12));
    tipEl.style.left = x + 'px'; tipEl.style.top = (r.bottom + 10) + 'px'; tipEl.style.setProperty('--ax', Math.max(10, r.left + r.width / 2 - x - 6) + 'px');
    tipN++; g(() => localStorage.setItem(TIP_KEY, String(tipN)));
    clearTimeout(tipT); tipT = setTimeout(tipHide, 8000);
    return true;
  }
  btn.addEventListener('click', () => { tipHide(); if (tipN < TIP_MAX){ tipN = TIP_MAX; g(() => localStorage.setItem(TIP_KEY, String(tipN))); } });   /* found it: no more tips */
  /* what tasks are on right now; a new one in the list = a task was just taken */
  const tasks = () => {
    const out = new Set(), st = g(() => XQuest.step(), null);
    if (st && st.id) out.add('step:' + st.id);
    for (const [id, v] of Object.entries(g(() => XQuest.state.sides, {}) || {})) if (v === 'open') out.add('side:' + id);
    if (g(() => mission.on, false)) out.add('deliv');
    for (const id of g(() => XErrand.active(), []) || []) out.add('errand:' + id);
    return out;
  };
  setInterval(() => {
    if (tipN >= TIP_MAX) return;
    if (!comp || comp.hidden) return;   /* the compass only shows while playing 奶娃 (`mode` in here is the picker's own) */
    const now = tasks();
    if (last){
      let fresh = false; for (const k of now) if (!last.has(k)){ fresh = true; break; }
      const calm = !g(() => XQuest.talking, false) && !g(() => XCine.busy, false) && !g(() => gx.paused, false);
      if (fresh && calm) setTimeout(tipShow, 1200);
      else if (fresh) { last = null; return; }   /* in a talk or a film: try again once it is over */
    }
    last = now;
  }, 1000);

  window.XGuidePick = {pick, get mode(){ return mode; }, set, open, tip:tipShow};
})();
