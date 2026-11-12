/* XMUM 校园漫游 · IOI City Mall（地图东北角）和 SUKI-YA 寿喜烧 · 涮涮锅放题
 *
 * 真实的地方：IOI City Mall 在 Putrajaya 边上（行政上属雪邦县），2014 年开业，二期 2022 年开，现在是马来西亚最大的商场。
 *   正门（照 Wikimedia Commons 上 2022 年的照片 IOI_City_Mall.jpg）：中间一个深蓝玻璃中庭，顶上压着一片两头翘起来的白色大屋檐；
 *   中庭前面凸出一个浅蓝玻璃盒子，下沿是红色的「ioi CITY MALL」字；两边是黄绿色马赛克竖条的墙；门口一个弧形大雨棚（白边、玻璃顶、圆柱），
 *   雨棚下是落客区；后面是 IOI City 的玻璃办公塔楼。这里只做正门这一段：商场一个翼、落客区、露天停车场、几块店招，不是整座商场。
 * SUKI-YA：同学们去 IOI 主要就是吃这家「SUKI-YA eat all you can sukiyaki & shabu shabu」（商场官网租户页 L238-2，10am–10pm）：
 *   一锅分两半（寿喜烧、昆布汤），肉（牛、羊、鸡）叫店员上，菜和丸子去自助台拿，限时 90 分钟。价钱照网上的攻略：平日午市 RM 39.80、晚市 RM 48.80。
 *   跟 KLIA 里卖牛丼的すき家（js/89-klia.js）不是一家。
 * 位置：仓库主人在大地图上圈的东北角空地（原来只有草和山树）。商场正门朝南，在 x 840–1020、z −380…−310；落客区和停车场在它南边，
 *   一条两车道的大道（x 930）从 Jalan Sunsuria 北边那条路（z 270）一直往北开到落客区，两边种椰子树、立路灯。
 *   地面等山上的树种好以后才压平（js/12-terrain.js 的 TG.flattenLate，和夜市、ERL 站一样），所以别处的树一棵不动；这块地和大道上的树清掉。
 * 玩法：SUKI-YA 门口的红圈按 F（手机点「吃火锅」）→ 选锅底、付自助餐的钱 → 直接开吃。游戏本身是 js/minigames/sukiya.js
 *   （B1 游戏厅的小游戏平台 XMini，用 XMini.startAt 从门口进，吃完回到门口）：和阿明、卷卷围着鸳鸯锅抢着吃，金圈时夹最香。
 *   吃完奶娃肚子鼓起来、出门时开心地笑（2 分钟，纯外观；游戏里没有现成的增益系统）。
 *   主线第 8 章「请阿豆去 IOI 吃 SUKI-YA」：付钱进店就算（XQuest.flag('q_suki8')）。
 * 性能：商场外壳 + 塔楼是一个合并网格（一张画布贴图集），玻璃一个，地面和标线各一个，圆柱子之类一个；路灯、椰子树是外面通用的可撞倒实例组。
 * 这个文件排在 js/89-klia.js 后面（用 XTrain.kit 的合并几何小工具），只加一个全局 window.XIOI（测试用）。 */
'use strict';
(() => {
  if (typeof TG === 'undefined' || !TG.flattenLate || !window.XTrain || !XTrain.kit || typeof opOpen !== 'function' || typeof gx === 'undefined') return;
  const {KB, kQuad, kBox, kSign, kFlat, kUp, kMesh, kAtlas, kBoard, kMat, kGlass, FONT} = XTrain.kit;
  const PI = Math.PI;

  /* ================= layout (world metres; north is −z) ================= */
  const CX = 930;                                                   /* the entrance axis and the boulevard */
  const MB = {x0:840, x1:1020, z0:-380, z1:-310, h:18};             /* the mall wing */
  const MOS = [[880, 912], [948, 980]], MOS_Z = -309, MOS_H = 25;   /* the two olive mosaic blocks either side of the atrium */
  const AT = {x0:912, x1:948, z0:-350, z1:-312, h:30};              /* the dark glass atrium */
  const BOX = {x0:914, x1:946, z0:-312, z1:-305, y0:8.6, y1:23};    /* the light glass box with the sign */
  const TOWERS = [{x0:850, x1:884, z0:-448, z1:-414, h:96}, {x0:974, x1:1006, z0:-462, z1:-428, h:112}];
  const LOT = {x0:836, x1:1024, z0:-302, z1:-232};                  /* drop-off lane + car park */
  const ISL = [[880, 922], [938, 980]], ISL_Z = [-294, -286];       /* planted islands between the drop-off lane and the car park */
  const ROW_Z = [[-286, -281, 1], [-274, -269, -1], [-269, -264, 1], [-257, -252, -1], [-252, -247, 1], [-240, -235, -1]];   /* stall rows [z0, z1, nose dir] */
  const ROAD = {x:CX, w:10, z0:-232, z1:266};                      /* the boulevard down to Jalan Sunsuria (artN, z 270) */
  const PAD = {x0:800, x1:1060, z0:-470, z1:-222, fall:40};
  const ROAD_PAD = {x0:CX - 9, x1:CX + 9, z0:-232, z1:262, fall:30};
  const SUKI = {x0:952, x1:976, x:964, z:-305.2};                   /* SUKI-YA's shop front and the ring in front of it */
  const PILLARS = [[902, -291], [918, -291], [942, -291], [958, -291]];
  const DOOR_OUT = {x:SUKI.x, z:-304.6, h:0, name:'IOI City Mall · SUKI-YA'};

  /* ================= level the ground (after the hill trees are planted), repaint the minimap relief, clear the trees ================= */
  TG.flattenLate(PAD); TG.flattenLate(ROAD_PAD);
  if (typeof outRelief !== 'undefined' && outRelief.getContext){
    const {nx, nz, C, x0, z0, Y} = TG, g = outRelief.getContext('2d'), lo = new THREE.Color('#79a35a'), hi = new THREE.Color('#3f6f33'), c = new THREE.Color();
    const at = (i, j) => Math.max(0, Y[j * nx + i]);
    for (const P of [PAD, ROAD_PAD]){
      const R = P.fall + 16, i0 = Math.max(1, Math.floor((P.x0 - R - x0) / C)), i1 = Math.min(nx - 2, Math.ceil((P.x1 + R - x0) / C));
      const j0 = Math.max(1, Math.floor((P.z0 - R - z0) / C)), j1 = Math.min(nz - 2, Math.ceil((P.z1 + R - z0) / C));
      const img = g.getImageData(i0, j0, i1 - i0 + 1, j1 - j0 + 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
        const h = at(i, j), sh = 1 + ((at(i - 1, j) - at(i + 1, j)) + (at(i, j - 1) - at(i, j + 1))) * .05, o = ((j - j0) * (i1 - i0 + 1) + (i - i0)) * 4;
        c.copy(lo).lerp(hi, smooth01(0, 45, h)).multiplyScalar(Math.max(.7, Math.min(1.25, sh)));
        img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
      }
      g.putImageData(img, i0, j0);
    }
  }
  const onSite = (x, z, m) => rectDist(x, z, {x0:PAD.x0 + 10, x1:PAD.x1 - 10, z0:PAD.z0 + 30, z1:PAD.z1}) < m || (Math.abs(x - CX) < 12 + m && z > PAD.z1 - 20 && z < 264);
  if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    if (onSite(o.x, o.z, 2)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); return; }
    if (!onSite(o.x, o.z, 60)) return;
    let y = terrainY(o.x, o.z);
    if (set.kind === 'tree'){ const r = .48 * o.s; for (let a = 0; a < 8; a++) y = Math.min(y, terrainY(o.x + Math.cos(a * .785) * r, o.z + Math.sin(a * .785) * r)); y -= .05; }
    if (Math.abs(y - o.y) > .005){ o.y = o.ty = y; setKnock(set, i, !!o.down, 0, 1); }
  });

  /* ================= the atlas: façade materials, signs, the shop fronts ================= */
  const A = kAtlas(1024, 512);
  const R = {
    tower:A.R(32, 0, 128, 192), atrium:A.R(160, 0, 128, 128), box:A.R(288, 0, 128, 128), mosaic:A.R(416, 0, 128, 128), clad:A.R(544, 0, 128, 128),
    shopA:A.R(672, 0, 176, 96), shopB:A.R(848, 0, 176, 96), entr:A.R(160, 128, 192, 64), drop:A.R(352, 128, 192, 64),
    sign:A.R(32, 192, 512, 64), suki:A.R(544, 128, 256, 64), gsc:A.R(800, 128, 224, 64), ice:A.R(544, 192, 240, 48), d21:A.R(784, 192, 240, 48),
    vg:A.R(544, 240, 240, 48), skyl:A.R(784, 240, 128, 48), sukiF:A.R(32, 288, 256, 128),
    shopC:A.R(672, 96, 176, 32)
  };
  const IOI_RED = '#e2231a';
  function paint(){
    const c = A.c, e = A.e, rr = mkRng(2014);
    const rect = (ctx, col, x, y, w, h) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    /* office tower curtain wall: 3 bays x 4 floors of blue glass between pale stone fins; some windows lit at night */
    { const {x, y, w, h} = {x:32, y:0, w:128, h:192}, bw = w / 3, fh = h / 4;
      for (let f = 0; f < 4; f++) for (let b = 0; b < 3; b++){
        const gx_ = x + b * bw, gy = y + f * fh, gr = c.createLinearGradient(gx_, gy, gx_ + bw, gy + fh);
        gr.addColorStop(0, '#9cc3e2'); gr.addColorStop(.55, '#4f86b8'); gr.addColorStop(1, '#2e5d8c'); c.fillStyle = gr; c.fillRect(gx_, gy, bw, fh);
        rect(c, 'rgba(255,255,255,.18)', gx_ + 4, gy + 3, bw * .35, fh - 6);
        rect(c, '#1f3347', gx_, gy + fh - 3, bw, 3); rect(c, '#1f3347', gx_ + bw / 2 - 1, gy, 2, fh);
        if (rr() < .45) rect(e, rr() < .5 ? '#7a6a48' : '#b39a62', gx_ + 2, gy + 2, bw - 4, fh - 6);
      }
      for (let b = 0; b <= 3; b++) rect(c, '#d9cfbd', x + b * bw - 4, y, 8, h); }
    /* atrium: dark teal-blue glass on a fine grid, reflections */
    { const x = 160, y = 0, gr = c.createLinearGradient(x, y, x + 128, y + 128); gr.addColorStop(0, '#2c5f8a'); gr.addColorStop(.6, '#1f4568'); gr.addColorStop(1, '#2a587f');
      c.fillStyle = gr; c.fillRect(x, y, 128, 128); c.fillStyle = 'rgba(180,215,240,.16)'; c.beginPath(); c.moveTo(x, y + 90); c.lineTo(x + 70, y); c.lineTo(x + 110, y); c.lineTo(x, y + 128); c.fill();
      for (let i = 0; i <= 8; i++){ rect(c, '#16283a', x + i * 16 - 1, y, 2, 128); rect(c, '#16283a', x, y + i * 16 - 1, 128, 2); }
      for (let i = 0; i < 10; i++) rect(e, '#4a5868', x + ((rr() * 8) | 0) * 16 + 2, y + ((rr() * 8) | 0) * 16 + 2, 12, 12); }
    /* the light glass box */
    { const x = 288, y = 0, gr = c.createLinearGradient(x, y, x, y + 128); gr.addColorStop(0, '#b9dcf4'); gr.addColorStop(1, '#7fb2dc');
      c.fillStyle = gr; c.fillRect(x, y, 128, 128); rect(c, 'rgba(255,255,255,.25)', x + 10, y, 30, 128);
      for (let i = 0; i <= 4; i++){ rect(c, '#5d7f9c', x + i * 32 - 1, y, 2, 128); rect(c, '#5d7f9c', x, y + i * 32 - 1, 128, 2); }
      rect(e, '#2a3a48', x, y, 128, 128); }
    /* the olive mosaic: vertical tiles in limes, olives and greys, staggered */
    { const x = 416, y = 0, P = ['#a9b54a', '#b9c25a', '#8f9c3e', '#c8c97a', '#7d8a3a', '#9aa0a0', '#b4b8a8', '#a0ab48'];
      rect(c, '#6f7a3a', x, y, 128, 128);
      for (let i = 0; i < 16; i++){ let yy = -((i * 7) % 13); while (yy < 128){ const hh = 14 + ((rr() * 14) | 0); rect(c, P[(rr() * P.length) | 0], x + i * 8 + .6, y + Math.max(0, yy) + .6, 6.8, Math.min(hh, 128 - Math.max(0, yy)) - 1.2); yy += hh; } } }
    /* white cladding panels */
    { const x = 544, y = 0; rect(c, '#e9e7e2', x, y, 128, 128); for (let i = 0; i <= 4; i++){ rect(c, '#cfccc5', x + i * 32 - 1, y, 2, 128); rect(c, '#d6d3cc', x, y + i * 32 - 1, 128, 2); } }
    /* shop fronts: a fashion shop, a café, a phone shop; lit inside at night */
    const shop = (x, y, w, h, kind) => {
      for (const [ctx, em] of [[c, false], [e, true]]){
        const lit = em ? .8 : 1, col = s => em ? '#' + new THREE.Color(s).multiplyScalar(lit * .7).getHexString() : s;
        ctx.fillStyle = col('#f3ead8'); ctx.fillRect(x, y, w, h);
        ctx.fillStyle = col(kind === 1 ? '#b98a5a' : '#d9d4cc'); ctx.fillRect(x, y + h * .72, w, h * .28);
        if (kind === 0) for (let i = 0; i < 6; i++){ ctx.fillStyle = col(['#c0392b', '#2d5d8a', '#e0b020', '#2d8a6e', '#8e44ad', '#ecf0f1'][i]); ctx.fillRect(x + 10 + i * 26, y + 30, 18, 34); ctx.fillStyle = col('#55504a'); ctx.fillRect(x + 8 + i * 26, y + 26, 22, 3); }
        else if (kind === 1){ for (let i = 0; i < 4; i++){ ctx.fillStyle = col('#6b4a2e'); ctx.fillRect(x + 14 + i * 40, y + 52, 24, 6); ctx.fillRect(x + 24 + i * 40, y + 58, 4, 12); } ctx.fillStyle = col('#2b2f36'); ctx.fillRect(x + 10, y + 12, w - 20, 16); }
        else { for (let i = 0; i < 8; i++){ ctx.fillStyle = col('#20262c'); ctx.fillRect(x + 12 + i * 20, y + 34, 12, 20); ctx.fillStyle = col('#4fc3ff'); ctx.fillRect(x + 14 + i * 20, y + 36, 8, 14); } }
        if (!em){ ctx.fillStyle = 'rgba(200,230,250,.22)'; ctx.fillRect(x, y, w * .4, h); ctx.fillStyle = '#2b2f36'; ctx.fillRect(x, y, w, 3); for (let i = 0; i <= 4; i++) ctx.fillRect(x + i * w / 4 - 1.5, y, 3, h); }
      }
    };
    shop(672, 0, 176, 96, 0); shop(848, 0, 176, 96, 1); shop(672, 96, 176, 32, 2);
    /* the main doors under the canopy */
    { const x = 160, y = 128; rect(c, '#1d2f40', x, y, 192, 64); for (let i = 0; i < 6; i++){ rect(c, '#9fc6de', x + 6 + i * 31, y + 8, 27, 56); rect(c, '#5f7a8e', x + 19 + i * 31, y + 30, 1.5, 16); }
      rect(e, '#6a5a3a', x + 6, y + 8, 180, 56); }
    kBoard(A, R.drop, '#1d4f9a', [{t:'DROP-OFF 落客区', s:24, c:'#ffffff', y:.38, w:800}, {t:'只上下客 · 别停车', s:15, c:'#cfe2ff', y:.76, w:600}], true);
    /* the mall's name: red letters on the light glass, "ioi" in lower case as on the real sign */
    for (const [ctx, em] of [[c, false], [e, true]]){
      const {x, y, w, h} = {x:32, y:192, w:512, h:64};
      if (em) rect(ctx, '#2a3a48', x, y, w, h); else { const gr = ctx.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#a9d2ef'); gr.addColorStop(1, '#8fc0e6'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); }
      ctx.save(); ctx.fillStyle = em ? '#ff4a32' : IOI_RED; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = `900 50px ${FONT}`; const a = 'ioi', b = 'CITY MALL', wa = ctx.measureText(a).width; ctx.font = `800 40px ${FONT}`; const wb = ctx.measureText(b).width;
      const x0 = x + (w - wa - 10 - wb) / 2; ctx.font = `900 50px ${FONT}`; ctx.fillText(a, x0, y + h * .47); ctx.font = `800 40px ${FONT}`; ctx.fillText(b, x0 + wa + 10, y + h * .55);
      ctx.restore();
    }
    kBoard(A, R.suki, '#1a1414', [{t:'SUKI-YA', s:34, c:'#ff4a3a', y:.4, w:900}, {t:'寿喜烧 · 涮涮锅 吃到饱', s:15, c:'#f4ead8', y:.8, w:600}], true);
    kBoard(A, R.gsc, '#d7262d', [{t:'GSC', s:36, c:'#ffffff', y:.42, w:900}, {t:'CINEMAS', s:14, c:'#ffe0e0', y:.82, w:700}], true);
    kBoard(A, R.ice, '#0e6fb5', [{t:'ICESCAPE 溜冰场', s:24, c:'#ffffff', y:.52, w:800}], true);
    kBoard(A, R.d21, '#2b2f36', [{t:'DISTRICT 21', s:26, c:'#f2c230', y:.52, w:900}], true);
    kBoard(A, R.vg, '#2d6a3a', [{t:'Village Grocer', s:24, c:'#ffffff', y:.52, w:700}], true);
    /* the canopy's underside: white with skylight strips */
    { const x = 784, y = 240; rect(c, '#f2f1ec', x, y, 128, 48); for (let i = 0; i < 4; i++) rect(c, '#b9d6e8', x + 8 + i * 31, y + 6, 20, 36); rect(e, '#3a3830', x, y, 128, 48); }
    /* SUKI-YA's front: dark wood frame, warm glass with hot-pot tables inside, a red noren over the door */
    for (const [ctx, em] of [[c, false], [e, true]]){
      const x = 32, y = 288, w = 256, h = 128, k = em ? .65 : 1, col = s => em ? '#' + new THREE.Color(s).multiplyScalar(k * .8).getHexString() : s;
      ctx.fillStyle = em ? '#000000' : '#3b2418'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = col('#f6dfb6'); ctx.fillRect(x + 8, y + 10, w - 16, h - 18);
      ctx.fillStyle = col('#c9a77a'); ctx.fillRect(x + 8, y + h * .72, w - 16, h * .28 - 8);
      for (let i = 0; i < 4; i++){ ctx.fillStyle = col('#5a3a26'); ctx.fillRect(x + 18 + i * 60, y + 72, 40, 8); ctx.fillStyle = col('#2b2b2e'); ctx.fillRect(x + 31 + i * 60, y + 62, 14, 10); ctx.fillStyle = col('#c0392b'); ctx.fillRect(x + 32 + i * 60, y + 60, 12, 3); }
      for (let i = 0; i < 5; i++){ ctx.fillStyle = col('#e8423a'); ctx.beginPath(); ctx.arc(x + 30 + i * 49, y + 26, 7, 0, 7); ctx.fill(); }
      if (!em){ ctx.fillStyle = 'rgba(255,240,220,.18)'; ctx.fillRect(x + 8, y + 10, 70, h - 18); for (let i = 0; i <= 4; i++) rect(ctx, '#3b2418', x + 8 + i * (w - 16) / 4 - 2, y + 10, 4, h - 18); }
      ctx.fillStyle = em ? '#3a0c08' : '#b3221b'; ctx.fillRect(x + 100, y + 10, 56, 44); ctx.fillStyle = em ? '#000' : '#3b2418'; for (let i = 1; i < 3; i++) ctx.fillRect(x + 100 + i * 18.6 - 1, y + 30, 2, 24);
      ctx.fillStyle = em ? '#5a4a40' : '#ffffff'; ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('すき', x + 128, y + 22);
    }
    A.done();
  }
  paint(); document.fonts && document.fonts.ready.then(paint);

  /* ================= the mall slice, the towers, the canopies: one mesh (+ glass, + round things) ================= */
  const b = KB(), gl = KB(), rd = KB(), mk = KB(), round = [];
  /* a face tiled with one atlas region, about pw x ph metres per tile */
  function tile(bb, ax, at, a0, a1, y0, y1, dir, r, pw, ph, col){
    const n = Math.max(1, Math.round((a1 - a0) / pw)), m = Math.max(1, Math.round((y1 - y0) / ph));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++)
      kSign(bb, ax, at, a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n, y0 + (y1 - y0) * j / m, y0 + (y1 - y0) * (j + 1) / m, dir, r, col || '#ffffff');
  }
  /* any four corners, flipped to face down (undersides) */
  function kDown(bb, P, Q, S, T, col, r){
    const ux = Q[0] - P[0], uz = Q[2] - P[2], vx = T[0] - P[0], vz = T[2] - P[2];
    if (uz * vx - ux * vz < 0) kQuad(bb, P, Q, S, T, col, r); else kQuad(bb, P, T, S, Q, col, r);
  }
  const ROOF = '#a9a69f', BAND = '#33373e', WHITE = '#f4f3ef';
  /* ---- the main wing: cladding on the sides and back, a flat roof with a parapet ---- */
  tile(b, 'x', MB.x0, MB.z0, MB.z1, 0, MB.h, -1, R.clad, 9, 6); tile(b, 'x', MB.x1, MB.z0, MB.z1, 0, MB.h, 1, R.clad, 9, 6);
  tile(b, 'z', MB.z0, MB.x0, MB.x1, 0, MB.h, -1, R.clad, 9, 6);
  kFlat(b, MB.x0, MB.z0, MB.x1, MB.z1, MB.h, ROOF);
  kBox(b, MB.x0, MB.h, MB.z0, MB.x1, MB.h + 1, MB.z0 + .5, '#dedbd4', 'ny'); kBox(b, MB.x0, MB.h, MB.z1 - .5, MB.x1, MB.h + 1, MB.z1, '#dedbd4', 'ny');
  kBox(b, MB.x0, MB.h, MB.z0, MB.x0 + .5, MB.h + 1, MB.z1, '#dedbd4', 'ny'); kBox(b, MB.x1 - .5, MB.h, MB.z0, MB.x1, MB.h + 1, MB.z1, '#dedbd4', 'ny');
  /* rooftop plant boxes */
  for (const [x, z] of [[858, -360], [1000, -352], [870, -330], [992, -334]]) kBox(b, x - 4, MB.h, z - 3, x + 4, MB.h + 2.4, z + 3, '#c9c6bf', 'ny');
  /* ---- the front of the outer parts: shop fronts, a sign band, white panels above, a small canopy over the walk ---- */
  const SHOPS = [R.shopA, R.shopB, R.shopC];
  const front = (x0, x1, zf, top, upper, shopsFrom) => {
    const n = Math.max(1, Math.round((x1 - x0) / 10));
    for (let i = 0; i < n; i++) kSign(b, 'z', zf, x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n, 0, 5.5, 1, SHOPS[(i + shopsFrom) % 3], '#ffffff');
    kBox(b, x0, 5.5, zf - .1, x1, 7.2, zf + .55, BAND, 'ny');
    tile(b, 'z', zf, x0, x1, 7.2, top, 1, upper, upper === R.mosaic ? 8 : 9, 6);
  };
  front(MB.x0, 880, MB.z1, MB.h, R.clad, 0); front(980, MB.x1, MB.z1, MB.h, R.clad, 1);
  for (const [x0, x1] of [[MB.x0 + 2, 878], [982, MB.x1 - 2]]){ kBox(b, x0, 5.0, MB.z1, x1, 5.35, MB.z1 + 5.2, WHITE, ''); }
  /* ---- the two mosaic blocks; SUKI-YA is the ground floor of the east one ---- */
  MOS.forEach(([x0, x1], k) => {
    if (k === 1){
      kSign(b, 'z', MOS_Z, x0, SUKI.x0, 0, 5.5, 1, R.clad, '#ffffff'); kSign(b, 'z', MOS_Z, SUKI.x1, x1, 0, 5.5, 1, R.clad, '#ffffff');
      tile(b, 'z', MOS_Z, SUKI.x0, SUKI.x1, 0, 5.5, 1, R.sukiF, 12, 5.5);
      kBox(b, x0, 5.5, MOS_Z - .1, x1, 7.2, MOS_Z + .55, BAND, 'ny'); tile(b, 'z', MOS_Z, x0, x1, 7.2, MOS_H, 1, R.mosaic, 8, 6);
      /* a short wooden awning over SUKI-YA's door */
      kBox(b, SUKI.x0 + 1, 4.6, MOS_Z, SUKI.x1 - 1, 4.85, MOS_Z + 2.4, '#5a3a26', '');
    } else front(x0, x1, MOS_Z, MOS_H, R.mosaic, 2);
    tile(b, 'x', x0, MB.z0 + 8, MOS_Z, 0, MOS_H, -1, R.mosaic, 8, 6); tile(b, 'x', x1, MB.z0 + 8, MOS_Z, 0, MOS_H, 1, R.mosaic, 8, 6);
    tile(b, 'z', MB.z0 + 8, x0, x1, MB.h, MOS_H, -1, R.mosaic, 8, 6);
    kFlat(b, x0, MB.z0 + 8, x1, MOS_Z, MOS_H, ROOF);
  });
  /* the shop signs on the bands */
  const sign = (r, x0, x1, zf) => kSign(b, 'z', zf + .56, x0, x1, 5.65, 7.05, 1, r, '#ffffff');
  sign(R.gsc, 846, 862, MB.z1); sign(R.vg, 864, 878, MB.z1); sign(R.ice, 884, 908, MOS_Z); sign(R.suki, SUKI.x0 + 1, SUKI.x1 - 1, MOS_Z); sign(R.d21, 986, 1008, MB.z1);
  /* ---- the atrium: dark glass from the ground to 30 m, the doors at the bottom; the light glass box in front with the name ---- */
  tile(b, 'z', AT.z1, AT.x0, AT.x1, 4.6, AT.h, 1, R.atrium, 6, 6.4); tile(b, 'z', AT.z1, AT.x0, AT.x1, 0, 4.6, 1, R.entr, 18, 4.6);
  tile(b, 'x', AT.x0, AT.z0, AT.z1, MOS_H, AT.h, -1, R.atrium, 6, 5); tile(b, 'x', AT.x1, AT.z0, AT.z1, MOS_H, AT.h, 1, R.atrium, 6, 5);
  tile(b, 'z', AT.z0, AT.x0, AT.x1, MB.h, AT.h, -1, R.atrium, 6, 6);
  tile(b, 'z', BOX.z1, BOX.x0, BOX.x1, BOX.y0, BOX.y1, 1, R.box, 8, 7.2); tile(b, 'x', BOX.x0, BOX.z0, BOX.z1, BOX.y0, BOX.y1, -1, R.box, 7, 7.2); tile(b, 'x', BOX.x1, BOX.z0, BOX.z1, BOX.y0, BOX.y1, 1, R.box, 7, 7.2);
  kFlat(b, BOX.x0, BOX.z0, BOX.x1, BOX.z1, BOX.y1, '#cfd3d6'); kDown(b, [BOX.x0, BOX.y0, BOX.z0], [BOX.x1, BOX.y0, BOX.z0], [BOX.x1, BOX.y0, BOX.z1], [BOX.x0, BOX.y0, BOX.z1], '#d9d6cf');
  kSign(b, 'z', BOX.z1 + .05, BOX.x0 + 2, BOX.x1 - 2, 9.1, 12.6, 1, R.sign, '#ffffff');
  /* ---- the wing roof over the atrium: a white sweep whose two ends turn up ---- */
  { const xs = 892, xe = 968, zs = -354, ze = -300, n = 16, m = 5, wy = (x, z) => 30.6 + 3.8 * Math.pow((x - CX) / 38, 2) + (z - zs) / (ze - zs) * 1.8;
    const P = (x, z, d) => [x, wy(x, z) + (d || 0), z];
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++){
      const xa = xs + (xe - xs) * i / n, xb = xs + (xe - xs) * (i + 1) / n, za = zs + (ze - zs) * j / m, zb = zs + (ze - zs) * (j + 1) / m;
      kUp(b, P(xa, za), P(xb, za), P(xb, zb), P(xa, zb), WHITE); kDown(b, P(xa, za, -.6), P(xb, za, -.6), P(xb, zb, -.6), P(xa, zb, -.6), '#d8d6d0');
    }
    for (let i = 0; i < n; i++){ const xa = xs + (xe - xs) * i / n, xb = xs + (xe - xs) * (i + 1) / n;
      kQuad(b, P(xa, ze, -1.6), P(xb, ze, -1.6), P(xb, ze), P(xa, ze), '#e9e7e2'); kQuad(b, P(xb, zs, -1), P(xa, zs, -1), P(xa, zs), P(xb, zs), '#e9e7e2'); }
    for (let j = 0; j < m; j++){ const za = zs + (ze - zs) * j / m, zb = zs + (ze - zs) * (j + 1) / m;
      kQuad(b, P(xs, za, -1.2), P(xs, zb, -1.2), P(xs, zb), P(xs, za), '#e9e7e2'); kQuad(b, P(xe, zb, -1.2), P(xe, za, -1.2), P(xe, za), P(xe, zb), '#e9e7e2'); }
    /* struts from the atrium roof up to the sweep */
    for (const x of [AT.x0 + 2, CX, AT.x1 - 2]) for (const z of [-346, -318]) kBox(b, x - .3, AT.h, z - .3, x + .3, wy(x, z) - .5, z + .3, '#d0cec8', 'ny');
    kFlat(b, AT.x0, AT.z0, AT.x1, AT.z1, AT.h, ROOF); }
  /* ---- the drop-off canopy: an arc-fronted slab, glass on top, white fascia, round columns ---- */
  { const xs = 890, xe = 970, zb = -311, n = 16, m = 3, zf = x => -292 + 6 * (1 - Math.pow((x - CX) / 40, 2)), cy = (z) => 7.7 + (z - zb) / 25 * .8;
    const P = (x, j, d) => { const z = zb + (zf(x) - zb) * j / m; return [x, cy(z) + (d || 0), z]; };
    for (let i = 0; i < n; i++){ const xa = xs + (xe - xs) * i / n, xc = xs + (xe - xs) * (i + 1) / n;
      for (let j = 0; j < m; j++){
        kUp(gl, P(xa, j, .02), P(xc, j, .02), P(xc, j + 1, .02), P(xa, j + 1, .02), '#ffffff');
        kDown(b, P(xa, j, -.55), P(xc, j, -.55), P(xc, j + 1, -.55), P(xa, j + 1, -.55), '#ffffff', R.skyl);
      }
      kQuad(b, P(xa, m, -.75), P(xc, m, -.75), P(xc, m, .25), P(xa, m, .25), WHITE); kQuad(b, P(xc, m, .25), P(xa, m, .25), P(xa, m, -.55), P(xc, m, -.55), '#e6e4de');
    }
    for (const [x0, k] of [[xs, -1], [xe, 1]]) kQuad(b, ...(k < 0 ? [P(x0, m, -.75), P(x0, 0, -.75), P(x0, 0, .25), P(x0, m, .25)] : [P(x0, 0, -.75), P(x0, m, -.75), P(x0, m, .25), P(x0, 0, .25)]), WHITE);
    for (const [x, z] of PILLARS) round.push(geoTint(new THREE.CylinderGeometry(.45, .5, cy(z), 12, 1, true).translate(x, cy(z) / 2, z), '#e8e6e0'));
    /* the drop-off sign on a post at the west end of the island */
    kBox(b, 882.8, 0, -290.1, 883.2, 2.6, -289.9, '#5f6368'); kSign(b, 'z', -289.85, 881.2, 884.8, 1.5, 2.7, 1, R.drop, '#ffffff'); kSign(b, 'z', -290.15, 881.2, 884.8, 1.5, 2.7, -1, R.drop, '#ffffff'); }
  /* ---- the office towers behind the mall (IOI City Tower): curtain wall between stone fins ---- */
  for (const T of TOWERS){
    tile(b, 'z', T.z1, T.x0, T.x1, 0, T.h, 1, R.tower, 8.5, 12); tile(b, 'z', T.z0, T.x0, T.x1, 0, T.h, -1, R.tower, 8.5, 12);
    tile(b, 'x', T.x0, T.z0, T.z1, 0, T.h, -1, R.tower, 8.5, 12); tile(b, 'x', T.x1, T.z0, T.z1, 0, T.h, 1, R.tower, 8.5, 12);
    kFlat(b, T.x0, T.z0, T.x1, T.z1, T.h, ROOF); kBox(b, T.x0 + 3, T.h, T.z0 + 3, T.x1 - 3, T.h + 4, T.z1 - 3, '#d9cfbd', 'ny');
  }
  /* ---- the walk, the plaza, the drop-off lane, the car park and the boulevard ---- */
  const ASPH = '#5f5d59', LINE = '#f1ede4', YEL = '#f2c230', PAVE = '#cbc5ba';
  kFlat(rd, LOT.x0, MB.z1, LOT.x1, LOT.z0, .06, PAVE); kFlat(rd, 892, -312, 968, LOT.z0, .065, '#ddd7cb');
  for (let x = 894; x < 968; x += 4) kFlat(mk, x, -311.5, x + .15, LOT.z0 - .3, .075, '#b9b2a6');
  kFlat(rd, LOT.x0, LOT.z0, LOT.x1, LOT.z1, .05, ASPH);
  kFlat(mk, LOT.x0, LOT.z0 - .1, LOT.x1, LOT.z0 + .15, .07, YEL);
  for (let x = 925; x < 935.5; x += 1.2) kFlat(mk, x, LOT.z0 + .8, x + .6, ISL_Z[0] - .8, .07, LINE);   /* zebra crossing to the doors */
  /* the grass islands are flush with the road (owner: you can drive and walk across them): a painted kerb and grass on the ground layer, no collider;
     the palms and lamps on them are the usual knock-down instances, the canopy columns stay solid */
  for (const [x0, x1] of ISL){ kFlat(rd, x0, ISL_Z[0], x1, ISL_Z[1], .057, '#bdb6aa'); kFlat(rd, x0 + .3, ISL_Z[0] + .3, x1 - .3, ISL_Z[1] - .3, .063, '#5f8a3e'); }
  /* parking stalls: the car park is split by the middle aisle (the boulevard runs on to the doors) and edge aisles */
  const STALL = 2.6, HALF = [[846, 920.8], [939.2, 1014]];
  for (const [z0, z1] of ROW_Z) for (const [x0, x1] of HALF){
    for (let x = x0; x <= x1 + .01; x += STALL) kFlat(mk, x - .06, z0 + .2, x + .06, z1 - .2, .07, LINE);
  }
  /* edge planters along the south side of the car park (gap for the boulevard) */
  for (const [x0, x1] of [[LOT.x0, CX - 6], [CX + 6, LOT.x1]]){ kBox(b, x0, 0, LOT.z1, x1, .3, LOT.z1 + 3, '#bdb6aa', 'ny'); kFlat(b, x0 + .3, LOT.z1 + .3, x1 - .3, LOT.z1 + 2.7, .31, '#5f8a3e'); }
  /* the boulevard, kerbs, a dashed centre line */
  kFlat(rd, CX - ROAD.w / 2, LOT.z1, CX + ROAD.w / 2, ROAD.z1, .045, ASPH);
  for (const s of [-1, 1]) kFlat(rd, CX + s * ROAD.w / 2 - (s < 0 ? .6 : 0), LOT.z1 + 3, CX + s * ROAD.w / 2 + (s > 0 ? .6 : 0), ROAD.z1 - 2, .07, '#bdb4a4');
  for (let z = LOT.z1 + 4; z < ROAD.z1 - 4; z += 9) kFlat(mk, CX - .1, z, CX + .1, z + 4.5, .065, LINE);
  kFlat(mk, CX - ROAD.w / 2, ROAD.z1 - 3.2, CX, ROAD.z1 - 2.8, .066, LINE);   /* give-way line at Jalan Sunsuria */
  /* bollards along the walk */
  const BOLLARDS = []; for (let x = 856; x <= 1004; x += 4) if (Math.abs(x - CX) > 6 && Math.abs(x - SUKI.x) > 3) BOLLARDS.push(x);
  for (const x of BOLLARDS) round.push(geoTint(new THREE.CylinderGeometry(.14, .14, .9, 8).translate(x, .45, LOT.z0 - .5), '#5f6368'));
  /* the building materials: the shell and towers cast shadows on desktop; glass on its own; round things merged */
  const mallMat = kMat(A), glassMat = kGlass();
  const groundMat = typeof outGroundMat !== 'undefined' ? outGroundMat : M('#ffffff', {vertexColors:true, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-20});
  const markMat = typeof outMarkMat !== 'undefined' ? outMarkMat : groundMat;
  const MALL = {mesh:kMesh(b, mallMat, null, !TOUCH), glass:kMesh(gl, glassMat, null, false), road:kMesh(rd, groundMat, null, false), marks:kMesh(mk, markMat, null, false), round:null};
  MALL.glass.renderOrder = 1;
  MALL.round = new THREE.Mesh(geoMerge(round), M('#ffffff', {vertexColors:true, roughness:.6})); MALL.round.castShadow = !TOUCH; MALL.round.receiveShadow = true; scene.add(MALL.round);
  MALL.mesh.userData.info = {name:'IOI City Mall', tag:'商场',
    desc:'Putrajaya 边上的 IOI City Mall，马来西亚最大的商场。这里只有正门这一段：蓝色玻璃中庭、白色大屋檐、红字招牌、弧形落客雨棚。同学们来这儿主要是吃 SUKI-YA 寿喜烧涮涮锅放题：正门东边的红圈按 F。',
    spawn:[CX, -298, 0]};
  pickables.push(MALL.mesh);

  /* ---- colliders and minimap: the wing, the two mosaic blocks reach the walk, the towers, the canopy columns (the grass islands are drive-over) ---- */
  addBox((MB.x0 + MB.x1) / 2, (MB.z0 + MB.z1) / 2, (MB.x1 - MB.x0) / 2, (MB.z1 - MB.z0) / 2, 0);
  for (const [x0, x1] of MOS) addBox((x0 + x1) / 2, (MB.z1 + MOS_Z) / 2, (x1 - x0) / 2, (MOS_Z - MB.z1) / 2 + .01, 0);
  for (const T of TOWERS){ addBox((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, (T.x1 - T.x0) / 2, (T.z1 - T.z0) / 2, 0); addFp({t:0, x:(T.x0 + T.x1) / 2, z:(T.z0 + T.z1) / 2, w:T.x1 - T.x0, d:T.z1 - T.z0, rot:0, color:'#5f86ad'}); }
  addCircle(883, -290, .2);   /* the drop-off sign's post */
  for (const [x, z] of PILLARS) addCircle(x, z, .5);
  for (const x of BOLLARDS) addCircle(x, LOT.z0 - .5, .18);
  addFp({t:0, x:(MB.x0 + MB.x1) / 2, z:(MB.z0 + MB.z1) / 2, w:MB.x1 - MB.x0, d:MB.z1 - MB.z0, rot:0, color:'#b9b4aa'});
  for (const [x0, x1] of MOS) addFp({t:0, x:(x0 + x1) / 2, z:(MB.z0 + 8 + MOS_Z) / 2, w:x1 - x0, d:MOS_Z - MB.z0 - 8, rot:0, color:'#9aa64a'});
  addFp({t:0, x:CX, z:(AT.z0 + AT.z1) / 2, w:AT.x1 - AT.x0, d:AT.z1 - AT.z0, rot:0, color:'#3f6f9a'});
  addLabel('IOI City Mall', CX, 40, -330);
  if (typeof OUT_LOTS !== 'undefined') OUT_LOTS.push([LOT.x0, MB.z1, LOT.x1, LOT.z1]);
  if (typeof drawOutMini === 'function'){ const base = drawOutMini; drawOutMini = function(mg, X, Z, k){ base(mg, X, Z, k);
    mg.strokeStyle = '#cfcac0'; mg.lineCap = 'butt'; mg.lineWidth = Math.max(1.5, ROAD.w * k); mg.beginPath(); mg.moveTo(X(CX), Z(LOT.z1)); mg.lineTo(X(CX), Z(ROAD.z1 + 4)); mg.stroke(); mg.lineCap = 'round';
    mg.fillStyle = '#7fae5a'; for (const [x0, x1] of ISL) mg.fillRect(X(x0), Z(ISL_Z[0]), (x1 - x0) * k, (ISL_Z[1] - ISL_Z[0]) * k); }; }
  /* parked cars (real cars like the others outside the gate: you can get in) */
  if (typeof OUT_CARS !== 'undefined'){
    const sx = (h, i) => HALF[h][0] + STALL / 2 + i * STALL;
    /* each car is ~10 draw calls: four on desktop, two on phones */
    OUT_CARS.push(...[['myvi', '#e0b020', sx(0, 20), -254.6, 0], ['sedan', '#f0eee8', sx(1, 7), -271.6, 0], ['sedan', '#1f1f22', sx(0, 4), -283.6, PI],
      ['myvi', '#2d5d8a', sx(1, 24), -237.6, 0]].slice(0, TOUCH ? 2 : 4));
  }
  /* lamps along the boulevard and in the car park, coconut palms down both sides (knock-down sets like the rest outside the gate) */
  if (typeof outSet === 'function' && typeof outPostGeo !== 'undefined'){
    const lamps = [], step = TOUCH ? 56 : 40;
    for (let z = LOT.z1 + 20, k = 0; z < ROAD.z1 - 12; z += step, k++){ const s = k % 2 ? 1 : -1; lamps.push(outSpot(CX + s * (ROAD.w / 2 + 1.4), z, s > 0 ? -PI / 2 : PI / 2, 1)); }
    for (const [x0, x1] of ISL) lamps.push(outSpot((x0 + x1) / 2, (ISL_Z[0] + ISL_Z[1]) / 2, PI, .9));
    for (const z of [-262, -244]) for (const x of [880, 980]) lamps.push(outSpot(x, z + .5, 0, .9));
    outSet('lamp', lamps, [[outPostGeo, M('#3b3f44', {metalness:.4, roughness:.5})], [outBulbGeo, bulbMat]], !TOUCH);
    if (typeof trunkGeo !== 'undefined'){
      const palms = [], rr = mkRng(1120), ps = TOUCH ? 30 : 20;
      for (let z = LOT.z1 + 10; z < ROAD.z1 - 10; z += ps) for (const s of [-1, 1]) palms.push(outSpot(CX + s * (ROAD.w / 2 + 4), z + (rr() - .5) * 2, rr() * 6.28, .85 + rr() * .3));
      for (const [x0, x1] of ISL) for (let x = x0 + 4; x < x1 - 2; x += 9) if (!PILLARS.some(p => Math.abs(p[0] - x) < 2.5)) palms.push(outSpot(x, ISL_Z[0] + 4, rr() * 6.28, .7 + rr() * .2));
      outSet('tree', palms, [[trunkGeo, M('#ffffff', {vertexColors:true, roughness:.95})], [crownGeo, M('#ffffff', {side:THREE.DoubleSide, roughness:.8, vertexColors:true})]], !TOUCH);
    }
  }

  /* ================= SUKI-YA: the door ring, paying, and the hot-pot game (js/minigames/sukiya.js runs on the B1 arcade platform) ================= */
  const PRICE = () => opNight() ? 48.8 : 39.8;
  if (typeof achAdd === 'function') achAdd([['ioi1', '周末去 IOI', '在 IOI City Mall 吃一次 SUKI-YA 火锅放题', 20], ['sukiback', '吃回本', 'SUKI-YA 火锅放题吃回 RM 39.80（铜牌）', 40],
    ['sukiking', '吃货之王', 'SUKI-YA 火锅放题吃回 RM 130 以上（金牌）', 80]]);
  const SK = {near:false, msg:'', full:0, fullK:0, bx:false, laugh:false};
  const RING = opSpot('#e2342f', .7, SUKI.x, SUKI.z, 'SUKI-YA 火锅放题 · 按 F', 4.2);
  const hasGame = () => !!(window.XMini && XMini.startAt && XMini.list && XMini.list.some(g => g.id === 'sukiya'));
  const fmtBest = id => { const v = window.XMini && XMini.best ? XMini.best(id) : null; return v != null ? ` · 纪录吃回 RM ${(v / 100).toFixed(2)}` : ''; };
  function skOffer(){
    const p = PRICE(), night = opNight();
    opOpen('🍲 SUKI-YA · 寿喜烧涮涮锅放题',
      `<p class="op-note">IOI City Mall 里同学们最常来的一家。${night ? '现在是晚市' : '现在是平日午市'}，一位 ${fmtRM(p)}。和阿明、卷卷围着一口鸳鸯锅抢着吃：金圈时夹最香，慢了就被他们夹走；吃回 RM 39.80 就算回本。</p>` +
      `<button type="button" class="op-card" data-m="classic"><kbd>1</kbd><b>寿喜烧 + 昆布汤 · ${fmtRM(p)}</b><span>经典鸳鸯锅${fmtBest('sukiya')}</span></button>` +
      `<button type="button" class="op-card" data-m="spicy"><kbd>2</kbd><b>寿喜烧 + 麻辣 · ${fmtRM(p)}</b><span>麻辣那边熟得快、算 1.4 倍，但会辣哭，记得喝水${fmtBest('sukiya_spicy')}</span></button>` +
      `<p class="op-note" style="margin-top:8px">不是 KLIA 那家卖牛丼的すき家。</p>`,
      code => { if (code === 'Digit1' || code === 'Numpad1' || code === 'KeyF') skPay('classic'); else if (code === 'Digit2' || code === 'Numpad2') skPay('spicy'); });
    for (const el of document.querySelectorAll('#opBody .op-card')) el.addEventListener('click', () => skPay(el.dataset.m));
  }
  function skPay(mode){
    const p = PRICE();
    if (!hasGame()){ opClose(true); toast('今天客满', 'SUKI-YA 暂时进不去（小游戏没加载）', 2400); RING.rearm = true; return false; }
    if (money < p){ opClose(true); toast('钱不够', `放题一位 ${fmtRM(p)}，先去送几单外卖吧`, 2400); RING.rearm = true; return false; }
    opClose(true); money -= p; moneyChanged(); unlock('ioi1'); RING.rearm = true;
    /* the story's chapter 8 step 「请阿豆去 IOI 吃 SUKI-YA」 (js/89-quest-data.js) is done once you pay and sit down */
    try { if (window.XQuest && XQuest.step && (XQuest.step() || {}).id === 'c8_suki' && XQuest.flag) XQuest.flag('q_suki8'); } catch(e){}
    if (driving) leaveCar();
    return XMini.startAt(mode === 'spicy' ? 'sukiya_spicy' : 'sukiya', Object.assign({}, DOOR_OUT));
  }
  /* called by the game when it ends: a full belly for two minutes (looks only), a laugh on the way out of the door */
  function fed(k){ SK.full = 120; SK.fullK = Math.max(.35, Math.min(1, k || 0)); SK.laugh = true; }

  /* ================= per frame: the door ring, the full belly ================= */
  function update(dt, px, pz){
    SK.msg = '';
    if (SK.full > 0){ SK.full -= dt; if (SK.full <= 0){ SK.full = 0; gxCallout('消化完了', '下次再去 IOI 吃', '#9fd8ff'); } }
    if (SK.laugh && !window.XINDOOR && mode === 'naiwa' && !driving){ SK.laugh = false; nw.state = 'laugh'; nw.t = 0; if (sfx.laugh) sfx.laugh(); }
    const was = SK.near; SK.near = false;
    const other = mission.on || !!gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in) || !!window.XINDOOR || gx.busy();
    if (opRing(RING, !other && Math.abs(px - SUKI.x) < 360 && Math.abs(pz - SUKI.z) < 360, px, pz)){
      if (driving) SK.msg = '下车走进红圈，吃 SUKI-YA 火锅放题';
      else if (nw.state !== 'fly' && !nw.air){ SK.near = true; SK.msg = TOUCH ? `点「吃火锅」· 放题 ${fmtRM(PRICE())}` : `按 F 吃 SUKI-YA 火锅放题 · ${fmtRM(PRICE())}`; opSetF('吃火锅'); }
    }
    if (was && !SK.near && opFBtn === '吃火锅') opSetF('');
  }
  if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){
    if (SK.near && !driving && nw.state !== 'fly' && !opUI.on){ skOffer(); return true; }
    return base(); }; }
  if (typeof animNaiwa === 'function'){ const base = animNaiwa; animNaiwa = function(dt, T){ base(dt, T);
    const k = SK.full > 0 && !window.XINDOOR ? Math.min(1, SK.full / 15) * SK.fullK : 0;
    if (NW && NW.belly){ if (k > 0){ NW.belly.scale.z *= 1 + .5 * k; NW.belly.scale.x = 1 + .14 * k; SK.bx = true; } else if (SK.bx){ NW.belly.scale.x = 1; SK.bx = false; } }
  }; }
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); update(dt, px, pz); },
      prompt(){ return SK.msg || base.prompt(); },
      mini(dot){ base.mini(dot); if (!gx.busy() && !mission.on) dot(SUKI.x, SUKI.z, '#c2185b', 6); },
      frame(dt, T){ if (base.frame) base.frame(dt, T); mallMat.emissiveIntensity = Math.max(cur.win, wx.rain * .5); },
      leave(){ opHide(RING); RING.rearm = false; SK.near = false; base.leave(); }
    });
  }
  window.XIOI = {CX, MB, LOT, ROAD, SUKI, PAD, MALL, SK, RING, DOOR:DOOR_OUT, price:PRICE, offer:skOffer, pay:skPay, fed,
    /* tests: stand just south of the ring */
    goDoor(){ if (mode !== 'naiwa') setMode('naiwa'); if (driving) leaveCar(); nw.x = SUKI.x; nw.z = SUKI.z + 3; nw.y = groundAt(nw.x, nw.z); nw.h = PI; camYaw = 0; }};
})();
