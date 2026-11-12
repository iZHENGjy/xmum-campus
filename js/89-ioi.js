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
 * 玩法：SUKI-YA 门口的红圈按 F（手机点「吃火锅」）→ 付自助餐的钱 → 进店坐下 → 60 秒涮火锅：
 *   点下面的食材放进锅里（肉要等店员切，隔几秒才能再点一盘），转圈变绿就能夹起来吃，放太久会煮老、煮烂；
 *   吃到的东西按「单点要多少钱」算，看能不能吃回本；吃撑（饱腹满了）也结束。偶尔有限时的和牛。
 *   吃完奶娃肚子鼓起来、开心地笑（2 分钟，纯外观；游戏里没有现成的增益系统）。店里走到门口的绿圈按 F 出门。
 * 店里是搭在地图外（x −60, z −3950）的一间没有屋顶的屋子（排屋室内用 x 0…35、z −4100，ERL 的布城预留 −3100、市中心 −3600；
 *   再往外 4.3 km 是包住整个世界的远景圆筒，不能放），window.XINDOOR = 'sukiya'。
 * 性能：商场外壳 + 塔楼是一个合并网格（一张画布贴图集），玻璃一个，地面和标线各一个，圆柱子之类一个；路灯、椰子树是外面通用的可撞倒实例组。
 *   店里的东西只在店里时显示。
 * 这个文件排在 js/89-klia.js 后面（用 XTrain.kit 的合并几何小工具），只加一个全局 window.XIOI（测试用）。 */
'use strict';
(() => {
  if (typeof TG === 'undefined' || !TG.flattenLate || !window.XTrain || !XTrain.kit || typeof opOpen !== 'function' || typeof gx === 'undefined') return;
  const {KB, kQuad, kBox, kSign, kFlat, kUp, kMesh, kAtlas, kBoard, kMat, kGlass, kRoom, FONT} = XTrain.kit;
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

  /* ================= the atlas: façade materials, signs, the shop fronts, the restaurant inside ================= */
  const A = kAtlas(1024, 512);
  const R = {
    tower:A.R(32, 0, 128, 192), atrium:A.R(160, 0, 128, 128), box:A.R(288, 0, 128, 128), mosaic:A.R(416, 0, 128, 128), clad:A.R(544, 0, 128, 128),
    shopA:A.R(672, 0, 176, 96), shopB:A.R(848, 0, 176, 96), entr:A.R(160, 128, 192, 64), drop:A.R(352, 128, 192, 64),
    sign:A.R(32, 192, 512, 64), suki:A.R(544, 128, 256, 64), gsc:A.R(800, 128, 224, 64), ice:A.R(544, 192, 240, 48), d21:A.R(784, 192, 240, 48),
    vg:A.R(544, 240, 240, 48), skyl:A.R(784, 240, 128, 48), sukiF:A.R(32, 288, 256, 128), wood:A.R(288, 288, 128, 128), menu:A.R(416, 288, 256, 128),
    floor:A.R(672, 288, 128, 128), noren:A.R(800, 288, 128, 128), sukiIn:A.R(32, 416, 384, 64), shopC:A.R(672, 96, 176, 32)
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
    /* inside: dark wood slats, the price board, wooden floor, the noren over the door, the buffet bar's sign */
    { const x = 288, y = 288; rect(c, '#4a2f1f', x, y, 128, 128); for (let i = 0; i < 16; i++) rect(c, i % 2 ? '#5a3a26' : '#64422c', x + i * 8 + 1, y, 6, 128); rect(c, '#2e1d13', x, y + 92, 128, 4); }
    kBoard(A, R.menu, '#1a1414', [{t:'SUKI-YA 吃到饱', s:26, c:'#ff5a46', y:.2, w:900}, {t:'平日午市 RM 39.80 · 晚市 RM 48.80', s:17, c:'#f4ead8', y:.47, w:700},
      {t:'牛 · 羊 · 鸡 叫店员上 · 菜和丸子自助', s:14, c:'#d8c9b0', y:.68, w:500}, {t:'限时 90 分钟 · 两种汤底', s:14, c:'#d8c9b0', y:.86, w:500}], true);
    { const x = 672, y = 288; rect(c, '#b07a4c', x, y, 128, 128); for (let i = 0; i < 8; i++){ rect(c, i % 2 ? '#a06c40' : '#bb8656', x, y + i * 16, 128, 15); rect(c, '#8a5a32', x + ((i * 37) % 100) + 10, y + i * 16, 2, 15); } }
    { const x = 800, y = 288; rect(c, '#3b2418', x, y, 128, 128); rect(c, '#b3221b', x + 14, y + 8, 100, 70); rect(c, '#3b2418', x + 46, y + 30, 3, 48); rect(c, '#3b2418', x + 79, y + 30, 3, 48);
      c.fillStyle = '#ffffff'; c.font = `800 18px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SUKI-YA', x + 64, y + 20); rect(c, '#20262c', x + 22, y + 78, 84, 50); }
    kBoard(A, R.sukiIn, '#2b2b2e', [{t:'自助台 · 菜 · 丸子 · 酱料　　Self-service bar', s:24, c:'#ffd27a', y:.52, w:700}], true);
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
  for (const [x0, x1] of ISL){ kBox(b, x0, 0, ISL_Z[0], x1, .32, ISL_Z[1], '#bdb6aa', 'ny'); kFlat(b, x0 + .3, ISL_Z[0] + .3, x1 - .3, ISL_Z[1] - .3, .33, '#5f8a3e'); }
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

  /* ---- colliders and minimap: the wing, the two mosaic blocks reach the walk, the towers, the islands, the canopy columns ---- */
  addBox((MB.x0 + MB.x1) / 2, (MB.z0 + MB.z1) / 2, (MB.x1 - MB.x0) / 2, (MB.z1 - MB.z0) / 2, 0);
  for (const [x0, x1] of MOS) addBox((x0 + x1) / 2, (MB.z1 + MOS_Z) / 2, (x1 - x0) / 2, (MOS_Z - MB.z1) / 2 + .01, 0);
  for (const T of TOWERS){ addBox((T.x0 + T.x1) / 2, (T.z0 + T.z1) / 2, (T.x1 - T.x0) / 2, (T.z1 - T.z0) / 2, 0); addFp({t:0, x:(T.x0 + T.x1) / 2, z:(T.z0 + T.z1) / 2, w:T.x1 - T.x0, d:T.z1 - T.z0, rot:0, color:'#5f86ad'}); }
  for (const [x0, x1] of ISL) addBox((x0 + x1) / 2, (ISL_Z[0] + ISL_Z[1]) / 2, (x1 - x0) / 2, (ISL_Z[1] - ISL_Z[0]) / 2, 0);
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

  /* ================= SUKI-YA inside: a roofless room off the map (x −60, z −3950) ================= */
  /* inside the horizon ring (js/18-gfx.js draws a 4.3 km cylinder round the world), clear of the house interiors (x −4.5…34.5, z −4100) */
  const IX = -60, IZ = -3950, RW = 9, RD = 7.5, WH = 3.2;
  const W = (x, z) => [IX + x, IZ + z];
  const IN = new THREE.Group(); IN.visible = false; scene.add(IN);
  const TABLES = [[-5.6, -2.7], [0, -2.7], [5.6, -2.7], [-5.6, 2.5], [0, 2.5], [5.6, 2.5]];   /* booth tables (local), the player's is [0, -2.7]; each booth takes ±0.95 x ±1.25 m */
  const SEAT = {x:IX, z:IZ - 2.7 + .95, h:PI};                                                /* the south bench of the middle table, facing the pot */
  const EXIT = {x:IX, z:IZ + RD - 1.3};
  const POT = {x:IX, z:IZ - 2.7, y:.74 + .13};
  const ib = KB(), ig = KB(), iround = [];
  {
    const x0 = IX - RW, x1 = IX + RW, z0 = IZ - RD, z1 = IZ + RD;
    /* floor and walls (inside faces), a skirting band */
    for (let x = x0; x < x1 - .01; x += 3) for (let z = z0; z < z1 - .01; z += 3) kFlat(ib, x, z, Math.min(x1, x + 3), Math.min(z1, z + 3), 0, '#b8a28c', R.floor);
    tile(ib, 'z', z0, x0, x1, 0, WH, 1, R.wood, 3, WH); tile(ib, 'z', z1, x0, x1, 0, WH, -1, R.wood, 3, WH);
    tile(ib, 'x', x0, z0, z1, 0, WH, 1, R.wood, 3, WH); tile(ib, 'x', x1, z0, z1, 0, WH, -1, R.wood, 3, WH);
    /* wall tops (seen from above) */
    kBox(ib, x0 - .3, 0, z0 - .3, x1 + .3, WH + .02, z0, '#2e1d13', 'ny'); kBox(ib, x0 - .3, 0, z1, x1 + .3, WH + .02, z1 + .3, '#2e1d13', 'ny');
    kBox(ib, x0 - .3, 0, z0, x0, WH + .02, z1, '#2e1d13', 'ny'); kBox(ib, x1, 0, z0, x1 + .3, WH + .02, z1, '#2e1d13', 'ny');
    /* the door with its noren (south wall), the price board and the shop name (north wall) */
    kSign(ib, 'z', z1 - .03, IX - 1.2, IX + 1.2, 0, 2.6, -1, R.noren, '#ffffff');
    kSign(ib, 'z', z0 + .03, IX + 3, IX + 7, 1.7, 3.0, 1, R.menu, '#ffffff');
    kSign(ib, 'z', z0 + .03, IX - 7, IX - 3, 1.7, 3.0, 1, R.menu, '#ffffff');
    /* the self-service bar along the north wall: steel counter, trays of vegetables, balls and sauces, a sneeze guard */
    const BZ0 = z0 + .5, BZ1 = z0 + 1.6;
    kBox(ib, IX - 2.6, 0, BZ0, IX + 2.6, .9, BZ1, '#8d9196'); kFlat(ib, IX - 2.6, BZ0, IX + 2.6, BZ1, .905, '#c8ccd0');
    kSign(ib, 'z', BZ1 + .01, IX - 2.4, IX + 2.4, .15, .75, 1, R.sukiIn, '#ffffff');
    const TRAY = ['#a8d86a', '#7fbf4a', '#f2ead0', '#f4f1e6', '#f2d0d8', '#e8a040', '#c0392b', '#6b3a1e', '#f2c230', '#ffffff'];
    for (let i = 0; i < 10; i++){ const x = IX - 2.35 + i * .5; kBox(ib, x, .905, BZ0 + .2, x + .42, .95, BZ1 - .2, '#5f6368', 'ny'); kBox(ib, x + .03, .95, BZ0 + .24, x + .39, .99, BZ1 - .24, TRAY[i], 'ny'); }
    kBox(ig, IX - 2.6, 1.3, BZ1 - .05, IX + 2.6, 1.32, BZ1, '#ffffff', ''); kBox(ig, IX - 2.6, 1.0, BZ1 - .02, IX + 2.6, 1.32, BZ1, '#ffffff', '');
    /* drinks fridge and the soft-serve machine in the corners */
    kBox(ib, x1 - 1.6, 0, z0, x1 - .2, 2.1, z0 + .8, '#d9dde0'); kSign(ib, 'z', z0 + .81, x1 - 1.5, x1 - .3, .2, 2.0, 1, R.box, '#ffffff');
    kBox(ib, x0 + .3, 0, z0 + .2, x0 + 1.5, 1.0, z0 + 1.0, '#c8ccd0'); kBox(ib, x0 + .55, 1.0, z0 + .35, x0 + 1.25, 1.6, z0 + .85, '#e9e7e2');
    /* booths: a table with an induction hot pot, two benches with high backs */
    for (const [tx, tz] of TABLES){
      const x = IX + tx, z = IZ + tz;
      kBox(ib, x - .9, .7, z - .45, x + .9, .76, z + .45, '#5a3a26'); kBox(ib, x - .08, 0, z - .08, x + .08, .7, z + .08, '#2e1d13', 'ny');
      for (const s of [-1, 1]){
        kBox(ib, x - .95, 0, z + s * .7, x + .95, .45, z + s * 1.15, '#7a1f1a'); kBox(ib, x - .95, .45, z + s * 1.05, x + .95, 1.25, z + s * 1.2, '#7a1f1a');
        kBox(ib, x - .95, 1.25, z + s * 1.0, x + .95, 1.32, z + s * 1.25, '#3b2418');
      }
      iround.push(geoTint(new THREE.CylinderGeometry(.34, .3, .12, 18).translate(x, .82, z), '#2b2b2e'));
      iround.push(geoTint(new THREE.CylinderGeometry(.3, .3, .02, 18, 1, false, 0, PI).translate(x, .875, z), '#8a5a2b'));    /* sukiyaki half */
      iround.push(geoTint(new THREE.CylinderGeometry(.3, .3, .02, 18, 1, false, PI, PI).translate(x, .875, z), '#d9cdb0'));   /* kombu half */
      iround.push(geoTint(new THREE.BoxGeometry(.6, .012, .025).translate(x, .884, z), '#2b2b2e'));
      for (const s of [-1, 1]) iround.push(geoTint(new THREE.CylinderGeometry(.08, .07, .05, 10).translate(x + .55, .785, z + s * .28), '#f4f1ea'));   /* raw-egg dipping bowls */
    }
    /* a few diners in the other booths (the campus student models, seated: head and body only, legs under the table) */
    if (typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined'){
      const SH = ['#c0392b', '#2d5d8a', '#ecf0f1', '#2d8a6e', '#8e44ad', '#e0b020', '#34495e'], SK = ['#f1c9a0', '#d9a77a', '#b07a52', '#f5d7b5'];
      let n = 0;
      TABLES.forEach(([tx, tz], ti) => { if (ti === 1) return; for (const s of [-1, 1]){ if ((ti + (s > 0)) % 3 === 2) continue;
        const m = new THREE.Matrix4().makeRotationY(s > 0 ? PI : 0).setPosition(IX + tx, -.42, IZ + tz + s * .95);
        iround.push(geoTint(npcBodyGeo.clone().applyMatrix4(m), SH[n % SH.length]), geoTint(npcHeadGeo.clone().applyMatrix4(m), SK[n % SK.length])); n++; } });
    }
  }
  const inMat = kMat(A, {roughness:.85, emissive:'#2a2420', emissiveMap:null, emissiveIntensity:1}, false);   /* the shop's own lights: never pitch dark at night */
  const inMesh = kMesh(ib, inMat, IN, false), inGlass = kMesh(ig, kGlass(), IN, false); inGlass.renderOrder = 1;
  { const m = new THREE.Mesh(geoMerge(iround), M('#ffffff', {vertexColors:true, roughness:.55})); m.receiveShadow = true; IN.add(m); }
  /* what is cooking in our pot: six slices / pieces, one instanced mesh */
  const POT_SLOT = [0, 1, 2, 3, 4, 5].map(i => { const a = PI * (i < 3 ? .25 + i * .25 : 1.25 + (i - 3) * .25); return [POT.x + Math.cos(a) * .19, POT.z + Math.sin(a) * .19]; });
  const potIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.075, .075, .03, 10), new THREE.MeshStandardMaterial({roughness:.6}), 6);
  potIM.frustumCulled = false; IN.add(potIM);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  for (let k = 0; k < 6; k++){ _m4.makeScale(0, 0, 0); potIM.setMatrixAt(k, _m4); potIM.setColorAt(k, _c.set('#ffffff')); }   /* the colour buffer exists before the first draw */
  /* colliders inside (switched on only while you are in) */
  const inCols = [];
  { const c = (x0, z0, x1, z1) => { const o = addBox(IX + (x0 + x1) / 2, IZ + (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0); o.dead = true; inCols.push(o); };
    c(-RW - 1, -RD - 1, RW + 1, -RD); c(-RW - 1, RD, RW + 1, RD + 1); c(-RW - 1, -RD, -RW, RD); c(RW, -RD, RW + 1, RD);
    c(-2.6, -RD, 2.6, -RD + 1.6); c(RW - 1.6, -RD, RW, -RD + .8); c(-RW, -RD, -RW + 1.5, -RD + 1.0);
    for (const [tx, tz] of TABLES) c(tx - .95, tz - 1.25, tx + .95, tz + 1.25); }
  const exitMark = gxMarker('#4fd18b', .28); exitMark.position.set(EXIT.x, .05, EXIT.z); exitMark.visible = false;
  exitMark.children.forEach(c => { if (c !== exitMark.userData.ring) c.visible = false; });
  const exitLbl = addLabel('出门', EXIT.x, 2.4, EXIT.z, true); exitLbl.dead = true;

  /* ================= the buffet: menu, state, the hot-pot game ================= */
  const PRICE = () => opNight() ? 48.8 : 39.8;
  const FOOD = [
    {id:'beef', n:'肥牛', meat:1, cook:2.5, ok:3, fill:6, rm:6.5, col:'#d4606f', done:'#9a6a5a'},
    {id:'lamb', n:'羊肉片', meat:1, cook:3, ok:3, fill:6, rm:6, col:'#d97a78', done:'#9a7468'},
    {id:'chick', n:'鸡肉片', meat:1, cook:5, ok:4, fill:6, rm:3.5, col:'#f2c9b0', done:'#e8dcc8'},
    {id:'cab', n:'白菜', cook:2, ok:6, fill:3, rm:.8, col:'#b8e07a', done:'#8fbf5a'},
    {id:'enoki', n:'金针菇', cook:2, ok:6, fill:2, rm:1, col:'#f4ecd2', done:'#e0d4b0'},
    {id:'tofu', n:'豆腐', cook:3, ok:8, fill:3, rm:1, col:'#f7f3e6', done:'#efe4c8'},
    {id:'fish', n:'鱼饼', cook:3, ok:6, fill:3, rm:1.8, col:'#f5d3dc', done:'#ecc0c8'},
    {id:'udon', n:'乌冬', cook:4, ok:8, fill:14, rm:2.5, col:'#f4e8c8', done:'#e6d4a6'}
  ];
  /* meat pays (about RM 1 per point of fullness), the self-service bar fills you up cheaply: the classic buffet choice */
  const WAGYU = {id:'wagyu', n:'和牛', meat:1, cook:2, ok:2.5, fill:4, rm:14, col:'#e88a96', done:'#a87068', gold:1};
  const DUR = 60, MEAT_CD = 4, OVER = 4, CHEW = .45;
  /* 腻: every plate of meat adds one, anything else takes two off; from the fourth plate of meat in a row each one is worth less */
  const greaseK = n => Math.max(.4, 1 - .15 * Math.max(0, n - 3));
  const MEDALS = [[90, '吃货之王', '#e3b95a'], [65, '赚到了', '#b8c2cc'], [0, '吃回本', '#c98a55']];
  if (typeof achAdd === 'function') achAdd([['ioi1', '周末去 IOI', '在 IOI City Mall 吃一次 SUKI-YA 火锅放题', 20], ['sukiback', '吃回本', 'SUKI-YA 放题吃回自助餐的钱', 40],
    ['sukiking', '吃货之王', 'SUKI-YA 一顿吃回 RM 90 以上', 80]]);
  if (typeof GX_MORE !== 'undefined') GX_MORE.push({id:'o_suki', name:'SUKI-YA 一顿吃回', fmt:v => 'RM ' + (+v).toFixed(2)});
  const SK = {in:false, near:false, exitNear:false, g:null, msg:'', lbl:'', full:0, fullK:0, keep:null, paid:0, eaten:false};
  const RING = opSpot('#e2342f', .7, SUKI.x, SUKI.z, 'SUKI-YA 火锅放题 · 按 F', 4.2);
  { const st = document.createElement('style'); st.textContent = `
#opPanel.sk-low{top:auto;bottom:10px;transform:translateX(-50%);max-height:min(74%,600px)}
@media (min-width: 900px){ #opPanel.sk-low{left:16px;bottom:16px;transform:none;width:430px;max-height:calc(100% - 120px)} }
.sk-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;font-variant-numeric:tabular-nums}
.sk-top b{font-family:var(--display);font-size:16px}
.sk-row{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.sk-row .tea-bar{flex:1;margin:4px 0}
.sk-row .tea-bar.full i{background:#e0a020}
.sk-row .tea-bar.grease i{background:#c9a227}
.sk-pot{position:relative;width:176px;height:176px;margin:18px auto 2px;border-radius:50%;box-sizing:border-box;border:9px solid #2b2b2e;
  background:linear-gradient(90deg,#8a5a2b 0 49%,#2b2b2e 49% 51%,#d9cdb0 51%)}
.sk-pot::before,.sk-pot::after{position:absolute;top:-27px;font-size:11px;font-weight:700;color:var(--muted)}
.sk-pot::before{content:'寿喜烧';left:22px}.sk-pot::after{content:'昆布汤';right:22px}
.sk-slot{position:absolute;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:2px dashed rgba(255,255,255,.55);background:rgba(0,0,0,.08);
  color:#2b2f36;font:700 12.5px/1.1 inherit;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;touch-action:manipulation;padding:0;
  text-shadow:0 0 3px #fff,0 0 3px #fff}
.sk-slot.on{border:0}
.sk-slot.ready{box-shadow:0 0 0 3px #4fd18b;animation:skPulse .5s infinite alternate}
.sk-slot.over{box-shadow:0 0 0 3px #e0a020}
@keyframes skPulse{to{transform:scale(1.08)}}
.sk-msg{min-height:18px;font-size:13px;text-align:center;color:var(--muted)}
.sk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:4px}
.sk-grid button{position:relative;overflow:hidden;min-height:46px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);
  font:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px}
.sk-grid button small{font-size:10.5px;font-weight:400;color:var(--muted)}
.sk-grid button i{position:absolute;left:0;bottom:0;height:4px;background:var(--tile)}
.sk-grid button[disabled]{opacity:.45;cursor:default}
.sk-grid button.gold{background:#f2c230;color:#2b2f36;border-color:#b8860b;grid-column:span 4}
.sk-grid button.gold[hidden]{display:none}
.sk-eat{width:100%;margin-top:6px;min-height:44px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation}
.sk-big{font-family:var(--display);font-size:30px;text-align:center;margin:6px 0 2px}
@media (prefers-reduced-motion: reduce){ .sk-slot.ready{animation:none} }`; document.head.appendChild(st); }

  /* ---- going in and out ---- */
  function skEnter(){
    if (mode !== 'naiwa') setMode('naiwa');
    if (driving) leaveCar();
    SK.in = true; SK.keep = {dist:camDist, pitch:camPitch}; SK.eaten = false;
    window.XINDOOR = 'sukiya'; window.XINDOOR_AT = Object.assign({}, DOOR_OUT);
    for (const c of inCols) c.dead = false;
    IN.visible = true; exitMark.visible = true; exitLbl.dead = false; RING.lbl.dead = true; RING.mark.visible = false;
    skSit();
  }
  function skSit(){
    Object.assign(nw, {x:SEAT.x, z:SEAT.z, y:.46, h:SEAT.h, air:false, vy:0, spd:0, state:'sit', bike:false});
    camYaw = SEAT.h + PI + .75; camDist = 4.6; camPitch = 1.0; SK.seated = true;   /* over the right shoulder, so the pot shows */
  }
  function skStand(){
    SK.seated = false;
    Object.assign(nw, {x:IX, z:IZ - .1, y:0, h:0, air:false, vy:0, spd:0, state:'idle'});   /* the aisle between the two rows of booths */
    camDist = 9; camPitch = 1.0;
  }
  function skLeave(quiet){
    if (!SK.in) return;
    if (SK.g) skEnd(true, true);
    if (opUI.on) opClose(true);
    opPanel.classList.remove('sk-low');
    SK.in = false; SK.seated = false; IN.visible = false; exitMark.visible = false; exitLbl.dead = true; window.XINDOOR = null; window.XINDOOR_AT = null;
    for (const c of inCols) c.dead = true;
    if (SK.keep){ camDist = SK.keep.dist; camPitch = SK.keep.pitch; SK.keep = null; }
    Object.assign(nw, {x:DOOR_OUT.x, z:DOOR_OUT.z, h:DOOR_OUT.h, air:false, vy:0, spd:0}); nw.y = groundAt(nw.x, nw.z); camYaw = DOOR_OUT.h;
    RING.rearm = true;
    if (quiet) { if (nw.state !== 'idle') nw.state = 'idle'; return; }
    if (SK.eaten){ nw.state = 'laugh'; nw.t = 0; if (sfx.laugh) sfx.laugh(); } else { nw.state = 'idle'; sfx.ding(); }
  }
  /* ---- the door: pay and go in ---- */
  function skOffer(){
    const p = PRICE(), night = opNight();
    opOpen('🍲 SUKI-YA · 寿喜烧涮涮锅放题',
      `<p class="op-note">IOI City Mall 里同学们最常来的一家：一锅两种汤底，肉叫店员上，菜和丸子自助。${night ? '现在是晚市。' : '现在是午市。'}吃到的东西按单点的价钱算，看你能不能吃回本。</p>` +
      `<button type="button" class="op-card" data-i="0"><kbd>1</kbd><b>进去吃 · ${fmtRM(p)}</b><span>${night ? '晚市' : '平日午市'}一位 · 店里 60 秒涮到饱${prog.best.o_suki != null ? ` · 纪录吃回 ${fmtRM(prog.best.o_suki)}` : ''}</span></button>` +
      `<button type="button" class="op-card" data-i="1"><kbd>2</kbd><b>算了</b><span>下次再来（不是 KLIA 那家卖牛丼的すき家）</span></button>`,
      code => { if (code === 'Digit1' || code === 'Numpad1' || code === 'KeyF') skPay(); else if (code === 'Digit2' || code === 'Numpad2') opClose(); });
    for (const el of document.querySelectorAll('#opBody .op-card')) el.addEventListener('click', () => (+el.dataset.i ? opClose() : skPay()));
  }
  function skPay(){
    const p = PRICE();
    if (money < p){ opClose(true); toast('钱不够', `放题一位 ${fmtRM(p)}，先去送几单外卖吧`, 2400); RING.rearm = true; return; }
    opClose(true); money -= p; moneyChanged(); SK.paid = p;
    sfx.ding(); skEnter(); unlock('ioi1');
    gxCallout('いらっしゃいませ！', `SUKI-YA · ${fmtRM(p)} · 两种汤底：寿喜烧 + 昆布`, '#e2342f');
    setTimeout(() => { if (SK.in && !SK.g && !opUI.on) skGame(); }, 900);
  }
  /* ---- the game ---- */
  const $id = id => document.getElementById(id);
  function skGame(){
    if (SK.g) return;
    skSit();
    const g = SK.g = {left:DUR, fill:0, rm:0, plates:0, burnt:0, over:0, slots:[null, null, null, null, null, null], grease:0, meatCd:0, chew:0, wagyu:0, wagyuAt:14 + Math.random() * 6, msg:'', msgT:0, last:performance.now(), why:''};
    opOpen('🍲 SUKI-YA · 涮到饱',
      `<div class="sk-top"><span id="skT">${DUR} 秒</span><b id="skV"></b><span id="skP">0 盘</span></div><div class="tea-bar"><i id="skTB"></i></div>
       <div class="sk-row">饱<div class="tea-bar full"><i id="skFB" style="width:0"></i></div></div>
       <div class="sk-row">腻<div class="tea-bar grease"><i id="skGB" style="width:0"></i></div><span id="skGM" style="min-width:42px;text-align:right">不腻</span></div>
       <div class="sk-pot" id="skPot">${POT_UI.map(([l, t], i) => `<button type="button" class="sk-slot" data-s="${i}" style="left:${l}%;top:${t}%"></button>`).join('')}</div>
       <div class="sk-msg" id="skMsg">点下面的食材下锅，转圈变绿就夹起来吃</div>
       <div class="sk-grid" id="skG">${FOOD.map((f, i) => `<button type="button" data-f="${i}">${f.n}<small>${f.meat ? '肉 · ' : ''}${f.cook} 秒熟</small><i></i><kbd hidden>${i + 1}</kbd></button>`).join('')}
         <button type="button" class="gold" data-f="8" hidden>✨ 限时和牛！店员刚端来 <small>按 9</small></button></div>
       <button type="button" class="sk-eat" id="skE">夹起来吃 ${TOUCH ? '' : '<kbd>空格</kbd>'}</button>
       <p class="op-note" style="margin-top:6px">按单点价算：肉最值钱（肥牛 RM 6.5、和牛 RM 14），菜、丸子、乌冬便宜又占肚子；连吃三盘肉会腻，夹口菜解腻。肉每 ${MEAT_CD} 秒上一盘，熟了快吃，煮老只算四成。${TOUCH ? '' : '键盘 1–8 下锅、空格吃。'}</p>`,
      code => { const m = /^(Digit|Numpad)([1-9])$/.exec(code); if (m) skAdd(+m[2] - 1); else if (code === 'Space' || code === 'Enter' || code === 'KeyF') skEatBest(); },
      () => skEnd(true), skTick);
    opPanel.classList.add('sk-low');
    $id('skG').addEventListener('pointerdown', e => { const el = e.target.closest('[data-f]'); if (el){ e.preventDefault(); skAdd(+el.dataset.f); } });
    $id('skPot').addEventListener('pointerdown', e => { const el = e.target.closest('[data-s]'); if (el){ e.preventDefault(); skEat(+el.dataset.s); } });
    $id('skE').addEventListener('pointerdown', e => { e.preventDefault(); skEatBest(); });
    skDraw();
  }
  const POT_UI = [[30, 24], [20, 50], [30, 76], [70, 24], [80, 50], [70, 76]];   /* slot spots in the drawn pot (%), the left three are the sukiyaki half */
  const stOf = s => s.t < s.f.cook ? 'raw' : s.t < s.f.cook + s.f.ok ? 'ready' : 'over';
  function skSay(t){ const g = SK.g; if (!g) return; g.msg = t; g.msgT = 2.2; }
  function skAdd(i){
    const g = SK.g; if (!g) return; ac();
    const f = i === 8 ? (g.wagyu > 0 ? WAGYU : null) : FOOD[i]; if (!f) return;
    if (f.meat && !f.gold && g.meatCd > 0){ skSay('肉还在切，等一下'); tone('square', 220, 180, .08, .05); return; }
    const k = g.slots.indexOf(null); if (k < 0){ skSay('锅里满了，先吃掉一些'); tone('square', 220, 180, .08, .05); return; }
    g.slots[k] = {f, t:0};
    if (f.gold) g.wagyu = 0; else if (f.meat) g.meatCd = MEAT_CD;
    tone('triangle', 420 + k * 40, 380 + k * 40, .08, .07); noise(.12, .05, 1800, 'highpass');
    skDraw();
  }
  function skEat(k){
    const g = SK.g; if (!g) return; ac();
    const s = g.slots[k]; if (!s) return;
    const st = stOf(s);
    if (st === 'raw'){ skSay(s.f.meat ? `${s.f.n}还是生的！` : `${s.f.n}还没熟`); tone('square', 200, 150, .1, .06); return; }
    if (g.chew > 0) return;
    const gm = s.f.meat ? greaseK(g.grease) : 1, v = (st === 'over' ? s.f.rm * .4 : s.f.rm) * gm;
    g.slots[k] = null; g.rm += v; g.fill += s.f.fill; g.plates++; g.chew = CHEW; if (st === 'over') g.over++;
    g.grease = s.f.meat ? g.grease + 1 : Math.max(0, g.grease - 2);
    skSay(st === 'over' ? `${s.f.n}煮老了… +${fmtRM(v)}` : gm < 1 ? `${s.f.n}有点腻了 +${fmtRM(v)}（吃口菜解腻）` : s.f.gold ? `和牛入口即化！+${fmtRM(v)}` :
      `${s.f.n} +${fmtRM(v)}${s.f.id === 'udon' ? ' · 好占肚子' : !s.f.meat && g.grease === 0 ? ' · 解腻' : ''}`);
    tone('triangle', st === 'over' ? 520 : 760, st === 'over' ? 440 : 990, .1, .09);
    if (g.fill >= 100){ g.fill = 100; g.why = 'full'; skEnd(false); return; }
    skDraw();
  }
  function skEatBest(){
    const g = SK.g; if (!g) return;
    let best = -1, bt = -1;
    g.slots.forEach((s, k) => { if (!s) return; const st = stOf(s); if (st === 'raw') return; const t = (st === 'over' ? 100 : 0) + s.t - s.f.cook; if (t > bt){ bt = t; best = k; } });
    if (best >= 0) skEat(best); else skSay('锅里还没有熟的');
  }
  function skDraw(){
    const g = SK.g; if (!g) return;
    $id('skT').textContent = Math.max(0, Math.ceil(g.left)) + ' 秒'; $id('skTB').style.width = Math.max(0, g.left / DUR * 100) + '%';
    const back = g.rm >= SK.paid;
    $id('skV').textContent = `吃回 ${fmtRM(g.rm)} / ${fmtRM(SK.paid)}`; $id('skV').style.color = back ? 'var(--ok)' : '';
    $id('skP').textContent = g.plates + ' 盘'; $id('skFB').style.width = g.fill + '%';
    { const gk = greaseK(g.grease); $id('skGB').style.width = Math.min(100, g.grease / 6 * 100) + '%'; $id('skGM').textContent = gk < 1 ? '肉 ×' + gk.toFixed(2) : g.grease >= 3 ? '再吃就腻' : '不腻'; }
    const slots = document.querySelectorAll('#skPot .sk-slot');
    g.slots.forEach((s, k) => {
      const el = slots[k]; if (!el) return;
      if (!s){ el.className = 'sk-slot'; el.textContent = ''; el.style.background = ''; return; }
      const st = stOf(s), f = s.f;
      const p = st === 'raw' ? s.t / f.cook : st === 'ready' ? 1 - (s.t - f.cook) / f.ok : 1 - (s.t - f.cook - f.ok) / OVER;
      const ring = st === 'raw' ? '#e8423a' : st === 'ready' ? '#4fd18b' : '#e0a020';
      el.className = 'sk-slot on ' + st; el.textContent = f.n;
      el.style.background = `radial-gradient(circle, ${st === 'raw' ? f.col : f.done} 0 60%, transparent 62%), conic-gradient(${ring} ${Math.max(0, Math.min(1, p)) * 100}%, rgba(0,0,0,.35) 0)`;
    });
    const btns = document.querySelectorAll('#skG [data-f]');
    btns.forEach(el => { const i = +el.dataset.f;
      if (i === 8){ el.hidden = !(g.wagyu > 0); return; }
      const f = FOOD[i], cd = f.meat ? g.meatCd : 0; el.disabled = cd > 0; el.querySelector('i').style.width = cd > 0 ? (1 - cd / MEAT_CD) * 100 + '%' : '0'; });
    $id('skMsg').textContent = g.msgT > 0 ? g.msg : g.slots.some(s => s && stOf(s) === 'ready') ? '熟了！快夹起来吃' : g.slots.every(s => !s) ? '锅里空着，下点东西' : '煮着呢…';
  }
  function skTick(now){
    const g = SK.g; if (!g) return;
    const dt = Math.min(.1, (now - g.last) / 1000); g.last = now;
    g.left -= dt; g.meatCd = Math.max(0, g.meatCd - dt); g.chew = Math.max(0, g.chew - dt); g.msgT -= dt;
    g.wagyuAt -= dt; if (g.wagyuAt <= 0){ g.wagyuAt = 16 + Math.random() * 8; g.wagyu = 6; skSay('✨ 店员端来一盘限时和牛！'); tone('triangle', 880, 1320, .2, .1); }
    if (g.wagyu > 0) g.wagyu = Math.max(0, g.wagyu - dt);
    g.slots.forEach((s, k) => { if (!s) return; s.t += dt; if (s.t > s.f.cook + s.f.ok + OVER){ g.slots[k] = null; g.burnt++; skSay(`${s.f.n}煮烂了，捞掉`); tone('sawtooth', 240, 140, .2, .05); } });
    /* the 3D pot behind the panel */
    for (let k = 0; k < 6; k++){
      const s = g.slots[k], [x, z] = POT_SLOT[k];
      _s.setScalar(s ? (s.f.meat ? 1.1 : .85) : 0); _q.setFromAxisAngle(UP, now / 900 + k);
      _v.set(x, POT.y + .015 + Math.sin(now / 160 + k * 1.7) * .006, z); _m4.compose(_v, _q, _s); potIM.setMatrixAt(k, _m4);
      if (s) potIM.setColorAt(k, _c.set(stOf(s) === 'raw' ? s.f.col : s.f.done));
    }
    potIM.instanceMatrix.needsUpdate = true; if (potIM.instanceColor) potIM.instanceColor.needsUpdate = true;
    /* Naiwa eating: right hand from the pot to the mouth while chewing */
    if (NW && NW.arms){ const k = g.chew > 0 ? Math.sin((1 - g.chew / CHEW) * PI) : 0, [, aR] = NW.arms, [, eR] = NW.elbows || []; aR.rotation.x = -.75 - k * 1.1; if (eR) eR.rotation.x = -.75 - k * 1.1; NW.mouth.scale.y = .02 + k * .07; }
    if (g.left <= 0){ g.left = 0; g.why = 'time'; skEnd(false); return; }
    skDraw();
  }
  function skEnd(quit, silent){
    const g = SK.g; if (!g) return;
    SK.g = null; opPanel.classList.remove('sk-low'); if (opUI.on) opClose(true);
    potIM.count = 6; for (let k = 0; k < 6; k++){ _m4.makeScale(0, 0, 0); potIM.setMatrixAt(k, _m4); } potIM.instanceMatrix.needsUpdate = true;
    SK.eaten = g.plates > 0;
    if (g.plates > 0){ SK.full = 120; SK.fullK = Math.max(.35, g.fill / 100); }
    if (silent){ skStand(); return; }
    const v = Math.round(g.rm * 100) / 100, back = v >= SK.paid, prev = prog.best.o_suki, rec = g.plates > 0 && (prev == null || v > prev);
    if (rec){ prog.best.o_suki = v; saveGame(); }
    const md = back ? MEDALS.find(m => v >= m[0] && (m[0] > 0 || back)) : null;
    if (back) unlock('sukiback'); if (v >= MEDALS[0][0]) unlock('sukiking');
    const why = quit ? '不吃了' : g.why === 'full' ? '吃撑了！' : '时间到';
    opOpen(md ? `🍲 ${md[1]}！` : '🍲 ' + why,
      `<div class="sk-big" style="color:${back ? 'var(--ok)' : 'var(--ink)'}">吃回 ${fmtRM(v)}</div>
       <p class="op-note" style="text-align:center">${why} · 付了 ${fmtRM(SK.paid)} · ${back ? `赚了 ${fmtRM(v - SK.paid)}` : `还差 ${fmtRM(SK.paid - v)} 回本`}<br>
       吃了 ${g.plates} 盘${g.over ? `（${g.over} 盘煮老了）` : ''}${g.burnt ? ` · 煮烂 ${g.burnt} 盘` : ''} · 饱腹 ${Math.round(g.fill)}%${rec && prev != null ? ' · 新纪录！' : prev != null ? ` · 纪录 ${fmtRM(prev)}` : ''}</p>
       <button type="button" class="op-card" id="skUp"><b>起身</b><span>吃饱了，在店里走走，门口绿圈出门</span></button>`,
      code => { if (code === 'KeyF' || code === 'Space' || code === 'Enter') opClose(); }, () => skStand());
    $id('skUp').addEventListener('click', () => opClose());
    if (md){ gxCallout(md[1], `吃回 ${fmtRM(v)}`, md[2]); opFanfare(); } else gxChime(0);
    if (g.plates > 0) for (let k = 0; k < 6; k++) spawnPart('heart', nw.x + (Math.random() - .5), 2 + Math.random(), nw.z + (Math.random() - .5), .7, {vy:2, life:1.1, op:1, color:'#ff7a6a'});
  }

  /* ================= per frame: the door ring, the exit, the full belly ================= */
  function update(dt, px, pz){
    SK.msg = '';
    if (SK.full > 0){ SK.full -= dt; if (SK.full <= 0){ SK.full = 0; gxCallout('消化完了', '下次再去 IOI 吃', '#9fd8ff'); } }
    const was = SK.near || SK.exitNear; SK.near = SK.exitNear = false;
    if (SK.in){
      if (!SK.g && !opUI.on && Math.hypot(nw.x - EXIT.x, nw.z - EXIT.z) < 1.4){ SK.exitNear = true; SK.msg = TOUCH ? '点「出门」回到商场门口' : '按 F 出门 · 回到 IOI City Mall 门口'; opSetF('出门'); }
      else if (!SK.g && !opUI.on) SK.msg = SK.eaten ? '吃饱了 · 走到门口绿圈出门' : '门口绿圈出门';
      exitMark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    } else {
      const other = mission.on || !!gxA.act || gxTaxi.on || (typeof EX !== 'undefined' && EX.on) || (typeof ROOM !== 'undefined' && ROOM.in) || !!window.XINDOOR || gx.busy();
      if (opRing(RING, !other && Math.abs(px - SUKI.x) < 360 && Math.abs(pz - SUKI.z) < 360, px, pz)){
        if (driving) SK.msg = '下车走进红圈，吃 SUKI-YA 火锅放题';
        else if (nw.state !== 'fly' && !nw.air){ SK.near = true; SK.msg = TOUCH ? `点「吃火锅」· 放题 ${fmtRM(PRICE())}` : `按 F 吃 SUKI-YA 火锅放题 · ${fmtRM(PRICE())}`; opSetF('吃火锅'); }
      }
    }
    if (was && !SK.near && !SK.exitNear && (opFBtn === '吃火锅' || opFBtn === '出门')) opSetF('');
  }
  if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){
    if (SK.exitNear && !opUI.on){ skLeave(); return true; }
    if (SK.near && !driving && nw.state !== 'fly' && !opUI.on){ skOffer(); return true; }
    return base(); }; }
  /* seated at the pot: stay on the bench (the panel opens a moment later), no jumping */
  if (typeof updateFoot === 'function'){ const base = updateFoot; updateFoot = function(dt){
    if (!SK.seated) return base(dt);
    Object.assign(nw, {x:SEAT.x, z:SEAT.z, y:.46, h:SEAT.h, state:'sit', bike:false, spd:0, vy:0, air:false}); }; }
  if (typeof footAction === 'function'){ const base = footAction; footAction = function(k){ if (SK.seated) return; base(k); }; }
  /* a full belly for two minutes after eating (looks only), laughing on the way out */
  if (typeof animNaiwa === 'function'){ const base = animNaiwa; animNaiwa = function(dt, T){ base(dt, T);
    const k = SK.full > 0 ? Math.min(1, SK.full / 15) * SK.fullK : 0;
    if (NW && NW.belly){ if (k > 0){ NW.belly.scale.z *= 1 + .5 * k; NW.belly.scale.x = 1 + .14 * k; SK.bx = true; } else if (SK.bx){ NW.belly.scale.x = 1; SK.bx = false; } }
  }; }
  /* the minimap while inside: the room's plan */
  if (typeof drawMini === 'function'){ const base = drawMini; drawMini = function(cx, cz, yaw, o){
    if (!SK.in || mode !== 'naiwa' || (o && o.g)) return base(cx, cz, yaw, o);
    const G = mini.getContext('2d'), Sw = G.canvas.width, Sh = G.canvas.height, k = Math.min(Sw, Sh) / 22, X = x => Sw / 2 + (x - IX) * k, Z = z => Sh / 2 + (z - IZ) * k;
    G.fillStyle = '#262a31'; G.fillRect(0, 0, Sw, Sh); G.fillStyle = '#b07a4c'; G.fillRect(X(IX - RW), Z(IZ - RD), RW * 2 * k, RD * 2 * k);
    G.fillStyle = '#8d9196'; G.fillRect(X(IX - 2.6), Z(IZ - RD + .5), 5.2 * k, 1.1 * k);
    for (const [tx, tz] of TABLES){ G.fillStyle = '#7a1f1a'; G.fillRect(X(IX + tx - .95), Z(IZ + tz - 1.2), 1.9 * k, 2.4 * k); G.fillStyle = '#5a3a26'; G.fillRect(X(IX + tx - .9), Z(IZ + tz - .45), 1.8 * k, .9 * k); }
    G.fillStyle = '#4fd18b'; G.beginPath(); G.arc(X(EXIT.x), Z(EXIT.z), .9 * k, 0, 7); G.fill();
    G.save(); G.translate(X(nw.x), Z(nw.z)); G.rotate(-yaw); G.fillStyle = '#1f2a33'; G.strokeStyle = '#ffffff'; G.lineWidth = 2.5;
    G.beginPath(); G.moveTo(0, -12); G.lineTo(8, 9); G.lineTo(0, 4); G.lineTo(-8, 9); G.closePath(); G.stroke(); G.fill(); G.restore();
  }; }
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); update(dt, px, pz); },
      busy(){ return base.busy() || SK.in; },
      extBusy(){ return (base.extBusy ? base.extBusy() : false) || SK.in; },
      prompt(){ return SK.msg || base.prompt(); },
      target(){ return SK.in ? {x:EXIT.x, z:EXIT.z, label:'SUKI-YA 出门'} : base.target(); },
      mini(dot){ base.mini(dot); if (!SK.in && !gx.busy() && !mission.on) dot(SUKI.x, SUKI.z, '#c2185b', 6); },
      frame(dt, T){ if (base.frame) base.frame(dt, T); mallMat.emissiveIntensity = Math.max(cur.win, wx.rain * .5); },
      onBust(){ skLeave(true); base.onBust(); },
      leave(){ skLeave(true); opHide(RING); RING.rearm = false; SK.near = SK.exitNear = false; base.leave(); }
    });
  }
  window.XIOI = {CX, MB, LOT, ROAD, SUKI, PAD, MALL, SK, FOOD, RING, enter:skEnter, leave:skLeave, offer:skOffer, pay:skPay, game:skGame, add:skAdd, eat:skEat, eatBest:skEatBest, end:skEnd,
    /* tests: stand at the ring / jump inside */
    goDoor(){ if (mode !== 'naiwa') setMode('naiwa'); if (driving) leaveCar(); nw.x = SUKI.x; nw.z = SUKI.z + 3; nw.y = groundAt(nw.x, nw.z); nw.h = PI; camYaw = 0; }};
})();
