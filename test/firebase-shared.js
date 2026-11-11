/* 仅供本地测试：一个内存里的假 firebase，同一个浏览器里开的几个标签页共用一份数据（BroadcastChannel），
 * 所以两个窗口能互相看到、互发邀请，测 js/96-social.js 的搭车和挑战。不检查数据库规则。
 * 由 test/social.html 注入，代替 js/firebase-config.js。每个标签页的 uid 是 'mock-' + ?p= 的值。
 * ?oldrules：模拟还没发布新规则的数据库（拒绝带互动字段的 presence）。 */
'use strict';
(() => {
  const Q = new URLSearchParams(location.search);
  const P = (Q.get('p') || 'a').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'a';
  window.XMUM_FIREBASE = {apiKey:'mock', projectId:'mock', databaseURL:'https://mock.invalid'};
  const TS = {'.sv':'timestamp'};
  const root = {}, listeners = [], disc = new Set();
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('xmum-social-mock') : null;
  const split = p => String(p || '').split('/').filter(Boolean);
  const get = p => split(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), root);
  const resolve = v => (v && v['.sv'] === 'timestamp') ? Date.now() : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v);
  const clone = v => v === undefined || v === null ? null : JSON.parse(JSON.stringify(v));
  const under = (a, b) => b.length < a.length && b.every((k, i) => k === a[i]);   // b is a strict prefix of a
  function snap(path, v, order){
    const ks = split(path);
    return {key:ks[ks.length - 1] || null, ref:ref(path), val:() => clone(v), exists:() => v != null,
      forEach(cb){ if (!v || typeof v !== 'object') return; for (const k of order || Object.keys(v)) if (cb(snap(path + '/' + k, v[k]))) return true; }};
  }
  function put(path, v, remote){
    const ks = split(path); if (!ks.length) return;
    const aff = [];
    for (const L of listeners){ const lk = split(L.path); if (L.ev !== 'value' && under(ks, lk)){ const ck = ks[lk.length]; aff.push({L, ck, had:get(lk.concat(ck).join('/')) != null}); } }
    const last = ks.pop(); let o = root;
    for (const k of ks){ if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    if (v == null) delete o[last]; else o[last] = resolve(v);
    if (!remote && bc) bc.postMessage({op:'put', path, v:v == null ? null : clone(o[last])});
    for (const a of aff){
      const cp = a.L.path + '/' + a.ck, now = get(cp), ev = a.L.ev;
      try {
        if (now == null){ if (a.had && ev === 'child_removed') a.L.cb(snap(cp, null)); }
        else if (!a.had){ if (ev === 'child_added') a.L.cb(snap(cp, now)); }
        else if (ev === 'child_changed') a.L.cb(snap(cp, now));
      } catch(e){ console.error('[MOCK] listener', e); }
    }
  }
  if (bc){
    bc.onmessage = e => {
      const m = e.data || {};
      if (m.op === 'put') put(m.path, m.v, true);
      else if (m.op === 'hello') bc.postMessage({op:'dump', root:clone(root)});
      else if (m.op === 'dump') for (const k1 in m.root || {}) for (const k2 in m.root[k1] || {}) if (get(k1 + '/' + k2) == null) put(k1 + '/' + k2, m.root[k1][k2], true);
    };
    bc.postMessage({op:'hello'});
  }
  const info = p => (p === '.info/connected' ? true : p === '.info/serverTimeOffset' ? 0 : undefined);
  function ref(path){
    path = split(path).join('/');
    const r = {
      key:split(path).pop() || null,
      child:p => ref(path + '/' + p),
      set:v => {
        /* ?oldrules：像还没发布新规则的数据库一样，拒绝带互动字段的 presence */
        if (Q.has('oldrules') && /^presence\//.test(path) && v && ['fx', 'ride', 'rs', 'duel', 'ds', 'dnd'].some(k => k in v)) return Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), {code:'PERMISSION_DENIED'}));
        put(path, v); return Promise.resolve();
      },
      update:o => { for (const k in o) put(path ? path + '/' + k : k, o[k]); return Promise.resolve(); },
      remove:() => { put(path, null); return Promise.resolve(); },
      push(v){ const key = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); const c = ref(path + '/' + key); const pr = v === undefined ? Promise.resolve() : c.set(v); return Object.assign(pr, {key, ref:c}); },
      onDisconnect:() => ({remove:() => { disc.add(path); return Promise.resolve(); }, cancel:() => { disc.delete(path); return Promise.resolve(); }}),
      once(){ const i = info(path); return Promise.resolve(snap(path, i !== undefined ? i : get(path))); },
      on(ev, cb){
        if (ev === 'value'){ const i = info(path); setTimeout(() => cb(snap(path, i !== undefined ? i : get(path))), 0); return cb; }
        listeners.push({path, ev, cb});
        if (ev === 'child_added'){ const o = get(path) || {}; setTimeout(() => Object.keys(o).forEach(k => { if (get(path + '/' + k) != null) cb(snap(path + '/' + k, o[k])); }), 0); }
        return cb;
      },
      off(){ for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === path) listeners.splice(i, 1); },
      transaction(fn){
        const cur = clone(get(path)), nv = fn(cur);
        if (nv === undefined) return Promise.resolve({committed:false, snapshot:snap(path, cur)});
        put(path, nv); return Promise.resolve({committed:true, snapshot:snap(path, get(path))});
      },
      orderByChild:k => ({limitToLast:n => ({once:() => {
        const o = get(path) || {}, ks = Object.keys(o).sort((a, b) => (o[a][k] || 0) - (o[b][k] || 0)).slice(-n);
        return Promise.resolve(snap(path, o, ks));
      }})})
    };
    return r;
  }
  const user = {uid:'mock-' + P, isAnonymous:true, providerData:[]};
  const app = {auth:() => ({signInAnonymously:() => Promise.resolve({user}), currentUser:user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 0); return () => {}; }, signOut:() => Promise.resolve()}), database:() => ({ref})};
  window.firebase = {apps:[], initializeApp(){ this.apps.push(app); return app; }, app:() => app, auth:() => app.auth(), database:Object.assign(() => app.database(), {ServerValue:{TIMESTAMP:TS}})};
  window.__mock = {get, put, root, uid:user.uid, ref};
  const bye = () => { for (const p of disc) put(p, null); disc.clear(); };
  window.addEventListener('pagehide', bye); window.addEventListener('beforeunload', bye);
})();
