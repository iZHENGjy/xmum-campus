/* XMUM 校园漫游 · 校外飞车乐园：校园西墙外、Jalan Sunsuria 北边的一大块平地（js/12-terrain.js 的 PARK_PAD，x -1002 ~ -798）
 *
 * 场内的黄色跳台落地区里有树、楼、路灯，飞远了就撞。这里单独划了一块地，都从主路往北拐进来：
 *   - 大跳台（x = -920）：150 多米助跑直道，7 米高的红白跳台，330 米长的铺装落地区，每 25 米一道线和距离数字，两边插旗；
 *     落地报飞行距离（从跳台边缘量），个人最好纪录存 prog.best.bigjump；
 *   - 波浪道 + 飞跃峡谷（x = -862）：六个连续的波浪包，快了会一个个飞起来；然后一个小跳台、16 米宽的沟和一个下坡土台，
 *     慢车掉进沟里再爬上土台，快车直接飞过去落在下坡上；
 *   - 360° 大回环（x = -822）：时速 102 公里以上冲进去能转一整圈，从旁边的出口道开出来；不够快就半路滑回来；
 *     转过几圈记在 prog.best.loops；
 *   - 漂移圆（西南角）：在圆里原地甩尾转圈算「甜甜圈」；
 *   - 8 字赛道（北边）：开过北头的方格线开始计时，按顺序（哪个方向都行）经过五个检查点再回到方格线算一圈，最快一圈存 prog.best.parkLap；
 *   - 摩天轮（路边的地标）：慢慢转，车厢一直朝下。
 * 纪录只存在本机（prog.best），不进排行榜。整块地上的山树一开始就清掉；地面在山树种好以后才压平（TG.flattenLate），所以地图上别的树一棵都不挪。
 * 车在乐园里撞到跳台、土台的侧面算撞墙（不再一下子「瞬移」到台子顶上），从台子边上开下去会真的掉下去。 */
'use strict';
(() => {
  if (typeof RAMPS === 'undefined' || typeof PARK_PAD === 'undefined' || !TG.flattenLate) return;
  const PI2 = Math.PI * 2, ROAD_Z = 266;                        /* north edge of Jalan Sunsuria (artN) */
  const PB = {x0:PARK_PAD.x0 - 10, x1:PARK_PAD.x1 + 8, z0:PARK_PAD.z0 - 10, z1:ROAD_Z + 2};   /* where the park's own physics apply */
  const inPark = (x, z) => x > PB.x0 && x < PB.x1 && z > PB.z0 && z < PB.z1;

  /* ---------- layout (every lane runs north, i.e. toward -z) ---------- */
  const CX = -920;                                               /* big jump */
  const BIG = {x:CX, z:101.25, fx:0, fz:-1, L:17.5, W:12, H:7, park:true};
  const LIP = BIG.z - BIG.L / 2, BASE = BIG.z + BIG.L / 2;      /* 92.5, 110 */
  const LAND = {hw:14, z1:LIP, z0:LIP - 337.5}, RUN = {hw:7, z0:BASE, z1:ROAD_Z};
  const L1 = -862, L1HW = 4.5;                                   /* rollers and the gap jump */
  const ROLL = {x:L1, zs:232, hw:4, len:60, f:u => .7 * (1 - Math.cos(PI2 * u / 10))};
  const GAPK = {x:L1, z:145.5, fx:0, fz:-1, L:9, W:8, H:2.6, park:true};       /* low end z 150, lip z 141 */
  const MOUND_P = [[0, 0], [6, 2.8], [10, 2.8], [50, 0]];       /* up face, flat top, a long gentle landing slope */
  const MOUND = {x:L1, zs:125, hw:4, len:50, f:u => { for (let i = 1; i < MOUND_P.length; i++){ const [u0, y0] = MOUND_P[i - 1], [u1, y1] = MOUND_P[i]; if (u <= u1) return y0 + (y1 - y0) * (u - u0) / (u1 - u0); } return 0; }};
  const SHAPES = [ROLL, MOUND];
  const LP = {x:-822, z:150, R:8, w:7, hw:2.8, g:20};            /* the loop: entry at (x, z), exit lane w m east */
  const LP_MIN = Math.sqrt(5 * LP.g * LP.R);                      /* entry speed that just makes it round (≈ 102 km/h) */
  const SK = {x:-975, z:140, r:20};                               /* drift circle, joined to the big-jump run-up by a short spur */
  const FW = {x:-978, z:205, y:18.5, r:14};                       /* Ferris wheel */
  const F8 = {x:-900, z:-368, A:90, B:42, hw:6};                  /* figure-8: x = x + B sin 2t, z = z + A sin t */
  const f8At = t => [F8.x + F8.B * Math.sin(2 * t), F8.z + F8.A * Math.sin(t)];
  const F8G = [-Math.PI / 2, -Math.PI / 4, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, 5 * Math.PI / 4].map(f8At);   /* [0] = start / finish */
  RAMPS.push(BIG, GAPK);

  /* ---------- level the park now that the hill trees are planted (js/12-terrain.js), re-seat the trees on its sloping edges, clear the rest ---------- */
  TG.flattenLate(PARK_PAD);
  const CLEAR = {x0:PARK_PAD.x0 - 10, x1:PARK_PAD.x1 + 8, z0:PARK_PAD.z0 - 10, z1:ROAD_Z - 4};
  let cleared = 0;
  if (typeof OUT_SETS !== 'undefined') for (const set of OUT_SETS) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    if (o.x > CLEAR.x0 && o.x < CLEAR.x1 && o.z > CLEAR.z0 && o.z < CLEAR.z1){   /* moved far away, so a black-hole reset can't stand them back up */
      o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); cleared++; return;
    }
    if (rectDist(o.x, o.z, PARK_PAD) > PARK_PAD.fall + 6) return;
    let y = terrainY(o.x, o.z);
    if (set.kind === 'tree'){ const r = .48 * o.s; for (let a = 0; a < 8; a++) y = Math.min(y, terrainY(o.x + Math.cos(a * .785) * r, o.z + Math.sin(a * .785) * r)); y -= .05; }   /* as js/13-outskirts.js plants them */
    if (Math.abs(y - o.y) > .005){ o.y = o.ty = y; setKnock(set, i, !!o.down, 0, 1); }
  });

  /* ---------- ground: the rollers and the landing mound (the two kickers are in RAMPS) ---------- */
  const shapeY = (S, x, z) => { if (Math.abs(x - S.x) >= S.hw) return 0; const u = S.zs - z; return u > 0 && u < S.len ? S.f(u) : 0; };
  { const base = groundAt; groundAt = function(x, z){ if (inPark(x, z)) for (const S of SHAPES){ const h = shapeY(S, x, z); if (h > 0) return h; } return base(x, z); }; }

  /* ---------- tiny triangle builder (vertex colours, winding picked from the wanted normal) ---------- */
  const mk = () => ({p:[], c:[]}), _c = new THREE.Color();
  function tri(b, A, B, C, col, n){
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (n && cx * n[0] + cy * n[1] + cz * n[2] < 0){ const t = B; B = C; C = t; }
    _c.set(col); for (const P of [A, B, C]){ b.p.push(P[0], P[1], P[2]); b.c.push(_c.r, _c.g, _c.b); }
  }
  const quad = (b, A, B, C, D, col, n) => { tri(b, A, B, C, col, n); tri(b, A, C, D, col, n); };
  const UPN = [0, 1, 0];
  const flat = (b, x0, z0, x1, z1, y, col) => quad(b, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, UPN);
  function ribbon(b, pts, o0, o1, y, colAt){   /* a flat band beside a polyline [[x, z], ...], offsets o0..o1 to its left */
    for (let i = 0; i < pts.length - 1; i++){
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / l, nz = (bx - ax) / l;
      quad(b, [ax + nx * o0, y, az + nz * o0], [bx + nx * o0, y, bz + nz * o0], [bx + nx * o1, y, bz + nz * o1], [ax + nx * o1, y, az + nz * o1], colAt(i), UPN);
    }
  }
  function toGeo(b){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.computeVertexNormals(); return g;
  }
  const RED = '#d6392b', WHITE = '#f4f1ea', ASPH = '#55585c', PAINT = '#eeeeea', YEL = '#f2c230', DARK = '#2b2e33';

  /* a solid on a north-running lane: profile [[u, y], ...] (u = metres north of zs), deck colour per segment, sides down to the ground */
  function solid(b, x, zs, hw, prof, deckCol, sideCol, endCol){
    const W = (u, v, y) => [x + v, y, zs - u];
    for (let i = 0; i < prof.length - 1; i++){
      const [u0, y0] = prof[i], [u1, y1] = prof[i + 1];
      quad(b, W(u0, -hw, y0), W(u0, hw, y0), W(u1, hw, y1), W(u1, -hw, y1), deckCol(i, u0, u1), UPN);
      if (y0 > 0 || y1 > 0) for (const s of [-1, 1]) quad(b, W(u0, s * hw, 0), W(u1, s * hw, 0), W(u1, s * hw, y1), W(u0, s * hw, y0), sideCol, [s, 0, 0]);
    }
    const [ua, ya] = prof[0], [ub, yb] = prof[prof.length - 1];
    if (ya > 0) quad(b, W(ua, -hw, 0), W(ua, hw, 0), W(ua, hw, ya), W(ua, -hw, ya), sideCol, [0, 0, 1]);
    if (yb > 0){ const n = 6; for (let k = 0; k < n; k++){ const v0 = -hw + 2 * hw * k / n, v1 = v0 + 2 * hw / n; quad(b, W(ub, v0, 0), W(ub, v1, 0), W(ub, v1, yb), W(ub, v0, yb), endCol ? endCol(k) : sideCol, [0, 0, -1]); } }
  }
  const sample = (f, len, step) => { const out = []; for (let u = 0; u < len; u += step) out.push([u, f(u)]); out.push([len, f(len)]); return out; };
  const kickProf = (K, n) => { const out = []; for (let k = 0; k <= n; k++) out.push([K.L * k / n, K.H * k / n]); return out; };

  /* ---------- the structures: kickers, rollers, mound, the loop, barriers, Ferris wheel stand, sign frame (one merged mesh) ---------- */
  const SB = mk(), parts = [];
  solid(SB, BIG.x, BASE, BIG.W / 2, kickProf(BIG, 10), i => i % 2 ? WHITE : RED, RED, k => k % 2 ? WHITE : RED);
  { /* white trim along the top edges of the big ramp, and its side rails */
    const {L, H} = BIG, hw = BIG.W / 2, ua = .55 * L / H;
    for (const s of [-1, 1]){ const x = CX + s * (hw + .012); quad(SB, [x, 0, BASE - ua], [x, H - .55, LIP], [x, H, LIP], [x, .55, BASE - ua], WHITE, [s, 0, 0]); }
    const a = Math.atan2(H, L), Lr = Math.hypot(L, H);
    for (const s of [-1, 1]){
      const x = CX + s * (hw + .18);
      parts.push(geoTint(geoAt(new THREE.BoxGeometry(.14, .14, Lr), x, H / 2 + 1.05, BIG.z, a, 0, 0), WHITE));
      for (let k = 0; k <= 7; k++){ const u = L * k / 7; parts.push(geoTint(geoAt(new THREE.BoxGeometry(.16, 1.1, .16), x, H * u / L + .5, BASE - u), k % 2 ? WHITE : RED)); }
    }
  }
  solid(SB, GAPK.x, GAPK.z + GAPK.L / 2, GAPK.W / 2, kickProf(GAPK, 6), i => i % 2 ? WHITE : RED, RED, k => k % 2 ? WHITE : RED);
  solid(SB, ROLL.x, ROLL.zs, ROLL.hw, sample(ROLL.f, ROLL.len, .5), (i, u0) => Math.floor(u0 / 5) % 2 ? DARK : YEL, DARK);
  solid(SB, MOUND.x, MOUND.zs, MOUND.hw, [].concat(sample(MOUND.f, 6, 1.5).slice(0, -1), sample(u => MOUND.f(u + 6), MOUND.len - 6, 2.5).map(([u, y]) => [u + 6, y])),
    (i, u0) => u0 < 6 ? (i % 2 ? WHITE : RED) : u0 < 10 ? WHITE : (i % 2 ? '#7b7f85' : '#8f939a'), '#8a6a4a');
  { /* the loop: an offset ribbon (red / white inside, grey outside), two towers and a beam through the middle, low barriers along both sides */
    const N = 96, P = (th, off, d) => { const s = Math.sin(th), c = Math.cos(th), lat = LP.w * th / PI2 + off; return [LP.x + lat, LP.R * (1 - c) + c * d, LP.z - LP.R * s + s * d]; };
    const nIn = th => [0, Math.cos(th), Math.sin(th)];
    for (let i = 0; i < N; i++){
      const t0 = PI2 * i / N, t1 = PI2 * (i + 1) / N, n = nIn((t0 + t1) / 2), no = [-n[0], -n[1], -n[2]];
      quad(SB, P(t0, -LP.hw, .03), P(t0, LP.hw, .03), P(t1, LP.hw, .03), P(t1, -LP.hw, .03), Math.floor(i / 4) % 2 ? WHITE : RED, n);
      quad(SB, P(t0, -LP.hw, -.3), P(t0, LP.hw, -.3), P(t1, LP.hw, -.3), P(t1, -LP.hw, -.3), '#8d9196', no);
      for (const s of [-1, 1]){ const off = s * LP.hw; quad(SB, P(t0, off, .03), P(t1, off, .03), P(t1, off, -.3), P(t0, off, -.3), WHITE, [s, 0, 0]); }
    }
    const xa = LP.x - LP.hw - 1.6, xb = LP.x + LP.w + LP.hw + 1.6;
    for (const x of [xa, xb]){ parts.push(geoTint(geoAt(new THREE.BoxGeometry(.7, LP.R, .7), x, LP.R / 2, LP.z), '#3b3f44')); addCircle(x, LP.z, .5); }
    parts.push(geoTint(geoAt(new THREE.CylinderGeometry(.22, .22, xb - xa, 8), (xa + xb) / 2, LP.R, LP.z, 0, 0, Math.PI / 2), '#3b3f44'));
    for (const x of [LP.x - LP.hw - .5, LP.x + LP.w + LP.hw + .5]){
      addBox(x, LP.z, .2, LP.R + 1, 0);
      for (let k = 0; k < 6; k++){ const z0 = LP.z - LP.R - 1 + (2 * LP.R + 2) * k / 6; parts.push(geoTint(geoAt(new THREE.BoxGeometry(.4, .9, (2 * LP.R + 2) / 6), x, .45, z0 + (LP.R + 1) / 6), k % 2 ? WHITE : RED)); }
    }
  }
  { /* Ferris wheel stand: a platform and two A-frames up to the hub */
    parts.push(geoTint(geoAt(new THREE.BoxGeometry(6, .5, 19), FW.x, .25, FW.z), '#c9c4b8'));
    for (const s of [-1, 1]) for (const e of [-1, 1]) parts.push(geoTint(rodGeo(.22, .22, [FW.x + s * 2.4, .5, FW.z + e * 8.5], [FW.x + s * 1.5, FW.y, FW.z], 6), '#e8e4dc'));
    addBox(FW.x, FW.z, 3, 9.5, 0);
  }
  const sign = {x:CX - 26, z:248, face:Math.PI / 4, bw:10, bh:4, top:6.8};
  { const fx = Math.sin(sign.face), fz = Math.cos(sign.face), rx = fz, rz = -fx;
    parts.push(geoTint(geoAt(new THREE.BoxGeometry(sign.bw + .3, sign.bh + .3, .14), sign.x, sign.top - sign.bh / 2, sign.z, 0, sign.face, 0), '#2b2e33'));
    for (const s of [-1, 1]){ const px = sign.x + rx * s * sign.bw * .36, pz = sign.z + rz * s * sign.bw * .36; parts.push(geoTint(geoAt(new THREE.CylinderGeometry(.16, .16, sign.top - sign.bh + .2, 8), px, (sign.top - sign.bh + .2) / 2, pz), '#3b3f44')); addCircle(px, pz, .3); }
  }
  { const sg = toGeo(SB); delete sg.attributes.uv; parts.unshift(sg);
    const m = new THREE.Mesh(geoMerge(parts), M('#ffffff', {vertexColors:true, roughness:.55})); m.castShadow = m.receiveShadow = true; scene.add(m); }

  /* ---------- paint on the ground: asphalt, kerbs, lines, arrows, the drift circle and the figure-8 ---------- */
  {
    const b = mk(), y0 = .02, y1 = .045;
    /* big jump: run-up, landing strip, kerbs, edge lines, 25 m lines, chevrons */
    flat(b, CX - RUN.hw, RUN.z0 - 1, CX + RUN.hw, RUN.z1, y0, ASPH);
    flat(b, CX - LAND.hw, LAND.z0, CX + LAND.hw, LAND.z1, y0, ASPH);
    for (let z = RUN.z1, k = 0; z > RUN.z0; z -= 3, k++) for (const s of [-1, 1]) flat(b, CX + s * RUN.hw - .6, Math.max(RUN.z0, z - 3), CX + s * RUN.hw + .6, z, y1, k % 2 ? WHITE : RED);
    for (const s of [-1, 1]) flat(b, CX + s * (LAND.hw - .5) - .25, LAND.z0 + .5, CX + s * (LAND.hw - .5) + .25, LAND.z1, y1, PAINT);
    for (let d = 25; LIP - d >= LAND.z0; d += 25){ const z = LIP - d; flat(b, CX - LAND.hw + .5, z - (d % 100 ? .3 : .55), CX + LAND.hw - .5, z + (d % 100 ? .3 : .55), y1, d % 100 ? PAINT : '#ffd23a'); }
    const chev = (x, z, w) => { const t = 1.1, tip = w * .62;
      quad(b, [x - w, y1, z], [x, y1, z - tip], [x, y1, z - tip + t], [x - w, y1, z + t], PAINT, UPN);
      quad(b, [x + w, y1, z], [x + w, y1, z + t], [x, y1, z - tip + t], [x, y1, z - tip], PAINT, UPN); };
    for (const z of [235, 195, 155]) for (const dz of [0, 3.2]) chev(CX, z - dz, 4.2);
    /* the stunt lane and the loop lanes: asphalt with white edges, from the main road to the figure-8 */
    const lane = (x, hw, z0, z1) => { flat(b, x - hw, z0, x + hw, z1, y0, ASPH); for (const s of [-1, 1]) flat(b, x + s * (hw - .35) - .18, z0, x + s * (hw - .35) + .18, z1, y1, PAINT); };
    lane(L1, L1HW, -250, ROAD_Z); lane(LP.x, 3.5, LP.z, ROAD_Z); lane(LP.x + LP.w, 3.5, -250, LP.z);
    for (const z of [255, 245]) { chev(L1, z, 3); chev(LP.x, z, 2.6); }
    /* drift circle */
    const ring = (r0, r1, col, y) => { for (let k = 0; k < 64; k++){ const a0 = PI2 * k / 64, a1 = PI2 * (k + 1) / 64, P = (r, a) => [SK.x + Math.cos(a) * r, y, SK.z + Math.sin(a) * r]; quad(b, P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1), typeof col === 'function' ? col(k) : col, UPN); } };
    ring(0, SK.r, ASPH, y0); ring(SK.r - 1.2, SK.r, k => k % 2 ? WHITE : RED, y1); ring(4.6, 5.2, PAINT, y1); ring(0, 1.2, '#ffd23a', y1);
    flat(b, SK.x + SK.r - 2, SK.z - 3, CX - RUN.hw, SK.z + 3, y0, ASPH);   /* a short spur from the run-up */
    /* figure-8: asphalt, white edges, kerbs, a chequered start line at the north tip */
    const N8 = 240, path = []; for (let i = 0; i <= N8; i++) path.push(f8At(PI2 * i / N8));
    ribbon(b, path, -F8.hw, F8.hw, y0, () => ASPH);
    for (const s of [-1, 1]) ribbon(b, path, s * (F8.hw - .3), s * (F8.hw + .6), y1, i => i % 2 ? WHITE : RED);
    ribbon(b, path, -.15, .15, y1 - .005, i => i % 4 < 2 ? PAINT : ASPH);
    const [sx, sz] = F8G[0]; for (let r = 0; r < 8; r++) for (let q = 0; q < 2; q++) flat(b, sx - 1.6 + q * 1.6, sz - F8.hw + r * 1.5, sx + q * 1.6, sz - F8.hw + (r + 1) * 1.5, y1 + .004, (r + q) % 2 ? '#111111' : '#ffffff');
    const mat = regWet(M('#ffffff', {vertexColors:true, roughness:.85, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-4}), .3);
    const m = new THREE.Mesh(toGeo(b), mat); m.receiveShadow = true; scene.add(m);
  }

  /* ---------- distance numbers painted beside every big-jump line (one atlas, one mesh) ---------- */
  {
    const nums = []; for (let d = 25; LIP - d >= LAND.z0; d += 25) nums.push(d);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    nums.forEach((d, i) => {
      const cx = (i % 4) * 256 + 128, cy = Math.floor(i / 4) * 128 + 64;
      g.fillStyle = d % 100 ? '#f2f2ee' : '#ffd23a'; g.font = '900 96px sans-serif'; g.fillText(String(d), cx - 22, cy + 4);
      g.font = '800 48px sans-serif'; g.fillText('m', cx + 86, cy + 22);
    });
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = ANISO;
    const p = [], uv = [], nor = [];
    nums.forEach((d, i) => {
      const u0 = (i % 4) / 4, u1 = u0 + .25, v1 = 1 - Math.floor(i / 4) / 4, v0 = v1 - .25, z = LIP - d;
      for (const s of [-1, 1]){
        const xc = CX + s * (LAND.hw - 5.5), x0 = xc - 3.6, x1 = xc + 3.6, zb = z + 2.4, zt = z + .6, y = .05;   /* just before the line, upright for a car heading north */
        p.push(x0, y, zb, x1, y, zb, x1, y, zt, x0, y, zb, x1, y, zt, x0, y, zt);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        for (let k = 0; k < 6; k++) nor.push(0, 1, 0);
      }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map:tex, transparent:true, depthWrite:false, roughness:.85, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-6}));
    m.receiveShadow = true; scene.add(m);
  }

  /* ---------- flags: poles with pennants beside the run-ups and the landing strip (look only, nothing to crash into) ---------- */
  {
    const fp = [], FL = [RED, '#ffd23a', WHITE];
    const flag = (x, z, h, k) => {
      fp.push(geoTint(geoAt(new THREE.CylinderGeometry(.06, .09, h, 5, 1, true), x, h / 2, z), '#d9dcdf'));
      const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute([0, h - .05, 0, 0, h - 1.05, 0, 1.6, h - .55, .12], 3));
      f.computeVertexNormals(); fp.push(geoTint(geoAt(f, x, 0, z, 0, -.5, 0), FL[k % 3]));
    };
    let k = 0;
    for (let z = RUN.z1 - 14; z > RUN.z0 + 4; z -= 26) for (const s of [-1, 1]) flag(CX + s * (RUN.hw + 3), z, 4.5, k++);
    for (let d = 0; LIP - d >= LAND.z0; d += 25) for (const s of [-1, 1]) flag(CX + s * (LAND.hw + 4), LIP - d, 6, k++);
    for (const z of [238, 200, 166]) for (const s of [-1, 1]) flag(L1 + s * (L1HW + 2.5), z, 4.5, k++);
    for (let t = 0; t < 12; t++){ const a = PI2 * t / 12; flag(SK.x + Math.cos(a) * (SK.r + 3), SK.z + Math.sin(a) * (SK.r + 3), 4, k++); }
    const m = new THREE.Mesh(geoMerge(fp), M('#ffffff', {vertexColors:true, roughness:.7, side:THREE.DoubleSide})); m.castShadow = true; scene.add(m);
  }

  /* ---------- Ferris wheel: the wheel turns as one mesh; the cabins are one instanced mesh that stays level ---------- */
  const FWS = {wheel:null, cab:null, a:0, n:12};
  {
    const wp = [], R = FW.r;
    for (const s of [-1, 1]) wp.push(geoTint(geoAt(new THREE.TorusGeometry(R, .22, 4, 48), s * 1.2, 0, 0, 0, Math.PI / 2, 0), '#f4f1ea'));
    wp.push(geoTint(geoAt(new THREE.TorusGeometry(R * .55, .14, 4, 32), 0, 0, 0, 0, Math.PI / 2, 0), '#e8412c'));
    for (let k = 0; k < 16; k++){ const a = PI2 * k / 16, y = Math.cos(a) * R, z = Math.sin(a) * R; for (const s of [-1, 1]) wp.push(geoTint(rodGeo(.07, .07, [s * .5, 0, 0], [s * 1.2, y, z], 4), k % 2 ? '#e8412c' : '#f2c230')); }
    wp.push(geoTint(geoAt(new THREE.CylinderGeometry(.6, .6, 3.6, 12), 0, 0, 0, 0, 0, Math.PI / 2), '#3b3f44'));
    const m = new THREE.Mesh(geoMerge(wp), M('#ffffff', {vertexColors:true, roughness:.5, metalness:.2})); m.position.set(FW.x, FW.y, FW.z); m.castShadow = true; scene.add(m); FWS.wheel = m;
    const cg = geoMerge([geoAt(new THREE.BoxGeometry(1.5, 1.5, 1.7), 0, -1.35, 0), geoAt(new THREE.CylinderGeometry(.08, .08, .6, 4), 0, -.3, 0), geoAt(new THREE.BoxGeometry(1.8, .16, 2), 0, -.55, 0)]);
    const cab = new THREE.InstancedMesh(cg, M('#ffffff', {roughness:.5}), FWS.n), CC = ['#e8412c', '#2f86d6', '#f2c230', '#3fae5a', '#b35ad6', '#ff8a3d'].map(c => new THREE.Color(c));
    for (let i = 0; i < FWS.n; i++) cab.setColorAt(i, CC[i % CC.length]);
    cab.castShadow = true; cab.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(FW.x, FW.y, FW.z), R + 4); scene.add(cab); FWS.cab = cab;
  }
  const _fm = new THREE.Matrix4();
  function fwTurn(dt){
    FWS.a += dt * .09; FWS.wheel.rotation.x = FWS.a;
    for (let i = 0; i < FWS.n; i++){ const a = FWS.a + PI2 * i / FWS.n; _fm.makeTranslation(FW.x, FW.y + Math.cos(a) * FW.r, FW.z + Math.sin(a) * FW.r); FWS.cab.setMatrixAt(i, _fm); }
    FWS.cab.instanceMatrix.needsUpdate = true;
  }
  fwTurn(0);

  /* ---------- the road sign ---------- */
  {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 410; const g = cv.getContext('2d');
    g.fillStyle = '#c8322a'; g.fillRect(0, 0, 1024, 410);
    g.fillStyle = '#f4f1ea'; for (let i = -2; i < 34; i++){ g.beginPath(); g.moveTo(i * 32, 410); g.lineTo(i * 32 + 16, 410); g.lineTo(i * 32 + 46, 380); g.lineTo(i * 32 + 30, 380); g.closePath(); g.fill(); }
    g.fillRect(0, 0, 1024, 10); g.fillRect(0, 370, 1024, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.font = '900 140px sans-serif'; g.fillText('校外飞车乐园', 512, 140);
    g.font = '700 50px sans-serif'; g.fillStyle = '#ffe08a'; g.fillText('大跳台 · 大回环 · 飞跃峡谷 · 8 字赛道', 512, 280);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = ANISO;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.bw, sign.bh), new THREE.MeshStandardMaterial({map:tex, roughness:.6, emissive:'#ffffff', emissiveMap:tex, emissiveIntensity:.18}));
    board.position.set(sign.x + Math.sin(sign.face) * .09, sign.top - sign.bh / 2, sign.z + Math.cos(sign.face) * .09); board.rotation.y = sign.face; scene.add(board);
  }
  addLabel('校外飞车乐园', -905, 16, 160);
  [['大跳台', CX, BIG.H + 5, BIG.z], ['360° 大回环', LP.x + LP.w / 2, 2 * LP.R + 4, LP.z], ['波浪道 · 飞跃峡谷', L1, 6, 200], ['漂移圆', SK.x, 4, SK.z], ['8 字赛道', F8.x, 5, F8.z], ['摩天轮', FW.x, FW.y + FW.r + 4, FW.z]]
    .forEach(([t, x, y, z]) => addLabel(t, x, y, z, true));

  /* ---------- minimap ---------- */
  if (typeof drawOutMini === 'function'){
    const miniBase = drawOutMini;
    drawOutMini = function(mg, X, Z, k){
      miniBase(mg, X, Z, k);
      mg.fillStyle = '#8f8b84';
      const rect = (x0, z0, x1, z1) => mg.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
      rect(CX - RUN.hw, RUN.z0, CX + RUN.hw, RUN.z1); rect(CX - LAND.hw, LAND.z0, CX + LAND.hw, LAND.z1);
      rect(L1 - L1HW, -250, L1 + L1HW, ROAD_Z); rect(LP.x - 3.5, LP.z, LP.x + 3.5, ROAD_Z); rect(LP.x + LP.w - 3.5, -250, LP.x + LP.w + 3.5, LP.z);
      mg.beginPath(); mg.arc(X(SK.x), Z(SK.z), SK.r * k, 0, 7); mg.fill();
      mg.strokeStyle = '#8f8b84'; mg.lineWidth = Math.max(2, F8.hw * 2 * k); mg.lineJoin = 'round'; mg.beginPath();
      for (let i = 0; i <= 96; i++){ const [x, z] = f8At(PI2 * i / 96); i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z)); } mg.stroke();
      mg.fillStyle = '#ffffff'; for (let d = 50; LIP - d >= LAND.z0; d += 50) mg.fillRect(X(CX - LAND.hw), Z(LIP - d) - .5, LAND.hw * 2 * k, 1);
      mg.fillStyle = '#e8412c'; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 1.5;
      for (const [x, z1, z0, w] of [[CX, LIP, BASE, BIG.W / 2], [L1, GAPK.z - GAPK.L / 2, GAPK.z + GAPK.L / 2, GAPK.W / 2]]){ mg.beginPath(); mg.moveTo(X(x), Z(z1) - 3); mg.lineTo(X(x + w) + 2, Z(z0) + 2); mg.lineTo(X(x - w) - 2, Z(z0) + 2); mg.closePath(); mg.fill(); mg.stroke(); }
      mg.strokeStyle = '#e8412c'; mg.lineWidth = 3; mg.beginPath(); mg.arc(X(LP.x + LP.w / 2), Z(LP.z), Math.max(3, LP.R * k), 0, 7); mg.stroke();
      mg.beginPath(); mg.arc(X(FW.x), Z(FW.z), Math.max(3, FW.r * k * .6), 0, 7); mg.strokeStyle = '#f2c230'; mg.stroke();
      const lx = X(-900), lz = Z(40);   /* the big map (js/ui-guide.js) writes the 3D labels as names itself */
      if (typeof mini !== 'undefined' && mg.canvas === mini && lx > -60 && lx < mg.canvas.width + 60 && lz > -10 && lz < mg.canvas.height + 10){
        mg.font = '700 13px sans-serif'; mg.textAlign = 'center'; mg.lineWidth = 3; mg.strokeStyle = 'rgba(31,42,51,.85)'; mg.strokeText('飞车乐园', lx, lz); mg.fillStyle = '#ffffff'; mg.fillText('飞车乐园', lx, lz); mg.textAlign = 'start';
      }
    };
  }

  /* ---------- car physics in the park: the loop ride, solid sides on the ramps, falling off edges ---------- */
  function loopPose(c, th){
    const s = Math.sin(th), co = Math.cos(th);
    c.x = LP.x + LP.w * th / PI2; c.y = LP.R * (1 - co); c.z = LP.z - LP.R * s;
    c.pitch = -th; c.root.position.set(c.x, c.y, c.z); c.root.rotation.set(-th, c.h, 0);
  }
  function loopStep(c, dt){
    const L = c.loopRide;
    let v = Math.sqrt(Math.max(0, L.v0 * L.v0 - 2 * LP.g * LP.R * (1 - Math.cos(L.th))));
    if (L.dir > 0 && !L.ok && (v < 1.5 || (L.th > Math.PI / 2 && v * v < LP.g * LP.R * -Math.cos(L.th) + 6))){
      L.dir = -1;
      if (c === driving && typeof gxCallout === 'function') gxCallout('速度不够！', `至少 ${Math.ceil(LP_MIN * 3.6)} km/h 才转得过去`, '#e8412c');
    }
    v = Math.max(v, 1.5); L.th += L.dir * v * dt / LP.R;
    for (const w of c.wheels) w.rotation.x += L.dir * v / c.T.r * dt;
    c.vx = 0; c.vz = -Math.cos(L.th) * v * L.dir; c.air = false; c.vy = 0; c.lastVy = 0; c.slip = 0;
    if (L.th >= PI2){
      c.loopRide = null; loopPose(c, PI2); c.x = LP.x + LP.w; c.y = 0; c.pitch = 0; c.vz = -L.v0; c.root.position.set(c.x, 0, c.z); c.root.rotation.set(0, c.h, 0);
      if (c === driving){
        const n = (prog.best.loops | 0) + 1; prog.best.loops = n; saveGame(); addStunt('360° 大回环', 600);
        if (typeof gxCallout === 'function') gxCallout('360° 大回环！', `进环 ${Math.round(L.v0 * 3.6)} km/h · 一共转过 ${n} 圈`, '#e8412c');
      }
    } else if (L.th <= 0){
      c.loopRide = null; loopPose(c, 0); c.z = LP.z + .6; c.pitch = 0; c.vz = v; c.root.position.set(c.x, 0, c.z); c.root.rotation.set(0, c.h, 0);
    } else loopPose(c, L.th);
  }
  {
    const base = updateCar;
    updateCar = function(c, dt, inp){
      if (c.loopRide) return loopStep(c, dt);
      const px = c.x, pz = c.z, py = c.y, pvy = c.vy, wasAir = c.air, pAirT = c.airT, pLast = c.lastVy;
      const r = base(c, dt, inp);
      if (!inPark(px, pz) && !inPark(c.x, c.z)) return r;
      /* into the loop: crossing the entry line, inside the lane, heading north and moving forward */
      const vf = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
      if (c === driving && !c.air && pz >= LP.z && c.z < LP.z && Math.abs(c.x - LP.x) < LP.hw && Math.cos(c.h - Math.PI) > .6 && vf > 2){
        c.h = Math.PI; c.loopRide = {th:Math.max(0, (LP.z - c.z) / LP.R), v0:vf, dir:1, ok:vf >= LP_MIN + .3}; loopPose(c, c.loopRide.th); return r;
      }
      const dist = Math.hypot(c.x - px, c.z - pz), g = groundAt(c.x, c.z);
      if (g - py > .55 + .75 * dist && py > groundAt(px, pz) - .3){   /* (a car that somehow started inside a ramp just pops out on top, as before) */
        /* ran into the side or the end of a ramp, a roller or the mound: stop there instead of popping up on top */
        const imp = Math.hypot(c.vx, c.vz);
        c.x = px; c.z = pz; c.y = py; c.air = wasAir; c.vy = pvy; c.airT = pAirT; c.lastVy = pLast; c.vx *= -.25; c.vz *= -.25;
        c.root.position.set(c.x, c.y, c.z);
        if (imp > 5 && c.crashCd <= 0){
          c.crashCd = .35; sfx.crash(Math.min(1, imp / 25)); dustBurst(c.x, c.y + .8, c.z, 5, 3);
          if (c === driving){ camShake = Math.min(2.5, imp / 10); judgeCrash(c, imp); }
        }
      } else if (!wasAir && !c.air && py - c.y > .6 + .75 * dist){
        /* drove off the edge of a ramp or the mound: fall instead of dropping to the ground in one frame */
        c.y = py; c.air = true; c.vy = 0; c.airT = 0; c.root.position.y = c.y;
      } else if (!wasAir && !c.air && pLast > 1.5 && pLast < .6 * Math.hypot(c.vx, c.vz) + 1 && c.lastVy < pLast - 30 * dt){
        /* over a crest (a roller, the top of the mound) the ground falls away faster than gravity can pull the car down: it takes off */
        c.air = true; c.vy = pLast; c.airT = 0; c.y = py + pLast * dt; c.root.position.y = c.y;
      }
      return r;
    };
  }

  /* ---------- per frame: records, the figure-8 lap timer, doughnuts, prompts ---------- */
  const PS = {fly:null, onBig:false, lap:null, gateIn:-1, donut:0, donutN:0, donutIdle:0, ph:0, msg:''};
  const fmtT = t => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
  if (typeof GX_MORE !== 'undefined') GX_MORE.push({id:'bigjump', name:'飞车乐园 · 大跳台', fmt:v => `最远 ${Math.round(v)} 米`},
    {id:'loops', name:'飞车乐园 · 大回环', fmt:v => `转过 ${Math.round(v)} 圈`}, {id:'parkLap', name:'飞车乐园 · 8 字赛道', fmt:v => `最快一圈 ${fmtT(v)}`});
  const call = (t, s) => { if (typeof gxCallout === 'function' && !(typeof gxA !== 'undefined' && gxA.act)) gxCallout(t, s, '#e8412c'); };
  const onBig = c => { const u = (c.x - BIG.x) * BIG.fx + (c.z - BIG.z) * BIG.fz, v = (c.x - BIG.x) * BIG.fz - (c.z - BIG.z) * BIG.fx; return Math.abs(v) < BIG.W / 2 && u > -BIG.L / 2 && u < BIG.L / 2 + 1; };
  const best = k => prog.best[k];
  function parkUpdate(dt){
    PS.msg = '';
    const c = driving;
    if (!c){
      PS.fly = null; PS.onBig = false; PS.lap = null; PS.donut = 0;
      if (typeof nw !== 'undefined' && inPark(nw.x, nw.z)) PS.msg = '校外飞车乐园：开车来玩 · 大跳台、大回环、飞跃峡谷、8 字赛道';
      return;
    }
    if (!inPark(c.x, c.z)){ PS.fly = null; PS.lap = null; PS.donut = 0; return; }
    const sp = Math.hypot(c.vx, c.vz);
    /* big jump distance */
    if (PS.fly && PS.fly.car !== c) PS.fly = null;
    if (c.air){ if (!PS.fly && PS.onBig) PS.fly = {car:c, v0:sp}; }
    else if (PS.fly){
      const d = (c.x - BIG.x) * BIG.fx + (c.z - BIG.z) * BIG.fz - BIG.L / 2, f = PS.fly; PS.fly = null;
      if (d > 3){
        const dist = Math.round(d), prev = best('bigjump'), rec = prev == null || dist > prev;
        if (rec){ prog.best.bigjump = dist; saveGame(); }
        call(`大跳台 ${dist} 米`, rec ? (prev == null ? '第一跳！纪录已保存' : `新纪录！上次 ${prev} 米`) : `起飞 ${Math.round(f.v0 * 3.6)} km/h · 纪录 ${prev} 米`);
      }
    }
    PS.onBig = !c.air && onBig(c);
    /* figure-8 lap: start / finish line, then all five checkpoints (either way round), then the line again */
    let gi = -1; for (let i = 0; i < F8G.length; i++) if (Math.hypot(c.x - F8G[i][0], c.z - F8G[i][1]) < F8.hw + 4){ gi = i; break; }
    if (gi !== PS.gateIn && gi >= 0){
      if (gi === 0){
        if (PS.lap && PS.lap.seen.size === F8G.length - 1){
          const t = PS.lap.t, prev = best('parkLap'), rec = prev == null || t < prev;
          if (rec){ prog.best.parkLap = Math.round(t * 10) / 10; saveGame(); }
          addStunt('8 字赛道一圈', 200);
          call(`一圈 ${fmtT(t)}`, rec ? (prev == null ? '第一圈！纪录已保存 · 继续跑下一圈' : `新纪录！上次 ${fmtT(prev)}`) : `纪录 ${fmtT(prev)} · 继续跑下一圈`);
        } else if (!PS.lap) call('8 字赛道 · 计时开始', '按顺序经过五个检查点再回到方格线');
        PS.lap = {t:0, seen:new Set()};
      } else if (PS.lap) PS.lap.seen.add(gi);
    }
    PS.gateIn = gi;
    if (PS.lap){
      PS.lap.t += dt;
      if (PS.lap.t > 240 || Math.hypot(c.x - F8.x, c.z - F8.z) > 170) PS.lap = null;
      else PS.msg = `8 字赛道 ${fmtT(PS.lap.t)} · 检查点 ${PS.lap.seen.size}/5` + (best('parkLap') != null ? ` · 纪录 ${fmtT(best('parkLap'))}` : '');
    }
    /* doughnuts: spinning round on the spot in the drift circle */
    if (Math.hypot(c.x - SK.x, c.z - SK.z) < SK.r && !c.air && c.slip > 3 && sp > 3){
      let dh = c.h - PS.ph; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); PS.donut += Math.abs(dh); PS.donutIdle = 0;
      if (PS.donut >= PI2){ PS.donut -= PI2; PS.donutN++; addStunt('甜甜圈', 120); call(`甜甜圈 ×${PS.donutN}`, '在圆里原地甩尾转圈'); }
    } else if ((PS.donutIdle += dt) > 1.2){ PS.donut = 0; PS.donutN = 0; }
    PS.ph = c.h;
    /* hints while rolling slowly into a feature */
    if (PS.msg || c.air || sp > 22) return;
    const near = (x, hw, z0, z1) => Math.abs(c.x - x) < hw && c.z > z0 && c.z < z1;
    if (near(CX, RUN.hw + 4, RUN.z0, RUN.z1 + 6)) PS.msg = '大跳台：往北全速冲，越快飞得越远' + (best('bigjump') ? ` · 纪录 ${best('bigjump')} 米` : '');
    else if (near(L1, L1HW + 3, ROLL.zs - 2, ROAD_Z + 6)) PS.msg = '波浪道 + 飞跃峡谷：快了会一路飞起来，够快能直接飞过土坡';
    else if (near(LP.x, 4, LP.z, ROAD_Z + 6)) PS.msg = `大回环：${Math.ceil(LP_MIN * 3.6)} km/h 以上冲进去才转得过去` + (best('loops') ? ` · 转过 ${best('loops')} 圈` : '');
    else if (Math.hypot(c.x - SK.x, c.z - SK.z) < SK.r) PS.msg = '漂移圆：按住空格原地甩尾转圈，转一圈算一个甜甜圈';
    else if (Math.hypot(c.x - F8.x, c.z - F8.z) < 110) PS.msg = '8 字赛道：开过北头的方格线开始计时' + (best('parkLap') != null ? ` · 纪录 ${fmtT(best('parkLap'))}` : '');
  }
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); parkUpdate(dt); },
      prompt(){ return base.prompt() || PS.msg; }
    });
  }
  /* the wheel turns in every mode (orbit view included), while the camera is within a kilometre */
  if (typeof updateOutskirts === 'function'){
    const base = updateOutskirts;
    updateOutskirts = function(dt, T){ base(dt, T); if (camera.position.distanceTo(FWS.wheel.position) < 1100) fwTurn(dt); };
  }
  window.XPark = {BIG, GAPK, ROLL, MOUND, LP, LP_MIN, SK, FW, F8, F8G, LIP, LAND, RUN, PB, S:PS, cleared, loopStep};   /* for tests */
})();
