/* XMUM 校园漫游 · Bell Avenue 西头的 24 小时嘛嘛档 Al-Hajeera（照小红书上的实拍还原）
 *   店：Bell 那排店屋最西头的两间（北排朝大路、南排朝后巷），西墙整面开成店面：黑底金字的招牌、一排马来西亚小国旗、
 *     深色百叶顶棚伸出来盖住门口，顶棚下是煎 Roti Canai 的铁板台和玻璃熟食柜。
 *   露天大排档：店西边那块空地（喷漆车间往西挪了 8 米，js/13-outskirts.js），灰色石砖地，黑面黄边的桌子（也有红、蓝桌面）、
 *     黑色塑料椅、收起来的黑伞；西头立一块露天大屏幕（F1、网球、自然纪录片轮着放），两边音箱；
 *     头顶拉着一串串暖黄灯泡（用路灯的 bulbMat，天黑自己亮），边上几棵树、铁栏杆，外面是草地和后巷。
 *   玩法：
 *     · 外卖取餐点「Al-Hajeera 嘛嘛档」（js/50-missions.js 的 PICKUPS，跨区单照 js/89-outskirts-play.js 的算法）。
 *     · 坐下吃：走到任何一张空椅子旁按 F（手机点「坐下」）坐下点餐，六样招牌（拉茶、Roti Canai、塔饼、Maggi Goreng、Nasi Kandar、美禄恐龙），
 *       坐着按 F 再点一份，走两步（或跳）就起身。六样都吃过一遍有成就；坐着放空 45 秒也有一个（「不想学习就去 Mamak 放空」）。
 *       跟夜市大胃王（js/minigames/bigeat.js）不冲突：那边在后巷夜市，这边是安安静静坐着吃。
 *   画面：店面、招牌、菜单、地砖都画在这个文件自己的一张贴图上（Bell 的招牌图集已经满了），整个大排档一个网格，
 *     灯泡一个 InstancedMesh，大屏幕一个网格，树一个，人一个；手机上桌子少一些、不投影。
 *   新全局：MMK、MMK_*、MMR、mmk*、mamakInfo（存档：prog.best.o_mk 吃过哪几样，位掩码；不新增 localStorage 键，不改数据库规则）。 */
'use strict';
const MMK_SHOP = {x:142, zN0:318.1, zMid:335.1, zS1:351.9};            /* the block's west wall, the two units' glass fronts */
const MMK_CAN = {x0:135, x1:141.9, z0:315.7, z1:354.4, y:3.75};       /* the canopy */
const MMK_SCR = {x:110.5, z:347, w:6.4, h:3.6, y:3.2};                  /* the outdoor screen, facing east over the tables */
const MMK_MENU = [
  {id:'tea',   name:'拉茶 Teh Tarik',     rm:2.5, col:'#c8935a', cup:true, line:'拉得起泡，甜'},
  {id:'canai', name:'Roti Canai',         rm:1.8, col:'#e7c27a', line:'配一碟咖喱，手撕着吃'},
  {id:'tower', name:'塔饼（炼乳夹心）',   rm:4.5, col:'#f0d79a', line:'外酥里软，炼乳流出来'},
  {id:'maggi', name:'Maggi Goreng 炒面',  rm:6,   col:'#d9a03a', line:'加蛋加辣，厨房小哥现炒'},
  {id:'nasi',  name:'Nasi Kandar 咖喱饭', rm:9,   col:'#c9622c', line:'饭上浇满三种咖喱'},
  {id:'milo',  name:'美禄恐龙 Milo Dinosaur', rm:5, col:'#5a3a24', cup:true, line:'冰美禄上再堆一层美禄粉'}
];
const mamakInfo = {name:'Al-Hajeera 嘛嘛档', tag:'餐饮', spawn:[128, 314, Math.PI],
  desc:'Bell Avenue 西头的 24 小时 Nasi Kandar 嘛嘛档，正对着学校。门口一大片露天座位，晚上七八点人最多：拉茶、Roti Canai、Maggi Goreng，大屏幕放 F1 和网球。走到空椅子旁按 F 坐下点餐。'};

/* ---------- one texture for the shop (its own: the Bell sign atlas is full) ---------- */
const MMK_L = 1024, MMK_K = XQ.cfg.tex >= 512 ? 1 : .5;
const mmkCv = document.createElement('canvas'), mmkEv = document.createElement('canvas');
mmkCv.width = mmkCv.height = MMK_L * MMK_K; mmkEv.width = mmkEv.height = MMK_L * MMK_K / 2;
const mmkTex = new THREE.CanvasTexture(mmkCv), mmkGlowTex = new THREE.CanvasTexture(mmkEv); mmkTex.anisotropy = ANISO;
/* same layout rules as the Bell atlas (AR in js/13-outskirts.js): 1024 layout units, the top-left corner white so untextured faces (SOLID_UV) are plain */
const MMR = (x, y, w, h) => ({u0:(x + 2) / MMK_L, u1:(x + w - 2) / MMK_L, v0:1 - (y + h - 2) / MMK_L, v1:1 - (y + 2) / MMK_L});
const MMK_R = {sign:MMR(0, 32, 1024, 128), shopA:MMR(0, 160, 512, 256), shopB:MMR(512, 160, 512, 256), flags:MMR(0, 416, 512, 48),
  pave:MMR(512, 416, 128, 128), louver:MMR(640, 416, 128, 128), menu:MMR(768, 416, 256, 384), badge:MMR(0, 480, 128, 128)};
const MMK_SCRIPT = '"Segoe Script","Brush Script MT","Lucida Handwriting","Apple Chancery",cursive';
function mmkPaint(){
  const g = mmkCv.getContext('2d'), e = mmkEv.getContext('2d'), R = mkRng(4417);
  g.setTransform(MMK_K, 0, 0, MMK_K, 0, 0); e.setTransform(MMK_K / 2, 0, 0, MMK_K / 2, 0, 0);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, MMK_L, MMK_L); e.fillStyle = '#000000'; e.fillRect(0, 0, MMK_L, MMK_L);
  const both = f => { f(g, false); f(e, true); };
  const gold = (c, y0, y1) => { const gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff1a8'); gr.addColorStop(.45, '#f2c230'); gr.addColorStop(1, '#b8860b'); return gr; };
  /* the sun-and-moon "BUKA 24 JAM" badge */
  const badge = (c, cx, cy, r, em) => {
    c.fillStyle = em ? '#2a2410' : '#111111'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
    c.strokeStyle = '#f2c230'; c.lineWidth = r * .08; c.stroke();
    c.fillStyle = '#ffcf3a'; c.beginPath(); c.arc(cx - r * .18, cy - r * .1, r * .36, Math.PI * .5, Math.PI * 1.5); c.fill();
    for (let k = 0; k < 7; k++){ const a = Math.PI * .5 + k * Math.PI / 6; c.fillRect(cx - r * .18 + Math.cos(a) * r * .5 - r * .04, cy - r * .1 + Math.sin(a) * r * .5 - r * .04, r * .08, r * .08); }
    c.fillStyle = '#f4f1ea'; c.beginPath(); c.arc(cx + r * .02, cy - r * .1, r * .34, -Math.PI * .5, Math.PI * .5); c.fill();
    c.fillStyle = em ? '#2a2410' : '#111111'; c.beginPath(); c.arc(cx + r * .14, cy - r * .1, r * .28, -Math.PI * .5, Math.PI * .5); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${r * .22}px ${OUT_FONT}`; c.fillText('BUKA', cx, cy + r * .42); c.font = `900 ${r * .3}px ${OUT_FONT}`; c.fillText('24 JAM', cx, cy + r * .7);
  };
  /* name board: RESTORAN / NASI KANDAR, the gold script name, the 24 JAM badge */
  both((c, em) => {
    const x = 0, y = 32; c.fillStyle = em ? '#0d0b06' : '#0e0e0f'; c.fillRect(x, y, 1024, 128);
    c.strokeStyle = em ? '#6a531a' : '#b8902a'; c.lineWidth = 4; c.strokeRect(x + 6, y + 6, 1012, 116);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = em ? '#bfbfbf' : '#f4f1ea'; c.font = `700 22px ${OUT_FONT}`; c.fillText('RESTORAN', x + 26, y + 44);
    c.fillStyle = em ? '#ffd35a' : '#f2c230'; c.font = `italic 900 30px ${OUT_FONT}`; c.fillText('NASI KANDAR', x + 24, y + 80);
    c.textAlign = 'center'; c.font = `italic 700 92px ${MMK_SCRIPT}`;
    let s = 92; while (c.measureText('Al-Hajeera').width > 600 && s > 40){ s -= 4; c.font = `italic 700 ${s}px ${MMK_SCRIPT}`; }
    c.lineWidth = 5; c.strokeStyle = '#000000'; c.strokeText('Al-Hajeera', x + 560, y + 66);
    c.fillStyle = em ? '#ffe28a' : gold(c, y + 20, y + 110); c.fillText('Al-Hajeera', x + 560, y + 66);
    badge(c, x + 950, y + 64, 54, em);
  });
  /* the 24 JAM badge on its own (the pole sign out front) */
  both((c, em) => { const {x, y} = {x:0, y:480}; c.fillStyle = em ? '#000000' : '#ffffff'; c.fillRect(x, y, 128, 128); badge(c, x + 64, y + 64, 60, em); });
  /* a string of little Malaysian flags */
  both((c, em) => {
    const x = 0, y = 416; c.fillStyle = em ? '#000000' : '#ffffff'; c.fillRect(x, y, 512, 48);
    c.fillStyle = em ? '#3a3a3a' : '#222222'; c.fillRect(x, y + 3, 512, 3);
    for (let i = 0; i < 8; i++){
      const fx = x + 8 + i * 63, fy = y + 6, w = 52, h = 34, k = em ? .35 : 1, col = (hex) => em ? '#' + new THREE.Color(hex).multiplyScalar(k).getHexString() : hex;
      for (let s = 0; s < 14; s++){ c.fillStyle = col(s % 2 ? '#ffffff' : '#cc0001'); c.fillRect(fx, fy + s * h / 14, w, h / 14 + .5); }
      c.fillStyle = col('#010066'); c.fillRect(fx, fy, w * .5, h * 8 / 14);
      c.fillStyle = col('#ffcc00'); c.beginPath(); c.arc(fx + w * .2, fy + h * .29, h * .17, 0, 7); c.fill();
      c.fillStyle = col('#010066'); c.beginPath(); c.arc(fx + w * .235, fy + h * .29, h * .14, 0, 7); c.fill();
      c.fillStyle = col('#ffcc00'); c.beginPath(); for (let p = 0; p < 10; p++){ const a = p * Math.PI / 5 - Math.PI / 2, rr = p % 2 ? 2.2 : 5.2; c.lineTo(fx + w * .37 + Math.cos(a) * rr, fy + h * .29 + Math.sin(a) * rr); } c.fill();
    }
  });
  /* shop fronts, seen through the open glass: A = counter side (menu lightboxes, food cabinet), B = seating and the drinks fridges */
  const hexLamp = (c, cx, cy, r, em) => { c.fillStyle = em ? '#fff2cf' : '#e8e2d2'; c.beginPath(); for (let k = 0; k < 6; k++) c.lineTo(cx + Math.cos(k * Math.PI / 3) * r, cy + Math.sin(k * Math.PI / 3) * r * .38); c.fill(); };
  const shop = (c, em, x, y, side) => {
    c.save(); c.beginPath(); c.rect(x, y, 512, 256); c.clip();
    c.fillStyle = em ? '#1a140b' : '#17171a'; c.fillRect(x, y, 512, 256);
    c.fillStyle = em ? '#2a2318' : '#2b2b30'; c.fillRect(x, y, 512, 44);                                   /* ceiling */
    for (let k = 0; k < 5; k++) hexLamp(c, x + 52 + k * 102, y + 26, 30, em);
    if (side === 'A'){
      const dishes = [['ROTI CANAI', '#e7c27a'], ['MAGGI GORENG', '#d9a03a'], ['TEH TARIK', '#c8935a'], ['NASI KANDAR', '#c9622c'], ['TOSAI', '#f0e2b0']];
      dishes.forEach(([t, col], k) => {
        const bx = x + 14 + k * 99, by = y + 54; c.fillStyle = em ? '#fff6dc' : '#fbf7ee'; c.fillRect(bx, by, 90, 58);
        c.fillStyle = em ? '#' + new THREE.Color(col).multiplyScalar(.9).getHexString() : col; c.beginPath(); c.ellipse(bx + 45, by + 26, 30, 16, 0, 0, 7); c.fill();
        c.fillStyle = '#d23a2a'; c.fillRect(bx, by + 44, 90, 14); c.fillStyle = '#ffffff'; c.font = `800 10px ${OUT_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, bx + 45, by + 51);
      });
      c.fillStyle = em ? '#7a6a3a' : '#c9ccd0'; c.fillRect(x + 8, y + 150, 210, 106);                    /* the glass food cabinet */
      c.fillStyle = em ? '#c9a85a' : '#9fc6d4'; c.fillRect(x + 14, y + 156, 198, 52);
      for (let k = 0; k < 6; k++){ c.fillStyle = ['#c9622c', '#e7a33a', '#8a4a2a', '#d9534f', '#f0d79a', '#6a8a3a'][k]; c.fillRect(x + 20 + k * 32, y + 186, 26, 18); }
      c.fillStyle = em ? '#c89a20' : '#f2c230'; c.fillRect(x + 230, y + 170, 282, 86);                   /* yellow counter */
      c.fillStyle = em ? '#3a2f14' : '#111111'; c.fillRect(x + 230, y + 166, 282, 6); c.font = `italic 700 34px ${MMK_SCRIPT}`; c.textAlign = 'center'; c.fillStyle = em ? '#3a2f14' : '#111111'; c.fillText('Al-Hajeera', x + 372, y + 218);
      c.fillStyle = em ? '#6a5a40' : '#3b3026'; c.fillRect(x + 300, y + 124, 34, 46); c.fillStyle = em ? '#806a48' : '#5a4636'; c.beginPath(); c.arc(x + 317, y + 116, 12, 0, 7); c.fill();   /* the cook */
    } else {
      c.fillStyle = em ? '#c89a20' : '#f2c230'; c.fillRect(x, y + 120, 512, 10);
      for (let k = 0; k < 3; k++){                                                                             /* drinks fridges */
        const fx = x + 330 + k * 60; c.fillStyle = em ? '#9ab0c0' : '#bcc6cf'; c.fillRect(fx, y + 56, 56, 200);
        c.fillStyle = em ? '#c8d8e8' : '#6f8c9f'; c.fillRect(fx + 5, y + 62, 46, 186);
        for (let r = 0; r < 6; r++) for (let q = 0; q < 5; q++){ c.fillStyle = ['#d9534f', '#f0ad4e', '#5cb85c', '#ffffff', '#5b9bd5', '#ffcf3a'][(r + q + k) % 6]; c.fillRect(fx + 8 + q * 9, y + 68 + r * 30, 6, 20); }
      }
      for (let k = 0; k < 3; k++){                                                                             /* tables inside */
        const tx = x + 30 + k * 98; c.fillStyle = em ? '#c89a20' : '#f2c230'; c.fillRect(tx, y + 178, 80, 8); c.fillStyle = em ? '#2a2418' : '#1a1a1d'; c.fillRect(tx + 4, y + 172, 72, 6);
        c.fillStyle = em ? '#3a3226' : '#222226'; c.fillRect(tx + 36, y + 186, 8, 70); for (const sx of [-14, 74]) c.fillRect(tx + sx, y + 160, 20, 96);
      }
    }
    c.fillStyle = 'rgba(150,185,200,.16)'; c.fillRect(x, y, 512, 256);                                     /* glass */
    c.fillStyle = em ? '#000000' : '#101010'; for (const mx of [0, 170, 340, 508]) c.fillRect(x + mx, y, 4, 256); c.fillRect(x, y, 512, 4);
    c.restore();
  };
  both((c, em) => shop(c, em, 0, 160, 'A')); both((c, em) => shop(c, em, 512, 160, 'B'));
  /* grey stone paving: offset rows of long stones */
  { const x = 512, y = 416; g.fillStyle = '#8f8f8b'; g.fillRect(x, y, 128, 128);
    for (let r = 0; r < 8; r++) for (let q = -1; q < 4; q++){ const sx = x + q * 40 + (r % 2) * 20, v = 128 + (R() * 30 | 0); g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(sx + 1.5, y + r * 16 + 1.5, 37, 13); }
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 40; k++) g.fillRect(x + R() * 124, y + R() * 124, 3 + R() * 6, 2); }
  /* canopy louvres from below */
  { const x = 640, y = 416; g.fillStyle = '#26282c'; g.fillRect(x, y, 128, 128); for (let k = 0; k < 16; k++){ g.fillStyle = '#3b3e44'; g.fillRect(x, y + k * 8, 128, 4); g.fillStyle = '#17181b'; g.fillRect(x, y + k * 8 + 6, 128, 1.5); } }
  /* the standing menu lightbox */
  both((c, em) => {
    const x = 768, y = 416; c.fillStyle = em ? '#120f08' : '#111111'; c.fillRect(x, y, 256, 384);
    c.fillStyle = em ? '#ffd35a' : '#f2c230'; c.fillRect(x + 8, y + 8, 240, 52); c.fillStyle = '#111111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 30px ${OUT_FONT}`; c.fillText('MENU 菜单', x + 128, y + 35);
    c.textAlign = 'left'; MMK_MENU.forEach((d, k) => {
      const ry = y + 92 + k * 44; c.fillStyle = em ? '#' + new THREE.Color(d.col).multiplyScalar(.8).getHexString() : d.col; c.beginPath(); c.arc(x + 26, ry, 12, 0, 7); c.fill();
      c.fillStyle = em ? '#e8e2d2' : '#f4f1ea'; c.font = `700 ${d.name.length > 14 ? 15 : 18}px ${OUT_FONT}`; c.fillText(d.name, x + 46, ry);
      c.textAlign = 'right'; c.fillStyle = em ? '#ffd35a' : '#f2c230'; c.font = `800 17px ${OUT_FONT}`; c.fillText(d.rm.toFixed(2), x + 244, ry); c.textAlign = 'left';
    });
    c.fillStyle = em ? '#ffd35a' : '#f2c230'; c.textAlign = 'center'; c.font = `800 20px ${OUT_FONT}`; c.fillText('BUKA 24 JAM · 24 小时营业', x + 128, y + 362);
  });
  mmkTex.needsUpdate = true; mmkGlowTex.needsUpdate = true;
}
mmkPaint(); document.fonts && document.fonts.ready.then(mmkPaint);
const mmkMat = regWet(new THREE.MeshStandardMaterial({color:'#ffffff', vertexColors:true, map:mmkTex, emissive:'#ffffff', emissiveMap:mmkGlowTex, emissiveIntensity:0, roughness:.8}), .45);

/* ---------- the shop front, canopy and the open-air tables (one merged mesh) ---------- */
const MMK = {chairs:[], tables:[], on:null, near:null, eat:0, dish:null, idle:0, chill:false, msg:'', lbl:false, mesh:null, scr:null, scrK:-1, food:null};
(function(){
  const b = TB(), R = mkRng(6602), sx = MMK_SHOP.x - .04, C = MMK_CAN;
  /* glass shop fronts on the west wall, a black band and the name boards above the canopy, the flags under them */
  tileX(b, sx, MMK_SHOP.zN0 + .2, MMK_SHOP.zMid - .2, 0, C.y, -1, MMK_R.shopB, 8.3, C.y, '#ffffff');
  tileX(b, sx, MMK_SHOP.zMid + .2, MMK_SHOP.zS1 - .2, 0, C.y, -1, MMK_R.shopA, 8.3, C.y, '#ffffff');
  fX(b, sx - .02, C.z0, C.z1, 4.15, 5.65, -1, null, '#141416');
  for (const zc of [325, 345]) fX(b, sx - .06, zc - 5.6, zc + 5.6, 4.2, 5.6, -1, MMK_R.sign, '#ffffff');
  for (let z = C.z0 + .3; z < C.z1 - 4; z += 4.6) fX(b, sx - .05, z, z + 4.4, 3.76, 4.14, -1, MMK_R.flags, '#ffffff');
  /* the canopy: louvred underside, a thin roof, a black fascia (flags hung along it too), black posts */
  for (let z = C.z0; z < C.z1 - .01; z += 4){ const z1 = Math.min(C.z1, z + 4); tQuad(b, [C.x0, C.y - .02, z], [0, 0, z1 - z], [C.x1 - C.x0, 0, 0], MMK_R.louver, '#ffffff'); }
  fY(b, C.y + .12, C.x0, C.z0, C.x1, C.z1, '#3a3d42');
  fX(b, C.x0, C.z0, C.z1, C.y - .38, C.y + .12, -1, null, '#1b1c1f'); fZ(b, C.z0, C.x0, C.x1, C.y - .38, C.y + .12, -1, null, '#1b1c1f'); fZ(b, C.z1, C.x0, C.x1, C.y - .38, C.y + .12, 1, null, '#1b1c1f');
  for (let z = C.z0 + .4; z < C.z1 - 4; z += 4.6) fX(b, C.x0 - .02, z, z + 4.4, C.y - .76, C.y - .38, -1, MMK_R.flags, '#ffffff');
  for (let z = C.z0 + .15; z <= C.z1; z += (C.z1 - C.z0 - .3) / 6) tBox(b, C.x0 + .05, 0, z - .07, C.x0 + .19, C.y - .02, z + .07, '#1b1c1f');
  /* the roti canai griddle and the glass food cabinet under the canopy, a standing menu lightbox and the 24 JAM pole sign */
  tBox(b, 136.4, 0, 336.2, 138.6, .92, 338.4, '#c3c7cc'); tBox(b, 136.5, .92, 336.3, 138.5, .97, 338.3, '#1d1d1f'); tBox(b, 136.4, .97, 338.2, 138.6, 1.2, 338.4, '#c3c7cc');
  tBox(b, 136.4, 0, 339, 138.6, .82, 341.6, '#c3c7cc'); tBox(b, 136.45, .82, 339.05, 138.55, 1.5, 341.55, '#a9d2df'); tBox(b, 136.4, 1.5, 339, 138.6, 1.56, 341.6, '#c3c7cc');
  for (let k = 0; k < 5; k++) tBox(b, 136.7 + (k % 2) * .9, .86, 339.3 + k * .44, 137.4 + (k % 2) * .9, .98, 339.62 + k * .44, ['#c9622c', '#e7a33a', '#8a4a2a', '#d9534f', '#f0d79a'][k]);
  tBox(b, 133.6, 0, 334.9, 133.7, 1.1, 335.0, '#1b1c1f'); tBox(b, 133.6, 0, 336.1, 133.7, 1.1, 336.2, '#1b1c1f');
  tBox(b, 133.5, 1.1, 334.85, 133.75, 2.95, 336.25, '#111111', 'ny nx'); fX(b, 133.49, 334.9, 336.2, 1.15, 2.9, -1, MMK_R.menu, '#ffffff');
  tBox(b, 134.4, 0, 313.9, 134.56, 3.1, 314.06, '#2a2c30'); fX(b, 134.38, 313.35, 314.65, 3.1, 4.4, -1, MMK_R.badge, '#ffffff'); fX(b, 134.58, 313.35, 314.65, 3.1, 4.4, 1, MMK_R.badge, '#ffffff');
  /* the paving: the strip beside the spray garage and the big square south of it (its south-west corner cut back for the back-lane corner) */
  const pave = (x0, z0, x1, z1) => { for (let x = x0; x < x1 - .01; x += 3) for (let z = z0; z < z1 - .01; z += 3){ const xa = Math.min(x1, x + 3), za = Math.min(z1, z + 3);
    if (x < 113 && za > 354 + (x - 108.6) * 1.27) continue; tQuad(b, [x, .07, za], [xa - x, 0, 0], [0, 0, z - za], MMK_R.pave, '#a3a19b'); } };
  pave(122.6, 316, 141.96, 334.9); pave(108.6, 334.9, 141.96, 359.6);
  /* the outdoor screen: black frame on two legs, a speaker stack each side */
  { const S = MMK_SCR, z0 = S.z - S.w / 2 - .2, z1 = S.z + S.w / 2 + .2, y0 = S.y - S.h / 2 - .2, y1 = S.y + S.h / 2 + .2;
    tBox(b, S.x - .45, y0, z0, S.x, y1, z1, '#111214', 'ny px'); fX(b, S.x, z0, z1, y0, y1, 1, null, '#111214');
    for (const zz of [z0 + .6, z1 - .6]) tBox(b, S.x - .32, 0, zz - .12, S.x - .12, y0, zz + .12, '#222326');
    for (const zz of [z0 - .75, z1 + .75]){ tBox(b, S.x - .5, 0, zz - .5, S.x + .25, 2.1, zz + .5, '#161618'); for (const y of [.55, 1.45]) tBox(b, S.x + .25, y - .26, zz - .26, S.x + .29, y + .26, zz + .26, '#3a3c40'); }
    addBox(S.x - .2, S.z, .5, S.w / 2 + 1.3, 0); }
  /* tables: black top with a bright yellow edge (some red, some blue), a pedestal; four black plastic chairs each */
  const rows = [];
  for (const x of [125.5, 129, 132.5]) for (const z of [319.5, 323.5, 327.5, 331.5]) rows.push([x, z]);
  for (const x of [116.5, 120, 123.5, 127, 130.5]) for (const z of [338.5, 342.5, 346.5, 350.5, 354.5]) rows.push([x, z]);
  const tops = ['#141416', '#141416', '#141416', '#141416', '#b8322a', '#2a4f9a'];
  rows.forEach(([tx, tz], i) => {
    if (TOUCH && (tz === 354.5 || tz === 331.5)) return;
    const jx = tx + (R() - .5) * .5, jz = tz + (R() - .5) * .5, top = tops[(R() * tops.length) | 0], edge = top === '#141416' ? '#f2c230' : top;
    tBox(b, jx - .52, .7, jz - .52, jx + .52, .75, jz + .52, edge); fY(b, .752, jx - .44, jz - .44, jx + .44, jz + .44, top);
    tBox(b, jx - .05, 0, jz - .05, jx + .05, .7, jz + .05, '#2a2a2c', 'ny py'); tBox(b, jx - .3, 0, jz - .05, jx + .3, .05, jz + .05, '#2a2a2c', 'ny'); tBox(b, jx - .05, 0, jz - .3, jx + .05, .05, jz + .3, '#2a2a2c', 'ny');
    MMK.tables.push({x:jx, z:jz});
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      if (R() < .12) continue;                                           /* a chair or two pulled away */
      const cx = jx + dx * .82, cz = jz + dz * .82, ox = dx ? dx : 0, oz = dz ? dz : 0;
      /* seat, the back on the outer side, and two leg panels */
      tBox(b, cx - .22, .42, cz - .22, cx + .22, .47, cz + .22, '#1a1a1c');
      const bx = cx + ox * .2, bz = cz + oz * .2; tBox(b, bx - (ox ? .02 : .21), .47, bz - (oz ? .02 : .21), bx + (ox ? .02 : .21), .92, bz + (oz ? .02 : .21), '#1a1a1c');
      if (ox) for (const s of [-1, 1]) tBox(b, cx - .2, 0, cz + s * .19 - .015, cx + .2, .42, cz + s * .19 + .015, '#1a1a1c', 'ny py');
      else for (const s of [-1, 1]) tBox(b, cx + s * .19 - .015, 0, cz - .2, cx + s * .19 + .015, .42, cz + .2, '#1a1a1c', 'ny py');
      MMK.chairs.push({x:cx, z:cz, h:Math.atan2(jx - cx, jz - cz), t:MMK.tables.length - 1});
    }
  });
  /* three closed black umbrellas on their weighted stands */
  for (const [ux, uz] of [[134, 344], [121.8, 340.5], [134, 352.5]]){
    tBox(b, ux - .3, 0, uz - .3, ux + .3, .3, uz + .3, '#3a3a3c'); tBox(b, ux - .03, .3, uz - .03, ux + .03, 2.9, uz + .03, '#d0d0d0', 'ny');
    for (let k = 0; k < 4; k++){ const a = k * Math.PI / 2, A = [ux, 3.05, uz], P0 = [ux + Math.cos(a) * .2, 1.4, uz + Math.sin(a) * .2], P1 = [ux + Math.cos(a + Math.PI / 2) * .2, 1.4, uz + Math.sin(a + Math.PI / 2) * .2];
      tTri(b, P0, A, P1, '#141416'); tTri(b, P1, A, P0, '#141416'); } }
  /* the railing round the outside: posts and three rails (the south-west corner cut back) */
  const fence = [[108.7, 335.2], [108.7, 354], [113, 359.5], [131, 359.5]], fenceE = [[136.5, 359.5], [141.9, 359.5]];
  for (const line of [fence, fenceE]) for (let i = 0; i < line.length - 1; i++){
    const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.5));
    for (let k = 0; k <= n; k++){ const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n; tBox(b, px - .04, 0, pz - .04, px + .04, 1.3, pz + .04, '#3d4a42'); }
    for (const y of [.12, .7, 1.26]) for (const d of [1, -1]) tQuad(b, d > 0 ? [ax, y, az] : [bx, y, bz], [(bx - ax) * d, 0, (bz - az) * d], [0, .05, 0], null, '#3d4a42');
  }
  /* wires for the strings of bulbs: from poles round the edge to the canopy fascia, sagging a little */
  const poles = [[109.3, 336], [109.3, 345.2], [109.3, 353.6], [118, 359.2], [127, 359.2], [123, 316.4], [123, 333.6]];
  for (const [px, pz] of poles){ tBox(b, px - .06, 0, pz - .06, px + .06, 4.4, pz + .06, '#2a2c30'); tBox(b, px - .14, 4.4, pz - .14, px + .14, 4.5, pz + .14, '#2a2c30'); }
  const wires = [[poles[0], [C.x0, 337]], [poles[1], [C.x0, 345.5]], [poles[2], [C.x0, 353.6]], [poles[3], [C.x0, 341]], [poles[4], [C.x0, 349.5]],
    [poles[5], [C.x0, 316.2]], [poles[6], [C.x0, 333.6]], [poles[5], [C.x0, 326]], [poles[0], poles[6]], [poles[0], poles[1]], [poles[1], poles[2]], [poles[2], poles[3]], [poles[3], poles[4]]];
  MMK.bulbs = [];
  for (const [[ax, az], [bx, bz]] of wires){
    const ay = 4.35, by = bx === C.x0 ? C.y + .1 : 4.35, L = Math.hypot(bx - ax, bz - az), n = Math.max(4, Math.round(L / 2)), at = t => [ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(Math.PI * t) * Math.min(1, L / 18), az + (bz - az) * t];
    for (let k = 0; k < n; k++){ const P = at(k / n), Q = at((k + 1) / n), U = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]]; tQuad(b, P, U, [0, .025, 0], null, '#1a1a1a'); tQuad(b, Q, U.map(v => -v), [0, .025, 0], null, '#1a1a1a'); }
    for (let d = .6; d < L - .3; d += TOUCH ? 1.6 : 1.05) MMK.bulbs.push(at(d / L));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  const m = MMK.mesh = new THREE.Mesh(g, mmkMat); m.castShadow = !TOUCH; m.receiveShadow = true; m.userData.info = mamakInfo; pickables.push(m); scene.add(m);
  /* bulbs: the street lamps' bulb material, so they light up with them at dusk */
  { const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.055, 0), bulbMat, MMK.bulbs.length), m4 = new THREE.Matrix4();
    MMK.bulbs.forEach((p, i) => { m4.makeTranslation(p[0], p[1] - .09, p[2]); im.setMatrixAt(i, m4); }); im.castShadow = false; scene.add(im); }
  /* a few trees round the edge (one merged mesh) */
  { const parts = [], tr = mkRng(911);
    for (const [x, z, s] of [[111.6, 337.6, 1], [111.8, 355.4, .9], [125.5, 358.2, 1.1], [138.6, 358.2, .95], [125.2, 317.2, .8]]){
      const t = new THREE.CylinderGeometry(.09 * s, .13 * s, 2.6 * s, 6).translate(x, 1.3 * s, z); geoTint(t, '#6b5440'); parts.push(t);
      for (let k = 0; k < 3; k++){ const f = new THREE.IcosahedronGeometry((.9 + tr() * .4) * s, 0).translate(x + (tr() - .5) * 1.2 * s, (2.8 + tr() * .8) * s, z + (tr() - .5) * 1.2 * s); geoTint(f, ['#4f8a3c', '#5c9a45', '#457d36'][k]); parts.push(f); }
    }
    const tm = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.85, flatShading:true})); tm.castShadow = !TOUCH; scene.add(tm); }
  /* people: the cook at the griddle, a waiter in the shop's black-and-yellow, a few getting a drink */
  opPeople([[137.5, 335.6, -Math.PI / 2, '#f4f1ea', '#8a5a3c', '#2a2a2c'], [134.6, 339.5, Math.PI / 2, '#f2c230', '#7a4f33', '#1a1a1c'], [128.2, 336.6, 0, '#5b8fd5', '#e0b48c'],
    [119.2, 357.6, Math.PI, '#d9534f', '#f1c9a5'], [133.2, 321.2, -Math.PI / 2, '#2f6f3e', '#c99a72', '#3a3a5a']]);
  /* on the minimap: the paved square and the canopy */
  OUT_LOTS.push([122.6, 316, 142, 334.9], [108.6, 334.9, 142, 359.6]);
  addFp({t:0, x:(C.x0 + C.x1) / 2, z:(C.z0 + C.z1) / 2, w:C.x1 - C.x0, d:C.z1 - C.z0, rot:0, color:'#3a3d42'});
  addLabel('Al-Hajeera 嘛嘛档 · 24h', 136, 7.2, 335);
})();

/* ---------- the big screen: four little "broadcasts" taking turns (F1, tennis, a nature documentary, an onboard lap) ---------- */
{
  const W = 512, H = 288, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  /* frame 0: a race from the TV helicopter */
  { const x = 0, y = 0; g.fillStyle = '#3f6b33'; g.fillRect(x, y, 256, 144); g.save(); g.beginPath(); g.rect(x, y, 256, 144); g.clip();
    g.fillStyle = '#5b5d61'; g.beginPath(); g.moveTo(x - 20, y + 120); g.lineTo(x + 280, y + 40); g.lineTo(x + 280, y + 84); g.lineTo(x - 20, y + 164); g.fill();
    for (let k = 0; k < 16; k++){ g.fillStyle = k % 2 ? '#ffffff' : '#d23a2a'; g.beginPath(); const t = k / 16, ax = x - 20 + 300 * t, ay = y + 120 - 80 * t; g.moveTo(ax, ay); g.lineTo(ax + 19, ay - 5); g.lineTo(ax + 19, ay - 1); g.lineTo(ax, ay + 4); g.fill(); }
    for (const [cx, cy, col] of [[150, 78, '#d0202a'], [104, 92, '#1d3f8f'], [62, 104, '#f08a1c']]){ g.fillStyle = col; g.save(); g.translate(x + cx, y + cy); g.rotate(-.26); g.fillRect(-10, -3, 20, 6); g.fillStyle = '#111'; g.fillRect(-9, -5, 4, 10); g.fillRect(5, -5, 4, 10); g.restore(); }
    g.restore(); g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x + 6, y + 6, 70, 18); g.fillStyle = '#fff'; g.font = `800 11px ${OUT_FONT}`; g.textBaseline = 'middle'; g.fillText('LAP 32 / 56', x + 12, y + 15); }
  /* frame 1: tennis, the wide shot */
  { const x = 256, y = 0; g.fillStyle = '#2f7a4a'; g.fillRect(x, y, 256, 144); g.fillStyle = '#2d5aa8'; g.beginPath(); g.moveTo(x + 70, y + 26); g.lineTo(x + 186, y + 26); g.lineTo(x + 226, y + 136); g.lineTo(x + 30, y + 136); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 70, y + 26); g.lineTo(x + 186, y + 26); g.lineTo(x + 226, y + 136); g.lineTo(x + 30, y + 136); g.closePath(); g.moveTo(x + 50, y + 80); g.lineTo(x + 206, y + 80); g.moveTo(x + 128, y + 50); g.lineTo(x + 128, y + 112); g.stroke();
    g.fillStyle = '#ddd'; g.fillRect(x + 48, y + 74, 160, 6); g.fillStyle = '#f2f2f2'; g.fillRect(x + 118, y + 38, 6, 12); g.fillRect(x + 140, y + 112, 8, 16); g.fillStyle = '#e8f04a'; g.beginPath(); g.arc(x + 160, y + 60, 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x + 6, y + 118, 74, 20); g.fillStyle = '#fff'; g.font = `800 11px ${OUT_FONT}`; g.textBaseline = 'middle'; g.fillText('6-4  3-2  40-15', x + 11, y + 128); }
  /* frame 2: a turtle hatchling on the sand */
  { const x = 0, y = 144, s = g.createLinearGradient(0, y, 0, y + 144); s.addColorStop(0, '#c9b28a'); s.addColorStop(1, '#a88e64'); g.fillStyle = s; g.fillRect(x, y, 256, 144);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let k = 0; k < 9; k++){ g.beginPath(); g.ellipse(x + 30 + k * 28, y + 30 + (k % 3) * 36, 22, 4, .2, 0, 7); g.fill(); }
    g.fillStyle = '#3c3f33'; g.beginPath(); g.ellipse(x + 132, y + 86, 22, 15, -.2, 0, 7); g.fill(); g.fillStyle = '#585c49'; g.beginPath(); g.ellipse(x + 132, y + 84, 17, 11, -.2, 0, 7); g.fill();
    g.fillStyle = '#3c3f33'; g.beginPath(); g.arc(x + 156, y + 78, 7, 0, 7); g.fill(); for (const [fx, fy] of [[112, 74], [116, 100], [146, 98], [146, 70]]){ g.beginPath(); g.ellipse(x + fx, y + fy, 9, 3, .6, 0, 7); g.fill(); } }
  /* frame 3: onboard, down the straight */
  { const x = 256, y = 144; g.fillStyle = '#8ec5ea'; g.fillRect(x, y, 256, 70); g.fillStyle = '#4a7a3a'; g.fillRect(x, y + 66, 256, 78);
    g.fillStyle = '#5b5d61'; g.beginPath(); g.moveTo(x + 120, y + 66); g.lineTo(x + 136, y + 66); g.lineTo(x + 250, y + 144); g.lineTo(x + 6, y + 144); g.fill();
    g.fillStyle = '#ffffff'; for (let k = 0; k < 4; k++) g.fillRect(x + 126, y + 74 + k * 18, 4, 9);
    g.fillStyle = '#111'; g.fillRect(x + 60, y + 114, 136, 30); g.fillRect(x + 124, y + 60, 8, 56); g.fillStyle = '#d0202a'; g.fillRect(x + 80, y + 120, 96, 8);
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x + 186, y + 6, 64, 18); g.fillStyle = '#fff'; g.font = `800 11px ${OUT_FONT}`; g.textBaseline = 'middle'; g.fillText('312 km/h', x + 192, y + 15); }
  const tex = new THREE.CanvasTexture(cv); tex.repeat.set(.5, .5); tex.anisotropy = ANISO;
  const m = MMK.scr = new THREE.Mesh(new THREE.PlaneGeometry(MMK_SCR.w, MMK_SCR.h).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({map:tex, color:'#e6e6e6'}));
  m.position.set(MMK_SCR.x + .02, MMK_SCR.y, MMK_SCR.z); scene.add(m);
}
/* after dark: warm pools of light on the paving under the bulbs and the canopy, a cool one in front of the screen (one additive mesh, no real lights) */
{
  const parts = [];
  for (const [x, z, r, col] of [[138.4, 324, 6, '#ffb060'], [138.4, 345, 6.5, '#ffb060'], [128.5, 324, 6, '#ffb060'], [126.5, 340.5, 7.5, '#ffb060'], [127, 353, 6.5, '#ffb060'],
    [118.5, 342, 6.5, '#ffb060'], [118.5, 353.5, 5.5, '#ffb060'], [114.2, 347, 4.6, '#5a86c8']]){
    const c = new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2).translate(x, .09, z), n = c.attributes.position.count, cl = new Float32Array(n * 3), k = new THREE.Color(col);
    for (let i = 0; i < n; i++){ const f = i ? .06 : 1; cl[i * 3] = k.r * f; cl[i * 3 + 1] = k.g * f; cl[i * 3 + 2] = k.b * f; }   /* bright in the middle, fading out to the rim */
    c.setAttribute('color', new THREE.BufferAttribute(cl, 3)); parts.push(c);
  }
  MMK.pool = new THREE.Mesh(geoMerge(parts), new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, polygonOffset:true, polygonOffsetFactor:-14, polygonOffsetUnits:-56}));
  MMK.pool.visible = false; scene.add(MMK.pool);
}

/* ---------- out on the street every frame (all modes): screen, shop lights ---------- */
function mmkFrame(){
  const near = Math.abs(camera.position.x - 125) < 650 && Math.abs(camera.position.z - 337) < 650;
  if (near){
    mmkMat.emissiveIntensity = Math.max(cur.win, wx.rain * .6);
    const lamp = Math.min(1, bulbMat.emissiveIntensity); MMK.pool.visible = lamp > .04; MMK.pool.material.opacity = lamp * .42;
    const k = Math.floor(performance.now() / 4200) % 4;
    if (k !== MMK.scrK){ MMK.scrK = k; MMK.scr.material.map.offset.set((k % 2) * .5, k < 2 ? .5 : 0); }
    MMK.scr.material.color.setScalar(.82 + Math.min(1, cur.win) * .18);
  }
}
(function mmkLoop(){ mmkFrame(); requestAnimationFrame(mmkLoop); })();

/* ---------- 外卖取餐点 ---------- */
{
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:'#ff8a3d', transparent:true, opacity:.45, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
  m.position.set(130, .1, 313.2); scene.add(m);
  PICKUPS.push({name:'Al-Hajeera 嘛嘛档', x:130, z:313.2, m, lbl:addLabel('外卖取餐 · Al-Hajeera 嘛嘛档', 130, 6.5, 313.2, true), out:true});
}

/* ---------- 坐下吃 ---------- */
if (typeof achAdd === 'function') achAdd([['mamak', '嘛嘛档常客', '在 Al-Hajeera 把六样招牌都吃一遍', 40], ['chill', '不想学习', '在嘛嘛档坐着放空 45 秒', 20]]);
const mmkTried = () => prog.best.o_mk | 0;
/* the plate (and a glass) put down in front of you */
MMK.food = (() => {
  const g = new THREE.Group(), plate = new THREE.Mesh(new THREE.CylinderGeometry(.17, .14, .025, 14), M('#f4f1ea', {roughness:.5})), dish = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .05, 10), M('#e7c27a', {roughness:.8}));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(.045, .036, .14, 10), M('#c8935a', {roughness:.3}));
  plate.position.y = .0125; dish.position.y = .045; cup.position.set(.16, .07, .1); g.add(plate, dish, cup); g.visible = false; scene.add(g);
  return {g, plate, dish, cup};
})();
function mmkChairNear(){
  if (mode !== 'naiwa' || driving || nw.air || !(nw.state === 'idle' || nw.state === 'walk' || nw.state === 'run' || nw.state === 'laugh' || nw.state === 'pose')) return null;
  if (nw.x < 108 || nw.x > 142 || nw.z < 315 || nw.z > 360) return null;
  let best = null, bd = 1.25;
  for (const c of MMK.chairs){ const d = Math.hypot(nw.x - c.x, nw.z - c.z); if (d < bd){ bd = d; best = c; } }
  return best;
}
function mmkSit(c){
  MMK.on = c; MMK.idle = 0; MMK.chill = false; MMK.eat = 0; MMK.dish = null;
  nw.state = 'sit'; nw.bike = false; nw.air = false; nw.vy = 0; nw.spd = 0; nw.x = c.x; nw.z = c.z; nw.y = .46; nw.h = c.h;
  MMK.cam = camDist; camDist = Math.max(camDist, 9); camYaw = Math.atan2(c.x - MMK_SCR.x, c.z - MMK_SCR.z) + .35; camPitch = Math.max(camPitch, .22);   /* look past you at the big screen */
  sfx.ding(); mmkMenu();
}
function mmkStand(){
  const c = MMK.on; if (!c) return;
  MMK.on = null; MMK.eat = 0; MMK.food.g.visible = false;
  const t = MMK.tables[c.t], ox = c.x - t.x, oz = c.z - t.z, L = Math.hypot(ox, oz) || 1;
  nw.x = c.x + ox / L * .55; nw.z = c.z + oz / L * .55; nw.y = groundAt(nw.x, nw.z); nw.state = 'idle';
  if (MMK.cam){ camDist = MMK.cam; MMK.cam = null; }
  if (MMK.lbl){ MMK.lbl = false; opSetF(''); }
}
function mmkOrder(i){
  const d = MMK_MENU[i], c = MMK.on; if (!d || !c || MMK.eat > 0) return;
  if (money < d.rm){ opClose(true); toast('钱不够', `${d.name} 要 ${fmtRM(d.rm)}，先去送几单外卖吧`, 2200); return; }
  opClose(true); money -= d.rm; moneyChanged();
  MMK.dish = d; MMK.eat = d.cup ? 4 : 6;
  const t = MMK.tables[c.t], F = MMK.food;
  F.g.position.set(t.x + (c.x - t.x) * .32, .755, t.z + (c.z - t.z) * .32); F.g.rotation.y = c.h; F.g.visible = true;
  F.plate.visible = F.dish.visible = !d.cup; F.dish.material.color.set(d.col); F.dish.scale.set(1, 1, 1);
  F.cup.visible = true; F.cup.material.color.set(d.cup ? d.col : '#c8935a'); F.cup.scale.set(1, d.cup ? 1.4 : 1, 1); F.cup.position.set(d.cup ? 0 : .16, d.cup ? .1 : .07, d.cup ? 0 : .1);
  gxCallout(d.name, `${fmtRM(d.rm)} · ${d.line}`, '#f2c230'); tone('triangle', 784, 988, .12, .1);
}
function mmkMenu(){
  if (!MMK.on) return;
  const night = opNight(), tried = mmkTried();
  opOpen(night ? '🌙 Al-Hajeera · 夜宵' : '☕ Al-Hajeera 嘛嘛档',
    `<p class="op-note">${night ? '晚上七八点人最多，大屏幕在放 F1。' : '24 小时营业，'}点一份慢慢吃，吃完还能接着坐着放空。走两步就起身。${tried === 63 ? '' : ` 六样招牌吃过 ${MMK_MENU.filter((d, i) => tried & 1 << i).length} / 6。`}</p>` +
    MMK_MENU.map((d, i) => `<button type="button" class="op-card" data-i="${i}"><kbd>${i + 1}</kbd><b>${tried & 1 << i ? '' : '✨ '}${d.name}</b><span>${fmtRM(d.rm)} · ${d.line}</span></button>`).join(''),
    code => { const m = /^(Digit|Numpad)([1-6])$/.exec(code); if (m) mmkOrder(+m[2] - 1); else if (code === 'KeyF') opClose(); });
  for (const b of document.querySelectorAll('#opBody .op-card')) b.addEventListener('click', () => mmkOrder(+b.dataset.i));
}
function mmkUpdate(dt){
  MMK.msg = '';
  if (MMK.on){
    MMK.idle += dt;
    if (MMK.eat > 0){
      MMK.eat -= dt; const d = MMK.dish, F = MMK.food, left = Math.max(0, MMK.eat / (d.cup ? 4 : 6));
      if (d.cup) F.cup.scale.y = .3 + left * 1.1; else F.dish.scale.set(.3 + left * .7, .4 + left * .6, .3 + left * .7);
      MMK.msg = `正在吃 ${d.name}…`;
      if (MMK.eat <= 0){
        MMK.eat = 0; const i = MMK_MENU.indexOf(d), was = mmkTried(), now = was | 1 << i;
        if (now !== was){ prog.best.o_mk = now; saveGame(); }
        for (let k = 0; k < 5; k++) spawnPart('heart', nw.x + (rnd() - .5), 2 + rnd(), nw.z + (rnd() - .5), .7, {vy:2, life:1.1, op:1, color:'#ffcf3a'});
        gxCallout('好吃！', now !== was ? `新吃到一样 · ${MMK_MENU.filter((x, k) => now & 1 << k).length} / 6` : d.name, '#f2c230'); gxChime(1);
        if (now === 63 && was !== 63){ unlock('mamak'); opFanfare(); }
      }
    } else MMK.msg = TOUCH ? '点「点餐」再来一份 · 推摇杆起身' : 'F 再点一份 · WASD 起身 · 坐着就是放空';
    if (!MMK.chill && MMK.idle > 45){ MMK.chill = true; gxCallout('放空完毕', '不想学习的时候就来 Mamak 坐坐', '#9fd8ff'); unlock('chill'); }
    MMK.lbl = true; opSetF('点餐');   /* every frame: js/87-classroom.js clears the F button each frame */
    return;
  }
  MMK.near = mmkChairNear();
  if (MMK.near && !gx.paused){ MMK.msg = TOUCH ? '点「坐下」坐下点餐' : '按 F 坐下点餐 · Al-Hajeera'; MMK.lbl = true; opSetF('坐下'); }
  else if (MMK.lbl){ MMK.lbl = false; opSetF(''); }
}
/* F: sit down, or order again; moving (or jumping) gets you up */
{ const base = roomTryF; roomTryF = function(){ if (MMK.on){ if (MMK.eat <= 0) mmkMenu(); return true; } if (MMK.near && mmkChairNear() === MMK.near){ mmkSit(MMK.near); return true; } return base(); }; }
{ const base = footAction; footAction = function(k){ if (MMK.on) return; base(k); }; }
{ const base = updateFoot; updateFoot = function(dt){
    if (!MMK.on) return base(dt);
    const mv = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight || keys.Space || Math.hypot(joy.x, joy.y) > .35;
    if (mv && MMK.eat <= 0 && !opUI.on){ mmkStand(); return base(dt); }
    const c = MMK.on; nw.state = 'sit'; nw.bike = false; nw.x = c.x; nw.z = c.z; nw.y = .46; nw.h = c.h; nw.spd = 0; nw.vy = 0; nw.air = false;
  }; }
/* eating: the right hand goes from the plate to the mouth */
{ const base = animNaiwa; animNaiwa = function(dt, T){
    base(dt, T);
    if (!MMK.on || MMK.eat <= 0 || nw.state !== 'sit') return;
    const [, aR] = NW.arms, [, eR] = NW.elbows || [], k = (Math.sin(T * 5) + 1) / 2;
    aR.rotation.x = -.9 - k * .9; if (eR) eR.rotation.x = -.9 - k * .9; NW.mouth.scale.y = .02 + k * .06;
  }; }
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); mmkUpdate(dt); },
    prompt(){ return MMK.msg || base.prompt(); },
    mini(dot){ base.mini(dot); if (!mission.on && !gxA.act && !gxTaxi.on) dot(137, 335, '#f2c230', 6, {k:'mamak', i:'🫖', t:'Al-Hajeera 嘛嘛档', s:'24 小时 · 坐下点餐 · 外卖取餐', c:'shop', p:2}); },
    onBust(){ mmkStand(); base.onBust(); },
    leave(){ mmkStand(); MMK.near = null; if (MMK.lbl){ MMK.lbl = false; opSetF(''); } base.leave(); }
  });
}
