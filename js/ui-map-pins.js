/* XMUM 校园漫游 · 大地图（M）上的地点：图标 + 名字，重叠的合成一个，「筛选」按类别开关
 *
 * 仓库主人：「优化一下地图，看的不方便，漏了地点，并且没人会去看最下面一行」。
 * 以前大地图上只有一堆没名字的彩色圆点，要对着最下面一行图例认颜色。现在：
 *   - 每个地点画成一个白底圆形图标（emoji），外圈是类别的颜色，旁边写简短的名字。
 *     名字分三档（p）：0 = 主线 / 正在导航的，永远写；1 = 大地方（车行、IOI、KIP、ERL、游乐园……）；2 = 普通地点；3 = 小地方（宿舍门口、打卡点……）。
 *     缩得越小只写越重要的名字，字的大小也跟着缩放走；名字互相不压，压到的就不写。
 *   - 屏幕上挨得很近的地点合成一个，图标右上角写数量；点一下（电脑上悬停也行）弹出一张小卡片列出里面所有地点。
 *   - 右上角「筛选」：主线 · 外卖 · 玩法 · 吃喝商店 · 交通 · 校园和住处，点一下开关一类，记在 localStorage（xmum-map-cats）。
 *     正在导航的目标和主线星星不受筛选影响，永远显示。
 *   - 当前导航目标（指南针指的地方，js/50-missions.js 的 compassTgt）外面加一圈跳动的金色圆环和「导航 · …」的牌子；
 *     不在画面里时贴在边上，带一个指向它的小箭头。
 * 地点从哪来：
 *   1. 小地图那一串 gx.mini(dot) 钩子：各个文件画点的时候多给一个说明 dot(x, z, 颜色, 半径, {i:图标, t:名字, c:类别, p:档, s:小字, k:去重键})，
 *      小地图不看它；大地图（drawMini 的 o.pins）把点收进来交给这里画。没写说明的点照旧画成小圆点。
 *   2. 下面 PLACES 表：有名字、但平时小地图上不画点的地方（车行、IOI、KIP 购物中心、游乐园、找到的特技跳台……），
 *      还有平时画点、但做任务时会藏起来的地方（嘛嘛档、ERL）。k 和第 1 类的点一样时，以第 1 类为准。
 *   3. 主线：js/89-quest-ui.js 把星星和有事找你的「!」也交给这里（o.pins），写上名字。
 * 楼名（js/90-main.js miniNames）在最后写，压到地点图标或名字的就不写；和地点重名的（「外卖取餐 · D6 食堂」「XMUM 车行」……）也不写。
 * 对外：window.XMapPins = {CATS, draw(mo, view), off:{类别: true}} */
'use strict';
(function(){
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  /* English mode (js/i18n.js) translates whole strings: put each piece through it before gluing them together */
  const tr = s => g(() => window.XI18N && XI18N.lang !== 'zh' ? XI18N.t(String(s)) : String(s), String(s));

  /* ---------- categories (the filter chips, in this order) ---------- */
  const CATS = [
    {id:'main',   n:'主线 · 导航', i:'⭐', col:'#f5b301', fixed:true},
    {id:'food',   n:'外卖',       i:'🥡', col:'#ff8a3d'},
    {id:'play',   n:'玩法',       i:'🎮', col:'#4a8fe8', en:'Activities'},   /* 「玩法」 alone is 「How to play」 in the dictionary */
    {id:'shop',   n:'吃喝商店',   i:'🛍️', col:'#e0559a'},
    {id:'go',     n:'交通',       i:'🚆', col:'#8a5cf0'},
    {id:'campus', n:'校园 · 住处', i:'🏫', col:'#3aa676'}
  ];
  const CAT = {}; for (const c of CATS) CAT[c.id] = c;
  const KEY = 'xmum-map-cats';
  const off = g(() => { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); const o = {}; if (Array.isArray(a)) for (const k of a) if (CAT[k] && !CAT[k].fixed) o[k] = true; return o; }, {});
  const saveOff = () => g(() => localStorage.setItem(KEY, JSON.stringify(Object.keys(off).filter(k => off[k]))));

  /* ---------- places with no dot of their own ---------- */
  /* where a 3D label stands (js/00-core.js addLabel): the exact text, else one that starts with it (「Kota Warisan 夜市（傍晚开市）」) */
  const lab = text => () => {
    const L = g(() => labels.find(l => !l.dead && l.el.textContent === text) || labels.find(l => !l.dead && l.el.textContent.indexOf(text) === 0), null);
    return L ? [L.pos.x, L.pos.z] : null;
  };
  const PLACES = [
    {k:'showroom', i:'🚗', t:'XMUM 车行', s:'买车 · 改装车间 · 喷漆店（靠近按 G）', c:'shop', p:1, lab:'XMUM 车行', at:() => g(() => [SHOWROOM[0], SHOWROOM[1]], null)},
    {k:'ioi',      i:'🏬', t:'IOI City Mall', s:'SUKI-YA 火锅在门口', c:'shop', p:1, lab:'IOI City Mall', at:lab('IOI City Mall')},
    {k:'kipmall',  i:'🛒', t:'KIP 购物中心', s:'KIP 超市 · 美食广场 · 大乱斗', c:'shop', p:1, lab:'KIP 购物中心', at:lab('KIP 购物中心')},
    {k:'mcdb',     i:'🍔', t:'麦当当', s:'打工配餐 · 得来速送餐', c:'shop', p:1, lab:'麦当当', at:lab('麦当当')},
    {k:'kw',       i:'🏮', t:'Kota Warisan 夜市', s:'傍晚起开市 · 猫山王榴莲挑战', c:'shop', p:1, lab:'Kota Warisan 夜市', at:lab('Kota Warisan 夜市')},
    {k:'nm',       i:'🍢', t:'Bell 后巷夜市', s:'晚上才有 · 大胃王争霸赛', c:'shop', p:2, at:() => g(() => [270, NM_Z], null)},
    {k:'mamak',    i:'🫖', t:'Al-Hajeera 嘛嘛档', s:'24 小时 · 坐下点餐', c:'shop', p:2, lab:'Al-Hajeera 嘛嘛档 · 24h', at:() => [137, 335]},
    {k:'erl',      i:'🚆', t:'ERL 火车站', s:'一站到 KLIA 机场', c:'go', p:1, lab:'Salak Tinggi ERL 站', at:lab('Salak Tinggi ERL 站')},
    {k:'park1',    i:'🎢', t:'汽车游乐园（一园）', s:'跳台、滚筒、绕桩', c:'play', p:1, lab:'汽车游乐园', at:lab('汽车游乐园')},
    {k:'park2',    i:'🏎️', t:'卡丁车场（二园）', s:'免费租卡丁车 · 跑圈', c:'play', p:1, lab:'汽车游乐园二园 · 卡丁车赛道', at:lab('汽车游乐园二园 · 卡丁车赛道')},
    {k:'gas',      i:'⛽', t:'加油站', s:'便利店', c:'go', p:3, lab:'加油站', at:lab('加油站')}
  ];
  /* stunt jumps: only the ones you have found (js/89-stuntjumps.js); the rest stay a secret */
  function jumpPins(out){
    const J = window.XJumps; if (!J) return;
    const f = g(() => J.found(), {});
    for (const j of J.list) if (f[j.id]) out.push({x:j.x, z:j.z, m:{i:'🛹', t:j.name, s:'特技跳台 · 已找到', c:'play', p:3}});
  }

  /* ---------- the popover card ---------- */
  const st = document.createElement('style');
  st.textContent = `
#bmPop{position:absolute;z-index:4;min-width:180px;max-width:min(280px,calc(100% - 20px));max-height:calc(100% - 20px);overflow:auto;padding:6px 6px 6px;border-radius:var(--r-md,10px);
  background:var(--panel-solid,#fff);color:var(--ink,#1f2a33);box-shadow:0 6px 24px var(--shadow,rgba(0,0,0,.3));font-size:13px;line-height:1.35}
#bmPop[hidden]{display:none}
#bmPop ul{list-style:none;margin:0;padding:0}
#bmPop li{display:flex;align-items:flex-start;gap:8px;padding:6px 6px;border-radius:8px}
#bmPop li+li{border-top:1px solid var(--line,#ddd)}
#bmPop .e{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:15px;background:#fff;box-shadow:inset 0 0 0 2.5px var(--c)}
#bmPop b{display:block;font-size:13.5px}
#bmPop small{display:block;color:var(--muted,#667);font-size:12px}
#bmPop .tag{display:inline-block;margin-left:4px;padding:0 6px;border-radius:999px;font-size:11px;font-weight:700;color:#3b2a00;background:#ffd24a;vertical-align:1px}
.bm-filt{position:absolute;left:10px;top:40px;z-index:3;display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:calc(100% - 76px)}
.bm-filt>button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--panel-solid);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px var(--shadow);display:flex;align-items:center;gap:6px}
.bm-filt>button[aria-expanded="true"]{border-color:var(--tile);color:var(--tile)}
.bm-filt>button em{font-style:normal;font-weight:700;font-size:11px;padding:0 6px;border-radius:999px;background:var(--tile);color:var(--on-accent,#fff)}
.bm-fp{padding:8px;border-radius:var(--r-md,10px);background:var(--panel-solid);box-shadow:0 6px 24px var(--shadow);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:calc(100vh - 220px);overflow:auto}
.bm-fp[hidden]{display:none}
.bm-fp button{display:flex;align-items:center;gap:7px;min-height:40px;padding:4px 10px 4px 6px;border-radius:10px;border:1.5px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.bm-fp button i{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:14px;background:#fff;box-shadow:inset 0 0 0 2.5px var(--c)}
.bm-fp button span{min-width:0;flex:1}
.bm-fp button small{display:block;color:var(--muted);font-size:11px}
.bm-fp button[aria-pressed="false"]{opacity:.45}
.bm-fp button[aria-pressed="false"] i{filter:grayscale(1)}
.bm-fp button:disabled{cursor:default}
.bm-fp .all{grid-column:1/-1;justify-content:center;min-height:34px;font-weight:600}
@media (max-width:560px), (max-height:520px){ .bm-fp{grid-template-columns:repeat(2,minmax(0,1fr))} .bm-fp button{min-height:38px;font-size:12.5px} }
@media (max-height:460px){ .bm-filt{top:10px;left:58px} .bm-fp{max-height:calc(100vh - 110px)} }
`;
  document.head.appendChild(st);

  const view = document.getElementById('bmView'), cv = document.getElementById('bmCv');
  if (!view || !cv) return;
  const pop = document.createElement('div'); pop.id = 'bmPop'; pop.hidden = true; pop.setAttribute('role', 'tooltip');
  view.appendChild(pop);
  const filt = document.createElement('div'); filt.className = 'bm-filt';
  filt.innerHTML = `<button type="button" id="bmFiltB" aria-expanded="false" aria-controls="bmFp"><span>☰ 图例 · 筛选</span><em id="bmFiltN" hidden></em></button><div class="bm-fp" id="bmFp" hidden></div>`;
  view.appendChild(filt);
  const fb = filt.querySelector('#bmFiltB'), fp = filt.querySelector('#bmFp'), fn = filt.querySelector('#bmFiltN');
  const counts = {};
  const catName = c => c.en && g(() => XI18N.lang === 'en', false) ? c.en : tr(c.n);
  function renderFilt(){
    fp.innerHTML = CATS.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${!off[c.id]}" ${c.fixed ? 'disabled' : ''} style="--c:${c.col}"><i>${c.i}</i><span>${esc(catName(c))}<small>${esc(c.fixed ? tr('一直显示') : tr((counts[c.id] || 0) + ' 处'))}</small></span></button>`).join('')
      + `<button type="button" class="all" data-all>${esc(tr(Object.keys(off).some(k => off[k]) ? '全部显示' : '只看主线和导航'))}</button>`;
    const n = CATS.filter(c => off[c.id]).length; fn.hidden = !n; fn.textContent = n ? tr('关了 ' + n + ' 类') : '';
  }
  fb.addEventListener('click', () => { const o = fp.hidden; fp.hidden = !o; fb.setAttribute('aria-expanded', String(o)); if (o){ renderFilt(); pop.hidden = true; } });
  fp.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.all != null){ const any = Object.keys(off).some(k => off[k]); for (const c of CATS) if (!c.fixed){ if (any) delete off[c.id]; else off[c.id] = true; } }
    else { const c = b.dataset.c; if (off[c]) delete off[c]; else off[c] = true; }
    saveOff(); renderFilt(); pop.hidden = true; redraw();
  });
  /* keys stay with the map while it is open (js/ui-guide.js): the buttons still work by click / tap */
  const redraw = () => g(() => XGuide.mapRedraw());

  /* ---------- drawing ---------- */
  let hits = [];   /* this frame's clusters, canvas pixels: {x, y, r, items} */
  let navAt = null;
  const font = (w, px) => `${w} ${Math.round(px)}px ${g(() => getComputedStyle(document.body).fontFamily, 'sans-serif')}`;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function rr(G, x, y, w, h, r){ G.beginPath(); G.moveTo(x + r, y); G.arcTo(x + w, y, x + w, y + h, r); G.arcTo(x + w, y + h, x, y + h, r); G.arcTo(x, y + h, x, y, r); G.arcTo(x, y, x + w, y, r); G.closePath(); }
  const boxHit = (B, b) => B.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);

  /* mo: the options drawMini got (g, span, u, pins…); V: {cx, cz, yaw, me:[x, z]} */
  function draw(mo, V){
    const G = mo.g, Sw = G.canvas.width, Sh = G.canvas.height, u = mo.u || 1, span = mo.span, k = Math.min(Sw, Sh) / span;
    const X = x => Sw / 2 + (x - V.cx) * k, Z = z => Sh / 2 + (z - V.cz) * k;
    const naiwa = mode === 'naiwa';
    /* everything to show: the dots drawMini collected, our places, the jumps you found */
    const all = (mo.pins || []).slice();
    if (naiwa){
      const have = new Set(all.filter(p => p.m && p.m.k).map(p => p.m.k));
      for (const P of PLACES){ if (have.has(P.k)) continue; const a = g(P.at, null); if (a && isFinite(a[0])) all.push({x:a[0], z:a[1], m:P}); }
      jumpPins(all);
    }
    /* the compass target (js/50-missions.js): the pin closest to it becomes "the target"; none close → a pin of its own */
    navAt = null;
    const ct = naiwa ? g(() => compassTgt, null) : null;
    if (ct && isFinite(ct.x)){
      let best = null, bd = 6;
      for (const p of all){ const d = Math.hypot(p.x - ct.x, p.z - ct.z); if (d < bd){ bd = d; best = p; } }
      if (best){ best.nav = true; best.m = Object.assign({}, best.m || {i:'📍', t:ct.label, c:'main'}, {p:0}); }
      else all.push({x:ct.x, z:ct.z, nav:true, m:{i:'🧭', t:ct.label, c:'main', p:0}});
      navAt = ct;
    }
    for (const c of CATS) counts[c.id] = 0;
    for (const p of all) if (p.m && CAT[p.m.c]) counts[p.m.c]++;
    if (!fp.hidden) renderFilt();

    /* plain dots with no name (cars in a race, monkeys…): as before, small */
    /* how zoomed in, in screen pixels per metre: a phone held upright shows the same 720 m in half the pixels, so it counts as further out.
       The map opens at about 0.95 on a computer (big places and ordinary ones named) and 0.45 on an upright phone (small places hidden) */
    const zm = k / (u / 1.15);
    const lv = zm < .42 ? 1 : zm < 1.4 ? 2 : 3;   /* which names to write */
    const tiny = zm < .62;                          /* too far out for dorm doors, classrooms, check-in points */
    const fs = Math.max(11, Math.min(14, 11 + (zm - .7) * 3.5)) * u / 1.15;   /* label px (canvas): 11–14 css px */
    const R = Math.max(9, Math.min(14, 10 + (zm - .8) * 6)) * u / 1.15 * 1.1;   /* pin radius */
    const vis = [], plain = [];
    for (const p of all){
      const m = p.m;
      if (!m){ plain.push(p); continue; }
      const c = CAT[m.c] ? m.c : 'campus';
      if (naiwa && off[c] && !p.nav && !m.main) continue;   /* the filter is only on the map in 奶娃 mode (漫游 mode has just the check-in points) */
      if (naiwa && tiny && m.p >= 3 && !p.nav && !m.main) continue;
      let x = X(p.x), y = Z(p.z);
      const out = x < -R || y < -R || x > Sw + R || y > Sh + R;
      if (out && !(p.nav || m.main)) continue;
      const e = R + (p.nav || m.main ? 14 : 6) * u; let edge = false;   /* room for the arrow on the edge */
      if (x < e || y < e || x > Sw - e || y > Sh - e){ edge = true; x = Math.max(e, Math.min(Sw - e, x)); y = Math.max(e, Math.min(Sh - e, y)); }
      vis.push({x, y, wx:p.x, wz:p.z, m, c, nav:!!p.nav, main:!!m.main || !!p.nav, p:p.nav || m.main ? 0 : (m.p == null ? 2 : m.p), edge, ox:X(p.x), oy:Z(p.z)});
    }
    for (const p of plain){
      const x = X(p.x), y = Z(p.z); if (x < 0 || y < 0 || x > Sw || y > Sh) continue;
      G.fillStyle = p.col; G.strokeStyle = '#1f2a33'; G.lineWidth = 1.5 * u; G.beginPath(); G.arc(x, y, Math.max(3, (p.r || 5) * .8) * u, 0, 7); G.fill(); G.stroke();
    }
    /* merge pins that sit on top of each other (most important first, so it names the cluster) */
    vis.sort((a, b) => a.p - b.p || (b.nav - a.nav));
    const CL = [], near = R * (lv === 1 ? 2.1 : 1.6);
    for (const v of vis){
      let into = null;
      if (!v.edge) for (const c of CL){ if (c.edge) continue; if (Math.hypot(c.x - v.x, c.y - v.y) < near){ into = c; break; } }
      if (into){ if (!into.items.some(t => t.m.t === v.m.t)) into.items.push(v); if (v.nav) into.nav = true; if (v.main) into.main = true; }
      else CL.push({x:v.x, y:v.y, items:[v], nav:v.nav, main:v.main, edge:v.edge, ox:v.ox, oy:v.oy});
    }
    /* draw: ordinary first, the main line and the target last (on top) */
    CL.sort((a, b) => (a.main - b.main) || (b.items[0].p - a.items[0].p));
    const B = [];   /* boxes already taken: pins and names */
    /* the buttons over the map (＋ − 回到我, 图例 · 筛选, N): names keep clear of them */
    { const cr = cv.getBoundingClientRect(), s = Sw / Math.max(1, cr.width);
      for (const el of view.querySelectorAll('.bm-zoom, .bm-filt>button, .bm-n')){ const r = el.getBoundingClientRect(); if (!r.width || el.closest('[hidden]')) continue;
        B.push({x:(r.left - cr.left - 4) * s, y:(r.top - cr.top - 4) * s, w:(r.width + 8) * s, h:(r.height + 8) * s, ui:true}); } }
    for (const c of CL){ const r = c.main ? R * 1.18 : R; B.push({x:c.x - r, y:c.y - r, w:r * 2, h:r * 2}); }
    hits = [];
    const t = performance.now();
    for (const c of CL){
      const h = c.items[0], col = h.nav ? '#f5b301' : CAT[h.c].col, r = c.main ? R * 1.18 : R;
      if (c.nav){
        /* the target: a pulsing gold ring */
        const pr = r + (5 + 4 * (.5 + .5 * Math.sin(t / 260))) * u;
        G.strokeStyle = 'rgba(245,179,1,.9)'; G.lineWidth = 3 * u; G.beginPath(); G.arc(c.x, c.y, pr, 0, 7); G.stroke();
        G.strokeStyle = 'rgba(255,255,255,.85)'; G.lineWidth = 1.2 * u; G.beginPath(); G.arc(c.x, c.y, pr + 2.2 * u, 0, 7); G.stroke();
      }
      if (c.edge && c.main){
        /* off the screen: a little arrow on the edge pointing at it */
        const a = Math.atan2(c.oy - c.y, c.ox - c.x);
        G.save(); G.translate(c.x + Math.cos(a) * (r + 4 * u), c.y + Math.sin(a) * (r + 4 * u)); G.rotate(a);
        G.fillStyle = col; G.strokeStyle = '#1f2a33'; G.lineWidth = 1.5 * u; G.beginPath(); G.moveTo(7 * u, 0); G.lineTo(-2 * u, -6 * u); G.lineTo(-2 * u, 6 * u); G.closePath(); G.fill(); G.stroke(); G.restore();
      }
      G.fillStyle = '#ffffff'; G.strokeStyle = col; G.lineWidth = (c.main ? 3.6 : 3) * u;
      G.beginPath(); G.arc(c.x, c.y, r, 0, 7); G.fill(); G.stroke();
      G.strokeStyle = 'rgba(31,42,51,.55)'; G.lineWidth = 1 * u; G.beginPath(); G.arc(c.x, c.y, r + 1.9 * u, 0, 7); G.stroke();
      G.font = `${Math.round(r * 1.12)}px ${EMOJI}`; G.textAlign = 'center'; G.textBaseline = 'middle'; G.fillStyle = '#1f2a33';
      G.fillText(h.m.i || '📍', c.x, c.y + r * .06);
      if (c.items.length > 1){
        const n = String(c.items.length), bx = c.x + r * .78, by = c.y - r * .78, br = 7.5 * u;
        G.fillStyle = '#1f2a33'; G.strokeStyle = '#ffffff'; G.lineWidth = 1.6 * u; G.beginPath(); G.arc(bx, by, br, 0, 7); G.fill(); G.stroke();
        G.fillStyle = '#ffffff'; G.font = font(800, 10.5 * u / 1.15); G.fillText(n, bx, by + .5 * u);
      }
      hits.push({x:c.x, y:c.y, r:Math.max(r + 4 * u, 22 * u / 1.15), items:c.items, nav:c.nav});
    }
    /* building names (js/90-main.js miniNames): the big area names (Bell Avenue, A3, 南门…) first, around the pins; not the ones a pin already names */
    const names = vis.filter(v => v.p <= lv).map(v => [v.wx, v.wz, v.m.t, v.m.lab]);
    const skip = (L, text) => {
      if (/^外卖取餐/.test(text) || /^(ERL 坐车|租卡丁车|维修区)/.test(text)) return true;
      for (const [x, z, t2, lb] of names){
        if (Math.abs(L.pos.x - x) > 90 || Math.abs(L.pos.z - z) > 90) continue;
        if (text === lb || (lb && text.indexOf(lb) === 0) || text === t2 || (t2 && t2.length >= 2 && text.indexOf(t2) >= 0) || (text.length >= 2 && t2 && t2.indexOf(text) >= 0)) return true;
      }
      return false;
    };
    if (mo.wantNames){
      const taken = B.map(b => [b.x + b.w / 2, b.y + b.h / 2, b.w, b.h]), n0 = taken.length;
      g(() => miniNames(G, X, Z, Sw, Sh, u, taken, (L, text) => !!L.minor || skip(L, text)));
      for (const b of taken.slice(n0)) B.push({x:b[0] - b[2] / 2 - 2 * u, y:b[1] - b[3] / 2 - 1 * u, w:b[2] + 4 * u, h:b[3] + 2 * u});
    }
    /* pin names: the target and the main line first, then by importance; a name never covers another name or a pin */
    const order = CL.slice().sort((a, b) => (b.nav - a.nav) || (b.main - a.main) || (a.items[0].p - b.items[0].p));
    for (const c of order){
      const h = c.items[0], p = c.nav || c.main ? 0 : h.p; if (p > lv) continue;
      const more = c.items.length > 1 ? ` +${c.items.length - 1}` : '';
      const raw = c.nav && navAt && navAt.label ? navAt.label : h.m.t;
      let txt = tr(c.nav ? '导航 · ' + raw : raw) + more;
      const big = c.nav || c.main, f = big ? fs * 1.08 : fs;
      G.font = font(big ? 800 : 700, f);
      let w = G.measureText(txt).width; const maxW = Math.min(Sw * .6, 260 * u);
      while (w > maxW && txt.length > 4){ txt = txt.slice(0, -2) + '…'; w = G.measureText(txt).width; }
      const r = c.main ? R * 1.18 : R, pad = 5 * u, bh = f + 6 * u, bw = w + pad * 2;
      const tries = [[c.x + r + 4 * u, c.y - bh / 2], [c.x - r - 4 * u - bw, c.y - bh / 2], [c.x - bw / 2, c.y + r + 4 * u], [c.x - bw / 2, c.y - r - 4 * u - bh]];
      let at = null;
      for (const [x, y] of tries){
        if (x < 2 || y < 2 || x + bw > Sw - 2 || y + bh > Sh - 2) continue;
        const b = {x, y, w:bw, h:bh}, own = {x:c.x - r, y:c.y - r, w:r * 2, h:r * 2};
        const others = B.filter(o => !(o.x === own.x && o.y === own.y));
        if (!boxHit(others, b) || (big && !boxHit(others.filter(o => o.ui), b))){ at = b; break; }
      }
      if (!at) continue;
      B.push(at);
      if (big){
        G.fillStyle = c.nav ? '#ffc21a' : '#fff4c7'; G.strokeStyle = '#1f2a33'; G.lineWidth = 1.6 * u;
        rr(G, at.x, at.y, at.w, at.h, at.h / 2); G.fill(); G.stroke();
        G.fillStyle = '#1f2a33';
      } else {
        G.fillStyle = 'rgba(255,253,248,.93)'; rr(G, at.x, at.y, at.w, at.h, 5 * u); G.fill();
        G.fillStyle = CAT[h.c].col; G.fillRect(at.x, at.y + 3 * u, 2.4 * u, at.h - 6 * u);
        G.fillStyle = '#1f2a33';
      }
      G.textAlign = 'left'; G.textBaseline = 'middle'; G.fillText(txt, at.x + pad, at.y + at.h / 2 + .5 * u);
    }
    /* small names (minor building labels) last, around everything else */
    if (mo.wantNames) g(() => miniNames(G, X, Z, Sw, Sh, u, B.map(b => [b.x + b.w / 2, b.y + b.h / 2, b.w, b.h]), (L, text) => !L.minor || skip(L, text)));
    G.textAlign = 'start'; G.textBaseline = 'alphabetic';
    /* you, on top of everything */
    if (V.me){
      const ax = Math.max(14 * u, Math.min(Sw - 14 * u, X(V.me[0]))), az = Math.max(14 * u, Math.min(Sh - 14 * u, Z(V.me[1])));
      G.save(); G.translate(ax, az); G.rotate(-V.yaw); G.scale(u, u);
      G.fillStyle = '#1f2a33'; G.strokeStyle = '#ffffff'; G.lineWidth = 2.5;
      G.beginPath(); G.moveTo(0, -12); G.lineTo(8, 9); G.lineTo(0, 4); G.lineTo(-8, 9); G.closePath(); G.stroke(); G.fill(); G.restore();
    }
  }

  /* ---------- tap / hover a pin: the card ---------- */
  const scale = () => { const r = cv.getBoundingClientRect(); return {r, s:cv.width / Math.max(1, r.width)}; };
  function hitAt(cx, cy){
    const {r, s} = scale(), x = (cx - r.left) * s, y = (cy - r.top) * s;
    let best = null, bd = 1e9;
    for (const h of hits){ const d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd){ bd = d; best = h; } }
    return best ? {h:best, px:best.x / s, py:best.y / s} : null;
  }
  let popMode = '';   /* 'hover' or 'tap' */
  function showPop(H, px, py, how){
    const items = H.items;
    pop.innerHTML = `<ul>${items.map(v => {
      const c = CAT[v.c] || CAT.campus, nav = v.nav || (H.nav && v === items[0]);
      const name = tr(nav && navAt && navAt.label ? navAt.label : v.m.t);
      return `<li><span class="e" style="--c:${nav ? '#f5b301' : c.col}">${esc(v.m.i || '📍')}</span><span><b>${esc(name)}${nav ? `<span class="tag">${esc(tr('导航中'))}</span>` : ''}</b>`
        + `<small>${esc([v.m.s && tr(v.m.s), catName(c)].filter(Boolean).join(' · '))}</small></span></li>`;
    }).join('')}</ul>`;
    pop.hidden = false; popMode = how;
    /* place it beside the pin, inside the view */
    const W = view.clientWidth, Hh = view.clientHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = px + 18, y = py - ph / 2;
    if (x + pw > W - 8) x = px - 18 - pw;
    if (x < 8){ x = Math.max(8, Math.min(W - pw - 8, px - pw / 2)); y = py + 22; if (y + ph > Hh - 8) y = py - 22 - ph; }
    pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(Math.max(8, Math.min(Hh - ph - 8, y))) + 'px';
  }
  let down = null;
  cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; if (!fp.hidden){ fp.hidden = true; fb.setAttribute('aria-expanded', 'false'); } });
  cv.addEventListener('click', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const H = hitAt(e.clientX, e.clientY);
    if (!H){ pop.hidden = true; return; }
    showPop(H.h, H.px, H.py, 'tap');
    /* a friend's star has its own card (js/96-friends.js): that one wins */
    setTimeout(() => { const f = document.getElementById('frPop'); if (f && !f.hidden) pop.hidden = true; }, 0);
  });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const H = hitAt(e.clientX, e.clientY);
    cv.style.cursor = H ? 'pointer' : '';
    if (H){ if (popMode !== 'tap' || pop.hidden) showPop(H.h, H.px, H.py, 'hover'); }
    else if (popMode === 'hover') pop.hidden = true;
  });
  cv.addEventListener('pointerleave', () => { if (popMode === 'hover') pop.hidden = true; });
  /* dragging or zooming moves the pins away from the card */
  cv.addEventListener('wheel', () => { pop.hidden = true; }, {passive:true});
  cv.addEventListener('pointermove', e => { if (e.buttons && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) pop.hidden = true; });
  { const bm = document.getElementById('bigmap'); if (bm) bm.addEventListener('close', () => { pop.hidden = true; fp.hidden = true; fb.setAttribute('aria-expanded', 'false'); }); }

  window.XMapPins = {CATS, draw, off, get hits(){ return hits; }, PLACES};
})();
