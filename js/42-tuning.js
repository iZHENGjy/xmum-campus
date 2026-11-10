/* XMUM 校园漫游 · 改装车：改装道具、零件目录，以及把零件真正装到车上（轮毂、宽体、尾翼、霓虹、排气、姿态）。
   界面、施工队列、存档和道具发放在 js/93-tuning-ui.js；接口说明见 docs/tuning.md。
   只改外观：每件零件都留了 perf 字段（加速 acc、极速 maxV、操控 grip），但 TN_PERF = 0 时不生效，等主人决定要不要性能改装。
   所有几何体按车型缓存、材质共用，换零件只是换几个 mesh，手机上一辆改装车多 4~6 个 draw call。
   车型借的是"夸张宽体碳纤维"那一路风格，不出现任何真实改装厂的名字和标志。 */
'use strict';

/* ---------- 改装道具（不能用钱买，只能玩出来；js/93-tuning-ui.js 的 XParts.grant 发放） ----------
   rm 是总资产里一件道具的估值（js/80-gta.js netWorth），from 是背包里告诉玩家去哪儿拿 */
const TN_PARTS = [
  {id:'rim',   name:'轮毂坯件', ch:'毂', color:'#7f93a8', rm:25,  from:'每送一单外卖，得来速也算'},
  {id:'lacq',  name:'赛车漆料', ch:'漆', color:'#e2714c', rm:20,  from:'得来速送达、挑战赛拿奖牌、B1 小游戏铜牌'},
  {id:'cf',    name:'碳纤维板', ch:'碳', color:'#3b3f46', rm:45,  from:'猴子大战获胜（金牌给 3 块）、宿舍撤离带出 RM 150 以上、挑战赛金牌、B1 银牌'},
  {id:'turbo', name:'涡轮',     ch:'涡', color:'#c39a3a', rm:80,  from:'抓住偷外卖的小偷、B1 小游戏金牌'},
  {id:'neon',  name:'霓虹灯管', ch:'灯', color:'#c04ae0', rm:30,  from:'宿舍撤离成功、送夜宵'},
  {id:'plan',  name:'改装图纸', ch:'图', color:'#3c80e0', rm:120, from:'每解锁一个成就、清空 Bell 通缉榜'}
];
const TN_PART = {}; for (const p of TN_PARTS) TN_PART[p.id] = p;

/* ---------- 零件目录 ----------
   槽位顺序就是联机外观字符串里的顺序（每个槽一个 36 进制字符），只能在末尾追加，不能改顺序；槽里的零件也只能往后加。
   每个槽的第一件是原厂件：免费、自带。min = 施工分钟数，need = 要消耗的道具，rm = 金币。 */
const TN_SLOTS = [
  {id:'rim',    name:'轮毂造型', tab:'wheel'},
  {id:'rimc',   name:'轮毂颜色', tab:'wheel'},
  {id:'size',   name:'尺寸 · 低扁胎', tab:'wheel'},
  {id:'wide',   name:'宽体', tab:'body'},
  {id:'lip',    name:'前铲', tab:'body'},
  {id:'skirt',  name:'侧裙', tab:'body'},
  {id:'diff',   name:'扩散器', tab:'body'},
  {id:'hood',   name:'引擎盖', tab:'body'},
  {id:'aero',   name:'套件材质', tab:'body'},
  {id:'wing',   name:'尾翼', tab:'wing'},
  {id:'neon',   name:'底盘霓虹', tab:'light'},
  {id:'neonc',  name:'霓虹颜色', tab:'light'},
  {id:'drl',    name:'日行灯', tab:'light'},
  {id:'exh',    name:'排气', tab:'exh'},
  {id:'low',    name:'降低车身', tab:'stance'},
  {id:'camber', name:'外倾角', tab:'stance'}
];
const TN_TABS = [['wheel', '轮毂'], ['body', '车身'], ['wing', '尾翼'], ['light', '灯光'], ['exh', '排气'], ['stance', '姿态']];
const TN_NEONC = {cyan:'#35e0ff', pink:'#ff5fb4', purple:'#a35cff', green:'#7dff5a', orange:'#ff8a2a', red:'#ff3344', white:'#f2f6ff'};
const TN_ITEMS = [
  /* 轮毂 */
  {slot:'rim', id:'stock', name:'原厂轮毂', desc:'出厂的五辐轮毂'},
  {slot:'rim', id:'mesh', name:'多辐轮毂', desc:'十四根细辐条，转起来像一张网', rm:180, need:{rim:2}, min:6, style:'mesh'},
  {slot:'rim', id:'dish', name:'深唇轮毂', desc:'镀铬外唇往外翻，轮辐缩在很深的位置', rm:260, need:{rim:3, lacq:1}, min:10, style:'dish'},
  {slot:'rim', id:'forged', name:'锻造 Y 辐', desc:'六组 Y 形辐条，又轻又凶', rm:420, need:{rim:3, cf:1}, min:15, style:'forged', tier:'r', perf:{acc:.01}},
  {slot:'rim', id:'turbine', name:'涡扇轮毂', desc:'十二片扭转叶片，开起来像涡轮在转', rm:380, need:{rim:3, turbo:1}, min:15, style:'turbine', tier:'r'},
  {slot:'rim', id:'glow', name:'发光轮毂', desc:'轮圈内侧一圈灯带，颜色跟霓虹走，夜里最显眼', rm:560, need:{rim:2, neon:2}, min:20, style:'glow', tier:'l'},
  {slot:'rimc', id:'stock', name:'原厂银', col:'#c4c8cc'},
  {slot:'rimc', id:'black', name:'亮黑', col:'#202226', rm:40, need:{lacq:1}, min:2},
  {slot:'rimc', id:'gun', name:'枪灰', col:'#4d525a', rm:40, need:{lacq:1}, min:2},
  {slot:'rimc', id:'bronze', name:'古铜', col:'#8f6b38', rm:60, need:{lacq:1}, min:3},
  {slot:'rimc', id:'red', name:'赛车红', col:'#c8302a', rm:60, need:{lacq:1}, min:3},
  {slot:'rimc', id:'white', name:'珍珠白', col:'#eeece6', rm:60, need:{lacq:1}, min:3},
  {slot:'rimc', id:'gold', name:'香槟金', col:'#d2b06a', rm:90, need:{lacq:2}, min:3, tier:'r'},
  {slot:'size', id:'stock', name:'原厂尺寸', s:1, lp:.66},
  {slot:'size', id:'s1', name:'大一寸', desc:'轮毂更大、胎壁更薄', rm:120, need:{rim:1}, min:4, s:1.04, lp:.74},
  {slot:'size', id:'s2', name:'大两寸 · 低扁胎', desc:'轮毂撑满轮拱，胎壁薄得像一条线', rm:300, need:{rim:2}, min:10, s:1.08, lp:.82, tier:'r', perf:{grip:.01}},
  /* 车身 */
  {slot:'wide', id:'stock', name:'原厂车身'},
  {slot:'wide', id:'wide', name:'宽体轮眉', desc:'四个轮眉外扩，轮距每边加宽 12 厘米', rm:1200, need:{cf:4, plan:1}, min:45, tier:'l', perf:{grip:.02}},
  {slot:'lip', id:'none', name:'不装'},
  {slot:'lip', id:'lip', name:'前铲', desc:'车头下面一块贴地的平板', rm:220, need:{cf:1}, min:8},
  {slot:'lip', id:'canard', name:'前铲 + 风刀', desc:'前铲再加车头两侧的四片风刀', rm:360, need:{cf:2}, min:12, tier:'r'},
  {slot:'skirt', id:'none', name:'不装'},
  {slot:'skirt', id:'skirt', name:'侧裙', desc:'两侧车门下面的裙边，车身看起来更低', rm:200, need:{cf:1}, min:8},
  {slot:'diff', id:'none', name:'不装'},
  {slot:'diff', id:'diff', name:'扩散器', desc:'车尾下面一排导流片', rm:280, need:{cf:2}, min:12},
  {slot:'hood', id:'stock', name:'原厂引擎盖'},
  {slot:'hood', id:'vents', name:'双进气口', desc:'引擎盖上两个带格栅的散热口', rm:260, need:{cf:1, turbo:1}, min:12},
  {slot:'hood', id:'scoop', name:'顶置大进气', desc:'引擎盖正中一个大进气口', rm:340, need:{cf:2, turbo:1}, min:15, tier:'r'},
  {slot:'aero', id:'body', name:'车身同色', desc:'前铲、侧裙、尾翼、轮眉跟车漆一个颜色'},
  {slot:'aero', id:'black', name:'亮黑套件', desc:'所有外挂件刷成钢琴黑', rm:120, need:{lacq:2}, min:5},
  {slot:'aero', id:'carbon', name:'碳纤维套件', desc:'所有外挂件换成裸碳，看得见编织纹', rm:500, need:{cf:4}, min:20, tier:'r'},
  /* 尾翼 */
  {slot:'wing', id:'none', name:'不装'},
  {slot:'wing', id:'duck', name:'鸭尾', desc:'车尾翘起一道小边', rm:240, need:{cf:1}, min:8},
  {slot:'wing', id:'gt', name:'大尾翼', desc:'两根立柱撑起一片大翼板，带端板', rm:650, need:{cf:3, plan:1}, min:30, tier:'r', perf:{grip:.02}},
  {slot:'wing', id:'swan', name:'鹅颈双层尾翼', desc:'立柱从上面吊住翼板，再加一层襟翼，最夸张的一款', rm:900, need:{cf:4, turbo:1, plan:1}, min:40, tier:'l', perf:{grip:.03}},
  /* 灯光 */
  {slot:'neon', id:'none', name:'不装'},
  {slot:'neon', id:'kit', name:'底盘霓虹', desc:'车底一圈灯管，地上映出一片光，天黑以后更亮', rm:300, need:{neon:3}, min:12},
  {slot:'neonc', id:'cyan', name:'冰蓝', col:TN_NEONC.cyan},
  {slot:'neonc', id:'pink', name:'樱粉', col:TN_NEONC.pink, rm:60, need:{neon:1}, min:3},
  {slot:'neonc', id:'purple', name:'电紫', col:TN_NEONC.purple, rm:60, need:{neon:1}, min:3},
  {slot:'neonc', id:'green', name:'酸绿', col:TN_NEONC.green, rm:60, need:{neon:1}, min:3},
  {slot:'neonc', id:'orange', name:'熔橙', col:TN_NEONC.orange, rm:60, need:{neon:1}, min:3},
  {slot:'neonc', id:'red', name:'警灯红', col:TN_NEONC.red, rm:60, need:{neon:1}, min:3},
  {slot:'neonc', id:'white', name:'极光白', col:TN_NEONC.white, rm:60, need:{neon:1}, min:3},
  {slot:'drl', id:'none', name:'不装'},
  {slot:'drl', id:'bar', name:'贯穿灯带', desc:'车头一整条白光', rm:160, need:{neon:1}, min:5},
  {slot:'drl', id:'fang', name:'獠牙灯', desc:'两侧各一道折线，像獠牙', rm:200, need:{neon:1}, min:6},
  {slot:'drl', id:'quad', name:'四眼点阵', desc:'每边两颗方灯', rm:180, need:{neon:1}, min:5},
  /* 排气 */
  {slot:'exh', id:'stock', name:'原厂排气'},
  {slot:'exh', id:'dual', name:'双边双出', desc:'左右各一根镀铬尾喉，大脚油门会喷火', rm:220, need:{turbo:1}, min:8, n:2},
  {slot:'exh', id:'quad', name:'钛烤蓝四出', desc:'四根烧成蓝紫色的钛尾喉，喷火更猛，松油门还会放炮', rm:420, need:{turbo:2}, min:15, n:4, ti:true, tier:'r', perf:{acc:.02}},
  /* 姿态 */
  {slot:'low', id:'stock', name:'原厂高度', drop:0},
  {slot:'low', id:'l1', name:'降低 4 厘米', rm:160, need:{rim:1}, min:6, drop:.04},
  {slot:'low', id:'l2', name:'趴地 8 厘米', desc:'轮胎吃进轮拱里', rm:360, need:{rim:2, turbo:1}, min:15, drop:.08, tier:'r', perf:{grip:.01}},
  {slot:'camber', id:'stock', name:'原厂外倾', deg:0},
  {slot:'camber', id:'c3', name:'外倾 3°', desc:'轮胎上沿往里收', rm:100, need:{rim:1}, min:4, deg:3},
  {slot:'camber', id:'c7', name:'外倾 7°', desc:'八字脚，停着都很嚣张', rm:200, need:{rim:2}, min:8, deg:7, tier:'r'}
];
const TN = {byKey:{}, bySlot:{}, stock:{}};
for (const s of TN_SLOTS) TN.bySlot[s.id] = [];
for (const it of TN_ITEMS){
  it.key = it.slot + '.' + it.id; it.rm = it.rm || 0; it.need = it.need || {}; it.min = it.min || 0; it.tier = it.tier || 'n';
  it.perf = Object.assign({acc:0, maxV:0, grip:0}, it.perf || {});
  TN.byKey[it.key] = it; TN.bySlot[it.slot].push(it); if (!TN.stock[it.slot]) TN.stock[it.slot] = it.id;
}
/* only the cars the 车行 sells can be tuned */
const TN_KINDS = ['myvi', 'p911', 'mase', 'lambo', 'rr'];
/* a full fit: every slot gets an id; unknown or missing ones fall back to stock */
function tnFit(f){
  const o = {}; for (const s of TN_SLOTS){ const id = f && f[s.id]; o[s.id] = id && TN.byKey[s.id + '.' + id] ? id : TN.stock[s.id]; }
  return o;
}
/* what an item is worth in 总资产: coins plus the parts it used */
const tnWorth = it => it.rm + Object.keys(it.need).reduce((s, p) => s + (TN_PART[p] ? TN_PART[p].rm * it.need[p] : 0), 0);
/* 性能改装：先不开。改成 1 就按零件的 perf 字段加成（js/93-tuning-ui.js 包在 tunedT 外面） */
const TN_PERF = 0;

/* online look: 'tk' + one base-36 char per slot (index of the item in its slot); [a-z0-9] only, fits the /looks rule */
function tnToken(fit){
  fit = tnFit(fit); let s = 'tk', any = false;
  for (const sl of TN_SLOTS){ const i = Math.max(0, TN.bySlot[sl.id].findIndex(it => it.id === fit[sl.id])); if (i) any = true; s += i.toString(36); }
  return any ? s : '';
}
function tnFromToken(str){
  const t = String(str || '').split(',').find(x => /^tk[0-9a-z]+$/.test(x)); if (!t) return null;
  const o = {}; TN_SLOTS.forEach((sl, i) => { const it = TN.bySlot[sl.id][parseInt(t[2 + i] || '0', 36)]; if (it) o[sl.id] = it.id; });
  return tnFit(o);
}

/* ---------- materials (shared, never disposed by the online ghosts) ---------- */
const tnCarbonTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  /* 2x2 twill: tows of 8 px, alternating direction, each with a soft highlight */
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const along = ((x + y) >> 1) % 2 === 0, gr = along ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, '#1a1c20'); gr.addColorStop(.5, along ? '#4a4f58' : '#363a42'); gr.addColorStop(1, '#16181b');
    g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.keep = true; return t;
})();
const tnNeonTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), im = g.createImageData(128, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++){
    const dx = Math.max(0, Math.abs(x - 63.5) - 36) / 28, dy = Math.max(0, Math.abs(y - 31.5) - 10) / 22, d = Math.min(1, Math.hypot(dx, dy)), k = (y * 128 + x) * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.pow(1 - d, 1.8) * (d < .02 ? .8 : 1));
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.keep = true; return t;
})();
const TN_MAT = {
  black:M('#141518', {roughness:.22, metalness:.35}),
  carbon:new THREE.MeshStandardMaterial({map:tnCarbonTex, roughness:.3, metalness:.35}),
  chrome:CAR_MAT.chrome,
  ti:M('#8d86cc', {roughness:.22, metalness:.85}),
  dark:M('#0d0e10', {roughness:.6}),
  drl:new THREE.MeshBasicMaterial({color:'#eef6ff'})
};
for (const k in TN_MAT) TN_MAT[k].keep = true;
const tnNeonMats = {};
/* per neon colour: the tubes, the glow on the ground (opacity follows day / night, js/93-tuning-ui.js), the glowing rim ring */
function tnNeonMat(col){
  if (tnNeonMats[col]) return tnNeonMats[col];
  const tube = new THREE.MeshBasicMaterial({color:col}), pool = new THREE.MeshBasicMaterial({map:tnNeonTex, color:col, transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
    polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48});
  tube.keep = pool.keep = true;
  return tnNeonMats[col] = {tube, pool};
}

/* ---------- where things go on each car: sampled once from the car's own body shell ---------- */
const tnAnc = {};
function tnAnchors(kind){
  if (tnAnc[kind]) return tnAnc[kind];
  /* the shells are extruded profiles with big flat faces (few vertices), so probe them with rays instead of reading vertices */
  const T = CAR_T[kind], geo = carParts(kind, T).paint, p = geo.attributes.position;
  let zf = -1e9, zr = 1e9;
  for (let i = 0; i < p.count; i++){ const z = p.getZ(i); if (z > zf) zf = z; if (z < zr) zr = z; }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({side:THREE.DoubleSide})); mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
  const hit = () => { rc.set(o, d); const h = rc.intersectObject(mesh, false); return h.length ? h[0].point : null; };
  const topY = (z, x) => { o.set(x || 0, 6, z); d.set(0, -1, 0); const h = hit(); return h ? h.y : T.H * .6; };
  const botY = (z, x) => { o.set(x || 0, -2, z); d.set(0, 1, 0); const h = hit(); return h ? h.y : .25; };
  /* the outermost point of the nose (s = 1) or tail (s = -1) at (x, y) */
  const endZ = (x, y, s) => { o.set(x, y, s * 20); d.set(0, 0, -s); const h = hit(); return h ? h.z : s > 0 ? zf - .05 : zr + .05; };
  return tnAnc[kind] = {T, zf, zr, ybF:botY(zf - .2), ybR:botY(zr + .2), ybM:botY(0, T.W / 2 - .12), noseTop:topY(zf - .08), deck:topY(zr + .3),
    hoodA:topY(zf - .95), hoodB:topY(zf - .55), endZ};
}
/* planar texture coordinates from the dominant normal, so the carbon weave shows on any shape */
function tnUV(g, k){
  const p = g.attributes.position, nm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    const ax = Math.abs(nm.getX(i)), ay = Math.abs(nm.getY(i)), az = Math.abs(nm.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/* ---------- wheels: tyre + rim in one vertex-coloured geometry, like carWheelGeo in js/40-vehicles.js ---------- */
const tnWheelCache = {};
function tnWheelGeo(r, style, col, lp){
  if (style === 'stock' && col === TN.byKey['rimc.stock'].col && lp === .66) return carWheelGeo(r);
  const key = [r.toFixed(3), style, col, lp].join('|');
  if (tnWheelCache[key]) return tnWheelCache[key];
  const h = Math.max(.12, Math.min(.17, r * .4)), a = lp * r, b = a + (r - a) * .7, dd = style === 'dish' ? .1 : style === 'forged' ? .03 : .045;
  const pr = [[0, -h], [a, -h], [b, -h], [r, -h + .04], [r, h - .04], [b, h], [a + .015, h],
    [a, h - .012], [a * .95, h - .022], [a * .9, h - dd], [a * .34, h - dd - .012], [a * .18, h - .03], [0, h - .03]];
  const lg = new THREE.LatheGeometry(pr.map(([x, y]) => new THREE.Vector2(x, y)), 20), n = lg.attributes.position.count, cl = new Float32Array(n * 3);
  const rimC = new THREE.Color(col), lipC = style === 'dish' ? new THREE.Color('#e9ecef') : rimC, hubC = rimC.clone().multiplyScalar(.7), tyre = new THREE.Color('#1b1b1d');
  for (let i = 0; i < n; i++){ const j = i % pr.length, c = j < 7 ? tyre : j < 9 ? lipC : j < 11 ? rimC : hubC; cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; }
  lg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  const parts = [lg], yf = h - dd - .006;
  /* one spoke on the rim face: from radius r0 to r1, w wide, twisted by tw (turbine blades), at angle ang */
  const spoke = (ang, r0, r1, w, t, tw, c) => parts.push(geoTint(geoAt(new THREE.BoxGeometry(w, t, r1 - r0), 0, yf, (r0 + r1) / 2, 0, 0, tw || 0).rotateY(ang), c || col));
  if (style === 'mesh') for (let k = 0; k < 14; k++) spoke(k * Math.PI * 2 / 14, a * .2, a * .93, .022, .026);
  else if (style === 'dish') for (let k = 0; k < 5; k++) spoke(k * Math.PI * 2 / 5, a * .2, a * .9, .085, .03);
  else if (style === 'forged') for (let k = 0; k < 6; k++){
    const A = k * Math.PI / 3; spoke(A, a * .18, a * .58, .05, .032);
    for (const s of [-1, 1]) parts.push(geoTint(geoAt(new THREE.BoxGeometry(.034, .03, a * .42), s * a * .05, yf, a * .74, 0, s * .2, 0).rotateY(A), col));
  }
  else if (style === 'turbine') for (let k = 0; k < 12; k++) spoke(k * Math.PI / 6, a * .24, a * .92, .1, .012, .75);
  else for (let k = 0; k < 5; k++) spoke(k * Math.PI * 2 / 5, a * .2, a * .9, .055, .03);   /* glow: plain five-spoke, the ring does the talking */
  const g = geoMerge(parts); g.rotateZ(-Math.PI / 2); g.keep = true;
  return tnWheelCache[key] = g;
}
const tnRingGeo = {};
function tnRing(r, lp){
  const key = r.toFixed(3) + '|' + lp; if (tnRingGeo[key]) return tnRingGeo[key];
  const h = Math.max(.12, Math.min(.17, r * .4)), g = new THREE.TorusGeometry(lp * r * .965, .017, 6, 36).rotateY(Math.PI / 2).translate(h - .02, 0, 0); g.keep = true;
  return tnRingGeo[key] = g;
}

/* ---------- body parts, per car kind and combination (cached) ---------- */
const tnBodyCache = {};
function tnBody(kind, fit){
  const key = kind + '|' + ['wide', 'lip', 'skirt', 'diff', 'hood', 'wing', 'drl', 'exh', 'size'].map(s => fit[s]).join(',');
  if (tnBodyCache[key]) return tnBodyCache[key];
  const A = tnAnchors(kind), T = A.T, W = T.W, W2 = W / 2, wide = fit.wide === 'wide', P = {aero:[], black:[], metal:[], drl:[]}, tips = [];
  const put = (k, g) => { P[k].push(g); return g; };
  const box = (k, w, h, d, x, y, z, rx, ry, rz) => put(k, geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz));
  const rbx = (k, w, h, d, r, x, y, z, rx, ry, rz) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx, ry, rz));
  const sym = f => { f(-1); f(1); };
  /* 宽体：bolted-on arches over every wheel, extruded outward from the body side */
  if (wide){
    const sz = TN.byKey['size.' + fit.size].s, ri = T.r * sz + .1, ro = ri + .11;
    for (const zc of [-T.wb / 2, T.wb / 2]) sym(s => {
      const sh = new THREE.Shape(), a0 = .08, a1 = Math.PI - .08;
      for (let i = 0; i <= 14; i++){ const t = a0 + (a1 - a0) * i / 14; sh[i ? 'lineTo' : 'moveTo'](Math.cos(t) * ro, Math.sin(t) * ro); }
      for (let i = 14; i >= 0; i--){ const t = a0 + (a1 - a0) * i / 14; sh.lineTo(Math.cos(t) * ri, Math.sin(t) * ri); }
      const g = new THREE.ExtrudeGeometry(sh, {depth:.24, bevelEnabled:true, bevelThickness:.02, bevelSize:.02, bevelSegments:1, curveSegments:4});
      g.rotateY(-Math.PI / 2); g.translate(s > 0 ? W2 + .14 : -(W2 - .1), T.r, zc);
      put('aero', g);
      /* a strip of exposed bolts along the arch */
      for (let i = 1; i < 8; i++){ const t = a0 + (a1 - a0) * i / 8; box('black', .02, .025, .025, s * (W2 + .165), T.r + Math.sin(t) * (ri + ro) / 2, zc + Math.cos(t) * (ri + ro) / 2); }
    });
  }
  /* 前铲 (+ 风刀) */
  if (fit.lip !== 'none'){
    const y = A.ybF - .012, w = W * .9 + (wide ? .2 : 0), zb = A.endZ(0, A.ybF + .05, 1);   /* the nose is often rounded: hang it under the bumper, not the bonnet tip */
    rbx('aero', w, .032, .3, .014, 0, y, zb - .1);
    rbx('black', w * .9, .05, .05, .015, 0, y + .035, zb - .22);
    if (fit.lip === 'canard') sym(s => { for (const k of [0, 1]){ const y = A.ybF + .09 + k * .09, x = s * (W2 - .05 + (wide ? .06 : 0)); rbx('aero', .025, .028, .17, .01, x, y, A.endZ(x, y, 1) - .09, 0, -s * .22, s * .2); } });
  }
  /* 侧裙 */
  if (fit.skirt !== 'none'){
    const L = T.wb - 2 * (T.r + .14), x = W2 + (wide ? .13 : .03);
    sym(s => { rbx('aero', .07, .11, L, .02, s * x, A.ybM + .03, 0); rbx('aero', .16, .025, L, .01, s * (x - .03), A.ybM - .02, 0); });
  }
  /* 扩散器 */
  if (fit.diff !== 'none'){
    const y = A.ybR + .01, z = A.endZ(0, A.ybR + .05, -1) + .2;
    box('black', W * .74, .03, .48, 0, y, z, -.16);
    for (let i = 0; i < 5; i++) box('aero', .02, .13, .44, (i - 2) * W * .15, y + .05, z - .02, -.16);
  }
  /* 引擎盖：follow the slope of the bonnet */
  if (fit.hood !== 'stock'){
    const z = A.zf - .75, y = (A.hoodA + A.hoodB) / 2, rx = Math.atan2(A.hoodA - A.hoodB, .4);
    if (fit.hood === 'vents') sym(s => {
      rbx('aero', .3, .06, .38, .025, s * .3, y + .02, z, rx);
      for (let i = 0; i < 4; i++) box('black', .24, .012, .03, s * .3, y + .055, z - .12 + i * .08, rx);
    });
    else { rbx('aero', .52, .13, .62, .05, 0, y + .05, z - .05, rx); rbx('black', .4, .07, .03, .02, 0, y + .07, z + .25, rx); }
  }
  /* 尾翼 */
  if (fit.wing !== 'none'){
    const roof = A.deck > T.H * .85, d = A.deck, z = A.zr + (roof ? .32 : .3);
    if (fit.wing === 'duck'){
      const sh = new THREE.Shape([new THREE.Vector2(.2, 0), new THREE.Vector2(-.05, 0), new THREE.Vector2(-.11, .1), new THREE.Vector2(.2, .015)]);
      const g = new THREE.ExtrudeGeometry(sh, {depth:W * .82, bevelEnabled:false}); g.rotateY(-Math.PI / 2); g.translate(W * .41, d - .01, A.zr + .2); put('aero', g);
    } else {
      const swan = fit.wing === 'swan', hh = (swan ? .44 : .34) * (roof ? .5 : 1), ww = W * (swan ? 1.04 : .96) + (wide ? .2 : 0), y = d + hh;
      rbx('aero', ww, .045, .32, .018, 0, y, z, .12);
      const ep = roof ? .55 : 1;   /* a roof spoiler on a hatchback gets small end plates */
      sym(s => rbx('aero', .022, .22 * ep, .4 * ep, .01, s * ww / 2, y + .02 * ep, z, 0));
      if (swan){
        rbx('aero', ww * .97, .03, .16, .012, 0, y + .085, z - .15, .45);
        sym(s => { put('aero', rodGeo(.022, .022, [s * W * .26, d, z + .18], [s * W * .26, y + .1, z + .02], 6)); put('aero', rodGeo(.022, .022, [s * W * .26, y + .1, z + .02], [s * W * .26, y + .03, z - .06], 6)); });
      } else sym(s => box('aero', .04, hh, .14, s * W * .28, d + hh / 2, z + .03));
    }
  }
  /* 日行灯：thin light tubes laid on the nose */
  if (fit.drl !== 'none'){
    const y = A.ybF + (A.noseTop - A.ybF) * .58, at = (x, yy) => [x, yy, A.endZ(x, yy, 1) + .012];
    const line = pts => { for (let i = 0; i + 1 < pts.length; i++) put('drl', rodGeo(.014, .014, pts[i], pts[i + 1], 5)); };
    if (fit.drl === 'bar'){ const pts = []; for (let i = 0; i <= 12; i++) pts.push(at(-W * .38 + W * .76 * i / 12, y)); line(pts); }
    else if (fit.drl === 'fang') sym(s => line([at(s * W * .2, y), at(s * W * .3, y), at(s * W * .4, y), at(s * W * .43, y - .07), at(s * W * .41, y - .14)]));
    else sym(s => { for (const x of [.28, .38]){ const [px, py, pz] = at(s * W * x, y); box('drl', .07, .045, .02, px, py, pz); } });
  }
  /* 排气 */
  if (fit.exh !== 'stock'){
    const it = TN.byKey['exh.' + fit.exh], xs = it.n === 4 ? [.24, .34] : [.3], y = A.ybR + .1;
    sym(s => xs.forEach(x => {
      const px = s * W * x, z = A.endZ(px, y, -1);
      put('metal', geoAt(new THREE.CylinderGeometry(.058, .052, .22, 14, 1, true), px, y, z, Math.PI / 2));
      put('metal', geoAt(new THREE.TorusGeometry(.055, .008, 5, 14), px, y, z - .11));
      box('black', .08, .08, .01, px, y, z - .07);
      tips.push([px, y, z - .12]);
    }));
  }
  const out = {tips};
  for (const k in P) if (P[k].length){ const g = geoMergeUV(P[k].map(g => tnUV(g.index ? g.toNonIndexed() : g, 7))); g.keep = true; out[k] = g; }
  return tnBodyCache[key] = out;
}
let tnNeonGeo = {};
function tnNeonParts(kind){
  if (tnNeonGeo[kind]) return tnNeonGeo[kind];
  const A = tnAnchors(kind), T = A.T, W2 = T.W / 2, tubes = [];
  for (const s of [-1, 1]) tubes.push(geoAt(new THREE.CylinderGeometry(.02, .02, T.L * .62, 6), s * (W2 - .2), A.ybM - .015, 0, Math.PI / 2));
  for (const z of [A.zf - .45, A.zr + .45]) tubes.push(geoAt(new THREE.CylinderGeometry(.02, .02, T.W * .62, 6), 0, Math.min(A.ybF, A.ybR) - .01, z, 0, 0, Math.PI / 2));
  const tube = geoMerge(tubes), pool = new THREE.PlaneGeometry(T.L * 1.35, T.W * 2.1).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  /* the canvas is wide, the car is long: turned a quarter so the long side of the glow runs along the car */
  tube.keep = pool.keep = true;
  return tnNeonGeo[kind] = {tube, pool};
}

/* ---------- put a fit on a car (personal car, the showroom car, or an online ghost) ---------- */
function tnApply(c, fit){
  if (!c || !TN_KINDS.includes(c.kind)) return;
  fit = tnFit(fit);
  const key = TN_SLOTS.map(s => fit[s.id]).join(',') + '|' + (fit.aero === 'body' ? c.paint.uuid : '');
  if (c.tn && c.tn.key === key) return;
  const T = CAR_T[c.kind], it = s => TN.byKey[s + '.' + fit[s]];
  if (c.tn){
    for (const m of c.tn.meshes){ m.parent && m.parent.remove(m); const i = c.fine.indexOf(m); if (i >= 0) c.fine.splice(i, 1); }
  }
  const meshes = [], add = (parent, geo, mat, fine) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; parent.add(m); meshes.push(m); if (fine !== false){ c.fine.push(m); m.visible = c.fineOn !== false; } return m; };
  /* stance: lower the body, keep the wheels on the ground, push them out under the arches, tilt them in at the top */
  const sz = it('size'), r = T.r * sz.s, cam = it('camber').deg * Math.PI / 180, out = fit.wide === 'wide' ? .12 : 0;
  /* big wheels leave less room in the arch: lower only as far as the tyre still (just about) fits */
  const drop = Math.max(0, Math.min(it('low').drop, Math.max(.025, 2 * T.r + (out ? .17 : .1) - 2 * r)));
  c.body.position.y = -drop;
  const wg = tnWheelGeo(r, it('rim').style || 'stock', it('rimc').col, sz.lp), neonCol = it('neonc').col;
  for (const w of c.wheels){
    const piv = w.parent, sx = Math.sign(piv.position.x) || 1;
    w.geometry = wg; piv.position.x = sx * (T.W / 2 - .08 + out); piv.position.y = r + drop; piv.rotation.z = sx * cam;
    if (fit.rim === 'glow') add(w, tnRing(r, sz.lp), tnNeonMat(neonCol).tube);
  }
  const B = tnBody(c.kind, fit), aero = fit.aero === 'carbon' ? TN_MAT.carbon : fit.aero === 'black' ? TN_MAT.black : c.paint;
  if (B.aero) add(c.body, B.aero, aero, false);
  if (B.black) add(c.body, B.black, TN_MAT.black);
  if (B.metal) add(c.body, B.metal, TN.byKey['exh.' + fit.exh].ti ? TN_MAT.ti : TN_MAT.chrome);
  if (B.drl) add(c.body, B.drl, TN_MAT.drl);
  let pool = null;
  if (fit.neon === 'kit'){
    const N = tnNeonParts(c.kind), nm = tnNeonMat(neonCol);
    add(c.body, N.tube, nm.tube);
    pool = add(c.root, N.pool, nm.pool); pool.position.y = .06; pool.renderOrder = 2;
  }
  c.tn = {key, fit, meshes, tips:B.tips, pool, exh:fit.exh};
}
/* the stock look again (used when a ghost changes car or the save is wiped) */
const tnStrip = c => tnApply(c, null);
