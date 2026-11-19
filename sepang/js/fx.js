/* 雪邦赛车城 demo · 粒子：轮胎烟、湿地面的水雾（一个 Points，一个绘制调用），下雨（一个 LineSegments，跟着镜头） */
import * as THREE from 'three';

const VS = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  vAlpha = aAlpha; vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
uniform vec3 uLight;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec2 p = gl_PointCoord - 0.5; float d = length(p);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * uLight, a);
}`;

export function makeParticles(scene, max){
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max), col = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), size0 = new Float32Array(max), grow = new Float32Array(max), a0 = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({vertexShader:VS, fragmentShader:FS, transparent:true, depthWrite:false, uniforms:{uScale:{value:600}, uLight:{value:new THREE.Color(1, 1, 1)}}});
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  let next = 0;
  function spawn(x, y, z, vx, vy, vz, s, gr, lf, a, c){
    const k = next; next = (next + 1) % max;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; vel[k * 3] = vx; vel[k * 3 + 1] = vy; vel[k * 3 + 2] = vz;
    size0[k] = s; grow[k] = gr; life[k] = 0; maxLife[k] = lf; a0[k] = a; c.toArray(col, k * 3);
  }
  function update(dt){
    for (let k = 0; k < max; k++){
      if (life[k] >= maxLife[k]){ alpha[k] = 0; continue; }
      life[k] += dt; const t = life[k] / maxLife[k];
      vel[k * 3 + 1] += .4 * dt; const drag = Math.exp(-1.6 * dt); vel[k * 3] *= drag; vel[k * 3 + 2] *= drag;
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      size[k] = size0[k] * (1 + grow[k] * t); alpha[k] = a0[k] * (1 - t) * Math.min(1, t * 8);
    }
    for (const n of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[n].needsUpdate = true;
  }
  return {spawn, update, mat, max};
}

/* falling rain around the camera: short streaks, recycled */
export function makeRain(scene, count){
  const pos = new Float32Array(count * 6), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({color:'#b9c4cf', transparent:true, opacity:0, depthWrite:false});
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false; scene.add(lines);
  const seed = new Float32Array(count * 3); for (let k = 0; k < count * 3; k++) seed[k] = Math.random();
  function update(dt, cam, vx, vz, amount, t){
    mat.opacity = .22 * amount; lines.visible = amount > .01; if (!lines.visible) return;
    const R = 60, H = 40, fall = 24;
    for (let k = 0; k < count; k++){
      const x = cam.x + ((seed[k * 3] * 2 * R + (-vx * t * .2)) % (2 * R) + 2 * R) % (2 * R) - R;
      const z = cam.z + ((seed[k * 3 + 2] * 2 * R + (-vz * t * .2)) % (2 * R) + 2 * R) % (2 * R) - R;
      const y = cam.y - 8 + ((seed[k * 3 + 1] * H - t * fall) % H + H) % H;
      const o = k * 6, sp = Math.hypot(vx, vz), sl = sp > 25 ? .045 * 25 / sp : .045;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x - vx * sl; pos[o + 4] = y + 1.1; pos[o + 5] = z - vz * sl;
    }
    g.attributes.position.needsUpdate = true;
  }
  return {update};
}

/* fireworks: hot additive sparks with gravity, drag and a short trail (each spark drawn as TR points along its velocity), one draw call */
export function makeSparks(scene, max){
  const TR = 5, N = max * TR;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), col = new Float32Array(N * 3);
  const p = new Float32Array(max * 3), vel = new Float32Array(max * 3), life = new Float32Array(max).fill(1), maxLife = new Float32Array(max).fill(1), s0 = new Float32Array(max), c0 = new Float32Array(max * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({vertexShader:VS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, fog:false,
    fragmentShader:`varying float vAlpha; varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); float a = (smoothstep(.5, .15, d) + smoothstep(.2, 0.0, d)) * vAlpha; if (a < .003) discard; gl_FragColor = vec4(vColor * a, 1.0); }`,
    uniforms:{uScale:{value:600}}});
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  let next = 0;
  /* one shell: n sparks from (x, y, z), speed sp, colour c (already HDR), with a few white glitter sparks mixed in */
  function shell(x, y, z, n, sp, c, sz = 2.2){
    for (let j = 0; j < n; j++){ const k = next; next = (next + 1) % max;
      const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), v = sp * (.85 + Math.random() * .3);
      p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z; vel[k * 3] = Math.sin(b) * Math.cos(a) * v; vel[k * 3 + 1] = Math.cos(b) * v; vel[k * 3 + 2] = Math.sin(b) * Math.sin(a) * v;
      life[k] = 0; maxLife[k] = 1.8 + Math.random() * .9; s0[k] = sz * (.8 + Math.random() * .4);
      const w = j % 9 === 0; c0[k * 3] = w ? 4 : c.r; c0[k * 3 + 1] = w ? 3.6 : c.g; c0[k * 3 + 2] = w ? 3 : c.b; }
  }
  function update(dt){
    const drag = Math.exp(-1.25 * dt);
    for (let k = 0; k < max; k++){
      const live = life[k] < maxLife[k];
      if (live){ life[k] += dt; vel[k * 3] *= drag; vel[k * 3 + 1] = vel[k * 3 + 1] * drag - 7 * dt; vel[k * 3 + 2] *= drag;
        p[k * 3] += vel[k * 3] * dt; p[k * 3 + 1] += vel[k * 3 + 1] * dt; p[k * 3 + 2] += vel[k * 3 + 2] * dt; }
      const t = Math.min(1, life[k] / maxLife[k]), fade = live ? (1 - t * t) * (t > .6 ? .6 + .4 * Math.sin(life[k] * 40 + k) : 1) : 0;
      for (let r = 0; r < TR; r++){ const v = k * TR + r, lag = r * .035;
        pos[v * 3] = p[k * 3] - vel[k * 3] * lag; pos[v * 3 + 1] = p[k * 3 + 1] - vel[k * 3 + 1] * lag; pos[v * 3 + 2] = p[k * 3 + 2] - vel[k * 3 + 2] * lag;
        size[v] = s0[k] * (1 - r * .15); alpha[v] = fade * (1 - r / TR);
        col[v * 3] = c0[k * 3]; col[v * 3 + 1] = c0[k * 3 + 1]; col[v * 3 + 2] = c0[k * 3 + 2]; }
    }
    for (const n of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[n].needsUpdate = true;
  }
  /* one spark with its own velocity (scrapes, impacts): colour c is HDR */
  function emit(x, y, z, vx, vy, vz, c, sz = .5, lf = .5){ const k = next; next = (next + 1) % max;
    p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z; vel[k * 3] = vx; vel[k * 3 + 1] = vy; vel[k * 3 + 2] = vz; life[k] = 0; maxLife[k] = lf; s0[k] = sz; c0[k * 3] = c.r; c0[k * 3 + 1] = c.g; c0[k * 3 + 2] = c.b; }
  return {shell, emit, update, mat};
}
