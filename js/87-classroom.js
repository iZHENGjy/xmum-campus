/* XMUM 校园漫游 · 能进去的教室、「抢救期末卷」、水枪
 *
 * 教室：A1 / A2 / A4 / A5 门口各有一个入口，按 F 进去。教室是一间单独搭在地图外（z = -1600）
 *   的屋子，没有屋顶，镜头从上往下看，像娃娃屋；进门时把奶娃传送进去，出门再传送回那栋楼门口。
 * 抢救期末卷：A3 门口的红圈开始。保安把期末卷锁进某栋楼教室的讲台抽屉，限时冲进去，
 *   按住 F 撬开抽屉（CS 拆弹那样，要按满 4 秒，被抓住就前功尽弃），拿到卷子送回 A3。
 *   教室里有一个巡逻的保安，离得近会追你，被他抓住会被请出教室。
 * 水枪：步行时按 E（手机点「水枪」）。淋到巡逻车，车停下来擦玻璃 4 秒；淋到教室保安，他擦脸 3.5 秒。
 *   一箱 6 发，自己慢慢回满。车行里的「水枪工坊」能升级射程、水压、水箱、回水和高压水炮（js/80-gta.js 的 WUPG）。
 *   别的文件用 wgAddTarget(getter) 注册能被淋的东西：getter 返回 [{x, z, hit(power)}]，fireWater 统一自动瞄准。
 * 对手强度（pveLevel，0–3）：教室保安被淋了会喊同伴，第二个保安从门口进来一起追；等级越高喊得越早、跑得越快、擦脸越快。
 */
'use strict';
/* ---------- the classroom (built once, far outside the campus) ---------- */
const ROOM = {in:false, ox:0, oz:-1600, W:28, D:20, H:4.2, from:null, keep:null};
const roomG = new THREE.Group(); roomG.visible = false; scene.add(roomG);
const ROOM_DOOR = [ROOM.ox, ROOM.oz + ROOM.D / 2 - 1.6];            /* the exit spot just inside the door */
const ROOM_SPAWN = [ROOM.ox + 2.5, ROOM.oz + 3];                     /* where you stand after walking in: an aisle, clear of the desks */
const ROOM_PODIUM = [ROOM.ox + 4.5, ROOM.oz - ROOM.D / 2 + 2.6];
let roomBoard = null;
(() => {
  const {ox, oz, W, D, H} = ROOM, add = m => { roomG.add(m); return m; };
  const wood = M('#9c7350', {roughness:.8}), wall = M('#efe7d6'), wallLow = M('#b9ae99'), tile = M('#d9d3c7');
  add(box(W + 40, .2, D + 40, tile, ox, -.09, oz, roomG)).castShadow = false;           /* corridor around the room (just above the grass) */
  add(box(W, .2, D, wood, ox, -.08, oz, roomG)).castShadow = false;                      /* classroom floor, top at y = .02 */
  const wallAt = (w, d, x, z) => { box(w, H, d, wall, x, H / 2, z, roomG); box(w + .02, .9, d + .02, wallLow, x, .45, z, roomG); addBox(x, z, w / 2, d / 2, 0); };
  wallAt(W + .8, .4, ox, oz - D / 2);          /* front: blackboard */
  wallAt(W + .8, .4, ox, oz + D / 2);          /* back: the door */
  wallAt(.4, D, ox - W / 2, oz); wallAt(.4, D, ox + W / 2, oz);
  /* windows on the side walls */
  const glass = M('#a9d4ee', {roughness:.15, metalness:.1});
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) box(.06, 1.6, 3.2, glass, ox + s * (W / 2 - .23), 2.4, oz + i * 6, roomG);
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
  const board = add(new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({map:tex, roughness:.9})));
  board.position.set(ox, 2.5, oz - D / 2 + .23);
  box(12.4, .14, .3, M('#8a6a45'), ox, .95, oz - D / 2 + .3, roomG);
  /* door on the back wall */
  box(2.4, 3, .1, M('#7a4a2a', {roughness:.6}), ox, 1.5, oz + D / 2 - .25, roomG);
  box(1.4, .5, .06, M('#2f8f5a', {emissive:'#2f8f5a', emissiveIntensity:.6}), ox, 3.35, oz + D / 2 - .3, roomG);
  /* podium with the locked drawer */
  box(2.6, 1.15, 1.1, M('#8a5a36', {roughness:.6}), ROOM_PODIUM[0], .575, ROOM_PODIUM[1], roomG);
  box(.9, .3, .05, M('#c9a24a', {metalness:.4, roughness:.4}), ROOM_PODIUM[0], .75, ROOM_PODIUM[1] + .56, roomG);
  addBox(ROOM_PODIUM[0], ROOM_PODIUM[1], 1.3, .55, 0);
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
    addBox(x, z + .25, .95, .75, 0);
  }
  for (const im of [deskTop, deskLeg, chair]){ im.castShadow = im.receiveShadow = true; add(im); }
})();
/* indoor markers are flat glowing circles on the floor: the outdoor light beams would poke out of the roofless room */
function floorMark(color, r){
  const m = new THREE.Mesh(new THREE.RingGeometry(r * .62, r, 40).rotateX(-Math.PI / 2), gxGlow(color, .75));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r * .62, 40).rotateX(-Math.PI / 2), gxGlow(color, .18)); m.add(fill);
  m.userData.ring = m; roomG.add(m); return m;
}
const roomExitMark = floorMark('#4fd18b', 1.3), podiumMark = floorMark('#ff6f61', 1.4); podiumMark.visible = false;
roomExitMark.position.set(ROOM_DOOR[0], .04, ROOM_DOOR[1] + .2);
podiumMark.position.set(ROOM_PODIUM[0], .04, ROOM_PODIUM[1] + 1.4);

/* ---------- doors outside the teaching buildings ---------- */
const ROOM_DOORS = ['A1', 'A2', 'A4', 'A5'].map(n => {
  const info = infos.find(i => i.name === n); const p = info && frontPoint(info); if (!p) return null;
  const mark = gxMarker('#ffd27a', .45); mark.position.set(p[0], .1, p[1]);
  const lbl = addLabel(n + ' 教室', p[0], 4.2, p[1], true); lbl.dead = true;
  return {name:n, x:p[0], z:p[1], h:Math.atan2(p[0] - info.wx, p[1] - info.wz), mark, lbl};
}).filter(Boolean);

/* ---------- the guards in the classroom during 抢救期末卷: one patrols, a second one comes in when the first calls for help ---------- */
const mkGuard = buddy => {
  const g = new THREE.Group(), navy = buddy ? '#3b4a2a' : '#24324a';
  const body = new THREE.Mesh(npcBodyGeo, M(navy, {roughness:.8})), head = new THREE.Mesh(npcHeadGeo, M('#d9a37c', {roughness:.7}));
  const cap = box(.34, .1, .36, M('#1a2438'), 0, 1.79, .02, g), brim = box(.32, .03, .16, M('#1a2438'), 0, 1.75, .2, g);
  const badge = box(.08, .1, .02, M('#e3b95a', {metalness:.5, roughness:.4}), .08, 1.32, .12, g);
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(npcLegGeo, M('#1f2a3c', {roughness:.8, vertexColors:true})); l.position.set(s * .09, .87, 0); g.add(l); return l; });
  g.add(body, head); g.children.forEach(m => { m.castShadow = true; });
  g.scale.setScalar(1.35); g.visible = false; roomG.add(g);
  return {g, legs, buddy, x:0, z:0, h:0, state:'patrol', wp:0, stun:0, catchT:0, walkT:0, seen:false, side:0, _unused:[cap, brim, badge]};
};
const guards = [mkGuard(false), mkGuard(true)], guard = guards[0];
const GUARD_WP = [[-12, -6], [12, -6], [12, 7.5], [-12, 7.5]].map(([x, z]) => [ROOM.ox + x, ROOM.oz + z]);
const PVE_SOAK = [1, .85, .7, .6];   /* how long a soaking lasts at each opponent level */
function guardReset(){
  Object.assign(guards[0], {x:GUARD_WP[0][0], z:GUARD_WP[0][1], h:0, state:'patrol', wp:1, stun:0, catchT:0, seen:false});
  Object.assign(guards[1], {x:ROOM_DOOR[0], z:ROOM_DOOR[1], h:Math.PI, state:'patrol', wp:3, stun:0, catchT:0, seen:true});
  guards[1].g.visible = false; EX.buddy = 0; EX.soaks = 0; EX.callT = 0;
}
/* the first guard shouts for a colleague, who walks in through the door a moment later */
function guardCall(){
  if (EX.buddy) return; EX.buddy = 1; EX.callT = 2.5;
  tone('square', 740, 740, .12, .09); tone('square', 990, 990, .2, .09, .14);
  toast('保安：来人啊！', '他喊了同伴，马上从门口进来。水枪留一发给他', 2400);
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

/* ---------- 抢救期末卷 ---------- */
const EX_START = (() => { const i = infos.find(x => x.name === 'A3 百姓大楼'); const p = i && frontPoint(i); return p ? {x:p[0], z:p[1]} : {x:1180, z:520}; })();
const exMark = gxMarker('#ff6f61', 1); exMark.position.set(EX_START.x, .1, EX_START.z);
const exLbl = addLabel('抢救期末卷', EX_START.x, 7.5, EX_START.z, true);
const EX = {on:false, phase:'', t:0, limit:0, door:null, pry:0, got:false, rearm:false, told:false, buddy:0, soaks:0, callT:0};
const PRY_S = 4;
GX_MORE.push({id:'exam', name:'抢救期末卷', fmt:v => `最多剩 ${Math.round(v)} 秒`});
function exStart(){
  const opts = ROOM_DOORS.filter(d => { const dd = Math.hypot(d.x - EX_START.x, d.z - EX_START.z); return dd > 60; });
  const door = opts[(rnd() * opts.length) | 0] || ROOM_DOORS[0];
  const dist = Math.hypot(door.x - EX_START.x, door.z - EX_START.z);
  Object.assign(EX, {on:true, phase:'go', t:0, limit:Math.round(dist * 2 / 12 + 50), door, pry:0, got:false, told:false});
  exMark.visible = false; exLbl.dead = true; guardReset(); sfx.ding();
  gxCallout('抢救期末卷', `卷子锁在 ${door.name} 教室`, '#ff6f61');
  toast('抢救期末卷', `保安把期末卷锁进了 ${door.name} 教室的讲台抽屉，${EX.limit} 秒后就要交到教务处。冲进去撬开抽屉，把卷子送回 A3！`, 4200);
}
function exEnd(){ EX.on = false; EX.phase = ''; EX.rearm = true; podiumMark.visible = false; for (const g of guards) g.g.visible = false; missionEl.classList.remove('urgent'); }
function exFail(title, sub){ sfx.fail(); toast(title, sub, 2800); exEnd(); }
function exFinish(){
  const left = Math.max(0, EX.limit - EX.t), frac = left / EX.limit;
  const medal = frac >= .4 ? 0 : frac >= .2 ? 1 : frac > 0 ? 2 : 3;
  const prev = prog.best.exam, rec = prev == null || left > prev;
  if (rec) prog.best.exam = Math.round(left);
  const pay = Math.round(35 + left * .8) + (medal < 3 ? [30, 15, 5][medal] : 0);
  sess.acts++; if (medal < 3) sess.medals++;
  earn(pay); saveGame(); unlock('exam');
  if (medal === 0) unlock('gold');
  toast(medal < 3 ? `${GX_MEDAL[medal]} · 期末卷保住了` : '期末卷保住了', `还剩 ${Math.round(left)} 秒${rec && prev != null ? ' · 新纪录！' : ''} · +RM ${pay}`, 3600);
  if (medal < 3){ gxCallout(GX_MEDAL[medal], '期末卷保住了', ['#e3b95a', '#b8c2cc', '#c98a55'][medal]); for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09); }
  for (let i = 0; i < 10; i++) spawnPart('dust', EX_START.x + (rnd() - .5) * 5, 2 + rnd() * 3, EX_START.z + (rnd() - .5) * 5, .8, {vy:2.5, life:1.6, op:1, color:'#fff6d8'});
  exEnd();
}

/* ---------- entering / leaving ---------- */
function roomEnter(door){
  ROOM.in = true; ROOM.from = door; ROOM.keep = {dist:camDist, pitch:camPitch};
  roomBoard(door.name + ' 教室');
  nw.x = ROOM_SPAWN[0]; nw.z = ROOM_SPAWN[1]; nw.y = 0; nw.h = Math.PI; nw.air = false; camYaw = 0;
  camDist = 10; camPitch = 1.0;   /* look down over the 4.2 m walls; js/90-main.js skips wall collision indoors */ roomG.visible = true; mini.style.visibility = 'hidden';
  if (EX.on && EX.door === door && !EX.got){ guard.g.visible = true; guards[1].g.visible = EX.buddy === 2; podiumMark.visible = true; }
  sfx.ding(); toast(`进了 ${door.name} 教室`, EX.on && EX.door === door && !EX.got ? '讲台抽屉在前面，小心巡逻的保安' : '走到门口的绿圈按 F 出去');
}
function roomLeave(quiet){
  if (!ROOM.in) return;
  const d = ROOM.from; ROOM.in = false; roomG.visible = false; mini.style.visibility = '';
  if (ROOM.keep){ camDist = ROOM.keep.dist; camPitch = ROOM.keep.pitch; }
  if (d){ nw.x = d.x + Math.sin(d.h) * 2; nw.z = d.z + Math.cos(d.h) * 2; nw.h = d.h; camYaw = d.h + Math.PI; }
  nw.y = 0; for (const g of guards) g.g.visible = false; podiumMark.visible = false;
  if (!quiet) sfx.ding();
}
const nearDoor = () => !driving && !ROOM.in && ROOM_DOORS.find(d => Math.hypot(nw.x - d.x, nw.z - d.z) < 3.2);
const nearExit = () => ROOM.in && Math.hypot(nw.x - ROOM_DOOR[0], nw.z - ROOM_DOOR[1]) < 2.6;
const nearPodium = () => ROOM.in && EX.on && EX.door === ROOM.from && !EX.got && Math.hypot(nw.x - ROOM_PODIUM[0], nw.z - ROOM_PODIUM[1]) < 2.6;
/* called first by doF() in js/90-main.js; true means F was used here */
function roomTryF(){
  if (mode !== 'naiwa' || driving) return false;
  const d = nearDoor(); if (d){ roomEnter(d); return true; }
  if (nearExit()){
    roomLeave();
    if (EX.on && EX.got && !EX.told){ EX.told = true; heat = Math.max(heat, 2.5); toast('保安发现卷子没了', '快把卷子送回 A3！', 2400); }
    return true;
  }
  return nearPodium();          /* F on the podium is held to pry; the press itself does nothing else */
}

/* ---------- water gun ---------- */
const WG = {ammo:6, max:6, regen:0, cd:0, el:$('#water')};
achAdd([['wg1', '水枪改装', '在水枪工坊升级一次', 20], ['wgmax', '水枪大师', '水枪工坊全部升到满级', 150]]);
/* what the workshop upgrades (WUPG in js/80-gta.js) add up to */
function wgStat(){
  const u = prog.up;
  return {range:16 + 3.5 * (u.wr || 0), power:(1 + .3 * (u.wp || 0)) * (u.wx >= 2 ? 1.4 : 1), max:6 + 2 * (u.wt || 0), regen:1.6 * Math.pow(.75, u.wg || 0),
    multi:u.wx >= 1 ? 3 : 1, push:u.wx >= 2};
}
function wgRefresh(fill){ WG.max = wgStat().max; WG.ammo = fill ? WG.max : Math.min(WG.ammo, WG.max); wgShow(); }
function wgShow(){
  if (!WG.el) return;
  const t = WG.max <= 8 ? '●'.repeat(WG.ammo) + '○'.repeat(WG.max - WG.ammo) : `● ${WG.ammo} / ${WG.max}`;
  if (WG.el.textContent !== t) WG.el.textContent = t;
}
/* Anything that can be soaked registers a getter here. The getter is called on every shot and returns the targets that
   exist right now: [{x, z, hit(power)}]. power is 1 for the stock gun and grows with the 水压 / 高压水炮 upgrades
   (a second argument {push, fx, fz} tells the target whether the jet should also shove it, and which way). */
const WG_TARGETS = [];
function wgAddTarget(getter){ if (typeof getter === 'function') WG_TARGETS.push(getter); }
function fireWater(){
  if (mode !== 'naiwa' || gx.paused || driving || nw.state === 'fly') return;
  if (WG.cd > 0) return;
  if (WG.ammo < 1){ tone('square', 220, 160, .08, .05); toast('水枪没水了', '等几秒会自己回满', 1200); return; }
  const st = wgStat();
  WG.ammo--; WG.cd = .35; WG.regen = 0; wgShow();
  /* aim assist: turn toward the nearest target in front, so it works with one thumb */
  const cand = [];
  for (const get of WG_TARGETS){
    let list = null; try { list = get(); } catch (e){ list = null; }
    if (!list) continue;
    for (const t of list){
      if (!t || typeof t.hit !== 'function') continue;
      const dx = t.x - nw.x, dz = t.z - nw.z, d = Math.hypot(dx, dz); if (!(d <= st.range) || d < .1) continue;
      const a = Math.atan2(dx, dz), da = Math.atan2(Math.sin(a - nw.h), Math.cos(a - nw.h));
      if (Math.abs(da) < 1.6) cand.push({t, d, a});      /* anything in the front half counts */
    }
  }
  cand.sort((p, q) => p.d - q.d);
  const best = cand[0];
  if (best) nw.h = best.a;
  const fx = Math.sin(nw.h), fz = Math.cos(nw.h), reach = st.range / 16;
  /* 散射喷头: the jet fans out and also soaks the next targets inside the fan */
  const hits = best ? [best] : [];
  if (best && st.multi > 1) for (const c of cand){
    if (hits.length >= st.multi) break;
    if (c !== best && Math.abs(Math.atan2(Math.sin(c.a - nw.h), Math.cos(c.a - nw.h))) < .75) hits.push(c);
  }
  const fan = st.multi > 1 ? 7 : 1.6, n = st.multi > 1 ? 24 : 16;
  for (let i = 0; i < n; i++){
    const s = (16 + rnd() * 8) * reach, side = (rnd() - .5) * fan;
    spawnPart('dust', nw.x + fx * 1.1, nw.y + 1.4, nw.z + fz * 1.1, (.35 + rnd() * .25) * (st.push ? 1.5 : 1) * (1 + .2 * (st.power - 1)),
      {vx:fx * s + fz * side, vy:2.5 + rnd() * 2, vz:fz * s - fx * side, g:16 / reach, life:(.55 + rnd() * .25) * Math.min(1.5, reach), op:.95, grow:.6, color:st.push ? '#b9e4ff' : '#7cc7ff'});
  }
  noise(.22, st.push ? .24 : .16, st.push ? 1800 : 3200, 'highpass'); if (st.push) tone('sine', 150, 60, .2, .18);
  camShake = Math.max(camShake, .05 + .06 * (st.power - 1) + (st.push ? .2 : 0));      /* recoil: a stronger gun kicks harder */
  for (const c of hits) setTimeout(() => { try { c.t.hit(st.power, {push:st.push, fx:Math.sin(c.a), fz:Math.cos(c.a)}); } catch (e){ console.warn(e); } }, Math.min(400, c.d * 25));
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
  g.state = 'stun'; g.stun = t; g.catchT = 0; splashAt(g.x, 1.6, g.z); sfx.splash(); unlock('soak');
  if (info && info.push) for (let k = 0; k < 6; k++){ const x = g.x + info.fx * .5, z = g.z + info.fz * .5; if (hitsBuilding(x, z, .45)) break; g.x = x; g.z = z; }
  gx.callout('淋湿了', `${g.buddy ? '增援保安' : '保安'}擦脸 ${wgSecs(t)} 秒`, '#4aa3ff');
  /* soaking him is what makes him call for help: on the second soaking at first, on the first one once the opponents have levelled up */
  EX.soaks++; if (!g.buddy && EX.soaks >= (pveLevel() >= 1 ? 1 : 2)) guardCall();
}
/* soaked cars and guards are skipped, so the next shot goes to one that is still coming */
wgAddTarget(() => ROOM.in ? null : patrols.filter(c => c.active && c !== driving && !(c.soakT > 0)).map(c => ({x:c.x, z:c.z, hit:(p, i) => soakCar(c, p, i)})));
wgAddTarget(() => ROOM.in ? guards.filter(g => g.g.visible && g.state !== 'stun').map(g => ({x:g.x, z:g.z, hit:(p, i) => soakGuard(g, p, i)})) : null);
window.addEventListener('keydown', e => {
  if (e.code !== 'KeyE' || e.repeat || mode !== 'naiwa' || e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
  ac(); fireWater();
});
{ const b = $('#act-w'); if (b) holdBtn(b, () => fireWater()); }

/* ---------- per-frame ---------- */
let roomPrompt = '', fLabel = '';
function setFLabel(t){
  if (t === fLabel) return; fLabel = t;
  if (t) actF.querySelector('b').textContent = t; else updateActs();
}
function roomUpdate(dt, px, pz){
  roomPrompt = '';
  WG.cd -= dt;
  if (WG.ammo < WG.max){ WG.regen += dt; if (WG.regen > wgStat().regen){ WG.regen = 0; WG.ammo++; } }
  wgShow();
  for (const c of patrols) if (c.soakT > 0 && c.active && rnd() < dt * 6) spawnPart('dust', c.x + (rnd() - .5) * 2, 1.6, c.z + (rnd() - .5) * 2, .4, {vy:-1, life:.6, op:.8, color:'#9fd8ff'});
  /* doors outside */
  const busyOther = mission.on || gxA.act || gxTaxi.on;
  for (const d of ROOM_DOORS){
    const target = EX.on && EX.door === d && !EX.got;
    d.mark.visible = !ROOM.in; d.lbl.dead = ROOM.in || Math.hypot(px - d.x, pz - d.z) > 140;
    d.mark.userData.ring.material.color.set(target ? '#ff6f61' : '#ffd27a');
    d.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 300) * .15;
  }
  const nd = nearDoor();
  if (nd) roomPrompt = (TOUCH ? '点「进门」' : '按 F ') + `进 ${nd.name} 教室`;
  /* 抢救期末卷 start ring */
  const showStart = !EX.on && !busyOther && !ROOM.in;
  exMark.visible = showStart; exLbl.dead = !showStart;
  if (showStart){
    exMark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    const d = Math.hypot(px - EX_START.x, pz - EX_START.z);
    if (EX.rearm){ if (d > 14) EX.rearm = false; }
    else if (d < 6.5) exStart();
  }
  /* inside */
  if (ROOM.in){
    roomExitMark.scale.setScalar(1 + Math.sin(performance.now() / 300) * .08);
    if (nearExit()) roomPrompt = (TOUCH ? '点「出门」' : '按 F ') + '出门';
    if (EX.on && EX.door === ROOM.from && !EX.got){
      if (EX.buddy === 1){ EX.callT -= dt; if (EX.callT <= 0){ EX.buddy = 2; const b = guards[1]; b.g.visible = true; b.state = 'chase'; b.x = ROOM_DOOR[0]; b.z = ROOM_DOOR[1]; b.side = 0;   /* right at the door: one step further in is a desk */ tone('square', 880, 660, .15, .08); gx.callout('增援到了', '第二个保安进门了', '#ff6f61'); } }
      for (const g of guards) if (g.g.visible && updateGuard(g, dt)) break;
    }
  }
  if (EX.on) exUpdate(dt, px, pz);
  setFLabel(nd ? '进门' : nearExit() ? '出门' : nearPodium() ? '撬抽屉' : '');
}
/* returns true when this guard has just thrown 奶娃 out */
function updateGuard(g, dt){
  const dN = Math.hypot(nw.x - g.x, nw.z - g.z), prying = EX.pry > 0 && nearPodium(), lv = pveLevel();
  if (g.state === 'stun'){
    g.stun -= dt; g.g.rotation.y = g.h + Math.sin(g.stun * 14) * .4;
    if (rnd() < dt * 8) spawnPart('dust', g.x + (rnd() - .5) * .6, 2.2, g.z + (rnd() - .5) * .6, .3, {vy:-1.5, life:.5, op:.9, color:'#9fd8ff'});
    if (g.stun <= 0) g.state = g.buddy ? 'chase' : 'patrol';
  } else {
    if (g.buddy || dN < 6.5 || (prying && dN < 14)){
      if (g.state !== 'chase'){
        g.state = 'chase'; if (!g.seen){ g.seen = true; toast('保安：站住！', '他在追你，用水枪淋他（E）', 1800); } tone('square', 880, 660, .15, .08);
        if (!g.buddy && lv >= 2) guardCall();      /* tougher guards do not wait to get wet before calling */
      }
    }
    else if (g.state === 'chase' && dN > 11) g.state = 'patrol';
    if (g.state === 'chase'){
      guardStep(g, nw.x, nw.z, (g.buddy ? 5.6 : 5.2) + .3 * lv, dt);
      if (dN < 1.5){ g.catchT += dt; if (g.catchT > .5){ guardCaught(); return true; } } else g.catchT = 0;
    } else {
      const w = GUARD_WP[g.wp]; if (guardStep(g, w[0], w[1], 2.4, dt) < .4) g.wp = (g.wp + 1) % GUARD_WP.length;
    }
    g.g.rotation.y = g.h;
  }
  const sw = g.state === 'stun' ? 0 : Math.sin(g.walkT) * .5;
  g.legs[0].rotation.x = sw; g.legs[1].rotation.x = -sw;
  g.g.position.set(g.x, 0, g.z);
  return false;
}
function guardCaught(){
  EX.pry = 0; heat = Math.max(heat, 1.5);
  roomLeave(true); sfx.fail();
  toast('被保安请出了教室', '抽屉没撬开，进度清零。再进去试试，记得先用水枪淋他', 2800);
  guardReset();
}
function exUpdate(dt, px, pz){
  EX.t += dt;
  const left = EX.limit - EX.t;
  if (left <= 0){ if (ROOM.in) roomLeave(true); exFail('期末卷交到教务处了', '时间到，没抢救成功。A3 门口的红圈可以再来'); return; }
  if (!EX.got){
    if (nearPodium()){
      const hold = keys.KeyF || keys.Enter || actF.classList.contains('on');
      if (hold){ EX.pry += dt; if (Math.floor(EX.pry * 4) !== Math.floor((EX.pry - dt) * 4)) tone('square', 300 + EX.pry * 120, 300 + EX.pry * 120, .05, .05); }
      roomPrompt = `${TOUCH ? '按住「撬抽屉」' : '按住 F'} 撬开抽屉 · ${Math.min(100, Math.round(EX.pry / PRY_S * 100))}%`;
      if (EX.pry >= PRY_S){
        EX.got = true; podiumMark.visible = false; sfx.sparkle();
        gxCallout('卷子到手！', '快出门，送回 A3', '#ff6f61');
      }
    }
    missionEl.textContent = `${Math.ceil(left)} 秒 · 抢救期末卷 · ${ROOM.in && EX.door === ROOM.from ? `撬抽屉 ${Math.round(EX.pry / PRY_S * 100)}%` : `去 ${EX.door.name} 教室`}`;
  } else {
    missionEl.textContent = `${Math.ceil(left)} 秒 · 抢救期末卷 · ${ROOM.in ? '出门' : '把卷子送回 A3'}`;
    if (!ROOM.in && Math.hypot(px - EX_START.x, pz - EX_START.z) < 8){ exFinish(); return; }
  }
  missionEl.classList.toggle('urgent', left < 15);
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
      if (EX.on){
        if (!EX.got) return ROOM.in && EX.door === ROOM.from ? {x:ROOM_PODIUM[0], z:ROOM_PODIUM[1], label:'讲台抽屉'} : ROOM.in ? {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'出门'} : {x:EX.door.x, z:EX.door.z, label:EX.door.name + ' 教室'};
        return ROOM.in ? {x:ROOM_DOOR[0], z:ROOM_DOOR[1], label:'出门'} : {x:EX_START.x, z:EX_START.z, label:'A3 · 交回卷子'};
      }
      return base.target();
    },
    mini(dot){
      base.mini(dot);
      if (EX.on) dot(EX.got ? EX_START.x : EX.door.x, EX.got ? EX_START.z : EX.door.z, '#ff6f61', 9);
      else if (!mission.on && !gxA.act && !gxTaxi.on) dot(EX_START.x, EX_START.z, '#ff6f61', 7);
      for (const d of ROOM_DOORS) if (!(EX.on && EX.door === d)) dot(d.x, d.z, '#ffd27a', 4);
    },
    onBust(){ roomLeave(true); if (EX.on) exFail('期末卷没保住', '被保安抓了，卷子也被收走了'); base.onBust(); },
    leave(){ roomLeave(true); if (EX.on) exEnd(); EX.rearm = false; exMark.visible = false; exLbl.dead = true; for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; } setFLabel(''); base.leave(); }
  });
}
exMark.visible = false; exLbl.dead = true; for (const d of ROOM_DOORS){ d.mark.visible = false; d.lbl.dead = true; }
wgRefresh(true);
