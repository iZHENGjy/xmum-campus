/* 雪邦赛车城 demo · 后处理（pmndrs postprocessing，所有效果合并在一个全屏 pass 里）
 *   镜头效果（自己写的一个效果）：高速时画面边缘的径向模糊 + 速度线、轻微色差、下雨时镜头上的水滴（按车速往下滑）
 *   Bloom（mipmap 模糊）→ AgX 色调映射 → 调色（每圈一套：lift / gamma / gain、饱和度、对比度）→ 暗角 → 胶片颗粒 */
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, Effect, EffectAttribute, BlendFunction, BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect } from 'postprocessing';

const LENS = /* glsl */`
uniform float uSpeed;
uniform float uRain;
uniform float uChroma;
uniform float uTime;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
/* one layer of drops: each cell may hold a drop that slides down slowly; returns the refraction offset */
vec2 drops(vec2 uv, float t, vec2 grid, float slide){
  float aspect = texelSize.y / texelSize.x;
  vec2 g = uv * vec2(aspect, 1.0) * grid;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float n = h21(id), live = step(0.42, n);
  float fall = fract(t * slide * (0.3 + n) + n * 7.0);
  vec2 c = vec2((n - 0.5) * 0.6, 0.42 - fall * 0.84);
  vec2 d = f - c;
  float r = 0.10 + 0.12 * h21(id + 3.1);
  float m = smoothstep(r, r * 0.55, length(d)) * live;
  return d * m * 2.0;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 off = vec2(0.0);
  if (uRain > 0.001){ off = drops(uv, uTime, vec2(10.0, 7.0), 0.04 + uSpeed * 0.4) * 0.045 + drops(uv * 1.7 + 0.31, uTime * 1.3, vec2(16.0, 11.0), 0.06 + uSpeed * 0.6) * 0.025; off *= uRain; }
  vec2 c = uv - 0.5; float r = length(c);
  float blur = uSpeed * 0.05 * smoothstep(0.12, 0.62, r) * (1.0 + smoothstep(0.5, 0.0, uv.y));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++){ float t = float(i) / 7.0; acc += texture2D(inputBuffer, uv + off - c * t * blur).rgb; }
  acc /= 8.0;
  float ca = uChroma * r * r;
  acc.r = mix(acc.r, texture2D(inputBuffer, uv + off - c * ca).r, 0.8);
  acc.b = mix(acc.b, texture2D(inputBuffer, uv + off + c * ca).b, 0.8);
  float ang = atan(c.y, c.x);
  /* speed lines: short dashes running outwards, only when really fast */
  float bin = floor(ang * 140.0), seed = h21(vec2(bin, 7.0));
  float dash = step(fract(r * 2.5 - uTime * (3.0 + 4.0 * seed) + seed * 9.0), 0.18);
  float st = step(0.93, seed) * dash * smoothstep(0.3, 0.7, r) * smoothstep(0.45, 1.0, uSpeed);
  acc += vec3(st * 0.06);
  outputColor = vec4(acc, inputColor.a);
}`;
class LensEffect extends Effect {
  constructor(){
    super('LensEffect', LENS, {attributes:EffectAttribute.CONVOLUTION, uniforms:new Map([['uSpeed', new THREE.Uniform(0)], ['uRain', new THREE.Uniform(0)], ['uChroma', new THREE.Uniform(.004)], ['uTime', new THREE.Uniform(0)]])});
  }
}
const GRADE = /* glsl */`
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSat;
uniform float uContrast;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, vec3(0.0)), 1.0 / uGamma);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}`;
class ExposureEffect extends Effect {
  constructor(){ super('ExposureEffect', 'uniform float uExposure;\nvoid mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){ outputColor = vec4(inputColor.rgb * uExposure, inputColor.a); }', {uniforms:new Map([['uExposure', new THREE.Uniform(.85)]])}); }
}
class GradeEffect extends Effect {
  constructor(){
    super('GradeEffect', GRADE, {uniforms:new Map([['uLift', new THREE.Uniform(new THREE.Vector3())], ['uGamma', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uSat', new THREE.Uniform(1)], ['uContrast', new THREE.Uniform(1)]])});
  }
}
/* the looks (docs/sepang-plan.md §5): year-4 golden dusk, and the same dusk after rain */
export const GRADES = {
  dusk:{lift:[0, .004, .014], gamma:[1.02, 1, .96], gain:[1.1, 1.0, .86], sat:1.0, contrast:1.05},
  rain:{lift:[0, .005, .014], gamma:[.97, 1, 1.04], gain:[.94, .98, 1.04], sat:.82, contrast:1.08}
};

export function makePost(renderer, scene, camera, Q){
  const composer = new EffectComposer(renderer, {frameBufferType:THREE.HalfFloatType, multisampling:Q.msaa});
  composer.addPass(new RenderPass(scene, camera));
  const lens = new LensEffect(), grade = new GradeEffect(), expo = new ExposureEffect();
  const bloom = new BloomEffect({mipmapBlur:true, luminanceThreshold:2.0, luminanceSmoothing:.3, intensity:.45, radius:.65});
  bloom.resolution.scale = Q.bloomScale;
  const tone = new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC});
  const vignette = new VignetteEffect({offset:.28, darkness:.55});
  const noise = new NoiseEffect({premultiply:true, blendFunction:BlendFunction.SCREEN}); noise.blendMode.opacity.value = .045;
  composer.addPass(new EffectPass(camera, lens, bloom, expo, tone, grade, vignette, noise));
  const g = {cur:JSON.parse(JSON.stringify(GRADES.dusk))};
  function setGrade(a, b, t){
    const A = GRADES[a], B = GRADES[b], L = (x, y) => x + (y - x) * t, u = grade.uniforms;
    u.get('uLift').value.set(...A.lift.map((v, i) => L(v, B.lift[i]))); u.get('uGamma').value.set(...A.gamma.map((v, i) => L(v, B.gamma[i])));
    u.get('uGain').value.set(...A.gain.map((v, i) => L(v, B.gain[i]))); u.get('uSat').value = L(A.sat, B.sat); u.get('uContrast').value = L(A.contrast, B.contrast);
  }
  setGrade('dusk', 'dusk', 0);
  return {
    composer, bloom, lens, setGrade,
    set(o){ const u = lens.uniforms; if (o.exposure != null) expo.uniforms.get('uExposure').value = o.exposure; if (o.speed != null){ u.get('uSpeed').value = o.speed; u.get('uChroma').value = .0012 * o.speed; } if (o.rain != null) u.get('uRain').value = o.rain; if (o.time != null) u.get('uTime').value = o.time; },
    setSize(w, h){ composer.setSize(w, h); },
    render(dt){ composer.render(dt); }
  };
}
