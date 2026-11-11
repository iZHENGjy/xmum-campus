/* XMUM 校园漫游 · A 区台地：A1–A5 坐在一块高 6.5 m 的台地上（底下是地下停车场）。
   前面：花岗岩大台阶和草坡落到长廊和大草坪；后面：缓坡一直落到环湖路；两头是挡土墙，东头墙脚开着停车场入口。
   这个文件在 js/10-world.js 之前加载，只放形状和高度（azY），路、长廊和湖边的线也在这里定，10-world 直接用。
   画台地、台阶、挡土墙、楼底座、连廊、亭子，把楼抬上去，都在 azBuild() 里，由 js/42-gate.js 在树和小物件摆完以后调用。 */
'use strict';
const PX = (x, z) => [x / SC + CX, z / SC + CY];   /* metres -> map pixels (the inverse of P) */
const AZ = (() => {
  const H = 6.5, SD = 17, FB = 28;
  /* TL: top edge of the front bank, west -> east, a few metres in front of each block's porch (one straight piece per block, so its stair is straight).
     BL: where the back slope starts; it runs through the blocks (their podiums show at the back), far enough from the lake ring road for a slope of about 1 in 4. */
  const TL = [[-65, 163.5], [-9.1, 145.4], [-3.3, 137.2], [56.1, 128.8], [60, 130], [150, 130], [153, 121], [225, 121], [232.3, 121.3], [298.2, 124.8], [324, 126.2]];
  const BL = [[-83, 107.5], [-27, 90], [-10, 86], [47, 74], [63, 44.5], [112, 44.5], [147, 57], [156, 66], [222, 66], [232, 62], [302, 72], [324, 72]];
  /* the top: TL, the east wall, BL backwards, the west wall (along A1's west face, beside the auditorium) */
  const R = TL.concat(BL.slice().reverse());
  /* garage: a drive-in bay at ground level cut into the east wall */
  const NOTCH = {x0:313, x1:324, z0:94, z1:106};
  const BOX = {x0:-100, x1:328, z0:14, z1:182};
  const near = (x, z, L) => {
    let best = 1e9, bi = 0, bt = 0;
    for (let i = 0; i < L.length - 1; i++){
      const a = L[i], b = L[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], tr = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), t = tr < 0 ? 0 : tr > 1 ? 1 : tr;
      const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
      if (d < best){ best = d; bi = i; bt = tr; }
    }
    return {d:best, past:(bi === 0 && bt < 0) || (bi === L.length - 2 && bt > 1)};
  };
  /* back slope: straight in the middle, eased over its first and last quarter (steepest about 1 in 3.2) */
  const fall = t => t <= 0 ? 1 : t >= 1 ? 0 : t < .25 ? 1 - t * t / .375 : t > .75 ? (1 - t) * (1 - t) / .375 : 1 - (t - .125) / .75;
  const inNotch = (x, z) => x > NOTCH.x0 && x < NOTCH.x1 + 3 && z > NOTCH.z0 && z < NOTCH.z1;
  function raw(x, z){
    if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1) return 0;
    if (inNotch(x, z)) return 0;
    if (inPoly(x, z, R)) return H;
    let y = 0;
    const f = near(x, z, TL); if (!f.past && f.d < SD) y = H * (1 - f.d / SD);
    const b = near(x, z, BL); if (!b.past && b.d < FB) y = Math.max(y, H * fall(b.d / FB));
    return y;
  }
  /* which part of the ground a point is on: 'top', 'bank' (the front slope, where the stairs are), 'back', or '' */
  function part(x, z){
    if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1 || inNotch(x, z)) return '';
    if (inPoly(x, z, R)) return 'top';
    const f = near(x, z, TL); if (!f.past && f.d < SD) return 'bank';
    const b = near(x, z, BL); if (!b.past && b.d < FB) return 'back';
    return '';
  }
  /* outward normal of a polyline segment: TL faces south (+z), BL north */
  const segN = (L, i, south) => { const a = L[i], b = L[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l; return south ? [-tz, tx, tx, tz] : [tz, -tx, tx, tz]; };
  /* the promenade along the foot of the bank: TL pushed out by the bank and half the road, joined to the old ends */
  /* sampled every 4 m, smoothed round the steps between blocks, and pushed back out wherever smoothing took it onto the bank (its edge never climbs the slope) */
  const D = SD + 6.3, prom = [];
  for (let i = 0; i < TL.length - 1; i++){
    const a = TL[i], b = TL[i + 1], n = segN(TL, i, true), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < l - .5 || (i === TL.length - 2 && s <= l); s += Math.min(4, Math.max(.5, l))){ const t = Math.min(1, s / l); prom.push([a[0] + (b[0] - a[0]) * t + n[0] * D, a[1] + (b[1] - a[1]) * t + n[1] * D]); if (t >= 1) break; }
  }
  const push = () => { for (const p of prom){
    let best = 1e9, qx = 0, qz = 0;
    for (let i = 0; i < TL.length - 1; i++){ const a = TL[i], b = TL[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))), x = a[0] + t * dx, z = a[1] + t * dz, d = Math.hypot(p[0] - x, p[1] - z); if (d < best){ best = d; qx = x; qz = z; } }
    if (best < D){ p[0] = qx + (p[0] - qx) / best * D; p[1] = qz + (p[1] - qz) / best * D; }
  } };
  for (let it = 0; it < 4; it++){ for (let i = 1; i < prom.length - 1; i++) prom[i] = [(prom[i - 1][0] + prom[i][0] * 2 + prom[i + 1][0]) / 4, (prom[i - 1][1] + prom[i][1] * 2 + prom[i + 1][1]) / 4]; push(); }
  for (let i = prom.length - 1; i > 0; i--) if (Math.hypot(prom[i][0] - prom[i - 1][0], prom[i][1] - prom[i - 1][1]) < 2) prom.splice(i, 1);
  prom.unshift([-132, 168.6]); prom.push([360, 153.6]);
  const promZ = x => { for (let i = 0; i < prom.length - 1; i++){ const a = prom[i], b = prom[i + 1]; if (x >= a[0] && x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0] || 1); } return prom[prom.length - 1][1]; };
  /* the walls at both ends, as polylines with the side the ground is on: west (bank cut, A1's west face, back cut), east (one straight run, garage in the middle) */
  const nT0 = segN(TL, 0, true), nB0 = segN(BL, 0, false), nTe = segN(TL, TL.length - 2, true), nBe = segN(BL, BL.length - 2, false);
  const WALLS = [
    {pts:[[TL[0][0] + nT0[0] * SD, TL[0][1] + nT0[1] * SD], TL[0], BL[0], [BL[0][0] + nB0[0] * FB, BL[0][1] + nB0[1] * FB]], inside:1},
    {pts:[[TL[TL.length - 1][0] + nTe[0] * SD, TL[TL.length - 1][1] + nTe[1] * SD], TL[TL.length - 1], BL[BL.length - 1], [BL[BL.length - 1][0] + nBe[0] * FB, BL[BL.length - 1][1] + nBe[1] * FB]], inside:-1}
  ];
  /* one flight of steps per block, centred on its porch; A3's is the grand one */
  const FLIGHTS = [[0, .5, 16], [2, .5, 16], [4, .5, 46], [6, .5, 16], [8, .5, 16]].map(([i, t, W]) => {
    const a = TL[i], b = TL[i + 1], n = segN(TL, i, true);
    return {x:a[0] + (b[0] - a[0]) * t, z:a[1] + (b[1] - a[1]) * t, nx:n[0], nz:n[1], tx:n[2], tz:n[3], W, grand:W > 30};
  });
  /* A3's grand stair: centred on the block, not on the middle of its piece of TL */
  FLIGHTS[2].x = 105;
  /* the lake ring road (环湖路), clockwise from the east road: along the south shore behind the A row, past the bridge head, round the west end of the
     north lake outside 音乐岛, up to the road along the north shore (which, with the east road, closes the ring) */
  const RING = [[360, 38], [340, 40], [300, 40], [262, 34], [240, 30], [205, 35], [186, 34], [160, 26], [132, 17], [110, 4], [100, -18], [96, -34], [86, -46], [60, -50], [35, -52], [10, -58], [-8, -72], [-14, -92], [-14, -110]];
  const CORR = {x:105, z0:44.6, z1:10.5, w:5.2};   /* the one covered walk: from the back of A3 down the slope to the ring road, toward the bridge */
  return {H, SD, FB, TL, BL, R, NOTCH, BOX, raw, part, near, prom, promZ, WALLS, FLIGHTS, RING, CORR, flat:false, built:false, lifted:[], roads:[], meshes:[], cols:[], cheeks:[]};
})();
/* ground height of the A zone at (x, z); 0 elsewhere, and 0 everywhere in black-hole mode (the campus is flat there) */
function azY(x, z){ return AZ.flat ? 0 : AZ.raw(x, z); }
/* map-pixel lines the world uses (js/10-world.js): the promenade, the ring road, the old back road rerouted to it, the side road beside A5, the covered walk's floor */
const AZ_PX = {
  prom:AZ.prom.map(([x, z]) => PX(x, z)),
  ring:AZ.RING.map(([x, z]) => PX(x, z)),
  back:[[700, 620], [860, 560], [1000, 520], [1072, 477], [1147, 454], [1163, 450.7]],
  diag:[[580, 370], [640, 440], [760, 470], [900, 460], [1000, 470], [1072, 477]],
  side:[[307, 119], [307, 74], [303, 52], [300, 40]].map(([x, z]) => PX(x, z)),
  garage:[[358, 100], [326, 100]].map(([x, z]) => PX(x, z)),
  corr:[[AZ.CORR.x, AZ.CORR.z0 - .4], [AZ.CORR.x, 4]].map(([x, z]) => PX(x, z)),
  bridge:PX(96.5, -38),   /* where the path to the bridge leaves the ring road */
  axisEnd:PX(GX_AZ(), AZ.promZ(GX_AZ()) + 2.5)   /* the axis road stops at the promenade (its round end stays off the bank) */
};
function GX_AZ(){ return (1180 - CX) * SC; }   /* the gate axis (GX in js/10-world.js, which is defined later) */

/* things standing where the ground is now a stair, a bank or a wall (trees, lamps, benches): cleared with the gate's set on the first frame (js/42-gate.js) */
function azClears(kind, x, z){
  const p = AZ.part(x, z);
  if (p === 'bank') return true;
  if (p === 'top' && kind === 'tree' && AZ.near(x, z, AZ.TL).d < 14) return true;
  for (const w of AZ.WALLS) for (let i = 0; i < w.pts.length - 1; i++) if (segDist(x, z, w.pts[i], w.pts[i + 1]) < 3.2) return true;
  const N = AZ.NOTCH; if (x > N.x0 - 2 && x < 362 && z > N.z0 - 3 && z < N.z1 + 3) return true;
  const C = AZ.CORR; if (Math.abs(x - C.x) < C.w / 2 + 1.5 && z < C.z0 + 1 && z > C.z1 - 1) return true;
  for (const p2 of AZ_PAVS) if (Math.hypot(x - p2[0], z - p2[1]) < 6) return true;
  return false;
}
/* the two lakeside pavilions: near A5, and where the path from the bridge meets the north road near LY5 */
const AZ_PAVS = [[316, 29, '湖边亭', '芙蓉湖南岸、A5 后面的小亭子，六根红柱子，坐在里面能看到整片湖和芙蓉桥。'],
  [224, -96, '桥头亭', '芙蓉桥北头、靠 LY5 那个路口的小亭子。从宿舍去教学楼的人常在这里等同学。']];

/* ---------- building it (called once from js/42-gate.js, after lateColsSwap, when every block, tree and prop is in place) ---------- */
function azBuild(){
  if (AZ.built) return; AZ.built = true;
  const {H, SD, FB, TL, R, NOTCH, FLIGHTS, WALLS} = AZ;
  /* ---- the ground: one vertex-coloured mesh on a 2 m grid (paving on top, grass on the slopes), with a hole over the garage bay ---- */
  /* the blocks standing on the top hide the ground under them: those cells are left out (a box per block, shrunk a little) */
  const under = [];
  for (const st of structures) if (st.groups.some(g => AZ.raw(g.position.x, g.position.z) >= H - .01)) for (const c of st.cols) if (!c.t && !c.dead && c.hx > 6) under.push(c);
  const hidden = (x, z) => under.some(c => { const dx = x - c.cx, dz = z - c.cz; return Math.abs(dx * c.c - dz * c.s) < c.hx - 1.2 && Math.abs(dx * c.s + dz * c.c) < c.hz - 1.2; });
  { const C = XQ.tier ? 2 : 3, x0 = AZ.BOX.x0, z0 = AZ.BOX.z0, nx = Math.ceil((AZ.BOX.x1 - x0) / C) + 1, nz = Math.ceil((AZ.BOX.z1 - z0) / C) + 1;   /* 3 m cells on 流畅 */
    const Y = new Float32Array(nx * nz), T = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){ const x = x0 + i * C, z = z0 + j * C, k = j * nx + i; Y[k] = AZ.raw(x, z); T[k] = inPoly(x, z, R) ? 1 : 0; }
    const pos = [], col = [], idx = [], map = new Int32Array(nx * nz).fill(-1), cPave = new THREE.Color('#a39b8b'), cPave2 = new THREE.Color('#968e7e'), cGrass = new THREE.Color('#4c7334'), cGrass2 = new THREE.Color('#567d3a'), c = new THREE.Color();
    const N = NOTCH, hole = (x, z) => x > N.x0 && x < N.x1 + 2 && z > N.z0 && z < N.z1;
    const v = k => {
      if (map[k] >= 0) return map[k];
      const i = k % nx, j = (k - i) / nx, x = x0 + i * C, z = z0 + j * C;
      map[k] = pos.length / 3; pos.push(x, Y[k] + .03, z);
      if (T[k]) c.copy(cPave).lerp(cPave2, hash2(i * 3 + 1, j * 7 + 2) * .8); else c.copy(cGrass).lerp(cGrass2, vnoise(x / 9, z / 9));
      col.push(c.r, c.g, c.b); return map[k];
    };
    const idxP = [];   /* cells paved all round go to their own mesh, which carries the paving pattern */
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++){
      const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
      if (Y[a] < .02 && Y[b] < .02 && Y[cc] < .02 && Y[d] < .02) continue;
      const xm = x0 + (i + .5) * C, zm = z0 + (j + .5) * C;
      const hc = C / 2; if (hole(xm - hc, zm - hc) || hole(xm + hc, zm - hc) || hole(xm - hc, zm + hc) || hole(xm + hc, zm + hc)) continue;
      if (hidden(xm - C / 2, zm - C / 2) && hidden(xm + C / 2, zm - C / 2) && hidden(xm - C / 2, zm + C / 2) && hidden(xm + C / 2, zm + C / 2)) continue;
      (T[a] && T[b] && T[cc] && T[d] ? idxP : idx).push(v(a), v(cc), v(b), v(b), v(cc), v(d));
    }
    const uv = new Float32Array(pos.length / 3 * 2); for (let k = 0; k < uv.length / 2; k++){ uv[k * 2] = pos[k * 3] / 6; uv[k * 2 + 1] = pos[k * 3 + 2] / 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx.concat(idxP)); g.computeVertexNormals();
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const gP = new THREE.BufferGeometry(); for (const k of ['position', 'color', 'normal', 'uv']) gP.setAttribute(k, g.attributes[k]); gP.setIndex(idxP); g.setIndex(idx);
    /* the paving on top: granite slabs 0.75 m square in rows, each its own shade, fine joints (the texture is 6 m; mipmaps fade the joints out with distance) */
    const pc = document.createElement('canvas'); pc.width = pc.height = 256; const pg = pc.getContext('2d'), pr = mkRng(6507), S8 = 256 / 8;
    pg.fillStyle = '#bdb7ac'; pg.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){ const l = 245 + (pr() * 11) | 0; pg.fillStyle = `rgb(${l},${l - 2},${l - 6})`; pg.fillRect(c * S8 + 1, r * S8 + 1, S8 - 2, S8 - 2); }
    pg.fillStyle = 'rgba(150,142,128,.55)'; for (const k of [0, 4]){ pg.fillRect(0, k * S8, 256, 2); pg.fillRect(k * S8, 0, 2, 256); }   /* a heavier joint every 3 m */
    const pt = new THREE.CanvasTexture(pc); pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.anisotropy = ANISO;
    const m = new THREE.Mesh(g, regWet(M('#ffffff', {vertexColors:true, roughness:.92}), .55)); m.receiveShadow = true; scene.add(m); AZ.meshes.push(m);
    const mp = new THREE.Mesh(gP, regWet(M('#ffffff', {vertexColors:true, map:pt, roughness:.88}), .5)); mp.receiveShadow = true; scene.add(mp); AZ.meshes.push(mp);
  }
  /* q: a quad turned to face `dir` (whatever order its corners come in) */
  const P2 = [], lamps = [], q = (a, b, c, e, col, dir) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * dir[0] + (uz * vx - ux * vz) * dir[1] + (ux * vy - uy * vx) * dir[2];
    P2.push(d >= 0 ? quadGeo(a, b, c, e, col) : quadGeo(e, c, b, a, col));
  }, UPV = [0, 1, 0], DNV = [0, -1, 0];
  /* ---- the flights: light treads, darker risers, so the steps read from across the lawn; granite cheek walls; A3's has a dark runner and lantern piers ---- */
  for (const f of FLIGHTS){
    const n = 26, run = SD / n, rise = H / n, W2 = f.W / 2;
    const at = (u, s, y) => [f.x + f.tx * u + f.nx * s, y, f.z + f.tz * u + f.nz * s];
    const bands = f.grand ? [[-W2, -2.6, 0], [-2.6, 2.6, 1], [2.6, W2, 0]] : [[-W2, W2, 0]];
    for (let k = 0; k < n; k++){
      const s0 = SD - (k + 1) * run, s1 = SD - k * run, y0 = k * rise, y1 = (k + 1) * rise;
      for (const [u0, u1, dark] of bands){
        const tread = dark ? '#5b5650' : k % 2 ? '#cfc8b9' : '#c6bfaf', riser = dark ? '#3c3935' : '#8b8478';
        q(at(u0, s0, y1), at(u1, s0, y1), at(u1, s1, y1), at(u0, s1, y1), tread, UPV);
        q(at(u0, s1, y1), at(u1, s1, y1), at(u1, s1, y0), at(u0, s1, y0), riser, [f.nx, 0, f.nz]);
      }
    }
    for (const sg of [-1, 1]){
      const u = sg * (W2 + .45), wa = u - .45, wb = u + .45, top = s => H * (1 - s / SD) + .55;
      for (const [s0, s1] of [[-.6, SD + .3]]){
        const A0 = at(wa, s0, Math.min(H + .55, top(s0))), B0 = at(wb, s0, Math.min(H + .55, top(s0))), A1 = at(wa, s1, top(s1)), B1 = at(wb, s1, top(s1));
        q(A0, B0, B1, A1, '#b3ab9c', UPV);
        for (const [ua, sd] of [[wa, -1], [wb, 1]]) q(at(ua, s0, -.2), at(ua, s1, -.2), at(ua, s1, top(s1)), at(ua, s0, Math.min(H + .55, top(s0))), '#9a9284', [f.tx * sd, 0, f.tz * sd]);
        q(at(wa, s1, -.2), at(wb, s1, -.2), at(wb, s1, top(s1)), at(wa, s1, top(s1)), '#9a9284', [f.nx, 0, f.nz]);
      }
      /* the cheek walls stand only ~.55 m above the steps and the bank either side, so you walk or drive over them (people kept running into them).
         Their box stays while the rest of the props are placed (a row of them skips it), then js/42-gate.js drops it on the first frame */
      const mid = at(u, SD / 2 - .15, 0); AZ.cheeks.push(addBox(mid[0], mid[2], .5, SD / 2 + .45, Math.atan2(-f.tz, f.tx)));
      if (f.grand){
        /* lantern pier: a moulded granite pier, an iron lantern with corner posts under a pyramid hood */
        const pp = at(u, SD + 1.1, 0), X = pp[0], Z = pp[2];
        P2.push(geoTint(new THREE.BoxGeometry(1.9, .3, 1.9).translate(X, .15, Z), '#a39b8e'), geoTint(new THREE.BoxGeometry(1.45, 1.3, 1.45).translate(X, .95, Z), '#b9b1a2'),
          geoTint(new THREE.BoxGeometry(1.55, .1, 1.55).translate(X, 1.4, Z), '#a39b8e'), geoTint(new THREE.BoxGeometry(1.8, .2, 1.8).translate(X, 1.55, Z), '#d3ccbe'),
          geoTint(new THREE.BoxGeometry(.8, .12, .8).translate(X, 1.71, Z), '#2a2c30'), geoTint(new THREE.ConeGeometry(.64, .42, 4).rotateY(Math.PI / 4).translate(X, 2.73, Z).toNonIndexed(), '#2a2c30'),
          geoTint(new THREE.SphereGeometry(.08, 8, 6).translate(X, 2.98, Z).toNonIndexed(), '#c9982e'));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P2.push(geoTint(new THREE.BoxGeometry(.07, .78, .07).translate(X + sx * .3, 2.15, Z + sz * .3), '#2a2c30'));
        lamps.push(new THREE.BoxGeometry(.54, .7, .54).translate(X, 2.13, Z));
        gatePools.push([pp[0], .1, pp[2] + 1.5, 6]); AZ.cols.push(addBox(pp[0], pp[2], .9, .9, 0));
      }
    }
  }
  /* ---- a stone coping along the top of the bank (between the flights), and a low kerb along its foot ---- */
  for (let i = 0; i < TL.length - 1; i++){
    const a = TL[i], b = TL[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l, nx = -tz, nz = tx;
    for (let s = 0; s < l - .01; s += 2){
      const s1 = Math.min(l, s + 2), mx = a[0] + tx * (s + s1) / 2, mz = a[1] + tz * (s + s1) / 2;
      if (FLIGHTS.some(f => Math.abs((mx - f.x) * f.tx + (mz - f.z) * f.tz) < f.W / 2 + .9 && Math.abs((mx - f.x) * f.nx + (mz - f.z) * f.nz) < 2)) continue;
      const p = (u, o, y) => [a[0] + tx * u + nx * o, y, a[1] + tz * u + nz * o];
      q(p(s, -.7, H + .14), p(s1, -.7, H + .14), p(s1, .25, H + .14), p(s, .25, H + .14), '#c3bcad', UPV); q(p(s, .25, H + .14), p(s1, .25, H + .14), p(s1, .25, H - .5), p(s, .25, H - .5), '#a69f91', [nx, 0, nz]);
    }
  }
  /* ---- retaining walls at both ends: granite, a coping, a parapet wherever the drop is more than a metre ---- */
  const wallRun = (a, b, inside, yTop, opening) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l, nx = -tz * inside, nz = tx * inside;   /* (nx, nz): toward the raised side */
    const p = (u, o, y) => [a[0] + tx * u + nx * o, y, a[1] + tz * u + nz * o];
    for (let s = 0; s < l - .01; s += 1.5){
      const s1 = Math.min(l, s + 1.5), y0 = yTop(p(s, 2.4, 0)), y1 = yTop(p(s1, 2.4, 0));
      if (y0 < .05 && y1 < .05) continue;
      const lo = opening && opening(p((s + s1) / 2, 0, 0)) ? 3.6 : -.3;
      const OUT = [-nx, 0, -nz], IN = [nx, 0, nz];
      q(p(s, -.6, lo), p(s1, -.6, lo), p(s1, -.6, y1 + .2), p(s, -.6, y0 + .2), '#8f887c', OUT);
      q(p(s, -.6, y0 + .2), p(s1, -.6, y1 + .2), p(s1, 2.4, y1 + .2), p(s, 2.4, y0 + .2), '#b7b0a2', UPV);
      if (lo > 0) q(p(s1, -.6, lo), p(s, -.6, lo), p(s, 2.4, lo), p(s1, 2.4, lo), '#3d3b38', DNV);
      if (y0 > 1 && y1 > 1){
        q(p(s, -.62, y0 + .2), p(s1, -.62, y1 + .2), p(s1, -.62, y1 + 1.2), p(s, -.62, y0 + 1.2), '#c9c2b4', OUT); q(p(s1, -.25, y1 + .2), p(s, -.25, y0 + .2), p(s, -.25, y0 + 1.2), p(s1, -.25, y1 + 1.2), '#bdb6a8', IN);
        q(p(s, -.68, y0 + 1.2), p(s1, -.68, y1 + 1.2), p(s1, -.2, y1 + 1.2), p(s, -.2, y0 + 1.2), '#d6d0c3', UPV);
      }
    }
  };
  const N = NOTCH, inOpening = pt => pt[2] > N.z0 && pt[2] < N.z1;
  for (const w of WALLS) for (let i = 0; i < w.pts.length - 1; i++){
    const a = w.pts[i], b = w.pts[i + 1];
    wallRun(a, b, w.inside, pt => AZ.raw(pt[0], pt[2]), w.inside < 0 ? inOpening : null);
    /* colliders: the whole run, but not across the garage opening */
    const cut = w.inside < 0 && Math.abs(a[0] - b[0]) < 1 && Math.min(a[1], b[1]) < N.z0 && Math.max(a[1], b[1]) > N.z1;
    const spans = cut ? [[a, [a[0], N.z1]], [[b[0], N.z0], b]] : [[a, b]];
    for (const [p0, p1] of spans){ const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), tx = (p1[0] - p0[0]) / l, tz = (p1[1] - p0[1]) / l, o = -.1 * w.inside;
      AZ.cols.push(addBox((p0[0] + p1[0]) / 2 - tz * o, (p0[1] + p1[1]) / 2 + tx * o, l / 2 + .3, .75, Math.atan2(-tz, tx))); }
  }
  /* ---- the garage: a bay at ground level under a deck, side and back walls, ceiling lights, a raised barrier, signs; three parked cars ---- */
  { const xa = N.x0, xb = N.x1, za = N.z0, zb = N.z1, zm = (za + zb) / 2;
    tbox(P2, xb + 2.2 - (xa - 3.4), .76, zb - za + 6.4, (xa - 3.4 + xb + 2.2) / 2, H - .32, zm, '#a39b8b');   /* the deck (its top is the paving above, covering the hole left in the ground mesh) */
    tbox(P2, xb - xa + .4, .06, zb - za, (xa + xb) / 2, H - .7, zm, '#d9d6cf');
    for (const z of [za - .6, zb + .6]){ tbox(P2, xb - xa + 1.2, H - .2, 1.2, (xa + xb) / 2 - .6, (H - .2) / 2 - .1, z, '#8f887c'); AZ.cols.push(addBox((xa + xb) / 2 - .6, z, (xb - xa) / 2 + .6, .6, 0)); }
    tbox(P2, 1.2, H - .2, zb - za + 2.4, xa - .6, (H - .2) / 2 - .1, zm, '#8f887c'); AZ.cols.push(addBox(xa - .6, zm, .6, (zb - za) / 2 + 1.2, 0));
    tbox(P2, xb - xa + 2, .05, zb - za, (xa + xb) / 2 + 1, .045, zm, '#3f3e3c');
    for (let k = 0; k < 4; k++) tbox(P2, .14, .03, 5, xa + 1.5 + k * 2.8, .08, zb - 2.6, '#f0ece2');
    for (let k = 0; k < 3; k++) lamps.push(new THREE.BoxGeometry(.25, .08, 3).translate(xa + 2.2 + k * 3.6, H - .76, zm));
    /* "P" on the back wall, the barrier at the mouth (arm raised), the sign over the portal */
    tbox(P2, .1, 2.2, 2.2, xa + .02, 2.1, zm, '#1d4f9a');
    tbox(P2, .5, 1.1, .5, xb + 1.4, .55, za + 1.2, '#e2b52d'); P2.push(geoTint(new THREE.BoxGeometry(.12, 4.6, .12).translate(xb + 1.4, 3.4, za + 1.2), '#e8e2d6'));
    for (let k = 0; k < 5; k++) tbox(P2, .14, .6, .14, xb + 1.4, 1.6 + k * .9, za + 1.2, k % 2 ? '#c0392b' : '#f4f1ea');
    const sc = document.createElement('canvas'); sc.width = 512; sc.height = 128; const g = sc.getContext('2d'), st = new THREE.CanvasTexture(sc); st.anisotropy = ANISO;
    const paint = () => { g.fillStyle = '#16365f'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.fillRect(14, 14, 100, 100); g.fillStyle = '#16365f'; g.font = '900 92px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('P', 64, 68);
      g.fillStyle = '#fff'; g.font = '700 46px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'left'; g.fillText('地下停车场', 136, 50); g.font = '600 26px Arial, sans-serif'; g.fillStyle = '#bcd3f0'; g.fillText('CAR PARK · A1–A5', 138, 98); st.needsUpdate = true; };
    paint(); document.fonts && document.fonts.ready.then(paint);
    const sm = new THREE.MeshBasicMaterial({map:st}), sign = new THREE.PlaneGeometry(9, 2.25).rotateY(Math.PI / 2).translate(xb + .7, 4.95, zm);
    const post = new THREE.PlaneGeometry(3.2, .8).rotateY(Math.PI / 2).translate(342, 3.3, za - 3.2);
    const sgm = new THREE.Mesh(geoMergeUV([sign.toNonIndexed(), post.toNonIndexed()]), sm); scene.add(sgm); AZ.meshes.push(sgm);
    tbox(P2, .16, 3.6, .16, 342, 1.8, za - 3.2, '#3a3d42');
    makeCar('sedan', '#7f8c8d', xa + 3.6, zb - 2.6, Math.PI / 2); makeCar('myvi', '#c0392b', xa + 6.4, zb - 2.6, Math.PI / 2);
    addLabel('地下停车场', xb + 3, 9, zm, true);
  }
  /* ---- podiums under the lifted blocks (where the back slope falls away from them), with vents along the back ---- */
  const liftSt = [];
  for (const st of structures){
    if (st.gone) continue;
    let lifted = false;
    for (const g of st.groups){ const y = AZ.raw(g.position.x, g.position.z); if (y < .3) continue; AZ.lifted.push({g, y}); g.position.y += y; g.userData.base.y += y; lifted = true; }
    if (!lifted) continue;
    liftSt.push(st);
    for (const c of st.cols){
      if (c.t || c.dead) continue;
      const y = AZ.raw(c.cx, c.cz); if (y < .3) continue;
      const ry = Math.atan2(c.s, c.c), hx = c.hx + .45, hz = c.hz + .45;
      P2.push(geoTint(geoAt(new THREE.BoxGeometry(hx * 2, y + .3, hz * 2), c.cx, (y - .3) / 2, c.cz, 0, ry, 0), '#968f82'),
        geoTint(geoAt(new THREE.BoxGeometry(hx * 2 + .3, .45, hz * 2 + .3), c.cx, y - .5, c.cz, 0, ry, 0), '#b4ad9f'));
      const cs = Math.cos(ry), sn = Math.sin(ry), lz = -hz - .06;
      for (let u = -hx + 3; u < hx - 2; u += 5.5) P2.push(geoTint(geoAt(new THREE.BoxGeometry(2.6, .9, .1), c.cx + u * cs + lz * sn, y - 1.6, c.cz - u * sn + lz * cs, 0, ry, 0), '#2e302f'));
    }
  }
  /* ---- 连廊: the one covered walk, white columns and a red tiled roof, from the back of A3 down the slope; cars pass between its columns ----
     The roof is one piece that follows the slope (beams and ridge pitched bay by bay), with the swallowtail ridge ends only at the top and the bottom. */
  { const C = AZ.CORR, n = Math.round((C.z0 - C.z1) / 4.6), L = (C.z0 - C.z1) / n, roofs = {tile:[], ridge:[]}, info = {name:'连廊', tag:'景观', desc:'学校里唯一的一条连廊：白柱子、红瓦屋檐，从 A3 后门顺着坡一直通到环湖路，再往前就是芙蓉桥。柱子之间够宽，车也能从底下穿过去。'};
    const parts = [], WHITE = '#f4efe6', zk = k => C.z0 - k * L, yT = k => AZ.raw(C.x, zk(k)) + 4.1;   /* yT: top of the columns in row k */
    for (let k = 0; k <= n; k++){
      const z = zk(k);
      for (const s of [-1, 1]){
        const x = C.x + s * C.w / 2, y = AZ.raw(x, z), h = yT(k) - y;
        parts.push(geoTint(new THREE.CylinderGeometry(.24, .28, h, 10).translate(x, y + h / 2, z).toNonIndexed(), WHITE), geoTint(new THREE.BoxGeometry(.7, .3, .7).translate(x, y + .15, z), '#d8d1c4'),
          geoTint(new THREE.BoxGeometry(.46, .16, .46).translate(x, yT(k) - .32, z), '#e4ddd0'));
        AZ.cols.push(addCircle(x, z, .3));
      }
      tbox(parts, C.w + .3, .3, .3, C.x, yT(k) - .1, z, WHITE);
    }
    /* pitched beams along both sides */
    const pitched = (list, w, h, x, ya, za, yb, zb, col) => { const len = Math.hypot(ya - yb, za - zb); list.push(geoTint(geoAt(new THREE.BoxGeometry(w, h, len), x, (ya + yb) / 2, (za + zb) / 2, -Math.atan2(ya - yb, za - zb), 0, 0), col)); };
    for (let k = 0; k < n; k++) for (const s of [-1, 1]) pitched(parts, .3, .42, C.x + s * C.w / 2, yT(k) - .1, zk(k), yT(k + 1) - .1, zk(k + 1), WHITE);
    /* the roof: a curved section (eave to ridge), swept down the corridor through every column row, running 0.9 m past the end rows */
    const D = C.w / 2 + .75, HR = 1.45, NS = 4, prof = t => HR * Math.pow(t, 1.6), U = TILE_U, V = TILE_V;
    const rows = [{z:zk(0) + .9, y:yT(0) + .12 + (yT(0) - yT(1)) / L * .9}];
    for (let k = 0; k <= n; k++) rows.push({z:zk(k), y:yT(k) + .12});
    rows.push({z:zk(n) - .9, y:yT(n) + .12 - (yT(n - 1) - yT(n)) / L * .9});
    const pos = [], uv = [], tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
    const quadUp = (a, b, c, e, ua, ub, uc, ue) => {   /* two triangles, wound so the face looks up/out */
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2], ny = uz * vx - ux * vz, nx = uy * vz - uz * vy, mx = (a[0] + c[0]) / 2 - C.x;
      if (ny + nx * Math.sign(mx) * .3 >= 0){ tri(a, b, c, ua, ub, uc); tri(a, c, e, ua, uc, ue); } else { tri(a, c, b, ua, uc, ub); tri(a, e, c, ua, ue, uc); }
    };
    let run = 0;
    for (let r = 0; r < rows.length - 1; r++){
      const A = rows[r], B = rows[r + 1], seg = Math.hypot(A.y - B.y, A.z - B.z);
      for (const side of [-1, 1]){
        let sl = 0;
        for (let j = 0; j < NS; j++){
          const t0 = j / NS, t1 = (j + 1) / NS, x0 = C.x + side * D * (1 - t0), x1 = C.x + side * D * (1 - t1), l = Math.hypot(D / NS, prof(t1) - prof(t0));
          quadUp([x0, A.y + prof(t0), A.z], [x0, B.y + prof(t0), B.z], [x1, B.y + prof(t1), B.z], [x1, A.y + prof(t1), A.z],
            [run / U, sl / V], [(run + seg) / U, sl / V], [(run + seg) / U, (sl + l) / V], [run / U, (sl + l) / V]);
          sl += l;
        }
        /* eave fascia */
        const xe = C.x + side * D, z2 = [0, 0]; quadUp([xe, A.y - .3, A.z], [xe, B.y - .3, B.z], [xe, B.y, B.z], [xe, A.y, A.z], z2, z2, z2, z2);
      }
      roofs.ridge.push(geoTint(rodGeo(.3, .3, [C.x, A.y + HR + .12, A.z], [C.x, B.y + HR + .12, B.z], 4).toNonIndexed(), '#8f2f1f'));
      run += seg;
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.computeVertexNormals();
    roofs.tile.push(tg);
    /* swallowtail ends at the top and the bottom, white gables under the first and last bays */
    for (const [row, e] of [[rows[0], 1], [rows[rows.length - 1], -1]]){
      for (const side of [-1, 1]){ _cm.compose(_cp.set(C.x, row.y + HR + .3, row.z), _cq.setFromUnitVectors(UP, new THREE.Vector3(side * .22, .75, e * .9).normalize()), _cs.setScalar(.75)); roofs.ridge.push(hornGeo.clone().applyMatrix4(_cm)); }
      const k = e > 0 ? 0 : n, zg = zk(k) + e * .2, yb = yT(k) + .02, gp = [];
      for (let j = 0; j < 8; j++){ const v0 = -C.w / 2 - .1 + (C.w + .2) * j / 8, v1 = -C.w / 2 - .1 + (C.w + .2) * (j + 1) / 8, h0 = prof(1 - Math.abs(v0) / D) + .05, h1 = prof(1 - Math.abs(v1) / D) + .05;
        const a = [C.x + v0, yb, zg], b = [C.x + v1, yb, zg], c = [C.x + v1, yb + h1, zg], d = [C.x + v0, yb + h0, zg];
        parts.push(quadGeo(a, b, c, d, WHITE), quadGeo(d, c, b, a, WHITE)); }
    }
    const m = new THREE.Mesh(geoMerge(parts), decoMat); m.castShadow = m.receiveShadow = true; scene.add(m);
    const rm = roofMeshes(roofs, roofMat('#c4502a'), scene);
    [m, ...rm].forEach(o => { o.userData.info = info; pickables.push(o); });
    addLabel('连廊', C.x, 9, (C.z0 + C.z1) / 2, true);   /* labels are lifted onto the ground under them by azFollow */
  }
  /* ---- the pavilions: a hexagonal stone base, six red columns, benches between them, a tiled roof with turned-up corners ---- */
  for (const [x, z, name, desc] of AZ_PAVS){
    const info = {name, tag:'景观', desc}, parts = [], R6 = 3.2, roofC = '#b8462a';
    parts.push(geoTint(new THREE.CylinderGeometry(4.2, 4.4, .36, 6).translate(x, .18, z).toNonIndexed(), '#b9b1a2'), geoTint(new THREE.CylinderGeometry(3.7, 3.7, .1, 6).translate(x, .4, z).toNonIndexed(), '#cfc8b9'));
    for (let k = 0; k < 6; k++){
      const a = k / 6 * Math.PI * 2, cx = x + Math.cos(a) * R6, cz = z + Math.sin(a) * R6, a2 = (k + .5) / 6 * Math.PI * 2;
      parts.push(geoTint(new THREE.CylinderGeometry(.16, .18, 3, 10).translate(cx, 1.95, cz).toNonIndexed(), '#ad2a20'));
      if (k !== 1) parts.push(geoTint(geoAt(new THREE.BoxGeometry(2.6, .1, .55), x + Math.cos(a2) * (R6 - .25), .88, z + Math.sin(a2) * (R6 - .25), 0, -a2 + Math.PI / 2, 0), '#7b5334'),
        geoTint(geoAt(new THREE.BoxGeometry(2.6, .5, .08), x + Math.cos(a2) * (R6 + .02), 1.14, z + Math.sin(a2) * (R6 + .02), 0, -a2 + Math.PI / 2, 0), '#ad2a20'));
      AZ.cols.push(addCircle(cx, cz, .25));
    }
    parts.push(geoTint(new THREE.CylinderGeometry(R6 + .25, R6 + .25, .38, 6, 1, true).translate(x, 3.4, z).toNonIndexed(), '#8f2019'));
    /* roof: a six-sided cone with a slight curve, corners lifted, a finial */
    const roof = new THREE.ConeGeometry(4.7, 2.6, 6, 3, true).toNonIndexed(), rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++){ const vx = rp.getX(i), vy = rp.getY(i), vz = rp.getZ(i), r = Math.hypot(vx, vz), t = (1.3 - vy) / 2.6; rp.setY(i, vy - .45 * Math.sin(Math.PI * t) + (r > 4.4 ? .35 : 0)); }
    roof.computeVertexNormals(); parts.push(geoTint(roof.translate(x, 4.85, z), roofC));
    parts.push(geoTint(new THREE.CylinderGeometry(4.75, 4.75, .14, 6, 1, true).translate(x, 3.62, z).toNonIndexed(), '#7e3019'), geoTint(new THREE.SphereGeometry(.32, 10, 8).translate(x, 6.35, z).toNonIndexed(), '#c9982e'),
      geoTint(new THREE.CylinderGeometry(.08, .2, .6, 8).translate(x, 6.05, z).toNonIndexed(), '#7e3019'));
    for (let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2; parts.push(geoTint(geoAt(new THREE.ConeGeometry(.16, .9, 5), x + Math.cos(a) * 4.75, 3.95, z + Math.sin(a) * 4.75, Math.sin(a) * .9, 0, -Math.cos(a) * .9), '#7e3019')); }
    const m = new THREE.Mesh(geoMerge(parts), decoMat); m.castShadow = m.receiveShadow = true; m.userData.info = info; pickables.push(m); scene.add(m);
    lamps.push(new THREE.BoxGeometry(.4, .4, .4).translate(x, 3.05, z)); gatePools.push([x, .1, z, 5]);
    addLabel(name, x, 9, z, true);
  }
  const dm = new THREE.Mesh(geoMerge(P2), decoMat); dm.castShadow = dm.receiveShadow = true; scene.add(dm); AZ.meshes.push(dm);
  const lm = new THREE.Mesh(geoMerge(lamps), gateLampMat); scene.add(lm);
  /* ---- the ground under everything else follows the new levels: hills (terrainY) give way to the A zone wherever it is higher ---- */
  { const base = terrainY; terrainY = function(x, z){ const a = azY(x, z), b = base(x, z); return a > b ? a : b; }; }
  /* black-hole mode plays on a flat campus: put everything back down (and up again after) */
  { const base = updateOutskirts; updateOutskirts = function(dt, T){ base(dt, T); azSyncFlat(); azFountain(dt); }; }
  /* markers, labels and coins placed at y ≈ 0 by other files: kept on the ground of the A zone, right before each render */
  { const r0 = renderer.render.bind(renderer); renderer.render = function(s, c){ if (s === scene) azFollow(); return r0(s, c); }; }
}
/* switch the lifted things between the A zone's levels and flat ground (black-hole mode) */
function azSyncFlat(){
  if (AZ.flat === TG.flat) return;
  AZ.flat = TG.flat;
  for (const m of AZ.meshes) m.visible = !AZ.flat;
  for (const {g, y} of AZ.lifted){ g.userData.base.y += AZ.flat ? -y : y; g.position.y += AZ.flat ? -y : y; }
  for (const r of AZ.roads){ r.attr.array.set(AZ.flat ? r.flat : r.lift); r.attr.needsUpdate = true; }
  for (const c of AZ.cols) c.dead = AZ.flat;
}
/* the little fountain in front of the name stone outside the gate (js/10-world.js): a spray, only while someone is near enough to see it */
let azFountAcc = 0;
function azFountain(dt){
  const G = GATE_PLAZA, cp = camera.position;
  if (Math.abs(cp.x - G.sx) > 140 || Math.abs(cp.z - G.fz) > 140){ azFountAcc = 0; return; }
  azFountAcc += dt * 14;
  while (azFountAcc > 1){ azFountAcc--; const a = Math.random() * 6.283, r = .25 + Math.random() * .45; spawnPart('dust', G.sx, 2.5, G.fz, .3, {vx:Math.cos(a) * r, vy:1.1 + Math.random() * .9, vz:Math.sin(a) * r, g:9, life:.75, op:.65, grow:.5, color:'#e9f7ff'}); }
}
/* every object that was put down at a fixed height (a ring at y = .1, a label at 6.5 m) is lifted by the ground under it; if its owner moves it, the new height is the base */
const azTrackMap = new WeakMap(); let azScanT = 0;
const AZ_FOLLOW = [];
function azTrack(v){
  const a = azY(v.x, v.z), k = azTrackMap.get(v);
  if (k && v.y === k.w){ if (k.l !== a){ v.y = k.w - k.l + a; k.w = v.y; k.l = a; return true; } return false; }
  v.y += a; azTrackMap.set(v, {w:v.y, l:a}); return a !== 0;
}
function azFollow(){
  const now = performance.now();
  if (now - azScanT > 2500){
    azScanT = now; AZ_FOLLOW.length = 0;
    for (const o of scene.children) if (o.userData && o.userData.ring) AZ_FOLLOW.push(o);
    for (const k of ['destMark', 'gxDestMark', 'gxPaxMark', 'gxCp', 'gxCpNext']){ try { const o = (0, eval)(k); if (o && o.position) AZ_FOLLOW.push(o); } catch(e){} }
    if (typeof CPS !== 'undefined') for (const cp of CPS) AZ_FOLLOW.push(cp.g);
  }
  for (const o of AZ_FOLLOW){ const x = o.position.x, z = o.position.z; if (x < AZ.BOX.x0 - 5 || x > AZ.BOX.x1 + 5 || z < AZ.BOX.z0 - 5 || z > AZ.BOX.z1 + 5) continue; if (azTrack(o.position)) o.updateMatrixWorld(true); }
  for (const L of labels){ const p = L.pos; if (p.x < AZ.BOX.x0 || p.x > AZ.BOX.x1 || p.z < AZ.BOX.z0 || p.z > AZ.BOX.z1) continue; azTrack(p); }
}
