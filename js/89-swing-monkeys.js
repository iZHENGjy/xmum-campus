/* XMUM 校园漫游 · 奶娃彩蛋：音乐岛旁的秋千、树林里的猴子、「猴子大战」
 *
 * 秋千：音乐岛西边、树林边的草坪上。走过去按 F 坐上去，按住空格（手机按住「荡」，或者按住画面）越荡越高，
 *   荡到前面最高点松手就飞出去，落地算一次特技；飞得越远分越高。幅度不够时松手只是接着荡，再按 F 下来。
 * 猴子：校园树林西北角的小山是猴山，山顶清出了一块空地（从东边的路上有一条土路上去），平时住着几只。
 *   步行或慢车靠近，会有一只冲过来抢东西：正在送外卖就抢外卖，
 *   否则掏走一点钱。它抱着东西跑，十来秒后上树；这之前用水枪淋它（E）或者凑近大笑（R），东西就掉回来。
 *   淋了一只，别的猴子会围上来扔果子反击；对手强度（pveLevel）越高，围上来的越多。
 *   在树林别处偶尔也会有一两只从树上跳下来捣乱。开快车冲过去它们会自己跳开。
 * 猴子会躲水（水枪没有自动瞄准，水柱要飞一会儿才到）：
 *   侧跳：看见水柱朝自己来，有一定几率往旁边一跳，之后 1.8 秒内跳不动，所以紧跟着的第二枪能中；贴脸开枪它来不及躲。
 *   躲石头：山顶空地上有几块大石头，扔果子的猴子躲在石头后面，探出来扔一个再缩回去；水柱打不穿石头，要绕过去。
 *   上树：有的猴子爬到空地边的树上往下扔，离树 9.5 米以内水才够得着，淋中了它会掉下来。
 *   传外卖：抱外卖的猴子被追近了会把袋子举起来（0.6 秒）扔给同伴；举起来的时候它不会躲，是开枪的时机。
 *   猴王：要淋好几枪（头顶有血条），5 秒不挨淋会自己回血。
 * 猴子大战：山顶空地东口的棕色光圈，下车走进去开始。限时把一群猴子全赶跑，抢回 3 袋外卖，最后出场的是猴王。
 *   抱着外卖的猴子跑一阵就没力气了，会停下来冲你做鬼脸，那就是淋它的时候。只差两三只时间就到了，会加时 10 秒。
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
const SW = {x:-26, z:-58, h:1.18, H:5, L:3.6, G:16, th:0, om:0, on:false, was:false, skip:false, ptr:false, ptrId:-1, lx:0, ly:0, mv:0, fly:null, said:false, cam:null, cue:false, top:false, trail:0};
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
  /* a landing lane in front, chalked every 10 m like a long-jump pit: it shows which way is forward and gives something to beat */
  const chalk = new THREE.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.75, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-24});
  const lines = [new THREE.PlaneGeometry(.18, 38).rotateX(-Math.PI / 2).translate(-3, .05, 27), new THREE.PlaneGeometry(.18, 38).rotateX(-Math.PI / 2).translate(3, .05, 27)];
  for (let d = 10; d <= 40; d += 10){
    lines.push(new THREE.PlaneGeometry(6, .3).rotateX(-Math.PI / 2).translate(0, .05, d));
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.font = '900 46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d + ' 米', 64, 34);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv), transparent:true, opacity:.8, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-6, polygonOffsetUnits:-24}));
    num.position.set(0, .06, d + 1.2); swG.add(num);
    clearArea(SW.x + Math.sin(SW.h) * d, SW.z + Math.cos(SW.h) * d, 4.5, 4.5); clearArea(SW.x + Math.sin(SW.h) * (d + 5), SW.z + Math.cos(SW.h) * (d + 5), 4.5, 4.5);
  }
  swG.add(new THREE.Mesh(geoMerge(lines), chalk));
  /* Collision: only the four feet, so 奶娃 can walk in under the beam. They go into MAP.wall (cars and walking) and not into
     the building colliders, because the follow camera pulls in for those and a thin post should not yank the camera around. */
  const wall = MAP.wall;
  MAP.wall = (x, z, r) => (wall ? wall(x, z, r) : false) || (Math.abs(x - SW.x) < 5 + r && Math.abs(z - SW.z) < 5 + r && feet.some(f => Math.hypot(f[0] - x, f[1] - z) < .25 + r));
})();
const swAmp = () => Math.acos(Math.max(-1, Math.min(1, 1 - (.5 * SW.om * SW.om * SW.L / SW.G + 1 - Math.cos(SW.th)))));   /* how high it would reach, from its energy */
const swNear = () => mode === 'naiwa' && !driving && !SW.on && !ROOM.in && (nw.state === 'idle' || nw.state === 'laugh' || nw.state === 'pose') && !nw.air && Math.hypot(nw.x - SW.x, nw.z - SW.z) < 4.3;
function swPhys(dt, pump){
  let acc = -(SW.G / SW.L) * Math.sin(SW.th) - (pump ? .03 : SW.on ? .16 : .55) * SW.om;
  /* push off the ground, then pump with the swing; no more push once it would reach the top, so it tops out smoothly instead of hitting a stop */
  if (pump){ if (Math.abs(SW.om) < .12 && Math.abs(SW.th) < .08) SW.om = .75; else if (swAmp() < SW_MAX - .02) acc += Math.sign(SW.om) * SW_PUMP; }
  const th0 = SW.th;
  SW.om += acc * dt; SW.th += SW.om * dt;
  if (Math.abs(SW.th) > SW_MAX){ SW.th = Math.sign(SW.th) * SW_MAX; if (SW.om * SW.th > 0) SW.om = 0; }
  if (th0 * SW.th < 0 && Math.abs(SW.om) > 1.1){      /* through the bottom: a whoosh, and a note that climbs as the swing gets higher */
    noise(.3, Math.min(.1, Math.abs(SW.om) * .03), 700);
    if (SW.on){ const f = 260 + swAmp() / SW_MAX * 400; tone('sine', f, f * 1.25, .16, .07); SW.cue = false; }
  }
  swPivot.rotation.x = -SW.th;
}
/* 奶娃's feet hang on the line of the ropes, a little below the seat, so leaning the body by -th keeps it on the seat */
function swPlace(){
  const R = SW.L + SW_SIT, s = Math.sin(SW.th) * R;
  nw.x = SW.x + swFx * s; nw.z = SW.z + swFz * s; nw.y = SW.H - Math.cos(SW.th) * R; nw.h = SW.h; nw.spd = 0; nw.air = false;
}
function swSit(){
  Object.assign(SW, {on:true, th:0, om:0, was:!!keys.Space, skip:true, ptr:false, cue:false, top:false});
  nw.state = 'swing'; nw.t = 0; swPlace(); sfx.boing();
  SW.cam = camDist; camDist = Math.max(camDist, 12); camYaw = SW.h + Math.PI - .7; camPitch = Math.max(camPitch, .3);      /* from behind and a little to the side, looking down the landing lane */
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
  SW.fly = {x:SW.x, z:SW.z, best:q > .85 && k > .55}; SW.om = -1.6; SW.trail = 0;
  sfx.boing(); tone('sine', 300, 900, .35, .12); camShake = Math.max(camShake, .35 + k * .4);
  for (let i = 0; i < 8; i++) spawnPart('dust', nw.x + (rnd() - .5), nw.y + .8 + rnd(), nw.z + (rnd() - .5), .7, {vx:-nw.vx * .15 + (rnd() - .5) * 3, vy:1 + rnd() * 2, vz:-nw.vz * .15 + (rnd() - .5) * 3, life:.7, op:.8, grow:1.2, color:'#fff6d8'});
  if (SW.fly.best){ gxCallout('完美脱手！', '最高点松的手', '#ffc93c'); sfx.sparkle(); if (!REDUCED) gxSlow = .6; }
  else if (q < .3) gxCallout('松早了', '荡到前面最高点再松手', '#ff8a3d');
  else gxCallout('起飞！', `时机 ${Math.round(q * 100)}% · 最高点松手飞得最远`, '#ffc93c');
}
const SW_TIER = [[40, '人间大炮'], [30, '秋千飞人'], [15, '小飞一把'], [0, '摔了个屁股蹲']];
function swLanded(){
  const f = SW.fly; SW.fly = null;
  const d = Math.round(Math.hypot(nw.x - f.x, nw.z - f.z)), prev = prog.best.swing, rec = prev == null || d > prev, wet = nw.state !== 'flop';
  if (rec){ prog.best.swing = d; saveGame(); }
  const tier = SW_TIER.find(t => d >= t[0])[1];
  camShake = Math.max(camShake, Math.min(1.6, d / 22));
  addStunt(tier, Math.round(60 + d * 14) + (f.best ? 150 : 0));
  gxCallout(`${tier} · ${d} 米`, wet ? '一头扎进湖里' : rec && prev != null ? '新纪录！' : prev != null && d < prev ? `纪录 ${Math.round(prev)} 米` : d < 30 ? '飞到 30 米有成就' : '飞得真远', '#ffc93c');
  if (d >= 15) for (let i = 0; i < 10; i++) spawnPart('dust', nw.x + (rnd() - .5) * 3, nw.y + .5 + rnd() * 2, nw.z + (rnd() - .5) * 3, .5, {vx:(rnd() - .5) * 5, vy:3 + rnd() * 4, vz:(rnd() - .5) * 5, g:9, life:1, op:1, color:'#ffd24a'});
  if (d >= 30){ unlock('swingfar'); gxChime(2); }
  /* 改装零件（js/93-tuning-ui.js）：按距离分档，有冷却和每日上限，零件弹在屏幕上 */
  if (window.XParts) XParts.reward('swing', d >= 40 ? 0 : d >= 30 ? 1 : d >= 15 ? 2 : 3, `秋千飞跃 ${d} 米`);
}
/* called instead of the normal walking update while 奶娃 is on the seat */
function swFoot(dt){
  nw.t += dt;
  const held = !!keys.Space || SW.ptr;
  if (SW.was && !held){ if (SW.skip) SW.skip = false; else if (swAmp() >= SW_MIN){ swLaunch(); return; } }
  if (held && !SW.was) SW.skip = false;
  SW.was = held;
  swPhys(dt, held);
  const A = swAmp();
  if (!SW.said && A > .7){ SW.said = true; unlock('swing'); }
  if (!SW.top && A > SW_MAX - .06){ SW.top = true; sfx.sparkle(); gxCallout('荡到顶了', '到前面最高点就松手', '#ffc93c'); }
  /* a tick right in the sweet spot at the front top, once per swing */
  if (!SW.cue && A >= SW_MIN && SW.th > A * .86 && SW.om > -.2){ SW.cue = true; tone('triangle', 1320, 1320, .07, .1); }
  swPlace();
}
function swUpdate(dt){
  if (!SW.on) swPhys(dt, false);
  if (SW.fly && nw.state !== 'fly') swLanded();
  if (SW.fly){      /* in the air: a streak behind 奶娃 and the distance so far */
    SW.trail += dt; if (SW.trail > .04){ SW.trail = 0; spawnPart('dust', nw.x, nw.y + 1.2, nw.z, .55, {life:.45, op:.5, grow:1.5, color:'#ffffff'}); }
    smPrompt = `飞了 ${Math.round(Math.hypot(nw.x - SW.fly.x, nw.z - SW.fly.z))} 米……`;
  } else if (SW.on){
    const A = swAmp(), n = Math.max(0, Math.min(6, Math.round(A / SW_MAX * 6))), bar = '▮'.repeat(n) + '▯'.repeat(6 - n), key = TOUCH ? '「荡」' : '空格';
    const sweet = A >= SW_MIN && SW.th > A * .8 && SW.om > -.35;
    smPrompt = A < SW_MIN ? `按住${key}越荡越高 ${bar}` + (TOUCH ? '' : ' · F 下来') : sweet ? `${bar} 现在松手！` : TOUCH ? `${bar} 最高点松手，飞出去！` : `${bar} 荡到前面最高点松开空格，飞出去！`;
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
const MK_HILL = {x:-188, z:-175, r:30, clear:23}, MK_START = {x:-171, z:-175}, MK_N = TOUCH ? 8 : 10;   /* r = how far the battle spreads · clear = the clearing on top */
const MK = {pool:[], fruits:[], homes:[], cover:[], trees:[], bars:[], bag:null, farT:0, war:null, loot:null, raidCd:6, anger:0, rage:0, slow:0, hitCd:0, throwCd:0, chain:0, chainT:0, roamT:22, rearm:false, told:false, lx:0, lz:0, pvx:0, pvz:0, prev:''};
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
  MK.pool.push({id:i, g, body, arms, item, on:false, x:0, z:0, y:0, h:0, s:1, st:'idle', next:'idle', t:0, air:0, vAir:0, hp:1, big:false, carry:null, home:null, roam:false, life:0, cd:0, fleeT:0, throwT:0, flash:0, hopT:0, mv:0, dodge:0, dodgeCd:0, dvx:0, dvz:0, shot:null, sly:false, cov:null, covT:0, side:1, up:0, tree:null, treeT:0, climb:false, pass:0, passCd:0, mate:null, hpMax:1, regenT:0, bar:null});
}
for (let i = 0; i < 6; i++){ const m = new THREE.Mesh(mkFruitGeo, M(i % 2 ? '#f08a24' : '#d9432f', {roughness:.6})); m.visible = false; scene.add(m); MK.fruits.push({m, on:false, x:0, y:0, z:0, vx:0, vy:0, vz:0, t:0, T:1}); }
const mkFree = (x, z) => !hitsBuilding(x, z, .5) && !outOfMap(x, z, .5) && !lakes.some(L => inPoly(x, z, L));
/* The hilltop is cleared so the fight can be seen (under the canopy the camera sits in the leaves), and a dirt track runs up
   from the road on the east side. Both are drawn on the terrain: every vertex takes its height from groundAt. */
(() => {
  const H = MK_HILL, x1 = H.x + 53;      /* the pavement of the road east of the hill starts about here */
  for (const set of knockSets) set.spots.forEach((o, i) => {
    const onTop = Math.hypot(o.x - H.x, o.z - H.z) < H.clear, onTrack = o.x > H.x && o.x < x1 && Math.abs(o.z - H.z) < 4.5;
    if (!o.hidden && (onTop || onTrack)){ o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0); }
  });
  const dirt = new THREE.Color('#927a55'), grass = new THREE.Color('#4a8539'), c = new THREE.Color(), pos = [], col = [], idx = [];
  const put = (x, z, k) => { pos.push(x, groundAt(x, z) + .09, z); c.copy(dirt).lerp(grass, Math.max(0, Math.min(1, k))); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  /* A fine grid (1.5 m), because the hill underneath is made of 12 m triangles and a coarse patch would cut through its creases.
     clearing: bare earth in the middle fading to grass at the rim · track: 3.5 m wide from the rim down to the road */
  const S = 1.5, n = Math.ceil((H.clear + 1.5) / S), at = new Map();
  const vert = (i, j) => { const key = i * 1000 + j; let v = at.get(key); if (v == null){ const x = H.x + i * S, z = H.z + j * S; v = put(x, z, (Math.hypot(i, j) * S - 15) / 8 + (hash2(i + 50, j + 50) - .5) * .25); at.set(key, v); } return v; };
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++){
    if (Math.hypot(i + .5, j + .5) * S > H.clear + 1) continue;
    const a = vert(i, j), b2 = vert(i + 1, j), d = vert(i, j + 1), e = vert(i + 1, j + 1); idx.push(a, d, b2, b2, d, e);
  }
  let prev = null;
  for (let x = H.x + 20; x <= x1 + .1; x += S){
    const wob = Math.sin(x * .21) * .8, fade = 1 - Math.min(1, (x1 - x) / 5) * .9, row = [-2.6, -1.7, -.6, .6, 1.7, 2.6].map((o, k) => put(x, H.z + wob + o, k === 0 || k === 5 ? 1 : fade + .1));
    if (prev) for (let k = 0; k < 5; k++) idx.push(prev[k], prev[k + 1], row[k], prev[k + 1], row[k + 1], row[k]);
    prev = row;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, M('#ffffff', {vertexColors:true, roughness:.95, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-16})); m.receiveShadow = true; scene.add(m);
})();
{ /* where the residents sit on the hill */
  const rg = mkRng(8891);
  for (let k = 0; MK.homes.length < (TOUCH ? 4 : 5) && k < 300; k++){
    const a = rg() * 6.283, r = 13 + rg() * 7, x = MK_HILL.x + Math.cos(a) * r, z = MK_HILL.z + Math.sin(a) * r;      /* round the clearing, in plain view */
    if (Math.hypot(x - MK_START.x, z - MK_START.z) < 12) continue;
    if (mkFree(x, z) && MK.homes.every(h => Math.hypot(h.x - x, h.z - z) > 9)) MK.homes.push({x, z, m:null, cool:0});
  }
}
/* cover: boulders on the clearing. They stop the water jet and feet and wheels (through MAP.wall, like the swing's legs, so the camera is not pulled in). */
{
  const rg = mkRng(4242), geo = new THREE.IcosahedronGeometry(1, 0), mat = M('#8f8b82', {roughness:.95, flatShading:true}), H = MK_HILL;
  for (let k = 0; MK.cover.length < 6 && k < 400; k++){
    const a = rg() * 6.283, r = 7 + rg() * 10, x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r, sc = .95 + rg() * .4;
    if (Math.hypot(x - MK_START.x, z - MK_START.z) < 10 || (x > H.x + 14 && Math.abs(z - H.z) < 5)) continue;
    if (MK.cover.some(c => Math.hypot(c.x - x, c.z - z) < 7.5) || MK.homes.some(h => Math.hypot(h.x - x, h.z - z) < 3.5)) continue;
    const m = new THREE.Mesh(geo, mat); m.scale.set(1.3 * sc, 1.05 * sc, 1.15 * sc); m.rotation.set(rg() * .5, rg() * 6.283, rg() * .5); m.position.set(x, groundAt(x, z) + .45 * sc, z);
    m.castShadow = m.receiveShadow = true; scene.add(m); MK.cover.push({x, z, r:1.15 * sc});
  }
  const wall = MAP.wall;
  MAP.wall = (x, z, r) => (wall ? wall(x, z, r) : false) || (Math.abs(x - H.x) < H.r + r && Math.abs(z - H.z) < H.r + r && MK.cover.some(c => Math.hypot(c.x - x, c.z - z) < c.r - .15 + r));
  if (typeof wgAddBlock === 'function') wgAddBlock((x, z) => Math.abs(x - H.x) < H.r && Math.abs(z - H.z) < H.r && MK.cover.some(c => (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r));
  /* the trees round the rim that a monkey can climb */
  for (const set of knockSets) if (set.kind === 'tree') for (const o of set.spots){ const d = Math.hypot(o.x - H.x, o.z - H.z); if (!o.hidden && d > H.clear && d < H.clear + 5.5 && Math.hypot(o.x - MK_START.x, o.z - MK_START.z) > 9) MK.trees.push({o, m:null}); }
}
/* the takeaway bag in the air, when one monkey throws it to another */
MK.bag = {m:new THREE.Mesh(mkBagGeo, new THREE.MeshStandardMaterial({color:'#ff8a3d', roughness:.6})), on:false, t:0, T:.6, x0:0, y0:0, z0:0, to:null, kind:'', fleeT:0};
MK.bag.m.visible = false; scene.add(MK.bag.m);
/* the king's health, a row of pips over his head */
for (let i = 0; i < 2; i++){
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false, depthTest:false})); sp.scale.set(3.2, .6, 1); sp.visible = false; scene.add(sp);
  MK.bars.push({sp, cv, tex, m:null});
}
function mkBar(m){
  const b = m.bar; if (!b) return; const g = b.cv.getContext('2d'), n = m.hpMax, w = Math.min(34, 240 / n);
  g.clearRect(0, 0, 256, 48);
  for (let i = 0; i < n; i++){ const x = 128 - n * w / 2 + i * w + w / 2, k = Math.max(0, Math.min(1, m.hp - i));
    g.beginPath(); g.arc(x, 24, w * .36, 0, 7); g.fillStyle = 'rgba(20,16,12,.75)'; g.fill();
    if (k > 0){ g.beginPath(); g.arc(x, 24, w * .28 * (.55 + .45 * k), 0, 7); g.fillStyle = '#ff5a4d'; g.fill(); } }
  b.tex.needsUpdate = true;
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
    if (onHill && Math.hypot(x - MK_HILL.x, z - MK_HILL.z) > MK_HILL.clear + 2) continue;
    if (cars.some(c => Math.hypot(c.x - x, c.z - z) < 4)) continue;
    return [x, z];
  }
  return null;
}
function mkSpawn(x, z, o){
  const m = MK.pool.find(q => !q.on); if (!m) return null;
  Object.assign(m, {on:true, x, z, h:rnd() * 6.283, st:o.drop ? 'drop' : o.next || 'idle', next:o.next || 'idle', t:0, air:o.drop ? 5.5 : 0, vAir:0, big:!!o.big, hp:o.big ? 4 + smLv() : 1, hpMax:o.big ? 4 + smLv() : 1, regenT:0, carry:o.carry || null,
    home:o.home || null, roam:!!o.roam, life:45, cd:.8 + rnd() * 1.5, fleeT:0, throwT:0, flash:0, hopT:0, mv:0, stam:2.4, tired:0, dodge:0, dodgeCd:o.drop ? .6 : 0, shot:null, sly:!!o.sly, cov:null, covT:0, side:rnd() < .5 ? 1 : -1, up:0, tree:null, treeT:0, climb:!!o.climb, pass:0, passCd:1.5, mate:null});
  if (o.big){ const b = MK.bars.find(q => !q.m); if (b){ b.m = m; m.bar = b; b.sp.visible = true; mkBar(m); } }
  m.s = o.big ? 1.5 : .95 + rnd() * .15; m.g.scale.setScalar(m.s);
  m.body.material = m.arms[0].material = m.arms[1].material = o.big ? mkMatBig : mkMat;
  m.item.visible = !!m.carry; if (m.carry) m.item.material.color.set(m.carry === 'food' ? '#ff8a3d' : '#e3b95a');
  m.y = groundAt(x, z) + m.air; m.g.position.set(x, m.y, z); m.g.rotation.set(0, m.h, 0); m.g.visible = true;
  if (o.drop){ mkLeaves(x, m.y, z, 6); tone('sine', 900, 300, .3, .05); }
  return m;
}
function mkOff(m){ m.on = false; m.g.visible = false; m.carry = null; if (m.bar){ m.bar.sp.visible = false; m.bar.m = null; m.bar = null; } if (m.tree){ m.tree.m = null; m.tree = null; } m.up = 0; if (m.home){ m.home.m = null; m.home = null; } }
function mkGone(m){ if (!m.on) return; mkLeaves(m.x, m.y + 1, m.z, 5); if (m.home) m.home.cool = 30 + rnd() * 15; mkOff(m); }
/* everything off, without ceremony (leaving 奶娃 mode, getting arrested); stolen cash that was still in play goes back */
function mkClear(){
  const L = MK.loot; if (L && L.kind === 'cash'){ money += L.amt; moneyChanged(); } MK.loot = null;
  for (const m of MK.pool) if (m.on) mkOff(m);
  for (const f of MK.fruits){ f.on = false; f.m.visible = false; }
  MK.bag.on = false; MK.bag.m.visible = false;
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
function mkScare(m, how){
  const had = m.carry; if (had) mkDrop(m);
  m.st = 'scared'; m.t = 0; m.pass = 0; m.dodge = 0;
  if (m.up > .3){ m.air = m.up; m.vAir = 3; m.up = 0; if (m.tree){ m.tree.m = null; m.tree = null; } } else { m.vAir = how === 'laugh' ? 5 : 7.5; m.air = .01; } mkScreech(); camShake = Math.max(camShake, m.big ? .5 : .28);      /* it pops into the air and bolts */
  mkLeaves(m.x, m.y + .5, m.z, 3);
  /* driving several off in quick succession chains, like the stunt combo */
  MK.chain = MK.chainT > 0 ? MK.chain + 1 : 1; MK.chainT = 3;
  addStunt(m.big ? '赶跑猴王' : MK.chain > 1 ? `${MK.chain} 连赶` : '赶跑猴子', (m.big ? 120 : 40) + (MK.chain - 1) * 30);
  gxChime(Math.min(4, MK.chain - 1));
  const w = MK.war, head = MK.chain > 1 ? `${MK.chain} 连赶！` : m.big ? '猴王跑了！' : how === 'laugh' ? '笑跑了！' : how === 'tree' ? '从树上掉下来了！' : '淋跑了！';
  if (w){ w.done++; MK.rage = Math.min(1, MK.rage + .1); gxCallout(head, `赶跑 ${w.done} / ${w.need}` + (had ? ` · 外卖 ${w.got} / 3` : ''), '#c98a55'); }
  else { gxCallout(head, had ? '东西抢回来了' : '', '#c98a55'); mkAnger(m); }
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
  if (m.up > 1 && Math.hypot(m.x - nw.x, m.z - nw.z) > MK_TREE_R){      /* up a tree and too far away: the jet falls short of the branch */
    splashAt(m.x, groundAt(m.x, m.z) + 1.2, m.z); if (MK.farT <= 0){ MK.farT = 1.2; gxCallout('够不着', `它在树上 · 走到 ${MK_TREE_R} 米以内再淋`, '#c98a55'); tone('sine', 420, 300, .12, .05); } return;
  }
  const wasUp = m.up > 1;
  splashAt(m.x, m.y + .6, m.z); if ((power || 1) > 1.4) splashAt(m.x, m.y + 1, m.z); sfx.splash();
  if (info && info.push) for (let k = 0; k < 5; k++){ const x = m.x + info.fx * .6, z = m.z + info.fz * .6; if (!mkFree(x, z)) break; m.x = x; m.z = z; }
  m.hp -= power || 1;
  m.regenT = 0; mkBar(m);
  if (m.hp > .01){ m.flash = .5; camShake = Math.max(camShake, .2); tone('square', 520, 300, .2, .08); gxCallout('猴王不怕水', `再淋 ${Math.ceil(m.hp / (power || 1))} 枪 · 别停，它会回血`, '#c98a55'); if (m.st === 'idle'){ m.st = 'throw'; m.cd = .5; } mkAnger(m); return; }
  mkScare(m, wasUp ? 'tree' : '');
}
function mkLaugh(){
  let n = 0; const R = 10 - smLv();
  for (const m of MK.pool){
    if (!m.on || m.st === 'scared' || m.st === 'drop' || m.up > 1 || Math.hypot(m.x - nw.x, m.z - nw.z) > R) continue;
    if (m.big){ m.hp -= 1; m.flash = .5; m.regenT = 0; mkBar(m); if (m.hp > .01) continue; }
    mkScare(m, 'laugh'); n++;
  }
  if (n > 1) gxCallout('哈哈哈哈哈', `一口气笑跑 ${n} 只猴子`, '#c0392b');
}
wgAddTarget(() => MK.pool.filter(m => m.on && m.st !== 'scared' && m.st !== 'drop').map(m => ({x:m.x, z:m.z, r:m.big ? .95 : .6, hit:(p, i) => mkHit(m, p, i)})));
const MK_TREE_R = 9.5, MK_DODGE = [.5, .58, .66, .74];
/* A jet is coming this way: hop sideways off its line. Not when it is fired from point blank, not twice in a row, not while winding up a pass,
   never the king. The hop is short enough that the player sees it was close, and the scatter nozzle's side jets catch it. */
function mkDodge(m, lv){
  if (m.dodgeCd > 0 || m.big || m.pass > 0 || m.up > 0 || m.air > 0 || m.tired > 0 || (m.st !== 'idle' && m.st !== 'raid' && m.st !== 'flee' && m.st !== 'throw')) return;
  for (const j of WG.jets){
    if (j.shot === m.shot) continue;
    const rx = m.x - j.x, rz = m.z - j.z, along = rx * j.dx + rz * j.dz, lat = rx * j.dz - rz * j.dx;
    if (along < 0 || along > j.R - j.s + 1 || Math.abs(lat) > 1.6) continue;
    m.shot = j.shot;
    if (along / j.v < .15 || rnd() > MK_DODGE[lv] - (m.roam ? .1 : 0)) return;
    for (const sg of [lat >= 0 ? 1 : -1, lat >= 0 ? -1 : 1]){
      const tx = m.x + j.dz * sg * (2.6 - lat * sg), tz = m.z - j.dx * sg * (2.6 - lat * sg);
      if (!mkFree(tx, tz)) continue;
      m.dodge = .22; m.dvx = (tx - m.x) / .22; m.dvz = (tz - m.z) / .22; m.dodgeCd = lv >= 3 ? 1.4 : 1.8; m.vAir = 4.5; m.air = .01; tone('square', 1250, 1700, .07, .05); return;
    }
    return;
  }
}
/* the nearest boulder this thrower can hide behind */
function mkCover(m, px, pz){
  let best = null, bd = 17;
  for (const c of MK.cover){ const d = Math.hypot(c.x - m.x, c.z - m.z); if (d < bd && Math.hypot(c.x - px, c.z - pz) > 4.5){ bd = d; best = c; } }
  return best;
}
/* a monkey with nothing in its hands that the bag can be thrown to */
function mkMate(m, px, pz){
  let best = null, bd = 9;
  for (const q of MK.pool){
    if (!q.on || q === m || q.big || q.carry || q.up > 0 || q.air > 0 || (q.st !== 'idle' && q.st !== 'throw' && q.st !== 'raid')) continue;
    const dm = Math.hypot(q.x - m.x, q.z - m.z), dp = Math.hypot(q.x - px, q.z - pz); if (dm < 4 || dm > 22) continue;
    if (dp > bd){ bd = dp; best = q; }
  }
  return best;
}
function mkPass(m){
  const q = m.mate, B = MK.bag; m.mate = null;
  if (!q || !q.on || q.carry || q.st === 'scared' || B.on || !m.carry) return;
  Object.assign(B, {on:true, t:0, T:.35 + Math.hypot(q.x - m.x, q.z - m.z) / 30, x0:m.x, y0:m.y + 1.1 * m.s, z0:m.z, to:q, kind:m.carry, fleeT:m.fleeT});
  B.m.material.color.set(m.carry === 'food' ? '#ff8a3d' : '#e3b95a'); B.m.visible = true;
  if (MK.loot && MK.loot.m === m) MK.loot.m = q;
  m.carry = null; m.item.visible = false; m.st = 'throw'; m.t = 0; m.cd = 1.8; m.throwT = .35; q.passCd = 99;      /* the catcher is spoken for */
  tone('sine', 500, 1000, .2, .06); gxCallout('传走了！', '外卖到了另一只猴子手里', '#ff8a3d');
}
function mkBagStep(dt){
  const B = MK.bag; if (!B.on) return; const q = B.to; B.t += dt; const k = Math.min(1, B.t / B.T);
  const ty = q.y + 1.1 * q.s; B.m.position.set(B.x0 + (q.x - B.x0) * k, B.y0 + (ty - B.y0) * k + Math.sin(k * Math.PI) * 3, B.z0 + (q.z - B.z0) * k); B.m.rotation.x += dt * 12;
  if (k < 1) return;
  B.on = false; B.m.visible = false;
  if (q.on && q.st !== 'scared'){
    q.carry = B.kind; q.item.visible = true; q.item.material.color.set(B.kind === 'food' ? '#ff8a3d' : '#e3b95a');
    Object.assign(q, {st:'flee', t:0, fleeT:B.fleeT, stam:2 + .35 * smLv(), tired:0, passCd:Math.max(2.5, 4 - .5 * smLv()), pass:0}); mkSqueak();
  } else {      /* nobody there to catch it: it lands at your feet */
    q.carry = B.kind; mkDrop(q); q.carry = null; gxCallout('接空了！', '袋子掉在地上，捡回来了', '#4fd18b');
  }
}
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
  m.t += dt; m.mv = 0; m.dodgeCd -= dt; m.passCd -= dt;
  if (m.big && m.hp < m.hpMax && (m.regenT += dt) > 5){ m.regenT = 2.5; m.hp = Math.min(m.hpMax, Math.floor(m.hp + 1.001)); mkBar(m); tone('sine', 300, 500, .15, .04); }
  if (m.bar) m.bar.sp.position.set(m.x, m.y + 1.75 * m.s + .5, m.z);
  if (WG.jets.length && !driving) mkDodge(m, lv);
  if (m.air > 0 && m.st !== 'drop'){ m.vAir -= 22 * dt; m.air = Math.max(0, m.air + m.vAir * dt); }      /* popped up by a soaking */
  if (m.st === 'drop'){      /* dropping out of a tree */
    m.vAir -= 22 * dt; m.air = Math.max(0, m.air + m.vAir * dt);
    if (m.air <= 0){ m.st = m.next; m.t = 0; dustBurst(m.x, groundAt(m.x, m.z) + .2, m.z, 3, 1.2); mkSqueak(); }
  } else if (m.dodge > 0){      /* mid-hop, off the line of a jet */
    const k = Math.min(dt, m.dodge); m.dodge -= dt; const nx = m.x + m.dvx * k, nz = m.z + m.dvz * k; if (mkFree(nx, nz)){ m.x = nx; m.z = nz; } m.mv = 12; m.h = Math.atan2(dx, dz);
  } else if (driving && sp > 6 && d < 6.5 && m.st !== 'scared' && m.up <= 0) mkGo(m, m.x - dx / d * 5, m.z - dz / d * 5, 13, dt);   /* never under the wheels: hop aside */
  else if (m.pass > 0){        /* winding up to throw the bag to a friend: the moment to soak it */
    m.pass -= dt; if (m.mate) m.h = Math.atan2(m.mate.x - m.x, m.mate.z - m.z); if (m.pass <= 0) mkPass(m);
  }
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
      /* A thief in the open world just runs (it has a tree to reach). In the battle the ones with the takeaway play keep-away:
         a sprint when you get close, then they are out of breath and stop to pull faces, which is the moment to soak them. */
      let ax = -dx / d, az = -dz / d;
      const cx = MK_HILL.x - m.x, cz = MK_HILL.z - m.z, dc = Math.hypot(cx, cz) || 1;
      if (w){ const pull = Math.pow(dc / MK_HILL.r, 2) * 2.2; ax += cx / dc * pull; az += cz / dc * pull; }
      const wv = Math.sin(m.t * 2.3 + m.id) * .5;      /* weave a little */
      if (m.carry && m.passCd <= 0 && d < (w ? 8.5 : 7) && !MK.bag.on){ const q = mkMate(m, px, pz); if (q){ m.pass = .6; m.mate = q; q.passCd = 3; mkScreech(); if (!w) m.passCd = 99; break; } m.passCd = .5; }
      if (!w){ mkGo(m, m.x + (ax - az * wv) * 6, m.z + (az + ax * wv) * 6, d < 15 ? 8.6 + .4 * lv : 4.5, dt); m.fleeT -= dt; if (m.fleeT <= 0){ mkEscape(m); return; } break; }
      if (m.tired > 0){ m.tired -= dt; m.h = Math.atan2(dx, dz); if (m.tired <= 0) m.stam = 2 + .35 * lv; }
      else if (d < 12 && m.stam > 0){ mkGo(m, m.x + (ax - az * wv) * 6, m.z + (az + ax * wv) * 6, 8.8 + .4 * lv, dt); m.stam -= dt; if (m.stam <= 0){ m.tired = 2.3 - .3 * lv; mkSqueak(); } }
      else if (d > 21) mkGo(m, px, pz, 6, dt);      /* do not wander off: come back and tease */
      else {      /* out of reach: it does not stand there as a target, it skips from side to side with the bag */
        if ((m.covT -= dt) <= 0){ m.covT = 1 + rnd() * 1.2; m.side = -m.side; }
        mkGo(m, m.x - az * m.side * 4 + ax * (d < 15 ? 2 : -1), m.z + ax * m.side * 4 + az * (d < 15 ? 2 : -1), 4.6 + .3 * lv, dt); m.stam = Math.min(2 + .35 * lv, m.stam + dt * .6);
      }
      break; }
    case 'tree': {      /* up a tree at the rim: run there, climb, throw a couple from the branch, come down */
      const T = m.tree; if (!T || T.o.down || T.o.hidden){ if (T){ T.m = null; m.tree = null; } m.st = 'throw'; m.cd = 1; m.air = m.up; m.vAir = 0; m.up = 0; break; }
      const bx = T.o.x + (MK_HILL.x - T.o.x) / (Math.hypot(MK_HILL.x - T.o.x, MK_HILL.z - T.o.z) || 1) * .8, bz = T.o.z + (MK_HILL.z - T.o.z) / (Math.hypot(MK_HILL.x - T.o.x, MK_HILL.z - T.o.z) || 1) * .8, top = 3.3 * Math.min(1.3, T.o.s || 1);
      if (m.treeT > 0){
        if (Math.hypot(bx - m.x, bz - m.z) > .5 && m.up <= 0){ mkGo(m, bx, bz, 9.5, dt); break; }
        m.x = bx; m.z = bz; m.up = Math.min(top, m.up + dt * 3.6); m.h = Math.atan2(dx, dz);
        if (m.up >= top){ m.treeT -= dt; m.cd -= dt; if (m.cd <= 0 && d < 26 && MK.throwCd <= 0){ mkThrow(m, px, pz, d, lv); m.cd = 2.2 + rnd(); MK.throwCd = .75 - .12 * lv; } }
      } else { m.up = Math.max(0, m.up - dt * 5); if (m.up <= 0){ T.m = null; m.tree = null; m.st = 'throw'; m.t = 0; m.cd = 1.5; m.climb = false; } }
      break; }
    case 'throw': {
      if (m.climb && w && d > 7){      /* this one prefers a branch */
        const lim = lv >= 2 ? 2 : 1; let best = null, bd = 40;
        if (MK.trees.filter(q => q.m).length < lim) for (const q of MK.trees) if (!q.m && !q.o.down && !q.o.hidden){ const dq = Math.hypot(q.o.x - m.x, q.o.z - m.z); if (dq < bd && Math.hypot(q.o.x - px, q.o.z - pz) > 11){ bd = dq; best = q; } }
        if (best){ best.m = m; m.tree = best; m.st = 'tree'; m.treeT = 7 + rnd() * 3; m.cd = .8; break; }
        m.climb = false;
      }
      if ((m.covT -= dt) <= 0){ m.covT = 1; m.cov = m.sly ? mkCover(m, px, pz) : null; }
      const c = m.cov;
      if (c){      /* behind a boulder: out to one side to throw, then back */
        const ux = c.x - px, uz = c.z - pz, L = Math.hypot(ux, uz) || 1, out = m.cd < .8 || m.throwT > 0 ? c.r + 1.4 : 0;
        const tx = c.x + ux / L * (c.r + .9) - uz / L * out * m.side, tz = c.z + uz / L * (c.r + .9) + ux / L * out * m.side;
        if (Math.hypot(tx - m.x, tz - m.z) > .35) mkGo(m, tx, tz, out ? 9 : 7.5, dt); else m.h = Math.atan2(dx, dz);
      }
      else if (d < 7.5) mkGo(m, m.x - dx / d * 5, m.z - dz / d * 5, 8, dt);
      else if (d > 15) mkGo(m, px, pz, 7.5, dt);
      else m.h = Math.atan2(dx, dz);
      m.cd -= dt * (1 + MK.rage);
      if (m.cd <= 0 && d < 24 && MK.throwCd <= 0 && (!c || Math.hypot(m.x - c.x, m.z - c.z) > c.r + 1.2)){ if (c) m.side = -m.side; mkThrow(m, px, pz, d, lv); m.cd = Math.max(1.3, 2.9 - .4 * lv) + rnd() * 1.4; MK.throwCd = .75 - .12 * lv; }   /* the troop takes turns */
      if (!w && MK.anger <= 0){ if (m.roam){ mkGone(m); return; } m.st = 'idle'; m.t = 0; }
      else if (!w && d > 70){ mkGone(m); return; }
      break; }
    case 'scared':
      mkGo(m, m.x - dx / d * 6, m.z - dz / d * 6, 12.5, dt);
      if (m.t > 1.4){ mkGone(m); return; }
      break;
  }
  const run = m.mv > .1; if (run) m.hopT += dt * 14;
  const taunt = !run && m.st === 'flee' && m.carry ? Math.abs(Math.sin(m.t * (m.tired > 0 ? 4 : 9))) * (m.tired > 0 ? .08 : .3) : 0;      /* bouncing on the spot with the bag; panting when out of breath */
  m.y = groundAt(m.x, m.z) + (run ? Math.abs(Math.sin(m.hopT)) * .32 : taunt) + m.air + m.up;
  m.g.position.set(m.x, m.y, m.z); m.g.rotation.set(m.st === 'scared' && m.air > 0 ? m.t * 13 : run ? .3 : 0, m.h, 0);      /* a somersault on the way up */
  let l = 0, r = 0;
  if (m.carry || m.pass > 0 || m.st === 'scared' || m.st === 'drop'){ l = r = -2.9 + Math.sin(m.t * 18) * (m.carry ? .08 : .4); }
  else if (m.throwT > 0){ m.throwT -= dt; r = -3.4 + (1 - m.throwT / .35) * 2.4; }
  else if (run){ l = Math.sin(m.hopT) * .9; r = -l; }
  else if (Math.sin(m.t * 1.3 + m.id) > .9) r = -1.2 + Math.sin(m.t * 20) * .2;      /* a scratch now and then */
  m.arms[0].rotation.x = l; m.arms[1].rotation.x = r;
  if (m.flash > 0){ m.flash -= dt; m.g.scale.setScalar(m.s * (1 + Math.sin(m.flash * 40) * .07)); }
}
/* ---------- 猴子大战 ---------- */
const MK_MEDAL = [.45, .25];      /* share of the time that must be left for gold / silver */
function mkWarStart(){
  mkClear(); const lv = smLv(), need = 10 + 2 * lv, limit = 75 + 8 * lv;
  MK.war = {t:0, lv, need, limit, done:0, got:0, spawned:0, spawnCd:.4, cap:Math.min(MK_N, 4 + lv), bigs:[1, 1, 1, 2][lv], ot:false};
  MK.rage = 0; for (const h of MK.homes) h.m = null;
  mkMark.visible = false; mkLbl.dead = true; sfx.ding(); mkScreech();
  gxCallout('猴子大战', `赶跑 ${need} 只`, '#c98a55');
  toast('猴子大战', `${limit} 秒内赶跑 ${need} 只：${TOUCH ? '「水枪」' : 'E '}淋，凑近了${TOUCH ? '' : ' R '}大笑` + (lv ? ` · 对手${PVE_NAME[lv]}` : ''), 3000);
}
function mkWarSpawn(px, pz){
  const w = MK.war, i = w.spawned; let s = null;
  for (let k = 0; k < 8 && !s; k++){ const q = mkSpot(MK_HILL.x, MK_HILL.z, 9, MK_HILL.clear, false, true); if (q && Math.hypot(q[0] - px, q[1] - pz) > 11) s = q; }      /* at the edge of the clearing, not on top of you */
  if (!s) return;
  const big = i >= w.need - w.bigs, role = i < 3 ? 'flee' : i % 2 ? 'throw' : w.lv >= 1 || i % 4 === 0 ? 'raid' : 'throw';
  /* of the throwers, some hide behind the boulders and some take to the trees */
  const thr = !big && role === 'throw', climb = thr && (i === 5 || (w.lv >= 1 && i === 9) || (w.lv >= 2 && i === 13)), sly = thr && !climb && (i % 4 === 3 || (w.lv >= 1 && i % 4 === 1));
  if (mkSpawn(s[0], s[1], {next:big ? 'throw' : role, drop:true, big, sly, climb, carry:!big && i < 3 ? 'food' : null})) w.spawned++;
}
function mkWarEnd(win, title, sub){
  const w = MK.war; if (!w) return; MK.war = null; MK.rearm = true; MK.rage = 0; missionEl.classList.remove('urgent');
  for (const m of MK.pool) if (m.on) mkGone(m);
  for (const f of MK.fruits){ f.on = false; f.m.visible = false; }
  for (const h of MK.homes) h.cool = 25 + rnd() * 20;
  if (!win){ if (title){ sfx.fail(); toast(title, `赶跑了 ${w.done} / ${w.need} 只 · ` + sub, 3200); } return; }
  const left = Math.max(0, w.limit - w.t), frac = left / w.limit, medal = frac >= MK_MEDAL[0] ? 0 : frac >= MK_MEDAL[1] ? 1 : 2;
  const prev = prog.best.monkey, rec = prev == null || left > prev; if (rec) prog.best.monkey = Math.round(left);
  const pay = Math.round(40 + left * .8) + [40, 20, 8][medal] + 25 * w.lv;
  const next = medal ? ` · 再快 ${Math.ceil(w.limit * MK_MEDAL[medal - 1] - left)} 秒就是${GX_MEDAL[medal - 1]}` : '';      /* what the next medal takes */
  sess.acts++; sess.medals++; earn(pay); saveGame(); unlock('monkeywar'); if (medal === 0) unlock('gold');
  const loot = window.XParts ? XParts.reward('monkey', medal, '猴子大战' + GX_MEDAL[medal]) : [];   /* 改装零件, js/93-tuning-ui.js */
  toast(`${GX_MEDAL[medal]} · 猴子大战`, `还剩 ${Math.round(left)} 秒${rec && prev != null ? ' · 新纪录！' : ''} · +RM ${pay}${next}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 4200);
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
  MK.raidCd -= dt; MK.slow -= dt; MK.anger -= dt; MK.hitCd -= dt; MK.throwCd -= dt; MK.chainT -= dt; MK.farT -= dt; mkBagStep(dt);
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
      else if (nw.state !== 'fly'){
        if (typeof offerJob !== 'function') mkWarStart();
        else offerJob('monkeywar', () => { const lv = smLv(); return {icon:'🐒', title:'猴子大战', desc:`限时赶跑 ${10 + 2 * lv} 只猴子，抢回 3 袋外卖：水枪淋，凑近了大笑`, accept:'开打', time:70 + 8 * lv,
          risk:(lv ? '对手' + PVE_NAME[lv] + ' · ' : '') + (prog.best.monkey != null ? `纪录剩 ${Math.round(prog.best.monkey)} 秒` : '猴子会成群反击'), onAccept:() => { if (!MK.war && !driving) mkWarStart(); }}; });
      }
    }
  }
  if (MK.war){
    const b = MK.war; b.t += dt; b.spawnCd -= dt;
    if (b.spawned < b.need && b.spawnCd <= 0 && MK.pool.filter(m => m.on).length < b.cap){ mkWarSpawn(px, pz); b.spawnCd = .7; }
    const left = b.limit - b.t;
    missionEl.textContent = `赶猴 ${b.done}/${b.need} · ${Math.max(0, Math.ceil(left))} 秒 · 外卖 ${b.got}/3 · 猴子大战`;      /* counts first: the phone HUD cuts long lines */
    missionEl.classList.toggle('urgent', left < 12);
    if (b.done >= b.need) mkWarEnd(true);
    else if (left <= 0 && !b.ot && b.done >= b.need - 3){ b.ot = true; b.limit += 10; sfx.ding(); gxCallout('加时 10 秒！', `只差 ${b.need - b.done} 只`, '#ffc93c'); }      /* so close: one last push */
    else if (left <= 0) mkWarEnd(false, '猴群赢了', (b.need - b.done <= 3 ? `只差 ${b.need - b.done} 只！` : '时间到。') + '山顶的光圈可以再来');
    else if (dHill > MK_HILL.r + 50) mkWarEnd(false, '跑出猴山了', '猴子大战要在山顶打');
    else if (dHill > MK_HILL.r + 22) smPrompt = '离山顶太远了，再走就算弃权';
    else if (MK.war && !driving){      /* always say what to do next: close in, or fire */
      let bd = 1e9; for (const m of MK.pool) if (m.on && m.st !== 'scared' && m.st !== 'drop') bd = Math.min(bd, Math.hypot(m.x - px, m.z - pz));
      const R = wgStat().range, key = TOUCH ? '点「水枪」' : '按 E ';
      if (bd < 1e8) smPrompt = WG.ammo < 1 ? (bd < 10 - lv ? `没水了，${TOUCH ? '点「大笑」' : '按 R 大笑'}吓跑它` : '没水了，等回水，或者凑近了大笑') : bd <= R ? (TOUCH ? '蓝线对准猴子，点「水枪」；按住拖动可以瞄' : '鼠标对准猴子，按 E 掏枪开火 · 跑动的要打提前量') : `再靠近 ${Math.ceil(bd - R)} 米就能淋到`;
    }
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
  if (MK.loot && MK.loot.m.on && !driving){ const bd = Math.hypot(MK.loot.m.x - px, MK.loot.m.z - pz), R = wgStat().range; smPrompt = bd <= R ? (TOUCH ? '蓝线对准它，点「水枪」！' : '鼠标对准它，按 E 掏枪开火！') : `追上去，再近 ${Math.ceil(bd - R)} 米就能淋到`; }
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
        return best ? {x:best.x, z:best.z, label:best.carry ? '抱着外卖的猴子' : best.big ? '猴王' : best.up > 1 ? '树上的猴子' : '猴子'} : {x:MK_HILL.x, z:MK_HILL.z, label:'猴山'};
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
    onBust(){ smReset(); if (MK.war) mkWarEnd(false, '猴子大战中断了', '被保安抓走了'); mkClear(); base.onBust(); },
    leave(){ smReset(); mkWarEnd(false); MK.rearm = false; mkClear(); mkMark.visible = false; mkLbl.dead = true; base.leave(); }
  });
}
