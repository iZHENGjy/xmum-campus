/* XMUM 校园漫游 · 方程式赛车和它的 F1 赛道件（赛车改装店在维修区车库里，js/94-f1-paddock.js）
 *
 * 赛车是单独的一类车（TN_CLASS 'f'）：方程式赛车 f1car，在维修区车库的「赛车改装店」买，只能在雪邦赛道和汽车游乐园（一园）里开
 *   （开出园区会被挡回来，也叫不到园区外面，见 js/94-f1-paddock.js）。普通车照样能上赛道，有赛道手感，但装不了 F1 件。
 * 五个槽（加在 TN_SLOTS 末尾，联机外观字符串只往后加），只给赛车（cls 'f'），所以 XMUM 车行的改装车间看不到「赛道」页，
 *   普通车的改装一点没变：赛道空力（前翼 / 前后翼套件）、赛车光头胎、碳陶刹车、碳纤维轻量化、排位赛引擎模式。
 *   效果走 js/94-f1-drive.js 的 XF1D.mods（a0 侧向抓地、df 下压力、brake、acc、vmax、off），只在赛道上生效。
 *   看得见的：前翼、F1 尾翼、光头胎胎壁一圈黄线。
 * 三种新材料（碳纤维布 cfc、赛车胎胶料 rcomp、风洞数据 wtd）和两张配方（bp_f1aero、bp_f1eng）只从维修区车库和赛道上来，
 *   掉得慢、每天有上限、同一天越刷越少（js/94-f1-paddock.js 的 give），全套赛道件正常玩要一个多星期，见 docs/tuning.md。
 * 必须在 js/93-tuning-ui.js 之前加载（它按 TN_PARTS 建背包、按 TN_SLOTS / TN_KINDS 读存档）。 */
'use strict';
(() => {
  if (typeof TN_SLOTS === 'undefined' || typeof TN === 'undefined' || typeof CAR_T === 'undefined') return;
  /* ---------- the race car: an open-wheel 方程式赛车 (no wings until you fit them) ---------- */
  CAR_T.f1car = {L:4.6, W:1.9, H:1.0, wb:2.95, r:.33, maxV:76, acc:31, grip:9.4, steer:.5, mass:.75, seat:[0, .08, -.35], name:'方程式赛车', race:true};
  TN_CLASS.f1car = 'f'; TN_KINDS.push('f1car');
  if (typeof carParts === 'function'){
    const base = carParts;
    carParts = function(kind, T){
      if (kind !== 'f1car') return base(kind, T);
      if (carGeoCache.f1car) return carGeoCache.f1car;
      const P = {paint:[], trim:[], white:[], tail:[]}, put = (k, g) => { P[k].push(g); return g; };
      const rb = (k, w, h, d, r, x, y, z, rx) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx || 0, 0, 0));
      rb('paint', .78, .42, 3.1, .12, 0, .42, -.2);                 /* the tub */
      rb('paint', .5, .26, 1.2, .1, 0, .34, 1.8, .05);              /* the nose */
      rb('paint', .3, .16, .4, .06, 0, .28, 2.45, .08);
      for (const s of [-1, 1]) rb('paint', .42, .34, 1.5, .1, s * .56, .42, -.5);   /* sidepods */
      rb('paint', .56, .42, 1.3, .12, 0, .78, -1.15, -.05);          /* engine cover / airbox */
      rb('white', .3, .3, .4, .08, 0, 1.02, -.45);                  /* the air intake over the driver */
      rb('trim', .52, .06, .9, .03, 0, .64, .2);                    /* cockpit rim */
      rb('trim', 1.5, .05, 3.6, .02, 0, .14, -.1);                  /* the floor */
      for (const [zw, zb] of [[T.wb / 2, .9], [-T.wb / 2, -1.3]]) for (const s of [-1, 1]){
        put('trim', rodGeo(.025, .025, [s * .38, .48, zb], [s * (T.W / 2 - .2), T.r + .04, zw]));
        put('trim', rodGeo(.025, .025, [s * .38, .3, zb + .15], [s * (T.W / 2 - .2), T.r - .06, zw])); }
      rb('tail', .16, .06, .04, .02, 0, .5, -1.82);                 /* rain light */
      const out = {}; for (const k in P) if (P[k].length) out[k] = geoMerge(P[k]);
      return carGeoCache.f1car = out;
    };
  }
  /* ---------- materials and recipes ---------- */
  const PARTS = [
    {id:'cfc',   name:'碳纤维布',   ch:'布', color:'#4a5566', rar:'r', rm:16, from:'维修区车库：车队跑腿（金牌一定给）、换胎挑战金牌 35%、测试车手金牌目标 30%。每样活每天最多 3 次有材料，同一天越刷越少'},
    {id:'rcomp', name:'赛车胎胶料', ch:'胶', color:'#d8a02a', rar:'r', rm:16, from:'维修区车库：换胎挑战（金牌一定给，银牌 60%）、测试车手铜牌目标 50%；雪邦赛道干净的计时圈 20%（破纪录 50%，每天 2 次）'},
    {id:'wtd',   name:'风洞数据',   ch:'风', color:'#2f9fd0', rar:'l', rm:40, from:'维修区车库：测试车手（金牌目标一定给、银牌目标 50%，每个目标每天只领一次）、车队跑腿金牌 10%；雪邦赛道破纪录 5%'}
  ];
  for (const p of PARTS){ TN_PARTS.push(p); TN_PART[p.id] = p; }
  const BPS = [
    {id:'bp_f1aero', name:'F1 空力套件配方', ch:'翼', for:'前后翼套件（赛车）', from:'维修区换胎挑战第一次拿金牌（一定给），之后金牌 4%'},
    {id:'bp_f1eng',  name:'F1 引擎模式配方', ch:'擎', for:'排位赛引擎模式（赛车）', from:'测试车手第一次拿金牌目标（一定给），之后 8%'}
  ];
  for (const b of BPS){ b.rar = 'b'; b.color = TN_RAR.b.c; b.rm = 60; TN_BPS.push(b); TN_BP[b.id] = b; }

  /* ---------- slots and items (appended: the look string only grows); race cars only ---------- */
  const SLOTS = [
    {id:'f1wing',  name:'赛道空力', tab:'f1', cls:'f'},
    {id:'f1tyre',  name:'赛车光头胎', tab:'f1', cls:'f'},
    {id:'f1brake', name:'刹车', tab:'f1', cls:'f'},
    {id:'f1body',  name:'车身减重', tab:'f1', cls:'f'},
    {id:'f1map',   name:'引擎模式', tab:'f1', cls:'f'}
  ];
  const ON = '只在赛道上生效：';
  const ITEMS = [
    {slot:'f1wing', id:'none', name:'不装'},
    {slot:'f1wing', id:'front', name:'F1 前翼', desc:ON + '高速过弯的下压力 +40%（车头一片贴地的前翼）', rm:220, need:{cfc:2, wtd:1}, min:40, tier:'r', df:.25},
    {slot:'f1wing', id:'full', name:'前后翼套件', desc:ON + '下压力翻倍，高速弯几乎能全油门压过去；风阻大一点，极速少 4%', rm:520, need:{cfc:4, wtd:3}, bp:'bp_f1aero', min:240, tier:'l', df:.6, vmax:-.04},
    {slot:'f1tyre', id:'stock', name:'原厂轮胎'},
    {slot:'f1tyre', id:'slick', name:'赛车光头胎', desc:ON + '过弯抓地 +3（约 +20%），车更跟车头走；但冲进草地和砂石更滑。胎壁一圈黄线', rm:300, need:{rcomp:3}, min:60, tier:'r', a0:3, grip:1.12, off:.7},
    {slot:'f1brake', id:'stock', name:'原厂刹车'},
    {slot:'f1brake', id:'carbon', name:'碳陶刹车', desc:ON + '刹车力 +40%，刹车点可以晚 30 米左右', rm:260, need:{cfc:2, rcomp:1}, min:45, tier:'r', brake:1.4},
    {slot:'f1body', id:'stock', name:'原厂车身'},
    {slot:'f1body', id:'light', name:'碳纤维轻量化', desc:ON + '车身减重：加速 +8%、刹车 +10%、过弯抓地 +1', rm:450, need:{cfc:5, wtd:1}, min:180, tier:'l', acc:1.08, brake:1.1, a0:1},
    {slot:'f1map', id:'stock', name:'原厂模式'},
    {slot:'f1map', id:'quali', name:'排位赛模式', desc:ON + '赛道上极速 +8%、加速 +5%', rm:380, need:{wtd:2, rcomp:1}, bp:'bp_f1eng', min:120, tier:'l', vmax:.08, acc:1.05}
  ];
  for (const s of SLOTS){ TN_SLOTS.push(s); TN.bySlot[s.id] = []; }
  for (const it of ITEMS){
    it.key = it.slot + '.' + it.id; it.rm = it.rm || 0; it.need = it.need || {}; it.min = it.min || 0; it.tier = it.tier || 'n';
    it.perf = {acc:0, maxV:0, grip:0, steer:0};   /* no change off the circuit */
    TN.byKey[it.key] = it; TN.bySlot[it.slot].push(it); if (!TN.stock[it.slot]) TN.stock[it.slot] = it.id;
  }
  TN_TABS.push(['f1', '赛道']);

  /* ---------- drop tables: only the paddock and the circuit. Slow on purpose (the owner: people already grind materials).
     day = rewarded runs per day; js/94-f1-paddock.js scales every chance (and the sure ones) by 1 / 0.6 / 0.35 for the
     1st / 2nd / 3rd rewarded run of the same activity that day ---------- */
  Object.assign(TN_DROPS, {
    f1pit:  {name:'维修区换胎', cd:60, day:3, g:[[['rcomp', 1], ['cfc', 1, .35], ['bp_f1aero', 1, .04]], [['rcomp', 1, .6]], [['rcomp', 1, .3]], []]},
    f1test: {name:'测试车手', day:3, g:[[['wtd', 1], ['cfc', 1, .3], ['bp_f1eng', 1, .08]], [['wtd', 1, .5]], [['rcomp', 1, .5]], []]},
    f1run:  {name:'车队跑腿', cd:120, day:3, g:[[['cfc', 1], ['wtd', 1, .1]], [['cfc', 1, .5]], [['cfc', 1, .25]], []]},
    f1lap:  {name:'雪邦赛道计时圈', cd:180, day:2, g:[[['rcomp', 1, .5], ['wtd', 1, .05]], [['rcomp', 1, .2]], [], []]}
  });

  /* ---------- on the circuit: the effects (read by js/94-f1-drive.js) ---------- */
  const mod = (c, m) => {
    if (c.kind === 'f1car'){ m.a0 += 3; m.df += .8; m.tag += '赛车 '; }   /* a real race car: more grip and far more downforce than any road car (a maxed road car is faster on the straights) */
    const f = c.tn && c.tn.fit; if (!f) return;
    for (const s of SLOTS){ const it = TN.byKey[s.id + '.' + f[s.id]]; if (!it || it.id === TN.stock[s.id]) continue;
      if (it.df) m.df += it.df; if (it.a0) m.a0 += it.a0; if (it.grip) m.grip *= it.grip; if (it.off) m.off *= it.off;
      if (it.brake) m.brake *= it.brake; if (it.acc) m.acc = (m.acc || 1) * it.acc; if (it.vmax) m.vmax += it.vmax;
      m.tag += it.name + ' '; }
  };
  (window.XF1D_MODS || (window.XF1D_MODS = [])).push(mod);

  /* ---------- the look: front wing, F1 rear wing, a yellow line on the slicks ---------- */
  const yel = M('#ffd23a', {roughness:.5}); yel.keep = true;
  const geoCache = {};
  function wings(kind, fit){
    const key = kind + '|' + fit.f1wing + '|' + fit.wide; if (geoCache[key] !== undefined) return geoCache[key];
    const A = tnAnchors(kind), T = A.T, W = T.W + (fit.wide === 'wide' ? .24 : 0), P = [];
    const rb = (w, h, d, x, y, z, rx) => P.push(geoAt(roundBox(w, h, d, Math.min(.012, h / 3, d / 3), 2), x, y, z, rx || 0, 0, 0));
    /* front wing: a low plate ahead of the nose, a flap above it, end plates */
    { const y = Math.max(.12, A.ybF - .02), z = A.zf + .1;
      rb(W * .98, .03, .36, 0, y, z, -.06); rb(W * .9, .025, .18, 0, y + .07, z - .1, -.45);
      for (const s of [-1, 1]) rb(.022, .17, .44, s * W * .49, y + .05, z - .02); }
    if (fit.f1wing === 'full'){
      const z = A.zr + .16, y = A.deck + .5;
      rb(W * .78, .035, .34, 0, y, z, .1); rb(W * .76, .03, .2, 0, y + .11, z - .14, .55);
      for (const s of [-1, 1]) rb(.025, .44, .58, s * W * .39, y - .02, z - .04);
      rb(.06, .5, .1, 0, A.deck + .25, z + .06);   /* the swan-neck pylon */
    }
    const g = geoMerge(P); tnUV(g, 6); g.keep = true;
    return geoCache[key] = g;
  }
  const ringCache = {};
  function stripe(r, lp){
    const key = r.toFixed(3) + '|' + lp; if (ringCache[key]) return ringCache[key];
    const h = Math.max(.12, Math.min(.17, r * .4)), g = new THREE.TorusGeometry(r * (lp + (1 - lp) * .45), .022, 5, 32).rotateY(Math.PI / 2).translate(h - .005, 0, 0); g.keep = true;
    return ringCache[key] = g;
  }
  if (typeof tnApply === 'function'){
    const base = tnApply;
    tnApply = function(c, fit){
      const f = tnFit(fit), full = f.f1wing === 'full';
      const was = c && c.tn;
      base(c, full ? Object.assign({}, f, {wing:'none'}) : fit);   /* the F1 rear wing takes the place of the normal one */
      if (!c || !c.tn || c.tn === was || c.tn.cls === 'm') { if (c && c.tn && c.tn !== was) c.tn.fit = f; return; }
      c.tn.fit = f;
      for (const s of SLOTS) if (!tnSlotOk(c.kind, s)) f[s.id] = TN.stock[s.id];
      const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; parent.add(m); c.tn.meshes.push(m); c.fine.push(m); m.visible = c.fineOn !== false; return m; };
      if (f.f1wing !== 'none'){
        add(c.body, wings(c.kind, f), TN_MAT.carbon);
        if (full) for (const m of c.body.children) if (m.userData.stockWing) m.visible = false;
      }
      if (f.f1tyre === 'slick'){
        const sz = TN.byKey['size.' + f.size] || {s:1, lp:.66}, r = c.T.r * sz.s, g = stripe(r, sz.lp);
        for (const w of c.wheels) add(w, g, yel);
      }
    };
  }
  /* the tab icon (the icon table lives in js/93-tuning-ui.js, which loads after this file) */
  setTimeout(() => { if (typeof TN_ICON !== 'undefined') TN_ICON.f1 = '<path d="M3 15h18M5 15l2-4h7l3 4"/><path d="M2 9h6M16 9h6M19 9v6"/><circle cx="7" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>'; }, 0);
  window.XF1T = {PARTS, BPS, SLOTS, ITEMS, mod};
})();
