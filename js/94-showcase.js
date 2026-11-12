/* XMUM 校园漫游 · 豪车展台：陈华春音乐厅（Tan Hua Choon Auditorium）门前扩出一片石砖广场，7 个车模展位沿着红毯排成 V 字，
   常年站着全服最有钱的 7 个奶娃和他们的爱车。
   - 每个展位是一个台子：正面名牌写名次、昵称和总资产；台上前面站着玩家的奶娃（穿自己选的装扮，摆车模姿势），
     侧边的转盘上停着他的车（带完整的喷漆、贴花和改装外观，慢慢转）。
   - 排位按总资产（js/80-gta.js netWorth，跟「总资产」排行榜一个口径），名牌上显示的就是排位用的数。
     第 1 名在红毯尽头、正对音乐厅大门，台子最高；2、3 名在红毯两边离它最近，往马路方向依次到 6、7 名。
   - 玩家自己定制展位：展示哪辆车（默认最贵那辆）、哪套装扮（跟着衣橱走，或者单独存一套展台装扮）、哪个姿势。
     入口：在展台广场按 F（手机点「展位」）打开「我的展位」；走到自己的展位前按 F 看详情，里面也有按钮。
   - 装饰：每个台子前面一对开业花篮，前三名是双层大花篮，台前还有一排花；夜里定时放烟花，有人新上台、名次变了也放一发。
   - 联机：/showcase/{uid} = {name, car, look, wear, pose, value, ts}（规则在 database.rules.json：只能写自己的，
     名字必须是 users/{uid}/name 里注册的昵称，各字段有格式和长度限制），读的时候按 value 取前几名。
     没注册昵称的不上传，但自己这边照样参与排位。
   - 离线或预览版：自己和几个「示范」奶娃一起排位，自己保证在台上；联机时示范只用来填空位，永远排在真实玩家后面。
   - 性能：台子、灯带、转盘、光斑、光柱、花朵全部实例化，名牌共用一张贴图；7 个低模奶娃 + 7 辆车行低模车，
     离远了隐藏车的细节件、奶娃不再摆动作，再远整片不画。流畅档花少一半、没有光柱、烟花只在有人上榜时放、粒子少。
   位置：整片展台跟着音乐厅（js/45-auditorium.js AUDI）走，坐标系就是音乐厅的（x 横过正面，+z 从大门朝外对着马路），
   只是原点挪到门前石砖广场的中间。排布是一条「V 字大道」：红毯从马路沿着大门的中轴线一直铺到第 1 名，
   第 1 名在最里面、正对大门；2–7 名分两排站在红毯两边，面朝红毯、稍微朝马路，越往里名次越高。
   布局用脚本检查过：台子（含台阶）、花篮、门头立柱互不相交，全部在广场里，离音乐厅台阶前的浅色石带至少 2.5 米，红毯两边留出 7 米多的走道。 */
'use strict';
const SC_ZC = 35;                                  /* 广场中心离音乐厅中心多远（音乐厅坐标的 z，米） */
const SC_X = audiW(0, SC_ZC)[0], SC_Z = audiW(0, SC_ZC)[1], SC_ROT = AUDI.rot;   /* 广场中心（世界坐标）和朝向，本地 +z 朝马路 */
const SC_HW = 21, SC_HD = 16;                      /* 半宽、半深（米）：从音乐厅台阶前到马路边 */
/* V 字大道：第 1 名在 (0, zc)；两边第 k 个（k = 0, 1, 2）在 (±(x0 + k·dx), z0 + k·dz)，台子转到面朝红毯、往马路偏 phi */
const SC_LAY = {zc:-11, x0:8.8, z0:-6, dx:2.1, dz:6.8, phi:.3};
const SC_BW = 5.8, SC_BD = 6.4;                    /* 一个展台的宽、深 */
const SC_N = 7, SC_TOP = 3;                        /* 7 个位置；前三名的台子更隆重 */
const SC_HGT = [1.3, 1.1, 1.1, .95, .95, .8, .8];  /* 台高，按名次 */
const SC_CAR_S = .86;                              /* 展车按 86% 大小摆（车模的意思）：最长的劳斯来斯转起来也扫不出转盘、碰不到奶娃 */
const SC_DISC = 2.72;                              /* 转盘半径：车转一圈扫过的圆（劳斯来斯约 2.66 米）再留一点 */
const SC_KEY = 'xmum-showcase-v1', SC_LOOK_RE = /^[a-z0-9_,]{0,60}$/, SC_WEAR_RE = /^[a-z0-9_,]{0,100}$/, SC_MAX = 1e7;
const SC_POSES = {auto:'轮换', hip:'叉腰', wave:'挥手', cheer:'欢呼', show:'介绍爱车', flex:'秀肌肉'};
const SC_CYCLE = ['hip', 'wave', 'show', 'cheer', 'flex'];
const scW = (lx, lz) => [SC_X + lx * Math.cos(SC_ROT) + lz * Math.sin(SC_ROT), SC_Z - lx * Math.sin(SC_ROT) + lz * Math.cos(SC_ROT)];
const scFmt = v => 'RM ' + Math.round(+v || 0).toLocaleString();
const scShop = k => (typeof SHOP !== 'undefined' && SHOP.find(s => s.kind === k)) || null;
const scCarName = k => k ? (scShop(k) || {}).name || (CAR_T[k] || {}).name || k : '';
const scEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const scOkCar = k => !!(scShop(k) && TN_KINDS.includes(k));

/* ---------- value ---------- */
/* look 字符串（车的外观）：喷漆 id、d_贴花、tk 改装段（js/42-tuning.js tnToken），逗号分开，跟 /looks 一个格式 */
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
/* 一辆车（任何人的）大概值多少：车价 + 装上的改装件 + 喷漆贴花，只用来在详情卡上说明 */
function scCarRM(kind, look){
  if (!kind) return {price:0, mods:0, paintRM:0, total:0};
  const L = scParse(look), price = (scShop(kind) || {}).price || 0, mods = scFitRM(L.fit), paintRM = scPaintRM(L.paint, L.decal);
  return {price, mods, paintRM, total:price + mods + paintRM};
}
/* 我的一辆车：{kind, look, price, mods, paintRM, total} */
function scMyCarOf(kind){
  const w = (typeof wardSave !== 'undefined' && wardSave.cars[kind]) || {p:'stock', d:'none'};
  const price = scShop(kind).price, mods = scModsRM(kind), paintRM = scPaintRM(w.p, w.d);
  return {kind, look:scLook(w.p, w.d, scFitOf(kind)), price, mods, paintRM, total:price + mods + paintRM};
}
function scMyCars(){
  if (typeof owned === 'undefined') return [];
  return [...owned].filter(scOkCar).map(scMyCarOf).sort((a, b) => b.total - a.total || b.price - a.price);
}
const scWorth = () => { try { return Math.max(0, typeof netWorth === 'function' ? +netWorth() || 0 : +money || 0); } catch(e){ return 0; } };
/* 展台装扮：只留自己有的（衣橱里卖掉的东西不会再穿出来） */
function scWearClean(str){
  const l = wdLookParse(str);
  for (const s in l) if (l[s] && l[s] !== WD_DEFAULT[s] && !(typeof wardSave !== 'undefined' && wardSave.own.has(l[s]))) l[s] = WD_DEFAULT[s];
  return wdLookStr(l);
}
const scWearNow = () => typeof wardSave !== 'undefined' ? wdLookStr(wardSave.look) : '';
/* 我在展台上的样子：{kind, look, wear, pose, value, car} */
function scMine(){
  const cars = scMyCars(), pick = SCX.cfg.car && cars.find(c => c.kind === SCX.cfg.car), car = pick || cars[0] || null;
  const wear = SCX.cfg.wear != null ? scWearClean(SCX.cfg.wear) : scWearNow();
  return {kind:car ? car.kind : '', look:car ? car.look : '', wear, pose:SC_POSES[SCX.cfg.pose] ? SCX.cfg.pose : 'auto', value:scWorth(), car};
}

/* ---------- 示范：离线时陪你排位，联机时只填空位 ---------- */
const SC_DEMOS = [
  {name:'金色传说', value:15800, wear:'gold,big,emperor,mian,shades,chain,furcape', pose:'show', kind:'rr', paint:'gilt', decal:'none', fit:{rim:'dish', rimc:'gold', size:'s1', low:'l1', drl:'bar', exh:'dual'}},
  {name:'星空夜跑', value:9600, wear:'galaxy,slim,hero,shades,cape', pose:'cheer', kind:'lambo', paint:'obsid', decal:'galaxy', fit:{rim:'glow', size:'s2', wide:'wide', lip:'canard', skirt:'skirt', diff:'diff', hood:'scoop', aero:'carbon', wing:'swan', neon:'kit', neonc:'purple', drl:'fang', exh:'quad', low:'l2', camber:'c3'}},
  {name:'赛道日', value:5200, wear:'white,shirt,glasses,bowtie,coffee', pose:'hip', kind:'p911', paint:'pearlw', decal:'stripes', fit:{rim:'forged', rimc:'black', lip:'canard', wing:'gt', aero:'carbon', low:'l2', camber:'c3', exh:'quad'}},
  {name:'霓虹之夜', value:3100, wear:'pink,detective,fedora,chain', pose:'wave', kind:'mase', paint:'mpurp', decal:'none', fit:{rim:'turbine', rimc:'gun', neon:'kit', neonc:'pink', drl:'quad', skirt:'skirt', low:'l1'}},
  {name:'火焰小钢炮', value:1200, wear:'orange,chubby,redvest,policecap', pose:'flex', kind:'myvi', paint:'tomato', decal:'flames', fit:{rim:'mesh', rimc:'black', lip:'lip', wing:'duck', exh:'dual'}},
  {name:'奶娃 07', value:900, wear:'bag', pose:'hip', kind:'p911', paint:'naiwa', decal:'xmum', fit:{}},
  {name:'西瓜冰', value:480, wear:'xmumblue,melon,boba', pose:'wave', kind:'myvi', paint:'stock', decal:'melon', fit:{rim:'mesh', rimc:'white'}}
].map((d, i) => ({uid:'demo' + i, name:d.name, kind:d.kind, look:scLook(d.paint, d.decal, tnFit(d.fit)), wear:wdLookStr(wdLookParse(d.wear)), pose:d.pose, value:d.value, demo:true}));

/* ---------- state ---------- */
const SCX = {
  remote:null,          /* 联机读到的前几名（不含自己），null = 还没读到 / 离线 */
  list:[],              /* 现在台子上的：按名次，空位是 null */
  sig:null,             /* 上一次每个位置是谁（名次变了放烟花） */
  k:-1, vis:true, fine:true, anim:true, mode:'',
  near:-1, onPlaza:false, prompt:'', fLbl:false, open:-1, my:false,
  mineKey:'', fetchT:0, pushT:0, sent:'', sentV:0, warned:false,
  fwT:8, save:{best:0, kind:''}, cfg:{car:'', pose:'auto', wear:null}
};
try {
  const d = JSON.parse(localStorage.getItem(SC_KEY) || 'null');
  if (d){
    SCX.save = {best:Math.max(0, d.best | 0), kind:String(d.kind || '')};
    const c = d.cfg || {};
    SCX.cfg = {car:/^[a-z0-9]{0,12}$/.test(c.car || '') ? c.car || '' : '', pose:SC_POSES[c.pose] ? c.pose : 'auto', wear:typeof c.wear === 'string' && SC_WEAR_RE.test(c.wear) ? c.wear : null};
  }
} catch(e){}
const scWrite = () => { try { localStorage.setItem(SC_KEY, JSON.stringify(Object.assign({cfg:SCX.cfg}, SCX.save))); } catch(e){} };

/* ---------- the plaza ---------- */
const scRoot = new THREE.Group(); scRoot.position.set(SC_X, 0, SC_Z); scRoot.rotation.y = SC_ROT; scene.add(scRoot);
const scTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; };
/* the carpet sits a little above the forecourt's setts and wins the depth test against them (their offset is -10 / -40) */
const scCarpet = M('#8e1d22', {roughness:.95, polygonOffset:true, polygonOffsetFactor:-14, polygonOffsetUnits:-56});

/* the seven booths, in rank order: 1 at the end of the carpet, 2 on the left (seen from the road), 3 on the right, and so on towards the road */
const scSlots = Array.from({length:SC_N}, (_, i) => {
  const L = SC_LAY, k = (i - 1) >> 1, side = i % 2 ? -1 : 1;
  const a = i ? -side * (Math.PI / 2 - L.phi) : 0;
  const lx = i ? side * (L.x0 + k * L.dx) : 0, lz = i ? L.z0 + k * L.dz : L.zc, h = SC_HGT[i];
  /* the 奶娃 stands in the front corner on the road side, the car turns beside it, inside the booth (disc edge 2.87 < 2.9) */
  const sd = a < 0 ? -1 : 1, fx = -1.85 * sd, fz = 2.4, cx = .15 * sd, cz = -.45;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, 0, lz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1, 1, 1));
  const g = new THREE.Group(); g.position.set(lx, 0, lz); g.rotation.y = a; scRoot.add(g);
  const tt = new THREE.Group(); tt.position.set(cx, h + .05, cz); tt.rotation.y = i * .9 + .6; g.add(tt);
  const fg = new THREE.Group(); fg.position.set(fx, h, fz); g.add(fg);
  /* booth-local point → plaza-local → world */
  const toPlaza = (x, z) => [lx + x * Math.cos(a) + z * Math.sin(a), lz - x * Math.sin(a) + z * Math.cos(a)];
  const [wx, wz] = scW(...toPlaza(0, 0));
  return {i, a, lx, lz, h, sd, fx, fz, cx, cz, m, g, tt, fg, toPlaza, wx, wz, car:null, key:'', fig:null, wear:null, pose:null, P:null, cols:[]};
});
{
  const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scRoot.add(m); return m; };
  /* the ground is the auditorium's own granite forecourt (js/45-auditorium.js); only the red carpet lies on it,
     from the walk at the road up to the champion, with a thin brass edge either side, above the setts (y .06) and the pale band (.075) */
  const z0 = scSlots[0].lz + SC_BD / 2 + .25, z1 = 59.2 - SC_ZC, cg = new THREE.PlaneGeometry(3, z1 - z0); cg.translate(0, -(z0 + z1) / 2, 0);
  flat(cg, scCarpet, .085);
  const eg = geoMerge([-1.56, 1.56].map(x => new THREE.PlaneGeometry(.12, z1 - z0).translate(x, -(z0 + z1) / 2, 0)));
  flat(eg, M('#c9a24e', {roughness:.35, metalness:.75, polygonOffset:true, polygonOffsetFactor:-15, polygonOffsetUnits:-60}), .086);
}
/* booth-local transform → matrix for an instance (or a geometry) in the plaza group */
const scQ = new THREE.Quaternion(), scY = new THREE.Vector3(0, 1, 0);
function scMat(s, x, y, z, sx, sy, sz, ry){
  const l = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), scQ.setFromAxisAngle(scY, ry || 0), new THREE.Vector3(sx, sy, sz));
  return new THREE.Matrix4().multiplyMatrices(s.m, l);
}

/* the booths: a dark step, a white block with a light band round the top edge, a dark glossy turntable with a gold rim.
   One InstancedMesh each; the ground glow, the spot under the 奶娃 and (标准 / 高清, front three) the light columns too. */
const scBox = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
const scIM = (geo, mat, n, shadow) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; if (shadow){ m.castShadow = true; m.receiveShadow = true; } scRoot.add(m); return m; };
const scStep = scIM(scBox, M('#2a2c33', {roughness:.45, metalness:.35}), SC_N, true);
const scBlock = scIM(scBox, M('#ece8df', {roughness:.32, metalness:.12}), SC_N, true);
const scBandMat = new THREE.MeshBasicMaterial({color:'#ffffff', toneMapped:false});
const scBand = scIM(scBox, scBandMat, SC_N);
const scDisc = scIM(new THREE.CylinderGeometry(1, 1, 1, 40).translate(0, .5, 0), M('#1c1e24', {roughness:.22, metalness:.55}), SC_N, true);
const scRim = scIM(new THREE.TorusGeometry(1, .012, 6, 56).rotateX(Math.PI / 2), M('#d9b25a', {roughness:.3, metalness:.85}), SC_N);
const scPoolTex = scTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const scPoolMat = new THREE.MeshBasicMaterial({map:scPoolTex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false, polygonOffset:true, polygonOffsetFactor:-16, polygonOffsetUnits:-64});
const scPool = scIM(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), scPoolMat, SC_N * 2);
const scBeamTex = scTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const scBeamMat = new THREE.MeshBasicMaterial({map:scBeamTex, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false});
const scBeam = scIM(new THREE.CylinderGeometry(.92, 1, 1, 32, 1, true).translate(0, .5, 0), scBeamMat, SC_TOP);
scPool.renderOrder = 2; scBeam.renderOrder = 3;
const SC_GOLD = new THREE.Color('#ffcf6a'), SC_SILVER = new THREE.Color('#dfe9ff'), SC_BRONZE = new THREE.Color('#ffb48a'), SC_COOL = new THREE.Color('#a9dcff');
const scBandCol = i => i === 0 ? SC_GOLD : i === 1 ? SC_SILVER : i === 2 ? SC_BRONZE : SC_COOL;
function scLayout(){
  const beam = XQ.cfg.glow;
  for (const s of scSlots){
    const i = s.i, h = s.h;
    scStep.setMatrixAt(i, scMat(s, 0, 0, 0, SC_BW + .5, .15, SC_BD + .5));
    scBlock.setMatrixAt(i, scMat(s, 0, 0, 0, SC_BW, h, SC_BD));
    scBand.setMatrixAt(i, scMat(s, 0, h - .11, 0, SC_BW + .04, .05, SC_BD + .04));
    scDisc.setMatrixAt(i, scMat(s, s.cx, h, s.cz, SC_DISC, .05, SC_DISC));
    scRim.setMatrixAt(i, scMat(s, s.cx, h + .05, s.cz, SC_DISC + .02, 1, SC_DISC + .02));
    scPool.setMatrixAt(i, scMat(s, 0, .095, .6, SC_BW * .85, 1, SC_BD * .75));
    scPool.setMatrixAt(SC_N + i, scMat(s, s.fx, h + .012, s.fz, 1.15, 1, 1.15));
    if (i < SC_TOP) scBeam.setMatrixAt(i, scMat(s, s.cx, h, s.cz, beam ? SC_DISC : 0, beam ? (i ? 6.5 : 9) : 0, beam ? SC_DISC : 0));
    const c = scBandCol(i); scBand.setColorAt(i, c); scPool.setColorAt(i, c); scPool.setColorAt(SC_N + i, c); if (i < SC_TOP) scBeam.setColorAt(i, c);
  }
  for (const im of [scStep, scBlock, scBand, scDisc, scRim, scPool, scBeam]){ im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
}

/* colliders: every booth is a box (with its step), the two flower stands in front are posts; none of them in 黑洞 mode */
const SC_STAND_X = SC_BW / 2 - .15, SC_STAND_Z = SC_BD / 2 + .72;
for (const s of scSlots){
  s.cols.push({t:0, cx:s.wx, cz:s.wz, hx:SC_BW / 2 + .25, hz:SC_BD / 2 + .25, c:Math.cos(SC_ROT + s.a), s:Math.sin(SC_ROT + s.a)});
  for (const sx of [-1, 1]){ const [px, pz] = scW(...s.toPlaza(sx * SC_STAND_X, SC_STAND_Z)); s.cols.push({t:1, cx:px, cz:pz, r:.5}); }
}
const scAllCols = () => scSlots.reduce((a, s) => a.concat(s.cols), []).concat(SCX.gateCols || []);
function scColliders(){
  const want = SCX.mode !== 'hole';
  for (const c of scAllCols()){ const at = colliders.indexOf(c); if (want && at < 0) colliders.push(c); else if (!want && at >= 0) colliders.splice(at, 1); }
}

/* the name plates on the front of the booths: one canvas holds all of them (2 columns x 4 rows of 512 x 128), one merged mesh shows them */
const scAtlasC = document.createElement('canvas'); scAtlasC.width = 1024; scAtlasC.height = 512;
const scAtlas = new THREE.CanvasTexture(scAtlasC); scAtlas.anisotropy = ANISO;
const scSignMat = new THREE.MeshBasicMaterial({map:scAtlas, toneMapped:false});
const scTrimMat = M('#24262b', {roughness:.4, metalness:.6});
{
  const faces = [], frames = [];
  for (const s of scSlots){
    const col = s.i % 2, row = s.i >> 1, u0 = col * .5, u1 = u0 + .5, v1 = 1 - row / 4, v0 = v1 - 1 / 4;
    const ph = Math.min(.74, s.h - .27), pw = ph * 4, py = .2 + (s.h - .2) / 2, pz = SC_BD / 2;
    const g = new THREE.PlaneGeometry(pw, ph), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) ? u1 : u0, uv.getY(k) ? v1 : v0);
    g.applyMatrix4(scMat(s, 0, py, pz + .05, 1, 1, 1)); faces.push(g);
    frames.push(new THREE.BoxGeometry(pw + .12, ph + .12, .05).applyMatrix4(scMat(s, 0, py, pz + .005, 1, 1, 1)));
  }
  scRoot.add(new THREE.Mesh(geoMergeUV(faces), scSignMat));
  const fm = new THREE.Mesh(geoMerge(frames), scTrimMat); scRoot.add(fm);
}
function scRoundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function scDrawSigns(){
  const g = scAtlasC.getContext('2d'); g.clearRect(0, 0, 1024, 512);
  const F = '"Noto Sans SC",sans-serif';
  for (const s of scSlots){
    const e = SCX.list[s.i], x = (s.i % 2) * 512, y = (s.i >> 1) * 128;
    g.save(); g.translate(x, y);
    const bg = g.createLinearGradient(0, 0, 0, 128); bg.addColorStop(0, '#1d2230'); bg.addColorStop(1, '#10131b'); g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    const ac = '#' + scBandCol(s.i).getHexString(); g.fillStyle = ac; g.fillRect(0, 0, 512, 5); g.fillRect(0, 123, 512, 5);
    /* rank badge */
    g.fillStyle = s.i < SC_TOP ? ac : '#2f3647'; g.beginPath(); g.arc(62, 64, 42, 0, 7); g.fill();
    g.fillStyle = s.i < SC_TOP ? '#1a1a1a' : '#e8edf5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 52px ${F}`; g.fillText(String(s.i + 1), 62, 67);
    g.textAlign = 'left';
    if (e){
      let nx = 124;
      if (e.demo || e.mine){
        const t = e.demo ? '示范' : '你'; g.font = `700 24px ${F}`; const tw = g.measureText(t).width + 16;
        g.fillStyle = e.demo ? '#5b6475' : '#e2714c'; scRoundRect(g, nx, 20, tw, 34, 8); g.fill(); g.fillStyle = '#fff'; g.fillText(t, nx + 8, 38); nx += tw + 10;
      }
      g.fillStyle = '#ffffff'; g.font = `700 38px ${F}`; let nm = e.name; while (g.measureText(nm).width > 496 - nx && nm.length > 1) nm = nm.slice(0, -1);
      g.fillText(nm, nx, 38);
      g.font = `500 22px ${F}`; g.fillStyle = '#8f9ab0'; g.fillText('总资产', 124, 93);
      const vx = 124 + g.measureText('总资产 ').width;
      g.font = `900 34px ${F}`; g.fillStyle = ac; g.fillText(scFmt(e.value), vx, 93);
      const vEnd = vx + g.measureText(scFmt(e.value)).width, cn = e.kind ? scCarName(e.kind) : '还没有车';
      g.font = `500 22px ${F}`; g.fillStyle = '#aab4c4'; g.textAlign = 'right';
      if (g.measureText(cn).width < 496 - vEnd - 14) g.fillText(cn, 496, 93);   /* long car names give way to the number */
    } else {
      g.fillStyle = '#c9d1de'; g.font = `700 34px ${F}`; g.fillText('虚位以待', 124, 46);
      g.fillStyle = '#8590a3'; g.font = `500 22px ${F}`; g.fillText(window.XNet && XNet.online ? '全服总资产前七名站上展台' : '联机后全服最有钱的七位站在这里', 124, 90);
    }
    g.restore();
  }
  scAtlas.needsUpdate = true;
}

/* the banner: two tall standing signs either side of the carpet where it leaves the road, gold characters written top to bottom
   like the name on the auditorium. They frame the way in and never stand between the road and the champion. */
{
  const COLS = [['豪', '车', '展', '台'], ['总', '资', '产', '前', '七']];
  const draw = (g, w, h) => {
    g.clearRect(0, 0, w, h);
    COLS.forEach((chars, c) => {
      const x0 = c * w / 2, cw = w / 2;
      const bg = g.createLinearGradient(x0, 0, x0 + cw, 0); bg.addColorStop(0, '#13161f'); bg.addColorStop(.5, '#262c3d'); bg.addColorStop(1, '#13161f'); g.fillStyle = bg; g.fillRect(x0, 0, cw, h);
      g.strokeStyle = '#e3b95a'; g.lineWidth = 6; g.strokeRect(x0 + 14, 14, cw - 28, h - 28); g.lineWidth = 2; g.strokeRect(x0 + 26, 26, cw - 52, h - 52);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = chars.length > 4 ? 136 : 160, gap = (h - 210) / chars.length;
      g.font = `900 ${fs}px "Noto Serif SC","Noto Sans SC",serif`;
      chars.forEach((ch, i) => { const y = 70 + gap * (i + .5); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(ch, x0 + cw / 2 + 4, y + 5); g.fillStyle = '#f3d68c'; g.fillText(ch, x0 + cw / 2, y); });
      g.font = '700 30px "Noto Sans SC",sans-serif'; g.fillStyle = '#c3cad6'; g.fillText(c ? '人和爱车一起上台' : 'XMUM AUTO SALON', x0 + cw / 2, h - 82);
    });
  };
  const t = scTex(512, 1024, draw);
  /* the web font may arrive after this file runs: draw the signs and the plates again once it is there */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { draw(t.image.getContext('2d'), 512, 1024); t.needsUpdate = true; if (SCX.list.length) scDrawSigns(); });
  const W = 1.1, H = 4.4, y = .55 + H / 2, z = SC_HD - 2.2, X = 4.3, faces = [], parts = [];
  SCX.gateCols = [];
  [-1, 1].forEach((sx, c) => {
    const x = sx * X;
    /* the same board on both faces, so it reads the right way from the road and from the plaza */
    for (const back of [0, 1]){
      const g = new THREE.PlaneGeometry(W, H), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (c + uv.getX(k)) / 2);
      if (back) g.rotateY(Math.PI);
      faces.push(g.translate(x, y, z + (back ? -.1 : .1)));
    }
    parts.push(new THREE.BoxGeometry(W + .2, H + .2, .18).translate(x, y, z), new THREE.BoxGeometry(W + .5, .45, .6).translate(x, .225, z),
      new THREE.BoxGeometry(W + .36, .14, .34).translate(x, y + H / 2 + .17, z));
    const [px, pz] = scW(x, z); SCX.gateCols.push({t:0, cx:px, cz:pz, hx:(W + .5) / 2 + .1, hz:.4, c:Math.cos(SC_ROT), s:Math.sin(SC_ROT)});
  });
  scRoot.add(new THREE.Mesh(geoMergeUV(faces), new THREE.MeshBasicMaterial({map:t, toneMapped:false})));
  const frame = new THREE.Mesh(geoMerge(parts), scTrimMat); frame.castShadow = true; frame.receiveShadow = true; scRoot.add(frame);
}
/* ---------- flowers: a pair of opening-day flower stands in front of every booth (two tiers for the front three) and a flower bed along their step ---------- */
const scStandMat = M('#b8934a', {roughness:.35, metalness:.7}), scRibbonMat = M('#c4262e', {roughness:.6, side:THREE.DoubleSide});
{
  const legs = [], ribbons = [];
  for (const s of scSlots){
    const top = s.i < SC_TOP, H = top ? 2.05 : 1.45;
    for (const sx of [-1, 1]){
      const x = sx * SC_STAND_X, z = SC_STAND_Z;
      for (let k = 0; k < 3; k++){
        const an = k * 2.094 + .5, ox = Math.cos(an) * .32, oz = Math.sin(an) * .32;
        const leg = new THREE.CylinderGeometry(.02, .025, H + .04, 5); leg.rotateZ(-ox * .18); leg.rotateX(oz * .18); leg.translate(x + ox / 2, H / 2, z + oz / 2);
        legs.push(leg.applyMatrix4(s.m));
      }
      legs.push(new THREE.CylinderGeometry(.3, .16, .2, 10).translate(x, H - .05, z).applyMatrix4(s.m));
      if (top) legs.push(new THREE.CylinderGeometry(.24, .13, .16, 10).translate(x, H - .78, z).applyMatrix4(s.m));
      /* two red ribbons hanging from the arrangement, a little turned out */
      for (const r of [-1, 1]) ribbons.push(new THREE.PlaneGeometry(.14, top ? 1.25 : .85).translate(0, -(top ? .62 : .42), 0).rotateY(r * .35)
        .translate(x + r * .22, H - .12, z + .3).applyMatrix4(s.m));
    }
  }
  const lm = new THREE.Mesh(geoMerge(legs), scStandMat); lm.castShadow = true; scRoot.add(lm);
  scRoot.add(new THREE.Mesh(geoMerge(ribbons), scRibbonMat));
}
const SC_FLORA = [
  ['#d92b3a', '#f4c430', '#ffffff', '#e8485a'],    /* 1: red and gold */
  ['#f39ab9', '#ffffff', '#f6d3e1', '#e46b9a'],    /* 2: pink and white */
  ['#9c6ad8', '#ffffff', '#f2a65a', '#c8a5f0'],    /* 3: violet, white, apricot */
  ['#f07f2a', '#f4c430', '#ffffff', '#e8485a', '#f39ab9']
];
const SC_LEAF = new THREE.Color('#3f8a3a');
const SC_BLOOMS = 1800;
const scBloom = scIM(new THREE.IcosahedronGeometry(1, 0), M('#ffffff', {roughness:.75}), SC_BLOOMS);
scBloom.castShadow = false;
function scFlowers(){
  const dense = XQ.cfg.particles >= .5, mm = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let n = 0;
  const put = (s, x, y, z, r, c, flat) => {
    if (n >= SC_BLOOMS) return;
    q.setFromAxisAngle(scY, x * 7 + z * 3);
    mm.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r * (flat ? 1.5 : 1), r * (flat ? .35 : .8), r * (flat ? 1.5 : 1)));
    scBloom.setMatrixAt(n, new THREE.Matrix4().multiplyMatrices(s.m, mm)); scBloom.setColorAt(n, flat ? SC_LEAF : col.set(c)); n++;
  };
  for (const s of scSlots){
    const top = s.i < SC_TOP, H = top ? 2.05 : 1.45, pal = SC_FLORA[Math.min(3, s.i)], rr = mkRng(77 + s.i * 13);
    const pick = () => pal[rr() * pal.length | 0];
    for (const sx of [-1, 1]){
      const x0 = sx * SC_STAND_X, z0 = SC_STAND_Z;
      /* a dome of blooms (fibonacci sphere, upper part), leaves round its base; a second ring lower down for the front three */
      const dome = (y0, R, cnt) => {
        const c = dense ? cnt : cnt >> 1;
        for (let k = 0; k < c; k++){
          const t = (k + .5) / c, yy = 1 - t * 1.25, rad = Math.sqrt(Math.max(0, 1 - yy * yy)), th = k * 2.39996;
          put(s, x0 + Math.cos(th) * rad * R, y0 + yy * R * .8, z0 + Math.sin(th) * rad * R, .085 + rr() * .045, pick());
        }
        for (let k = 0; k < (dense ? 10 : 6); k++){ const th = k / (dense ? 10 : 6) * 6.283; put(s, x0 + Math.cos(th) * R * .95, y0 - R * .3, z0 + Math.sin(th) * R * .95, .14, null, true); }
      };
      dome(H + .12, top ? .5 : .38, top ? 80 : 46);
      if (top) dome(H - .68, .36, 40);
    }
    /* flower bed on the step, in front of the plate, front three only */
    if (top) for (let k = 0, c = dense ? 54 : 26; k < c; k++){
      const t = k / (c - 1), x = (t - .5) * (SC_BW - .5), z = SC_BD / 2 + .12 + (k % 2) * .14;
      if (k % 3 === 0) put(s, x, .2, z, .12, null, true);
      put(s, x, .25 + rr() * .05, z, .075 + rr() * .03, pick());
    }
  }
  scBloom.count = n; scBloom.instanceMatrix.needsUpdate = true; if (scBloom.instanceColor) scBloom.instanceColor.needsUpdate = true;
}

/* ---------- fireworks ---------- */
const SC_FW = {cap:900, n:0, rockets:[], pos:null, col:null, v:null, life:null, max:null, base:null};
SC_FW.pos = new Float32Array(SC_FW.cap * 3); SC_FW.col = new Float32Array(SC_FW.cap * 3); SC_FW.v = new Float32Array(SC_FW.cap * 3);
SC_FW.life = new Float32Array(SC_FW.cap); SC_FW.max = new Float32Array(SC_FW.cap); SC_FW.base = new Float32Array(SC_FW.cap * 3);
const scFwGeo = new THREE.BufferGeometry();
scFwGeo.setAttribute('position', new THREE.BufferAttribute(SC_FW.pos, 3).setUsage(THREE.DynamicDrawUsage));
scFwGeo.setAttribute('color', new THREE.BufferAttribute(SC_FW.col, 3).setUsage(THREE.DynamicDrawUsage));
scFwGeo.setDrawRange(0, 0);
const scDot = scTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
const scFwMat = new THREE.PointsMaterial({size:.55, map:scDot, vertexColors:true, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false, toneMapped:false});
const scFw = new THREE.Points(scFwGeo, scFwMat); scFw.frustumCulled = false; scFw.visible = false; scFw.renderOrder = 4; scRoot.add(scFw);
const SC_FW_COLS = ['#ffd36a', '#ff5a6e', '#7fd4ff', '#b48cff', '#7cf0a0', '#ffffff', '#ff9a3c'];
function scSpark(x, y, z, vx, vy, vz, life, c){
  const F = SC_FW; if (F.n >= F.cap) return; const i = F.n++, j = i * 3;
  F.pos[j] = x; F.pos[j + 1] = y; F.pos[j + 2] = z; F.v[j] = vx; F.v[j + 1] = vy; F.v[j + 2] = vz;
  F.life[i] = F.max[i] = life; F.base[j] = c.r; F.base[j + 1] = c.g; F.base[j + 2] = c.b;
}
/* one rocket from behind booth i (or a random spot behind the fan) */
function scFire(i, big){
  if (!scRoot.visible) return;
  const s = scSlots[i] || scSlots[0], back = s.toPlaza((Math.random() - .5) * 3, -SC_BD / 2 - 1.5);
  const c1 = new THREE.Color(SC_FW_COLS[Math.random() * SC_FW_COLS.length | 0]), c2 = Math.random() < .5 ? new THREE.Color('#ffffff') : c1.clone().offsetHSL(.12, 0, 0);
  SC_FW.rockets.push({x:back[0], y:s.h + .5, z:back[1], vy:big ? 21 : 18, t:0, at:big ? 1.25 : 1 + Math.random() * .25, c1, c2,
    n:Math.round((big ? 150 : 100) * XQ.pick(.4, .75, 1)), ring:Math.random() < .3});
  scFw.visible = true;
}
function scBurst(r){
  for (let k = 0; k < r.n; k++){
    let vx, vy, vz;
    if (r.ring){ const th = k / r.n * 6.283; vx = Math.cos(th); vy = Math.sin(th) * .35 + .15; vz = Math.sin(th); }
    else { const u = Math.random() * 2 - 1, th = Math.random() * 6.283, q = Math.sqrt(1 - u * u); vx = q * Math.cos(th); vy = u; vz = q * Math.sin(th); }
    const sp = 7 + Math.random() * 2.5;
    scSpark(r.x, r.y, r.z, vx * sp, vy * sp + 1, vz * sp, 1.3 + Math.random() * .8, k % 3 ? r.c1 : r.c2);
  }
  /* a soft, distant thump; never loud, and only when you are close enough to see it */
  if (typeof tone === 'function' && Math.hypot(camera.position.x - SC_X, camera.position.z - SC_Z) < 120) try { tone('sine', 110, 45, .35, .025); } catch(e){}
}
function scFwStep(dt){
  const F = SC_FW, G = 4.5, drag = Math.exp(-1.6 * dt), day = scFwMat.blending !== THREE.AdditiveBlending;
  for (let k = F.rockets.length - 1; k >= 0; k--){
    const r = F.rockets[k]; r.t += dt; r.y += r.vy * dt; r.vy -= 3 * dt;
    scSpark(r.x + (Math.random() - .5) * .1, r.y, r.z + (Math.random() - .5) * .1, (Math.random() - .5) * .6, -1.5, (Math.random() - .5) * .6, .45, SC_FW_TRAIL);
    if (r.t >= r.at){ scBurst(r); F.rockets.splice(k, 1); }
  }
  for (let i = 0; i < F.n; i++){
    F.life[i] -= dt;
    if (F.life[i] <= 0){
      const last = --F.n; if (i !== last){
        const a = i * 3, b = last * 3;
        for (let c = 0; c < 3; c++){ F.pos[a + c] = F.pos[b + c]; F.v[a + c] = F.v[b + c]; F.base[a + c] = F.base[b + c]; }
        F.life[i] = F.life[last]; F.max[i] = F.max[last];
      }
      i--; continue;
    }
    const j = i * 3;
    F.v[j] *= drag; F.v[j + 2] *= drag; F.v[j + 1] = F.v[j + 1] * drag - G * dt;
    F.pos[j] += F.v[j] * dt; F.pos[j + 1] += F.v[j + 1] * dt; F.pos[j + 2] += F.v[j + 2] * dt;
    /* at night a spark fades to black (= invisible when added); by day the dots are drawn over the sky, so they keep their colour to the end */
    const f = F.life[i] / F.max[i], b = day ? 1 : f > .3 ? 1 : f / .3, tw = (day ? .88 : .75) + (day ? .12 : .25) * Math.sin(F.life[i] * 40 + i);
    F.col[j] = F.base[j] * b * tw; F.col[j + 1] = F.base[j + 1] * b * tw; F.col[j + 2] = F.base[j + 2] * b * tw;
  }
  scFwGeo.setDrawRange(0, F.n);
  scFwGeo.attributes.position.needsUpdate = true; scFwGeo.attributes.color.needsUpdate = true;
  if (!F.n && !F.rockets.length) scFw.visible = false;
}
const SC_FW_TRAIL = new THREE.Color('#ffc27a');

/* ---------- the cars ---------- */
function scDrop(s){
  if (!s.car) return;
  s.tt.remove(s.car.root); s.car.paint.dispose(); s.car = null; s.key = '';
}
function scBuild(s, e){
  const key = e && e.kind ? e.kind + '|' + e.look : '';
  if (key === s.key) return;
  scDrop(s); s.key = key; if (!key) return;
  const stock = (scShop(e.kind) || {}).color || '#888888';
  const c = makeCar(e.kind, stock, 0, 0, 0);
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);    /* scenery only: no physics, no traffic, nobody can drive it off */
  scene.remove(c.root); s.tt.add(c.root); c.root.position.set(0, .01, 0); c.root.rotation.set(0, 0, 0); c.root.scale.setScalar(SC_CAR_S);
  const L = scParse(e.look);
  try { carPaint(c, L.paint, L.decal, stock); } catch(err){}
  try { tnApply(c, L.fit); } catch(err){}
  c.paint.emissive.set(c.color0); c.paint.emissiveIntensity = .22 * Math.max(0, SCX.k);
  c.fineOn = SCX.fine; for (const m of c.fine) m.visible = SCX.fine;
  s.car = c; SCX.k = -1;
}

/* ---------- the 奶娃 on the booths: their own look, a car-show pose ---------- */
/* arm angles as in js/30-naiwa.js animNaiwa (left arm; the right one mirrors z). near = the arm on the car's side */
const SC_ARM = {
  rest:{sx:-.32, sz:.36, ex:-1.22, ez:-.32},
  hip:{sx:.05, sz:.95, ex:-.35, ez:-1.3},          /* elbows out, hands on the hips (clear of even the chubbiest belly) */
  up:{sx:-.1, sz:2.75, ex:-.3, ez:0},
  wave:{sx:-.35, sz:2.45, ex:-1.75, ez:-.2},
  show:{sx:-.62, sz:1.2, ex:-.28, ez:.12},
  flex:{sx:-.1, sz:1.42, ex:0, ez:1.75}             /* both upper arms out, forearms up: the arms are too short to fold across the belly */
};
/* target for one pose at time T: {near, far, ry (turn towards the car), roll, lean, lift, legs (stance), mouth} */
function scPoseAt(pose, T, ph){
  const A = SC_ARM, o = {near:A.hip, far:A.hip, ry:0, roll:0, lean:-.04, lift:0, legs:.09, mouth:.018};
  if (pose === 'hip'){ o.roll = .05 * Math.sin(T * .9 + ph); o.ry = .1 * Math.sin(T * .45 + ph); }
  else if (pose === 'wave'){ o.far = Object.assign({}, A.wave, {ez:-.2 + .38 * Math.sin(T * 7 + ph)}); o.roll = -.06; o.mouth = .035; o.ry = .12; }
  else if (pose === 'cheer'){
    const b = Math.abs(Math.sin(T * 3.4 + ph));
    o.near = Object.assign({}, A.up, {sz:A.up.sz + .14 * Math.sin(T * 6.8 + ph)}); o.far = Object.assign({}, A.up, {sz:A.up.sz - .14 * Math.sin(T * 6.8 + ph)});
    o.lift = b * .1; o.mouth = .075; o.lean = -.1; o.legs = .05;
  }
  else if (pose === 'show'){ o.near = A.show; o.ry = .32; o.roll = .05; o.lean = -.03; o.mouth = .03; }
  else if (pose === 'flex'){ const f = .12 * Math.sin(T * 2.6 + ph); o.near = Object.assign({}, A.flex, {ez:A.flex.ez + f}); o.far = Object.assign({}, A.flex, {ez:A.flex.ez - f}); o.lean = -.08; o.legs = .13; o.mouth = .03; }
  return o;
}
const SC_PK = ['sx', 'sz', 'ex', 'ez'];
function scFigure(s, e){
  const wear = e ? e.wear || '' : null;
  if (wear === s.wear) return;
  s.wear = wear;
  if (wear == null){ if (s.fig) s.fig.root.visible = false; return; }
  if (!s.fig){ s.fig = makeNaiwa(); s.fg.add(s.fig.root); }
  try { nwDress(s.fig, wdLookParse(wear), {shadow:XQ.atLeast('mid')}); } catch(err){ console.warn('[showcase] 换装失败', err); }
  s.fig.root.visible = true;
  s.P = null; scGlowFig(s, Math.max(0, SCX.k));
}
/* after dark the 奶娃 are lit as if by the booth spotlights: every material of the figure glows a little in its own colour.
   Each figure has its own materials (js/32-wardrobe.js builds them per item); the glowing skins keep their own emissive map. */
function scGlowFig(s, k){
  if (!s.fig) return;
  s.fig.root.traverse(m => {
    if (!m.isMesh) return;
    for (const x of [].concat(m.material)) if (x && x.emissive && !x.emissiveMap){
      if (x.map) x.emissive.setScalar(.1 * k);                  /* printed skins (星空, 鎏金…): a little light, or the print washes out */
      else x.emissive.copy(x.color).multiplyScalar(.25 * k);
    }
  });
}
function scAnimFig(s, dt, T){
  const N = s.fig, e = SCX.list[s.i]; if (!N || !N.root.visible || !e) return;
  let pose = e.pose;
  if (!SC_POSES[pose] || pose === 'auto') pose = SC_CYCLE[Math.floor((T + s.i * 2.7) / 6.5) % SC_CYCLE.length];
  const t = scPoseAt(pose, T, s.i * 1.7), near = s.sd > 0, k = s.P ? 1 - Math.exp(-dt * 5) : 1;
  /* the car is on the figure's +x (left arm) side when sd > 0 */
  const tl = near ? t.near : t.far, tr = near ? t.far : t.near;
  const P = s.P || (s.P = {L:{}, R:{}, ry:0, roll:0, lean:0, lift:0, legs:0, mouth:.018});
  for (const q of SC_PK){ P.L[q] = (P.L[q] == null ? tl[q] : P.L[q] + (tl[q] - P.L[q]) * k); P.R[q] = (P.R[q] == null ? tr[q] : P.R[q] + (tr[q] - P.R[q]) * k); }
  for (const q of ['ry', 'roll', 'lean', 'lift', 'legs', 'mouth']){ const v = q === 'ry' ? t.ry * s.sd : q === 'roll' ? t.roll * s.sd : t[q]; P[q] += (v - P[q]) * k; }
  const [aL, aR] = N.arms, [eL, eR] = N.elbows, [lL, lR] = N.legs;
  aL.rotation.set(P.L.sx, 0, P.L.sz); aR.rotation.set(P.R.sx, 0, -P.R.sz);
  eL.rotation.set(P.L.ex, 0, P.L.ez); eR.rotation.set(P.R.ex, 0, -P.R.ez);
  lL.rotation.set(0, 0, P.legs); lR.rotation.set(0, 0, -P.legs);
  N.body.rotation.set(P.lean, 0, P.roll); N.body.position.y = P.lift + Math.sin(T * 2 + s.i) * .006;
  N.root.rotation.y = P.ry;
  N.mouth.scale.y = Math.max(.018, P.mouth * .9);
  const blink = ((T + s.i * .9) % 3.7) < .12 ? .1 : 1; N.eyes[0].scale.y = N.eyes[1].scale.y = blink;
}

/* ---------- who stands where ---------- */
function scMyName(){
  try { if (window.XUI && typeof XUI.playerName === 'function'){ const n = String(XUI.playerName() || ''); if (n) return n; } } catch(e){}
  try { return localStorage.getItem('xmum-name') || '我'; } catch(e){ return '我'; }
}
function scRank(){
  const mine = scMine(), online = !!(window.XNet && XNet.online);
  const me = Object.assign({uid:online ? XNet.uid : 'me', name:(online && XNet.claimedName && XNet.claimedName()) || scMyName(), mine:true}, mine);
  let real, fill = [];
  if (online && SCX.remote){
    real = SCX.remote.filter(r => r.uid !== XNet.uid).concat([me]);
    fill = SC_DEMOS.slice().sort((a, b) => b.value - a.value);
  } else real = SC_DEMOS.concat([me]);
  real.sort((a, b) => b.value - a.value || (a.ts || 0) - (b.ts || 0));
  const out = real.slice(0, SC_N);
  /* offline you are always on show: if the demos crowd you out, you take the last place */
  if (!(online && SCX.remote) && !out.includes(me)) out[SC_N - 1] = me;
  for (const d of fill){ if (out.length >= SC_N) break; out.push(d); }
  while (out.length < SC_N) out.push(null);
  return out;
}
function scRefresh(){
  SCX.list = scRank();
  for (const s of scSlots){ const e = SCX.list[s.i]; scBuild(s, e); scFigure(s, e); }
  scDrawSigns();
  /* someone new on a booth, or a place changed hands: one rocket from each booth that changed (two at most) */
  const sig = SCX.list.map(e => e ? e.uid : '');
  if (SCX.sig){ let n = 0; for (let i = 0; i < SC_N && n < 2; i++) if (sig[i] !== SCX.sig[i] && sig[i]){ setTimeout(() => scFire(i, i === 0), n * 600); n++; } }
  SCX.sig = sig;
  if (SCX.my) scMyRender();
}
/* I made the display: a toast when I get a better place than last time, and the achievement for the front three */
function scCheckMine(){
  if (window.XQuest && XQuest.carLocked && XQuest.carLocked()) return;   /* story chapter 1, no car yet: no 「你上了豪车展台」 over 小满's welcome; it comes once the keys do */
  const i = SCX.list.findIndex(e => e && e.mine); if (i < 0) return;
  const rank = i + 1, e = SCX.list[i];
  if (rank <= SC_TOP && typeof unlock === 'function') unlock('showcase');
  if (!SCX.save.best || rank < SCX.save.best || e.kind !== SCX.save.kind){
    const first = !SCX.save.best, better = SCX.save.best && rank < SCX.save.best;
    SCX.save = {best:rank, kind:e.kind}; scWrite();
    if (SCX.my && !better && !first) return;   /* a car picked in 我的展位: you are looking at it already */
    if (typeof toast === 'function') toast(first ? '你上了豪车展台' : better ? `你在豪车展台排到第 ${rank} 名` : `你的展位换上了${scCarName(e.kind) || '新造型'}`,
      `陈华春音乐厅门前 · 第 ${rank} 名 · 总资产 ${scFmt(e.value)}`, 3000);
    if (typeof sfx !== 'undefined' && sfx.sparkle) sfx.sparkle();
    if (better || first) for (let k = 0; k < 3; k++) setTimeout(() => scFire(i, k === 2), k * 450);
  }
}
if (typeof achAdd === 'function') achAdd([['showcase', '豪车上展', '自己的奶娃和爱车站上陈华春音乐厅门前豪车展台的前三名', 30]]);

/* ---------- online: /showcase/{uid} ---------- */
const scDb = () => firebase.app().database();
const scOnline = () => !!(window.XNet && XNet.online && window.firebase && firebase.app);
async function scFetch(){
  if (!scOnline()) return;
  try {
    const snap = await scDb().ref('showcase').orderByChild('value').limitToLast(SC_N + 3).once('value'), out = [];
    snap.forEach(c => {
      const v = c.val() || {}, kind = String(v.car || ''), look = String(v.look || ''), wear = String(v.wear || '');
      if ((kind && !scOkCar(kind)) || !SC_LOOK_RE.test(look) || !SC_WEAR_RE.test(wear) || typeof v.name !== 'string' || !v.name) return;
      out.push({uid:c.key, name:v.name.slice(0, 16), kind, look:kind ? look : '', wear, pose:SC_POSES[v.pose] ? v.pose : 'auto', value:Math.max(0, Math.min(SC_MAX, +v.value || 0)), ts:+v.ts || 0});
    });
    SCX.remote = out; scRefresh();
  } catch(e){ if (!SCX.warned){ SCX.warned = true; console.warn('[showcase] 读取豪车展台失败', e); } }
}
/* my booth goes up when it changes: a new car / look / pose at most every 8 seconds, a changed 总资产 (more than 1 %) at most once a minute.
   Only with a registered nickname: the rules check it. */
async function scPush(){
  if (!scOnline()) return;
  const name = XNet.claimedName ? XNet.claimedName() : ''; if (!name) return;
  const m = scMine(), value = Math.min(SC_MAX, Math.round(m.value)), key = [name, m.kind, m.look, m.wear, m.pose].join('|'), now = Date.now();
  const moved = Math.abs(value - SCX.sentV) > Math.max(20, SCX.sentV * .01);
  if (key === SCX.sent ? !(moved && now - SCX.pushT > 60000) : now - SCX.pushT < 8000) return;
  SCX.pushT = now;
  try {
    await scDb().ref('showcase/' + XNet.uid).set({name, car:m.kind, look:m.look, wear:m.wear, pose:m.pose, value, ts:firebase.database.ServerValue.TIMESTAMP});
    SCX.sent = key; SCX.sentV = value;
  } catch(e){ if (!SCX.warned){ SCX.warned = true; console.warn('[showcase] 写入豪车展台失败（规则还没发布？）', e); } }
}

/* ---------- panels: details on F, and 我的展位 ---------- */
{ const st = document.createElement('style'); st.textContent = `
#scCard,#scMy{position:fixed;z-index:7;right:12px;top:calc(var(--safe-t, 0px) + 70px);width:310px;max-width:calc(100% - 24px);max-height:calc(100% - 180px);overflow:auto;box-sizing:border-box;
  padding:14px 16px 14px;border-top:3px solid var(--gold, #e3b95a);background:var(--panel-solid)}
#scCard[hidden],#scMy[hidden]{display:none}
#scCard h2,#scMy h2{font-family:var(--display);font-size:20px;margin:6px 28px 2px 0;letter-spacing:.03em}
#scCard .sc-own,#scMy .sc-own{font-size:13px;color:var(--muted);margin:0 0 10px}
#scCard .sc-own b,#scMy .sc-own b{color:var(--ink)}
#scCard .sc-val{font-family:var(--display);font-size:24px;font-weight:900;color:var(--tile);font-variant-numeric:tabular-nums;margin:0}
#scCard .sc-parts{font-size:12px;color:var(--muted);margin:2px 0 10px;line-height:1.6;font-variant-numeric:tabular-nums}
#scCard h3,#scMy h3{font-size:12px;letter-spacing:.06em;color:var(--muted);margin:10px 0 5px;font-weight:500}
#scCard ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:5px}
#scCard li{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:var(--card-bg)}
#scCard li.r{border-color:#7442c2}#scCard li.l{border-color:#e3b95a;background:rgba(227,185,90,.14)}
#scCard .sc-note,#scMy .sc-note{font-size:12px;color:var(--muted);line-height:1.6;margin:10px 0 0}
#scCard .sc-row,#scMy .sc-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
#scMy .sc-chips{display:flex;flex-wrap:wrap;gap:6px}
#scMy .sc-chip{font:inherit;font-size:12px;line-height:1.3;padding:5px 10px;min-height:30px;border-radius:999px;border:1px solid var(--line);background:var(--card-bg);color:var(--ink);cursor:pointer}
#scMy .sc-chip small{color:var(--muted);margin-left:4px;font-variant-numeric:tabular-nums}
#scMy .sc-chip.on{background:var(--gold, #e3b95a);border-color:var(--gold, #e3b95a);color:var(--on-accent, #1a1a1a)}
#scMy .sc-chip.on small{color:inherit;opacity:.75}
#scMy .sc-slot{display:grid;grid-template-columns:38px 1fr;gap:6px;align-items:start;margin-top:6px}
#scMy .sc-slot > span{font-size:12px;color:var(--muted);padding-top:7px}
@media (max-width:760px){ #scCard,#scMy{right:12px;left:12px;width:auto;max-width:none;top:auto;bottom:calc(var(--safe-b, 0px) + 200px);max-height:46vh;padding:12px 14px} #scCard h2,#scMy h2{font-size:18px} }`; document.head.appendChild(st); }
const scPanel = (id, label) => { const p = document.createElement('div'); p.className = 'panel'; p.id = id; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', label); document.body.appendChild(p); return p; };
const scCard = scPanel('scCard', '展位详情'), scMyEl = scPanel('scMy', '我的展位');
/* phones: sit just above the action buttons, whatever their size */
function scPlace(p){
  const acts = document.getElementById('acts'), r = acts && !acts.hidden ? acts.getBoundingClientRect() : null;
  /* phones held sideways get the side panel from css/style.css (手机横屏 2.0) instead */
  p.style.bottom = innerWidth <= 760 && !matchMedia('(max-height:520px) and (min-width:561px)').matches && r && r.height ? Math.round(innerHeight - r.top + 8) + 'px' : '';
}
function scClose(){ scCard.hidden = true; SCX.open = -1; scMyEl.hidden = true; SCX.my = false; }
const scWearNames = wear => { const l = wdLookParse(wear); return Object.keys(WD_DEFAULT).map(s => l[s]).filter(id => id && id !== 'classic' && id !== 'std').map(id => WD.byId[id]).filter(Boolean); };
function scOpen(i){
  const e = SCX.list[i]; if (!e) return;
  scClose(); SCX.open = i;
  const cr = e.mine && e.car ? e.car : scCarRM(e.kind, e.look), L = scParse(e.look), fit = e.mine && e.kind ? scFitOf(e.kind) : L.fit;
  const items = e.kind ? TN_SLOTS.map(sl => TN.byKey[sl.id + '.' + fit[sl.id]]).filter(it => it && it.id !== TN.stock[it.slot]) : [];
  const P = WD_PAINT[L.paint] || WD_PAINT.stock, D = WD_DECAL[L.decal] || WD_DECAL.none, wear = scWearNames(e.wear);
  const who = e.demo ? `示范「${scEsc(e.name)}」` : e.mine ? '你' + (e.name && e.name !== '我' ? '（' + scEsc(e.name) + '）' : '') : scEsc(e.name);
  let note = '';
  if (e.mine) note = scOnline() ? (XNet.claimedName && XNet.claimedName() ? '全服玩家路过都能看到你的展位。' : '先在标题页注册昵称，你的展位才会上全服展台。') : '联机时会和全服玩家一起按总资产排位。';
  else if (e.demo) note = scOnline() ? '示范只用来填空位，真实玩家永远排在它前面。' : '离线时你和示范一起排位，总资产比它们高就往中间站。';
  scCard.innerHTML = `<button class="x" aria-label="关闭">×</button><span class="tag">豪车展台 · 第 ${i + 1} 名</span>
    <h2>${who}</h2><p class="sc-own">姿势 <b>${SC_POSES[e.pose] || '轮换'}</b></p>
    <p class="sc-val">${scFmt(e.value)}</p><p class="sc-parts">总资产（现金 + 买过的车、改装、衣橱、喷漆和周边，按原价算）</p>
    <h3>装扮</h3><ul>${wear.length ? wear.map(it => `<li class="${it.tier || 'n'}">${scEsc(it.name)}</li>`).join('') : '<li>原味奶黄，什么都没穿</li>'}</ul>
    ${e.kind ? `<h3>展车 · ${scEsc(scCarName(e.kind))} · ${scFmt(cr.total)}</h3><p class="sc-parts" style="margin:0 0 5px">车价 ${scFmt(cr.price)} · 改装 ${scFmt(cr.mods)} · 喷漆贴花 ${scFmt(cr.paintRM)}</p>
    <ul><li class="${P.tier || 'n'}">${scEsc(P.name)}${P.fin && WD_FIN[P.fin] ? ' · ' + WD_FIN[P.fin].n : ''}</li>${D.id !== 'none' ? `<li class="${D.tier || 'n'}">贴花 · ${scEsc(D.name)}</li>` : ''}${items.map(it => `<li class="${it.tier}">${scEsc((TN_SLOTS.find(s => s.id === it.slot) || {}).name || '')} · ${scEsc(it.name)}</li>`).join('')}</ul>`
      : '<h3>展车</h3><ul><li>还没有车</li></ul>'}
    ${note ? `<p class="sc-note">${note}</p>` : ''}
    ${e.mine ? '<div class="sc-row"><button class="btn buy" data-sc="my">布置我的展位</button></div>' : ''}`;
  scCard.hidden = false; scPlace(scCard);
  if (typeof sfx !== 'undefined' && sfx.ding) sfx.ding();
}
/* 我的展位: which car, which look, which pose. Every tap shows on your booth straight away and is saved. */
function scMyOpen(){ scClose(); SCX.my = true; scMyRender(); scMyEl.hidden = false; scPlace(scMyEl); if (typeof sfx !== 'undefined' && sfx.ding) sfx.ding(); }
function scMyRender(){
  const top = scMyEl.scrollTop;   /* re-drawn when the list changes (your 总资产 goes up while it is open): keep the scroll */
  const i = SCX.list.findIndex(e => e && e.mine), m = scMine(), cars = scMyCars(), c = SCX.cfg;
  const chip = (attr, val, on, label, sub) => `<button type="button" class="sc-chip${on ? ' on' : ''}" ${attr}="${scEsc(val)}" aria-pressed="${on}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  const autoCar = cars[0];
  let carRow = cars.length ? chip('data-car', '', !c.car || !cars.some(x => x.kind === c.car), '最贵那辆', autoCar ? scEsc(scCarName(autoCar.kind)) : '')
    + cars.map(x => chip('data-car', x.kind, c.car === x.kind, scEsc(scCarName(x.kind)), scFmt(x.total))).join('') : '<span class="sc-note" style="margin:0">还没有车，去车行买一辆就能停上来</span>';
  const poses = Object.keys(SC_POSES).map(p => chip('data-pose', p, m.pose === p, SC_POSES[p])).join('');
  const fixed = c.wear != null;
  let wearHtml = chip('data-wmode', 'follow', !fixed, '跟着衣橱走') + chip('data-wmode', 'fixed', fixed, '展台专用一套');
  wearHtml = `<div class="sc-chips">${wearHtml}</div>`;
  if (fixed){
    const l = wdLookParse(m.wear);
    for (const [slot, sname] of WD_SLOTS){
      const own = WD_ITEMS.filter(it => it.slot === slot && (it.id === WD_DEFAULT[slot] || wardSave.own.has(it.id)));
      if (!own.length) continue;
      const opt = slot !== 'skin' && slot !== 'shape';
      if (!opt && own.length < 2) continue;
      wearHtml += `<div class="sc-slot"><span>${sname}</span><div class="sc-chips">${opt ? chip('data-wear', slot + ':', !l[slot], '不戴') : ''}${own.map(it => chip('data-wear', slot + ':' + it.id, l[slot] === it.id, scEsc(it.name))).join('')}</div></div>`;
    }
    wearHtml += `<div class="sc-row" style="margin-top:8px"><button type="button" class="btn" data-sc="copy">换成现在穿的这身</button></div>`;
  }
  const where = i >= 0 ? `现在第 <b>${i + 1}</b> 名 · 总资产 <b>${scFmt(m.value)}</b>` : `总资产 <b>${scFmt(m.value)}</b> · 前七名才上台`;
  const note = scOnline() ? (XNet.claimedName && XNet.claimedName() ? '改了马上存好，几秒内同步给全服玩家。' : '先在标题页注册昵称，你的展位才会上全服展台。') : '离线时你一定在台上；联机后和全服玩家一起按总资产排位。';
  scMyEl.innerHTML = `<button class="x" aria-label="关闭">×</button><span class="tag">豪车展台</span><h2>我的展位</h2><p class="sc-own">${where}</p>
    <h3>展示的车</h3><div class="sc-chips">${carRow}</div>
    <h3>姿势</h3><div class="sc-chips">${poses}</div>
    <h3>装扮</h3>${wearHtml}
    <p class="sc-note">${note}</p>
    <div class="sc-row">${window.XWard ? '<button type="button" class="btn" data-sc="ward">去衣橱</button>' : ''}${window.XTune ? '<button type="button" class="btn" data-sc="tune">去改装车间</button>' : ''}${window.XWard ? '<button type="button" class="btn" data-sc="paint">去喷漆店</button>' : ''}</div>`;
  scMyEl.scrollTop = top;
}
function scCfg(ch){
  Object.assign(SCX.cfg, ch); scWrite();
  SCX.mineKey = ''; scRefresh();
  if (typeof sfx !== 'undefined' && sfx.click) sfx.click(); else if (typeof tone === 'function') try { tone('square', 660, 660, .04, .03); } catch(e){}
  if (scOnline()) scPush();
}
function scGo(what){
  scClose(); if (typeof ac === 'function') ac();
  if (what === 'tune' && window.XTune) XTune.open(); else if (what === 'paint' && window.XWard) XWard.open('car'); else if (what === 'ward' && window.XWard) XWard.open('naiwa');
}
scCard.addEventListener('click', e => {
  if (e.target.closest('.x')){ scClose(); return; }
  const b = e.target.closest('[data-sc]'); if (!b) return;
  if (b.dataset.sc === 'my') scMyOpen(); else scGo(b.dataset.sc);
});
scMyEl.addEventListener('click', e => {
  if (e.target.closest('.x')){ scClose(); return; }
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.car != null) scCfg({car:d.car});
  else if (d.pose) scCfg({pose:d.pose});
  else if (d.wmode) scCfg({wear:d.wmode === 'fixed' ? (SCX.cfg.wear != null ? SCX.cfg.wear : scWearNow()) : null});
  else if (d.wear != null){
    const [slot, id] = d.wear.split(':'), l = wdLookParse(scMine().wear);
    l[slot] = id || null; scCfg({wear:wdLookStr(wdLook(l))});
  }
  else if (d.sc === 'copy') scCfg({wear:scWearNow()});
  else if (d.sc) scGo(d.sc);
});
document.addEventListener('keydown', e => { if ((!scCard.hidden || !scMyEl.hidden) && e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); scClose(); } }, true);
const scLocal = (x, z) => { const dx = x - SC_X, dz = z - SC_Z, c = Math.cos(SC_ROT), s = Math.sin(SC_ROT); return [dx * c - dz * s, dx * s + dz * c]; };
function scNear(){
  SCX.onPlaza = SCX.carNear = false;
  if (mode !== 'naiwa' || driving || nw.state === 'fly' || gx.paused) return -1;
  const [lx, lz] = scLocal(nw.x, nw.z); SCX.onPlaza = Math.abs(lx) < SC_HW + 1 && Math.abs(lz) < SC_HD + 2;
  if (!SCX.onPlaza) return -1;
  /* a car parked on the plaza: F gets you in, as everywhere else (js/90-main.js asks roomTryF first) */
  SCX.carNear = typeof nearestCar === 'function' && !!nearestCar(); if (SCX.carNear) return -1;
  let best = -1, bd = 1e9;
  for (const s of scSlots){ if (!SCX.list[s.i]) continue; const d = Math.hypot(nw.x - s.wx, nw.z - s.wz); if (d < 7 && d < bd){ bd = d; best = s.i; } }
  return best;
}

/* ---------- per frame ---------- */
function scFrame(dt, T){
  if (mode !== SCX.mode){ SCX.mode = mode; scColliders(); if (mode !== 'naiwa') scClose(); }
  const dx = camera.position.x - SC_X, dz = camera.position.z - SC_Z, d = Math.hypot(dx, dz);
  const vis = mode !== 'hole' && d < XQ.pick(200, 280, 360);
  if (vis !== SCX.vis){ SCX.vis = vis; scRoot.visible = vis; }
  if (!vis) return;
  const fine = d < XQ.pick(55, 80, 110);
  if (fine !== SCX.fine){ SCX.fine = fine; for (const s of scSlots) if (s.car){ s.car.fineOn = fine; for (const m of s.car.fine) m.visible = fine; } }
  for (const s of scSlots) if (s.car) s.tt.rotation.y += dt * (s.i ? .2 : .26);
  if (d < XQ.pick(70, 110, 150)) for (const s of scSlots) scAnimFig(s, dt, T);
  /* after dark: brighter light bands, glowing pools and columns, the paint lit as if by spotlights */
  const k = Math.round(Math.min(1, typeof cur !== 'undefined' ? cur.lamp || 0 : 0) * 50) / 50;
  if (k !== SCX.k){
    SCX.k = k;
    scBandMat.color.setScalar(.55 + .75 * k);
    scPoolMat.opacity = .1 + .6 * k; scBeamMat.opacity = .25 * k;
    for (const s of scSlots){ if (s.car) s.car.paint.emissiveIntensity = .22 * k; scGlowFig(s, k); }
    /* fireworks glow at night; by day they are bright confetti dots (additive dots vanish against the sky) */
    const add = k > .35; if ((scFwMat.blending === THREE.AdditiveBlending) !== add){ scFwMat.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending; scFwMat.size = add ? .55 : .95; scFwMat.needsUpdate = true; }
  }
  /* a rocket now and then after dark while someone is around (not on 流畅) */
  if (k > .5 && XQ.cfg.glow && d < 220 && !(typeof gx !== 'undefined' && gx.paused)){
    SCX.fwT -= dt;
    if (SCX.fwT <= 0){
      SCX.fwT = 14 + Math.random() * 12;
      const n = 1 + (Math.random() * 3 | 0);
      for (let j = 0; j < n; j++) setTimeout(() => scFire(Math.random() < .4 ? 0 : Math.random() * SC_N | 0, j === n - 1), j * 700);
    }
  }
  if (scFw.visible && dt > 0) scFwStep(Math.min(dt, .05));
}
/* refresh: my own booth every few seconds (cheap; rebuilds only what changed), the online list every two minutes while anywhere near */
setInterval(() => {
  const m = scMine(), key = [m.kind, m.look, m.wear, m.pose, Math.round(m.value)].join('|');
  if (key !== SCX.mineKey){ SCX.mineKey = key; scRefresh(); }
  if (mode === 'naiwa' && !gx.paused) scCheckMine();
  if (scOnline()){
    const now = Date.now(), near = Math.hypot(camera.position.x - SC_X, camera.position.z - SC_Z) < 600;
    if (!SCX.remote || (near && now - SCX.fetchT > 120000)){ SCX.fetchT = now; scFetch(); }
    scPush();
  }
}, 4000);
window.addEventListener('xnet', () => { if (scOnline() && !SCX.remote){ SCX.fetchT = Date.now(); scFetch(); } });
XQ.onChange(() => {
  scLayout(); scFlowers();
  SC_FW.cap = XQ.pick(300, 600, 900); SC_FW.n = Math.min(SC_FW.n, SC_FW.cap);
  for (const s of scSlots) if (s.fig) s.fig.root.traverse(x => { if (x.isMesh) x.castShadow = XQ.atLeast('mid'); });
});

/* ---------- hook into the game (js/80-gta.js gx, js/90-main.js doF and frame) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      const i = scNear(); SCX.near = i; SCX.prompt = '';
      let lbl = '';
      if (i >= 0){
        const e = SCX.list[i];
        SCX.prompt = (TOUCH ? '点「看看」' : '按 F ') + '看' + (e.mine ? '你的展位' : e.demo ? `示范「${e.name}」` : `${e.name} 的展位`) + ` · 第 ${i + 1} 名`;
        lbl = '看看';
      } else if (SCX.onPlaza && !SCX.carNear && !base.prompt()){
        SCX.prompt = (TOUCH ? '点「展位」' : '按 F ') + '布置我的展位：选车、装扮和姿势'; lbl = '展位';
      }
      if (lbl){ const b = actF.querySelector('b'); if (b.textContent !== lbl) b.textContent = lbl; }
      else if (SCX.fLbl) updateActs();
      SCX.fLbl = !!lbl;
      if (SCX.open >= 0){ const s = scSlots[SCX.open]; if (!s || Math.hypot(nw.x - s.wx, nw.z - s.wz) > 12 || driving) scClose(); }
      if (SCX.my && (!SCX.onPlaza || driving)) scClose();
    },
    prompt(){ return base.prompt() || SCX.prompt; },
    mini(dot){ base.mini(dot); dot(SC_X, SC_Z, '#e3b95a', 4); },
    leave(){ scClose(); SCX.prompt = ''; if (SCX.fLbl){ SCX.fLbl = false; updateActs(); } base.leave(); },
    frame(dt, T){ if (base.frame) base.frame(dt, T); scFrame(dt, T); }
  });
  const baseF = typeof window.roomTryF === 'function' ? window.roomTryF : null;
  window.roomTryF = function(){
    const i = scNear();
    if (i >= 0){ if (SCX.open === i) scClose(); else scOpen(i); return true; }
    if (SCX.onPlaza && !SCX.carNear && !(base.prompt && base.prompt())){ if (SCX.my) scClose(); else scMyOpen(); return true; }
    return baseF ? baseF() : false;
  };
}
scColliders();
setTimeout(scRefresh, 0);

/* for testing (预览版和本地测试页): XShowcase.list, .refresh(), .my() opens 我的展位, .fire(i) a rocket from booth i, .goto() puts 奶娃 in front of the champion */
window.XShowcase = {
  get list(){ return SCX.list; }, get cfg(){ return SCX.cfg; }, refresh:scRefresh, mine:scMine, demos:SC_DEMOS, fetch:scFetch, my:scMyOpen, fire:scFire,
  goto(){ const [x, z] = scW(0, SC_HD + 3); nw.x = x; nw.z = z; nw.h = SC_ROT + Math.PI; if (typeof camYaw !== 'undefined') camYaw = SC_ROT; }
};
