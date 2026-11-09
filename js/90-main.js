/* XMUM 校园漫游 · 模式切换、输入、镜头、小地图、主循环 */
'use strict';
/* ---------- modes ---------- */
let mode = 'orbit', focusGoal = null;
const player = {x:96, z:238, yaw:0, pitch:0.05};
let camYaw = 0, camPitch = .32, camDist = 9;
const orbitSave = {pos:camera.position.clone(), tgt:controls.target.clone()};
const help = $('#help'), mini = $('#mini'), joyEl = $('#joy'), acts = $('#acts'), gstat = $('#gstat'), promptEl = $('#prompt');
function setHelp(){
  if (mode === 'orbit') help.innerHTML = '拖动旋转 · 滚轮或双指缩放 · 右键平移 · <b>点一栋楼</b>看介绍 · 右上角切到<b>奶娃</b>开车、<b>黑洞</b>吞校园，或回<b>菜单</b>';
  else if (TOUCH) help.innerHTML = '左下摇杆走路（推到底是跑）· 拖动屏幕转头 · 找 8 个金色打卡点';
  else help.innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走路 · <kbd>Shift</kbd> 跑 · 拖动鼠标转头 · <kbd>←</kbd><kbd>→</kbd> 转身 · 找 8 个金色打卡点';
  help.hidden = mode === 'walk' && TOUCH;
}
function setMode(m){
  if (m === mode) return;
  if (driving) leaveCar();
  closeShop();
  if (mode === 'hole') stopHole();
  if (mode === 'naiwa'){ despawnChasers(); heat = 0; if (stunt.pts > 0) bankStunt(); comboEl.hidden = true; }
  if (mode === 'orbit'){ orbitSave.pos.copy(camera.position); orbitSave.tgt.copy(controls.target); }
  controls.enabled = m === 'orbit'; controls.autoRotate = false; focusGoal = null;
  if (m === 'walk'){ camera.fov = 70; camera.near = .2; if (!walkStart) walkStart = performance.now(); }
  else if (m === 'hole'){ camera.fov = 55; camera.near = .5; card.hidden = true; ac(); }
  else if (m === 'naiwa'){ camera.fov = 60; camera.near = .3; card.hidden = true; if (!walkStart) walkStart = performance.now(); ac(); if (!driving) camYaw = nw.h + Math.PI; }
  else { camera.fov = 50; camera.near = 2; camera.position.copy(orbitSave.pos); controls.target.copy(orbitSave.tgt); camera.lookAt(controls.target); fitShadow(0, 0, 640); }
  if (m !== 'naiwa'){ engineUpdate(0, 0, false); }
  camera.updateProjectionMatrix(); mode = m;
  ['orbit', 'walk', 'naiwa', 'hole'].forEach(k => $('#m-' + k).setAttribute('aria-pressed', String(m === k)));
  document.body.classList.toggle('naiwa', m === 'naiwa' || m === 'hole'); document.body.dataset.mode = m;
  mini.hidden = m === 'orbit'; joyEl.hidden = !(m !== 'orbit' && TOUCH);
  acts.hidden = gstat.hidden = compass.hidden = m !== 'naiwa'; promptEl.hidden = !(m === 'naiwa' || m === 'hole'); hstat.hidden = m !== 'hole';
  NW.root.visible = m !== 'hole';
  if (m === 'hole') startHole();
  setHelp(); updateActs(); canvas.focus({preventScroll:true});
}
$('#m-orbit').addEventListener('click', () => setMode('orbit'));
$('#m-walk').addEventListener('click', () => setMode('walk'));
$('#m-naiwa').addEventListener('click', () => setMode('naiwa'));
$('#m-hole').addEventListener('click', () => setMode('hole'));
const actF = $('#act-f'), actSp = $('#act-sp'), actR = $('#act-r'), actQ = $('#act-q');
function updateActs(){
  actF.querySelector('b').textContent = driving ? '下车' : '上车';
  actSp.querySelector('b').textContent = driving ? '漂移' : '跳';
  actR.querySelector('b').textContent = driving ? '喇叭' : '大笑';
  actQ.disabled = !!driving;
}
function doF(){
  if (mode !== 'naiwa') return;
  if (driving){
    const sp = Math.hypot(driving.vx, driving.vz);
    if (sp > 12) eject(sp * .8); else leaveCar();
  } else if (nw.state !== 'fly'){ const c = nearestCar(); if (c) enterCar(c); }
}
function doR(){ if (mode !== 'naiwa') return; if (driving) sfx.horn(); else footAction('laugh'); }
const holdBtn = (el, on, off) => {
  el.addEventListener('pointerdown', e => { e.preventDefault(); ac(); el.classList.add('on'); on(); });
  const up = () => { el.classList.remove('on'); off && off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
};
holdBtn(actF, doF); holdBtn(actR, doR); holdBtn(actQ, () => footAction('pose'));
holdBtn(actSp, () => { keys.Space = true; if (!driving) footAction('jump'); }, () => { keys.Space = false; });

/* ---------- info card ---------- */
const card = $('#card'); let cardInfo = null;
function infoPos(i){ if (i.wx != null) return [i.wx, i.wz]; if (i.spawn) return [i.spawn[0], i.spawn[1]]; return [0, 0]; }
function showCard(info){
  cardInfo = info;
  $('#ctag').textContent = info.tag; $('#cname').textContent = info.name; $('#cdesc').textContent = info.desc;
  $('#cmeta').textContent = info.floors ? '约 ' + info.floors + ' 层' : '';
  card.hidden = false;
  if (mode === 'orbit'){ const [x, z] = infoPos(info); focusGoal = new THREE.Vector3(x, 0, z); }
}
$('#cardx').addEventListener('click', () => { card.hidden = true; cardInfo = null; });
$('#cardwalk').addEventListener('click', () => {
  const i = cardInfo; if (!i) return;
  let x, z, yaw;
  if (i.spawn){ [x, z, yaw] = i.spawn; }
  else { const p = frontPoint(i) || [i.wx, i.wz + i.wd]; [x, z] = p; yaw = i.wrot; }
  player.x = x; player.z = z; player.yaw = yaw || 0; player.pitch = .18;
  card.hidden = true; setMode('walk');
});

/* ---------- input ---------- */
const keys = {};
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
  if (mode === 'naiwa' && !e.repeat){
    ac();
    if (e.code === 'KeyF' || e.code === 'Enter') doF();
    if (e.code === 'Space' && !driving) footAction('jump');
    if (e.code === 'KeyR') doR();
    if (e.code === 'KeyH' && driving) sfx.horn();
    if (e.code === 'KeyQ' && !driving) footAction('pose');
    if (e.code === 'KeyG') $('#shop').hidden ? openShop() : closeShop();
    if (e.code === 'Escape') closeShop();
  }
  keys[e.code] = true;
  if (mode !== 'orbit' && /^Arrow|Space/.test(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let down = null;
canvas.addEventListener('pointerdown', e => {
  if (down) return;
  down = {id:e.pointerId, lx:e.clientX, ly:e.clientY, moved:0};
  controls.autoRotate = false; canvas.classList.remove('grab'); ac();
});
window.addEventListener('pointermove', e => {
  if (!down || e.pointerId !== down.id) return;
  const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
  down.moved += Math.abs(dx) + Math.abs(dy);
  if (mode === 'walk'){ player.yaw -= dx * .0045; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - dy * .0045)); }
  if (mode === 'hole'){ camYaw -= dx * .005; }
  if (mode === 'naiwa'){ camYaw -= dx * .005; camPitch = Math.max(-.1, Math.min(1.2, camPitch + dy * .004)); camYawHold = 1.6; }
});
const endDown = e => {
  if (!down || e.pointerId !== down.id) return;
  if (down.moved < 6 && e.type === 'pointerup' && (mode === 'orbit' || mode === 'walk')) pick(e.clientX, e.clientY);
  down = null; canvas.classList.add('grab');
};
window.addEventListener('pointerup', endDown); window.addEventListener('pointercancel', endDown);
canvas.addEventListener('wheel', e => { if (mode !== 'naiwa') return; e.preventDefault(); camDist = Math.max(5, Math.min(40, camDist * (1 + e.deltaY * .0012))); }, {passive:false});
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(cx, cy){
  const r = canvas.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (hit && hit.object.userData.info) showCard(hit.object.userData.info);
  else if (mode === 'orbit'){ card.hidden = true; cardInfo = null; }
}
const knob = $('#knob'), joy = {x:0, y:0}; let joyId = null;
function moveJoy(e){
  const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const R = r.width / 2 - 20, l = Math.hypot(dx, dy); if (l > R){ dx *= R / l; dy *= R / l; }
  joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); ac(); e.preventDefault(); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = e => { if (e.pointerId === joyId){ joyId = null; joy.x = joy.y = 0; knob.style.transform = 'translate(-50%,-50%)'; } };
joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);

/* ---------- first-person walking ---------- */
let bobT = 0;
function updateWalk(dt){
  if (keys.ArrowLeft || keys.KeyQ) player.yaw += 1.9 * dt;
  if (keys.ArrowRight || keys.KeyE) player.yaw -= 1.9 * dt;
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  let r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
  const l = Math.hypot(f, r); if (l > 1){ f /= l; r /= l; }
  const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > .95;
  const v = (run ? 18 : 7) * dt, s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const mx = (-s * f + c * r) * v, mz = (-c * f - s * r) * v;
  const stuck = blocked(player.x, player.z);
  if (stuck || !blocked(player.x + mx, player.z)) player.x += mx;
  if (stuck || !blocked(player.x, player.z + mz)) player.z += mz;
  const moving = l > .05; if (moving && !REDUCED) bobT += dt * (run ? 13 : 9);
  camera.position.set(player.x, 1.7 + groundAt(player.x, player.z) * (groundAt(player.x, player.z) > 0 ? 1 : 0) + (moving && !REDUCED ? Math.sin(bobT) * .05 : 0), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  fitShadow(Math.round(player.x / 20) * 20, Math.round(player.z / 20) * 20, 170);
  checkCPs(player.x, player.z);
}

/* ---------- third-person 奶娃 mode ---------- */
let camYawHold = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), _cv = new THREE.Vector3();
function updateNaiwaMode(dt, T){
  const c = driving;
  if (c){
    const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) - joy.x;
    updateCar(c, dt, {thr:Math.max(-1, Math.min(1, thr)), steer:Math.max(-1, Math.min(1, steer)), brake:!!keys.Space});
  }
  updateChase(dt);
  for (const o of cars) if (o !== driving) updateCar(o, dt, o.patrol && o.active ? o.inp : {thr:0, steer:0, brake:true});
  carCollisions();
  if (!driving) updateFoot(dt);
  if (!driving){ NW.root.position.set(nw.x, nw.y, nw.z); NW.root.rotation.y = nw.h; }
  const px = driving ? driving.x : nw.x, pz = driving ? driving.z : nw.z;
  const sp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
  $('#speed').textContent = Math.round(sp * 3.6) + ' km/h';
  updateStunt(dt, sp);
  { const t = driving ? Math.round(driving.hp) + '%' : '—', el = $('#hp'); if (el.textContent !== t){ el.textContent = t; el.style.color = driving && driving.hp < 30 ? 'var(--tile)' : ''; } }
  showCar.root.rotation.y += dt * .4;
  engineUpdate(sp, driving ? driving.slip : 0, !!driving);
  /* camera */
  camYawHold = Math.max(0, camYawHold - dt);
  let tx, ty, tz, dist, pitch;
  if (driving){
    const want = driving.h + Math.PI; let dyaw = Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw));
    if (camYawHold <= 0) camYaw += dyaw * Math.min(1, dt * 3.5);
    tx = driving.x; ty = driving.y + driving.T.H * .6 + 1; tz = driving.z;
    dist = driving.T.L * .8 + 6 + sp * .08; pitch = .2;
    camera.fov += ((60 + sp * .35) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  } else {
    tx = nw.x; ty = nw.y + 2.4; tz = nw.z; dist = camDist; pitch = camPitch;
    if (camera.fov !== 60){ camera.fov += (60 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  }
  const cp = Math.cos(pitch), spch = Math.sin(pitch);
  let d = dist;
  for (let k = 1; k <= 10; k++){
    const dd = dist * k / 10, x = tx + Math.sin(camYaw) * dd * cp, z = tz + Math.cos(camYaw) * dd * cp;
    if (hitsBuilding(x, z, .6)){ d = Math.max(2.5, dd - dist / 10); break; }
  }
  camPos.set(tx + Math.sin(camYaw) * d * cp, Math.max(.6, ty + d * spch), tz + Math.cos(camYaw) * d * cp);
  if (camShake > .01){ camPos.x += (rnd() - .5) * camShake; camPos.y += (rnd() - .5) * camShake; camPos.z += (rnd() - .5) * camShake; camShake *= Math.exp(-dt * 6); }
  const k = driving ? 1 - Math.exp(-dt * 10) : 1;
  camera.position.lerp(camPos, k);
  camLook.set(tx, ty, tz); camera.lookAt(camLook);
  fitShadow(Math.round(px / 20) * 20, Math.round(pz / 20) * 20, 150);
  /* prompts */
  let msg = '';
  if (driving) msg = TOUCH ? '摇杆开车 · 漂移按住 · 速度快时下车会被甩出去' : 'W/S 油门刹车 · A/D 转向 · 按住空格漂移 · H 喇叭 · F 下车';
  else if (nw.state === 'fly') msg = '啊啊啊啊——';
  else { const nc = nearestCar(); msg = nc ? (TOUCH ? '点「上车」开走这辆' : '按 F 上车') + ' · ' + nc.T.name : (TOUCH ? '找辆车开 · 或者走进橙色光圈接外卖' : 'WASD 走 · 空格跳 · R 大笑 · Q 撩头 · 找辆车按 F 上车'); }
  if (!driving && nw.state !== 'fly' && Math.hypot(nw.x - SHOWROOM[0], nw.z - SHOWROOM[1]) < 11) msg = TOUCH ? '点右上角「XMUM 车行」看车' : '按 G 打开 XMUM 车行';
  else if (driving && driving.wrecked) msg = '这辆车报废了，按 F 下车换一辆';
  if (promptEl.textContent !== msg) promptEl.textContent = msg;
  updateMission(dt, px, pz); updateCompass(px, pz);
  checkCPs(px, pz);
}
const toastEl = $('#toast'); let toastTimer = 0;
function toast(t, sub, ms){
  toastEl.innerHTML = ''; toastEl.append(t); if (sub){ const s = document.createElement('small'); s.textContent = sub; toastEl.append(s); }
  toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2200);
}

/* ---------- minimap (north-up, 520 m window) ---------- */
const mg = mini.getContext('2d');
function drawMini(cx, cz, yaw){
  const Sz = mini.width, k = Sz / 520, X = x => Sz / 2 + (x - cx) * k, Z = z => Sz / 2 + (z - cz) * k;
  mg.fillStyle = '#74a955'; mg.fillRect(0, 0, Sz, Sz);
  mg.fillStyle = '#4d8a3e'; mg.beginPath(); FOREST.forEach(([x, z], i) => i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z))); mg.fill();
  mg.lineCap = 'round'; mg.lineJoin = 'round';
  for (const r of ROADS_W){ mg.strokeStyle = r.m === asphalt ? '#cfcac0' : '#e6dcc8'; mg.lineWidth = Math.max(1.5, r.w * k); mg.beginPath(); r.p.forEach(([x, z], i) => i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z))); mg.stroke(); }
  mg.fillStyle = '#3f8fb0'; for (const L of lakes){ mg.beginPath(); L.forEach(([x, z], i) => i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z))); mg.fill(); }
  mg.fillStyle = '#b9563d'; mg.beginPath(); mg.ellipse(X(FIELD.x), Z(FIELD.z), FIELD.rx * k, FIELD.rz * k, 0, 0, 7); mg.fill();
  mg.fillStyle = '#4f9a45'; mg.beginPath(); mg.ellipse(X(FIELD.x), Z(FIELD.z), FIELD.rx * k * .78, FIELD.rz * k * .78, 0, 0, 7); mg.fill();
  for (const f of footprints){
    if (f.dead) continue;
    mg.fillStyle = f.color || '#c4522c';
    if (f.t === 1){ mg.beginPath(); mg.arc(X(f.x), Z(f.z), f.r * k, 0, 7); mg.fill(); continue; }
    mg.save(); mg.translate(X(f.x), Z(f.z)); mg.rotate(-f.rot); mg.fillRect(-f.w / 2 * k, -f.d / 2 * k, f.w * k, f.d * k); mg.restore();
  }
  const dot = (x, z, col, r) => { let px = X(x), pz = Z(z); const edge = px < 8 || px > Sz - 8 || pz < 8 || pz > Sz - 8;
    px = Math.max(8, Math.min(Sz - 8, px)); pz = Math.max(8, Math.min(Sz - 8, pz));
    mg.fillStyle = col; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2; mg.beginPath(); mg.arc(px, pz, edge ? r - 2 : r, 0, 7); mg.fill(); mg.stroke(); };
  if (mode === 'naiwa'){
    for (const c of cars) if (c !== driving && c.root.visible){ mg.save(); mg.translate(X(c.x), Z(c.z)); mg.rotate(-c.h); mg.fillStyle = c.patrol ? '#e74c3c' : '#ffffff'; mg.fillRect(-c.T.W * k * 1.5, -c.T.L * k * .75, c.T.W * k * 3, c.T.L * k * 1.5); mg.restore(); }
    if (mission.on) dot(mission.to.x, mission.to.z, '#4fd18b', 9); else for (const pk of PICKUPS) dot(pk.x, pk.z, '#ff8a3d', 8);
  }
  if (mode === 'hole'){ for (const h of HOLES){ if (!h.alive) continue; mg.fillStyle = '#120a22'; mg.strokeStyle = h.color; mg.lineWidth = h.you ? 3 : 2; mg.beginPath(); mg.arc(X(h.x), Z(h.z), Math.max(4, h.r * k), 0, 7); mg.fill(); mg.stroke(); } }
  else for (const cp of CPS) if (!cp.done) dot(cp.x, cp.z, '#ffd24a', 6);
  mg.save(); mg.translate(Sz / 2, Sz / 2); mg.rotate(-yaw);
  mg.fillStyle = '#1f2a33'; mg.strokeStyle = '#ffffff'; mg.lineWidth = 2.5;
  mg.beginPath(); mg.moveTo(0, -12); mg.lineTo(8, 9); mg.lineTo(0, 4); mg.lineTo(-8, 9); mg.closePath(); mg.stroke(); mg.fill(); mg.restore();
  mg.fillStyle = '#1f2a33'; mg.font = '700 18px sans-serif'; mg.fillText('N', Sz / 2 - 6, 20);
}

/* ---------- loop ---------- */
function resize(){ const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
const v3 = new THREE.Vector3();
let last = performance.now(); const t0 = last;
setHelp(); applyTime(1); updateActs();
function frame(now){
  const dt = Math.min(.05, (now - last) / 1000); last = now; const T = (now - t0) / 1000;
  if (mode === 'walk') updateWalk(dt);
  else if (mode === 'naiwa') updateNaiwaMode(dt, T);
  else if (mode === 'hole') updateHole(dt, T);
  else {
    if (focusGoal){
      const before = controls.target.clone();
      controls.target.lerp(focusGoal, 1 - Math.exp(-dt * 4));
      camera.position.add(v3.copy(controls.target).sub(before));
      if (controls.target.distanceTo(focusGoal) < .1) focusGoal = null;
    }
    controls.update();
  }
  if (mode !== 'naiwa'){ for (const pk of PICKUPS) pk.m.visible = false; destMark.visible = false; }
  animNaiwa(dt, T);
  updateNPCs(dt, T); updateFountain(dt);
  updateParts(dt);
  applyTime(1 - Math.exp(-dt * 2.5));
  headMat.emissiveIntensity = .1 + cur.lamp * 1.4; tailMat.emissiveIntensity = .1 + cur.lamp;
  for (const cp of CPS){
    if (cp.done && cp.fade > 0){ cp.fade = Math.max(0, cp.fade - dt * 2.5); cp.g.scale.setScalar(.001 + cp.fade); cp.bm.opacity = .24 * cp.fade; if (!cp.fade) cp.g.visible = false; }
    if (cp.g.visible){ cp.coin.rotation.y = T * 1.6 + cp.phase; cp.coin.position.y = REDUCED ? 0 : Math.sin(T * 2 + cp.phase) * .3; }
  }
  if (!REDUCED) for (const c of clouds){ c.position.x += dt * 5; if (c.position.x > 1600) c.position.x = -1600; }
  const W = window.innerWidth, H = window.innerHeight, dist = camera.position.distanceTo(controls.target);
  for (const L of labels){
    if (L.dead){ L.el.style.visibility = 'hidden'; continue; }
    v3.copy(L.pos).project(camera);
    let show = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
    if (show && mode === 'hole') show = L.hole || camera.position.distanceTo(L.pos) < (L.minor ? 220 : 600);
    else if (show && mode !== 'orbit') show = camera.position.distanceTo(L.pos) < (L.minor ? 160 : 320);
    else if (show && L.minor) show = dist < 650;
    if (show){ L.el.style.visibility = 'visible'; L.el.style.transform = `translate(-50%,-100%) translate(${(v3.x * .5 + .5) * W}px,${(-v3.y * .5 + .5) * H}px)`; }
    else L.el.style.visibility = 'hidden';
  }
  if (mode === 'walk') drawMini(player.x, player.z, player.yaw);
  else if (mode === 'hole') drawMini(hole.x, hole.z, camYaw);
  else if (mode === 'naiwa') drawMini(driving ? driving.x : nw.x, driving ? driving.z : nw.z, (driving ? driving.h : nw.h) + Math.PI);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
