/* XMUM 校园漫游 · 保安追捕、特技连击、撞车判定、车行 */
'use strict';
/* ---------- GTA: security chase ---------- */
const patrols = [];
for (let i = 0; i < 4; i++){ const c = makeCar('patrol', '#f4f2ec', 0, 5000 + i * 20, 0); cars.splice(cars.indexOf(c), 1); c.patrol = true; c.active = false; c.root.visible = false; c.inp = {thr:0, steer:0, brake:false}; patrols.push(c); }
let heat = 0, calmT = 0, spawnCd = 0, sirenT = 0, sirenHi = false, bustT = 0, warned = false;
function despawnChasers(){
  for (const c of patrols){ if (!c.active) continue; c.active = false; c.root.visible = false; const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); if (driving === c) leaveCar(); }
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
  if (c.stuck > 0){ c.stuck -= dt; c.inp.thr = -1; c.inp.steer = -(Math.sign(da) || 1); c.inp.brake = false; return; }
  c.lowT = sp < 1.5 ? c.lowT + dt : 0; if (c.lowT > 1.1){ c.stuck = 1.1; c.lowT = 0; }
  c.inp.thr = Math.abs(da) > 1.9 ? .5 : 1; c.inp.steer = Math.max(-1, Math.min(1, da * 2.2)); c.inp.brake = Math.abs(da) > 1.1 && sp > 14;
}
function busted(){
  const fine = money * .3; money -= fine; moneyChanged();
  heat = 0; calmT = 0; bustT = 0; despawnChasers();
  if (driving) leaveCar();
  nw.x = 110; nw.z = 204; nw.y = 0; nw.state = 'idle'; nw.h = Math.PI; camYaw = 0;
  sfx.fail(); toast('被保安抓住了', fine > .005 ? `罚款 RM ${fine.toFixed(2)}，警戒解除` : '没钱罚，警告一次，警戒解除', 2800);
}
function updateChase(dt){
  const tx = driving ? driving.x : nw.x, tz = driving ? driving.z : nw.z;
  const stars = Math.min(5, Math.floor(heat));
  const active = patrols.filter(c => c.active && c !== driving);
  if (stars >= 1 && !warned){ warned = true; toast('保安盯上你了', '撞东西、吓到同学都会让警戒升级', 2400); }
  if (stars === 0) warned = false;
  spawnCd -= dt;
  if (active.length < Math.min(4, stars) && spawnCd <= 0){ spawnChaser(tx, tz); spawnCd = 2.5; }
  let minD = 1e9;
  for (const c of active){
    chaseInput(c, tx, tz, dt);
    const d = Math.hypot(c.x - tx, c.z - tz); minD = Math.min(minD, d);
    c.farT = d > 100 ? (c.farT || 0) + dt : 0;
    if (c.farT > 7){ c.farT = 0; c.active = false; c.root.visible = false; cars.splice(cars.indexOf(c), 1); spawnChaser(tx, tz); continue; }
    const on = Math.floor(performance.now() / 160) % 2 === 0;
    c.lights[0].emissiveIntensity = on ? 2.2 : .1; c.lights[1].emissiveIntensity = on ? .1 : 2.2;
  }
  if (active.length){
    const mySp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
    if (minD < (driving ? 5.5 : 3.2) && mySp < 4) bustT += dt * (driving ? 1 : 1.6); else bustT = Math.max(0, bustT - dt);
    if (bustT > 1.5){ busted(); return; }
    if (minD > 150){ calmT += dt; if (calmT > 6){ calmT = 0; heat = Math.floor(heat) - 1 + .5; if (heat < 1){ heat = 0; despawnChasers(); toast('甩掉了保安', '警戒解除'); sfx.ding(); } } }
    else calmT = 0;
    sirenT -= dt; if (sirenT <= 0){ sirenT = .42; sirenHi = !sirenHi; tone('triangle', sirenHi ? 900 : 680, sirenHi ? 900 : 680, .38, .035); }
  } else heat = Math.max(0, heat - dt * .05);
  const st = Math.min(5, Math.floor(heat)), sEl = $('#stars'), txt = '★'.repeat(st) + '☆'.repeat(5 - st);
  if (sEl.textContent !== txt) sEl.textContent = txt;
}

/* ---------- GTA: stunt combos ---------- */
const stunt = {pts:0, mult:1, label:'', idle:9, total:0};
const comboEl = $('#combo');
function addStunt(label, pts){ if (mode !== 'naiwa') return; stunt.pts += pts * stunt.mult; stunt.label = label; stunt.idle = 0; stunt.mult = Math.min(8, stunt.mult + .5); }
function bankStunt(){
  const pts = Math.round(stunt.pts); stunt.total += pts; const pay = pts / 50; money += pay; moneyChanged();
  $('#stunt').textContent = stunt.total.toLocaleString();
  if (pts >= 300){ toast(`特技 +${pts.toLocaleString()}`, `换成 RM ${pay.toFixed(2)}`, 1600); sfx.ding(); }
  stunt.pts = 0; stunt.mult = 1; stunt.label = '';
}
function updateStunt(dt, sp){
  const c = driving;
  if (c && !c.air && c.slip > 5 && sp > 10){ stunt.pts += c.slip * dt * 8 * stunt.mult; stunt.label = '漂移'; stunt.idle = 0; stunt.mult = Math.min(8, stunt.mult + dt * .3); }
  stunt.idle += dt;
  if (stunt.pts > 0 && stunt.idle > 2.2) bankStunt();
  const show = stunt.pts > 0;
  comboEl.hidden = !show || mode !== 'naiwa';
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
  const was = c.hp; c.hp = Math.max(0, c.hp - dmg);
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
  {kind:'lambo', name:'兰博鸡尼',     desc:'楔形车身，全校最快',     price:1600, color:'#f2c230'},
  {kind:'rr',    name:'劳斯来斯',     desc:'又长又稳又抗撞，奶娃坐进去像老板', price:3000, color:'#2b2b2e'}
];
const owned = new Set(); let myCar = null;
function saveGame(){ try { localStorage.setItem('xmum-gta-v1', JSON.stringify({money, owned:[...owned], stunt:stunt.total, my:myCar ? myCar.kind : null})); } catch(e){} }
function moneyChanged(){ moneyEl.textContent = 'RM ' + money.toFixed(2); saveGame(); }
function spotNear(px, pz, kind){
  const tmp = {kind, T:CAR_T[kind]};
  for (let r = 6; r < 70; r += 3) for (let a = 0; a < 12; a++){
    const x = px + Math.cos(a * .5236) * r, z = pz + Math.sin(a * .5236) * r, h = Math.atan2(px - x, pz - z) + Math.PI / 2;
    if (!carBlocked(tmp, x, z, h) && !lakes.some(L => inPoly(x, z, L)) && !cars.some(c => Math.hypot(c.x - x, c.z - z) < c.R + CAR_T[kind].L / 2 + 1.5)) return [x, z, h];
  }
  return [px + 6, pz, 0];
}
function spawnMine(kind, x, z, h){
  const item = SHOP.find(s => s.kind === kind);
  myCar = makeCar(kind, item.color, x, z, h); myCar.personal = true; return item;
}
function summon(kind){
  if (myCar){ if (driving === myCar) leaveCar(); scene.remove(myCar.root); const i = cars.indexOf(myCar); if (i >= 0) cars.splice(i, 1); myCar = null; }
  const px = driving ? driving.x : nw.x, pz = driving ? driving.z : nw.z;
  const [x, z, h] = spotNear(px, pz, kind);
  const item = spawnMine(kind, x, z, h);
  dustBurst(x, .5, z, 8, 3); sfx.ding(); saveGame();
  toast(`${item.name} 到了`, '停在你旁边，走过去按 F 上车', 2400);
}
const statBar = v => `<div class="sb"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
function renderShop(){
  $('#shopMoney').textContent = 'RM ' + money.toFixed(2);
  $('#shopList').innerHTML = SHOP.map(it => {
    const T = CAR_T[it.kind], own = owned.has(it.kind), cur = myCar && myCar.kind === it.kind;
    const btn = own ? `<button class="btn" data-sum="${it.kind}">${cur ? '叫来修好' : '开出来'}</button>`
      : money >= it.price ? `<button class="btn buy" data-buy="${it.kind}">买下 RM ${it.price.toLocaleString()}</button>`
      : `<button class="btn" disabled>RM ${it.price.toLocaleString()} · 还差 ${Math.ceil(it.price - money).toLocaleString()}</button>`;
    return `<div class="car"><div class="sw" style="background:${it.color}"></div><div class="ci"><b>${it.name}</b><span>${it.desc}</span>
      <div class="st"><label>极速 ${Math.round(T.maxV * 3.6)}</label>${statBar(T.maxV / 80)}<label>加速</label>${statBar(T.acc / 30)}<label>操控</label>${statBar(T.grip * T.steer / 5.2)}<label>抗撞</label>${statBar(1 / (T.armor || 1) / 1.7)}</div></div>${btn}</div>`;
  }).join('');
}
$('#shopList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; ac();
  if (b.dataset.buy){
    const it = SHOP.find(x => x.kind === b.dataset.buy); if (money < it.price) return;
    money -= it.price; owned.add(it.kind); moneyChanged(); closeShop(); summon(it.kind); toast('提车成功：' + it.name, `余额 RM ${money.toFixed(2)}`, 2600);
  } else if (b.dataset.sum){ closeShop(); summon(b.dataset.sum); }
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
    moneyEl.textContent = 'RM ' + money.toFixed(2); $('#stunt').textContent = stunt.total.toLocaleString();
    if (d.my && owned.has(d.my)){ const [x, z, h] = spotNear(110, 204, d.my); spawnMine(d.my, x, z, h); }
  } catch(e){}
})();
