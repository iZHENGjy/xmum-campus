/* XMUM 校园漫游 · 接单卡片：外卖和任务先看清楚再决定接不接，不再一碰光圈就开始
 *
 * 给别的文件用的只有一个函数 offerJob。玩家站在能接这个任务的地方时（光圈里、门口），每一帧调一次；
 * 人走开了什么都不用做，调用一停卡片就自己收起来。
 *
 *   offerJob('唯一的 id', () => ({ ... }))     第二个参数只在卡片弹出来的那一刻调一次，返回下面的对象
 *   offerJob({id, title, ...})                 简单写法：直接给对象（没写 id 就用 title）
 *
 *   一份任务：
 *     {icon:'🧋', title:'蜜雪冰橙 · 打工', desc:'一句话说明', pay:60, time:45, dist:320, risk:'会化', accept:'开工',
 *      onAccept(){ 开始任务 }, onDecline(){ 可以不写 }}
 *   几份里挑一份（最多三份，外卖取餐点和得来速用这个）：
 *     {icon, title, desc, options:[{title, desc, pay, time, dist, risk, tag, onAccept(){...}}, ...], onDecline(){...}}
 *   pay：数字显示成「RM 45」，字符串原样显示。time：限时，秒。dist：距离，米。
 *   risk：风险或特点，红字（「会化，时间紧」「怕颠」）。tag：标题前的小标签（「加急」「跨区」）。
 *
 *   返回值：这张卡片正开着就是 true。
 *   这个文件没加载时请照旧直接开始：  if (typeof offerJob === 'function') offerJob(id, build); else start();
 *
 * 规则：
 *   电脑按 F 或回车接（几份时按 1 2 3 选），X 或 Esc 跳过；手机直接点卡片上的按钮。卡片不暂停游戏，也不挡路。
 *   跳过之后，要离开光圈并且过了 6 秒才会再弹。开走了卡片自动收起。
 *   车速 60 以上不弹（只是路过就不打扰）；卡片弹出来的头 0.25 秒不收按键，免得上一下 F 误接。
 *   「接单中」开关：按 J，或者点指南针旁边的小按钮。关掉以后路过任何光圈都不弹，适合只想闲逛的时候。
 *
 * 这个文件要排在 js/87-classroom.js 后面加载（要包 gx 的钩子），具体在哪一个 89 文件前后都行；offerJob 是运行时才调的，所以前面的文件也能用。
 */
'use strict';
const OFFER = {cur:null, frame:0, skip:{}, on:true, note:'', noteF:-9, VMAX:16.7, GRACE:.25, COOL:6};
try { OFFER.on = localStorage.getItem('xmum-offers-v1') !== '0'; } catch(e){}
{ const st = document.createElement('style'); st.textContent = `
#offer{position:fixed;z-index:6;left:50%;bottom:calc(var(--safe-b) + 62px);transform:translateX(-50%);width:max-content;max-width:min(780px,calc(100% - 24px));box-sizing:border-box;
  padding:8px 10px 10px;border-top:3px solid var(--tile);background:var(--panel-solid)}
#offer[hidden]{display:none}
.of-h{display:flex;align-items:center;gap:8px;margin:0 0 7px}
.of-h i{font-style:normal;font-size:19px;line-height:1}
.of-h b{font-family:var(--display);font-size:15px;white-space:nowrap}
.of-h span{flex:1;min-width:0;font-size:12px;color:var(--muted);line-height:1.4}
.of-x{flex:none;min-height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.of-x:hover{border-color:var(--tile);color:var(--tile)}
.of-opts{display:flex;gap:8px}
.of-opt{flex:1 1 0;min-width:168px;text-align:left;padding:7px 10px 8px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);font:inherit;cursor:pointer;touch-action:manipulation}
.of-opt:hover,.of-opt:active{border-color:var(--tile)}
.of-opt b{display:block;font-family:var(--display);font-size:14.5px;line-height:1.35}
.of-opt b u{text-decoration:none;font-family:var(--body);font-size:11px;font-weight:700;color:var(--on-accent);background:var(--tile);border-radius:4px;padding:1px 5px;margin-right:5px;vertical-align:1px}
.of-opt kbd{float:right;margin-left:8px}
.of-opt span{display:block;font-size:12px;color:var(--muted);line-height:1.5;font-variant-numeric:tabular-nums}
.of-opt span em{font-style:normal;font-weight:700;color:var(--ink)}
.of-opt span.risk{color:var(--tile);font-weight:700}
.of-opt.go{background:var(--tile);border-color:var(--tile);color:var(--on-accent)}
.of-opt.go span,.of-opt.go span em,.of-opt.go span.risk{color:inherit}
.of-opt.go span{opacity:.92}
#ofTog{flex:none;display:inline-flex;align-items:center;gap:5px;min-height:26px;padding:0 9px;margin-left:2px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12px;
  cursor:pointer;touch-action:manipulation;white-space:nowrap}
#ofTog::before{content:'';width:8px;height:8px;border-radius:50%;background:#2fbf6e}
#compass svg{flex:none}
#ofTog[aria-pressed="false"]{color:var(--muted)}
#ofTog[aria-pressed="false"]::before{background:var(--muted);opacity:.5}
body.op-open #offer,body.wd-open #offer,body.arc-in #offer{display:none!important}
@media (max-width:760px){
  /* phones: over the stats panel at the top (nobody reads the wallet while choosing), so as little of the road as possible is covered */
  #offer{z-index:7;bottom:auto;top:calc(var(--safe-t) + 66px);width:calc(100% - 24px);padding:7px 8px 8px}
  #offer:not(.one) .of-h span{display:none} #offer:not(.one) .of-h b{flex:1}
  #offer.one .of-h{flex-wrap:wrap} #offer.one .of-h span{order:9;flex:1 1 100%}
  .of-opts{flex-direction:column;gap:5px}
  .of-opt{flex:none;min-width:0;min-height:44px;padding:5px 10px 6px}
  .of-opt b{display:inline} .of-opt span.risk{display:inline;margin-left:7px} .of-opt span{line-height:1.4}
  .of-x{min-height:34px}
}
@media (max-width:560px){ #ofTog{order:-1;margin:0 2px 0 0;font-size:11.5px;padding:0 7px;gap:4px} }
@media (pointer:coarse){ #offer kbd{display:none} #ofTog{min-height:30px} }`; document.head.appendChild(st); }
const offerEl = document.createElement('div');
offerEl.className = 'panel'; offerEl.id = 'offer'; offerEl.hidden = true; offerEl.setAttribute('role', 'group'); offerEl.setAttribute('aria-label', '接单');
document.body.appendChild(offerEl);
const ofEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const ofPay = v => (typeof v === 'number' ? 'RM ' + Math.round(v) : v);
const ofTime = v => (typeof v === 'number' ? '限时 ' + Math.round(v) + ' 秒' : v);
const ofDist = v => (typeof v === 'number' ? (v >= 1000 ? (v / 1000).toFixed(1) + ' 公里' : Math.round(v / 10) * 10 + ' 米') : v);
/* phones (body.nt-on, js/ui-notice.js): a new offer first shows as one pill above the action buttons, so the road stays clear; a tap opens the full card */
function ofPill(c){
  const s = c.spec, n = c.opts.length, pays = c.opts.map(o => o.pay).filter(v => typeof v === 'number');
  const lo = pays.length ? Math.round(Math.min(...pays)) : null, hi = pays.length ? Math.round(Math.max(...pays)) : null;
  const pay = lo != null ? 'RM ' + lo + (hi !== lo ? '–' + hi : '') : (c.opts[0].pay != null ? ofPay(c.opts[0].pay) : '');
  offerEl.innerHTML = `<button type="button" class="of-pill" data-open aria-label="${ofEsc(s.title)}：有单可接，点开看详情"><i>${ofEsc(s.icon || '📋')}</i><b>${n > 1 ? `接单 · ${n} 选 1` : '接单'}</b>` +
    (pay ? `<em>${ofEsc(pay)}</em>` : '') + `<span>${ofEsc(s.title)}</span><u aria-hidden="true">看看</u></button>`;
}
function ofPlace(){
  if (!offerEl.classList.contains('mini')){ offerEl.style.bottom = ''; return; }
  /* just above whatever sits under it on the right: the action buttons, and on upright phones the compass row */
  const me = offerEl.getBoundingClientRect(); let top = 1e9;
  for (const id of ['acts', 'compass']){
    const e = document.getElementById(id); if (!e || e.hidden) continue;
    const r = e.getBoundingClientRect(); if (r.height && r.right > me.left && r.left < me.right) top = Math.min(top, r.top);
  }
  offerEl.style.bottom = top < 1e9 ? Math.round(innerHeight - top + 8) + 'px' : '';
}
function ofRender(c){
  const s = c.spec, one = c.opts.length === 1 && !s.options;
  offerEl.classList.toggle('one', one); offerEl.classList.toggle('mini', !!c.mini);
  if (c.mini){ ofPill(c); ofPlace(); return; }
  offerEl.style.bottom = '';
  offerEl.innerHTML = `<div class="of-h"><i>${ofEsc(s.icon || '📋')}</i><b>${ofEsc(s.title)}</b><span>${ofEsc(s.desc || '')}</span>${c.pill ? '<button type="button" class="of-x" data-min>收起</button>' : ''}<button type="button" class="of-x" data-x>跳过${TOUCH ? '' : ' X'}</button></div><div class="of-opts">` +
    c.opts.map((o, i) => {
      const meta = [o.pay != null && `<em>${ofEsc(ofPay(o.pay))}</em>`, o.desc && ofEsc(o.desc), o.time != null && ofEsc(ofTime(o.time)), o.dist != null && ofEsc(ofDist(o.dist))].filter(Boolean).join(' · ');
      return `<button type="button" class="of-opt${one ? ' go' : ''}" data-i="${i}"><kbd>${one ? 'F' : i + 1}</kbd><b>${o.tag ? `<u>${ofEsc(o.tag)}</u>` : ''}${ofEsc(o.title)}</b>` +
        (o.risk ? `<span class="risk">${ofEsc(o.risk)}</span>` : '') + (meta ? `<span>${meta}</span>` : '') + '</button>';
    }).join('') + '</div>';
}
function ofClose(){ if (!OFFER.cur) return; OFFER.cur = null; offerEl.hidden = true; }
function ofAccept(i){
  const c = OFFER.cur; if (!c || !c.opts[i] || performance.now() / 1000 - c.t < OFFER.GRACE) return;
  ofClose(); const f = c.opts[i].onAccept; if (f) f();
}
function ofSkip(){
  const c = OFFER.cur; if (!c) return;
  OFFER.skip[c.id] = {until:performance.now() / 1000 + OFFER.COOL, seen:OFFER.frame};
  ofClose(); tone('triangle', 520, 390, .08, .05); if (c.spec.onDecline) c.spec.onDecline();
}
function ofNote(t){ OFFER.note = t; OFFER.noteF = OFFER.frame; }
function offerJob(id, build){
  if (id && typeof id === 'object'){ const spec = id; build = () => spec; id = spec.id || spec.title; }
  const O = OFFER;
  if (mode !== 'naiwa' || gx.paused || id == null) return false;
  if (qCalm() && !/^deliv:/.test(id)) return false;   /* story chapter 1: deliveries only */
  /* next to a story character F is for talking (老周 and 阿明 stand by pick-up rings). Except the hand-over card of a shopping list
     (js/89-errand.js 'erto:'): those are delivered to that very person (卷卷's supper stands 3 m from her, 老周's durian 4 m from him) */
  if (window.XQuest && (XQuest.talking || (XQuest.npcNear() && !/^erto:/.test(id)) || (XQuest.visiting && XQuest.visiting()))) return false;
  const sk = O.skip[id];
  if (sk){ sk.seen = O.frame; ofNote('这单跳过了 · 走开一下再回来可以重新看'); return false; }
  if (!O.on){ ofNote(TOUCH ? '现在不接单：点指南针旁的「不接单」打开' : '现在不接单：按 J 打开'); return false; }
  if (O.cur){ if (O.cur.id !== id) return false; O.cur.seen = O.frame; if (O.cur.mini && !(O.frame % 15)) ofPlace(); return true; }
  if (driving && Math.hypot(driving.vx, driving.vz) > O.VMAX){ ofNote('慢一点才看得到单子'); return false; }
  const spec = build(); if (!spec) return false;
  const opts = (spec.options ? spec.options.slice(0, 3) : [{title:spec.accept || '接单', pay:spec.pay, time:spec.time, dist:spec.dist, risk:spec.risk, onAccept:spec.onAccept}]);
  if (!opts.length) return false;
  O.cur = {id, spec, opts, seen:O.frame, t:performance.now() / 1000, mini:document.body.classList.contains('nt-on')};
  ofRender(O.cur); offerEl.hidden = false; tone('triangle', 880, 1175, .09, .06);
  return true;
}
/* is this id on the screen right now, was it skipped, or are offers switched off: for callers that want their own prompt */
function offerState(id){ return OFFER.cur && OFFER.cur.id === id ? 'open' : OFFER.skip[id] ? 'skipped' : OFFER.on ? '' : 'off'; }
function offerToggle(on){
  OFFER.on = on == null ? !OFFER.on : !!on; try { localStorage.setItem('xmum-offers-v1', OFFER.on ? '1' : '0'); } catch(e){}
  if (!OFFER.on) ofClose();
  ofTogBtn.setAttribute('aria-pressed', String(OFFER.on)); ofTogBtn.textContent = OFFER.on ? '接单中' : '不接单'; ofTogBtn.setAttribute('aria-label', OFFER.on ? '接单中，点一下改成不接单' : '不接单，点一下改成接单中');
  return OFFER.on;
}
/* the switch sits at the end of the compass chip, so it is in reach on every screen size */
const ofTogBtn = document.createElement('button');
ofTogBtn.type = 'button'; ofTogBtn.id = 'ofTog'; ofTogBtn.title = '接单开关（J）：关掉后路过光圈不弹接单卡片';
compass.appendChild(ofTogBtn); offerToggle(OFFER.on);
ofTogBtn.addEventListener('click', e => {
  e.stopPropagation(); ac(); const on = offerToggle(); sfx.ding();
  toast(on ? '接单中' : '不接单', on ? '走进光圈会弹出接单卡片' : '路过光圈不再弹卡片，想接单再点一下', 2200); canvas.focus({preventScroll:true});
});
offerEl.addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); ac();
  if (e.target.closest('[data-open]') && OFFER.cur){ OFFER.cur.mini = false; OFFER.cur.pill = true; ofRender(OFFER.cur); canvas.focus({preventScroll:true}); return; }
  if (e.target.closest('[data-min]') && OFFER.cur){ OFFER.cur.mini = true; ofRender(OFFER.cur); canvas.focus({preventScroll:true}); return; }
  if (b) ofAccept(+b.dataset.i); else if (e.target.closest('[data-x]')) ofSkip();
  canvas.focus({preventScroll:true});
});
offerEl.addEventListener('pointerdown', e => e.stopPropagation());
/* keys: ahead of js/90-main.js, so F on an open card is "accept", not "get out of the car" */
window.addEventListener('keydown', e => {
  if (mode !== 'naiwa' || gx.paused || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
  if (e.code === 'KeyJ'){ const on = offerToggle(); sfx.ding(); toast(on ? '接单中' : '不接单', on ? '走进光圈会弹出接单卡片' : '路过光圈不再弹卡片，想接单再按 J', 2200); return; }
  const c = OFFER.cur; if (!c) return;
  const i = e.code === 'KeyF' || e.code === 'Enter' ? 0 : {Digit1:0, Digit2:1, Digit3:2, Numpad1:0, Numpad2:1, Numpad3:2}[e.code];
  if (e.target.tagName === 'BUTTON' && e.code === 'Enter') return;
  if (i != null && c.opts[i]){ e.preventDefault(); e.stopImmediatePropagation(); ofAccept(i); }
  else if (e.code === 'KeyX' || e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); ofSkip(); }
}, true);
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      /* the card closes when nobody asked for it during the last frame; a skipped offer comes back once the player has left and the cool-down is over */
      const O = OFFER, now = performance.now() / 1000;
      if (O.cur && O.cur.seen < O.frame) ofClose();
      for (const k in O.skip) if (O.skip[k].seen < O.frame && now > O.skip[k].until) delete O.skip[k];
      O.frame++;
      base.update(dt, px, pz);
    },
    prompt(){ return base.prompt() || (OFFER.noteF >= OFFER.frame - 1 ? OFFER.note : ''); },
    frame(dt, T){ if (base.frame) base.frame(dt, T); if (OFFER.cur && (mode !== 'naiwa' || gx.paused)) ofClose(); },
    onBust(){ ofClose(); base.onBust(); },
    leave(){ ofClose(); OFFER.skip = {}; base.leave(); }
  });
}
