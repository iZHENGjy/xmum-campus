/* 仅供本地测试：一个内存里的假 firebase，同一个浏览器里开的几个标签页共用一份数据（BroadcastChannel），
 * 所以两个窗口能互相看到、互发邀请，测 js/96-social.js 的搭车和挑战。不检查数据库规则（下面两个开关除外）。
 * 由 test/social.html 注入，代替 js/firebase-config.js。每个标签页的 uid 是 'mock-' + ?p= 的值。
 * db.goOffline() / goOnline()：像真的一样断开、重连（见下面）。
 * ?oldrules：模拟还没发布新规则的数据库：拒绝带互动字段的 presence，也拒绝新的 /pres 和 /on（js/net.js 应该退回旧的 /presence）。
 *
 * 流量计：按真实 Firebase 的线上格式估算每条推送的字节数（{"t":"d","d":{"a":"d|m","b":{"p":路径,"d":数据}}}，
 * 外加每条 34 字节的 WebSocket + TLS 外层），记进 XNet.traffic（网址加 &netmeter 左下角显示）。
 * 只有这个标签页监听着的路径被别人写了才算下载；自己写的算上传，服务器只回一条确认。 */
'use strict';
(() => {
  const Q = new URLSearchParams(location.search);
  const P = (Q.get('p') || 'a').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'a';
  window.XMUM_FIREBASE = {apiKey:'mock', projectId:'mock', databaseURL:'https://mock.invalid'};
  const TS = {'.sv':'timestamp'}, OVER = 34, ACK = 44;
  const OLD = Q.has('oldrules');
  const root = {}, listeners = [], disc = new Map();      // disc: path -> 1（删掉）或 {u:{…}}（update，js/96-friends.js 断线时写最后上线时间）
  /* onDisconnect 要做的写入：删掉的路径写 null，update 的逐个孩子写（时间戳这时才算） */
  const discWrites = m => { const w = []; for (const [p, v] of m){ if (v && v.u) for (const k in v.u) w.push([p + '/' + k, v.u[k] == null ? null : resolve(v.u[k])]); else w.push([p, null]); } return w; };
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('xmum-social-mock') : null;
  const split = p => String(p || '').split('/').filter(Boolean);
  const get = p => split(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), root);
  const resolve = v => (v && v['.sv'] === 'timestamp') ? Date.now() : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v);
  const clone = v => v === undefined || v === null ? null : JSON.parse(JSON.stringify(v));
  const bytes = s => new TextEncoder().encode(s).length;
  const T = () => (window.XNet && XNet.traffic) || (window.__mockTR = window.__mockTR || {rx:0, tx:0, rxN:0, txN:0});
  const rx = n => { const t = T(); t.rx += n + OVER; t.rxN++; };
  const tx = n => { const t = T(); t.tx += n + OVER; t.txN++; };
  const msg = (a, p, d) => JSON.stringify({t:'d', d:{a, b:{p, d}}});
  const related = (a, b) => { const x = split(a), y = split(b), n = Math.min(x.length, y.length); for (let i = 0; i < n; i++) if (x[i] !== y[i]) return false; return true; };
  const denied = () => Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), {code:'PERMISSION_DENIED'}));
  const newRule = p => /^(pres|on)(\/|$)/.test(p);
  /* 唯一模拟的读规则：/fst/{uid}（js/96-friends.js）只有 uid 的好友列表里有我时才能读（开始监听时检查一次） */
  const fstDeny = p => { const m = /^fst\/([^/]+)$/.exec(p); return !!m && m[1] !== 'mock-' + P && !get('friends/' + m[1] + '/mock-' + P); };
  function snap(path, v, order){
    const ks = split(path);
    return {key:ks[ks.length - 1] || null, ref:ref(path), val:() => clone(v), exists:() => v != null,
      forEach(cb){ if (!v || typeof v !== 'object') return; for (const k of order || Object.keys(v)) if (cb(snap(path + '/' + k, v[k]))) return true; }};
  }
  function setRaw(path, v){
    const ks = split(path); if (!ks.length) return;
    const last = ks.pop(); let o = root;
    for (const k of ks){ if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    if (v == null) delete o[last]; else o[last] = v;
  }
  /* 一批写入（set 一条，或 update 的多条路径）：先记下每个监听的旧值，全部写完再按差别发事件，每个孩子最多一个事件 */
  /* goOffline / goOnline：断开时服务器替我们执行 onDisconnect；断开期间收不到别人的写入（数据照样记下，只是不发事件）；
     自己的写入先在本地生效、连上以后再发出去；连上时每个监听按「断开前看到的」和「现在」的差别补发事件（像真的重新同步一样） */
  let online = true, frozen = null;
  const infoL = [], outQ = [];
  function goOffline(){
    if (!online) return;
    online = false; frozen = new Map(listeners.map(L => [L, clone(get(L.path))]));
    const w = discWrites(disc); disc.clear();
    for (const [p, v] of w) setRaw(p, v);
    if (bc && w.length) bc.postMessage({op:'w', writes:w, wire:null});
    for (const cb of infoL) try { cb(snap('.info/connected', false)); } catch(e){ console.error('[MOCK]', e); }
  }
  function goOnline(){
    if (online) return;
    online = true;
    for (const q of outQ.splice(0)){ tx(bytes(q.wire)); if (bc) bc.postMessage({op:'w', writes:q.writes, wire:q.wire}); }
    const fz = frozen; frozen = null; const paths = new Set();
    for (const L of [...listeners]){
      if (!paths.has(L.path)){ paths.add(L.path); rx(bytes(msg('d', L.path, clone(get(L.path))))); }
      if (!fz || !fz.has(L)) continue;
      const was = fz.get(L), now = get(L.path);
      try {
        if (L.ev === 'value'){ if (JSON.stringify(was) !== JSON.stringify(now == null ? null : now)) L.cb(snap(L.path, now)); continue; }
        const a = was && typeof was === 'object' ? was : {}, b = now && typeof now === 'object' ? now : {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])){
          const cp = L.path + '/' + k;
          if (!(k in b)){ if (L.ev === 'child_removed') L.cb(snap(cp, a[k])); }
          else if (!(k in a)){ if (L.ev === 'child_added') L.cb(snap(cp, b[k])); }
          else if (L.ev === 'child_changed' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) L.cb(snap(cp, b[k]));
        }
      } catch(e){ console.error('[MOCK] listener', e); }
    }
    for (const cb of infoL) try { cb(snap('.info/connected', true)); } catch(e){ console.error('[MOCK]', e); }
  }
  function apply(writes, remote, wire){
    if (remote && !online){ for (const [p, v] of writes) setRaw(p, v); return; }
    const paths = writes.map(w => w[0]);
    const rel = listeners.filter(L => paths.some(p => related(p, L.path)));
    const before = rel.map(L => clone(get(L.path)));
    for (const [p, v] of writes) setRaw(p, v);
    if (remote && rel.length && wire) rx(bytes(wire));
    rel.forEach((L, i) => {
      if (!listeners.includes(L)) return;
      const was = before[i], now = get(L.path);
      try {
        if (L.ev === 'value'){ if (JSON.stringify(was) !== JSON.stringify(now == null ? null : now)) L.cb(snap(L.path, now)); return; }
        const a = was && typeof was === 'object' ? was : {}, b = now && typeof now === 'object' ? now : {};
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])){
          const cp = L.path + '/' + k;
          if (!(k in b)){ if (L.ev === 'child_removed') L.cb(snap(cp, a[k])); }
          else if (!(k in a)){ if (L.ev === 'child_added') L.cb(snap(cp, b[k])); }
          else if (L.ev === 'child_changed' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) L.cb(snap(cp, b[k]));
        }
      } catch(e){ console.error('[MOCK] listener', e); }
    });
  }
  function write(base, data, kind){
    base = split(base).join('/');
    let writes;
    if (kind === 'update') writes = Object.keys(data).map(k => [split(base + '/' + k).join('/'), data[k] == null ? null : resolve(data[k])]);
    else writes = [[base, data == null ? null : resolve(data)]];
    const wire = msg(kind === 'update' ? 'm' : 'd', base, kind === 'update' ? Object.fromEntries(writes.map(([p, v]) => [p.slice(base.length).replace(/^\//, ''), v])) : writes[0][1]);
    if (!online){                                       // 断开时：本地先生效，连上再发
      apply(writes, false); outQ.push({writes, wire});
      if (frozen) for (const L of frozen.keys()) if (writes.some(w => related(w[0], L.path))) frozen.set(L, clone(get(L.path)));
      return;
    }
    tx(bytes(wire)); const t = T(); t.rx += ACK; t.rxN++;
    apply(writes, false);
    if (bc) bc.postMessage({op:'w', writes, wire});
  }
  if (bc){
    bc.onmessage = e => {
      const m = e.data || {};
      if (m.op === 'w') apply(m.writes, true, m.wire);
      else if (m.op === 'hello') bc.postMessage({op:'dump', root:clone(root)});
      else if (m.op === 'dump'){
        const w = [];
        for (const k1 in m.root || {}) for (const k2 in m.root[k1] || {}) if (get(k1 + '/' + k2) == null) w.push([k1 + '/' + k2, m.root[k1][k2]]);
        if (w.length) apply(w, true, null);
      }
    };
    bc.postMessage({op:'hello'});
  }
  const info = p => (p === '.info/connected' ? online : p === '.info/serverTimeOffset' ? 0 : undefined);
  function ref(path){
    path = split(path).join('/');
    const oldDeny = v => OLD && ((/^presence\//.test(path) && v && ['fx', 'ride', 'rs', 'duel', 'ds', 'dnd'].some(k => k in v)) || newRule(path));
    const r = {
      key:split(path).pop() || null,
      child:p => ref(path + '/' + p),
      set:v => { if (oldDeny(v)) return denied(); write(path, v, 'set'); return Promise.resolve(); },
      update:o => {
        if (OLD && (newRule(path) || Object.keys(o).some(k => newRule(path ? path + '/' + k : k)))) return denied();
        write(path, o, 'update'); return Promise.resolve();
      },
      remove:() => { if (OLD && newRule(path)) return denied(); write(path, null, 'set'); return Promise.resolve(); },
      push(v){ const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); const c = ref(path + '/' + key); const pr = v === undefined ? Promise.resolve() : c.set(v); return Object.assign(pr, {key, ref:c}); },
      onDisconnect:() => ({
        remove:() => { if (OLD && newRule(path)) return denied(); disc.set(path, 1); return Promise.resolve(); },
        update:o => { const was = disc.get(path); disc.set(path, {u:Object.assign({}, was && was.u, o)}); return Promise.resolve(); },
        cancel:() => { disc.delete(path); return Promise.resolve(); }
      }),
      once(){ const i = info(path), v = i !== undefined ? i : get(path); if (i === undefined) rx(bytes(msg('d', path, v == null ? null : v))); return Promise.resolve(snap(path, v)); },
      on(ev, cb, cancel){
        if (OLD && newRule(path)){ setTimeout(() => { if (cancel) cancel(Object.assign(new Error('PERMISSION_DENIED'), {code:'PERMISSION_DENIED'})); }, 0); return cb; }
        if (fstDeny(path)){ setTimeout(() => { if (cancel) cancel(Object.assign(new Error('PERMISSION_DENIED'), {code:'PERMISSION_DENIED'})); }, 0); return cb; }
        const i = info(path);
        if (i === undefined && !listeners.some(L => L.path === path)) rx(bytes(msg('d', path, clone(get(path)))));   // 开始监听：服务器先推一次整份
        if (ev === 'value'){ if (i === undefined) listeners.push({path, ev, cb}); else if (path === '.info/connected') infoL.push(cb); setTimeout(() => cb(snap(path, i !== undefined ? i : get(path))), 0); return cb; }
        listeners.push({path, ev, cb});
        if (ev === 'child_added'){ setTimeout(() => { const o = get(path) || {}; Object.keys(o).forEach(k => { if (get(path + '/' + k) != null && listeners.some(L => L.cb === cb)) cb(snap(path + '/' + k, o[k])); }); }, 0); }
        return cb;
      },
      off(ev, cb){ for (let i = listeners.length - 1; i >= 0; i--){ const L = listeners[i]; if (L.path === path && (!ev || L.ev === ev) && (!cb || L.cb === cb)) listeners.splice(i, 1); } },
      transaction(fn){
        const cur = clone(get(path)), nv = fn(cur);
        if (nv === undefined) return Promise.resolve({committed:false, snapshot:snap(path, cur)});
        write(path, nv, 'set'); return Promise.resolve({committed:true, snapshot:snap(path, get(path))});
      },
      orderByChild:k => ({limitToLast:n => ({once:() => {
        const o = get(path) || {}, ks = Object.keys(o).sort((a, b) => (o[a][k] || 0) - (o[b][k] || 0)).slice(-n);
        rx(bytes(msg('d', path, Object.fromEntries(ks.map(x => [x, o[x]])))));
        return Promise.resolve(snap(path, o, ks));
      }})})
    };
    return r;
  }
  const user = {uid:'mock-' + P, isAnonymous:true, providerData:[]};
  const app = {auth:() => ({signInAnonymously:() => Promise.resolve({user}), currentUser:user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 0); return () => {}; }, signOut:() => Promise.resolve()}), database:() => ({ref, goOffline, goOnline})};
  window.firebase = {apps:[], initializeApp(){ this.apps.push(app); return app; }, app:() => app, auth:() => app.auth(), database:Object.assign(() => app.database(), {ServerValue:{TIMESTAMP:TS}})};
  /* put / update：给 test/social-bots.js、test/crowd-bots.js 的假玩家直接写；listeners 给测试看订阅了哪些路径 */
  /* 假玩家的写入对这个标签页来说是「别人写的」：监听着就算下载 */
  const put = (path, v) => { const w = [[split(path).join('/'), v == null ? null : resolve(v)]], wire = msg('d', w[0][0], w[0][1]); apply(w, true, wire); if (bc) bc.postMessage({op:'w', writes:w, wire}); };
  const update = (base, o) => { const w = Object.keys(o).map(k => [split(base + '/' + k).join('/'), o[k] == null ? null : resolve(o[k])]), wire = msg('m', split(base).join('/'), resolve(o)); apply(w, true, wire); if (bc) bc.postMessage({op:'w', writes:w, wire}); };
  /* botDisc：同一个标签页里的假玩家「下线时删掉」的路径。和本页的 disc 分开：本页 goOffline 不会把假玩家也删掉，关页面时才删 */
  const botDisc = new Map();
  window.__mock = {get, put, update, root, uid:user.uid, ref, listeners, disc, botDisc, get online(){ return online; }, goOffline, goOnline};
  const bye = () => { const w = discWrites(disc).concat(discWrites(botDisc)); disc.clear(); botDisc.clear(); if (w.length){ apply(w, false); if (bc) bc.postMessage({op:'w', writes:w, wire:null}); } };
  window.addEventListener('pagehide', bye); window.addEventListener('beforeunload', bye);
})();
