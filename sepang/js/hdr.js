/* 读 Radiance .hdr（RGBE）天空全景图，给 three.js 当天空和环境光用。自己写的小读取器，不用另外下载 HDRLoader。 */
import * as THREE from 'three';

export async function loadHDR(url){
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let p = 0;
  const line = () => { let s = ''; while (p < buf.length && buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('not a Radiance HDR: ' + url);
  while (line() !== '');                                   /* header until the blank line */
  const m = line().match(/-Y (\d+) \+X (\d+)/); if (!m) throw new Error('unsupported HDR orientation');
  const H = +m[1], W = +m[2], rgbe = new Uint8Array(W * H * 4), scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++){
    if (buf[p] !== 2 || buf[p + 1] !== 2 || (buf[p + 2] << 8 | buf[p + 3]) !== W){   /* flat scanline */
      rgbe.set(buf.subarray(p, p + W * 4), y * W * 4); p += W * 4; continue; }
    p += 4;
    for (let c = 0; c < 4; c++){ let x = 0;                 /* run-length encoded, one channel at a time */
      while (x < W){ let n = buf[p++]; if (n > 128){ n -= 128; const v = buf[p++]; while (n--) scan[(x++) * 4 + c] = v; } else { while (n--) scan[(x++) * 4 + c] = buf[p++]; } } }
    rgbe.set(scan, y * W * 4);
  }
  const data = new Uint16Array(W * H * 4), toHalf = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < W * H; i++){ const e = rgbe[i * 4 + 3]; const f = e ? Math.pow(2, e - 136) : 0;
    data[i * 4] = toHalf(rgbe[i * 4] * f); data[i * 4 + 1] = toHalf(rgbe[i * 4 + 1] * f); data[i * 4 + 2] = toHalf(rgbe[i * 4 + 2] * f); data[i * 4 + 3] = toHalf(1); }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.flipY = true; t.colorSpace = THREE.LinearSRGBColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
