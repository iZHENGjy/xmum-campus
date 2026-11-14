/* 雪邦赛车城 · 风格化章节的场景：主直道 → T1（两倍尺寸）
 *
 * 对标：一段别人用 Fable 5.2 做的风格化赛车视频。画面要点：饱和的蓝天、皮克斯式一团团的卡通云、暖色阳光；
 *   楼和地标简化但轮廓清楚；远处一座高塔当视觉焦点（这里是吉隆坡塔，T1 出弯后看见双子塔）。
 * 写实打底：PBR 材质、真实太阳阴影、天空反射在车漆上、远处有空气透视（越远越淡越蓝）。
 * 风格化：颜色饱和、形状简化、云是一团团的几何体（亮面暖白、暗面偏蓝紫）。
 * 雪邦元素：主看台的「叶子」顶棚（直道左边）、维修区大楼（右边）、发车龙门架、跨赛道的钢桁架天桥、T1 外侧看台和广告牌、棕榈树。
 * 没有图片和模型文件，全部现场生成。 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PTS } from './track-data.js';
import { N, clampI, RT, HD, HW, kerbOn, KERB } from './physics.js';

export const SUN_DIR = new THREE.Vector3(.55, .62, -.62).normalize();     /* behind-right of the camera on the straight, high: the car's rear and the clouds are lit */
const SKY_TOP = new THREE.Color('#3474c8'), SKY_HOR = new THREE.Color('#dfe3da'), FOG = new THREE.Color('#d6dbd4');

/* ---------- small helpers ---------- */
function prep(g, c, keepUV){
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k) || (k === 'uv' && !keepUV)) g.deleteAttribute(k);
  if (keepUV && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = c && c.isColor ? c : new THREE.Color(c || '#ffffff');
  for (let k = 0; k < n; k++) cc.toArray(a, k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/* local frame at track point i: x = metres to the left (+lat), y up, z = forward along the track */
const atI = (g, i) => { const j = clampI(Math.round(i)); g.rotateY(HD[j]); g.translate(PTS[j][0], 0, PTS[j][1]); return g; };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function distTrack(x, z, step = 4){ let b = 1e18, bi = 0; for (let i = 0; i < N; i += step){ const dx = x - PTS[i][0], dz = z - PTS[i][1], q = dx * dx + dz * dz; if (q < b){ b = q; bi = i; } } return [Math.sqrt(b), bi]; }

/* buildings: windows drawn from world position (no textures), fading to a flat tint far away so they never shimmer */
function windowMat(opt = {}){
  const m = new THREE.MeshStandardMaterial(Object.assign({vertexColors:true, roughness:.8, metalness:0}, opt));
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float side = step(abs(vWN.y), 0.5);
          vec2 g = abs(vWN.x) > abs(vWN.z) ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
          vec2 f = fract(g / vec2(4.2, 3.6));
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.32, f.y) * step(f.y, 0.82) * side * step(5.0, vWP.y);
          float far = smoothstep(350.0, 1100.0, length(vWP - cameraPosition));
          vec3 glass = vec3(0.10, 0.17, 0.26);
          diffuseColor.rgb = mix(mix(diffuseColor.rgb, glass, win * 0.8), mix(diffuseColor.rgb, glass, 0.3 * side), far); }`);
  };
  return m;
}

/* ---------- textures ---------- */
function canvasTex(w, h, draw, rep){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t; }
function crowdTex(rng){ return canvasTex(1024, 64, (g, w, h) => { g.fillStyle = '#2d5d9c'; g.fillRect(0, 0, w, h); g.fillStyle = '#244c82'; g.fillRect(0, h * .55, w, h * .45);
  const C = ['#ffd23a', '#ff6a2a', '#f4efe6', '#e8304a', '#f4efe6'];
  for (let n = 0; n < 260; n++){ g.fillStyle = C[(rng() * C.length) | 0]; const x = rng() * w, y = rng() * h; g.beginPath(); g.arc(x, y * .5 + h * .2, 4 + rng() * 2, 0, 7); g.fill(); } }); }
function pitTex(){ return canvasTex(1024, 160, (g, w, h) => {
  g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, w, h);
  const team = ['#e8304a', '#1f6fd6', '#ffd23a', '#16b39a', '#ff7a1a', '#7a3cff'];
  for (let k = 0; k < 6; k++){ const x = k * w / 6; g.fillStyle = team[k]; g.fillRect(x + 6, 6, w / 6 - 12, 22);
    g.fillStyle = '#1b2026'; g.fillRect(x + 12, 36, w / 6 - 24, h - 36); g.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 40; y < h; y += 9) g.fillRect(x + 12, y, w / 6 - 24, 2);
    g.fillStyle = '#ffffff'; g.font = 'italic 900 18px sans-serif'; g.textAlign = 'center'; g.fillText(String(k + 1 + ''), x + w / 12, 23); } }); }
const ADS = [['SEPANG', '#e8304a', '#ffffff'], ['XMUM', '#1f6fd6', '#ffd23a'], ['TEH TARIK', '#ff7a1a', '#ffffff'], ['NASI LEMAK', '#16b39a', '#ffffff'],
  ['BOOST', '#ffd23a', '#1b2026'], ['MAMAK 24H', '#7a3cff', '#ffffff'], ['MALAYSIA', '#ffffff', '#e8304a'], ['TURBO', '#1b2026', '#2fd0ff']];
function adTex(){ return canvasTex(2048, 128, (g, w, h) => { const cw = w / ADS.length;
  ADS.forEach(([t, bg, fg], k) => { g.fillStyle = bg; g.fillRect(k * cw, 0, cw, h); g.fillStyle = fg; g.font = 'italic 900 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, k * cw + cw / 2, h / 2 + 4, cw - 20);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(k * cw, h - 8, cw, 8); }); }); }
function boardTex(){ return canvasTex(1024, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0b1f4a'); gr.addColorStop(1, '#1d0b3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2fd0ff'; g.font = 'italic 900 130px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SEPANG', w / 2, h / 2 + 6);
  g.strokeStyle = '#ff3fa0'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); }); }

/* ---------- sky and clouds ---------- */
function makeSky(){
  const m = new THREE.ShaderMaterial({depthWrite:false, side:THREE.BackSide, uniforms:{uTop:{value:SKY_TOP}, uHor:{value:SKY_HOR}, uSun:{value:SUN_DIR}},
    vertexShader:'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader:`varying vec3 vD; uniform vec3 uTop, uHor, uSun;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHor, mix(vec3(0.36, 0.56, 0.82), uTop, smoothstep(0.1, 0.6, h)), smoothstep(0.0, 0.14, h));
        float s = max(dot(d, uSun), 0.0); c += vec3(1.0, 0.85, 0.6) * (pow(s, 6.0) * 0.18 + pow(s, 900.0) * 6.0);
        gl_FragColor = vec4(c, 1.0); }`});
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), m); sky.frustumCulled = false; sky.renderOrder = -10; return sky;
}
function makeClouds(rng){
  const parts = [], base = new THREE.SphereGeometry(1, 20, 14);
  const cloud = (cx, cy, cz, size) => {
    const n = 7 + (rng() * 9 | 0), blobs = [];
    for (let k = 0; k < n; k++){ const a = rng() * 6.283, r = Math.sqrt(rng()) * size * 1.15; blobs.push([Math.cos(a) * r, 0, Math.sin(a) * r * .55, size * (.45 + rng() * .45)]); }
    /* a tall head or two on top: the cumulus tower */
    for (let k = 0; k < 2 + (rng() * 3 | 0); k++) blobs.push([(rng() - .5) * size, size * (.35 + rng() * .35), (rng() - .5) * size * .4, size * (.5 + rng() * .35)]);
    for (const [bx, by, bz, br] of blobs){
      const g = base.clone(), p = g.attributes.position, nrm = g.attributes.normal, hA = new Float32Array(p.count), flat = -size * .18;
      for (let v = 0; v < p.count; v++){ let x = p.getX(v), y = p.getY(v), z = p.getZ(v);
        const bump = 1 + .07 * Math.sin(x * 5.3 + y * 3.1 + bx) * Math.sin(z * 4.7 + y * 2.3 + bz);
        x = bx + x * br * bump; y = by + y * br * bump * .85; z = bz + z * br * bump;
        if (y < flat){ y = flat; nrm.setXYZ(v, 0, -1, 0); }
        p.setXYZ(v, cx + x, cy + y, cz + z); hA[v] = (y - flat) / (size * 1.6); }
      g.setAttribute('aH', new THREE.BufferAttribute(hA, 1)); parts.push(g); }
  };
  /* a field of clouds all around, denser in the directions the camera looks (west along the straight, north after T1) */
  /* placed by direction as seen from the middle of the straight: popcorn cumulus from just above the hills to high in the frame */
  for (let k = 0; k < 170; k++){
    const az = k < 120 ? Math.PI + (rng() - .5) * 2.4 : k < 160 ? -Math.PI / 2 + (rng() - .5) * 2.0 : rng() * 6.283;
    const el = (3 + Math.pow(rng(), 1.05) * 40) * Math.PI / 180, d = 1600 + rng() * 3200;
    const x = -150 + Math.cos(az) * d * Math.cos(el), z = 200 + Math.sin(az) * d * Math.cos(el), y = 120 + d * Math.sin(el);
    cloud(x, y, z, (44 + rng() * 85) * d / 2400 * (1 + el * .6));
  }
  const m = new THREE.ShaderMaterial({uniforms:{uSun:{value:SUN_DIR}, uLit:{value:new THREE.Color(1.12, 1.05, .95)}, uShade:{value:new THREE.Color('#8392ad')}, uFog:{value:SKY_HOR}},
    vertexShader:'attribute float aH; varying vec3 vN; varying vec3 vW; varying float vH; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vH = aH; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader:`uniform vec3 uSun, uLit, uShade, uFog; varying vec3 vN; varying vec3 vW; varying float vH;
      void main(){ vec3 n = normalize(vN); float d = dot(n, uSun);
        vec3 c = mix(uShade, uLit, smoothstep(-0.15, 0.55, d));
        c *= mix(0.78, 1.0, smoothstep(0.0, 0.45, vH));
        vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(n, V)), 3.0);
        c += uLit * rim * 0.18;
        float f = smoothstep(1500.0, 7500.0, length(vW - cameraPosition));
        gl_FragColor = vec4(mix(c, uFog, f * 0.65), 1.0); }`});
  const mesh = new THREE.Mesh(mergeGeometries(parts), m); mesh.frustumCulled = false; mesh.renderOrder = -5; return mesh;
}

/* the Sepang grandstand leaf: a pointed lens (two arcs), thin, bevelled, its tips curled up */
function leafGeo(){ const L = 15, Wd = 8.5, sh = new THREE.Shape(); sh.moveTo(-L, 0); sh.quadraticCurveTo(0, Wd * 2, L, 0); sh.quadraticCurveTo(0, -Wd * 2, -L, 0);
  const g = new THREE.ExtrudeGeometry(sh, {depth:.35, bevelEnabled:true, bevelThickness:.35, bevelSize:.6, bevelSegments:2, curveSegments:18}); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let v = 0; v < p.count; v++){ const x = p.getX(v), z = p.getZ(v); p.setY(v, p.getY(v) + (x / L) ** 2 * 2.4 + (z / Wd) ** 2 * .8); }
  g.computeVertexNormals(); return g; }

/* ---------- landmarks ---------- */
/* Menara Kuala Lumpur: tapered shaft, the onion-like pod, the antenna (stylised and scaled up so it reads from the straight) */
function klTower(x, z, s, out){
  const prof = [[0, 14], [6, 13], [8, 9], [260, 6.2], [282, 7], [292, 15], [300, 24], [308, 25.5], [314, 22], [319, 26], [326, 25], [333, 19], [338, 12], [344, 8], [350, 4], [352, 2.2], [420, .8], [421, 0]];
  const pts = prof.map(([y, r]) => new THREE.Vector2(r * s, y * s));
  const g = new THREE.LatheGeometry(pts, 40); g.translate(x, 0, z); out('white', g, '#f3f1ea');
  /* the pod's glass bands and the antenna's red-white rings */
  for (const [y0, y1, r] of [[301, 307, 25.7], [319.5, 325.5, 26.2]]){ const b = new THREE.CylinderGeometry(r * s, r * s, (y1 - y0) * s, 40, 1, true); b.translate(x, (y0 + y1) / 2 * s, z); out('glassDark', b, '#2d5f86'); }
  for (let k = 0; k < 5; k++){ const y = 360 + k * 12, b = new THREE.CylinderGeometry(1.5 * s, 1.5 * s, 5 * s, 12); b.translate(x, y * s, z); out('white', b, '#e8304a'); }
  const tip = new THREE.SphereGeometry(2.4 * s, 12, 8); tip.translate(x, 421 * s, z); out('glow', tip, new THREE.Color(6, .6, .4));
}
/* the twin towers: stacked eight-pointed-star floors with set-backs, the skybridge, the pinnacles */
function twinTowers(x, z, s, out){
  const star = r => { const sh = new THREE.Shape(); for (let k = 0; k < 16; k++){ const a = k / 16 * 6.283, rr = k % 2 ? r * .82 : r; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; k ? sh.lineTo(px, py) : sh.moveTo(px, py); } return sh; };
  for (const dx of [-29, 29]){
    const tiers = [[0, 170, 23], [170, 260, 20], [260, 330, 17], [330, 360, 13], [360, 378, 9.5], [378, 392, 6.5]];
    for (const [y0, y1, r] of tiers){ const g = new THREE.ExtrudeGeometry(star(r * s), {depth:(y1 - y0) * s, bevelEnabled:false, curveSegments:1}); g.rotateX(-Math.PI / 2); g.translate(x + dx * s, y0 * s, z); out('steel', g, '#cfd6de');
      const ring = new THREE.CylinderGeometry(r * s * 1.02, r * s * 1.02, 2 * s, 24, 1); ring.translate(x + dx * s, y1 * s - s, z); out('steel', ring, '#9aa6b2'); }
    const sp = new THREE.CylinderGeometry(.6 * s, 3 * s, 60 * s, 10); sp.translate(x + dx * s, 422 * s, z); out('steel', sp, '#e7ecf0');
  }
  const br = new THREE.BoxGeometry(40 * s, 6 * s, 5 * s); br.translate(x, 172 * s, z); out('steel', br, '#9aa6b2');
}

/* ---------- the world ---------- */
export function buildToonWorld(scene, {ribbon, P, S, WALL, rng, renderer}){
  const batches = {};
  const out = (name, g, c, keepUV) => { (batches[name] || (batches[name] = [])).push(prep(g, c, keepUV)); };
  const T = {crowd:crowdTex(rng), pit:pitTex(), ads:adTex(), board:boardTex()};

  /* sky, light, fog */
  scene.background = SKY_HOR.clone(); scene.fog = new THREE.Fog(FOG, 700, 9000);
  const sky = makeSky(); scene.add(sky);
  scene.add(makeClouds(rng));
  const hemi = new THREE.HemisphereLight('#bcd8ff', '#a08f72', .8); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd8a2', 4.4); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {left:-110, right:110, top:110, bottom:-110, near:1, far:700}); sun.shadow.bias = -.0003; sun.shadow.normalBias = .04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  /* the paint reflects this sky: a small gradient scene baked into an environment map */
  { const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
    const sm = makeSky(); sm.geometry = new THREE.SphereGeometry(100, 32, 16); sm.material = sm.material.clone(); sm.material.vertexShader = 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'; es.add(sm);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({color:'#6f7a5a'})); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; es.add(gnd);
    scene.environment = pm.fromScene(es, .02).texture; scene.environmentIntensity = .55; pm.dispose(); }

  /* ground: warm green grass, a slight mottling so it is not a flat colour */
  const grass = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#93b458'; g.fillRect(0, 0, w, h); for (let n = 0; n < 1400; n++){ g.fillStyle = `rgba(${rng() < .5 ? '60,110,30' : '200,230,120'},${.06 + rng() * .08})`; const r = 4 + rng() * 14; g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, 7); g.fill(); } }, true);
  grass.repeat.set(400, 400);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({map:grass, roughness:1})); ground.rotation.x = -Math.PI / 2; ground.position.y = -.06; ground.receiveShadow = true; scene.add(ground);

  /* road: blue-grey asphalt, crisp white lines, lane dashes that stream past */
  const road = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#55575b'; g.fillRect(0, 0, w, h); g.fillStyle = '#34363a'; g.fillRect(w * .2, 0, w * .6, h);
    for (let n = 0; n < 9000; n++){ g.fillStyle = `rgba(${rng() < .5 ? '0,0,0' : '255,255,255'},${.025 + rng() * .045})`; g.fillRect(rng() * w, rng() * h, 2 + rng() * 2, 2 + rng() * 2); }
    /* rubber in the racing line, faint */
    const gr = g.createLinearGradient(w * .2, 0, w * .8, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.35, 'rgba(0,0,0,.12)'); gr.addColorStop(.6, 'rgba(0,0,0,0)'); gr.addColorStop(.75, 'rgba(0,0,0,.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * .2, 0, w * .6, h);
    g.fillStyle = '#f4f2ec'; g.fillRect(w * .2 - 9, 0, 12, h); g.fillRect(w * .8 - 3, 0, 12, h);
    for (const u of [.35, .5, .65]) g.fillRect(w * u - 5, 0, 10, h * .42);
  }, true);
  road.wrapS = THREE.ClampToEdgeWrapping;
  ribbon(i => [-(HW[i] + WALL), -HW[i], 0, HW[i], HW[i] + WALL], [0, .2, .5, .8, 1], .02, 30, new THREE.MeshStandardMaterial({map:road, roughness:.78, metalness:0, envMapIntensity:.4}));
  const kerb = canvasTex(64, 256, (g, w, h) => { for (let y = 0; y < h; y += 64){ g.fillStyle = (y / 64) % 2 ? '#f4f2ec' : '#e3262b'; g.fillRect(0, y, w, 64); } }, true);
  const km = new THREE.MeshStandardMaterial({map:kerb, roughness:.6});
  { let a = -1; for (let i = 0; i <= N; i++){ const on = i < N && kerbOn(i); if (on && a < 0) a = i; if (!on && a >= 0){ if (i - 1 > a) for (const s of [-1, 1]) ribbon(j => s > 0 ? [HW[j], HW[j] + KERB] : [-(HW[j] + KERB), -HW[j]], [0, 1], .05, 8, km, a, i - 1); a = -1; } } }

  /* barriers: concrete wall with red-white panels, then a catch fence on posts */
  const wallT = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#f2efe8'; g.fillRect(0, 0, w, h); g.fillStyle = '#e3262b'; g.fillRect(0, 0, w / 2, h * .62); g.fillStyle = '#f2efe8'; g.fillRect(w / 2, 0, w / 2, h * .62);
    g.fillStyle = '#c9c4ba'; g.fillRect(0, h * .62, w, h * .38); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, h - 5, w, 5); g.fillRect(w / 2 - 2, 0, 3, h); }, true);
  const wallM = new THREE.MeshStandardMaterial({map:wallT, roughness:.7});
  const fenceT = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(70,78,86,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); }, true);
  const fenceM = new THREE.MeshStandardMaterial({map:fenceT, transparent:true, alphaTest:.3, side:THREE.DoubleSide, roughness:.6, metalness:.5});
  for (const s of [-1, 1]){
    for (const [mat, y0, y1, extra, uS, vS] of [[wallM, 0, 1.2, 0, 4, 1], [fenceM, 1.2, 4.6, .15, 1.2, 3.4 / 1.2 / 1]]){
      const pos = [], uv = [], idx = [];
      for (let i = 0; i < N; i++){ const [x, z] = P(i, s * (HW[i] + WALL + extra)); pos.push(x, y0, z, x, y1, z); uv.push(S[i] / uS, 0, S[i] / uS, mat === fenceM ? (y1 - y0) / 1.2 : 1); if (i < N - 1){ const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat === wallM ? new THREE.MeshStandardMaterial({map:wallT, roughness:.7, side:THREE.DoubleSide}) : mat); m.castShadow = mat === wallM; m.receiveShadow = true; scene.add(m);
    }
    for (let i = 0; i < N; i += 2){ const g = new THREE.CylinderGeometry(.07, .07, 3.6, 6); g.translate(s * (HW[i] + WALL + .2), 2.9, 0); out('steel', atI(g, i), '#7c8792'); }
  }

  /* ---- left of the main straight: the main grandstand, stands under leaf-shaped canopies ---- */
  const CREAM = '#efe7d8', ORANGE = '#ff6a2a';
  for (let i = 4; i < 336; i += 12){ const s = 1, x0 = HW[i] + WALL + 4;
    out('cream', atI(box(5, 3.4, 36, s * (x0 + 2.5), 1.7, 0), i), CREAM);
    out('glow', atI(box(.2, .5, 36, s * (x0 - .05), 2.9, 0), i), new THREE.Color(4, 1.1, .35));            /* orange light strip on the podium */
    for (let k = 0; k < 14; k++){ const h = (k + 1) * 1.15; out('crowd', atI(box(2.3, h, 35.2, s * (x0 + 1.15 + k * 2.3), 3.4 + h / 2, 0), i), '#ffffff', true); }
    out('cream', atI(box(3, 24, 36, s * (x0 + 34), 12, 0), i), CREAM);
    out('cream', atI(box(3.2, 1.4, 36, s * (x0 + 34), 20.5, 0), i), ORANGE);
    /* the leaf: a thin lens of a roof, its nose tipped up over the track */
    const leaf = leafGeo(); leaf.rotateY(.5); leaf.rotateZ(-.1 * s); leaf.translate(s * (x0 + 15), 23.5, 0); out('leaf', atI(leaf, i), '#f7f5ef');
    for (const dz of [-6, 6]){ const c = new THREE.CylinderGeometry(.45, .6, 26, 8); c.translate(s * (x0 + 30), 14, dz); out('white', atI(c, i), '#e9e6de');
      const st = new THREE.CylinderGeometry(.3, .3, 18, 6); st.rotateZ(s * .9); st.translate(s * (x0 + 23), 22, dz); out('white', atI(st, i), '#e9e6de'); }
  }
  /* ---- right of the main straight: the pit building ---- */
  for (let i = 4; i < 360; i += 12){ const s = -1, x0 = HW[i] + WALL + 4;
    out('cream', atI(box(20, 6, 36, s * (x0 + 10), 3, 0), i), '#ece8df');
    const pf = new THREE.PlaneGeometry(36, 5.4); pf.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2); pf.translate(s * (x0 - .02), 2.7, 0); out('pit', atI(pf, i), '#ffffff', true);
    out('glass', atI(box(19, 5, 36, s * (x0 + 10.5), 8.5, 0), i), '#6ea8d4');
    out('glow', atI(box(.2, .18, 36, s * (x0 + .9), 6.05, 0), i), new THREE.Color(.4, 2.6, 3.4));
    out('glow', atI(box(.2, .18, 36, s * (x0 + .9), 10.95, 0), i), new THREE.Color(3.4, .5, 1.8));
    out('white', atI(box(25, .9, 36, s * (x0 + 9.5), 11.5, 0), i), '#f7f5ef');
    if ((i / 12 | 0) % 3 === 0) out('bld', atI(box(12, 5, 20, s * (x0 + 13), 14.5, 0), i), '#f2e6cf');
    for (const dz of [-17.5, 0, 17.5]) out('cream', atI(box(19.6, 5, .6, s * (x0 + 10.5), 8.5, dz), i), '#f4f1ea');
  }
  /* paddock and team buildings behind the pits, hotel blocks beyond */
  for (let i = 10; i < 360; i += 20){ const s = -1, x0 = HW[i] + WALL + 40 + rng() * 30, w = 18 + rng() * 22, h = 8 + rng() * 14, d = 20 + rng() * 25;
    out('bld', atI(box(w, h, d, s * (x0 + w / 2), h / 2, 0), i), ['#f0e2c8', '#e6eef4', '#f4d9c2', '#dfe8d8'][(rng() * 4) | 0]); }

  /* ---- gantries and bridges: things you dive under ---- */
  const gantry = (i, h, panel) => { for (const s of [-1, 1]) out('steel', atI(box(1.2, h, 1.2, s * (HW[i] + WALL + 1), h / 2, 0), i), '#3b4350');
    out('steel', atI(box(2 * (HW[i] + WALL + 2), 1.2, 1.4, 0, h, 0), i), '#3b4350');
    if (panel){ const pf = new THREE.PlaneGeometry(26, 6.5); pf.rotateY(Math.PI); pf.translate(0, h - 3.6, -.75); out('board', atI(pf, i), '#ffffff', true);
      for (let k = 0; k < 5; k++){ const l = new THREE.SphereGeometry(.45, 10, 8); l.translate(-6 + k * 3, h + 1.3, -.8); out('glow', atI(l, i), new THREE.Color(5, .3, .2)); } } };
  gantry(74, 11, true); gantry(330, 11, true);
  const truss = (i, h, c) => { const span = HW[i] + WALL + 10, depth = 4.2, top = 4.2, n = Math.round(2 * span / 5);
    for (const z of [-depth / 2, depth / 2]){ out('truss', atI(box(2 * span, .5, .5, 0, h, z), i), c); out('truss', atI(box(2 * span, .5, .5, 0, h + top, z), i), c);
      for (let k = 0; k <= n; k++){ const x = -span + k * 2 * span / n; out('truss', atI(box(.32, top, .32, x, h + top / 2, z), i), c);
        if (k < n){ const L = Math.hypot(2 * span / n, top), d = box(L, .3, .3, 0, 0, 0); d.rotateZ((k % 2 ? 1 : -1) * Math.atan2(top, 2 * span / n)); d.translate(x + span / n, h + top / 2, z); out('truss', atI(d, i), c); } } }
    out('white', atI(box(2 * span, .4, depth, 0, h - .1, 0), i), '#d9dde2');
    for (const s of [-1, 1]){ out('cream', atI(box(5, h + top + 2, 5, s * (span + 2.5), (h + top + 2) / 2, 0), i), '#ece8df'); out('glow', atI(box(5.1, .3, 5.1, s * (span + 2.5), h + top + 1.6, 0), i), new THREE.Color(.4, 2.6, 3.4)); } };
  truss(205, 10, '#f0f2f4'); truss(452, 10, '#e9edf0');

  /* ---- T1: the outside (left), a grandstand facing the corner, tyre walls, boards; the inside run-off ---- */
  for (let i = 480; i < 640; i += 12){ const s = 1, x0 = HW[i] + WALL + 14;
    out('cream', atI(box(4, 3, 34, s * (x0 + 2), 1.5, 0), i), CREAM);
    for (let k = 0; k < 9; k++){ const h = (k + 1) * 1.2; out('crowd', atI(box(2.3, h, 33.5, s * (x0 + 1.15 + k * 2.3), 3 + h / 2, 0), i), '#ffffff', true); }
    const roof = box(24, .7, 34, s * (x0 + 11), 18, 0); roof.rotateZ(0); out('white', atI(roof, i), '#f7f5ef');
    out('glow', atI(box(.3, .3, 34, s * (x0 - .9), 17.6, 0), i), new THREE.Color(3.6, .55, 1.9));
    for (const dz of [-16, 0, 16]) out('steel', atI(box(.6, 15, .6, s * (x0 + 22), 10.5, dz), i), '#3b4350');
  }
  /* advertising boards on top of the wall and tyre stacks, from the end of the stands to T1 */
  for (let i = 336; i < 660; i += 2) for (const s of [-1, 1]){
    if (s < 0 && i < 362) continue;
    const b = box(.25, 1.1, 5.9, s * (HW[i] + WALL + .45), 1.75, 0), uv = b.attributes.uv, cell = ((i / 2 | 0) + (s > 0 ? 3 : 0)) % ADS.length;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (cell + uv.getX(v)) / ADS.length);
    out('ads', atI(b, i), '#ffffff', true);
  }
  for (let i = 500; i < 600; i += 1){ const s = 1; for (let r = 0; r < 2; r++){ const t = new THREE.CylinderGeometry(.42, .42, .28 * 4, 10); t.translate(s * (HW[i] + WALL + 1.3 + r * .85), .56, (r ? 1.5 : 0)); out('tyre', atI(t, i), (i + r) % 2 ? '#1c1d20' : '#e3262b'); } }

  /* ---- hills, Bukit Nanas under the tower ---- */
  const hills = [];
  const hill = (x, z, rx, ry, rz, c) => { const g = new THREE.SphereGeometry(1, 40, 14, 0, 6.283, 0, Math.PI / 2), p = g.attributes.position;
    for (let v = 0; v < p.count; v++){ const a = p.getX(v), b = p.getY(v), cc = p.getZ(v); const n = 1 + .06 * Math.sin(a * 6 + x) * Math.cos(cc * 5 + z); p.setXYZ(v, x + a * rx * n, b * ry * n, z + cc * rz * n); }
    g.computeVertexNormals(); out('hill', g, c); hills.push({x, z, rx, ry, rz}); };
  const KL = [-1180, 340], TT = [120, -1950];
  hill(KL[0], KL[1], 420, 60, 360, '#8aab4c');
  for (let k = 0; k < 26; k++){ const a = rng() * 6.283, d = 900 + rng() * 2600, x = 250 + Math.cos(a) * d * 1.3, z = -250 + Math.sin(a) * d;
    if (distTrack(x, z, 8)[0] < 520) continue; hill(x, z, 280 + rng() * 520, 40 + rng() * 120, 240 + rng() * 420, ['#8fae4f', '#9fb457', '#b3b663', '#7fa449'][(rng() * 4) | 0]); }
  const hillY = (x, z) => { let y = 0; for (const h of hills){ const q = 1 - ((x - h.x) / h.rx) ** 2 - ((z - h.z) / h.rz) ** 2; if (q > 0) y = Math.max(y, h.ry * Math.sqrt(q)); } return y; };

  /* ---- landmarks ---- */
  klTower(KL[0], KL[1], 1.9, out);
  twinTowers(TT[0], TT[1], 1.3, out);

  /* ---- the city: low near, a skyline around the two landmarks, everything hazy blue with distance ---- */
  const pastel = ['#f3e3c6', '#e9eef2', '#f6d7c0', '#dfe9df', '#f0d0a8', '#d8e2ee', '#fbf1dd', '#e7d3e8'];
  /* a tower: a podium, a shaft with one or two set-backs, a lighter crown; some round, some with a slanted top */
  const bld = (x, z, w, d, h, yaw) => { const y0 = hillY(x, z) - 2, c = pastel[(rng() * pastel.length) | 0], put = (g, cc) => { g.rotateY(yaw); g.translate(x, y0, z); out('bld', g, cc); };
    if (h < 40){ put(box(w, h, d, 0, h / 2, 0), c); if (rng() < .5) put(box(w * .4, 3, d * .4, w * .2, h + 1.5, 0), '#d9dde0'); return; }
    const pod = Math.min(14, h * .15); put(box(w * 1.3, pod, d * 1.3, 0, pod / 2, 0), '#e9e4da');
    const round = rng() < .25, s1 = .65 + rng() * .2, h1 = h * (.55 + rng() * .2);
    if (round){ const cy = new THREE.CylinderGeometry(w * .5, w * .52, h1 - pod, 20); cy.translate(0, pod + (h1 - pod) / 2, 0); put(cy, c); const cy2 = new THREE.CylinderGeometry(w * .5 * s1, w * .5 * s1, h - h1, 20); cy2.translate(0, h1 + (h - h1) / 2, 0); put(cy2, c); }
    else { put(box(w, h1 - pod, d, 0, pod + (h1 - pod) / 2, 0), c); put(box(w * s1, h - h1, d * s1, 0, h1 + (h - h1) / 2, 0), c); }
    put(box(w * s1 * 1.04, 2.5, d * s1 * 1.04, 0, h1 + 1.2, 0), '#ffffff');
    if (rng() < .5){ const cr = new THREE.ConeGeometry(w * s1 * .55, h * .12, 4); cr.rotateY(Math.PI / 4); cr.translate(0, h + h * .06, 0); put(cr, '#eef2f5'); }
    else { const m = new THREE.CylinderGeometry(.6, .6, h * .15, 6); m.translate(0, h + h * .075, 0); put(m, '#dfe3e6'); } };
  for (let k = 0; k < 520; k++){
    const cl = k < 160 ? KL : k < 260 ? TT : null;
    let x, z; if (cl){ const a = rng() * 6.283, r = 120 + Math.pow(rng(), .7) * 900; x = cl[0] + Math.cos(a) * r; z = cl[1] + Math.sin(a) * r; }
    else { x = -4200 + rng() * 7600; z = -4200 + rng() * 6400; }
    const [d] = distTrack(x, z, 6); if (d < 330) continue;
    if (Math.hypot(x - KL[0], z - KL[1]) < 110 || Math.hypot(x - TT[0], z - TT[1]) < 120) continue;
    const near = cl ? Math.max(0, 1 - Math.hypot(x - cl[0], z - cl[1]) / 1000) : 0;
    const h = 14 + Math.pow(rng(), 2.2) * 70 + near * rng() * 220 + (d > 1500 ? rng() * 50 : 0);
    bld(x, z, 22 + rng() * 40, 22 + rng() * 40, h, rng() * 3.14); }

  /* ---- trees: round broadleaf and palms (instanced) ---- */
  const round = [], palms = [];
  for (let k = 0; k < 5200 && round.length + palms.length < 3400; k++){
    const x = -2600 + rng() * 4400, z = -1600 + rng() * 2600, [d, bi] = distTrack(x, z, 6);
    const hw = HW[bi] + WALL; if (d < hw + 9) continue;
    if (bi < 360 && d < hw + 130) continue;           /* the grandstand and pit buildings */
    if (bi > 470 && bi < 650 && d < hw + 46 && rng() < .9) continue;
    if (Math.hypot(x - KL[0], z - KL[1]) < 40) continue;
    const y = hillY(x, z);
    (d < hw + 60 && rng() < .55 ? palms : round).push([x, y, z, .8 + rng() * .6, rng() * 6.28]);
  }
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), te = new THREE.Euler(), tc = new THREE.Color();
  { const canopy = new THREE.SphereGeometry(1, 12, 9); const p = canopy.attributes.position; for (let v = 0; v < p.count; v++){ const a = p.getX(v), b = p.getY(v), c = p.getZ(v), n = 1 + .12 * Math.sin(a * 4.1 + c * 3.3) * Math.cos(b * 3.7); p.setXYZ(v, a * n, b * n * .9 + 1, c * n); } canopy.computeVertexNormals();
    const trunk = new THREE.CylinderGeometry(.25, .4, 3.4, 6).translate(0, 1.7, 0);
    const cm = new THREE.InstancedMesh(canopy, new THREE.MeshStandardMaterial({roughness:.85}), round.length), trm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({color:'#7a5a3a', roughness:.9}), round.length);
    const greens = ['#4f9a35', '#5fae3c', '#78bb44', '#3f8a33', '#8bc34e'];
    round.forEach(([x, y, z, s, r], k) => { const sc = 4.5 * s; tm.compose(tv.set(x, y + 2.2 * s, z), tq.setFromEuler(te.set(0, r, 0)), ts.set(sc, sc * .9, sc)); cm.setMatrixAt(k, tm); cm.setColorAt(k, tc.set(greens[k % greens.length]));
      tm.compose(tv.set(x, y, z), tq, ts.set(s * 1.4, s * 1.4, s * 1.4)); trm.setMatrixAt(k, tm); });
    cm.castShadow = trm.castShadow = true; cm.receiveShadow = true; scene.add(cm, trm); }
  { const trunk = new THREE.CylinderGeometry(.22, .34, 11, 7, 6), p = trunk.attributes.position; for (let v = 0; v < p.count; v++){ const y = p.getY(v) + 5.5; p.setXYZ(v, p.getX(v) + Math.pow(y / 11, 2) * 1.2, y, p.getZ(v)); } trunk.computeVertexNormals();
    const fronds = []; for (let k = 0; k < 9; k++){ const f = new THREE.PlaneGeometry(1.3, 5.2, 1, 6), q = f.attributes.position; for (let v = 0; v < q.count; v++){ const t = (q.getY(v) + 2.6) / 5.2; q.setXYZ(v, q.getX(v) * (1 - Math.abs(t - .45)) * 1.4, -t * t * 2.2 + t * .8, t * 5.2); }
      f.rotateY(k / 9 * 6.283); f.translate(1.2, 11, 0); fronds.push(f); }
    const crown = mergeGeometries(fronds); crown.computeVertexNormals();
    const pm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({color:'#9b7a55', roughness:.9}), palms.length), cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({color:'#4f9f3a', roughness:.8, side:THREE.DoubleSide}), palms.length);
    palms.forEach(([x, y, z, s, r], k) => { tm.compose(tv.set(x, y, z), tq.setFromEuler(te.set(0, r, 0)), ts.set(s, s, s)); pm.setMatrixAt(k, tm); cm.setMatrixAt(k, tm); });
    pm.castShadow = cm.castShadow = true; scene.add(pm, cm); }

  /* ---- power pylons on the hills (the benchmark has them; they give the middle distance scale) ---- */
  const pylon = (x, z) => { const y0 = hillY(x, z), H = 46;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){ const l = new THREE.CylinderGeometry(.35, .35, H, 5); l.rotateZ(a * .1); l.rotateX(-b * .1); l.translate(x + a * 2.6, y0 + H / 2, z + b * 2.6); out('steel', l, '#c9ced4'); }
    for (const y of [24, 34, 42]){ out('steel', box(y === 34 ? 22 : 16, .6, .6, x, y0 + y, z), '#c9ced4'); } };
  for (let k = 0; k < 9; k++) pylon(-900 - k * 210, 700 - k * 40 + (k % 2) * 30);

  /* ---- materials and meshes ---- */
  const MATS = {
    cream:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.8}),
    white:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.55}),
    leaf:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.85, emissive:'#c6d2dc', emissiveIntensity:.35}),
    steel:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.45, metalness:.5}),
    truss:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.45, metalness:.3}),
    glass:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.08, metalness:.75, envMapIntensity:1.3}),
    glassDark:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.15, metalness:.6}),
    glow:new THREE.MeshBasicMaterial({vertexColors:true, toneMapped:false}),
    crowd:new THREE.MeshStandardMaterial({vertexColors:true, map:T.crowd, roughness:.95, color:'#c9c9c9'}),
    pit:new THREE.MeshStandardMaterial({vertexColors:true, map:T.pit, roughness:.7}),
    ads:new THREE.MeshStandardMaterial({vertexColors:true, map:T.ads, roughness:.5, emissive:'#ffffff', emissiveMap:T.ads, emissiveIntensity:.25}),
    board:new THREE.MeshBasicMaterial({vertexColors:true, map:T.board, color:new THREE.Color(2.2, 2.2, 2.2)}),
    tyre:new THREE.MeshStandardMaterial({vertexColors:true, roughness:.85}),
    hill:new THREE.MeshStandardMaterial({vertexColors:true, roughness:1}),
    bld:windowMat()
  };
  for (const [name, list] of Object.entries(batches)){
    const g = mergeGeometries(list); if (!g){ console.warn('merge failed', name); continue; }
    const m = new THREE.Mesh(g, MATS[name]); m.castShadow = !['glow', 'board', 'hill'].includes(name); m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  }

  return {
    sun, sky,
    follow(x, z, fx = 0, fz = 0){
      const cx = x + fx * 60, cz = z + fz * 60;
      sun.position.set(cx + SUN_DIR.x * 300, SUN_DIR.y * 300, cz + SUN_DIR.z * 300); sun.target.position.set(cx, 0, cz);
      sky.position.set(x, 0, z);
    }
  };
}
