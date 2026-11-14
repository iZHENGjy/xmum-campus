/* 雪邦赛车城 demo · 布景（美术总监 + 创意总监的第一轮意见）：「毕业典礼开在赛道上」
 *   看台坐满人（会晃）、国旗和校旗（会飘）、看台前的 LED 大屏（滚动「Class of 2026 · 毕业快乐 · Selamat Graduasi」）、
 *   一号弯外的轮胎墙和刹车牌、一号弯上空的 wau bulan 风筝阵、天上的云、雨后的彩虹、湖对岸的建南式金色穹顶楼、湖上的灯、
 *   远处降落的客机、冲过门楼时抛起的学士帽。
 * 每一类东西一个实例化网格或合并网格（一个绘制调用），会动的都在着色器或每帧改矩阵里做。 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PTS } from './track-data.js';
import { N, RT, HD, HW, clampI } from './physics.js';
import { SF } from './world.js';

const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(777);
const P = (i, off) => { const j = clampI(Math.round(i)); return [PTS[j][0] + RT[j][0] * off, PTS[j][1] + RT[j][1] * off]; };
const faceTrack = i => { const r = RT[clampI(i)]; return s => Math.atan2(-s * r[0], -s * r[1]); };   /* rotation.y that turns +z toward the road from side s */
function tex(w, h, draw, srgb = true){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const U = {uTime:{value:0}};
/* add a time uniform and a vertex displacement to a standard material */
function animate(mat, displace){
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + displace); };
  return mat;
}

export function dressWorld(scene, W, Q){
  const world = W.world, upd = [], hall = new THREE.Vector3();

  /* ---------------- the crowd: people on the grandstand tiers, each bobbing a little, some waving ---------------- */
  {
    const person = tex(192, 128, (g) => { g.clearRect(0, 0, 192, 128);
      [[32, 10, '#ffffff', 0], [96, 0, '#c9c9c9', 1], [160, 14, '#e6e6e6', 0]].forEach(([cx, dy, col, up]) => { g.fillStyle = col; const y0 = dy;
        g.beginPath(); g.arc(cx, 22 + y0, 12, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 20, 128); g.lineTo(cx - 18, 52 + y0); g.quadraticCurveTo(cx, 36 + y0, cx + 18, 52 + y0); g.lineTo(cx + 20, 128); g.fill();
        g.fillRect(cx - 28, 40 + y0, 8, 32); if (up) g.fillRect(cx + 20, 4 + y0, 8, 44); else g.fillRect(cx + 20, 40 + y0, 8, 32); }); });
    const count = Q.crowd, geo = new THREE.PlaneGeometry(1.86, 1.25); geo.translate(0, .62, 0);
    const mat = animate(new THREE.MeshStandardMaterial({map:person, alphaTest:.5, roughness:.9, side:THREE.DoubleSide}),
      'float ph = float(gl_InstanceID) * 1.7; transformed.y += abs(sin(uTime * 2.6 + ph)) * .12 * step(.7, fract(ph * .13)); transformed.x += sin(uTime * 1.3 + ph) * .03;');
    const im = new THREE.InstancedMesh(geo, mat, count), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    const shirts = ['#1f4e8c', '#f2f0ea', '#b3201c', '#1f4e8c', '#f2c230', '#2c2c30', '#f2f0ea', '#3a7d44'];
    for (let k = 0; k < count; k++){
      const i = 12 + Math.floor(rng() * 385), t = Math.floor(rng() * 12), [x, z] = P(i, HW[i] + 30 + t * 3.2 + 2.4 + (rng() - .5) * .8);
      q.setFromEuler(e.set(0, faceTrack(i)(1), 0)); const s = .9 + rng() * .25;
      m.compose(new THREE.Vector3(x, 1.75 + t * 1.4, z), q, new THREE.Vector3(s, s, s)); im.setMatrixAt(k, m);
      im.setColorAt(k, c.set(shirts[Math.floor(rng() * shirts.length)]).multiplyScalar(.55 + rng() * .25));
    }
    im.computeBoundingSphere(); world.add(im);
  }

  /* ---------------- flags: Jalur Gemilang and the XMUM flag along the grandstand roof and the pit roof, waving ---------------- */
  {
    const my = tex(256, 128, (g, w, h) => { for (let k = 0; k < 14; k++){ g.fillStyle = k % 2 ? '#f4f4f0' : '#c8102e'; g.fillRect(0, k * h / 14, w, h / 14 + 1); }
      g.fillStyle = '#0a2a6b'; g.fillRect(0, 0, w * .5, h * 8 / 14); g.fillStyle = '#ffcc00'; g.beginPath(); g.arc(w * .19, h * .29, h * .25, 0, 7); g.fill(); g.fillStyle = '#0a2a6b'; g.beginPath(); g.arc(w * .23, h * .29, h * .2, 0, 7); g.fill();
      g.fillStyle = '#ffcc00'; g.beginPath(); for (let k = 0; k < 28; k++){ const a = k / 28 * Math.PI * 2, r = k % 2 ? h * .055 : h * .13; g.lineTo(w * .36 + Math.cos(a) * r * 1.3, h * .29 + Math.sin(a) * r * 1.3); } g.fill(); });
    const xm = tex(256, 128, (g, w, h) => { g.fillStyle = '#103b7a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24a'; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#f4ead6'; g.font = '900 46px "Noto Serif SC","SimSun",serif'; g.textAlign = 'center'; g.fillText('XMUM', w / 2, 62); g.font = '600 20px "Noto Sans SC",sans-serif'; g.fillText('厦门大学马来西亚分校', w / 2, 96); });
    const geo = new THREE.PlaneGeometry(3.2, 1.6, 8, 1); geo.translate(1.6, 0, 0);
    const wave = 'float fx = position.x / 3.2; transformed.z += sin(uTime * 4.0 + position.x * 2.2 + float(gl_InstanceID)) * .28 * fx; transformed.y -= fx * fx * .12;';
    const spots = [];
    for (let i = 14; i < 400; i += 12) spots.push([i, HW[i] + 30, 25.6]);
    for (let i = 8; i < 420; i += 16) spots.push([i, -(HW[i] + 25), 13.4]);
    for (const [flag, sel] of [[my, k => k % 2 === 0], [xm, k => k % 2 === 1]]){
      const list = spots.filter((_, k) => sel(k)), mat = animate(new THREE.MeshStandardMaterial({map:flag, roughness:.8, side:THREE.DoubleSide}), wave);
      const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach(([i, off, y], k) => { const [x, z] = P(i, off); q.setFromEuler(e.set(0, HD[i] + Math.PI / 2, 0)); m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(k, m); });
      im.computeBoundingSphere(); world.add(im);
    }
    /* the poles */
    const poles = spots.map(([i, off, y]) => { const [x, z] = P(i, off), g = new THREE.CylinderGeometry(.05, .06, 4, 5); g.translate(x, y - 1.2, z); return g; });
    world.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({color:'#c9cdd2', metalness:.8, roughness:.3})));
  }

  /* ---------------- LED screens in front of the grandstand: scrolling text, glowing ---------------- */
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g = cv.getContext('2d');
    const lines = ['CLASS OF 2026', '毕业快乐 · Selamat Graduasi', '雪邦赛车城 · XMUM', 'LAP 4 / 4 · 大四'];
    g.fillStyle = '#05070a'; g.fillRect(0, 0, 1024, 256);
    lines.forEach((t, k) => { g.fillStyle = ['#ffd27a', '#f4ead6', '#9fd3ff', '#ff8a6a'][k]; g.font = '800 52px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 512, 32 + k * 64); });
    for (let y = 0; y < 256; y += 3){ g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, 1024, 1); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, .25);
    const mat = new THREE.MeshStandardMaterial({color:'#000', emissive:'#ffffff', emissiveMap:t, emissiveIntensity:1.25, roughness:.85, envMapIntensity:.15});
    const frame = [], scr = [];
    for (let i = 40; i < 400; i += 34){ const [x, z] = P(i, HW[i] + 26.5), ry = faceTrack(i)(1);
      const s = new THREE.PlaneGeometry(12, 6.4); s.rotateY(ry); s.translate(x, 9.6, z); scr.push(s);
      const f = new THREE.BoxGeometry(12.6, 7, .5); f.rotateY(ry); f.translate(x + Math.sin(ry) * -.3, 9.6, z + Math.cos(ry) * -.3); frame.push(f);
      for (const o of [-4, 4]){ const p = new THREE.BoxGeometry(.4, 6.2, .4); p.translate(o, 3.1, -.3); p.rotateY(ry); p.translate(x, 0, z); frame.push(p); } }
    world.add(new THREE.Mesh(mergeGeometries(scr), mat));
    const fm = new THREE.Mesh(mergeGeometries(frame), new THREE.MeshStandardMaterial({color:'#1b1d21', roughness:.6, metalness:.3})); fm.castShadow = true; world.add(fm);
    upd.push((dt, time) => { t.offset.y = Math.floor(time / 2.2) % 4 * .25; });
  }

  /* ---------------- T1: tyre wall behind the gravel (outside = left), a conveyor belt cover, brake boards on the approach ---------------- */
  {
    const belt = tex(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 32){ g.fillStyle = (x / 32) % 2 ? '#c8102e' : '#f2f2ee'; g.fillRect(x, 0, 32, h); } g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 6, w, 6); });
    belt.wrapS = THREE.RepeatWrapping;
    const pos = [], uv = [], idx = []; let n = 0, s0 = 0;
    for (let i = 500; i <= 640; i++){ const [x, z] = P(i, HW[i] + 24.4); if (i > 500){ const [px, pz] = P(i - 1, HW[i - 1] + 24.4); s0 += Math.hypot(x - px, z - pz); }
      pos.push(x, 0, z, x, 1.25, z); uv.push(s0 / 4, 0, s0 / 4, 1); if (i < 640){ idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); } n += 2; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx); bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({map:belt, roughness:.7, side:THREE.DoubleSide})); bm.castShadow = bm.receiveShadow = true; world.add(bm);
    /* the top row of tyres peeking over the belt */
    const tyreG = new THREE.CylinderGeometry(.34, .34, .26, 9, 1, true); const tyres = [];
    for (let i = 500; i <= 640; i += 1) for (const d of [.5, 1.15]){ const [x, z] = P(i, HW[i] + 24.4 + d); tyres.push([x, z]); }
    const ti = new THREE.InstancedMesh(tyreG, new THREE.MeshStandardMaterial({color:'#18191b', roughness:.95, side:THREE.DoubleSide}), tyres.length), m = new THREE.Matrix4();
    tyres.forEach(([x, z], k) => { m.makeTranslation(x, 1.38, z); ti.setMatrixAt(k, m); }); ti.computeBoundingSphere(); world.add(ti);
    /* 300 / 200 / 100 boards before T1, both sides */
    const nums = tex(512, 128, (g, w, h) => { ['300', '200', '100', '50'].forEach((t, k) => { const x = k * 128; g.fillStyle = '#f4f4f0'; g.fillRect(x, 0, 128, 128); g.fillStyle = k === 3 ? '#c8102e' : '#1f2a33'; g.fillRect(x + 8, 8, 112, 112); g.fillStyle = '#fff'; g.font = '900 60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 64, 66); }); });
    const bp = [], buv = [];
    const brakeStart = 545;
    [300, 200, 100, 50].forEach((d, k) => { const i = brakeStart - Math.round(d / 3); for (const s of [-1, 1]){ const [x, z] = P(i, s * (HW[i] + 4)), ry = faceTrack(i)(s) + (s > 0 ? -.35 : .35);
      const g = new THREE.PlaneGeometry(2, 2); const uvA = g.attributes.uv; for (let v = 0; v < uvA.count; v++) uvA.setX(v, (k + uvA.getX(v)) / 4);
      g.rotateY(ry + Math.PI); g.translate(x, 2.2, z); bp.push(g); const post = new THREE.BoxGeometry(.12, 1.6, .12); post.translate(x, .8, z); buv.push(post); } });
    world.add(new THREE.Mesh(mergeGeometries(bp), new THREE.MeshStandardMaterial({map:nums, roughness:.5, side:THREE.DoubleSide})));
    world.add(new THREE.Mesh(mergeGeometries(buv), new THREE.MeshStandardMaterial({color:'#9aa0a6', roughness:.5})));
  }

  /* ---------------- the wau bulan formation over T1 (inside of the hairpin), lines down to the ground ---------------- */
  {
    const wau = tex(512, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const cx = w / 2;
      const body = (col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, 30); g.bezierCurveTo(cx + 60, 60, cx + 250, 120, cx + 250, 200); g.bezierCurveTo(cx + 180, 230, cx + 70, 210, cx + 40, 250);
        g.bezierCurveTo(cx + 40, 320, cx + 200, 330, cx + 230, 420); g.bezierCurveTo(cx + 120, 470, cx + 30, 440, cx, 500); g.bezierCurveTo(cx - 30, 440, cx - 120, 470, cx - 230, 420);
        g.bezierCurveTo(cx - 200, 330, cx - 40, 320, cx - 40, 250); g.bezierCurveTo(cx - 70, 210, cx - 180, 230, cx - 250, 200); g.bezierCurveTo(cx - 250, 120, cx - 60, 60, cx, 30); g.fill(); };
      body('#c8102e'); g.save(); g.translate(cx, 260); g.scale(.82, .82); g.translate(-cx, -260); body('#f2c230'); g.restore(); g.save(); g.translate(cx, 260); g.scale(.6, .6); g.translate(-cx, -260); body('#123f8c'); g.restore();
      g.strokeStyle = '#f2c230'; g.lineWidth = 6; for (let k = 0; k < 9; k++){ g.beginPath(); g.arc(cx, 260, 30 + k * 22, 0, 7); g.stroke(); }
      g.fillStyle = '#f4f0e6'; g.beginPath(); g.arc(cx, 140, 26, 0, 7); g.fill(); });
    const mat = new THREE.MeshStandardMaterial({map:wau, alphaTest:.5, side:THREE.DoubleSide, roughness:.7, emissive:'#ffffff', emissiveMap:wau, emissiveIntensity:.35});
    const geo = new THREE.PlaneGeometry(36, 36), kites = [], lines = [];
    for (let k = 0; k < 6; k++){
      const i = 520 + k * 22, [gx, gz] = P(i, -(HW[i] + 55 + (k % 2) * 30)), h = 24 + (k % 3) * 9 + k * 2;
      const kite = new THREE.Mesh(geo, mat); kite.position.set(gx, h, gz); kite.rotation.order = 'YXZ'; kite.rotation.y = faceTrack(i)(-1); kite.rotation.x = -.38; world.add(kite);
      kites.push({kite, ph:k * 1.3, base:kite.position.clone(), ry:kite.rotation.y});
      lines.push(gx, h - 9, gz, gx - 30, 1.5, gz - 18);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    world.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({color:'#e8e0d0', transparent:true, opacity:.45})));
    upd.push((dt, t) => { for (const K of kites){ K.kite.position.y = K.base.y + Math.sin(t * .7 + K.ph) * 1.6; K.kite.rotation.z = Math.sin(t * .9 + K.ph) * .12; K.kite.rotation.y = K.ry + Math.sin(t * .5 + K.ph) * .1; } });
  }

  /* ---------------- clouds on a dome: tropical towers lit orange on the sun side, a pink cirrus veil ---------------- */
  let cloudMat;
  {
    cloudMat = new THREE.ShaderMaterial({transparent:true, depthWrite:false, fog:false, side:THREE.BackSide, uniforms:{uSun:{value:W.sunDir.clone()}, uRain:{value:0}, uTime:U.uTime},
      vertexShader:'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:`
        varying vec3 vDir; uniform vec3 uSun; uniform float uRain; uniform float uTime;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = .5; for (int k = 0; k < 5; k++){ s += a * n(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
        void main(){
          if (vDir.y < -0.02) discard;
          vec2 uv = vDir.xz / (vDir.y + .12);
          float base = fbm(uv * 1.6 + vec2(uTime * .004, 0.0));
          float towers = smoothstep(.56 - .2 * uRain, .78, base) * smoothstep(.0, .12, vDir.y + .02) * (1.0 - smoothstep(.35, .7, vDir.y));
          float cirrus = smoothstep(.55, .85, fbm(uv * vec2(.6, 3.2) + 3.0)) * .45 * smoothstep(.15, .5, vDir.y);
          float sunSide = clamp(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSun.x, 0.0, uSun.z))) * .5 + .5, 0.0, 1.0);
          float shade = fbm(uv * 3.1 + 11.0);
          vec3 lit = mix(vec3(.55, .52, .55), vec3(1.25, .78, .52), sunSide * sunSide);
          vec3 dark = mix(vec3(.30, .30, .36), vec3(.55, .40, .38), sunSide);
          vec3 col = mix(dark, lit, smoothstep(.35, .75, shade));
          col = mix(col, vec3(.42, .44, .47), uRain);
          vec3 cir = mix(vec3(.9, .7, .75), vec3(1.2, .8, .6), sunSide);
          float a = max(towers * .92, cirrus);
          vec3 c = towers > cirrus ? col : cir;
          gl_FragColor = vec4(c, a);
        }`});
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), cloudMat); dome.renderOrder = -2; dome.frustumCulled = false; scene.add(dome);
    upd.push((dt, t, cam) => { dome.position.set(cam.x, 0, cam.z); });
  }

  /* ---------------- the rainbow: 42° round the anti-solar point (low sun → a high arc), additive, faint ---------------- */
  let bowMat;
  {
    const bow = (R, w, amt, rev) => new THREE.ShaderMaterial({transparent:true, depthWrite:false, fog:false, blending:THREE.AdditiveBlending, uniforms:{uAmt:{value:amt}, uR:{value:R}, uW:{value:w}, uRev:{value:rev}},
      vertexShader:'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:`varying float vR; uniform float uAmt, uR, uW, uRev;
        vec3 spec(float t){ return clamp(vec3(1.5 - abs(t - .15) * 4.0, 1.5 - abs(t - .5) * 4.0, 1.5 - abs(t - .85) * 4.0), 0.0, 1.0); }
        void main(){ float t = 1.0 - (vR - (uR - uW)) / (2.0 * uW); if (t < 0.0 || t > 1.0) discard; if (uRev > .5) t = 1.0 - t; float edge = smoothstep(0.0, .35, t) * smoothstep(1.0, .65, t); gl_FragColor = vec4(spec(t) * edge * uAmt, 1.0); }`});
    bowMat = bow(2700, 210, .2, 0); const bow2 = bow(3700, 260, .07, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2480, 2920, 160, 1), bowMat), ring2 = new THREE.Mesh(new THREE.RingGeometry(3430, 3970, 160, 1), bow2);
    for (const r of [ring, ring2]){ r.renderOrder = -1; r.frustumCulled = false; scene.add(r); }
    const anti = W.sunDir.clone().multiplyScalar(-1);
    upd.push((dt, t, cam) => { for (const r of [ring, ring2]){ r.position.set(cam.x + anti.x * 3000, cam.y + anti.y * 3000, cam.z + anti.z * 3000); r.lookAt(cam.x, cam.y, cam.z); } bow2.uniforms.uAmt.value = bowMat.uniforms.uAmt.value * .35; });
  }

  /* ---------------- across the lake: a 建南大会堂-style hall, white stone, gold dome, red-tiled wings; lanterns on the water ---------------- */
  {
    const [lx, lz, A, B] = W.lake, li = 905, r = RT[li], far = [lx + r[0] * (B + 70), lz + r[1] * (B + 70)], ry = Math.atan2(-r[0], -r[1]);
    hall.set(far[0], 0, far[1]);
    const g = new THREE.Group(); g.position.set(far[0], 0, far[1]); g.rotation.y = ry; g.scale.setScalar(2.4); world.add(g);
    const stone = new THREE.MeshStandardMaterial({color:'#cdc6b8', roughness:.75}), tileM = new THREE.MeshStandardMaterial({color:'#9a3b1e', roughness:.6}), gold = new THREE.MeshStandardMaterial({color:'#c9a24a', metalness:.85, roughness:.32});
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(46, 24, 26), stone, 0, 12, 0);
    for (const s of [-1, 1]){ add(new THREE.BoxGeometry(34, 16, 22), stone, s * 40, 8, 4); const rf = add(new THREE.ConeGeometry(23, 7, 4, 1), tileM, s * 40, 19.5, 4); rf.rotation.y = Math.PI / 4; rf.scale.set(1.15, 1, .7); }
    add(new THREE.CylinderGeometry(12, 12, 8, 24), stone, 0, 28, 0);
    add(new THREE.SphereGeometry(12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 32, 0);
    add(new THREE.CylinderGeometry(.6, 1.2, 8, 8), gold, 0, 46, 0);
    for (let k = -3; k <= 3; k++) add(new THREE.CylinderGeometry(.9, 1, 14, 10), stone, k * 6.2, 7, 13.6);
    /* windows lit warm */
    const win = new THREE.MeshStandardMaterial({color:'#2a2018', emissive:'#ffc77a', emissiveIntensity:1.1});
    for (let k = -3; k <= 3; k++) for (const y of [16, 20]) add(new THREE.PlaneGeometry(2.4, 2.6), win, k * 6.2, y, 13.05);
    /* the wings' windows, cornices, a plinth, the front steps and a balustrade: it reads as a building up close on the long lens */
    const winDim = new THREE.MeshStandardMaterial({color:'#2a2018', emissive:'#ffc77a', emissiveIntensity:.55});
    for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) for (const y of [4.6, 10.4]) add(new THREE.PlaneGeometry(2.2, 3), winDim, s * 40 + k * 6, y, 15.05);
    const trim = new THREE.MeshStandardMaterial({color:'#e8e2d4', roughness:.6});
    add(new THREE.BoxGeometry(48, 1.2, 28), trim, 0, 24.4, 0); add(new THREE.BoxGeometry(47, .6, 27), trim, 0, 13.6, 0); add(new THREE.BoxGeometry(27, 1.4, 27), trim, 0, 32.4, 0);
    for (const s of [-1, 1]){ add(new THREE.BoxGeometry(35, .9, 23.4), trim, s * 40, 16.3, 4); add(new THREE.BoxGeometry(35, .5, 23.2), trim, s * 40, 7.6, 4); }
    add(new THREE.BoxGeometry(116, 1.2, 30), trim, 0, .6, 3);
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(34 - k * 1.2, .45, 2.4), trim, 0, 1.4 + k * .45, 17.6 - k * .9);
    add(new THREE.BoxGeometry(46, .5, .5), trim, 0, 15.3, 14.6); for (let k = -22; k <= 22; k += 1.1) add(new THREE.CylinderGeometry(.18, .18, 1.1, 5), trim, k, 14.6, 14.6);
    /* one draw call per material: merge the ~70 parts */
    { const by = new Map(); for (const c of g.children.slice()){ c.updateMatrix(); const geo = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix); if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(geo); g.remove(c); }
      for (const [mat, list] of by){ const mm = new THREE.Mesh(mergeGeometries(list), mat); mm.castShadow = mm.receiveShadow = true; g.add(mm); } }
    /* lanterns */
    const lantern = new THREE.SphereGeometry(.45, 8, 6), lm = new THREE.MeshStandardMaterial({color:'#5a2a10', emissive:'#ffb15a', emissiveIntensity:2.6});
    const nL = Q.lanterns, im = new THREE.InstancedMesh(lantern, lm, nL), base = [];
    for (let k = 0; k < nL; k++){ const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * .85; const lx2 = Math.cos(a) * A * rr, lz2 = Math.sin(a) * B * rr, h = HD[905] - Math.PI / 2;
      base.push([lx + Math.cos(h) * lx2 - Math.sin(h) * lz2 * -1, lz - Math.sin(h) * lx2 + Math.cos(h) * lz2 * -1, rng() * 6]); }
    const m = new THREE.Matrix4();
    upd.push((dt, t) => { base.forEach(([x, z, ph], k) => { m.makeTranslation(x + Math.sin(t * .2 + ph) * .8, .35 + Math.sin(t * 1.3 + ph) * .06, z + Math.cos(t * .17 + ph) * .8); im.setMatrixAt(k, m); }); im.instanceMatrix.needsUpdate = true; });
    im.frustumCulled = false; world.add(im);
  }

  /* ---------------- an airliner on approach to KLIA, far away, crossing every ~22 s, lights blinking ---------------- */
  {
    const plane = new THREE.Group(), body = new THREE.MeshStandardMaterial({color:'#e9ecef', roughness:.4, metalness:.2});
    const f = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 40, 12), body); f.rotation.x = Math.PI / 2; plane.add(f);
    const w = new THREE.Mesh(new THREE.BoxGeometry(36, .6, 6), body); w.position.z = 2; plane.add(w);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(.6, 8, 5), body); tl.position.set(0, 4, -18); plane.add(tl);
    const st = new THREE.Mesh(new THREE.BoxGeometry(12, .5, 4), body); st.position.set(0, 0, -17); plane.add(st);
    const blink = new THREE.MeshBasicMaterial({color:'#ff3b2f'}), strobe = new THREE.MeshBasicMaterial({color:'#ffffff'});
    const b1 = new THREE.Mesh(new THREE.SphereGeometry(.8, 6, 4), blink); b1.position.set(0, -2, 0); plane.add(b1);
    const b2 = new THREE.Mesh(new THREE.SphereGeometry(.8, 6, 4), strobe); b2.position.set(18, 0, 2); plane.add(b2);
    const b3 = b2.clone(); b3.position.x = -18; plane.add(b3);
    scene.add(plane);
    upd.push((dt, t, cam) => { const k = (t % 22) / 22, a = -2.2; const x0 = cam.x + Math.sin(a) * 1700, z0 = cam.z + Math.cos(a) * 1700, dx = Math.cos(a), dz = -Math.sin(a);
      plane.position.set(x0 + dx * (k - .5) * 3200, 260 - k * 140, z0 + dz * (k - .5) * 3200); plane.rotation.set(0, Math.atan2(dx, dz), 0); plane.rotateX(.05);
      b1.visible = (t * 1.2 % 1) < .15; b2.visible = b3.visible = (t * .9 % 1) < .08; });
  }

  /* ---------------- graduation caps thrown in the air when the cars pass under the gate ---------------- */
  /* confetti in the school's colours, fluttering down */
  const confetti = (() => {
    const n = Q.caps * 4, im = new THREE.InstancedMesh(new THREE.PlaneGeometry(.14, .09), new THREE.MeshStandardMaterial({roughness:.5, metalness:.3, side:THREE.DoubleSide, emissive:'#222'}), n); im.frustumCulled = false; im.count = 0; world.add(im);
    const cc = ['#103b7a', '#c9a24a', '#c8102e', '#f4f2ec', '#f2c230'].map(c => new THREE.Color(c)); for (let k = 0; k < n; k++) im.setColorAt(k, cc[k % cc.length]);
    const st = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    return {burst(i0){ st.length = 0; for (let k = 0; k < n; k++){ const i = i0 + 5 + Math.floor(Math.pow(rng(), 1.4) * 110), [x, z] = P(i, (rng() - .5) * 2 * (HW[i] + 4)); st.push({x, y:6 + rng() * 18, z, ph:rng() * 6, sp:.8 + rng() * .8}); } im.count = n; },
      reset(){ st.length = 0; im.count = 0; },
      update(dt, t){ if (!st.length) return; st.forEach((c, k) => { c.y = Math.max(.05, c.y - c.sp * dt); const sw = Math.sin(t * 3 + c.ph); q.setFromEuler(e.set(t * 4 + c.ph, t * 2.7 + c.ph, sw)); m.compose(v.set(c.x + sw * .6, c.y, c.z + Math.cos(t * 2.3 + c.ph) * .6), q, one); im.setMatrixAt(k, m); }); im.instanceMatrix.needsUpdate = true; }};
  })();
  const caps = (() => {
    const g = mergeGeometries([new THREE.BoxGeometry(.5, .04, .5), new THREE.CylinderGeometry(.2, .22, .14, 10).translate(0, -.09, 0)]);
    const n = Q.caps, im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({color:'#15171c', roughness:.6}), n); im.frustumCulled = false; im.count = 0; world.add(im);
    const st = []; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    function burst(i0 = SF){ st.length = 0; for (let k = 0; k < n; k++){ const i = i0 + 8 + Math.floor(Math.pow(rng(), 1.4) * 120), off = (rng() - .5) * 2 * (HW[i] + 6), [x, z] = P(i, off);
      st.push({x, y:8 + rng() * 14, z, vx:(rng() - .5) * 4, vy:2 + rng() * 5, vz:(rng() - .5) * 4, rx:rng() * 6, ry:rng() * 6, sx:(rng() - .5) * 12, sy:(rng() - .5) * 12, life:0}); } im.count = n; confetti.burst(i0); }
    function update(dt){ if (!st.length) return; let alive = 0;
      st.forEach((c, k) => { c.life += dt; c.vy -= 9.8 * dt; c.vx *= .99; c.vz *= .99; if (c.vy < -3){ c.vy = -3 + Math.sin(c.life * 4 + k) * .6; } c.x += c.vx * dt; c.y = Math.max(.1, c.y + c.vy * dt); c.z += c.vz * dt; c.rx += c.sx * dt; c.ry += c.sy * dt;
        if (c.y > .1) alive++; q.setFromEuler(e.set(c.rx, c.ry, 0)); m.compose(v.set(c.x, c.y, c.z), q, one); im.setMatrixAt(k, m); });
      im.instanceMatrix.needsUpdate = true; if (!alive){ st.length = 0; im.count = 0; } }
    return {burst, update, reset(){ st.length = 0; im.count = 0; confetti.reset(); }};
  })();

  /* ---------------- outside T2–T3 (the left side): mamak stalls under string lights, a row of Peranakan shophouses, a service road with motorbikes ---------------- */
  {
    /* shophouses: two storeys, pastel walls, a five-foot way arcade, louvred shutters, red tile roofs, signboards */
    const pastel = ['#e7c9a0', '#9fc5b0', '#e6a4a0', '#a8c3e0', '#efe0a8', '#c9b3d9'];
    const front = tex(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 118, w, 6); g.fillStyle = '#f4efe4'; for (const x of [10, 236]) g.fillRect(x, 0, 10, h);
      for (const x of [40, 104, 168]){ g.fillStyle = '#3b5f4a'; g.fillRect(x, 26, 48, 70); g.strokeStyle = '#2a4536'; g.lineWidth = 2; for (let y = 30; y < 94; y += 6){ g.beginPath(); g.moveTo(x + 3, y); g.lineTo(x + 45, y); g.stroke(); } g.fillStyle = '#f4efe4'; g.fillRect(x + 22, 26, 4, 70); }
      g.fillStyle = '#7f2a17'; g.fillRect(24, 132, 208, 30); g.fillStyle = '#f2d27a'; g.font = '700 22px "Noto Serif SC","SimSun",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(['海南咖啡店 KOPITIAM', '振兴杂货 KEDAI RUNCIT', '娘惹糕 NYONYA KUIH', '理发 BARBER', '茶室 KEDAI KOPI', '金铺 GOLD'][Math.floor(rng() * 6)], 128, 148, 200);
      g.fillStyle = '#2b2620'; g.fillRect(36, 178, 184, 78); g.fillStyle = '#ffcf8a'; g.fillRect(44, 186, 70, 62); g.fillStyle = '#5a4630'; g.fillRect(130, 186, 82, 70); });
    const fm = new THREE.MeshStandardMaterial({map:front, roughness:.85, emissive:'#ffffff', emissiveMap:tex(256, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#6b4a22'; g.fillRect(44, 186, 70, 62); g.fillStyle = '#3a2810'; g.fillRect(24, 132, 208, 30); }), emissiveIntensity:1});
    const shells = [], fronts = [], roofs = [], cols = [];
    let k = 0;
    for (let i = 646; i < 730; i += 8){ const off = HW[i] + 36, [x, z] = P(i, off), ry = faceTrack(i)(1), c = new THREE.Color(pastel[k++ % pastel.length]);
      const paint = g => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let v = 0; v < n; v++) c.toArray(a, v * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
      const S = 1.3, sc = g => g.scale(S, S, S);
      const b = paint(new THREE.BoxGeometry(17, 10, 14)); b.translate(0, 5, -7); sc(b); b.rotateY(ry); b.translate(x, 0, z); shells.push(b);
      const f = new THREE.PlaneGeometry(16, 10); f.translate(0, 5, .06); sc(f); f.rotateY(ry); f.translate(x, 0, z); fronts.push(f);
      const r = new THREE.BoxGeometry(17.4, .5, 15); r.translate(0, 10.6, -7); sc(r); r.rotateY(ry); r.translate(x, 0, z); roofs.push(r);
      const r2 = new THREE.CylinderGeometry(.01, 8.6, 3, 4, 1); r2.rotateY(Math.PI / 4); r2.scale(1, 1, .9); r2.translate(0, 12.3, -7); sc(r2); r2.rotateY(ry); r2.translate(x, 0, z); roofs.push(r2);
      for (const cx of [-7.6, 0, 7.6]){ const p = new THREE.BoxGeometry(.6, 4.2, .6); p.translate(cx, 2.1, 2.4); sc(p); p.rotateY(ry); p.translate(x, 0, z); cols.push(p); }
      const ar = new THREE.BoxGeometry(17, .4, 2.6); ar.translate(0, 4.3, 1.2); sc(ar); ar.rotateY(ry); ar.translate(x, 0, z); cols.push(ar);
    }
    const sm = new THREE.Mesh(mergeGeometries(shells), new THREE.MeshStandardMaterial({vertexColors:true, roughness:.9})); sm.castShadow = sm.receiveShadow = true; world.add(sm);
    world.add(new THREE.Mesh(mergeGeometries(fronts), fm));
    const rm = new THREE.Mesh(mergeGeometries(roofs.map(g => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({color:'#8e3219', roughness:.7})); rm.castShadow = true; world.add(rm);
    const cm = new THREE.Mesh(mergeGeometries(cols), new THREE.MeshStandardMaterial({color:'#efe8da', roughness:.8})); cm.castShadow = true; world.add(cm);

    /* mamak / night-market stalls: striped canvas roofs, a warm glow, string lights between poles */
    const awn = tex(128, 64, (g, w, h) => { const c = [['#c8102e', '#f4f0e6'], ['#123f8c', '#f4f0e6'], ['#0f6b3a', '#f2c230'], ['#f2c230', '#c8102e']][Math.floor(rng() * 4)]; for (let x = 0; x < w; x += 16){ g.fillStyle = c[(x / 16) % 2]; g.fillRect(x, 0, 16, h); } });
    const stalls = [], tops = [], bulbs = [];
    for (let i = 566; i < 636; i += 5){ const off = HW[i] + 36, [x, z] = P(i, off), ry = faceTrack(i)(1);
      const t = new THREE.BoxGeometry(5.4, .25, 4.2); t.translate(0, 2.8, 0); t.rotateZ(0); t.rotateY(ry); t.translate(x, 0, z); tops.push(t);
      const c = new THREE.BoxGeometry(4.6, 1, 2); c.translate(0, .5, -.6); c.rotateY(ry); c.translate(x, 0, z); stalls.push(c);
      for (const px of [-2.5, 2.5]) for (const pz of [-1.9, 1.9]){ const p = new THREE.CylinderGeometry(.05, .05, 2.8, 5); p.translate(px, 1.4, pz); p.rotateY(ry); p.translate(x, 0, z); stalls.push(p); }
      for (let b = 0; b < 8; b++){ const u = b / 7 - .5, [bx, bz] = P(i + u * 5, off - 2.4); bulbs.push([bx, 3.1 - Math.sin((b / 7) * Math.PI) * .35, bz]); } }
    world.add(new THREE.Mesh(mergeGeometries(tops), new THREE.MeshStandardMaterial({map:awn, roughness:.8, emissive:'#ffb36a', emissiveIntensity:.18})));
    const st = new THREE.Mesh(mergeGeometries(stalls.map(g => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({color:'#6b5843', roughness:.85})); st.castShadow = true; world.add(st);
    const bi = new THREE.InstancedMesh(new THREE.SphereGeometry(.09, 6, 4), new THREE.MeshStandardMaterial({color:'#3a2a10', emissive:'#ffd08a', emissiveIntensity:3}), bulbs.length), m = new THREE.Matrix4();
    bulbs.forEach(([x, y, z], k) => { m.makeTranslation(x, y, z); bi.setMatrixAt(k, m); }); bi.computeBoundingSphere(); world.add(bi);
    /* satay smoke: a few soft puffs drift up from the stalls (reuses nothing: cheap sprites on a slow loop) */

    /* the service road with motorbikes and their tail lights, running alongside */
    const road = [];
    for (let i = 520; i <= 780; i += 2){ road.push(P(i, HW[i] + 62)); }
    const rg = [], ruv = []; road.forEach(([x, z], k) => { const a = road[Math.max(0, k - 1)], b = road[Math.min(road.length - 1, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = tz / l * 3.5, nz = -tx / l * 3.5;
      rg.push(x - nx, .03, z - nz, x + nx, .03, z + nz); });
    const ri = []; for (let k = 0; k < road.length - 1; k++){ const a = k * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rg, 3)); rgeo.setIndex(ri); rgeo.computeVertexNormals();
    const rmesh = new THREE.Mesh(rgeo, new THREE.MeshStandardMaterial({color:'#3a3c40', roughness:.9, side:THREE.DoubleSide})); rmesh.receiveShadow = true; world.add(rmesh);
    const bikeG = mergeGeometries([new THREE.BoxGeometry(.5, .7, 1.8).translate(0, .75, 0), new THREE.BoxGeometry(.45, .75, .4).translate(0, 1.45, -.2), new THREE.SphereGeometry(.17, 6, 4).translate(0, 1.95, -.1)]);
    const nb = 46, bikes = new THREE.InstancedMesh(bikeG, new THREE.MeshStandardMaterial({color:'#202227', roughness:.6}), nb);
    const tail = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, .08, .05), new THREE.MeshStandardMaterial({color:'#300', emissive:'#ff2a1f', emissiveIntensity:4}), nb);
    const cols2 = ['#c8102e', '#123f8c', '#f2c230', '#e9ecef', '#2d6b3a', '#d86b1f']; for (let k = 0; k < nb; k++) bikes.setColorAt(k, new THREE.Color(cols2[k % cols2.length]));
    const bs = []; for (let k = 0; k < nb; k++) bs.push({s:rng() * (road.length - 1), v:8 + rng() * 6, lane:(rng() - .5) * 4});
    const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    upd.push((dt) => { bs.forEach((b, k) => { b.s = ((b.s + b.v * dt / 4) % (road.length - 1) + (road.length - 1)) % (road.length - 1) || 0; const i0 = Math.floor(b.s), f = b.s - i0, a = road[i0], c = road[Math.min(road.length - 1, i0 + 1)];
      const x = a[0] + (c[0] - a[0]) * f, z = a[1] + (c[1] - a[1]) * f, h = Math.atan2(c[0] - a[0], c[1] - a[1]), lx = Math.cos(h) * b.lane, lz = -Math.sin(h) * b.lane;
      q.setFromEuler(e.set(0, h, Math.sin(k + b.s) * .04)); m.compose(v.set(x + lx, 0, z + lz), q, one); bikes.setMatrixAt(k, m);
      m.compose(v.set(x + lx - Math.sin(h) * .92, .95, z + lz - Math.cos(h) * .92), q, one); tail.setMatrixAt(k, m); });
      bikes.instanceMatrix.needsUpdate = tail.instanceMatrix.needsUpdate = true; });
    bikes.frustumCulled = tail.frustumCulled = false; bikes.castShadow = true; world.add(bikes, tail);
  }

  /* ================= round 3 (benchmarked against Forza Horizon 5 / GT7): road wear, people at work, life in the sky, far layers ================= */
  /* a strip along the line between two offsets; u runs across (0..1), v along (metres / vScale) */
  const S3 = [0]; for (let i = 1; i < N; i++) S3.push(S3[i - 1] + Math.hypot(PTS[i][0] - PTS[i - 1][0], PTS[i][1] - PTS[i - 1][1]));
  function ribbon(a, b, o0, o1, y, vScale){
    const pos = [], uv = [], idx = [];
    for (let i = a; i <= b; i++){ const [x0, z0] = P(i, o0(i)), [x1, z1] = P(i, o1(i)); pos.push(x0, y, z0, x1, y, z1); uv.push(0, S3[i] / vScale, 1, S3[i] / vScale); if (i < b){ const k = (i - a) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0){ for (let n = 0; n < idx.length; n += 3){ const t = idx[n + 1]; idx[n + 1] = idx[n + 2]; idx[n + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }

  /* ---- road wear: skid marks in the braking zones, marbles outside the line in the corners, repair patches, grid slots ---- */
  {
    const skid = tex(64, 512, (g, w, h) => { g.clearRect(0, 0, w, h); for (let k = 0; k < 9; k++){ const x = 6 + k * 6 + rng() * 3, a = .25 + rng() * .45, gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(10,10,12,0)'); gr.addColorStop(.15 + rng() * .2, `rgba(10,10,12,${a})`); gr.addColorStop(.7 + rng() * .2, `rgba(10,10,12,${a * .8})`); gr.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + rng() * 3, h); } });
    const marbles = tex(128, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let k = 0; k < 2600; k++){ const x = rng() * w, fx = Math.sin(Math.PI * x / w); if (rng() > fx) continue; g.fillStyle = `rgba(14,14,16,${.3 + rng() * .5})`; g.fillRect(x, rng() * h, 1 + rng() * 2, 1 + rng() * 2); } });
    marbles.wrapT = THREE.RepeatWrapping; skid.wrapT = THREE.ClampToEdgeWrapping;
    const decal = map => new THREE.MeshStandardMaterial({map, transparent:true, depthWrite:false, roughness:.95, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2});
    const sk = [];
    for (const [a, b] of [[455, 552], [470, 548], [662, 726], [676, 722]]) for (const lane of [-2.6, .4, 3.2]){ const w = 1.6 + rng() * .8, wob = rng() * 6; sk.push(ribbon(a, b, i => lane + Math.sin(i * .05 + wob) * .5 - w / 2, i => lane + Math.sin(i * .05 + wob) * .5 + w / 2, .075, (b - a) * 3)); }
    const skM = new THREE.Mesh(mergeGeometries(sk), decal(skid)); skM.receiveShadow = true; skM.renderOrder = 1; world.add(skM);
    const mb = []; for (const [a, b, s] of [[540, 640, 1], [585, 620, -1], [700, 760, 1]]) mb.push(ribbon(a, b, i => s * (HW[i] - 7), i => s * (HW[i] - 1.2), .072, 12));
    const mbM = new THREE.Mesh(mergeGeometries(mb), decal(marbles)); mbM.receiveShadow = true; mbM.renderOrder = 1; world.add(mbM);
    /* repair patches: slightly different asphalt rectangles */
    const pg = []; const patchM = new THREE.MeshStandardMaterial({color:'#3d3f43', roughness:.85, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1, transparent:true, opacity:.55, depthWrite:false});
    for (let k = 0; k < 34; k++){ const i = Math.floor(rng() * (N - 20)) + 10, off = (rng() - .5) * (HW[i] * 1.6), [x, z] = P(i, off), w = 1.5 + rng() * 4, l = 2 + rng() * 9;
      const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); g.rotateY(HD[i]); g.translate(x, .068, z); pg.push(g); }
    const pm = new THREE.Mesh(mergeGeometries(pg), patchM); pm.receiveShadow = true; world.add(pm);
    /* grid slots: white L marks staggered left / right behind the start line */
    const gm = [];
    for (let k = 0; k < 10; k++){ const i = SF - 6 - k * 4, s = k % 2 ? 1 : -1, [x, z] = P(i, s * 5);
      const a = new THREE.PlaneGeometry(5.6, .25); a.rotateX(-Math.PI / 2); a.rotateY(HD[i] + Math.PI / 2); a.translate(x, .08, z); gm.push(a);
      const b2 = new THREE.PlaneGeometry(.25, 2.2); b2.translate(0, -1.1, 0); b2.rotateX(-Math.PI / 2); b2.rotateY(HD[i]); const [x2, z2] = P(i, s * 5 + s * 2.7); b2.translate(x2, .08, z2); gm.push(b2); }
    world.add(new THREE.Mesh(mergeGeometries(gm), new THREE.MeshStandardMaterial({color:'#e9e8e2', roughness:.6, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2})));
  }

  /* ---- grass with mowing stripes (light / dark bands along the track), inside and outside the walls ---- */
  {
    const mow = tex(64, 256, (g, w, h) => { for (let y = 0; y < h; y += 32){ g.fillStyle = (y / 32) % 2 ? '#56723a' : '#4a6433'; g.fillRect(0, y, w, 32); } for (let k = 0; k < 3000; k++){ g.fillStyle = `rgba(${rng() < .5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(rng() * w, rng() * h, 1, 2); } });
    mow.wrapT = THREE.RepeatWrapping;
    const gm = new THREE.MeshStandardMaterial({map:mow, roughness:1, color:'#d8dccb'}), parts = [];
    for (const s of [-1, 1]){
      if (s > 0){ parts.push(ribbon(0, 500, i => s * (HW[i] + 9), i => s * (HW[i] + 25), .02, 40)); parts.push(ribbon(640, N - 1, i => s * (HW[i] + 9), i => s * (HW[i] + 25), .02, 40)); }
      else parts.push(ribbon(424, N - 1, i => s * (HW[i] + 9), i => s * (HW[i] + 25), .02, 40));   /* the pit lane takes this band along the main straight */
      parts.push(ribbon(0, N - 1, i => s * (HW[i] + 26), i => s * (HW[i] + 80), .015, 40));
    }
    const m = new THREE.Mesh(mergeGeometries(parts), gm); m.receiveShadow = true; world.add(m);
  }

  /* ---- people at work: marshal posts with a waving flag, photographers and a TV tower outside T1 ---- */
  {
    const bodyG = mergeGeometries([new THREE.BoxGeometry(.5, .75, .3).translate(0, 1.15, 0), new THREE.BoxGeometry(.42, .78, .26).translate(0, .4, 0), new THREE.SphereGeometry(.15, 8, 6).translate(0, 1.68, 0)]);
    const people = [], cols = [];
    const add = (x, z, ry, c) => { people.push([x, z, ry]); cols.push(c); };
    const posts = [];
    for (let i = 30; i < N - 10; i += 100) for (const s of [-1, 1]){ if (s > 0 && i > 480 && i < 660) continue; const off = s * (HW[i] + 24.6), [x, z] = P(i, off), ry = faceTrack(i)(s);
      const b = new THREE.BoxGeometry(2.4, 2.6, 2); b.translate(0, 1.3, .9); b.rotateY(ry); b.translate(x, 0, z); posts.push(b); add(...P(i + 1, s * (HW[i] + 23.4)), ry, '#e8701c'); }
    for (let k = 0; k < 9; k++){ const i = 520 + k * 12, [x, z] = P(i, HW[i] + 27), ry = faceTrack(i)(1); add(x, z, ry, k % 3 ? '#2b2d31' : '#e9e6dc'); }
    const pm = new THREE.Mesh(mergeGeometries(posts), new THREE.MeshStandardMaterial({color:'#e0dbd0', roughness:.8})); pm.castShadow = true; world.add(pm);
    const pi = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({roughness:.85}), people.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    people.forEach(([x, z, ry], k) => { q.setFromEuler(e.set(0, ry, 0)); m.compose(new THREE.Vector3(x, 0, z), q, one); pi.setMatrixAt(k, m); pi.setColorAt(k, new THREE.Color(cols[k])); });
    pi.castShadow = true; pi.computeBoundingSphere(); world.add(pi);
    /* photographers' long lenses */
    const lens = []; for (let k = 0; k < 9; k++){ const i = 520 + k * 12, [x, z] = P(i, HW[i] + 27), ry = faceTrack(i)(1); const l = new THREE.CylinderGeometry(.09, .11, .7, 8); l.rotateX(Math.PI / 2); l.translate(0, 1.5, .45); l.rotateY(ry); l.translate(x, 0, z); lens.push(l); }
    world.add(new THREE.Mesh(mergeGeometries(lens), new THREE.MeshStandardMaterial({color:'#e9e6dc', roughness:.4, metalness:.3})));
    /* marshal flags (green: track clear), waving */
    const flagG = new THREE.PlaneGeometry(.9, .6, 6, 1); flagG.translate(.45, 0, 0);
    const fm = animate(new THREE.MeshStandardMaterial({color:'#1fa34a', roughness:.7, side:THREE.DoubleSide}), 'float fx = position.x / .9; transformed.z += sin(uTime * 6.0 + position.x * 5.0 + float(gl_InstanceID)) * .12 * fx;');
    const marshals = people.filter((_, k) => cols[k] === '#e8701c'), fi = new THREE.InstancedMesh(flagG, fm, marshals.length);
    const fbase = marshals.map(([x, z, ry]) => [x, z, ry]);
    upd.push((dt, t) => { fbase.forEach(([x, z, ry], k) => { const sw = Math.sin(t * 3 + k) * .9; q.setFromEuler(e.set(0, ry + Math.PI / 2 + sw * .4, sw * .5)); m.compose(new THREE.Vector3(x, 2.05 + Math.abs(sw) * .25, z), q, one); fi.setMatrixAt(k, m); }); fi.instanceMatrix.needsUpdate = true; });
    fi.frustumCulled = false; world.add(fi);
    /* a TV camera tower outside T1: four legs, platform, a camera */
    { const i = 600, [x, z] = P(i, HW[i] + 40), parts2 = [];
      for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]){ const l = new THREE.BoxGeometry(.18, 14, .18); l.translate(x + a, 7, z + b); parts2.push(l); }
      for (let y = 2; y < 14; y += 3){ const c = new THREE.BoxGeometry(3.2, .12, .12); c.translate(x, y, z - 1.5); parts2.push(c); const c2 = c.clone(); c2.translate(0, 0, 3); parts2.push(c2); }
      const pl = new THREE.BoxGeometry(4, .3, 4); pl.translate(x, 14, z); parts2.push(pl); const cam = new THREE.BoxGeometry(.8, .7, 1.4); cam.translate(x, 14.8, z); parts2.push(cam);
      const tw = new THREE.Mesh(mergeGeometries(parts2), new THREE.MeshStandardMaterial({color:'#9aa0a6', roughness:.5, metalness:.6})); tw.castShadow = true; world.add(tw); }
  }

  /* ---- birds: a loose flock over the lake and T1, wings flapping in the vertex shader ---- */
  {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-.9, 0, 0, 0, 0, .25, 0, 0, -.2, .9, 0, 0, 0, 0, .25, 0, 0, -.2], 3)); g.computeVertexNormals();
    const mat = animate(new THREE.MeshBasicMaterial({color:'#1f1d1b', side:THREE.DoubleSide, fog:true}), 'transformed.y += abs(position.x) * sin(uTime * 9.0 + float(gl_InstanceID) * 1.3) * .55;');
    const n = 60, im = new THREE.InstancedMesh(g, mat, n), b = []; for (let k = 0; k < n; k++) b.push({c:k < 30 ? 0 : 1, r:20 + rng() * 40, ph:rng() * 6.28, h:35 + rng() * 30, sp:.12 + rng() * .08, s:1.3 + rng() * .6});
    const centres = [W.lake.slice(0, 2), P(560, -(HW[560] + 80))], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    upd.push((dt, t) => { b.forEach((o, k) => { const a = o.ph + t * o.sp, c = centres[o.c]; pv.set(c[0] + Math.cos(a) * o.r, o.h + Math.sin(t * .7 + o.ph) * 3, c[1] + Math.sin(a) * o.r); q.setFromEuler(e.set(0, -a, 0)); sv.setScalar(o.s); m.compose(pv, q, sv); im.setMatrixAt(k, m); }); im.instanceMatrix.needsUpdate = true; });
    im.frustumCulled = false; world.add(im);
  }

  /* ---- the flypast: four jets cross over the main straight trailing red / white / blue / yellow smoke (the flag's colours) ---- */
  {
    const jetG = mergeGeometries([new THREE.ConeGeometry(.9, 9, 8).rotateX(Math.PI / 2), new THREE.BoxGeometry(8, .25, 3).translate(0, 0, -1.2), new THREE.BoxGeometry(.25, 2.2, 1.6).translate(0, 1.1, -3.8)]);
    const jm = new THREE.MeshStandardMaterial({color:'#c9ced4', roughness:.4, metalness:.5}), jets = [], SEG = 140;
    const cols3 = ['#c8102e', '#f4f2ec', '#123f8c', '#f2c230'];
    for (let k = 0; k < 4; k++){
      const mesh = new THREE.Mesh(jetG, jm); world.add(mesh);
      const pos = new Float32Array(SEG * 2 * 3), col = new Float32Array(SEG * 2 * 4), idx = []; for (let s = 0; s < SEG - 1; s++){ const a = s * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage)); g.setIndex(idx);
      const trail = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:true})); trail.frustumCulled = false; world.add(trail);
      jets.push({mesh, g, pos, col, hist:[], c:new THREE.Color(cols3[k]), off:(k - 1.5) * 14, lag:Math.abs(k - 1.5) * 9});
    }
    const a0 = P(420, 0), a1 = P(-60, 0), dx = a1[0] - a0[0], dz = a1[1] - a0[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = uz, nz = -ux;
    upd.push((dt, t) => { const T = (t - 2.5) % 40, show = T > 0 && T < 16;
      jets.forEach(J => { J.mesh.visible = show && T * 75 - J.lag < L + 900;
        const d = T * 75 - J.lag - 300, x = a0[0] + ux * d + nx * J.off, z = a0[1] + uz * d + nz * J.off, y = 140 + Math.abs(J.off) * .4;
        J.mesh.position.set(x, y, z); J.mesh.rotation.set(0, Math.atan2(ux, uz), 0);
        if (!show){ J.hist.length = 0; } else { J.hist.unshift([x - ux * 5, y, z - uz * 5, T]); if (J.hist.length > SEG) J.hist.length = SEG; }
        for (let s = 0; s < SEG; s++){ const h = J.hist[Math.min(s, J.hist.length - 1)] || [x, y, z, T], age = T - h[3], w = 1.2 + age * 2.2, a = J.hist.length ? Math.max(0, .85 - age * .09) * (s < J.hist.length ? 1 : 0) : 0;
          J.pos.set([h[0] + nx * w, h[1] + age * .6, h[2] + nz * w, h[0] - nx * w, h[1] + age * .6, h[2] - nz * w], s * 6); for (const v of [0, 1]) J.col.set([J.c.r, J.c.g, J.c.b, a], (s * 2 + v) * 4); }
        J.g.attributes.position.needsUpdate = J.g.attributes.color.needsUpdate = true; }); });
  }

  /* ---- far layers: a ring of tree-line silhouettes and a line of power pylons with sagging wires ---- */
  {
    const tl = tex(1024, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#2f3b2a'; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4){ const y = h * (.45 + .25 * Math.sin(x * .021) * Math.sin(x * .007 + 1) + (rng() - .5) * .14); g.lineTo(x, y); } g.lineTo(w, h); g.fill(); });
    tl.wrapS = THREE.RepeatWrapping; tl.repeat.set(8, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1900, 1900, 70, 96, 1, true), new THREE.MeshStandardMaterial({map:tl, alphaTest:.5, side:THREE.BackSide, roughness:1, color:'#9aa592'}));
    ring.position.y = 35 - 6; world.add(ring);
    const hl = tex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#7f8fa3'); grd.addColorStop(1, '#a3a99f'); g.fillStyle = grd; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 4){ const y = h * (.62 - .34 * Math.pow(Math.max(0, Math.sin(x * .0042 + 1.3)), 1.6) - .14 * Math.sin(x * .013 + .4) * Math.sin(x * .0031) - .03 * Math.sin(x * .05) - (rng() - .5) * .02); g.lineTo(x, y); } g.lineTo(w, h); g.fill(); });
    hl.wrapS = THREE.RepeatWrapping; hl.repeat.set(3, 1);
    const hills = new THREE.Mesh(new THREE.CylinderGeometry(2750, 2750, 520, 96, 1, true), new THREE.MeshBasicMaterial({map:hl, transparent:true, depthWrite:false, side:THREE.BackSide, fog:true}));
    hills.position.y = 260 - 30; hills.renderOrder = -1; world.add(hills);
    const pyl = [], wires = []; const base = P(300, -(HW[300] + 700)), dir = [Math.sin(HD[300]), Math.cos(HD[300])];
    let prev = null;
    for (let k = -6; k <= 7; k++){ const x = base[0] + dir[0] * k * 260, z = base[1] + dir[1] * k * 260, parts3 = [];
      for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]){ const l = new THREE.CylinderGeometry(.25, .35, 44, 4); l.rotateZ(-a * .012); l.rotateX(b * .012); l.translate(x + a * .6, 22, z + b * .6); pyl.push(l); }
      for (const [y, w] of [[34, 22], [42, 15]]){ const arm = new THREE.BoxGeometry(w, .5, .5); arm.rotateY(HD[300] + Math.PI / 2); arm.translate(x, y, z); pyl.push(arm); }
      const top = [[x + Math.cos(HD[300]) * 10, 33.5, z - Math.sin(HD[300]) * 10], [x - Math.cos(HD[300]) * 10, 33.5, z + Math.sin(HD[300]) * 10], [x + Math.cos(HD[300]) * 7, 41.5, z - Math.sin(HD[300]) * 7], [x - Math.cos(HD[300]) * 7, 41.5, z + Math.sin(HD[300]) * 7]];
      if (prev) top.forEach((p, w) => { const q2 = prev[w]; for (let s = 0; s < 8; s++){ const t0 = s / 8, t1 = (s + 1) / 8, sag = t => 6 * 4 * t * (1 - t);
        wires.push(q2[0] + (p[0] - q2[0]) * t0, q2[1] + (p[1] - q2[1]) * t0 - sag(t0), q2[2] + (p[2] - q2[2]) * t0, q2[0] + (p[0] - q2[0]) * t1, q2[1] + (p[1] - q2[1]) * t1 - sag(t1), q2[2] + (p[2] - q2[2]) * t1); } });
      prev = top; }
    world.add(new THREE.Mesh(mergeGeometries(pyl), new THREE.MeshStandardMaterial({color:'#8d939a', roughness:.6, metalness:.5})));
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); world.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({color:'#3a3d42'})));
  }

  return {
    caps, hall,
    setRain(r){ cloudMat.uniforms.uRain.value = r; bowMat.uniforms.uAmt.value = .2 * (1 - Math.min(1, r * 2)); },
    update(dt, t, cam){ U.uTime.value = t; for (const f of upd) f(dt, t, cam); caps.update(dt); confetti.update(dt, t); }
  };
}
