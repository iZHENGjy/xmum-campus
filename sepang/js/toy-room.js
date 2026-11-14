/* 雪邦赛车城 · 玩具微缩章节：1:64 的宿舍书桌（1 个游戏米 = 真实 1.56 厘米）
 * 简单的形状在玩具世界里本来就该简单，靠的是材质（塑料、木头、陶瓷、纸）、窗外进来的暖光和镜头虚化显得精致。
 * 书桌上：笔记本电脑、XMUM 马克杯、课本、巨型奶娃公仔、台灯、双子塔纪念品；地板上：建南大礼堂纸模型、铅笔、拖鞋、床。 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HWT, RAIL, DESK_Y, DESK } from './toy-track.js';

const tex = (w, h, draw, srgb = true) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const rngOf = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function buildRoom(scene, renderer, trk){
  const rng = rngOf(5), world = new THREE.Group(); scene.add(world);
  const M = (o) => new THREE.MeshStandardMaterial(o), MP = (o) => new THREE.MeshPhysicalMaterial(o);
  const add = (g, m, x = 0, y = 0, z = 0, parent = world, cast = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; };

  /* ---------------- environment for reflections: a small warm room with a bright window ---------------- */
  {
    const env = new THREE.Scene(); env.background = new THREE.Color('#d9cbb6');
    const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({color:'#cdbfa9', side:THREE.BackSide})); env.add(box);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({color:new THREE.Color(6, 5.6, 5)})); win.position.set(0, .8, -4.9); env.add(win);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({color:new THREE.Color(3, 2.6, 2)})); lamp.position.set(0, 2.9, 0); lamp.rotation.x = Math.PI / 2; env.add(lamp);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({color:'#7a5a3c'})); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.9; env.add(floor);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, .02).texture; scene.environmentIntensity = .4;
  }
  scene.background = new THREE.Color('#b9a68c');

  /* ---------------- lights: warm sun through the window, a soft room fill, the desk lamp ---------------- */
  const sun = new THREE.DirectionalLight('#ffc98a', 3.4); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  sun.position.set(40, 330, -330); sun.target.position.set(90, 0, -30);
  Object.assign(sun.shadow.camera, {left:-230, right:230, top:230, bottom:-230, near:50, far:900}); sun.shadow.bias = -.0002; sun.shadow.normalBias = .05; scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#a9c4e8', '#6a4a2c', .55));   /* cool sky fill against the warm sun */
  const lamp = new THREE.SpotLight('#ffcf8a', 5000, 160, .7, .6, 2); lamp.position.set(150, 110, -140); lamp.target.position.set(110, DESK_Y, -120); scene.add(lamp, lamp.target);

  /* ---------------- floor (parquet), rug, walls, window ---------------- */
  {
    const parquet = tex(1024, 1024, (g, w, h) => { const pw = 64, ph = 512;
      for (let x = 0; x < w; x += pw) for (let y = -((x / pw) % 2) * ph / 2; y < h; y += ph){ const t = .85 + rng() * .3; g.fillStyle = `rgb(${168 * t | 0},${118 * t | 0},${78 * t | 0})`; g.fillRect(x, y, pw, ph);
        for (let k = 0; k < 14; k++){ g.strokeStyle = `rgba(80,45,20,${.06 + rng() * .08})`; g.lineWidth = 1 + rng() * 2; g.beginPath(); const yy = y + rng() * ph; g.moveTo(x, yy); g.bezierCurveTo(x + pw * .3, yy + 30, x + pw * .6, yy - 30, x + pw, yy + (rng() - .5) * 40); g.stroke(); }
        g.fillStyle = 'rgba(40,22,10,.55)'; g.fillRect(x, y, 2, ph); g.fillRect(x, y, pw, 2); } });
    parquet.wrapS = parquet.wrapT = THREE.RepeatWrapping; parquet.repeat.set(8, 8);
    const floor = add(new THREE.PlaneGeometry(800, 800), M({map:parquet, roughness:.45, metalness:0}), 90, 0, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    /* the rug: a songket-style weave (deep blue and maroon, gold lozenges), small repeating motifs so it never reads as flat colour */
    const rugT = tex(2048, 1536, (g, w, h) => { g.fillStyle = '#7a2433'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f55a0'; g.fillRect(90, 90, w - 180, h - 180);
      g.strokeStyle = '#e2bf5a'; g.lineWidth = 10; g.strokeRect(60, 60, w - 120, h - 120); g.strokeRect(110, 110, w - 220, h - 220);
      for (let y = 140; y < h - 130; y += 26) for (let x = 140 + ((y / 26) % 2) * 13; x < w - 130; x += 26){ g.fillStyle = ((x / 13 + y / 26) | 0) % 3 ? '#e2bf5a' : '#f2e2b0'; g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 6, y); g.lineTo(x, y + 8); g.lineTo(x - 6, y); g.fill(); }
      for (let x = 70; x < w - 60; x += 24){ g.fillStyle = '#e2bf5a'; for (const yy of [75, h - 85]){ g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 12, yy + 10); g.lineTo(x, yy + 20); g.fill(); } }
      for (let n = 0; n < 60000; n++){ g.fillStyle = `rgba(${rng() < .5 ? '0,0,0' : '255,240,210'},${rng() * .07})`; g.fillRect(rng() * w, rng() * h, 2, 2); } });
    const rug = add(new THREE.PlaneGeometry(200, 150), M({map:rugT, roughness:.95}), 100, .12, 0); rug.rotation.x = -Math.PI / 2; rug.castShadow = false;
    const paper = tex(512, 512, (g, w, h) => { g.fillStyle = '#e6d6bc'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 64){ g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, 0, 22, h); g.fillStyle = 'rgba(150,110,60,.08)'; g.fillRect(x + 22, 0, 3, h); }
      for (let y = 16; y < h; y += 64) for (let x = 43; x < w; x += 64){ g.fillStyle = 'rgba(180,90,60,.18)'; g.beginPath(); for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2; g.ellipse(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 5, a, 0, 7); } g.fill(); } });
    paper.wrapS = paper.wrapT = THREE.RepeatWrapping; paper.repeat.set(14, 5);
    const wallM = M({map:paper, roughness:.92}), base = M({color:'#f7f2e8', roughness:.6});
    add(new THREE.BoxGeometry(520, 180, 2), wallM, 90, 90, -164); add(new THREE.BoxGeometry(2, 180, 420), wallM, -75, 90, 40); add(new THREE.BoxGeometry(2, 180, 420), wallM, 300, 90, 40);
    add(new THREE.BoxGeometry(520, 180, 2), wallM, 90, 90, 210); add(new THREE.BoxGeometry(520, 2, 420), wallM, 90, 181, 40);
    add(new THREE.BoxGeometry(520, 6, 2.6), base, 90, 3, -162.5); add(new THREE.BoxGeometry(2.6, 6, 420), base, -73.5, 3, 40); add(new THREE.BoxGeometry(2.6, 6, 420), base, 298.5, 3, 40);
    /* the window behind the desk: bright sky, mullions, curtains */
    const sky = tex(512, 384, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fb6ec'); gr.addColorStop(1, '#e8f3fb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 9; k++){ g.fillStyle = 'rgba(255,255,255,.85)'; const cx = rng() * w, cy = 40 + rng() * 160; for (let j = 0; j < 6; j++){ g.beginPath(); g.arc(cx + j * 18 - 40, cy + Math.sin(j) * 8, 18 + rng() * 16, 0, 7); g.fill(); } }
      g.fillStyle = '#7fae6a'; for (let x = 0; x < w; x += 6) g.fillRect(x, h - 50 - Math.sin(x * .05) * 12 - rng() * 10, 6, 80); });
    const pane = add(new THREE.PlaneGeometry(110, 80), new THREE.MeshBasicMaterial({map:sky, color:new THREE.Color(2.2, 2.2, 2.2)}), 95, 125, -162.8); pane.castShadow = false;
    const frameM = M({color:'#fbf8f2', roughness:.4});
    for (const x of [40, 95, 150]) add(new THREE.BoxGeometry(3, 84, 3), frameM, x, 125, -161.5); for (const y of [84, 125, 166]) add(new THREE.BoxGeometry(113, 3, 3), frameM, 95, y, -161.5);
    const cur = M({color:'#e8c96a', roughness:.85, side:THREE.DoubleSide});
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) add(new THREE.CylinderGeometry(3.4, 3.4, 110, 10, 1, true, 0, Math.PI), cur, 95 + s * (64 + k * 4.5), 115, -158);
    /* posters: a Sepang track map, the Jalur Gemilang, a class-of-2026 pennant */
    const poster = tex(512, 700, (g, w, h) => { g.fillStyle = '#f6efe0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 90); g.fillStyle = '#fff'; g.font = '900 54px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText('SEPANG 雪邦', w / 2, 64);
      g.strokeStyle = '#1d2433'; g.lineWidth = 14; g.lineJoin = 'round'; g.beginPath(); trk.C.forEach((p, i) => { const x = 60 + (p.x + 80) / 300 * 390, y = 160 + (p.z + 170) / 330 * 460; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
      g.fillStyle = '#1d2433'; g.font = '700 30px "Noto Sans SC",sans-serif'; g.fillText('CLASS OF 2026 · XMUM', w / 2, h - 30); });
    add(new THREE.PlaneGeometry(36, 50), M({map:poster, roughness:.7}), 198, 115, -162.9).castShadow = false;
    const flag = tex(512, 256, (g, w, h) => { for (let k = 0; k < 14; k++){ g.fillStyle = k % 2 ? '#fff' : '#c8102e'; g.fillRect(0, k * h / 14, w, h / 14 + 1); } g.fillStyle = '#0a2a6b'; g.fillRect(0, 0, w * .5, h * 8 / 14);
      g.fillStyle = '#ffcc00'; g.beginPath(); g.arc(w * .19, h * .29, h * .22, 0, 7); g.fill(); g.fillStyle = '#0a2a6b'; g.beginPath(); g.arc(w * .23, h * .29, h * .18, 0, 7); g.fill(); g.fillStyle = '#ffcc00'; g.beginPath(); for (let k = 0; k < 28; k++){ const a = k / 28 * 6.283, r = k % 2 ? h * .05 : h * .12; g.lineTo(w * .36 + Math.cos(a) * r, h * .29 + Math.sin(a) * r); } g.fill(); });
    const fl = add(new THREE.PlaneGeometry(48, 24), M({map:flag, roughness:.8}), -73.8, 120, -40); fl.rotation.y = Math.PI / 2; fl.castShadow = false;
  }

  /* ---------------- dorm life on the walls: fairy lights, a bookshelf, a whiteboard; sun shafts and dust in the window light ---------------- */
  {
    /* fairy lights: a warm bulb every 6 m, sagging between hooks along three walls (they melt into bokeh behind the cars) */
    const bulbs = [], wire = [];
    const run = (a, b, n, sag) => { for (let k = 0; k <= n; k++){ const t = k / n, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI * 4 % Math.PI) * sag; bulbs.push(p); } };
    run(new THREE.Vector3(-72, 150, -160), new THREE.Vector3(296, 150, -160), 62, 6); run(new THREE.Vector3(-72, 150, -160), new THREE.Vector3(-72, 150, 205), 60, 6); run(new THREE.Vector3(296, 150, -160), new THREE.Vector3(296, 150, 205), 60, 6);
    run(new THREE.Vector3(-72, 150, 206), new THREE.Vector3(296, 150, 206), 62, 6);
    const bulbG = new THREE.SphereGeometry(.9, 10, 8), bm = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({color:new THREE.Color(5, 3.4, 1.6)}), bulbs.length), m4 = new THREE.Matrix4();
    bulbs.forEach((p, k) => { m4.makeTranslation(p.x, p.y, p.z); bm.setMatrixAt(k, m4); bm.setColorAt(k, new THREE.Color().setHSL([.08, .12, .95, .55, .33][k % 5], .9, .6).multiplyScalar(4)); }); world.add(bm);
    /* bookshelf on the left wall */
    const shelfM = M({color:"#c79a6a", roughness:.6}), sx = -66, sz = 90;
    add(new THREE.BoxGeometry(14, 110, 70), shelfM, sx, 55, sz);
    const sb = [], cols = ['#8a1d1d', '#1d4f8a', '#2c6a3f', '#d8b24a', '#5a3d7a', '#e86a3a', '#f2ecdf', '#2b2f36'];
    for (const y of [12, 40, 68, 96]){ add(new THREE.BoxGeometry(14.4, 1.6, 70.4), shelfM, sx + 1, y - 1, sz); let z = sz - 32; while (z < sz + 30){ const w = 2 + rng() * 3, hh = 14 + rng() * 9; const b = new THREE.BoxGeometry(11, hh, w); b.translate(sx + 2, y + hh / 2, z + w / 2); const c = new THREE.Color(cols[Math.floor(rng() * cols.length)]); const n = b.attributes.position.count, ca = new Float32Array(n * 3); for (let v = 0; v < n; v++) c.toArray(ca, v * 3); b.setAttribute('color', new THREE.BufferAttribute(ca, 3)); sb.push(b); z += w + .3; } }
    { const o = new THREE.Mesh(mergeGeometries(sb), M({vertexColors:true, roughness:.75})); o.castShadow = o.receiveShadow = true; world.add(o); }
    /* whiteboard with a lap plan and a countdown to graduation */
    const wb = tex(1024, 640, (g, w, h) => { g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1d4f8a'; g.lineWidth = 6; g.font = '700 54px "Noto Sans SC",sans-serif'; g.fillStyle = '#c8102e'; g.fillText('毕业倒计时 · 12 天', 50, 90);
      g.fillStyle = '#1d4f8a'; g.font = '500 36px "Noto Sans SC",sans-serif'; ['1. 交 CME225 报告', '2. 退宿舍钥匙', '3. 最后一次雪邦 ✓'].forEach((t, k) => g.fillText(t, 60, 180 + k * 60));
      g.beginPath(); g.ellipse(760, 360, 170, 110, .3, 0, 7); g.stroke(); g.fillStyle = '#2c6a3f'; g.fillText('LAP 4 / 4', 680, 370); });
    const wbo = add(new THREE.PlaneGeometry(64, 40), M({map:wb, roughness:.3}), 297, 110, -60); wbo.rotation.y = -Math.PI / 2; wbo.castShadow = false;
    add(new THREE.BoxGeometry(1.5, 42, 66), M({color:'#c9ced6', metalness:.7, roughness:.3}), 298.5, 110, -60);
    /* sun shafts from the window: additive soft quads */
    const shaft = tex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,230,190,.55)'); gr.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); });
    const shM = new THREE.MeshBasicMaterial({map:shaft, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, opacity:.35, fog:false});
    for (let k = 0; k < 6; k++){ const sh = new THREE.Mesh(new THREE.PlaneGeometry(14 + rng() * 10, 260), shM); sh.position.set(60 + k * 14, 95, -95); sh.rotation.set(-.85, (rng() - .5) * .3, 0); sh.renderOrder = 8; world.add(sh); }
    /* dust motes drifting in the light */
    const dn = 700, dp = new Float32Array(dn * 3); for (let k = 0; k < dn; k++){ dp[k * 3] = 40 + rng() * 110; dp[k * 3 + 1] = 10 + rng() * 150; dp[k * 3 + 2] = -150 + rng() * 170; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({color:new THREE.Color(2.2, 2, 1.6), size:.35, transparent:true, opacity:.6, depthWrite:false, blending:THREE.AdditiveBlending})); dust.renderOrder = 8; world.add(dust);
    world.userData.dust = dust;
  }

  /* ---------------- more of the room: wainscot, cork board with polaroids, a clock, the door, a ceiling lamp, a plant ---------------- */
  {
    const panel = M({color:'#8c5a34', roughness:.55}), trimM = M({color:'#6e4426', roughness:.5});
    for (const [x, z, w, d] of [[90, -162.6, 520, 1], [-73.6, 40, 1, 420], [298.6, 40, 1, 420], [90, 208.6, 520, 1]]){ add(new THREE.BoxGeometry(w, 44, d), panel, x, 22, z).castShadow = false; add(new THREE.BoxGeometry(w + (d > w ? 1 : 0), 2, d + (d > w ? 0 : 1)), trimM, x, 44.5, z); }
    /* cork board with polaroids of the four years */
    const cork = tex(1024, 640, (g, w, h) => { g.fillStyle = '#b98a55'; g.fillRect(0, 0, w, h); for (let n = 0; n < 9000; n++){ g.fillStyle = `rgba(${rng() < .5 ? '90,55,25' : '230,190,140'},${rng() * .25})`; g.fillRect(rng() * w, rng() * h, 3, 3); }
      const caps = ['大一 · 第一次到 KLIA', '大二 · mamak 看球', '大三 · 一个人看雨', '大四 · 雪邦最后一圈', '毕业典礼 2026', '宿舍 B4-12'];
      caps.forEach((t, k) => { const x = 60 + (k % 3) * 320, y = 40 + Math.floor(k / 3) * 300, r = (rng() - .5) * .2; g.save(); g.translate(x + 120, y + 130); g.rotate(r); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-116, -126, 240, 270);
        g.fillStyle = '#fbfaf6'; g.fillRect(-120, -130, 240, 270); const gr = g.createLinearGradient(0, -110, 0, 90); gr.addColorStop(0, ['#7fb6ec', '#f2b25a', '#5a7fa8', '#ff8a3a', '#c8102e', '#3f9a45'][k]); gr.addColorStop(1, '#2b2f36'); g.fillStyle = gr; g.fillRect(-104, -114, 208, 190);
        g.fillStyle = '#2b2f36'; g.font = '600 22px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText(t, 0, 115); g.fillStyle = '#d8182a'; g.beginPath(); g.arc(0, -122, 9, 0, 7); g.fill(); g.restore(); }); });
    add(new THREE.BoxGeometry(70, 44, 1.6), M({map:cork, roughness:.95}), 232, 110, -162.4);
    add(new THREE.BoxGeometry(73, 47, 1.2), M({color:'#6e4426', roughness:.5}), 232, 110, -163);
    /* wall clock on the left wall */
    const clockT = tex(256, 256, (g, w, h) => { g.fillStyle = '#fbfaf6'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.fillStyle = '#2b2f36'; for (let k = 0; k < 12; k++){ const a = k / 12 * 6.283; g.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 10, 6, 20); }
      g.strokeStyle = '#2b2f36'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(178, 98); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(108, 43); g.stroke(); g.fillStyle = '#d8182a'; g.font = '700 20px sans-serif'; g.textAlign = 'center'; g.fillText('XMUM', 128, 180); });
    const clk = add(new THREE.CylinderGeometry(14, 14, 2.4, 40), [M({color:'#2b2f36', roughness:.4}), M({map:clockT, roughness:.4}), M({color:'#2b2f36'})], -72.5, 140, 30); clk.rotation.z = -Math.PI / 2;
    /* the door on the front wall */
    add(new THREE.BoxGeometry(60, 130, 2), M({color:'#f2ebdd', roughness:.6}), 230, 65, 208.6); add(new THREE.BoxGeometry(66, 134, 1.2), M({color:'#6e4426', roughness:.5}), 230, 66, 209.2); add(new THREE.SphereGeometry(2.2, 16, 12), M({color:'#d8b24a', metalness:.9, roughness:.25}), 205, 62, 206.8);
    /* ceiling lamp, warm */
    add(new THREE.CylinderGeometry(.5, .5, 22, 8), M({color:'#2b2f36'}), 110, 170, 10); add(new THREE.CylinderGeometry(14, 22, 10, 32, 1, true), M({color:'#f2ebdd', roughness:.6, side:THREE.DoubleSide}), 110, 156, 10);
    add(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({color:new THREE.Color(4, 3.4, 2.4)}), 110, 152, 10, world, false);
    /* a potted plant in the corner */
    add(new THREE.CylinderGeometry(9, 7, 16, 24), M({color:'#c4632a', roughness:.7}), -55, 8, -140);
    for (let k = 0; k < 14; k++){ const leaf = add(new THREE.SphereGeometry(5, 12, 8), M({color:k % 2 ? '#3f9a45' : '#2c7a3a', roughness:.6}), -55 + Math.cos(k) * 6, 22 + (k % 5) * 5, -140 + Math.sin(k) * 6); leaf.scale.set(.6, 1.6, .25); leaf.rotation.set(Math.sin(k) * .6, k, Math.cos(k) * .5); }
  }

  /* ---------------- the desk ---------------- */
  {
    const wood = tex(1024, 512, (g, w, h) => { g.fillStyle = '#b07a48'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 140; k++){ g.strokeStyle = `rgba(${90 + rng() * 40 | 0},${50 + rng() * 20 | 0},20,${.12 + rng() * .15})`; g.lineWidth = 1 + rng() * 4; g.beginPath(); const y = rng() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * .01 + k) * 6 + (rng() - .5) * 3); g.stroke(); } });
    const top = MP({map:wood, roughness:.35, clearcoat:.5, clearcoatRoughness:.3});
    add(new THREE.BoxGeometry(DESK.x1 - DESK.x0, 3, DESK.z1 - DESK.z0), top, (DESK.x0 + DESK.x1) / 2, DESK_Y - 1.5, (DESK.z0 + DESK.z1) / 2);
    const legM = M({color:'#ece6dc', roughness:.5, metalness:.2});
    for (const x of [DESK.x0 + 3, DESK.x1 - 3]) for (const z of [DESK.z0 + 3, DESK.z1 - 3]) add(new THREE.BoxGeometry(3, DESK_Y - 3, 3), legM, x, (DESK_Y - 3) / 2, z);
    add(new THREE.BoxGeometry(34, 30, 56), M({color:'#efe9df', roughness:.6}), DESK.x1 - 22, 31, (DESK.z0 + DESK.z1) / 2);
  }

  /* ---------------- things on the desk ---------------- */
  {
    const Y = DESK_Y;
    /* laptop: the screen shows the game's HUD */
    const scr = tex(1024, 640, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#173a74'); gr.addColorStop(1, '#0b1730'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff8a3a'; g.font = '900 90px "Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.fillText('雪邦赛车城', w / 2, 250); g.fillStyle = '#f4ead6'; g.font = '600 40px "Noto Sans SC",sans-serif'; g.fillText('XMUM · 毕业篇 · 第 4 圈', w / 2, 330);
      g.fillStyle = '#ffd23a'; g.fillRect(w / 2 - 160, 400, 320, 70); g.fillStyle = '#0b1730'; g.font = '800 40px sans-serif'; g.fillText('START', w / 2, 448); });
    const lap = new THREE.Group(); lap.position.set(118, Y, -149); world.add(lap);
    add(new THREE.BoxGeometry(30, 1.2, 20), M({color:'#c9ced6', roughness:.3, metalness:.8}), 0, .6, 0, lap);
    const lid = new THREE.Group(); lid.position.set(0, 1.2, -10); lid.rotation.x = -.32; lap.add(lid);
    add(new THREE.BoxGeometry(30, 20, .8), M({color:'#c9ced6', roughness:.3, metalness:.8}), 0, 10, -.4, lid);
    add(new THREE.PlaneGeometry(28, 18), new THREE.MeshBasicMaterial({map:scr, color:new THREE.Color(1.4, 1.4, 1.4)}), 0, 10, .05, lid, false);
    /* mug */
    const mugT = tex(512, 256, (g, w, h) => { g.fillStyle = '#f6f2ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#103b7a'; g.font = '900 70px "Noto Serif SC",serif'; g.textAlign = 'center'; g.fillText('XMUM', w * .25, h * .6); g.fillStyle = '#c9a24a'; g.fillRect(0, h - 26, w, 10); });
    const mugM = MP({map:mugT, roughness:.15, clearcoat:1, clearcoatRoughness:.12});
    add(new THREE.CylinderGeometry(5, 4.6, 11, 40, 1, true), mugM, 82, Y + 5.5, -150); add(new THREE.CylinderGeometry(4.5, 4.5, .4, 40), M({color:'#3a2214', roughness:.1}), 82, Y + 9.8, -150);
    add(new THREE.CylinderGeometry(4.6, 4.6, .6, 40), mugM, 82, Y + .3, -150);
    const h = add(new THREE.TorusGeometry(2.8, .8, 12, 24, Math.PI), mugM, 87, Y + 5.5, -150); h.rotation.z = -Math.PI / 2;
    /* textbooks */
    const book = (w, d, t, col, title, x, y, z, ry) => { const sp = tex(512, 64, (g, W, H) => { g.fillStyle = col; g.fillRect(0, 0, W, H); g.fillStyle = '#f4ead6'; g.font = '700 34px "Noto Sans SC",sans-serif'; g.textBaseline = 'middle'; g.fillText(title, 20, H / 2); });
      const mats = [M({map:sp, roughness:.7}), M({color:col, roughness:.7}), M({color:col, roughness:.7}), M({color:col, roughness:.7}), M({color:'#f2ecdf', roughness:.9}), M({color:'#f2ecdf', roughness:.9})];
      const b = add(new THREE.BoxGeometry(w, t, d), mats, x, y + t / 2, z); b.rotation.y = ry; return b; };
    book(26, 18, 3.2, '#8a1d1d', 'CALCULUS II', 142, Y, -150, .1); book(24, 17, 2.6, '#1d4f8a', 'CME225 LAB', 141, Y + 3.2, -150, -.08); book(25, 18, 2.2, '#2c6a3f', '马来语入门', 142, Y + 5.8, -149, .2);
    /* the giant 奶娃 plush, sitting at the back of the desk, watching the race */
    world.add(naiwaPlush(58, Y, -146, 13));
    /* desk lamp */
    const lm = M({color:'#2b2f36', roughness:.4, metalness:.6});
    add(new THREE.CylinderGeometry(6, 7, 1.4, 32), lm, 150, Y + .7, -150);
    const arm1 = add(new THREE.CylinderGeometry(.6, .6, 40, 10), lm, 150, Y + 20, -146); arm1.rotation.x = .3;
    const arm2 = add(new THREE.CylinderGeometry(.6, .6, 30, 10), lm, 150, Y + 42, -128); arm2.rotation.x = 1.6;
    const shade = add(new THREE.ConeGeometry(7, 9, 24, 1, true), M({color:'#2b2f36', roughness:.4, metalness:.6, side:THREE.DoubleSide}), 150, Y + 40, -114); shade.rotation.x = -.5;
    add(new THREE.SphereGeometry(2.6, 16, 10), new THREE.MeshBasicMaterial({color:new THREE.Color(6, 5, 3.4)}), 150, Y + 37, -112, world, false);
    /* a Petronas twin towers souvenir */
    const st = M({color:'#d9e1ea', roughness:.2, metalness:.9}); const pt = new THREE.Group(); pt.position.set(44, Y, -150); world.add(pt);
    add(new THREE.BoxGeometry(14, 1.2, 8), M({color:'#1f2a3a', roughness:.3}), 0, .6, 0, pt);
    for (const s of [-1, 1]){ let y = 1.2, r = 1.7; for (const [hh, k] of [[12, 1], [4, .88], [3, .76], [2, .62], [1.6, .5]]){ add(new THREE.CylinderGeometry(r * k * .96, r * k, hh, 16), st, s * 3.3, y + hh / 2, 0, pt); y += hh; } add(new THREE.ConeGeometry(.3, 6, 8), st, s * 3.3, y + 3, 0, pt); }
    add(new THREE.BoxGeometry(5, .6, .6), st, 0, 13, 0, pt);
    /* pencils and a sticky note scattered */
    const pencil = (x, y, z, ry, col) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; world.add(g);
      add(new THREE.CylinderGeometry(.55, .55, 22, 6), M({color:col, roughness:.5}), 0, .55, 0, g).rotation.z = Math.PI / 2;
      add(new THREE.ConeGeometry(.55, 3, 6), M({color:'#e8c9a0', roughness:.7}), 12.5, .55, 0, g).rotation.z = -Math.PI / 2;
      add(new THREE.CylinderGeometry(.56, .56, 1.6, 6), M({color:'#e88aa0', roughness:.8}), -11.8, .55, 0, g).rotation.z = Math.PI / 2; };
    pencil(70, Y, -100, .4, '#f2c230'); pencil(60, 0, 40, 1.2, '#2f6fd6');
    const note = add(new THREE.PlaneGeometry(10, 10), M({color:'#ffe96a', roughness:.9}), 100, Y + .05, -100); note.rotation.x = -Math.PI / 2; note.rotation.z = .2;
  }

  /* ---------------- the floor: bed, slippers, a 建南 paper model ---------------- */
  {
    add(new THREE.BoxGeometry(80, 26, 190), M({color:'#d9cbb5', roughness:.8}), 255, 13, 30);
    const blanket = tex(512, 512, (g, w, h) => { g.fillStyle = '#5b8fcf'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 64){ g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, 0, 20, h); } for (let y = 0; y < h; y += 64){ g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y, w, 20); } });
    add(new THREE.BoxGeometry(84, 6, 150), M({map:blanket, roughness:.95}), 255, 29, 50);
    add(new THREE.BoxGeometry(60, 8, 26), M({color:'#f4f1ea', roughness:.9}), 255, 30, -50);
    const slip = M({color:'#e86a8a', roughness:.8});
    for (const [x, z, r] of [[-30, 60, .3], [-18, 66, -.2]]){ const s = add(new THREE.BoxGeometry(10, 2.4, 24), slip, x, 1.2, z); s.rotation.y = r; }
    /* 建南大礼堂, a paper model */
    const paper = M({color:'#f3eee4', roughness:.95}), red = M({color:'#c4402a', roughness:.8}), gold = M({color:'#e2b24a', roughness:.4, metalness:.6});
    const hall = new THREE.Group(); hall.position.set(150, 0, -60); hall.rotation.y = -.5; world.add(hall);
    add(new THREE.BoxGeometry(20, 10, 12), paper, 0, 5, 0, hall); for (const s of [-1, 1]){ add(new THREE.BoxGeometry(14, 7, 10), paper, s * 17, 3.5, 1, hall); const r = add(new THREE.ConeGeometry(10, 3, 4), red, s * 17, 8.5, 1, hall); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, .75); }
    add(new THREE.CylinderGeometry(5, 5, 3, 24), paper, 0, 11.5, 0, hall); add(new THREE.SphereGeometry(5, 24, 12, 0, 6.283, 0, Math.PI / 2), gold, 0, 13, 0, hall);
  }

  /* ---------------- the track: orange plastic, six lanes, rails, joints every 19 m (30 cm pieces) ---------------- */
  {
    const n = trk.n, run = [];
    for (let k = 0; k < n; k++){ const i = (trk.gap[1] + k) % n; if (trk.inGap(i)) break; run.push(i); }
    const laneT = tex(512, 1024, (g, w, h) => { g.fillStyle = '#ff6f12'; g.fillRect(0, 0, w, h);
      for (let k = 1; k < 4; k++){ g.fillStyle = 'rgba(255,248,236,.9)'; for (let y = 0; y < h; y += 128) g.fillRect(k * w / 4 - 4, y, 8, 70); }
      g.fillStyle = 'rgba(255,248,236,.95)'; g.fillRect(10, 0, 8, h); g.fillRect(w - 18, 0, 8, h);
      g.fillStyle = 'rgba(150,50,0,.35)'; g.save(); g.translate(w / 2, h * .55); for (let k = -1; k <= 1; k++){ g.beginPath(); g.moveTo(-60, k * 60 + 30); g.lineTo(0, k * 60 - 10); g.lineTo(60, k * 60 + 30); g.lineTo(60, k * 60 + 50); g.lineTo(0, k * 60 + 10); g.lineTo(-60, k * 60 + 50); g.fill(); } g.restore();
      g.fillStyle = 'rgba(120,40,0,.45)'; g.fillRect(0, h - 6, w, 6); g.fillStyle = 'rgba(255,220,180,.35)'; g.fillRect(0, h - 10, w, 3);
      for (let n2 = 0; n2 < 1500; n2++){ g.fillStyle = `rgba(255,255,255,${rng() * .05})`; g.fillRect(rng() * w, rng() * h, 2, 2); } });
    laneT.wrapT = THREE.RepeatWrapping;
    const plastic = MP({map:laneT, roughness:.28, clearcoat:.6, clearcoatRoughness:.2, sheen:0});
    const railM = MP({color:'#ff6a10', roughness:.25, clearcoat:.8, clearcoatRoughness:.15});
    const sweep = (prof, mat, uScale) => {
      const pos = [], uv = [], idx = [], m = prof.length;
      run.forEach((i, r) => { const p = trk.C[i], R = trk.R[i], U = trk.U[i], s = r * trk.ds;
        prof.forEach(([l, hgt, u]) => { pos.push(p.x + R.x * l + U.x * hgt, p.y + R.y * l + U.y * hgt, p.z + R.z * l + U.z * hgt); uv.push(u, s / uScale); }); });
      for (let r = 0; r < run.length - 1; r++) for (let k = 0; k < m - 1; k++){ const a = r * m + k, b = a + m; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const o = new THREE.Mesh(g, mat); o.castShadow = true; o.receiveShadow = true; o.userData.track = true; world.add(o); return o; };
    const W = HWT, T = .5;
    sweep([[W, 0, 1], [-W, 0, 0]], plastic, 19.2);                                   /* driving surface */
    sweep([[-W, 0, 0], [-W, RAIL, .3], [-W - .4, RAIL, .5], [-W - .4, -T, 1]], railM, 4); /* left rail */
    sweep([[W + .4, -T, 0], [W + .4, RAIL, .5], [W, RAIL, .7], [W, 0, 1]], railM, 4);   /* right rail */
    sweep([[-W - .4, -T, 0], [W + .4, -T, 1]], railM, 4);                             /* underside */
    /* joints: darker connector tabs every 19.2 m */
    const tabs = [];
    for (let r = 0; r < run.length; r += 19){ const i = run[r], p = trk.C[i], R = trk.R[i], U = trk.U[i], Tt = trk.T[i];
      for (const s of [-1, 1]){ const b = new THREE.BoxGeometry(.6, RAIL + .3, 1.6); const m4 = new THREE.Matrix4().makeBasis(R, U, Tt); m4.setPosition(p.x + R.x * s * (W + .45) + U.x * (RAIL / 2 - .1), p.y + R.y * s * (W + .45) + U.y * (RAIL / 2 - .1), p.z + R.z * s * (W + .45) + U.z * (RAIL / 2 - .1)); b.applyMatrix4(m4); tabs.push(b); } }
    const tm = new THREE.Mesh(mergeGeometries(tabs), MP({color:'#d84e06', roughness:.3, clearcoat:.6})); tm.castShadow = true; world.add(tm);
    /* start line: checkered strip on the desk */
    const chk = tex(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16){ g.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#f4f4f0'; g.fillRect(x, y, 16, 16); } });
    { const i = trk.start, p = trk.C[i], b = new THREE.PlaneGeometry(2 * W, 3); b.rotateX(-Math.PI / 2); const m4 = new THREE.Matrix4().makeBasis(trk.R[i], trk.U[i], trk.T[i]); b.applyMatrix4(new THREE.Matrix4().makeRotationY(0)); const o = new THREE.Mesh(b, M({map:chk, roughness:.5}));
      o.matrixAutoUpdate = false; m4.setPosition(p.x + trk.U[i].x * .03, p.y + .03, p.z + trk.U[i].z * .03); o.matrix.copy(m4).multiply(new THREE.Matrix4().makeRotationX(0)); world.add(o); }
    /* supports: book stacks under the high parts, orange pylons under the low ones */
    const pyl = [], books = [], bookCols = ['#8a1d1d', '#1d4f8a', '#2c6a3f', '#d8b24a', '#5a3d7a', '#e86a3a', '#3f7f8a'];
    for (let r = 10; r < run.length; r += 22){ const i = run[r], p = trk.C[i]; if (trk.U[i].y < .8) continue;
      const over = p.x > DESK.x0 && p.x < DESK.x1 && p.z > DESK.z0 && p.z < DESK.z1, gy = over ? DESK_Y : 0, hgt = p.y - .5 - gy; if (hgt < 1.2) continue;
      if (false){   /* book stacks: wider than the track, they kept filling the camera; plastic pylons like the real sets */ let y = 0; const ry = Math.atan2(trk.T[i].x, trk.T[i].z); while (y < hgt - 2.5){ const t = 2 + rng() * 2.6, w = 10 + rng() * 2.5, d = 7.5 + rng() * 2; const b = new THREE.BoxGeometry(w, Math.min(t, hgt - y), d); b.translate((rng() - .5) * 1.5, y + Math.min(t, hgt - y) / 2, (rng() - .5) * 1.5); b.rotateY(ry + (rng() - .5) * .25); b.translate(p.x, gy, p.z);
          const c = new THREE.Color(bookCols[Math.floor(rng() * bookCols.length)]), cnt = b.attributes.position.count, ca = new Float32Array(cnt * 3); for (let v = 0; v < cnt; v++) c.toArray(ca, v * 3); b.setAttribute('color', new THREE.BufferAttribute(ca, 3)); books.push(b); y += t; }
        const tp = new THREE.CylinderGeometry(1.2, 1.2, Math.max(.2, hgt - y), 12); tp.translate(p.x, gy + y + (hgt - y) / 2, p.z); pyl.push(tp); }
      else { const c = new THREE.CylinderGeometry(.8, 1.2, hgt, 12); c.translate(p.x, gy + hgt / 2, p.z); pyl.push(c); const foot = new THREE.CylinderGeometry(3.2, 3.6, .8, 20); foot.translate(p.x, gy + .4, p.z); pyl.push(foot); } }
    if (pyl.length){ const o = new THREE.Mesh(mergeGeometries(pyl), railM); o.castShadow = true; world.add(o); }
    if (books.length){ const o = new THREE.Mesh(mergeGeometries(books), M({vertexColors:true, roughness:.75})); o.castShadow = o.receiveShadow = true; world.add(o); }
    /* boosters: two spinning tyres either side, Hot-Wheels style */
    trk.boosterMeshes = [];
    for (const bi of trk.booster){ const p = trk.C[bi], R = trk.R[bi], U = trk.U[bi], Tt = trk.T[bi];
      const g = new THREE.Group(); const m4 = new THREE.Matrix4().makeBasis(R, U, Tt); g.matrixAutoUpdate = false; m4.setPosition(p.x, p.y, p.z); g.matrix.copy(m4); world.add(g);
      add(new THREE.BoxGeometry(2 * W + 6, 1.2, 8), M({color:'#2a2d33', roughness:.5}), 0, 7.5, 0, g); add(new THREE.BoxGeometry(2 * W - 2, .9, 2.4), new THREE.MeshBasicMaterial({color:new THREE.Color(3.5, 1.2, .2)}), 0, 6.8, 0, g, false);
      for (const s of [-1, 1]){ add(new THREE.BoxGeometry(2, 7, 8), M({color:'#2a2d33', roughness:.5}), s * (W + 2), 3.5, 0, g);
        const tyre = add(new THREE.TorusGeometry(1.6, .9, 10, 24), M({color:'#151619', roughness:.8}), s * (W - .2), 1.9, 0, g); tyre.rotation.x = Math.PI / 2; trk.boosterMeshes.push(tyre); } }
  }
  /* what the chase camera must not go through: solid things, not the track, not glow or glass */
  const blockers = []; world.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.track && !(o.material && (o.material.transparent || o.material.isMeshBasicMaterial))) blockers.push(o); });
  return {sun, lamp, blockers, update(t){ const d = world.userData.dust; if (d){ d.position.y = Math.sin(t * .2) * 1.5; d.position.x = Math.sin(t * .13) * 2; } }};
}

/* a plush 奶娃 (the project's mascot, js/30-naiwa.js), stuffed-toy version: yellow pear body, cream belly, big green eyes */
const NW = [[0, .5], [.2, .515], [.34, .58], [.425, .69], [.455, .82], [.445, .96], [.405, 1.1], [.345, 1.25], [.285, 1.39], [.228, 1.52], [.19, 1.63], [.158, 1.71], [.112, 1.78], [0, 1.825]];
export function naiwaPlush(x, y, z, s){
  const root = new THREE.Group(); root.position.set(x, y, z); root.scale.setScalar(s);
  const fuzz = c => new THREE.MeshPhysicalMaterial({color:c, roughness:.85, sheen:1, sheenRoughness:.5, sheenColor:new THREE.Color('#fff4c8')});
  const yellow = fuzz('#f2c64a'), cream = fuzz('#eee0ba'), dark = new THREE.MeshStandardMaterial({color:'#141210', roughness:.2}), iris = new THREE.MeshPhysicalMaterial({color:'#86c873', roughness:.15, clearcoat:1, clearcoatRoughness:.12}), olive = fuzz('#55532c');
  const prof = new THREE.SplineCurve(NW.map(([r, yy]) => new THREE.Vector2(r, yy - .5))).getPoints(40); prof[0].x = .004; prof[prof.length - 1].x = .004;   /* never exactly on the axis: degenerate normals there turn into NaN and blank the whole frame through the bloom */
  const body = new THREE.LatheGeometry(prof, 48), bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++){ const X = bp.getX(i), Y = bp.getY(i) + .5, Z = bp.getZ(i); const belly = Z > 0 ? 1 + .2 * Math.exp(-Math.pow((Y - .86) / .3, 2)) : .93; const t = Math.max(0, Math.min(1, (Y - .95) / .87)); bp.setXYZ(i, X * .97, Y, Z * belly + .14 * t * t * (3 - 2 * t)); }
  body.computeVertexNormals(); { const nn = body.attributes.normal; for (let i = 0; i < nn.count; i++) if (!isFinite(nn.getX(i)) || !isFinite(nn.getY(i)) || !isFinite(nn.getZ(i)) || (nn.getX(i) === 0 && nn.getY(i) === 0 && nn.getZ(i) === 0)) nn.setXYZ(i, 0, 1, 0); }
  const m = (g, mat, px, py, pz) => { const o = new THREE.Mesh(g, mat); o.position.set(px, py, pz); o.castShadow = true; o.receiveShadow = true; root.add(o); return o; };
  m(body, yellow, 0, 0, 0);
  const bel = m(new THREE.SphereGeometry(.33, 32, 20), cream, 0, 1.0, .25); bel.scale.set(1.05, 1.25, .55);
  for (const sx of [-1, 1]){ const e = m(new THREE.SphereGeometry(.075, 20, 14), iris, sx * .13, 1.69, .2); e.scale.set(1, 1, .7);
    m(new THREE.SphereGeometry(.035, 12, 8), dark, sx * .13, 1.69, .25); m(new THREE.SphereGeometry(.012, 8, 6), new THREE.MeshBasicMaterial({color:'#fff'}), sx * .12, 1.71, .27);
    const leg = m(new THREE.CapsuleGeometry(.12, .3, 6, 12), yellow, sx * .2, .35, .25); leg.rotation.x = 1.3;
    const foot = m(new THREE.SphereGeometry(.16, 16, 10), olive, sx * .22, .32, .62); foot.scale.set(1, .45, 1.4);
    const arm = m(new THREE.CapsuleGeometry(.08, .35, 6, 12), yellow, sx * .43, 1.0, .1); arm.rotation.z = sx * .5; }
  const mouth = m(new THREE.SphereGeometry(.5, 16, 8), dark, 0, 1.6, .3); mouth.scale.set(.1, .016, .03);
  return root;
}
