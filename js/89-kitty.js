/* XMUM 校园漫游 · 主线小剧情：遇到校园里的小猫，喂它小鱼干，拍张照发给妈妈
 *
 * 用的就是 js/16-ambient.js 里本来就在校园各处溜达的小猫（cats，人一靠近就跑）。主线走到这一步（步骤写 kitty:true）时：
 *   走路慢慢靠近，小猫不跑（跑步、开车照样吓跑它，提示里写着别跑）；走到身边按 F（手机点按钮）：
 *   小猫凑过来坐在你面前 → 几句旁白（蹲下来、它闻了闻、叼走一块小鱼干）→ 咔嚓一下闪白，弹出一张拍立得（就是当时的画面）
 *   → 「发给妈妈」：妈妈过一会儿回消息，日记记一句，这一步打勾。「不发了」也算做完，只是妈妈不回。
 * 指南针指向最近的一只小猫。 */
'use strict';
(() => {
  if (typeof cats === 'undefined' || !window.XQuest || !window.XQD) return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const on = () => { const s = g(() => XQuest.step(), null); return !!(s && s.kitty && XQuest.ph === 'steps' && !XQuest.state.flags.q_cat); };
  const foot = () => mode === 'naiwa' && !g(() => driving, null) && !g(() => indoorNow(), false);
  function nearest(px, pz){
    let best = null, bd = 1e9;
    /* 小橘 is a ginger: only the orange cats (js/16-ambient.js colours them by index, CAT_COLS 0 / 4 / 7 are the oranges) */
    cats.forEach((c, i) => { if (![0, 4, 7].includes(i % 8)) return; const d = Math.hypot(c.x - px, c.z - pz); if (d < bd){ bd = d; best = c; } });
    return best ? {c:best, d:bd} : null;
  }
  /* walking up slowly does not scare the cat while this step is on; running or a car still does */
  if (typeof catThreats === 'function'){
    const base = catThreats;
    catThreats = function(){
      const t = base();
      if (busy || (on() && foot() && nw.spd < 7)) return t.map(([x, z, r]) => [x, z, Math.min(r, .7)]);
      return t;
    };
  }

  /* ---------- the moment ---------- */
  let busy = false, cat = null;
  function start(){
    const n = nearest(nw.x, nw.z); if (!n || n.d > 2.6) return false;
    busy = true; cat = n.c;
    /* it comes and sits in front of you */
    const fx = nw.x + Math.sin(nw.h) * 1.1, fz = nw.z + Math.cos(nw.h) * 1.1;
    Object.assign(cat, {state:'walk', sp:.8, tx:fx, tz:fz, t:0, flee:0});
    g(() => tone('sine', 880, 1320, .25, .05));
    XQuest.say([
      ['memo', '（慢慢蹲下来，把口袋里的小鱼干放在手心……）'],
      ['cat', '……喵？'],
      ['memo', '它凑过来闻了闻，叼走一块，尾巴竖得高高的。又吃了一块。'],
      ['memo', '好想给妈妈看看。']
    ], null, () => { if (cat){ cat.state = 'sit'; cat.t = 30; } setTimeout(photo, 300); });
    return true;
  }

  /* ---------- the photo: a white flash, then a polaroid of this very frame ---------- */
  const st = document.createElement('style'); st.textContent = `
#kitFlash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:60;transition:opacity .5s}
#kitPhoto{position:fixed;left:50%;top:50%;z-index:61;transform:translate(-50%,-50%) rotate(-3deg);background:#fffdf6;padding:12px 12px 14px;border-radius:6px;
  box-shadow:0 18px 50px rgba(0,0,0,.35);width:min(78vw,360px);text-align:center;font-family:var(--body, sans-serif);color:#3a3324}
#kitPhoto[hidden]{display:none}
#kitPhoto img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:2px;background:#ddd}
#kitPhoto p{margin:10px 0 10px;font:600 16px/1.4 var(--display, serif)}
#kitPhoto .kb{display:flex;gap:8px;justify-content:center}
#kitPhoto button{font:inherit;font-weight:700;border-radius:999px;padding:8px 16px;border:1px solid #c9b9a0;background:#fff;cursor:pointer;min-height:40px}
#kitPhoto button.go{background:#e8708a;border-color:#e8708a;color:#fff}
#kitPhoto kbd{font:inherit;font-size:12px;border:1px solid currentColor;border-bottom-width:2px;border-radius:4px;padding:0 4px;margin-left:4px}`;
  document.head.appendChild(st);
  const flash = document.createElement('div'); flash.id = 'kitFlash'; document.body.appendChild(flash);
  const card = document.createElement('div'); card.id = 'kitPhoto'; card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '拍好的照片');
  card.innerHTML = `<img alt="小橘的照片"><p></p><div class="kb"><button type="button" class="go" data-a="send">发给妈妈</button><button type="button" data-a="keep">不发了</button></div>`;
  document.body.appendChild(card);
  function photo(){
    let url = '';
    /* render this frame and read it back straight away (no preserveDrawingBuffer needed) */
    g(() => { renderer.render(scene, camera); url = renderer.domElement.toDataURL('image/jpeg', .82); });
    g(() => { noise(.12, .08, 3000); tone('square', 1800, 900, .06, .05); });
    flash.style.transition = 'none'; flash.style.opacity = '1'; void flash.offsetWidth; flash.style.transition = ''; setTimeout(() => { flash.style.opacity = '0'; }, 60);
    card.querySelector('img').src = url || '';
    card.querySelector('p').textContent = '小橘 · 开学第 ' + g(() => XQuest.dayNo(), 1) + ' 天';
    card.querySelector('.go').innerHTML = TOUCH ? '发给妈妈' : '发给妈妈<kbd>F</kbd>';
    setTimeout(() => { card.hidden = false; g(() => { gx.paused = true; }); card.querySelector('.go').focus({preventScroll:true}); }, 380);
  }
  function close(send){
    if (card.hidden) return;
    card.hidden = true; g(() => { gx.paused = false; }); g(() => canvas.focus({preventScroll:true}));
    XQuest.flag('q_cat'); g(() => XQuest.diaryAdd(send ? 'c1_cat' : 'c1_cat_keep'));
    if (send){ g(() => toast('已发送', '照片发给了妈妈', 1600)); setTimeout(() => g(() => XQuest.msg('mom_cat')), 2600); }
    busy = false; if (cat){ cat.t = 3; } cat = null;
  }
  card.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) close(b.dataset.a === 'send'); });
  card.addEventListener('pointerdown', e => e.stopPropagation());
  window.addEventListener('keydown', e => {
    if (card.hidden) return;
    if (e.code === 'KeyF' || e.code === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); close(true); }
    else if (e.code === 'Escape' || e.code === 'KeyX'){ e.preventDefault(); e.stopImmediatePropagation(); close(false); }
  }, true);

  /* ---------- F next to a cat (on foot, while the step is on) ---------- */
  const near = () => { if (!on() || !foot() || busy || XQuest.talking || g(() => XCine.busy, false) || gx.paused) return false; const n = nearest(nw.x, nw.z); return !!(n && n.d < 2.6); };
  if (typeof doF === 'function'){
    const base = doF;
    doF = function(){ if (near() && start()) return; return base(); };
  }
  g(() => actF.addEventListener('pointerdown', e => { if (!near()) return; e.preventDefault(); e.stopImmediatePropagation(); g(() => ac()); start(); }, true));
  { const base = Object.assign({}, gx);
    Object.assign(gx, {
      prompt(){ if (near()) return (TOUCH ? '点「喂猫」' : '按 F ') + '蹲下来喂小猫'; const p = base.prompt(); if (p) return p;
        if (on() && foot()){ const n = nearest(nw.x, nw.z); if (n && n.d < 10) return '慢慢走过去，别跑，会吓到它'; } return ''; }
    }); }
  if (typeof updateActs === 'function'){
    const base = updateActs;
    updateActs = function(){ base(); if (near()) g(() => { actF.querySelector('b').textContent = '喂猫'; }); };
  }
  window.XKitty = {nearestAt:() => { const n = nearest(nw.x, nw.z); return n ? [n.c.x, n.c.z] : null; }, start, photo, get busy(){ return busy; }};
})();
