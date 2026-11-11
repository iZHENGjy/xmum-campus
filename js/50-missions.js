/* XMUM 校园漫游 · 外卖任务、指南针、打卡 */
'use strict';
/* ---------- delivery missions ---------- */
const ringGeo = new THREE.CylinderGeometry(4.5, 4.5, 3, 40, 1, true); ringGeo.translate(0, 1.5, 0);
const PICKUPS = [['D6 食堂', ...P(1550, 200)], ['LY3 食堂', ...P(1075, 240)], ['B1 餐厅', ...P(1590, 400)]].map(([name, x, z]) => {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:'#ff8a3d', transparent:true, opacity:.45, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
  m.position.set(x, .1, z); scene.add(m); const lbl = addLabel('外卖取餐 · ' + name, x, 6.5, z, true);
  return {name, x, z, m, lbl};
});
/* today's rush order: one canteen pays double for its first delivery of the day */
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
let hotDay = '', hotPk = null;
function refreshHot(){
  const k = dayKey(); if (k === hotDay && hotPk && (prog.daily === k) === !!hotPk.cool) return;
  hotDay = k; let hsh = 0; for (const ch of k) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  hotPk = PICKUPS[hsh % PICKUPS.length]; const done = prog.daily === k;
  for (const pk of PICKUPS){ const hot = pk === hotPk && !done; pk.m.material.color.set(hot ? '#ffc93c' : '#ff8a3d'); pk.lbl.el.textContent = (hot ? '今日加急 ×2 · ' : '外卖取餐 · ') + pk.name; pk.cool = pk === hotPk && done; }
}
const destMark = new THREE.Group();
{ const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:'#4fd18b', transparent:true, opacity:.5, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
  const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({color:'#4fd18b', transparent:true, opacity:.25, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide}));
  destMark.add(r, b); destMark.visible = false; scene.add(destMark); }
function frontPoint(i){
  if (i.spawn) return [i.spawn[0], i.spawn[1]];
  const s = Math.sin(i.wrot), c = Math.cos(i.wrot);
  for (const dir of [1, -1]) for (let off = i.wd / 2 + 7; off < i.wd / 2 + 60; off += 4){
    const x = i.wx + dir * off * s, z = i.wz + dir * off * c;
    if (!blocked(x, z) && !hitsBuilding(x, z, 4)) return [x, z];
  }
  return null;
}
const DESTS = infos.filter(i => ['宿舍', '教学', '主楼', '二期', '交流', '活动'].includes(i.tag)).map(i => { const p = frontPoint(i); return p && {name:i.name, x:p[0], z:p[1]}; }).filter(Boolean)
  .concat(typeof OUT_DESTS !== 'undefined' ? OUT_DESTS : []);   /* outside the gate: js/13-outskirts.js */
let money = 0, deliveries = 0;
const mission = {on:false, from:null, to:null, t:0, limit:0};
const DELIV_EASE = 1.35;   /* delivery time limits are 35% longer than before (players found them too tight); pay is unchanged */
const missionEl = $('#mission'), moneyEl = $('#money');
/* one order from this pick-up: rush = less time, more pay; far ones carry a distance fee (RM 4 per 100 m), so the three on the card are really worth different money.
   est is what it pays if you drive it at an ordinary pace */
function missionOrder(pk, to, rush){
  const dist = Math.hypot(to.x - pk.x, to.z - pk.z), hot = pk === hotPk && prog.daily !== dayKey();
  const cross = typeof outCross === 'function' ? outCross(pk, to) : null;   /* through the gate: longer limit, better pay (js/89-outskirts-play.js) */
  /* DELIV_EASE: 35% more time than the pay is worked out from; the extra seconds are a cushion, not money (grace below) */
  /* story chapter 1 (js/89-quest.js): on foot, campus orders only, 1.5× the time; the extra is cushion (grace), not pay */
  const q1 = window.XQuest && XQuest.ch1Deliv() ? 1.5 : 1;
  const base = Math.round((cross ? cross.limit : dist / 13 + 14) * (rush ? .72 : 1)), limit = Math.round(base * DELIV_EASE * q1), grace = limit - base, mult = rush ? 1.5 : 1, route = cross ? cross.route : dist;
  const fee = route * .04, est = (25 + fee + Math.max(0, base - route / 16) * 1.2) * (hot ? 2 : 1) * (cross ? cross.mult : 1) * mult * (typeof outCred === 'function' ? outCred() : 1);
  return {to, dist, route, limit, grace, hot, cross, rush:!!rush, mult, fee, est};
}
/* what a pick-up has on the counter right now: a short one, a long one (through the gate when there is one), and a rush order */
function missionOrders(pk){
  const q1 = window.XQuest && XQuest.ch1Deliv();   /* story chapter 1: campus orders only */
  if (q1 && pk.out) return [];
  const opts = DESTS.filter(d => { const dd = Math.hypot(d.x - pk.x, d.z - pk.z); return dd > 120 && (dd < 650 || d.far || pk.out) && !(q1 && (d.far || d.out || (typeof outCross === 'function' && outCross(pk, d)))); })
    .sort((a, b) => Math.hypot(a.x - pk.x, a.z - pk.z) - Math.hypot(b.x - pk.x, b.z - pk.z));
  if (!opts.length) return [];
  const n = opts.length, take = (a, b) => opts.splice(Math.min(opts.length - 1, Math.floor((a + rnd() * (b - a)) * opts.length)), 1)[0];
  const out = [missionOrder(pk, take(0, .35), false)];
  if (n > 1) out.push(missionOrder(pk, take(.6, 1), false));
  if (n > 2) out.push(missionOrder(pk, take(.2, .8), true));
  return out;
}
function startMission(pk, o){
  o = o || missionOrders(pk)[0]; if (!o) return;
  const {to, hot, cross} = o;
  Object.assign(mission, {on:true, from:pk, to, limit:o.limit, grace:o.grace || 0, t:0, hot, cross, mult:o.mult, fee:o.fee, rush:o.rush, stolen:false, recovered:false}); mission.t = mission.limit;
  destMark.position.set(to.x, .1, to.z); destMark.visible = true;
  sfx.ding(); toast((hot ? '今日加急：' : o.rush ? '加急单：' : '接单：') + pk.name + ' → ' + to.name, `限时 ${mission.limit} 秒` + (hot ? ' · 今天第一单报酬翻倍' : o.rush ? ' · 时间紧，报酬 ×1.5' : cross ? ` · 跨区远单报酬 ×${cross.mult}` : '，找辆车会快很多'), 3000);
}
/* the card at a pick-up ring (js/89-offers.js): pick one of the orders, or skip */
function offerMission(pk){
  return offerJob('deliv:' + pk.name, () => {
    const hot = pk === hotPk && prog.daily !== dayKey(), list = missionOrders(pk); if (!list.length) return null;
    return {icon:'🥡', title:'外卖 · ' + pk.name, desc:hot ? '今天第一单报酬翻倍，挑一单' : '挑一单送，或者跳过',
      options:list.map(o => ({title:'送到 ' + o.to.name, tag:o.rush ? '加急' : o.cross ? '跨区' : '', pay:'约 RM ' + Math.round(o.est), time:o.limit, dist:o.route,
        risk:o.rush ? '时间紧，报酬 ×1.5' : o.cross ? `要出校门，报酬 ×${o.cross.mult}` : '', onAccept:() => { if (!mission.on && !gx.busy()) startMission(pk, o); }}))};
  });
}
function updateMission(dt, px, pz){
  const T = performance.now() / 1000;
  const busy = gx.busy();
  for (const pk of PICKUPS){ pk.m.visible = !mission.on && !busy && mode === 'naiwa'; pk.m.scale.y = 1 + Math.sin(T * 3) * .15; }
  destMark.visible = mission.on && mode === 'naiwa';
  if (mode !== 'naiwa') return;
  refreshHot();
  if (!mission.on){
    if (busy){ missionEl.classList.remove('urgent'); return; }
    missionEl.textContent = typeof OFFER !== 'undefined' && !OFFER.on ? '现在不接单 · 路过光圈不弹卡片' : '到橙色光圈挑一单外卖'; missionEl.classList.remove('urgent');
    /* near a ring the card with its orders comes up (a little before the ring, so there is time to read it while rolling in); without js/89-offers.js the order starts at once, as before */
    for (const pk of PICKUPS){
      const d = Math.hypot(px - pk.x, pz - pk.z);
      if (typeof offerJob !== 'function'){ if (d < 5){ startMission(pk); break; } }
      else if (d < 9){ offerMission(pk); break; }
    }
    return;
  }
  mission.t -= dt;
  const d = Math.hypot(px - mission.to.x, pz - mission.to.z);
  /* a thief can snatch the order on the way (js/89-outskirts-play.js sets mission.stolen): the clock keeps running, and it cannot be handed over until it is won back */
  missionEl.textContent = mission.stolen ? `被抢了 ${Math.max(0, Math.ceil(mission.t))} 秒 · 追上小偷拿回来` : `${mission.from.name} → ${mission.to.name} · ${Math.max(0, Math.ceil(mission.t))} 秒 · ${Math.round(d)} 米`;
  missionEl.classList.toggle('urgent', mission.t < 10 || !!mission.stolen);
  /* out of time is out of time, even when you are standing at the door (e.g. won it back from a thief or a monkey right there) */
  if (d < 5.5 && !mission.stolen && mission.t > 0){
    const pay = (25 + (mission.fee || 0) + Math.max(0, mission.t - (mission.grace || 0)) * 1.2) * (mission.hot ? 2 : 1) * (mission.cross ? mission.cross.mult : 1) * (mission.mult || 1) * (typeof outCred === 'function' ? outCred() : 1); deliveries++; sess.deliv++; prog.life.deliv++;
    if (mission.hot) prog.daily = dayKey();
    earn(pay);
    sfx.ding(); toast((mission.hot || mission.rush ? '加急送达 ' : '送达 ') + mission.to.name, `+RM ${pay.toFixed(2)} · 已送 ${deliveries} 单`, 2600);
    mission.on = false; unlock('deliv1'); if (prog.life.deliv >= 25) unlock('deliv25');
  } else if (mission.t <= 0){
    sfx.fail(); toast('外卖凉了', '超时了，顾客给了差评', 2600); mission.on = false;
  }
}
const compass = $('#compass'), cdist = $('#cdist'), compassSvg = compass.querySelector('svg');
const _fw = new THREE.Vector3();
function updateCompass(px, pz){
  const tgtP = mission.on ? mission.to : null, act = gx.target();
  let tx, tz, label;
  if (act){ tx = act.x; tz = act.z; label = act.label; }
  else if (tgtP){ tx = tgtP.x; tz = tgtP.z; label = '送到 ' + tgtP.name; }
  else {
    let best = null, bd = 1e9; for (const pk of PICKUPS){ const d = Math.hypot(pk.x - px, pk.z - pz); if (d < bd){ bd = d; best = pk; } }
    tx = best.x; tz = best.z; label = '取餐 ' + best.name;
  }
  camera.getWorldDirection(_fw);
  const vx = tx - px, vz = tz - pz, a = Math.atan2(vx, vz) - Math.atan2(_fw.x, _fw.z);
  compassSvg.style.transform = `rotate(${-a}rad)`;
  cdist.textContent = `${label} · ${Math.round(Math.hypot(vx, vz))} 米`;
}

/* ---------- checkpoints ---------- */
function checkCPs(px, pz){
  for (const cp of CPS){
    if (!cp.done && Math.hypot(px - cp.x, pz - cp.z) < 3.6){
      cp.done = true; collected++; cp.chip.classList.add('on');
      $('#cnt').textContent = collected + ' / ' + CPS.length; $('#barfill').style.width = (collected / CPS.length * 100) + '%';
      const loot = window.XParts ? XParts.reward('checkin', 0, '今天第一次打卡') : [], lt = loot.length ? ' · 改装：' + XParts.text(loot) : '';   /* 改装零件：每天第一次，js/93-tuning-ui.js */
      if (collected === CPS.length && !finished){
        finished = true; const t = Math.round((performance.now() - walkStart) / 1000);
        toast('全部打卡完成', `用时 ${Math.floor(t / 60)} 分 ${t % 60} 秒${lt}`, 5000);
      } else toast('打卡成功 · ' + cp.name, `${collected} / ${CPS.length}${lt}`);
    }
  }
}
