/* XMUM 校园漫游 · 拿到车以后「现在你能玩」
 *
 * 仓库主人：「很多人进去还是不知道玩什么」。诊断：第 1 章一做完，章节卡、下一章卡、老周的消息、宿舍搜刮的接单胶囊、「进宿舍」按钮
 * 同时冒出来；拿到车以后又马上被第 2 章拉去送外卖，赛车、跳台、游戏厅、黑洞只藏在大地图的小图标里。
 * 主人选了「先跟着主线走」，所以：新玩家第一次坐进自己的 Myvi 时，只出这一张卡（游戏暂停）：
 *   大按钮「继续主线」（第一个，推荐）+ 4 个小按钮：飞跃挑战 · 环湖赛 · B1 游戏厅 · 黑洞。
 *   点小按钮：指南针指过去（到了就是那个玩法自己的光圈 / 门口），到了、5 分钟、或者有更急的事就回到主线；点黑洞直接切过去。
 * 只出一次（localStorage xmum-firstplay），只给新存档（XQuest.state.born === 'new'），不发奖励。
 * 卡出来之前（「坐上你的 Myvi」这一步）和卡开着时，别的东西先等等：XFirst.hold() 为真时
 *   js/89-offers.js 不弹接单卡、js/89-dorm.js 不认宿舍门、js/89-quest-ui.js 的手机消息排队，第 1 章结尾也不再叠「下一章」卡。
 * 对外：window.XFirst = {hold(), open(force), get on()}；本地测试 XFirst.open(true) 直接看卡。 */
'use strict';
(() => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const KEY = 'xmum-firstplay';
  let done = !!g(() => localStorage.getItem(KEY), null), on = false, wait = 0, way = null, shut = 0;
  const S = () => g(() => XQuest.state, {}) || {};
  const carStep = () => g(() => XQuest.step().id === 'c1_car0', false);
  const here = () => g(() => driving ? [driving.x, driving.z] : [nw.x, nw.z], [0, 0]);
  const actAt = id => g(() => GX_ACTS.find(a => a.id === id).start, null);

  const SPOTS = [
    {id:'jump', icon:'🦘', name:'飞跃挑战', sub:'冲黄色跳台，看能飞多远', at:() => actAt('jump'), how:TOUCH ? '开进黄圈，点「看看」开始' : '开进黄圈，按 F 开始'},
    {id:'lake', icon:'🏁', name:'环湖赛', sub:'绕两片湖跑一圈，抢金牌', at:() => actAt('lake'), how:TOUCH ? '开进蓝圈，点「看看」开始' : '开进蓝圈，按 F 开始'},
    {id:'arc', icon:'🕹️', name:'B1 游戏厅', sub:() => g(() => XMini.games.length, 0) + ' 个小游戏，有排行榜', at:() => g(() => [ARC_DOOR.x, ARC_DOOR.z], null), how:TOUCH ? '到门口点「进门」' : '到门口按 F 进门'},
    {id:'hole', icon:'🕳️', name:'黑洞 · 吞校园', sub:'150 秒，玩完点上面「奶娃」回来', hole:true}
  ];

  /* ---------- the card (reuses the welcome card's look: .q-welcome / .q-wbox, css/style.css) ---------- */
  const st = document.createElement('style'); st.textContent = `
#fpCard .q-wbox{width:min(440px,100%);max-height:calc(100vh - 24px);overflow:auto}
#fpCard .fp-main{all:unset;box-sizing:border-box;display:flex;flex-direction:column;gap:2px;width:100%;padding:12px 14px;border-radius:var(--r-md,12px);cursor:pointer;
  background:var(--tile,#b0462e);color:#fff;margin:10px 0 10px;box-shadow:0 3px 0 rgba(0,0,0,.18)}
#fpCard .fp-main b{font:900 17px/1.3 var(--display,inherit)}
#fpCard .fp-main span{font-size:13px;opacity:.9}
#fpCard .fp-or{margin:0 0 6px;font-size:12.5px;color:var(--muted);font-weight:700}
#fpCard .fp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#fpCard .fp-spot{all:unset;box-sizing:border-box;display:grid;grid-template-columns:auto 1fr;gap:0 8px;align-items:center;padding:9px 10px;border-radius:var(--r-md,12px);cursor:pointer;
  background:var(--chip,rgba(0,0,0,.06));min-height:52px}
#fpCard .fp-spot i{font-style:normal;font-size:22px;grid-row:1 / 3}
#fpCard .fp-spot b{font-size:14px;color:var(--ink)}
#fpCard .fp-spot span{font-size:11.5px;color:var(--muted);line-height:1.35}
#fpCard .fp-main:focus-visible,#fpCard .fp-spot:focus-visible{outline:3px solid #ffc21a;outline-offset:2px}
#fpCard .fp-main:hover{filter:brightness(1.06)}
#fpCard .fp-spot:hover{background:color-mix(in srgb, var(--tile,#b0462e) 14%, transparent)}
#fpCard .fp-foot{margin:10px 0 0;font-size:12px;color:var(--muted)}
@media (max-height:440px){
  #fpCard{padding:8px}
  #fpCard .q-wbox{width:min(660px,100%);padding:10px 14px 12px}
  #fpCard .q-whead{margin-bottom:2px}
  #fpCard .fp-main{margin:8px 0 8px;padding:9px 14px}
  #fpCard .fp-grid{grid-template-columns:repeat(4,1fr)}
  #fpCard .fp-foot{display:none}
}`;
  document.head.appendChild(st);
  const card = document.createElement('div'); card.id = 'fpCard'; card.className = 'q-welcome'; card.hidden = true;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'fpT');
  document.body.appendChild(card);
  const esc = t => String(t).replace(/[<>&"]/g, c => ({'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;'})[c]);
  function render(){
    const nx = g(() => XQuest.chapter(), null), npc = nx ? g(() => XQD.npcs[nx.npc], {}) || {} : {};
    const [px, pz] = here();
    const dist = s => { const a = s.at && s.at(); if (!a) return ''; const d = Math.hypot(a[0] - px, a[1] - pz); return ' · ' + (d < 1000 ? Math.round(d / 10) * 10 + ' 米' : (d / 1000).toFixed(1) + ' 公里'); };
    card.innerHTML = `<div class="panel q-wbox"><div class="q-whead"><i class="q-av" style="background:${g(() => XQD.npcs.xiaoman.color, '#3f8fe6')}">满</i><div><b id="fpT">有车了！现在你能玩</b><span>小满学姐 · 选一个，指南针带你去</span></div></div>
      <button type="button" class="fp-main" data-k="main"><b>★ 继续主线</b><span>${nx ? esc(`第 ${nx.n} 章 · ${nx.title}：开车去 ${nx.place || ''} 找${npc.name || ''}`) : '跟着任务条走'}</span></button>
      <p class="fp-or">或者先玩一会儿：</p><div class="fp-grid">` +
      SPOTS.map(s => `<button type="button" class="fp-spot" data-k="${s.id}"><i aria-hidden="true">${s.icon}</i><b>${esc(s.name)}</b><span>${esc(typeof s.sub === 'function' ? s.sub() : s.sub)}${dist(s)}</span></button>`).join('') +
      `</div><p class="fp-foot">这些地方大地图（${TOUCH ? '点右上角小地图' : '按 M'}）上都标着，随时能去。</p></div>`;
  }
  let pausedWas = false;
  function open(force){
    if (on || (!force && done)) return false;
    render(); card.hidden = false; on = true; done = true; g(() => localStorage.setItem(KEY, '1'));
    pausedWas = g(() => gx.paused, false); g(() => { gx.paused = true; });
    g(() => { for (const k in keys) keys[k] = false; joy.x = joy.y = 0; });
    g(() => card.querySelector('.fp-main').focus({preventScroll:true}));
    g(() => { tone('triangle', 659, 659, .12, .12); tone('triangle', 988, 988, .2, .12, .12); });
    return true;
  }
  function close(k){
    if (!on) return;
    on = false; shut = Date.now(); card.hidden = true; g(() => { gx.paused = pausedWas; canvas.focus({preventScroll:true}); });
    const s = SPOTS.find(x => x.id === k);
    if (s && s.hole){ g(() => setMode('hole')); return; }
    if (s){ const a = s.at(); if (a){ way = {x:a[0], z:a[1], label:s.icon + ' ' + s.name, until:Date.now() + 5 * 60e3}; g(() => toast('指南针指过去了', s.name + ' · ' + s.how, 2600)); } return; }
    g(() => toast('继续主线', '跟着指南针走；想玩别的，大地图上都有', 2200));
  }
  card.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b){ g(() => ac()); close(b.dataset.k); } });
  card.addEventListener('pointerdown', e => e.stopPropagation());
  window.addEventListener('keydown', e => {
    if (!on) return;
    if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close('main'); return; }
    if (e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') return;   /* the focused button */
    e.stopImmediatePropagation();
  }, true);

  /* ---------- the arrow: points at the picked place until you are there, 5 minutes pass, or something busier wants it ---------- */
  { const base = gx.target;
    gx.target = function(){
      if (way && !g(() => mission.on, false) && !g(() => gx.busy(), false)){
        const [px, pz] = here();
        if (Math.hypot(way.x - px, way.z - pz) < 14 || Date.now() > way.until) way = null;
        else return {x:way.x, z:way.z, label:way.label};
      }
      if (way && g(() => gx.busy(), false)) way = null;   /* started it */
      return base.apply(this, arguments);
    }; }

  /* ---------- when: a new player, sitting in their own car for the first time after chapter 1 ---------- */
  setInterval(() => {
    if (done || on) return;
    const s = S();
    if (s.born !== 'new' || g(() => XQuest.ch, 0) !== 2 || g(() => XQuest.ph, '') !== 'meet' || !(s.flags || {}).q_car1 || mode !== 'naiwa' || !g(() => driving, null)
      || g(() => XQuest.talking, false) || g(() => XCine.busy, false) || g(() => gx.paused, false) || document.querySelector('dialog[open]') || document.querySelector('.q-welcome:not([hidden])')){ wait = 0; return; }
    wait += .5; if (wait >= 1.5) open();
  }, 500);

  /* chapter 1's last talk and the 「坐上你的 Myvi」 step: the keys, the car and one hint, nothing else */
  const ending = () => !done && S().born === 'new' && ((g(() => XQuest.ch, 0) === 1 && g(() => XQuest.ph, '') === 'report') || carStep()
    || (g(() => XQuest.ch, 0) === 2 && g(() => XQuest.ph, '') === 'meet' && !!g(() => driving, null)));   /* just got in: the card is a moment away */
  window.XFirst = {hold:() => on || ending() || Date.now() - shut < 4000,   /* the held messages wait until the 「指南针指过去了」 toast has been read */
    open, get on(){ return on; }};

  /* ---------- 「坐上你的 Myvi」: while that step is on, the F button only means 上车 ----------
     the first order often ends at a dorm or a classroom, and their doors took the button (「进宿舍」「进门」) while the hint said 「上车」:
     one tap and a brand-new player was in a dorm raid. Next to the Myvi it gets you in; anywhere else it says where the car is. */
  const carOn = () => carStep() && mode === 'naiwa' && !g(() => driving, null) && !g(() => gx.paused, false) && !!g(() => myCar, null) && !g(() => XQuest.talking, false)
    && !g(() => XQuest.npcNear(), null);   /* next to 小满 / 老周 the button still talks (js/89-quest.js) */
  const tryCar = () => {
    if (g(() => nearestCar(), null) === myCar){ g(() => enterCar(myCar)); g(() => updateActs()); return; }
    const d = Math.round(g(() => Math.hypot(myCar.x - nw.x, myCar.z - nw.z), 0));
    g(() => toast('先走到车旁边', `你的 Myvi 在 ${d} 米外，跟着指南针走过去`, 1800));
  };
  { const base = doF; doF = function(){ if (carOn()){ tryCar(); return; } return base.apply(this, arguments); }; }   /* the F key */
  document.addEventListener('pointerdown', e => {   /* the touch button (bound to the old doF) */
    if (!e.target.closest || !e.target.closest('#act-f') || !carOn()) return;
    e.preventDefault(); e.stopImmediatePropagation(); g(() => ac()); tryCar();
  }, true);
  const fst = document.createElement('style'); fst.textContent = 'body.fp-car #prompt{visibility:hidden}'; document.head.appendChild(fst);
  (function keep(){   /* after the game's own frame: the label, and no door prompt under it */
    const h = carOn();
    document.body.classList.toggle('fp-car', h);
    if (h){ const b = g(() => document.querySelector('#act-f b'), null); if (b && b.textContent !== '上车') b.textContent = '上车'; }
    requestAnimationFrame(keep);
  })();
})();
