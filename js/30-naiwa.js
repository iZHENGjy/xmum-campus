/* XMUM 校园漫游 · 奶娃模型和动画 */
'use strict';
/* ---------- 奶娃 (smooth low-poly homage) ---------- */
const NAI_S = 1.3;
/* rounded capsule hanging down from the origin: top cap radius r0, bottom cap radius r1 centred at y = -len */
function nwCapsule(r0, r1, len, seg, n){
  const pts = []; n = n || 6;
  for (let i = 0; i <= n; i++){ const a = -Math.PI / 2 + i / n * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1)); }
  for (let i = 1; i <= n; i++){ const a = i / n * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
  return smoothNormals(new THREE.LatheGeometry(pts, seg || 16), 70);
}
const nwBlob = (r, sx, sy, sz, x, y, z, rx, ry, rz, ws, hs) => geoAt(new THREE.SphereGeometry(r, ws || 16, hs || 12), x, y, z, rx, ry, rz, sx, sy, sz);
function makeNaiwa(){
  const yellow = M('#f1c84b', {roughness:.5}), cream = M('#f8e7bd', {roughness:.65}), olive = M('#6d6a3a', {roughness:.75}), hand = M('#58552e', {roughness:.7});
  const dark = M('#151311', {roughness:.25}), iris = M('#7cc576', {roughness:.22}), shine = new THREE.MeshBasicMaterial({color:'#ffffff'});
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(NAI_S);
  const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  /* pear-shaped body: no neck, the head tapers out of the belly and leans a little forward */
  const prof = new THREE.SplineCurve([[0,.48],[.3,.5],[.53,.57],[.67,.68],[.725,.82],[.725,.96],[.68,1.1],[.61,1.25],[.53,1.4],[.44,1.54],[.33,1.66],[.19,1.765],[0,1.82]]
    .map(([r, y]) => new THREE.Vector2(r, y))).getPoints(44);
  prof[0].x = 0; prof[prof.length - 1].x = 0;
  const R = y => { if (y <= prof[0].y) return 0; for (let i = 1; i < prof.length; i++) if (prof[i].y >= y){ const a = prof[i - 1], b = prof[i]; return a.x + (b.x - a.x) * (y - a.y) / Math.max(1e-6, b.y - a.y); } return 0; };
  const lean = y => .26 * Math.pow(Math.max(0, y - .95), 2), ZS = .9;
  const onBody = (th, y, off) => { const r = R(y) + off; return [Math.sin(th) * r, y, Math.cos(th) * r * ZS + lean(y)]; };
  const tg = new THREE.LatheGeometry(prof, 48), tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++){ const y = tp.getY(i); tp.setZ(i, tp.getZ(i) * ZS + lean(y)); }
  smoothNormals(tg, 80);
  mesh(tg, yellow, body, 0, 0, 0);
  /* cream egg-shaped belly patch hugging the body; its rim tucks inside so breathing never opens a gap */
  const K = 9, NM = 40, bp = [], bi = [], yc = .88, A = .64;
  bp.push(...onBody(0, yc, .03));
  for (let k = 1; k <= K + 1; k++){
    const rho = Math.min(1, k / K), off = k > K ? -.05 : .012 + .02 * Math.pow(1 - rho * rho, .7);
    for (let m = 0; m < NM; m++){
      const ph = m / NM * Math.PI * 2, s = Math.sin(ph), c = Math.cos(ph);
      bp.push(...onBody(rho * c * A * (1 - .16 * s), yc + rho * s * (s > 0 ? .44 : .37), off));
    }
  }
  for (let m = 0; m < NM; m++) bi.push(0, 1 + m, 1 + (m + 1) % NM);
  for (let k = 0; k < K; k++) for (let m = 0; m < NM; m++){
    const a = 1 + k * NM + m, b = 1 + k * NM + (m + 1) % NM, c = a + NM, d = b + NM; bi.push(a, c, d, a, d, b);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setIndex(bi); bg.computeVertexNormals();
  const belly = mesh(bg, cream, body, 0, 0, 0); belly.castShadow = false;
  /* round green eyes on the sides of the head */
  const eyes = [], irisG = nwBlob(.118, 1, 1, .78, 0, 0, -.03, 0, 0, 0, 20, 16), pupilG = new THREE.SphereGeometry(.062, 16, 12), dotG = new THREE.SphereGeometry(.019, 8, 6);
  for (const sx of [-1, 1]){
    const th = sx * 1.02, p = onBody(th, 1.5, 0), e = new THREE.Group();
    e.position.set(p[0], p[1], p[2]); e.rotation.y = Math.atan2(Math.sin(th) * ZS, Math.cos(th)); body.add(e);
    mesh(irisG, iris, e, 0, 0, 0).castShadow = false;
    const pu = mesh(pupilG, dark, e, -sx * .028, .006, .04); pu.scale.z = .5; pu.castShadow = false;
    mesh(dotG, shine, e, -sx * .046, .032, .066).castShadow = false;
    eyes.push(e);
  }
  /* tiny line mouth (an ellipsoid, so it opens into a round "o" when laughing) */
  const mp = onBody(0, 1.37, -.008);
  const mouth = mesh(new THREE.SphereGeometry(.5, 18, 10), dark, body, mp[0], mp[1], mp[2]); mouth.scale.set(.15, .018, .05); mouth.rotation.x = -.42; mouth.castShadow = false;
  /* arms with dark olive stubby hands, legs with big flat three-toed feet */
  const arms = [], legs = [];
  const armG = nwCapsule(.118, .094, .42, 16);
  const handG = smoothNormals(geoMerge([nwBlob(.098, 1, .92, .82, 0, -.005, 0),
    ...[-1, 0, 1].map(k => geoAt(nwCapsule(.036, .033, .055, 8), k * .052, -.06, .012 - Math.abs(k) * .01, 0, 0, k * .32)),
    geoAt(nwCapsule(.037, .032, .05, 8), 0, -.01, .06, -1.15, 0, 0)]), 40);
  const legG = nwCapsule(.145, .112, .46, 16);
  const footG = smoothNormals(geoMerge([nwBlob(1, .19, .075, .24, 0, -.512, .07, 0, 0, 0, 18, 10),
    ...[-1, 0, 1].map(k => nwBlob(1, .072, .062, .115, k * .1, -.522, .27 - Math.abs(k) * .035, 0, k * .32, 0, 12, 8)),
    nwBlob(1, .1, .05, .09, 0, -.51, -.12, 0, 0, 0, 12, 8)]), 40);
  for (const sx of [1, -1]){
    const a = new THREE.Group(); a.position.set(sx * .63, 1.15, .05); body.add(a);
    mesh(armG, yellow, a, 0, 0, 0);
    const hd = mesh(handG, hand, a, 0, -.5, 0); hd.rotation.y = sx * .25;
    arms.push(a);
    const l = new THREE.Group(); l.position.set(sx * .26, .6, 0); body.add(l);
    mesh(legG, yellow, l, 0, 0, 0);
    const ft = mesh(footG, olive, l, 0, 0, 0); ft.rotation.y = sx * .1;
    legs.push(l);
  }
  return {root, body, belly, eyes, mouth, arms, legs};
}
const NW = makeNaiwa(); scene.add(NW.root);
const nw = {x:110, z:204, y:0, vy:0, h:Math.PI, air:false, state:'idle', t:0, walkT:0, spd:0, spin:0, vx:0, vz:0};
NW.root.position.set(nw.x, 0, nw.z); NW.root.rotation.y = nw.h;

function animNaiwa(dt, T){
  const B = NW.body, [aL, aR] = NW.arms, [lL, lR] = NW.legs;
  let lean = 0, roll = 0, lift = 0, bob = 0, mouthY = .02, bz = .42, wink = 1;
  let aLx = -.28, aLz = .3, aRx = -.28, aRz = -.3, lLx = 0, lRx = 0;
  const st = nw.state, t = nw.t;
  const rub = (k) => { aLx = -1.35 + Math.sin(T * 9) * .2 * k; aRx = -1.35 - Math.sin(T * 9) * .2 * k; aLz = -.4; aRz = .4; };
  if (st === 'sit'){
    lLx = lRx = -1.4; aLx = aRx = -1.05; const s = driving ? driving.steer : 0; aLz = .2 + s * .6; aRz = -.2 + s * .6; roll = -s * .15;
  } else if (st === 'fly'){
    lean = nw.spin; aLz = 2.3 + Math.sin(T * 25) * .4; aRz = -2.3 - Math.sin(T * 25) * .4; lLx = Math.sin(T * 20) * .8; lRx = -lLx; mouthY = .12;
  } else if (st === 'flop'){
    const k = Math.min(1, t / .35), out = t > 2.1 ? Math.min(1, (t - 2.1) / .4) : 0, kk = k * (1 - out);
    lean = -1.5 * kk; lift = .82 * Math.sin(1.5 * kk);
    if (t > .35 && t < 2.1){ rub(1); mouthY = .07 + Math.abs(Math.sin(T * 11)) * .07; roll = Math.sin(T * 18) * .05; lLx = lRx = -.5 + Math.sin(T * 7) * .2; }
  } else if (st === 'laugh'){
    const k = Math.min(1, t / .3) * (t > 1.9 ? Math.max(0, 1 - (t - 1.9) / .3) : 1);
    lean = -.3 * k; rub(k); mouthY = .02 + k * (.06 + Math.abs(Math.sin(T * 11)) * .07); roll = Math.sin(T * 17) * .05 * k;
  } else if (st === 'pose'){
    const k = Math.min(1, t / .3) * (t > 2.1 ? Math.max(0, 1 - (t - 2.1) / .3) : 1);
    aRz = -.3 + (-2.6 + .3) * k; aRx = -.28 - .3 * k; aLz = .3 + .65 * k; aLx = -.28 + .55 * k;
    roll = .14 * k; lean = -.06 * k; lLx = .25 * k; wink = 1 - .85 * k; mouthY = .02 + .02 * k; bob = Math.sin(T * 3) * .02 * k;
  } else if (nw.air){
    aLz = 1.3; aRz = -1.3; lLx = -.6; lRx = -.6; bz = .48;
  } else if (nw.spd > .3){
    const w = nw.walkT; roll = Math.sin(w) * .09; lLx = Math.sin(w) * .55; lRx = -lLx; aLx = -.3 - Math.sin(w) * .45; aRx = -.3 + Math.sin(w) * .45; aLz = .28; aRz = -.28;
    bob = Math.abs(Math.sin(w)) * .05; bz = .42 + Math.sin(w * 2) * .025;
  } else {
    bz = .42 + Math.sin(T * 2) * .015; bob = Math.sin(T * 2) * .006; aLz += Math.sin(T * 2) * .03; aRz -= Math.sin(T * 2) * .03;
  }
  const blink = (T % 3.7) < .12 ? .1 : 1;
  B.rotation.set(lean, 0, roll); B.position.y = lift + bob;
  NW.belly.scale.z = 1 + (bz - .42) * 1.1; NW.mouth.scale.y = Math.max(.018, mouthY * .9);
  NW.eyes[0].scale.y = blink * wink; NW.eyes[1].scale.y = blink;
  aL.rotation.set(aLx, 0, aLz); aR.rotation.set(aRx, 0, aRz); lL.rotation.x = lLx; lR.rotation.x = lRx;
}
