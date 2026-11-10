/* XMUM 校园漫游 · 教学楼潜入：四个房间、四种委托、五种人
 *
 * 地方在 js/87-classroom.js 搭的教学楼一层：走廊 → 教室 / 打印室 → 教师办公室。A3 门口两个光圈接活：
 *   红圈永远是「抢救期末卷」，蓝圈是轮换的委托（赶 DDL 交作业 → 拿回被没收的手机 → 夜闯自习楼）。
 * 四种委托：
 *   抢救期末卷：卷子藏在三个房间十处中的一处，按住 F 翻。有一张纸条说卷子在哪个房间；办公室锁着，钥匙也藏在某一处。
 *     拿到卷子全楼警报，增援从走廊西头进来。三个出口：走廊西头的正门（门外三星）、教室的侧门（先拉门闩，两星）、
 *     教室的窗（先撬开，跳下去摔一跤，一星）。门闩和窗可以提前弄开。最后把卷子送回 A3。
 *   赶 DDL 交作业：把作业塞进老师办公桌前面的作业筐，要趁她低头批卷的时候。带着作业被保安抓住就失败。
 *   拿回被没收的手机：手机在办公室的没收箱里，箱子锁着。钥匙有两把：保安腰上一把（用水枪淋他会掉下来，但动静大），
 *     老师抽屉里一把（要绕到她身后慢慢翻）。拿到手机几秒后它会响，得先走远。
 *   夜闯自习楼：关了灯，两个保安打着手电巡逻，三个房间各落了一件东西，全捡回来再出去。
 * 五种人：
 *   保安：沿走廊和教室巡逻，地上的扇形是他的视野，墙挡得住；听见动静会过来看；追人会穿门；能用水枪淋。
 *   老师：坐在办公室批卷，每隔几秒抬头看一圈（抬头前笔会停一下，扇形先闪）。被她看见她会喊保安。不能淋，淋了更糟。
 *   清洁阿姨：在走廊来回拖地，身后的地是湿的，在湿地上跑会滑倒；在她旁边跑她会大喊，把保安招来。
 *   学霸：趴在教室某张课桌上睡觉，旁边有动静（跑步、翻东西、水枪）会被吵醒，嚷一嗓子把保安招来。
 *   同学：在打印室打印论文。按 F 找他帮忙，RM 15 他去走廊缠住保安 12 秒（没钱只帮 6 秒），一次行动只帮一回。
 * 通用规则：Q（手机「蹲下」）蹲着走没有声音，蹲在课桌、沙发、箱子、打印机旁边不动就是躲起来。
 *   被保安抓住请出楼、扣 10 秒，手里的东西被收回去。按剩余时间给金银铜牌，全程没被发现有奖金，连胜有加成。
 */
'use strict';
/* ---------- the two start rings at A3 ---------- */
const EX_START = (() => { const i = infos.find(x => x.name === 'A3 百姓大楼'); const p = i && frontPoint(i); return p ? {x:p[0], z:p[1]} : {x:1180, z:520}; })();
const HW_START = (() => {      /* a second ring beside the first, along the front of A3 */
  const i = infos.find(x => x.name === 'A3 百姓大楼'); let px = 1, pz = 0;
  if (i){ const dx = EX_START.x - i.wx, dz = EX_START.z - i.wz, L = Math.hypot(dx, dz) || 1; px = -dz / L; pz = dx / L; }
  for (const k of [14, -14, 20, -20]){ const x = EX_START.x + px * k, z = EX_START.z + pz * k; if (!hitsBuilding(x, z, 5) && !outOfMap(x, z, 3)) return {x, z}; }
  return {x:EX_START.x + 14, z:EX_START.z};
})();
const EX_KIND = {
  exam:{name:'抢救期末卷', color:'#ff6f61', time:d => d * 2 / 12 + 120, pay:35, rate:.8, bonus:[30, 15, 5]},
  hw:{name:'赶 DDL 交作业', color:'#4aa3ff', time:d => d / 11 + 85, pay:25, rate:.6, bonus:[25, 12, 4]},
  phone:{name:'拿回被没收的手机', color:'#4aa3ff', time:d => d / 11 + 100, pay:30, rate:.6, bonus:[28, 14, 5]},
  night:{name:'夜闯自习楼', color:'#4aa3ff', time:d => d / 11 + 115, pay:30, rate:.6, bonus:[28, 14, 5]}
};
const EX_SIDE = ['hw', 'phone', 'night'];
const exSideKind = () => EX_SIDE[(prog.best.exside | 0) % EX_SIDE.length];
const exRing = (at, color, text) => { const mark = gxMarker(color, 1); mark.position.set(at.x, .1, at.z); return {at, mark, lbl:addLabel(text, at.x, 7.5, at.z, true)}; };
const EX_RING = {main:exRing(EX_START, '#ff6f61', '抢救期末卷'), side:exRing(HW_START, '#4aa3ff', '委托')};
const EX = {on:false, kind:'exam', t:0, limit:0, door:null, got:false, done:false, told:false, rearm:'', buddy:0, soaks:0, callT:0,
  spots:[], paper:null, hint:'', key:false, hold:0, holdKey:'', crouch:false, hid:false, desk:null, slide:0, alarm:false, alarmT:0, spotted:0, caught:0,
  sideOpen:false, winOpen:false, poOpen:false, coOpen:false, runT:0, noiseT:0, alTick:0, tip:0, items:0, ringT:0, pal:false, keyAt:null, room:''};
const EX_MEDAL = [.4, .2];      /* share of the time that must be left for gold / silver */
for (const k in EX_KIND) GX_MORE.push({id:k, name:EX_KIND[k].name, fmt:v => `最多剩 ${Math.round(v)} 秒`});
GX_MORE.push({id:'exstreak', name:'潜入连胜', fmt:v => `${Math.round(v)} 连胜`});
achAdd([['exghost', '神不知鬼不觉', '没被任何人发现就完成一次潜入', 60], ['hw1', '压线交作业', '赶在 DDL 前把作业交上', 20], ['exrun3', '惯犯', '潜入三连胜', 60], ['exall', '全能委托人', '四种委托各完成一次', 100]]);

/* ---------- the places things can be ---------- */
const exSpot = (id, room, kind, name, x, z, mx, mz, r) => { const mark = floorMark('#ff6f61', r || .9); mark.position.set(mx, .045, mz); mark.visible = false; return {id, room, kind, name, x, z, mark, done:false, lock:false, out:false, has:''}; };
const EX_SP = {
  podium:exSpot('podium', 'C', 'drawer', '讲台抽屉', ROOM_PODIUM[0], ROOM_PODIUM[1], ROOM_PODIUM[0], ROOM_PODIUM[1] + 1.4, 1.2),
  c1:exSpot('c1', 'C', 'cab', '铁皮柜', ROOM_CABS.c1[0], ROOM_CABS.c1[1], ROOM_CABS.c1[0] + 1.2, ROOM_CABS.c1[1]),
  c2:exSpot('c2', 'C', 'cab', '铁皮柜', ROOM_CABS.c2[0], ROOM_CABS.c2[1], ROOM_CABS.c2[0] - 1.2, ROOM_CABS.c2[1]),
  d0:exSpot('d0', 'C', 'drawer', '课桌抽屉', 0, 0, 0, 0, 1.55), d1:exSpot('d1', 'C', 'drawer', '课桌抽屉', 0, 0, 0, 0, 1.55),
  file:exSpot('file', 'O', 'cab', '文件柜', ROOM_CABS.file[0], ROOM_CABS.file[1], ROOM_CABS.file[0] - 1.2, ROOM_CABS.file[1]),
  tdraw:exSpot('tdraw', 'O', 'drawer', '老师的抽屉', RX(21.3), RZ(-6.1), RX(21.9), RZ(-7), .8),
  box:exSpot('box', 'O', 'box', '没收箱', ROOM_CABS.box[0], ROOM_CABS.box[1], ROOM_CABS.box[0], ROOM_CABS.box[1] + 1.2),
  tray:exSpot('tray', 'O', 'tray', '作业筐', ROOM_CABS.tray[0], ROOM_CABS.tray[1], ROOM_CABS.tray[0], ROOM_CABS.tray[1] + 1.2),
  printer:exSpot('printer', 'P', 'cab', '打印机', RX(24.4), RZ(8.4), RX(22.6), RZ(8)),
  shelf:exSpot('shelf', 'P', 'cab', '纸架', ROOM_CABS.shelf[0], ROOM_CABS.shelf[1], ROOM_CABS.shelf[0] - 1.2, ROOM_CABS.shelf[1]),
  store:exSpot('store', 'P', 'cab', '储物柜', ROOM_CABS.store[0], ROOM_CABS.store[1], ROOM_CABS.store[0] + 1.2, ROOM_CABS.store[1])
};
const EX_ALL = Object.keys(EX_SP).map(k => EX_SP[k]);
for (const s of [EX_SP.d0, EX_SP.d1]){ s.drawer = box(.8, .2, .5, M('#b0563a', {roughness:.5}), 0, .6, 0, roomG); s.drawer.visible = false; }
const exKeyMark = floorMark('#ffd24a', .7); exKeyMark.visible = false;      /* the key the guard dropped */
const exDark = new THREE.Mesh(new THREE.PlaneGeometry(44, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#05070d', transparent:true, opacity:.62, depthWrite:false}));
exDark.position.set(RX(6), .032, RZ(3)); exDark.visible = false; roomG.add(exDark);
const roomAlarm = new THREE.Mesh(new THREE.PlaneGeometry(40, 26).rotateX(-Math.PI / 2), gxGlow('#ff2a2a', 0)); roomAlarm.position.set(RX(6), .05, RZ(3)); roomAlarm.visible = false; roomG.add(roomAlarm);
const sideMark = floorMark('#ffd27a', 1.1), winMark = floorMark('#ffd27a', 1.1);
sideMark.position.set(ROOM_SIDE[0], .04, ROOM_SIDE[1]); winMark.position.set(ROOM_WIN[0], .04, ROOM_WIN[1]); sideMark.visible = winMark.visible = false;
const exHere = () => EX.on && ROOM.in && EX.door === ROOM.from;      /* inside the building the job is in */
const exOpenSpots = () => EX.spots.filter(s => !s.done && !s.out);
const exWant = () => EX.kind === 'exam' ? !EX.got : !EX.done;       /* still something to do inside */
function exSpots(){
  const pick = ROOM_DESKS.slice();
  for (const s of [EX_SP.d0, EX_SP.d1]){ const d = pick.splice((rnd() * pick.length) | 0, 1)[0]; s.x = d.x; s.z = d.z; s.desk = d; s.mark.position.set(d.x, .045, d.z); s.drawer.position.set(d.x, .6, d.tz + .32); }
  for (const s of EX_ALL){ s.done = s.lock = s.out = false; s.has = ''; markColor(s.mark, '#ff6f61'); }
  const S = EX_SP, k = EX.kind, rand = a => a[(rnd() * a.length) | 0];
  if (k === 'hw'){ EX.spots = [S.tray]; S.tray.has = 'goal'; markColor(S.tray.mark, '#4aa3ff'); }
  else if (k === 'phone'){ EX.spots = [S.box, S.tdraw]; S.box.has = 'goal'; S.box.lock = true; S.tdraw.has = 'key'; markColor(S.tdraw.mark, '#ffd24a'); }
  else if (k === 'night'){ EX.spots = [rand([S.podium, S.c1, S.c2, S.d0, S.d1]), rand([S.file, S.box]), rand([S.printer, S.shelf, S.store])]; for (const s of EX.spots){ s.has = 'item'; markColor(s.mark, '#ffd24a'); } }
  else {
    EX.spots = [S.podium, S.c1, S.c2, S.d0, S.d1, S.file, S.tdraw, S.printer, S.shelf, S.store];
    const bag = EX.spots.slice(), take = f => { const a = f ? bag.filter(f) : bag, s = rand(a); bag.splice(bag.indexOf(s), 1); return s; };
    EX.paper = take(); EX.paper.has = 'goal'; take(s => s.room !== 'O').has = 'key'; take().has = 'note'; take().has = 'snack';
  }
}
function exMarks(){
  const here = exHere(), look = here && exWant();
  for (const s of EX_ALL){ s.mark.visible = look && EX.spots.includes(s) && !s.done && !s.out; if (s.drawer) s.drawer.visible = here && EX.kind === 'exam'; }
  sideMark.visible = winMark.visible = here;
  markColor(sideMark, EX.sideOpen ? '#4fd18b' : '#ffd27a'); markColor(winMark, EX.winOpen ? '#4fd18b' : '#ffd27a');
  exKeyMark.visible = here && !!EX.keyAt;
}

/* ---------- people ---------- */
function exFig(shirt, o){
  o = o || {}; const g = new THREE.Group();
  g.add(new THREE.Mesh(npcBodyGeo, M(shirt, {roughness:.8})), new THREE.Mesh(npcHeadGeo, M(o.skin || '#d9a37c', {roughness:.7})));
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(npcLegGeo, M(o.legs || '#1f2a3c', {roughness:.8, vertexColors:true})); l.position.set(s * .09, .87, 0); g.add(l); return l; });
  if (o.cap){ box(.34, .1, .36, M(o.cap), 0, 1.79, .02, g); box(.32, .03, .16, M(o.cap), 0, 1.75, .2, g); }
  if (o.hair){ const h = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), M(o.hair, {roughness:.9})); h.position.set(0, 1.69, -.04); g.add(h); }
  if (o.glasses) box(.26, .05, .02, M('#1c1c1c'), 0, 1.64, .135, g);
  if (o.badge) box(.08, .1, .02, M('#e3b95a', {metalness:.5, roughness:.4}), .08, 1.32, .12, g);
  if (o.mop){ box(.05, 1.5, .05, M('#b08a55'), .28, .95, .25, g); box(.5, .08, .2, M('#dfe6ea'), .28, .06, .5, g); }
  g.children.forEach(m => { m.castShadow = true; }); g.scale.setScalar(o.s || 1.35); g.visible = false; roomG.add(g); return {g, legs};
}
/* what someone can see, drawn on the floor: a fan that stops at walls and shut doors (rebuilt every frame by exFan) */
const EX_RAYS = 18;
const exCone = color => {
  const g = new THREE.BufferGeometry(), idx = []; g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((EX_RAYS + 2) * 3), 3));
  for (let i = 1; i <= EX_RAYS; i++) idx.push(0, i + 1, i); g.setIndex(idx);
  const m = new THREE.Mesh(g, gxGlow(color || '#ffd24a', .2)); m.frustumCulled = false; m.visible = false; roomG.add(m); return m;
};
function exFan(m, x, z, h, fov, R){
  const p = m.geometry.attributes.position.array; p[0] = x; p[1] = .06; p[2] = z;
  for (let i = 0; i <= EX_RAYS; i++){
    const a = h - fov + 2 * fov * i / EX_RAYS, sx = Math.sin(a), cz = Math.cos(a); let d = R;
    for (let q = .5; q < R; q += .5) if (lvSolid(x + sx * q, z + cz * q)){ d = q - .3; break; }
    p[i * 3 + 3] = x + sx * d; p[i * 3 + 4] = .06; p[i * 3 + 5] = z + cz * d;
  }
  m.geometry.attributes.position.needsUpdate = true;
}
const exBang = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.excl, transparent:true, depthWrite:false, depthTest:false, color:'#ffd24a'})); s.visible = false; roomG.add(s); return s; };
TEX.zzz = makeTex(g => { g.fillStyle = '#fff'; g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 32, 34); });
const P2 = (x, z) => [RX(x), RZ(z)];
/* --- guards --- */
const GUARD_VIEW = 8.5, GUARD_FOV = .62, GUARD_RUN = 6.2, TORCH_VIEW = 12, TORCH_FOV = .36;
const GUARD_ROUTES = [
  [P2(-9, 13), P2(23, 13), P2(12.5, 8.45), P2(12.5, -5.4), P2(-12.5, -5.4), P2(-12.5, 8.45)],                           /* corridor, then round the classroom */
  [P2(20, 6), P2(20, -1.5), P2(16, -3), P2(16, -8), P2(24, -8), P2(24, -2.5), P2(20, -1.5), P2(20, 6), P2(16.5, 6), P2(22, 4.5)]   /* print room and office (night only) */
];
const mkGuard = buddy => Object.assign(exFig(buddy ? '#3b4a2a' : '#24324a', {cap:'#1a2438', badge:true}), {cone:exCone(), torch:exCone('#fff3c4'), bang:exBang(), buddy,
  x:0, z:0, h:0, state:'patrol', route:GUARD_ROUTES[0], wp:0, stun:0, catchT:0, walkT:0, side:0, alert:0, knows:0, lostT:0, lookT:0, walkMax:0, pause:0, scan:1, lx:0, lz:0, room:'C', leg:null, legStage:0, chat:0, hasKey:false, on:false});
const guards = [mkGuard(false), mkGuard(true)];
function guardShow(g, on){ g.on = on; g.g.visible = on; if (!on){ g.cone.visible = g.torch.visible = false; g.bang.visible = false; } }
/* both back on their rounds, far from the door you come in by */
function guardReset(){
  const a = guards[0], b = guards[1], night = EX.kind === 'night';
  Object.assign(a, {route:GUARD_ROUTES[0], wp:4, x:RX(12.5), z:RZ(-5.4), h:-Math.PI / 2, room:'C'});
  if (night) Object.assign(b, {route:GUARD_ROUTES[1], wp:3, x:RX(16), z:RZ(-3), h:Math.PI, room:'O'});
  else Object.assign(b, {route:GUARD_ROUTES[0], wp:1, x:ROOM_DOOR[0] + 1, z:ROOM_DOOR[1], h:Math.PI / 2, room:'H'});
  for (const g of guards) Object.assign(g, {state:'patrol', stun:0, catchT:0, side:0, alert:0, knows:0, lostT:0, lookT:0, pause:0, leg:null, chat:0});
}
function guardCall(quiet){
  if (EX.buddy) return; EX.buddy = 1; EX.callT = 2.5;
  tone('square', 740, 740, .12, .09); tone('square', 990, 990, .2, .09, .14);
  if (!quiet) toast('保安：来人啊！', '他喊了同伴，马上从走廊西头进来', 2400);
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
/* doorways between rooms: a guard going to another room walks to his side of the doorway, then through it. Guards carry keys. */
const LV_LINK = [
  {a:'H', b:'C', pa:P2(0, 11.6), pb:P2(0, 8.55)}, {a:'H', b:'P', pa:P2(20, 11.6), pb:P2(20, 8.5)},
  {a:'P', b:'O', pa:LV.doors.PO.a, pb:LV.doors.PO.b, door:'PO'}, {a:'C', b:'O', pa:LV.doors.CO.a, pb:LV.doors.CO.b, door:'CO'}
];
function exPath(ra, rb){
  const seen = {[ra]:null}, q = [ra];
  while (q.length){ const r = q.shift(); if (r === rb) break; for (const L of LV_LINK){ const o = L.a === r ? L.b : L.b === r ? L.a : ''; if (o && !(o in seen)){ seen[o] = {L, from:r}; q.push(o); } } }
  if (!(rb in seen)) return null; let step = seen[rb], first = null; while (step){ first = step; step = seen[step.from]; } return first;
}
function exGo(g, tx, tz, speed, dt){
  const ra = lvRoom(g.x, g.z) || g.room, rb = lvRoom(tx, tz) || ra; g.room = ra;
  if (ra !== rb){
    const st = exPath(ra, rb);
    if (st){
      const L = st.L, from = L.a === ra ? L.pa : L.pb, to = L.a === ra ? L.pb : L.pa;
      if (g.leg !== L){ g.leg = L; g.legStage = 0; }
      if (!g.legStage){ if (guardStep(g, from[0], from[1], speed, dt) < .5) g.legStage = 1; }
      else {
        if (L.door && !LV.doors[L.door].open){ lvDoor(L.door, true); if (L.door === 'PO') EX.poOpen = true; else EX.coOpen = true; tone('square', 300, 420, .1, .05); }
        guardStep(g, to[0], to[1], speed, dt);
      }
      return 9;
    }
  }
  g.leg = null; return guardStep(g, tx, tz, speed, dt);
}
/* how clearly this guard sees 奶娃 right now: 0 = not at all. Walls block. Crouching shortens his reach; tucked in beside furniture he has to
   be on top of you, unless he watched you duck (knows > 0). */
function guardSees(g, d, dx, dz){
  if (g.state === 'stun' || g.state === 'chat' || nw.state === 'fly') return 0;
  const night = EX.kind === 'night'; let R = (night ? TORCH_VIEW : GUARD_VIEW) + .7 * pveLevel();
  if (EX.hid && g.knows <= 0) R = 1.8; else if (EX.crouch) R *= .6;
  if (d > R) return 0;
  if (d > 1.3 && Math.abs(wgAng(Math.atan2(dx, dz), g.h)) > (night ? TORCH_FOV : GUARD_FOV)) return 0;
  if (!lvSee(g.x, g.z, nw.x, nw.z)) return 0;
  return 1 - .6 * d / R;
}
function guardSpot(g){
  g.state = 'chase'; g.lx = nw.x; g.lz = nw.z; g.lostT = 0; g.alert = 1; EX.spotted++;
  tone('square', 880, 660, .15, .08); camShake = Math.max(camShake, .25);
  if (EX.spotted === 1) toast('保安：站住！', `被看见了。跑开，拐过墙角再蹲到家具旁边；或者用水枪淋他（${TOUCH ? '「水枪」' : 'E'}）`, 3000);
  else gxCallout('被看见了！', g.buddy ? '增援保安在追你' : '保安在追你', '#ff6f61');
  if (!g.buddy && EX.kind === 'exam' && pveLevel() >= 2) guardCall();      /* tougher guards do not wait to get wet before calling */
}
function guardsTo(x, z){ for (const g of guards) if (g.on && g.state !== 'stun'){ g.state = 'chase'; g.chat = 0; g.lx = x; g.lz = z; g.lostT = 0; } }
/* a noise at (x, z) that carries r metres (less through a wall): guards on their rounds walk over, the teacher looks up, the sleeper wakes */
function exNoise(x, z, r, why, src){
  if (!exHere()) return; let heard = false; const room = lvRoom(x, z);
  for (const g of guards) if (g.on && (g.state === 'patrol' || g.state === 'look') && Math.hypot(g.x - x, g.z - z) < r * ((lvRoom(g.x, g.z) || g.room) === room ? 1 : .6)){
    g.state = 'look'; g.lx = x; g.lz = z; g.lookT = 2.2; g.walkMax = 9; g.pause = 0; g.scan = rnd() < .5 ? 1 : -1; g.alert = Math.max(g.alert, .3); heard = true;
  }
  if (TCH.on && src !== TCH && Math.hypot(TCH.x - x, TCH.z - z) < r * (room === 'O' ? 1 : .5)){ TCH.up = Math.max(TCH.up, 2.6); TCH.next = 5 + rnd() * 3; TCH.face = Math.atan2(x - TCH.x, z - TCH.z); heard = true; }      /* she turns toward the sound */
  if (NERD.on && src !== NERD && NERD.awake <= 0 && Math.hypot(NERD.x - x, NERD.z - z) < Math.min(r, 8) * (room === 'C' ? 1 : .4)) nerdWake();
  if (heard && EX.noiseT <= 0){ EX.noiseT = 2.5; tone('square', 520, 520, .08, .06); tone('square', 620, 620, .1, .06, .1); gxCallout('有人听见了', why, '#ffd24a'); }
}
/* returns true when this guard has just thrown 奶娃 out */
function updateGuard(g, dt){
  const lv = pveLevel(), night = EX.kind === 'night', dx = nw.x - g.x, dz = nw.z - g.z, dN = Math.hypot(dx, dz), see = guardSees(g, dN, dx, dz);
  g.knows = see ? 1 : Math.max(0, g.knows - dt);
  if (g.state === 'stun'){
    g.stun -= dt; g.g.rotation.y = g.h + Math.sin(g.stun * 14) * .4;
    if (rnd() < dt * 8) spawnPart('dust', g.x + (rnd() - .5) * .6, 2.2, g.z + (rnd() - .5) * .6, .3, {vy:-1.5, life:.5, op:.9, color:'#9fd8ff'});
    if (g.stun <= 0){ g.state = 'look'; g.lx = g.x; g.lz = g.z; g.lookT = 1.6; g.walkMax = 0; g.alert = Math.max(g.alert, .5); }
  } else if (g.state === 'chat'){      /* a classmate is keeping him busy */
    const p = PAL; if (Math.hypot(p.x - g.x, p.z - g.z) > 2.2) exGo(g, p.x, p.z, 3.4, dt); else { g.h = Math.atan2(p.x - g.x, p.z - g.z); g.chat -= dt; if (rnd() < dt * 1.5) spawnPart('heart', p.x, 2.6, p.z, .5, {vy:1.2, life:.8, op:1, color:'#ffd24a'}); }
    if ((g.walkMax -= dt) < -14) g.chat = 0;
    if (g.chat <= 0) g.state = 'patrol';
  } else if (g.state === 'chase'){
    if (see){ g.lx = nw.x; g.lz = nw.z; g.lostT = 0; } else g.lostT += dt;
    const far = exGo(g, g.lx, g.lz, GUARD_RUN + .3 * lv, dt);
    if (see && dN < 1.6){ g.catchT += dt; if (g.catchT > .35){ guardCaught(g); return true; } } else g.catchT = 0;
    if (!see && (far < .8 || g.lostT > 6)){ g.state = 'look'; g.lookT = 2.6; g.walkMax = 0; g.alert = .6; g.scan = rnd() < .5 ? 1 : -1; tone('square', 440, 330, .12, .05); gxCallout('跟丢了', '保安在原地找你，别动', '#4fd18b'); }
  } else {
    if (see) g.alert = Math.min(1, g.alert + dt * (EX.alarm ? 2.2 : 1.15) * (.45 + see)); else g.alert = Math.max(0, g.alert - dt * .4);
    if (g.alert >= 1) guardSpot(g);
    else if (g.state === 'look'){
      if (g.walkMax > 0 && Math.hypot(g.lx - g.x, g.lz - g.z) > .9){ exGo(g, g.lx, g.lz, 3.6, dt); g.walkMax -= dt; }
      else { g.lookT -= dt; g.h += dt * 2.4 * g.scan; if (g.lookT <= 0) g.state = 'patrol'; }
    } else if (g.pause > 0){ g.pause -= dt; g.h += dt * 2.6 * g.scan; }      /* stops and looks back over his shoulder */
    else {
      const w = g.route[g.wp];
      if (exGo(g, w[0], w[1], EX.alarm ? 3.8 : night ? 2.3 : 2.6, dt) < .4){ g.wp = (g.wp + 1) % g.route.length; if (rnd() < .3){ g.pause = 1.3; g.scan = rnd() < .5 ? 1 : -1; } }
    }
  }
  if (g.state !== 'stun') g.g.rotation.y = g.h;
  const sw = g.state === 'stun' || g.pause > 0 || g.state === 'chat' ? 0 : Math.sin(g.walkT) * .5;
  g.legs[0].rotation.x = sw; g.legs[1].rotation.x = -sw;
  g.g.position.set(g.x, 0, g.z);
  /* the cone goes from yellow to red as he gets suspicious; the mark over his head grows with it */
  const R = (night ? TORCH_VIEW : GUARD_VIEW) + .7 * lv, hot = g.state === 'chase' ? 1 : g.alert, c = night ? g.torch : g.cone;
  g.cone.visible = g.torch.visible = false; c.visible = g.state !== 'stun' && g.state !== 'chat'; if (c.visible) exFan(c, g.x, g.z, g.h, night ? TORCH_FOV : GUARD_FOV, R);
  c.material.color.setRGB(1, (night ? .95 : .82) - .6 * hot, (night ? .77 : .29) - .2 * hot); c.material.opacity = (night ? .34 : .16) + .2 * hot;
  g.bang.visible = hot > .08 && g.state !== 'stun'; g.bang.position.set(g.x, 3.3, g.z); g.bang.scale.setScalar(.7 + hot * .9); g.bang.material.color.setRGB(1, .82 - .6 * hot, .29 - .2 * hot);
  return false;
}
function guardCaught(g){
  const had = EX.got, k = EX.kind; EX.hold = 0; EX.holdKey = ''; EX.caught++; heat = Math.max(heat, 1.5);
  roomLeave(true); sfx.fail(); camShake = Math.max(camShake, .6);
  if (k === 'hw'){
    if (EX.done){ exFinish(); return; }
    exFail('作业被没收了', '带着作业被保安抓住，这次没交成。A3 门口的蓝圈可以再来'); return;
  }
  if (EX.done){ exFinish(); return; }      /* already holding everything: being thrown out is still out */
  EX.t += 10;
  if (had && k === 'exam'){
    const pod = EX_SP.podium; EX.got = false; pod.done = false; pod.out = false; pod.lock = true; pod.has = 'goal'; EX.paper = pod; markColor(pod.mark, '#ff6f61');
    toast('卷子被保安收回去了', '锁进了教室的讲台抽屉 · −10 秒。再进去，按住 F 撬 3 秒', 3400);
  } else if (had && k === 'phone'){ EX.got = false; EX.ringT = 0; EX_SP.box.done = false; toast('手机又被没收了', '放回了没收箱 · −10 秒。钥匙还在你手里', 3400); }
  else toast('被保安请出了教学楼', '−10 秒。再进去：蹲着走（Q）没有声音，停在家具旁边就能躲', 3400);
}
/* soaking a guard: he wipes his face, drops the key if he carries one, and it is what makes him call for help */
function soakGuard(g, power, info){
  if (!g.on) return;
  const t = 3.5 * (power || 1) * PVE_SOAK[pveLevel()];
  g.state = 'stun'; g.stun = t; g.catchT = 0; g.alert = 0; g.chat = 0; splashAt(g.x, 1.6, g.z); sfx.splash(); unlock('soak'); EX.spotted++;
  if (info && info.push) for (let k = 0; k < 6; k++){ const x = g.x + info.fx * .5, z = g.z + info.fz * .5; if (hitsBuilding(x, z, .45)) break; g.x = x; g.z = z; }
  if (g.hasKey){ g.hasKey = false; EX.keyAt = [g.x, g.z]; exKeyMark.position.set(g.x, .05, g.z); exKeyMark.visible = true; sfx.ding(); gx.callout('钥匙掉了！', '趁他擦脸，走过去捡', '#ffd24a'); }
  else gx.callout('淋湿了', `${g.buddy ? '增援保安' : '保安'}擦脸 ${wgSecs(t)} 秒`, '#4aa3ff');
  EX.soaks++; if (!g.buddy && EX.kind === 'exam' && EX.soaks >= (pveLevel() >= 1 ? 1 : 2)) guardCall();
}
/* --- the teacher: at her desk in the office, marking. Every few seconds she looks up and sweeps the room. --- */
const TCH = Object.assign(exFig('#b0526a', {hair:'#2a2420', glasses:true, s:1.3}), {cone:exCone(), bang:exBang(), x:RX(20), z:RZ(-6.45), h:0, on:false, up:0, next:4, warned:false, alert:0, mad:0});
TCH.legs.forEach(l => { l.visible = false; });
function tchSpot(why){
  TCH.mad = 6; TCH.alert = 0; EX.spotted++; EX.t += 5; sfx.fail(); camShake = Math.max(camShake, .4);
  toast(why || '老师：哪个班的！站住！', '她喊了保安 · −5 秒。离开她的视线', 3000); guardsTo(nw.x, nw.z);
}
function tchUpdate(dt){
  const T = TCH; if (!T.on) return;
  const dx = nw.x - T.x, dz = nw.z - T.z, d = Math.hypot(dx, dz);
  if (T.mad > 0){ T.mad -= dt; T.up = .5; T.h += wgAng(Math.atan2(dx, dz), T.h) * Math.min(1, dt * 3); }
  else if (T.up > 0){ T.up -= dt; T.h = (T.face || 0) + Math.sin(T.up * 2.2) * .55; if (T.up <= 0){ T.h = 0; T.face = 0; T.warned = false; } }
  else { T.next -= dt; if (T.next < .9 && !T.warned){ T.warned = true; tone('square', 700, 700, .06, .06); tone('square', 700, 700, .06, .06, .15); } if (T.next <= 0){ T.up = 2.4; T.next = 5 + rnd() * 3.5; tone('square', 900, 900, .1, .06); } }
  const looking = T.up > 0 || T.mad > 0; let see = 0;
  if (looking && nw.state !== 'fly'){
    const R = EX.hid ? 1.8 : EX.crouch ? 6.5 : 10.5;
    if (d < R && Math.abs(wgAng(Math.atan2(dx, dz), T.h)) < .8 && lvSee(T.x, T.z + .9, nw.x, nw.z)) see = 1 - .5 * d / R;
  }
  if (see && T.mad <= 0){ T.alert = Math.min(1, T.alert + dt * 1.7 * (.5 + see)); if (T.alert >= 1) tchSpot(); } else T.alert = Math.max(0, T.alert - dt * .6);
  T.g.position.set(T.x, -.42, T.z); T.g.rotation.set(looking ? 0 : .38, T.h, 0);
  const hot = T.mad > 0 ? 1 : T.alert, c = T.cone, warn = !looking && T.next < .9;
  c.visible = true; exFan(c, T.x, T.z, T.h, .8, 10.5);
  if (looking){ c.material.color.setRGB(1, .82 - .6 * hot, .29 - .2 * hot); c.material.opacity = .18 + .2 * hot; }
  else { c.material.color.set('#9aa3ad'); c.material.opacity = warn ? .1 + .12 * Math.abs(Math.sin(performance.now() / 70)) : .05; }
  T.bang.visible = looking && hot > .08; T.bang.position.set(T.x, 2.6, T.z); T.bang.scale.setScalar(.7 + hot * .9);
}
/* --- the cleaner: mops the corridor to and fro. The floor behind her is wet; she shouts if you run past her. --- */
const CLN = Object.assign(exFig('#4f8f8f', {hair:'#6a4a3a', mop:true, legs:'#3a4a4a'}), {x:0, z:0, dir:1, on:false, rest:0, shout:0, last:0, wet:[]});
for (let i = 0; i < 4; i++){ const m = new THREE.Mesh(new THREE.CircleGeometry(1.35, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#8fd2ff', transparent:true, opacity:.3, depthWrite:false})); m.position.y = .04; m.visible = false; roomG.add(m); CLN.wet.push({m, x:0, z:0, life:0}); }
function clnShout(why){
  if (CLN.shout > 0) return; CLN.shout = 5; tone('sawtooth', 620, 480, .25, .09); tone('sawtooth', 700, 520, .25, .09, .25);
  gxCallout('阿姨：' + why, '嗓门很大，保安听见了', '#ffd24a'); exNoise(CLN.x, CLN.z, 16, '清洁阿姨在喊', CLN);
}
function clnUpdate(dt){
  const C = CLN; if (!C.on) return; C.shout -= dt;
  if (C.rest > 0) C.rest -= dt;
  else { C.x += C.dir * 1.15 * dt; C.z = RZ(13.1) + Math.sin(C.x * .9) * .5; if (C.x > RX(23.5) || C.x < RX(3.5)){ C.dir = -C.dir; C.rest = 2; }
    if (Math.abs(C.x - C.last) > 3.2){ C.last = C.x; const w = C.wet.reduce((a, b) => a.life < b.life ? a : b); w.x = C.x - C.dir * 1.6; w.z = C.z; w.life = 15; w.m.position.set(w.x, .04, w.z); w.m.visible = true; } }
  C.g.position.set(C.x, 0, C.z); C.g.rotation.y = C.dir > 0 ? Math.PI / 2 : -Math.PI / 2; const sw = C.rest > 0 ? 0 : Math.sin(performance.now() / 160) * .35; C.legs[0].rotation.x = sw; C.legs[1].rotation.x = -sw;
  const d = Math.hypot(nw.x - C.x, nw.z - C.z), running = !EX.crouch && nw.spd > 7;
  if (d < 1.25 && d > .01){ const k = (1.25 - d) / d, x = nw.x + (nw.x - C.x) * k, z = nw.z + (nw.z - C.z) * k; if (!footBlocked(x, z)){ nw.x = x; nw.z = z; } clnShout('看着点路！'); }      /* she is in the way */
  else if (running && d < 5.5) clnShout('别跑！地刚拖过！');
  for (const w of C.wet){
    if (w.life <= 0) continue; w.life -= dt; w.m.material.opacity = .3 * Math.min(1, w.life / 3); if (w.life <= 0){ w.m.visible = false; continue; }
    if (running && nw.state === 'idle' && !nw.air && Math.hypot(nw.x - w.x, nw.z - w.z) < 1.35){      /* running on the wet floor */
      nw.state = 'flop'; nw.t = 0; sfx.thud(.7); dustBurst(nw.x, .3, nw.z, 4, 2, '#bfe6ff'); camShake = Math.max(camShake, .5);
      gxCallout('滑倒了！', '湿地上不能跑', '#4aa3ff'); exNoise(nw.x, nw.z, 13, '摔了一大跤');
    }
  }
}
/* --- the top student asleep at a desk: a noise next to him and he wakes up loudly --- */
const NERD = Object.assign(exFig('#5d6fbf', {glasses:true, hair:'#1c1c1c', s:1.25}), {x:0, z:0, on:false, awake:0, zt:0});
NERD.legs.forEach(l => { l.visible = false; });
function nerdWake(){
  NERD.awake = 8; tone('sawtooth', 500, 700, .2, .09); gxCallout('学霸：嘘——！', '把他吵醒了，他一嚷保安就来', '#ffd24a'); exNoise(NERD.x, NERD.z, 16, '学霸在抱怨', NERD);
}
function nerdUpdate(dt){
  const N = NERD; if (!N.on) return; N.awake -= dt; N.zt -= dt;
  N.g.rotation.set(N.awake > 0 ? 0 : 1.05, Math.PI, 0);
  if (N.awake <= 0 && N.zt <= 0){ N.zt = .9; spawnPart('zzz', N.x + .4, 1.6, N.z - .5, .7, {vy:1, vx:.4, life:1.4, op:1, color:'#dfe6ff'}); }
}
/* --- the classmate in the print room: for RM 15 he keeps the guard talking in the corridor --- */
const PAL = Object.assign(exFig('#e2a23b', {cap:'#b0412e', legs:'#3a4660', s:1.25}), {x:0, z:0, on:false, path:null, home:P2(17.2, 8.2)});
const PAL_OUT = [P2(20, 8.5), P2(20, 11.6), P2(16, 12.8)];
function palBack(){ PAL.path = [PAL_OUT[1], PAL_OUT[0], PAL.home]; }
function palAsk(){
  if (EX.pal){ gxCallout('同学：只能帮一回', '我的论文还没打完呢', '#e2a23b'); return; }
  const g = guards[0]; if (!g.on || g.state === 'stun' || g.state === 'chase'){ gxCallout('同学：他正追你呢', '等他消停了再说', '#e2a23b'); return; }
  const paid = money >= 15; if (paid){ money -= 15; moneyChanged(); }
  EX.pal = true; PAL.out = true; PAL.path = PAL_OUT.slice(); g.state = 'chat'; g.walkMax = 0; g.chat = paid ? 12 : 6; g.alert = 0; sfx.ding();
  toast(paid ? '同学：包在我身上' : '同学：没钱？那我只拖他一小会儿', `他去走廊缠住保安 ${paid ? 12 : 6} 秒${paid ? ' · −RM 15' : ''}`, 2800);
}
function palUpdate(dt){
  const P = PAL; if (!P.on) return;
  if (P.out && guards[0].state !== 'chat' && !(P.path && P.path.length)){ P.out = false; palBack(); }      /* the chat is over: back to the printer */
  if (P.path && P.path.length){ const w = P.path[0], dx = w[0] - P.x, dz = w[1] - P.z, L = Math.hypot(dx, dz), v = Math.min(L, 5 * dt); if (L < .2) P.path.shift(); else { P.x += dx / L * v; P.z += dz / L * v; P.g.rotation.y = Math.atan2(dx, dz); } }
  const moving = P.path && P.path.length, sw = moving ? Math.sin(performance.now() / 90) * .5 : 0; P.legs[0].rotation.x = sw; P.legs[1].rotation.x = -sw; P.g.position.set(P.x, 0, P.z);
}
const exNearPal = () => PAL.on && exHere() && !(PAL.path && PAL.path.length) && Math.hypot(nw.x - PAL.x, nw.z - PAL.z) < 2.6;
wgAddTarget(() => {
  if (!exHere()) return null;
  const out = guards.filter(g => g.on && g.state !== 'stun').map(g => ({x:g.x, z:g.z, r:.6, hit:(p, i) => soakGuard(g, p, i)}));
  if (TCH.on) out.push({x:TCH.x, z:TCH.z, r:.6, hit:() => { splashAt(TCH.x, 1.4, TCH.z); sfx.splash(); EX.t += 10; tchSpot('老师被淋了一身！'); }});
  if (CLN.on) out.push({x:CLN.x, z:CLN.z, r:.6, hit:() => { splashAt(CLN.x, 1.4, CLN.z); sfx.splash(); clnShout('谁泼的水！'); }});
  if (NERD.on) out.push({x:NERD.x, z:NERD.z, r:.6, hit:() => { splashAt(NERD.x, 1.2, NERD.z); sfx.splash(); if (NERD.awake <= 0) nerdWake(); }});
  return out;
});

/* ---------- starting, finishing ---------- */
function exStart(kind){
  const K = EX_KIND[kind], at = kind === 'exam' ? EX_START : HW_START, opts = ROOM_DOORS.filter(d => Math.hypot(d.x - at.x, d.z - at.z) > 60);
  const door = opts[(rnd() * opts.length) | 0] || ROOM_DOORS[0], dist = Math.hypot(door.x - at.x, door.z - at.z), run = prog.best.exrun | 0;
  Object.assign(EX, {on:true, kind, t:0, door, got:false, done:false, told:false, alarm:false, alarmT:0, spotted:0, caught:0, hold:0, holdKey:'', sideOpen:false, winOpen:false,
    hint:'', key:false, keyAt:null, seen:'', room:'', crouch:false, hid:false, buddy:kind === 'night' ? 2 : 0, soaks:0, callT:0, alTick:0, items:0, ringT:0, pal:false, tip:0,
    poOpen:kind !== 'exam', coOpen:kind === 'night', limit:Math.round(K.time(dist))});
  exSpots(); guardReset(); guards[0].hasKey = kind === 'phone'; exHideStart(); sfx.ding();
  const streak = run ? ` · 连胜 ${run}，奖金 +${Math.min(5, run) * 10}%` : '', n = door.name;
  gxCallout(K.name, `去 ${n} 教学楼`, K.color);
  toast(K.name, ({
    exam:`期末卷藏在 ${n} 教学楼的某个抽屉或柜子里，${EX.limit} 秒内找出来送回 A3。办公室锁着，钥匙也得找`,
    hw:`DDL 过了，老师还在办公室批卷。${EX.limit} 秒内溜进 ${n} 教学楼，趁她低头把作业塞进桌前的作业筐`,
    phone:`同学的手机被没收了，锁在 ${n} 教学楼办公室的没收箱里。钥匙：保安腰上一把（淋他会掉），老师抽屉里一把`,
    night:`${n} 教学楼熄灯了，三个房间各落了一件东西。${EX.limit} 秒内全捡回来。两个保安打着手电`
  })[kind] + streak, 5200);
}
function exHideStart(){ for (const k in EX_RING){ EX_RING[k].mark.visible = false; EX_RING[k].lbl.dead = true; } }
function exClear(){
  for (const g of guards) guardShow(g, false);
  for (const n of [TCH, CLN, NERD, PAL]){ n.on = false; n.g.visible = false; if (n.cone) n.cone.visible = false; if (n.bang) n.bang.visible = false; }
  for (const w of CLN.wet){ w.life = 0; w.m.visible = false; }
  exDark.visible = roomAlarm.visible = false; EX.crouch = EX.hid = false; EX.hold = 0; EX.holdKey = ''; exMarks(); exQ();
}
function exEnd(){ EX.rearm = EX.kind === 'exam' ? 'main' : 'side'; EX.on = false; EX.alarm = false; exClear(); missionEl.classList.remove('urgent'); }
function exFail(title, sub){
  const run = prog.best.exrun | 0; prog.best.exrun = 0; saveGame();
  sfx.fail(); toast(title, sub + (run > 1 ? ` · ${run} 连胜断了` : ''), 3200); exEnd();
}
function exFinish(){
  const k = EX.kind, K = EX_KIND[k], left = Math.max(0, EX.limit - EX.t), frac = left / EX.limit, medal = frac >= EX_MEDAL[0] ? 0 : frac >= EX_MEDAL[1] ? 1 : 2;
  const ghost = !EX.spotted && !EX.caught, run = (prog.best.exrun | 0) + 1, mult = 1 + .1 * Math.min(5, run - 1);
  prog.best.exrun = run; if (run > (prog.best.exstreak | 0)) prog.best.exstreak = run;
  const prev = prog.best[k], rec = prev == null || left > prev; if (rec) prog.best[k] = Math.round(left);
  if (k !== 'exam') prog.best.exside = (prog.best.exside | 0) + 1;      /* the blue ring moves on to the next kind of job */
  const pay = Math.round((K.pay + left * K.rate + K.bonus[medal] + (ghost ? 25 : 0)) * mult);
  sess.acts++; sess.medals++; earn(pay); saveGame(); unlock(k === 'exam' ? 'exam' : k === 'hw' ? 'hw1' : '');
  if (medal === 0) unlock('gold'); if (ghost) unlock('exghost'); if (run >= 3) unlock('exrun3'); if (Object.keys(EX_KIND).every(q => prog.best[q] != null)) unlock('exall');
  const next = medal ? ` · 再快 ${Math.ceil(EX.limit * EX_MEDAL[medal - 1] - left)} 秒就是${GX_MEDAL[medal - 1]}` : '';
  toast(`${GX_MEDAL[medal]} · ${K.name}`, `剩 ${Math.round(left)} 秒${rec && prev != null ? ' · 新纪录' : ''}${ghost ? ' · 没被发现 +25' : ''}${run > 1 ? ` · ${run} 连胜 ×${mult.toFixed(1)}` : ''} · +RM ${pay}${next}`, 4800);
  gxCallout(GX_MEDAL[medal], (ghost ? '神不知鬼不觉 · ' : '') + (run > 1 ? `${run} 连胜` : K.name), ['#e3b95a', '#b8c2cc', '#c98a55'][medal]);
  for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09);
  const p = driving || nw; for (let i = 0; i < 10; i++) spawnPart('dust', p.x + (rnd() - .5) * 5, p.y + 2 + rnd() * 3, p.z + (rnd() - .5) * 5, .8, {vy:2.5, life:1.6, op:1, color:'#fff6d8'});
  exEnd();
}

/* ---------- going in and out ---------- */
function exQ(){ const b = actQ.querySelector('b'), t = exHere() ? (EX.crouch ? '起身' : '蹲下') : '撩头'; if (b.textContent !== t) b.textContent = t; }
/* the job's building has just been entered: doors, people, marks */
function exSetup(){
  const k = EX.kind, night = k === 'night';
  lvDoor('PO', EX.poOpen); lvDoor('CO', EX.coOpen);
  guardReset(); guardShow(guards[0], true); guardShow(guards[1], EX.buddy === 2);
  TCH.on = !night; TCH.g.visible = TCH.on; Object.assign(TCH, {up:0, next:4 + rnd() * 3, warned:false, alert:0, mad:0, h:0, face:0});
  CLN.on = !night; CLN.g.visible = CLN.on; Object.assign(CLN, {x:RX(9 + rnd() * 10), z:RZ(13.1), dir:rnd() < .5 ? 1 : -1, rest:0, shout:0}); CLN.last = CLN.x;
  PAL.on = !night; PAL.g.visible = PAL.on; PAL.x = PAL.home[0]; PAL.z = PAL.home[1]; PAL.path = null; PAL.out = false; PAL.g.rotation.y = Math.PI / 2;
  NERD.on = !night;
  if (NERD.on){      /* a desk that is not being searched, away from the door */
    const free = ROOM_DESKS.filter(d => d !== EX_SP.d0.desk && d !== EX_SP.d1.desk), d = NERD.desk && free.includes(NERD.desk) && NERD.runT === EX.limit + EX.door.name ? NERD.desk : free[(rnd() * free.length) | 0];
    NERD.desk = d; NERD.runT = EX.limit + EX.door.name; NERD.x = d.x; NERD.z = d.tz + .75; NERD.awake = 0; NERD.g.position.set(d.x, -.3, d.tz + .62);
  }
  NERD.g.visible = NERD.on; exDark.visible = night; roomAlarm.visible = EX.alarm;
  for (const g of guards) if (g.on) updateGuard(g, 0);
  tchUpdate(0); clnUpdate(0); palUpdate(0); exMarks(); exQ();
  const sneak = `${TOUCH ? '点「蹲下」' : '按 Q '}蹲着走没声音，停在家具旁边就是躲起来`;
  toast(`进了 ${EX.door.name} 教学楼`, ({
    exam:EX.paper && EX.paper.lock ? '卷子锁在教室的讲台抽屉里，按住 F 撬 3 秒。警报还在响' : `按住 ${TOUCH ? '「翻找」' : 'F '}翻带红圈的地方，三个房间都有。黄色扇形是保安的视野；${sneak}`,
    hw:`作业筐在办公室老师桌前（穿过打印室）。她抬头的时候别在扇形里；${sneak}`,
    phone:`没收箱在办公室东北角。先弄到钥匙：淋保安，或者翻老师的抽屉；${sneak}`,
    night:`黄圈是落下的东西，三个房间各一件。别进手电的光；${sneak}`
  })[k], 4600);
}
{ const base = roomEnter; roomEnter = function(door){ base(door); if (EX.on && EX.door === door) exSetup(); else exClear(); }; }
{ const base = roomLeave; roomLeave = function(quiet){ const was = ROOM.in; base(quiet); if (was) exClear(); }; }
/* out through the main door, the side door or the window: each lets you out at a different spot along the wall, with a different welcome */
function exLeaveBy(way){
  const d = ROOM.from, job = exHere(); roomLeave();
  if (d && way !== 'door'){
    const side = way === 'side' ? 1 : -1, px = Math.cos(d.h) * side, pz = -Math.sin(d.h) * side;
    for (const L of [16, 12, 8]){ const x = d.x + Math.sin(d.h) * 4 + px * L, z = d.z + Math.cos(d.h) * 4 + pz * L; if (!footBlocked(x, z)){ nw.x = x; nw.z = z; break; } }
  }
  if (way === 'win'){ nw.state = 'fly'; nw.t = 0; nw.y = groundAt(nw.x, nw.z) + 4.5; nw.vy = 5; nw.spin = 0; nw.vx = d ? Math.sin(d.h) * 4 : 0; nw.vz = d ? Math.cos(d.h) * 4 : 0; sfx.boing(); }
  if (!job) return;
  if (EX.kind !== 'exam'){ if (EX.done) exFinish(); return; }
  if (EX.got && !EX.told){
    EX.told = true;
    if (way === 'door'){ heat = Math.max(heat, 3.2); gxCallout('正门外全是保安', '三星警戒！把卷子送回 A3', '#ff6f61'); }
    else if (way === 'side'){ heat = Math.max(heat, 2.2); gxCallout('从侧门溜出来了', '两星 · 把卷子送回 A3', '#ffd24a'); }
    else { heat = Math.max(heat, 1.2); gxCallout('跳窗！', '没人知道你从哪走的 · 把卷子送回 A3', '#4fd18b'); }
  }
}
const exNearExit = () => !exHere() ? '' : Math.hypot(nw.x - ROOM_SIDE[0], nw.z - ROOM_SIDE[1]) < 2.4 ? 'side' : Math.hypot(nw.x - ROOM_WIN[0], nw.z - ROOM_WIN[1]) < 2.4 ? 'win' : '';
function exNearSpot(){
  if (!exHere() || !exWant()) return null;
  let best = null, bd = 2.7;
  for (const s of EX.spots) if (!s.done && !s.out){ const d = Math.hypot(nw.x - s.x, nw.z - s.z); if (d < bd && lvSee(nw.x, nw.z, s.x + (nw.x - s.x) * .3, s.z + (nw.z - s.z) * .3)){ bd = d; best = s; } }
  return best;
}
/* what holding F does where 奶娃 stands: {key, label, btn, need (seconds), noise (metres it carries)} */
function exHoldTarget(){
  const e = exNearExit();
  if (e === 'side' && !EX.sideOpen) return {key:'side', label:'拉开侧门的门闩', btn:'开门闩', need:1.2, noise:5.5};
  if (e === 'win' && !EX.winOpen) return {key:'win', label:'撬开窗户', btn:'开窗', need:1.5, noise:5.5};
  const s = exNearSpot(); if (!s) return null;
  if (s.has === 'item') return {key:s.id, spot:s, label:'捡起落下的东西', btn:'捡起', need:1, noise:0};
  if (s.id === 'tray') return {key:s.id, spot:s, label:'把作业塞进作业筐', btn:'塞作业', need:2, noise:0};
  if (s.id === 'box') return EX.key ? {key:s.id, spot:s, label:'打开没收箱', btn:'开箱', need:1.5, noise:0} : {key:'', spot:s, label:'', btn:'', need:0, noise:0, locked:'没收箱锁着 · 钥匙在保安腰上，或者老师的抽屉里'};
  if (s.id === 'tdraw') return {key:s.id, spot:s, label:'悄悄翻老师的抽屉', btn:'翻找', need:2.2, noise:0};
  if (s.lock) return {key:s.id, spot:s, label:'撬开讲台抽屉', btn:'撬锁', need:3, noise:9};
  return {key:s.id, spot:s, label:'翻' + s.name, btn:'翻找', need:1.3, noise:5.5};
}
function exAlarmOn(){
  EX.alarm = true; EX.alarmT = 0; roomAlarm.visible = true; camShake = Math.max(camShake, .5);
  guardsTo(nw.x, nw.z); guardCall(true);
}
function exGotKey(what){ EX.key = true; EX.keyAt = null; exKeyMark.visible = false; sfx.sparkle(); gxCallout('拿到钥匙了', what, '#ffd24a'); for (const s of EX.spots) if (s.has === 'key'){ s.has = ''; if (EX.kind === 'phone') s.done = true; } exMarks(); }
function exDo(h){
  if (h.key === 'side'){ EX.sideOpen = true; sfx.ding(); gxCallout('门闩开了', '侧门随时能走', '#4fd18b'); exMarks(); return; }
  if (h.key === 'win'){ EX.winOpen = true; sfx.ding(); gxCallout('窗户开了', '随时能跳', '#4fd18b'); exMarks(); return; }
  const s = h.spot, k = EX.kind, what = s.has; s.done = true; s.lock = false; s.has = '';
  if (k === 'hw'){ EX.done = true; sfx.sparkle(); gxCallout('塞进去了！', '悄悄溜出教学楼就算完成', '#4aa3ff'); }
  else if (k === 'phone' && what === 'goal'){ EX.got = EX.done = true; EX.ringT = 3.5; sfx.sparkle(); gxCallout('手机到手！', '它马上要响 · 先走远，再出楼', '#4aa3ff'); }
  else if (k === 'night'){ EX.items++; sfx.sparkle(); EX.done = EX.items >= 3; gxCallout(['水杯', '充电宝', '雨伞'][EX.items - 1] + '捡到了', EX.done ? '三件齐了 · 出楼' : `还差 ${3 - EX.items} 件`, '#ffd24a'); }
  else if (what === 'key'){ exGotKey(k === 'phone' ? '没收箱的钥匙 · 老师没发现' : '办公室的钥匙'); return; }
  else if (what === 'goal'){
    EX.got = true; sfx.sparkle(); gxCallout('卷子到手！', '警报响了 · 选一个出口', '#ff6f61'); exAlarmOn();
    toast('全楼警报！', `增援从走廊西头进来。教室的${EX.sideOpen ? '侧门开着' : '侧门要拉门闩'}，${EX.winOpen ? '窗户开着' : '窗户要撬'}，正门外有巡逻车`, 3800);
  } else if (what === 'note'){
    EX.hint = EX.paper.room; for (const q of EX.spots) if (!q.done && q.room !== EX.hint && q.has !== 'key') q.out = true;
    for (const q of EX.spots) if (!q.done && !q.out) markColor(q.mark, '#ffd24a');
    sfx.ding(); gxCallout('找到一张纸条', `「卷子在${LV.rooms[EX.hint].name}」`, '#ffd24a');
  } else if (what === 'snack'){ earn(8); tone('triangle', 660, 990, .15, .1); gxCallout('同学藏的零花钱', '+RM 8 · 卷子不在这', '#e3b95a'); }
  else { tone('square', 240, 180, .12, .06); gxCallout('空的', `还有 ${exOpenSpots().length} 处没翻`, '#b8c2cc'); }
  exMarks();
}
/* F: the job's own doors, people and spots first, then the plain way out */
{ const base = roomTryF; roomTryF = function(){
    if (mode !== 'naiwa' || driving) return false;
    if (!exHere()) return base();
    const e = exNearExit();
    if (e === 'side' && EX.sideOpen){ exLeaveBy('side'); return true; }
    if (e === 'win' && EX.winOpen){ exLeaveBy('win'); return true; }
    if (exNearPal()){ palAsk(); return true; }
    const h = exHoldTarget(); if (h) return true;          /* F is held here; the press itself does nothing else */
    if (nearExit()){ exLeaveBy('door'); return true; }
    return false;
  }; }
function exCrouch(on){
  if (EX.crouch === on) return; EX.crouch = on; if (!on) EX.hid = false;
  tone('sine', on ? 420 : 300, on ? 300 : 420, .08, .05); exQ();
}

/* ---------- per frame ---------- */
let exShots = 0;
/* one frame of a job inside its building; returns the label for the F button */
function exInside(dt){
  let fl = ''; const k = EX.kind, room = lvRoom(nw.x, nw.z) || EX.room;
  if (room !== EX.room){ EX.room = room; if (LV.rooms[room] && !EX.seen.includes(room)){ EX.seen += room; if (room !== 'H') gxCallout(LV.rooms[room].name, '', '#dfe6ea'); } }
  /* reinforcements through the main door */
  if (EX.buddy === 1){
    EX.callT -= dt;
    if (EX.callT <= 0){
      EX.buddy = 2; const b = guards[1]; guardShow(b, true); Object.assign(b, {state:'chase', x:ROOM_DOOR[0] + .6, z:ROOM_DOOR[1], room:'H', side:0, lx:nw.x, lz:nw.z, lostT:0, alert:1, stun:0, leg:null});
      tone('square', 880, 660, .15, .08); gx.callout('增援到了', '第二个保安从走廊西头进来了', '#ff6f61');
    }
  }
  /* doors: the office key opens the print-room door; the classroom door opens from the office side */
  let doorMsg = '';
  { const d = LV.doors.PO; if (!d.open && Math.hypot(nw.x - d.x, nw.z - d.z) < 2.6){ if (EX.key || nw.z < d.z){ lvDoor('PO', true); EX.poOpen = true; sfx.ding(); gxCallout('门开了', '教师办公室', '#4fd18b'); } else doorMsg = '办公室锁着 · 钥匙藏在别的房间'; } }
  { const d = LV.doors.CO; if (!d.open && Math.hypot(nw.x - d.x, nw.z - d.z) < 2.6){ if (nw.x > d.x){ lvDoor('CO', true); EX.coOpen = true; sfx.ding(); gxCallout('门开了', '从这里回教室', '#4fd18b'); } else doorMsg = '这扇门从办公室那边锁着'; } }
  /* crouching: tucked in beside furniture and not moving = hidden */
  EX.desk = null;
  if (EX.crouch){ let bd = 3.2; for (const d of LV.cover){ const q = Math.hypot(nw.x - d.x, nw.z - d.z); if (q < bd){ bd = q; EX.desk = d; } } }
  const hid = !!EX.desk && nw.spd < .5; if (hid && !EX.hid) tone('sine', 300, 220, .1, .05); EX.hid = hid;
  /* noise: running, laughing, the water gun */
  if (!EX.crouch && nw.spd > 7){ EX.runT += dt; if (EX.runT > .35){ EX.runT = 0; exNoise(nw.x, nw.z, 7.5, '跑步的声音'); } }
  if (nw.state === 'laugh' && nw.t < .1) exNoise(nw.x, nw.z, 14, '笑声');
  if (WG.shots !== exShots){ exShots = WG.shots; if (EX.crouch) exCrouch(false); exNoise(nw.x, nw.z, 11, '水枪的声音'); }
  if (EX.ringT > 0 && (EX.ringT -= dt) <= 0){ for (let i = 0; i < 4; i++) tone('square', 1200, 1500, .12, .09, i * .2); gxCallout('手机响了！', '全楼都听见了', '#ff6f61'); exNoise(nw.x, nw.z, 15, '手机铃声'); }
  if (EX.keyAt && Math.hypot(nw.x - EX.keyAt[0], nw.z - EX.keyAt[1]) < 1.6) exGotKey('保安掉的那把');
  tchUpdate(dt); clnUpdate(dt); nerdUpdate(dt); palUpdate(dt);
  for (const g of guards) if (g.on && updateGuard(g, dt)) return '';
  if (!exHere()) return '';
  let hot = TCH.on && TCH.mad <= 0 ? TCH.alert : 0; for (const g of guards) if (g.on && g.state !== 'chase' && g.state !== 'stun') hot = Math.max(hot, g.alert);
  const tick = Math.floor(hot * 4); if (tick > EX.alTick) tone('square', 500 + tick * 90, 500 + tick * 90, .06, .06); EX.alTick = tick;
  if (EX.alarm){
    EX.alarmT += dt; roomAlarm.visible = true; roomAlarm.material.opacity = .05 + .05 * Math.sin(EX.alarmT * 8);
    if (Math.floor(EX.alarmT / .9) !== Math.floor((EX.alarmT - dt) / .9)){ tone('square', 880, 880, .2, .04); tone('square', 660, 660, .2, .04, .22); }
  }
  /* holding F: search, pry, unbolt, open */
  const h = exHoldTarget(), holding = h && h.need && (keys.KeyF || keys.Enter || actF.classList.contains('on'));
  if (holding){
    if (EX.holdKey !== h.key){ EX.holdKey = h.key; EX.hold = 0; if (h.noise) exNoise(nw.x, nw.z, h.noise, h.spot ? '翻东西的声音' : '门窗的声音'); }
    EX.hold += dt; if (Math.floor(EX.hold * 5) !== Math.floor((EX.hold - dt) * 5)) tone('square', 300 + EX.hold / h.need * 400, 300 + EX.hold / h.need * 400, .05, .05);
    if (EX.hold >= h.need){ EX.hold = 0; EX.holdKey = ''; exDo(h); }
  } else { EX.hold = Math.max(0, EX.hold - dt * 2); if (!EX.hold) EX.holdKey = ''; }
  const e = exNearExit(), key = TOUCH ? '' : 'F ', out = k === 'exam' ? EX.got : EX.done;
  if (h && h.locked) roomPrompt = h.locked;
  else if (h){ roomPrompt = `按住 ${TOUCH ? '「' + h.btn + '」' : 'F '}${h.label} · ${Math.min(100, Math.round(EX.hold / h.need * 100))}%`; fl = h.btn; }
  else if (exNearPal()){ roomPrompt = EX.pal ? '同学：只能帮一回' : `按 ${key}找同学帮忙 · ${money >= 15 ? 'RM 15，他缠住保安 12 秒' : '没钱也帮，缠住 6 秒'}`; fl = '帮忙'; }
  else if (e === 'side'){ roomPrompt = `按 ${key}从侧门出去`; fl = '侧门'; }
  else if (e === 'win'){ roomPrompt = `按 ${key}跳窗 · 会摔一跤，但没人看见`; fl = '跳窗'; }
  else if (nearExit()){ roomPrompt = `按 ${key}从正门出去` + (k === 'exam' && EX.got ? ' · 门外有巡逻车' : ''); fl = '出门'; }
  else if (doorMsg) roomPrompt = doorMsg;
  else if (EX.hid) roomPrompt = '躲好了 · 走到跟前才看得见你';
  else if (hot > .2) roomPrompt = '被注意到了！离开扇形，或者蹲到家具旁边';
  else if (EX.crouch) roomPrompt = '蹲着走没有声音 · 停在家具旁边就是躲起来';
  else if (out) roomPrompt = k === 'exam' ? '带着卷子出去：走廊西头的正门，或者教室的侧门、窗户' : '得手了 · 回走廊西头的绿圈出去';
  else if ((EX.tip += dt) < 16) roomPrompt = `${TOUCH ? '「蹲下」' : 'Q '}蹲下 · 别跑，会被听见 · 扇形是别人的视野`;
  else roomPrompt = '';
  return fl;
}
function exUpdate(dt, px, pz){
  EX.t += dt;
  const k = EX.kind, K = EX_KIND[k], left = EX.limit - EX.t, here = exHere(), T = Math.max(0, Math.ceil(left)), n = EX.door.name;
  if (left <= 0){ if (ROOM.in) roomLeave(true); exFail(K.name + '失败', '时间到。A3 门口的光圈可以再来'); return; }
  let line;
  if (!here) line = k === 'exam' && EX.got ? '把卷子送回 A3' : exWant() ? `去 ${n} 教学楼` : '';
  else if (k === 'hw') line = EX.done ? '交了 · 溜出去' : '作业筐在办公室老师桌前';
  else if (k === 'phone') line = EX.done ? '手机到手 · 溜出去' : EX.key ? '钥匙有了 · 开没收箱（办公室）' : '先弄钥匙：淋保安 / 翻老师抽屉';
  else if (k === 'night') line = EX.done ? '三件齐了 · 溜出去' : `捡东西 ${EX.items}/3`;
  else if (EX.got) line = '卷子到手 · 找出口';
  else if (EX.paper && EX.paper.lock) line = '撬开教室的讲台抽屉';
  else line = EX.hint ? `卷子在${LV.rooms[EX.hint].name}${EX.hint === 'O' && !EX.key && !EX.poOpen ? ' · 先找钥匙' : ''} · 还有 ${exOpenSpots().length} 处` : `找期末卷 · 还有 ${exOpenSpots().length} 处没翻`;
  missionEl.textContent = `${T} 秒 · ${line} · ${K.name}`;
  missionEl.classList.toggle('urgent', left < 15);
  if (k === 'exam' && EX.got && !ROOM.in && Math.hypot(px - EX_START.x, pz - EX_START.z) < 8) exFinish();
}
function exFrame(dt, px, pz){
  EX.noiseT -= dt;
  /* the door of the job's building glows in the job's colour */
  for (const d of ROOM_DOORS) d.mark.userData.ring.material.color.set(EX.on && EX.door === d && exWant() ? EX_KIND[EX.kind].color : '#ffd27a');
  /* the two start rings at A3 */
  const show = !EX.on && !ROOM.in && !mission.on && !gxA.act && !gxTaxi.on && !gx.extBusy();
  for (const id in EX_RING){
    const R = EX_RING[id]; R.mark.visible = show; R.lbl.dead = !show; if (!show) continue;
    if (id === 'side'){ const t = '委托 · ' + EX_KIND[exSideKind()].name; if (R.lbl.el.textContent !== t) R.lbl.el.textContent = t; }
    R.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    const d = Math.hypot(px - R.at.x, pz - R.at.z);
    if (EX.rearm === id){ if (d > 14) EX.rearm = ''; }
    else if (d < 6.5){ exStart(id === 'main' ? 'exam' : exSideKind()); break; }
  }
  if (EX.on) exUpdate(dt, px, pz);
}

/* ---------- hook into the game loop ---------- */
ROOM.hook = (dt, fl) => exHere() ? exInside(dt) : fl;
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); exFrame(dt, px, pz); },
    busy(){ return base.busy() || EX.on; },
    extBusy(){ return base.extBusy() || EX.on; },
    target(){
      if (!EX.on) return base.target();
      if (!ROOM.in) return exWant() ? {x:EX.door.x, z:EX.door.z, label:EX.door.name + ' 教学楼'} : {x:EX_START.x, z:EX_START.z, label:'A3 · 交回卷子'};
      if (!exHere()) return {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'出门'};
      if (EX.keyAt) return {x:EX.keyAt[0], z:EX.keyAt[1], label:'钥匙'};
      if (exWant()){ let best = null, bd = 1e9; for (const s of exOpenSpots()){ if (s.id === 'box' && !EX.key) continue; const d = Math.hypot(s.x - nw.x, s.z - nw.z); if (d < bd){ bd = d; best = s; } } if (best) return {x:best.x, z:best.z, label:best.name}; }
      let ex = {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'正门'}, bd = Math.hypot(ROOM_DOOR[0] - nw.x, ROOM_DOOR[1] - nw.z);
      for (const [p, label, open] of [[ROOM_SIDE, '侧门', EX.sideOpen], [ROOM_WIN, '窗户', EX.winOpen]]){ const d = Math.hypot(p[0] - nw.x, p[1] - nw.z); if (open && d < bd){ bd = d; ex = {x:p[0], z:p[1], label}; } }
      return ex;
    },
    mini(dot){
      base.mini(dot);
      if (ROOM.in){
        if (!exHere()) return;
        if (exWant()) for (const s of exOpenSpots()) dot(s.x, s.z, s.mark.material.color.getStyle(), 4);
        dot(ROOM_SIDE[0], ROOM_SIDE[1], EX.sideOpen ? '#4fd18b' : '#ffd27a', 4); dot(ROOM_WIN[0], ROOM_WIN[1], EX.winOpen ? '#4fd18b' : '#ffd27a', 4);
        for (const g of guards) if (g.on) dot(g.x, g.z, g.state === 'chase' ? '#ff3b30' : '#24324a', 5);
        if (TCH.on) dot(TCH.x, TCH.z, '#b0526a', 5); if (CLN.on) dot(CLN.x, CLN.z, '#4f8f8f', 4); if (PAL.on) dot(PAL.x, PAL.z, '#e2a23b', 4); if (NERD.on) dot(NERD.x, NERD.z, '#5d6fbf', 4);
        if (EX.keyAt) dot(EX.keyAt[0], EX.keyAt[1], '#ffd24a', 5);
        return;
      }
      if (EX.on){ const back = EX.kind === 'exam' && EX.got; dot(back ? EX_START.x : EX.door.x, back ? EX_START.z : EX.door.z, EX_KIND[EX.kind].color, 9); }
      else if (!mission.on && !gxA.act && !gxTaxi.on){ dot(EX_START.x, EX_START.z, '#ff6f61', 7); dot(HW_START.x, HW_START.z, '#4aa3ff', 7); }
    },
    onBust(){ if (EX.on){ if (ROOM.in) roomLeave(true); exFail(EX_KIND[EX.kind].name + '失败', '被保安抓了，东西也被收走了'); } base.onBust(); },
    leave(){ if (EX.on){ if (ROOM.in) roomLeave(true); exEnd(); } EX.rearm = ''; exHideStart(); base.leave(); }
  });
}
/* crouching: Q / the 撩头 button toggles it, jumping stands up, moving is slow and silent, 奶娃 is squashed and slides in beside the furniture when hidden */
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
    if (EX.desk && EX.slide > .02){ NW.root.position.x += (EX.desk.x - nw.x) * .55 * EX.slide; NW.root.position.z += (EX.desk.z - nw.z) * .55 * EX.slide; }
  }; }
exHideStart();
