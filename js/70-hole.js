/* XMUM 校园漫游 · 黑洞模式（含三个 AI 对手、道具、连吞、倒计时、难度） */
'use strict';
/* ---------- black hole mode (you vs three rival holes) ---------- */
const holeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#000000'); gr.addColorStop(.72, '#05030a'); gr.addColorStop(.92, '#1d1238'); gr.addColorStop(1, '#3b2470');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,90,220,.35)'; g.lineWidth = 3;
  for (let k = 0; k < 5; k++){ g.beginPath(); for (let t = 0; t < 1; t += .02){ const a = k * 1.2566 + t * 4.5, r = 30 + t * 95; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.stroke(); }
  return new THREE.CanvasTexture(c);
})();
/* suction swirl around the rim: streaks that spiral inward (white, tinted per hole) */
const holeSwirlTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.lineCap = 'round';
  for (let k = 0; k < 9; k++){
    const a0 = k / 9 * Math.PI * 2;
    for (let t = 0; t < 1; t += .04){
      const r0 = 126 - t * 44, r1 = 126 - (t + .04) * 44, a = a0 + t * 1.9, b = a0 + (t + .04) * 1.9;
      g.strokeStyle = `rgba(255,255,255,${(t * .85).toFixed(3)})`; g.lineWidth = 2 + t * 5;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(b) * r1, 128 + Math.sin(b) * r1); g.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
})();
const holeSwirlGeo = new THREE.RingGeometry(1, 1.55, 64), holeAuraGeo = new THREE.RingGeometry(.96, 1, 64), holeIceGeo = new THREE.CircleGeometry(1.04, 48);
function makeHoleMeshes(color){
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({map:holeTex, polygonOffset:true, polygonOffsetFactor:-20, polygonOffsetUnits:-80, fog:false}));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.6, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r);
  return [m, r];
}
function makeHoleExtras(color){
  const add = (geo, mat, y) => { const o = new THREE.Mesh(geo, mat); o.rotation.x = -Math.PI / 2; o.position.y = y; o.visible = false; scene.add(o); return o; };
  const swirl = add(holeSwirlGeo, new THREE.MeshBasicMaterial({map:holeSwirlTex, color, transparent:true, opacity:.3, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, polygonOffset:true, polygonOffsetFactor:-22, polygonOffsetUnits:-88}), .2);
  const aura = add(holeAuraGeo, new THREE.MeshBasicMaterial({color:'#ff5cf0', transparent:true, opacity:.7, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}), .22);
  const ice = add(holeIceGeo, new THREE.MeshBasicMaterial({color:'#cdefff', transparent:true, opacity:.62, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-24, polygonOffsetUnits:-96}), .23);
  return {swirl, aura, ice};
}
const HOLE_TIME = 150;
/* difficulty: AI speed, reaction time, growth, how far they hunt, how much they want power-ups */
const HOLE_DIFF = {
  easy:  {name:'轻松', spd:.72, react:1.5, grow:.7,  hunt:.55, pu:.4, freeze:false},
  normal:{name:'普通', spd:.84, react:1,   grow:.85, hunt:1,   pu:1,  freeze:true},
  hard:  {name:'困难', spd:.94, react:.6,  grow:1,    hunt:1.5, pu:1.4, freeze:true}
};
let holeDiffKey = (() => { try { const v = localStorage.getItem('xmum-hole-diff'); return HOLE_DIFF[v] ? v : 'normal'; } catch(e){ return 'normal'; } })();
const holeDiff = () => HOLE_DIFF[holeDiffKey];
/* personalities: fear = flee from holes this many times bigger; flee = how wide a berth; huntK = hunt holes this many times smaller */
const HOLE_PERSONA = {
  '你':   {spd:1, fear:1.12, flee:1, huntR:150, huntK:1.2, youBias:1},
  'DDL':  {spd:1,    fear:1.35, flee:.55, huntR:260, huntK:1.18, youBias:2.4},
  '早八': {spd:1.06, fear:.95,  flee:1.8, huntR:110, huntK:1.45, youBias:1},
  '期末周':{spd:.9,  fear:1.15, flee:1,   huntR:170, huntK:1.22, youBias:1.4, late:true}
};
const HOLES = [{name:'你', you:true, color:'#8a6bff'}, {name:'DDL', color:'#ff4d4d'}, {name:'早八', color:'#3fa9ff'}, {name:'期末周', color:'#3fdc7c'}].map(h => {
  const [m, rim] = makeHoleMeshes(h.color); const L = addLabel(h.name, 0, 0, 0, false); L.dead = true; L.hole = true; L.el.style.borderColor = h.color;
  return Object.assign(h, {m, rim, L, x:0, z:0, r:2.5, area:0, mass:0, score:0, alive:true, respawn:0, aiT:0, tx:0, tz:0, names:[],
    p:HOLE_PERSONA[h.name], fx:makeHoleExtras(h.color), buf:{spd:0, mag:0, dbl:0}, frozen:0, suck:0, vx:0, vz:0, goal:null, goalK:'', force:0, side:1, chk:2, cx0:0, cz0:0, stuck:0, eatN:0, eatN0:0});
});
const hole = HOLES[0];
const HS = {on:false, t:0, total:1, nextT:0, cd:0, cdN:0, camD:40, lx:0, lz:0, puT:0, tick:0, late:false, place:1, ate:{}, biggest:null, died:0, npcN:0};
const eats = [], falling = [];
let gulpT = 0;
const HOLE_BOUND = {x0:-595, x1:595, z0:-270, z1:258};
const holeLive = () => HS.on && HS.cd <= 0;
const holeLate = () => HS.t < 60;
const holeInLake = (x, z) => lakes.some(L => inPoly(x, z, L));
const holeMagR = h => Math.min(60, 10 + h.r * 1.3);

/* ---------- HUD (built here so every page that loads this file gets it) ---------- */
function holeEl(tag, id, cls, parent, before){
  let el = document.getElementById(id);
  if (!el){ el = document.createElement(tag); el.id = id; parent = parent || document.body; before ? parent.insertBefore(el, before) : parent.appendChild(el); }
  if (cls) el.className = cls;
  return el;
}
function holeDiffSeg(){
  const d = document.createElement('div'); d.className = 'hdiff'; d.setAttribute('role', 'group'); d.setAttribute('aria-label', '难度');
  for (const k of Object.keys(HOLE_DIFF)){
    const b = document.createElement('button'); b.type = 'button'; b.dataset.d = k; b.textContent = HOLE_DIFF[k].name; b.setAttribute('aria-pressed', String(k === holeDiffKey));
    b.addEventListener('click', () => { holeSetDiff(k); canvas.focus({preventScroll:true}); });
    d.appendChild(b);
  }
  return d;
}
const HH = (() => {
  const cd = holeEl('div', 'hcd', 'hx'); cd.hidden = true;
  cd.innerHTML = '<b id="hcdN">3</b><div class="hcd-k" id="hcdK">难度</div><small>吞掉比你小的东西 · 躲开比你大的黑洞 · 捡发光道具</small>';
  cd.insertBefore(holeDiffSeg(), cd.querySelector('small'));
  const call = holeEl('div', 'hcall', 'hx'); call.hidden = true; call.setAttribute('role', 'status'); call.setAttribute('aria-live', 'polite');
  const bar = holeEl('div', 'hbar', 'hx'); bar.hidden = true;
  const combo = holeEl('div', 'hcombo', 'hx', bar); combo.hidden = true;
  const buffs = holeEl('div', 'hbuffs', 'hx', bar);
  const feed = holeEl('div', 'hfeed', 'hx'); feed.hidden = true;
  const pops = holeEl('div', 'hpops', 'hx');
  const flash = holeEl('div', 'hflash', 'hx'); flash.hidden = true;
  const end = $('#hend'), endS = $('#hendS');
  const endR = holeEl('div', 'hendR', 'hend-rank', end, endS), endG = holeEl('div', 'hendG', 'hend-grid', end, endS);
  const endD = document.createElement('div'); endD.className = 'hend-d'; endD.innerHTML = '<span>下一局难度</span>'; endD.appendChild(holeDiffSeg());
  end.insertBefore(endD, end.querySelector('.hrow'));
  return {cd, cdN:$('#hcdN'), cdK:$('#hcdK'), call, bar, combo, buffs, feed, pops, flash, endR, endG, eyebrow:end.querySelector('.eyebrow'), buffHTML:'', comboHTML:'', callPrio:0, callUntil:0, callTimer:0};
})();
function holeSetDiff(k){
  if (!HOLE_DIFF[k]) return;
  holeDiffKey = k; try { localStorage.setItem('xmum-hole-diff', k); } catch(e){}
  document.querySelectorAll('.hdiff button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === k)));
  HH.cdK.textContent = '难度：' + holeDiff().name + '（点下面换）';
  if (HS.on && HS.cd > 0){ HS.cd = 3; HS.cdN = 0; }   // changed during the countdown: restart it
}
holeSetDiff(holeDiffKey);
/* big centre callout; a less important one while a bigger one is showing goes to the feed instead */
function holeCallout(t, sub, kind, prio){
  prio = prio || 1; const now = performance.now();
  if (now < HH.callUntil && prio < HH.callPrio){ holeFeed(t); return; }
  const c = HH.call; c.innerHTML = ''; const b = document.createElement('b'); b.textContent = t; c.appendChild(b);
  if (sub){ const s = document.createElement('small'); s.textContent = sub; c.appendChild(s); }
  c.className = 'hx ' + (kind || ''); c.hidden = false; void c.offsetWidth; c.classList.add('show');
  HH.callPrio = prio; HH.callUntil = now + (prio >= 3 ? 2400 : 1600);
  clearTimeout(HH.callTimer); HH.callTimer = setTimeout(() => { c.classList.remove('show'); HH.callTimer = setTimeout(() => { c.hidden = true; }, 250); }, prio >= 3 ? 2400 : 1600);
}
function holeFeed(t, color){
  const f = HH.feed; f.hidden = false;
  const d = document.createElement('div'); d.textContent = t; if (color) d.style.borderLeftColor = color;
  f.appendChild(d); while (f.children.length > 4) f.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 4200);
}
const holePopEls = [], _hv = new THREE.Vector3(); let holePopI = 0;
function holePop(x, y, z, text, color, big){
  _hv.set(x, y, z).project(camera);
  if (_hv.z > 1 || Math.abs(_hv.x) > 1 || Math.abs(_hv.y) > 1) return;
  if (holePopEls.length < 10){ const e = document.createElement('div'); HH.pops.appendChild(e); holePopEls.push(e); }
  const e = holePopEls[holePopI++ % holePopEls.length];
  e.textContent = text; e.style.color = color || ''; e.className = 'hpop' + (big ? ' big' : '');
  e.style.left = ((_hv.x * .5 + .5) * 100).toFixed(2) + '%'; e.style.top = ((-_hv.y * .5 + .5) * 100).toFixed(2) + '%';
  void e.offsetWidth; e.classList.add('go');
}
function holeFlash(color){
  if (REDUCED) return;
  const f = HH.flash; f.style.setProperty('--hf', color || 'rgba(255,214,90,.75)'); f.hidden = false; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  setTimeout(() => { f.hidden = true; }, 950);
}
function holeShake(k){ if (!REDUCED) camShake = Math.max(camShake, k); }
/* sounds (synthesised with the shared tone/noise helpers) */
const hsfx = {
  beep: hi => tone('square', hi ? 990 : 660, hi ? 980 : 655, hi ? .38 : .13, .1),
  tick: hi => tone('square', hi ? 1320 : 1050, hi ? 1300 : 1040, .05, hi ? .08 : .05),
  gulp: n => tone('sine', 320 + Math.min(n, 30) * 16, 90 + Math.min(n, 30) * 6, .14, .1),
  tier: n => { for (let i = 0; i < 3; i++) tone('triangle', 660 * Math.pow(1.26, i) * (1 + n * .12), 700 * Math.pow(1.26, i) * (1 + n * .12), .12, .1, i * .07); },
  pick: () => { tone('sine', 420, 1260, .22, .14); sfx.sparkle(); },
  spd: () => { noise(.45, .18, 2600, 'highpass'); tone('sawtooth', 180, 720, .32, .05); },
  ice: () => { tone('triangle', 2300, 1400, .4, .11); tone('triangle', 1800, 1050, .55, .08, .09); noise(.3, .1, 5000, 'highpass'); },
  frozen: () => tone('sine', 620, 180, .55, .16),
  mag: () => { tone('sine', 160, 520, .45, .14); tone('sine', 240, 780, .45, .06, .05); },
  dbl: () => { sfx.ding(); tone('triangle', 520, 1040, .3, .1, .1); },
  a3: () => { sfx.thud(1); sfx.crash(1); sfx.sparkle(); sfx.ding(); tone('sawtooth', 90, 40, 1.2, .16); }
};

/* ---------- power-ups ---------- */
const HOLE_PU = {
  spd:{name:'加速', ch:'速', color:'#38e8ff', dur:6, sub:'6 秒内跑得更快'},
  mag:{name:'磁铁', ch:'磁', color:'#ff5cf0', dur:7, sub:'7 秒内附近的小东西自己飞进来'},
  ice:{name:'冰冻', ch:'冻', color:'#9fd8ff', dur:5, sub:'其他黑洞被冻住 5 秒，动不了也吞不了'},
  dbl:{name:'双倍', ch:'倍', color:'#ffd34d', dur:8, sub:'8 秒内吞东西长大快一倍'}
};
const holePuTex = {};
for (const k in HOLE_PU){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,8,24,.88)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.lineWidth = 8; g.strokeStyle = HOLE_PU[k].color; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '900 64px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(HOLE_PU[k].ch, 64, 68);
  holePuTex[k] = new THREE.CanvasTexture(c);
}
const holePuGeo = {beam:new THREE.CylinderGeometry(.6, 1.2, 46, 14, 1, true).translate(0, 23, 0), orb:new THREE.OctahedronGeometry(1.1), ring:new THREE.RingGeometry(1.6, 2.2, 36)};
const holePUs = [];
for (let i = 0; i < 6; i++){
  const add = { transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, fog:false };
  const g = new THREE.Group();
  const beam = new THREE.Mesh(holePuGeo.beam, new THREE.MeshBasicMaterial(Object.assign({opacity:.26}, add)));
  const orb = new THREE.Mesh(holePuGeo.orb, new THREE.MeshBasicMaterial({fog:false})); orb.position.y = 2.4;
  const ring = new THREE.Mesh(holePuGeo.ring, new THREE.MeshBasicMaterial(Object.assign({opacity:.75}, add))); ring.rotation.x = -Math.PI / 2; ring.position.y = .26;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:holePuTex.spd, fog:false, transparent:true})); spr.position.y = 5.6; spr.scale.setScalar(3.4);
  g.add(beam, orb, ring, spr); g.visible = false; scene.add(g);
  holePUs.push({g, beam, orb, ring, spr, on:false, kind:'spd', x:0, z:0, life:0, s:1});
}
function holePlacePU(near){
  for (let k = 0; k < 40; k++){
    let x, z;
    if (near){ const a = rnd() * Math.PI * 2, d = 40 + rnd() * 110; x = hole.x + Math.cos(a) * d; z = hole.z + Math.sin(a) * d; }
    else { x = -560 + rnd() * 1120; z = -245 + rnd() * 480; }
    if (x < -565 || x > 565 || z < -248 || z > 236 || holeInLake(x, z) || hitsBuilding(x, z, 3)) continue;
    if (HOLES.some(h => h.alive && Math.hypot(h.x - x, h.z - z) < h.r + 20)) continue;
    if (holePUs.some(p => p.on && Math.hypot(p.x - x, p.z - z) < 60)) continue;
    return [x, z];
  }
  return null;
}
function holeSpawnPU(near, kind){
  const pu = holePUs.find(p => !p.on); if (!pu) return null;
  const at = holePlacePU(near); if (!at) return null;
  const ks = Object.keys(HOLE_PU); kind = kind || ks[(rnd() * ks.length) | 0];
  const P = HOLE_PU[kind];
  Object.assign(pu, {on:true, kind, x:at[0], z:at[1], life:0});
  pu.beam.material.color.set(P.color); pu.orb.material.color.set(P.color); pu.ring.material.color.set(P.color); pu.spr.material.map = holePuTex[kind]; pu.spr.material.needsUpdate = true;
  pu.g.position.set(pu.x, 0, pu.z); pu.g.visible = true;
  return pu;
}
function holeClearPUs(){ holePUs.forEach(p => { p.on = false; p.g.visible = false; }); }
function holeCollect(pu, h){
  pu.on = false; pu.g.visible = false;
  const P = HOLE_PU[pu.kind], D = holeDiff();
  holePop(pu.x, 3, pu.z, P.name + '！', P.color, true);
  if (pu.kind === 'ice'){
    const victims = HOLES.filter(o => o !== h && o.alive && (h.you || D.freeze || !o.you));
    victims.forEach(o => { o.frozen = Math.max(o.frozen, h.you ? P.dur : 2.5); });
    if (h.you){ holeCallout('冰冻！', P.sub, 'ice', 2); hsfx.ice(); }
    else if (victims.includes(hole)){ holeCallout(`你被「${h.name}」冻住了`, '2.5 秒动不了，比你大的黑洞也一样被冻住', 'ice', 2); hsfx.frozen(); }
    else holeFeed(`「${h.name}」拿到冰冻`, h.color);
  } else {
    h.buf[pu.kind] = P.dur;
    if (h.you){ holeCallout(P.name + '！', P.sub, 'pu-' + pu.kind, 2); hsfx.pick(); hsfx[pu.kind](); }
    else holeFeed(`「${h.name}」拿到${P.name}`, h.color);
  }
}
function holeUpdatePUs(dt, T, live){
  if (live){
    HS.puT -= dt;
    const max = holeDiffKey === 'easy' ? 5 : 4;
    if (HS.puT <= 0){ HS.puT = 5 + rnd() * 3; if (holePUs.filter(p => p.on).length < max) holeSpawnPU(rnd() < .45); }
  }
  const s = Math.max(1, hole.r / 5);
  for (const pu of holePUs){
    if (!pu.on) continue;
    if (live) pu.life += dt;
    if (pu.life > 32){ pu.on = false; pu.g.visible = false; continue; }
    const blink = pu.life > 27 ? (Math.sin(T * 18) > 0 ? 1 : .25) : 1;
    pu.s = s; pu.g.scale.setScalar(s);
    pu.orb.rotation.y = T * 2.2; pu.orb.position.y = 2.4 + Math.sin(T * 3 + pu.x) * .35;
    pu.beam.material.opacity = (.18 + Math.sin(T * 4 + pu.z) * .06) * blink; pu.ring.material.opacity = .75 * blink; pu.spr.material.opacity = blink;
    pu.ring.scale.setScalar(1 + (T * 1.3 % 1) * .5);
    if (!live) continue;
    for (const h of HOLES){
      if (!h.alive || h.frozen > 0) continue;
      if (Math.hypot(h.x - pu.x, h.z - pu.z) < h.r + 1.6 * s){ holeCollect(pu, h); break; }
    }
  }
}

/* ---------- world ---------- */
function structCenter(st){ let cx = 0, cz = 0; st.cols.forEach(c => { cx += c.cx; cz += c.cz; }); return [cx / st.cols.length, cz / st.cols.length]; }
function buildEats(){
  eats.length = 0;
  for (const set of knockSets) set.spots.forEach((o, i) => {
    if (o.hidden) return;
    const r = set.kind === 'lamp' ? .5 : set.kind === 'bench' ? 1 : set.kind === 'bin' ? .4 : (set === knockSets[0] ? 1.6 : 2.5) * o.s;
    eats.push({k:'inst', set, i, x:o.x, z:o.z, r, a:Math.PI * r * r * (set.kind === 'tree' ? 1.6 : 1.2)});
  });
  for (const st of structures){
    if (!st.cols.length) continue;
    const [cx, cz] = structCenter(st); let r = 0, a = 0;
    for (const c of st.cols){ const e = c.t ? c.r : Math.hypot(c.hx, c.hz); r = Math.max(r, Math.hypot(c.cx - cx, c.cz - cz) + e); a += c.t ? Math.PI * c.r * c.r : 4 * c.hx * c.hz; }
    if (r > 150) continue;
    eats.push({k:'st', st, x:cx, z:cz, r:r * .72, a:a * 1.3, name:st.info && st.info.name});
  }
  cars.forEach(c => eats.push({k:'car', c, x:c.x, z:c.z, r:c.R * 1.15, a:c.T.L * c.T.W * 1.8, name:c.T.name}));
  npcs.forEach((n, i) => eats.push({k:'npc', n, i, x:n.x, z:n.z, r:.45, a:3}));
  eats.forEach(e => { e.fall = null; e.gone = false; });
}
function resetWorld(){
  despawnChasers();
  for (const st of structures){
    st.gone = false; st.shake = 0;
    st.cols.forEach(c => c.dead = false); st.fps.forEach(f => f.dead = false); st.lbls.forEach(L => L.dead = false);
    st.groups.forEach(g => { g.visible = true; g.position.copy(g.userData.base); g.rotation.x = 0; g.rotation.z = 0; });
  }
  for (const set of knockSets) set.spots.forEach((o, i) => { if (o.hidden) return; o.down = false; setKnock(set, i, false, 0, 0); });
  for (const c of cars){
    if (c === driving) continue;
    [c.x, c.z, c.h] = c.home; Object.assign(c, {vx:0, vz:0, y:0, vy:0, air:false, lastVy:0, pitch:0, steer:0, hp:100, wrecked:false});
    if (c.paint) c.paint.color.set(c.color0);
    c.root.visible = true; c.root.position.set(c.x, 0, c.z); c.root.rotation.set(0, c.h, 0);
  }
  npcs.forEach(n => { n.state = 'walk'; n.y = 0; n.tilt = 0; n.ox = n.oz = 0; });
  falling.length = 0; eats.forEach(e => { e.fall = null; e.gone = false; });
}
const holeArea = h => Math.PI * Math.pow(2.5 + .55 * Math.pow(h.mass, .4), 2);
function placeHole(h){
  for (let k = 0; k < 80; k++){
    const x = -520 + rnd() * 1040, z = -240 + rnd() * 470;
    if (holeInLake(x, z)) continue;
    if (HOLES.some(o => o !== h && o.alive && Math.hypot(o.x - x, o.z - z) < 140 + o.r)) continue;
    h.x = x; h.z = z; return;
  }
}
function holeShowMeshes(h, on){
  h.m.visible = h.rim.visible = h.fx.swirl.visible = on; h.L.dead = !on;
  if (!on){ h.fx.aura.visible = h.fx.ice.visible = false; }
}
function holeResetHole(h){
  Object.assign(h, {mass:0, alive:true, respawn:0, aiT:0, frozen:0, suck:0, vx:0, vz:0, goal:null, goalK:'', force:0, chk:2});
  h.buf.spd = h.buf.mag = h.buf.dbl = 0; h.area = Math.PI * 6.25; h.r = 2.5; h.side = rnd() < .5 ? 1 : -1;
}
function startHole(){
  resetWorld(); buildEats();
  HS.total = eats.reduce((a, e) => a + e.a, 0); HS.on = true; HS.t = HOLE_TIME; HS.nextT = 0; HS.cd = 3; HS.cdN = 0;
  Object.assign(HS, {puT:6, tick:0, late:false, place:1, biggest:null, died:0, npcN:0, ate:{st:0, car:0, npc:0, tree:0, bench:0, lamp:0, bin:0, hole:0}});
  Object.assign(HCOMBO, {n:0, t:0, best:0, mult:1});
  HOLES.forEach(h => {
    holeResetHole(h); h.score = 0; h.names = []; h.stuck = 0;
    if (h.you){ h.x = 110; h.z = 204; } else placeHole(h);
    h.cx0 = h.x; h.cz0 = h.z; holeShowMeshes(h, true);
  });
  holeClearPUs(); holeSpawnPU(true, 'spd'); holeSpawnPU(false);
  $('#hend').hidden = true; camYaw = 0; HS.camD = 30 + hole.r * 3.6; HS.lx = HS.lz = 0;
  HH.feed.innerHTML = ''; HH.feed.hidden = false; HH.bar.hidden = false; HH.combo.hidden = true; HH.buffs.innerHTML = HH.buffHTML = '';
  HH.call.hidden = true; HH.cd.hidden = false; HH.cd.classList.remove('late'); HH.cdN.textContent = '3';
  $('#htime').classList.remove('hurry');
}
function stopHole(){
  HS.on = false; HS.cd = 0; HOLES.forEach(h => holeShowMeshes(h, false));
  holeClearPUs();
  $('#hend').hidden = true; HH.cd.hidden = HH.call.hidden = HH.bar.hidden = HH.feed.hidden = HH.flash.hidden = true; HH.feed.innerHTML = '';
  holePopEls.forEach(e => e.className = 'hpop');
  $('#htime').classList.remove('hurry');
  resetWorld();
}
const ranked = () => HOLES.slice().sort((a, b) => b.score - a.score);
const HOLE_CAT = [['st', '栋楼'], ['car', '辆车'], ['npc', '个同学'], ['tree', '棵树'], ['bench', '张长椅'], ['lamp', '盏路灯'], ['bin', '个垃圾桶'], ['hole', '个黑洞']];
function endHole(){
  HS.on = false; HS.cd = 0;
  const pct = hole.score / HS.total * 100, rk = ranked(), place = rk.indexOf(hole) + 1;
  let best = 0; try { best = +localStorage.getItem('xmum-hole-best') || 0; if (pct > best) localStorage.setItem('xmum-hole-best', pct.toFixed(1)); } catch(e){}
  const record = pct > best && pct > 0;
  HH.eyebrow.textContent = record ? '时间到 · 新纪录' : '时间到';
  $('#hendT').textContent = place === 1 ? `第 1 名！吞掉了 XMUM 的 ${pct.toFixed(1)}%` : `第 ${place} 名 · 吞掉了 ${pct.toFixed(1)}%`;
  HH.endR.innerHTML = rk.map((h, i) => `<div class="${h.you ? 'me' : ''}"><i style="background:${h.color}"></i><span>${i + 1}. ${h.name}</span><b>${(h.score / HS.total * 100).toFixed(1)}%</b></div>`).join('');
  const cats = HOLE_CAT.filter(([k]) => HS.ate[k] > 0);
  HH.endG.innerHTML = cats.length ? cats.map(([k, w]) => `<div><b>${HS.ate[k]}</b><span>${w}</span></div>`).join('') : '<div class="none">什么都没吞到</div>';
  const names = hole.names.filter((v, i, a) => a.indexOf(v) === i), bits = [];
  if (HS.biggest) bits.push(`最大一口：${HS.biggest.name}`);
  if (HCOMBO.best >= 3) bits.push(`最高连吞 ${HCOMBO.best}`);
  if (HS.died) bits.push(`被吞 ${HS.died} 次`);
  bits.push(`难度 ${holeDiff().name}`);
  $('#hendS').textContent = bits.join(' · ') + '。'
    + (names.length ? ` 吞下了 ${names.slice(0, 5).join('、')}${names.length > 5 ? ' 等 ' + names.length + ' 处' : ''}。` : '')
    + (record ? (best ? ` 之前最好 ${best.toFixed(1)}%。` : '') : best ? ` 最好成绩 ${best.toFixed(1)}%。` : '');
  HH.cd.hidden = HH.bar.hidden = true; HH.call.hidden = true;
  $('#htime').classList.remove('hurry');
  $('#hend').hidden = false; place === 1 ? sfx.ding() : sfx.fail(); if (record) setTimeout(() => sfx.sparkle(), 300);
}
$('#hagain').addEventListener('click', () => { startHole(); canvas.focus({preventScroll:true}); });
$('#hquit').addEventListener('click', () => setMode('naiwa'));
function markGone(st){ st.gone = true; st.cols.forEach(c => c.dead = true); st.fps.forEach(f => f.dead = true); st.lbls.forEach(L => L.dead = true); }

/* ---------- combo (you only): quick swallows stack a growth multiplier ---------- */
const HCOMBO = {n:0, t:0, best:0, mult:1};
const holeComboMult = n => n >= 40 ? 1.35 : n >= 20 ? 1.2 : n >= 8 ? 1.1 : 1;
function holeComboAdd(k, x, z){
  HCOMBO.n += k; HCOMBO.t = 1.3; HCOMBO.best = Math.max(HCOMBO.best, HCOMBO.n);
  const m = holeComboMult(HCOMBO.n);
  if (m > HCOMBO.mult){ HCOMBO.mult = m; hsfx.tier(m); holePop(x, 2, z, `连吞 ×${m}`, '#ffd34d', true); }
}
function holeGrowMul(h){
  let k = h.buf.dbl > 0 ? 2 : 1;
  if (h.you) k *= HCOMBO.mult;
  else { k *= holeDiff().grow; if (h.p.late) k *= holeLate() ? 1.75 : .7; }
  return k;
}
function holeSpeed(h){
  let v = 10 + h.r * .5;
  if (h.buf.spd > 0) v *= 1.55;
  if (!h.you){ v *= holeDiff().spd * h.p.spd; if (h.p.late && holeLate()) v *= 1.15; }
  return v;
}
const HOLE_FLAVOR = {
  'D6 食堂':'今天的饭吃不成了', 'LY3 食堂':'LY 的同学只能点外卖了', 'B1 学生活动中心':'社团活动全部取消', '田径场':'连跑道一起卷进去了',
  '礼堂':'毕业典礼改线上', '南门（正门）':'校门都没了，怎么进校', '东门':'东门也没了', '陈嘉庚像':'……对不起', '户外球场':'球赛取消',
  '音乐岛':'贝壳屋顶转着圈掉下去了', '国际学术交流中心':'会议改期', '研究生研究中心（二期）':'论文进度清零', 'LY1':'整栋宿舍楼一起吞'
};
const HOLE_CAR_LINE = {bus:['校巴连司机一起吞了', '下一班车遥遥无期'], patrol:['保安巡逻车被吞了', '保安：？？？'],
  lambo:['兰博鸡尼，一口吞', '车主正在赶来的路上'], p911:['保时洁 911，一口吞', '车主正在赶来的路上'], mase:['玛莎拉弟，一口吞', '车主正在赶来的路上'], rr:['劳斯来斯，一口吞', '这辆车比黑洞还贵']};
function startFall(e, h){
  e.fall = {k:0, dur:e.k === 'st' ? 1.6 : e.k === 'car' ? 1 : .6, x0:e.x, z0:e.z, h};
  falling.push(e); h.mass += e.a * holeGrowMul(h); h.score += e.a; h.eatN++;
  h.suck = Math.min(1, h.suck + (e.k === 'st' ? 1 : e.k === 'car' ? .5 : .12));
  const dd = Math.hypot(e.x - hole.x, e.z - hole.z), near = dd < 220, fade = Math.max(0, 1 - dd / 260);
  if (h.you){
    const cat = e.k === 'inst' ? e.set.kind : e.k; HS.ate[cat] = (HS.ate[cat] || 0) + 1;
    if (e.k === 'st' || e.k === 'car'){ const nm = e.name || '一栋楼'; if (!HS.biggest || e.a > HS.biggest.a) HS.biggest = {name:nm, a:e.a}; }
    holeComboAdd(e.k === 'st' ? 3 : 1, e.x, e.z);
    /* streaks of dust pulled into the hole */
    if (!REDUCED){
      const n = e.k === 'st' ? 10 : e.k === 'car' ? 5 : 2;
      for (let i = 0; i < n; i++){
        const ox = e.x + (rnd() - .5) * e.r * 1.5, oz = e.z + (rnd() - .5) * e.r * 1.5;
        spawnPart('dust', ox, .6 + rnd() * e.r * .3, oz, Math.max(.6, e.r * .35), {vx:(h.x - ox) * 1.4, vy:-.4, vz:(h.z - oz) * 1.4, life:.6, op:.75, color:'#c9b8ff'});
      }
    }
  }
  if (e.k === 'st'){
    markGone(e.st);
    const a3 = e.name && e.name.indexOf('A3') === 0;
    if (near){ sfx.thud(fade); sfx.crash(.5 * fade); holeShake((h.you ? 1 : .6) * Math.min(3.5, .9 + e.r * .07) * Math.max(.35, fade)); dustBurst(e.x, 1, e.z, 8, Math.max(3, e.r * .5)); }
    if (h.you){
      if (a3){ holeCallout('A3 百姓大楼 —— 一口吞下！', '图书馆一百多万册书，全进了黑洞', 'gold', 3); holeFlash(); holeShake(3.6); hsfx.a3(); }
      else if (e.name){ holeCallout('吞掉 ' + e.name, HOLE_FLAVOR[e.name] || `黑洞直径 ${(Math.sqrt(holeArea(h) / Math.PI) * 2).toFixed(0)} 米`, '', 2); }
      if (e.name){ h.names.push(e.name); holePop(e.x, 4, e.z, e.name, '#ffffff', true); }
      else holePop(e.x, 3, e.z, '+楼', '#ffffff');
    } else if (e.name){
      if (a3) holeCallout(`A3 被「${h.name}」抢走了`, '快吞别的楼追回来', 'bad', 2);
      else holeFeed(`「${h.name}」吞掉了 ${e.name}`, h.color);
    }
  } else if (e.k === 'car'){
    if (near) sfx.crash(.4 * fade);
    if (h.you){
      const L = HOLE_CAR_LINE[e.c.kind];
      if (L) holeCallout(L[0], L[1], '', 1);
      holePop(e.x, 2.5, e.z, e.name, '#ffffff');
    }
  } else if (h.you && gulpT <= 0){ hsfx.gulp(HCOMBO.n); gulpT = .07; }
  if (e.k === 'npc'){
    e.n.state = 'fall'; e.n.tdx = h.x - e.x; e.n.tdz = h.z - e.z;
    if (h.you && ++HS.npcN % 10 === 0) holePop(e.x, 2, e.z, `第 ${HS.npcN} 个同学`, '#ffe08a');
  }
}
const HOLE_EAT_LINE = {'DDL':['DDL 没了！', '它 3 秒后变小重生——但还会回来'], '早八':['早八取消！', '它 3 秒后变小重生'], '期末周':['期末周提前结束！', '它 3 秒后变小重生']};
function swallowHole(a, b){
  const gain = b.mass * .6 + 60; a.mass += gain; a.score += gain;
  b.alive = false; b.respawn = 3; b.frozen = 0; b.buf.spd = b.buf.mag = b.buf.dbl = 0; holeShowMeshes(b, false);
  dustBurst(b.x, .5, b.z, 10, Math.max(3, b.r));
  a.suck = 1;
  if (a.you){
    const L = HOLE_EAT_LINE[b.name] || [`吞掉了「${b.name}」`, '它 3 秒后会变小重生'];
    holeCallout(L[0], L[1], 'gold', 3); sfx.thud(1); sfx.ding(); holeShake(1.8); holeFlash('rgba(160,120,255,.6)');
    HS.ate.hole++; holePop(b.x, 2, b.z, `+${b.name}`, b.color, true);
  } else if (b.you){
    holeCallout(`被「${a.name}」吞掉了`, '3 秒后复活，体型清零，分数保留', 'bad', 3); sfx.fail(); holeShake(2.2); holeFlash('rgba(255,60,60,.5)');
    HS.died++; HCOMBO.n = 0; HCOMBO.t = 0; HCOMBO.mult = 1;
  } else holeFeed(`「${a.name}」吞掉了「${b.name}」`, a.color);
}
function animFall(e, dt){
  const F = e.fall; F.k = Math.min(1, F.k + dt / F.dur); const k = F.k, pull = Math.min(1, k * 1.4);
  const px = F.x0 + (F.h.x - F.x0) * pull, pz = F.z0 + (F.h.z - F.z0) * pull;
  let dx = F.h.x - F.x0, dz = F.h.z - F.z0; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  if (e.k === 'st'){
    const sink = k * k * 90;
    for (const g of e.st.groups){
      const b = g.userData.base, ry = g.rotation.y, lx = dx * Math.cos(ry) - dz * Math.sin(ry), lz = dx * Math.sin(ry) + dz * Math.cos(ry);
      g.position.set(b.x + (px - F.x0), b.y - sink, b.z + (pz - F.z0)); g.rotation.x = k * 1.1 * lz; g.rotation.z = -k * 1.1 * lx;
      if (k >= 1) g.visible = false;
    }
  } else if (e.k === 'car'){
    const c = e.c; c.root.position.set(px, -k * k * 14, pz); c.root.rotation.x = -k * 1.4; c.root.rotation.y = c.h + k * 3; if (k >= 1) c.root.visible = false;
  } else if (e.k === 'npc'){
    e.n.x = px; e.n.z = pz; e.n.y = -k * k * 6; e.n.tilt = k * 1.4; if (k >= 1) e.n.state = 'gone';
  } else {
    const o = e.set.spots[e.i];
    _p.set(px, -k * k * 10, pz); _q.setFromAxisAngle(UP, o.r + k * 4); _q2.setFromAxisAngle(_ax.set(dz, 0, -dx), k * 1.3); _q.premultiply(_q2);
    _s.setScalar(k >= 1 ? 0 : o.s * (1 - k * .35)); _m4.compose(_p, _q, _s);
    for (const im of e.set.ims){ im.setMatrixAt(e.i, _m4); im.instanceMatrix.needsUpdate = true; }
    if (k >= 1) o.down = true;
  }
  if (k >= 1){ e.gone = true; e.fall = null; }
}

/* ---------- AI: flee bigger holes, hunt smaller ones, grab power-ups, otherwise eat the best nearby thing ---------- */
function holeWander(h, far){
  const B = HOLE_BOUND;
  for (let k = 0; k < 12; k++){
    const x = far ? -420 + rnd() * 840 : h.x + (rnd() - .5) * 320, z = far ? -180 + rnd() * 340 : h.z + (rnd() - .5) * 320;
    if (x < B.x0 + 30 || x > B.x1 - 30 || z < B.z0 + 30 || z > B.z1 - 30 || holeInLake(x, z)) continue;
    h.tx = x; h.tz = z; return;
  }
  h.tx = (rnd() - .5) * 400; h.tz = (rnd() - .5) * 200;
}
function aiHole(h, dt){
  const P = h.p, D = holeDiff(), late = P.late && holeLate(), B = HOLE_BOUND;
  h.force -= dt;
  /* edge push, so a hole never pins itself against the hedge */
  const M = 45; let ex = 0, ez = 0;
  if (h.x < B.x0 + M) ex += (B.x0 + M - h.x) / M; else if (h.x > B.x1 - M) ex -= (h.x - B.x1 + M) / M;
  if (h.z < B.z0 + M) ez += (B.z0 + M - h.z) / M; else if (h.z > B.z1 - M) ez -= (h.z - B.z1 + M) / M;
  /* threats */
  let fx = 0, fz = 0, thr = 0;
  if (h.force <= 0) for (const o of HOLES){
    if (o === h || !o.alive || o.frozen > 0 || o.r <= h.r * P.fear) continue;
    const dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz) || 1, R = o.r + h.r + 20 + 45 * P.flee;
    if (d < R){ const w = (R - d) / R + .2; fx += dx / d * w; fz += dz / d * w; thr += w; }
  }
  if (thr > 0){
    h.goal = null; h.aiT = 0;
    let l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    if (ex || ez){ const tx = -fz * h.side, tz = fx * h.side; fx += ex * 1.8 + tx * .9; fz += ez * 1.8 + tz * .9; }
    l = Math.hypot(fx, fz) || 1; return [fx / l, fz / l];
  }
  h.aiT -= dt;
  if (h.aiT <= 0){
    /* pick a goal; the current one gets a bonus so the hole doesn't dither between two equal choices */
    h.aiT = (.45 + rnd() * .35) * D.react;
    const huntR = P.huntR * D.hunt * (late ? 1.5 : 1) + h.r;
    const danger = HOLES.filter(o => o !== h && o.alive && o.frozen <= 0 && o.r > h.r * P.fear);
    const unsafe = (x, z) => danger.some(o => Math.hypot(o.x - x, o.z - z) < o.r + h.r + 25 + 45 * P.flee);
    let best = null, bk = '', bs = 0;
    const consider = (k, ref, sc) => { if (ref === h.goal) sc *= 1.6; if (sc > bs){ bs = sc; best = ref; bk = k; } };
    for (const o of HOLES){
      if (o === h || !o.alive || h.r <= o.r * P.huntK) continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z); if (d > huntR) continue;
      consider('h', o, 4 * (o.you ? P.youBias : 1) * (o.mass * .6 + 60) * (o.frozen > 0 ? 2 : 1) / (d + 20));
    }
    for (const pu of holePUs){
      if (!pu.on || (pu.kind === 'ice' && !D.freeze)) continue;
      const d = Math.hypot(pu.x - h.x, pu.z - h.z); if (d > 160 || unsafe(pu.x, pu.z)) continue;
      consider('p', pu, Math.max(40, h.area * 1.2) * D.pu / (d + 12));
    }
    for (const e of eats){
      if (e.gone || e.fall || e.r >= h.r * .9) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z); if (d > 170 + h.r) continue;
      const sc = e.a / (d + 12); if (sc * (e === h.goal ? 1.6 : 1) <= bs || unsafe(e.x, e.z)) continue;
      consider('e', e, sc);
    }
    if (best){ h.goal = best; h.goalK = bk; }
    else { if (h.goalK !== 'w' || Math.hypot(h.tx - h.x, h.tz - h.z) < 10) holeWander(h, false); h.goal = null; h.goalK = 'w'; }
  }
  const g = h.goal;
  if (g){
    if (h.goalK === 'h'){
      if (!g.alive || h.r <= g.r * 1.18){ h.goal = null; h.aiT = 0; }
      else { const d = Math.hypot(g.x - h.x, g.z - h.z), lead = Math.min(1.2, d / holeSpeed(h)); h.tx = g.x + g.vx * lead; h.tz = g.z + g.vz * lead; }
    } else if (h.goalK === 'p' ? !g.on : g.gone || g.fall){ h.goal = null; h.aiT = 0; }
    else { h.tx = g.x; h.tz = g.z; }
  }
  h.tx = Math.max(B.x0 + 4, Math.min(B.x1 - 4, h.tx)); h.tz = Math.max(B.z0 + 4, Math.min(B.z1 - 4, h.tz));
  let dx = h.tx - h.x, dz = h.tz - h.z; const d = Math.hypot(dx, dz);
  if (d < 1) return [0, 0];
  dx /= d; dz /= d;
  if (h.force <= 0){ dx += ex * .6; dz += ez * .6; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
  return [dx, dz];
}
/* fallback: a hole that has neither moved nor eaten for 2 s (and isn't frozen) heads for open ground */
function holeUnstick(h, dt){
  if (h.frozen > 0){ h.chk = 2; h.cx0 = h.x; h.cz0 = h.z; return; }
  h.chk -= dt; if (h.chk > 0) return;
  h.chk = 2;
  if (Math.hypot(h.x - h.cx0, h.z - h.cz0) < 4 && h.eatN === h.eatN0){ h.stuck++; h.goal = null; h.goalK = 'w'; holeWander(h, true); h.force = 1.6; h.aiT = 1.6; }
  h.cx0 = h.x; h.cz0 = h.z; h.eatN0 = h.eatN;
}

const hstat = $('#hstat');
function holeHudBuffs(){
  const h = hole, parts = [];
  if (!h.alive) parts.push('<span class="dead">复活 ' + Math.ceil(h.respawn) + '</span>');
  if (h.frozen > 0) parts.push(`<span class="pu-ice">冻住 ${Math.ceil(h.frozen)}</span>`);
  for (const k of ['spd', 'mag', 'dbl']) if (h.buf[k] > 0) parts.push(`<span class="pu-${k}">${HOLE_PU[k].name} ${Math.ceil(h.buf[k])}</span>`);
  if (HOLES.some(o => !o.you && o.frozen > 0)) parts.push(`<span class="pu-ice">对手冻住 ${Math.ceil(Math.max(...HOLES.filter(o => !o.you).map(o => o.frozen)))}</span>`);
  const s = parts.join('');
  if (s !== HH.buffHTML){ HH.buffHTML = s; HH.buffs.innerHTML = s; }
  const c = HCOMBO.n >= 2 ? `连吞 <b>${HCOMBO.n}</b>${HCOMBO.mult > 1 ? `<small>成长 ×${HCOMBO.mult}</small>` : ''}` : '';
  if (c !== HH.comboHTML){ HH.comboHTML = c; HH.combo.innerHTML = c; HH.combo.hidden = !c; HH.combo.classList.toggle('hot', HCOMBO.mult >= 2); }
}
function updateHole(dt, T){
  gulpT -= dt;
  /* 3-2-1 countdown: nothing moves yet */
  if (HS.on && HS.cd > 0){
    HS.cd -= dt; const n = Math.ceil(HS.cd);
    if (HS.cd <= 0){ HS.cd = 0; HH.cd.hidden = true; hsfx.beep(true); holeCallout('开始！', `难度 ${holeDiff().name} · 150 秒`, 'go', 2); }
    else if (n !== HS.cdN){ HS.cdN = n; HH.cdN.textContent = n; HH.cdN.classList.remove('pop'); void HH.cdN.offsetWidth; HH.cdN.classList.add('pop'); hsfx.beep(false); }
  }
  const live = holeLive();
  if (live){
    const before = HS.t; HS.t -= dt;
    if (HS.t <= 10 && before > 10){ holeCallout('最后 10 秒！', '能吞多少吞多少', 'bad', 2); $('#htime').classList.add('hurry'); HH.cd.classList.add('late'); }
    if (HS.t < 60 && before >= 60){ const q = HOLES.find(h => h.p.late); if (q) holeFeed(`「${q.name}」进入冲刺：越吃越快`, q.color); }
    if (HS.t < 10 && HS.t > 0){
      const step = HS.t < 5 ? .5 : 1, k = Math.ceil(HS.t / step);
      if (k !== HS.tick){ HS.tick = k; hsfx.tick(HS.t < 3); }
      if (!HH.cd.classList.contains('late')){ HH.cd.classList.add('late'); $('#htime').classList.add('hurry'); }
      if (HS.t <= 5){ const n = Math.ceil(HS.t); if (HH.cdN.textContent !== String(n)){ HH.cdN.textContent = n; HH.cd.hidden = false; HH.cdN.classList.remove('pop'); void HH.cdN.offsetWidth; HH.cdN.classList.add('pop'); } }
    }
    if (HS.t <= 0){ HS.t = 0; endHole(); }
  }
  if (live && HCOMBO.n > 0){ HCOMBO.t -= dt; if (HCOMBO.t <= 0){ if (HCOMBO.n >= 8) holeFeed(`连吞 ${HCOMBO.n} 个`, '#ffd34d'); HCOMBO.n = 0; HCOMBO.mult = 1; } }
  for (const h of HOLES){
    if (!h.alive){
      h.respawn -= dt;
      if (h.respawn <= 0 && HS.on){ holeResetHole(h); placeHole(h); h.cx0 = h.x; h.cz0 = h.z; holeShowMeshes(h, true); if (h.you) holeCallout('重新出发', '先吃小东西，躲开比你大的黑洞', '', 2); }
      continue;
    }
    if (live){
      h.frozen = Math.max(0, h.frozen - dt);
      for (const k in h.buf) h.buf[k] = Math.max(0, h.buf[k] - dt);
      let mx = 0, mz = 0;
      if (h.you){
        const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
        const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
        const l = Math.hypot(f, r);
        if (l > .08){ const sn = Math.sin(camYaw), cs = Math.cos(camYaw), k = Math.min(1, l) / l; mx = (-sn * f + cs * r) * k; mz = (-cs * f - sn * r) * k; }
      } else { [mx, mz] = aiHole(h, dt); holeUnstick(h, dt); }
      if (h.frozen > 0) mx = mz = 0;
      const v = holeSpeed(h) * dt, x0 = h.x, z0 = h.z, B = HOLE_BOUND;
      h.x = Math.max(B.x0, Math.min(B.x1, h.x + mx * v)); h.z = Math.max(B.z0, Math.min(B.z1, h.z + mz * v));
      h.vx = (h.x - x0) / Math.max(dt, 1e-4); h.vz = (h.z - z0) / Math.max(dt, 1e-4);
    } else h.vx = h.vz = 0;
    h.area += (holeArea(h) - h.area) * Math.min(1, dt * 3); h.r = Math.sqrt(h.area / Math.PI);
    h.suck = Math.max(0, h.suck - dt * 1.4);
    h.m.position.set(h.x, .17, h.z); h.m.scale.setScalar(h.r); h.m.rotation.z = T * 1.5;
    h.rim.position.set(h.x, .19, h.z); h.rim.scale.setScalar(h.r);
    const rc = h.frozen > 0 ? '#9fe3ff' : h.buf.dbl > 0 ? HOLE_PU.dbl.color : h.buf.spd > 0 ? HOLE_PU.spd.color : h.buf.mag > 0 ? HOLE_PU.mag.color : h.color;
    h.rim.material.color.set(rc); h.rim.material.opacity = (rc !== h.color ? .8 : .45) + Math.sin(T * (rc !== h.color ? 9 : 4)) * .15;
    const fx = h.fx;
    fx.swirl.position.set(h.x, .2, h.z); fx.swirl.scale.setScalar(h.r); fx.swirl.rotation.z += dt * (h.frozen > 0 ? 0 : 1.6 + h.suck * 5);
    fx.swirl.material.opacity = h.frozen > 0 ? .08 : .22 + h.suck * .55;
    fx.ice.visible = h.frozen > 0; if (fx.ice.visible){ fx.ice.position.set(h.x, .23, h.z); fx.ice.scale.setScalar(h.r); fx.ice.material.opacity = .45 + Math.min(1, h.frozen) * .2; }
    fx.aura.visible = h.buf.mag > 0; if (fx.aura.visible){ fx.aura.position.set(h.x, .22, h.z); fx.aura.scale.setScalar(h.r + holeMagR(h) * (1 - (T * 1.4 % 1))); fx.aura.material.opacity = .25 + .5 * (T * 1.4 % 1); }
    h.L.pos.set(h.x, 2 + h.r * .15, h.z - h.r);
  }
  holeUpdatePUs(dt, T, live);
  for (const e of eats){
    if (e.gone || e.fall) continue;
    if (e.k === 'car'){ e.x = e.c.x; e.z = e.c.z; } else if (e.k === 'npc'){ if (e.n.state !== 'walk') continue; e.x = e.n.x; e.z = e.n.z; }
    for (const h of HOLES){
      if (!h.alive) continue;
      const mag = h.buf.mag > 0 && live && h.frozen <= 0 ? holeMagR(h) : 0;
      const dx = e.x - h.x, dz = e.z - h.z, reach = h.r + e.r + mag;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const d = Math.hypot(dx, dz);
      if (live && h.frozen <= 0 && e.r < h.r * .92 && (d < h.r - e.r * .15 || (mag > 0 && d < h.r + mag * (e.k === 'st' ? .4 : 1)))){ startFall(e, h); break; }
      else if (d < h.r + e.r * .4 && e.k === 'st') e.st.shake = .2;
    }
  }
  if (live) for (const a of HOLES) for (const b of HOLES){
    if (a === b || !a.alive || !b.alive || a.frozen > 0) continue;
    if (a.r > b.r * 1.18 && Math.hypot(a.x - b.x, a.z - b.z) < a.r - b.r * .4) swallowHole(a, b);
  }
  for (let i = falling.length - 1; i >= 0; i--){ const e = falling[i]; animFall(e, dt); if (!e.fall) falling.splice(i, 1); }
  for (const st of structures){
    if (st.shake > 0 && !st.gone){
      st.shake -= dt;
      for (const g of st.groups){ const b = g.userData.base; if (st.shake > 0) g.position.set(b.x + (rnd() - .5) * .5, b.y, b.z + (rnd() - .5) * .5); else g.position.copy(b); }
    }
  }
  /* camera: zoom eases out as the hole grows, and leads a little in the direction of travel */
  const wantD = 30 + hole.r * 3.6 + (hole.buf.spd > 0 ? 8 : 0);
  HS.camD += (wantD - HS.camD) * (1 - Math.exp(-dt * 1.8));
  const lk = 1 - Math.exp(-dt * 2.5);
  HS.lx += (hole.vx * .45 - HS.lx) * lk; HS.lz += (hole.vz * .45 - HS.lz) * lk;
  const dist = HS.camD, pitch = 1.18, cxp = hole.x + HS.lx, czp = hole.z + HS.lz;
  camPos.set(cxp + Math.sin(camYaw) * dist * Math.cos(pitch), dist * Math.sin(pitch), czp + Math.cos(camYaw) * dist * Math.cos(pitch));
  if (camShake > .01){ camPos.x += (rnd() - .5) * camShake; camPos.z += (rnd() - .5) * camShake; camPos.y += (rnd() - .5) * camShake * .5; camShake *= Math.exp(-dt * 6); }
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 8)); camLook.set(cxp, 0, czp); camera.lookAt(camLook);
  fitShadow(Math.round(hole.x / 20) * 20, Math.round(hole.z / 20) * 20, Math.min(400, 140 + hole.r * 4));
  const tt = Math.ceil(HS.t);
  $('#htime').textContent = Math.floor(tt / 60) + ':' + String(tt % 60).padStart(2, '0');
  $('#htime').style.color = HS.on && HS.t < 15 ? 'var(--tile)' : '';
  $('#hsize').textContent = (hole.r * 2).toFixed(1) + ' 米';
  $('#hpct').textContent = (hole.score / HS.total * 100).toFixed(1) + '%';
  if (HS.on) holeHudBuffs();
  if (T > HS.nextT){
    HS.nextT = T + .4;
    const rk = ranked(), place = rk.indexOf(hole) + 1;
    $('#hrank').textContent = place + ' / ' + HOLES.length;
    if (live && HS.t < HOLE_TIME - 5 && place !== HS.place){
      if (place < HS.place) holeFeed(place === 1 ? '你升到第 1 名' : `你升到第 ${place} 名`, hole.color);
      else holeFeed(`被「${rk[place - 2].name}」超过了，掉到第 ${place} 名`, rk[place - 2].color);
      if (place === 1) tone('triangle', 880, 1320, .2, .08);
    }
    HS.place = place;
    $('#hlist').innerHTML = rk.map(h => `<div class="${h.you ? 'me' : ''} ${h.alive ? '' : 'out'}"><i style="background:${h.color}"></i><span>${h.name}</span>${(h.score / HS.total * 100).toFixed(1)}%</div>`).join('');
    HOLES.forEach(h => {
      const tag = !h.alive ? '' : h.frozen > 0 ? ' · 冻住' : h.buf.spd > 0 ? ' · 加速' : h.buf.dbl > 0 ? ' · 双倍' : h.buf.mag > 0 ? ' · 磁铁' : (h.p.late && holeLate() && HS.on) ? ' · 冲刺' : '';
      const t = `${h.name} · ${Math.round(h.r * 2)}米${tag}`; if (h.L.el.textContent !== t) h.L.el.textContent = t;
    });
    let best = null; for (const e of eats) if (e.k === 'st' && !e.gone && !e.fall && e.name && e.r >= hole.r * .92 && (!best || e.r < best.r)) best = e;
    const danger = HOLES.find(o => !o.you && o.alive && o.frozen <= 0 && o.r > hole.r * 1.18 && Math.hypot(o.x - hole.x, o.z - hole.z) < o.r + 50);
    let pu = null, pd = 95; for (const p of holePUs) if (p.on){ const d = Math.hypot(p.x - hole.x, p.z - hole.z); if (d < pd){ pd = d; pu = p; } }
    $('#hnext').textContent = !hole.alive ? '复活中…' : hole.frozen > 0 ? '被冻住了，等一下' : danger ? `小心！「${danger.name}」比你大，快跑` : pu ? `附近有「${HOLE_PU[pu.kind].name}」道具，找发光的柱子` : best ? `长到直径 ${Math.ceil(best.r / .92 * 2)} 米就能吞下 ${best.name}` : '全校都能吞了，冲';
    $('#hnext').classList.toggle('urgent', !!danger || hole.frozen > 0);
    const msg = TOUCH ? '' : 'WASD 移动 · 拖动鼠标转视角 · 捡发光道具 · 比你大的黑洞会吞掉你';
    if (promptEl.textContent !== msg) promptEl.textContent = msg;
    promptEl.hidden = !msg;
  }
}
/* minimap overlay: power-ups as coloured dots (called from drawMini in 90-main.js) */
function holeMiniPUs(mg, X, Z){
  for (const pu of holePUs){
    if (!pu.on) continue;
    const px = Math.max(7, Math.min(mini.width - 7, X(pu.x))), pz = Math.max(7, Math.min(mini.height - 7, Z(pu.z)));
    mg.fillStyle = HOLE_PU[pu.kind].color; mg.strokeStyle = '#120a22'; mg.lineWidth = 2.5;
    mg.beginPath(); mg.moveTo(px, pz - 8); mg.lineTo(px + 7, pz); mg.lineTo(px, pz + 8); mg.lineTo(px - 7, pz); mg.closePath(); mg.fill(); mg.stroke();
  }
}
