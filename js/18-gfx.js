/* XMUM 校园漫游 · 画面：夜晚的灯光、水面、树叶摆动、泛光，以及每帧的远近模型切换和阴影刷新节奏。
   档位参数在 js/quality.js（XQ.cfg），主循环（js/90-main.js）每帧调一次 gfxRender(dt, T)。
   这里只管"怎么画"，不碰玩法：灯光贴片是挂在路灯集合 ims 里的一个假 InstancedMesh，路灯被撞倒或被吞掉时自己跟着消失。 */
'use strict';
const gfxU = {time:{value:0}, wind:{value:.035}, ripple:{value:.1}, sky:{value:new THREE.Color('#9fd2ef')}};

/* ---------- night: pools of warm light on the ground under every lamp (one additive quad each, no real lights) ---------- */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.62)'); gr.addColorStop(.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const glowMat = new THREE.MeshBasicMaterial({map:glowTex, color:'#ffb866', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
  polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48});
const glowGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), glowSets = [];
const _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _gn = new THREE.Vector3(), _gM = new THREE.Matrix4();
/* stands in for an InstancedMesh inside a lamp set: gets the lamp's matrix and lays a pool under the lantern (none when the lamp is down) */
class GlowIM {
  constructor(n, radius, ox, oz){
    this.r = radius; this.ox = ox; this.oz = oz;
    this.im = new THREE.InstancedMesh(glowGeo, glowMat, n); this.im.frustumCulled = false; this.im.visible = false; this.im.renderOrder = 2; scene.add(this.im);
    glowSets.push(this);
  }
  get instanceMatrix(){ return this.im.instanceMatrix; }
  setMatrixAt(i, m){
    const e = m.elements, s = Math.hypot(e[4], e[5], e[6]);
    if (s < 1e-4 || e[5] / s < .9){ this.im.setMatrixAt(i, _zeroM); return; }
    const x = e[12] + e[0] * this.ox + e[8] * this.oz, z = e[14] + e[2] * this.ox + e[10] * this.oz, y = e[13];
    _gn.set(0, 1, 0);
    if (y > .05 && typeof terrainY === 'function'){ _gn.set(terrainY(x - 1, z) - terrainY(x + 1, z), 2, terrainY(x, z - 1) - terrainY(x, z + 1)).normalize(); }
    this.im.setMatrixAt(i, _gM.compose(_gp.set(x, y + .14, z), _gq.setFromUnitVectors(UP, _gn), _gs.set(this.r * s, 1, this.r * s)));
  }
  setColorAt(){}
  set castShadow(v){}
  set visible(v){}
}
(function(){
  const add = (set, radius, ox, oz) => {
    const g = new GlowIM(set.spots.length, radius, ox, oz);
    set.spots.forEach((o, i) => { _cm.compose(_cp.set(o.x, o.y || 0, o.z), _cq.setFromAxisAngle(UP, o.r || 0), _cs.setScalar(o.down || o.hidden ? 0 : o.s == null ? 1 : o.s)); g.setMatrixAt(i, _cm); });
    set.ims.push(g);
  };
  for (const set of knockSets) if (set.kind === 'lamp') add(set, set.spots === lampSpots ? 7.5 : 11, set.spots === lampSpots ? 0 : 1.95, 0);
  if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) if (set.kind === 'lamp') add(set, 11, 0, 1.5);
})();

/* ---------- night: a soft beam on the road in front of each car ---------- */
const beamTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'), im = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++){
    const v = 1 - y / 127, u = (x - 31.5) / 31.5, w = .28 + .72 * v, side = Math.max(0, 1 - Math.pow(Math.abs(u) / w, 2.2)), a = side * Math.pow(1 - v, 1.4) * Math.min(1, v * 9 + .25);
    const k = (y * 64 + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0); return new THREE.CanvasTexture(c);
})();
const beamMat = new THREE.MeshBasicMaterial({map:beamTex, color:'#ffeec4', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
  polygonOffset:true, polygonOffsetFactor:-13, polygonOffsetUnits:-52});
function gfxCarBeam(c){
  const L = 12, m = new THREE.Mesh(new THREE.PlaneGeometry(c.T.W * 2.4, L).rotateX(-Math.PI / 2).rotateY(Math.PI), beamMat);
  m.position.set(0, .13, c.T.L / 2 + L / 2 - .3); m.renderOrder = 2; m.visible = false; c.root.add(m); return m;
}

/* ---------- cars: trim, chrome and wheels only within sight; beams at night ---------- */
let gfxCarTick = 0;
function gfxCarDetail(lamp){
  if (typeof cars === 'undefined' || ++gfxCarTick < 6) return;
  gfxCarTick = 0;
  const cam = camera.position, d = 160 * XQ.cfg.lod, dd = d * d, beams = XQ.cfg.glow && lamp > .3;
  for (const c of cars){
    const on = !lodOverview && (c.x - cam.x) * (c.x - cam.x) + (c.z - cam.z) * (c.z - cam.z) < dd;
    if (on !== c.fineOn){ c.fineOn = on; for (const m of c.fine) m.visible = on; }
    const b = beams && on && !c.wrecked;
    if (b && !c.beam) c.beam = gfxCarBeam(c);
    if (c.beam) c.beam.visible = b;
  }
}

/* ---------- students: which parts cast shadows (js/60-details.js already draws limbs, hair and backpacks only for the nearby ones) ---------- */
function gfxNpcDetail(){
  if (typeof npcBodyIm === 'undefined') return;
  const close = !lodOverview, sh = XQ.cfg.shadow > 0, t = XQ.tier;
  npcBodyIm.castShadow = sh && (close || t > 1); npcLegIm.castShadow = sh && close;
  npcHeadIm.castShadow = npcGearIm.castShadow = npcSleeveIm.castShadow = npcForeIm.castShadow = npcSkirtIm.castShadow = npcHairIm.castShadow = sh && close && t > 1;
  npcUmbIm.castShadow = sh && close;
}

/* ---------- water: moving ripples, sky colour at grazing angles, sun glitter (标准 and 高清) ---------- */
waterMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = gfxU.time; sh.uniforms.uRipple = gfxU.ripple; sh.uniforms.uSky = gfxU.sky;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uTime, uRipple; uniform vec3 uSky;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef XQ_WATER
        vec2 wp = vWPos.xz; float wt = uTime;
        vec2 wg = vec2(cos(wp.x * .9 + wt * 1.1), cos(wp.y * 1.1 - wt * .9)) * .5;
        wg += vec2(.35, .5) * cos(dot(wp, vec2(.35, .5)) * 1.7 + wt * 1.6) * .6;
        wg += vec2(.6, -.5) * cos(wp.x * 2.9 - wp.y * 2.3 + wt * 2.3) * .35;
        wg += vec2(-.4, .7) * cos(dot(wp, vec2(-1.3, 2.1)) * 2.2 - wt * 3.1) * .22;
        normal = normalize((viewMatrix * vec4(normalize(vec3(-wg.x * uRipple, 1.0, -wg.y * uRipple)), 0.0)).xyz);
      #endif`)
    .replace('#include <tonemapping_fragment>', `
      #ifdef XQ_WATER
        float wf = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, wf * .7);
      #endif
      #include <tonemapping_fragment>`);
};
waterMat.defines = waterMat.defines || {};

/* ---------- leaves sway in the wind (高清): palms and rain trees, more in the rain ---------- */
const gfxWindMats = [];
(function(){
  const patch = m => {
    if (!m || gfxWindMats.indexOf(m) >= 0) return;
    m.defines = m.defines || {}; gfxWindMats.push(m);
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = gfxU.time; sh.uniforms.uWind = gfxU.wind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef XQ_WIND
            #ifdef USE_INSTANCING
              float wph = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;
            #else
              float wph = 0.0;
            #endif
            float wamt = max(transformed.y - 3.2, 0.0) * uWind;
            transformed.x += sin(uTime * 1.3 + wph + transformed.y * .4) * wamt;
            transformed.z += cos(uTime * 1.07 + wph * 1.3 + transformed.x * .3) * wamt * .7;
          #endif`);
    };
  };
  for (let k = 0; k < 3; k++) patch(knockSets[k].ims[1].all.material);
})();

/* ---------- quality tier -> which of the effects above are on ---------- */
function gfxDefine(m, name, on){ if (!!m.defines[name] === on) return; if (on) m.defines[name] = 1; else delete m.defines[name]; m.needsUpdate = true; }
XQ.onChange(() => {
  const c = XQ.cfg;
  gfxDefine(waterMat, 'XQ_WATER', c.water);
  for (const m of gfxWindMats) gfxDefine(m, 'XQ_WIND', c.wind && !REDUCED);
  if (typeof rainGeo !== 'undefined') rainGeo.setDrawRange(0, Math.floor(RAIN_N * Math.min(1, c.particles + .15)) * 2);
  /* trees outside the gate: shadows only on 高清 (they are the bulk of the shadow pass from above) */
  if (typeof OUT_SETS !== 'undefined') for (const s of OUT_SETS) if (s.kind === 'tree') for (const im of s.ims) if (im.isInstancedMesh) im.castShadow = c.shadow > 1 && !TOUCH;
  renderer.shadowMap.needsUpdate = true;
});

/* ---------- shadows: redrawn every frame at street level, but from high above only when something changed or a few times a second ---------- */
renderer.shadowMap.autoUpdate = false;
const gfxSh = {d:new THREE.Vector3(), tx:1e9, tz:1e9, half:0, n:0};
function gfxShadowTick(){
  if (!renderer.shadowMap.enabled) return;
  const tp = sun.target.position; let need = true;
  if (mode === 'orbit'){
    const moved = gfxSh.d.distanceToSquared(cur.d) > 1e-7 || tp.x !== gfxSh.tx || tp.z !== gfxSh.tz || shadowHalf !== gfxSh.half;
    const every = camera.position.distanceTo(controls.target) > 420 ? 20 : 3;
    need = moved || ++gfxSh.n >= every;
  }
  if (need){ gfxSh.n = 0; gfxSh.d.copy(cur.d); gfxSh.tx = tp.x; gfxSh.tz = tp.z; gfxSh.half = shadowHalf; renderer.shadowMap.needsUpdate = true; }
}

/* ---------- 高清: bloom after dark (lit windows, lamps, headlights, the sunset sky) ----------
   The frame is drawn to the canvas as usual, copied into a texture, its bright parts blurred at quarter size and added back on top.
   Costs nothing by day: it only runs while the lamps are on (dusk, night, rain). */
const gfxPost = (() => {
  const p = {w:0, h:0, copy:null, a:[], size:new THREE.Vector2(), zero:new THREE.Vector2()};
  p.scene = new THREE.Scene(); p.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  p.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); p.quad.frustumCulled = false; p.scene.add(p.quad);
  const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mk = (fs, u, o) => new THREE.ShaderMaterial(Object.assign({vertexShader:vs, fragmentShader:fs, uniforms:u, depthTest:false, depthWrite:false}, o || {}));
  p.bright = mk(`uniform sampler2D t; uniform vec2 px; varying vec2 vUv;
    void main(){
      vec3 c = (texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, 1.0)).rgb) * .25;
      float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(.62, .95, l), 1.0);
    }`, {t:{value:null}, px:{value:new THREE.Vector2()}});
  p.blur = mk(`uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(t, vUv).rgb * .227027;
      c += (texture2D(t, vUv + dir * 1.384615).rgb + texture2D(t, vUv - dir * 1.384615).rgb) * .316216;
      c += (texture2D(t, vUv + dir * 3.230769).rgb + texture2D(t, vUv - dir * 3.230769).rgb) * .070270;
      gl_FragColor = vec4(c, 1.0);
    }`, {t:{value:null}, dir:{value:new THREE.Vector2()}});
  p.add = mk('uniform sampler2D t; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb * k, 1.0); }',
    {t:{value:null}, k:{value:.5}}, {blending:THREE.AdditiveBlending, transparent:true});
  p.resize = (w, h) => {
    if (p.copy) p.copy.dispose(); p.a.forEach(r => r.dispose());
    p.copy = new THREE.DataTexture(new Uint8Array(w * h * 3), w, h, THREE.RGBFormat); p.copy.minFilter = p.copy.magFilter = THREE.LinearFilter;
    const small = () => { const r = new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBFormat}); r.depthBuffer = false; return r; };
    p.a = [small(), small()]; p.w = w; p.h = h;
  };
  p.pass = (mat, target) => { p.quad.material = mat; renderer.setRenderTarget(target); renderer.render(p.scene, p.cam); };
  /* call right after the scene has been rendered to the canvas */
  p.bloom = k => {
    renderer.getDrawingBufferSize(p.size); if (p.size.x !== p.w || p.size.y !== p.h) p.resize(p.size.x, p.size.y);
    renderer.copyFramebufferToTexture(p.zero, p.copy);
    const B = p.bright.uniforms, U = p.blur.uniforms, A = p.a, w = A[0].width, h = A[0].height;
    B.t.value = p.copy; B.px.value.set(1 / p.w, 1 / p.h); p.pass(p.bright, A[0]);
    for (const s of [1, 2.2]){ U.t.value = A[0].texture; U.dir.value.set(s / w, 0); p.pass(p.blur, A[1]); U.t.value = A[1].texture; U.dir.value.set(0, s / h); p.pass(p.blur, A[0]); }
    p.add.uniforms.t.value = A[0].texture; p.add.uniforms.k.value = k;
    const ac = renderer.autoClear; renderer.autoClear = false; p.pass(p.add, null); renderer.autoClear = ac;
  };
  return p;
})();

/* ---------- the frame ---------- */
function gfxRender(dt, T){
  const lamp = bulbMat.emissiveIntensity, rain = wx.rain;
  gfxU.time.value = T; gfxU.wind.value = .035 + rain * .05; gfxU.ripple.value = .1 + rain * .12;
  gfxU.sky.value.copy(skyU.hor.value).lerp(skyU.top.value, .35);
  updateLod(); gfxNpcDetail(); gfxCarDetail(lamp); gfxShadowTick();
  const glow = XQ.cfg.glow && lamp > .04;
  glowMat.opacity = Math.min(1, lamp) * .5; beamMat.opacity = Math.min(1, lamp) * .42;
  for (const g of glowSets) g.im.visible = glow;
  renderer.render(scene, camera);
  if (XQ.cfg.bloom && lamp > .05) gfxPost.bloom(Math.min(1, lamp) * .6);
}
