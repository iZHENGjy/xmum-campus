/* XMUM 校园漫游 · 主线剧情的核心：状态、轮询、奖励、存档、老玩家迁移、人机奶蛙、开车上锁
 *
 * 设计：docs/quests.md。数据（章节、步骤、台词、日记、消息）在 js/89-quest-data.js（window.XQD），界面在 js/89-quest-ui.js，过场在 js/89-cine.js。
 *
 * 存档 localStorage 'xmum-quest-v1'（xmum-* 键，Google 登录的人跟着 js/net.js 云同步）：
 *   {v:1, born:'new'|'vet', ch, ph:'meet'|'steps'|'report'|'done', done:{步骤 id:时间}, paid:{奖励 id:1}, flags:{}, sides:{id:'open'|'done'},
 *    diary:[{s:句子 id, d:开学第几天, c:章, v:{填空}}], msgs:[{m:消息 id, d, c, t:时间}], days:[日期], hints:{}, nudged:{}, stepT:{}, fired:{},
 *    intro:看过开场, welcome:{rm, chs, items}（老玩家欢迎卡还没看）, quiet:收起任务条, home:{day, n}, title}
 *   日记和消息只存 id 和填空，打开日记时再拼成文字，存档很小。
 * 什么时候写存档：云同步做完以后（XNet.synced；离线马上就好）。之前只在内存里，这样 Google 登录的新设备被云端旧存档覆盖、刷新时不会留下一份错的主线存档。
 * 新玩家 / 老玩家：没有主线存档时，看 xmum-gta-v1 里有没有进度（钱、外卖、车、成就）、衣橱和房子花过钱没有。在页面一加载就定下来（预览版的作弊会马上把钱补满，所以不能晚）。
 * 老玩家：第 1 章直接完成、不锁车、不播开场；后面每一章「现成条件」都满足的自动打勾（isNew 的步骤算完成），奖励一次补发，日记补记；停在第一个没满足的章节开头。
 *
 * 轮询：每 0.5 秒查一次当前章节的步骤（大多是现成的成就和计数），不用改各个玩法的代码。
 * 上锁：开车（第 1 章做完）；汽车游乐园的比赛（第 5 章开始）；小火车（第 7 章开始）。别的文件问 window.XQuest.unlocked('drive'|'park'|'train')。
 *
 * 对外：window.XQuest = {
 *   ready, state（只读副本）, ch, ph, chapter(), step()（当前步骤）, steps(), unlocked(key), carLocked(), ch1Deliv(), ringsOff(), calm(),
 *   flag(k, v)（玩法里的「新」钩子：XQuest.flag('map') 之类）, talk(npcId), npcNear(), diaryAdd(id, v), msg(id),
 *   on(evt, fn)（'step' 'chapter' 'msg' 'diary' 'talk' 'state'）, target()（指南针要指的地方）,
 *   dev:{reset(), vet(), skip(n), homesick(), state()}（测试模式和控制台）
 * } */
'use strict';
(() => {
  if (typeof prog === 'undefined' || typeof gx === 'undefined' || !window.XQD) return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const D = window.XQD, KEY = 'xmum-quest-v1';
  const CH = D.chapters.slice().sort((a, b) => a.n - b.n);
  const chOf = n => CH.find(c => c.n === n) || null;
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const now = () => Date.now();

  /* ---------- state ---------- */
  const blank = () => ({v:1, born:null, ch:1, ph:'meet', done:{}, paid:{}, flags:{}, sides:{}, diary:[], msgs:[], days:[], hints:{}, nudged:{}, stepT:{}, fired:{},
    intro:false, welcome:null, quiet:false, home:{day:'', n:0}, title:''});
  let S = blank(), hadSave = false;
  function read(){
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && typeof d === 'object' && d.v === 1){ S = Object.assign(blank(), d); hadSave = true; }
    } catch(e){}
    for (const k of ['done', 'paid', 'flags', 'sides', 'hints', 'nudged', 'stepT', 'fired']) if (!S[k] || typeof S[k] !== 'object') S[k] = {};
    for (const k of ['diary', 'msgs', 'days']) if (!Array.isArray(S[k])) S[k] = [];
    S.ch = Math.max(1, Math.min(CH.length + 1, S.ch | 0 || 1));
  }
  read();
  let ready = false, dirty = false;
  function save(){ dirty = true; if (!ready) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} }

  /* ---------- new or returning ---------- */
  function hasProgress(){
    try {
      const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null');
      if (d && ((+d.money || 0) > 0 || (d.life && (+d.life.deliv || 0) > 0) || (d.owned || []).length || Object.keys(d.ach || {}).length || (+d.stunt || 0) > 0)) return true;
    } catch(e){}
    try { if ((+(JSON.parse(localStorage.getItem('xmum-wardrobe-v1') || 'null') || {}).spent || 0) > 0) return true; } catch(e){}
    try { if ((+(JSON.parse(localStorage.getItem('xmum-house-v1') || 'null') || {}).spent || 0) > 0) return true; } catch(e){}
    return false;
  }
  if (!S.born) S.born = hasProgress() ? 'vet' : 'new';

  /* ---------- tiny event bus ---------- */
  const subs = {};
  const on = (e, fn) => { (subs[e] || (subs[e] = [])).push(fn); };
  const emit = (e, a, b) => { for (const fn of subs[e] || []) g(() => fn(a, b)); };

  /* ---------- the condition helpers handed to the data (Q) ---------- */
  const here = () => typeof driving !== 'undefined' && driving ? [driving.x, driving.z] : [nw.x, nw.z];
  const Q = {
    ach:id => !!prog.ach[id],
    best:k => prog.best[k] != null && isFinite(prog.best[k]),
    bestV:k => prog.best[k],
    life:k => +prog.life[k] || 0,
    owned:k => g(() => owned.has(k), false),
    ownedAny:list => list.some(k => g(() => owned.has(k), false)),
    worth:() => g(() => netWorth(), 0),
    money:() => +g(() => money, 0) || 0,
    flag:k => !!S.flags[k],
    near:(x, z, r) => { if (mode !== 'naiwa' || g(() => indoorNow(), false)) return false; const [px, pz] = here(); return Math.hypot(px - x, pz - z) < r; },
    driving:() => mode === 'naiwa' && !!g(() => driving, null),
    night:() => g(() => cur.lamp > .5, false),
    ward:slot => g(() => wardSave.look[slot], null),
    /* B1 arcade mini-games (js/91-arcade.js mgSave): played at least once, or a best under that id or 'id_…' */
    mini:id => g(() => (mgSave.plays[id] | 0) > 0 || Object.keys(mgSave.best).some(k => k === id || k.indexOf(id + '_') === 0), false),
    house:() => g(() => Object.keys(XHouse.save.own).length, 0),
    deco:() => g(() => Math.max(0, ...Object.values(XHouse.save.own).map(o => Object.values(o.s || {}).filter(Boolean).length)), 0),
    parts:id => g(() => XParts.count(id), 0),
    unlocked:k => unlocked(k),
    ch:() => S.ch, today:dayKey
  };
  const qDone = st => !!g(() => st.done(Q), false);

  /* ---------- chapters and steps ---------- */
  const chapter = () => chOf(S.ch);
  const reportStep = c => ({id:c.id + '_report', text:c.report || ('回去找' + ((D.npcs[c.npc] || {}).name || '')), report:true, at:() => npcAt(c.npc), r:0});
  const stepsOf = c => c ? c.steps.concat([reportStep(c)]) : [];
  function curStep(){
    const c = chapter(); if (!c) return null;
    if (S.ph === 'meet') return {id:c.id + '_meet', text:'去找' + ((D.npcs[c.npc] || {}).name || '') + '（' + (c.place || '') + '）', meet:true, at:() => npcAt(c.npc), r:0};
    if (S.ph === 'report') return reportStep(c);
    return c.steps.find(s => !S.done[s.id]) || reportStep(c);
  }
  function unlocked(k){
    if (k === 'drive') return S.born === 'vet' || S.ch > 1;
    const need = k === 'park' ? 5 : k === 'train' ? 7 : 0; if (!need) return true;
    return S.ch > need || (S.ch === need && S.ph !== 'meet');
  }

  /* ---------- rewards ---------- */
  function giveCar(kind, quiet){
    if (!kind || g(() => owned.has(kind), true)) return false;
    owned.add(kind); g(() => saveGame());
    if (!quiet && mode === 'naiwa') g(() => summon(kind));
    return true;
  }
  /* pay a reward once (id recorded in S.paid); returns a short text for the card */
  function pay(id, r, quiet){
    if (!r || S.paid[id]) return '';
    S.paid[id] = now(); const out = [];
    if (r.rm > 0){ g(() => earn(r.rm)); out.push('RM ' + r.rm.toLocaleString()); }
    if (r.car && giveCar(r.car, quiet)) out.push(g(() => SHOP.find(s => s.kind === r.car).name, r.car));
    if (r.parts) for (const id2 in r.parts){ const n = g(() => XParts.grant(id2, r.parts[id2], '主线奖励'), 0); if (n) out.push(g(() => (XParts.list.concat(XParts.bps).find(p => p.id === id2) || {}).name, id2) + ' ×' + r.parts[id2]); }
    if (r.items) for (const it of r.items){ if (g(() => { wardSave.own.add(it); wardWrite(); return true; }, false)) out.push(g(() => WD.byId[it].name, it)); }
    if (r.house && window.XHouse && XHouse.grant) g(() => XHouse.grant(r.house));
    if (r.title){ S.title = r.title; out.push('称号「' + r.title + '」'); }
    pay.items = out.filter(t => !/^RM /.test(t));
    save(); return out.join(' + ');
  }

  /* ---------- diary and phone messages ---------- */
  const dayNo = () => Math.max(1, S.days.length);
  function diaryAdd(id, v, opt){
    if (!D.diary[id] && !(opt && opt.text)) return;
    if (!(opt && opt.repeat) && S.diary.some(e => e.s === id)) return;
    const e = {s:id, d:dayNo(), c:opt && opt.c != null ? opt.c : S.ch}; if (v) e.v = v; if (opt && opt.recap) e.r = 1; if (opt && opt.text) e.x = opt.text;
    S.diary.push(e); if (S.diary.length > 240) S.diary.splice(0, S.diary.length - 240);
    save(); emit('diary', e);
  }
  function msg(id, opt){
    const m = D.msgs[id]; if (!m) return;
    if (S.msgs.some(e => e.m === id)) return;
    const e = {m:id, d:dayNo(), c:S.ch, t:now()}; S.msgs.push(e); if (S.msgs.length > 120) S.msgs.splice(0, S.msgs.length - 120);
    save(); if (!(opt && opt.silent)) emit('msg', e);
  }
  const flag = (k, v) => { v = v === undefined ? true : v; if (!!S.flags[k] === !!v) return; S.flags[k] = v ? (typeof v === 'number' ? v : now()) : 0; if (!v) delete S.flags[k]; save(); };

  /* ---------- step ticking ---------- */
  let lastTick = 0;
  function tickStep(c, st, quiet){
    if (S.done[st.id]) return;
    S.done[st.id] = now(); lastTick = performance.now();
    const got = pay(st.id, {rm:st.rm, parts:st.parts}, quiet);
    if (D.diary[st.id]) diaryAdd(st.id);
    save(); emit('step', {c, st, got, quiet});
  }
  function checkSteps(quiet){
    const c = chapter(); if (!c || S.ph !== 'steps') return;
    const ticked = [];
    for (const st of c.steps) if (!S.done[st.id] && qDone(st)){ tickStep(c, st, quiet || ticked.length > 0); ticked.push(st); }
    if (c.steps.every(s => S.done[s.id])){ S.ph = 'report'; save(); emit('report', c); emit('state'); }
    else if (ticked.length) emit('state');
  }
  function beginChapter(c){
    S.ph = 'steps'; save();
    if (c.diaryStart) diaryAdd(c.diaryStart);
    if (c.startMsg) msg(c.startMsg);
    if (c.unlock && c.unlockAt !== 'end') emit('unlock', c.unlock);
    emit('chapter', {c, start:true}); emit('state');
    checkSteps(true);
  }
  function finishChapter(c){
    const got = pay(c.id, c.reward);
    if (c.diaryEnd) diaryAdd(c.diaryEnd);
    if (c.endMsg) msg(c.endMsg);
    S.done[c.id + '_report'] = now();
    if (c.unlock && c.unlockAt === 'end') emit('unlock', c.unlock);
    S.ch = c.n + 1; S.ph = chOf(S.ch) ? 'meet' : 'done'; save();
    emit('chapter', {c, end:true, got}); emit('state');
  }

  /* ---------- sides: shown after their chapter, accepted by talking to the npc, then tick by themselves ---------- */
  const sideReady = s => { const c = CH.find(x => x.id === s.after); return !c || S.ch > c.n; };
  const sidesOf = npc => D.sides.filter(s => s.npc === npc && sideReady(s));
  function checkSides(quiet){
    for (const s of D.sides){
      if (S.sides[s.id] !== 'open') continue;
      if (qDone(s)){ S.sides[s.id] = 'done'; const got = pay('side_' + s.id, {rm:s.rm, parts:s.parts}, quiet); save(); emit('side', {s, got, quiet}); }
    }
  }

  /* ---------- the npcs ---------- */
  const NPC = {};   /* id -> {N, x, z, h, lbl, vis, mark} built on first need */
  function npcAt(id){ const n = D.npcs[id]; if (!n) return null; const a = typeof n.at === 'function' ? g(n.at, null) : n.at; return a && isFinite(a[0]) ? a : null; }
  function npcMark(id){
    const c = chapter();
    if (c && c.npc === id && (S.ph === 'meet' || S.ph === 'report')) return '!';
    if (sidesOf(id).some(s => !S.sides[s.id])) return '!';
    if (c && c.npc === id && S.ph === 'steps') return '…';
    return '';
  }
  /* who stands in the world right now: this chapter's npc, and anyone with something to give; at most 6 */
  function npcWanted(){
    const want = new Set(), c = chapter();
    if (c) want.add(c.npc);
    for (const n of CH) if (S.ch > n.n) want.add(n.npc);   /* met before: they stay where they are (sides, chatter) */
    if (S.born === 'new' || S.ch > 1) want.add('xiaoman');
    return [...want].filter(id => D.npcs[id]).slice(0, 6);
  }
  function npcBuild(id){
    const n = D.npcs[id], at = npcAt(id); if (!at || typeof makeNaiwa !== 'function') return null;
    const N = makeNaiwa(n.shape || 'std');
    g(() => nwDress(N, Object.assign(wdLook(null), n.look || {})));
    N.root.traverse(o => { if (o.isMesh){ o.castShadow = !TOUCH && !(typeof XQ !== 'undefined' && XQ.level === 'low'); o.receiveShadow = false; } });
    scene.add(N.root);
    const gy = g(() => groundAt(at[0], at[1]), 0), lbl = addLabel(n.short || n.name, at[0], gy + 3.3, at[1], true); lbl.el.classList.add('q-npc');
    lbl.el.addEventListener('click', e => { e.stopPropagation(); if (npcNearId() === id) talk(id); });
    const o = {id, N, x:at[0], z:at[1], h:at[2] || 0, lbl, vis:true, t:Math.random() * 6, wave:0, mark:null};
    N.root.position.set(o.x, g(() => groundAt(o.x, o.z), 0), o.z); N.root.rotation.y = o.h;
    return NPC[id] = o;
  }
  function npcRemove(id){
    const o = NPC[id]; if (!o) return;
    scene.remove(o.N.root); o.N.root.traverse(m => { if (m.isMesh){ g(() => m.geometry.dispose()); } });
    o.lbl.dead = true; o.lbl.el.remove(); const i = labels.indexOf(o.lbl); if (i >= 0) labels.splice(i, 1);
    delete NPC[id];
  }
  function npcSync(){
    const want = new Set(mode === 'naiwa' ? npcWanted() : []);
    for (const id in NPC) if (!want.has(id)) npcRemove(id);
    const [px, pz] = here(), inside = g(() => indoorNow(), false);
    for (const id of want){
      let o = NPC[id];
      const at = npcAt(id); if (!at){ if (o) npcRemove(id); continue; }
      const far = Math.hypot(at[0] - px, at[1] - pz) > 60 || inside;
      if (!o){ if (far) continue; o = npcBuild(id); if (!o) continue; }
      if (o.x !== at[0] || o.z !== at[1]){ o.x = at[0]; o.z = at[1]; o.h = at[2] || 0; o.N.root.position.set(o.x, g(() => groundAt(o.x, o.z), 0), o.z); o.lbl.pos.set(o.x, g(() => groundAt(o.x, o.z), 0) + 3.3, o.z); }
      o.vis = !far; o.N.root.visible = o.vis && !(talking && talking.hideNpc === id);
      const mk = npcMark(id), n = D.npcs[id], txt = (mk ? mk + ' ' : '') + (n.short || n.name);
      o.lbl.dead = !o.vis; if (o.lbl.el.textContent !== txt) o.lbl.el.textContent = txt;
      o.lbl.el.classList.toggle('q-bang', mk === '!'); o.lbl.el.classList.toggle('q-dots', mk === '…');
      if (far && Math.hypot(at[0] - px, at[1] - pz) > 140) npcRemove(id);   /* far away: give the memory back */
    }
  }
  /* idle: breathe, look at you when you are close, wave when there is something to say */
  function npcFrame(dt, T){
    for (const id in NPC){
      const o = NPC[id]; if (!o.vis) continue;
      o.t += dt; const N = o.N, [px, pz] = here(), d = Math.hypot(px - o.x, pz - o.z);
      let want = o.h; if (d < 14 && !g(() => driving, null)) want = Math.atan2(px - o.x, pz - o.z);
      if (talking && talking.npc === id) want = Math.atan2(nw.x - o.x, nw.z - o.z);
      let dh = Math.atan2(Math.sin(want - N.root.rotation.y), Math.cos(want - N.root.rotation.y)); N.root.rotation.y += dh * Math.min(1, dt * 4);
      const mk = npcMark(id), wave = mk === '!' && d < 40 ? 1 : 0; o.wave += (wave - o.wave) * Math.min(1, dt * 3);
      N.body.position.y = Math.sin(o.t * 2) * .01; N.body.rotation.z = Math.sin(o.t * 1.3) * .02;
      const [aL, aR] = N.arms, [eL, eR] = N.elbows || [];
      const talkNow = talking && talking.npc === id && talking.who === id;
      aL.rotation.set(-.32, 0, .36); if (eL) eL.rotation.set(-1.22 + Math.sin(o.t * 2) * .03, 0, -.32);
      const w = Math.max(o.wave, talkNow ? .55 : 0);
      aR.rotation.set(-.32 - w * .1, 0, -(.36 + w * 2.1)); if (eR) eR.rotation.set(-1.22 + w * (.6 + Math.sin(o.t * (talkNow ? 6 : 9)) * .45), 0, .32);
      N.mouth.scale.y = talkNow ? .02 + Math.abs(Math.sin(o.t * 12)) * .05 : .018;
      N.eyes[0].scale.y = N.eyes[1].scale.y = (o.t % 3.9) < .12 ? .1 : 1;
    }
  }
  function npcNearId(){
    if (mode !== 'naiwa' || g(() => driving, null)) return null;
    let best = null, bd = 4.2;
    for (const id in NPC){ const o = NPC[id]; if (!o.vis) continue; const d = Math.hypot(nw.x - o.x, nw.z - o.z); if (d < bd){ bd = d; best = id; } }
    return best;
  }

  /* ---------- talking: the dialog box itself is in js/89-quest-ui.js (XQuest.ui.say) ---------- */
  let talking = null;
  const lineText = l => typeof l[1] === 'function' ? g(l[1], '') : l[1];
  function say(lines, npc, done){
    const ui = XQuest.ui; if (!ui || !ui.say){ if (done) done(); return; }
    talking = {npc, who:npc};
    ui.say(lines.map(l => ({who:l[0], text:lineText(l)})), {npc, onLine:who => { if (talking) talking.who = who; }, onDone:() => { talking = null; if (done) done(); emit('state'); }});
  }
  function talk(id){
    if (talking || !D.npcs[id]) return;
    const c = chapter(), n = D.npcs[id];
    emit('talk', id);
    if (c && c.npc === id && S.ph === 'meet'){ say(c.intro || [[id, '……']], id, () => beginChapter(c)); return; }
    if (c && c.npc === id && S.ph === 'report'){
      say(c.outro || [[id, '做得好！']], id, () => {
        /* a chapter can end on a cutscene (chapter 7: the ending, js/89-cine.js); the reward comes when it is over or skipped */
        if (c.endCine && window.XCine && XCine.play && XCine.play(c.endCine, {onDone:() => finishChapter(c)})) return;
        finishChapter(c);
      });
      return;
    }
    const fresh = sidesOf(id).filter(s => !S.sides[s.id]);
    if (fresh.length){
      const lines = [[id, fresh.length > 1 ? '对了，还有几件事想拜托你：' : '对了，还有件事想拜托你：']].concat(fresh.map(s => [id, '· ' + s.text + (s.rm ? `（RM ${s.rm}）` : '')]));
      lines.push([id, '不急，做完了自然会记在你的便利贴上。']);
      say(lines, id, () => { for (const s of fresh) S.sides[s.id] = 'open'; save(); checkSides(); emit('sides', id); });
      return;
    }
    if (c && c.npc === id && S.ph === 'steps'){
      const st = curStep(); say([[id, st ? '下一步：' + st.text + '。' + (st.tip ? st.tip : '') : '加油！']], id); return;
    }
    const chat = n.chat || ['嗨！'], k = (S.flags['chat_' + id] | 0) % chat.length; S.flags['chat_' + id] = k + 1; save();
    say([[id, chat[k]]], id);
  }
  /* while talking you stand still (like the order card): updateFoot is skipped, gravity and the pose stay */
  if (typeof updateFoot === 'function'){
    const base = updateFoot;
    updateFoot = function(dt){
      if (talking || (window.XCine && XCine.busy)){ nw.spd = 0; if (talking && NPC[talking.npc]){ const o = NPC[talking.npc]; const want = Math.atan2(o.x - nw.x, o.z - nw.z); nw.h += Math.atan2(Math.sin(want - nw.h), Math.cos(want - nw.h)) * Math.min(1, dt * 6); } return; }
      base(dt);
    };
  }

  /* ---------- driving lock: no getting into any car (own, parked, a race car, a ride) until chapter 1 is done ---------- */
  function carLocked(){ return !unlocked('drive'); }
  if (typeof enterCar === 'function'){
    const base = enterCar;
    enterCar = function(c){
      if (carLocked()){ lockToast(); return; }
      return base(c);
    };
  }
  let lockT = 0;
  function lockToast(){ const t = performance.now(); if (t - lockT < 1500) return; lockT = t; g(() => toast('先跟小满学姐报到', '第 1 章做完，她会把车钥匙交给你', 2400)); g(() => sfx.fail()); }

  /* ---------- the new hooks: running, map, guide, delivery late, talk via F ---------- */
  let runT = 0;
  { const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){
        base.update(dt, px, pz);
        if (!g(() => driving, null) && nw.spd > 8){ runT += dt; if (runT > 3 && !S.flags.run3) flag('run3'); } else runT = 0;
      },
      prompt(){
        const id = npcNearId();
        if (id && !talking) return (TOUCH ? '点「说话」' : '按 F 说话') + ' · ' + D.npcs[id].name;
        const p = base.prompt(); if (p) return p;
        if (carLocked() && !g(() => driving, null) && g(() => nearestCar(), null)) return '还不能开车 · 先跟小满学姐完成新生报到';
        return '';
      },
      target(){
        const t = base.target(); if (t) return t;
        if (g(() => mission.on, false) || S.quiet === 'all') return null;
        return target();
      },
      frame(dt, T){ if (base.frame) base.frame(dt, T); npcFrame(dt, T); if (XQuest.ui && XQuest.ui.frame) g(() => XQuest.ui.frame(dt, T)); }
    }); }
  /* F next to an npc talks instead of getting into a car */
  if (typeof doF === 'function'){
    const base = doF;
    doF = function(){
      if (mode === 'naiwa' && !gx.paused && !talking && !(window.XCine && XCine.busy)){ const id = npcNearId(); if (id){ talk(id); return; } }
      return base();
    };
  }
  /* the touch F button (js/90-main.js holds the original doF): next to an npc it talks instead */
  g(() => actF.addEventListener('pointerdown', e => {
    if (mode !== 'naiwa' || gx.paused || talking || (window.XCine && XCine.busy)) return;
    const id = npcNearId(); if (!id) return;
    e.preventDefault(); e.stopImmediatePropagation(); g(() => ac()); talk(id);
  }, true));
  /* the touch F button says 说话 next to an npc */
  if (typeof updateActs === 'function'){
    const base = updateActs;
    updateActs = function(){ base(); if (!g(() => driving, null) && npcNearId()) g(() => { actF.querySelector('b').textContent = '说话'; }); };
  }
  /* a delivery that only just made it (less than 15 s left) on the first chapter: one line in the diary */
  { let was = false, tLeft = 0;
    setInterval(() => { const on = g(() => mission.on, false); if (on) tLeft = g(() => mission.t, 99); if (was && !on && tLeft > 0 && tLeft < 15 && g(() => prog.life.deliv, 0) > 0) flag('lateDeliv'); was = on; }, 250); }

  /* where the compass points: the step's place, or the npc to see */
  function target(){
    const st = curStep(); if (!st || !st.at) return null;
    const a = typeof st.at === 'function' ? g(() => st.at(Q), null) : st.at; if (!a) return null;
    return {x:a[0], z:a[1], label:(st.meet || st.report ? '主线 · ' : '主线 · ') + st.text.replace(/（.*?）/g, '')};
  }

  /* ---------- chapter 1 deliveries: campus only, 1.5× time (js/50-missions.js asks) ---------- */
  const ch1Deliv = () => S.born === 'new' && S.ch === 1;
  /* chapter 1 before the first-delivery step: the pick-up rings, their map dots and the old 「到橙色光圈挑一单外卖」 line stay away,
     so a new player's first minutes are only 小满 and the compass (js/50-missions.js, js/90-main.js ask) */
  /* the whole of chapter 1 for a new player: the other jobs' rings stay off the map until 小满 hands over the keys */
  const calm = () => S.born === 'new' && S.ch === 1;
  const ringsOff = () => {
    if (!ch1Deliv()) return false;
    const c = chapter(), st = curStep(); if (!c || !st) return false; if (st.meet) return true;
    const i = c.steps.findIndex(s => s.id === 'c1_deliv1'), j = c.steps.findIndex(s => s.id === st.id);
    return i >= 0 && j >= 0 && j < i;
  };

  /* ---------- the intro: the first time a new player goes into 奶娃 mode ---------- */
  const GATE = {x:96, z:242, h:Math.PI};   /* just inside the main gate (the 南门 spawn of walk mode), facing up the axis toward A3 */
  function placeAtGate(){
    if (g(() => driving, null)) g(() => leaveCar());
    nw.x = GATE.x; nw.z = GATE.z; nw.h = GATE.h; nw.y = g(() => groundAt(nw.x, nw.z), 0); nw.state = 'idle'; nw.air = false;
    g(() => { camYaw = nw.h + Math.PI; });
  }
  function afterIntro(){
    placeAtGate();
    g(() => { wardSave.own.add('badge'); wardWrite(); });
    diaryAdd('intro', null, {c:0});
    msg('mom_arrive');
    setTimeout(() => { const c = chOf(1); if (c && S.ch === 1 && S.ph === 'meet' && !talking) talk('xiaoman'); }, 700);
  }
  function playIntro(force){
    if (!force){ S.intro = true; save(); }
    if (window.XCine && XCine.play){ placeAtGate(); if (XCine.play('intro', {onDone:force ? null : afterIntro})) return; }
    if (!force) afterIntro();
  }
  if (typeof setMode === 'function'){
    const base = setMode;
    setMode = function(m){
      const was = mode; base(m);
      if (m === 'naiwa' && was !== 'naiwa'){
        if (S.born === 'new' && !S.intro) setTimeout(() => playIntro(false), 60);
        else if (S.born === 'new' && S.ch === 1 && S.ph === 'meet') setTimeout(() => { if (!talking) emit('state'); }, 200);
        emit('enter');
      }
    };
  }

  /* ---------- homesick: the yellow plane overhead, between two steps ---------- */
  function homesickTry(){
    if (!window.XCine || !XCine.homesick || XCine.busy || talking) return;
    if (mode !== 'naiwa' || g(() => driving, null) || g(() => indoorNow(), true) || g(() => mission.on, true) || gx.busy() || gx.extBusy() || g(() => heat > 0, false) || gx.paused) return;
    if (nw.state !== 'idle' || nw.air || S.ph === 'done') return;
    const day = dayKey(), first = !S.flags.home1;
    if (!first && S.home.day === day) return;
    if (!first && S.ch < 3 && S.home.n >= 2) return;
    /* between steps: one just ticked, or the step now is "go somewhere" */
    const st = curStep(), between = performance.now() - lastTick < 90000 || !!(st && st.at);
    if (!between) return;
    const [px, pz] = here(); if (!g(() => XCine.planeNear(px, pz), false)) return;
    const night = Q.night(), H = D.homesick, more = H.more || [];
    const line = night && !first ? H.night : first ? H.first : more[(S.home.n - 1 + more.length) % more.length] || H.first;
    S.home = {day, n:(S.home.n | 0) + 1}; flag('home1');
    XCine.homesick(line, {night, onDone:() => {
      diaryAdd('homesick', {when:night ? '晚上' : g(() => document.querySelector('[data-t][aria-pressed="true"]').dataset.t === 'dusk', false) ? '傍晚' : '下午'}, {repeat:S.home.n <= 1});
      setTimeout(() => msg(S.home.n <= 1 ? (Q.night() ? 'mom_video' : 'mom_rain') : 'mom_video'), 4000);
    }});
  }
  /* chapters 1–2 always get the moment once: after the first delivery, ask the next plane to fly over you */
  let summoned = 0;
  function homesickCall(){
    if (S.flags.home1 || S.ch > 2 || !window.XCine || !XCine.summonPlane) return;
    if (!S.done.c1_deliv1 && S.ch === 1) return;
    if (performance.now() - summoned < 120000) return;
    summoned = performance.now(); g(() => XCine.summonPlane());
  }

  /* ---------- the poll: every half second ---------- */
  let pollN = 0;
  function poll(){
    pollN++;
    const today = dayKey(); if (S.days[S.days.length - 1] !== today && !S.days.includes(today)){ S.days.push(today); if (S.days.length > 400) S.days.shift(); save(); }
    if (mode === 'naiwa'){
      if (S.ph === 'steps') checkSteps(false);
      checkSides(false);
      /* the first-time events (diary lines, mum's messages) */
      for (const ev of D.events){
        if (S.fired[ev.id] || (ev.minCh && S.ch < ev.minCh) || !qDone({done:ev.when})) continue;
        S.fired[ev.id] = now(); if (ev.diary) diaryAdd(ev.diary); if (ev.msg) msg(ev.msg); save();
      }
      /* stuck on a step for 10 minutes of play: the guide sends one hint */
      const st = curStep();
      if (st && !gx.paused && document.visibilityState !== 'hidden'){
        S.stepT[st.id] = (S.stepT[st.id] || 0) + .5;
        if (st.nudge && !S.nudged[st.id] && S.stepT[st.id] > 600){ S.nudged[st.id] = 1; const c = chapter(); D.msgs['nudge_' + st.id] = {from:c && D.people[c.npc] ? c.npc : 'xiaoman', text:st.nudge}; msg('nudge_' + st.id); }
        if (pollN % 20 === 0) save();
      }
      homesickCall(); homesickTry();
    }
    /* watchers from the data file for the few conditions that need timing (sitting 5 s…): XQD.watch.push((Q, flag, dt) => …) */
    for (const w of D.watch || []) g(() => w(Q, flag, .5));
    npcSync();
    emit('poll');
  }

  /* ---------- returning players: chapters whose ready-made conditions are met tick themselves, rewards paid once ---------- */
  function migrate(){
    if (S.born !== 'vet' || S.migrated) return;
    S.migrated = now(); S.intro = true;
    let rm = 0, part = null; const items = [], chs = [];
    const add = (id, r) => { if (!r || S.paid[id]) return; rm += r.rm > 0 ? r.rm : 0; pay.items = []; pay(id, r, true); items.push(...pay.items); };
    for (const c of CH){
      const ok = c.n === 1 || c.steps.every(s => s.isNew || qDone(s));
      if (!ok){
        /* the chapter they stop in: what they have done already is ticked (and paid) now, so the diary and the card show it from the start */
        S.ch = c.n; S.ph = 'meet';
        for (const s of c.steps) if (!S.done[s.id] && !s.isNew && qDone(s)){ S.done[s.id] = now(); add(s.id, {rm:s.rm, parts:s.parts}); }
        part = {n:c.n, done:c.steps.filter(s => S.done[s.id]).length, of:c.steps.length, left:c.steps.filter(s => !S.done[s.id]).map(s => s.text)};
        break;
      }
      for (const s of c.steps){ if (!S.done[s.id]){ S.done[s.id] = now(); add(s.id, {rm:s.rm, parts:s.parts}); } }
      S.done[c.id + '_report'] = now(); add(c.id, Object.assign({}, c.reward, {car:c.reward && c.reward.car && !g(() => owned.has(c.reward.car), false) ? c.reward.car : null}));
      diaryAdd(c.id + '_recap', null, {c:c.n, recap:true, text:c.recap || ('（补记）' + c.title + '。')});
      chs.push(c.n); S.ch = c.n + 1; S.ph = chOf(S.ch) ? 'meet' : 'done';
      if (c.unlock) emit('unlock', c.unlock);
    }
    for (const s of D.sides){ if (sideReady(s) && qDone(s)){ S.sides[s.id] = 'done'; add('side_' + s.id, {rm:s.rm, parts:s.parts}); } }
    for (const ev of D.events) if (qDone({done:ev.when})) S.fired[ev.id] = now();   /* old news: no flood of "first time" messages */
    /* the same part from several chapters is one line on the card: 轮毂坯件 ×3 + ×4 → ×7 */
    const merged = new Map();
    for (const t of items){ const m = /^(.*) ×(\d+)$/.exec(t), k = m ? m[1] : t; merged.set(k, (merged.get(k) || 0) + (m ? +m[2] : 1)); }
    const itemsTxt = [...merged].map(([k, n]) => n > 1 ? k + ' ×' + n : k).join('、');
    S.welcome = {rm:Math.round(rm), chs, items:itemsTxt, part};
    save(); emit('state');
  }

  /* ---------- start: wait for the cloud save (never two devices paying twice), then write ---------- */
  const synced = window.XNet ? (XNet.synced || XNet.ready) : Promise.resolve();
  Promise.race([Promise.resolve(synced).catch(() => {}), new Promise(r => setTimeout(r, 15000))]).then(() => {
    ready = true;
    if (!hadSave && S.born === 'vet') migrate();
    save(); emit('ready'); emit('state');
  });
  setInterval(poll, 500);

  /* ---------- tests: 测试模式 buttons (js/preview-cheats.js) and the console ---------- */
  const dev = {
    state:() => JSON.parse(JSON.stringify(S)),
    reset(){ S = blank(); S.born = 'new'; hadSave = true; save(); for (const id in NPC) npcRemove(id); emit('state'); return '主线进度已清空（新玩家），回菜单再进「奶娃」会播开场'; },
    vet(){
      try {
        const d = JSON.parse(localStorage.getItem('xmum-gta-v1') || 'null') || {};
        d.money = Math.max(+d.money || 0, 3200); d.owned = [...new Set((d.owned || []).concat(['myvi', 'p911']))];
        d.ach = Object.assign({deliv1:1, deliv25:1, early8:1, busted:1, lake:1, swing:1, hw1:1, exam:1, dorm1:1, gold:1, wg1:1, repaint:1, tune1:1, chill:1, thief1:1, race1:1}, d.ach || {});
        d.life = Object.assign({deliv:30, bust:1, taxi:2}, d.life || {}); d.life.deliv = Math.max(30, +d.life.deliv || 0);
        d.best = Object.assign({o_tea:120, o_dt:95, pm_du:60}, d.best || {});
        localStorage.setItem('xmum-gta-v1', JSON.stringify(d));
        localStorage.removeItem(KEY);
      } catch(e){}
      ready = false; location.reload(); return '已写入模拟老玩家存档，刷新中';
    },
    skip(n){
      n = Math.max(1, Math.min(CH.length + 1, n | 0));
      S.born = S.born || 'new'; S.intro = true;
      for (const c of CH) if (c.n < n){ for (const s of c.steps) S.done[s.id] = S.done[s.id] || now(); S.done[c.id + '_report'] = now(); S.paid[c.id] = S.paid[c.id] || 1; }
      S.ch = n; S.ph = chOf(n) ? 'meet' : 'done'; save(); emit('state'); return '跳到第 ' + n + ' 章开头';
    },
    homesick(){ if (!window.XCine) return '没有 XCine'; S.flags.home1 = 0; const night = Q.night(); XCine.homesick(night ? D.homesick.night : D.homesick.first, {night, onDone:() => diaryAdd('homesick', {when:night ? '晚上' : '傍晚'}, {repeat:true})}); return '想家'; },
    tickAll(){ const c = chapter(); if (c && S.ph === 'steps') for (const s of c.steps) tickStep(c, s, true); checkSteps(true); return S.ph; },
    intro:() => playIntro(true)
  };

  window.XQuest = {
    get ready(){ return ready; }, get state(){ return S; }, get ch(){ return S.ch; }, get ph(){ return S.ph; }, get born(){ return S.born; },
    get talking(){ return !!talking; },
    data:D, chapters:CH, chapter, step:curStep, steps:() => stepsOf(chapter()), stepDone:id => !!S.done[id], Q, qDone,
    unlocked, carLocked, ch1Deliv, ringsOff, calm, lockToast,
    flag, talk, npcNear:npcNearId, npcAt, npcMark, npcs:NPC, sidesOf, diaryAdd, msg, save, dayNo,
    on, target, playIntro, unlockedTitle:() => S.title,
    ui:null, dev
  };
})();
