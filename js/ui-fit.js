/* XMUM 校园漫游 · 右边一列和右下角按钮不重叠
   右边一列（钱包、主线任务条、跑腿袋子、小地图）会随着任务变长；窗口不够高时，它的底部会压到右下角的按钮（水枪、上车……）上，
   小地图被按钮盖住。这里每当这一列或按钮的大小变了，就量一次：重叠了就按顺序收紧，直到不重叠为止：
     fit-1  按钮排得更扁：水枪一行，其余四个一行，按钮矮一点
     fit-2  小地图缩到 96 px，钱包行距收紧
     fit-3  小地图挪到钱包面板的左边，和它顶部对齐，不再排在这一列的最下面
   样式在 css/style.css 的「右边一列和按钮不重叠」。只改 body 上的 class 和小地图的位置，不动别的界面。 */
(() => {
  const side = document.querySelector('.topbar .side'), acts = document.getElementById('acts');
  const mini = document.getElementById('mini'), gstat = document.getElementById('gstat');
  if (!side || !acts || !mini || !gstat || typeof ResizeObserver === 'undefined') return;
  const place = on => {
    if (!on){ mini.style.top = mini.style.left = ''; return; }
    const g = gstat.getBoundingClientRect();
    mini.style.top = Math.round(g.top) + 'px'; mini.style.left = Math.round(g.left - GAP - mini.offsetWidth) + 'px';
  };
  const LV = ['fit-1', 'fit-2', 'fit-3'], GAP = 8;
  const shown = el => !el.hidden && getComputedStyle(el).display !== 'none';
  const clash = () => {
    if (!shown(acts)) return false;
    const a = acts.getBoundingClientRect(), s = side.getBoundingClientRect();
    return a.height > 0 && s.bottom + GAP > a.top && s.right > a.left && s.left < a.right;
  };
  let raf = 0;
  function fit(){
    raf = 0;
    const b = document.body, was = LV.filter(c => b.classList.contains(c)).length;
    LV.forEach(c => b.classList.remove(c)); place(false);
    let n = 0; while (n < LV.length && clash()){ b.classList.add(LV[n]); n++; if (n === 3) place(true); }
    if (n !== was) b.dataset.fit = n;
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(fit); };
  const ro = new ResizeObserver(ask); ro.observe(side); ro.observe(acts);
  addEventListener('resize', ask);
  window.XFit = {now: fit, level: () => LV.filter(c => document.body.classList.contains(c)).length};
})();
