/* XMUM 校园漫游 · 好友
 *
 * 只在联机时出现（XNet.online，数据库规则也发布了）；离线、预览版整套隐藏。本地测试见 docs/friends.md（test/social.html 两个窗口互测，?bots&friends 本地假好友）。
 *
 *   加好友：走到别的玩家旁边按 F（手机点他头上的按钮），菜单里选「⭐ 加好友」，对方收到邀请卡（接 / 不接），接了两边都记下。
 *   好友列表：Y，或「⭐ 好友」按钮（电脑在顶上「在线 N 人」旁边，手机在「车行」「暂停」那一排），或暂停面板里的「好友」。在线 / 离线、最后上线时间、大概在哪、开着什么车；「导航过去」；「解除」。
 *   大地图（M）：在线的好友是粉色星星，点一下弹小卡片，可以「导航过去」。导航时指南针和小地图指着他，走到 15 米内自动结束。
 *   上线提醒：好友上线时弹一条小提示（同一个好友 10 分钟最多一次，几个人一起上线合成一条），列表底下可以关掉。
 *
 * 数据（规则见 database.rules.json，说明见 docs/friends.md）：
 *   /friends/{我}/{好友} = {n 名字, t 加好友的时间}   只有自己能读写自己的列表；只有对方也在列表里、或者对方刚向我发过请求时才能加进去
 *   /freq/{收件人}/{发件人} = {t}                    好友请求的凭证：发请求的人写，接受的一方凭它把对方加进自己的列表，用完删掉
 *   /fst/{我} = {n, t, p:"x,z"（10 米取整）, k 车型}  给好友看的状态：只有把我加为好友的人（我列表里的人）能读。
 *                    挪了 60 米或换车才写（至少隔 30 秒），5 分钟一次心跳；没有好友时不写。断线时服务器把 t 改成断线的时间（最后上线）
 *   在不在线看 /on/{好友}（js/net.js 进游戏时写、下线删掉；本来就在听整个 /on 的话不多花流量）
 *   流量：好友的 /fst 只在好友列表、大地图开着（或正在导航去找他）时才订阅，关了 8 秒后退订
 *
 * 对外：window.XFriends（见文件末尾）。这个文件要排在 js/96-social.js 后面加载。
 */
'use strict';
(() => {
  if (!window.XNet || !window.XSocial) return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  const pnow = () => performance.now() / 1000;
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;

  const CAP = 50;                                   // 好友上限
  const REQ_GAP = 60, REQ_MAX = 6, REQ_WIN = 600;   // 同一个人 60 秒一次请求；10 分钟最多 6 次
  const ST_MOVE = 60, ST_GAP = 30, ST_BEAT = 300;   // /fst：挪了 60 米或换车才写，至少隔 30 秒；5 分钟心跳
  const NOTE_ONE = 600, NOTE_GAP = 20;              // 上线提醒：同一个好友 10 分钟一次，两条提醒至少隔 20 秒
  const ARRIVE = 15;                                // 导航：走到 15 米内算找到了
  const COL = '#ff6fa3';                            // 地图上好友的颜色

  /* ---------- 本机设置 ---------- */
  const KEY = 'xmum-friends-v1';
  const store = (() => { let v = null; try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){} return Object.assign({note:true}, v || {}); })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch(e){} };

  /* ---------- 状态 ---------- */
  const F = {
    on:false, denied:false,
    list:new Map(),        // uid -> {n, t}：我的好友（/friends/{我}）
    onl:new Set(),         // 现在在线的好友（/on/{uid} 存在）
    offAt:new Map(),       // uid -> 本机看到他下线的时间（ms）
    onRefs:new Map(),      // uid -> {ref, cb, first}
    st:new Map(),          // uid -> {n, t, p:[x, z] | null, k}：好友的 /fst
    stRefs:new Map(),      // uid -> {ref, cb, idle, dead}
    nav:null,              // 正在导航去找谁：{uid, name, t0, lost}
    reqLog:[], reqAt:{},
    myRef:null, connRef:null, wrote:null, wroteAt:-1e9,
    noteQ:[], noteAt:-1e9, noteOne:{},
    panel:false, mapSeen:-1e9, dirty:true, confirm:null, hits:[]
  };
  const isFriend = uid => F.list.has(uid);
  const blocked = uid => !!g(() => XSocial.blocked(uid), false);
  function myName(){
    let n = g(() => XNet.claimedName(), '') || g(() => XUI.playerName(), '') || g(() => localStorage.getItem('xmum-name'), '') || '玩家';
    n = String(n).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
    return [...n].slice(0, 16).join('').slice(0, 16) || '玩家';
  }
  const nameOf = uid => { const s = F.st.get(uid), e = F.list.get(uid); return String((s && s.n) || (e && e.n) || '?').slice(0, 16); };
  g(() => { XSocial.why.ffull = '对方的好友已经满了'; });

  /* ---------- 地点：用大地图和送外卖已经在用的地名 ---------- */
  let PLACES = null;
  /* building labels as they are when this file loads (players' and NPCs' name tags come later or move: those are left out below) */
  const LBL0 = (typeof labels !== 'undefined' ? labels : []).filter(L => L.el && L.el.className === 'lbl' && !L.minor).map(L => ({L, x:L.pos.x, z:L.pos.z}));
  function places(){
    if (PLACES) return PLACES;
    PLACES = [];
    const seen = new Set();
    for (const d of (typeof DESTS !== 'undefined' ? DESTS : [])) if (d && d.name && !seen.has(d.name)){ seen.add(d.name); PLACES.push({name:String(d.name).replace(/（.*?）/g, ''), x:d.x, z:d.z, w:1}); }
    /* building names the 3D view and the big map show (js/00-core.js addLabel), the big ones only */
    for (const {L, x, z} of LBL0){
      if (L.dead || L.pos.x !== x || L.pos.z !== z) continue;
      const t = (L.el.textContent || '').trim(); if (!t || t.length > 14 || seen.has(t)) continue;
      seen.add(t); PLACES.push({name:t, x:L.pos.x, z:L.pos.z, w:1.25});
    }
    return PLACES;
  }
  function areaName(x, z){
    let best = null, bd = 1e9;
    for (const P of places()){ const d = Math.hypot(P.x - x, P.z - z) * P.w; if (d < bd){ bd = d; best = P; } }
    if (best && bd < 45) return '在 ' + best.name;
    if (best && bd < 170) return best.name + ' 附近';
    const inCampus = typeof opIn === 'function' && typeof CAMPUS_R !== 'undefined' ? g(() => opIn(x, z, CAMPUS_R), Math.hypot(x, z) < 450) : Math.hypot(x, z) < 450;
    return inCampus ? '在校园里' : '在校外';
  }
  const carName = k => (k && typeof CAR_T !== 'undefined' && CAR_T[k] ? CAR_T[k].name : '');
  function ago(ms){
    if (!(ms > 0)) return '';
    const s = Math.max(0, (XNet.now() - ms) / 1000);
    if (s < 90) return '刚刚';
    if (s < 3600) return Math.round(s / 60) + ' 分钟前';
    if (s < 86400 * 2) return Math.round(s / 3600) + ' 小时前';
    if (s < 86400 * 60) return Math.round(s / 86400) + ' 天前';
    return '很久以前';
  }
  /* where a friend is now: the live ghost when he is in our grid cells (js/net.js), else his /fst */
  function friendPos(uid){
    const L = g(() => XNet.peer(uid), null);
    if (L && L.fresh) return {x:L.x, z:L.z, live:true, car:L.car};
    const s = F.st.get(uid);
    return s && s.p ? {x:s.p[0], z:s.p[1], live:false, car:!!s.k} : null;
  }
  function mePos(){
    if (mode === 'walk') return {x:player.x, z:player.z};
    if (mode === 'naiwa') return driving ? {x:driving.x, z:driving.z} : {x:nw.x, z:nw.z};
    return null;
  }

  /* ---------- 我的列表：/friends/{我}（一直听着，很小，只有加减好友时才变） ---------- */
  function openList(){
    if (F.myRef) return;
    F.myRef = XNet.ref('friends/' + XNet.uid); if (!F.myRef) return;
    F.myRef.on('value', snap => {
      const v = snap.val(), m = new Map();
      if (v && typeof v === 'object') for (const k in v){ const e = v[k]; if (UID_RE.test(k) && k !== XNet.uid && e && typeof e === 'object') m.set(k, {n:String(e.n || '?').slice(0, 16), t:+e.t || 0}); }
      const had = F.list.size;
      F.list = m;
      if (F.nav && !m.has(F.nav.uid)) F.nav = null;
      syncOnRefs(); F.dirty = true; renderBtn();
      if (!had && m.size){ F.wrote = null; F.wroteAt = -1e9; }        // 第一个好友：马上写一次自己的状态
    }, e => {
      console.warn('[XFriends] 好友列表读不了（规则还没发布？），好友功能先关掉', e && e.code);
      F.denied = true; F.myRef = null; setOn(false);
    });
  }
  /* online or not: /on/{uid}, one tiny listener per friend */
  function syncOnRefs(){
    for (const [uid, R] of F.onRefs) if (!F.list.has(uid)){ g(() => R.ref.off('value', R.cb)); F.onRefs.delete(uid); F.onl.delete(uid); }
    for (const uid of F.list.keys()){
      if (F.onRefs.has(uid)) continue;
      const ref = XNet.ref('on/' + uid); if (!ref) continue;
      const R = {ref, first:true};
      R.cb = ref.on('value', s => {
        const on = s.exists(), was = F.onl.has(uid), first = R.first; R.first = false;
        if (on === was) return;
        if (on) F.onl.add(uid); else { F.onl.delete(uid); F.offAt.set(uid, XNet.now()); }
        F.dirty = true; renderBtn();
        if (on && !first) noteOnline(uid);
      }, () => {});
      F.onRefs.set(uid, R);
    }
  }

  /* ---------- 上线提醒 ---------- */
  function noteOnline(uid){
    if (!store.note || blocked(uid)) return;
    const t = pnow(); if (t - (F.noteOne[uid] || -1e9) < NOTE_ONE) return;
    F.noteOne[uid] = t;
    if (!F.noteQ.includes(uid)) F.noteQ.push(uid);
  }
  function flushNotes(){
    if (!F.noteQ.length || pnow() - F.noteAt < NOTE_GAP) return;
    if (document.body.classList.contains('titled') || !!g(() => XMini.inside, false) || g(() => XGuide.on, false)) return;
    const q = F.noteQ.splice(0).filter(u => F.onl.has(u)); if (!q.length) return;
    F.noteAt = pnow();
    const a = nameOf(q[0]);
    toast(q.length > 1 ? `⭐ ${a} 和另外 ${q.length - 1} 位好友上线了` : `⭐ 好友 ${a} 上线了`, TOUCH ? '点「⭐ 好友」看在哪' : '按 Y 看好友在哪', 2600);
    tone('triangle', 880, 1320, .09, .05);
  }

  /* ---------- 好友的状态 /fst/{uid}：只在列表、地图开着或导航时订阅 ---------- */
  function wantSt(){
    const t = performance.now(), all = F.panel || t - F.mapSeen < 1500;
    const s = new Set();
    if (all) for (const uid of F.list.keys()) s.add(uid);
    if (F.nav) s.add(F.nav.uid);
    return s;
  }
  function syncSt(){
    const want = wantSt(), t = pnow();
    for (const [uid, R] of F.stRefs){
      if (R.dead){ if (!want.has(uid) || t - R.dead > 30) F.stRefs.delete(uid); continue; }
      if (want.has(uid)){ R.idle = 0; continue; }
      if (!R.idle) R.idle = t; else if (t - R.idle > 8){ g(() => R.ref.off('value', R.cb)); F.stRefs.delete(uid); }
    }
    for (const uid of want){
      if (F.stRefs.has(uid)) continue;
      const ref = XNet.ref('fst/' + uid); if (!ref) continue;
      const R = {ref, idle:0, dead:0};
      R.cb = ref.on('value', s => {
        const v = s.val();
        if (!v || typeof v !== 'object'){ F.st.delete(uid); F.dirty = true; return; }
        const m = /^(-?\d{1,5}),(-?\d{1,5})$/.exec(typeof v.p === 'string' ? v.p : '');
        F.st.set(uid, {n:typeof v.n === 'string' ? v.n.slice(0, 16) : '', t:+v.t || 0, p:m ? [+m[1], +m[2]] : null, k:typeof v.k === 'string' ? v.k : ''});
        F.dirty = true;
      }, () => {
        /* 读不了：对方的列表里已经没有我了（解除了好友）。刚加的几分钟里对方那边可能还没写完，先不管 */
        R.dead = pnow(); F.st.delete(uid);
        const e = F.list.get(uid);
        if (e && XNet.now() - e.t > 180000) dropFriend(uid, true);
      });
      F.stRefs.set(uid, R);
    }
  }
  function dropSt(){ for (const R of F.stRefs.values()) if (!R.dead) g(() => R.ref.off('value', R.cb)); F.stRefs.clear(); F.st.clear(); }

  /* ---------- 我的状态 /fst/{我}：有好友时才写，挪远了、换车了才写 ---------- */
  function writeMine(){
    if (!F.list.size || XNet.sleeping || document.body.classList.contains('titled')) return;
    const ref = XNet.ref('fst/' + XNet.uid); if (!ref) return;
    const t = pnow(), W = F.wrote;
    if (W && t - F.wroteAt < ST_GAP) return;
    const P = mePos(), inside = !!g(() => indoorNow(), false);
    const p = P && !inside ? [Math.round(P.x / 10) * 10, Math.round(P.z / 10) * 10] : (W && W.p) || null;
    const k = mode === 'naiwa' && driving && /^[a-z0-9]{1,12}$/.test(driving.kind || '') ? driving.kind : '';
    const n = myName();
    const moved = !W || (p && (!W.p || Math.hypot(p[0] - W.p[0], p[1] - W.p[1]) >= ST_MOVE));
    if (!(moved || !W || W.k !== k || W.n !== n || t - F.wroteAt > ST_BEAT)) return;
    const o = {n, t:TS(), k:k || null}; if (p) o.p = p.join(',');
    F.wrote = {p, k, n}; F.wroteAt = t;
    ref.update(o).then(() => { if (!F.discOk) armDisc(); }, e => { if (!F.warned){ F.warned = true; console.warn('[XFriends] 写不了 /fst', e && e.code); } });
  }
  /* 断线时服务器把 t 改成断线的时刻，好友看到的「最后上线」就准了；每次连上都要重新挂一次 */
  function armDisc(){
    const ref = XNet.ref('fst/' + XNet.uid); if (!ref || !F.list.size) return;
    ref.onDisconnect().update({t:TS()}).then(() => { F.discOk = true; }, () => {});
  }
  function watchConn(){
    if (F.connRef) return;
    F.connRef = XNet.ref('.info/connected'); if (!F.connRef) return;
    F.connCb = F.connRef.on('value', s => { if (s.val() === true){ F.discOk = false; if (F.wrote) armDisc(); } else F.discOk = false; });
  }

  /* ---------- 加好友：发请求、对方的邀请卡、两边记下 ---------- */
  function canAsk(p){
    if (!F.on) return '好友功能还没连上';
    if (isFriend(p.uid)) return '已经是好友了';
    if (F.list.size >= CAP) return `好友满了（最多 ${CAP} 个）`;
    if (blocked(p.uid)) return '你屏蔽了对方';
    const t = pnow();
    if ((F.reqAt[p.uid] || -1e9) > t - REQ_GAP) return `${Math.ceil(REQ_GAP - (t - F.reqAt[p.uid]))} 秒后才能再发`;
    F.reqLog = F.reqLog.filter(x => t - x < REQ_WIN);
    if (F.reqLog.length >= REQ_MAX) return '发得太多了，过几分钟再试';
    return '';
  }
  function askFriend(p){
    const why = canAsk(p); if (why){ toast(why, p.name, 1800); return; }
    const to = p.uid, name = p.name;
    const ok = XSocial.invite(to, 'friend', {n:myName()}, {answer(yes){
      if (yes) addMine(to, name, true);
      else dropReq(to);
    }});
    if (!ok) return;
    const t = pnow(); F.reqAt[to] = t; F.reqLog.push(t);
    /* 凭证：对方接受时凭它把我加进他的列表（规则检查），写在邀请之后马上发出，比对方点「接」早到 */
    const r = XNet.ref('freq/' + to + '/' + XNet.uid); if (r) r.set({t:TS()}).catch(e => console.warn('[XFriends] 好友请求没写上', e && e.code));
    toast('好友请求发出去了', '等 ' + name + ' 同意', 1600);
  }
  const dropReq = to => { const r = XNet.ref('freq/' + to + '/' + XNet.uid); if (r) r.remove().catch(() => {}); };
  /* 把对方写进我的列表：mine = 我发的请求被接受（规则看对方的列表里有没有我），否则是我接受了对方的请求（规则看 /freq） */
  function addMine(uid, name, mine){
    const ref = XNet.ref('friends/' + XNet.uid + '/' + uid); if (!ref) return;
    const tryIt = n => ref.set({n:String(name || '?').slice(0, 16), t:TS()}).then(() => {
      if (mine) dropReq(uid); else { const r = XNet.ref('freq/' + XNet.uid + '/' + uid); if (r) r.remove().catch(() => {}); }
      if (mine){ toast(`⭐ ${name} 同意了`, '你们成了好友 · ' + (TOUCH ? '点「⭐ 好友」看列表' : '按 Y 看好友列表'), 2600); sfx.sparkle(); }
      g(() => unlock('friend1'));
    }, e => {
      if (n < 2) return setTimeout(() => tryIt(n + 1), 1200);       // 对方那边的写入可能还在路上
      console.warn('[XFriends] 好友没存上', e && e.code); toast('好友没存上', '网络不好，过一会儿再加一次', 2200);
    });
    tryIt(0);
  }
  XSocial.defineInvite('friend', {
    icon:'⭐', yes:'加好友', no:'不了',
    title:name => `${name} 想加你为好友`,
    desc:() => '加了以后能看到对方在不在线、在哪，一键导航过去',
    check(from){
      if (!F.on) return 'unknown';
      if (!isFriend(from) && F.list.size >= CAP) return 'ffull';
      return '';
    },
    accept(from, data){
      const p = XSocial.peer(from), name = String((p && p.name) || (data && data.n) || '?').slice(0, 16);
      addMine(from, name, false);
      toast(`⭐ 和 ${name} 成了好友`, TOUCH ? '点「⭐ 好友」看列表' : '按 Y 看好友列表', 2400);
      return {};
    },
    late(from, data){ if (data && data.ok){ const p = XSocial.peer(from); addMine(from, p ? p.name : nameOf(from), true); } else dropReq(from); }
  });
  XSocial.addMenuItem({
    id:'friend',
    opt(p){
      if (!F.on) return null;
      const fr = isFriend(p.uid), full = F.list.size >= CAP, bl = blocked(p.uid);
      return {icon:'⭐', title:fr ? '已经是好友' : '加好友', sub:fr ? '好友列表里能找到对方' : bl ? '你屏蔽了对方' : full ? `好友满了（${CAP} 个）` : p.d.dnd ? '免打扰中' : '上线提醒 · 看在哪 · 导航过去',
        dis:fr || full || bl || !!p.d.dnd};
    },
    pick(p){ askFriend(p); }
  });
  /* 解除：删我这边；对方在线就告诉他，让他也删掉。不在线的话，他下次打开列表时读不到我的状态，自己会删 */
  function unfriend(uid){
    const name = nameOf(uid), on = F.onl.has(uid);
    dropFriend(uid, false);
    if (on) XSocial.send(uid, 'ev', {k:'unfriend'});
    toast('已解除好友', name, 1600);
  }
  function dropFriend(uid, quiet){
    if (F.nav && F.nav.uid === uid){ F.nav = null; if (!quiet) toast('导航结束了', '', 1200); }
    F.list.delete(uid); F.st.delete(uid); syncOnRefs(); F.dirty = true; renderBtn();
    const r = XNet.ref('friends/' + XNet.uid + '/' + uid); if (r) r.remove().catch(() => {});
  }
  XSocial.on('ev', (from, d) => { if (d && d.k === 'unfriend' && isFriend(from)) dropFriend(from, true); });

  /* ---------- 导航 ---------- */
  function navTo(uid){
    if (!isFriend(uid)) return;
    if (!F.onl.has(uid)){ toast(nameOf(uid) + ' 不在线', '', 1400); return; }
    if (mode !== 'naiwa'){ toast('去「奶娃」模式才能导航', '漫游模式没有指南针', 1800); return; }
    F.nav = {uid, name:nameOf(uid), t0:pnow(), lost:0};
    syncSt(); F.dirty = true;
    toast('⭐ 导航去找 ' + F.nav.name, '跟着指南针走 · 小地图上是粉色的点', 2200);
  }
  function navTick(){
    const N = F.nav; if (!N) return;
    N.name = nameOf(N.uid);
    if (!F.onl.has(N.uid)){ N.lost = N.lost || pnow(); if (pnow() - N.lost > 20){ F.nav = null; F.dirty = true; toast(N.name + ' 下线了', '导航结束', 1800); } return; }
    N.lost = 0;
    const P = friendPos(N.uid), me = mePos();
    if (P && me && P.live && Math.hypot(P.x - me.x, P.z - me.z) < ARRIVE){ F.nav = null; F.dirty = true; toast('⭐ 找到 ' + N.name + ' 了', TOUCH ? '点他头上的按钮打个招呼' : '走近按 F 打个招呼', 2200); sfx.ding(); }
  }
  const _base = Object.assign({}, gx);
  Object.assign(gx, {
    target(){
      const b = _base.target(); if (b) return b;
      const N = F.nav; if (!N || !F.on) return null;
      const P = friendPos(N.uid); return P ? {x:P.x, z:P.z, label:'⭐ 找 ' + N.name} : null;
    },
    mini(dot){
      _base.mini(dot);
      const N = F.nav; if (!N || !F.on) return;
      const P = friendPos(N.uid); if (P) dot(P.x, P.z, COL, 8);
    }
  });

  /* ---------- 界面 ---------- */
  { const st = document.createElement('style'); st.textContent = `
#frBtn{display:flex;align-items:center;gap:4px;height:24px;padding:0 10px;border-radius:999px;border:0;background:var(--chip);color:var(--ink);font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-right:auto;touch-action:manipulation;font-variant-numeric:tabular-nums}
#frBtn[hidden]{display:none}
#frBtn:hover,#frBtn.on{box-shadow:inset 0 0 0 1.5px ${COL}}
#frBtn b{color:${COL};font-weight:700}
.crow-sub #online:has(+ #frBtn:not([hidden])){margin-right:6px}
#frPanel{position:fixed;z-index:8;left:50%;transform:translateX(-50%);box-sizing:border-box;bottom:calc(var(--safe-b) + 62px);width:min(460px,calc(100% - 24px));max-height:calc(100% - 180px);display:flex;flex-direction:column;padding:8px 10px 10px;background:var(--panel-solid);border-top:3px solid ${COL}}
#frPanel[hidden]{display:none}
#frPanel .sm-h{flex:none}
.fr-list{overflow:auto;margin:0 -4px;padding:0 4px;min-height:0}
.fr-row{display:flex;align-items:center;gap:9px;min-height:50px;padding:5px 2px;border-top:1px solid var(--line)}
.fr-row:first-child{border-top:0}
.fr-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--muted);opacity:.5}
.fr-row.on .fr-dot{background:var(--ok);opacity:1;box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 25%,transparent)}
.fr-m{flex:1;min-width:0}
.fr-m b{display:block;font-size:14px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-m small{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-size:12px;color:var(--muted);line-height:1.35;overflow:hidden}
.fr-row.nav .fr-m b::after{content:' · 导航中';color:${COL};font-weight:600;font-size:12px}
.fr-a{flex:none;display:flex;gap:5px;align-items:center}
.fr-a button{min-height:34px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.fr-a button.go{background:${COL};border-color:${COL};color:#fff;font-weight:600}
.fr-a button.rm{border-color:transparent;color:var(--muted);padding:0 6px}
.fr-a button.rm.sure{border-color:#e74c3c;color:#e74c3c}
.fr-a button:hover{border-color:${COL}}
.fr-empty{margin:6px 0 4px;font-size:13px;line-height:1.6;color:var(--muted)}
.fr-f{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:6px;padding-top:7px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.fr-f label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--ink);min-height:30px}
#frPop{position:absolute;z-index:3;transform:translate(-50%,calc(-100% - 16px));min-width:170px;max-width:240px;padding:8px 10px 9px;border-radius:var(--r-md,10px);background:var(--panel-solid);border-top:3px solid ${COL};box-shadow:0 6px 24px var(--shadow,rgba(0,0,0,.3));font-size:12.5px;line-height:1.45}
#frPop[hidden]{display:none}
#frPop b{display:block;font-size:14px}
#frPop small{display:block;color:var(--muted)}
#frPop .row{display:flex;gap:6px;margin-top:7px}
#frPop button{flex:1;min-height:32px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer}
#frPop button.go{background:${COL};border-color:${COL};color:#fff;font-weight:600}
body.wd-open #frPanel,body.arc-in #frPanel,body.arc-in #frBtn{display:none!important}
#frGBtn{display:none}
#frGBtn b{color:${COL};margin-left:3px}
#frGBtn.on{border-color:${COL}}
/* phones: the top strip is full (mode tabs, 在线 N 人, weather), so the button sits with 车行 and 暂停 instead */
@media (max-width:760px){
  #frPanel{bottom:auto;top:calc(var(--safe-t,0px) + 66px);max-height:calc(100% - 250px)}
}
@media (max-width:760px),(max-height:520px){
  #frBtn{display:none!important}
  #frGBtn:not([hidden]){display:inline-flex;align-items:center;justify-content:center}
}
@media (max-width:560px){ body.naiwa #gstat #frGBtn{grid-column:2 / 3;justify-self:end} }
@media (max-height:520px){ #frPanel{bottom:auto;top:calc(var(--safe-t,0px) + 54px);max-height:calc(100% - 70px)} }
@media (pointer:coarse){ #frPanel kbd{display:none} }`; document.head.appendChild(st); }

  /* the chip next to 「在线 N 人」: ⭐ 好友 · how many are online */
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'frBtn'; btn.hidden = true; btn.setAttribute('aria-label', '好友列表');
  { const on = document.getElementById('online'); if (on && on.parentNode) on.parentNode.insertBefore(btn, on.nextSibling); else { btn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:6'; document.body.appendChild(btn); } }
  btn.addEventListener('pointerdown', e => e.stopPropagation());
  btn.addEventListener('click', e => { e.stopPropagation(); g(() => ac()); toggle(); });
  /* phones: the same button in the row with 车行 and 暂停 */
  const gbtn = document.createElement('button');
  gbtn.type = 'button'; gbtn.className = 'btn gbtn'; gbtn.id = 'frGBtn'; gbtn.hidden = true;
  { const gb = document.getElementById('garageBtn') || document.getElementById('gxPauseBtn'); if (gb && gb.parentNode) gb.parentNode.insertBefore(gbtn, gb); }   // 排在车行前面：手机竖屏时同一行（车行、暂停占后两格）
  gbtn.addEventListener('pointerdown', e => e.stopPropagation());
  gbtn.addEventListener('click', e => { e.stopPropagation(); g(() => ac()); toggle(); });
  let btnKey = '';
  function renderBtn(){
    const n = F.onl.size, key = F.on + ':' + n + ':' + F.list.size;
    if (key === btnKey) return; btnKey = key;
    btn.hidden = gbtn.hidden = !F.on;
    btn.innerHTML = n ? `⭐ 好友 <b>${n}</b>` : '⭐ 好友';
    gbtn.innerHTML = n ? `⭐ 好友<b>${n}</b>` : '⭐ 好友';
    btn.title = F.list.size ? `好友 ${F.list.size} 个，${n} 个在线（Y）` : '好友（Y）';
    gbtn.setAttribute('aria-label', F.list.size ? `好友：${F.list.size} 个，${n} 个在线` : '好友');
  }

  /* the pause panel: a pill in its header, like the game guide's (js/ui-guide.js) */
  const pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'gd-pill'; pill.id = 'gxpFriends'; pill.hidden = true; pill.textContent = '⭐ 好友';
  pill.style.marginLeft = '6px';
  { const head = document.querySelector('#gxpause .shop-h'); if (head) head.appendChild(pill); }
  pill.addEventListener('click', () => { if (gx.paused) g(() => gx.togglePause()); open(); });

  const panel = document.createElement('div');
  panel.id = 'frPanel'; panel.className = 'panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '好友');
  document.body.appendChild(panel);
  panel.addEventListener('pointerdown', e => e.stopPropagation());

  function statusOf(uid){
    const on = F.onl.has(uid), s = F.st.get(uid), P = on ? friendPos(uid) : null, me = mePos();
    if (on){
      const bits = [];
      const d = P && me ? Math.hypot(P.x - me.x, P.z - me.z) : 1e9;
      if (P && d < 30) bits.push('就在你旁边');
      else if (P){ bits.push(areaName(P.x, P.z)); if (me) bits.push(Math.round(d) + ' 米'); }
      else bits.push('在线 · 正在看在哪…');
      const car = s && s.k && !(P && P.live && !P.car) ? carName(s.k) : '';    // 在附近、已经下车了：不说车
      if (car) bits.push('开着' + car);
      return bits.join(' · ');
    }
    const last = Math.max(s ? s.t : 0, F.offAt.get(uid) || 0);
    return last ? ago(last) + '在线' : '离线';
  }
  function rows(){
    const nav = F.nav && F.nav.uid;
    return [...F.list.entries()].map(([uid, e]) => ({uid, e, on:F.onl.has(uid), last:Math.max((F.st.get(uid) || {}).t || 0, F.offAt.get(uid) || 0, e.t || 0)}))
      .sort((a, b) => (b.uid === nav) - (a.uid === nav) || b.on - a.on || b.last - a.last || nameOf(a.uid).localeCompare(nameOf(b.uid), 'zh'));
  }
  function render(){
    if (!F.panel) return;
    F.dirty = false;
    const R = rows(), n = F.onl.size, conf = F.confirm && pnow() < F.confirm.until ? F.confirm.uid : null;
    const tip = TOUCH ? '走到别的玩家旁边，点他头上的「点我互动」，选「⭐ 加好友」' : '走到别的玩家旁边按 F，选「⭐ 加好友」';
    let html = `<div class="sm-h"><b>⭐ 好友</b><span>${F.list.size ? `${F.list.size}/${CAP} · ${n} 人在线` : `最多 ${CAP} 个`}</span><button type="button" class="sm-x" data-x>关 <kbd>Y</kbd></button></div>`;
    html += '<div class="fr-list">' + (R.length ? R.map(r => {
      const nav = F.nav && F.nav.uid === r.uid;
      return `<div class="fr-row${r.on ? ' on' : ''}${nav ? ' nav' : ''}"><i class="fr-dot"></i><div class="fr-m"><b>${esc(nameOf(r.uid))}</b><small>${esc(statusOf(r.uid))}</small></div><div class="fr-a">` +
        (nav ? `<button type="button" data-unnav>取消导航</button>` : r.on ? `<button type="button" class="go" data-nav="${esc(r.uid)}">导航过去</button>` : '') +
        `<button type="button" class="rm${conf === r.uid ? ' sure' : ''}" data-rm="${esc(r.uid)}" aria-label="解除和 ${esc(nameOf(r.uid))} 的好友">${conf === r.uid ? '确定解除？' : '解除'}</button></div></div>`;
    }).join('') : `<p class="fr-empty">还没有好友。<br>${tip}。<br>对方同意以后，就能在这里看到他在不在线、在哪，一键导航过去。</p>`) + '</div>';
    html += `<div class="fr-f"><label><input type="checkbox" data-note${store.note ? ' checked' : ''}> 好友上线时提醒我</label>` +
      (XNet.account && XNet.account.google ? '' : '<span>用 Google 登录，换设备也不丢好友</span>') + '</div>';
    const list = panel.querySelector('.fr-list'), sc = list ? list.scrollTop : 0;
    panel.innerHTML = html;
    const l2 = panel.querySelector('.fr-list'); if (l2) l2.scrollTop = sc;
  }
  function open(){
    if (!F.on){ toast('联机以后才能用好友', '', 1400); return; }
    if (!(mode === 'naiwa' || mode === 'walk')) return;
    F.panel = true; panel.hidden = false; btn.classList.add('on'); gbtn.classList.add('on'); syncSt(); render();
  }
  function close(){ if (!F.panel) return; F.panel = false; panel.hidden = true; btn.classList.remove('on'); gbtn.classList.remove('on'); F.confirm = null; }
  function toggle(){ F.panel ? close() : open(); }
  const refocus = () => g(() => canvas.focus({preventScroll:true}));
  panel.addEventListener('click', e => {
    g(() => ac());
    const b = e.target.closest('button,input'); if (!b) return;
    if (b.dataset.x != null){ close(); refocus(); }
    else if (b.dataset.nav){ navTo(b.dataset.nav); close(); refocus(); }
    else if (b.dataset.unnav != null){ F.nav = null; toast('导航取消了', '', 1200); render(); }
    else if (b.dataset.rm){
      const uid = b.dataset.rm;
      if (F.confirm && F.confirm.uid === uid && pnow() < F.confirm.until){ F.confirm = null; unfriend(uid); }
      else F.confirm = {uid, until:pnow() + 4};
      render();
    }
    else if (b.dataset.note != null){ store.note = b.checked; save(); toast(store.note ? '好友上线会提醒你' : '不再提醒好友上线', '', 1400); }
  });
  window.addEventListener('pointerdown', e => { if (F.panel && !e.target.closest('#frPanel,#frBtn,#frGBtn,#gxpFriends')) close(); }, true);
  window.addEventListener('keydown', e => {
    if (!F.on || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || document.querySelector('dialog[open]') || g(() => XMini.inside, false)) return;
    if (F.panel && (e.code === 'Escape' || e.code === 'KeyY')){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.code === 'KeyY' && (mode === 'naiwa' || mode === 'walk') && !gx.paused && !document.body.classList.contains('titled')){ e.preventDefault(); e.stopImmediatePropagation(); open(); }
  }, true);

  /* ---------- 大地图：在线的好友画成粉色星星，点一下弹小卡片 ---------- */
  function star(G, x, y, r, fill, line, lw){
    G.beginPath();
    for (let i = 0; i < 10; i++){ const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; G.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    G.closePath(); G.fillStyle = fill; G.strokeStyle = line; G.lineWidth = lw; G.lineJoin = 'round'; G.stroke(); G.fill();
  }
  function mapLayer(cx, cz, mo){
    F.mapSeen = performance.now();
    F.hits = [];
    if (!F.on || !mo || !mo.g) return;
    const G = mo.g, Sw = G.canvas.width, Sh = G.canvas.height, k = Math.min(Sw, Sh) / mo.span, u = mo.u || 1, e = 14 * u;
    let shown = 0;
    G.save();
    G.font = `700 ${Math.round(12 * u)}px ${getComputedStyle(document.body).fontFamily}`; G.textAlign = 'center'; G.textBaseline = 'top';
    for (const uid of F.list.keys()){
      if (!F.onl.has(uid)) continue;
      const P = friendPos(uid); if (!P) continue;
      let px = Sw / 2 + (P.x - cx) * k, py = Sh / 2 + (P.z - cz) * k;
      const edge = px < e || px > Sw - e || py < e || py > Sh - e;
      px = Math.max(e, Math.min(Sw - e, px)); py = Math.max(e, Math.min(Sh - e, py));
      const nav = F.nav && F.nav.uid === uid;
      if (nav){ G.strokeStyle = COL; G.lineWidth = 3 * u; G.beginPath(); G.arc(px, py, 15 * u, 0, 7); G.stroke(); }
      star(G, px, py, (edge ? 8 : 10) * u, COL, '#ffffff', 3 * u);
      G.lineWidth = 1.2 * u; G.strokeStyle = '#1f2a33'; G.stroke();
      if (!edge){
        const t = nameOf(uid); G.lineWidth = 3.5 * u; G.strokeStyle = 'rgba(255,253,248,.95)'; G.strokeText(t, px, py + 11 * u); G.fillStyle = '#b8336a'; G.fillText(t, px, py + 11 * u);
      }
      F.hits.push({uid, x:px, y:py}); shown++;
    }
    G.restore();
    if (shown){ const L = document.getElementById('bmLegend'); if (L && !L.hidden && !L.querySelector('[data-fr]')) L.insertAdjacentHTML('beforeend', `<span data-fr><i style="--c:${COL}"></i>在线的好友（点一下）</span>`); }
  }
  g(() => XGuide.mapLayers.push(mapLayer));
  const pop = document.createElement('div'); pop.id = 'frPop'; pop.hidden = true;
  { const v = document.getElementById('bmView'); if (v) v.appendChild(pop); }
  const cv = document.getElementById('bmCv');
  let down = null;
  if (cv){
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('click', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8){ return; }
      const r = cv.getBoundingClientRect(), sx = cv.width / Math.max(1, r.width), x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sx;
      let best = null, bd = 26 * sx;
      for (const h of F.hits){ const d = Math.hypot(h.x - x, h.y - y); if (d < bd){ bd = d; best = h; } }
      if (!best){ pop.hidden = true; return; }
      showPop(best.uid, best.x / sx, best.y / sx);
    });
  }
  function showPop(uid, x, y){
    const nav = F.nav && F.nav.uid === uid;
    pop.innerHTML = `<b>⭐ ${esc(nameOf(uid))}</b><small>${esc(statusOf(uid))}</small>` +
      `<div class="row">${nav ? '<button type="button" data-unnav>取消导航</button>' : `<button type="button" class="go" data-nav="${esc(uid)}">导航过去</button>`}<button type="button" data-close>关</button></div>`;
    const v = pop.parentElement, W = v ? v.clientWidth : 400;
    pop.style.left = Math.max(95, Math.min(W - 95, x)) + 'px'; pop.style.top = Math.max(96, y) + 'px';
    pop.hidden = false; pop.dataset.uid = uid;
  }
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.nav){ pop.hidden = true; g(() => XGuide.closeMap()); navTo(b.dataset.nav); }
    else if (b.dataset.unnav != null){ F.nav = null; pop.hidden = true; toast('导航取消了', '', 1200); }
    else pop.hidden = true;
  });
  { const bm = document.getElementById('bigmap'); if (bm) bm.addEventListener('close', () => { pop.hidden = true; }); }

  /* ---------- 每 0.5 秒：订阅、写状态、提醒、导航、刷新列表 ---------- */
  let lastRender = 0;
  setInterval(() => {
    if (!F.on) return;
    g(syncSt); g(writeMine); g(flushNotes); g(navTick);
    if (F.panel){
      if (!(mode === 'naiwa' || mode === 'walk') || document.body.classList.contains('titled')) close();
      else if (F.dirty || performance.now() - lastRender > 5000){ lastRender = performance.now(); render(); }
    }
    if (!pop.hidden && !g(() => XGuide.mapOn, false)) pop.hidden = true;
    pill.hidden = !F.on;
  }, 500);

  /* ---------- 开关：联机、规则已发布才有 ---------- */
  function setOn(v){
    if (v === F.on) return;
    F.on = v;
    if (v){ openList(); watchConn(); }
    else {
      close(); pop.hidden = true;
      if (F.myRef){ g(() => F.myRef.off()); F.myRef = null; }
      for (const R of F.onRefs.values()) g(() => R.ref.off('value', R.cb)); F.onRefs.clear(); F.onl.clear();
      dropSt(); F.list.clear(); F.nav = null; F.noteQ = [];
      if (F.connRef){ g(() => F.connRef.off('value', F.connCb)); F.connRef = null; }
      F.wrote = null; F.discOk = false;
    }
    pill.hidden = !F.on; btnKey = ''; renderBtn();
  }
  const check = () => setOn(!!(XNet.online && XNet.uid && !F.denied && XNet.ref('friends/' + XNet.uid)));
  XNet.ready.then(check); window.addEventListener('xnet', check);
  g(() => achAdd([['friend1', '交个朋友', '和别的玩家互加好友', 20]]));

  window.XFriends = {
    get active(){ return F.on; }, cap:CAP,
    get list(){ return [...F.list.keys()].map(uid => ({uid, name:nameOf(uid), online:F.onl.has(uid), status:statusOf(uid)})); },
    get nav(){ return F.nav ? F.nav.uid : null; },
    isFriend, open, close, toggle, navTo, unfriend, ask:uid => { const p = XSocial.peer(uid); if (p) askFriend(p); }, areaName,
    _F:F
  };
})();
