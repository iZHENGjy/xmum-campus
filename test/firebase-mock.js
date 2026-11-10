/* 仅供本地测试：一个内存里的假 firebase（compat API 的一小部分），index.html 不会加载它。
 * 由 test/net-mock.html 注入到 js/net.js 之前。会造出几个假玩家并跑一遍 submit/top。 */
'use strict';
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.has('cdnfail')){ window.XMUM_FIREBASE = {apiKey:'x', databaseURL:'https://example.invalid', projectId:'x'}; return; }
  window.XMUM_FIREBASE = {apiKey:'mock', projectId:'mock', databaseURL:'https://mock.invalid'};
  const log = (...a) => console.log('[MOCK]', ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)));
  const TS = {'.sv':'timestamp'};
  const root = {};
  const listeners = [];                       // {path, ev, cb}
  const split = p => String(p).split('/').filter(Boolean);
  const get = p => split(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), root);
  const resolve = v => (v && v['.sv'] === 'timestamp') ? Date.now() : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v);
  const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
  const snap = (key, v, order) => ({key, val:() => clone(v), exists:() => v != null,
    forEach(cb){ if (!v || typeof v !== 'object') return; const ks = order || Object.keys(v); for (const k of ks) if (cb(snap(k, v[k]))) return true; }});
  function put(path, v){
    const ks = split(path), last = ks.pop(); let o = root;
    for (const k of ks){ if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    const parent = ks.join('/'), existed = o[last] != null;
    if (v == null) delete o[last]; else o[last] = resolve(v);
    for (const L of listeners){
      if (L.path === parent){
        if (v == null && existed && L.ev === 'child_removed') L.cb(snap(last, null));
        else if (v != null && L.ev === (existed ? 'child_changed' : 'child_added')) L.cb(snap(last, o[last]));
      }
    }
  }
  function ref(path){
    path = split(path).join('/');
    const r = {
      key:split(path).pop(),
      child:p => ref(path + '/' + p),
      set:v => { put(path, v); return Promise.resolve(); },
      remove:() => { put(path, null); return Promise.resolve(); },
      onDisconnect:() => ({remove:() => Promise.resolve()}),
      once(){ return Promise.resolve(snap(r.key, path === '.info/connected' ? true : path === '.info/serverTimeOffset' ? 0 : get(path))); },
      on(ev, cb){
        if (ev === 'value'){ setTimeout(() => cb(snap(r.key, path === '.info/connected' ? true : path === '.info/serverTimeOffset' ? 0 : get(path))), 0); return cb; }
        listeners.push({path, ev, cb});
        if (ev === 'child_added'){ const o = get(path) || {}; setTimeout(() => Object.keys(o).forEach(k => cb(snap(k, o[k]))), 0); }
        return cb;
      },
      transaction(fn){
        const cur = clone(get(path)), nv = fn(cur);
        if (nv === undefined) return Promise.resolve({committed:false, snapshot:snap(r.key, cur)});
        put(path, nv); return Promise.resolve({committed:true, snapshot:snap(r.key, get(path))});
      },
      orderByChild:k => ({limitToLast:n => ({once:() => {
        const o = get(path) || {}, ks = Object.keys(o).sort((a, b) => (o[a][k] || 0) - (o[b][k] || 0)).slice(-n);
        return Promise.resolve(snap(r.key, o, ks));
      }})})
    };
    return r;
  }
  const user = {uid:'me-local-uid', isAnonymous:true, providerData:[]};
  const app = {auth:() => ({signInAnonymously:() => Promise.resolve({user}), currentUser:user, onAuthStateChanged(cb){ setTimeout(() => cb(user), 0); return () => {}; }}), database:() => ({ref})};
  window.__mockGet = get; window.__mockPut = put;
  window.firebase = {apps:[], initializeApp(){ this.apps.push(app); return app; }, app:() => app, auth:() => app.auth(), database:Object.assign(() => app.database(), {ServerValue:{TIMESTAMP:TS}})};

  /* ---- 种子数据 ---- */
  const now = Date.now();
  put('boards/hole/u1', {name:'阿明', value:61.2, ts:now}); put('boards/hole/u2', {name:'小红', value:33.4, ts:now}); put('boards/hole/u3', {name:'DDL战士', value:88.8, ts:now});
  put('boards/rich/u1', {name:'阿明', value:999.5, ts:now});
  put('presence/old', {name:'掉线的', mode:'naiwa', x:110, z:190, y:0, h:0, color:'#00ff00', t:now - 120000});
  put('looks/bot1', 'pink,santa,santahat'); put('looks/bot2', 'xmumblue,mblue,d_flames');   /* 奶娃衣橱：别人的穿戴和喷漆 */
  put('presence/bot3', {name:'看风景的', mode:'orbit', x:0, z:0, y:0, h:0, color:'#f1c84b', t:TS});
  let T = 0;
  setInterval(() => {
    T += .2;
    put('presence/bot1', {name:'小明', mode:'naiwa', x:106 + Math.sin(T * .8) * 3, z:194 + Math.cos(T * .8) * 3, y:0, h:T * .8 + Math.PI / 2, color:'#f1c84b', t:TS});
    put('presence/bot2', {name:'阿华 911', mode:'naiwa', x:118 + Math.sin(T * .3) * 2, z:190, y:0, h:-Math.PI / 2, car:'p911', color:'#d62828', t:TS});
  }, 200);

  /* ---- 跑一遍接口 ---- */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  window.addEventListener('load', async () => {
    await wait(300);
    document.querySelector('#m-naiwa').click();
    const ok = await XNet.ready; log('ready', ok, 'online', XNet.online, 'uid', XNet.uid);
    log('top hole', await XNet.top('hole'));
    log('submit hole 42.57 ->', await XNet.submit('hole', 42.57));
    log('submit hole 10 (worse) ->', await XNet.submit('hole', 10));
    log('submit bogus board ->', await XNet.submit('nope', 5));
    HS.on = true; await wait(500);
    hole.score = HS.total * .5; HS.t = 0; HS.on = false; await wait(600);
    log('after round, top hole', (await XNet.top('hole', 3)).map(e => e.name + ':' + e.value));
    money = 1234.567; stunt.total = 5000; await wait(1300);
    log('top rich', (await XNet.top('rich')).map(e => e.name + ':' + e.value), 'top stunt', (await XNet.top('stunt')).map(e => e.name + ':' + e.value));
    log('my presence', get('presence/' + user.uid));
    log('playersOnline', XNet.playersOnline, 'pill', document.getElementById('online') && document.getElementById('online').textContent,
      'ghost labels', [...document.querySelectorAll('[data-net]')].map(e => e.textContent + (e.style.visibility === 'hidden' ? '(hidden)' : '')));
  });
})();
