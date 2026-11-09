/* XMUM 校园漫游 · 黑洞模式（含三个 AI 对手） */
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
function makeHoleMeshes(color){
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({map:holeTex, polygonOffset:true, polygonOffsetFactor:-20, polygonOffsetUnits:-80, fog:false}));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.6, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  r.rotation.x = -Math.PI / 2; r.visible = false; scene.add(r);
  return [m, r];
}
const HOLE_TIME = 150;
const HOLES = [{name:'你', you:true, color:'#8a6bff'}, {name:'DDL', color:'#ff4d4d'}, {name:'早八', color:'#3fa9ff'}, {name:'期末周', color:'#3fdc7c'}].map(h => {
  const [m, rim] = makeHoleMeshes(h.color); const L = addLabel(h.name, 0, 0, 0, false); L.dead = true; L.hole = true; L.el.style.borderColor = h.color;
  return Object.assign(h, {m, rim, L, x:0, z:0, r:2.5, area:0, mass:0, score:0, alive:true, respawn:0, aiT:0, tx:0, tz:0, names:[]});
});
const hole = HOLES[0];
const HS = {on:false, t:0, total:1, nextT:0};
const eats = [], falling = [];
let gulpT = 0;
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
  for (let k = 0; k < 60; k++){
    const x = -520 + rnd() * 1040, z = -240 + rnd() * 470;
    if (HOLES.some(o => o !== h && o.alive && Math.hypot(o.x - x, o.z - z) < 140 + o.r)) continue;
    h.x = x; h.z = z; return;
  }
}
function startHole(){
  resetWorld(); buildEats();
  HS.total = eats.reduce((a, e) => a + e.a, 0); HS.on = true; HS.t = HOLE_TIME; HS.nextT = 0;
  HOLES.forEach(h => {
    Object.assign(h, {mass:0, score:0, alive:true, respawn:0, names:[], aiT:0}); h.area = Math.PI * 6.25; h.r = 2.5;
    if (h.you){ h.x = 110; h.z = 204; } else placeHole(h);
    h.m.visible = h.rim.visible = true; h.L.dead = false;
  });
  $('#hend').hidden = true; camYaw = 0;
  toast('黑洞出现了', '跟 DDL、早八、期末周抢地盘：吞掉比你小的东西和黑洞', 3000);
}
function stopHole(){
  HS.on = false; HOLES.forEach(h => { h.m.visible = h.rim.visible = false; h.L.dead = true; });
  $('#hend').hidden = true; resetWorld();
}
const ranked = () => HOLES.slice().sort((a, b) => b.score - a.score);
function endHole(){
  HS.on = false;
  const pct = hole.score / HS.total * 100, rk = ranked(), place = rk.indexOf(hole) + 1;
  let best = 0; try { best = +localStorage.getItem('xmum-hole-best') || 0; if (pct > best) localStorage.setItem('xmum-hole-best', pct.toFixed(1)); } catch(e){}
  $('#hendT').textContent = place === 1 ? `第 1 名！吞掉了 XMUM 的 ${pct.toFixed(1)}%` : `第 ${place} 名 · 吞掉了 ${pct.toFixed(1)}%`;
  const names = hole.names.filter((v, i, a) => a.indexOf(v) === i);
  $('#hendS').textContent = '排名：' + rk.map((h, i) => `${i + 1}. ${h.name} ${(h.score / HS.total * 100).toFixed(1)}%`).join('　') + '。'
    + (names.length ? ` 你吞下了 ${names.slice(0, 6).join('、')}${names.length > 6 ? ' 等 ' + names.length + ' 处' : ''}。` : '')
    + (best ? ` 之前最好 ${best.toFixed(1)}%。` : '');
  $('#hend').hidden = false; place === 1 ? sfx.ding() : sfx.fail();
}
$('#hagain').addEventListener('click', () => startHole());
$('#hquit').addEventListener('click', () => setMode('naiwa'));
function markGone(st){ st.gone = true; st.cols.forEach(c => c.dead = true); st.fps.forEach(f => f.dead = true); st.lbls.forEach(L => L.dead = true); }
function startFall(e, h){
  e.fall = {k:0, dur:e.k === 'st' ? 1.6 : e.k === 'car' ? 1 : .6, x0:e.x, z0:e.z, h};
  falling.push(e); h.mass += e.a; h.score += e.a;
  const near = Math.hypot(e.x - hole.x, e.z - hole.z) < 220;
  if (e.k === 'st'){
    markGone(e.st);
    if (near){ sfx.thud(1); sfx.crash(.5); camShake = h.you ? 1.5 : .6; }
    if (e.name){
      if (h.you){ h.names.push(e.name); toast('吞掉 ' + e.name, `黑洞直径 ${(Math.sqrt(holeArea(h) / Math.PI) * 2).toFixed(0)} 米`, 1600); }
      else toast(`「${h.name}」吞掉了 ${e.name}`, '快抢别的楼', 1400);
    }
  } else if (e.k === 'car'){ if (near) sfx.crash(.4); }
  else if (h.you && gulpT <= 0){ tone('sine', 320, 90, .14, .1); gulpT = .07; }
  if (e.k === 'npc'){ e.n.state = 'fall'; e.n.tdx = h.x - e.x; e.n.tdz = h.z - e.z; }
}
function swallowHole(a, b){
  const gain = b.mass * .6 + 60; a.mass += gain; a.score += gain;
  b.alive = false; b.respawn = 3; b.m.visible = b.rim.visible = false; b.L.dead = true;
  dustBurst(b.x, .5, b.z, 10, Math.max(3, b.r));
  if (a.you){ toast(`吞掉了「${b.name}」`, `它 3 秒后会变小重生`, 1800); sfx.thud(1); sfx.ding(); camShake = 1.5; }
  else if (b.you){ toast(`你被「${a.name}」吞掉了`, '3 秒后复活，体型清零，分数保留', 2600); sfx.fail(); camShake = 2; }
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
    const c = e.c; c.root.position.set(px, -k * k * 14, pz); c.root.rotation.x = -k * 1.4; if (k >= 1) c.root.visible = false;
  } else if (e.k === 'npc'){
    e.n.x = px; e.n.z = pz; e.n.y = -k * k * 6; e.n.tilt = k * 1.4; if (k >= 1) e.n.state = 'gone';
  } else {
    const o = e.set.spots[e.i];
    _p.set(px, -k * k * 10, pz); _q.setFromAxisAngle(UP, o.r); _q2.setFromAxisAngle(_ax.set(dz, 0, -dx), k * 1.3); _q.premultiply(_q2);
    _s.setScalar(k >= 1 ? 0 : o.s * (1 - k * .35)); _m4.compose(_p, _q, _s);
    for (const im of e.set.ims){ im.setMatrixAt(e.i, _m4); im.instanceMatrix.needsUpdate = true; }
    if (k >= 1) o.down = true;
  }
  if (k >= 1){ e.gone = true; e.fall = null; }
}
function aiHole(h, dt){
  let fx = 0, fz = 0, threat = false;
  for (const o of HOLES){
    if (o === h || !o.alive) continue;
    const dx = h.x - o.x, dz = h.z - o.z, d = Math.hypot(dx, dz) || 1;
    if (o.r > h.r * 1.15 && d < o.r + 40){ fx += dx / d; fz += dz / d; threat = true; }
    else if (h.r > o.r * 1.25 && d < 80){ h.tx = o.x; h.tz = o.z; h.aiT = .25; }
  }
  if (threat){ const l = Math.hypot(fx, fz) || 1; return [fx / l, fz / l]; }
  h.aiT -= dt;
  if (h.aiT <= 0){
    h.aiT = .7 + rnd() * .5; let best = null, bs = 0;
    for (const e of eats){
      if (e.gone || e.fall || e.r >= h.r * .9) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z); if (d > 170) continue;
      const sc = e.a / (d + 12); if (sc > bs){ bs = sc; best = e; }
    }
    if (best){ h.tx = best.x; h.tz = best.z; }
    else { h.tx = Math.max(-560, Math.min(560, h.x + (rnd() - .5) * 260)); h.tz = Math.max(-250, Math.min(240, h.z + (rnd() - .5) * 260)); }
  }
  const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
  return d < 1 ? [0, 0] : [dx / d, dz / d];
}
const hstat = $('#hstat');
function updateHole(dt, T){
  gulpT -= dt;
  if (HS.on){ HS.t -= dt; if (HS.t <= 0){ HS.t = 0; endHole(); } }
  for (const h of HOLES){
    if (!h.alive){
      h.respawn -= dt;
      if (h.respawn <= 0 && HS.on){ h.alive = true; h.mass = 0; h.area = Math.PI * 6.25; h.r = 2.5; placeHole(h); h.m.visible = h.rim.visible = true; h.L.dead = false; if (h.you) toast('重新出发', '先吃小东西，躲开比你大的黑洞'); }
      continue;
    }
    if (HS.on){
      let mx = 0, mz = 0;
      if (h.you){
        const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
        const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
        const l = Math.hypot(f, r);
        if (l > .08){ const sn = Math.sin(camYaw), cs = Math.cos(camYaw), k = Math.min(1, l) / l; mx = (-sn * f + cs * r) * k; mz = (-cs * f - sn * r) * k; }
      } else [mx, mz] = aiHole(h, dt);
      const v = (10 + h.r * .5) * (h.you ? 1 : .86) * dt;
      h.x = Math.max(-595, Math.min(595, h.x + mx * v)); h.z = Math.max(-270, Math.min(258, h.z + mz * v));
    }
    h.area += (holeArea(h) - h.area) * Math.min(1, dt * 3); h.r = Math.sqrt(h.area / Math.PI);
    h.m.position.set(h.x, .17, h.z); h.m.scale.setScalar(h.r); h.m.rotation.z = T * 1.5;
    h.rim.position.set(h.x, .19, h.z); h.rim.scale.setScalar(h.r); h.rim.material.opacity = .45 + Math.sin(T * 4) * .15;
    h.L.pos.set(h.x, 2 + h.r * .15, h.z - h.r);
  }
  for (const e of eats){
    if (e.gone || e.fall) continue;
    if (e.k === 'car'){ e.x = e.c.x; e.z = e.c.z; } else if (e.k === 'npc'){ if (e.n.state !== 'walk') continue; e.x = e.n.x; e.z = e.n.z; }
    for (const h of HOLES){
      if (!h.alive) continue;
      const dx = e.x - h.x, dz = e.z - h.z;
      if (Math.abs(dx) > h.r + e.r || Math.abs(dz) > h.r + e.r) continue;
      const d = Math.hypot(dx, dz);
      if (d < h.r + e.r * .4){
        if (HS.on && e.r < h.r * .92 && d < h.r - e.r * .15){ startFall(e, h); break; }
        else if (e.k === 'st') e.st.shake = .2;
      }
    }
  }
  if (HS.on) for (const a of HOLES) for (const b of HOLES){
    if (a === b || !a.alive || !b.alive) continue;
    if (a.r > b.r * 1.18 && Math.hypot(a.x - b.x, a.z - b.z) < a.r - b.r * .4) swallowHole(a, b);
  }
  for (let i = falling.length - 1; i >= 0; i--){ const e = falling[i]; animFall(e, dt); if (!e.fall) falling.splice(i, 1); }
  for (const st of structures){
    if (st.shake > 0 && !st.gone){
      st.shake -= dt;
      for (const g of st.groups){ const b = g.userData.base; if (st.shake > 0) g.position.set(b.x + (rnd() - .5) * .5, b.y, b.z + (rnd() - .5) * .5); else g.position.copy(b); }
    }
  }
  const dist = 30 + hole.r * 3.6, pitch = 1.18;
  camPos.set(hole.x + Math.sin(camYaw) * dist * Math.cos(pitch), dist * Math.sin(pitch), hole.z + Math.cos(camYaw) * dist * Math.cos(pitch));
  if (camShake > .01){ camPos.x += (rnd() - .5) * camShake; camPos.z += (rnd() - .5) * camShake; camShake *= Math.exp(-dt * 6); }
  camera.position.lerp(camPos, 1 - Math.exp(-dt * 8)); camLook.set(hole.x, 0, hole.z); camera.lookAt(camLook);
  fitShadow(Math.round(hole.x / 20) * 20, Math.round(hole.z / 20) * 20, Math.min(400, 140 + hole.r * 4));
  const tt = Math.ceil(HS.t);
  $('#htime').textContent = Math.floor(tt / 60) + ':' + String(tt % 60).padStart(2, '0');
  $('#htime').style.color = HS.on && HS.t < 15 ? 'var(--tile)' : '';
  $('#hsize').textContent = (hole.r * 2).toFixed(1) + ' 米';
  $('#hpct').textContent = (hole.score / HS.total * 100).toFixed(1) + '%';
  if (T > HS.nextT){
    HS.nextT = T + .4;
    const rk = ranked();
    $('#hrank').textContent = (rk.indexOf(hole) + 1) + ' / ' + HOLES.length;
    $('#hlist').innerHTML = rk.map(h => `<div class="${h.you ? 'me' : ''} ${h.alive ? '' : 'out'}"><i style="background:${h.color}"></i><span>${h.name}</span>${(h.score / HS.total * 100).toFixed(1)}%</div>`).join('');
    HOLES.forEach(h => { const t = `${h.name} · ${Math.round(h.r * 2)}米`; if (h.L.el.textContent !== t) h.L.el.textContent = t; });
    let best = null; for (const e of eats) if (e.k === 'st' && !e.gone && !e.fall && e.name && e.r >= hole.r * .92 && (!best || e.r < best.r)) best = e;
    const danger = HOLES.find(o => !o.you && o.alive && o.r > hole.r * 1.18 && Math.hypot(o.x - hole.x, o.z - hole.z) < o.r + 50);
    $('#hnext').textContent = !hole.alive ? '复活中…' : danger ? `小心！「${danger.name}」比你大，快跑` : best ? `长到直径 ${Math.ceil(best.r / .92 * 2)} 米就能吞下 ${best.name}` : '全校都能吞了，冲';
    $('#hnext').classList.toggle('urgent', !!danger);
    const msg = TOUCH ? '摇杆移动黑洞 · 拖动屏幕转视角' : 'WASD 移动 · 拖动鼠标转视角 · 比你大的黑洞会吞掉你';
    if (promptEl.textContent !== msg) promptEl.textContent = msg;
  }
}
