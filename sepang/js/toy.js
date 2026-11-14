/* 雪邦赛车城 · 玩具微缩章节（路线 3）：宿舍书桌上的合金小车比赛
 * 6 辆车三圈，你从第 4 位发车。书桌 → 桌边飞跃 → 螺旋下坡 → 地毯 → 大回环 → 爬坡回书桌。
 * 撞烂：玩具积木墙、书桌上一排多米诺骨牌（连锁倒）、塑料杯塔、橡皮。冒险换氮气：擦车、漂移、贴护栏、飞跃、撞烂东西。
 * 操作：↑/W 油门，↓/S 刹车，←→/AD 转向，Shift 氮气，空格 漂移，R 重来。?bot=1 电脑开，?rec=1 由录像页逐帧推。 */
import * as THREE from 'three';
import { buildTrack, makeToyCar, stepToyCar, aiInput, respawn, placeOn, HWT, DESK, DESK_Y } from './toy-track.js';
import { buildRoom } from './toy-room.js';
import { makeRacePost } from './race-post.js';
import { makeParticles, makeSparks } from './fx.js';
import { makeHeroCar } from './hero-car.js';

const qs = new URLSearchParams(location.search), BOT = qs.has('bot'), REC = qs.has('rec');
const LAPS = 3;
let seed = 3; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- renderer, scene, camera ---------------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance', preserveDrawingBuffer:REC});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, .2, 2000);
const trk = buildTrack();
const room = buildRoom(scene, renderer, trk);
const post = makeRacePost(renderer, scene, camera, {dof:!qs.has('nodof'), bloom:!qs.has('nobloom'), bokeh:3.0, focusRange:24, glow:.35, sat:1.04, warm:[1.02, 1, .97]});

/* ---------------- die-cast cars ---------------- */
const SPEC = {maxV:74, acc:24, nos:{cap:3.2, pow:.35, fill:1e9}};
const PAINTS = [['#1e5bd8', '你'], ['#d8182a', 'Hafiz'], ['#16a05a', 'Kelvin'], ['#e0a21a', 'Aisyah'], ['#7a2bd0', 'Jason'], ['#e8e8ec', 'Wei Ming']];
const FLAME_VS = 'varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = clamp(length(position) / 1.6, 0.0, 1.0); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const FLAME_FS = `varying float vL; varying vec3 vN; varying vec3 vV; uniform float uT, uP;
  void main(){ float core = 1.0 - vL; float f = pow(abs(dot(vN, vV)), 1.5); float flick = 0.75 + 0.25 * sin(uT * 70.0 + vL * 18.0) * sin(uT * 43.0);
    vec3 c = mix(vec3(0.25, 0.7, 4.0), vec3(3.6, 3.8, 4.2), pow(core, 2.5)); gl_FragColor = vec4(c * pow(core, 1.3) * f * flick * uP, 1.0); }`;
const flameGeo = (() => { const g = new THREE.ConeGeometry(.15, 1.6, 16, 6, true); g.translate(0, .8, 0); g.rotateX(-Math.PI / 2 - .2); return g; })();
const blobT = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); })();
const cars = [];
PAINTS.forEach(([paint, name], k) => {
  const h = makeHeroCar({paint, quality:'mid'});
  h.paintMat.metalness = .75; h.paintMat.roughness = .22; h.paintMat.envMapIntensity = 1.2; h.paintMat.clearcoatRoughness = .12;     /* Spectraflame-like candy metal */
  h.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); h.lights.tail.emissiveIntensity = 3.5;
  const box = new THREE.Box3().setFromObject(h.root), zr = box.min.z + .06;
  const mat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, uniforms:{uT:{value:0}, uP:{value:0}}, vertexShader:FLAME_VS, fragmentShader:FLAME_FS});
  const fl = []; for (const x of [-.42, .42]){ const f = new THREE.Mesh(flameGeo, mat); f.position.set(x, .545, zr - .02); f.renderOrder = 7; h.root.add(f); fl.push(f); }
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), new THREE.MeshBasicMaterial({map:blobT, transparent:true, depthWrite:false})); blob.rotation.x = -Math.PI / 2; blob.position.y = .04; blob.renderOrder = 1; h.root.add(blob);
  const holder = new THREE.Group(); holder.add(h.root); scene.add(holder);
  const spec = k === 0 ? SPEC : {maxV:72 + k * .7, acc:23, nos:{cap:2.4, pow:.3, fill:9}};
  const c = makeToyCar(spec, trk, 0, 0); Object.assign(c, {name, mine:k === 0, h, holder, flameMat:mat, flames:fl, lane:0, lap:0, ph:k * 1.3, base:spec.maxV, finish:0});
  cars.push(c);
});
const me = cars[0];

/* ---------------- smashable toys ---------------- */
const KINDS = {
  brick: {geo:() => new THREE.BoxGeometry(1.9, 1.1, .95), cols:['#d8182a', '#f2c230', '#1e5bd8', '#16a05a', '#f4f2ec'], r:1.0, mass:.02, nos:.03, name:'积木'},
  domino:{geo:() => new THREE.BoxGeometry(1.6, 3.4, .55).translate(0, 1.7, 0), cols:['#141414'], r:.9, mass:.008, nos:.012, name:'多米诺'},
  cup:   {geo:() => new THREE.CylinderGeometry(1.5, 1.0, 2.8, 20, 1, true).translate(0, 1.4, 0), cols:['#e83a5a', '#2f8fe8', '#f2c230', '#2fbf7a'], r:1.3, mass:.012, nos:.025, name:'纸杯塔'},
  eraser:{geo:() => new THREE.BoxGeometry(3.2, 1.3, 1.8).translate(0, .65, 0), cols:['#f08aa8', '#7fc8f0'], r:1.4, mass:.03, nos:.04, name:'橡皮'}
};
const props = [];
const F = trk.newFrame();
function addProp(kind, s, l, y = 0, yaw = 0){ trk.frame(s, F); const p = F.p.clone().addScaledVector(F.r, l).addScaledVector(F.u, y); props.push({kind, k:KINDS[kind], s, l, x:p.x, y:p.y, z:p.z, base:p.y - y, h:Math.atan2(F.t.x, F.t.z) + yaw, rx:0, rz:0, vx:0, vy:0, vz:0, wx:0, wy:0, wz:0, hit:false, rest:true, col:0, delay:-1}); }
const sOf = (x, y, z) => { let b = 0, bd = 1e9; trk.C.forEach((c, i) => { const d = c.distanceToSquared(v3(x, y, z)); if (d < bd){ bd = d; b = i; } }); return b * trk.ds; };
function layout(){
  props.length = 0; seed = 9;
  /* dominoes along the desk straight, right after the start: one knock and they all go */
  const sd = sOf(98, DESK_Y, -129); for (let k = 0; k < 22; k++) addProp('domino', sd + k * 1.6, -4.5 + Math.sin(k * .35) * 2.5);
  /* a toy-brick wall across most of the rug straight */
  const sb = sOf(70, 0, 0); for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) addProp('brick', sb + (r % 2) * .2, -5.2 + k * 2.0 + (r % 2) * 1.0, .55 + r * 1.1);
  /* a pyramid of paper cups at the foot of the climb */
  const sc = sOf(206, 0, -6); let n = 0; for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - r; k++) addProp('cup', sc, 2 + (k - (3 - r) / 2) * 3.0, r * 2.75);
  /* erasers scattered on the downhill */
  for (const [x, y, z, l] of [[-18, 22, -84, -3], [-20, 12, -62, 4]]) addProp('eraser', sOf(x, y, z), l, .65);
  props.forEach(p => { p.col = Math.floor(rng() * p.k.cols.length); });
}
layout();
const propMesh = {}; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
for (const [name, k] of Object.entries(KINDS)){ const list = props.filter(p => p.kind === name);
  const mat = name === 'cup' ? new THREE.MeshPhysicalMaterial({roughness:.3, clearcoat:.6, clearcoatRoughness:.15, side:THREE.DoubleSide}) : name === 'domino' ? new THREE.MeshPhysicalMaterial({roughness:.3, clearcoat:1, clearcoatRoughness:.15}) : new THREE.MeshPhysicalMaterial({roughness:.35, clearcoat:.5, clearcoatRoughness:.15});
  const im = new THREE.InstancedMesh(k.geo(), mat, Math.max(1, list.length)); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
  list.forEach((p, j) => { p.im = im; p.j = j; im.setColorAt(j, _c.set(k.cols[p.col])); }); propMesh[name] = im; }
function placeProp(p){ _q.setFromEuler(_e.set(p.rx, p.h, p.rz, 'YXZ')); _m.compose(_p.set(p.x, p.y, p.z), _q, _s); p.im.setMatrixAt(p.j, _m); p.im.instanceMatrix.needsUpdate = true; }
function resetProps(){ layout(); for (const name in KINDS) props.filter(p => p.kind === name).forEach((p, j) => { p.im = propMesh[name]; p.j = j; placeProp(p); }); }
resetProps();
const groundY = (x, z) => x > DESK.x0 && x < DESK.x1 && z > DESK.z0 && z < DESK.z1 ? DESK_Y : 0;

/* ---------------- particles ---------------- */
const smoke = makeParticles(scene, 2500), sparks = makeSparks(scene, 2400);
const HOT = new THREE.Color(6, 2.6, .5), DUST = new THREE.Color('#e9dcc8');

/* ---------------- state ---------------- */
const G = {t:0, count:3, lapT:0, done:0, flash:0, shake:0, shakeT:0, stop:0, slow:0, events:[], combo:0, comboT:0, drift:0, skim:0, boostV:0, steerIn:0, fov:66};
const cam = {pos:v3(), up:v3(0, 1, 0), init:false}, ray = new THREE.Raycaster();
function award(text, amt){ me.e = Math.min(1, me.e + amt); G.combo++; G.comboT = 2.5; G.events.unshift({text, amt, t:0}); if (G.events.length > 4) G.events.pop(); }
const kick = a => { G.shake = Math.max(G.shake, a); };
const prog = c => c.lap * trk.L + trk.wrap(c.s - trk.start * trk.ds + 30);

function grid(){
  const s0 = trk.start * trk.ds;
  cars.forEach((c, k) => { const n = [4, 1, 2, 3, 5, 6][k]; c.s = s0 - 8 - (n - 1) * 5.5; c.l = (n % 2 ? -1 : 1) * 3.6; c.v = 0; c.yaw = 0; c.air = null; c.lap = -1; c.e = k === 0 ? .4 : 1; c.mult = 0; c.good = c.s; c.finish = 0; c.lane = c.l; placeOn(c, trk); });
  G.count = 3; G.lapT = 0; G.done = 0; G.events.length = 0; cam.init = false; resetProps();
}
grid();

/* ---------------- input ---------------- */
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') grid(); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function playerInput(){
  const up = keys.ArrowUp || keys.KeyW, dn = keys.ArrowDown || keys.KeyS, l = keys.ArrowLeft || keys.KeyA, r = keys.ArrowRight || keys.KeyD;
  return {thr:up ? 1 : dn ? -1 : 0, steer:(l ? 1 : 0) - (r ? 1 : 0), brake:!!keys.Space, nos:!!(keys.ShiftLeft || keys.ShiftRight)};
}
const HALT = {thr:0, steer:0, brake:false, nos:false};

/* ---------------- the race step ---------------- */
function smash(p, c){
  const k = p.k; p.hit = true; p.rest = false; const sp = c.v;
  p.vx = c.vel.x * (.7 + rng() * .4) + (rng() - .5) * 10; p.vz = c.vel.z * (.7 + rng() * .4) + (rng() - .5) * 10; p.vy = 3 + sp * (.05 + rng() * .06) + Math.max(0, c.vel.y) * .5;
  p.wx = (rng() - .5) * 18; p.wy = (rng() - .5) * 10; p.wz = (rng() - .5) * 18;
  c.v *= 1 - k.mass;
  for (let n = 0; n < 6; n++) sparks.emit(p.x, p.y + 1, p.z, c.vel.x * .3 + (rng() - .5) * 10, rng() * 6, c.vel.z * .3 + (rng() - .5) * 10, new THREE.Color().set(k.cols[p.col]).multiplyScalar(2.5), .3, .35);
  if (p.kind === 'domino') props.filter(q => q.kind === 'domino' && !q.hit).forEach(q => { const d = Math.abs(q.s - p.s); if (q.delay < 0) q.delay = d * .045; });   /* the chain */
  if (c.mine){ award(k.name + (G.combo > 0 ? ' ×' + (G.combo + 1) : ''), k.nos); kick(.35); if (G.combo > 6 && G.combo % 5 === 0){ G.stop = .05; G.slow = .35; } }
}
function step(dt){
  const go = G.count <= 0, ev = [];
  for (const c of cars){
    let inp;
    if (!go || c.finish) inp = c.finish ? {thr:-1, steer:0, brake:false, nos:false} : HALT;
    else if (c.mine && !BOT) inp = playerInput();
    else {
      if (!c.mine){ const gap = prog(c) - prog(me); c.spec.maxV = c.base * (1 + Math.max(-.12, Math.min(.12, -gap / 300))); if (rng() < .006) c.lane = (rng() - .5) * 2 * (HWT - 2.5); }
      else if (rng() < .01) c.lane = (rng() - .5) * 2 * (HWT - 2.5);
      const fi = trk.at(c.s), straight = Math.abs(trk.K[(fi + 30) % trk.n]) < 1 / 300 && trk.U[fi].y > .9;
      inp = aiInput(c, trk, {lane:c.lane + Math.sin(G.t * .5 + c.ph) * 1.2, nos:c.e > .1 && straight && c.v > 30, grip:c.mine ? 1 : .97});
    }
    if (c.mine) G.steerIn = inp.steer;
    const s0 = c.s;
    stepToyCar(c, trk, dt, inp, ev);
    /* boosters */
    if (!c.air) for (const b of trk.booster){ const bs = b * trk.ds; if (trk.wrap(s0 - bs) > trk.L / 2 && trk.wrap(c.s - bs) < trk.L / 2){ c.v = Math.max(c.v, 60) + 18; c.boostT = .8; if (c.mine){ kick(.5); G.flash = .12; } } }
    /* laps */
    const sl = trk.start * trk.ds; if (!c.air && trk.wrap(s0 - sl) > trk.L / 2 && trk.wrap(c.s - sl) < trk.L / 2 && go){ c.lap++; if (c.lap >= LAPS && !c.finish){ c.finish = G.t; if (c.mine){ G.done = 5; G.flash = .4; } } else if (c.mine) G.flash = .25; }
    c.crashT = Math.max(0, c.crashT - dt); c.boostT = Math.max(0, (c.boostT || 0) - dt);
  }
  /* car against car: in track space */
  for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++){ const A = cars[a], B = cars[b]; if (A.air || B.air) continue;
    let ds = trk.wrap(B.s - A.s); if (ds > trk.L / 2) ds -= trk.L; const dl = B.l - A.l;
    if (Math.abs(ds) < 4.4 && Math.abs(dl) < 2.1){ const push = (2.1 - Math.abs(dl)) / 2 * Math.sign(dl || 1); A.l -= push; B.l += push;
      const back = ds > 0 ? A : B, front = ds > 0 ? B : A; if (back.v > front.v){ const dv = back.v - front.v; back.v -= dv * .5; front.v += dv * .4; if (A.mine || B.mine){ kick(.5); for (let n = 0; n < 12; n++) sparks.emit(back.pos.x, back.pos.y + .6, back.pos.z, (rng() - .5) * 8, rng() * 4, (rng() - .5) * 8, HOT, .25, .3); } } }
    else if ((A.mine || B.mine) && Math.abs(ds) < 2.5 && Math.abs(dl) > 2.1 && Math.abs(dl) < 3.3){ const other = A.mine ? B : A; if (!other.missed && me.v - other.v > 6){ other.missed = true; award('擦车而过', .1); kick(.2); } }
    if (Math.abs(ds) > 25){ A.missed = false; B.missed = false; } }
  /* the player's risks */
  if (!me.air && go){
    if (Math.abs(me.yaw) > .28 && me.v > 22){ G.drift += dt; if (rng() < .6) smoke.spawn(me.pos.x - me.fwd.x * 2, me.pos.y + .3, me.pos.z - me.fwd.z * 2, (rng() - .5), .6, (rng() - .5), 1, 3, 1.2, .15, DUST); }
    else if (G.drift > 0){ if (G.drift > .5) award('漂移 ' + G.drift.toFixed(1) + 's', Math.min(.25, G.drift * .08)); G.drift = 0; }
    const gap = HWT - 1.05 - Math.abs(me.l);
    if (me.v > 40 && gap > 0 && gap < 1.0 && !me.scrape) G.skim += dt; else if (G.skim > 0){ if (G.skim > .4) award('贴边飞 ' + G.skim.toFixed(1) + 's', Math.min(.2, G.skim * .07)); G.skim = 0; }
  }
  for (const e of ev){
    const c = e.c;
    if (e.type === 'rail' && c.mine){ kick(Math.min(1, e.hard / 25)); }
    if (e.type === 'rail' || (c.scrape && c.v > 25 && rng() < .5)) for (let n = 0; n < 6; n++){ const side = Math.sign(c.l); trk.frame(c.s, F); sparks.emit(c.pos.x + F.r.x * side, c.pos.y + .4, c.pos.z + F.r.z * side, c.vel.x * .6 + (rng() - .5) * 6, rng() * 4, c.vel.z * .6 + (rng() - .5) * 6, HOT, .25, .3); }
    if (e.type === 'land'){ if (c.mine){ kick(Math.min(1.2, .3 + e.hard / 20)); if (e.air > .35) award('飞跃 ' + e.air.toFixed(1) + 's', Math.min(.3, e.air * .15)); }
      for (let n = 0; n < 24; n++) sparks.emit(c.pos.x, c.pos.y + .1, c.pos.z, c.vel.x * .5 + (rng() - .5) * 14, rng() * 5, c.vel.z * .5 + (rng() - .5) * 14, HOT, .28, .4);
      smoke.spawn(c.pos.x, c.pos.y + .3, c.pos.z, 0, 1, 0, 2.5, 3, 1, .25, DUST); }
    if (e.type === 'crash' && c.mine){ G.events.unshift({text:'掉下去了', amt:0, t:0}); G.flash = .3; cam.init = false; }
  }
  for (const c of cars){ if (c.scrape && c.v > 30 && rng() < .35){ trk.frame(c.s, F); const side = Math.sign(c.l); sparks.emit(c.pos.x + F.r.x * side * .9, c.pos.y + .3, c.pos.z + F.r.z * side * .9, c.vel.x * .7, 1 + rng() * 2, c.vel.z * .7, HOT, .22, .25); } }
  /* toys */
  for (const p of props){
    if (p.delay >= 0 && !p.hit){ p.delay -= dt; if (p.delay <= 0){ p.hit = true; p.rest = false; p.wx = 5 + rng() * 3; p.vy = 1; p.vx = (rng() - .5) * 2; p.vz = (rng() - .5) * 2; } }
    if (p.hit && !p.rest){ p.vy -= 25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.h += p.wy * dt; p.rz += p.wz * dt;
      const gy = Math.max(groundY(p.x, p.z), p.base - .1); if (p.y < gy){ p.y = gy; p.vy = -p.vy * .3; p.vx *= .6; p.vz *= .6; p.wx *= .5; p.wy *= .5; p.wz *= .5; if (Math.abs(p.vy) < 1 && Math.hypot(p.vx, p.vz) < 1){ p.rest = true; p.rx = Math.round(p.rx / (Math.PI / 2)) * Math.PI / 2; p.rz = Math.round(p.rz / (Math.PI / 2)) * Math.PI / 2; } }
      placeProp(p); continue; }
    if (p.hit) continue;
    for (const c of cars){ const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z), dy = Math.abs(p.y - c.pos.y); if (d < p.k.r + 1.4 && dy < 3.5){ smash(p, c); break; } }
  }
}

/* ---------------- cars on screen ---------------- */
const _b = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
function placeCars(dt){
  for (const c of cars){
    _x.copy(c.up).cross(c.fwd).normalize(); _y.copy(c.fwd).cross(_x).normalize();
    _b.makeBasis(_x, _y, c.fwd); c.holder.quaternion.setFromRotationMatrix(_b); c.holder.position.copy(c.pos);
    c.h.root.visible = !(c.crashT > 0 && Math.floor(G.t * 12) % 2);
    const spin = c.v / .36 * dt; for (const w of c.h.wheels) w.rotation.x += spin; for (const f of c.h.fronts) f.rotation.y = c.steer * .45;
    const on = c.mult > .05 || c.boostT > 0, p = on ? 1.3 : Math.min(.45, c.v / 120);
    c.flameMat.uniforms.uT.value = G.t; c.flameMat.uniforms.uP.value += (p - c.flameMat.uniforms.uP.value) * Math.min(1, dt * 10);
    for (const f of c.flames) f.scale.set(1, 1, .4 + c.flameMat.uniforms.uP.value * 1.1);
  }
}

/* ---------------- camera: chase in the car's own frame (it rolls round the loop with you) ---------------- */
function updateCamera(dt, rdt){
  const v = me.v, sp = Math.max(0, Math.min(1, (v - 10) / 65));
  const back = 6.8 + Math.min(1.4, v * .012), up = 3.7;
  cam.up.lerp(me.air ? v3(0, 1, 0) : me.up, Math.min(1, rdt * 5)).normalize();
  const want = me.pos.clone().addScaledVector(me.fwd, -back).addScaledVector(cam.up, up);
  /* don't go through the desk, the books, the walls: pull in along the line to the car */
  { const from = me.pos.clone().addScaledVector(cam.up, 1.4), dir = want.clone().sub(from), len = dir.length(); dir.normalize(); ray.set(from, dir); ray.far = len;
    const hit = ray.intersectObjects(room.blockers, false)[0]; if (hit) want.copy(from).addScaledVector(dir, Math.max(1.5, hit.distance - .8)); }
  if (!cam.init){ cam.pos.copy(want); cam.init = true; }
  cam.pos.lerp(want, Math.min(1, rdt * 16));
  const target = 66 + 22 * Math.pow(sp, 1.2) + (me.mult > .05 ? 10 : 0) + (me.boostT > 0 ? 8 : 0);
  G.fov += (target - G.fov) * Math.min(1, rdt * 4); camera.fov = G.fov; camera.updateProjectionMatrix();
  G.shake *= Math.exp(-6 * rdt); G.shakeT += rdt; const a = .01 * sp * sp + G.shake * .14, t = G.shakeT;
  camera.position.copy(cam.pos).addScaledVector(cam.up, (Math.sin(t * 43) + Math.sin(t * 71)) * .5 * a);
  camera.up.copy(cam.up); camera.lookAt(me.pos.clone().addScaledVector(me.fwd, 9).addScaledVector(cam.up, .2));
  G.boostV += ((me.mult > .05 ? 1 : 0) - G.boostV) * Math.min(1, rdt * 6);
  post.set({speed:Math.min(.9, sp * .3 + G.boostV * .4 + (me.boostT > 0 ? .25 : 0) + G.shake * .1), boost:G.boostV * .8, exposure:.95 + G.flash * 1.2, focus:me.pos});
}

/* ---------------- HUD ---------------- */
const hud = document.getElementById('hud'), hg = hud.getContext('2d');
const MINI = (() => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of trk.C){ x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); } const sc = Math.min(150 / (x1 - x0), 110 / (z1 - z0)); return (x, z) => [(x - x0) * sc, (z - z0) * sc]; })();
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
function drawHud(rdt){
  const W = hud.width, H = hud.height, s = H / 720, g = hg; g.clearRect(0, 0, W, H);
  const ital = (w, px) => `italic ${w} ${px * s}px "Noto Sans SC","Microsoft YaHei",sans-serif`;
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6 * s;
  const order = [...cars].sort((a, b) => (b.finish ? 1e9 - b.finish : prog(b)) - (a.finish ? 1e9 - a.finish : prog(a))), pos = order.indexOf(me) + 1;
  const grd = g.createLinearGradient(0, 22 * s, 0, 72 * s); grd.addColorStop(0, '#ffb04a'); grd.addColorStop(1, '#ff5a2a');
  g.textAlign = 'left'; g.fillStyle = grd; g.font = ital(900, 56); g.fillText(pos, 26 * s, 72 * s); const nw = g.measureText(String(pos)).width;
  g.fillStyle = '#fff'; g.font = ital(800, 20); g.fillText('/' + cars.length, 26 * s + nw + 3 * s, 72 * s);
  g.save(); g.translate(28 * s, 90 * s); g.scale(s * .62, s * .62); g.lineJoin = 'round'; g.beginPath(); trk.C.forEach((p, k) => { if (trk.inGap(k)) return; const [a, b] = MINI(p.x, p.z); k ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath();
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#ff9a3a'; g.lineWidth = 4; g.stroke();
  for (const c of cars){ const [a, b] = MINI(c.pos.x, c.pos.z); g.fillStyle = c.mine ? '#ffd23a' : '#fff'; g.beginPath(); g.arc(a, b, c.mine ? 7.5 : 5, 0, 7); g.fill(); } g.restore();
  g.textAlign = 'right'; const rx = W - 70 * s;
  g.fillStyle = '#fff'; g.font = ital(900, 30); g.fillText(fmt(G.lapT), rx, 46 * s);
  g.font = ital(700, 11); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('LAP', rx - 46 * s, 66 * s); g.font = ital(900, 19); g.fillStyle = '#fff'; g.fillText(Math.max(1, Math.min(LAPS, me.lap + 1)) + '/' + LAPS, rx, 67 * s);
  g.fillStyle = '#ffd23a'; g.font = ital(900, 24); g.fillText(Math.round(me.v * 3.6), rx - 34 * s, 96 * s); g.font = ital(700, 11); g.fillStyle = '#ffe58a'; g.fillText('KM/H', rx, 96 * s);
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(W - 34 * s, 40 * s, 13 * s, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(W - 39 * s, 34 * s, 3.5 * s, 12 * s); g.fillRect(W - 32 * s, 34 * s, 3.5 * s, 12 * s);
  const bx = W - 92 * s, by = H - 112 * s, br = 40 * s, ready = me.e > .05, pulse = .6 + .4 * Math.sin(G.t * 6);
  g.save(); g.shadowColor = '#ffe23a'; g.shadowBlur = (ready ? 24 + 14 * pulse + G.boostV * 30 : 6) * s; g.fillStyle = ready ? 'rgba(255,226,58,.2)' : 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,240,150,.35)'; g.lineWidth = 6 * s; g.beginPath(); g.arc(bx, by, br - 2 * s, 0, 7); g.stroke(); g.strokeStyle = '#ffe23a'; g.beginPath(); g.arc(bx, by, br - 2 * s, -Math.PI / 2, -Math.PI / 2 + me.e * 6.283); g.stroke();
  g.fillStyle = '#ffe23a'; g.beginPath(); [[4, -20], [-9, 3], [-1, 3], [-5, 20], [10, -4], [2, -4], [7, -20]].forEach(([x, y], k) => { k ? g.lineTo(bx + x * s, by + y * s) : g.moveTo(bx + x * s, by + y * s); }); g.closePath(); g.fill(); g.restore();
  const jx = 96 * s, jy = H - 120 * s; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(jx, jy, 44 * s, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.16)'; g.fill();
  g.fillStyle = 'rgba(255,255,255,.78)'; g.beginPath(); g.arc(jx - G.steerIn * 22 * s, jy, 15 * s, 0, 7); g.fill();
  g.textAlign = 'center'; G.events.forEach((e, k) => { e.t += rdt; const a = Math.max(0, 1 - e.t / 2); if (a <= 0) return; g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8 * s;
    g.fillStyle = k === 0 ? '#ffe23a' : '#fff'; g.font = ital(k === 0 ? 900 : 700, k === 0 ? 24 : 16); g.fillText(e.text + (e.amt ? '  +' + Math.round(e.amt * 100) + '% 氮气' : ''), W / 2, H * .2 + k * 28 * s); }); g.globalAlpha = 1;
  if (G.count > -.8){ const n = Math.ceil(G.count), f = G.count > 0 ? G.count - Math.floor(G.count) : 1 + G.count / .8; g.globalAlpha = Math.min(1, f * 2); g.font = ital(900, 120 * (1 + (1 - f) * .25)); g.fillStyle = G.count > 0 ? '#fff' : '#ffe23a'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20 * s; g.fillText(G.count > 0 ? String(n) : 'GO!', W / 2, H * .45); g.globalAlpha = 1; }
  if (G.done > 0){ g.font = ital(900, 52); g.fillStyle = '#ffe23a'; g.shadowBlur = 16 * s; g.fillText('FINISH · 第 ' + pos + ' 名', W / 2, H * .42); }
  if (G.flash > 0){ g.fillStyle = `rgba(255,255,255,${G.flash * .6})`; g.fillRect(0, 0, W, H); }
  g.shadowBlur = 0;
  if (!BOT && !REC && G.t < 9){ g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 ${13 * s}px "Noto Sans SC",sans-serif`; g.fillText('↑↓←→ / WASD 开车 · Shift 氮气 · 空格 漂移 · R 重来', 26 * s, H - 24 * s); }
}

/* ---------------- loop ---------------- */
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); hud.width = w * devicePixelRatio; hud.height = h * devicePixelRatio; }
addEventListener('resize', resize); resize();
function frame(rdt){
  let dt = rdt; if (G.stop > 0){ G.stop -= rdt; dt = 0; } else if (G.slow > 0){ G.slow -= rdt; dt = rdt * .3; }
  G.comboT -= rdt; if (G.comboT <= 0) G.combo = 0;
  G.count -= dt; if (G.count <= 0 && !G.done) G.lapT += dt; G.flash = Math.max(0, G.flash - rdt * 1.5);
  if (G.done > 0){ G.done -= rdt; if (G.done <= 0){ G.done = 0; grid(); } }
  if (dt > 0){ const n = Math.ceil(dt / (1 / 120)); for (let k = 0; k < n; k++) step(dt / n); G.t += dt; }
  for (const t of trk.boosterMeshes) t.rotation.z += rdt * 30;
  room.update(G.t);
  smoke.update(dt); sparks.update(dt);
  const uS = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); smoke.mat.uniforms.uScale.value = sparks.mat.uniforms.uScale.value = uS;
  placeCars(dt); updateCamera(dt, rdt); post.render(rdt); drawHud(rdt);
}
let last = performance.now(), fN = 0, fT = 0;
function loop(now){ requestAnimationFrame(loop); const rdt = Math.min(.05, (now - last) / 1000); last = now; frame(rdt); fN++; fT += rdt; if (fT > .5){ document.getElementById('fps').textContent = Math.round(fN / fT) + ' fps'; fN = fT = 0; } }
if (!REC) requestAnimationFrame(loop); else { const still = () => { requestAnimationFrame(still); post.render(0); }; requestAnimationFrame(still); }
window.XPlay = {makeBad:() => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({uniforms:{z:{value:0}}, vertexShader:'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader:'uniform float z; void main(){ float a = 1.0 / z; gl_FragColor = vec4(a, a - a, -a, 1.0); }'})), post, makeRT:(w, h) => new THREE.WebGLRenderTarget(w, h, {type:THREE.HalfFloatType}), G, me, frame, reset:grid, renderer, hud, props, traffic:cars.slice(1), cars, trk, camera, scene};
