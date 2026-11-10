/* XMUM 校园漫游 · 左上角「XMUM 校园漫游」卡片的收起和展开。
   收起后只剩一条：标题和打卡数，点一下展开。
   自动收起：在室内（教室、宿舍、B1 游戏厅：indoorNow()）、外卖或挑战进行中、黑洞一局里。这时点开只管到这次活动结束。
   平时用卡片右上角的小箭头手动收起，状态记在 localStorage 的 xmum-brand-min 里。
   对外：window.XBrand = { min, set(min) } */
'use strict';
(() => {
  const el = document.querySelector('.brand'); if (!el) return;
  const KEY = 'xmum-brand-min';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'brand-tog';
  btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10 L8 6 L12 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  el.append(btn);
  let user = false; try { user = localStorage.getItem(KEY) === '1'; } catch(e){}
  let auto = false, peek = false;   /* peek: opened by hand while something is running; forgotten when it ends */
  const busy = () => {
    try {
      if (mode === 'hole') return true;
      return mode === 'naiwa' && ((typeof indoorNow === 'function' && indoorNow()) || mission.on || gx.busy() || gx.extBusy());
    } catch(e){ return false; }
  };
  const isMin = () => (auto ? !peek : user);
  function apply(){
    const min = isMin(); el.classList.toggle('min', min);
    btn.setAttribute('aria-expanded', String(!min)); btn.setAttribute('aria-label', min ? '展开校园卡片' : '收起校园卡片'); btn.title = min ? '展开' : '收起';
  }
  function set(min){
    if (auto) peek = !min; else { user = !!min; try { localStorage.setItem(KEY, user ? '1' : '0'); } catch(e){} }
    apply();
  }
  btn.addEventListener('click', e => { e.stopPropagation(); set(!isMin()); });
  el.addEventListener('click', e => { if (isMin() && !e.target.closest('button, a')) set(false); });
  setInterval(() => { const a = busy(); if (a !== auto){ auto = a; peek = false; apply(); } }, 250);
  apply();
  window.XBrand = {get min(){ return isMin(); }, set};
})();
