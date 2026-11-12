/* 小游戏 · 麦当当打工配餐（校门外的麦当当，KIP Sentral 南头）
 * 奶娃在柜台后面打工：客人的小票上写着汉堡从下往上的每一层（面包 → 肉饼 → 芝士 → 生菜 → 酱 → 面包），按顺序点食材叠起来，
 *   盖上面包就包好了；再按小票配薯条（小 / 中 / 大）、饮料（加冰还是走冰）、儿童餐的玩具，最后「打包交餐」。
 * 得分：全对才有连击和小费（越快越多），错一样客人就不高兴，汉堡做错还算差评。放错一层可以点「重做」从头来。
 * 菜单是谐音：芝心堡、辣辣鸡腿堡（ayam goreng 风味）、双层芝心堡、椰浆饭堡（本地限定，鸡排 + 煎蛋 + 参巴）、参巴蛋牛堡、巨无坝。
 * 三个模式，各有排行榜：
 *   经典 classic：90 秒，两个客人轮流来，做得越多越好。
 *   午高峰 rush：12:00 到 14:00（150 秒），客人越来越多、越来越急，最多四个一起等；走掉或汉堡做错算差评，三个差评下班。
 *   得来速 drive：车一辆一辆开到窗口，每辆车都在计时，后面那辆的单子先亮出来；12 辆车，三个差评下班。
 * 操作：手机点下面两排按钮（上排食材，下排薯条、饮料、冰、玩具、打包交餐），点小票换一单；
 *   电脑点鼠标，或者数字 1–8 放食材、0 / 退格重做、Q W E 薯条小中大、A S D 饮料、F 冰、G 玩具、空格打包交餐、Tab 换小票。
 * 入口：麦当当正门（玻璃门那一面）外的黄圈按 F「打工配餐」（文件末尾，用 XMini.startAt 直接进），B1 游戏厅里也有一台。
 * 示范：纯点按钮的小游戏、ctx.ui 里的小票和按钮、按屏幕上留出来的空当自动摆镜头、ctx.screen 摆对话气泡。
 */
'use strict';
XMini.register((() => {
  const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  const Y = .975, BZ = .08, FRY = [-.55, .04], CUP = [.55, .04], TOY = [-.34, .36], FOV = 50;
  const ING = {
    bun:{n:'面包', s:'包', e:'🍞', c:'#e8a85a', t:'#4a2a08', k:'1'},
    beef:{n:'牛肉饼', s:'牛', e:'🥩', c:'#6b3a22', t:'#fff', k:'2', h:.046},
    chick:{n:'辣鸡排', s:'鸡', e:'🍗', c:'#d9822b', t:'#fff', k:'3', h:.056},
    cheese:{n:'芝士', s:'芝', e:'🧀', c:'#ffc93c', t:'#4a3200', k:'4', h:.013},
    lett:{n:'生菜', s:'菜', e:'🥬', c:'#6cc04a', t:'#0f3306', k:'5', h:.02},
    sauce:{n:'酱', s:'酱', e:'🥫', c:'#f1dfa8', t:'#4a3608', k:'6', h:.012},
    egg:{n:'煎蛋', s:'蛋', e:'🍳', c:'#fff6dd', t:'#6a4a00', k:'7', h:.018},
    sambal:{n:'参巴', s:'辣', e:'🌶️', c:'#d23a1e', t:'#fff', k:'8', h:.015}
  };
  const ING_K = Object.keys(ING), BUN_B = .05, BUN_T = .1;
  const BURGERS = [
    {id:'cheese', n:'芝心堡', L:['bun', 'beef', 'cheese', 'sauce', 'bun'], lv:0, pts:30},
    {id:'ayam', n:'辣辣鸡腿堡', L:['bun', 'chick', 'lett', 'sauce', 'bun'], lv:0, pts:32},
    {id:'double', n:'双层芝心堡', L:['bun', 'beef', 'cheese', 'beef', 'cheese', 'bun'], lv:1, pts:40},
    {id:'nasi', n:'椰浆饭堡', L:['bun', 'chick', 'egg', 'lett', 'sambal', 'bun'], lv:1, pts:44, local:1},
    {id:'sambal', n:'参巴蛋牛堡', L:['bun', 'beef', 'egg', 'sambal', 'lett', 'bun'], lv:2, pts:46, local:1},
    {id:'big', n:'巨无坝', L:['bun', 'beef', 'cheese', 'lett', 'sauce', 'beef', 'lett', 'bun'], lv:2, pts:55}
  ];
  const FRIES = {S:{n:'小', sc:.8, k:'Q'}, M:{n:'中', sc:1, k:'W'}, L:{n:'大', sc:1.2, k:'E'}};
  const DRINKS = {cola:{n:'可乐', e:'🥤', c:'#4a2416', k:'A'}, orange:{n:'橙汁', e:'🍊', c:'#ff9a1f', k:'S'}, teh:{n:'拉茶', e:'☕', c:'#c8935a', k:'D'}};
  /* customers: name, shirt, skin, tudung colour (0 = none) */
  const PEOPLE = [['Ahmad', '#4aa3ff', '#c58c5c', 0], ['Siti', '#ff8fb1', '#d9a06b', '#c2185b'], ['Mei Ling', '#ffc93c', '#f1cfa8', 0], ['Ravi', '#58b368', '#8a5a3a', 0],
    ['Aunty Lim', '#b48be0', '#f0c9a0', 0], ['Uncle Raju', '#e2574c', '#7a4a2a', 0], ['Nurul', '#3fd6c6', '#d9a06b', '#2a4d8f'], ['Jason', '#7c8cff', '#f1cfa8', 0],
    ['Farah', '#ff8a3d', '#c58c5c', '#6a1b9a'], ['Kumar', '#2f6fb0', '#6e4428', 0], ['阿明', '#4fd18b', '#f1cfa8', 0], ['Aisyah', '#f4f2ec', '#d9a06b', '#00897b'],
    ['学长', '#1f2a44', '#f1cfa8', 0], ['Pak Cik Hassan', '#8d6e63', '#a8693f', 0], ['代购小哥', '#ff5fa2', '#f1cfa8', 0], ['Kak Ros', '#e0a030', '#c58c5c', '#8e2430']];
  const KIDS = [['Adik', '#ff5fa2', '#d9a06b', 0], ['小宝', '#3fd6c6', '#f1cfa8', 0], ['Aiman', '#ffc93c', '#c58c5c', 0]];
  const CAR_C = ['#c8102e', '#2d5d8a', '#f4f2ec', '#1d1f24', '#6d4c8f', '#8a9096', '#2f8f5b', '#e0a030'];
  const HI = ['Boss，', 'Bang，', 'Kak，', 'Hello，', '', ''], TAIL = ['，cepat sikit ya', '，terima kasih', ' 一个', ' lah', '', ''];
  const YUM = ['Sedap! 😋', 'Terbaik! 👍', 'Thank you boss!', '好快！😋', 'Mantap! 🔥'], MEH = ['Aiyo，不对啦 😠', 'Salah lah! 😤', '我要的不是这个 😠'];
  const GONE = ['Lambat gila! 😤', '等太久了，走了 😠', 'Tak jadi lah 😤'];
  const MODES = [
    {id:'classic', name:'经典', T:90, maxq:2, strikes:0, medals:[3000, 1500, 500], rw:s => Math.min(40, 3 + s / 100), sky:'#2b1d16',
      desc:'90 秒普通班，做得越多越好',
      intro:'90 秒。看小票，从下往上点食材叠汉堡（最后一层面包盖上就包好了），再配薯条大小、饮料（加冰还是走冰）、儿童餐的玩具，点「打包交餐」。全对有连击和小费，越快越多。'},
    {id:'rush', name:'午高峰', T:150, maxq:4, strikes:3, medals:[3800, 2000, 700], rw:s => Math.min(60, 3 + s / 70), sky:'#2b1d16',
      desc:'客人越来越多，三个差评就下班',
      intro:'午高峰 12:00 到 14:00（150 秒）：客人越来越多、越来越急，最多四个人一起等，点小票换着做。客人等太久走掉、汉堡做错都算差评，三个差评店长就让你下班。'},
    {id:'drive', name:'得来速', N:12, maxq:1, strikes:3, medals:[1400, 1000, 500], rw:s => Math.min(25, 3 + s / 60), sky:'#8fbfe4',
      desc:'窗口外的车一辆一辆来，每辆都在计时',
      intro:'得来速窗口：车一辆一辆开到窗口，每辆都在计时，后面那辆的单子会先亮出来，可以提前做。一共 12 辆车，超时开走或者汉堡做错算差评，三个差评就下班。越快小费越多。'}
  ];
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
  const pick = (r, a) => a[(r() * a.length) | 0];
  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const _v = new THREE.Vector3(), camS = new THREE.PerspectiveCamera(FOV, 1, .05, 100);
  let S = null;

  /* ---------- styles (once) ---------- */
  function css(){
    if (document.getElementById('mcdCss')) return;
    const st = document.createElement('style'); st.id = 'mcdCss'; st.textContent = `
#mcdTk{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--safe-t) + 64px);display:flex;gap:6px;width:min(860px,calc(100% - 12px));align-items:flex-start;font-size:12.5px;font-family:${FONT}}
.mcd-tk{flex:1 1 0;min-width:0;background:var(--panel-solid);color:var(--ink);border-radius:10px;padding:6px 8px 7px;border:2px solid transparent;box-shadow:0 2px 8px rgba(0,0,0,.28);
  cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-sizing:border-box;animation:mcdIn .25s ease-out}
.mcd-tk.sel{border-color:#ffc72c;flex-grow:1.7}
.mcd-tk.next{opacity:.72;cursor:default;flex-grow:1}
.mcd-tk.next .mcd-tk-p{visibility:hidden}
.mcd-tk-h{display:flex;align-items:baseline;gap:5px;white-space:nowrap;overflow:hidden}
.mcd-tk-h i{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;align-self:center}
.mcd-tk-h b{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;flex:none;max-width:60%}
.mcd-tk-h em{font-style:normal;color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis}
.mcd-tk-m{color:#e2574c;font-weight:800;font-size:11.5px;margin-top:2px}
.mcd-tk-l,.mcd-tk-s{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
.mcd-tk-l span{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:23px;padding:0 3px;border-radius:6px;background:var(--bg);color:var(--fg);
  font-weight:800;font-size:13px;box-sizing:border-box;border:2px solid rgba(0,0,0,.18)}
.mcd-tk-s span{display:inline-flex;align-items:center;height:21px;padding:0 6px;border-radius:6px;background:var(--chip);font-weight:700;font-size:12px;border:2px solid transparent;box-sizing:border-box}
.mcd-tk.sel .mcd-tk-l span.now{border-color:var(--ink);transform:translateY(-2px);box-shadow:0 2px 0 var(--ink)}
.mcd-tk .ok{opacity:.4}
.mcd-tk-s span.ok{opacity:1;background:#2fae5b;color:#fff}
.mcd-tk .bad{background:#e2574c!important;color:#fff!important;border-color:#e2574c!important;opacity:1}
.mcd-tk-p{height:5px;border-radius:3px;background:var(--chip);margin-top:6px;overflow:hidden}
.mcd-tk-p i{display:block;height:100%;width:100%;background:#4fd18b;transform-origin:left center}
.mcd-tk.out{animation:mcdOut .3s ease-in forwards}
@keyframes mcdIn{from{transform:translateY(-12px);opacity:0}}
@keyframes mcdOut{to{transform:translateY(-14px);opacity:0}}
#mcdPad{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--safe-b) + 8px);width:min(900px,calc(100% - 12px));display:flex;flex-direction:column;gap:6px;font-family:${FONT}}
.mcd-row{display:grid;grid-template-columns:repeat(9,1fr);gap:5px}
.mcd-b{position:relative;min-height:54px;min-width:0;border-radius:11px;border:0;border-bottom:4px solid rgba(0,0,0,.28);background:var(--bg);color:var(--fg);font:inherit;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:3px 2px;cursor:pointer;touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;box-shadow:0 2px 6px rgba(0,0,0,.25)}
.mcd-b i{font-style:normal;font-size:21px;line-height:1}
.mcd-b b{font-size:12.5px;line-height:1.1;white-space:nowrap;font-weight:800}
.mcd-b kbd{position:absolute;top:3px;left:5px;font:700 10px/1 ${FONT};opacity:.65;background:none;border:0;padding:0;color:inherit}
.mcd-b.hit,.mcd-b:active{transform:translateY(2px);border-bottom-width:2px;filter:brightness(1.12)}
.mcd-b[aria-pressed="true"]{outline:3px solid #ffc72c;outline-offset:-3px}
.mcd-b.go{background:#ffc72c;color:#5a1a0a}
.mcd-b.trash{background:#4d4852;color:#fff}
.mcd-b.hint{animation:mcdHint .75s ease-in-out infinite}
@keyframes mcdHint{50%{box-shadow:0 0 0 4px #fff,0 0 14px 4px #ffc72c}}
.mcd-side .mcd-b:not(.go){background:#f4efe6;color:#3a2a1a}
#mcdHint{position:fixed;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(20,16,12,.82);color:#fff;font:700 13px/1.4 ${FONT};
  white-space:nowrap;pointer-events:none!important;transition:opacity .2s;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}
#mcdHint.off{opacity:0}
.mcd-bub{position:fixed;left:0;top:0;transform:translate(-50%,-100%);pointer-events:none!important;background:#fff;color:#222;padding:4px 9px;border-radius:12px;
  font:700 13px/1.35 ${FONT};white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.mcd-bub::after{content:'';position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#fff}
.mcd-bub.bad{background:#ffe1dc}
body.mcd-on #acts,body.mcd-on #joy,body.mcd-on #prompt{display:none!important}
body.mg-card #mcdPad,body.mg-card #mcdTk,body.mg-card #mcdHint,body.mg-card .mcd-bub{visibility:hidden}
body.mcd-touch .mcd-b kbd{display:none}
@media (max-aspect-ratio:1/1){
  .mcd-row{grid-template-columns:repeat(5,1fr)}
  .mcd-b.go{grid-column:span 2}
  .mcd-tk:not(.sel):not(.next) .mcd-tk-l,.mcd-tk:not(.sel):not(.next) .mcd-tk-s,.mcd-tk:not(.sel) .mcd-tk-m{display:none}
  .mcd-tk:not(.sel) .mcd-tk-h{flex-direction:column;align-items:flex-start;gap:1px}
  .mcd-tk:not(.sel) .mcd-tk-h b{max-width:100%}
  .mcd-tk:not(.sel) .mcd-tk-h i{display:none}
}
@media (max-height:440px) and (min-aspect-ratio:1/1){
  .mcd-b{min-height:48px}
  .mcd-b i{font-size:18px}
  .mcd-tk{padding:4px 7px 5px}
  .mcd-tk-l span{min-width:20px;height:20px;font-size:12px}
  .mcd-tk-l,.mcd-tk-s{margin-top:3px}
  .mcd-tk-p{margin-top:4px}
}
@media (max-height:500px) and (min-aspect-ratio:1/1){
  #mcdTk{left:calc(env(safe-area-inset-left,0px) + 6px);transform:none;flex-direction:column;width:min(240px,32vw);align-items:stretch}
  .mcd-tk{flex:none}
  .mcd-tk.out{animation:none;display:none}
  .mcd-tk:not(.sel) .mcd-tk-l,.mcd-tk:not(.sel) .mcd-tk-s,.mcd-tk:not(.sel) .mcd-tk-m{display:none}
  .mcd-tk:not(.sel) .mcd-tk-p{margin-top:3px}
}
@media (prefers-reduced-motion: reduce){ .mcd-tk,.mcd-tk.out,.mcd-b.hint{animation:none} }`;
    document.head.appendChild(st);
  }

  /* ---------- orders ---------- */
  function makeOrder(lv, drive, first){
    const r = Math.random, pool = BURGERS.filter(b => b.lv <= lv && !(first && b.lv > 0)), mods = [];
    let b = first ? BURGERS[0] : pick(r, pool), L = b.L.slice(), kid = !first && lv >= 1 && r() < .13;
    if (kid) b = BURGERS[0], L = b.L.slice();
    if (!kid && !first && lv >= 1 && r() < .32){
      const opts = [];
      if (L.includes('lett')) opts.push(['不要生菜', () => { L = L.filter(x => x !== 'lett'); }]);
      if (L.includes('sauce')) opts.push(['不要酱', () => { L = L.filter(x => x !== 'sauce'); }]);
      if (!L.includes('cheese')) opts.push(['加芝士', () => { const i = L.findIndex(x => x === 'beef' || x === 'chick'); L.splice(i + 1, 0, 'cheese'); }]);
      if (lv >= 2 && !L.includes('sambal')) opts.push(['加参巴', () => { L.splice(L.length - 1, 0, 'sambal'); }]);
      if (opts.length){ const o = pick(r, opts); o[1](); mods.push(o[0]); }
    }
    const pf = first ? 0 : drive ? .75 : .2 + lv * .25, pd = first ? 0 : drive ? .85 : .2 + lv * .25;
    const fries = kid ? 'S' : r() < pf ? pick(r, ['S', 'M', 'M', 'L']) : null;
    const drink = kid ? pick(r, ['orange', 'cola']) : r() < pd ? pick(r, ['cola', 'cola', 'orange', 'teh']) : null;
    const ice = kid ? false : drink ? r() < .6 : false;
    return {b, L, mods, fries, drink, ice, toy:kid, kid, name:kid ? '儿童餐' : b.n + (fries && drink ? '套餐' : '')};
  }
  const orderLine = o => pick(Math.random, HI) + o.name + (o.mods[0] ? '，' + o.mods[0] : '') + (o.drink && !o.ice ? '，走冰哦' : '') + pick(Math.random, TAIL);

  /* ---------- 3D: shared geometry and the layers ---------- */
  function geos(){
    const G = {}, up = (g, h) => g.translate(0, h / 2, 0);
    G.bunB = up(new THREE.CylinderGeometry(.16, .148, BUN_B, 20), BUN_B);
    G.bunT = new THREE.SphereGeometry(.165, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, BUN_T / .165, 1);
    G.beef = up(new THREE.CylinderGeometry(.168, .168, ING.beef.h, 18), ING.beef.h);
    G.chick = up(new THREE.CylinderGeometry(.18, .172, ING.chick.h, 9), ING.chick.h);
    G.cheese = up(new THREE.BoxGeometry(.3, ING.cheese.h, .3), ING.cheese.h).rotateY(Math.PI / 4);
    G.lett = (() => {   /* a frilly leaf: the rim of a flat disc waves up and down */
      const g = up(new THREE.CylinderGeometry(.19, .19, ING.lett.h, 28, 1), ING.lett.h), p = g.attributes.position;
      for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); if (d > .15) p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 9) * .012); }
      g.computeVertexNormals(); return g;
    })();
    G.sauce = up(new THREE.CylinderGeometry(.142, .142, ING.sauce.h, 16), ING.sauce.h);
    G.egg = up(new THREE.CylinderGeometry(.172, .172, ING.egg.h, 16), ING.egg.h);
    G.yolk = new THREE.SphereGeometry(.055, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .55, 1);
    G.sambal = up(new THREE.CylinderGeometry(.15, .15, ING.sambal.h, 16), ING.sambal.h);
    return G;
  }
  function mats(){
    const Mx = {};
    for (const k of ING_K) Mx[k] = M(ING[k].c, {roughness:k === 'cheese' || k === 'sauce' ? .45 : .8});
    Mx.bun = M('#d9933f', {roughness:.75});
    Mx.bunT = new THREE.MeshStandardMaterial({roughness:.6, map:tex(256, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b8682a'); gr.addColorStop(1, '#e3a456'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff4dc'; for (let i = 0; i < 70; i++){ const x = Math.random() * w, y = 4 + Math.random() * (h * .7); g.beginPath(); g.ellipse(x, y, 3.4, 1.8, Math.random() * 3, 0, 7); g.fill(); }
    })});
    Mx.yolk = M('#ffb62e', {roughness:.35});
    return Mx;
  }
  function addLayer(k){
    const st = S.stack, base = st.length ? st[st.length - 1].top : Y, bottom = !st.length;
    let m;
    if (k === 'bun') m = new THREE.Mesh(bottom ? S.G.bunB : S.G.bunT, bottom ? S.Mx.bun : S.Mx.bunT);
    else {
      m = new THREE.Mesh(S.G[k], S.Mx[k]);
      if (k === 'egg'){ const y = new THREE.Mesh(S.G.yolk, S.Mx.yolk); y.position.set(.03, ING.egg.h, -.02); m.add(y); }
      if (k === 'chick' || k === 'lett') m.rotation.y = Math.random() * 6.3;
    }
    const h = k === 'bun' ? (bottom ? BUN_B : BUN_T) : ING[k].h;
    m.castShadow = S.q > 0; m.position.set(0, base + .5, BZ); S.burg.add(m);
    st.push({k, m, y:base, top:base + h, t:0});
  }
  function clearStack(){ for (const l of S.stack) S.burg.remove(l.m); S.stack.length = 0; }

  /* ---------- 3D: the sides on the tray ---------- */
  function sides(R){
    const red = M('#c8102e', {roughness:.6}), yel = M('#ffc72c', {roughness:.6}), fry = M('#f6c84a', {roughness:.7});
    const F = new THREE.Group(); F.position.set(FRY[0], Y, FRY[1]); R.add(F);
    box(.17, .17, .085, red, 0, .085, 0, F); box(.172, .03, .087, yel, 0, .12, 0, F);
    const sticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .13, .02), fry, 11), m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < 11; i++){ p.set(-.065 + (i % 6) * .026, .19 + (i % 3) * .015, i < 6 ? -.012 : .014); e.set((Math.random() - .5) * .3, 0, (Math.random() - .5) * .45); q.setFromEuler(e); m4.compose(p, q, s); sticks.setMatrixAt(i, m4); }
    F.add(sticks); F.visible = false;
    const C = new THREE.Group(); C.position.set(CUP[0], Y, CUP[1]); R.add(C);
    const cupM = M('#f4f1ea', {roughness:.5});
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.078, .06, .24, 18, 1, true).translate(0, .12, 0), new THREE.MeshStandardMaterial({color:'#f4f1ea', roughness:.5, side:THREE.DoubleSide})); C.add(cup);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.0745, .067, .07, 18, 1, true).translate(0, .14, 0), M('#c8102e', {roughness:.5})); band.scale.setScalar(1.012); C.add(band);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(.06, 16).rotateX(-Math.PI / 2), cupM); bottom.position.y = .002; C.add(bottom);
    const liqM = M('#4a2416', {roughness:.25}), liq = new THREE.Mesh(new THREE.CircleGeometry(.074, 18).rotateX(-Math.PI / 2), liqM); liq.position.y = .215; C.add(liq);
    const ice = new THREE.Group(), iceM = new THREE.MeshStandardMaterial({color:'#e6f7ff', roughness:.1, transparent:true, opacity:.85}), ig = new THREE.BoxGeometry(.04, .035, .04);
    for (const [x, z, r] of [[-.025, -.015, .3], [.022, .01, .9], [-.004, .03, 1.6]]){ const c = new THREE.Mesh(ig, iceM); c.position.set(x, .225, z); c.rotation.set(r, r * 1.3, 0); ice.add(c); }
    C.add(ice); C.visible = false;
    const T = new THREE.Group(); T.position.set(TOY[0], Y, TOY[1]); R.add(T);
    const face = tex(64, 64, (g, w, h) => { g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.beginPath(); g.arc(32, 30, 17, .2, Math.PI - .2); g.lineWidth = 6; g.strokeStyle = '#c8102e'; g.stroke(); g.fillRect(19, 18, 6, 7); g.fillRect(39, 18, 6, 7); });
    const ym = M('#ffd23f', {roughness:.6}), fm = new THREE.MeshStandardMaterial({map:face, roughness:.6});
    const tb = new THREE.Mesh(new THREE.BoxGeometry(.15, .12, .1).translate(0, .06, 0), [ym, ym, red, ym, fm, ym]); T.add(tb);
    for (const x of [-.04, .04]) box(.012, .05, .05, red, x, .145, 0, T);
    T.visible = false;
    const B = new THREE.Group(); R.add(B);
    box(.27, .3, .18, M('#c49a62', {roughness:.85}), 0, .15, 0, B); box(.272, .05, .182, M('#a97f48', {roughness:.85}), 0, .3, 0, B);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(.14, .1), new THREE.MeshBasicMaterial({map:tex(128, 96, (g, w, h) => { g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc72c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT}`; g.fillText('麦当当', w / 2, h / 2 + 2); })}));
    tag.position.set(0, .17, .091); B.add(tag); B.visible = false;
    for (const g of [F, C, T, B]) g.traverse(o => { if (o.isMesh) o.castShadow = S.q > 0; });
    return {F, C, liqM, ice, T, B};
  }

  /* ---------- 3D: the restaurant (counter and dining room) or the drive-thru window ---------- */
  function build(ctx){
    const R = ctx.root, drive = S.drive, sh = S.q > 0;
    const steel = M('#b9c0c6', {roughness:.35, metalness:.55}), dark = M('#4a4f55', {roughness:.6, metalness:.3}), red = M('#c8102e', {roughness:.6}), cream = M('#f4efe6', {roughness:.9});
    const tile = tex(128, 128, (g, w) => { g.fillStyle = '#efe2c8'; g.fillRect(0, 0, w, w); g.fillStyle = '#b8231f'; g.fillRect(0, 0, w / 2, w / 2); g.fillRect(w / 2, w / 2, w / 2, w / 2); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, w); });
    tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
    const floorW = 16, floorD = drive ? 3.6 : 11; tile.repeat.set(floorW / .8, floorD / .8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({map:tile, roughness:.75}));
    floor.position.set(0, 0, drive ? -.7 + floorD / 2 : -.7 - floorD / 2 + 3.6); floor.receiveShadow = sh; R.add(floor);
    /* the counter: steel top, a red tray on it where everything is put together */
    const body = box(6, .9, .92, dark, 0, .45, -.25, R); body.castShadow = false;
    box(6.2, .05, 1.06, steel, 0, .925, -.25, R).castShadow = false;
    box(6.22, .14, .06, red, 0, .82, .29, R).castShadow = false;
    const tray = box(1.75, .025, .62, M('#8e2a20', {roughness:.6}), 0, .9625, .08, R); tray.castShadow = false;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({roughness:.9, map:tex(128, 128, (g, w) => {
      g.fillStyle = '#f6efe0'; g.fillRect(0, 0, w, w); g.fillStyle = '#e3c27a'; for (let i = 0; i < 6; i++){ g.fillRect(0, 10 + i * 22, w, 4); } g.fillStyle = '#c8102e'; g.font = `900 22px ${FONT}`; g.textAlign = 'center'; g.fillText('麦当当', w / 2, w - 10);
    })}));
    paper.position.set(0, Y + .001, BZ); paper.rotation.y = .12; R.add(paper);
    /* fries station on the left, drink tower on the right (scenery; the buttons do the work) */
    box(.62, .1, .44, steel, -1.95, 1.0, .02, R); const fr = box(.56, .06, .38, M('#f6c84a', {roughness:.7}), -1.95, 1.07, .02, R); fr.castShadow = false;
    box(.07, .28, .44, steel, -2.28, 1.09, .02, R);
    box(.62, .62, .42, dark, 2.0, 1.26, -.05, R); box(.66, .1, .46, red, 2.0, 1.62, -.05, R);
    for (const [i, c] of [[0, '#4a2416'], [1, '#ff9a1f'], [2, '#c8935a']]){ box(.12, .1, .06, M(c, {roughness:.4}), 1.82 + i * .18, 1.42, .18, R); box(.03, .08, .03, steel, 1.82 + i * .18, 1.32, .2, R); }
    if (!drive){
      /* dining room: back wall with the menu board and the 麦当当 lightbox, windows, two tables */
      box(16, 3.8, .2, cream, 0, 1.9, -4.3, R).castShadow = false;
      box(16, .5, .22, red, 0, 3.55, -4.28, R).castShadow = false;
      const menu = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.5), new THREE.MeshBasicMaterial({map:tex(1024, 320, (g, w, h) => {
        g.fillStyle = '#1d1f24'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 64);
        g.fillStyle = '#ffc72c'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 44px ${FONT}`; g.fillText('麦当当 · 今日菜单', 26, 34);
        g.textAlign = 'right'; g.font = `700 28px ${FONT}`; g.fillStyle = '#ffffff'; g.fillText('Halal · 24 jam', w - 24, 34);
        const items = [['芝心堡', '6.50'], ['辣辣鸡腿堡', '9.90'], ['双层芝心堡', '8.90'], ['椰浆饭堡', '11.50'], ['参巴蛋牛堡', '10.90'], ['巨无坝', '12.90'], ['薯条 小/中/大', '3.5/4.5/5.5'], ['可乐 · 橙汁 · 拉茶', '3.90']];
        items.forEach(([n, p], i) => {
          const x = i < 4 ? 30 : w / 2 + 20, y = 108 + (i % 4) * 56;
          g.textAlign = 'left'; g.fillStyle = i === 3 || i === 4 ? '#7fe07a' : '#ffffff'; g.font = `700 34px ${FONT}`; g.fillText(n, x, y);
          g.textAlign = 'right'; g.fillStyle = '#ffc72c'; g.fillText('RM ' + p, x + w / 2 - 54, y);
        });
      })}));
      menu.position.set(0, 2.45, -4.19); R.add(menu);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .42), new THREE.MeshBasicMaterial({map:tex(512, 96, (g, w, h) => {
        g.fillStyle = '#ffc72c'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT}`; g.fillText('麦 当 当', w / 2, h / 2 + 3);
      })}));
      sign.position.set(0, 3.55, -4.16); R.add(sign);
      const glass = new THREE.MeshBasicMaterial({color:'#9fd0f0'});
      for (const x of [-5.2, 5.2]){ const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), glass); w.position.set(x, 1.75, -4.19); R.add(w); box(3.1, .08, .1, dark, x, .78, -4.17, R).castShadow = false; }
      for (const x of [-3.4, 3.4]){ box(.9, .05, .9, M('#f4f2ec', {roughness:.5}), x, .76, -3.1, R); box(.08, .74, .08, dark, x, .37, -3.1, R); }
    } else {
      /* outside: the lane, a kerb and a hedge, the 得来速 sign; the window is a frame round the counter */
      const asph = new THREE.Mesh(new THREE.PlaneGeometry(44, 4).rotateX(-Math.PI / 2), M('#3d4046', {roughness:.95})); asph.position.set(0, -.01, -2.7); asph.receiveShadow = sh; R.add(asph);
      box(44, .02, .09, M('#f2c230'), 0, 0, -3.95, R).castShadow = false;
      box(44, .16, .3, M('#c9c6bd'), 0, .08, -4.85, R).castShadow = false;
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 30).rotateX(-Math.PI / 2), M('#5f9a4a')); grass.position.set(0, -.02, -20); R.add(grass);
      const hedge = box(44, .8, .7, M('#3f7a3a', {roughness:.9}), 0, .4, -5.5, R); hedge.castShadow = false;
      for (const x of [-2.6, 2.6]){ box(.14, 2.2, .14, dark, x, 1.1, -.72, R).castShadow = false; }
      const ds = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .8), new THREE.MeshBasicMaterial({map:tex(256, 128, (g, w, h) => {
        g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc72c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 52px ${FONT}`; g.fillText('得来速', w / 2, 48); g.font = `700 26px ${FONT}`; g.fillStyle = '#fff'; g.fillText('取餐窗口 →', w / 2, 98);
      })}));
      ds.position.set(3.3, 1.9, -4.7); R.add(ds); box(.1, 1.6, .1, dark, 3.3, .8, -4.75, R);
    }
    S.sd = sides(R);
    S.burg = new THREE.Group(); R.add(S.burg);
    /* the selected customer stands in a glowing ring */
    S.ring = new THREE.Mesh(new THREE.RingGeometry(.3, .4, 32).rotateX(-Math.PI / 2), typeof gxGlow === 'function' ? gxGlow('#ffc72c', .8) : new THREE.MeshBasicMaterial({color:'#ffc72c'}));
    S.ring.position.y = .02; S.ring.visible = false; R.add(S.ring);
  }

  /* ---------- customers (students' bodies from js/60-details.js, a tudung for some) and cars ---------- */
  const NPC = () => typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined' && typeof PPL_HIP !== 'undefined';
  function person(R){
    const g = new THREE.Group(), shirt = M('#ffffff', {roughness:.8}), skin = M('#e8b98f', {roughness:.7}), P = {g, shirt, skin, legs:[], x:0, z:0, tx:0, tz:0, on:false, walkT:0};
    if (NPC()){
      g.add(new THREE.Mesh(npcBodyGeo, shirt), new THREE.Mesh(npcHeadGeo, skin));
      if (typeof npcGearGeo !== 'undefined'){ P.gear = new THREE.Mesh(npcGearGeo, M('#ffffff', {roughness:.8, vertexColors:true})); g.add(P.gear); }   /* hair and backpack */
      for (const s of [-1, 1]){ const l = new THREE.Mesh(npcLegGeo, M('#2a3350', {roughness:.8, vertexColors:true})); l.position.set(s * .09, PPL_HIP, 0); g.add(l); P.legs.push(l); }
      if (typeof pplArms === 'function' && typeof npcSleeveGeo !== 'undefined') pplArms(g, shirt, skin).forEach(a => { a.rotation.x = -.15; });
    } else {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, .9, 10).translate(0, 1.0, 0), shirt), h = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8).translate(0, 1.62, 0), skin);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(.15, .13, .55, 8).translate(0, .28, 0), M('#2a3350')); g.add(b, h, l);
    }
    P.tudM = M('#c2185b', {roughness:.85, side:THREE.DoubleSide});
    P.tud = new THREE.Group();
    P.tud.add(new THREE.Mesh(new THREE.SphereGeometry(.168, 14, 8, Math.PI / 2 + .95, Math.PI * 2 - 1.9, 0, Math.PI * .62).translate(0, 1.635, -.008), P.tudM));
    P.tud.add(new THREE.Mesh(new THREE.CylinderGeometry(.12, .23, .24, 14, 1, true).translate(0, 1.42, -.01), P.tudM));
    g.add(P.tud);
    g.traverse(o => { if (o.isMesh) o.castShadow = S.q > 0; });
    g.visible = false; R.add(g);
    P.bub = bubble();
    return P;
  }
  function dressPerson(P, who, kid){
    P.shirt.color.set(who[1]); P.skin.color.set(who[2]);
    P.tud.visible = !!who[3]; if (who[3]) P.tudM.color.set(who[3]); if (P.gear) P.gear.visible = !who[3];
    P.g.scale.setScalar(kid ? .7 : 1); P.kid = kid;
  }
  function car(R){
    const g = new THREE.Group(), paint = M('#c8102e', {roughness:.4, metalness:.25}), tyre = M('#1b1c1f', {roughness:.9});
    box(3.5, .55, 1.62, paint, 0, .6, 0, g);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.95, .46, 1.44), new THREE.MeshStandardMaterial({color:'#bcd8e8', roughness:.1, transparent:true, opacity:.4}));
    glass.position.set(-.2, 1.1, 0); g.add(glass);
    box(1.85, .07, 1.38, paint, -.2, 1.36, 0, g);
    const wg = new THREE.CylinderGeometry(.3, .3, .24, 14).rotateX(Math.PI / 2);
    for (const x of [-1.15, 1.15]) for (const z of [-.72, .72]){ const w = new THREE.Mesh(wg, tyre); w.position.set(x, .3, z); g.add(w); }
    box(.06, .16, .4, M('#fff6c0', {roughness:.3}), 1.76, .66, -.5, g); box(.06, .16, .4, M('#fff6c0', {roughness:.3}), 1.76, .66, .5, g);
    const skin = M('#c58c5c', {roughness:.7}), head = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), skin); head.position.set(.05, 1.13, .38); g.add(head);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .35, 10), M('#4aa3ff', {roughness:.8})); body.position.set(.05, .88, .38); g.add(body);
    g.traverse(o => { if (o.isMesh) o.castShadow = S.q > 0; });
    g.visible = false; R.add(g);
    return {g, paint, skin, shirt:body.material, x:-30, tx:0, on:false, bub:bubble()};
  }

  /* ---------- HTML: tickets, button pad, hint line, speech bubbles ---------- */
  function bubble(){ const b = el('div', 'mcd-bub'); b.hidden = true; S.ctx.ui.append(b); return b; }
  function say(o, text, bad, sec){ o.bub.textContent = text; o.bub.classList.toggle('bad', !!bad); o.bub.hidden = false; o.sayT = sec || 2.6; o.bubW = o.bub.offsetWidth; }
  function hint(t, sec){ S.hintEl.textContent = t; S.hintEl.classList.toggle('off', !t); S.hintT = sec || 2.2; }
  function buildPad(ctx){
    const pad = el('div'); pad.id = 'mcdPad';
    const r1 = el('div', 'mcd-row mcd-ing'), r2 = el('div', 'mcd-row mcd-side');
    const mk = (row, key, icon, label, kb, fn, cls, bg, fg) => {
      const b = el('button', 'mcd-b' + (cls ? ' ' + cls : '')); b.type = 'button'; b.dataset.k = key;
      b.append(el('i', null, icon), el('b', null, label)); if (kb) b.append(el('kbd', null, kb));
      if (bg){ b.style.setProperty('--bg', bg); b.style.setProperty('--fg', fg); }
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (typeof ac === 'function') ac(); fn(); });
      b.addEventListener('contextmenu', e => e.preventDefault());
      row.append(b); S.btn[key] = b; return b;
    };
    for (const k of ING_K){ const d = ING[k]; mk(r1, k, d.e, d.n, d.k, () => act(k), null, d.c, d.t); }
    mk(r1, 'trash', '🗑️', '重做', '0', () => act('trash'), 'trash');
    for (const z in FRIES) mk(r2, 'f' + z, '🍟', '薯条 ' + FRIES[z].n, FRIES[z].k, () => act('f' + z));
    for (const d in DRINKS) mk(r2, 'd' + d, DRINKS[d].e, DRINKS[d].n, DRINKS[d].k, () => act('d' + d));
    mk(r2, 'ice', '🧊', '加冰', 'F', () => act('ice'));
    mk(r2, 'toy', '🧸', '玩具', 'G', () => act('toy'));
    mk(r2, 'go', '🛍️', '打包交餐', '空格', () => act('go'), 'go');
    pad.append(r1, r2); ctx.ui.append(pad); S.pad = pad;
  }
  const KEYMAP = {Digit0:'trash', Numpad0:'trash', Backspace:'trash', KeyQ:'fS', KeyW:'fM', KeyE:'fL', KeyA:'dcola', KeyS:'dorange', KeyD:'dteh', KeyF:'ice', KeyG:'toy', Space:'go', Enter:'go', NumpadEnter:'go'};
  ING_K.forEach((k, i) => { KEYMAP['Digit' + (i + 1)] = k; KEYMAP['Numpad' + (i + 1)] = k; });
  function onKey(e){
    if (!S || S.over || XMini.state !== 'play' || e.repeat || document.querySelector('dialog[open]')) return;
    if (e.code === 'Tab'){ e.preventDefault(); cycle(); return; }
    const k = KEYMAP[e.code]; if (!k) return;
    e.preventDefault(); act(k);
    const b = S.btn[k]; if (b){ b.classList.add('hit'); S.ctx.after(.11, () => b.classList.remove('hit')); }
  }

  /* tickets */
  function ticketEl(t){
    const o = t.o, d = el('div', 'mcd-tk'); d.style.setProperty('--c', t.color);
    const h = el('div', 'mcd-tk-h'); h.append(el('i'), el('b', null, t.who), el('em', null, o.name + (o.b.local && !o.kid ? ' · 本地限定' : ''))); d.append(h);
    if (o.mods.length) d.append(el('div', 'mcd-tk-m', o.mods.join(' · ')));
    const l = el('div', 'mcd-tk-l');
    t.chips = o.L.map(k => { const s = el('span', null, ING[k].s); s.style.setProperty('--bg', ING[k].c); s.style.setProperty('--fg', ING[k].t); s.title = ING[k].n; l.append(s); return s; });
    d.append(l);
    const sd = el('div', 'mcd-tk-s'); t.side = {};
    if (o.fries) sd.append(t.side.f = el('span', null, '🍟 ' + FRIES[o.fries].n));
    if (o.drink) sd.append(t.side.d = el('span', null, DRINKS[o.drink].e + ' ' + DRINKS[o.drink].n + (o.ice ? ' · 加冰' : ' · 走冰')));
    if (o.toy) sd.append(t.side.t = el('span', null, '🧸 玩具'));
    t.side.x = el('span', 'bad'); t.side.x.hidden = true; sd.append(t.side.x);
    d.append(sd);
    const p = el('div', 'mcd-tk-p'); t.bar = el('i'); p.append(t.bar); d.append(p);
    d.addEventListener('pointerdown', e => { e.preventDefault(); if (!S || S.over || t.next) return; S.sel = t; refresh(); });
    t.el = d; S.tkEl.append(d);
  }
  function refresh(){
    const m = S.made;
    for (const t of S.tix){
      const sel = t === S.sel; t.el.classList.toggle('sel', sel); t.el.classList.toggle('next', !!t.next);
      const L = t.o.L, n = m.stack.length;
      t.chips.forEach((c, i) => {
        const on = sel && i < n, good = on && m.stack[i] === L[i];
        c.className = !sel ? '' : i < n ? (good ? 'ok' : 'bad') : i === n && !m.closed ? 'now' : m.closed ? 'bad' : '';
      });
      const s = t.side, o = t.o, extra = [];
      if (s.f) s.f.className = sel && m.fries ? (m.fries === o.fries ? 'ok' : 'bad') : '';
      if (s.d) s.d.className = sel && m.drink ? (m.drink === o.drink && m.ice === o.ice ? 'ok' : 'bad') : '';
      if (s.t) s.t.className = sel && m.toy ? 'ok' : '';
      if (sel){ if (m.fries && !o.fries) extra.push('多了薯条'); if (m.drink && !o.drink) extra.push('多了饮料'); if (m.toy && !o.toy) extra.push('多了玩具'); if (n > L.length) extra.push('汉堡多了一层'); }
      s.x.hidden = !extra.length; s.x.textContent = extra.join(' · ');
    }
    for (const z in FRIES) S.btn['f' + z].setAttribute('aria-pressed', String(m.fries === z));
    for (const d in DRINKS) S.btn['d' + d].setAttribute('aria-pressed', String(m.drink === d));
    S.btn.ice.setAttribute('aria-pressed', String(m.ice)); S.btn.toy.setAttribute('aria-pressed', String(m.toy));
    /* the first two orders of a beginner's 经典 round: the next button glows */
    let hk = '';
    if (S.tut && S.sel && S.served < 2){
      const o = S.sel.o, n = m.stack.length;
      hk = m.closed ? (o.fries && m.fries !== o.fries ? 'f' + o.fries : o.drink && m.drink !== o.drink ? 'd' + o.drink : o.drink && m.ice !== o.ice ? 'ice' : o.toy && !m.toy ? 'toy' : 'go')
        : n && m.stack[n - 1] !== o.L[n - 1] ? 'trash' : o.L[n];
    }
    for (const k in S.btn) S.btn[k].classList.toggle('hint', k === hk);
  }
  function cycle(){
    const list = S.tix.filter(t => !t.next); if (list.length < 2) return;
    S.sel = list[(list.indexOf(S.sel) + 1) % list.length]; refresh(); S.ctx.tone('triangle', 700, 700, .04, .05);
  }

  /* ---------- the player's actions ---------- */
  function act(k){
    if (!S || S.over || XMini.state !== 'play') return;
    const ctx = S.ctx, m = S.made, t = S.sel;
    if (ING[k]){
      if (m.closed){ hint('汉堡已经包好了，做错了就点「重做」'); ctx.tone('square', 200, 160, .08, .05); return; }
      if (m.stack.length >= 10){ hint('叠不下了，点「重做」'); return; }
      if (k === 'bun' && m.stack.length) m.closed = true;
      addLayer(k); S.kinds.push(k);
      const n = S.kinds.length, want = t && t.o.L[n - 1];
      if (t && want !== k){
        S.wrongs++; ctx.tone('square', 170, 120, .16, .08); ctx.camera.shake(.04);
        hint(`这一层应该是「${want ? ING[want].n : '没有了'}」，点「重做」从头来`, 2.6);
      } else ctx.tone('triangle', 330 + n * 55, 300 + n * 55, .07, .09);
      ctx.noise(.04, .03, k === 'beef' || k === 'chick' ? 900 : 2400);
      if (m.closed){ ctx.after(.18, () => { if (S) ctx.tone('sine', 880, 1320, .12, .06); }); if (t && S.kinds.length === t.o.L.length && S.kinds.every((x, i) => x === t.o.L[i])) hint(sideHint(t.o) || '汉堡做好了，点「打包交餐」', 2); }
      refresh(); return;
    }
    if (k === 'trash'){
      if (!S.kinds.length) return;
      clearStack(); S.kinds.length = 0; m.closed = false; S.trashed++;
      ctx.noise(.18, .05, 600); hint('倒掉了，重新叠', 1.4); refresh(); return;
    }
    if (k[0] === 'f' && FRIES[k[1]]){ m.fries = m.fries === k[1] ? null : k[1]; ctx.noise(.14, .06, 3200); sideDone(); refresh(); return; }
    if (k[0] === 'd' && DRINKS[k.slice(1)]){ const d = k.slice(1); m.drink = m.drink === d ? null : d; ctx.tone('sine', 260, 520, .22, .05); sideDone(); refresh(); return; }
    if (k === 'ice'){ m.ice = !m.ice; ctx.tone('triangle', 1900, 1700, .05, .06); ctx.tone('triangle', 2300, 2100, .05, .05, .07); sideDone(); refresh(); return; }
    if (k === 'toy'){ m.toy = !m.toy; ctx.tone('square', 990, 1320, .08, .05); sideDone(); refresh(); return; }
    if (k === 'go') serve();
  }
  /* after a side item, once the burger is wrapped: say what is still missing, or that the order is complete */
  function sideDone(){
    const t = S.sel; if (!t || !S.made.closed || S.hintT <= 0) return;
    hint(sideHint(t.o) || (S.ctx.touch ? '齐了，点「打包交餐」' : '齐了，按空格打包交餐'), 1.6);
  }
  /* what is still missing beside the burger, for the hint line */
  function sideHint(o){
    const m = S.made, need = [];
    if (o.fries && m.fries !== o.fries) need.push(FRIES[o.fries].n + '薯条');
    if (o.drink && m.drink !== o.drink) need.push(DRINKS[o.drink].n);
    if (o.drink && m.ice !== o.ice) need.push(o.ice ? '加冰' : '别加冰');
    if (o.toy && !m.toy) need.push('玩具');
    return need.length ? '还要：' + need.join('、') : '';
  }
  function resetMade(){ clearStack(); S.kinds.length = 0; Object.assign(S.made, {closed:false, fries:null, drink:null, ice:false, toy:false}); }
  function serve(){
    const ctx = S.ctx, t = S.sel, m = S.made;
    if (!t){ hint('还没有客人'); return; }
    if (!S.kinds.length){ hint('先按小票叠汉堡'); ctx.tone('square', 200, 160, .08, .05); return; }
    if (!m.closed){ hint('汉堡还没盖上面包'); ctx.tone('square', 200, 160, .08, .05); return; }
    const o = t.o, miss = [];
    const burgerOK = S.kinds.length === o.L.length && S.kinds.every((x, i) => x === o.L[i]);
    if (!burgerOK) miss.push('汉堡做错了');
    if ((m.fries || null) !== (o.fries || null)) miss.push(!o.fries ? '多了薯条' : !m.fries ? '少了薯条' : '薯条大小不对');
    if ((m.drink || null) !== (o.drink || null)) miss.push(!o.drink ? '多了饮料' : !m.drink ? '少了饮料' : '饮料拿错了');
    else if (o.drink && m.ice !== o.ice) miss.push(o.ice ? '忘了加冰' : '人家要走冰');
    if (!!m.toy !== !!o.toy) miss.push(o.toy ? '少了玩具' : '多了玩具');
    const base = o.b.pts + (o.fries ? 8 : 0) + (o.drink ? 8 : 0) + (o.toy ? 6 : 0) + o.mods.length * 4;
    let pts;
    const who = t.cust || t.car;
    if (!miss.length){
      S.combo++; S.perfect++; S.bestCombo = Math.max(S.bestCombo, S.combo);
      const fast = Math.max(0, t.left / t.pat), tip = Math.round((S.drive ? 34 : 24) * fast), mult = 1 + .1 * Math.min(S.combo - 1, 10);
      pts = Math.round((base + tip) * mult);
      ctx.sfx.ding(); for (let i = 0; i < 3; i++) ctx.tone('triangle', 784 * Math.pow(1.26, i), 784 * Math.pow(1.26, i), .14, .08, .08 + i * .07);
      ctx.hud.callout('+' + pts, S.combo > 1 ? `全对 · 连击 ×${S.combo}` : tip > 14 ? '全对 · 又快又准' : '全对！', '#ffc72c');
      say(who, pick(Math.random, YUM));
      if (who && S.q > 0) for (let i = 0; i < 3; i++) ctx.part('heart', who.x + (Math.random() - .5) * .5, S.drive ? 1.6 : 1.9, S.drive ? -1.0 : who.z, .22, {vy:1.2});
      if (o.b.local) S.local++;
      if (S.combo >= 10) ctx.unlock('mg_mcd_combo');
    } else {
      S.combo = 0; S.bad++;
      pts = burgerOK ? Math.round(base * .4) : 4;
      ctx.sfx.fail(); ctx.hud.callout('+' + pts, miss[0], '#e2574c');
      say(who, pick(Math.random, MEH) + ' ' + miss[0], true);
      if (!burgerOK && S.M.strikes) strike('汉堡做错了');
    }
    S.score += pts; S.served++;
    bag(who);
    resetMade();
    done(t, 'served');
    hint(miss.length > 1 ? '还有：' + miss.slice(1).join('、') : '', 1.8);
  }
  function strike(why){
    S.strikes++; S.ctx.camera.shake(.08);
    if (S.strikes >= S.M.strikes){ S.endWhy = why; end(); }
  }
  /* the bag pops up on the tray and flies to the customer (or into the car window) */
  function bag(who){
    const B = S.sd.B; B.visible = true; B.position.set(0, Y, BZ); B.scale.setScalar(.01);
    S.bagA = {t:0, x:who ? who.x : 0, z:S.drive ? -1.2 : who ? who.z + .35 : -1};
  }
  /* a ticket leaves: served, or the customer gave up */
  function done(t, why){
    const i = S.tix.indexOf(t); if (i < 0) return;
    S.tix.splice(i, 1); t.el.classList.add('out'); t.el.style.pointerEvents = 'none'; S.ctx.after(.3, () => t.el.remove());
    if (t.cust){ const c = t.cust; c.ticket = null; c.leaveT = why === 'served' ? .9 : .3; }
    if (t.car){ const c = t.car; c.ticket = null; c.leaveT = why === 'served' ? .8 : .2; S.carDone++; }
    if (S.sel === t) S.sel = S.tix.find(x => !x.next) || null;
    if (S.mode === 'classic') S.nextAt = Math.min(S.nextAt, S.t + 1.1);
    refresh();
    if (S.drive && S.carDone >= S.M.N && !S.over){ S.endWhy = ''; end(); }
  }

  /* ---------- the flow of customers ---------- */
  function level(){ return S.mode === 'rush' ? (S.t < 25 ? 0 : S.t < 70 ? 1 : 2) : S.mode === 'drive' ? (S.carN < 3 ? 0 : S.carN < 7 ? 1 : 2) : (S.served < 2 ? 0 : S.served < 6 ? 1 : 2); }
  function newTicket(o){
    const who = o.kid ? pick(Math.random, KIDS) : PEOPLE[S.pi++ % PEOPLE.length];
    const L = o.L.length + (o.fries ? 1.5 : 0) + (o.drink ? 2 : 0) + (o.toy ? 1 : 0);
    const k = S.mode === 'rush' ? S.t / S.M.T : S.mode === 'drive' ? S.carN / S.M.N : 0;
    const pat = S.mode === 'rush' ? lerp(27, 14, k) + L * 1.2 : S.mode === 'drive' ? lerp(16, 8.5, k) + L * 1.1 : 30 + L * 2;
    return {o, who:who[0], whoD:who, color:who[1], pat, left:pat, el:null};
  }
  function spawnCustomer(){
    const used = new Set(S.tix.map(t => t.cust && t.cust.slot)), slot = S.slots.findIndex((x, i) => !used.has(i) && !S.ppl.some(p => p.on && p.slot === i && p.ticket));
    if (slot < 0) return false;
    const P = S.ppl.find(p => !p.on); if (!P) return false;
    const o = makeOrder(level(), false, S.first), t = newTicket(o); S.first = false;
    dressPerson(P, t.whoD, o.kid);
    Object.assign(P, {on:true, slot, x:4.6, z:-2.4, tx:S.slots[slot], tz:-1.28, ticket:t, leaveT:0, walkT:0, sayT:0});
    P.g.visible = true; t.cust = P;
    ticketEl(t); S.tix.push(t); if (!S.sel) S.sel = t;
    say(P, orderLine(o), false, 2.8);
    S.ctx.tone('sine', 660, 660, .06, .04); S.ctx.tone('sine', 880, 880, .08, .04, .09);
    refresh(); return true;
  }
  function flowPeople(dt){
    const M_ = S.M;
    if (S.mode === 'classic'){
      if (S.tix.length < M_.maxq && S.t >= S.nextAt){ if (spawnCustomer()) S.nextAt = S.t + 2.2; }
    } else if (S.t >= S.nextAt && S.tix.length < M_.maxq){
      if (spawnCustomer()) S.nextAt = S.t + lerp(9.5, 3.4, S.t / M_.T) * (.8 + Math.random() * .4);
    } else if (S.tix.length === 0 && S.t + 1.5 < S.nextAt) S.nextAt = S.t + 1.5;
    for (const P of S.ppl){
      if (!P.on) continue;
      if (P.leaveT > 0){ P.leaveT -= dt; if (P.leaveT <= 0){ P.tx = -5; P.tz = -2.6; P.leaving = true; } }
      const dx = P.tx - P.x, dz = P.tz - P.z, d = Math.hypot(dx, dz), sp = P.kid ? 2.6 : 2.2;
      if (d > .02){ const s = Math.min(d, sp * dt); P.x += dx / d * s; P.z += dz / d * s; P.walkT += dt * 9; P.g.rotation.y = Math.atan2(dx, dz); }
      else { P.g.rotation.y += (0 - P.g.rotation.y) * Math.min(1, dt * 8); P.walkT = 0; if (P.leaving){ P.on = false; P.leaving = false; P.g.visible = false; P.bub.hidden = true; continue; } }
      const sw = d > .02 ? Math.sin(P.walkT) : 0;
      if (P.legs.length){ P.legs[0].rotation.x = sw * .5; P.legs[1].rotation.x = -sw * .5; }
      P.g.position.set(P.x, Math.abs(sw) * .03, P.z);
    }
  }
  function flowCars(dt){
    const M_ = S.M, live = S.cars.filter(c => c.on && !c.leaving);
    if (live.length < 3 && S.carN < M_.N && (S.t >= S.nextCar)){
      const C = S.cars.find(c => !c.on);
      if (C){
        const o = makeOrder(level(), true, S.carN === 0), t = newTicket(o);
        C.paint.color.set(CAR_C[(S.carN * 3 + 1) % CAR_C.length]); C.skin.color.set(t.whoD[2]); C.shirt.color.set(t.whoD[1]);
        Object.assign(C, {on:true, leaving:false, seq:S.carN, x:-17 - live.length * 4, ticket:t, leaveT:0, sayT:0, shown:false, at:false});
        C.g.visible = true; t.car = C; t.next = true; S.carN++; S.nextCar = S.t + 1.4;
      }
    }
    const q = S.cars.filter(c => c.on && !c.leaving).sort((a, b) => a.seq - b.seq);
    q.forEach((c, i) => { c.tx = -4.9 * Math.min(i, 3); });
    for (const c of S.cars){
      if (!c.on) continue;
      if (c.leaveT > 0){ c.leaveT -= dt; if (c.leaveT <= 0){ c.leaving = true; c.tx = 30; } }
      const d = c.tx - c.x, v = c.leaving ? Math.min(9, 2 + (c.x + 1) * 3) : Math.min(8, Math.abs(d) * 2.6);
      if (Math.abs(d) > .01) c.x += Math.sign(d) * Math.min(Math.abs(d), Math.max(.4, v) * dt);
      c.g.position.set(c.x, 0, -1.62);
      if (c.leaving && c.x > 26){ c.on = false; c.g.visible = false; c.bub.hidden = true; continue; }
      const t = c.ticket; if (!t) continue;
      /* the next car's order shows as soon as it is in the queue; it starts ticking at the window */
      if (!c.shown && c.x > -6.5){ c.shown = true; ticketEl(t); S.tix.push(t); refresh(); }
      if (!c.at && Math.abs(c.x) < .05){
        c.at = true; t.next = false; if (!S.sel || S.sel.next) S.sel = t;
        say(c, '（滴滴）' + orderLine(t.o), false, 3);
        S.ctx.tone('square', 440, 440, .1, .05); S.ctx.tone('square', 440, 440, .1, .05, .16);
        refresh();
      }
    }
  }
  function tickPatience(dt){
    for (const t of S.tix.slice()){
      if (t.next) continue;
      if (t.cust && Math.hypot(t.cust.tx - t.cust.x, t.cust.tz - t.cust.z) > .3) continue;   /* the clock starts at the counter */
      t.left -= dt;
      const k = Math.max(0, t.left / t.pat);
      t.bar.style.transform = `scaleX(${k.toFixed(3)})`;
      const c = k > .5 ? '#4fd18b' : k > .25 ? '#ffc72c' : '#e2574c'; if (t.barC !== c){ t.barC = c; t.bar.style.background = c; }
      if (t.left <= 0){
        const who = t.cust || t.car;
        S.combo = 0; S.lost++;
        say(who, pick(Math.random, GONE), true); S.ctx.sfx.fail();
        S.ctx.hud.callout(S.drive ? '车开走了' : '客人走了', '等太久了', '#e2574c');
        if (S.drive) S.ctx.tone('square', 330, 330, .3, .06);
        done(t, 'gone');
        if (S.M.strikes) strike('等太久了');
      } else if (k < .25 && !t.warned){ t.warned = true; S.ctx.tone('sine', 520, 420, .12, .05); }
    }
  }

  /* ---------- camera: frame the counter and the customers in the gap between the tickets and the buttons ---------- */
  function layout(ctx, force){
    /* short landscape screens put the tickets in a column on the left (CSS), so the free area is beside them, not under them */
    const H = innerHeight, W = innerWidth, tr = S.tkEl.getBoundingClientRect(), side = getComputedStyle(S.tkEl).flexDirection === 'column';
    const hud = document.getElementById('mgHud'), hb = hud && !hud.hidden ? hud.getBoundingClientRect().bottom : 60;
    const top = side ? hb : tr.bottom || 120, left = side ? tr.right : 0, bot = S.pad.getBoundingClientRect().top || H - 140;
    const key = [W, H, Math.round(top / 4), Math.round(bot / 4), Math.round(left / 4)].join();
    if (!force && key === S.lay) return; S.lay = key;
    const a0 = Math.max(.3, ctx.aspect), y0 = 1 - 2 * (top + 6) / H, y1 = 1 - 2 * (bot - 6) / H, yc = (y0 + y1) / 2, tv = Math.tan(FOV * Math.PI / 360);
    const x0 = 2 * (left + 4) / W - 1, xc = (x0 + 1) / 2;
    const P = S.drive ? new THREE.Vector3(0, 1.0, -.8) : new THREE.Vector3(0, 1.2, -.6), el = S.drive ? .82 : .56;
    const sl = S.mode === 'rush' ? 4 : 2, half = a0 < .8 ? .62 : .95;
    S.slots = Array.from({length:sl}, (x, i) => (i - (sl - 1) / 2) * (sl > 2 ? half * 1.15 : 1.25));
    for (const p of S.ppl) if (p.on && !p.leaving && p.ticket) p.tx = S.slots[p.slot];
    const xs = S.slots[sl - 1] + .2;
    const pts = S.drive ? [[-.85, Y, .42], [.85, Y, .42], [0, 1.5, -1.62], [-1.75, .6, -1.62], [1.75, .6, -1.62]] : [[-.85, Y, .42], [.85, Y, .42], [0, 2.0, -1.3], [-xs, 1.3, -1.3], [xs, 1.3, -1.3]];
    camS.aspect = a0; camS.fov = FOV; camS.updateProjectionMatrix();
    let best = null;
    for (let D = 1.6; D <= 9; D += .1){
      const C = _v.set(-xc * tv * a0 * D, Math.sin(el) * D, Math.cos(el) * D).add(P), pitch = -el - Math.atan(yc * tv);
      const look = [C.x, C.y + Math.sin(pitch), C.z - Math.cos(pitch)];
      camS.position.copy(C); camS.lookAt(look[0], look[1], look[2]); camS.updateMatrixWorld(true);
      let ok = true;
      for (const [x, y, z] of pts){ const p = new THREE.Vector3(x, y, z).project(camS); if (p.x > .97 || p.x < x0 + .03 || p.y > y0 - .02 || p.y < y1 + .02) ok = false; }
      best = {pos:[C.x, C.y, C.z], look, D, ok};
      if (ok) break;
    }
    S.camD = best.D; ctx.camera.set(best.pos, best.look, FOV);
    if (force) ctx.camera.snap();
  }
  function bubbles(dt){
    const list = S.drive ? S.cars : S.ppl;
    for (const o of list){
      if (!o.on || o.bub.hidden) continue;
      o.sayT -= dt; if (o.sayT <= 0){ o.bub.hidden = true; continue; }
      const [x, y] = S.drive ? S.ctx.screen(o.x + .05, 1.62, -1.24) : S.ctx.screen(o.x, o.kid ? 1.42 : 1.95, o.z);
      const hw = (o.bubW || 0) / 2 + 6, cx = Math.max(hw, Math.min(innerWidth - hw, x));   /* keep the whole line on the screen */
      o.bub.style.transform = `translate(${cx.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-100%)`;
    }
  }

  /* ---------- end of the round ---------- */
  function end(){
    if (S.over) return; S.over = true;
    const ctx = S.ctx, M_ = S.M, st = `出餐 ${S.served} 单 · 全对 ${S.perfect} 单 · 最高连击 ${S.bestCombo}` + (S.lost ? ` · 走掉 ${S.lost} 位` : '');
    const rounds = (+ctx.store.get('rounds') || 0) + 1; ctx.store.set('rounds', rounds);
    if (S.mode === 'drive' && S.carDone >= M_.N && !S.lost && S.bad === 0) ctx.unlock('mg_mcd_drive');
    if (S.local >= 3) ctx.unlock('mg_mcd_local');
    for (const k in S.btn) S.btn[k].classList.remove('hint');
    hint('');
    const title = S.mode === 'classic' ? '下班！90 秒的班上完了' : S.endWhy ? '三个差评，店长让你先下班' : S.mode === 'rush' ? '午高峰撑过去了！' : '12 辆车都送走了！';
    ctx.after(.7, () => ctx.finish(S.score, {kicker:S.endWhy ? '下班' : '收工', title, sub:st}));
  }

  return {
    id:'mcd', name:'麦当当配餐', icon:'🍔', color:'#ffc72c',
    parts:'mcd',                     // 改装零件掉落表：js/42-tuning.js 的 TN_DROPS.mcd，按奖牌发，结算面板显示（js/93-tuning-ui.js）
    desc:'麦当当后厨打工：看小票叠汉堡、配薯条饮料、打包交餐',
    intro:MODES[0].intro,
    controls:{help:{touch:'点下面的按钮：上排汉堡食材（从下往上），下排薯条、饮料、冰、玩具和「打包交餐」；点小票换一单',
      key:'鼠标点按钮，或者：1–8 食材 · 0 / 退格 重做 · Q W E 薯条小中大 · A S D 可乐 橙汁 拉茶 · F 冰 · G 玩具 · 空格 打包交餐 · Tab 换小票 · Esc 暂停'}},
    board:{fmt:v => Math.round(v) + ' 分', max:100000},
    sky:'#2b1d16', shadow:6,
    achievements:[['mg_mcd_combo', '流水线之神', '麦当当配餐连续 10 单全对', 50], ['mg_mcd_drive', '得来速零差评', '得来速 12 辆车全部按时送对', 60],
      ['mg_mcd_local', '本地口味', '麦当当配餐一局做对 3 个本地限定汉堡', 20]],
    /* RM 工资（m.rw）：和食堂端盘子一样，底薪加按分数的提成、每局封顶，没有奖牌奖金。按一局的长短定封顶，
       每分钟最多大约 RM 25–28，不超过端盘子和 KIP 大乱斗：经典 90 秒最多 40，午高峰 150 秒最多 60，得来速最快一分钟跑完所以最多 25 */
    modes:MODES.map(m => ({id:m.id, name:m.name, desc:m.desc, intro:m.intro, medals:m.medals, sky:m.sky, def:m, reward:s => Math.round(m.rw(s))})),
    start(ctx){
      css();
      const M_ = (ctx.modeDef && ctx.modeDef.def) || MODES[0];
      S = {ctx, M:M_, mode:M_.id, drive:M_.id === 'drive', q:ctx.q, t:0, score:0, served:0, perfect:0, combo:0, bestCombo:0, strikes:0, bad:0, lost:0, wrongs:0, trashed:0, local:0,
        tix:[], sel:null, nextAt:.4, nextCar:0, carN:0, carDone:0, pi:(Math.random() * PEOPLE.length) | 0, first:true, over:false, endWhy:'', btn:{}, stack:[], kinds:[],
        made:{stack:null, closed:false, fries:null, drink:null, ice:false, toy:false}, ppl:[], cars:[], slots:[-.6, .6], lay:'', hintT:0, topT:0, bagA:null};
      S.made.stack = S.kinds;
      S.tut = M_.id === 'classic' && (+ctx.store.get('rounds') || 0) < 2;
      S.G = geos(); S.Mx = mats();
      build(ctx);
      const tk = el('div'); tk.id = 'mcdTk'; ctx.ui.append(tk); S.tkEl = tk;
      S.hintEl = el('div', 'off'); S.hintEl.id = 'mcdHint'; ctx.ui.append(S.hintEl);
      buildPad(ctx);
      if (S.drive) for (let i = 0; i < 3; i++) S.cars.push(car(ctx.root));
      else for (let i = 0; i < M_.maxq + 2; i++) S.ppl.push(person(ctx.root));
      document.body.classList.add('mcd-on'); document.body.classList.toggle('mcd-touch', !!ctx.touch);
      ctx.on(window, 'keydown', onKey);
      ctx.on(window, 'resize', () => { if (S) S.lay = ''; });
      ctx.hud.score(0);
      if (S.drive) ctx.hud.info(`第 0 / ${M_.N} 辆 · ♥♥♥`); else ctx.hud.time(M_.T);
      const h = document.getElementById('mgHud'); if (h) tk.style.top = Math.round(h.getBoundingClientRect().bottom + 6) + 'px';
      layout(ctx, true);
      refresh();
      if (S.tut) hint(ctx.touch ? '看小票，从下往上点食材叠汉堡' : '看小票，从下往上按 1–8 叠汉堡', 4);
      ctx.debug(S);
    },
    update(dt, ctx){
      if (!S) return;
      if (!S.over) S.t += dt;
      if ((S.topT -= dt) <= 0){
        S.topT = .4;
        const h = document.getElementById('mgHud'); if (h){ const y = Math.round(h.getBoundingClientRect().bottom + 6) + 'px'; if (S.tkEl.style.top !== y) S.tkEl.style.top = y; }
        layout(ctx);
        S.hintEl.style.top = Math.round(S.pad.getBoundingClientRect().top - 34) + 'px';
      }
      if (!S.over){
        if (S.drive) flowCars(dt); else flowPeople(dt);
        tickPatience(dt);
      } else if (S.drive) flowCars(dt); else flowPeople(dt);
      /* the stack: each new layer drops in and squashes a little */
      for (const l of S.stack){
        if (l.t >= .3) continue;
        l.t += dt; const f = Math.min(1, l.t / .13);
        l.m.position.y = l.y + .5 * (1 - f) * (1 - f);
        const sq = l.t < .13 ? 1 : 1 - Math.sin(Math.min(1, (l.t - .13) / .17) * Math.PI) * .35;
        l.m.scale.set(1 + (1 - sq) * .4, sq, 1 + (1 - sq) * .4);
      }
      /* the sides on the tray */
      const sd = S.sd, m = S.made;
      sd.F.visible = !!m.fries; if (m.fries){ const s = FRIES[m.fries].sc; sd.F.scale.set(s, s, s); }
      sd.C.visible = !!m.drink || m.ice; if (m.drink) sd.liqM.color.set(DRINKS[m.drink].c); else sd.liqM.color.set('#dfe9ef'); sd.ice.visible = m.ice;
      sd.T.visible = m.toy;
      if (S.bagA){
        const a = S.bagA, B = sd.B; a.t += dt;
        if (a.t < .16){ B.scale.setScalar(Math.max(.01, a.t / .16)); }
        else { const k = Math.min(1, (a.t - .16) / .42), e = k * k * (3 - 2 * k); B.scale.setScalar(1 - k * .4); B.position.set(a.x * e, Y + Math.sin(k * Math.PI) * .45, BZ + (a.z - BZ) * e); }
        if (a.t > .6){ B.visible = false; S.bagA = null; }
      }
      /* the selected customer's ring */
      if (S.sel && S.sel.cust){ S.ring.visible = true; S.ring.position.x = S.sel.cust.x; S.ring.position.z = S.sel.cust.z; S.ring.scale.setScalar(1 + Math.sin(S.t * 6) * .06); }
      else S.ring.visible = false;
      bubbles(dt);
      if (S.hintT > 0){ S.hintT -= dt; if (S.hintT <= 0) S.hintEl.classList.add('off'); }
      /* HUD and the end */
      ctx.hud.score(S.score);
      const hearts = S.M.strikes ? '♥'.repeat(Math.max(0, S.M.strikes - S.strikes)) + '♡'.repeat(Math.min(S.M.strikes, S.strikes)) : '';
      const combo = S.combo > 1 ? ` · 连击 ×${S.combo}` : '';
      if (S.mode === 'classic'){ ctx.hud.time(S.M.T - S.t); ctx.hud.info(`已出 ${S.served} 单${combo}`); if (S.t >= S.M.T && !S.over) end(); }
      else if (S.mode === 'rush'){
        const mins = Math.min(120, Math.floor(S.t / S.M.T * 120)), clock = `${12 + Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
        ctx.hud.time(S.M.T - S.t); ctx.hud.info(`🕛 ${clock} · ${hearts}${combo}`); if (S.t >= S.M.T && !S.over) end();
      } else {
        const w = S.tix.find(t => !t.next); ctx.hud.time(w ? w.left : 0, true);
        if (w && w.left < 5.5 && w.left > 0 && Math.ceil(w.left) !== S.lastBeep){ S.lastBeep = Math.ceil(w.left); ctx.tone('square', 760, 760, .06, .05); }
        ctx.hud.info(`第 ${Math.min(S.M.N, S.carDone + (w ? 1 : 0))} / ${S.M.N} 辆 · ${hearts}${combo}`);
      }
    },
    stop(){
      document.body.classList.remove('mcd-on', 'mcd-touch');
      S = null;
    }
  };
})());

/* for test scripts and the door panel below */
window.XMcd = {
  get S(){ const s = XMini.sim && XMini.sim.state; return s && s.made ? s : null; },
  modes:['classic', 'rush', 'drive']
};

/* ---------- the door: a yellow ring in front of the glass doors of 麦当当 (js/13-outskirts.js, moved by MDX / MDZ), F 打工配餐 ----------
   Uses the ring and panel helpers of js/89-outskirts-play.js (opSpot / opRing / opOpen / opClose) and plays through XMini.startAt,
   like the KIP and night-market games; when the round is over 奶娃 is back outside the door. */
(() => {
  if (typeof opSpot !== 'function' || typeof opRing !== 'function' || typeof opOpen !== 'function' || typeof MDX === 'undefined') return;
  const MC = {near:false, x:-498.6 + MDX, z:778 + MDZ, door:{x:-499.4 + MDX, z:778 + MDZ, h:-Math.PI / 2, name:'麦当当门口'}};
  MC.S = opSpot('#ffb02e', .45, MC.x, MC.z, '麦当当 · 打工配餐');
  const NAMES = {classic:['经典', '90 秒普通班，做得越多越好'], rush:['午高峰', '客人越来越多，三个差评就下班'], drive:['得来速', '窗口外的车一辆一辆来，每辆都在计时']};
  function open(){
    if (!window.XMini || !XMini.startAt) return;
    const go = id => { opClose(true); XMini.startAt('mcd_' + id, MC.door); };
    const rows = XMcd.modes.map((id, i) => {
      const g = XMini.games.find(x => x.id === 'mcd_' + id), best = XMini.best('mcd_' + id), md = g && g.medals && best != null ? g.medals.findIndex(m => best >= m) : -1;
      return `<button type="button" class="op-card" data-m="${id}"><kbd>${i + 1}</kbd><b>${NAMES[id][0]}</b><span>${NAMES[id][1]}</span>
        <span>${best != null ? `最好 <em>${Math.round(best)} 分</em>${md >= 0 ? ' ' + ['🥇', '🥈', '🥉'][md] : ''} · ` : ''}${g && g.medals ? `金牌 ${g.medals[0]} 分` : ''}</span></button>`;
    }).join('');
    opOpen('🍔 麦当当 · 打工配餐', `<p class="op-note">进后厨帮忙配餐：看小票，<b>从下往上</b>点食材叠汉堡（面包 → 肉饼 → 芝士 → 生菜 → 酱 → 面包），再配<b>薯条大小</b>、<b>饮料加不加冰</b>、儿童餐的<b>玩具</b>，最后「打包交餐」。
      全对有连击和小费，越快赚得越多；做错客人会不高兴。工资按分数发，拿牌还掉改装零件。</p>${rows}`,
      code => { if (code === 'KeyF' || code === 'Enter' || code === 'Space' || code === 'Digit1') go('classic'); else if (code === 'Digit2') go('rush'); else if (code === 'Digit3') go('drive'); });
    for (const b of document.querySelectorAll('#opBody .op-card')) b.addEventListener('click', () => go(b.dataset.m));
  }
  let msg = '';
  function upd(px, pz){
    msg = ''; MC.near = false;
    const other = (typeof mission !== 'undefined' && mission.on) || (typeof gxA !== 'undefined' && !!gxA.act) || (typeof gxTaxi !== 'undefined' && gxTaxi.on)
      || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in) || (typeof opBusy === 'function' && opBusy());
    if (opRing(MC.S, !other && !!window.XMini && Math.abs(px - MC.x) < 420 && Math.abs(pz - MC.z) < 420, px, pz)){
      if (driving) msg = '下车走进圈里，进麦当当打工配餐';
      else if (nw.state !== 'fly'){ MC.near = true; msg = TOUCH ? '点「打工」进麦当当后厨配餐' : '按 F 打工配餐 · 麦当当后厨'; if (typeof setFLabel === 'function') setFLabel('打工'); }
    }
  }
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); upd(px, pz); },
    prompt(){ return msg || base.prompt(); },
    mini(dot){
      base.mini(dot);
      const busy = (typeof mission !== 'undefined' && mission.on) || (typeof gxA !== 'undefined' && !!gxA.act) || (typeof opBusy === 'function' && opBusy());
      if (!busy) dot(MC.x, MC.z, '#ffb02e', 6);
    },
    leave(){ if (typeof opHide === 'function') opHide(MC.S); MC.near = false; msg = ''; base.leave(); }
  });
  const baseF = typeof window.roomTryF === 'function' ? window.roomTryF : null;
  window.roomTryF = function(){ if (MC.near && !driving && nw.state !== 'fly'){ open(); return true; } return baseF ? baseF() : false; };
})();
