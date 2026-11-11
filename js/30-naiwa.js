/* XMUM 校园漫游 · 奶娃模型和动画 */
'use strict';
/* ---------- 奶娃 (smooth low-poly homage) ----------
   Proportions follow the reference: a tall slim pear, about half as wide as it is tall, no neck,
   a narrow pointed head leaning forward, the belly bulging forward and down, long legs, big flat feet. */
const NAI_S = 1.3;
/* rounded capsule hanging down from the origin: top cap radius r0, bottom cap radius r1 centred at y = -len */
function nwCapsule(r0, r1, len, seg, n){
  const pts = []; n = n || 6;
  for (let i = 0; i <= n; i++){ const a = -Math.PI / 2 + i / n * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1)); }
  for (let i = 1; i <= n; i++){ const a = i / n * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
  return smoothNormals(new THREE.LatheGeometry(pts, seg || 16), 70);
}
const nwBlob = (r, sx, sy, sz, x, y, z, rx, ry, rz, ws, hs) => geoAt(new THREE.SphereGeometry(r, ws || 16, hs || 12), x, y, z, rx, ry, rz, sx, sy, sz);
const nwSmooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/* body radius by height (y in model units, 0 = sole, 1.825 = crown); the head is a round dome like the reference renders */
const NW_PROFILE = new THREE.SplineCurve([[0,.5],[.2,.515],[.34,.58],[.425,.69],[.455,.82],[.445,.96],[.405,1.1],[.345,1.25],[.285,1.39],[.228,1.52],[.19,1.63],[.158,1.71],[.112,1.78],[0,1.825]]
  .map(([r, y]) => new THREE.Vector2(r, y))).getPoints(56);
NW_PROFILE[0].x = 0; NW_PROFILE[NW_PROFILE.length - 1].x = 0;
/* body shapes (js/32-wardrobe.js adds more): w = girth, belly = how far the front bulges, s = overall size.
   nwW / nwBk hold the shape that makeNaiwa is building right now; every helper below reads them. */
const NW_SHAPES = {std:{w:1, belly:.2, s:1}};
let nwW = 1, nwBk = .2;
function nwR(y){
  const P = NW_PROFILE; if (y <= P[0].y) return 0;
  for (let i = 1; i < P.length; i++) if (P[i].y >= y){ const a = P[i - 1], b = P[i]; return (a.x + (b.x - a.x) * (y - a.y) / Math.max(1e-6, b.y - a.y)) * nwW; }
  return 0;
}
const nwBelly = y => 1 + nwBk * Math.exp(-Math.pow((y - .86) / .3, 2));   /* how far the front bulges */
const nwLean = y => .14 * nwSmooth((y - .95) / .87);                      /* head pushed forward */
const nwBeak = (y, c) => c > 0 ? .17 * Math.exp(-Math.pow((y - 1.63) / .07, 2)) * Math.pow(c, 10) : 0;  /* little pointed face */
/* deform a point that sits on (or off) the round lathe surface; th = angle round the body (0 = front) */
function nwShape(x, y, z, r){
  const c = r > 1e-6 ? z / r : 0;
  const zz = z > 0 ? z * nwBelly(y) * (1 + nwBeak(y, c)) : z * .93;
  return [x * .97, y, zz + nwLean(y)];
}
function nwOnBody(th, y, off){ const r = nwR(y) + (off || 0); return nwShape(Math.sin(th) * r, y, Math.cos(th) * r, r); }

/* run fn with a body shape active (the builders above read nwW / nwBk) */
function nwWith(shapeKey, fn){
  const sh = NW_SHAPES[shapeKey] || NW_SHAPES.std, pw = nwW, pb = nwBk; nwW = sh.w; nwBk = sh.belly;
  try { return fn(sh); } finally { nwW = pw; nwBk = pb; }
}
/* Builds one 奶娃 in a given body shape. Colours, clothes and props are put on afterwards by nwDress (js/32-wardrobe.js),
   through mats (recolourable materials), slots (attach points) and the arm / leg groups. */
function makeNaiwa(shapeKey){
  shapeKey = NW_SHAPES[shapeKey] ? shapeKey : 'std';
  return nwWith(shapeKey, sh => {
  const yellow = M('#f2c64a', {roughness:.62}), cream = M('#eee0ba', {roughness:.75}), olive = M('#55532c', {roughness:.8}), feet = M('#3b3920', {roughness:.95});
  const dark = M('#141210', {roughness:.25}), iris = M('#86c873', {roughness:.25}), rim = M('#c9d88a', {roughness:.35}), shine = new THREE.MeshBasicMaterial({color:'#ffffff'});
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(NAI_S); body.scale.setScalar(sh.s || 1);
  const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; };
  const skins = [];

  /* body */
  const tg = new THREE.LatheGeometry(NW_PROFILE, 56), tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++){
    const x = tp.getX(i) * nwW, y = tp.getY(i), z = tp.getZ(i) * nwW, r = Math.hypot(x, z), p = nwShape(x, y, z, r);
    tp.setXYZ(i, p[0], p[1], p[2]);
  }
  smoothNormals(tg, 80);
  skins.push(mesh(tg, yellow, body));

  /* pale egg-shaped belly patch: chest to lower belly, wide across the front, a little narrower at the top */
  const K = 10, NM = 44, bp = [], bi = [], buv = [.5, .5], yc = 1.0, A = 1.02;   /* uv: a disc over the patch, so a skin can print on the belly */
  bp.push(...nwOnBody(0, yc, .012));
  for (let k = 1; k <= K + 1; k++){
    const rho = Math.min(1, k / K), off = k > K ? -.03 : .007 + .01 * Math.pow(1 - rho * rho, .6);
    for (let m = 0; m < NM; m++){
      const ph = m / NM * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
      bp.push(...nwOnBody(rho * c * A * (1 - .2 * Math.max(0, s)), yc + rho * s * (s > 0 ? .31 : .3), off));
      buv.push(.5 + rho * c * .5, .5 + rho * s * .5);
    }
  }
  for (let m = 0; m < NM; m++) bi.push(0, 1 + m, 1 + (m + 1) % NM);
  for (let k = 0; k < K; k++) for (let m = 0; m < NM; m++){
    const a = 1 + k * NM + m, b = 1 + k * NM + (m + 1) % NM, c = a + NM, d = b + NM; bi.push(a, c, d, a, d, b);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); bg.setIndex(bi); bg.computeVertexNormals();
  const belly = mesh(bg, cream, body); belly.castShadow = false;

  /* bulging green eyes up on the front corners of the head, seen whole from the front (local +z points out of the head) */
  const eyes = [], eyeAt = [];
  const ballG = nwBlob(.064, 1, 1, .62, 0, 0, 0, 0, 0, 0, 20, 14), rimG = new THREE.TorusGeometry(.058, .009, 8, 28);
  const pupilG = nwBlob(.033, 1, 1, .5, 0, 0, 0, 0, 0, 0, 16, 10), dotG = new THREE.SphereGeometry(.011, 8, 6);
  for (const sx of [-1, 1]){
    const th = sx * .84, p = nwOnBody(th, 1.69, -.012), e = new THREE.Group();
    e.position.set(p[0], p[1], p[2]);
    e.rotation.y = Math.atan2(Math.sin(th), Math.cos(th) * 1.15); body.add(e);
    mesh(ballG, iris, e).castShadow = false;
    const rr = mesh(rimG, rim, e, 0, 0, .014); rr.castShadow = false;
    mesh(pupilG, dark, e, 0, .002, .03).castShadow = false;
    mesh(dotG, shine, e, -sx * .012, .016, .046).castShadow = false;
    eyes.push(e); eyeAt.push({p:e.position.clone(), ry:e.rotation.y});
  }

  /* short line mouth at the tip of the face; an ellipsoid so it can open into an "o" */
  const mp = nwOnBody(0, 1.6, -.006);
  const mouth = mesh(new THREE.SphereGeometry(.5, 18, 10), dark, body, mp[0], mp[1], mp[2]); mouth.scale.set(.11, .018, .04); mouth.rotation.x = -.3; mouth.castShadow = false;

  /* arms with dark olive hands (three fingers + thumb), long legs with big flat three-toed feet */
  const arms = [], elbows = [], legs = [], hands = [];
  const upperG = nwCapsule(.09, .078, .27, 18), foreG = nwCapsule(.078, .066, .22, 18);
  const handG = smoothNormals(geoMerge([nwBlob(.074, 1, .92, .72, 0, -.01, 0),
    ...[-1, 0, 1].map(k => geoAt(nwCapsule(.027, .024, .055, 8), k * .04, -.058, .006 - Math.abs(k) * .006, 0, 0, k * .28)),
    geoAt(nwCapsule(.026, .023, .04, 8), 0, -.005, .05, -1.2, 0, 0)]), 40);
  const legG = nwCapsule(.145, .112, .46, 18);
  const footG = smoothNormals(geoMerge([
    nwBlob(1, .12, .062, .19, 0, -.56, .07, 0, 0, 0, 18, 10),
    ...[-1, 0, 1].map(k => nwBlob(1, .052, .048, .085, k * .072, -.568, .245 - Math.abs(k) * .03, 0, k * .28, 0, 12, 8)),
    nwBlob(1, .085, .05, .07, 0, -.56, -.07, 0, 0, 0, 12, 8)]), 40);
  for (const sx of [1, -1]){
    const a = new THREE.Group(); a.position.set(sx * (.265 + (nwW - 1) * .3), 1.31, .03); body.add(a);
    skins.push(mesh(upperG, yellow, a));
    const el = new THREE.Group(); el.position.y = -.27; a.add(el);
    skins.push(mesh(foreG, yellow, el));
    const hd = mesh(handG, olive, el, 0, -.27, 0); hd.rotation.y = -sx * .6;
    const hs = new THREE.Group(); hs.position.set(0, -.3, .02); hs.rotation.y = -sx * .6; el.add(hs);
    a.rotation.set(-.32, 0, sx * .36); el.rotation.set(-1.22, 0, -sx * .32);   /* rest pose: hands on the belly */
    arms.push(a); elbows.push(el); hands.push(hs);
    const l = new THREE.Group(); l.position.set(sx * .17 * (1 + (nwW - 1) * .8), .62, .03); body.add(l);
    skins.push(mesh(legG, yellow, l));
    const ft = mesh(footG, feet, l); ft.rotation.y = sx * .12;
    legs.push(l);
  }
  /* attach points for hats and props; the head one sits on the crown, scaled to the head's girth */
  const head = new THREE.Group(), crown = nwOnBody(0, 1.82, 0); head.position.set(crown[0], 1.82, crown[2]); head.scale.set(nwW, 1, nwW); body.add(head);
  const slots = {head, handL:hands[0], handR:hands[1], eyes:eyeAt};
  return {root, body, belly, eyes, mouth, arms, elbows, legs, mats:{skin:yellow, belly:cream, hand:olive, foot:feet, iris}, skins, slots, shape:shapeKey, worn:[]};
  });
}
const NW = makeNaiwa(); scene.add(NW.root);
const nw = {x:110, z:204, y:0, vy:0, h:Math.PI, air:false, state:'idle', t:0, walkT:0, spd:0, spin:0, vx:0, vz:0};
NW.root.position.set(nw.x, 0, nw.z); NW.root.rotation.y = nw.h;

/* Arm angles are given for the left arm (+x side); the right arm mirrors z.
   s = shoulder {x: forward(-)/back(+), z: out(+)/in(-)}, e = elbow {x: bend forward(-), z: in(-)} */
const NW_REST = {sx:-.32, sz:.36, ex:-1.22, ez:-.32};
/* Sitting: the root stands on the seat (CAR_T.seat), and the body drops by this much (model units) so the bottom and the
   thighs rest on it instead of floating a leg's length above it. On a motorbike 奶娃 straddles the tank instead:
   leaning forward, legs down either side, hands on the bars. */
const NW_SIT_DROP = .47, NW_BIKE = {lean:.2, legX:-.5, legZ:.3, sx:-1.2, sz:.3, ex:-.45, ez:-.1};
/* the same seated pose for a figure that animNaiwa does not drive (online ghosts in js/net.js, riders in js/96-social.js).
   keepArms: an emote (js/96-social.js pose()) has just set the arms and the body this frame, so only sink it onto the seat */
function nwSitPose(N, bike, keepArms){
  if (keepArms) N.body.position.y -= NW_SIT_DROP;
  else { N.body.position.y = -NW_SIT_DROP; N.body.rotation.set(bike ? NW_BIKE.lean : 0, 0, 0); }
  N.legs.forEach((l, i) => l.rotation.set(bike ? NW_BIKE.legX : -1.4, 0, bike ? (i ? -NW_BIKE.legZ : NW_BIKE.legZ) : 0));
  if (!keepArms) N.arms.forEach(a => { a.rotation.x = bike ? NW_BIKE.sx : -.75; });
}
function animNaiwa(dt, T){
  const B = NW.body, [aL, aR] = NW.arms, [eL, eR] = NW.elbows || [], [lL, lR] = NW.legs;
  let lean = 0, roll = 0, lift = 0, bob = 0, mouthY = .018, bz = .42, wink = 1, lLx = 0, lRx = 0, lz = 0;
  const L = {sx:NW_REST.sx, sz:NW_REST.sz, ex:NW_REST.ex, ez:NW_REST.ez}, R = {sx:NW_REST.sx, sz:NW_REST.sz, ex:NW_REST.ex, ez:NW_REST.ez};
  const st = nw.state, t = nw.t;
  const mix = (a, b, k) => a + (b - a) * k;
  const rub = (k) => { L.ex = NW_REST.ex + Math.sin(T * 9) * .22 * k; R.ex = NW_REST.ex - Math.sin(T * 9) * .22 * k; L.sx = R.sx = NW_REST.sx - .05 * k; };
  if (st === 'sit'){
    const s = driving ? driving.steer : 0, bike = driving ? !!driving.T.bike : !!nw.bike;
    lift = -NW_SIT_DROP;
    if (bike){
      const k = NW_BIKE; lean = k.lean; lLx = lRx = k.legX; lz = k.legZ;
      L.sx = R.sx = k.sx; L.sz = k.sz - s * .2; R.sz = k.sz + s * .2; L.ex = R.ex = k.ex; L.ez = R.ez = k.ez;
    } else {
      lLx = lRx = -1.4;
      L.sx = R.sx = -.75; L.sz = .22 - s * .45; R.sz = .22 + s * .45; L.ex = R.ex = -.75; L.ez = R.ez = -.3; roll = -s * .12;
    }
  } else if (st === 'fly'){
    lean = nw.spin; L.sz = 2.3 + Math.sin(T * 25) * .4; R.sz = 2.3 - Math.sin(T * 25) * .4; L.sx = R.sx = 0; L.ex = R.ex = -.2; L.ez = R.ez = 0;
    lLx = Math.sin(T * 20) * .8; lRx = -lLx; mouthY = .12;
  } else if (st === 'flop'){
    const k = Math.min(1, t / .35), out = t > 2.1 ? Math.min(1, (t - 2.1) / .4) : 0, kk = k * (1 - out);
    lean = -1.5 * kk; lift = .55 * Math.sin(1.5 * kk);
    if (t > .35 && t < 2.1){ rub(1); mouthY = .07 + Math.abs(Math.sin(T * 11)) * .07; roll = Math.sin(T * 18) * .05; lLx = lRx = -.5 + Math.sin(T * 7) * .2; }
  } else if (st === 'laugh'){
    const k = Math.min(1, t / .3) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / .3) : 1);
    lean = -.28 * k; rub(k); mouthY = .018 + k * (.06 + Math.abs(Math.sin(T * 11)) * .07); roll = Math.sin(T * 17) * .05 * k;
  } else if (st === 'pose'){
    const k = Math.min(1, t / .3) * (t > 2.1 ? Math.max(0, 1 - (t - 2.1) / .3) : 1);
    R.sz = mix(NW_REST.sz, 2.45, k); R.sx = mix(NW_REST.sx, -.35, k); R.ex = mix(NW_REST.ex, -1.75, k); R.ez = mix(NW_REST.ez, -.2, k);
    L.sz = mix(NW_REST.sz, .62, k); L.sx = mix(NW_REST.sx, .25, k); L.ex = mix(NW_REST.ex, -1.1, k); L.ez = mix(NW_REST.ez, -1.0, k);
    roll = .14 * k; lean = -.06 * k; lLx = .25 * k; wink = 1 - .85 * k; mouthY = .018 + .02 * k; bob = Math.sin(T * 3) * .02 * k;
  } else if (nw.air){
    L.sz = R.sz = 1.3; L.sx = R.sx = -.2; L.ex = R.ex = -.35; L.ez = R.ez = 0; lLx = -.6; lRx = -.6; bz = .48;
  } else if (nw.spd > .3){
    const w = nw.walkT; roll = Math.sin(w) * .08; lLx = Math.sin(w) * .55; lRx = -lLx;
    L.sx = -.25 - Math.sin(w) * .35; R.sx = -.25 + Math.sin(w) * .35; L.sz = R.sz = .38; L.ex = R.ex = -1.1;
    bob = Math.abs(Math.sin(w)) * .05; bz = .42 + Math.sin(w * 2) * .025;
  } else {
    bz = .42 + Math.sin(T * 2) * .015; bob = Math.sin(T * 2) * .006; L.ex += Math.sin(T * 2) * .03; R.ex += Math.sin(T * 2) * .03;
  }
  const blink = (T % 3.7) < .12 ? .1 : 1;
  B.rotation.set(lean, 0, roll); B.position.y = lift + bob;
  NW.belly.scale.z = 1 + (bz - .42) * 1.1; NW.mouth.scale.y = Math.max(.018, mouthY * .9);
  NW.eyes[0].scale.y = blink * wink; NW.eyes[1].scale.y = blink;
  aL.rotation.set(L.sx, 0, L.sz); aR.rotation.set(R.sx, 0, -R.sz);
  if (eL){ eL.rotation.set(L.ex, 0, L.ez); eR.rotation.set(R.ex, 0, -R.ez); }
  lL.rotation.set(lLx, 0, lz); lR.rotation.set(lRx, 0, -lz);
}
