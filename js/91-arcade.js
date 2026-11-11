/* XMUM 校园漫游 · B1 游戏厅：小游戏平台（window.XMini）
 *
 * 进去：B1 学生活动中心南门的粉圈按 F；或者标题页的「小游戏」直接进，并弹出游戏列表。
 * 游戏厅是一间搭在地图外（x 0, z -2700）的屋子，没有屋顶，镜头从上往下看。北墙一排街机，每台对应一个注册的小游戏，
 *   走到机台前的光圈按 F 开玩；也可以用「游戏列表」直接选（手机上更方便）。
 * 小游戏用 XMini.register({...}) 接进来，平台负责：进出时保存和恢复奶娃的位置与镜头、冻结外面的世界、输入、HUD、
 *   倒计时、暂停、结算（奖牌、本机纪录、发 RM、成就、排行榜）。写新游戏看 docs/MINIGAMES.md。
 *
 * 做法：在游戏厅里（包括玩小游戏时）gx.paused = true，和奶娃衣橱一样。主循环不再跑 updateNaiwaMode，
 *   所以车、保安、外卖和挑战的计时、水枪、车行全部停住；平台自己在 gx.frame（每帧都调，暂停时也调）里走路、摆镜头。
 *   这期间 js/90-main.js 的 keys 不可靠（暂停时按键在记进 keys 之前就返回了），小游戏只读 ctx.input。
 *   同时把校园的物体都藏起来，只画游戏厅或小游戏的场景，所以比在外面还流畅。
 * 一个小游戏可以有几个模式（register 的 modes）：游戏厅里还是一台街机，开局前选模式；每个模式有自己的纪录、奖牌线和排行榜，
 *   榜的 id 是「游戏id_模式id」（模式可以用 key 指定别的 id）。平台内部把每个模式当成一个「变体」（g.vars），没有模式的游戏只有它自己。
 * 存档：localStorage 'xmum-mini-v1' = {best:{榜id:分数}, plays:{榜id:次数}, store:{游戏id:{...}}, last:{游戏id:上次玩的模式}}；
 *   排行榜：/mini/{gameId}/{uid} = {name, value, ts}（js/net.js 的 XNet.miniTop / miniSubmit，规则在 database.rules.json）。
 */
'use strict';
const ARC = {in:false, state:'out', door:null, leaving:false, ox:0, oz:-2700, W:26, D:18, H:3.6, sx:0, sz:-2950, built:false, cabN:-1, hid:[], spots:[], cols:[], near:null, back:null, keep:null, fLbl:false};
const ARC_BG = '#171a30';
const ARC_SPAWN = [0, 5.6];
const MG_ID = /^[a-z][a-z0-9_]{1,15}$/, MG_KEY = 'xmum-mini-v1', MG_CAP = 60, MG_MAX = 1e6;
const MG = {list:[], byId:{}, vById:{}, cur:null, ctx:null, pending:null, prev:'', elapsed:0, timers:[], offs:[], paid:0, cd:0, beep:0, run:0};

/* ---------- save ---------- */
const mgSave = {best:{}, plays:{}, store:{}, last:{}};
(function mgLoad(){
  try {
    const d = JSON.parse(localStorage.getItem(MG_KEY) || 'null'); if (!d) return;
    for (const k in d.best || {}) if (MG_ID.test(k) && isFinite(d.best[k])) mgSave.best[k] = +d.best[k];
    for (const k in d.plays || {}) if (MG_ID.test(k)) mgSave.plays[k] = Math.max(0, d.plays[k] | 0);
    for (const k in d.store || {}) if (MG_ID.test(k) && d.store[k] && typeof d.store[k] === 'object') mgSave.store[k] = d.store[k];
    for (const k in d.last || {}) if (MG_ID.test(k) && typeof d.last[k] === 'string') mgSave.last[k] = d.last[k];
  } catch(e){}
})();
function mgWrite(){ try { localStorage.setItem(MG_KEY, JSON.stringify(mgSave)); } catch(e){} }

/* ---------- achievements (the save in js/80-gta.js only keeps ids it knows, so re-read ours after adding them) ---------- */
function mgAch(list){
  const ids = [];
  for (const a of list) if (Array.isArray(a) && a[0] && !ACH.some(x => x[0] === a[0])){ ACH.push(a); ids.push(a[0]); }
  if (!ids.length) return;
  try { const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null'); if (d && d.ach) for (const k of ids) if (d.ach[k]) prog.ach[k] = +d.ach[k] || 1; } catch(e){}
}
mgAch([['arcade1', '社团人', '第一次走进 B1 游戏厅', 10], ['arcadeall', '全勤玩家', '游戏厅里每个小游戏都玩过一局', 40], ['arcgold', '街机高手', '任意小游戏拿到金牌', 50]]);

/* ---------- registry ---------- */
function mgRegister(def){
  if (!def || !MG_ID.test(String(def.id || ''))){ console.error('[XMini] id 要匹配 ' + MG_ID, def && def.id); return null; }
  if (MG.byId[def.id] || MG.vById[def.id]){ console.error('[XMini] id 重复：' + def.id); return null; }
  if (typeof def.start !== 'function' || typeof def.update !== 'function'){ console.error('[XMini] 需要 start(ctx) 和 update(dt, ctx)：' + def.id); return null; }
  const g = Object.assign({name:def.id, desc:'', icon:'🎮', color:'#ff8a3d', intro:'', minPlayers:1, maxPlayers:1, board:null, medals:null, countdown:true, shadow:26, sky:null}, def);
  g.controls = Object.assign({move:false, a:null, b:null, tap:false}, def.controls || {});
  const BD = {lower:false, max:MG_MAX, fmt:v => Math.round(v) + ' 分'};
  if (g.board) g.board = Object.assign({}, BD, g.board);
  g.base = g; g.mode = null; g.vars = [g];
  /* modes: each one becomes a variant that inherits everything from the game and overrides what the mode states */
  if (Array.isArray(def.modes) && def.modes.length){
    const vars = [];
    for (const m of def.modes){
      const vid = m && (m.key || g.id + '_' + m.id);
      if (!m || !/^[a-z][a-z0-9]{0,11}$/.test(String(m.id || '')) || !MG_ID.test(vid) || MG.vById[vid] || (MG.byId[vid] && vid !== g.id) || vars.some(x => x.id === vid)){
        console.error('[XMini] 模式 id 不对或者和别的榜重复：' + g.id + ' / ' + (m && m.id)); return null;
      }
      const v = Object.assign(Object.create(g), m, {id:vid, name:g.name, mode:m, modeName:m.name || m.id, base:g});
      v.controls = Object.assign({}, g.controls, m.controls || {});
      v.board = m.board === null || (!m.board && !g.board) ? null : Object.assign({}, g.board || BD, m.board || {});
      vars.push(v);
    }
    g.vars = vars;
  }
  MG.list.push(g); MG.byId[g.id] = g; for (const v of g.vars) MG.vById[v.id] = v;
  if (g.achievements) mgAch(g.achievements);
  return g;
}
const mgTitle = v => v.icon + ' ' + v.name + (v.mode ? ' · ' + v.modeName : '');
const mgLastVar = g => g.vars.find(v => v.mode && v.mode.id === mgSave.last[g.id]) || g.vars[0];
const mgPlayed = g => g.vars.some(v => mgSave.plays[v.id]);
const mgFmt = (g, v) => (g.board ? g.board.fmt(v) : Math.round(v) + ' 分');
const mgBest = id => (mgSave.best[id] != null ? mgSave.best[id] : null);
/* the leaderboard only takes "higher is better", so time-based games (board.lower) are stored as MG_MAX - value */
const mgToBoard = (g, v) => Math.max(0, Math.min(MG_MAX, Math.floor(g.board && g.board.lower ? MG_MAX - v : v)));
const mgFromBoard = (g, v) => (g.board && g.board.lower ? MG_MAX - v : v);
function mgMedal(g, v){ if (!g.medals || v == null) return 3; const low = g.board && g.board.lower; for (let i = 0; i < 3; i++) if (low ? v <= g.medals[i] : v >= g.medals[i]) return i; return 3; }
const arcQ = () => (window.XQ && typeof XQ.tier === 'number' ? XQ.tier : typeof QUAL !== 'undefined' && QUAL.level >= 2 ? 0 : TOUCH || (typeof QUAL !== 'undefined' && QUAL.level === 1) ? 1 : 2);

/* ---------- lighting while inside: daylight from above on a dark backdrop, whatever the time and weather outside ---------- */
const ARC_LIGHT = (() => {
  const p = Object.assign({}, P3.day);
  for (const f of ['bg', 'hs', 'hg', 'sc', 'cc', 'water']) p[f] = P3.day[f].clone();
  p.d = new THREE.Vector3(.3, .9, .34).normalize(); p.bg.set(ARC_BG); p.hg.set('#4f4a66');
  return Object.assign(p, {hi:.6, si:.72, win:0, lamp:0, stars:0, moon:0, cloud:0});
})();
function arcLight(on, sky){
  if (on){ ARC_LIGHT.bg.set(sky || ARC_BG); tgt = ARC_LIGHT; }
  else { const b = document.querySelector('[data-t][aria-pressed="true"]'); tgt = (b && P3[b.dataset.t]) || P3.day; }
  applyTime(1);
}

/* ---------- the door outside B1 ---------- */
const ARC_DOOR = (() => {
  const i = infos.find(x => x.name === 'B1 学生活动中心'), p = i && frontPoint(i);
  return p ? {x:p[0], z:p[1], h:Math.atan2(p[0] - i.wx, p[1] - i.wz)} : {x:432, z:11, h:0};
})();
const arcMark = gxMarker('#ff5fa2', .45); arcMark.position.set(ARC_DOOR.x, .1, ARC_DOOR.z);
const arcLbl = addLabel('B1 游戏厅', ARC_DOOR.x, 4.4, ARC_DOOR.z, true); arcLbl.dead = true;
let arcPrompt = '';
const arcNearDoor = () => mode === 'naiwa' && !driving && !ARC.in && nw.state !== 'fly' && Math.hypot(nw.x - ARC_DOOR.x, nw.z - ARC_DOOR.z) < 3.2;
function arcOutside(px, pz){
  arcPrompt = '';
  arcMark.visible = true; arcLbl.dead = Math.hypot(px - ARC_DOOR.x, pz - ARC_DOOR.z) > 140;
  arcMark.userData.ring.scale.y = 1 + Math.sin(performance.now() / 300) * .15;
  const near = arcNearDoor();
  if (near){
    arcPrompt = (TOUCH ? '点「进门」' : '按 F ') + '进 B1 游戏厅玩小游戏';
    const b = actF.querySelector('b'); if (b.textContent !== '进门') b.textContent = '进门';
  } else if (ARC.fLbl) updateActs();
  ARC.fLbl = near;
}

/* ---------- small helpers ---------- */
function arcTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t;
}
const ARC_FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
function arcRing(color, r, parent){
  const m = new THREE.Mesh(new THREE.RingGeometry(r * .62, r, 40).rotateX(-Math.PI / 2), gxGlow(color, .8));
  m.add(new THREE.Mesh(new THREE.CircleGeometry(r * .62, 40).rotateX(-Math.PI / 2), gxGlow(color, .2)));
  parent.add(m); return m;
}
function arcDispose(root){
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of o.material ? [].concat(o.material) : []){ for (const k of ['map', 'alphaMap', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); }
  });
}
const arcEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---------- the hall (built the first time you walk in) ---------- */
const arcG = new THREE.Group(); arcG.position.set(ARC.ox, 0, ARC.oz); arcG.visible = false; scene.add(arcG);
const arcCabG = new THREE.Group(); arcG.add(arcCabG);
function arcSolid(x, z, hx, hz){ ARC.cols.push([x - hx, x + hx, z - hz, z + hz]); }
function arcBuild(){
  if (ARC.built) return; ARC.built = true;
  const {W, D, H} = ARC, G = arcG, bx = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, G);
  /* floor: a dark apron so nothing shows past the walls, and a patterned carpet */
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color:'#0f1122'})); apron.position.y = -.02; G.add(apron);
  const carpetTex = arcTex(512, 512, (g, w) => {
    g.fillStyle = '#3d4390'; g.fillRect(0, 0, w, w);
    const cols = ['#ff5fa2', '#3fd6c6', '#ffc93c', '#7c8cff', '#ff8a3d'], r = mkRng(91);
    for (let i = 0; i < 44; i++){
      const x = r() * w, y = r() * w, s = 10 + r() * 16, k = (r() * 3) | 0;
      g.save(); g.translate(x, y); g.rotate(r() * 6.3); g.globalAlpha = .5; g.strokeStyle = g.fillStyle = cols[(r() * cols.length) | 0]; g.lineWidth = 4; g.lineCap = 'round';
      if (k === 0){ g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s / 2, -s, 0, 0); g.quadraticCurveTo(s / 2, s, s, 0); g.stroke(); }
      else if (k === 1){ g.beginPath(); g.moveTo(0, -s * .7); g.lineTo(s * .7, s * .5); g.lineTo(-s * .7, s * .5); g.closePath(); g.fill(); }
      else { g.beginPath(); g.arc(0, 0, s * .45, 0, 7); g.stroke(); }
      g.restore();
    }
  });
  carpetTex.wrapS = carpetTex.wrapT = THREE.RepeatWrapping; carpetTex.repeat.set(4, 2.8);
  const carpet = bx(W, .1, D, new THREE.MeshStandardMaterial({map:carpetTex, roughness:.95}), 0, -.03, 0); carpet.castShadow = false;
  /* walls: the south one is waist-high so the camera always sees 奶娃 over it */
  const wall = M('#5a52a6', {roughness:.85}), trim = new THREE.MeshBasicMaterial({color:'#ff5fa2'}), trim2 = new THREE.MeshBasicMaterial({color:'#3fd6c6'});
  bx(W + .8, H, .4, wall, 0, H / 2, -D / 2 - .2); bx(.4, H, D, wall, -W / 2 - .2, H / 2, 0); bx(.4, H, D, wall, W / 2 + .2, H / 2, 0);
  for (const s of [-1, 1]) bx(W / 2 - 1.6, 1.1, .4, wall, s * (W / 4 + .8), .55, D / 2 + .2);
  bx(W + .8, .12, .46, trim, 0, H + .06, -D / 2 - .2).castShadow = false;
  for (const s of [-1, 1]){ bx(.46, .12, D, trim2, s * (W / 2 + .2), H + .06, 0).castShadow = false; bx(W / 2 - 1.6, .1, .46, trim2, s * (W / 4 + .8), 1.15, D / 2 + .2).castShadow = false; }
  /* door posts and the exit sign */
  for (const s of [-1, 1]){ bx(.4, 1.5, .5, M('#55507f'), s * 1.8, .75, D / 2 + .2); bx(.44, .22, .54, new THREE.MeshBasicMaterial({color:'#4fd18b'}), s * 1.8, 1.61, D / 2 + .2).castShadow = false; }
  /* neon sign on the north wall */
  const signTex = arcTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#1a1c38'; g.fillRect(0, 0, w, h);
    /* the two words are measured and laid out side by side (fixed centres let them run into each other with some fonts) */
    const f1 = '900 96px ' + ARC_FONT, f2 = '700 56px ' + ARC_FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = f1; const w1 = g.measureText('B1 游戏厅').width; g.font = f2; const w2 = g.measureText('XMUM ARCADE').width;
    const k = Math.min(1, (w - 60) / (w1 + w2 + 56)), x0 = (w - (w1 + w2 + 56) * k) / 2;
    g.save(); g.translate(x0, 0); g.scale(k, 1);
    g.font = f1; g.shadowColor = '#ff5fa2'; g.shadowBlur = 26; g.fillStyle = '#ffd3e6'; g.fillText('B1 游戏厅', 0, h / 2 + 4);
    g.font = f2; g.shadowColor = '#3fd6c6'; g.fillStyle = '#d2fff8'; g.fillText('XMUM ARCADE', w1 + 56, h / 2 + 8); g.restore();
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshBasicMaterial({map:signTex})); sign.position.set(0, 2.72, -D / 2 + .02); G.add(sign);
  /* exit ring */
  ARC.exitRing = arcRing('#4fd18b', 1.3, G); ARC.exitRing.position.set(0, .05, D / 2 - 1.5);
  /* leaderboard screen and the "all games" kiosk, both standing free and facing the camera */
  const stand = M('#2a2c4a', {roughness:.5, metalness:.3});
  const lbTex = arcTex(512, 256, (g, w, h) => {
    g.fillStyle = '#12142b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffc93c'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.fillStyle = '#ffc93c'; g.font = '900 78px ' + ARC_FONT; g.fillText('🏆 排行榜', w / 2, 112);
    g.fillStyle = '#e8e6ff'; g.font = '500 34px ' + ARC_FONT; g.fillText('每个小游戏一张榜', w / 2, 172); g.fillStyle = '#9aa0d8'; g.font = '500 28px ' + ARC_FONT; g.fillText('走近查看', w / 2, 216);
  });
  bx(.25, 1.3, .25, stand, 7.5, .65, -2.6); bx(.25, 1.3, .25, stand, 11.1, .65, -2.6);
  bx(4.6, 2.3, .18, stand, 9.3, 2.1, -2.6);
  const lbScr = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.05), new THREE.MeshBasicMaterial({map:lbTex})); lbScr.position.set(9.3, 2.1, -2.5); G.add(lbScr);
  arcSolid(9.3, -2.6, 2.4, .35);
  const kTex = arcTex(256, 256, (g, w, h) => {
    g.fillStyle = '#12142b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3fd6c6'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.fillStyle = '#3fd6c6'; g.font = '900 56px ' + ARC_FONT; g.fillText('全部游戏', w / 2, 110);
    g.fillStyle = '#e8e6ff'; g.font = '500 30px ' + ARC_FONT; g.fillText('列表里直接选', w / 2, 170);
  });
  bx(.5, 1.1, .5, stand, -9.6, .55, -2.6); bx(1.7, 1.5, .16, stand, -9.6, 1.75, -2.6);
  const kScr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({map:kTex})); kScr.position.set(-9.6, 1.75, -2.51); G.add(kScr);
  arcSolid(-9.6, -2.6, .95, .35);
  /* decor: prize counter and claw machine on the west wall, ping-pong table, sofas */
  bx(1.2, 1, 6, M('#c9a24a', {roughness:.6}), -12.3, .5, 3.4); bx(1.3, .08, 6.1, M('#f3efe7'), -12.3, 1.04, 3.4); arcSolid(-12.3, 3.4, .7, 3.1);
  bx(1.7, .9, 1.7, M('#ff5fa2', {roughness:.5}), -11.9, .45, -5.4); bx(1.7, .35, 1.7, M('#ff5fa2', {roughness:.5}), -11.9, 2.42, -5.4);
  const glass = bx(1.6, 1.35, 1.6, new THREE.MeshStandardMaterial({color:'#bfe6ff', transparent:true, opacity:.28, roughness:.1}), -11.9, 1.57, -5.4); glass.castShadow = false;
  arcSolid(-11.9, -5.4, .9, .9);
  { const toys = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 10, 8), M('#ffffff', {roughness:.7}), 16), m4 = new THREE.Matrix4(), col = new THREE.Color(), r = mkRng(7);
    const cs = ['#ffc93c', '#3fd6c6', '#7c8cff', '#ff8a3d', '#f4f2ec', '#ff5fa2'];
    for (let i = 0; i < 16; i++){
      if (i < 6) m4.makeTranslation(-11.9 + (r() - .5) * 1.1, 1.1 + (i % 2) * .3, -5.4 + (r() - .5) * 1.1); else m4.makeTranslation(-12.3 + (r() - .5) * .5, 1.3, .8 + (i - 6) * .58);
      toys.setMatrixAt(i, m4); toys.setColorAt(i, col.set(cs[i % cs.length]));
    }
    toys.castShadow = true; G.add(toys); }
  bx(2.74, .08, 1.52, M('#2f6fb0', {roughness:.6}), 7, .76, 4.2); bx(.04, .16, 1.6, M('#f3efe7'), 7, .88, 4.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(.08, .72, .08, stand, 7 + sx * 1.2, .36, 4.2 + sz * .6);
  arcSolid(7, 4.2, 1.45, .85);
  for (const x of [-7.6, -4.6]){ bx(2.6, .45, .95, M('#ff8a3d', {roughness:.8}), x, .23, 5.4); bx(2.6, .95, .25, M('#e6722a', {roughness:.8}), x, .48, 6); arcSolid(x, 5.55, 1.35, .6); }
  /* a few students hanging around the machines that are not games */
  if (typeof npcBodyGeo !== 'undefined' && typeof npcHeadGeo !== 'undefined' && typeof npcLegGeo !== 'undefined'){
    for (const [x, z, h, c] of [[-10.5, -5.4, -Math.PI / 2, '#3fd6c6'], [4.9, 4.2, Math.PI / 2, '#ffc93c'], [9.1, 4.2, -Math.PI / 2, '#7c8cff'], [-6.1, 4.3, 0, '#f4f2ec']]){
      const p = new THREE.Group();
      const shirt = M(c, {roughness:.8}), skin = M('#e8b98f', {roughness:.7});
      /* body, head, hair and backpack (the students' gear), legs at the hip height of js/86-guard.js, and arms */
      p.add(new THREE.Mesh(npcBodyGeo, shirt), new THREE.Mesh(npcHeadGeo, skin), new THREE.Mesh(npcGearGeo, M('#ffffff', {roughness:.8, vertexColors:true})));
      for (const s of [-1, 1]){ const l = new THREE.Mesh(npcLegGeo, M('#2a3350', {roughness:.8, vertexColors:true})); l.position.set(s * .09, PPL_HIP, 0); p.add(l); }
      const arms = pplArms(p, shirt, skin);
      if (Math.abs(h) === Math.PI / 2 && x > 0){
        /* the two at the ping-pong table hold a bat up in the right hand */
        arms[0].rotation.set(-1.0, 0, -.2);
        const bat = new THREE.Group(); bat.position.set(0, -.5, .04); bat.rotation.x = 1.0; arms[0].add(bat);
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .02, 14), M('#c8321e', {roughness:.6})); blade.rotation.z = Math.PI / 2; blade.position.y = .1;
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .1, 6), M('#b08a55', {roughness:.7})); bat.add(blade, grip);
      } else arms.forEach(a => { a.rotation.x = -.15; });
      p.traverse(m => { if (m.isMesh) m.castShadow = true; }); p.scale.setScalar(1.3); p.position.set(x, 0, z); p.rotation.y = h; G.add(p); ARC.cols.push([x - .45, x + .45, z - .45, z + .45]);
    }
  }
  ARC.fixedCols = ARC.cols.length;
  ARC.fixedSpots = [
    {x:0, z:D / 2 - 1.5, r:2.2, act:'出门', say:'出门回校园', fn:() => arcLeave()},
    {x:9.3, z:-.9, r:2.2, act:'看榜', say:'看小游戏排行榜', fn:() => arcOpenBoard(), ring:arcRing('#ffc93c', 1.1, G)},
    {x:-9.6, z:-.9, r:2.2, act:'选游戏', say:'打开游戏列表', fn:() => arcOpenList(), ring:arcRing('#3fd6c6', 1.1, G)}
  ];
  for (const s of ARC.fixedSpots) if (s.ring) s.ring.position.set(s.x, .05, s.z);
}
/* one cabinet per registered game along the north wall (the first nine; the rest are in the list) */
function arcCabinets(){
  if (ARC.cabN === MG.list.length) return; ARC.cabN = MG.list.length;
  for (const c of [...arcCabG.children]){ arcCabG.remove(c); arcDispose(c); }
  for (const s of ARC.spots) if (s.lbl){ s.lbl.dead = true; s.lbl.el.remove(); const i = labels.indexOf(s.lbl); if (i >= 0) labels.splice(i, 1); }
  ARC.cols.length = ARC.fixedCols; ARC.spots = ARC.fixedSpots.slice();
  const games = MG.list.slice(0, 9), n = games.length, dark = M('#1c1e36', {roughness:.5});
  games.forEach((g, i) => {
    const x = (i - (n - 1) / 2) * 2.75, z = -ARC.D / 2 + .75, c = new THREE.Group(); c.position.set(x, 0, z); arcCabG.add(c);
    box(1.6, 2, 1.1, M(g.color, {roughness:.55}), 0, 1, 0, c); box(1.7, .14, .6, dark, 0, .98, .8, c); box(1.5, .7, .1, dark, 0, .5, .56, c);
    box(1.64, .42, .3, new THREE.MeshBasicMaterial({color:g.color}), 0, 2.2, .42, c).castShadow = false;
    const tex = arcTex(256, 192, (k, w, h) => {
      k.fillStyle = '#10122a'; k.fillRect(0, 0, w, h); k.strokeStyle = g.color; k.lineWidth = 8; k.strokeRect(5, 5, w - 10, h - 10);
      k.textAlign = 'center'; k.textBaseline = 'middle'; k.font = '92px ' + ARC_FONT; k.fillText(g.icon, w / 2, 78);
      k.fillStyle = '#ffffff'; k.font = '700 34px ' + ARC_FONT; k.fillText(g.name, w / 2, 156, w - 24);
    });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.02), new THREE.MeshBasicMaterial({map:tex})); scr.position.set(0, 1.5, .58); scr.rotation.x = -.22; c.add(scr);
    const ring = arcRing(g.color, 1.05, c); ring.position.set(0, .05, 2.1);
    arcSolid(x, z + .2, .95, .85);
    ARC.spots.push({x, z:z + 2.1, r:1.7, act:'开玩', say:`玩「${g.name}」`, fn:() => mgIntro(g.id), ring, game:g,
      lbl:addLabel(g.icon + ' ' + g.name, ARC.ox + x, .4, ARC.oz + z + 3.7, true)});
  });
}
function arcHallBlocked(x, z){
  const lx = x - ARC.ox, lz = z - ARC.oz, R = .55;
  if (Math.abs(lx) > ARC.W / 2 - R || lz < -ARC.D / 2 + R || lz > ARC.D / 2 - R) return true;
  for (const c of ARC.cols) if (lx > c[0] - R && lx < c[1] + R && lz > c[2] - R && lz < c[3] + R) return true;
  return false;
}

/* ---------- hide the campus while inside ---------- */
function arcWorld(show){
  if (show){ for (const o of ARC.hid) o.visible = true; ARC.hid.length = 0; return; }
  const keep = new Set([arcG, NW.root, sun, sun.target, hemi]);
  for (const o of scene.children){
    if (!o.visible || keep.has(o) || o.isSprite || o.isLight || (MG.ctx && o === MG.ctx.root)) continue;
    o.visible = false; ARC.hid.push(o);
  }
}

/* ---------- camera (the platform owns it while inside) ---------- */
const ACam = {pos:new THREE.Vector3(), look:new THREE.Vector3(), fov:55, snap:true, lerp:6, shake:0, follow:null, fit:null, ox:0, oz:0};
const _acP = new THREE.Vector3(), _acL = new THREE.Vector3();
function arcOrbit(lx, ly, lz, dist, pitch, yaw){
  _acL.set(lx, ly, lz); const cp = Math.cos(pitch);
  _acP.set(lx + Math.sin(yaw) * dist * cp, ly + dist * Math.sin(pitch), lz + Math.cos(yaw) * dist * cp);
}
function arcCamApply(dt){
  const C = ACam;
  if (C.fit){
    const f = C.fit, tv = Math.tan(C.fov * D2R / 2), th = tv * camera.aspect, p = f.pitch;
    const dist = Math.max((f.w / 2) / th + f.d / 2 * Math.cos(p), (f.d / 2 * Math.sin(p)) / tv + f.d / 2 * Math.cos(p)) * f.margin;
    arcOrbit(C.ox + f.cx, f.y, C.oz + f.cz, dist, p, f.yaw); C.pos.copy(_acP); C.look.copy(_acL);
  } else if (C.follow){
    const f = C.follow, t = f.target, dist = typeof f.dist === 'function' ? f.dist(camera.aspect) : f.dist;
    arcOrbit(C.ox + t.x, (t.y || 0) + f.height, C.oz + t.z, dist, f.pitch, f.yaw); C.pos.copy(_acP); C.look.copy(_acL);
  }
  const k = C.snap ? 1 : 1 - Math.exp(-dt * C.lerp); C.snap = false;
  camera.position.lerp(C.pos, k);
  if (C.shake > .01 && !REDUCED){ camera.position.x += (Math.random() - .5) * C.shake; camera.position.y += (Math.random() - .5) * C.shake; C.shake *= Math.exp(-dt * 7); } else C.shake = 0;
  _acL.copy(C.look); camera.lookAt(_acL);
  if (Math.abs(camera.fov - C.fov) > .01){ camera.fov = C.fov; camera.updateProjectionMatrix(); }
}
const arcHallTarget = {get x(){ return (nw.x - ARC.ox) * .6; }, get z(){ return Math.max(-2.6, (nw.z - ARC.oz) * .6 - 1.6); }, y:0};   /* drifts less than 奶娃, so the room stays in frame */
function arcHallCam(){
  Object.assign(ACam, {fit:null, ox:ARC.ox, oz:ARC.oz, fov:55, lerp:7, snap:true, shake:0,
    follow:{target:arcHallTarget, height:1.2, pitch:1, yaw:0, dist:a => (a < .8 ? 27 : a < 1.2 ? 21 : 17.5)}});
}

/* ---------- input: keyboard, the joystick (#joy), platform buttons in #acts, taps on the canvas ---------- */
const IN = {k:{}, x:0, y:0, run:false, a:false, b:false, pa:false, pb:false, ptap:false, tapX:0, tapY:0, sim:null, drag:null, swipe:null, pswipe:false, ptr:-1};
const IN_A = {Space:1, KeyF:1, Enter:1, KeyJ:1}, IN_B = {KeyK:1, KeyE:1};
function inReset(){ IN.k = {}; IN.a = IN.b = IN.pa = IN.pb = IN.ptap = IN.pswipe = false; IN.x = IN.y = 0; IN.sim = null; IN.drag = IN.swipe = null; IN.ptr = -1; }
function inAxis(){
  const k = IN.k;
  let x = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.x, y = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - joy.y;
  if (IN.sim){ x += IN.sim.x; y += IN.sim.y; }
  const l = Math.hypot(x, y); if (l > 1){ x /= l; y /= l; }
  IN.x = x; IN.y = y; IN.run = !!(k.ShiftLeft || k.ShiftRight) || Math.hypot(joy.x, joy.y) > .95 || !!(IN.sim && IN.sim.run);
}
const arcPlaying = () => ARC.state === 'play' || ARC.state === 'count';
window.addEventListener('keydown', e => {
  if (!ARC.in || e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (/^Arrow|^Space$|^Tab$/.test(e.code)) e.preventDefault();
  if (e.repeat || !mgCard.hidden) return;
  IN.k[e.code] = true;
  if (ARC.state === 'hall'){
    if (IN_A[e.code]) arcUse();
    else if (e.code === 'Tab' || e.code === 'KeyL') arcOpenList();
    else if (e.code === 'KeyR') arcAct('laugh');
    else if (e.code === 'KeyQ') arcAct('pose');
  } else if (arcPlaying()){
    if (IN_A[e.code]){ IN.a = true; IN.pa = true; }
    if (IN_B[e.code]){ IN.b = true; IN.pb = true; }
  }
});
window.addEventListener('keyup', e => {
  IN.k[e.code] = false;
  if (IN_A[e.code]) IN.a = Object.keys(IN_A).some(c => IN.k[c]) || mgBtnA.classList.contains('on');
  if (IN_B[e.code]) IN.b = Object.keys(IN_B).some(c => IN.k[c]) || mgBtnB.classList.contains('on');
});
window.addEventListener('blur', inReset);
/* taps and drags on the canvas. controls.tap: a tap counts as button A. controls.swipe: the game also gets the drag while a finger
   (or the mouse) is down, and the whole swipe when it lifts; distances are in units of the shorter side of the screen, up is +dy.
   Only one pointer drags at a time, so the other thumb can stay on the joystick. */
canvas.addEventListener('pointerdown', e => {
  const c = MG.cur && MG.cur.controls;
  if (ARC.state !== 'play' || !c || (!c.tap && !c.swipe)) return;
  const r = canvas.getBoundingClientRect();
  IN.tapX = (e.clientX - r.left) / r.width * 2 - 1; IN.tapY = -((e.clientY - r.top) / r.height) * 2 + 1; IN.ptap = true; if (c.tap) IN.pa = true;
  if (c.swipe && IN.ptr < 0){
    IN.ptr = e.pointerId; IN.drag = {x0:e.clientX, y0:e.clientY, dx:0, dy:0, s:Math.max(1, Math.min(r.width, r.height)), t0:performance.now()};
    try { canvas.setPointerCapture(e.pointerId); } catch(_){}
  }
});
canvas.addEventListener('pointermove', e => { const d = IN.drag; if (d && e.pointerId === IN.ptr){ d.dx = (e.clientX - d.x0) / d.s; d.dy = (d.y0 - e.clientY) / d.s; } });
function inDragEnd(e, cancel){
  const d = IN.drag; if (!d || e.pointerId !== IN.ptr) return;
  IN.ptr = -1; IN.drag = null;
  if (!cancel && ARC.state === 'play'){ IN.swipe = {dx:(e.clientX - d.x0) / d.s, dy:(d.y0 - e.clientY) / d.s, t:(performance.now() - d.t0) / 1000}; IN.pswipe = true; }
}
canvas.addEventListener('pointerup', e => inDragEnd(e, false)); canvas.addEventListener('pointercancel', e => inDragEnd(e, true));
function arcAct(k){
  if (k === 'jump'){ if (!nw.air){ nw.air = true; nw.vy = 7.5; sfx.boing(); } return; }
  if (nw.air) return;
  nw.state = k; nw.t = 0; if (k === 'laugh') sfx.laugh(); else sfx.sparkle();
}
/* shared walking: camera-relative, same feel as js/40-vehicles.js updateFoot. o = {speed, runSpeed, yaw, blocked(x, z) in world metres} */
function arcWalk(dt, o){
  nw.spd = 0;
  if (nw.state === 'laugh' || nw.state === 'pose') return false;
  const f = IN.y, r = IN.x, l = Math.hypot(f, r); if (l < .08) return false;
  const yaw = o.yaw || 0, s = Math.sin(yaw), c = Math.cos(yaw);
  let dx = -s * f + c * r, dz = -c * f - s * r; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
  let dh = Math.atan2(dx, dz) - nw.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); nw.h += dh * Math.min(1, dt * 12);
  const run = IN.run && o.runSpeed, sp = (run ? o.runSpeed : o.speed) * Math.min(1, l), v = sp * dt, bl = o.blocked, stuck = bl(nw.x, nw.z);
  if (stuck || !bl(nw.x + dx * v, nw.z)) nw.x += dx * v;
  if (stuck || !bl(nw.x, nw.z + dz * v)) nw.z += dz * v;
  nw.spd = sp; nw.walkT += dt * (run ? 13 : 9);
  return true;
}

/* ---------- DOM: HUD, hall bar, card (intro / pause / result), game list, platform buttons ---------- */
const mgHud = arcEl('div', 'panel'); mgHud.id = 'mgHud'; mgHud.hidden = true;
mgHud.innerHTML = `<div class="mg-name"><i id="mgIcon"></i><b id="mgName"></b></div>
  <div class="mg-cell" id="mgTimeC"><span>时间</span><b id="mgTime"></b></div>
  <div class="mg-cell" id="mgScoreC"><span>得分</span><b id="mgScore"></b></div>
  <div class="mg-info" id="mgInfo"></div>
  <button type="button" class="mg-pause" id="mgPauseBtn" aria-label="暂停"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3v10M11.5 3v10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>`;
const arcBar = arcEl('div', 'panel'); arcBar.id = 'arcBar'; arcBar.hidden = true;
arcBar.innerHTML = `<b>B1 游戏厅</b><button type="button" class="btn primary" id="arcListBtn">游戏列表</button><button type="button" class="btn" id="arcLbBtn">排行榜</button><button type="button" class="btn" id="arcOutBtn">出门</button>`;
const mgCard = arcEl('div', 'panel'); mgCard.id = 'mgCard'; mgCard.hidden = true; mgCard.setAttribute('role', 'dialog'); mgCard.setAttribute('aria-modal', 'true'); mgCard.setAttribute('aria-labelledby', 'mgCardT');
const mgUi = arcEl('div'); mgUi.id = 'mgUi'; mgUi.hidden = true;
const mgList = document.createElement('dialog'); mgList.id = 'mgList'; mgList.className = 'panel sheet'; mgList.setAttribute('aria-labelledby', 'mgListT');
mgList.innerHTML = `<div class="sheet-h"><h2 id="mgListT">小游戏</h2><button type="button" class="x" data-close aria-label="关闭">×</button></div>
  <p class="mg-lead">B1 游戏厅里的街机。得分换 RM，每个游戏有自己的排行榜。</p><div id="mgRows"></div>
  <div class="hrow"><button type="button" class="btn" id="mgListLb">排行榜</button><button type="button" class="btn" data-close>逛逛游戏厅</button></div>`;
document.body.append(mgHud, arcBar, mgCard, mgUi, mgList);
const mgBtnA = arcEl('button', 'mg-b'), mgBtnB = arcEl('button', 'mg-b');
mgBtnA.innerHTML = '<b></b><kbd>空格</kbd>'; mgBtnB.innerHTML = '<b></b><kbd>K</kbd>'; mgBtnA.type = mgBtnB.type = 'button'; mgBtnA.hidden = mgBtnB.hidden = true;
acts.append(mgBtnB, mgBtnA);
function mgBtnSet(el, text){ el.hidden = !text; if (text && el.firstChild.textContent !== text) el.firstChild.textContent = text; }
for (const [el, key] of [[mgBtnA, 'a'], [mgBtnB, 'b']]){
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); ac(); el.classList.add('on');
    if (ARC.state === 'hall'){ if (key === 'a') arcUse(); }
    else if (arcPlaying()){ IN[key] = true; IN['p' + key] = true; }
  });
  const up = () => { el.classList.remove('on'); IN[key] = false; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
const arcFocus = () => { try { canvas.focus({preventScroll:true}); } catch(e){} };
$('#mgPauseBtn').addEventListener('click', () => { ac(); arcEsc(); });
$('#arcListBtn').addEventListener('click', () => { ac(); arcOpenList(); });
$('#arcLbBtn').addEventListener('click', () => { ac(); arcOpenBoard(); });
$('#arcOutBtn').addEventListener('click', () => { ac(); arcLeave(); });
$('#mgListLb').addEventListener('click', () => { arcCloseList(); arcOpenBoard(); });
function arcSetPrompt(t){ if (promptEl.textContent !== t) promptEl.textContent = t; promptEl.hidden = !t; }

/* card: {kicker, title, lines:[text | Node], btns:[{t, primary, fn}], esc:fn} */
let mgCardEsc = null;
function arcCard(o){
  mgCard.textContent = '';
  if (o.kicker) mgCard.append(arcEl('div', 'eyebrow', o.kicker));
  const h = arcEl('h2', null, o.title); h.id = 'mgCardT'; mgCard.append(h);
  for (const l of o.lines || []) if (l != null && l !== '') mgCard.append(typeof l === 'string' ? arcEl('p', null, l) : l);
  const row = arcEl('div', 'hrow'); let first = null;
  for (const b of o.btns){
    const el = arcEl('button', 'btn' + (b.primary ? ' primary' : ''), b.t); el.type = 'button';
    el.addEventListener('click', () => { ac(); b.fn(); }); row.append(el); if (b.primary && !first) first = el;
  }
  mgCard.append(row); mgCardEsc = o.esc || null; mgCard.hidden = false; document.body.classList.add('mg-card');
  if (first) first.focus({preventScroll:true});
}
function arcCardClose(){ mgCard.hidden = true; mgCardEsc = null; document.body.classList.remove('mg-card'); arcFocus(); }
const arcOpenDlg = d => { if (typeof uiOpenDialog === 'function') uiOpenDialog(d); else if (d.showModal) d.showModal(); };
function arcCloseList(){ if (mgList.open) mgList.close(); }
function arcOpenList(){
  const rows = $('#mgRows'); rows.textContent = '';
  if (!MG.list.length) rows.append(arcEl('p', 'mg-lead', '还没有小游戏'));
  for (const g of MG.list){
    const b = arcEl('button', 'mg-row'); b.type = 'button'; b.style.setProperty('--mg-c', g.color);
    const one = g.vars.length === 1, v0 = g.vars[0], best = mgBest(v0.id), md = one ? mgMedal(v0, best) : 3, txt = arcEl('span', 'mg-row-t');
    const got = g.vars.filter(v => mgMedal(v, mgBest(v.id)) < 3).length;
    txt.append(arcEl('b', null, g.name), arcEl('span', null, g.desc));
    txt.append(arcEl('em', md < 3 ? 'm' + md : '', !one ? `${g.vars.length} 个模式` + (got ? ` · 拿到 ${got} 枚奖牌` : mgPlayed(g) ? '' : ' · 还没玩过')
      : best != null ? `本机最好 ${mgFmt(v0, best)}${md < 3 ? ' · ' + GX_MEDAL[md] : ''}` : '还没玩过'));
    b.append(arcEl('i', 'mg-row-i', g.icon), txt, arcEl('span', 'mg-row-go', '开玩'));
    b.addEventListener('click', () => { ac(); arcCloseList(); mgIntro(g.id); });
    rows.append(b);
  }
  arcOpenDlg(mgList);
}
function arcOpenBoard(id){
  const g = MG.vById[id] || (MG.byId[id] && mgLastVar(MG.byId[id])) || MG.cur || MG.pending || (MG.list[0] && mgLastVar(MG.list[0]));
  if (window.XUI && XUI.openLeaderboard) XUI.openLeaderboard(g && g.board ? 'mini:' + g.id : 'mini');
}

/* ---------- entering and leaving the hall ---------- */
function arcEnter(o){
  o = o || {};
  if (ARC.in) return true;
  if (typeof titleOpen !== 'undefined' && titleOpen && window.XUI) XUI.closeTitle('naiwa');
  if (mode !== 'naiwa') setMode('naiwa');
  if (mode !== 'naiwa') return false;
  if (window.XWard && XWard.on) XWard.close();
  if (driving) leaveCar();
  closeShop(); if (gx.paused) gx.togglePause();
  arcBuild(); arcCabinets();
  ARC.keep = {dist:camDist, pitch:camPitch};
  ARC.door = o.door || null;   /* XMini.startAt: came in from somewhere else on the map and goes back there */
  ARC.in = true; ARC.state = 'hall'; window.XINDOOR = 'arcade'; window.XINDOOR_AT = ARC.door ? Object.assign({}, ARC.door) : {x:ARC_DOOR.x, z:ARC_DOOR.z, h:ARC_DOOR.h, name:'B1 游戏厅'};
  gx.paused = true; keys.Space = false; engineUpdate(0, 0, false); inReset();
  Object.assign(nw, {x:ARC.ox + ARC_SPAWN[0], z:ARC.oz + ARC_SPAWN[1], y:0, h:Math.PI, air:false, state:'idle', spd:0, vy:0});
  arcMark.visible = false; arcLbl.dead = true; arcPrompt = ''; if (ARC.fLbl){ ARC.fLbl = false; updateActs(); }
  wx.rain = 0; arcG.visible = true; arcWorld(false); arcLight(true); fitShadow(ARC.ox, ARC.oz, 22); arcHallCam();
  document.body.classList.add('arc-in'); arcBar.hidden = false; arcSetPrompt('');
  if (!ARC.door) unlock('arcade1'); if (!o.quiet){ sfx.ding(); toast('B1 游戏厅', TOUCH ? '走到街机前点「开玩」，或者点上面的「游戏列表」' : '走到街机前按 F 开玩，Tab 打开游戏列表'); }
  arcFocus();
  return true;
}
function arcLeave(quiet){
  if (!ARC.in) return;
  ARC.leaving = true; if (MG.cur) mgEnd(); ARC.leaving = false;
  arcCardClose(); arcCloseList(); MG.pending = null;
  ARC.in = false; ARC.state = 'out'; window.XINDOOR = null; window.XINDOOR_AT = null; gx.paused = false;
  arcG.visible = false; arcWorld(true); arcLight(false);
  for (const s of ARC.spots) if (s.lbl) s.lbl.dead = true;
  const d = ARC.door || ARC_DOOR; ARC.door = null;
  Object.assign(nw, {x:d.x + Math.sin(d.h) * 2, z:d.z + Math.cos(d.h) * 2, y:0, h:d.h, air:false, state:'idle', spd:0, vy:0});
  camYaw = d.h + Math.PI; if (ARC.keep){ camDist = ARC.keep.dist; camPitch = ARC.keep.pitch; }
  NW.root.visible = mode !== 'hole'; NW.root.position.set(nw.x, 0, nw.z); NW.root.rotation.y = nw.h;
  camera.fov = 60; camera.updateProjectionMatrix();
  document.body.classList.remove('arc-in'); arcBar.hidden = true; mgBtnSet(mgBtnA, ''); mgBtnSet(mgBtnB, ''); arcSetPrompt(''); inReset(); updateActs();
  if (!quiet){ sfx.ding(); arcFocus(); }
}
function arcUse(){ const s = ARC.near; if (s && ARC.state === 'hall' && mgCard.hidden) s.fn(); }
function arcHallFrame(dt){
  arcWalk(dt, {speed:6.5, runSpeed:10, yaw:0, blocked:arcHallBlocked});
  const lx = nw.x - ARC.ox, lz = nw.z - ARC.oz, t = performance.now() / 300;
  let best = null, bd = 1e9;
  for (const s of ARC.spots){
    const d = Math.hypot(lx - s.x, lz - s.z); if (d < s.r && d < bd){ bd = d; best = s; }
    if (s.ring) s.ring.scale.setScalar(1 + Math.sin(t + s.x) * .07);
    if (s.lbl) s.lbl.dead = false;
  }
  ARC.exitRing.scale.setScalar(1 + Math.sin(t) * .07);
  ARC.near = best;
  arcSetPrompt(!mgCard.hidden ? '' : best ? (TOUCH ? `点「${best.act}」` : '按 F ') + best.say : TOUCH ? '' : 'WASD 走 · F 开玩 · Tab 游戏列表 · R 大笑');
  mgBtnSet(mgBtnA, best ? best.act : ''); mgBtnSet(mgBtnB, '');
}
function arcMenu(){
  arcCard({kicker:'暂停', title:'B1 游戏厅', lines:[`钱包 ${fmtRM(money)} · 已经玩过 ${MG.list.filter(mgPlayed).length} / ${MG.list.length} 个小游戏`],
    btns:[{t:'继续逛', primary:true, fn:arcCardClose}, {t:'游戏列表', fn:() => { arcCardClose(); arcOpenList(); }}, {t:'排行榜', fn:() => { arcCardClose(); arcOpenBoard(); }}, {t:'出门', fn:() => arcLeave()}], esc:arcCardClose});
}
/* P / Esc, the HUD pause button */
function arcEsc(){
  if (!mgCard.hidden){ if (mgCardEsc) mgCardEsc(); return; }
  if (ARC.state === 'hall') arcMenu();
  else if (arcPlaying()) mgPause(true);
}

/* ---------- a second 奶娃 for mini-games (a rival, a teammate): ctx.actor({color, belly}) ----------
   Set x / z / y / h / spd (m/s, drives the walk cycle) / up (arms raised) / lean, then call update(dt). Lives under ctx.root, so it goes with it. */
function arcActor(root, o){
  o = o || {};
  const A = makeNaiwa(), [aL, aR] = A.arms, [eL, eR] = A.elbows, [lL, lR] = A.legs;
  if (o.color) A.mats.skin.color.set(o.color);
  if (o.belly) A.mats.belly.color.set(o.belly);
  root.add(A.root);
  const a = {obj:A.root, parts:A, x:0, z:0, y:0, h:0, spd:0, walkT:0, up:false, lean:0,
    update(dt){
      const mv = a.spd > .3, air = a.y > .05; if (mv) a.walkT += dt * (7 + a.spd * .6);
      const sw = mv ? Math.sin(a.walkT) : 0;
      lL.rotation.x = air ? -.6 : sw * .55; lR.rotation.x = air ? -.6 : -sw * .55;
      if (a.up || air){ aL.rotation.set(-.2, 0, a.up ? 2.5 : 1.3); aR.rotation.set(-.2, 0, a.up ? -2.5 : -1.3); eL.rotation.set(-.3, 0, 0); eR.rotation.set(-.3, 0, 0); }
      else { aL.rotation.set(-.32 - sw * .35, 0, .36); aR.rotation.set(-.32 + sw * .35, 0, -.36); eL.rotation.set(-1.22, 0, -.32); eR.rotation.set(-1.22, 0, .32); }
      A.body.rotation.set(a.lean, 0, sw * .08); A.body.position.y = mv ? Math.abs(sw) * .05 : 0;
      A.root.position.set(a.x, a.y, a.z); A.root.rotation.y = a.h;
    }};
  a.update(0);
  return a;
}

/* ---------- running a mini-game ---------- */
function mgHudShow(g){
  $('#mgIcon').textContent = g.icon; $('#mgName').textContent = g.name + (g.mode ? ' · ' + g.modeName : ''); mgHud.style.setProperty('--mg-c', g.color);
  $('#mgTimeC').hidden = $('#mgScoreC').hidden = true; $('#mgInfo').textContent = ''; $('#mgTimeC').classList.remove('urgent');
  mgHud.hidden = false;
}
function mgCtx(g){
  const root = new THREE.Group(); root.position.set(ARC.sx, 0, ARC.sz); scene.add(root);
  const sx = ARC.sx, sz = ARC.sz;
  const ctx = {
    game:g, mode:g.mode ? g.mode.id : null, modeDef:g.mode, root, q:arcQ(), touch:TOUCH, reduced:REDUCED, dead:false,
    get aspect(){ return camera.aspect; }, get elapsed(){ return MG.elapsed; }, get best(){ return mgBest(g.id); },
    camera:{
      set(pos, look, fov){ ACam.fit = ACam.follow = null; ACam.pos.set(sx + pos[0], pos[1], sz + pos[2]); ACam.look.set(sx + look[0], look[1], sz + look[2]); if (fov) ACam.fov = fov; },
      fit(o){ ACam.follow = null; ACam.fit = Object.assign({cx:0, cz:0, y:0, w:10, d:10, pitch:1, yaw:0, margin:1.06}, o); if (o.fov) ACam.fov = o.fov; },
      follow(target, o){ ACam.fit = null; ACam.follow = Object.assign({target, height:1.4, dist:12, pitch:.9, yaw:0}, o); if (o && o.fov) ACam.fov = o.fov; if (o && o.lerp) ACam.lerp = o.lerp; },
      shake(v){ ACam.shake = Math.max(ACam.shake, v || .4); },
      snap(){ ACam.snap = true; }
    },
    input:{
      get x(){ return IN.x; }, get y(){ return IN.y; }, get run(){ return IN.run; }, get a(){ return IN.a; }, get b(){ return IN.b; },
      get tapX(){ return IN.tapX; }, get tapY(){ return IN.tapY; },
      get drag(){ return IN.drag; }, get swipe(){ return IN.swipe; },
      pressed(k){ return k === 'a' ? IN.pa : k === 'b' ? IN.pb : k === 'tap' ? IN.ptap : k === 'swipe' ? IN.pswipe : false; },
      label(k, text){ mgBtnSet(k === 'b' ? mgBtnB : mgBtnA, text || ''); }
    },
    player:{
      get x(){ return nw.x - sx; }, set x(v){ nw.x = sx + v; }, get z(){ return nw.z - sz; }, set z(v){ nw.z = sz + v; },
      get y(){ return nw.y; }, get h(){ return nw.h; }, set h(v){ nw.h = v; }, get visible(){ return NW.root.visible; }, set visible(v){ NW.root.visible = !!v; },
      show(x, z, h){ nw.x = sx + (x || 0); nw.z = sz + (z || 0); nw.y = 0; if (h != null) nw.h = h; nw.state = 'idle'; nw.air = false; nw.spd = 0; NW.root.visible = true; NW.root.position.set(nw.x, 0, nw.z); NW.root.rotation.y = nw.h; },
      hide(){ NW.root.visible = false; },
      /* o: {speed, runSpeed, yaw, minX, maxX, minZ, maxZ, blocked(x, z)} in stage metres */
      walk(dt, o){
        o = o || {};
        return arcWalk(dt, {speed:o.speed || 6, runSpeed:o.runSpeed, yaw:o.yaw || 0, blocked:(x, z) => {
          const lx = x - sx, lz = z - sz;
          return (o.minX != null && lx < o.minX) || (o.maxX != null && lx > o.maxX) || (o.minZ != null && lz < o.minZ) || (o.maxZ != null && lz > o.maxZ) || (o.blocked ? !!o.blocked(lx, lz) : false);
        }});
      },
      act:arcAct
    },
    hud:{
      score(v){ const c = $('#mgScoreC'); c.hidden = false; const t = typeof v === 'number' ? String(Math.round(v)) : String(v); const el = $('#mgScore'); if (el.textContent !== t) el.textContent = t; },
      /* also ticks through the last five seconds, so every timed game gets the same tension for free */
      time(s, quiet){
        const c = $('#mgTimeC'), n = Math.max(0, Math.ceil(s)), t = String(n), el = $('#mgTime'); c.hidden = false;
        if (el.textContent !== t){ if (!quiet && n >= 1 && n <= 5 && +el.textContent === n + 1 && ARC.state === 'play') tone('square', n <= 2 ? 880 : 660, n <= 2 ? 880 : 660, .07, .07); el.textContent = t; }
        c.classList.toggle('urgent', s <= 10);
      },
      info(t){ const el = $('#mgInfo'); t = t || ''; if (el.textContent !== t) el.textContent = t; },
      hint(t){ arcSetPrompt(t || ''); },
      callout(t, sub, color){ gx.callout(t, sub, color || g.color); },
      toast(t, sub, ms){ toast(t, sub, ms); }
    },
    ui:mgUi,
    /* stage metres -> CSS pixels on the screen, for HTML that has to sit next to something in the scene */
    screen(x, y, z){ const r = canvas.getBoundingClientRect(); _acP.set(sx + x, y, sz + z).project(camera); return [r.left + (_acP.x + 1) / 2 * r.width, r.top + (1 - _acP.y) / 2 * r.height]; },
    actor(o){ return arcActor(root, o); },
    debug(v){ MG.dbg = v; },
    sfx, tone, noise, rnd:Math.random,
    part(kind, x, y, z, size, o){ spawnPart(kind, sx + x, y, sz + z, size, o); },
    after(sec, fn){ const run = MG.run; MG.timers.push({t:MG.elapsed + sec, fn:() => { if (run === MG.run && !ctx.dead) fn(); }}); },
    on(target, type, fn, opt){ target.addEventListener(type, fn, opt); MG.offs.push(() => target.removeEventListener(type, fn, opt)); },
    finish(score, o){ if (!ctx.dead) mgFinish(score, o); },
    earn(v){ v = Math.max(0, Math.min(+v || 0, MG_CAP - MG.paid)); if (v > 0){ MG.paid += v; earn(v); } return v; },
    unlock(id){ unlock(id); },
    pause(){ if (!ctx.dead && arcPlaying()) mgPause(true); },
    quit(){ if (!ctx.dead) mgEnd(); },
    board:{top:n => (window.XNet && XNet.miniTop ? XNet.miniTop(g.id, n).then(rows => rows.map(r => Object.assign({}, r, {value:mgFromBoard(g, r.value)}))) : Promise.resolve([])), fmt:v => mgFmt(g, v)},
    store:{get(k){ const s = mgSave.store[g.base.id]; return s ? s[k] : undefined; }, set(k, v){ (mgSave.store[g.base.id] = mgSave.store[g.base.id] || {})[k] = v; mgWrite(); }}
  };
  return ctx;
}
function mgKeysText(g){
  const c = g.controls, out = [];
  if (c.help) return TOUCH ? c.help.touch : c.help.key;
  if (TOUCH){ if (c.move) out.push('左下摇杆移动'); if (c.a) out.push(c.tap ? `点屏幕或「${c.a}」` : `右下「${c.a}」`); if (c.b) out.push(`右下「${c.b}」`); }
  else { if (c.move) out.push('WASD 移动，Shift 跑'); if (c.a) out.push(`空格${c.tap ? '或点鼠标' : ''}：${c.a}`); if (c.b) out.push(`K：${c.b}`); out.push('P 暂停'); }
  return out.join(' · ');
}
/* id: a game id, or the board id of one mode; modeId picks a mode of that game (default: the one played last) */
function mgIntro(id, modeId){
  const base = MG.byId[id] || (MG.vById[id] && MG.vById[id].base); if (!base) return false;
  const g = base.vars.find(v => v.mode && v.mode.id === modeId) || (!MG.byId[id] && MG.vById[id]) || mgLastVar(base);
  if (!ARC.in && !arcEnter({quiet:true})) return false;
  if (MG.cur) mgEnd();
  arcCloseList(); MG.pending = g;
  const best = mgBest(g.id), md = mgMedal(g, best), lines = [];
  if (base.vars.length > 1){
    const chips = arcEl('div', 'lb-chips'); chips.style.justifyContent = 'center'; chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', '选模式');
    for (const v of base.vars){
      const vm = mgMedal(v, mgBest(v.id)), c = arcEl('button', 'lb-chip', v.modeName + (vm < 3 ? ' ' + ['🥇', '🥈', '🥉'][vm] : '')); c.type = 'button'; c.setAttribute('aria-pressed', String(v === g));
      c.addEventListener('click', () => { ac(); mgIntro(base.id, v.mode.id); }); chips.append(c);
    }
    lines.push(chips);
  }
  lines.push(g.intro || g.desc, mgKeysText(g));
  if (g.medals) lines.push(`金牌 ${mgFmt(g, g.medals[0])} · 银牌 ${mgFmt(g, g.medals[1])} · 铜牌 ${mgFmt(g, g.medals[2])}`);
  const b = arcEl('div', 'mg-best'); b.append(arcEl('span', null, '本机最好'), arcEl('b', null, best != null ? mgFmt(g, best) + (md < 3 ? ' · ' + GX_MEDAL[md] : '') : '还没玩过')); lines.push(b);
  const back = () => { MG.pending = null; arcCardClose(); };
  const btns = [{t:'开始', primary:true, fn:mgBegin}]; if (g.board) btns.push({t:'排行榜', fn:() => arcOpenBoard(g.id)}); btns.push({t:'返回', fn:back});
  arcCard({kicker:g.mode ? '模式 · ' + g.modeName : 'B1 游戏厅', title:g.icon + ' ' + g.name, lines, btns, esc:back});
  return true;
}
function mgBegin(){
  const g = MG.pending; if (!g || !ARC.in) return;
  arcCardClose(); MG.pending = null;
  if (ARC.state === 'hall') ARC.back = {x:nw.x, z:nw.z, h:nw.h};
  MG.cur = g; MG.elapsed = 0; MG.paid = 0; MG.timers.length = 0; MG.run++; MG.dbg = null;
  if (g.mode && mgSave.last[g.base.id] !== g.mode.id){ mgSave.last[g.base.id] = g.mode.id; mgWrite(); }
  for (const s of ARC.spots) if (s.lbl) s.lbl.dead = true;
  arcG.visible = false; arcBar.hidden = true; ARC.near = null;
  const ctx = MG.ctx = mgCtx(g);
  NW.root.visible = false; Object.assign(nw, {state:'idle', air:false, y:0, spd:0});
  inReset(); mgHudShow(g); mgUi.textContent = ''; mgUi.hidden = false; arcSetPrompt('');
  mgBtnSet(mgBtnA, g.controls.a); mgBtnSet(mgBtnB, g.controls.b);
  document.body.classList.add('mg-on'); document.body.classList.toggle('mg-nomove', !g.controls.move);
  Object.assign(ACam, {fit:null, follow:null, ox:ARC.sx, oz:ARC.sz, fov:55, lerp:6, snap:true, shake:0});
  ACam.pos.set(ARC.sx, 14, ARC.sz + 12); ACam.look.set(ARC.sx, 0, ARC.sz);
  arcLight(true, g.sky); fitShadow(ARC.sx, ARC.sz, g.shadow);
  ARC.state = g.countdown === false ? 'play' : 'count'; MG.cd = 2.25; MG.beep = 4;
  try { g.start(ctx); } catch(e){ mgCrash(e); return; }
  arcFocus();
}
function mgCrash(e){
  console.error('[XMini] 小游戏出错：' + (MG.cur && MG.cur.id), e);
  const name = MG.cur ? MG.cur.name : '';
  const out = !!ARC.door; mgEnd(); toast(`「${name}」出错了`, out ? '已经回到门口' : '已经回到游戏厅', 2600); sfx.fail();
}
function mgCount(dt){
  MG.cd -= dt; const n = Math.ceil(MG.cd / .75), g = MG.cur;
  if (n < MG.beep){ MG.beep = n; if (n > 0){ gx.callout(String(n), g.name, g.color); tone('square', 660, 660, .14, .09); } else { gx.callout('开始！', '', g.color); tone('square', 1320, 1320, .3, .12); } }
  if (MG.cd <= 0) ARC.state = 'play';
}
function mgTick(dt){
  MG.elapsed += dt;
  if (MG.timers.length){ const due = MG.timers.filter(t => t.t <= MG.elapsed); if (due.length){ MG.timers = MG.timers.filter(t => t.t > MG.elapsed); for (const t of due) t.fn(); } }
  if (ARC.state !== 'play' || !MG.cur) return;
  try { MG.cur.update(dt, MG.ctx); } catch(e){ mgCrash(e); }
}
function mgPause(on){
  const g = MG.cur; if (!g) return;
  if (on){
    if (!arcPlaying()) return;
    MG.prev = ARC.state; ARC.state = 'pause'; inReset();
    try { if (g.pause) g.pause(true, MG.ctx); } catch(e){ console.error(e); }
    arcCard({kicker:'暂停', title:mgTitle(g), lines:[mgKeysText(g)],
      btns:[{t:'继续', primary:true, fn:() => mgPause(false)}, {t:'重新开始', fn:mgRetry}, {t:'退出游戏', fn:() => mgEnd()}], esc:() => mgPause(false)});
  } else if (ARC.state === 'pause'){
    arcCardClose(); ARC.state = MG.prev || 'play'; inReset();
    try { if (g.pause) g.pause(false, MG.ctx); } catch(e){ console.error(e); }
  }
}
function mgRetry(){ const g = MG.cur || MG.pending; if (!g) return; mgEnd(true); MG.pending = g; mgBegin(); }
/* tear the game down and go back to the hall (again = another round follows right away) */
function mgEnd(again){
  const g = MG.cur, ctx = MG.ctx; if (!g) return;
  try { if (g.stop) g.stop(ctx); } catch(e){ console.error(e); }
  ctx.dead = true; MG.run++;
  for (const off of MG.offs) try { off(); } catch(e){}
  MG.offs.length = 0; MG.timers.length = 0;
  scene.remove(ctx.root); arcDispose(ctx.root);
  mgUi.textContent = ''; mgUi.hidden = true; mgHud.hidden = true; arcCardClose();
  document.body.classList.remove('mg-on', 'mg-nomove'); mgBtnSet(mgBtnA, ''); mgBtnSet(mgBtnB, ''); arcSetPrompt(''); inReset();
  MG.cur = MG.ctx = null; ARC.state = 'hall';
  const b = ARC.back || {x:ARC.ox + ARC_SPAWN[0], z:ARC.oz + ARC_SPAWN[1], h:Math.PI};
  Object.assign(nw, {x:b.x, z:b.z, h:b.h, y:0, air:false, state:'idle', spd:0, vy:0}); NW.root.visible = true;
  if (!again){ arcG.visible = true; arcBar.hidden = false; }
  arcLight(true); fitShadow(ARC.ox, ARC.oz, 22); arcHallCam();
  if (!again && ARC.door && !ARC.leaving) arcLeave();   /* played from outside the hall: straight back to where you came in */
}
/* the round is over: medal, local best, RM, achievements, leaderboard, result card */
function mgFinish(score, o){
  const g = MG.cur; if (!g || !arcPlaying()) return;
  o = o || {}; ARC.state = 'result'; inReset(); mgBtnSet(mgBtnA, ''); mgBtnSet(mgBtnB, ''); arcSetPrompt('');
  const has = score != null && isFinite(score), low = g.board && g.board.lower, max = (g.board && g.board.max) || MG_MAX;
  const v = has ? Math.max(0, Math.min(max, Math.round(score * 100) / 100)) : null, medal = mgMedal(g, v);
  const prev = mgBest(g.id), rec = has && (prev == null || (low ? v < prev : v > prev));
  if (rec) mgSave.best[g.id] = v;
  mgSave.plays[g.id] = (mgSave.plays[g.id] || 0) + 1; mgWrite();
  let pay = !has ? 0 : typeof g.reward === 'function' ? +g.reward(v, medal) || 0 : medal < 3 ? [30, 18, 10][medal] : 4;
  pay = Math.round(Math.max(0, Math.min(pay, MG_CAP - MG.paid)));
  sess.acts++; if (medal < 3) sess.medals++;
  if (pay > 0){ MG.paid += pay; earn(pay); } else saveGame();
  if (medal === 0) unlock('arcgold');
  if (MG.list.length > 1 && MG.list.every(mgPlayed)) unlock('arcadeall');
  if (medal < 3){ gx.callout(GX_MEDAL[medal], has ? mgFmt(g, v) : '', ['#e3b95a', '#b8c2cc', '#c98a55'][medal]); for (let i = 0; i < 5; i++) tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), .18, .13, i * .09); }
  else sfx.ding();
  if (rec && prev != null) setTimeout(() => { if (ARC.state === 'result') sfx.laugh(); }, 700);   /* a new personal best: 奶娃 laughs */
  const lines = [];
  const big = arcEl('div', 'mg-score'); big.append(arcEl('b', null, o.big || (has ? mgFmt(g, v) : '—')), arcEl('span', medal < 3 ? 'm' + medal : '', medal < 3 ? GX_MEDAL[medal] : has ? '没拿到奖牌' : '这局没有成绩')); lines.push(big);
  if (o.sub) lines.push(o.sub);
  lines.push((rec ? (prev != null ? '新纪录！' : '第一次完成') : prev != null ? `本机最好 ${mgFmt(g, prev)}` : '') + (pay > 0 ? `${rec || prev != null ? ' · ' : ''}+RM ${pay}` : ''));
  if (has && g.medals && medal > 0){ const need = Math.abs(g.medals[medal - 1] - v); lines.push(`离${GX_MEDAL[medal - 1]}还差 ${mgFmt(g, Math.ceil(need * 100) / 100)}`); }
  const net = arcEl('p', 'mg-net'); lines.push(net);
  const run = MG.run, N = window.XNet;
  if (!g.board) net.hidden = true;
  else if (!N || !N.online || !N.miniSubmit) net.textContent = '联机未开启，成绩只保存在本机';
  else if (!has || !(mgToBoard(g, v) > 0)) net.textContent = '这局没有成绩，不上榜';
  else {
    net.textContent = '正在提交成绩…';
    Promise.resolve(N.miniSubmit(g.id, mgToBoard(g, mgBest(g.id)))).then(() => N.miniTop(g.id, 50)).then(rows => {
      if (run !== MG.run) return;
      const i = rows.findIndex(r => r.uid === N.uid);
      net.textContent = i >= 0 ? `排行榜第 ${i + 1} 名（${mgFmt(g, mgFromBoard(g, rows[i].value))}）` : rows.length >= 50 ? '还没进前 50 名' : '成绩已提交';
    }).catch(() => { if (run === MG.run) net.textContent = '成绩没提交上去，下次再试'; });
  }
  const btns = [{t:'再来一局', primary:true, fn:mgRetry}];
  if (g.base.vars.length > 1 && !ARC.door) btns.push({t:'换模式', fn:() => { const id = g.base.id; mgEnd(); mgIntro(id); }});
  if (g.board) btns.push({t:'排行榜', fn:() => arcOpenBoard(g.id)}); btns.push({t:ARC.door ? '回' + ARC.door.name : '回游戏厅', fn:() => mgEnd()});
  arcCard({kicker:o.kicker || (medal < 3 ? '漂亮' : '结束'), title:o.title || mgTitle(g), lines, btns, esc:() => mgEnd()});
}

/* ---------- per-frame, from gx.frame (js/90-main.js calls it every frame, paused or not) ---------- */
function arcFrame(dt){
  if (!ARC.in) return;
  if (mode !== 'naiwa'){ arcLeave(true); return; }
  wx.rain = 0;   /* no rain indoors */
  inAxis();
  if (ARC.state === 'hall'){ if (!document.querySelector('dialog[open]') && mgCard.hidden) arcHallFrame(dt); else { nw.spd = 0; arcSetPrompt(''); } }
  else if (ARC.state === 'count'){ mgCount(dt); }
  else if (ARC.state === 'play') mgTick(dt);
  else nw.spd = 0;
  nw.t += dt;
  if (nw.air){ nw.vy -= 24 * dt; nw.y += nw.vy * dt; if (nw.y <= 0){ nw.y = 0; nw.air = false; } }
  if ((nw.state === 'laugh' || nw.state === 'pose') && nw.t > 2.3) nw.state = 'idle';
  NW.root.position.set(nw.x, nw.y, nw.z); NW.root.rotation.y = nw.h;
  arcCamApply(dt);
  IN.pa = IN.pb = IN.ptap = IN.pswipe = false;
}
document.addEventListener('visibilitychange', () => { if (document.hidden && ARC.state === 'play') mgPause(true); });

/* ---------- hook into the game (js/80-gta.js gx, js/90-main.js doF and frame) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); arcOutside(px, pz); },
    prompt(){ return arcPrompt || base.prompt(); },
    mini(dot){ base.mini(dot); dot(ARC_DOOR.x, ARC_DOOR.z, '#ff5fa2', 5); },
    leave(){ arcLeave(true); arcMark.visible = false; arcLbl.dead = true; arcPrompt = ''; ARC.fLbl = false; base.leave(); },
    togglePause(){ if (ARC.in){ arcEsc(); return; } base.togglePause(); },
    frame(dt, T){ if (base.frame) base.frame(dt, T); arcFrame(dt, T); }
  });
  const baseF = typeof window.roomTryF === 'function' ? window.roomTryF : null;
  window.roomTryF = function(){ if (arcNearDoor()){ arcEnter(); return true; } return baseF ? baseF() : false; };
}
arcMark.visible = false;
{ const b = $('#tArc'); if (b) b.addEventListener('click', () => { ac(); XMini.open(); }); }

/* boards that are not a cabinet in the hall (宿舍搜刮, js/89-dorm.js): same /mini/{id}/{uid} path and the same 小游戏 tab of the leaderboard dialog.
   def = {id, name, icon, fmt(value), what, local() -> this device's best, empty}; values are whole numbers, higher is better */
const MG_XBOARD = {};
function mgAddBoard(def){
  if (!def || !MG_ID.test(String(def.id || '')) || MG.byId[def.id] || MG.vById[def.id] || MG_XBOARD[def.id]){ console.error('[XMini] addBoard：id 不对或者重复', def && def.id); return false; }
  MG_XBOARD[def.id] = Object.assign({name:def.id, icon:'🏆', what:'', empty:'还没有成绩', fmt:v => Math.round(+v || 0) + ' 分', local:() => 0}, def,
    {top:n => (window.XNet && XNet.miniTop ? XNet.miniTop(def.id, n) : Promise.resolve([]))});
  return true;
}
window.XMini = {
  register:mgRegister, addBoard:mgAddBoard,
  /* one entry per leaderboard: a game without modes is itself, a game with modes gives one entry per mode (id = the board id) */
  get games(){ return [].concat(...MG.list.map(g => g.vars)); },
  get list(){ return MG.list.slice(); },
  /* ids of everything that has a leaderboard: this.games (other files may wrap it, e.g. the race tracks in js/92-racing.js), then the boards added with addBoard */
  get boards(){ return this.games.filter(g => g.board).map(g => g.id).concat(Object.keys(MG_XBOARD)); },
  get active(){ return MG.cur ? MG.cur.id : null; },
  get inside(){ return ARC.in; },
  get state(){ return ARC.state; },
  enter:arcEnter, leave:arcLeave,
  open(){ if (arcEnter({quiet:true})) arcOpenList(); },
  play:mgIntro,
  start(id, mode){ if (mgIntro(id, mode)) mgBegin(); },
  /* play a game from a door somewhere else on the map (KIP mall): no hall in between, and when the game is over 奶娃 is put back at door {x, z, h, name} */
  startAt(id, door){ const g = MG.vById[id] || (MG.byId[id] && mgLastVar(MG.byId[id])); if (!g || ARC.in || !arcEnter({quiet:true, door})) return false; MG.pending = g; mgBegin(); return true; },
  quit(){ if (MG.cur) mgEnd(); },
  best:mgBest,
  /* for testing without real time (a hidden tab runs no animation frames, see docs/MINIGAMES.md):
     sim.step(sec, each) advances the platform at 60 steps a second, calling each(dt) before every step, then draws one frame;
     sim.press('a' | 'b') is a button press for the next step, sim.move(x, y, run) holds the stick until changed */
  sim:{
    step(sec, each){
      const dt = 1 / 60; let n = Math.round(sec / dt), t = performance.now() / 1000;
      while (n-- > 0 && ARC.in){ if (each && each(dt) === false) break; arcFrame(dt); animNaiwa(dt, t += dt); updateParts(dt); }
      renderer.render(scene, camera);
    },
    press(k){ if (k === 'b'){ IN.pb = true; } else if (k === 'tap'){ IN.ptap = true; } else { IN.pa = true; } },
    hold(k, on){ k = k === 'b' ? 'b' : 'a'; if (on && !IN[k]) IN['p' + k] = true; IN[k] = !!on; },
    move(x, y, run){ IN.sim = x || y ? {x:+x || 0, y:+y || 0, run:!!run} : null; },
    drag(dx, dy){ IN.drag = dx == null ? null : {x0:0, y0:0, dx:+dx || 0, dy:+dy || 0, s:1, t0:performance.now()}; },
    swipe(dx, dy, t){ IN.drag = null; IN.swipe = {dx:+dx || 0, dy:+dy || 0, t:t || .2}; IN.pswipe = true; },
    get state(){ return MG.dbg; }
  },
  /* for the leaderboard dialog (js/ui-title.js): values on the board are "higher is better", fmt turns them back */
  board(id){
    if (MG_XBOARD[id]) return MG_XBOARD[id];
    const g = MG.vById[id]; if (!g || !g.board) return null;
    const multi = g.base.vars.length > 1, full = g.name + (g.mode ? ' · ' + g.modeName : '');
    return {name:multi ? g.modeName : g.name, icon:g.icon, fmt:v => mgFmt(g, mgFromBoard(g, +v || 0)), what:`${g.icon} ${full}：${g.desc}`, local:() => (mgBest(id) != null ? mgToBoard(g, mgBest(id)) : 0), empty:`还没玩过「${full}」，去 B1 游戏厅试试`,
      top:n => (window.XNet && XNet.miniTop ? XNet.miniTop(id, n) : Promise.resolve([]))};
  }
};
