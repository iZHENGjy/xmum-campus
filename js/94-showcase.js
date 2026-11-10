/* XMUM 校园漫游 · 豪车展台：陈华春音乐厅（Tan Hua Choon Auditorium）门前扩出一片石砖广场，一排旋转展台常年停着玩家最贵的车。
   - 每个展台停一辆车，带完整的喷漆、贴花和改装外观；前面立牌写车主昵称、车型和整车价值。越豪华越靠中间、越靠前：
     第 1 名在前排正中（台子最大最高），2~5 名往两边排开，6~9 名在后排更高的台子上。
   - 豪华程度 = 车价 + 这辆车的改装价值 + 车上的喷漆和贴花。改装价值优先用 tuneCarValue(kind)（改装系统提供的话），
     没有就按 js/42-tuning.js 的 tnWorth 把这辆车造好的零件加起来。
   - 联机：自己最贵的那辆车写到 /showcase/{uid} = {name, car, look, value, ts}（规则在 database.rules.json：只能写自己的，
     名字必须是 users/{uid}/name 里注册的昵称，大小有限），读的时候按 value 取前几名。没注册昵称的不上传，但自己这边照样参与排位。
   - 离线或预览版：自己的车和几辆「示范」车一起排位；联机时示范车只用来填空位，永远排在真实玩家后面。
   - 走近展台按 F（手机点「看车」）看详情：车型、车主、价值构成、改装清单。自己的车上了前排有提示和成就。
   - 性能：台子、灯带、光柱、地面光斑全部实例化（每样一个 draw call），立牌共用一张贴图合成一个网格；展车是车行的低模，
     离远了隐藏细节件，再远整片不画。流畅档只摆前排 5 辆、没有光柱，标准 7 辆，高清 9 辆。
   位置全在下面几个常量里：广场中心、朝向（本地 +z 朝外，对着马路）、大小；合并音乐厅新模型以后只改这里就能挪。 */
'use strict';
const SC_X = -75, SC_Z = 185, SC_ROT = .165;      /* 广场中心（世界坐标）和朝向：跟门前的棕榈步道平行，正面朝南边的马路 */
const SC_HW = 21, SC_HD = 10.5;                    /* 半宽、半深（米） */
/* 展台，按名次排：[本地 x, 本地 z, 半径, 台高] */
const SC_SLOTS = [
  [0, 2.6, 3.5, .8],
  [8.2, 2, 3.2, .55], [-8.2, 2, 3.2, .55], [16.2, .4, 3.2, .55], [-16.2, .4, 3.2, .55],
  [4.2, -5.7, 3.2, 1.05], [-4.2, -5.7, 3.2, 1.05], [12.4, -6.3, 3.2, 1.05], [-12.4, -6.3, 3.2, 1.05]
];
const SC_FRONT = 5;                                /* 前排几个（成就算前排） */
const SC_KEY = 'xmum-showcase-v1', SC_LOOK_RE = /^[a-z0-9_,]{0,60}$/, SC_MAX = 1e6;
const scW = (lx, lz) => [SC_X + lx * Math.cos(SC_ROT) + lz * Math.sin(SC_ROT), SC_Z - lx * Math.sin(SC_ROT) + lz * Math.cos(SC_ROT)];
const scFmt = v => 'RM ' + Math.round(+v || 0).toLocaleString();
const scShop = k => (typeof SHOP !== 'undefined' && SHOP.find(s => s.kind === k)) || null;
const scCarName = k => (scShop(k) || {}).name || (CAR_T[k] || {}).name || k;
const scEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

/* ---------- 价值 ---------- */
/* look 字符串：喷漆 id、d_贴花、tk 改装段（js/42-tuning.js tnToken），逗号分开，跟 /looks 一个格式 */
function scParse(look){
  const ids = String(look || '').split(','), p = ids.find(x => typeof WD_PAINT !== 'undefined' && WD_PAINT[x] && x !== 'stock'), d = ids.find(x => /^d_/.test(x) && WD_DECAL[x.slice(2)]);
  return {paint:p || 'stock', decal:d ? d.slice(2) : 'none', fit:tnFromToken(look) || tnFit(null)};
}
function scLook(paint, decal, fit){ return [paint !== 'stock' && paint, decal !== 'none' && 'd_' + decal, tnToken(fit)].filter(Boolean).join(','); }
const scPaintRM = (paint, decal) => ((WD_PAINT[paint] || {}).price || 0) + ((WD_DECAL[decal] || {}).price || 0);
const scFitRM = fit => TN_SLOTS.reduce((s, sl) => { const it = TN.byKey[sl.id + '.' + fit[sl.id]]; return s + (it ? tnWorth(it) : 0); }, 0);
/* 一辆自己的车的改装价值：改装系统有 tuneCarValue 就用它，没有就把这辆车造好的零件按 tnWorth 加起来 */
function scModsRM(kind){
  if (typeof tuneCarValue === 'function'){ try { const v = +tuneCarValue(kind); if (isFinite(v) && v >= 0) return v; } catch(e){} }
  const c = typeof tune !== 'undefined' && tune.cars && tune.cars[kind]; if (!c) return 0;
  return c.own.reduce((s, k) => s + (TN.byKey[k] ? tnWorth(TN.byKey[k]) : 0), 0);
}
/* what is fitted on one of my cars (read only: tnCar() would add an empty entry to the tuning save) */
const scFitOf = kind => tnFit(typeof tune !== 'undefined' && tune.cars && tune.cars[kind] ? tune.cars[kind].fit : null);
/* 自己最贵的那辆：{kind, look, value, price, mods, paintRM} */
function scMine(){
  if (typeof owned === 'undefined') return null;
  let best = null;
  for (const kind of owned){
    if (!scShop(kind) || !TN_KINDS.includes(kind)) continue;
    const w = (typeof wardSave !== 'undefined' && wardSave.cars[kind]) || {p:'stock', d:'none'};
    const fit = scFitOf(kind);
    const price = scShop(kind).price, mods = scModsRM(kind), paintRM = scPaintRM(w.p, w.d), value = price + mods + paintRM;
    if (!best || value > best.value || (value === best.value && price > best.price)) best = {kind, look:scLook(w.p, w.d, fit), value, price, mods, paintRM};
  }
  return best;
}

/* ---------- 示范车：离线时陪你排位，联机时只填空位 ---------- */
const SC_DEMOS = [
  {name:'金色传说', kind:'rr', paint:'gilt', decal:'none', fit:{rim:'dish', rimc:'gold', size:'s1', low:'l1', drl:'bar', exh:'dual'}},
  {name:'星空夜跑', kind:'lambo', paint:'obsid', decal:'galaxy', fit:{rim:'glow', size:'s2', wide:'wide', lip:'canard', skirt:'skirt', diff:'diff', hood:'scoop', aero:'carbon', wing:'swan', neon:'kit', neonc:'purple', drl:'fang', exh:'quad', low:'l2', camber:'c3'}},
  {name:'赛道日', kind:'p911', paint:'pearlw', decal:'stripes', fit:{rim:'forged', rimc:'black', lip:'canard', wing:'gt', aero:'carbon', low:'l2', camber:'c3', exh:'quad'}},
  {name:'霓虹之夜', kind:'mase', paint:'mpurp', decal:'none', fit:{rim:'turbine', rimc:'gun', neon:'kit', neonc:'pink', drl:'quad', skirt:'skirt', low:'l1'}},
  {name:'火焰小钢炮', kind:'myvi', paint:'tomato', decal:'flames', fit:{rim:'mesh', rimc:'black', lip:'lip', wing:'duck', exh:'dual'}},
  {name:'西瓜冰', kind:'myvi', paint:'stock', decal:'melon', fit:{rim:'mesh', rimc:'white'}},
  {name:'老板座驾', kind:'rr', paint:'stock', decal:'none', fit:{rimc:'black', drl:'bar'}},
  {name:'蓝调 GT', kind:'mase', paint:'mblue', decal:'none', fit:{rimc:'gun', low:'l1'}},
  {name:'奶娃 07', kind:'p911', paint:'naiwa', decal:'xmum', fit:{}}
].map((d, i) => {
  const fit = tnFit(d.fit), price = scShop(d.kind).price, mods = scFitRM(fit), paintRM = scPaintRM(d.paint, d.decal);
  return {uid:'demo' + i, name:d.name, kind:d.kind, look:scLook(d.paint, d.decal, fit), value:price + mods + paintRM, price, mods, paintRM, demo:true};
});

/* ---------- state ---------- */
const SCX = {
  remote:null,          /* 联机读到的前几名（不含自己），null = 还没读到 / 离线 */
  list:[],              /* 现在台子上的：按名次，空位是 null */
  n:SC_SLOTS.length, k:-1, vis:true, fine:true, mode:'',
  near:-1, prompt:'', fLbl:false, open:-1,
  mineKey:'', fetchT:0, pushT:0, sent:'', warned:false,
  save:{best:0, kind:''}
};
try { const d = JSON.parse(localStorage.getItem(SC_KEY) || 'null'); if (d) SCX.save = {best:Math.max(0, d.best | 0), kind:String(d.kind || '')}; } catch(e){}
const scWrite = () => { try { localStorage.setItem(SC_KEY, JSON.stringify(SCX.save)); } catch(e){} };

/* ---------- the plaza ---------- */
const scRoot = new THREE.Group(); scRoot.position.set(SC_X, 0, SC_Z); scRoot.rotation.y = SC_ROT; scene.add(scRoot);
const scTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
function scRound(hw, hd, r){
  const s = new THREE.Shape(); s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r); s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd); return s;
}
/* light-grey granite setts like the real forecourt: 8 x 8 stones per tile, every one a slightly different grey */
const scSetts = scTex(256, 256, (g, w) => {
  const rr = mkRng(2024); g.fillStyle = '#55524d'; g.fillRect(0, 0, w, w);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const v = 118 + rr() * 42 | 0, o = (y % 2) * 16; g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    g.fillRect((x * 32 + o + 2) % w, y * 32 + 2, 28, 28); if (o && x === 7) g.fillRect(0, y * 32 + 2, 14, 28);
  }
});
scSetts.wrapS = scSetts.wrapT = THREE.RepeatWrapping; scSetts.repeat.set(.25, .25);
const scPave = new THREE.MeshStandardMaterial({map:scSetts, roughness:.85, polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-24});
const scKerb = M('#d9d4c8', {roughness:.7, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-20});
const scCarpet = M('#8e1d22', {roughness:.95, polygonOffset:true, polygonOffsetFactor:-7, polygonOffsetUnits:-28});
if (typeof regWet === 'function'){ regWet(scPave, .3); regWet(scKerb, .3); }
{
  const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scRoot.add(m); return m; };
  flat(new THREE.ShapeGeometry(scRound(SC_HW + .6, SC_HD + .6, 5.6), 6), scKerb, .045);
  flat(new THREE.ShapeGeometry(scRound(SC_HW, SC_HD, 5), 6), scPave, .05);
  /* red carpet from the road up to the champion */
  const z0 = SC_SLOTS[0][1] + SC_SLOTS[0][2] + .2, z1 = SC_HD + .5, cg = new THREE.PlaneGeometry(3, z1 - z0); cg.translate(0, -(z0 + z1) / 2, 0);
  flat(cg, scCarpet, .055);
}

/* pedestals: a stepped drum, a light band round the top, a glow on the ground and (标准 / 高清) a faint light column. One InstancedMesh each. */
const SC_N = SC_SLOTS.length;
const scDrumGeo = geoMerge([new THREE.CylinderGeometry(1, 1.06, 1, 40).translate(0, .5, 0), new THREE.CylinderGeometry(1.1, 1.12, .12, 40).translate(0, .06, 0)]);
const scDrum = new THREE.InstancedMesh(scDrumGeo, M('#e9e6df', {roughness:.32, metalness:.15}), SC_N);
const scBandMat = new THREE.MeshBasicMaterial({color:'#ffffff', toneMapped:false});
const scBand = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.012, 1.012, .07, 40, 1, true).translate(0, -.09, 0), scBandMat, SC_N);
const scPoolTex = scTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const scPoolMat = new THREE.MeshBasicMaterial({map:scPoolTex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-40});
const scPool = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), scPoolMat, SC_N);
const scBeamTex = scTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const scBeamMat = new THREE.MeshBasicMaterial({map:scBeamTex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false});
const scBeam = new THREE.InstancedMesh(new THREE.CylinderGeometry(.92, 1, 1, 32, 1, true).translate(0, .5, 0), scBeamMat, SC_N);
scDrum.castShadow = true; scDrum.receiveShadow = true;
for (const m of [scDrum, scBand, scPool, scBeam]){ m.frustumCulled = false; scRoot.add(m); }
scPool.renderOrder = 2; scBeam.renderOrder = 3;
const SC_GOLD = new THREE.Color('#ffcf6a'), SC_SILVER = new THREE.Color('#dfe9ff'), SC_BRONZE = new THREE.Color('#ffb48a'), SC_COOL = new THREE.Color('#a9dcff');
const scBandCol = i => i === 0 ? SC_GOLD : i === 1 || i === 2 ? SC_SILVER : i < SC_FRONT ? SC_BRONZE : SC_COOL;

/* turntables (the cars sit on them) and the colliders */
const scSlots = SC_SLOTS.map(([lx, lz, r, h], i) => {
  const tt = new THREE.Group(); tt.position.set(lx, h, lz); tt.rotation.y = i * .9; scRoot.add(tt);
  const [wx, wz] = scW(lx, lz);
  return {i, lx, lz, r, h, wx, wz, tt, car:null, key:'', col:addCircle(wx, wz, r + .1)};
});
function scLayout(){
  const m = new THREE.Matrix4(), on = i => i < SCX.n, beam = XQ.cfg.glow;
  for (const s of scSlots){
    const k = on(s.i) ? 1 : 0;
    m.makeScale(s.r * k, s.h * k, s.r * k).setPosition(s.lx, 0, s.lz); scDrum.setMatrixAt(s.i, m);
    m.makeScale(s.r * k, k, s.r * k).setPosition(s.lx, s.h, s.lz); scBand.setMatrixAt(s.i, m);
    m.makeScale(s.r * 1.9 * k, k, s.r * 1.9 * k).setPosition(s.lx, .07, s.lz); scPool.setMatrixAt(s.i, m);
    m.makeScale(s.r * k * (beam ? 1 : 0), (s.i ? 6 : 8.5) * k, s.r * k * (beam ? 1 : 0)).setPosition(s.lx, s.h, s.lz); scBeam.setMatrixAt(s.i, m);
    scBand.setColorAt(s.i, scBandCol(s.i)); scPool.setColorAt(s.i, scBandCol(s.i)); scBeam.setColorAt(s.i, scBandCol(s.i));
    s.tt.visible = !!k;
  }
  for (const im of [scDrum, scBand, scPool, scBeam]){ im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  scColliders();
}
/* pedestals that are put away (流畅档的后排) and the whole plaza in 黑洞 mode leave no invisible walls behind */
function scColliders(){
  for (const s of scSlots){
    const want = s.i < SCX.n && SCX.mode !== 'hole', at = colliders.indexOf(s.col);
    if (want && at < 0) colliders.push(s.col); else if (!want && at >= 0) colliders.splice(at, 1);
  }
}

/* the signs: one canvas holds all of them (2 columns x 8 rows of 512 x 128), one merged mesh shows them on little lecterns */
const scAtlasC = document.createElement('canvas'); scAtlasC.width = 1024; scAtlasC.height = 1024;
const scAtlas = new THREE.CanvasTexture(scAtlasC); scAtlas.anisotropy = ANISO;
const scSignMat = new THREE.MeshBasicMaterial({map:scAtlas, toneMapped:false});
{
  const faces = [], posts = [], SW = 2.5, SH = SW / 4;
  for (const s of scSlots){
    const col = s.i % 2, row = s.i >> 1, u0 = col * .5, u1 = u0 + .5, v1 = 1 - row / 8, v0 = v1 - 1 / 8, z = s.lz + s.r + .75, tilt = -.42;
    const g = new THREE.PlaneGeometry(SW, SH), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    g.rotateX(tilt); g.translate(s.lx, .95, z + .02); faces.push(g);
    posts.push(new THREE.BoxGeometry(SW + .14, SH + .14, .06).rotateX(tilt).translate(s.lx, .95, z - .025), new THREE.BoxGeometry(.12, .8, .12).translate(s.lx, .4, z - .12),
      new THREE.BoxGeometry(.7, .05, .4).translate(s.lx, .025, z - .12));
  }
  const faceGeo = geoMergeUV(faces), postGeo = geoMerge(posts);
  scRoot.add(new THREE.Mesh(faceGeo, scSignMat));
  const pm = new THREE.Mesh(postGeo, M('#24262b', {roughness:.4, metalness:.6})); pm.castShadow = true; scRoot.add(pm);
  /* merged non-indexed, in slot order: each sign face is 6 vertices (18 floats), each lectern 3 boxes of 36 (324 floats) */
  SCX.faceGeo = faceGeo; SCX.postGeo = postGeo;
}
function scSignShow(){
  /* collapse the hidden slots' signs to a point (cheaper than splitting the mesh) */
  const fp = SCX.faceGeo.attributes.position, pp = SCX.postGeo.attributes.position;
  if (!SCX.face0){ SCX.face0 = fp.array.slice(); SCX.post0 = pp.array.slice(); }
  for (const s of scSlots){
    const on = s.i < SCX.n;
    for (let k = s.i * 18; k < s.i * 18 + 18; k++) fp.array[k] = on ? SCX.face0[k] : 0;
    for (let k = s.i * 324; k < s.i * 324 + 324; k++) pp.array[k] = on ? SCX.post0[k] : 0;
  }
  fp.needsUpdate = pp.needsUpdate = true;
}
function scRoundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function scDrawSigns(){
  const g = scAtlasC.getContext('2d'); g.clearRect(0, 0, 1024, 1024);
  const F = '"Noto Sans SC",sans-serif';
  for (const s of scSlots){
    const e = SCX.list[s.i], x = (s.i % 2) * 512, y = (s.i >> 1) * 128;
    g.save(); g.translate(x, y);
    const bg = g.createLinearGradient(0, 0, 0, 128); bg.addColorStop(0, '#1d2230'); bg.addColorStop(1, '#10131b'); g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    const ac = '#' + scBandCol(s.i).getHexString(); g.fillStyle = ac; g.fillRect(0, 0, 512, 5); g.fillRect(0, 123, 512, 5);
    /* rank badge */
    g.fillStyle = s.i < 3 ? ac : '#2f3647'; g.beginPath(); g.arc(62, 64, 42, 0, 7); g.fill();
    g.fillStyle = s.i < 3 ? '#1a1a1a' : '#e8edf5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${s.i < 9 ? 50 : 40}px ${F}`; g.fillText(String(s.i + 1), 62, 67);
    g.textAlign = 'left';
    if (e){
      let nx = 124;
      if (e.demo || e.mine){
        const t = e.demo ? '示范' : '你'; g.font = `700 24px ${F}`; const tw = g.measureText(t).width + 16;
        g.fillStyle = e.demo ? '#5b6475' : '#e2714c'; scRoundRect(g, nx, 20, tw, 34, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(t, nx + 8, 38); nx += tw + 10;
      }
      g.fillStyle = '#ffffff'; g.font = `700 38px ${F}`; let nm = e.name; while (g.measureText(nm).width > 496 - nx && nm.length > 1) nm = nm.slice(0, -1);
      g.fillText(nm, nx, 38);
      g.font = `500 26px ${F}`; g.fillStyle = '#aab4c4'; g.fillText(scCarName(e.kind), 124, 92);
      const cw = g.measureText(scCarName(e.kind)).width;
      g.font = `900 30px ${F}`; g.fillStyle = ac; g.textAlign = 'right'; g.fillText(scFmt(e.value), 496, 92);
      if (cw > 496 - 124 - g.measureText(scFmt(e.value)).width - 12){ /* very long car names: the value wins */ }
    } else {
      g.fillStyle = '#c9d1de'; g.font = `700 34px ${F}`; g.fillText('虚位以待', 124, 46);
      g.fillStyle = '#8590a3'; g.font = `500 22px ${F}`; g.fillText(window.XNet && XNet.online ? '买车改装，冲上全服豪车榜' : '联机后全服最贵的车停在这里', 124, 90);
    }
    g.restore();
  }
  scAtlas.needsUpdate = true;
}

/* the banner at the back: two posts and a board */
{
  const draw = (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(0, '#13161f'); bg.addColorStop(.5, '#232838'); bg.addColorStop(1, '#13161f'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e3b95a'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 104px "Noto Serif SC","Noto Sans SC",serif'; g.fillStyle = '#f3d68c'; g.fillText('豪 车 展 台', w / 2, 104);
    g.font = '500 34px "Noto Sans SC",sans-serif'; g.fillStyle = '#c3cad6'; g.fillText('XMUM AUTO SALON · 按整车价值排位，越豪华越靠前', w / 2, 196);
  };
  const t = scTex(1024, 256, draw);
  /* the web font may arrive after this file runs: draw the banner and the signs again once it is there */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(t.image.getContext('2d'), 1024, 256); t.needsUpdate = true; if (SCX.list.length) scDrawSigns(); });
  const W = 8.4, H = W / 4, z = -SC_HD + 1, y = 3.2;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({map:t, toneMapped:false})); board.position.set(0, y, z + .06); scRoot.add(board);
  const frame = new THREE.Mesh(geoMerge([new THREE.BoxGeometry(W + .3, H + .3, .1).translate(0, y, z), new THREE.BoxGeometry(.22, y + H / 2, .22).translate(-W / 2 - .1, (y + H / 2) / 2, z - .1),
    new THREE.BoxGeometry(.22, y + H / 2, .22).translate(W / 2 + .1, (y + H / 2) / 2, z - .1)]), M('#24262b', {roughness:.4, metalness:.6}));
  frame.castShadow = true; scRoot.add(frame);
  const [bx, bz] = scW(0, z - .1); addBox(bx, bz, W / 2 + .3, .3, SC_ROT);
}

/* ---------- the cars ---------- */
function scDrop(s){
  if (!s.car) return;
  s.tt.remove(s.car.root); s.car.paint.dispose(); s.car = null; s.key = '';
}
function scBuild(s, e){
  const key = e ? e.kind + '|' + e.look : '';
  if (key === s.key) return;
  scDrop(s); s.key = key; if (!e) return;
  const stock = (scShop(e.kind) || {}).color || '#888888';
  const c = makeCar(e.kind, stock, 0, 0, 0);
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);    /* scenery only: no physics, no traffic, nobody can drive it off */
  scene.remove(c.root); s.tt.add(c.root); c.root.position.set(0, .01, 0); c.root.rotation.set(0, 0, 0);
  const L = scParse(e.look);
  try { carPaint(c, L.paint, L.decal, stock); } catch(err){}
  try { tnApply(c, L.fit); } catch(err){}
  c.paint.emissive.set(c.color0); c.paint.emissiveIntensity = .22 * Math.max(0, SCX.k);
  c.fineOn = SCX.fine; for (const m of c.fine) m.visible = SCX.fine;
  s.car = c; SCX.k = -1;
}

/* ---------- who stands where ---------- */
function scRank(){
  const mine = scMine(), online = !!(window.XNet && XNet.online);
  const me = mine ? Object.assign({uid:online ? XNet.uid : 'me', name:(online && XNet.claimedName && XNet.claimedName()) || scMyName(), mine:true}, mine) : null;
  let real = [], fill = [];
  if (online && SCX.remote){
    real = SCX.remote.filter(r => r.uid !== XNet.uid);
    if (me) real.push(me);
    fill = SC_DEMOS.slice().sort((a, b) => b.value - a.value);
  } else {
    real = SC_DEMOS.concat(me ? [me] : []);
  }
  real.sort((a, b) => b.value - a.value || (a.ts || 0) - (b.ts || 0));
  const out = real.slice(0, SCX.n);
  /* offline your own car is always on show: if the demos crowd it out, it takes the last place */
  if (!(online && SCX.remote) && me && !out.includes(me)) out[SCX.n - 1] = me;
  for (const d of fill){ if (out.length >= SCX.n) break; out.push(d); }
  while (out.length < SC_N) out.push(null);
  return out.slice(0, SC_N).map((e, i) => i < SCX.n ? e : null);
}
function scMyName(){
  try { if (window.XUI && typeof XUI.playerName === 'function'){ const n = String(XUI.playerName() || ''); if (n) return n; } } catch(e){}
  try { return localStorage.getItem('xmum-name') || '我'; } catch(e){ return '我'; }
}
function scRefresh(){
  SCX.list = scRank();
  for (const s of scSlots) scBuild(s, SCX.list[s.i]);
  scDrawSigns();
}
/* my car made the display: a toast when it gets a better place than last time, and the achievement for the front row */
function scCheckMine(){
  const i = SCX.list.findIndex(e => e && e.mine); if (i < 0) return;
  const rank = i + 1, e = SCX.list[i];
  if (rank <= SC_FRONT && typeof unlock === 'function') unlock('showcase');
  if (!SCX.save.best || rank < SCX.save.best || e.kind !== SCX.save.kind){
    const first = !SCX.save.best;
    SCX.save = {best:rank, kind:e.kind}; scWrite();
    if (typeof toast === 'function') toast(first ? `你的${scCarName(e.kind)}上了豪车展台` : `你的${scCarName(e.kind)}排到第 ${rank} 名`,
      `陈华春音乐厅门前 · 第 ${rank} 名 · ${scFmt(e.value)}`, 3000);
    if (typeof sfx !== 'undefined' && sfx.sparkle) sfx.sparkle();
  }
}
if (typeof achAdd === 'function') achAdd([['showcase', '豪车上展', '自己的车停上陈华春音乐厅门前豪车展台的前排（前五名）', 30]]);

/* ---------- online: /showcase/{uid} ---------- */
const scDb = () => firebase.app().database();
const scOnline = () => !!(window.XNet && XNet.online && window.firebase && firebase.app);
async function scFetch(){
  if (!scOnline()) return;
  try {
    const snap = await scDb().ref('showcase').orderByChild('value').limitToLast(SC_N + 3).once('value'), out = [];
    snap.forEach(c => {
      const v = c.val() || {}, kind = String(v.car || ''), look = String(v.look || '');
      if (!scShop(kind) || !TN_KINDS.includes(kind) || !SC_LOOK_RE.test(look) || typeof v.name !== 'string' || !v.name) return;
      out.push({uid:c.key, name:v.name.slice(0, 16), kind, look, value:Math.max(0, Math.min(SC_MAX, +v.value || 0)), ts:+v.ts || 0});
    });
    SCX.remote = out; scRefresh();
  } catch(e){ if (!SCX.warned){ SCX.warned = true; console.warn('[showcase] 读取豪车展台失败', e); } }
}
/* my best car goes up when it changes (at most once a minute); only with a registered nickname, the rules check it */
async function scPush(){
  if (!scOnline()) return;
  const name = XNet.claimedName ? XNet.claimedName() : ''; if (!name) return;
  const m = scMine(); if (!m) return;
  const value = Math.min(SC_MAX, Math.round(m.value)), key = [name, m.kind, m.look, value].join('|');
  if (key === SCX.sent || Date.now() - SCX.pushT < 60000) return;
  SCX.pushT = Date.now();
  try {
    await scDb().ref('showcase/' + XNet.uid).set({name, car:m.kind, look:m.look, value, ts:firebase.database.ServerValue.TIMESTAMP});
    SCX.sent = key;
  } catch(e){ if (!SCX.warned){ SCX.warned = true; console.warn('[showcase] 写入豪车展台失败（规则还没发布？）', e); } }
}

/* ---------- details on F ---------- */
{ const st = document.createElement('style'); st.textContent = `
#scCard{position:fixed;z-index:7;right:12px;top:calc(var(--safe-t, 0px) + 70px);width:300px;max-width:calc(100% - 24px);max-height:calc(100% - 180px);overflow:auto;box-sizing:border-box;
  padding:14px 16px 14px;border-top:3px solid var(--gold, #e3b95a);background:var(--panel-solid)}
#scCard[hidden]{display:none}
#scCard h2{font-family:var(--display);font-size:20px;margin:6px 28px 2px 0;letter-spacing:.03em}
#scCard .sc-own{font-size:13px;color:var(--muted);margin:0 0 10px}
#scCard .sc-own b{color:var(--ink)}
#scCard .sc-val{font-family:var(--display);font-size:24px;font-weight:900;color:var(--tile);font-variant-numeric:tabular-nums;margin:0}
#scCard .sc-parts{font-size:12px;color:var(--muted);margin:2px 0 10px;line-height:1.6;font-variant-numeric:tabular-nums}
#scCard h3{font-size:12px;letter-spacing:.06em;color:var(--muted);margin:10px 0 5px;font-weight:500}
#scCard ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:5px}
#scCard li{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:var(--card-bg)}
#scCard li.r{border-color:#7442c2}#scCard li.l{border-color:#e3b95a;background:rgba(227,185,90,.14)}
#scCard .sc-note{font-size:12px;color:var(--muted);line-height:1.6;margin:10px 0 0}
#scCard .sc-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
@media (max-width:760px){ #scCard{right:12px;left:12px;width:auto;max-width:none;top:auto;bottom:calc(var(--safe-b, 0px) + 200px);max-height:42vh;padding:12px 14px} #scCard h2{font-size:18px} }`; document.head.appendChild(st); }
const scCard = document.createElement('div'); scCard.className = 'panel'; scCard.id = 'scCard'; scCard.hidden = true; scCard.setAttribute('role', 'dialog'); scCard.setAttribute('aria-label', '展车详情');
document.body.appendChild(scCard);
function scClose(){ if (scCard.hidden) return; scCard.hidden = true; SCX.open = -1; }
function scOpen(i){
  const e = SCX.list[i]; if (!e) return;
  SCX.open = i;
  const L = scParse(e.look), fit = e.mine ? scFitOf(e.kind) : L.fit, price = (scShop(e.kind) || {}).price || 0;
  const mods = e.mods != null ? e.mods : null, paintRM = e.paintRM != null ? e.paintRM : scPaintRM(L.paint, L.decal);
  const items = TN_SLOTS.map(sl => TN.byKey[sl.id + '.' + fit[sl.id]]).filter(it => it && it.id !== TN.stock[it.slot]);
  const P = WD_PAINT[L.paint] || WD_PAINT.stock, D = WD_DECAL[L.decal] || WD_DECAL.none;
  const who = e.demo ? `示范车「${scEsc(e.name)}」` : e.mine ? '你' + (e.name && e.name !== '我' ? '（' + scEsc(e.name) + '）' : '') : scEsc(e.name);
  const parts = mods != null ? `车价 ${scFmt(price)} · 改装 ${scFmt(mods)} · 喷漆贴花 ${scFmt(paintRM)}` : `车价 ${scFmt(price)} · 改装和喷漆 ${scFmt(Math.max(0, e.value - price))}`;
  let note = '';
  if (e.mine) note = scOnline() ? (XNet.claimedName && XNet.claimedName() ? '这是你最贵的一辆，全服玩家路过都能看到。' : '先在标题页注册昵称，你的车才会上全服展台。')
    : '这是你最贵的一辆。联机时会和全服玩家一起排位。';
  else if (e.demo) note = scOnline() ? '示范车只用来填空位，真实玩家永远排在它前面。' : '离线时你的车和示范车一起排位，比它们豪华就往中间站。';
  scCard.innerHTML = `<button class="x" aria-label="关闭">×</button><span class="tag">豪车展台 · 第 ${i + 1} 名</span>
    <h2>${scEsc(scCarName(e.kind))}</h2><p class="sc-own">车主 <b>${who}</b></p>
    <p class="sc-val">${scFmt(e.value)}</p><p class="sc-parts">${parts}</p>
    <h3>外观</h3><ul><li class="${P.tier || 'n'}">${scEsc(P.name)}${P.fin && WD_FIN[P.fin] ? ' · ' + WD_FIN[P.fin].n : ''}</li>${D.id !== 'none' ? `<li class="${D.tier || 'n'}">贴花 · ${scEsc(D.name)}</li>` : ''}</ul>
    <h3>改装 ${items.length ? items.length + ' 件' : ''}</h3><ul>${items.length ? items.map(it => `<li class="${it.tier}">${scEsc((TN_SLOTS.find(s => s.id === it.slot) || {}).name || '')} · ${scEsc(it.name)}</li>`).join('') : '<li>原厂</li>'}</ul>
    ${note ? `<p class="sc-note">${note}</p>` : ''}
    ${e.mine ? `<div class="sc-row">${window.XTune ? '<button class="btn" data-sc="tune">去改装车间</button>' : ''}${window.XWard ? '<button class="btn" data-sc="paint">去喷漆店</button>' : ''}</div>` : ''}`;
  scCard.hidden = false;
  /* phones: sit just above the action buttons, whatever their size */
  const acts = document.getElementById('acts'), r = acts && !acts.hidden ? acts.getBoundingClientRect() : null;
  scCard.style.bottom = innerWidth <= 760 && r && r.height ? Math.round(innerHeight - r.top + 8) + 'px' : '';
  if (typeof sfx !== 'undefined' && sfx.ding) sfx.ding();
}
scCard.addEventListener('click', e => {
  if (e.target.closest('.x')){ scClose(); return; }
  const b = e.target.closest('[data-sc]'); if (!b) return;
  scClose(); if (typeof ac === 'function') ac();
  if (b.dataset.sc === 'tune' && window.XTune) XTune.open(); else if (b.dataset.sc === 'paint' && window.XWard) XWard.open('car');
});
document.addEventListener('keydown', e => { if (!scCard.hidden && e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); scClose(); } }, true);
const scNear = () => {
  if (mode !== 'naiwa' || driving || nw.state === 'fly' || gx.paused) return -1;
  let best = -1, bd = 1e9;
  for (const s of scSlots){ if (s.i >= SCX.n || !SCX.list[s.i]) continue; const d = Math.hypot(nw.x - s.wx, nw.z - s.wz) - s.r; if (d < 2.6 && d < bd){ bd = d; best = s.i; } }
  return best;
};

/* ---------- per frame ---------- */
function scFrame(dt){
  if (mode !== SCX.mode){ SCX.mode = mode; scColliders(); if (mode !== 'naiwa') scClose(); }
  const dx = camera.position.x - SC_X, dz = camera.position.z - SC_Z, d = Math.hypot(dx, dz);
  const vis = mode !== 'hole' && d < XQ.pick(200, 280, 360);
  if (vis !== SCX.vis){ SCX.vis = vis; scRoot.visible = vis; }
  if (!vis) return;
  const fine = d < XQ.pick(55, 80, 110);
  if (fine !== SCX.fine){ SCX.fine = fine; for (const s of scSlots) if (s.car){ s.car.fineOn = fine; for (const m of s.car.fine) m.visible = fine; } }
  for (const s of scSlots) if (s.car) s.tt.rotation.y += dt * (s.i ? .22 : .3);
  /* after dark: brighter light bands, glowing pools and columns, and the paint lit as if by spotlights */
  const k = Math.round(Math.min(1, typeof cur !== 'undefined' ? cur.lamp || 0 : 0) * 50) / 50;
  if (k !== SCX.k){
    SCX.k = k;
    scBandMat.color.setScalar(.55 + .75 * k);
    scPoolMat.opacity = .12 + .6 * k; scBeamMat.opacity = .25 * k;
    for (const s of scSlots) if (s.car) s.car.paint.emissiveIntensity = .22 * k;
  }
}
/* refresh: my own entry every few seconds (cheap; rebuilds only what changed), the online list every two minutes while anywhere near */
setInterval(() => {
  const m = scMine(), key = m ? m.kind + '|' + m.look + '|' + Math.round(m.value) : '';
  if (key !== SCX.mineKey){ SCX.mineKey = key; scRefresh(); }
  if (mode === 'naiwa' && !gx.paused) scCheckMine();
  if (scOnline()){
    const now = Date.now(), near = Math.hypot(camera.position.x - SC_X, camera.position.z - SC_Z) < 600;
    if (!SCX.remote || (near && now - SCX.fetchT > 120000)){ SCX.fetchT = now; scFetch(); }
    scPush();
  }
}, 4000);
window.addEventListener('xnet', () => { if (scOnline() && !SCX.remote){ SCX.fetchT = Date.now(); scFetch(); } });
XQ.onChange(() => { SCX.n = XQ.pick(SC_FRONT, 7, SC_N); scLayout(); scSignShow(); if (SCX.list.length) scRefresh(); });

/* ---------- hook into the game (js/80-gta.js gx, js/90-main.js doF and frame) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      const i = scNear(); SCX.near = i; SCX.prompt = '';
      if (i >= 0){
        const e = SCX.list[i];
        SCX.prompt = (TOUCH ? '点「看车」' : '按 F ') + '看' + (e.mine ? '你的' : e.demo ? `示范车「${e.name}」` : `${e.name} 的`) + `${scCarName(e.kind)} · 第 ${i + 1} 名`;
        const b = actF.querySelector('b'); if (b.textContent !== '看车') b.textContent = '看车';
      } else if (SCX.fLbl) updateActs();
      SCX.fLbl = i >= 0;
      if (SCX.open >= 0){ const s = scSlots[SCX.open]; if (!s || Math.hypot(nw.x - s.wx, nw.z - s.wz) > s.r + 7 || driving) scClose(); }
    },
    prompt(){ return base.prompt() || SCX.prompt; },
    mini(dot){ base.mini(dot); dot(SC_X, SC_Z, '#e3b95a', 4); },
    leave(){ scClose(); SCX.prompt = ''; if (SCX.fLbl){ SCX.fLbl = false; updateActs(); } base.leave(); },
    frame(dt, T){ if (base.frame) base.frame(dt, T); scFrame(dt); }
  });
  const baseF = typeof window.roomTryF === 'function' ? window.roomTryF : null;
  window.roomTryF = function(){
    const i = scNear();
    if (i >= 0){ if (SCX.open === i) scClose(); else scOpen(i); return true; }
    return baseF ? baseF() : false;
  };
}
setTimeout(scRefresh, 0);

/* for testing (预览版和本地测试页): XShowcase.list, .refresh(), .fake(n) adds n fake online entries, .goto() puts 奶娃 in front of the champion */
window.XShowcase = {
  get list(){ return SCX.list; }, refresh:scRefresh, mine:scMine, demos:SC_DEMOS, fetch:scFetch,
  goto(){ const [x, z] = scW(0, SC_HD + 4); nw.x = x; nw.z = z; nw.h = SC_ROT + Math.PI; if (typeof camYaw !== 'undefined') camYaw = SC_ROT; }
};
