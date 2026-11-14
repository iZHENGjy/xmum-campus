/* 雪邦赛车城 demo · 场景：赛道、路肩、缓冲区、护墙和防护网、嘉庚风格的门楼和看台、维修区、湖、油棕、远处的吉隆坡天际线、傍晚的天空
 * 贴图全部用 canvas 现场画（没有图片文件）；材质是 PBR（MeshStandard / MeshPhysical），湿地面靠粗糙度、颜色和积水片。 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PTS } from './track-data.js';
import { N, RT, HD, HW, KERB, K, kerbOn, clampI } from './physics.js';

const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(20261113);
export const SF = 60;          /* the gate / start line index */
export const GRID = 40;        /* where the cars line up */

/* ---------- procedural textures ---------- */
let ANISO = 8;
function canvasTex(w, h, draw, o = {}){
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace; if (o.repeat) t.repeat.set(...o.repeat); return t;
}
function noiseFill(g, w, h, base, spread, dots, dotSize){
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let n = 0; n < dots; n++){ const v = (rng() - .5) * spread; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; const s = dotSize * (.5 + rng()); g.fillRect(rng() * w, rng() * h, s, s); }
}
/* a tangent-space normal map from a random height field (cheap Sobel) */
function normalTex(size, bumps, strength, repeat, r0 = 1, rr = 3){
  const hgt = new Float32Array(size * size);
  for (let n = 0; n < bumps; n++){ const cx = rng() * size, cy = rng() * size, r = r0 + rng() * rr, a = (rng() - .3);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++){ const d = Math.hypot(x, y); if (d > r) continue; const px = ((Math.floor(cx) + x) % size + size) % size, py = ((Math.floor(cy) + y) % size + size) % size; hgt[py * size + px] += a * (1 - d / r); } }
  return canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size), H = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++){
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
      img.data[o] = (-dx / l * .5 + .5) * 255; img.data[o + 1] = (-dy / l * .5 + .5) * 255; img.data[o + 2] = (1 / l * .5 + .5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, {srgb:false, repeat});
}
function makeTextures(){
  return {
    asphalt: canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, '#55575c', .08, 60000, 1); for (let n = 0; n < 900; n++){ g.fillStyle = `rgba(${rng() < .5 ? '255,255,255' : '0,0,0'},${.04 + rng() * .05})`; g.fillRect(rng() * w, rng() * h, 1, 1); } }, {}),
    asphaltR: canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#d0d0d0', .3, 9000, 2); }, {srgb:false}),
    asphaltN: normalTex(256, 7000, 2.2, null, .5, .8),
    runoff: canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, '#5a5c60', .2, 20000, 2); }, {}),
    grass: canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, '#4a6331', .32, 40000, 3); for (let n = 0; n < 60; n++){ g.fillStyle = `rgba(${rng() < .5 ? '90,70,40' : '120,150,70'},.12)`; g.beginPath(); g.ellipse(rng() * w, rng() * h, 20 + rng() * 60, 10 + rng() * 40, rng() * 3, 0, 7); g.fill(); } }, {}),
    concrete: canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#b9b8b2', .18, 8000, 2); }, {}),
    kerb: canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#c9221c'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f2ee'; g.fillRect(0, h / 2, w, h / 2); g.fillStyle = 'rgba(0,0,0,.15)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1); }, {}),
    tile: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7f2a17'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 8; x < w; x += 16){ const gr = g.createLinearGradient(x, y, x + 16, y); gr.addColorStop(0, '#8e3219'); gr.addColorStop(.5, '#c4532c'); gr.addColorStop(1, '#7a2814'); g.fillStyle = gr; g.fillRect(x + 1, y, 14, 15); } }, {}),
    gravel: canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#a89878', .35, 26000, 2); }, {}),
    frond: canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#6a7a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      for (let x = 6; x < w - 4; x += 5){ const L = (h / 2 - 2) * Math.sin(Math.PI * x / w) * (.75 + rng() * .25); for (const s of [-1, 1]){ g.strokeStyle = `hsl(${88 + rng() * 14},${38 + rng() * 14}%,${24 + rng() * 10}%)`; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + 7, h / 2 + s * L); g.stroke(); } } }, {}),
    wall: canvasTex(512, 256, (g, w, h) => { noiseFill(g, w, h, '#d6cfc1', .1, 6000, 2);
      g.fillStyle = '#d8cdb8'; g.fillRect(0, h - 26, w, 26); g.fillRect(0, 0, w, 14);
      for (let x = 24; x < w; x += 64){ g.fillStyle = '#2b3138'; g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x, 80); g.arc(x + 16, 80, 16, Math.PI, 0); g.lineTo(x + 32, h - 40); g.closePath(); g.fill(); g.fillStyle = '#c9b48f'; g.fillRect(x - 4, h - 42, 40, 4); }
      /* weathering: dark under the eaves, rain streaks, a muddy foot */
      const eave = g.createLinearGradient(0, 0, 0, h * .18); eave.addColorStop(0, 'rgba(20,16,12,.38)'); eave.addColorStop(1, 'rgba(20,16,12,0)'); g.fillStyle = eave; g.fillRect(0, 0, w, h * .18);
      for (let n = 0; n < 40; n++){ const x = rng() * w, len = 30 + rng() * 120, gr = g.createLinearGradient(0, 14, 0, 14 + len); gr.addColorStop(0, 'rgba(60,52,40,.22)'); gr.addColorStop(1, 'rgba(60,52,40,0)'); g.fillStyle = gr; g.fillRect(x, 14, 1 + rng() * 2.5, len); }
      const foot = g.createLinearGradient(0, h - 34, 0, h); foot.addColorStop(0, 'rgba(70,58,40,0)'); foot.addColorStop(1, 'rgba(70,58,40,.45)'); g.fillStyle = foot; g.fillRect(0, h - 34, w, 34); }, {}),
    windows: canvasTex(256, 512, (g, w, h) => { g.fillStyle = '#1d232b'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 12) for (let x = 4; x < w; x += 10){ const r = rng(); g.fillStyle = r < .3 ? '#ffcf8a' : r < .38 ? '#bfe3ff' : '#2a313a'; g.fillRect(x, y, 6, 7); } }, {}),
    fence: canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(200,205,210,1)'; g.lineWidth = 2; for (let i = -64; i < 128; i += 12){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); } }, {}),
    waterN: normalTex(256, 1800, 1.4),
    band: canvasTex(2048, 128, (g, w, h) => {
      const ads = [['#103b7a', '#f4ead6', 'XMUM 厦门大学马来西亚分校'], ['#c8102e', '#ffffff', 'CLASS OF 2026'], ['#f2c230', '#1b1d21', '奶娃 NAIWA'], ['#1b1d21', '#f2c230', 'MAMAK 24/7 · 拉茶'],
        ['#f4f4f0', '#c8102e', 'SELAMAT GRADUASI'], ['#0f3a27', '#f4ead6', '雪邦赛车城 SEPANG'], ['#7f2a17', '#f4ead6', '毕业快乐'], ['#1f4e8c', '#ffffff', 'KLIA EXPRESS ✈']];
      ads.forEach(([bg, fg, t], k) => { const x = k * 256; g.fillStyle = bg; g.fillRect(x, 0, 256, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, 0, 256, 10);
        g.fillStyle = fg; g.font = '800 34px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 128, h / 2 + 2, 236); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 254, 0, 2, h); }); }, {}),
    sign: canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#7f2a17'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4ead6'; g.font = '700 64px "Noto Serif SC","Songti SC","SimSun",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('雪邦赛车城 · XMUM', w / 2, h / 2 + 4); }, {})
  };
}

/* ---------- geometry along the line ---------- */
let SCUM = null;
function cum(){ if (SCUM) return SCUM; SCUM = [0]; for (let i = 1; i < N; i++) SCUM.push(SCUM[i - 1] + Math.hypot(PTS[i][0] - PTS[i - 1][0], PTS[i][1] - PTS[i - 1][1])); return SCUM; }
const P = (i, off) => { const j = clampI(i); return [PTS[j][0] + RT[j][0] * off, PTS[j][1] + RT[j][1] * off]; };
/* a flat strip between two lateral offsets (functions of the index), from index a to b */
function strip(a, b, off0, off1, y, vScale, uScale = 1){
  const pos = [], uv = [], idx = [], S = cum();
  for (let i = a; i <= b; i++){
    const [x0, z0] = P(i, off0(i)), [x1, z1] = P(i, off1(i));
    pos.push(x0, y, z0, x1, y, z1); uv.push(0, S[i] / vScale, uScale, S[i] / vScale);
    if (i < b){ const k = (i - a) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  /* make sure the strip faces up whichever side was given first */
  if (g.attributes.normal.getY(0) < 0){ for (let n = 0; n < idx.length; n += 3){ const t = idx[n + 1]; idx[n + 1] = idx[n + 2]; idx[n + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
/* a vertical wall along an offset */
function wallStrip(a, b, off, y0, y1, vScale){
  const pos = [], uv = [], idx = [], S = cum();
  for (let i = a; i <= b; i++){ const [x, z] = P(i, off(i)); pos.push(x, y0, z, x, y1, z); uv.push(S[i] / vScale, 0, S[i] / vScale, 1);
    if (i < b){ const k = (i - a) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* a hip roof (four sloping faces) over a w × d box, ridge along x */
function hipRoof(w, d, h, over = 1.2){
  const W = w / 2 + over, D = d / 2 + over, r = Math.max(0, W - D);
  const v = [[-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D], [-r, h, 0], [r, h, 0]];
  const f = [[0, 4, 5, 1], [1, 5, 2], [2, 5, 4, 3], [3, 4, 0]], pos = [], uv = [];
  for (const q of f){ const tri = q.length === 4 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [q];
    for (const t of tri) for (const k of t){ pos.push(...v[k]); uv.push(v[k][0] / 4 + v[k][2] / 4, v[k][1] / 2 + Math.abs(v[k][2]) / 4); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  /* faces were wound inconsistently: draw both sides */
  return g;
}

/* ---------- build ---------- */
export function buildWorld(renderer, scene, Q){
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const TX = makeTextures(), world = new THREE.Group(); scene.add(world);
  const shadowy = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };
  const add = (g, mat, cast) => { const m = shadowy(new THREE.Mesh(g, mat), cast); world.add(m); return m; };

  /* --- sky, sun, environment --- */
  const sky = new Sky(); sky.scale.setScalar(8000); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 4; su.rayleigh.value = 1.6; su.mieCoefficient.value = .0025; su.mieDirectionalG.value = .8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 7), THREE.MathUtils.degToRad(-128));   /* low sun in the south-west */
  su.sunPosition.value.copy(sunDir);
  const sun = new THREE.DirectionalLight('#ffc98f', 3.2); sun.castShadow = true; scene.add(sun, sun.target);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .4;
  const hemi = new THREE.HemisphereLight('#b9c9e6', '#4a4031', .85); scene.add(hemi);
  scene.fog = new THREE.FogExp2('#b3a594', .00026);
  /* rain: a grey overcast layer inside the sky (the sky model itself cannot do clouds) */
  const overcast = new THREE.Mesh(new THREE.SphereGeometry(3400, 32, 16), new THREE.MeshBasicMaterial({color:'#8a9097', side:THREE.BackSide, transparent:true, opacity:0, fog:false, depthWrite:false}));
  overcast.renderOrder = -1; scene.add(overcast);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  function updateEnv(){ const s2 = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(1000); Object.keys(su).forEach(k => sk.material.uniforms[k].value = su[k].value); s2.add(sk); const oc = overcast.clone(); oc.scale.setScalar(.25); s2.add(oc);
    if (envRT) envRT.dispose(); envRT = pmrem.fromScene(s2, 0, .1, 2000); scene.environment = envRT.texture; }
  updateEnv();

  /* --- materials --- */
  const road = new THREE.MeshStandardMaterial({map:TX.asphalt, roughnessMap:TX.asphaltR, normalMap:TX.asphaltN, roughness:.92, metalness:0, normalScale:new THREE.Vector2(.12, .12), vertexColors:true});
  const runoff = new THREE.MeshStandardMaterial({map:TX.runoff, roughnessMap:TX.asphaltR, normalMap:TX.asphaltN, roughness:.95});
  const paint = new THREE.MeshStandardMaterial({color:'#f1f0ea', roughness:.55});
  const kerbM = new THREE.MeshStandardMaterial({map:TX.kerb, roughness:.6, normalMap:TX.asphaltN, normalScale:new THREE.Vector2(.3, .3)});
  const grass = new THREE.MeshStandardMaterial({map:TX.grass, roughness:1, color:'#c9ccb9'});
  const concrete = new THREE.MeshStandardMaterial({map:TX.concrete, roughness:.9, side:THREE.DoubleSide});
  const band = new THREE.MeshStandardMaterial({map:TX.band, roughness:.7, side:THREE.DoubleSide});
  const tile = new THREE.MeshStandardMaterial({map:TX.tile, roughness:.65, side:THREE.DoubleSide});
  const wallLit = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let x = 24; x < w; x += 64){ if (rng() > .38) continue; const gr = g.createLinearGradient(0, 80, 0, h - 40); gr.addColorStop(0, '#ffcf8a'); gr.addColorStop(1, '#b0753a'); g.fillStyle = gr; g.beginPath(); g.moveTo(x + 3, h - 42); g.lineTo(x + 3, 80); g.arc(x + 16, 80, 13, Math.PI, 0); g.lineTo(x + 29, h - 42); g.closePath(); g.fill(); } }, {});
  const wallM = new THREE.MeshStandardMaterial({map:TX.wall, roughness:.85, emissive:'#ffffff', emissiveMap:wallLit, emissiveIntensity:.9});
  const white = new THREE.MeshStandardMaterial({color:'#d8d2c6', roughness:.8});
  const gravelM = new THREE.MeshStandardMaterial({map:TX.gravel, roughness:1});
  const fenceM = new THREE.MeshStandardMaterial({map:TX.fence, alphaTest:.5, side:THREE.DoubleSide, roughness:.4, metalness:.6});
  const steel = new THREE.MeshStandardMaterial({color:'#8d939a', roughness:.35, metalness:.8});
  const water = new THREE.MeshPhysicalMaterial({color:'#132429', roughness:.08, metalness:0, normalMap:TX.waterN, normalScale:new THREE.Vector2(.35, .35), envMapIntensity:.55});
  [TX.asphalt, TX.asphaltR, TX.asphaltN, TX.runoff].forEach(t => t.repeat.set(3, 3));

  /* --- the road and its edges --- */
  const hw = i => HW[i], E = N - 1;
  {
    /* five lanes across: the middle (where everyone drives) is rubbered darker, the braking zones before T1 and T3 darker still */
    const cols = i => [-hw(i), -4.5, -1.6, 1.6, 4.5, hw(i)], S = cum(), pos = [], uv = [], col = [], idx = [], C = 6;
    const brake = i => (i > 440 && i < 552) || (i > 680 && i < 726) ? 1 : 0;
    for (let i = 0; i <= E; i++){ const os = cols(i), patch = .96 + .08 * Math.sin(i * .37) * Math.sin(i * .11);
      os.forEach((o, k) => { const [x, z] = P(i, o); pos.push(x, .05, z); uv.push((o + hw(i)) / (2 * hw(i)) * 5, S[i] / 6);
        const mid = k === 2 || k === 3 ? .84 : k === 1 || k === 4 ? .93 : 1, v = mid * (1 - .1 * brake(i)) * patch; col.push(v, v, v); });
      if (i < E) for (let k = 0; k < C - 1; k++){ const a = i * C + k, b = a + C; idx.push(a, b, a + 1, a + 1, b, b + 1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); if (g.attributes.normal.getY(0) < 0){ for (let n = 0; n < idx.length; n += 3){ const t = idx[n + 1]; idx[n + 1] = idx[n + 2]; idx[n + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    add(g, road, false);
  }
  for (const s of [-1, 1]){
    add(strip(0, E, i => s * (hw(i) - .9), i => s * (hw(i) - .45), .09, 40), paint, false);   /* white edge line */
    /* kerbs where the line bends, run-off beyond */
    let a = -1;
    for (let i = 0; i <= E; i++){ const on = kerbOn(i); if (on && a < 0) a = i; if ((!on || i === E) && a >= 0){ add(strip(a, i, j => s * hw(j), j => s * (hw(j) + KERB), .07, 8), kerbM, false); a = -1; } }
    const ro0 = i => s * (hw(i) + (kerbOn(i) ? KERB : 0)), ro1 = i => s * (hw(i) + 9);
    if (s > 0){ add(strip(0, 500, ro0, ro1, .04, 14, 3), runoff, false); add(strip(640, E, ro0, ro1, .04, 14, 3), runoff, false); add(strip(500, 640, ro0, i => s * (hw(i) + 24), .045, 10, 3), gravelM, false); }
    else add(strip(0, E, ro0, ro1, .04, 14, 3), runoff, false);
    /* concrete wall with a batik-coloured band, catch fence on top near the stands and the hairpin */
    const wOff = i => s * (hw(i) + 25);
    add(wallStrip(0, E, wOff, 0, .9, 4), concrete, true);
    add(wallStrip(0, E, wOff, .9, 1.65, 48), band, false);
    const fz = i => (i < 420 || (i > 480 && i < 640));
    let f0 = -1;
    for (let i = 0; i <= E; i++){ const on = fz(i); if (on && f0 < 0) f0 = i; if ((!on || i === E) && f0 >= 0){ add(wallStrip(f0, i, wOff, 1.65, 4.8, 3), fenceM, false); f0 = -1; } }
  }
  /* start line + grid boxes */
  const startLine = new THREE.Mesh(new THREE.BoxGeometry(HW[SF] * 2, .02, 1.2), new THREE.MeshStandardMaterial({color:'#f4f4f0', roughness:.5}));
  startLine.rotation.y = HD[SF]; startLine.position.set(PTS[SF][0], .08, PTS[SF][1]); startLine.receiveShadow = true; world.add(startLine);

  /* --- ground --- */
  const gg = new THREE.PlaneGeometry(9000, 9000); gg.rotateX(-Math.PI / 2); TX.grass.repeat.set(900, 900);
  add(gg, grass, false).position.y = -.04;

  /* --- the gate (嘉庚门楼): two towers with red hip roofs, a bridge with the name and the start lights --- */
  const gateLights = [];
  {
    const i = SF, h = HD[i], off = HW[i] + 7, g = new THREE.Group();
    for (const s of [-1, 1]){
      const [x, z] = P(i, s * off), tw = new THREE.Group(); tw.position.set(x, 0, z); tw.rotation.y = h;
      const body = shadowy(new THREE.Mesh(new THREE.BoxGeometry(10, 16, 10), wallM)); body.position.y = 8; tw.add(body);
      const base = shadowy(new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 11), new THREE.MeshStandardMaterial({color:'#9d8b72', roughness:.9}))); base.position.y = .6; tw.add(base);
      const roof = shadowy(new THREE.Mesh(hipRoof(10, 10, 4.5, 1.6), tile)); roof.position.y = 16; tw.add(roof);
      const roof2 = shadowy(new THREE.Mesh(hipRoof(5, 5, 2.4, 1), tile)); roof2.position.y = 21.5; const cap = shadowy(new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 5), white)); cap.position.y = 20.7; tw.add(cap, roof2);
      g.add(tw);
    }
    const [mx, mz] = P(i, 0), bridge = new THREE.Group(); bridge.position.set(mx, 0, mz); bridge.rotation.y = h;
    const beam = shadowy(new THREE.Mesh(new THREE.BoxGeometry(off * 2, 3.2, 3), white)); beam.position.y = 13; bridge.add(beam);
    const signM = new THREE.MeshStandardMaterial({map:TX.sign, roughness:.6, emissive:'#ffffff', emissiveMap:TX.sign, emissiveIntensity:.08});
    for (const s of [-1, 1]){ const sg = new THREE.Mesh(new THREE.PlaneGeometry(off * 1.6, 2.2), signM); sg.position.set(0, 13, s * 1.52); if (s < 0) sg.rotation.y = Math.PI; bridge.add(sg); }
    const broof = shadowy(new THREE.Mesh(hipRoof(off * 2, 3, 2.2, 1.4), tile)); broof.position.y = 14.6; bridge.add(broof);
    /* five pairs of start lights under the beam, facing the grid */
    for (let k = 0; k < 5; k++){
      const m = new THREE.MeshStandardMaterial({color:'#2a0606', emissive:'#ff1a10', emissiveIntensity:0, roughness:.4});
      for (const row of [0, 1]){ const l = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), m); l.position.set((k - 2) * 1.3, 10.6 - row * 1.1, -1.76); l.rotation.y = Math.PI; bridge.add(l); }
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, .4), new THREE.MeshStandardMaterial({color:'#15171a', roughness:.6})); box.position.set((k - 2) * 1.3, 10.05, -1.55); bridge.add(box);
      gateLights.push(m);
    }
    g.add(bridge); world.add(g);
  }

  /* --- grandstand on the left of the main straight (the r side), red tile roof on white columns --- */
  {
    const parts = [], roofs = [], cols = [], crowd = [];
    for (let i = 10; i < 400; i += 26){
      const [x, z] = P(i, HW[i] + 30), h = HD[i];
      for (let t = 0; t < 12; t++){ const b = new THREE.BoxGeometry(26, 1.4, 3.2); b.translate(0, 1 + t * 1.4, t * 3.2 + 2); b.rotateY(h + Math.PI / 2); b.translate(x, 0, z); parts.push(b); }
      const back = new THREE.BoxGeometry(26, 20, 2); back.translate(0, 10, 42); back.rotateY(h + Math.PI / 2); back.translate(x, 0, z); parts.push(back);
      const r = hipRoof(26, 42, 6, 1.5); r.translate(0, 23, 21); r.rotateY(h + Math.PI / 2); r.translate(x, 0, z); roofs.push(r);
      for (const cz of [1, 41]){ const c = new THREE.CylinderGeometry(.5, .6, 22, 10); c.translate(-12, 11, cz); c.rotateY(h + Math.PI / 2); c.translate(x, 0, z); cols.push(c); }
      for (let n = 0; n < 0; n++){ const t = Math.floor(rng() * 8), u = (rng() - .5) * 24; const b = new THREE.BoxGeometry(.5, .8, .4); b.translate(u, 2.1 + t * 1.4, t * 3.2 + 2.6); b.rotateY(h + Math.PI / 2); b.translate(x, 0, z);
        const col = new THREE.Color().setHSL(rng(), .5, .15 + rng() * .15), cnt = b.attributes.position.count, ca = new Float32Array(cnt * 3); for (let q = 0; q < cnt; q++) col.toArray(ca, q * 3); b.setAttribute('color', new THREE.BufferAttribute(ca, 3)); crowd.push(b); }
    }
    add(mergeGeometries(parts), concrete, true);
    add(mergeGeometries(roofs), tile, true);
    add(mergeGeometries(cols), white, true);

  }

  /* --- pits on the right: pit wall, pit lane, a long garage block with arched windows and a red roof --- */
  {
    const o0 = i => -(HW[i] + 4), o1 = i => -(HW[i] + 18);
    add(strip(0, 420, o0, o1, .025, 14, 2), road, false);
    add(wallStrip(0, 420, i => -(HW[i] + 3.6), 0, 1.1, 4), concrete, true);
    const g = [], r = [];
    for (let i = 0; i < 420; i += 30){ const [x, z] = P(i, -(HW[i] + 32)), h = HD[i];
      const b = new THREE.BoxGeometry(14, 9, 90); b.rotateY(h); b.translate(x, 4.5, z); g.push(b);
      const rf = hipRoof(90, 14, 3.6, 1.4); rf.rotateY(h - Math.PI / 2); rf.translate(x, 9, z); r.push(rf); }
    add(mergeGeometries(g), wallM, true); add(mergeGeometries(r), tile, true);
    /* control tower near the gate */
    const [tx, tz] = P(SF + 20, -(HW[SF] + 52)); const tw = shadowy(new THREE.Mesh(new THREE.BoxGeometry(14, 34, 14), wallM)); tw.position.set(tx, 17, tz); tw.rotation.y = HD[SF]; world.add(tw);
    const tr = shadowy(new THREE.Mesh(hipRoof(14, 14, 6, 2), tile)); tr.position.set(tx, 34, tz); tr.rotation.y = HD[SF]; world.add(tr);
  }

  /* --- light poles along the main straight (glowing heads; the bloom makes them read as lights) --- */
  const lampM = new THREE.MeshStandardMaterial({color:'#fff3d6', emissive:'#ffd9a0', emissiveIntensity:0, roughness:.3});
  {
    const poles = [], heads = [];
    for (let i = 20; i < 520; i += 14) for (const s of [-1, 1]){ const [x, z] = P(i, s * (HW[i] + 26.5)), h = HD[i];
      const p = new THREE.CylinderGeometry(.18, .26, 14, 8); p.translate(x, 7, z); poles.push(p);
      const hd = new THREE.BoxGeometry(2.4, .3, .7); hd.translate(-s * 1, 14, 0); hd.rotateY(h); hd.translate(x, 0, z); heads.push(hd); }
    add(mergeGeometries(poles), steel, true); add(mergeGeometries(heads), lampM, false);
  }

  /* --- the lake on the left after T3 --- */
  {
    const [lx, lz] = P(905, HW[905] + 175), shape = new THREE.Shape(); const A = 230, B = 120, h = HD[905];
    for (let k = 0; k <= 48; k++){ const a = k / 48 * Math.PI * 2, rr = 1 + .12 * Math.sin(a * 3 + 1) + .06 * Math.sin(a * 7); const x = Math.cos(a) * A * rr, y = Math.sin(a) * B * rr; k ? shape.lineTo(x, y) : shape.moveTo(x, y); }
    const lg = new THREE.ShapeGeometry(shape, 48); lg.rotateX(-Math.PI / 2); lg.rotateY(h - Math.PI / 2);
    const lake = new THREE.Mesh(lg, water); lake.position.set(lx, .06, lz); lake.receiveShadow = true; world.add(lake);
    TX.waterN.repeat.set(.02, .02);
    var lakeAt = [lx, lz, A, B];
  }

  /* --- oil palms (instanced), outside the walls and away from the lake --- */
  const palms = [];
  {
    const trunkG = new THREE.CylinderGeometry(.35, .5, 9, 7); trunkG.translate(0, 4.5, 0);
    const leaves = [];
    for (let k = 0; k < 12; k++){ const tier = k % 3, len = 5.6 - tier * .8, seg = 4, l = new THREE.PlaneGeometry(len, 1.5, seg, 1); l.translate(len / 2, 0, 0);
      const pa = l.attributes.position; for (let v = 0; v < pa.count; v++){ const x = pa.getX(v), t = x / len; pa.setZ(v, pa.getY(v)); pa.setY(v, -(t * t) * (1.6 + tier * .9)); pa.setY(v, pa.getY(v) + x * (.55 - tier * .35)); }
      l.computeVertexNormals(); l.rotateY(k / 12 * Math.PI * 2 + tier * .4); l.translate(0, 9 - tier * .25, 0); leaves.push(l); }
    const crownG = mergeGeometries(leaves);
    { const nn = crownG.attributes.normal; for (let v = 0; v < nn.count; v++) nn.setXYZ(v, 0, 1, 0); }   /* lit from the sky, not black against the low sun */
    const pts = [];
    for (let tries = 0; tries < 30000 && pts.length < Q.palms; tries++){
      const i = Math.floor(rng() * N), s = rng() < .5 ? -1 : 1, off = s * (HW[i] + 34 + rng() * 520), [x, z] = P(i, off);
      let ok = true; for (let j = 0; j < N; j += 6){ const dx = x - PTS[j][0], dz = z - PTS[j][1]; if (dx * dx + dz * dz < (HW[j] + 33) ** 2){ ok = false; break; } }
      if (!ok) continue; if (i < 420 && Math.abs(off) < HW[i] + 110) continue;
      const lx = (x - lakeAt[0]), lz = (z - lakeAt[1]); if (Math.hypot(lx, lz) < 290) continue;
      pts.push([x, z, .8 + rng() * .5, rng() * 6]);
    }
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({color:'#5d4a36', roughness:1}), pts.length);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({map:TX.frond, alphaTest:.45, color:'#a8b48e', roughness:.85, side:THREE.DoubleSide}), pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pts.forEach(([x, z, s, r], k) => { q.setFromEuler(e.set(0, r, 0)); m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)); trunks.setMatrixAt(k, m); crowns.setMatrixAt(k, m); });
    for (const im of [trunks, crowns]){ im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); world.add(im); palms.push(im); }
  }

  /* --- far away: the Kuala Lumpur skyline (real height twin towers) to the north-north-west, hazy in the fog --- */
  {
    const fx = Math.sin(-2.2), fz = Math.cos(-2.2), cx = fx * 2300, cz = fz * 2300;
    const facade = new THREE.MeshStandardMaterial({color:'#7d8794', roughness:.6, metalness:0, emissive:'#ffffff', emissiveMap:TX.windows, emissiveIntensity:.0});
    const parts = [];
    const tower = (x, z, s) => { for (const [r, h, y] of [[24, 250, 0], [21, 70, 250], [17, 45, 320], [12, 30, 365], [7, 20, 395], [1.2, 60, 415]]){ const c = new THREE.CylinderGeometry(r * .92 * s, r * s, h * s, 8); c.translate(x, (y + h / 2) * s, z); parts.push(c); } };
    tower(cx - 45, cz, 1); tower(cx + 45, cz, 1);
    const br = new THREE.BoxGeometry(90, 6, 8); br.translate(cx, 170, cz); parts.push(br);
    const kl = new THREE.CylinderGeometry(6, 9, 330, 10); kl.translate(cx + 700, 165, cz + 250); parts.push(kl);
    const pod = new THREE.SphereGeometry(28, 16, 10); pod.scale(1, .5, 1); pod.translate(cx + 700, 300, cz + 250); parts.push(pod);
    for (let n = 0; n < 40; n++){ const w = 30 + rng() * 40, h = 80 + rng() * 230, b = new THREE.BoxGeometry(w, h, w * (.6 + rng() * .6)); b.translate(cx + (rng() - .5) * 1700, h / 2, cz + (rng() - .5) * 700); parts.push(b); }
    const cg = mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g)); cg.translate(-cx, 0, -cz); cg.scale(2, 2, 2); cg.translate(cx, 0, cz);
    const city = new THREE.Mesh(cg, facade); world.add(city);
    var cityMat = facade;
  }

  /* --- puddles: only when it rains (on the racing line where the braking zones are) --- */
  const puddleM = new THREE.MeshPhysicalMaterial({color:'#0e1012', roughness:.02, metalness:0, normalMap:TX.waterN, normalScale:new THREE.Vector2(.08, .08), transparent:true, opacity:0, depthWrite:false});
  {
    const ps = [];
    for (const [i, off, a, b] of [[470, -4, 9, 3.5], [505, 6, 7, 3], [540, -10, 11, 4], [600, 8, 8, 3], [700, -6, 10, 3.5], [380, 9, 6, 2.5], [250, -7, 8, 3]]){
      const g = new THREE.CircleGeometry(1, 28); g.scale(a, b, 1); g.rotateX(-Math.PI / 2); g.rotateY(HD[i] - Math.PI / 2); const [x, z] = P(i, off); g.translate(x, .075, z); ps.push(g); }
    const pm = new THREE.Mesh(mergeGeometries(ps), puddleM); pm.receiveShadow = true; pm.renderOrder = 2; world.add(pm);
  }

  /* --- wet look: darker, much smoother asphalt and kerbs; puddles fade in --- */
  const dry = {road:[road.roughness, road.color.clone()], runoff:[runoff.roughness, runoff.color.clone()], kerb:[kerbM.roughness, kerbM.color.clone()]};
  function setWet(w){
    road.roughness = THREE.MathUtils.lerp(dry.road[0], .12, w); road.normalScale.setScalar(THREE.MathUtils.lerp(.12, .05, w)); road.color.copy(dry.road[1]).multiplyScalar(1 - .45 * w);
    runoff.roughness = THREE.MathUtils.lerp(dry.runoff[0], .3, w); runoff.color.copy(dry.runoff[1]).multiplyScalar(1 - .4 * w);
    kerbM.roughness = THREE.MathUtils.lerp(dry.kerb[0], .2, w); kerbM.color.copy(dry.kerb[1]).multiplyScalar(1 - .25 * w);
    road.envMapIntensity = runoff.envMapIntensity = 1 + .25 * w;
    puddleM.opacity = Math.max(0, (w - .4) / .6) * .92;
  }
  /* --- time of day: dusk, a little darker when it rains; lamps and city windows come on --- */
  function setMood(rain){
    sun.intensity = 3.2 * (1 - .88 * rain); sun.color.set(rain > .5 ? '#c8b8a6' : '#ffc98f');
    hemi.intensity = .85 + .5 * rain;
    scene.fog.color.set(rain > .5 ? '#7d8287' : '#b3a594'); scene.fog.density = .00026 + .00045 * rain;
    su.turbidity.value = 4 + 8 * rain; su.rayleigh.value = 1.6 - .6 * rain; overcast.material.opacity = rain > .5 ? 1 : 1.9 * rain; overcast.visible = rain > .01; updateEnv();
    lampM.emissiveIntensity = 2.2 + 2 * rain; cityMat.emissiveIntensity = .9 + .6 * rain;
  }
  setMood(0);

  /* --- the shadow box follows a point (the player's car) --- */
  function followShadow(x, z, size, mapSize){
    if (sun.shadow.mapSize.x !== mapSize){ sun.shadow.mapSize.set(mapSize, mapSize); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } }
    const c = sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 10; c.far = 1400; c.updateProjectionMatrix();
    const tx = Math.round(x / 4) * 4, tz = Math.round(z / 4) * 4;   /* snap so the shadow edges do not crawl */
    sun.target.position.set(tx, 0, tz); sun.position.set(tx + sunDir.x * 600, sunDir.y * 600, tz + sunDir.z * 600);
  }
  function tick(t){ TX.waterN.offset.set(t * .004, t * .002); }
  return {lake:lakeAt, world, sky, sun, sunDir, setWet, setMood, followShadow, tick, gateLights, lampM, materials:{road, runoff, kerbM, water, puddleM}};
}
