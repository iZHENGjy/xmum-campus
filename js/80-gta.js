/* XMUM 校园漫游 · 保安追捕、特技连击、撞车判定、车行、改装、成就 */
'use strict';
/* hooks filled in by js/85-activities.js; no-ops keep pages that skip that file working */
const gx = {paused:false, update(){}, mini(){}, target(){ return null; }, prompt(){ return ''; }, busy(){ return false; },
  onStunt(){}, onCrash(){}, onBust(){}, leave(){}, scale(){ return 1; }, callout(){}, togglePause(){}, extBusy(){ return false; }};

/* ---------- progression: saved upgrades, achievements, records; this session's stats ---------- */
const prog = {up:{eng:0, grip:0, arm:0, wr:0, wp:0, wt:0, wg:0, wx:0}, ach:{}, best:{}, life:{deliv:0, bust:0, taxi:0}, daily:''};
const sess = {time:0, earned:0, deliv:0, bestCombo:0, acts:0, medals:0, taxi:0, bust:0, peak:0};
function earn(v){
  if (!(v > 0)) return; money += v; sess.earned += v; moneyChanged();
  moneyEl.classList.remove('gx-bump'); void moneyEl.offsetWidth; moneyEl.classList.add('gx-bump');
  if (money >= 2000) unlock('rich');
}
const ACH = [
  ['deliv1', '开张大吉', '送出第一单外卖', 10], ['deliv25', '外卖骑手', '累计送出 25 单', 80],
  ['busted', '进局子', '第一次被保安抓住', 10], ['star5', '五星通缉', '保安警戒拉满五颗星', 50], ['escape4', '溜了溜了', '四星以上甩掉保安', 80],
  ['lake', '飞进湖里', '开着车飞进湖里', 30], ['eject', '人车分离', '车祸把奶娃甩飞出去', 20], ['air2', '空中飞人', '一次飞跃超过 2 秒', 40],
  ['combo5k', '连击大师', '一次连击超过 5,000 分', 60], ['early8', '早八不迟到', '跑完早八冲刺', 30], ['gold', '金牌车手', '任意挑战拿到金牌', 80],
  ['taxi5', '五星好评', '顺风车拿到五星评价', 40], ['allcars', '集齐车行', '车行里的车全部买下', 200], ['tuned', '改装狂人', '任意一项改装到满级', 60],
  ['rich', '小富婆', '钱包超过 RM 2,000', 0], ['exam', '期末救星', '成功抢救期末卷', 50], ['soak', '落汤保安', '用水枪淋湿保安', 20]
];
/* later files add their own achievements with achAdd(); achSaved keeps what the save file had, so those are restored too */
const achSaved = {};
function achAdd(rows){ for (const a of rows){ if (ACH.some(x => x[0] === a[0])) continue; ACH.push(a); if (achSaved[a[0]]) prog.ach[a[0]] = +achSaved[a[0]] || 1; } }
const achQ = []; let achT = 0;
function unlock(id){
  if (prog.ach[id]) return; const a = ACH.find(x => x[0] === id); if (!a) return;
  prog.ach[id] = Date.now(); achQ.push(a);
  if (achQ.length === 1) showAch();   /* before paying out: the reward can unlock another one, which then queues */
  if (a[3]) earn(a[3]); else saveGame();
}
function showAch(){
  const a = achQ[0], el = $('#gxach'); if (!a || !el) return;
  el.innerHTML = '<i>成就解锁</i><b></b><small></small>'; el.querySelector('b').textContent = a[1];
  el.querySelector('small').textContent = a[2] + (a[3] ? ` · +RM ${a[3]}` : '');
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  tone('triangle', 784, 784, .14, .14); tone('triangle', 988, 988, .14, .14, .12); tone('triangle', 1319, 1319, .4, .16, .24);
  clearTimeout(achT); achT = setTimeout(() => { el.classList.remove('show'); achT = setTimeout(() => { achQ.shift(); if (achQ.length) showAch(); else el.hidden = true; }, 350); }, 2600);
}
const UPG = [
  {k:'eng',  name:'引擎', desc:'极速 +7%、加速 +14% / 级', cost:[150, 400, 900]},
  {k:'grip', name:'轮胎', desc:'抓地 +10%、转向 +5% / 级', cost:[120, 320, 750]},
  {k:'arm',  name:'防滚架', desc:'撞车掉血 −18% / 级', cost:[100, 280, 650]}
];
/* water-gun workshop: the numbers are read by wgStat() in js/87-classroom.js */
const WUPG = [
  {k:'wr', name:'喷嘴', desc:'射程 +3.5 米 / 级', cost:[80, 200, 450]},
  {k:'wp', name:'水压', desc:'淋湿、定身的时间 +30% / 级', cost:[120, 300, 650]},
  {k:'wt', name:'水箱', desc:'容量 +2 发 / 级', cost:[60, 160, 380]},
  {k:'wg', name:'回水泵', desc:'回水快 25% / 级', cost:[80, 220, 500]},
  {k:'wx', name:'高压水炮', desc:'1 级散射喷头：一枪淋到前方 3 个目标 · 2 级高压水炮：威力再 ×1.4，还把目标冲退', cost:[400, 900]}
];
/* opponents (patrol cars, classroom guards, monkeys) get tougher as the water gun and the trophy shelf grow: 0 .. 3.
   Nothing bought and few achievements = 0, so the game stays playable without upgrades. */
function pveLevel(){
  let w = 0; for (const u of WUPG) w += prog.up[u.k] || 0;
  return Math.min(3, Math.floor(w / 4 + Object.keys(prog.ach).length / 12));
}
const PVE_NAME = ['普通', '警觉', '难缠', '凶猛'];
function tunedT(kind){
  const b = CAR_T[kind], u = prog.up;
  return Object.assign({}, b, {maxV:b.maxV * (1 + .07 * u.eng), acc:b.acc * (1 + .14 * u.eng), grip:b.grip * (1 + .1 * u.grip), steer:b.steer * (1 + .05 * u.grip), armor:(b.armor || 1) * (1 - .18 * u.arm)});
}
/* ---------- GTA: security chase ---------- */
const patrols = [];
for (let i = 0; i < 4; i++){ const c = makeCar('patrol', '#f4f2ec', 0, 5000 + i * 20, 0); cars.splice(cars.indexOf(c), 1); c.patrol = true; c.active = false; c.root.visible = false; c.inp = {thr:0, steer:0, brake:false}; c.T = Object.assign({}, CAR_T.patrol); patrols.push(c); }
/* 5-star roadblock: two parked patrol cars across the road ahead */
const blockers = [];
for (let i = 0; i < 2; i++){ const c = makeCar('patrol', '#f4f2ec', 0, 5100 + i * 20, 0); cars.splice(cars.indexOf(c), 1); c.patrol = true; c.active = false; c.root.visible = false; c.inp = {thr:0, steer:0, brake:true}; blockers.push(c); }
let heat = 0, calmT = 0, spawnCd = 0, sirenT = 0, sirenHi = false, bustT = 0, warned = false, lastStars = 0, chasePeak = 0, blockCd = 0, blockT = 0, forestTold = false;
function hideCop(c){ c.active = false; c.root.visible = false; const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); if (driving === c) leaveCar(); }
function despawnChasers(){
  for (const c of patrols.concat(blockers)) if (c.active) hideCop(c);
}
function placeRoadblock(tx, tz, vx, vz){
  const sp = Math.hypot(vx, vz); if (sp < 6) return false;
  const ux = vx / sp, uz = vz / sp;
  for (let k = 0; k < 60; k++){
    const sg = roadSegs[(rnd() * roadSegs.length) | 0], t = .2 + rnd() * .6;
    const x = sg.a[0] + (sg.b[0] - sg.a[0]) * t, z = sg.a[1] + (sg.b[1] - sg.a[1]) * t, rx = x - tx, rz = z - tz;
    const along = rx * ux + rz * uz, lat = Math.abs(rx * uz - rz * ux);
    if (along < 70 || along > 150 || lat > along * .35) continue;
    const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) || 1, dx = (sg.b[0] - sg.a[0]) / L, dz = (sg.b[1] - sg.a[1]) / L;
    const h = Math.atan2(dx, dz) + Math.PI / 2, off = Math.min(2.6, sg.h * .45);
    const spots = [[x - dz * off, z + dx * off], [x + dz * off, z - dx * off]];
    if (spots.some(([px, pz]) => carBlocked(blockers[0], px, pz, h) || lakes.some(Lk => inPoly(px, pz, Lk)) || Math.hypot(px - tx, pz - tz) < 60)) continue;
    blockers.forEach((c, i) => { const [px, pz] = spots[i]; Object.assign(c, {x:px, z:pz, h, vx:0, vz:0, y:0, vy:0, air:false, lastVy:0, pitch:0, steer:0, active:true, hp:100, wrecked:false});
      c.paint.color.set(c.color0); c.root.visible = true; c.root.position.set(px, 0, pz); c.root.rotation.set(0, h, 0); if (!cars.includes(c)) cars.push(c); });
    return true;
  }
  return false;
}
function spawnChaser(tx, tz){
  const c = patrols.find(p2 => !p2.active); if (!c) return;
  for (let k = 0; k < 40; k++){
    const sg = roadSegs[(rnd() * roadSegs.length) | 0], t = rnd();
    const x = sg.a[0] + (sg.b[0] - sg.a[0]) * t, z = sg.a[1] + (sg.b[1] - sg.a[1]) * t, d = Math.hypot(x - tx, z - tz);
    if (d < 70 || d > 140) continue;
    const h = Math.atan2(tx - x, tz - z);
    if (carBlocked(c, x, z, h)) continue;
    Object.assign(c, {x, z, h, vx:0, vz:0, y:0, vy:0, air:false, lastVy:0, pitch:0, steer:0, stuck:0, lowT:0, active:true});
    c.root.visible = true; c.root.position.set(x, 0, z); c.root.rotation.set(0, h, 0); cars.push(c); return;
  }
}
function chaseInput(c, tx, tz, dt){
  const want = Math.atan2(tx - c.x, tz - c.z), da = Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)), sp = Math.hypot(c.vx, c.vz);
  if (c.soakT > 0){ c.soakT -= dt; c.inp.thr = 0; c.inp.steer = 0; c.inp.brake = true; return; }   /* soaked by the water gun (js/87-classroom.js) */
  if (c.stuck > 0){ c.stuck -= dt; c.inp.thr = -1; c.inp.steer = -(Math.sign(da) || 1); c.inp.brake = false; return; }
  c.lowT = sp < 1.5 ? c.lowT + dt : 0; if (c.lowT > 1.1){ c.stuck = 1.1; c.lowT = 0; }
  c.inp.thr = Math.abs(da) > 1.9 ? .5 : 1; c.inp.steer = Math.max(-1, Math.min(1, da * 2.2)); c.inp.brake = Math.abs(da) > 1.1 && sp > 14;
}
function busted(){
  const fine = money * .3; money -= fine; moneyChanged();
  heat = 0; calmT = 0; bustT = 0; lastStars = 0; chasePeak = 0; despawnChasers();
  sess.bust++; prog.life.bust++; gx.onBust(); unlock('busted');
  if (driving) leaveCar();
  nw.x = 110; nw.z = 204; nw.y = 0; nw.state = 'idle'; nw.h = Math.PI; camYaw = 0;
  sfx.fail(); toast('被保安抓住了', fine > .005 ? `罚款 RM ${fine.toFixed(2)}，警戒解除` : '没钱罚，警告一次，警戒解除', 2800);
}
function updateChase(dt){
  /* hiding indoors (a classroom, the dorm: indoorNow() in js/40-vehicles.js): the patrol cars wait at that building's door and cannot arrest you */
  const indoor = indoorNow() && indoorDoor();
  const tx = indoor ? indoor.x : driving ? driving.x : nw.x, tz = indoor ? indoor.z : driving ? driving.z : nw.z;
  const stars = Math.min(5, Math.floor(heat)), lv = pveLevel();
  const active = patrols.filter(c => c.active && c !== driving);
  if (stars >= 1 && !warned){ warned = true; toast('保安盯上你了', '撞东西、吓到同学都会让警戒升级', 2400); }
  if (stars === 0){ warned = false; forestTold = false; chasePeak = 0; }
  if (stars !== lastStars){
    if (stars > lastStars && stars >= 3){
      const say = {3:['警戒 ★★★', '保安叫了增援'], 4:['警戒 ★★★★', '巡逻车换上了大马力引擎'], 5:['五星警戒！', '前面在设路障，钻进树林能甩掉他们']}[stars];
      toast(say[0], say[1], 2400); sfx.fail();
    }
    lastStars = stars; chasePeak = Math.max(chasePeak, stars); sess.peak = Math.max(sess.peak, stars);
    if (stars >= 5) unlock('star5');
  }
  /* the forest hides you: chasers lose you sooner */
  const inForest = inPoly(tx, tz, FOREST);
  if (inForest && stars >= 1 && !forestTold){ forestTold = true; toast('钻进树林了', '保安在树林里看不清你，离远点就能甩掉', 2200); }
  /* roadblock at five stars, cleared once you are well past it or the alert drops */
  if (blockers[0].active){
    blockT += dt; const on = Math.floor(performance.now() / 160) % 2 === 0;
    for (const c of blockers){ if (!c.active) continue; c.lights[0].emissiveIntensity = on ? 2.2 : .1; c.lights[1].emissiveIntensity = on ? .1 : 2.2; }
    if (stars < (lv >= 1 ? 3 : 4) || blockT > 35 || Math.hypot(blockers[0].x - tx, blockers[0].z - tz) > 220) for (const c of blockers) if (c.active) hideCop(c);
  } else {
    blockCd -= dt;
    /* roadblock: at five stars, or already at four once the opponents have levelled up */
    if (stars >= (lv >= 1 ? 4 : 5) && blockCd <= 0){ const v = driving || {vx:0, vz:0}; if (placeRoadblock(tx, tz, v.vx, v.vz)){ blockT = 0; blockCd = 22 - 4 * lv; } else blockCd = 3; }
  }
  spawnCd -= dt;
  if (active.length < Math.min(4, stars) && spawnCd <= 0){ spawnChaser(tx, tz); spawnCd = 2.5 - .4 * lv; }
  let minD = 1e9;
  const boost = (stars >= 4 ? 1.22 : 1) + (stars >= 3 ? .04 * lv : 0);
  const pvx = driving ? driving.vx : 0, pvz = driving ? driving.vz : 0, psp = Math.hypot(pvx, pvz);
  for (let ci = 0; ci < active.length; ci++){
    const c = active[ci];
    c.T.maxV = CAR_T.patrol.maxV * boost; c.T.acc = CAR_T.patrol.acc * boost;
    const d = Math.hypot(c.x - tx, c.z - tz); if (!(c.soakT > 0)) minD = Math.min(minD, d);
    /* three stars and up: only the first car tails you. The others aim ahead of you and to either side to cut you off,
       or close in from different sides when you are on foot. They go straight for you again once they are close. */
    let ax = tx, az = tz;
    if (stars >= 3 && ci > 0 && !indoor && d > 16){
      const side = (ci % 2 ? 1 : -1) * (ci > 2 ? 1.7 : 1);
      if (psp > 8){
        const lead = Math.min(2.6, d / 28) * (1 + .15 * lv), off = side * Math.min(12, d * .3);
        ax = tx + pvx * lead - pvz / psp * off; az = tz + pvz * lead + pvx / psp * off;
      } else { const a = ci * 2.1 + 1; ax = tx + Math.cos(a) * 9; az = tz + Math.sin(a) * 9; }
      if (hitsBuilding(ax, az, 2) || outOfMap(ax, az, 2) || lakes.some(L => inPoly(ax, az, L))){ ax = tx; az = tz; }
    }
    chaseInput(c, ax, az, dt);
    c.farT = d > 100 ? (c.farT || 0) + dt : 0;
    if (c.farT > 7){ c.farT = 0; c.active = false; c.root.visible = false; cars.splice(cars.indexOf(c), 1); spawnChaser(tx, tz); continue; }
    const on = Math.floor(performance.now() / 160) % 2 === 0;
    c.lights[0].emissiveIntensity = on ? 2.2 : .1; c.lights[1].emissiveIntensity = on ? .1 : 2.2;
  }
  if (active.length){
    const mySp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
    if (!indoor && minD < (driving ? 5.5 : 3.2) && mySp < 4) bustT += dt * (driving ? 1 : 1.6); else bustT = Math.max(0, bustT - dt);
    if (bustT > 1.5){ busted(); return; }
    if (indoor || minD > (inForest ? 70 : 150)){ calmT += dt * (inForest ? 1.6 : 1); if (calmT > 6){ calmT = 0; heat = Math.floor(heat) - 1 + .5; if (heat < 1){
      heat = 0; despawnChasers(); const loot = window.XParts ? XParts.reward('escape', chasePeak >= 4 ? 0 : chasePeak === 3 ? 1 : chasePeak === 2 ? 2 : 3, `甩掉 ${chasePeak} 星保安`) : [];   /* 改装零件, js/93-tuning-ui.js */
      toast('甩掉了保安', (chasePeak >= 4 ? `从 ${chasePeak} 星警戒里溜了` : '警戒解除') + (loot.length ? ' · 改装：' + XParts.text(loot) : '')); sfx.ding(); if (chasePeak >= 4) unlock('escape4'); chasePeak = 0; } } }
    else calmT = 0;
    sirenT -= dt; if (sirenT <= 0){ sirenT = .42; sirenHi = !sirenHi; tone('triangle', sirenHi ? 900 : 680, sirenHi ? 900 : 680, .38, .035); }
  } else heat = Math.max(0, heat - dt * .05);
  const st = Math.min(5, Math.floor(heat)), sEl = $('#stars'), txt = '★'.repeat(st) + '☆'.repeat(5 - st);
  if (sEl.textContent !== txt) sEl.textContent = txt;
}

/* ---------- GTA: stunt combos ---------- */
const stunt = {pts:0, mult:1, label:'', idle:9, total:0, driftT:0, longDone:false};
const comboEl = $('#combo');
function addStunt(label, pts){
  if (mode !== 'naiwa') return; stunt.pts += pts * stunt.mult; stunt.label = label; stunt.idle = 0; stunt.mult = Math.min(8, stunt.mult + .5);
  if (label === '飞进湖里') unlock('lake');
  if (label === '人车分离') unlock('eject');
  gx.onStunt(label, pts);
}
function bankStunt(){
  /* RM 1 per 50 points, tapering past RM 40 so one endless donut does not out-earn a dozen deliveries */
  const pts = Math.round(stunt.pts), raw = pts / 50, pay = raw <= 40 ? raw : 40 + Math.sqrt(raw - 40) * 4; stunt.total += pts; earn(pay);
  sess.bestCombo = Math.max(sess.bestCombo, pts); if (pts >= 5000) unlock('combo5k');
  $('#stunt').textContent = stunt.total.toLocaleString();
  /* 改装零件（js/93-tuning-ui.js）：连击越高档越好，有冷却和每日上限 */
  const loot = window.XParts && pts >= 1000 ? XParts.reward('stunt', pts >= 5000 ? 0 : pts >= 2500 ? 1 : 2, `特技 ${pts.toLocaleString()} 分`) : [];
  if (pts >= 300){ toast(`特技 +${pts.toLocaleString()}`, `换成 RM ${pay.toFixed(2)}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 1600); sfx.ding(); }
  stunt.pts = 0; stunt.mult = 1; stunt.label = '';
}
function updateStunt(dt, sp){
  const c = driving;
  if (c && !c.air && c.slip > 5 && sp > 10){
    stunt.pts += c.slip * dt * 8 * stunt.mult; stunt.label = wx.wet > .4 ? '雨中漂移' : '漂移'; stunt.idle = 0; stunt.mult = Math.min(8, stunt.mult + dt * .3);
    stunt.driftT += dt;
    if (stunt.driftT > 3 && !stunt.longDone){ stunt.longDone = true; addStunt('超长漂移', 250); gx.callout('超长漂移', '+250 × 连击'); }
  } else if (!c || c.slip < 3){ stunt.driftT = 0; stunt.longDone = false; }
  stunt.idle += dt;
  if (stunt.pts > 0 && stunt.idle > 2.2) bankStunt();
  const show = stunt.pts > 0;
  { const h = !show || mode !== 'naiwa'; if (comboEl.hidden !== h) comboEl.hidden = h; }
  if (show){ const h = `${stunt.label} ×${stunt.mult.toFixed(1)}<small>${Math.round(stunt.pts).toLocaleString()} 分</small>`; if (comboEl.innerHTML !== h) comboEl.innerHTML = h; }
}

/* ---------- crash grading by speed ---------- */
function wreck(c){
  c.wrecked = true; c.hp = 0; c.paint.color.set('#2a2725'); c.vx *= .3; c.vz *= .3;
  dustBurst(c.x, 1, c.z, 10, 4); sfx.crash(1);
}
function judgeCrash(c, impact){
  const kmh = impact * 3.6; if (kmh < 18) return;
  let grade, dmg;
  if (kmh < 45){ grade = '剐蹭'; dmg = (kmh - 18) * .45; }
  else if (kmh < 80){ grade = '重撞'; dmg = 12 + (kmh - 45) * .9; }
  else { grade = '车祸'; dmg = 45 + (kmh - 80) * .6; }
  dmg *= c.T.armor || 1;
  const was = c.hp; c.hp = Math.max(0, c.hp - dmg); gx.onCrash(grade, kmh);
  if (c.hp <= 0 && was > 0) wreck(c);
  if (kmh >= 80){ eject(impact); if (c.wrecked) toast('车祸！车也报废了', `${Math.round(kmh)} km/h · 去车行再叫一辆`, 2600); return; }
  toast(`${grade} · ${Math.round(kmh)} km/h`, c.wrecked ? '车报废了，下车换一辆吧' : `车况 ${Math.round(c.hp)}%`, 1500);
  if (c.wrecked){ sfx.fail(); }
}

/* ---------- XMUM 车行 ---------- */
const SHOP = [
  {kind:'myvi',  name:'Perodua Myvi', desc:'大马国民小车，皮实好停', price:60,   color:'#c0392b'},
  {kind:'p911',  name:'保时洁 911',   desc:'后置引擎，过弯很灵',     price:500,  color:'#f0eee8'},
  {kind:'mase',  name:'玛莎拉弟 GT',  desc:'意式长车头，声浪好听',   price:900,  color:'#1f3a6b'},
  {kind:'moto',  name:'疾风 R 运动摩托', desc:'两个轮子，压着弯过弯，起步最猛，但一撞就飞', price:1100, color:'#e9ecef'},
  {kind:'lambo', name:'兰博鸡尼',     desc:'楔形车身，全校最快',     price:1600, color:'#f2c230'},
  {kind:'gwag',  name:'铁方越野',     desc:'方盒子硬派越野，高、重、抗撞；能改升高、大轮胎、行李架和绞盘', price:2200, color:'#55604a'},
  {kind:'rr',    name:'劳斯来斯',     desc:'又长又稳又抗撞，奶娃坐进去像老板', price:3000, color:'#2b2b2e'}
];
const owned = new Set(); let myCar = null;
function saveGame(){ try { localStorage.setItem('xmum-gta-v1', JSON.stringify({money, owned:[...owned], stunt:stunt.total, my:myCar ? myCar.kind : null,
  up:prog.up, ach:prog.ach, best:prog.best, life:prog.life, daily:prog.daily})); } catch(e){} }
const fmtRM = v => 'RM ' + (v >= 100 ? Math.floor(v).toLocaleString() : v.toFixed(2));   /* HUD wallet: no decimals once it is 100+ */
function moneyChanged(){ moneyEl.textContent = fmtRM(money); saveGame(); }
/* ---------- 总资产 (net worth) = cash + everything bought, at the price it cost new ----------
   The 总资产 leaderboard (board 'rich' in js/net.js, which used to rank cash only) submits netWorth().
   Buying never lowers it (cash turns into an asset of the same value), so the "only goes up" rule on the board still holds.
   To add a new shop from any file, register what it has sold once at load time:
     assetSource('arcade', () => ARC_SKINS.filter(s => arcOwned.has(s.id)).reduce((sum, s) => sum + s.price, 0));
   The function returns RM and is called whenever the total is needed, so it should read the live save.
   Only count things that cannot be sold back for cash (they would count twice); a source that throws counts as 0.
   netWorth(true) returns {total, parts} with one entry per source, for debugging. */
const ASSETS = [];
function assetSource(name, fn){ const i = ASSETS.findIndex(a => a.name === name); if (i >= 0) ASSETS.splice(i, 1); ASSETS.push({name, fn}); }
function netWorth(detail){
  const parts = {cash:Math.max(0, +money || 0)}; let total = parts.cash;
  for (const a of ASSETS){ let v = 0; try { v = Math.max(0, +a.fn() || 0); } catch(e){} parts[a.name] = v; total += v; }
  return detail ? {total, parts} : total;
}
const upgSpent = list => list.reduce((s, u) => s + u.cost.slice(0, prog.up[u.k] || 0).reduce((a, b) => a + b, 0), 0);
assetSource('cars', () => SHOP.reduce((s, it) => s + (owned.has(it.kind) ? it.price : 0), 0));
assetSource('tuning', () => upgSpent(UPG));
assetSource('watergun', () => upgSpent(WUPG));
/* face: when given (the way 奶娃 is facing), the car is parked pointing the same way, beside her if it fits (right, left, behind, then
   the front corners); only when none of those spots is free does it fall back to the old ring of spots facing round her */
const SPOT_SIDES = [[1, 0], [-1, 0], [0, -1], [.7, -.7], [-.7, -.7], [.7, .7], [-.7, .7], [0, 1]];
function spotNear(px, pz, kind, face){
  const tmp = {kind, T:CAR_T[kind]};
  const free = (x, z, h) => !carBlocked(tmp, x, z, h) && !lakes.some(L => inPoly(x, z, L)) && !cars.some(c => Math.hypot(c.x - x, c.z - z) < c.R + CAR_T[kind].L / 2 + 1.5);
  if (face != null && isFinite(face)){
    const fx = Math.sin(face), fz = Math.cos(face), rx = fz, rz = -fx;
    for (let r = 4; r < 40; r += 2) for (const [a, b] of SPOT_SIDES){
      const x = px + (rx * a + fx * b) * r, z = pz + (rz * a + fz * b) * r;
      if (free(x, z, face)) return [x, z, face];
    }
  }
  for (let r = 6; r < 70; r += 3) for (let a = 0; a < 12; a++){
    const x = px + Math.cos(a * .5236) * r, z = pz + Math.sin(a * .5236) * r, h = Math.atan2(px - x, pz - z) + Math.PI / 2;
    if (!carBlocked(tmp, x, z, h) && !lakes.some(L => inPoly(x, z, L)) && !cars.some(c => Math.hypot(c.x - x, c.z - z) < c.R + CAR_T[kind].L / 2 + 1.5)) return [x, z, h];
  }
  return [px + 6, pz, 0];
}
function spawnMine(kind, x, z, h){
  const item = SHOP.find(s => s.kind === kind);
  myCar = makeCar(kind, item.color, x, z, h); myCar.personal = true; myCar.T = tunedT(kind); return item;
}
function summon(kind){
  if (myCar){ if (driving === myCar) leaveCar(); scene.remove(myCar.root); const i = cars.indexOf(myCar); if (i >= 0) cars.splice(i, 1); myCar = null; }
  const px = driving ? driving.x : nw.x, pz = driving ? driving.z : nw.z;
  const [x, z, h] = spotNear(px, pz, kind, driving ? driving.h : nw.h);   /* parked facing the way you face */
  const item = spawnMine(kind, x, z, h);
  dustBurst(x, .5, z, 8, 3); sfx.ding(); saveGame();
  toast(`${item.name} 到了`, '停在你旁边，走过去按 F 上车', 2400);
}
/* the car's picture in the list: a colour swatch here; js/ui-shop-icons.js swaps in a small render of the real model */
let carIcon = it => `<div class="sw" style="background:${it.color}"></div>`;
let upIcon = u => '';   /* 改装店 / 水枪工坊: a line icon above the level pips (js/ui-shop-icons.js) */
const statBar = v => `<div class="sb"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
function renderShop(){
  $('#shopMoney').textContent = 'RM ' + money.toFixed(2);
  $('#shopList').innerHTML = SHOP.map(it => {
    const T = CAR_T[it.kind], own = owned.has(it.kind), cur = myCar && myCar.kind === it.kind;
    const btn = own ? `<button class="btn" data-sum="${it.kind}">${cur ? '叫来修好' : '开出来'}</button>`
      : money >= it.price ? `<button class="btn buy" data-buy="${it.kind}">买下 RM ${it.price.toLocaleString()}</button>`
      : `<button class="btn" disabled>RM ${it.price.toLocaleString()} · 还差 ${Math.ceil(it.price - money).toLocaleString()}</button>`;
    return `<div class="car">${carIcon(it)}<div class="ci"><b>${it.name}</b><span>${it.desc}</span>
      <div class="st"><label>极速 ${Math.round(T.maxV * 3.6)}</label>${statBar(T.maxV / 80)}<label>加速</label>${statBar(T.acc / 30)}<label>操控</label>${statBar(T.grip * T.steer / 5.2)}<label>抗撞</label>${statBar(1 / (T.armor || 1) / 1.7)}</div></div>${btn}</div>`;
  }).join('') + '<div class="gx-uh"><b>改装店</b><span>只对你自己的车生效，买过就一直有效</span></div>' + UPG.map(u => {
    const lv = prog.up[u.k], max = lv >= u.cost.length, price = max ? 0 : u.cost[lv];
    const pips = u.cost.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    const btn = max ? '<button class="btn" disabled>已满级</button>'
      : money >= price ? `<button class="btn buy" data-up="${u.k}">升到 ${lv + 1} 级 · RM ${price}</button>`
      : `<button class="btn" disabled>RM ${price} · 还差 ${Math.ceil(price - money)}</button>`;
    return `<div class="car gx-up"><div class="gx-ui">${upIcon(u)}<div class="gx-pips" role="img" aria-label="${lv} / ${u.cost.length} 级">${pips}</div></div><div class="ci"><b>${u.name}</b><span>${u.desc}</span></div>${btn}</div>`;
  }).join('') + `<div class="gx-uh"><b>水枪工坊</b><span>步行时按 E 开枪 · 对手强度：${PVE_NAME[pveLevel()]}（水枪越强、成就越多，保安和猴子越难缠）</span></div>` + WUPG.map(u => {
    const lv = prog.up[u.k], max = lv >= u.cost.length, price = max ? 0 : u.cost[lv];
    const pips = u.cost.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    const btn = max ? '<button class="btn" disabled>已满级</button>'
      : money >= price ? `<button class="btn buy" data-up="${u.k}">升到 ${lv + 1} 级 · RM ${price}</button>`
      : `<button class="btn" disabled>RM ${price} · 还差 ${Math.ceil(price - money)}</button>`;
    return `<div class="car gx-up gx-wup"><div class="gx-ui">${upIcon(u)}<div class="gx-pips" role="img" aria-label="${lv} / ${u.cost.length} 级">${pips}</div></div><div class="ci"><b>${u.name}</b><span>${u.desc}</span></div>${btn}</div>`;
  }).join('');
}
$('#shopList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; ac();
  /* story chapter 1 (js/89-quest.js): no driving yet, so no buying or calling up cars; 小满 hands over a Myvi at the end of it */
  if ((b.dataset.buy || b.dataset.sum) && window.XQuest && XQuest.carLocked && XQuest.carLocked()){ toast('现在还用不上车', '第 1 章做完，小满学姐会送你一辆 Myvi', 2600); sfx.fail(); return; }
  if (b.dataset.buy){
    const it = SHOP.find(x => x.kind === b.dataset.buy); if (money < it.price) return;
    money -= it.price; owned.add(it.kind); moneyChanged(); closeShop(); summon(it.kind); toast('提车成功：' + it.name, `余额 RM ${money.toFixed(2)}`, 2600);
    if (SHOP.every(s => owned.has(s.kind))) unlock('allcars');
  } else if (b.dataset.sum){ closeShop(); summon(b.dataset.sum); }
  else if (b.dataset.up){
    const water = WUPG.some(x => x.k === b.dataset.up);
    const u = (water ? WUPG : UPG).find(x => x.k === b.dataset.up), lv = prog.up[u.k]; if (lv >= u.cost.length || money < u.cost[lv]) return;
    money -= u.cost[lv]; prog.up[u.k]++; if (myCar) myCar.T = tunedT(myCar.kind); moneyChanged();
    if (water && typeof wgRefresh === 'function') wgRefresh(true);
    renderShop();
    sfx.sparkle(); toast(`${u.name}升到 ${lv + 1} 级`, water ? '水枪已经换上了，下车按 E 试试' : myCar ? '你的车已经换上了' : '买辆车就能用上', 2000);
    if (!water && prog.up[u.k] >= u.cost.length) unlock('tuned');
    if (water){ unlock('wg1'); if (WUPG.every(x => prog.up[x.k] >= x.cost.length)) unlock('wgmax'); }
  }
});
function openShop(){ if (mode !== 'naiwa') return; renderShop(); $('#shop').hidden = false; }
function closeShop(){ $('#shop').hidden = true; }
$('#shopx').addEventListener('click', closeShop);
$('#garageBtn').addEventListener('click', () => { ac(); $('#shop').hidden ? openShop() : closeShop(); });
/* showroom turntable on the south lawn */
const SHOWROOM = [42, 196];
clearArea(SHOWROOM[0], SHOWROOM[1], 10, 10);
const showCar = (() => {
  const [x, z] = SHOWROOM;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, .35, 48), M('#f1ede4', {roughness:.5})); deck.position.set(x, .17, z); deck.receiveShadow = true; scene.add(deck);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.15, .12, 8, 64), goldMat); ring.rotation.x = Math.PI / 2; ring.position.set(x, .36, z); scene.add(ring);
  const c = makeCar('rr', '#2b2b2e', x, z, 0); cars.splice(cars.indexOf(c), 1); c.root.position.y = .35;
  addCircle(x, z, 6.4); addLabel('XMUM 车行', x, 5.5, z);
  return c;
})();
(function load(){
  try {
    const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (!d) return;
    money = +d.money || 0; (d.owned || []).forEach(k => { if (CAR_T[k]) owned.add(k); }); stunt.total = +d.stunt || 0;
    if (d.up) for (const u of UPG.concat(WUPG)) prog.up[u.k] = Math.max(0, Math.min(u.cost.length, d.up[u.k] | 0));
    if (d.ach && typeof d.ach === 'object'){ Object.assign(achSaved, d.ach); for (const k in d.ach) if (ACH.some(a => a[0] === k)) prog.ach[k] = +d.ach[k] || 1; }
    if (d.best && typeof d.best === 'object') for (const k in d.best) if (isFinite(d.best[k])) prog.best[k] = +d.best[k];
    if (d.life) for (const k in prog.life) prog.life[k] = +d.life[k] || 0;
    if (typeof d.daily === 'string') prog.daily = d.daily;
    moneyEl.textContent = fmtRM(money); $('#stunt').textContent = stunt.total.toLocaleString();
    if (d.my && owned.has(d.my)){ const [x, z, h] = spotNear(110, 204, d.my); spawnMine(d.my, x, z, h); }
  } catch(e){}
})();
