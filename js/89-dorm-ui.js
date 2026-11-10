/* XMUM 校园漫游 · 宿舍搜刮的界面：背包条、搜到的东西、密码键盘和线索本、结算；衣橱里用「周边券」换的独家配件。
   玩法和世界在 js/89-dorm.js。面板都放在屏幕中间偏上，手机上不挡左下摇杆和右下按钮；开着面板时游戏不暂停。 */
'use strict';
const dmEl = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; e.className = cls || ''; if (html) e.innerHTML = html; e.hidden = true; document.body.appendChild(e); return e; };
const dmVigEl = dmEl('div', 'dmVig', ''); dmVigEl.setAttribute('aria-hidden', 'true');
const dmBagEl = dmEl('div', 'dmBag', '', '<div class="panel dm-tip" role="status" hidden></div><div class="panel dm-sel" hidden><b></b><span></span><button type="button" class="btn" data-act="drop">丢掉</button></div><div class="dm-hold" hidden><i></i></div><div class="panel dm-prompt" hidden></div><div class="panel dm-slots"></div>');
const dmClockEl = dmEl('div', 'dmClock', 'panel', '<b></b><span></span>'); dmClockEl.setAttribute('role', 'timer');
const dmLootEl = dmEl('div', 'dmLoot', 'panel', '<button type="button" class="x" aria-label="关闭">×</button><div class="dm-h"><b></b><span></span></div><div class="dm-items"></div>');
const dmPadEl = dmEl('div', 'dmPad', 'panel'); dmPadEl.setAttribute('role', 'dialog');
const dmEndEl = dmEl('div', 'dmEnd', 'panel'); dmEndEl.setAttribute('role', 'dialog');
const dmUi = {sel:-1, mode:'', lock:null, clue:null, input:'', back:'', msg:'', tip:'', vig:0, hold:-1, prompt:'', clock:''};
const dmEsc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const dmIc = it => DM_IC[it.id] || '📦';
const DM_TIERN = {n:'', r:'稀有', l:'传说'};

/* ---------- backpack strip ---------- */
function dmUiBag(){
  const run = DORM.run; if (!run) return;
  const clues = DORM.L.clues.filter(c => c.read).length;
  dmBagEl.querySelector('.dm-slots').innerHTML = run.bag.map((it, i) =>
    `<button type="button" class="dm-slot${i ? '' : ' pk'}${it ? ' t-' + it.tier : ''}${i === dmUi.sel ? ' on' : ''}" data-i="${i}" ${it ? `aria-label="${dmEsc(it.name)}"` : 'aria-label="空格子" disabled'}>${it ? `<i>${dmIc(it)}</i><em>${it.key ? '钥匙' : it.v}</em>` : i ? '' : '<small>口袋</small>'}</button>`).join('')
    + `<button type="button" class="dm-notes" data-notes>线索<em>${clues}</em></button>`;
  const sel = dmBagEl.querySelector('.dm-sel'), it = dmUi.sel >= 0 ? run.bag[dmUi.sel] : null;
  if (!it){ dmUi.sel = -1; sel.hidden = true; return; }
  sel.hidden = false; sel.querySelector('b').textContent = it.name;
  sel.querySelector('span').textContent = (it.key ? '开门用，用完就没了' : `RM ${it.v}${it.tok ? ` · 周边券 ×${it.tok}` : ''}${it.id === 'pot' ? ' · 带着它宿管看得更远' : ''}`) + (dmUi.sel === 0 ? ' · 在贴身口袋里，被抓也不丢' : '');
  sel.querySelector('[data-act="drop"]').textContent = DORM.lootBox ? '放回去' : '丢掉';
}
dmBagEl.addEventListener('click', e => {
  const s = e.target.closest('.dm-slot'), a = e.target.closest('[data-act]');
  if (e.target.closest('[data-notes]')){ ac(); dmUiNotes(); return; }
  if (s){ ac(); const i = +s.dataset.i; dmUi.sel = dmUi.sel === i ? -1 : i; dmUiBag(); return; }
  if (a && dmUi.sel >= 0){ ac(); const i = dmUi.sel; dmUi.sel = -1; dmDrop(i); dmUiBag(); }
});

/* ---------- what a container holds ---------- */
function dmUiLoot(box){
  DORM.lootBox = box && box.items.length ? box : null; document.body.classList.toggle('dm-loot', !!DORM.lootBox);
  if (!DORM.lootBox){ dmLootEl.hidden = true; if (DORM.run) dmUiBag(); return; }
  dmLootEl.hidden = false;
  dmLootEl.querySelector('.dm-h b').textContent = box.type === 'sack' ? DM_FUR.sack.name : (box.room ? box.room.num + ' ' : '') + DM_FUR[box.type].name;
  dmLootEl.querySelector('.dm-h span').textContent = TOUCH ? '点一下拿走' : '点一下拿走 · F 拿下一件';
  dmLootEl.querySelector('.dm-items').innerHTML = box.items.map((it, i) => !it.seen ? '<div class="dm-item q"><i>❔</i><b>翻找中…</b></div>' :
    `<button type="button" class="dm-item t-${it.tier}" data-i="${i}"><i>${dmIc(it)}</i><b>${dmEsc(it.name)}</b><em>${it.key ? '钥匙' : 'RM ' + it.v}</em>${it.tier !== 'n' ? `<u>${DM_TIERN[it.tier]}${it.tok ? ' · 券 ×' + it.tok : ''}</u>` : it.small ? '<u class="s">小件</u>' : ''}</button>`).join('')
    + (DORM.run && DORM.run.coach === 1 ? '<p class="dm-coach">② 点东西放进背包。只有 6 格，便宜的别拿；第一格是贴身口袋，自动装最值钱的小件，被抓也不丢</p>' : '');
  dmUiBag();
}
dmLootEl.addEventListener('click', e => {
  if (e.target.closest('.x')){ dmUiLoot(null); return; }
  const b = e.target.closest('.dm-item'); if (b && DORM.lootBox){ ac(); dmTake(DORM.lootBox, +b.dataset.i); }
});

/* ---------- keypad, clue reader, notebook: one panel, three faces ---------- */
function dmUiPadClose(){ dmUi.mode = ''; dmUi.lock = dmUi.clue = null; dmPadEl.hidden = true; document.body.classList.remove('dm-pad'); }
function dmUiNotesHtml(){
  const read = DORM.L.clues.filter(c => c.read);
  return read.length ? `<ul class="dm-nl">${read.map(c => `<li><button type="button" data-clue="${c.id}"><b>${dmEsc(c.title)}</b><span>再看一眼</span></button></li>`).join('')}</ul>`
    : '<p class="dm-none">还没找到线索。楼里蓝色菱形标着的便利贴、白板、手机，走过去看一眼。</p>';
}
function dmUiPadRender(){
  const m = dmUi.mode; let h = '<button type="button" class="x" data-x aria-label="关闭">×</button>';
  if (m === 'pad'){
    const k = dmUi.lock, cells = [0, 1, 2, 3].map(i => `<i class="${dmUi.input[i] ? 'f' : ''}">${dmUi.input[i] || ''}</i>`).join('');
    h += `<h2>${dmEsc(k.name)}</h2><p class="dm-sub">${dmUi.msg || '4 位密码'}</p><div class="dm-code${dmUi.msg && dmUi.bad ? ' bad' : ''}">${cells}</div>
      <div class="dm-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="del" aria-label="删一位">⌫</button><button type="button" data-k="0">0</button><button type="button" data-k="ok" class="ok">确定</button></div>
      <h3>线索本</h3>${dmUiNotesHtml()}`;
  } else if (m === 'clue'){
    h += `<h2>${dmEsc(dmUi.clue.title)}</h2><div class="dm-clue">${dmUi.clue.html}</div><div class="hrow">${dmUi.back ? '<button type="button" class="btn" data-back>返回</button>' : ''}<button type="button" class="btn primary" data-x>记住了</button></div>`;
  } else if (m === 'notes'){
    h += `<h2>线索本</h2>${dmUiNotesHtml()}<div class="hrow"><button type="button" class="btn primary" data-x>关掉</button></div>`;
  }
  dmPadEl.innerHTML = h; dmPadEl.hidden = !m; dmPadEl.dataset.mode = m; document.body.classList.toggle('dm-pad', !!m);
}
function dmUiPad(lock){ dmUi.mode = 'pad'; dmUi.lock = lock; dmUi.input = ''; dmUi.msg = ''; dmUi.bad = false; dmUi.back = ''; dmUiLoot(null); dmUiPadRender(); }
function dmUiClue(c, back){ dmUi.mode = 'clue'; dmUi.clue = c; dmUi.back = back || ''; dmUi.at = [nw.x, nw.z]; dmUiPadRender(); dmUiBag(); }
function dmUiNotes(){ if (dmUi.mode === 'notes'){ dmUiPadClose(); return; } dmUi.mode = 'notes'; dmUi.back = ''; dmUiPadRender(); }
function dmUiKey(k){
  const lock = dmUi.lock; if (dmUi.mode !== 'pad' || !lock) return;
  if (lock.cool > 0) return;
  if (k === 'del') dmUi.input = dmUi.input.slice(0, -1);
  else if (k === 'ok'){ if (dmUi.input.length < 4){ dmUi.msg = '要 4 位'; dmUi.bad = true; } else dmUiSubmit(); dmUiPadRender(); return; }
  else if (dmUi.input.length < 4){ dmUi.input += k; tone('triangle', 620 + (+k) * 40, 620 + (+k) * 40, .05, .06); }
  dmUi.msg = ''; dmUi.bad = false; dmUiPadRender();
  if (dmUi.input.length === 4) dmUiSubmit();
}
function dmUiSubmit(){
  const lock = dmUi.lock, what = lock.what;
  if (dmTryCode(lock, dmUi.input)){ dmUiPadClose(); if (what === 'box') { lock.ref.open = true; dmMarks(); dmUiLoot(lock.ref); } return; }
  dmUi.input = ''; dmUi.msg = '不对，键盘锁 2 秒'; dmUi.bad = true; dmUiPadRender();
}
dmPadEl.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-x]')){ dmUiPadClose(); return; }
  if (t.closest('[data-back]')){ dmUi.mode = dmUi.back; dmUi.back = ''; dmUiPadRender(); return; }
  const c = t.closest('[data-clue]'); if (c){ ac(); const back = dmUi.mode; dmUiClue(DORM.L.clues[+c.dataset.clue], back); return; }
  const k = t.closest('[data-k]'); if (k){ ac(); dmUiKey(k.dataset.k); }
});
/* typing a code on a keyboard; Esc closes whatever is open before the pause menu sees it */
window.addEventListener('keydown', e => {
  if ((!DORM.in && dmEndEl.hidden) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Escape' && (dmUi.mode || DORM.lootBox || !dmEndEl.hidden)){ e.preventDefault(); e.stopImmediatePropagation(); if (dmUi.mode) dmUiPadClose(); else if (DORM.lootBox) dmUiLoot(null); else dmEndEl.hidden = true; return; }
  if (dmUi.mode !== 'pad') return;
  const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (d){ e.preventDefault(); e.stopImmediatePropagation(); dmUiKey(d[1]); }
  else if (e.code === 'Backspace'){ e.preventDefault(); e.stopImmediatePropagation(); dmUiKey('del'); }
}, true);
/* things come out of a container one at a time: the good ones get a fanfare */
function dmReveal(it, box){
  if (it.tier === 'n'){ tone('triangle', 520, 620, .06, .07); return; }
  const leg = it.tier === 'l', col = leg ? '#e3b95a' : '#4a86d8';
  gxCallout(leg ? '传说！！' : '稀有！', it.name, col);
  for (let i = 0; i < (leg ? 5 : 3); i++) tone('triangle', (leg ? 784 : 660) * Math.pow(1.26, i), (leg ? 784 : 660) * Math.pow(1.26, i), .14, .12, i * .07);
  for (let i = 0; i < (leg ? 16 : 7); i++) spawnPart('heart', box.x + (Math.random() - .5) * 1.6, (box.h || .5) + .4 + Math.random(), box.z + (Math.random() - .5) * 1.6, leg ? .8 : .55, {vy:2 + Math.random() * 2, vx:(Math.random() - .5) * 2, vz:(Math.random() - .5) * 2, life:1.1, op:1, color:leg ? '#ffd24a' : '#7cc7ff'});
  if (leg) camShake = Math.max(camShake, .35);
}
function dmUiTick(dt){
  const run = DORM.run, lb = DORM.lootBox;
  if (lb){ const k = lb.items.findIndex(it => !it.seen); if (k >= 0){ lb.revT = (lb.revT || 0) + dt; if (lb.revT > .38){ lb.revT = 0; lb.items[k].seen = true; dmReveal(lb.items[k], lb); dmUiLoot(lb); } } }
  const p = DORM.need ? Math.min(1, DORM.hold / DORM.need) : 0, hp = Math.round(p * 50);
  if (hp !== dmUi.hold){ dmUi.hold = hp; const hb = dmBagEl.querySelector('.dm-hold'); hb.hidden = hp < 1; hb.firstChild.style.width = hp * 2 + '%'; }
  if (run.tip !== dmUi.tip){ dmUi.tip = run.tip; const el = dmBagEl.querySelector('.dm-tip'); el.textContent = run.tip; el.hidden = !run.tip; }
  if (dmPrompt !== dmUi.prompt){ dmUi.prompt = dmPrompt; const el = dmBagEl.querySelector('.dm-prompt'); el.textContent = dmPrompt; el.hidden = !dmPrompt; }
  /* the big clock: time left, and what the wall clock says */
  const left = Math.max(0, run.limit - run.t), ck = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
  if (ck !== dmUi.clock){ dmUi.clock = ck; dmClockEl.firstChild.textContent = ck; dmClockEl.lastChild.textContent = dmClock(run.t) + ' · 23:00 锁门'; dmClockEl.classList.toggle('warn', left < 70 && left >= 30); dmClockEl.classList.toggle('hot', left < 30); }
  const vg = Math.round(run.dg * 20) / 20; if (vg !== dmUi.vig){ dmUi.vig = vg; dmVigEl.hidden = vg < .1; dmVigEl.style.opacity = vg; dmVigEl.classList.toggle('hot', vg > .6); }
  if (dmUi.mode === 'pad'){
    const k = dmUi.lock;
    if (k.open || Math.hypot(nw.x - k.x, nw.z - k.z) > 4.2) dmUiPadClose();
    else if (dmUi.bad && k.cool <= 0 && dmUi.msg !== ''){ dmUi.msg = ''; dmUi.bad = false; dmUiPadRender(); }
  } else if (dmUi.mode === 'clue' && !dmUi.back && dmUi.at && Math.hypot(nw.x - dmUi.at[0], nw.z - dmUi.at[1]) > 7) dmUiPadClose();
}

/* ---------- result ---------- */
const dmTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const dmHasBoard = () => !!(window.XMini && XMini.board && XMini.board(DM_BOARD) && window.XUI && XUI.openLeaderboard);
/* the leaderboard line under the result: your best run, and where it stands once it is on the board. Offline it stays on this device */
let dmNetReq = 0;
function dmUiBoard(el){
  const N = window.XNet, best = Math.round(+prog.best.dorm || 0), req = ++dmNetReq, mine = best ? `你的单局最高 RM ${best}` : '带东西撤离一次就有成绩';
  if (!N || !N.online || !N.miniSubmit || !N.miniTop){ el.textContent = `${mine} · 联机未开启，成绩只保存在本机`; return; }
  if (!best){ el.textContent = mine; return; }
  el.textContent = `${mine} · 正在提交成绩…`;
  Promise.resolve(N.miniSubmit(DM_BOARD, best)).then(() => N.miniTop(DM_BOARD, 50)).then(rows => {
    if (req !== dmNetReq) return;
    rows = Array.isArray(rows) ? rows : [];
    const i = rows.findIndex(x => x.uid === N.uid);
    el.textContent = i >= 0 ? `排行榜第 ${i + 1} 名 · 单局最高 RM ${Math.round(rows[i].value)}` : rows.length >= 50 ? `${mine} · 还没进前 50 名` : `${mine} · 成绩已提交`;
  }).catch(() => { if (req === dmNetReq) el.textContent = `${mine} · 成绩没提交上去，下次再试`; });
}
function dmUiEnd(r){
  const li = it => `<li class="t-${it.tier}"><i>${dmIc(it)}</i><b>${dmEsc(it.name)}</b><em>RM ${it.v}</em></li>`;
  const stat = (k, v, sub) => `<div><span>${k}</span><b>${v}</b><em>${sub || '&nbsp;'}</em></div>`;
  const row = (k, v, cls) => `<li${cls ? ` class="${cls}"` : ''}><span>${k}</span><b>${v}</b></li>`;
  const top = r.top ? `${dmIc(r.top)} ${dmEsc(r.top.name)}` : '—', sum = [], notes = [];
  const stats = lost => `<div class="dm-stats">${stat(lost ? '最贵的（被没收）' : '最贵的', top, r.top ? 'RM ' + r.top.v : '')}${stat('用时', dmTime(r.time), r.ok ? `还剩 ${dmTime(r.left)}` : '')}${stat('钱包现在', 'RM ' + Math.round(money).toLocaleString(), r.income > 0 ? `这局 +${r.income}` : '')}</div>`;
  let h;
  if (r.ok){
    const how = {main:'从大门走出来', fire:'从消防梯冲下来', back:'从后门溜走'}[r.how], n = r.items.length;
    if (n) sum.push(row(`卖掉 ${n} 件东西`, 'RM ' + r.value));
    for (const b of r.bonus) sum.push(row(`${b.text} +${Math.round(b.pct * 100)}%`, '+RM ' + b.rm));
    if (n && r.how === 'main') notes.push(`走大门没有加成。消防梯多卖 ${dmPct('fire')}%，后门多卖 ${dmPct('back')}%`);
    if (r.behind > 0) notes.push(`这层楼还有值 RM ${r.behind} 的东西没带走`);
    if (r.tok) notes.push(`周边券 +${r.tok}（现在 ${prog.life.dormTok} 张，去衣橱换宿舍独家配件）`);
    if (r.rec) notes.push(r.prev != null ? `新纪录！上次最高 RM ${r.prev}` : '第一次带东西出来');
    h = `<div class="eyebrow">撤离成功 · ${how}</div><h2>${r.income > 0 ? `本局收入 <b>RM ${r.income}</b>` : '空手出来了'}</h2>${stats(false)}
      ${n ? `<ul class="dm-res">${r.items.map(li).join('')}</ul>` : '<p>什么都没带。下次按住 F 搜柜子、抽屉和床底。</p>'}`;
  } else {
    const head = {caught:['被宿管请出宿舍', '「这么晚了在别人寝室翻什么！」'], late:['23:00 · 锁门了', '门禁到了还没出来，被宿管登记晚归']}[r.why] || ['离开了宿舍', ''];
    if (r.kept && r.kept.v) sum.push(row(`贴身口袋里的${dmEsc(r.kept.name)}没被搜走，卖了`, 'RM ' + r.kept.v));
    if (head[1]) notes.push(head[1]);
    if (r.lost.length) notes.push(`${r.lost.length} 件东西被没收，一共值 RM ${r.lostValue}`);
    if (r.kept && r.kept.tok) notes.push(`口袋里的${dmEsc(r.kept.name)}还换到周边券 +${r.kept.tok}`);
    if (!r.kept) notes.push('贴身口袋（背包第一格）会自动装最值钱的小件，被抓也不丢。这次包里没有小件');
    h = `<div class="eyebrow">${head[0]}</div><h2>${r.income > 0 ? `本局收入 <b>RM ${r.income}</b>` : r.lost.length ? `${r.lost.length} 件东西被没收` : '还好背包是空的'}</h2>${stats(r.lost.length > 0)}
      ${r.lost.length ? `<ul class="dm-res lost">${r.lost.map(li).join('')}</ul>` : ''}`;
  }
  if (r.bounty) sum.push(row(`抓住偷外卖的小偷 ×${r.caught}，悬赏`, '+RM ' + r.bounty));
  if (sum.length) sum.push(row('本局收入', 'RM ' + r.income, 'tot'));
  if (r.solved) notes.push(`解开 ${r.solved} 个谜题`);
  h += `${sum.length ? `<ul class="dm-sum">${sum.join('')}</ul>` : ''}${notes.length ? `<p>${notes.join('<br>')}</p>` : ''}<p class="dm-net" role="status"></p>
    <div class="hrow"><button type="button" class="btn primary" data-again>再进去一次</button>${dmHasBoard() ? '<button type="button" class="btn" data-lb>排行榜</button>' : ''}${r.ok && prog.life.dormTok > 0 ? '<button type="button" class="btn" data-ward>去衣橱</button>' : ''}<button type="button" class="btn" data-x>知道了</button></div>`;
  dmEndEl.innerHTML = h; dmEndEl.hidden = false; dmEndEl.classList.toggle('fail', !r.ok); dmEndEl.scrollTop = 0;
  dmUiBoard(dmEndEl.querySelector('.dm-net'));
  const f = dmEndEl.querySelector('[data-x]'); if (f && !TOUCH) f.focus({preventScroll:true});
}
dmEndEl.addEventListener('click', e => {
  const t = e.target; if (!t.closest('button')) return; ac();
  if (t.closest('[data-lb]')){ XUI.openLeaderboard('mini:' + DM_BOARD); return; }   /* the result stays open underneath */
  dmEndEl.hidden = true; canvas.focus({preventScroll:true});
  if (t.closest('[data-again]')){ const why = dmBusyWhy(); if (mode !== 'naiwa' || driving || !DORM.door) return; if (why){ toast('现在进不去', why, 1800); return; } dmEnter(DORM.door); }
  else if (t.closest('[data-ward]') && window.XWard) XWard.open('naiwa');
});

function dmUiReset(){ dmUi.sel = -1; dmUi.tip = ''; dmUi.vig = 0; dmUi.hold = -1; dmUi.prompt = ''; dmUi.clock = ''; dmClockEl.hidden = false; dmBagEl.querySelector('.dm-prompt').hidden = true; dmVigEl.hidden = true; dmBagEl.querySelector('.dm-tip').hidden = true; dmUiPadClose(); dmLootEl.hidden = true; document.body.classList.remove('dm-loot'); dmEndEl.hidden = true; dmBagEl.hidden = false; dmUiBag(); }
function dmUiHide(all){ dmVigEl.hidden = true; dmClockEl.hidden = true; dmUiPadClose(); DORM.lootBox = null; document.body.classList.remove('dm-loot'); dmLootEl.hidden = true; dmBagEl.hidden = true; if (all) dmEndEl.hidden = true; }

/* ---------- 衣橱独家配件: bought with 周边券 from the dorm, not with RM ---------- */
const DM_WEAR = [
  {id:'dm_lanyard', slot:'neck', name:'门禁卡挂绳', desc:'刷卡进宿舍的那张卡', price:0, tier:'r', dorm:2, sw:'#3b82f6', build(k){
    const y = 1.43, r = nwR(y) + .032, blue = wdMat('#3b82f6', {roughness:.6}), g = new THREE.Group(); g.position.set(0, y - .02, nwLean(y) + .02); g.rotation.x = Math.PI / 2 - .25;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, .013, 6, 32), blue)); k.put(k.N.body, g);
    k.put(k.N.body, new THREE.Mesh(wdWrap({y0:1.2, y1:1.42, off:.046, th0:-.035, th1:.035, rows:6, cols:1}), blue));
    const c = wdAt(0, 1.13, .06); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.13, .17, .012), wdMat('#f6f6f2', {roughness:.4}), c.x, c.y, c.z, -.12));
    k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.13, .045, .014), wdMat('#b5442a', {roughness:.5}), c.x, c.y + .05, c.z + .002, -.12));
  }},
  {id:'dm_torch', slot:'hand', name:'查寝手电筒', desc:'宿管阿姨同款，照到谁谁站住', price:0, tier:'r', dorm:3, sw:'#2b2b2e', build(k){
    const g = new THREE.Group(), m = wdMat('#2b2b2e', {roughness:.4}); g.position.set(0, -.04, .06); g.rotation.x = .9;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .2, 12), m), wdMesh(new THREE.CylinderGeometry(.06, .036, .08, 14), m, 0, .14, 0),
      wdMesh(new THREE.CylinderGeometry(.052, .052, .01, 14), M('#fff3b0', {emissive:'#ffe27a', emissiveIntensity:1.4, roughness:.3}), 0, .182, 0));
    k.put(k.N.slots.handR, g);
  }},
  {id:'dm_rollers', slot:'head', name:'卷发筒', desc:'宿管阿姨查寝前来不及拆', price:0, tier:'r', dorm:4, sw:'#f08fb0', build(k){
    const pink = wdMat('#f08fb0', {roughness:.5}), hair = wdMat('#2a2420', {roughness:.7}), g = new THREE.Group(); g.position.set(0, -.07, 0);
    wdShell(k, hair, wdBrow(1.7, 1.6, 1.5), .02);
    const cyl = new THREE.CylinderGeometry(.045, .045, .15, 10); cyl.rotateZ(Math.PI / 2);
    for (const [x, y, z] of [[0, .07, .09], [-.11, .04, .02], [.11, .04, .02], [0, .09, -.03], [-.1, .03, -.12], [.1, .03, -.12]]) g.add(wdMesh(cyl, pink, x, y, z));
    k.put(k.N.slots.head, g);
  }},
  {id:'dm_foodbox', slot:'back', name:'外卖保温箱', desc:'偷外卖的小偷最怕看见这个', price:0, tier:'r', dorm:5, sw:'#e8552d', build(k){
    const p = wdAt(Math.PI, 1.05, .17), m = wdMat('#e8552d', {roughness:.6}), dark = wdMat('#2c2d31', {roughness:.6});
    k.put(k.N.body, wdMesh(roundBox(.42, .44, .3, .05), m, p.x, p.y, p.z));
    k.put(k.N.body, wdMesh(roundBox(.44, .07, .32, .03), dark, p.x, p.y + .2, p.z));
    k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.2, .12, .01), wdMat('#f6f3ea'), p.x, p.y, p.z - .152));
    for (const s of [-1, 1]) k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.95, y1:1.48, off:.02, th0:s * 1 - .05, th1:s * 1 + .05, rows:6, cols:1}), dark));
  }},
  {id:'dm_pajama', slot:'outfit', name:'条纹睡衣', desc:'穿着它在楼道里走，宿管以为你住这层（并不会）', price:0, tier:'r', dorm:7, sw:'repeating-linear-gradient(90deg,#8fb6e6 0 5px,#f4f6fa 5px 10px)', build(k){
    const tex = wdTex('dmPj', 128, 8, (g, w, h) => { for (let i = 0; i < 16; i++){ g.fillStyle = i % 2 ? '#f4f6fa' : '#8fb6e6'; g.fillRect(i * w / 16, 0, w / 16, h); } });
    const st = wdMat('#ffffff', {map:tex, roughness:.85}), plain = wdMat('#8fb6e6', {roughness:.85});
    wdSuit(k, {mat:st, y0:.5, sleeve:'long', sleeveMat:plain, legs:plain, legLen:.3});
    wdBand(k, 1.4, 1.5, .05, wdMat('#f4f6fa', {roughness:.85}));
    for (const y of [1.25, 1.08, .91]){ const p = wdAt(0, y, .05); k.put(k.N.body, wdMesh(new THREE.SphereGeometry(.02, 8, 6), wdMat('#f4f6fa'), p.x, p.y, p.z)); }
  }},
  {id:'dm_basin', slot:'head', name:'搪瓷脸盆', desc:'寝室传家宝，顶在头上挡过查寝的手电', price:0, tier:'l', dorm:10, sw:'radial-gradient(circle,#fbfbf7 0 55%,#c8302a 58%)', build(k){
    const white = wdMat('#fbfbf7', {roughness:.25}), red = wdMat('#c8302a', {roughness:.4}), g = new THREE.Group(); g.position.set(0, -.1, 0); g.rotation.x = -.08;
    g.add(wdMesh(new THREE.CylinderGeometry(.17, .28, .17, 26, 1, true), white, 0, .085, 0), wdMesh(new THREE.CylinderGeometry(.17, .17, .012, 26), white, 0, .17, 0),
      wdMesh(new THREE.TorusGeometry(.28, .017, 6, 30), red, 0, 0, 0, Math.PI / 2), wdMesh(new THREE.TorusGeometry(.1, .012, 6, 20), red, 0, .178, 0, Math.PI / 2));
    k.put(k.N.slots.head, g);
  }}
];
for (const it of DM_WEAR){ WD_ITEMS.push(it); WD.byId[it.id] = it; }
/* the wardrobe loaded its save before these six existed: read what was owned and worn again */
try {
  const d = JSON.parse(localStorage.getItem(WD_KEY) || 'null');
  if (d){
    (d.own || []).forEach(id => { if (WD.byId[id] && WD.byId[id].dorm) wardSave.own.add(id); });
    const l = wdLook(d.look); let ch = false;
    for (const s in l) if (l[s] && WD.byId[l[s]].dorm && wardSave.own.has(l[s]) && wardSave.look[s] !== l[s]){ wardSave.look[s] = l[s]; ch = true; }
    if (ch) nwDress(NW, wardSave.look);
  }
} catch(e){}
const dmWearLocked = it => it && it.dorm && !wardSave.own.has(it.id);
{
  const render = wardRender, foot = wardFoot, buy = wardBuy;
  wardRender = function(){
    render();
    for (const b of document.querySelectorAll('#wardList .wd-it')){ const it = WD.byId[b.dataset.id]; if (dmWearLocked(it)){ const em = b.querySelector('em'); if (em) em.textContent = `周边券 ×${it.dorm}`; } }
  };
  wardFoot = function(){
    foot();
    const it = ward.sel ? WD.byId[ward.sel] : null; if (!dmWearLocked(it)) return;
    const b = $('#wardBuy'), have = prog.life.dormTok; b.hidden = false;
    $('#wardDesc').textContent = it.desc + ' · 宿舍独家，用周边券换';
    if (have >= it.dorm){ b.disabled = false; b.className = 'btn buy'; b.textContent = `用 ${it.dorm} 张周边券换（有 ${have} 张）`; }
    else { b.disabled = true; b.className = 'btn'; b.textContent = `周边券 ${have} / ${it.dorm} · 去 LY 宿舍搜限量周边`; }
  };
  wardBuy = function(){
    const it = ward.sel ? WD.byId[ward.sel] : null; if (!dmWearLocked(it)) return buy();
    if (prog.life.dormTok < it.dorm) return;
    prog.life.dormTok -= it.dorm; wardSave.own.add(it.id); saveGame(); sfx.sparkle();
    toast('换到了：' + it.name, `还剩 ${prog.life.dormTok} 张周边券`, 2200);
    wardEquip(ward.tab, it.id); wardRender();
  };
}
