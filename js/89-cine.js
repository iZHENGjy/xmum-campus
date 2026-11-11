/* XMUM 校园漫游 · 过场动画：开场航班（intro）、想家（homesick）、第 7 章结尾（ending）
 *
 * 做什么：主线里三段像电影一样的过场（逐镜头的写法见 docs/quests.md「过场动画」）。
 *   通用：上下黑边滑进来、底部大字幕（带名字的对白 / 地点字卡）、屏幕中间的心里独白气泡（斜体、没有名字）、机位插值、
 *   右上角大「跳过」按钮 + Esc / 回车跳过整段，点屏幕 / 空格切到下一个镜头。播放时 body 加 class「cine」把 HUD 全藏起来，电台调小。
 *   开场（约 60 秒）：① 机舱（奶蛙坐窗边，小桌板一杯果汁）② 肩后看出舷窗，一排排油棕园，贴窗「哇~~」③ 机外远景，放起落架降落
 *     ④ KLIA 到达大厅，带队老师举「XMUM 新生」小旗 ⑤ 校巴开在高速上，窗外油棕往后掠过，太阳偏西 ⑥ 黑屏淡入南门，镜头落到奶蛙身后接上操作。
 *   想家（约 6 秒）：奶蛙停下抬头，镜头慢慢往上转，看奶蛙航空的客机拖着两道白线飞过（晚上只看得见航行灯），中间浮出一句独白。
 *     用的就是 js/16-ambient.js 里本来就在飞的 naiwaAir，客机不在附近就把它这一趟改到头顶上来，零额外场景。按任意键或点屏幕立刻结束。
 *   结尾（约 45 秒）：和开场对称：到达大厅里举小旗的换成你（穿着你现在的衣服），一只新生东张西望；同一辆大巴，坐窗边「哇~~」的换成他；
 *     最后南门，把他交给小满学姐，客机从头顶飞过，奶蛙抬头笑一下。字幕「第一年，完。」
 * 镜头：播放时 gx.paused = true（js/90-main.js 就不跑 updateNaiwaMode，不抢相机，也不会弹暂停面板——那是 gxSetPause 才弹），
 *   在 gx.frame 外面包一层每帧摆相机；结束时 gx.paused 还原成原来的值。js/89-quest.js 看 XCine.busy 让奶蛙站住、暂停通知。
 * 场景：机舱 + 油棕园 + 跑道、到达大厅、高速公路三套临时场景都放在地图外（z ≈ −5600，地面 8 km 见方的边外），
 *   换镜头的黑屏里才生成，用完马上从 scene 移除并释放几何、材质、贴图（贴图全用 canvas 画，不加网络请求）。
 *   客机和校巴是游戏里现成模型的 clone（共用几何和材质，不释放）；人机奶蛙用 makeNaiwa + nwDress 临时造，播完释放。
 *   这时镜头远裁剪面缩到 1.7 km、天空球缩小（和 js/89-train.js 的 farClip 一样），3 km 外的校园不画。手机和「流畅」不投影。
 * 对外：window.XCine = {
 *   play(id, {onDone}) → bool     id：'intro' | 'ending'。开始了返回 true；播完或跳过都调一次 onDone
 *   homesick(line, {night, onDone})  想家，line 是独白
 *   planeNear(x, z) → bool        客机现在是否在 (x, z) 头顶附近（水平 < 180 米、正在飞）
 *   summonPlane()                 让客机下一趟在 10–40 秒内从玩家头顶附近飞过
 *   skip()                        立刻结束正在播的过场
 *   get busy()                    正在播过场
 * }
 * 测试：离线页 /test/offline.html 进奶蛙模式后在控制台 XCine.play('intro', {onDone:() => console.log('done')})、XCine.homesick('……我想家了。', {})、
 *   XCine.play('ending', {})、XCine.skip()；XCine.shot(3) 跳到第几个镜头（0 起），XCine.state 看现在播到哪。新存档进奶蛙模式时 js/89-quest.js 会自己播开场。 */
'use strict';
(() => {
  if (typeof THREE === 'undefined' || typeof gx === 'undefined' || typeof scene === 'undefined') return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const clamp01 = t => Math.max(0, Math.min(1, t));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const LOWQ = () => typeof XQ !== 'undefined' && XQ.tier === 0;
  const SHADOW = () => !TOUCH && !LOWQ();
  const FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  const AIR = () => typeof naiwaAir !== 'undefined' ? naiwaAir : null;

  /* ================= 界面：黑边、字幕、独白、字卡、跳过 ================= */
  { const st = document.createElement('style'); st.textContent = `
.cine-bar{position:fixed;left:0;right:0;height:var(--cine-bar);background:#000;z-index:40;transform:translateY(-101%);transition:transform .6s cubic-bezier(.2,.7,.2,1);pointer-events:none}
.cine-bar.b{top:auto;bottom:0;transform:translateY(101%)}
.cine-bar.t{top:0}
:root{--cine-bar:min(12vh,96px)}
body.cine .cine-bar{transform:none}
#cine-hit{position:fixed;inset:0;z-index:39;display:none;touch-action:none;-webkit-tap-highlight-color:transparent}
body.cine #cine-hit{display:block}
#cine-fade{position:fixed;inset:0;z-index:43;background:#000;opacity:0;pointer-events:none;transition:opacity .38s}
#cine-skip{position:fixed;z-index:44;right:calc(var(--safe-r, 0px) + 14px);top:calc(var(--safe-t, 0px) + max(8px, (var(--cine-bar) - 48px) / 2));min-height:48px;min-width:96px;padding:8px 20px;
  border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(28,24,36,.82);color:#fff;font:inherit;font-size:17px;font-weight:800;letter-spacing:.06em;cursor:pointer;
  touch-action:manipulation;display:none}
body.cine #cine-skip.on{display:block}
#cine-skip:active{background:rgba(70,60,90,.9)}
#cine-sub{position:fixed;z-index:41;left:50%;bottom:calc(var(--cine-bar) + var(--safe-b, 0px) + 12px);transform:translate(-50%,8px);width:max-content;max-width:min(92vw,880px);box-sizing:border-box;
  padding:10px 20px 12px;border-radius:14px;background:rgba(10,10,14,.62);color:#fff;text-align:center;font-family:${FONT};font-size:clamp(18px,4.4vw,27px);line-height:1.45;font-weight:600;
  text-shadow:0 2px 6px rgba(0,0,0,.6);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none}
#cine-sub.on{opacity:1;transform:translate(-50%,0)}
#cine-sub b{display:block;font-size:.66em;color:#ffd23a;letter-spacing:.08em;margin-bottom:2px}
#cine-sub.cap{background:none;font-family:var(--display, ${FONT});font-weight:800;letter-spacing:.08em;font-size:clamp(17px,4vw,25px);color:#fff6dc}
#cine-sub.cap small{display:block;font-size:.6em;font-weight:600;letter-spacing:.12em;color:#d8cfb8;margin-top:2px}
#cine-think{position:fixed;z-index:41;left:50%;top:40%;transform:translate(-50%,-50%) scale(.94);width:max-content;max-width:min(84vw,640px);box-sizing:border-box;padding:16px 28px;border-radius:40px;
  background:rgba(255,253,246,.9);color:#3a3324;font-family:${FONT};font-style:italic;font-size:clamp(20px,5vw,30px);line-height:1.5;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,.28);
  opacity:0;transition:opacity .5s,transform .5s;pointer-events:none}
#cine-think::before,#cine-think::after{content:'';position:absolute;border-radius:50%;background:rgba(255,253,246,.9)}
#cine-think::before{width:18px;height:18px;left:22%;bottom:-24px}
#cine-think::after{width:10px;height:10px;left:18%;bottom:-40px}
#cine-think.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#cine-title{position:fixed;z-index:42;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;color:#fff;font-family:var(--display, ${FONT});font-weight:900;
  font-size:clamp(34px,9vw,72px);letter-spacing:.12em;text-shadow:0 4px 24px rgba(0,0,0,.55);opacity:0;transition:opacity 1.2s;pointer-events:none}
#cine-title.on{opacity:1}
body.cine #labels{display:none!important}
body.cine > *:not(canvas):not(.cine-ui):not(script):not(style):not(dialog):not(#title):not(#err){visibility:hidden!important}
@media (prefers-reduced-motion: reduce){ .cine-bar,#cine-sub,#cine-think,#cine-title{transition:opacity .2s} }
@media (max-height: 420px){ :root{--cine-bar:min(10vh,52px)} #cine-sub{font-size:clamp(16px,3.2vw,22px);padding:6px 16px 8px} #cine-think{font-size:clamp(18px,3.6vw,26px);padding:10px 22px;top:calc(var(--cine-bar) + 12px);transform:translate(-50%,0) scale(.94)} #cine-think.on{transform:translate(-50%,0) scale(1)} }
`; document.head.appendChild(st); }
  const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; e.className = 'cine-ui' + (cls ? ' ' + cls : ''); document.body.appendChild(e); return e; };
  const barT = el('div', '', 'cine-bar t'), barB = el('div', '', 'cine-bar b');
  const hitEl = el('div', 'cine-hit'), fadeEl = el('div', 'cine-fade'), subEl = el('div', 'cine-sub'), thinkEl = el('div', 'cine-think'), titleEl = el('div', 'cine-title');
  const skipEl = el('button', 'cine-skip'); skipEl.type = 'button'; skipEl.textContent = '跳过 ›'; skipEl.setAttribute('aria-label', '跳过过场');
  subEl.setAttribute('aria-live', 'polite'); thinkEl.setAttribute('aria-live', 'polite');
  const fade = k => { fadeEl.style.opacity = String(k); };
  /* text timers run on the cutscene's own clock (advanced in the frame), so a slow frame never cuts a line short */
  const UI = {clock:0, sub:0, think:0};
  function uiTick(dt){
    UI.clock += dt;
    if (UI.sub && UI.clock >= UI.sub){ UI.sub = 0; subEl.classList.remove('on'); }
    if (UI.think && UI.clock >= UI.think){ UI.think = 0; thinkEl.classList.remove('on'); }
  }
  function sub(text, who, ms, cap){
    subEl.classList.toggle('cap', !!cap);
    subEl.innerHTML = ''; if (who){ const b = document.createElement('b'); b.textContent = who; subEl.append(b); }
    const parts = String(text).split('\n'); subEl.append(parts[0]); if (parts[1]){ const s = document.createElement('small'); s.textContent = parts[1]; subEl.append(s); }
    subEl.classList.add('on'); UI.sub = UI.clock + (ms || 3200) / 1000;
  }
  const cap = (text, ms) => sub(text, null, ms || 3400, true);
  function think(text, ms){ thinkEl.textContent = text; thinkEl.classList.add('on'); UI.think = UI.clock + (ms || 3000) / 1000; }
  function clearText(){ UI.sub = UI.think = 0; subEl.classList.remove('on'); thinkEl.classList.remove('on'); titleEl.classList.remove('on'); }

  /* ================= 小工具：释放、贴图、kit ================= */
  /* free a group: geometries and materials (not the shared ones: userData.shared subtrees are clones of game models,
     geometry / material .keep or userData.keep are caches), and only textures this file drew (cineMine) */
  function free(root){
    if (!root) return;
    if (root.parent) root.parent.remove(root);
    const walk = o => {
      if (o.userData && o.userData.shared) return;
      if (o.geometry && !o.geometry.keep && !(o.geometry.userData && o.geometry.userData.keep)) o.geometry.dispose();
      for (const m of o.material ? [].concat(o.material) : []){
        if (m.keep || (m.userData && m.userData.keep)) continue;
        for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k] && m[k].cineMine) m[k].dispose();
        m.dispose();
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
  }
  function canvasTex(w, h, draw, rep){
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.cineMine = true; t.anisotropy = typeof ANISO !== 'undefined' ? ANISO : 1;
    if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  const K = () => window.XTrain && XTrain.kit;
  const kitMesh = (b, o) => { const m = new THREE.Mesh(K().kGeo(b), new THREE.MeshStandardMaterial(Object.assign({vertexColors:true, roughness:.75}, o || {}))); return m; };
  /* js/98-perf.js adopts new scene meshes (merges still ones, splits big ones): our short-lived sets and actors stay out of that */
  const mine = o => { o.userData.xp = true; return o; };
  const shareAll = root => { root.traverse(o => { o.userData.shared = true; }); return root; };

  /* ================= 人机奶蛙：临时造、摆姿势 ================= */
  /* A = {N, x, y, z, h, sit, to, sp, wph, look, up, smile, laughT, flag, wave, talk, yaw0, roll0, tt} — numbers in metres / radians */
  function actor(look, parent){
    const lk = Object.assign(wdLookSafe(null), look || {});
    const N = makeNaiwa(lk.shape || 'std');
    g(() => nwDress(N, lk, {shadow:SHADOW()}));
    N.root.traverse(o => { if (o.isMesh){ o.castShadow = SHADOW(); o.receiveShadow = false; } });
    mine(N.root); (parent || scene).add(N.root);
    return {N, x:0, y:0, z:0, h:0, sit:false, to:null, sp:2.4, wph:Math.random() * 6, look:0, up:0, smile:0, laughT:null, flag:null, wave:0, talk:0, yaw0:0, roll0:0, tt:Math.random() * 4};
  }
  const wdLookSafe = l => typeof wdLook === 'function' ? wdLook(l) : {};
  function actorFree(A){ if (!A) return; if (A.flag) A.flag = null; free(A.N.root); }
  function place(A, x, y, z, h){ A.x = x; A.y = y; A.z = z; if (h != null) A.h = h; A.to = null; }
  const walkTo = (A, x, z, sp) => { A.to = [x, z]; A.sp = sp || 2.4; };
  /* the 「XMUM 新生」 flag on a pole in the raised right hand (body units: the pole stands where the hand ends up) */
  let flagTex = null;
  function giveFlag(A){
    if (!flagTex) flagTex = canvasTex(256, 144, (c, w, h) => {
      c.fillStyle = '#1d4f9a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd23a'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#ffd23a'; c.font = `900 50px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('XMUM', w / 2, 48);
      c.fillStyle = '#ffffff'; c.font = `800 40px ${FONT}`; c.fillText('新生', w / 2, 102);
    });
    const gr = new THREE.Group(), pm = new THREE.MeshStandardMaterial({color:'#c9ccd0', metalness:.5, roughness:.4});
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 1.9, 6), pm); pole.position.y = 2.1; gr.add(pole);
    const fm = new THREE.MeshStandardMaterial({map:flagTex, roughness:.8});
    const cloth = new THREE.Group(); cloth.position.set(0, 2.78, 0); gr.add(cloth);
    for (const s of [1, -1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(.78, .44), fm); p.position.x = -.4; if (s < 0) p.rotation.y = Math.PI; cloth.add(p); }
    gr.position.set(-.47, 0, .05); A.N.body.add(gr); A.flag = cloth;
  }
  const REST = typeof NW_REST !== 'undefined' ? NW_REST : {sx:-.32, sz:.36, ex:-1.22, ez:-.32};
  const SIT_DROP = typeof NW_SIT_DROP !== 'undefined' ? NW_SIT_DROP : .47;
  function pose(A, dt){
    const N = A.N, T = performance.now() / 1000; A.tt += dt;
    /* walking to a spot */
    let moving = false;
    if (A.to){
      const dx = A.to[0] - A.x, dz = A.to[1] - A.z, d = Math.hypot(dx, dz);
      if (d < .05){ A.to = null; }
      else { const s = Math.min(d, A.sp * dt); A.x += dx / d * s; A.z += dz / d * s; const h = Math.atan2(dx, dz); A.h += Math.atan2(Math.sin(h - A.h), Math.cos(h - A.h)) * Math.min(1, dt * 8); moving = true; A.wph += dt * A.sp * 3.4; }
    }
    if (A.face != null && !moving){ A.h += Math.atan2(Math.sin(A.face - A.h), Math.cos(A.face - A.h)) * Math.min(1, dt * 5); }
    N.root.position.set(A.x, A.y, A.z); N.root.rotation.y = A.h;
    let lean = 0, roll = A.roll0 || 0, yaw = A.yaw0 || 0, lift = 0, bob = 0, mouth = .018, eye = 1, lLx = 0, lRx = 0;
    const L = Object.assign({}, REST), R = Object.assign({}, REST);
    if (A.sit){ lift = -SIT_DROP; lLx = lRx = -1.4; L.sx = R.sx = -.75; L.sz = R.sz = .22; L.ex = R.ex = -.75; L.ez = R.ez = -.3; }
    else if (moving){ const w = A.wph; roll += Math.sin(w) * .08; lLx = Math.sin(w) * .55; lRx = -lLx; L.sx = -.25 - Math.sin(w) * .35; R.sx = -.25 + Math.sin(w) * .35; L.sz = R.sz = .38; L.ex = R.ex = -1.1; bob = Math.abs(Math.sin(w)) * .05; }
    else { bob = Math.sin(A.tt * 2) * .006; L.ex += Math.sin(A.tt * 2) * .03; R.ex += Math.sin(A.tt * 2) * .03; }
    if (A.look) yaw += Math.sin(A.tt * 1.7) * .8 * A.look + Math.sin(A.tt * 3.1) * .12 * A.look;
    if (A.up) lean -= .34 * A.up;
    if (A.laughT != null){
      const t = A.tt - A.laughT, k = clamp01(t / .3) * (t > 2.4 ? Math.max(0, 1 - (t - 2.4) / .4) : 1);
      if (k > 0){ lean -= .28 * k; L.ex = REST.ex + Math.sin(T * 9) * .22 * k; R.ex = REST.ex - Math.sin(T * 9) * .22 * k; L.sx = R.sx = REST.sx - .05 * k; mouth = .018 + k * (.06 + Math.abs(Math.sin(T * 11)) * .07); roll += Math.sin(T * 17) * .05 * k; }
      else if (t > 3) A.laughT = null;
    }
    if (A.flag){ R.sx = 0; R.sz = 2.74 + Math.sin(A.tt * 2.2) * .05; R.ex = -.12; R.ez = 0; A.flag.rotation.y = Math.sin(A.tt * 3) * .22; }
    else if (A.wave){ const w = A.wave; R.sx = REST.sx - w * .1; R.sz = REST.sz + w * 2.1; R.ex = REST.ex + w * (.6 + Math.sin(A.tt * 9) * .45); R.ez = -.32; }
    if (A.talk > 0){ A.talk -= dt; mouth = Math.max(mouth, .02 + Math.abs(Math.sin(A.tt * 12)) * .05); }
    if (A.smile){ mouth = Math.max(mouth, .018 + .035 * A.smile); eye = 1 - .5 * A.smile; }
    const blink = ((A.tt + 1.3) % 3.7) < .12 ? .1 : 1;
    N.body.rotation.set(lean, yaw, roll); N.body.position.y = lift + bob;
    N.mouth.scale.y = Math.max(.018, mouth * .9); N.eyes[0].scale.y = N.eyes[1].scale.y = blink * eye;
    const [aL, aR] = N.arms, [eL, eR] = N.elbows || [], [lL, lR] = N.legs;
    aL.rotation.set(L.sx, 0, L.sz); aR.rotation.set(R.sx, 0, -R.sz);
    if (eL){ eL.rotation.set(L.ex, 0, L.ez); eR.rotation.set(R.ex, 0, -R.ez); }
    lL.rotation.set(lLx, 0, 0); lR.rotation.set(lRx, 0, 0);
  }

  /* ================= 灯光：临时场景用自己的天色（白天 / 偏西的太阳），真实世界的镜头还原 ================= */
  function preset(a, b, k, o){
    const p = {}; for (const f of P3_COL) p[f] = a[f].clone().lerp(b[f], k); for (const f of P3_NUM) p[f] = a[f] + (b[f] - a[f]) * k;
    p.d = a.d.clone().lerp(b.d, k).normalize(); return Object.assign(p, o || {});
  }
  const SKY = {};
  function skies(){
    if (SKY.fly) return SKY;
    SKY.fly = preset(P3.day, P3.day, 0, {fn:650, ff:1550, win:0, lamp:0, stars:0, moon:0});
    SKY.hall = preset(P3.day, P3.day, 0, {fn:650, ff:1550, win:0, lamp:0, stars:0, moon:0, hi:.85, si:.75});
    SKY.west = preset(P3.day, P3.dusk, .55, {fn:420, ff:1350, win:0, lamp:0, stars:0, moon:0, glow:1.3}); SKY.west.d = V(-.85, .42, -.3).normalize();
    return SKY;
  }
  const WORLD = {on:false, tgt:null, rain:0, rainT:0, far:0, sky:1, fov:60, light:null};
  function lightSet(p){
    if (WORLD.light === p) return; WORLD.light = p;
    if (p){ tgt = p; wx.target = 0; wx.rain = 0; } else { tgt = WORLD.tgt || tgt; wx.target = WORLD.rainT; wx.rain = WORLD.rain; }
    applyTime(1);
  }
  /* far away (the sets at z −5600): clip at 1.7 km and shrink the sky inside it, so the campus 5 km behind is not drawn */
  function farSet(on){
    if (on){ camera.far = 1700; if (typeof sky !== 'undefined') sky.scale.setScalar(.3); }
    else { camera.far = WORLD.far; if (typeof sky !== 'undefined') sky.scale.setScalar(WORLD.sky); }
    camera.updateProjectionMatrix();
  }
  function worldSave(){
    Object.assign(WORLD, {on:true, tgt, rain:wx.rain, rainT:wx.target, far:camera.far, sky:typeof sky !== 'undefined' ? sky.scale.x : 1, fov:camera.fov, light:null});
  }
  function worldRestore(){
    if (!WORLD.on) return; WORLD.on = false;
    lightSet(null); farSet(false); camera.fov = WORLD.fov || 60; camera.updateProjectionMatrix();
  }
  /* the radio (and any car radios round you) a lot quieter while a cutscene plays */
  const RADIO = {vol:null};
  function radioDuck(on){
    const R = g(() => XRadio.state, null); if (!R) return;
    if (on){ if (RADIO.vol == null){ RADIO.vol = R.vol; R.vol = R.vol * .25; } }
    else if (RADIO.vol != null){ if (Math.abs(R.vol - RADIO.vol * .25) < 1e-6) R.vol = RADIO.vol; RADIO.vol = null; }
  }

  /* ================= 临时场景一：机舱 + 油棕园 + 跑道（开场 ①②③） ================= */
  const FX = 0, FZ = -5600, CAB_Y = 260;
  const SETS = {};
  function buildFly(){
    const gr = mine(new THREE.Group()); scene.add(gr); const S = {gr};
    /* the plantation from the air: rows of palm crowns painted on a tile, repeated over 4 km (the fog hides the edge) */
    const field = canvasTex(256, 256, (c, w) => {
      c.fillStyle = '#7a7a44'; c.fillRect(0, 0, w, w); const r = mkRng(55);
      for (let i = 0; i < 260; i++){ c.fillStyle = r() < .5 ? 'rgba(90,70,40,.25)' : 'rgba(120,140,70,.22)'; c.fillRect(r() * w, r() * w, 3, 3); }
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++){
        const x = (i + (j % 2) * .5) * w / 6 + 4, y = j * w / 6 + 20;
        c.fillStyle = '#2f5a24'; c.beginPath(); for (let k = 0; k < 9; k++){ const a = k / 9 * 6.283, rr = k % 2 ? 9 : 17; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill();
        c.fillStyle = '#4c7e33'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
      }
      c.fillStyle = '#8f7a55'; c.fillRect(0, 0, w, 3);
    }, [4000 / 60, 4000 / 60]);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({map:field, roughness:.95}));
    fl.rotation.x = -Math.PI / 2; fl.position.set(FX, 0, FZ); fl.receiveShadow = false; gr.add(fl);
    /* estate roads every 400 m, a runway with markings along x through the middle */
    const b = K().KB();
    for (let k = -5; k <= 5; k++){ K().kFlat(b, FX - 2000, FZ + k * 400 - 3, FX + 2000, FZ + k * 400 + 3, .08, '#9a8257'); K().kFlat(b, FX + k * 400 - 3, FZ - 2000, FX + k * 400 + 3, FZ + 2000, .08, '#9a8257'); }
    K().kFlat(b, FX - 700, FZ - 70, FX + 1500, FZ + 70, .1, '#5f7a3c');
    K().kFlat(b, FX - 600, FZ - 24, FX + 1400, FZ + 24, .16, '#3e4146');
    for (let x = FX - 560; x < FX + 1380; x += 50) K().kFlat(b, x, FZ - .5, x + 28, FZ + .5, .22, '#f1efe8');
    for (const s of [-1, 1]) K().kFlat(b, FX - 600, FZ + s * 22 - .4, FX + 1400, FZ + s * 22 + .4, .22, '#f1efe8');
    for (let k = 0; k < 8; k++){ const z = FZ - 19 + k * 5.3; K().kFlat(b, FX - 590, z, FX - 560, z + 2.4, .22, '#f1efe8'); }
    for (const x of [FX - 340, FX + 1150]) for (const s of [-1, 1]) K().kFlat(b, x, FZ + s * 9 - 2.5, x + 45, FZ + s * 9 + 2.5, .22, '#f1efe8');
    gr.add(kitMesh(b, {roughness:.9}));
    /* real 3D palms (the same tree as the estate outside campus) in rows along both sides of the runway */
    if (typeof oilPalmGeo !== 'undefined'){
      oilPalmGeo.userData.keep = true;
      const sp = LOWQ() ? 19 : TOUCH ? 16 : 14, pts = [], r = mkRng(77);
      for (const s of [-1, 1]) for (let z = 80; z < 300; z += 12) for (let x = FX - 900 + ((z / 12) % 2) * sp / 2; x < FX + 900; x += sp) if (r() < .94) pts.push([x + (r() - .5) * 2, FZ + s * z + (r() - .5) * 2, .85 + r() * .35, r() * 6.28]);
      const im = new THREE.InstancedMesh(oilPalmGeo, new THREE.MeshStandardMaterial({vertexColors:true, side:THREE.DoubleSide, roughness:.85}), pts.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3();
      pts.forEach(([x, z, s, a], i) => { m4.compose(_a.set(x, 0, z), q.setFromAxisAngle(UP, a), sv.setScalar(s)); im.setMatrixAt(i, m4); });
      im.frustumCulled = false; gr.add(im);
    }
    /* low clouds below the cruising cabin, on the window side: they give the view out of the window some depth */
    const cg = [], cr = mkRng(9);
    for (let i = 0; i < 12; i++){ const cx = FX - 950 + i * 110 + cr() * 60, cz = FZ + 90 + cr() * 360, cy = 150 + cr() * 50;
      for (let k = 0; k < 4; k++) cg.push(new THREE.SphereGeometry(14 + cr() * 14, 8, 6).scale(1.6, .55, 1).translate(cx + (k - 1.5) * 18, cy + cr() * 5, cz + (cr() - .5) * 20).toNonIndexed()); }
    const clouds = new THREE.Mesh(geoMerge(cg), new THREE.MeshLambertMaterial({color:'#ffffff', transparent:true, opacity:.88})); gr.add(clouds); S.clouds = clouds;
    S.cabin = buildCabin(); gr.add(S.cabin.gr);
    S.plane = buildPlane(); if (S.plane) gr.add(S.plane.root);
    return S;
  }
  /* the cabin: a short piece of a 奶蛙航空 cabin built at 奶蛙 size (奶蛙 is 2.4 m tall): aisle along x, flying towards +x,
     window seats on the +z side. Local origin: cabin floor in the middle of the aisle. */
  function buildCabin(){
    const gr = new THREE.Group(), b = K().KB(), L = 7.5, W = 3.6, H = 3.5, k = K();
    const NAVY = '#24345a', NAVY2 = '#2e4472', YEL = '#f6c63c';
    k.kQuad(b, [-L, .02, W], [L, .02, W], [L, .02, -W], [-L, .02, -W], '#5e6676');
    k.kQuad(b, [-L, .03, .5], [L, .03, .5], [L, .03, -.5], [-L, .03, -.5], '#8d6f3b');
    k.kQuad(b, [-L, H, -W], [L, H, -W], [L, H, W], [-L, H, W], '#f3efe6');
    k.kBox(b, -L, H - .08, -.25, L, H - .03, .25, '#fff6d8', '');
    for (const s of [1, -1]){
      /* overhead bins and their yellow lip */
      k.kBox(b, -L, 2.78, s > 0 ? 2.25 : -W, L, H, s > 0 ? W : -2.25, '#ece7dc', '');
      k.kBox(b, -L, 2.76, s > 0 ? 2.2 : -2.3, L, 2.84, s > 0 ? 2.3 : -2.2, YEL, '');
      /* seats: rows facing +x, two either side of the aisle */
      for (const rx of [-5, -2.5, 0, 2.5, 5]) for (const z of [1.4, 2.65]){
        const zz = s * z, z0 = zz - .5, z1 = zz + .5;
        k.kBox(b, rx - .5, .32, z0, rx + .45, .58, z1, NAVY);
        k.kBox(b, rx - .62, .32, z0, rx - .45, 2.05, z1, NAVY2);
        k.kBox(b, rx - .66, 1.75, z0 + .06, rx - .46, 2.08, z1 - .06, YEL);
        k.kBox(b, rx - .4, 0, zz - .06, rx + .35, .32, zz + .06, '#3b3f48');
        for (const e of [z0, z1]) k.kBox(b, rx - .5, .58, e - .05, rx + .3, .8, e + .05, '#3b4252');
      }
    }
    /* the end walls: the galley curtain behind, a bulkhead with a flight-info screen ahead */
    k.kSign(b, 'x', -L, -W, W, 0, H, 1, null, '#d8d2c6'); k.kSign(b, 'x', L, -W, W, 0, H, -1, null, '#e4ded2');
    const cab = kitMesh(b, {roughness:.7, emissive:'#3a3934', emissiveIntensity:1}); gr.add(cab);
    /* side walls with oval windows (cut out of a canvas, alpha-tested) */
    const WIN = [-4.2, -1.6, 1.0, 3.5, 6.0];
    const wallTex = canvasTex(1024, 256, (c, w, h) => {
      c.fillStyle = '#f1ece2'; c.fillRect(0, 0, w, h); c.fillStyle = '#e2dccf'; c.fillRect(0, h * .78, w, h * .22);
      c.fillStyle = YEL; c.fillRect(0, h * .74, w, 5);
      c.globalCompositeOperation = 'destination-out';
      for (const x of WIN){ c.beginPath(); c.ellipse((x + L) / (2 * L) * w, h * (1 - 1.95 / H), .44 / (2 * L) * w, .6 / H * h, 0, 0, 7); c.fill(); }
    });
    for (const s of [1, -1]){
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, H), new THREE.MeshStandardMaterial({map:wallTex, alphaTest:.5, roughness:.7, emissive:'#3a3934', side:THREE.DoubleSide}));
      p.position.set(0, H / 2, s * W); gr.add(p);
    }
    /* window bezels: a flattened ring round each hole, and a shade pulled up */
    const ring = new THREE.TorusGeometry(1, .09, 6, 28).scale(.44, .6, 1), bm = new THREE.MeshStandardMaterial({color:'#d6d0c4', roughness:.5, emissive:'#2a2926'});
    for (const s of [1, -1]) for (const x of WIN){ const m = new THREE.Mesh(ring, bm); m.position.set(x, 1.95, s * (W - .03)); gr.add(m); }
    /* flight-info screen on the bulkhead */
    const scr = canvasTex(512, 256, (c, w, h) => {
      const gd = c.createLinearGradient(0, 0, 0, h); gd.addColorStop(0, '#0d2a52'); gd.addColorStop(1, '#14457a'); c.fillStyle = gd; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7fb4ff'; c.lineWidth = 4; c.setLineDash([10, 10]); c.beginPath(); c.moveTo(70, 190); c.quadraticCurveTo(250, 40, 440, 150); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#f6c63c'; c.beginPath(); c.arc(360, 108, 12, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = `800 30px ${FONT}`; c.fillText('XM 2026 → KUL 吉隆坡', 24, 46); c.font = `600 22px ${FONT}`; c.fillStyle = '#cfe1ff'; c.fillText('还有 25 分钟到达 · 当地 15:40', 24, 236);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({map:scr})); sm.position.set(L - .02, 2.35, 0); sm.rotation.y = -Math.PI / 2; gr.add(sm);
    /* the tray table in front of the window seat (row 0, z +2.65) and a cup of orange juice on it */
    const tb = K().KB(); K().kBox(tb, 1.25, .98, 2.2, 1.95, 1.04, 3.1, '#c9c4ba', ''); K().kBox(tb, 1.85, 1.04, 2.2, 1.95, 1.4, 3.1, '#3b3f48', 'ny');
    gr.add(kitMesh(tb, {roughness:.6, emissive:'#2a2926'}));
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.1, .08, .26, 12, 1, true), new THREE.MeshStandardMaterial({color:'#e8f2f6', transparent:true, opacity:.45, roughness:.1, side:THREE.DoubleSide, depthWrite:false}));
    const juice = new THREE.Mesh(new THREE.CylinderGeometry(.088, .075, .18, 12), new THREE.MeshStandardMaterial({color:'#ff9a1f', roughness:.3, emissive:'#5a2a00'}));
    cup.position.set(1.55, 1.17, 2.75); juice.position.set(1.55, 1.13, 2.75); cup.renderOrder = 2; gr.add(juice, cup);
    return {gr, seat:[0.02, .58, 2.65]};
  }
  /* the airliner for the landing: a clone of the yellow 奶蛙航空 plane (shared geometry and materials) with landing gear of its own */
  function buildPlane(){
    const A = AIR(); if (!A) return null;
    const root = shareAll(A.root.clone()); root.userData.shared = false;
    root.scale.setScalar(1); root.visible = true; root.rotation.order = 'YXZ';
    const ti = A.root.children.indexOf(A.trail); if (ti >= 0) root.children[ti].visible = false;
    for (const c of root.children){ c.visible = c !== root.children[ti]; if (c.geometry && c.geometry.type === 'SphereGeometry' && c.scale) c.scale.setScalar(.6); }
    const gear = new THREE.Group(), gm = new THREE.MeshStandardMaterial({color:'#b7bcc2', metalness:.5, roughness:.4}), wm = new THREE.MeshStandardMaterial({color:'#1d1e21', roughness:.8});
    const strut = new THREE.CylinderGeometry(.16, .16, 2.4, 6).translate(0, -1.2, 0), wheel = new THREE.CylinderGeometry(.62, .62, .5, 12).rotateZ(Math.PI / 2);
    const legs = [];
    for (const [x, z, n] of [[0, 10.5, 1], [3.1, -3.5, 2], [-3.1, -3.5, 2]]){
      const leg = new THREE.Group(); leg.position.set(x, -1.5, z);
      leg.add(new THREE.Mesh(strut, gm));
      for (let i = 0; i < n; i++){ const w = new THREE.Mesh(wheel, wm); w.position.set(n > 1 ? (i ? .34 : -.34) : 0, -2.55, 0); leg.add(w); }
      gear.add(leg); legs.push(leg);
    }
    root.add(gear);
    return {root, legs};
  }

  /* ================= 临时场景二：KLIA 到达大厅（开场 ④、结尾 ①） ================= */
  const HX = 2600, HZ = -5600;
  function buildHall(){
    const gr = mine(new THREE.Group()); scene.add(gr); const k = K(), b = k.KB(), X = x => HX + x, Z = z => HZ + z;
    const A = k.kAtlas(1024, 256), R = A.R, rg = {};
    rg.arr = R(0, 0, 512, 96); k.kBoard(A, rg.arr, '#24272d', [{t:'到达 Arrivals  ·  Ketibaan', s:40, c:'#ffd23a', y:.4, w:900}, {t:'KLIA 吉隆坡国际机场', s:22, c:'#ffffff', y:.82, w:600}]);
    rg.wel = R(512, 0, 512, 96); k.kBoard(A, rg.wel, '#5b2a86', [{t:'Selamat Datang ke Malaysia', s:36, c:'#ffffff', y:.4, w:800}, {t:'欢迎来到马来西亚', s:26, c:'#ffd23a', y:.8, w:800}]);
    rg.exit = R(0, 96, 384, 80); k.kBoard(A, rg.exit, '#1f7a43', [{t:'出口 Exit · 巴士 Bus  →', s:32, c:'#ffffff', y:.52, w:800}]);
    rg.belt = R(384, 96, 256, 80); k.kBoard(A, rg.belt, '#24272d', [{t:'行李转盘 5', s:30, c:'#ffd23a', y:.4, w:800}, {t:'XM 2026 · 吉隆坡', s:18, c:'#ffffff', y:.8, w:600}]);
    A.done();
    /* floor: light granite tiles */
    const ft = canvasTex(128, 128, (c) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){ c.fillStyle = (i + j) % 2 ? '#c9c2b5' : '#d6d0c4'; c.fillRect(i * 64, j * 64, 64, 64); }
      c.fillStyle = '#a49c8f'; c.fillRect(0, 0, 128, 1.5); c.fillRect(0, 64, 128, 1.5); c.fillRect(0, 0, 1.5, 128); c.fillRect(64, 0, 1.5, 128); }, [80 / 6, 44 / 6]);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 44), new THREE.MeshStandardMaterial({map:ft, roughness:.45, metalness:.05}));
    fl.rotation.x = -Math.PI / 2; fl.position.set(X(0), .02, Z(0)); fl.receiveShadow = SHADOW(); gr.add(fl);
    const WH = '#f3f1ec';
    k.kSign(b, 'z', Z(-18), X(-40), X(40), 0, 14, 1, null, '#e9e4da');          /* back wall */
    k.kSign(b, 'x', X(-40), Z(-22), Z(22), 0, 14, 1, null, '#e9e4da');          /* west wall */
    k.kSign(b, 'z', Z(22), X(-40), X(40), 0, 14, -1, null, '#e2ddd2');
    k.kQuad(b, [X(-40), 14, Z(-22)], [X(40), 14, Z(-22)], [X(40), 14, Z(22)], [X(-40), 14, Z(22)], '#efe7d8');
    k.kSign(b, 'z', Z(-17.96), X(-12), X(12), 8.2, 12.2, 1, rg.arr, '#ffffff');
    k.kSign(b, 'z', Z(-17.95), X(-36), X(-16), 5.2, 8.9, 1, rg.wel, '#ffffff');
    k.kBox(b, X(16), 4.6, Z(-12.1), X(28), 6.2, Z(-11.9), '#1f7a43', ''); k.kSign(b, 'z', Z(-11.88), X(16.1), X(27.9), 4.65, 6.15, 1, rg.exit, '#ffffff');
    /* the east end: glass doors out to where the bus waits */
    for (let z = -18; z <= 22; z += 4) k.kBox(b, X(39.8), 0, Z(z - .12), X(40.2), 14, Z(z + .12), '#c9ccd0');
    /* columns with a wide capital, like the KLIA umbrellas */
    const cl = [];
    for (const cx of [-24, -8, 8, 24]) for (const cz of [-8, 21]){
      cl.push(geoTint(new THREE.CylinderGeometry(1.6, .6, 12, 14, 1, true).translate(X(cx), 6, Z(cz)), '#d8d4cc'));
      cl.push(geoTint(new THREE.CylinderGeometry(4.2, 1.6, 2, 14, 1, true).translate(X(cx), 13, Z(cz)), '#e2ddd3')); }
    const cm = new THREE.Mesh(geoMerge(cl), new THREE.MeshStandardMaterial({vertexColors:true, roughness:.5, emissive:'#3a3834', side:THREE.DoubleSide})); gr.add(cm);
    /* skylight strips */
    const sk = k.KB(); for (const z of [-12, 0, 12]) k.kQuad(sk, [X(-40), 13.9, Z(z + 1)], [X(40), 13.9, Z(z + 1)], [X(40), 13.9, Z(z - 1)], [X(-40), 13.9, Z(z - 1)], '#ffffff');
    gr.add(new THREE.Mesh(k.kGeo(sk), new THREE.MeshBasicMaterial({color:'#fffbea', side:THREE.DoubleSide})));
    /* baggage carousel 5 with suitcases, its sign on a post */
    { const x0 = -34, x1 = -18, z0 = -11, z1 = -5;
      k.kBox(b, X(x0), 0, Z(z0), X(x1), .7, Z(z1), '#4a4f57'); k.kFlat(b, X(x0 + .4), Z(z0 + .4), X(x1 - .4), Z(z1 - .4), .72, '#2b2f36');
      k.kBox(b, X(x0 + 1.4), .7, Z(z0 + 2), X(x1 - 1.4), 1.0, Z(z1 - 2), '#8d929a');
      const BAG = ['#c0392b', '#2c3e50', '#16a085', '#8e44ad', '#f39c12', '#2980b9', '#d35400'], r = mkRng(31);
      for (let i = 0; i < 9; i++){ const x = x0 + 1 + r() * (x1 - x0 - 2), z = r() < .5 ? z0 + .9 : z1 - .9; k.kBox(b, X(x - .5), .72, Z(z - .35), X(x + .5), 1.45, Z(z + .35), BAG[i % BAG.length]); }
      k.kBox(b, X(x1 + .6), 0, Z(z0 - .1), X(x1 + .8), 4.4, Z(z0 + .1), '#9ba1a8');
      k.kBox(b, X(x1 - 1.6), 4.4, Z(z0 - .15), X(x1 + 3), 5.8, Z(z0 + .15), '#24272d', ''); k.kSign(b, 'z', Z(z0 + .16), X(x1 - 1.55), X(x1 + 2.95), 4.45, 5.75, 1, rg.belt, '#ffffff'); }
    /* a row of seats and some parked luggage trolleys */
    for (let i = 0; i < 6; i++){ const x = -6 + i * 1.7; k.kBox(b, X(x), .45, Z(-15.4), X(x + 1.5), .55, Z(-14.6), '#2b2f36'); k.kBox(b, X(x), .55, Z(-15.5), X(x + 1.5), 1.2, Z(-15.3), '#2b2f36'); }
    for (let i = 0; i < 4; i++){ const x = 30 + i * 1.2; k.kBox(b, X(x), .3, Z(-14), X(x + .8), .4, Z(-12.8), '#9aa0a6'); k.kBox(b, X(x), .4, Z(-14), X(x + .06), 1.4, Z(-13.9), '#9aa0a6'); }
    const hall = new THREE.Mesh(k.kGeo(b), new THREE.MeshStandardMaterial({vertexColors:true, map:A.tex, roughness:.7, emissive:'#aaa499', emissiveIntensity:1}));
    hall.receiveShadow = SHADOW(); gr.add(hall);
    A.tex.cineMine = true; A.glow.dispose();
    return {gr};
  }

  /* ================= 临时场景三：高速公路上的校巴（开场 ⑤、结尾 ②） ================= */
  const BX = -2600, BZ = -5600, BUS_V = 22;
  function buildBus(){
    const gr = mine(new THREE.Group()); scene.add(gr); const S = {gr, palms:[]};
    const gd = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({color:'#56763a', roughness:.95})); gd.rotation.x = -Math.PI / 2; gd.position.set(BX, 0, BZ); gr.add(gd);
    /* the road: asphalt with lane lines, scrolled by the texture offset so it seems to rush past */
    const rt = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#4a4c50'; c.fillRect(0, 0, w, h); const r = mkRng(3); for (let i = 0; i < 600; i++){ c.fillStyle = r() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.07)'; c.fillRect(r() * w, r() * h, 2, 2); }
      c.fillStyle = '#f2efe6'; c.fillRect(0, 6, w, 4); c.fillRect(0, h - 10, w, 4); c.fillStyle = '#f2c230'; c.fillRect(0, h / 2 - 2, w * .55, 4); }, [3000 / 24, 1]);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(3000, 16), new THREE.MeshStandardMaterial({map:rt, roughness:.9})); road.rotation.x = -Math.PI / 2; road.position.set(BX, .05, BZ); gr.add(road); S.road = rt;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3), new THREE.MeshStandardMaterial({color:'#9a8a6a', roughness:.95})); sh.rotation.x = -Math.PI / 2; sh.position.set(BX, .04, BZ - 9.4); gr.add(sh);
    /* palms both sides, looping past: near rows on the far side, a gap on the camera side so the camera can stand there */
    if (typeof oilPalmGeo !== 'undefined'){
      oilPalmGeo.userData.keep = true;
      const r = mkRng(808), n = LOWQ() ? 150 : TOUCH ? 220 : 300;
      for (let i = 0; i < n; i++){ const far = i % 3 === 0; S.palms.push({x:BX - 400 + r() * 800, z:BZ + (far ? -(34 + r() * 120) : 12 + r() * 140), s:.85 + r() * .35, a:r() * 6.28}); }
      S.im = new THREE.InstancedMesh(oilPalmGeo, new THREE.MeshStandardMaterial({vertexColors:true, side:THREE.DoubleSide, roughness:.85}), n); S.im.frustumCulled = false; gr.add(S.im);
    }
    /* poles of the road lights on the far verge */
    S.poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .16, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({color:'#8e959b', roughness:.5}), 16); S.poles.frustumCulled = false; gr.add(S.poles); S.poleX = 0;
    /* the campus bus: a clone of the one parked on campus (shared geometry), with lighter glass so you can see who sits at the window */
    const src = typeof cars !== 'undefined' ? cars.find(c => c.kind === 'bus') : null;
    if (src){
      const bus = shareAll(src.root.clone()); bus.userData.shared = false; bus.rotation.set(0, Math.PI / 2, 0); bus.position.set(BX, 0, BZ - 3.6);
      const glass = new THREE.MeshStandardMaterial({color:'#9ab8c6', transparent:true, opacity:.28, roughness:.05, metalness:.2, depthWrite:false});
      S.wheels = [];
      /* the clone keeps the parked bus's level of detail: show the parts the distance culling (js/18-gfx.js) may have hidden */
      const so = [], co = []; src.root.traverse(o => so.push(o)); bus.traverse(o => co.push(o));
      co.forEach((o, i) => { if (src.fine && src.fine.includes(so[i])) o.visible = true; });
      bus.traverse(o => { if (!o.isMesh) return; if (typeof glassMat !== 'undefined' && o.material === glassMat){ o.material = glass; o.renderOrder = 2; } if (typeof wheelMat !== 'undefined' && o.material === wheelMat) S.wheels.push(o); });
      bus.children[0].position.set(0, 0, 0); bus.children[0].rotation.set(0, 0, 0);
      /* the shell is solid behind the glass band: cut the band out of it on the camera side (a copy of the paint with clipping
         planes, both faces drawn so the inside of the far wall shows), so 奶蛙 at the window can be seen */
      const cutMat = src.paint.clone(); cutMat.side = THREE.DoubleSide; cutMat.clipIntersection = true;
      cutMat.clippingPlanes = [new THREE.Plane(V(0, -1, 0), 1.92), new THREE.Plane(V(0, 1, 0), -2.86), new THREE.Plane(V(0, 0, 1), -(BZ - 3.6)),
        new THREE.Plane(V(-1, 0, 0), BX - 5.1), new THREE.Plane(V(1, 0, 0), -(BX + 4.3))];
      bus.traverse(o => { if (o.isMesh && o.material === src.paint) o.material = cutMat; });
      S.clip = renderer.localClippingEnabled; renderer.localClippingEnabled = true;
      gr.add(bus); S.bus = bus;
      gr.userData.ownMats = [glass, cutMat];
    }
    return S;
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  function busStep(S, dt){
    if (!S) return;
    S.road.offset.x += BUS_V * dt / 24;
    if (S.im){ S.palms.forEach((o, i) => { o.x -= BUS_V * dt; if (o.x < BX - 400) o.x += 800; _m4.compose(_a.set(o.x, 0, o.z), _q.setFromAxisAngle(UP, o.a), _s.setScalar(o.s)); S.im.setMatrixAt(i, _m4); }); S.im.instanceMatrix.needsUpdate = true; }
    S.poleX = (S.poleX - BUS_V * dt) % 50;
    for (let i = 0; i < 16; i++){ _m4.compose(_a.set(BX - 400 + i * 50 + S.poleX + 50, 0, BZ + 10), _q.identity(), _s.setScalar(1)); S.poles.setMatrixAt(i, _m4); } S.poles.instanceMatrix.needsUpdate = true;
    if (S.wheels) for (const w of S.wheels) w.rotation.x += BUS_V / .55 * dt;
    if (S.bus) S.bus.children[0].position.y = Math.sin(performance.now() / 160) * .015;
  }
  /* a bus seat by the window in world space: bus faces +x, its right-hand (+x local) side is the window towards the camera (−z) */
  const busSeat = (side, fwd) => [BX + (fwd || 0), 1.2, BZ - 3.6 - side];

  /* ================= 导演：镜头表、换镜头、跳过 ================= */
  const C = {on:false, kind:'', id:'', shots:null, i:0, t:0, ph:'', ft:0, next:0, onDone:null, done:false, paused:false, nwVis:true, camP:V(0, 0, 0), camT:V(0, 0, 0), cues:null, A:{}, set:{}};
  /* camera: snap or glide to a position and a look-at point */
  function camTo(p, t, k){
    if (k == null || k >= 1){ C.camP.copy(p); C.camT.copy(t); }
    else { C.camP.lerp(p, k); C.camT.lerp(t, k); }
  }
  const camK = (dt, rate) => 1 - Math.exp(-dt * (rate || 3));
  function camApply(){
    if (C.kind === 'film' && C.fov) fov(C.fov);
    camera.position.copy(C.camP); camera.lookAt(C.camT);
    fitShadow(Math.round(C.camT.x / 10) * 10, Math.round(C.camT.z / 10) * 10, 60);
  }
  /* shots are framed for a landscape screen: on a tall phone screen widen the view so about the same width still fits */
  function fov(f){
    C.fov = f; const a = camera.aspect || 1.5, want = 2 * Math.atan(Math.tan(f * Math.PI / 360) * 1.45), v = 2 * Math.atan(Math.tan(want / 2) / a) * 180 / Math.PI;
    const ef = a < 1.45 ? Math.min(92, Math.max(f, v)) : f;
    if (Math.abs(camera.fov - ef) > .01){ camera.fov = ef; camera.updateProjectionMatrix(); }
  }
  /* the gameplay camera pose behind 奶蛙 (the same maths as updateNaiwaMode), for a seamless hand-back */
  function playPose(outP, outT){
    const tx = nw.x, ty = nw.y + 2.4, tz = nw.z, d = camDist, p = camPitch, cp = Math.cos(p);
    const cx = tx + Math.sin(camYaw) * d * cp, cz = tz + Math.cos(camYaw) * d * cp;
    outP.set(cx, Math.max(.6, g(() => groundAt(cx, cz), 0) + 1, ty + d * Math.sin(p)), cz); outT.set(tx, ty, tz);
  }
  function setActors(){ for (const k in C.A){ const a = C.A[k]; if (a && a.N.root.visible) pose(a, C.dt); } }
  function freeSet(k){ const S = C.set[k]; if (!S) return; for (const a in C.A){ const A = C.A[a]; if (A && A.N.root.parent && isIn(A.N.root, S.gr)) scene.add(A.N.root); }
    if (S.gr.userData.ownMats) S.gr.userData.ownMats.forEach(m => m.dispose());
    if (S.clip != null) renderer.localClippingEnabled = S.clip;
    free(S.gr); C.set[k] = null; }
  const isIn = (o, root) => { for (let p = o.parent; p; p = p.parent) if (p === root) return true; return false; };
  function freeActor(k){ const A = C.A[k]; if (A){ actorFree(A); C.A[k] = null; } }
  function need(k, build){ if (!C.set[k]) C.set[k] = build(); return C.set[k]; }
  function hideActors(){ for (const k in C.A) if (C.A[k]) C.A[k].N.root.visible = false; }
  function show(...ks){ for (const k of ks) if (C.A[k]) C.A[k].N.root.visible = true; }
  /* a set shot: far clip on, the set's own light */
  function inSet(light){ farSet(true); lightSet(light); }
  function inWorld(){ farSet(false); lightSet(null); }

  /* ---------- 开场 ---------- */
  function introShots(){
    const S = skies();
    const cabinAt = () => C.set.fly.cabin.gr.position;
    const CL = (x, y, z) => _b.set(x, y, z).add(cabinAt());   /* cabin-local to world */
    return [
      { /* ① 机舱 */ dur:9, fadeIn:1, enter(){
          const F = need('fly', buildFly); F.plane && (F.plane.root.visible = false); F.cabin.gr.visible = true; F.clouds.visible = true;
          F.cabin.gr.position.set(FX - 900, CAB_Y, FZ); C.flyX = FX - 900;
          const P = C.A.me || (C.A.me = actor(g(() => NW.look, null)));
          F.cabin.gr.add(P.N.root); const [sx, sy, sz] = F.cabin.seat; place(P, sx, sy, sz, Math.PI / 2); P.sit = true; P.face = null; P.yaw0 = 0; P.roll0 = 0; hideActors(); show('me');
          inSet(S.fly); fov(52);
          tone('sine', 880, 880, .5, .08); tone('sine', 660, 660, .7, .07, .45);
        },
        cues:[[.6, () => cap('奶蛙航空 XM 2026 · 飞往吉隆坡\nNAIWA AIR · KUL', 3800)], [5, () => think('第一次一个人出远门……', 3600)]],
        step(t, dt){
          const F = C.set.fly; C.flyX += 55 * dt; F.cabin.gr.position.x = C.flyX;
          const k = ease(t / 9), P = C.A.me; P.yaw0 = -.35 * ease((t - 2) / 2);   /* turns to look out of the window */
          camTo(CL(1.75 - .3 * k, 2.75 - .25 * k, -.7 + 1.0 * k).clone(), CL(.35, 2.0, 2.45).clone());
        } },
      { /* ② 窗外 */ dur:9, cut:true, enter(){ fov(56); },
        cues:[[2.4, () => { const P = C.A.me; P.laughT = P.tt; g(() => sfx.laugh()); sub('哇~~', null, 2600); }], [5.6, () => think('底下一排一排的，都是什么树？', 3200)]],
        step(t, dt){
          const F = C.set.fly; C.flyX += 55 * dt; F.cabin.gr.position.x = C.flyX;
          const P = C.A.me, lean = ease((t - 1.6) / 1.2) * (1 - ease((t - 7) / 1.5));
          P.yaw0 = -.35 - .3 * lean; P.roll0 = .2 * lean; P.z = 2.65 + .2 * lean;
          const k = ease(t / 9);
          camTo(CL(-.75 + .15 * k, 3.1 - .05 * k, .95 + .1 * k).clone(), CL(1.0, 1.75 - .15 * k, 3.6).clone());
        } },
      { /* ③ 降落 */ dur:9, enter(){
          const F = C.set.fly; F.cabin.gr.visible = false; F.clouds.visible = false; hideActors();
          if (F.plane){ F.plane.root.visible = true; F.plane.root.rotation.set(0, Math.PI / 2, 0); }
          C.px = FX - 520; C.pv = 97; fov(46); C.td = false;
          camTo(V(FX + 175, 2.2, FZ + 36), V(FX - 520, 52, FZ));
          g(() => noise(2.6, .05, 260));
        },
        cues:[[6.2, () => cap('吉隆坡国际机场 KLIA\n当地时间 15:40 · 32°C', 2600)]],
        step(t, dt){
          const F = C.set.fly, P = F.plane; if (!P) return;
          let y;
          if (t < 6.6){ C.px = FX - 520 + 97 * t; y = 4.5 + 47.5 * Math.pow(1 - t / 6.6, 1.6); }
          else { C.pv = Math.max(55, C.pv - 16 * dt); C.px += C.pv * dt; y = 4.5; if (!C.td){ C.td = true; g(() => { noise(1.4, .16, 380); tone('sawtooth', 160, 70, .6, .05); }); } }
          P.root.position.set(C.px, y, FZ); P.root.rotation.x = -(t < 6.6 ? .06 + .05 * ease((t - 4.5) / 2) : Math.max(0, .11 - (t - 6.6) * .12));
          for (const l of P.legs) l.scale.y = .15 + .85 * ease(t / 1.4);
          camTo(V(FX + 175, 2.2, FZ + 36), _a.set(C.px - 6, y - 1, FZ).clone(), t < .05 ? 1 : camK(dt, 5));
          fov(46 - 8 * ease((t - 1) / 5));
        } },
      { /* ④ 到达大厅 */ dur:13, enter(){
          freeSet('fly'); const H = need('hall', buildHall); inSet(S.hall); fov(54); hideActors();
          const hx = x => HX + x, hz = z => HZ + z;
          const T0 = C.A.teacher || (C.A.teacher = actor({skin:'classic', outfit:'shirt', face:'glasses'}));
          place(T0, hx(4), 0, hz(-2), 0); giveFlagOnce(T0); T0.face = 0;
          const looks = [{skin:'orange', back:'bag'}, {skin:'pink', head:'buns'}, {skin:'white', face:'glasses', back:'bag'}];
          looks.forEach((l, i) => { const k = 'f' + i; if (!C.A[k]) C.A[k] = actor(l); });
          const P = C.A.me; scene.add(P.N.root); P.sit = false; P.yaw0 = 0; P.roll0 = 0; P.laughT = null;
          const starts = [[-20, -3], [-23, 1], [-17, 3], [-21, -6]], ends = [[-1.5, 2.6], [1, 4.2], [4, 4.8], [6.6, 3.6]];
          ['me', 'f0', 'f1', 'f2'].forEach((k, i) => { const A = C.A[k]; place(A, hx(starts[i][0]), 0, hz(starts[i][1]), Math.PI / 2); A.face = Math.PI; A.goal = [hx(ends[i][0]), hz(ends[i][1])]; });
          show('teacher', 'me', 'f0', 'f1', 'f2');
          C.H = H;
        },
        cues:[[.4, () => cap('KLIA · 到达大厅\nArrivals Hall', 3000)], [.5, () => ['me', 'f0', 'f1', 'f2'].forEach((k, i) => { const A = C.A[k]; A.wait = i * .35; })],
          [2.2, () => { C.A.teacher.talk = 4.2; sub('XMUM 的新同学到这边集合！大巴在外面等。', '带队老师', 4600); }],
          [7.4, () => { const T0 = C.A.teacher; walkTo(T0, HX + 34, HZ + 2, 2.6); T0.face = null; ['me', 'f0', 'f1', 'f2'].forEach((k, i) => { const A = C.A[k]; A.face = null; A.wait = .3 + i * .25; A.goal = [HX + 30 - i * 2.2, HZ + 2.5 + (i % 2 ? 2 : -.6)]; A.goSp = 2.5; }); }]],
        step(t, dt){
          for (const k of ['me', 'f0', 'f1', 'f2']){ const A = C.A[k]; if (A.goal && (A.wait -= dt) <= 0){ walkTo(A, A.goal[0], A.goal[1], A.goSp || 3); A.goal = null; } }
          const mid = t < 7.4 ? 0 : ease((t - 7.4) / 5.6);
          const p = V(HX - 4 + 22 * mid, 3.5 - .4 * mid, HZ + 12.5 - 1 * mid), q = V(HX + .5 + 24 * mid, 2.5, HZ - 1);
          camTo(p, q, t < .05 ? 1 : camK(dt, 2.4));
        } },
      { /* ⑤ 大巴 */ dur:11, enter(){
          freeSet('hall'); for (const k of ['teacher', 'f0', 'f1', 'f2']) freeActor(k);
          const B = need('bus', buildBus); inSet(S.west); fov(50); hideActors();
          const P = C.A.me; const [x, y, z] = busSeat(.5, .4); B.gr.add(P.N.root); place(P, x, y, z, Math.PI / 2); P.sit = true; P.face = null; P.yaw0 = .55; P.roll0 = 0; show('me');
          g(() => noise(3.5, .03, 180));
        },
        cues:[[.5, () => cap('去学校的路上 · 雪邦\nSepang, Selangor', 3400)], [6.4, () => think('原来那些是油棕树。到处都是。', 3800)]],
        step(t, dt){
          busStep(C.set.bus, dt);
          if (t < 5.4){ const k = ease(t / 5.4); camTo(V(BX + 18 - 8 * k, 4.6 - 1 * k, BZ - 24 + 2 * k), V(BX + 1 - 2 * k, 1.8, BZ - 3.6), t < .05 ? 1 : camK(dt, 3)); }
          else { const k = ease((t - 5.4) / 5.6); camTo(V(BX + 2.6 - 1.2 * k, 2.95, BZ - 9.6 + 1.2 * k), V(BX + .1, 2.55, BZ - 4.3), t < 5.45 ? 1 : camK(dt, 3)); }
        } },
      { /* ⑥ 南门 */ dur:6.5, fadeIn:1.1, enter(){
          freeSet('bus'); freeActor('me'); inWorld(); C.fov = 0; camera.fov = 60; camera.updateProjectionMatrix();   /* the hand-back pose: the gameplay lens */
          NW.root.visible = true; NW.root.position.set(nw.x, nw.y, nw.z); NW.root.rotation.y = nw.h;
          C.g0 = V(nw.x + 9, nw.y + 21, nw.z + 34); C.g1 = V(nw.x - 2, nw.y + 5, nw.z - 30);
          camTo(C.g0, C.g1);
        },
        cues:[[1.2, () => cap('XMUM · 南门\n厦门大学马来西亚分校', 3600)]],
        step(t, dt){
          const k = ease((t - .3) / 5.4); playPose(_a, _b);
          camTo(C.g0.clone().lerp(_a, k), C.g1.clone().lerp(_b, k));
        } }
    ];
  }
  function giveFlagOnce(A){ if (!A.flag) giveFlag(A); }
  function dropFlag(A){ if (A && A.flag){ free(A.flag.parent); A.flag = null; } }

  /* ---------- 结尾 ---------- */
  function endingShots(){
    const S = skies(), fresh = g(() => (NW.look && NW.look.skin === 'orange') ? 'pink' : 'orange', 'orange');
    return [
      { /* ① 一年后，到达大厅：举小旗的是你 */ dur:14, fadeIn:1, enter(){
          const H = need('hall', buildHall); inSet(S.hall); fov(54); hideActors();
          const hx = x => HX + x, hz = z => HZ + z;
          const P = C.A.me || (C.A.me = actor(g(() => NW.look, null))); scene.add(P.N.root); place(P, hx(4), 0, hz(-2), 0); giveFlagOnce(P); P.face = 0; P.sit = false;
          const F = C.A.fresh || (C.A.fresh = actor({skin:fresh, back:'bag'})); place(F, hx(-17), 0, hz(-3), Math.PI / 2); F.look = 0;
          walkTo(F, hx(-6), hz(1.5), 1.6); show('me', 'fresh');
        },
        cues:[[.4, () => cap('一年后 · KLIA 到达大厅\nArrivals Hall', 3200)], [3.6, () => { C.A.fresh.look = 1; }],
          [5, () => { C.A.me.talk = 3.6; sub('XMUM 的新同学到这边集合！大巴在外面等。', '我', 4200); }],
          [8.6, () => { const F = C.A.fresh; F.look = 0; walkTo(F, HX + 1.8, HZ + 1.6, 2.6); F.face = Math.atan2(4 - 1.8, -2 - 1.6); }],
          [11.4, () => { const P = C.A.me, F = C.A.fresh; P.face = null; F.face = null; walkTo(P, HX + 32, HZ + 1, 2.6); setTimeout(() => C.on && C.A.fresh && walkTo(C.A.fresh, HX + 30, HZ + 3, 2.6), 400); }]],
        step(t, dt){
          const late = t < 11 ? 0 : ease((t - 11) / 3);
          const p = t < 8 ? V(HX - 7 + 4 * ease(t / 8), 3.4, HZ + 11.5) : V(HX - 3 + 10 * late, 3.4 - .4 * ease((t - 8) / 3), HZ + 11.5 - 1.5 * late);
          const q = t < 8 ? V(HX - 4 + 3.5 * ease(t / 8), 2.1, HZ - 1) : V(HX - .5 + 16 * late, 2.2, HZ);
          camTo(p, q, t < .05 ? 1 : camK(dt, 2.2));
        } },
      { /* ② 同一辆大巴，坐窗边的换成了他 */ dur:12, enter(){
          freeSet('hall'); const B = need('bus', buildBus); inSet(S.west); fov(50); hideActors();
          const F = C.A.fresh, P = C.A.me; dropFlag(P);
          const [fx, fy, fz] = busSeat(.5, .4), [px, py, pz] = busSeat(-.5, .4);
          B.gr.add(F.N.root, P.N.root); place(F, fx, fy, fz, Math.PI / 2); F.sit = true; F.yaw0 = .55; F.look = 0; F.face = null;
          place(P, px, py, pz, Math.PI / 2); P.sit = true; P.yaw0 = .35; P.face = null; show('me', 'fresh');
          g(() => noise(3.5, .03, 180));
        },
        cues:[[.5, () => cap('去学校的路上 · 雪邦\nSepang, Selangor', 3200)], [5.8, () => { const F = C.A.fresh; F.laughT = F.tt; F.roll0 = -.15; g(() => sfx.laugh()); sub('哇~~', null, 2600); }],
          [8.6, () => { C.A.fresh.roll0 = 0; think('去年的我，也是这样。', 3200); C.A.me.smile = 1; }]],
        step(t, dt){
          busStep(C.set.bus, dt);
          if (t < 5){ const k = ease(t / 5); camTo(V(BX + 20 - 9 * k, 4.4, BZ - 24 + 2 * k), V(BX + 1 - 2 * k, 1.8, BZ - 3.6), t < .05 ? 1 : camK(dt, 3)); }
          else { const k = ease((t - 5) / 7); camTo(V(BX + 3 - 1.4 * k, 3.05, BZ - 9.8 + 1.2 * k), V(BX + .1, 2.55, BZ - 4.2), t < 5.05 ? 1 : camK(dt, 3)); }
        } },
      { /* ③ 南门：交给小满学姐，客机从头顶飞过，抬头笑一下 */ dur:15, enter(){
          freeSet('bus'); inWorld(); fov(56); hideActors(); NW.root.visible = false;
          const GX = 100, GZ = 252, gy = g(() => groundAt(GX, GZ), 0);
          const P = C.A.me, F = C.A.fresh; dropFlag(P);
          scene.add(P.N.root, F.N.root); P.sit = F.sit = false; P.smile = 0; P.yaw0 = F.yaw0 = 0; P.roll0 = F.roll0 = 0; P.laughT = F.laughT = null;
          place(P, GX - 1.6, gy, GZ + 1.6, Math.PI); P.face = Math.PI;
          place(F, GX + 1, gy, GZ + 6, Math.PI); walkTo(F, GX + 2.6, GZ + 1.2, 2); F.face = Math.PI / 2;
          /* 小满学姐: the one standing at the name stone, or one of our own if she is not built right now */
          const xm = g(() => XQD.npcs.xiaoman, null), at = xm && xm.at ? xm.at : [104.5, 251, Math.PI];
          const real = scene.children.find(o => o.isGroup && o.visible && o !== P.N.root && Math.hypot(o.position.x - at[0], o.position.z - at[1]) < .6 && o.children.length && o.scale.x > 1.2);
          if (!real){ const X = C.A.xm || (C.A.xm = actor(Object.assign({shape:xm && xm.shape}, xm && xm.look || {skin:'classic', outfit:'shirt', neck:'badge', head:'buns'}))); place(X, at[0], g(() => groundAt(at[0], at[1]), 0), at[1], -Math.PI / 2); X.face = -Math.PI / 2; X.wave = 1; show('xm'); }
          show('me', 'fresh');
          C.gate = {x:GX, z:GZ, y:gy};
          camTo(V(GX + 1, gy + 3.2, GZ - 9), V(GX + 1.2, gy + 2, GZ + 1));
          planeOver(GX, GZ - 60, 8.5, Math.PI * .5);
        },
        cues:[[1.4, () => { if (C.A.xm) C.A.xm.talk = 2.8; sub('交给我吧！欢迎来到 XMUM！', '小满学姐', 3400); }],
          [4.6, () => { const P = C.A.me; P.face = null; }], [5.2, () => g(() => noise(4.5, .05, 220))],
          [10.6, () => { titleEl.textContent = '第一年，完。'; titleEl.classList.add('on'); }]],
        step(t, dt){
          const G = C.gate, P = C.A.me, A = AIR();
          if (C.A.xm) C.A.xm.wave = t < 6 ? 1 : Math.max(0, C.A.xm.wave - dt);
          if (t > 4.6){ P.up = ease((t - 4.8) / 1.6); if (t > 8.8) P.smile = ease((t - 8.8) / .8); }
          if (t < 4.6) camTo(V(G.x + .5, G.y + 3, G.z - 8.5), V(G.x + 1, G.y + 2, G.z + 1.2), t < .05 ? 1 : camK(dt, 2));
          else if (t < 10){
            const k = ease((t - 4.6) / 2.6), head = _b.set(P.x, P.y + 2.6, P.z), plane = A && A.on ? A.root.position : _a.set(G.x, 480, G.z - 200);
            camTo(V(G.x - 7, G.y + 1.5, G.z + 5), head.clone().lerp(plane, k * .9), t < 4.65 ? 1 : camK(dt, 3));
          } else { const k = ease((t - 10) / 3); camTo(V(G.x - 2.4 - .3 * k, G.y + 1.3, G.z - 2.6 + .4 * k), V(P.x, P.y + 2.2 + .5 * k, P.z + .7), t < 10.05 ? 1 : camK(dt, 2.5)); }
        } }
    ];
  }

  /* ---------- 播放、换镜头、结束 ---------- */
  function begin(kind){
    C.on = true; C.kind = kind; C.done = false; C.fov = 0; C.paused = gx.paused; C.nwVis = NW.root.visible; C.dt = 0;
    gx.paused = true; for (const k in keys) keys[k] = false; g(() => engineUpdate(0, 0, false));
    document.body.classList.add('cine'); skipEl.classList.toggle('on', kind === 'film');
    radioDuck(true); worldSave(); clearText();
  }
  function play(id, o){
    o = o || {};
    if (C.on || (id !== 'intro' && id !== 'ending')) return false;
    if (typeof mode !== 'undefined' && mode !== 'naiwa') return false;
    if (g(() => titleOpen, false) || !K() || typeof makeNaiwa !== 'function') return false;
    begin('film'); C.id = id; C.onDone = typeof o.onDone === 'function' ? o.onDone : null;
    C.shots = id === 'intro' ? introShots() : endingShots();
    /* straight to black (no fade from the game), then the first shot fades in */
    NW.root.visible = false; fadeEl.style.transition = 'none'; fade(1); void fadeEl.offsetWidth; fadeEl.style.transition = '';
    C.i = -1; C.next = 0; C.ph = 'out'; C.ft = 0;
    return true;
  }
  function enterShot(i){
    C.i = i; C.t = 0; const s = C.shots[i]; C.cues = (s.cues || []).slice().sort((a, b) => a[0] - b[0]); clearText();
    s.enter(); s.step(0, 0); setActors(); camApply();
  }
  function frameFilm(dt){
    C.dt = dt;
    if (C.ph === 'out'){
      /* fading to black: the next shot (or the end) once it is dark */
      C.ft += dt; const s = C.shots[C.i];
      if (s && C.i >= 0) { s.step(C.t, dt); C.t += dt; setActors(); camApply(); }
      if (C.ft >= .4){
        if (C.next >= C.shots.length || C.next < 0){ end(); return; }
        enterShot(C.next); C.ph = 'play'; fadeEl.style.transitionDuration = (C.shots[C.i].fadeIn || .38) + 's'; fade(0);
        setTimeout(() => { fadeEl.style.transitionDuration = ''; }, 1200);
      }
      return;
    }
    const s = C.shots[C.i]; if (!s) return;
    C.t += dt;
    while (C.cues.length && C.cues[0][0] <= C.t){ const f = C.cues.shift()[1]; g(f); }
    s.step(C.t, dt); setActors(); camApply();
    if (C.t >= s.dur) nextShot();
  }
  function nextShot(){
    if (!C.on || C.kind !== 'film' || C.ph !== 'play') return;
    const n = C.i + 1;
    /* the intro ends on the gameplay camera behind 奶蛙: no black, just the bars going away */
    if (n >= C.shots.length){ if (C.id === 'intro'){ end(); return; } C.next = n; C.ph = 'out'; C.ft = 0; fade(1); return; }
    if (C.shots[n].cut){ enterShot(n); return; }
    C.next = n; C.ph = 'out'; C.ft = 0; fade(1);
  }
  /* skip the whole film: to black, clear up, back in the game */
  function skip(){
    if (!C.on) return;
    if (C.kind === 'home'){ homeEnd(true); return; }
    if (C.ph === 'out' && C.next < 0) return;
    C.next = -1; C.ph = 'out'; C.ft = Math.max(C.ft, .12); fade(1); clearText();
  }
  function cleanup(){
    for (const k in C.set) freeSet(k);
    for (const k in C.A) freeActor(k);
    C.A = {}; C.set = {};
  }
  function end(){
    if (!C.on) return;
    const wasBlack = +fadeEl.style.opacity > .5;
    cleanup(); clearText(); worldRestore();
    NW.root.visible = true; NW.root.position.set(nw.x, nw.y, nw.z); NW.root.rotation.y = nw.h;
    finishCommon();
    const cb = C.onDone; C.onDone = null;
    if (cb) g(cb);
    if (mode === 'naiwa'){ playPose(_a, _b); camera.position.copy(_a); camera.lookAt(_b); }
    if (wasBlack) setTimeout(() => fade(0), 60);
  }
  function finishCommon(){
    C.on = false; C.kind = ''; C.ph = ''; C.shots = null;
    gx.paused = !!C.paused;
    document.body.classList.remove('cine'); skipEl.classList.remove('on'); radioDuck(false);
    g(() => canvas.focus({preventScroll:true}));
  }

  /* ================= 想家：抬头看客机 ================= */
  const HS = {line:'', night:false, onDone:null, k:0, P0:V(0, 0, 0), T0:V(0, 0, 0), vis:null};
  function homesick(line, o){
    o = o || {};
    if (C.on){ return; }
    if (typeof mode !== 'undefined' && mode !== 'naiwa'){ if (o.onDone) g(o.onDone); return; }
    const A = AIR();
    begin('home'); C.t = 0;
    HS.line = line || '……我想家了。'; HS.onDone = typeof o.onDone === 'function' ? o.onDone : null;
    HS.night = o.night != null ? !!o.night : g(() => cur.lamp > .7, false); HS.shown = false; HS.out = false;
    HS.d = null; HS.P0.copy(camera.position); _a.set(0, 0, -1).applyQuaternion(camera.quaternion); HS.T0.copy(camera.position).addScaledVector(_a, 10);
    C.camP.copy(HS.P0); C.camT.copy(HS.T0); HS.h0 = nw.h;
    if (A){
      if (!planeNear(nw.x, nw.z, 260)) planeOver(nw.x, nw.z, 2.4);
      HS.vis = {body:A.body.visible, decal:A.root.children[1] ? A.root.children[1].visible : true, trail:A.trail.visible, s:A.root.scale.x};
      /* at night only the blinking navigation lights: hide the body, and make the plane (so its lights) bigger for these seconds,
         or the lights would be a pixel at 500 m */
      if (HS.night){ A.body.visible = false; if (A.root.children[1]) A.root.children[1].visible = false; A.trail.visible = false; A.root.scale.setScalar(HS.vis.s * 2.6); }
      else A.trail.visible = true;
    }
    nw.spd = 0; nw.state = 'idle';
  }
  function frameHome(dt){
    C.t += dt; const t = C.t, A = AIR(), D = 6.2;
    const plane = A && A.on ? A.root.position : _a.set(nw.x + 60, 480, nw.z - 120);
    /* 奶蛙 turns towards the plane and looks up */
    const want = Math.atan2(plane.x - nw.x, plane.z - nw.z);
    if (t < 4.8) nw.h += Math.atan2(Math.sin(want - nw.h), Math.cos(want - nw.h)) * Math.min(1, dt * 2.2);
    NW.root.rotation.y = nw.h; NW.root.position.set(nw.x, nw.y, nw.z);
    HS.k = t < 4.8 ? ease((t - .4) / 1.4) : 1 - ease((t - 4.8) / 1.2);
    /* behind 奶蛙, pulled in when a wall or a post stands there (like the gameplay camera) */
    const h = nw.h, sx = -Math.sin(h), sz = -Math.cos(h); let d = 4.6;
    for (let i = 1; i <= 10; i++){ const dd = 4.6 * i / 10; if (g(() => hitsBuilding(nw.x + sx * dd, nw.z + sz * dd, .7), false)){ d = Math.max(1.8, dd - .6); break; } }
    HS.d = HS.d == null ? d : HS.d + (d - HS.d) * Math.min(1, dt * 6);
    const back = V(nw.x + sx * HS.d, nw.y + 1.5, nw.z + sz * HS.d), head = V(nw.x, nw.y + 2.5, nw.z);
    const up = ease((t - 1) / 1.8), look = head.clone().lerp(plane, up * .8);
    if (t < 4.8){ const k = ease(t / 1.3); camTo(HS.P0.clone().lerp(back, k), HS.T0.clone().lerp(look, k)); }
    else { playPose(_a, _b); const k = ease((t - 4.8) / 1.3); camTo(back.clone().lerp(_a, k), look.clone().lerp(_b, k)); }
    if (!HS.shown && t > 2.1){ HS.shown = true; think(HS.line, 2900); }
    camApply();
    if (t >= D) homeEnd(false);
  }
  function homeEnd(now){
    if (!C.on || C.kind !== 'home') return;
    const A = AIR();
    if (A && HS.vis){ A.root.scale.setScalar(HS.vis.s); A.body.visible = HS.vis.body; if (A.root.children[1]) A.root.children[1].visible = HS.vis.decal; A.trail.visible = HS.vis.trail; HS.vis = null; }
    HS.k = 0; clearText(); worldRestore(); finishCommon();
    if (now && mode === 'naiwa'){ playPose(_a, _b); camera.position.copy(_a); camera.lookAt(_b); }
    const cb = HS.onDone; HS.onDone = null; if (cb) g(cb);
  }
  /* the head tilting back while 奶蛙 watches the plane (animNaiwa poses the player every frame after gx.frame) */
  if (typeof animNaiwa === 'function'){
    const base = animNaiwa;
    animNaiwa = function(dt, T){ base(dt, T); if (HS.k > 0 && C.kind === 'home'){ NW.body.rotation.x -= .32 * HS.k; NW.mouth.scale.y = Math.max(NW.mouth.scale.y, .02); } };
  }

  /* ================= 客机：在不在头顶、叫它飞过来 ================= */
  function planeNear(x, z, r){
    const A = AIR(); if (!A || !A.on || !A.root.visible) return false;
    return Math.hypot(A.root.position.x - x, A.root.position.z - z) < (r || 180);
  }
  /* route this pass of the plane over (x, z), reaching the overhead point in `inS` seconds (heading h, or keep the current one) */
  function planeOver(x, z, inS, h){
    const A = AIR(); if (!A) return;
    if (h == null) h = A.on ? A.root.rotation.y : Math.random() * Math.PI * 2;
    const R = 3300, v = 105, alt = A.on ? A.a.y : 450 + Math.random() * 60, dx = Math.sin(h), dz = Math.cos(h);
    A.a.set(x - dx * R, alt, z - dz * R); A.b.set(x + dx * R, alt, z + dz * R);
    A.dur = 2 * R / v; A.t = Math.max(.02, .5 - inS / A.dur); A.on = true; A.root.visible = true; A.root.rotation.set(0, h, 0);
    A.trail.visible = g(() => XQ.cfg.planes < 2, true); A.root.position.lerpVectors(A.a, A.b, A.t);
  }
  /* the next pass in 10–40 s over wherever the player is then */
  const SUM = {left:-1};
  function summonPlane(){ SUM.left = Math.random() * 25; }
  function summonTick(dt){
    if (SUM.left < 0 || C.on) return;
    if ((SUM.left -= dt) > 0) return;
    const A = AIR(); SUM.left = -1; if (!A) return;
    const px = typeof driving !== 'undefined' && driving ? driving.x : nw.x, pz = typeof driving !== 'undefined' && driving ? driving.z : nw.z;
    if (A.on){
      /* already up there: is it going to pass close anyway? */
      const dx = A.b.x - A.a.x, dz = A.b.z - A.a.z, L2 = dx * dx + dz * dz, s = ((px - A.a.x) * dx + (pz - A.a.z) * dz) / L2;
      if (s > A.t && Math.hypot(A.a.x + dx * s - px, A.a.z + dz * s - pz) < 150 && (s - A.t) * A.dur < 40) return;
    }
    planeOver(px, pz, 12 + Math.random() * 3, Math.random() * Math.PI * 2);
  }

  /* ================= 输入：跳过、下一个镜头 ================= */
  skipEl.addEventListener('click', e => { e.stopPropagation(); skip(); });
  hitEl.addEventListener('pointerdown', e => {
    if (!C.on) return; e.preventDefault(); e.stopPropagation();
    if (C.kind === 'home') homeEnd(true); else nextShot();
  });
  window.addEventListener('keydown', e => {
    if (!C.on || document.querySelector('dialog[open]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (C.kind === 'home'){ homeEnd(true); return; }
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') skip();
    else if (e.code === 'Space' || e.code === 'ArrowRight') nextShot();
  }, true);

  /* ================= 接进游戏循环 ================= */
  { const base = Object.assign({}, gx);
    Object.assign(gx, {
      frame(dt, T){
        if (base.frame) base.frame(dt, T);
        summonTick(Math.max(0, Math.min(.1, dt || 0)));
        if (!C.on) return;
        dt = Math.max(0, Math.min(.1, dt || 0));
        if (typeof mode !== 'undefined' && mode !== 'naiwa' || g(() => titleOpen, false)){
          /* left the game (title menu, another mode): stop at once, the core still gets its onDone */
          if (C.kind === 'home') homeEnd(true); else end();
          return;
        }
        gx.paused = true;
        if (WORLD.light && tgt !== WORLD.light){ tgt = WORLD.light; applyTime(1); }
        if (WORLD.light){ wx.target = 0; wx.rain = 0; }
        /* a cutscene must never stop the game loop: on any error, end it and hand back */
        try { uiTick(dt); if (C.kind === 'home') frameHome(dt); else frameFilm(dt); }
        catch(e){ console.error('XCine', e); try { if (C.kind === 'home') homeEnd(true); else end(); } catch(e2){ C.on = false; gx.paused = false; document.body.classList.remove('cine'); fade(0); } }
      }
    }); }

  window.XCine = {
    play, homesick, planeNear:(x, z) => planeNear(x, z), summonPlane, skip,
    get busy(){ return C.on; },
    /* tests: jump to a shot of the film that is playing */
    shot(i){ if (!C.on || C.kind !== 'film' || !C.shots[i]) return false; C.next = i; C.ph = 'out'; C.ft = .4; fade(1); return true; },
    get state(){ return {on:C.on, kind:C.kind, id:C.id, shot:C.i, t:+(C.t || 0).toFixed(2), ph:C.ph}; }
  };
})();
