/* 小游戏 · 大胃王争霸赛（Bell 夜市）
 * 奶娃和对手站在夜市长桌两头，面前是同一份菜单（沙爹、椰浆饭、炒粿条、煎蕊、印度煎饼、叻沙、拉茶、榴莲），谁先吃完谁赢；
 *   60 秒到了都没吃完，吃得多的赢。
 * 操作：狂点「吃」（手机右下的大按钮、点画面；电脑点鼠标左键或按空格），「喝水」是右键 / K / 左边的蓝按钮。
 * 技巧：
 *   噎：每一口都往喉咙里塞一点（「吃」按钮外面那一圈），点得太快会满，满了噎住 1.5 秒，噎着还狂点会更久；喝水能马上冲下去。
 *   辣：椰浆饭、叻沙越吃越辣（🌶 条），越辣越容易噎，辣满了会辣哭；喝水、煎蕊、拉茶解辣。一局只有 3 杯水。
 *   特殊盘子：吃完榴莲熏对手 1.6 秒；金盘子吃完 4 秒「大胃王时间」，一口算两口、不噎不辣。
 *   对手：学长吃得慢、爱打嗝；夜市老板会往你盘里撒辣椒；传说中的大胃王还会拍桌子吓你（看到他举手就停手，被吓到会噎），落后太多会开「第二个胃」。
 * 三个对手是三个模式，各有排行榜（用时，越短越好），赢了上一个才能挑战下一个。
 * 入口：Bell 夜市中间的红圈（js/89-outskirts-play.js，用 XMini.startAt 直接进），B1 游戏厅里也有一台。
 */
'use strict';
XMini.register((() => {
  const TIME = 60, DRAIN = 60, GAIN = 10, COOL = 3, WATER = 3, TY = 1.02;
  const FOOD = {
    satay:{n:'沙爹', b:14, cell:0, h:.38, c:'#a0612c'},
    roti:{n:'印度煎饼', b:13, cell:1, h:.2, ch:.85, c:'#e8b35a'},
    nasi:{n:'椰浆饭', b:16, cell:2, h:.55, heat:4.5, c:'#f2efe4', tag:'辣'},
    ckt:{n:'炒粿条', b:16, cell:3, h:.42, ch:1.25, c:'#9a6532', tag:'油'},
    laksa:{n:'叻沙', b:16, cell:4, h:.4, heat:6.5, c:'#e0612a', tag:'很辣'},
    cendol:{n:'煎蕊', b:9, cell:5, h:.6, cool:9, c:'#6fcf6a', tag:'解辣'},
    teh:{n:'拉茶', b:7, cell:6, h:.75, cool:7, ease:12, c:'#c89a64', tag:'顺气'},
    durian:{n:'榴莲', b:14, cell:7, h:.7, stink:1, c:'#b6c84a', tag:'熏人'}
  };
  const KEYS = Object.keys(FOOD);
  /* the three opponents: one mode (and one leaderboard) each */
  const OPS = [
    {id:'senior', name:'邻座学长', who:'阿凯学长', skin:'#8fc9ff', belly:'#eef6ff', rate:4.6, throat:1, hres:1, drinkAt:90, careful:0, burp:[5, 9], tricks:[], gap:[99, 99], mult:1,
      menu:['satay', 'roti', 'nasi', 'cendol', 'ckt', 'satay', 'durian', 'roti', 'teh', 'ckt'], medals:[200, 240, 600],
      line:'学长吃得慢，还老打嗝。', intro:'和邻座学长比吃夜市小吃，谁先吃完 10 盘谁赢。'},
    {id:'boss', name:'夜市老板', who:'沙爹摊旺叔', skin:'#f0a15c', belly:'#fff1dc', rate:6.9, throat:.86, hres:.9, drinkAt:66, careful:88, burp:[9, 14], tricks:['chili'], gap:[10, 14], mult:1.3,
      menu:['satay', 'nasi', 'ckt', 'cendol', 'laksa', 'roti', 'durian', 'satay', 'teh', 'nasi', 'ckt'], medals:[220, 260, 600],
      line:'旺叔头上冒 🌶 就是要往你盘里撒辣椒：先喝水，或者慢点吃。', intro:'和沙爹摊的旺叔比吃 11 盘。'},
    {id:'legend', name:'传说中的大胃王', who:'「无底洞」肚神', skin:'#b48cff', belly:'#f3eaff', rate:7.9, throat:.7, hres:.75, drinkAt:56, careful:88, burp:[13, 19], tricks:['chili', 'slam', 'slam'], gap:[7, 10], second:1, mult:1.7,
      menu:['satay', 'laksa', 'ckt', 'nasi', 'cendol', 'durian', 'roti', 'laksa', 'teh', 'ckt', 'durian', 'satay'], medals:[250, 290, 600],
      line:'肚神举手就是要拍桌子：马上停手，被吓到会噎住。落后太多他会开「第二个胃」。', intro:'和传说中的大胃王「无底洞」肚神比吃 12 盘。'}
  ];
  const RULES = '狂点「吃」，吃太快会噎住（按钮外圈变红就慢一点，噎住了别再点）；椰浆饭、叻沙越吃越辣，辣满了会辣哭，喝水能解辣、也能把噎住冲下去，一局 3 杯。吃完榴莲能熏对手一下，金盘子吃完有 4 秒一口顶两口。';
  const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  let S = null, ATLAS = null, ATLAS_URL = '';

  /* ---------- the dishes, painted top-down into one 512×256 atlas (3D domes and the HUD icons share it) ---------- */
  function paintAtlas(){
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
    const C = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    const E = (x, y, rx, ry, a, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); };
    const L = (pts, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sprinkle = (n, rad, sz, cols) => { for (let i = 0; i < n; i++){ const a = r() * 7, d = Math.sqrt(r()) * rad; C(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, sz * (.6 + r() * .6), cols[(r() * cols.length) | 0]); } };
    const cell = (i, f) => { g.save(); g.translate((i % 4) * 128, ((i / 4) | 0) * 128); g.beginPath(); g.arc(64, 64, 63, 0, 7); g.clip(); f(); g.restore(); };
    cell(0, () => {   /* 沙爹: skewers of charred meat, peanut sauce, cucumber and onion */
      C(64, 64, 64, '#c98a3a'); sprinkle(40, 60, 4, ['#b0742c', '#d9a050']);
      for (let k = 0; k < 5; k++){ const y = 26 + k * 17; L([8, y + 10, 118, y - 8], 3, '#e6cf96'); for (let j = 0; j < 4; j++){ const x = 26 + j * 19; E(x, y + 7 - j * 3.2, 9, 6.5, -.16, '#7c3f18'); E(x - 2, y + 5 - j * 3.2, 4, 2.5, -.16, '#a85d28'); C(x + 3, y + 8 - j * 3.2, 1.6, '#3a1a08'); } }
      C(98, 98, 15, '#7a4a1c'); C(98, 98, 12, '#b0702a'); sprinkle(0, 0, 0, []); C(26, 104, 9, '#dff0c8'); C(26, 104, 7, '#7fbf5a'); C(40, 112, 7, '#f4e6f0');
    });
    cell(1, () => {   /* 印度煎饼: flaky round bread, a little bowl of dhal */
      C(64, 64, 64, '#e2a64e');
      for (let k = 0; k < 6; k++){ g.strokeStyle = k % 2 ? '#c4862e' : '#f0c878'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 10 + k * 9, k, k + 4.6); g.stroke(); }
      sprinkle(26, 56, 4, ['#a8661e', '#c98a3a']); C(94, 34, 17, '#f4f1ea'); C(94, 34, 14, '#e8a22a'); sprinkle(0, 0, 0, []); C(90, 30, 3, '#ffcf5a'); C(98, 38, 2.5, '#c0601a');
    });
    cell(2, () => {   /* 椰浆饭: banana leaf, rice, sambal, egg, cucumber, peanuts, anchovies */
      C(64, 64, 64, '#2f7f34'); L([4, 64, 124, 64], 2, '#5fae4a');
      E(54, 60, 30, 26, 0, '#f6f2e6'); sprinkle(0, 0, 0, []); for (let i = 0; i < 30; i++) C(30 + r() * 48, 40 + r() * 42, 2, '#ffffff');
      E(86, 44, 16, 12, .4, '#c8321e'); E(84, 42, 9, 6, .4, '#e04a28'); E(88, 86, 15, 12, 0, '#ffffff'); C(88, 86, 7, '#ffbf2a');
      for (let i = 0; i < 4; i++){ C(30 + i * 9, 96 + (i % 2) * 4, 6, '#d8efc0'); C(30 + i * 9, 96 + (i % 2) * 4, 4, '#6fae4a'); }
      for (let i = 0; i < 10; i++) E(96 + r() * 18, 62 + r() * 14, 3, 2, r() * 3, '#c98a4a'); for (let i = 0; i < 7; i++) L([24 + r() * 14, 30 + r() * 14, 30 + r() * 14, 34 + r() * 10], 2, '#e0bc7a');
    });
    cell(3, () => {   /* 炒粿条: flat noodles, prawns, chives, sprouts */
      C(64, 64, 64, '#8a5a2e');
      for (let i = 0; i < 26; i++){ const y = 10 + r() * 108, x = 6 + r() * 60; L([x, y, x + 20, y - 6 + r() * 12, x + 40, y + r() * 8, x + 58, y - 4], 5, i % 3 ? '#b67c40' : '#c9944e'); }
      for (let i = 0; i < 4; i++){ const x = 30 + r() * 68, y = 30 + r() * 68; g.strokeStyle = '#ff8a5a'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, 7, .3, 4); g.stroke(); }
      for (let i = 0; i < 12; i++){ const x = 14 + r() * 100, y = 14 + r() * 100; L([x, y, x + 8, y + 3], 3, '#4fa83a'); }
      for (let i = 0; i < 10; i++){ const x = 14 + r() * 100, y = 14 + r() * 100; L([x, y, x + 9, y - 2], 2.5, '#f2ecd8'); }
    });
    cell(4, () => {   /* 叻沙: red curry broth, noodles, tofu puffs, egg, mint */
      C(64, 64, 64, '#f4f1ea'); C(64, 64, 58, '#c8481c'); sprinkle(30, 52, 5, ['#e8742a', '#f09a3a', '#b8381a']);
      for (let i = 0; i < 8; i++){ const y = 30 + i * 8; L([30, y, 50, y + 4, 70, y - 2, 96, y + 3], 3, '#f6dc8a'); }
      for (let i = 0; i < 4; i++){ const x = 30 + r() * 60, y = 34 + r() * 56; g.fillStyle = '#d9a050'; g.fillRect(x, y, 13, 11); g.fillStyle = '#ecc070'; g.fillRect(x + 2, y + 2, 6, 4); }
      E(88, 82, 12, 10, 0, '#ffffff'); C(88, 82, 6, '#ffb52a'); for (let i = 0; i < 5; i++) E(40 + r() * 20, 88 + r() * 10, 5, 2.5, r() * 3, '#3f9a3a');
    });
    cell(5, () => {   /* 煎蕊: shaved ice, coconut milk, green jelly, palm sugar, red beans */
      C(64, 64, 64, '#f0e8da'); sprinkle(30, 56, 5, ['#ffffff', '#e8dccb']);
      for (let i = 0; i < 26; i++){ const x = 16 + r() * 92, y = 16 + r() * 92; L([x, y, x + 6 + r() * 6, y + r() * 8 - 4], 5, '#46b54e'); }
      g.strokeStyle = '#5a2c0e'; g.lineWidth = 5; g.beginPath(); g.moveTo(20, 50); g.bezierCurveTo(50, 20, 70, 100, 108, 60); g.stroke(); C(64, 60, 12, '#6a3612');
      for (let i = 0; i < 14; i++) C(28 + r() * 70, 30 + r() * 70, 3.5, '#7a2a2a');
    });
    cell(6, () => {   /* 拉茶: a tall glass, frothy top */
      C(64, 64, 64, '#c89a64'); C(64, 64, 52, '#e2c08a'); sprinkle(60, 48, 5, ['#f2dcb4', '#fbecd0', '#e8cfa0']); C(56, 56, 10, '#fff4e0'); C(78, 74, 6, '#fff4e0');
      g.strokeStyle = '#8a5a2e'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
    });
    cell(7, () => {   /* 榴莲: spiky husk split open, creamy pods */
      C(64, 64, 64, '#6f8a2a');
      for (let i = 0; i < 70; i++){ const x = r() * 128, y = r() * 128; g.fillStyle = i % 2 ? '#56701e' : '#8aa83a'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y + 4); g.lineTo(x - 5, y + 4); g.fill(); }
      E(64, 64, 40, 30, .5, '#f2efe0'); E(50, 54, 15, 11, .5, '#f4d24a'); E(76, 74, 15, 11, .5, '#f0c83a'); E(70, 50, 11, 8, .5, '#f8dc66'); E(54, 78, 10, 8, .5, '#eec23a');
      sprinkle(0, 0, 0, []); C(48, 50, 3, '#fff2a8'); C(74, 70, 3, '#fff2a8');
    });
    return cv;
  }
  function atlas(){ if (!ATLAS){ ATLAS = paintAtlas(); try { ATLAS_URL = ATLAS.toDataURL('image/png'); } catch(e){ ATLAS_URL = ''; } } return ATLAS; }
  /* a dome whose top shows one cell of the atlas */
  function domeGeo(cell){
    const g = new THREE.SphereGeometry(1, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
    const cx = (cell % 4) + .5, cy = ((cell / 4) | 0) + .5;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (cx + p.getX(i) * .47) / 4, 1 - (cy + p.getZ(i) * .47) / 2);
    return g;
  }
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
  function tbx(list, w, h, d, x, y, z, col){ list.push(geoTint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col)); }

  /* ---------- styles: our HUD cards, and the platform's two buttons turned into a big 吃 and a water button ---------- */
  { const st = document.createElement('style'); st.textContent = `
#beHud{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--safe-t) + var(--edge) + 62px);display:flex;gap:8px;width:min(560px,calc(100% - 16px));pointer-events:none!important;font-size:12.5px}
.be-card{flex:1 1 0;min-width:0;padding:6px 9px 7px;border-radius:var(--r-md);background:var(--panel-solid);border:1px solid var(--line);border-top:3px solid var(--c);color:var(--ink);box-sizing:border-box}
.be-card.op{text-align:right}
.be-h{display:flex;justify-content:space-between;align-items:baseline;gap:6px;white-space:nowrap}
.be-card.op .be-h{flex-direction:row-reverse}
.be-h b{font-family:var(--display);font-size:14.5px;overflow:hidden;text-overflow:ellipsis}
.be-h span{font-variant-numeric:tabular-nums;color:var(--muted)}
.be-h span em{font-style:normal;font-family:var(--display);font-size:16px;color:var(--ink)}
.be-bar{height:8px;border-radius:4px;background:var(--chip);overflow:hidden;margin:4px 0 5px}
.be-bar i{display:block;height:100%;width:0;background:var(--c);transition:width .12s}
.be-card.op .be-bar i{margin-left:auto}
.be-row{display:flex;align-items:center;gap:5px}
.be-card.op .be-row{flex-direction:row-reverse}
.be-ic{flex:none;width:30px;height:30px;border-radius:50%;background-size:400% 200%;box-shadow:0 0 0 2px #f4f1ea;position:relative}
.be-ic.n{width:20px;height:20px;opacity:.75}
.be-ic.gold{box-shadow:0 0 0 2px #ffcf3a,0 0 8px #ffcf3a}
.be-dn{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.be-dn small{font-weight:500;color:var(--muted);margin-left:3px}
.be-st{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11.5px;white-space:nowrap}
.be-card.op .be-st{flex-direction:row-reverse}
.be-heat{flex:1;height:6px;border-radius:3px;background:var(--chip);overflow:hidden}
.be-heat i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ffb03a,#e8321e)}
.be-card.op .be-heat i{margin-left:auto}
.be-bub{position:fixed;left:0;top:0;z-index:5;padding:4px 10px;border-radius:14px;background:#fffbe8;color:#2a2018;font-weight:800;font-size:15px;white-space:nowrap;pointer-events:none!important;
  box-shadow:0 2px 6px rgba(0,0,0,.25);transform:translate(-50%,-100%);will-change:transform}
.be-bub[hidden]{display:none}
.be-bub.warn{background:#e8321e;color:#fff;font-size:17px}
.be-lock{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,calc(100% - 40px));padding:18px;text-align:center;background:var(--panel-solid);color:var(--ink);border-radius:var(--r-lg);border-top:4px solid #ff8a3d}
.be-lock b{display:block;font-family:var(--display);font-size:19px;margin-bottom:6px}
.be-lock p{font-size:13px;color:var(--muted);line-height:1.6;margin:0 0 12px}
body.be-on #acts{align-items:center;gap:12px}
body.be-on #acts>.mg-b{border-radius:50%;padding:0;position:relative;color:#fff;border:0}
body.be-on #acts>.mg-b.be-eat{width:112px;height:112px;background:radial-gradient(circle at 40% 35%,#ff9a52,#e2421e 70%);box-shadow:0 4px 0 #a02a10,0 6px 14px rgba(0,0,0,.35)}
body.be-on #acts>.mg-b.be-eat b{font-size:42px;line-height:1;font-family:var(--display)}
body.be-on #acts>.mg-b.be-eat::before{content:'';position:absolute;inset:-8px;border-radius:50%;pointer-events:none;
  background:conic-gradient(var(--be-rc,#4fd18b) calc(var(--be-ch,0) * 1%),rgba(255,255,255,.22) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px));mask:radial-gradient(farthest-side,transparent calc(100% - 7px),#000 calc(100% - 6px))}
body.be-on #acts>.mg-b.be-eat.on,body.be-on #acts>.mg-b.be-eat:active{transform:translateY(3px);box-shadow:0 1px 0 #a02a10,0 3px 8px rgba(0,0,0,.35);background:radial-gradient(circle at 40% 35%,#ff9a52,#e2421e 70%)}
body.be-on #acts>.mg-b.be-eat.stun{filter:grayscale(.75) brightness(.85)}
body.be-on #acts>.mg-b.be-drink{width:70px;height:70px;background:radial-gradient(circle at 40% 35%,#7cc8ff,#2a7fd0 70%);box-shadow:0 3px 0 #1a5a9a,0 5px 10px rgba(0,0,0,.3)}
body.be-on #acts>.mg-b.be-drink b{font-size:15px}
body.be-on #acts>.mg-b.be-drink.on{transform:translateY(2px)}
body.be-on #acts>.mg-b.be-drink.empty{filter:grayscale(1);opacity:.55}
body.be-on #acts>.mg-b.be-drink.hint{animation:beHint .6s infinite alternate}
@keyframes beHint{to{box-shadow:0 3px 0 #1a5a9a,0 0 0 6px rgba(124,200,255,.55)}}
body.be-on #acts kbd{color:rgba(255,255,255,.85)}
@media (max-width:760px){ #beHud{top:calc(var(--safe-t) + 116px);font-size:12px} .be-h b{font-size:13.5px} }
@media (prefers-reduced-motion: reduce){ body.be-on #acts>.mg-b.be-drink.hint{animation:none;box-shadow:0 0 0 4px rgba(124,200,255,.7)} .be-bar i{transition:none} }`;
    document.head.appendChild(st); }

  /* ---------- progress: which opponents are open (store.won is a bit per opponent beaten) ---------- */
  const wonBits = () => { const st = typeof mgSave !== 'undefined' && mgSave.store.bigeat; return (st && +st.won) || 0; };
  const isOpen = i => i <= 0 || !!(wonBits() & (1 << (i - 1)));
  window.XBigEat = {OPS, FOOD, won:wonBits, open:isOpen, get S(){ return S; }};

  /* ---------- the night-market stage ---------- */
  function build(ctx){
    const R = ctx.root, q = ctx.q;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), M('#3a302c', {roughness:.95})); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; R.add(floor);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), gxGlow('#ffb060', .22)); pool.rotation.x = -Math.PI / 2; pool.position.y = .02; R.add(pool);
    /* stalls and string lights behind, drawn flat as if lit by their own lamps */
    const st = [], glow = [], awn = ['#d7262d', '#2d8a6e', '#f08a1c', '#2d5d8a', '#c46bff'];
    for (let k = -3; k <= 3; k++){
      const x = k * 4.6, z = -6.2 - Math.abs(k) * .5, col = awn[(k + 5) % awn.length];
      tbx(st, 4.2, .9, 1.3, x, .45, z, '#a9825a'); tbx(st, 4.3, .55, .06, x, .62, z + .68, col);
      for (const sx of [-1, 1]) tbx(st, .09, 2.8, .09, x + sx * 2.05, 1.4, z + .6, '#d8d2c8');
      for (let j = 0; j < 6; j++) tbx(st, .72, .07, 1.7, x - 1.8 + j * .72, 2.8, z + .2, j % 2 ? '#f4f1ea' : col);
      for (let j = 0; j < 5; j++) tbx(st, .4, .18, .4, x - 1.5 + j * .75, 1.0, z + .1, ['#f5d7a1', '#d9534f', '#f0ad4e', '#8fce6a', '#c98a55'][(j + k + 5) % 5]);
      tbx(glow, .36, .44, .36, x - 2.05, 2.3, z + .75, '#ff5340'); tbx(glow, .36, .44, .36, x + 2.05, 2.3, z + .75, '#ff5340');
    }
    for (const sx of [-1, 1]) tbx(st, .14, 4.5, .14, sx * 3.3, 2.25, -4.45, '#5a4636');
    for (let x = -16; x <= 16; x += 1.1) tbx(glow, .2, .2, .2, x, 3.9 - Math.abs(Math.sin(x / 3.3 * Math.PI)) * .45, -4.2, ['#ffd98a', '#ffb0a0', '#bfe3ff', '#d6ffb0'][((x + 16) * 3 | 0) % 4]);
    const stm = new THREE.Mesh(geoMerge(st), new THREE.MeshBasicMaterial({color:'#bfb2a2', vertexColors:true})), glm = new THREE.Mesh(geoMerge(glow), new THREE.MeshBasicMaterial({vertexColors:true}));
    R.add(stm, glm);
    /* the banner over the table */
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.1), new THREE.MeshBasicMaterial({map:canvasTex(1024, 176, (g, w, h) => {
      g.fillStyle = '#7a1420'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd98a'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe9b0'; g.font = `900 92px ${FONT}`; g.fillText('大胃王争霸赛', w / 2, h / 2 - 12);
      g.font = `700 30px ${FONT}`; g.fillStyle = '#ffb060'; g.fillText('PASAR MALAM BELL · 谁先吃完谁赢', w / 2, h - 30);
    })}));
    sign.position.set(0, 4.1, -4.4); R.add(sign);
    /* spectators: instanced bodies and heads, they hop when someone clears a plate */
    const NC = q > 0 ? 12 : 8, has = typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined';
    const bodyG = has ? npcBodyGeo : new THREE.CylinderGeometry(.17, .2, .62, 8).translate(0, 1.17, 0), headG = has ? npcHeadGeo : new THREE.SphereGeometry(.15, 10, 8).translate(0, 1.62, 0);
    const legG = has ? npcLegGeo : new THREE.BoxGeometry(.13, .8, .15).translate(0, -.4, 0);
    S.crowd = {n:NC, b:new THREE.InstancedMesh(bodyG, M('#ffffff', {roughness:.85}), NC), h:new THREE.InstancedMesh(headG, M('#ffffff', {roughness:.7}), NC),
      l:new THREE.InstancedMesh(legG, M('#ffffff', {roughness:.85, vertexColors:has}), NC * 2), at:[]};
    const shirts = ['#e2574c', '#4aa3ff', '#58b368', '#f0a13a', '#b48be0', '#2d5d8a', '#ff8a3d', '#ecf0f1'], skins = ['#f1c9a5', '#d9a07a', '#a8714a', '#7a4a2e', '#f6d6b8'];
    for (let i = 0; i < NC; i++){
      const a = (i / (NC - 1) - .5) * 2.2, rr = 3.6 + (i % 2) * .6;
      S.crowd.at.push({x:Math.sin(a) * rr * 1.45, z:-Math.cos(a) * rr * .55 - .9, y:0, v:0, ph:Math.random() * 6, s:1.15 + (i % 3) * .06});
      S.crowd.b.setColorAt(i, _c.set(shirts[i % shirts.length])); S.crowd.h.setColorAt(i, _c.set(skins[(i * 3) % skins.length]));
      for (const j of [0, 1]) S.crowd.l.setColorAt(i * 2 + j, _c.set(['#2a3550', '#3a3a40', '#6a5a48', '#1f2a3a'][i % 4]));
    }
    S.crowd.b.castShadow = true; R.add(S.crowd.b, S.crowd.h, S.crowd.l);
    /* the table: a cloth top with a skirt that hides the legs */
    const cloth = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#e8572a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32){ g.fillStyle = '#f6c84a'; g.fillRect(x, 0, 6, h); g.fillStyle = '#b8321e'; g.fillRect(x + 14, 0, 3, h); }
      for (let y = 0; y < h; y += 32){ g.fillStyle = 'rgba(255,240,200,.35)'; g.fillRect(0, y, w, 4); }
    });
    cloth.wrapS = cloth.wrapT = THREE.RepeatWrapping; cloth.repeat.set(3, 1);
    S.table = new THREE.Group(); R.add(S.table);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, .07, 1.35), M('#ffffff', {map:cloth, roughness:.85})); top.position.y = TY - .035; top.castShadow = top.receiveShadow = true;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1, .62, 1.3), M('#c8421e', {roughness:.9})); skirt.position.y = TY - .38; skirt.castShadow = true;
    S.table.add(top, skirt);
    /* plates: one instanced mesh for every plate on the table (queue + the towers of empties), gold for the golden one */
    const NP = 40;
    S.plates = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3, .23, .045, 26), M('#ffffff', {roughness:.35}), NP); S.plates.castShadow = true; R.add(S.plates);
    for (let i = 0; i < NP; i++) S.plates.setColorAt(i, _c.set('#f4f1ea'));
    /* food: one instanced mesh per dish, all on the atlas */
    const amap = new THREE.CanvasTexture(atlas()); amap.anisotropy = ANISO;
    const fmat = M('#ffffff', {map:amap, roughness:.7});
    S.food = {}; for (const k of KEYS){ const m = new THREE.InstancedMesh(domeGeo(FOOD[k].cell), fmat, 8); m.count = 0; R.add(m); S.food[k] = m; }
    /* the golden plate's halo and a chili for the trick */
    S.halo = new THREE.Mesh(new THREE.RingGeometry(.3, .46, 28), gxGlow('#ffcf3a', .7)); S.halo.rotation.x = -Math.PI / 2; S.halo.visible = false; R.add(S.halo);
    S.chili = new THREE.Mesh(new THREE.ConeGeometry(.07, .32, 8).rotateZ(Math.PI / 2), M('#e8321e', {roughness:.4, emissive:'#5a0a00'})); S.chili.visible = false; R.add(S.chili);
  }
  /* hats so you can tell them apart (on the head slot, like the wardrobe's hats): a student's cap, a cook's cap and apron, a crown */
  function dress(a, k){
    const P = a.parts, H = P.slots && P.slots.head || P.body;
    if (k === 0){
      const blue = M('#2d5d8a', {roughness:.7});
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), blue); cap.scale.set(1, .72, 1.05); cap.position.set(0, -.07, -.01); H.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .02, 18, 1, false, -Math.PI / 2, Math.PI), blue); brim.position.set(0, -.06, .12); brim.scale.set(1, 1, 1.1); H.add(brim);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), M('#ffcf3a', {roughness:.5})); dot.position.set(0, .08, -.01); H.add(dot);
    }
    if (k === 1){
      const w = M('#fbf8f2', {roughness:.8});
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.17, .16, .2, 18), w); cap.position.set(0, .02, -.02); H.add(cap);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 10), w); puff.scale.set(1, .6, 1); puff.position.set(0, .16, -.02); H.add(puff);
      const apron = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, .5, 20, 1, true, -1.1, 2.2), M('#2d8a6e', {roughness:.8, side:THREE.DoubleSide})); apron.position.set(0, .72, 0); P.body.add(apron);
    }
    if (k === 2){
      const gold = M('#f2c440', {roughness:.45, metalness:.25, emissive:'#5a3a00', emissiveIntensity:.5});
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(.19, .16, .15, 8, 1, true), gold); crown.material.side = THREE.DoubleSide; crown.position.set(0, -.01, -.02); H.add(crown);
      const spikes = []; for (let i = 0; i < 8; i++){ const an = i / 8 * Math.PI * 2; spikes.push(new THREE.ConeGeometry(.04, .11, 6).translate(Math.sin(an) * .18, .12, -.02 + Math.cos(an) * .18)); }
      H.add(new THREE.Mesh(geoMerge(spikes), gold));
      const gem = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), M('#e8321e', {roughness:.2, emissive:'#600'})); gem.position.set(0, .0, .17); H.add(gem);
    }
  }

  /* ---------- an eater: the same rules for you and the opponent ---------- */
  function eater(me){
    return {me, i:0, p:0, base:0, tot:0, ch:0, heat:0, water:WATER, stun:0, stunK:'', drink:0, power:0, done:false, t:0, chokes:0, cries:0, drinks:0, gags:0,
      chomp:0, hand:0, ext:0, throat:1, hres:1, lastBite:-9, next:.4, slide:0, shake:0, a:null, bub:null, bubT:0, bubK:'', sbase:1, hot:0};
  }
  const dish = E => FOOD[S.menu[Math.min(E.i, S.menu.length - 1)]];
  const foe = E => E === S.me ? S.op : S.me;
  function say(E, text, sec, warn){
    if (!E.bub) return; E.bubT = sec || 1.1;
    if (E.bub.textContent !== text) E.bub.textContent = text;
    E.bub.classList.toggle('warn', !!warn); E.bub.hidden = false;
  }
  function stun(E, k, t){
    E.stun = t; E.stunK = k; E.chomp = 0; E.ext = 0; const ctx = S.ctx;
    if (k === 'choke'){
      E.chokes++; E.ch = 50;
      say(E, '咳咳…噎住了', t, E.me);
      if (E.me){ ctx.hud.callout('噎住了！', '别再点了，等它咽下去，或者喝口水', '#ff5340'); ctx.sfx.fail(); ctx.camera.shake(.35); }
      else ctx.hud.callout(S.O.name + '噎住了', '快趁现在！', '#4fd18b');
      for (let i = 0; i < 3; i++) ctx.noise(.12, E.me ? .2 : .08, 500, 'bandpass'), ctx.tone('square', 220, 160, .08, E.me ? .05 : .02, i * .18);
    } else if (k === 'hot'){
      E.cries++; E.heat = 62;
      say(E, '辣辣辣辣！', t, E.me);
      if (E.me){ ctx.hud.callout('辣哭了！', '辣条快满的时候先喝水', '#e8321e'); ctx.camera.shake(.3); }
      else ctx.hud.callout(S.O.name + '辣哭了', '快趁现在！', '#4fd18b');
      ctx.tone('sawtooth', 900, 1500, .3, E.me ? .06 : .025);
    } else if (k === 'stink'){
      E.gags++; say(E, '呕…好臭', t);
      ctx.noise(.4, .08, 300);
    } else if (k === 'scare'){
      say(E, '吓死我了！', t, true);
    }
  }
  function plateDone(E){
    const d = dish(E), ctx = S.ctx, F = foe(E), gold = E.i === S.gold;
    E.base += d.b; E.p = 0; E.i++; E.slide = 1; E.tot = E.base;
    if (E.i >= S.menu.length){ E.done = true; E.t = S.t; }
    for (const c of S.crowd.at) if (Math.random() < .5 && c.y <= 0) c.v = 2 + Math.random() * 1.6;
    if (E.me){ ctx.sfx.ding(); ctx.tone('triangle', 660 * Math.pow(1.06, E.i), 990 * Math.pow(1.06, E.i), .14, .08); }
    else ctx.tone('triangle', 330, 440, .1, .04);
    if (d.stink && !F.done){
      stun(F, 'stink', 1.6);
      if (E.me) ctx.hud.callout('榴莲攻击！', S.O.name + '被熏得停了一下', '#b6c84a'); else ctx.hud.callout('被榴莲熏到了', '等一下才能接着吃', '#b6c84a');
      if (ctx.q > 0) for (let i = 0; i < 6; i++) ctx.part('dust', F.a.x + (Math.random() - .5), 2.4 + Math.random() * .6, F.a.z + (Math.random() - .5) * .6, .5, {vy:.6, life:1.2, op:.8, color:'#b6c84a', grow:1.5});
    }
    if (gold){
      E.power = 4;
      if (E.me){ ctx.hud.callout('大胃王时间！', '4 秒内一口顶两口，不噎不辣', '#ffcf3a'); for (let i = 0; i < 4; i++) ctx.tone('square', 660 * Math.pow(1.26, i), 660 * Math.pow(1.26, i), .1, .07, i * .07); }
      else ctx.hud.callout(S.O.name + '吃到了金盘子', '4 秒双倍，跟紧！', '#ffcf3a');
    }
    if (E.me && !E.done && !gold && !d.stink) say(E, d.n + ' ✓', .7);
  }
  function bite(E){
    if (E.done || S.over) return false;
    const ctx = S.ctx;
    if (E.stun > 0){
      if (E.me && E.stunK === 'choke' && E.ext < 1.4){ E.stun += .14; E.ext += .14; ctx.tone('square', 140, 120, .05, .04); E.shake = .3; }
      return false;
    }
    if (E.drink > 0) return false;
    const d = dish(E), pw = E.power > 0;
    if (!pw){ E.ch += GAIN * E.throat * (d.ch || 1) * (1 + E.heat / 80); E.heat += (d.heat || 0) * E.hres; }
    E.heat = Math.max(0, E.heat - (d.cool || 0)); E.ch = Math.max(0, E.ch - (d.ease || 0));
    E.p += pw ? 2 : 1; E.tot = E.base + Math.min(E.p, d.b); E.chomp = 1; E.hand ^= 1; E.lastBite = S.t;
    if (E.me){
      ctx.noise(.06, .1, 600 + Math.random() * 500, 'bandpass'); ctx.tone('triangle', 300 * Math.pow(1.035, E.p), 260 * Math.pow(1.035, E.p), .05, .05);
      if (ctx.q > 0 && (E.p & 1)) ctx.part('dust', E.a.x + E.fx * .35, TY + .35, E.a.z + .25, .2, {vy:1.4, life:.35, op:.9, color:d.c});
    } else if ((E.p & 1)) ctx.noise(.05, .035, 700, 'bandpass');
    if (E.p >= d.b) plateDone(E);
    if (!E.done){
      if (E.ch >= 100) stun(E, 'choke', 1.5);
      else if (E.heat >= 100) stun(E, 'hot', 1.5);
    }
    return true;
  }
  function drink(E){
    if (E.done || S.over || E.drink > 0) return;
    const ctx = S.ctx;
    if (E.water <= 0){ if (E.me){ say(E, '没水了…', .9); ctx.tone('square', 180, 150, .1, .05); } return; }
    if (E.stunK === 'stink' || E.stunK === 'scare') return;
    E.water--; E.drinks++; E.drink = .45; E.heat = Math.max(0, E.heat - 55); E.ch = Math.max(0, E.ch - 45);
    const cured = E.stun > 0; if (cured){ E.stun = 0; E.stunK = ''; }
    if (E.me){
      for (let i = 0; i < 3; i++) ctx.tone('sine', 300 + i * 70, 220 + i * 70, .09, .07, i * .11);
      if (cured) ctx.hud.callout('咕嘟咕嘟', '冲下去了，接着吃', '#4aa3ff');
      say(E, '💧 咕嘟', .6);
    } else say(E, '💧 咕嘟', .6);
  }

  /* ---------- the opponent ---------- */
  function ai(dt){
    const A = S.op, O = S.O, P = S.me, ctx = S.ctx;
    if (A.done || S.over) return;
    if (A.stun > .5 && (A.stunK === 'choke' || A.stunK === 'hot') && A.water > 0 && O.careful && Math.random() < dt * 1.2) drink(A);
    if (A.heat >= O.drinkAt && A.water > 0 && A.stun <= 0 && A.drink <= 0) drink(A);
    /* burps: a short pause and a chance for you */
    if ((S.burpT -= dt) <= 0 && A.stun <= 0 && A.drink <= 0){
      S.burpT = O.burp[0] + Math.random() * (O.burp[1] - O.burp[0]); A.stun = .75; A.stunK = 'burp'; say(A, '嗝～', .9);
      ctx.tone('sawtooth', 130, 70, .3, .07); ctx.noise(.25, .05, 250);
    }
    /* tricks, always announced first */
    if (S.tele){
      S.tele.t -= dt;
      if (S.tele.t <= 0){ const k = S.tele.k; S.tele = null; trick(k); }
    } else if (O.tricks.length && (S.trickT -= dt) <= 0 && A.stun <= 0 && !P.done){
      S.trickT = O.gap[0] + Math.random() * (O.gap[1] - O.gap[0]);
      const k = O.tricks[(Math.random() * O.tricks.length) | 0];
      S.tele = {k, t:k === 'slam' ? 1.05 : 1.2, T:k === 'slam' ? 1.05 : 1.2};
      if (k === 'chili'){ say(A, '嘿嘿… 🌶', 1.2, true); ctx.tone('square', 520, 620, .1, .05); ctx.tone('square', 620, 520, .1, .05, .12); }
      else { say(A, '✋ 要拍桌了！', 1.05, true); ctx.tone('sawtooth', 200, 420, .9, .04); }
    }
    if (S.tele) return;
    /* rubber band: a bit easier when far ahead, a bit harder when behind; the legend opens a second stomach once */
    const diff = A.tot - P.tot;
    let rate = O.rate * (diff > 14 ? .9 : diff < -14 ? 1.07 : 1);
    if (O.second && !S.second && diff < -22 && P.i < S.menu.length - 1){ S.second = true; ctx.hud.callout('第二个胃！', S.O.who + '吃得更快了', '#b48cff'); say(A, '我还有一个胃', 1.4); }
    if (S.second) rate *= 1.14;
    if (A.stun > 0 || A.drink > 0) return;
    if (O.careful && A.ch > O.careful && A.power <= 0){ A.next = Math.max(A.next, .08); }
    if ((A.next -= dt) <= 0){ bite(A); A.next = (1 / rate) * (.72 + Math.random() * .56); }
  }
  function trick(k){
    const P = S.me, A = S.op, ctx = S.ctx;
    if (k === 'chili'){
      if (P.done) return;
      P.heat = Math.min(99, P.heat + 32); S.chiliT = .7;
      ctx.hud.callout('被撒了辣椒！', P.heat > 70 ? '快喝水！' : '辣条涨了一大截', '#e8321e'); ctx.noise(.4, .12, 3000, 'highpass');
      if (ctx.q > 0) for (let i = 0; i < 8; i++) ctx.part('dust', P.a.x + P.fx * .55 + (Math.random() - .5) * .4, TY + .2, .2 + (Math.random() - .5) * .4, .18, {vy:1.2, life:.6, op:1, color:'#e8321e'});
    } else {
      S.slamT = .45; ctx.camera.shake(.55); ctx.sfx.thud(.8); A.chomp = 0;
      if (S.t - P.lastBite < .32 && !P.done){
        stun(P, 'scare', .5); P.ch = Math.min(99, P.ch + 55);
        ctx.hud.callout('被吓了一跳！', '他举手的时候要停手', '#e8321e');
      } else if (!P.done){
        ctx.hud.callout('稳住了！', S.O.who + '拍疼了手', '#4fd18b'); A.stun = .8; A.stunK = 'ouch'; say(A, '哎哟', .8);
      }
    }
  }

  /* ---------- drawing: layout depends on the screen shape ---------- */
  function layout(ctx){
    const por = ctx.aspect < 1;
    if (S.por === por) return;
    S.por = por; S.span = por ? 1.05 : 2.05;
    S.vis = Math.max(0, Math.min(3, Math.floor((S.span - .62 - .3) / .6)));
    S.table.scale.x = S.span * 2 + .6;
    /* the eaters stand back from the ends far enough that their bellies (they lean in, turned toward the camera) stay off the table */
    S.me.a.x = -S.span - .8; S.op.a.x = S.span + .8; S.me.a.z = S.op.a.z = .05;
    S.me.fx = 1; S.op.fx = -1;
    const vf = 46, tv = Math.tan(vf / 2 * Math.PI / 180), hw = S.span + (por ? 1.5 : 1.75), dist = Math.max(6.2, hw / (tv * ctx.aspect));
    ctx.camera.set([0, 1.6 + dist * .26, dist], [0, por ? 2.05 : 1.25, 0], vf); ctx.camera.snap();
  }
  function setInst(m, i, x, y, z, sx, sy, sz, ry){ _p.set(x, y, z); _e.set(0, ry || 0, 0); _q.setFromEuler(_e); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); }
  function drawTable(dt){
    const pl = S.plates; let np = 0;
    for (const k of KEYS) S.food[k].count = 0;
    let halo = false;
    for (const E of [S.me, S.op]){
      const sx = -E.fx, x0 = sx * (S.span - .62), z0 = .2;
      E.slide = Math.max(0, E.slide - dt * 5);
      /* the queue: current plate in front, the next few lined up toward the middle */
      for (let k = 0; k <= S.vis; k++){
        const i = E.i + k; if (i >= S.menu.length) break;
        const x = x0 - sx * .6 * (k + E.slide), d = FOOD[S.menu[i]], left = k ? 1 : Math.max(0, 1 - E.p / d.b);
        const y = TY + .025 + (k === 0 && S.slamT > 0 ? Math.sin(S.slamT * 20) * .04 : 0);
        setInst(pl, np, x, y, z0, 1, 1, 1); pl.setColorAt(np, _c.set(i === S.gold ? '#ffcf3a' : '#f4f1ea')); np++;
        if (i === S.gold && !halo){ halo = true; S.halo.position.set(x, TY + .006, z0); }
        const f = S.food[S.menu[i]], s = .24 * Math.sqrt(.25 + .75 * left), h = d.h * (.35 + .65 * left);
        if (left > 0) setInst(f, f.count++, x, y + .02, z0, s, s * h, s, (i * 1.7) % 6);
      }
      /* the tower of empties at the end of the table */
      const n = Math.min(E.i, 16);
      for (let k = 0; k < n; k++){ setInst(pl, np, sx * (S.span - .1) + Math.sin(k * 2.1) * .015, TY + .025 + k * .048, -.45, .92, 1, .92, k); pl.setColorAt(np, _c.set(k + 1 === n && E.slide > 0 ? '#fff6d8' : '#ece7dc')); np++; }
    }
    pl.count = np; pl.instanceMatrix.needsUpdate = true; if (pl.instanceColor) pl.instanceColor.needsUpdate = true;
    for (const k of KEYS){ const f = S.food[k]; f.visible = f.count > 0; f.instanceMatrix.needsUpdate = true; }
    S.halo.visible = halo; if (halo) S.halo.material.opacity = .45 + Math.sin(S.t * 6) * .25;
    /* the chili flies across */
    if (S.chiliT > 0){ S.chiliT -= dt; const u = 1 - Math.max(0, S.chiliT) / .7; S.chili.visible = S.chiliT > 0; S.chili.position.set(S.op.a.x - .6 + (S.me.a.x + .9 - S.op.a.x + .6) * u, TY + .3 + Math.sin(u * Math.PI) * .9, .1); S.chili.rotation.z = u * 9; }
    if (S.slamT > 0) S.slamT -= dt;
  }
  function drawCrowd(dt){
    const C = S.crowd, cheer = S.over ? 1 : 0;
    for (let i = 0; i < C.n; i++){
      const c = C.at[i];
      if (c.y > 0 || c.v > 0){ c.v -= 14 * dt; c.y = Math.max(0, c.y + c.v * dt); if (c.y <= 0) c.v = 0; }
      if (cheer && c.y <= 0 && Math.random() < dt * 3) c.v = 2.4 + Math.random() * 1.5;
      const sway = Math.sin(S.t * 2 + c.ph) * .05;
      const ry = Math.atan2(-c.x, -c.z) + Math.PI + sway, cs = Math.cos(ry), sn = Math.sin(ry);
      setInst(C.b, i, c.x, c.y, c.z, c.s, c.s, c.s, ry); setInst(C.h, i, c.x, c.y, c.z, c.s, c.s, c.s, ry);
      for (const j of [-1, 1]){ const lx = j * .09 * c.s; setInst(C.l, i * 2 + (j > 0 ? 1 : 0), c.x + cs * lx, c.y + .86 * c.s, c.z - sn * lx, c.s, c.s, c.s, ry); }
    }
    C.b.instanceMatrix.needsUpdate = C.h.instanceMatrix.needsUpdate = C.l.instanceMatrix.needsUpdate = true;
  }
  /* 奶娃 poses, driven straight off the parts (so a reshaped look from the wardrobe still animates) */
  function pose(E, dt){
    const a = E.a, P = a.parts, [aL, aR] = P.arms, [eL, eR] = P.elbows, T = S.t;
    E.chomp = Math.max(0, E.chomp - dt * 7); const c = E.chomp, ch = c * c * (3 - 2 * c);
    const facing = E.fx > 0 ? Math.PI / 2 - .8 : -Math.PI / 2 + .8;
    let lean = .14 + ch * .2, roll = 0, jump = 0, aLx = -.5, aLz = .3, aRx = -.5, aRz = -.3, eLx = -1.3, eRx = -1.3, mouth = .02 + ch * .09, tint = null, tk = 0;
    if (E.hand) { aRx = -.6 - ch * 1.25; aRz = -.15; eRx = -1.3 - ch * .9; } else { aLx = -.6 - ch * 1.25; aLz = .15; eLx = -1.3 - ch * .9; }
    const won = S.over && S.win === E, lost = S.over && S.win && S.win !== E;
    if (won){ aLx = aRx = -.2; aLz = 2.5; aRz = -2.5; eLx = eRx = -.3; lean = -.05; jump = Math.abs(Math.sin(T * 7)) * .25; mouth = .1; }
    else if (lost){ lean = -.22; aLz = .5; aRz = -.5; mouth = .05; }
    else if (E.stun > 0){
      if (E.stunK === 'choke'){ roll = Math.sin(T * 38) * .07; aLx = aRx = -1.6; aLz = .7; aRz = -.7; eLx = eRx = -1.9; lean = .05; mouth = .07; tint = '#7a2ad0'; tk = .35; }
      else if (E.stunK === 'hot'){ jump = Math.abs(Math.sin(T * 14)) * .14; aLx = aRx = -.3; aLz = 1.4 + Math.sin(T * 20) * .4; aRz = -aLz; mouth = .1; tint = '#ff2a10'; tk = .45; if (S.ctx.q > 0 && Math.random() < dt * 14) S.ctx.part('dust', a.x, 2.75, a.z, .25, {vy:2, life:.5, op:.7, color:'#ffffff'}); }
      else if (E.stunK === 'stink'){ lean = -.25; aLx = aRx = -1.4; eLx = eRx = -2.2; aLz = .2; aRz = -.2; tint = '#6aa020'; tk = .4; mouth = .04; }
      else if (E.stunK === 'burp'){ lean = -.12; mouth = .1; }
      else if (E.stunK === 'scare'){ jump = .15; aLz = 1.6; aRz = -1.6; mouth = .1; }
      else if (E.stunK === 'ouch'){ aRx = -.3; aRz = -1.2 + Math.sin(T * 30) * .3; mouth = .06; }
    } else if (E.drink > 0){ lean = -.2; aRx = -2.3; eRx = -1.5; aRz = -.1; mouth = .03; }
    else if (!E.me && S.tele){
      if (S.tele.k === 'slam'){ const u = 1 - S.tele.t / S.tele.T; aRx = aLx = -2.4 * Math.min(1, u * 2); aRz = -.3; aLz = .3; eLx = eRx = -.4; lean = -.1; }
      else { aRx = -1.1; aRz = -.9; eRx = -.5; lean = .05; }
    } else if (E.power > 0){ tint = '#ffcf3a'; tk = .25 + Math.sin(T * 12) * .1; }
    else if (E.heat > 60){ tint = '#ff3a20'; tk = (E.heat - 60) / 40 * .3; }
    if (S.slamT > 0 && !E.me){ aLx = aRx = -.9; eLx = eRx = -.3; lean = .3; }
    const k = Math.min(1, dt * 18);
    aL.rotation.x += (aLx - aL.rotation.x) * k; aL.rotation.z += (aLz - aL.rotation.z) * k; aR.rotation.x += (aRx - aR.rotation.x) * k; aR.rotation.z += (aRz - aR.rotation.z) * k;
    eL.rotation.x += (eLx - eL.rotation.x) * k; eR.rotation.x += (eRx - eR.rotation.x) * k;
    P.body.rotation.x += (lean - P.body.rotation.x) * k; P.body.rotation.z = roll + (E.shake > 0 ? Math.sin(T * 50) * .05 : 0);
    if (E.shake > 0) E.shake -= dt;
    /* the belly fills up as the plates go */
    const full = E.tot / S.total, bs = E.sbase * (1 + full * .16);
    P.body.scale.set(bs * (1 + ch * .03), E.sbase * (1 - ch * .04), bs * (1 + ch * .03));
    if (P.mouth) P.mouth.scale.y += (mouth - P.mouth.scale.y) * k;
    const sk = P.mats.skin; if (tint){ sk.emissive.set(tint); sk.emissiveIntensity = tk; E.hot = 1; } else if (E.hot){ sk.emissive.set(E.glow || '#000000'); sk.emissiveIntensity = E.glowI || 1; E.hot = 0; }
    a.obj.position.set(a.x, jump, a.z); a.obj.rotation.y = facing;
  }

  /* ---------- HUD ---------- */
  function card(cls, name, color){
    const el = document.createElement('div'); el.className = 'be-card ' + cls; el.style.setProperty('--c', color);
    el.innerHTML = '<div class="be-h"><b></b><span><em>0</em> / 0 盘</span></div><div class="be-bar"><i></i></div><div class="be-row"><i class="be-ic"></i><span class="be-dn"></span><i class="be-ic n"></i><i class="be-ic n"></i></div><div class="be-st"><span>🌶</span><span class="be-heat"><i></i></span><span class="be-w"></span></div>';
    el.querySelector('b').textContent = name;
    const ics = el.querySelectorAll('.be-ic'); for (const ic of ics) if (ATLAS_URL) ic.style.backgroundImage = `url(${ATLAS_URL})`;
    return {el, n:el.querySelector('em'), of:el.querySelector('.be-h span'), bar:el.querySelector('.be-bar i'), ics, dn:el.querySelector('.be-dn'), heat:el.querySelector('.be-heat i'), w:el.querySelector('.be-w'), key:''};
  }
  const icAt = (ic, k, gold) => {
    if (!k){ ic.style.visibility = 'hidden'; return; }
    const c = FOOD[k].cell; ic.style.visibility = ''; ic.style.backgroundPosition = `${(c % 4) / 3 * 100}% ${((c / 4) | 0) * 100}%`; ic.classList.toggle('gold', !!gold);
  };
  function hudCard(E, C){
    const tot = S.menu.length, key = E.i + '|' + tot;
    if (C.key !== key){
      C.key = key; C.of.firstChild.textContent = Math.min(E.i, tot); C.of.lastChild.textContent = ` / ${tot} 盘`;
      for (let k = 0; k < 3; k++){ const i = E.i + k; icAt(C.ics[k], i < tot ? S.menu[i] : null, i === S.gold); }
      const d = E.i < tot ? FOOD[S.menu[E.i]] : null;
      C.dn.innerHTML = ''; C.dn.textContent = d ? d.n : '吃完了！'; if (d && (d.tag || E.i === S.gold)){ const s = document.createElement('small'); s.textContent = E.i === S.gold ? '金盘子' : d.tag; C.dn.append(s); }
    }
    const w = (E.tot / S.total * 100).toFixed(1) + '%'; if (C.bar.style.width !== w) C.bar.style.width = w;
    const h = Math.min(100, E.heat).toFixed(0) + '%'; if (C.heat.style.width !== h) C.heat.style.width = h;
    const wt = '💧'.repeat(E.water) || '没水'; if (C.w.textContent !== wt) C.w.textContent = wt;
  }
  function hudButtons(){
    const P = S.me, B = S.btnA, D = S.btnB;
    if (B){
      const v = Math.round(Math.min(100, P.stun > 0 && P.stunK === 'choke' ? 100 : P.ch));
      if (S.lastCh !== v){ S.lastCh = v; B.style.setProperty('--be-ch', v); B.style.setProperty('--be-rc', P.power > 0 ? '#ffcf3a' : v > 78 ? '#e8321e' : v > 55 ? '#ffb03a' : '#4fd18b'); }
      B.classList.toggle('stun', P.stun > 0 || P.drink > 0);
    }
    if (D){
      const lbl = '喝水 ' + P.water; if (S.lastW !== lbl){ S.lastW = lbl; S.ctx.input.label('b', lbl); }
      D.classList.toggle('empty', P.water <= 0); D.classList.toggle('hint', P.water > 0 && (P.heat > 68 || (P.stun > .4 && (P.stunK === 'choke' || P.stunK === 'hot'))));
    }
  }
  function bubbles(dt, ctx){
    for (const E of [S.me, S.op]){
      if (!E.bub || E.bub.hidden) continue;
      E.bubT -= dt; if (E.bubT <= 0){ E.bub.hidden = true; continue; }
      const [x, y] = ctx.screen(E.a.x, 2.75, E.a.z); E.bub.style.transform = `translate(${x | 0}px,${y | 0}px) translate(-50%,-100%)`;
    }
  }

  /* ---------- the end of a round ---------- */
  function end(win){
    if (S.over) return;
    const ctx = S.ctx; S.over = true; S.win = win ? S.me : S.op;
    if (win){ ctx.hud.callout('吃赢了！', S.O.name + '甘拜下风', '#4fd18b'); for (let i = 0; i < 5; i++) ctx.tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .16, .1, i * .08); }
    else { ctx.hud.callout(S.op.done ? S.O.name + '先吃完了' : '时间到', '下次再来', '#e8321e'); ctx.sfx.fail(); }
    ctx.hud.hint('');
    ctx.after(1.8, () => result(win));
  }
  function result(win){
    const ctx = S.ctx, P = S.me, O = S.O, idx = OPS.indexOf(O);
    const stat = `吃了 ${P.i} / ${S.menu.length} 盘 · 噎住 ${P.chokes} 次 · 辣哭 ${P.cries} 次 · 喝水 ${P.drinks} 杯`;
    if (!win){
      ctx.earn(3);
      const gap = Math.max(1, S.op.i - P.i);
      ctx.finish(null, {kicker:'输了', title:S.op.done ? `${O.who}先吃完了` : '时间到，吃得比对手少', big:S.op.done ? `差 ${gap} 盘` : `差 ${Math.max(1, S.op.tot - P.tot)} 口`, sub:stat + ' · ' + O.line});
      return;
    }
    const t = Math.min(TIME, P.done ? P.t : TIME), score = Math.round(t * 10);
    const won = +ctx.store.get('won') || 0, first = !(won & (1 << idx));
    ctx.store.set('won', won | (1 << idx));
    if (idx === 2) ctx.unlock('mg_bigeat_king');
    if (!P.chokes && !P.cries) ctx.unlock('mg_bigeat_cool');
    let note = '';
    if (first){
      note = idx < OPS.length - 1 ? ` · 解锁下一位对手：${OPS[idx + 1].name}` : ' · 你就是夜市新的大胃王';
    }
    ctx.finish(score, {kicker:'赢了', title:'吃赢了' + O.name, sub:stat + note});
  }

  return {
    id:'bigeat', name:'大胃王争霸赛', icon:'🍢', color:'#ff6a3d',
    parts:'bell',                  // 改装零件掉落表：js/42-tuning.js 的 TN_DROPS.bell，按奖牌发，结算面板显示（js/93-tuning-ui.js）
    desc:'夜市长桌上和对手比吃：狂点吃，别噎着，辣了喝水',
    intro:RULES,
    controls:{a:'吃', b:'喝水', tap:true, help:{touch:'狂点右下「吃」（点画面也算）· 蓝色「喝水」解辣、解噎', key:'狂点鼠标左键或空格：吃 · 右键或 K：喝水 · P 暂停'}},
    board:{fmt:v => (v / 10).toFixed(1) + ' 秒', lower:true, max:600},
    medals:[200, 240, 600],
    sky:'#170f22', shadow:9,
    achievements:[['mg_bigeat_king', '夜市大胃王', '大胃王争霸赛赢下传说中的大胃王', 100], ['mg_bigeat_cool', '面不改色', '大胃王争霸赛赢一局，一次都没噎住、没辣哭', 40]],
    modes:OPS.map((o, i) => ({id:o.id, name:o.name, desc:`对手：${o.who}`, medals:o.medals,
      intro:o.intro + RULES + ' ' + o.line + (i ? `（先赢下${OPS[i - 1].name}才能挑战。）` : '') + ' 赢了就有铜牌，吃得越快奖牌越好。',
      reward:(s, md) => md < 3 ? Math.round([30, 18, 10][md] * o.mult) : 0, op:o})),
    start(ctx){
      const O = ctx.modeDef && ctx.modeDef.op || OPS[0], idx = OPS.indexOf(O);
      S = {ctx, O, t:0, menu:O.menu.slice(), gold:0, total:0, over:false, win:null, por:null, span:2, vis:2, tele:null, trickT:O.gap[0] * .8, burpT:O.burp[0] * .7, second:false, chiliT:0, slamT:0,
        me:eater(true), op:eater(false), hintT:0, lastCh:-1, lastW:'', locked:false, warnT:0};
      S.gold = 2 + ((Math.random() * (S.menu.length - 4)) | 0);
      S.total = S.menu.reduce((s, k) => s + FOOD[k].b, 0);
      atlas(); build(ctx);
      /* you (dressed in your wardrobe look) and the opponent */
      S.op.throat = O.throat; S.op.hres = O.hres;
      S.me.a = ctx.actor({}); S.op.a = ctx.actor({color:O.skin, belly:O.belly});
      if (typeof nwDress === 'function' && typeof wardSave !== 'undefined'){ try { nwDress(S.me.a.parts, wardSave.look); } catch(e){ console.warn(e); } }
      dress(S.op.a, idx);
      for (const E of [S.me, S.op]){ E.sbase = E.a.parts.body.scale.x || 1; const sk = E.a.parts.mats.skin; E.glow = '#' + sk.emissive.getHexString(); E.glowI = sk.emissiveIntensity; }
      layout(ctx);
      /* HUD */
      const hud = document.createElement('div'); hud.id = 'beHud'; S.hud = hud; S.topT = 0;
      S.cMe = card('me', '你', '#ff6a3d'); S.cOp = card('op', O.name, O.skin); hud.append(S.cMe.el, S.cOp.el); ctx.ui.append(hud);
      for (const E of [S.me, S.op]){ E.bub = document.createElement('div'); E.bub.className = 'be-bub'; E.bub.hidden = true; ctx.ui.append(E.bub); }
      S.btnA = typeof mgBtnA !== 'undefined' ? mgBtnA : null; S.btnB = typeof mgBtnB !== 'undefined' ? mgBtnB : null;
      if (S.btnA) S.btnA.classList.add('be-eat'); if (S.btnB) S.btnB.classList.add('be-drink');
      document.body.classList.add('be-on');
      /* right click drinks (and must not also count as a bite) */
      ctx.on(canvas, 'pointerdown', e => { if (e.button === 2){ e.stopImmediatePropagation(); if (S && !S.locked) S.wantDrink = true; } }, true);
      ctx.on(canvas, 'contextmenu', e => e.preventDefault());
      if (!isOpen(idx)){
        S.locked = true;
        const box_ = document.createElement('div'); box_.className = 'be-lock';
        box_.innerHTML = '<b></b><p></p><button type="button" class="btn primary">好</button>';
        box_.querySelector('b').textContent = '🔒 ' + O.name + '还没解锁';
        box_.querySelector('p').textContent = `先吃赢${OPS[idx - 1].name}，${O.who}才肯和你比。`;
        box_.querySelector('button').addEventListener('click', () => ctx.quit());
        ctx.ui.append(box_);
      }
      drawTable(0); drawCrowd(0); pose(S.me, 0); pose(S.op, 0);
      ctx.hud.time(TIME); ctx.hud.score('0:0');
      if (!S.locked) ctx.hud.hint(ctx.touch ? '狂点「吃」· 外圈变红就慢一点' : '狂点鼠标左键或空格 · 外圈变红就慢一点');
      hudCard(S.me, S.cMe); hudCard(S.op, S.cOp); hudButtons();
      ctx.debug(S);
    },
    update(dt, ctx){
      if (S.locked){ if (ctx.input.pressed('a')) ctx.quit(); return; }
      layout(ctx);
      const P = S.me, A = S.op;
      if (!S.over) S.t += dt;
      /* input */
      if (!S.over){
        if (ctx.input.pressed('b') || S.wantDrink) drink(P);
        else if (ctx.input.pressed('a')) bite(P);
      }
      S.wantDrink = false;
      ai(dt);
      for (const E of [P, A]){
        if (E.stun > 0){ E.stun -= dt; if (E.stun <= 0){ E.stun = 0; E.stunK = ''; } }
        else E.ch = Math.max(0, E.ch - DRAIN * dt);
        E.heat = Math.max(0, E.heat - COOL * dt); E.drink = Math.max(0, E.drink - dt); E.power = Math.max(0, E.power - dt);
      }
      /* warnings */
      if (!S.over){
        if (P.ch > 80 && P.stun <= 0 && (S.warnT -= dt) <= 0){ S.warnT = .45; ctx.tone('sine', 180, 140, .12, .05); }
        if ((S.hintT -= dt) <= 0){
          S.hintT = .5;
          const h = P.heat > 70 && P.water > 0 ? (ctx.touch ? '太辣了，点「喝水」' : '太辣了，右键或 K 喝水') : S.tele && S.tele.k === 'slam' ? '他要拍桌了，先停手！' : P.ch > 80 ? '喉咙快满了，慢一点' : S.t < 5 ? (ctx.touch ? '狂点「吃」· 外圈变红就慢一点' : '狂点鼠标左键或空格 · 外圈变红就慢一点') : '';
          ctx.hud.hint(h);
        }
        if (P.done || A.done) end(P.done && (!A.done || P.t <= A.t));
        else if (S.t >= TIME) end(P.tot > A.tot);
      }
      ctx.hud.time(TIME - S.t);
      ctx.hud.score(P.i + ':' + A.i);
      if ((S.topT -= dt) <= 0){ S.topT = .5; const h = document.getElementById('mgHud'); if (h){ const y = Math.round(h.getBoundingClientRect().bottom + 6) + 'px'; if (S.hud.style.top !== y) S.hud.style.top = y; } }
      drawTable(dt); drawCrowd(dt); pose(P, dt); pose(A, dt);
      hudCard(P, S.cMe); hudCard(A, S.cOp); hudButtons(); bubbles(dt, ctx);
    },
    stop(){
      document.body.classList.remove('be-on');
      if (S){ if (S.btnA) S.btnA.classList.remove('be-eat', 'stun'); if (S.btnB) S.btnB.classList.remove('be-drink', 'empty', 'hint'); }
      S = null;
    }
  };
})());
