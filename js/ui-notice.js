/* XMUM 校园漫游 · 手机上的提示：不挡路
   电脑上 toast() 照旧是屏幕中间偏上的卡片。手机（触屏，或者窄屏、矮屏）上：
   - toast() 变成顶上的一条小通知：竖屏盖在钱包那张卡片上（不压画面），横屏在顶上那条下面；
     最多叠两条，新的把最旧的顶掉，同样的话只刷新时间；点一下或者往上划就收起；显示时间是原来的 3/4（1.4 到 4 秒）。
   - 屏幕中间的大字 gxCallout() 挪进同一个位置，字小一号，1.1 秒淡出；倒计时的数字（三个字以内）大一点。
   - 成就解锁（#gxach）、改装零件到手（#tnGain）不再弹卡片，合并成一行小字。
   别的文件不用改：toast()、gxCallout()、unlock()、XParts.grant() 照常调用。
   老代码里 toastEl.classList.remove('show') 用来「清掉提示，给重要的大字让位」，手机上也照样清掉这里的通知。 */
'use strict';
(() => {
  const D = document, B = D.body;
  const SMALL = matchMedia('(max-width:760px), (max-height:520px) and (min-width:561px)');
  const FLAT = matchMedia('(max-height:520px) and (min-width:561px)');
  const phone = () => TOUCH || SMALL.matches;
  const sync = () => B.classList.toggle('nt-on', phone());
  sync(); SMALL.addEventListener ? SMALL.addEventListener('change', sync) : SMALL.addListener(sync);

  const wrap = D.createElement('div'); wrap.id = 'ntWrap'; wrap.setAttribute('role', 'status'); wrap.setAttribute('aria-live', 'polite');
  B.appendChild(wrap);
  /* the big stamp lives in the same column on touch screens, above the notices */
  const call = D.getElementById('gxcall');
  if (TOUCH && call){ wrap.appendChild(call); new MutationObserver(() => { call.classList.toggle('big', (call.firstChild && call.firstChild.nodeType === 3 ? call.firstChild.nodeValue : '').length <= 3); place(); })
    .observe(call, {childList:true, attributes:true, attributeFilter:['hidden', 'class']}); }

  /* ---------- where the column goes ---------- */
  const vis = e => { if (!e || e.hidden) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
  const $ = q => D.querySelector(q);
  function place(){
    if (!B.classList.contains('nt-on')) return;
    const W = innerWidth, H = innerHeight, st = wrap.style;
    if (!FLAT.matches){
      wrap.classList.remove('left');
      /* upright: over the stats card, right under the menu and mode switch; the road below stays clear */
      const ctrls = $('.ctrls'), card = ['#gstat', '#hstat'].map($).find(vis), open = B.classList.contains('wd-open') || B.classList.contains('titled');
      if (!open && vis(ctrls)){
        st.top = Math.round(ctrls.getBoundingClientRect().bottom + 6) + 'px';
        if (card){ const r = card.getBoundingClientRect(); st.left = Math.round(r.left) + 'px'; st.width = Math.round(r.width) + 'px'; }
        else { st.left = '12px'; st.width = (W - 24) + 'px'; }
      } else { st.top = ''; st.left = '12px'; st.width = (W - 24) + 'px'; }
      return;
    }
    /* sideways: a column top-left under the top strip, above the task line and compass by the stick; the middle stays clear.
       When the left is taken (race card, dorm tip and loot list) or a side panel is open: centred over the free part instead */
    let L = 0, R = W;
    const side = ['#ward', '#tune', '#wlPanel', '#scMy', '#scCard'].map($).find(vis);
    if (side){ const r = side.getBoundingClientRect(); if (r.left > W * .3) R = r.left - 8; }
    const left = !side && !['#rcHud', '.dm-tip', '#dmLoot', '#dmPad'].map($).some(vis);
    wrap.classList.toggle('left', left);
    let x0, x1;
    if (left){ st.left = st.width = ''; const r = wrap.getBoundingClientRect(); x0 = r.left; x1 = r.right; }
    else { const w = Math.min(340, Math.round((R - L) * (side ? .9 : .46))); x0 = Math.round((L + R - w) / 2); x1 = x0 + w; st.left = x0 + 'px'; st.width = w + 'px'; }
    let top = 0;
    for (const q of ['#gstat', '#hstat', '.ctrls', '.crow-sub', '#todBtn', '.topbar .brand', '#arcBar', '#mgHud', '#beHud', '#kmBar', '#dmClock', '#socStat']){
      const e = $(q); if (!vis(e)) continue;
      const r = e.getBoundingClientRect(); if (r.right > x0 && r.left < x1 && r.top < H * .4) top = Math.max(top, r.bottom);
    }
    st.top = top && top < H * .45 ? Math.round(top + 6) + 'px' : '';
  }

  /* ---------- the stack ---------- */
  const MAX = 2, list = [];
  let quiet = false;   /* our own changes to #toast's class are not "clear everything" */
  function drop(n, now){
    const i = list.indexOf(n); if (i < 0) return; list.splice(i, 1); clearTimeout(n.timer);
    if (now) n.el.remove(); else { n.el.classList.add('out'); setTimeout(() => n.el.remove(), 220); }
    if (!list.length){ quiet = true; toastEl.classList.remove('show'); quiet = false; }
  }
  function push(key, fill, ms, cls){
    const old = list.find(n => n.key === key);
    if (old){ clearTimeout(old.timer); old.timer = setTimeout(() => drop(old), ms); list.splice(list.indexOf(old), 1); list.unshift(old); wrap.insertBefore(old.el, firstNote()); place(); return; }
    const el = D.createElement('div'); el.className = 'nt' + (cls ? ' ' + cls : ''); fill(el);
    const n = {key, el, timer:0}; list.unshift(n); wrap.insertBefore(el, firstNote());
    /* over the limit: the oldest small line (achievement, parts) goes first, then the oldest notice */
    while (list.length > MAX){ const m = list.slice(1).reverse().find(x => x.el.classList.contains('mini')); drop(m || list[list.length - 1], true); }
    n.timer = setTimeout(() => drop(n), ms);
    /* tap it away, or flick it up */
    let y0 = null;
    el.addEventListener('pointerdown', e => { y0 = e.clientY; e.stopPropagation(); });
    el.addEventListener('pointermove', e => { if (y0 != null && e.clientY - y0 < -6) el.style.transform = `translateY(${Math.max(-40, e.clientY - y0)}px)`; });
    const end = e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy < -18 || Math.abs(dy) < 10) drop(n); else el.style.transform = ''; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { y0 = null; el.style.transform = ''; });
    quiet = true; toastEl.classList.add('show'); quiet = false;
    place();
  }
  const firstNote = () => wrap.querySelector('.nt');
  const text = (el, t) => { if (t instanceof Node) el.append(t.cloneNode(true)); else el.append(String(t)); };

  const desk = toast;
  toast = function(t, sub, ms){   /* eslint-disable-line no-global-assign */
    if (!phone()) return desk(t, sub, ms);
    const dur = Math.max(1400, Math.min(4000, Math.round((ms || 2200) * .75)));
    push('t:' + (t instanceof Node ? t.textContent : t) + '|' + (sub || ''), el => {
      const b = D.createElement('b'); text(b, t); el.append(b);
      if (sub){ const s = D.createElement('small'); s.textContent = sub; el.append(s); }
    }, dur);
  };
  /* old code clears the card with toastEl.classList.remove('show') before something that must not be covered: clear the stack too */
  new MutationObserver(() => { if (!quiet && !toastEl.classList.contains('show') && list.length) for (const n of list.slice()) drop(n, true); })
    .observe(toastEl, {attributes:true, attributeFilter:['class']});

  /* ---------- achievements and parts: one small line each ---------- */
  const ach = D.getElementById('gxach');
  if (ach) new MutationObserver(() => {
    if (!phone() || !ach.classList.contains('show')) return;
    const b = ach.querySelector('b'), s = ach.querySelector('small'); if (!b) return;
    push('a:' + b.textContent, el => { el.innerHTML = '<i>成就</i>'; const x = D.createElement('b'); x.textContent = b.textContent; el.append(x); if (s){ const y = D.createElement('small'); y.textContent = s.textContent; el.append(y); } }, 2600, 'mini ach');
  }).observe(ach, {attributes:true, attributeFilter:['class']});
  const gain = D.getElementById('tnGain');
  if (gain){
    let got = [], t = 0;
    new MutationObserver(recs => {
      if (!phone()) return;
      for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && n.classList.contains('tn-gain')) got.push(n.cloneNode(true));
      clearTimeout(t); t = setTimeout(() => {
        const g = got; got = []; if (!g.length) return;
        push('g:' + Date.now(), el => { el.innerHTML = '<i>到手</i>'; for (const c of g){ c.className = 'nt-part ' + [...c.classList].filter(k => k !== 'tn-gain' && k !== 'out').join(' '); el.append(c); } }, 2600, 'mini parts');
      }, 80);
    }).observe(gain, {childList:true});
  }

  addEventListener('resize', place);
  setInterval(() => { if (list.length || (call && !call.hidden)) place(); }, 300);
  window.XNote = {push, place, get list(){ return list.slice(); }};
})();
