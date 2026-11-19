/* XMUM 校园漫游 · 第 1 章结尾安静一点
 *
 * 诊断（2026-11-19，新存档在离线页走了一遍）：第 1 章一做完，章节卡、「可以开车了」、「Myvi 到了」、老周和小满的手机消息、
 * 宿舍搜刮的接单胶囊、「进宿舍」提示、🎯 换指南针的提示同时冒出来；提示说「点上车」，按钮却写着「进宿舍」或「进门」
 * （第一单常常送到宿舍、教室门口），新人一点就进了宿舍搜刮。
 * 这里只做清理，不加新东西：新存档从第 1 章最后那段对话到第一次坐进自己的 Myvi 之间（XCh1End.hold() 为真）——
 *   - js/89-offers.js 不弹接单卡，js/89-quest-ui.js 的手机消息排队，js/89-guide-pick.js 的 🎯 提示先不弹；坐进车里以后照常一条条出来；
 *   - 「坐上你的 Myvi」这一步里 F 键和「上车」按钮只管上车：在车旁就上车，离得远就说车在几米外；旁边有 NPC 时照样说话；
 *     门口的「点进宿舍 / 进门」提示条先藏起来。
 * 只对新存档（XQuest.state.born === 'new'）。对外：window.XCh1End = {hold()} */
'use strict';
(() => {
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const isNew = () => g(() => XQuest.state.born, '') === 'new';
  const carStep = () => g(() => XQuest.step().id === 'c1_car0', false);
  /* chapter 1's last talk with 小满, then 「坐上你的 Myvi」 */
  const hold = () => isNew() && ((g(() => XQuest.ch, 0) === 1 && g(() => XQuest.ph, '') === 'report') || carStep());

  /* ---------- 「坐上你的 Myvi」: the F button only means 上车 ---------- */
  const carOn = () => carStep() && isNew() && mode === 'naiwa' && !g(() => driving, null) && !g(() => gx.paused, false) && !!g(() => myCar, null)
    && !g(() => XQuest.talking, false) && !g(() => XQuest.npcNear(), null);   /* next to 小满 / 老周 the button still talks (js/89-quest.js) */
  const tryCar = () => {
    if (g(() => nearestCar(), null) === myCar){ g(() => enterCar(myCar)); g(() => updateActs()); return; }
    const d = Math.round(g(() => Math.hypot(myCar.x - nw.x, myCar.z - nw.z), 0));
    g(() => toast('先走到车旁边', `你的 Myvi 在 ${d} 米外，跟着指南针走过去`, 1800));
  };
  { const base = doF; doF = function(){ if (carOn()){ tryCar(); return; } return base.apply(this, arguments); }; }   /* the F key */
  document.addEventListener('pointerdown', e => {   /* the touch button (js/90-main.js bound it to the old doF) */
    if (!e.target.closest || !e.target.closest('#act-f') || !carOn()) return;
    e.preventDefault(); e.stopImmediatePropagation(); g(() => ac()); tryCar();
  }, true);
  const st = document.createElement('style'); st.textContent = 'body.ch1-car #prompt{visibility:hidden}'; document.head.appendChild(st);
  (function keep(){   /* after the game's own frame (js/90-main.js loads first): the label, and no door prompt under it */
    const h = carOn();
    document.body.classList.toggle('ch1-car', h);
    if (h){ const b = g(() => document.querySelector('#act-f b'), null); if (b && b.textContent !== '上车') b.textContent = '上车'; }
    requestAnimationFrame(keep);
  })();

  window.XCh1End = {hold};
})();
