/* XMUM 校园漫游 · 奶娃彩蛋：音乐岛旁的秋千、树林里的猴子、「猴子大战」
 *
 * 秋千：音乐岛西边、树林边的草坪上。走过去按 F 坐上去，按住空格（手机按住「荡」，或者按住画面）越荡越高，
 *   荡到前面最高点松手就飞出去，落地算一次特技；飞得越远分越高。幅度不够时松手只是接着荡，再按 F 下来。
 * 猴子：校园树林西北角的小山是猴山，平时住着几只。步行或慢车靠近，会有一只冲过来抢东西：正在送外卖就抢外卖，
 *   否则掏走一点钱。它抱着东西跑，十来秒后上树；这之前用水枪淋它（E）或者凑近大笑（R），东西就掉回来。
 *   淋了一只，别的猴子会围上来扔果子反击；对手强度（pveLevel）越高，围上来的越多，还会有淋一枪赶不走的猴王。
 *   在树林别处偶尔也会有一两只从树上跳下来捣乱。开快车冲过去它们会自己跳开。
 * 猴子大战：猴山东边山脚的棕色光圈，下车走进去开始。限时把一群猴子全赶跑，抢回 3 袋外卖。
 *
 * 接入方式和 js/87-classroom.js 一样：包一层 gx 的钩子；F 键靠包装 roomTryF；另外包装了 footAction、updateFoot、
 *   animNaiwa、updateMission（都是先做自己的事再调原函数）。猴子通过 wgAddTarget 注册成水枪目标。
 */
'use strict';
achAdd([['swing', '荡秋千', '在音乐岛旁的秋千上荡起来', 10], ['swingfar', '秋千飞人', '从秋千上飞出 30 米', 60],
  ['monkey1', '猴口夺食', '从猴子手里把东西抢回来', 20], ['monkeywar', '猴山大王', '打赢一场猴子大战', 80]]);
GX_MORE.push({id:'swing', name:'秋千飞人', fmt:v => `${Math.round(v)} 米`}, {id:'monkey', name:'猴子大战', fmt:v => `最多剩 ${Math.round(v)} 秒`});
const smLv = () => typeof pveLevel === 'function' ? pveLevel() : 0;
let smPrompt = '';

/* ================================================================== the swing ================================================================== */
const SW_MIN = .5, SW_MAX = 1.32, SW_SIT = .62, SW_PUMP = .4;   /* launch needs this much swing (rad) · most it can swing · seat to 奶娃's feet · push while held */
const SW = {x:-26, z:-58, h:1.18, H:5, L:3.6, G:16, th:0, om:0, on:false, was:false, skip:false, ptr:false, ptrId:-1, lx:0, ly:0, mv:0, fly:null, said:false, cam:null};
const swFx = Math.sin(SW.h), swFz = Math.cos(SW.h);
const swG = new THREE.Group(), swPivot = new THREE.Group();
(() => {
  swG.position.set(SW.x, 0, SW.z); swG.rotation.y = SW.h; scene.add(swG); swPivot.position.y = SW.H; swG.add(swPivot);
  clearArea(SW.x, SW.z, 7, 7);
  const wood = '#8a5a36', dark = '#6b4226', parts = [], feet = [], H = SW.H + .1;
  for (const sx of [-1, 1]){
    for (const sz of [-1, 1]) parts.push(geoTint(rodGeo(.14, .1, [sx * 2.05, 0, sz * 1.5], [sx * 1.75, H, 0], 7), wood));
    parts.push(geoTint(rodGeo(.07, .07, [sx * 1.94, 1.9, .95], [sx * 1.94, 1.9, -.95], 6), dark));
    parts.push(geoTint(new THREE.SphereGeometry(.17, 7, 5).translate(sx * 2.05, H, 0), dark));
    for (const sz of [-1, 1]){ const lx = sx * 2.05, lz = sz * 1.5; feet.push([SW.x + lx * Math.cos(SW.h) + lz * Math.sin(SW.h), SW.z - lx * Math.sin(SW.h) + lz * Math.cos(SW.h)]); }
  }
  parts.push(geoTint(geoAt(new THREE.CylinderGeometry(.12, .12, 4.1, 8), 0, H, 0, 0, 0, Math.PI / 2), dark));
  const frame = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.85})); frame.castShadow = frame.receiveShadow = true; swG.add(frame);
  const hang = [geoTint(new THREE.BoxGeometry(1.45, .08, .44).translate(0, -SW.L, 0), '#c98a55')];
  for (const sx of [-1, 1]) hang.push(geoTint(new THREE.CylinderGeometry(.025, .025, SW.L, 5).translate(sx * .58, -SW.L / 2, 0), '#e2d3aa'));
  const seat = new THREE.Mesh(geoMerge(hang), M('#ffffff', {vertexColors:true, roughness:.8})); seat.castShadow = true; swPivot.add(seat);
  /* a worn patch of earth under the seat */
  const patch = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20).rotateX(-Math.PI / 2), flatMat('#a98a62', 3)); patch.scale.set(.7, 1, 1.5); patch.position.y = .04; patch.receiveShadow = true; swG.add(patch);
  addLabel('秋千', SW.x, 6.6, SW.z, true);
  /* Collision: only the four feet, so 奶娃 can walk in under the beam. They go into MAP.wall (cars and walking) and not into
     the building colliders, because the follow camera pulls in for those and a thin post should not yank the camera around. */
  const wall = MAP.wall;
  MAP.wall = (x, z, r) => (wall ? wall(x, z, r) : false) || (Math.abs(x - SW.x) < 5 + r && Math.abs(z - SW.z) < 5 + r && feet.some(f => Math.hypot(f[0] - x, f[1] - z) < .25 + r));
})();
const swAmp = () => Math.acos(Math.max(-1, Math.min(1, 1 - (.5 * SW.om * SW.om * SW.L / SW.G + 1 - Math.cos(SW.th)))));   /* how high it would reach, from its energy */
const swNear = () => mode === 'naiwa' && !driving && !SW.on && !ROOM.in && (nw.state === 'idle' || nw.state === 'laugh' || nw.state === 'pose') && !nw.air && Math.hypot(nw.x - SW.x, nw.z - SW.z) < 3.6;
function swPhys(dt, pump){
  let acc = -(SW.G / SW.L) * Math.sin(SW.th) - (pump ? .03 : SW.on ? .16 : .55) * SW.om;
  if (pump){ if (Math.abs(SW.om) < .12 && Math.abs(SW.th) < .08) SW.om = .75; else acc += Math.sign(SW.om) * SW_PUMP; }   /* push off the ground, then pump with the swing */
  const th0 = SW.th;
  SW.om += acc * dt; SW.th += SW.om * dt;
  if (Math.abs(SW.th) > SW_MAX){ SW.th = Math.sign(SW.th) * SW_MAX; if (SW.om * SW.th > 0) SW.om = 0; }
  if (th0 * SW.th < 0 && Math.abs(SW.om) > 1.3) noise(.3, Math.min(.1, Math.abs(SW.om) * .03), 700);   /* whoosh through the bottom */
  swPivot.rotation.x = -SW.th;
}
/* 奶娃's feet hang on the line of the ropes, a little below the seat, so leaning the body by -th keeps it on the seat */
function swPlace(){
  const R = SW.L + SW_SIT, s = Math.sin(SW.th) * R;
  nw.x = SW.x + swFx * s; nw.z = SW.z + swFz * s; nw.y = SW.H - Math.cos(SW.th) * R; nw.h = SW.h; nw.spd = 0; nw.air = false;
}
function swSit(){
  Object.assign(SW, {on:true, th:0, om:0, was:!!keys.Space, skip:true, ptr:false});
  nw.state = 'swing'; nw.t = 0; swPlace(); sfx.boing();
  SW.cam = camDist; camDist = Math.max(camDist, 12); camYaw = SW.h + Math.PI - .95;      /* three-quarter view from behind */
}
function swOff(){
  if (!SW.on) return; SW.on = false; SW.ptr = false;
  if (nw.state === 'swing'){ nw.state = 'idle'; nw.x = SW.x + swFx * 1.7; nw.z = SW.z + swFz * 1.7; nw.y = groundAt(nw.x, nw.z); }
  if (SW.cam){ camDist = SW.cam; SW.cam = null; }
}
function swLaunch(){
  const A = swAmp(), q = Math.max(0, Math.min(1, SW.th / A));      /* 1 = let go right at the front top */
  const k = (A - SW_MIN) / (SW_MAX - SW_MIN), sp = (9 + 21 * k) * (.45 + .55 * q), el = .72;
  swPlace(); SW.on = false; SW.ptr = false; if (SW.cam){ camDist = SW.cam; SW.cam = null; }
  nw.vx = swFx * sp * Math.cos(el); nw.vz = swFz * sp * Math.cos(el); nw.vy = sp * Math.sin(el); nw.spin = 0; nw.state = 'fly'; nw.t = 0;
  SW.fly = {x:SW.x, z:SW.z, best:q > .85 && k > .55}; SW.om = -1.6;
  sfx.boing(); tone('sine', 300, 900, .35, .12);
  if (SW.fly.best){ gxCallout('完美脱手！', '最高点松的手', '#ffc93c'); if (!REDUCED) gxSlow = .6; }
  else if (q < .3) gxCallout('松早了', '荡到前面最高点再松手', '#ff8a3d');
}
function swLanded(){
  const f = SW.fly; SW.fly = null;
  const d = Math.round(Math.hypot(nw.x - f.x, nw.z - f.z)), prev = prog.best.swing, rec = prev == null || d > prev, wet = nw.state !== 'flop';
  if (rec){ prog.best.swing = d; saveGame(); }
  camShake = Math.max(camShake, Math.min(1.6, d / 22));
  addStunt('秋千飞人', Math.round(60 + d * 14) + (f.best ? 150 : 0));
  gxCallout(`飞了 ${d} 米`, wet ? '一头扎进湖里' : rec && prev != null ? '新纪录！' : prev != null ? `纪录 ${Math.round(prev)} 米` : '秋千飞人', '#ffc93c');
  if (d >= 30) unlock('swingfar');
}
/* called instead of the normal walking update while 奶娃 is on the seat */
function swFoot(dt){
  nw.t += dt;
  const held = !!keys.Space || SW.ptr;
  if (SW.was && !held){ if (SW.skip) SW.skip = false; else if (swAmp() >= SW_MIN){ swLaunch(); return; } }
  if (held && !SW.was) SW.skip = false;
  SW.was = held;
  swPhys(dt, held);
  if (!SW.said && swAmp() > .7){ SW.said = true; unlock('swing'); }
  swPlace();
}
function swUpdate(dt){
  if (!SW.on) swPhys(dt, false);
  if (SW.fly && nw.state !== 'fly') swLanded();
  if (SW.on){
    const n = Math.max(0, Math.min(6, Math.round(swAmp() / SW_MAX * 6))), bar = '▮'.repeat(n) + '▯'.repeat(6 - n), key = TOUCH ? '「荡」' : '空格';
    smPrompt = swAmp() < SW_MIN ? `按住${key}越荡越高 ${bar}` + (TOUCH ? '' : ' · F 下来') : TOUCH ? `${bar} 最高点松手，飞出去！` : `${bar} 荡到前面最高点松开空格，飞出去！`;
  } else if (swNear()) smPrompt = (TOUCH ? '点「坐秋千」' : '按 F ') + '坐秋千' + (prog.best.swing != null ? ` · 最远飞过 ${Math.round(prog.best.swing)} 米` : '');
  /* touch button captions */
  const want = SW.on ? '下来' : swNear() ? '坐秋千' : '', fb = actF.querySelector('b'), sb = actSp.querySelector('b');
  if (want){ if (fb.textContent !== want) fb.textContent = want; SW.lbl = true; } else if (SW.lbl){ SW.lbl = false; updateActs(); }
  if (SW.on){ if (sb.textContent !== '荡') sb.textContent = '荡'; } else if (sb.textContent === '荡') updateActs();
}
/* holding the picture also pumps (a drag is a camera turn, and letting go after a drag does not launch) */
canvas.addEventListener('pointerdown', e => { if (!SW.on || SW.ptr || mode !== 'naiwa') return; SW.ptr = true; SW.ptrId = e.pointerId; SW.lx = e.clientX; SW.ly = e.clientY; SW.mv = 0; });
window.addEventListener('pointermove', e => {
  if (!SW.ptr || e.pointerId !== SW.ptrId) return;
  SW.mv += Math.abs(e.clientX - SW.lx) + Math.abs(e.clientY - SW.ly); SW.lx = e.clientX; SW.ly = e.clientY;
  if (SW.mv > 16){ SW.ptr = false; if (!keys.Space) SW.skip = true; }
});
{ const up = e => { if (e.pointerId === SW.ptrId) SW.ptr = false; }; window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); }

/* ================================================================== monkeys ================================================================== */
const MK_HILL = {x:-188, z:-175, r:75}, MK_START = {x:-149, z:-158}, MK_N = TOUCH ? 8 : 10;
const MK = {pool:[], fruits:[], homes:[], war:null, loot:null, raidCd:6, anger:0, rage:0, slow:0, hitCd:0, throwCd:0, roamT:22, rearm:false, told:false, lx:0, lz:0, pvx:0, pvz:0, prev:''};
const mkMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.9, flatShading:true});
const mkMatBig = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.9, flatShading:true, color:'#b4927a'});
const mkSph = (r, col, x, y, z, sx, sy, sz, ws, hs) => geoTint(geoAt(new THREE.SphereGeometry(r, ws || 7, hs || 5), x, y, z, 0, 0, 0, sx || 1, sy || 1, sz || 1), col);
/* a sitting macaque about 1 m tall: one merged body, two arms that swing from the shoulders */
const mkBodyGeo = (() => {
  const fur = '#93714d', dk = '#6f5338', face = '#e9b79c', pale = '#d8c3a1', p = [];
  p.push(mkSph(.26, fur, 0, .44, 0, 1, 1.2, .95), mkSph(.2, pale, 0, .42, .13, .8, 1, .6), mkSph(.19, fur, 0, .9, .04), mkSph(.12, face, 0, .87, .17, 1, .95, .7), mkSph(.07, face, 0, .82, .25, 1.1, .8, .8));
  for (const s of [-1, 1]) p.push(mkSph(.07, face, s * .19, .93, .02, .5, 1, 1), mkSph(.026, '#1c1410', s * .065, .92, .215, 1, 1, 1, 5, 4), mkSph(.14, dk, s * .18, .16, .06, 1, 1, 1.5),
    geoTint(new THREE.BoxGeometry(.1, .06, .2).translate(s * .2, .03, .28), dk));
  const tail = new THREE.CatmullRomCurve3([[0, .22, -.2], [0, .3, -.48], [0, .62, -.62], [0, .92, -.52], [0, .98, -.38]].map(a => new THREE.Vector3(a[0], a[1], a[2])));
  p.push(geoTint(new THREE.TubeGeometry(tail, 8, .035, 5), dk));
  return geoMerge(p);
})();
const mkArmGeo = geoMerge([geoTint(nwCapsule(.06, .05, .34, 6, 2), '#6f5338'), mkSph(.065, '#4f3a29', 0, -.38, 0)]);
const mkBagGeo = new THREE.BoxGeometry(.32, .3, .22).translate(0, .15, 0), mkFruitGeo = new THREE.SphereGeometry(.17, 6, 5);
for (let i = 0; i < MK_N; i++){
  const g = new THREE.Group(), body = new THREE.Mesh(mkBodyGeo, mkMat); body.castShadow = true; g.add(body); g.rotation.order = 'YXZ';
  const arms = [-1, 1].map(s => { const a = new THREE.Mesh(mkArmGeo, mkMat); a.position.set(s * .25, .62, .04); a.rotation.z = s * .22; g.add(a); return a; });
  const item = new THREE.Mesh(mkBagGeo, new THREE.MeshStandardMaterial({color:'#ff8a3d', roughness:.6})); item.position.set(0, 1.08, .1); item.visible = false; g.add(item);
  g.visible = false; scene.add(g);
  MK.pool.push({id:i, g, body, arms, item, on:false, x:0, z:0, y:0, h:0, s:1, st:'idle', next:'idle', t:0, air:0, vAir:0, hp:1, big:false, carry:null, home:null, roam:false, life:0, cd:0, fleeT:0, throwT:0, flash:0, hopT:0, mv:0});
}
for (let i = 0; i < 6; i++){ const m = new THREE.Mesh(mkFruitGeo, M(i % 2 ? '#f08a24' : '#d9432f', {roughness:.6})); m.visible = false; scene.add(m); MK.fruits.push({m, on:false, x:0, y:0, z:0, vx:0, vy:0, vz:0, t:0, T:1}); }
const mkFree = (x, z) => !hitsBuilding(x, z, .5) && !outOfMap(x, z, .5) && !lakes.some(L => inPoly(x, z, L));
{ /* where the residents sit on the hill */
  const rg = mkRng(8891);
  for (let k = 0; MK.homes.length < (TOUCH ? 4 : 5) && k < 300; k++){
    const a = rg() * 6.283, r = 5 + rg() * 30, x = MK_HILL.x + Math.cos(a) * r, z = MK_HILL.z + Math.sin(a) * r;
    if (mkFree(x, z) && MK.homes.every(h => Math.hypot(h.x - x, h.z - z) > 9)) MK.homes.push({x, z, m:null, cool:0});
  }
}
const mkMark = gxMarker('#c98a55', 1); mkMark.position.set(MK_START.x, groundAt(MK_START.x, MK_START.z) + .1, MK_START.z);
const mkLbl = addLabel('猴子大战', MK_START.x, 7.5, MK_START.z, true); mkLbl.dead = true;
addLabel('猴山', MK_HILL.x, groundAt(MK_HILL.x, MK_HILL.z) + 13, MK_HILL.z, true);
const mkSqueak = () => { tone('square', 1500, 950, .09, .05); tone('square', 1700, 1100, .1, .05, .1); };
const mkScreech = () => { for (let i = 0; i < 3; i++) tone('sawtooth', 1300 + i * 220, 700, .1, .05, i * .07); };
const mkLeaves = (x, y, z, n) => { for (let k = 0; k < n; k++) spawnPart('leaf', x + (rnd() - .5) * 2, y + rnd() * 2, z + (rnd() - .5) * 2, .5, {vx:(rnd() - .5) * 4, vy:1 + rnd() * 2, vz:(rnd() - .5) * 4, g:5, life:1.3, op:1, color:'#4f9a3f'}); };
function mkSpot(cx, cz, r0, r1, forest, onHill){
  for (let k = 0; k < 30; k++){
    const a = rnd() * 6.283, r = r0 + rnd() * (r1 - r0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!mkFree(x, z) || hitsBuilding(x, z, 1.5)) continue;
    if (forest && !inPoly(x, z, FOREST)) continue;
    if (onHill && Math.hypot(x - MK_HILL.x, z - MK_HILL.z) > MK_HILL.r - 6) continue;
    if (cars.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    return [x, z];
  }
  return null;
}
function mkSpawn(x, z, o){
  const m = MK.pool.find(q => !q.on); if (!m) return null;
  Object.assign(m, {on:true, x, z, h:rnd() * 6.283, st:o.drop ? 'drop' : o.next || 'idle', next:o.next || 'idle', t:0, air:o.drop ? 5.5 : 0, vAir:0, big:!!o.big, hp:o.big ? 3 : 1, carry:o.carry || null,
    home:o.home || null, roam:!!o.roam, life:45, cd:.8 + rnd() * 1.5, fleeT:0, throwT:0, flash:0, hopT:0, mv:0});
  m.s = o.big ? 1.5 : .95 + rnd() * .15; m.g.scale.setScalar(m.s);
  m.body.material = m.arms[0].material = m.arms[1].material = o.big ? mkMatBig : mkMat;
  m.item.visible = !!m.carry; if (m.carry) m.item.material.color.set(m.carry === 'food' ? '#ff8a3d' : '#e3b95a');
  m.y = groundAt(x, z) + m.air; m.g.position.set(x, m.y, z); m.g.rotation.set(0, m.h, 0); m.g.visible = true;
  if (o.drop){ mkLeaves(x, m.y, z, 6); tone('sine', 900, 300, .3, .05); }
  return m;
}
function mkOff(m){ m.on = false; m.g.visible = false; m.carry = null; if (m.home){ m.home.m = null; m.home = null; } }
function mkGone(m){ if (!m.on) return; mkLeaves(m.x, m.y + 1, m.z, 5); if (m.home) m.home.cool = 30 + rnd() * 15; mkOff(m); }
/* everything off, without ceremony (leaving 奶娃 mode, getting arrested); stolen cash that was still in play goes back */
function mkClear(){
  const L = MK.loot; if (L && L.kind === 'cash'){ money += L.amt; moneyChanged(); } MK.loot = null;
  for (const m of MK.pool) if (m.on) mkOff(m);
  for (const f of MK.fruits){ f.on = false; f.m.visible = false; }
  MK.anger = 0; MK.slow = 0;
}
function mkGo(m, tx, tz, speed, dt){
  const dx = tx - m.x, dz = tz - m.z, L = Math.hypot(dx, dz); if (L < .05) return;
  const v = Math.min(L, speed * dt), ux = dx / L, uz = dz / L;
  let nx = m.x + ux * v, nz = m.z + uz * v;
  if (!mkFree(nx, nz)){ nx = m.x - uz * v; nz = m.z + ux * v; if (!mkFree(nx, nz)){ nx = m.x + uz * v; nz = m.z - ux * v; if (!mkFree(nx, nz)) return; } }
  m.h = Math.atan2(nx - m.x, nz - m.z); m.x = nx; m.z = nz; m.mv = speed;
}
/* ---------- stealing and getting it back ---------- */
function mkSteal(m){
  const lv = smLv();
  if (MK.war){      /* in the battle a raider opens the water tank instead */
    const n = Math.min(2, WG.ammo); WG.ammo -= n; wgShow(); m.st = 'throw'; m.t = 0; m.cd = 2.2; mkScreech();
    gxCallout('水箱被拧开了', n ? `漏掉 ${n} 发水` : '还好水箱是空的', '#4aa3ff'); return;
  }
  if (MK.loot){ m.st = 'throw'; m.cd = 1; return; }
  if (mission.on){
    MK.loot = {kind:'food', m}; m.carry = 'food';
    toast('外卖被猴子抢走了！', `追上去用水枪淋它（${TOUCH ? '「水枪」' : 'E'}），或者凑近了大笑，它上树之前抢回来`, 3000);
  } else if (money >= 1){
    const amt = Math.max(.5, Math.min(6 + 4 * lv, Math.round(money * .08 * 2) / 2));
    money -= amt; moneyChanged(); MK.loot = {kind:'cash', amt, m}; m.carry = 'cash';
    toast(`猴子掏走了 RM ${amt.toFixed(2)}`, `追上去用水枪淋它（${TOUCH ? '「水枪」' : 'E'}），或者凑近了大笑，它上树之前抢回来`, 3000);
  } else { toast('猴子翻了翻你的口袋', '什么也没翻到，气得冲你扔果子', 2200); m.st = 'throw'; m.cd = .8; MK.anger = Math.max(MK.anger, 10); mkScreech(); return; }
  m.item.visible = true; m.item.material.color.set(m.carry === 'food' ? '#ff8a3d' : '#e3b95a');
  m.st = 'flee'; m.t = 0; m.fleeT = Math.max(8, 11 - lv); mkScreech(); camShake = Math.max(camShake, .4);
}
function mkDrop(m){
  const L = MK.loot;
  if (MK.war){ if (m.carry) MK.war.got++; }
  else if (L && L.m === m){
    if (L.kind === 'cash'){ money += L.amt; moneyChanged(); toast('钱抢回来了', `RM ${L.amt.toFixed(2)} 回到钱包`, 2000); }
    else toast('外卖抢回来了', '还热着，赶紧送过去', 2000);
    MK.loot = null; sfx.ding(); unlock('monkey1');
  }
  m.carry = null; m.item.visible = false;
}
function mkEscape(m){
  const L = MK.loot;
  if (L && L.m === m){
    MK.loot = null; sfx.fail();
    if (L.kind === 'food'){ mission.on = false; destMark.visible = false; toast('外卖被猴子吃掉了', '它抱着袋子上树了，这单黄了。回食堂再接一单', 2800); }
    else toast('猴子带着钱上树了', `RM ${L.amt.toFixed(2)} 没了。下次早点淋它`, 2600);
  }
  mkGone(m);
}
/* ---------- driving them off, and the troop hitting back ---------- */
function mkScare(m){
  const had = m.carry; if (had) mkDrop(m);
  m.st = 'scared'; m.t = 0; mkScreech(); addStunt(m.big ? '赶跑猴王' : '赶跑猴子', m.big ? 120 : 40);
  const w = MK.war;
  if (w){ w.done++; MK.rage = Math.min(1, MK.rage + .1); gxCallout(`赶跑 ${w.done} / ${w.need}`, had ? `外卖抢回 ${w.got} / 3` : m.big ? '猴王跑了' : '', '#c98a55'); }
  else mkAnger(m);
}
function mkAnger(src){
  if (MK.war) return;
  const lv = smLv(), fresh = MK.anger <= 0; MK.anger = 14 + 3 * lv;
  if (!fresh) return;
  const want = Math.min(4, 1 + lv); let n = 0;
  for (const m of MK.pool) if (n < want && m.on && m !== src && m.st === 'idle' && Math.hypot(m.x - src.x, m.z - src.z) < 45){ m.st = lv >= 1 && n % 2 ? 'raid' : 'throw'; m.t = 0; m.cd = .5 + rnd(); n++; }
  /* from the second level on, friends drop out of the trees to back the troop up; at the top level a boss comes too */
  for (let k = n; lv >= 1 && k < want; k++){
    const s = mkSpot(src.x, src.z, 6, 14, false); if (!s) break;
    if (mkSpawn(s[0], s[1], {next:'throw', drop:true, roam:true, big:lv >= 3 && k === want - 1})) n++;
  }
  if (n) toast('猴群反击！', `${n} 只猴子围上来扔果子，边躲边淋`, 2400);
}
function mkHit(m, power, info){
  if (!m.on || m.st === 'scared') return;
  splashAt(m.x, m.y + .6, m.z); sfx.splash();
  if (info && info.push) for (let k = 0; k < 5; k++){ const x = m.x + info.fx * .6, z = m.z + info.fz * .6; if (!mkFree(x, z)) break; m.x = x; m.z = z; }
  m.hp -= power || 1;
  if (m.hp > .01){ m.flash = .5; tone('square', 520, 300, .2, .08); gxCallout('猴王不怕水', `再淋 ${Math.ceil(m.hp / (power || 1))} 枪`, '#c98a55'); if (m.st === 'idle'){ m.st = 'throw'; m.cd = .5; } mkAnger(m); return; }
  mkScare(m);
}
function mkLaugh(){
  let n = 0; const R = 10 - smLv();
  for (const m of MK.pool){
    if (!m.on || m.st === 'scared' || m.st === 'drop' || Math.hypot(m.x - nw.x, m.z - nw.z) > R) continue;
    if (m.big){ m.hp -= 1; m.flash = .5; if (m.hp > .01) continue; }
    mkScare(m); n++;
  }
  if (n) gxCallout('哈哈哈哈哈', `笑跑 ${n} 只猴子`, '#c0392b');
}
wgAddTarget(() => MK.pool.filter(m => m.on && m.st !== 'scared' && m.st !== 'drop').map(m => ({x:m.x, z:m.z, hit:(p, i) => mkHit(m, p, i)})));
/* ---------- fruit ---------- */
function mkThrow(m, px, pz, d, lv){
  const f = MK.fruits.find(q => !q.on); if (!f) return;
  const T = Math.max(.65, d / 17), lead = .55 + .15 * lv, tx = px + MK.pvx * T * lead, tz = pz + MK.pvz * T * lead, y0 = m.y + m.s;
  Object.assign(f, {on:true, x:m.x, y:y0, z:m.z, t:0, T, vx:(tx - m.x) / T, vz:(tz - m.z) / T, vy:(groundAt(tx, tz) + 1.1 - y0) / T + 9 * T});
  f.m.visible = true; m.throwT = .35; m.h = Math.atan2(px - m.x, pz - m.z); tone('sine', 520, 900, .12, .05);
}
function mkSplat(f){ for (let k = 0; k < 6; k++) spawnPart('dust', f.x, f.y, f.z, .45, {vx:(rnd() - .5) * 5, vy:1 + rnd() * 3, vz:(rnd() - .5) * 5, g:12, life:.6, op:.95, color:'#f08a24'}); f.on = false; f.m.visible = false; }
function mkFruitHit(f){
  mkSplat(f);
  if (driving){ sfx.thud(.25); return; }
  if (MK.hitCd > 0) return;      /* just been hit: the next ones only splatter */
  MK.hitCd = 1.6;
  const w = MK.war, lv = smLv(); MK.slow = 1.3; camShake = Math.max(camShake, .45); tone('sawtooth', 220, 90, .18, .1);
  if (w) w.t += 2;
  if (lv >= 2 && WG.ammo > 0){ WG.ammo--; wgShow(); }
  gxCallout('被果子砸中', (w ? '−2 秒 · ' : '') + (lv >= 2 ? '果汁糊住枪口，少一发水' : '黏糊糊的，走不快'), '#e8862e');
}
/* ---------- one monkey, one frame ---------- */
function mkStep(m, dt, px, pz, slow, sp, lv){
  const dx = px - m.x, dz = pz - m.z, d = Math.hypot(dx, dz) || 1e-3, w = MK.war;
  m.t += dt; m.mv = 0;
  if (m.st === 'drop'){      /* dropping out of a tree */
    m.vAir -= 22 * dt; m.air = Math.max(0, m.air + m.vAir * dt);
    if (m.air <= 0){ m.st = m.next; m.t = 0; dustBurst(m.x, groundAt(m.x, m.z) + .2, m.z, 3, 1.2); mkSqueak(); }
  } else if (driving && sp > 6 && d < 6.5 && m.st !== 'scared') mkGo(m, m.x - dx / d * 5, m.z - dz / d * 5, 13, dt);   /* never under the wheels: hop aside */
  else switch (m.st){
    case 'idle':
      if (m.home && Math.hypot(m.home.x - m.x, m.home.z - m.z) > 2.5) mkGo(m, m.home.x, m.home.z, 4.5, dt);
      else if (d < 32){ const a = Math.atan2(dx, dz); m.h += Math.atan2(Math.sin(a - m.h), Math.cos(a - m.h)) * Math.min(1, dt * 4); }
      if (!w && slow && d < 20 && MK.raidCd <= 0 && !MK.loot && nw.state !== 'fly'){
        MK.raidCd = 16 - 2 * lv; m.st = 'raid'; m.t = 0; mkSqueak();
        if (!MK.told){ MK.told = true; toast('猴子盯上你了', `它想抢东西。用水枪淋它（${TOUCH ? '「水枪」' : 'E'}），或者等它凑近了大笑`, 2800); }
      } else if (MK.anger > 0 && d < 30){ m.st = 'throw'; m.t = 0; m.cd = .6 + rnd(); }
      else if (m.roam && ((m.life -= dt) <= 0 || d > 80)){ mkGone(m); return; }
      break;
    case 'raid':
      mkGo(m, px, pz, 9.4 + .5 * lv, dt);
      if (d < 1.7 && slow) mkSteal(m);
      else if (m.t > 10 || sp > 14){ m.st = w || MK.anger > 0 ? 'throw' : 'idle'; m.t = 0; m.cd = 1; }
      break;
    case 'flee': {
      let ax = -dx / d, az = -dz / d;
      if (w){ const cx = MK_HILL.x - m.x, cz = MK_HILL.z - m.z, dc = Math.hypot(cx, cz) || 1, pull = Math.pow(dc / MK_HILL.r, 2) * 1.8; ax += cx / dc * pull; az += cz / dc * pull; }
      const wv = Math.sin(m.t * 2.3 + m.id) * .5;      /* weave a little */
      mkGo(m, m.x + (ax - az * wv) * 6, m.z + (az + ax * wv) * 6, d < 15 ? 8.6 + .4 * lv : 4.5, dt);
      if (!w){ m.fleeT -= dt; if (m.fleeT <= 0){ mkEscape(m); return; } }
      break; }
    case 'throw':
      if (d < 7.5) mkGo(m, m.x - dx / d * 5, m.z - dz / d * 5, 8, dt);
      else if (d > 15) mkGo(m, px, pz, 7.5, dt);
      else m.h = Math.atan2(dx, dz);
      m.cd -= dt * (1 + MK.rage);
      if (m.cd <= 0 && d < 24 && MK.throwCd <= 0){ mkThrow(m, px, pz, d, lv); m.cd = Math.max(1.3, 2.9 - .4 * lv) + rnd() * 1.4; MK.throwCd = .75 - .12 * lv; }   /* the troop takes turns */
      if (!w && MK.anger <= 0){ if (m.roam){ mkGone(m); return; } m.st = 'idle'; m.t = 0; }
      else if (!w && d > 70){ mkGone(m); return; }
      break;
    case 'scared':
      mkGo(m, m.x - dx / d * 6, m.z - dz / d * 6, 12.5, dt);
      if (m.t > 1.4){ mkGone(m); return; }
      break;
  }
  const run = m.mv > .1; if (run) m.hopT += dt * 14;
  m.y = groundAt(m.x, m.z) + (run ? Math.abs(Math.sin(m.hopT)) * .32 : 0) + m.air;
  m.g.position.set(m.x, m.y, m.z); m.g.rotation.set(run ? .3 : 0, m.h, 0);
  let l = 0, r = 0;
  if (m.carry || m.st === 'scared' || m.st === 'drop'){ l = r = -2.9 + Math.sin(m.t * 18) * (m.carry ? .08 : .4); }
  else if (m.throwT > 0){ m.throwT -= dt; r = -3.4 + (1 - m.throwT / .35) * 2.4; }
  else if (run){ l = Math.sin(m.hopT) * .9; r = -l; }
  else if (Math.sin(m.t * 1.3 + m.id) > .9) r = -1.2 + Math.sin(m.t * 20) * .2;      /* a scratch now and then */
  m.arms[0].rotation.x = l; m.arms[1].rotation.x = r;
  if (m.flash > 0){ m.flash -= dt; m.g.scale.setScalar(m.s * (1 + Math.sin(m.flash * 40) * .07)); }
}
/* ---------- 猴子大战 ---------- */
function mkWarStart(){
  mkClear(); const lv = smLv(), need = 8 + 2 * lv, limit = 75 + 8 * lv;
  MK.war = {t:0, lv, need, limit, done:0, got:0, spawned:0, spawnCd:.4, cap:Math.min(MK_N, 4 + lv), bigs:[0, 1, 1, 2][lv]};
  MK.rage = 0; for (const h of MK.homes) h.m = null;
  mkMark.visible = false; mkLbl.dead = true; sfx.ding(); mkScreech();
  gxCallout('猴子大战', `赶跑 ${need} 只`, '#c98a55');
  toast('猴子大战', `猴群抢走了 3 袋外卖。${limit} 秒内把 ${need} 只猴子全赶跑：水枪淋，或者凑近了大笑。小心果子` + (lv ? ` · 对手强度：${PVE_NAME[lv]}` : ''), 4400);
}
function mkWarSpawn(px, pz){
  const w = MK.war, i = w.spawned, s = mkSpot(px, pz, 13, 24, false, true) || mkSpot(MK_HILL.x, MK_HILL.z, 5, 40, false, true); if (!s) return;
  const big = i >= w.need - w.bigs, role = i < 3 ? 'flee' : i % 2 ? 'throw' : w.lv >= 1 || i % 4 === 0 ? 'raid' : 'throw';
  if (mkSpawn(s[0], s[1], {next:big ? 'throw' : role, drop:true, big, carry:!big && i < 3 ? 'food' : null})) w.spawned++;
}
function mkWarEnd(win, title, sub){
  const w = MK.war; if (!w) return; MK.war = null; MK.rearm = true; MK.rage = 0; missionEl.classList.remove('urgent');
  for (const m of MK.pool) if (m.on) mkGone(m);
  for (const f of MK.fruits){ f.on = false; f.m.visible = false; }
  for (const h of MK.homes) h.cool = 25 + rnd() * 20;
  if (!win){ if (title){ sfx.fail(); toast(title, sub, 3000); } return; }
  const left = Math.max(0, w.limit - w.t), frac = left / w.limit, medal = frac >= .4 ? 0 : frac >= .2 ? 1 : 2;
  const prev = prog.best.monkey, rec = prev == null || left > prev; if (rec) prog.best.monkey = Math.round(left);
  const pay = Math.round(40 + left * .8) + [40, 20, 8][medal] + 15 * w.lv;
  sess.acts++; sess.medals++; earn(pay); saveGame(); unlock('monkeywar'); if (medal === 0) unlock('gold');
  toast(`${GX_MEDAL[medal]} · 猴子大战`, `还剩 ${Math.round(left)} 秒${rec && prev != null ? ' · 新纪录！' : ''} · 外卖抢回 ${w.got} / 3 · +RM ${pay}`, 3800);
  gxCallout(GX_MEDAL[medal], '猴山大王', ['#e3b95a', '#b8c2cc', '#c98a55'][medal]);
  for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09);
}
/* ---------- per frame ---------- */
let mkBaseBusy = () => false;
function mkUpdate(dt, px, pz){
  const lv = smLv(), sp = driving ? Math.hypot(driving.vx, driving.vz) : 0, slow = !driving || sp < 5, indoors = ROOM.in;
  /* how fast the player is moving, to lead the throws (a teleport must not count) */
  if (dt > 0){ let vx = (px - MK.lx) / dt, vz = (pz - MK.lz) / dt; if (Math.hypot(vx, vz) > 40) vx = vz = 0; const k = Math.min(1, dt * 6); MK.pvx += (vx - MK.pvx) * k; MK.pvz += (vz - MK.pvz) * k; }
  MK.lx = px; MK.lz = pz;
  MK.raidCd -= dt; MK.slow -= dt; MK.anger -= dt; MK.hitCd -= dt; MK.throwCd -= dt;
  const dHill = Math.hypot(px - MK_HILL.x, pz - MK_HILL.z), w = MK.war;
  /* the start ring at the foot of the hill */
  const canStart = !w && !indoors && !mkBaseBusy() && !mission.on;
  mkMark.visible = canStart; mkLbl.dead = !canStart;
  if (canStart){
    mkMark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    const d = Math.hypot(px - MK_START.x, pz - MK_START.z);
    if (MK.rearm){ if (d > 14) MK.rearm = false; }
    else if (d < 6.5){
      if (driving) smPrompt = '下车走进圈，开始「猴子大战」' + (prog.best.monkey != null ? ` · 纪录剩 ${Math.round(prog.best.monkey)} 秒` : '');
      else if (nw.state !== 'fly') mkWarStart();
    }
  }
  if (MK.war){
    const b = MK.war; b.t += dt; b.spawnCd -= dt;
    if (b.spawned < b.need && b.spawnCd <= 0 && MK.pool.filter(m => m.on).length < b.cap){ mkWarSpawn(px, pz); b.spawnCd = .7; }
    const left = b.limit - b.t;
    missionEl.textContent = `赶猴 ${b.done}/${b.need} · ${Math.max(0, Math.ceil(left))} 秒 · 外卖 ${b.got}/3 · 猴子大战`;      /* counts first: the phone HUD cuts long lines */
    missionEl.classList.toggle('urgent', left < 12);
    if (b.done >= b.need) mkWarEnd(true);
    else if (left <= 0) mkWarEnd(false, '猴群赢了', '时间到，猴子还在山上笑你。山脚的光圈可以再来');
    else if (dHill > MK_HILL.r + 60) mkWarEnd(false, '跑出猴山了', '猴子大战要在山上打。山脚的光圈可以再来');
    else if (dHill > MK_HILL.r + 25) smPrompt = '离猴山太远了，再走就算弃权';
  } else if (!indoors){
    /* residents of the hill: there while you are around, gone when you are far away */
    if (dHill < 150){ for (const h of MK.homes){ h.cool -= dt; if (!h.m && h.cool <= 0){ const m = mkSpawn(h.x, h.z, {next:'idle', home:h, drop:dHill < 70}); if (m) h.m = m; else break; } } }
    else if (dHill > 190) for (const h of MK.homes) if (h.m) mkOff(h.m);
    /* now and then one or two drop out of a tree somewhere else in the forest */
    if (dHill > 95 && sp < 12 && !gxA.act && !EX.on && inPoly(px, pz, FOREST)){
      MK.roamT -= dt;
      if (MK.roamT <= 0){
        MK.roamT = 40 + rnd() * 35;
        const h = driving ? driving.h : nw.h, n = 1 + (rnd() < .35 + .15 * lv ? 1 : 0);
        for (let i = 0; i < n; i++){ const s = mkSpot(px + Math.sin(h) * 15, pz + Math.cos(h) * 15, 0, 7, true); if (s) mkSpawn(s[0], s[1], {next:'idle', drop:true, roam:true}); }
        MK.raidCd = Math.min(MK.raidCd, 1);
      }
    }
  }
  for (const m of MK.pool) if (m.on) mkStep(m, dt, px, pz, slow, sp, lv);
  /* a thief that was switched off some other way must not keep the loot */
  if (MK.loot && !MK.loot.m.on){ const L = MK.loot; MK.loot = null; if (L.kind === 'cash'){ money += L.amt; moneyChanged(); } }
  const py = driving ? driving.y : nw.y;
  for (const f of MK.fruits){
    if (!f.on) continue;
    f.t += dt; f.vy -= 18 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.m.position.set(f.x, f.y, f.z); f.m.rotation.x += dt * 9;
    if (Math.hypot(f.x - px, f.z - pz) < (driving ? 2.2 : 1.1) && Math.abs(f.y - py - 1.2) < 1.7 && !indoors) mkFruitHit(f);
    else if (f.y <= groundAt(f.x, f.z) + .15 || f.t > f.T + 1.5) mkSplat(f);
  }
  if (!driving && nw.state === 'laugh' && MK.prev !== 'laugh') mkLaugh();
  MK.prev = driving ? '' : nw.state;
}

/* ================================================================== wiring ================================================================== */
function smReset(){ swOff(); SW.fly = null; if (SW.lbl || actSp.querySelector('b').textContent === '荡'){ SW.lbl = false; updateActs(); } }
{ const base = roomTryF; roomTryF = function(){ if (SW.on){ swOff(); return true; } if (swNear()){ swSit(); return true; } return base(); }; }
{ const base = footAction; footAction = function(k){ if (SW.on) return; base(k); }; }
{ const base = updateFoot; updateFoot = function(dt){
    if (SW.on){ if (nw.state === 'swing'){ swFoot(dt); return; } swOff(); }
    base(MK.slow > 0 && nw.state !== 'fly' ? dt * .5 : dt);      /* sticky with fruit juice: half speed for a moment */
  }; }
{ const base = animNaiwa; animNaiwa = function(dt, T){
    base(dt, T);
    if (!SW.on || nw.state !== 'swing') return;
    const [aL, aR] = NW.arms, [eL, eR] = NW.elbows, [lL, lR] = NW.legs, v = SW.om / 2.6, k = Math.min(1, swAmp() / SW_MAX);
    NW.body.rotation.set(-SW.th - v * .18, 0, 0); NW.body.position.y = 0;
    aL.rotation.set(-.15, 0, 2.75); aR.rotation.set(-.15, 0, -2.75); eL.rotation.set(-.25, 0, 0); eR.rotation.set(-.25, 0, 0);   /* hands up on the ropes */
    lL.rotation.x = lR.rotation.x = Math.max(-1.75, Math.min(-.4, -1.15 - v * .5));                                              /* legs kick out on the way forward */
    NW.mouth.scale.y = .018 + k * .09;
  }; }
/* while a monkey has the takeaway, the order cannot be handed over */
{ const base = updateMission; updateMission = function(dt, px, pz){
    const L = MK.loot;
    if (L && L.kind === 'food' && mission.on && mode === 'naiwa'){
      mission.t -= dt; missionEl.classList.add('urgent');
      missionEl.textContent = `外卖在猴子手里 · 淋它或者笑它 · ${Math.max(0, Math.ceil(L.m.fleeT))} 秒后它就上树了`;
      return;
    }
    base(dt, px, pz);
  }; }
{
  const base = Object.assign({}, gx);
  mkBaseBusy = () => base.busy();
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); smPrompt = ''; swUpdate(dt); mkUpdate(dt, px, pz); },
    busy(){ return base.busy() || !!MK.war; },
    extBusy(){ return base.extBusy() || !!MK.war; },
    prompt(){ return smPrompt || base.prompt(); },
    target(){
      const t = base.target(); if (t) return t;
      if (MK.war){
        let best = null, bd = 1e9;
        for (const m of MK.pool) if (m.on && m.st !== 'scared'){ const d = Math.hypot(m.x - nw.x, m.z - nw.z) - (m.carry ? 30 : 0); if (d < bd){ bd = d; best = m; } }
        return best ? {x:best.x, z:best.z, label:best.carry ? '抱着外卖的猴子' : best.big ? '猴王' : '猴子'} : {x:MK_HILL.x, z:MK_HILL.z, label:'猴山'};
      }
      if (MK.loot) return {x:MK.loot.m.x, z:MK.loot.m.z, label:'抢东西的猴子'};
      return null;
    },
    mini(dot){
      base.mini(dot);
      const p = driving || nw;
      if (MK.war){ for (const m of MK.pool) if (m.on && m.st !== 'scared') dot(m.x, m.z, m.carry ? '#ff8a3d' : '#c98a55', m.big ? 6 : 4); }
      else {
        if (mkMark.visible) dot(MK_START.x, MK_START.z, '#c98a55', 7);
        if (MK.loot) dot(MK.loot.m.x, MK.loot.m.z, '#ff8a3d', 6);
        if (Math.hypot(p.x - SW.x, p.z - SW.z) < 240) dot(SW.x, SW.z, '#ffd27a', 4);
      }
    },
    onBust(){ smReset(); if (MK.war) mkWarEnd(false, '猴子大战中断了', '被保安抓走了，猴子看了个热闹'); mkClear(); base.onBust(); },
    leave(){ smReset(); mkWarEnd(false); MK.rearm = false; mkClear(); mkMark.visible = false; mkLbl.dead = true; base.leave(); }
  });
}
