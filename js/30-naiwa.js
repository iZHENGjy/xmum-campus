/* XMUM 校园漫游 · 奶娃模型和动画 */
'use strict';
/* ---------- 奶娃 (low-poly homage) ---------- */
const NAI_S = 1.3;
function makeNaiwa(){
  const yellow = M('#f1c84b', {roughness:.55}), cream = M('#e9d4a4', {roughness:.65}), olive = M('#6d6a3a', {roughness:.75});
  const dark = M('#1d1a17', {roughness:.4}), iris = M('#7cc576', {roughness:.25});
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(NAI_S);
  const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const prof = [[0,.44],[.36,.47],[.6,.6],[.73,.8],[.74,1.0],[.66,1.2],[.53,1.38],[.41,1.53],[.31,1.66],[.17,1.77],[0,1.81]].map(([r, y]) => new THREE.Vector2(r, y));
  const tg = new THREE.LatheGeometry(prof, 36), tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++){ const y = tp.getY(i); if (y > 1.05) tp.setZ(i, tp.getZ(i) + (y - 1.05) * .22); }
  tg.computeVertexNormals();
  const trunk = mesh(tg, yellow, body, 0, 0, 0); trunk.scale.z = .9;
  const belly = mesh(new THREE.SphereGeometry(.6, 28, 18), cream, body, 0, .8, .4); belly.scale.set(.95, 1.05, .45);
  const eyes = [];
  for (const sx of [-1, 1]){
    const e = new THREE.Group(); e.position.set(sx * .23, 1.6, .3); e.rotation.y = sx * .9; body.add(e);
    mesh(new THREE.SphereGeometry(.1, 16, 12), iris, e, 0, 0, 0); mesh(new THREE.SphereGeometry(.052, 12, 10), dark, e, 0, 0, .07);
    eyes.push(e);
  }
  const mouth = mesh(new THREE.BoxGeometry(1, 1, 1), dark, body, 0, 1.5, .44); mouth.scale.set(.13, .012, .03);
  const arms = [], legs = [];
  const finger = new THREE.CylinderGeometry(.035, .03, .13, 6);
  for (const sx of [1, -1]){
    const a = new THREE.Group(); a.position.set(sx * .6, 1.14, .12); body.add(a);
    mesh(new THREE.CylinderGeometry(.11, .1, .46, 10), yellow, a, 0, -.23, 0);
    const hand = new THREE.Group(); hand.position.y = -.5; a.add(hand);
    mesh(new THREE.SphereGeometry(.1, 12, 10), olive, hand, 0, 0, 0).scale.set(1, .8, .7);
    for (let k = -1; k <= 1; k++){ const f = mesh(finger, olive, hand, k * .055, -.1, .02); f.rotation.z = k * .25; }
    arms.push(a);
    const l = new THREE.Group(); l.position.set(sx * .24, .55, 0); body.add(l);
    mesh(new THREE.CylinderGeometry(.16, .12, .5, 10), yellow, l, 0, -.24, 0);
    const foot = mesh(new THREE.SphereGeometry(.14, 12, 10), olive, l, 0, -.52, .08); foot.scale.set(1.15, .4, 1.6);
    for (let k = -1; k <= 1; k++){ const t2 = mesh(new THREE.SphereGeometry(.06, 8, 6), olive, l, k * .08, -.53, .3); t2.scale.set(1, .6, 1.4); }
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
  let aLx = -.5, aLz = -.22, aRx = -.5, aRz = .22, lLx = 0, lRx = 0;
  const st = nw.state, t = nw.t;
  const rub = (k) => { aLx = -1.25 + Math.sin(T * 9) * .22 * k; aRx = -1.25 - Math.sin(T * 9) * .22 * k; aLz = -.55; aRz = .55; };
  if (st === 'sit'){
    lLx = lRx = -1.4; aLx = aRx = -1.05; const s = driving ? driving.steer : 0; aLz = .1 + s * .6; aRz = -.1 + s * .6; roll = -s * .15;
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
    aRz = -.25 + (-2.6 + .25) * k; aRx = -.55 * k; aLz = .25 + .7 * k; aLx = .3 * k;
    roll = .14 * k; lean = -.06 * k; lLx = .25 * k; wink = 1 - .85 * k; mouthY = .02 + .02 * k; bob = Math.sin(T * 3) * .02 * k;
  } else if (nw.air){
    aLz = 1.3; aRz = -1.3; lLx = -.6; lRx = -.6; bz = .48;
  } else if (nw.spd > .3){
    const w = nw.walkT; roll = Math.sin(w) * .09; lLx = Math.sin(w) * .55; lRx = -lLx; aLx = -.35 - Math.sin(w) * .4; aRx = -.35 + Math.sin(w) * .4; aLz = .1; aRz = -.1;
    bob = Math.abs(Math.sin(w)) * .05; bz = .42 + Math.sin(w * 2) * .025;
  } else {
    bz = .42 + Math.sin(T * 2) * .015; bob = Math.sin(T * 2) * .006;
  }
  const blink = (T % 3.7) < .12 ? .1 : 1;
  B.rotation.set(lean, 0, roll); B.position.y = lift + bob;
  NW.belly.scale.z = bz * 1.07; NW.mouth.scale.y = Math.max(.012, mouthY * .9);
  NW.eyes[0].scale.y = blink * wink; NW.eyes[1].scale.y = blink;
  aL.rotation.set(aLx, 0, aLz); aR.rotation.set(aRx, 0, aRz); lL.rotation.x = lLx; lR.rotation.x = lRx;
}
