/* XMUM 校园漫游 · Kota Warisan 夜市（Pasar Malam Kota Warisan）
 *
 * 真实的夜市：雪邦市议会（MP Sepang）的巴刹名单上写着 Pasar Malam Kota Warisan，每周六 4:00–11:00 pm；具体摆在哪条路没查到。
 * 仓库主人在大地图上圈的地方（Taman Warisan Megah 排屋南边、偏东）照 OpenStreetMap 是 SK Kota Warisan 和 Surau Al-Hijrah 北边的一片草地
 * （way 662301852），这里就在这块地上铺一片空地摆摊。游戏里没有星期几，所以每天黄昏开市、天黑最热闹，白天只剩空地和收起来的帐篷。
 *
 * 两条过道、四排摊位（彩色条纹帆布顶、折叠桌、灯泡串、手写价格牌、煤气炉和烤架冒烟），过道里人挤人，摊主站在桌子后面。
 *   北边过道：小吃 + 东头水果（西瓜、芒果、红毛丹、山竹、菠萝）；南边过道：小吃、饮料（甘蔗水、椰子水、拉茶）、杂货，东头是猫山王榴莲摊。
 * 猫山王挑战：在榴莲摊前的绿圈按 F。替宿舍同学用 RM 150 买一颗猫山王：四颗里只有 5 次检查机会（看底部星纹、看蒂头、摇一摇、闻一闻），
 *   可能混着一颗冒充的 D24；挑好以后和榴莲哥砍价（砍太狠他会不耐烦），最后开榴莲算分。找回的零钱归你，奖牌掉改装零件（XParts.reward('durian')）。
 *   和 Bell 后巷那排夜市（js/89-outskirts-play.js：吃五种小吃、大胃王争霸赛）不重复。
 *
 * 地面在山树种好以后才压平（js/12-terrain.js 的 TG.flattenLate），所以地图上别的树一棵都不挪；这块地上的山树清掉。
 * 性能：摊位、货物、水果、榴莲都是 InstancedMesh（一共 5 个），灯泡串和炭火是一个合并 mesh，价格牌是一张图集；逛街的人是一组 InstancedMesh，
 *   只有开市并且镜头在 320 米内才动。离得远（700 米外）整个夜市不画。
 * 这个文件要排在 js/89-outskirts-play.js 后面加载（用它的面板、圈和 F 键钩子）。 */
'use strict';
(() => {
  if (typeof TG === 'undefined' || !TG.flattenLate || typeof opSpot !== 'function' || typeof opOpen !== 'function') return;
  const PI = Math.PI;

  /* ---------- layout ---------- */
  const PM = {x0:300, x1:520, z0:516, z1:569, lane:434, cx:410, cz:542.5};   /* the open lot; lane: the way in from the Bell back lane (x 434, between the apartment slabs) */
  const PM_PAD = {x0:290, x1:530, z0:500, z1:584, fall:40};
  const AISLE = [530, 556], SW = 3.6;                                         /* aisle centres; stall width */
  const ROWS = [{z:525.7, f:1}, {z:534.3, f:-1}, {z:551.7, f:1}, {z:560.3, f:-1}];   /* f = +1: the stall faces +z (south) */
  const SEGS = [[306, 424.8], [444, 508.8]];                                  /* 33 + 18 stalls per row, the cross gap at the lane */

  /* ---------- level the lot now that the hill trees are planted; re-seat trees on its sloping edges, clear the rest ---------- */
  TG.flattenLate(PM_PAD);
  /* the minimap's shaded hills (js/13-outskirts.js outRelief) were painted from the old heights: repaint the levelled patch the same way */
  if (typeof outRelief !== 'undefined' && outRelief.getContext){
    const {nx, nz, C, x0, z0, Y} = TG, R = PM_PAD.fall + 16, g = outRelief.getContext('2d');
    const i0 = Math.max(1, Math.floor((PM_PAD.x0 - R - x0) / C)), i1 = Math.min(nx - 2, Math.ceil((PM_PAD.x1 + R - x0) / C));
    const j0 = Math.max(1, Math.floor((PM_PAD.z0 - R - z0) / C)), j1 = Math.min(nz - 2, Math.ceil((PM_PAD.z1 + R - z0) / C));
    const img = g.getImageData(i0, j0, i1 - i0 + 1, j1 - j0 + 1), lo = new THREE.Color('#79a35a'), hi = new THREE.Color('#3f6f33'), c = new THREE.Color();
    const at = (i, j) => Math.max(0, Y[j * nx + i]);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
      const h = at(i, j), sh = 1 + ((at(i - 1, j) - at(i + 1, j)) + (at(i, j - 1) - at(i, j + 1))) * .05, o = ((j - j0) * (i1 - i0 + 1) + (i - i0)) * 4;
      c.copy(lo).lerp(hi, smooth01(0, 45, h)).multiplyScalar(Math.max(.7, Math.min(1.25, sh)));
      img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, i0, j0);
  }
  {
    const CLEAR = {x0:PM.x0 - 12, x1:PM.x1 + 12, z0:PM.z0 - 16, z1:PM.z1 + 10}, LANE = {x0:PM.lane - 13, x1:PM.lane + 13, z0:440, z1:PM.z0};
    if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => {
      if (o.hidden) return;
      const inR = R => o.x > R.x0 && o.x < R.x1 && o.z > R.z0 && o.z < R.z1;
      if (inR(CLEAR) || inR(LANE)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); return; }
      if (rectDist(o.x, o.z, PM_PAD) > PM_PAD.fall + 6) return;
      let y = terrainY(o.x, o.z);
      if (set.kind === 'tree'){ const r = .48 * o.s; for (let a = 0; a < 8; a++) y = Math.min(y, terrainY(o.x + Math.cos(a * .785) * r, o.z + Math.sin(a * .785) * r)); y -= .05; }
      if (Math.abs(y - o.y) > .005){ o.y = o.ty = y; setKnock(set, i, !!o.down, 0, 1); }
    });
  }

  /* ---------- materials: lit by the scene in daylight, glowing in their own colour at night (the stalls' own bulbs) ---------- */
  const pmGlow = {value:0};
  function pmMat(o){
    const m = new THREE.MeshLambertMaterial(o);
    m.onBeforeCompile = sh => {
      sh.uniforms.pmGlow = pmGlow;
      sh.fragmentShader = 'uniform float pmGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * pmGlow;');
    };
    return m;
  }
  const BOUND = new THREE.Sphere(new THREE.Vector3(PM.cx, 2, PM.cz), 135);

  /* ---------- the ground: the lot, the lane in, stall lines painted on it (always there) ---------- */
  const ground = {p:[], n:[], c:[]}, _c = new THREE.Color();
  function gQuad(x0, z0, x1, z1, y, col){
    _c.set(col);
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]){ ground.p.push(x, y, z); ground.n.push(0, 1, 0); ground.c.push(_c.r, _c.g, _c.b); }
  }
  gQuad(PM.x0 - 4, PM.z0 - 4, PM.x1 + 4, PM.z1 + 4, .035, '#7d7a72');      /* compacted earth round the edge */
  gQuad(PM.x0, PM.z0, PM.x1, PM.z1, .04, '#8d8a83');                          /* the lot */
  gQuad(PM.lane - 3, 365, PM.lane + 3, PM.z0, .04, '#8d8a83');               /* lane from the Bell back lane */
  for (const r of ROWS) for (const [a, b] of SEGS){                           /* white lot lines: where each stall goes */
    const zf = r.z + r.f * 1.3, zb = r.z - r.f * 1.3;
    gQuad(a, Math.min(zf, zf + r.f * .12), b, Math.max(zf, zf + r.f * .12), .05, '#e6e2d6');
    gQuad(a, Math.min(zb, zb - r.f * .12), b, Math.max(zb, zb - r.f * .12), .05, '#e6e2d6');
    for (let x = a; x <= b + .01; x += SW) gQuad(x - .06, r.z - 1.3, x + .06, r.z + 1.3, .05, '#e6e2d6');
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ground.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ground.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(ground.c, 3));
    const m = new THREE.Mesh(g, typeof outGroundMat !== 'undefined' ? outGroundMat : M('#ffffff', {vertexColors:true})); m.receiveShadow = true; scene.add(m);
  }

  /* ---------- hand-written price boards: one atlas, 4 x 5 ---------- */
  const SIGNS = [['SATAY', '沙爹 10 支 RM 8'], ['AYAM GORENG', '炸鸡 RM 6'], ['APAM BALIK', '煎饼 RM 3'], ['PISANG GORENG', '炸香蕉 5 个 RM 2'],
    ['SOTONG BAKAR', '烤鱿鱼 RM 10'], ['RAMLY BURGER', '汉堡 RM 5.50'], ['NASI LEMAK', '椰浆饭 RM 3'], ['CENDOL', '煎蕊 RM 4'],
    ['AIR TEBU', '甘蔗水 RM 3'], ['AIR KELAPA', '椰子水 RM 5'], ['TEH TARIK', '拉茶 RM 2.50'], ['TEMBIKAI', '西瓜 RM 3/kg'],
    ['MANGGA', '芒果 3 粒 RM 10'], ['RAMBUTAN', '红毛丹 RM 6/kg'], ['MANGGIS', '山竹 RM 8/kg'], ['NANAS', '菠萝 RM 4'],
    ['MUSANG KING', '猫山王 RM 68/kg'], ['DURIAN D24', '榴莲 RM 35/kg'], ['BAJU MURAH', '衣服 RM 10'], ['MAINAN', '玩具 RM 5']];
  const HAND = '"Segoe Print","Comic Sans MS","Chalkboard SE","Marker Felt",cursive';
  const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 640;
  const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.anisotropy = ANISO;
  function paintAtlas(){
    const g = atlas.getContext('2d'), rr = mkRng(99);
    SIGNS.forEach(([a, b], i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 128, bg = ['#f4ecd8', '#e9d3a8', '#fff6c2', '#ffffff'][i % 4], ink = ['#c0262d', '#1d3f8a', '#1f1f22', '#0f6b3a'][(i * 3 + 1) % 4];
      g.fillStyle = '#5a4630'; g.fillRect(x, y, 256, 128); g.fillStyle = bg; g.fillRect(x + 5, y + 5, 246, 118);
      g.save(); g.translate(x + 128, y + 64); g.rotate((rr() - .5) * .06);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
      g.font = `700 ${a.length > 11 ? 30 : 38}px ${HAND}`; g.fillText(a, 0, -20, 232);
      g.fillStyle = i === 16 ? '#c0262d' : '#1f1f22'; g.font = `700 30px ${OUT_FONT}`; g.fillText(b, 0, 28, 236);
      g.restore();
    });
    atlasTex.needsUpdate = true;
  }
  paintAtlas(); document.fonts && document.fonts.ready.then(paintAtlas);

  /* ---------- builders: instanced pieces collected in lists, then one InstancedMesh each ---------- */
  const L = {box:[], cyl:[], ball:[], dur:[], pod:[]};
  const glow = [], signQ = [], pools = [], wires = [], keepers = [];
  const rr = mkRng(4417);
  const pick = a => a[(rr() * a.length) | 0];
  /* one stall: local x along the row, local z toward the aisle (front), y up */
  function stall(cx, cz, f){
    const W = (lx, lz) => [cx + lx * f, cz + lz * f];
    const put = (list, lx, ly, lz, sx, sy, sz, col, ry, rx) => { const [x, z] = W(lx, lz); list.push([x, ly, z, sx, sy, sz, col, (ry || 0) + (f < 0 ? PI : 0), rx || 0]); };
    const B = (lx, ly, lz, sx, sy, sz, col, ry) => put(L.box, lx, ly, lz, sx, sy, sz, col, ry);
    const lit = (lx, ly, lz, w, h, d, col) => { const [x, z] = W(lx, lz); glow.push(geoTint(new THREE.BoxGeometry(f > 0 ? w : w, h, d).translate(x, ly, z), col)); };
    return {W, put, B, lit};
  }
  const CANOPY = ['#d7262d', '#2d5d8a', '#e0b020', '#2d8a6e', '#d7262d', '#2d5d8a'];
  const CLOTH = ['#c0262d', '#2d5d8a', '#f2efe6', '#e0b020', '#2d8a6e', '#8e44ad'];
  /* what each stall sells: the pattern per row and segment, with a little randomness */
  const SNACK = ['satay', 'ayam', 'apam', 'pisang', 'sotong', 'ramly', 'nasi', 'cendol', 'teh', 'tebu', 'satay', 'ayam', 'nasi', 'kelapa'];
  const FRUIT = ['tembikai', 'mangga', 'rambutan', 'manggis', 'nanas'];
  function typeAt(row, seg, i, n){
    if (seg === 1){
      if (row === 3 && i >= n - 5) return 'durian';
      if (row === 2 && i >= n - 3) return i === n - 1 ? 'd24' : 'durian';
      if (row <= 1 && i >= 4) return i % 7 === 3 ? (row ? 'tebu' : 'kelapa') : FRUIT[(i + row * 2) % FRUIT.length];
    }
    if (row === 2 && seg === 0 && i >= 22 && i < 28) return i % 2 ? 'baju' : 'mainan';
    return SNACK[(i * 5 + row * 3 + seg + ((rr() * 3) | 0)) % SNACK.length];
  }
  const SIGN_OF = {satay:0, ayam:1, apam:2, pisang:3, sotong:4, ramly:5, nasi:6, cendol:7, tebu:8, kelapa:9, teh:10, tembikai:11, mangga:12, rambutan:13, manggis:14, nanas:15, durian:16, d24:17, baju:18, mainan:19};
  const GRILLS = [];        /* smoke sources: [x, z] */
  const SPOT = {};          /* where some stalls ended up (the durian challenge, the fruit zone): name → [x, z, f] */

  /* fruit piles: rows of balls stacked in two layers on the table */
  function pile(s, kind, lx, lz, nx, nz){
    const F = {tembikai:[.2, .18, .24, ['#2f7d32', '#3a8a3a', '#26632a']], mangga:[.075, .065, .1, ['#f2b632', '#e8a020', '#9fbf3a']],
      rambutan:[.045, .045, .05, ['#d6262d', '#c41e2a', '#e0402a']], manggis:[.055, .05, .055, ['#4a1f3d', '#3d1932', '#562447']],
      nanas:[.08, .13, .08, ['#c99a2e', '#b8892a']], kelapa:[.15, .15, .15, ['#5f8f2e', '#6a9a34', '#4f7f28']]}[kind];
    const [rx, ry, rz, cols] = F, gx = rx * 2.05, gz = rz * 2.05;
    for (let layer = 0; layer < 2; layer++) for (let a = 0; a < nx - layer; a++) for (let b = 0; b < nz - layer; b++){
      const x = lx + (a - (nx - layer - 1) / 2) * gx, z = lz + (b - (nz - layer - 1) / 2) * gz, y = .92 + ry + layer * ry * 1.6;
      s.put(L.ball, x, y, z, rx, ry, rz, pick(cols), rr() * PI, kind === 'mangga' ? .4 : 0);
      if (kind === 'nanas') s.B(x, y + ry + .06, z, .05, .12, .05, '#3f7f2a', rr());
    }
  }
  function goods(s, type){
    const tray = (lx, lz, col, food, n) => { s.B(lx, .95, lz, .42, .05, .32, col); for (let k = 0; k < (n || 4); k++) s.B(lx + (k % 2 - .5) * .17, 1.0, lz + ((k >> 1) - .5) * .13, .13, .06, .1, food, rr() * .5); };
    const grill = (lx, w) => { s.B(lx, .99, .55, w, .14, .42, '#2a2a2c'); s.lit(lx, 1.07, .55, w - .1, .03, .34, '#ff7a2a'); const [x, z] = s.W(lx, .55); GRILLS.push([x, z]); };
    const wok = lx => { s.put(L.cyl, lx, 1.0, .55, .32, .14, .32, '#2f2f33'); s.put(L.cyl, lx, .97, .55, .26, .03, .26, '#e8b24a'); s.put(L.cyl, lx - .9 * 0, .35, -.75, .14, .35, .14, '#d0302a'); const [x, z] = s.W(lx, .55); GRILLS.push([x, z]); };
    const griddle = lx => { s.put(L.cyl, lx, .97, .55, .36, .04, .36, '#38383c'); s.put(L.cyl, lx, .35, -.75, .14, .35, .14, '#d0302a'); };
    switch (type){
      case 'satay': case 'sotong':
        grill(-.5, 1.7);
        for (let k = 0; k < 12; k++) s.B(-1.2 + k * .13, 1.1, .55, .03, .03, .5, type === 'satay' ? '#8a4a1e' : '#c8553a');
        tray(.95, .45, '#d8d2c8', type === 'satay' ? '#a65a22' : '#e07050', 6); tray(.95, .9, '#d8d2c8', '#f2e2b0', 4); break;
      case 'ayam': case 'pisang':
        wok(-.9); tray(.1, .6, '#c8c4bc', type === 'ayam' ? '#c9822e' : '#e0a83a', 6); tray(.75, .6, '#c8c4bc', '#d99a40', 6); tray(.4, 1.0, '#c8c4bc', '#b8712a', 4); break;
      case 'apam': case 'ramly':
        griddle(-.9); griddle(.1);
        tray(1.0, .6, '#d8d2c8', type === 'apam' ? '#f2c84a' : '#c98a4a', 6); break;
      case 'nasi':
        for (let k = 0; k < 18; k++) s.B(-1.3 + (k % 6) * .5, .99 + Math.floor(k / 6) * .1, .4 + (k % 3) * .25, .18, .1, .16, k % 4 ? '#3f8a3a' : '#f2efe6', rr() * .4);
        break;
      case 'cendol': case 'teh':
        s.put(L.cyl, -.9, 1.15, .5, .28, .4, .28, type === 'teh' ? '#c8c8cc' : '#5aa04a'); s.put(L.cyl, -.3, 1.15, .5, .28, .4, .28, '#c8c8cc');
        for (let k = 0; k < 10; k++) s.put(L.cyl, .35 + (k % 5) * .2, 1.0, .5 + Math.floor(k / 5) * .25, .055, .09, .055, type === 'teh' ? '#c98a4a' : '#6ab04a');
        break;
      case 'tebu':
        s.B(-.9, 1.15, .5, .5, .5, .45, '#3f8a5a');
        for (let k = 0; k < 9; k++) s.B(1.45 + (k % 3) * .07, 1.0, -.3 + Math.floor(k / 3) * .09, .05, 2.0, .05, '#7a8a3a', 0);
        for (let k = 0; k < 10; k++) s.put(L.cyl, -.1 + (k % 5) * .2, 1.0, .5 + Math.floor(k / 5) * .25, .055, .09, .055, '#c8d86a');
        break;
      case 'kelapa':
        pile(s, 'kelapa', -.6, .6, 4, 3); s.put(L.ball, .8, 1.06, .6, .15, .13, .15, '#f2efe6'); pile(s, 'kelapa', 1.0, .55, 2, 2);
        for (let k = 0; k < 6; k++) s.put(L.ball, -1.2 + k * .5, .15, 1.45, .15, .15, .15, '#5f8f2e', rr());
        break;
      case 'tembikai': case 'mangga': case 'rambutan': case 'manggis': case 'nanas': {
        pile(s, type, -.8, .6, type === 'tembikai' ? 3 : 5, type === 'tembikai' ? 2 : 4);
        const other = FRUIT.filter(k => k !== type && k !== 'tembikai'); pile(s, pick(other), .25, .6, 3, 3); pile(s, pick(other), 1.1, .6, 3, 2);
        if (type === 'tembikai') for (let k = 0; k < 3; k++) s.B(.1 + k * .3, 1.0, 1.05, .22, .14, .08, '#e0403a');
        for (let k = 0; k < 2; k++) s.B(-.9 + k * 1.6, .2, 1.4, .5, .35, .38, '#c0262d');    /* crates on the ground */
        break; }
      case 'durian': case 'd24': {
        const mk = type === 'durian', col = mk ? ['#6b6a2a', '#76702e', '#5f6326'] : ['#857a34', '#8f8238'];
        for (let layer = 0; layer < 2; layer++) for (let a = 0; a < 5 - layer; a++) for (let b = 0; b < 2; b++)
          s.put(L.dur, -1.3 + (a + layer * .5) * .4, 1.12 + layer * .28, .45 + b * .42, .16, .19, .16, pick(col), rr() * PI);
        /* one opened on the front of the table: a split shell and yellow pods */
        s.put(L.dur, .9, 1.04, .9, .17, .1, .17, '#6b6a2a', 0); for (let k = 0; k < 4; k++) s.put(L.pod, .9 + Math.cos(k * 1.57) * .08, 1.16, .9 + Math.sin(k * 1.57) * .08, .05, .04, .08, '#f2c230', k * 1.57);
        /* baskets on the ground in front */
        for (const bx of [-.9, .6]){ s.B(bx, .14, 1.55, .7, .28, .5, '#9a6a3a'); for (let k = 0; k < 4; k++) s.put(L.dur, bx + (k % 2 - .5) * .3, .36, 1.55 + ((k >> 1) - .5) * .22, .15, .17, .15, pick(col), rr() * PI); }
        break; }
      case 'baju': case 'mainan':
        s.B(0, 2.0, -.95, 3.2, .04, .04, '#c8c8cc');
        for (let k = 0; k < 9; k++) s.B(-1.4 + k * .35, 1.6, -.95, .3, .55, .05, pick(CLOTH));
        for (let k = 0; k < 10; k++) s.B(-1.3 + (k % 5) * .6, 1.0, .4 + Math.floor(k / 5) * .4, .4, .1, .3, pick(CLOTH), rr() * .3);
        break;
    }
  }
  /* the stalls, row by row */
  const runs = [];          /* collider runs: [x0, x1, z] */
  ROWS.forEach((r, ri) => SEGS.forEach(([a, b], si) => {
    const n = Math.round((b - a) / SW);
    let runA = a;
    for (let i = 0; i < n; i++){
      const cx = a + (i + .5) * SW, type = typeAt(ri, si, i, n), s = stall(cx, r.z, r.f);
      const gap = si === 0 && (i === 11 || i === 22) && ri % 2 === 0;   /* a walk-through between stalls every so often */
      if (gap){ runs.push([runA, cx - SW / 2, r.z]); runA = cx + SW / 2; continue; }
      const can = type === 'durian' || type === 'd24' ? '#2d8a6e' : CANOPY[(i * 7 + ri * 3 + si) % CANOPY.length];
      /* table, cloth skirt, canopy in six stripes (sloping down toward the aisle), a flap along the front */
      s.B(0, .9, .55, SW - .3, .06, 1.05, '#d8d2c8'); s.B(0, .46, 1.06, SW - .3, .82, .03, pick(CLOTH));
      for (let k = 0; k < 6; k++) s.put(L.box, -SW / 2 + .3 + k * .6, 2.5, .2, .6, .05, 3.0, k % 2 ? '#f4f1ea' : can, 0, -.06);
      s.B(0, 2.3, 1.72, SW, .26, .04, can);
      s.B(0, .25, -.95, .55, .45, .4, pick(['#2d5d8a', '#d0302a', '#f2efe6']));       /* a cool box behind */
      s.lit(0, 2.28, .9, 1.1, .05, .05, '#fff4d6');                                 /* the stall's own tube light */
      goods(s, type);
      /* the price board hanging off the front flap */
      const [sx, sz] = s.W((rr() - .5) * 1.4, 1.74);
      signQ.push([sx, 1.6, sz, r.f > 0 ? 0 : PI, SIGN_OF[type], (rr() - .5) * .12]);
      /* the stall keeper (not every stall: some are round the back) */
      if (rr() < .72){ const [kx, kz] = s.W((rr() - .5) * 1.8, -.45); keepers.push([kx, kz, r.f > 0 ? 0 : PI, type]); }
      if (rr() < .3){ const [kx, kz] = s.W((rr() - .5) * 2.4, 2.05 + rr() * .4); keepers.push([kx, kz, (r.f > 0 ? PI : 0) + (rr() - .5) * .6, 'buyer']); }   /* a customer at the table */
      if (type === 'durian' && ri === 3 && i === n - 3) SPOT.durian = [cx, r.z, r.f];
      if (type === 'durian' && ri === 3 && !SPOT.dur0) SPOT.dur0 = cx;
    }
    runs.push([runA, b, r.z]);
    /* posts shared by neighbouring stalls, front and back */
    for (let i = 0; i <= n; i++){
      const x = a + i * SW;
      for (const lz of [-1.3, 1.7]) L.box.push([x, 1.25, r.z + lz * r.f, .06, 2.5, .06, '#d8d4cc', 0, 0]);
    }
    /* light-bulb string along the front, sagging between posts */
    const zf = r.z + 1.78 * r.f; let prev = null;
    for (let x = a; x <= b + .01; x += .6){
      const t = ((x - a) % SW) / SW, y = 2.18 - Math.sin(PI * t) * .2;
      glow.push(geoTint(new THREE.OctahedronGeometry(.05, 0).translate(x, y - .06, zf), ['#ffd98a', '#ffe9b8', '#ffd98a', '#ff9a80', '#bfe3ff', '#d6ffb0'][(Math.round(x / .6)) % 6]));
      if (prev) wires.push(prev[0], prev[1], zf, x, y, zf); prev = [x, y];
    }
  }));
  /* strings across the aisles, every third stall */
  for (const az of AISLE) for (const [a, b] of SEGS) for (let x = a + SW * 1.5; x < b; x += SW * 3){
    const z0 = az - 3.2, z1 = az + 3.2; let prev = null;
    for (let k = 0; k <= 10; k++){
      const z = z0 + (z1 - z0) * k / 10, y = 2.75 - Math.sin(PI * k / 10) * .35;
      if (k && k < 10) glow.push(geoTint(new THREE.OctahedronGeometry(.055, 0).translate(x, y - .07, z), ['#ffd98a', '#ff8a80', '#8ad0ff', '#c8ff9a', '#ffe08a'][(k + Math.round(x)) % 5]));
      if (prev) wires.push(x, prev, z - (z1 - z0) / 10, x, y, z); prev = y;
    }
  }
  /* warm light on the ground along the aisles and round the grills */
  for (const az of AISLE) for (const [a, b] of SEGS) pools.push(new THREE.PlaneGeometry(b - a, 7.5).rotateX(-PI / 2).translate((a + b) / 2, .07, az));
  for (const [x, z] of GRILLS) pools.push(new THREE.CircleGeometry(2.4, 12).rotateX(-PI / 2).translate(x, .08, z));

  /* the vendors' vans and lorries parked in the service lane between the two aisles */
  const vans = [];
  for (let x = 312, k = 0; x < 505; x += 13 + rr() * 9, k++){
    if (Math.abs(x - PM.lane) < 8) continue;
    const col = pick(['#f2efe6', '#c8ccd0', '#2d5d8a', '#c0392b', '#e8e4da']), z = 543 + (k % 2 ? 2.2 : -2.2), lorry = k % 3 === 1;
    tbox(vans, lorry ? 2.2 : 1.9, lorry ? 2.4 : 1.9, lorry ? 5.6 : 4.4, x, lorry ? 1.6 : 1.3, z, col);
    tbox(vans, lorry ? 2.1 : 1.8, .5, 1.2, x, .55, z + (lorry ? 3.2 : 2.6) * (k % 2 ? 1 : -1), '#2a2c30');
    for (const w of [-1, 1]) for (const e of [-1, 1]) tbox(vans, .25, .6, .6, x + w * (lorry ? 1.05 : .9), .3, z + e * 1.5, '#1d1d1f');
  }

  /* ---------- turn the lists into meshes; everything that only appears when the market is open goes in openG ---------- */
  const openG = new THREE.Group(), dayG = new THREE.Group();
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function inst(geo, list, mat, shadow){
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, sx, sy, sz, col, ry, rx], i) => {
      _q.setFromEuler(_e.set(rx || 0, ry || 0, 0, 'YXZ')); _m4.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); im.setMatrixAt(i, _m4); im.setColorAt(i, _c.set(col));
    });
    geo.boundingSphere = BOUND.clone(); im.castShadow = !!shadow && !TOUCH; im.receiveShadow = false; openG.add(im); return im;
  }
  /* a durian: an icosahedron with a spike on every face */
  const durGeo = (() => {
    const ico = new THREE.IcosahedronGeometry(1, typeof XQ !== 'undefined' && XQ.level === 'high' ? 1 : 0),   /* 240 or 60 triangles */ P = ico.attributes.position, pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3){
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2); m.copy(a).add(b).add(c).divideScalar(3).normalize().multiplyScalar(1.32);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) pos.push(u.x, u.y, u.z, v.x, v.y, v.z, m.x, m.y, m.z);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  })();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10), ballGeo = new THREE.SphereGeometry(1, 6, 4), podGeo = new THREE.SphereGeometry(1, 7, 5);
  const IM = {
    box:inst(boxGeo, L.box, pmMat({}), true), cyl:inst(cylGeo, L.cyl, pmMat({})), ball:inst(ballGeo, L.ball, pmMat({})),
    dur:inst(durGeo, L.dur, pmMat({})), pod:inst(podGeo, L.pod, pmMat({}))
  };
  /* bulbs, grill coals, tube lights: one unlit mesh; the wires: one line set */
  openG.add(new THREE.Mesh(geoMerge(glow), new THREE.MeshBasicMaterial({vertexColors:true})));
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); openG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:'#2a2a2a'}))); }
  const poolMat = new THREE.MeshBasicMaterial({color:'#ffb060', transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, polygonOffset:true, polygonOffsetFactor:-14, polygonOffsetUnits:-56});
  openG.add(new THREE.Mesh(geoMerge(pools), poolMat));
  openG.add(new THREE.Mesh(geoMerge(vans), pmMat({vertexColors:true})));
  /* the price boards: quads with UVs into the atlas */
  {
    const p = [], uv = [], n = [];
    for (const [x, y, z, ry, si, tilt] of signQ){
      const u0 = (si % 4) / 4, v1 = 1 - Math.floor(si / 4) / 5, u1 = u0 + .25, v0 = v1 - .2, w = .46, h = .23, c = Math.cos(ry), s = Math.sin(ry), ct = Math.cos(tilt), st = Math.sin(tilt);
      const corner = (dx, dy) => { const rx = dx * ct - dy * st, ry2 = dx * st + dy * ct; return [x + rx * c, y + ry2, z - rx * s]; };
      const A = corner(-w, -h), B = corner(w, -h), C = corner(w, h), D = corner(-w, h), nz = c, nx = s;
      for (const [P, U] of [[A, [u0, v0]], [B, [u1, v0]], [C, [u1, v1]], [A, [u0, v0]], [C, [u1, v1]], [D, [u0, v1]]]){ p.push(...P); uv.push(...U); n.push(nx, 0, nz); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    openG.add(new THREE.Mesh(g, pmMat({map:atlasTex, side:THREE.DoubleSide})));
  }
  /* the Musang King banner over the durian stalls */
  const mkBanner = opSign(10, 1.6, 640, 102, (g, w, h) => {
    g.fillStyle = '#1f5a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.fillRect(0, h - 10, w, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe9a8'; g.font = `900 52px ${OUT_FONT}`; g.fillText('猫山王 MUSANG KING · RM 68/kg', w / 2, h / 2 - 2, w - 24);
  }, {emissive:'#ffffff', emissiveIntensity:0});
  mkBanner.material.emissiveMap = mkBanner.material.map; scene.remove(mkBanner); openG.add(mkBanner);
  if (SPOT.durian){ const [x, z, f] = SPOT.durian; mkBanner.position.set(x, 3.55, z + 1.1 * f); mkBanner.rotation.y = f > 0 ? 0 : PI; }

  /* ---------- the people: keepers stand still behind their tables, shoppers stroll the aisles (one InstancedMesh per body part) ---------- */
  const NW = typeof XQ !== 'undefined' && XQ.pick ? XQ.pick(40, 64, 90) : TOUCH ? 44 : 80, NK = keepers.length, NP = NK + NW;
  const walkers = [];
  const crowd = (() => {
    if (typeof npcBodyGeo === 'undefined') return null;
    const mk = (geo, k, vc) => { const g = geo.clone(); g.boundingSphere = BOUND.clone(); const im = new THREE.InstancedMesh(g, pmMat({vertexColors:!!vc}), k); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); openG.add(im); return im; };
    const C = {body:mk(npcBodyGeo, NP), head:mk(npcHeadGeo, NP), gear:mk(npcGearGeo, NP, true), leg:mk(npcLegGeo, NP * 2, true), sleeve:mk(npcSleeveGeo, NP * 2), fore:mk(npcForeGeo, NP * 2)};
    for (let i = 0; i < NP; i++){
      const keeper = i < NK && keepers[i][3] !== 'buyer', sh = keeper ? pick(['#ecf0f1', '#f2efe6', '#c0392b', '#2d5d8a', '#34495e']) : pick(SHIRTS), sk = pick(SKIN), pa = pick(PANTS);
      C.body.setColorAt(i, _c.set(sh)); C.head.setColorAt(i, _c.set(sk));
      for (const s of [0, 1]){ C.sleeve.setColorAt(i * 2 + s, _c.set(sh)); C.fore.setColorAt(i * 2 + s, _c.set(sk)); C.leg.setColorAt(i * 2 + s, _c.set(pa)); }
    }
    return C;
  })();
  function placePerson(i, x, z, h, swing, hop){
    _p.set(x, hop || 0, z); _q.setFromAxisAngle(UP, h); _s.setScalar(1); _nb.compose(_p, _q, _s);
    const C = crowd; C.body.setMatrixAt(i, _nb); C.head.setMatrixAt(i, _nb); C.gear.setMatrixAt(i, _nb);
    for (const s of [-1, 1]){
      const j = i * 2 + (s > 0 ? 1 : 0); C.leg.setMatrixAt(j, npcLimb(s * .09, .92, 0, swing * s));
      const m = npcLimb(s * .215, 1.39, s * .1, -swing * s * .8); C.sleeve.setMatrixAt(j, m); C.fore.setMatrixAt(j, m);
    }
  }
  if (crowd){
    keepers.forEach(([x, z, h], i) => placePerson(i, x, z, h + (rr() - .5) * .5, 0, 0));
    /* shoppers: most walk an aisle end to end and stop at stalls; a few walk the cross gap and the lane in */
    for (let k = 0; k < NW; k++){
      const cross = k % 6 === 5, ai = k % 2;
      walkers.push(cross ? {cross:true, x:PM.lane + (rr() - .5) * 8, z:PM.z0 + rr() * (PM.z1 - PM.z0), dir:rr() < .5 ? 1 : -1, sp:.9 + rr() * .5, wait:0, walk:rr() * 6, ox:0, dodge:0, h:0, th:0}
        : {cross:false, ai, lane:AISLE[ai] + (rr() - .5) * 3.4, x:SEGS[0][0] + rr() * (SEGS[1][1] - SEGS[0][0]), dir:rr() < .5 ? 1 : -1, sp:.7 + rr() * .6, wait:rr() * 3, walk:rr() * 6, ox:0, dodge:0, h:0, th:rr() < .5 ? 0 : PI});
    }
  }
  function updateCrowd(dt){
    if (!crowd) return;
    const car = mode === 'naiwa' ? driving : null, csp = car ? Math.hypot(car.vx, car.vz) : 0;
    walkers.forEach((w, k) => {
      let swing = 0;
      if (w.wait > 0){ w.wait -= dt; w.h += (w.th - w.h) * Math.min(1, dt * 4); }
      else {
        if (w.cross){
          w.z += w.dir * w.sp * dt; if (w.z > PM.z1 + 2 || w.z < 470){ w.dir = -w.dir; w.wait = 1 + rr() * 2; w.th = w.dir > 0 ? 0 : PI; }
          w.h = w.dir > 0 ? 0 : PI;
        } else {
          w.x += w.dir * w.sp * dt;
          if (w.x > SEGS[1][1] + 3 || w.x < SEGS[0][0] - 3){ w.dir = -w.dir; w.x = Math.max(SEGS[0][0] - 3, Math.min(SEGS[1][1] + 3, w.x)); }
          w.h = w.dir > 0 ? PI / 2 : -PI / 2;
          if (rr() < dt * .12){ w.wait = 1.5 + rr() * 3.5; w.th = rr() < .5 ? 0 : PI; }   /* stop and look at a stall */
        }
        if (!REDUCED){ w.walk += dt * w.sp * 4.6; swing = Math.sin(w.walk) * .5; }
      }
      let x = w.cross ? w.x : w.x, z = w.cross ? w.z : w.lane;
      /* step out of the way of a car */
      if (w.dodge > 0){ w.dodge -= dt; w.ox += w.dv * dt; } else w.ox *= Math.exp(-dt * .6);
      if (car && csp > 3 && w.dodge <= 0){
        const rx = x - car.x, rz = z - car.z, ux = car.vx / csp, uz = car.vz / csp, along = rx * ux + rz * uz, lat = rx * uz - rz * ux;
        if (along > 0 && along < 8 + csp * .25 && Math.abs(lat) < car.T.W / 2 + 1.4){ w.dodge = .45; w.dv = (lat >= 0 ? 1 : -1) * 7; spawnPart('excl', x, 2.6, z, .8, {vy:1.5, life:.8, op:1, color:'#e74c3c'}); }
      }
      if (w.cross) x += w.ox; else z += w.ox;
      const hop = w.dodge > 0 ? Math.sin(PI * Math.max(0, w.dodge) / .45) * .8 : Math.abs(Math.cos(w.walk)) * .045 * (swing ? 1 : 0);
      placePerson(NK + k, x, z, w.h, swing, hop);
    });
    for (const key in crowd) crowd[key].instanceMatrix.needsUpdate = true;
  }

  /* ---------- by day: an empty lot, the tents folded and stacked, a lorry waiting ---------- */
  {
    const st = [];
    for (let k = 0; k < 6; k++){ const x = 318 + k * 34, z = 543; for (let j = 0; j < 4; j++) tbox(st, 3.4, .14, .5, x, .1 + j * .15, z + (j % 2) * .2, j % 2 ? '#f4f1ea' : CANOPY[(k + j) % CANOPY.length]); tbox(st, 3.3, .3, .3, x, .08, z + 1.2, '#c8c4bc'); }
    tbox(st, 2.2, 2.4, 5.6, 470, 1.6, 543, '#f2efe6'); tbox(st, 2.1, .5, 1.2, 470, .55, 546.4, '#2a2c30');
    for (const w of [-1, 1]) for (const e of [-1, 1]) tbox(st, .25, .6, .6, 470 + w * 1.05, .3, 543 + e * 1.8, '#1d1d1f');
    const m = new THREE.Mesh(geoMerge(st), M('#ffffff', {vertexColors:true, roughness:.85})); m.castShadow = !TOUCH; dayG.add(m);
  }
  /* the arch over the way in (always there) */
  const arch = opSign(14, 1.9, 896, 122, (g, w, h) => {
    g.fillStyle = '#7a1420'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd98a'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd98a'; g.font = `900 50px ${OUT_FONT}`; g.fillText('PASAR MALAM KOTA WARISAN', w / 2, 44, w - 30);
    g.font = `700 28px ${OUT_FONT}`; g.fillStyle = '#ffe9c8'; g.fillText('Kota Warisan 夜市 · 每周六 4pm–11pm · 游戏里傍晚开市', w / 2, 92, w - 30);
  }, {emissive:'#ffffff', emissiveIntensity:0});
  arch.material.emissiveMap = arch.material.map; arch.position.set(PM.lane, 4.6, PM.z0 - 3.06); arch.rotation.y = PI;
  { const back = new THREE.Mesh(arch.geometry, arch.material); back.position.set(PM.lane, 4.6, PM.z0 - 2.94); scene.add(back); }   /* the same banner seen from inside the market */
  {
    const red = M('#a8202c', {roughness:.6}); box(.4, 5.6, .4, red, PM.lane - 7.2, 2.8, PM.z0 - 3); box(.4, 5.6, .4, red, PM.lane + 7.2, 2.8, PM.z0 - 3);
    addCircle(PM.lane - 7.2, PM.z0 - 3, .35); addCircle(PM.lane + 7.2, PM.z0 - 3, .35);
  }
  const nameLbl = addLabel('Kota Warisan 夜市', PM.cx, 9, PM.cz);
  /* colliders along each run of stalls (table + keeper), live only while the market is up */
  const cols = runs.filter(([a, b]) => b - a > 1).map(([a, b, z]) => { const c = addBox((a + b) / 2, z, (b - a) / 2, 1.45, 0); c.dead = true; return c; });
  openG.visible = false; openG.scale.y = .001; scene.add(openG, dayG);

  /* ---------- 猫山王挑战 ---------- */
  const DU_BUDGET = 150, DU_START = 68, DU_MEDAL = [118, 98, 78], DU_PAY = [40, 25, 12];
  const DU_CHECKS = [['bottom', '看底部'], ['stem', '看蒂头'], ['shake', '摇一摇'], ['smell', '闻一闻']];
  const DU = {g:null, near:false, S:null};
  if (SPOT.durian){ const [x, z, f] = SPOT.durian; DU.S = opSpot('#8fd14f', .45, x, z + 4.4 * f, '猫山王挑战 · 挑榴莲'); opHide(DU.S); }
  if (typeof TN_DROPS !== 'undefined') TN_DROPS.durian = {name:'猫山王挑战', day:6, g:[[['lacq', 1], ['neon', 1], ['nos', 1, .4]], [['lacq', 1], ['neon', 1, .5]], [['lacq', 1]], []]};
  const PM_ACH = [['pm_mk', '榴莲猎人', '猫山王挑战拿到金牌', 60], ['pm_cut', '砍价王', '一颗猫山王砍掉两成以上', 40], ['pm_fake', '火眼金睛', '识破冒充猫山王的 D24', 30]];
  if (typeof achAdd === 'function') achAdd(PM_ACH);
  if (typeof GX_MORE !== 'undefined') GX_MORE.push({id:'pm_du', name:'猫山王挑战', fmt:v => Math.round(v) + ' 分'});
  { const st = document.createElement('style'); st.textContent = `
.du-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.du-card{border:1px solid var(--line);border-radius:var(--r-md);background:var(--card-bg);padding:8px 9px;display:flex;flex-direction:column;gap:6px;min-width:0}
.du-card.sel{border-color:var(--tile);box-shadow:0 0 0 2px var(--tile-soft)}
.du-card h3{margin:0;font-family:var(--display);font-size:15px;display:flex;justify-content:space-between;gap:6px}
.du-card h3 small{font-family:inherit;font-weight:400;color:var(--muted);font-size:12px}
.du-chk{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.du-chk button,.du-act button{min-height:40px;border-radius:var(--r-sm,8px);border:1px solid var(--line);background:var(--chip);color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer;touch-action:manipulation;padding:2px}
.du-chk button[disabled]{opacity:.45;cursor:default}
.du-clue{font-size:12px;line-height:1.45;color:var(--muted);min-height:18px}
.du-clue p{margin:0}.du-clue .g{color:var(--ok)}.du-clue .b{color:#d9534f}
.du-buy{min-height:40px;border-radius:var(--r-sm,8px);border:1px solid var(--tile);background:var(--tile);color:var(--on-accent);font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation}
.du-top{display:flex;justify-content:space-between;gap:10px;font-size:13px;font-variant-numeric:tabular-nums;margin-top:6px}
.du-top b{font-family:var(--display);font-size:16px}
.du-say{margin:10px 0 0;padding:9px 11px;border-radius:var(--r-md);background:var(--chip);font-size:14px;line-height:1.5;min-height:44px}
.du-act{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.du-act button{min-height:52px;font-size:14px;font-weight:700}
.du-act button span{display:block;font-weight:400;font-size:12px;color:var(--muted)}
.du-act .du-buy{grid-column:1/-1}
@media (max-width: 480px){ .du-chk{grid-template-columns:repeat(2,1fr)} }
@media (pointer: coarse){ .du-card h3 kbd{display:none} }`; document.head.appendChild(st); }
  const rnd2 = () => Math.random();
  function duNew(){
    const fake = rnd2() < .7 ? (rnd2() * 4) | 0 : -1, ripe = ['生', '刚好', '刚好', '过熟'];
    const ds = [0, 1, 2, 3].map(i => {
      const r = i === fake ? pickR(['生', '刚好']) : ripe[(rnd2() * ripe.length) | 0], fresh = rnd2() < .6;
      let q = 55 + rnd2() * 25 + (fresh ? 12 : -6) + (r === '刚好' ? 15 : r === '生' ? -22 : -14);
      if (i === fake) q = 18 + rnd2() * 12;
      return {i, fake:i === fake, r, fresh, q:Math.max(5, Math.min(100, Math.round(q))), kg:Math.round((1.6 + rnd2() * .8) * 10) / 10, seen:{}};
    });
    if (!ds.some(d => !d.fake && d.r === '刚好')){ const d = ds.find(x => !x.fake); d.r = '刚好'; d.q = Math.max(d.q, 80); }
    return {phase:'pick', ds, sel:0, left:5, pick:null, per:DU_START, floor:52 + ((rnd2() * 7) | 0), pat:3, round:false, bluff:false, say:'', log:[]};
  }
  function pickR(a){ return a[(rnd2() * a.length) | 0]; }
  function clue(d, k){
    switch (k){
      case 'bottom': return d.fake ? ['b', '底部是个圆点，没有星纹……像是 D24'] : ['g', '底部有清楚的五角星纹，猫山王的记号'];
      case 'stem': return d.fresh ? ['g', '蒂头湿润带绿，今早刚掉下来的'] : ['b', '蒂头干黑，放了两三天了'];
      case 'shake': return d.r === '刚好' ? ['g', '轻轻一摇，里面闷闷地响，果肉离壳了'] : d.r === '生' ? ['b', '摇不出声音，还没熟透'] : ['b', '晃得厉害，里面可能太软了'];
      case 'smell': return d.r === '刚好' ? ['g', '浓浓的苦甜香味，正是时候'] : d.r === '生' ? ['b', '几乎闻不到味道'] : ['b', '带点酒味，熟过头了'];
    }
  }
  const SAY = {
    hi:['榴莲哥：猫山王今天刚到！慢慢挑，摸可以，别掰。', '榴莲哥：靓仔，猫山王要不要？包甜！'],
    ok:['榴莲哥：好啦好啦，算你便宜一点。', '榴莲哥：哎呀，老顾客嘛，给你！', '榴莲哥：行行行，就这个价。'],
    no:['榴莲哥：不行啦，猫山王成本都这么高！', '榴莲哥：这个价我亏本咯。', '榴莲哥：别砍啦，再砍我回家吃自己。'],
    mad:['榴莲哥：不砍了！要就要，不要拉倒。'],
    back:['榴莲哥：喂喂，回来回来！好啦再算你便宜。'],
    bye:['榴莲哥：好走不送～（你又回来了，只好照这个价买）']
  };
  const total = g => Math.round(g.per * g.pick.kg);
  function duRender(){
    const g = DU.g; if (!g) return;
    const body = document.getElementById('opBody'); if (!body) return;
    if (g.phase === 'pick'){
      body.innerHTML = `<p class="op-note">宿舍同学塞给你 RM ${DU_BUDGET}，要一颗<b>猫山王</b>。四颗里可能混着一颗冒充的 D24。只能检查 <b>${g.left}</b> 次了：看底部、看蒂头、摇一摇、闻一闻，挑好就点「就要这颗」。${TOUCH ? '' : '（1–4 选榴莲，Z X C V 检查，F 买）'}</p>
        <div class="du-grid">${g.ds.map((d, i) => `<div class="du-card${i === g.sel ? ' sel' : ''}" data-i="${i}"><h3><span>${'ABCD'[i]} 号 <small>${d.kg} kg</small></span><kbd>${i + 1}</kbd></h3>
          <div class="du-chk">${DU_CHECKS.map(([k, t]) => `<button type="button" data-k="${k}"${d.seen[k] || !g.left ? ' disabled' : ''}>${t}</button>`).join('')}</div>
          <div class="du-clue">${DU_CHECKS.filter(([k]) => d.seen[k]).map(([k]) => { const [c, t] = clue(d, k); return `<p class="${c}">${c === 'g' ? '✓' : '✗'} ${t}</p>`; }).join('') || '<p>还没检查</p>'}</div>
          <button type="button" class="du-buy" data-buy="${i}">就要这颗</button></div>`).join('')}</div>
        <p class="du-say">${g.say || pickR(SAY.hi)}</p>`;
      for (const c of body.querySelectorAll('.du-card')){
        const i = +c.dataset.i;
        c.addEventListener('pointerdown', () => { if (g.sel !== i){ g.sel = i; for (const x of body.querySelectorAll('.du-card')) x.classList.toggle('sel', +x.dataset.i === i); } });
        for (const b of c.querySelectorAll('[data-k]')) b.addEventListener('click', () => duCheck(i, b.dataset.k));
        c.querySelector('[data-buy]').addEventListener('click', () => duPick(i));
      }
      return;
    }
    if (g.phase === 'haggle'){
      const d = g.pick, t = total(g), hearts = '❤️'.repeat(g.pat) + '🤍'.repeat(3 - g.pat);
      body.innerHTML = `<div class="du-top"><span>${'ABCD'[d.i]} 号 · ${d.kg} kg</span><span>现价 <b>RM ${+g.per.toFixed(2)}/kg</b> · 共 <b>RM ${t}</b></span></div>
        <div class="du-top"><span>预算 RM ${DU_BUDGET}${t > DU_BUDGET ? ' · <b style="color:#d9534f">超预算了</b>' : ''}</span><span>耐心 ${hearts}</span></div>
        <p class="du-say">${g.say}</p>
        <div class="du-act">
          <button type="button" data-a="small"><kbd>1</kbd> 便宜点啦<span>每公斤砍 RM 3</span></button>
          <button type="button" data-a="big"><kbd>2</kbd> 隔壁才卖 55<span>每公斤砍 RM 8，他会不耐烦</span></button>
          <button type="button" data-a="round"${g.round ? ' disabled' : ''}><kbd>3</kbd> 抹个零嘛<span>总价抹到整十</span></button>
          <button type="button" data-a="walk"${g.bluff ? ' disabled' : ''}><kbd>4</kbd> 假装走人<span>只能来一次</span></button>
          <button type="button" class="du-buy" data-a="deal"><kbd>F</kbd> 成交 RM ${t}</button>
        </div>`;
      for (const b of body.querySelectorAll('[data-a]')) b.addEventListener('click', () => duHaggle(b.dataset.a));
    }
  }
  function duOpen(){
    if (DU.g) return;
    DU.g = duNew(); DU.t0 = performance.now(); sfx.ding();
    opOpen('🌵 猫山王挑战', '', code => {
      const g = DU.g; if (!g || performance.now() - DU.t0 < 300) return;   /* the F that opened the panel must not also buy */
      if (g.phase === 'pick'){
        const n = {Digit1:0, Digit2:1, Digit3:2, Digit4:3, Numpad1:0, Numpad2:1, Numpad3:2, Numpad4:3}[code];
        if (n != null){ g.sel = n; duRender(); return; }
        const k = {KeyZ:'bottom', KeyX:'stem', KeyC:'shake', KeyV:'smell'}[code]; if (k){ duCheck(g.sel, k); return; }
        if (code === 'KeyF' || code === 'Enter') duPick(g.sel);
      } else if (g.phase === 'haggle'){
        const a = {Digit1:'small', Digit2:'big', Digit3:'round', Digit4:'walk', Numpad1:'small', Numpad2:'big', Numpad3:'round', Numpad4:'walk', KeyF:'deal', Enter:'deal'}[code];
        if (a) duHaggle(a);
      }
    }, () => { DU.g = null; if (DU.S) DU.S.rearm = true; toast('没买', '榴莲哥：下次再来啊～', 1800); });
    duRender();
  }
  function duCheck(i, k){
    const g = DU.g; if (!g || g.phase !== 'pick' || !g.left) return;
    const d = g.ds[i]; if (d.seen[k]) return;
    d.seen[k] = true; g.left--; g.sel = i;
    const [c] = clue(d, k); if (c === 'g') sfx.ding(); else gxBeep(260, .14); if (k === 'shake') tone('sine', 140, 90, .18, .12);
    g.say = g.left ? `还能检查 ${g.left} 次。` : '检查次数用完了，挑一颗吧。';
    duRender();
  }
  function duPick(i){
    const g = DU.g; if (!g || g.phase !== 'pick') return;
    g.pick = g.ds[i]; g.phase = 'haggle';
    g.say = `榴莲哥：${'ABCD'[i]} 号啊，好眼光！${g.pick.kg} 公斤，RM ${DU_START} 一公斤，算你 RM ${total(g)}。`;
    sfx.ding(); duRender();
  }
  function duHaggle(a){
    const g = DU.g; if (!g || g.phase !== 'haggle') return;
    if (a === 'deal'){ duEnd(); return; }
    let ok = false;
    if (a === 'small'){ ok = g.per - 3 >= g.floor; if (ok) g.per -= 3; else g.pat--; }
    else if (a === 'big'){ ok = g.per - 8 >= g.floor && g.pat >= 2; if (ok) g.per -= 8; g.pat--; }
    else if (a === 'round'){
      if (g.round) return; g.round = true;
      const t = Math.floor(total(g) / 10) * 10, per = t / g.pick.kg; ok = per >= g.floor - 2;
      if (ok) g.per = Math.round(per * 100) / 100; else g.pat--;
    } else if (a === 'walk'){
      if (g.bluff) return; g.bluff = true;
      if (g.pat >= 2 && rnd2() < .75){ g.per = Math.max(g.floor, g.per - 5); g.pat--; g.say = pickR(SAY.back); sfx.ding(); duRender(); return; }
      g.say = pickR(SAY.bye); g.pat = 0; duRender(); setTimeout(() => { if (DU.g === g) duEnd(); }, 1400); return;
    }
    if (g.pat <= 0){ g.pat = 0; g.say = SAY.mad[0] + `（RM ${total(g)}）`; gxBeep(220, .2); duRender(); setTimeout(() => { if (DU.g === g) duEnd(); }, 1500); return; }
    g.say = ok ? pickR(SAY.ok) : pickR(SAY.no); if (ok) sfx.ding(); else gxBeep(260, .14); duRender();
  }
  function duEnd(){
    const g = DU.g; if (!g || g.phase === 'done') return;
    g.phase = 'done'; DU.g = null; if (DU.S) DU.S.rearm = true; opClose(true);
    const d = g.pick, t = total(g), save = 1 - t / (DU_START * d.kg), best = Math.max(...g.ds.filter(x => !x.fake).map(x => x.q));
    const pts = Math.round(d.q + Math.max(0, save) * 160 + (d.q >= best ? 8 : 0));
    let medal = 3; for (let i = 0; i < 3; i++) if (pts >= DU_MEDAL[i]){ medal = i; break; }
    if (d.fake) medal = 3;
    const change = DU_BUDGET - t, pay = Math.max(0, change) + (medal < 3 ? DU_PAY[medal] : 0);
    const prev = prog.best.pm_du, rec = prev == null || pts > prev; if (rec) prog.best.pm_du = pts;
    if (typeof sess !== 'undefined'){ sess.acts++; if (medal < 3) sess.medals++; }
    if (pay) earn(pay); saveGame();
    const loot = window.XParts && medal < 3 ? XParts.reward('durian', medal, '猫山王挑战' + GX_MEDAL[medal]) : [];
    const verdict = d.fake ? '开出来是 D24！被当猫山王卖了' : d.r === '刚好' ? (d.q >= 85 ? '金黄饱满，苦甜带酒香，一流的猫山王' : '熟得刚好，好吃') : d.r === '生' ? '还没熟透，有点硬' : '熟过头了，有点水';
    toast(medal < 3 ? `${GX_MEDAL[medal]} · 猫山王挑战` : '猫山王挑战', `${verdict} · RM ${t}（砍了 ${Math.round(Math.max(0, save) * 100)}%）· ${pts} 分${rec && prev != null ? ' · 新纪录！' : ''}` +
      ` · ${change >= 0 ? '找回零钱' : '自己贴了 RM ' + -change}${pay ? ' +RM ' + pay : ''}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 4200);
    if (medal < 3){ gxCallout(GX_MEDAL[medal], pts + ' 分', OP_MEDAL_C[medal]); opFanfare(); } else if (d.fake) sfx.fail(); else sfx.ding();
    for (let k = 0; k < 8; k++) spawnPart('dust', nw.x + (Math.random() - .5) * 2, 1.4 + Math.random(), nw.z + (Math.random() - .5) * 2, .6, {vy:1.4, life:1.4, op:.9, grow:1, color:'#f2c230'});
    if (medal === 0){ unlock('pm_mk'); unlock('gold'); }
    if (save >= .2) unlock('pm_cut');
    if (!d.fake && Object.values(g.ds).some(x => x.fake && x.seen.bottom)) unlock('pm_fake');
  }

  /* ---------- open at dusk and at night; the per-frame part runs from the outskirts update (every mode) ---------- */
  const PMS = {k:0, msg:'', smoke:0};
  const isOpen = () => tgt === P3.night || tgt === P3.dusk;
  function frame(dt){
    const cp = camera.position, near = Math.abs(cp.x - PM.cx) < 700 && Math.abs(cp.z - PM.cz) < 700;
    const want = isOpen() && near ? 1 : 0;
    if (PMS.k !== want){
      PMS.k = Math.abs(want - PMS.k) < .02 ? want : PMS.k + (want - PMS.k) * Math.min(1, dt * 3.6);
      openG.visible = PMS.k > .01; openG.scale.y = Math.max(.001, PMS.k);
      for (const c of cols) c.dead = PMS.k < .5;
    }
    dayG.visible = near && PMS.k < .5 && !isOpen();
    const night = tgt === P3.night;
    pmGlow.value = PMS.k * (night ? .36 : .12);
    poolMat.opacity = PMS.k * (night ? .2 : .06);
    mkBanner.material.emissiveIntensity = arch.material.emissiveIntensity = typeof cur !== 'undefined' ? Math.min(1, cur.lamp) * .9 : 0;
    const nm = PMS.k > .5 ? 'Kota Warisan 夜市' : 'Kota Warisan 夜市（傍晚开市）'; if (PMS.name !== nm){ PMS.name = nm; nameLbl.el.textContent = nm; }
    if (PMS.k < .9 || !openG.visible) return;
    const dd = Math.hypot(cp.x - PM.cx, cp.z - PM.cz), close = dd < 260;   /* fruit, durians, pots: a few pixels each from further away */
    if (IM.ball.visible !== close) IM.ball.visible = IM.dur.visible = IM.pod.visible = IM.cyl.visible = close;
    if (dd < 320) updateCrowd(Math.min(dt, .1));
    /* smoke off the grills nearest the camera */
    if (dd < 160 && !REDUCED){
      PMS.smoke += dt * 6;
      while (PMS.smoke > 1){
        PMS.smoke--;
        const [x, z] = GRILLS[(Math.random() * GRILLS.length) | 0]; if (Math.hypot(x - cp.x, z - cp.z) > 90) continue;
        spawnPart('dust', x + (Math.random() - .5) * .8, 1.4, z + (Math.random() - .5) * .3, .9, {grow:2.4, vx:.3 + Math.random() * .3, vy:1 + Math.random() * .5, vz:(Math.random() - .5) * .3, life:2.6, op:.32, color:night ? '#9a9088' : '#d8d4cc'});
      }
    }
  }
  if (typeof updateOutskirts === 'function'){ const base = updateOutskirts; updateOutskirts = function(dt, T){ base(dt, T); frame(dt); }; }

  /* ---------- the durian ring, the F key, prompt, minimap ---------- */
  function update(px, pz){
    PMS.msg = '';
    const was = DU.near; DU.near = false;
    if (!DU.S) return;
    const other = mission.on || !!gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in) || gx.busy();
    if (opRing(DU.S, PMS.k > .9 && !other && !DU.g && Math.abs(px - DU.S.x) < 300 && Math.abs(pz - DU.S.z) < 300, px, pz)){
      if (driving) PMS.msg = '下车走进绿圈，挑一颗猫山王';
      else if (nw.state !== 'fly'){ DU.near = true; PMS.msg = TOUCH ? '点「挑榴莲」开始猫山王挑战' : '按 F 开始猫山王挑战'; opSetF('挑榴莲'); }
    }
    if (was && !DU.near && opFBtn === '挑榴莲') opSetF('');
  }
  if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ if (DU.near && !driving && nw.state !== 'fly' && !opUI.on){ duOpen(); return true; } return base(); }; }
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); update(px, pz); },
      prompt(){ return PMS.msg || base.prompt(); },
      mini(dot){ base.mini(dot); if (DU.S && PMS.k > .9 && !gx.busy() && !mission.on) dot(DU.S.x, DU.S.z, '#8fd14f', 6); },
      leave(){ if (DU.S){ opHide(DU.S); DU.S.rearm = false; } DU.near = false; DU.g = null; base.leave(); }
    });
  }
  if (typeof drawOutMini === 'function'){
    const miniBase = drawOutMini;
    drawOutMini = function(mg, X, Z, k){
      miniBase(mg, X, Z, k);
      const rect = (x0, z0, x1, z1) => mg.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
      mg.fillStyle = '#9d988f'; rect(PM.x0, PM.z0, PM.x1, PM.z1);
      mg.fillStyle = '#cfcac0'; rect(PM.lane - 3, 365, PM.lane + 3, PM.z0);
      mg.fillStyle = PMS.k > .5 ? '#d9534f' : '#bdb7ab';
      for (const r of ROWS) for (const [a, b] of SEGS) rect(a, r.z - 1.3, b, r.z + 1.3);
      const lx = X(PM.cx), lz = Z(PM.z1 + 14);   /* the big map (js/ui-guide.js) writes the 3D label as the name itself */
      if (typeof mini !== 'undefined' && mg.canvas === mini && lx > -60 && lx < mg.canvas.width + 60 && lz > -10 && lz < mg.canvas.height + 10){
        mg.font = '700 13px sans-serif'; mg.textAlign = 'center'; mg.lineWidth = 3; mg.strokeStyle = 'rgba(31,42,51,.85)'; mg.strokeText('夜市', lx, lz); mg.fillStyle = '#ffffff'; mg.fillText('夜市', lx, lz); mg.textAlign = 'start';
      }
    };
  }
  window.XPasar = {openG, dayG, PM, PM_PAD, ROWS, SEGS, AISLE, SPOT, DU, PMS, IM, crowd, walkers, open:duOpen, check:duCheck, pick:duPick, haggle:duHaggle, stalls:() => signQ.length, grills:GRILLS.length};
})();
