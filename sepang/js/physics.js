/* 雪邦赛车城 · 车辆手感（照抄主游戏，开起来和校园里一样）
 *
 * 来源：js/40-vehicles.js 的 updateCar（地面部分）+ js/94-f1-drive.js 的赛道手感（抓地极限转向、超速擦胎）+ js/94-tuning-drive.js 的氮气。
 * 和主游戏不同的只有三处（docs/sepang-plan.md 第 2.2、2.4 节）：
 *   1. 超速擦胎按「方向盘往弯里打」判断（主游戏的符号是反的，PR #157 在修）；
 *   2. 氮气先算进极速上限，再「超过上限就慢慢减」（主游戏开氮气时赛道上没有上限，PR #157 在修）；
 *   3. 这张图是单机的，取消 360 km/h 以上打对折，满改兰博开直喷氮气 576 km/h。
 * 赛道是一段开放的线（demo 只有一段），点的索引在两端夹住。 */

import { PTS } from './track-data.js';

/* ---------- the line: 3 m points, tangents, the car's "r" side, heading, signed curvature (+ = the way positive steering turns) ---------- */
export const N = PTS.length;
export const clampI = i => Math.max(0, Math.min(N - 1, i));
export const TAN = PTS.map((_, i) => { const a = PTS[clampI(i - 1)], b = PTS[clampI(i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
export const RT = TAN.map(([tx, tz]) => [tz, -tx]);
export const HD = TAN.map(([tx, tz]) => Math.atan2(tx, tz));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const K = PTS.map((_, i) => wrap(HD[clampI(i + 2)] - HD[clampI(i - 2)]) / 12);
/* half widths: 15 m (a 30 m road), 18 m through the hairpins */
export const HW = PTS.map((_, i) => { let k = 0; for (let d = -15; d <= 15; d++) k = Math.max(k, Math.abs(K[clampI(i + d)])); return k > 1 / 75 ? 18 : 15; });
export const KERB = 2.6;
export const kerbOn = i => { for (const d of [-10, 0, 10]) if (Math.abs(K[clampI(i + d)]) > 1 / 400) return true; return false; };

/* ---------- cars: CAR_T.lambo from js/40-vehicles.js; "满改" = 改装店 3 级 × 全部性能零件 (docs/sepang-plan.md §2.1) ---------- */
export const LAMBO = {L:4.6, W:2.05, wb:2.7, r:.36, maxV:80, acc:30, grip:8.6, steer:.52};
export const LAMBO_MAX = Object.assign({}, LAMBO, {maxV:80 * 1.21 * 1.14, acc:30 * 1.42 * 1.31, grip:8.6 * 1.3 * 1.34, steer:.52 * 1.15 * 1.2, nos:{cap:5.5, pow:.45, fill:20}});
const CFG = {grip:1.35, floor:.3, scrub:40, sv:1.6, look:1.5, slide:.3, adv:1.2, df:.6};
export const a0Of = T => 13 * Math.pow(T.grip / 8.2, .6);

export function makeCar(T, i){
  const c = {T, x:0, z:0, y:0, h:0, vx:0, vz:0, steer:0, want:0, i:0, good:0, prevI:0, e:1, mult:0, over:0, slip:0, surface:'track', brakeHard:0, offT:0};
  place(c, i); return c;
}
export function place(c, i, lat){
  const j = clampI(i); c.i = c.good = c.prevI = j;
  c.x = PTS[j][0] + RT[j][0] * (lat || 0); c.z = PTS[j][1] + RT[j][1] * (lat || 0); c.h = HD[j]; c.vx = c.vz = 0; c.steer = c.want = 0; c.mult = 0;
}
export function locate(c){
  let bi = c.i, bd = 1e18;
  for (let d = -25; d <= 25; d++){ const i = clampI(c.i + d), dx = c.x - PTS[i][0], dz = c.z - PTS[i][1], q = dx * dx + dz * dz; if (q < bd){ bd = q; bi = i; } }
  c.i = bi; const lat = (c.x - PTS[bi][0]) * RT[bi][0] + (c.z - PTS[bi][1]) * RT[bi][1], a = Math.abs(lat), hw = HW[bi];
  return {i:bi, lat, s:a <= hw ? 'track' : a <= hw + KERB && kerbOn(bi) ? 'kerb' : a <= hw + 22 ? 'runoff' : 'grass'};
}

/* advisory corner speed for a curvature, this car (m/s) */
export function advSpeed(kAbs, a0, vmax){
  if (kAbs < 1e-5) return vmax; const A = a0 * CFG.adv; let lo = 0, hi = vmax;
  for (let n = 0; n < 30; n++){ const v = (lo + hi) / 2; if (v * v * kAbs <= A * (1 + CFG.df * Math.min(2, (v / 50) ** 2))) lo = v; else hi = v; }
  return lo;
}

/* one physics step. inp = {thr -1..1, steer -1..1 (+ = left), brake, nos}; wet 0..1 lowers grip (max −15 %) */
export function step(c, dt, inp, wet){
  const T0 = c.T, W = locate(c), T = Object.assign({}, T0);
  let fx = Math.sin(c.h), fz = Math.cos(c.h), rx = fz, rz = -fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * rx + c.vz * rz; const v = Math.abs(vf);
  /* nitro (js/94-tuning-drive.js): drains while held, refills when let go */
  const nos = T0.nos; let want = 0;
  if (nos){ if (inp.nos && c.e > 0){ c.e = Math.max(0, c.e - dt / nos.cap); want = nos.pow; } else if (!inp.nos) c.e = Math.min(1, c.e + dt / nos.fill); }
  c.mult = want > c.mult ? want : Math.max(want, c.mult - dt * .5);
  /* circuit handling (js/94-f1-drive.js) */
  const asphalt = W.s === 'track' || W.s === 'kerb' || W.s === 'runoff', q = Math.min(2, (v / 50) ** 2), a0 = a0Of(T0) * (1 - .15 * (wet || 0));
  let steer = inp.steer, brake = inp.brake, thr = inp.thr;
  const aMax = a0 * (asphalt ? 1 + CFG.df * q : .75) * (brake && asphalt ? 2.2 : 1), vv = Math.max(v, 4);
  const kRaw = Math.atan(T.wb * aMax * CFG.grip / (vv * vv)) * (1 + .025 * v) / T.steer, k = Math.min(1, Math.max(CFG.floor * Math.min(1, (80 / vv) ** 2), kRaw));
  c.want += (steer - c.want) * Math.min(1, dt * 2.5);
  let over = 0;
  if (asphalt && !brake && v > 8 && Math.abs(c.want) > .35){
    let kc = 0; const ahead = Math.round(Math.min(CFG.look * 60, 6 + v * CFG.look / 3));
    for (let d = 0; d <= ahead; d += 2){ const cv = K[clampI(W.i + d)]; if (Math.sign(cv) === Math.sign(c.want)) kc = Math.max(kc, Math.abs(cv)); }   /* steering INTO the bend */
    if (kc > 1 / 400){ const vOk = Math.sqrt(aMax * CFG.grip / kc); if (v > vOk) over = Math.min(1, (v - vOk) / Math.max(4, vOk) * 3) * Math.min(1, Math.abs(c.want) * 1.4); }
  }
  steer *= k;
  if (asphalt){
    T.grip = T0.grip * (1 + CFG.df * q * .8) * (1 - CFG.slide * over) * (1 - .15 * (wet || 0));
    const cap = T0.maxV * (1 + c.mult);                        /* no halving above 360 km/h on this map; nitro is part of the cap */
    T.maxV = v > cap ? Math.max(cap, v - 9 * dt) : cap;
    if (W.s === 'runoff'){ T.acc *= .8; }
  } else { brake = false; T.grip = Math.max(T0.grip, 7) * 1.25; T.acc = T0.acc * .65; T.maxV = Math.min(T0.maxV, Math.max(v - 3 * dt, 32)); }
  T.acc *= 1 + c.mult * 3.2;
  /* updateCar, ground branch (js/40-vehicles.js) */
  if (thr > 0) vf += T.acc * thr * dt * (vf < -.5 ? 2.5 : 1);
  else if (thr < 0){ if (vf > .5) vf += T.acc * 2.4 * thr * dt; else vf += T.acc * .7 * thr * dt; }
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
  vf -= vf * .1 * dt;
  vf = Math.max(-T.maxV * .35, Math.min(T.maxV, vf));
  vl -= vl * Math.min(1, (brake ? 1.1 : T.grip) * dt);
  if (brake) vf -= vf * .55 * dt;
  c.steer += (steer * T.steer - c.steer) * Math.min(1, dt * 7);
  const se = c.steer / (1 + Math.abs(vf) * .025);
  c.vx = fx * vf + rx * vl; c.vz = fz * vf + rz * vl;
  c.h += vf / T.wb * Math.tan(se) * dt * (brake ? 1.9 : 1);
  if (!asphalt){ const f = Math.exp(-.5 * dt); c.vx *= f; c.vz *= f; }
  const dec = over > .02 ? CFG.scrub * over * (1 + CFG.sv * v / 50) : 0, sp = Math.hypot(c.vx, c.vz);
  if (dec > 0 && sp > 1){ const f = Math.max(0, 1 - dec * dt / sp); c.vx *= f; c.vz *= f; }
  fx = Math.sin(c.h); fz = Math.cos(c.h); rx = fz; rz = -fx;
  c.slip = Math.abs(c.vx * rx + c.vz * rz); c.over = over;
  c.brakeHard = thr < 0 && vf > 20 ? Math.min(1, vf / 60) : 0;
  c.x += c.vx * dt; c.z += c.vz * dt;
  const W2 = locate(c); c.surface = W2.s; c.lat = W2.lat;
  if (W2.s === 'track' && Math.abs(W2.lat) < HW[W2.i] - 1) c.good = W2.i;
  c.offT = W2.s === 'grass' ? c.offT + dt : 0;
  c.prevI = W2.i;
}

/* the auto driver (cinematic + the rival): look ahead along the line, keep under the advisory speed for what is coming.
   o = {over: 1 = advisory speed, lat: m to the r side, nos: use nitro on the straights} */
export function autoInput(c, o){
  const v = Math.hypot(c.vx, c.vz), i = c.i, a0 = a0Of(c.T) * (1 - .15 * (o.wet || 0)), vmax = c.T.maxV * (1 + (c.T.nos ? c.T.nos.pow : 0));
  const look = Math.round((8 + v * .45) / 3), j = clampI(i + look), off = o.lat || 0;
  const tx = PTS[j][0] + RT[j][0] * off, tz = PTS[j][1] + RT[j][1] * off;
  const err = wrap(Math.atan2(tx - c.x, tz - c.z) - c.h);
  let need = 999;
  for (let d = 0; d < 330; d += 2){ const jj = clampI(i + d); let kk = 0; for (let e = -3; e <= 3; e++) kk = Math.max(kk, Math.abs(K[clampI(jj + e)]));
    const va = advSpeed(kk, a0, vmax) * (o.over || 1); need = Math.min(need, Math.sqrt(va * va + 2 * c.T.acc * 1.1 * d * 3)); }
  return {thr:v < need ? 1 : -1, steer:Math.max(-1, Math.min(1, err * 4)), brake:false, nos:!!o.nos && need > 110 && v > 40};
}
