/* XMUM 校园漫游 · 奶娃衣橱和喷漆店的界面、存档、成就（目录和穿戴在 js/32-wardrobe.js）
   打开时游戏暂停，镜头转到奶娃（或你的车）正面慢慢绕，点一件就试穿，买下才算数，关掉就换回原来的。
   喷漆车间（GTA 的 Pay 'n' Spray）：开着自己的车冲进去，卷帘门落下，自动换漆，警戒清零，每星 RM 50（详见下面「喷漆车间」一节）。
   存档：localStorage 'xmum-wardrobe-v1'（Google 登录的人由 js/net.js 跟其他 xmum-* 键一起云同步）。
   对外：window.XWard = {open(kind), close(), on, lookStr()} */
'use strict';
const WD_KEY = 'xmum-wardrobe-v1';
const wardSave = {own:new Set(['classic', 'std']), look:wdLook(null), pOwn:new Set(['stock', 'd_none']), cars:{}, spent:0};
function wardWrite(){
  try { localStorage.setItem(WD_KEY, JSON.stringify({own:[...wardSave.own], look:wardSave.look, pOwn:[...wardSave.pOwn], cars:wardSave.cars, spent:Math.round(wardSave.spent)})); } catch(e){}
}
(function wardLoad(){
  try {
    const d = JSON.parse(localStorage.getItem(WD_KEY) || 'null'); if (!d) return;
    (d.own || []).forEach(id => { if (WD.byId[id] && WD.byId[id].slot !== 'paint' && WD.byId[id].slot !== 'decal') wardSave.own.add(id); });
    (d.pOwn || []).forEach(id => { if (WD.byId[id] && (WD.byId[id].slot === 'paint' || WD.byId[id].slot === 'decal')) wardSave.pOwn.add(id); });
    const l = wdLook(d.look); for (const s in l) if (l[s] && !wardSave.own.has(l[s])) l[s] = WD_DEFAULT[s];   /* only what was bought */
    wardSave.look = l;
    if (d.cars && typeof d.cars === 'object') for (const k in d.cars){ const c = d.cars[k]; if (CAR_T[k] && c) wardSave.cars[k] = {p:wardSave.pOwn.has(c.p) ? c.p : 'stock', d:wardSave.pOwn.has('d_' + c.d) ? c.d : 'none'}; }
    wardSave.spent = Math.max(0, +d.spent || 0);
  } catch(e){}
})();

/* two achievements; the save in js/80-gta.js only keeps ids it knows, so re-read ours after adding them */
ACH.push(['newlook', '新衣服', '第一次在奶娃衣橱买东西', 10], ['repaint', '改头换面', '第一次给自己的车喷漆', 20]);
try { const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (d && d.ach) for (const k of ['newlook', 'repaint']) if (d.ach[k]) prog.ach[k] = +d.ach[k] || 1; } catch(e){}

/* 总资产 (js/80-gta.js netWorth): clothes and paint jobs at their shop price; the 宿舍 exclusives are counted in js/89-dorm-ui.js */
assetSource('wardrobe', () => [...wardSave.own].reduce((s, id) => { const it = WD.byId[id]; return s + (it && !it.dorm ? it.price || 0 : 0); }, 0));
assetSource('paint', () => [...wardSave.pOwn].reduce((s, id) => s + ((WD.byId[id] && WD.byId[id].price) || 0), 0));

/* the player wears the saved look from the start; personal cars get their saved paint whenever they are summoned */
nwDress(NW, wardSave.look);
const wardStock = kind => (SHOP.find(s => s.kind === kind) || {}).color;
function wardPaintMine(){
  if (!myCar) return; const c = wardSave.cars[myCar.kind] || {p:'stock', d:'none'};
  carPaint(myCar, c.p, c.d, wardStock(myCar.kind));
}
{ const base = spawnMine; spawnMine = function(kind, x, z, h){ const it = base(kind, x, z, h); wardPaintMine(); return it; }; }
wardPaintMine();

/* ---------- panel ---------- */
const wardEl = document.createElement('div');
wardEl.className = 'panel'; wardEl.id = 'ward'; wardEl.hidden = true; wardEl.setAttribute('role', 'dialog'); wardEl.setAttribute('aria-labelledby', 'wardT');
wardEl.innerHTML = `<button class="x" id="wardx" aria-label="关闭">×</button>
  <div class="shop-h"><h2 id="wardT">奶娃衣橱</h2><span id="wardMoney">RM 0.00</span></div>
  <div class="wd-tabs" id="wardTabs" role="tablist"></div>
  <div class="wd-grid" id="wardList" role="listbox"></div>
  <div class="wd-done" id="wardDone" role="status" aria-live="polite" hidden></div>
  <div class="wd-foot"><div class="wd-sel"><b id="wardName"></b><span id="wardDesc"></span></div><div class="wd-btns"><button class="btn" id="wardOff" hidden>脱下</button><button class="btn buy" id="wardBuy"></button></div></div>`;
document.body.appendChild(wardEl);
const ward = {on:false, spray:0, kind:'naiwa', tab:'skin', sel:null, try:null, yaw:0, drag:null, wasPaused:false, pose:0, view:''};
const wTabs = {naiwa:WD_SLOTS, car:[['paint', '车漆'], ['decal', '贴花']]};
const wdOptional = s => !['skin', 'shape', 'paint', 'decal'].includes(s);
function wardItems(slot){
  if (slot === 'paint') return WD_PAINTS.map(p => WD.byId[p.id]);
  if (slot === 'decal') return WD_DECALS.map(d => WD.byId['d_' + d.id]);
  return WD_ITEMS.filter(it => it.slot === slot);
}
const wardOwned = id => id == null || (ward.kind === 'car' ? wardSave.pOwn : wardSave.own).has(id);
/* what is worn right now in this slot (saved), and what the preview shows */
function wardWorn(slot){
  if (slot === 'paint' || slot === 'decal'){ const c = myCar && wardSave.cars[myCar.kind] || {p:'stock', d:'none'}; return slot === 'paint' ? c.p : 'd_' + c.d; }
  return wardSave.look[slot];
}
const wardSw = it => {
  if (!it) return 'transparent';
  if (it.slot === 'skin') return it.tex === 'rainbow' ? 'linear-gradient(135deg,#f44,#fb3,#4c4,#39f,#a4f)' : it.tex === 'galaxy' ? 'radial-gradient(circle at 30% 30%,#7a46c8,#151a4d 70%)' : it.tex === 'crestBody' ? 'radial-gradient(circle,#fff 0 32%,#3c80e0 34%)' : it.skin;
  if (it.slot === 'paint') return it.color || (myCar && wardStock(myCar.kind)) || '#ccc';
  return it.sw || null;
};
const WD_SW = {shirt:'#f4f3ef', police:'#a9c8ea', redvest:'#c8302a', santa:'#c4262b', detective:'#24252a', hero:'#2c55c2', emperor:'#2a2216', melon:'#2d6a29', pineapple:'#d9ab3c',
  santahat:'#c4262b', buns:'#1d1a18', fedora:'#1c1c1f', policecap:'#1c2338', tricorn:'#18181a', pearl:'#3d5fa8', mian:'#141210', meh:'#3a2a1e', glasses:'#1d1d1f', shades:'#111113',
  bowtie:'#c8302a', chain:'#d9ab45', bag:'#3d7fd0', cape:'#c62d2a', furcape:'#b8322a', coffee:'#1f1f22', boba:'#d7b48a', seal:'#5fae7e', std:'#f2c64a', chubby:'#f2c64a', slim:'#f2c64a', big:'#f2c64a',
  d_none:'transparent', d_stripes:'#f6f4ee', d_xmum:'#b5442a', d_checker:'repeating-conic-gradient(#111 0 25%,#f6f4ee 0 50%) 50%/10px 10px', d_flames:'linear-gradient(90deg,#ffe24a,#d92b16)',
  d_melon:'repeating-linear-gradient(90deg,#2d6a29 0 6px,#93c75f 6px 10px)', d_nwface:'#f2c64a', d_galaxy:'radial-gradient(circle at 30% 30%,#7a46c8,#151a4d 70%)'};
for (const id in WD_SW) if (WD.byId[id]) WD.byId[id].sw = WD_SW[id];
const fmtP = v => 'RM ' + Math.round(v).toLocaleString();

function wardRender(){
  $('#wardMoney').textContent = fmtRM(money);
  $('#wardT').textContent = ward.kind === 'car' ? (ward.garage ? '喷漆车间 · ' : '喷漆店 · ') + (myCar ? myCar.T.name : '') : '奶娃衣橱';
  const tabs = wTabs[ward.kind];
  $('#wardTabs').innerHTML = tabs.map(([s, n]) => `<button type="button" role="tab" data-tab="${s}" aria-selected="${s === ward.tab}">${n}</button>`).join('');
  const items = wardItems(ward.tab), worn = wardWorn(ward.tab), cur = ward.try[ward.tab];
  const tiles = (wdOptional(ward.tab) ? [null] : []).concat(items);
  $('#wardList').innerHTML = tiles.map(it => {
    const id = it ? it.id : '', own = wardOwned(it && it.id), on = (it ? it.id : null) === (worn || null), sel = (it ? it.id : null) === (cur || null);
    const sw = it ? wardSw(it) : null, tag = !it ? '' : on ? `<em class="on">${ward.kind === 'car' ? '在用' : '穿着'}</em>` : own ? '<em>已有</em>' : `<em class="p">${it.price ? fmtP(it.price) : '免费'}</em>`;
    const tier = it && it.tier !== 'n' ? `<i class="t-${it.tier}">${WD_TIER[it.tier]}</i>` : '';
    return `<button type="button" role="option" class="wd-it${sel ? ' sel' : ''}${it ? ' tier-' + it.tier : ''}" aria-selected="${sel}" data-id="${id}">
      <span class="wd-sw${sw ? '' : ' none'}" style="${sw ? 'background:' + sw : ''}"></span><b>${it ? it.name : (ward.tab === 'outfit' ? '不穿' : '不戴')}</b>${tier}${tag}</button>`;
  }).join('');
  wardFoot();
}
function wardFoot(){
  const id = ward.sel, it = id ? WD.byId[id] : null, buy = $('#wardBuy'), off = $('#wardOff');
  const worn = wardWorn(ward.tab);
  off.hidden = !(wdOptional(ward.tab) && worn);
  if (!it){
    $('#wardName').textContent = ward.kind === 'car' ? '选一种漆或贴花' : '点一件试穿';
    $('#wardDesc').textContent = ward.spray ? `换一种漆或贴花，保安就认不出你了 · 加急费 ${fmtRM(sprayFee())}` : ward.kind === 'car' ? '先预览再买，买过的随时换' : '买过的随时换着穿，存档会记住';
    buy.hidden = true; return;
  }
  $('#wardName').textContent = it.name + (it.tier !== 'n' ? ' · ' + WD_TIER[it.tier] : '');
  $('#wardDesc').textContent = (it.desc || (it.fin ? WD_FIN[it.fin].n : '')) + (ward.spray ? ` · 换上就甩掉警戒，加急费 ${fmtRM(sprayFee())}` : '');
  buy.hidden = false; buy.disabled = false; buy.className = 'btn buy';
  if (wardOwned(id)){ if (id === worn){ buy.textContent = ward.kind === 'car' ? '正在用' : '已穿上'; buy.disabled = true; buy.className = 'btn'; } else buy.textContent = ward.kind === 'car' ? '换上' : '穿上'; }
  else if (money >= it.price) buy.textContent = '买下 ' + fmtP(it.price);
  else { buy.textContent = fmtP(it.price) + ' · 还差 ' + fmtP(Math.ceil(it.price - money)); buy.disabled = true; buy.className = 'btn'; }
}
/* show the preview: the saved look with whatever is being tried */
function wardShow(){
  if (ward.kind === 'car'){ if (myCar) carPaint(myCar, ward.try.paint, String(ward.try.decal || 'd_none').slice(2), wardStock(myCar.kind)); }
  else nwDress(NW, ward.try);
}
function wardPick(id){
  $('#wardDone').hidden = true;
  ward.sel = id || null; ward.try[ward.tab] = id || (wdOptional(ward.tab) ? null : ward.try[ward.tab]);
  wardShow(); wardRender(); tone('triangle', 660, 880, .08, .05);
  if (ward.kind === 'naiwa' && !driving && !nw.air && nw.state !== 'fly' && id){ nw.state = 'pose'; nw.t = 0; ward.pose = 2.4; }
}
function wardEquip(slot, id){
  let cleared = null;
  if (ward.kind === 'car'){
    const c = wardSave.cars[myCar.kind] || (wardSave.cars[myCar.kind] = {p:'stock', d:'none'});
    if (slot === 'paint') c.p = id; else c.d = id.slice(2);
    if (ward.spray) cleared = sprayClear();
  } else wardSave.look[slot] = id;
  wardWrite();
  return cleared;
}
/* feedback that stays inside the panel until the next tap (the toast and the HUD stars are behind it on phones) */
function wardDone(title, sub){
  const el = $('#wardDone'); el.innerHTML = '<b></b><span></span>'; el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub || '';
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
/* a puff of the new colour round the car, with a spray-can hiss */
function wardSprayFx(){
  if (!myCar) return;
  const col = '#' + myCar.paint.color.getHexString(), fx = Math.sin(myCar.h), fz = Math.cos(myCar.h), L = myCar.T.L, W = myCar.T.W;
  for (let i = 0; i < 26; i++){
    const a = (rnd() - .5) * L, side = rnd() < .5 ? -1 : 1, x = myCar.x + fx * a + fz * side * W * .6, z = myCar.z + fz * a - fx * side * W * .6;
    spawnPart('dust', x, myCar.y + .4 + rnd() * myCar.T.H, z, .9 + rnd() * .8, {grow:1.6, vx:fz * side * (1 + rnd() * 2), vy:.6 + rnd(), vz:-fx * side * (1 + rnd() * 2), life:1.1 + rnd() * .6, op:.75, color:col});
  }
  tone('sawtooth', 5200, 3800, .55, .025); tone('square', 6400, 5600, .4, .015, .05); sfx.sparkle();
}
function wardBuy(){
  const id = ward.sel, it = id && WD.byId[id]; if (!it) return;
  if (!wardOwned(id)){
    if (money < it.price) return;
    money -= it.price; wardSave.spent += it.price; (ward.kind === 'car' ? wardSave.pOwn : wardSave.own).add(id); moneyChanged();
    if (ward.kind !== 'car') sfx.sparkle();
    unlock(ward.kind === 'car' ? 'repaint' : 'newlook');
  } else if (ward.kind !== 'car') sfx.ding();
  const fee = wardEquip(ward.tab, id); wardRender();
  if (ward.kind === 'car'){
    wardSprayFx();
    wardDone('喷好了：' + it.name, fee != null ? `警戒解除，保安认不出你了 · 加急费 ${fmtRM(fee)}` : `已存档，下次叫车也是这个样子 · 余额 ${fmtRM(money)}`);
  } else wardDone('穿上了：' + it.name, `已存档 · 余额 ${fmtRM(money)}`);
}
$('#wardList').addEventListener('click', e => { const b = e.target.closest('.wd-it'); if (b){ ac(); wardPick(b.dataset.id); } });
$('#wardTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; ac(); ward.tab = b.dataset.tab; ward.sel = ward.try[ward.tab] || null; wardRender(); });
$('#wardTabs').addEventListener('keydown', e => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault();
  const t = wTabs[ward.kind], i = t.findIndex(x => x[0] === ward.tab); ward.tab = t[(i + d + t.length) % t.length][0]; ward.sel = ward.try[ward.tab] || null; wardRender();
  const n = $('#wardTabs [aria-selected="true"]'); if (n) n.focus();
});
$('#wardBuy').addEventListener('click', () => { ac(); wardBuy(); });
$('#wardOff').addEventListener('click', () => { ac(); ward.try[ward.tab] = null; ward.sel = null; wardEquip(ward.tab, null); wardShow(); wardRender(); wardDone('脱下了', '已存档'); });
$('#wardx').addEventListener('click', () => wardClose());

/* ---------- open / close, fitting-room camera ---------- */
function wardOpen(kind, atSpray){
  kind = kind === 'car' ? 'car' : 'naiwa';
  if (ward.on) wardClose();
  if (mode !== 'naiwa'){ if (typeof titleOpen !== 'undefined' && titleOpen) XUI.closeTitle('naiwa'); else setMode('naiwa'); }
  if (kind === 'car' && !myCar){ toast('先去车行买辆车', '喷漆只给你自己的车', 2400); return; }
  closeShop(); if (gx.paused) gx.togglePause();
  ward.kind = kind; ward.tab = kind === 'car' ? 'paint' : 'skin';
  ward.try = kind === 'car' ? {paint:wardWorn('paint'), decal:wardWorn('decal')} : Object.assign({}, wardSave.look);
  ward.sel = ward.try[ward.tab] || null;
  ward.spray = kind === 'car' && atSpray && heat >= 1 ? Math.min(5, Math.floor(heat)) : 0;
  ward.garage = kind === 'car' && !!atSpray;
  ward.wasPaused = gx.paused; gx.paused = true; ward.on = true; keys.Space = false; engineUpdate(0, 0, false);
  const t = wardTarget(); ward.yaw = kind === 'car' ? t.h + .8 : t.h;
  document.body.classList.add('wd-open'); wardEl.hidden = false; wardRender();
  const f = $('#wardTabs [aria-selected="true"]'); if (f) f.focus({preventScroll:true});
  requestAnimationFrame(wardFrame);
}
function wardClose(){
  if (!ward.on) return;
  /* tapping a tile only previews; say so if the player closes before buying, instead of quietly changing back */
  const tried = ward.kind === 'car' ? myCar && (ward.try.paint !== wardWorn('paint') || ward.try.decal !== wardWorn('decal')) : Object.keys(WD_DEFAULT).some(k => (ward.try[k] || null) !== (wardSave.look[k] || null));
  ward.on = false; wardEl.hidden = true; document.body.classList.remove('wd-open'); $('#wardDone').hidden = true;
  if (ward.kind === 'car') wardPaintMine(); else nwDress(NW, wardSave.look);
  if (tried) toast(ward.kind === 'car' ? '刚才只是试色，没有喷上' : '刚才只是试穿，换回原来的了', ward.kind === 'car' ? '选好后点「买下」或「换上」才会喷到车上' : '选好后点「买下」或「穿上」才算数', 3000);
  if (nw.state === 'pose' && ward.pose > 0) nw.state = 'idle';
  gx.paused = ward.wasPaused; camera.clearViewOffset(); ward.view = ''; camera.near = .3; camera.updateProjectionMatrix();
  if (!driving) camYaw = nw.h + Math.PI;
  canvas.focus({preventScroll:true});
}
function wardTarget(){
  if (ward.kind === 'car' && myCar) return {x:myCar.x, y:myCar.y + myCar.T.H * .45, z:myCar.z, h:myCar.h, d:myCar.T.L * .9 + 3.2, up:1.6, r:myCar.T.L * .62 + .6};
  const p = NW.root.getWorldPosition(new THREE.Vector3()), s = NW.body.scale.x;
  return {x:p.x, y:p.y + 1.25 * s, z:p.z, h:driving ? driving.h : nw.h, d:4.6 * s + (driving ? 2 : 0), up:.55, r:driving ? driving.T.L * .62 + .6 : 1.7 * s};
}
let wardLast = 0;
function wardFrame(now){
  if (!ward.on) return;
  requestAnimationFrame(wardFrame);
  const dt = Math.min(.05, (now - (wardLast || now)) / 1000); wardLast = now;
  if (!ward.drag && !REDUCED) ward.yaw += dt * .25;
  if (ward.pose > 0){ ward.pose -= dt; nw.t += dt; if (ward.pose <= 0 && nw.state === 'pose') nw.state = 'idle'; }
  const t = wardTarget(), W = window.innerWidth, H = window.innerHeight, r = wardEl.getBoundingClientRect();
  /* keep the subject in the part of the screen the panel leaves free; a side panel (computers, phones held sideways) or a bottom sheet (phones upright) */
  const wide = r.top < H * .3, ox = wide ? Math.round(r.width / 2 + 8) : 0, oy = wide ? 0 : Math.round(Math.min(H * .6, H - r.top) / 2);
  const key = W + 'x' + H + ':' + ox + ',' + oy;
  if (key !== ward.view){ ward.view = key; camera.setViewOffset(W, H, ox, oy, W, H); }
  const d = t.d * (wide ? 1 : Math.min(2.4, .9 / Math.max(.3, 1 - Math.min(H * .6, H - r.top) / H)));   /* phones: back off so it fits above the sheet */
  /* clip away whatever stands between the camera and the subject (hedges, trees, lamp posts) */
  const near = Math.max(.3, d - t.r);
  if (camera.fov !== 50 || Math.abs(camera.near - near) > .01){ camera.fov = 50; camera.near = near; camera.updateProjectionMatrix(); }
  camera.position.set(t.x + Math.sin(ward.yaw) * d, t.y + t.up, t.z + Math.cos(ward.yaw) * d);
  camera.lookAt(t.x, t.y, t.z);
  fitShadow(Math.round(t.x / 20) * 20, Math.round(t.z / 20) * 20, 60);
  if (myCar) showCar.root.rotation.y += dt * .4;
}
/* ---------- 喷漆车间, GTA style: drive in and the shutter comes down ----------
   开着自己的车冲进门就行：卷帘门落下（追兵丢了视线），车自动刹停，2~3 秒自动换一种漆，开门时警戒清零，按星收费（每星 RM 50）。
   不用停稳、不用管附近有没有巡逻车、不用开面板，手机上一个按钮都不用点。钱不够门就不关，提示还差多少。
   同一个车间喷完要冷却 2 分钟。没被通缉时停在车间里按 F（手机：停稳一会儿）打开完整的喷漆店挑颜色。
   车间：window.XSPRAY.door（Bell 那间，js/13-outskirts.js）。
   door = {x, z 门口中点, h 朝里的朝向, w 内宽, d 进深, top 门洞高}。对外：window.XSprays */
const SPRAY_FEE = 50, SPRAY_CD = 120;
const SPRAYS = [];
const sprayShutterTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#aab2ba'; g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 116; y += 8){ g.fillStyle = '#c8cfd5'; g.fillRect(0, y, 64, 4); g.fillStyle = '#7f878f'; g.fillRect(0, y + 6, 64, 2); }
  for (let x = 0; x < 64; x += 16){ g.fillStyle = '#f2c230'; g.fillRect(x, 116, 8, 12); g.fillStyle = '#1f2125'; g.fillRect(x + 8, 116, 8, 12); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = ANISO; return t;
})();
function sprayAdd(D, name){
  const tex = sprayShutterTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(D.w / 2)), 1);
  const geo = new THREE.BoxGeometry(D.w, D.top, .12).translate(0, -D.top / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map:tex, roughness:.6, metalness:.3}));
  m.position.set(D.x + Math.sin(D.h) * .2, D.top, D.z + Math.cos(D.h) * .2); m.rotation.y = D.h; m.scale.y = .02; m.visible = false; m.castShadow = true; scene.add(m);
  /* the building only draws its roof and lintel from outside: give the inside a ceiling and a wall above the shutter (seen only from in there) */
  const fx = Math.sin(D.h), fz = Math.cos(D.h), ceil = D.ceil || D.top + 1.45, inMat = M('#3b3f45', {roughness:.85});
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.d).rotateX(Math.PI / 2), inMat); roof.rotation.y = D.h; roof.position.set(D.x + fx * D.d / 2, ceil, D.z + fz * D.d / 2); scene.add(roof);
  const lin = new THREE.Mesh(new THREE.PlaneGeometry(D.w, ceil - D.top), inMat); lin.rotation.y = D.h; lin.position.set(D.x + fx * .35, (D.top + ceil) / 2, D.z + fz * .35); scene.add(lin);
  const G = {D, name, door:m, k:0, cd:0, done:false, still:0, panel:false};
  SPRAYS.push(G); return G;
}
function sprayDoor(G, k){ G.k = k; G.door.scale.y = Math.max(.02, k); G.door.visible = k > .03; }
/* where p is relative to a garage: v = metres in from the door, u = metres to the side */
function sprayAt(G, p){ const D = G.D, dx = p.x - D.x, dz = p.z - D.z, fx = Math.sin(D.h), fz = Math.cos(D.h); return {v:dx * fx + dz * fz, u:dx * fz - dz * fx}; }
/* the Bell one (js/13-outskirts.js); without a door spec, a box in front of XSPRAY */
if (window.XSPRAY){ const S = XSPRAY; sprayAdd(S.door || {x:S.x, z:S.z - 10, h:S.h || 0, w:12, d:16, top:3.8}, 'Bell 喷漆'); }
/* a new colour for the respray: one you already own if there is one, otherwise a plain one (yours from now on) */
function sprayPick(kind){
  const cur = (wardSave.cars[kind] || {}).p || 'stock';
  const own = WD_PAINTS.filter(p => wardSave.pOwn.has(p.id) && p.id !== cur);
  const pool = own.length ? own : WD_PAINTS.filter(p => p.id !== 'stock' && p.id !== cur && p.tier === 'n' && p.price <= 80);
  return pool[Math.floor(rnd() * pool.length)].id;
}
const spray = {msg:'', run:null, here:null};
const sprayFee = () => Math.min(money, SPRAY_FEE * ward.spray);
/* the full paint shop opened in a garage while wanted: changing the paint there clears the alert too */
function sprayClear(){
  const st = ward.spray; ward.spray = 0; if (st < 1 || heat < 1) return null;
  const fee = Math.min(money, SPRAY_FEE * st);
  money -= fee; moneyChanged();
  const peak = Math.max(chasePeak, st);
  heat = 0; calmT = 0; chasePeak = 0; despawnChasers();
  const loot = window.XParts ? XParts.reward('spray', 0, '喷漆甩掉警戒') : [];   /* 改装零件, js/93-tuning-ui.js */
  sfx.ding(); toast('换了一身漆，保安认不出你了', `警戒解除 · 加急喷漆费 ${fmtRM(fee)}${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`, 2800);
  if (peak >= 4) unlock('escape4');
  return fee;
}
function sprayUpdate(dt){
  spray.msg = ''; spray.here = null;
  if (ward.on || spray.run || !SPRAYS.length) return;
  const p = driving || nw, now = Date.now(), wanted = heat >= 1;
  for (const G of SPRAYS){
    const a = sprayAt(G, p), inside = a.v > 1.2 && a.v < G.D.d && Math.abs(a.u) < G.D.w / 2;
    if (!inside){
      if (a.v < .5 || Math.abs(a.u) > G.D.w){ G.done = false; G.panel = false; G.still = 0; }
      if (driving === myCar && a.v > -16 && a.v <= 1.2 && Math.abs(a.u) < G.D.w * .8)
        spray.msg = wanted ? (G.cd > now ? `这间车间刚喷过，还要等 ${Math.ceil((G.cd - now) / 1000)} 秒` : `直接开进去：卷帘门一关就换漆甩掉保安（每星 RM ${SPRAY_FEE}）`) : '喷漆车间：开进去给车换漆';
      continue;
    }
    if (!driving){ spray.msg = '喷漆车间：开着自己的车进来'; return; }
    if (driving !== myCar){ spray.msg = '喷漆车间只给你自己的车喷漆'; return; }
    if (wanted && !G.done){
      const left = Math.ceil((G.cd - now) / 1000), stars = Math.min(5, Math.floor(heat)), fee = SPRAY_FEE * stars;
      if (left > 0){ spray.msg = `这间车间刚喷过，还要等 ${left} 秒`; return; }
      if (money < fee){ spray.msg = `喷漆要 ${fmtRM(fee)}，还差 ${fmtRM(Math.ceil(fee - money))}，门不关`; return; }
      sprayRun(G, stars, fee); return;
    }
    /* not wanted (or just resprayed): pick a colour yourself */
    spray.here = G;
    G.still = Math.hypot(driving.vx, driving.vz) < 1 ? G.still + dt : 0;
    spray.msg = G.done ? '喷好了，开出去吧' : TOUCH ? '停稳一会儿就打开喷漆店' : '按 F 打开喷漆店挑颜色';
    if (TOUCH && !G.done && !G.panel && G.still > 1.2) sprayPanel(G);
    return;
  }
}
function sprayPanel(G){ G.panel = true; wardOpen('car', true); if (G.cd > Date.now() && ward.spray){ ward.spray = 0; wardRender(); } }
/* the respray: the car rolls in and stops, shutter down, a mist of the new colour, shutter up, stars gone */
function sprayRun(G, stars, fee){
  const D = G.D, c = myCar, fx = Math.sin(D.h), fz = Math.cos(D.h), park = Math.min(D.d - c.T.L / 2 - .8, Math.max(c.T.L / 2 + 1.6, D.d * .55));
  const cam = camera.position.clone();
  if (sprayAt(G, cam).v > -2) cam.set(D.x - fx * 8, D.top + 1.4, D.z - fz * 8);   /* watch the door from outside */
  spray.run = {G, stars, fee, t:0, c, x0:c.x, z0:c.z, h0:c.h, x1:D.x + fx * park, z1:D.z + fz * park, h1:D.h, cam, paint:sprayPick(c.kind), painted:false, cleared:false, was:gx.paused, last:0};
  gx.paused = true; keys.Space = false; engineUpdate(0, 0, false); c.vx = c.vz = 0;
  document.body.classList.add('sp-run');
  tone('square', 140, 90, .5, .06); noise(.6, .12, 400);
  requestAnimationFrame(sprayFrame);
}
const _spL = new THREE.Vector3(), spWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function sprayFrame(now){
  const R = spray.run; if (!R) return;
  requestAnimationFrame(sprayFrame);
  const dt = Math.min(.05, (now - (R.last || now)) / 1000); R.last = now; R.t += dt;
  const t = R.t, G = R.G, D = G.D, c = R.c, fx = Math.sin(D.h), fz = Math.cos(D.h);
  /* 0 – .8 s: roll in to the middle and stop while the shutter drops */
  const k = 1 - Math.pow(1 - Math.min(1, t / .8), 3);
  c.x = R.x0 + (R.x1 - R.x0) * k; c.z = R.z0 + (R.z1 - R.z0) * k; c.h = R.h0 + spWrap(R.h1 - R.h0) * k; c.vx = c.vz = 0; c.steer = 0;
  c.y = groundAt(c.x, c.z); c.root.position.set(c.x, c.y, c.z); c.root.rotation.set(0, c.h, 0);
  sprayDoor(G, t < 3.1 ? Math.min(1, t / .75) : Math.max(0, 1 - (t - 3.1) / .7));
  _spL.set(c.x, c.y + c.T.H * .45, c.z);
  if (t < .9 || t > 3.1){ camera.position.copy(R.cam); camera.lookAt(t < .9 ? _spL : _spL.set(D.x, D.top * .5, D.z)); }
  else {
    /* inside: from a back corner, looking at the nose */
    const rx = fz, rz = -fx, b = D.d - 1.1; camera.position.set(D.x + fx * b + rx * (D.w / 2 - 1.1), c.y + 2.7, D.z + fz * b + rz * (D.w / 2 - 1.1)); camera.lookAt(_spL);
    if (rnd() < .7){
      const s = rnd() < .5 ? -1 : 1, al = (rnd() - .5) * c.T.L, cf = Math.sin(c.h), cz = Math.cos(c.h);
      spawnPart('dust', c.x + cf * al + cz * s * c.T.W * .7, c.y + .3 + rnd() * c.T.H, c.z + cz * al - cf * s * c.T.W * .7, .7 + rnd() * .6,
        {grow:1.5, vx:cz * s * 1.2, vy:.5 + rnd() * .6, vz:-cf * s * 1.2, life:.9 + rnd() * .5, op:.7, color:WD_PAINT[R.paint].color || '#ffffff'});
    }
    if (t > 1.0 && t - dt <= 1.0){ tone('sawtooth', 5200, 3800, 1.1, .03); tone('square', 6400, 5600, .9, .018, .1); }
    if (!R.painted && t > 1.7){
      R.painted = true; const w = wardSave.cars[c.kind] || (wardSave.cars[c.kind] = {p:'stock', d:'none'});
      wardSave.pOwn.add(R.paint); w.p = R.paint; wardWrite(); wardPaintMine(); sfx.sparkle(); unlock('repaint');
    }
  }
  updateParts(dt);
  fitShadow(Math.round(c.x / 20) * 20, Math.round(c.z / 20) * 20, 60);
  /* shutter going up: the alert is gone */
  if (!R.cleared && t > 3.1){
    R.cleared = true; const fee = Math.min(money, R.fee), peak = Math.max(chasePeak, R.stars);
    money -= fee; moneyChanged(); heat = 0; calmT = 0; chasePeak = 0; despawnChasers(); G.cd = Date.now() + SPRAY_CD * 1000; G.done = true;
    sfx.ding(); if (peak >= 4) unlock('escape4');
    const loot = window.XParts ? XParts.reward('spray', 0, '喷漆甩掉警戒') : [];   /* 改装零件, js/93-tuning-ui.js */
    R.msg = [`换成了${WD_PAINT[R.paint].name}，保安认不出你了`, `警戒解除 · 喷漆费 ${fmtRM(fee)}（每星 RM ${SPRAY_FEE}）${loot.length ? ' · 改装：' + XParts.text(loot) : ''}`];
  }
  if (t > 3.85){
    spray.run = null; sprayDoor(G, 0); document.body.classList.remove('sp-run');
    gx.paused = R.was; camYaw = c.h + Math.PI;
    gx.callout('甩掉了！', WD_PAINT[R.paint].name, '#e84d8a'); toast(R.msg[0], R.msg[1], 3000);
  }
}
/* F in the garage (not wanted) opens the full paint shop instead of getting out; nothing works during the respray */
window.addEventListener('keydown', e => {
  if (spray.run){ e.preventDefault(); e.stopImmediatePropagation(); return; }
  if ((e.code !== 'KeyF' && e.code !== 'Enter') || e.repeat || ward.on || !spray.here || mode !== 'naiwa' || gx.paused) return;
  if (driving !== myCar || Math.hypot(driving.vx, driving.vz) > 4) return;
  e.preventDefault(); e.stopImmediatePropagation(); sprayPanel(spray.here);
}, true);
{
  const up = gx.update, pr = gx.prompt, mi = gx.mini;
  gx.update = function(dt, px, pz){ up.call(this, dt, px, pz); sprayUpdate(dt); };
  gx.prompt = function(){ return spray.msg || pr.call(this); };
  /* on the minimap; while you are wanted the ones you can use pulse */
  gx.mini = function(dot){
    mi.call(this, dot);
    const hot = heat >= 1, pulse = .5 + .5 * Math.sin(performance.now() / 160), now = Date.now();
    for (const G of SPRAYS){ const on = hot && G.cd <= now; dot(G.D.x + Math.sin(G.D.h) * G.D.d / 2, G.D.z + Math.cos(G.D.h) * G.D.d / 2, on && pulse > .5 ? '#ffffff' : '#e84d8a', on ? 9 + pulse * 4 : 7); }
  };
}
window.XSprays = SPRAYS;

/* drag on the 3D view to turn the model */
canvas.addEventListener('pointerdown', e => { if (ward.on) ward.drag = {id:e.pointerId, x:e.clientX}; });
window.addEventListener('pointermove', e => { if (ward.drag && e.pointerId === ward.drag.id){ ward.yaw -= (e.clientX - ward.drag.x) * .008; ward.drag.x = e.clientX; } });
const wardUp = e => { if (ward.drag && e.pointerId === ward.drag.id) ward.drag = null; };
window.addEventListener('pointerup', wardUp); window.addEventListener('pointercancel', wardUp);
/* while open, the game keys do nothing; Esc closes. C opens the wardrobe in 奶娃 mode. */
window.addEventListener('keydown', e => {
  if (!ward.on) return;
  if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); wardClose(); return; }
  if (e.target.closest && e.target.closest('#ward') && /^(Enter|Space|Tab|Arrow)/.test(e.code)) return;
  e.stopImmediatePropagation();
}, true);
window.addEventListener('keydown', e => {
  if (e.code !== 'KeyC' || e.repeat || ward.on || mode !== 'naiwa' || gx.paused || e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
  wardOpen('naiwa');
});

/* ---------- entry points: title screen, HUD, 车行, pause menu ---------- */
{ const b = $('#tWard'); if (b) b.addEventListener('click', () => { ac(); wardOpen('naiwa'); }); }
{ const b = $('#wardBtn'); if (b) b.addEventListener('click', () => { ac(); wardOpen('naiwa'); }); }
{
  const row = document.createElement('div'); row.className = 'wd-entry';
  row.innerHTML = '<button type="button" class="btn" data-w="naiwa">奶娃衣橱</button><button type="button" class="btn" data-w="car">喷漆店</button>';
  row.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b){ ac(); wardOpen(b.dataset.w); } });
  $('#shop').insertBefore(row, $('#shopList'));
}
{
  const go = $('#gxpShop'); if (go){ const b = document.createElement('button'); b.className = 'btn'; b.id = 'gxpWard'; b.textContent = '衣橱';
    b.addEventListener('click', () => { ac(); wardOpen('naiwa'); }); go.parentNode.insertBefore(b, go); }
}

window.XWard = {
  open:wardOpen, close:wardClose, get on(){ return ward.on; },
  /* what other players should see: the saved look, plus the paint job while driving your own car */
  lookStr(){
    const ids = [wdLookStr(wardSave.look)];
    if (driving && driving === myCar){ const c = wardSave.cars[myCar.kind]; if (c){ if (c.p !== 'stock') ids.push(c.p); if (c.d !== 'none') ids.push('d_' + c.d); } }
    return ids.filter(Boolean).join(',');
  }
};
