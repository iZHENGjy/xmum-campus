/* XMUM 校园漫游 · 手机操作设置：左手模式、按钮大小、按钮透明度、转视角快慢
   只在触屏上出现（TOUCH，js/00-core.js）；电脑上这个文件什么都不做，布局和以前一样。
   入口：标题页「操作」按钮、暂停面板标题栏的「操作」。存在 localStorage 'xmum-touch-v1'（预览版的 guard 会自动加前缀）；
   没存过 = 默认值 = 改版前的布局（右手、中号、不透明、转视角 1 倍）。
   怎么生效：body 上的类和两个 CSS 变量（样式在 css/touch.css）：
     tc-left 左手模式 · tc-sz 按钮不是中号 · tc-big 大号（要把提示条往上挪）· tc-fade 半透明
     --tc-s 按钮和摇杆的缩放 · --tc-a 透明度
   对外：window.XTC = { s 缩放, cam 转视角倍数, left, open() }（js/90-main.js 的摇杆和拖动转视角读 s 和 cam） */
'use strict';
(function(){
  const KEY = 'xmum-touch-v1';
  const SIZE = {s:.88, m:1, l:1.2}, ALPHA = {1:1, 75:.75, 50:.5}, CAM = {slow:.6, mid:1, fast:1.6};
  const DEF = {left:false, size:'m', alpha:'1', cam:'mid'};
  const st = Object.assign({}, DEF);
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object'){
      st.left = d.left === true;
      if (SIZE[d.size] != null) st.size = d.size;
      if (ALPHA[d.alpha] != null) st.alpha = String(d.alpha);
      if (CAM[d.cam] != null) st.cam = d.cam;
    }
  } catch(e){}
  const XTC = window.XTC = {s:1, cam:1, left:false, open:() => {}};
  if (!TOUCH) return;

  const root = document.documentElement, body = document.body;
  function apply(){
    const s = SIZE[st.size], a = ALPHA[st.alpha];
    XTC.s = s; XTC.cam = CAM[st.cam]; XTC.left = st.left;
    body.classList.toggle('tc-left', st.left);
    body.classList.toggle('tc-sz', s !== 1);
    body.classList.toggle('tc-big', s > 1);
    body.classList.toggle('tc-fade', a < 1);
    root.style.setProperty('--tc-s', String(s));
    root.style.setProperty('--tc-a', String(a));
  }
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(st)); } catch(e){} }
  apply();

  /* ---------- the sheet ---------- */
  const ROWS = [
    {k:'left', t:'左手模式', d:'摇杆在右边，按钮在左边', opts:[[false, '右手'], [true, '左手']]},
    {k:'size', t:'按钮大小', d:'摇杆和按钮一起变', opts:[['s', '小'], ['m', '中'], ['l', '大']]},
    {k:'alpha', t:'按钮透明度', d:'调透一点能看到后面的路', opts:[['1', '不透明'], ['75', '75%'], ['50', '50%']]},
    {k:'cam', t:'转视角快慢', d:'手指拖动屏幕转镜头的速度', opts:[['slow', '慢'], ['mid', '中'], ['fast', '快']]}
  ];
  const dlg = document.createElement('dialog'); dlg.id = 'tcSet'; dlg.className = 'panel sheet'; dlg.setAttribute('aria-labelledby', 'tcSetT');
  dlg.innerHTML = `<div class="sheet-h"><h2 id="tcSetT">手机操作</h2><button type="button" class="x" data-close aria-label="关闭">×</button></div>
    <div class="tc-rows">${ROWS.map(r => `<div class="tc-row" role="group" aria-labelledby="tc-${r.k}">
      <div class="tc-l"><b id="tc-${r.k}">${r.t}</b><span>${r.d}</span></div>
      <div class="seg seg-gfx tc-seg">${r.opts.map(([v, l]) => `<button type="button" data-k="${r.k}" data-v="${String(v)}" aria-pressed="false">${l}</button>`).join('')}</div>
    </div>`).join('')}</div>
    <div class="hrow tc-foot"><button type="button" class="btn" id="tcReset">恢复默认</button><button type="button" class="btn primary" data-close>好了</button></div>`;
  body.appendChild(dlg);
  function sync(){
    dlg.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-pressed', String(String(st[b.dataset.k]) === b.dataset.v)));
  }
  dlg.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b){ const k = b.dataset.k; st[k] = k === 'left' ? b.dataset.v === 'true' : b.dataset.v; save(); apply(); sync(); return; }
    if (e.target.id === 'tcReset'){ Object.assign(st, DEF); save(); apply(); sync(); return; }
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close ? dlg.close() : dlg.removeAttribute('open');
  });
  let back = null;
  dlg.addEventListener('close', () => { if (back && back.focus) back.focus({preventScroll:true}); back = null; });
  function open(){
    if (dlg.open) return;
    back = document.activeElement; sync();
    dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  }
  XTC.open = open;

  /* ---------- the ways in: the title page row and the pause panel's header ---------- */
  const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="9.5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="9.5" r="1" fill="currentColor"/><rect x="9.6" y="4" width="4.6" height="3.6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="9.6" y="9.4" width="4.6" height="3.6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  { const fb = document.querySelector('#title .t-fb'), t = document.getElementById('tSound');   /* in the 全屏 · 反馈 group (js/ui-screen.js): the row above is full on phones */
    if (fb || t){ const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn'; b.id = 'tTouch'; b.innerHTML = ICON + '<span>操作</span>';
      b.addEventListener('click', open);
      const full = document.getElementById('tFull');
      if (fb) fb.insertBefore(b, full && full.parentNode === fb ? full.nextSibling : fb.firstChild); else t.parentNode.insertBefore(b, t.nextSibling); } }
  { const head = document.querySelector('#gxpause .shop-h');
    if (head){ const b = document.createElement('button'); b.type = 'button'; b.className = 'gd-pill tc-pill'; b.id = 'gxpTouch'; b.innerHTML = ICON + '操作';
      b.setAttribute('aria-label', '手机操作设置'); b.addEventListener('click', open); head.appendChild(b); } }

  /* long-pressing a button or the stick never opens the browser's menu */
  for (const el of [document.getElementById('joy'), document.getElementById('acts')]) if (el) el.addEventListener('contextmenu', e => e.preventDefault());
})();
