/* XMUM 校园漫游 · 奶娃玩法：环湖赛、早八冲刺、田径场漂移、飞跃挑战、顺风车、擦车与慢动作、暂停战绩 */
'use strict';
/* ---------- glowing start rings and checkpoint gates ---------- */
const gxRingGeo = new THREE.CylinderGeometry(6, 6, 3.4, 48, 1, true); gxRingGeo.translate(0, 1.7, 0);
const gxGlow = (color, op) => new THREE.MeshBasicMaterial({color, transparent:true, opacity:op, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending});
function gxMarker(color, s){
  const g = new THREE.Group(), ring = new THREE.Mesh(gxRingGeo, gxGlow(color, .5)), beam = new THREE.Mesh(beamGeo, gxGlow(color, .22));
  beam.scale.set(1.6, 1, 1.6); g.add(ring, beam); g.scale.setScalar(s || 1); g.visible = false; scene.add(g); g.userData.ring = ring; return g;
}
const gxPx = arr => arr.map(p => P(p[0], p[1]));
const GX_MEDAL = ['金牌', '银牌', '铜牌'];
const GX_MORE = [];   /* extra records for the pause panel: {id, name, fmt} (js/87-classroom.js adds 抢救期末卷) */
/* par times come from an autopilot run: a stock sedan lands around bronze/silver, a tuned sports car can take gold */
const GX_ACTS = [
  {id:'lake', type:'race', name:'环湖赛', color:'#4aa3ff', start:P(1180, 508),
    cps:gxPx([[1400, 516], [1580, 520], [1580, 340], [1420, 262], [1250, 262], [1000, 258], [1010, 335], [1100, 352], [1140, 420], [1180, 508]]),
    medal:[40, 50, 62], limit:90, pay:[70, 45, 25], intro:'绕两片湖跑一圈，按顺序穿过蓝圈'},
  {id:'early8', type:'race', name:'早八冲刺', color:'#4aa3ff', start:P(900, 262), cps:gxPx([[1180, 680]]), clock:true,
    medal:[36, 44, 52], limit:60, pay:[60, 40, 25], intro:'07:59 从 LY 宿舍出发，08:00 前冲到 A3，路线自己找'},
  {id:'drift', type:'drift', name:'田径场漂移', color:'#c46bff', start:[FIELD.x - 30, FIELD.z], dur:40,
    medal:[4500, 3000, 1500], pay:[70, 45, 25], intro:'40 秒内在田径场里漂移攒分，按住空格甩尾'},
  {id:'jump', type:'jump', name:'飞跃挑战', color:'#ffc93c', start:[150, 190], dur:60,
    medal:[55, 40, 25], pay:[60, 40, 20], intro:'60 秒内冲任意黄色跳台，飞得最远的一跳算成绩'}
];
for (const a of GX_ACTS){ a.mark = gxMarker(a.color, 1); a.mark.position.set(a.start[0], .1, a.start[1]); a.lbl = addLabel(a.name, a.start[0], 7.5, a.start[1], true); }
const gxCp = gxMarker('#4aa3ff', 1.35), gxCpNext = gxMarker('#4aa3ff', .8), gxFinishMat = gxGlow('#ffffff', .6);
gxCpNext.userData.ring.material.opacity = .22; gxCpNext.children[1].material.opacity = .08;
const gxCpMat = gxCp.userData.ring.material;
const gxFmt = t => Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
const gxScoreTxt = (a, v) => a.type === 'race' ? gxFmt(v) : a.type === 'drift' ? Math.round(v).toLocaleString() + ' 分' : Math.round(v) + ' 米';

/* ---------- state ---------- */
const gxA = {act:null, phase:'', t:0, cd:0, cp:0, score:0, rearm:null, beep:0};
const gxTaxi = {pk:null, on:false, to:null, t:0, limit:0, rating:5, type:null, dist:0, spawnCd:3, quipT:0, driftT:0, say:'', sayT:0};
let gxAirCar = null, gxJumpFrom = null, gxSlow = 0, gxTS = 1, gxPromptMsg = '';

/* ---------- big stamped callouts ---------- */
const gxCallEl = $('#gxcall'); let gxCallTimer = 0;
function gxCallout(text, sub, color){
  if (!gxCallEl) return;
  gxCallEl.innerHTML = ''; gxCallEl.append(text); if (sub){ const s = document.createElement('small'); s.textContent = sub; gxCallEl.append(s); }
  gxCallEl.style.setProperty('--gx-c', color || '#ff8a3d');
  gxCallEl.hidden = false; gxCallEl.classList.remove('pop'); void gxCallEl.offsetWidth; gxCallEl.classList.add('pop');
  clearTimeout(gxCallTimer); gxCallTimer = setTimeout(() => { gxCallEl.hidden = true; }, 1300);
}
const gxBeep = (f, d, v) => tone('square', f, f, d || .12, v || .09);
const gxChime = n => { for (let i = 0; i < 3; i++) tone('triangle', 660 * Math.pow(1.26, i + n * .5), 660 * Math.pow(1.26, i + n * .5), .14, .12, i * .06); };

/* ---------- ride-hailing passenger: a student waving at the roadside ---------- */
const gxPaxFig = (() => {
  const g = new THREE.Group();
  if (typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcGearGeo !== 'undefined'){
    g.add(new THREE.Mesh(npcBodyGeo, M('#3fd6c6', {roughness:.8})), new THREE.Mesh(npcHeadGeo, M('#e8b98f', {roughness:.7})),
      new THREE.Mesh(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true})));
  } else g.add(box(.5, 1.7, .3, M('#3fd6c6'), 0, .85, 0));
  g.children.forEach(m => { m.castShadow = true; }); g.scale.setScalar(1.2); g.visible = false; scene.add(g); return g;
})();
const gxPaxMark = gxMarker('#3fd6c6', .75), gxPaxLbl = addLabel('顺风车 · 招手', 0, 6, 0, true); gxPaxLbl.dead = true;
const gxDestMark = gxMarker('#3fd6c6', 1.1);
const GX_PAX = [
  {k:'hurry', name:'赶课的同学', hello:'快快快，要迟到了！', rate:5},
  {k:'sick',  name:'晕车的同学', hello:'开稳一点……我有点晕车', rate:5},
  {k:'vlog',  name:'拍视频的同学', hello:'来点刺激的，我在直播！', rate:4}
];
function gxPaxSpot(px, pz){
  for (let k = 0; k < 60; k++){
    const sg = roadSegs[(rnd() * roadSegs.length) | 0], t = rnd();
    const x = sg.a[0] + (sg.b[0] - sg.a[0]) * t, z = sg.a[1] + (sg.b[1] - sg.a[1]) * t, d = Math.hypot(x - px, z - pz);
    if (d < 70 || d > 230 || Math.abs(x) > 585 || z < -265 || z > 210) continue;
    if (hitsBuilding(x, z, 4) || lakes.some(L => inPoly(x, z, L))) continue;
    if (PICKUPS.some(p => Math.hypot(p.x - x, p.z - z) < 25) || GX_ACTS.some(a => Math.hypot(a.start[0] - x, a.start[1] - z) < 25)) continue;
    return [x, z];
  }
  return null;
}
/* quips wait a beat so the crash / stunt toast they react to is read first */
function gxQuip(text){ if (gxTaxi.quipT > 0 || gxTaxi.say) return; gxTaxi.say = text; gxTaxi.sayT = .9; }
const gxStarsTxt = () => { const r = gxTaxi.rating; return '评价 ' + '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(r)); };
function gxRate(d, quip){ if (!gxTaxi.on) return; gxTaxi.rating = Math.max(1, Math.min(5, gxTaxi.rating + d)); gxTaxi.quipT = 0; gxQuip(quip); }
function gxTaxiEnd(ok, title, sub){
  gxTaxi.on = false; gxTaxi.pk = null; gxTaxi.ask = null; gxTaxi.spawnCd = 6; gxDestMark.visible = false;
  if (!ok){ sfx.fail(); toast(title, sub, 2600); }
}
function gxUpdateTaxi(dt, px, pz, sp){
  const T = gxTaxi; T.quipT -= dt;
  if (T.say){ T.sayT -= dt; if (T.sayT <= 0){ if (T.on) toast(T.type.name + '：' + T.say, gxStarsTxt(), 1900); T.say = ''; T.quipT = 2.5; } }
  const blocked2 = mission.on || gxA.act || gx.extBusy();
  if (!T.on){
    gxDestMark.visible = false;
    if (!T.pk){
      T.spawnCd -= dt; gxPaxFig.visible = gxPaxMark.visible = false; gxPaxLbl.dead = true;
      if (T.spawnCd <= 0){ T.spawnCd = 4; const s = gxPaxSpot(px, pz); if (s){ T.pk = s; T.ask = null; T.type = GX_PAX[(rnd() * GX_PAX.length) | 0]; } }
      return;
    }
    const [x, z] = T.pk, d = Math.hypot(px - x, pz - z);
    if (d > 380){ T.pk = null; return; }
    const show = !blocked2;
    gxPaxFig.visible = gxPaxMark.visible = show; gxPaxLbl.dead = !show;
    if (!show) return;
    const now = performance.now() / 1000;
    gxPaxFig.position.set(x, Math.abs(Math.sin(now * 5)) * .35, z); gxPaxFig.rotation.y = Math.atan2(px - x, pz - z);
    gxPaxMark.position.set(x, .1, z); gxPaxLbl.pos.set(x, 5.5, z);
    if (d < 6.5){
      if (!driving){ gxPromptMsg = '顺风车要开车来接，找辆车再过来'; return; }
      if (sp > 5){ gxPromptMsg = '慢下来停稳，让同学上车'; return; }
      /* where to: decided when the passenger is first asked, so the card can say it (js/89-offers.js); skipping sends this one away */
      if (!T.ask){ const opts = DESTS.filter(o => { const dd = Math.hypot(o.x - x, o.z - z); return dd > 150 && dd < 600; }); T.ask = opts[(rnd() * opts.length) | 0]; if (!T.ask){ T.pk = null; return; } }
      const to = T.ask, dist = Math.hypot(to.x - x, to.z - z), limit = Math.round(dist / 11 + 15);
      const board = () => {
        if (T.on || !T.pk) return;
        Object.assign(T, {on:true, to, dist, rating:T.type.rate, driftT:0, ask:null});
        T.limit = T.t = limit;
        gxPaxFig.visible = gxPaxMark.visible = false; gxPaxLbl.dead = true;
        gxDestMark.position.set(to.x, .1, to.z); sfx.ding();
        toast(T.type.name + '上车了：去 ' + to.name, T.type.hello + ` · 限时 ${T.limit} 秒`, 3000);
      };
      if (typeof offerJob !== 'function') board();
      else offerJob('taxi', () => ({icon:'🙋', title:'顺风车 · ' + T.type.name, desc:'「' + T.type.hello + '」', accept:'载上，去 ' + to.name, time:limit, dist, pay:'按评价给钱',
        risk:{hurry:'赶时间：越快到越好', sick:'晕车：别急刹、别漂移、别撞', vlog:'想看特技：飞跃和漂移加分'}[T.type.k] || '', onAccept:board, onDecline:() => { T.pk = null; T.ask = null; T.spawnCd = 5; }}));
    }
    return;
  }
  /* riding */
  gxPaxFig.visible = gxPaxMark.visible = false; gxPaxLbl.dead = true;
  T.t -= dt; gxDestMark.visible = true;
  const d = Math.hypot(px - T.to.x, pz - T.to.z);
  missionEl.textContent = `${Math.max(0, Math.ceil(T.t))} 秒 · 送${T.type.name.replace('的同学', '同学')}去 ${T.to.name} · ${'★'.repeat(Math.round(T.rating))}`;
  missionEl.classList.toggle('urgent', T.t < 10);
  if (driving && driving.slip > 5 && sp > 10){
    T.driftT += dt;
    if (T.driftT > 2){ T.driftT = 0; if (T.type.k === 'sick') gxRate(-.5, '别甩了，要吐了……'); else if (T.type.k === 'vlog') gxRate(.5, '这个漂移好出片！'); }
  }
  if (d < 7){
    if (!driving){ gxPromptMsg = '同学还在车上，开车送到门口'; }
    else if (sp < 8){
      const r = T.rating, hurry = T.type.k === 'hurry' ? 1.2 : .6;
      const pay = (15 + T.dist * .06 + Math.max(0, T.t) * hurry) * (.4 + .12 * r);
      T.on = false; T.pk = null; T.spawnCd = 3; gxDestMark.visible = false; sess.taxi++; prog.life.taxi++;
      earn(pay); sfx.ding();
      for (let i = 0; i < 8; i++) spawnPart('heart', T.to.x + (rnd() - .5) * 4, 2 + rnd() * 2, T.to.z + (rnd() - .5) * 4, .9, {vy:2.5, life:1.4, op:1, color:'#ff6fa3'});
      toast(`送到了 · ${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}`, `+RM ${pay.toFixed(2)} · ${r >= 5 ? '五星好评，还给了小费' : r >= 4 ? '同学说谢谢' : '同学下车腿有点软'}`, 2600);
      if (r >= 5) unlock('taxi5');
    } else gxPromptMsg = '到了，停稳让同学下车';
  } else if (T.t <= 0) gxTaxiEnd(false, '同学自己走路去了', '太慢了，这单没拿到钱');
}

/* ---------- challenges ---------- */
function gxStart(a){
  Object.assign(gxA, {act:a, phase:'count', t:0, cd:3, cp:0, score:0, beep:4});
  a.mark.visible = false; sfx.ding();
  toast(a.name, a.intro, 2800);
  if (a.type === 'race'){ for (const m of [gxCp, gxCpNext]){ m.userData.ring.material.color.set(a.color); m.children[1].material.color.set(a.color); } }
}
function gxStop(){
  if (gxA.act) gxA.rearm = gxA.act;
  gxA.act = null; gxA.phase = ''; gxCp.visible = gxCpNext.visible = false; missionEl.classList.remove('urgent');
}
function gxFail(title, sub){ sfx.fail(); toast(title, sub, 2600); gxStop(); }
function gxFinish(score){
  const a = gxA.act, low = a.type === 'race';
  let medal = 3; for (let i = 0; i < 3; i++) if (low ? score <= a.medal[i] : score >= a.medal[i]){ medal = i; break; }
  const prev = prog.best[a.id], rec = prev == null || (low ? score < prev : score > prev);
  if (rec) prog.best[a.id] = Math.round(score * 10) / 10;
  let pay = medal < 3 ? a.pay[medal] : 8; if (rec && prev != null) pay += 15;
  sess.acts++; if (medal < 3) sess.medals++;
  earn(pay); saveGame();
  const head = medal < 3 ? `${GX_MEDAL[medal]} · ${a.name}` : `${a.name} · 完成`;
  const loot = window.XParts ? XParts.reward('activity', medal, a.name + (GX_MEDAL[medal] || '')) : [];   /* 改装零件, js/93-tuning-ui.js */
  const sub = `${gxScoreTxt(a, score)}${rec ? (prev != null ? ' · 新纪录！' : ' · 首次完成') : ` · 纪录 ${gxScoreTxt(a, prev)}`} · +RM ${pay}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`;
  toast(head, sub, 3600);
  if (medal < 3){ gxCallout(GX_MEDAL[medal], gxScoreTxt(a, score), ['#e3b95a', '#b8c2cc', '#c98a55'][medal]); for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09); }
  else sfx.ding();
  if (medal === 0) unlock('gold');
  if (a.id === 'early8') unlock('early8');
  gxStop();
}
function gxAbandon(){ if (gxA.act){ toast('放弃了「' + gxA.act.name + '」', '回到起点光圈可以再来', 2200); gxStop(); } else if (gxTaxi.on) gxTaxiEnd(false, '让同学下车了', '这单不算钱'); }
function gxUpdateAct(dt, px, pz, sp){
  const a = gxA.act;
  if (!a){
    /* idle: show start rings; drive into one to begin */
    const hide = mission.on || gxTaxi.on || gx.extBusy();
    for (const b of GX_ACTS){
      b.mark.visible = !hide; b.lbl.dead = hide;
      if (hide) continue;
      b.mark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 330) * .15;
      const d = Math.hypot(px - b.start[0], pz - b.start[1]);
      if (gxA.rearm === b){ if (d > 14) gxA.rearm = null; continue; }
      if (d < 6.5){
        if (!driving) gxPromptMsg = `开车进圈开始「${b.name}」` + (prog.best[b.id] != null ? ` · 纪录 ${gxScoreTxt(b, prog.best[b.id])}` : '');
        else if (typeof offerJob !== 'function'){ gxStart(b); break; }
        else if (offerJob('act:' + b.id, () => ({icon:b.type === 'race' ? '🏁' : '🎯', title:b.name, desc:b.intro, accept:'开始', time:b.limit, pay:b.pay ? '金牌 RM ' + b.pay[0] : null,
          risk:prog.best[b.id] != null ? '纪录 ' + gxScoreTxt(b, prog.best[b.id]) : '', onAccept:() => { if (!gxA.act && driving) gxStart(b); }}))) break;
      }
    }
    return;
  }
  for (const b of GX_ACTS){ b.mark.visible = false; b.lbl.dead = true; }
  if (gxA.phase === 'count'){
    gxA.cd -= dt; if (driving){ driving.vx *= .5; driving.vz *= .5; }
    const n = Math.ceil(gxA.cd);
    if (n < gxA.beep){ gxA.beep = n; if (n > 0){ gxCallout(String(n), a.name, a.color); gxBeep(660, .14); } else { gxCallout('出发！', '', a.color); gxBeep(1320, .3, .12); } }
    missionEl.textContent = `${a.name} · 准备 ${Math.max(1, n)}`;
    if (gxA.cd <= 0) gxA.phase = 'run';
    if (a.type === 'race') gxShowCps(a);
    return;
  }
  gxA.t += dt;
  if (a.type === 'race'){
    const tgt = a.cps[gxA.cp], d = Math.hypot(px - tgt[0], pz - tgt[1]);
    if (d < 10){
      gxA.cp++; gxChime(gxA.cp % 4);
      if (gxA.cp >= a.cps.length){ gxFinish(gxA.t); return; }
    }
    gxShowCps(a);
    const left = a.limit - gxA.t;
    if (a.clock){
      const s = 7 * 3600 + 59 * 60 + Math.floor(gxA.t), p2 = v => String(v).padStart(2, '0');
      missionEl.textContent = `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s % 3600 / 60))}:${p2(s % 60)} · ${a.name} · 还有 ${Math.round(d)} 米`;
    }
    else missionEl.textContent = `${gxFmt(gxA.t)} · ${gxA.cp + 1}/${a.cps.length} ${a.name} · 金牌线 ${gxFmt(a.medal[0])}`;
    missionEl.classList.toggle('urgent', left < 10);
    if (left <= 0) gxFail(a.clock ? '早八迟到了' : a.name + ' · 超时', a.clock ? '08:00 了还没进教室，点名没赶上' : '回到起点光圈可以再来');
    return;
  }
  const left = a.dur - gxA.t;
  if (a.type === 'drift'){
    const inZone = ((px - FIELD.x) / FIELD.rx) ** 2 + ((pz - FIELD.z) / FIELD.rz) ** 2 < 1.15;
    if (inZone){ if (driving && !driving.air && driving.slip > 4 && sp > 8) gxA.score += driving.slip * dt * 10; }
    else gxPromptMsg = '回到田径场里漂移才算分';
    const nx = gxA.score >= a.medal[0] ? '金牌到手' : `下一档 ${a.medal.slice().reverse().find(m => m > gxA.score).toLocaleString()}`;
    missionEl.textContent = `${Math.ceil(left)} 秒 · 漂移 ${Math.round(gxA.score).toLocaleString()} 分 · ${nx}`;
  } else if (a.type === 'jump'){
    missionEl.textContent = `${Math.ceil(left)} 秒 · 最远 ${Math.round(gxA.score)} 米 · 金牌 ${a.medal[0]} 米`;
  }
  missionEl.classList.toggle('urgent', left < 8);
  if (left <= 0 && !(a.type === 'jump' && driving && driving.air)) gxFinish(gxA.score);
}
function gxShowCps(a){
  const c0 = a.cps[gxA.cp], c1 = a.cps[gxA.cp + 1], last = gxA.cp === a.cps.length - 1;
  gxCp.visible = true; gxCp.position.set(c0[0], .1, c0[1]); gxCp.userData.ring.material = last ? gxFinishMat : gxCpMat;
  gxCp.userData.ring.scale.y = 1 + Math.sin(performance.now() / 200) * .12;
  gxCpNext.visible = !!c1; if (c1) gxCpNext.position.set(c1[0], .1, c1[1]);
}

/* ---------- air time, slow motion, near misses ---------- */
function gxWatchCar(dt, sp){
  const c = driving;
  if (c && c === gxAirCar){
    if (c.air && !gxJumpFrom){ gxJumpFrom = [c.x, c.z]; if (c.vy > 10 && !REDUCED) gxSlow = .85; }
    if (!c.air && gxJumpFrom){
      const dist = Math.hypot(c.x - gxJumpFrom[0], c.z - gxJumpFrom[1]), air = c.airT; gxJumpFrom = null;
      if (air > 2) unlock('air2');
      if (air > .6){
        if (gxA.act && gxA.act.type === 'jump' && gxA.phase === 'run' && dist > gxA.score){ gxA.score = dist; gxCallout(`${Math.round(dist)} 米`, '本轮最远', gxA.act.color); }
        else if (air > 1) gxCallout(`飞了 ${Math.round(dist)} 米`, `滞空 ${air.toFixed(1)} 秒`);
        if (gxTaxi.on){ if (gxTaxi.type.k === 'sick') gxRate(-.5, '我、我的胃……'); else if (gxTaxi.type.k === 'vlog' && air > .8) gxRate(.5, '哇！！这段要火！'); else if (air > 1.2) gxQuip('啊啊啊啊——'); }
      }
    }
  } else { gxAirCar = c; gxJumpFrom = c && c.air ? [c.x, c.z] : null; }
  if (!c || c.air || sp < 14) return;
  const now = performance.now() / 1000;
  for (const o of cars){
    if (o === c || !o.root.visible || (o.gxNm || 0) > now) continue;
    const gap = Math.hypot(o.x - c.x, o.z - c.z) - o.R - c.R;
    if (gap > .1 && gap < 1.3 && Math.hypot(o.vx - c.vx, o.vz - c.vz) > 12){ o.gxNm = now + 3; addStunt('惊险擦车', 80); gxCallout('惊险擦车', '+80 × 连击'); tone('sawtooth', 900, 300, .25, .06); }
  }
}

/* ---------- pause / session summary ---------- */
const gxPauseEl = $('#gxpause');
function gxRenderPause(){
  const m = Math.floor(sess.time / 60), s = Math.floor(sess.time % 60);
  $('#gxpTime').textContent = `玩了 ${m} 分 ${String(s).padStart(2, '0')} 秒`;
  const tile = (k, v) => `<div class="gxp-t"><b>${v}</b><span>${k}</span></div>`;
  const hot = typeof hotPk !== 'undefined' && hotPk ? `今日加急：${hotPk.name}${prog.daily === dayKey() ? '（已送）' : '，第一单报酬翻倍'}` : '';
  const recs = GX_ACTS.map(a => {
    const b = prog.best[a.id]; let medal = '';
    if (b != null){ const low = a.type === 'race'; for (let i = 0; i < 3; i++) if (low ? b <= a.medal[i] : b >= a.medal[i]){ medal = `<em class="m${i}">${GX_MEDAL[i]}</em>`; break; } }
    return `<li><span>${a.name}</span><b>${b != null ? gxScoreTxt(a, b) : '—'}</b>${medal}</li>`;
  }).join('') + GX_MORE.map(a => { const b = prog.best[a.id]; return `<li><span>${a.name}</span><b>${b != null ? a.fmt(b) : '—'}</b></li>`; }).join('');
  const got = ACH.filter(a => prog.ach[a[0]]).length;
  const achs = ACH.map(a => `<li class="${prog.ach[a[0]] ? 'on' : ''}" title="${a[2]}"><b>${a[1]}</b><span>${a[2]}</span></li>`).join('');
  $('#gxpBody').innerHTML = `
    <div class="gxp-tiles">${tile('这次赚到', fmtRM(sess.earned))}${tile('外卖', sess.deliv + ' 单')}${tile('最佳连击', sess.bestCombo.toLocaleString())}${tile('挑战 / 顺风车', sess.acts + ' / ' + sess.taxi)}</div>
    <p class="gxp-note">${hot}${sess.bust ? ` · 被抓 ${sess.bust} 次` : ''}${sess.peak ? ` · 最高 ${sess.peak} 星警戒` : ''}</p>
    <h3>挑战纪录</h3><ul class="gxp-rec">${recs}</ul>
    <h3>成就 <small>${got} / ${ACH.length}</small></h3><ul class="gxp-ach">${achs}</ul>`;
  $('#gxpQuit').hidden = !(gxA.act || gxTaxi.on);
  $('#gxpQuit').textContent = gxA.act ? '放弃「' + gxA.act.name + '」' : '让乘客下车';
}
function gxSetPause(on){
  if (!gxPauseEl || on === gx.paused) return;
  if (on && mode !== 'naiwa') return;
  gx.paused = on; gxPauseEl.hidden = !on;
  if (on){ closeShop(); gxRenderPause(); engineUpdate(0, 0, false); keys.Space = false; $('#gxpGo').focus({preventScroll:true}); }
  else canvas.focus({preventScroll:true});
  const pb = $('#gxPauseBtn'); if (pb) pb.setAttribute('aria-pressed', String(on));
}
if (gxPauseEl){
  $('#gxpGo').addEventListener('click', () => gxSetPause(false));
  $('#gxpx').addEventListener('click', () => gxSetPause(false));
  $('#gxpQuit').addEventListener('click', () => { gxAbandon(); gxSetPause(false); });
  $('#gxpShop').addEventListener('click', () => { gxSetPause(false); openShop(); });
}
{ const pb = $('#gxPauseBtn'); if (pb) pb.addEventListener('click', () => { ac(); gxSetPause(!gx.paused); }); }
{ const gb = $('#garageBtn'); if (gb && gb.textContent === 'XMUM 车行') gb.innerHTML = '<span class="gx-long">XMUM </span>车行'; }

/* ---------- wire into the game loop ---------- */
Object.assign(gx, {
  update(dt, px, pz){
    gxPromptMsg = '';
    const sp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
    sess.time += dt;
    gxWatchCar(dt, sp);
    gxUpdateAct(dt, px, pz, sp);
    gxUpdateTaxi(dt, px, pz, sp);
  },
  busy(){ return !!gxA.act || gxTaxi.on; },
  prompt(){ return gxPromptMsg; },
  target(){
    const a = gxA.act;
    if (a){
      if (a.type === 'race'){ const c = a.cps[gxA.cp]; return {x:c[0], z:c[1], label:gxA.cp === a.cps.length - 1 ? '终点' : `检查点 ${gxA.cp + 1}/${a.cps.length}`}; }
      if (a.type === 'drift') return {x:FIELD.x, z:FIELD.z, label:'田径场'};
      if (a.type === 'jump'){ const p = driving || nw; let best = RAMPS[0], bd = 1e9; for (const r of RAMPS){ const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < bd){ bd = d; best = r; } } return {x:best.x - best.fx * 25, z:best.z - best.fz * 25, label:'最近的跳台'}; }
    }
    if (gxTaxi.on) return {x:gxTaxi.to.x, z:gxTaxi.to.z, label:'送到 ' + gxTaxi.to.name};
    return null;
  },
  mini(dot){
    const a = gxA.act;
    if (a && a.type === 'race'){ const c = a.cps[gxA.cp]; dot(c[0], c[1], a.color, 9); }
    else if (a && a.type === 'drift') dot(FIELD.x, FIELD.z, a.color, 9);
    else if (a && a.type === 'jump') for (const r of RAMPS) dot(r.x, r.z, a.color, 7);
    else if (gxTaxi.on) dot(gxTaxi.to.x, gxTaxi.to.z, '#3fd6c6', 9);
    else if (!mission.on){ for (const b of GX_ACTS) dot(b.start[0], b.start[1], b.color, 7); if (gxTaxi.pk) dot(gxTaxi.pk[0], gxTaxi.pk[1], '#3fd6c6', 7); }
  },
  onStunt(label){
    if (label === '人车分离' && gxTaxi.on) gxTaxiEnd(false, '乘客吓跑了', '车祸把同学吓坏了，这单没了');
  },
  onCrash(grade){
    if (!gxTaxi.on) return;
    const k = gxTaxi.type.k, big = grade !== '剐蹭';
    if (k === 'sick') gxRate(big ? -1.5 : -1, big ? '救命啊！！' : '小心点啊……');
    else if (k === 'vlog') gxRate(big ? -.5 : 0, big ? '撞车也挺有节目效果……' : '没事没事');
    else gxRate(big ? -1 : -.5, big ? '你是来撞车的吗！' : '蹭到了吧？');
  },
  onBust(){
    if (gxA.act) gxStop();
    if (gxTaxi.on) gxTaxiEnd(true);
  },
  leave(){
    gxStop(); gxA.rearm = null; if (gxTaxi.on) gxTaxiEnd(true); gxTaxi.pk = null; gxSetPause(false);
    for (const b of GX_ACTS){ b.mark.visible = false; b.lbl.dead = true; }
    gxPaxFig.visible = gxPaxMark.visible = gxDestMark.visible = false; gxPaxLbl.dead = true; gxSlow = 0; gxTS = 1;
  },
  scale(dt){
    if (gxSlow > 0) gxSlow -= dt;
    const want = gxSlow > 0 ? .35 : 1; gxTS += (want - gxTS) * Math.min(1, dt * (want < gxTS ? 14 : 4));
    return gxTS;
  },
  callout:gxCallout,
  togglePause(){ gxSetPause(!gx.paused); }
});
for (const b of GX_ACTS) b.lbl.dead = true;
