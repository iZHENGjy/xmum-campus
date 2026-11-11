/* XMUM 校园漫游 · 校外：Bell Avenue 商业街、去 KIP 商场的山路、KIP 一带、麦当当和加油站、山上的树和路灯、街上的行人 */
'use strict';
/* Shop names are generic or puns, never real logos. Everything here uses its own random stream, never rnd().
   Draw calls: one textured mesh per area (all shops share one atlas), two road meshes per area, one instanced mesh per tree kind per ninth of the map. */
const outRng = mkRng(5307);

/* ---------- shop signs ---------- */
/* Bell Avenue shops in their real order along the block, from the OpenStreetMap shop list (x = game metres);
   names are puns or plain descriptions, never the real brands. Units without a known shop are "to let". */
const BELL_N = [[146, 'Nasi Kandar Al-Hajeera'], [154, '鲜果蔬菜'], [160, '西餐 Gourmet'], [174, '火锅 Steamboat'], [181, '便利店 Mart'], [190, '土豆粉'], [206, '汽车服务'], [220, '咖啡简餐'],
  [230, 'Eat 哈密'], [236, '文具店'], [242, '宠物医院 Vet'], [249, '24h 便利店'], [256, '理发 Salon'], [260, '越南咖啡'], [266, '31 冰淇淋'], [273, '日式小馆'],
  [286, '星爸爸咖啡'], [294, '快餐 AllAce'], [301, '蜜雪冰橙'], [311, 'K 记超市'], [322, '冰雪甜品'], [327, '麻辣烫'], [335, '诊所 Klinik'], [340, '租车 Rental'],
  [347, '369 快餐'], [354, '沙县小吃'], [360, '瓦煲饭 Claypot'], [365, '秘方蛋糕'], [378, '酸菜鱼'], [387, '面对面'], [395, '开心小火锅'], [406, '麻辣香锅']];
const BELL_S = [[146, 'Nasi Kandar Al-Hajeera'], [164, '123 便利店'], [172, '烧烤 BBQ'], [177, '家悦私房菜'], [182, '螺蛳粉'], [188, '咖啡 Coffee'], [192, '普拉提 Pilates'],
  [199, '巴厘食家'], [225, '马来餐 Lazat'], [235, '韩国料理'], [241, '木兰小馆'], [246, '熊猫奶茶'], [251, '印尼炸鸡'], [261, '韩语学校'], [286, '咖啡 Marqa'],
  [299, '活动场地'], [303, '新疆拉面'], [312, '瑜伽 Yoga'], [321, '中医馆'], [327, '瓦煲鸡'], [332, '自助洗衣 Dobi'], [338, '八卦咖啡'], [343, '桌球 Snooker'],
  [348, '乐器行'], [352, '聚饺'], [360, '寿司 Sushi'], [369, '新疆炒米粉'], [405, '娘惹糕 Kueh']];
const SIGN_STYLE = {'星爸爸咖啡':['#1f6b4b', '#ffffff', 1, 'cup'], '31 冰淇淋':['#f07aa6', '#ffffff', 0, 'cone'], '蜜雪冰橙':['#d7262d', '#ffffff', 0, 'snow'],
  '店铺出租 To Let':['#f4f1ea', '#c0392b', 2], '麦当当 24h':['#c8102e', '#ffc72c', 0], 'Bell 喷漆 Spray':['#1d1f24', '#ffcf3a', 2],
  '上校炸鸡':['#b5121b', '#ffffff', 3], 'DIY 五金百货':['#f6d23a', '#c8102e', 0], '酒店 Hotel':['#2a3f8f', '#ffffff', 2],
  'Nasi Kandar Al-Hajeera':['#141416', '#f2c230', 3]};   /* the 24-hour mamak at the west end, both rows; its open-air tables are js/89-mamak.js */
const SIGN_PAIRS = [['#1b5aa6', '#ffffff'], ['#2f6f3e', '#fff4d6'], ['#7a3b1d', '#ffe8b0'], ['#f08a1c', '#ffffff'], ['#2b9a8f', '#ffffff'], ['#3d3d3d', '#ffd84a'],
  ['#c0392b', '#ffffff'], ['#2a3f8f', '#ffffff'], ['#8a5a3c', '#fff1dc'], ['#b3261e', '#ffd84a'], ['#d98a1c', '#3a1d0a'], ['#ffffff', '#c0392b'], ['#3c6e9f', '#ffffff'],
  ['#e48aa8', '#ffffff'], ['#4e342e', '#ffd54f'], ['#00838f', '#ffffff'], ['#6a1b9a', '#ffffff'], ['#9e9d24', '#ffffff']];
const OUT_SIGNS = [], signIdx = new Map();
function signOf(name){
  if (signIdx.has(name)) return signIdx.get(name);
  if (OUT_SIGNS.length >= 64) return signOf('店铺出租 To Let');
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const st = SIGN_STYLE[name], pr = SIGN_PAIRS[h % SIGN_PAIRS.length];
  const shop = /咖啡|奶茶|甜品|冰淇淋|蛋糕|Kueh|冰雪/.test(name) ? 1 : /饭|面|粉|锅|餐|烧|鸡|鱼|饺|烫|Kandar|料理|小吃|食|快餐|寿司|小馆|哈密|菜/.test(name) ? 3 : /洗衣|租|学校|Pilates|瑜伽|Snooker|场地|乐器|汽车|出租/.test(name) ? 2 : 0;
  OUT_SIGNS.push(st ? [name, st[0], st[1], st[2], st[3]] : [name, pr[0], pr[1], shop]); signIdx.set(name, OUT_SIGNS.length - 1); return OUT_SIGNS.length - 1;
}
['店铺出租 To Let', '超市 Hypermarket', '亲子乐园 Kids Park', '美食广场 Food Court', '麦当当 24h', 'Bell 喷漆 Spray'].forEach(signOf);
/* Bell Avenue: one ~270 m block of back-to-back three-storey shophouses (north row faces Jalan Sunsuria, south row the back lane),
   split by two walk-through lanes; frontage lane, angled parking and a covered five-foot way on both sides */
const BELL = {zF:307, zB:363, zMid:335.1, park:5.5, arc:2.6, unit:7.5, n:11, blocks:[142, 234.5, 327]};
const BELL_UNITS = []; BELL.blocks.forEach(b0 => { for (let u = 0; u < BELL.n; u++) BELL_UNITS.push(b0 + (u + .5) * BELL.unit); });
const SIGN_TOLET = 0, SIGN_KIP0 = 1, SIGN_MCD = 4, SIGN_SPRAY = 5;   /* KIP: 1 超市, 2 亲子乐园, 3 美食广场 */
/* hand each shop to the nearest free unit of its row (units are filled in by the Bell Avenue builder below) */
function bellNames(units, pois){
  const out = units.map(() => null);
  for (const [px, name] of pois){ let bi = -1, bd = 12; units.forEach((ux, i) => { const d = Math.abs(ux - px); if (!out[i] && d < bd){ bd = d; bi = i; } }); if (bi >= 0) out[bi] = name; }
  return out.map(n => n || '店铺出租 To Let');
}
const BELL_SIGN = {n:bellNames(BELL_UNITS, BELL_N).map(signOf), s:bellNames(BELL_UNITS, BELL_S).map(signOf)};
/* KIP signs (the fried-chicken pad, the DIY store at the mall's north-west corner, the small hotels upstairs in KIP Sentral); registered
   after Bell Avenue so they only take the free atlas slots and never push a Bell shop out to 店铺出租 */
const KIP_TEN = ['上校炸鸡', 'DIY 五金百货', '酒店 Hotel'].map(signOf);

/* ---------- one texture atlas (plus a half-size glow map for night) for every facade, shopfront and sign outside the gate ---------- */
/* ATL is the layout size; the canvas is drawn at twice that (sharper shop signs) unless the quality tier keeps textures small (phones on 标准, 流畅) */
const ATL = 1024, ATK = XQ.cfg.tex >= 512 ? 2 : 1, atlCv = document.createElement('canvas'), emCv = document.createElement('canvas');
atlCv.width = atlCv.height = ATL * ATK; emCv.width = emCv.height = ATL / 2 * ATK;
const atlTex = new THREE.CanvasTexture(atlCv), emTex = new THREE.CanvasTexture(emCv); atlTex.anisotropy = ANISO;
const AR = (x, y, w, h) => ({x, y, w, h, u0:(x + 2) / ATL, u1:(x + w - 2) / ATL, v0:1 - (y + h - 2) / ATL, v1:1 - (y + 2) / ATL});
const A_SOLID = AR(0, 0, 32, 32), A_BURGER = AR(64, 0, 128, 128), A_KIP = AR(256, 0, 512, 128), A_GLASS = AR(768, 0, 256, 128);
const A_CHICK = AR(192, 0, 64, 64), A_GRID = AR(192, 64, 64, 64);   /* KIP: fried-chicken badge, white mullion grid of the entrance blocks */
const A_WIN = [0, 1, 2].map(i => AR(i * 256, 128, 256, 120)), A_MALL = AR(768, 128, 256, 120);
const A_SHOP = [0, 1, 2, 3].map(i => AR(i * 256, 248, 256, 128));
const A_SIGN = i => AR((i % 4) * 256, 376 + Math.floor(i / 4) * 40, 256, 40);
const OUT_FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
function paintAtlas(){
  const g = atlCv.getContext('2d'), e = emCv.getContext('2d'), R = mkRng(77);
  g.setTransform(ATK, 0, 0, ATK, 0, 0); e.setTransform(.5 * ATK, 0, 0, .5 * ATK, 0, 0);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATL, ATL); e.fillStyle = '#000000'; e.fillRect(0, 0, ATL, ATL);
  const both = f => { f(g, false); f(e, true); };
  const glass = (x, y, w, h) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#7593a3'); gr.addColorStop(1, '#2d4452'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(x + w * .55, y); g.lineTo(x + w * .8, y); g.lineTo(x + w * .3, y + h); g.lineTo(x + w * .05, y + h); g.fill(); };
  const lit = (x, y, w, h, p) => { if (R() < p){ e.fillStyle = R() < .8 ? '#ffcf86' : '#dfefff'; e.fillRect(x, y, w, h); } };
  /* upper-floor window bays (white plaster, tinted per shop by vertex colour) */
  A_WIN.forEach((a, k) => {
    const {x, y} = a; g.fillStyle = '#f7f4ee'; g.fillRect(x, y, 256, 120); g.fillStyle = '#ddd5c6'; g.fillRect(x, y + 106, 256, 14); g.fillStyle = '#cfc6b4'; g.fillRect(x, y + 106, 256, 2);
    const win = (wx, wy, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(x + wx - 4, y + wy - 4, w + 8, h + 8); glass(x + wx, y + wy, w, h); g.fillStyle = '#f2efe8'; g.fillRect(x + wx + w / 2 - 1.5, y + wy, 3, h); lit(x + wx, y + wy, w, h, .55); };
    if (k === 0) for (const wx of [34, 152]){ win(wx, 16, 70, 82); g.fillStyle = '#8fae9a'; g.fillRect(x + wx - 18, y + 14, 12, 86); g.fillRect(x + wx + 76, y + 14, 12, 86); }
    else if (k === 1) for (const wx of [20, 98, 176]){ win(wx, 22, 60, 64); g.fillStyle = '#d9cfbd'; g.fillRect(x + wx - 6, y + 90, 72, 6); }
    else { win(18, 26, 220, 54); g.fillStyle = '#d6d6d2'; g.fillRect(x + 196, y + 86, 34, 18); g.fillStyle = '#9a9a96'; for (let i = 0; i < 4; i++) g.fillRect(x + 199, y + 89 + i * 4, 28, 1.5); }
  });
  /* shopfronts: retail glass, café, half-up roller shutter, open-fronted eatery */
  A_SHOP.forEach((a, k) => {
    const {x, y} = a; g.save(); e.save(); for (const c of [g, e]){ c.translate(x, y); c.scale(1, 128 / 152); c.translate(-x, -y); } g.fillStyle = '#34363a'; g.fillRect(x, y, 256, 152);
    if (k === 2){
      g.fillStyle = '#b9bcbf'; g.fillRect(x + 8, y + 8, 240, 70); g.fillStyle = '#9ea2a6'; for (let i = 0; i < 14; i++) g.fillRect(x + 8, y + 10 + i * 5, 240, 1.6);
      g.fillStyle = '#e9e1cc'; g.fillRect(x + 8, y + 78, 240, 74); g.fillStyle = '#8a6a4a'; for (let i = 0; i < 5; i++) g.fillRect(x + 20 + i * 46, y + 96, 30, 56);
      g.restore(); e.restore(); return;
    }
    const inside = k === 1 ? '#8a5a35' : k === 3 ? '#3a302a' : '#efe4c9';
    g.fillStyle = inside; g.fillRect(x + 8, y + 8, 240, 144);
    if (k === 0){ for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++){ g.fillStyle = ['#d9534f', '#5b9bd5', '#f0ad4e', '#5cb85c', '#ffffff'][(i + r * 2) % 5]; g.fillRect(x + 14 + i * 26, y + 40 + r * 30, 20, 18); } }
    if (k === 1){ g.fillStyle = '#f5d7a1'; for (let i = 0; i < 4; i++){ g.beginPath(); g.arc(x + 40 + i * 60, y + 30, 8, 0, 7); g.fill(); } g.fillStyle = '#4a2f1d'; for (let i = 0; i < 4; i++){ g.fillRect(x + 22 + i * 60, y + 104, 36, 6); g.fillRect(x + 37 + i * 60, y + 110, 6, 40); } }
    if (k === 3){ g.fillStyle = '#f2c94c'; g.fillRect(x + 30, y + 14, 196, 26); g.fillStyle = '#3a302a'; for (let i = 0; i < 6; i++) g.fillRect(x + 40 + i * 30, y + 22, 18, 3); g.fillStyle = '#d8d2c8'; for (let i = 0; i < 4; i++){ g.fillRect(x + 20 + i * 58, y + 104, 42, 8); g.fillRect(x + 38 + i * 58, y + 112, 6, 38); } }
    if (k !== 3){ g.fillStyle = 'rgba(150,185,200,.32)'; g.fillRect(x + 8, y + 8, 240, 144); g.fillStyle = '#2a2c2f'; for (const mx of [86, 170]) g.fillRect(x + mx, y + 8, 4, 144); g.fillRect(x + 8, y + 100, 240, 3); g.fillStyle = '#1f2326'; g.fillRect(x + 108, y + 52, 40, 100); }
    g.restore(); e.restore();
  });
  /* lit at night: a dimmed, warm copy of the shopfront itself (it used to glow as one flat white panel); a shutter's closed half stays dark */
  A_SHOP.forEach((a, k) => {
    const {x, y} = a, y0 = k === 2 ? 66 : 0;
    e.save(); e.globalAlpha = k === 3 ? .72 : .6; e.drawImage(atlCv, x * ATK, (y + y0) * ATK, 256 * ATK, (128 - y0) * ATK, x, y + y0, 256, 128 - y0);
    e.globalAlpha = 1; e.globalCompositeOperation = 'multiply'; e.fillStyle = '#ffe2b8'; e.fillRect(x, y, 256, 128); e.restore();
  });
  /* glass curtain wall and mall cladding */
  { const {x, y} = A_GLASS; const gr = g.createLinearGradient(0, y, 0, y + 128); gr.addColorStop(0, '#8fb6c9'); gr.addColorStop(1, '#3f6a80'); g.fillStyle = gr; g.fillRect(x, y, 256, 128);
    g.fillStyle = '#dfe6ea'; for (let i = 0; i <= 8; i++) g.fillRect(x + i * 32 - 2, y, 4, 128); g.fillRect(x, y + 62, 256, 4); g.fillRect(x, y, 256, 3); e.fillStyle = '#7a6440'; e.fillRect(x, y + 66, 256, 62); }
  /* KIP mall cladding (one tile = 10 m wide, the 7.4 m of wall above the shop band): pale grey composite panels with a darker grey
     band at the upper floor line, as in photos of KIPMall Kota Warisan (it used to be beige with a strip window) */
  { const {x, y} = A_MALL; g.fillStyle = '#eef0ef'; g.fillRect(x, y, 256, 120); g.fillStyle = '#e3e6e6'; g.fillRect(x, y + 60, 256, 60);
    g.fillStyle = '#d0d4d5'; for (let i = 0; i < 8; i++) g.fillRect(x + i * 32, y, 1.5, 120); for (const r of [20, 40, 78, 98]) g.fillRect(x, y + r, 256, 1.5);
    g.fillStyle = '#8f979c'; g.fillRect(x, y + 52, 256, 12); g.fillStyle = '#7d858a'; g.fillRect(x, y + 62, 256, 2); g.fillStyle = '#b9bfc2'; g.fillRect(x, y + 116, 256, 4); }
  /* glazed entrance blocks: a white mullion grid over blue-grey glass (lit inside at night) */
  { const {x, y} = A_GRID; const gr = g.createLinearGradient(0, y, 0, y + 64); gr.addColorStop(0, '#9fb9c6'); gr.addColorStop(1, '#4f6e7e'); g.fillStyle = gr; g.fillRect(x, y, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 6, y, 10, 64); g.fillStyle = '#f4f5f3'; for (let i = 0; i <= 4; i++){ g.fillRect(x + i * 16 - 2, y, 4, 64); g.fillRect(x, y + i * 16 - 2, 64, 4); }
    e.fillStyle = '#6d5a3c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i * 3 + j) % 4) e.fillRect(x + i * 16 + 2, y + j * 16 + 2, 12, 12); }
  /* KIP mall name: pinkish-red KIPMALL letters on the pale grey cladding, the way the real channel letters sit on the entrance blocks */
  both((c, em) => { const {x, y} = A_KIP; c.fillStyle = em ? '#1a1a1a' : '#eceeed'; c.fillRect(x, y, 512, 128);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = em ? '#ff7a96' : '#e0335a'; let s = 104; c.font = `900 ${s}px ${OUT_FONT}`;
    while (c.measureText('KIPMALL').width > 480 && s > 40){ s -= 4; c.font = `900 ${s}px ${OUT_FONT}`; }
    c.fillText('KIPMALL', x + 256, y + 68); });
  /* fried-chicken badge (a drumstick on red) for the pad in the north-west corner */
  both((c, em) => { const {x, y} = A_CHICK; c.fillStyle = em ? '#7a0d12' : '#b5121b'; c.fillRect(x, y, 64, 64); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 32, y + 32, 27, 0, 7); c.fill();
    c.fillStyle = '#c8742a'; c.beginPath(); c.ellipse(x + 27, y + 28, 14, 11, -.7, 0, 7); c.fill(); c.fillStyle = '#f3e3c6'; c.fillRect(x + 34, y + 34, 12, 5); c.beginPath(); c.arc(x + 47, y + 34, 3.2, 0, 7); c.arc(x + 47, y + 40, 3.2, 0, 7); c.fill(); });
  both((c, em) => { const {x, y} = A_BURGER; c.fillStyle = '#c8102e'; c.fillRect(x, y, 128, 128); c.fillStyle = '#ffc72c'; c.beginPath(); c.arc(x + 64, y + 64, 54, 0, 7); c.fill();
    c.fillStyle = '#e8963a'; c.beginPath(); c.ellipse(x + 64, y + 52, 36, 22, 0, Math.PI, 0); c.fill(); c.fillStyle = '#6cbf3c'; c.fillRect(x + 28, y + 52, 72, 7); c.fillStyle = '#5a3420'; c.fillRect(x + 28, y + 60, 72, 12);
    c.fillStyle = '#e8963a'; c.fillRect(x + 30, y + 74, 68, 12); c.fillStyle = '#fff4d0'; for (let i = 0; i < 5; i++){ c.beginPath(); c.arc(x + 46 + i * 9, y + 40 + (i % 2) * 4, 2, 0, 7); c.fill(); } });
  /* shop signs */
  OUT_SIGNS.forEach(([name, bg, fg, , icon], i) => both((c, em) => {
    /* the glow map dims the board and keeps the letters bright, so a sign still reads at night (white boards used to wash out completely) */
    const {x, y} = A_SIGN(i); c.save(); c.translate(x, y); c.scale(1, 40 / 48); c.translate(-x, -y); c.fillStyle = em ? '#' + new THREE.Color(bg).multiplyScalar(.4).getHexString() : bg; c.fillRect(x, y, 256, 48); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x, y + 43, 256, 5);
    let tx = x + 128, maxW = 236;
    if (icon){ c.fillStyle = fg; c.beginPath(); c.arc(x + 26, y + 24, 16, 0, 7); c.fill(); c.fillStyle = bg;
      if (icon === 'cup'){ c.fillRect(x + 19, y + 16, 14, 16); c.fillRect(x + 33, y + 19, 4, 8); }
      else if (icon === 'cone'){ c.beginPath(); c.moveTo(x + 18, y + 22); c.lineTo(x + 34, y + 22); c.lineTo(x + 26, y + 38); c.fill(); c.beginPath(); c.arc(x + 26, y + 19, 7, 0, 7); c.fill(); }
      else { c.beginPath(); c.arc(x + 26, y + 29, 7, 0, 7); c.arc(x + 26, y + 17, 5, 0, 7); c.fill(); }
      tx = x + 144; maxW = 200; }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; let s = 30; c.font = `700 ${s}px ${OUT_FONT}`;
    while (c.measureText(name).width > maxW && s > 12){ s -= 2; c.font = `700 ${s}px ${OUT_FONT}`; }
    c.fillText(name, tx, y + 23); c.restore();
  }));
  atlTex.needsUpdate = true; emTex.needsUpdate = true;
}
paintAtlas(); document.fonts && document.fonts.ready.then(paintAtlas);
const townMat = regWet(new THREE.MeshStandardMaterial({color:'#ffffff', vertexColors:true, map:atlTex, emissive:'#ffffff', emissiveMap:emTex, emissiveIntensity:0, roughness:.8}), .45);
const outGroundMat = regWet(M('#d4d4d4', {vertexColors:true, roughness:.85, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-20, side:THREE.DoubleSide}), .3);
const outMarkMat = M('#ffffff', {vertexColors:true, roughness:.7, polygonOffset:true, polygonOffsetFactor:-9, polygonOffsetUnits:-36, side:THREE.DoubleSide});

/* ---------- tiny geometry builder: quads with position, normal, atlas uv and vertex colour, merged into one mesh per area ---------- */
const _oc = new THREE.Color(), SOLID_UV = [(A_SOLID.u0 + A_SOLID.u1) / 2, (A_SOLID.v0 + A_SOLID.v1) / 2];
const TB = () => ({p:[], n:[], uv:[], c:[]});
function tQuad(b, o, U, V, r, col){
  let nx = U[1] * V[2] - U[2] * V[1], ny = U[2] * V[0] - U[0] * V[2], nz = U[0] * V[1] - U[1] * V[0]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const P = [o, [o[0] + U[0], o[1] + U[1], o[2] + U[2]], [o[0] + U[0] + V[0], o[1] + U[1] + V[1], o[2] + U[2] + V[2]], [o[0] + V[0], o[1] + V[1], o[2] + V[2]]];
  const T = r ? [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]] : null;
  _oc.set(col || '#ffffff');
  for (const q of [0, 1, 2, 0, 2, 3]){ b.p.push(P[q][0], P[q][1], P[q][2]); b.n.push(nx, ny, nz); b.uv.push(...(T ? T[q] : SOLID_UV)); b.c.push(_oc.r, _oc.g, _oc.b); }
}
/* vertical face on the plane x = const (dir +1 faces +x) or z = const, spanning a0..a1 along the other axis */
const fX = (b, x, z0, z1, y0, y1, dir, r, col) => dir > 0 ? tQuad(b, [x, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], r, col) : tQuad(b, [x, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], r, col);
const fZ = (b, z, x0, x1, y0, y1, dir, r, col) => dir > 0 ? tQuad(b, [x0, y0, z], [x1 - x0, 0, 0], [0, y1 - y0, 0], r, col) : tQuad(b, [x1, y0, z], [x0 - x1, 0, 0], [0, y1 - y0, 0], r, col);
const fY = (b, y, x0, z0, x1, z1, col) => tQuad(b, [x0, y, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], null, col);
function tBox(b, x0, y0, z0, x1, y1, z1, col, skip){
  skip = skip || 'ny';
  if (!skip.includes('px')) fX(b, x1, z0, z1, y0, y1, 1, null, col);
  if (!skip.includes('nx')) fX(b, x0, z0, z1, y0, y1, -1, null, col);
  if (!skip.includes('pz')) fZ(b, z1, x0, x1, y0, y1, 1, null, col);
  if (!skip.includes('nz')) fZ(b, z0, x0, x1, y0, y1, -1, null, col);
  if (!skip.includes('py')) fY(b, y1, x0, z0, x1, z1, col);
}
/* tile a vertical face with one atlas region */
function tileX(b, x, z0, z1, y0, y1, dir, r, tw, th, col){ const nz = Math.max(1, Math.round((z1 - z0) / tw)), ny = Math.max(1, Math.round((y1 - y0) / th)); for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) fX(b, x, z0 + (z1 - z0) * i / nz, z0 + (z1 - z0) * (i + 1) / nz, y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny, dir, r, col); }
function tileZ(b, z, x0, x1, y0, y1, dir, r, tw, th, col){ const nx = Math.max(1, Math.round((x1 - x0) / tw)), ny = Math.max(1, Math.round((y1 - y0) / th)); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) fZ(b, z, x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx, y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny, dir, r, col); }
/* flat ground pieces (always facing up): rectangles and thin stripes */
function gRect(b, x0, z0, x1, z1, y, col){ fY(b, y, x0, z0, x1, z1, col); }
function gLine(b, ax, az, bx, bz, w, y, col){ const ux = bx - ax, uz = bz - az, L = Math.hypot(ux, uz) || 1, vx = uz / L * w, vz = -ux / L * w; tQuad(b, [ax - vx / 2, y, az - vz / 2], [ux, 0, uz], [vx, 0, vz], null, col); }
function gQuad4(b, A, B, C, D, col){
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (ny < 0){ [B, D] = [D, B]; nx = -nx; ny = -ny; nz = -nz; }
  const l = Math.hypot(nx, ny, nz) || 1; _oc.set(col);
  for (const P of [A, B, C, A, C, D]){ b.p.push(P[0], P[1], P[2]); b.n.push(nx / l, ny / l, nz / l); b.uv.push(SOLID_UV[0], SOLID_UV[1]); b.c.push(_oc.r, _oc.g, _oc.b); }
}
function tMesh(b, mat, info, shadow){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  const m = new THREE.Mesh(g, mat); m.castShadow = !!shadow; m.receiveShadow = true; scene.add(m);
  if (info){ m.userData.info = info; pickables.push(m); }
  return m;
}

/* ---------- roads: terrain-following ribbons (asphalt, kerbs) and markings ---------- */
/* (was also called roadAt, which js/15-props.js declares again for the campus roads and so replaced this one for everybody after load) */
function outRoadAt(r, s){
  s = Math.max(0, Math.min(r.L, s)); let lo = 0, hi = r.s.length - 1;
  while (hi - lo > 1){ const m = (lo + hi) >> 1; if (r.s[m] <= s) lo = m; else hi = m; }
  const t = (s - r.s[lo]) / ((r.s[hi] - r.s[lo]) || 1), a = r.p[lo], b = r.p[hi], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
const ROAD = Object.fromEntries(OUT_ROADS.map(r => [r.id, r]));
/* a strip o0..o1 to the left of the centre line (negative = right), y on the hill + dy, optionally skipping samples */
function ribbon(b, r, o0, o1, dy, col, keep){
  const n = r.p.length, side = [];
  for (let i = 0; i < n; i++){
    const a = r.p[Math.max(0, i - 1)], c = r.p[Math.min(n - 1, i + 1)], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = -(c[1] - a[1]) / L, nz = (c[0] - a[0]) / L, [x, z] = r.p[i];
    const P0 = [x + nx * o0, 0, z + nz * o0], P1 = [x + nx * o1, 0, z + nz * o1]; P0[1] = terrainY(P0[0], P0[2]) + dy; P1[1] = terrainY(P1[0], P1[2]) + dy; side.push([P0, P1]);
  }
  for (let i = 0; i < n - 1; i++){ if (keep && !keep(r.p[i], r.p[i + 1])) continue; gQuad4(b, side[i][0], side[i + 1][0], side[i + 1][1], side[i][1], col); }
}
function dashes(b, r, off, w, len, gap, dy, col, keep){
  for (let s = 3; s + len < r.L; s += len + gap){
    const [ax, az, tx, tz] = outRoadAt(r, s), [bx, bz, ux, uz] = outRoadAt(r, s + len);
    if (keep && !keep([ax, az], [bx, bz])) continue;
    const na = [-tz, tx], nb = [-uz, ux], P = (x, z, n, o) => { const px = x + n[0] * o, pz = z + n[1] * o; return [px, terrainY(px, pz) + dy, pz]; };
    gQuad4(b, P(ax, az, na, off - w / 2), P(bx, bz, nb, off - w / 2), P(bx, bz, nb, off + w / 2), P(ax, az, na, off + w / 2), col);
  }
}
const ASPH = '#74716b', ASPH2 = '#66635e', KERB = '#bdb4a4', PAVE = '#b9ad98', LINE = '#f1ede4', YEL = '#f2c230';
const KIP_X0 = ROAD.kip.p[0][0];
/* kerbs and markings stop where another road crosses or joins */
const clearOf = (self, pad) => (a, b) => { const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  return !OUT_ROADS.some(o => o !== self && o.p.some((p, q) => q < o.p.length - 1 && segDist(mx, mz, p, o.p[q + 1]) < o.w / 2 + pad)); };
/* the driveway off the hill road into the KIP car park: no kerb and no edge line across it (the kerb used to run straight across the
   mouth of the car park; 麦当当 had two more here before it moved to the south end of KIP Sentral) */
const DRIVES = [[-548, 893, -521, 915]];
const sideKeep = (base, off) => (a, b) => { if (!base(a, b)) return false;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, x = (a[0] + b[0]) / 2 - (b[1] - a[1]) / L * off, z = (a[1] + b[1]) / 2 + (b[0] - a[0]) / L * off;
  return !DRIVES.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1); };
const surfNear = TB(), markNear = TB(), surfFar = TB(), markFar = TB();
for (const r of OUT_ROADS){
  const hw = r.w / 2, near = r !== ROAD.kip, S = near ? surfNear : surfFar, K = near ? markNear : markFar;
  ribbon(S, r, -hw, hw, .05, ASPH);
  if (r.kind === 'lane') continue;
  const kk = clearOf(r, 1.4), mk = clearOf(r, .4);
  ribbon(S, r, hw, hw + 1.3, .09, KERB, sideKeep(kk, hw + .65)); ribbon(S, r, -hw - 1.3, -hw, .09, KERB, sideKeep(kk, -hw - .65));
  if (r.kind !== 'main') continue;
  dashes(K, r, 0, .22, 3, 6, .075, LINE, mk);
  ribbon(K, r, hw - .55, hw - .4, .075, YEL, sideKeep(mk, hw)); ribbon(K, r, -hw + .4, -hw + .55, .075, YEL, sideKeep(mk, -hw));
}
/* zebra crossings: over Jalan Sunsuria in front of the gate, and over the frontage lane */
/* stripes run with the traffic (east-west), stacked across each carriageway, in a band 4 m wide where you walk across */
for (const zc of [270, 289]) for (let k = -3; k <= 3; k++) gRect(markNear, GX + 7, zc + k * 1.1 - .32, GX + 11, zc + k * 1.1 + .32, .075, LINE);
for (const xc of [GX + 9, 264, 299]) for (let k = -2; k <= 2; k++) gRect(markNear, xc - 2, 307 + k * 1.1 - .32, xc + 2, 307 + k * 1.1 + .32, .075, LINE);

/* ---------- Bell Avenue block, Bell Suites tower, Taman Warisan Megah terraces behind ---------- */
const bellInfo = {name:'Bell Avenue 商业街', tag:'商业', spawn:[276, 303, Math.PI],
  desc:'正门对面、隔着 Jalan Sunsuria 的一整排三层店屋，北排朝大路，南排朝后巷，中间有两条穿行小巷，东头是 Bell Suites 公寓。星爸爸咖啡、31 冰淇淋、蜜雪冰橙、螺蛳粉、麻辣烫都在这排（店名都是谐音或通用名，顺序照真实地图）。'};
const resInfo = {name:'Taman Warisan Megah 住宅区', tag:'住宅', spawn:[110, 405.5, Math.PI / 2],
  desc:'Bell Avenue 后面的双层排屋和几栋矮公寓，很多同学在这里租房住。正对校门那一排每户门口都有车棚，挂着「出售」牌子的可以买下来装修（js/89-house.js）。'};
/* the terrace row straight south of the gate: twelve 6 m houses, each with a TWM.porch deep carport in front (js/89-house.js sells some of them) */
const TWM = {x0:74, z0:411, x1:146, z1:430, porch:5.5, unit:6};
const BELL_TINTS = ['#f2dfc0', '#e8cdb8', '#d5e3d8', '#efd5d3', '#dcdcec', '#f3e7c4', '#d9e6ee', '#ece2d6', '#e7d9ef', '#f0e0b8'];
const bellB = TB(), resB = TB(), OUT_DESTS = [];
const tTri = (b, A, B, C, col) => {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; _oc.set(col);
  for (const P of [A, B, C]){ b.p.push(P[0], P[1], P[2]); b.n.push(nx / l, ny / l, nz / l); b.uv.push(SOLID_UV[0], SOLID_UV[1]); b.c.push(_oc.r, _oc.g, _oc.b); }
};
(function(){
  /* the shophouse block: row s = -1 (north, faces Jalan Sunsuria) and s = +1 (south, faces the back lane) */
  const bdr = mkRng(5321), ROOFS = ['#7a7771', '#7e7a74', '#767370', '#7c7873'];   /* roof dressing has its own stream, so outRng (unit heights, trims) is unchanged */
  for (const s of [-1, 1]){
    const dir = s, zo = s < 0 ? BELL.zF + 3 + BELL.park : BELL.zB - 3 - BELL.park, zf = zo - s * BELL.arc, zb = BELL.zMid, names = s < 0 ? BELL_SIGN.n : BELL_SIGN.s;
    let ui = 0;
    for (const bx0 of BELL.blocks){
      const bx1 = bx0 + BELL.n * BELL.unit;
      let lastTop = 11;
      for (let u = 0; u < BELL.n; u++, ui++){
        const x0 = bx0 + u * BELL.unit, x1 = x0 + BELL.unit, si = names[ui], up = outRng() < .8 ? 2 : 1, top = 5.6 + up * 3.3;
        const tint = BELL_TINTS[(ui * 7 + (s > 0 ? 5 : 2)) % BELL_TINTS.length], win = A_WIN[(ui * 5 + up + (s > 0 ? 1 : 0)) % 3];
        tBox(bellB, x0, 0, Math.min(zb, zf), x1, top, Math.max(zb, zf), tint, 'nz pz py ny');
        /* back wall on the shared middle line: where the unit behind is lower, you used to look straight into this one (and out through its shopfront) */
        fZ(bellB, zb, x0, x1, 0, top, -dir, null, '#cfc6b6');
        /* side walls at the ends of each block (the walk-through lanes and both ends of the street): upper-floor windows instead of a blank wall */
        if (u === 0) tileX(bellB, x0 - .02, Math.min(zb, zo), Math.max(zb, zo), 5.6, top, -1, A_WIN[1], 6.5, 3.3, tint);
        if (u === BELL.n - 1){ tileX(bellB, x1 + .02, Math.min(zb, zo), Math.max(zb, zo), 5.6, top, 1, A_WIN[1], 6.5, 3.3, tint); lastTop = top + 1; }
        /* on the roof: a water tank on a stand, air-conditioner condensers by the front parapet, now and then a stair hut */
        { const mz = (zb + zo) / 2, R = bdr;
          if (R() < .7){ const tx = x0 + 1.6 + R() * (BELL.unit - 3.2), tz = zb + s * (2.2 + R() * 2); tBox(bellB, tx - .75, top, tz - .75, tx + .75, top + .5, tz + .75, '#5d6166'); tBox(bellB, tx - .85, top + .5, tz - .85, tx + .85, top + 1.9, tz + .85, R() < .5 ? '#d9d6cf' : '#7590a3'); }
          for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++){ const ax = x0 + 1 + R() * (BELL.unit - 2), az = zo - s * (1.3 + R() * 1.5); tBox(bellB, ax - .45, top, az - .3, ax + .45, top + .65, az + .3, '#c9cbcc'); }
          if (R() < .25){ const hx = x0 + 1.5 + R() * (BELL.unit - 5); tBox(bellB, hx, top, mz - 1.3, hx + 2.2, top + 2.5, mz + 1.3, tint); tBox(bellB, hx - .15, top + 2.5, mz - 1.45, hx + 2.35, top + 2.7, mz + 1.45, '#8d8983'); } }
        tBox(bellB, x0, 4.2, Math.min(zf, zo), x1, top, Math.max(zf, zo), tint, 'nz pz py');
        fZ(bellB, zf + dir * .01, x0, x1, 0, 4.2, dir, A_SHOP[OUT_SIGNS[si][3]], '#ffffff');
        fZ(bellB, zo, x0, x1, 4.2, 5.6, dir, null, '#d8d0c2');
        fZ(bellB, zo + dir * .1, x0 + .35, x1 - .35, 4.35, 5.45, dir, A_SIGN(si), '#ffffff');
        for (let f = 0; f < up; f++) fZ(bellB, zo, x0, x1, 5.6 + f * 3.3, 5.6 + (f + 1) * 3.3, dir, win, tint);
        tBox(bellB, x0, top, Math.min(zo, zo - s * .35), x1, top + 1, Math.max(zo, zo - s * .35), tint);
        if (outRng() < .35) tBox(bellB, (x0 + x1) / 2 - 1.7, top + 1, Math.min(zo, zo - s * .35), (x0 + x1) / 2 + 1.7, top + 1.8, Math.max(zo, zo - s * .35), TRIM);
        fY(bellB, top, x0, Math.min(zb, zo), x1, Math.max(zb, zo), ROOFS[ui % ROOFS.length]);
        tBox(bellB, x0 - .2, 4.2, Math.min(zo, zo + dir * .18), x0 + .2, top + 1, Math.max(zo, zo + dir * .18), TRIM);
        tBox(bellB, x0 - .26, 0, zo - s * .35 - .26, x0 + .26, 4.2, zo - s * .35 + .26, '#efe8da');
        if (OUT_SIGNS[si][0] === '蜜雪冰橙') OUT_DESTS.push({name:'蜜雪冰橙（Bell Avenue）', x:(x0 + x1) / 2, z:BELL.zF});
      }
      tBox(bellB, bx1 - .2, 4.2, Math.min(zo, zo + dir * .18), bx1 + .2, lastTop, Math.max(zo, zo + dir * .18), TRIM);   /* as tall as the last unit's parapet (was a fixed 11 m) */
      tBox(bellB, bx1 - .26, 0, zo - s * .35 - .26, bx1 + .26, 4.2, zo - s * .35 + .26, '#efe8da');
      gRect(surfNear, bx0, Math.min(zo, zf), bx1, Math.max(zo, zf), .06, PAVE);
    }
    /* angled parking between the lane and the five-foot way, with a white edge line */
    const pa = s < 0 ? BELL.zF + 3 : BELL.zB - 3, pb = zo, X0 = BELL.blocks[0] - 4, X1 = BELL.blocks[2] + BELL.n * BELL.unit + 4;
    gRect(surfNear, X0, Math.min(pa, pb), X1, Math.max(pa, pb), .055, ASPH2);
    gLine(markNear, X0, pb + s * .15, X1, pb + s * .15, .2, .075, LINE);
    for (let x = X0 + 1; x < X1 - 4; x += 2.8) if (!BELL.blocks.some((b0, k) => k && x + 3.2 > b0 - 10 && x < b0)) gLine(markNear, x, pa, x + 3.18, pb, .12, .075, LINE);
  }
  for (const bx0 of BELL.blocks){
    const bx1 = bx0 + BELL.n * BELL.unit, cx = (bx0 + bx1) / 2, z0 = BELL.zF + 3 + BELL.park, z1 = BELL.zB - 3 - BELL.park;
    addBox(cx, (z0 + z1) / 2, (bx1 - bx0) / 2 + .4, (z1 - z0) / 2 + .4, 0); addFp({t:0, x:cx, z:(z0 + z1) / 2, w:bx1 - bx0, d:z1 - z0, rot:0, color:'#b9805a'});
  }
  /* walk-through lanes between the blocks */
  for (let k = 1; k < BELL.blocks.length; k++) gRect(surfNear, BELL.blocks[k] - 10, BELL.zF + 3 + BELL.park, BELL.blocks[k], BELL.zB - 3 - BELL.park, .06, PAVE);
  /* a parking strip along the south side of the back lane: a car park by day, the ground the night-market stalls (js/89-outskirts-play.js, z 369.7–371.1) stand on at night */
  gRect(surfNear, 140, 366, 400, 374.5, .055, ASPH2); gLine(markNear, 140, 374.35, 400, 374.35, .2, .075, LINE);
  for (let x = 141.4; x < 399; x += 2.6) gLine(markNear, x, 369.5, x, 374.2, .12, .075, LINE);
  /* Bell Suites: 17-storey apartment tower in two offset slabs on a two-storey podium, at the east end of the block */
  for (const [x0, z0, x1, z1] of [[428, 328, 476, 351], [467, 337, 518, 360]]){
    tileZ(bellB, z0, x0, x1, 0, 4.2, -1, A_SHOP[0], 7.5, 4.2, '#ffffff'); tileZ(bellB, z1, x0, x1, 0, 4.2, 1, A_SHOP[1], 7.5, 4.2, '#ffffff');
    tileX(bellB, x0, z0, z1, 0, 4.2, -1, A_SHOP[0], 7.5, 4.2, '#ffffff'); tileX(bellB, x1, z0, z1, 0, 4.2, 1, A_SHOP[2], 7.5, 4.2, '#ffffff');
    tBox(bellB, x0, 4.2, z0, x1, 8.4, z1, '#d8d0c2'); tBox(bellB, x0 - .4, 8.4, z0 - .4, x1 + .4, 9, z1 + .4, '#efe9df');
    const tx0 = x0 + 2, tx1 = x1 - 2, tz0 = z0 + 2, tz1 = z1 - 2, H = 9 + 16 * 3.3;
    tileZ(bellB, tz0, tx0, tx1, 9, H, -1, A_WIN[2], 7, 3.3, '#e9e6df'); tileZ(bellB, tz1, tx0, tx1, 9, H, 1, A_WIN[2], 7, 3.3, '#e9e6df');
    tileX(bellB, tx0, tz0, tz1, 9, H, -1, A_WIN[1], 7, 3.3, '#e9e6df'); tileX(bellB, tx1, tz0, tz1, 9, H, 1, A_WIN[1], 7, 3.3, '#e9e6df');
    fY(bellB, H, tx0, tz0, tx1, tz1, '#8d8983');
    tBox(bellB, tx0 - .3, H, tz0 - .3, tx1 + .3, H + 1.4, tz0 + .3, '#c9c1b3'); tBox(bellB, tx0 - .3, H, tz1 - .3, tx1 + .3, H + 1.4, tz1 + .3, '#c9c1b3');
    addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + .4, (z1 - z0) / 2 + .4, 0); addFp({t:0, x:(x0 + x1) / 2, z:(z0 + z1) / 2, w:x1 - x0, d:z1 - z0, rot:0, color:'#9c8d7e'});
  }
  gRect(surfNear, 420, 312, 516, 326, .06, PAVE);   /* stops short of the frontage lane as it bends south (it used to be laid over it) */
  addLabel('Bell Suites', 472, 66, 344, true);
  OUT_DESTS.push({name:'Bell Suites 公寓', x:522, z:318});
  /* Bell 喷漆: a drive-in spray garage at the west end of the block, open to the frontage lane (north).
     Only its three walls collide; js/88-wardrobe-ui.js (the paint shop) reads window.XSPRAY to clear the wanted stars.
     It stands against the west lane (was x 116–130, in the middle of the empty lot): the lot between it and the block is the mamak's open-air tables (js/89-mamak.js). */
  { const X0 = 108, X1 = 122, Z0 = 316, Z1 = 334, H = 5.4, t = .4, wall = '#9aa3ab', inner = '#dfe3e6';
    tBox(bellB, X0, 0, Z0, X0 + t, H, Z1, wall); tBox(bellB, X1 - t, 0, Z0, X1, H, Z1, wall); tBox(bellB, X0, 0, Z1 - t, X1, H, Z1, wall);
    fX(bellB, X0 + t + .01, Z0, Z1 - t, 0, H, 1, null, inner); fX(bellB, X1 - t - .01, Z0, Z1 - t, 0, H, -1, null, inner); fZ(bellB, Z1 - t - .01, X0 + t, X1 - t, 0, H, -1, null, inner);
    tBox(bellB, X0 - .3, H, Z0 - .6, X1 + .3, H + .5, Z1 + .3, '#6f767d', '');
    tBox(bellB, X0, H - 1.5, Z0 - .1, X1, H, Z0 + .3, '#2a2d33', 'pz py');
    fZ(bellB, Z0 - .15, X0 + 1.6, X1 - 1.6, H - 1.35, H - .15, -1, A_SIGN(SIGN_SPRAY), '#ffffff');
    for (let k = 0; k < 6; k++) tBox(bellB, X0 + .05, k * .7, Z0 - .05, X0 + t + .05, k * .7 + .35, Z0 + .3, '#f2c230', 'ny'), tBox(bellB, X1 - t - .05, k * .7, Z0 - .05, X1 - .05, k * .7 + .35, Z0 + .3, '#f2c230', 'ny');
    gRect(surfNear, X0, 309.9, X1, Z1, .06, '#8e8a83');
    addBox(X0 + t / 2, (Z0 + Z1) / 2, t / 2 + .05, (Z1 - Z0) / 2, 0); addBox(X1 - t / 2, (Z0 + Z1) / 2, t / 2 + .05, (Z1 - Z0) / 2, 0); addBox((X0 + X1) / 2, Z1 - t / 2, (X1 - X0) / 2, t / 2 + .05, 0);
    addFp({t:0, x:(X0 + X1) / 2, z:(Z0 + Z1) / 2, w:X1 - X0, d:Z1 - Z0, rot:0, color:'#7d858d'});
    window.XSPRAY = {x:(X0 + X1) / 2, z:326.5, h:0, r:4.5, door:{x:(X0 + X1) / 2, z:Z0, h:0, w:X1 - X0 - 2 * t, d:Z1 - Z0 - t, top:H - 1.5}}; }
  /* gate pillars at the ends of the gateway, just past the porches (GATE_FRONT, js/10-world.js) */
  for (const s of [-1, 1]){ const px = GX + s * (GATE_FRONT.porch + 5.6); tBox(bellB, px - 1, 0, 262.2, px + 1, 3.2, 264.8, '#a4553a'); tBox(bellB, px - 1.25, 3.2, 261.9, px + 1.25, 3.6, 265.1, '#e6dece'); addBox(px, 263.5, 1.1, 1.4, 0); }
  OUT_DESTS.push({name:'Bell Avenue 后巷', x:250, z:BELL.zB});
  /* road-closed barriers where Jalan Sunsuria runs off the map */
  for (const xe of [MAP.x0 + 2, MAP.x1 - 2]) for (const zc of [270, 289]) for (let k = -2; k <= 2; k++) tBox(bellB, xe - .3, 0, zc + k * 1.8 - .8, xe + .3, 1.1, zc + k * 1.8 + .8, k % 2 ? '#d63a2f' : '#f4f1ea', 'ny');

  /* Taman Warisan Megah: rows of two-storey terraces with gable roofs, and low apartment slabs to the east */
  const TER = [[-26, 380, 68, 399], [74, 380, 147, 399], [152, 380, 225, 399], [232, 380, 316, 399],
    [-13, 411, 67, 430], [74, 411, 146, 430], [153, 411, 226, 430], [233, 411, 316, 430],
    [-13, 433, 67, 453], [74, 433, 146, 453], [153, 433, 226, 453], [233, 433, 316, 453]];
  TER.forEach(([x0, z0r, x1, z1], k) => {
    /* the row facing the gate (TWM) has a carport in front of every house: the house itself starts TWM.porch further back */
    const porch = x0 === TWM.x0 && z0r === TWM.z0, z0 = porch ? z0r + TWM.porch : z0r;
    const tint = BELL_TINTS[(k * 3 + 1) % BELL_TINTS.length], roof = k % 3 ? '#a5553a' : '#8e4a33', zc = (z0 + z1) / 2, L = x1 - x0 + 1.2;
    tBox(resB, x0, 0, z0, x1, 6.6, z1, tint, 'nz pz py ny');
    tileZ(resB, z0, x0, x1, porch ? 3.3 : 0, 6.6, -1, A_WIN[1], 6, 3.3, tint); tileZ(resB, z1, x0, x1, 0, 6.6, 1, A_WIN[0], 6, 3.3, tint);
    tQuad(resB, [x0 - .6, 9.2, zc], [L, 0, 0], [0, -2.9, -(zc - z0 + .8)], null, roof);
    tQuad(resB, [x1 + .6, 9.2, zc], [-L, 0, 0], [0, -2.9, z1 - zc + .8], null, roof);
    tTri(resB, [x0, 6.6, z1], [x0, 9.2, zc], [x0, 6.6, z0], tint); tTri(resB, [x1, 6.6, z0], [x1, 9.2, zc], [x1, 6.6, z1], tint);
    for (let x = x0 + 6; x < x1 - 1; x += 6) tBox(resB, x - .15, 0, z0 - .4, x + .15, 6.9, z0, '#e6dece');
    if (porch) for (let ux = x0; ux < x1 - 1; ux += TWM.unit){
      const ux1 = ux + TWM.unit;
      /* ground floor: front door on the left, a wide window on the right */
      fZ(resB, z0, ux, ux1, 0, 3.3, -1, null, tint);
      tBox(resB, ux + .45, 0, z0 - .12, ux + 1.95, 2.75, z0, '#efe8da', 'ny pz'); tBox(resB, ux + .6, 0, z0 - .16, ux + 1.8, 2.6, z0 - .1, '#6b4a33', 'ny pz');
      tBox(resB, ux + 2.5, .85, z0 - .1, ux + 5.5, 2.55, z0, '#efe8da', 'ny pz'); tBox(resB, ux + 2.65, 1, z0 - .14, ux + 5.35, 2.4, z0 - .08, '#5d7f93', 'ny pz');
      /* carport: concrete floor, a flat roof on two posts, and a low wall between neighbours */
      gRect(resB, ux, z0r, ux1, z0, .05, '#9e9a92');
      tBox(resB, ux, 2.95, z0r - .3, ux1, 3.15, z0, '#8d8983'); tQuad(resB, [ux, 2.95, z0r - .3], [TWM.unit, 0, 0], [0, 0, z0 - z0r + .3], null, '#e8e3d8');
      tBox(resB, ux + .05, 0, z0r - .15, ux + .3, 2.95, z0r + .1, '#efe8da'); tBox(resB, ux1 - .3, 0, z0r - .15, ux1 - .05, 2.95, z0r + .1, '#efe8da');
      tBox(resB, ux - .08, 0, z0r, ux + .08, 1, z0, '#d9d1c2'); addBox(ux, (z0r + z0) / 2, .1, (z0 - z0r) / 2, 0);
    }
    if (porch) addBox(x1, (z0r + z0) / 2, .1, (z0 - z0r) / 2, 0), tBox(resB, x1 - .08, 0, z0r, x1 + .08, 1, z0, '#d9d1c2');
    addBox((x0 + x1) / 2, zc, (x1 - x0) / 2 + .3, (z1 - z0) / 2 + .3, 0); addFp({t:0, x:(x0 + x1) / 2, z:zc, w:x1 - x0, d:z1 - z0, rot:0, color:'#a8644a'});
  });
  for (const [x0, z0, x1, z1] of [[346, 380, 421, 390], [447, 380, 521, 390], [346, 392.5, 421, 403], [447, 392.5, 521, 403], [346, 427, 421, 436], [447, 427, 521, 436]]){
    const H = 4 * 3.3;
    tileZ(resB, z0, x0, x1, 0, H, -1, A_WIN[0], 7, 3.3, '#f0ebe1'); tileZ(resB, z1, x0, x1, 0, H, 1, A_WIN[2], 7, 3.3, '#f0ebe1');
    fX(resB, x0, z0, z1, 0, H, -1, null, '#e4ddd0'); fX(resB, x1, z0, z1, 0, H, 1, null, '#e4ddd0'); fY(resB, H, x0, z0, x1, z1, '#8d8983');
    tBox(resB, x0 - .3, H, z0 - .3, x1 + .3, H + .9, z0 + .2, '#c4502a'); tBox(resB, x0 - .3, H, z1 - .2, x1 + .3, H + .9, z1 + .3, '#c4502a');
    addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + .3, (z1 - z0) / 2 + .3, 0); addFp({t:0, x:(x0 + x1) / 2, z:(z0 + z1) / 2, w:x1 - x0, d:z1 - z0, rot:0, color:'#a8644a'});
  }
})();
const bellMesh = tMesh(bellB, townMat, bellInfo, true);
tMesh(resB, townMat, resInfo, true);
addLabel('Bell Avenue 商业街', 276, 20, 335);

/* ---------- KIP mall (KIPMall Kota Warisan) and the blocks round it: KIP Sentral shop offices, KIP CORE Sentral, Prima Apartment ----------
   Traced from OpenStreetMap (mall way 661617399, KFC pad 886413865, the customer service roads round the mall, Jalan Warisan Sentral 1–4,
   shop blocks 662262984–987, KIP CORE Sentral 886413867 / 1443393651–52, Prima Apartment 662247744–749 and its service ring 400447252)
   and checked against aerial photos and street photos. Real metres from the mall centre (x east, z south) → game x − 662, z + 979, full size.
   The mall is one long two-storey box (≈ 234 × 87 m) with its front to the north over the car park; the north-west corner is cut back for a
   fried-chicken pad and the glazed "Gate A" entrance, the main doors (KIPMALL letters on a sloped canopy) are in the middle of the north front,
   a lane runs right round it, KIP Sentral's shop offices stand across the back lane, KIP CORE's two towers rise on a podium to the south-east,
   and the Prima Apartment blocks sit across the hill road (which plays Jalan Kota Warisan). Only the distance from campus is squeezed. */
const kipInfo = {name:'KIP 购物中心', tag:'商场', spawn:[-640, 915, Math.PI],
  desc:'照雪邦 KIPMall Kota Warisan 按 OpenStreetMap 的轮廓 1:1 搭的两层商场：北面朝停车场，正中是挂着 KIPMALL 红字的大门，西北角是炸鸡店和 Gate A 玻璃门厅，屋顶铺着太阳能板。里面有超市、亲子乐园、美食广场。真实离校门直线大约 1.3 公里（开车要绕更远），这里压缩成从校门开车半分钟，要翻过一道山坡。'};
const sentralInfo = {name:'KIP Sentral 店屋', tag:'商业', spawn:[-735.5, 1060, 0],
  desc:'KIP 商场后巷对面的一排排三层店屋（KIP Sentral），门口斜着停车，楼上多是小旅馆和诊所。这里搭了离商场最近的第一排，四栋，照真实的街道 Jalan Warisan Sentral 1、2、4 排开。'};
const coreInfo = {name:'KIP CORE Sentral', tag:'公寓', spawn:[-650, 1062, Math.PI / 2],
  desc:'KIP Sentral 东南角的 SoHo 公寓：四层的停车裙楼上立着 A、B 两栋高楼，裙楼顶上有泳池。整片 KIP 一带最显眼的高楼。'};
const primaInfo = {name:'Prima Apartment', tag:'住宅', spawn:[-494, 932, -Math.PI / 2],
  desc:'KIP 商场对面山坡下的四层公寓（A、B、C、D 栋和两栋没编号的），一条小环路绕着它们。'};
const KIP = {A:[-748, 936, -546, 1021], B:[-768, 976, -748, 1021], C:[-779, 1009, -768, 1021], H:12};
/* 麦当当 (OSM way 603715888) is really ≈ 630 m due south of the mall, at the bottom of Jalan Warisan Sentral 1 where the KIP Sentral
   shop rows end, with a petrol station just south of it (way 446330734). The map stops at z 1180, so here it sits at its real x right
   below the first row of KIP Sentral, and the petrol station beside it to the east. The model is drawn at its old spot and moved by (MDX, MDZ). */
const MDX = -282, MDZ = 377;
const mcdInfo = {name:'麦当当', tag:'快餐', spawn:[-522 + MDX, 776 + MDZ, -Math.PI / 2],
  desc:'KIP Sentral 店屋最南头、顺着 Jalan Warisan Sentral 1 开到底的 24 小时快餐店，旁边就是加油站。真实在 KIP 商场正南大约 600 米（离校门直线约 1.7 公里），这里压缩到店屋街区的南头。路边立着高高的汉堡招牌，还有得来速车道。名字是谐音，照那家快餐店搭的。'};
const fuelInfo = {name:'加油站', tag:'加油站', spawn:[-690, 1131, 0],
  desc:'麦当当旁边的加油站和 24 小时便利店，照真实的那家搭的外观（黄红两色的加油棚），不能加油。真实在麦当当正南边，地图到这里就到头了，所以放在它东边。'};
/* a vertical prism on a footprint polygon (game x, z, in order round it): walls tiled with an atlas region (or plain), a flat roof */
function prism(b, pts, y0, y1, col, r, tw, th, roof){
  for (let i = 0; i < pts.length; i++){
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az); if (L < .05) continue;
    /* outward normal must point away from the centre: flip the edge when the polygon runs the other way */
    let cx = 0, cz = 0; for (const p of pts){ cx += p[0] / pts.length; cz += p[1] / pts.length; }
    const out = (bz - az) * ((ax + bx) / 2 - cx) - (bx - ax) * ((az + bz) / 2 - cz) > 0;
    const [px, pz, qx, qz] = out ? [ax, az, bx, bz] : [bx, bz, ax, az];
    const nu = r ? Math.max(1, Math.round(L / tw)) : 1, nv = r ? Math.max(1, Math.round((y1 - y0) / th)) : 1;
    for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++){
      const t0 = u / nu, t1 = (u + 1) / nu, h0 = y0 + (y1 - y0) * v / nv, h1 = y0 + (y1 - y0) * (v + 1) / nv;
      /* tQuad's normal is U × V: U runs along the edge, V up; edges are taken so that this faces out */
      tQuad(b, [px + (qx - px) * t1, h0, pz + (qz - pz) * t1], [(px - qx) * (t1 - t0), 0, (pz - qz) * (t1 - t0)], [0, h1 - h0, 0], r, col);
    }
  }
  if (roof){
    const tri = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (let [i, j, k] of tri){
      if ((pts[j][1] - pts[i][1]) * (pts[k][0] - pts[i][0]) - (pts[j][0] - pts[i][0]) * (pts[k][1] - pts[i][1]) < 0) [j, k] = [k, j];   /* face up */
      tTri(b, [pts[i][0], y1, pts[i][1]], [pts[j][0], y1, pts[j][1]], [pts[k][0], y1, pts[k][1]], roof);
    }
  }
}
/* a collider and a minimap footprint for a (possibly turned) rectangle given by its four corners */
function rotCol(pts, pad, color){
  const [a, b2, c] = pts, L1 = Math.hypot(b2[0] - a[0], b2[1] - a[1]), L2 = Math.hypot(c[0] - b2[0], c[1] - b2[1]);
  const ux = (b2[0] - a[0]) / L1, uz = (b2[1] - a[1]) / L1, rot = Math.atan2(-uz, ux), cx = (a[0] + c[0]) / 2, cz = (a[1] + c[1]) / 2;
  addBox(cx, cz, L1 / 2 + pad, L2 / 2 + pad, rot); addFp({t:0, x:cx, z:cz, w:L1, d:L2, rot, color});
}
const KIP_SB = 4.6;   /* height of the shop band at the foot of the mall walls */
(function(){
  const b = TB(), H = KIP.H, SB = KIP_SB, [AX0, AZ0, AX1, AZ1] = KIP.A, [BX0, BZ0, BX1, BZ1] = KIP.B, [CX0, CZ0, CX1, CZ1] = KIP.C;
  const BLANK = '#e6e8e7', PAR = '#dfe2e2', ROOF = '#8a8e91', WHITE = '#f1f2f0', MET = '#7c8890';
  /* the walls: a shop band (atlas tile, or a plain plinth) and the cladding above it */
  const band = (vert, a0, a1, low, lw) => { const [k, at, dir] = vert;
    if (k === 'z'){ if (low) tileZ(b, at, a0, a1, 0, SB, dir, low, lw || 8, SB, '#ffffff'); else fZ(b, at, a0, a1, 0, SB, dir, null, BLANK); tileZ(b, at, a0, a1, SB, H, dir, A_MALL, 10, H - SB, '#ffffff'); }
    else { if (low) tileX(b, at, a0, a1, 0, SB, dir, low, lw || 8, SB, '#ffffff'); else fX(b, at, a0, a1, 0, SB, dir, null, BLANK); tileX(b, at, a0, a1, SB, H, dir, A_MALL, 10, H - SB, '#ffffff'); } };
  /* north front of the main box, west to east: outward-facing shops (the DIY store), the supermarket wall, main doors, a café, the food-court doors */
  const N = ['z', AZ0, -1];
  band(N, AX0, -704, A_SHOP[0], 8.8); band(N, -704, -656, null); band(N, -656, -624, null); band(N, -624, -608, A_SHOP[1], 8); band(N, -608, -592, A_GLASS, 8); band(N, -592, AX1, null);
  fZ(b, AZ0 - .1, -744, -726, 5.3, 8.1, -1, A_SIGN(KIP_TEN[1]), '#ffffff');
  fZ(b, AZ0 - .1, -694, -666, 6.6, 10.95, -1, A_SIGN(SIGN_KIP0), '#ffffff');
  fZ(b, AZ0 - .1, -611, -589, 5.25, 8.65, -1, A_SIGN(SIGN_KIP0 + 2), '#ffffff');
  tBox(b, -610, 4.35, 932.6, -590, 4.7, AZ0, MET, ''); for (const x of [-609.6, -590.4]) tBox(b, x - .14, 0, 932.7, x + .14, 4.35, 933, WHITE);
  /* east side (the kids' park doors under a flat canopy), back wall with three loading bays, the west wall in the cut-back corner */
  const E = ['x', AX1, 1];
  band(E, AZ0, 978, null); band(E, 978, 994, A_GLASS, 8); band(E, 994, AZ1, null);
  fX(b, AX1 + .1, 979, 993, 6, 8.2, 1, A_SIGN(SIGN_KIP0 + 1), '#ffffff');
  tBox(b, AX1, 4.4, 977.5, AX1 + 4.6, 4.75, 994.5, MET, ''); for (const z of [977.9, 994.1]) tBox(b, AX1 + 4.2, 0, z - .14, AX1 + 4.5, 4.4, z + .14, WHITE);
  const S = ['z', AZ1, 1];
  let sx = CX0; for (const x of [-724, -660, -596]){ band(S, sx, x, null); band(S, x, x + 8, A_SHOP[2], 8); sx = x + 8; } band(S, sx, AX1, null);
  band(['x', AX0, -1], AZ0, BZ0, A_SHOP[1], 8);
  band(['x', BX0, -1], 990, CZ0, null); band(['z', CZ0, -1], CX0, CX1, null); band(['x', CX0, -1], CZ0, CZ1, null);
  /* roofs, a parapet round the whole outline, a raised clerestory, solar panels (they cover much of the real roof), plant */
  for (const [x0, z0, x1, z1] of [KIP.A, KIP.B, KIP.C]) fY(b, H, x0, z0, x1, z1, ROOF);
  const OUTL = [[AX0, AZ0], [AX1, AZ0], [AX1, AZ1], [CX0, AZ1], [CX0, CZ0], [BX0, CZ0], [BX0, BZ0], [AX0, BZ0]];
  OUTL.forEach(([x0, z0], i) => { const [x1, z1] = OUTL[(i + 1) % OUTL.length]; tBox(b, Math.min(x0, x1) - .25, H, Math.min(z0, z1) - .25, Math.max(x0, x1) + .25, H + 1, Math.max(z0, z1) + .25, PAR); });
  tBox(b, -704, H, 944, -662, H + 2.4, 970, '#c3c7c9');
  for (const [x0, x1, z0, z1] of [[-744, -708, 940, 1006], [-656, -598, 946, 1004], [-590, -552, 940, 984], [-765, -751, 994, 1018]])
    for (let z = z0; z + 3.4 <= z1; z += 5){ fY(b, H + .6, x0, z, x1, z + 3.4, '#26364f'); tBox(b, x0, H, z + 1.5, x1, H + .55, z + 1.9, '#8b9196', 'py ny'); }
  for (const [x, z] of [[-720, 1012], [-690, 1014], [-640, 1010], [-600, 1014], [-570, 1008], [-575, 992]]) tBox(b, x - 2.2, H, z - 1.4, x + 2.2, H + 1.8, z + 1.4, '#c4c6c7');
  /* main doors: a glazed block above the roof line with KIPMALL on top, a sloped metal-and-glass canopy, red-and-white bollards */
  { const X0 = -656, X1 = -624, Z = 934.5, T = 16.5;
    tBox(b, X0, 0, Z, X1, T, 941, WHITE, 'nz ny');
    tileZ(b, Z, X0, X1, 0, SB, -1, A_GLASS, 8, SB, '#ffffff'); tileZ(b, Z, X0, X1, SB, T, -1, A_GRID, 4, 4, '#ffffff');
    fZ(b, Z - .1, -650, -630, 11.3, 16.1, -1, A_KIP, '#ffffff');
    tBox(b, X0 - .3, T, Z - .3, X1 + .3, T + .6, 941.3, PAR);
    gQuad4(b, [X0 - 1, 6.4, Z], [X1 + 1, 6.4, Z], [X1 + 1, 5.6, 927], [X0 - 1, 5.6, 927], MET);
    tQuad(b, [X0 - 1, 5.55, 927], [X1 - X0 + 2, 0, 0], [0, .8, Z - 927], null, '#d9dcdc');
    tBox(b, X0 - 1, 5.15, 926.75, X1 + 1, 5.7, 927.2, '#5d666c');
    fZ(b, 926.7, -646, -634, 5.72, 8.72, -1, A_KIP, '#ffffff');
    for (const x of [X0 + 1, X1 - 1]) tBox(b, x - .3, 0, 927.1, x + .3, 5.2, 927.7, WHITE);
    for (const x of [-651, -646, -634, -629]){ tBox(b, x - .12, 0, 926.3, x + .12, .5, 926.54, '#d63a2f'); tBox(b, x - .12, .5, 926.3, x + .12, 1, 926.54, '#f4f1ea'); } }
  /* Gate A, in the cut-back corner: glazed block, KIPMALL letters, two billboards on the roof (photos show the same) */
  { const X0 = BX0, X1 = BX1, Z = BZ0, T = 17;
    tBox(b, X0, 0, Z, X1, T, 990, WHITE, 'nz ny');
    tileZ(b, Z, X0, X1, 0, SB, -1, A_GLASS, 6.7, SB, '#ffffff'); tileZ(b, Z, X0, X1, SB, T, -1, A_GRID, 4, 4.1, '#ffffff');
    tileX(b, X0 - .02, Z, 990, 0, SB, -1, A_GLASS, 7, SB, '#ffffff');
    fZ(b, Z - .1, X0 + 2, X1 - 2, 12.6, 16.6, -1, A_KIP, '#ffffff');
    tBox(b, X0 - .3, T, Z - .3, X1 + .3, T + .6, 990.3, PAR);
    [[X0 + .5, X0 + 9.5, KIP_TEN[0]], [X1 - 9.5, X1 - .5, SIGN_KIP0 + 1]].forEach(([x0, x1, si]) => {
      for (const x of [x0 + 1, x1 - 1]) tBox(b, x - .15, T + .6, 978.4, x + .15, T + 2.4, 978.8, '#5d666c');
      tBox(b, x0, T + 2.4, 978.2, x1, T + 4.6, 978.9, '#b5121b'); fZ(b, 978.15, x0 + .2, x1 - .2, T + 2.55, T + 4.45, -1, A_SIGN(si), '#ffffff'); }); }
  addBox((AX0 + AX1) / 2, (AZ0 + AZ1) / 2, (AX1 - AX0) / 2 + .4, (AZ1 - AZ0) / 2 + .4, 0); addBox((BX0 + BX1) / 2, (BZ0 + BZ1) / 2, (BX1 - BX0) / 2 + .4, (BZ1 - BZ0) / 2 + .4, 0);
  addBox((CX0 + CX1) / 2, (CZ0 + CZ1) / 2, (CX1 - CX0) / 2 + .4, (CZ1 - CZ0) / 2 + .4, 0); addBox(-640, 937.7, 16.3, 3.2, 0);
  for (const [x0, z0, x1, z1] of [KIP.A, KIP.B, KIP.C]) addFp({t:0, x:(x0 + x1) / 2, z:(z0 + z1) / 2, w:x1 - x0, d:z1 - z0, rot:0, color:'#b9805a'});
  /* the fried-chicken pad (OSM: KFC, against the mall's north-west corner): white box, red fascia with the name, glass dining room, drive-thru roof, pole sign */
  { const X0 = -769, X1 = -751.5, Z0 = 939, Z1 = 960;
    tBox(b, X0, 0, Z0, X1, 5.4, Z1, '#f4f1ea', 'ny py');
    tileZ(b, Z0 - .02, X0 + .5, X1 - .5, 0, 3.5, -1, A_SHOP[1], 6, 3.5, '#ffffff'); tileX(b, X0 - .02, Z0 + 1, Z1 - 6, 0, 3.5, -1, A_SHOP[1], 7, 3.5, '#ffffff');
    tBox(b, X0 - .25, 4.1, Z0 - .25, X1 + .25, 5.6, Z1 + .25, '#b5121b', 'ny py'); fY(b, 5.45, X0, Z0, X1, Z1, '#8f9396');
    fZ(b, Z0 - .3, X0 + 2.5, X1 - 2.5, 4.2, 5.5, -1, A_SIGN(KIP_TEN[0]), '#ffffff'); fX(b, X0 - .3, 949, 950.4, 4.15, 5.55, -1, A_CHICK, '#ffffff');
    tBox(b, X0 - 5.5, 3.3, Z1 - 7, X0, 3.7, Z1, '#b5121b', ''); for (const z of [Z1 - 6.6, Z1 - .4]) tBox(b, X0 - 5.3, 0, z - .15, X0 - 5, 3.3, z + .15, '#f4f1ea');
    tBox(b, -780.75, 0, 941.75, -780.25, 9, 942.25, '#c9ccd0'); tBox(b, -782.2, 9, 941.6, -778.8, 12.4, 942.4, '#b5121b', 'pz nz ny');
    fZ(b, 941.58, -782, -779, 9.2, 12.2, -1, A_CHICK, '#ffffff'); fZ(b, 942.42, -782, -779, 9.2, 12.2, 1, A_CHICK, '#ffffff');
    addBox((X0 + X1) / 2, (Z0 + Z1) / 2, (X1 - X0) / 2 + .3, (Z1 - Z0) / 2 + .3, 0); addCircle(-780.5, 942, .5);
    addFp({t:0, x:(X0 + X1) / 2, z:(Z0 + Z1) / 2, w:X1 - X0, d:Z1 - Z0, rot:0, color:'#c8402e'}); }
  /* road sign at the car-park entrance, on the verge south of the driveway (clear of the hill road, the 山梁拉力 finish and the east lane), facing the traffic both ways */
  { const px = -530, pz = 919;
    for (const sx of [-1, 1]) tBox(b, px + sx * 2.1 - .2, 0, pz - .2, px + sx * 2.1 + .2, 7.4, pz + .2, '#9aa0a6');
    tBox(b, px - 2.7, 5.6, pz - .3, px + 2.7, 7.2, pz + .3, '#e0335a'); fZ(b, pz - .31, px - 2.55, px + 2.55, 5.7, 7.1, -1, A_KIP, '#ffffff'); fZ(b, pz + .31, px - 2.55, px + 2.55, 5.7, 7.1, 1, A_KIP, '#ffffff');
    for (let k = 0; k < 3; k++){ const y = 4.75 - k * .95; tBox(b, px - 2.3, y, pz - .15, px + 2.3, y + .8, pz + .15, '#2c2f33'); fZ(b, pz - .16, px - 2.2, px + 2.2, y + .05, y + .75, -1, A_SIGN(SIGN_KIP0 + k), '#ffffff'); fZ(b, pz + .16, px - 2.2, px + 2.2, y + .05, y + .75, 1, A_SIGN(SIGN_KIP0 + k), '#ffffff'); }
    tBox(b, px - 2.6, 0, pz - .5, px + 2.6, .35, pz + .5, '#c9c1b3');
    addBox(px, pz, 2.7, .5, 0); }
  tMesh(b, townMat, kipInfo, true);

  /* ---- ground round the mall: car parks, pavements, kerbs (the lanes round it are OUT_ROADS kipW / kipE / kipS) ---- */
  const BX = i => -781 + i * 2.8, NB = 78;   /* north car park bays, 2.8 m wide, x −781 … −562.6 */
  gRect(surfFar, -790, 873, -546, 926, .05, ASPH); gRect(surfFar, -546, 913, -536, 926, .05, ASPH); gRect(surfFar, -547, 896, -526, 912, .05, ASPH);
  gRect(surfFar, -751, 926, -543, AZ0, .06, PAVE); gRect(surfFar, -751, AZ0, -748, 962.5, .06, PAVE); gRect(surfFar, -771, 962.5, -748, BZ0, .06, PAVE);
  gRect(surfFar, -782, 926, -751, 962.5, .05, ASPH); gRect(surfFar, -782, 962.5, -771, 1006, .05, ASPH);
  gRect(surfFar, -771, BZ0, -768, 1006, .06, PAVE); gRect(surfFar, -782, 1006, -768, CZ0, .06, PAVE); gRect(surfFar, -782, CZ0, -779, AZ1, .06, PAVE);
  gRect(surfFar, -782, AZ1, -543, 1026.5, .06, PAVE); gRect(surfFar, AX1, AZ0, -543, AZ1, .06, PAVE);
  /* rows of bays: against the north kerb, two double rows, a row facing the mall across the ring lane (gaps at the two crossings) */
  for (let i = 0; i <= NB; i++){ const x = BX(i);
    gLine(markFar, x, 873.3, x, 878, .12, .075, LINE); gLine(markFar, x, 885, x, 895, .12, .075, LINE); gLine(markFar, x, 903, x, 913, .12, .075, LINE);
    if (!(x > -649 && x < -631) && !(x > -609 && x < -591)) gLine(markFar, x, 921, x, 926, .12, .075, LINE); }
  for (const z of [878, 885, 890, 895, 903, 908, 913, 921]) gLine(markFar, BX(0), z, BX(NB), z, .12, .075, LINE);
  for (const xc of [-640, -600]) for (let k = -3; k <= 3; k++) gRect(markFar, xc + k * 1.1 - .32, 913.6, xc + k * 1.1 + .32, 920.4, .075, LINE);
  gRect(surfFar, -536, 938, -530, 1020, .055, ASPH2); for (let z = 938; z <= 1020; z += 2.8) gLine(markFar, -536, z, -530, z, .12, .075, LINE);
  for (const [x0, x1] of [[-800, -671], [-663, -512]]){ gRect(surfFar, x0, 1033.5, x1, 1043.5, .055, ASPH2); gLine(markFar, x0, 1038.5, x1, 1038.5, .12, .075, LINE);
    for (let x = x0 + 1.4; x < x1 - 1; x += 2.8) gLine(markFar, x, 1033.6, x, 1043.4, .12, .075, LINE); }
  /* kerbs: along the north edge and down the west side of the car park, open at the driveway in the east */
  gRect(surfFar, -790.6, 872.4, -545.4, 873, .09, KERB); gRect(surfFar, -790.6, 872.4, -790, 1026.5, .09, KERB);
  gRect(surfFar, -546.6, 872.4, -546, 895.5, .09, KERB);
  addLabel('KIP 购物中心', -647, 26, 978);
  OUT_DESTS.push({name:'KIP 购物中心', x:-640, z:918, far:true});

  /* ---- KIP Sentral: the first row of three-storey shop offices across the back lane, each block one row of units 23 m deep,
     fronts on Jalan Warisan Sentral 1 / 2 / 4 with angled parking, backs on two service alleys (OSM 662262984–987) ---- */
  const sb = TB(), SZ0 = 1053, SZ1 = 1120, NU = 10, U = (SZ1 - SZ0) / NU, TOP = 5.6 + 2 * 3.3, ARC = 2.4;
  const pool = ['咖啡 Coffee', '酒店 Hotel', '快餐 AllAce', '诊所 Klinik', '24h 便利店', '马来餐 Lazat', '自助洗衣 Dobi', '酒店 Hotel', '中医馆', '店铺出租 To Let', '韩国料理', '租车 Rental', '熊猫奶茶']
    .map(n => signIdx.has(n) ? signIdx.get(n) : SIGN_TOLET);
  const SEN_TINT = ['#f3ede2', '#e9e2d4', '#efe6d6', '#e4e7e4'];
  [[-796, -773, -1, 6.5], [-768, -745, 1, 6], [-726, -703, -1, 6], [-698, -675, 1, 4.5]].forEach(([x0, x1, dir, park], bi) => {
    const xo = dir < 0 ? x0 : x1, xb = dir < 0 ? x1 : x0, xf = xo - dir * ARC, tint = SEN_TINT[bi];
    fX(sb, xb, SZ0, SZ1, 0, TOP, -dir, null, '#d8d2c6'); tileX(sb, xb - dir * .02, SZ0, SZ1, 5.6, TOP, -dir, A_WIN[2], U, 3.3, '#d8d2c6');
    for (const [z, d] of [[SZ0, -1], [SZ1, 1]]){ fZ(sb, z, x0, x1, 0, TOP, d, null, tint); tileZ(sb, z + d * .02, Math.min(xb, xf), Math.max(xb, xf), 5.6, TOP, d, A_WIN[1], 6.5, 3.3, tint); }
    fY(sb, TOP, x0, SZ0, x1, SZ1, '#7a7771'); tBox(sb, Math.min(xo, xo - dir * .35), TOP, SZ0, Math.max(xo, xo - dir * .35), TOP + 1, SZ1, tint);
    tBox(sb, Math.min(xf, xo), 4.2, SZ0, Math.max(xf, xo), TOP, SZ1, tint, 'px nx py nz pz');
    for (let u = 0; u < NU; u++){
      const za = SZ0 + u * U, zb = za + U, si = pool[(bi * 7 + u * 3) % pool.length];
      fX(sb, xf + dir * .01, za, zb, 0, 4.2, dir, A_SHOP[OUT_SIGNS[si][3]], '#ffffff');
      fX(sb, xo, za, zb, 4.2, 5.6, dir, null, '#d8d0c2'); fX(sb, xo + dir * .1, za + .35, zb - .35, 4.35, 5.45, dir, A_SIGN(si), '#ffffff');
      for (let f = 0; f < 2; f++) fX(sb, xo, za, zb, 5.6 + f * 3.3, 5.6 + (f + 1) * 3.3, dir, A_WIN[(u + bi + f) % 3], tint);
      tBox(sb, xo - dir * .35 - .26, 0, za - .26, xo - dir * .35 + .26, 4.2, za + .26, '#efe8da');
    }
    tBox(sb, xo - dir * .35 - .26, 0, SZ1 - .26, xo - dir * .35 + .26, 4.2, SZ1 + .26, '#efe8da');
    gRect(surfFar, Math.min(xf, xo), SZ0, Math.max(xf, xo), SZ1, .06, PAVE);
    const pa = xo, pb = xo + dir * park; gRect(surfFar, Math.min(pa, pb), SZ0, Math.max(pa, pb), SZ1, .055, ASPH2);
    gLine(markFar, pb - dir * .15, SZ0, pb - dir * .15, SZ1, .2, .075, LINE);
    if (park > 5) for (let z = SZ0 + 1; z < SZ1 - 3; z += 2.8) gLine(markFar, pa, z, pb, z + 2.6, .12, .075, LINE);
    else for (let z = SZ0 + 1; z < SZ1 - 1; z += 6) gLine(markFar, pa, z, pb, z, .12, .075, LINE);
    addBox((x0 + x1) / 2, (SZ0 + SZ1) / 2, (x1 - x0) / 2 + .3, (SZ1 - SZ0) / 2 + .3, 0); addFp({t:0, x:(x0 + x1) / 2, z:(SZ0 + SZ1) / 2, w:x1 - x0, d:SZ1 - SZ0, rot:0, color:'#b9805a'});
  });
  tMesh(sb, townMat, sentralInfo, true);
  addLabel('KIP Sentral', -735.5, 18, 1086);
  OUT_DESTS.push({name:'KIP Sentral 店屋', x:-735.5, z:1086, far:true});

  /* ---- KIP CORE Sentral: a four-storey car-park podium (OSM 886413867, a wedge cut off along the south-east) with towers A and B on
     its north edge (1443393651–52) and a pool on the podium roof ---- */
  const cb = TB(), POD = [[-632.3, 1055.3], [-533.7, 1055.8], [-533.7, 1066.2], [-561, 1091.3], [-605.3, 1157.3], [-632.8, 1155.1]], PH = 14;
  prism(cb, POD, 0, 4.2, '#ffffff', A_SHOP[0], 8, 4.2, null);
  prism(cb, POD, 4.2, PH, '#d9dcdc', A_WIN[2], 8, 3.3, '#8b9a84');   /* podium roof: the residents' deck, partly planted */
  prism(cb, POD, PH, PH + 1, '#c9c1b3', null);
  gQuad4(cb, [-571.6, PH + .05, 1102.1], [-560.8, PH + .05, 1085.7], [-571.1, PH + .05, 1079], [-581.9, PH + .05, 1095.4], '#3fa7d6');
  for (const [x0, x1, col] of [[-582.2, -544.7, '#eef0ee'], [-626.1, -585.7, '#e6e9eb']]){
    const z0 = 1056.4, z1 = 1066.9, T = PH + 17 * 3.3;
    /* floor by floor with two window bays in turn, so the lit windows at night are scattered over the face (one bay type lit everywhere or nowhere) */
    for (let f = 0; f < 17; f++){ const y0 = PH + f * 3.3, y1 = y0 + 3.3, w = A_WIN[f % 2], w2 = A_WIN[(f + 1) % 2];
      tileZ(cb, z0, x0, x1, y0, y1, -1, w, 6.2, 3.3, col); tileZ(cb, z1, x0, x1, y0, y1, 1, w2, 6.2, 3.3, col);
      tileX(cb, x0, z0, z1, y0, y1, -1, w2, 5.2, 3.3, col); tileX(cb, x1, z0, z1, y0, y1, 1, w, 5.2, 3.3, col); }
    fY(cb, T, x0, z0, x1, z1, '#8d8983'); tBox(cb, x0 - .3, T, z0 - .3, x1 + .3, T + 1.6, z0 + .3, '#c9c1b3'); tBox(cb, x0 - .3, T, z1 - .3, x1 + .3, T + 1.6, z1 + .3, '#c9c1b3');
    /* the red vertical feature strip and the crown seen on the real towers */
    tBox(cb, (x0 + x1) / 2 - 1.6, PH, z0 - .5, (x0 + x1) / 2 + 1.6, T + 4, z0 + .2, '#c4372f'); tBox(cb, x0 + 2, T, z0 + 2, x1 - 2, T + 3.2, z1 - 2, '#d8dadb');
  }
  addLabel('KIP CORE', -585, 80, 1062, true);
  for (const [x0, z0, x1, z1] of [[-632.5, 1055.3, -533.7, 1066.2], [-632.5, 1066.2, -553, 1080], [-632.5, 1080, -565, 1098], [-632.8, 1098, -578, 1118], [-632.8, 1118, -592, 1138], [-632.8, 1138, -604, 1156]])
    addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + .3, (z1 - z0) / 2 + .3, 0);
  addFp({t:0, x:-596, z:1061, w:73, d:11, rot:0, color:'#9c8d7e'}); addFp({t:0, x:-605, z:1106, w:55, d:100, rot:0, color:'#a8644a'});
  gRect(surfFar, -663.5, 1050.5, -632.5, 1157, .055, ASPH2);   /* the podium's forecourt along Jalan Warisan Sentral 4 */
  tMesh(cb, townMat, coreInfo, true);
  OUT_DESTS.push({name:'KIP CORE 公寓', x:-650, z:1100, far:true});

  /* ---- Prima Apartment: six four-storey slabs at their real angles round a private service ring, across the hill road from the mall ---- */
  const pr = TB(), PRIMA = [
    [[-468, 941.4], [-401, 933], [-402.6, 920.2], [-469.7, 928.6]], [[-456.7, 974], [-391.8, 955.3], [-395.5, 942.9], [-460.3, 961.6]],
    [[-454, 1004.9], [-389.5, 984.7], [-393.4, 972.4], [-457.9, 992.6]], [[-356.1, 921.2], [-288.9, 913.8], [-290.4, 900.9], [-357.5, 908.3]],
    [[-357.9, 949.1], [-290.3, 950.2], [-290.1, 937.2], [-357.7, 936.2]], [[-353.1, 974.1], [-285.6, 974.3], [-285.5, 961.4], [-353.1, 961.1]]];
  PRIMA.forEach((pts, k) => {
    const PH4 = 4 * 3.3, tint = ['#f0ebe1', '#ece6da', '#f2eee6'][k % 3];
    prism(pr, pts, 0, PH4, tint, A_WIN[k % 2 ? 0 : 2], 7, 3.3, '#8d8983');
    prism(pr, pts, PH4, PH4 + .9, '#c4502a', null);
    rotCol(pts, .3, '#a8644a');
  });
  tMesh(pr, townMat, primaInfo, true);
  addLabel('Prima Apartment', -420, 22, 960);
})();
(function(){
  /* 麦当当: red box with a yellow fascia, a badge tower, glass front to the west (Jalan Warisan Sentral 1), a tall pole sign by that road,
     drive-thru (in at the north-east corner, south past the order board, west along the south side to the pick-up window, out onto the road).
     Modelled around the old spot and shifted by (MDX, MDZ) to the south end of KIP Sentral. */
  const m = TB(), mLot = TB(), mMark = TB(), MX0 = -501, MX1 = -472, MZ0 = 762, MZ1 = 788;
  tBox(m, -495, 0, 768, MX1, 4.8, MZ1, '#c0392b', 'nx py');
  tileX(m, -495, 768, MZ1, 0, 4.2, -1, A_SHOP[1], 6.7, 4.2, '#ffffff'); fX(m, -495, 768, MZ1, 4.2, 4.8, -1, null, '#c0392b');   /* dining room behind the glass, not shop shelves */
  tBox(m, -495.4, 4.8, 767.6, MX1 + .4, 6.2, MZ1 + .4, '#ffc72c', 'py ny'); fY(m, 6.2, -495.4, 767.6, MX1 + .4, MZ1 + .4, '#5a5a5a');
  fX(m, -495.5, 774.3, 781.7, 4.8, 6.2, -1, A_SIGN(SIGN_MCD), '#ffffff');
  tBox(m, MX0, 0, MZ0, -495, 9, 768, '#a8321f', 'py ny'); fY(m, 9, MX0, MZ0, -495, 768, '#ffc72c');
  fX(m, MX0 - .05, 762.7, 767.3, 4, 8.6, -1, A_BURGER, '#ffffff'); fZ(m, MZ0 - .05, -500.3, -495.7, 4, 8.6, -1, A_BURGER, '#ffffff');
  /* the pick-up window on the drive-thru side: frame, glass, counter ledge, a white band and two menu posters (was a dark square on a bare red wall) */
  tBox(m, -480.5, .85, MZ1, -475.5, 2.75, MZ1 + .12, '#d9dde0', 'ny'); fZ(m, MZ1 + .13, -480.1, -475.9, 1.1, 2.5, 1, A_GLASS, '#ffffff');
  fZ(m, MZ1 + .135, -478.06, -477.94, 1.1, 2.5, 1, null, '#d9dde0');
  tBox(m, -480.7, .85, MZ1, -475.3, .95, MZ1 + .45, '#b9bdc0', '');
  fZ(m, MZ1 + .02, -495, MX1, 3.55, 3.85, 1, null, '#f4f1ea'); fZ(m, MZ1 + .02, -495, MX1, 3.25, 3.35, 1, null, '#ffc72c');
  for (const x of [-489, -485]) fZ(m, MZ1 + .03, x - 1.1, x + 1.1, 1.2, 2.8, 1, A_BURGER, '#ffffff');
  /* roof plant behind the fascia */
  for (const [x, z] of [[-490, 773], [-486, 773], [-481, 782]]) tBox(m, x - 1, 6.2, z - .7, x + 1, 7.3, z + .7, '#b7b9bb');
  /* pole sign: the pole stops inside the boxes (it used to be thicker than the 麦当当 24h board and showed through the middle of the name) */
  tBox(m, -536.6, 0, 751.6, -535.4, .45, 752.4, '#9a9ea3');
  tBox(m, -536.22, .45, 751.78, -535.78, 12, 752.22, '#c9ccd0');
  tBox(m, -538.2, 12, 751.6, -533.8, 16.4, 752.4, '#c8102e', 'pz nz ny'); fZ(m, 751.58, -538, -534, 12.2, 16.2, -1, A_BURGER, '#ffffff'); fZ(m, 752.42, -538, -534, 12.2, 16.2, 1, A_BURGER, '#ffffff');
  tBox(m, -539.5, 10.3, 751.7, -532.5, 11.7, 752.3, '#c8102e', 'pz nz ny'); fZ(m, 751.68, -539.3, -532.7, 10.4, 11.6, -1, A_SIGN(SIGN_MCD), '#ffffff'); fZ(m, 752.32, -539.3, -532.7, 10.4, 11.6, 1, A_SIGN(SIGN_MCD), '#ffffff');
  addBox((MX0 + MX1) / 2 + MDX, (MZ0 + MZ1) / 2 + MDZ, (MX1 - MX0) / 2 + .5, (MZ1 - MZ0) / 2 + .5, 0); addCircle(-536 + MDX, 752 + MDZ, .8);
  addFp({t:0, x:(MX0 + MX1) / 2 + MDX, z:(MZ0 + MZ1) / 2 + MDZ, w:MX1 - MX0, d:MZ1 - MZ0, rot:0, color:'#c8402e'});
  /* the lot: the drive-thru loop with a row of bays along Jalan Warisan Sentral 1 (it used to be a 93 × 68 m lot with two rows of bays) */
  gRect(mLot, -520.5, 751, -458, 801, .05, ASPH);
  for (let z = 753.5; z < 799; z += 2.8) gLine(mMark, -520, z, -515, z, .12, .075, LINE);
  gLine(mMark, -515, 753.5, -515, 798.3, .12, .075, LINE);
  for (const [ax, az, bx2, bz] of [[-459.5, 752, -459.5, 796], [-459.5, 796, -506, 796], [-471.5, 752, -471.5, 761]]) gLine(mMark, ax, az, bx2, bz, .18, .075, YEL);   /* drive-thru: in at the north-east corner, round to the window on the south side */
  const shift = (src, dst) => { for (let i = 0; i < src.p.length; i += 3){ src.p[i] += MDX; src.p[i + 2] += MDZ; } for (const k of ['p', 'n', 'uv', 'c']) for (const v of src[k]) dst[k].push(v); };
  const mm = TB(); shift(m, mm); tMesh(mm, townMat, mcdInfo, true); shift(mLot, surfFar); shift(mMark, markFar);
  addLabel('麦当当', -486 + MDX, 16, 775 + MDZ);
  OUT_DESTS.push({name:'麦当当', x:-520 + MDX, z:778 + MDZ, far:true});
  /* the petrol station: a yellow-and-red forecourt canopy over two pump islands, a 24 h shop, a price pylon by Jalan Warisan Sentral 4 */
  const f = TB(), CX0 = -734, CX1 = -708, CZ0 = 1138, CZ1 = 1166, CH = 5.4;
  gRect(surfFar, -740, 1128, -670.5, 1178, .05, '#8f8c86');
  tBox(f, CX0, CH, CZ0, CX1, CH + .9, CZ1, '#f4f1ea', 'py'); fY(f, CH + .9, CX0, CZ0, CX1, CZ1, '#d9d6cf');
  tBox(f, CX0 - .2, CH + .25, CZ0 - .2, CX1 + .2, CH + 1.1, CZ1 + .2, '#f7d117', 'ny py'); tBox(f, CX0 - .25, CH - .05, CZ0 - .25, CX1 + .25, CH + .3, CZ1 + .25, '#d62a1e', 'ny py');
  for (const x of [-727, -715]) for (const z of [1145, 1159]){ tBox(f, x - .3, 0, z - .3, x + .3, CH, z + .3, '#f4f1ea'); addCircle(x, z, .45); }
  for (const x of [-727, -715]){
    tBox(f, x - .8, 0, 1141, x + .8, .25, 1163, '#cfcfcf');
    for (const z of [1147.5, 1156.5]){ tBox(f, x - .45, .25, z - .7, x + .45, 2, z + .7, '#f2f2f2'); tBox(f, x - .47, 1.7, z - .72, x + .47, 2.05, z + .72, '#d62a1e'); }
    addBox(x, 1152, .85, 11, 0);
  }
  { const X0 = -700, X1 = -678, Z0 = 1136, Z1 = 1170, T = 4.6;
    tBox(f, X0, 0, Z0, X1, T, Z1, '#f4f1ea', 'nx py ny'); fY(f, T + .4, X0 - .25, Z0 - .25, X1 + .25, Z1 + .25, '#8f9396');
    tileX(f, X0, Z0, Z1, 0, 3.4, -1, A_SHOP[0], 8.5, 3.4, '#ffffff'); fX(f, X0, Z0, Z1, 3.4, T, -1, null, '#f4f1ea');
    tBox(f, X0 - .25, 3.5, Z0 - .25, X1 + .25, T + .4, Z1 + .25, '#f7d117', 'ny py'); tBox(f, X0 - .3, 3.35, Z0 - .3, X1 + .3, 3.6, Z1 + .3, '#d62a1e', 'ny py');
    fX(f, X0 - .3, 1146, 1160, 3.65, T + .3, -1, A_SIGN(signIdx.has('24h 便利店') ? signIdx.get('24h 便利店') : SIGN_TOLET), '#ffffff');
    addBox((X0 + X1) / 2, (Z0 + Z1) / 2, (X1 - X0) / 2 + .3, (Z1 - Z0) / 2 + .3, 0); addFp({t:0, x:(X0 + X1) / 2, z:(Z0 + Z1) / 2, w:X1 - X0, d:Z1 - Z0, rot:0, color:'#c9a227'}); }
  { const px = -674.5, pz = 1132;
    tBox(f, px - .25, 0, pz - .25, px + .25, 4, pz + .25, '#c9ccd0'); tBox(f, px - 1.3, 4, pz - .35, px + 1.3, 8.4, pz + .35, '#f7d117');
    tBox(f, px - 1.32, 7.2, pz - .37, px + 1.32, 8.4, pz + .37, '#d62a1e'); for (let k = 0; k < 3; k++) tBox(f, px - 1.1, 4.4 + k * .9, pz - .38, px + 1.1, 5.0 + k * .9, pz + .38, '#1d1f24');
    addCircle(px, pz, .5); }
  addFp({t:0, x:(CX0 + CX1) / 2, z:(CZ0 + CZ1) / 2, w:CX1 - CX0, d:CZ1 - CZ0, rot:0, color:'#e0c040'});
  tMesh(f, townMat, fuelInfo, true);
  addLabel('加油站', -700, 12, 1152);
})();
tMesh(surfNear, outGroundMat); tMesh(markNear, outMarkMat); tMesh(surfFar, outGroundMat); tMesh(markFar, outMarkMat);

/* ---------- knockable things outside the gate: street lamps, palms by the main road, trees on the hills ---------- */
/* kept out of knockSets on purpose, so the black hole's "% of campus" stays exactly as before */
const OUT_SETS = [];
function outSet(kind, spots, parts, shadow){
  if (!spots.length) return null;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, ym = 0;
  for (const o of spots){ x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); z0 = Math.min(z0, o.z); z1 = Math.max(z1, o.z); ym += o.y; }
  const c = new THREE.Vector3((x0 + x1) / 2, ym / spots.length + 5, (z0 + z1) / 2), R = Math.hypot(x1 - x0, z1 - z0) / 2 + 30;
  const ims = parts.map(([geo, mat]) => {
    const g = geo.clone(); g.boundingSphere = new THREE.Sphere(c, R);
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach((o, i) => { _cm.compose(_cp.set(o.x, o.y, o.z), _cq.setFromAxisAngle(UP, o.r), _cs.setScalar(o.s)); im.setMatrixAt(i, _cm); if (o.col) im.setColorAt(i, o.col); });
    im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = true;   /* InstancedMesh is not culled by default in r128; the sphere above covers every instance */
    scene.add(im); return im;
  });
  const set = {kind, spots, ims, bb:[x0, z0, x1, z1], c, R, vis:true}; OUT_SETS.push(set); return set;
}
const outSpot = (x, z, r, s) => { const y = terrainY(x, z); return {x, z, y, ty:y, r, s}; };
/* street lamps (pole, arm and head over the road, ~40 triangles): along the main road, down Bell Avenue, along the hill road, in the car parks */
const outPostGeo = geoMerge([new THREE.CylinderGeometry(.09, .14, 5.6, 5, 1, true).translate(0, 2.8, 0), new THREE.BoxGeometry(.1, .1, 1.5).translate(0, 5.5, .7), new THREE.BoxGeometry(.34, .16, .72).translate(0, 5.47, 1.5)]);
const outBulbGeo = new THREE.BoxGeometry(.28, .05, .6).translate(0, 5.37, 1.5);
(function(){
  const spots = [], step = TOUCH ? 56 : 42;
  for (let x = MAP.x0 + 30; x < MAP.x1 - 20; x += step){ if (Math.abs(x - GX) < 16 || [264, 299, KIP_X0].some(v => Math.abs(x - v) < 10)) continue; const sd = Math.round(x / step) % 2 ? 1 : -1; spots.push(outSpot(x, 279.5, sd > 0 ? 0 : Math.PI, 1)); }
  for (let x = 150; x < 420; x += 30){ spots.push(outSpot(x, BELL.zF - 3.6, 0, .9)); spots.push(outSpot(x + 15, BELL.zB + 3.6, Math.PI, .9)); }
  for (let s = 40; s < ROAD.kip.L - 20; s += step){ const [x, z, tx, tz] = outRoadAt(ROAD.kip, s), o = -(ROAD.kip.w / 2 + 1.8); spots.push(outSpot(x - tz * o, z + tx * o, Math.atan2(-tz, tx), 1)); }
  /* KIP: on the middle lines of the double rows of bays, along the back lane, and in KIP Sentral; then 麦当当 (by its bays and at the corners of the drive-thru) */
  for (const [x, z] of [[-760, 890], [-700, 890], [-640, 890], [-580, 890], [-730, 908], [-670, 908], [-610, 908], [-760, 1038.5], [-690, 1038.5], [-620, 1038.5], [-550, 1038.5],
    [-739.6, 1065], [-731.4, 1105], [-799.5, 1138], [-799.5, 1166], [-739.6, 1140], [-739.6, 1166]]) spots.push(outSpot(x, z, 0, 1));
  outSet('lamp', spots, [[outPostGeo, M('#3b3f44', {metalness:.4, roughness:.5})], [outBulbGeo, bulbMat]], !TOUCH);
})();
/* coconut palms in the Jalan Sunsuria median, from the KIP turn-off to Bell Suites (gaps at the gate and the Bell driveways) */
(function(){
  const spots = [], rr = mkRng(4410);
  for (let x = -40; x < 560; x += 19) if (Math.abs(x - GX) > 20 && Math.abs(x - 264) > 9 && Math.abs(x - 299) > 9) spots.push(outSpot(x + (rr() - .5) * 3, 279.5 + (rr() - .5) * 2, rr() * 6.28, .9 + rr() * .3));
  const parts = [[trunkGeo, M('#ffffff', {vertexColors:true, roughness:.95})], [crownGeo, M('#ffffff', {side:THREE.DoubleSide, roughness:.8, vertexColors:true})]];
  outSet('tree', spots, parts, true);
  /* and round the KIP car park, on the verges outside the bays (they were bare asphalt pads in the grass): one more set, culled with the view */
  const lot = [];
  for (let x = -786; x < -548; x += 19) lot.push(outSpot(x + (rr() - .5) * 2, 869.4, rr() * 6.28, .85 + rr() * .3));
  for (let z = 880; z < 1022; z += 15) lot.push(outSpot(-794.2, z + (rr() - .5) * 2, rr() * 6.28, .85 + rr() * .3));
  outSet('tree', TOUCH ? lot.filter((_, i) => i % 2) : lot, parts, true);   /* half as many on phones */
})();
/* hill trees: low-poly jungle trees everywhere, an oil-palm estate on the slopes east of Bell Avenue; one instanced mesh per kind per 1/36 of the map,
   culled by the camera frustum, the shadow frustum and (in the main loop) by distance */
const jungleGeo = (() => {
  const c = geoAt(new THREE.IcosahedronGeometry(3, 0), 0, 6.2, 0, 0, 0, 0, 1.15, .8, 1.15), p = c.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++){ const v = Math.max(.62, Math.min(1.08, .72 + .3 * (p.getY(i) - 3.8) / 4.8)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  c.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geoMerge([geoTint(new THREE.CylinderGeometry(.25, .42, 4.4, 4, 1, true).translate(0, 2.2, 0), '#8a7360'), c]);
})();
const oilPalmGeo = (() => {
  const pos = [], col = [], rr = mkRng(919), A = new THREE.Color('#2f5a24'), B = new THREE.Color('#5d8f3a'), C = new THREE.Color();
  for (let k = 0; k < 9; k++){
    const a = k / 9 * Math.PI * 2 + rr() * .3, ca = Math.cos(a), sa = Math.sin(a), L = 4 + rr() * .8, wv = .55;
    const base = [0, 5.1, 0], mid = [ca * L * .52, 6 + rr() * .4, sa * L * .52], tip = [ca * L, 4.2 + rr() * .5, sa * L];
    const mL = [mid[0] - sa * wv, mid[1], mid[2] + ca * wv], mR = [mid[0] + sa * wv, mid[1], mid[2] - ca * wv];
    pos.push(...base, ...mR, ...mL, ...mL, ...mR, ...tip);
    for (const t of [0, .5, .5, .5, .5, 1]){ C.copy(A).lerp(B, t); col.push(C.r, C.g, C.b); }
  }
  const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); f.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); f.computeVertexNormals();
  return geoMerge([geoTint(new THREE.CylinderGeometry(.3, .42, 5.2, 5, 1, true).translate(0, 2.6, 0), '#5d4a36'), f]);
})();
(function(){
  const rr = mkRng(6161), jMat = M('#ffffff', {vertexColors:true, flatShading:true, roughness:.9}), pMat = M('#ffffff', {vertexColors:true, side:THREE.DoubleSide, roughness:.85});
  const GREENS = ['#4a8a3a', '#3f7a35', '#356b2e', '#5a8f3e', '#2f6634', '#4f7f2f'].map(c => new THREE.Color(c)), PALMS = ['#ffffff', '#e8f0d8', '#d8e6c4'].map(c => new THREE.Color(c));
  const NC = 6, xMax = TG.x0 + (TG.nx - 1) * TG.C, zMax = TG.z0 + (TG.nz - 1) * TG.C, cw = (xMax - TG.x0) / NC, ch = (zMax - TG.z0) / NC;
  const chunks = [...Array(NC * NC)].map(() => ({j:[], p:[]}));
  const nearRoad = (x, z, pad) => {
    const i = Math.round((x - TG.x0) / TG.C), j = Math.round((z - TG.z0) / TG.C); if (TG.RD[j * TG.nx + i] > 90) return false;
    for (const r of OUT_ROADS) for (let q = 0; q < r.p.length - 1; q++) if (segDist(x, z, r.p[q], r.p[q + 1]) < r.w / 2 + pad) return true;
    return false;
  };
  const ok = (x, z, pad) => x > TG.x0 + 40 && x < xMax - 40 && z > TG.z0 + 40 && z < zMax - 40 && rectDist(x, z, CAMPUS_R) > 10 && !OUT_PADS.some(p => rectDist(x, z, p) < 8) && !nearRoad(x, z, pad);
  /* on a slope the trunk stands on the lowest ground round its foot, so its downhill side never hangs in the air
     (one in three hill trees used to float by 15 cm or more, the worst by almost 2 m) */
  const put = (key, x, z, s, col) => {
    const ci = Math.min(NC - 1, Math.floor((x - TG.x0) / cw)) + NC * Math.min(NC - 1, Math.floor((z - TG.z0) / ch)), o = Object.assign(outSpot(x, z, rr() * 6.28, s), {col}), r = .48 * s;
    let lo = o.y; for (let a = 0; a < 8; a++) lo = Math.min(lo, terrainY(x + Math.cos(a * .785) * r, z + Math.sin(a * .785) * r));
    o.y = o.ty = lo - .05; chunks[ci][key].push(o);
  };
  const ESTATE = {x0:300, x1:760, z0:530, z1:930}, dens = TOUCH ? .55 : 1;
  for (let z = ESTATE.z0; z < ESTATE.z1; z += 12) for (let x = ESTATE.x0 + (Math.round(z / 12) % 2) * 7; x < ESTATE.x1; x += 14){
    if (rr() > .93 * dens) continue; const px = x + (rr() - .5) * 2, pz = z + (rr() - .5) * 2;
    if (ok(px, pz, 6)) put('p', px, pz, .85 + rr() * .3, PALMS[(rr() * 3) | 0]);
  }
  for (let z = TG.z0 + 50; z < zMax - 50; z += 30) for (let x = TG.x0 + 50; x < xMax - 50; x += 30){
    const px = x + (rr() - .5) * 24, pz = z + (rr() - .5) * 24;
    if (px > ESTATE.x0 - 10 && px < ESTATE.x1 + 10 && pz > ESTATE.z0 - 10 && pz < ESTATE.z1 + 10) continue;
    /* forest patches where the land rises (noise mask), scattered trees on the low grass */
    const h = terrainY(px, pz), wood = smooth01(.42, .58, vnoise(px / 160 + 3.3, pz / 160 + 8.1) * .6 + smooth01(2, 14, h) * .4);
    if (rr() > (.12 + .85 * wood) * dens) continue;
    if (ok(px, pz, 9)) put('j', px, pz, (1.1 + rr() * .5) * (1 + wood * .6), GREENS[(rr() * GREENS.length) | 0]);
  }
  for (const c of chunks){ outSet('tree', c.j, [[jungleGeo, jMat]], !TOUCH); outSet('tree', c.p, [[oilPalmGeo, pMat]], !TOUCH); }
})();
function outKnock(x, z, R, fromX, fromZ){
  let n = 0;
  for (const set of OUT_SETS){
    const b = set.bb; if (x < b[0] - R || x > b[2] + R || z < b[1] - R || z > b[3] + R) continue;
    set.spots.forEach((o, i) => {
      if (o.down) return; const dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz >= R * R) return;
      o.down = true; n++; const ax = o.x - fromX, az = o.z - fromZ, l = Math.hypot(ax, az) || 1; setKnock(set, i, true, ax / l, az / l);
      if (set.kind === 'tree') for (let k = 0; k < 5; k++) spawnPart('leaf', o.x + (outRng() - .5) * 4, o.y + 5 + outRng() * 4, o.z + (outRng() - .5) * 4, .6, {vx:(outRng() - .5) * 6, vy:2 + outRng() * 3, vz:(outRng() - .5) * 6, g:6, life:1.6, op:1, color:'#4f9a3f'});
      else for (let k = 0; k < 4; k++) spawnPart('dust', o.x, o.y + 4, o.z, .5, {vx:(outRng() - .5) * 10, vy:3 + outRng() * 4, vz:(outRng() - .5) * 10, g:15, life:.5, op:1, color:'#ffd27a'});
    });
  }
  return n;
}

/* ---------- minimap: shaded hills (pre-drawn once), roads and car parks outside the hedge ---------- */
const outRelief = (() => {
  const {nx, nz, C, x0, z0, Y} = TG, cv = document.createElement('canvas'); cv.width = nx; cv.height = nz;
  const g = cv.getContext('2d'), img = g.createImageData(nx, nz), lo = new THREE.Color('#79a35a'), hi = new THREE.Color('#3f6f33'), c = new THREE.Color();
  const at = (i, j) => Math.max(0, Y[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){
    const x = x0 + i * C, z = z0 + j * C, o = (j * nx + i) * 4;
    if (x > CAMPUS_R.x0 && x < CAMPUS_R.x1 && z > CAMPUS_R.z0 && z < CAMPUS_R.z1){ img.data[o + 3] = 0; continue; }
    const h = at(i, j), sh = 1 + ((at(i - 1, j) - at(i + 1, j)) + (at(i, j - 1) - at(i, j + 1))) * .05;
    c.copy(lo).lerp(hi, smooth01(0, 45, h)).multiplyScalar(Math.max(.7, Math.min(1.25, sh)));
    img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); return cv;
})();
const OUT_LOTS = [[-790, 873, -546, 926], [-782, 926, -751, 962.5], [-782, 962.5, -771, 1006], [-536, 938, -530, 1020], [-800, 1033.5, -512, 1043.5], [-663.5, 1050.5, -632.5, 1157],
  [-802.5, 1053, -796, 1120], [-745, 1053, -726, 1120], [-675, 1053, -670.5, 1120], [-802.5, 1128, -740, 1178], [-740, 1128, -670.5, 1178], [138, 310, 413, 315.5], [138, 354.7, 413, 360], [420, 312, 516, 326]];
function drawOutMini(mg, X, Z, k){
  const C = TG.C; mg.imageSmoothingEnabled = true;
  mg.drawImage(outRelief, X(TG.x0 - C / 2), Z(TG.z0 - C / 2), TG.nx * C * k, TG.nz * C * k);
  mg.fillStyle = '#9d988f'; for (const [x0, z0, x1, z1] of OUT_LOTS) mg.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
  mg.strokeStyle = '#cfcac0'; mg.lineCap = 'round'; mg.lineJoin = 'round';
  for (const r of OUT_ROADS){ mg.lineWidth = Math.max(1.5, r.w * k); mg.beginPath(); (r.line || r.p).forEach(([x, z], i) => i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z))); mg.stroke(); }
}

/* ---------- people on Bell Avenue, outside KIP and at 麦当当 (built on the first frame, from the campus student models) ---------- */
const PED_PATHS = [
  [143, 316.8, 223, 316.8], [223, 316.8, 143, 316.8], [236, 316.8, 316, 316.8], [316, 316.8, 236, 316.8], [329, 316.8, 408, 316.8],
  [143, 353.4, 223, 353.4], [236, 353.4, 316, 353.4], [408, 353.4, 329, 353.4], [229.5, 318, 229.5, 352], [264, 301, 264, 314],
  [GX + 9, 262, GX + 9, 300], [GX + 10.5, 300, GX + 10.5, 262],
  [-675, 930.5, -605, 930.5], [-610, 932.5, -700, 932.5], [-641, 929, -641, 888], [-503 + MDX, 758 + MDZ, -503 + MDX, 794 + MDZ],
  [-700, 1024, -580, 1024], [-794.8, 1057, -794.8, 1116], [-746.2, 1116, -746.2, 1057]
];
const OUT_CARS = [['myvi', '#d35400', 250.8, 312.4, .524], ['sedan', '#f0eee8', 302.6, 357.6, 2.618],
  ['sedan', '#1f1f22', -701.2, 875.7, Math.PI], ['myvi', '#c0392b', -611.6, 923.6, 0], ['sedan', '#7f8c8d', -799.4, 1150.4, -Math.PI / 2]];
const OUT = {ready:false, lift:[], peds:[], pim:null, pedOn:false};
function outInit(){
  OUT.ready = true;
  /* lift campus props that grew on the forest hills, and clear the opening in the hedge */
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    if (Math.abs(o.x - GX) < 18 && o.z > 249 && o.z < 300){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); return; }
    const y = terrainY(o.x, o.z); if (y > .02){ o.ty = o.y = y; OUT.lift.push([set, i, o]); setKnock(set, i, !!o.down, 0, 1); }
  });
  /* the new roads join the network (security patrols can now spawn on them) */
  for (const r of OUT_ROADS) for (let i = 0; i < r.p.length - 1; i += 6) roadSegs.push({a:r.p[i], b:r.p[Math.min(r.p.length - 1, i + 6)], h:r.w / 2});
  for (const [kind, col, x, z, h] of OUT_CARS){ const c = makeCar(kind, col, x, z, h); c.out = true; }
  if (typeof npcBodyGeo !== 'undefined'){
    const n = PED_PATHS.length, rr = mkRng(3141), mk = (geo, mat, k) => { const im = new THREE.InstancedMesh(geo, mat, k); im.castShadow = !TOUCH; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; };
    const P = OUT.pim = {body:mk(npcBodyGeo, new THREE.MeshStandardMaterial({roughness:.8}), n), head:mk(npcHeadGeo, new THREE.MeshStandardMaterial({roughness:.7}), n), gear:mk(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), n),
      leg:mk(npcLegGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), n * 2), sleeve:mk(npcSleeveGeo, new THREE.MeshStandardMaterial({roughness:.8}), n * 2), fore:mk(npcForeGeo, new THREE.MeshStandardMaterial({roughness:.7}), n * 2)};
    PED_PATHS.forEach((pp, i) => {
      const sh = SHIRTS[(i * 3 + 1) % SHIRTS.length], sk = SKIN[i % SKIN.length];
      P.body.setColorAt(i, _col.set(sh)); P.head.setColorAt(i, _col.set(sk));
      for (const s of [0, 1]){ P.sleeve.setColorAt(i * 2 + s, _col.set(sh)); P.fore.setColorAt(i * 2 + s, _col.set(sk)); P.leg.setColorAt(i * 2 + s, _col.set(PANTS[(i + 2) % PANTS.length])); }
      OUT.peds.push({p:pp, t:rr(), dir:1, sp:1 + rr() * .6, walk:rr() * 6, x:pp[0], z:pp[1], h:0, ox:0, oz:0, dodge:0, dvx:0, dvz:0, wait:0});
    });
  }
}
const _pc = new THREE.Vector3();
function updatePeds(dt){
  const P = OUT.pim; if (!P) return;
  const cam = camera.position, on = OUT.peds.some(p => Math.abs(p.x - cam.x) < 420 && Math.abs(p.z - cam.z) < 420);
  if (on !== OUT.pedOn){ OUT.pedOn = on; for (const k in P) P[k].visible = on; }
  if (!on) return;
  const car = mode === 'naiwa' ? driving : null, csp = car ? Math.hypot(car.vx, car.vz) : 0;
  OUT.peds.forEach((n, i) => {
    const [ax, az, bx, bz] = n.p, L = Math.hypot(bx - ax, bz - az) || 1;
    let swing = 0;
    if (n.wait > 0) n.wait -= dt;
    else {
      n.t += n.dir * n.sp * dt / L;
      if (n.t > 1 || n.t < 0){ n.t = Math.max(0, Math.min(1, n.t)); n.dir = -n.dir; n.wait = 1 + (i % 3); }
      if (!REDUCED){ n.walk += dt * n.sp * 4.6; swing = Math.sin(n.walk) * .5; }
    }
    if (n.dodge > 0){ n.dodge -= dt; n.ox += n.dvx * dt; n.oz += n.dvz * dt; } else { n.ox *= Math.exp(-dt * .5); n.oz *= Math.exp(-dt * .5); }
    n.x = ax + (bx - ax) * n.t + n.ox; n.z = az + (bz - az) * n.t + n.oz; n.h = Math.atan2((bx - ax) * n.dir, (bz - az) * n.dir);
    if (car && csp > 4 && n.dodge <= 0){
      const rx = n.x - car.x, rz = n.z - car.z, ux = car.vx / csp, uz = car.vz / csp, along = rx * ux + rz * uz, lat = rx * uz - rz * ux;
      if (along > 0 && along < 10 + csp * .25 && Math.abs(lat) < car.T.W / 2 + 1.6){
        const sgn = lat >= 0 ? 1 : -1; n.dodge = .45; n.dvx = uz * sgn * 9; n.dvz = -ux * sgn * 9;
        spawnPart('excl', n.x, 2.6, n.z, .8, {vy:1.5, life:.8, op:1, color:'#e74c3c'}); heat += .15; addStunt('擦身而过', 60);
      }
    }
    const hop = n.dodge > 0 ? Math.sin(Math.PI * Math.max(0, n.dodge) / .45) * .9 : Math.abs(Math.cos(n.walk)) * .045 * (swing ? 1 : 0);
    _cp.set(n.x, groundAt(n.x, n.z) + hop, n.z); _cq.setFromAxisAngle(UP, n.h); _cs.setScalar(1); _nb.compose(_cp, _cq, _cs);
    P.body.setMatrixAt(i, _nb); P.head.setMatrixAt(i, _nb); P.gear.setMatrixAt(i, _nb);
    for (const s of [-1, 1]){
      const j = i * 2 + (s > 0 ? 1 : 0); P.leg.setMatrixAt(j, npcLimb(s * .09, .92, 0, swing * s));
      const m = npcLimb(s * .215, 1.39, s * .1, -swing * s * .8); P.sleeve.setMatrixAt(j, m); P.fore.setMatrixAt(j, m);
    }
  });
  for (const k in P) P[k].instanceMatrix.needsUpdate = true;
}

/* ---------- per frame (called from the main loop) ---------- */
function updateOutskirts(dt, T){
  if (!OUT.ready) outInit();
  /* black-hole mode plays on a flat campus: hide the forest hills and stand their trees back on the ground; outside props get stood up again */
  const flat = mode === 'hole';
  if (flat !== TG.flat){
    TG.flat = flat; if (TG.campusMesh) TG.campusMesh.visible = !flat;
    for (const [set, i, o] of OUT.lift){ o.y = flat ? 0 : o.ty; if (!o.hidden && !o.down) setKnock(set, i, false, 0, 0); }
    for (const set of OUT_SETS) set.spots.forEach((o, i) => { if (o.down){ o.down = false; setKnock(set, i, false, 0, 0); } });
  }
  townMat.emissiveIntensity = Math.max(cur.win, wx.rain * .6);
  /* far hill trees are a few pixels tall and mostly fogged: skip them (shorter on phones) */
  const far = Math.min(TOUCH ? 900 : 1250, XQ.pick(600, 900, 1250)), cp = camera.position;
  for (const s of OUT_SETS){ if (s.kind !== 'tree') continue; const v = cp.distanceTo(s.c) - s.R < far; if (v !== s.vis){ s.vis = v; for (const im of s.ims) im.visible = v; } }
  if (mode === 'naiwa' && driving && !gx.paused){
    const c = driving, sp = Math.hypot(c.vx, c.vz);
    if (sp > 4){
      const fx = Math.sin(c.h), fz = Math.cos(c.h), n = outKnock(c.x + fx * c.T.L * .35, c.z + fz * c.T.L * .35, c.T.W / 2 + 1.1, c.x - fx * 5, c.z - fz * 5);
      if (n){ c.vx *= .86; c.vz *= .86; sfx.thud(.6); camShake = Math.max(camShake, .6); heat += n * .12; addStunt('撞倒', 15 * n); }
    }
  }
  updatePeds(dt);
}
