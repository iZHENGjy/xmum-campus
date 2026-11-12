/* XMUM 校园漫游 · 商店图标
 *
 * 1. XMUM 车行的车：以前每辆车只是一块圆角色块，现在是游戏里那辆车的真模型拍的小照片（¾ 前侧、棚拍光、透明底）。
 *    - 买过的车按存档里的样子拍：喷漆店的漆和贴花（wardSave.cars）、改装车间装上的零件（tune.cars[kind].fit）；没买的是出厂色。
 *    - 用主渲染器画进一张很小的离屏贴图（不另开 WebGL），读回来画进一张小 canvas，
 *      直接把 canvas 放进卡片（不压 PNG，省掉编码时间）。每辆车一张，按「漆 + 贴花 + 改装」记着，变了才重拍，旧的那张丢掉；
 *      同一时间最多 7 张（每张约 180×120 像素）。
 *    - 打开车行时才拍（懒加载），而且每帧只拍一辆：先显示原来的色块，拍好一张换一张，打开面板不卡。拍完把离屏贴图释放掉。
 *    - 车模型和 js/94-showcase.js 的展台一样用 makeCar 临时造一辆（几何体都是缓存共用的），拍完拿走，只释放它自己的漆材质。
 * 2. 车行里「改装店」「水枪工坊」的每一项升级、改装车间的每个零件槽、奶娃衣橱的每件衣服，都换成各自的线条小图标
 *    （以前改装店和水枪只有升级格子，改装车间一整页共用一个图标，衣橱只有一个色点）。
 *
 * 对外：carIcon(it) 给 js/80-gta.js 的车行列表用；XShopIcons = {thumb(kind), drop(), stats}（调试用）。
 */
'use strict';

/* ================= 1. 车的照片 ================= */
const CTH = {W:92, H:58, cache:{}, q:[], busy:false, rt:null, scene:null, cam:null, stats:{n:0, ms:0}};

/* what this car looks like in the player's save */
function cthLook(kind){
  const own = typeof owned !== 'undefined' && owned.has(kind);
  const w = own && typeof wardSave !== 'undefined' ? wardSave.cars[kind] : null;
  const f = own && typeof tune !== 'undefined' && tune.cars[kind] ? tune.cars[kind].fit : null;
  const p = w && w.p || 'stock', d = w && w.d || 'none';
  const fs = f && typeof TN_SLOTS !== 'undefined' ? TN_SLOTS.map(s => f[s.id] || '').join(',') : '';
  return {p, d, f, key:kind + '|' + p + '|' + d + '|' + fs};
}

function cthSetup(){
  if (CTH.scene) return;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#a39b8b', .95));
  const key = new THREE.DirectionalLight('#fff4e2', 1.0); key.position.set(-3, 8, 7); sc.add(key);
  const rim = new THREE.DirectionalLight('#e4ecff', .4); rim.position.set(6, 3, -6); sc.add(rim);
  CTH.scene = sc;
  CTH.cam = new THREE.PerspectiveCamera(22, CTH.W / CTH.H, .1, 200);
}

/* frame the car: the camera sits on a fixed ¾-front direction, distance and aim adjusted until the box fills the picture */
const CTH_DIR = new THREE.Vector3(.78, .5, 1).normalize();
function cthFrame(root){
  const cam = CTH.cam, box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
  const pts = []; for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  let d = box.getSize(new THREE.Vector3()).length() * 2.2;
  const aim = c.clone(), v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  for (let k = 0; k < 4; k++){
    cam.position.copy(aim).addScaledVector(CTH_DIR, d); cam.lookAt(aim); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts){ v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    /* shift the aim so the box is centred (a touch low: room for the shadow), then scale the distance to fill ~90 % */
    const hh = Math.tan(cam.fov * Math.PI / 360) * d, hw = hh * cam.aspect;
    right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
    aim.addScaledVector(right, (x0 + x1) / 2 * hw).addScaledVector(up, ((y0 + y1) / 2 + .03) * hh);
    d *= Math.max((x1 - x0) / 1.94, (y1 - y0) / 1.78);
  }
  cam.position.copy(aim).addScaledVector(CTH_DIR, d); cam.lookAt(aim); cam.updateMatrixWorld();
  /* where the wheels touch the ground, for the soft shadow */
  let g0 = 1e9, g1 = -1e9, gy = -1e9;
  for (const p of pts) if (p.y === box.min.y){ v.copy(p).project(cam); g0 = Math.min(g0, v.x); g1 = Math.max(g1, v.x); gy = Math.max(gy, -v.y); }
  return {g0, g1, gy};
}

function cthShoot(kind){
  const t0 = performance.now(), L = cthLook(kind), item = SHOP.find(s => s.kind === kind);
  cthSetup();
  const pr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(CTH.W * pr), H = Math.round(CTH.H * pr), SS = 2;   /* drawn 2× and scaled down: smooth edges without MSAA */
  if (!CTH.rt || CTH.rt.width !== W * SS) { if (CTH.rt) CTH.rt.dispose(); CTH.rt = new THREE.WebGLRenderTarget(W * SS, H * SS); }
  const c = makeCar(kind, item.color, 0, 0, 0);
  { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); }
  scene.remove(c.root); CTH.scene.add(c.root); c.root.rotation.set(0, 0, 0);
  try { if (typeof carPaint === 'function') carPaint(c, L.p, L.d, item.color); } catch(e){}
  try { if (L.f && typeof tnApply === 'function') tnApply(c, L.f); } catch(e){}
  const sh = cthFrame(c.root);
  /* render with the game's renderer, then put everything back the way it was */
  const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevEx = renderer.toneMappingExposure;
  const buf = new Uint8Array(W * SS * H * SS * 4);
  try {
    renderer.setRenderTarget(CTH.rt); renderer.setClearColor(0x000000, 0); renderer.toneMappingExposure = 1.08; renderer.clear();
    renderer.render(CTH.scene, CTH.cam);
    renderer.readRenderTargetPixels(CTH.rt, 0, 0, W * SS, H * SS, buf);
  } finally {
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); renderer.toneMappingExposure = prevEx;
    CTH.scene.remove(c.root); c.paint.dispose();
  }
  /* pixels come back upside down */
  const big = document.createElement('canvas'); big.width = W * SS; big.height = H * SS;
  const bg = big.getContext('2d'), img = bg.createImageData(W * SS, H * SS), row = W * SS * 4;
  for (let y = 0; y < H * SS; y++) img.data.set(buf.subarray((H * SS - 1 - y) * row, (H * SS - y) * row), y * row);
  bg.putImageData(img, 0, 0);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  /* soft contact shadow under the wheels */
  const sx = (sh.g0 + sh.g1) / 2 * W / 2 + W / 2, sw = Math.max(8, (sh.g1 - sh.g0) * W / 2 * .55), sy = Math.min(H - 3, (sh.gy + 1) / 2 * H - H * .05);
  g.save(); g.translate(sx, sy); g.scale(1, .2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, sw); gr.addColorStop(0, 'rgba(40,30,20,.32)'); gr.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sw, 0, Math.PI * 2); g.fill(); g.restore();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(big, 0, 0, W, H);
  /* the canvas itself goes into the card: no PNG encoding (17 ms on a laptop, and toBlob waits up to a second for idle time) */
  out.className = 'cth-cv';
  CTH.cache[kind] = {key:L.key, cv:out};
  CTH.stats.n++; CTH.stats.ms += performance.now() - t0;
  cthAttach();
}

/* one car per frame, so opening the 车行 never stalls on all seven at once */
function cthPump(){
  CTH.busy = false;
  const kind = CTH.q.shift();
  if (kind){
    try { cthShoot(kind); } catch(e){ CTH.cache[kind] = {key:cthLook(kind).key, cv:null, fail:true}; }
  }
  if (CTH.q.length){ CTH.busy = true; requestAnimationFrame(cthPump); }
  else if (CTH.rt){ CTH.rt.dispose(); CTH.rt = null; }   /* done: give the graphics memory back */
}
function cthWant(kind){
  const e = CTH.cache[kind], key = cthLook(kind).key;
  if (e && e.key === key) return;
  if (!CTH.q.includes(kind)) CTH.q.push(kind);
  if (!CTH.busy){ CTH.busy = true; requestAnimationFrame(cthPump); }
}
/* put each car's canvas into its card (the list is rebuilt with innerHTML, so this runs after every render; moving a canvas is free) */
function cthAttach(){
  CTH.att = false;
  for (const el of document.querySelectorAll('#shopList .cth[data-k]')){
    const e = CTH.cache[el.dataset.k];
    if (e && e.cv && e.cv.parentNode !== el){ el.textContent = ''; el.appendChild(e.cv); el.classList.add('on'); }
  }
}

/* the 车行 list asks for this: a span the picture goes into (the old colour swatch shows until it is ready) */
carIcon = it => {
  cthWant(it.kind);
  if (!CTH.att){ CTH.att = true; queueMicrotask(cthAttach); }   /* after renderShop has written the list */
  return `<span class="cth" data-k="${it.kind}" aria-hidden="true" style="--c:${it.color}"></span>`;
};
window.XShopIcons = {thumb:k => { const e = CTH.cache[k]; return e && e.cv ? e.cv.toDataURL('image/png') : null; }, drop(){ CTH.cache = {}; },
  get stats(){ return Object.assign({queued:CTH.q.length, cached:Object.keys(CTH.cache).length}, CTH.stats); }};

/* ================= 2. 改装店、水枪工坊：每一项升级一个图标 ================= */
const UP_ICON = {
  eng:TN_SLOT_ICON.eng, grip:TN_SLOT_ICON.tyre,
  arm:'<path d="M4 20.5v-9L8.5 5h7l4.5 6.5v9"/><path d="M4 11.5h16M8.5 5L12 11.5 15.5 5M12 11.5v9M2.5 20.5h19"/>',
  wr:'<path d="M2.5 9h7.5l2-2v8l-2-2H2.5z"/><path d="M14.5 11h2.5M19.5 11h2"/><path d="M14.5 7.5l1.5-1M14.5 14.5l1.5 1"/>',
  wp:'<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4.6-5.2"/><circle cx="12" cy="16" r="1.4"/><path d="M6.5 20.5h11"/>',
  wt:'<rect x="5" y="5.5" width="14" height="15.5" rx="3.2"/><path d="M9 3h6M12 3v2.5"/><path d="M5.2 13c2.3-1.2 4.5 1.2 6.8 0s4.5-1.2 6.8 0"/>',
  wg:'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M18 2.8v4.4h-4.4"/><path d="M12 8.6c1.7 2.1 2.5 3.4 2.5 4.4a2.5 2.5 0 0 1-5 0c0-1 .8-2.3 2.5-4.4z"/>',
  wx:'<path d="M2.5 9.5h8l2-2.5v10l-2-2.5h-8z"/><path d="M15 12h6.5M15 9.5l5.8-3.3M15 14.5l5.8 3.3"/>'
};
upIcon = u => UP_ICON[u.k] ? `<svg class="gx-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${UP_ICON[u.k]}</svg>` : '';

/* ================= 3. 奶娃衣橱、喷漆店：画出这件东西的轮廓，用它自己的颜色填 =================
   The tile keeps its colour (plain, gradient or pattern, from WD_SW / the paint list) and an SVG outline is used as a CSS mask on it,
   so a hat looks like a hat and four yellow 身形 dots become four different bodies. One small SVG per item or per slot, built once. */
const WD_GLYPH = (() => {
  const nw = (rx, ry, cy) => `<path d="M${12 - rx} ${cy}c0-${ry * 1.1} ${rx * .45}-${ry * 1.55} ${rx}-${ry * 1.55}s${rx} ${ry * .45} ${rx} ${ry * 1.55}c0 ${ry * .8}-${rx * .45} ${ry}-${rx} ${ry}s-${rx}-${ry * .2}-${rx}-${ry}z"/><ellipse cx="${12 - rx * .45}" cy="${cy + ry * .98}" rx="${rx * .38}" ry="1.3"/><ellipse cx="${12 + rx * .45}" cy="${cy + ry * .98}" rx="${rx * .38}" ry="1.3"/>`;
  const car = '<path d="M1.5 15.5v-3.2l3.2-1.4 3.6-3.6c.4-.4.9-.6 1.4-.6h5.1c.6 0 1.1.3 1.5.7l2.9 3.4 2.6.7c.5.1.7.5.7 1v3z"/><circle cx="6.5" cy="16" r="2.4"/><circle cx="17.5" cy="16" r="2.4"/>';
  const shirt = '<path d="M8 3L3 6l2 5 2.5-1V21h9V10l2.5 1 2-5-5-3c-.6 1.4-2 2.4-4 2.4S8.6 4.4 8 3z"/>';
  const robe = '<path d="M8 3L3 6.5l2 4.5 2-1L5.5 21h13L17 10l2 1 2-4.5L16 3c-.6 1.4-2 2.4-4 2.4S8.6 4.4 8 3z"/>';
  const s = (d, w) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return {
    /* 皮肤 / 身形: 奶娃 itself (the shapes differ in proportion) */
    skin:nw(6.5, 7.5, 12), std:nw(6.5, 7.5, 12), chubby:nw(8.6, 6.6, 12.5), slim:nw(5, 8.6, 11.5), big:nw(8.4, 8.4, 11.6),
    outfit:shirt, emperor:robe, detective:robe, santa:robe,
    head:'<path d="M7 14l1-7c2-1.5 6-1.5 8 0l1 7z"/><ellipse cx="12" cy="15.5" rx="10" ry="2.6"/>',
    melon:'<path d="M3 15a9 9 0 0 1 18 0z"/><rect x="2" y="15" width="20" height="3" rx="1.5"/>',
    pineapple:'<path d="M12 1.5l1.6 4 2.6-2.4-1 4.4H8.8l-1-4.4 2.6 2.4z"/><ellipse cx="12" cy="14.6" rx="6" ry="7"/>',
    santahat:'<path d="M5 17L11 4c3 0 6 3 7 7l-1.5.6L15 17z"/><circle cx="18.6" cy="12.2" r="2.1"/><rect x="3.5" y="16.5" width="14" height="3.6" rx="1.8"/>',
    buns:'<circle cx="6.8" cy="8" r="4"/><circle cx="17.2" cy="8" r="4"/><path d="M3.5 19a8.5 7 0 0 1 17 0z"/>',
    policecap:'<path d="M4 12c0-4 4-6.5 8-6.5s8 2.5 8 6.5z"/><path d="M4 12h16v3H4z"/><path d="M5 15h9l-2.5 3.5H5.5z"/>',
    tricorn:'<path d="M1.5 10.5c4 1.4 6.4-3.5 10.5-3.5s6.5 4.9 10.5 3.5c-1 4.6-5 7.5-10.5 7.5S2.5 15.1 1.5 10.5z"/>',
    pearl:'<path d="M4 15c0-6 3.5-10 8-10s8 4 8 10c-2.5-1.5-5-2-8-2s-5.5.5-8 2z"/><circle cx="12" cy="18.8" r="2.4"/>',
    mian:'<rect x="1.5" y="5" width="21" height="3.2" rx="1"/><path d="M7.5 8.2h9V17h-9z"/>' + s('M3.5 8.5v8M5.8 8.5v5.5M18.2 8.5v5.5M20.5 8.5v8', 1.6),
    dm_rollers:'<rect x="2.5" y="7.5" width="5.5" height="10" rx="2.75"/><rect x="9.25" y="5" width="5.5" height="10" rx="2.75"/><rect x="16" y="7.5" width="5.5" height="10" rx="2.75"/>',
    dm_basin:'<path d="M2.5 9.5h19l-3 8.5h-13z"/><rect x="1" y="7.2" width="22" height="2.8" rx="1.4"/>',
    face:'<path d="M2 8.5h9v3.5a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M13 8.5h9v3.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4z"/>' + s('M11 9.5h2'),
    meh:'<path d="M2.5 10.5h8v3a4 4 0 0 1-8 0z"/><path d="M13.5 10.5h8v3a4 4 0 0 1-8 0z"/>',
    glasses:'<circle cx="6.5" cy="12.5" r="4.2" fill="none" stroke="#000" stroke-width="2.4"/><circle cx="17.5" cy="12.5" r="4.2" fill="none" stroke="#000" stroke-width="2.4"/>' + s('M10.7 12h2.6M2.3 11.5L1 10M21.7 11.5L23 10', 2.2),
    neck:'<path d="M2 6l9 4.5v3L2 18z"/><path d="M22 6l-9 4.5v3l9 4.5z"/><rect x="10" y="9.3" width="4" height="5.4" rx="1"/>',
    badge:s('M6 2l6 8 6-8') + '<rect x="6" y="10" width="12" height="12" rx="2"/>',
    dm_lanyard:s('M7 2l5 10 5-10') + '<rect x="8" y="12" width="8" height="10" rx="1.6"/>',
    chain:s('M3 3.5c1 9 5 12.5 9 12.5s8-3.5 9-12.5', 2.6) + '<circle cx="12" cy="18.5" r="3.4"/>',
    back:'<path d="M7 3h10l4.5 18h-19z"/>',
    furcape:'<path d="M6.5 7h11l4 14h-19z"/><ellipse cx="12" cy="6" rx="7.5" ry="3.4"/>',
    bag:s('M9 6a3 3 0 0 1 6 0') + '<rect x="4.5" y="6" width="15" height="15.5" rx="4"/>',
    dm_foodbox:'<path d="M3 7l9-4 9 4v11l-9 4-9-4z"/>',
    hand:'<path d="M5 7h12l-1.5 14h-9z"/><rect x="4" y="3.5" width="14" height="3.5" rx="1"/>',
    coffee:'<path d="M5 7h12l-1.5 14h-9z"/><rect x="4" y="3.5" width="14" height="3.5" rx="1"/>',
    boba:'<path d="M5 8.5h14l-2 12.5H7z"/><rect x="4" y="6.3" width="16" height="2.6" rx="1.2"/>' + s('M13 7l3-5.5', 2.2),
    seal:'<rect x="4" y="12.5" width="16" height="8.5" rx="1"/><path d="M8 12.5c0-3 1.6-5 4-5s4 2 4 5z"/><circle cx="12" cy="5" r="2.5"/>',
    dm_torch:'<path d="M2.5 9.5h10l5-3.5v12l-5-3.5h-10z"/>' + s('M20 8.5l2.5-1M20 12h2.8M20 15.5l2.5 1', 1.8),
    paint:car, decal:car
  };
})();
const wdGlyphCache = {};
function wdGlyph(it){
  if (!it) return null;
  const k = WD_GLYPH[it.id] ? it.id : WD_GLYPH[it.slot] ? it.slot : null; if (!k) return null;
  return wdGlyphCache[k] || (wdGlyphCache[k] = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${WD_GLYPH[k]}</svg>`));
}
