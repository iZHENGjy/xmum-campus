/* XMUM 校园漫游 · ERL 小火车：Salak Tinggi 站、坐车过场、「坐车去远处独立场景」的框架 XTrain
 *
 * 车站：真实的 Salak Tinggi 站（ERL KLIA Transit）在校门东南约 1.06 km（OSM way 165373122，换算到游戏里 x≈1130, z≈700，在地图东边界外）。
 *   位置还没最终定（东南角给了汽车游乐园二园，地图边界也还在商量），所以整座车站是一个能整体平移、转向的组：只改下面的 PLACE 一处，
 *   地形压平、清树、碰撞体、小地图、列车轨道、过场里的走位和镜头都跟着走。现在暂放在游乐园北边、油棕园公路东边的窄长条（站中心 x 765, z 575）。
 *   轨道是一条直线，两头自动找隧道口：地面比站台高出 7 m 的地方（东边的小山），或者离别的路 18 m 的地方（西边的油棕园公路）；车开进隧道就看不见了。
 *   地形是等山上的树都种好以后才压平的（和 js/92-bigjump.js 的 TG.flattenLate 同一个思路），压平的地方的树清掉，已有马路底下的地面一点不动。
 * 外观：地面站，两个岛式站台、四条轨道（中间两条停 KLIA Transit，外侧两条给不停站的 KLIA Ekspres 通过），站台上是波浪形雨棚，
 *   站厅（售票柜台、售票机、闸机，2025–26 翻新后的紫色标识）在北边，人行天桥跨过轨道下到两个站台，西边 5 层 Park & Ride 停车楼，有带顶的天桥连站厅。
 *   列车：4 节编组（照 Siemens Desiro ET 425 M 的样子），白车身；KLIA Transit 配青蓝和紫色，KLIA Ekspres 配紫色和黄色（车身颜色是自己定的）。
 *   人在车站附近时，隔一会儿有 Ekspres 呼啸而过、Transit 进站停一会儿再开走。
 * 坐车：站厅门口紫圈按 F → 选目的地 → 过场：刷卡过闸（扣车费，有提示）→ 上天桥到站台 → 等车倒计时 → 列车进站 → 按门边按钮开门上车 →
 *   关门提示、开车 → 车厢里看窗外景物往后掠过 → 黑屏换场景 → 到站下车出站。回程反过来。过场随时能跳过（「跳过」按钮或 Esc），手机上按钮都很大。
 * 框架（给以后的布城、吉隆坡市中心用）：
 *   XTrain.register({id, name, en, mins, fare, z, build(kit) → station, release(), update(dt), prompt(), tryF(), target(), mini(mg, Sz), onArrive(), onLeave()})
 *     build 在黑屏时才调用（按需生成），返回这个目的地的车站描述（见 HOME 的写法）；回程黑屏时调用 release 把场景释放掉，手机内存不涨。
 *     soon:true 的只在选站面板里显示「即将开通」。场景 z 约定：KLIA −2600，布城 / IOI −3100，市中心 −3600（排屋室内用 −4100 往后）。
 *   在目的地里：window.XINDOOR = 'erl'（js/40-vehicles.js 的 indoorNow()，联机 js/net.js 在室内会离开网格，别人看不到你，你也不收别人的位置），
 *     window.XINDOOR_AT 是 Salak Tinggi 站门口（保安巡逻车在那儿等你）。gx.busy() 为真，外卖、挑战都等你回来。
 *   XTrain.kit：合并几何体的小工具（每个场景一两个 mesh）和画招牌用的贴图集。
 * 测试：XTrain.go('klia') 直接坐过去，XTrain.skip() 跳过过场，XTrain.home() 直接回来。 */
'use strict';
(() => {
  if (typeof TG === 'undefined' || typeof OUT_SETS === 'undefined' || typeof gx === 'undefined') return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };

  /* ================= kit: merged geometry with vertex colour and atlas uv ================= */
  const SOLID = [.004, .996];   /* every atlas keeps its top-left corner white */
  const KB = () => ({p:[], n:[], c:[], u:[]});
  const _kc = new THREE.Color();
  function kTri(b, A, B, C, col, ua, ub, uc){
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    _kc.set(col || '#ffffff');
    const P = [A, B, C], U = [ua || SOLID, ub || SOLID, uc || SOLID];
    for (let i = 0; i < 3; i++){ b.p.push(P[i][0], P[i][1], P[i][2]); b.n.push(nx, ny, nz); b.c.push(_kc.r, _kc.g, _kc.b); b.u.push(U[i][0], U[i][1]); }
  }
  /* A B C D counter-clockwise seen from the front; r = atlas region drawn upright (A bottom-left) */
  function kQuad(b, A, B, C, D, col, r){
    const t = r ? [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]] : [];
    kTri(b, A, B, C, col, t[0], t[1], t[2]); kTri(b, A, C, D, col, t[0], t[2], t[3]);
  }
  const kPoly = (b, pts, col) => { for (let i = 1; i < pts.length - 1; i++) kTri(b, pts[0], pts[i], pts[i + 1], col); };
  /* box with outward faces; skip lists faces to leave out (default: the bottom) */
  function kBox(b, x0, y0, z0, x1, y1, z1, col, skip){
    skip = skip == null ? 'ny' : skip;
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    if (!skip.includes('px')) kQuad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
    if (!skip.includes('nx')) kQuad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    if (!skip.includes('pz')) kQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
    if (!skip.includes('nz')) kQuad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
    if (!skip.includes('py')) kQuad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
    if (!skip.includes('ny')) kQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  }
  /* the inside of a room: walls, floor and ceiling facing in (seen from inside only, so a camera outside looks straight in) */
  function kRoom(b, x0, y0, z0, x1, y1, z1, wall, floor, ceil, skip){
    skip = skip || '';
    if (!skip.includes('px')) kQuad(b, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], wall);
    if (!skip.includes('nx')) kQuad(b, [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], wall);
    if (!skip.includes('pz')) kQuad(b, [x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], wall);
    if (!skip.includes('nz')) kQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], wall);
    if (floor && !skip.includes('ny')) kQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], floor);
    if (ceil && !skip.includes('py')) kQuad(b, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], ceil);
  }
  /* a flat vertical face (sign, panel): on the plane z = at (ax 'z') or x = at (ax 'x'), spanning a0..a1, facing dir (+1 / -1) */
  function kSign(b, ax, at, a0, a1, y0, y1, dir, r, col){
    if (ax === 'z'){ if (dir > 0) kQuad(b, [a0, y0, at], [a1, y0, at], [a1, y1, at], [a0, y1, at], col, r); else kQuad(b, [a1, y0, at], [a0, y0, at], [a0, y1, at], [a1, y1, at], col, r); }
    else { if (dir > 0) kQuad(b, [at, y0, a1], [at, y0, a0], [at, y1, a0], [at, y1, a1], col, r); else kQuad(b, [at, y0, a0], [at, y0, a1], [at, y1, a1], [at, y1, a0], col, r); }
  }
  const kFlat = (b, x0, z0, x1, z1, y, col, r) => kQuad(b, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col, r);
  /* any four ground corners, flipped to face up */
  function kUp(b, A, B, C, D, col){
    const ux = B[0] - A[0], uz = B[2] - A[2], vx = D[0] - A[0], vz = D[2] - A[2];
    if (uz * vx - ux * vz < 0) kQuad(b, A, D, C, B, col); else kQuad(b, A, B, C, D, col);
  }
  function kGeo(b){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    geo.computeBoundingSphere(); return geo;
  }
  function kMesh(b, mat, parent, shadow){
    const m = new THREE.Mesh(kGeo(b), mat); m.castShadow = !!shadow; m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  /* a canvas atlas (drawn at twice the size unless the quality tier keeps textures small) and a half-size glow map for night */
  function kAtlas(W, H){
    const K = XQ.cfg.tex >= 512 ? 2 : 1, cv = document.createElement('canvas'), em = document.createElement('canvas');
    cv.width = W * K; cv.height = H * K; em.width = W * K / 2; em.height = H * K / 2;
    const c = cv.getContext('2d'), e = em.getContext('2d'); c.setTransform(K, 0, 0, K, 0, 0); e.setTransform(K / 2, 0, 0, K / 2, 0, 0);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); e.fillStyle = '#000000'; e.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv), glow = new THREE.CanvasTexture(em); tex.anisotropy = ANISO;
    const R = (x, y, w, h) => ({x, y, w, h, u0:(x + 1.5) / W, u1:(x + w - 1.5) / W, v0:1 - (y + h - 1.5) / H, v1:1 - (y + 1.5) / H});
    return {W, H, c, e, cv, em, tex, glow, R, done(){ tex.needsUpdate = true; glow.needsUpdate = true; }};
  }
  const FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  /* a board: background, text lines [{t, s (px), c, y (0..1), w (weight)}], optional glow copy */
  function kBoard(A, r, bg, lines, glow){
    for (const [c, em] of [[A.c, false], [A.e, true]]){
      if (em && !glow) continue;
      c.save(); c.fillStyle = em ? '#' + new THREE.Color(bg).multiplyScalar(.45).getHexString() : bg; c.fillRect(r.x, r.y, r.w, r.h);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const L of lines){
        let s = L.s; c.font = `${L.w || 700} ${s}px ${FONT}`;
        while (c.measureText(L.t).width > r.w - 10 && s > 8){ s -= 1; c.font = `${L.w || 700} ${s}px ${FONT}`; }
        c.fillStyle = L.c; c.fillText(L.t, r.x + (L.x != null ? L.x : .5) * r.w, r.y + L.y * r.h);
      }
      c.restore();
    }
  }
  /* free a whole group: geometries, materials and their textures (shared ones are marked userData.keep) */
  function kDispose(root){
    if (!root) return;
    root.traverse(o => {
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms){ if (m.userData && m.userData.keep) continue; for (const k of ['map', 'emissiveMap']) if (m[k] && !(m[k].userData && m[k].userData.keep)) m[k].dispose(); m.dispose(); }
    });
    if (root.parent) root.parent.remove(root);
  }
  /* wet: take part in the rain sheen (js/10-world.js keeps a list, so scenes that are thrown away again pass false) */
  const kMat = (A, o, wet) => { const m = new THREE.MeshStandardMaterial(Object.assign({color:'#ffffff', vertexColors:true, map:A ? A.tex : null, emissive:A ? '#ffffff' : '#000000',
    emissiveMap:A ? A.glow : null, emissiveIntensity:0, roughness:.78}, o || {})); return wet === false ? m : regWet(m, .4); };
  const kGlass = () => new THREE.MeshStandardMaterial({color:'#a8c8d8', transparent:true, opacity:.32, roughness:.08, metalness:.3, side:THREE.DoubleSide, depthWrite:false});

  /* ================= the station on the main map ================= */
  /* WHERE IT STANDS: the one place to change when the site is final. x, z: the middle of the platforms on the track centre line;
     y: platform-area ground height (the land round it is levelled to this); rot: turns the whole station (0 = tracks run east–west,
     hall on the north side); road: the access road's points from its junction up to the forecourt (the forecourt part is added below).
     Provisional site (2026-11): the narrow strip north of the 汽车游乐园二园, east of the 油棕园公路 at x ≈ 650. The map's east edge
     (MAP.x1 820) cuts through the east end of the platforms for now; the tracks run into a tunnel under the hill to the east, and
     into a tunnel just short of the 油棕园公路 to the west. */
  const PLACE = {x:765, z:575, y:11, rot:0, road:[[650, 521]]};
  /* Everything below is drawn in the station's own frame (the old layout: platform middle at 705, 1060) inside one group,
     which PLACE moves and turns; T / TI convert between that frame and the world. */
  const SX = 705, SZ = 1060, SY = PLACE.y, RT = SY + .35, PY = SY + 1.4;
  const _cr = Math.cos(PLACE.rot), _sr = Math.sin(PLACE.rot);
  const T = (x, z) => [PLACE.x + (x - SX) * _cr + (z - SZ) * _sr, PLACE.z - (x - SX) * _sr + (z - SZ) * _cr];
  const TI = (x, z) => { const dx = x - PLACE.x, dz = z - PLACE.z; return [SX + dx * _cr - dz * _sr, SZ + dx * _sr + dz * _cr]; };
  const TH = h => h + PLACE.rot;
  const P3 = (x, y, z) => { const [a, c] = T(x, z); return [a, y, c]; };
  const ST_G = new THREE.Group(), ST_IN = new THREE.Group(); ST_G.position.set(PLACE.x, 0, PLACE.z); ST_G.rotation.y = PLACE.rot; ST_IN.position.set(-SX, 0, -SZ); ST_G.add(ST_IN); scene.add(ST_G);
  const addBoxD = (cx, cz, hx, hz, rot) => { const [x, z] = T(cx, cz); return addBox(x, z, hx, hz, (rot || 0) + PLACE.rot); };
  const TZ = [-13.65, -2.25, 2.25, 13.65];                     /* tracks north to south: Ekspres, Transit (to KL), Transit (to KLIA), Ekspres */
  const PLAT = [[SZ - 11.95, SZ - 3.95], [SZ + 3.95, SZ + 11.95]], PX0 = SX - 55, PX1 = SX + 55;
  const CONC = {x0:SX - 24, x1:SX + 26, z0:1020, z1:1042, h:11};
  const BR = {x0:SX + 18, x1:SX + 24, z0:1036, z1:SZ + 12.5, y:SY + 7.4};
  const PR = {x0:SX - 82, x1:SX - 32, z0:1014, z1:1042, n:5, h:3.1};
  const DOOR_D = [SX, 1015], [DX, DZ] = T(SX, 1015), DOOR = {x:DX, z:DZ};   /* the purple ring outside the front doors */
  const PAD_D = {x0:600, x1:815, z0:985, z1:1095, fall:36};                  /* levelled ground, in the station's frame */
  const ROADW = PLACE.road.concat([T(600, 1006), T(800, 1006)]);            /* access road, world */
  /* how far the tracks run each way before they go into a tunnel: up to where the land rises 7 m above the station, or 18 m short of
     another road (they would have to pass under it), at most 420 m; the trains run on out of sight beyond */
  const nearRoad = (x, z, m) => OUT_ROADS.some(r => r.p.some((p, q) => q < r.p.length - 1 && segDist(x, z, p, r.p[q + 1]) < r.w / 2 + (m == null ? 18 : m)));
  const reach = dir => { for (let d = 70; d < 420; d += 4){ const [x, z] = T(SX + dir * d, SZ); if (terrainY(x, z) > SY + 7 || nearRoad(x, z)) return d; } return 420; };
  const END = {e:reach(1), w:reach(-1)}, RUN = 320;
  /* the track alignment in the station's frame: a straight line, west (toward KLIA) is -x */
  const alignD = (off, a, b) => [[SX + (a == null ? END.e + RUN : a), SZ + off], [SX - (b == null ? END.w + RUN : b), SZ + off]];
  /* a path along points (x, z): length and position / direction at a distance s */
  function kPath(pts, y){
    const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return {pts, s, L:s[s.length - 1], y:y || 0, vis:null, at(d){
      let i = 1; while (i < s.length - 1 && s[i] < d) i++;
      const a = pts[i - 1], b = pts[i], l = s[i] - s[i - 1] || 1, t = (d - s[i - 1]) / l;
      return {x:a[0] + (b[0] - a[0]) * t, z:a[1] + (b[1] - a[1]) * t, fx:(b[0] - a[0]) / l, fz:(b[1] - a[1]) / l};
    }, sAtX(x){ for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i]; if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) return s[i - 1] + (s[i] - s[i - 1]) * (x - a[0]) / (b[0] - a[0]); } return 0; },
    /* distance along the path of the point on it nearest to (x, z) */
    sAt(x, z){ let best = 0, bd = 1e18; for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); if (d < bd){ bd = d; best = s[i - 1] + t * (s[i] - s[i - 1]); } } return best; }};
  }
  /* world paths for the trains; cars are hidden once they are inside a tunnel */
  const trackPath = (off, west) => { const pts = alignD(off).map(([x, z]) => T(x, z)); if (!west) pts.reverse(); const P = kPath(pts, RT);
    const a = P.sAt(...T(SX + END.e, SZ + off)), b = P.sAt(...T(SX - END.w, SZ + off)); P.vis = [Math.min(a, b), Math.max(a, b)]; return P; };
  const PATH_W = TZ.map(o => trackPath(o, true));                /* toward KLIA (west) */
  const PATH_E = TZ.map(o => trackPath(o, false));               /* toward KL (east) */

  /* ---------- level the ground (after the hill trees are planted, so nothing else on the map moves) ---------- */
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return [Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz), t]; };
  const padDist = (x, z) => rectDist(...TI(x, z), PAD_D);
  const CORR = [
    {pts:[T(SX + END.e, SZ), T(SX - END.w, SZ)], hw:19, fall:34, y:() => SY},
    {pts:ROADW, hw:5, fall:26, y:null}
  ];
  (function level(){
    const {nx, nz, C, x0, z0, Y} = TG, N = nx * nz, W = new Float32Array(N), Tg = new Float32Array(N);
    /* the road eases from the hill road's height at the junction to the station's */
    const r = CORR[1], prof = []; let acc = 0;
    r.pts.forEach((p, i) => { if (i) acc += Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]); prof.push(terrainY(p[0], p[1]) + (SY - terrainY(p[0], p[1])) * smooth01(0, 45, acc)); });
    r.y = (i, t) => prof[i] + (prof[i + 1] - prof[i]) * t;
    const put = (k, w, y) => { if (w > W[k]){ W[k] = w; Tg[k] = y; } };
    const box = (bx0, bz0, bx1, bz1, f) => {
      const i0 = Math.max(0, Math.ceil((bx0 - x0) / C)), i1 = Math.min(nx - 1, Math.floor((bx1 - x0) / C)), j0 = Math.max(0, Math.ceil((bz0 - z0) / C)), j1 = Math.min(nz - 1, Math.floor((bz1 - z0) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * nx + i, x0 + i * C, z0 + j * C);
    };
    { const R = PAD_D.fall + 4, cs = [[PAD_D.x0, PAD_D.z0], [PAD_D.x1, PAD_D.z0], [PAD_D.x1, PAD_D.z1], [PAD_D.x0, PAD_D.z1]].map(([x, z]) => T(x, z));
      box(Math.min(...cs.map(c => c[0])) - R, Math.min(...cs.map(c => c[1])) - R, Math.max(...cs.map(c => c[0])) + R, Math.max(...cs.map(c => c[1])) + R, (k, x, z) => put(k, 1 - smooth01(4, R, padDist(x, z)), SY)); }
    for (const c of CORR) for (let q = 0; q < c.pts.length - 1; q++){
      const a = c.pts[q], b = c.pts[q + 1], R = c.hw + c.fall;
      box(Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, (k, x, z) => { const [d, t] = segD(x, z, a, b); if (d < R) put(k, 1 - smooth01(c.hw + 3, R, d), c.y(q, t)); });
    }
    /* never move the ground under the roads that are already there (their asphalt was laid on it) */
    for (let k = 0; k < N; k++) if (W[k] > 0) W[k] *= smooth01(8, 22, TG.RD[k]);
    const hit = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (W[k] > 0){ const ny = Y[k] * (1 - W[k]) + Tg[k] * W[k]; if (Math.abs(ny - Y[k]) > 1e-4){ Y[k] = ny; hit[k] = 1; } }
    /* redraw the hill vertices that moved (and their neighbours' normals), with the same shading as js/12-terrain.js */
    const at = (i, j) => Y[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
    const cLow = new THREE.Color('#4f7a3b'), cMid = new THREE.Color('#3f6f2f'), cHigh = new THREE.Color('#2b5124'), cSoil = new THREE.Color('#9c6440'), cc = new THREE.Color();
    const near = k => { const i = k % nx, j = (k / nx) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++){ const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && hit[jj * nx + ii]) return true; } return false; };
    for (const m of TG.meshes){
      const geo = m.geometry, P = geo.attributes.position, Nn = geo.attributes.normal, Cc = geo.attributes.color; let any = false;
      for (let q = 0; q < P.count; q++){
        const i = Math.round((P.getX(q) - x0) / C), j = Math.round((P.getZ(q) - z0) / C), k = j * nx + i;
        if (!near(k)) continue;
        const gx_ = (at(i + 1, j) - at(i - 1, j)) / (2 * C), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * C), l = Math.hypot(gx_, 1, gz), h = Y[k], slope = Math.hypot(gx_, gz);
        const x = x0 + i * C, z = z0 + j * C, jit = (hash2(i * 7 + 3, j * 5 + 1) - .5) * .08;
        cc.copy(cLow).lerp(cMid, smooth01(.5, 6, h)).lerp(cHigh, smooth01(6, 32, h) * .8 + smooth01(.2, .45, slope) * .2); cc.lerp(cSoil, smooth01(.45, .75, slope) * .55);
        cc.multiplyScalar((.82 + .32 * vnoise(x / 95 + 9.1, z / 95 - 4.7)) * (1 + jit));
        P.setY(q, h); Nn.setXYZ(q, -gx_ / l, 1 / l, -gz / l); Cc.setXYZ(q, cc.r, cc.g, cc.b); any = true;
      }
      if (any){ P.needsUpdate = Nn.needsUpdate = Cc.needsUpdate = true; geo.computeBoundingSphere(); }
    }
  })();
  /* hill trees: clear the ones on the station, the tracks and the road; stand the rest of those nearby on the new ground */
  const onSite = (x, z, pad) => padDist(x, z) < pad || CORR.some(c => c.pts.some((a, q) => q < c.pts.length - 1 && segD(x, z, a, c.pts[q + 1])[0] < c.hw + pad));
  for (const set of OUT_SETS) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    if (onSite(o.x, o.z, 4)){ o.down = true; o.hidden = true; o.s = 0; o.x = o.z = 1e6; setKnock(set, i, false, 0, 0); return; }
    if (!onSite(o.x, o.z, 40)) return;
    let y = terrainY(o.x, o.z);
    if (set.kind === 'tree'){ const r = .48 * o.s; for (let a = 0; a < 8; a++) y = Math.min(y, terrainY(o.x + Math.cos(a * .785) * r, o.z + Math.sin(a * .785) * r)); y -= .05; }
    if (Math.abs(y - o.y) > .005){ o.y = o.ty = y; setKnock(set, i, !!o.down, 0, 1); }
  });

  /* ---------- the station's atlas: name boards and signs (purple, as after the 2025–26 refit) ---------- */
  const PURP = '#5b2a86', PURP2 = '#7b3fb0', TEAL = '#1f95b6';
  const SA = kAtlas(1024, 256);
  const S_NAME = SA.R(32, 0, 480, 64), S_ERL = SA.R(512, 0, 256, 64), S_TIX = SA.R(768, 0, 256, 64), S_DIRW = SA.R(32, 64, 320, 48), S_DIRE = SA.R(352, 64, 320, 48),
    S_P1 = SA.R(672, 64, 96, 48), S_P2 = SA.R(768, 64, 96, 48), S_GATE = SA.R(32, 112, 256, 48), S_TVM = SA.R(288, 112, 96, 128), S_PARK = SA.R(384, 112, 256, 64),
    S_EXP = SA.R(640, 112, 384, 48), S_TAP = SA.R(864, 64, 128, 48), S_GO = SA.R(640, 160, 160, 64);
  function paintStation(){
    const A = SA;
    kBoard(A, S_NAME, PURP, [{t:'Salak Tinggi', s:36, c:'#ffffff', y:.4, w:900}, {t:'沙叻丁宜 · ERL KLIA Transit', s:15, c:'#e6d6f5', y:.82, w:600}], true);
    kBoard(A, S_ERL, '#ffffff', [{t:'ERL', s:40, c:PURP, y:.45, w:900, x:.28}, {t:'KLIA Transit', s:17, c:TEAL, y:.5, w:700, x:.68}], true);
    kBoard(A, S_TIX, PURP2, [{t:'售票 Tiket · Tickets', s:24, c:'#ffffff', y:.5}], true);
    kBoard(A, S_DIRW, '#22252b', [{t:'← KLIA T1 · klia2', s:26, c:'#ffd23a', y:.5}], true);
    kBoard(A, S_DIRE, '#22252b', [{t:'Putrajaya · KL Sentral →', s:24, c:'#ffd23a', y:.5}], true);
    kBoard(A, S_P1, PURP, [{t:'1', s:34, c:'#ffffff', y:.52, w:900}], true);
    kBoard(A, S_P2, PURP, [{t:'2', s:34, c:'#ffffff', y:.52, w:900}], true);
    kBoard(A, S_GATE, '#2b2f36', [{t:'刷卡进站 · Tap here', s:22, c:'#7dffb0', y:.5}], true);
    kBoard(A, S_PARK, '#1d4f9a', [{t:'P  Park & Ride', s:30, c:'#ffffff', y:.5, w:900}], true);
    kBoard(A, S_EXP, '#f2c230', [{t:'KLIA Ekspres 不停站 · 请勿越过黄线', s:22, c:'#2b2f36', y:.5}], true);
    kBoard(A, S_TAP, '#2b2f36', [{t:'▶ 1 / 2', s:24, c:'#ffffff', y:.5}], true);
    kBoard(A, S_GO, '#20262c', [{t:'下一班 3 分钟', s:20, c:'#ff9a3d', y:.5}], true);
    /* ticket machine face: purple body, screen, card slot */
    { const {x, y, w, h} = S_TVM, c = A.c; c.fillStyle = PURP2; c.fillRect(x, y, w, h); c.fillStyle = '#18324a'; c.fillRect(x + 12, y + 14, w - 24, 46);
      c.fillStyle = '#4fc3ff'; c.fillRect(x + 18, y + 20, w - 36, 6); c.fillRect(x + 18, y + 32, w - 50, 4); c.fillStyle = '#f2c230'; c.fillRect(x + 22, y + 74, w - 44, 10);
      c.fillStyle = '#20262c'; c.fillRect(x + 30, y + 96, w - 60, 8); A.e.fillStyle = '#2a5d8a'; A.e.fillRect(x + 12, y + 14, w - 24, 46); }
    A.done();
  }
  paintStation(); document.fonts && document.fonts.ready.then(paintStation);
  const stMat = kMat(SA), glassMat = kGlass();
  const groundMat = typeof outGroundMat !== 'undefined' ? outGroundMat : M('#ffffff', {vertexColors:true, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-20});
  const markMat = typeof outMarkMat !== 'undefined' ? outMarkMat : groundMat;

  /* wavy canopy over x0..x1, z0..z1: base height y, waves along x; holes over x ranges in `gap` (stairs and the bridge go up through it) */
  function waveRoof(b, x0, x1, z0, z1, y, amp, per, gap, top, under, edge, bu){
    bu = bu || b;
    const n = Math.ceil((x1 - x0) / 2.5), Y = x => y + amp * Math.sin((x - SX) / per * Math.PI), zc = (z0 + z1) / 2, crown = .35;
    for (let i = 0; i < n; i++){
      const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
      if (gap && gap.some(([a, c]) => xb > a && xa < c)) continue;
      const ya = Y(xa), yb = Y(xb);
      for (const [za, zb, oa, ob] of [[z0, zc, 0, crown], [zc, z1, crown, 0]]){
        kQuad(b, [xa, ya + ob, zb], [xb, yb + ob, zb], [xb, yb + oa, za], [xa, ya + oa, za], top);
        kQuad(bu, [xa, ya + oa - .18, za], [xb, yb + oa - .18, za], [xb, yb + ob - .18, zb], [xa, ya + ob - .18, zb], under);
      }
      /* fascia along both long edges */
      kQuad(b, [xa, ya - .5, z1], [xb, yb - .5, z1], [xb, yb, z1], [xa, ya, z1], edge); kQuad(b, [xb, yb - .5, z0], [xa, ya - .5, z0], [xa, ya, z0], [xb, yb, z0], edge);
    }
    return Y;
  }

  const ST = {mesh:null, glass:null, rail:null, wires:null, road:null, marks:null, gate:null, all:[], built:false};
  (function buildStation(){
    const b = KB(), gl = KB(), rd = KB(), mk = KB(), inB = KB();   /* inB: faces that only get sky light from below or inside (canopy undersides, the hall inside), lit a little */
    const CON = '#d9d4ca', CON2 = '#bdb6aa', WHITE = '#f4f2ee', GREY = '#8d9196', DARK = '#2b2f36', FLOOR = '#e3ddd2';
    /* ---- platforms with yellow lines, benches, signs; glass screens on the Ekspres side ---- */
    PLAT.forEach(([z0, z1], pi) => {
      kBox(b, PX0, SY, z0, PX1, PY, z1, CON, 'ny py'); kFlat(b, PX0, z0, PX1, z1, PY, '#c9c4ba');
      for (const ze of [z0 + .6, z1 - .9]) kFlat(b, PX0 + .5, ze, PX1 - .5, ze + .3, PY + .012, '#f2c230');
      const exZ = pi ? z1 : z0, exDir = pi ? 1 : -1;   /* the edge facing the Ekspres track */
      for (let x = PX0 + 4; x < PX1 - 4; x += 12) if (!(x > SX + 4 && x < SX + 20)) kBox(gl, x, PY, exZ - exDir * .35, x + 11.6, PY + 1.6, exZ - exDir * .3, '#ffffff', '');
      for (let x = PX0 + 4; x <= PX1 - 4; x += 12) kBox(b, x - .06, PY, exZ - exDir * .4, x + .06, PY + 1.7, exZ - exDir * .25, GREY);
      kSign(b, 'z', exZ - exDir * .42, SX - 30, SX - 18, PY + 1.15, PY + 1.6, -exDir, S_EXP, '#ffffff');
      /* canopy columns down the middle of the platform, benches between them, hanging direction signs */
      const zc = (z0 + z1) / 2;
      for (let x = PX0 + 6; x < PX1 - 4; x += 12){
        if (x > SX + 5 && x < SX + 26) continue;
        kBox(b, x - .22, PY, zc - .22, x + .22, PY + 4.2, zc + .22, '#e8e6e2');
        kBox(b, x + 3, PY, zc - 1.4, x + 6, PY + .45, zc - .9, '#7b3fb0'); kBox(b, x + 3, PY, zc + .9, x + 6, PY + .45, zc + 1.4, '#7b3fb0');
      }
      for (const sx of [SX - 36, SX - 10, SX + 34]){
        kBox(b, sx - 1.8, PY + 3.2, zc - .08, sx + 1.8, PY + 3.75, zc + .08, DARK);
        kSign(b, 'z', zc + .09, sx - 1.7, sx + 1.7, PY + 3.25, PY + 3.7, 1, S_DIRW, '#ffffff'); kSign(b, 'z', zc - .09, sx - 1.7, sx + 1.7, PY + 3.25, PY + 3.7, -1, S_DIRE, '#ffffff');
        kBox(b, sx - .04, PY + 3.75, zc - .04, sx + .04, PY + 4.3, zc + .04, GREY);
      }
      kBox(b, SX - 52, PY + 2.4, zc - .6, SX - 50, PY + 3.4, zc + .6, PURP, '');
      kSign(b, 'x', SX - 52.02, zc - .5, zc + .5, PY + 2.45, PY + 3.35, -1, pi ? S_P2 : S_P1, '#ffffff');
      /* the stairs up to the footbridge (rising east) and the canopy over the platform */
      const sz0 = pi ? SZ + 6.6 : SZ - 9.4, sz1 = sz0 + 2.8, sx0 = SX + 6, sx1 = SX + 18;
      for (let k = 0; k < 16; k++){ const xa = sx0 + (sx1 - sx0) * k / 16, ya = PY + (BR.y - PY) * k / 16; kBox(b, xa, PY, sz0, xa + (sx1 - sx0) / 16 + .02, ya + (BR.y - PY) / 16, sz1, k % 2 ? '#cfc9be' : '#c4beb3', 'ny'); }
      for (const [z, s] of [[sz0, -1], [sz1, 1]]) for (const f of [1, -1]){ const zz = z + f * .06, A = [sx0, PY, zz], B = [sx1, BR.y, zz], C = [sx1, BR.y + 1.05, zz], D = [sx0, PY + 1.05, zz];
        if (f > 0) kQuad(b, A, B, C, D, '#e9e7e2'); else kQuad(b, B, A, D, C, '#e9e7e2'); }
      waveRoof(b, PX0 + 2, PX1 - 2, z0 - .7, z1 + .7, PY + 4.6, .7, 12, [[SX + 5, SX + 25]], '#f1f0ec', '#d9d4e6', PURP, inB);
    });
    /* ---- tracks between the two tunnel mouths: ballast with sleepers (its own textured strip), two rails ---- */
    const XE = SX + END.e, XW = SX - END.w, gyD = (x, z) => terrainY(...T(x, z));
    const balB = {p:[], n:[], c:[], u:[]}, railB = KB();
    for (const off of TZ){
      const z = SZ + off, v0 = 0, v1 = (XE - XW) / .65;
      const quad = [[[XW, SY + .12, z + 1.7], [0, v0]], [[XE, SY + .12, z + 1.7], [0, v1]], [[XE, SY + .12, z - 1.7], [1, v1]], [[XW, SY + .12, z - 1.7], [1, v0]]];
      for (const q of [0, 1, 2, 0, 2, 3]){ const [P, uv] = quad[q]; balB.p.push(P[0], P[1], P[2]); balB.n.push(0, 1, 0); balB.c.push(1, 1, 1); balB.u.push(uv[0], uv[1]); }
      for (const o of [-.72, .72]){ const zz = z + o; kBox(railB, XW, RT - .16, zz - .04, XE, RT, zz + .04, '#5f5a55', 'ny px nx'); kFlat(railB, XW, zz - .035, XE, zz + .035, RT + .002, '#c9cdd2'); }
    }
    /* trackbed under all four tracks (gravel between them) */
    kFlat(rd, XW, SZ - 16.2, XE, SZ + 16.2, SY + .05, '#8a8378');
    const sleeper = (() => { const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; const c = cv.getContext('2d');
      c.fillStyle = '#7c766c'; c.fillRect(0, 0, 32, 32); const R = mkRng(41); for (let i = 0; i < 90; i++){ c.fillStyle = R() < .5 ? '#958e83' : '#625d55'; c.fillRect(R() * 32, R() * 32, 2, 2); }
      c.fillStyle = '#b9b3a8'; c.fillRect(2, 11, 28, 10); c.fillStyle = '#9a948a'; c.fillRect(2, 19, 28, 2);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; })();
    const balMat = new THREE.MeshStandardMaterial({map:sleeper, roughness:.95, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-8});
    const bal = kMesh(balB, balMat, ST_IN, false); bal.castShadow = false;
    ST.rail = kMesh(railB, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.4, metalness:.55}), ST_IN, false);
    ST.all.push(bal, ST.rail);
    /* piers and a deck wherever the land falls away under the tracks */
    for (let x = XW; x < XE; x += 22){ const gy = gyD(x, SZ); if (gy > SY - 1.2) continue;
      for (const o of [-10, 0, 10]) kBox(b, x - 1, gy - .5, SZ + o - 1, x + 1, SY - .6, SZ + o + 1, CON2, 'ny');
      kFlat(b, x, SZ - 16.5, Math.min(XE, x + 22), SZ + 16.5, SY - .05, CON2); }
    /* tunnel mouths at both ends: a concrete portal with four dark bores, wing walls, and a grassy cover over the first stretch */
    for (const [x, dir] of [[XE, 1], [XW, -1]]){
      const xf = x + dir * .6, H = RT + 8.5;
      kBox(b, Math.min(x, xf), SY - .5, SZ - 19, Math.max(x, xf), H, SZ + 19, '#a9a397');
      for (const off of TZ) kSign(b, 'x', x - dir * .01, SZ + off - 2.1, SZ + off + 2.1, SY + .1, RT + 5.4, -dir, null, '#0b0c0e');
      kBox(b, Math.min(x, x + dir * 1.2), H, SZ - 19.4, Math.max(x, x + dir * 1.2), H + .6, SZ + 19.4, '#8f897d');
      for (const s of [-1, 1]) kBox(b, Math.min(x, x - dir * 8), SY - .5, SZ + s * 19 - (s > 0 ? 0 : 1.2), Math.max(x, x - dir * 8), SY + 4, SZ + s * 19 + (s > 0 ? 1.2 : 0), '#a9a397');
      /* the cover: how far it can run before another road or the land itself takes over */
      let len = 0; for (let d = 4; d <= 40; d += 4){ if ([-19, 0, 19].some(o => nearRoad(...T(x + dir * d, SZ + o), 4))) break; len = d; }
      if (len){ const x2 = x + dir * len; kBox(b, Math.min(x, x2), SY - .5, SZ - 19, Math.max(x, x2), H - .2, SZ + 19, '#4a7a3a', 'ny'); }
    }
    /* fences along the corridor */
    for (const off of [-16.8, 16.8]) for (let x = XW + 1; x < XE - 1; x += 6){ const z = SZ + off; if (gyD(x, z) < SY - 1.2) continue;
      if (off < 0 && x > CONC.x0 - 1 && x < CONC.x1 + 1) continue;
      const x2 = Math.min(XE - 1, x + 6);
      kBox(b, x - .05, SY, z - .05, x + .05, SY + 1.9, z + .05, '#3c4a40');
      kQuad(b, [x, SY + .1, z - .02], [x2, SY + .1, z - .02], [x2, SY + 1.8, z - .02], [x, SY + 1.8, z - .02], '#4c6152');
      kQuad(b, [x2, SY + .1, z + .02], [x, SY + .1, z + .02], [x, SY + 1.8, z + .02], [x2, SY + 1.8, z + .02], '#4c6152'); }
    /* overhead line: portals every ~55 m clear of the platforms, and the contact wires (one line mesh) */
    { const wire = [];
      for (let x = XW + 12; x < XE - 6; x += 55){ if (x > PX0 - 4 && x < PX1 + 4) continue;
        const gy = Math.min(SY, gyD(x, SZ)) - .3;
        for (const o of [-17.6, 17.6]) kBox(b, x - .18, gy, SZ + o - .18, x + .18, RT + 7.1, SZ + o + .18, '#8e959b');
        kBox(b, x - .2, RT + 6.7, SZ - 17.8, x + .2, RT + 7.1, SZ + 17.8, '#8e959b', ''); }
      for (const off of TZ) wire.push(XW, RT + 5.5, SZ + off, XE, RT + 5.5, SZ + off);
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      ST.wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({color:'#2e3236'})); ST_IN.add(ST.wires); ST.all.push(ST.wires); }

    /* ---- the station hall: glass front, purple fascia, wavy roof; inside: ticket counter, machines, fare gates, stairs up to the bridge ---- */
    const C = CONC, H = C.h;
    kBox(b, C.x0, SY, C.z0 + .3, C.x1, SY + .6, C.z1, CON2, 'ny py');
    kBox(b, C.x0, SY, C.z0, C.x0 + .5, SY + H, C.z1, WHITE); kBox(b, C.x1 - .5, SY, C.z0, C.x1, SY + H, C.z1, WHITE);
    kBox(inB, C.x0, SY, C.z1 - .5, BR.x0, SY + H, C.z1, WHITE); kBox(inB, BR.x1, SY, C.z1 - .5, C.x1, SY + H, C.z1, WHITE);
    kBox(inB, BR.x0, SY, C.z1 - .5, BR.x1, BR.y - .45, C.z1, WHITE); kBox(inB, BR.x0, BR.y + 3.3, C.z1 - .5, BR.x1, SY + H, C.z1, WHITE);
    kBox(b, C.x0, SY + 8, C.z0 - .3, C.x1, SY + H, C.z0 + .3, PURP);                                  /* fascia */
    kSign(b, 'z', C.z0 - .32, SX - 14, SX + 6, SY + 8.4, SY + 10.6, -1, S_NAME, '#ffffff');
    kSign(b, 'z', C.z0 - .32, SX + 9, SX + 19, SY + 8.4, SY + 10.6, -1, S_ERL, '#ffffff');
    for (let x = C.x0 + 4; x < C.x1 - 2; x += 4.5) kBox(b, x - .1, SY, C.z0 - .1, x + .1, SY + 8, C.z0 + .1, '#3b3f46');
    kBox(gl, C.x0, SY, C.z0 - .02, C.x1, SY + 8, C.z0 + .02, '#ffffff', '');
    kBox(b, SX - 4, SY + 3.2, C.z0 - 3.6, SX + 4, SY + 3.5, C.z0, '#e9e7e2', '');                       /* porch over the doors */
    for (const x of [SX - 3.8, SX + 3.8]) kBox(b, x - .1, SY, C.z0 - 3.5, x + .1, SY + 3.2, C.z0 - 3.3, GREY);
    waveRoof(b, C.x0 - 2, C.x1 + 2, C.z0 - 2, C.z1 + 1, SY + H + .4, .7, 12, null, '#f1f0ec', '#e4e0ea', PURP, inB);
    /* inside */
    kRoom(inB, C.x0 + .52, SY + .6, C.z0 + .05, C.x1 - .52, SY + H - .02, C.z1 - .5, '#ece8e0', FLOOR, '#f4f2ef', 'nz pz');
    kSign(b, 'z', C.z1 - .52, C.x0 + 3, C.x0 + 15, SY + 4.2, SY + 5.8, -1, S_TIX, '#ffffff');
    kBox(b, C.x0 + 2, SY + .6, C.z1 - 6, C.x0 + 16, SY + 1.7, C.z1 - 4.8, '#6b4a8f');                   /* ticket counter */
    kBox(b, C.x0 + 2, SY + 1.7, C.z1 - 6.1, C.x0 + 16, SY + 1.8, C.z1 - 4.7, '#e9e7e2');
    for (let k = 0; k < 3; k++){ const x = SX + 11 + k * 2.2;                                            /* ticket machines */
      kBox(b, x, SY + .6, C.z0 + 4, x + 1.5, SY + 2.5, C.z0 + 4.8, PURP2); kSign(b, 'z', C.z0 + 3.98, x + .05, x + 1.45, SY + .7, SY + 2.45, -1, S_TVM, '#ffffff'); }
    /* fare gates across the hall at z 1030, with the paid side behind */
    const GZ = 1030;
    for (let k = 0; k <= 6; k++){ const x = SX - 7 + k * 2.3; kBox(b, x - .16, SY + .6, GZ - .7, x + .16, SY + 1.65, GZ + .7, k === 3 ? '#e0dde6' : '#d0ccd8'); kFlat(b, x - .14, GZ - .6, x + .14, GZ - .3, SY + 1.66, '#38e07e'); }
    kBox(b, C.x0 + .5, SY + .6, GZ - .1, SX - 7.2, SY + 1.4, GZ + .1, '#c9c4cf'); kBox(b, SX + 6.9, SY + .6, GZ - .1, SX + 10, SY + 1.4, GZ + .1, '#c9c4cf');
    kBox(b, SX - 2.6, SY + 3.3, GZ - .06, SX + 2.6, SY + 3.95, GZ + .06, DARK, ''); kBox(b, SX - .03, SY + 3.95, GZ - .03, SX + .03, SY + H, GZ + .03, GREY);
    kSign(b, 'z', GZ - .07, SX - 2.5, SX + 2.5, SY + 3.35, SY + 3.9, -1, S_GATE, '#ffffff'); kSign(b, 'z', GZ + .07, SX - 2.5, SX + 2.5, SY + 3.35, SY + 3.9, 1, S_GO, '#ffffff');
    /* stairs inside up to the bridge landing */
    for (let k = 0; k < 16; k++){ const xa = SX + 8 + 10 * k / 16, ya = SY + .6 + (BR.y - SY - .6) * k / 16; kBox(b, xa, SY + .6, 1036.5, xa + 10 / 16 + .02, ya + (BR.y - SY - .6) / 16, 1039.5, k % 2 ? '#cfc9be' : '#c4beb3', 'ny'); }
    kBox(b, BR.x0, BR.y - .3, 1035.5, BR.x1, BR.y, C.z1, '#d6d1c7', '');
    /* ---- the footbridge over the tracks, glass sides, purple band ---- */
    kBox(b, BR.x0, BR.y - .45, C.z1, BR.x1, BR.y, BR.z1, '#d6d1c7', ''); kFlat(b, BR.x0, C.z1, BR.x1, BR.z1, BR.y + .01, '#cfc9be');
    kBox(b, BR.x0 - .2, BR.y + 3, C.z1 - .5, BR.x1 + .2, BR.y + 3.3, BR.z1 + .2, '#e9e7e2', '');
    kBox(b, BR.x0 - .25, BR.y + 2.5, C.z1, BR.x0 - .05, BR.y + 3, BR.z1, PURP); kBox(b, BR.x1 + .05, BR.y + 2.5, C.z1, BR.x1 + .25, BR.y + 3, BR.z1, PURP);
    for (let z = C.z1 + 3; z < BR.z1; z += 4.5) for (const x of [BR.x0, BR.x1]) kBox(b, x - .08, BR.y, z - .08, x + .08, BR.y + 3, z + .08, '#3b3f46');
    kBox(gl, BR.x0 - .02, BR.y, C.z1, BR.x0 + .02, BR.y + 2.5, BR.z1, '#ffffff', ''); kBox(gl, BR.x1 - .02, BR.y, C.z1, BR.x1 + .02, BR.y + 2.5, BR.z1, '#ffffff', '');
    for (const z of [SZ - 8, SZ + 8, BR.z1 - .5]) kBox(b, BR.x0 + .3, SY, z - .35, BR.x0 + 1, BR.y - .45, z + .35, '#cfcac0');
    kBox(b, BR.x1 - 1, SY, BR.z1 - .85, BR.x1 - .3, BR.y - .45, BR.z1 - .15, '#cfcac0');
    /* ---- Park & Ride: five open decks, purple top band, parked cars, a lift core, and a covered bridge to the hall ---- */
    { const P = PR, rr = mkRng(1130), CARC = ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2980b9', '#f1c40f', '#1f1f22', '#d35400', '#ecf0f1', '#95a5a6'];
      for (let k = 0; k <= P.n; k++){ const y = SY + k * P.h;
        if (k) kBox(b, P.x0, y - .35, P.z0, P.x1, y, P.z1, '#cfcac0', '');
        if (k){ kBox(b, P.x0, y, P.z0, P.x1, y + 1.05, P.z0 + .25, k === P.n ? PURP : '#e3ded4'); kBox(b, P.x0, y, P.z1 - .25, P.x1, y + 1.05, P.z1, '#e3ded4');
          kBox(b, P.x0, y, P.z0, P.x0 + .25, y + 1.05, P.z1, '#e3ded4'); kBox(b, P.x1 - .25, y, P.z0, P.x1, y + 1.05, P.z1, '#e3ded4'); }
        if (k < P.n) for (let x = P.x0 + 2.4; x < P.x1 - 8; x += 2.6) for (const zr of [P.z0 + 1.2, P.z1 - 6.2]) if (rr() < .62){
          const c = CARC[(rr() * CARC.length) | 0]; kBox(b, x, y + .25, zr, x + 1.8, y + 1.0, zr + 4.3, c); kBox(b, x + .15, y + 1.0, zr + .9, x + 1.65, y + 1.5, zr + 3.2, '#2c3a46'); }
      }
      for (let x = P.x0; x <= P.x1 + .1; x += 10) for (const z of [P.z0, (P.z0 + P.z1) / 2, P.z1]) kBox(b, x - .3, SY, z - .3, x + .3, SY + P.n * P.h, z + .3, '#d6d1c7');
      kBox(b, P.x1 - 7, SY, P.z0 + 9, P.x1 - .3, SY + P.n * P.h + 3, P.z0 + 17, '#c8c2b7');
      kSign(b, 'z', P.z0 - .02, P.x0 + 14, P.x0 + 34, SY + P.n * P.h - 2.6, SY + P.n * P.h - .4, -1, S_PARK, '#ffffff');
      kBox(b, P.x1, SY + 2 * P.h, 1026, C.x0, SY + 2 * P.h + .35, 1030, '#d6d1c7', ''); kBox(b, P.x1, SY + 2 * P.h + 2.7, 1025.6, C.x0, SY + 2 * P.h + 3, 1030.4, PURP, '');
      kBox(gl, P.x1, SY + 2 * P.h + .35, 1025.98, C.x0, SY + 2 * P.h + 2.7, 1026.02, '#ffffff', ''); kBox(gl, P.x1, SY + 2 * P.h + .35, 1029.98, C.x0, SY + 2 * P.h + 2.7, 1030.02, '#ffffff', ''); }
    /* ---- forecourt: paved plaza, taxi bay, surface car park ---- */
    kFlat(rd, 640, 1010, 776, CONC.z0, SY + .03, '#bdb3a2'); kFlat(rd, 742, 1021, 800, 1041, SY + .025, '#74716b');
    for (let x = 744; x < 799; x += 2.7) kFlat(mk, x, 1022, x + .12, 1027, SY + .04, '#f1ede4'), kFlat(mk, x, 1035, x + .12, 1040, SY + .04, '#f1ede4');
    /* the access road (world coordinates, from its junction to the forecourt), with kerbs and a centre line */
    const rdW = KB(), mkW = KB();
    { const P = kPath(ROADW); let prev = null;
      for (let d = 0; d <= P.L; d += 4){ const p = P.at(Math.min(d, P.L - .01)), nx_ = -p.fz, nz_ = p.fx;
        const cur = [[p.x - nx_ * 4, p.z - nz_ * 4], [p.x + nx_ * 4, p.z + nz_ * 4], [p.x - nx_ * 5.1, p.z - nz_ * 5.1], [p.x + nx_ * 5.1, p.z + nz_ * 5.1]];
        const y = (q, dy) => [q[0], terrainY(q[0], q[1]) + dy, q[1]];
        if (prev && d > 6){
          kUp(rdW, y(prev[0], .05), y(cur[0], .05), y(cur[1], .05), y(prev[1], .05), '#74716b');
          kUp(rdW, y(prev[2], .07), y(cur[2], .07), y(cur[0], .07), y(prev[0], .07), '#bdb4a4'); kUp(rdW, y(prev[1], .07), y(cur[1], .07), y(cur[3], .07), y(prev[3], .07), '#bdb4a4');
          if ((d / 4) % 3 === 0){ const m0 = [(prev[0][0] + prev[1][0]) / 2, (prev[0][1] + prev[1][1]) / 2], m1 = [(cur[0][0] + cur[1][0]) / 2, (cur[0][1] + cur[1][1]) / 2], o = [nx_ * .1, nz_ * .1];
            kUp(mkW, y([m0[0] - o[0], m0[1] - o[1]], .075), y([m1[0] - o[0], m1[1] - o[1]], .075), y([m1[0] + o[0], m1[1] + o[1]], .075), y([m0[0] + o[0], m0[1] + o[1]], .075), '#f1ede4'); }
        }
        prev = cur;
      } }
    /* taxi / drop-off lay-by in front of the doors */
    kFlat(rd, SX - 20, 1010.5, SX + 20, 1013.5, SY + .055, '#66635e'); kFlat(mk, SX - 20, 1013.3, SX + 20, 1013.5, SY + .07, '#f2c230');
    ST.mesh = kMesh(b, stMat, ST_IN, !TOUCH); ST.inner = kMesh(inB, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.7, emissive:'#5a5650'}), ST_IN, false); ST.all.push(ST.inner); ST.glass = kMesh(gl, glassMat, ST_IN, false); ST.glass.renderOrder = 1;
    ST.road = kMesh(rd, groundMat, ST_IN, false); ST.marks = kMesh(mk, markMat, ST_IN, false);
    ST.all.push(kMesh(rdW, groundMat, null, false), kMesh(mkW, markMat, null, false));
    ST.mesh.userData.info = {name:'Salak Tinggi ERL 站', tag:'车站',
      desc:'ERL KLIA Transit 的 Salak Tinggi 站（沙叻丁宜），真实位置在校门东南约 1 公里，这里压缩进地图里。地面站，两个岛式站台四条轨道，中间两条停 KLIA Transit，外侧两条是不停站呼啸而过的 KLIA Ekspres。站厅门口的紫圈按 F 坐车，一站 7 分钟到 KLIA。', spawn:[...T(SX, 1011), TH(Math.PI)]};
    pickables.push(ST.mesh);
    ST.all.push(ST.mesh, ST.glass, ST.road, ST.marks);
    /* the one fare gate that opens in the cutscene */
    { const gg = new THREE.Group(), fl = new THREE.BoxGeometry(.9, .55, .06), fm = new THREE.MeshStandardMaterial({color:'#b48cf0', transparent:true, opacity:.75, roughness:.2});
      const L = new THREE.Mesh(fl, fm), R = new THREE.Mesh(fl, fm); L.position.set(-.55, 0, 0); R.position.set(.55, 0, 0); gg.add(L, R);
      gg.position.set(SX + 1.15, SY + 1.25, GZ); ST_IN.add(gg); ST.gate = {g:gg, L, R}; ST.all.push(gg); }
    /* colliders: the tracks (fenced, between the tunnel mouths), the hall, the car park building; walking the rails is not allowed */
    addBoxD((XE + XW) / 2, SZ, (XE - XW) / 2 + 1, 16.9, 0);
    addBoxD((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, (C.x1 - C.x0) / 2, (C.z1 - C.z0) / 2, 0);
    addBoxD((PR.x0 + PR.x1) / 2, (PR.z0 + PR.z1) / 2, (PR.x1 - PR.x0) / 2, (PR.z1 - PR.z0) / 2, 0);
    { const [x, z] = T((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2); addFp({t:0, x, z, w:C.x1 - C.x0, d:C.z1 - C.z0, rot:PLACE.rot, color:'#7b3fb0'}); }
    { const [x, z] = T((PR.x0 + PR.x1) / 2, (PR.z0 + PR.z1) / 2); addFp({t:0, x, z, w:PR.x1 - PR.x0, d:PR.z1 - PR.z0, rot:PLACE.rot, color:'#9c948a'}); }
    { const [x, z] = T(SX, 1031); addLabel('Salak Tinggi ERL 站', x, SY + 16, z); }
    /* street lamps along the access road and coconut palms on the forecourt, as knock-down sets like the rest outside the gate */
    if (typeof outSet === 'function' && typeof outPostGeo !== 'undefined'){
      const P = kPath(ROADW), lamps = [];
      for (let d = 30; d < P.L - 10; d += TOUCH ? 52 : 38){ const p = P.at(d), o = 6.2; lamps.push(outSpot(p.x - p.fz * o, p.z + p.fx * o, Math.atan2(p.fz, -p.fx), 1)); }
      outSet('lamp', lamps, [[outPostGeo, M('#3b3f44', {metalness:.4, roughness:.5})], [outBulbGeo, bulbMat]], !TOUCH);
      if (typeof trunkGeo !== 'undefined'){ const palms = [], rr = mkRng(7071); for (let x = 684; x < 772; x += 14) if (Math.abs(x - SX) > 8) palms.push(outSpot(...T(x, 1017.6), rr() * 6.28, .85 + rr() * .3));
        outSet('tree', palms, [[trunkGeo, M('#ffffff', {vertexColors:true, roughness:.95})], [crownGeo, M('#ffffff', {side:THREE.DoubleSide, roughness:.8, vertexColors:true})]], true); }
    }
    ST.built = true;
  })();
  const homeMark = gxMarker('#a774ff', .55); homeMark.position.set(DOOR.x, SY + .1, DOOR.z);
  const homeLbl = addLabel('ERL 坐车 · 按 F', DOOR.x, SY + 4.2, DOOR.z, true); homeLbl.dead = true;

  /* ================= trains: 4-car sets, Desiro-like nose; KLIA Transit and KLIA Ekspres liveries ================= */
  const CAR_L = 17, CAR_W = 2.9, GAP = .7, SPAN = CAR_L + GAP, DOORX = [-4.2, 4.2];
  const LIVERY = {transit:{name:'KLIA Transit', low:TEAL, acc:PURP, front:TEAL, cab:PURP}, ekspres:{name:'KLIA Ekspres', low:PURP, acc:'#f2b705', front:PURP, cab:'#f2b705'}};
  const trainGeos = {};
  function carGeo(lv, kind){
    const b = KB(), L2 = CAR_L / 2, W2 = CAR_W / 2, xn = L2 - 2.6, nose = kind === 'end', x1 = nose ? xn : L2, WHITE = '#f3f5f7', GLASS = '#1d2733', DOORC = '#e4e8ec';
    const band = (y0, y1, col, xa, xb) => { for (const s of [1, -1]){ const z = s * W2; if (s > 0) kQuad(b, [xa, y0, z], [xb, y0, z], [xb, y1, z], [xa, y1, z], col); else kQuad(b, [xb, y0, z], [xa, y0, z], [xa, y1, z], [xb, y1, z], col); } };
    band(.45, 1.05, '#3a3f45', -L2, x1); band(1.05, 1.8, lv.low, -L2, x1); band(1.8, 1.92, lv.acc, -L2, x1); band(1.92, 2.78, GLASS, -L2, x1); band(2.78, 3.55, WHITE, -L2, x1);
    /* roof: two sloped edges and a flat top */
    kQuad(b, [-L2, 3.55, W2], [x1, 3.55, W2], [x1, 3.85, W2 - .55], [-L2, 3.85, W2 - .55], '#e1e5e9'); kQuad(b, [x1, 3.55, -W2], [-L2, 3.55, -W2], [-L2, 3.85, -W2 + .55], [x1, 3.85, -W2 + .55], '#e1e5e9');
    kQuad(b, [-L2, 3.85, W2 - .55], [x1, 3.85, W2 - .55], [x1, 3.85, -W2 + .55], [-L2, 3.85, -W2 + .55], '#d3d8dd');
    kQuad(b, [-L2, .45, -W2], [x1, .45, -W2], [x1, .45, W2], [-L2, .45, W2], '#2a2e33');
    /* the doors: two each side, leaves slightly proud of the body; the second car's front door stays dark (its leaves move separately) */
    for (const dx of DOORX) for (const s of [1, -1]){
      const z = s * (W2 + .012), xa = dx - .65, xb = dx + .65, dark = kind === 'board' && dx > 0;
      const col = dark ? '#20262c' : DOORC, win = dark ? '#20262c' : GLASS;
      if (s > 0){ kQuad(b, [xa, 1.1, z], [xb, 1.1, z], [xb, 3.05, z], [xa, 3.05, z], col); kQuad(b, [xa + .15, 2.0, z + .002], [xb - .15, 2.0, z + .002], [xb - .15, 2.85, z + .002], [xa + .15, 2.85, z + .002], win); }
      else { kQuad(b, [xb, 1.1, z], [xa, 1.1, z], [xa, 3.05, z], [xb, 3.05, z], col); kQuad(b, [xb - .15, 2.0, z - .002], [xa + .15, 2.0, z - .002], [xa + .15, 2.85, z - .002], [xb - .15, 2.85, z - .002], win); }
    }
    /* car ends (gangways) */
    const endF = (x, dir) => { if (dir > 0) kQuad(b, [x, .45, W2], [x, .45, -W2], [x, 3.85, -W2], [x, 3.85, W2], '#3b4047'); else kQuad(b, [x, .45, -W2], [x, .45, W2], [x, 3.85, W2], [x, 3.85, -W2], '#3b4047'); };
    endF(-L2, -1); if (!nose) endF(L2, 1);
    if (nose){
      /* the nose: side profile from the bottom, round the front, back over the cab roof */
      const P = [[xn, .45], [L2 - .08, .45], [L2, 1.05], [L2 - .12, 1.8], [L2 - 1.05, 2.95], [xn + .6, 3.62], [xn, 3.85]];
      for (const s of [1, -1]){ const pts = P.map(([x, y]) => [x, y, s * W2]); kPoly(b, s > 0 ? pts : pts.slice().reverse(), WHITE); }
      const cols = ['#2a2e33', '#3a3f45', lv.front, GLASS, WHITE, WHITE];
      for (let i = 0; i < P.length - 1; i++){ const [xa, ya] = P[i], [xb, yb] = P[i + 1]; kQuad(b, [xa, ya, W2], [xa, ya, -W2], [xb, yb, -W2], [xb, yb, W2], cols[i]); }
      /* livery wrapping onto the nose sides, cab side windows, headlights */
      for (const s of [1, -1]){ const z = s * (W2 + .01), q = [[xn, 1.05, z], [L2 - .02, 1.05, z], [L2 - .1, 1.75, z], [xn, 1.92, z]], w = [[xn + .35, 1.95, z], [xn + 1.25, 1.95, z], [xn + 1.25, 2.75, z], [xn + .35, 2.75, z]], a = [[xn, 1.8, z], [L2 - .1, 1.75, z], [L2 - .2, 1.92, z], [xn, 1.92, z]];
        for (const pts of [q, a, w]) kPoly(b, s > 0 ? pts : pts.slice().reverse(), pts === q ? lv.low : pts === a ? lv.acc : GLASS); }
      for (const s of [1, -1]) kSign(b, 'x', L2 + .005, s * .95 - .24, s * .95 + .24, 1.18, 1.4, 1, null, '#fffbe6');
    }
    /* bogies, roof air-conditioning; a pantograph on the middle cars */
    for (const bx of [-L2 + 2.6, L2 - 2.6]) kBox(b, bx - 1.3, .1, -1.05, bx + 1.3, .62, 1.05, '#24272b', '');
    kBox(b, -3, 3.85, -.75, 3, 4.15, .75, '#c6ccd2');
    if (kind !== 'end'){ kBox(b, 4.5, 3.85, -.5, 6.5, 4.0, .5, '#555b61'); kBox(b, 5.4, 4.0, -.04, 5.6, 4.9, .04, '#444a50'); kBox(b, 4.6, 4.85, -.6, 6.4, 4.92, .6, '#444a50'); }
    const geo = kGeo(b); geo.userData.keep = true; return geo;
  }
  const trainMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.42, metalness:.12}); trainMat.userData.keep = true;
  function geosOf(lv){ if (!trainGeos[lv]) trainGeos[lv] = {end:carGeo(LIVERY[lv], 'end'), mid:carGeo(LIVERY[lv], 'mid'), board:carGeo(LIVERY[lv], 'board')}; return trainGeos[lv]; }
  /* a train: four car meshes and the two sliding door pairs of the second car's front doors (one each side) */
  function makeTrain(lv){
    const G = geosOf(lv), root = new THREE.Group(), cars = [G.end, G.board, G.mid, G.end].map(geo => { const m = new THREE.Mesh(geo, trainMat); m.castShadow = !TOUCH; m.receiveShadow = true; root.add(m); return m; });
    const leafGeo = new THREE.BoxGeometry(.66, 1.95, .05), leafMat = new THREE.MeshStandardMaterial({color:'#e4e8ec', roughness:.35}), doors = {};
    leafGeo.userData.keep = true;
    for (const s of [1, -1]){ const dg = new THREE.Group(), a = new THREE.Mesh(leafGeo, leafMat), c = new THREE.Mesh(leafGeo, leafMat);
      dg.position.set(DOORX[1], 2.075, s * (CAR_W / 2 + .045)); a.position.x = -.33; c.position.x = .33; dg.add(a, c);
      const btn = new THREE.Mesh(new THREE.CircleGeometry(.09, 12), new THREE.MeshBasicMaterial({color:'#39e07a'}));
      btn.position.set(.95, .1, s * .03); btn.rotation.y = s > 0 ? 0 : Math.PI; dg.add(btn); cars[1].add(dg); doors[s] = {g:dg, a, c, btn, open:0}; }
    root.visible = false; scene.add(root);
    return {lv, root, cars, doors, path:null, s:0, v:0};
  }
  function placeTrain(tr, path, sFront){
    tr.path = path; tr.s = sFront;
    tr.cars.forEach((m, k) => {
      const d = sFront - CAR_L / 2 - k * SPAN, p = path.at(Math.max(0, Math.min(path.L, d))), th = Math.atan2(-p.fz, p.fx);
      m.position.set(p.x, path.y, p.z); m.rotation.set(0, th + (k === 3 ? Math.PI : 0), 0);
      m.visible = !path.vis || (d > path.vis[0] - CAR_L * .3 && d < path.vis[1] + CAR_L * .3);   /* inside a tunnel: out of sight */
    });
    tr.root.visible = true;
  }
  /* the front's distance along the path that puts the second car's front door at distance d */
  const frontFor = d => d + CAR_L / 2 + SPAN - DOORX[1];
  function setDoor(tr, side, k){
    const d = tr.doors[side]; if (!d) return; d.open = k; d.a.position.x = -.33 - .62 * k; d.c.position.x = .33 + .62 * k;
  }
  /* which side of the train (local z sign) faces a point */
  function sideTo(tr, x, z){ const m = tr.cars[1], th = m.rotation.y, lz = (x - m.position.x) * Math.sin(th) + (z - m.position.z) * Math.cos(th); return lz >= 0 ? 1 : -1; }
  function doorWorld(tr, side, out){
    const m = tr.cars[1], th = m.rotation.y, lx = DOORX[1], lz = side * (CAR_W / 2 + (out || 0));
    return [m.position.x + lx * Math.cos(th) + lz * Math.sin(th), m.position.z - lx * Math.sin(th) + lz * Math.cos(th)];
  }

  /* ---------- trains passing the station while you are near it ---------- */
  const AMB = {tr:{}, cur:null, next:8, rumble:0};
  const ambTrain = lv => AMB.tr[lv] || (AMB.tr[lv] = makeTrain(lv));
  function ambUpdate(dt, px, pz){
    const near = Math.hypot(px - PLACE.x, pz - PLACE.z) < 520 && !CS.on && !XT.inside;
    const a = AMB.cur;
    if (!near){ if (a){ a.tr.root.visible = false; AMB.cur = null; } AMB.next = Math.min(AMB.next, 10); return; }
    if (!a){
      if ((AMB.next -= dt) > 0) return;
      const ek = Math.random() < .5, west = Math.random() < .5;
      const tr = ambTrain(ek ? 'ekspres' : 'transit'), path = (west ? PATH_W : PATH_E)[ek ? (west ? 3 : 0) : (west ? 2 : 1)];
      const stop = ek ? null : frontFor(path.sAt(...T(SX - 6, SZ)));
      AMB.cur = {tr, path, stop, s:ek ? 0 : stop - 260, v:ek ? 38 : 26, dwell:0, ph:'run', horn:false};
      placeTrain(tr, path, AMB.cur.s); return;
    }
    if (a.stop != null && a.ph === 'run' && a.s < a.stop){
      const left = a.stop - a.s; a.v = Math.max(.6, Math.min(26, Math.sqrt(2 * 1.3 * left))); a.s = Math.min(a.stop, a.s + a.v * dt);
      if (a.s >= a.stop - .01){ a.ph = 'dwell'; a.dwell = 14; }
    } else if (a.ph === 'dwell'){ if ((a.dwell -= dt) <= 0){ a.ph = 'go'; a.v = 0; } }
    else { if (a.ph === 'go') a.v = Math.min(30, a.v + 1.2 * dt); a.s += a.v * dt; }
    placeTrain(a.tr, a.path, a.s);
    /* a rumble and a two-tone horn as an Ekspres goes by */
    const p = a.path.at(Math.max(0, Math.min(a.path.L, a.s))), d = Math.hypot(px - p.x, pz - p.z);
    if (a.stop == null && !a.horn && d < 260 && a.s > 60){ a.horn = true; const v = Math.max(.02, .1 * (1 - d / 300)); tone('square', 494, 490, .5, v); tone('square', 392, 388, .7, v, .55); }
    if ((AMB.rumble -= dt) <= 0 && d < 90 && a.v > 5){ AMB.rumble = .5; noise(.6, Math.min(.18, .2 * (1 - d / 90) * a.v / 38), 380); }
    if (a.s - 4 * SPAN > a.path.L){ a.tr.root.visible = false; AMB.cur = null; AMB.next = 25 + Math.random() * 30; }
  }

  /* ================= the ride: an off-map carriage with the land streaming past its windows ================= */
  const RIDE = {x:-700, z:-2350, g:null, palms:null, poles:null, ps:[], sign:null, sc:null};
  function rideBuild(nextName){
    if (RIDE.g) rideFree();
    const gr = RIDE.g = new THREE.Group(), b = KB(), X = RIDE.x, Z = RIDE.z, L2 = 8.5, W2 = 1.42, Hc = 2.35;
    /* carriage: floor, purple seats along both sides, windows (wall below and above the glass only), grab poles, lights */
    kQuad(b, [X - L2, .02, Z + W2], [X + L2, .02, Z + W2], [X + L2, .02, Z - W2], [X - L2, .02, Z - W2], '#7d7f86');
    kQuad(b, [X - L2, Hc, Z - W2], [X + L2, Hc, Z - W2], [X + L2, Hc, Z + W2], [X - L2, Hc, Z + W2], '#eceef0');
    for (const s of [1, -1]){ const z = Z + s * W2, dir = -s;
      kSign(b, 'z', z, X - L2, X + L2, 0, .95, dir, null, '#e6e9ec'); kSign(b, 'z', z, X - L2, X + L2, 1.85, Hc, dir, null, '#e6e9ec');
      for (let x = X - L2; x <= X + L2; x += 2.4) kBox(b, x - .07, .95, z - .04, x + .07, 1.85, z + .04, '#c9ced3', '');
      for (let x = X - L2 + .6; x < X + L2 - 1; x += 3.4){ kBox(b, x, .35, z - s * .55, x + 2.6, .5, z - s * .02, '#6b2fa0', 'ny'); kBox(b, x, .5, z - s * .12, x + 2.6, 1.0, z - s * .02, '#7b3fb0', 'ny'); }
      for (let x = X - L2 + 2; x < X + L2; x += 4) kBox(b, x - .03, 0, z - s * .7, x + .03, Hc, z - s * .64, '#c9ced3', ''); }
    for (const x of [X - L2, X + L2]) kSign(b, 'x', x, Z - W2, Z + W2, 0, Hc, x < X ? 1 : -1, null, '#d5d8dc');
    kBox(b, X - L2, Hc - .06, Z - .2, X + L2, Hc - .02, Z + .2, '#fffbe6', '');
    gr.add(new THREE.Mesh(kGeo(b), new THREE.MeshStandardMaterial({vertexColors:true, roughness:.6, emissive:'#6a6a6a'})));
    /* the "next station" strip over the doors */
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = '#111418'; c.fillRect(0, 0, 512, 64); c.fillStyle = '#ff9a3d'; c.font = `700 30px ${FONT}`; c.textBaseline = 'middle'; c.fillText('下一站 Next: ' + nextName, 14, 33);
    const st = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .32), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv)}));
    st.position.set(X - 1, Hc - .3, Z + W2 - .05); st.rotation.y = Math.PI; gr.add(st);
    /* outside: green ground and a strip of oil palms and catenary poles that loops past */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), M('#4f7a3b', {roughness:.95})); ground.rotation.x = -Math.PI / 2; ground.position.set(X, -.6, Z); gr.add(ground);
    const palmGeo = typeof oilPalmGeo !== 'undefined' ? oilPalmGeo : new THREE.ConeGeometry(2, 6, 6);
    const pm = new THREE.InstancedMesh(palmGeo, M('#ffffff', {vertexColors:typeof oilPalmGeo !== 'undefined', side:THREE.DoubleSide, roughness:.85}), 70); pm.geometry.userData.keep = true; pm.frustumCulled = false;
    const poleGeo = new THREE.BoxGeometry(.25, 7, .25).translate(0, 3, 0), po = new THREE.InstancedMesh(poleGeo, M('#8e959b'), 14); po.frustumCulled = false;
    RIDE.ps = []; const rr = mkRng(99);
    for (let i = 0; i < 70; i++) RIDE.ps.push({x:X - 300 + rr() * 600, z:Z + (rr() < .5 ? -1 : 1) * (7 + rr() * 60), s:.8 + rr() * .5, r:rr() * 6.28});
    gr.add(pm, po); RIDE.palms = pm; RIDE.poles = po; scene.add(gr);
  }
  const _rm = new THREE.Matrix4(), _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _rs = new THREE.Vector3();
  function rideStep(dt, v){
    if (!RIDE.g) return;
    const X = RIDE.x;
    RIDE.ps.forEach((o, i) => { o.x -= v * dt * (Math.abs(o.z - RIDE.z) < 20 ? 1 : .999); if (o.x < X - 300) o.x += 600; _rm.compose(_rp.set(o.x, -.6, o.z), _rq.setFromAxisAngle(UP, o.r), _rs.setScalar(o.s)); RIDE.palms.setMatrixAt(i, _rm); });
    RIDE.palms.instanceMatrix.needsUpdate = true;
    RIDE.poleX = ((RIDE.poleX || 0) - v * dt) % 50;
    for (let i = 0; i < 14; i++){ _rm.compose(_rp.set(X - 325 + i * 50 + RIDE.poleX + 50, -.6, RIDE.z - 5), _rq.identity(), _rs.setScalar(1)); RIDE.poles.setMatrixAt(i, _rm); }
    RIDE.poles.instanceMatrix.needsUpdate = true;
  }
  function rideFree(){ if (RIDE.g){ kDispose(RIDE.g); RIDE.g = null; } }

  /* ================= stations (where the cutscene walks and where the trains stop) ================= */
  /* A station: out [x, y, z, h] where you stand outside; gate [x, y, z]; go: path from out through the gate to the waiting spot;
     back: path from the train door to out; dep / arr: {path, stop (front s), side (sign of the platform as seen from the train)};
     cams: fixed shots [[camera], [look at]]; pass: a path an Ekspres can thunder along while you wait; gate(): animate a gate (k 0..1). */
  /* written in the station's own frame, turned into world coordinates by spec() */
  const HOME_D = {
    id:'home', name:'Salak Tinggi', zh:'沙叻丁宜', out:[SX - 7, SY, 1011.6, Math.PI],
    gate:[SX + 1.15, SY + .6, 1030],
    go:[[SX + 1.15, SY + .6, 1026.6], [SX + 1.15, SY + .6, 1029.3], [SX + 1.15, SY + .6, 1033], [SX + 5, SY + .6, 1038], [SX + 8, SY + .6, 1038], [SX + 18, BR.y, 1038], [SX + 21, BR.y, 1039.5],
      [SX + 21, BR.y, SZ + 8], [SX + 18, BR.y, SZ + 8], [SX + 6, PY, SZ + 8], [SX + 2, PY, SZ + 6.2], [SX - 6, PY, SZ + 5.2]],
    back:[[SX - 6, PY, SZ - 4.6], [SX + 2, PY, SZ - 7], [SX + 6, PY, SZ - 8], [SX + 18, BR.y, SZ - 8], [SX + 21, BR.y, SZ - 8], [SX + 21, BR.y, 1039.5], [SX + 18, BR.y, 1038],
      [SX + 8, SY + .6, 1038], [SX + 4, SY + .6, 1035], [SX + 1.15, SY + .6, 1032], [SX + 1.15, SY + .6, 1027], [SX, SY + .6, 1019.5], [SX, SY, 1016], [SX - 7, SY, 1011.6]],
    dep:{path:PATH_W[2], at:T(SX - 6, SZ)}, arr:{path:PATH_E[1], at:T(SX - 6, SZ)},
    waitH:Math.PI,
    cams:{gate:[[SX - 5.5, SY + 3.6, 1024.5], [SX + 1.5, SY + 1.2, 1031]], wait:[[SX - 31.5, PY + 2.1, SZ + 10.4], [SX - 2, PY + 1.4, SZ + 3.5]],
      door:[[SX - 10.4, PY + 2.3, SZ + 9.5], [SX - 5.4, PY + 1.5, SZ + 3.2]], arrive:[[SX - 18, PY + 2.6, SZ - 9.5], [SX - 6, PY + 1.6, SZ - 3]]},
    pass:PATH_W[3],
    gateFx(k){ const G = ST.gate; if (!G) return; G.L.position.x = -.55 - .5 * k; G.R.position.x = .55 + .5 * k; G.L.rotation.y = -k * 1.2; G.R.rotation.y = k * 1.2; }
  };
  const HOME = Object.assign({}, HOME_D, {
    out:[...P3(HOME_D.out[0], HOME_D.out[1], HOME_D.out[2]), TH(HOME_D.out[3])], gate:P3(...HOME_D.gate), waitH:TH(HOME_D.waitH),
    go:HOME_D.go.map(p => P3(...p)), back:HOME_D.back.map(p => P3(...p)),
    cams:Object.fromEntries(Object.entries(HOME_D.cams).map(([k, [a, c]]) => [k, [P3(...a), P3(...c)]]))
  });

  /* ================= XTrain: destinations, the cutscene director, being away ================= */
  const XT = {dests:[], inside:null, keep:null};
  const CS = {on:false, ph:'', t:0, dest:null, out:true, A:null, B:null, path:null, seg:0, tr:null, pass:null, pressed:false, swapped:false, skip:false, fare:0, fade:0, doorSide:1, camP:new THREE.Vector3(), camT:new THREE.Vector3()};
  function register(d){
    if (!d || !d.id || XT.dests.some(x => x.id === d.id)) return;
    XT.dests.push(Object.assign({fare:6, mins:7, soon:false}, d));
    if (panel.on) panelShow();
  }
  const destOf = id => XT.dests.find(d => d.id === id);
  const busyWhy = () => driving ? '先下车，走进站厅' : g(() => mission.on, false) ? '先把手上的外卖送完' : gx.busy() ? '先把手上的挑战做完' : '';

  /* ---------- HUD: fade, info bar, skip and door buttons; the destination panel ---------- */
  { const st = document.createElement('style'); st.textContent = `
#trFade{position:fixed;inset:0;z-index:20;background:#05070b;opacity:0;pointer-events:none;display:grid;place-items:center;transition:opacity .35s}
#trFade.on{pointer-events:auto}
#trFade .cap{color:#fff;text-align:center;font-family:var(--display);opacity:.95}
#trFade .cap b{display:block;font-size:clamp(22px,5vw,34px);letter-spacing:.04em}
#trFade .cap small{display:block;margin-top:8px;font-size:14px;color:#c9b6ec;font-family:inherit}
#trBar{position:fixed;z-index:21;left:calc(var(--safe-l, 0px) + 12px);top:calc(var(--safe-t, 0px) + 12px);display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:999px;box-sizing:border-box;
  background:rgba(20,16,30,.82);color:#fff;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:calc(100% - 118px - var(--safe-l, 0px) - var(--safe-r, 0px));white-space:nowrap;overflow:hidden}
#trBar span{overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}
#trBar i{font-style:normal;font-weight:900;background:${PURP2};border-radius:6px;padding:2px 7px;font-size:12px;letter-spacing:.05em}
#trBar b{font-variant-numeric:tabular-nums;color:#ffd23a;overflow:hidden;text-overflow:ellipsis}
#trSkip{position:fixed;z-index:21;right:calc(var(--safe-r, 0px) + 12px);top:calc(var(--safe-t, 0px) + 10px);min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.35);
  background:rgba(20,16,30,.78);color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation}
#trDoor{position:fixed;z-index:21;left:50%;bottom:calc(var(--safe-b, 0px) + 34px);transform:translateX(-50%);min-height:64px;min-width:min(320px,calc(100% - 40px));padding:12px 22px;border-radius:999px;
  border:3px solid #39e07a;background:#13361f;color:#fff;font:inherit;font-size:19px;font-weight:900;cursor:pointer;touch-action:manipulation;box-shadow:0 0 0 0 rgba(57,224,122,.6);animation:trPulse 1.2s infinite}
#trDoor kbd{font-size:12px;margin-left:8px;opacity:.75}
@keyframes trPulse{70%{box-shadow:0 0 0 16px rgba(57,224,122,0)}100%{box-shadow:0 0 0 0 rgba(57,224,122,0)}}
@media (prefers-reduced-motion: reduce){ #trDoor{animation:none} #trFade{transition:none} }
@media (pointer: coarse){ #trDoor kbd,#trPanel kbd{display:none} }
body.tr-on #acts,body.tr-on #joy,body.tr-on #prompt,body.tr-on #compass,body.tr-on #help{display:none!important}
body.tr-on .topbar{visibility:hidden}
#trPanel{position:fixed;z-index:22;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;
  padding:14px 16px 16px;background:var(--panel-solid);border-top:4px solid ${PURP2}}
#trPanel h2{font-family:var(--display);font-size:18px;margin:0 36px 4px 0}
#trPanel .note{font-size:12.5px;color:var(--muted);line-height:1.6;margin:0 0 4px}
#trPanel .dest{display:block;width:100%;box-sizing:border-box;text-align:left;padding:11px 12px;margin-top:8px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg);color:var(--ink);
  cursor:pointer;font:inherit;touch-action:manipulation;min-height:56px}
#trPanel .dest:hover:not([disabled]),#trPanel .dest:active:not([disabled]){border-color:${PURP2}}
#trPanel .dest[disabled]{opacity:.5;cursor:default}
#trPanel .dest b{font-family:var(--display);font-size:16px}
#trPanel .dest kbd{float:right}
#trPanel .dest span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;line-height:1.5}
#trPanel .dest em{font-style:normal;color:${PURP2};font-weight:700}
`; document.head.appendChild(st); }
  const fadeEl = document.createElement('div'); fadeEl.id = 'trFade'; fadeEl.innerHTML = '<div class="cap"><b></b><small></small></div>';
  const barEl = document.createElement('div'); barEl.id = 'trBar'; barEl.hidden = true; barEl.innerHTML = '<i>ERL</i><span></span><b></b>';
  const skipEl = document.createElement('button'); skipEl.id = 'trSkip'; skipEl.type = 'button'; skipEl.hidden = true; skipEl.textContent = '跳过 ›';
  const doorEl = document.createElement('button'); doorEl.id = 'trDoor'; doorEl.type = 'button'; doorEl.hidden = true; doorEl.innerHTML = '按门边的绿色按钮开门<kbd>F</kbd>';
  const panelEl = document.createElement('div'); panelEl.className = 'panel'; panelEl.id = 'trPanel'; panelEl.hidden = true; panelEl.setAttribute('role', 'dialog'); panelEl.setAttribute('aria-labelledby', 'trPT');
  panelEl.innerHTML = '<h2 id="trPT"></h2><button type="button" class="x" id="trPX" aria-label="关闭">×</button><div id="trPB"></div>';
  document.body.append(fadeEl, barEl, skipEl, doorEl, panelEl);
  const fadeTo = (k, title, sub) => { fadeEl.style.opacity = String(k); fadeEl.classList.toggle('on', k > .5); if (title != null){ fadeEl.querySelector('b').textContent = title; fadeEl.querySelector('small').textContent = sub || ''; } };
  const bar = (a, b) => { barEl.hidden = !a && !b; const s = barEl.querySelector('span'), bb = barEl.querySelector('b'); if (s.textContent !== a) s.textContent = a || ''; if (bb.textContent !== (b || '')) bb.textContent = b || ''; };
  skipEl.addEventListener('click', () => skip());
  doorEl.addEventListener('pointerdown', e => { e.preventDefault(); pressDoor(); });

  /* the destination panel: from the home station it lists every destination; at a destination it offers the ride home */
  const panel = {on:false, list:[]};
  function panelShow(){
    const away = XT.inside, P = $('#trPB');
    $('#trPT').textContent = away ? `ERL · ${away.station.name}` : 'ERL · Salak Tinggi 站';
    const rows = away ? [{id:'home', name:'回 Salak Tinggi 沙叻丁宜', en:'回学校附近', mins:away.mins, fare:away.fare, home:true}] : XT.dests;
    panel.list = rows;
    P.innerHTML = `<p class="note">钱包 <b>${fmtRM(money)}</b> · 刷卡进站扣车费 · 坐车过场随时能跳过</p>` + rows.map((d, i) => {
      const poor = !d.soon && money < d.fare, dis = d.soon || poor;
      return `<button type="button" class="dest" data-i="${i}" ${dis ? 'disabled' : ''}><b>${d.name}</b>${dis ? '' : `<kbd>${i + 1}</kbd>`}<span>${d.soon ? '即将开通 · ' + (d.en || '') : `${d.en ? d.en + ' · ' : ''}约 ${d.mins} 分钟 · 车费 <em>RM ${d.fare.toFixed(2)}</em>${poor ? ' · 钱不够' : ''}`}</span></button>`;
    }).join('');
    P.querySelectorAll('.dest').forEach(el => el.addEventListener('click', () => panelPick(+el.dataset.i)));
  }
  function panelOpen(){
    if (panel.on) return;
    panel.on = true; panelShow(); panelEl.hidden = false; document.body.classList.add('op-open');
    gx.paused = true; for (const k in keys) keys[k] = false; engineUpdate(0, 0, false);
  }
  function panelClose(){ if (!panel.on) return; panel.on = false; panelEl.hidden = true; document.body.classList.remove('op-open'); gx.paused = false; canvas.focus({preventScroll:true}); }
  function panelPick(i){
    const d = panel.list[i]; if (!d || d.soon || money < d.fare) return;
    panelClose();
    if (d.home) start(XT.inside, false); else start(d, true);
  }
  $('#trPX').addEventListener('click', () => panelClose());

  /* ---------- far away from the campus (riding, at a destination) the camera stops at 1.4 km, so the whole campus 3 km behind
     the fog is not drawn any more (it was ~400 extra draw calls looking back from KLIA); the sky dome shrinks to fit inside ---------- */
  const FAR = {on:false, far:0, sky:1};
  function farClip(on){
    if (on === FAR.on) return; FAR.on = on;
    if (on){ FAR.far = camera.far; camera.far = 1400; if (typeof sky !== 'undefined'){ FAR.sky = sky.scale.x; sky.scale.setScalar(.25); } }
    else { camera.far = FAR.far || 6000; if (typeof sky !== 'undefined') sky.scale.setScalar(FAR.sky || 1); }
    camera.updateProjectionMatrix();
  }

  /* ---------- the cutscene ---------- */
  const PH = {gate:2.4, wait:4.8, arrive:6, open:.8, board:1.2, close:1.9, depart:3.4, ride:4.6, black:1.1};
  let NW_VIS = true;
  function puppet(x, y, z, h, walking, dt){
    nw.x = x; nw.y = y; nw.z = z; if (h != null) nw.h = h; nw.air = false; nw.state = 'idle';
    nw.spd = walking ? 3 : 0; if (walking) nw.walkT += dt * 9;
    NW.root.position.set(x, y, z); NW.root.rotation.y = nw.h;
  }
  function shot(cam, dt, snap){
    /* a new phase cuts to its shot (panning between shots swept the camera through the canopy columns) */
    const [p, t] = cam, k = snap || CS.t <= dt + 1e-6 || CS.camP.distanceTo(_v.set(p[0], p[1], p[2])) > 40 ? 1 : 1 - Math.exp(-dt * 4);
    CS.camP.lerp(_v.set(p[0], p[1], p[2]), k); CS.camT.lerp(_v.set(t[0], t[1], t[2]), k);
  }
  const _v = new THREE.Vector3();
  function follow(dt, snap){
    const h = nw.h, k = snap || CS.camP.distanceTo(_v.set(nw.x, nw.y, nw.z)) > 40 ? 1 : 1 - Math.exp(-dt * 3);
    CS.camP.lerp(_v.set(nw.x - Math.sin(h) * 6.5, nw.y + 3.6, nw.z - Math.cos(h) * 6.5), k); CS.camT.lerp(_v.set(nw.x, nw.y + 1.3, nw.z), k);
  }
  /* walk along a path at speed v; true once at the end */
  function walk(path, dt, v){
    let left = v * dt, x = nw.x, y = nw.y, z = nw.z, h = null;
    while (left > 0 && CS.seg < path.length - 1){
      const b = path[CS.seg + 1], d = Math.hypot(b[0] - x, b[2] - z);
      if (d < 1e-3){ x = b[0]; y = b[1]; z = b[2]; CS.seg++; continue; }
      const step = Math.min(left, d), t = step / d; h = Math.atan2(b[0] - x, b[2] - z);
      x += (b[0] - x) * t; y += (b[1] - y) * t; z += (b[2] - z) * t;
      left -= step; if (step >= d - 1e-6) CS.seg++;
    }
    if (h != null) nw.h += Math.atan2(Math.sin(h - nw.h), Math.cos(h - nw.h)) * Math.min(1, dt * 10);
    puppet(x, y, z, null, h != null, dt);
    return CS.seg >= path.length - 1;
  }
  function stationTrain(S, which, lv){
    const D = S[which], tr = CS.tr || (CS.tr = makeTrain(lv || 'transit'));
    const path = D.path, stop = frontFor(Array.isArray(D.at) ? path.sAt(D.at[0], D.at[1]) : path.sAtX(D.at));
    return {tr, path, stop};
  }
  function hud(on){
    document.body.classList.toggle('tr-on', on); skipEl.hidden = !on; if (!on){ bar(); doorEl.hidden = true; }
  }
  /* go: dest = where to (out: from home to dest; back: from dest to home) */
  function start(dest, out){
    if (CS.on || !dest) return;
    if (mode !== 'naiwa') setMode('naiwa');
    const fare = out ? dest.fare : (XT.inside ? XT.inside.fare : dest.fare);
    if (money < fare){ toast('车费不够', `坐到 ${out ? dest.name : 'Salak Tinggi'} 要 RM ${fare.toFixed(2)}`, 2200); return; }
    Object.assign(CS, {on:true, ph:'gate', t:0, dest, out, A:out ? HOME : dest.station, B:out ? null : HOME, seg:0, pressed:false, swapped:false, skip:false, fare, charged:false, pass:null, passS:null, passDone:false, honk:false});
    if (AMB.cur){ AMB.cur.tr.root.visible = false; AMB.cur = null; AMB.next = 20; }
    if (!XT.keep) XT.keep = {dist:camDist, pitch:camPitch};
    gx.paused = true; for (const k in keys) keys[k] = false; engineUpdate(0, 0, false);
    window.XINDOOR = 'erl'; window.XINDOOR_AT = {x:DOOR.x, z:DOOR.z, h:Math.PI, name:'Salak Tinggi 站'};
    homeMark.visible = false; homeLbl.dead = true;
    hud(true); NW.root.visible = true;
    const A = CS.A; puppet(A.go[0][0], A.go[0][1], A.go[0][2], Math.atan2(A.go[1][0] - A.go[0][0], A.go[1][2] - A.go[0][2]), false, 0);
    shot(A.cams.gate, 0, true); camera.fov = 60; camera.updateProjectionMatrix();
    bar(out ? `${HOME.name} → ${dest.name}` : `${dest.station.name} → Salak Tinggi`, '刷卡进站');
  }
  function charge(){
    if (CS.charged) return; CS.charged = true;
    money = Math.max(0, Math.round((money - CS.fare) * 100) / 100); moneyChanged();
    moneyEl.classList.remove('gx-bump'); void moneyEl.offsetWidth; moneyEl.classList.add('gx-bump');
    tone('sine', 1568, 1568, .09, .12); tone('sine', 2093, 2093, .12, .1, .1);
    toast(`嘀——刷卡进站 −RM ${CS.fare.toFixed(2)}`, `钱包还剩 ${fmtRM(money)}`, 2200);
  }
  const chime = () => { [880, 698, 587].forEach((f, i) => tone('triangle', f, f, .38, .12, i * .42)); };
  function pressDoor(){
    if (!CS.on || CS.ph !== 'door' || CS.pressed) return;
    CS.pressed = true; doorEl.hidden = true; tone('square', 1200, 1200, .06, .08); tone('triangle', 660, 990, .25, .1, .08);
    CS.ph = 'open'; CS.t = 0;
  }
  function skip(){
    if (!CS.on) return;
    if (CS.ph === 'out'){ finish(); return; }
    if (CS.ph === 'black'){ CS.skip = true; return; }
    charge(); CS.skip = true; CS.ph = 'black'; CS.t = 0; doorEl.hidden = true;
  }
  /* swap the world during the black: build or release the destination, and stand the arriving train at the far platform */
  function swap(){
    CS.swapped = true; rideFree();
    if (CS.pass){ CS.pass.root.visible = false; }
    if (CS.out){
      const d = CS.dest;
      if (!d.built){ d.station = d.build(KIT) || d.station; d.built = true; }
      XT.inside = d; CS.B = d.station; farClip(true);
      g(() => d.onArrive && d.onArrive());
    } else {
      const d = XT.inside; XT.inside = null;
      if (d){ g(() => d.onLeave && d.onLeave()); if (d.release) g(() => d.release()); d.built = false; d.station = null; }
      CS.B = HOME; farClip(false);
    }
    const B = CS.B, T = stationTrain(B, 'arr');
    placeTrain(T.tr, T.path, T.stop); const side = sideTo(T.tr, B.back[0][0], B.back[0][2]);
    for (const s of [1, -1]) setDoor(T.tr, s, s === side ? 1 : 0);
    CS.doorSide = side; CS.path = B.back; CS.seg = 0;
    const [dx, dz] = doorWorld(T.tr, side, -.6);
    puppet(dx, B.back[0][1], dz, Math.atan2(B.back[0][0] - dx, B.back[0][2] - dz), false, 0);
    NW.root.visible = true; nw.state = 'idle';
    shot(B.cams.arrive || B.cams.door, 0, true);
  }
  function finish(){
    const B = CS.B || HOME, here = XT.inside;
    CS.on = false; CS.ph = ''; hud(false); fadeTo(0);
    if (CS.tr) CS.tr.root.visible = false; if (CS.pass) CS.pass.root.visible = false; rideFree();
    const [x, y, z, h] = B.out; puppet(x, y, z, h, false, 0); nw.y = groundAt(x, z) > y - .5 ? groundAt(x, z) : y; nw.spd = 0; NW.root.visible = true;
    camYaw = h + Math.PI; gx.paused = false;
    if (here){
      window.XINDOOR = 'erl'; window.XINDOOR_AT = {x:DOOR.x, z:DOOR.z, h:Math.PI, name:'Salak Tinggi 站'};
      camDist = here.camDist || 14; camPitch = here.camPitch || .85;
      gxCallout(here.name, here.hello || '欢迎', '#b48cf0');
      prog.life.erlRides = (prog.life.erlRides || 0) + 1; unlock('erl1'); saveGame();
    } else {
      window.XINDOOR = null; window.XINDOOR_AT = null;
      if (XT.keep){ camDist = XT.keep.dist; camPitch = XT.keep.pitch; } XT.keep = null;
      toast('回到 Salak Tinggi 站', '出站往北上公路，一路开回学校', 2400);
    }
  }
  function trFrame(dt){
    if (!CS.on) return;
    if (mode !== 'naiwa' || g(() => titleOpen, false)){ abort(); return; }
    gx.paused = true;
    CS.t += dt; const A = CS.A, t = CS.t;
    switch (CS.ph){
      case 'gate': {
        if (t > .8){ charge(); A.gateFx(Math.min(1, (t - .8) / .35)); }
        if (t > .9) walk(A.go, dt, 2.2); else puppet(nw.x, nw.y, nw.z, null, false, dt);
        shot(A.cams.gate, dt);
        if (CS.seg >= 2){ CS.ph = 'walk'; CS.t = 0; bar(barEl.querySelector('span').textContent, '上天桥去站台'); }
        break; }
      case 'walk': {
        A.gateFx(Math.max(0, 1 - t / .5));
        const done = walk(A.go, dt, 4.2); follow(dt, t < dt * 1.5);
        if (done){ CS.ph = 'wait'; CS.t = 0; }
        break; }
      case 'wait': {
        nw.h += Math.atan2(Math.sin(A.waitH - nw.h), Math.cos(A.waitH - nw.h)) * Math.min(1, dt * 6);
        puppet(nw.x, nw.y, nw.z, null, false, dt); shot(A.cams.wait, dt);
        const left = Math.max(0, PH.wait + PH.arrive * .6 - t); bar(barEl.querySelector('span').textContent, `下一班 ${LIVERY.transit.name} · 0:${String(Math.ceil(left)).padStart(2, '0')}`);
        if (A.pass && CS.passS == null && !CS.passDone && t > .2){ CS.pass = makeTrainOnce('ekspres'); CS.passS = A.pass.sAt(nw.x, nw.z) - 46 * 3.4; CS.passEnd = A.pass.sAt(nw.x, nw.z) + 420; }
        if (CS.pass && CS.passS != null){ CS.passS += 46 * dt; placeTrain(CS.pass, A.pass, Math.min(A.pass.L, CS.passS));
          const p = A.pass.at(Math.min(A.pass.L, CS.passS)); if (!CS.honk && Math.hypot(p.x - nw.x, p.z - nw.z) < 160){ CS.honk = true; tone('square', 494, 490, .45, .06); tone('square', 392, 388, .6, .06, .5); noise(1.4, .12, 420); }
          if (CS.passS > CS.passEnd){ CS.pass.root.visible = false; CS.passS = null; CS.passDone = true; } }
        if (t >= PH.wait){ CS.ph = 'arrive'; CS.t = 0; const T = stationTrain(A, 'dep'); CS.T = T; placeTrain(T.tr, T.path, T.stop - 75); for (const s of [1, -1]) setDoor(T.tr, s, 0); }
        break; }
      case 'arrive': {
        const T = CS.T, k = Math.min(1, t / PH.arrive), s = T.stop - 75 * (1 - k) * (1 - k);
        placeTrain(T.tr, T.path, s); shot(A.cams.wait, dt);
        if (CS.pass && CS.passS != null){ CS.passS += 46 * dt; placeTrain(CS.pass, A.pass, Math.min(A.pass.L, CS.passS)); if (CS.passS > CS.passEnd){ CS.pass.root.visible = false; CS.passS = null; CS.passDone = true; } }
        bar(barEl.querySelector('span').textContent, k < 1 ? '列车进站' : '');
        if (k >= 1){ CS.ph = 'door'; CS.t = 0; CS.doorSide = sideTo(T.tr, nw.x, nw.z); doorEl.hidden = false; bar(barEl.querySelector('span').textContent, '车门要按按钮才开'); }
        break; }
      case 'door': {
        shot(A.cams.door, dt); const d = CS.T.tr.doors[CS.doorSide]; if (d) d.btn.material.color.set((t * 2) % 1 < .5 ? '#39e07a' : '#0f4f2a');
        if (t > 12) pressDoor();
        break; }
      case 'open': { setDoor(CS.T.tr, CS.doorSide, Math.min(1, t / PH.open)); shot(A.cams.door, dt); if (t >= PH.open){ CS.ph = 'board'; CS.t = 0; const [dx, dz] = doorWorld(CS.T.tr, CS.doorSide, -.8); CS.path = [[nw.x, nw.y, nw.z], [dx, nw.y, dz]]; CS.seg = 0; } break; }
      case 'board': {
        walk(CS.path, dt, 2.4); shot(A.cams.door, dt);
        if (t >= PH.board){ CS.ph = 'close'; CS.t = 0; NW.root.visible = false; chime(); bar(barEl.querySelector('span').textContent, '车门即将关闭，请勿靠近车门'); toast('车门即将关闭', 'Pintu akan ditutup · Doors closing', 1800); }
        break; }
      case 'close': { setDoor(CS.T.tr, CS.doorSide, t < .9 ? 1 : Math.max(0, 1 - (t - .9) / .7)); shot(A.cams.door, dt); if (t >= PH.close){ CS.ph = 'depart'; CS.t = 0; CS.v = 0; bar(barEl.querySelector('span').textContent, '开车'); } break; }
      case 'depart': {
        CS.v = Math.min(18, (CS.v || 0) + 2.2 * dt); placeTrain(CS.T.tr, CS.T.path, CS.T.tr.s + CS.v * dt); shot(A.cams.wait, dt);
        if (t >= PH.depart){ CS.ph = 'ride'; CS.t = 0; CS.T.tr.root.visible = false; startRide(); }
        break; }
      case 'ride': {
        rideStep(dt, 26 + 6 * Math.min(1, t)); const X = RIDE.x, Z = RIDE.z;
        puppet(X - 1.2, .16, Z - 1.02, 0, false, dt); nw.state = 'sit';
        shot([[X + 3.4, 1.75, Z + .95], [X - 2.2, 1.15, Z - 1.1]], dt);
        bar(barEl.querySelector('span').textContent, `${CS.out ? CS.dest.name : 'Salak Tinggi'} · ${Math.max(1, Math.ceil((CS.out ? CS.dest.mins : CS.dest.mins) * (1 - t / PH.ride)))} 分钟`);
        if (t >= PH.ride){ CS.ph = 'black'; CS.t = 0; }
        break; }
      case 'black': {
        if (RIDE.g) rideStep(dt, 30);
        const name = CS.out ? CS.dest.name : 'Salak Tinggi 沙叻丁宜';
        fadeTo(Math.min(1, t / .35), CS.skip ? name : '到站了', CS.skip ? '' : name);
        if (t >= .4 && !CS.swapped){ nw.state = 'idle'; swap(); }
        if (t >= PH.black && CS.swapped){ if (CS.skip){ finish(); return; } CS.ph = 'out'; CS.t = 0; fadeTo(0); bar(CS.out ? `${CS.dest.name} 到了` : '回到 Salak Tinggi', '下车出站'); }
        break; }
      case 'out': {
        const B = CS.B, done = t > .5 && walk(B.back, dt, 4); if (t < 1.5) shot(B.cams.arrive || B.cams.door, dt); else follow(dt);
        if (t <= .5) puppet(nw.x, nw.y, nw.z, null, false, dt);
        if (t > 1.2 && CS.tr){ setDoor(CS.tr, CS.doorSide, Math.max(0, 1 - (t - 1.2) / .7)); }
        if (B.gateFx){ const gi = B.back.length - 4; B.gateFx(CS.seg >= gi - 1 && CS.seg <= gi + 1 ? 1 : 0); }
        if (done) finish();
        break; }
    }
    /* camera */
    camera.position.copy(CS.camP); camera.lookAt(CS.camT);
    fitShadow(Math.round(CS.camT.x / 20) * 20, Math.round(CS.camT.z / 20) * 20, 120);
  }
  const passTr = {};
  function makeTrainOnce(lv){ const tr = passTr[lv] || (passTr[lv] = makeTrain(lv)); tr.root.visible = true; return tr; }
  function startRide(){
    rideBuild(CS.out ? CS.dest.station0 || CS.dest.name : 'Salak Tinggi'); farClip(true);
    /* returning: let the far scene go already, the ride hides the switch */
    NW.root.visible = true; tone('sine', 120, 90, 2.2, .05); noise(2.4, .05, 300);
  }
  function abort(){
    if (!CS.on) return;
    CS.on = false; CS.ph = ''; hud(false); fadeTo(0); rideFree(); if (CS.tr) CS.tr.root.visible = false; if (CS.pass) CS.pass.root.visible = false;
    NW.root.visible = true; gx.paused = false;
    if (XT.inside){ const d = XT.inside; XT.inside = null; g(() => d.onLeave && d.onLeave()); g(() => d.release && d.release()); d.built = false; d.station = null; }
    window.XINDOOR = null; window.XINDOOR_AT = null; farClip(false);
    const [x, y, z, h] = HOME.out; nw.x = x; nw.z = z; nw.y = groundAt(x, z); nw.h = h; nw.state = 'idle';
    if (XT.keep){ camDist = XT.keep.dist; camPitch = XT.keep.pitch; } XT.keep = null;
  }
  /* leaving a destination without the train (mode switch, title menu): straight back to the station door */
  function bailHome(){
    if (CS.on){ abort(); return; }
    if (!XT.inside) return;
    const d = XT.inside; XT.inside = null; g(() => d.onLeave && d.onLeave()); g(() => d.release && d.release()); d.built = false; d.station = null;
    window.XINDOOR = null; window.XINDOOR_AT = null; farClip(false);
    const [x, , z, h] = HOME.out; nw.x = x; nw.z = z; nw.y = groundAt(x, z); nw.h = h; nw.state = 'idle';
    if (XT.keep){ camDist = XT.keep.dist; camPitch = XT.keep.pitch; } XT.keep = null;
  }

  /* ---------- keys: F / Enter / Space open the doors, Esc skips; the panel takes 1–9 and Esc ---------- */
  window.addEventListener('keydown', e => {
    if (panel.on){
      if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); panelClose(); return; }
      const n = /^Digit([1-9])$/.exec(e.code); if (n){ e.preventDefault(); e.stopImmediatePropagation(); panelPick(+n[1] - 1); return; }
      if (e.code === 'KeyF' || e.code === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); const i = panel.list.findIndex(d => !d.soon && money >= d.fare); if (i >= 0) panelPick(i); }
      return;
    }
    if (!CS.on || document.querySelector('dialog[open]')) return;
    if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); skip(); return; }
    if ((e.code === 'KeyF' || e.code === 'Enter' || e.code === 'Space') && !e.repeat){ e.preventDefault(); e.stopImmediatePropagation(); pressDoor(); }
  }, true);

  /* ---------- near the station on the main map; away at a destination ---------- */
  let promptMsg = '';
  const nearHome = () => !XT.inside && !CS.on && Math.hypot(nw.x - DOOR.x, nw.z - DOOR.z) < 4.2 && Math.abs(nw.y - SY) < 3;
  function trUpdate(dt, px, pz){
    promptMsg = '';
    const d = XT.inside;
    if (d){
      g(() => d.update && d.update(dt));
      const S = d.station, o = S && S.ring;
      if (o){ const near = !driving && Math.hypot(nw.x - o[0], nw.z - o[1]) < 3.6; d.ringNear = near; if (near) promptMsg = TOUCH ? '点「上车」坐 ERL 回 Salak Tinggi' : '按 F 坐 ERL 回 Salak Tinggi'; }
      if (!promptMsg) promptMsg = g(() => d.prompt && d.prompt(), '') || '';
      return;
    }
    const dd = Math.hypot(px - DOOR.x, pz - DOOR.z), show = dd < 160;
    homeMark.visible = show; homeLbl.dead = !show || dd > 60;
    if (show) homeMark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
    if (driving && dd < 14) promptMsg = '下车走进站厅门口的紫圈，坐 ERL 去 KLIA';
    else if (nearHome()) promptMsg = TOUCH ? '点「上车」进站坐 ERL 小火车' : '按 F 进站坐 ERL 小火车';
    ambUpdate(dt, px, pz);
  }
  function trTryF(){
    if (CS.on || panel.on || driving || nw.state === 'fly') return false;
    const d = XT.inside;
    if (d){
      if (d.ringNear){ panelOpen(); return true; }
      return !!g(() => d.tryF && d.tryF(), false);
    }
    if (nearHome()){ const why = busyWhy(); if (why){ toast('现在不能进站', why, 1800); return true; } panelOpen(); return true; }
    return false;
  }
  if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ return trTryF() || base(); }; }
  /* minimap: the tracks, platforms and the road on the main map; the destination's own plan while away */
  if (typeof drawOutMini === 'function'){ const base = drawOutMini; drawOutMini = function(mg, X, Z, k){ base(mg, X, Z, k);
    const line = (pts, col, w) => { mg.strokeStyle = col; mg.lineWidth = w; mg.beginPath(); pts.forEach(([x, z], i) => i ? mg.lineTo(X(x), Z(z)) : mg.moveTo(X(x), Z(z))); mg.stroke(); };
    const rect = (x0, z0, x1, z1, col) => { mg.fillStyle = col; mg.beginPath(); [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].forEach(([x, z], i) => { const [a, c] = T(x, z); i ? mg.lineTo(X(a), Z(c)) : mg.moveTo(X(a), Z(c)); }); mg.fill(); };
    const XE = SX + END.e, XW = SX - END.w;
    line(ROADW, '#cfcac0', Math.max(1.5, 8 * k));
    rect(XW, SZ - 16, XE, SZ + 16, '#8a8378');
    for (const o of TZ) line([T(XW, SZ + o), T(XE, SZ + o)], '#4b4640', Math.max(1, 1.2 * k));
    for (const [z0, z1] of PLAT) rect(PX0, z0, PX1, z1, '#d8d2c6');
    rect(640, 1010, 776, 1020, '#bdb3a2'); }; }
  { const base = drawMini; drawMini = function(cx, cz, yaw, o){ const d = XT.inside; if (d && d.mini && mode === 'naiwa' && !(o && o.g)){ g(() => d.mini(mg, mini.width)); return; } base(cx, cz, yaw, o); }; }
  /* game hooks */
  { const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); trUpdate(dt, px, pz); },
      busy(){ return base.busy() || CS.on || !!XT.inside; },
      extBusy(){ return base.extBusy() || CS.on || !!XT.inside; },
      prompt(){ return promptMsg || base.prompt(); },
      target(){ const d = XT.inside; if (!d) return base.target(); const t = g(() => d.target && d.target(), null); if (t) return t; const o = d.station && d.station.ring; return o ? {x:o[0], z:o[1], label:'ERL 回程'} : null; },
      mini(dot){ base.mini(dot); if (!XT.inside) dot(DOOR.x, DOOR.z, '#a774ff', 6); },
      frame(dt, T){ if (base.frame) base.frame(dt, T); trFrame(dt); stMat.emissiveIntensity = g(() => Math.max(cur.win, wx.rain * .6), 0); },
      leave(){ panelClose(); bailHome(); homeMark.visible = false; homeLbl.dead = true; base.leave(); }
    }); }
  achAdd([['erl1', '搭上小火车', '第一次坐 ERL 去别的地方', 20]]);
  try { const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (d && d.life && d.life.erlRides) prog.life.erlRides = +d.life.erlRides || 0; if (d && d.ach && d.ach.erl1) prog.ach.erl1 = +d.ach.erl1 || 1; } catch(e){}

  const KIT = {KB, kTri, kQuad, kPoly, kBox, kRoom, kSign, kFlat, kUp, kGeo, kMesh, kAtlas, kBoard, kDispose, kMat, kGlass, kPath, FONT, PURP, PURP2, TEAL, makeTrain, frontFor, LIVERY};
  window.XTrain = {
    register, kit:KIT, HOME, station:{x:PLACE.x, z:PLACE.z, y:SY, rot:PLACE.rot, door:DOOR, tunnels:END},
    get inside(){ return XT.inside ? XT.inside.id : null; }, get on(){ return CS.on; }, get phase(){ return CS.ph; }, get dests(){ return XT.dests.map(d => d.id); },
    /* tests and the console */
    go(id){ const d = destOf(id || 'klia'); if (!d || d.soon) return false; if (XT.inside) return false; if (mode !== 'naiwa') setMode('naiwa'); if (driving) leaveCar(); nw.x = DOOR.x; nw.z = DOOR.z - 1; nw.y = SY; start(d, true); return true; },
    back(){ if (!XT.inside || CS.on) return false; start(XT.inside, false); return true; },
    skip, press:pressDoor, home:bailHome, open:panelOpen, cs:CS, amb:AMB, ride:RIDE
  };
})();
