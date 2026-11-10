/* XMUM 校园漫游 · 能进去的教学楼一层（走廊、教室、教师办公室、打印室）和水枪
 *
 * 教学楼：A1 / A2 / A4 / A5 门口各有一个入口，按 F 进去。里面是单独搭在地图外（z = -1600）的一层楼，没有屋顶，
 *   镜头从上往下看，像娃娃屋；挡在镜头和奶娃之间的墙会自动削矮，所以不会被墙挡住。进门在走廊西头，
 *   走廊通教室和打印室，打印室通教师办公室，办公室另有一扇通教室的门（只能从办公室里打开）。
 *   小地图在室内换成这层楼的平面图。墙有碰撞，水柱和视线都穿不过去（lvSolid / lvSee）。
 *   在这层楼里发生的玩法（潜入、保安、老师……）在 js/87-heist.js。
 * 水枪：步行时按 E（手机点「水枪」）。没有自动瞄准：
 *   电脑上鼠标指哪喷哪（点左键也能开火），手机点一下朝面前喷，按住「水枪」拖动可以转方向，松手开火；
 *   地上的蓝线是水柱能到的地方。水柱要飞一会儿才到，打跑动的目标得打提前量。手机上只有偏差在 8° 以内才帮你微调。
 *   淋到巡逻车，车停下来擦玻璃 4 秒。一箱 6 发，自己慢慢回满。
 *   车行里的「水枪工坊」（js/80-gta.js 的 WUPG）：喷嘴加射程，水压加淋湿时间和水柱速度，高压水炮一次喷三股。
 *   别的文件用 wgAddTarget(getter) 注册能被淋的东西：getter 返回 [{x, z, hit(power)}]（可选 r：目标半径）。
 *   wgAddBlock(fn) 注册能挡住水柱的东西：fn(x, z) 返回 true 就是挡住了。
 */
'use strict';
/* ---------- the floor of a teaching building (built once, far outside the campus) ---------- */
const ROOM = {in:false, ox:0, oz:-1600, W:28, D:20, H:4.2, from:null, keep:null, hook:null};
const roomG = new THREE.Group(); roomG.visible = false; scene.add(roomG);
const RX = x => ROOM.ox + x, RZ = z => ROOM.oz + z;
/* rooms in local coordinates: C classroom, H corridor, O teachers' office, P print room */
const LV = {
  rooms:{C:{x0:-14, x1:14, z0:-10, z1:10, name:'教室'}, H:{x0:-14, x1:26, z0:10, z1:16, name:'走廊'}, O:{x0:14, x1:26, z0:-10, z1:2, name:'教师办公室'}, P:{x0:14, x1:26, z0:2, z1:10, name:'打印室'}},
  walls:[], doors:{}, cover:[]
};
const ROOM_DOOR = [RX(-12.3), RZ(13)];                         /* the way out: the west end of the corridor */
const ROOM_SPAWN = [RX(-10.5), RZ(13)];                        /* where you stand after walking in */
const ROOM_PODIUM = [RX(4.5), RZ(-ROOM.D / 2 + 2.6)];
const ROOM_SIDE = [RX(-12.3), RZ(-6)], ROOM_WIN = [RX(-12.3), RZ(0)];   /* the side door by the blackboard · the window that opens */
const ROOM_DESKS = [], ROOM_CABS = {};
let roomBoard = null;
(() => {
  const H = ROOM.H, wallM = M('#efe7d6'), wallLow = M('#b9ae99'), doorM = M('#7a4a2a', {roughness:.6}), green = M('#2f8f5a', {emissive:'#2f8f5a', emissiveIntensity:.6});
  const flat = (w, d, x, z, col, y) => { const m = box(w, .2, d, M(col, {roughness:.85}), RX(x), y || -.08, RZ(z), roomG); m.castShadow = false; return m; };
  flat(84, 70, 6, 3, '#55524d', -.1);                      /* the ground outside the walls */
  flat(28, 20, 0, 0, '#9c7350'); flat(40, 6, 6, 13, '#8f897c'); flat(12, 12, 20, -4, '#5f7268'); flat(12, 8, 20, 6, '#7d8288');   /* classroom, corridor, office, print room */
  /* A wall is a tall part that can be cut away plus a dado that always stays. Things hanging on a wall go into its items. */
  const wall = (x0, z0, x1, z1) => {
    const hx = Math.max(.2, (x1 - x0) / 2), hz = Math.max(.2, (z1 - z0) / 2), cx = RX((x0 + x1) / 2), cz = RZ((z0 + z1) / 2);
    const tall = box(hx * 2, H, hz * 2, wallM, cx, H / 2, cz, roomG); box(hx * 2 + .02, .9, hz * 2 + .02, wallLow, cx, .45, cz, roomG);
    addBox(cx, cz, hx, hz, 0); const w = {x0:cx - hx, x1:cx + hx, z0:cz - hz, z1:cz + hz, items:[tall]}; LV.walls.push(w); return w;
  };
  const on = (w, m) => { w.items.push(m); return m; };
  const wN1 = wall(-14.2, -10, 14.2, -10); wall(14.2, -10, 26.2, -10);                           /* north: blackboard · office */
  const wW1 = wall(-14, -10, -14, 10), wW2 = wall(-14, 10, -14, 16);                              /* west: classroom · corridor end (the way out) */
  wall(-14.2, 10, -1.5, 10); wall(1.5, 10, 18.5, 10); wall(21.5, 10, 26.2, 10);                   /* classroom / corridor, with the two doorways */
  wall(-14.2, 16, 6, 16); wall(6, 16, 26.2, 16);                                                  /* south */
  wall(14, -10, 14, -7.5); wall(14, -4.5, 14, 2); wall(14, 2, 14, 10);                            /* classroom / office + print room */
  wall(26, -10, 26, 2); wall(26, 2, 26, 10); wall(26, 10, 26, 16);                                /* east */
  wall(14.2, 2, 18.5, 2); wall(21.5, 2, 26, 2);                                                   /* office / print room */
  /* doors that can be shut: a leaf in the doorway with its own collider */
  const door = (id, x, z, alongX, a, b) => {
    const m = box(alongX ? 3 : .16, 3, alongX ? .16 : 3, doorM, RX(x), 1.5, RZ(z), roomG), col = addBox(RX(x), RZ(z), alongX ? 1.5 : .2, alongX ? .2 : 1.5, 0);
    LV.doors[id] = {x:RX(x), z:RZ(z), m, col, open:false, hx:alongX ? 1.5 : .2, hz:alongX ? .2 : 1.5, a:[RX(a[0]), RZ(a[1])], b:[RX(b[0]), RZ(b[1])]};
  };
  door('PO', 20, 2, true, [20, 3.6], [20, .4]);        /* print room -> office */
  door('CO', 14, -6, false, [12.4, -6], [15.6, -6]);   /* classroom -> office: opens from the office side only */
  /* classroom: windows on the west wall, the side door, the window that opens */
  const glass = M('#a9d4ee', {roughness:.15, metalness:.1});
  for (const z of [0, 6]) on(wW1, box(.06, 1.6, 3.2, glass, RX(-13.77), 2.4, RZ(z), roomG));
  on(wW1, box(.1, 3, 2.2, doorM, RX(-13.75), 1.5, RZ(-6), roomG)); on(wW1, box(.06, .5, 1.3, green, RX(-13.7), 3.35, RZ(-6), roomG));
  box(.14, .12, 3.5, M('#e3b95a', {emissive:'#e3b95a', emissiveIntensity:.35}), RX(-13.72), 1.55, RZ(0), roomG);
  on(wW2, box(.1, 3, 2.4, doorM, RX(-13.75), 1.5, RZ(13), roomG)); on(wW2, box(.06, .5, 1.4, green, RX(-13.7), 3.35, RZ(13), roomG));       /* the way out */
  /* blackboard with chalk, redrawn with the room name on entry */
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv);
  roomBoard = name => {
    const g = cv.getContext('2d');
    g.fillStyle = '#1f4436'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 64px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center';
    g.fillText(name + ' · 期末考试', 512, 112);
    g.font = '40px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('考场纪律：禁止喧哗 · 禁止作弊 · 奶娃除外', 512, 190);
    tex.needsUpdate = true;
  };
  roomBoard('教室');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({map:tex, roughness:.9})); board.position.set(RX(0), 2.5, RZ(-9.77)); roomG.add(board); on(wN1, board);
  on(wN1, box(12.4, .14, .3, M('#8a6a45'), RX(0), .95, RZ(-9.7), roomG));
  /* podium with the drawer */
  box(2.6, 1.15, 1.1, M('#8a5a36', {roughness:.6}), ROOM_PODIUM[0], .575, ROOM_PODIUM[1], roomG);
  box(.9, .3, .05, M('#c9a24a', {metalness:.4, roughness:.4}), ROOM_PODIUM[0], .75, ROOM_PODIUM[1] + .56, roomG);
  addBox(ROOM_PODIUM[0], ROOM_PODIUM[1], 1.3, .55, 0);
  /* cabinets flat against the walls (too shallow to need a collider) */
  const cab = (id, x, z, w, d, col, h) => {
    box(w, h || 2.1, d, M(col, {roughness:.55, metalness:.2}), RX(x), (h || 2.1) / 2, RZ(z), roomG);
    box(w > d ? .05 : d + .03, (h || 2.1) - .2, w > d ? d + .03 : .05, M('#20242b'), RX(x), (h || 2.1) / 2, RZ(z), roomG);      /* the gap between its two doors */
    ROOM_CABS[id] = [RX(x), RZ(z)];
  };
  cab('c1', -13.6, 3.2, .4, 2.2, '#6f8296'); cab('c2', 13.6, 3, .4, 2.4, '#6f8296'); cab('c3', 11.3, -9.55, 2.4, .5, '#8a6a45'); cab('hw', -9.5, -9.55, 2.4, .5, '#3e7a5a');
  /* desks and chairs: 5 columns x 4 rows, aisles between columns */
  const deskTop = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, .08, .8), M('#d8b98a', {roughness:.7}), 20);
  const deskLeg = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, .7, .06), M('#6c757d', {roughness:.6}), 20);
  const chair = new THREE.InstancedMesh(new THREE.BoxGeometry(.8, .5, .7), M('#3e6fa3', {roughness:.7}), 20);
  const mtx = new THREE.Matrix4(); let k = 0;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 4; r++, k++){
    const x = RX(-10 + c * 5), z = RZ(-3.5 + r * 3.4);
    mtx.makeTranslation(x, .76, z); deskTop.setMatrixAt(k, mtx);
    mtx.makeTranslation(x, .38, z - .2); deskLeg.setMatrixAt(k, mtx);
    mtx.makeTranslation(x, .25, z + .75); chair.setMatrixAt(k, mtx);
    addBox(x, z + .25, .95, .75, 0); const d = {x, z:z + .25, tz:z}; ROOM_DESKS.push(d); LV.cover.push(d);
  }
  for (const im of [deskTop, deskLeg, chair]){ im.castShadow = im.receiveShadow = true; roomG.add(im); }
  /* solid furniture in the other rooms: you can crouch beside any of it */
  const solid = (w, h, d, x, z, col, cover) => { const m = box(w, h, d, M(col, {roughness:.7}), RX(x), h / 2, RZ(z), roomG); addBox(RX(x), RZ(z), w / 2, d / 2, 0); if (cover) LV.cover.push({x:RX(x), z:RZ(z)}); return m; };
  /* office: the teacher's desk facing the print-room door, a sofa and a stack of boxes to hide behind, cabinets on the walls */
  solid(3.2, .8, 1.4, 20, -5, '#6b4a34'); box(1.2, .06, .9, M('#f4f1e8'), RX(20.4), .84, RZ(-5), roomG); box(.7, .5, .7, M('#3b3f48'), RX(20), .25, RZ(-6.5), roomG);
  solid(3, .9, 1.2, 16.6, -.9, '#7a5a8a', true); solid(1.7, 1.5, 1.5, 24.6, .6, '#b58a55', true);      /* placed so that 奶娃 (who is wide) can still get round the desk on either side */
  cab('file', 25.6, -6.5, .4, 3, '#7c8794'); cab('book', 17, -9.55, 3, .5, '#8a6a45'); cab('box', 24.6, -9.5, 1.6, .6, '#a23b3b', 1.1); cab('tray', 20, -4.1, .9, .4, '#3e7a5a', .98);
  /* print room: the printer, a paper shelf, a store cupboard */
  solid(1.8, 1.3, 1.3, 24.4, 8.4, '#d9dde2', true); box(1.2, .1, .5, M('#2b2f36'), RX(24.4), 1.36, RZ(8.2), roomG);
  cab('shelf', 25.6, 4.8, .4, 2.6, '#9a8f7a'); cab('store', 14.4, 6, .4, 2.4, '#6f8296');
  /* corridor: a notice board and a bench */
  box(4, 1.4, .08, M('#3e6f55'), RX(8), 2.2, RZ(15.75), roomG); solid(2.6, .5, .7, 14, 15.3, '#8a6a45');
})();
function lvDoor(id, open){ const d = LV.doors[id]; d.open = open; d.m.visible = !open; d.col.dead = open; }
/* which room a point is in ('' = inside a wall, in a doorway or outside) */
function lvRoom(x, z){ const lx = x - ROOM.ox, lz = z - ROOM.oz; for (const k in LV.rooms){ const r = LV.rooms[k]; if (lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1) return k; } return ''; }
/* walls and shut doors: nothing sees or squirts through them */
function lvSolid(x, z){
  for (const w of LV.walls) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) return true;
  for (const k in LV.doors){ const d = LV.doors[k]; if (!d.open && Math.abs(x - d.x) < d.hx && Math.abs(z - d.z) < d.hz) return true; }
  return false;
}
function lvSee(ax, az, bx, bz){ const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / .45); for (let i = 1; i < n; i++){ const k = i / n; if (lvSolid(ax + (bx - ax) * k, az + (bz - az) * k)) return false; } return true; }
/* a wall that stands between the camera and 奶娃 (or right next to that line) is cut down to its dado, like a doll's house */
function roomCutaway(){
  const cx = camera.position.x, cz = camera.position.z;
  for (const w of LV.walls){
    let cut = false;
    for (let i = 0; i <= 5 && !cut; i++){ const k = i / 5 * 1.15, x = cx + (nw.x - cx) * k, z = cz + (nw.z - cz) * k, dx = Math.max(w.x0 - x, 0, x - w.x1), dz = Math.max(w.z0 - z, 0, z - w.z1); cut = dx * dx + dz * dz < 6.5; }
    if (w.cut !== cut){ w.cut = cut; for (const m of w.items) m.visible = !cut; }
  }
}
/* indoor markers are flat glowing circles on the floor: the outdoor light beams would poke out of the roofless building */
function floorMark(color, r){
  const m = new THREE.Mesh(new THREE.RingGeometry(r * .62, r, 40).rotateX(-Math.PI / 2), gxGlow(color, .75));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * .62, 40).rotateX(-Math.PI / 2), gxGlow(color, .18)); m.add(fill);
  m.userData.ring = m; m.userData.fill = fill; roomG.add(m); return m;
}
const markColor = (m, c) => { m.material.color.set(c); m.userData.fill.material.color.set(c); };
const roomExitMark = floorMark('#4fd18b', 1.3);
roomExitMark.position.set(ROOM_DOOR[0], .04, ROOM_DOOR[1]);
/* the floor plan on the minimap while indoors; gx.mini() adds whatever is going on (js/87-heist.js) */
function lvMini(){
  const Sz = mini.width, k = Sz / 46, X = x => Sz / 2 + (x - ROOM.ox - 6) * k, Z = z => Sz / 2 + (z - ROOM.oz - 3) * k;
  mg.fillStyle = '#2a2f36'; mg.fillRect(0, 0, Sz, Sz);
  const col = {C:'#b98d62', H:'#d8d2c2', O:'#8fa39a', P:'#c3c7cc'};
  for (const id in LV.rooms){ const r = LV.rooms[id]; mg.fillStyle = col[id]; mg.fillRect(X(RX(r.x0)), Z(RZ(r.z0)), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); }
  mg.fillStyle = '#f4efe2'; for (const w of LV.walls) mg.fillRect(X(w.x0) - 1, Z(w.z0) - 1, (w.x1 - w.x0) * k + 2, (w.z1 - w.z0) * k + 2);
  for (const id in LV.doors){ const d = LV.doors[id]; mg.fillStyle = d.open ? '#4fd18b' : '#c0392b'; mg.fillRect(X(d.x - d.hx) - 1, Z(d.z - d.hz) - 1, d.hx * 2 * k + 2, d.hz * 2 * k + 2); }
  mg.fillStyle = 'rgba(31,42,51,.8)'; mg.font = '700 15px "Noto Sans SC","Microsoft YaHei",sans-serif'; mg.textAlign = 'center';
  for (const id in LV.rooms){ const r = LV.rooms[id]; mg.fillText(r.name, X(RX((r.x0 + r.x1) / 2)), Z(RZ((r.z0 + r.z1) / 2)) + 5); }
  mg.textAlign = 'start';
  const dot = (x, z, c, r) => { mg.fillStyle = c; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2; mg.beginPath(); mg.arc(X(x), Z(z), r, 0, 7); mg.fill(); mg.stroke(); };
  dot(ROOM_DOOR[0], ROOM_DOOR[1], '#4fd18b', 6); gx.mini(dot);
  mg.save(); mg.translate(X(nw.x), Z(nw.z)); mg.rotate(-(nw.h + Math.PI)); mg.fillStyle = '#ffd24a'; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2;
  mg.beginPath(); mg.moveTo(0, -10); mg.lineTo(7, 8); mg.lineTo(0, 4); mg.lineTo(-7, 8); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
}
{ const base = drawMini; drawMini = function(cx, cz, yaw){ if (ROOM.in && mode === 'naiwa') lvMini(); else base(cx, cz, yaw); }; }

/* ---------- doors outside the teaching buildings ---------- */
const ROOM_DOORS = ['A1', 'A2', 'A4', 'A5'].map(n => {
  const info = infos.find(i => i.name === n); const p = info && frontPoint(info); if (!p) return null;
  const mark = gxMarker('#ffd27a', .45); mark.position.set(p[0], .1, p[1]);
  const lbl = addLabel(n + ' 教室', p[0], 4.2, p[1], true); lbl.dead = true;
  return {name:n, x:p[0], z:p[1], h:Math.atan2(p[0] - info.wx, p[1] - info.wz), mark, lbl};
}).filter(Boolean);

/* ---------- entering / leaving ---------- */
function roomEnter(door){
  ROOM.in = true; ROOM.from = door; ROOM.keep = {dist:camDist, pitch:camPitch};
  roomBoard(door.name + ' 教室'); lvDoor('PO', true); lvDoor('CO', true);
  nw.x = ROOM_SPAWN[0]; nw.z = ROOM_SPAWN[1]; nw.y = 0; nw.h = Math.PI / 2; nw.air = false; camYaw = 0;
  camDist = innerHeight > innerWidth ? 22 : 13; camPitch = 1.1;      /* a phone held upright sees a narrow strip: pull the camera back */   /* look down over the 4.2 m walls; js/90-main.js skips wall collision indoors */ roomG.visible = true;
  sfx.ding(); toast(`进了 ${door.name} 教学楼`, '走廊通教室和打印室，打印室里面是教师办公室。回到走廊西头的绿圈按 F 出去');
}
function roomLeave(quiet){
  if (!ROOM.in) return;
  const d = ROOM.from; ROOM.in = false; roomG.visible = false;
  if (ROOM.keep){ camDist = ROOM.keep.dist; camPitch = ROOM.keep.pitch; }
  if (d){ nw.x = d.x + Math.sin(d.h) * 2; nw.z = d.z + Math.cos(d.h) * 2; nw.h = d.h; camYaw = d.h + Math.PI; }
  nw.y = 0;
  if (!quiet) sfx.ding();
}
const nearDoor = () => !driving && !ROOM.in && ROOM_DOORS.find(d => Math.hypot(nw.x - d.x, nw.z - d.z) < 3.2);
const nearExit = () => ROOM.in && Math.hypot(nw.x - ROOM_DOOR[0], nw.z - ROOM_DOOR[1]) < 2.6;
/* called first by doF() in js/90-main.js; true means F was used here */
function roomTryF(){
  if (mode !== 'naiwa' || driving) return false;
  const d = nearDoor(); if (d){ roomEnter(d); return true; }
  if (nearExit()){ roomLeave(); return true; }
  return false;
}

/* ---------- water gun ---------- */
const WG = {ammo:6, max:6, regen:0, cd:0, el:$('#water'), jets:[], shots:0, mouse:false, mx:0, my:0, drag:null, click:null, aim:0, show:0, scanT:0, near:false, shotT:9, told:false};
const WG_FAN = .17;      /* 高压水炮: the two extra jets leave this far (radians) either side */
achAdd([['wg1', '水枪改装', '在水枪工坊升级一次', 20], ['wgmax', '水枪大师', '水枪工坊全部升到满级', 150]]);
/* what the workshop upgrades (WUPG in js/80-gta.js) add up to */
function wgStat(){
  const u = prog.up;
  return {range:16 + 3.5 * (u.wr || 0), power:(1 + .3 * (u.wp || 0)) * (u.wx >= 2 ? 1.4 : 1), max:6 + 2 * (u.wt || 0), regen:1.6 * Math.pow(.75, u.wg || 0),
    multi:u.wx >= 1 ? 3 : 1, push:u.wx >= 2, speed:32 * (1 + .14 * (u.wp || 0)), w:u.wx >= 2 ? .65 : .5};
}
function wgRefresh(fill){ WG.max = wgStat().max; WG.ammo = fill ? WG.max : Math.min(WG.ammo, WG.max); wgShow(); }
function wgShow(){
  if (!WG.el) return;
  const t = WG.max <= 8 ? '●'.repeat(WG.ammo) + '○'.repeat(WG.max - WG.ammo) : `● ${WG.ammo} / ${WG.max}`;
  if (WG.el.textContent !== t) WG.el.textContent = t;
}
/* Anything that can be soaked registers a getter here. The getter is asked while a jet is in the air and returns the targets that
   exist right now: [{x, z, hit(power)}], with an optional r (how wide the target is, default .7 m). power is 1 for the stock gun and
   grows with the 水压 / 高压水炮 upgrades (a second argument {push, fx, fz} tells the target whether the jet should also shove it, and which way). */
const WG_TARGETS = [], WG_BLOCKS = [];
function wgAddTarget(getter){ if (typeof getter === 'function') WG_TARGETS.push(getter); }
function wgAddBlock(fn){ if (typeof fn === 'function') WG_BLOCKS.push(fn); }
function wgTargets(){
  const out = [];
  for (const get of WG_TARGETS){ let list = null; try { list = get(); } catch (e){ list = null; } if (list) for (const t of list) if (t && typeof t.hit === 'function') out.push(t); }
  return out;
}
/* solid things stop the jet: buildings outdoors, walls and shut doors in the teaching building (desks are low, the water goes over them) */
function wgBlocked(x, z){
  for (const f of WG_BLOCKS) if (f(x, z)) return true;
  if (ROOM.in){ const lx = x - ROOM.ox, lz = z - ROOM.oz; return lvSolid(x, z) || lx < -14 || lx > 26 || lz < -10 || lz > 16; }
  if (indoorNow()) return false;
  return hitsBuilding(x, z, .05);
}
const wgAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/* where the mouse points on the ground, as a direction from 奶娃 (null on a touch screen or before the mouse has moved) */
function wgMouseAngle(){
  if (!WG.mouse) return null;
  const r = canvas.getBoundingClientRect(); ndc.set((WG.mx - r.left) / r.width * 2 - 1, -((WG.my - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction; let t = 140;
  if (indoorNow()){ if (d.y < -.02) t = Math.min(140, (nw.y + .6 - o.y) / d.y); }
  else {
    const under = s => o.y + d.y * s <= groundAt(o.x + d.x * s, o.z + d.z * s) + .6;
    for (let s = 2; s < 140; s += 2) if (under(s)){ let a = s - 2, b = s; for (let k = 0; k < 5; k++){ const m = (a + b) / 2; if (under(m)) b = m; else a = m; } t = b; break; }
  }
  const dx = o.x + d.x * t - nw.x, dz = o.z + d.z * t - nw.z; if (dx * dx + dz * dz < .4) return null;
  return Math.atan2(dx, dz);
}
function wgAimNow(){
  if (WG.drag) return WG.drag.a != null ? WG.drag.a : nw.h;
  const m = wgMouseAngle(); return m != null ? m : nw.h;
}
/* phones only: a nudge of at most 8 degrees onto a target that is already almost on the line. Never a turn toward the nearest one. */
function wgSnap(a, st){
  let best = a, bd = .14;
  for (const t of wgTargets()){ const dx = t.x - nw.x, dz = t.z - nw.z, d = Math.hypot(dx, dz); if (d > st.range || d < .5) continue; const da = Math.abs(wgAng(Math.atan2(dx, dz), a)); if (da < bd){ bd = da; best = Math.atan2(dx, dz); } }
  return best;
}
function wgReach(a, R){ const sx = Math.sin(a), cz = Math.cos(a); for (let s = 1.2; s < R; s += .8) if (wgBlocked(nw.x + sx * s, nw.z + cz * s)) return s; return R; }
/* the preview on the ground: one strip per jet, from the muzzle to where the water gives out or hits a wall */
const WG_SEG = 14;
const wgLine = (() => {
  const pos = new Float32Array(3 * (WG_SEG + 1) * 2 * 3), idx = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < WG_SEG; i++){ const a = (j * (WG_SEG + 1) + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:'#8fd2ff', transparent:true, opacity:.4, depthWrite:false, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-24}));
  m.frustumCulled = false; m.visible = false; m.renderOrder = 3; scene.add(m);
  const tip = new THREE.Mesh(new THREE.RingGeometry(.45, .7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#dff3ff', transparent:true, opacity:.8, depthWrite:false, side:THREE.DoubleSide}));
  tip.visible = false; tip.renderOrder = 3; scene.add(tip);
  return {m, pos, tip};
})();
function wgPreview(dt){
  const can = mode === 'naiwa' && !driving && !gx.paused && nw.state !== 'fly' && nw.state !== 'flop' && nw.state !== 'swing';
  const on = can && (WG.drag || WG.near || WG.shotT < 2.5);
  WG.show += ((on ? 1 : 0) - WG.show) * Math.min(1, dt * 10);
  if (WG.show < .03){ wgLine.m.visible = wgLine.tip.visible = false; return; }
  const st = wgStat(), indoor = indoorNow(), fan = st.multi > 1 ? [0, -WG_FAN, WG_FAN] : [0], p = wgLine.pos;
  let a0 = wgAimNow(); if (WG.drag && WG.drag.touch || (TOUCH && !WG.mouse)) a0 = wgSnap(a0, st);
  WG.aim = a0;
  for (let j = 0; j < 3; j++){
    const a = a0 + (fan[j] || 0), L = j < fan.length ? wgReach(a, st.range) : 0, sx = Math.sin(a), cz = Math.cos(a);
    for (let i = 0; i <= WG_SEG; i++){
      const s = L ? 1 + (L - 1) * i / WG_SEG : 0, x = nw.x + sx * s, z = nw.z + cz * s, w = L ? (j ? .12 : .2) * (1 - .6 * i / WG_SEG) : 0, y = indoor ? nw.y + .07 : groundAt(x, z) + .16, k = (j * (WG_SEG + 1) + i) * 6;
      p[k] = x + cz * w; p[k + 1] = y; p[k + 2] = z - sx * w; p[k + 3] = x - cz * w; p[k + 4] = y; p[k + 5] = z + sx * w;
    }
    if (!j){ const x = nw.x + sx * L, z = nw.z + cz * L; wgLine.tip.position.set(x, (indoor ? nw.y + .08 : groundAt(x, z) + .18), z); }
  }
  wgLine.m.geometry.attributes.position.needsUpdate = true;
  wgLine.m.visible = wgLine.tip.visible = true; wgLine.m.material.opacity = (WG.ammo > 0 ? .42 : .15) * WG.show; wgLine.tip.material.opacity = (WG.ammo > 0 ? .8 : .25) * WG.show;
}
/* a small floating 「差一点」 where a jet just missed */
TEX.wgMiss = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = '900 38px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('差一点', 64, 66); return new THREE.CanvasTexture(c); })();
/* fire along `angle` (default: where the mouse points, or straight ahead). The jet is a real thing that flies: it hits what it meets. */
function fireWater(angle, snap){
  if (mode !== 'naiwa' || gx.paused || driving || nw.state === 'fly' || nw.state === 'flop') return;
  if (WG.cd > 0) return;
  if (WG.ammo < 1){ tone('square', 220, 160, .08, .05); toast('水枪没水了', '等几秒会自己回满', 1200); return; }
  const st = wgStat(); let a = angle != null ? angle : wgAimNow(); if (snap) a = wgSnap(a, st);
  WG.ammo--; WG.cd = .35; WG.regen = 0; WG.shotT = 0; WG.shots++; wgShow();
  nw.h = a;
  const shot = {pts:[], live:0, near:null};
  for (const o of st.multi > 1 ? [0, -WG_FAN, WG_FAN] : [0]){
    const dx = Math.sin(a + o), dz = Math.cos(a + o);
    WG.jets.push({x:nw.x + dx * .9, z:nw.z + dz * .9, dx, dz, s:.9, R:st.range, v:st.speed, power:st.power, push:st.push, w:st.w, shot, y0:nw.y}); shot.live++;
  }
  const fx = Math.sin(a), fz = Math.cos(a);
  for (let i = 0; i < 5; i++) spawnPart('dust', nw.x + fx * 1.1, nw.y + 1.4, nw.z + fz * 1.1, (.35 + rnd() * .25) * (st.push ? 1.5 : 1),
    {vx:fx * (8 + rnd() * 6) + (rnd() - .5) * 3, vy:1 + rnd() * 2, vz:fz * (8 + rnd() * 6) + (rnd() - .5) * 3, g:10, life:.35, op:.9, grow:.6, color:st.push ? '#b9e4ff' : '#7cc7ff'});
  noise(.22, st.push ? .24 : .16, st.push ? 1800 : 3200, 'highpass'); if (st.push) tone('sine', 150, 60, .2, .18);
  camShake = Math.max(camShake, .05 + .06 * (st.power - 1) + (st.push ? .2 : 0));      /* recoil: a stronger gun kicks harder */
}
function wgJets(dt){
  if (!WG.jets.length) return;
  const ts = wgTargets(), indoor = indoorNow();
  for (let i = WG.jets.length - 1; i >= 0; i--){
    const j = WG.jets[i], sh = j.shot; let left = j.v * dt, end = 0;
    while (left > 0 && !end){
      const d = Math.min(.6, left); left -= d; j.x += j.dx * d; j.z += j.dz * d; j.s += d;
      if (j.s >= j.R) end = 1; else if (wgBlocked(j.x, j.z)) end = 2;
      else for (const t of ts){
        const dx = t.x - j.x, dz = t.z - j.z, rr = (t.r || .7) + j.w, dd = dx * dx + dz * dz;
        if (dd > (rr + 1.4) * (rr + 1.4) || sh.pts.some(q => Math.hypot(q[0] - t.x, q[1] - t.z) < .8)) continue;      /* one shot soaks a target once */
        if (dd < rr * rr){ sh.pts.push([t.x, t.z]); try { t.hit(j.power, {push:j.push, fx:j.dx, fz:j.dz}); } catch (e){ console.warn(e); } end = 3; break; }
        sh.near = [t.x, t.z];
      }
    }
    const gy = indoor ? j.y0 : groundAt(j.x, j.z), k = j.s / j.R, y = gy + 1.3 - k * k * .95;
    for (let n = sh.live > 1 ? 1 : 2; n > 0; n--) spawnPart('dust', j.x - j.dx * rnd() * j.v * dt, y + (rnd() - .5) * .2, j.z - j.dz * rnd() * j.v * dt, (.4 + rnd() * .2) * (j.push ? 1.4 : 1) * (1 + .2 * (j.power - 1)),
      {vx:j.dx * 3, vy:.4, vz:j.dz * 3, g:6, life:.3, op:.95, grow:.7, color:j.push ? '#b9e4ff' : '#7cc7ff'});
    if (!end) continue;
    if (end < 3) for (let n = 0; n < 4; n++) spawnPart('dust', j.x, gy + (end === 2 ? 1 : .3), j.z, .4, {vx:(rnd() - .5) * 4, vy:1.5 + rnd() * 2, vz:(rnd() - .5) * 4, g:10, life:.5, op:.85, color:'#9fd8ff'});
    WG.jets.splice(i, 1); sh.live--;
    if (!sh.live && !sh.pts.length && sh.near){ spawnPart('wgMiss', sh.near[0], (indoor ? j.y0 : groundAt(sh.near[0], sh.near[1])) + 2.4, sh.near[1], 2.4, {vy:1.4, life:.8, op:1, color:'#dff3ff'}); tone('sine', 520, 380, .1, .04); }
  }
}
function splashAt(x, y, z){ for (let i = 0; i < 10; i++) spawnPart('dust', x + (rnd() - .5) * 1.5, y + rnd(), z + (rnd() - .5) * 1.5, .5, {vx:(rnd() - .5) * 5, vy:2 + rnd() * 3, vz:(rnd() - .5) * 5, g:10, life:.7, op:.9, color:'#9fd8ff'}); }
const wgSecs = t => String(Math.round(t * 10) / 10);
const PVE_SOAK = [1, .85, .7, .6];   /* how long a soaking lasts at each opponent level */
let soakedTold = false;
function soakCar(c, power, info){
  if (!c.active) return;
  const t = 4 * (power || 1) * PVE_SOAK[pveLevel()];
  c.soakT = t; c.vx *= .3; c.vz *= .3; splashAt(c.x, 1.5, c.z); sfx.splash(); unlock('soak');
  if (info && info.push){ c.vx += info.fx * 9; c.vz += info.fz * 9; }
  if (!soakedTold){ soakedTold = true; toast('保安被淋了一身', '车停下来擦玻璃，趁现在跑！', 2000); } else gx.callout('淋湿了', `保安停车 ${wgSecs(t)} 秒`, '#4aa3ff');
}
/* soaked cars are skipped, so the jet goes on to one that is still coming */
wgAddTarget(() => ROOM.in ? null : patrols.filter(c => c.active && c !== driving && !(c.soakT > 0)).map(c => ({x:c.x, z:c.z, r:1.7, hit:(p, i) => soakCar(c, p, i)})));
/* --- input: E or a left click fires where the mouse points; on a phone a tap fires ahead, holding the button and dragging aims --- */
window.addEventListener('keydown', e => {
  if (e.code !== 'KeyE' || e.repeat || mode !== 'naiwa' || e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
  ac(); fireWater();
});
window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse'){ WG.mouse = true; WG.mx = e.clientX; WG.my = e.clientY; } });
canvas.addEventListener('pointerdown', e => { WG.click = e.pointerType === 'mouse' && e.button === 0 ? {x:e.clientX, y:e.clientY, t:performance.now()} : null; });
canvas.addEventListener('pointerup', e => {
  const c = WG.click; WG.click = null;
  if (!c || mode !== 'naiwa' || Math.hypot(e.clientX - c.x, e.clientY - c.y) > 6 || performance.now() - c.t > 350) return;      /* a drag turns the camera; only a clean click fires */
  if (nw.state === 'swing') return;
  WG.mouse = true; WG.mx = e.clientX; WG.my = e.clientY; ac(); fireWater();
});
{ const b = $('#act-w'); if (b){
    b.style.touchAction = 'none';
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); ac(); if (b.disabled || WG.drag) return;
      try { b.setPointerCapture(e.pointerId); } catch (err){}
      b.classList.add('on'); WG.drag = {id:e.pointerId, x:e.clientX, y:e.clientY, a:null, touch:e.pointerType !== 'mouse'};
    });
    b.addEventListener('pointermove', e => {
      const d = WG.drag; if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) < 14){ d.a = null; return; }
      const s = Math.sin(camYaw), c = Math.cos(camYaw); d.a = Math.atan2(s * dy + c * dx, c * dy - s * dx);      /* the same screen-to-world turn as the joystick */
    });
    const end = fire => e => {
      const d = WG.drag; if (!d || e.pointerId !== d.id) return;
      WG.drag = null; b.classList.remove('on'); if (fire) fireWater(d.a != null ? d.a : nw.h, d.touch);
    };
    b.addEventListener('pointerup', end(true)); b.addEventListener('pointercancel', end(false));
  } }

/* ---------- per-frame ---------- */
let roomPrompt = '', fLabel = '';
function setFLabel(t){
  if (t === fLabel) return; fLabel = t;
  if (t) actF.querySelector('b').textContent = t; else updateActs();
}
function roomUpdate(dt, px, pz){
  roomPrompt = '';
  WG.cd -= dt; WG.shotT += dt;
  if (WG.ammo < WG.max){ WG.regen += dt; if (WG.regen > wgStat().regen){ WG.regen = 0; WG.ammo++; } }
  wgShow(); wgJets(dt);
  /* the aim line shows up when something that can be soaked is around */
  WG.scanT -= dt;
  if (WG.scanT <= 0){
    WG.scanT = .25; const R = wgStat().range * 1.6 + 6; WG.near = !driving && wgTargets().some(t => Math.hypot(t.x - nw.x, t.z - nw.z) < R);
    if (WG.near && !WG.told && !ROOM.in){ WG.told = true; toast('水枪要自己瞄', TOUCH ? '点「水枪」朝面前喷；按住它拖动可以转方向，松手开火。蓝线是水柱能到的地方' : '鼠标指哪喷哪，按 E 或点左键开火。蓝线是水柱能到的地方，跑动的目标要打提前量', 4200); }
  }
  wgPreview(dt);
  for (const c of patrols) if (c.soakT > 0 && c.active && rnd() < dt * 6) spawnPart('dust', c.x + (rnd() - .5) * 2, 1.6, c.z + (rnd() - .5) * 2, .4, {vy:-1, life:.6, op:.8, color:'#9fd8ff'});
  /* doors outside */
  for (const d of ROOM_DOORS){
    d.mark.visible = !ROOM.in; d.lbl.dead = ROOM.in || Math.hypot(px - d.x, pz - d.z) > 140;
    d.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 300) * .15;
  }
  const nd = nearDoor();
  if (nd) roomPrompt = (TOUCH ? '点「进门」' : '按 F ') + `进 ${nd.name} 教学楼`;
  let fl = nd ? '进门' : '';
  if (ROOM.in){
    roomCutaway();
    roomExitMark.scale.setScalar(1 + Math.sin(performance.now() / 300) * .08);
    if (nearExit()){ roomPrompt = (TOUCH ? '点「出门」' : '按 F ') + '出门'; fl = '出门'; }
    if (ROOM.hook) fl = ROOM.hook(dt, fl);      /* whatever is going on inside (js/87-heist.js) takes over the prompt and the F button */
  }
  setFLabel(fl);
}

/* ---------- hook into the game loop (js/80-gta.js and js/85-activities.js) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); roomUpdate(dt, px, pz); },
    prompt(){ return roomPrompt || base.prompt(); },
    target(){ return base.target() || (ROOM.in ? {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'出门'} : null); },
    mini(dot){ base.mini(dot); if (!ROOM.in) for (const d of ROOM_DOORS) dot(d.x, d.z, '#ffd27a', 4); },
    onBust(){ roomLeave(true); base.onBust(); },
    leave(){ roomLeave(true); for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; } setFLabel(''); WG.jets.length = 0; WG.drag = null; wgLine.m.visible = wgLine.tip.visible = false; base.leave(); }
  });
}
for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; }
wgRefresh(true);
