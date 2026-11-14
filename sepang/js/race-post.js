/* 雪邦赛车城 · 风格化章节的后处理（只给电脑，性能放开）
 *   速度镜头：中心清楚、四周强径向模糊（16 次采样，随速度变强）+ 放射状白色速度线 + 开氮气时屏幕两边的粉色光晕
 *   Bloom（低门槛：尾灯、霓虹、尾焰都会泛光）→ ACES → 暖色、饱和度高的调色 → 轻暗角 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, Effect, EffectAttribute, BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, DepthOfFieldEffect } from 'postprocessing';

const SPEED = /* glsl */`
uniform float uSpeed;
uniform float uBoost;
uniform float uTime;
uniform float uGlow;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  float aspect = texelSize.y / texelSize.x;
  /* the blur centre sits a little above the middle: on the road's vanishing point, where the eye is */
  vec2 ctr = vec2(0.5, 0.56), c = uv - ctr, ca = c * vec2(1.0 / aspect, 1.0) * vec2(aspect, 1.0);
  float r = length(c * vec2(aspect, 1.0)) / aspect;
  float k = smoothstep(0.16, 0.75, length(c * vec2(1.0, 1.15)) * 1.3);
  float blur = uSpeed * 0.2 * k * k;
  vec3 acc = vec3(0.0);
  float jt = h21(uv * 913.0 + fract(uTime));
  for (int i = 0; i < 16; i++){ float t = (float(i) + jt) / 16.0; acc += texture2D(inputBuffer, uv - c * t * blur).rgb; }
  acc /= 16.0;
  /* a touch of colour fringing on the outer edge only */
  float fr = uSpeed * 0.006 * k;
  acc.r = mix(acc.r, texture2D(inputBuffer, uv - c * fr).r, 0.6);
  acc.b = mix(acc.b, texture2D(inputBuffer, uv + c * fr).b, 0.6);
  /* speed lines: thin white streaks shooting out of the vanishing point */
  float ang = atan(c.y, c.x * aspect);
  float lines = 0.0;
  for (int L = 0; L < 2; L++){
    float bins = L == 0 ? 180.0 : 330.0;
    float bin = floor(ang / 6.2832 * bins), seed = h21(vec2(bin, 3.0 + float(L)));
    float w = fract(ang / 6.2832 * bins); float thin = smoothstep(0.5, 0.0, abs(w - 0.5)) ;
    float len = 0.12 + 0.25 * h21(vec2(bin, 9.0)), sp = 1.2 + 2.0 * seed;
    float d = length(c * vec2(aspect, 1.0));
    float ph = fract(d * 0.9 - uTime * sp + seed * 13.0);
    float on = step(1.0 - (0.12 + 0.25 * uSpeed), seed) * smoothstep(0.0, 0.05, ph) * smoothstep(len, len - 0.06, ph);
    lines += on * pow(thin, 6.0) * smoothstep(0.18, 0.55, d);
  }
  acc += vec3(1.0, 0.98, 0.95) * lines * smoothstep(0.55, 1.1, uSpeed) * 0.4;
  /* nitro: a pink glow creeping in from both sides, stronger on the left */
  float ex = uv.x, side = smoothstep(0.16, 0.0, ex) * 1.0 + smoothstep(0.84, 1.0, ex) * 0.7;
  acc += vec3(1.0, 0.25, 0.55) * side * uBoost * (0.75 + 0.25 * sin(uTime * 18.0)) * uGlow;
  outputColor = vec4(acc, inputColor.a);
}`;
class SpeedEffect extends Effect {
  constructor(){ super('SpeedEffect', SPEED, {attributes:EffectAttribute.CONVOLUTION, uniforms:new Map([['uSpeed', new THREE.Uniform(0)], ['uBoost', new THREE.Uniform(0)], ['uTime', new THREE.Uniform(0)], ['uGlow', new THREE.Uniform(1.4)]])}); }
}
const GRADE = /* glsl */`
uniform float uExposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb * uExposure;
  outputColor = vec4(c, inputColor.a);
}`;
const LOOK = /* glsl */`
uniform float uSat;
uniform vec3 uWarm;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  c = c * uWarm + vec3(0.012, 0.006, 0.0);          /* warm, sunny */
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat);   /* saturated */
  c = (c - 0.5) * 1.06 + 0.5;
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}`;
/* NaN / Inf / negative guard, done on the bits (the D3D shader compiler optimises isnan() and NaN comparisons away): one bad pixel would otherwise be spread over the whole frame by the bloom's blur and turn it black */
class SafeEffect extends Effect { constructor(){ super('Safe', 'void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){ vec3 c = inputColor.rgb; uvec3 u = floatBitsToUint(c); bool bad = any(equal(u & uvec3(0x7f800000u), uvec3(0x7f800000u))) || any(notEqual(u & uvec3(0x80000000u), uvec3(0u))); c = bad ? vec3(0.0) : min(c, vec3(64.0)); outputColor = vec4(c, 1.0); }', {blendFunction:BlendFunction.SET}); } }   /* SET: the default blend mixes in the input, and Inf·0 is NaN again */
class Effect1 extends Effect { constructor(){ super('Exposure', GRADE, {uniforms:new Map([['uExposure', new THREE.Uniform(1)]])}); } }
class Effect2 extends Effect { constructor(){ super('Look', LOOK, {uniforms:new Map([['uSat', new THREE.Uniform(1.22)], ['uWarm', new THREE.Uniform(new THREE.Vector3(1.05, 1, .94))]])}); } }

export function makeRacePost(renderer, scene, camera, opt = {}){
  const composer = new EffectComposer(renderer, {frameBufferType:THREE.HalfFloatType, multisampling:4});
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, new SafeEffect()));
  const speed = new SpeedEffect(), expo = new Effect1(), look = new Effect2(); if (opt.glow != null) speed.uniforms.get('uGlow').value = opt.glow; if (opt.sat != null) look.uniforms.get('uSat').value = opt.sat; if (opt.warm) look.uniforms.get('uWarm').value.set(...opt.warm);
  const bloom = new BloomEffect({mipmapBlur:true, luminanceThreshold:.95, luminanceSmoothing:.25, intensity:1.1, radius:.7});
  const tone = new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC});
  const vignette = new VignetteEffect({offset:.4, darkness:.3});
  /* miniature look: depth of field focused on the car, everything nearer and further melts (the tilt-shift cue) */
  let dof = null;
  if (opt.dof){ dof = new DepthOfFieldEffect(camera, {focusDistance:10, focusRange:opt.focusRange || 14, bokehScale:opt.bokeh || 4, resolutionScale:.75}); dof.target = new THREE.Vector3(); composer.addPass(new EffectPass(camera, dof)); }
  /* bloom first (its own pass) so the speed blur smears the glow too */
  if (opt.bloom !== false) composer.addPass(new EffectPass(camera, bloom));
  composer.addPass(new EffectPass(camera, speed, expo, tone, look, vignette));
  let t = 0;
  return {
    composer,
    set(o){ const u = speed.uniforms; if (o.speed != null) u.get('uSpeed').value = o.speed; if (o.boost != null) u.get('uBoost').value = o.boost; if (o.exposure != null) expo.uniforms.get('uExposure').value = o.exposure; if (o.focus && dof) dof.target.copy(o.focus); },
    setSize(w, h){ composer.setSize(w, h); },
    render(dt){ t += dt; speed.uniforms.get('uTime').value = t; composer.render(dt); }
  };
}
