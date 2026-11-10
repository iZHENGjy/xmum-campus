/* XMUM 校园漫游 · 能进去的教室、「抢救期末卷」和「替同学交作业」、水枪
 *
 * 教室：A1 / A2 / A4 / A5 门口各有一个入口，按 F 进去。教室是一间单独搭在地图外（z = -1600）
 *   的屋子，没有屋顶，镜头从上往下看，像娃娃屋；进门时把奶娃传送进去，出门再传送回那栋楼门口。
 * 抢救期末卷（A3 门口的红圈）：一次小小的潜入。
 *   1. 找：卷子藏在讲台抽屉、四个柜子、三张课桌抽屉里的某一处，走过去按住 F 翻。有一处藏着纸条，告诉你卷子在哪一类地方。
 *   2. 躲：保安沿过道巡逻，地上的黄色扇形是他的视野，在里面待久了他就追过来。跑步、翻东西、水枪都有声音，会把他引过来。
 *      按 Q（手机点「蹲下」）蹲着走没有声音；蹲在课桌边不动就是躲进课桌下，他走到跟前才看得见。
 *   3. 逃：拿到卷子全楼警报，增援从正门进来。三个出口：正门最近但门外有巡逻车（三星）；黑板旁的侧门要先拉开门闩（两星）；
 *      窗户要先撬开，跳下去摔一跤，但没人知道你从哪走的（一星）。门闩和窗户可以在拿卷子之前先弄开。
 *   4. 送回 A3。按剩余时间给金银铜牌；全程没被发现有奖金；连着成功有连胜加成，失败清零。
 *      被抓住：请出教室、扣 10 秒；手里有卷子就被收回去锁进讲台，要重新撬。
 * 替同学交作业（A3 门口的蓝圈）：反过来，把作业悄悄塞进黑板左边的作业柜。两个保安同时巡逻，带着作业被抓住就算失败。
 * 水枪：步行时按 E（手机点「水枪」）。没有自动瞄准：
 *   电脑上鼠标指哪喷哪（点左键也能开火），手机点一下朝面前喷，按住「水枪」拖动可以转方向，松手开火；
 *   地上的蓝线是水柱能到的地方。水柱要飞一会儿才到，打跑动的目标得打提前量。手机上只有偏差在 8° 以内才帮你微调。
 *   淋到巡逻车，车停下来擦玻璃 4 秒；淋到教室保安，他擦脸 3.5 秒。一箱 6 发，自己慢慢回满。
 *   车行里的「水枪工坊」（js/80-gta.js 的 WUPG）：喷嘴加射程，水压加淋湿时间和水柱速度，高压水炮一次喷三股。
 *   别的文件用 wgAddTarget(getter) 注册能被淋的东西：getter 返回 [{x, z, hit(power)}]（可选 r：目标半径）。
 *   wgAddBlock(fn) 注册能挡住水柱的东西：fn(x, z) 返回 true 就是挡住了。
 * 对手强度（pveLevel，0–3）：保安看得更远、跑得更快、擦脸更快，被淋了会喊同伴。
 */
'use strict';
/* ---------- the classroom (built once, far outside the campus) ---------- */
const ROOM = {in:false, ox:0, oz:-1600, W:28, D:20, H:4.2, from:null, keep:null};
const roomG = new THREE.Group(); roomG.visible = false; scene.add(roomG);
const RX = x => ROOM.ox + x, RZ = z => ROOM.oz + z;
const ROOM_DOOR = [RX(0), RZ(ROOM.D / 2 - 1.6)];              /* the exit spot just inside the door */
const ROOM_SPAWN = [RX(2.5), RZ(3)];                           /* where you stand after walking in: an aisle, clear of the desks */
const ROOM_SNEAK = [RX(2.5), RZ(8.75)];                        /* during a job you start right by the door instead */
const ROOM_PODIUM = [RX(4.5), RZ(-ROOM.D / 2 + 2.6)];
const ROOM_SIDE = [RX(-12.3), RZ(-6)], ROOM_WIN = [RX(12.3), RZ(0)];   /* the side door by the blackboard · the window that opens */
const ROOM_DESKS = [], ROOM_CABS = {}, ROOM_WALLS = [];
let roomBoard = null;
(() => {
  const {ox, oz, W, D, H} = ROOM, add = m => { roomG.add(m); return m; };
  const wood = M('#9c7350', {roughness:.8}), wall = M('#efe7d6'), wallLow = M('#b9ae99'), tile = M('#a9a59c');
  add(box(W + 40, .2, D + 40, tile, ox, -.09, oz, roomG)).castShadow = false;           /* corridor around the room (just above the grass) */
  add(box(W, .2, D, wood, ox, -.08, oz, roomG)).castShadow = false;                      /* classroom floor, top at y = .02 */
  /* Each wall and what hangs on it is its own group, so the wall between the camera and the room can be cut away (roomCutaway);
     the low dado stays, so you still see where the wall is. */
  const wallAt = (w, d, x, z, nx, nz) => {
    const g = new THREE.Group(); roomG.add(g); ROOM_WALLS.push({g, nx, nz, off:(nx ? W : D) / 2 - 1});
    box(w, H, d, wall, x, H / 2, z, g); box(w + .02, .9, d + .02, wallLow, x, .45, z, roomG); addBox(x, z, w / 2, d / 2, 0); return g;
  };
  const gF = wallAt(W + .8, .4, ox, oz - D / 2, 0, -1);          /* front: blackboard */
  const gB = wallAt(W + .8, .4, ox, oz + D / 2, 0, 1);           /* back: the door */
  const gL = wallAt(.4, D, ox - W / 2, oz, -1, 0), gR = wallAt(.4, D, ox + W / 2, oz, 1, 0);
  /* windows on the side walls (the front one on the left wall is the side door instead) */
  const glass = M('#a9d4ee', {roughness:.15, metalness:.1}), green = M('#2f8f5a', {emissive:'#2f8f5a', emissiveIntensity:.6}), doorM = M('#7a4a2a', {roughness:.6});
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) if (!(s < 0 && i < 0)) box(.06, 1.6, 3.2, glass, ox + s * (W / 2 - .23), 2.4, oz + i * 6, s < 0 ? gL : gR);
  box(.1, 3, 2.2, doorM, ox - W / 2 + .25, 1.5, oz - 6, gL); box(.06, .5, 1.3, green, ox - W / 2 + .3, 3.35, oz - 6, gL);                /* side door */
  box(.14, .12, 3.5, M('#e3b95a', {emissive:'#e3b95a', emissiveIntensity:.35}), ox + W / 2 - .28, 1.55, oz, gR);                           /* the sill of the window that opens */
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
  const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({map:tex, roughness:.9})); gF.add(board);
  board.position.set(ox, 2.5, oz - D / 2 + .23);
  box(12.4, .14, .3, M('#8a6a45'), ox, .95, oz - D / 2 + .3, gF);
  /* door on the back wall */
  box(2.4, 3, .1, doorM, ox, 1.5, oz + D / 2 - .25, gB);
  box(1.4, .5, .06, green, ox, 3.35, oz + D / 2 - .3, gB);
  /* podium with the drawer */
  box(2.6, 1.15, 1.1, M('#8a5a36', {roughness:.6}), ROOM_PODIUM[0], .575, ROOM_PODIUM[1], roomG);
  box(.9, .3, .05, M('#c9a24a', {metalness:.4, roughness:.4}), ROOM_PODIUM[0], .75, ROOM_PODIUM[1] + .56, roomG);
  addBox(ROOM_PODIUM[0], ROOM_PODIUM[1], 1.3, .55, 0);
  /* cabinets flat against the walls (too shallow to need a collider): two lockers, a bookshelf, the homework cabinet */
  const cab = (id, x, z, w, d, col) => {
    box(w, 2.1, d, M(col, {roughness:.55, metalness:.2}), RX(x), 1.05, RZ(z), roomG);
    box(w > d ? .05 : d + .03, 1.9, w > d ? d + .03 : .05, M('#20242b'), RX(x), 1.05, RZ(z), roomG);      /* the gap between its two doors */
    ROOM_CABS[id] = [RX(x), RZ(z)];
  };
  cab('c1', -13.6, 3, .4, 2.4, '#6f8296'); cab('c2', 13.6, -3, .4, 2.4, '#6f8296'); cab('c3', 11.3, -9.55, 2.4, .5, '#8a6a45'); cab('hw', -9.5, -9.55, 2.4, .5, '#3e7a5a');
  /* desks and chairs: 5 columns x 4 rows, aisles between columns */
  const deskTop = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, .08, .8), M('#d8b98a', {roughness:.7}), 20);
  const deskLeg = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, .7, .06), M('#6c757d', {roughness:.6}), 20);
  const chair = new THREE.InstancedMesh(new THREE.BoxGeometry(.8, .5, .7), M('#3e6fa3', {roughness:.7}), 20);
  const mtx = new THREE.Matrix4(); let k = 0;
  for (let c = 0; c < 5; c++) for (let r = 0; r < 4; r++, k++){
    const x = ox - 10 + c * 5, z = oz - 3.5 + r * 3.4;
    mtx.makeTranslation(x, .76, z); deskTop.setMatrixAt(k, mtx);
    mtx.makeTranslation(x, .38, z - .2); deskLeg.setMatrixAt(k, mtx);
    mtx.makeTranslation(x, .25, z + .75); chair.setMatrixAt(k, mtx);
    addBox(x, z + .25, .95, .75, 0); ROOM_DESKS.push({x, z:z + .25, tz:z});
  }
  for (const im of [deskTop, deskLeg, chair]){ im.castShadow = im.receiveShadow = true; add(im); }
})();
/* the wall the camera looks through is cut down to its dado, like a doll's house */
function roomCutaway(){ for (const w of ROOM_WALLS) w.g.visible = (camera.position.x - ROOM.ox) * w.nx + (camera.position.z - ROOM.oz) * w.nz < w.off; }
/* indoor markers are flat glowing circles on the floor: the outdoor light beams would poke out of the roofless room */
function floorMark(color, r){
  const m = new THREE.Mesh(new THREE.RingGeometry(r * .62, r, 40).rotateX(-Math.PI / 2), gxGlow(color, .75));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * .62, 40).rotateX(-Math.PI / 2), gxGlow(color, .18)); m.add(fill);
  m.userData.ring = m; m.userData.fill = fill; roomG.add(m); return m;
}
const markColor = (m, c) => { m.material.color.set(c); m.userData.fill.material.color.set(c); };
const roomExitMark = floorMark('#4fd18b', 1.3), sideMark = floorMark('#ffd27a', 1.1), winMark = floorMark('#ffd27a', 1.1);
roomExitMark.position.set(ROOM_DOOR[0], .04, ROOM_DOOR[1] + .2);
sideMark.position.set(ROOM_SIDE[0], .04, ROOM_SIDE[1]); winMark.position.set(ROOM_WIN[0], .04, ROOM_WIN[1]); sideMark.visible = winMark.visible = false;
const roomAlarm = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D).rotateX(-Math.PI / 2), gxGlow('#ff2a2a', 0));
roomAlarm.position.set(ROOM.ox, .05, ROOM.oz); roomAlarm.visible = false; roomG.add(roomAlarm);

/* ---------- doors outside the teaching buildings ---------- */
const ROOM_DOORS = ['A1', 'A2', 'A4', 'A5'].map(n => {
  const info = infos.find(i => i.name === n); const p = info && frontPoint(info); if (!p) return null;
  const mark = gxMarker('#ffd27a', .45); mark.position.set(p[0], .1, p[1]);
  const lbl = addLabel(n + ' 教室', p[0], 4.2, p[1], true); lbl.dead = true;
  return {name:n, x:p[0], z:p[1], h:Math.atan2(p[0] - info.wx, p[1] - info.wz), mark, lbl};
}).filter(Boolean);

/* ---------- the two jobs: 抢救期末卷 (find it, get out) and 替同学交作业 (slip it in unseen) ---------- */
const EX_START = (() => { const i = infos.find(x => x.name === 'A3 百姓大楼'); const p = i && frontPoint(i); return p ? {x:p[0], z:p[1]} : {x:1180, z:520}; })();
const HW_START = (() => {      /* a second ring beside the first, along the front of A3 */
  const i = infos.find(x => x.name === 'A3 百姓大楼'); let px = 1, pz = 0;
  if (i){ const dx = EX_START.x - i.wx, dz = EX_START.z - i.wz, L = Math.hypot(dx, dz) || 1; px = -dz / L; pz = dx / L; }
  for (const k of [14, -14, 20, -20]){ const x = EX_START.x + px * k, z = EX_START.z + pz * k; if (!hitsBuilding(x, z, 5) && !outOfMap(x, z, 3)) return {x, z}; }
  return {x:EX_START.x + 14, z:EX_START.z};
})();
const exMark = gxMarker('#ff6f61', 1); exMark.position.set(EX_START.x, .1, EX_START.z);
const hwMark = gxMarker('#4aa3ff', 1); hwMark.position.set(HW_START.x, .1, HW_START.z);
const exLbl = addLabel('抢救期末卷', EX_START.x, 7.5, EX_START.z, true), hwLbl = addLabel('替同学交作业', HW_START.x, 7.5, HW_START.z, true);
const EX_KIND = {
  exam:{name:'抢救期末卷', at:EX_START, mark:exMark, lbl:exLbl, color:'#ff6f61', back:'A3'},
  hw:{name:'替同学交作业', at:HW_START, mark:hwMark, lbl:hwLbl, color:'#4aa3ff', back:''}
};
const EX = {on:false, kind:'exam', t:0, limit:0, door:null, got:false, done:false, told:false, rearm:'', buddy:0, soaks:0, callT:0,
  spots:[], paper:null, note:null, snack:null, hint:'', hold:0, holdKey:'', crouch:false, hid:false, desk:null, slide:0,
  alarm:false, alarmT:0, spotted:0, caught:0, sideOpen:false, winOpen:false, routeA:0, runT:0, noiseT:0, alTick:0, tip:0};
const EX_MEDAL = [.4, .2];      /* share of the time that must be left for gold / silver */
const EX_HINT = {podium:'讲台抽屉', cab:'柜子', desk:'课桌抽屉'};
GX_MORE.push({id:'exam', name:'抢救期末卷', fmt:v => `最多剩 ${Math.round(v)} 秒`}, {id:'hw', name:'替同学交作业', fmt:v => `最多剩 ${Math.round(v)} 秒`},
  {id:'exstreak', name:'潜入连胜', fmt:v => `${Math.round(v)} 连胜`});
achAdd([['exghost', '神不知鬼不觉', '没被保安发现就完成一次潜入', 60], ['hw1', '作业侠', '替同学交一次作业', 20], ['exrun3', '惯犯', '潜入三连胜', 60]]);
/* the places a paper can be: the podium, four cabinets, and three desks picked for each run */
const exSpot = (id, kind, name, x, z, mx, mz, r) => { const mark = floorMark('#ff6f61', r); mark.position.set(mx, .04, mz); mark.visible = false; return {id, kind, name, x, z, mark, done:false, lock:false, out:false}; };
const EX_FIX = [
  exSpot('podium', 'podium', '讲台抽屉', ROOM_PODIUM[0], ROOM_PODIUM[1], ROOM_PODIUM[0], ROOM_PODIUM[1] + 1.4, 1.2),
  exSpot('c1', 'cab', '铁皮柜', ROOM_CABS.c1[0], ROOM_CABS.c1[1], ROOM_CABS.c1[0] + 1.2, ROOM_CABS.c1[1], .9),
  exSpot('c2', 'cab', '铁皮柜', ROOM_CABS.c2[0], ROOM_CABS.c2[1], ROOM_CABS.c2[0] - 1.2, ROOM_CABS.c2[1], .9),
  exSpot('c3', 'cab', '书架', ROOM_CABS.c3[0], ROOM_CABS.c3[1], ROOM_CABS.c3[0], ROOM_CABS.c3[1] + 1.2, .9),
  exSpot('hw', 'cab', '作业柜', ROOM_CABS.hw[0], ROOM_CABS.hw[1], ROOM_CABS.hw[0], ROOM_CABS.hw[1] + 1.2, .9)
];
const EX_DESK = [0, 1, 2].map(i => {
  const s = exSpot('d' + i, 'desk', '课桌抽屉', 0, 0, 0, 0, 1.55);
  s.drawer = box(.8, .2, .5, M('#b0563a', {roughness:.5}), 0, .6, 0, roomG); s.drawer.visible = false; return s;
});
function exSpots(){
  const pick = ROOM_DESKS.slice();
  for (const s of EX_DESK){ const d = pick.splice((rnd() * pick.length) | 0, 1)[0]; s.x = d.x; s.z = d.z; s.mark.position.set(d.x, .04, d.z); s.drawer.position.set(d.x, .6, d.tz + .32); }
  for (const s of EX_FIX.concat(EX_DESK)){ s.done = s.lock = s.out = false; markColor(s.mark, '#ff6f61'); }
  if (EX.kind === 'hw'){ EX.spots = [EX_FIX[4]]; markColor(EX_FIX[4].mark, '#4aa3ff'); EX.paper = EX.note = EX.snack = null; return; }
  EX.spots = EX_FIX.concat(EX_DESK);
  const bag = EX.spots.slice(), take = () => bag.splice((rnd() * bag.length) | 0, 1)[0];
  EX.paper = take(); EX.note = take(); EX.snack = take();
}
const exHere = () => EX.on && ROOM.in && EX.door === ROOM.from;      /* inside the room the job is in */
const exOpenSpots = () => EX.spots.filter(s => !s.done && !s.out);
function exMarks(){
  const here = exHere(), look = here && (EX.kind === 'hw' ? !EX.done : !EX.got);
  for (const s of EX_FIX.concat(EX_DESK)){ const on = look && EX.spots.includes(s) && !s.done && !s.out; s.mark.visible = on; if (s.drawer) s.drawer.visible = here && EX.kind === 'exam'; }
  sideMark.visible = winMark.visible = here;
  markColor(sideMark, EX.sideOpen ? '#4fd18b' : '#ffd27a'); markColor(winMark, EX.winOpen ? '#4fd18b' : '#ffd27a');
}
function exStart(kind){
  const K = EX_KIND[kind], opts = ROOM_DOORS.filter(d => Math.hypot(d.x - K.at.x, d.z - K.at.z) > 60);
  const door = opts[(rnd() * opts.length) | 0] || ROOM_DOORS[0], dist = Math.hypot(door.x - K.at.x, door.z - K.at.z), run = prog.best.exrun | 0;
  Object.assign(EX, {on:true, kind, t:0, door, got:false, done:false, told:false, alarm:false, alarmT:0, spotted:0, caught:0, hold:0, holdKey:'', sideOpen:false, winOpen:false,
    hint:'', crouch:false, hid:false, buddy:kind === 'hw' ? 2 : 0, soaks:0, callT:0, routeA:rnd() < .5 ? 0 : 1, alTick:0});
  EX.limit = Math.round(kind === 'hw' ? dist / 11 + 65 : dist * 2 / 12 + 85);
  exSpots(); guardReset(); exHideStart(); sfx.ding();
  gxCallout(K.name, kind === 'hw' ? `作业柜在 ${door.name} 教室` : `卷子藏在 ${door.name} 教室`, K.color);
  const streak = run ? ` · 连胜 ${run}，奖金 +${Math.min(5, run) * 10}%` : '';
  if (kind === 'hw') toast('替同学交作业', `同学的作业晚了，${EX.limit} 秒内溜进 ${door.name} 教室，塞进黑板左边的作业柜。两个保安在巡逻，被抓住作业就没收${streak}`, 4800);
  else toast('抢救期末卷', `期末卷藏在 ${door.name} 教室的某个抽屉或柜子里，${EX.limit} 秒内找出来送回 A3。别让保安看见${streak}`, 4800);
}
function exHideStart(){ for (const k in EX_KIND){ EX_KIND[k].mark.visible = false; EX_KIND[k].lbl.dead = true; } }
function exEnd(){
  EX.rearm = EX.kind; EX.on = false; EX.crouch = EX.hid = false; EX.alarm = false; exMarks(); roomAlarm.visible = false;
  for (const g of guards) guardShow(g, false); missionEl.classList.remove('urgent'); exQ();
}
function exFail(title, sub){
  const run = prog.best.exrun | 0; prog.best.exrun = 0; saveGame();
  sfx.fail(); toast(title, sub + (run > 1 ? ` · ${run} 连胜断了` : ''), 3200); exEnd();
}
function exFinish(){
  const hw = EX.kind === 'hw', K = EX_KIND[EX.kind], left = Math.max(0, EX.limit - EX.t), frac = left / EX.limit, medal = frac >= EX_MEDAL[0] ? 0 : frac >= EX_MEDAL[1] ? 1 : 2;
  const ghost = !EX.spotted && !EX.caught, run = (prog.best.exrun | 0) + 1, mult = 1 + .1 * Math.min(5, run - 1);
  prog.best.exrun = run; if (run > (prog.best.exstreak | 0)) prog.best.exstreak = run;
  const prev = prog.best[EX.kind], rec = prev == null || left > prev; if (rec) prog.best[EX.kind] = Math.round(left);
  const pay = Math.round(((hw ? 25 + left * .6 : 35 + left * .8) + (hw ? [25, 12, 4] : [30, 15, 5])[medal] + (ghost ? 25 : 0)) * mult);
  sess.acts++; sess.medals++; earn(pay); saveGame(); unlock(hw ? 'hw1' : 'exam');
  if (medal === 0) unlock('gold'); if (ghost) unlock('exghost'); if (run >= 3) unlock('exrun3');
  const next = medal ? ` · 再快 ${Math.ceil(EX.limit * EX_MEDAL[medal - 1] - left)} 秒就是${GX_MEDAL[medal - 1]}` : '';
  toast(`${GX_MEDAL[medal]} · ${hw ? '作业交上了' : '期末卷保住了'}`, `剩 ${Math.round(left)} 秒${rec && prev != null ? ' · 新纪录' : ''}${ghost ? ' · 没被发现 +25' : ''}${run > 1 ? ` · ${run} 连胜 ×${mult.toFixed(1)}` : ''} · +RM ${pay}${next}`, 4800);
  gxCallout(GX_MEDAL[medal], (ghost ? '神不知鬼不觉 · ' : '') + (run > 1 ? `${run} 连胜` : K.name), ['#e3b95a', '#b8c2cc', '#c98a55'][medal]);
  for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09);
  const p = driving || nw; for (let i = 0; i < 10; i++) spawnPart('dust', p.x + (rnd() - .5) * 5, 2 + rnd() * 3, p.z + (rnd() - .5) * 5, .8, {vy:2.5, life:1.6, op:1, color:'#fff6d8'});
  exEnd();
}

/* ---------- the guards: a patrol route, a view cone on the floor, ears ---------- */
const GUARD_VIEW = 8.5, GUARD_FOV = .62, GUARD_RUN = 6.2;
const GUARD_ROUTES = [
  [[-12.5, -5.4], [12.5, -5.4], [12.5, 8.45], [-12.5, 8.45]],
  [[-12.5, -5.4], [-7.5, -5.4], [-7.5, 8.45], [-2.5, 8.45], [-2.5, -5.4], [2.5, -5.4], [2.5, 8.45], [7.5, 8.45], [7.5, -5.4], [12.5, -5.4], [12.5, 8.45], [-12.5, 8.45]]
].map(r => r.map(([x, z]) => [RX(x), RZ(z)]));
const PVE_SOAK = [1, .85, .7, .6];   /* how long a soaking lasts at each opponent level */
const mkGuard = buddy => {
  const g = new THREE.Group(), navy = buddy ? '#3b4a2a' : '#24324a';
  const body = new THREE.Mesh(npcBodyGeo, M(navy, {roughness:.8})), head = new THREE.Mesh(npcHeadGeo, M('#d9a37c', {roughness:.7}));
  box(.34, .1, .36, M('#1a2438'), 0, 1.79, .02, g); box(.32, .03, .16, M('#1a2438'), 0, 1.75, .2, g);
  box(.08, .1, .02, M('#e3b95a', {metalness:.5, roughness:.4}), .08, 1.32, .12, g);
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(npcLegGeo, M('#1f2a3c', {roughness:.8, vertexColors:true})); l.position.set(s * .09, .87, 0); g.add(l); return l; });
  g.add(body, head); g.children.forEach(m => { m.castShadow = true; });
  g.scale.setScalar(1.35); g.visible = false; roomG.add(g);
  /* what he can see, drawn on the floor: the fan points along local +z */
  const cone = new THREE.Mesh(new THREE.CircleGeometry(1, 20, -Math.PI / 2 - GUARD_FOV, GUARD_FOV * 2).rotateX(-Math.PI / 2), gxGlow('#ffd24a', .2));
  cone.position.y = .06; cone.visible = false; roomG.add(cone);
  const bang = new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.excl, transparent:true, depthWrite:false, depthTest:false, color:'#ffd24a'})); bang.visible = false; roomG.add(bang);
  return {g, legs, cone, bang, buddy, x:0, z:0, h:0, state:'patrol', route:GUARD_ROUTES[0], wp:0, stun:0, catchT:0, walkT:0, side:0, alert:0, knows:0, lostT:0, lookT:0, walkMax:0, pause:0, scan:1, lx:0, lz:0};
};
const guards = [mkGuard(false), mkGuard(true)];
function guardShow(g, on){ g.g.visible = on; if (!on){ g.cone.visible = false; g.bang.visible = false; } }
/* both back on their rounds, far from the door you come in by */
function guardReset(){
  const a = guards[0], b = guards[1];
  Object.assign(a, {route:GUARD_ROUTES[EX.routeA], wp:1, x:GUARD_ROUTES[0][0][0], z:GUARD_ROUTES[0][0][1], h:Math.PI / 2});
  Object.assign(b, {route:GUARD_ROUTES[1 - EX.routeA], wp:1 - EX.routeA ? 10 : 2, x:RX(12.5), z:RZ(-5.4), h:0});
  for (const g of guards) Object.assign(g, {state:'patrol', stun:0, catchT:0, side:0, alert:0, knows:0, lostT:0, lookT:0, pause:0});
}
/* the first guard shouts for a colleague, who walks in through the door a moment later */
function guardCall(quiet){
  if (EX.buddy) return; EX.buddy = 1; EX.callT = 2.5;
  tone('square', 740, 740, .12, .09); tone('square', 990, 990, .2, .09, .14);
  if (!quiet) toast('保安：来人啊！', '他喊了同伴，马上从正门进来', 2400);
}
function guardStep(guard, tx, tz, speed, dt){
  const dx = tx - guard.x, dz = tz - guard.z, L = Math.hypot(dx, dz); if (L < .05) return L;
  const v = Math.min(L, speed * dt), ux = dx / L, uz = dz / L;
  const x0 = guard.x, z0 = guard.z;
  if (!hitsBuilding(guard.x + ux * v, guard.z, .45)) guard.x += ux * v;
  if (!hitsBuilding(guard.x, guard.z + uz * v, .45)) guard.z += uz * v;
  /* blocked by a desk: sidestep along the row toward the nearer aisle until the way is clear */
  if (Math.hypot(guard.x - x0, guard.z - z0) < v * .3){
    const sx = guard.side || (Math.sign(Math.round((guard.x - ROOM.ox) / 5) * 5 + 2.5 - (guard.x - ROOM.ox)) || 1);
    for (const [ax, az] of [[sx, 0], [0, Math.sign(dz) || 1], [-sx, 0], [0, -(Math.sign(dz) || 1)]]){
      if (!hitsBuilding(guard.x + ax * v, guard.z + az * v, .45)){ guard.x += ax * v; guard.z += az * v; guard.side = ax || guard.side; break; }
    }
  } else if (Math.abs(ux) > .2) guard.side = 0;
  const mx = guard.x - x0, mz = guard.z - z0; if (mx || mz) guard.h = Math.atan2(mx, mz);
  guard.walkT += dt * speed * 2.2; return L;
}
const wgAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/* how clearly this guard sees 奶娃 right now: 0 = not at all. Crouching shortens his reach; tucked under a desk he has to be on top of you,
   unless he watched you duck (knows > 0). */
function guardSees(g, d, dx, dz){
  if (g.state === 'stun' || nw.state === 'fly') return 0;
  let R = GUARD_VIEW + .7 * pveLevel();
  if (EX.hid && g.knows <= 0) R = 1.8; else if (EX.crouch) R *= .6;
  if (d > R) return 0;
  if (d > 1.3 && Math.abs(wgAng(Math.atan2(dx, dz), g.h)) > GUARD_FOV) return 0;
  return 1 - .6 * d / R;
}
function guardSpot(g){
  g.state = 'chase'; g.lx = nw.x; g.lz = nw.z; g.lostT = 0; g.alert = 1; EX.spotted++;
  tone('square', 880, 660, .15, .08); camShake = Math.max(camShake, .25);
  if (EX.spotted === 1) toast('保安：站住！', `被看见了。跑开，出了他的视野再蹲到课桌边；或者用水枪淋他（${TOUCH ? '「水枪」' : 'E'}）`, 3000);
  else gxCallout('被看见了！', g.buddy ? '增援保安在追你' : '保安在追你', '#ff6f61');
  if (!g.buddy && EX.kind === 'exam' && pveLevel() >= 2) guardCall();      /* tougher guards do not wait to get wet before calling */
}
/* a noise at (x, z) that carries r metres: any guard on his rounds within earshot walks over to look */
function exNoise(x, z, r, why){
  if (!exHere()) return; let heard = false;
  for (const g of guards) if (g.g.visible && (g.state === 'patrol' || g.state === 'look') && Math.hypot(g.x - x, g.z - z) < r){
    g.state = 'look'; g.lx = x; g.lz = z; g.lookT = 2.2; g.walkMax = 6; g.pause = 0; g.scan = rnd() < .5 ? 1 : -1; g.alert = Math.max(g.alert, .3); heard = true;
  }
  if (heard && EX.noiseT <= 0){ EX.noiseT = 2.5; tone('square', 520, 520, .08, .06); tone('square', 620, 620, .1, .06, .1); gxCallout('保安听见了', why + ' · 他过来看看', '#ffd24a'); }
}
/* returns true when this guard has just thrown 奶娃 out */
function updateGuard(g, dt){
  const lv = pveLevel(), dx = nw.x - g.x, dz = nw.z - g.z, dN = Math.hypot(dx, dz), see = guardSees(g, dN, dx, dz);
  g.knows = see ? 1 : Math.max(0, g.knows - dt);
  if (g.state === 'stun'){
    g.stun -= dt; g.g.rotation.y = g.h + Math.sin(g.stun * 14) * .4;
    if (rnd() < dt * 8) spawnPart('dust', g.x + (rnd() - .5) * .6, 2.2, g.z + (rnd() - .5) * .6, .3, {vy:-1.5, life:.5, op:.9, color:'#9fd8ff'});
    if (g.stun <= 0){ g.state = 'look'; g.lx = g.x; g.lz = g.z; g.lookT = 1.6; g.walkMax = 0; g.alert = Math.max(g.alert, .5); }
  } else if (g.state === 'chase'){
    if (see){ g.lx = nw.x; g.lz = nw.z; g.lostT = 0; } else g.lostT += dt;
    const far = guardStep(g, g.lx, g.lz, GUARD_RUN + .3 * lv, dt);
    if (see && dN < 1.6){ g.catchT += dt; if (g.catchT > .35){ guardCaught(g); return true; } } else g.catchT = 0;
    if (!see && (far < .8 || g.lostT > 4)){ g.state = 'look'; g.lookT = 2.6; g.walkMax = 0; g.alert = .6; g.scan = rnd() < .5 ? 1 : -1; tone('square', 440, 330, .12, .05); gxCallout('跟丢了', '保安在原地找你，别动', '#4fd18b'); }
  } else {
    if (see) g.alert = Math.min(1, g.alert + dt * (EX.alarm ? 2.2 : 1.15) * (.45 + see)); else g.alert = Math.max(0, g.alert - dt * .4);
    if (g.alert >= 1) guardSpot(g);
    else if (g.state === 'look'){
      if (g.walkMax > 0 && Math.hypot(g.lx - g.x, g.lz - g.z) > .9){ guardStep(g, g.lx, g.lz, 3.6, dt); g.walkMax -= dt; }
      else { g.lookT -= dt; g.h += dt * 2.4 * g.scan; if (g.lookT <= 0){ g.state = 'patrol'; let bd = 1e9; g.route.forEach((w, i) => { const d = Math.hypot(w[0] - g.x, w[1] - g.z); if (d < bd){ bd = d; g.wp = i; } }); } }
    } else if (g.pause > 0){ g.pause -= dt; g.h += dt * 2.6 * g.scan; }      /* stops and looks back over his shoulder */
    else {
      const w = g.route[g.wp];
      if (guardStep(g, w[0], w[1], EX.alarm ? 3.8 : 2.6, dt) < .4){ g.wp = (g.wp + 1) % g.route.length; if (rnd() < .35){ g.pause = 1.3; g.scan = rnd() < .5 ? 1 : -1; } }
    }
  }
  if (g.state !== 'stun') g.g.rotation.y = g.h;
  const sw = g.state === 'stun' || g.pause > 0 ? 0 : Math.sin(g.walkT) * .5;
  g.legs[0].rotation.x = sw; g.legs[1].rotation.x = -sw;
  g.g.position.set(g.x, 0, g.z);
  /* the cone goes from yellow to red as he gets suspicious; the mark over his head grows with it */
  const R = GUARD_VIEW + .7 * lv, hot = g.state === 'chase' ? 1 : g.alert;
  g.cone.visible = g.state !== 'stun'; g.cone.position.set(g.x, .06, g.z); g.cone.rotation.y = g.h; g.cone.scale.set(R, 1, R);
  g.cone.material.color.setRGB(1, .82 - .6 * hot, .29 - .2 * hot); g.cone.material.opacity = .16 + .2 * hot;
  g.bang.visible = hot > .08 && g.state !== 'stun'; g.bang.position.set(g.x, 3.3, g.z); g.bang.scale.setScalar(.7 + hot * .9); g.bang.material.color.setRGB(1, .82 - .6 * hot, .29 - .2 * hot);
  return false;
}
function guardCaught(g){
  const had = EX.got; EX.hold = 0; EX.holdKey = ''; EX.caught++; heat = Math.max(heat, 1.5);
  roomLeave(true); sfx.fail(); camShake = Math.max(camShake, .6);
  if (EX.kind === 'hw'){
    if (EX.done){ exFinish(); return; }
    exFail('作业被没收了', '带着作业被保安抓住，这次没交成。A3 门口的蓝圈可以再来'); return;
  }
  EX.t += 10;
  if (had){
    const pod = EX_FIX[0]; EX.got = false; pod.done = false; pod.out = false; pod.lock = true; EX.paper = pod; markColor(pod.mark, '#ff6f61');
    toast('卷子被保安收回去了', '锁进了讲台抽屉 · −10 秒。再进去，按住 F 撬 3 秒', 3400);
  } else toast('被保安请出了教室', '−10 秒。再进去：蹲着走（Q）没有声音，停在课桌边就能躲', 3400);
  guardReset();
}

/* ---------- entering / leaving ---------- */
function exQ(){ const b = actQ.querySelector('b'), t = exHere() ? (EX.crouch ? '起身' : '蹲下') : '撩头'; if (b.textContent !== t) b.textContent = t; }
function roomEnter(door){
  ROOM.in = true; ROOM.from = door; ROOM.keep = {dist:camDist, pitch:camPitch};
  roomBoard(door.name + ' 教室');
  const job = EX.on && EX.door === door, at = job ? ROOM_SNEAK : ROOM_SPAWN;
  nw.x = at[0]; nw.z = at[1]; nw.y = 0; nw.h = Math.PI; nw.air = false; camYaw = 0;
  camDist = job ? 13 : 10; camPitch = job ? 1.1 : 1.0;   /* look down over the 4.2 m walls; js/90-main.js skips wall collision indoors */ roomG.visible = true; mini.style.visibility = 'hidden';
  EX.crouch = EX.hid = false; EX.hold = 0; EX.holdKey = '';
  if (job){
    guardReset(); guardShow(guards[0], true); guardShow(guards[1], EX.buddy === 2);
    for (const g of guards) if (g.g.visible) updateGuard(g, 0);
  }
  exMarks(); exQ(); sfx.ding();
  if (!job) toast(`进了 ${door.name} 教室`, '走到门口的绿圈按 F 出去');
  else if (EX.kind === 'hw') toast(`进了 ${door.name} 教室`, `作业柜在黑板左边（蓝圈）。黄色扇形是保安的视野；${TOUCH ? '点「蹲下」' : '按 Q '}蹲着走没声音，停在课桌边就是躲起来`, 4200);
  else if (EX.paper && EX.paper.lock) toast(`又进了 ${door.name} 教室`, '卷子锁在讲台抽屉里，按住 F 撬 3 秒。警报还在响，保安很警觉', 3600);
  else toast(`进了 ${door.name} 教室`, `按住 ${TOUCH ? '「翻找」' : 'F '}翻带红圈的地方。黄色扇形是保安的视野；${TOUCH ? '点「蹲下」' : '按 Q '}蹲着走没声音，停在课桌边就是躲起来`, 4200);
}
function roomLeave(quiet){
  if (!ROOM.in) return;
  const d = ROOM.from; ROOM.in = false; roomG.visible = false; mini.style.visibility = '';
  if (ROOM.keep){ camDist = ROOM.keep.dist; camPitch = ROOM.keep.pitch; }
  if (d){ nw.x = d.x + Math.sin(d.h) * 2; nw.z = d.z + Math.cos(d.h) * 2; nw.h = d.h; camYaw = d.h + Math.PI; }
  nw.y = 0; EX.crouch = EX.hid = false; EX.hold = 0; EX.holdKey = '';
  for (const g of guards) guardShow(g, false); exMarks(); exQ(); roomAlarm.visible = false;
  if (!quiet) sfx.ding();
}
/* out through the door, the side door or the window: each lets you out at a different spot along the wall, with a different welcome */
function exLeaveBy(way){
  const d = ROOM.from, job = exHere(); roomLeave();
  if (d && way !== 'door'){
    const side = way === 'side' ? 1 : -1, px = Math.cos(d.h) * side, pz = -Math.sin(d.h) * side;
    for (const L of [16, 12, 8]){ const x = d.x + Math.sin(d.h) * 4 + px * L, z = d.z + Math.cos(d.h) * 4 + pz * L; if (!footBlocked(x, z)){ nw.x = x; nw.z = z; break; } }
  }
  if (way === 'win'){ nw.state = 'fly'; nw.t = 0; nw.y = groundAt(nw.x, nw.z) + 4.5; nw.vy = 5; nw.spin = 0; nw.vx = d ? Math.sin(d.h) * 4 : 0; nw.vz = d ? Math.cos(d.h) * 4 : 0; sfx.boing(); }
  if (!job) return;
  if (EX.kind === 'hw'){ if (EX.done) exFinish(); return; }
  if (EX.got && !EX.told){
    EX.told = true;
    if (way === 'door'){ heat = Math.max(heat, 3.2); toast('正门外全是保安', '三星警戒！把卷子送回 A3', 2600); }
    else if (way === 'side'){ heat = Math.max(heat, 2.2); toast('从侧门溜出来了', '保安正往这边赶（两星），把卷子送回 A3', 2600); }
    else { heat = Math.max(heat, 1.2); toast('跳窗！', '摔了一跤，但没人知道你从哪走的。爬起来把卷子送回 A3', 2800); }
  }
}
const nearDoor = () => !driving && !ROOM.in && ROOM_DOORS.find(d => Math.hypot(nw.x - d.x, nw.z - d.z) < 3.2);
const nearExit = () => ROOM.in && Math.hypot(nw.x - ROOM_DOOR[0], nw.z - ROOM_DOOR[1]) < 2.6;
const exNearExit = () => !exHere() ? '' : Math.hypot(nw.x - ROOM_SIDE[0], nw.z - ROOM_SIDE[1]) < 2.4 ? 'side' : Math.hypot(nw.x - ROOM_WIN[0], nw.z - ROOM_WIN[1]) < 2.4 ? 'win' : '';
function exNearSpot(){
  if (!exHere() || (EX.kind === 'hw' ? EX.done : EX.got)) return null;
  let best = null, bd = 2.7;
  for (const s of EX.spots) if (!s.done && !s.out){ const d = Math.hypot(nw.x - s.x, nw.z - s.z); if (d < bd){ bd = d; best = s; } }
  return best;
}
/* what holding F does where 奶娃 stands: {key, label, btn, need (seconds), noise (metres it carries)} */
function exHoldTarget(){
  const k = exNearExit();
  if (k === 'side' && !EX.sideOpen) return {key:'side', label:'拉开侧门的门闩', btn:'开门闩', need:1.2, noise:5.5};
  if (k === 'win' && !EX.winOpen) return {key:'win', label:'撬开窗户', btn:'开窗', need:1.5, noise:5.5};
  const s = exNearSpot(); if (!s) return null;
  if (EX.kind === 'hw') return {key:s.id, spot:s, label:'把作业塞进作业柜', btn:'塞作业', need:2.5, noise:0};
  if (s.lock) return {key:s.id, spot:s, label:'撬开讲台抽屉', btn:'撬锁', need:3, noise:9};
  return {key:s.id, spot:s, label:'翻' + s.name, btn:'翻找', need:1.3, noise:5.5};
}
function exAlarmOn(){
  EX.alarm = true; EX.alarmT = 0; roomAlarm.visible = true; camShake = Math.max(camShake, .5);
  for (const g of guards) if (g.g.visible && g.state !== 'stun'){ g.state = 'chase'; g.lx = nw.x; g.lz = nw.z; g.lostT = 0; }
  guardCall(true);
}
function exDo(h){
  if (h.key === 'side'){ EX.sideOpen = true; sfx.ding(); gxCallout('门闩开了', '侧门随时能走', '#4fd18b'); exMarks(); return; }
  if (h.key === 'win'){ EX.winOpen = true; sfx.ding(); gxCallout('窗户开了', '随时能跳', '#4fd18b'); exMarks(); return; }
  const s = h.spot; s.done = true; s.lock = false;
  if (EX.kind === 'hw'){ EX.done = true; sfx.sparkle(); gxCallout('塞进去了！', '悄悄溜出去就算完成', '#4aa3ff'); exMarks(); return; }
  if (s === EX.paper){
    EX.got = true; sfx.sparkle(); gxCallout('卷子到手！', '警报响了 · 选一个出口', '#ff6f61'); exAlarmOn(); exMarks();
    toast('全楼警报！', `增援从正门进来。${EX.sideOpen ? '侧门开着' : '侧门要拉门闩'}，${EX.winOpen ? '窗户开着' : '窗户要撬'}，正门外有巡逻车`, 3600);
  } else if (s === EX.note){
    EX.hint = EX.paper.kind; let n = 0; for (const q of EX.spots) if (!q.done && q.kind !== EX.hint){ q.out = true; n++; }
    for (const q of EX.spots) if (!q.done && !q.out) markColor(q.mark, '#ffd24a');
    sfx.ding(); gxCallout('找到一张纸条', `「卷子在${EX_HINT[EX.hint]}里」`, '#ffd24a'); exMarks();
  } else if (s === EX.snack){ earn(8); tone('triangle', 660, 990, .15, .1); gxCallout('同学藏的零花钱', '+RM 8 · 卷子不在这', '#e3b95a'); exMarks(); }
  else { tone('square', 240, 180, .12, .06); gxCallout('空的', `还有 ${exOpenSpots().length} 处没翻`, '#b8c2cc'); exMarks(); }
}
/* called first by doF() in js/90-main.js; true means F was used here */
function roomTryF(){
  if (mode !== 'naiwa' || driving) return false;
  const d = nearDoor(); if (d){ roomEnter(d); return true; }
  if (!ROOM.in) return false;
  const k = exNearExit();
  if (k === 'side' && EX.sideOpen){ exLeaveBy('side'); return true; }
  if (k === 'win' && EX.winOpen){ exLeaveBy('win'); return true; }
  if (exHere() && exHoldTarget()) return true;          /* F is held here; the press itself does nothing else */
  if (nearExit()){ exLeaveBy('door'); return true; }
  return false;
}
/* Q (the 撩头 button) is crouch while a job is on in this room */
function exCrouch(on){
  if (EX.crouch === on) return; EX.crouch = on; if (!on) EX.hid = false;
  tone('sine', on ? 420 : 300, on ? 300 : 420, .08, .05); exQ();
}

/* ---------- water gun ---------- */
const WG = {ammo:6, max:6, regen:0, cd:0, el:$('#water'), jets:[], mouse:false, mx:0, my:0, drag:null, click:null, aim:0, show:0, scanT:0, near:false, shotT:9, told:false};
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
/* solid things stop the jet: buildings outdoors, the walls of the classroom (desks are low, the water goes over them) */
function wgBlocked(x, z){
  for (const f of WG_BLOCKS) if (f(x, z)) return true;
  if (ROOM.in) return Math.abs(x - ROOM.ox) > ROOM.W / 2 - .3 || Math.abs(z - ROOM.oz) > ROOM.D / 2 - .3;
  if (indoorNow()) return false;
  return hitsBuilding(x, z, .05);
}
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
  WG.ammo--; WG.cd = .35; WG.regen = 0; WG.shotT = 0; wgShow();
  nw.h = a; if (EX.crouch) exCrouch(false);
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
  exNoise(nw.x, nw.z, 11, '水枪的声音');
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
let soakedTold = false;
function soakCar(c, power, info){
  if (!c.active) return;
  const t = 4 * (power || 1) * PVE_SOAK[pveLevel()];
  c.soakT = t; c.vx *= .3; c.vz *= .3; splashAt(c.x, 1.5, c.z); sfx.splash(); unlock('soak');
  if (info && info.push){ c.vx += info.fx * 9; c.vz += info.fz * 9; }
  if (!soakedTold){ soakedTold = true; toast('保安被淋了一身', '车停下来擦玻璃，趁现在跑！', 2000); } else gx.callout('淋湿了', `保安停车 ${wgSecs(t)} 秒`, '#4aa3ff');
}
function soakGuard(g, power, info){
  if (!g.g.visible) return;
  const t = 3.5 * (power || 1) * PVE_SOAK[pveLevel()];
  g.state = 'stun'; g.stun = t; g.catchT = 0; g.alert = 0; splashAt(g.x, 1.6, g.z); sfx.splash(); unlock('soak'); EX.spotted++;
  if (info && info.push) for (let k = 0; k < 6; k++){ const x = g.x + info.fx * .5, z = g.z + info.fz * .5; if (hitsBuilding(x, z, .45)) break; g.x = x; g.z = z; }
  gx.callout('淋湿了', `${g.buddy ? '增援保安' : '保安'}擦脸 ${wgSecs(t)} 秒`, '#4aa3ff');
  /* soaking him is what makes him call for help: on the second soaking at first, on the first one once the opponents have levelled up */
  EX.soaks++; if (!g.buddy && EX.kind === 'exam' && EX.soaks >= (pveLevel() >= 1 ? 1 : 2)) guardCall();
}
/* soaked cars and guards are skipped, so the jet goes on to one that is still coming */
wgAddTarget(() => ROOM.in ? null : patrols.filter(c => c.active && c !== driving && !(c.soakT > 0)).map(c => ({x:c.x, z:c.z, r:1.7, hit:(p, i) => soakCar(c, p, i)})));
wgAddTarget(() => ROOM.in ? guards.filter(g => g.g.visible && g.state !== 'stun').map(g => ({x:g.x, z:g.z, r:.6, hit:(p, i) => soakGuard(g, p, i)})) : null);
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
  WG.cd -= dt; WG.shotT += dt; EX.noiseT -= dt;
  if (WG.ammo < WG.max){ WG.regen += dt; if (WG.regen > wgStat().regen){ WG.regen = 0; WG.ammo++; } }
  wgShow(); wgJets(dt);
  /* the aim line shows up when something that can be soaked is around */
  WG.scanT -= dt;
  if (WG.scanT <= 0){
    WG.scanT = .25; const R = wgStat().range * 1.6 + 6; WG.near = !driving && wgTargets().some(t => Math.hypot(t.x - nw.x, t.z - nw.z) < R);
    if (WG.near && !WG.told && !EX.on){ WG.told = true; toast('水枪要自己瞄', TOUCH ? '点「水枪」朝面前喷；按住它拖动可以转方向，松手开火。蓝线是水柱能到的地方' : '鼠标指哪喷哪，按 E 或点左键开火。蓝线是水柱能到的地方，跑动的目标要打提前量', 4200); }
  }
  wgPreview(dt);
  for (const c of patrols) if (c.soakT > 0 && c.active && rnd() < dt * 6) spawnPart('dust', c.x + (rnd() - .5) * 2, 1.6, c.z + (rnd() - .5) * 2, .4, {vy:-1, life:.6, op:.8, color:'#9fd8ff'});
  /* doors outside */
  const busyOther = mission.on || gxA.act || gxTaxi.on || gx.extBusy();   /* extBusy: anything a later file runs (js/89-outskirts-play.js) */
  for (const d of ROOM_DOORS){
    const target = EX.on && EX.door === d && !(EX.kind === 'hw' ? EX.done : EX.got);
    d.mark.visible = !ROOM.in; d.lbl.dead = ROOM.in || Math.hypot(px - d.x, pz - d.z) > 140;
    d.mark.userData.ring.material.color.set(target ? EX_KIND[EX.kind].color : '#ffd27a');
    d.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 300) * .15;
  }
  const nd = nearDoor();
  if (nd) roomPrompt = (TOUCH ? '点「进门」' : '按 F ') + `进 ${nd.name} 教室`;
  /* the two start rings at A3 */
  const showStart = !EX.on && !busyOther && !ROOM.in;
  for (const k in EX_KIND){
    const K = EX_KIND[k]; K.mark.visible = showStart; K.lbl.dead = !showStart; if (!showStart) continue;
    K.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    const d = Math.hypot(px - K.at.x, pz - K.at.z);
    if (EX.rearm === k){ if (d > 14) EX.rearm = ''; }
    else if (d < 6.5){ exStart(k); break; }
  }
  /* inside */
  let fl = nd ? '进门' : '';
  if (ROOM.in){
    roomCutaway();
    roomExitMark.scale.setScalar(1 + Math.sin(performance.now() / 300) * .08);
    if (exHere()) fl = exInside(dt) || fl;
    else if (nearExit()){ roomPrompt = (TOUCH ? '点「出门」' : '按 F ') + '出门'; fl = '出门'; }
  }
  if (EX.on) exUpdate(dt, px, pz);
  setFLabel(fl);
}
/* one frame of a job inside its classroom; returns the label for the F button */
function exInside(dt){
  let fl = '';
  /* reinforcements through the main door */
  if (EX.buddy === 1){
    EX.callT -= dt;
    if (EX.callT <= 0){
      EX.buddy = 2; const b = guards[1]; guardShow(b, true); Object.assign(b, {state:'chase', x:ROOM_DOOR[0], z:ROOM_DOOR[1], side:0, lx:nw.x, lz:nw.z, lostT:0, alert:1, stun:0});   /* right at the door: one step further in is a desk */
      tone('square', 880, 660, .15, .08); gx.callout('增援到了', '第二个保安从正门进来了', '#ff6f61');
    }
  }
  /* crouching: tucked in beside a desk and not moving = hidden under it */
  EX.desk = null;
  if (EX.crouch){ let bd = 3.2; for (const d of ROOM_DESKS){ const q = Math.hypot(nw.x - d.x, nw.z - d.z); if (q < bd){ bd = q; EX.desk = d; } } }
  const hid = !!EX.desk && nw.spd < .5; if (hid && !EX.hid) tone('sine', 300, 220, .1, .05); EX.hid = hid;
  /* noise: running */
  if (!EX.crouch && nw.spd > 7){ EX.runT += dt; if (EX.runT > .35){ EX.runT = 0; exNoise(nw.x, nw.z, 7.5, '跑步的声音'); } }
  if (nw.state === 'laugh' && nw.t < .1) exNoise(nw.x, nw.z, 14, '笑声');
  for (const g of guards) if (g.g.visible && updateGuard(g, dt)) return '';
  if (!exHere()) return '';
  let hot = 0; for (const g of guards) if (g.g.visible && g.state !== 'chase' && g.state !== 'stun') hot = Math.max(hot, g.alert);
  const tick = Math.floor(hot * 4); if (tick > EX.alTick) tone('square', 500 + tick * 90, 500 + tick * 90, .06, .06); EX.alTick = tick;
  /* the alarm */
  if (EX.alarm){
    EX.alarmT += dt; roomAlarm.visible = true; roomAlarm.material.opacity = .05 + .05 * Math.sin(EX.alarmT * 8);
    if (Math.floor(EX.alarmT / .9) !== Math.floor((EX.alarmT - dt) / .9)){ tone('square', 880, 880, .2, .04); tone('square', 660, 660, .2, .04, .22); }
  }
  /* holding F: search, pry, unbolt, open */
  const h = exHoldTarget(), holding = h && (keys.KeyF || keys.Enter || actF.classList.contains('on'));
  if (holding){
    if (EX.holdKey !== h.key){ EX.holdKey = h.key; EX.hold = 0; if (h.noise) exNoise(nw.x, nw.z, h.noise, h.spot ? '翻东西的声音' : '门窗的声音'); }
    EX.hold += dt; if (Math.floor(EX.hold * 5) !== Math.floor((EX.hold - dt) * 5)) tone('square', 300 + EX.hold / h.need * 400, 300 + EX.hold / h.need * 400, .05, .05);
    if (EX.hold >= h.need){ EX.hold = 0; EX.holdKey = ''; exDo(h); }
  } else { EX.hold = Math.max(0, EX.hold - dt * 2); if (!EX.hold) EX.holdKey = ''; }
  const k = exNearExit(), key = TOUCH ? '' : 'F ';
  if (h){ roomPrompt = `按住 ${TOUCH ? '「' + h.btn + '」' : 'F '}${h.label} · ${Math.min(100, Math.round(EX.hold / h.need * 100))}%`; fl = h.btn; }
  else if (k === 'side'){ roomPrompt = `按 ${key}从侧门出去`; fl = '侧门'; }
  else if (k === 'win'){ roomPrompt = `按 ${key}跳窗 · 会摔一跤，但没人看见`; fl = '跳窗'; }
  else if (nearExit()){ roomPrompt = `按 ${key}从正门出去` + (EX.got ? ' · 门外有巡逻车' : ''); fl = '出门'; }
  else if (EX.hid) roomPrompt = '躲在课桌下 · 保安走到跟前才看得见';
  else if (hot > .2) roomPrompt = '保安起疑了！走出黄色扇形，或者蹲到课桌边';
  else if (EX.crouch) roomPrompt = '蹲着走没有声音 · 停在课桌边就是躲起来';
  else if ((EX.tip += dt) < 14 || EX.got) roomPrompt = EX.got ? '带着卷子出去：正门、侧门（黑板旁）或窗户' : `${TOUCH ? '「蹲下」' : 'Q '}蹲下 · 别跑，保安听得见 · 黄色扇形是他的视野`;
  return fl;
}
function exUpdate(dt, px, pz){
  EX.t += dt;
  const left = EX.limit - EX.t, K = EX_KIND[EX.kind], here = exHere(), T = Math.max(0, Math.ceil(left));
  if (left <= 0){ if (ROOM.in) roomLeave(true); exFail(EX.kind === 'hw' ? '作业没交上' : '期末卷交到教务处了', '时间到。A3 门口的光圈可以再来'); return; }
  let line;
  if (EX.kind === 'hw') line = EX.done ? '交了 · 溜出教室' : here ? '把作业塞进作业柜（黑板左边）' : `去 ${EX.door.name} 教室`;
  else if (EX.got) line = ROOM.in ? '卷子到手 · 找出口' : '把卷子送回 A3';
  else if (!here) line = `去 ${EX.door.name} 教室`;
  else if (EX.paper && EX.paper.lock) line = '撬开讲台抽屉';
  else line = EX.hint ? `卷子在${EX_HINT[EX.hint]}里 · 还有 ${exOpenSpots().length} 处` : `找期末卷 · 还有 ${exOpenSpots().length} 处没翻`;
  missionEl.textContent = `${T} 秒 · ${line} · ${K.name}`;
  missionEl.classList.toggle('urgent', left < 15);
  if (EX.kind === 'exam' && EX.got && !ROOM.in && Math.hypot(px - EX_START.x, pz - EX_START.z) < 8) exFinish();
}

/* ---------- hook into the game loop (js/80-gta.js and js/85-activities.js) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); roomUpdate(dt, px, pz); },
    busy(){ return base.busy() || EX.on; },
    extBusy(){ return EX.on; },
    prompt(){ return roomPrompt || base.prompt(); },
    target(){
      if (!EX.on) return base.target();
      const want = EX.kind === 'hw' ? !EX.done : !EX.got;
      if (!ROOM.in) return want ? {x:EX.door.x, z:EX.door.z, label:EX.door.name + ' 教室'} : {x:EX_START.x, z:EX_START.z, label:'A3 · 交回卷子'};
      if (!exHere()) return {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'出门'};
      if (want){ let best = null, bd = 1e9; for (const s of exOpenSpots()){ const d = Math.hypot(s.x - nw.x, s.z - nw.z); if (d < bd){ bd = d; best = s; } } if (best) return {x:best.x, z:best.z, label:best.name}; }
      let ex = {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'正门'}, bd = Math.hypot(ROOM_DOOR[0] - nw.x, ROOM_DOOR[1] - nw.z);
      for (const [p, label, open] of [[ROOM_SIDE, '侧门', EX.sideOpen], [ROOM_WIN, '窗户', EX.winOpen]]){ const d = Math.hypot(p[0] - nw.x, p[1] - nw.z); if (open && d < bd){ bd = d; ex = {x:p[0], z:p[1], label}; } }
      return ex;
    },
    mini(dot){
      base.mini(dot);
      if (EX.on){ const back = EX.kind === 'exam' && EX.got; dot(back ? EX_START.x : EX.door.x, back ? EX_START.z : EX.door.z, EX_KIND[EX.kind].color, 9); }
      else if (!mission.on && !gxA.act && !gxTaxi.on){ dot(EX_START.x, EX_START.z, '#ff6f61', 7); dot(HW_START.x, HW_START.z, '#4aa3ff', 7); }
      for (const d of ROOM_DOORS) if (!(EX.on && EX.door === d)) dot(d.x, d.z, '#ffd27a', 4);
    },
    onBust(){ roomLeave(true); if (EX.on) exFail(EX.kind === 'hw' ? '作业没交上' : '期末卷没保住', '被保安抓了，东西也被收走了'); base.onBust(); },
    leave(){ roomLeave(true); if (EX.on) exEnd(); EX.rearm = ''; exHideStart(); for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; } setFLabel(''); WG.jets.length = 0; WG.drag = null; wgLine.m.visible = wgLine.tip.visible = false; base.leave(); }
  });
}
/* crouching: Q / the 撩头 button toggles it, jumping stands up, moving is slow and silent, 奶娃 is squashed and slides under the desk when hidden */
{ const base = footAction; footAction = function(k){
    if (exHere() && !driving){ if (k === 'pose'){ if (nw.state === 'idle' && !nw.air) exCrouch(!EX.crouch); return; } if (k === 'jump' && EX.crouch){ exCrouch(false); return; } }
    base(k);
  }; }
{ const base = updateFoot; updateFoot = function(dt){
    if (!EX.crouch){ base(dt); return; }
    const sl = keys.ShiftLeft, sr = keys.ShiftRight, jx = joy.x, jy = joy.y, m = Math.hypot(jx, jy);
    keys.ShiftLeft = keys.ShiftRight = false; if (m > .9){ joy.x = jx / m * .9; joy.y = jy / m * .9; }
    base(dt * .55);      /* about 3 m/s on all fours, and never a run */
    keys.ShiftLeft = sl; keys.ShiftRight = sr; joy.x = jx; joy.y = jy;
  }; }
{ const base = animNaiwa; let squash = 1; animNaiwa = function(dt, T){
    base(dt, T);
    const want = EX.crouch && !driving ? .55 : 1; if (squash === 1 && want === 1) return;
    squash += (want - squash) * Math.min(1, dt * 12); if (want === 1 && squash > .985) squash = 1;
    EX.slide += ((EX.hid ? 1 : 0) - EX.slide) * Math.min(1, dt * 8);
    if (driving) return;
    NW.root.scale.set(NAI_S, NAI_S * squash, NAI_S);
    if (EX.desk && EX.slide > .02){ NW.root.position.x += (EX.desk.x - nw.x) * .7 * EX.slide; NW.root.position.z += (EX.desk.z - nw.z) * .7 * EX.slide; }
  }; }
exHideStart(); for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; }
wgRefresh(true);
