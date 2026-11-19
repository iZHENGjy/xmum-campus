/* 雪邦赛车城 · 主直道 → T1 的风格化赛车章节（默认）和灰盒试驾（?grey=1）
 *
 * 风格化章节（默认）：写实打底 + 风格化电影感，对标一段别人用 Fable 5.2 做的赛车视频。场景在 toon-world.js，后处理在 race-post.js。
 *   6 辆车比赛，你从第 4 位发车，两圈；对手围着你跑（各自在车群里有个位置，跑远了会追回来），录像机器人会让开对手；
 *   蓝白尾焰、车底一阵阵的橙色火花、霓虹、泛光；四周径向模糊（左右强、上方弱，车身保持清楚）、放射速度线、开氮气时屏幕边缘的粉色光晕；
 *   左上名次和小地图，右上圈速、圈数、车速，右下发光的氮气按钮，左下摇杆。
 *
 * 灰盒试驾（?grey=1）：先把「开起来爽不爽」调出来的版本：灰色路面、墙、灯柱、龙门架、隧道、方块楼。
 * 已有：
 *   1. 速度感：视野随速度变宽、镜头弹簧拖后、高速微抖、撞击震屏、放射模糊和速度线、引擎声随转速和挡位变（WebAudio 合成，按任意键后才出声）；
 *      路边贴得很近的东西：条纹护墙、每 21 米一根灯柱、龙门架、150 米隧道的柱子。
 *   2. 能撞烂的东西：锥桶、水马、路牌、夜市摊位、玻璃候车亭。一撞就飞，碎片有重力和弹跳；大撞击顿帧 + 慢镜头。
 *   3. 冒险换氮气：擦车而过、漂移、贴墙飞、撞烂东西都加氮气；氮气不会自己回满。开氮气时视野猛地变宽、画面更糊、引擎声变尖。
 * 操作：↑/W 油门，↓/S 刹车倒车，←→/AD 转向，Shift 氮气，空格 手刹（甩尾），R 回到起点，M 静音。
 * 测试：?bot=1 让电脑开（录视频用），?rec=1 不自己跑循环，由录像页一帧一帧推。 */

import * as THREE from 'three';
import { PTS } from './track-data.js';
import { N, clampI, RT, HD, K, HW, KERB, kerbOn, LAMBO, LAMBO_MAX, makeCar, place, locate, step, autoInput } from './physics.js';
import { makePost } from './post.js';
import { makeParticles, makeSparks } from './fx.js';
import { makeHeroCar } from './hero-car.js';
import { makeRacePost } from './race-post.js';
import { buildToonWorld } from './toon-world.js';

const Q = {msaa:4, bloomScale:1, dof:false};
const qs = new URLSearchParams(location.search), BOT = qs.has('bot'), REC = qs.has('rec'), TOON = !qs.has('grey');
const WALL = 5;                       /* the barrier stands 5 m outside the white line: a street circuit, not a run-off desert */
const GRID = 40;
const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const P = (i, off) => { const j = clampI(Math.round(i)); return [PTS[j][0] + RT[j][0] * off, PTS[j][1] + RT[j][1] * off]; };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- renderer, scene, camera, post ---------------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance', preserveDrawingBuffer:REC});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(); if (!TOON){ scene.background = new THREE.Color('#9fb3c8'); scene.fog = new THREE.FogExp2('#a9b7c4', .0011); }
const camera = new THREE.PerspectiveCamera(64, 1, .3, TOON ? 12000 : 4000);
const post = TOON ? makeRacePost(renderer, scene, camera, {fringe:0, lineDen:[.05, .14], thin:10, sat:1.25, pow:1.12, warm:[1.08, 1.01, .87], bloomThr:1.1, blur:.42, glow:.6, edge:.09, aniso:[1.25, .8], keep:[.5, .25, .4]}) : makePost(renderer, scene, camera, Q);
if (!TOON) post.setGrade('dusk', 'dusk', 0);
if (TOON) renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let sun = null;
if (!TOON){ scene.add(new THREE.HemisphereLight('#dfe8f2', '#5b5548', 1.1)); sun = new THREE.DirectionalLight('#fff1dc', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-70, right:70, top:70, bottom:-70, near:1, far:400}); sun.shadow.bias = -.0004; scene.add(sun, sun.target); }
const SUN = v3(-.45, .75, -.35).normalize();

/* ---------------- greybox world ---------------- */
const tex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const S = [0]; for (let i = 1; i < N; i++) S.push(S[i - 1] + Math.hypot(PTS[i][0] - PTS[i - 1][0], PTS[i][1] - PTS[i - 1][1]));

function ribbon(lats, us, y, vScale, mat, from = 0, to = N - 1){
  const pos = [], uv = [], idx = [], n = us.length;
  for (let i = from; i <= to; i++){ const L = lats(i); for (let k = 0; k < n; k++){ const [x, z] = P(i, L[k]); pos.push(x, typeof y === 'function' ? y(k) : y, z); uv.push(us[k], S[i] / vScale); } }
  for (let r = 0; r < to - from; r++) for (let k = 0; k < n - 1; k++){ const a = r * n + k, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
if (!TOON){
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({color:'#7c8a6a', roughness:1}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.05; ground.receiveShadow = true; scene.add(ground);
  /* road: run-off | white line | asphalt with lane dashes (they stream past: the first speed cue) | white line | run-off */
  const road = tex(512, 512, (g, w, h) => { g.fillStyle = '#5d5f62'; g.fillRect(0, 0, w, h); g.fillStyle = '#3c3e42'; g.fillRect(w * .2, 0, w * .6, h);
    g.fillStyle = '#eceae4'; g.fillRect(w * .2 - 6, 0, 8, h); g.fillRect(w * .8 - 2, 0, 8, h);
    for (const u of [.35, .5, .65]) g.fillRect(w * u - 3, 0, 6, h * .4);
    for (let n = 0; n < 4000; n++){ g.fillStyle = `rgba(${rng() < .5 ? '0,0,0' : '255,255,255'},${.03 + rng() * .05})`; g.fillRect(rng() * w, rng() * h, 2, 2); } });
  road.wrapT = THREE.RepeatWrapping;
  ribbon(i => [-(HW[i] + WALL), -HW[i], 0, HW[i], HW[i] + WALL], [0, .2, .5, .8, 1], .02, 24, new THREE.MeshStandardMaterial({map:road, roughness:.85}));
  /* kerbs where there is a bend */
  const kerb = tex(64, 256, (g, w, h) => { for (let y = 0; y < h; y += 64){ g.fillStyle = (y / 64) % 2 ? '#e9e6df' : '#c42a22'; g.fillRect(0, y, w, 64); } }); kerb.wrapT = THREE.RepeatWrapping;
  const km = new THREE.MeshStandardMaterial({map:kerb, roughness:.7});
  let a = -1; for (let i = 0; i <= N; i++){ const on = i < N && kerbOn(i); if (on && a < 0) a = i; if (!on && a >= 0){ if (i - 1 > a) for (const s of [-1, 1]) ribbon(j => s > 0 ? [HW[j], HW[j] + KERB] : [-(HW[j] + KERB), -HW[j]], [0, 1], .05, 8, km, a, i - 1); a = -1; } }
  /* the barrier: striped panels 2 m wide, so the wall itself tells you how fast you are going */
  const wallT = tex(256, 64, (g, w, h) => { g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#c42a22'; g.fillRect(0, 0, w / 2, h); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 6, w, 6); g.fillRect(w / 2 - 2, 0, 4, h); });
  wallT.wrapS = THREE.RepeatWrapping; const wm = new THREE.MeshStandardMaterial({map:wallT, roughness:.8, side:THREE.DoubleSide});
  for (const s of [-1, 1]){ const pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++){ const [x, z] = P(i, s * (HW[i] + WALL)); pos.push(x, 0, z, x, 1.1, z); uv.push(S[i] / 4, 0, S[i] / 4, 1); if (i < N - 1){ const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, wm); m.castShadow = m.receiveShadow = true; scene.add(m); }
  /* lamp posts every 21 m, both sides, arm over the road: they flick past at head height */
  const posts = [], arms = [];
  for (let i = 4; i < N; i += 7) for (const s of [-1, 1]){ const [x, z] = P(i, s * (HW[i] + WALL + .7));
    const p = new THREE.CylinderGeometry(.13, .2, 10, 6); p.translate(x, 5, z); posts.push(p);
    const arm = new THREE.BoxGeometry(.18, .18, 4); arm.translate(0, 9.8, -2); arm.rotateY(HD[i] + (s > 0 ? -Math.PI / 2 : Math.PI / 2)); arm.translate(x, 0, z); arms.push(arm); }
  const steel = new THREE.MeshStandardMaterial({color:'#8d939a', roughness:.5, metalness:.6});
  const merge = list => { let n = 0; const all = list.map(g => g.index ? g.toNonIndexed() : g); const pos = []; for (const g of all){ pos.push(...g.attributes.position.array); } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.computeVertexNormals(); return out; };
  const pm = new THREE.Mesh(merge(posts.concat(arms)), steel); pm.castShadow = true; scene.add(pm);
  /* gantries every 240 m: you dive under them */
  const gan = [], panels = [];
  for (let i = 70; i < N - 10; i += 80){ const w = HW[i] + WALL + 1, h = HD[i];
    for (const s of [-1, 1]){ const [x, z] = P(i, s * w), p = new THREE.BoxGeometry(.6, 8, .6); p.translate(x, 4, z); gan.push(p); }
    const b = new THREE.BoxGeometry(2 * w, 1, 1); b.translate(0, 7.6, 0); b.rotateY(h + Math.PI / 2); const [cx, cz] = P(i, 0); b.translate(cx, 0, cz); gan.push(b);
    const sp = new THREE.BoxGeometry(14, 2.6, .3); sp.translate(0, 6.2, 0); sp.rotateY(h); sp.rotateY(Math.PI); const [px, pz] = P(i, -4); sp.translate(px, 0, pz); panels.push(sp); }
  const gm = new THREE.Mesh(merge(gan), new THREE.MeshStandardMaterial({color:'#4b5058', roughness:.6, metalness:.4})); gm.castShadow = true; scene.add(gm);
  scene.add(new THREE.Mesh(merge(panels), new THREE.MeshStandardMaterial({color:'#103b7a', emissive:'#1e5fc0', emissiveIntensity:.6, roughness:.4})));
  /* a 150 m covered section on the main straight: pillars every 9 m and a roof with light strips; the strobing is pure speed */
  const tun = [], strips = [];
  for (let i = 260; i <= 310; i += 3){ const w = HW[i] + WALL + .9;
    for (const s of [-1, 1]){ const [x, z] = P(i, s * w), p = new THREE.BoxGeometry(1.1, 8, 1.1); p.translate(x, 4, z); tun.push(p); }
    const r = new THREE.BoxGeometry(2 * w + 2, .8, 9.4); r.translate(0, 8.4, 0); r.rotateY(HD[i]); const [cx, cz] = P(i, 0); r.translate(cx, 0, cz); tun.push(r);
    for (const o of [-6, 6]){ const l = new THREE.BoxGeometry(.5, .1, 6); l.translate(0, 7.95, 0); l.rotateY(HD[i]); const [lx, lz] = P(i, o); l.translate(lx, 0, lz); strips.push(l); } }
  const tm = new THREE.Mesh(merge(tun), new THREE.MeshStandardMaterial({color:'#9a9790', roughness:.9})); tm.castShadow = tm.receiveShadow = true; scene.add(tm);
  scene.add(new THREE.Mesh(merge(strips), new THREE.MeshBasicMaterial({color:new THREE.Color(5, 4.6, 4)})));
  /* blocks of buildings close behind the barrier: a street circuit, the city right there */
  const bl = [], bc = [];
  for (let i = 0; i < N; i += 9) for (const s of [-1, 1]){ if (i > 255 && i < 315) continue; if (rng() < .25) continue;
    const off = HW[i] + WALL + 7 + rng() * 16, [x, z] = P(i, s * off), w = 14 + rng() * 18, d = 12 + rng() * 14, h = 8 + Math.pow(rng(), 2) * 50;
    const b = new THREE.BoxGeometry(w, h, d); b.translate(0, h / 2, 0); b.rotateY(HD[i]); b.translate(x, 0, z); const g2 = b.toNonIndexed(); const c = new THREE.Color().setHSL(.08 + rng() * .5, .08, .45 + rng() * .25);
    const col = new Float32Array(g2.attributes.position.count * 3); for (let v = 0; v < g2.attributes.position.count; v++) c.toArray(col, v * 3); g2.setAttribute('color', new THREE.BufferAttribute(col, 3)); bl.push(g2); }
  const pos = [], col = []; for (const g of bl){ pos.push(...g.attributes.position.array); col.push(...g.attributes.color.array); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.computeVertexNormals();
  const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.9})); bm.castShadow = bm.receiveShadow = true; scene.add(bm);
}
const TW = TOON ? buildToonWorld(scene, {ribbon, P, S, WALL, rng, renderer}) : null;
const FIN = 640, LAPS = 2;          /* the chapter is the main straight and T1: a lap ends after T1 and you are back on the straight */

/* ---------------- cars ---------------- */
/* tuned for feel, not the maxed main-game car (that one does 0–466 km/h in a second, which reads as a teleport, not speed):
   0–100 km/h in ~2 s, 340 km/h flat out, ~440 km/h on nitro; the pull fades near the top so the last 50 km/h are earned.
   Nitro never refills by itself: you earn it. */
const PLAYER = Object.assign({}, LAMBO, {maxV:95, acc:16, grip:LAMBO_MAX.grip, steer:LAMBO_MAX.steer, nos:{cap:4.5, pow:.3, fill:1e9}});
const me = makeCar(PLAYER, GRID); me.e = .35; me.lap = 0;
const hero = makeHeroCar({paint:TOON ? '#aeb6c0' : '#8a0f16', quality:'mid'}); scene.add(hero.root);
hero.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
/* blue-white exhaust flames (additive cones that bloom) and cyan neon strips: the car glows like the benchmark's */
const flameGeo = (() => { const h = 1.6, g = new THREE.ConeGeometry(.11, h, 16, 6, true); g.translate(0, h / 2, 0); g.rotateX(-Math.PI / 2 - .1); return g; })();
const FLAME_VS = 'varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = clamp(length(position) / 1.6, 0.0, 1.0); vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const FLAME_FS = `varying float vL; varying vec3 vN; varying vec3 vV; uniform float uT, uP;
  void main(){ float core = 1.0 - vL; float f = pow(abs(dot(vN, vV)), 1.5);
    float flick = 0.75 + 0.25 * sin(uT * 70.0 + vL * 18.0) * sin(uT * 43.0);
    vec3 c = mix(vec3(0.15, 0.55, 3.2), vec3(2.2, 2.8, 4.4), pow(core, 4.0));
    float a = pow(core, 1.3) * f * flick * uP;
    gl_FragColor = vec4(c * a, 1.0); }`;
function dressCar(h, big){
  const box = new THREE.Box3().setFromObject(h.root), zr = box.min.z + .06;
  const neon = new THREE.MeshBasicMaterial({color:new THREE.Color(.08, 1.1, 1.6)});
  for (const s of [-1, 1]){ const n = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, 3.3), neon); n.position.set(s * (box.max.x - .02), .26, -.1); h.root.add(n); }
  const rb = new THREE.Mesh(new THREE.BoxGeometry(.9, .02, .02), neon); rb.position.set(0, .42, zr - .01); h.root.add(rb);
  /* a dark rear panel over the number plate with a cyan slot in it (the benchmark's tail: dark, neon accents) */
  const pan = new THREE.Mesh(new THREE.BoxGeometry(.46, .13, .02), new THREE.MeshStandardMaterial({color:'#0b0d10', roughness:.4, metalness:.3})); pan.position.set(0, .545, zr - .012); h.root.add(pan);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(.22, .018, .02), neon); slot.position.set(0, .545, zr - .02); h.root.add(slot);
  const rb2 = new THREE.Mesh(new THREE.BoxGeometry(.36, .02, .02), neon); rb2.position.set(0, .64, zr + .02); h.root.add(rb2);
  h.lights.tail.emissiveIntensity = 5;
  const mat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, uniforms:{uT:{value:0}, uP:{value:1}}, vertexShader:FLAME_VS, fragmentShader:FLAME_FS});
  const glowM = new THREE.MeshBasicMaterial({color:new THREE.Color(.5, 1.3, 4), transparent:true, opacity:.9});
  h.flames = [];
  for (const x of [-.42, .42]){ const g = new THREE.Group(); g.position.set(x, .545, zr - .02); const f = new THREE.Mesh(flameGeo, mat); f.renderOrder = 7; g.add(f);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), glowM); g.add(glow); h.root.add(g); h.flames.push(g); }
  h.flameMat = mat; h.big = big;
}
if (TOON) dressCar(hero, true);
/* traffic: slower cars to thread through (near misses), plain grey boxes */
const trafficG = new THREE.Group(); scene.add(trafficG);
const traffic = [];
const RIVALS = [['#f2f2f0', 'Kelvin'], ['#e0302a', 'Hafiz'], ['#2f6fd6', 'Jason'], ['#f2c230', 'Aisyah'], ['#24262c', 'Wei Ming']];
const prog = c => (c.lap || 0) * (FIN - GRID) + c.i;
/* the grid: 6 cars in two columns, you start 4th */
function gridSlot(n){ return [GRID + (6 - n) * 5, n % 2 ? -4.5 : 4.5]; }
function makeRivals(){
  RIVALS.forEach(([paint, name], k) => {
    const n = [1, 2, 3, 5, 6][k], [i, lat] = gridSlot(n);
    const c = makeCar(Object.assign({}, PLAYER, {maxV:93 + k * .8, nos:{cap:2.5, pow:.22, fill:12}}), i); place(c, i, lat);
    c.base = c.T.maxV; c.tgt = [10, 4, 1.5, -2.5, -6][k]; c.lane = lat * .8; c.ph = k * 1.7; c.over = .97 + k * .012; c.lap = 0; c.spin = 0; c.name = name; c.lat0 = lat;
    const h = makeHeroCar({paint, quality:'mid'}); h.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); dressCar(h, false); trafficG.add(h.root); c.mesh = h.root; c.hero = h;
    c.ai = car => {
      const gap = prog(car) - prog(me), v = Math.hypot(car.vx, car.vz);
      car.T.maxV = car.base * (1 + Math.max(-.35, Math.min(gap < -40 ? .6 : .3, -(gap - car.tgt) / 10)));   /* rubber band around a slot in the pack (points of 3 m): the race stays around you, near and far */
      if (rng() < .004) car.lane = (rng() - .5) * 2 * (HW[car.i] - 4);
      /* give the player room: a rival alongside or just ahead in your lane drifts over (hard racing, not a pile-up) */
      const ax = me.x - car.x, az = me.z - car.z, fx = Math.sin(car.h), fz = Math.cos(car.h), along = ax * fx + az * fz, side = ax * fz - az * fx;
      if (along > -30 && along < 10 && Math.abs(side) < 4.5) car.lane -= (side > 0 ? 1 : -1) * 10 * (1 / 120);
      car.lane = Math.max(-(HW[car.i] - 3), Math.min(HW[car.i] - 3, car.lane));
      const o = autoInput(car, {over:car.over, lat:car.lane + Math.sin(G.t * .4 + car.ph) * 1.5, nos:false});
      if (o.thr > 0) o.thr *= 1 - .7 * Math.min(1, (v / (car.T.maxV * (1 + car.mult))) ** 2);
      o.nos = car.e > .15 && Math.abs(K[clampI(car.i + 40)]) < 1 / 500 && v > 40 && gap < car.tgt - 3;
      return o; };
    traffic.push(c); });
}
function makeTraffic(){
  for (const t of traffic) trafficG.remove(t.mesh); traffic.length = 0;
  if (TOON){ makeRivals(); return; }
  [[150, -6], [215, 7], [330, -3], [430, 8], [610, -7], [690, 4], [790, -5], [860, 6]].forEach(([i, lat], k) => {
    const c = makeCar(Object.assign({}, LAMBO, {maxV:30 + (k % 3) * 6}), i); place(c, i, lat); c.lat0 = lat; c.spin = 0;
    const m = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(1.9, .9, 4.4), new THREE.MeshStandardMaterial({color:['#d8d8d2', '#2f4f7f', '#7a7f86', '#c9b46b'][k % 4], roughness:.5}));
    body.position.y = .65; const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, .7, 2.2), new THREE.MeshStandardMaterial({color:'#20252c', roughness:.2})); cab.position.set(0, 1.4, -.2);
    body.castShadow = cab.castShadow = true; m.add(body, cab); trafficG.add(m); c.mesh = m; traffic.push(c); });
}
makeTraffic();

/* ---------------- smashables ---------------- */
const KINDS = {
  cone:  {geo:() => new THREE.ConeGeometry(.3, .75, 10).translate(0, .375, 0), color:'#f26a1b', r:.35, mass:.01, nos:.015, debris:0, big:false, name:'锥桶'},
  barrel:{geo:() => new THREE.CylinderGeometry(.45, .45, 1, 12).translate(0, .5, 0), color:'#f2f0ea', r:.5, mass:.03, nos:.04, debris:4, big:false, name:'水马'},
  sign:  {geo:() => new THREE.BoxGeometry(2.4, 1.6, .12).translate(0, 1.5, 0), color:'#f2c230', r:1.1, mass:.025, nos:.04, debris:5, big:false, name:'路牌'},
  stall: {geo:() => new THREE.BoxGeometry(3.4, 2.6, 2.6).translate(0, 1.3, 0), color:'#c8102e', r:1.7, mass:.09, nos:.12, debris:16, big:true, name:'夜市摊位'},
  glass: {geo:() => new THREE.BoxGeometry(4.2, 2.6, .5).translate(0, 1.3, 0), color:'#9fd3ff', r:1.6, mass:.05, nos:.1, debris:26, big:true, name:'候车亭'}
};
const props = [];
function addProp(kind, i, lat, yaw = 0){ const [x, z] = P(i, lat); props.push({kind, k:KINDS[kind], i, lat, x0:x, z0:z, h0:HD[i] + yaw, x, y:0, z, h:HD[i] + yaw, vx:0, vy:0, vz:0, rx:0, rz:0, wx:0, wy:0, wz:0, hit:false}); }
function layout(){
  props.length = 0; let seed = 11; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  /* A: roadworks on the straight, cones squeeze the lane, signs in the middle (not in the race: the straight is clean) */
  if (!TOON){
  for (let k = 0; k < 14; k++) addProp('cone', 130 + k * 1.5, -HW[130] + 1 + k * .9);
  for (let k = 0; k < 14; k++) addProp('cone', 130 + k * 1.5, HW[130] - 1 - k * .5);
  addProp('sign', 152, -1); addProp('sign', 156, 3);
  /* B: a line of water barrels across half the road */
  for (let k = 0; k < 9; k++) addProp('barrel', 360, -HW[360] + 1.2 + k * 1.3);
  for (let k = 0; k < 6; k++) addProp('barrel', 372, 2 + k * 1.3);
  }
  /* C: crash cushions outside T1, where you run wide if you are too greedy */
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) addProp('barrel', 528 + r * 4 + k * .4, HW[530] + 1 + k * .7 + (r % 2) * .3);
  /* D: the night market spilling onto the road between T1 and T3 */
  for (let i = 572; i < 660; i += 8) for (const s of [-1, 1]) addProp('stall', i + (s > 0 ? 4 : 0), s * (HW[i] - 2.2), Math.PI / 2);
  for (let i = 576; i < 660; i += 16) addProp('stall', i, (i % 32 < 16 ? -1 : 1) * 3, Math.PI / 2);
  /* E: glass bus stops at the kerb */
  for (let i = 680; i < 740; i += 12) addProp('glass', i, (i % 24 < 12 ? -1 : 1) * (HW[i] - 1.2));
  /* F: the lake road: mixed, some right on the line */
  for (let i = 770; i < 930; i += 10){ const r = rng(); addProp(r < .35 ? 'stall' : r < .7 ? 'sign' : 'glass', i, (rng() - .5) * 2 * (HW[i] - 3), rng() < .5 ? Math.PI / 2 : 0); }
  for (let i = 760; i < 940; i += 3) addProp('cone', i, (i % 6 ? -1 : 1) * (HW[i] - .6));
  if (TOON) for (let k = props.length - 1; k >= 0; k--) if (props[k].i > FIN - 25 || props[k].kind === 'stall' || props[k].kind === 'glass') props.splice(k, 1);
}
layout();
const propMesh = {};
for (const [name, k] of Object.entries(KINDS)){
  const list = props.filter(p => p.kind === name);
  const mat = name === 'glass' ? new THREE.MeshStandardMaterial({color:k.color, roughness:.05, metalness:.1, transparent:true, opacity:.55}) : new THREE.MeshStandardMaterial({color:k.color, roughness:.6});
  const im = new THREE.InstancedMesh(k.geo(), mat, Math.max(1, list.length)); im.castShadow = true; im.frustumCulled = false; scene.add(im);
  list.forEach((p, j) => { p.im = im; p.j = j; }); propMesh[name] = im;
}
/* debris: one pool of small boxes, coloured per piece */
const DEB = 900, debM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({roughness:.6}), DEB); debM.castShadow = true; debM.frustumCulled = false; scene.add(debM);
const deb = []; let debNext = 0; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
for (let k = 0; k < DEB; k++){ deb.push({x:0, y:-50, z:0, vx:0, vy:0, vz:0, rx:0, ry:0, wx:0, wy:0, s:[.1, .1, .1], live:0}); debM.setColorAt(k, _c.set('#888')); }
function placeProp(p){ _q.setFromEuler(_e.set(p.rx, p.h, p.rz, 'YXZ')); _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1)); p.im.setMatrixAt(p.j, _m); p.im.instanceMatrix.needsUpdate = true; }
function resetProps(){ layout(); for (const name in KINDS){ const list = props.filter(p => p.kind === name); list.forEach((p, j) => { p.im = propMesh[name]; p.j = j; placeProp(p); }); } for (const d of deb){ d.live = 0; d.y = -50; } }
resetProps();

/* ---------------- particles ---------------- */
const smoke = makeParticles(scene, 3000), sparks = makeSparks(scene, 2400);
const HOT = new THREE.Color(5, 2.6, .8), NOSC = new THREE.Color(.8, 2.2, 6), SPARK = new THREE.Color(6, 2.6, .5);

/* ---------------- game state, feel ---------------- */
const G = {count:TOON ? 3.2 : 0, lapT:0, lapTimes:[], done:0, flash:0, boostV:0, steerIn:0, t:0, ts:1, stop:0, slow:0, shake:0, shakeT:0, events:[], combo:0, comboT:0, drift:0, skim:0, scrape:0, nosOn:0, gear:1, rpm:1000, shiftT:0, fov:64, last:null, ended:false};
const cam = {pos:v3(0, 3, -8), vel:v3(), look:v3(), init:false};
function award(text, amt){ me.e = Math.min(1, me.e + amt); G.combo++; G.comboT = 2.5; G.events.unshift({text, amt, t:0}); if (G.events.length > 5) G.events.pop(); }
function kick(a){ G.shake = Math.max(G.shake, a); }
function bigHit(stopSec, slowSec){ G.stop = Math.max(G.stop, stopSec); G.slow = Math.max(G.slow, slowSec); }

/* ---------------- input ---------------- */
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; audio.start(); if (e.code === 'KeyR') reset(); if (e.code === 'KeyM') audio.toggle(); if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('pointerdown', () => audio.start());
function playerInput(){
  const up = keys.ArrowUp || keys.KeyW, dn = keys.ArrowDown || keys.KeyS, l = keys.ArrowLeft || keys.KeyA, r = keys.ArrowRight || keys.KeyD;
  return {thr:up ? 1 : dn ? -1 : 0, steer:(l ? 1 : 0) - (r ? 1 : 0), brake:!!keys.Space, nos:!!(keys.ShiftLeft || keys.ShiftRight)};
}
/* the recording bot: centre line through the obstacles, skims the walls in the tunnel, nitro whenever there is some */
function botInput(){
  if (TOON){ const i = me.i, v = Math.hypot(me.vx, me.vz); let lat = Math.sin(i * .011 + .6) * 6;
    /* the recording bot races clean: a rival in the way ahead, pass it on the side with more room */
    const fx = Math.sin(me.h), fz = Math.cos(me.h);
    for (const c of traffic){ const ax = c.x - me.x, az = c.z - me.z, along = ax * fx + az * fz; if (along < 0 || along > 35) continue;
      const W = locate({x:c.x, z:c.z, i:c.i}), d = W.lat - lat; if (Math.abs(d) < 4.2) lat = W.lat + (W.lat > 0 ? -4.6 : 4.6); }
    const o = autoInput(me, {over:1.02, lat, nos:false});
    o.nos = me.e > .06 && i > 70 && Math.abs(K[clampI(i + 40)]) < 1 / 500 && v > 30; return o; }
  const i = me.i; let lat = 0;
  if (i > 240 && i < 320) lat = -(HW[i] + WALL - 2.0);      /* tunnel: along the left wall */
  else if (i > 330 && i < 380) lat = -4;                       /* through the barrels */
  else if (i > 560 && i < 670) lat = Math.sin(i * .09) * 5;    /* weave through the market */
  else if (i > 670 && i < 745) lat = (i % 24 < 12 ? -1 : 1) * (HW[i] - 2.5);
  const o = autoInput(me, {over:i > 500 && i < 560 ? 1.15 : 1.05, lat, nos:false});
  o.nos = me.e > .08 && Math.abs(K[clampI(i + 30)]) < 1 / 500 && Math.abs(K[i]) < 1 / 500;
  return o;
}

/* ---------------- audio: a V10-ish engine with gears, wind, tyres, scrape, impacts (all synthesized) ---------------- */
const audio = (() => {
  let ctx = null, on = true, eng, eng2, lp, egain, wind, wgain, tyre, tgain, scr, sgain, nos, ngain, master;
  const GEARS = [0, 19, 33, 47, 61, 76, 92, 140];
  function noise(){ const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s; }
  function bp(src, f, q){ const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; src.connect(b); return b; }
  function start(){ if (ctx || REC) return; ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination);
    eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng2 = ctx.createOscillator(); eng2.type = 'square';
    const shaper = ctx.createWaveShaper(), cv = new Float32Array(256); for (let k = 0; k < 256; k++){ const x = k / 128 - 1; cv[k] = Math.tanh(x * 2.2); } shaper.curve = cv;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; egain = ctx.createGain(); egain.gain.value = 0; const g2 = ctx.createGain(); g2.gain.value = .35;
    eng.connect(shaper); eng2.connect(g2); g2.connect(shaper); shaper.connect(lp); lp.connect(egain); egain.connect(master); eng.start(); eng2.start();
    wind = bp(noise(), 700, .5); wgain = ctx.createGain(); wgain.gain.value = 0; wind.connect(wgain); wgain.connect(master);
    tyre = bp(noise(), 1300, 6); tgain = ctx.createGain(); tgain.gain.value = 0; tyre.connect(tgain); tgain.connect(master);
    scr = bp(noise(), 2600, 2); sgain = ctx.createGain(); sgain.gain.value = 0; scr.connect(sgain); sgain.connect(master);
    nos = bp(noise(), 4200, .7); ngain = ctx.createGain(); ngain.gain.value = 0; nos.connect(ngain); ngain.connect(master); }
  function gearOf(v){ let g = 1; while (g < 7 && v > GEARS[g]) g++; return g; }
  function update(v, thr, slip, scrape, nosOn, ts){
    const g = gearOf(v); if (g !== G.gear){ G.shiftT = .12; if (g > G.gear) kick(.15); G.gear = g; }
    const lo = GEARS[g - 1], hi = GEARS[g], k = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    G.rpm = 3200 + k * 5600 - (G.shiftT > 0 ? 1600 : 0) + (thr > 0 ? 400 : 0);
    if (!ctx || !on) return; const T = ctx.currentTime, f = G.rpm / 60 * 2.5 * (.6 + .4 * ts);
    eng.frequency.setTargetAtTime(f, T, .03); eng2.frequency.setTargetAtTime(f * 1.5, T, .03); lp.frequency.setTargetAtTime(600 + G.rpm * .35 + (nosOn ? 1500 : 0), T, .05);
    egain.gain.setTargetAtTime((thr > 0 ? .22 : .1) * (G.shiftT > 0 ? .4 : 1), T, .03);
    wgain.gain.setTargetAtTime(Math.min(.5, (v / 90) ** 2 * .45), T, .1); tgain.gain.setTargetAtTime(Math.min(.25, Math.max(0, slip - 3) * .03), T, .05);
    sgain.gain.setTargetAtTime(scrape ? .35 : 0, T, .03); ngain.gain.setTargetAtTime(nosOn ? .25 : 0, T, .08);
  }
  function hit(strength, glass){ if (!ctx || !on) return; const T = ctx.currentTime, s = ctx.createBufferSource(), n = ctx.sampleRate * .5 | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (ctx.sampleRate * (glass ? .09 : .05)));
    s.buffer = b; const f = ctx.createBiquadFilter(); f.type = glass ? 'highpass' : 'lowpass'; f.frequency.value = glass ? 3000 : 500 + strength * 900; const g = ctx.createGain(); g.gain.value = Math.min(1.2, .3 + strength);
    s.connect(f); f.connect(g); g.connect(master); s.start(T); }
  return {start, update, hit, toggle(){ on = !on; if (master) master.gain.value = on ? .5 : 0; }};
})();

/* ---------------- simulation ---------------- */
function reset(){ if (TOON){ const [i, lat] = gridSlot(4); place(me, i, lat); me.lap = 0; G.count = 3.2; G.lapT = 0; G.lapTimes.length = 0; G.done = 0; } else place(me, GRID); me.e = .35; G.events.length = 0; G.combo = 0; makeTraffic(); resetProps(); cam.init = false; G.ended = false; }

function smash(p, spd, fx, fz, car = me){
  const k = p.k; p.hit = true; const mine = car === me, cvx = car.vx, cvz = car.vz;
  const along = Math.max(10, spd);
  p.vx = cvx * (1.05 + rng() * .35) + (rng() - .5) * 6; p.vz = cvz * (1.05 + rng() * .35) + (rng() - .5) * 6; p.vy = 4 + along * (.12 + rng() * .1);
  p.wx = (rng() - .5) * along * .4; p.wy = (rng() - .5) * 8; p.wz = (rng() - .5) * along * .4;
  /* the car pays for it */
  const f = 1 - k.mass * (k.big ? 1 : .6); car.vx *= f; car.vz *= f;
  /* debris */
  const col = new THREE.Color(k.color);
  for (let n = 0; n < k.debris; n++){ const d = deb[debNext]; debNext = (debNext + 1) % DEB;
    Object.assign(d, {x:p.x + (rng() - .5) * 2, y:.5 + rng() * 2, z:p.z + (rng() - .5) * 2, vx:cvx * (.6 + rng() * .8) + (rng() - .5) * 14, vy:3 + rng() * 10, vz:cvz * (.6 + rng() * .8) + (rng() - .5) * 14,
      rx:rng() * 6, ry:rng() * 6, wx:(rng() - .5) * 20, wy:(rng() - .5) * 20, live:6 + rng() * 4});
    d.s = p.kind === 'glass' ? [.15 + rng() * .5, .02, .15 + rng() * .4] : [.15 + rng() * .5, .1 + rng() * .3, .1 + rng() * .5];
    debM.setColorAt(debNext, n % 3 === 0 && p.kind === 'stall' ? _c.set('#f4f0e6') : col); }
  if (debM.instanceColor) debM.instanceColor.needsUpdate = true;
  for (let n = 0; n < (k.big ? 40 : 12); n++) sparks.emit(p.x, 1, p.z, cvx * .5 + (rng() - .5) * 20, rng() * 8, cvz * .5 + (rng() - .5) * 20, p.kind === 'glass' ? new THREE.Color(2.5, 3.5, 5) : HOT, .35, .4 + rng() * .3);
  smoke.spawn(p.x, 1, p.z, cvx * .2, 1, cvz * .2, 2.5, 3, 1.6, .25, new THREE.Color('#bdb6a8'));
  if (!mine) return;
  award(k.name + (G.combo > 0 ? ' ×' + (G.combo + 1) : ''), k.nos);
  kick(k.big ? .9 : .25 + spd / 300);
  if (k.big && spd > 25) bigHit(.07, .45); else if (spd > 40) bigHit(.03, 0);
  audio.hit(k.big ? 1 : .35, p.kind === 'glass');
}

function warp(c, ni){
  const W = locate(c), dh = HD[ni] - HD[c.i], cs = Math.cos(dh), sn = Math.sin(dh), vx = c.vx, vz = c.vz;
  c.vx = vx * cs + vz * sn; c.vz = vz * cs - vx * sn; c.h += dh; const [x, z] = P(ni, W.lat); c.x = x; c.z = z; c.i = c.good = c.prevI = ni;
}
function lapCheck(c){
  if (c.i < FIN) return; c.lap = (c.lap || 0) + 1; warp(c, c.i - (FIN - GRID) + 4);
  if (c === me){ G.lapTimes.push(G.lapT); G.flash = .35; cam.init = false; if (me.lap >= LAPS){ G.done = 4; } }
}
const HALT = {thr:0, steer:0, brake:true, nos:false};
function physicsStep(dt){
  const go = !TOON || G.count <= 0;
  const inp = !go || G.done ? Object.assign({}, HALT, {thr:G.done ? -1 : 0}) : BOT ? botInput() : playerInput();
  G.steerIn = inp.steer;
  const wasNos = me.mult > .05, v0 = Math.hypot(me.vx, me.vz), cap = PLAYER.maxV * (1 + me.mult);
  if (inp.thr > 0) inp.thr *= 1 - .7 * Math.min(1, (v0 / cap) ** 2);
  step(me, dt, inp, 0);
  const v = Math.hypot(me.vx, me.vz), fx = Math.sin(me.h), fz = Math.cos(me.h);
  /* walls: push back, bounce, scrape */
  const W = locate(me), lim = HW[W.i] + WALL - 1.05; G.scrape = 0;
  if (Math.abs(W.lat) > lim){ const s = Math.sign(W.lat), nx = RT[W.i][0] * s, nz = RT[W.i][1] * s, over = Math.abs(W.lat) - lim;
    me.x -= nx * over; me.z -= nz * over;
    const vn = me.vx * nx + me.vz * nz;
    if (vn > 0){ const tx = me.vx - nx * vn, tz = me.vz - nz * vn, loss = Math.max(.6, 1 - .015 - vn * .012);
      me.vx = tx * loss - nx * vn * .3; me.vz = tz * loss - nz * vn * .3;
      const th = Math.atan2(tx, tz); let d = th - me.h; d = Math.atan2(Math.sin(d), Math.cos(d)); me.h += d * Math.min(1, vn * .04);   /* the wall straightens you */
      if (vn > 9){ kick(Math.min(1.2, vn / 20)); audio.hit(Math.min(1, vn / 25), false); if (vn > 16) bigHit(.06, .3); }
      for (let n = 0; n < 2 + vn; n++) sparks.emit(me.x + nx * 1, .4, me.z + nz * 1, me.vx * .6 + (rng() - .5) * 8, 2 + rng() * 5, me.vz * .6 + (rng() - .5) * 8, HOT, .3, .3 + rng() * .3); }
    G.scrape = 1; if (v > 20){ for (let n = 0; n < 3; n++) sparks.emit(me.x + nx, .3, me.z + nz, me.vx * .7 + (rng() - .5) * 4, 1 + rng() * 3, me.vz * .7 + (rng() - .5) * 4, HOT, .25, .25); kick(.12); }
  }
  /* risk → nitro: skim the wall (inside 1.4 m, not touching), drift, near misses */
  const gap = lim - Math.abs(W.lat);
  if (v > 40 && gap > 0 && gap < 1.4 && !G.scrape){ G.skim += dt; } else if (G.skim > 0){ if (G.skim > .4) award('贴墙飞 ' + G.skim.toFixed(1) + 's', Math.min(.2, G.skim * .06)); G.skim = 0; }
  if (me.slip > 6 && v > 22){ G.drift += dt; if (Math.random() < .7) smoke.spawn(me.x - fx * 2, .3, me.z - fz * 2, (rng() - .5), .6, (rng() - .5), 1.2, 4, 1.4, .18, new THREE.Color('#d6d2ca')); }
  else if (G.drift > 0){ if (G.drift > .5) award('漂移 ' + G.drift.toFixed(1) + 's', Math.min(.25, G.drift * .07)); G.drift = 0; }
  /* traffic */
  for (const c of traffic){
    if (c.spin > 0){ c.spin -= dt; c.h += c.yaw * dt; c.x += c.vx * dt; c.z += c.vz * dt; const f = Math.exp(-1.2 * dt); c.vx *= f; c.vz *= f; c.yaw *= Math.exp(-.8 * dt); locate(c); continue; }
    step(c, dt, !go ? HALT : c.ai ? c.ai(c) : autoInput(c, {over:.8, lat:c.lat0}), 0);
    if (TOON) lapCheck(c);
    const dx = c.x - me.x, dz = c.z - me.z, d = Math.hypot(dx, dz);
    if (d < 2.3){ const nx = dx / d, nz = dz / d, rel = (me.vx - c.vx) * nx + (me.vz - c.vz) * nz;
      if (rel > 0){ c.vx += nx * rel * 1.3 + me.vx * .25; c.vz += nz * rel * 1.3 + me.vz * .25; me.vx -= nx * rel * .35; me.vz -= nz * rel * .35;
        if (rel > 8){ c.spin = 3; c.yaw = (rng() < .5 ? -1 : 1) * (3 + rel * .15); award('撞飞', .12); kick(1); bigHit(.08, .5); audio.hit(1, false); for (let n = 0; n < 30; n++) sparks.emit(me.x + nx * 1.2, .8, me.z + nz * 1.2, (rng() - .5) * 16, rng() * 7, (rng() - .5) * 16, HOT, .35, .4); }
        else { kick(.4); audio.hit(.4, false); } }
      me.x -= nx * (2.3 - d) * .5; me.z -= nz * (2.3 - d) * .5; }
    /* near miss: alongside within ~1 m of daylight, going much faster */
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx), relV = v - Math.hypot(c.vx, c.vz);
    if (!c.missed && Math.abs(along) < 2.5 && side > 2.0 && side < 3.4 && relV > 12){ c.missed = true; award('擦车而过', .1); kick(.2); }
    if (Math.abs(along) > 30) c.missed = false;
  }
  if (TOON) lapCheck(me);
  /* smashables: the car is a capsule from the rear axle to the nose, 1 m radius */
  for (const p of props){
    if (p.hit){ if (p.y > 0 || Math.abs(p.vx) + Math.abs(p.vz) > .1){ p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.wx * dt; p.h += p.wy * dt; p.rz += p.wz * dt;
        if (p.y < 0){ p.y = 0; p.vy = -p.vy * .3; p.vx *= .6; p.vz *= .6; p.wx *= .5; p.wz *= .5; if (Math.abs(p.vy) < 1) p.vy = 0; } placeProp(p); } continue; }
    for (const car of TOON ? [me, ...traffic] : [me]){
      const dx = p.x - car.x, dz = p.z - car.z; if (dx * dx + dz * dz > 64) continue;
      const cfx = Math.sin(car.h), cfz = Math.cos(car.h), t = Math.max(-1.8, Math.min(2.2, dx * cfx + dz * cfz)), cx = car.x + cfx * t, cz = car.z + cfz * t, d = Math.hypot(p.x - cx, p.z - cz);
      if (d < 1.0 + p.k.r){ smash(p, Math.hypot(car.vx, car.vz), cfx, cfz, car); break; } }
  }
  for (let k = 0; k < DEB; k++){ const d = deb[k]; if (d.live <= 0) continue; d.live -= dt; d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.wx * dt; d.ry += d.wy * dt;
    if (d.y < d.s[1] / 2){ d.y = d.s[1] / 2; d.vy = -d.vy * .25; d.vx *= .7; d.vz *= .7; d.wx *= .6; d.wy *= .6; } if (d.live <= 0) d.y = -50;
    _q.setFromEuler(_e.set(d.rx, d.ry, 0)); _m.compose(_v.set(d.x, d.y, d.z), _q, _s.set(...d.s)); debM.setMatrixAt(k, _m); }
  debM.instanceMatrix.needsUpdate = true;
  /* nitro flame and the screen: it has to feel like a different gear */
  G.nosOn = me.mult > .05 ? 1 : 0;
  /* the floor scraping at speed: bursts of orange sparks fanning out from under the rear, one side at a time (always on the nitro) */
  if (TOON){ G.spk = Math.max(0, (G.spk || 0) - dt); if (v > 45 && G.spk <= 0 && rng() < dt * .55){ G.spk = .6 + rng() * 1.1; G.spkSide = rng() < .5 ? -1 : 1; } }
  if (TOON && v > 30 && (G.spk > 0 || G.nosOn)){ const n = (G.nosOn ? 3 : 2.2) * dt * 120, rx = Math.cos(me.h), rz = -Math.sin(me.h);
    for (let k = 0; k < n; k++){ const sd = G.spk > 0 ? G.spkSide : rng() < .5 ? -1 : 1, px = me.x - fx * 1.25 + rx * sd * .7, pz = me.z - fz * 1.25 + rz * sd * .7, fan = 2 + rng() * 7, back = 1 + rng() * 6;
      sparks.emit(px, .08, pz, me.vx * .8 - fx * back + rx * sd * fan, .6 + rng() * 2.6, me.vz * .8 - fz * back + rz * sd * fan, SPARK, .045 + rng() * .05, .12 + rng() * .22); } }
  if (G.nosOn && !TOON){ for (let n = 0; n < 3; n++) sparks.emit(me.x - fx * 2.5 + (rng() - .5) * .5, .45, me.z - fz * 2.5 + (rng() - .5) * .5, me.vx * .7 - fx * 14, rng(), me.vz * .7 - fz * 14, NOSC, .4, .12); kick(.08); }
  if (G.nosOn && !wasNos){ kick(.6); }
  audio.update(v, inp.thr, me.slip, G.scrape && v > 10, G.nosOn, G.ts);
  if (!TOON && me.i >= N - 12 && !G.ended){ G.ended = true; setTimeout(reset, REC ? 0 : 1200); }
}

/* ---------------- camera: spring chase, FOV with speed, nitro punch, shake ---------------- */
function updateCamera(dt, rdt){
  const v = Math.hypot(me.vx, me.vz), fx0 = Math.sin(me.h), fz0 = Math.cos(me.h);
  /* the camera rides in the car's frame: its yaw trails the car's a little (you see the car turn), and its distance is a spring
     driven by acceleration: floor it and the car pulls away from you, stand on the brakes and you close in */
  const vf = me.vx * fx0 + me.vz * fz0, acc = dt > 0 ? (vf - (cam.vf ?? vf)) / dt : 0; if (dt > 0) cam.vf = vf;
  if (!cam.init){ cam.yaw = me.h; cam.back = 5.6; cam.bv = 0; cam.init = true; }
  let dy = me.h - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cam.yaw += dy * Math.min(1, dt * 7);
  const backT = (TOON ? 4.3 : 5.4) + (TOON ? Math.min(.9, v * .009) : Math.min(1.6, v * .016)) + Math.max(TOON ? -.45 : -1.2, Math.min(TOON ? 1.4 : 2.2, acc * .05));
  cam.bv += ((backT - cam.back) * 40 - cam.bv * 9) * dt; cam.back += cam.bv * dt;
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), up = (TOON ? 1.72 : 1.55) - Math.min(.3, v * .003);
  cam.pos.set(me.x - fx * cam.back, up, me.z - fz * cam.back);
  const look = TOON ? v3(me.x + fx0 * 14, 1.18, me.z + fz0 * 14) : v3(me.x + fx0 * 6, .9, me.z + fz0 * 6);
  /* field of view: 64° parked, ~92° flat out, +12° on the nitro kick */
  const sp = Math.max(0, Math.min(1, (v - 15) / 85)), target = (TOON ? 60 : 64) + (TOON ? 16 : 28) * Math.pow(sp, 1.3) + (G.nosOn ? (TOON ? 9 : 12) : 0);
  G.fov += (target - G.fov) * Math.min(1, rdt * (G.nosOn ? 9 : 3));
  camera.fov = G.fov; camera.updateProjectionMatrix();
  /* shake: a constant buzz at speed + impulses that decay */
  G.shake *= Math.exp(-6 * rdt); G.shakeT += rdt;
  const buzz = .012 * sp * sp + (G.nosOn ? .02 : 0), a = buzz + G.shake * .18, t = G.shakeT;
  const sx = (Math.sin(t * 37) + Math.sin(t * 59 + 1)) * .5 * a, sy = (Math.sin(t * 43 + 2) + Math.sin(t * 71)) * .5 * a;
  camera.position.copy(cam.pos); camera.position.y += sy; camera.position.x += sx * fz; camera.position.z -= sx * fx;
  camera.lookAt(look); camera.rotateZ(-me.steer * .06 * sp + Math.sin(t * 29) * G.shake * .02);
  G.boostV += ((G.nosOn ? 1 : 0) - G.boostV) * Math.min(1, rdt * 6);
  if (TOON) post.set({speed:Math.min(1.5, sp * 1.15 + G.boostV * .35 + G.shake * .15), boost:G.boostV, exposure:1.0 + G.flash * 1.5});
  else post.set({speed:Math.min(1.6, sp * 1.1 + (G.nosOn ? .45 : 0) + G.shake * .2), exposure:1.05 + (G.nosOn ? .08 : 0) + (G.slow > 0 ? -.08 : 0)});
  if (TW) TW.follow(me.x, me.z, fx0, fz0); else { sun.position.set(me.x + SUN.x * 150, SUN.y * 150, me.z + SUN.z * 150); sun.target.position.set(me.x, 0, me.z); }
}

function flames(h, c, k){
  const v = Math.hypot(c.vx, c.vz), p = (.25 + Math.min(1, v / 60) * .35 + (c.mult > .05 ? .9 : 0)) * k;
  h.flameMat.uniforms.uT.value = G.t; h.flameMat.uniforms.uP.value = Math.min(1.6, p * 1.4);
  for (const f of h.flames) f.scale.set(.8 + p * .45, .8 + p * .45, .35 + p * .75 + Math.sin(G.t * 50 + f.position.x * 9) * .08);
}
function placeCars(dt){
  hero.root.position.set(me.x, 0, me.z); hero.root.rotation.set(0, me.h, 0);
  hero.root.rotation.z = -me.steer * .05 * Math.min(1, Math.hypot(me.vx, me.vz) / 50); hero.root.rotation.x = me.brakeHard * .02;
  const spin = Math.hypot(me.vx, me.vz) / .36 * dt; for (const w of hero.wheels) w.rotation.x += spin;
  for (const f of hero.fronts) f.rotation.y = me.steer * .9;
  for (const c of traffic){ c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.h;
    if (c.hero){ const sp = Math.hypot(c.vx, c.vz) / .36 * dt; for (const w of c.hero.wheels) w.rotation.x += sp; for (const f of c.hero.fronts) f.rotation.y = c.steer * .9; flames(c.hero, c, .45); } }
  if (TOON) flames(hero, me, 1);
}

/* ---------------- HUD (a 2D canvas so the recorder can copy it) ---------------- */
const hud = document.getElementById('hud'), hg = hud.getContext('2d');
function drawHud(rdt){
  if (TOON) return drawRaceHud(rdt);
  const W = hud.width, H = hud.height, s = H / 720, v = Math.hypot(me.vx, me.vz); hg.clearRect(0, 0, W, H);
  if (G.slow > 0){ const gr = hg.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .9); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)'); hg.fillStyle = gr; hg.fillRect(0, 0, W, H); }
  hg.textAlign = 'right'; hg.fillStyle = '#f4ede0'; hg.shadowColor = 'rgba(0,0,0,.6)'; hg.shadowBlur = 8 * s;
  hg.font = `800 ${64 * s}px "Noto Sans SC",sans-serif`; hg.fillText(Math.round(v * 3.6), W - 40 * s, H - 62 * s);
  hg.font = `600 ${15 * s}px "Noto Sans SC",sans-serif`; hg.fillText('km/h · ' + G.gear + ' 挡', W - 40 * s, H - 38 * s);
  /* nitro bar */
  const bw = 260 * s, bx = W - 40 * s - bw, by = H - 30 * s; hg.shadowBlur = 0; hg.fillStyle = 'rgba(0,0,0,.45)'; hg.fillRect(bx, by, bw, 8 * s);
  hg.fillStyle = G.nosOn ? '#7fd0ff' : me.e > .99 ? '#ffd27a' : '#4aa3ff'; hg.fillRect(bx, by, bw * me.e, 8 * s);
  hg.textAlign = 'left'; hg.fillStyle = 'rgba(244,237,224,.75)'; hg.font = `600 ${12 * s}px "Noto Sans SC",sans-serif`; hg.fillText('氮气 · 靠冒险攒', bx, by - 6 * s);
  /* events */
  hg.textAlign = 'center'; G.events.forEach((e, k) => { e.t += rdt; const a = Math.max(0, 1 - e.t / 2.2); if (a <= 0) return; const y = H * .3 + k * 34 * s - Math.min(1, e.t * 6) * 10 * s;
    hg.globalAlpha = a; hg.shadowColor = 'rgba(0,0,0,.7)'; hg.shadowBlur = 10 * s; hg.fillStyle = k === 0 ? '#ffd27a' : '#f4ede0'; hg.font = `${k === 0 ? 800 : 600} ${(k === 0 ? 28 : 18) * s}px "Noto Sans SC",sans-serif`;
    hg.fillText(e.text + '  +' + Math.round(e.amt * 100) + '% 氮气', W / 2, y); }); hg.globalAlpha = 1; hg.shadowBlur = 0;
  if (!BOT && !REC && G.t < 8){ hg.textAlign = 'left'; hg.fillStyle = 'rgba(244,237,224,.8)'; hg.font = `500 ${13 * s}px "Noto Sans SC",sans-serif`;
    hg.fillText('↑↓←→ / WASD 开车 · Shift 氮气 · 空格 手刹 · R 重来 · M 静音（按任意键出声）', 24 * s, 34 * s); }
}

/* the race HUD, benchmark layout: position and minimap top-left, lap time / lap / speed top-right, nitro button bottom-right, stick bottom-left */
const MINI = (() => { const pts = PTS.slice(0, FIN + 1); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of pts){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const sc = Math.min(150 / (x1 - x0), 100 / (z1 - z0)); return {pts, f:(x, z) => [(x - x0) * sc, (z - z0) * sc], w:(x1 - x0) * sc, h:(z1 - z0) * sc}; })();
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
function drawRaceHud(rdt){
  const W = hud.width, H = hud.height, s = H / 720, v = Math.hypot(me.vx, me.vz), g = hg; g.clearRect(0, 0, W, H);
  const ital = (w, px, f = '"Noto Sans SC",sans-serif') => `italic ${w} ${px * s}px ${f}`;
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 6 * s;
  /* position */
  const order = [me, ...traffic].sort((a, b) => prog(b) - prog(a)), pos = order.indexOf(me) + 1;
  const grd = g.createLinearGradient(0, 22 * s, 0, 70 * s); grd.addColorStop(0, '#ffb04a'); grd.addColorStop(1, '#ff5a2a');
  g.textAlign = 'left'; g.fillStyle = grd; g.font = ital(900, 54); g.fillText(pos, 26 * s, 72 * s);
  const nw = g.measureText(String(pos)).width; g.fillStyle = '#fff'; g.font = ital(800, 20); g.fillText('/6', 26 * s + nw + 3 * s, 72 * s);
  /* minimap */
  g.save(); g.translate(28 * s, 92 * s); g.scale(s * .62, s * .62); g.lineJoin = 'round';
  g.beginPath(); MINI.pts.forEach(([x, z], k) => { const [a, b] = MINI.f(x, z); k ? g.lineTo(a, b) : g.moveTo(a, b); });
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 9; g.stroke(); g.strokeStyle = 'rgba(140,230,255,.9)'; g.lineWidth = 4; g.stroke();
  for (const c of traffic){ const [a, b] = MINI.f(c.x, c.z); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(a, b, 5, 0, 7); g.fill(); }
  { const [a, b] = MINI.f(me.x, me.z); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(a, b, 7.5, 0, 7); g.fill(); }
  g.restore();
  /* top right: time, lap, speed */
  g.textAlign = 'right'; const rx = W - 70 * s;
  g.fillStyle = '#ffffff'; g.font = ital(900, 30); g.fillText(fmt(G.lapT), rx, 46 * s);
  g.font = ital(700, 11); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('LAP', rx - 46 * s, 66 * s); g.font = ital(900, 19); g.fillStyle = '#fff'; g.fillText(Math.min(LAPS, (me.lap || 0) + 1) + '/' + LAPS, rx, 67 * s);
  g.fillStyle = '#ffd23a'; g.font = ital(900, 24); g.fillText(Math.round(v * 3.6), rx - 34 * s, 96 * s); g.font = ital(700, 11); g.fillStyle = '#ffe58a'; g.fillText('KM/H', rx, 96 * s);
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(W - 34 * s, 40 * s, 13 * s, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(W - 39 * s, 34 * s, 3.5 * s, 12 * s); g.fillRect(W - 32 * s, 34 * s, 3.5 * s, 12 * s);
  /* bottom right: the glowing yellow nitro button, its ring fills with your nitro; a second button for the handbrake */
  const bx = W - 92 * s, by = H - 112 * s, br = 40 * s, ready = me.e > .05, pulse = .6 + .4 * Math.sin(G.t * 6);
  g.save(); g.shadowColor = '#ffe23a'; g.shadowBlur = (ready ? 26 + 14 * pulse + G.boostV * 30 : 6) * s;
  g.fillStyle = ready ? 'rgba(255,226,58,.20)' : 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,240,150,.35)'; g.lineWidth = 6 * s; g.beginPath(); g.arc(bx, by, br - 2 * s, 0, 7); g.stroke();
  g.strokeStyle = '#ffe23a'; g.lineWidth = 6 * s; g.beginPath(); g.arc(bx, by, br - 2 * s, -Math.PI / 2, -Math.PI / 2 + me.e * 6.283); g.stroke();
  g.fillStyle = '#ffe23a'; g.beginPath(); const L = [[4, -20], [-9, 3], [-1, 3], [-5, 20], [10, -4], [2, -4], [7, -20]]; L.forEach(([x, y], k) => { k ? g.lineTo(bx + x * s, by + y * s) : g.moveTo(bx + x * s, by + y * s); }); g.closePath(); g.fill(); g.restore();
  const hx = W - 190 * s, hy = H - 140 * s; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(hx, hy, 24 * s, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `700 ${14 * s}px sans-serif`; g.textAlign = 'center'; g.fillText('((·))', hx, hy + 5 * s);
  /* bottom left: the stick, its knob follows your steering */
  const jx = 96 * s, jy = H - 120 * s; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * s; g.beginPath(); g.arc(jx, jy, 44 * s, 0, 7); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(jx, jy, 44 * s, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(jx - G.steerIn * 22 * s, jy, 15 * s, 0, 7); g.fill();
  /* rewards (nitro for risk) */
  g.textAlign = 'center'; G.events.forEach((e, k) => { e.t += rdt; const a = Math.max(0, 1 - e.t / 2); if (a <= 0) return; g.globalAlpha = a; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8 * s;
    g.fillStyle = k === 0 ? '#ffe23a' : '#ffffff'; g.font = ital(k === 0 ? 900 : 700, k === 0 ? 24 : 16); g.fillText(e.text + '  +' + Math.round(e.amt * 100) + '%', W / 2, H * .2 + k * 28 * s); }); g.globalAlpha = 1;
  /* countdown, lap flash, finish */
  if (G.count > 0 || G.count > -.8){ const n = Math.ceil(G.count), txt = G.count > 0 ? String(n) : 'GO!', f = G.count > 0 ? G.count - Math.floor(G.count) : 1 + G.count / .8;
    g.globalAlpha = Math.min(1, f * 2); g.font = ital(900, 120 * (1 + (1 - f) * .25)); g.fillStyle = G.count > 0 ? '#ffffff' : '#ffe23a'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20 * s; g.fillText(txt, W / 2, H * .45); g.globalAlpha = 1; }
  if (G.flash > 0){ g.fillStyle = `rgba(255,255,255,${G.flash})`; g.fillRect(0, 0, W, H); g.font = ital(900, 46); g.fillStyle = '#ffe23a'; g.fillText(me.lap >= LAPS ? 'FINISH · 第 ' + pos + ' 名' : 'LAP ' + Math.min(LAPS, me.lap + 1) + '/' + LAPS, W / 2, H * .4); }
  if (G.done > 0){ g.font = ital(900, 52); g.fillStyle = '#ffe23a'; g.shadowBlur = 16 * s; g.fillText('FINISH · 第 ' + pos + ' 名', W / 2, H * .42); }
  g.shadowBlur = 0;
}

/* ---------------- loop ---------------- */
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); hud.width = w * devicePixelRatio; hud.height = h * devicePixelRatio; }
addEventListener('resize', resize); resize();
let last = performance.now(), fpsN = 0, fpsT = 0;
function frame(rdt){
  /* hit-stop freezes the world, slow motion scales it */
  let dt = rdt; if (G.stop > 0){ G.stop -= rdt; dt = 0; } else if (G.slow > 0){ G.slow -= rdt; dt = rdt * .28; }
  G.ts = dt / Math.max(1e-6, rdt); G.comboT -= rdt; if (G.comboT <= 0) G.combo = 0;
  if (TOON){ G.count -= dt; if (G.count <= 0 && !G.done) G.lapT += dt; G.flash = Math.max(0, G.flash - rdt * 1.2); if (G.done > 0){ G.done -= rdt; if (G.done <= 0){ G.done = 0; reset(); } } }
  if (dt > 0){ const n = Math.ceil(dt / (1 / 120)); for (let k = 0; k < n; k++) physicsStep(dt / n); G.t += dt; }
  smoke.update(dt); sparks.update(dt);
  const uS = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); smoke.mat.uniforms.uScale.value = sparks.mat.uniforms.uScale.value = uS;
  placeCars(dt); updateCamera(dt > 0 ? dt : rdt * .0001, rdt);
  post.render(rdt); drawHud(rdt);
}
function loop(now){ requestAnimationFrame(loop); const rdt = Math.min(.05, (now - last) / 1000); last = now; frame(rdt);
  fpsN++; fpsT += rdt; if (fpsT > .5){ document.getElementById('fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = fpsT = 0; } }
if (!REC) requestAnimationFrame(loop);
else { const still = () => { requestAnimationFrame(still); post.render(0); }; requestAnimationFrame(still); }   /* headless capture needs a frame drawn every rAF; the world does not move */
if (TOON) reset();
window.XPlay = {G, me, frame, reset, renderer, hud, props, traffic, TOON, camera, scene, post, hero};   /* for tests and the recorder */
