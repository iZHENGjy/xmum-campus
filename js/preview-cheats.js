/* 预览版测试模式：无限金币、改装道具和配方全给、改装立刻完工。只在预览版（/preview/，dev 分支）里有。
 *
 * 正式版不受影响，两道关：
 *   1. index.html 只有在 window.XMUM_PREVIEW === true 且网址里有 /preview/ 时才加载这个文件。
 *      XMUM_PREVIEW 是 .github/preview/guard.js 设的，那个文件只在部署预览版时注入（.github/workflows/pages.yml），
 *      正式版根目录和 /v1/ 经典版都没有。
 *   2. 这里第一件事再判断一次；另外如果连的是正式 Firebase 项目（xmum-campus），也直接不开。
 * 预览版本来就是离线的（或者连测试用的 Firebase 项目）；为了保险，这个文件一加载就把排行榜和小游戏榜的提交换成空操作，
 * 作弊攒出来的总资产、纪录哪儿都传不上去。总资产在本地照常显示。
 *
 * 右上角「测试模式」小标签：点开能关掉作弊（测正常经济）和改装立刻完工。
 * 关掉作弊时，钱包、改装道具和配方回到开作弊前的数量；作弊时买到的车、房、衣服、改装都留着。
 * 控制台：XCheat.on(true/false) · XCheat.fast(true/false) · XCheat.cars() 车行的车全给 · XCheat.state */
(() => {
  'use strict';
  if (!(window.XMUM_PREVIEW === true && /\/preview\//.test(location.pathname))) return;
  const fb = window.XMUM_FIREBASE;
  if (fb && (fb.projectId === 'xmum-campus' || /xmum-campus-default-rtdb/.test(String(fb.databaseURL || '')))){
    console.warn('[测试模式] 连的是正式数据库，不开作弊'); return;
  }

  /* ---------- 排行榜：预览版一律不交（离线时本来就交不上，这里是第二道保险） ---------- */
  if (window.XNet){ XNet.submit = async () => false; XNet.miniSubmit = async () => false; }

  const TOP = 9999999, PART_N = 999;
  const KEY = 'xmum-cheat-v1';            /* 预览版的 guard 会自动加 xmum-preview: 前缀 */
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  let S = {on:true, fast:true, real:null};
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) S = {on:d.on !== false, fast:d.fast !== false, real:d.real || null}; } catch(e){}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} };
  const hasTune = () => typeof tune !== 'undefined' && tune && tune.inv;
  const tuneSave = () => { g(() => tuneWrite()); g(() => { if (tn.on) tnRender(); }); };

  /* 开作弊前的钱包、道具、配方记下来，关掉时还原 */
  function snapshot(){
    if (S.real) return;
    S.real = {money:+g(() => money, 0) || 0, inv:hasTune() ? Object.assign({}, tune.inv) : null, bp:hasTune() ? Object.assign({}, tune.bp) : null};
    save();
  }
  function restore(){
    const r = S.real; S.real = null; save(); if (!r) return;
    g(() => { money = Math.max(0, +r.money || 0); moneyChanged(); });
    if (hasTune()){
      if (r.inv) for (const id in tune.inv) tune.inv[id] = Math.max(0, r.inv[id] | 0);
      if (r.bp){ for (const id in tune.bp) delete tune.bp[id]; for (const id in r.bp) if (r.bp[id]) tune.bp[id] = 1; }
      tuneSave();
    }
  }

  /* 买房装修里要成就的东西：测试模式下当作门槛已经够了（道具门槛照常，道具反正是满的） */
  const realMissing = typeof hzMissing === 'function' ? hzMissing : null;
  if (realMissing) window.hzMissing = it => { const out = realMissing(it); return S.on ? out.filter(m => !m.ach) : out; };

  /* ---------- 每 0.4 秒补满 ---------- */
  function tick(){
    if (S.on){
      if (g(() => money < TOP, false)){ g(() => { money = TOP; moneyChanged(); }); }
      if (hasTune()){
        let ch = false;
        for (const id in tune.inv) if (tune.inv[id] < PART_N){ tune.inv[id] = PART_N; ch = true; }
        if (typeof TN_BPS !== 'undefined') for (const b of TN_BPS) if (!tune.bp[b.id]){ tune.bp[b.id] = 1; ch = true; }
        if (ch) tuneSave();
      }
    }
    if (S.fast && hasTune()){
      const now = Date.now(); let ch = false;
      for (const j of tune.jobs) if (j.t1 > now){ j.t1 = now; j.t0 = Math.min(j.t0, now - 1000); ch = true; }
      if (ch){ tuneSave(); g(() => tnTick()); }
    }
  }

  /* ---------- 小标签和面板 ---------- */
  const css = document.createElement('style');
  css.textContent = `
#xcheat{position:fixed;top:calc(6px + env(safe-area-inset-top, 0px));left:50%;transform:translateX(-50%);z-index:9998;font:600 12px/1.5 system-ui,sans-serif}
#xcheat > button{all:unset;cursor:pointer;display:block;padding:3px 12px;border-radius:999px;background:#c0392b;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap}
#xcheat.off > button{background:#59606b}
#xcheat > button:focus-visible{outline:2px solid #fff;outline-offset:2px}
#xcheat .xc-pan{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);width:min(300px, calc(100vw - 32px));box-sizing:border-box;padding:12px;border-radius:12px;background:rgba(20,22,28,.96);color:#eef0f3;box-shadow:0 8px 28px rgba(0,0,0,.45);font-weight:400}
#xcheat .xc-pan[hidden]{display:none}
#xcheat label{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;font-weight:600;cursor:pointer}
#xcheat input{width:18px;height:18px;accent-color:#e74c3c;flex:none}
#xcheat p{margin:6px 0 0;color:#aab1bb;font-size:11.5px;line-height:1.5}
#xcheat .xc-btn{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:6px 10px;border-radius:8px;background:#2e3440;color:#fff;text-align:center;font-weight:600}
#xcheat .xc-btn:hover{background:#3b4352}
#xcheat .xc-q{margin-top:10px;padding-top:8px;border-top:1px solid #3b4352}
#xcheat .xc-q select{margin:0 6px;font:inherit;border-radius:6px;padding:2px 4px}`;
  const box = document.createElement('div'); box.id = 'xcheat';
  box.innerHTML = `<button type="button" aria-expanded="false" aria-controls="xcheatPan"></button>
<div class="xc-pan" id="xcheatPan" hidden>
  <label>无限金币和道具<input type="checkbox" data-k="on"></label>
  <label>改装立刻完工<input type="checkbox" data-k="fast"></label>
  <button type="button" class="xc-btn" data-cars>车行的车全部送我</button>
  <div class="xc-q"><b>主线</b>
    <button type="button" class="xc-btn" data-q="vet">模拟老玩家存档</button>
    <button type="button" class="xc-btn" data-q="reset">清空主线进度（当新玩家）</button>
    <label>跳到第<select data-qch>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${n === 8 ? '全部做完' : n}</option>`).join('')}</select>章开头</label>
    <button type="button" class="xc-btn" data-q="tick">这一章的步骤全部打勾</button>
    <button type="button" class="xc-btn" data-q="home">强制「想家」一次</button>
  </div>
  <p>只在预览版有。钱包补满 RM 9,999,999，改装道具每样 ${PART_N} 个、配方全开，装修的成就门槛也放开。关掉后钱包、道具和配方回到开之前的数量，买到的东西都留着。预览版不上排行榜。</p>
</div>`;
  const pill = box.querySelector('button'), pan = box.querySelector('.xc-pan');
  const ui = () => {
    box.classList.toggle('off', !S.on);
    pill.textContent = S.on ? '测试模式 · 无限金币' : '测试模式 · 作弊已关';
    for (const i of box.querySelectorAll('input')) i.checked = !!S[i.dataset.k];
  };
  pill.addEventListener('click', e => { e.stopPropagation(); pan.hidden = !pan.hidden; pill.setAttribute('aria-expanded', String(!pan.hidden)); });
  box.addEventListener('click', e => e.stopPropagation());
  box.addEventListener('keydown', e => e.stopPropagation());          /* 面板里按键不要开车、走路 */
  box.addEventListener('pointerdown', e => e.stopPropagation());
  document.addEventListener('click', () => { if (!pan.hidden){ pan.hidden = true; pill.setAttribute('aria-expanded', 'false'); } });
  box.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.k; if (k === 'on') setOn(e.target.checked); else if (k === 'fast') setFast(e.target.checked); });
  /* 主线测试（js/89-quest.js 的 XQuest.dev）：模拟老玩家会改本机存档并刷新（预览版的键有 xmum-preview: 前缀，正式存档不受影响） */
  box.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    const D = g(() => XQuest.dev, null); if (!D) return g(() => toast('没有主线', '', 1500));
    const k = b.dataset.q;
    if (k === 'vet' && !confirm('把本机（预览版）存档换成一个老玩家存档并刷新？主线进度会清空。')) return;
    if (k === 'reset' && !confirm('清空主线进度，当成新玩家？')) return;
    const r = k === 'vet' ? D.vet() : k === 'reset' ? D.reset() : k === 'tick' ? D.tickAll() : D.homesick();
    g(() => toast('主线测试', String(r || ''), 2200));
  }));
  { const sel = box.querySelector('[data-qch]'); if (sel) sel.addEventListener('change', () => { const r = g(() => XQuest.dev.skip(+sel.value), ''); g(() => toast('主线测试', String(r || ''), 2200)); }); }
  box.querySelector('[data-cars]').addEventListener('click', () => { const n = cars(); g(() => toast('车行的车都给你了', n ? `新到 ${n} 辆，去车行叫出来` : '本来就全有了', 2200)); });

  function setOn(v){
    v = !!v; if (v === S.on) return ui();
    if (v){ snapshot(); S.on = true; save(); tick(); }
    else { S.on = false; save(); restore(); }
    ui(); g(() => toast(v ? '测试模式：无限金币和道具' : '作弊已关', v ? '钱和道具会自动补满' : '钱包、道具和配方回到开之前', 2200));
  }
  function setFast(v){ S.fast = !!v; save(); tick(); ui(); }
  function cars(){
    let n = 0; g(() => { for (const s of SHOP) if (!owned.has(s.kind)){ owned.add(s.kind); n++; } if (n) saveGame(); });
    return n;
  }

  function mount(){ document.head.appendChild(css); document.body.appendChild(box); ui(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  if (S.on) snapshot();
  tick(); setInterval(tick, 400);

  window.XCheat = {on:setOn, fast:setFast, cars, get state(){ return JSON.parse(JSON.stringify(S)); }};
})();
