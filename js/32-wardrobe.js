/* XMUM 校园漫游 · 奶娃衣橱和喷漆：皮肤、身形、服饰、配件的目录与穿戴（nwDress），车漆和贴花（carPaint）。
   商店界面、存档和成就在 js/88-wardrobe-ui.js。只用游戏里的 RM，不接真钱。 */
'use strict';
NW_SHAPES.chubby = {w:1.16, belly:.34, s:.96};
NW_SHAPES.slim = {w:.86, belly:.1, s:1.07};
NW_SHAPES.big = {w:1.08, belly:.26, s:1.2};

/* ---------- shared canvas textures (built once; .keep stops js/net.js disposing them with a ghost) ---------- */
const wdTexCache = {};
function wdTex(key, w, h, draw, noWrap){
  if (wdTexCache[key]) return wdTexCache[key];
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO; if (!noWrap) t.wrapS = THREE.RepeatWrapping; t.keep = true;
  t.redraw = () => { draw(cv.getContext('2d'), w, h); t.needsUpdate = true; };
  return wdTexCache[key] = t;
}
const wdRng = mkRng(7171);
function wdStars(g, w, h, n, big){
  for (let i = 0; i < n; i++){
    const x = wdRng() * w, y = wdRng() * h, r = wdRng() < .08 ? (big || 1.6) : .5 + wdRng() * .7;
    g.fillStyle = `rgba(255,255,255,${.55 + wdRng() * .45})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}
function wdNebula(g, w, h, bg, blobs){
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (const [x, y, r, c] of blobs){ for (const dx of [-w, 0, w]){ const gr = g.createRadialGradient(x * w + dx, y * h, 0, x * w + dx, y * h, r * w); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }
}
/* XMUM 校徽 badge: drawn here; if assets/xmum-crest.png exists (the official crest, square, transparent corners) it is used instead */
let wdCrestImg = null, wdCrestTried = false;
function wdCrestLoad(){
  if (wdCrestTried) return; wdCrestTried = true;
  const im = new Image(); im.onload = () => { wdCrestImg = im; for (const k of ['crestBody', 'crestBelly']) if (wdTexCache[k]) wdTexCache[k].redraw(); }; im.src = 'assets/xmum-crest.png';
}
function wdArcText(g, txt, r, step, top, font){
  g.font = font; const chars = [...txt], st = top ? step : -step;
  chars.forEach((ch, i) => { const a = (i - (chars.length - 1) / 2) * st; g.save(); g.rotate(a); g.translate(0, top ? -r : r); g.fillText(ch, 0, 0); g.restore(); });
}
function wdStar8(g, x, y, r){
  g.beginPath(); for (let i = 0; i < 16; i++){ const a = i / 16 * Math.PI * 2, rr = i % 2 ? r * .42 : r; g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr); } g.closePath(); g.fill();
}
/* drawn after the crest the owner sent: blue double ring, 廈門大學 over the top (read right to left), UNIVERSITAS AMOIENSIS under it,
   eight-point stars either side, a shield with the gate tower and the 止於至善 ribbon in the middle */
function wdCrest(g, cx, cy, rx, ry){
  g.save(); g.translate(cx, cy); g.scale(rx / 100, ry / 100);
  g.fillStyle = '#fbfcfe'; g.beginPath(); g.arc(0, 0, 100, 0, 7); g.fill();
  if (wdCrestImg){ g.save(); g.beginPath(); g.arc(0, 0, 97, 0, 7); g.clip(); g.drawImage(wdCrestImg, -97, -97, 194, 194); g.restore(); g.restore(); return; }
  const B = '#1d3f8f'; g.strokeStyle = B; g.fillStyle = B; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 95, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 61, 0, 7); g.stroke();
  wdArcText(g, '學大門廈', 78, .5, true, '900 27px "Noto Serif SC","Songti SC",serif');
  wdArcText(g, 'UNIVERSITAS AMOIENSIS', 79, .118, false, '800 16px Arial,sans-serif');
  wdStar8(g, -78, 0, 10); wdStar8(g, 78, 0, 10);
  /* shield */
  g.lineWidth = 2.5; g.beginPath(); g.moveTo(-30, -40); g.lineTo(30, -40); g.lineTo(30, 4); g.quadraticCurveTo(30, 28, 0, 38); g.quadraticCurveTo(-30, 28, -30, 4); g.closePath(); g.stroke();
  /* gate tower: two wings, a taller middle with battlements, an arched gate */
  g.fillRect(-22, -14, 44, 26); g.fillRect(-12, -26, 24, 12);
  for (const [x0, y0, n] of [[-22, -18, 5], [-12, -30, 3]]) for (let i = 0; i < n; i++) g.fillRect(x0 + i * (n === 5 ? 9.4 : 8.4), y0, 5, 4.5);
  g.fillStyle = '#fbfcfe'; g.beginPath(); g.moveTo(-7, 12); g.lineTo(-7, 0); g.arc(0, 0, 7, Math.PI, 0); g.lineTo(7, 12); g.closePath(); g.fill();
  for (const x of [-17, 13]) g.fillRect(x, -8, 4, 6); g.fillRect(-3, -22, 6, 5);
  /* motto ribbon */
  g.fillStyle = '#fbfcfe'; g.strokeStyle = B; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-40, 22); g.quadraticCurveTo(0, 32, 40, 22); g.lineTo(38, 36); g.quadraticCurveTo(0, 46, -38, 36); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = B; g.font = '700 10px "Noto Serif SC","Songti SC",serif'; g.fillText('善 至 於 止', 0, 33);
  g.restore();
}
const WD_TEX = {
  crestBody:() => { wdCrestLoad(); return wdTex('crestBody', 512, 256, (g, w, h) => {
    g.fillStyle = '#3c80e0'; g.fillRect(0, 0, w, h);
    const ry = 23, rx = ry * 1.75;   /* the lathe stretches u about 1.75x more than v round the belly */
    for (const [u, v] of [[.5, .45], [.3, .58], [.7, .58], [.38, .26], [.62, .26], [.12, .66], [.88, .66], [.5, .78]]) wdCrest(g, u * w, (1 - v) * h, rx * (v > .7 ? .8 : 1), ry);
  }); },
  crestBelly:() => { wdCrestLoad(); return wdTex('crestBelly', 256, 256, (g, w, h) => {
    g.fillStyle = '#a9d0f2'; g.fillRect(0, 0, w, h); wdCrest(g, w / 2, h * .54, 68, 100);
  }, true); },
  rainbow:() => wdTex('rainbow', 128, 128, (g, w, h) => {
    const im = g.createImageData(w, h), c = new THREE.Color();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      c.setHSL(((1 - y / h) * .78 + Math.sin(x / w * Math.PI * 2) * .06 + 1) % 1, .85, .58); const i = (y * w + x) * 4;
      im.data[i] = c.r * 255; im.data[i + 1] = c.g * 255; im.data[i + 2] = c.b * 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }),
  galaxy:() => wdTex('galaxy', 256, 256, (g, w, h) => {
    wdNebula(g, w, h, '#151a4d', [[.2, .3, .3, 'rgba(122,70,200,.55)'], [.7, .6, .35, 'rgba(40,110,210,.5)'], [.45, .85, .25, 'rgba(190,80,190,.35)'], [.9, .15, .2, 'rgba(70,160,230,.4)']]);
    wdStars(g, w, h, 260, 2.2);
  }),
  galaxyGlow:() => wdTex('galaxyGlow', 256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); wdStars(g, w, h, 90, 2); }),
  melon:() => wdTex('melon', 256, 128, (g, w, h) => {
    g.fillStyle = '#2d6a29'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#93c75f';
    for (let k = 0; k < 9; k++){
      const x0 = (k + .5) * w / 9; g.beginPath();
      for (let y = 0; y <= h; y += 4) g.lineTo(x0 + Math.sin(y * .18 + k) * 4 + 7 + Math.sin(y * .5 + k * 3) * 1.6, y);
      for (let y = h; y >= 0; y -= 4) g.lineTo(x0 + Math.sin(y * .18 + k) * 4 - 7 - Math.sin(y * .43 + k) * 1.6, y);
      g.fill();
    }
    g.fillStyle = '#e9efc4'; g.fillRect(0, h - 7, w, 7); g.fillStyle = '#d9584a'; g.fillRect(0, h - 3, w, 3);   /* the cut edge: pale rind, a line of red */
  }),
  pineapple:() => wdTex('pineapple', 256, 128, (g, w, h) => {
    g.fillStyle = '#c99a2e'; g.fillRect(0, 0, w, h);
    const n = 12, rows = 7, cw = w / n, ch = (h - 8) / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k <= n; k++){
      const x = k * cw + (r % 2 ? cw / 2 : 0), y = r * ch + ch / 2;
      g.fillStyle = r % 2 ? '#e0b445' : '#d9ab3c'; g.beginPath(); g.moveTo(x, y - ch * .62); g.lineTo(x + cw * .55, y); g.lineTo(x, y + ch * .62); g.lineTo(x - cw * .55, y); g.closePath(); g.fill();
      g.strokeStyle = '#8a6420'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#6b4a17'; g.beginPath(); g.moveTo(x - 3, y + 2); g.lineTo(x, y - 6); g.lineTo(x + 3, y + 2); g.fill();
    }
    g.fillStyle = '#f2df98'; g.fillRect(0, h - 8, w, 8);
  }),
  robe:() => wdTex('robe', 128, 128, (g, w, h) => {
    g.fillStyle = '#17140f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c99b3d'; g.lineWidth = 2;
    for (let y = 8; y < h; y += 16) for (let x = 0; x <= w; x += 16){ const xx = x + (y / 16 % 2 ? 8 : 0); g.beginPath(); g.moveTo(xx, y - 6); g.quadraticCurveTo(xx + 7, y, xx, y + 6); g.quadraticCurveTo(xx - 7, y, xx, y - 6); g.stroke(); }
  }),
  blank:() => wdTex('blank', 2, 2, g => { g.clearRect(0, 0, 2, 2); }, true)
};

/* ---------- geometry helpers: clothes follow the body surface (they read the body shape being built) ---------- */
/* a sheet wrapped round the body between heights y0..y1 (either may depend on the angle th, 0 = front),
   off = gap from the skin (number or (y, th, t) => number). uv: u around (front = .5 for a full wrap), v bottom to top. cap closes it at the crown. */
function wdWrap(o){
  const cols = o.cols || 40, rows = o.rows || 10, th0 = o.th0 != null ? o.th0 : -Math.PI, th1 = o.th1 != null ? o.th1 : Math.PI;
  const pos = [], uv = [], idx = [], val = (f, a, b, c) => typeof f === 'function' ? f(a, b, c) : f;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++){
    const th = th0 + (th1 - th0) * i / cols, t = j / rows, y0 = val(o.y0, th), y1 = val(o.y1, th);
    let y = y0 + (y1 - y0) * (o.ease ? 1 - Math.pow(1 - t, 1.6) : t), off = val(o.off, y, th, t), r = nwR(y) + off;
    if (o.cap && j === rows){ y = 1.825 + off * .85; r = 0; }
    const p = nwShape(Math.sin(th) * r, y, Math.cos(th) * r, Math.max(r, 1e-4));
    pos.push(p[0], p[1], p[2]); uv.push(i / cols, t);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++){ const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
/* the rim of a helmet / hat over the head: high over the eyes, low at the back */
const wdBrow = (front, side, back) => th => { const c = Math.cos(th); return side + (c > 0 ? (front - side) * c : (side - back) * c) + .13 * Math.exp(-Math.pow((Math.abs(th) - .84) / .55, 2)); };
const wdMat = (c, o) => M(c, Object.assign({roughness:.75, side:THREE.DoubleSide}, o || {}));
const wdGold = () => M('#d9ab45', {roughness:.3, metalness:.65});
const wdMesh = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); return m; };
const wdAt = (th, y, off) => new THREE.Vector3(...nwOnBody(th, y, off));

/* ---------- catalogue ----------
   slot: skin / shape / outfit / head / face / neck / back / hand. tier: n 普通, r 稀有, l 传说.
   build(k) puts parts on with k.put(parent, object); k.N is the 奶娃 being dressed. */
const WD_SLOTS = [['skin', '皮肤'], ['outfit', '服饰'], ['head', '头饰'], ['face', '眼部'], ['neck', '颈部'], ['back', '背后'], ['hand', '手上'], ['shape', '身形']];
const WD_TIER = {n:'普通', r:'稀有', l:'传说'};
/* full outfit: a body sheet, optional sleeves (arms) and trouser legs */
function wdSuit(k, o){
  const N = k.N, mat = o.mat;
  k.put(N.body, new THREE.Mesh(wdWrap({y0:o.y0, y1:o.y1 || 1.47, off:o.off || .032, th0:o.th0, th1:o.th1, rows:14}), mat));
  if (o.sleeve) N.arms.forEach((a, i) => {
    k.put(a, new THREE.Mesh(nwCapsule(.103, .094, o.sleeve === 'long' ? .27 : .16, 14), o.sleeveMat || mat));
    if (o.sleeve === 'long') k.put(N.elbows[i], new THREE.Mesh(nwCapsule(.092, .082, o.cuff ? .19 : .21, 14), o.sleeveMat || mat));
    if (o.cuff) k.put(N.elbows[i], wdMesh(new THREE.TorusGeometry(.085, .028, 8, 20), o.cuff, 0, -.2, 0, Math.PI / 2));
  });
  if (o.legs) N.legs.forEach(l => k.put(l, new THREE.Mesh(nwCapsule(.162, .14, o.legLen || .26, 14), o.legs)));
}
const wdBand = (k, y0, y1, off, mat, th0, th1) => k.put(k.N.body, new THREE.Mesh(wdWrap({y0, y1, off, th0, th1, rows:2, cols:44}), mat));
function wdTie(k, col){
  const m = wdMat(col, {roughness:.55});
  k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.98, y1:1.4, off:.05, th0:-.11, th1:.11, rows:8, cols:3}), m));
  const kn = wdAt(0, 1.43, .055); k.put(k.N.body, wdMesh(new THREE.SphereGeometry(.045, 10, 8), m, kn.x, kn.y, kn.z)).scale.set(1.2, .9, .7);
}
/* helmets and caps that hug the dome of the head */
const wdShell = (k, mat, rim, off) => k.put(k.N.body, new THREE.Mesh(wdWrap({y0:rim, y1:1.825, off:off || .034, cap:true, rows:12, cols:48}), mat));
function wdEyeAnchor(k, i, z){
  const a = k.N.slots.eyes[i], g = new THREE.Group(); g.position.copy(a.p); g.rotation.y = a.ry; k.put(k.N.body, g);
  const inner = new THREE.Group(); inner.position.z = z || 0; g.add(inner); return inner;
}
function wdCape(k, col, fur){
  const m = wdMat(col, {roughness:.8});
  k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.18, y1:1.46, th0:Math.PI - 1.15, th1:Math.PI + 1.15, off:(y, th, t) => .05 + .3 * Math.pow(1 - t, 1.3), rows:12, cols:20}), m));
  if (fur){ const f = wdMat(fur, {roughness:1}); k.put(k.N.body, new THREE.Mesh(wdWrap({y0:1.36, y1:1.52, off:(y, th, t) => .07 + .05 * Math.sin(t * Math.PI), rows:4, cols:40}), f)); }
  else for (const s of [-1, 1]){ const p = wdAt(s * 1.25, 1.44, .05); k.put(k.N.body, wdMesh(new THREE.SphereGeometry(.04, 10, 8), wdGold(), p.x, p.y, p.z)); }
}

const WD_ITEMS = [
  /* skins: body colour and material, belly patch, hands and feet (from the reference sheet 031–036) */
  {id:'classic', slot:'skin', name:'原味奶黄', desc:'最初的样子', price:0, tier:'n', skin:'#f2c64a', belly:'#eee0ba', hand:'#55532c', foot:'#3b3920'},
  {id:'orange', slot:'skin', name:'橙色型', desc:'像一颗大橙子', price:30, tier:'n', skin:'#f0842a', belly:'#f3dcc2', hand:'#4f4136', foot:'#4a3b2e'},
  {id:'pink', slot:'skin', name:'粉色型', desc:'草莓牛奶味', price:30, tier:'n', skin:'#f29ac0', belly:'#f8dde3', hand:'#e284ad', foot:'#d57aa0'},
  {id:'white', slot:'skin', name:'白色型', desc:'刚洗完澡', price:40, tier:'n', skin:'#f3f2ee', belly:'#e3e0d8', hand:'#d4d2cc', foot:'#cfccc4'},
  {id:'blue', slot:'skin', name:'蓝色型', desc:'冷静的蓝奶娃', price:60, tier:'n', skin:'#3f8fe6', belly:'#b6dcf7', hand:'#2a5a9c', foot:'#24508c'},
  {id:'rainbow', slot:'skin', name:'虹彩型', desc:'从头到脚一道彩虹', price:1200, tier:'r', tex:'rainbow', belly:'#f4ead8', hand:'#5b4fd2', foot:'#4b3fb8'},
  {id:'galaxy', slot:'skin', name:'星空型', desc:'身上有星星，晚上会发光', price:2800, tier:'l', tex:'galaxy', glow:'galaxyGlow', belly:'#2a2f6e', hand:'#24263a', foot:'#1e2032', iris:'#9fe0ff'},
  {id:'xmumblue', slot:'skin', name:'XMUM 校徽型', desc:'蓝色奶娃，肚子上一枚大校徽，身上贴满小校徽', price:999, tier:'r', tex:'crestBody', bellyTex:'crestBelly', hand:'#3a3d44', foot:'#2c5aa6'},
  {id:'gold', slot:'skin', name:'鎏金型', desc:'纯金打造，全校最贵', price:5000, tier:'l', skin:'#f3c24e', metal:.4, rough:.3, belly:'#f3dc9a', hand:'#6b4f1d', foot:'#5a4218'},

  /* body shapes */
  {id:'std', slot:'shape', name:'标准', desc:'原版身材', price:0, tier:'n'},
  {id:'chubby', slot:'shape', name:'圆滚滚', desc:'更圆、肚子更大', price:120, tier:'n'},
  {id:'slim', slot:'shape', name:'瘦高', desc:'苗条一点、高一点', price:120, tier:'n'},
  {id:'big', slot:'shape', name:'大只', desc:'整只大一号', price:600, tier:'r'},

  /* outfits */
  {id:'shirt', slot:'outfit', name:'衬衫领带', desc:'上班族奶娃：白衬衫、蓝领带、黑西裤', price:80, tier:'n', build(k){
    wdSuit(k, {mat:wdMat('#f4f3ef'), y0:.66, sleeve:'short', legs:wdMat('#2c2d31'), legLen:.24});
    wdBand(k, .44, .67, .042, wdMat('#2c2d31')); wdBand(k, .64, .7, .05, wdMat('#151515', {roughness:.4})); wdTie(k, '#2e4f8f');
  }},
  {id:'police', slot:'outfit', name:'警察制服', desc:'浅蓝警服、深蓝领带、警徽和肩章。被保安追的时候穿上它', price:180, tier:'n', build(k){
    const navy = wdMat('#1c2338'), silver = M('#d9dee4', {roughness:.3, metalness:.6}), blk = wdMat('#111214', {roughness:.4});
    wdSuit(k, {mat:wdMat('#a9c8ea'), y0:.66, sleeve:'short', legs:navy, legLen:.24});
    wdBand(k, .44, .67, .042, navy); wdBand(k, .63, .71, .052, blk); wdTie(k, '#1b2440');
    const bk = wdAt(0, .67, .062); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.1, .065, .02), silver, bk.x, bk.y, bk.z));
    const hol = wdAt(-1.35, .62, .08); k.put(k.N.body, wdMesh(roundBox(.1, .18, .14, .03), blk, hol.x, hol.y, hol.z, 0, -1.35, 0));
    /* shield badge on the left chest, name tag on the right, pocket flaps */
    const sb = wdAt(.46, 1.27, .045), shield = new THREE.Shape([[0, .06], [.045, .04], [.04, -.02], [0, -.06], [-.04, -.02], [-.045, .04]].map(([x, y]) => new THREE.Vector2(x, y)));
    k.put(k.N.body, wdMesh(new THREE.ExtrudeGeometry(shield, {depth:.012, bevelEnabled:false}), silver, sb.x, sb.y, sb.z, 0, .46, 0));
    const nt = wdAt(-.46, 1.25, .045); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.1, .025, .01), silver, nt.x, nt.y, nt.z, 0, -.46, 0));
    for (const th of [-.42, .42]){ const p = wdAt(th, 1.17, .042); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.13, .035, .012), wdMat('#94b6dc'), p.x, p.y, p.z, -.15, th, 0)); }
    /* navy epaulettes with a silver button, a round patch on the outside of each sleeve */
    k.N.arms.forEach((a, i) => { k.put(a, wdMesh(new THREE.BoxGeometry(.12, .02, .15), navy, 0, .1, 0)); k.put(a, wdMesh(new THREE.SphereGeometry(.014, 6, 4), silver, 0, .115, .05));
      const sx = i ? -1 : 1; k.put(a, wdMesh(new THREE.CylinderGeometry(.045, .045, .01, 14), navy, sx * .1, -.07, 0, 0, 0, Math.PI / 2));
      k.put(a, wdMesh(new THREE.TorusGeometry(.045, .006, 4, 16), M('#d9ab45', {roughness:.4, metalness:.5}), sx * .106, -.07, 0, 0, Math.PI / 2, 0)); });
  }},
  {id:'redvest', slot:'outfit', name:'红马甲', desc:'双髻红衫那套的马甲，敞着怀露出肚皮', price:90, tier:'n', build(k){
    const red = wdMat('#c8302a', {roughness:.6}), gold = wdGold();
    wdSuit(k, {mat:red, y0:.72, th0:.5, th1:Math.PI * 2 - .5});
    for (const th of [.5, Math.PI * 2 - .5]) k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.72, y1:1.47, off:.04, th0:th - .05, th1:th + .05, rows:10, cols:2}), gold));
  }},
  {id:'santa', slot:'outfit', name:'圣诞衣装', desc:'红衣白毛边、黑腰带，配圣诞帽更像', price:200, tier:'n', foot:'#1e1d1c', build(k){
    const red = wdMat('#c4262b', {roughness:.85}), fur = wdMat('#f6f3ee', {roughness:1});
    wdSuit(k, {mat:red, y0:.5, sleeve:'long', cuff:fur, legs:red, legLen:.3});
    wdBand(k, .44, .56, .06, fur); wdBand(k, 1.4, 1.5, .06, fur);
    k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.5, y1:1.44, off:.05, th0:-.14, th1:.14, rows:10, cols:3}), fur));
    wdBand(k, .8, .88, .055, wdMat('#151515', {roughness:.45}));
    const b = wdAt(0, .84, .07); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.13, .1, .02), wdGold(), b.x, b.y, b.z));
  }},
  {id:'detective', slot:'outfit', name:'侦探风衣', desc:'黑色长风衣，配礼帽和墨镜', price:350, tier:'r', build(k){
    const coat = wdMat('#24252a', {roughness:.7});
    wdSuit(k, {mat:coat, y0:.3, off:(y) => .036 + .1 * Math.max(0, (.8 - y) / .5), sleeve:'long', legs:coat, legLen:.2});
    k.put(k.N.body, new THREE.Mesh(wdWrap({y0:1.36, y1:1.56, off:(y, th, t) => .045 + .05 * t, rows:3, cols:40}), coat));
    wdBand(k, .82, .9, .075, wdMat('#121214', {roughness:.5}));
    for (const [th, y] of [[-.22, 1.2], [.22, 1.2], [-.22, 1.04], [.22, 1.04]]){ const p = wdAt(th, y, .06); k.put(k.N.body, wdMesh(new THREE.SphereGeometry(.022, 8, 6), wdMat('#0b0b0c'), p.x, p.y, p.z)); }
  }},
  {id:'hero', slot:'outfit', name:'蓝衣英雄', desc:'紧身蓝衣、金腰带、红手套红靴子，配红披风', price:900, tier:'r', hand:'#c22f2a', foot:'#c22f2a', build(k){
    const blue = wdMat('#2c55c2', {roughness:.45});
    wdSuit(k, {mat:blue, y0:.44, y1:1.5, off:.026, sleeve:'long', legs:blue, legLen:.32});
    wdBand(k, .62, .71, .045, wdGold());
    const b = wdAt(0, .665, .06); k.put(k.N.body, wdMesh(new THREE.BoxGeometry(.15, .12, .025), wdGold(), b.x, b.y, b.z));
    k.N.arms.forEach(a => { const ep = wdMesh(new THREE.SphereGeometry(.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), wdGold(), 0, .03, 0); ep.scale.set(1.1, .45, 1.1); k.put(a, ep); });
  }},
  {id:'emperor', slot:'outfit', name:'帝王袍', desc:'黑金龙袍，配冕冠和玉玺', price:4000, tier:'l', build(k){
    const robe = wdMat('#ffffff', {map:WD_TEX.robe(), roughness:.55, metalness:.15});
    k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.16, y1:1.48, off:(y) => .04 + .24 * Math.pow(Math.max(0, (.85 - y) / .69), 1.4), rows:16}), robe));
    const gold = wdGold(); wdBand(k, 1.38, 1.5, .06, gold); wdBand(k, .16, .21, .27, gold);
    k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.18, y1:1.44, off:.07, th0:-.1, th1:.1, rows:10, cols:2}), gold));
    k.N.arms.forEach((a, i) => { k.put(a, new THREE.Mesh(nwCapsule(.11, .1, .27, 14), robe)); const s = wdMesh(new THREE.CylinderGeometry(.1, .2, .3, 16, 1, true), robe, 0, -.13, 0); k.put(k.N.elbows[i], s); });
  }},

  /* head */
  {id:'melon', slot:'head', name:'西瓜头盔', desc:'吃完的西瓜皮，戴上刚刚好', price:120, tier:'n', build(k){
    const m = wdMat('#ffffff', {map:WD_TEX.melon(), roughness:.45});
    wdShell(k, m, wdBrow(1.68, 1.56, 1.45), .05);
    const st = wdMesh(new THREE.CylinderGeometry(.012, .02, .09, 6), wdMat('#7a8a3a'), 0, .06, -.02, -.5); k.put(k.N.slots.head, st);
  }},
  {id:'pineapple', slot:'head', name:'菠萝头盔', desc:'挖空的菠萝，叶子朝天', price:150, tier:'n', build(k){
    const m = wdMat('#ffffff', {map:WD_TEX.pineapple(), roughness:.7});
    wdShell(k, m, wdBrow(1.68, 1.56, 1.45), .055);
    const leaf = wdMat('#3f8f3a', {roughness:.6}), lg = new THREE.ConeGeometry(.035, .34, 4); lg.translate(0, .17, 0); lg.scale(1, 1, .35);
    for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2, t = i % 2 ? .55 : .3, l = wdMesh(lg, leaf, Math.sin(a) * .02, .02, Math.cos(a) * .02); l.rotation.set(t, a, 0, 'YXZ'); l.scale.setScalar(i % 2 ? .8 : 1.1); k.put(k.N.slots.head, l); }
  }},
  {id:'santahat', slot:'head', name:'圣诞帽', desc:'红帽子白毛边，顶上一颗绒球', price:50, tier:'n', build(k){
    const g = new THREE.Group(); g.position.set(0, -.08, -.02); g.rotation.x = -.25;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.18, .42, 18, 4, true), wdMat('#c4262b', {roughness:.9})); cone.position.y = .2; cone.rotation.z = .25; cone.position.x = -.04;
    g.add(cone, wdMesh(new THREE.TorusGeometry(.175, .05, 8, 24), wdMat('#f6f3ee', {roughness:1}), 0, 0, 0, Math.PI / 2), wdMesh(new THREE.SphereGeometry(.055, 10, 8), wdMat('#f6f3ee', {roughness:1}), -.1, .4, 0));
    k.put(k.N.slots.head, g);
  }},
  {id:'buns', slot:'head', name:'双髻', desc:'两个黑发髻，系红丝带', price:60, tier:'n', build(k){
    const hair = wdMat('#1d1a18', {roughness:.6}), rib = wdMat('#d3302c', {roughness:.6});
    wdShell(k, hair, wdBrow(1.7, 1.6, 1.5), .022);
    for (const s of [-1, 1]){ k.put(k.N.slots.head, wdMesh(new THREE.SphereGeometry(.085, 14, 10), hair, s * .15, -.02, -.03));
      k.put(k.N.slots.head, wdMesh(new THREE.TorusGeometry(.06, .016, 6, 16), rib, s * .12, -.06, -.03, 0, 0, s * .9)); }
  }},
  {id:'fedora', slot:'head', name:'侦探礼帽', desc:'黑色礼帽，帽檐压低', price:120, tier:'n', build(k){
    const blk = wdMat('#1c1c1f', {roughness:.6}), g = new THREE.Group(); g.position.set(0, -.07, 0); g.rotation.set(.12, 0, -.08);
    g.add(wdMesh(new THREE.CylinderGeometry(.15, .17, .17, 20), blk, 0, .09, 0), wdMesh(new THREE.CylinderGeometry(.3, .3, .016, 28), blk, 0, .005, 0), wdMesh(new THREE.CylinderGeometry(.172, .172, .04, 20, 1, true), wdMat('#4a4a4f'), 0, .03, 0));
    k.put(k.N.slots.head, g);
  }},
  {id:'policecap', slot:'head', name:'警帽', desc:'深蓝大檐帽，黑色帽檐，银色帽徽', price:90, tier:'n', build(k){
    const navy = wdMat('#1c2338', {roughness:.6}), g = new THREE.Group(); g.position.set(0, -.08, 0); g.rotation.x = .08;
    g.add(wdMesh(new THREE.CylinderGeometry(.165, .16, .08, 22), wdMat('#0f1118', {roughness:.5}), 0, .04, 0), wdMesh(new THREE.CylinderGeometry(.235, .17, .1, 24), navy, 0, .13, 0),
      wdMesh(new THREE.CylinderGeometry(.235, .235, .012, 24), navy, 0, .18, 0));
    g.add(wdMesh(new THREE.CylinderGeometry(.19, .19, .014, 20, 1, false, -Math.PI / 2, Math.PI), wdMat('#0b0b0d', {roughness:.15}), 0, .01, .03, .28));
    g.add(wdMesh(new THREE.CylinderGeometry(.04, .04, .012, 8), M('#d9dee4', {roughness:.3, metalness:.6}), 0, .11, .2, Math.PI / 2 - .35));
    k.put(k.N.slots.head, g);
  }},
  {id:'tricorn', slot:'head', name:'海盗帽', desc:'三角海盗帽，配金链子和毛领披风', price:300, tier:'r', build(k){
    const blk = wdMat('#18181a', {roughness:.6}), g = new THREE.Group(); g.position.set(0, -.07, 0);
    const brim = new THREE.CylinderGeometry(.34, .34, .02, 36, 1), p = brim.attributes.position;
    for (let i = 0; i < p.count; i++){ const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), a = Math.atan2(x, z); if (r > .2) p.setY(i, p.getY(i) + (r - .2) * .9 * (.5 + .5 * Math.cos(3 * a))); }
    brim.computeVertexNormals();
    g.add(new THREE.Mesh(brim, blk), wdMesh(new THREE.CylinderGeometry(.13, .17, .16, 20), blk, 0, .08, 0), wdMesh(new THREE.TorusGeometry(.33, .01, 4, 40), wdGold(), 0, .01, 0, Math.PI / 2));
    g.add(wdMesh(new THREE.SphereGeometry(.035, 10, 8), wdMat('#f2f0e8'), 0, .09, .16));
    k.put(k.N.slots.head, g);
  }},
  {id:'pearl', slot:'head', name:'珍珠耳环头巾', desc:'名画同款：蓝黄头巾，一颗珍珠耳环', price:1500, tier:'r', build(k){
    const blue = wdMat('#3d5fa8', {roughness:.85}), yel = wdMat('#d9b766', {roughness:.85});
    wdShell(k, blue, wdBrow(1.69, 1.57, 1.47), .05);
    k.put(k.N.slots.head, wdMesh(new THREE.SphereGeometry(.12, 14, 10), yel, 0, -.02, -.12)).scale.set(1, .8, 1.1);
    const tail = new THREE.Mesh(wdWrap({y0:1.0, y1:1.66, th0:Math.PI - .3, th1:Math.PI + .3, off:(y, th, t) => .07 + .06 * (1 - t), rows:8, cols:6}), yel); k.put(k.N.body, tail);
    const end = new THREE.Mesh(wdWrap({y0:.94, y1:1.02, th0:Math.PI - .3, th1:Math.PI + .3, off:.13, rows:1, cols:6}), blue); k.put(k.N.body, end);
    const e = wdAt(1.5, 1.5, .04); k.put(k.N.body, wdMesh(new THREE.SphereGeometry(.035, 14, 10), M('#f4f2ee', {roughness:.12, metalness:.3}), e.x, e.y - .03, e.z));
  }},
  {id:'mian', slot:'head', name:'冕冠', desc:'皇帝的平顶冠，前后垂着珠帘', price:3000, tier:'l', build(k){
    const blk = wdMat('#141210', {roughness:.5}), gold = wdGold(), g = new THREE.Group(); g.position.set(0, -.06, 0);
    g.add(wdMesh(new THREE.CylinderGeometry(.12, .14, .16, 18), blk, 0, .08, 0), wdMesh(new THREE.BoxGeometry(.3, .022, .5), blk, 0, .18, 0, .06), wdMesh(new THREE.BoxGeometry(.31, .012, .51), gold, 0, .195, 0, .06));
    const bead = new THREE.SphereGeometry(.014, 6, 4), str = new THREE.CylinderGeometry(.004, .004, .2, 4);
    for (const zs of [-1, 1]) for (let i = 0; i < 7; i++){ const x = -.13 + i * .043, z = zs * .245, y = .18 + zs * .015;
      g.add(wdMesh(str, gold, x, y - .1, z)); for (let b = 0; b < 3; b++) g.add(wdMesh(bead, b % 2 ? wdMat('#c53b2c') : gold, x, y - .05 - b * .06, z)); }
    k.put(k.N.slots.head, g);
  }},

  /* eyes */
  {id:'meh', slot:'face', name:'无语眼', desc:'眼皮耷拉下来，一脸无语', price:20, tier:'n', build(k){
    const lid = wdMat('#3a2a1e', {roughness:.6});
    k.N.eyes.forEach(e => { const m = wdMesh(new THREE.SphereGeometry(.07, 16, 8, 0, Math.PI * 2, 0, 1.25), lid, 0, 0, .004, .55); m.scale.z = .66; k.put(e, m); });
  }},
  {id:'glasses', slot:'face', name:'圆框眼镜', desc:'衬衫领带那位同款', price:40, tier:'n', build(k){
    const fr = M('#1d1d1f', {roughness:.4}), ring = new THREE.TorusGeometry(.078, .01, 6, 24), ends = [];
    for (const i of [0, 1]){ const a = wdEyeAnchor(k, i, .045); a.add(new THREE.Mesh(ring, fr)); ends.push(a); }
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(); k.N.body.updateMatrixWorld(true);
    ends[0].localToWorld(p0.set(.075, 0, 0)); ends[1].localToWorld(p1.set(-.075, 0, 0)); k.N.body.worldToLocal(p0); k.N.body.worldToLocal(p1);
    const mid = p0.clone().add(p1).multiplyScalar(.5); mid.z += .04;
    k.put(k.N.body, new THREE.Mesh(geoMerge([rodGeo(.008, .008, p0.toArray(), mid.toArray(), 5), rodGeo(.008, .008, mid.toArray(), p1.toArray(), 5)]), fr));
  }},
  {id:'shades', slot:'face', name:'墨镜', desc:'侦探和海盗都爱戴', price:70, tier:'n', build(k){
    const fr = M('#111113', {roughness:.15, metalness:.4}), lens = new THREE.CylinderGeometry(.082, .082, .014, 22), ends = [];
    for (const i of [0, 1]){ const a = wdEyeAnchor(k, i, .05); a.add(wdMesh(lens, fr, 0, 0, 0, Math.PI / 2)); ends.push(a); }
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(); k.N.body.updateMatrixWorld(true);
    ends[0].localToWorld(p0.set(.078, .02, 0)); ends[1].localToWorld(p1.set(-.078, .02, 0)); k.N.body.worldToLocal(p0); k.N.body.worldToLocal(p1);
    const mid = p0.clone().add(p1).multiplyScalar(.5); mid.z += .03;
    k.put(k.N.body, new THREE.Mesh(geoMerge([rodGeo(.011, .011, p0.toArray(), mid.toArray(), 5), rodGeo(.011, .011, mid.toArray(), p1.toArray(), 5)]), fr));
  }},

  /* neck */
  {id:'bowtie', slot:'neck', name:'红领结', desc:'小小一个，很精神', price:30, tier:'n', build(k){
    const m = wdMat('#c8302a', {roughness:.5}), p = wdAt(0, 1.44, .045), g = new THREE.Group(); g.position.copy(p);
    const c = new THREE.ConeGeometry(.055, .1, 4); c.rotateZ(Math.PI / 2); c.translate(.05, 0, 0); c.scale(1, 1, .4);
    g.add(new THREE.Mesh(c, m), wdMesh(c, m, 0, 0, 0, 0, Math.PI, 0), wdMesh(new THREE.SphereGeometry(.026, 8, 6), m));
    k.put(k.N.body, g);
  }},
  /* the 迎新工作牌 from the story (js/89-quest.js gives it after the opening); quest:true = not sold, only shows once you have it */
  {id:'badge', slot:'neck', name:'迎新工作牌', desc:'开学那天学姐给的，蓝色挂绳，牌子上写着 XMUM 新生', price:0, tier:'n', quest:true, sw:'#2f6fd0', build(k){
    const strap = wdMat('#2f6fd0', {roughness:.6}), y = 1.44, r = nwR(y) + .03, g = new THREE.Group(); g.position.set(0, y - .02, nwLean(y) + .01); g.rotation.x = Math.PI / 2 - .3;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, .014, 5, 28), strap)); k.put(k.N.body, g);
    const p = wdAt(0, 1.2, .07), card = new THREE.Group(); card.position.copy(p); card.rotation.x = -.12;
    card.add(wdMesh(new THREE.BoxGeometry(.15, .19, .012), wdMat('#ffffff', {roughness:.5})), wdMesh(new THREE.BoxGeometry(.15, .05, .014), strap, 0, .07, 0),
      wdMesh(new THREE.BoxGeometry(.09, .016, .014), wdMat('#2c2d31'), 0, -.01, 0), wdMesh(new THREE.BoxGeometry(.07, .012, .014), wdMat('#9aa3ad'), 0, -.045, 0));
    for (const sx of [-1, 1]) card.add(wdMesh(new THREE.CylinderGeometry(.006, .006, .2, 4), strap, sx * .05, .17, -.01, 0, 0, sx * .5));
    k.put(k.N.body, card);
  }},
  {id:'chain', slot:'neck', name:'金链子', desc:'又粗又亮，海盗船长同款', price:500, tier:'r', build(k){
    const y = 1.43, r = nwR(y) + .04, gold = wdGold(), g = new THREE.Group(); g.position.set(0, y - .02, nwLean(y) + .02); g.rotation.x = Math.PI / 2 - .25;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, .022, 6, 32), gold));
    const link = new THREE.TorusGeometry(.03, .011, 5, 10);
    for (let i = 0; i < 18; i++){ const a = i / 18 * Math.PI * 2; g.add(wdMesh(link, gold, Math.cos(a) * r, Math.sin(a) * r, 0, 0, Math.PI / 2, a)); }
    k.put(k.N.body, g);
    const md = wdAt(0, 1.3, .06); k.put(k.N.body, wdMesh(new THREE.CylinderGeometry(.05, .05, .015, 16), gold, md.x, md.y, md.z, Math.PI / 2 - .2));
  }},

  /* back */
  {id:'bag', slot:'back', name:'小书包', desc:'装满了期末复习资料', price:60, tier:'n', build(k){
    const p = wdAt(Math.PI, 1.06, .11), m = wdMat('#3d7fd0', {roughness:.7});
    const b = wdMesh(roundBox(.36, .42, .16, .06), m, p.x, p.y, p.z); k.put(k.N.body, b);
    k.put(k.N.body, wdMesh(roundBox(.24, .14, .06, .03), wdMat('#2f66ad'), p.x, p.y - .1, p.z - .09));
    for (const s of [-1, 1]) k.put(k.N.body, new THREE.Mesh(wdWrap({y0:.98, y1:1.48, off:.02, th0:s * 1.0 - .05, th1:s * 1.0 + .05, rows:6, cols:1}), wdMat('#2f66ad')));
  }},
  {id:'cape', slot:'back', name:'红披风', desc:'蓝衣英雄的披风，跑起来更快（心理作用）', price:400, tier:'r', build(k){ wdCape(k, '#c62d2a'); }},
  {id:'furcape', slot:'back', name:'毛领披风', desc:'海盗船长的黑红披风，带红毛领', price:700, tier:'r', build(k){ wdCape(k, '#2a1716', '#b8322a'); }},

  /* hand (right) */
  {id:'coffee', slot:'hand', name:'咖啡杯', desc:'早八续命用', price:25, tier:'n', build(k){
    const g = new THREE.Group(), m = wdMat('#1f1f22', {roughness:.35}); g.position.set(0, -.04, .06); g.rotation.x = .9;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.055, .05, .12, 16), m), wdMesh(new THREE.TorusGeometry(.03, .01, 6, 12), m, .06, 0, 0), wdMesh(new THREE.CylinderGeometry(.049, .049, .005, 16), wdMat('#4a2a17'), 0, .056, 0));
    k.put(k.N.slots.handR, g);
  }},
  {id:'boba', slot:'hand', name:'珍珠奶茶', desc:'全糖少冰', price:30, tier:'n', build(k){
    const g = new THREE.Group(); g.position.set(0, -.05, .06); g.rotation.x = .9;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(.06, .048, .17, 16), wdMat('#d7b48a', {roughness:.3})), wdMesh(new THREE.CylinderGeometry(.049, .045, .03, 16), wdMat('#2a1a12'), 0, -.07, 0),
      wdMesh(new THREE.CylinderGeometry(.009, .009, .14, 6), wdMat('#1d1d1f'), .015, .13, 0, 0, 0, -.15));
    k.put(k.N.slots.handR, g);
  }},
  {id:'seal', slot:'hand', name:'玉玺', desc:'帝王袍那位手里捧的', price:800, tier:'r', build(k){
    const g = new THREE.Group(); g.position.set(0, -.06, .07); g.rotation.x = .9;
    g.add(wdMesh(roundBox(.15, .09, .15, .02), wdGold()), wdMesh(new THREE.SphereGeometry(.05, 12, 8), M('#5fae7e', {roughness:.25}), 0, .07, 0));
    k.put(k.N.slots.handR, g);
  }}
];
const WD = {byId:{}};
for (const it of WD_ITEMS){ WD.byId[it.id] = it; }
const WD_DEFAULT = {skin:'classic', shape:'std', outfit:null, head:null, face:null, neck:null, back:null, hand:null};
/* a look is {slot: item id}; anything unknown or in the wrong slot falls back to the default */
function wdLook(l){
  const o = Object.assign({}, WD_DEFAULT);
  if (l && typeof l === 'object') for (const s in WD_DEFAULT){ const it = WD.byId[l[s]]; if (it && it.slot === s) o[s] = it.id; }
  return o;
}

/* ---------- dressing ---------- */
function wdDispose(o){
  o.traverse(m => {
    if (m.geometry && !m.geometry.keep) m.geometry.dispose();
    if (m.material) [].concat(m.material).forEach(x => { if (!x.keep) x.dispose(); });
  });
}
function nwReshape(N, shape){
  const f = makeNaiwa(shape);
  N.root.remove(N.body); wdDispose(N.body); N.root.add(f.body);
  for (const k of ['body', 'belly', 'eyes', 'mouth', 'arms', 'elbows', 'legs', 'mats', 'skins', 'slots', 'shape']) N[k] = f[k];
}
/* put a whole look on a 奶娃 from makeNaiwa (the player, a shop preview, an online ghost). o.shadow === false skips shadows. */
function nwDress(N, look, o){
  look = wdLook(look); o = o || {};
  for (const [par, obj] of N.worn || []){ par.remove(obj); wdDispose(obj); }
  N.worn = [];
  if (N.shape !== look.shape) nwReshape(N, look.shape);
  const sk = WD.byId[look.skin], fit = WD.byId[look.outfit], m = N.mats;
  if (sk.tex){ m.skin.map = WD_TEX[sk.tex](); m.skin.color.set('#ffffff'); } else { m.skin.map = null; m.skin.color.set(sk.skin); }
  if (sk.glow){ m.skin.emissiveMap = WD_TEX[sk.glow](); m.skin.emissive.set('#ffffff'); m.skin.emissiveIntensity = .55; } else { m.skin.emissiveMap = null; m.skin.emissive.set('#000000'); }
  m.skin.metalness = sk.metal || 0; m.skin.roughness = sk.rough || .62; m.skin.needsUpdate = true;
  if (sk.bellyTex){ m.belly.map = WD_TEX[sk.bellyTex](); m.belly.color.set('#ffffff'); } else { m.belly.map = null; m.belly.color.set(sk.belly); }
  m.belly.needsUpdate = true; m.hand.color.set(fit && fit.hand || sk.hand); m.foot.color.set(fit && fit.foot || sk.foot);
  m.iris.color.set(sk.iris || '#86c873');
  const k = {N, put(parent, obj){ parent.add(obj); N.worn.push([parent, obj]); return obj; }};
  nwWith(N.shape, () => { for (const s of ['outfit', 'head', 'face', 'neck', 'back', 'hand']){ const it = WD.byId[look[s]]; if (it && it.build) it.build(k); } });
  const sh = o.shadow !== false;
  for (const [, obj] of N.worn) obj.traverse(x => { if (x.isMesh) x.castShadow = sh; });
  if (!sh) N.root.traverse(x => { if (x.isMesh) x.castShadow = false; });
  N.look = look;
  return N;
}
/* compact form for the online presence: item ids joined with commas (ids are unique across the catalogue) */
const wdLookStr = l => Object.keys(WD_DEFAULT).map(s => l[s]).filter(id => id && id !== 'classic' && id !== 'std').join(',');
function wdLookParse(str){
  const l = {}; String(str || '').split(',').forEach(id => { const it = WD.byId[id]; if (it) l[it.slot] = id; });
  return wdLook(l);
}

/* ---------- car paint and decals ---------- */
const WD_PAINTS = [
  {id:'stock', name:'原厂漆', desc:'车行出厂的颜色', price:0, tier:'n', fin:'solid'},
  {id:'tomato', name:'番茄红', price:40, tier:'n', color:'#d63a2f', fin:'solid'},
  {id:'naiwa', name:'奶娃黄', price:40, tier:'n', color:'#f2c64a', fin:'solid'},
  {id:'mint', name:'薄荷绿', price:40, tier:'n', color:'#5cc9a0', fin:'solid'},
  {id:'sky', name:'天空蓝', price:40, tier:'n', color:'#4aa3e8', fin:'solid'},
  {id:'sakura', name:'樱花粉', price:40, tier:'n', color:'#f3a2c0', fin:'solid'},
  {id:'pearlw', name:'珍珠白', price:50, tier:'n', color:'#f3f1ea', fin:'solid'},
  {id:'obsid', name:'曜石黑', price:50, tier:'n', color:'#1d1e22', fin:'solid'},
  {id:'tanger', name:'活力橙', price:50, tier:'n', color:'#f07f2a', fin:'solid'},
  {id:'mblue', name:'金属蓝', price:280, tier:'r', color:'#2a5bd6', fin:'metal'},
  {id:'mpurp', name:'金属紫', price:280, tier:'r', color:'#7442c2', fin:'metal'},
  {id:'mgreen', name:'金属绿', price:280, tier:'r', color:'#1f8a55', fin:'metal'},
  {id:'champ', name:'香槟金', price:350, tier:'r', color:'#c9a45c', fin:'metal'},
  {id:'gun', name:'枪灰', price:350, tier:'r', color:'#5d6168', fin:'metal'},
  {id:'matte', name:'哑光黑', price:600, tier:'r', color:'#2a2b2f', fin:'matte'},
  {id:'chrome', name:'镀铬银', price:2500, tier:'l', color:'#dfe3e8', fin:'chrome'},
  {id:'gilt', name:'鎏金', price:4500, tier:'l', color:'#e0ae3e', fin:'chrome'}
];
const WD_FIN = {solid:{r:.32, m:.3, n:'普通漆'}, metal:{r:.2, m:.65, n:'金属漆'}, matte:{r:.95, m:0, n:'哑光'}, chrome:{r:.1, m:.85, n:'镀铬'}};
/* decals are painted onto canvas strips and projected onto the car's own panels: side (along the car) and top (hood, roof, boot) */
function wdFlames(g, w, h, x0, len){
  for (let k = 0; k < 7; k++){
    const y = h * (.35 + k * .085), L = len * (.55 + .45 * Math.sin(k * 2.3 + 1) ** 2);
    const gr = g.createLinearGradient(x0, 0, x0 + L, 0); gr.addColorStop(0, '#ffe24a'); gr.addColorStop(.5, '#ff8a1e'); gr.addColorStop(1, '#d92b16');
    g.fillStyle = gr; g.strokeStyle = '#8a1a0c'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y - h * .06); g.bezierCurveTo(x0 + L * .4, y - h * .1, x0 + L * .7, y - h * .02, x0 + L, y - h * .05);
    g.bezierCurveTo(x0 + L * .65, y + h * .01, x0 + L * .35, y + h * .08, x0, y + h * .05); g.closePath(); g.fill(); g.stroke();
  }
}
const WD_DECALS = [
  {id:'none', name:'不贴', desc:'干干净净', price:0, tier:'n'},
  {id:'stripes', name:'赛车条纹', desc:'车顶两道白条，侧面细线', price:150, tier:'n',
    side:g => { g.fillStyle = '#f6f4ee'; g.fillRect(0, 70, 512, 6); g.fillRect(0, 82, 512, 3); },
    top:g => { g.fillStyle = '#f6f4ee'; g.fillRect(96, 0, 24, 512); g.fillRect(136, 0, 24, 512); }},
  {id:'xmum', name:'XMUM 07', desc:'侧面印着 XMUM 和 07 号', price:120, tier:'n', read:true,
    side:g => { g.fillStyle = '#f6f4ee'; g.beginPath(); g.arc(256, 64, 36, 0, 7); g.fill(); g.fillStyle = '#b5442a'; g.font = '900 44px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('07', 256, 66);
      g.fillStyle = '#f6f4ee'; g.font = '900 30px "Noto Sans SC",sans-serif'; g.fillText('XMUM', 130, 66); g.fillText('XMUM', 382, 66); }},
  {id:'checker', name:'棋盘格', desc:'车身下沿一圈黑白格', price:250, tier:'n',
    side:g => { for (let x = 0; x < 512; x += 16) for (let y = 0; y < 2; y++){ g.fillStyle = ((x / 16 + y) % 2) ? '#111' : '#f6f4ee'; g.fillRect(x, 92 + y * 16, 16, 16); } },
    top:g => { for (let y = 0; y < 512; y += 16) for (let x = 0; x < 2; x++){ g.fillStyle = ((y / 16 + x) % 2) ? '#111' : '#f6f4ee'; g.fillRect(112 + x * 16, y, 16, 16); } }},
  {id:'flames', name:'火焰', desc:'从车头烧到车门', price:350, tier:'r',
    side:(g, w, h) => wdFlames(g, w, h, 0, 300), top:(g, w, h) => { g.save(); g.translate(w, 0); g.rotate(Math.PI / 2); wdFlames(g, h, w, 0, 170); g.restore(); }},
  {id:'melon', name:'西瓜纹', desc:'整车变成一个西瓜', price:600, tier:'r',
    side:(g, w, h) => { g.fillStyle = '#2d6a29'; g.fillRect(0, 0, w, h); g.fillStyle = '#93c75f'; for (let k = 0; k < 4; k++){ const y0 = 14 + k * 30; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * .05 + k) * 4); for (let x = w; x >= 0; x -= 8) g.lineTo(x, y0 + 12 + Math.sin(x * .07 + k * 2) * 3); g.fill(); } },
    top:(g, w, h) => { g.fillStyle = '#2d6a29'; g.fillRect(0, 0, w, h); g.fillStyle = '#93c75f'; for (let k = 0; k < 5; k++){ const x0 = 18 + k * 50; g.beginPath(); for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * .05 + k) * 5, y); for (let y = h; y >= 0; y -= 8) g.lineTo(x0 + 16 + Math.sin(y * .07 + k * 2) * 4, y); g.fill(); } }},
  {id:'nwface', name:'奶娃贴纸', desc:'车门上一张奶娃大脸', price:900, tier:'r', read:true,
    side:g => { g.fillStyle = '#f2c64a'; g.strokeStyle = '#3b3920'; g.lineWidth = 3; g.beginPath(); g.ellipse(256, 66, 52, 46, 0, 0, 7); g.fill(); g.stroke();
      for (const s of [-1, 1]){ g.fillStyle = '#86c873'; g.beginPath(); g.arc(256 + s * 24, 52, 13, 0, 7); g.fill(); g.fillStyle = '#141210'; g.beginPath(); g.arc(256 + s * 24, 53, 7, 0, 7); g.fill(); }
      g.strokeStyle = '#141210'; g.lineWidth = 3; g.beginPath(); g.moveTo(240, 80); g.lineTo(272, 80); g.stroke(); }},
  {id:'galaxy', name:'星空涂装', desc:'整车一片星空', price:3000, tier:'l',
    side:(g, w, h) => { wdNebula(g, w, h, '#151a4d', [[.2, .4, .2, 'rgba(122,70,200,.6)'], [.6, .5, .25, 'rgba(40,110,210,.55)'], [.9, .3, .15, 'rgba(190,80,190,.4)']]); wdStars(g, w, h, 160); },
    top:(g, w, h) => { wdNebula(g, w, h, '#151a4d', [[.3, .2, .5, 'rgba(122,70,200,.5)'], [.6, .7, .6, 'rgba(40,110,210,.5)']]); wdStars(g, w, h, 180); }}
];
const WD_PAINT = {}, WD_DECAL = {};
WD_PAINTS.forEach(p => { WD_PAINT[p.id] = p; WD.byId[p.id] = Object.assign({slot:'paint'}, p); });
WD_DECALS.forEach(d => { WD_DECAL[d.id] = d; WD.byId['d_' + d.id] = Object.assign({slot:'decal'}, d, {id:'d_' + d.id}); });
const wdDecalTex = (d, part) => d[part] ? wdTex('dc_' + d.id + part, part === 'side' ? 512 : 256, part === 'side' ? 128 : 512, d[part], true) : WD_TEX.blank();
const WD_DECAL_VS = 'varying vec3 vDcP; varying vec3 vDcN;\n';
function wdDecalHook(U){
  return sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WD_DECAL_VS).replace('#include <begin_vertex>', '#include <begin_vertex>\nvDcP = position; vDcN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WD_DECAL_VS + 'uniform sampler2D dcSide; uniform sampler2D dcTop; uniform vec3 dcDim; uniform float dcOn; uniform float dcRead;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1. - dcA;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .45, dcA);')
      .replace('#include <map_fragment>', `#include <map_fragment>
float dcA = 0.;   /* how much decal covers this pixel: decals are printed vinyl, not metal */
if (dcOn > .5){
  vec3 an = normalize(vDcN); float fl = (vDcP.x < 0. && dcRead > .5) ? -1. : 1.;
  vec4 s = texture2D(dcSide, vec2(.5 - fl * vDcP.z / dcDim.x, clamp(vDcP.y / dcDim.y, .002, .998)));
  vec4 t = texture2D(dcTop, vec2(.5 + vDcP.x / dcDim.z, .5 + vDcP.z / dcDim.x));
  float ws = smoothstep(.5, .8, abs(an.x)), wt = smoothstep(.55, .85, an.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, s.rgb, s.a * ws);
  diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a * wt);
  dcA = max(s.a * ws, t.a * wt);
}`);
  };
}
/* paint a car: a paint id (stock = its own colour from the showroom) and a decal id. Sets color0 so the online ghost and repairs keep it. */
function carPaint(c, paintId, decalId, stockColor){
  const p = WD_PAINT[paintId] || WD_PAINT.stock, f = WD_FIN[p.fin], col = p.color || stockColor || c.color0;
  c.paint.color.set(col); c.paint.roughness = f.r; c.paint.metalness = f.m; c.color0 = col;
  const d = WD_DECAL[decalId] || WD_DECAL.none;
  if (d.id !== 'none' && !c.paint.userData.dc){
    const U = {dcSide:{value:null}, dcTop:{value:null}, dcDim:{value:new THREE.Vector3(c.T.L, c.T.H, c.T.W)}, dcOn:{value:0}, dcRead:{value:0}};
    c.paint.userData.dc = U; c.paint.onBeforeCompile = wdDecalHook(U); c.paint.needsUpdate = true;
  }
  const U = c.paint.userData.dc;
  if (U){ U.dcOn.value = d.id === 'none' ? 0 : 1; U.dcRead.value = d.read ? 1 : 0; U.dcSide.value = wdDecalTex(d, 'side'); U.dcTop.value = wdDecalTex(d, 'top'); }
  c.paintId = p.id; c.decalId = d.id;
}
