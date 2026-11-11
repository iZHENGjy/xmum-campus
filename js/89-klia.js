/* XMUM 校园漫游 · 坐 ERL 去的第一个地方：KLIA 吉隆坡国际机场 1 号航站楼（场景在 z ≈ −2600，坐车时才生成，回程时释放）
 *
 * 真实路线：Salak Tinggi 坐 KLIA Transit 一站，约 7 分钟到 KLIA T1。这里还原最有辨识度的部分：
 *   - 出发大厅一排排伊斯兰风格的双曲面伞形屋顶（黑川纪章设计）：每个单元一根锥形柱子撑着，单元交界是天窗；
 *   - 中间的航班信息屏（按现在的时间滚动，航班号是虚构的 XM 航空）、A–F 六排值机岛、问讯台；
 *   - 卫星楼中间的室内雨林，简化成大厅东北角的一个玻璃雨林；北边落地玻璃外是停机坪和飞机；
 *   - 一家 24 小时的「すき家 SUKIYA」（真实的在 klia2 二楼，这里搬进 T1 大厅西侧），按 F 买牛丼；
 *   - 南边下去是 ERL 站台（闸机、站台、隧道），坐车回 Salak Tinggi。
 * 小玩法「送机赶时间」：问讯台按 F 接一单跑腿（护照、すき家牛丼、充电宝……），在限时内穿过拖着行李车的旅客，送到指定的值机柜台或雨林。
 *   撞到旅客扣时间。剩的时间越多奖牌越好：钱 + 改装零件（XParts.reward('klia', …)，掉落表在 js/42-tuning.js 的 TN_DROPS.klia）。
 * 性能：静态的东西合并成几个 mesh（大厅、屋顶、玻璃、地板、飞机），旅客是 InstancedMesh；全部不投影。
 * 镜头：大厅很高，这里允许把镜头放平看屋顶（window.XINDOOR_PITCH，js/90-main.js）。 */
'use strict';
(() => {
  if (!window.XTrain) return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const KX = 0, KZ = -2600, W = (x, z) => [KX + x, KZ + z];
  const COUNT = ['A', 'B', 'C', 'D', 'E', 'F'], ISL = [-38, -24, -7, 7, 24, 38];
  const COLS = []; for (const cx of [-46.5, -15.5, 15.5, 46.5]) for (const cz of [-31.5, -.5]) COLS.push([cx, cz]);
  const HC = 12, RU = 15.5;
  const roofY = (x, z) => { const u = ((x + 62) % 31 + 31) % 31 - 15.5, v = ((z + 47) % 31 + 31) % 31 - 15.5; return HC + 5 * Math.pow((u * u + v * v) / (RU * RU), .8); };
  const RINGS = {info:[0, 6.5], suki:[-49.4, -6], forest:[47.6, -37], erl:[-8, 19.6]};
  const SPOT = {forest:{x:47.6, z:-37, name:'雨林观景台'}, suki:{x:-49.4, z:-6, name:'すき家'}};
  COUNT.forEach((c, i) => { SPOT['c' + c] = {x:ISL[i], z:-19.6, name:c + ' 柜台'}; });

  /* ---------- the station spec the cutscene uses (world coordinates) ---------- */
  function stationSpec(K, gate){
    const P = (x, y, z) => [KX + x, y, KZ + z];
    const west = K.kPath([W(320, 39.7), W(-320, 39.7)], .35), east = K.kPath([W(-320, 39.7), W(320, 39.7)], .35), PL = 1.4;
    return {
      id:'klia', name:'KLIA T1', zh:'吉隆坡国际机场 1 号航站楼', out:[...P(0, 0, 16.4), Math.PI], ring:W(...RINGS.erl),
      gate:P(1.15, 0, 24), waitH:0,
      go:[P(1.15, 0, 21.4), P(1.15, 0, 22.8), P(1.15, 0, 26.2), P(4, 0, 27.2), P(4, PL, 30.2), P(6, PL, 34), P(6, PL, 36.5)],
      back:[P(6, PL, 36.8), P(4, PL, 31.5), P(4, 0, 27.4), P(1.15, 0, 26), P(1.15, 0, 22.5), P(0, 0, 16.4)],
      dep:{path:east, at:KX + 6}, arr:{path:west, at:KX + 6},
      cams:{gate:[P(-5, 3.3, 18.6), P(1.5, 1.1, 25)], wait:[P(-30, PL + 1.9, 31.4), P(8, PL + .4, 39)], door:[P(-1.5, PL + 1.3, 32.4), P(6, PL + .2, 38.6)], arrive:[P(16, PL + 1.6, 32.2), P(6, PL + .3, 38.4)]},
      gateFx:gate
    };
  }

  /* ---------- the scene (built in the black while the train "arrives") ---------- */
  const KL = {g:null, cols:[], fids:null, fidsT:0, walkers:[], im:null, err:null, sukiT:0, near:'', marks:{}, lbls:{}};
  function addCol(c){ colliders.push(c); KL.cols.push(c); return c; }
  const box = (x0, z0, x1, z1) => addCol({t:0, cx:KX + (x0 + x1) / 2, cz:KZ + (z0 + z1) / 2, hx:Math.abs(x1 - x0) / 2, hz:Math.abs(z1 - z0) / 2, c:1, s:0});
  function paintAtlas(K, A){
    const R = A.R, rg = {};
    COUNT.forEach((c, i) => { rg[c] = R(32 + i * 128, 0, 128, 96); K.kBoard(A, rg[c], '#24272d', [{t:c, s:58, c:'#ffd23a', y:.42, w:900}, {t:'Check-in 值机', s:14, c:'#ffffff', y:.84, w:600}], true); });
    rg.suki = R(0, 96, 512, 96); K.kBoard(A, rg.suki, '#e2141c', [{t:'すき家', s:48, c:'#ffffff', y:.42, w:900, x:.34}, {t:'SUKIYA', s:24, c:'#ffe7c2', y:.8, w:800, x:.34}, {t:'24H', s:40, c:'#ffd23a', y:.52, w:900, x:.82}], true);
    rg.menu = R(512, 96, 256, 128);
    { const {x, y, w, h} = rg.menu, c = A.c; c.fillStyle = '#fff6e6'; c.fillRect(x, y, w, h); c.fillStyle = '#e2141c'; c.fillRect(x, y, w, 26);
      c.fillStyle = '#ffffff'; c.font = `800 18px ${K.FONT}`; c.textBaseline = 'middle'; c.fillText('MENU · 菜单', x + 10, y + 13);
      c.fillStyle = '#3a2a1e'; c.font = `700 15px ${K.FONT}`; [['牛丼（并）Gyudon', '12.90'], ['芝士牛丼', '15.90'], ['咖喱牛丼', '14.90'], ['味噌汤套餐', '+3.50']].forEach(([n, p], i) => { c.fillText(n, x + 10, y + 46 + i * 21); c.fillText('RM ' + p, x + w - 70, y + 46 + i * 21); });
      A.e.fillStyle = '#5a4a3a'; A.e.fillRect(x, y, w, h); }
    rg.klia = R(0, 224, 512, 96); K.kBoard(A, rg.klia, '#ffffff', [{t:'KLIA  吉隆坡国际机场', s:40, c:K.PURP, y:.42, w:900}, {t:'Terminal 1 · 出发 Departures', s:20, c:'#5a6470', y:.82, w:600}], true);
    rg.erl = R(512, 224, 512, 64); K.kBoard(A, rg.erl, K.PURP, [{t:'ERL KLIA Transit ↓  往 Salak Tinggi · Putrajaya', s:22, c:'#ffffff', y:.5}], true);
    rg.info = R(768, 96, 256, 64); K.kBoard(A, rg.info, '#1d4f9a', [{t:'ⓘ 问讯 Information', s:24, c:'#ffffff', y:.5}], true);
    rg.forest = R(768, 160, 256, 64); K.kBoard(A, rg.forest, '#245a2e', [{t:'雨林一角 Rainforest', s:24, c:'#e8ffe0', y:.5}], true);
    rg.dep = R(512, 288, 256, 64); K.kBoard(A, rg.dep, '#24272d', [{t:'✈ 出发 Departures', s:26, c:'#ffd23a', y:.5}], true);
    rg.klt = R(768, 288, 256, 64); K.kBoard(A, rg.klt, K.PURP, [{t:'KLIA T1', s:34, c:'#ffffff', y:.5, w:900}], true);
    rg.gate = R(0, 320, 256, 48); K.kBoard(A, rg.gate, '#2b2f36', [{t:'刷卡进站 · Tap here', s:20, c:'#7dffb0', y:.5}], true);
    rg.tail = R(256, 320, 128, 128); { const {x, y} = rg.tail, c = A.c; c.fillStyle = K.PURP; c.fillRect(x, y, 128, 128); c.fillStyle = '#ffd23a'; c.font = `900 50px ${K.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('XM', x + 64, y + 66); c.textAlign = 'start'; }
    A.done(); return rg;
  }
  /* the departure board: real clock, made-up XM Air flights to real cities */
  const FLIGHTS = [['XM 101', '厦门 Xiamen'], ['XM 803', '北京 Beijing'], ['XM 286', '新加坡 Singapore'], ['XM 512', '东京 Tokyo'], ['XM 2', '伦敦 London'], ['XM 640', '悉尼 Sydney'],
    ['XM 377', '曼谷 Bangkok'], ['XM 158', '上海 Shanghai'], ['XM 721', '首尔 Seoul'], ['XM 94', '迪拜 Dubai'], ['XM 465', '雅加达 Jakarta'], ['XM 330', '广州 Guangzhou']];
  function paintFids(cv){
    const c = cv.getContext('2d'), now = new Date(), base = now.getHours() * 60 + now.getMinutes(), W_ = cv.width, H_ = cv.height;
    c.fillStyle = '#0b1220'; c.fillRect(0, 0, W_, H_); c.fillStyle = '#16233a'; c.fillRect(0, 0, W_, 56);
    c.fillStyle = '#ffd23a'; c.font = `800 30px ${XTrain.kit.FONT}`; c.textBaseline = 'middle'; c.fillText('✈ 出发 Departures', 18, 29);
    c.fillStyle = '#ffffff'; c.textAlign = 'right'; c.fillText(String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'), W_ - 18, 29); c.textAlign = 'left';
    c.font = `600 17px ${XTrain.kit.FONT}`; c.fillStyle = '#8fa3bf'; [['航班', 18], ['目的地', 140], ['时间', 520], ['柜台', 640], ['状态', 760]].forEach(([t, x]) => c.fillText(t, x, 74));
    const st = ['准时 On time', '值机 Check-in', '登机 Boarding', '延误 Delayed', '准时 On time', '值机 Check-in'];
    const off = Math.floor(base / 7);
    for (let i = 0; i < 9; i++){
      const f = FLIGHTS[(off + i) % FLIGHTS.length], t = base + 12 + i * 17 - (base % 7), hh = Math.floor(t / 60) % 24, mm = t % 60, y = 104 + i * 44;
      c.fillStyle = i % 2 ? '#0f1a2c' : '#0b1220'; c.fillRect(0, y - 20, W_, 44);
      c.font = `700 22px ${XTrain.kit.FONT}`; c.fillStyle = '#ffe9a8'; c.fillText(f[0], 18, y); c.fillStyle = '#ffffff'; c.fillText(f[1], 140, y);
      c.fillStyle = '#ffe9a8'; c.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), 520, y); c.fillText(COUNT[(off + i * 5) % 6], 650, y);
      const s = st[(off + i) % st.length]; c.fillStyle = /延误/.test(s) ? '#ff6b5a' : /登机/.test(s) ? '#5ef08a' : /值机/.test(s) ? '#7fd0ff' : '#ffffff'; c.fillText(s, 760, y);
    }
  }
  function planeGeo(){
    const L = [], T = (geo, col) => L.push(geoTint(geo, col));
    T(new THREE.CylinderGeometry(2.9, 2.9, 44, 14).rotateX(Math.PI / 2), '#f4f4f2');
    T(new THREE.SphereGeometry(2.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 1.9).translate(0, 0, 22), '#f4f4f2');
    T(new THREE.ConeGeometry(2.9, 13, 14).rotateX(-Math.PI / 2).translate(0, .6, -28.5), '#f4f4f2');
    for (const s of [1, -1]){
      T(new THREE.BoxGeometry(.06, .5, 36).translate(s * 2.87, .9, 2), '#2a3340');
      T(new THREE.BoxGeometry(18, .45, 6.5).translate(s * 9, 0, 0).rotateY(s * -.5).translate(0, -1.4, 1), '#c8ccd0');
      T(new THREE.CylinderGeometry(1.35, 1.2, 4.6, 12).rotateX(Math.PI / 2).translate(s * 8.5, -2.6, 5.5), '#9aa0a6');
      T(new THREE.BoxGeometry(8, .3, 3.2).translate(s * 4, 0, 0).rotateY(s * -.55).translate(0, 1, -30), '#c8ccd0');
    }
    T(new THREE.BoxGeometry(.45, 8.5, 6).rotateX(-.45).translate(0, 6.2, -29), '#5b2a86');
    T(new THREE.BoxGeometry(5.6, .12, 2.4).translate(0, 2.2, 23.5).rotateX(.5), '#1d2733');
    T(new THREE.BoxGeometry(5, 2.2, 3).translate(0, -3.2, 2), '#d9dcdf');
    const geo = geoMerge(L); return geo;
  }

  function build(K){
    const gr = KL.g = new THREE.Group(); scene.add(gr);
    const A = K.kAtlas(1024, 512), rg = paintAtlas(K, A), mat = K.kMat(A, {roughness:.6, emissive:'#6e6a63', emissiveMap:null, emissiveIntensity:1}, false);   /* indoors: lit evenly, not by the sky */
    const b = K.KB(), gl = K.KB(), WHITE = '#f3f1ec', DARK = '#2b2f36', GREY = '#9ba1a8';
    const X = x => KX + x, Z = z => KZ + z;
    /* floor: polished granite tiles (its own repeating texture) */
    { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), R = mkRng(77);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){ c.fillStyle = (i + j) % 2 ? '#b9b1a3' : '#c8c1b4'; c.fillRect(i * 64, j * 64, 64, 64); }
      for (let k = 0; k < 500; k++){ c.fillStyle = R() < .5 ? 'rgba(120,110,100,.12)' : 'rgba(255,255,255,.18)'; c.fillRect(R() * 128, R() * 128, 1.5, 1.5); }
      c.fillStyle = '#9a9286'; c.fillRect(0, 0, 128, 1.2); c.fillRect(0, 64, 128, 1.2); c.fillRect(0, 0, 1.2, 128); c.fillRect(64, 0, 1.2, 128);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(126 / 6, 62 / 6); t.anisotropy = ANISO;
      /* both sit just over the world's ground plane (js/10-world.js), which runs under everything at y 0 */
      const po = {polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-16};
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(126, 62), new THREE.MeshStandardMaterial(Object.assign({map:t, roughness:.45, metalness:.05}, po))); fl.rotation.x = -Math.PI / 2; fl.position.set(X(0), .03, Z(-16)); fl.receiveShadow = true; gr.add(fl);
      const ap = new THREE.Mesh(new THREE.PlaneGeometry(420, 300), M('#5d6166', Object.assign({roughness:.95}, po))); ap.rotation.x = -Math.PI / 2; ap.position.set(X(0), .015, Z(-120)); gr.add(ap); }
    /* apron markings and two parked planes nosed in to the glass, one far off */
    for (const x of [-32, 30]){ K.kFlat(b, X(x - .2), Z(-150), X(x + .2), Z(-48), .06, '#f2c230'); }
    K.kFlat(b, X(-200), Z(-162), X(200), Z(-161.6), .06, '#f2c230');
    { const pg = planeGeo(), pm = M('#ffffff', {vertexColors:true, roughness:.5});
      for (const [x, z, h] of [[-32, -95, 0], [30, -95, 0], [95, -190, Math.PI / 2]]){ const m = new THREE.Mesh(pg, pm); m.position.set(X(x), 4.6, Z(z)); m.rotation.y = h; gr.add(m); }
      for (const x of [-32, 30]){ K.kBox(b, X(x - 5.5), 4.2, Z(-66), X(x - 2.4), 7.2, Z(-47), '#c9ccd0'); K.kBox(b, X(x - 4.6), 0, Z(-63), X(x - 3.6), 4.2, Z(-62), GREY); } }
    /* ---- the hall: glass on three sides, a solid south wall with the way down to the ERL ---- */
    for (let x = -63; x <= 63; x += 3.15) K.kBox(b, X(x - .12), 0, Z(-47.2), X(x + .12), 16, Z(-46.8), '#d5d8dc');
    for (let z = -47; z <= 15; z += 3.1) for (const x of [-63, 63]) K.kBox(b, X(x - .2), 0, Z(z - .12), X(x + .2), 16, Z(z + .12), '#d5d8dc');
    K.kBox(gl, X(-63), 0, Z(-47.02), X(63), 16, Z(-46.98), '#ffffff', ''); K.kBox(gl, X(-63.02), 0, Z(-47), X(-62.98), 16, Z(15), '#ffffff', ''); K.kBox(gl, X(62.98), 0, Z(-47), X(63.02), 16, Z(15), '#ffffff', '');
    for (const [x0, x1] of [[-63, -5], [5, 63]]) K.kBox(b, X(x0), 0, Z(15), X(x1), 16, Z(15.6), WHITE, 'ny');
    K.kBox(b, X(-5), 5, Z(15), X(5), 16, Z(15.6), WHITE, 'ny');
    K.kSign(b, 'z', Z(14.97), X(-9), X(9), 6, 9.4, -1, rg.klia, '#ffffff');
    K.kSign(b, 'z', Z(14.96), X(-6), X(6), 4.1, 4.9, -1, rg.erl, '#ffffff');
    /* the fascia from the top of the glass up to the roof edge, all the way round */
    const edge = (pts, dir) => { for (let i = 0; i < pts.length - 1; i++){ const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ya = roofY(ax + (dir[0] * .01), az + dir[1] * .01), yb = roofY(bx + dir[0] * .01, bz + dir[1] * .01);
      const A1 = [X(ax), 16, Z(az)], B1 = [X(bx), 16, Z(bz)], C1 = [X(bx), yb, Z(bz)], D1 = [X(ax), ya, Z(az)]; K.kQuad(b, A1, B1, C1, D1, WHITE); K.kQuad(b, B1, A1, D1, C1, '#e8e4dc'); } };
    const line = (x0, z0, x1, z1) => { const n = 24, o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); return o; };
    edge(line(-62, -47, 62, -47), [0, 1]); edge(line(62, 15, -62, 15), [0, -1]); edge(line(-62, 15, -62, -47), [1, 0]); edge(line(62, -47, 62, 15), [-1, 0]);
    box(-64, -48, 64, -46.5); box(-64, -48, -62.6, 16); box(62.6, -48, 64, 16); box(-64, 15, -5, 16); box(5, 15, 64, 16);
    /* ---- the umbrella roof: hyperbolic-paraboloid-like shells, each on one tapered column, with skylights where they meet ---- */
    { const rb = K.KB(), cA = new THREE.Color('#efe6d6'), cB = new THREE.Color('#cdbb9c'), cc = new THREE.Color(), N = 12;
      for (const ux of [-46.5, -15.5, 15.5, 46.5]) for (const uz of [-31.5, -.5]){
        const P = (i, j) => { const u = -RU + 2 * RU * i / N, v = -RU + 2 * RU * j / N; return [X(ux + u), HC + 5 * Math.pow((u * u + v * v) / (RU * RU), .8), Z(uz + v)]; };
        const C = (i, j) => { const u = -RU + 2 * RU * (i + .5) / N, v = -RU + 2 * RU * (j + .5) / N, a = Math.atan2(v, u), r = Math.hypot(u, v) / RU;
          const rib = Math.pow(Math.abs(Math.cos(a * 4)), 6) * smooth01(.1, .5, r); return '#' + cc.copy(cA).lerp(cB, .15 + .5 * rib + .2 * r).getHexString(); };
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++){ const a = P(i, j), b2 = P(i + 1, j), c2 = P(i + 1, j + 1), d = P(i, j + 1); K.kQuad(rb, a, b2, c2, d, C(i, j)); }
      }
      const roof = new THREE.Mesh(K.kGeo(rb), new THREE.MeshBasicMaterial({vertexColors:true})); gr.add(roof);   /* lit by the skylights: unshaded */
      /* skylight strips along the unit edges, just under the shell */
      const sk = K.KB(); for (const xl of [-31, 0, 31]) for (let z = -47; z < 15; z += 2){ const y0 = roofY(xl + .01, z) - .1, y1 = roofY(xl + .01, z + 2) - .1; K.kQuad(sk, [X(xl - .7), y0, Z(z)], [X(xl + .7), y0, Z(z)], [X(xl + .7), y1, Z(z + 2)], [X(xl - .7), y1, Z(z + 2)], '#ffffff'); }
      for (let x = -62; x < 62; x += 2){ const y0 = roofY(x, -16 + .01) - .1, y1 = roofY(x + 2, -16 + .01) - .1; K.kQuad(sk, [X(x + 2), y1, Z(-16.7)], [X(x), y0, Z(-16.7)], [X(x), y0, Z(-15.3)], [X(x + 2), y1, Z(-15.3)], '#ffffff'); }
      gr.add(new THREE.Mesh(K.kGeo(sk), new THREE.MeshBasicMaterial({color:'#fffbea', side:THREE.DoubleSide})));
      const cl = []; for (const [cx, cz] of COLS){
        cl.push(geoTint(new THREE.CylinderGeometry(2.4, .75, HC - 1.4, 16, 1, true).translate(X(cx), (HC - 1.4) / 2, Z(cz)), '#d8d4cc'));
        cl.push(geoTint(new THREE.CylinderGeometry(5.2, 2.4, 2.2, 16, 1, true).translate(X(cx), HC - .3, Z(cz)), '#e2ddd3'));
        addCol({t:1, cx:X(cx), cz:Z(cz), r:1.1}); }
      const cm = new THREE.Mesh(geoMerge(cl), new THREE.MeshStandardMaterial({vertexColors:true, roughness:.5, metalness:.1, emissive:'#77736a', side:THREE.DoubleSide})); gr.add(cm); }
    /* ---- check-in islands A–F: counters both sides, a back wall with screens, a hanging letter board ---- */
    ISL.forEach((ix, i) => {
      const z0 = -40, z1 = -22;
      K.kBox(b, X(ix - .5), 0, Z(z0), X(ix + .5), 2.6, Z(z1), '#d9dde2');
      K.kSign(b, 'z', Z(z1 + .01), X(ix - .5), X(ix + .5), 1.2, 2.4, 1, null, K.PURP);
      for (const s of [-1, 1]){
        K.kBox(b, X(ix + s * .5), 0, Z(z0), X(ix + s * 2.1), 1.05, Z(z1), '#8b6f9e'); K.kFlat(b, X(Math.min(ix + s * .5, ix + s * 2.1)), Z(z0), X(Math.max(ix + s * .5, ix + s * 2.1)), Z(z1), 1.06, '#efedf0');
        for (let z = z0 + 1.5; z < z1 - 1; z += 3){ K.kBox(b, X(ix + s * .52), 1.5, Z(z - .55), X(ix + s * .6), 2.2, Z(z + .55), '#1d2733'); K.kBox(b, X(ix + s * 2.1), 0, Z(z - .7), X(ix + s * 3.0), .3, Z(z + .7), '#3a3f45'); }
      }
      const zc = (z0 + z1) / 2; K.kBox(b, X(ix - .04), 4.9, Z(zc - .04), X(ix + .04), 9, Z(zc + .04), GREY);
      K.kBox(b, X(ix - 1.9), 4.1, Z(z1 + 1.9), X(ix + 1.9), 5.6, Z(z1 + 2.05), '#24272d');
      K.kSign(b, 'z', Z(z1 + 2.06), X(ix - 1.8), X(ix + 1.8), 4.15, 5.55, 1, rg[COUNT[i]], '#ffffff'); K.kSign(b, 'z', Z(z1 + 1.89), X(ix - 1.8), X(ix + 1.8), 4.15, 5.55, -1, rg[COUNT[i]], '#ffffff');
      K.kBox(b, X(ix - .03), 5.6, Z(z1 + 1.94), X(ix + .03), 9, Z(z1 + 2.0), GREY);
      box(ix - 2.2, z0, ix + 2.2, z1);
    });
    /* ---- the departure board in the middle, the information desk, benches, potted palms ---- */
    { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; paintFids(cv); const t = new THREE.CanvasTexture(cv); t.anisotropy = ANISO;
      const fm = new THREE.MeshBasicMaterial({map:t}); KL.fids = {cv, t};
      for (const s of [1, -1]){ const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), fm); m.position.set(X(0), 6.6, Z(-10 + s * .26)); m.rotation.y = s > 0 ? 0 : Math.PI; gr.add(m); }
      K.kBox(b, X(-8.4), 2.4, Z(-10.25), X(8.4), 10.8, Z(-9.75), '#24272d', '');
      for (const x of [-6, 6]) K.kBox(b, X(x - .3), 0, Z(-10.3), X(x + .3), 2.4, Z(-9.7), '#3a3f45');
      K.kSign(b, 'z', Z(-9.72), X(-3), X(3), 10.85, 11.95, 1, rg.dep, '#ffffff'); K.kBox(b, X(-3), 10.8, Z(-10.1), X(3), 12, Z(-9.9), '#24272d', ''); K.kSign(b, 'z', Z(-10.11), X(-3), X(3), 10.85, 11.95, -1, rg.dep, '#ffffff');
      box(-8.5, -10.4, 8.5, -9.6); }
    K.kBox(b, X(-3.2), 0, Z(2.2), X(3.2), 1.1, Z(3.8), '#1d4f9a'); K.kFlat(b, X(-3.3), Z(2.1), X(3.3), Z(3.9), 1.12, '#efedf0');
    K.kBox(b, X(-1.6), 3.2, Z(2.9), X(1.6), 4, Z(3.1), '#1d4f9a', ''); K.kSign(b, 'z', Z(3.11), X(-1.55), X(1.55), 3.25, 3.95, 1, rg.info, '#ffffff'); K.kSign(b, 'z', Z(2.89), X(-1.55), X(1.55), 3.25, 3.95, -1, rg.info, '#ffffff');
    K.kBox(b, X(-.04), 4, Z(2.96), X(.04), 12, Z(3.04), GREY); box(-3.3, 2.1, 3.3, 3.9);
    for (const [bx, bz] of [[-40, 10.6], [40, 10.6], [-40, 13.2], [40, 13.2]]){ for (let k = 0; k < 6; k++){ const x = bx - 7 + k * 2.4; K.kBox(b, X(x), .42, Z(bz - .4), X(x + 2.2), .5, Z(bz + .4), '#2b2f36'); K.kBox(b, X(x), .5, Z(bz + .3), X(x + 2.2), 1.05, Z(bz + .42), '#2b2f36'); }
      K.kBox(b, X(bx - 7), 0, Z(bz - .1), X(bx + 7.4), .42, Z(bz + .1), GREY); box(bx - 7, bz - .5, bx + 7.4, bz + .5); }
    /* ---- すき家 SUKIYA on the west side: red fascia, glass front, counter and stools inside, menu board ---- */
    { const x0 = -62.6, x1 = -52, z0 = -14, z1 = 2, H = 5;
      K.kRoom(b, X(x0), .04, Z(z0), X(x1), H, Z(z1), '#fbf3e6', '#d4c3a8', '#f7f1e6', 'px');
      K.kBox(b, X(x1 - .3), 3.4, Z(z0), X(x1 + .3), H + .6, Z(z1), '#e2141c');
      K.kSign(b, 'x', X(x1 + .31), Z(z0 + 1), Z(z1 - 1), 3.5, H + .5, 1, rg.suki, '#ffffff');
      for (const z of [z0, z1]) K.kBox(b, X(x0), 0, Z(z - .2), X(x1 + .3), H + .6, Z(z + .2), '#e8e2d6');
      K.kBox(gl, X(x1 - .02), 0, Z(z0), X(x1 + .02), 3.4, Z(z1 - 3), '#ffffff', '');
      K.kBox(b, X(x0 + 2), 0, Z(z0 + 2), X(x0 + 3.2), 1.05, Z(z1 - 2), '#b5813f'); K.kFlat(b, X(x0 + 1.9), Z(z0 + 1.9), X(x0 + 3.3), Z(z1 - 1.9), 1.07, '#f3e9d8');
      for (let z = z0 + 2.6; z < z1 - 2; z += 1.4){ K.kBox(b, X(x0 + 3.8), 0, Z(z - .22), X(x0 + 4.2), .72, Z(z + .22), '#e2141c'); }
      K.kSign(b, 'x', X(x0 + .02), Z(z0 + 3), Z(z0 + 9), 2.2, 4.6, 1, rg.menu, '#ffffff');
      for (let z = z0 + 3; z < z1 - 1; z += 3.2) K.kBox(b, X(x0 + 6.2), 0, Z(z - .7), X(x0 + 7.6), .75, Z(z + .7), '#7a5230');
      box(x0, z0, x1 + .3, z1 - 3.2); box(x0, z1 - 3.2, x1 - 2, z1); }
    /* ---- the rainforest corner: glass box, soil, tall trees, ferns, a boardwalk ---- */
    { const x0 = 50, x1 = 62.6, z0 = -46.5, z1 = -26;
      K.kFlat(b, X(x0), Z(z0), X(x1), Z(z1), .05, '#3b2c20'); K.kBox(b, X(x0), 0, Z(z0), X(x1), .35, Z(z1), '#5a4632', 'ny py');
      K.kFlat(b, X(x0 + .2), Z(z0 + .2), X(x1 - .2), Z(z1 - .2), .36, '#35512a');
      K.kBox(b, X(x0 - 1.8), .3, Z(-38.5), X(x0), .45, Z(-35.5), '#8a6a48');
      K.kBox(gl, X(x0 - .02), 0, Z(z0), X(x0 + .02), 12, Z(z1), '#ffffff', ''); K.kBox(gl, X(x0), 0, Z(z1 - .02), X(x1), 12, Z(z1 + .02), '#ffffff', '');
      for (let z = z0; z <= z1; z += 3.4) K.kBox(b, X(x0 - .08), 0, Z(z - .08), X(x0 + .08), 12, Z(z + .08), '#c9ccd0');
      K.kSign(b, 'z', Z(z1 + .04), X(x0 + 2), X(x0 + 10), 3, 4, 1, rg.forest, '#ffffff');
      if (typeof jungleGeo !== 'undefined'){
        const rr = mkRng(321), n = 9, im = new THREE.InstancedMesh(jungleGeo, M('#ffffff', {vertexColors:true, flatShading:true, roughness:.9}), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), GR = ['#3f7a35', '#2f6634', '#4a8a3a'];
        for (let i = 0; i < n; i++){ const s = 1.1 + rr() * .7; m4.compose(new THREE.Vector3(X(x0 + 2 + rr() * (x1 - x0 - 4)), .3, Z(z0 + 2 + rr() * (z1 - z0 - 4))), q.setFromAxisAngle(UP, rr() * 6.28), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(GR[i % 3])); }
        jungleGeo.userData.keep = true; gr.add(im); }
      const fern = []; const rr = mkRng(654); for (let i = 0; i < 16; i++) fern.push(geoTint(new THREE.ConeGeometry(.9 + rr() * .5, 1.2 + rr(), 6).translate(X(x0 + 1 + rr() * (x1 - x0 - 2)), .9, Z(z0 + 1 + rr() * (z1 - z0 - 2))), rr() < .5 ? '#4f8f3a' : '#3d7a30'));
      gr.add(new THREE.Mesh(geoMerge(fern), M('#ffffff', {vertexColors:true, flatShading:true, roughness:.9})));
      box(x0, z0, x1, z1); }
    /* potted palms by some columns */
    { const pots = []; for (const [cx, cz] of COLS) if (cz > -10){ pots.push(geoTint(new THREE.CylinderGeometry(.7, .55, .8, 10).translate(X(cx + 2.4), .4, Z(cz + 2.4)), '#6b5a4a')); pots.push(geoTint(new THREE.ConeGeometry(1.1, 2.4, 7).translate(X(cx + 2.4), 2, Z(cz + 2.4)), '#3f7a35')); }
      gr.add(new THREE.Mesh(geoMerge(pots), M('#ffffff', {vertexColors:true, flatShading:true, roughness:.9}))); }
    /* ---- down to the ERL: concourse with fare gates, then the platform and the track between two tunnel mouths ---- */
    K.kRoom(b, X(-14), .04, Z(15.6), X(14), 5, Z(30), '#e9e5dd', '#d7d1c5', '#f2efe9', 'nz pz');
    /* steps up from behind the gates to the platform (1.4 m, like the train floor) */
    for (let k = 0; k < 7; k++) K.kBox(b, X(-1), 0, Z(27 + k * .45), X(9), .2 * (k + 1), Z(30), k % 2 ? '#cfc9be' : '#c4beb3', 'ny');
    K.kSign(b, 'x', X(-13.98), Z(18), Z(24), 2.6, 3.4, 1, rg.erl, '#ffffff');
    for (let k = 0; k <= 6; k++){ const x = -7 + k * 2.3; K.kBox(b, X(x - .16), 0, Z(23.3), X(x + .16), 1.05, Z(24.7), '#d0ccd8'); K.kFlat(b, X(x - .14), Z(23.4), X(x + .14), Z(23.7), 1.06, '#38e07e'); }
    K.kBox(b, X(-14), 0, Z(23.9), X(-7.2), .9, Z(24.1), '#c9c4cf'); K.kBox(b, X(6.9), 0, Z(23.9), X(14), .9, Z(24.1), '#c9c4cf');
    K.kSign(b, 'z', Z(23.28), X(-3.5), X(3.5), 2.8, 3.5, -1, rg.gate, '#ffffff');
    box(-15, 15, -14, 30); box(14, 15, 15, 30); box(-14, 23.3, 14, 24.7);
    /* platform room */
    { const x0 = -48, x1 = 48, zp = 38, zt = 42, PL = 1.4, H = 6.4;
      K.kBox(b, X(x0), 0, Z(30), X(x1), PL, Z(zp), '#8d887f', 'ny py'); K.kFlat(b, X(x0), Z(30), X(x1), Z(zp), PL, '#cfc9be'); K.kFlat(b, X(x0 + .5), Z(zp - .9), X(x1 - .5), Z(zp - .6), PL + .01, '#f2c230');
      K.kFlat(b, X(x0 - 40), Z(zp), X(x1 + 40), Z(zt), .1, '#7c766c');
      for (const o of [39.7 - .72, 39.7 + .72]) K.kBox(b, X(x0 - 40), .1, Z(o - .04), X(x1 + 40), .35, Z(o + .04), '#9da2a7', 'ny');
      for (let x = x0 - 40; x < x1 + 40; x += .65) K.kBox(b, X(x), .1, Z(38.7), X(x + .25), .2, Z(40.7), '#a9a39a', 'ny');
      const yb = 0;
      K.kSign(b, 'z', Z(zt), X(x0), X(x1), yb, H, -1, null, '#3a3f45');
      K.kQuad(b, [X(x0), H, Z(30)], [X(x1), H, Z(30)], [X(x1), H, Z(zt)], [X(x0), H, Z(zt)], '#e8e6e2');
      for (const [a, c] of [[x0, -14], [14, x1]]) K.kSign(b, 'z', Z(30), X(a), X(c), 0, H, 1, null, '#e9e5dd');
      K.kSign(b, 'z', Z(30), X(-14), X(14), 5, H, 1, null, '#e9e5dd');
      for (const [x, dir] of [[x0, 1], [x1, -1]]){ K.kSign(b, 'x', X(x), Z(30), Z(zp - .1), 0, H, dir, null, '#e9e5dd'); K.kSign(b, 'x', X(x), Z(zp - .1), Z(zt), yb, H, dir, null, '#050608'); }
      K.kSign(b, 'z', Z(zt - .02), X(-6), X(6), 3.8, 5.5, -1, rg.klt, '#ffffff'); K.kSign(b, 'z', Z(zt - .02), X(-30), X(-16), 4.3, 5, -1, rg.erl, '#ffffff'); K.kSign(b, 'z', Z(zt - .02), X(16), X(30), 4.3, 5, -1, rg.erl, '#ffffff');
      for (let x = x0 + 8; x < x1; x += 16) if (Math.abs(x) > 12) K.kBox(b, X(x - .25), PL, Z(33.8), X(x + .25), H, Z(34.3), '#d6d1c7'); }
    /* the gate flaps that open in the cutscene */
    const gg = new THREE.Group(), fl = new THREE.BoxGeometry(.9, .55, .06), fm = new THREE.MeshStandardMaterial({color:'#b48cf0', transparent:true, opacity:.75, roughness:.2});
    const gL = new THREE.Mesh(fl, fm), gR = new THREE.Mesh(fl, fm); gL.position.x = -.55; gR.position.x = .55; gg.add(gL, gR); gg.position.set(X(1.15), .65, Z(24)); gr.add(gg);
    const gate = k => { gL.position.x = -.55 - .5 * k; gR.position.x = .55 + .5 * k; gL.rotation.y = -k * 1.2; gR.rotation.y = k * 1.2; };
    /* KLIA tail mark on the parked planes' fins is in the vertex colours; the hall in two meshes */
    const hall = new THREE.Mesh(K.kGeo(b), mat); hall.receiveShadow = true; gr.add(hall);
    const glass = new THREE.Mesh(K.kGeo(gl), K.kGlass()); glass.renderOrder = 1; gr.add(glass);
    buildWalkers(gr);
    KL.station = stationSpec(K, gate);
    for (const k in RINGS){ const [x, z] = W(...RINGS[k]); KL.marks[k].position.set(x, .1, z); KL.marks[k].visible = true; }
    return KL.station;
  }

  /* ---------- travellers pushing luggage trolleys round the hall ---------- */
  const LOOPS = [[-31, 31, -44, -12], [-31, 31, -12, 8], [-50, -31, -12, 8], [31, 50, -12, 8]];
  function buildWalkers(gr){
    const n = TOUCH ? 14 : 24, rr = mkRng(4242);
    if (typeof npcBodyGeo === 'undefined') return;
    const mk = (geo, mat, k) => { geo.userData.keep = true; const im = new THREE.InstancedMesh(geo, mat, k); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gr.add(im); return im; };
    const trol = geoMerge([geoTint(new THREE.BoxGeometry(.7, .08, 1.0).translate(0, .35, 0), '#9aa0a6'), geoTint(new THREE.BoxGeometry(.6, .7, .45).translate(0, .75, .1), '#ffffff'),
      geoTint(new THREE.BoxGeometry(.05, 1.0, .05).translate(.3, .6, -.48), '#9aa0a6'), geoTint(new THREE.BoxGeometry(.05, 1.0, .05).translate(-.3, .6, -.48), '#9aa0a6'), geoTint(new THREE.BoxGeometry(.66, .05, .05).translate(0, 1.1, -.48), '#3a3f45')]);
    const P = KL.im = {body:mk(npcBodyGeo, new THREE.MeshStandardMaterial({roughness:.8}), n), head:mk(npcHeadGeo, new THREE.MeshStandardMaterial({roughness:.7}), n), gear:mk(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), n),
      leg:mk(npcLegGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true}), n * 2), sleeve:mk(npcSleeveGeo, new THREE.MeshStandardMaterial({roughness:.8}), n * 2), fore:mk(npcForeGeo, new THREE.MeshStandardMaterial({roughness:.7}), n * 2),
      trol:new THREE.InstancedMesh(trol, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.6}), n)};
    P.trol.frustumCulled = false; gr.add(P.trol);
    const BAGS = ['#c0392b', '#2c3e50', '#16a085', '#8e44ad', '#f39c12', '#7f8c8d', '#2980b9'];
    KL.walkers = [];
    for (let i = 0; i < n; i++){
      const L = LOOPS[i % LOOPS.length], sh = SHIRTS[(i * 3 + 2) % SHIRTS.length], sk = SKIN[i % SKIN.length];
      P.body.setColorAt(i, _col.set(sh)); P.head.setColorAt(i, _col.set(sk)); P.trol.setColorAt(i, _col.set(BAGS[i % BAGS.length]));
      for (const s of [0, 1]){ P.sleeve.setColorAt(i * 2 + s, _col.set(sh)); P.fore.setColorAt(i * 2 + s, _col.set(sk)); P.leg.setColorAt(i * 2 + s, _col.set(PANTS[(i + 1) % PANTS.length])); }
      const per = 2 * ((L[1] - L[0]) + (L[3] - L[2]));
      KL.walkers.push({L, per, t:rr() * per, dir:rr() < .5 ? 1 : -1, sp:1.1 + rr() * .6, lat:(rr() - .5) * 2.2, walk:rr() * 6, x:0, z:0, h:0, bump:0});
    }
  }
  /* position on a loop rectangle at distance t */
  function loopAt(w){
    const [x0, x1, z0, z1] = w.L, a = x1 - x0, c = z1 - z0; let t = ((w.t % w.per) + w.per) % w.per;
    if (t < a) return [x0 + t, z0 + w.lat, 1, 0]; t -= a;
    if (t < c) return [x1 - w.lat, z0 + t, 0, 1]; t -= c;
    if (t < a) return [x1 - t, z1 - w.lat, -1, 0]; t -= a;
    return [x0 + w.lat, z1 - t, 0, -1];
  }
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  function walkersUpdate(dt){
    const P = KL.im; if (!P) return;
    KL.walkers.forEach((w, i) => {
      const px = nw.x - KX, pz = nw.z - KZ;
      if (Math.hypot(px - w.x, pz - w.z) > 1.6) w.t += w.dir * w.sp * dt;   /* they stop for you */
      const [x, z, fx, fz] = loopAt(w); w.x = x; w.z = z; w.h = Math.atan2(fx * w.dir, fz * w.dir); w.walk += dt * w.sp * 4.6;
      const swing = Math.sin(w.walk) * .45;
      _p.set(KX + x, 0, KZ + z); _q.setFromAxisAngle(UP, w.h); _m.compose(_p, _q, _s);
      P.body.setMatrixAt(i, _m); P.head.setMatrixAt(i, _m); P.gear.setMatrixAt(i, _m);
      for (const s of [-1, 1]){ const j = i * 2 + (s > 0 ? 1 : 0); P.leg.setMatrixAt(j, npcLimb(s * .09, .92, 0, swing * s));
        const mm = npcLimb(s * .215, 1.39, s * .1, -.6); P.sleeve.setMatrixAt(j, mm); P.fore.setMatrixAt(j, mm); }
      _p.set(KX + x + Math.sin(w.h) * 1.0, 0, KZ + z + Math.cos(w.h) * 1.0); _m.compose(_p, _q, _s); P.trol.setMatrixAt(i, _m);
      /* bumping into the player: push them aside; during an errand it costs time */
      w.bump = Math.max(0, w.bump - dt);
      for (const [bx, bz, r] of [[x, z, .75], [x + Math.sin(w.h), z + Math.cos(w.h), .7]]){
        const dx = px - bx, dz = pz - bz, d = Math.hypot(dx, dz);
        if (d < r + .45 && d > 1e-3){ const k = (r + .45 - d) / d, nx_ = nw.x + dx * k, nz_ = nw.z + dz * k; if (!footBlocked(nx_, nz_)){ nw.x = nx_; nw.z = nz_; }
          if (KL.err && !w.bump && nw.spd > 3){ w.bump = 2; KL.err.left -= 1.5; KL.err.hits++; tone('square', 300, 200, .12, .08); spawnPart('excl', nw.x, 2.6, nw.z, .8, {vy:1.5, life:.8, op:1, color:'#ff9f43'}); toast('撞到旅客了！', '−1.5 秒 · 绕着行李车走', 1200); } }
      }
    });
    for (const k in P) P[k].instanceMatrix.needsUpdate = true;
  }

  /* ---------- 「送机赶时间」 errands from the information desk ---------- */
  const ERR_KINDS = [
    {id:'passport', item:'护照', why:'学长把护照落在你这儿了，值机马上关柜！', to:() => 'c' + COUNT[(Math.random() * 6) | 0]},
    {id:'gyudon', item:'すき家牛丼', why:'值机柜台的地勤姐姐饿了：先去すき家取一份牛丼，再送过去', from:'suki', to:() => 'c' + COUNT[(Math.random() * 6) | 0]},
    {id:'bank', item:'充电宝', why:'雨林那边有位旅客手机没电了，送个充电宝过去', to:() => 'forest'},
    {id:'tag', item:'行李牌', why:'一位阿姨的行李牌掉在服务台，送回她排队的柜台', to:() => 'c' + COUNT[(Math.random() * 6) | 0]}
  ];
  const MEDAL = ['金牌', '银牌', '铜牌'], MEDAL_C = ['#e3b95a', '#b8c2cc', '#c98a55'], PAY = [40, 25, 15];
  GX_MORE.push({id:'klia', name:'KLIA 送机', fmt:v => `最多剩 ${(+v).toFixed(1)} 秒`});
  achAdd([['klia1', '机场跑腿王', 'KLIA 送机拿到金牌', 40], ['sukiya', '深夜牛丼', '在 KLIA 的すき家吃一碗牛丼', 10]]);
  try { const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (d && d.ach) for (const k of ['klia1', 'sukiya']) if (d.ach[k]) prog.ach[k] = +d.ach[k] || 1; } catch(e){}
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function errStart(){
    const k = ERR_KINDS[(Math.random() * ERR_KINDS.length) | 0], to = SPOT[k.to()], from = k.from ? SPOT[k.from] : null, here = {x:RINGS.info[0], z:RINGS.info[1]};
    const route = (from ? dist(here, from) + dist(from, to) : dist(here, to)) * 1.25;
    const limit = Math.round(route / 9 + 5.5);
    KL.err = {k, from, to, got:!from, limit, left:limit, hits:0, t:0};
    gxCallout('送机赶时间', `${k.item} → ${from ? from.name + ' → ' : ''}${to.name}`, '#ffd23a');
    toast(k.why, `限时 ${limit} 秒 · ${TOUCH ? '推到底' : '按住 Shift'}跑 · 撞到旅客扣时间`, 3200);
    sfx.ding();
  }
  function errEnd(ok){
    const e = KL.err; KL.err = null; KL.marks.tgt.visible = false; KL.lbls.tgt.dead = true;
    if (!ok){ sfx.fail(); gxCallout('没赶上', `${e.k.item}没送到 · 再去问讯台接一单`, '#ff6b5a'); return; }
    const frac = e.left / e.limit, gr = frac >= .45 ? 0 : frac >= .2 ? 1 : 2, pay = PAY[gr];
    earn(pay); sess.acts++;
    const prev = prog.best.klia, rec = prev == null || e.left > prev; if (rec) prog.best.klia = Math.round(e.left * 10) / 10;
    const loot = window.XParts ? XParts.reward('klia', gr, 'KLIA 送机' + MEDAL[gr]) : [];
    if (gr === 0) unlock('klia1');
    saveGame();
    for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09);
    gxCallout(MEDAL[gr] + (rec ? ' · 新纪录' : ''), `剩 ${e.left.toFixed(1)} 秒 · +RM ${pay}${loot.length && window.XParts ? ' · ' + XParts.text(loot) : ''}`, MEDAL_C[gr]);
  }
  function errUpdate(dt){
    const e = KL.err; if (!e) return;
    e.left -= dt; e.t += dt;
    const goal = e.got ? e.to : e.from, [gx_, gz] = W(goal.x, goal.z);
    KL.marks.tgt.position.set(gx_, .1, gz); KL.marks.tgt.visible = true; KL.marks.tgt.userData.ring.scale.y = 1 + Math.sin(e.t * 6) * .2;
    KL.lbls.tgt.pos.set(gx_, 4.6, gz); KL.lbls.tgt.el.textContent = (e.got ? '送到这里 · ' : '先取 · ') + goal.name; KL.lbls.tgt.dead = false;
    if (Math.hypot(nw.x - gx_, nw.z - gz) < 2.6){
      if (!e.got){ e.got = true; tone('triangle', 880, 1320, .2, .12); toast(`拿到${e.k.item}了`, `快送去 ${e.to.name}`, 1500); }
      else { errEnd(true); return; }
    }
    if (e.left <= 0){ errEnd(false); return; }
    const t = `送机 · ${e.k.item} → ${(e.got ? e.to : e.from).name} · ${Math.max(0, e.left).toFixed(1)} 秒`;
    if (missionEl.textContent !== t) missionEl.textContent = t;
    missionEl.classList.toggle('urgent', e.left < 8);
  }

  /* ---------- markers (made once, kept hidden while you are not at KLIA) ---------- */
  KL.marks = {info:gxMarker('#ffd23a', .42), suki:gxMarker('#ff5a4f', .42), forest:gxMarker('#5ef08a', .38), erl:gxMarker('#a774ff', .42), tgt:gxMarker('#ffd23a', .55)};
  for (const k in KL.marks) KL.marks[k].visible = false;
  KL.lbls.tgt = addLabel('', 0, 0, 0, true); KL.lbls.tgt.dead = true;
  const LB = {info:'问讯台 · 跑腿单', suki:'すき家 · 24H', erl:'ERL 回程'};
  for (const k in LB){ KL.lbls[k] = addLabel(LB[k], 0, 0, 0, true); KL.lbls[k].dead = true; }

  function release(){
    if (KL.err){ KL.err = null; }
    for (const c of KL.cols){ const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); } KL.cols = [];
    XTrain.kit.kDispose(KL.g); KL.g = null; KL.im = null; KL.walkers = []; KL.fids = null; KL.station = null;
    for (const k in KL.marks) KL.marks[k].visible = false; for (const k in KL.lbls) KL.lbls[k].dead = true;
    missionEl.classList.remove('urgent');
  }
  let near = '';
  function update(dt){
    if (!KL.g) return;
    walkersUpdate(dt); errUpdate(dt);
    if ((KL.fidsT -= dt) <= 0 && KL.fids){ KL.fidsT = 20; paintFids(KL.fids.cv); KL.fids.t.needsUpdate = true; }
    KL.sukiT = Math.max(0, KL.sukiT - dt);
    near = '';
    const T = performance.now() / 330;
    for (const k of ['info', 'suki', 'erl']){
      const [x, z] = W(...RINGS[k]), d = Math.hypot(nw.x - x, nw.z - z); KL.marks[k].userData.ring.scale.y = 1 + Math.sin(T) * .15;
      const L = KL.lbls[k]; L.pos.set(x, 4.2, z); L.dead = d > 40;
      if (d < 3.4 && k !== 'erl') near = k;
    }
    KL.marks.info.visible = !KL.err;
    if (!KL.err && missionEl.textContent !== 'KLIA T1 · 出发大厅') missionEl.textContent = 'KLIA T1 · 出发大厅';
  }
  function prompt(){
    if (near === 'info') return KL.err ? '' : (TOUCH ? '点「上车」接一单跑腿：送机赶时间' : '按 F 接一单跑腿：送机赶时间');
    if (near === 'suki') return KL.err && !KL.err.got && KL.err.from === SPOT.suki ? '' : (TOUCH ? '点「上车」买一碗牛丼 RM 12.90' : '按 F 买一碗牛丼（并）RM 12.90');
    return '';
  }
  function tryF(){
    if (near === 'info' && !KL.err){ errStart(); return true; }
    if (near === 'suki'){
      if (KL.sukiT > 0) return true;
      if (money < 12.9){ toast('钱不够', '牛丼（并）RM 12.90', 1600); return true; }
      KL.sukiT = 4; money = Math.round((money - 12.9) * 100) / 100; moneyChanged();
      tone('triangle', 660, 660, .12, .1); tone('triangle', 880, 880, .2, .1, .12);
      toast('牛丼（并）−RM 12.90', 'いらっしゃいませ！热乎乎的，吃饱了', 2200); unlock('sukiya'); return true;
    }
    return false;
  }
  function target(){ const e = KL.err; if (!e) return null; const goal = e.got ? e.to : e.from, [x, z] = W(goal.x, goal.z); return {x, z, label:goal.name}; }
  /* the floor plan on the minimap */
  function mini(mg, Sz){
    const k = (Sz - 20) / 128, X = x => Sz / 2 + (x - KX) * k, Z = z => Sz / 2 + (z - KZ + 6) * k, R = (x0, z0, x1, z1, c) => { mg.fillStyle = c; mg.fillRect(X(KX + x0), Z(KZ + z0), (x1 - x0) * k, (z1 - z0) * k); };
    mg.fillStyle = '#5d6166'; mg.fillRect(0, 0, Sz, Sz);
    R(-63, -47, 63, 15, '#e6e1d6'); R(-14, 15, 14, 30, '#d7d1c5'); R(-48, 30, 48, 38, '#cfc9be'); R(-48, 38, 48, 42, '#7c766c');
    ISL.forEach(x => R(x - 2.1, -40, x + 2.1, -22, '#8b6f9e')); R(-8.5, -10.4, 8.5, -9.6, '#24272d'); R(-62.6, -14, -52, 2, '#e2141c'); R(50, -46.5, 62.6, -26, '#3f7a35');
    mg.fillStyle = '#9b958a'; for (const [cx, cz] of COLS){ mg.beginPath(); mg.arc(X(KX + cx), Z(KZ + cz), Math.max(2, 1.2 * k), 0, 7); mg.fill(); }
    mg.font = `700 ${Math.round(11 * Sz / 300)}px sans-serif`; mg.textAlign = 'center'; mg.fillStyle = '#1f2a33'; ISL.forEach((x, i) => mg.fillText(COUNT[i], X(KX + x), Z(KZ - 42)));
    mg.textAlign = 'start';
    const dot = (x, z, c, r) => { mg.fillStyle = c; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2; mg.beginPath(); mg.arc(X(KX + x), Z(KZ + z), r, 0, 7); mg.fill(); mg.stroke(); };
    mg.fillStyle = '#6c5a48'; for (const w of KL.walkers){ mg.beginPath(); mg.arc(X(KX + w.x), Z(KZ + w.z), 2, 0, 7); mg.fill(); }
    dot(...RINGS.erl, '#a774ff', 6); if (!KL.err) dot(...RINGS.info, '#ffd23a', 6); dot(...RINGS.suki, '#ff5a4f', 5);
    if (KL.err){ const g2 = KL.err.got ? KL.err.to : KL.err.from; dot(g2.x, g2.z, '#4fd18b', 8); }
    mg.save(); mg.translate(X(nw.x), Z(nw.z)); mg.rotate(-(nw.h + Math.PI)); mg.fillStyle = '#f2c64a'; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2.5;
    mg.beginPath(); mg.moveTo(0, -11); mg.lineTo(7.5, 8); mg.lineTo(0, 4); mg.lineTo(-7.5, 8); mg.closePath(); mg.stroke(); mg.fill(); mg.restore();
  }
  XTrain.register({id:'klia', name:'KLIA 吉隆坡国际机场', en:'T1 · 1 站', station0:'KLIA T1', mins:7, fare:6.2, z:KZ, hello:'吉隆坡国际机场 1 号航站楼 · 去问讯台接跑腿单',
    camDist:10, camPitch:.22,
    build, release, update, prompt, tryF, target, mini,
    onArrive(){ window.XINDOOR_PITCH = .05; }, onLeave(){ window.XINDOOR_PITCH = null; if (KL.err) KL.err = null; }});
  /* later destinations: the framework already lists them (z reserved: Putrajaya / IOI −3100, the city centre −3600) */
  XTrain.register({id:'putrajaya', name:'布城 Putrajaya', en:'粉红清真寺 · IOI City Mall · 1 站约 9 分钟再打车', soon:true, mins:9, fare:6, z:-3100});
  XTrain.register({id:'kl', name:'吉隆坡市中心 KL', en:'双子塔 · 默迪卡 118 · 独立广场 · 到 KL Sentral 约 28 分钟', soon:true, mins:28, fare:17, z:-3600});
  window.XKlia = {state:KL, start:errStart, spots:SPOT, rings:RINGS};
})();
