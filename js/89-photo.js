/* XMUM 校园漫游 · 拍照模式（GTA 的 Photo Mode）
 *
 * 打开：奶娃模式里按 O，或者「暂停」面板里的「拍照」（手机也走这里）。
 *   - 游戏定格（gx.paused；同学、粒子、喷泉都停住），镜头自由飞：离奶娃 30 米以内，不钻地；
 *     电脑：WASD 移动、R/F 升降、拖动鼠标转镜头、滚轮缩放、Q/E 倾斜、Shift 快移、空格拍照、H 收起面板、Esc 或 O 退出；
 *     手机：左下摇杆移动、右边「升」「降」、单指拖动转镜头、双指捏合缩放；面板里有缩放、倾斜滑条。
 *   - 滤镜：原图、胶片、黑白、日落、鲜艳。预览用 CSS filter（不加后期），保存时同一组颜色矩阵逐像素算一遍（Safari 的 canvas 不支持 ctx.filter）。
 *   - 奶娃姿势（下车时）：挥手、大笑、比心、点赞、跳舞、撩头，还能「看镜头」。
 *   - 拍照：临时把分辨率提到短边约 1080 像素渲一帧，复制到 2D 画布，套滤镜，右下角加 XMUM 小水印；
 *     弹出预览：手机上能「分享」（navigator.share 带文件，能直接发微信、小红书）或长按图片保存，电脑上「下载」。
 * 不碰联机：定格期间 XNet 照常按真实时间发位置（车停着、人站着）。
 * 对外：window.XPhoto = {open(), close(), get on(), shoot()}（测试用） */
'use strict';
(() => {
  if (typeof gx === 'undefined' || typeof camera === 'undefined') return;
  const RANGE = 30, FILTERS = [
    {id:'none',   n:'原图', f:[]},
    {id:'film',   n:'胶片', f:[['sepia', .22], ['contrast', 1.08], ['saturate', .85], ['brightness', 1.04]], vig:.5, grain:14},
    {id:'bw',     n:'黑白', f:[['grayscale', 1], ['contrast', 1.18], ['brightness', 1.03]], vig:.35, grain:8},
    {id:'sunset', n:'日落', f:[['sepia', .3], ['saturate', 1.45], ['hue-rotate', -14], ['contrast', 1.05], ['brightness', 1.04]], vig:.4, warm:true},
    {id:'vivid',  n:'鲜艳', f:[['saturate', 1.55], ['contrast', 1.1]]}
  ];
  const POSES = [{id:'', n:'不动'}, {id:'wave', n:'挥手'}, {id:'laugh', n:'大笑'}, {id:'heart', n:'比心'}, {id:'thumb', n:'点赞'}, {id:'dance', n:'跳舞'}, {id:'flip', n:'撩头'}];
  const P = {on:false, yaw:0, pitch:0, roll:0, fov:60, pos:new THREE.Vector3(), anchor:new THREE.Vector3(), filter:FILTERS[0], pose:'', face:false,
    hide:false, keys:{}, joy:{x:0, y:0, id:null}, ptr:new Map(), pinch:0, lift:0, save:null, frozenT:0, last:0, busy:false};

  /* ---------- styles + UI ---------- */
  const st = document.createElement('style');
  st.textContent = `
body.ph-on > *:not(#c):not(.ph):not(script):not(style):not(dialog){opacity:0 !important;pointer-events:none !important}
body.ph-on #c{cursor:grab}
.ph{position:fixed;z-index:60;font-size:13px}
.ph[hidden]{display:none !important}
#phTouch{inset:0;z-index:55;touch-action:none}
#phVig{inset:0;z-index:54;pointer-events:none;opacity:0;transition:opacity .2s}
#phFlash{inset:0;z-index:70;pointer-events:none;background:#fff;opacity:0}
#phFlash.go{animation:phFlash .45s ease-out}
@keyframes phFlash{0%{opacity:.9}100%{opacity:0}}
#phTop{top:max(10px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:6px 8px 6px 14px;border-radius:999px}
#phTop b{font-size:14px;white-space:nowrap}
#phTop .ph-chip{white-space:nowrap}
#phPanel{left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(680px,calc(100% - 20px));padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center}
.ph-rows{display:grid;gap:6px;min-width:0}
.ph-row{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ph-row::-webkit-scrollbar{display:none}
.ph-row > span{flex:none;color:var(--muted);font-size:12px;width:30px}
.ph-chip{flex:none;border:1px solid var(--line,rgba(0,0,0,.15));background:var(--card-bg,#fff);color:var(--ink);border-radius:999px;padding:5px 11px;font:inherit;cursor:pointer}
.ph-chip[aria-pressed="true"]{background:var(--ink);color:var(--card-bg,#fff);border-color:var(--ink)}
.ph-chip:disabled{opacity:.4;cursor:default}
.ph-row input[type=range]{flex:1;min-width:70px;accent-color:var(--tile)}
#phShot{width:62px;height:62px;border-radius:50%;border:4px solid var(--ink);background:var(--tile);color:#fff;font:700 14px/1 inherit;cursor:pointer;box-shadow:0 0 0 3px var(--card-bg,#fff) inset}
#phShot:active{transform:scale(.95)}
#phHint{grid-column:1/-1;color:var(--muted);font-size:11.5px;margin:0}
#phJoy{left:max(18px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 215px);width:116px;height:116px;border-radius:50%;touch-action:none;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.7)}
#phJoy i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 2px 6px rgba(0,0,0,.25)}
#phUD{right:max(18px,env(safe-area-inset-right));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 215px);display:grid;gap:10px}
#phUD button{width:54px;height:54px;border-radius:50%;border:2px solid rgba(255,255,255,.8);background:rgba(255,255,255,.4);font:700 14px inherit;color:var(--ink);touch-action:none}
#phShow{right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));padding:8px 14px;border-radius:999px}
#phOut{inset:0;z-index:80;display:grid;place-items:center;background:rgba(10,12,16,.72);padding:16px}
#phOut .ph-card{max-width:min(560px,100%);max-height:100%;display:grid;gap:10px;padding:12px;justify-items:center}
#phOut img{max-width:100%;max-height:62vh;border-radius:8px;display:block;-webkit-touch-callout:default;user-select:auto}
#phOut .hrow{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
#phOut p{margin:0;color:var(--muted);font-size:12.5px;text-align:center}
body.ph-hide #phPanel, body.ph-hide #phTop, body.ph-hide #phJoy, body.ph-hide #phUD{display:none}
body:not(.ph-hide) #phShow{display:none}
@media (max-width:560px){#phPanel{grid-template-columns:1fr auto;padding:8px 10px}#phShot{width:56px;height:56px}}`;
  document.head.appendChild(st);
  const el = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; e.className = 'ph' + (cls ? ' ' + cls : ''); if (html) e.innerHTML = html; e.hidden = true; document.body.appendChild(e); return e; };
  const touchEl = el('div', 'phTouch'), vigEl = el('div', 'phVig'), flashEl = el('div', 'phFlash');
  const topEl = el('div', 'phTop', 'panel', `<b>拍照模式</b><button type="button" class="ph-chip" id="phHide">收起面板</button><button type="button" class="ph-chip" id="phExit" aria-label="退出拍照模式">退出 ×</button>`);
  const panelEl = el('div', 'phPanel', 'panel', `<div class="ph-rows">
      <div class="ph-row" role="group" aria-label="滤镜"><span>滤镜</span>${FILTERS.map(f => `<button type="button" class="ph-chip" data-f="${f.id}">${f.n}</button>`).join('')}</div>
      <div class="ph-row" role="group" aria-label="姿势" id="phPoses"><span>姿势</span>${POSES.map(p => `<button type="button" class="ph-chip" data-p="${p.id}">${p.n}</button>`).join('')}<button type="button" class="ph-chip" id="phFace" aria-pressed="false">看镜头</button></div>
      <div class="ph-row"><span>缩放</span><input type="range" id="phZoom" min="0" max="100" value="40" aria-label="缩放"><span>倾斜</span><input type="range" id="phRoll" min="-35" max="35" value="0" aria-label="倾斜"></div>
    </div><button type="button" id="phShot" aria-label="拍照">拍照</button>
    <p id="phHint"></p>`);
  const joyEl2 = el('div', 'phJoy', '', '<i></i>'), udEl = el('div', 'phUD', '', '<button type="button" data-ud="1" aria-label="升高">升</button><button type="button" data-ud="-1" aria-label="降低">降</button>');
  const showEl = el('button', 'phShow', 'panel', '显示面板'); showEl.type = 'button';
  const outEl = el('div', 'phOut');
  const $p = s => panelEl.querySelector(s);
  const fovOf = v => 90 - v * .7, zoomOf = f => (90 - f) / .7;   /* slider 0..100 → fov 90..20 */

  /* ---------- colour matrices (the CSS Filter Effects ones), for saving ---------- */
  function mat(kind, a){
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    if (kind === 'grayscale'){ const k = 1 - a; return [.2126 + .7874 * k, .7152 - .7152 * k, .0722 - .0722 * k, 0, .2126 - .2126 * k, .7152 + .2848 * k, .0722 - .0722 * k, 0, .2126 - .2126 * k, .7152 - .7152 * k, .0722 + .9278 * k, 0]; }
    if (kind === 'sepia'){ const k = 1 - a; return [.393 + .607 * k, .769 - .769 * k, .189 - .189 * k, 0, .349 - .349 * k, .686 + .314 * k, .168 - .168 * k, 0, .272 - .272 * k, .534 - .534 * k, .131 + .869 * k, 0]; }
    if (kind === 'saturate'){ const s = a; return [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, 0, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, 0, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s, 0]; }
    if (kind === 'hue-rotate'){ const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [.213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0, .213 - c * .213 + s * .143, .715 + c * .285 + s * .140, .072 - c * .072 - s * .283, 0, .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0]; }
    if (kind === 'contrast') return [a, 0, 0, .5 - .5 * a, 0, a, 0, .5 - .5 * a, 0, 0, a, .5 - .5 * a];
    if (kind === 'brightness') return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
    return I;
  }
  const mul = (B, A) => { const o = []; for (let r = 0; r < 3; r++){ for (let c = 0; c < 4; c++){ let v = c === 3 ? B[r * 4 + 3] : 0; for (let k = 0; k < 3; k++) v += B[r * 4 + k] * A[k * 4 + c]; o.push(v); } } return o; };
  const matOf = F => F.f.reduce((M, [k, a]) => mul(mat(k, a), M), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  const cssOf = F => F.f.map(([k, a]) => `${k}(${k === 'hue-rotate' ? a + 'deg' : a})`).join(' ');
  const vigCss = F => F.vig ? `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, ${F.warm ? 'rgba(90,30,0,' : 'rgba(0,0,0,'}${F.vig}) 100%)` : 'none';

  /* ---------- open / close ---------- */
  const blocked = () => mode !== 'naiwa' || (typeof spray !== 'undefined' && spray.run) || (window.XCine && XCine.busy) || (typeof ward !== 'undefined' && ward.on) || document.body.classList.contains('titled');
  function open(){
    if (P.on) return true;
    if (blocked()){ toast('这里不能拍照', '回到奶娃模式，在外面走着或开着车时再拍', 2000); return false; }
    if (gx.paused && typeof gxSetPause === 'function') gxSetPause(false);
    if (window.XGuide && XGuide.on){ try { XGuide.close(); XGuide.closeMap(); } catch(e){} }
    const me = driving || nw;
    P.save = {pos:camera.position.clone(), quat:camera.quaternion.clone(), order:camera.rotation.order, fov:camera.fov, near:camera.near, camYaw, camPitch, paused:gx.paused,
      state:nw.state, t:nw.t, rotY:NW.root.rotation.y};
    P.anchor.set(me.x, (driving ? driving.y : nw.y) + 1.6, me.z);
    P.pos.copy(camera.position); clampPos();
    const d = camera.getWorldDirection(new THREE.Vector3());
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))); P.roll = 0; P.fov = camera.fov;
    P.on = true; P.hide = false; P.pose = ''; P.face = false; P.frozenT = performance.now() / 1000; P.last = 0;
    gx.paused = true; if (typeof engineUpdate === 'function') engineUpdate(0, 0, false);
    for (const k in keys) keys[k] = false; for (const k in P.keys) P.keys[k] = false;
    camera.rotation.order = 'YXZ'; camera.near = .1;
    document.body.classList.add('ph-on'); document.body.classList.remove('ph-hide');
    for (const e of [touchEl, vigEl, flashEl, topEl, panelEl]) e.hidden = false;
    joyEl2.hidden = udEl.hidden = !TOUCH; showEl.hidden = false;
    $p('#phZoom').value = Math.round(zoomOf(P.fov)); $p('#phRoll').value = 0;
    $p('#phHint').textContent = TOUCH ? '左下摇杆移动 · 升 / 降 · 单指拖动转镜头 · 双指缩放 · 离奶娃 30 米以内'
      : 'WASD 移动 · R / F 升降 · 拖动转镜头 · 滚轮缩放 · Q / E 倾斜 · Shift 快移 · 空格拍照 · H 收起面板 · Esc 退出';
    setFilter(P.filter); renderPoses(); applyCam();
    return true;
  }
  function close(){
    if (!P.on) return;
    P.on = false; outEl.hidden = true; outEl.innerHTML = '';
    for (const e of [touchEl, vigEl, flashEl, topEl, panelEl, joyEl2, udEl, showEl]) e.hidden = true;
    document.body.classList.remove('ph-on', 'ph-hide'); canvasEl().style.filter = '';
    const S = P.save; if (S){
      camera.rotation.order = S.order; camera.position.copy(S.pos); camera.quaternion.copy(S.quat); camera.fov = S.fov; camera.near = S.near; camera.updateProjectionMatrix();
      camYaw = S.camYaw; camPitch = S.camPitch; nw.state = S.state; nw.t = S.t; NW.root.rotation.y = S.rotY;
      gx.paused = S.paused;
    }
    P.ptr.clear(); P.joy.id = null; P.joy.x = P.joy.y = 0; P.lift = 0;
    try { canvasEl().focus({preventScroll:true}); } catch(e){}
  }
  const canvasEl = () => renderer.domElement;
  function setFilter(F){
    P.filter = F; canvasEl().style.filter = cssOf(F) || ''; vigEl.style.background = vigCss(F); vigEl.style.opacity = F.vig ? 1 : 0;
    panelEl.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === F.id)));
  }
  function renderPoses(){
    panelEl.querySelectorAll('[data-p]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.p === P.pose)); b.disabled = !!driving; });
    const f = $p('#phFace'); f.disabled = !!driving; f.setAttribute('aria-pressed', String(P.face));
  }
  function setPose(id){
    P.pose = id;
    if (id === 'laugh' || id === 'flip'){ nw.state = id === 'laugh' ? 'laugh' : 'pose'; nw.t = 1; if (id === 'laugh') sfx.laugh(); else sfx.sparkle(); }
    else { nw.state = P.save.state === 'laugh' || P.save.state === 'pose' ? 'idle' : P.save.state; nw.t = 0; }
    renderPoses();
  }

  /* ---------- camera ---------- */
  function clampPos(){
    const v = P.pos.clone().sub(P.anchor), h = Math.hypot(v.x, v.z);
    if (h > RANGE){ v.x *= RANGE / h; v.z *= RANGE / h; }
    v.y = Math.max(-6, Math.min(RANGE * .8, v.y)); P.pos.copy(P.anchor).add(v);
    const g = groundAt(P.pos.x, P.pos.z) + .35; if (P.pos.y < g) P.pos.y = g;
  }
  function applyCam(){
    camera.position.copy(P.pos); camera.rotation.set(P.pitch, P.yaw, P.roll, 'YXZ');
    if (Math.abs(camera.fov - P.fov) > .01){ camera.fov = P.fov; camera.updateProjectionMatrix(); }
  }
  const _f = new THREE.Vector3(), _r = new THREE.Vector3();
  function tick(dt){
    const K = P.keys, fast = K.ShiftLeft || K.ShiftRight ? 16 : 6;
    let f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - P.joy.y;
    let r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + P.joy.x;
    const u = (K.KeyR || K.PageUp ? 1 : 0) - (K.KeyF || K.PageDown ? 1 : 0) + P.lift;
    if (f || r || u){
      _f.set(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch)); _r.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      P.pos.addScaledVector(_f, f * fast * dt).addScaledVector(_r, r * fast * dt); P.pos.y += u * fast * .7 * dt; clampPos();
    }
    const q = (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0);
    if (q){ P.roll = Math.max(-.61, Math.min(.61, P.roll - q * dt * .8)); $p('#phRoll').value = Math.round(-P.roll * 180 / Math.PI); }
    if (P.face && !driving) NW.root.rotation.y = Math.atan2(P.pos.x - nw.x, P.pos.z - nw.z);
    applyCam();
  }

  /* ---------- freeze the world; let only 奶娃's pose move ---------- */
  const wrapFreeze = name => { if (typeof window[name] !== 'function') return; const f0 = window[name]; window[name] = function(){ if (P.on) return; return f0.apply(this, arguments); }; };
  ['updateNPCs', 'updateParts', 'updateFountain', 'updateOutskirts'].forEach(wrapFreeze);
  {
    const REST = NW_REST;
    const a0 = animNaiwa;
    animNaiwa = function(dt, T){
      if (!P.on) return a0(dt, T);
      if (!P.pose) return;                                   /* frozen as it was */
      if (P.pose === 'laugh' || P.pose === 'flip') nw.t = P.pose === 'laugh' ? .8 + (T % 1) : 1;   /* hold the peak */
      a0(dt, T);
      if (P.pose === 'laugh' || P.pose === 'flip') return;
      const L = Object.assign({}, REST), R = Object.assign({}, REST); let lean = 0, roll = 0, lift = 0; const t = T;
      if (P.pose === 'wave'){ R.sz = 2.55; R.sx = -.25; R.ex = -.5 + Math.sin(t * 14) * .55; R.ez = 0; roll = -.05; }
      else if (P.pose === 'heart'){ L.sz = R.sz = 2.05; L.sx = R.sx = -.45; L.ex = R.ex = -1.95; L.ez = R.ez = -.95; lean = -.08; }
      else if (P.pose === 'thumb'){ R.sx = -1.45; R.sz = .4; R.ex = -.2; R.ez = 0; L.sz = .55; lean = -.06; }
      else if (P.pose === 'dance'){ const s = Math.sin(t * 9); L.sz = 1.9 + s * .55; R.sz = 1.9 - s * .55; L.sx = R.sx = -.3; L.ex = R.ex = -.6; L.ez = R.ez = 0; roll = s * .2; lift = Math.abs(Math.cos(t * 9)) * .16; }
      const [aL, aR] = NW.arms, [eL, eR] = NW.elbows || [];
      aL.rotation.set(L.sx, 0, L.sz); aR.rotation.set(R.sx, 0, -R.sz);
      if (eL){ eL.rotation.set(L.ex, 0, L.ez); eR.rotation.set(R.ex, 0, -R.ez); }
      NW.body.rotation.x = lean; NW.body.rotation.z = roll; NW.body.position.y = lift;
    };
  }
  /* gx.frame runs every frame, paused or not, before the render (js/90-main.js) */
  { const f0 = gx.frame; gx.frame = function(dt, T){ if (f0) f0.call(this, dt, T); if (P.on){ try { tick(dt); } catch(e){} } }; }

  /* ---------- input ---------- */
  window.addEventListener('keydown', e => {
    if (!P.on){
      if (e.code === 'KeyO' && !e.repeat && mode === 'naiwa' && !gx.paused && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) && !document.querySelector('dialog[open]')){ e.preventDefault(); e.stopImmediatePropagation(); ac(); open(); }
      return;
    }
    if (e.target && e.target.tagName === 'INPUT' && /Arrow/.test(e.code)) return;
    e.stopImmediatePropagation();
    if (!outEl.hidden){ if (e.code === 'Escape'){ e.preventDefault(); outEl.hidden = true; } return; }
    if (e.repeat){ if (/^(Key[WASDQERF]|Arrow|Shift|Page)/.test(e.code)) e.preventDefault(); return; }
    if (e.code === 'Escape' || e.code === 'KeyO'){ e.preventDefault(); close(); return; }
    if (e.code === 'Space' || e.code === 'Enter'){ e.preventDefault(); shoot(); return; }
    if (e.code === 'KeyH'){ toggleHide(); return; }
    if (/^Digit[1-5]$/.test(e.code)){ setFilter(FILTERS[+e.code.slice(5) - 1]); return; }
    P.keys[e.code] = true; if (/^(Arrow|Page)/.test(e.code)) e.preventDefault();
  }, true);
  window.addEventListener('keyup', e => { P.keys[e.code] = false; }, true);
  window.addEventListener('blur', () => { for (const k in P.keys) P.keys[k] = false; });
  function toggleHide(){ P.hide = !P.hide; document.body.classList.toggle('ph-hide', P.hide); }
  /* drag to look, pinch (or the wheel) to zoom */
  touchEl.addEventListener('pointerdown', e => { P.ptr.set(e.pointerId, {x:e.clientX, y:e.clientY}); try { touchEl.setPointerCapture(e.pointerId); } catch(err){} if (P.ptr.size === 2){ const [a, b] = [...P.ptr.values()]; P.pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  touchEl.addEventListener('pointermove', e => {
    const p = P.ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (P.ptr.size === 1){ const k = P.fov / 60 * .005; P.yaw -= dx * k; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - dy * k)); }
    else if (P.ptr.size === 2){ const [a, b] = [...P.ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (P.pinch > 0){ setFov(P.fov * P.pinch / d); } P.pinch = d; }
  });
  const up = e => { P.ptr.delete(e.pointerId); P.pinch = 0; };
  touchEl.addEventListener('pointerup', up); touchEl.addEventListener('pointercancel', up);
  touchEl.addEventListener('wheel', e => { e.preventDefault(); setFov(P.fov * (1 + e.deltaY * .0012)); }, {passive:false});
  function setFov(f){ P.fov = Math.max(20, Math.min(90, f)); $p('#phZoom').value = Math.round(zoomOf(P.fov)); }
  $p('#phZoom').addEventListener('input', e => { P.fov = fovOf(+e.target.value); });
  $p('#phRoll').addEventListener('input', e => { P.roll = -(+e.target.value) * Math.PI / 180; });
  panelEl.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.f) setFilter(FILTERS.find(f => f.id === b.dataset.f));
    else if (b.dataset.p != null) setPose(b.dataset.p);
    else if (b.id === 'phFace'){ P.face = !P.face; if (!P.face) NW.root.rotation.y = P.save.rotY; renderPoses(); }
    else if (b.id === 'phShot') shoot();
  });
  topEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'phExit') close(); else if (b.id === 'phHide') toggleHide(); });
  showEl.addEventListener('click', toggleHide);
  /* the phone joystick and the up / down buttons */
  const joyMove = e => { const r = joyEl2.getBoundingClientRect(); let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2; const R = r.width / 2 - 14, l = Math.hypot(dx, dy); if (l > R){ dx *= R / l; dy *= R / l; }
    P.joy.x = dx / R; P.joy.y = dy / R; joyEl2.firstChild.style.transform = `translate(${dx}px,${dy}px)`; };
  joyEl2.addEventListener('pointerdown', e => { P.joy.id = e.pointerId; try { joyEl2.setPointerCapture(e.pointerId); } catch(err){} joyMove(e); e.preventDefault(); });
  joyEl2.addEventListener('pointermove', e => { if (e.pointerId === P.joy.id) joyMove(e); });
  const joyEnd = e => { if (e.pointerId !== P.joy.id) return; P.joy.id = null; P.joy.x = P.joy.y = 0; joyEl2.firstChild.style.transform = ''; };
  joyEl2.addEventListener('pointerup', joyEnd); joyEl2.addEventListener('pointercancel', joyEnd);
  udEl.querySelectorAll('button').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); P.lift = +b.dataset.ud; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { P.lift = 0; });
  });

  /* ---------- the shot ---------- */
  function shoot(){
    if (!P.on || P.busy) return;
    P.busy = true;
    try {
      const pr0 = renderer.getPixelRatio(), short = Math.min(innerWidth, innerHeight);
      let pr = Math.max(pr0, Math.min(2, 1080 / short));
      if (innerWidth * innerHeight * pr * pr > 4.2e6) pr = Math.max(pr0, Math.sqrt(4.2e6 / (innerWidth * innerHeight)));
      applyCam();
      if (Math.abs(pr - pr0) > 1e-3) renderer.setPixelRatio(pr);
      const T = performance.now() / 1000;
      if (typeof gfxRender === 'function') gfxRender(0, T); else renderer.render(scene, camera);
      const src = renderer.domElement, W = src.width, H = src.height;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); g.drawImage(src, 0, 0, W, H);
      if (Math.abs(pr - pr0) > 1e-3){ renderer.setPixelRatio(pr0); if (typeof gfxRender === 'function') gfxRender(0, T); else renderer.render(scene, camera); }
      grade(g, W, H, P.filter); mark(g, W, H);
      flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
      noise(.12, .25, 3000, 'highpass'); tone('square', 1800, 900, .06, .05, .05);
      showResult(cv);
    } catch(e){ toast('拍照失败', String(e && e.message || e).slice(0, 60), 2400); }
    P.busy = false;
  }
  function grade(g, W, H, F){
    if (F.f.length || F.grain){
      const img = g.getImageData(0, 0, W, H), d = img.data, M = matOf(F), gr = F.grain || 0, n = d.length;
      const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3] * 255, m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7] * 255, m8 = M[8], m9 = M[9], m10 = M[10], m11 = M[11] * 255;
      for (let i = 0; i < n; i += 4){
        const r = d[i], gg = d[i + 1], b = d[i + 2], z = gr ? (Math.random() - .5) * gr : 0;
        d[i] = m0 * r + m1 * gg + m2 * b + m3 + z; d[i + 1] = m4 * r + m5 * gg + m6 * b + m7 + z; d[i + 2] = m8 * r + m9 * gg + m10 * b + m11 + z;
      }
      g.putImageData(img, 0, 0);
    }
    if (F.vig){
      const R = Math.hypot(W, H) / 2, gr = g.createRadialGradient(W / 2, H / 2, R * .55, W / 2, H / 2, R);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, (F.warm ? 'rgba(90,30,0,' : 'rgba(0,0,0,') + F.vig + ')');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }
  function mark(g, W, H){
    const s = Math.max(.6, Math.min(W, H) / 1080), pad = 22 * s, css = getComputedStyle(document.body);
    const tile = (css.getPropertyValue('--tile') || '#c4522c').trim() || '#c4522c', font = css.fontFamily;
    g.save(); g.font = `700 ${Math.round(26 * s)}px ${font}`; const t1 = 'XMUM 校园漫游', w1 = g.measureText(t1).width;
    g.font = `500 ${Math.round(14 * s)}px ${font}`; const t2 = 'izhengjy.github.io/xmum-campus', w2 = g.measureText(t2).width;
    const iw = 30 * s, w = Math.max(w1 + iw + 8 * s, w2) + 24 * s, h = 64 * s, x = W - w - pad, y = H - h - pad;
    g.fillStyle = 'rgba(255,253,248,.82)'; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 12 * s); else g.rect(x, y, w, h); g.fill();
    g.translate(x + 12 * s, y + 10 * s); g.scale(s, s); g.fillStyle = tile; g.fill(new Path2D('M1 13 C7 12 10 6 15 2 C20 6 23 12 29 13 L26 15 L4 15 Z')); g.fillStyle = '#6b6560'; g.fillRect(6, 15, 18, 3); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1f2a33'; g.textBaseline = 'alphabetic'; g.font = `700 ${Math.round(26 * s)}px ${font}`; g.fillText(t1, x + 12 * s + iw + 8 * s, y + 32 * s);
    g.fillStyle = '#5b6670'; g.font = `500 ${Math.round(14 * s)}px ${font}`; g.fillText(t2, x + 12 * s, y + 54 * s);
    g.restore();
  }
  function showResult(cv){
    const url = cv.toDataURL('image/jpeg', .9), name = 'xmum-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg';
    outEl.innerHTML = `<div class="panel ph-card"><img alt="刚拍的照片"><p>${TOUCH ? '长按图片也能保存 · 发朋友圈、小红书记得带上 #XMUM校园漫游' : '发朋友圈、小红书记得带上 #XMUM校园漫游'}</p>
      <div class="hrow"><button type="button" class="btn primary" data-a="share" hidden>分享</button><button type="button" class="btn primary" data-a="save">${TOUCH ? '保存' : '下载图片'}</button><button type="button" class="btn" data-a="again">再拍一张</button></div></div>`;
    outEl.querySelector('img').src = url; outEl.hidden = false;
    let file = null;
    cv.toBlob(b => {
      if (!b) return; file = new File([b], name, {type:'image/jpeg'});
      try { if (navigator.canShare && navigator.canShare({files:[file]})){ const sb = outEl.querySelector('[data-a="share"]'); if (sb) sb.hidden = false; } } catch(e){}
    }, 'image/jpeg', .9);
    outEl.onclick = e => {
      const b = e.target.closest('button'); if (!b){ if (e.target === outEl) outEl.hidden = true; return; }
      if (b.dataset.a === 'again') outEl.hidden = true;
      else if (b.dataset.a === 'save'){ const a = document.createElement('a'); a.href = file ? URL.createObjectURL(file) : url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); if (file) setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      else if (b.dataset.a === 'share' && file) navigator.share({files:[file], title:'XMUM 校园漫游', text:'在 XMUM 校园漫游里拍的 #XMUM校园漫游'}).catch(() => {});
    };
  }

  /* ---------- the pause panel gets a 拍照 button ---------- */
  { const row = document.querySelector('#gxpause .hrow');
    if (row){ const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = 'gxpPhoto'; b.textContent = TOUCH ? '拍照' : '拍照 (O)';
      b.addEventListener('click', () => { ac(); open(); }); row.appendChild(b); } }
  /* leaving 奶娃 mode closes it */
  { const l0 = gx.leave; gx.leave = function(){ close(); return l0.apply(this, arguments); }; }

  window.XPhoto = {open, close, shoot, get on(){ return P.on; }, state:P, filters:FILTERS};
})();
