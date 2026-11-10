/* XMUM 校园漫游 · 标题页、昵称、排行榜、玩法说明、声音开关
   对外：window.XUI = { playerName(), openLeaderboard(board), openTitle(), closeTitle(mode) } */
'use strict';
function uiGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function uiSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

/* ---------- nickname ---------- */
const UI_NAMES = ['LY 早八人', 'D6 干饭王', 'A3 迷路人', '湖边喂鱼人', '期末周幸存者', '图书馆占座侠', '田径场夜跑人',
  '南门等车人', '奶茶续命人', 'DDL 战士', 'B1 社团人', '宿舍断网人', '雪邦晒黑人', '小组作业背锅侠', '食堂排队王'];
const uiNameIn = $('#tName');
/* 随机昵称带两位编号：昵称是先到先得的（js/net.js），不带编号大家会抢同一个名字 */
function uiRandomName(not){ let n; do { n = UI_NAMES[(Math.random() * UI_NAMES.length) | 0] + ' ' + (10 + ((Math.random() * 90) | 0)); if (n.length > 12) n = n.replace(' ', ''); } while (n === not); return n; }
/* 只留中文、字母、数字、空格和 _ - · ~ ! ?：和 database.rules.json 里 /names 的校验一致，也防止用全角字母、零宽字符冒充别人 */
function uiClean(v){ return String(v || '').replace(/[^0-9A-Za-z一-龥 _·~!?-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim(); }
let uiName = uiClean(uiGet('xmum-name'));
if (!uiName){ uiName = uiRandomName(); uiSet('xmum-name', uiName); }
uiNameIn.value = uiName;
const uiHint = $('#tNameHint');
function uiSetHint(t, tone){ if (!uiHint) return; uiHint.textContent = t || ''; uiHint.dataset.tone = tone || ''; uiHint.hidden = !t; }
function uiSaveName(){
  const raw = uiNameIn.value, v = uiClean(raw);
  if (v && v !== raw.replace(/\s+/g, ' ').trim().slice(0, 12)) uiSetHint('名字只能用中文、字母、数字、空格和 _ - · ~ ! ?，其他字符去掉了', 'warn');
  if (v){ const changed = v !== uiName; uiName = v; uiNameIn.value = v; uiSet('xmum-name', v); if (changed) try { window.dispatchEvent(new Event('xmum-name')); } catch(e){} }
  else uiNameIn.value = uiName;
}
uiNameIn.addEventListener('change', uiSaveName);
uiNameIn.addEventListener('blur', uiSaveName);
uiNameIn.addEventListener('keydown', e => { if (e.key === 'Enter'){ uiSaveName(); uiNameIn.blur(); } });
$('#tDice').addEventListener('click', () => { uiNameIn.value = uiRandomName(uiName); uiSaveName(); });

/* ---------- sound toggle (soundOn / ac() live in 20-fx.js) ---------- */
const uiSoundBtn = $('#tSound');
function uiSyncSound(){ uiSoundBtn.setAttribute('aria-pressed', String(soundOn)); uiSoundBtn.querySelector('span').textContent = soundOn ? '声音开' : '声音关'; }
if (uiGet('xmum-sound') === '0') soundOn = false;
uiSyncSound();
uiSoundBtn.addEventListener('click', () => {
  soundOn = !soundOn; uiSet('xmum-sound', soundOn ? '1' : '0'); uiSyncSound();
  if (soundOn){ ac(); sfx.ding(); }
});

/* ---------- quality picker (tiers live in js/quality.js) ---------- */
const uiGfxHint = $('#tGfxHint');
const UI_GFX_TIP = {low:'最省电最顺，关掉阴影和特效，手机卡的话选这个', mid:'有阴影和水面波纹，适合大多数手机', high:'柔和阴影、泛光、树叶摆动，适合电脑和新手机'};
document.querySelectorAll('[data-gfx]').forEach(b => b.addEventListener('click', () => {
  const aaWas = XQ.aa; XQ.set(b.dataset.gfx);
  if (XQ.cfg.aa !== aaWas) uiGfxHint.textContent = UI_GFX_TIP[XQ.level] + '（边缘平滑下次打开生效）';
}));
XQ.onChange(() => {
  document.querySelectorAll('[data-gfx]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gfx === XQ.level)));
  uiGfxHint.textContent = UI_GFX_TIP[XQ.level] + (XQ.manual ? '' : ' · 自动选的');
  document.querySelectorAll('[data-gfx]').forEach(b => { b.title = UI_GFX_TIP[b.dataset.gfx]; });
});

/* ---------- title screen ---------- */
const titleEl = $('#title');
let titleOpen = true, titleTimer = 0;
function openTitle(){
  if (mode !== 'orbit') setMode('orbit');
  card.hidden = true; cardInfo = null;
  controls.autoRotate = !REDUCED;
  clearTimeout(titleTimer); titleEl.classList.remove('leaving'); titleEl.hidden = false;
  document.body.classList.add('titled'); canvas.tabIndex = -1; titleOpen = true;
  const first = titleEl.querySelector('.t-card'); if (first) first.focus({preventScroll:true});
}
function closeTitle(next){
  if (!titleOpen) return;
  uiSaveName(); titleOpen = false; ac();
  document.body.classList.remove('titled'); canvas.tabIndex = 0;
  if (REDUCED) titleEl.hidden = true;
  else { titleEl.classList.add('leaving'); titleTimer = setTimeout(() => { titleEl.hidden = true; titleEl.classList.remove('leaving'); }, 320); }
  if (next && next !== mode) setMode(next);
  else { controls.autoRotate = !REDUCED; canvas.focus({preventScroll:true}); }
}
titleEl.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => closeTitle(b.dataset.go)));
$('#menuBtn').addEventListener('click', openTitle);
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !titleOpen || document.querySelector('dialog[open]')) return;
  if (e.target === uiNameIn){ uiNameIn.blur(); return; }
  closeTitle('orbit');
});
controls.autoRotate = !REDUCED; canvas.tabIndex = -1;

/* ---------- dialogs ---------- */
let uiReturnFocus = null;
function uiOpenDialog(d){
  if (d.open) return;
  uiReturnFocus = document.activeElement;
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}
function uiCloseDialog(d){ if (d.close) d.close(); else d.removeAttribute('open'); }
document.querySelectorAll('dialog').forEach(d => {
  d.addEventListener('close', () => { if (uiReturnFocus && uiReturnFocus.focus) uiReturnFocus.focus({preventScroll:true}); uiReturnFocus = null; });
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) uiCloseDialog(d); });
});
$('#tHow').addEventListener('click', () => uiOpenDialog($('#howto')));

/* ---------- leaderboard ---------- */
function uiGta(){ try { return JSON.parse(uiGet('xmum-gta-v1') || 'null') || {}; } catch(e){ return {}; } }
const UI_BOARDS = {
  hole2: {fmt:v => (+v || 0).toFixed(1) + '%', what:'黑洞 2.0（有道具和连吞）一局吞掉校园的最高比例', local:() => +uiGet('xmum-hole2-best') || 0, empty:'还没玩过黑洞 2.0，去吞一局'},
  hole:  {fmt:v => (+v || 0).toFixed(1) + '%', what:'旧版黑洞的成绩，已停止更新，留作纪念', local:() => +uiGet('xmum-hole-best') || 0, empty:'没有旧版黑洞的成绩'},
  stunt: {fmt:v => Math.round(+v || 0).toLocaleString() + ' 分', what:'奶娃累计特技分', local:() => +uiGta().stunt || 0, empty:'还没攒到特技分，去漂移一下'},
  rich:  {fmt:v => 'RM ' + (+v || 0).toFixed(2), what:'奶娃钱包', local:() => +uiGta().money || 0, empty:'钱包空空，去送外卖'}
};
/* 小游戏榜（B1 游戏厅，js/91-arcade.js）：board 写成 'mini:<gameId>'，定义来自 XMini.board(id)；'mini' 表示上次看的那个小游戏 */
let lbMini = '';
function uiBoardDef(board){
  if (UI_BOARDS[board]) return UI_BOARDS[board];
  const m = /^mini:([a-z][a-z0-9_]{1,15})$/.exec(board || '');
  return (m && window.XMini && XMini.board(m[1])) || null;
}
function uiMiniBoards(){ return window.XMini ? (XMini.boards || XMini.games.filter(g => g.board).map(g => g.id)).map(id => 'mini:' + id) : []; }
const lbEl = $('#lb'), lbBody = $('#lbBody'), lbTabs = [...lbEl.querySelectorAll('[role="tab"]')];
let lbBoard = 'hole2', lbReq = 0;
function uiEl(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function uiLocalCard(board){
  const B = uiBoardDef(board), v = B.local(), box = uiEl('div', 'lb-local');
  box.append(uiEl('span', 'lb-k', '本机最好 · ' + uiName));
  box.append(v > 0 ? uiEl('b', 'lb-v', B.fmt(v)) : uiEl('span', 'lb-none', B.empty));
  return box;
}
function uiDate(ts){
  const t = +ts; if (!t) return '';
  const d = new Date(t < 1e12 ? t * 1000 : t); if (isNaN(d)) return '';
  return (d.getMonth() + 1) + '/' + d.getDate();
}
function renderBoard(board){
  if (board === 'mini') board = uiBoardDef(lbMini) ? lbMini : uiMiniBoards()[0] || 'mini';
  const mini = /^mini/.test(board), tab = mini ? 'mini' : board;
  lbBoard = board; const B = uiBoardDef(board), req = ++lbReq;
  lbTabs.forEach(t => { const on = t.dataset.board === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  lbBody.setAttribute('aria-labelledby', 'lbt-' + tab);
  lbBody.textContent = '';
  if (mini){
    const all = uiMiniBoards();
    if (!B){ lbBody.append(uiEl('p', 'lb-what', '还没有带排行榜的小游戏')); return; }
    lbMini = board;
    if (all.length > 1){
      const chips = uiEl('div', 'lb-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', '选一个小游戏');
      for (const id of all){
        const d = uiBoardDef(id), c = uiEl('button', 'lb-chip', d.icon + ' ' + d.name); c.type = 'button'; c.setAttribute('aria-pressed', String(id === board));
        c.addEventListener('click', () => renderBoard(id)); chips.append(c);
      }
      lbBody.append(chips);
    }
  }
  lbBody.append(uiEl('p', 'lb-what', B.what));
  const net = window.XNet;
  if (!net || !net.online || typeof net.top !== 'function'){
    const off = uiEl('div', 'lb-off'); off.append(uiEl('b', null, '联机未开启，成绩只保存在本机'));
    lbBody.append(off, uiLocalCard(board)); return;
  }
  const list = uiEl('ol', 'lb-list'); list.append(uiEl('li', 'lb-wait', '读取中…'));
  lbBody.append(list);
  Promise.race([B.top ? B.top(20) : net.top(board, 20), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 8000))]).then(rows => {
    if (req !== lbReq) return;
    list.textContent = '';
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length){ list.append(uiEl('li', 'lb-wait', '还没人上榜，去当第一个')); }
    rows.forEach((r, i) => {
      const li = uiEl('li', uiClean(r && r.name) === uiName ? 'me' : '');
      li.append(uiEl('span', 'lb-n', String(i + 1)), uiEl('span', 'lb-name', uiClean(r && r.name) || '匿名'),
        uiEl('span', 'lb-d', uiDate(r && r.ts)), uiEl('b', 'lb-v', B.fmt(r && r.value)));
      list.append(li);
    });
    lbBody.append(uiLocalCard(board));
  }).catch(() => {
    if (req !== lbReq) return;
    list.textContent = ''; list.append(uiEl('li', 'lb-wait', '排行榜读取失败，稍后再试'));
    lbBody.append(uiLocalCard(board));
  });
}
lbTabs.forEach((t, i) => {
  t.addEventListener('click', () => renderBoard(t.dataset.board));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = lbTabs[(i + d + lbTabs.length) % lbTabs.length]; n.focus(); renderBoard(n.dataset.board);
  });
});
function openLeaderboard(board){
  renderBoard(uiBoardDef(board) || board === 'mini' ? board : lbBoard);
  uiOpenDialog(lbEl);
  const sel = lbTabs.find(t => t.dataset.board === (/^mini/.test(lbBoard) ? 'mini' : lbBoard)); if (sel) sel.focus({preventScroll:true});
}
$('#tLb').addEventListener('click', () => openLeaderboard('hole2'));
$('#hlb').addEventListener('click', () => openLeaderboard('hole2'));

/* ---------- 账号：可选的 Google 登录（换设备也能保留进度） ---------- */
const acctEl = $('#tAcct'), acctText = $('#tAcctText'), acctBtn = $('#tGoogle'), acctBtnText = acctBtn && acctBtn.querySelector('span');
const UI_EMBEDDED = /MicroMessenger|QQ\/|Weibo|FBAN|FBAV|Instagram|Line\/|DingTalk|AlipayClient|XiaoHongShu|aweme|Bytedance/i.test(navigator.userAgent);
let acctBusy = false;
function uiSyncAcct(){
  const N = window.XNet;
  if (!acctEl || !acctBtn) return;                     /* page without the account row */
  if (!N || !N.online || !N.account){ acctEl.hidden = true; return; }
  acctEl.hidden = false; acctBtn.hidden = false; acctBtn.disabled = acctBusy;
  if (N.account.google){
    acctEl.classList.add('on');
    acctText.textContent = '已用 Google 登录' + (N.account.email ? '：' + N.account.email : '') + '，进度会存到云端';
    acctBtnText.textContent = '退出'; acctBtn.dataset.act = 'out';
  } else if (UI_EMBEDDED){
    acctEl.classList.remove('on');
    acctText.textContent = '想换手机也保留进度？微信等 App 里不能用 Google 登录，点右上角「···」选「在浏览器打开」。';
    acctBtn.hidden = true;
  } else {
    acctEl.classList.remove('on');
    acctText.textContent = '游客身份，进度只存在这台设备';
    acctBtnText.textContent = '用 Google 登录'; acctBtn.dataset.act = 'in';
  }
}
function uiLoginError(e){
  const c = String(e && e.code || '');
  if (/popup-closed|cancelled-popup/.test(c)) return '登录已取消';
  if (/popup-blocked/.test(c)) return '浏览器拦截了登录弹窗，请允许弹窗后再点一次';
  if (/unauthorized-domain/.test(c)) return '这个网址没有加到 Firebase 授权网域';
  if (/operation-not-allowed/.test(c)) return 'Firebase 里还没开启 Google 登录';
  if (/network/.test(c)) return '连不上 Google，检查网络后再试';
  if (/web-storage|disallowed-useragent|operation-not-supported/.test(c)) return '这个浏览器不支持 Google 登录，换 Chrome 或 Safari 试试';
  return '登录没成功：' + (e && e.message || c || '未知原因');
}
window.addEventListener('xnet', uiSyncAcct);
if (acctBtn) acctBtn.addEventListener('click', async () => {
  const N = window.XNet; if (!N || acctBusy) return;
  acctBusy = true; uiSyncAcct(); let err = null;
  try { if (acctBtn.dataset.act === 'out') await N.signOut(); else await N.signInGoogle(); }
  catch(e){ err = e; }
  acctBusy = false; uiSyncAcct();
  if (err) acctText.textContent = uiLoginError(err);
});

window.XUI = {
  playerName: () => uiName,
  setName: n => { const v = uiClean(n); if (v && v !== uiName){ uiName = v; uiNameIn.value = v; uiSet('xmum-name', v); } },
  setNameHint: uiSetHint,
  openLeaderboard,
  openTitle,
  closeTitle
};
