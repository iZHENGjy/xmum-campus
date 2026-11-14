/* XMUM 校园漫游 · 雪邦结尾一圈「路在当下」：第一段「路变成校园」（约 30 秒，方案 docs/sepang-ending.md 第三版）
 *
 * 做什么：雨后黄昏，第一人称坐在 XMUM 兰博基尼的驾驶舱里（游戏画风的车内，方向盘上是奶娃橄榄色的三指小手），
 *   从地图东边外面的「雪邦主直道」（临时搭的赛道：宽路面、红白路肩、护墙、看台上的奶娃观众、起点门楼）一路往西开，
 *   身边几辆车抢道，车里坐着穿各种衣服的奶娃。开进地图后，赛道慢慢收窄成校门前的 Jalan Sunsuria，
 *   右手边原本沉在地下的校园一栋栋升起来（A2、A3 百姓大楼、A4、A5……），朋友们往前开走，你右转进南门，朝 A3 开过去。
 *   字幕是内心独白（中文为主，混一点马来语）。
 * 写法：和 js/89-cine.js 一样——播放时 gx.paused = true，在 gx.frame 外面包一层每帧摆相机；临时场景放在地图外，
 *   播完从 scene 移除并释放；校园建筑用 structures 里的 group（js/00-core.js regGroup 记了原位 userData.base）上下移动，播完还原。
 * 对外：window.XSepang = {play({onDone}), stop(), get busy(), step(dt) 逐帧推（录像用）, capture(name) 存一张图（测试用）}
 * 测试：离线页 /test/offline.html，控制台 XSepang.play()；?bot 不用，自动开。 */
'use strict';
(() => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  /* r128 has no CapsuleGeometry: the game's own capsule (js/30-naiwa.js), centred */
  const cap = (r, len) => nwCapsule(r, r, len, 10).translate(0, len / 2, 0);
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const SH = () => !TOUCH && !(typeof XQ !== 'undefined' && XQ.tier === 0);
  const ROAD_Z = 271, SEP_X0 = 640, START_X = 1260, GATE_LANE = (typeof GX !== 'undefined' ? GX : 105) + 11.2;

  /* ---------------- the route: west along Jalan Sunsuria, right into the south gate, up towards A3 ---------------- */
  const PATH = new THREE.CatmullRomCurve3([
    V(START_X, 0, 279), V(900, 0, 279), V(700, 0, 278), V(560, 0, ROAD_Z + 1), V(380, 0, ROAD_Z), V(200, 0, ROAD_Z), V(150, 0, ROAD_Z - .5),
    V(GATE_LANE + 6, 0, ROAD_Z - 3), V(GATE_LANE, 0, ROAD_Z - 12), V(GATE_LANE - 3, 0, 240), V(110, 0, 226), V(109, 0, 214)], false, 'centripetal');   /* through the east lane of the gate, onto the plaza towards the statue and A3 */
  const PL = PATH.getLength();
  /* where along the path the Sepang track ends and the campus road begins (by x) */
  const sAtX = x => { let lo = 0, hi = 1; for (let k = 0; k < 30; k++){ const m = (lo + hi) / 2; if (PATH.getPointAt(m).x > x) lo = m; else hi = m; } return lo * PL; };

  /* ---------------- state ---------------- */
  const C = {busy:false, t:0, set:null, cars:[], me:null, rivals:[], saved:null, prevFrame:null, onDone:null, cam:{look:0}, ui:null, struct:[], barrier:[]};

  /* ---------------- overlay: letterbox, monologue subtitles (a 2D canvas, so a recording can copy it) ---------------- */
  function uiMake(){
    const cv = document.createElement('canvas'); cv.id = 'sepangUI'; Object.assign(cv.style, {position:'fixed', inset:'0', width:'100vw', height:'100vh', pointerEvents:'none', zIndex:60});
    document.body.appendChild(cv); return {cv, g:cv.getContext('2d')};
  }
  const LINES = [[1.5, 6.5, '大一。一个人，拖着两个箱子。'], [7.5, 12.5, 'Selamat datang. 那时候什么都是新的。'], [14.5, 19.5, '然后，路就变成了校园的路。'], [23.5, 29.5, '南门。四年，从这里开始。']];
  function uiDraw(cv, g, w, h){
    cv.width = w; cv.height = h; const s = h / 720, bar = h * .09 * Math.min(1, C.t / 1.2);
    g.clearRect(0, 0, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, bar); g.fillRect(0, h - bar, w, bar);
    for (const [a, b, t] of LINES){ if (C.t < a || C.t > b) continue; const k = Math.min(1, (C.t - a) / .8, (b - C.t) / .8);
      g.globalAlpha = k; g.textAlign = 'center'; g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 8 * s; g.fillStyle = '#fbf3e4';
      g.font = `italic 500 ${25 * s}px "Noto Sans SC","Microsoft YaHei",sans-serif`; g.fillText(t, w / 2, h - bar - 30 * s); g.globalAlpha = 1; g.shadowBlur = 0; }
    if (C.t < 3){ g.globalAlpha = Math.min(1, (3 - C.t) * 1.5); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }   /* fade in */
  }

  /* ---------------- the temporary Sepang straight (east of the map) ---------------- */
  const tex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO; return t; };
  function buildSet(){
    const root = new THREE.Group(); root.name = 'sepangSet'; scene.add(root);
    const mats = [], geos = [], texs = [];
    const mesh = (geo, mat, cast) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast && SH(); m.receiveShadow = true; root.add(m); geos.push(geo); return m; };
    const mat = o => { const m = new THREE.MeshStandardMaterial(Object.assign({roughness:.8}, o)); mats.push(m); return m; };
    /* the track surface: 30 m wide from the east end to x = 640, then it narrows into the north carriageway by x = 420 */
    const asphaltT = tex(256, 256, (c, w, h) => { c.fillStyle = '#4a4d52'; c.fillRect(0, 0, w, h); for (let n = 0; n < 3500; n++){ c.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${.03 + Math.random() * .05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.fillStyle = 'rgba(20,20,22,.35)'; c.fillRect(w * .32, 0, w * .1, h); c.fillRect(w * .58, 0, w * .1, h); });   /* rubbered racing lines */
    asphaltT.wrapS = asphaltT.wrapT = THREE.RepeatWrapping; texs.push(asphaltT);
    const road = mat({map:asphaltT, roughness:.12, metalness:.0, color:'#9a9da3', envMapIntensity:1});   /* wet: smooth, it mirrors the dusk */
    const pos = [], uv = [], idx = []; let n = 0;
    for (let x = START_X + 40; x >= 400; x -= 8){
      const k = ss(640, 420, x), z0 = 264 + (ROAD_Z - 3.6 - 264) * k, z1 = 294 + (ROAD_Z + 3.6 - 294) * k, y = .045;
      pos.push(x, y, z0, x, y, z1); uv.push((START_X - x) / 12, 0, (START_X - x) / 12, (z1 - z0) / 12);
      if (n) idx.push(n - 2, n - 1, n, n - 1, n + 1, n); n += 2; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    mesh(rg, road);
    /* white edge lines and red-and-white kerbs, both sides, on the Sepang part only */
    const kerbT = tex(64, 16, (c, w, h) => { for (let x = 0; x < w; x += 16){ c.fillStyle = (x / 16) % 2 ? '#f4f1ea' : '#d6332a'; c.fillRect(x, 0, 16, h); } }); kerbT.wrapS = THREE.RepeatWrapping; texs.push(kerbT);
    const kerbM = mat({map:kerbT, roughness:.4});
    for (const [za, zb] of [[262.4, 264], [294, 295.6]]){ const L = START_X + 40 - 640, gk = new THREE.BoxGeometry(L, .12, zb - za); gk.translate((START_X + 40 + 640) / 2, .07, (za + zb) / 2);
      const u = gk.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * L / 4); mesh(gk, kerbM); }
    /* barriers with an ad band, behind the kerbs */
    const adT = tex(1024, 64, (c, w, h) => { const ads = [['XMUM 厦门大学马来西亚分校', '#103b7a'], ['SEPANG · 雪邦', '#c8102e'], ['Class of 2026', '#1f6b4b'], ['奶娃车队 NAIWA RACING', '#f2c64a'], ['Selamat Datang', '#7a2a6b']];
      ads.forEach(([t, bg], k) => { const x0 = k * w / ads.length; c.fillStyle = bg; c.fillRect(x0, 0, w / ads.length, h); c.fillStyle = bg === '#f2c64a' ? '#2b2620' : '#fbf3e4'; c.font = '700 26px "Noto Sans SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x0 + w / ads.length / 2, h / 2 + 1); }); });
    adT.wrapS = THREE.RepeatWrapping; texs.push(adT);
    const wallM = mat({color:'#e9e4da', roughness:.7}), adM = mat({map:adT, roughness:.6, emissive:'#ffffff', emissiveMap:adT, emissiveIntensity:.15});
    for (const z of [259.5, 298.5]){ const L = START_X + 40 - SEP_X0; const w = new THREE.BoxGeometry(L, 1, .5); w.translate((START_X + 40 + SEP_X0) / 2, .5, z); mesh(w, wallM, true);
      const a = new THREE.PlaneGeometry(L, .7); const u = a.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * L / 110); a.rotateY(z < 279 ? 0 : Math.PI); a.translate((START_X + 40 + SEP_X0) / 2, 1.35, z + (z < 279 ? .26 : -.26)); mesh(a, adM); }
    /* grandstands on the right (north) of the straight, full of 奶娃 fans (simple instanced figures) */
    const standM = mat({color:'#d9d4ca', roughness:.75}), roofM = mat({color:'#c4502a', roughness:.6});
    const fanG = geoMerge([new THREE.SphereGeometry(.45, 10, 8).scale(1, 1.35, 1).translate(0, .62, 0), new THREE.SphereGeometry(.28, 10, 8).scale(1, 1.1, 1).translate(0, 1.32, .06)]);
    geos.push(fanG); const fanCols = ['#f2c64a', '#f0842a', '#f29ac0', '#f4f1ea', '#7fb0e8', '#f2c64a', '#103b7a'];
    const fanSpots = [];
    for (let x = 1180; x > 700; x -= 70){
      for (let t = 0; t < 9; t++){ const gb = new THREE.BoxGeometry(56, 1.1, 2.4); gb.translate(x, .55 + t * 1.1, 252 - t * 2.4); mesh(gb, standM, true);
        for (let k = 0; k < 18; k++) if (Math.random() < .8) fanSpots.push([x - 26 + k * 3 + (Math.random() - .5), 1.1 + t * 1.1, 252.6 - t * 2.4]); }
      const rf = new THREE.BoxGeometry(58, .5, 26); rf.rotateX(.12); rf.translate(x, 14, 240); mesh(rf, roofM, true);
      for (const zz of [253, 228]){ const p = new THREE.CylinderGeometry(.35, .35, 14, 8); p.translate(x - 27, 7, zz); mesh(p, standM); const p2 = p.clone(); p2.translate(54, 0, 0); mesh(p2, standM); } }
    const fans = new THREE.InstancedMesh(fanG, mat({roughness:.85}), fanSpots.length), mm = new THREE.Matrix4(), cc = new THREE.Color();
    fanSpots.forEach(([x, y, z], k) => { mm.makeRotationY(Math.PI + (Math.random() - .5) * .4); mm.setPosition(x, y, z); fans.setMatrixAt(k, mm); fans.setColorAt(k, cc.set(fanCols[k % fanCols.length])); });
    fans.receiveShadow = true; root.add(fans); C.fans = {im:fans, spots:fanSpots};
    /* pit building on the left (south), lit windows */
    const pitT = tex(512, 64, (c, w, h) => { c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h); for (let x = 6; x < w; x += 32){ c.fillStyle = '#ffd59a'; c.fillRect(x, 18, 22, 30); } }); pitT.wrapS = THREE.RepeatWrapping; texs.push(pitT);
    const pitM = mat({map:pitT, roughness:.6, emissive:'#ffffff', emissiveMap:pitT, emissiveIntensity:.35});
    { const L = START_X - 700, b = new THREE.BoxGeometry(L, 8, 14); const u = b.attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * L / 60); b.translate((START_X + 700) / 2, 4, 308); mesh(b, pitM, true);
      const r = new THREE.BoxGeometry(L, .6, 18); r.translate((START_X + 700) / 2, 8.3, 306); mesh(r, roofM, true); }
    /* the Sepang gate over the track at the start, 「雪邦赛车城 · XMUM」 */
    const signT = tex(1024, 128, (c, w, h) => { c.fillStyle = '#7f2a17'; c.fillRect(0, 0, w, h); c.fillStyle = '#f7d27a'; c.font = '800 70px "Noto Serif SC","SimSun",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('雪邦赛车城 · XMUM', w / 2, h / 2 + 4); }); texs.push(signT);
    const gx0 = 1150;
    for (const z of [258, 300]){ const t = new THREE.BoxGeometry(4, 13, 4); t.translate(gx0, 6.5, z); mesh(t, standM, true); const r = new THREE.ConeGeometry(3.6, 3, 4); r.rotateY(Math.PI / 4); r.translate(gx0, 14.5, z); mesh(r, roofM, true); }
    { const b = new THREE.BoxGeometry(2.6, 2.6, 46); b.translate(gx0, 11.4, 279); mesh(b, roofM, true);
      for (const s of [-1, 1]){ const p = new THREE.PlaneGeometry(40, 2.2); p.rotateY(s * Math.PI / 2); p.translate(gx0 + s * 1.32, 11.4, 279); mesh(p, mat({map:signT, emissive:'#ffffff', emissiveMap:signT, emissiveIntensity:.25})); } }
    /* lamp posts along the straight, lit at dusk */
    const lampM = mat({color:'#fff3d6', emissive:'#ffd9a0', emissiveIntensity:2.2}), poleM = mat({color:'#8d939a', roughness:.5, metalness:.5});
    for (let x = 1220; x > 660; x -= 38) for (const z of [257.5, 300.5]){ const p = new THREE.CylinderGeometry(.16, .22, 11, 6); p.translate(x, 5.5, z); mesh(p, poleM); const hd = new THREE.BoxGeometry(.8, .25, 2.4); hd.translate(x, 11, z + (z < 279 ? 1.2 : -1.2)); mesh(hd, lampM); }
    return {root, mats, geos, texs};
  }
  function freeSet(S){ if (!S) return; scene.remove(S.root); S.geos.forEach(g2 => g2.dispose()); S.mats.forEach(m => m.dispose()); S.texs.forEach(t => t.dispose()); if (C.fans) C.fans.im.dispose(); C.fans = null; }

  /* ---------------- the campus sinks before the film and rises during it ---------------- */
  const _b = new THREE.Box3(), _c = new THREE.Vector3();
  function sinkCampus(){
    C.struct = [];
    for (const st of structures) for (const gr of st.groups){ if (!gr.userData.base) continue; _b.setFromObject(gr); if (_b.isEmpty()) continue; _b.getCenter(_c);
      if (_c.z > 252 || _c.x < -650 || _c.x > 650) continue;                     /* only the campus north of the road */
      const h = Math.max(4, _b.max.y - Math.min(0, _b.min.y)) + 2;
      C.struct.push({gr, base:gr.userData.base.clone(), h, x:_c.x, z:_c.z, k:0}); gr.position.y = gr.userData.base.y - h; }
    /* the road-closed barriers where Jalan Sunsuria leaves the map would cut across our lane: push them under the ground for the film */
    C.barrier = [];
    scene.traverse(o => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.userData.sepang) return; const p = o.geometry.attributes.position; if (p.count > 400000) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; if (bb.max.x < 590 || bb.min.x > 610) return;
      const moved = []; for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (x > 594 && x < 602 && z > 258 && z < 300 && y < 1.3){ moved.push(i, y); p.setY(i, y - 20); } }
      if (moved.length){ p.needsUpdate = true; C.barrier.push({p, moved}); } });
  }
  function riseCampus(carX){
    for (const s of C.struct){
      /* each building comes up as you draw level with it: east ones first, the gate area last */
      const k = ss(s.x + 330, s.x + 120, carX);
      s.k = k; s.gr.position.y = s.base.y - s.h * (1 - k) + Math.sin(k * Math.PI) * .6;   /* a little overshoot as it settles */
    }
  }
  function restoreCampus(){
    for (const s of C.struct) s.gr.position.copy(s.base); C.struct = [];
    for (const b of C.barrier){ for (let i = 0; i < b.moved.length; i += 2) b.p.setY(b.moved[i], b.moved[i + 1]); b.p.needsUpdate = true; } C.barrier = [];
  }

  /* ---------------- cars: you, and friends in their outfits ---------------- */
  const FRIENDS = [{kind:'p911', col:'#c8102e', look:{skin:'orange', head:'fedora', face:'shades'}, lat:4.5, s0:22, v:63},
    {kind:'mase', col:'#f4f1ea', look:{skin:'pink', outfit:'redvest', head:'buns'}, lat:-4.5, s0:12, v:62},
    {kind:'lambo', col:'#1d4f9c', look:{skin:'blue', outfit:'police', head:'policecap'}, lat:9, s0:34, v:64},
    {kind:'sedan', col:'#2c6a3f', look:{skin:'white', outfit:'detective', face:'glasses'}, lat:-9, s0:-4, v:60}];
  function seatNaiwa(c, look){
    const N = makeNaiwa((look && look.shape) || 'std'); g(() => nwDress(N, wdLook(look || {}), {shadow:SH()}));
    N.root.traverse(o => { if (o.isMesh){ o.castShadow = SH(); o.userData.sepang = true; } });
    c.body.add(N.root); N.root.position.set(...c.T.seat); g(() => nwSitPose(N, false)); g(() => nwRingOn(c, (look && look.shape) || 'std'));
    return N;
  }
  function addCar(kind, col, s, lat){
    const c = makeCar(kind, col, START_X, 279, -Math.PI / 2); c.sep = {s, lat, v:0}; c.root.traverse(o => { o.userData.sepang = true; }); C.cars.push(c); return c;
  }
  function dropCars(){
    for (const c of C.cars){ const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); if (c.N) g(() => { c.body.remove(c.N.root); wdDispose && wdDispose(c.N.root); }); scene.remove(c.root); }
    C.cars = []; C.me = null; C.rivals = [];
  }

  /* ---------------- the cockpit (game style) with 奶娃's hands on the wheel ---------------- */
  function buildCockpit(c){
    const ck = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); ck.add(o); return o; };
    const T = c.T, seat = T.seat, ex = seat[0] - .3, ey = seat[1] + .6, ez = seat[2] - .1;
    /* the game's car bodies are made to be seen from outside: from the driver's seat they would block or vanish. Hide your own car's shell
       and build what a driver sees in the same style: dashboard, pillars, roof edge, and the yellow hood out in front */
    c.body.traverse(o => { if (o.isMesh) o.visible = false; });
    const paint = M('#f2c230', {roughness:.32, metalness:.3}), black = M('#18191c', {roughness:.5});
    { const hood = new THREE.Shape(); hood.moveTo(-.86, 0); hood.lineTo(.86, 0); hood.lineTo(.74, 1.7); hood.lineTo(-.74, 1.7); hood.closePath();
      const hg = new THREE.ExtrudeGeometry(hood, {depth:.06, bevelEnabled:true, bevelSize:.05, bevelThickness:.04, bevelSegments:2}); hg.rotateX(Math.PI / 2 - .2); hg.translate(0, ey - .36, ez + .95);
      add(hg, paint, 0, 0, 0);
      for (const s of [-1, 1]){ const f = add(roundBox(.32, .2, 1.5, .1), paint, s * .82, ey - .4, ez + 1.6); f.rotation.x = -.2; }   /* the wheel-arch bulges either side */
      for (const s of [-1, 1]){ const v = add(new THREE.BoxGeometry(.36, .02, .5), black, s * .3, ey - .37, ez + 1.45); v.rotation.x = -.2; }   /* bonnet vents */
      const st = add(new THREE.BoxGeometry(.16, .015, 1.7), M('#103b7a', {roughness:.4}), 0, ey - .335, ez + 1.75); st.rotation.x = -.2; }   /* an XMUM-blue stripe */   /* the driver's eye: right-hand drive, as in Malaysia (facing +z, the right side is -x) */
    const dark = M('#24262b', {roughness:.6}), trimM = M('#3a3d44', {roughness:.5}), stitch = M('#f2c230', {roughness:.5}), skin = M('#55532c', {roughness:.85});
    C.eye = V(ex, ey, ez);
    /* dashboard: a long rounded slab across the car, a binnacle in front of you with the screen */
    add(roundBox(T.W - .2, .2, .55, .08), dark, 0, ey - .44, ez + .8);
    add(roundBox(.42, .1, .2, .05), trimM, ex, ey - .33, ez + .66);
    const scr = document.createElement('canvas'); scr.width = 256; scr.height = 96; C.scr = scr;
    const scrT = new THREE.CanvasTexture(scr); C.scrT = scrT;
    const sm = add(new THREE.PlaneGeometry(.3, .1), new THREE.MeshBasicMaterial({map:scrT}), ex, ey - .33, ez + .556); sm.rotation.y = Math.PI; sm.rotation.x = .35;
    add(new THREE.BoxGeometry(T.W - .4, .03, .02), stitch, 0, ey - .345, ez + .525);
    /* A-pillars and the roof edge, so the view has a frame */
    for (const s of [-1, 1]){ const p = add(new THREE.BoxGeometry(.09, .9, .09), dark, s * (T.W / 2 - .12), ey - .02, ez + .62); p.rotation.x = -.85; p.rotation.z = s * .12; }
    add(new THREE.BoxGeometry(T.W - .2, .06, .5), dark, 0, ey + .26, ez + .05);
    /* the wheel: a rim with yellow stitching, three spokes, an XMUM badge, and two olive three-fingered hands at ten to two */
    const wheel = new THREE.Group(); wheel.position.set(ex, ey - .25, ez + .44); wheel.rotation.x = -.38; wheel.scale.setScalar(.88); ck.add(wheel); C.wheel = wheel;
    const wa = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); wheel.add(o); return o; };
    wa(new THREE.TorusGeometry(.17, .022, 10, 36), dark, 0, 0, 0); wa(new THREE.TorusGeometry(.17, .006, 6, 36), stitch, 0, 0, -.018);
    for (const a of [0, Math.PI * .8, -Math.PI * .8]){ const sp = wa(new THREE.BoxGeometry(.03, .15, .02), trimM, Math.sin(a) * .075, -Math.cos(a) * .075, 0); sp.rotation.z = a; }
    const badgeT = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const q = cv.getContext('2d'); q.fillStyle = '#103b7a'; q.beginPath(); q.arc(32, 32, 30, 0, 7); q.fill(); q.fillStyle = '#e8c766'; q.font = '800 16px serif'; q.textAlign = 'center'; q.textBaseline = 'middle'; q.fillText('XMUM', 32, 33); return cv; })());
    const bd = wa(new THREE.CircleGeometry(.05, 24), new THREE.MeshBasicMaterial({map:badgeT}), 0, 0, -.016); bd.rotation.y = Math.PI;
    const hand = s => { const h = new THREE.Group(); const palm = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), skin); palm.scale.set(1, .9, .75); h.add(palm);
      for (let k = -1; k <= 1; k++){ const f = new THREE.Mesh(cap(.014, .03), skin); f.position.set(k * .022, .035, -.02); f.rotation.x = -.9; h.add(f); }
      const th = new THREE.Mesh(cap(.013, .025), skin); th.position.set(-s * .035, 0, -.03); th.rotation.z = s * 1.1; h.add(th);
      const arm = new THREE.Mesh(cap(.04, .32), M('#f2c64a', {roughness:.85})); arm.position.set(s * .05, -.075, -.15); arm.rotation.x = 1.1; arm.rotation.z = -s * .25; h.add(arm);   /* the forearm runs back and down towards you */
      h.position.set(s * .15, .07, -.02); wheel.add(h); return h; };
    hand(-1); hand(1);
    /* the mirror and the charm: a student card and a tiny 奶娃 on a string */
    const mir = add(roundBox(.2, .05, .025, .015), dark, -.05, ey + .24, ez + .66);
    const charm = new THREE.Group(); charm.position.set(-.05, ey + .21, ez + .65); ck.add(charm); C.charm = charm; C.charmS = {a:0, v:0, b:0, w:0};
    const str = new THREE.Mesh(new THREE.CylinderGeometry(.002, .002, .08, 4), dark); str.position.y = -.04; charm.add(str);
    const card = new THREE.Mesh(new THREE.BoxGeometry(.035, .052, .002), new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96; const q = cv.getContext('2d'); q.fillStyle = '#f4f2ec'; q.fillRect(0, 0, 64, 96); q.fillStyle = '#103b7a'; q.fillRect(0, 0, 64, 22); q.fillStyle = '#e8c766'; q.font = '700 13px serif'; q.textAlign = 'center'; q.fillText('XMUM', 32, 16); q.fillStyle = '#b9c2cc'; q.fillRect(18, 30, 28, 32); q.fillStyle = '#2b2f36'; q.font = '600 9px sans-serif'; q.fillText('2022 新生', 32, 80); return cv; })()), roughness:.8}));
    card.position.y = -.1; charm.add(card);
    const mini = new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 8), M('#f2c64a', {roughness:.8})); mini.scale.set(1, 1.6, 1); mini.position.set(.024, -.085, 0); charm.add(mini);
    /* raindrops on the screen of the windscreen, blown up the glass as you speed up */
    const dropsM = new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uT:{value:0}, uS:{value:0}, uW:{value:1}},
      vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:`varying vec2 vUv; uniform float uT, uS, uW; float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec4 L(vec2 uv, float sc, float t){ vec2 q = uv * vec2(sc * 2., sc); vec2 id = floor(q), f = fract(q) - .5; float n = h21(id); float live = step(.4, n) * step(n, .4 + .55 * uW);
          float run = fract(t * (.08 + n * .25) * (.2 + uS * 2.) + n * 7.); vec2 c = vec2((n - .5) * .5, -.45 + run * .9 * step(.35, uS + n * .2)); vec2 d = (f - c) * vec2(1., 1. + uS * 1.5);
          float r = .1 + .12 * h21(id + 3.), m = smoothstep(r, r * .6, length(d)) * live, hi = smoothstep(r * .5, 0., length(d - vec2(-.3, .3) * r)) * m;
          return vec4(vec3(.9, .93, .97) * hi * 1.2, m * (.06 + hi * .3)); }
        void main(){ vec4 a = L(vUv, 8., uT), b = L(vUv * 1.6 + .3, 13., uT * 1.3); vec4 c = a + b * (1. - a.a); gl_FragColor = c; }`});
    const drops = add(new THREE.PlaneGeometry(T.W - .3, .55), dropsM, 0, ey + .02, ez + .68); drops.rotation.x = -.85; drops.renderOrder = 5; C.drops = dropsM;
    ck.traverse(o => { if (o.isMesh){ o.castShadow = false; o.receiveShadow = false; o.userData.sepang = true; } });
    c.body.add(ck); C.cockpit = ck;
    /* from inside, the outer shell's roof would hide nothing (it faces away) and the sky shows through: the dark roof edge above stands in for it */
  }
  function drawScreen(kmh){
    const q = C.scr.getContext('2d'); q.fillStyle = '#06080c'; q.fillRect(0, 0, 256, 96); q.fillStyle = '#e8c766'; q.font = '700 30px "Noto Sans SC",sans-serif'; q.textAlign = 'left'; q.fillText('大一', 14, 40);
    q.fillStyle = '#9fb8d8'; q.font = '500 16px "Noto Sans SC",sans-serif'; q.fillText('2022 · 09', 16, 70); q.fillStyle = '#f4ead6'; q.font = '800 38px sans-serif'; q.textAlign = 'right'; q.fillText(String(Math.round(kmh)), 244, 52);
    q.font = '600 13px sans-serif'; q.fillText('km/h', 244, 74); C.scrT.needsUpdate = true;
  }

  /* ---------------- driving along the route ---------------- */
  const F = {p:V(0, 0, 0), t:V(0, 0, 0)};
  function frameAt(s){ const u = Math.max(0, Math.min(1, s / PL)); F.p.copy(PATH.getPointAt(u)); F.t.copy(PATH.getTangentAt(u)); return F; }
  function speedPlan(s, t){
    const sGate = sAtX(GATE_LANE + 40);
    if (t < .5) return 45;
    if (s < sAtX(560)) return 64;                                               /* flat out down the Sepang straight */
    if (s < sGate) return 64 - 40 * ss(sAtX(560), sGate, s);                    /* lift off into the campus road */
    return Math.max(4, 24 - 18 * ss(sGate, PL - 4, s));                         /* through the gate, slowing towards A3 */
  }
  function placeCar(c, s, lat){
    const f = frameAt(s), rx = -f.t.z, rz = f.t.x;                              /* right-hand side of the direction of travel */
    const x = f.p.x + rx * lat, z = f.p.z + rz * lat, h = Math.atan2(f.t.x, f.t.z);
    c.x = x; c.z = z; c.h = h; const y = g(() => groundAt(x, z), 0);
    c.root.position.set(x, y, z); c.root.rotation.set(0, h, 0);
    const spin = (c.sep.v || 0) / c.T.r * C.dt; for (const w of c.wheels) w.rotation.x += spin;
  }
  function step(dt){
    C.t += dt; C.dt = dt;
    const me = C.me;
    me.sep.v += (speedPlan(me.sep.s, C.t) - me.sep.v) * Math.min(1, dt * 1.6); me.sep.s = Math.min(PL - .5, me.sep.s + me.sep.v * dt);
    me.sep.lat += ((me.sep.s < sAtX(640) ? Math.sin(C.t * .45) * 1.5 : 0) - me.sep.lat) * Math.min(1, dt * 1.2);
    placeCar(me, me.sep.s, me.sep.lat);
    /* friends: race alongside down the straight, then keep going west on the other carriageway while you turn in */
    const sTurn = sAtX(600);
    for (const c of C.rivals){
      const gap = c.sep.s - me.sep.s, want = me.sep.s < sTurn ? me.sep.v * (1 + Math.max(-.08, Math.min(.06, -gap / 80))) + Math.sin(C.t * .7 + c.sep.lat) * 2 : 66;
      c.sep.v += (want - c.sep.v) * Math.min(1, dt * 1.2); c.sep.s += c.sep.v * dt;
      if (me.sep.s < sTurn){ placeCar(c, c.sep.s, c.sep.lat); }
      else { /* straight on along the south carriageway, westwards */ const x = c.root.position.x - c.sep.v * dt; c.x = x; c.z += (289 - c.z) * Math.min(1, dt * .8); c.root.position.set(x, 0, c.z); c.root.rotation.set(0, -Math.PI / 2, 0); }
      if (c.N) c.N.root.rotation.y = Math.sin(C.t * 3 + c.sep.lat) * .15;      /* they glance across at you */
    }
    riseCampus(me.x);
    /* fans bounce */
    if (C.fans){ const im = C.fans.im, m4 = new THREE.Matrix4(); if ((C.fanTick = (C.fanTick || 0) + 1) % 2 === 0){ C.fans.spots.forEach(([x, y, z], k) => { m4.makeRotationY(Math.PI); m4.setPosition(x, y + Math.abs(Math.sin(C.t * 6 + k)) * .25, z); im.setMatrixAt(k, m4); }); im.instanceMatrix.needsUpdate = true; } }
    /* cockpit life */
    const v = me.sep.v, f = frameAt(me.sep.s), f2 = frameAt(me.sep.s + 6), turn = Math.atan2(f2.t.x, f2.t.z) - Math.atan2(f.t.x, f.t.z);
    if (C.wheel) C.wheel.rotation.z = -Math.max(-1.6, Math.min(1.6, turn * 9));
    if (C.drops){ C.drops.uniforms.uT.value = C.t; C.drops.uniforms.uS.value = Math.min(1, v / 60); C.drops.uniforms.uW.value = Math.max(.12, .55 - C.t / 60); }
    if (Math.floor(C.t * 6) !== C.scrTick){ C.scrTick = Math.floor(C.t * 6); drawScreen(v * 3.6); }
    if (C.charm){ const S = C.charmS, ax = (v - (C.lastV ?? v)) / Math.max(dt, 1e-3); C.lastV = v; S.v += (-S.a * 30 - S.v * 1.5 - ax * .02) * dt; S.a += S.v * dt; S.w += (-S.b * 30 - S.w * 1.5 + turn * 40) * dt; S.b += S.w * dt; C.charm.rotation.set(S.a, 0, S.b); }
  }
  function placeCamera(){
    const me = C.me, eye = C.eye.clone(), v = me.sep.v, t = C.t;
    const buzz = .004 * Math.min(1, v / 60); eye.x += Math.sin(t * 41) * buzz; eye.y += Math.sin(t * 53 + 1) * buzz;
    me.root.updateMatrixWorld(true); camera.position.copy(eye).applyMatrix4(me.body.matrixWorld);   /* this frame's car, not last frame's */
    /* look: down the road; around 14–21 s the head turns right to watch the campus come up, then back for the gate */
    const glance = ss(13.5, 15.5, t) * (1 - ss(19.5, 21.5, t)) * .75;
    C.cam.look += (glance - C.cam.look) * .08;
    camera.quaternion.setFromEuler(new THREE.Euler(-.05, me.h + Math.PI - C.cam.look, 0, 'YXZ'));
    camera.fov = 68 + Math.min(8, v / 10); camera.updateProjectionMatrix();
  }

  /* ---------------- play / stop ---------------- */
  function frameHook(dt, T){ if (C.prevFrame) C.prevFrame(dt, T); if (!C.busy || C.manual) return; tick(dt); }
  function tick(dt){
    wx.wet = 1; wx.rain = 0;   /* the game dries the roads out by itself: keep them shining */
    g(() => XClock.set(18.1 + 1.15 * Math.pow(Math.min(1, C.t / 30), 1.6)));   /* the film owns the clock: golden hour to blue hour, lamps and windows coming on at the gate */
    step(dt); placeCamera();
    const w = renderer.domElement.width, h = renderer.domElement.height; uiDraw(C.ui.cv, C.ui.g, w, h);
    if (C.t > 31 && !C.manual) stop();
  }
  function play(o){
    if (C.busy) return false; o = o || {}; C.busy = true; C.t = 0; C.onDone = o.onDone || null; C.manual = !!o.manual;
    C.saved = {paused:gx.paused, tgt, wet:wx.wet, rain:wx.rain, target:wx.target, fov:camera.fov, far:camera.far, near:camera.near, nwVis:typeof NW !== 'undefined' ? NW.root.visible : true, ctl:typeof controls !== 'undefined' ? controls.enabled : true, autoRot:typeof controls !== 'undefined' ? controls.autoRotate : false};
    gx.paused = true; if (typeof controls !== 'undefined'){ controls.enabled = false; controls.autoRotate = false; }
    if (typeof NW !== 'undefined') NW.root.visible = false;
    document.body.classList.add('cine', 'sepang-film');
    /* golden hour sliding into dusk while the campus comes up (the clock keeps running: 30 s of film is about half an hour); the rain has just stopped */
    C.saved.clockH = g(() => XClock.hour(), null); g(() => XClock.set(18.1)); applyTime(1); wx.rain = 0; wx.target = 0; wx.wet = 1;
    C.set = buildSet(); sinkCampus();
    C.me = addCar('lambo', '#f2c230', 0, -1); C.me.sep.v = 45; buildCockpit(C.me);
    C.rivals = FRIENDS.map(f => { const c = addCar(f.kind, f.col, f.s0, f.lat); c.sep.v = f.v; c.N = seatNaiwa(c, f.look); return c; });
    C.ui = uiMake(); camera.near = .05; camera.updateProjectionMatrix();   /* the game's camera clips 2 m: the dashboard is closer than that */
    C.prevFrame = gx.frame; gx.frame = frameHook;
    return true;
  }
  function stop(){
    if (!C.busy) return; C.busy = false;
    gx.frame = C.prevFrame; C.prevFrame = null;
    dropCars(); freeSet(C.set); C.set = null; restoreCampus();
    if (C.ui){ C.ui.cv.remove(); C.ui = null; }
    const S = C.saved; gx.paused = S.paused; if (S.clockH != null) g(() => XClock.set(S.clockH)); tgt = S.tgt; wx.wet = S.wet; wx.rain = S.rain; wx.target = S.target; camera.fov = S.fov; camera.far = S.far; camera.near = S.near; camera.updateProjectionMatrix();
    if (typeof NW !== 'undefined') NW.root.visible = S.nwVis; if (typeof controls !== 'undefined'){ controls.enabled = S.ctl; controls.autoRotate = S.autoRot; }
    document.body.classList.remove('cine', 'sepang-film');
    const cb = C.onDone; C.onDone = null; if (cb) g(cb);
  }
  /* tests and recording: push the whole game one frame, render, copy canvas + overlay into a picture */
  let fakeNow = 0;
  function stepFrame(dt){ fakeNow = (fakeNow || performance.now()) + dt * 1000; const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;   /* frame() re-arms itself: not here */
    try { frame(fakeNow); } finally { window.requestAnimationFrame = raf; } tick(dt); gfxRender(dt, fakeNow / 1000); }
  async function capture(name, w = 1280, h = 720){
    const bl = XQ.cfg.bloom; XQ.cfg.bloom = false;   /* the bloom targets keep the window's size: a different capture size would misplace them */
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); gfxRender(0, fakeNow / 1000); uiDraw(C.ui.cv, C.ui.g, w, h);
    const out = document.createElement('canvas'); out.width = w; out.height = h; const q = out.getContext('2d'); q.drawImage(renderer.domElement, 0, 0, w, h); q.drawImage(C.ui.cv, 0, 0, w, h);
    XQ.cfg.bloom = bl; const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', .9)); await fetch('/save?name=' + name, {method:'POST', body:blob}); return blob.size;
  }
  window.XSepang = {play, stop, get busy(){ return C.busy; }, get t(){ return C.t; }, stepFrame, capture, C};
})();
