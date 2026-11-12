/* 小游戏 · SUKI-YA 火锅放题（IOI City Mall，js/89-ioi.js 门口付钱进来；B1 游戏厅里也有一台）
 * 和阿明、卷卷围着一口鸳鸯锅抢着吃。锅里六个位置，左边寿喜烧、右边昆布汤（辣锅模式右边换成麻辣）。
 * 玩法：
 *   · 店员每隔一两秒往托盘上放一盘（肥牛、羊肉、鸡肉、鱼丸、白菜、金针菇、豆腐、乌冬），点盘子下锅；朋友也会从托盘上拿。
 *   · 每样东西熟得快慢不一样：圈先是红的（生），变白（能吃但嫩），再变成金色——金圈时夹起来是「完美」，连着完美有连击加成；
 *     金圈过了是绿的（还行），再久变褐色（煮老了只算四成），最后煮烂捞掉。
 *   · 阿明和卷卷盯着锅：熟透了你不夹，他们就夹走（「我的肉！」）；他们下的肉你在金圈刚亮的时候抢得到，还多算两成。
 *   · 限时和牛：店员端出金盘子，大家抢；金圈只亮一下。
 *   · 饱腹满了就结束（吃撑），乌冬、豆腐最占肚子；越饱咽得越慢。
 *   · 辣锅模式：麻辣那半边熟得快、算 1.4 倍，但每吃一口辣一截，辣满了辣哭 1.6 秒，喝水（三杯）解辣。
 * 得分：吃到的东西按单点价算「吃回多少钱」（完美 1.2 倍，连击每次多 5%，最多 1.5 倍），铜牌 = 吃回本（RM 39.80），银牌 RM 80，金牌 RM 130。
 * 奖励：只有每天第一局拿到奖牌才发钱（金 20 / 银 12 / 铜 6），比放题的价钱少，所以刷不了钱；改装零件用自己的掉落表 TN_DROPS.sukiya
 *   （金牌 1 罐赛车漆料、银牌一半机会，每天最多掉两次），不用游戏厅那张不限次数的表。成就沿用 js/89-ioi.js 的三个。
 * 排行榜：sukiya（经典）、sukiya_spicy（辣锅），值是吃回的钱（分）。
 * 吃完回到商场门口，奶娃的肚子鼓两分钟（js/89-ioi.js 的 XIOI.fed）。 */
'use strict';
XMini.register((() => {
  /* the set is drawn big (奶娃 are about 2 m tall): a 1.95 m round table, a 1 m pot */
  const PRICE = 39.8, TIME = 60, SLOTS = 6, TRAY = 4, POT_R = 1.0, SLOT_R = .6, TY = 1.0, BROTH_Y = 1.205, TR = 1.95;
  const FOOD = {
    beef:{n:'肥牛', e:'🥩', meat:1, cook:2.2, okT:.8, perf:.55, good:1.0, rm:6.5, fill:6, raw:'#d4606f', done:'#a06a5a', w:22},
    lamb:{n:'羊肉', e:'🐑', meat:1, cook:2.6, okT:.9, perf:.55, good:1.0, rm:6, fill:6, raw:'#d97a78', done:'#9a7468', w:15},
    chick:{n:'鸡肉', e:'🍗', meat:1, cook:4.2, okT:1, perf:.7, good:1.3, rm:3.5, fill:6, raw:'#f2c9b0', done:'#eadcc4', w:10},
    ball:{n:'鱼丸', e:'🍡', cook:4.6, okT:1.1, perf:.8, good:1.8, rm:2.5, fill:4, raw:'#f4eee4', done:'#e8dcc8', w:12},
    cab:{n:'白菜', e:'🥬', cook:2.6, okT:.8, perf:.7, good:1.8, rm:1, fill:2, raw:'#b8e07a', done:'#8fbf5a', w:13},
    enoki:{n:'金针菇', e:'🍄', cook:2.2, okT:.8, perf:.7, good:1.8, rm:1.2, fill:2, raw:'#f4ecd2', done:'#e0d4b0', w:10},
    tofu:{n:'豆腐', e:'⬜', cook:3.2, okT:1, perf:.8, good:2, rm:1, fill:4, raw:'#f7f3e6', done:'#efe0b8', w:10},
    udon:{n:'乌冬', e:'🍜', cook:3.6, okT:1, perf:.8, good:1.8, rm:2, fill:12, raw:'#f4e8c8', done:'#e6d4a6', w:8},
    wagyu:{n:'和牛', e:'✨', meat:1, cook:1.6, okT:.6, perf:.45, good:.7, rm:12, fill:4, raw:'#e88a96', done:'#b07a70', gold:1, w:0}
  };
  const DRAW = Object.keys(FOOD).filter(k => FOOD[k].w > 0), DRAW_W = DRAW.reduce((s, k) => s + FOOD[k].w, 0);
  const Q_MUL = {ok:.8, perf:1.2, good:1, over:.4};
  const SILVER = 80, GOLD = 130;   /* bronze = paying back the buffet (RM 39.80); set with test/sukiya-bot.js, a bit generous since bots are sharper than people */
  /* the two friends at the table; c8 (the story's last chapter) swaps 卷卷 for the new student 阿豆 */
  const FRIENDS = [
    {id:'aming', name:'阿明', color:'#2e9e6a', look:{skin:'blue'}, at:[-2.05, -1.15], steal:1.0, own:.35, take:[3.6, 5.2],
      grab:['嘿嘿，这片我的', '我的肉！', '熟了熟了 lah', '你太慢了 lah'], lost:['喂！我的肉！', '哇你抢我的？', '那片是我下的 lah'], wag:'和牛！我的！'},
    {id:'juanjuan', name:'卷卷', color:'#8e6bd8', look:{skin:'white', face:'glasses'}, at:[2.05, -1.15], steal:1.35, own:.45, take:[4.2, 6],
      grab:['不吃就凉了', '这个我先尝尝', '谢谢款待～', '哎呀手快了'], lost:['……我的鱼丸', '好吧你吃', '下次我先'], wag:'和牛！！'}
  ];
  const ADOU = {id:'adou', name:'阿豆', color:'#f08a3c', look:{skin:'orange', neck:'badge'}, at:[2.05, -1.15], steal:1.6, own:.5, take:[4.6, 6.4],
    grab:['学长这片我吃了', '好好吃！', '原来火锅是这样的'], lost:['学长你好快', '啊，那是我的……', '哈哈学长'], wag:'学长，和牛！'};
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), _c2 = new THREE.Color();
  let S = null;
  /* tuning parts: its own small table with a daily count (js/42-tuning.js TN_DROPS / js/93-tuning-ui.js); without it the game would use the
     uncapped 'arcade' table. At most two drops a day, only the cheapest part (赛车漆料). */
  if (typeof TN_DROPS !== 'undefined' && !TN_DROPS.sukiya) TN_DROPS.sukiya = {name:'SUKI-YA 火锅放题', day:2, g:[[['lacq', 1]], [['lacq', 1, .5]], [], []]};
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const pick = () => { let r = Math.random() * DRAW_W; for (const k of DRAW){ r -= FOOD[k].w; if (r <= 0) return k; } return 'beef'; };
  /* slot positions (stage x, z): left half 0..2 (寿喜烧), right half 3..5 */
  const SLOT_XZ = [135, 180, 225, 45, 0, -45].map(a => { const r = a * Math.PI / 180; return [Math.cos(r) * SLOT_R, -Math.sin(r) * SLOT_R]; });
  const PLACE_ORDER = [1, 4, 0, 3, 2, 5];
  const stageOf = (it) => { const f = it.f, t = it.t; if (t < f.cook) return 'raw'; if (t < f.cook + f.okT) return 'ok'; if (t < f.cook + f.okT + f.perf) return 'perf';
    if (t < f.cook + f.okT + f.perf + f.good) return 'good'; return 'over'; };
  const perfAt = it => it.f.cook + it.f.okT;
  const OVER_T = 2.6;

  /* ---------- styles ---------- */
  { const st = document.createElement('style'); st.textContent = `
#skTop{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--safe-t) + var(--edge) + 62px);width:min(520px,calc(100% - 16px));pointer-events:none!important;
  padding:6px 10px 8px;border-radius:var(--r-md);background:var(--panel-solid);border:1px solid var(--line);box-sizing:border-box;color:var(--ink);font-size:12.5px}
#skTop .sk-l{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums}
#skTop .sk-l b{font-family:var(--display);font-size:17px}
#skTop .sk-l b.back{color:var(--ok)}
.sk-goal{position:relative;height:9px;border-radius:5px;background:var(--chip);margin:5px 0 4px;overflow:hidden}
.sk-goal i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#e8a23a,#e2342f);transition:width .15s}
.sk-goal u{position:absolute;top:0;bottom:0;width:2px;background:var(--ink);opacity:.55}
.sk-who{display:flex;gap:10px;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden}
.sk-who span b{color:var(--ink);font-weight:700}
.sk-meters{display:flex;gap:8px;align-items:center;margin-top:4px;font-size:11.5px;color:var(--muted)}
.sk-meters .m{flex:1;height:6px;border-radius:3px;background:var(--chip);overflow:hidden}
.sk-meters .m i{display:block;height:100%;width:0}
.sk-meters .full i{background:#e0a020}.sk-meters .hot i{background:linear-gradient(90deg,#ffb03a,#e8321e)}
.sk-slot{position:fixed;left:0;top:0;z-index:4;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:0;padding:0;background:transparent;cursor:pointer;
  touch-action:manipulation;font:700 12px/1.05 var(--display,sans-serif);color:#2b2f36;text-shadow:0 0 3px #fff,0 0 3px #fff;will-change:transform;-webkit-tap-highlight-color:transparent}
.sk-slot[hidden]{display:none}
.sk-slot .r{position:absolute;inset:3px;border-radius:50%;-webkit-mask:radial-gradient(circle,transparent 64%,#000 66%);mask:radial-gradient(circle,transparent 64%,#000 66%)}
.sk-slot .t{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%}
.sk-slot .t small{font-size:10px;font-weight:600;color:#3a3f46}
.sk-slot.perf{animation:skPulse .22s infinite alternate}
.sk-slot.his .t::after{content:'';position:absolute;top:4px;right:6px;width:10px;height:10px;border-radius:50%;background:var(--who);box-shadow:0 0 0 2px #fff}
@keyframes skPulse{to{transform:scale(1.12)}}
#skTray[hidden]{display:none}
#skTray{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--safe-b, 0px) + 10px);z-index:4;display:flex;gap:6px;width:min(560px,calc(100% - 16px));box-sizing:border-box}
#skTray button{flex:1 1 0;min-width:0;min-height:62px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--panel-solid);color:var(--ink);font:inherit;font-size:13px;font-weight:700;
  cursor:pointer;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px;position:relative;-webkit-tap-highlight-color:transparent}
#skTray button .e{font-size:22px;line-height:1}
#skTray button small{font-size:10.5px;font-weight:500;color:var(--muted)}
#skTray button.empty{opacity:.35;cursor:default}
#skTray button.gold{background:#ffd75a;border-color:#b8860b;color:#2b2f36;animation:skPulse .3s infinite alternate}
#skTray button.meat{border-top:3px solid #d4606f}
#skTray button.act{flex:1.15 1 0;background:var(--tile);color:var(--on-accent);border-color:transparent}
#skTray button.water{flex:1 1 0;background:#2d7fd6;color:#fff;border-color:transparent}
#skTray button.water.no{opacity:.4}
#skTray kbd{position:absolute;top:3px;left:5px;font-size:9.5px;padding:0 3px}
.sk-bub{position:fixed;left:0;top:0;z-index:5;padding:4px 10px;border-radius:14px;background:#fffbe8;color:#2a2018;font-weight:800;font-size:14px;white-space:nowrap;pointer-events:none!important;
  box-shadow:0 2px 6px rgba(0,0,0,.25);will-change:transform}
.sk-bub[hidden]{display:none}
.sk-bub.mad{background:#e8321e;color:#fff}
.sk-pop{position:fixed;left:0;top:0;z-index:6;font:800 18px var(--display,sans-serif);pointer-events:none!important;text-shadow:0 1px 0 #fff,0 0 6px rgba(255,255,255,.9);will-change:transform,opacity}
@media (min-width: 900px) and (min-aspect-ratio: 1/1){ #skTop{left:16px;transform:none;width:300px;top:auto;bottom:calc(var(--safe-b, 0px) + 16px)} }
@media (max-aspect-ratio: 1/1){ #skTop{top:auto;bottom:calc(var(--safe-b, 0px) + 84px)} }
@media (pointer: coarse){ #skTray kbd{display:none} }
@media (prefers-reduced-motion: reduce){ .sk-slot.perf,#skTray button.gold{animation:none} }
body.sk-on #mgBtnA,body.sk-on #mgBtnB{display:none!important}`; document.head.appendChild(st); }

  /* ---------- the set: floor, back wall with the shop sign, the table, the split pot ---------- */
  const signTex = () => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#1a1414'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#b3221b'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ff4a3a'; g.font = '900 54px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.fillText('SUKI-YA', 256, 52);
    g.fillStyle = '#f4ead8'; g.font = '600 22px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.fillText('寿喜烧 · 涮涮锅 吃到饱', 256, 98);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO; return t; };
  function build(ctx){
    const R = ctx.root, list = [], tb = (w, h, d, x, y, z, col) => list.push(geoTint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col));
    const cyl = (rt, rb, h, x, y, z, col, seg, a0, al) => list.push(geoTint(new THREE.CylinderGeometry(rt, rb, h, seg || 24, 1, false, a0 || 0, al || Math.PI * 2).translate(x, y, z), col));
    /* floor and the booth walls behind the table */
    tb(14, .02, 11, 0, -.01, -.5, '#a8784e');
    for (let i = 0; i < 14; i++) tb(.03, .021, 11, -7 + i, 0, -.5, '#8a5f3a');
    tb(14, 3.6, .25, 0, 1.8, -4.6, '#4a2f1f'); tb(14, .3, .35, 0, .15, -4.55, '#2e1d13');
    for (const x of [-5.4, 5.4]) tb(.25, 3.6, 9, x, 1.8, -.2, '#55372a');
    /* the self-service bar on the back wall, trays of vegetables */
    tb(5.2, 1.2, .9, 0, .6, -4.0, '#8d9196'); tb(5.2, .05, .92, 0, 1.22, -4.0, '#c8ccd0');
    ['#a8d86a', '#f2ead0', '#f4f1e6', '#f2d0d8', '#e8a040', '#7fbf4a', '#f2c230', '#c0392b'].forEach((c, i) => tb(.52, .07, .6, -2.1 + i * .6, 1.28, -4.0, c));
    /* the round table, a wooden rim, the induction hob and the pot (two halves and a divider) */
    cyl(TR, TR, .08, 0, TY - .04, 0, '#5a3a26', 44); cyl(TR + .04, TR + .04, .04, 0, TY - .1, 0, '#3b2418', 44); cyl(.25, .5, TY - .12, 0, (TY - .12) / 2, 0, '#2e1d13', 12);
    cyl(POT_R + .07, POT_R + .07, .04, 0, TY + .02, 0, '#1d1d20', 40);
    cyl(POT_R, POT_R - .06, .2, 0, TY + .1, 0, '#2b2b2e', 40);   /* rim top at 1.2, the broth just above */
    tb(POT_R * 2 - .06, .08, .05, 0, BROTH_Y + .015, 0, '#2b2b2e');
    /* side plates, chopsticks, raw-egg bowls for the three eaters */
    for (const [x, z] of [[0, 1.5], [-1.35, -.76], [1.35, -.76]]){ cyl(.24, .2, .03, x, TY + .015, z, '#f4f1ea', 18); cyl(.13, .11, .09, x + .38, TY + .045, z + .1, '#f4f1ea', 14); tb(.035, .025, .46, x - .34, TY + .015, z, '#c9a06a'); }
    const set = new THREE.Mesh(geoMerge(list), M('#ffffff', {vertexColors:true, roughness:.75})); set.receiveShadow = true; R.add(set);
    /* the broth: two half discs, coloured by the mode (spicy turns the right half red) */
    const half = (a0, col) => { const m = new THREE.Mesh(new THREE.CircleGeometry(POT_R - .05, 28, a0, Math.PI), new THREE.MeshStandardMaterial({color:col, roughness:.25, metalness:.05}));
      m.rotation.x = -Math.PI / 2; m.position.y = BROTH_Y; R.add(m); return m; };
    S.brothL = half(Math.PI / 2, '#8a5a2b'); S.brothR = half(-Math.PI / 2, S.spicy ? '#c0301e' : '#d9cdb0');
    /* the shop sign on the back wall */
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .9), new THREE.MeshBasicMaterial({map:signTex()})); sg.position.set(0, 2.9, -4.46); R.add(sg);
    /* food in the pot (6) and flying to a mouth (6): one instanced mesh */
    const fg = new THREE.CylinderGeometry(.15, .15, .055, 14);
    S.im = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({roughness:.6}), SLOTS + 6); S.im.frustumCulled = false; R.add(S.im);
    for (let i = 0; i < SLOTS + 6; i++){ _m.makeScale(0, 0, 0); S.im.setMatrixAt(i, _m); S.im.setColorAt(i, _c.set('#ffffff')); }
  }
  function setInst(i, x, y, z, sx, sy, sz, ry){ _p.set(x, y, z); _e.set(0, ry || 0, 0); _q.setFromEuler(_e); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); S.im.setMatrixAt(i, _m); }

  /* ---------- the people ---------- */
  function eater(o){ return Object.assign({rm:0, n:0, chew:0, chomp:0, fill:0, take:0, bubT:0, combo:0, best:0, perf:0, heat:0, stun:0, water:3, stole:0, lost:0}, o || {}); }
  function dress(a, look){ if (typeof nwDress === 'function'){ try { nwDress(a.parts, Object.assign(typeof wdLook === 'function' ? wdLook(null) : {}, look || {})); } catch(e){} } }
  function pose(E, dt){
    const a = E.a, P = a.parts, [aL, aR] = P.arms, [eL, eR] = P.elbows || [], T = S.t;
    E.chomp = Math.max(0, E.chomp - dt * 6); const c = E.chomp, ch = c * c * (3 - 2 * c);
    let lean = .18 + ch * .18, aRx = -.55 - ch * 1.3, aRz = -.2, eRx = -1.25 - ch * .8, aLx = -.5, aLz = .3, eLx = -1.3, roll = 0, jump = 0, mouth = .02 + ch * .09;
    if (E.stun > 0){ jump = Math.abs(Math.sin(T * 14)) * .1; aLx = aRx = -.3; aLz = 1.4 + Math.sin(T * 20) * .4; aRz = -aLz; mouth = .1; }
    else if (E.mad > 0){ roll = Math.sin(T * 30) * .06; aLz = .9; aRz = -.9; mouth = .08; }
    else if (E.reach > 0){ aRx = -1.5; aRz = -.1; eRx = -.4; lean = .38; }
    if (S.over && E === S.me){ lean = -.15; aLz = 2.4; aRz = -2.4; aLx = aRx = -.2; jump = Math.abs(Math.sin(T * 7)) * .18; mouth = .1; }
    E.mad = Math.max(0, (E.mad || 0) - dt); E.reach = Math.max(0, (E.reach || 0) - dt);
    const k = Math.min(1, dt * 16);
    aL.rotation.x += (aLx - aL.rotation.x) * k; aL.rotation.z += (aLz - aL.rotation.z) * k; aR.rotation.x += (aRx - aR.rotation.x) * k; aR.rotation.z += (aRz - aR.rotation.z) * k;
    if (eL){ eL.rotation.x += (eLx - eL.rotation.x) * k; eR.rotation.x += (eRx - eR.rotation.x) * k; }
    P.body.rotation.x += (lean - P.body.rotation.x) * k; P.body.rotation.z = roll;
    /* the belly fills up as you eat */
    const bs = E.sbase * (1 + Math.min(1.2, E.fill / 100) * .2);
    P.body.scale.set(bs * (1 + ch * .03), E.sbase * (1 - ch * .04), bs * (1 + ch * .03));
    if (P.mouth) P.mouth.scale.y += (mouth - P.mouth.scale.y) * k;
    a.obj.position.set(a.x, jump, a.z); a.obj.rotation.y = a.h;
  }
  /* hints sit at the bottom of the screen, over the tray: show them for a moment only */
  function hint(t, sec){ if (!S) return; S.ctx.hud.hint(t); S.hintT = t ? (sec || 2.2) : 0; }
  function say(E, text, mad){
    if (!E.bub) return; E.bub.textContent = text; E.bub.hidden = false; E.bub.classList.toggle('mad', !!mad); E.bubT = 1.5;
  }
  function pop(x, y, z, text, col){
    const el = S.pops.find(p => p.t <= 0); if (!el) return;
    el.el.textContent = text; el.el.style.color = col || '#2b2f36'; el.t = .9; el.x = x; el.y = y; el.z = z; el.el.hidden = false;
  }

  /* ---------- the waiter and the pot ---------- */
  function trayPut(k){ const i = S.tray.indexOf(null); if (i < 0) return false; S.tray[i] = {k, t:0}; S.trayDirty = true; return true; }
  function potPut(k, who){
    const f = FOOD[k]; let s = -1;
    for (const i of PLACE_ORDER) if (!S.pot[i]){ s = i; break; }
    if (s < 0) return -1;
    S.pot[s] = {k, f, t:0, who, spicy:S.spicy && s >= 3, wob:Math.random() * 6};
    if (S.pot[s].spicy) S.pot[s].t = 0;
    S.ctx.noise(.14, .05, 2600, 'highpass'); return s;
  }
  function fromTray(i, who){
    const p = S.tray[i]; if (!p) return false;
    if (S.pot.every(Boolean)){ if (who === S.me) { hint('锅里满了，先夹几样吃掉'); S.ctx.tone('square', 220, 180, .07, .05); } return false; }
    S.tray[i] = null; S.trayDirty = true; potPut(p.k, who);
    if (who === S.me) S.ctx.tone('triangle', 520, 620, .07, .06);
    return true;
  }
  /* eat what is in slot s: E is who eats it */
  function eat(E, s){
    const it = S.pot[s]; if (!it) return false;
    const st = stageOf(it), ctx = S.ctx, me = E === S.me;
    if (st === 'raw'){
      if (me){ ctx.hud.callout('还没熟！', it.f.meat ? '生肉吃了会肚子疼' : '圈变白了才能吃', '#e8423a'); ctx.sfx.fail(); S.me.combo = 0;
        if (it.f.meat){ S.me.stun = .8; ctx.camera.shake(.25); } }
      return false;
    }
    if (E.chew > 0 || E.stun > 0) return false;
    S.pot[s] = null;
    const [x, z] = SLOT_XZ[s];
    let mul = Q_MUL[st];
    if (it.spicy) mul *= 1.4;
    const steal = it.who !== E && it.who !== null;
    if (me){
      if (st === 'perf'){ E.combo++; E.perf++; E.best = Math.max(E.best, E.combo); } else if (st === 'over') E.combo = 0;
      mul *= 1 + .05 * Math.min(10, E.combo);
      if (steal) mul *= 1.2;
    }
    const v = it.f.rm * mul;
    E.rm += v; E.n++; E.fill += it.f.fill; E.chew = .3 + .45 * Math.min(1, E.fill / 100); E.chomp = 1;
    if (it.spicy){ E.heat += 24; if (E.heat >= 100){ E.heat = 60; E.stun = 1.6; if (me){ ctx.hud.callout('辣哭了！', '辣条快满的时候先喝水', '#e8321e'); ctx.camera.shake(.3); ctx.sfx.fail(); } } }
    /* fly to the mouth */
    const fi = S.flyN++ % 6; S.fly[fi] = {x0:x, z0:z, x1:E.a.x * .88, z1:E.a.z * .88, t:0, col:it.f.done, g:it.f.gold};
    if (me){
      const tag = st === 'perf' ? '完美' : st === 'ok' ? '嫩了点' : st === 'over' ? '煮老了' : '';
      const col = st === 'perf' ? '#e0a400' : st === 'over' ? '#8a5a2b' : '#2b8a4a';
      pop(x, BROTH_Y + .3, z, `${tag ? tag + ' ' : ''}+${v.toFixed(1)}`, col);
      if (st === 'perf'){ ctx.tone('triangle', 660 * Math.pow(1.122, Math.min(12, E.combo)), 660 * Math.pow(1.122, Math.min(12, E.combo)), .12, .1); if (E.combo >= 3 && E.combo % 3 === 0) ctx.hud.callout('连击 ×' + E.combo, '每一口都踩在金圈上', '#e0a400'); }
      else if (st === 'over') ctx.tone('sine', 300, 220, .12, .06); else ctx.tone('triangle', 520, 560, .08, .07);
      if (steal){ const F = it.who; F.mad = .8; say(F, F.lost[(Math.random() * F.lost.length) | 0], true); E.stole++; ctx.hud.callout('抢到了！', `${F.name}下的${it.f.n} · 多算两成`, '#ff7a3d'); }
      if (it.f.gold){ ctx.hud.callout('和牛！', `+RM ${v.toFixed(1)}`, '#e0a400'); ctx.sfx.sparkle(); }
      if (ctx.q > 0) for (let k = 0; k < (st === 'perf' ? 4 : 2); k++) ctx.part('heart', E.a.x + (Math.random() - .5) * .5, 2.5, E.a.z, .55, {vy:1.4, life:.8, op:1, color:st === 'perf' ? '#ffcf3a' : '#ff8a7a'});
      if (E.fill >= 100){ E.fill = 100; end('full'); }
    } else {
      if (it.who === S.me){ say(E, E.grab[(Math.random() * E.grab.length) | 0]); S.me.lost++; S.me.combo = 0; ctx.hud.callout(`被${E.name}夹走了！`, `你的${it.f.n} · 金圈亮了要快`, '#8e6bd8'); ctx.tone('sawtooth', 300, 200, .14, .05); }
      else if (it.f.gold) say(E, E.wag);
      else if (Math.random() < .25) say(E, E.grab[(Math.random() * E.grab.length) | 0]);
      E.reach = .3;
    }
    return true;
  }
  /* the button / Space: eat the most urgent thing that can be eaten */
  function eatBest(E){
    let best = -1, bk = -1e9;
    S.pot.forEach((it, s) => { if (!it) return; const st = stageOf(it); if (st === 'raw') return; const k = it.t - perfAt(it) + (st === 'over' ? 50 : 0); if (k > bk){ bk = k; best = s; } });
    if (best >= 0) return eat(E, best);
    if (E === S.me){ hint('锅里还没有能吃的：圈变白就能夹，金圈最好'); S.ctx.tone('square', 220, 180, .06, .04); }
    return false;
  }
  function drink(){
    const P = S.me; if (P.water <= 0){ hint('没水了，别再吃麻辣那边了'); return; }
    P.water--; P.heat = Math.max(0, P.heat - 55); P.stun = Math.min(P.stun, .2); S.ctx.sfx.splash ? S.ctx.sfx.splash() : S.ctx.tone('sine', 500, 300, .15, .06);
    S.trayDirty = true;
  }
  /* the friends: take plates off the tray, eat their own food first, then whatever is left cooking too long */
  function ai(F, dt){
    if (F.chew > 0 || S.over) return;
    F.take -= dt;
    if (F.take <= 0 && !S.pot.every(Boolean)){
      const i = S.tray.findIndex(p => p && FOOD[p.k].gold) >= 0 ? S.tray.findIndex(p => p && FOOD[p.k].gold) : S.tray.findIndex(p => p && FOOD[p.k].meat) >= 0 ? S.tray.findIndex(p => p && FOOD[p.k].meat) : S.tray.findIndex(Boolean);
      if (i >= 0 && (!FOOD[S.tray[i].k].gold || S.tray[i].t > F.wagT)){ fromTray(i, F); F.reach = .35; F.take = F.takeR[0] + Math.random() * (F.takeR[1] - F.takeR[0]); }
      else if (i < 0) F.take = .5;
    }
    /* rubber band: the further ahead you are, the quicker they are */
    const lead = S.me.rm - (S.fr[0].rm + S.fr[1].rm) / 2, sp = Math.max(.6, Math.min(1.25, 1 - lead / 120));
    let pickS = -1, pk = -1e9;
    S.pot.forEach((it, s) => {
      if (!it) return; const st = stageOf(it); if (st === 'raw' || st === 'ok') return;
      const since = it.t - perfAt(it), wait = (it.who === F ? F.own : it.f.gold ? F.steal * .55 : F.steal) * sp + F.jit;
      if (since < wait) return;
      const k = since - wait + (it.who === F ? 1 : 0) + (it.f.meat ? .5 : 0);
      if (k > pk){ pk = k; pickS = s; }
    });
    if (pickS >= 0){ eat(F, pickS); F.jit = (Math.random() - .5) * .4; }
  }

  /* ---------- HUD ---------- */
  function hudInit(ctx){
    const top = document.createElement('div'); top.id = 'skTop';
    top.innerHTML = `<div class="sk-l"><span id="skCombo"></span><b id="skRm">RM 0.00</b><span>回本 RM ${PRICE.toFixed(2)}</span></div>
      <div class="sk-goal"><i id="skGoalB"></i>${S.marks.map(v => `<u style="left:${(v / S.gMax * 100).toFixed(1)}%"></u>`).join('')}</div>
      <div class="sk-who" id="skWho"></div>
      <div class="sk-meters">饱<span class="m full"><i id="skFill"></i></span>${S.spicy ? '辣<span class="m hot"><i id="skHot"></i></span>' : ''}</div>`;
    ctx.ui.append(top); S.top = top;
    S.slotEl = [];
    for (let s = 0; s < SLOTS; s++){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sk-slot'; b.hidden = true; b.dataset.s = s; b.setAttribute('aria-label', '锅里第 ' + (s + 1) + ' 格');
      b.innerHTML = '<span class="r"></span><span class="t"><span></span><small></small></span>'; ctx.ui.append(b); S.slotEl.push({b, r:b.querySelector('.r'), n:b.querySelector('.t span'), sm:b.querySelector('small'), key:'', pos:''});
      ctx.on(b, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S && !S.over && S.started) eat(S.me, +b.dataset.s); });
    }
    const tray = document.createElement('div'); tray.id = 'skTray'; S.trayEl = [];
    for (let i = 0; i < TRAY; i++){ const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; tray.append(b); S.trayEl.push(b);
      ctx.on(b, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S && !S.over && S.started && S.me.stun <= 0) fromTray(+b.dataset.i, S.me); }); }
    const act = document.createElement('button'); act.type = 'button'; act.className = 'act'; act.innerHTML = '<span class="e">🥢</span>夹！<kbd>空格</kbd>'; tray.append(act);
    ctx.on(act, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S && !S.over && S.started && S.me.stun <= 0) eatBest(S.me); });
    if (S.spicy){ const w = document.createElement('button'); w.type = 'button'; w.className = 'water'; tray.append(w); S.waterEl = w;
      ctx.on(w, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S && !S.over && S.started) drink(); }); }
    ctx.ui.append(tray); S.tray_ = tray;
    /* buttons never keep the focus (the platform ignores Space on a focused button), keys 1–4 take a plate off the tray */
    for (const el of [tray, ...S.slotEl.map(o => o.b)]) ctx.on(el, 'mousedown', e => e.preventDefault());
    ctx.on(window, 'keydown', e => { const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code); if (m && S && S.started && !S.over && XMini.state === 'play'){ S.keyQ.push(+m[1] - 1); } });
    for (const E of S.fr){ E.bub = document.createElement('div'); E.bub.className = 'sk-bub'; E.bub.hidden = true; ctx.ui.append(E.bub); }
    S.pops = []; for (let i = 0; i < 6; i++){ const el = document.createElement('div'); el.className = 'sk-pop'; el.hidden = true; ctx.ui.append(el); S.pops.push({el, t:0, x:0, y:0, z:0}); }
    S.trayDirty = true;
  }
  const RING = {raw:'#e8423a', ok:'#f4f1ea', perf:'#ffcf1a', good:'#4fd18b', over:'#8a5a2b'};
  function hud(dt, ctx){
    const P = S.me;
    const rm = 'RM ' + P.rm.toFixed(2); if (S.lastRm !== rm){ S.lastRm = rm; const el = document.getElementById('skRm'); el.textContent = rm; el.classList.toggle('back', P.rm >= PRICE); document.getElementById('skGoalB').style.width = Math.min(100, P.rm / S.gMax * 100).toFixed(1) + '%'; }
    const cb = P.combo >= 2 ? `连击 ×${P.combo}` : P.perf ? `完美 ${P.perf}` : ''; if (S.lastCb !== cb){ S.lastCb = cb; document.getElementById('skCombo').textContent = cb; }
    const who = S.fr.map(F => `<span>${F.name} <b>RM ${F.rm.toFixed(0)}</b></span>`).join('') + (P.stole ? `<span>抢到 <b>${P.stole}</b></span>` : '') + (P.lost ? `<span>被夹走 <b>${P.lost}</b></span>` : '');
    if (S.lastWho !== who){ S.lastWho = who; document.getElementById('skWho').innerHTML = who; }
    const fw = Math.min(100, P.fill).toFixed(0) + '%', fe = document.getElementById('skFill'); if (fe.style.width !== fw) fe.style.width = fw;
    if (S.spicy){ const hw = Math.min(100, P.heat).toFixed(0) + '%', he = document.getElementById('skHot'); if (he.style.width !== hw) he.style.width = hw;
      const wl = `<span class="e">💧</span>喝水 ${P.water}<kbd>K</kbd>`; if (S.lastW !== wl){ S.lastW = wl; S.waterEl.innerHTML = wl; } S.waterEl.classList.toggle('no', P.water <= 0); }
    /* the slot rings over the pot */
    for (let s = 0; s < SLOTS && !S.over; s++){
      const it = S.pot[s], E = S.slotEl[s];
      if (!it){ if (!E.b.hidden){ E.b.hidden = true; E.key = ''; } continue; }
      const st = stageOf(it), f = it.f;
      const p = st === 'raw' ? it.t / f.cook : st === 'ok' ? (it.t - f.cook) / f.okT : st === 'perf' ? 1 - (it.t - perfAt(it)) / f.perf : st === 'good' ? 1 - (it.t - perfAt(it) - f.perf) / f.good : 1 - (it.t - perfAt(it) - f.perf - f.good) / OVER_T;
      const key = st + '|' + it.k + '|' + (it.who === S.me ? 'me' : it.who ? it.who.id : '') + '|' + Math.round(p * 24);
      if (E.key !== key){
        E.key = key; E.b.hidden = false; E.b.className = 'sk-slot ' + st + (it.who && it.who !== S.me ? ' his' : '');
        if (it.who && it.who !== S.me) E.b.style.setProperty('--who', it.who.color);
        E.r.style.background = `conic-gradient(${RING[st]} ${(Math.max(0, Math.min(1, p)) * 100).toFixed(0)}%, rgba(0,0,0,.28) 0)`;
        E.n.textContent = f.n; E.sm.textContent = st === 'raw' ? '' : st === 'perf' ? '现在！' : st === 'over' ? '老了' : st === 'ok' ? '嫩' : '';
      }
      const [x, z] = SLOT_XZ[s], [sx, sy] = ctx.screen(x, BROTH_Y + .03, z), pos = `translate(${sx | 0}px,${sy | 0}px)`; if (E.pos !== pos){ E.pos = pos; E.b.style.transform = pos; }
    }
    if (S.trayDirty){
      S.trayDirty = false;
      S.trayEl.forEach((b, i) => { const p = S.tray[i];
        if (!p){ b.className = 'empty'; b.innerHTML = `<span class="e">·</span><small>等上菜</small><kbd>${i + 1}</kbd>`; return; }
        const f = FOOD[p.k]; b.className = f.gold ? 'gold' : f.meat ? 'meat' : '';
        b.innerHTML = `<span class="e">${f.e}</span>${f.n}<small>${f.gold ? '限时！' : 'RM ' + f.rm + ' · ' + f.cook + 's'}</small><kbd>${i + 1}</kbd>`; });
    }
    for (const E of S.fr){ if (E.bub.hidden) continue; E.bubT -= dt; if (E.bubT <= 0){ E.bub.hidden = true; continue; }
      const [x, y0] = ctx.screen(E.a.x, 2.3, E.a.z), y = Math.max(96, y0); E.bub.style.transform = `translate(${Math.max(60, Math.min(innerWidth - 60, x)) | 0}px,${y | 0}px) translate(-50%,-100%)`; }   /* kept on screen: the friends sit at the top edge */
    for (const p of S.pops){ if (p.t <= 0) continue; p.t -= dt; if (p.t <= 0){ p.el.hidden = true; continue; }
      const [x, y] = ctx.screen(p.x, p.y + (.9 - p.t) * .35, p.z); p.el.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-50%)`; p.el.style.opacity = Math.min(1, p.t * 3).toFixed(2); }
  }
  function layout(ctx){
    const por = ctx.aspect < 1; if (S.por === por) return; S.por = por;
    /* portrait phones: the friends sit further round the table so they stay in the picture */
    S.fr.forEach((F, i) => { const sx = i ? 1 : -1, [x, z] = por ? [sx * 1.5, -1.75] : F.at; F.a.x = x; F.a.z = z; F.a.h = Math.atan2(-x, -z); });
    if (por) ctx.camera.fit({cx:0, cz:.15, y:TY, w:3.3, d:4.3, pitch:1.3, fov:46, margin:1.02});
    else ctx.camera.fit({cx:0, cz:.35, y:TY, w:6.4, d:4.2, pitch:1.2, fov:46, margin:1.03});
    ctx.camera.snap();
  }

  function end(why){
    if (S.over) return; S.over = true; S.why = why;
    if (S.tray_) S.tray_.hidden = true; for (const E of S.slotEl) E.b.hidden = true;
    const P = S.me, ctx = S.ctx, v = Math.round(P.rm * 100), back = P.rm >= PRICE;
    if (back) ctx.unlock('sukiback'); if (P.rm >= GOLD) ctx.unlock('sukiking');
    const won = S.fr.every(F => P.rm > F.rm);
    const stat = `${P.n} 盘 · 完美 ${P.perf} · 最高连击 ${P.best}${P.stole ? ` · 抢到 ${P.stole}` : ''}${P.lost ? ` · 被夹走 ${P.lost}` : ''}${won ? ' · 全桌最能吃' : ''}`;
    ctx.after(.9, () => ctx.finish(v, {kicker:why === 'full' ? '吃撑了' : '时间到', title:back ? (P.rm >= GOLD ? '吃货之王！' : P.rm >= SILVER ? '赚到了！' : '吃回本了！') : `还差 RM ${(PRICE - P.rm).toFixed(2)} 回本`,
      big:'吃回 RM ' + P.rm.toFixed(2), sub:stat}));
    S.ctx.hud.hint(''); S.hintT = 0; if (why === 'full') ctx.hud.callout('吃撑了！', '一口都吃不下了', '#e0a020');
  }

  return {
    id:'sukiya', name:'SUKI-YA 火锅放题', icon:'🍲', color:'#e2342f',
    parts:'sukiya',
    desc:'和阿明、卷卷围着鸳鸯锅抢着吃：金圈时夹最香，慢了就被夹走',
    intro:'点托盘上的菜下锅；圈变成金色时点它（或按空格「夹」）是「完美」，连着完美有加成。熟透了不夹，朋友就夹走；他们下的肉你也能抢。吃撑或 60 秒到就结束，看吃回多少钱：吃回 RM 39.80 就回本。',
    controls:{help:{touch:'点托盘上的菜下锅 · 点锅里亮金圈的那样夹走（或点「夹！」）', key:'鼠标点，或 1–4 下锅 · 空格夹最熟的 · Esc 暂停'}},
    board:{fmt:v => 'RM ' + (v / 100).toFixed(2), max:100000},
    medals:[GOLD * 100, SILVER * 100, Math.round(PRICE * 100)],
    sky:'#2a1a12', shadow:6,
    modes:[
      {id:'classic', key:'sukiya', name:'寿喜烧 + 昆布', desc:'经典鸳鸯锅'},
      {id:'spicy', name:'寿喜烧 + 麻辣', desc:'麻辣那边熟得快、算 1.4 倍，但会辣',
        intro:'右边换成麻辣锅：下在右边的熟得快、算 1.4 倍，可每吃一口辣一截，辣满了辣哭 1.6 秒；喝水（三杯）解辣。其余和经典一样：金圈时夹最香，慢了被朋友夹走，吃回 RM 39.80 就回本。',
        controls:{help:{touch:'点托盘上的菜下锅 · 点锅里的金圈夹走 · 蓝色「喝水」解辣', key:'1–4 下锅 · 空格夹 · K 喝水 · Esc 暂停'}}}
    ],
    /* paid once a day only (the buffet itself costs more than any of these, so it cannot be farmed) */
    reward(score, medal){
      if (medal > 2 || !S || !S.ctx) return 0;
      const st = S.ctx.store, d = dayKey(); if (st.get('payDay') === d) return 0;
      st.set('payDay', d); return [20, 12, 6][medal];
    },
    start(ctx){
      const c8 = !!(window.XQuest && XQuest.step && (XQuest.step() || {}).id === 'c8_suki');
      S = {ctx, t:0, over:false, started:false, spicy:ctx.mode === 'spicy', pot:Array(SLOTS).fill(null), tray:Array(TRAY).fill(null), fly:[], flyN:0, waitT:.2, wagyu:[17 + Math.random() * 4, 40 + Math.random() * 5], rush:false,
        marks:[PRICE, SILVER, GOLD], gMax:150, keyQ:[], por:null, steamT:0, lastRm:'', lastCb:'', lastWho:'', lastW:''};
      S.me = eater({me:true}); S.fr = [FRIENDS[0], c8 ? ADOU : FRIENDS[1]].map(F => eater(Object.assign({}, F, {takeR:F.take, take:1.2 + Math.random(), jit:0, wagT:F.id === 'aming' ? .9 : 1.3})));
      build(ctx);
      S.me.a = ctx.actor({}); S.me.a.x = 0; S.me.a.z = 2.4; S.me.a.h = Math.PI;
      if (typeof nwDress === 'function' && typeof wardSave !== 'undefined'){ try { nwDress(S.me.a.parts, wardSave.look); } catch(e){} }
      for (const F of S.fr){ F.a = ctx.actor({}); dress(F.a, F.look); F.a.x = F.at[0]; F.a.z = F.at[1]; F.a.h = Math.atan2(-F.at[0], -F.at[1]); }
      for (const E of [S.me, ...S.fr]){ E.sbase = E.a.parts.body.scale.x || 1; for (const l of E.a.parts.legs || []) l.visible = false; }   /* the camera looks down over the table: legs are never seen, three 奶娃 are most of the draw calls */
      for (let i = 0; i < 2; i++) trayPut(i ? 'cab' : 'beef');
      hudInit(ctx); layout(ctx);
      document.body.classList.add('sk-on');
      ctx.hud.time(TIME); ctx.hud.score('RM 0');
      hint(ctx.touch ? '点托盘上的菜下锅，圈变金色时点它' : '点托盘上的菜（或 1–4）下锅，圈变金色时点它（或空格）', 5);
      for (const E of [S.me, ...S.fr]) pose(E, 0);
      S.started = true;
      ctx.debug(S);
    },
    update(dt, ctx){
      layout(ctx);
      const P = S.me;
      if (S.hintT > 0 && (S.hintT -= dt) <= 0) ctx.hud.hint('');
      if (!S.over){
        S.t += dt;
        /* keyboard */
        while (S.keyQ.length){ const i = S.keyQ.shift(); if (P.stun <= 0) fromTray(i, P); }
        if (P.stun <= 0 && ctx.input.pressed('a')) eatBest(P);
        if (S.spicy && ctx.input.pressed('b')) drink();
        /* the waiter */
        if (!S.rush && S.t > TIME - 15){ S.rush = true; ctx.hud.callout('最后 15 秒', '店员加快上菜！', '#e2342f'); }
        S.waitT -= dt;
        if (S.waitT <= 0){ S.waitT = (S.rush ? 1.05 : 1.7) + Math.random() * .5; trayPut(pick()); }
        for (let w = 0; w < S.wagyu.length; w++) if (S.wagyu[w] && S.t >= S.wagyu[w]){
          S.wagyu[w] = 0; const i = S.tray.indexOf(null) >= 0 ? S.tray.indexOf(null) : TRAY - 1; S.tray[i] = {k:'wagyu', t:0}; S.trayDirty = true;
          ctx.hud.callout('限时和牛！', '店员端出来了，快抢！', '#e0a400'); ctx.sfx.sparkle();
        }
        for (const p of S.tray) if (p) p.t += dt;
        /* cooking */
        S.pot.forEach((it, s) => { if (!it) return; it.t += dt * (it.spicy ? 1.18 : 1);
          if (it.t > perfAt(it) + it.f.perf + it.f.good + OVER_T){ S.pot[s] = null; if (it.who === P){ P.combo = 0; ctx.hud.callout('煮烂了', `${it.f.n}捞掉了`, '#8a5a2b'); ctx.tone('sawtooth', 240, 140, .2, .05); }
            if (ctx.q > 0) ctx.part('dust', SLOT_XZ[s][0], BROTH_Y + .1, SLOT_XZ[s][1], .5, {vy:.8, grow:1.6, life:1, op:.5, color:'#5a4a40'}); }
          else if (it.t >= perfAt(it) && !it.dinged && it.who === P){ it.dinged = 1; ctx.tone('sine', 1180, 1180, .05, .04); } });
        for (const E of [P, ...S.fr]){ E.chew = Math.max(0, E.chew - dt); E.stun = Math.max(0, E.stun - dt); E.heat = Math.max(0, E.heat - 6 * dt); }
        for (const F of S.fr) ai(F, dt);
        if (!S.over && S.t >= TIME) end('time');
      }
      /* steam and the food in the pot */
      S.steamT -= dt; if (S.steamT <= 0){ S.steamT = ctx.q > 1 ? .08 : ctx.q > 0 ? .14 : .3; const a = Math.random() * 6.28, r = Math.random() * POT_R * .8;
        ctx.part('dust', Math.cos(a) * r, BROTH_Y + .05, Math.sin(a) * r, .55, {vy:.55 + Math.random() * .3, grow:1.4, life:1.3, op:.28, color:'#ffffff'}); }
      const T = S.t;
      for (let s = 0; s < SLOTS; s++){
        const it = S.pot[s]; if (!it){ setInst(s, 0, 0, 0, 0, 0, 0); continue; }
        const [x, z] = SLOT_XZ[s], f = it.f, k = Math.min(1, it.t / perfAt(it)), st = stageOf(it);
        _c.set(f.raw).lerp(_c2.set(f.done), k); if (st === 'over') _c.lerp(_c2.set('#6a4a30'), Math.min(1, (it.t - perfAt(it) - f.perf - f.good) / OVER_T));
        S.im.setColorAt(s, _c);
        const sc = f.gold ? 1.15 : 1;
        setInst(s, x, BROTH_Y + .01 + Math.sin(T * 3 + it.wob) * .006, z, sc, it.k === 'ball' ? 2.2 : 1, sc, T * .3 + it.wob);
      }
      for (let i = 0; i < 6; i++){
        const fl = S.fly[i], j = SLOTS + i; if (!fl || fl.t >= 1){ setInst(j, 0, 0, 0, 0, 0, 0); continue; }
        fl.t += dt * 4.5; const u = Math.min(1, fl.t), y = BROTH_Y + .08 + Math.sin(u * Math.PI) * .6 + u * .75;
        setInst(j, fl.x0 + (fl.x1 - fl.x0) * u, y, fl.z0 + (fl.z1 - fl.z0) * u, 1 - u * .5, 1, 1 - u * .5); S.im.setColorAt(j, _c.set(fl.col));
      }
      S.im.instanceMatrix.needsUpdate = true; if (S.im.instanceColor) S.im.instanceColor.needsUpdate = true;
      for (const E of [P, ...S.fr]) pose(E, dt);
      ctx.hud.time(TIME - S.t);
      ctx.hud.score('RM ' + P.rm.toFixed(0));
      ctx.hud.info(P.combo >= 2 ? `连击 ×${P.combo}` : '');
      /* landscape: our card sits right under the platform's HUD, whatever its height (portrait: above the tray, CSS; wide screens: bottom left) */
      if ((S.topT = (S.topT || 0) - dt) <= 0){ S.topT = .5; const h = document.getElementById('mgHud'), wide = innerWidth >= 900 && ctx.aspect >= 1;
        if (h && !wide && ctx.aspect >= 1){ const y = Math.round(h.getBoundingClientRect().bottom + 6) + 'px'; if (S.top.style.top !== y) S.top.style.top = y; } else if (S.top.style.top) S.top.style.top = ''; }
      hud(dt, ctx);
    },
    stop(){
      document.body.classList.remove('sk-on');
      if (S && S.me && S.me.n > 0 && window.XIOI && XIOI.fed) XIOI.fed(Math.min(1, S.me.fill / 100));
      S = null;
    }
  };
})());
