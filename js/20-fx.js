/* XMUM 校园漫游 · 粒子、刹车痕、撞倒树木、合成音效 */
'use strict';
/* ---------- particles ---------- */
function makeTex(draw){ const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); }
const TEX = {
  dust: makeTex(g => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
  heart: makeTex(g => { g.fillStyle = '#fff'; g.font = '54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♥', 32, 36); }),
  ha: makeTex(g => { g.fillStyle = '#fff'; g.font = '900 46px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('哈', 32, 34); }),
  leaf: makeTex(g => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(32, 32, 26, 11, .6, 0, 7); g.fill(); })
};
const parts = [];
for (let i = 0; i < 160; i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:TEX.dust, transparent:true, depthWrite:false, opacity:0}));
  s.visible = false; scene.add(s); parts.push({s, life:0, max:1});
}
let partIdx = 0;
function spawnPart(kind, x, y, z, size, o){
  o = o || {};
  const p = parts[partIdx++ % parts.length];
  p.s.material.map = TEX[kind]; p.s.material.color.set(o.color || '#ffffff');
  p.s.position.set(x, y, z); p.s.scale.setScalar(size); p.size = size; p.grow = o.grow || 0;
  p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g || 0;
  p.life = 0; p.max = o.life || 1.2; p.op = o.op != null ? o.op : .85; p.s.visible = true;
}
function updateParts(dt){
  for (const p of parts){
    if (!p.s.visible) continue;
    p.life += dt; const k = p.life / p.max;
    if (k >= 1){ p.s.visible = false; continue; }
    p.vy -= p.g * dt;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.s.scale.setScalar(p.size * (1 + p.grow * k)); p.s.material.opacity = p.op * (1 - k);
  }
}
function dustBurst(x, y, z, n, size, color){
  for (let i = 0; i < n; i++) spawnPart('dust', x + (rnd() - .5) * size, y + rnd() * size * .4, z + (rnd() - .5) * size, size * (.5 + rnd() * .5),
    {grow:1.4, vx:(rnd() - .5) * 4, vy:1 + rnd() * 2, vz:(rnd() - .5) * 4, life:1 + rnd(), op:.7, color:color || '#d9cfbf'});
}

/* skid marks */
const SKID = 900;
const skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.32, .7).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({color:'#2a2826', transparent:true, opacity:.45, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48}), SKID);
skidMesh.frustumCulled = false; scene.add(skidMesh);
{ const z0 = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SKID; i++) skidMesh.setMatrixAt(i, z0); }
let skidIdx = 0;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _ax = new THREE.Vector3();
function skidAt(x, z, h, y){
  _p.set(x, (y || 0) + .06, z); _q.setFromAxisAngle(UP, h); _s.set(1, 1, 1); _m4.compose(_p, _q, _s);
  skidMesh.setMatrixAt(skidIdx++ % SKID, _m4); skidMesh.instanceMatrix.needsUpdate = true;
}

/* knock trees and lamps */
function setKnock(set, i, down, dx, dz){
  const o = set.spots[i];
  _p.set(o.x, 0, o.z); _q.setFromAxisAngle(UP, o.r);
  if (down){ _q2.setFromAxisAngle(_ax.set(dz, 0, -dx).normalize(), set.kind === 'lamp' ? 1.35 : 1.45); _q.premultiply(_q2); }
  _s.setScalar(o.s); _m4.compose(_p, _q, _s);
  for (const im of set.ims){ im.setMatrixAt(i, _m4); im.instanceMatrix.needsUpdate = true; }
}
function knockAround(x, z, R, fromX, fromZ){
  let n = 0;
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (o.down) return;
    const dx = o.x - x, dz = o.z - z;
    if (dx * dx + dz * dz < R * R){
      o.down = true; n++;
      const ax = o.x - fromX, az = o.z - fromZ, l = Math.hypot(ax, az) || 1;
      setKnock(set, i, true, ax / l, az / l);
      if (set.kind === 'tree') for (let k = 0; k < 5; k++) spawnPart('leaf', o.x + (rnd() - .5) * 4, 5 + rnd() * 4, o.z + (rnd() - .5) * 4, .6, {vx:(rnd() - .5) * 6, vy:2 + rnd() * 3, vz:(rnd() - .5) * 6, g:6, life:1.6, op:1, color:'#4f9a3f'});
      else for (let k = 0; k < 4; k++) spawnPart('dust', o.x, 4, o.z, .5, {vx:(rnd() - .5) * 10, vy:3 + rnd() * 4, vz:(rnd() - .5) * 10, g:15, life:.5, op:1, color:'#ffd27a'});
    }
  });
  return n;
}

/* ---------- sound (synthesised, starts after the first tap) ---------- */
let AC = null, soundOn = true, noiseBuf = null;
function ac(){
  if (!AC){ try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  if (AC && !noiseBuf){ noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  if (AC && !laughClip.tried) loadLaugh(AC);
  return soundOn ? AC : null;
}
/* 奶娃's real laugh (clip from Bilibili BV1auFZzaE4W, see README credits); synth fallback until/unless it loads */
const laughClip = {tried:false, buf:null, src:null};
function loadLaugh(a){
  laughClip.tried = true;
  fetch('assets/audio/naiwa-laugh.mp3')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(data => new Promise((ok, bad) => { const p = a.decodeAudioData(data, ok, bad); if (p && p.catch) p.catch(bad); }))
    .then(buf => { laughClip.buf = buf; })
    .catch(e => console.warn('laugh clip unavailable, using synth', e));
}
function laughSynth(){ for (let i = 0; i < 6; i++){ tone('sawtooth', 330 - i * 14, 250 - i * 10, .11, .09, i * .15); } }
function laughPlay(){
  const a = ac(); if (!a) return;
  if (!laughClip.buf){ laughSynth(); return; }
  if (laughClip.src){ try { laughClip.src.stop(); } catch(e){} }
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = laughClip.buf; s.playbackRate.value = 0.94 + Math.random() * 0.12;
  g.gain.value = 0.7;
  s.connect(g).connect(a.destination); s.start();
  s.onended = () => { if (laughClip.src === s) laughClip.src = null; };
  laughClip.src = s;
}
function tone(type, f0, f1, dur, vol, delay){
  const a = ac(); if (!a) return; const t = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, freq, type){
  const a = ac(); if (!a) return; const t = a.currentTime;
  const s = a.createBufferSource(); s.buffer = noiseBuf; const f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 800;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + dur);
}
const sfx = {
  thud: p => { tone('sine', 110, 38, .35, .5 * p); noise(.3, .25 * p, 500); },
  crash: p => { tone('square', 140, 50, .25, .18 * p); noise(.6, .45 * p, 1600); },
  boing: () => tone('sine', 190, 560, .22, .25),
  horn: () => { tone('square', 415, 410, .18, .12); tone('square', 520, 515, .18, .08); tone('square', 415, 410, .22, .12, .24); tone('square', 520, 515, .22, .08, .24); },
  laugh: laughPlay,
  ding: () => { tone('triangle', 1320, 1300, .25, .2); tone('triangle', 1760, 1740, .45, .16, .12); },
  sparkle: () => { for (let i = 0; i < 4; i++) tone('triangle', 900 + i * 260, 1400 + i * 260, .16, .1, i * .08); },
  splash: () => noise(.8, .35, 2500, 'highpass'),
  fail: () => { tone('sawtooth', 300, 120, .6, .14); }
};
let engine = null;
function engineStart(kind){
  const a = ac(); if (!a || engine) return;
  const o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g).connect(a.destination); o.start(); o2.start();
  const sk = a.createBufferSource(); sk.buffer = noiseBuf; sk.loop = true; const sf = a.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1800; sf.Q.value = 3;
  const sg = a.createGain(); sg.gain.value = 0; sk.connect(sf).connect(sg).connect(a.destination); sk.start();
  engine = {o, o2, g, sk, sg, base:({bus:38, cart:90, patrol:85, rr:40, mase:58, p911:66, lambo:72, myvi:62})[kind] || 55};
}
function engineStop(){ if (!engine) return; try { engine.o.stop(); engine.o2.stop(); engine.sk.stop(); } catch(e){} engine = null; }
function engineUpdate(speed, slip, on){
  if (!engine || !AC) return; const t = AC.currentTime;
  const f = engine.base + speed * 3.2;
  engine.o.frequency.setTargetAtTime(f, t, .05); engine.o2.frequency.setTargetAtTime(f * .5, t, .05);
  engine.g.gain.setTargetAtTime(soundOn && on ? .045 + Math.min(.05, speed * .002) : 0, t, .08);
  engine.sg.gain.setTargetAtTime(soundOn && on && slip > 3 ? Math.min(.16, slip * .012) : 0, t, .05);
}
