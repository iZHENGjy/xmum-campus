/* 雪邦 · 结尾一圈「路在当下」—— 第一段：大一（约 30 秒）。方案见 docs/sepang-ending.md
 * 雨后黄昏，第一人称坐在 XMUM 的兰博基尼（Centenario 模型，去掉品牌标志换成 XMUM 校徽）驾驶舱里；
 * 一群车抢道、溅起水雾；挡风玻璃上有雨珠，仪表屏显示「大一」，后视镜下挂着学生证和奶娃；
 * 大约第 18 秒，前面的路面整个隆起成一座小山（第一次变形），车被抛起再落下。字幕是内心独白。
 * 操作：↑↓←→ / WASD，鼠标拖动转头看，R 重来。?bot=1 电脑开，?rec=1 由录像页逐帧推。 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { PTS } from './track-data.js';
import { N, clampI, RT, HD, HW, LAMBO, LAMBO_MAX, makeCar, place, locate, step, autoInput } from './physics.js';
import { buildWorld } from './world.js';
import { makeRacePost } from './race-post.js';
import { makeParticles } from './fx.js';
import { loadHDR } from './hdr.js';
import { naiwaPlush } from './toy-room.js';

const qs = new URLSearchParams(location.search), BOT = qs.has('bot'), REC = qs.has('rec');
const A = './ending-assets/';
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 5; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------------- renderer, scene ---------------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance', preserveDrawingBuffer:REC});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, .05, 9000);
const post = makeRacePost(renderer, scene, camera, {glow:0, fringe:0, sat:1.02, warm:[1.03, 1, .96], bloomThreshold:3, bloomIntensity:.4});
const W = buildWorld(renderer, scene, {palms:900});
W.sky.visible = false; scene.children.forEach(o => { if (o.isMesh && o.material && o.material.side === THREE.BackSide && o !== W.sky) o.visible = false; });   /* the old procedural sky and its overcast shell */

/* ---------------- loading screen ---------------- */
const status = document.getElementById('status'), say = t => { if (status) status.textContent = t; };

/* ---------------- the deformation: a bulge of earth under the track (everything in the world rises with it) ---------------- */
const BUMP = {c:new THREE.Vector2(), a:0, r:60};
const bumpU = {uBump:{value:new THREE.Vector4(0, 0, 0, 60)}};
const BUMP_GLSL = `
  vec4 wpB = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpB = instanceMatrix * wpB;
  #endif
  wpB = modelMatrix * wpB;
  vec2 dB = wpB.xz - uBump.xy;
  float hB = uBump.z * exp(-dot(dB, dB) / (uBump.w * uBump.w));
  transformed.y += hB;`;
function bumpify(mat){
  if (mat.userData.bumped) return; mat.userData.bumped = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); sh.uniforms.uBump = bumpU.uBump;
    sh.vertexShader = 'uniform vec4 uBump;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BUMP_GLSL); };
  mat.needsUpdate = true;
}
W.world.traverse(o => { if (o.isMesh || o.isInstancedMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(bumpify); });
/* the catch fence: a fine wire mesh shimmers at a distance; let the multisampling soften it */
W.world.traverse(o => { const m = o.material; if (m && m.alphaTest === .5 && m.side === THREE.DoubleSide && m.metalness === .6){ m.alphaToCoverage = true; m.color.multiplyScalar(.6); } });
const bumpAt = (x, z) => { const dx = x - BUMP.c.x, dz = z - BUMP.c.y; return BUMP.a * Math.exp(-(dx * dx + dz * dz) / (BUMP.r * BUMP.r)); };

/* ---------------- cars ---------------- */
const SPEC = Object.assign({}, LAMBO, {maxV:92, acc:15, grip:LAMBO_MAX.grip, steer:LAMBO_MAX.steer, nos:null});
const me = makeCar(SPEC, 20);
const rivals = [];
let hero = null, eyeLocal = v3(0, 1.1, 0), wheelNode = null, wheelAxis = v3(0, 0, 1);
const holders = [];

function badgeTexture(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  g.fillStyle = '#0f2f66'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#d8b24a'; g.lineWidth = 24; g.strokeRect(24, 24, 464, 464);
  g.fillStyle = '#e8c766'; g.font = '900 150px "Noto Serif SC","SimSun",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('XMUM', 256, 270);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dashTexture(){
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d'), t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.draw = (kmh) => { g.fillStyle = '#05070b'; g.fillRect(0, 0, 1024, 512); g.fillStyle = '#e8c766'; g.font = '700 120px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText('大一', 512, 200);
    g.fillStyle = '#9fb8d8'; g.font = '500 54px "Noto Sans SC",sans-serif'; g.fillText('2022 · 09 · 雪邦', 512, 290); g.fillStyle = '#f4ead6'; g.font = '800 90px sans-serif'; g.fillText(Math.round(kmh) + ' km/h', 512, 430); t.needsUpdate = true; };
  t.draw(0); return t;
}

async function loadCar(){
  say('载入车辆…');
  const g = await new GLTFLoader().loadAsync(A + 'centenario.glb');
  const car = g.scene;
  /* normalise: 4.6 m long, wheels on the ground, nose towards +z */
  let box = new THREE.Box3().setFromObject(car); const size = box.getSize(new THREE.Vector3()), s = 4.6 / Math.max(size.x, size.z);
  car.scale.multiplyScalar(s); if (size.x > size.z) car.rotation.y = Math.PI / 2; car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(car); car.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2); car.updateMatrixWorld(true);
  /* brand logos out, the XMUM badge in */
  const badge = new THREE.MeshStandardMaterial({map:badgeTexture(), roughness:.35, metalness:.4}), plain = new THREE.MeshStandardMaterial({color:'#15171b', roughness:.45, metalness:.5});
  const usedBy = {}; car.traverse(o => { if (o.isMesh) (usedBy[o.material.name] = usedBy[o.material.name] || []).push(o.name); }); window.__mats = usedBy;
  car.traverse(o => { if (!o.isMesh) return; const n = o.material.name; if (n === 'Steering_Wheel_Logo') o.material = badge; else if (n === 'LOGO' || n === 'CENTENARIO') o.material = plain; o.castShadow = true; o.receiveShadow = true;
    if (o.material.envMapIntensity !== undefined) o.material.envMapIntensity = 1; });
  car.traverse(o => { if (/movsteer/i.test(o.name)) wheelNode = o; });
  const wb = new THREE.Box3().setFromObject(wheelNode || car), wc = wb.getCenter(new THREE.Vector3());
  eyeLocal = v3(wc.x, wb.max.y + .05, wc.z - .36);             /* behind the wheel, high enough to see the road over the dash */
  /* the steering column: turn the wheel about the line from its centre towards the driver */
  if (wheelNode){ const wq = wheelNode.getWorldQuaternion(new THREE.Quaternion()).invert(); wheelNode.userData.axis = new THREE.Vector3().subVectors(car.localToWorld(eyeLocal.clone()), wc).normalize().applyQuaternion(wq); wheelNode.userData.q0 = wheelNode.quaternion.clone(); }
  return car;
}
function makeHolder(car, paint){
  const h = new THREE.Group(); const c = paint ? skClone(car) : car; h.add(c); scene.add(h);
  if (paint) c.traverse(o => { if (o.isMesh && o.material.name === 'Body_Colour'){ o.material = o.material.clone(); o.material.color.set(paint); } });
  return h;
}

/* ---------------- windshield raindrops, the dash screen, the charm under the mirror ---------------- */
const dropsMat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uT:{value:0}, uSpeed:{value:0}, uWet:{value:1}},
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:`varying vec2 vUv; uniform float uT, uSpeed, uWet;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    vec4 layer(vec2 uv, float scale, float t){
      vec2 g = uv * vec2(scale * 1.8, scale); vec2 id = floor(g); vec2 f = fract(g) - .5; float n = h21(id);
      float live = step(.35, n) * step(n, .35 + .6 * uWet);
      float run = fract(t * (.1 + n * .3) * (.2 + uSpeed * 2.5) + n * 7.);       /* faster = drops are blown up the glass */
      vec2 c = vec2((n - .5) * .5, -.45 + run * .9 * step(.4, uSpeed + n * .2));
      vec2 d = (f - c) * vec2(1., 1. + uSpeed * 1.5); float r = .08 + .12 * h21(id + 3.);
      float m = smoothstep(r, r * .6, length(d)) * live;
      float rim = smoothstep(r * .55, r * .95, length(d)) * m;
      float hi = smoothstep(r * .5, 0., length(d - vec2(-.3, .3) * r)) * m;
      return vec4(vec3(.85, .88, .92) * hi * 1.6 + vec3(.02) * rim, m * (.18 + rim * .5 + hi * .5));
    }
    void main(){ vec4 a = layer(vUv, 9., uT), b = layer(vUv * 1.7 + .3, 14., uT * 1.3);
      vec4 c = a + b * (1. - a.a); gl_FragColor = vec4(c.rgb, c.a * .9); }`});
let drops = null, charm = null, dashTex = dashTexture(), bobble = null, giant = null; const fans = [], bob = {a:0, v:0, b:0, w:0};
const charmState = {a:0, v:0, b:0, w:0};

/* ---------------- spray behind every car on the wet track ---------------- */
const spray = makeParticles(scene, 3000), SPRAY = new THREE.Color('#c9cdd2'), DUST = new THREE.Color('#8a7a66');
/* chunks of asphalt: one instanced mesh, simple ballistic flight, they come to rest on the ground */
const debris = (() => { const n = 260, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({color:'#2a2b2e', roughness:.9}), n), st = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(); let next = 0;
  im.count = n; im.castShadow = true; im.frustumCulled = false; for (let k = 0; k < n; k++){ st.push({live:0}); m.makeScale(0, 0, 0); im.setMatrixAt(k, m); } scene.add(im);
  return {throw(x, y, z, vx, vy, vz){ const s = st[next]; next = (next + 1) % n; Object.assign(s, {x, y, z, vx, vy, vz, r:rng() * 6, w:(rng() - .5) * 8, s:.4 + rng() * 1.6, live:8}); },
    update(dt){ st.forEach((s, k) => { if (s.live <= 0) return; s.live -= dt; s.vy -= 20 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.r += s.w * dt; const g = bumpAt(s.x, s.z) + s.s * .3; if (s.y < g){ s.y = g; s.vy *= -.25; s.vx *= .6; s.vz *= .6; s.w *= .6; }
      q.setFromEuler(e.set(s.r, s.r * .7, s.r * .3)); m.compose(p.set(s.x, s.y, s.z), q, sc.set(s.s, s.s * .4, s.s * .8)); im.setMatrixAt(k, m); }); im.instanceMatrix.needsUpdate = true; },
    reset(){ st.forEach(s => s.live = 0); } };
})();

/* ---------------- HUD: subtitles (monologue), the first hint ---------------- */
const hud = document.getElementById('hud'), hg = hud.getContext('2d');
const LINES = [[1.0, 6.5, '大一。第一次在 KLIA 落地，热得睁不开眼。'], [7.5, 13, '一个人，拖着两个箱子。Selamat datang.'], [14, 19, '那时候什么都是新的，路也是。'], [24.5, 30, '后来才知道，四年会这么快。']];
function drawHud(){
  const Wd = hud.width, H = hud.height, s = H / 720; hg.clearRect(0, 0, Wd, H);
  const bar = H * .085; hg.fillStyle = '#000'; hg.fillRect(0, 0, Wd, bar); hg.fillRect(0, H - bar, Wd, bar);   /* letterbox: it is a film */
  for (const [a, b, t] of LINES){ if (G.t < a || G.t > b) continue; const k = Math.min(1, (G.t - a) / .8, (b - G.t) / .8);
    hg.globalAlpha = k; hg.textAlign = 'center'; hg.shadowColor = 'rgba(0,0,0,.8)'; hg.shadowBlur = 8 * s; hg.fillStyle = '#f4ede0'; hg.font = `500 ${26 * s}px "Noto Sans SC","Microsoft YaHei",sans-serif`;
    hg.fillText(t, Wd / 2, H - bar - 34 * s); hg.globalAlpha = 1; hg.shadowBlur = 0; }
  if (!BOT && !REC && G.t < 6){ hg.textAlign = 'left'; hg.fillStyle = 'rgba(244,237,224,.75)'; hg.font = `500 ${14 * s}px "Noto Sans SC",sans-serif`; hg.fillText('↑↓←→ / WASD 开车 · 按住鼠标拖动转头看 · R 重来', 24 * s, bar + 28 * s); }
}

/* ---------------- state, input ---------------- */
const G = {t:0, look:{yaw:0, pitch:0}, shake:0, ready:false};
const keys = {}; addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') reset(); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
let drag = null; addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; }); addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; G.look.yaw -= (e.clientX - drag[0]) * .004; G.look.pitch -= (e.clientY - drag[1]) * .003; G.look.pitch = Math.max(-.5, Math.min(.4, G.look.pitch)); G.look.yaw = Math.max(-2.2, Math.min(2.2, G.look.yaw)); drag = [e.clientX, e.clientY]; });
function playerInput(){ const up = keys.ArrowUp || keys.KeyW, dn = keys.ArrowDown || keys.KeyS, l = keys.ArrowLeft || keys.KeyA, r = keys.ArrowRight || keys.KeyD; return {thr:up ? 1 : dn ? -1 : 0, steer:(l ? 1 : 0) - (r ? 1 : 0), brake:false, nos:false}; }

function reset(){
  G.t = 0; place(me, 20, -3); me.vx = Math.sin(me.h) * 52; me.vz = Math.cos(me.h) * 52;
  const slots = [[25, 4, 53], [29, -4, 54], [36, 1.5, 54], [16, 5, 52], [42, -5, 55]];
  rivals.forEach((c, k) => { const [i, lat, v] = slots[k]; place(c, i, lat); c.vx = Math.sin(c.h) * v; c.vz = Math.cos(c.h) * v; c.lane = lat; });
  BUMP.a = 0; BUMP.set = false; G.shake = 0; debris.reset();
}

/* ---------------- simulation ---------------- */
const taper = (c, o) => { const v = Math.hypot(c.vx, c.vz); if (o.thr > 0) o.thr *= 1 - .7 * Math.min(1, (v / c.T.maxV) ** 2); return o; };
function stepAll(dt){
  G.t += dt;
  /* the first transformation: ~250 m ahead of you at 17.5 s the ground starts to heave, peaks at 12 m, settles by 27 s */
  if (G.t > 17.5 && !BUMP.set){ BUMP.set = true; const i = clampI(me.i + 85); BUMP.c.set(PTS[i][0], PTS[i][1]); }
  if (BUMP.set){ const t = G.t - 17.5; BUMP.a = 12 * Math.min(1, t / 2.2) * (t < 7 ? 1 : Math.max(0, 1 - (t - 7) / 2.5)); }
  bumpU.uBump.value.set(BUMP.c.x, BUMP.c.y, BUMP.a, BUMP.r);
  const inMe = BOT || REC ? autoInput(me, {over:1.02, lat:Math.sin(G.t * .35) * 3 - 1, nos:false}) : playerInput();
  step(me, dt, taper(me, inMe), .6);
  for (const c of rivals){ if (rng() < .006) c.lane = (rng() - .5) * 2 * (HW[c.i] - 4);
    const gap = c.i - me.i; c.T.maxV = c.base * (1 + Math.max(-.14, Math.min(.12, -gap / 60)));   /* keep the pack around you */
    step(c, dt, taper(c, autoInput(c, {over:1, lat:c.lane, nos:false})), .6); }
  /* contact between cars: push apart, a little shake */
  const all = [me, ...rivals];
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++){ const A2 = all[a], B = all[b], dx = B.x - A2.x, dz = B.z - A2.z, d = Math.hypot(dx, dz);
    if (d < 2.4 && d > .01){ const nx = dx / d, nz = dz / d, o = (2.4 - d) / 2; A2.x -= nx * o; A2.z -= nz * o; B.x += nx * o; B.z += nz * o; const rel = (A2.vx - B.vx) * nx + (A2.vz - B.vz) * nz;
      if (rel > 0){ A2.vx -= nx * rel * .5; A2.vz -= nz * rel * .5; B.vx += nx * rel * .5; B.vz += nz * rel * .5; if (A2 === me || B === me) G.shake = Math.max(G.shake, Math.min(1, rel / 8)); } } }
  /* spray off the wet road */
  for (const c of all){ const v = Math.hypot(c.vx, c.vz); if (v < 15) continue; const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h), y = bumpAt(c.x, c.z);
    for (let k = 0; k < 2; k++){ const sd = k ? 1 : -1; if (rng() > v / 90) continue;
      spray.spawn(c.x - fx * 2 + rx * sd * .8, y + .3, c.z - fz * 2 + rz * sd * .8, c.vx * .55 + (rng() - .5) * 2, .6 + rng() * 1.2, c.vz * .55 + (rng() - .5) * 2, .6, 3, .7 + rng() * .4, .05, SPRAY); } }
  /* the heave throws up chunks of asphalt and a ring of dust */
  if (BUMP.set && G.t < 21){ for (let k = 0; k < 3; k++){ const a = rng() * 6.283, r = BUMP.r * (.8 + rng() * .6), x = BUMP.c.x + Math.cos(a) * r, z = BUMP.c.y + Math.sin(a) * r;
      spray.spawn(x, bumpAt(x, z) + .5, z, Math.cos(a) * 3, 2 + rng() * 3, Math.sin(a) * 3, 3, 4, 2.5 + rng(), .22, DUST);
      if (rng() < .5) debris.throw(BUMP.c.x + Math.cos(a) * r * .5, bumpAt(x, z), BUMP.c.y + Math.sin(a) * r * .5, Math.cos(a) * (2 + rng() * 6), 8 + rng() * 10, Math.sin(a) * (2 + rng() * 6)); } }
  debris.update(dt);
}

/* ---------------- place the cars, the camera ---------------- */
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function placeCar(holder, c){
  const y = bumpAt(c.x, c.z), fx = Math.sin(c.h), fz = Math.cos(c.h);
  const pitch = Math.atan2(bumpAt(c.x + fx * 2, c.z + fz * 2) - bumpAt(c.x - fx * 2, c.z - fz * 2), 4);
  holder.position.set(c.x, y, c.z); holder.rotation.set(-pitch, c.h, -(c.steer || 0) * .03, 'YXZ');
}
function updateCamera(rdt){
  const v = Math.hypot(me.vx, me.vz);
  const eye = eyeLocal.clone(); G.shake *= Math.exp(-5 * rdt);
  const t = G.t, buzz = .0025 * Math.min(1, v / 60) + G.shake * .02;
  eye.x += Math.sin(t * 41) * buzz; eye.y += Math.sin(t * 53 + 1) * buzz;
  const world = holders[0].localToWorld(eye.clone());
  camera.position.copy(world);
  /* look: car heading + mouse; lean with the car, a touch of G-force */
  camera.quaternion.copy(holders[0].getWorldQuaternion(_q));
  camera.rotateY(Math.PI + G.look.yaw); camera.rotateX(-.1 + G.look.pitch);   /* the model looks down +z, a camera down -z: turn it round, then the mouse look */
  camera.fov = 72 + Math.min(8, v / 12); camera.updateProjectionMatrix();
  /* the heave: you feel it in the seat */
  if (BUMP.set && G.t < 21) G.shake = Math.max(G.shake, .5);
}

/* ---------------- loop ---------------- */
function resize(){ const w = innerWidth, h = innerHeight; if (!w) return; renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); hud.width = w * devicePixelRatio; hud.height = h * devicePixelRatio; }
addEventListener('resize', resize);
function frame(rdt){
  if (!G.ready) return;
  if (innerWidth && renderer.domElement.width !== Math.floor(innerWidth * renderer.getPixelRatio())) resize();
  const n = Math.max(1, Math.ceil(rdt / (1 / 120))); for (let k = 0; k < n; k++) stepAll(rdt / n);
  placeCar(holders[0], me); rivals.forEach((c, k) => placeCar(holders[k + 1], c));
  /* steering wheel follows the steering, the dash screen shows the year */
  if (wheelNode && wheelNode.userData.axis){ wheelNode.quaternion.copy(wheelNode.userData.q0).multiply(_q.setFromAxisAngle(wheelNode.userData.axis, me.steer * 2.2)); }
  const v = Math.hypot(me.vx, me.vz); if (Math.floor(G.t * 8) !== G.dashTick){ G.dashTick = Math.floor(G.t * 8); dashTex.draw(v * 3.6); }
  dropsMat.uniforms.uT.value = G.t; dropsMat.uniforms.uSpeed.value = Math.min(1, v / 70); dropsMat.uniforms.uWet.value = Math.max(.25, 1 - G.t / 40);
  /* charm: a pendulum driven by the car's acceleration */
  if (charm){ const ax = (v - (G.lastV ?? v)) / Math.max(rdt, 1e-3); G.lastV = v; charmState.v += (-charmState.a * 30 - charmState.v * 1.5 - ax * .02) * rdt; charmState.a += charmState.v * rdt;
    charmState.w += (-charmState.b * 30 - charmState.w * 1.5 + me.steer * 3) * rdt; charmState.b += charmState.w * rdt; charm.rotation.set(charmState.a, 0, charmState.b); }
  /* the bobblehead nods with braking and steering; the fans wave; the giant sways */
  if (bobble){ const ax = (v - (G.lastV2 ?? v)) / Math.max(rdt, 1e-3); G.lastV2 = v; bob.v += (-bob.a * 60 - bob.v * 3 - ax * .03) * rdt; bob.a += bob.v * rdt; bob.w += (-bob.b * 60 - bob.w * 3 + me.steer * 4) * rdt; bob.b += bob.w * rdt;
    bobble.rotation.set(Math.max(-.5, Math.min(.5, bob.a)), Math.PI, Math.max(-.5, Math.min(.5, bob.b))); bobble.position.y = (bobble.userData.y0 ??= bobble.position.y) + Math.abs(Math.sin(G.t * 9)) * .002 * Math.min(1, v / 40); }
  for (const fan of fans){ fan.arms.forEach((a, k) => { a.rotation.z = (k ? -1 : 1) * (.5 + 1.0 * (.5 + .5 * Math.sin(G.t * 7 + fan.ph + k))); }); fan.f.position.y = 1.05 + bumpAt(fan.f.position.x, fan.f.position.z) * 0 + Math.abs(Math.sin(G.t * 5 + fan.ph)) * .12; }
  if (giant){ giant.rotation.z = Math.sin(G.t * .8) * .05; giant.rotation.x = Math.sin(G.t * .6 + 1) * .03; }
  W.followShadow(me.x, me.z, 60, 2048); W.tick(G.t);
  spray.update(rdt); spray.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  updateCamera(rdt);
  post.set({speed:Math.min(.3, Math.max(0, (v - 50) / 120)), boost:0, exposure:G.exposure || .95});
  post.render(rdt); drawHud();
}
let last = performance.now();
function loop(now){ requestAnimationFrame(loop); const rdt = Math.min(.05, (now - last) / 1000); last = now; frame(rdt); }

/* ---------------- start ---------------- */
(async () => {
  try {
    say('载入天空…');
    const [sky, asphalt] = await Promise.all([loadHDR(A + 'victoria_sunset_2k.hdr'), Promise.all(['diff', 'nor_gl', 'rough'].map(k => new THREE.TextureLoader().loadAsync(A + 'asphalt_track_' + k + '_2k.jpg')))]);
    /* the sun: the brightest spot of the sky picture; turn the sky so it sits low, ahead and to the left of the straight */
    { const img = sky.image, d = img.data, Wd = img.width, Hh = img.height; let best = 0, bi = 0; for (let i = 0; i < Wd * Hh; i += 3){ const y = THREE.DataUtils.fromHalfFloat(d[i * 4 + 1]); if (y > best){ best = y; bi = i; } }
      const u = (bi % Wd) / Wd, vv = Math.floor(bi / Wd) / Hh, phi = u * 2 * Math.PI, theta = vv * Math.PI;
      const sunImg = v3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).normalize();
      const straight = Math.atan2(PTS[300][0] - PTS[20][0], PTS[300][1] - PTS[20][1]), wantAz = straight + 1.25, haveAz = Math.atan2(sunImg.x, sunImg.z);
      const rot = wantAz - haveAz + 2.6; scene.backgroundRotation.set(0, rot, 0);   /* +2.6: chosen by eye, the low sun behind your shoulder gilds the track ahead */ scene.environmentRotation.set(0, rot, 0);
      const sd = sunImg.clone().applyAxisAngle(v3(0, 1, 0), rot); sd.y = Math.max(.08, sd.y); W.sunDir.copy(sd.normalize()); }
    scene.background = sky; scene.backgroundIntensity = .9;
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky).texture; scene.environmentIntensity = .9;
    W.sun.color.set('#ffc890'); W.sun.intensity = 1.7;
    scene.fog.color.set('#8f8a86'); scene.fog.density = .00045;
    /* the real track asphalt, wet */
    const [dm, nm, rm] = asphalt; for (const t of asphalt){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.repeat.set(3.2, 3.2); } dm.colorSpace = THREE.SRGBColorSpace;
    const road = W.materials.road; road.map = dm; road.normalMap = nm; road.roughnessMap = rm;
    W.setWet(1); road.roughness = 1; road.normalScale.set(1.1, 1.1); road.color.set('#b4b0aa'); road.envMapIntensity = 1.15;
    /* after the rain: patches of standing water (dark, mirror-smooth) between matte dry asphalt; the mask is a slow noise in world space */
    { const prev = road.onBeforeCompile;
      road.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r);
        sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec2 vWetP;
void main() {').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>
 vWetP = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec2 vWetP;
          float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5); float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
            float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5); float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
          float wetMask(vec2 p){ return wn(p * .09) * .55 + wn(p * .23 + 7.) * .3 + wn(p * .7 + 3.) * .15; }
          void main() {`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            float wetK = smoothstep(.42, .58, wetMask(vWetP));                         /* 1 = standing water */
            roughnessFactor = mix(clamp(roughnessFactor * .85, .35, .9), .04, wetK);
            diffuseColor.rgb *= mix(1.0, .45, wetK);`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            normal = normalize(mix(normal, normalize(vNormal), smoothstep(.42, .58, wetMask(vWetP)) * .85));   /* water fills the grain: flat in the puddles */`);
      }; road.needsUpdate = true; }
    /* the cars */
    const car = await loadCar(); say('');
    holders.push(makeHolder(car, null));
    /* your own car: its own materials, with the sky reflections turned well down inside the cabin (no glare off the door panels) */
    car.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); if (o.material.envMapIntensity !== undefined) o.material.envMapIntensity = /glass|gls/i.test(o.material.name) ? .8 : .3; } });
    /* the leather's texture has a rainbow patch where the seat bolster maps: plain dark leather instead */
    const leather = new THREE.MeshStandardMaterial({color:'#1d1b19', roughness:.62, metalness:0, envMapIntensity:.3}); car.traverse(o => { if (o.isMesh && o.material.name === 'CUIR') o.material = leather; });
    const paints = ['#c8102e', '#e9e9ec', '#1d4f9c', '#f2c230', '#2c6a3f'];
    paints.forEach((p, k) => { const c = makeCar(Object.assign({}, SPEC, {maxV:90 + k * 1.2}), 30); c.base = c.T.maxV; rivals.push(c); holders.push(makeHolder(car, p)); });
    /* windshield drops: a sheet just inside the glass, in the car's frame */
    drops = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .75), dropsMat); drops.position.copy(eyeLocal).add(v3(0, .12, .62)); drops.rotation.x = -1.0; drops.renderOrder = 9; holders[0].add(drops);
    /* the dash screen */
    car.traverse(o => { if (o.isMesh && o.material.name === 'Display'){ o.material = new THREE.MeshBasicMaterial({map:dashTex}); } });
    /* the charm: student card + a tiny 奶娃 on a string */
    charm = new THREE.Group(); charm.position.copy(eyeLocal).add(v3(.02, .34, .62)); holders[0].add(charm);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(.002, .002, .12, 4), new THREE.MeshBasicMaterial({color:'#222'})); str.position.y = -.06; charm.add(str);
    const card = new THREE.Mesh(new THREE.BoxGeometry(.036, .056, .002), new THREE.MeshStandardMaterial({map:(() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, 128, 200); g.fillStyle = '#103b7a'; g.fillRect(0, 0, 128, 46); g.fillStyle = '#e8c766'; g.font = '800 28px serif'; g.textAlign = 'center'; g.fillText('XMUM', 64, 34); g.fillStyle = '#b9c2cc'; g.fillRect(34, 60, 60, 70); g.fillStyle = '#2b2f36'; g.font = '600 15px sans-serif'; g.fillText('2022 新生', 64, 156); g.fillText('学生证', 64, 180); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness:.85, color:'#8a8a8a', envMapIntensity:.2}));
    card.position.y = -.15; charm.add(card);
    const nw = new THREE.Mesh(new THREE.SphereGeometry(.011, 12, 8), new THREE.MeshStandardMaterial({color:'#f2c64a', roughness:.8})); nw.scale.set(1, 1.6, 1); nw.position.set(.035, -.13, 0); charm.add(nw);
    /* 奶娃 on the dash: a little bobblehead that nods with the car */
    const dashY = (wheelNode ? new THREE.Box3().setFromObject(wheelNode).max.y : 1) - .01;
    bobble = naiwaPlush(eyeLocal.x - .42, dashY, eyeLocal.z + .62, .05); bobble.rotation.y = Math.PI; holders[0].add(bobble);
    bobble.traverse(o => { if (o.isMesh){ o.castShadow = false; } });
    /* 奶娃 friends on the pit wall, waving you past */
    for (const [i, side] of [[70, -1], [118, -1], [160, 1], [205, -1], [262, 1], [318, -1], [372, -1], [430, 1]]){
      const [x, z] = [PTS[i][0] + RT[i][0] * side * (HW[i] + 6.5), PTS[i][1] + RT[i][1] * side * (HW[i] + 6.5)];
      const f = naiwaPlush(x, 1.05, z, .9); f.rotation.y = HD[i] + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI; scene.add(f); f.traverse(o => { if (o.isMesh) bumpify(o.material); });
      const arms = []; f.traverse(o => { if (o.isMesh && o.geometry.type === 'CapsuleGeometry' && Math.abs(o.position.y - 1.0) < .05) arms.push(o); }); fans.push({f, arms, ph:i * .37}); }
    /* a giant inflatable 奶娃 beside the straight, swaying in the wind */
    { const i = 300, [x, z] = [PTS[i][0] + RT[i][0] * (HW[i] + 46), PTS[i][1] + RT[i][1] * (HW[i] + 46)]; giant = naiwaPlush(x, 0, z, 14); giant.rotation.y = HD[i] - Math.PI / 2 + .3; scene.add(giant); giant.traverse(o => { if (o.isMesh) bumpify(o.material); }); }
    reset(); G.ready = true; resize();
    if (!REC) requestAnimationFrame(loop); else { const still = () => { requestAnimationFrame(still); post.render(0); }; requestAnimationFrame(still); }
    /* a soft fill inside the cabin, the way a film lights a car interior */
    const fill = new THREE.PointLight('#ffd9b0', 1.6, 2.6, 2); fill.position.copy(eyeLocal).add(v3(0, .25, .35)); holders[0].add(fill);
    /* test hooks: step the film frame by frame and save a picture (works even when the page is not on screen) */
    const out = document.createElement('canvas');
    const capture = async (name, w = 1280, h = 720) => { out.width = w; out.height = h; const g = out.getContext('2d');
      renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); hud.width = w; hud.height = h;
      post.render(0); drawHud(); g.drawImage(renderer.domElement, 0, 0, w, h); g.drawImage(hud, 0, 0, w, h);
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', .9)); await fetch('/save?name=' + name, {method:'POST', body:blob}); return blob.size; };
    const pick = (nx, ny) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera); const h = rc.intersectObjects(holders[0].children, true)[0]; return h ? h.object.name + ' / ' + h.object.material.name + ' / ' + h.distance.toFixed(2) : null; };
    window.XEnd = {G, me, rivals, frame, reset, renderer, camera, scene, hud, post, capture, pick, ready:true};
  } catch (e){ say('出错了：' + e.message); console.error(e); window.XEnd = {error:String(e.stack || e)}; }
})();
