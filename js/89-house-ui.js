/* XMUM 校园漫游 · 买房装修的面板（房子、家具、存档在 js/89-house.js）
   跟奶娃衣橱、改装车间一个样子：电脑和横屏手机是右边一竖条，竖屏手机是底部抽屉，左边 / 上面留着看房子。打开时游戏暂停。
   两种：
   - 看房（view）：门口按 F 或看房时按「买下」。房子的资料、价格怎么来的、进去看看、买下。
   - 装修（deco）：先选风格（五套 + 墙面地板），点一件就在原位预览（镜头飞过去），买下才算数，关掉就换回原来的。
     买过的随时「摆上」或「收起」；「整套」一次买下这套还缺的、或者把这套全部换上。 */
'use strict';
const HZ_ICON = {sofa:'🛋️', tv:'📺', deco:'🪴', dine:'🍽️', kit:'🍳', yard:'🌳', bed:'🛏️', desk:'🖥️', hobby:'🎮'};
const hzEl = document.createElement('div');
hzEl.className = 'panel'; hzEl.id = 'house'; hzEl.hidden = true; hzEl.setAttribute('role', 'dialog'); hzEl.setAttribute('aria-labelledby', 'houseT');
hzEl.innerHTML = `<button class="x" id="housex" aria-label="关闭">×</button>
  <div class="shop-h"><h2 id="houseT">装修</h2><span id="houseMoney">RM 0</span></div>
  <div class="hz-home" id="houseHome" hidden></div>
  <div class="wd-tabs" id="houseTabs" role="tablist"></div>
  <div class="hz-set" id="houseSet" hidden></div>
  <div class="wd-grid" id="houseList" role="listbox"></div>
  <div class="hz-info" id="houseInfo" hidden></div>
  <div class="wd-done" id="houseDone" role="status" aria-live="polite" hidden></div>
  <div class="wd-foot"><div class="wd-sel"><b id="houseName"></b><span id="houseDesc"></span></div><div class="wd-btns"><button class="btn" id="houseAlt" hidden></button><button class="btn buy" id="houseGo"></button></div></div>`;
document.body.appendChild(hzEl);
const hzUi = {on:false, mode:'deco', h:null, tab:'nd', sel:null, look:null, yaw:0, drag:null, wasPaused:false, view:'', keep:null, last:0, cam:null};
const hzQ = s => hzEl.querySelector(s);
const hzFmt = v => 'RM ' + Math.round(v).toLocaleString();
const hzStyle = id => HZ_STYLES.find(s => s.id === id);
/* what the preview shows in each spot (used by the minimap too) */
function hzUiPlace(){ return hzUi.on && hzUi.mode === 'deco' && hzUi.look ? hzUi.look.s : null; }

function hzUiOpen(mode, h){
  if (!h) return;
  if (hzUi.on) hzUiClose(true);
  if (typeof ward !== 'undefined' && ward.on) wardClose();
  closeShop();
  Object.assign(hzUi, {on:true, mode, h, sel:null, drag:null, view:'', wasPaused:gx.paused, keep:{fov:camera.fov, near:camera.near}});
  if (mode === 'deco'){
    hzUi.look = hzLookOf(h.id);
    const o = hz.own[h.id], placed = o && HZ_SLOTS.map(s => o.s[s.id]).filter(Boolean);
    hzUi.tab = placed && placed.length ? HZ_IT[placed[placed.length - 1]].st : hzUi.tab || 'nd';
    hzUi.yaw = -.6;
  } else hzUi.yaw = HZ.in ? -.6 : Math.PI + .3;
  hzUi.dir = 1;
  gx.paused = true; keys.Space = false; engineUpdate(0, 0, false);
  /* inside, 奶娃 steps out of the picture while you decorate (it would stand in front of the sofa) */
  if (mode === 'deco' && HZ.in && !driving) NW.root.visible = false;
  document.body.classList.add('wd-open', 'hz-open'); hzEl.hidden = false; hzQ('#houseDone').hidden = true;
  hzRender();
  requestAnimationFrame(hzFrame);
}
function hzUiClose(quiet){
  if (!hzUi.on) return;
  const h = hzUi.h, o = h && hz.own[h.id];
  /* a preview that was not bought goes back to what is saved */
  let tried = false;
  if (hzUi.mode === 'deco' && HZ.in === h){
    const saved = hzLookOf(h.id), L = hzUi.look;
    tried = L.w !== saved.w || L.f !== saved.f || HZ_SLOTS.some(s => (L.s[s.id] || '') !== (saved.s[s.id] || ''));
    if (tried) hzDress(saved);
  }
  hzUi.on = false; hzEl.hidden = true; document.body.classList.remove('hz-open');
  if (mode === 'naiwa') NW.root.visible = true;
  if (!(typeof ward !== 'undefined' && ward.on) && !(typeof tn !== 'undefined' && tn.on)) document.body.classList.remove('wd-open');
  gx.paused = hzUi.wasPaused; camera.clearViewOffset(); hzUi.view = '';
  if (hzUi.keep){ camera.fov = hzUi.keep.fov; camera.near = hzUi.keep.near; camera.updateProjectionMatrix(); }
  if (!driving) camYaw = nw.h + Math.PI;
  if (tried && !quiet && o) toast('刚才只是预览，换回原来的了', '点「买下」或「摆上」才算数', 2800);
  canvas.focus({preventScroll:true});
}

/* ---------- what is selected, and what the big button does ---------- */
const hzOwnsItem = id => { const o = hz.own[hzUi.h.id]; return !!o && o.it.includes(id); };
const hzOwnsWall = id => { const o = hz.own[hzUi.h.id], w = hzWallOf(id); return !w.price || (!!o && o.ow.includes(id)); };
const hzOwnsFloor = id => { const o = hz.own[hzUi.h.id], f = hzFloorOf(id); return !f.price || (!!o && o.of.includes(id)); };
function hzSelInfo(){
  const s = hzUi.sel; if (!s) return null;
  if (s.startsWith('w:')){ const w = hzWallOf(s.slice(2)); return {kind:'wall', id:w.id, name:'墙面 · ' + w.name, price:w.price, own:hzOwnsWall(w.id), on:hzUi.look.w === w.id, saved:hz.own[hzUi.h.id].w === w.id, desc:'整套房子的内墙一起刷'}; }
  if (s.startsWith('f:')){ const f = hzFloorOf(s.slice(2)); return {kind:'floor', id:f.id, name:'地板 · ' + f.name, price:f.price, own:hzOwnsFloor(f.id), on:hzUi.look.f === f.id, saved:hz.own[hzUi.h.id].f === f.id, desc:'楼上楼下一起铺'}; }
  const it = HZ_IT[s], sl = HZ_SLOTS.find(q => q.id === it.slot), o = hz.own[hzUi.h.id];
  return {kind:'item', id:it.id, it, sl, name:it.name, price:it.price, own:hzOwnsItem(it.id), saved:!!o && o.s[sl.id] === it.id, miss:hzMissing(it), desc:`${sl.room}（${sl.name}）· ${it.desc}`};
}
function hzRenderFoot(){
  const go = hzQ('#houseGo'), alt = hzQ('#houseAlt'), nm = hzQ('#houseName'), ds = hzQ('#houseDesc');
  alt.hidden = true; go.disabled = false; go.className = 'btn buy';
  if (hzUi.mode === 'view'){
    const h = hzUi.h; nm.textContent = h.name; ds.textContent = `${h.tag} · 买下后按 F 回家装修`;
    if (!HZ.in){ alt.hidden = false; alt.textContent = '进去看看'; }
    if (money >= h.price) go.textContent = '买下 ' + hzFmt(h.price);
    else { go.textContent = `还差 ${hzFmt(Math.ceil(h.price - money))}`; go.disabled = true; go.className = 'btn'; }
    return;
  }
  const s = hzSelInfo();
  if (!s){ nm.textContent = hzUi.tab === 'wall' ? '墙面和地板' : hzStyle(hzUi.tab).name; ds.textContent = hzUi.tab === 'wall' ? '点一个颜色先看效果' : `${hzStyle(hzUi.tab).desc} · 点一件先在原位看效果`; go.hidden = true; return; }
  go.hidden = false; nm.textContent = s.name;
  let d = s.desc;
  if (s.kind === 'item' && s.it.need) d += ` · 需要 ${hzNeedText(s.it.need)}`;
  ds.textContent = d;
  if (s.own){
    if (s.kind === 'item'){
      if (s.saved){ go.textContent = '收起'; go.className = 'btn'; }
      else go.textContent = '摆上';
    } else if (s.saved){ go.textContent = '正在用'; go.disabled = true; go.className = 'btn'; }
    else go.textContent = '换上';
    return;
  }
  if (s.miss && s.miss.length){ go.textContent = '缺 ' + s.miss.map(m => m.txt).join('、'); go.disabled = true; go.className = 'btn'; return; }
  if (money >= s.price) go.textContent = '买下 ' + hzFmt(s.price);
  else { go.textContent = `还差 ${hzFmt(Math.ceil(s.price - money))}`; go.disabled = true; go.className = 'btn'; }
}

/* ---------- drawing the panel ---------- */
function hzRender(){
  const h = hzUi.h; hzQ('#houseMoney').textContent = fmtRM(money);
  const tabs = hzQ('#houseTabs'), list = hzQ('#houseList'), info = hzQ('#houseInfo'), set = hzQ('#houseSet');
  if (hzUi.mode === 'view'){
    hzQ('#houseT').textContent = `No. ${h.no} · 出售`;
    tabs.hidden = list.hidden = set.hidden = hzQ('#houseHome').hidden = true; info.hidden = false;
    const n = hzOwnedList().length;
    info.innerHTML = `<div class="hz-tags"><b>${h.tag}</b><span>双层排屋</span><span>3 房 2 卫</span><span>约 1,195 平方尺</span><span>带车棚和后院</span></div>
      <p class="hz-lead">${h.desc}</p>
      <dl class="hz-dl"><dt>地址</dt><dd>${h.name}（Taman Warisan Megah，Bell Avenue 后面，离南门约 160 米）</dd>
      <dt>价格</dt><dd><b>${hzFmt(h.price)}</b>。附近同款排屋真实成交价大约 RM 37–45 万，这套按 RM ${h.real} 万算，游戏里除以 50。</dd>
      <dt>格局</dt><dd>一楼客厅、饭厅、厨房、卫生间、后院；二楼主卧、次卧、小房间。开着自己的车到门口车棚前下车，车自动停进车棚，下次上线还在。第一套房子买下后自动设成<b>出生点</b>，打开游戏就站在家门口（装修面板里能改）。</dd>
      <dt>装修</dt><dd>五套风格、九个位置，家具一件件买；墙面、地板另外换。电竞房要改装道具，奶娃主题要解锁够多成就。</dd>
      <dt>总资产</dt><dd>房价和装修全部按原价算进总资产，财富排行榜上一分不少。${n ? `你已经有 ${n} 套了。` : ''}</dd></dl>`;
    hzRenderFoot(); return;
  }
  info.hidden = true; tabs.hidden = list.hidden = false;
  /* 出生点: where the game starts. One line on top, one button */
  { const home = hz.home && hzById(hz.home), here = hz.home === h.id, el = hzQ('#houseHome'); el.hidden = false;
    el.innerHTML = `<span>🏠 出生点：<b>${here ? '就在这套房子门口' : home ? 'No. ' + home.no + ' 门口' : '校园里（车行旁边）'}</b></span><button type="button" class="btn" data-home="${here ? '' : h.id}">${here ? '改回校园' : '设成这里'}</button>`; }
  hzQ('#houseT').textContent = `装修 · No. ${h.no}`;
  const o = hz.own[h.id];
  tabs.innerHTML = HZ_STYLES.map(s => { const n = HZ_ITEMS.filter(it => it.st === s.id && o.it.includes(it.id)).length;
    return `<button type="button" role="tab" data-tab="${s.id}" aria-selected="${hzUi.tab === s.id}"><i class="hz-dot" style="background:${s.col}"></i>${s.name}${n ? ` <small>${n}/9</small>` : ''}</button>`; }).join('')
    + `<button type="button" role="tab" data-tab="wall" aria-selected="${hzUi.tab === 'wall'}">墙面 · 地板</button>`;
  if (hzUi.tab === 'wall'){
    set.hidden = true;
    const tile = (key, name, sw, price, own, on) => `<button type="button" class="wd-it${hzUi.sel === key ? ' sel' : ''}" data-k="${key}" role="option" aria-selected="${hzUi.sel === key}">
      <span class="wd-sw" style="background:${sw}"></span><b>${name}</b><em class="${on ? 'on' : own ? '' : 'p'}">${on ? '正在用' : own ? '已拥有' : price ? hzFmt(price) : '免费'}</em></button>`;
    list.innerHTML = '<div class="hz-h">墙面</div>' + HZ_WALLS.map(w => tile('w:' + w.id, w.name, w.col, w.price, hzOwnsWall(w.id), o.w === w.id)).join('')
      + '<div class="hz-h">地板</div>' + HZ_FLOORS.map(f => tile('f:' + f.id, f.name, hzFloorSw(f), f.price, hzOwnsFloor(f.id), o.f === f.id)).join('');
  } else {
    const st = hzStyle(hzUi.tab), items = HZ_ITEMS.filter(it => it.st === st.id);
    list.innerHTML = items.map(it => {
      const sl = HZ_SLOTS.find(q => q.id === it.slot), own = o.it.includes(it.id), on = o.s[sl.id] === it.id, miss = hzMissing(it);
      const tag = it.need ? (it.need.ach ? '<i class="t-l">成就</i>' : '<i class="t-r">道具</i>') : '';
      const em = on ? '<em class="on">已摆上</em>' : own ? '<em>已拥有</em>' : miss.length ? `<em>${miss[0].txt}</em>` : `<em class="p">${hzFmt(it.price)}</em>`;
      return `<button type="button" class="wd-it hz-it${hzUi.sel === it.id ? ' sel' : ''}${it.need ? (it.need.ach ? ' tier-l' : ' tier-r') : ''}" data-k="${it.id}" role="option" aria-selected="${hzUi.sel === it.id}">
        ${tag}<span class="wd-sw hz-ic" style="background:${st.col}">${HZ_ICON[sl.id]}</span><b>${it.name}</b><small>${sl.room}</small>${em}</button>`;
    }).join('');
    /* the whole set: buy what is still missing (only what you can have right now), or put it all out */
    const left = items.filter(it => !o.it.includes(it.id) && !hzMissing(it).length), cost = left.reduce((s, it) => s + it.price, 0);
    const idle = items.filter(it => o.it.includes(it.id) && o.s[it.slot] !== it.id);
    if (left.length){ set.hidden = false; set.innerHTML = `<span>还能买 ${left.length} 件 · 合计 ${hzFmt(cost)}${items.some(it => hzMissing(it).length) ? ' · 其余要道具或成就' : ''}</span><button type="button" class="btn${money >= cost ? ' buy' : ''}" data-set="buy"${money >= cost ? '' : ' disabled'}>${money >= cost ? '一次买齐并摆上' : '钱不够买齐'}</button>`; }
    else if (idle.length){ set.hidden = false; set.innerHTML = `<span>这套有 ${idle.length} 件收着没摆</span><button type="button" class="btn buy" data-set="place">整套摆上</button>`; }
    else set.hidden = true;
  }
  hzRenderFoot();
}
function hzFloorSw(f){
  if (f.id === 'oak' || f.id === 'walnut') return `repeating-linear-gradient(0deg,${f.col} 0 7px,rgba(0,0,0,.25) 7px 8px)`;
  if (f.id === 'tile') return `repeating-linear-gradient(0deg,${f.col} 0 9px,#c9c6be 9px 10px),${f.col}`;
  if (f.id === 'marble') return `linear-gradient(135deg,${f.col} 40%,#c8c8cc 45%,${f.col} 50%)`;
  if (f.id === 'terr') return `radial-gradient(circle at 30% 40%,#8f8a80 0 1.5px,transparent 2px) 0 0/7px 7px,radial-gradient(circle at 70% 70%,#a77e5c 0 1.5px,transparent 2px) 0 0/9px 9px,${f.col}`;
  return f.col;
}
function hzDone(t, sub){
  const el = hzQ('#houseDone'); el.innerHTML = '<b></b><span></span>'; el.querySelector('b').textContent = t; el.querySelector('span').textContent = sub || '';
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

/* ---------- taps ---------- */
hzQ('#housex').addEventListener('click', () => { ac(); hzUiClose(); });
hzQ('#houseTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return; ac();
  hzUi.tab = b.dataset.tab; hzUi.sel = null; hzRender();
});
hzQ('#houseList').addEventListener('click', e => {
  const b = e.target.closest('[data-k]'); if (!b) return; ac();
  const k = b.dataset.k; hzUi.sel = k;
  const L = hzUi.look;
  if (k.startsWith('w:')) L.w = k.slice(2); else if (k.startsWith('f:')) L.f = k.slice(2);
  else { const it = HZ_IT[k]; L.s[it.slot] = it.id; }
  hzDress(L); hzUi.yaw = hzUi.yaw - .25; tone('sine', 660, 760, .06, .05);
  hzRender();
});
hzQ('#houseSet').addEventListener('click', e => {
  const b = e.target.closest('[data-set]'); if (!b || b.disabled) return; ac();
  const h = hzUi.h, o = hz.own[h.id], items = HZ_ITEMS.filter(it => it.st === hzUi.tab);
  if (b.dataset.set === 'buy'){
    const left = items.filter(it => !o.it.includes(it.id) && !hzMissing(it).length), cost = left.reduce((s, it) => s + it.price, 0);
    if (!left.length || money < cost) return;
    money -= cost; hz.spent += cost; for (const it of left) o.it.push(it.id);
    hzDone(`买下 ${left.length} 件${hzStyle(hzUi.tab).name}家具`, `花了 ${hzFmt(cost)}，已经摆好；总资产一分没少`);
  } else hzDone(`整套${hzStyle(hzUi.tab).name}摆上了`, '换下来的家具还在，随时换回去');
  for (const it of items) if (o.it.includes(it.id)) o.s[it.slot] = it.id;
  hzUi.look.s = Object.assign({}, o.s); hzUi.sel = null;
  hzWrite(); moneyChanged(); hzDress(hzUi.look); sfx.sparkle(); hzCheckAch(h.id); hzRender();
});
hzQ('#houseHome').addEventListener('click', e => {
  const b = e.target.closest('[data-home]'); if (!b) return; ac();
  hz.home = b.dataset.home && hz.own[b.dataset.home] ? b.dataset.home : null; hzWrite(); tone('triangle', 660, 880, .1, .07);
  hzDone(hz.home ? '出生点设好了' : '出生点改回校园了', hz.home ? '下次打开游戏就站在这套房子门口' : '下次打开游戏在车行旁边');
  hzRender();
});
hzQ('#houseAlt').addEventListener('click', () => {
  ac(); if (hzUi.mode !== 'view' || HZ.in) return;
  const h = hzUi.h; hzUiClose(true); hzEnter(h, true);
});
hzQ('#houseGo').addEventListener('click', () => {
  ac(); const h = hzUi.h;
  if (hzUi.mode === 'view'){
    if (!hzBuy(h)){ hzRender(); return; }
    const inside = HZ.in === h; hzUiClose(true);
    if (!inside) hzEnter(h); else hzUiOpen('deco', h);
    toast('房子是你的了', `${hz.home === h.id ? '出生点设在这里了，' : ''}${TOUCH ? '点「装修」' : '按 F'}挑风格买家具；开车到车棚前下车，车自动停好`, 4200);
    return;
  }
  const s = hzSelInfo(); if (!s) return;
  const o = hz.own[h.id];
  if (s.kind === 'item'){
    if (s.own){
      if (s.saved){ delete o.s[s.sl.id]; delete hzUi.look.s[s.sl.id]; hzDone(`${s.name} 收起来了`, '还是你的，随时再摆上'); }
      else { o.s[s.sl.id] = s.id; hzUi.look.s[s.sl.id] = s.id; hzDone(`${s.name} 摆上了`, s.sl.room); }
    } else {
      if (s.miss.length || money < s.price || !hzTakeParts(s.it.need)) return;
      money -= s.price; hz.spent += s.price; o.it.push(s.id); o.s[s.sl.id] = s.id; hzUi.look.s[s.sl.id] = s.id;
      hzDone(`买下 ${s.name}`, `${s.sl.room} · ${hzFmt(s.price)}${s.it.need && !s.it.need.ach ? ' + ' + hzNeedText(s.it.need) : ''} · 总资产一分没少`);
      sfx.sparkle();
    }
  } else {
    const list = s.kind === 'wall' ? o.ow : o.of;
    if (!s.own){ if (money < s.price) return; money -= s.price; hz.spent += s.price; list.push(s.id); sfx.sparkle(); }
    if (s.kind === 'wall') o.w = s.id; else o.f = s.id;
    hzDone(`${s.name} ${s.own ? '换上了' : '买下了'}`, s.desc);
  }
  hzWrite(); moneyChanged(); hzDress(hzUi.look); hzCheckAch(h.id); hzRender();
});

/* ---------- the camera while the panel is open: circles the selected spot (or the house front) in the part of the screen the panel leaves free ---------- */
function hzCamTarget(){
  const h = hzUi.h;
  if (hzUi.mode === 'view' && !HZ.in) return {x:h.ux + 3, y:2.4, z:h.zf, d:12.5, up:4.6};
  const s = hzUi.mode === 'deco' && hzSelInfo();
  if (s && s.kind === 'item') return {x:HX(s.sl.x, s.sl.fl), y:.8, z:HZZ(s.sl.z), d:7, up:6.5};
  const fl = HZ.fl; return {x:HX(0, fl), y:.5, z:HZZ(fl ? 7 : 8), d:12, up:12};
}
function hzFrame(now){
  if (!hzUi.on) return;
  requestAnimationFrame(hzFrame);
  const dt = Math.min(.05, (now - (hzUi.last || now)) / 1000); hzUi.last = now;
  /* outside, the camera only swings left and right in front of the house (the row behind and the houses next door are in the way); inside it goes all the way round */
  const outside = hzUi.mode === 'view' && !HZ.in;
  if (!hzUi.drag && !REDUCED) hzUi.yaw += dt * .16 * (hzUi.dir || 1);
  if (outside){ if (hzUi.yaw > Math.PI + .55){ hzUi.yaw = Math.PI + .55; hzUi.dir = -1; } else if (hzUi.yaw < Math.PI - .55){ hzUi.yaw = Math.PI - .55; hzUi.dir = 1; } }
  const t = hzCamTarget(), W = window.innerWidth, H = window.innerHeight, r = hzEl.getBoundingClientRect();
  const wide = r.left > W * .3, ox = wide ? Math.round(r.width / 2 + 8) : 0, oy = wide ? 0 : Math.round(Math.min(H * .62, H - r.top) / 2);
  const key = W + 'x' + H + ':' + ox + ',' + oy;
  if (key !== hzUi.view){ hzUi.view = key; camera.setViewOffset(W, H, ox, oy, W, H); }
  const k = wide ? 1 : Math.min(1.9, .95 / Math.max(.35, 1 - Math.min(H * .62, H - r.top) / H));
  if (camera.fov !== 50 || camera.near !== .5){ camera.fov = 50; camera.near = .5; camera.updateProjectionMatrix(); }
  /* the camera eases towards its spot, so picking another piece flies over to it */
  const kd = outside ? Math.min(k, 1.1) : k;   /* outside there is a row of houses behind the camera: go up, not back */
  const want = new THREE.Vector3(t.x + Math.sin(hzUi.yaw) * t.d * kd, t.y + t.up * (outside ? Math.min(k, 1.15) : k), t.z + Math.cos(hzUi.yaw) * t.d * kd);
  if (!hzUi.cam) hzUi.cam = {p:want.clone(), l:new THREE.Vector3(t.x, t.y, t.z)};
  const a = 1 - Math.exp(-dt * 5); hzUi.cam.p.lerp(want, a); hzUi.cam.l.lerp(new THREE.Vector3(t.x, t.y, t.z), a);
  camera.position.copy(hzUi.cam.p); camera.lookAt(hzUi.cam.l);
  fitShadow(Math.round(t.x / 20) * 20, Math.round(t.z / 20) * 20, 60);
}
/* drag on the 3D view to turn round */
canvas.addEventListener('pointerdown', e => { if (hzUi.on) hzUi.drag = {id:e.pointerId, x:e.clientX}; });
window.addEventListener('pointermove', e => { if (hzUi.drag && e.pointerId === hzUi.drag.id){ hzUi.yaw -= (e.clientX - hzUi.drag.x) * .008; hzUi.drag.x = e.clientX; } });
const hzUp = e => { if (hzUi.drag && e.pointerId === hzUi.drag.id) hzUi.drag = null; };
window.addEventListener('pointerup', hzUp); window.addEventListener('pointercancel', hzUp);
/* while open the game keys do nothing; Esc closes */
window.addEventListener('keydown', e => {
  if (!hzUi.on) return;
  if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); hzUiClose(); return; }
  if (e.target.closest && e.target.closest('#house') && /^(Enter|Space|Tab|Arrow)/.test(e.code)) return;
  e.stopImmediatePropagation();
}, true);
/* the panel's money line follows the wallet (a reward can land while it is open) */
{ const base = moneyChanged; moneyChanged = function(){ base(); if (hzUi.on) hzQ('#houseMoney').textContent = fmtRM(money); }; }
/* the camera eases in from where the game camera was */
{ const open = hzUiOpen; hzUiOpen = function(mode, h){ open(mode, h); if (hzUi.on) hzUi.cam = {p:camera.position.clone(), l:new THREE.Vector3(nw.x, nw.y + 1, nw.z)}; }; }
Object.assign(window.XHouse, {open:(mode, id) => hzUiOpen(mode || 'deco', hzById(id) || HZ.in || HZ_HOUSES[0]), close:() => hzUiClose(), ui:hzUi});
