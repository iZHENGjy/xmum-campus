/* 雪邦赛车城 · 玩具微缩章节：橙色玩具轨道（1:64，宿舍书桌上）
 * 轨道是一条闭合的三维曲线：书桌上 → 桌边飞跃 → 螺旋下坡到地板 → 地毯直道 → 垂直大回环 → 爬坡回到书桌。
 * 车在轨道面上开（沿轨道的距离 s、横向位置 l、相对轨道的朝向 yaw），所以回环、倾斜弯、飞跃都自然成立：
 *   回环顶上速度不够会掉下来；飞跃速度不够会掉到地上（重来）；撞护栏会擦出火花、掉速。 */
import * as THREE from 'three';

export const G_ACC = 25;            /* gravity, game units; toys fall a bit fast, which is part of why they look small */
export const HWT = 6.5;             /* half width: a four-lane toy raceway, 13 m at 1:64 */
export const RAIL = 1.0;            /* rail height */
export const DESK_Y = 48;           /* desk top (75 cm × 64) */
export const DESK = {x0:36, x1:156, z0:-158, z1:-96};

/* the route, in game metres (1 game metre = 1.56 cm of the real room); y up, the floor is 0 */
const CTRL = (() => {
  const T = .6, D = DESK_Y + T, pts = [];
  const push = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
  /* desk, heading −x: start/finish line, round the mug and the laptop, onto the launch ramp at the desk's left edge */
  push(176, D, -124); push(150, D, -124); push(120, D, -124); push(96, D, -130); push(76, D, -122); push(58, D + .4, -114); push(46, D + 2.2, -112);
  /* the jump: lip at the desk edge, landing ramp in the air 26 m further on (the spline runs through the gap, nothing is built there) */
  push(34, D + 2.8, -112); push(16, D - 1.2, -112); push(-2, D - 4.5, -112); push(-18, D - 10, -110);
  /* spiral down to the floor */
  push(-28, 28, -98); push(-30, 18, -78); push(-26, 9, -56); push(-14, T + .4, -32); push(8, T, -12);
  /* across the rug, a booster, then the loop */
  push(44, T, -2); push(84, T, 2); push(106, T, 3);
  const cx = 124, R = 15, z0 = 3, dz = 9;
  for (const a of [.6, 1.2, 1.9, 2.6, 3.14, 3.7, 4.4, 5.1, 5.7]){ push(cx + R * Math.sin(a), T + R * (1 - Math.cos(a)), z0 + dz * a / 6.283); }
  push(144, T, z0 + dz + 1); push(172, T, 14);
  /* round the corner and climb back up to the desk, held up by book stacks */
  push(202, T, 2); push(214, 3, -24); push(214, 16, -56); push(211, 31, -86); push(204, 43, -108); push(192, D, -122);
  return pts;
})();

export function buildTrack(){
  const curve = new THREE.CatmullRomCurve3(CTRL, true, 'centripetal', .5);
  const L = curve.getLength(), n = Math.round(L);              /* one sample per metre */
  const C = curve.getSpacedPoints(n).slice(0, n), ds = L / n;
  const T = C.map((p, i) => C[(i + 1) % n].clone().sub(C[(i - 1 + n) % n]).normalize());
  /* rotation-minimising frames (parallel transport), so the loop turns the "up" all the way round; the closing twist is spread out */
  const U = [new THREE.Vector3(0, 1, 0).sub(T[0].clone().multiplyScalar(T[0].y)).normalize()];
  const q = new THREE.Quaternion();
  for (let i = 1; i <= n; i++){ q.setFromUnitVectors(T[i - 1], T[i % n]); U[i] = U[i - 1].clone().applyQuaternion(q); }
  const end = U[n], ang = Math.atan2(end.clone().cross(U[0]).dot(T[0]), end.dot(U[0]));
  for (let i = 0; i < n; i++) U[i].applyAxisAngle(T[i], ang * i / n);
  U.length = n;
  /* signed horizontal curvature (+ = turning left) and a little banking into the flat bends */
  const K = T.map((t, i) => { const t2 = T[(i + 1) % n]; return t.clone().cross(t2).dot(U[i]) / ds; });
  const KS = K.map((_, i) => { let a = 0; for (let d = -6; d <= 6; d++) a += K[(i + d + n) % n]; return a / 13; });
  const bank = KS.map((k, i) => -Math.max(-.32, Math.min(.32, k * 22)) * (1 - Math.min(1, Math.abs(T[i].y) * 3)));
  const BS = bank.map((_, i) => { let a = 0; for (let d = -10; d <= 10; d++) a += bank[(i + d + n) % n]; return a / 21; });
  for (let i = 0; i < n; i++) U[i].applyAxisAngle(T[i], BS[i]);
  const R = T.map((t, i) => t.clone().cross(U[i]).normalize());
  /* curvature in the track's own up direction (the loop): positive when the track bends towards its up side */
  const KN = T.map((t, i) => T[(i + 1) % n].clone().sub(t).dot(U[i]) / ds);
  /* the gap of the jump: between the lip and the landing ramp */
  const near = p => { let b = 0, bd = 1e9; C.forEach((c, i) => { const d = c.distanceToSquared(p); if (d < bd){ bd = d; b = i; } }); return b; };
  const gap = [near(new THREE.Vector3(38, DESK_Y + 2.7, -112)), near(new THREE.Vector3(18, DESK_Y - .8, -112))];
  const inGap = i => { i = ((i % n) + n) % n; return i > gap[0] && i < gap[1]; };
  /* where the start line is: on the desk, by the mug */
  const start = near(new THREE.Vector3(120, DESK_Y, -124));
  const booster = [near(new THREE.Vector3(60, 0, -1)), near(new THREE.Vector3(214, 6, -32))];
  return {curve, L, n, ds, C, T, U, R, K:KS, KN, gap, inGap, start, booster,
    at(s){ const i = ((Math.floor(s / ds) % n) + n) % n; return i; },
    wrap(s){ return ((s % L) + L) % L; },
    /* interpolated frame at s */
    frame(s, o){ s = ((s % L) + L) % L; const f = s / ds, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
      o.p.copy(C[i]).lerp(C[j], t); o.t.copy(T[i]).lerp(T[j], t).normalize(); o.u.copy(U[i]).lerp(U[j], t).normalize(); o.r.copy(o.t).cross(o.u).normalize(); o.i = i; return o; },
    newFrame(){ return {p:new THREE.Vector3(), t:new THREE.Vector3(), u:new THREE.Vector3(), r:new THREE.Vector3(), i:0}; }};
}

/* ---------------- the car on the track ---------------- */
export function makeToyCar(spec, trk, s, l){
  return {spec, s, l, v:0, yaw:0, steer:0, mult:0, e:1, air:null, lap:0, slip:0, scrape:0, last:s, good:s, grounded:true, airT:0, crashT:0,
    pos:new THREE.Vector3(), fwd:new THREE.Vector3(0, 0, 1), up:new THREE.Vector3(0, 1, 0), vel:new THREE.Vector3()};
}
const _f = {p:new THREE.Vector3(), t:new THREE.Vector3(), u:new THREE.Vector3(), r:new THREE.Vector3(), i:0};
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/* steering authority: plenty when slow, less at speed */
export const yawRate = v => 2.4 * Math.min(1, v / 12) / (1 + v / 110);

/* one step; inp = {thr, steer (+ = left), brake (handbrake/drift), nos}; returns events for the game (hits, landing, ...) */
export function stepToyCar(c, trk, dt, inp, ev){
  const S = c.spec, f = trk.frame(c.s, _f);
  /* nitro: drains while held; refill only if the spec says so (rivals) */
  let want = 0;
  if (S.nos){ if (inp.nos && c.e > 0){ c.e = Math.max(0, c.e - dt / S.nos.cap); want = S.nos.pow; } else if (!inp.nos && S.nos.fill < 1e8) c.e = Math.min(1, c.e + dt / S.nos.fill); }
  c.mult = want > c.mult ? want : Math.max(want, c.mult - dt * .6);
  if (c.air){ return air(c, trk, dt, ev); }
  /* along the track: engine (fading near the top), gravity along the slope, drag */
  const cap = S.maxV * (1 + c.mult);
  let a = 0;
  if (inp.thr > 0) a += S.acc * inp.thr * (1 - .75 * Math.min(1, (c.v / cap) ** 2)) * (1 + c.mult * 2.5);
  else if (inp.thr < 0) a += c.v > 1 ? -S.acc * 2.2 : -S.acc * .5;
  a -= G_ACC * f.t.y;                       /* downhill pulls you, uphill holds you back */
  a -= c.v * .08 + Math.sign(c.v) * 1.2;
  if (inp.brake) a -= c.v * .35;
  c.v = Math.max(-12, c.v + a * dt); if (c.v > cap && inp.thr >= 0) c.v = Math.max(cap, c.v - 25 * dt);
  /* steering: yaw relative to the track; the bend turns the track under you, banking helps */
  c.steer += (inp.steer - c.steer) * Math.min(1, dt * 9);
  const k = trk.K[f.i], drift = inp.brake && c.v > 20 ? 1.7 : 1;
  const bankHelp = .45 * Math.min(1, Math.abs(Math.asin(Math.max(-1, Math.min(1, f.r.y)))) / .32);
  c.yaw += (c.steer * yawRate(c.v) * drift - k * c.v * (1 - bankHelp)) * dt;
  c.yaw *= 1 - Math.min(1, dt * (inp.brake ? .3 : 1.2));     /* tyres pull you straight again */
  c.yaw = Math.max(-.9, Math.min(.9, c.yaw));
  c.slip = Math.abs(c.yaw) * c.v;
  c.l += -Math.sin(c.yaw) * c.v * dt;
  c.s += Math.cos(c.yaw) * c.v * dt;
  /* rails */
  c.scrape = 0; const lim = HWT - 1.05;
  if (Math.abs(c.l) > lim){ const side = Math.sign(c.l), into = -Math.sin(c.yaw) * side;   /* how hard we are going into the rail */
    c.l = side * lim; if (into > 0){ c.yaw = -c.yaw * .3; c.v *= 1 - Math.min(.35, .02 + into * .5); ev.push({type:'rail', c, hard:into * c.v}); }
    c.scrape = 1; }
  /* leaving the track: the jump's lip, or too slow upside down in the loop */
  const f2 = trk.frame(c.s, _f);
  const normal = c.v * c.v * trk.KN[f2.i] + G_ACC * f2.u.y;
  if (trk.inGap(f2.i) || (f2.u.y < .3 && normal < 0)){
    const fw = _v.copy(f2.t).multiplyScalar(Math.cos(c.yaw)).addScaledVector(f2.r, -Math.sin(c.yaw));
    c.air = {p:f2.p.clone().addScaledVector(f2.r, c.l).addScaledVector(f2.u, .05), v:fw.multiplyScalar(c.v), t:0, s0:c.s, up:f2.u.clone()};
    ev.push({type:'takeoff', c}); return;
  }
  if (!trk.inGap(f2.i)) c.good = c.s;
  pose(c, f2);
}
function pose(c, f){
  c.pos.copy(f.p).addScaledVector(f.r, c.l);
  c.fwd.copy(f.t).multiplyScalar(Math.cos(c.yaw)).addScaledVector(f.r, -Math.sin(c.yaw)).normalize();
  c.up.copy(f.u); c.vel.copy(c.fwd).multiplyScalar(c.v);
}
function air(c, trk, dt, ev){
  const A = c.air; A.t += dt; c.airT = A.t;
  A.v.y -= G_ACC * dt; A.p.addScaledVector(A.v, dt);
  c.pos.copy(A.p); c.vel.copy(A.v);
  const sp = A.v.length(); if (sp > .1) c.fwd.copy(A.v).normalize();
  c.up.lerp(_w.set(0, 1, 0), Math.min(1, dt * 1.5)).normalize();
  /* find the track under us: search ahead of where we took off */
  let best = -1, bd = 1e9; const i0 = trk.at(A.s0);
  for (let d = 3; d < 200; d++){ const i = (i0 + d + trk.n) % trk.n; if (trk.inGap(i)) continue;   /* only ahead of the takeoff */ const q = trk.C[i].distanceToSquared(A.p); if (q < bd){ bd = q; best = i; } }
  if (best >= 0 && bd < 30 * 30){
    const p = trk.C[best], u = trk.U[best], r = trk.R[best], t = trk.T[best];
    const h = _w.copy(A.p).sub(p).dot(u), l = _w.copy(A.p).sub(p).dot(r);
    /* toy-car magnet: in the air you are eased back over the track (sideways speed damped, pulled towards the middle) */
    if (A.t < 2.5){ const vr = A.v.dot(r); A.v.addScaledVector(r, -vr * Math.min(1, dt * 3) - l * dt * 2.5); if (h > 0 && Math.abs(l) < HWT + 4) A.v.addScaledVector(u, -18 * dt); }
    if (h <= 0 && h > -6 && Math.abs(l) < HWT + 1.5 && A.v.dot(u) < 0){
      c.s = best * trk.ds; c.l = Math.max(-HWT + 1.1, Math.min(HWT - 1.1, l));
      const vt = A.v.dot(t), vr = A.v.dot(r);
      c.v = Math.max(5, Math.hypot(vt, vr) * .95); c.yaw = Math.max(-.6, Math.min(.6, -Math.atan2(vr, Math.max(1, vt))));
      ev.push({type:'land', c, air:A.t, hard:-A.v.dot(u)}); c.air = null; c.airT = 0; return;
    }
  }
  /* missed: as soon as you touch the floor or the desk it is a crash, back on the track behind */
  const gy = A.p.x > DESK.x0 && A.p.x < DESK.x1 && A.p.z > DESK.z0 && A.p.z < DESK.z1 ? DESK_Y : 0;
  if (A.p.y < gy + .4 || A.t > 4){ ev.push({type:'crash', c}); respawn(c, trk); }
}
export function respawn(c, trk){
  c.air = null; c.s = c.good - 25; while (trk.inGap(trk.at(c.s))) c.s -= 10; c.l = 0; c.v = 18; c.yaw = 0; c.crashT = 1.2;
  pose(c, trk.frame(c.s, _f));
}
export function placeOn(c, trk){ pose(c, trk.frame(c.s, _f)); }

/* the fastest speed at which the steering can still follow a bend of curvature k: v (1 + v/110) = 2.4 · 0.9 / k */
export const cornerV = k => (-1 + Math.sqrt(1 + 4 * (2.16 / k) / 110)) * 55;

/* the computer driver: hold a lane, feed-forward the bend, brake for what is coming, carry enough speed into the loop and the jump */
export function aiInput(c, trk, o){
  const f = trk.frame(c.s, _f), i = f.i, v = c.v;
  const need = trk.K[i] * Math.max(v, 5);
  let steer = need / Math.max(.2, yawRate(v)) + (c.l - o.lane) * .09 - c.yaw * 1.8;   /* l > lane → steer left (+) */
  steer = Math.max(-1, Math.min(1, steer));
  /* corner speed: look ahead */
  let target = c.spec.maxV * (1 + (o.nos ? c.spec.nos.pow : 0));
  for (let d = 4; d < 140; d += 4){ const j = (i + d) % trk.n, k = Math.abs(trk.K[j]); if (k > 1 / 400 && trk.U[j].y > .7){ const vk = cornerV(k) * (o.grip || 1); target = Math.min(target, Math.sqrt(vk * vk + 2 * 30 * d)); } }
  return {thr:v < target ? 1 : -1, steer, brake:false, nos:!!o.nos};
}
