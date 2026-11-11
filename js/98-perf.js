/* XMUM 校园漫游 · 渲染减负：在场景搭好以后统一处理，不改各区域的模型代码。
   只管"画不画"，不碰玩法：碰撞、任务光圈、可交互物体都不受影响（碰撞是另外的数据，不是网格）。
   做法：
   1. 实例化网格（树、棕榈、路灯、长椅、行人、展台花草……）：原来的网格留着给游戏代码写（setMatrixAt / visible / castShadow 照旧），
      但不再直接画；每帧挑出"在镜头里、而且在屏幕上不止一两个像素大"的实例，拷进一个紧凑的代理网格去画。
      ChunkIM（js/00-core.js）的树和路灯按每棵的距离换远景模型；阴影另用一个代理，只放阴影框里的实例。
   2. 覆盖几百米的合并大网格（地面、道路）：切成几块子网格（共用顶点缓冲，只是各有一份索引），视锥剔除就能生效。
   3. 一直不动的小网格：按 材质 × 240 米区域 × 大小档 合成一个网格画（成员动了、藏了就拆开，黑洞模式也安全）。
   4. 其余网格：在屏幕上小到看不见就不画（流畅 / 标准档另有最远距离）；地面上的扁平细节、远处的小件不投影。
   5. 阴影：阴影框按档位收紧，只放阴影框里的实例；脚下慢走的时候「标准」档阴影隔一帧重画一次。
   6. 自动降档更早、更果断（替换 js/90-main.js 的 adaptQuality）。
   它包了几个全局函数：fitShadow（js/00-core.js）、gfxShadowTick（js/18-gfx.js）、adaptQuality（js/90-main.js），
   读 ChunkIM 的字段（m / count / far / dist / cast / castFar / _vis / all / chunks），并把 90-main 的点击射线 ray 设成能打到停放图层。
   隐藏一律用 layers（不改 visible / castShadow，那两个是游戏代码在用的）：
     图层 0 照常；图层 1 只在阴影里画；图层 2 只在画面里画（不投影）；图层 30 停放（不画，但点击拾取还能打到）。
   调试（只在本地、离线测试页和预览版有）：XPerf.stats() / XPerf.off() / XPerf.on() / XPerf.census() */
'use strict';
(() => {
  const L_SH = 1, L_COL = 2, L_PARK = 30;
  const M0 = 1, M_SH = 1 << L_SH, M_COL = 1 << L_COL, M_PARK = 1 << L_PARK;
  /* px: 物体在屏幕上的半径小于这么多个像素就不画；near: ChunkIM 精细模型距离再乘这个；shHalf: 阴影框半边长乘这个；
     shSmall / shNear: 半径小于 shSmall 米、离玩家超过 shNear 米的东西不投影；shEvery: 慢走时阴影几帧重画一次；
     far: [半径 1.5 米以下, 6 米以下] 的东西最远画到多少米（高清不限，只看像素） */
  const TIER = {
    low:  {px:2.6, near:.75, shHalf:1,   shSmall:2,   shNear:40, shEvery:1, far:[110, 280]},
    mid:  {px:1.6, near:.85, shHalf:.75, shSmall:1.5, shNear:55, shEvery:2, far:[180, 450]},
    high: {px:1,   near:1,   shHalf:.8,  shSmall:1,   shNear:80, shEvery:1, far:[Infinity, Infinity]}
  };
  const T = () => TIER[XQ.level] || TIER.mid;
  const st = {brk:{}, on:true, frame:0, pxK:600, cx:0, cy:0, cz:0, sx:0, sz:0, shNow:false, shSkip:0, cpu:0};
  const fr = new THREE.Frustum(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
  const gpl = new Float32Array(24), spl = new Float32Array(24);
  const planes = (f, out) => { f.planes.forEach((p, i) => { out[i * 4] = p.normal.x; out[i * 4 + 1] = p.normal.y; out[i * 4 + 2] = p.normal.z; out[i * 4 + 3] = p.constant; }); };
  const inFr = (P, x, y, z, r) => {
    for (let i = 0; i < 24; i += 4) if (P[i] * x + P[i + 1] * y + P[i + 2] * z + P[i + 3] < -r) return false;
    return true;
  };
  const tris = g => (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
  const geoSphere = g => {
    if (g._xpS) return g._xpS;
    /* ChunkIM 的子网格共用顶点但包围球是整格的，所以自己按顶点算 */
    const p = g.attributes.position, s = new THREE.Sphere();
    if (!p){ return g._xpS = s; }
    const b = new THREE.Box3().setFromBufferAttribute(p); b.getCenter(s.center);
    let r2 = 0; for (let i = 0; i < p.count; i++){ _v.fromBufferAttribute(p, i); r2 = Math.max(r2, s.center.distanceToSquared(_v)); }
    s.radius = Math.sqrt(r2); g._xpS = s; g._xpH = b.max.y - b.min.y; return s;
  };

  /* ---------- 实例代理：每帧把要画的实例拷进一个紧凑网格 ---------- */
  class Prox {
    /* 一个紧凑的 InstancedMesh：begin() / push(源里的第 i 个) / end(源矩阵, 源颜色) ，挑出来的没变就不重新上传 */
    constructor(geo, mat, cap, parent, shadow){
      const im = this.im = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
      im.count = 0; im.frustumCulled = false; im.matrixAutoUpdate = false; im.userData.xp = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (shadow){ im.layers.mask = M_SH; im.castShadow = true; im.receiveShadow = false; }
      else { im.castShadow = false; im.receiveShadow = true; }
      parent.add(im); im.updateMatrixWorld(true);
      this.idx = new Int32Array(Math.max(1, cap)); this.n = 0; this.cap = cap;
    }
    begin(){ this.k = 0; this.changed = false; }
    push(i){ if (this.idx[this.k] !== i){ this.idx[this.k] = i; this.changed = true; } this.k++; }
    end(M, C, force){
      const im = this.im, k = this.k;
      if (!this.changed && k === this.n && !force) return;
      const a = im.instanceMatrix.array, idx = this.idx;
      for (let j = 0; j < k; j++){ const o = idx[j] * 16, d = j * 16; for (let e = 0; e < 16; e++) a[d + e] = M[o + e]; }
      im.instanceMatrix.updateRange.offset = 0; im.instanceMatrix.updateRange.count = k * 16; im.instanceMatrix.needsUpdate = true;
      if (C){
        if (!im.instanceColor){ im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); im.material.needsUpdate = true; }
        const c = im.instanceColor.array; for (let j = 0; j < k; j++){ const o = idx[j] * 3, d = j * 3; c[d] = C[o]; c[d + 1] = C[o + 1]; c[d + 2] = C[o + 2]; }
        im.instanceColor.updateRange.offset = 0; im.instanceColor.updateRange.count = k * 3; im.instanceColor.needsUpdate = true;
      }
      im.count = k; this.n = k;
    }
    hide(){ this.im.count = 0; this.n = 0; this.k = 0; }
  }
  /* 每个实例的包围球（世界坐标），矩阵变了才重算 */
  function spheres(e, M, n, rad, cen, W){
    if (!e.S || e.S.length < n * 4) e.S = new Float32Array(Math.max(4, n * 4));
    const S = e.S;
    for (let i = 0; i < n; i++){
      const o = i * 16, a = M[o], b = M[o + 1], c = M[o + 2], d = M[o + 4], f = M[o + 5], g = M[o + 6], h = M[o + 8], k = M[o + 9], l = M[o + 10];
      const sc = Math.sqrt(Math.max(a * a + b * b + c * c, d * d + f * f + g * g, h * h + k * k + l * l));
      let x = M[o + 12] + a * cen.x + d * cen.y + h * cen.z, y = M[o + 13] + b * cen.x + f * cen.y + k * cen.z, z = M[o + 14] + c * cen.x + g * cen.y + l * cen.z, r = rad * sc;
      if (W){ const w = W; const X = w[0] * x + w[4] * y + w[8] * z + w[12], Y = w[1] * x + w[5] * y + w[9] * z + w[13], Z = w[2] * x + w[6] * y + w[10] * z + w[14]; x = X; y = Y; z = Z; r *= e.wsc; }
      S[i * 4] = x; S[i * 4 + 1] = y; S[i * 4 + 2] = z; S[i * 4 + 3] = sc < 1e-5 ? 0 : r;
    }
  }

  /* ChunkIM（js/00-core.js 的 instanced()）：近处精细模型、远处远景模型，按每个实例的距离换 */
  const chunkSets = [];
  function addChunk(s){
    if (s._xp) return; s._xp = true;
    const full = s.chunks.length ? s.chunks[0].im : s.all, geo = full.geometry, mat = full.material;
    const farGeo = s.far || null, farMat = s.all.material;
    const e = {s, geo, mat, farGeo, farMat, ver:-1, cver:-1, n:s.count, rad:geoSphere(geo).radius, cen:geoSphere(geo).center,
      frad:farGeo ? geoSphere(farGeo).radius : 0, fcen:farGeo ? geoSphere(farGeo).center : null, C:null, v:0, vc:0};
    e.near = new Prox(geo, mat, s.count, scene);
    e.far = new Prox(farGeo || geo, farMat, s.count, scene);
    e.shN = new Prox(geo, mat, s.count, scene, true);
    e.shF = new Prox(farGeo || geo, farMat, s.count, scene, true);
    /* 游戏改了某个实例（被撞倒、被黑洞吞掉、换颜色）时记一笔 */
    const sm = s.setMatrixAt, sc = s.setColorAt;
    s.setMatrixAt = function(i, m){ sm.call(this, i, m); e.v++; };
    s.setColorAt = function(i, c){ sc.call(this, i, c); e.vc++; };
    park(s.all); for (const ch of s.chunks) park(ch.im);
    chunkSets.push(e);
  }
  function runChunk(e, t, ov){
    const s = e.s, n = s.count;
    if (!s._vis){ e.near.hide(); e.far.hide(); e.shN.hide(); e.shF.hide(); return; }
    const M = s.m;
    let rebuilt = false;
    if (e.ver !== e.v){ e.ver = e.v; spheres(e, M, n, e.rad, e.cen, null); rebuilt = true; }
    let C = null;
    if (s.all.instanceColor){ C = s.all.instanceColor.array; if (e.cver !== e.vc){ e.cver = e.vc; rebuilt = true; } }
    const S = e.S, far = !!e.farGeo, D = far ? s.dist * XQ.cfg.lod * t.near : XQ.cfg.props, D2 = D * D, pxK = st.pxK / t.px;
    const cx = st.cx, cy = st.cy, cz = st.cz;
    const sh = st.shNow && s.cast, shFar = st.shNow && s.cast && ov && (far ? s.castFar : XQ.tier > 1);
    const sx = st.sx, sz = st.sz, shR2 = st.shR * st.shR;
    e.near.begin(); e.far.begin(); if (st.shNow){ e.shN.begin(); e.shF.begin(); }
    for (let i = 0; i < n; i++){
      const r = S[i * 4 + 3]; if (r === 0) continue;
      const x = S[i * 4], y = S[i * 4 + 1], z = S[i * 4 + 2];
      const dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
      const useNear = !ov && d2 < D2;
      if (useNear || far || ov){
        /* 在屏幕上还不到一两个像素就不画 */
        const rr = useNear ? r : far ? r * e.frad / e.rad : r;
        if (rr * pxK * rr * pxK > d2 && inFr(gpl, x, y, z, r)) (useNear ? e.near : e.far).push(i);
      }
      if (sh && (useNear || shFar)){
        const ex = x - sx, ez = z - sz;
        if (ex * ex + ez * ez < shR2 + r * r * 4 && inFr(spl, x, y, z, r)) (useNear ? e.shN : e.shF).push(i);
      }
    }
    e.near.end(M, C, rebuilt); e.far.end(M, C, rebuilt);
    if (st.shNow){ e.shN.end(M, C, rebuilt); e.shF.end(M, C, rebuilt); }
  }

  /* 普通的 InstancedMesh（frustumCulled = false 的那些）：代理挂在它下面，跟着它的位置和 visible */
  const imSets = [];
  function addIm(im){
    if (im.userData.xp || im._xp) return; im._xp = true;
    const cap = im.instanceMatrix.count, g = im.geometry, gs = geoSphere(g);
    const e = {im, cap, ver:-1, cver:-1, wver:null, rad:gs.radius, cen:gs.center, wsc:1};
    e.col = new Prox(g, im.material, cap, im);
    e.sh = new Prox(g, im.material, cap, im, true);
    park(im);
    imSets.push(e);
  }
  function runIm(e, t){
    const im = e.im, n = Math.min(im.count, e.cap);
    /* 代理是它的子物体：它（或它的上级）隐藏了，代理也不画，不用管 */
    const P = e.col.im, Q = e.sh.im;
    if (P.material !== im.material){ P.material = im.material; Q.material = im.material; }
    P.renderOrder = Q.renderOrder = im.renderOrder; P.receiveShadow = im.receiveShadow;
    const M = im.instanceMatrix.array, W = im.matrixWorld.elements;
    let ident = W[0] === 1 && W[5] === 1 && W[10] === 1 && W[12] === 0 && W[13] === 0 && W[14] === 0 && W[1] === 0 && W[2] === 0 && W[4] === 0 && W[6] === 0 && W[8] === 0 && W[9] === 0;
    let wchg = false;
    if (!ident){ if (!e.wver || e.wver.some((v, k) => v !== W[k])){ e.wver = W.slice(); e.wsc = im.matrixWorld.getMaxScaleOnAxis(); wchg = true; } }
    else if (e.wver){ e.wver = null; e.wsc = 1; wchg = true; }
    let rebuilt = false;
    if (e.ver !== im.instanceMatrix.version || e.n !== n || wchg){ e.ver = im.instanceMatrix.version; e.n = n; spheres(e, M, n, e.rad, e.cen, ident ? null : W); rebuilt = true; }
    let C = null;
    if (im.instanceColor){ C = im.instanceColor.array; if (e.cver !== im.instanceColor.version){ e.cver = im.instanceColor.version; rebuilt = true; } }
    const S = e.S, pxK = st.pxK / t.px, cx = st.cx, cy = st.cy, cz = st.cz;
    const sh = st.shNow && im.castShadow, sx = st.sx, sz = st.sz, shR2 = st.shR * st.shR;
    e.col.begin(); if (sh) e.sh.begin();
    for (let i = 0; i < n; i++){
      const r = S[i * 4 + 3]; if (r === 0) continue;
      const x = S[i * 4], y = S[i * 4 + 1], z = S[i * 4 + 2], dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (r * pxK * r * pxK > d2 && inFr(gpl, x, y, z, r)) e.col.push(i);
      if (sh){ const ex = x - sx, ez = z - sz; if (ex * ex + ez * ez < shR2 + r * r * 4 && inFr(spl, x, y, z, r)) e.sh.push(i); }
    }
    e.col.end(M, C, rebuilt);
    if (sh) e.sh.end(M, C, rebuilt); else if (st.shNow) e.sh.hide();
  }

  /* ---------- 停放：不画，但还在场景里，点击拾取（js/90-main.js 的 ray）照样能打到 ---------- */
  const parked = [];
  function park(o){ if (o._xpMask == null){ o._xpMask = o.layers.mask; parked.push(o); } o.layers.mask = M_PARK; }

  /* ---------- 合并的大网格：按格子拆开（共用原来的顶点缓冲，各格只有一份索引） ---------- */
  const splits = [];
  /* 按三角形重心对半切（沿较长的一边），直到一块不到 TMAX 个三角形或者小于 MINW 米：块数少、每块够大，绘制调用不会暴涨 */
  const TMAX = 2400, MINW = 150;
  function trySplit(o){
    const g = o.geometry, p = g.attributes.position;
    if (!p || g.morphAttributes.position || Array.isArray(o.material) || o.isSkinnedMesh) return false;   /* 单一材质时 groups 不影响怎么画 */
    const nt = tris(g); if (nt < 2500) return false;
    const gs = geoSphere(g), sc = o.matrixWorld.getMaxScaleOnAxis();
    if (gs.radius * sc < 110) return false;
    const W = o.matrixWorld, idx = g.index ? g.index.array : null;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const start = g.drawRange.start | 0, count = Math.min(g.index ? g.index.count : p.count, g.drawRange.count), n = Math.floor(count / 3);
    const cxs = new Float32Array(n), czs = new Float32Array(n), tri = new Uint32Array(n * 3);
    for (let t = 0; t < n; t++){
      const o3 = start + t * 3, i0 = idx ? idx[o3] : o3, i1 = idx ? idx[o3 + 1] : o3 + 1, i2 = idx ? idx[o3 + 2] : o3 + 2;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
      a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(W);
      cxs[t] = a.x; czs[t] = a.z; tri[t * 3] = i0; tri[t * 3 + 1] = i1; tri[t * 3 + 2] = i2;
    }
    const leaves = [];
    const cut = ids => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const t of ids){ x0 = Math.min(x0, cxs[t]); x1 = Math.max(x1, cxs[t]); z0 = Math.min(z0, czs[t]); z1 = Math.max(z1, czs[t]); }
      const wx = x1 - x0, wz = z1 - z0;
      if (ids.length <= TMAX || Math.max(wx, wz) < MINW){ leaves.push(ids); return; }
      const A = wx >= wz ? cxs : czs, mid = (wx >= wz ? x0 + x1 : z0 + z1) / 2, lo = [], hi = [];
      for (const t of ids) (A[t] < mid ? lo : hi).push(t);
      if (!lo.length || !hi.length){ leaves.push(ids); return; }
      cut(lo); cut(hi);
    };
    cut(Array.from({length:n}, (_, t) => t));
    const cells = new Map();
    leaves.forEach((ids, k) => { const L = new Array(ids.length * 3); ids.forEach((t, j) => { L[j * 3] = tri[t * 3]; L[j * 3 + 1] = tri[t * 3 + 1]; L[j * 3 + 2] = tri[t * 3 + 2]; }); cells.set(k, L); });
    if (cells.size < 2) return false;
    const kids = [];
    cells.forEach(L => {
      const cg = new THREE.BufferGeometry();
      for (const k in g.attributes) cg.setAttribute(k, g.attributes[k]);
      cg.setIndex(new THREE.BufferAttribute(p.count > 65535 ? new Uint32Array(L) : new Uint16Array(L), 1));
      const box = new THREE.Box3(); for (const i of L){ _v.fromBufferAttribute(p, i); box.expandByPoint(_v); }
      const s = new THREE.Sphere(); box.getCenter(s.center); let r2 = 0; for (const i of L){ _v.fromBufferAttribute(p, i); r2 = Math.max(r2, s.center.distanceToSquared(_v)); }
      s.radius = Math.sqrt(r2); cg.boundingSphere = s; cg.boundingBox = box; cg._xpS = s; cg._xpH = box.max.y - box.min.y;
      const m = new THREE.Mesh(cg, o.material); m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder;
      m.matrixAutoUpdate = false; m.userData.xpKid = true; o.add(m); m.updateMatrixWorld(true); kids.push(m);
    });
    splits.push({o, g, ver:p.version, kids});
    park(o);
    for (const m of kids) addMesh(m);
    return true;
  }
  function runSplits(){
    for (let i = splits.length - 1; i >= 0; i--){
      const s = splits[i], o = s.o;
      /* 游戏换了几何体或者改了顶点：拆的那份作废，还原 */
      if (o.geometry !== s.g || s.g.attributes.position.version !== s.ver){ for (const m of s.kids){ o.remove(m); m.geometry.dispose(); } unpark(o); splits.splice(i, 1); o._xpNoSplit = true; continue; }
      for (const m of s.kids){ if (m.material !== o.material) m.material = o.material; m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; }
    }
  }
  function unpark(o){ if (o._xpMask != null){ o.layers.mask = o._xpMask; o._xpMask = null; const k = parked.indexOf(o); if (k >= 0) parked.splice(k, 1); } }

  /* ---------- 其余的网格：太小看不见就停放，扁平的地面细节和远处小件不投影 ---------- */
  const meshes = [];
  function addMesh(o){
    if (o._xpM) return; o._xpM = true;
    const g = o.geometry, s = geoSphere(g);
    meshes.push({o, s, flat:(g._xpH || 0) < .3, hid:false, b:null, snap:null, g:null, stable:0, breaks:0});
  }
  function runMeshes(t){
    const pxK = st.pxK / t.px, cx = st.cx, cy = st.cy, cz = st.cz, sx = st.sx, sz = st.sz, shS = t.shSmall, shN2 = t.shNear * t.shNear;
    for (let i = meshes.length - 1; i >= 0; i--){
      const e = meshes[i], o = e.o, mk = o.layers.mask;
      if (e.b) continue;   /* 在合批里：由合批管 */
      if (mk !== M0 && mk !== M_COL && mk !== M_PARK){ continue; }   /* 别人改了图层：不管它 */
      if (!o.parent){ meshes.splice(i, 1); if (mk !== M0) o.layers.mask = M0; o._xpM = false; continue; }
      const w = o.matrixWorld.elements, c = e.s.center;
      const x = w[0] * c.x + w[4] * c.y + w[8] * c.z + w[12], y = w[1] * c.x + w[5] * c.y + w[9] * c.z + w[13], z = w[2] * c.x + w[6] * c.y + w[10] * c.z + w[14];
      const sc = Math.sqrt(Math.max(w[0] * w[0] + w[1] * w[1] + w[2] * w[2], w[4] * w[4] + w[5] * w[5] + w[6] * w[6], w[8] * w[8] + w[9] * w[9] + w[10] * w[10]));
      const r = e.s.radius * sc, dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
      /* 隐藏/显示留一点余量，免得在边界上闪 */
      let lim = r * pxK; if (r < 1.5) lim = Math.min(lim, t.far[0]); else if (r < 6) lim = Math.min(lim, t.far[1]);
      if (e.hid) lim *= 1.15;
      const hide = lim * lim < d2;
      e.hid = hide;
      let want = M0;
      if (hide) want = M_PARK;
      else if (o.castShadow){
        const ex = x - sx, ez = z - sz;
        if (e.flat || (r < shS && ex * ex + ez * ez > shN2)) want = M_COL;
      }
      if (want !== mk) o.layers.mask = want;
    }
  }


  /* ---------- 静态合批：一直不动的小网格，按 材质 × 区域 × 大小档 合成一个网格画 ----------
     成员原样留在场景里（停放：不画，点击照样能打到）。哪个成员动了、隐藏了、换了材质或几何体（比如黑洞把楼吞下去），
     它所在的那一批立刻拆掉，成员回到各画各的；之后又静止了才重新合。 */
  const BCELL = 240, BMAX_TRIS = 3000, SIZE_CLS = [1.5, 6, Infinity];
  const batches = new Map();
  const defOBC = THREE.Material.prototype.onBeforeCompile, defOBR = THREE.Object3D.prototype.onBeforeRender;
  const visChain = o => { for (let p = o; p; p = p.parent){ if (!p.visible) return false; if (p === scene) return true; } return false; };
  /* 黑洞模式里和刚结束的几秒（楼被摆回原处）都算 */
  const holeRecent = () => { if (typeof mode !== 'undefined' && mode === 'hole') st.lastHole = st.frame; return st.lastHole != null && st.frame - st.lastHole < 300; };
  const rootOf = o => { while (o.parent && o.parent !== scene) o = o.parent; return o; };
  const sameMW = e => { const w = e.o.matrixWorld.elements, q = e.snap; for (let k = 0; k < 16; k++) if (w[k] !== q[k]) return false; return true; };
  function batchable(e){
    const o = e.o, g = o.geometry, m = o.material;
    if (e.breaks > 2 || rootOf(o).userData.xpDyn || Array.isArray(m) || !m || m.transparent || m.onBeforeCompile !== defOBC || o.onBeforeRender !== defOBR) return false;
    if (g.morphAttributes.position || g.attributes.tangent || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
    if (!g.attributes.position || tris(g) > BMAX_TRIS) return false;
    for (const k in g.attributes) if (g.attributes[k].isInterleavedBufferAttribute) return false;
    return true;
  }
  const sigOf = g => Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize + (g.attributes[k].normalized ? 'n' : '') + g.attributes[k].array.constructor.name).join(',');
  function bKey(e){
    const o = e.o, w = o.matrixWorld.elements, c = e.s.center;
    const x = w[0] * c.x + w[4] * c.y + w[8] * c.z + w[12], z = w[2] * c.x + w[6] * c.y + w[10] * c.z + w[14];
    const r = e.s.radius * o.matrixWorld.getMaxScaleOnAxis(), cls = r < SIZE_CLS[0] ? 0 : r < SIZE_CLS[1] ? 1 : 2;
    const cast = o.castShadow && !e.flat;
    return o.material.uuid + '|' + sigOf(o.geometry) + '|' + (cast ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + cls + '|' + Math.floor(x / BCELL) + ',' + Math.floor(z / BCELL);
  }
  const _nm = new THREE.Matrix3(), _p3 = new THREE.Vector3();
  function buildBatch(key, list){
    const g0 = list[0].o.geometry, names = Object.keys(g0.attributes);
    let nv = 0, ni = 0;
    for (const e of list){ const g = e.o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const geo = new THREE.BufferGeometry(), out = {};
    for (const k of names){ const a = g0.attributes[k]; out[k] = new a.array.constructor(nv * a.itemSize); }
    const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const e of list){
      const o = e.o, g = o.geometry, mw = o.matrixWorld, n = g.attributes.position.count, flip = mw.determinant() < 0;
      _nm.getNormalMatrix(mw);
      for (const k of names){
        const a = g.attributes[k], dst = out[k], is = a.itemSize;
        if (k === 'position'){ for (let i = 0; i < n; i++){ _p3.fromBufferAttribute(a, i).applyMatrix4(mw); dst[(vo + i) * 3] = _p3.x; dst[(vo + i) * 3 + 1] = _p3.y; dst[(vo + i) * 3 + 2] = _p3.z; } }
        else if (k === 'normal'){ for (let i = 0; i < n; i++){ _p3.fromBufferAttribute(a, i).applyMatrix3(_nm).normalize(); dst[(vo + i) * 3] = _p3.x; dst[(vo + i) * 3 + 1] = _p3.y; dst[(vo + i) * 3 + 2] = _p3.z; } }
        else dst.set(a.array.subarray(0, n * is), vo * is);
      }
      if (g.index){ const ix = g.index.array, m = g.index.count; for (let t = 0; t < m; t += 3){ index[io + t] = ix[t] + vo; index[io + t + 1] = ix[flip ? t + 2 : t + 1] + vo; index[io + t + 2] = ix[flip ? t + 1 : t + 2] + vo; } io += m; }
      else { for (let t = 0; t < n; t += 3){ index[io + t] = vo + t; index[io + t + 1] = vo + (flip ? t + 2 : t + 1); index[io + t + 2] = vo + (flip ? t + 1 : t + 2); } io += n; }
      vo += n;
    }
    for (const k of names){ const a = g0.attributes[k]; geo.setAttribute(k, new THREE.BufferAttribute(out[k], a.itemSize, a.normalized)); }
    geo.setIndex(new THREE.BufferAttribute(index, 1)); geo.computeBoundingSphere();
    const o0 = list[0].o, mesh = new THREE.Mesh(geo, o0.material);
    const cast = o0.castShadow && !list[0].flat;
    mesh.castShadow = cast; mesh.receiveShadow = o0.receiveShadow; mesh.matrixAutoUpdate = false; mesh.userData.xpB = true; mesh.userData.xp = true;
    scene.add(mesh); mesh.updateMatrixWorld(true);
    const B = {key, mesh, list, cls:+key.split('|')[3], cast, r:geo.boundingSphere.radius, c:geo.boundingSphere.center};
    for (const e of list){ e.b = B; e.o.layers.mask = M_PARK; }
    /* 成员不再直接画了：释放它们在显卡上的那份顶点（只是显存，数组还在；拆批以后 three.js 会自己重新上传） */
    for (const e of list) e.o.geometry.dispose();
    batches.set(key, B);
    return B;
  }
  function breakBatch(B){
    scene.remove(B.mesh); B.mesh.geometry.dispose(); batches.delete(B.key);
    for (const e of B.list){ e.b = null; e.stable = 0; e.snap = null; if (e.o.layers.mask === M_PARK) e.o.layers.mask = M0; e.hid = false; }
  }
  /* 每帧：成员有变化就拆；整批按大小档的距离和阴影规则决定画不画、投不投影 */
  function runBatches(t){
    const pxK = st.pxK / t.px, cx = st.cx, cy = st.cy, cz = st.cz, sx = st.sx, sz = st.sz;
    const holeOn = holeRecent();
    for (const B of Array.from(batches.values())){
      let bad = false;
      for (const e of B.list){
        const o = e.o, why = o.layers.mask !== M_PARK ? 'layer' : !o.parent ? 'removed' : o.material !== B.mesh.material ? 'material' : o.geometry !== e.g ? 'geometry' : !visChain(o) ? 'hidden' : !sameMW(e) ? 'moved' : '';
        if (why){
          bad = true; st.brk[why] = (st.brk[why] || 0) + 1;
          /* 黑洞模式里楼会掉下去，回合结束又摆回来，不算；平时动过的（摆姿势的奶娃、转台上的车）整组以后都不合，藏起来过的那个网格也不合 */
          if (!holeOn){ if (why === 'moved') rootOf(o).userData.xpDyn = true; else e.breaks = 9; }
          break;
        }
      }
      if (bad){ breakBatch(B); continue; }
      const c = B.c, dx = c.x - cx, dy = c.y - cy, dz = c.z - cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) - B.r;
      let want = d > (B.cls < 2 ? Math.min(SIZE_CLS[B.cls] * pxK, t.far[B.cls]) : Infinity) ? M_PARK : M0;
      if (want === M0 && B.cast && B.cls === 0){ const ex = c.x - sx, ez = c.z - sz; if (Math.sqrt(ex * ex + ez * ez) - B.r > t.shNear) want = M_COL; }
      if (B.mesh.layers.mask !== want) B.mesh.layers.mask = want;
    }
  }
  /* 扫描时：连续两次扫描（隔两秒）都没动过的才合；黑洞模式里不合（楼在往下掉） */
  function collectBatches(){
    if (holeRecent()) return;
    const want = new Map();
    for (const e of meshes){
      if (e.b) continue;
      const o = e.o;
      if (!o.parent || !visChain(o) || !batchable(e)){ e.stable = 0; e.snap = null; continue; }
      if (e.snap && e.g === o.geometry && sameMW(e)) e.stable++;
      else { e.snap = new Float64Array(o.matrixWorld.elements); e.g = o.geometry; e.stable = 0; }
      if (e.stable < 1) continue;
      const k = bKey(e); let L = want.get(k); if (!L) want.set(k, L = []); L.push(e);
    }
    want.forEach((L, k) => {
      const old = batches.get(k);
      if (old){ const keep = old.list; breakBatch(old); for (const e of keep) if (e.o.parent && visChain(e.o)){ e.snap = new Float64Array(e.o.matrixWorld.elements); e.g = e.o.geometry; L.push(e); } }
      if (L.length < 2) return;
      buildBatch(k, L);
    });
  }

  /* ---------- 找新东西：开局一次，之后每两秒一次（展台的车、留言墙这些是后来才加的） ---------- */
  function excluded(){
    const ex = new Set();
    const add = o => { if (o && o.isObject3D) ex.add(o); };
    try { for (const c of cars) add(c.root); } catch(e){}
    try { add(NW.root); } catch(e){}
    try { add(destMark); } catch(e){}
    try { for (const c of CPS) add(c.g); } catch(e){}
    try { for (const p of PICKUPS) add(p.m); } catch(e){}
    try { for (const p of holePUs) add(p.g); } catch(e){}
    for (const k of ['gxDestMark', 'gxPaxMark', 'gxCp', 'gxCpNext', 'sky', 'skidMesh', 'rainLines']){ try { add((0, eval)(k)); } catch(e){} }
    return ex;
  }
  const chunkIms = new Set();
  function scan(){
    scene.updateMatrixWorld();
    for (const s of lodSets){ if (!s._xp){ addChunk(s); } }
    chunkIms.clear(); for (const s of lodSets){ chunkIms.add(s.all); for (const ch of s.chunks) chunkIms.add(ch.im); }
    const ex = excluded();
    const walk = (o, skip) => {
      if (ex.has(o)) skip = true;
      if (o.userData && (o.userData.xp || o.userData.ring)) return;
      if (o.isInstancedMesh){
        if (!chunkIms.has(o) && !o._xp && o.instanceMatrix.count >= 4 && !o.geometry.morphAttributes.position) addIm(o);
      } else if (o.isMesh && !skip && !o._xpM && !o.userData.xpKid && o.frustumCulled !== false && o.layers.mask === M0 && o.geometry && o.geometry.attributes.position){
        const mats = [].concat(o.material);
        /* 普通混合的半透明（玻璃、牌子）也按大小管；叠加发光的（任务光柱、光斑）不碰 */
        const plain = mats.every(m => m && (!m.transparent || m.blending === THREE.NormalBlending)) && o.renderOrder === 0;
        if (plain){ if (o._xpNoSplit || !trySplit(o)) addMesh(o); }
      }
      for (const c of o.children) walk(c, skip);
    };
    walk(scene, false);
    collectBatches();
  }

  /* ---------- 每次画场景之前（js/18-gfx.js 的 gfxRender、街机、赛车都走这里） ---------- */
  const sun0 = sun;
  function update(){
    const t0 = performance.now();
    if (++st.frame % 120 === 1){ const a = performance.now(); scan(); st.scanMs = +(performance.now() - a).toFixed(1); }
    const t = T();
    camera.updateMatrixWorld();
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(_m); planes(fr, gpl);
    const h = renderer.getContext().drawingBufferHeight || 600;
    st.pxK = h / 2 / Math.tan(camera.fov * Math.PI / 360);
    st.cx = camera.position.x; st.cy = camera.position.y; st.cz = camera.position.z;
    st.shNow = renderer.shadowMap.enabled && renderer.shadowMap.needsUpdate && sun0.castShadow;
    if (st.shNow){
      sun0.shadow.updateMatrices(sun0); planes(sun0.shadow.getFrustum(), spl);
      st.sx = sun0.target.position.x; st.sz = sun0.target.position.z;
      const c = sun0.shadow.camera; st.shR = Math.max(c.right - c.left, c.top - c.bottom) * .75;
    } else { st.sx = sun0.target.position.x; st.sz = sun0.target.position.z; }
    const ov = typeof lodOverview !== 'undefined' && lodOverview;
    runSplits();
    for (const e of chunkSets) runChunk(e, t, ov);
    for (let i = imSets.length - 1; i >= 0; i--){
      const e = imSets[i];
      if (!e.im.parent){   /* 被游戏移出场景了：还原成原样；要是以后又加回来，下次扫描重新接管 */
        e.im.remove(e.col.im, e.sh.im); unpark(e.im); e.im._xp = false; imSets.splice(i, 1); continue;
      }
      if (visChain(e.im)) runIm(e, t);
    }
    runBatches(t);
    runMeshes(t);
    st.cpu = st.cpu * .95 + (performance.now() - t0) * .05;
  }
  const prevBR = scene.onBeforeRender;
  scene.onBeforeRender = function(r, s, cam){ if (st.on && cam === camera) update(); if (prevBR) prevBR.apply(this, arguments); };
  camera.layers.enable(L_COL);
  try { ray.layers.enable(L_COL); ray.layers.enable(L_PARK); } catch(e){}
  /* 阴影这一遍：打开"只投影"图层，关掉"不投影"图层（r128 的阴影按主相机的图层筛） */
  const sm = renderer.shadowMap, smRender = sm.render;
  sm.render = function(lights, sc, cam){
    const m = cam.layers.mask; cam.layers.mask = st.on ? (m | M_SH) & ~M_COL : m | M_COL;
    try { smRender.apply(this, arguments); } finally { cam.layers.mask = m; }
  };

  /* ---------- 阴影框按档位收紧；「标准」档慢走时隔一帧画一次阴影 ---------- */
  const fitShadow0 = fitShadow;
  fitShadow = function(cx, cz, half){
    if (st.on && typeof mode !== 'undefined' && mode !== 'orbit') half = Math.round(half * T().shHalf);
    return fitShadow0(cx, cz, half);
  };
  const shadowTick0 = gfxShadowTick;
  let lastSnap = '';
  gfxShadowTick = function(){
    shadowTick0();
    if (!st.on || !renderer.shadowMap.needsUpdate || typeof mode === 'undefined' || mode === 'orbit') return;
    const t = T(), tp = sun0.target.position, snap = tp.x + ',' + tp.z + ',' + shadowHalf;
    let fast = false;
    try { fast = driving ? Math.hypot(driving.vx, driving.vz) > 4 : mode === 'hole'; } catch(e){}
    if (t.shEvery > 1 && !fast && snap === lastSnap && ++st.shSkip % t.shEvery) renderer.shadowMap.needsUpdate = false;
    lastSnap = snap;
  };

  /* ---------- 自动降档：更早（开局 4 秒后就看）、更果断（很卡就直接跳到流畅；电脑「标准」档先降分辨率） ---------- */
  QUAL.wait = 1;
  const adapt0 = adaptQuality;
  adaptQuality = function(dt){
    if (!st.on) return adapt0(dt);
    if (document.hidden || dt > .25) return;   /* 单独一帧很长多半是第一次编译着色器，不算 */
    QUAL.acc += dt; QUAL.frames++;
    if (QUAL.acc < 2) return;
    const fps = QUAL.frames / QUAL.acc; QUAL.acc = 0; QUAL.frames = 0;
    if (QUAL.wait > 0){ QUAL.wait--; return; }
    if (fps >= 45 || fps < 6) return;   /* 低于 6 帧多半是页面在后台被浏览器限速，不是显卡 */
    QUAL.wait = 1;
    if (XQ.level === 'low'){ if (XQ.scale > .8 && fps < 32) XQ.setScale(.75); return; }
    if (XQ.manual){ if (!QUAL.hinted){ QUAL.hinted = true; toast('画面有点卡？', '回菜单把画质改成「' + XQ.labels[XQ.level === 'high' ? 'mid' : 'low'] + '」会顺很多', 3600); } return; }
    /* 电脑「标准」档先把渲染分辨率降到 8 成（高分屏笔记本上很管用，画面还是标准档），还不够再降到流畅 */
    if (XQ.level === 'mid' && !XQ.touch && XQ.scale > .9 && fps >= 28){ XQ.setScale(.8); return; }
    const next = XQ.level === 'high' && fps >= 24 ? 'mid' : 'low';
    XQ.set(next, {auto:true});
    toast('已切换到更流畅的画质', '画质：' + XQ.label + ' · 菜单里可以改', 2000);
  };

  /* ---------- 开关（对比用） ---------- */
  function setOn(v){
    v = !!v; if (v === st.on) return; st.on = v;
    for (const o of parked) o.layers.mask = v ? M_PARK : o._xpMask;
    for (const e of chunkSets){ for (const p of [e.near, e.far, e.shN, e.shF]) p.im.visible = v; if (!v){ e.s.update(camera.position, lodOverview); } }
    for (const e of imSets){ e.col.im.visible = e.sh.im.visible = v; }
    for (const s of splits) for (const m of s.kids) m.visible = v;
    /* 合批：关的时候只把合好的网格藏起来、成员放回去；开的时候再停放成员（成员要是动过了，下一帧就会拆掉重来） */
    for (const B of batches.values()){ B.mesh.visible = v; for (const e of B.list) e.o.layers.mask = v ? M_PARK : M0; }
    if (!v) for (const e of meshes){ if (!e.b) e.o.layers.mask = M0; e.hid = false; }
    /* 关掉以后 ChunkIM 照原来的办法每帧自己切换（js/00-core.js 的 updateLod） */
    renderer.shadowMap.needsUpdate = true;
    try { if (typeof player !== 'undefined') fitShadow(sun0.target.position.x, sun0.target.position.z, mode === 'orbit' ? 640 : 150); } catch(e){}
  }
  scan();
  XQ.onChange(() => { renderer.shadowMap.needsUpdate = true; });

  const api = {
    get on(){ return st.on; },
    TIER,
    off(){ setOn(false); return 'XPerf 关'; },
    on(){ setOn(true); return 'XPerf 开'; },
    /* 连续画 n 帧（每帧读 1 个像素等 GPU 画完），返回平均毫秒、绘制调用、三角形（含阴影这一遍） */
    stats(n){
      n = n || 30;
      const gl = renderer.getContext(), px = new Uint8Array(4), info = renderer.info, ar = info.autoReset;
      info.autoReset = false; let ms = 0, calls = 0, tri = 0, shc = 0, sht = 0;
      const smr = sm.render; sm.render = function(){ const c0 = info.render.calls, t0 = info.render.triangles; smr.apply(this, arguments); shc += info.render.calls - c0; sht += info.render.triangles - t0; };
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < n; i++){
        info.reset(); renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled;
        const t = performance.now(); gfxRender(1 / 60, performance.now() / 1000); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms += performance.now() - t;
        calls += info.render.calls; tri += info.render.triangles;
      }
      sm.render = smr; info.autoReset = ar;
      return {ms:+(ms / n).toFixed(1), calls:Math.round(calls / n), tris:Math.round(tri / n), shadowCalls:Math.round(shc / n), shadowTris:Math.round(sht / n), cpuMs:+st.cpu.toFixed(2), scanMs:st.scanMs, level:XQ.level, on:st.on};
    },
    census(){
      let hid = 0, col = 0; for (const e of meshes){ if (e.o.layers.mask === M_PARK) hid++; else if (e.o.layers.mask === M_COL) col++; }
      return {breaks:st.brk, batches:batches.size, batched:meshes.filter(e => e.b).length, chunkSets:chunkSets.length, imSets:imSets.length, splits:splits.length, splitKids:splits.reduce((a, s) => a + s.kids.length, 0), meshes:meshes.length, hidden:hid, noShadow:col,
        drawn:chunkSets.reduce((a, e) => a + e.near.n + e.far.n, 0) + imSets.reduce((a, e) => a + e.col.n, 0)};
    }
  };
  const debug = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\/preview\//.test(location.pathname) || window.XMUM_FIREBASE === null;
  if (debug) window.XPerf = api;
})();
