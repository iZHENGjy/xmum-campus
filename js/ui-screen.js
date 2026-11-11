/* XMUM 校园漫游 · 全屏和横屏
   - 标题页（主菜单）的按钮行里多一个「全屏」：Fullscreen API；安卓 Chrome 全屏后试着锁成横屏，锁不了就算了。
     iPhone 的 Safari 不让网页全屏，点了给一句提示：添加到主屏幕后打开更像 App。已经从主屏幕打开（standalone）就不显示这个按钮。
   - 手机竖着进游戏时，上方出一个小胶囊「横过来玩视野更大」，点掉（或者横过来玩过一次）就不再出现。
   横屏的界面排版全在 css/style.css 末尾「手机横屏 2.0」那一段，这个文件只管按钮和提示。 */
'use strict';
(() => {
  const D = document, de = D.documentElement;
  const get = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  /* inside WeChat / QQ / other apps, web fullscreen is flaky (it can leave the page not taking taps): no fullscreen there at all */
  const embedded = /MicroMessenger|QQ\/|Weibo|FBAN|FBAV|Instagram|Line\/|DingTalk|AlipayClient|XiaoHongShu|aweme|Bytedance/i.test(navigator.userAgent);
  const canFs = !embedded && !!(D.fullscreenEnabled || D.webkitFullscreenEnabled);
  const iOS = /iPhone|iPod/.test(navigator.userAgent) || (/iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 && !canFs);
  const fsEl = () => D.fullscreenElement || D.webkitFullscreenElement || null;

  /* ---------- 全屏按钮（标题页按钮行，排在「反馈」前面） ---------- */
  const more = D.querySelector('#title .t-more');
  if (more && !standalone && !embedded && (canFs || iOS)){
    const btn = D.createElement('button'); btn.type = 'button'; btn.className = 't-btn'; btn.id = 'tFull';
    btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="in" d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path class="out" d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>全屏</span>';
    const hint = D.createElement('span'); hint.className = 't-fs-hint'; hint.id = 'tFullHint'; hint.setAttribute('role', 'status'); hint.hidden = true;
    /* 和「反馈」放在一组：手机竖屏时上面那行四个按钮已经排满 */
    const fb = more.querySelector('.t-fb');
    if (fb){ fb.insertBefore(btn, fb.firstChild); more.insertBefore(hint, fb.nextSibling); } else { more.append(btn, hint); }
    let hintT = 0;
    const say = t => { hint.textContent = t; hint.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { hint.hidden = true; }, 7000); };
    const sync = () => { const on = !!fsEl(); btn.setAttribute('aria-pressed', String(on)); btn.querySelector('span').textContent = on ? '退出全屏' : '全屏'; };
    btn.addEventListener('click', async () => {
      if (!canFs){ say('iPhone 的 Safari 不能网页全屏：点分享按钮 →「添加到主屏幕」，从主屏幕打开更像 App。'); return; }
      try {
        if (fsEl()){ await (D.exitFullscreen ? D.exitFullscreen() : D.webkitExitFullscreen()); return; }
        await (de.requestFullscreen ? de.requestFullscreen({navigationUI:'hide'}) : de.webkitRequestFullscreen());
        /* 安卓 Chrome：全屏以后才允许锁方向；电脑和不支持的浏览器会拒绝，不管它 */
        if (TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      } catch(e){ say('这个浏览器不让网页全屏。'); }
    });
    D.addEventListener('fullscreenchange', sync); D.addEventListener('webkitfullscreenchange', sync);
    sync();
    /* 自己点了「退出全屏」：以后进游戏不再自动全屏；再点「全屏」就恢复 */
    btn.addEventListener('click', () => put('xmum-autofs', fsEl() ? '0' : '1'), true);
  }

  /* ---------- 手机：点模式卡片进游戏时顺手全屏（安卓等支持的浏览器；这一下点击就是浏览器要求的用户操作） ---------- */
  if (TOUCH && canFs && !standalone) D.addEventListener('click', e => {
    if (fsEl() || get('xmum-autofs') === '0' || !(e.target.closest && e.target.closest('#title [data-go="naiwa"], #title [data-go="hole"]'))) return;
    try { const p = de.requestFullscreen ? de.requestFullscreen({navigationUI:'hide'}) : de.webkitRequestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch(err){}
  }, true);

  /* ---------- 手机：不让页面被放大。双击放大由 css 的 touch-action:manipulation 挡掉，安卓的双指放大由 viewport 的 user-scalable=no 挡掉，
     iPhone 的 Safari 不认 user-scalable=no，要拦它自己的 gesture 事件。万一已经放大了（老页面、系统设置），给一句怎么恢复 ---------- */
  if (TOUCH){
    for (const ev of ['gesturestart', 'gesturechange']) D.addEventListener(ev, e => e.preventDefault(), {passive:false});
    D.addEventListener('dblclick', e => e.preventDefault(), {passive:false});
    const vv = window.visualViewport;
    if (vv){ let told = false; vv.addEventListener('resize', () => { if (vv.scale > 1.05 && !told && typeof toast === 'function'){ told = true; toast('画面被放大了', '两根手指捏一下就能缩回去', 2600); } else if (vv.scale <= 1.05) told = false; }); }
  }

  /* ---------- 竖屏提示：只在触屏、竖着、进了游戏（开车或黑洞）时出现 ---------- */
  const KEY = 'xmum-rotate-tip';
  if (!TOUCH || get(KEY) === '0') return;
  const tip = D.createElement('button'); tip.type = 'button'; tip.id = 'rotTip'; tip.className = 'panel'; tip.hidden = true;
  tip.setAttribute('aria-label', '横过来玩视野更大。点一下关掉，以后不再提示');
  tip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="9" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 9V5.5A2 2 0 0 1 7 3.5h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>'
    + '<path d="M15 3a6 6 0 0 1 6 6M21 9l-2.3-1.1M21 9l.9-2.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    + '<span>横过来玩视野更大</span><i aria-hidden="true">×</i>';
  D.body.appendChild(tip);
  const tall = matchMedia('(orientation: portrait)');
  let done = false, shownAt = 0;
  const stop = () => { done = true; tip.hidden = true; put(KEY, '0'); clearInterval(timer); };
  tip.addEventListener('click', stop);
  const timer = setInterval(() => {
    if (done) return;
    const b = D.body.classList, inGame = (b.contains('naiwa') || b.contains('hole')) && !b.contains('titled');
    /* 横过来玩过一次就算知道了 */
    if (inGame && !tall.matches){ stop(); return; }
    const busy = b.contains('wd-open') || b.contains('arc-in') || b.contains('sp-run') || D.querySelector('dialog[open]');
    const want = inGame && tall.matches && !busy;
    if (want && tip.hidden && shownAt !== -1){ tip.hidden = false; if (!shownAt) shownAt = Date.now(); }
    else if (!want && !tip.hidden) tip.hidden = true;
    if (!tip.hidden){
      /* under the top card, and under the car radio strip when it hangs there (it comes and goes with the car) */
      const tb = D.querySelector('.topbar'), rd = D.getElementById('radio');
      const y = Math.max(tb ? tb.getBoundingClientRect().bottom : 110, rd && !rd.hidden ? rd.getBoundingClientRect().bottom : 0);
      tip.style.top = Math.round(y + 10) + 'px';
    }
    /* 不点也只挂 12 秒，下次进游戏再提示 */
    if (!tip.hidden && shownAt && Date.now() - shownAt > 12000){ tip.hidden = true; shownAt = -1; }
    if (!inGame && shownAt === -1) shownAt = 0;
  }, 400);
})();
