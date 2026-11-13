/* 雪邦赛车城 · 30 秒画面 demo（docs/sepang-plan.md 第 7.4 节）
 * 一段两倍还原的雪邦：主直道后半 → T1 发夹 → T2 → T3 → 沿湖，傍晚雨后。先放 30 秒自动镜头，然后可以自己开、看「路流过来」。
 * 只在本机跑：不读存档、不连数据库（没有加载 Firebase），没有声音。
 * 按键：Enter 自己开 · F 路流过来 · 空格（菜单里）再看一遍 · R 下雨 / 放晴 · Q 换画质 · C 换镜头 · Esc 回菜单
 *       开车：W/S 或方向键 油门刹车，A/D 转向，Shift 氮气，空格 手刹 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildWorld, SF, GRID } from './world.js';
import { makePost, GRADES } from './post.js';
import { makeParticles, makeRain } from './fx.js';
import { PTS } from './track-data.js';
import { N, RT, HD, HW, clampI, LAMBO_MAX, makeCar, place, step, autoInput } from './physics.js';

/* ---------- quality: picked from the GPU, ?q=low|mid|high overrides ---------- */
const TIERS = {
  low:{name:'低', pr:.8, shadow:1024, shadowBox:120, msaa:0, bloomScale:.5, particles:1500, rain:900, palms:700},
  mid:{name:'中', pr:1, shadow:2048, shadowBox:180, msaa:4, bloomScale:1, particles:4000, rain:2200, palms:1600},
  high:{name:'高', pr:1.5, shadow:4096, shadowBox:240, msaa:4, bloomScale:1, particles:8000, rain:4000, palms:3000}
};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance', stencil:false, depth:true});
let gpu = '';
try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch(e){}
const qParam = new URLSearchParams(location.search).get('q');
const guess = /swiftshader|llvmpipe|software|basic render/i.test(gpu) ? 'low' : /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|arc a/i.test(gpu) ? 'high' : 'mid';
const QK = TIERS[qParam] ? qParam : guess, Q = TIERS[QK];
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pr));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = .66;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, .4, 12000);
const W = buildWorld(renderer, scene, Q);
const post = makePost(renderer, scene, camera, Q);
const parts = makeParticles(scene, Q.particles);
const rainFx = makeRain(scene, Q.rain);

/* ---------- memory boards along the main straight (only for 「路流过来」) ---------- */
const boards = new THREE.Group(); boards.visible = false; scene.add(boards);
{
  const lines = [['大一', '第一次在 KLIA 落地，热得睁不开眼'], ['大一', '爸爸帮我把箱子拎上五楼'], ['大二', '和阿明在 mamak 看球，到凌晨两点'], ['大二', '第一次穷游槟城'],
    ['大三', '发烧 38.9℃，自己叫 Grab 去诊所'], ['大三', '一个人在 mamak 看雨'], ['大四', '最后一顿饭，大家说以后常聚'], ['大四', '考完最后一门，走出考场']];
  lines.forEach(([y, t], k) => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
    g.fillStyle = '#f4ede0'; g.fillRect(0, 0, 1024, 512); g.fillStyle = '#7f2a17'; g.fillRect(0, 0, 1024, 18); g.fillRect(0, 494, 1024, 18);
    g.fillStyle = '#7f2a17'; g.font = '700 64px "Noto Serif SC","Songti SC","SimSun",serif'; g.fillText(y, 64, 150);
    g.fillStyle = '#2b2722'; g.font = '500 52px "Noto Sans SC","Microsoft YaHei",sans-serif';
    const words = [...t]; let line = '', yy = 270; for (const ch of words){ if (g.measureText(line + ch).width > 880){ g.fillText(line, 64, yy); line = ''; yy += 72; } line += ch; } g.fillText(line, 64, yy);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({map:tex, roughness:.8, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.25}));
    const i = 90 + k * 34, s = k % 2 ? 1 : -1, x = PTS[i][0] + RT[i][0] * s * (HW[i] - 3), z = PTS[i][1] + RT[i][1] * s * (HW[i] - 3);
    m.position.set(x, 3.2, z); m.rotation.y = HD[i] + Math.PI - s * .35; m.castShadow = true;
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(.15, 3.2, .15), new THREE.MeshStandardMaterial({color:'#4b3c2c'})); post1.position.set(x, 1.1, z);
    boards.add(m, post1);
  });
}

/* ---------- cars ---------- */
const PAINT = {me:'#7d0a12', rival:'#0f3a27'};
function dressCar(root, color){
  const wheels = [], fronts = [], lights = {tail:null, head:null};
  root.traverse(o => {
    if (!o.isMesh){ if (o.name === 'wheelpiv') { if (o.position.z > 0) fronts.push(o); } return; }
    o.castShadow = true; o.receiveShadow = true;
    const n = o.name;
    if (n === 'paint') o.material = new THREE.MeshPhysicalMaterial({color, metalness:.3, roughness:.45, clearcoat:.8, clearcoatRoughness:.06, envMapIntensity:.6});
    else if (n === 'glass') o.material = new THREE.MeshPhysicalMaterial({color:'#0a0e12', metalness:.2, roughness:.04, envMapIntensity:1.7});
    else if (n === 'head') o.material = lights.head = new THREE.MeshStandardMaterial({color:'#fff6e0', emissive:'#fff1c8', emissiveIntensity:3.5, roughness:.2});
    else if (n === 'tail') o.material = lights.tail = new THREE.MeshStandardMaterial({color:'#5a0d09', emissive:'#ff2a1f', emissiveIntensity:2.5, roughness:.3});
    else if (n === 'chrome') o.material = new THREE.MeshStandardMaterial({color:'#e4e7ea', metalness:1, roughness:.16});
    else if (n === 'wheel'){ wheels.push(o); if (o.material) o.material.envMapIntensity = .8; }
    else o.material = new THREE.MeshStandardMaterial({color:'#141518', roughness:.5, metalness:.1});
  });
  return {wheels, fronts, lights};
}
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('assets/lambo.glb');
const meRoot = gltf.scene, rivalRoot = gltf.scene.clone(true);
const meDress = dressCar(meRoot, PAINT.me), rivalDress = dressCar(rivalRoot, PAINT.rival);
scene.add(meRoot, rivalRoot);
/* headlights on the player's car */
for (const s of [-1, 1]){ const l = new THREE.SpotLight('#fff1d6', 35, 110, .34, .7, 1.8); l.position.set(s * .72, .72, 2.1); l.target.position.set(s * 1.5, 0, 40); meRoot.add(l, l.target); }
const me = makeCar(LAMBO_MAX, GRID), rival = makeCar(LAMBO_MAX, GRID + 7);
const cars = [[me, meRoot, meDress], [rival, rivalRoot, rivalDress]];
function grid(){ place(me, GRID, 5); place(rival, GRID + 7, -5); me.e = rival.e = 1; me.pitch = me.roll = rival.pitch = rival.roll = 0; }
grid();

/* ---------- input ---------- */
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; onKey(e); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const playerInput = () => ({thr:((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0),
  steer:((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0), brake:!!keys.Space, nos:!!(keys.ShiftLeft || keys.ShiftRight || keys.KeyN)});

/* ---------- HUD ---------- */
const $ = id => document.getElementById(id);
const hud = {fps:$('fps'), spd:$('spd'), sub:$('sub'), menu:$('menu'), count:$('count'), hint:$('hint'), bars:document.body, fade:$('fade')};
let subT = 0;
function say(who, text, secs = 3.2){ hud.sub.innerHTML = `<span>${who}</span>${text}`; hud.sub.classList.add('on'); subT = secs; }
hud.fps.dataset.q = Q.name;

/* ---------- state ---------- */
const S = {mode:'auto', t:0, rain:0, rainT:0, wet:0, cam:'chase', look:{yaw:0, pitch:0}, passed:false, flowS:0, fadeT:0};
let shot = null;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function carToWorld(c, lx, ly, lz){ const f = [Math.sin(c.h), Math.cos(c.h)], r = [Math.cos(c.h), -Math.sin(c.h)]; return v3(c.x + r[0] * lx + f[0] * lz, ly, c.z + r[1] * lx + f[1] * lz); }
function trackPoint(i, lat, y){ const j = clampI(i); return v3(PTS[j][0] + RT[j][0] * lat, y, PTS[j][1] + RT[j][1] * lat); }

/* the 30-second film: shots on a timeline (seconds from the start) */
const SHOTS = [
  {t0:0, name:'headlight', cam(){ const k = S.t / 2.4; return {pos:carToWorld(me, 1.9 - k * .5, .55, 3.6 - k * .6), look:carToWorld(me, .55, .55, 1.7), fov:38, speed:0}; }},
  {t0:2.4, name:'grid', cam(){ return {pos:carToWorld(me, -3.5, 2.6, -11), look:trackPoint(SF, 0, 9.5), fov:52, speed:0}; }},
  {t0:4.8, name:'chase', cam(){ return chaseCam(me, 1); }},
  {t0:11.2, name:'trackside', cam(){ return {pos:trackPoint(440, HW[440] + 7, 1.2), look:v3(me.x, .9, me.z), fov:40, speed:0}; }},
  {t0:13.4, name:'T1', cam(){ return {pos:trackPoint(553, -(HW[553] + 6), 2.2), look:v3(me.x, 1, me.z), fov:24, speed:0}; }},
  {t0:19, name:'backlit', cam(){ return {pos:carToWorld(me, -2.5, 1.0, 16), look:carToWorld(me, 0, .9, 0), fov:46, speed:0}; }},
  {t0:24.5, name:'lake', cam(){ const k = (S.t - 24.5) / 6.5, L = W.lake; return {pos:carToWorld(me, -22 - k * 10, 6 + k * 12, -14 - k * 4), look:v3((me.x * 2 + L[0]) / 3, 2, (me.z * 2 + L[1]) / 3), fov:50, speed:0}; }},
  {t0:29.6, name:'end'}
];
const camState = {pos:v3(0, 5, 0), look:v3(0, 0, 0), fov:60, speed:0, init:false};
function chaseCam(c, k){
  const v = Math.hypot(c.vx, c.vz), back = 8.2 + Math.min(3, v / 60), up = 2.25 + Math.min(.8, v / 200);
  return {pos:carToWorld(c, 0, up, -back), look:carToWorld(c, 0, 1.0, 8), fov:58 + Math.min(20, Math.max(0, (v - 30) / 5)), speed:Math.max(0, Math.min(1, (v - 50) / 100)) * k, chase:true};
}
function bonnetCam(c){ const v = Math.hypot(c.vx, c.vz); return {pos:carToWorld(c, 0, 1.12, .2), look:carToWorld(c, 0, 1.0, 20), fov:70 + Math.min(14, v / 9), speed:Math.max(0, Math.min(1, (v - 50) / 100)) * .8, chase:true}; }

/* ---------- modes ---------- */
function startAuto(){ grid(); S.mode = 'auto'; S.t = 0; S.passed = false; hud.menu.hidden = true; document.body.classList.add('film'); camState.init = false; boards.visible = false; say('Ben 师傅', '四圈，一圈一年。先看这一圈。', 2.6); }
function startFree(){ grid(); S.mode = 'free'; S.t = 0; S.passed = false; hud.menu.hidden = true; document.body.classList.remove('film'); camState.init = false; boards.visible = false; hud.hint.hidden = false; }
function startFlow(){ place(me, GRID - 10, 0); place(rival, N - 5, 0); S.mode = 'flow'; S.t = 0; hud.menu.hidden = true; document.body.classList.add('film'); boards.visible = true; S.look.yaw = 0; S.look.pitch = 0; camState.init = false; hud.hint.hidden = true; say('', '路在当下。', 3); }
function toMenu(){ S.mode = 'menu'; hud.menu.hidden = false; document.body.classList.remove('film'); hud.hint.hidden = true; if (document.pointerLockElement) document.exitPointerLock(); }
function onKey(e){
  if (e.code === 'Enter') startFree();
  else if (e.code === 'KeyF') startFlow();
  else if (e.code === 'Space' && S.mode === 'menu') startAuto();
  else if (e.code === 'Escape') toMenu();
  else if (e.code === 'KeyR'){ S.rain = S.rain > .5 ? 0 : 1; say('', S.rain ? '下雨了：路面变湿，抓地少 15%' : '雨停了', 2.2); }
  else if (e.code === 'KeyQ'){ const order = ['low', 'mid', 'high'], n = order[(order.indexOf(QK) + 1) % 3]; location.search = '?q=' + n; }
  else if (e.code === 'KeyC') S.cam = S.cam === 'chase' ? 'bonnet' : 'chase';
}
canvas.addEventListener('click', () => { if (S.mode === 'flow' && !document.pointerLockElement && canvas.requestPointerLock) canvas.requestPointerLock(); });
addEventListener('mousemove', e => { if (S.mode !== 'flow') return; if (document.pointerLockElement || e.buttons){ S.look.yaw -= e.movementX * .0022; S.look.pitch = Math.max(-.5, Math.min(.35, S.look.pitch - e.movementY * .0022)); } });
for (const [id, fn] of [['bAuto', startAuto], ['bFree', startFree], ['bFlow', startFlow]]) $(id).addEventListener('click', fn);

/* ---------- per frame ---------- */
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0, lightsOn = 0;
const smokeCol = new THREE.Color('#d8d2c8'), sprayCol = new THREE.Color('#c6d0d8');

function driveStep(dt){
  const sub = 4, h = dt / sub;
  for (let k = 0; k < sub; k++){
    const go = S.mode !== 'auto' || S.t > 4.4;
    let inMe = {thr:0, steer:0, brake:true, nos:false}, inRival = {thr:0, steer:0, brake:true, nos:false};
    if (go){
      if (S.mode === 'free') inMe = playerInput();
      else if (S.mode === 'auto') inMe = autoInput(me, {over:me.i > 700 ? .62 : 1.05, nos:me.i < 560, lat:0, wet:S.wet});
      else if (S.mode === 'flow'){ const v = Math.hypot(me.vx, me.vz); inMe = autoInput(me, {over:1, lat:0}); inMe.thr = v < 11 ? .25 : v > 12 ? -.15 : 0; inMe.nos = false; }
      if (S.mode !== 'flow') inRival = autoInput(rival, {over:.97, nos:false, lat:-3, wet:S.wet});
    }
    step(me, h, inMe, S.wet); if (S.mode !== 'flow') step(rival, h, inRival, S.wet);
    /* keep the two cars apart */
    const dx = rival.x - me.x, dz = rival.z - me.z, d = Math.hypot(dx, dz);
    if (S.mode !== 'flow' && d < 4.2 && d > .01){ const p = (4.2 - d) / 2, nx = dx / d, nz = dz / d; me.x -= nx * p; me.z -= nz * p; rival.x += nx * p; rival.z += nz * p; }
  }
  /* off the circuit for a second, or the end of the demo stretch: back on the road */
  if (me.offT > 1){ place(me, me.good, 0); say('', '回到赛道上', 1.4); }
  if (S.mode === 'free' && me.i >= N - 8){ hud.fade.classList.add('on'); S.fadeT = .6; }
  if (rival.i >= N - 8) place(rival, GRID + 7, -5);
}
function updateCarMesh(c, root, dr, dt){
  const fx = Math.sin(c.h), fz = Math.cos(c.h), vf = c.vx * fx + c.vz * fz;
  const acc = c.lastVf != null ? (vf - c.lastVf) / Math.max(dt, 1e-3) : 0; c.lastVf = vf;
  const latA = vf * (c.h - (c.lastH ?? c.h)) / Math.max(dt, 1e-3); c.lastH = c.h;
  c.pitch += ((-acc * .0016) - c.pitch) * Math.min(1, dt * 6); c.roll += ((-latA * .0035) - c.roll) * Math.min(1, dt * 6);
  c.pitch = Math.max(-.035, Math.min(.035, c.pitch)); c.roll = Math.max(-.05, Math.min(.05, c.roll));
  root.position.set(c.x, 0, c.z); root.rotation.set(c.pitch, c.h, c.roll, 'YXZ');
  for (const w of dr.wheels) w.rotation.x += vf / .36 * dt;
  for (const p of dr.fronts) p.rotation.y = c.steer;
  if (dr.lights.tail) dr.lights.tail.emissiveIntensity = c.brakeHard > .1 ? 9 : 2.5;
  /* tyre smoke when the tyres slide or brake hard, spray when wet */
  const v = Math.abs(vf), smoke = Math.max(c.over > .25 ? c.over : 0, c.slip > 4 ? Math.min(1, (c.slip - 4) / 6) : 0, c.brakeHard > .7 && v > 30 ? .4 : 0);
  for (const s of [-1, 1]){
    const p = carToWorld(c, s * .9, .3, -1.3);
    if (smoke > .05 && Math.random() < smoke * dt * 70) parts.spawn(p.x, .4, p.z, c.vx * .25 + (Math.random() - .5) * 2, .6 + Math.random(), c.vz * .25 + (Math.random() - .5) * 2, 1.6 + Math.random(), 3.2, 1.8 + Math.random(), .45, smokeCol);
    if (S.wet > .3 && v > 15 && Math.random() < S.wet * Math.min(1, v / 60) * dt * 90) parts.spawn(p.x, .35, p.z, c.vx * .55 + (Math.random() - .5) * 3, .8 + Math.random() * 1.5, c.vz * .55 + (Math.random() - .5) * 3, 1.2 + Math.random(), 4, .8 + Math.random() * .5, .28 * S.wet, sprayCol);
  }
}
function frame(now){
  requestAnimationFrame(frame);
  if (paused){ post.render(0); return; }
  let dt = Math.min(.05, (now - last) / 1000); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > .5){ fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; hud.fps.textContent = `${Math.round(fpsShow)} fps · 画质 ${Q.name}`; }
  update(dt); post.render(dt);
}
let paused = false;
function update(dt){
  S.t += dt;
  /* rain eases in, the road gets wet slower, dries slower still */
  S.rainT += (S.rain - S.rainT) * Math.min(1, dt / 2.5);
  S.wet += (S.rain - S.wet) * Math.min(1, dt / (S.rain > S.wet ? 6 : 14));
  W.setWet(S.wet); if (Math.abs((S.lastMood ?? -1) - S.rainT) > .08){ W.setMood(S.rainT); S.lastMood = S.rainT; post.setGrade('dusk', 'rain', S.rainT); }
  /* the start lights: five pairs, one by one, then all out */
  if (S.mode === 'auto'){ const on = S.t < 4.2 ? Math.min(5, Math.floor((S.t - .5) / .7) + 1) : 0; if (on !== lightsOn){ lightsOn = on; W.gateLights.forEach((m, k) => m.emissiveIntensity = k < on ? 7 : 0); }
    hud.count.textContent = S.t > 4.2 && S.t < 5.2 ? 'GO' : ''; }
  else if (lightsOn){ lightsOn = 0; W.gateLights.forEach(m => m.emissiveIntensity = 0); }
  if (S.mode !== 'menu') driveStep(dt);
  if (S.fadeT > 0){ S.fadeT -= dt; if (S.fadeT <= 0){ grid(); hud.fade.classList.remove('on'); } }
  updateCarMesh(me, meRoot, meDress, dt); updateCarMesh(rival, rivalRoot, rivalDress, dt);
  rivalRoot.visible = meRoot.visible = S.mode !== 'flow';
  /* the rival line, once per run */
  if ((S.mode === 'auto' || S.mode === 'free') && !S.passed && me.i > rival.i + 4 && S.t > 5){ S.passed = true; say('林学长', '欢迎来到 XMUM。', 3); }
  /* camera */
  let C;
  if (S.mode === 'auto'){
    let k = 0; while (k + 1 < SHOTS.length && S.t >= SHOTS[k + 1].t0) k++;
    const sh = SHOTS[k]; if (sh !== shot){ shot = sh; camState.init = false; }
    if (sh.name === 'end'){ toMenu(); C = chaseCam(me, 0); } else C = sh.cam();
  } else if (S.mode === 'flow'){
    const eye = carToWorld(me, 0, 1.3, 0), yaw = me.h + S.look.yaw, p = S.look.pitch;
    C = {pos:eye, look:v3(eye.x + Math.sin(yaw) * Math.cos(p) * 10, eye.y + Math.sin(p) * 10, eye.z + Math.cos(yaw) * Math.cos(p) * 10), fov:62, speed:0, fixed:true};
    if (S.t > 30) toMenu();
  } else C = S.cam === 'bonnet' ? bonnetCam(me) : chaseCam(me, 1);
  if (!camState.init || C.fixed || C.chase){ camState.pos.copy(C.pos); camState.look.copy(C.look); camState.fov = C.fov; camState.init = true; }
  else { const k = C.chase ? Math.min(1, dt * 7) : Math.min(1, dt * 12); camState.pos.lerp(C.pos, k); camState.look.lerp(C.look, Math.min(1, dt * 10)); camState.fov += (C.fov - camState.fov) * Math.min(1, dt * 3); }
  camera.position.copy(camState.pos);
  const v = Math.hypot(me.vx, me.vz);
  if (C.chase && v > 70){ const a = Math.min(1, (v - 70) / 90) * .05; camera.position.x += (Math.random() - .5) * a; camera.position.y += (Math.random() - .5) * a; }
  camera.lookAt(camState.look);
  if (Math.abs(camera.fov - camState.fov) > .01){ camera.fov = camState.fov; camera.updateProjectionMatrix(); }
  camState.speed += ((C.speed || 0) - camState.speed) * Math.min(1, dt * 4);
  /* world bits that follow the player */
  W.followShadow(me.x, me.z, Q.shadowBox, Q.shadow); W.tick(S.t);
  parts.update(dt); parts.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  parts.mat.uniforms.uLight.value.setScalar(.9 - .35 * S.rainT);
  rainFx.update(dt, camera.position, me.vx, me.vz, S.rainT, S.t);
  post.set({speed:camState.speed, rain:S.rainT, time:S.t});
  hud.spd.textContent = S.mode === 'menu' || S.mode === 'flow' || (S.mode === 'auto' && S.t < 4.6) ? '' : Math.round(v * 3.6) + ' km/h' + (me.mult > .05 ? ' · 氮气' : '');
  if (subT > 0){ subT -= dt; if (subT <= 0) hud.sub.classList.remove('on'); }
}
/* tests: jump the film to t seconds at a fixed step, then draw one frame */
function seek(t, opts = {}){ paused = true; if (opts.rain != null){ S.rain = opts.rain; S.rainT = S.wet = opts.rain; } if (opts.mode === 'free') startFree(); if (opts.mode === 'flow') startFlow(); if (opts.mode === 'auto') startAuto();
  while (S.t < t) update(1 / 30); post.render(1 / 30); return {t:S.t, mode:S.mode, kmh:Math.round(Math.hypot(me.vx, me.vz) * 3.6), i:me.i, rivalI:rival.i, shot:shot && shot.name}; }
function bench(frames = 120){
  paused = true; renderer.info.autoReset = false; const gl = renderer.getContext(), px = new Uint8Array(4);
  for (let k = 0; k < 10; k++){ update(1 / 60); post.render(1 / 60); }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now(); let calls = 0, tris = 0;
  for (let k = 0; k < frames; k++){ renderer.info.reset(); update(1 / 60); post.render(1 / 60); calls = renderer.info.render.calls; tris = renderer.info.render.triangles; }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  renderer.info.autoReset = true;
  return {ms:(performance.now() - t0) / frames, calls, tris};
}
window.XSepangDemo = {S, me, rival, Q, QK, gpu, startAuto, startFree, startFlow, toMenu, renderer, camera, scene, seek, bench, resume(){ paused = false; last = performance.now(); }};   /* for tests */
$('loading').hidden = true;
startAuto();
requestAnimationFrame(frame);
