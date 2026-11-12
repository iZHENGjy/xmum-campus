/* SUKI-YA 火锅放题的模拟玩家（只给测试页用，不进正式页面），用来定奖牌线和看 AI 会不会太强。
   用法：打开 /test/offline.html（窗口要有尺寸：浏览器面板隐藏时先把视口设成 1280×800 再刷新），等加载完，在控制台：
     await fetch('test/sukiya-bot.js').then(r => r.text()).then(t => (0, eval)(t));
     SKB.run('classic', 'skilled', 3)    // 模式、水平、局数 → 每局 [吃回 RM, 盘数, 完美, 最高连击, 被夹走, 抢到, 饱腹, 阿明/卷卷, 怎么结束]
   水平：expert / skilled / casual / novice（反应间隔 rt 秒、对金圈时机的误差 sd 秒、挑盘子的办法）。
   从商场门口付钱进店（真的扣游戏里的钱，离线存档），点的是游戏里真的按钮（锅里的格子、托盘、喝水）。 */
(function(){
  const LV = {
    expert:{rt:.12, sd:.08, strat:'smart'},
    skilled:{rt:.22, sd:.18, strat:'smart'},
    casual:{rt:.35, sd:.3, strat:'any'},
    novice:{rt:.5, sd:.5, strat:'any'},
    meat:{rt:.22, sd:.18, strat:'meat'}
  };
  const V = {wagyu:9, beef:6, lamb:5, chick:3, ball:2, enoki:1.5, cab:1.2, tofu:.5, udon:.2};
  const tap = el => el && el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true}));
  const step = n => { const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    try { for (let i = 0; i < (n || 1); i++){ SKB.t = Math.max((SKB.t || 0) + 16.7, performance.now()); frame(SKB.t); } } finally { window.requestAnimationFrame = raf; } };
  function go(mode){
    if (typeof titleOpen !== 'undefined' && titleOpen) closeTitle();
    const w = document.querySelector('.q-wbox'); if (w && w.offsetParent) w.querySelector('button').click();
    XIOI.goDoor(); step(4); nw.z = XIOI.SUKI.z + 1; step(3); roomTryF();
    money = Math.max(money, 200); const ok = XIOI.pay(mode || 'classic'); XMini.sim.step(3); return ok;
  }
  function one(mode, lv){
    const L = LV[lv] || LV.skilled;
    if (!go(mode)) return 'no start: ' + XMini.state;
    const S = XMini.sim.state, plan = new Map(); let cd = 0;
    XMini.sim.step(70, dt => {
      if (XMini.state !== 'play') return false;
      cd -= dt; if (cd > 0) return; cd = L.rt * (.7 + Math.random() * .6);
      /* eat: aim at the middle of the gold window, with an error up to ±sd */
      for (let s = 0; s < 6; s++){
        const it = S.pot[s]; if (!it){ plan.delete(s); continue; }
        if (!plan.has(s) || plan.get(s).it !== it) plan.set(s, {it, at:it.f.cook + it.f.okT + it.f.perf * .5 + (Math.random() - .5) * 2 * L.sd});
        if (it.t >= plan.get(s).at){ tap(S.slotEl[s].b); return; }
      }
      if (S.spicy && L.strat !== 'any' && S.me.heat > 70 && S.me.water > 0){ tap(document.querySelector('#skTray .water')); return; }
      /* a plate into the pot: 'smart' takes the best plate but leaves udon and tofu once half full; 'meat' only meat; 'any' the best plate */
      let best = -1, bv = -1;
      S.tray.forEach((p, i) => { if (!p) return; const v = V[p.k] || 1;
        if (L.strat === 'meat' && v < 3) return;
        if (L.strat === 'smart' && v < 1 && S.me.fill > 45) return;
        if (v > bv){ bv = v; best = i; } });
      if (best >= 0 && S.pot.some(x => !x)) tap(S.trayEl[best]);
    });
    XMini.sim.step(1.5);
    const P = S.me, out = [+P.rm.toFixed(1), P.n, P.perf, P.best, P.lost, P.stole, Math.round(P.fill), S.fr.map(f => f.rm.toFixed(0)).join('/'), S.why];
    const back = [...document.querySelectorAll('#mgCard button')].find(b => /^回/.test(b.textContent)); if (back) back.click();
    XMini.sim.step(.2); step(2);
    return out;
  }
  window.SKB = {LV, go, one, step, run(mode, lv, n){ const rows = []; for (let i = 0; i < (n || 3); i++) rows.push(one(mode, lv));
    const avg = rows.filter(Array.isArray).reduce((s, r) => s + r[0], 0) / rows.length; return {mode, lv, avg:+avg.toFixed(1), rows}; }};
})();
