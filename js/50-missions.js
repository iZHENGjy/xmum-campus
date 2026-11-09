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
const DESTS = infos.filter(i => ['宿舍', '教学', '主楼', '二期', '交流', '活动'].includes(i.tag)).map(i => { const p = frontPoint(i); return p && {name:i.name, x:p[0], z:p[1]}; }).filter(Boolean);
let money = 0, deliveries = 0;
const mission = {on:false, from:null, to:null, t:0, limit:0};
const missionEl = $('#mission'), moneyEl = $('#money');
function startMission(pk){
  const opts = DESTS.filter(d => { const dd = Math.hypot(d.x - pk.x, d.z - pk.z); return dd > 120 && dd < 650; });
  const to = opts[(rnd() * opts.length) | 0]; if (!to) return;
  const dist = Math.hypot(to.x - pk.x, to.z - pk.z);
  const hot = pk === hotPk && prog.daily !== dayKey();
  Object.assign(mission, {on:true, from:pk, to, limit:Math.round(dist / 13 + 14), t:0, hot}); mission.t = mission.limit;
  destMark.position.set(to.x, .1, to.z); destMark.visible = true;
  sfx.ding(); toast((hot ? '加急单：' : '接单：') + pk.name + ' → ' + to.name, `限时 ${mission.limit} 秒` + (hot ? ' · 今天第一单报酬翻倍' : '，找辆车会快很多'), 3000);
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
    missionEl.textContent = '走进或开进橙色光圈接外卖单'; missionEl.classList.remove('urgent');
    for (const pk of PICKUPS) if (Math.hypot(px - pk.x, pz - pk.z) < 5){ startMission(pk); break; }
    return;
  }
  mission.t -= dt;
  const d = Math.hypot(px - mission.to.x, pz - mission.to.z);
  missionEl.textContent = `${mission.from.name} → ${mission.to.name} · ${Math.max(0, Math.ceil(mission.t))} 秒 · ${Math.round(d)} 米`;
  missionEl.classList.toggle('urgent', mission.t < 10);
  if (d < 5.5){
    const pay = (25 + mission.t * 1.2) * (mission.hot ? 2 : 1); deliveries++; sess.deliv++; prog.life.deliv++;
    if (mission.hot) prog.daily = dayKey();
    earn(pay);
    sfx.ding(); toast((mission.hot ? '加急送达 ' : '送达 ') + mission.to.name, `+RM ${pay.toFixed(2)} · 已送 ${deliveries} 单`, 2600);
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
      if (collected === CPS.length && !finished){
        finished = true; const t = Math.round((performance.now() - walkStart) / 1000);
        toast('全部打卡完成', `用时 ${Math.floor(t / 60)} 分 ${t % 60} 秒`, 5000);
      } else toast('打卡成功 · ' + cp.name, `${collected} / ${CPS.length}`);
    }
  }
}
