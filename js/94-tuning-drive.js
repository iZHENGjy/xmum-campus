/* XMUM 校园漫游 · 改装车开起来的效果：氮气加速、驾驶技能（弹射起步、漂移增压）、尾焰（光轨 / 火焰 / 等离子）
   零件在 js/42-tuning.js（槽 nos / skill / trail / trailc），装没装看 myCar.tn.fit（tnApply 写的）。只对你自己的车生效。
   氮气：按住 Shift 或 N，手机上按住「氮气」按钮。能量条在按钮上，开着车慢慢回满，漂移和飞跃回得快。
   弹射起步：停稳以后踩油门自动触发（8 秒冷却）。漂移增压：漂移结束时按漂了多久推一把，还给氮气回能。两个都不用多按键，手机上好用。
   竞速（js/92-racing.js）：人机赛里你有氮气，AI 也会在直道上喷；用过氮气或技能的那一场不上榜、不存影线（RC.nos），排行榜只比车和车手。
   尾焰：贴着尾灯拖一条面向镜头的光带（每帧改一次顶点，一个 draw call），火焰和等离子再加粒子；天黑以后更亮。
   画质「流畅」档光带变短、不出火星；改装车间「尾焰」页可以整个关掉（tune.trailOff）。
   对外：window.XTuneDrive = {preview(item), showroom(dt), state}（改装车间预览用）。 */
'use strict';
const ND = {e:1, held:false, btn:false, mult:0, nosOn:false, launchT:0, launchCd:0, still:0, driftT:0, driftBoost:0, hiss:null, hissG:null, demo:0, demoIt:null, tell:0};
const ndItem = c => { if (!c || c !== myCar || !c.tn) return null; const it = TN.byKey['nos.' + c.tn.fit.nos]; return it && it.cap ? it : null; };
const ndSkill = c => c && c === myCar && c.tn ? c.tn.fit.skill : 'none';
const ndRacing = () => typeof RC !== 'undefined' && RC.st === 'run';

/* ---------- the button (in #acts, so it sits with 上车 / 漂移 / 喇叭) and the keys ---------- */
const ndBtn = document.createElement('button'); ndBtn.type = 'button'; ndBtn.id = 'act-n'; ndBtn.hidden = true;
ndBtn.innerHTML = '<b>氮气</b><kbd>Shift</kbd><i class="nd-bar" aria-hidden="true"></i>'; ndBtn.setAttribute('aria-label', '氮气加速，按住');
{ const acts = $('#acts'); if (acts) acts.appendChild(ndBtn); }
const ndDown = e => { e.preventDefault(); ac(); ND.btn = true; ndBtn.classList.add('on'); };
const ndUp = () => { ND.btn = false; ndBtn.classList.remove('on'); };
ndBtn.addEventListener('pointerdown', ndDown); ndBtn.addEventListener('pointerup', ndUp); ndBtn.addEventListener('pointercancel', ndUp); ndBtn.addEventListener('pointerleave', ndUp);
ndBtn.addEventListener('contextmenu', e => e.preventDefault());
const ndKeys = () => !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyN);

/* ---------- sound: a hiss while the bottle is open, a thump when it lights ---------- */
function ndHiss(on){
  const a = on ? ac() : AC; if (!a || !noiseBuf) return;
  if (!ND.hiss && on){
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .8;
    const g = a.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(a.destination); s.start(); ND.hiss = s; ND.hissG = g; ND.hissF = f;
  }
  if (ND.hissG) ND.hissG.gain.setTargetAtTime(on && soundOn ? .09 : 0, a.currentTime, on ? .03 : .12);
}
function ndBang(big){ noise(.25, big ? .4 : .28, 1400, 'highpass'); tone('sawtooth', 90, 260, .45, .07); tone('square', 60, 40, .2, .12); }

/* ---------- physics: while boosting, the car may go past its top speed and pulls much harder ---------- */
{
  const base = updateCar;
  updateCar = function(c, dt, inp){
    if (c !== driving || !(ND.mult > .001)) return base(c, dt, inp);
    const T = c.T, v = T.maxV, a = T.acc; T.maxV = v * (1 + ND.mult); T.acc = a * (1 + ND.mult * 3.2);
    try { return base(c, dt, inp); } finally { T.maxV = v; T.acc = a; }
  };
}

/* ---------- flames out of the back ---------- */
const ndWorld = (c, t) => { const fx = Math.sin(c.h), fz = Math.cos(c.h); return [c.x + t[0] * fz + t[2] * fx, c.y + c.body.position.y + t[1], c.z - t[0] * fx + t[2] * fz]; };
function ndFlames(c, col, k, demo){
  const n = Math.max(1, Math.round((typeof XQ !== 'undefined' ? XQ.pick(1, 2, 3) : 2) * k)), fx = Math.sin(c.h), fz = Math.cos(c.h);
  for (const t of c.tn.rear) for (let i = 0; i < n; i++){
    const [x, y, z] = ndWorld(c, t), v = 6 + rnd() * 6, vx = demo ? 0 : c.vx, vz = demo ? 0 : c.vz;
    spawnPart('dust', x - fx * .05, y, z - fz * .05, .26 + rnd() * .2, {grow:2.2, vx:vx - fx * v, vy:.3 + rnd() * .5, vz:vz - fz * v, life:.14 + rnd() * .12, op:1,
      color:rnd() < .35 ? '#ffffff' : rnd() < .6 ? col : '#ffd36a'});
  }
}

/* ---------- per frame: energy, input, skills ---------- */
const ndThrottle = () => (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
function ndUpdate(dt){
  const c = driving, it = ndItem(c), sk = ndSkill(c), live = c && c === myCar && !gx.paused && !(typeof tn !== 'undefined' && tn.on);
  ndBtn.hidden = !(c && c === myCar && it);
  ND.launchCd -= dt; ND.tell -= dt;
  let want = 0;
  if (live){
    const sp = Math.hypot(c.vx, c.vz), fwd = c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h);
    /* 氮气 */
    if (it){
      const held = ND.btn || ndKeys();
      if (held && !ND.nosOn && ND.e > .12 && fwd > -1 && !c.wrecked){ ND.nosOn = true; ndBang(it.id === 'n3'); camShake = Math.max(camShake, .35); }
      if (ND.nosOn && (!held || ND.e <= 0 || c.wrecked)) ND.nosOn = false;
      if (ND.nosOn){ ND.e = Math.max(0, ND.e - dt / it.cap); want = it.pow; if (!c.air) ndFlames(c, it.col, 1); }
      else ND.e = Math.min(1, ND.e + dt / it.fill * (c.slip > 5 && sp > 10 ? 2.6 : c.air ? 2.2 : sp > 5 ? 1 : .35));
    } else ND.nosOn = false;
    ndHiss(ND.nosOn);
    /* 弹射起步: stand still for a moment, then floor it */
    if (sk === 'launch'){
      ND.still = sp < 1.2 ? ND.still + dt : 0;
      if (ND.still > .35 && ND.launchCd <= 0 && ndThrottle() > .5 && !c.wrecked){ ND.launchT = 1.05; ND.launchCd = 8; ND.still = 0; ndBang(false); gx.callout('弹射起步！', '', '#ffb13b'); }
    }
    if (ND.launchT > 0){ ND.launchT -= dt; want = Math.max(want, .55); if (it || c.tn.rear) ndFlames(c, '#ffb13b', .7); }
    /* 漂移增压: the longer the drift, the bigger the push on the way out */
    if (sk === 'drift'){
      if (c.slip > 5 && sp > 10 && !c.air) ND.driftT += dt;
      else if (c.slip < 2.5){
        if (ND.driftT > .8){ const k = Math.min(1.6, ND.driftT * .5); ND.driftBoost = k; if (it) ND.e = Math.min(1, ND.e + ND.driftT * .08);
          gx.callout('漂移增压', `+${k.toFixed(1)} 秒`, '#5fd0ff'); tone('triangle', 520, 1040, .25, .09); }
        ND.driftT = 0;
      }
    }
    if (ND.driftBoost > 0){ ND.driftBoost -= dt; want = Math.max(want, .35); ndFlames(c, '#5fd0ff', .5); }
    if (want > 0 && ndRacing() && RC.me && RC.me.car === c) RC.nos = true;
  } else { ND.nosOn = false; ndHiss(false); ND.launchT = 0; ND.driftBoost = 0; ND.driftT = 0; }
  /* ease out instead of snapping back to the normal top speed */
  ND.mult = want > ND.mult ? want : Math.max(want, ND.mult - dt * .5);
  ndBtn.style.setProperty('--e', ND.e.toFixed(3)); ndBtn.classList.toggle('full', ND.e >= 1); ndBtn.classList.toggle('on', ND.nosOn);
}

/* ---------- 竞速：AI racers get bottles too when you have one; a run with nitro or skills does not go on the board ---------- */
if (typeof rcStart === 'function'){
  const base = rcStart;
  rcStart = function(){
    RC.nos = false;
    const r = base.apply(this, arguments);
    if (r && RC.mode !== 'items' && myCar && driving === myCar && (ndItem(myCar) || ndSkill(myCar) !== 'none'))
      toast('改装提示', '这场可以用氮气和技能，AI 也会喷氮气；用了的话成绩不上榜、不存影线', 3000);
    return r;
  };
}
if (typeof rcAiDrive === 'function'){
  const base = rcAiDrive;
  rcAiDrive = function(r, dt, lead){
    const it = ndItem(myCar);
    if (it && RC.mode === 'ai' && RC.st === 'run' && RC.me && RC.me.car === myCar){
      r.ndCd = (r.ndCd == null ? 6 + rcRand() * 10 : r.ndCd) - dt;
      if (r.ndCd <= 0 && !(r.boost > 0) && rcCurv(RC.T, r.s, Math.hypot(r.car.vx, r.car.vz)) < .012){ r.boost = it.cap * .75; r.ndCd = 13 + rcRand() * 9; }
    } else r.ndCd = null;
    return base.apply(this, arguments);
  };
}

/* ---------- 尾焰: camera-facing light ribbons behind the tail lamps ---------- */
const TR_MAX = 34, TR_N = 3;                    /* points per ribbon, ribbons (two tail lamps + a plasma core) */
const trGeo = new THREE.BufferGeometry(), trPos = new Float32Array(TR_N * TR_MAX * 2 * 3), trCol = new Float32Array(TR_N * TR_MAX * 2 * 3);
{
  const idx = [];
  for (let r = 0; r < TR_N; r++) for (let i = 0; i < TR_MAX - 1; i++){ const a = (r * TR_MAX + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  trGeo.setIndex(idx); trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
  trGeo.attributes.position.setUsage(THREE.DynamicDrawUsage); trGeo.attributes.color.setUsage(THREE.DynamicDrawUsage);
}
const trMat = new THREE.MeshBasicMaterial({vertexColors:true, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, fog:false});
const trMesh = new THREE.Mesh(trGeo, trMat); trMesh.frustumCulled = false; trMesh.visible = false; trMesh.renderOrder = 3; scene.add(trMesh);
const TR = {pts:[[], [], []], kind:'', car:null, spark:0, t:0};   /* t: the trail's own clock (game time, so a pause does not age it) */
const TR_LOOK = {streak:{life:.5, w:.26, auto:'#ff3344'}, flame:{life:.24, w:.24, auto:'#ff9a2a'}, plasma:{life:.65, w:.55, auto:'#35e0ff'}};
const trCols = {}, TR_WHITE = new THREE.Color('#ffffff');
const trColOf = (c, kind) => { const it = TN.byKey['trailc.' + c.tn.fit.trailc], k = it && it.col || TR_LOOK[kind].auto; return trCols[k] || (trCols[k] = new THREE.Color(k)); };
const trC = new THREE.Color(), trV = new THREE.Vector3(), trD = new THREE.Vector3(), trS = new THREE.Vector3();
/* write ribbon r from its points (newest first); width w, colour col times fade */
const TR_EMBER = new THREE.Color('#ff2a10');
/* flick: a flame — the width flickers and the colour cools to red toward the end */
function trWrite(r, pts, w, col, life, now, gain, flick){
  const base = r * TR_MAX * 2, cam = camera.position;
  let n = Math.min(pts.length, TR_MAX);
  for (let i = 0; i < TR_MAX; i++){
    const p = pts[Math.min(i, n - 1)] || null, q = pts[Math.min(i + 1, n - 1)] || p, o = (base + i * 2) * 3;
    if (!p){ trPos.fill(0, o, o + 6); trCol.fill(0, o, o + 6); continue; }
    trD.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (trD.lengthSq() < 1e-6) trD.set(0, 0, 1);
    trV.set(cam.x - p[0], cam.y - p[1], cam.z - p[2]); trS.crossVectors(trD, trV).normalize();
    const age = (now - p[3]) / life, f = i < n ? Math.max(0, 1 - age) : 0, ww = w * (.35 + .65 * f) * .5 * (flick ? .55 + .5 * Math.abs(Math.sin(i * 1.9 + now * 23 + r)) : 1);
    trPos[o] = p[0] + trS.x * ww; trPos[o + 1] = p[1] + trS.y * ww; trPos[o + 2] = p[2] + trS.z * ww;
    trPos[o + 3] = p[0] - trS.x * ww; trPos[o + 4] = p[1] - trS.y * ww; trPos[o + 5] = p[2] - trS.z * ww;
    const k = f * f * gain; trC.copy(col); if (flick) trC.lerp(TR_EMBER, 1 - f); trC.multiplyScalar(k);
    trCol[o] = trCol[o + 3] = trC.r; trCol[o + 1] = trCol[o + 4] = trC.g; trCol[o + 2] = trCol[o + 5] = trC.b;
  }
}
function trUpdate(dt, demo){
  const c = myCar, kind = c && c.tn ? c.tn.fit.trail : 'none', on = kind !== 'none' && !tune.trailOff && c && (demo || driving === c);
  if (!on){ trMesh.visible = false; TR.pts.forEach(a => a.length = 0); return; }
  TR.t += dt; const now = TR.t, L = TR_LOOK[kind], low = typeof XQ !== 'undefined' && XQ.level === 'low';
  const life = L.life * (low ? .55 : 1), col = trColOf(c, kind), lamp = typeof cur !== 'undefined' ? Math.min(1, cur.lamp || 0) : 0, gain = (kind === 'flame' ? .9 : 1.15) * (.75 + .6 * lamp);
  if (TR.car !== c || TR.kind !== kind){ TR.car = c; TR.kind = kind; TR.pts.forEach(a => a.length = 0); }
  const t0 = kind === 'flame' ? c.tn.rear : c.tn.tail, tails = t0.length > 2 ? [t0[0], t0[t0.length - 1]] : t0, sp = Math.hypot(c.vx, c.vz);
  if (demo){
    /* the workshop turntable: a still trail streaming out behind the car, so the preview shows something */
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    tails.slice(0, 2).forEach((t, r) => { const [x, y, z] = ndWorld(c, t), a = TR.pts[r]; a.length = 0;
      for (let i = 0; i < 24; i++){ const d = i * .3, wob = Math.sin(now * 3 + i * .5 + r) * .03 * i; a.push([x - fx * d + fz * wob, y + wob * .3, z - fz * d - fx * wob, now - life * i / 26]); } });
  } else for (let r = 0; r < Math.min(2, tails.length); r++){
    const [x, y, z] = ndWorld(c, tails[r]), a = TR.pts[r], h = a[0];
    /* a new point when the car has moved; otherwise the newest one just follows the lamp */
    if (sp > 2 && (!h || Math.hypot(h[0] - x, h[2] - z) > .3)) a.unshift([x, y, z, now]); else if (h) { h[0] = x; h[1] = y; h[2] = z; }
    while (a.length > (low ? 16 : TR_MAX) || (a.length && now - a[a.length - 1][3] > life)) a.pop();
  }
  const ok = TR.pts[0].length > 1;
  trMesh.visible = ok; if (!ok) return;
  for (let r = 0; r < 2; r++) trWrite(r, TR.pts[r], L.w * (tails.length > 1 || kind !== 'plasma' ? 1 : 1.5), col, life, now, gain, kind === 'flame');
  /* plasma: a white-hot core down the middle of the first ribbon */
  if (kind === 'plasma') trWrite(2, TR.pts[0], L.w * .35, TR_WHITE, life * .7, now, .8 * gain); else trWrite(2, [], 0, col, 1, now, 0);
  trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
  /* flames lick out of the pipes; plasma throws sparks. Not on 流畅 */
  if (!demo && sp > 3 && !low){
    TR.spark += dt * (kind === 'flame' ? 40 : kind === 'plasma' ? 14 : 0) * (.4 + Math.min(1, sp / 30));
    while (TR.spark > 1){ TR.spark--; const t = tails[(rnd() * tails.length) | 0], [x, y, z] = ndWorld(c, t), fx = Math.sin(c.h), fz = Math.cos(c.h);
      if (kind === 'flame') spawnPart('dust', x, y, z, .18 + rnd() * .14, {grow:1.8, vx:c.vx * .6 - fx * 3, vy:.6 + rnd(), vz:c.vz * .6 - fz * 3, life:.12 + rnd() * .1, op:1, color:rnd() < .5 ? '#ffd36a' : col.getStyle()});
      else spawnPart('dust', x, y, z, .08 + rnd() * .06, {vx:c.vx * .5 + (rnd() - .5) * 4, vy:1 + rnd() * 2, vz:c.vz * .5 + (rnd() - .5) * 4, g:9, life:.35 + rnd() * .3, op:1, color:rnd() < .5 ? '#ffffff' : col.getStyle()}); }
  }
}

/* ---------- hook into the frame ---------- */
{
  const up = gx.update;
  gx.update = function(dt, px, pz){ up.call(this, dt, px, pz); ndUpdate(dt); trUpdate(dt, false); };
}
/* gx.update does not run while paused (the workshop pauses the game): keep the button and sounds honest */
setInterval(() => { if (gx.paused){ ndHiss(false); ND.nosOn = false; ND.mult = 0; } }, 250);

window.XTuneDrive = {
  /* the workshop: a short burst of nitro flame when you look at a bottle */
  preview(it){ if (it.slot === 'nos' && it.cap){ ND.demo = 1.6; ND.demoIt = it; ndBang(it.id === 'n3'); } },
  showroom(dt){
    if (!myCar || !myCar.tn) return;
    trUpdate(dt, true);
    if (ND.demo > 0){ ND.demo -= dt; ndFlames(myCar, ND.demoIt.col, 1.4, true); }
  },
  get state(){ return ND; }
};
