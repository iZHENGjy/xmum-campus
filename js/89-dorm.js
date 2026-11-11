/* XMUM 校园漫游 · 能进去的宿舍：搜刮、解谜、赶在门禁前撤离
 *
 * 入口：7 栋 LY 宿舍楼门口的紫圈，步行按 F 进去。宿舍是搭在地图外（z = -2100）的一层楼，没有屋顶，镜头从上往下看；
 *   每次进去都按随机种子重新生成：两条楼道、1–2 条过道、十几间寝室、自习室、洗衣房、值班室、杂物间。
 * 一局：22:30 进门，23:00 宿管锁门（现实 210 秒，还没成功撤离过的前几局多 30 秒，带四句引导）。按住 F 搜柜子、抽屉、
 *   床底、快递箱，东西一件件翻出来。背包 6 格：第 1 格是贴身口袋，自动装最值钱的小件，被抓也不丢；满了再拿更贵的会自动换掉最便宜的。
 *   走到撤离点才算带出来：大门（绿圈）、消防梯（橙圈，按住推开，会响警报）、后门（蓝圈，要密码，多卖 10%）。
 *   带出来的东西自动卖成 RM，限量周边另外给「周边券」，在衣橱里换独家配件（js/89-dorm-ui.js）。
 *   被宿管抓到或超时：请出宿舍，背包里的东西没收。最后半分钟她去大门口守着。
 * 谜题：上锁的后门、储物柜、寝室。线索在便利贴、白板课程表、手机上，每局的门牌、课程表、日期、开关顺序都随机。
 * 敌人：宿管阿姨沿楼道巡逻（地上的光扇是她的视野，跑步她听得见）；Q（手机「蹲下」）蹲着走没声音、她看不远，
 *   蹲在床、衣柜、书桌、快递箱这些家具旁边不动就是躲起来（js/87-heist.js 的 SNEAK 共用蹲下的按键和动作）；
 *   偷外卖的小偷会搬空柜子、偷你背包里最贵的东西再往消防梯跑。
 *   水枪（js/87-classroom.js）淋中宿管她擦 3 秒眼镜，淋中小偷他滑倒，按 F 抓住。
 * 室内开关：进门时设 window.XINDOOR = 'dorm'（indoorNow() 在 js/40-vehicles.js）。界面在 js/89-dorm-ui.js。
 */
'use strict';
const DM_OX = 0, DM_OZ = -2100, DM_H = 2.4, DM_T = .3, DM_LIMIT = 210, DM_SLOTS = 6;
const DORM = {in:false, door:null, keep:null, L:null, run:null, near:null, hold:0, holdOn:null, aunt:null, thief:null, lootBox:null};
const dmG = new THREE.Group(); dmG.visible = false; scene.add(dmG);

/* ---------- save: records and achievements live in the main save (js/80-gta.js) ---------- */
const DM_LIFE = ['dormRuns', 'dormOut', 'dormPz', 'dormThief', 'dormTok'];
for (const k of DM_LIFE) prog.life[k] = 0;
const DM_ACH = [['dorm1', '门禁前回来了', '第一次从宿舍带着东西撤离', 20], ['dormrich', '满载而归', '一次从宿舍带出价值 RM 300 以上的东西', 60],
  ['dormpz', '寝室神探', '在宿舍累计解开 5 个谜题', 50], ['dormthief', '外卖守护者', '在宿舍抓住偷外卖的小偷', 40], ['dormghost', '查寝隐身', '全程没被宿管发现，带着东西撤离', 50]];
if (typeof achAdd === 'function') achAdd(DM_ACH); else ACH.push(...DM_ACH);
/* the loader in js/80-gta.js ran before this file: it only kept the ids and counters it knew, so read ours again */
try {
  const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null');
  if (d && d.life) for (const k of DM_LIFE) prog.life[k] = Math.max(0, +d.life[k] || 0);
  if (d && d.ach) for (const a of DM_ACH) if (d.ach[a[0]]) prog.ach[a[0]] = +d.ach[a[0]] || 1;
} catch(e){}
GX_MORE.push({id:'dorm', name:'宿舍搜刮', fmt:v => `单局最高收入 RM ${Math.round(v)}`});
/* 排行榜：一局撤离后的最高收入，和 B1 小游戏放在同一张「小游戏」榜里（/mini/dorm/{uid}，js/91-arcade.js 的 XMini.addBoard，js/net.js 的 miniTop / miniSubmit） */
const DM_BOARD = 'dorm';
if (window.XMini && XMini.addBoard) XMini.addBoard({id:DM_BOARD, name:'宿舍搜刮', icon:'🎒', fmt:v => 'RM ' + Math.round(+v || 0), what:'🎒 宿舍搜刮：一局从 LY 宿舍撤离后的最高收入（卖掉的东西、出口加成、抓小偷的悬赏）',
  local:() => +prog.best.dorm || 0, empty:'还没从宿舍带东西出来过，去 LY 宿舍门口的紫圈'});

/* ---------- things to find: [id, name, value, tier, kind, fits the pocket, 周边券] ---------- */
const DM_ITEMS = [
  ['latiao', '辣条', 4, 'n', 'snack', 1], ['noodle', '泡面', 6, 'n', 'snack'], ['chips', '半包薯片', 3, 'n', 'snack'], ['onigiri', '便利店饭团', 7, 'n', 'snack', 1],
  ['milk', '过期牛奶', 0, 'n', 'junk'], ['sock', '袜子（单只）', 1, 'n', 'junk', 1], ['peg', '晾衣夹', 1, 'n', 'junk', 1], ['soap', '洗衣液小样', 5, 'n', 'junk', 1],
  ['pen', '一把圆珠笔', 2, 'n', 'junk', 1], ['cable', '充电线', 8, 'n', 'junk', 1],
  ['nasi', '椰浆饭外卖', 14, 'n', 'food'], ['chicken', '炸鸡外卖', 18, 'n', 'food'], ['mala', '麻辣烫外卖', 16, 'n', 'food'], ['tea', '全糖奶茶', 9, 'n', 'food'],
  ['calc', '二手《微积分》', 22, 'n', 'book'], ['phys', '二手《大学物理》', 26, 'n', 'book'], ['malay', '《马来语入门》', 18, 'n', 'book'],
  ['notes', '学长的满分笔记', 38, 'r', 'book'], ['paper', '往年期末卷', 60, 'r', 'book', 1],
  ['fan', '小风扇', 30, 'n', 'tech'], ['bank', '充电宝', 40, 'r', 'tech', 1], ['buds', '蓝牙耳机', 55, 'r', 'tech', 1], ['kbd', '机械键盘', 70, 'r', 'tech'], ['pot', '违禁电煮锅', 85, 'r', 'tech'],
  ['keyring', '奶娃钥匙扣', 30, 'r', 'merch', 1, 1], ['badge', 'XMUM 纪念徽章', 35, 'r', 'merch', 1, 1], ['blind', '奶娃盲盒', 50, 'r', 'merch', 0, 2],
  ['tee', '校庆限定 T 恤', 60, 'r', 'merch', 0, 2], ['plush', '隐藏款奶娃公仔', 150, 'l', 'merch', 0, 4]
].map(([id, name, v, tier, cat, small, tok]) => ({id, name, v, tier, cat, small:!!small, tok:tok || 0}));
const DM_IC = {latiao:'🌶️', noodle:'🍜', chips:'🥔', onigiri:'🍙', milk:'🥛', sock:'🧦', peg:'📎', soap:'🧴', pen:'🖊️', cable:'🔌', nasi:'🍛', chicken:'🍗', mala:'🍲', tea:'🧋',
  calc:'📘', phys:'📗', malay:'📙', notes:'📓', paper:'📄', fan:'🌀', bank:'🔋', buds:'🎧', kbd:'⌨️', pot:'🍳', keyring:'🔖', badge:'🏅', blind:'🎁', tee:'👕', plush:'🧸', key:'🔑'};
/* furniture: footprint w (x) by d (z) when not turned, height, and for the ones you can search: the name and how long it takes */
const DM_FUR = {
  bed:{w:1, d:2, h:.6, name:'床底', t:1.6, cap:56}, desk:{w:.65, d:1.3, h:.78, name:'抽屉', t:.9, cap:60}, ward:{w:1.1, d:.6, h:1.9, name:'衣柜', t:1.8, cap:36, tall:1},
  lock:{w:.9, d:.5, h:1.8, name:'储物柜', t:2, cap:16, tall:1}, parcel:{w:.7, d:.6, h:.5, name:'快递箱', t:1.1, cap:40}, wash:{w:.7, d:.7, h:.95, name:'洗衣机', t:1.3, cap:8},
  shelf:{w:1.6, d:.45, h:1.7, name:'书架', t:1.5, cap:8, tall:1}, table:{w:2.4, d:1, h:.76, cap:8}, kdesk:{w:.7, d:1.8, h:1, cap:1}, sack:{w:.5, d:.5, h:.3, name:'小偷的赃物袋', t:0}
};
/* how many things a container holds (weights for 0, 1, 2, 3) and of which kinds */
const DM_CNT = {desk:[2.5, 5, 2.5], bed:[4, 4.5, 1.5], ward:[3, 5, 2], lock:[0, 4, 4, 2], parcel:[1, 6, 3], wash:[5, 5], shelf:[1, 5, 3, 1]};
const DM_CATW = {desk:[['snack', 3], ['junk', 3], ['book', 2], ['tech', 1]], bed:[['junk', 3], ['snack', 2], ['merch', 1], ['tech', 1]], ward:[['junk', 2], ['merch', 2], ['tech', 1], ['snack', 1]],
  lock:[['tech', 3], ['merch', 3], ['book', 2]], parcel:[['food', 4], ['tech', 2], ['merch', 1], ['snack', 1]], wash:[['junk', 4], ['snack', .5]], shelf:[['book', 5], ['junk', 1]]};
const DM_ROOM_NAME = {study:'自习室', laundry:'洗衣房', office:'值班室', closet:'杂物间'};
const DM_SW = [['红', '#e5484d'], ['黄', '#f2c230'], ['蓝', '#3b82f6'], ['绿', '#30a46c']];
const DM_COURSES = ['微积分', '大学物理', '马来语', '程序设计', '线性代数', '英语写作', '化工原理', '经济学', '有机化学', '数据结构', '概率统计', '中国文化'];
const dmPick = (R, a) => a[(R() * a.length) | 0];
function dmShuffle(R, a){ for (let i = a.length - 1; i > 0; i--){ const j = (R() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function dmWeighted(R, pairs){ let s = 0; for (const p of pairs) s += p[1]; let r = R() * s; for (const p of pairs){ r -= p[1]; if (r <= 0) return p[0]; } return pairs[pairs.length - 1][0]; }
function dmLoot(R, type, rich){
  const n = dmWeighted(R, DM_CNT[type].map((w, i) => [i, w])) + (rich ? 1 : 0), out = [];
  for (let i = 0; i < n; i++){
    const pool = rich && i === 0 ? DM_ITEMS.filter(it => it.tier !== 'n') : DM_ITEMS.filter(it => it.cat === dmWeighted(R, DM_CATW[type]));
    const cat = pool.length ? pool : DM_ITEMS;
    out.push(Object.assign({}, dmWeighted(R, cat.map(it => [it, (it.tier === 'n' ? 6 : it.tier === 'r' ? 2 : .35) * (rich && it.tier !== 'n' ? 3 : 1)]))));
  }
  return out;
}

/* ---------- layout generator: everything about one floor comes out of the seed ----------
   Six rows north to south: rooms, corridor, rooms, rooms, corridor, rooms. Columns are 6 m rooms with one or two 4 m cross
   passages. A cross passage joins the two corridors; one of them runs on south as the lobby with the main door. */
function dmGen(seed){
  const R = mkRng(seed), T = DM_T;
  const L = {seed, floor:5 + ((R() * 5) | 0), cols:[], rows:[], rooms:[], doors:[], walls:[], blocks:[], fur:[], boxes:[], clues:[], locks:[], exits:[], sw:[], way:[], peek:[], slab:null};
  const nR = 4 + ((R() * 3) | 0), xs = [1 + ((R() * (nR - 1)) | 0)];
  if (nR > 4 && R() < .6){ const o = []; for (let p = 1; p < nR; p++) if (Math.abs(p - xs[0]) >= 2) o.push(p); if (o.length) xs.push(dmPick(R, o)); }
  let x = 0;
  for (let i = 0; i < nR; i++) for (const cross of xs.includes(i) ? [true, false] : [false]){ const w = cross ? 4 : 6; L.cols.push({x0:x, x1:x + w, cx:x + w / 2, w, cross}); x += w; }
  L.W = x; let z = 0;
  [7, 4, 7, 7, 4, 7].forEach((d, i) => { L.rows.push({z0:z, z1:z + d, cz:z + d / 2, d, corr:i === 1 || i === 4}); z += d; }); L.D = z;
  L.x0 = DM_OX - L.W / 2; L.z0 = DM_OZ - L.D / 2; L.x1 = L.x0 + L.W; L.z1 = L.z0 + L.D;
  for (const c of L.cols){ c.x0 += L.x0; c.x1 += L.x0; c.cx += L.x0; } for (const r of L.rows){ r.z0 += L.z0; r.z1 += L.z0; r.cz += L.z0; }
  const nc = L.cols.length, cell = L.cell = L.rows.map(() => L.cols.map(() => null));
  const ent = L.ent = dmPick(R, L.cols.map((c, i) => c.cross ? i : -1).filter(i => i >= 0));
  /* a room: dir says which way the inside runs from the door wall (+1 = south) */
  const mkRoom = (kind, r, cs) => {
    const dir = r === 0 || r === 3 ? -1 : 1, row = L.rows[r];
    const room = {id:L.rooms.length + 1, kind, r, cs, dir, x0:L.cols[cs[0]].x0, x1:L.cols[cs[cs.length - 1]].x1, z0:row.z0, z1:row.z1, dz:dir > 0 ? row.z0 : row.z1, name:DM_ROOM_NAME[kind] || '', num:0, lock:null, seen:false, boxes:[]};
    room.cx = (room.x0 + room.x1) / 2; room.cz = row.cz;
    for (const c of cs) cell[r][c] = room; L.rooms.push(room); return room;
  };
  for (let r = 0; r < 6; r++) for (let c = 0; c < nc; c++){
    if (L.rows[r].corr || (L.cols[c].cross && (r === 2 || r === 3)) || (c === ent && r === 5)) cell[r][c] = 'C';
    else if (L.cols[c].cross){ if (R() < .65) mkRoom('closet', r, [c]); else cell[r][c] = 'V'; }
  }
  mkRoom('office', 5, [dmPick(R, [ent - 1, ent + 1])]);
  const pairs = []; for (const r of [0, 2, 3, 5]) for (let c = 0; c + 1 < nc; c++) if (!L.cols[c].cross && !L.cols[c + 1].cross) pairs.push([r, c]);
  dmShuffle(R, pairs);
  for (const kind of ['study', 'laundry']){ const p = pairs.find(([r, c]) => !cell[r][c] && !cell[r][c + 1]); if (p) mkRoom(kind, p[0], [p[1], p[1] + 1]); }
  for (const r of [0, 2, 3, 5]) for (let c = 0; c < nc; c++) if (!cell[r][c]) mkRoom('std', r, [c]);
  let num = L.floor * 100 + 1 + ((R() * 20) | 0);
  for (const room of L.rooms.slice().sort((a, b) => a.r - b.r || a.x0 - b.x0)){ room.num = num; num += 1 + (R() < .25 ? 1 : 0); }
  for (const room of L.rooms) for (const c of room.cs) L.doors.push({x:L.cols[c].cx, z:room.dz, w:Math.min(3, L.cols[c].w - 1.2), c, room});

  /* walls along every cell edge whose two sides are different spaces; 'V' cells are solid blocks */
  const sp = (r, c) => r < 0 || r > 5 || c < 0 || c >= nc ? 'O' : cell[r][c];
  const wall = (wx, wz, lx, lz) => L.walls.push({x:wx, z:wz, lx, lz});
  for (let r = -1; r < 6; r++) for (let c = 0; c < nc; c++){
    const a = sp(r, c), b = sp(r + 1, c); if (a === b || a === 'V' || b === 'V') continue;
    const col = L.cols[c], zz = r < 0 ? L.z0 : L.rows[r].z1, door = L.doors.find(d => d.c === c && Math.abs(d.z - zz) < .01);
    if (door){ const side = (col.w - door.w) / 2; wall(col.x0 + side / 2 - T / 4, zz, side + T / 2, T); wall(col.x1 - side / 2 + T / 4, zz, side + T / 2, T); }
    else wall(col.cx, zz, col.w + T, T);
  }
  for (let r = 0; r < 6; r++) for (let c = -1; c < nc; c++){
    const a = sp(r, c), b = sp(r, c + 1); if (a === b || a === 'V' || b === 'V') continue;
    wall(c < 0 ? L.x0 : L.cols[c].x1, L.rows[r].cz, T, L.rows[r].d + T);
  }
  for (let r = 0; r < 6; r++) for (let c = 0; c < nc; c++) if (cell[r][c] === 'V') L.blocks.push({x:L.cols[c].cx, z:L.rows[r].cz, lx:L.cols[c].w, lz:L.rows[r].d});

  /* ways out: the main door at the bottom of the lobby, fire stairs at one end of the north corridor, maybe a back door at another end */
  const lob = L.cols[ent], r5 = L.rows[5];
  L.spawn = [lob.cx, r5.z1 - 3.9];
  L.exits.push({kind:'main', name:'大门', x:lob.cx, z:r5.z1 - 2, wx:lob.cx, wz:L.z1, lock:null});
  const ends = dmShuffle(R, [[1, -1], [1, 1], [4, -1], [4, 1]].map(([r, s]) => ({r, x:s < 0 ? L.x0 + 1.3 : L.x1 - 1.3, z:L.rows[r].cz, wx:s < 0 ? L.x0 : L.x1})));
  const fire = ends.splice(ends.findIndex(e => e.r === 1), 1)[0];
  L.exits.push({kind:'fire', name:'消防梯', x:fire.x, z:fire.z, wx:fire.wx, wz:fire.z, lock:null});
  if (R() < .8) L.exits.push({kind:'back', name:'后门', x:ends[0].x, z:ends[0].z, wx:ends[0].wx, wz:ends[0].z, lock:null});

  /* furniture. ry turns it; things against the back wall face the door, things against a side wall face the middle */
  const addFur = (type, fx, fz, ry, room) => {
    const F = DM_FUR[type], f = {type, x:fx, z:fz, ry:ry || 0, room}; L.fur.push(f);
    if (F.name){ const b = {type, x:fx, z:fz, room, items:[], open:false, lock:null, rich:false, r:Math.max(F.w, F.d) / 2 + 1.9, h:F.h, f}; L.boxes.push(b); if (room) room.boxes.push(b); return b; }
    return f;
  };
  for (const room of L.rooms){
    const m = R() < .5 ? 1 : -1, back = room.dir > 0 ? Math.PI : 0;
    const put = (type, lx, dep, ry) => addFur(type, room.cx + lx, room.dz + room.dir * dep, ry != null ? ry : back, room);
    const side = lx => lx < 0 ? 0 : Math.PI;
    if (room.kind === 'std'){
      put('bed', -2.3 * m, 5.6); if (R() < .65) put('bed', 2.3 * m, 5.6);
      if (R() < .85) put('desk', -2.5 * m, 2.9, side(-m)); if (R() < .6) put('desk', 2.5 * m, 2.9, side(m));
      if (R() < .8) put('ward', 0, 6.5);
    } else if (room.kind === 'closet'){
      const n = 2 + (R() < .5 ? 1 : 0); for (let i = 0; i < n; i++) put('lock', (i - (n - 1) / 2) * 1.02, 6.55);
      if (R() < .6) put('parcel', 1.35 * m, 3.6);
    } else if (room.kind === 'study'){
      put('table', -3, 3.7); put('table', 3, 3.7); put('shelf', -4.6, 6.6); put('shelf', 4.6, 6.6); if (R() < .6) put('shelf', 0, 6.6);
      put('desk', 5.5 * m, 5.2, side(m)); room.board = [room.cx + 2.3 * m, room.dz + room.dir * 6.35];
    } else if (room.kind === 'laundry'){
      for (const lx of dmShuffle(R, [-5.2, -4.3, -3.4, 3.4, 4.3, 5.2]).slice(0, 4)) put('wash', lx, 6.45);
      put('table', 0, 3.7); put('parcel', 1.2 * m, 6.5); if (R() < .5) put('parcel', -1.2 * m, 6.5);
    } else if (room.kind === 'office'){
      put('bed', 2.3 * m, 5.6); put('desk', -2.5 * m, 2.9, side(-m)); put('lock', -.4 * m, 6.55);
    }
  }
  const lm = R() < .5 ? 1 : -1;
  addFur('kdesk', lob.cx + 1.4 * lm, r5.z0 + 1.5, 0, null);
  /* always something to search within sight of the door: parcels left by the lobby entrance, against the corridor wall */
  addFur('parcel', lob.x0 - .8, r5.z0 - .5, 0, null); if (R() < .6) addFur('parcel', lob.x1 + .8, r5.z0 - .5, 0, null);
  /* spots along the corridor walls, between two doors: light switches first, parcels on what is left */
  const spots = [];
  for (const r of [1, 4]) for (let c = 0; c + 1 < nc; c++) if (!L.cols[c].cross && !L.cols[c + 1].cross)
    for (const s of [-1, 1]) spots.push({x:L.cols[c].x1, z:s < 0 ? L.rows[r].z0 + .5 : L.rows[r].z1 - .5, r});
  dmShuffle(R, spots);

  /* locks: the back door and one locker take a 4-digit code; one room takes a key or the light switches */
  const mkLock = (what, ref, name, kind, lx, lz) => { const k = {id:L.locks.length, what, ref, name, kind, open:false, code:'', cool:0, x:lx, z:lz, seq:null, at:0}; L.locks.push(k); ref.lock = k; return k; };
  const back = L.exits.find(e => e.kind === 'back'); if (back) mkLock('exit', back, '后门', 'code', back.x, back.z);
  const lockers = L.boxes.filter(b => b.type === 'lock' && b.room.kind !== 'office'), lb = lockers.length ? dmPick(R, lockers) : dmPick(R, L.boxes.filter(b => b.type === 'ward'));
  if (lb){ mkLock('box', lb, `${lb.room.num} ${lb.room.name || '寝室'}的${DM_FUR[lb.type].name}`, 'code', lb.x, lb.z); lb.rich = true; }
  const lrs = L.rooms.filter(r => r.kind === 'std' && r.boxes.length >= 2 && !r.boxes.includes(lb)), lr = lrs.length ? dmPick(R, lrs) : null;
  if (lr){
    const d = L.doors.find(q => q.room === lr), k = mkLock('door', lr, `${lr.num} 的房门`, spots.length >= 4 && R() < .5 ? 'lights' : 'key', d.x, d.z);
    for (const b of lr.boxes) b.rich = true; L.slab = {x:d.x, z:d.z, lx:d.w, lz:.24};
    if (k.kind === 'lights'){ k.seq = dmShuffle(R, [0, 1, 2, 3]); spots.splice(0, 4).forEach((s, i) => L.sw.push({i, x:s.x, z:s.z, on:false})); }
  }
  /* never a parcel on both sides at the same place: the corridor has to stay easy to walk */
  { const taken = {}; for (const s of spots){ const key = s.r + ':' + s.x; if (R() < .45 && !taken[key]){ taken[key] = 1; addFur('parcel', s.x, s.z, 0, null); } } }
  for (const b of L.boxes) b.items = dmLoot(R, b.type, b.rich);
  const keyLock = L.locks.find(k => k.kind === 'key');
  if (keyLock){
    const far = L.boxes.filter(b => b.room !== keyLock.ref && !b.lock && Math.hypot(b.x - keyLock.x, b.z - keyLock.z) > 12), cab = L.boxes.find(b => b.room && b.room.kind === 'office' && b.type === 'lock');
    const kb = cab && R() < .5 ? cab : far.length ? dmPick(R, far) : L.boxes[0];
    kb.items.unshift({id:'key', name:`${keyLock.ref.num} 的钥匙`, v:0, tier:'n', cat:'key', small:true, tok:0, key:keyLock.id});
  }

  /* clues. A note sits on the door wall inside a room, a phone lies on a bed, the timetable is the whiteboard in the 自习室 */
  const free = dmShuffle(R, L.rooms.filter(r => r.kind === 'std' && !r.lock)), study = L.rooms.find(r => r.kind === 'study'), laundry = L.rooms.find(r => r.kind === 'laundry'), office = L.rooms.find(r => r.kind === 'office');
  const noteAt = room => { const s = R() < .5 ? 1 : -1; return [room.cx + 2.2 * s, room.dz + room.dir * .55]; };
  const clue = (kind, title, pos, html, room) => L.clues.push({id:L.clues.length, kind, title, x:pos[0], z:pos[1], html, read:false, room});
  const pad4 = n => String(n).padStart(4, '0').slice(-4);
  const kinds = dmShuffle(R, ['sum', 'table', 'phone']);
  for (const k of L.locks.filter(q => q.kind === 'code')){
    const kind = kinds.shift(), room = free.length ? free.shift() : study;
    if (kind === 'sum' && study && laundry){
      if (R() < .5){ k.code = pad4(study.num + laundry.num); clue('note', `便利贴（${room.num}）`, noteAt(room), `<p class="dm-note">${k.name}的密码 =<br><b>自习室的门牌 + 洗衣房的门牌</b></p><p>门牌写在每间房的门口。</p>`, room); }
      else { k.code = pad4(String(L.floor) + String(office.num).split('').reverse().join('')); clue('note', `便利贴（${room.num}）`, noteAt(room), `<p class="dm-note">${k.name}的密码：<br><b>把值班室的门牌倒过来写，前面加上楼层</b></p><p>这里是 ${L.floor} 楼。</p>`, room); }
    } else if (kind === 'table' || !free.length){
      const days = ['周一', '周二', '周三', '周四', '周五'], slots = ['08:00', '10:00', '14:00', '16:00'], names = dmShuffle(R, DM_COURSES.slice()), grid = slots.map(() => days.map(() => null)), used = [];
      for (let i = 0; i < 10; i++){ const s = (R() * 4) | 0, d = (R() * 5) | 0; if (grid[s][d]) continue; const rm = `A${1 + ((R() * 5) | 0)}-${1 + ((R() * 4) | 0)}${String((R() * 20) | 0).padStart(2, '0')}`; grid[s][d] = {n:names[used.length % names.length], rm, s, d}; used.push(grid[s][d]); }
      const pickC = dmPick(R, used); k.code = pickC.rm.replace(/\D/g, '');
      const rows = slots.map((t, s) => `<tr><th>${t}</th>${days.map((_, d) => `<td>${grid[s][d] ? `${grid[s][d].n}<small>${grid[s][d].rm}</small>` : ''}</td>`).join('')}</tr>`).join('');
      clue('board', '白板上的课程表（自习室）', study ? study.board : noteAt(room), `<table class="dm-tt"><tr><th></th>${days.map(d => `<th>${d}</th>`).join('')}</tr>${rows}</table>
        <p class="dm-note">${k.name}的密码 = <b>${days[pickC.d]} ${slots[pickC.s]}</b> 那节课的教室<br>只写数字，比如 A9-999 就是 9999</p>`, study || room);
      if (study && room !== study) free.unshift(room);
    } else {
      const mo = 1 + ((R() * 12) | 0), day = 1 + ((R() * 28) | 0), bed = room.boxes.find(b => b.type === 'bed'); k.code = pad4(mo * 100 + day);
      clue('phone', `床上的手机（${room.num}）`, bed ? [bed.x, bed.z] : noteAt(room), `<div class="dm-chat"><p class="l"><i>室友</i>${k.name}的密码是多少来着？</p><p class="r">我生日啊，四位数</p><p class="l"><i>室友</i>你生日哪天……</p>
        <p class="l"><i>妈妈</i>${mo} 月 ${day} 号生日记得吃碗长寿面</p></div>`, room);
    }
  }
  const lights = L.locks.find(k => k.kind === 'lights');
  if (lights){ const room = free.length ? free.shift() : office; clue('note', `便利贴（${room.num}）`, noteAt(room), `<p class="dm-note">${lights.name}是电控锁，楼道里四个彩色开关按这个顺序按：</p>
    <p class="dm-seq">${lights.seq.map(i => `<b style="background:${DM_SW[i][1]}">${DM_SW[i][0]}</b>`).join('<i>→</i>')}</p><p>按错会全灭重来，还会响一声。</p>`, room); }

  /* where the 宿管 walks: the middle of every corridor cell, and just inside the door of the unlocked rooms */
  for (let r = 0; r < 6; r++) for (let c = 0; c < nc; c++) if (cell[r][c] === 'C') L.way.push([L.cols[c].cx, L.rows[r].cz]);
  for (const d of L.doors) if (!d.room.lock && d.room.kind !== 'closet') L.peek.push([d.x, d.z + d.room.dir * 2]);
  return L;
}

/* ---------- models, built once; every run only moves instances around ---------- */
/* tint = per-instance colours: the colour buffer has to be made while count is still the full capacity */
const dmIM = (geo, mat, n, shadow, tint) => { const im = new THREE.InstancedMesh(geo, mat, n); if (tint) im.setColorAt(0, new THREE.Color('#ffffff')); im.count = 0; im.frustumCulled = false; im.castShadow = !!shadow; im.receiveShadow = true; dmG.add(im); return im; };
/* the ground and the floors sit only a centimetre or two over the campus ground plane (y = 0): a small depth offset keeps the grass
   from showing through them when the camera is tilted low */
const DM_FLOOR_PO = {polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-4};
{ const g = box(150, .2, 130, M('#2f3238', DM_FLOOR_PO), DM_OX, -.09, DM_OZ, dmG); g.castShadow = false; }   /* dark ground round the building, just above the grass */
const dmFloorIM = dmIM(new THREE.BoxGeometry(1, .1, 1), M('#ffffff', Object.assign({roughness:.85}, DM_FLOOR_PO)), 64, false, true);
const dmWallIM = dmIM(new THREE.BoxGeometry(1, 1, 1), M('#ffffff', {roughness:.9}), 260, true, true);
const dmFurIM = {};
{
  const mk = fn => { const l = []; fn((w, h, d, x, y, z, c) => tbox(l, w, h, d, x, y, z, c)); return geoMerge(l); };
  const G = {
    bed:mk(b => { b(1, .1, 2, 0, .34, 0, '#b98a5e'); for (const [x, z] of [[-.44, -.94], [.44, -.94], [-.44, .94], [.44, .94]]) b(.1, .3, .1, x, .15, z, '#8f6a45'); b(.92, .16, 1.9, 0, .47, 0, '#ece7db'); b(.94, .17, 1.15, 0, .48, .36, '#7fa6c9'); b(.6, .12, .34, 0, .6, -.74, '#ffffff'); b(1, .5, .08, 0, .55, -.98, '#a57c52'); }),
    desk:mk(b => { b(.65, .06, 1.3, 0, .75, 0, '#d8b98a'); b(.55, .5, .5, -.03, .47, .37, '#b9966a'); b(.04, .1, .3, .26, .55, .37, '#6c5a3e'); b(.06, .72, .06, -.27, .36, -.6, '#8f7350'); b(.06, .72, .06, .27, .36, -.6, '#8f7350'); b(.4, .42, .4, .5, .21, -.15, '#3e6fa3'); }),
    ward:mk(b => { b(1.1, 1.9, .6, 0, .95, 0, '#a57c52'); b(.02, 1.7, .02, 0, .95, .31, '#5f4630'); b(.04, .2, .04, -.1, 1, .32, '#d9c9a8'); b(.04, .2, .04, .1, 1, .32, '#d9c9a8'); b(1.14, .06, .64, 0, 1.93, 0, '#8f6a45'); }),
    lock:mk(b => { b(.9, 1.8, .5, 0, .9, 0, '#5f86a8'); b(.02, 1.7, .02, 0, .9, .26, '#3c5a76'); for (const x of [-.22, .22]){ b(.2, .03, .02, x, 1.5, .26, '#3c5a76'); b(.2, .03, .02, x, 1.42, .26, '#3c5a76'); b(.05, .12, .04, x + .12, .95, .27, '#d9dee4'); } }),
    parcel:mk(b => { b(.7, .5, .6, 0, .25, 0, '#c49a62'); b(.72, .02, .12, 0, .5, 0, '#e8d9b0'); b(.12, .51, .62, 0, .25, 0, '#e8d9b0'); b(.2, .14, .01, .2, .3, .305, '#f6f3ea'); }),
    wash:mk(b => { b(.7, .95, .7, 0, .475, 0, '#eef0f2'); b(.42, .42, .04, 0, .45, .35, '#5a6b7a'); b(.3, .3, .05, 0, .45, .36, '#9fc4dc'); b(.6, .1, .03, 0, .86, .35, '#c9d0d6'); }),
    shelf:mk(b => { b(1.6, 1.7, .45, 0, .85, -.02, '#8f6a45'); for (let r = 0; r < 4; r++){ b(1.5, .3, .04, 0, .3 + r * .4, .2, '#3b2f24'); for (let i = 0; i < 7; i++) b(.16, .26, .05, -.6 + i * .2, .3 + r * .4, .22, ['#c0392b', '#2d5d8a', '#d4a017', '#2e7d5b', '#8e44ad', '#ece7db', '#e67e22'][(i + r * 3) % 7]); } }),
    table:mk(b => { b(2.4, .06, 1, 0, .73, 0, '#d8c9a8'); for (const [x, z] of [[-1.1, -.4], [1.1, -.4], [-1.1, .4], [1.1, .4]]) b(.08, .7, .08, x, .35, z, '#6c757d'); b(.3, .03, .22, -.5, .78, .1, '#f6f3ea'); b(.22, .16, .16, .6, .84, -.1, '#3e6fa3'); }),
    kdesk:mk(b => { b(.7, 1, 1.8, 0, .5, 0, '#7a5a3c'); b(.78, .05, 1.88, 0, 1.02, 0, '#d8c9a8'); b(.3, .22, .02, 0, 1.2, .3, '#1f2a33'); b(.2, .03, .3, .05, 1.06, -.4, '#f6f3ea'); })
  };
  const mat = M('#ffffff', {vertexColors:true, roughness:.8});
  for (const k in G) dmFurIM[k] = dmIM(G[k], mat, DM_FUR[k].cap, true);
}
/* floating diamonds over things worth walking to: gold = not searched, red = locked, blue = a clue, grey = something left inside */
const dmMarkIM = dmIM(new THREE.OctahedronGeometry(.17), new THREE.MeshBasicMaterial({color:'#ffffff'}), 180, false, true);
const _dmM = new THREE.Matrix4(), _dmQ = new THREE.Quaternion(), _dmP = new THREE.Vector3(), _dmS = new THREE.Vector3(), _dmC = new THREE.Color();
function dmSet(im, i, x, y, z, ry, sx, sy, sz, col){
  _dmM.compose(_dmP.set(x, y, z), _dmQ.setFromAxisAngle(UP, ry || 0), _dmS.set(sx, sy, sz)); im.setMatrixAt(i, _dmM);
  if (col){ im.setColorAt(i, _dmC.set(col)); }
}
function dmRing(color, r){
  const m = new THREE.Mesh(new THREE.RingGeometry(r * .62, r, 36).rotateX(-Math.PI / 2), gxGlow(color, .8));
  m.add(new THREE.Mesh(new THREE.CircleGeometry(r * .62, 36).rotateX(-Math.PI / 2), gxGlow(color, .2))); m.visible = false; dmG.add(m); return m;
}
const DM_EXIT_COL = {main:'#4fd18b', fire:'#ff9f43', back:'#4aa3ff'};
/* the riskier the way out, the better it pays: the fire stairs set off the alarm, the back door needs its code */
const DM_EXIT_PAY = {main:0, fire:.25, back:.5};
const dmPct = k => Math.round(DM_EXIT_PAY[k] * 100);
const dmExitFx = ['main', 'fire', 'back'].map(k => ({kind:k, ring:dmRing(DM_EXIT_COL[k], 1.25), slab:box(2.2, 2.3, .16, M(DM_EXIT_COL[k], {emissive:DM_EXIT_COL[k], emissiveIntensity:.35, roughness:.5}), 0, 1.15, 0, dmG), lbl:addLabel('', 0, 3.2, 0, true)}));
const dmDoorSlab = box(1, 2.2, .24, M('#7a3f2a', {roughness:.6}), 0, 1.1, 0, dmG);
const dmSwFx = DM_SW.map(([, c]) => { const g = new THREE.Group(), lamp = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 10), M(c, {emissive:c, emissiveIntensity:.08, roughness:.4}));
  lamp.position.y = 1.35; g.add(box(.2, 1.2, .2, M('#4b5158', {roughness:.6}), 0, .6, 0, g), lamp); g.visible = false; dmG.add(g); return {g, lamp}; });
const dmClueFx = {
  note:[0, 1, 2].map(() => box(.5, .5, .06, M('#f7e36b', {roughness:.8, emissive:'#f7e36b', emissiveIntensity:.15}), 0, 1.3, 0, dmG)),
  phone:[0, 1].map(() => box(.2, .04, .36, M('#15171c', {emissive:'#6fb7ff', emissiveIntensity:.7, roughness:.3}), 0, .64, 0, dmG)),
  board:[0, 1].map(() => { const g = new THREE.Group(); box(2.2, 1.25, .08, M('#f6f6f2', {roughness:.4}), 0, 1.45, 0, g); box(2.3, .08, .14, M('#8a8f96'), 0, .8, 0, g); for (const s of [-1, 1]) box(.08, .8, .5, M('#8a8f96'), s * 1, .4, 0, g); dmG.add(g); return g; })
};
const dmLbls = []; for (let i = 0; i < 34; i++){ const l = addLabel('', 0, 3, 0, true); l.dead = true; dmLbls.push(l); }
for (const e of dmExitFx) e.lbl.dead = true;

/* the 宿管 and the thief: the little people from js/60-details.js, a size bigger */
function dmFigure(shirt, pants, extra){
  const g = new THREE.Group(), shirtM = M(shirt, {roughness:.8}), skinM = M('#e2b08a', {roughness:.7});
  const body = new THREE.Mesh(npcBodyGeo, shirtM), head = new THREE.Mesh(npcHeadGeo, skinM);
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(npcLegGeo, M(pants, {roughness:.8, vertexColors:true})); l.position.set(s * .09, PPL_HIP, 0); g.add(l); return l; });
  const arms = pplArms(g, shirtM, skinM);
  g.add(body, head); extra(g, arms); g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.scale.setScalar(1.35); g.visible = false; dmG.add(g);
  return {g, legs, arms};
}
/* she carries a torch in her left hand (+x) and wears an apron that wraps the front of her torso */
const dmAuntFig = dmFigure('#8e5aa8', '#3a3340', (g, arms) => {
  g.add(new THREE.Mesh(pplBand(1.1, .5, .012, -1.05, 1.05), M('#f3e6c8', {side:THREE.DoubleSide})));
  const bun = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), M('#2a2420')); bun.position.set(0, 1.8, -.07); g.add(bun);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.155, 12, 8, 0, 7, 0, 1.75), M('#2a2420')); hair.position.set(0, 1.63, -.02); g.add(hair);
  for (const s of [-1, 1]) box(.08, .02, .02, M('#1d1d1f'), s * .06, 1.63, .135, g);
  arms[1].rotation.set(-.75, 0, .12);
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .22, 8).rotateX(Math.PI / 2), M('#2b2b2e')); torch.position.set(0, -.47, .07); torch.rotation.x = .75; arms[1].add(torch);
});
/* the thief: dark cap, white face mask, the stolen takeaway in his left hand */
const dmThiefFig = dmFigure('#2b2f3a', '#1d2026', (g, arms) => {
  g.add(new THREE.Mesh(pplCapGeo, M('#16181d')), new THREE.Mesh(pplHeadBand(1.575, .085, .006, -1.15, 1.15), M('#f3f1ea', {side:THREE.DoubleSide})));
  const bag = new THREE.Group(); bag.position.set(.02, -.5, .02); arms[1].add(bag); arms[1].rotation.set(.05, 0, .16);
  box(.3, .3, .2, M('#e8552d'), 0, -.15, 0, bag); box(.32, .04, .22, M('#f6f3ea'), 0, .02, 0, bag);
});
const DM_FAN_N = 22, DM_FAN_HALF = .96;
const dmFan = (() => {   /* her field of view on the floor: a 110° fan, reshaped every frame so walls cut it off */
  const pos = [0, 0, 0], N = DM_FAN_N, half = DM_FAN_HALF; for (let i = 0; i <= N; i++){ const a = -half + 2 * half * i / N; pos.push(Math.sin(a), 0, Math.cos(a)); }
  const idx = []; for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:'#ffd24a', transparent:true, opacity:.34, depthWrite:false, side:THREE.DoubleSide})); m.visible = false; m.renderOrder = 1; m.frustumCulled = false; dmG.add(m); return m;
})();
const dmAuntLbl = addLabel('宿管阿姨', 0, 3.4, 0, true), dmThiefLbl = addLabel('外卖小偷', 0, 3.4, 0, true); dmAuntLbl.dead = dmThiefLbl.dead = true;

/* ---------- colliders (a pool inside the shared list, switched off outside) and the walking grid for the two NPCs ---------- */
const dmCols = []; let dmColN = 0;
function dmCol(cx, cz, hx, hz){
  let c = dmCols[dmColN]; if (!c){ c = addBox(cx, cz, hx, hz, 0); dmCols.push(c); }
  Object.assign(c, {cx, cz, hx, hz, c:1, s:0, dead:false}); dmColN++; return c;
}
const DMN = {s:.5, nx:0, nz:0, x0:0, z0:0, blk:null, sight:null, prev:null, q:null};
function dmRast(arr, cx, cz, hx, hz, v){
  const s = DMN.s, i0 = Math.max(0, Math.floor((cx - hx - DMN.x0) / s)), i1 = Math.min(DMN.nx - 1, Math.floor((cx + hx - DMN.x0) / s)), j0 = Math.max(0, Math.floor((cz - hz - DMN.z0) / s)), j1 = Math.min(DMN.nz - 1, Math.floor((cz + hz - DMN.z0) / s));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){ const x = DMN.x0 + (i + .5) * s, z = DMN.z0 + (j + .5) * s; if (Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz) arr[j * DMN.nx + i] = v; }
}
function dmNavBuild(L){
  DMN.x0 = L.x0 - 1; DMN.z0 = L.z0 - 1; DMN.nx = Math.ceil((L.W + 2) / DMN.s); DMN.nz = Math.ceil((L.D + 2) / DMN.s);
  const n = DMN.nx * DMN.nz; DMN.blk = new Uint8Array(n); DMN.sight = new Uint8Array(n); DMN.prev = new Int32Array(n); DMN.q = new Int32Array(n);
  for (const w of L.walls.concat(L.blocks)){ dmRast(DMN.blk, w.x, w.z, w.lx / 2 + .36, w.lz / 2 + .36, 1); dmRast(DMN.sight, w.x, w.z, w.lx / 2 + .15, w.lz / 2 + .15, 1); }
  for (const f of L.fur){ const F = DM_FUR[f.type], sw = Math.abs(Math.sin(f.ry)) > .5, hx = (sw ? F.d : F.w) / 2, hz = (sw ? F.w : F.d) / 2; dmRast(DMN.blk, f.x, f.z, hx + .3, hz + .3, 1); if (F.tall) dmRast(DMN.sight, f.x, f.z, hx, hz, 1); }
  dmNavSlab(L);
  /* outside the building counts as wall */
  for (let j = 0; j < DMN.nz; j++) for (let i = 0; i < DMN.nx; i++){ const x = DMN.x0 + (i + .5) * DMN.s, z = DMN.z0 + (j + .5) * DMN.s; if (x < L.x0 || x > L.x1 || z < L.z0 || z > L.z1) DMN.blk[j * DMN.nx + i] = 1; }
}
function dmNavSlab(L){ if (!L.slab) return; const v = L.slab.open ? 0 : 1; dmRast(DMN.blk, L.slab.x, L.slab.z, L.slab.lx / 2 - .4, .6, v); dmRast(DMN.sight, L.slab.x, L.slab.z, L.slab.lx / 2 - .4, .3, v); }
const dmCi = (x, z) => { const i = Math.floor((x - DMN.x0) / DMN.s), j = Math.floor((z - DMN.z0) / DMN.s); return i < 0 || j < 0 || i >= DMN.nx || j >= DMN.nz ? -1 : j * DMN.nx + i; };
const dmCx = k => DMN.x0 + (k % DMN.nx + .5) * DMN.s, dmCz = k => DMN.z0 + (((k / DMN.nx) | 0) + .5) * DMN.s;
function dmRay(arr, x0, z0, x1, z1){
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / .25));
  for (let i = 1; i < n; i++){ const k = dmCi(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); if (k < 0 || arr[k]) return false; }
  return true;
}
const dmSee = (x0, z0, x1, z1) => dmRay(DMN.sight, x0, z0, x1, z1);
/* the free cell nearest to cell k. With (tx, tz) it must also be in the same room as that point, so nobody ends up
   standing on the far side of a wall from the cupboard they walked to */
function dmNearFree(k, tx, tz){
  if (k >= 0 && !DMN.blk[k]) return k;
  const i0 = k % DMN.nx, j0 = (k / DMN.nx) | 0, sp = tx != null && DORM.L ? dmSpace(tx, tz) : null;
  let best = -1, bd = 1e9, stop = 99;
  for (let r = 1; r < 14 && r <= stop; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++){
    if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= DMN.nx || j >= DMN.nz) continue;
    const m = j * DMN.nx + i; if (DMN.blk[m]) continue;
    if (sp && sp !== 'V' && dmSpace(dmCx(m), dmCz(m)) !== sp) continue;
    const d = Math.hypot(i - i0, j - j0); if (d < bd){ bd = d; best = m; if (stop === 99) stop = r + 1; }
  }
  return best;
}
/* breadth-first from the goal back to the start, then pull the path straight wherever the way is clear */
function dmPath(sx, sz, tx, tz){
  const nx = DMN.nx, blk = DMN.blk, prev = DMN.prev, q = DMN.q;
  let s = dmCi(sx, sz), t = dmCi(tx, tz); if (s < 0 || t < 0) return null;
  const exact = !blk[t]; s = dmNearFree(s, sx, sz); t = dmNearFree(t, tx, tz); if (s < 0 || t < 0) return null;
  if (s === t) return [[exact ? tx : dmCx(t), exact ? tz : dmCz(t)]];
  prev.fill(-1); prev[t] = t; q[0] = t; let h = 0, n = 1, found = false;
  while (h < n && !found){
    const k = q[h++], i = k % nx, j = (k / nx) | 0;
    for (let dj = -1; dj <= 1 && !found; dj++) for (let di = -1; di <= 1; di++){
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= DMN.nz) continue;
      const m = jj * nx + ii; if (blk[m] || prev[m] >= 0) continue;
      if (di && dj && (blk[j * nx + ii] || blk[jj * nx + i])) continue;
      prev[m] = k; q[n++] = m; if (m === s){ found = true; break; }
    }
  }
  if (!found) return null;
  const pts = []; let k = s; while (k !== t){ k = prev[k]; pts.push(k); }
  const out = []; let cx = dmCx(s), cz = dmCz(s), i = 0;
  while (i < pts.length){ let j = Math.min(pts.length - 1, i + 16); while (j > i && !dmRay(blk, cx, cz, dmCx(pts[j]), dmCz(pts[j]))) j--; cx = dmCx(pts[j]); cz = dmCz(pts[j]); out.push([cx, cz]); i = j + 1; }
  if (exact) out[out.length - 1] = [tx, tz];
  return out;
}
/* walk e toward (tx, tz); true once it is there (or there is no way) */
function dmGo(e, tx, tz, speed, dt){
  e.rep -= dt;
  if (!e.path || (e.rep <= 0 && Math.hypot(tx - e.gx, tz - e.gz) > .6)){ e.path = dmPath(e.x, e.z, tx, tz) || []; e.pi = 0; e.gx = tx; e.gz = tz; e.rep = .3; }
  let step = speed * dt;
  while (e.pi < e.path.length){
    const p = e.path[e.pi], dx = p[0] - e.x, dz = p[1] - e.z, d = Math.hypot(dx, dz);
    if (d > .001){ const want = Math.atan2(dx, dz); e.h += Math.atan2(Math.sin(want - e.h), Math.cos(want - e.h)) * Math.min(1, dt * 12); }
    if (d > step){ e.x += dx / d * step; e.z += dz / d * step; e.walkT += dt * speed * 2.2; return false; }
    e.x = p[0]; e.z = p[1]; step -= d; e.pi++;
  }
  return true;
}
const dmStop = e => { e.path = null; };

/* ---------- putting a generated floor on screen ---------- */
const DM_FLOOR = {C:'#8f8a80', std:'#a07a4e', study:'#7f9a80', laundry:'#7d9db3', office:'#a87f7a', closet:'#7d766a', V:'#3a3d44'};
function dmBuild(L){
  let n = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < L.cols.length; c++){
    const v = L.cell[r][c], col = L.cols[c], row = L.rows[r];
    dmSet(dmFloorIM, n++, col.cx, -.03, row.cz, 0, col.w, 1, row.d, DM_FLOOR[v === 'C' || v === 'V' ? v : v.kind]);
  }
  dmFloorIM.count = n; dmFloorIM.instanceMatrix.needsUpdate = true; dmFloorIM.instanceColor.needsUpdate = true;
  for (const c of dmCols) c.dead = true; dmColN = 0; n = 0;
  for (const w of L.walls){ dmSet(dmWallIM, n++, w.x, DM_H / 2, w.z, 0, w.lx, DM_H, w.lz, '#cfc6b2'); dmCol(w.x, w.z, w.lx / 2, w.lz / 2); }
  for (const b of L.blocks){ dmSet(dmWallIM, n++, b.x, DM_H / 2, b.z, 0, b.lx - .01, DM_H - .02, b.lz - .01, '#7f796d'); dmCol(b.x, b.z, b.lx / 2, b.lz / 2); }
  dmWallIM.count = n; dmWallIM.instanceMatrix.needsUpdate = true; dmWallIM.instanceColor.needsUpdate = true;
  const cnt = {}; for (const k in dmFurIM) cnt[k] = 0;
  for (const f of L.fur){
    const F = DM_FUR[f.type], im = dmFurIM[f.type], sw = Math.abs(Math.sin(f.ry)) > .5;
    if (im && cnt[f.type] < F.cap) dmSet(im, cnt[f.type]++, f.x, .02, f.z, f.ry, 1, 1, 1);
    dmCol(f.x, f.z, (sw ? F.d : F.w) / 2, (sw ? F.w : F.d) / 2);
  }
  for (const k in dmFurIM){ dmFurIM[k].count = cnt[k]; dmFurIM[k].instanceMatrix.needsUpdate = true; }
  /* the locked room's door: a slab with its own collider, taken away when the lock opens */
  dmDoorSlab.visible = !!L.slab;
  if (L.slab){ dmDoorSlab.position.set(L.slab.x, 1.1, L.slab.z); dmDoorSlab.scale.x = L.slab.lx; L.slab.col = dmCol(L.slab.x, L.slab.z, L.slab.lx / 2, .12); }
  for (const e of dmExitFx){
    const x = L.exits.find(q => q.kind === e.kind); e.ring.visible = e.slab.visible = !!x; e.lbl.dead = !x; if (!x) continue;
    e.ring.position.set(x.x, .05, x.z); const side = Math.abs(x.wx - x.x) > .5;
    e.slab.position.set(x.wx + (side ? Math.sign(x.x - x.wx) * .12 : 0), 1.15, x.wz + (side ? 0 : -.12)); e.slab.rotation.y = side ? Math.PI / 2 : 0;
    e.lbl.pos.set(x.x, 3.2, x.z); x.fx = e;
  }
  dmSwFx.forEach((s, i) => { const w = L.sw[i]; s.g.visible = !!w; if (w){ s.g.position.set(w.x, 0, w.z); s.lamp.material.emissiveIntensity = .08; } });
  for (const k in dmClueFx) dmClueFx[k].forEach(m => { m.visible = false; });
  const used = {note:0, phone:0, board:0};
  for (const c of L.clues){
    const m = dmClueFx[c.kind][used[c.kind]++]; if (!m) continue; m.visible = true;
    if (c.kind === 'note'){ const face = c.room.dir; m.position.set(c.x, 1.3, c.room.dz + face * .2); c.z = c.room.dz + face * .7; }
    else if (c.kind === 'phone') m.position.set(c.x + .1, .66, c.z + .3);
    else { m.position.set(c.x, 0, c.z); c.z -= c.room.dir * .9; }
  }
  /* door plates: the number, and what the room is */
  dmLbls.forEach((l, i) => { const d = L.doors[i]; l.dead = true; l.on = !!d; if (d){ l.el.textContent = d.room.num + (d.room.name ? ' ' + d.room.name : ''); l.pos.set(d.x, 2.9, d.z); } });
  dmNavBuild(L); dmMarks();
}
function dmMarks(){
  const L = DORM.L; if (!L) return; let n = 0;
  for (const b of L.boxes){
    const lk = b.lock && !b.lock.open, col = lk ? '#ff6f61' : !b.open ? '#ffd24a' : b.items.length ? '#aab3bb' : null;
    if (col && n < 180) dmSet(dmMarkIM, n++, b.x, b.h + .55, b.z, .6, 1, 1.5, 1, col);
  }
  for (const c of L.clues) if (!c.read && n < 180) dmSet(dmMarkIM, n++, c.x, 2.15, c.z, .6, 1.15, 1.7, 1.15, '#6fc3ff');
  if (L.slab && !L.slab.open) dmSet(dmMarkIM, n++, L.slab.x, 2.7, L.slab.z, .6, 1.15, 1.7, 1.15, '#ff6f61');
  dmMarkIM.count = n; dmMarkIM.instanceMatrix.needsUpdate = true; if (dmMarkIM.instanceColor) dmMarkIM.instanceColor.needsUpdate = true;
}

/* ---------- doors outside the LY towers ---------- */
const DM_DOORS = infos.filter(i => i.tag === '宿舍' && /^LY/.test(i.name)).map(info => {
  const p = frontPoint(info); if (!p) return null;
  const mark = gxMarker('#c9a0ff', .45); mark.position.set(p[0], .1, p[1]);
  const lbl = addLabel(info.name + ' 宿舍', p[0], 4.2, p[1], true); lbl.dead = true;
  return {name:info.name, x:p[0], z:p[1], h:Math.atan2(p[0] - info.wx, p[1] - info.wz), mark, lbl};
}).filter(Boolean);
const dmNearDoor = () => !driving && !DORM.in && nw.state !== 'fly' && DM_DOORS.find(d => Math.hypot(nw.x - d.x, nw.z - d.z) < 3.2);
const dmBusyWhy = () => mission.on ? '先把手上的外卖送完' : gx.busy() ? '先把手上的挑战做完' : '';

/* ---------- going in, coming out ---------- */
function dmEnter(door, seed){
  if (DORM.in) return;
  if (seed == null) seed = window.DORM_SEED != null ? +window.DORM_SEED : (Math.random() * 2147483647) | 0;
  const L = DORM.L = dmGen(seed);
  /* until you have got something out once, a run comes with four short tips and half a minute more */
  const coach = prog.life.dormOut < 1 && prog.life.dormRuns < 4;
  DORM.run = {t:0, limit:DM_LIMIT + (coach ? 30 : 0), bag:new Array(DM_SLOTS).fill(null), seen:false, solved:0, caught:0, bounty:0, told:{}, noiseT:0, alarm:0, bell:false, lockup:false, lastCd:0, lblT:0, dg:0, hb:0, opened:0, coach:coach ? 0 : -1, coachT:0, tip:''};
  dmBuild(L);
  DORM.in = true; DORM.door = door; DORM.keep = {dist:camDist, pitch:camPitch}; DORM.near = null; DORM.hold = 0; DORM.lootBox = null;
  window.XINDOOR = 'dorm'; window.XINDOOR_AT = door; dmSneakReset();
  Object.assign(nw, {x:L.spawn[0], z:L.spawn[1], y:0, h:Math.PI, air:false, state:'idle'}); camYaw = 0; camDist = 13; camPitch = 1.02;
  dmSpawnNpcs(L);
  dmG.visible = true; document.body.classList.add('dm-in');
  for (const d of DM_DOORS){ d.mark.visible = false; d.lbl.dead = true; }
  prog.life.dormRuns++; saveGame(); sfx.ding();
  gxCallout('22:30', `${door.name} 宿舍 · ${L.floor} 楼`, '#c9a0ff');
  toast(`${door.name} 宿舍 · ${L.floor} 楼`, `23:00 宿管锁门，东西带到撤离点才算你的。${TOUCH ? '点「蹲下」' : '按 Q '}蹲着走没声音`, 3600);
  dmUiReset();
}
function dmLeaveWorld(){
  if (!DORM.in) return;
  const d = DORM.door; DORM.in = false; dmG.visible = false; window.XINDOOR = ''; window.XINDOOR_AT = null; dmSneakReset();
  for (const c of dmCols) c.dead = true;
  for (const l of dmLbls) l.dead = true; for (const e of dmExitFx) e.lbl.dead = true; dmAuntLbl.dead = dmThiefLbl.dead = true;
  if (DORM.keep){ camDist = DORM.keep.dist; camPitch = DORM.keep.pitch; }
  if (d){ nw.x = d.x + Math.sin(d.h) * 2; nw.z = d.z + Math.cos(d.h) * 2; nw.h = d.h; camYaw = d.h + Math.PI; }
  nw.y = groundAt(nw.x, nw.z); nw.air = false; if (nw.state !== 'idle') nw.state = 'idle';
  document.body.classList.remove('dm-in'); missionEl.classList.remove('dm-urgent'); DORM.near = null; DORM.hold = 0; dmF(''); dmUiHide();
}
const dmBagItems = () => DORM.run.bag.filter(Boolean);
const dmBagValue = () => dmBagItems().reduce((s, it) => s + it.v, 0);
/* what a run brought in, for the result panel: the thing worth most, and how long it took */
const dmTop = items => items.reduce((b, it) => (!b || it.v > b.v ? it : b), null);
function dmFinish(how){
  const run = DORM.run, items = dmBagItems().filter(it => !it.key), value = items.reduce((s, it) => s + it.v, 0), tok = items.reduce((s, it) => s + it.tok, 0), bonus = [];
  const left = run.limit - run.t, add = (text, pct) => bonus.push({text, pct, rm:Math.round(value * pct)});
  if (items.length){
    if (how === 'fire') add('走消防梯，警报响着冲出去', DM_EXIT_PAY.fire);
    if (how === 'back') add('解开密码走后门，没人看见', DM_EXIT_PAY.back);
    if (left < 15) add(`压哨撤离，只剩 ${Math.ceil(left)} 秒`, .15);
    if (!run.seen) add('全程没被宿管发现', .2);
  }
  /* pay: what the things sold for with the bonuses. income: everything this run put in the wallet (the thief's bounty was paid when you caught him) */
  const pay = value + bonus.reduce((s, b) => s + b.rm, 0), income = pay + run.bounty, prev = prog.best.dorm, rec = pay > 0 && (prev == null || income > prev);
  if (rec) prog.best.dorm = income;
  if (items.length) prog.life.dormOut++; prog.life.dormTok += tok; sess.acts++;
  dmLeaveWorld();
  if (pay > 0) earn(pay); else saveGame();
  if (items.length) unlock('dorm1'); if (pay >= 300) unlock('dormrich'); if (!run.seen && items.length) unlock('dormghost');
  const behind = DORM.L.boxes.reduce((s, b) => s + b.items.reduce((q, it) => q + it.v, 0), 0);
  if (items.length){ gxCallout(left < 15 ? '压哨撤离！' : '撤离成功', `+RM ${pay}`, '#4fd18b'); for (let i = 0; i < 6; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .08); } else sfx.ding();
  /* 改装零件 (js/93-tuning-ui.js): the more you carried out, the better; RM 150+ brings a recipe from the 宿舍 pool */
  const loot = window.XParts && items.length ? XParts.reward('dorm', value >= 300 ? 0 : value >= 150 ? 1 : 2, '宿舍撤离 RM ' + Math.round(value)) : [];
  dmUiEnd({ok:true, how, items, value, pay, income, bounty:run.bounty, tok, bonus, rec, prev, top:dmTop(items), time:run.t, left, solved:run.solved, caught:run.caught, behind, loot});
}
function dmFail(why, quiet){
  const run = DORM.run, kept = run.bag[0] && !run.bag[0].key ? run.bag[0] : null, lost = run.bag.slice(1).filter(it => it && !it.key);
  if (kept){ prog.life.dormTok += kept.tok; }
  dmLeaveWorld();
  if (kept && kept.v > 0) earn(kept.v); else saveGame();
  if (quiet){ if (lost.length || kept) toast('离开了宿舍', lost.length ? `没走撤离点，背包里的 ${lost.length} 件东西没带出来` : '贴身口袋里的东西带出来了', 2600); return; }
  sfx.fail();
  if (why === 'late'){ tone('square', 196, 98, .9, .16); noise(.5, .3, 300); }
  dmUiEnd({ok:false, why, lost, kept, lostValue:lost.reduce((s, it) => s + it.v, 0), income:(kept ? kept.v : 0) + run.bounty, bounty:run.bounty, top:dmTop(lost), time:run.t, solved:run.solved, caught:run.caught});
}

/* ---------- backpack ---------- */
function dmFreeSlot(it){
  const bag = DORM.run.bag;
  for (let i = 1; i < DM_SLOTS; i++) if (!bag[i]) return i;
  return it.small && !bag[0] ? 0 : -1;
}
/* the pocket (slot 0) looks after itself: it always holds the most valuable small thing you carry, and survives being caught */
function dmAutoPocket(){
  const bag = DORM.run.bag, val = it => it.key ? -1 : it.v; let b = -1;
  for (let i = 0; i < DM_SLOTS; i++) if (bag[i] && bag[i].small && (b < 0 || val(bag[i]) > val(bag[b]))) b = i;
  if (b > 0){ const t = bag[0]; bag[0] = bag[b]; bag[b] = t; }
}
function dmTake(box, i){
  const it = box.items[i]; if (!it) return false;
  if (!it.seen) return false;
  const bag = DORM.run.bag; let s = dmFreeSlot(it);
  if (s < 0){
    /* full: swap with the cheapest thing you carry, if this one is worth more. The cheap one goes back where this came from */
    let c = -1; for (let j = 1; j < DM_SLOTS; j++) if (bag[j] && !bag[j].key && (c < 0 || bag[j].v < bag[c].v)) c = j;
    if (c < 0 || (!it.key && bag[c].v >= it.v)){ tone('square', 220, 160, .08, .05); toast('背包满了', c >= 0 ? `${it.name}不比包里最便宜的${bag[c].name}值钱` : '点背包里的东西，可以丢掉腾位置', 1700); return false; }
    const old = bag[c]; box.items.push(old); s = c; toast(`换掉了${old.name}`, `RM ${old.v} → RM ${it.v}`, 1300);
  }
  bag[s] = it; box.items.splice(box.items.indexOf(it), 1); tone('triangle', it.tier === 'n' ? 700 : it.tier === 'r' ? 900 : 1200, it.tier === 'n' ? 900 : 1400, .1, .1);
  if (it.tier === 'r' && !DORM.run.told.rare){ DORM.run.told.rare = 1; toast('稀有：' + it.name, it.tok ? '限量周边，带出去能换「周边券」' : '这个值钱，被抓就没了', 1800); }
  dmAutoPocket();
  if (dmBagItems().length === DM_SLOTS && !DORM.run.told.full){ DORM.run.told.full = 1; toast('背包满了', '再拿更值钱的会自动换掉最便宜的 · 该撤了？', 2200); }
  dmMarks(); dmUiBag(); dmUiLoot(box.items.length ? box : null); return true;
}
const dmTakeNext = box => { const i = box.items.findIndex(it => it.seen); if (i >= 0) dmTake(box, i); };
function dmDrop(i){
  const run = DORM.run, it = run.bag[i]; if (!it) return;
  run.bag[i] = null; const b = DORM.lootBox;
  if (b){ it.seen = true; b.items.push(it); dmUiLoot(b); } else toast('丢掉了：' + it.name, '', 1200);
  tone('sine', 300, 200, .1, .08); dmAutoPocket(); dmMarks(); dmUiBag();
}

/* ---------- locks ---------- */
function dmUnlock(k){
  if (k.open) return; k.open = true; const run = DORM.run, L = DORM.L; run.solved++; prog.life.dormPz++; saveGame();
  if (k.what === 'door'){ L.slab.open = true; L.slab.col.dead = true; dmDoorSlab.visible = false; dmNavSlab(L); L.peek.push([k.x, k.z + k.ref.dir * 2]); }
  sfx.sparkle(); gxCallout('解开了', k.name, '#4aa3ff');
  toast(k.name + '打开了', k.what === 'exit' ? '从后门撤离：没人看见，带出的东西多卖 10%' : k.what === 'door' ? '里面的东西比别的寝室好' : '看看里面有什么', 2600);
  if (prog.life.dormPz >= 5) unlock('dormpz');
  dmMarks();
}
function dmTryCode(k, code){
  if (k.open || k.cool > 0) return false;
  if (code === k.code){ dmUnlock(k); return true; }
  k.cool = 2; tone('square', 180, 120, .25, .1); dmNoise(k.x, k.z, 9, '密码错了，键盘「嘀——」了一声');
  return false;
}
function dmPressSwitch(w){
  const L = DORM.L, k = L.locks.find(q => q.kind === 'lights'); if (!k || k.open || w.on) return;
  if (k.seq[k.at] === w.i){
    w.on = true; dmSwFx[w.i].lamp.material.emissiveIntensity = 1.8; k.at++; tone('triangle', 520 + k.at * 130, 520 + k.at * 130, .16, .12);
    if (k.at >= k.seq.length) dmUnlock(k); else gxCallout(`${k.at} / ${k.seq.length}`, DM_SW[w.i][0] + '灯亮了', DM_SW[w.i][1]);
  } else {
    k.at = 0; for (const s of L.sw){ s.on = false; dmSwFx[s.i].lamp.material.emissiveIntensity = .08; }
    tone('square', 180, 120, .25, .1); dmNoise(w.x, w.z, 10, '顺序错了，灯全灭了');
  }
}

/* ---------- 宿管阿姨 and the thief ---------- */
function dmSpawnNpcs(L){
  /* she starts at the far end of the building, so the first half minute is yours */
  const byFar = (p, q) => Math.hypot(q[0] - L.spawn[0], q[1] - L.spawn[1]) - Math.hypot(p[0] - L.spawn[0], p[1] - L.spawn[1]), start = L.way.slice().sort(byFar)[0];
  const a = DORM.aunt = {x:start[0], z:start[1], h:0, state:'patrol', path:null, pi:0, rep:0, gx:0, gz:0, walkT:0, seeT:0, lostT:0, wait:2.5, stun:0, catchT:0, tx:0, tz:0, wp:null, look:0, range:9, step:0};
  dmAuntFig.g.visible = true; dmFan.visible = true;
  /* the thief starts in a room far from the lobby */
  const far = L.peek.slice().sort(byFar)[1 + ((Math.random() * 3) | 0)] || L.way[0];
  DORM.thief = {x:far[0], z:far[1], h:0, state:'roam', path:null, pi:0, rep:0, gx:0, gz:0, walkT:0, bag:[], cd:35, tgt:null, t:0, down:0, on:true, stole:false, fleeTo:null, pick:0, picking:false};
  dmThiefFig.g.visible = true;
  dmPlace(a, dmAuntFig); dmPlace(DORM.thief, dmThiefFig);
}
function dmPlace(e, fig, wob){
  fig.g.position.set(e.x, 0, e.z); fig.g.rotation.y = e.h + (wob || 0);
  const sw = e.moving ? Math.sin(e.walkT) * .5 : 0; fig.legs[0].rotation.x = sw; fig.legs[1].rotation.x = -sw;
  fig.arms[0].rotation.x = -sw * .8;   /* the right arm swings against the legs; the left one holds her torch / his bag */
}
/* something loud at (x, z): if the 宿管 is within r and not already after you, she walks over to look */
function dmNoise(x, z, r, say){
  const a = DORM.aunt, run = DORM.run; if (!a || a.state === 'chase' || a.state === 'stun') return;
  if (Math.hypot(a.x - x, a.z - z) > r) return;
  a.state = 'search'; a.tx = x; a.tz = z; a.look = 0; dmStop(a);
  if (say && run.noiseT <= 0){ run.noiseT = 4; toast(say, '宿管阿姨听见了，正往这边走', 1800); tone('square', 660, 660, .08, .06); }
}
function dmAunt(dt){
  const a = DORM.aunt, run = DORM.run, L = DORM.L, d = Math.hypot(nw.x - a.x, nw.z - a.z);
  const hot = run.bag.some(it => it && it.id === 'pot');
  a.range = (a.state === 'chase' ? 12 : 9) * (hot ? 1.3 : 1);
  const ang = Math.atan2(nw.x - a.x, nw.z - a.z), da = Math.abs(Math.atan2(Math.sin(ang - a.h), Math.cos(ang - a.h)));
  /* crouched she has to be closer, and does not feel you behind her until you bump into her (not while she is chasing: she has her eyes on you).
     Tucked in beside furniture and still, only right on top of you, unless she was looking at you a moment ago (a.knows: she watched you duck).
     So in a chase: break her line of sight first, then hide */
  if (a.knows == null) a.knows = 0;
  const low = DORM.crouch && a.state !== 'chase', R = DORM.hid && a.knows <= 0 ? DM_HID_R : low ? a.range * DM_CROUCH_VIEW : a.range, back = low ? 1.2 : 2.2;
  const sees = d < R && (d < back || da < .96) && dmSee(a.x, a.z, nw.x, nw.z);
  a.knows = sees ? DM_KNOW : Math.max(0, a.knows - dt);
  let wob = 0; a.moving = false;
  if (a.state === 'stun'){
    a.stun -= dt; wob = Math.sin(a.stun * 14) * .4;
    if (Math.random() < dt * 8) spawnPart('dust', a.x + (Math.random() - .5) * .6, 2.2, a.z + (Math.random() - .5) * .6, .3, {vy:-1.5, life:.5, op:.9, color:'#9fd8ff'});
    if (a.stun <= 0){ a.state = 'search'; a.tx = nw.x; a.tz = nw.z; a.look = 0; a.seeT = .4; dmStop(a); }
  } else {
    /* she needs a moment to be sure it is you: about 0.2 s up close, 0.8 s at the far end of her torch */
    a.seeT = sees ? a.seeT + dt * (d < 3 ? 4 : 4 - (d - 3) / Math.max(.5, R - 3) * 3.1) : Math.max(0, a.seeT - dt * .8);
    if (a.state !== 'chase' && a.seeT > .7){
      a.state = 'chase'; a.lostT = 0; run.seen = true; dmStop(a); tone('square', 880, 660, .15, .08);
      if (!run.told.seen){ run.told.seen = 1; toast('宿管阿姨：哪个寝室的！站住！', TOUCH ? '跑！拐过墙角再蹲到家具旁边，或者用「水枪」淋她' : '跑！拐过墙角再按 Q 蹲到家具旁边，或者按 E 用水枪淋她', 3000); }
      else gxCallout('被发现了', '宿管在追你', '#ff6f61');
    }
    if (a.state === 'chase'){
      if (sees){ a.lostT = 0; a.tx = nw.x; a.tz = nw.z; } else a.lostT += dt;
      a.moving = !dmGo(a, a.tx, a.tz, 6.1 + .3 * (typeof pveLevel === 'function' ? pveLevel() : 0), dt);
      if (d < 1.4 && sees){ a.catchT += dt; if (a.catchT > .35){ dmFail('caught'); return; } } else a.catchT = 0;
      if (a.lostT > 3.2){ a.state = 'search'; a.look = 0; dmStop(a); gxCallout('甩掉了', '宿管在找你', '#ffd27a'); tone('triangle', 520, 780, .2, .1); }
    } else if (a.state === 'search'){
      if (a.look > 0){ a.look -= dt; a.h += dt * 2.4; if (a.look <= 0){ a.state = 'patrol'; a.wp = null; a.wait = 0; } }
      else if (dmGo(a, a.tx, a.tz, 3.9, dt)){ a.look = 2.6; dmStop(a); } else a.moving = true;
    } else {
      /* patrol; in the last half minute she goes to the main door and stands there to lock it */
      if (run.lockup){
        const m = L.exits[0];
        if (dmGo(a, m.x, m.z - 1.6, 3.6, dt)){ a.h += Math.atan2(Math.sin(Math.PI - a.h), Math.cos(Math.PI - a.h)) * Math.min(1, dt * 6); } else a.moving = true;
      } else if (a.wait > 0){ a.wait -= dt; a.h += Math.sin(a.wait * 2.2) * dt * .9; }
      else {
        if (!a.wp){ const pool = Math.random() < .3 && L.peek.length ? L.peek : L.way.filter(p => Math.hypot(p[0] - a.x, p[1] - a.z) > 9); a.wp = pool[(Math.random() * pool.length) | 0] || L.way[0]; dmStop(a); }
        if (dmGo(a, a.wp[0], a.wp[1], 2.6, dt)){ a.wp = null; a.wait = .8 + Math.random() * 1.4; dmStop(a); } else a.moving = true;
      }
    }
  }
  dmPlace(a, dmAuntFig, wob);
  /* her footsteps: louder as she gets closer, quicker when she runs */
  if (a.moving && d < 20){ const s = Math.floor(a.walkT / Math.PI); if (s !== a.step){ a.step = s; const v = Math.pow(1 - d / 20, 1.6) * (a.state === 'chase' ? .34 : .22); tone('sine', a.state === 'chase' ? 130 : 96, 55, .07, v); noise(.03, v * .35, 1200); } }
  /* the fan on the floor: as long as she can see along her nose, red while she is after you */
  dmFan.visible = a.state !== 'stun'; dmFan.position.set(a.x, .07, a.z); dmFan.rotation.y = a.h;
  if (dmFan.visible){
    const P = dmFan.geometry.attributes.position;
    for (let i = 0; i <= DM_FAN_N; i++){
      const rel = -DM_FAN_HALF + 2 * DM_FAN_HALF * i / DM_FAN_N, sx = Math.sin(a.h + rel), sz = Math.cos(a.h + rel); let r = .6;
      while (r < a.range){ const k = dmCi(a.x + sx * (r + .3), a.z + sz * (r + .3)); if (k < 0 || DMN.sight[k]) break; r += .3; }
      P.setXYZ(i + 1, Math.sin(rel) * r, 0, Math.cos(rel) * r);
    }
    P.needsUpdate = true;
  }
  dmFan.material.color.set(a.state === 'chase' ? '#ff3b30' : a.seeT > .15 ? '#ff9a1f' : '#ffd24a'); dmFan.material.opacity = a.state === 'chase' ? .45 : a.seeT > .15 ? .42 : .34;
  dmAuntLbl.dead = d > 18; dmAuntLbl.pos.set(a.x, 3.3, a.z);
  const txt = a.state === 'stun' ? '宿管阿姨 · 擦眼镜' : a.state === 'chase' ? '宿管阿姨 · 在追你！' : a.state === 'search' ? '宿管阿姨 · ？' : '宿管阿姨'; if (dmAuntLbl.el.textContent !== txt) dmAuntLbl.el.textContent = txt;
}
function dmSoakAunt(power, info){
  const a = DORM.aunt; if (!DORM.in || !a || a.state === 'stun') return;
  const t = Math.min(6, 3 * (power || 1)); a.state = 'stun'; a.stun = t; a.catchT = 0; dmStop(a); DORM.run.seen = true;
  if (info && info.push) for (let k = 0; k < 6; k++){ const x = a.x + info.fx * .5, z = a.z + info.fz * .5, c = dmCi(x, z); if (c < 0 || DMN.blk[c]) break; a.x = x; a.z = z; }
  splashAt(a.x, 1.6, a.z); sfx.splash(); gxCallout('淋湿了', `宿管擦眼镜 ${Math.round(t * 10) / 10} 秒`, '#4aa3ff');
}
function dmThiefUp(dt){
  const t = DORM.thief, run = DORM.run, L = DORM.L; if (!t.on) return;
  const d = Math.hypot(nw.x - t.x, nw.z - t.z), bag = run.bag; let wob = 0; t.moving = false; t.cd -= dt;
  const stealable = () => { let b = -1; for (let i = 1; i < DM_SLOTS; i++) if (bag[i] && !bag[i].key && (b < 0 || bag[i].v > bag[b].v)) b = i; return b; };
  if (t.state === 'down'){
    t.down -= dt; wob = Math.sin(t.down * 16) * .5;
    if (t.down <= 0){ t.state = 'flee'; t.fleeTo = null; dmStop(t); }
  } else if (t.state === 'flee'){
    /* with your stuff he heads for the fire stairs and is gone; otherwise he just puts some distance between you */
    if (!t.fleeTo){ const f = L.exits[1]; t.fleeTo = t.stole ? [f.x, f.z] : L.way.slice().sort((p, q) => Math.hypot(q[0] - nw.x, q[1] - nw.z) - Math.hypot(p[0] - nw.x, p[1] - nw.z))[0]; t.t = 0; dmStop(t); }
    t.t += dt;
    if (dmGo(t, t.fleeTo[0], t.fleeTo[1], 7.2, dt)){
      if (t.stole){ t.on = false; dmThiefFig.g.visible = false; dmThiefLbl.dead = true; sfx.fail(); toast('小偷从消防梯跑了', `${t.bag.filter(it => it.mine).map(it => it.name).join('、')}没了`, 2800); return; }
      t.state = 'roam'; t.tgt = null; dmStop(t);
    } else t.moving = true;
  } else if (t.state === 'stalk'){
    const s = stealable();
    if (s < 0 || d > 13){ t.state = 'roam'; t.tgt = null; dmStop(t); }
    else if (d < 1.7 && (t.pick += dt) < .9){
      /* his hand is in your bag for a moment: step away or squirt him and he gets nothing */
      if (!t.picking){ t.picking = true; gxCallout('有人掏你的包！', TOUCH ? '走开，或者用水枪' : '走开，或者按 E', '#ff9f43'); tone('square', 520, 520, .06, .09); tone('square', 520, 520, .06, .09, .12); }
    } else if (d < 1.7){
      const it = bag[s]; bag[s] = null; it.mine = true; t.bag.push(it); t.stole = true; t.state = 'flee'; t.fleeTo = null; t.cd = 25; t.pick = 0; t.picking = false; dmStop(t);
      sfx.fail(); camShake = .5; dmAutoPocket(); dmUiBag(); gxCallout('被偷了！', it.name, '#ff6f61');
      toast(`外卖小偷顺走了你的${it.name}`, TOUCH ? '追上去用「水枪」淋他，再点「抓住」' : '追上去按 E 用水枪淋他，再按 F 抓住。让他跑到消防梯就没了', 3200);
    } else { t.pick = Math.max(0, t.pick - dt * 2); if (t.pick <= 0) t.picking = false; dmGo(t, nw.x, nw.z, 5, dt); t.moving = true; }
  } else if (t.state === 'loot'){
    t.t -= dt; wob = Math.sin(t.t * 9) * .25;
    if (t.t <= 0){
      const b = t.tgt; if (b && !b.open && b.items.length && t.bag.length < 4){ let k = 0; for (let i = 1; i < b.items.length; i++) if (b.items[i].v > b.items[k].v && !b.items[i].key) k = i; if (!b.items[k].key){ t.bag.push(b.items.splice(k, 1)[0]); dmMarks(); } }
      t.state = 'roam'; t.tgt = null;
    }
  } else {
    if (t.cd <= 0 && d < (DORM.hid ? 2 : DORM.crouch ? 5 : 8) && stealable() >= 0 && dmSee(t.x, t.z, nw.x, nw.z)){ t.state = 'stalk'; dmStop(t); if (!run.told.thief){ run.told.thief = 1; toast('有个戴口罩的人盯着你的背包', '偷外卖的小偷！别让他贴上来', 2200); } }
    else {
      if (!t.tgt){ const pool = L.boxes.filter(b => !b.open && b.items.length && !(b.lock && !b.lock.open) && !(b.room && b.room.lock && !b.room.lock.open) && b.type !== 'sack'); t.tgt = pool[(Math.random() * pool.length) | 0] || null; dmStop(t); if (!t.tgt){ t.wp = L.way[(Math.random() * L.way.length) | 0]; } }
      const g = t.tgt ? [t.tgt.x, t.tgt.z] : t.wp;
      if (dmGo(t, g[0], g[1], 3.2, dt)){ if (t.tgt){ t.state = 'loot'; t.t = 2.6; } else t.wp = L.way[(Math.random() * L.way.length) | 0]; dmStop(t); } else t.moving = true;
    }
  }
  dmPlace(t, dmThiefFig, wob); dmThiefFig.g.rotation.x = t.state === 'down' ? -1.2 : 0; dmThiefFig.g.position.y = t.state === 'down' ? .35 : 0;
  dmThiefLbl.dead = d > 16; dmThiefLbl.pos.set(t.x, 3.2, t.z);
  const txt = t.state === 'down' ? '外卖小偷 · 滑倒了' : t.stole ? '外卖小偷 · 拿着你的东西！' : '外卖小偷'; if (dmThiefLbl.el.textContent !== txt) dmThiefLbl.el.textContent = txt;
}
function dmSoakThief(power){
  const t = DORM.thief; if (!DORM.in || !t || !t.on || t.state === 'down') return;
  t.state = 'down'; t.down = Math.min(7, 3.4 * (power || 1)); t.pick = 0; t.picking = false; dmStop(t); splashAt(t.x, 1.4, t.z); sfx.splash();
  gxCallout('滑倒了', TOUCH ? '点「抓住」' : '按 F 抓住他', '#4aa3ff');
}
function dmGrab(){
  const t = DORM.thief, run = DORM.run, L = DORM.L; if (!t.on || t.state !== 'down') return;
  t.on = false; dmThiefFig.g.visible = false; dmThiefLbl.dead = true; run.caught++; run.bounty += 40; prog.life.dormThief++;
  const c = dmNearFree(dmCi(t.x, t.z)), sx = c >= 0 ? dmCx(c) : t.x, sz = c >= 0 ? dmCz(c) : t.z;
  earn(40); unlock('dormthief'); sfx.sparkle(); gxCallout('抓住了！', '悬赏 +RM 40', '#4fd18b');
  for (let i = 0; i < 8; i++) spawnPart('heart', t.x + (Math.random() - .5) * 2, 1.5 + Math.random(), t.z + (Math.random() - .5) * 2, .7, {vy:2.2, life:1.2, op:1, color:'#ffd24a'});
  if (t.bag.length){
    const sp = dmSpace(sx, sz), sack = {type:'sack', x:sx, z:sz, room:typeof sp === 'object' ? sp : null, items:t.bag.slice(), open:true, lock:null, r:2.6, h:.3}; for (const it of sack.items) it.seen = true; t.bag.length = 0; L.boxes.push(sack); dmMarks();
    toast('抓住了偷外卖的小偷', `悬赏 RM 40 · 他的赃物袋里有 ${sack.items.length} 件东西，挑着拿`, 3000); dmUiLoot(sack);
  } else toast('抓住了偷外卖的小偷', '悬赏 RM 40 · 他还没来得及偷到东西', 2600);
}
/* the water gun: targets register once; walls stop the jet */
function dmWaterTargets(){
  if (!DORM.in) return null; const out = [], a = DORM.aunt, t = DORM.thief;
  if (a && a.state !== 'stun' && dmSee(nw.x, nw.z, a.x, a.z)) out.push({x:a.x, z:a.z, hit:dmSoakAunt});
  if (t && t.on && t.state !== 'down' && dmSee(nw.x, nw.z, t.x, t.z)) out.push({x:t.x, z:t.z, hit:dmSoakThief});
  return out;
}
const DM_WG_API = typeof wgAddTarget === 'function';
if (DM_WG_API) wgAddTarget(dmWaterTargets);

/* ---------- F: what is in reach, and what pressing or holding does ---------- */
/* which space a point is in: a room object, 'C' for corridor and lobby, 'V' for a solid block */
function dmSpace(x, z){
  const L = DORM.L, r = L.rows.findIndex(q => z < q.z1), c = L.cols.findIndex(q => x < q.x1);
  return r < 0 || c < 0 || z < L.z0 || x < L.x0 ? 'V' : L.cell[r][c];
}
function dmFindNear(){
  const L = DORM.L, run = DORM.run, x = nw.x, z = nw.z, t = DORM.thief, here = dmSpace(x, z); let best = null, bd = 1e9;
  /* nearest wins, and what you are facing counts for up to half a metre */
  const tryIt = (kind, o, ox, oz, reach, bias) => { const d = Math.hypot(x - ox, z - oz); if (d >= reach) return; const s = d - bias - (d > .1 ? .5 * Math.cos(Math.atan2(ox - x, oz - z) - nw.h) : 0); if (s < bd){ bd = s; best = {kind, o}; } };
  if (t && t.on && t.state === 'down') tryIt('grab', t, t.x, t.z, 2.6, 9);
  for (const e of L.exits) tryIt('exit', e, e.x, e.z, 1.5, 0);
  /* only what is in the room you are standing in: no reaching through walls */
  for (const c of L.clues) if (c.room === here) tryIt('clue', c, c.x, c.z, 2.1, c.read ? -.8 : .8);
  for (const k of L.locks) if (!k.open && k.what === 'door') tryIt('lock', k, k.x, k.z, 2.2, 0);
  if (L.locks.some(k => k.kind === 'lights' && !k.open)) for (const w of L.sw) if (!w.on) tryIt('sw', w, w.x, w.z, 2, .4);
  for (const b of L.boxes) if ((!b.open || b.items.length) && (b.room || 'C') === here) tryIt('box', b, b.x, b.z, b.r, b.open ? 0 : .6);   /* one not searched yet wins over leftovers next to it */
  return best;
}
const dmLocked = b => b.lock && !b.lock.open;
/* called by roomTryF() on a press of F; true means the press was used here */
function dmTryF(){
  if (mode !== 'naiwa' || driving) return false;
  if (!DORM.in){
    const d = dmNearDoor(); if (!d) return false;
    const why = dmBusyWhy(); if (why){ toast('现在进不去', why, 1800); return true; }
    dmEnter(d); return true;
  }
  /* while a container is open F takes the next thing out of it, whatever else is in reach */
  if (DORM.lootBox && DORM.lootBox.items.length){ dmTakeNext(DORM.lootBox); return true; }
  const n = DORM.near; if (!n) return true;
  const o = n.o, run = DORM.run;
  if (n.kind === 'grab') dmGrab();
  else if (n.kind === 'clue'){ if (!o.read){ o.read = true; dmMarks(); tone('triangle', 880, 1100, .1, .1); } dmUiClue(o); }
  else if (n.kind === 'sw') dmPressSwitch(o);
  else if (n.kind === 'lock'){
    if (o.kind === 'key'){ const i = run.bag.findIndex(it => it && it.key === o.id); if (i >= 0){ run.bag[i] = null; dmAutoPocket(); dmUiBag(); dmUnlock(o); } else { tone('square', 220, 160, .08, .05); toast(o.name + '锁着', `要找到「${o.ref.num} 的钥匙」，在别的柜子里`, 2200); } }
    else { tone('square', 220, 160, .08, .05); toast(o.name + '是电控锁', '楼道里有四个彩色开关，按线索上的顺序按', 2400); }
  }
  else if (n.kind === 'exit'){
    if (o.kind === 'main'){ if (run.t > 1.5) dmFinish('main'); }
    else if (o.kind === 'back'){ if (dmLocked(o)) dmUiPad(o.lock); else dmFinish('back'); }
  }
  else if (n.kind === 'box'){
    if (dmLocked(o)) dmUiPad(o.lock);
    else if (DORM.lootBox === o && o.items.length) dmTakeNext(o);
    else if (o.open) dmUiLoot(o);
  }
  return true;
}
if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ return dmTryF() || base(); }; }
let dmFL = '';
function dmF(t){
  const b = actF.querySelector('b');
  if (t){ if (b.textContent !== t) b.textContent = t; } else if (dmFL) updateActs();
  dmFL = t;
}

/* ---------- crouching: Q / 「蹲下」. The key, the slow walk and the squashed 奶娃 are js/87-heist.js's (SNEAK); what it means here is below ----------
   Crouched: about 3 m/s instead of 5.5, never a run, so no footsteps; the 宿管 sees 60% as far and does not feel you behind her.
   Crouched, still and within reach of furniture in the same room (bed, wardrobe, desk, parcel...): hidden, she only sees you right on top of you,
   unless she was looking at you when you ducked. Jumping or the water gun stands you up. */
const DM_CROUCH_VIEW = .6, DM_HID_R = 1.6, DM_KNOW = 1.2, DM_HIDE_GAP = 1.6, DM_STEP_R = 3, DM_RUMMAGE = 5;
Object.assign(DORM, {crouch:false, hid:false, desk:null, slide:0, shots:0});
const dmQ = () => { if (typeof sneakQ === 'function') sneakQ(); };
function dmCrouch(on){
  if (DORM.crouch === on) return; DORM.crouch = on; if (!on){ DORM.hid = false; DORM.desk = null; }
  tone('sine', on ? 420 : 300, on ? 300 : 420, .08, .05); dmQ();
}
function dmSneakReset(){ DORM.crouch = DORM.hid = false; DORM.desk = null; DORM.slide = 0; DORM.shots = typeof WG !== 'undefined' ? WG.shots : 0; dmQ(); }
if (typeof SNEAK !== 'undefined') SNEAK.push({here:() => DORM.in && mode === 'naiwa', st:DORM, set:dmCrouch});
/* the nearest point on the side of a piece of furniture in the room you are in, if you are close enough to tuck in beside it.
   You cannot stand closer than 0.9 m to anything (footBlocked), so 1.6 means "against it, give or take a step" */
function dmCover(x, z){
  const here = dmSpace(x, z); let best = null, bd = DM_HIDE_GAP;
  for (const f of DORM.L.fur){
    if ((f.room || 'C') !== here) continue;
    const F = DM_FUR[f.type], sw = Math.abs(Math.sin(f.ry)) > .5, hx = (sw ? F.d : F.w) / 2, hz = (sw ? F.w : F.d) / 2;
    const qx = Math.max(f.x - hx, Math.min(f.x + hx, x)), qz = Math.max(f.z - hz, Math.min(f.z + hz, z)), g = Math.hypot(x - qx, z - qz);
    if (g < bd){ bd = g; best = {x:qx, z:qz, f}; }
  }
  return best;
}
function dmSneak(dt){
  const a = DORM.aunt, run = DORM.run;
  if (typeof WG !== 'undefined' && WG.shots !== DORM.shots){ DORM.shots = WG.shots; if (DORM.crouch) dmCrouch(false); }
  DORM.desk = DORM.crouch && !nw.air ? dmCover(nw.x, nw.z) : null;
  const hid = !!DORM.desk && nw.spd < .5;
  if (hid && !DORM.hid){ tone('sine', 300, 220, .1, .05); if (!run.told.hid){ run.told.hid = 1; gxCallout('躲起来了', '宿管走到跟前才看得见你', '#c9a0ff'); } }
  DORM.hid = hid;
  /* walking upright right behind her: she hears your steps and turns round to look. Crouched you can creep past */
  if (!DORM.crouch && nw.spd > 1 && a && a.state === 'patrol' && !run.lockup && Math.hypot(a.x - nw.x, a.z - nw.z) < DM_STEP_R) dmNoise(nw.x, nw.z, DM_STEP_R, '走得太近，宿管听见脚步了（蹲着走没声音）');
}
/* the line above the backpack when nothing in reach wants F */
function dmSneakPrompt(){
  const a = DORM.aunt;
  if (DORM.hid) return a && a.knows > 0 ? '她看着你蹲下的！先拐过墙角甩开她再躲' : '躲好了 · 宿管走到跟前才看得见你';
  if (DORM.crouch) return DORM.desk ? '靠着家具 · 停下别动就是躲起来' : '蹲着走没声音，宿管看不远 · 停在家具旁边就是躲起来';
  return '';
}

/* ---------- per-frame ---------- */
let dmPrompt = '';
/* first runs: one line at a time above the backpack, each moving on when you have done what it says */
function dmCoach(dt){
  const run = DORM.run; if (run.coach < 0) return;
  const F = TOUCH ? '按住「搜」' : '按住 F';
  const steps = [
    [`① 金色菱形 = 还没搜过的柜子。走过去，${F}`, () => run.opened > 0, 60],
    ['② 点东西放进背包。只有 6 格，便宜的别拿；第一格是贴身口袋，自动装最值钱的小件', () => dmBagItems().length > 0, 14],   /* shown inside the list while a container is open (js/89-dorm-ui.js) */
    [`③ 地上的光扇是宿管的视野，绕开走。跑步她听得见；${TOUCH ? '点「蹲下」' : '按 Q '}蹲着走没声音，停在家具旁边就是躲起来`, () => false, 11],
    [`④ 23:00 前走到撤离点，东西才算你的。绿圈大门最稳；消防梯（橙）多卖 ${dmPct('fire')}%，后门（蓝，要密码）多卖 ${dmPct('back')}%`, () => false, 11]
  ];
  const s = steps[run.coach]; run.coachT += dt;
  if (!s || s[1]() || run.coachT > s[2]){ run.coach = s && run.coach + 1 < steps.length ? run.coach + 1 : -1; run.coachT = 0; if (run.coach >= 0) tone('triangle', 880, 1100, .1, .08); }
  run.tip = run.coach >= 0 ? steps[run.coach][0] : '';
}
const dmClock = t => { const s = 22 * 3600 + 30 * 60 + Math.min(1799, Math.floor(t / DORM.run.limit * 1800)); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
function dmUpdate(dt, px, pz){
  dmPrompt = '';
  if (!DORM.in){
    const T = performance.now();
    for (const d of DM_DOORS){ d.mark.visible = true; d.lbl.dead = Math.hypot(px - d.x, pz - d.z) > 140; d.mark.userData.ring.scale.y = 1 + Math.sin(T / 300) * .15; }
    const nd = dmNearDoor();
    if (nd){ const why = dmBusyWhy(); dmPrompt = why ? `${nd.name} 宿舍 · ${why}` : (TOUCH ? '点「进宿舍」' : '按 F ') + `进 ${nd.name} 宿舍搜一圈 · 23:00 门禁` + (prog.best.dorm ? ` · 纪录 RM ${prog.best.dorm}` : ''); }
    dmF(nd ? '进宿舍' : '');
    if (nd && !dmBusyWhy() && typeof offerJob === 'function') offerJob('dorm:' + nd.name, () => ({icon:'🎒', title:nd.name + ' 宿舍搜刮', desc:'进去搜一圈，赶在 23:00 门禁前带着东西出来', accept:'进宿舍',
      pay:prog.best.dorm ? '纪录 RM ' + prog.best.dorm : '带出来多少算多少', risk:'被宿管阿姨抓到，身上的东西全没', onAccept:() => { const d = dmNearDoor(); if (d && !dmBusyWhy()) dmEnter(d); }}));
    return;
  }
  const run = DORM.run, L = DORM.L, hold = keys.KeyF || keys.Enter || actF.classList.contains('on');
  run.t += dt; run.noiseT -= dt;
  const left = run.limit - run.t;
  if (left <= 0){ dmFail('late'); return; }
  if (left < 70 && !run.bell){ run.bell = true; gxCallout('22:50', '广播：还有十分钟锁门', '#ffb347'); toast('广播：还有十分钟锁门', '还没回寝室的同学抓紧了。宿管一会儿去大门口守着', 2800); for (let i = 0; i < 3; i++) tone('triangle', 660, 660, .2, .08, i * .3); }
  if (left < 28 && !run.lockup){ run.lockup = true; const a = DORM.aunt; if (a.state === 'patrol'){ a.wp = null; a.wait = 0; dmStop(a); } gxCallout('快锁门了', '宿管去大门口守着', '#ff6f61'); toast('宿管去大门口守着了', (TOUCH ? '用「水枪」淋她再冲出去' : '按 E 淋她再冲出去') + '，或者走消防梯（橙圈）', 3000); }
  if (Math.floor(left) !== Math.floor(left + dt)){ if (left < 10){ tone('square', 880, 880, .08, .08); if (Math.floor(left) === 9) gxCallout('最后 10 秒', '快撤！', '#ff6f61'); } else if (left < 30) tone('square', 660, 660, .03, .035); }
  /* how scared you should be, 0..1: drives the heartbeat and the red edge of the screen */
  { const a = DORM.aunt, d = Math.hypot(nw.x - a.x, nw.z - a.z); let dg = 0;
    if (a.state === 'chase') dg = 1; else if (a.state !== 'stun') dg = Math.max(a.seeT / .7 * .8, d < 9 ? (9 - d) / 9 * .5 : 0, a.state === 'search' && d < 12 ? .4 : 0);
    if (left < 30) dg = Math.max(dg, .3 + (30 - left) / 30 * .5);
    run.dg += (dg - run.dg) * Math.min(1, dt * 4); run.hb -= dt * (1 + run.dg * 1.5);
    if (run.dg > .22 && run.hb <= 0){ run.hb = .95; tone('sine', 64, 40, .1, .1 + run.dg * .16); tone('sine', 56, 38, .12, .06 + run.dg * .12, .17); } }
  dmCoach(dt);
  for (const k of L.locks) if (k.cool > 0) k.cool -= dt;
  /* rooms you have stepped into show up on the floor plan */
  for (const r of L.rooms) if (!r.seen && nw.x > r.x0 && nw.x < r.x1 && nw.z > r.z0 && nw.z < r.z1) r.seen = true;
  dmSneak(dt);
  if (nw.spd > 8) dmNoise(nw.x, nw.z, 7, '跑起来脚步声太响');
  if (nw.state === 'laugh' && nw.t < .1) dmNoise(nw.x, nw.z, 14, '在楼道里大笑');
  /* the water gun without the target list of js/87-classroom.js: watch for a shot and see what stands in front */
  if (!DM_WG_API && typeof WG !== 'undefined'){
    if (WG.cd > run.lastCd + .2){
      let best = null, bd = 16;
      for (const tg of dmWaterTargets()){ const dx = tg.x - nw.x, dz = tg.z - nw.z, d = Math.hypot(dx, dz), da = Math.atan2(dx, dz) - nw.h; if (d < bd && Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < .7){ bd = d; best = tg; } }
      if (best) setTimeout(() => best.hit(1), Math.min(400, bd * 25));
    }
    run.lastCd = WG.cd;
  }
  dmAunt(dt); if (!DORM.in) return;
  dmThiefUp(dt);
  if (run.alarm > 0){ run.alarm -= dt; if (Math.floor(run.alarm * 3) !== Math.floor((run.alarm + dt) * 3)) tone('square', 980, 760, .25, .07); }

  /* what F does here */
  const n = DORM.near = dmFindNear(); let label = '', need = 0;
  if (n){
    const o = n.o;
    if (n.kind === 'grab'){ label = '抓住'; dmPrompt = (TOUCH ? '点「抓住」' : '按 F ') + '抓住小偷'; }
    else if (n.kind === 'clue'){ label = '看'; dmPrompt = (TOUCH ? '点「看」' : '按 F 看') + o.title; }
    else if (n.kind === 'sw'){ label = '按'; dmPrompt = (TOUCH ? '点「按」' : '按 F ') + `按下${DM_SW[o.i][0]}色开关`; }
    else if (n.kind === 'lock'){ label = '开锁'; dmPrompt = o.name + (o.kind === 'key' ? ' · 要钥匙' : ' · 电控锁，要按对四个开关'); }
    else if (n.kind === 'exit'){
      const v = dmBagValue(), sell = k => (v ? ` · 能卖 RM ${v + Math.round(v * DM_EXIT_PAY[k])}` : ' · 背包是空的');
      if (o.kind === 'main'){ label = '撤离'; dmPrompt = (TOUCH ? '点「撤离」' : '按 F ') + `从大门撤离${sell('main')}`; }
      else if (o.kind === 'back'){ label = dmLocked(o) ? '开锁' : '撤离'; dmPrompt = dmLocked(o) ? `后门锁着 · 从这里走多卖 ${dmPct('back')}% · ` + (TOUCH ? '点「开锁」输密码' : '按 F 输密码') : (TOUCH ? '点「撤离」' : '按 F ') + `从后门溜走 · 多卖 ${dmPct('back')}%${sell('back')}`; }
      else { label = '推门'; need = 2.2; dmPrompt = DORM.hold > 0 ? `推开消防门 · ${Math.round(DORM.hold / need * 100)}%` : `${TOUCH ? '按住「推门」' : '按住 F '}推开消防门 · 会响警报 · 多卖 ${dmPct('fire')}%${sell('fire')}`; }
    }
    else if (n.kind === 'box'){
      const name = o.type === 'sack' ? DM_FUR.sack.name : DM_FUR[o.type].name;
      if (dmLocked(o)){ label = '开锁'; dmPrompt = `${o.lock.name}锁着 · ` + (TOUCH ? '点「开锁」输密码' : '按 F 输密码'); }
      else if (!o.open){ label = '搜'; need = DM_FUR[o.type].t; dmPrompt = `${TOUCH ? '按住「搜」' : '按住 F '}搜${name} · ${Math.round(DORM.hold / need * 100)}%` + (DORM.crouch ? '' : ' · 蹲着翻更小声'); }
      else { label = '拿'; dmPrompt = DORM.lootBox === o ? (TOUCH ? '点下面的东西拿走' : '按 F 拿下一件，或者点下面的东西') : (TOUCH ? '点「拿」' : '按 F ') + `再看看${name}（还有 ${o.items.length} 件）`; }
    }
    if (need){
      if (DORM.holdOn !== o){ DORM.holdOn = o; DORM.hold = 0; }
      if (hold){
        /* rummaging is heard: when you start and every 1.2 s after. Crouched hands are quieter (js/87-heist.js does the same) */
        const was = DORM.hold; DORM.hold += dt;
        if (n.kind === 'box' && (was === 0 || Math.floor(was / 1.2) !== Math.floor(DORM.hold / 1.2))) dmNoise(o.x, o.z, DORM.crouch ? DM_RUMMAGE * .5 : DM_RUMMAGE, DORM.crouch ? '翻东西的声音' : '翻东西的声音太大（蹲着翻小声一半）');
        if (Math.floor(DORM.hold * 6) !== Math.floor((DORM.hold - dt) * 6)){ tone('square', 260 + DORM.hold / need * 240, 260 + DORM.hold / need * 240, .04, .04); spawnPart('dust', o.x + (Math.random() - .5) * .6, (o.h || 1) + .2, o.z + (Math.random() - .5) * .6, .45, {vy:1.4, life:.5, op:.7, color:'#e9dcc3'}); }
        if (DORM.hold >= need){
          DORM.hold = 0;
          if (n.kind === 'exit'){ dmFinish('fire'); return; }
          o.open = true; dmMarks(); if (o.room) o.room.seen = true; run.opened++;
          if (o.items.length){ tone('triangle', 660, 990, .12, .1); dmUiLoot(o); } else { tone('sine', 300, 220, .12, .07); gxCallout('空的', o.type === 'bed' ? '只有灰' : name + '里什么都没有', '#9aa7b1'); }
        }
      } else DORM.hold = Math.max(0, DORM.hold - dt * 2);
    } else { DORM.holdOn = null; DORM.hold = 0; }
  } else { DORM.holdOn = null; DORM.hold = 0; }
  DORM.need = need;
  if (!dmPrompt) dmPrompt = dmSneakPrompt();
  else if (DORM.hid) dmPrompt = (DORM.aunt.knows > 0 ? '她看着你蹲下的 · ' : '躲好了 · ') + dmPrompt;
  /* pushing the fire door: the alarm starts as soon as you lean on it */
  if (n && n.kind === 'exit' && n.o.kind === 'fire' && DORM.hold > .5 && run.alarm <= 0){ run.alarm = 6; dmNoise(n.o.x, n.o.z, 60, '消防门的警报响了'); }
  dmF(label);
  /* the loot list closes when you walk away from the thing */
  const lb = DORM.lootBox; if (lb && Math.hypot(nw.x - lb.x, nw.z - lb.z) > lb.r + .7) dmUiLoot(null);
  dmUiTick(dt);
  /* door plates only near you; the rest would bury a phone screen */
  run.lblT -= dt;
  if (run.lblT <= 0){ run.lblT = .2; for (const l of dmLbls) l.dead = !l.on || Math.hypot(nw.x - l.pos.x, nw.z - l.pos.z) > 13;
    for (const e of L.exits){ const t = e.name + (e.kind === 'fire' ? ' · 会响警报' : dmLocked(e) ? ' · 锁着' : ' · 撤离') + (DM_EXIT_PAY[e.kind] ? ` · 多卖 ${dmPct(e.kind)}%` : ''); if (e.fx.lbl.el.textContent !== t) e.fx.lbl.el.textContent = t; e.fx.lbl.dead = Math.hypot(nw.x - e.x, nw.z - e.z) > 22; } }
  const T = performance.now() / 300; for (const e of dmExitFx) if (e.ring.visible) e.ring.scale.setScalar(1 + Math.sin(T) * .08);
  const m = Math.floor(left / 60), s = Math.floor(left % 60), txt = `门禁 ${m}:${String(s).padStart(2, '0')} · 背包 ${dmBagItems().length}/${DM_SLOTS} · RM ${dmBagValue()}`;
  if (missionEl.textContent !== txt) missionEl.textContent = txt;
  missionEl.classList.toggle('dm-urgent', left < 30);
}

/* ---------- the floor plan replaces the campus minimap while you are inside ---------- */
function dmMini(){
  const L = DORM.L, Sz = mini.width, k = Math.min((Sz - 16) / L.W, (Sz - 16) / L.D), X = x => Sz / 2 + (x - DM_OX) * k, Z = z => Sz / 2 + (z - DM_OZ) * k;
  mg.fillStyle = '#262a31'; mg.fillRect(0, 0, Sz, Sz);
  for (let r = 0; r < 6; r++) for (let c = 0; c < L.cols.length; c++){
    const v = L.cell[r][c], col = L.cols[c], row = L.rows[r];
    mg.fillStyle = v === 'V' ? '#3a3d44' : v === 'C' ? '#d6d0c4' : v.seen ? DM_FLOOR[v.kind] : '#77726a';
    mg.fillRect(X(col.x0), Z(row.z0), col.w * k + .5, row.d * k + .5);
  }
  mg.fillStyle = '#1f2a33'; for (const w of L.walls) mg.fillRect(X(w.x - w.lx / 2) - .5, Z(w.z - w.lz / 2) - .5, Math.max(2, w.lx * k) + 1, Math.max(2, w.lz * k) + 1);
  if (L.slab && !L.slab.open){ mg.fillStyle = '#e5484d'; mg.fillRect(X(L.slab.x - L.slab.lx / 2), Z(L.slab.z) - 2, L.slab.lx * k, 4); }
  const dot = (x, z, col, r, ring) => { mg.fillStyle = col; mg.beginPath(); mg.arc(X(x), Z(z), r, 0, 7); mg.fill(); if (ring){ mg.strokeStyle = ring; mg.lineWidth = 2; mg.stroke(); } };
  for (const b of L.boxes) if ((!b.room || b.room.seen) && (!b.open || b.items.length)) dot(b.x, b.z, dmLocked(b) ? '#e5484d' : b.open ? '#8d959c' : '#e0a400', 2.4);
  for (const c of L.clues) if (!c.read && c.room.seen) dot(c.x, c.z, '#2f8fe0', 3.2);
  for (const w of L.sw) dot(w.x, w.z, DM_SW[w.i][1], 3.4, w.on ? '#ffffff' : '#1f2a33');
  for (const e of L.exits) dot(e.x, e.z, DM_EXIT_COL[e.kind], 7, dmLocked(e) ? '#e5484d' : '#1f2a33');
  const a = DORM.aunt, t = DORM.thief;
  if (a && Math.hypot(a.x - nw.x, a.z - nw.z) < 20) dot(a.x, a.z, '#b0409a', 6, a.state === 'chase' ? '#ff3b30' : '#ffffff');
  if (t && t.on && Math.hypot(t.x - nw.x, t.z - nw.z) < 14) dot(t.x, t.z, '#2b2f3a', 5, '#ff9f43');
  mg.save(); mg.translate(X(nw.x), Z(nw.z)); mg.rotate(-(nw.h + Math.PI));
  mg.fillStyle = '#f2c64a'; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2.5; mg.beginPath(); mg.moveTo(0, -11); mg.lineTo(7.5, 8); mg.lineTo(0, 4); mg.lineTo(-7.5, 8); mg.closePath(); mg.stroke(); mg.fill(); mg.restore();
}
{ const base = drawMini; drawMini = function(cx, cz, yaw){ if (DORM.in && mode === 'naiwa') dmMini(); else base(cx, cz, yaw); }; }

/* ---------- hook into the game loop, the way js/87-classroom.js does ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); dmUpdate(dt, px, pz); },
    busy(){ return base.busy() || DORM.in; },
    extBusy(){ return base.extBusy() || DORM.in; },
    prompt(){ return dmPrompt || base.prompt(); },
    target(){
      if (!DORM.in) return base.target();
      let best = null, bd = 1e9; for (const e of DORM.L.exits){ if (dmLocked(e)) continue; const d = Math.hypot(e.x - nw.x, e.z - nw.z) + (e.kind === 'fire' ? 12 : 0); if (d < bd){ bd = d; best = e; } }
      return {x:best.x, z:best.z, label:best.name + ' · 撤离'};
    },
    mini(dot){ base.mini(dot); if (!DORM.in) for (const d of DM_DOORS) dot(d.x, d.z, '#c9a0ff', 4); },
    onBust(){ if (DORM.in) dmFail('quit', true); base.onBust(); },
    leave(){ if (DORM.in) dmFail('quit', true); for (const d of DM_DOORS){ d.mark.visible = false; d.lbl.dead = true; } dmF(''); if (typeof dmUiHide === 'function') dmUiHide(true); base.leave(); }
  });
}
for (const d of DM_DOORS){ d.mark.visible = false; d.lbl.dead = true; }
dmG.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.material && o.material.blending === THREE.AdditiveBlending) o.renderOrder = 2; });

/* for tests and the console: XDorm.enter(seed) walks in at the nearest LY door */
window.XDorm = {
  get on(){ return DORM.in; }, state:DORM, gen:dmGen,
  enter(seed){ if (mode !== 'naiwa') setMode('naiwa'); if (DORM.in) dmFail('quit', true); const d = DM_DOORS.slice().sort((a, b) => Math.hypot(a.x - nw.x, a.z - nw.z) - Math.hypot(b.x - nw.x, b.z - nw.z))[0]; dmEnter(d, seed); return DORM.L; },
  finish:dmFinish, fail:dmFail
};
