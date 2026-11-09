/* XMUM 校园漫游 · 联机与排行榜（Firebase Realtime Database + 匿名登录）
 *
 * 没有配置（window.XMUM_FIREBASE 为 null）时只定义一个离线的 XNet，不发任何网络请求。
 * 任何一步失败（CDN 被墙、没开匿名登录、规则拒绝……）都只 console.warn 一次，游戏照常单机玩。
 *
 * 对外接口（UI 按这个写）：
 *   XNet.online          boolean，已登录且数据库可用
 *   XNet.uid             匿名用户 id（离线时为 null）
 *   XNet.playersOnline   当前在线人数（含自己；离线时 0）
 *   XNet.top(board, n=10)    → Promise<[{name, value, ts}]>，最好的在前；离线返回 []
 *   XNet.submit(board, value) → Promise<boolean>，成绩比自己记录好才写入，写入成功为 true
 *   XNet.ready           Promise，联机初始化结束（成功或失败）后 resolve
 *   board: 'hole'（单局吞掉的 %）| 'stunt'（特技总分）| 'rich'（RM）
 *   XNet.account         {google:boolean, email, name}：是否已用 Google 登录
 *   XNet.signInGoogle()  → Promise<'linked'|'switched'>；游客身份直接升级成 Google 账号（uid 不变）；
 *                          这个 Google 账号以前在别的设备用过，就切换过去并拉取它的云存档（会刷新页面）
 *   XNet.signOut()       退出 Google，回到新的游客身份（会刷新页面）
 * 状态变化时会在 window 上派发 'xnet' 事件。
 *
 * 数据库路径：
 *   /presence/{uid} = {name, mode, x, z, y, h, car?, color, t}
 *   /boards/{board}/{uid} = {name, value, ts}
 *   /saves/{uid} = {data, score, ts}   只有 Google 登录的人才有：本机所有 xmum-* 存档的 JSON，双向同步，进度多的一边为准
 */
'use strict';
(() => {
  const BOARDS = {hole:{max:100, dp:1}, stunt:{max:1e7, dp:0}, rich:{max:1e7, dp:2}};
  const XNet = window.XNet = {
    online:false, uid:null, playersOnline:0, account:{google:false, email:null, name:null},
    top:async () => [], submit:async () => false,
    signInGoogle:async () => { throw new Error('联机未开启'); }, signOut:async () => {},
    ready:Promise.resolve(false)
  };
  const cfg = window.XMUM_FIREBASE;
  if (!cfg || typeof cfg !== 'object') return;          // 单机模式：什么都不做

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const SEND_MS = 200, IDLE_HEARTBEAT = 2000, HIDDEN_HEARTBEAT = 4000;
  const STALE_DRAW = 6000, STALE_COUNT = 15000, MAX_GHOSTS = 20, MAP = 700;
  let db = null, me = null, warned = false, serverOffset = 0, connected = false;
  const best = {hole:-1, stunt:-1, rich:-1};            // 服务器上自己的最好成绩（-1 = 未知）
  const remotes = new Map();                            // uid -> {d, seen, g}
  const emit = () => { try { window.dispatchEvent(new Event('xnet')); } catch(e){} };

  function fail(why, err){
    if (!warned){ warned = true; console.warn('[XNet] 联机不可用，继续单机：' + why, err || ''); }
    XNet.online = false; XNet.playersOnline = 0; connected = false;
    for (const uid of [...remotes.keys()]) dropRemote(uid);
    pill(); emit();
  }
  const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' 超时')), ms))]);
  function loadScript(src){
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('加载失败 ' + src)); document.head.appendChild(s);
    });
  }

  /* ---------- 名字 ---------- */
  function playerName(){
    let n = '';
    try { if (window.XUI && typeof XUI.playerName === 'function') n = String(XUI.playerName() || ''); } catch(e){}
    if (!n) try { n = localStorage.getItem('xmum-name') || ''; } catch(e){}
    if (!n){
      try { n = localStorage.getItem('xmum-guest') || ''; } catch(e){}
      if (!n){ n = '游客' + String(1000 + Math.floor(Math.random() * 9000)); try { localStorage.setItem('xmum-guest', n); } catch(e){} }
    }
    n = n.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
    return [...n].slice(0, 16).join('').slice(0, 16) || '游客';
  }

  /* ---------- 在线人数 ---------- */
  function pill(){
    let el = document.getElementById('online');
    if (!el){
      if (!XNet.online) return;
      el = document.createElement('div'); el.id = 'online';
      el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:20;padding:3px 12px;border-radius:999px;background:rgba(20,28,36,.72);color:#fff;font:500 12px/1.6 system-ui,sans-serif;pointer-events:none';
      document.body.appendChild(el);
    }
    if (!XNet.online){ el.hidden = true; return; }
    el.textContent = '在线 ' + XNet.playersOnline + ' 人'; el.hidden = false;
  }
  function recount(){
    const now = Date.now() + serverOffset; let n = connected ? 1 : 0;
    for (const [uid, r] of remotes) if (uid !== XNet.uid && now - (r.d.t || 0) < STALE_COUNT) n++;
    if (n !== XNet.playersOnline){ XNet.playersOnline = n; emit(); }
    pill();
  }

  /* ---------- 排行榜 ---------- */
  const clean = (board, v) => {
    const B = BOARDS[board]; if (!B) return NaN; v = +v; if (!isFinite(v)) return NaN;
    const k = Math.pow(10, B.dp); return Math.max(0, Math.min(B.max, Math.floor(v * k + 1e-6) / k));
  };
  XNet.top = async (board, n = 10) => {
    if (!BOARDS[board]) return [];
    await XNet.ready; if (!XNet.online) return [];
    n = Math.max(1, Math.min(100, n | 0 || 10));
    try {
      const snap = await timeout(db.ref('boards/' + board).orderByChild('value').limitToLast(n).once('value'), 10000, '读取排行榜');
      const out = [];
      snap.forEach(c => { const v = c.val() || {}; out.push({name:String(v.name || '?'), value:+v.value || 0, ts:+v.ts || 0, uid:c.key}); });
      return out.sort((a, b) => b.value - a.value || a.ts - b.ts);
    } catch(e){ console.warn('[XNet] 排行榜读取失败', e); return []; }
  };
  XNet.submit = async (board, value) => {
    const v = clean(board, value);
    if (!(v > 0)) return false;
    await XNet.ready; if (!XNet.online || !(v > best[board])) return false;
    const name = playerName(), uid = XNet.uid;
    try {
      const res = await timeout(db.ref('boards/' + board + '/' + uid).transaction(cur => {
        if (cur && typeof cur.value === 'number' && cur.value >= v) return;   // 已有更好的，放弃
        return {name, value:v, ts:Date.now()};
      }, undefined, false), 15000, '提交成绩');
      const now = res && res.snapshot && res.snapshot.val();
      if (now && typeof now.value === 'number') best[board] = Math.max(best[board], now.value);
      return !!(res && res.committed);
    } catch(e){ console.warn('[XNet] 成绩提交失败', board, e); return false; }
  };

  /* ---------- 自动提交 ---------- */
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  let holeWasOn = false, lastAuto = -Infinity;
  function autoTick(force){
    if (!XNet.online) return;
    const on = g(() => HS.on, false);
    if (holeWasOn && !on && g(() => HS.t, 1) <= .01){       // 一局黑洞正常结束（时间到）
      const pct = g(() => hole.score / HS.total * 100, 0);
      if (pct > 0) XNet.submit('hole', pct);
    }
    holeWasOn = on;
    const t = performance.now();
    if (!force && t - lastAuto < 20000) return;
    const st = clean('stunt', g(() => stunt.total, 0)), rm = clean('rich', g(() => money, 0));
    let sent = false;
    if (st > 0 && st > best.stunt){ XNet.submit('stunt', st); sent = true; }
    if (rm > 0 && rm > best.rich){ XNet.submit('rich', rm); sent = true; }
    if (sent || force) lastAuto = t;
  }

  /* ---------- 自己的位置 ---------- */
  const wrapA = a => { a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return isFinite(a) ? a : 0; };
  const clampM = v => (isFinite(v) ? Math.max(-MAP, Math.min(MAP, Math.round(v * 100) / 100)) : 0);
  function myState(){
    const m = g(() => mode, 'orbit');
    const s = {name:playerName(), mode:m, x:0, z:0, y:0, h:0, car:null, color:'#f1c84b'};
    if (m === 'naiwa'){
      const c = g(() => driving, null);
      if (c){ s.x = c.x; s.z = c.z; s.y = c.y || 0; s.h = c.h; s.car = c.kind; s.color = c.color0 || ('#' + c.paint.color.getHexString()); }
      else { const n = g(() => nw, null); if (n){ s.x = n.x; s.z = n.z; s.y = n.y || 0; s.h = n.h; } }
    } else if (m === 'walk'){
      const p = g(() => player, null);
      if (p){ s.x = p.x; s.z = p.z; s.y = g(() => groundAt(p.x, p.z), 0); s.h = p.yaw + Math.PI; }
    }
    s.x = clampM(s.x); s.z = clampM(s.z); s.y = clampM(s.y); s.h = Math.round(wrapA(s.h) * 1000) / 1000;
    if (!/^#[0-9a-fA-F]{6}$/.test(s.color)) s.color = '#f1c84b';
    if (!s.car) delete s.car;
    return s;
  }
  let lastSent = null, lastSentAt = 0, presRef = null, hiddenPage = false;
  function sendPresence(){
    if (!XNet.online || !connected || !presRef || hiddenPage) return;
    const s = myState(), t = performance.now(), live = s.mode === 'naiwa' || s.mode === 'walk';
    const changed = !lastSent || s.mode !== lastSent.mode || s.car !== lastSent.car || s.name !== lastSent.name || s.color !== lastSent.color
      || (live && (Math.abs(s.x - lastSent.x) + Math.abs(s.z - lastSent.z) + Math.abs(s.y - lastSent.y) > .05 || Math.abs(wrapA(s.h - lastSent.h)) > .02));
    if (!changed && t - lastSentAt < (live ? IDLE_HEARTBEAT : HIDDEN_HEARTBEAT)) return;
    lastSent = s; lastSentAt = t;
    const out = Object.assign({}, s, {t:firebase.database.ServerValue.TIMESTAMP});
    if (!live){ delete out.car; }                           // 其他模式只留心跳，别人不画
    presRef.set(out).catch(e => { if (String(e && e.code || e).includes('PERMISSION')) fail('presence 写入被规则拒绝', e); });
  }

  /* ---------- 其他玩家（幽灵） ---------- */
  const sharedMats = new Set();
  g(() => [glassMat, tyreMat, headMat, tailMat, white].forEach(m => sharedMats.add(m)));
  function disposeObj(o){
    o.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) [].concat(m.material).forEach(x => { if (!sharedMats.has(x)){ if (x.map && x.map.dispose) x.map.dispose(); x.dispose(); } });
    });
  }
  function makeGhost(r){
    const n = makeNaiwa(); n.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
    scene.add(n.root);
    const L = addLabel(r.d.name || '?', 0, -999, 0, false);
    L.el.style.borderColor = r.d.color || ''; L.el.style.boxShadow = '0 0 0 2px ' + (r.d.color || '#f1c84b');
    L.el.setAttribute('data-net', '1');
    return {n, car:null, carKey:'', L, x:r.d.x, y:r.d.y, z:r.d.z, h:r.d.h, walkT:0, spd:0, vis:false};
  }
  function setGhostCar(G, kind, color){
    const key = kind ? kind + color : '';
    if (key === G.carKey) return;
    if (G.car){ G.car.body.remove(G.n.root); scene.remove(G.car.root); disposeObj(G.car.root); G.car = null; }
    G.carKey = key;
    if (kind && g(() => CAR_T[kind], null)){
      const c = makeCar(kind, color, G.x, G.z, G.h);
      const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);    // 只是画面，不参与物理
      c.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
      c.body.add(G.n.root); G.n.root.position.set(...c.T.seat); G.n.root.rotation.set(0, 0, 0);
      G.car = c;
    } else { scene.add(G.n.root); G.n.root.scale.setScalar(g(() => NAI_S, 1.3)); }
  }
  function hideGhost(G){
    if (!G.vis) return; G.vis = false;
    G.n.root.visible = false; if (G.car) G.car.root.visible = false; G.L.dead = true;
  }
  function dropRemote(uid){
    const r = remotes.get(uid); if (!r) return; remotes.delete(uid);
    const G = r.g; if (!G) return;
    if (G.car){ scene.remove(G.car.root); disposeObj(G.car.root); } else scene.remove(G.n.root);
    disposeObj(G.n.root);
    G.L.dead = true; G.L.el.remove(); const i = labels.indexOf(G.L); if (i >= 0) labels.splice(i, 1);
  }
  function onRemote(snap){
    const uid = snap.key, d = snap.val();
    if (uid === XNet.uid) return;
    if (!d || typeof d !== 'object'){ dropRemote(uid); recount(); return; }
    let r = remotes.get(uid);
    if (!r){ r = {d, seen:0, g:null}; remotes.set(uid, r); }
    const age = Math.max(0, Date.now() + serverOffset - (+d.t || 0));
    r.d = d; r.seen = performance.now() - Math.min(age, 60000);
    if (r.g && r.g.L.el.textContent !== String(d.name || '?')) r.g.L.el.textContent = String(d.name || '?');
    recount();
  }

  let lastFrame = performance.now(), sortT = 0, drawSet = new Set();
  const lerpA = (a, b, k) => a + wrapA(b - a) * k;
  function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!remotes.size) return;
    const m = g(() => mode, 'orbit'), showAll = m !== 'hole' && XNet.online;
    if (now - sortT > 500){                                 // 只画最近的 20 个
      sortT = now;
      const ref = g(() => (m === 'naiwa' ? (driving || nw) : m === 'walk' ? player : controls.target), {x:0, z:0});
      const list = [];
      for (const [uid, r] of remotes){
        const d = r.d;
        if ((d.mode === 'naiwa' || d.mode === 'walk') && now - r.seen < STALE_DRAW) list.push([Math.hypot(d.x - ref.x, d.z - ref.z), uid]);
      }
      list.sort((a, b) => a[0] - b[0]); drawSet = new Set(list.slice(0, MAX_GHOSTS).map(e => e[1]));
    }
    const k = 1 - Math.exp(-dt * 8);
    for (const [uid, r] of remotes){
      const d = r.d, live = (d.mode === 'naiwa' || d.mode === 'walk') && now - r.seen < STALE_DRAW;
      if (!showAll || !live || !drawSet.has(uid)){ if (r.g) hideGhost(r.g); continue; }
      if (!r.g) r.g = makeGhost(r);
      const G = r.g, car = d.mode === 'naiwa' && d.car ? String(d.car) : null;
      setGhostCar(G, car, /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#cccccc');
      const tx = +d.x || 0, ty = +d.y || 0, tz = +d.z || 0, th = +d.h || 0;
      const jump = Math.hypot(tx - G.x, tz - G.z);
      const px = G.x, pz = G.z;
      if (!G.vis || jump > 40){ G.x = tx; G.y = ty; G.z = tz; G.h = th; }
      else { G.x += (tx - G.x) * k; G.y += (ty - G.y) * k; G.z += (tz - G.z) * k; G.h = lerpA(G.h, th, k); }
      G.spd += (Math.hypot(G.x - px, G.z - pz) / Math.max(dt, 1e-3) - G.spd) * Math.min(1, dt * 6);
      if (!G.vis){ G.vis = true; G.n.root.visible = true; if (G.car) G.car.root.visible = true; G.L.dead = false; }
      if (G.car){
        G.car.x = G.x; G.car.z = G.z; G.car.h = G.h;
        G.car.root.position.set(G.x, G.y, G.z); G.car.root.rotation.set(0, G.h, 0);
        const w = G.spd * dt / (G.car.T.r || .35); G.car.wheels.forEach(wh => { wh.rotation.x += w; });
        G.n.legs.forEach(l => { l.rotation.x = -1.4; }); G.n.arms.forEach(a => { a.rotation.x = -1.05; });
        G.L.pos.set(G.x, G.y + G.car.T.H + 1.6, G.z);
      } else {
        G.n.root.position.set(G.x, G.y, G.z); G.n.root.rotation.y = G.h;
        const moving = G.spd > .4; if (moving) G.walkT += dt * Math.min(14, 4 + G.spd * 1.1);
        const sw = moving ? Math.sin(G.walkT) : 0, [aL, aR] = G.n.arms, [lL, lR] = G.n.legs;
        lL.rotation.x = sw * .55; lR.rotation.x = -sw * .55; aL.rotation.set(-.35 - sw * .4, 0, .1); aR.rotation.set(-.35 + sw * .4, 0, -.1);
        G.n.body.position.y = moving ? Math.abs(sw) * .05 : 0; G.n.body.rotation.z = sw * .09;
        G.L.pos.set(G.x, G.y + 3.4, G.z);
      }
    }
  }

  /* ---------- 云存档（只给 Google 登录的人） ---------- */
  const SAVE_KEY = k => /^xmum-/.test(k) && k !== 'xmum-guest' && k !== 'xmum-restored';
  function localBlob(){
    const o = {};
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (SAVE_KEY(k)) o[k] = localStorage.getItem(k); } } catch(e){}
    return o;
  }
  function blobScore(o){                                  // 进度大致有多少：钱 + 车 + 特技 + 黑洞最好成绩
    let s = 0;
    try { const d = JSON.parse(o['xmum-gta-v1'] || 'null') || {}; s += (+d.money || 0) + (Array.isArray(d.owned) ? d.owned.length : 0) * 500 + (+d.stunt || 0) / 50; } catch(e){}
    return s + (+o['xmum-hole-best'] || 0) * 10;
  }
  let lastPushed = '';
  async function cloudPush(){
    if (!XNet.online || !XNet.account.google) return;
    const o = localBlob(), str = JSON.stringify(o);
    if (str === lastPushed || str.length > 30000) return;
    try {
      await timeout(db.ref('saves/' + XNet.uid).set({data:str, score:Math.round(blobScore(o)), ts:firebase.database.ServerValue.TIMESTAMP}), 15000, '上传云存档');
      lastPushed = str;
    } catch(e){ console.warn('[XNet] 云存档上传失败', e); }
  }
  async function cloudSync(){                             // 返回 true 表示用云端进度覆盖了本机并刷新了页面
    if (!XNet.online || !XNet.account.google) return false;
    try {
      const v = (await timeout(db.ref('saves/' + XNet.uid).once('value'), 10000, '读取云存档')).val();
      if (v && typeof v.data === 'string'){
        let cloud = {}; try { cloud = JSON.parse(v.data) || {}; } catch(e){}
        if (blobScore(cloud) > blobScore(localBlob()) + .5){
          for (const k of Object.keys(cloud)) if (SAVE_KEY(k) && typeof cloud[k] === 'string') localStorage.setItem(k, cloud[k]);
          try { sessionStorage.setItem('xmum-restored', '1'); } catch(e){}
          location.reload(); return true;
        }
      }
      await cloudPush();
    } catch(e){ console.warn('[XNet] 云存档同步失败', e); }
    return false;
  }
  function setAccount(u){
    const google = !!u && !u.isAnonymous && (u.providerData || []).some(p => p && p.providerId === 'google.com');
    const gp = google ? u.providerData.find(p => p.providerId === 'google.com') : null;
    XNet.account = {google, email:google ? (u.email || gp.email || null) : null, name:google ? (u.displayName || gp.displayName || null) : null};
  }

  /* ---------- Google 登录 ---------- */
  XNet.signInGoogle = async () => {
    await XNet.ready;
    if (!XNet.online) throw Object.assign(new Error('联机不可用'), {code:'xnet/offline'});
    const auth = firebase.auth(), prov = new firebase.auth.GoogleAuthProvider();
    prov.setCustomParameters({prompt:'select_account'});
    const cur = auth.currentUser;
    try {
      if (cur && cur.isAnonymous){
        const r = await cur.linkWithPopup(prov);         // 游客 → Google，uid 不变，排行榜记录跟着走
        await r.user.getIdToken(true); setAccount(r.user); emit();
        await cloudPush(); return 'linked';
      }
      const r = await auth.signInWithPopup(prov);
      setAccount(r.user); emit(); location.reload(); return 'switched';
    } catch(e){
      if (e && (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use')){
        /* 这个 Google 账号以前在别的设备上用过：切换过去，拉它的云存档 */
        const cred = e.credential || (firebase.auth.GoogleAuthProvider.credentialFromError && firebase.auth.GoogleAuthProvider.credentialFromError(e));
        if (!cred) throw e;
        if (presRef) await presRef.remove().catch(() => {});
        const r = await auth.signInWithCredential(cred);
        XNet.uid = r.user.uid; setAccount(r.user); emit();
        if (!(await cloudSync())) location.reload();
        return 'switched';
      }
      throw e;
    }
  };
  XNet.signOut = async () => {
    if (!XNet.online) return;
    await cloudPush();
    if (presRef) await presRef.remove().catch(() => {});
    await firebase.auth().signOut();
    location.reload();                                     // 刷新后自动成为新的游客
  };

  /* ---------- 启动 ---------- */
  async function start(){
    try {
      if (!(window.firebase && firebase.auth && firebase.database)){
        await timeout(loadScript(SDK + 'firebase-app-compat.js'), 20000, '加载 Firebase SDK');
        await timeout(Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-database-compat.js')]), 20000, '加载 Firebase SDK');
      }
      const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
      const auth = app.auth();
      me = await timeout(new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); }), 15000, '读取登录状态');
      if (!me){ const cred = await timeout(auth.signInAnonymously(), 15000, '匿名登录'); me = (cred && cred.user) || auth.currentUser; }
      if (!me) throw new Error('匿名登录没有返回用户');
      setAccount(me);
      XNet.uid = me.uid;
      db = app.database();
      /* 先读自己的最好成绩，顺便确认规则允许读写 */
      await timeout(Promise.all(Object.keys(BOARDS).map(b => db.ref('boards/' + b + '/' + me.uid).once('value').then(s => {
        const v = s.val(); best[b] = v && typeof v.value === 'number' ? v.value : 0;
      }))), 15000, '读取数据库');
      XNet.online = true;
      db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = +s.val() || 0; });
      presRef = db.ref('presence/' + me.uid);
      db.ref('.info/connected').on('value', s => {
        connected = !!s.val();
        if (connected){
          presRef.onDisconnect().remove().then(() => { lastSent = null; sendPresence(); }).catch(e => fail('onDisconnect 失败', e));
        }
        recount();
      });
      const pres = db.ref('presence');
      const denied = e => fail('presence 读取被拒绝', e);
      pres.on('child_added', onRemote, denied);
      pres.on('child_changed', onRemote, denied);
      pres.on('child_removed', s => { dropRemote(s.key); recount(); }, denied);
      setInterval(sendPresence, SEND_MS);
      setInterval(() => { autoTick(false); recount(); }, 1000);
      setInterval(() => { const on = g(() => HS.on, false); if (on !== holeWasOn) autoTick(false); }, SEND_MS);
      const away = () => {
        if (!XNet.online) return;
        autoTick(true); cloudPush();
        hiddenPage = true; if (presRef) presRef.remove().catch(() => {}); lastSent = null;
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') away();
        else { hiddenPage = false; sendPresence(); }
      });
      window.addEventListener('pagehide', away);
      requestAnimationFrame(frame);
      recount(); emit();
      if (XNet.account.google){
        setInterval(cloudPush, 30000);
        cloudSync().then(reloaded => {
          let restored = false; try { restored = sessionStorage.getItem('xmum-restored') === '1'; sessionStorage.removeItem('xmum-restored'); } catch(e){}
          if (!reloaded && restored) g(() => toast('已从云端恢复进度', XNet.account.email || '', 2400));
        });
      }
      return true;
    } catch(e){
      fail(e && e.message || '初始化失败', e);
      return false;
    }
  }
  XNet.ready = start();
})();
