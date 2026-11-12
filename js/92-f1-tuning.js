/* XMUM 校园漫游 · 改装车间的「赛道」页：F1 风格的赛道件（只在雪邦赛道上生效，出了赛道和原厂一样）
 *
 * 五个槽（加在 TN_SLOTS 末尾，联机外观字符串只往后加）：
 *   赛道空力（前翼 / 前后翼套件）、赛车光头胎、碳陶刹车、碳纤维轻量车身、F1 引擎模式。
 *   效果走 js/94-f1-drive.js 的 XF1D.mods（a0 侧向抓地、df 下压力、brake 刹车、acc 加速、vmax 极速收得少一点、off 出赛道时的抓地）。
 *   改装界面上的「改前 → 改后」四个数字不变（那是全图通用的），每件的说明里写赛道上的效果。
 *   看得见的：前翼、F1 尾翼（装了会盖掉普通尾翼）、光头胎胎壁一圈黄线。刹车、车身、引擎模式不改外形。
 * 三种新材料，只从维修区车库（js/94-f1-paddock.js）和赛道上来，别的玩法不掉：
 *   碳纤维布 cfc、赛车胎胶料 rcomp、风洞数据 wtd；两张配方 bp_f1aero（前后翼套件）、bp_f1eng（F1 引擎模式）。
 * 必须在 js/93-tuning-ui.js 之前加载（它按 TN_PARTS 建背包、按 TN_SLOTS 读存档）。 */
'use strict';
(() => {
  if (typeof TN_SLOTS === 'undefined' || typeof TN === 'undefined') return;
  /* ---------- materials and recipes ---------- */
  const PARTS = [
    {id:'cfc',   name:'碳纤维布',   ch:'布', color:'#4a5566', rar:'r', rm:16, from:'维修区车库：换胎挑战、车队跑腿（金牌多给）；测试车手金牌'},
    {id:'rcomp', name:'赛车胎胶料', ch:'胶', color:'#d8a02a', rar:'r', rm:16, from:'维修区车库：换胎挑战（每次都给）、车队跑腿银牌；雪邦赛道跑完一圈干净的计时圈（破纪录一定给，平时一半几率）'},
    {id:'wtd',   name:'风洞数据',   ch:'风', color:'#2f9fd0', rar:'l', rm:40, from:'维修区车库：测试车手（按车队给的圈速跑，金牌给 2 份）、车队跑腿金牌 40%；雪邦赛道破纪录 15%'}
  ];
  for (const p of PARTS){ TN_PARTS.push(p); TN_PART[p.id] = p; }
  const BPS = [
    {id:'bp_f1aero', name:'F1 空力套件配方', ch:'翼', for:'前后翼套件（赛道空力）', from:'维修区换胎挑战第一次拿金牌（一定给），之后金牌 12%'},
    {id:'bp_f1eng',  name:'F1 引擎模式配方', ch:'擎', for:'排位赛引擎模式', from:'测试车手第一次拿金牌（一定给），之后金牌 30%'}
  ];
  for (const b of BPS){ b.rar = 'b'; b.color = TN_RAR.b.c; b.rm = 60; TN_BPS.push(b); TN_BP[b.id] = b; }

  /* ---------- slots and items (appended: the look string only grows) ---------- */
  const SLOTS = [
    {id:'f1wing',  name:'赛道空力', tab:'f1', cls:'cs'},
    {id:'f1tyre',  name:'赛车光头胎', tab:'f1', cls:'cs'},
    {id:'f1brake', name:'刹车', tab:'f1', cls:'csm'},
    {id:'f1body',  name:'车身减重', tab:'f1', cls:'cs'},
    {id:'f1map',   name:'引擎模式', tab:'f1', cls:'csm'}
  ];
  const ON = '只在雪邦赛道上生效：';
  const ITEMS = [
    {slot:'f1wing', id:'none', name:'不装'},
    {slot:'f1wing', id:'front', name:'F1 前翼', desc:ON + '高速过弯的下压力 +40%（车头一片贴地的前翼）', rm:220, need:{cfc:2, wtd:1}, min:40, tier:'r', df:.25},
    {slot:'f1wing', id:'full', name:'前后翼套件', desc:ON + '下压力翻倍，高速弯几乎能全油门压过去；风阻大一点，极速少 3%。装了会盖掉普通尾翼', rm:520, need:{cfc:4, wtd:3}, bp:'bp_f1aero', min:240, tier:'l', df:.6, vmax:-.04},
    {slot:'f1tyre', id:'stock', name:'原厂轮胎'},
    {slot:'f1tyre', id:'slick', name:'赛车光头胎', desc:ON + '过弯抓地 +3（约 +25%），车更跟车头走；但冲进草地和砂石更滑。胎壁一圈黄线', rm:300, need:{rcomp:3}, min:60, tier:'r', a0:3, grip:1.12, off:.7},
    {slot:'f1brake', id:'stock', name:'原厂刹车'},
    {slot:'f1brake', id:'carbon', name:'碳陶刹车', desc:ON + '刹车力 +40%，刹车点可以晚 30 米左右', rm:260, need:{cfc:2, rcomp:1}, min:45, tier:'r', brake:1.4},
    {slot:'f1body', id:'stock', name:'原厂车身'},
    {slot:'f1body', id:'light', name:'碳纤维轻量化', desc:ON + '车身减重：加速 +8%、刹车 +10%、过弯抓地 +1', rm:450, need:{cfc:5, wtd:1}, min:180, tier:'l', acc:1.08, brake:1.1, a0:1},
    {slot:'f1map', id:'stock', name:'原厂模式'},
    {slot:'f1map', id:'quali', name:'排位赛模式', desc:ON + '直道极速收得少（跑车在赛道上的极速 +12% 左右），加速 +5%', rm:380, need:{wtd:2, rcomp:1}, bp:'bp_f1eng', min:120, tier:'l', vmax:.2, acc:1.05}
  ];
  for (const s of SLOTS){ s.cls = s.cls || 'cs'; TN_SLOTS.push(s); TN.bySlot[s.id] = []; }
  for (const it of ITEMS){
    it.key = it.slot + '.' + it.id; it.rm = it.rm || 0; it.need = it.need || {}; it.min = it.min || 0; it.tier = it.tier || 'n';
    it.perf = {acc:0, maxV:0, grip:0, steer:0};   /* no change off the circuit */
    TN.byKey[it.key] = it; TN.bySlot[it.slot].push(it); if (!TN.stock[it.slot]) TN.stock[it.slot] = it.id;
  }
  TN_TABS.push(['f1', '赛道']);

  /* ---------- drop tables: only the paddock and the circuit ---------- */
  Object.assign(TN_DROPS, {
    f1pit:  {name:'维修区换胎', day:10, g:[[['rcomp', 2], ['cfc', 1], ['bp_f1aero', 1, .12]], [['rcomp', 1], ['cfc', 1, .5]], [['rcomp', 1]], []]},
    f1test: {name:'测试车手', day:6, g:[[['wtd', 2], ['cfc', 1], ['bp_f1eng', 1, .3]], [['wtd', 1], ['rcomp', 1]], [['wtd', 1, .6], ['rcomp', 1]], []]},
    f1run:  {name:'车队跑腿', day:8, g:[[['cfc', 2], ['wtd', 1, .4]], [['cfc', 1], ['rcomp', 1]], [['cfc', 1]], []]},
    f1lap:  {name:'雪邦赛道计时圈', cd:60, day:6, g:[[['rcomp', 1], ['wtd', 1, .15]], [['rcomp', 1, .5]], [], []]}
  });

  /* ---------- on the circuit: the effects (read by js/94-f1-drive.js) ---------- */
  const mod = (c, m) => {
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
