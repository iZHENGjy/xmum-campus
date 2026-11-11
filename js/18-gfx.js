/* XMUM 校园漫游 · 画面：夜晚的灯光、水面、树叶摆动、泛光，以及每帧的远近模型切换和阴影刷新节奏。
   档位参数在 js/quality.js（XQ.cfg），主循环（js/90-main.js）每帧调一次 gfxRender(dt, T)。
   这里只管"怎么画"，不碰玩法：灯光贴片是挂在路灯集合 ims 里的一个假 InstancedMesh，路灯被撞倒或被吞掉时自己跟着消失。 */
'use strict';
const gfxU = {time:{value:0}, wind:{value:.035}, ripple:{value:.1}, sky:{value:new THREE.Color('#9fd2ef')}, glare:{value:0}};

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

/* ---------- 流畅 has no shadow map: a soft dark blob under each car and under 奶娃 keeps them planted on the ground ---------- */
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.8)'); gr.addColorStop(.8, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({map:blobTex, color:'#000000', transparent:true, opacity:.5, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-11, polygonOffsetUnits:-44});
function gfxBlob(w, l){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), blobMat); m.position.y = .07; m.renderOrder = 1; m.visible = false; return m; }
let gfxNwBlob = null;

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
    const bl = !renderer.shadowMap.enabled && on;
    if (bl && !c.blob){ c.blob = gfxBlob(c.T.W * 1.9, c.T.L * 1.45); c.root.add(c.blob); }
    if (c.blob) c.blob.visible = bl;
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
  sh.uniforms.uTime = gfxU.time; sh.uniforms.uRipple = gfxU.ripple; sh.uniforms.uSky = gfxU.sky; sh.uniforms.uGlare = gfxU.glare;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uTime, uRipple, uGlare; uniform vec3 uSky;')
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
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSky, wf * .55 * (1.0 - .55 * uGlare));      /* less mirror-like sky at dusk */
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

/* ---------- ground detail: grass blades, asphalt grain, paving joints, and big soft patches of lighter and darker ground ----------
   Mapped by world position in the shader, so it works on every ground mesh whether or not it has texture coordinates.
   The textures are multipliers around mid-grey (128 = unchanged). 流畅 leaves it off. */
const gfxTex = (() => {
  const mk = (N, paint) => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N); paint(g, N);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; };
  const rr = mkRng(60606);
  /* draw something at every wrap-around position so the tile has no seams */
  const wrap = (N, x, y, r, fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) if (x + ox > -r && x + ox < N + r && y + oy > -r && y + oy < N + r) fn(x + ox, y + oy); };
  const blot = mk(256, (g, N) => {
    for (let k = 0; k < 70; k++){
      const x = rr() * N, y = rr() * N, r = 18 + rr() * 52, t = rr(), col = t < .45 ? '78,90,66' : t < .8 ? '176,172,138' : t < .9 ? '150,160,150' : '100,116,88', al = .14 + rr() * .2;
      wrap(N, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${col},${al})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
    }
  });
  const grass = mk(128, (g, N) => {
    for (let k = 0; k < 1500; k++){ const t = rr(), v = t < .5 ? 80 + rr() * 34 : 142 + rr() * 50; g.fillStyle = `rgba(${v | 0},${(v * 1.04) | 0},${(v * .9) | 0},.5)`; g.fillRect(rr() * N, rr() * N, 1 + rr() * 1.4, 2 + rr() * 4); }
    for (let k = 0; k < 40; k++){ g.fillStyle = rr() < .5 ? 'rgba(206,196,110,.5)' : 'rgba(70,90,50,.45)'; g.fillRect(rr() * N, rr() * N, 2, 2); }
  });
  const asphalt = mk(128, (g, N) => {
    for (let k = 0; k < 2600; k++){ const v = rr() < .55 ? 84 + rr() * 30 : 140 + rr() * 60; g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},.55)`; g.fillRect(rr() * N, rr() * N, 1 + rr(), 1 + rr()); }
    g.strokeStyle = 'rgba(60,60,60,.35)'; g.lineWidth = .8;
    for (let k = 0; k < 5; k++){ let x = rr() * N, y = rr() * N; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++){ x += (rr() - .5) * 26; y += (rr() - .5) * 26; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 4; k++){ const x = rr() * N, y = rr() * N, r = 10 + rr() * 16; wrap(N, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(84,84,84,.3)'); gr.addColorStop(1, 'rgba(84,84,84,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }); }
  });
  const pave = mk(128, (g, N) => {
    const n = 4, s = N / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++){
      const v = 112 + rr() * 34, x = i * s + (j % 2) * s / 2, y = j * s / 2;
      for (const ox of [0, -N]){ g.fillStyle = `rgb(${v | 0},${(v * .99) | 0},${(v * .96) | 0})`; g.fillRect(x + ox + .8, y + .8, s - 1.6, s / 2 - 1.6); }
    }
    g.fillStyle = 'rgba(70,64,56,.5)'; for (let j = 0; j < n * 2; j++) g.fillRect(0, j * s / 2 - .6, N, 1.4);
    for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) g.fillRect(i * s + (j % 2) * s / 2 - .6, j * s / 2, 1.4, s / 2);
    for (let k = 0; k < 500; k++){ const v = rr() < .5 ? 90 : 160; g.fillStyle = `rgba(${v},${v},${v},.25)`; g.fillRect(rr() * N, rr() * N, 1, 1); }
  });
  return {blot, grass, asphalt, pave};
})();
const gfxDetailMats = [];
function gfxDetail(m, fine, s1, s2, gain){
  if (!m || m.map || gfxDetailMats.indexOf(m) >= 0) return;
  m.defines = m.defines || {}; gfxDetailMats.push(m);
  const us = {uFine:{value:fine}, uBlot:{value:gfxTex.blot}, uDS:{value:new THREE.Vector3(s1, s2, 8 * (gain || 1))}};
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, us);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vDPos; uniform sampler2D uFine, uBlot; uniform vec3 uDS;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef XQ_DETAIL
          diffuseColor.rgb *= texture2D(uFine, vDPos * uDS.x).rgb * texture2D(uBlot, vDPos * uDS.y).rgb * texture2D(uBlot, vDPos.yx * uDS.y * .21 + .37).rgb * uDS.z;
        #endif`);
  };
}
(function(){
  gfxDetail(asphalt, gfxTex.asphalt, 1 / 2.6, 1 / 31); gfxDetail(kerbMat, gfxTex.pave, 1 / 1.2, 1 / 23);
  gfxDetail(paving, gfxTex.pave, 1 / 2.4, 1 / 23, .95); gfxDetail(pathMat, gfxTex.pave, 1 / 2.4, 1 / 23, .95); gfxDetail(rimMat, gfxTex.pave, 1 / 2.4, 1 / 23, .95);
  if (typeof outGroundMat !== 'undefined') gfxDetail(outGroundMat, gfxTex.asphalt, 1 / 2.6, 1 / 31);
  if (typeof terrMat !== 'undefined') gfxDetail(terrMat, gfxTex.grass, 1 / 3.2, 1 / 47, 1);
  /* everything else registered as ground that is green is grass */
  for (const [m] of wetMats) if (m.color.g > m.color.r * 1.08 && m.color.g > m.color.b) gfxDetail(m, gfxTex.grass, 1 / 3.2, 1 / 47, 1);
})();

/* ---------- shine control: no glare at dusk, some relief by day ----------
   Dusk: the low sun skims every glossy surface (wet road, water, glass, painted metal) and the highlight is blinding. glare = how "dusk" the
   time of day is (the sky halo grows from 0.9 by day to 1.5 at dusk, so it peaks at dusk and fades both ways). While it is up, every standard
   material gets rougher and less metallic, so the sun's highlight spreads out and softens; by day and night the original values come back.
   Day (标准 / 高清): the roof tiles and the facades get a bump map from the textures they already have, so tile ridges, mouldings, sills and window
   reveals catch the light from the side instead of reading as flat colour. 流畅 skips the bump (an extra texture read per pixel) and keeps only the dusk part, which is free.
   Materials are found by walking the scene (a few times early on, since other files add theirs later); each remembers its own base values. */
const gfxShine = {mats:new Set(), g:-1, wet:-1, scans:0, frame:0, bump:null};
const gfxRoughBase = new Map(wetMats.map(([m, c, r0, r1]) => [m, [r0, r1]]));
function gfxShineScan(){
  const found = gfxShine.mats, before = found.size;
  scene.traverse(o => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && !found.has(m)){ m.userData.xq0 = [m.roughness, m.metalness]; found.add(m); }
  });
  if (found.size !== before) gfxShine.g = -1;
}
function gfxShineApply(){
  const g = gfxU.glare.value, wet = typeof lastWet === 'number' ? lastWet : 0;
  for (const m of gfxShine.mats){
    const w = gfxRoughBase.get(m), r = w ? w[0] + (w[1] - w[0]) * wet : m.userData.xq0[0], me = m.userData.xq0[1];
    m.roughness = r + (Math.max(r, .66) - r) * g; m.metalness = me * (1 - .6 * g);
  }
  gfxShine.g = g; gfxShine.wet = wet;
}
/* bump on the roof tiles and facades (标准 / 高清 only) */
function gfxRelief(on){
  const set = (m, tex, k) => { const b = on ? tex : null; if (m.bumpMap === b) return; m.bumpMap = b; m.bumpScale = k; m.needsUpdate = true; };
  for (const m of gfxShine.mats){
    if (m.map === tileTex) set(m, tileTex, .35);
    else if (wallMats.indexOf(m) >= 0) set(m, m.map, .06);
  }
  gfxShine.bump = on;
}
function gfxShineTick(){
  /* scan a few times: right away, after the other files have added their models, and once things have settled */
  const f = ++gfxShine.frame;
  if (f === 2 || f === 90 || f === 600 || f === 3000){ gfxShineScan(); gfxShine.bump = null; }
  const k = Math.min(1, Math.max(0, (cur.glow - .95) / .5)) * (1 - wx.rain * .6);
  gfxU.glare.value += (k - gfxU.glare.value) * .2;
  if (Math.abs(gfxU.glare.value - gfxShine.g) > .004 || (typeof lastWet === 'number' && lastWet !== gfxShine.wet)) gfxShineApply();
  const want = !!XQ.cfg.detail;
  if (gfxShine.bump !== want) gfxRelief(want);
}

/* ---------- the far distance: two ranges of hazy hills round the horizon, and clusters of apartment towers beyond the estate ----------
   The hills are plain silhouettes tinted toward the sky colour every frame (no fog on them: they sit past the fog). 3 draw calls in all. */
const farHills = [];
(function(){
  const rr = mkRng(7007);
  const ring = (R, base, amp, seed, col, haze) => {
    const N = 120, pos = [], hs = [];
    for (let i = 0; i <= N; i++){ const a = i / N * Math.PI * 2; hs.push(base + amp * (.5 + .5 * Math.sin(a * 3 + seed)) * (.55 + .45 * Math.sin(a * 7.3 + seed * 2.1)) + amp * .22 * Math.sin(a * 19 + seed * 5) + amp * .1 * Math.sin(a * 41 + seed)); }
    hs[N] = hs[0];
    for (let i = 0; i < N; i++){
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
      pos.push(x0, -30, z0, x1, -30, z1, x1, hs[i + 1], z1, x0, -30, z0, x1, hs[i + 1], z1, x0, hs[i], z0);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color:col, fog:false, side:THREE.DoubleSide})); m.frustumCulled = false; scene.add(m);
    farHills.push({m, col:new THREE.Color(col), haze});
  };
  ring(4300, 150, 330, 1.7, '#6d8f8a', .78); ring(3300, 70, 260, 4.2, '#466b52', .56);
  /* apartment towers: slabs with rows of windows (a few lit at night), in clusters well outside the playable map */
  const cv = document.createElement('canvas'), ev = document.createElement('canvas'); cv.width = cv.height = ev.width = ev.height = 64;
  const g = cv.getContext('2d'), e = ev.getContext('2d'); g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, 64, 64); e.fillStyle = '#000'; e.fillRect(0, 0, 64, 64);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){ g.fillStyle = (r + c) % 5 ? '#6f8494' : '#8496a2'; g.fillRect(c * 8 + 1.5, r * 8 + 2, 5, 4); if (rr() < .42){ e.fillStyle = rr() < .7 ? '#ffd08a' : '#e6f0ff'; e.fillRect(c * 8 + 1.5, r * 8 + 2, 5, 4); } }
  g.fillStyle = 'rgba(60,50,40,.18)'; for (let r = 0; r < 8; r++) g.fillRect(0, r * 8, 64, 1);
  const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const mat = new THREE.MeshStandardMaterial({map:mk(cv), emissiveMap:mk(ev), emissive:0xffffff, emissiveIntensity:0, roughness:.85, vertexColors:true});
  const parts = [], TINT = ['#ffffff', '#f1e6d6', '#e3e8ee', '#f3ead2', '#e9dccf'];
  const tower = (x, z, w, d, h, tint) => {
    const y = typeof terrainY === 'function' ? terrainY(x, z) : 0, b = new THREE.BoxGeometry(w, h, d), uv = b.attributes.uv;
    for (let i = 0; i < uv.count; i++){ const top = i >= 8 && i < 16; uv.setXY(i, top ? .01 : uv.getX(i) * Math.round((i < 8 ? d : w) / 14), top ? .01 : uv.getY(i) * Math.round(h / 26)); }
    parts.push(geoTint(b.translate(x, y + h / 2 - 2, z), tint));
    parts.push(geoTint(new THREE.BoxGeometry(w * .5, 5, d * .5).translate(x, y + h, z), '#b9b3a8'));
  };
  for (const [cx, cz, n, sp] of [[1050, -1750, 7, 300], [1950, -900, 6, 260], [2150, 250, 5, 240], [-1900, -1100, 6, 280], [-300, -1950, 6, 300], [-2100, 300, 4, 220], [260, 1560, 7, 300], [-420, 1680, 5, 260], [900, 1500, 5, 240]])
    for (let k = 0; k < n; k++){ const x = cx + (rr() - .5) * sp * 2, z = cz + (rr() - .5) * sp * 1.4, tall = rr(); tower(x, z, 34 + rr() * 26, 22 + rr() * 10, 80 + tall * 95, TINT[(rr() * TINT.length) | 0]); }
  const m = new THREE.Mesh(geoMergeUV(parts), mat); m.frustumCulled = false; scene.add(m);
  farHills.towers = mat;
})();

/* ---------- aviation obstruction lights on the LY towers: a red beacon that flashes slowly on each crown, steady blue lights at the arm ends ----------
   Two point clouds (2 draw calls for all eight towers), lit from dusk. A tower the black hole has swallowed takes its lights with it. */
const gfxAvi = (() => {
  const mk = (list, col, size) => {
    const pos = new Float32Array(list.length * 3); list.forEach((l, i) => { pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({color:col, map:glowTex, size, sizeAttenuation:true, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
    m.frustumCulled = false; m.visible = false; m.renderOrder = 3; scene.add(m); return {m, list, gone:list.map(() => false)};
  };
  return {red:mk(AVI_LIGHTS.filter(l => l.red), '#ff2a1c', 11), blue:mk(AVI_LIGHTS.filter(l => !l.red), '#2f6bff', 7), tick:0};
})();
function gfxAviTick(lamp, T){
  const on = lamp > .12;
  for (const k of ['red', 'blue']){
    const a = gfxAvi[k]; a.m.visible = on; if (!on) continue;
    /* red: about one slow flash every 2.4 s; blue: steady */
    a.m.material.opacity = Math.min(1, lamp) * (k === 'red' ? .12 + .88 * Math.pow(.5 + .5 * Math.sin(T * 2.6), 3) : .85);
  }
  if (!on || ++gfxAvi.tick < 20) return;
  gfxAvi.tick = 0;
  for (const k of ['red', 'blue']){
    const a = gfxAvi[k], p = a.m.geometry.attributes.position; let ch = false;
    a.list.forEach((l, i) => { const g = !!l.st.gone; if (g !== a.gone[i]){ a.gone[i] = g; p.setY(i, g ? -9999 : l.y); ch = true; } });
    if (ch) p.needsUpdate = true;
  }
}
let gfxWashOn = false;

/* ---------- quality tier -> which of the effects above are on ---------- */
function gfxDefine(m, name, on){ if (!!m.defines[name] === on) return; if (on) m.defines[name] = 1; else delete m.defines[name]; m.needsUpdate = true; }
XQ.onChange(() => {
  const c = XQ.cfg;
  gfxDefine(waterMat, 'XQ_WATER', c.water);
  for (const m of gfxWindMats) gfxDefine(m, 'XQ_WIND', c.wind && !REDUCED);
  for (const m of gfxDetailMats) gfxDefine(m, 'XQ_DETAIL', c.detail);
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
  gfxShineTick();
  updateLod(); gfxNpcDetail(); gfxCarDetail(lamp); gfxShadowTick();
  const glow = XQ.cfg.glow && lamp > .04;
  glowMat.opacity = Math.min(1, lamp) * .5; beamMat.opacity = Math.min(1, lamp) * .42;
  for (const g of glowSets) g.im.visible = glow;
  /* facade lighting (washMat, js/00-core.js) comes up with the lamps; 流畅 leaves it off */
  { const k = XQ.cfg.glow ? Math.min(1, lamp) : 0, won = k > .03; washMat.color.setScalar(k * .8); if (won !== gfxWashOn){ gfxWashOn = won; for (const m of washMeshes) m.visible = won; } }
  gfxAviTick(lamp, T);
  if (typeof gateNight === 'function') gateNight(lamp);   /* js/42-gate.js: booth windows, lawn bollards, hotel sign */
  if (typeof NW !== 'undefined'){
    if (!gfxNwBlob){ gfxNwBlob = gfxBlob(2.2, 2.2); NW.root.add(gfxNwBlob); }
    gfxNwBlob.visible = !renderer.shadowMap.enabled; gfxNwBlob.position.y = .07 - NW.root.position.y + (typeof groundAt === 'function' ? Math.max(0, groundAt(NW.root.position.x, NW.root.position.z)) : 0);
  }
  for (const h of farHills) h.m.material.color.copy(h.col).multiplyScalar(.25 + .75 * Math.min(1, hemi.intensity * 1.4 - .35 + sun.intensity * .2)).lerp(skyU.hor.value, h.haze + rain * (1 - h.haze) * .8);
  farHills.towers.emissiveIntensity = cur.win * .9;
  renderer.render(scene, camera);
  if (XQ.cfg.bloom && lamp > .05) gfxPost.bloom(Math.min(1, lamp) * .6);
}
