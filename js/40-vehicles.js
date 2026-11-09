/* XMUM 校园漫游 · 跳台、车辆模型与物理、上下车、步行 */
'use strict';
/* ---------- ramps ---------- */
const rampMat = M('#e1b12c', {roughness:.6});
const RAMPS = [[228, 36, Math.PI, 11, 6, 3.2], [360, 150, Math.PI, 11, 6, 3.2], [192, 190, Math.PI / 2, 12, 7, 3], [-564, 30, Math.PI, 11, 7, 3.2]].map(([x, z, h, L, W, H]) => {
  const r = {x, z, fx:Math.sin(h), fz:Math.cos(h), L, W, H};
  const sh = new THREE.Shape(); sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.lineTo(L / 2, H); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth:W, bevelEnabled:false}); g.translate(0, 0, -W / 2);
  const m = new THREE.Mesh(g, rampMat); m.position.set(x, 0, z); m.rotation.y = Math.atan2(-r.fz, r.fx); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (const sx of [-1, 1]){ const st = box(L * .98, .08, .5, M('#222222'), 0, 0, 0); st.position.set(0, 0, 0); m.add(st); st.position.set(0, H / 2 + .05, sx * (W / 2 - .25)); st.rotation.z = Math.atan2(H, L); }
  return r;
});
/* clear trees and lamps that grew on a ramp */
for (const set of knockSets) set.spots.forEach((o, i) => {
  if (RAMPS.some(r => { const dx = o.x - r.x, dz = o.z - r.z; return Math.abs(dx * r.fx + dz * r.fz) < r.L / 2 + 3 && Math.abs(dx * r.fz - dz * r.fx) < r.W / 2 + 3; })){
    o.down = true; o.hidden = true; o.s = 0; setKnock(set, i, false, 0, 0);
  }
});
function groundAt(x, z){
  for (const r of RAMPS){
    const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, v = dx * r.fz - dz * r.fx;
    if (Math.abs(v) < r.W / 2 && u > -r.L / 2 && u < r.L / 2) return r.H * (u + r.L / 2) / r.L;
  }
  for (const L of lakes) if (inPoly(x, z, L)) return -.9;
  return 0;
}

/* ---------- vehicles ---------- */
const CAR_T = {
  bus:   {L:11, W:2.7, H:3.2, wb:6.4, r:.55, maxV:24, acc:8,  grip:4.5, steer:.5,  mass:8,   seat:[.7, .95, 3.6], name:'校巴'},
  sedan: {L:4.4, W:1.85, H:1.45, wb:2.7, r:.36, maxV:44, acc:15, grip:6.5, steer:.55, mass:1.5, seat:[0, .4, -.2], name:'小车'},
  cart:  {L:2.8, W:1.45, H:1.95, wb:1.9, r:.26, maxV:17, acc:10, grip:8,  steer:.6,  mass:.8,  seat:[.22, .5, -.3], name:'高尔夫球车'},
  myvi:  {L:3.7, W:1.7, H:1.55, wb:2.4, r:.32, maxV:38, acc:13, grip:7,  steer:.58, mass:1.1, seat:[0, .4, -.25], name:'Perodua Myvi'},
  p911:  {L:4.5, W:1.85, H:1.25, wb:2.45, r:.35, maxV:62, acc:24, grip:8.2, steer:.56, mass:1.4, seat:[0, .25, -.45], name:'保时捷 911'},
  mase:  {L:5.0, W:1.95, H:1.4, wb:3.0, r:.37, maxV:66, acc:22, grip:7.6, steer:.5,  mass:1.8, seat:[0, .3, -.35], name:'玛莎拉蒂 GT'},
  lambo: {L:4.6, W:2.05, H:1.1, wb:2.7, r:.36, maxV:80, acc:30, grip:8.6, steer:.52, mass:1.5, seat:[0, .18, -.25], name:'兰博基尼'},
  rr:    {L:5.6, W:2.05, H:1.75, wb:3.4, r:.42, maxV:60, acc:17, grip:6.6, steer:.46, mass:2.6, seat:[0, .45, -.45], name:'劳斯莱斯', armor:.6},
  patrol:{L:3.2, W:1.6, H:1.95, wb:2.1, r:.3, maxV:31, acc:15, grip:7.5, steer:.62, mass:1.2, seat:[.24, .5, -.3], name:'保安巡逻车'}
};
const glassMat = new THREE.MeshStandardMaterial({color:'#2b3a44', roughness:.1, metalness:.4, transparent:true, opacity:.5});
const tyreMat = M('#1c1c1e', {roughness:.7}), headMat = new THREE.MeshStandardMaterial({color:'#fff6d8', emissive:'#fff1c0', emissiveIntensity:.1});
const tailMat = new THREE.MeshStandardMaterial({color:'#b3261e', emissive:'#ff3b2f', emissiveIntensity:.1});
const cars = [];
function makeCar(kind, color, x, z, h){
  const T = CAR_T[kind], root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.rotation.order = 'YXZ';
  const paint = M(color, {roughness:.35, metalness:.25});
  let lights = null;
  const add = (w, hh, d, mat, px, py, pz) => box(w, hh, d, mat, px, py, pz, body);
  if (kind === 'bus'){
    add(T.W, T.H - .55, T.L, paint, 0, .55 + (T.H - .55) / 2, 0);
    add(T.W + .04, 1.05, T.L - 1.4, glassMat, 0, 2.2, -.3);
    add(T.W * .92, 1.3, .08, glassMat, 0, 2.05, T.L / 2);
    add(T.W + .05, .3, T.L + .02, M('#c4502a'), 0, 1.15, 0);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const g = cv.getContext('2d');
    g.fillStyle = '#c4502a'; g.font = '700 30px "Noto Sans SC",sans-serif'; g.textBaseline = 'middle'; g.fillText('XMUM 校巴', 8, 26);
    const tm = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv), transparent:true});
    for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(4, .75), tm); p.position.set(s * (T.W / 2 + .03), 1.5, 0); p.rotation.y = s * Math.PI / 2; body.add(p); }
  } else if (kind === 'sedan'){
    add(T.W, .6, T.L, paint, 0, .6, 0);
    add(T.W * .88, .56, T.L * .5, glassMat, 0, 1.18, -.2);
    add(T.W * .9, .07, T.L * .46, paint, 0, 1.48, -.2);
  } else if (kind === 'myvi'){
    add(T.W, .72, T.L, paint, 0, .7, 0);
    add(T.W * .9, .62, T.L * .6, glassMat, 0, 1.36, -.2);
    add(T.W * .92, .07, T.L * .56, paint, 0, 1.7, -.22);
    add(T.W * .5, .14, .05, M('#2b2b2b'), 0, .62, T.L / 2 + .01);
  } else if (kind === 'p911'){
    add(T.W, .48, T.L, paint, 0, .52, 0);
    add(T.W * .8, .4, T.L * .38, glassMat, 0, .95, -.3);
    add(T.W * .82, .06, T.L * .32, paint, 0, 1.16, -.36);
    const tail = add(T.W * .84, .1, T.L * .3, paint, 0, .86, -T.L * .3); tail.rotation.x = -.28;
    add(T.W * .7, .05, .32, paint, 0, .98, -T.L / 2 + .2);
    for (const sx of [-1, 1]) add(.36, .3, .3, M('#f6f1d8', {emissive:'#fff1c0', emissiveIntensity:.2}), sx * T.W * .32, .66, T.L / 2 - .1);
  } else if (kind === 'mase'){
    add(T.W, .55, T.L, paint, 0, .56, 0);
    add(T.W * .84, .44, T.L * .42, glassMat, 0, 1.04, -.3);
    add(T.W * .86, .06, T.L * .38, paint, 0, 1.28, -.32);
    add(T.W * .46, .28, .06, M('#c9cdd1', {metalness:.8, roughness:.25}), 0, .62, T.L / 2 + .01);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(.03, .07, .3, M('#c9cdd1', {metalness:.8, roughness:.25}), sx * (T.W / 2 + .01), .7, T.L * .22 - k * .12);
  } else if (kind === 'lambo'){
    add(T.W, .42, T.L, paint, 0, .44, 0);
    const nose = add(T.W * .96, .1, T.L * .3, paint, 0, .68, T.L * .3); nose.rotation.x = .16;
    add(T.W * .76, .3, T.L * .32, glassMat, 0, .8, -.15);
    add(T.W * .78, .05, T.L * .26, paint, 0, .97, -.2);
    add(T.W * .92, .06, .42, M('#1b1b1d'), 0, 1.06, -T.L / 2 + .25);
    for (const sx of [-1, 1]){ add(.05, .32, .05, M('#1b1b1d'), sx * T.W * .3, .88, -T.L / 2 + .25); add(.06, .22, .7, M('#1b1b1d'), sx * (T.W / 2 + .01), .5, -.4); }
  } else if (kind === 'rr'){
    add(T.W, .8, T.L, paint, 0, .74, 0);
    add(T.W * .93, .6, T.L * .48, glassMat, 0, 1.44, -.35);
    add(T.W * .95, .08, T.L * .5, M('#c9c6bd', {metalness:.3, roughness:.4}), 0, 1.78, -.35);
    add(T.W * .98, .1, T.L + .02, M('#c9c6bd', {metalness:.3, roughness:.4}), 0, 1.08, 0);
    add(T.W * .42, .56, .1, M('#d7dadc', {metalness:.85, roughness:.2}), 0, .9, T.L / 2 + .03);
    add(.08, .16, .08, M('#d7dadc', {metalness:.85, roughness:.2}), 0, 1.24, T.L / 2 - .25);
  } else {
    add(T.W, .28, T.L, paint, 0, .45, 0);
    add(T.W * .9, .45, .55, M('#2b2b2b'), 0, .82, -.35);
    add(T.W + .1, .07, T.L * .9, white, 0, 2.0, -.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(.06, 1.4, .06, M('#9aa0a6'), sx * T.W / 2, 1.3, sz * T.L * .38 - .1);
    if (kind === 'patrol'){
      lights = [new THREE.MeshStandardMaterial({color:'#b3261e', emissive:'#ff2b2b', emissiveIntensity:.1}), new THREE.MeshStandardMaterial({color:'#1e4fb3', emissive:'#2b6bff', emissiveIntensity:.1})];
      add(.55, .2, .32, lights[0], -.3, 2.13, -.1); add(.55, .2, .32, lights[1], .3, 2.13, -.1);
      add(T.W + .02, .3, T.L * .5, M('#1f3a6b'), 0, .62, 0);
    }
  }
  for (const sx of [-1, 1]){ add(.35, .16, .06, headMat, sx * T.W * .32, kind === 'bus' ? .9 : .65, T.L / 2 + .01); add(.3, .14, .06, tailMat, sx * T.W * .34, kind === 'bus' ? .9 : .7, -T.L / 2 - .01); }
  const wheels = [], fronts = [];
  const wg = new THREE.CylinderGeometry(T.r, T.r, .3, 14); wg.rotateZ(Math.PI / 2);
  for (const sz of [1, -1]) for (const sx of [-1, 1]){
    const piv = new THREE.Group(); piv.position.set(sx * (T.W / 2 - .08), T.r, sz * T.wb / 2); body.add(piv);
    const w = new THREE.Mesh(wg, tyreMat); w.castShadow = true; piv.add(w); wheels.push(w); if (sz > 0) fronts.push(piv);
  }
  root.position.set(x, 0, z); root.rotation.y = h; scene.add(root);
  const c = {kind, T, root, body, wheels, fronts, x, z, h, vx:0, vz:0, y:0, vy:0, lastVy:0, air:false, airT:0, steer:0, slip:0, pitch:0, wet:false,
    R:(T.L + T.W) / 4, mass:T.mass, home:[x, z, h], lights, paint, color0:color, hp:100, wrecked:false, crashCd:0, smokeAcc:0};
  cars.push(c); return c;
}
makeCar('sedan', '#c0392b', 104, 197, Math.PI);
makeCar('bus', '#f4f1ea', ...P(1080, 855), Math.PI / 2);
makeCar('sedan', '#2d5d8a', ...P(1300, 855), Math.PI / 2);
makeCar('sedan', '#1f1f22', ...P(1000, 258), -Math.PI / 2);
makeCar('sedan', '#f0eee8', ...P(1580, 620), Math.PI);
makeCar('cart', '#3f8a5a', ...P(1060, 668), Math.PI / 2);
makeCar('cart', '#f0eee8', ...P(1530, 250), 0);
makeCar('cart', '#3f8a5a', ...P(300, 730), Math.PI / 2);
function carCircles(c, x, z, h){
  const n = c.kind === 'bus' ? 3 : 2, fx = Math.sin(h), fz = Math.cos(h), half = c.T.L / 2 - c.T.W / 2, out = [];
  for (let i = 0; i < n; i++){ const o = n === 1 ? 0 : -half + 2 * half * i / (n - 1); out.push([x + fx * o, z + fz * o]); }
  return out;
}
function carBlocked(c, x, z, h){
  const r = c.T.W / 2 + .1;
  return carCircles(c, x, z, h).some(([px, pz]) => px - r < -600 || px + r > 600 || pz - r < -275 || pz + r > 262 || hitsBuilding(px, pz, r));
}
let driving = null, camShake = 0;
function updateCar(c, dt, inp){
  const T = c.T;
  let fx = Math.sin(c.h), fz = Math.cos(c.h), rx = fz, rz = -fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz;
  const wasWet = c.wet; c.wet = lakes.some(L => inPoly(c.x, c.z, L));
  if (c.wet && !wasWet && Math.hypot(c.vx, c.vz) > 4){ sfx.splash(); for (let i = 0; i < 14; i++) spawnPart('dust', c.x + (rnd() - .5) * 4, .5, c.z + (rnd() - .5) * 4, 2.5, {vx:(rnd() - .5) * 8, vy:6 + rnd() * 6, vz:(rnd() - .5) * 8, g:18, life:1, op:.9, color:'#cfeaf5'}); }
  if (!c.air){
    const thr = c.wrecked ? 0 : inp.thr;
    if (thr > 0) vf += T.acc * thr * dt * (vf < -.5 ? 2.5 : 1) * (c.wet ? .35 : 1);
    else if (thr < 0){ if (vf > .5) vf += T.acc * 2.4 * thr * dt; else vf += T.acc * .7 * thr * dt; }
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
    vf -= vf * (.1 + (c.wet ? 1.5 : 0)) * dt;
    vf = Math.max(-T.maxV * .35, Math.min(T.maxV, vf));
    vl -= vl * Math.min(1, (inp.brake ? 1.1 : T.grip) * dt);
    if (inp.brake) vf -= vf * .55 * dt;
    c.steer += (inp.steer * T.steer - c.steer) * Math.min(1, dt * 7);
    const se = c.steer / (1 + Math.abs(vf) * .025);
    c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
    c.h += vf / T.wb * Math.tan(se) * dt * (inp.brake ? 1.9 : 1);
    fx = Math.sin(c.h); fz = Math.cos(c.h); rx = fz; rz = -fx;
    c.slip = Math.abs(c.vx * rx + c.vz * rz);
    if (c.slip > 3.5 && !c.wet){ for (const sx of [-1, 1]) skidAt(c.x - fx * T.wb / 2 + rx * sx * (T.W / 2 - .1), c.z - fz * T.wb / 2 + rz * sx * (T.W / 2 - .1), c.h, c.y); }
  } else c.slip = 0;
  c.crashCd -= dt;
  if (carBlocked(c, c.x, c.z, c.h)){
    outer: for (const rr of [.3, .6, 1, 1.6, 2.4, 3.5]) for (let a = 0; a < 8; a++){
      const x = c.x + Math.cos(a * .785) * rr, z = c.z + Math.sin(a * .785) * rr;
      if (!carBlocked(c, x, z, c.h)){ c.x = x; c.z = z; break outer; }
    }
  }
  const ox = c.x, oz = c.z, wedged = false;
  const nSub = Math.max(1, Math.ceil(Math.hypot(c.vx, c.vz) * dt / .7));
  let hit = false;
  for (let si = 1; si <= nSub; si++){
    const nx2 = ox + c.vx * dt * si / nSub, nz2 = oz + c.vz * dt * si / nSub;
    if (!wedged && carBlocked(c, nx2, nz2, c.h)){ hit = true; break; }
    c.x = nx2; c.z = nz2;
  }
  if (hit){
    const rem = dt * .9, okX = !carBlocked(c, c.x + c.vx * rem, c.z, c.h), okZ = !carBlocked(c, c.x, c.z + c.vz * rem, c.h);
    let impact;
    if (okX && !okZ){ impact = Math.abs(c.vz); c.x += c.vx * rem; c.vz *= -.25; c.vx *= .975; }
    else if (okZ && !okX){ impact = Math.abs(c.vx); c.z += c.vz * rem; c.vx *= -.25; c.vz *= .975; }
    else { impact = Math.hypot(c.vx, c.vz); c.vx *= -.3; c.vz *= -.3; }
    if (impact > 5 && c.crashCd <= 0){
      c.crashCd = .35;
      sfx.crash(Math.min(1, impact / 25)); dustBurst(c.x + fx * T.L / 2, 1, c.z + fz * T.L / 2, 5, 3);
      if (c === driving){ camShake = Math.min(2.5, impact / 10); judgeCrash(c, impact); }
    }
  }
  const sp = Math.hypot(c.vx, c.vz);
  if (sp > 4){
    const n = knockAround(c.x + fx * T.L * .35, c.z + fz * T.L * .35, T.W / 2 + 1.1, c.x - fx * 5, c.z - fz * 5);
    if (n){ c.vx *= .86; c.vz *= .86; sfx.thud(.6); if (c === driving){ camShake = Math.max(camShake, .6); heat += n * .12; addStunt('撞倒', 15 * n); } }
  }
  const g = groundAt(c.x, c.z);
  if (c.air){
    c.vy -= 26 * dt; c.y += c.vy * dt; c.airT += dt;
    if (c.y <= g){
      c.y = g; c.air = false;
      if (c.vy < -6){ sfx.thud(Math.min(1, -c.vy / 18)); dustBurst(c.x, .5, c.z, 6, 3); if (c === driving) camShake = Math.min(2, -c.vy / 10); }
      if (c === driving && c.airT > .55) addStunt(c.wet ? '飞进湖里' : '飞跃 ' + c.airT.toFixed(1) + ' 秒', Math.round(c.airT * 400));
      c.vy = 0; c.lastVy = 0;
    }
  } else {
    const vy = (g - c.y) / Math.max(dt, 1e-3);
    if (g < c.y - .3 && c.lastVy > 1){ c.air = true; c.airT = 0; c.vy = c.lastVy * 1.25; }
    else { c.y = g; c.lastVy = Math.max(-5, Math.min(20, vy)); }
  }
  if (c.hp < 45 && c.root.visible){
    c.smokeAcc += dt * (c.hp < 20 ? 14 : 6);
    while (c.smokeAcc > 1){ c.smokeAcc--; spawnPart('dust', c.x + fx * T.L * .38, c.y + T.H * .8, c.z + fz * T.L * .38, 1.2, {vx:(rnd() - .5), vy:2.5, vz:(rnd() - .5), grow:2.2, life:1.6, op:.55, color:c.hp < 20 ? '#2b2b2b' : '#8d8d8d'}); }
  }
  const targetPitch = -Math.atan2(c.air ? c.vy : c.lastVy, Math.max(5, Math.abs(vf))) * .85;
  c.pitch += (targetPitch - c.pitch) * Math.min(1, dt * 8);
  c.root.position.set(c.x, c.y, c.z); c.root.rotation.set(c.pitch, c.h, -c.steer * Math.min(1, Math.abs(vf) / 30) * .12);
  for (const w of c.wheels) w.rotation.x += vf / T.r * dt;
  for (const p of c.fronts) p.rotation.y = c.steer;
}
function carCollisions(){
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++){
    const a = cars[i], b = cars[j]; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.R + b.R;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, ov = min - d, ia = 1 / a.mass, ib = 1 / b.mass;
    const pa = ov * ia / (ia + ib), pb = ov * ib / (ia + ib);
    if (!carBlocked(a, a.x - nx * pa, a.z - nz * pa, a.h)){ a.x -= nx * pa; a.z -= nz * pa; }
    if (!carBlocked(b, b.x + nx * pb, b.z + nz * pb, b.h)){ b.x += nx * pb; b.z += nz * pb; }
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0){
      const jimp = -(1.4) * rv / (ia + ib);
      a.vx -= jimp * ia * nx; a.vz -= jimp * ia * nz; b.vx += jimp * ib * nx; b.vz += jimp * ib * nz;
      if (-rv > 5){ sfx.crash(Math.min(1, -rv / 20)); dustBurst(a.x + nx * a.R, 1, a.z + nz * a.R, 4, 2.5); if (a === driving || b === driving){ camShake = Math.min(2, -rv / 10); if (-rv > 7){ heat += (a.patrol || b.patrol) ? .5 : .3; addStunt('撞车', Math.round(-rv * 8)); } } }
    }
  }
}

/* enter / exit / eject */
function nearestCar(){
  let best = null, bd = 1e9;
  for (const c of cars) if (!c.wrecked) for (const [x, z] of carCircles(c, c.x, c.z, c.h)){ const d = Math.hypot(x - nw.x, z - nw.z) - c.T.W / 2; if (d < bd){ bd = d; best = c; } }
  return bd < 3.2 ? best : null;
}
function enterCar(c){
  driving = c; nw.state = 'sit'; nw.air = false;
  c.body.add(NW.root); NW.root.position.set(...c.T.seat); NW.root.rotation.set(0, 0, 0);
  engineStart(c.kind); updateActs();
}
function placeBeside(c){
  const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  for (const s of [1, -1, 2, -2]){
    const x = c.x + rx * s * (c.T.W / 2 + 1.6), z = c.z + rz * s * (c.T.W / 2 + 1.6);
    if (!footBlocked(x, z)){ nw.x = x; nw.z = z; return; }
  }
  nw.x = c.x; nw.z = c.z + c.R + 2;
}
function leaveCar(){
  const c = driving; if (!c) return;
  scene.add(NW.root); NW.root.scale.setScalar(NAI_S);
  placeBeside(c); nw.y = groundAt(nw.x, nw.z); nw.h = c.h; nw.state = 'idle'; driving = null; engineStop();
  camYaw = c.h + Math.PI; updateActs();
}
function eject(impact){
  const c = driving; if (!c) return;
  scene.add(NW.root); NW.root.scale.setScalar(NAI_S); driving = null; engineStop();
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  nw.x = c.x + fx * (c.T.L / 2 - .5); nw.z = c.z + fz * (c.T.L / 2 - .5); nw.y = c.y + 2;
  nw.vx = -fx * impact * .25; nw.vz = -fz * impact * .25; nw.vy = 11 + impact * .15; nw.h = c.h; nw.spin = 0;
  nw.state = 'fly'; nw.t = 0; camYaw = c.h + Math.PI;
  toast('车祸！奶娃飞出去了', `撞击速度 ${Math.round(impact * 3.6)} km/h`); addStunt('人车分离', 300); updateActs();
}

/* ---------- on foot ---------- */
function footBlocked(x, z){
  if (x < -600 || x > 600 || z < -275 || z > 262) return true;
  if (hitsBuilding(x, z, .9)) return true;
  for (const L of lakes) if (inPoly(x, z, L)) return true;
  for (const c of cars) if (Math.hypot(c.x - x, c.z - z) < c.R * .9) return true;
  return false;
}
function updateFoot(dt){
  nw.t += dt;
  if (nw.state === 'fly'){
    nw.vy -= 24 * dt; nw.spin -= dt * 9;
    const nx = nw.x + nw.vx * dt, nz = nw.z + nw.vz * dt;
    if (!hitsBuilding(nx, nz, .9) && Math.abs(nx) < 600 && nz > -275 && nz < 262){ nw.x = nx; nw.z = nz; } else { nw.vx *= -.3; nw.vz *= -.3; }
    nw.y += nw.vy * dt;
    const g = groundAt(nw.x, nw.z);
    if (nw.y <= g && nw.vy < 0){
      nw.y = g; nw.state = 'flop'; nw.t = 0; sfx.thud(.7); sfx.laugh(); dustBurst(nw.x, .4, nw.z, 6, 2.5);
      if (lakes.some(L => inPoly(nw.x, nw.z, L))){ sfx.splash(); nw.state = 'idle'; const s = shoreNear(nw.x, nw.z); nw.x = s[0]; nw.z = s[1]; toast('扑通', '奶娃爬回了岸上'); }
    }
    return;
  }
  const busy = nw.state === 'flop' || nw.state === 'laugh' || nw.state === 'pose';
  if (busy){
    const dur = nw.state === 'flop' ? 2.5 : nw.state === 'pose' ? 2.4 : 2.2;
    if (nw.state !== 'pose' && Math.floor(nw.t / .32) !== Math.floor((nw.t - dt) / .32) && nw.t > .3 && nw.t < dur - .3)
      spawnPart('ha', nw.x + (rnd() - .5) * 2, nw.y + 3 + rnd(), nw.z + (rnd() - .5) * 2, 1.1, {vy:2.2, life:1.1, op:1, color:'#c0392b'});
    if (nw.state === 'pose' && Math.floor(nw.t / .18) !== Math.floor((nw.t - dt) / .18) && nw.t < 1.8)
      spawnPart('heart', nw.x + (rnd() - .5) * 3, nw.y + 2.4 + rnd() * 1.5, nw.z + (rnd() - .5) * 3, .9 + rnd() * .5, {vy:2.5, vx:(rnd() - .5) * 2, life:1.4, op:1, color:'#ff6fa3'});
    if (nw.t > dur) nw.state = 'idle';
  }
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let l = Math.hypot(f, r);
  nw.spd = 0;
  if (l > .08 && !busy){
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    let dx = -s * f + c * r, dz = -c * f - s * r; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
    const target = Math.atan2(dx, dz); let dh = target - nw.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); nw.h += dh * Math.min(1, dt * 10);
    const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > .95;
    const v = (run ? 11 : 5.5) * Math.min(1, l) * dt;
    const fst = footBlocked(nw.x, nw.z);
    if (fst || !footBlocked(nw.x + dx * v, nw.z)) nw.x += dx * v;
    if (fst || !footBlocked(nw.x, nw.z + dz * v)) nw.z += dz * v;
    nw.spd = v / dt; nw.walkT += dt * (run ? 13 : 9);
    if (Math.floor(nw.walkT / Math.PI) !== Math.floor((nw.walkT - dt * (run ? 13 : 9)) / Math.PI)) knockAround(nw.x, nw.z, 1.6, nw.x - dx, nw.z - dz);
  }
  const g = groundAt(nw.x, nw.z);
  if (nw.air){ nw.vy -= 24 * dt; nw.y += nw.vy * dt; if (nw.y <= g){ nw.y = g; nw.air = false; if (nw.vy < -8){ sfx.thud(.4); dustBurst(nw.x, .3, nw.z, 3, 2); } } }
  else nw.y = g;
}
function shoreNear(x, z){
  for (let r = 4; r < 120; r += 4) for (let a = 0; a < 16; a++){
    const px = x + Math.cos(a / 16 * 6.283) * r, pz = z + Math.sin(a / 16 * 6.283) * r;
    if (!footBlocked(px, pz)) return [px, pz];
  }
  return [114, 200];
}
function footAction(k){
  if (driving || nw.state === 'fly' || nw.state === 'flop') return;
  if (k === 'jump' && !nw.air && nw.state !== 'laugh' && nw.state !== 'pose'){ nw.air = true; nw.vy = 8.5; sfx.boing(); }
  if (k === 'laugh' && !nw.air){ nw.state = 'laugh'; nw.t = 0; sfx.laugh(); }
  if (k === 'pose' && !nw.air){ nw.state = 'pose'; nw.t = 0; sfx.sparkle();
    for (const n of npcs) if (n.state === 'walk' && Math.hypot(n.x - nw.x, n.z - nw.z) < 20) spawnPart('heart', n.x, 2.5, n.z, .8, {vy:2, life:1.4, op:1, color:'#ff6fa3'}); }
}
