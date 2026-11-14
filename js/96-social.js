/* XMUM 校园漫游 · 玩家之间的当面互动：表情、喊话、搭车、当面挑战
 *
 * 只在联机时出现（XNet.online）；离线、预览版整套隐藏。本地测试见 docs/social.md（test/social.html 两个窗口互测，?bots 本地假玩家）。
 *
 *   走近别的玩家（4 米内）：头顶出现「F 互动」，按 F（手机点他头顶的按钮）弹小菜单：搭车 / 打招呼 / 挑战（飙车抢点、特技比拼、抓人）/ 屏蔽
 *   表情：Z 开轮盘（1–8）；喊话：V 开短句（20 句，1–0 发前 10 句）；手机点「表情 · 喊话」。2.5 秒冷却，3 秒气泡。R 大笑、Q 撩头也会让别人看到。
 *   搭车：司机收到卡片（F 接 / X 不接），接了乘客坐上车跟着走，乘客按 F 下车；司机在顶上的小条里能看到车上是谁，点 × 请他下车。
 *   挑战：对方收到邀请卡，接受后倒数 3 秒开始；赢家拿改装零件（TN_DROPS.duel），同一个对手每天最多 3 次有奖。
 *
 * 数据：
 *   presence 里多带几个字段（XNet.extra）：fx 表情或短句「e3-17」「s5-18」（后面是序号，同一个表情连发也能认出来）、
 *     ride 坐在谁的车上（司机 uid）、rs 第几个座、duel 正在和谁比、ds 比赛分数、dnd 免打扰
 *   /social/{收件人 uid}/{pushId} = {from, type, data, ts}：点对点消息，收件人读到就删。type 见 SOC_TYPES，data 是不超过 300 字的 JSON
 *
 * 对外：window.XSocial（接口见 docs/social.md），以后的双人合作任务用 XSocial.defineInvite / invite / send / on 复用这条通道。
 * 这个文件要排在 js/net.js 后面加载。
 */
'use strict';
(() => {
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const pnow = () => performance.now() / 1000;
  const snow = () => XNet.now();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- 内容 ---------- */
  const EMOTES = [
    {id:0, icon:'👋', name:'挥手'}, {id:1, icon:'😂', name:'大笑'}, {id:2, icon:'💗', name:'比心'}, {id:3, icon:'👍', name:'点赞'},
    {id:4, icon:'😠', name:'生气'}, {id:5, icon:'😭', name:'哭'}, {id:6, icon:'💃', name:'跳舞'}, {id:7, icon:'✨', name:'撩头'}
  ];
  const PHRASES = ['上车！', '等等我', '比一场？', '谢了', 'GG', '去 D6 吃饭吗', '冲冲冲', '来了来了', '跟我走', '好车！',
    '哈哈哈', '不好意思', '下次一定', '我先走啦', '早八救命', '去图书馆', '保安来了！', '求带', '牛啊', '拜拜'];
  const FX_CD = 2.5, FX_SHOW = 3, EMO_DUR = 2.4;
  /* 乘客座位（车身坐标，和 CAR_T.seat 一样，是座面的高度：坐下时身体往下沉到座面上，见 js/30-naiwa.js 的 NW_SIT_DROP）：
     司机坐在中间，所以乘客坐后座、车顶、车尾；每辆车 1 到 3 个，摩托 1 个。后座和司机前后隔开约 1.27 米（一个奶娃的肚子到后背），不会叠在一起 */
  const SEATS = {
    bus:[[-.7, .95, 1.4], [.7, .95, -.6], [-.7, .95, -2.6]],
    sedan:[[0, .42, -1.47], [0, 1.43, -.35]],
    myvi:[[0, .42, -1.42], [0, 1.53, -.4]],
    mase:[[0, .3, -1.62], [0, 1.38, -.5]],
    rr:[[0, .45, -1.72], [0, 1.73, -.55], [0, 1.12, -2.45]],
    gwag:[[0, .55, -1.62], [0, 1.98, -.4], [0, 1.05, -2.15]],
    p911:[[0, .3, -1.6]],
    lambo:[[0, 1.02, -1.52]],
    cart:[[0, .68, -1.4], [0, 1.95, -.3]],
    patrol:[[0, .68, -1.4], [0, 1.95, -.3]],
    moto:[[0, 1.28, -1.12]]
  };
  const seatsOf = kind => SEATS[kind] || SEATS.sedan;
  const GAMES = {
    race:{name:'飙车抢点', icon:'🏁', desc:'开车冲到同一个地标，先到的赢', car:true, dur:150},
    stunt:{name:'特技比拼', icon:'🔥', desc:'60 秒，特技分高的赢', car:true, dur:60},
    tag:{name:'抓人', icon:'👻', desc:'45 秒，时间到时谁是「鬼」谁输', car:false, dur:45}
  };
  const SOC_TYPES = ['hi', 'inv', 'ans', 'bye', 'go', 'end', 'tag', 'ev'];
  const WHY = {dnd:'对方开了免打扰', busy:'对方正忙，等会儿再试', full:'车上坐满了', no:'对方婉拒了', timeout:'对方没回应',
    driving:'对方已经不在车上了', duel:'对方正在比赛', far:'离得太远了', unknown:'对方的版本不支持'};

  /* ---------- 本机设置：免打扰、屏蔽名单、每天和每个对手的有奖次数 ---------- */
  const KEY = 'xmum-social-v1';
  const store = (() => { let v = null; try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){} return Object.assign({dnd:false, block:{}, day:'', pairs:{}}, v || {}); })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch(e){} };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const PAIR_DAY = 3;
  function pairLeft(uid){ if (store.day !== today()){ store.day = today(); store.pairs = {}; } return PAIR_DAY - (store.pairs[uid] || 0); }
  function pairUse(uid){ pairLeft(uid); store.pairs[uid] = (store.pairs[uid] || 0) + 1; save(); }
  const blocked = uid => !!store.block[uid];

  /* ---------- 状态 ---------- */
  const S = {
    on:false, fx:'', fxSeq:Math.floor(Math.random() * 9000), fxAt:-99, myFx:null,
    ride:null,            // 我坐在别人车上：{uid, seat, name, t0, lost}
    pax:new Map(),        // 我开车，车上的人：uid -> {seat, name, t0}
    duel:null,            // 正在进行的挑战
    out:null,             // 我发出去、还没回音的邀请：{to, k, data, exp, name, cb}
    queue:[],             // 收到、还没显示的邀请
    card:null,            // 正显示的邀请卡
    target:null,          // 4 米内能互动的人
    menuFor:null,
    lastFx:new Map(), remFx:new Map(), bubbles:new Map(), fxTone:-1,
    sendLog:[], invCool:{}, inSpam:{}
  };
  const XSocial = window.XSocial = {
    get active(){ return S.on; }, emotes:EMOTES, phrases:PHRASES, games:GAMES, seats:SEATS, types:SOC_TYPES,
    get dnd(){ return store.dnd; }, get riding(){ return S.ride ? S.ride.uid : null; }, get passengers(){ return [...S.pax.keys()]; },
    get duel(){ return S.duel ? {g:S.duel.g, opp:S.duel.opp, phase:S.duel.phase} : null; }
  };

  /* ---------- 别的玩家 ---------- */
  /* 还在线吗：新协议停着不动 30 秒才一次心跳，所以问 net.js（XNet.fresh）；旧页面的人（oneWay）看不见我们，不跟他们互动 */
  const isFresh = r => (typeof XNet.fresh === 'function' ? XNet.fresh(r) : performance.now() - r.seen < 6000);
  function peer(uid){
    const r = XNet.peers().get(uid); if (!r || !r.d || r.oneWay) return null;
    const d = r.d, fresh = isFresh(r);
    const live = fresh && (d.mode === 'naiwa' || d.mode === 'walk');
    const G = r.g && r.g.vis ? r.g : null;
    return {uid, r, d, G, live, name:String(d.name || '?').slice(0, 16), car:d.mode === 'naiwa' && d.car && G && G.car ? G.car : null};
  }
  function riders(uid){ let n = 0; for (const [u, r] of XNet.peers()) if (r.d && !r.oneWay && r.d.ride === uid && isFresh(r)) n++; return n; }
  /* distance from a point to a ghost: to its car's outline when it is driving */
  function distTo(p, x, z){
    const G = p.G; if (!G) return 1e9;
    if (!p.car) return Math.hypot(G.x - x, G.z - z);
    const T = p.car.T, dx = x - G.x, dz = z - G.z, c = Math.cos(G.h), s = Math.sin(G.h);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - T.W / 2), Math.max(0, Math.abs(lz) - T.L / 2));
  }
  const myPos = () => (driving ? driving : nw);
  /* where a speech bubble goes: above the head (above the name tag for others) */
  function headOf(uid){
    if (uid === XNet.uid){
      if (driving) return [driving.x, driving.y + driving.T.H + 1.3, driving.z];
      return [nw.x, nw.y + (S.ride ? 2.6 : 3.3), nw.z];
    }
    const p = peer(uid); if (!p || !p.G) return null;
    const G = p.G;
    if (G.socSeatW) return [G.socSeatW[0], G.socSeatW[1] + 3.3, G.socSeatW[2]];
    if (p.car) return [G.x, G.y + p.car.T.H + 2.7, G.z];
    return [G.x, G.y + 4.5, G.z];
  }

  /* ---------- 通道：/social/{to}/{pushId} ---------- */
  function canSend(){ const t = pnow(); S.sendLog = S.sendLog.filter(x => t - x < 10); if (S.sendLog.length >= 12) return false; S.sendLog.push(t); return true; }
  function send(to, type, data){
    if (!S.on || !to || to === XNet.uid || !SOC_TYPES.includes(type)) return Promise.resolve(false);
    if (!canSend()){ console.warn('[XSocial] 发太快了，丢掉一条', type); return Promise.resolve(false); }
    const ref = XNet.ref('social/' + to); if (!ref) return Promise.resolve(false);
    const msg = {from:XNet.uid, type, ts:firebase.database.ServerValue.TIMESTAMP};
    if (data != null){ const str = JSON.stringify(data); if (str.length > 300) return Promise.resolve(false); msg.data = str; }
    return Promise.resolve(ref.push(msg)).then(() => true, e => { console.warn('[XSocial] 发送失败', type, e); return false; });
  }
  const handlers = {};
  function on(type, fn){ (handlers[type] = handlers[type] || []).push(fn); }
  let inbox = null;
  function openInbox(){
    if (inbox) return;
    inbox = XNet.ref('social/' + XNet.uid); if (!inbox) return;
    inbox.on('child_added', snap => {
      const m = snap.val(); const del = XNet.ref('social/' + XNet.uid + '/' + snap.key); if (del) del.remove().catch(() => {});
      if (!m || typeof m !== 'object' || typeof m.from !== 'string' || !SOC_TYPES.includes(m.type)) return;
      if (Math.abs(snow() - (+m.ts || 0)) > 45000) return;                     // 掉线时攒下的旧消息：删掉不管
      let data = {}; if (typeof m.data === 'string') try { data = JSON.parse(m.data) || {}; } catch(e){ return; }
      g(() => recv(m.from, m.type, data));
    }, e => console.warn('[XSocial] 收件箱读不了（规则还没发布？）', e));
  }
  function closeInbox(){ if (inbox){ g(() => inbox.off()); inbox = null; } }
  function recv(from, type, data){
    if (from === XNet.uid) return;
    if (blocked(from) && (type === 'hi' || type === 'inv')) return;      // 屏蔽的人：不回音，像没看见
    for (const fn of handlers[type] || []) fn(from, data);
  }

  /* ---------- 邀请：发 inv {k, …}，对方回 ans {k, ok, why, …}；卡片、排队、超时都在这里 ---------- */
  const KINDS = {};
  /* def: {icon, title(name, data), desc(name, data), yes:'接', no:'不接', check(from, data) → 不能接的原因（WHY 的键）或 '',
           needFree:true = 做任务、小游戏时先排队, accept(from, data) → 回给对方的附加字段（false = 其实接不了）, answer(from, ok, data, why)} */
  function defineInvite(k, def){ KINDS[k] = Object.assign({yes:'接', no:'不接'}, def); }
  function answer(to, k, ok, why, extra){ return send(to, 'ans', Object.assign({k, ok:ok ? 1 : 0}, why ? {why} : null, extra || null)); }
  function invite(to, k, data, opts){
    const p = peer(to); if (!p || !S.on) return false;
    const key = to + ':' + k, t = pnow();
    if (S.invCool[key] > t){ toast('慢一点', `${Math.ceil(S.invCool[key] - t)} 秒后才能再邀请 ${p.name}`, 1800); return false; }
    if (S.out){ toast('先等上一个邀请的回音', `在等 ${S.out.name}`, 1800); return false; }
    S.invCool[key] = t + 8;
    S.out = {to, k, data, exp:t + 20, name:p.name, cb:opts && opts.answer};
    send(to, 'inv', Object.assign({k}, data || null)); renderStat();
    return true;
  }
  on('inv', (from, data) => {
    const K = KINDS[data.k], p = peer(from);
    if (!K){ answer(from, data.k, false, 'unknown'); return; }
    if (!p) return;
    if (store.dnd){ answer(from, data.k, false, 'dnd'); return; }
    const t = pnow(), sp = S.inSpam[from] = (S.inSpam[from] || []).filter(x => t - x < 60); sp.push(t);
    if (sp.length > 5) return;                                             // 一分钟邀请五次以上：不理
    const why = K.check ? K.check(from, data) : ''; if (why){ answer(from, data.k, false, why); return; }
    S.queue = S.queue.filter(q => !(q.from === from && q.data.k === data.k));
    S.queue.push({from, data, K, name:p.name, exp:t + 20});
  });
  on('ans', (from, data) => {
    const o = S.out;
    if (o && o.to === from && o.k === data.k){
      S.out = null; renderStat();
      if (!data.ok){ S.invCool[from + ':' + data.k] = pnow() + 25; toast(o.name + '：' + (WHY[data.why] || WHY.no), '', 2200); }
      if (o.cb) o.cb(!!data.ok, data, data.why);
      return;
    }
    const K = KINDS[data.k]; if (K && K.late) K.late(from, data);                   // 撤回以后才到的回音
  });
  /* the card itself: one at a time, never over a mini-game, indoors, a pause, a shop or a job card */
  function cardBlocked(K){
    return mode !== 'naiwa' || gx.paused || indoorNow() || document.body.classList.contains('titled') || !!g(() => XMini.inside, false)
      || document.body.classList.contains('wd-open') || document.body.classList.contains('op-open') || !!document.querySelector('dialog[open]')
      || !$('#shop').hidden || !!(typeof OFFER !== 'undefined' && OFFER.cur) || (K && K.needFree && (gx.busy() || mission.on || !!S.duel || !!S.ride));
  }
  function pumpCards(){
    const t = pnow();
    for (const q of S.queue.slice()) if (t > q.exp){ S.queue.splice(S.queue.indexOf(q), 1); answer(q.from, q.data.k, false, 'busy'); }
    const c = S.card;
    if (c){
      if (t > c.exp){ closeCard(); answer(c.from, c.data.k, false, 'timeout'); toast('邀请过期了', c.name, 1500); }
      else if (cardBlocked(c.K)){ closeCard(); S.queue.unshift(c); }            // 突然进了小游戏、室内：放回队列
      else { const bar = cardEl.querySelector('.sc-bar i'); if (bar) bar.style.transform = `scaleX(${Math.max(0, (c.exp - t) / 15)})`; }
      return;
    }
    const i = S.queue.findIndex(q => !cardBlocked(q.K) && peer(q.from));
    if (i < 0) return;
    const q = S.queue.splice(i, 1)[0];
    const why = q.K.check ? q.K.check(q.from, q.data) : ''; if (why){ answer(q.from, q.data.k, false, why); return; }
    showCard(Object.assign(q, {exp:t + 15, t0:t}));
  }
  function decide(ok){
    const c = S.card; if (!c || pnow() - c.t0 < .5) return;
    closeCard();
    if (!ok){ answer(c.from, c.data.k, false, 'no'); tone('triangle', 520, 390, .08, .05); return; }
    const why = c.K.check ? c.K.check(c.from, c.data) : ''; if (why){ answer(c.from, c.data.k, false, why); toast(WHY[why] || '接不了', '', 1600); return; }
    const extra = c.K.accept ? c.K.accept(c.from, c.data) : {};
    if (extra === false) return;
    answer(c.from, c.data.k, true, '', extra); sfx.ding();
  }

  /* ---------- 界面 ---------- */
  { const st = document.createElement('style'); st.textContent = `
.lbl.soc-bub{padding:4px 11px 5px;font-size:14px;font-weight:700;border-radius:14px;background:var(--panel-solid);border:2px solid var(--soc-c,var(--gold));box-shadow:0 3px 12px var(--shadow,rgba(0,0,0,.2));margin-top:-8px}
.lbl.soc-bub::after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-6px;border:6px solid transparent;border-top-color:var(--soc-c,var(--gold));border-bottom:0}
.lbl.soc-bub.emo{font-size:30px;line-height:1.05;padding:3px 8px;border-radius:18px}
.lbl.soc-bub.pop{animation:socPop .28s cubic-bezier(.3,1.6,.5,1)}
@keyframes socPop{from{scale:.4;opacity:0}to{scale:1;opacity:1}}
.lbl.soc-hint{pointer-events:auto;cursor:pointer;font-size:13px;font-weight:700;padding:5px 12px;background:var(--tile);color:var(--on-accent,#fff);border-color:var(--tile);box-shadow:0 2px 10px rgba(0,0,0,.25);touch-action:manipulation}
.lbl.soc-hint kbd{background:rgba(255,255,255,.25);color:inherit;border:0;margin-right:5px;padding:0 5px;border-radius:4px;font:inherit;font-size:12px}
.lbl.soc-it{font-size:34px;padding:0 6px;background:transparent;border:0}
#socMenu,#socCard,#socSheet,#socRes{position:fixed;z-index:8;left:50%;transform:translateX(-50%);box-sizing:border-box;background:var(--panel-solid);border-top:3px solid var(--tile)}
#socMenu[hidden],#socCard[hidden],#socSheet[hidden],#socRes[hidden],#socWheel[hidden],#socStat[hidden]{display:none}
#socMenu{bottom:calc(var(--safe-b) + 62px);width:min(460px,calc(100% - 24px));padding:9px 10px 10px}
.sm-h{display:flex;align-items:center;gap:8px;margin:0 0 8px}
.sm-h b{font-family:var(--display);font-size:16px}
.sm-h span{flex:1;min-width:0;font-size:12px;color:var(--muted)}
.sm-x{flex:none;min-height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12.5px;cursor:pointer;touch-action:manipulation}
.sm-x:hover{border-color:var(--tile);color:var(--tile)}
.sm-g{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.sm-o{display:flex;align-items:center;gap:8px;text-align:left;min-height:46px;padding:6px 10px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-bg,transparent);color:var(--ink);font:inherit;cursor:pointer;touch-action:manipulation}
.sm-o:hover:not([disabled]),.sm-o:active:not([disabled]){border-color:var(--tile)}
.sm-o[disabled]{opacity:.45;cursor:default}
.sm-o i{font-style:normal;font-size:20px;line-height:1;flex:none}
.sm-o b{display:block;font-size:13.5px;line-height:1.3}
.sm-o small{display:block;font-size:11.5px;color:var(--muted);line-height:1.3}
.sm-o kbd{margin-left:auto;flex:none}
.sm-o.go{background:var(--tile);border-color:var(--tile);color:var(--on-accent,#fff)} .sm-o.go small{color:inherit;opacity:.9}
.sm-f{display:flex;justify-content:flex-end;margin-top:7px}
.sm-f button{border:0;background:none;color:var(--muted);font:inherit;font-size:12px;text-decoration:underline;cursor:pointer;padding:4px}
#socCard{top:calc(var(--safe-t,0px) + 96px);width:min(420px,calc(100% - 24px));padding:9px 10px 10px;overflow:hidden}
#socCard .sm-g{grid-template-columns:1.4fr 1fr}
.sc-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--line)} .sc-bar i{display:block;height:100%;background:var(--tile);transform-origin:left}
#socStat{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(var(--safe-t,0px) + 92px);display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);padding:5px 6px 5px 12px;border-radius:999px;font-size:13px;white-space:nowrap;overflow:hidden}
#socStat b{font-variant-numeric:tabular-nums} #socStat .sx{min-height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:12px;cursor:pointer;touch-action:manipulation}
#socStat .sx:hover{border-color:var(--tile);color:var(--tile)}
#socStat .pax{display:inline-flex;align-items:center;gap:2px;padding:1px 2px 1px 8px;border-radius:999px;background:var(--tile-soft,rgba(0,0,0,.06))}
#socStat .pax button{border:0;background:none;color:var(--muted);font:inherit;font-size:15px;line-height:1;cursor:pointer;padding:2px 6px;touch-action:manipulation}
#socStat.duel{border-top:3px solid var(--gold);font-size:14px;padding-right:6px}
#socStat .vs{display:inline-flex;gap:10px;align-items:baseline} #socStat .vs em{font-style:normal;color:var(--muted);font-size:12px}
#socWheel{position:fixed;z-index:8;left:50%;top:50%;width:0;height:0}
#socWheel .wc{position:absolute;left:-58px;top:-58px;width:116px;height:116px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:var(--muted);text-align:center;background:var(--panel-solid);border:1px solid var(--line)}
#socWheel .wc b{font-family:var(--display);font-size:16px;color:var(--ink)}
#socWheel button{position:absolute;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;border:2px solid var(--line);background:var(--panel-solid);color:var(--ink);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;font:inherit;touch-action:manipulation;box-shadow:0 4px 18px var(--shadow,rgba(0,0,0,.25))}
#socWheel button i{font-style:normal;font-size:30px;line-height:1.05} #socWheel button span{font-size:11px;color:var(--muted)}
#socWheel button kbd{position:absolute;top:-4px;right:-2px;font-size:10px}
#socWheel button:hover,#socWheel button:focus-visible{border-color:var(--tile);scale:1.08}
#socWheel.cd button{opacity:.5}
#socSheet{bottom:calc(var(--safe-b) + 62px);width:min(560px,calc(100% - 24px));padding:8px 10px 10px;max-height:calc(100% - 180px);overflow:auto}
.ss-emo{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin:0 0 8px}
.ss-emo button{min-height:44px;border-radius:var(--r-md);border:1px solid var(--line);background:transparent;font-size:24px;cursor:pointer;touch-action:manipulation;padding:0}
.ss-ph{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.ss-ph button{position:relative;min-height:40px;padding:4px 6px;border-radius:var(--r-md);border:1px solid var(--line);background:transparent;color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation}
.ss-ph button kbd{position:absolute;top:1px;left:3px;font-size:9px;opacity:.7;border:0;background:none;padding:0}
.ss-emo button:hover,.ss-ph button:hover{border-color:var(--tile)}
#socSheet.cd .ss-emo button,#socSheet.cd .ss-ph button{opacity:.5}
.ss-f{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--muted)}
.ss-f label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;color:var(--ink);min-height:30px}
.ss-f button{border:1px solid var(--line);background:none;color:var(--ink);font:inherit;font-size:12px;border-radius:999px;padding:3px 10px;cursor:pointer;min-height:28px}
.ss-bl{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px} .ss-bl span{display:inline-flex;align-items:center;gap:3px;padding:2px 4px 2px 9px;border-radius:999px;border:1px solid var(--line);font-size:12px}
.ss-bl span button{border:0;padding:2px 6px;min-height:0}
#socRes{top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100% - 32px));padding:16px 16px 14px;text-align:center;border-top-width:4px}
#socRes h2{margin:0 0 4px;font-family:var(--display);font-size:26px} #socRes p{margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.5}
#socRes .hrow{display:flex;gap:8px;justify-content:center;margin-top:10px}
#acts #act-soc{grid-column:1/-1;flex-direction:row;gap:8px;min-height:38px;padding:6px 12px}
#acts #act-soc b{font-size:14px}
body.wd-open #socStat,body.wd-open #socMenu,body.wd-open #socCard,body.wd-open #socSheet,body.wd-open #socWheel,body.sp-run #socStat,body.arc-in #socStat,body.arc-in #socCard,body.arc-in #socMenu{display:none!important}
@media (max-width:760px){
  #socMenu,#socSheet{bottom:auto;top:calc(var(--safe-t,0px) + 66px)}
  #socCard{top:calc(var(--safe-t,0px) + 66px)}
  #socStat{top:calc(var(--safe-t,0px) + 196px);font-size:12px}
  #socCard .sm-h{flex-wrap:wrap} #socCard .sm-h span{order:9;flex:1 1 100%}
  .ss-ph{grid-template-columns:repeat(3,1fr)} .ss-emo button{font-size:21px;min-height:40px}
  .sm-o{min-height:44px;padding:5px 8px}
}
@media (pointer:coarse){ #socMenu kbd,#socCard kbd,#socSheet kbd,#socWheel kbd{display:none} }`; document.head.appendChild(st); }
  const mk = (id, tag) => { const el = document.createElement(tag || 'div'); el.id = id; el.className = 'panel'; el.hidden = true; document.body.appendChild(el); el.addEventListener('pointerdown', e => e.stopPropagation()); return el; };
  const menuEl = mk('socMenu'), cardEl = mk('socCard'), sheetEl = mk('socSheet'), resEl = mk('socRes'), statEl = mk('socStat');
  const wheelEl = document.createElement('div'); wheelEl.id = 'socWheel'; wheelEl.hidden = true; document.body.appendChild(wheelEl);
  menuEl.setAttribute('role', 'dialog'); menuEl.setAttribute('aria-label', '和玩家互动');
  cardEl.setAttribute('role', 'alertdialog'); cardEl.setAttribute('aria-label', '邀请');
  sheetEl.setAttribute('role', 'dialog'); sheetEl.setAttribute('aria-label', '表情和喊话');
  statEl.setAttribute('role', 'status'); statEl.setAttribute('aria-live', 'polite');
  const refocus = () => canvas.focus({preventScroll:true});
  const KB = k => (TOUCH ? '' : `<kbd>${k}</kbd>`);

  /* the mobile / mouse button: one wide row on top of the action buttons */
  const actSoc = document.createElement('button');
  actSoc.id = 'act-soc'; actSoc.type = 'button'; actSoc.hidden = true; actSoc.innerHTML = '<b>💬 表情 · 喊话</b><kbd>Z / V</kbd>';
  acts.prepend(actSoc);
  actSoc.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ac(); sheetEl.hidden ? openSheet() : closeSheet(); });

  /* hint over the player you can talk to; it is a button, so on a phone you just tap it */
  const hintL = addLabel('', 0, -999, 0, false); hintL.dead = true;
  hintL.el.className = 'lbl soc-hint'; hintL.el.setAttribute('role', 'button');
  hintL.el.innerHTML = TOUCH ? '点我互动' : '<kbd>F</kbd>互动';
  hintL.el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); ac(); if (S.target) openMenu(S.target); });
  const itL = addLabel('👻', 0, -999, 0, false); itL.dead = true; itL.el.className = 'lbl soc-it';

  /* ---------- 菜单 ---------- */
  function menuOpts(p){
    const o = [], dnd = !!p.d.dnd, busy = gx.busy() || mission.on;
    if (p.d.mode === 'naiwa' && p.d.car){
      const cap = seatsOf(p.d.car).length, used = riders(p.uid), full = used >= cap;
      o.push({id:'ride', icon:'🚗', title:'搭车', sub:dnd ? '免打扰中' : full ? '坐满了' : `还有 ${cap - used} 个座`, dis:dnd || full || p.d.duel});
    }
    o.push({id:'hi', icon:'👋', title:'打招呼', sub:'冲他挥挥手', dis:false});
    for (const k in GAMES){ const G = GAMES[k]; o.push({id:'duel:' + k, icon:G.icon, title:'挑战 · ' + G.name, sub:dnd ? '免打扰中' : p.d.duel ? '他正在比赛' : busy ? '先做完手上的任务' : G.desc, dis:dnd || !!p.d.duel || busy}); }
    for (const M of MENU_X){ const x = g(() => M.opt(p), null); if (x) o.push(Object.assign({}, x, {id:'x:' + M.id})); }   // 别的文件加的项（js/96-friends.js 的「加好友」）
    return o;
  }
  function openMenu(p){
    if (!p || !S.on) return;
    closeSheet(); closeWheel();
    S.menuFor = p.uid;
    const opts = menuOpts(p), first = opts.findIndex(o => !o.dis);
    const what = p.car ? `开着${p.car.T.name}` : p.d.dnd ? '免打扰中' : '在走路';
    menuEl.innerHTML = `<div class="sm-h"><b>${esc(p.name)}</b><span>${esc(what)}</span><button type="button" class="sm-x" data-x>关 ${KB('X')}</button></div><div class="sm-g">` +
      opts.map((o, i) => `<button type="button" class="sm-o${i === first && o.id === 'ride' ? ' go' : ''}" data-o="${o.id}"${o.dis ? ' disabled' : ''}><i>${o.icon}</i><span><b>${esc(o.title)}</b><small>${esc(o.sub)}</small></span>${KB(i + 1)}</button>`).join('') +
      `</div><div class="sm-f"><button type="button" data-b>${blocked(p.uid) ? '取消屏蔽' : '屏蔽这个人'}</button></div>`;
    menuEl.hidden = false; menuEl._opts = opts; tone('triangle', 880, 1175, .09, .05);
  }
  function closeMenu(){ if (!menuEl.hidden){ menuEl.hidden = true; S.menuFor = null; } }
  function pickMenu(id){
    const p = peer(S.menuFor); closeMenu(); refocus();
    if (!p || !p.live){ toast('他走远了', '', 1400); return; }
    if (id === 'hi') sayHi(p);
    else if (id === 'ride') askRide(p);
    else if (id.startsWith('duel:')) askDuel(p, id.slice(5));
    else if (id.startsWith('x:')){ const M = MENU_X.find(m => 'x:' + m.id === id); if (M) g(() => M.pick(p)); }
  }
  /* 别的文件往菜单里加一项：{id, opt(p) → {icon, title, sub, dis} 或 null（不显示）, pick(p)}；p 是 peer(uid) */
  const MENU_X = [];
  function addMenuItem(M){ if (M && M.id && !MENU_X.some(m => m.id === M.id)) MENU_X.push(M); }
  menuEl.addEventListener('click', e => {
    ac();
    const b = e.target.closest('[data-o]'); if (b && !b.disabled){ pickMenu(b.dataset.o); return; }
    if (e.target.closest('[data-x]')){ closeMenu(); refocus(); return; }
    if (e.target.closest('[data-b]')){ const p = peer(S.menuFor); if (p) toggleBlock(p.uid, p.name); closeMenu(); refocus(); }
  });
  function toggleBlock(uid, name){
    if (store.block[uid]){ delete store.block[uid]; toast('取消屏蔽了', name, 1600); }
    else { store.block[uid] = String(name || '?').slice(0, 16); toast('已屏蔽 ' + name, '看不到他的气泡，也收不到他的邀请。表情 · 喊话面板里可以取消', 2800); S.queue = S.queue.filter(q => q.from !== uid); if (S.card && S.card.from === uid) closeCard(); }
    save(); if (!sheetEl.hidden) renderSheet();
  }

  /* ---------- 邀请卡 ---------- */
  function showCard(c){
    S.card = c;
    const title = c.K.title(c.name, c.data, c.from), desc = c.K.desc ? c.K.desc(c.name, c.data, c.from) : '';
    cardEl.innerHTML = `<div class="sm-h"><i style="font-style:normal;font-size:20px">${c.K.icon}</i><b>${esc(title)}</b><span>${esc(desc)}</span></div>` +
      `<div class="sm-g"><button type="button" class="sm-o go" data-y><b>${esc(c.K.yes)}</b>${KB('F')}</button><button type="button" class="sm-o" data-n><b>${esc(c.K.no)}</b>${KB('X')}</button></div><div class="sc-bar"><i></i></div>`;
    cardEl.hidden = false; tone('triangle', 660, 990, .1, .07); tone('triangle', 990, 1320, .1, .06, .12);
  }
  function closeCard(){ if (S.card) S.cardGone = pnow(); S.card = null; cardEl.hidden = true; }
  cardEl.addEventListener('click', e => { ac(); if (e.target.closest('[data-y]')) decide(true); else if (e.target.closest('[data-n]')) decide(false); refocus(); });

  /* ---------- 状态条：等回音 / 车上有谁 / 坐在谁车上 / 比赛 ---------- */
  let statKey = '';
  function renderStat(){
    let html = '', cls = '';
    const D = S.duel;
    if (D && D.phase !== 'wait'){
      cls = 'duel'; const G = GAMES[D.g];
      const left = Math.max(0, Math.ceil(((D.phase === 'count' ? D.at + G.dur * 1000 : D.end) - Math.max(snow(), D.at)) / 1000));
      const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      let mid = '';
      if (D.g === 'race'){ const me = Math.round(D.myDist || 0), op = D.oppDist != null ? Math.round(D.oppDist) + ' 米' : '?'; mid = `<span class="vs"><b>你 ${me} 米</b><em>${esc(D.oppName)} ${op}</em></span>`; }
      else if (D.g === 'stunt') mid = `<span class="vs"><b>你 ${Math.round(D.myS).toLocaleString()}</b><em>${esc(D.oppName)} ${Math.round(D.opS).toLocaleString()}</em></span>`;
      else mid = `<b>${D.it === XNet.uid ? '你是鬼！去抓他' : '快跑！' + esc(D.oppName) + ' 是鬼'}</b>`;
      html = `<span>${G.icon}</span>${mid}<b>${D.phase === 'count' ? '准备' : clock}</b><button type="button" class="sx" data-quit>认输</button>`;
    } else if (D && D.phase === 'wait') html = `<span>⏳ 等 ${esc(D.oppName)} 开始…</span>`;
    else if (S.out) html = `<span>⏳ 等 ${esc(S.out.name)} 回应…</span><button type="button" class="sx" data-cancel>撤回</button>`;
    else if (S.ride) html = `<span>🚗 坐在 <b>${esc(S.ride.name)}</b> 的车上</span><button type="button" class="sx" data-off>下车${TOUCH ? '' : ' F'}</button>`;
    else if (S.pax.size) html = `<span>🚗 车上：</span>` + [...S.pax].map(([u, x]) => `<span class="pax">${esc(x.name)}<button type="button" data-kick="${esc(u)}" aria-label="请 ${esc(x.name)} 下车">×</button></span>`).join('');
    const key = cls + html;
    if (key !== statKey){ statKey = key; statEl.innerHTML = html; statEl.className = 'panel' + (cls ? ' ' + cls : ''); }
    statEl.hidden = !html || mode !== 'naiwa' || !S.on;
  }
  statEl.addEventListener('click', e => {
    ac();
    if (e.target.closest('[data-cancel]')){ S.out = null; renderStat(); }
    else if (e.target.closest('[data-off]')) endRide('', true);
    else if (e.target.closest('[data-quit]')) quitDuel();
    else { const k = e.target.closest('[data-kick]'); if (k) kick(k.dataset.kick); }
    refocus();
  });

  /* ---------- 表情、喊话 ---------- */
  function fxSend(kind, i){
    if (!S.on) return false;
    const t = pnow(); if (t - S.fxAt < FX_CD) return false;
    S.fxAt = t; S.fxSeq = (S.fxSeq + 1) % 10000; S.fx = kind + i + '-' + S.fxSeq;
    showBubble(XNet.uid, kind, i);
    if (kind === 'e') startMyEmote(i);
    return true;
  }
  function startMyEmote(i){
    if (!driving && !S.ride && (i === 1 || i === 7)){ footAction(i === 1 ? 'laugh' : 'pose'); if (nw.state === (i === 1 ? 'laugh' : 'pose')) return; }
    S.myFx = {id:i, t:0};
    if (i === 1) sfx.laugh(); else if (i === 2 || i === 7) sfx.sparkle(); else if (i === 0 || i === 3) sfx.boing(); else if (i === 4) tone('sawtooth', 220, 150, .25, .06);
  }
  function showBubble(uid, kind, i){
    let B = S.bubbles.get(uid);
    if (!B){ const L = addLabel('', 0, -999, 0, false); L.dead = true; B = {L, until:0}; S.bubbles.set(uid, B); }
    const emo = kind === 'e';
    B.L.el.className = 'lbl soc-bub' + (emo ? ' emo' : '');
    B.L.el.textContent = emo ? (EMOTES[i] || EMOTES[0]).icon : PHRASES[i] || '…';
    B.L.el.style.setProperty('--soc-c', uid === XNet.uid ? 'var(--tile)' : 'var(--gold)');
    void B.L.el.offsetWidth; B.L.el.classList.add('pop');
    B.until = pnow() + FX_SHOW;
  }
  /* 人多时一起发表情：只显示最近的几个气泡（流畅 6 个，其余 8 个，自己的总显示），远的先藏起来 */
  const bubCap = () => g(() => XQ.level, 'mid') === 'low' ? 6 : 8;
  const _bubList = [];
  function placeBubbles(){
    const t = pnow(), [mx, , mz] = (() => { const p = myPos(); return [p.x, 0, p.z]; })();
    _bubList.length = 0;
    for (const [uid, B] of S.bubbles){
      if (t > B.until || mode === 'orbit' || mode === 'hole'){ B.L.dead = true; if (t > B.until + 30 && uid !== XNet.uid){ B.L.el.remove(); const i = labels.indexOf(B.L); if (i >= 0) labels.splice(i, 1); S.bubbles.delete(uid); } continue; }
      const h = headOf(uid), d = h ? Math.hypot(h[0] - mx, h[2] - mz) : 1e9;
      if (!h || d > 70){ B.L.dead = true; continue; }
      B.L.pos.set(h[0], h[1], h[2]);
      _bubList.push([uid === XNet.uid ? -1 : d, B]);
    }
    _bubList.sort((a, b) => a[0] - b[0]);
    const cap = bubCap();
    for (let i = 0; i < _bubList.length; i++) _bubList[i][1].L.dead = i >= cap;
  }
  /* poses for an emote on any 奶娃 (yours or a ghost): arms, elbows, body; k fades it in and out */
  const REST = {sx:-.32, sz:.36, ex:-1.22, ez:-.32};
  function pose(n, id, t){
    if (!n || !n.arms) return;
    const k = Math.min(1, t / .25) * Math.max(0, Math.min(1, (EMO_DUR - t) / .3));
    const L = Object.assign({}, REST), R = Object.assign({}, REST); let lean = 0, roll = 0, lift = 0, mouth = 0;
    switch (id){
      case 0: R.sz = 2.55; R.sx = -.25; R.ex = -.5 + Math.sin(t * 14) * .55; R.ez = 0; roll = -.05; break;
      case 1: lean = -.28; L.ex = REST.ex + Math.sin(t * 9) * .22; R.ex = REST.ex - Math.sin(t * 9) * .22; mouth = .07 + Math.abs(Math.sin(t * 11)) * .07; roll = Math.sin(t * 17) * .05; break;
      case 2: L.sz = R.sz = 2.05; L.sx = R.sx = -.45; L.ex = R.ex = -1.95; L.ez = R.ez = -.95; lean = -.08; lift = Math.abs(Math.sin(t * 5)) * .04; break;
      case 3: R.sx = -1.45; R.sz = .4; R.ex = -.2; R.ez = 0; L.sz = .55; lean = -.06; lift = Math.abs(Math.sin(t * 6)) * .03; break;
      case 4: L.sz = R.sz = .8; L.sx = R.sx = .3; L.ex = R.ex = -.3; L.ez = R.ez = 0; roll = Math.sin(t * 34) * .07; lift = Math.abs(Math.sin(t * 11)) * .06; lean = .1; break;
      case 5: L.sx = R.sx = -1.2; L.sz = R.sz = .2; L.ex = R.ex = -2.1; L.ez = R.ez = -.4; lean = .18; roll = Math.sin(t * 7) * .05; break;
      case 6: { const s = Math.sin(t * 9); L.sz = 1.9 + s * .55; R.sz = 1.9 - s * .55; L.sx = R.sx = -.3; L.ex = R.ex = -.6; L.ez = R.ez = 0; roll = s * .2; lift = Math.abs(Math.cos(t * 9)) * .16; break; }
      case 7: R.sz = 2.45; R.sx = -.35; R.ex = -1.75; R.ez = -.2; L.sz = .62; L.sx = .25; L.ex = -1.1; L.ez = -1.0; roll = .14; lean = -.06; break;
    }
    const mix = (a, b) => a + (b - a) * k;
    const [aL, aR] = n.arms, [eL, eR] = n.elbows || [];
    aL.rotation.set(mix(REST.sx, L.sx), 0, mix(REST.sz, L.sz)); aR.rotation.set(mix(REST.sx, R.sx), 0, -mix(REST.sz, R.sz));
    if (eL){ eL.rotation.set(mix(REST.ex, L.ex), 0, mix(REST.ez, L.ez)); eR.rotation.set(mix(REST.ex, R.ex), 0, -mix(REST.ez, R.ez)); }
    n.body.rotation.x = lean * k; n.body.rotation.z = roll * k; n.body.position.y = lift * k;
    if (mouth && n.mouth) n.mouth.scale.y = Math.max(.018, mouth * k * .9);
  }
  function restPose(n){
    if (!n || !n.arms) return;
    n.arms[0].rotation.set(REST.sx, 0, REST.sz); n.arms[1].rotation.set(REST.sx, 0, -REST.sz);
    if (n.elbows){ n.elbows[0].rotation.set(REST.ex, 0, REST.ez); n.elbows[1].rotation.set(REST.ex, 0, -REST.ez); }
    n.body.rotation.x = 0; n.body.position.y = 0;
  }
  /* little particles that go with an emote, at a world position */
  function fxParts(id, t, dt, x, y, z){
    const tick = p => Math.floor(t / p) !== Math.floor((t - dt) / p);
    if ((id === 2 || id === 7) && tick(.2) && t < 1.9) spawnPart('heart', x + (rnd() - .5) * 2, y + 2.4 + rnd(), z + (rnd() - .5) * 2, .8 + rnd() * .4, {vy:2.4, life:1.3, op:1, color:'#ff6fa3'});
    if (id === 1 && tick(.32) && t > .3 && t < 2) spawnPart('ha', x + (rnd() - .5) * 2, y + 3 + rnd(), z + (rnd() - .5) * 2, 1.1, {vy:2.2, life:1.1, op:1, color:'#c0392b'});
    if (id === 5 && tick(.12) && t < 2.1) spawnPart('dust', x + (rnd() - .5) * .8, y + 2.1, z + (rnd() - .5) * .8, .25, {vy:1.5, vx:(rnd() - .5) * 3, vz:(rnd() - .5) * 3, g:9, life:.8, op:1, color:'#5fb8ff'});
    if (id === 4 && tick(.25) && t < 2) spawnPart('dust', x + (rnd() - .5) * .6, y + 2.9, z + (rnd() - .5) * .6, .7, {vy:2.4, grow:1.2, life:.9, op:.9, color:'#e74c3c'});
    if (id === 6 && tick(.3) && t < 2.1) spawnPart('heart', x + (rnd() - .5) * 2.5, y + 2 + rnd(), z + (rnd() - .5) * 2.5, .6, {vy:2, life:1, op:1, color:['#ffd24a', '#4fd1c5', '#c46bff'][(rnd() * 3) | 0]});
    if (id === 3 && tick(.5) && t < 1.5) spawnPart('heart', x, y + 3.1, z, .5, {vy:1.6, life:.8, op:1, color:'#ffd24a'});
  }
  /* other players' fx: a new value in their presence starts the bubble and the pose */
  function watchFx(){
    const t = pnow();
    for (const [uid, r] of XNet.peers()){
      const fx = r.d && typeof r.d.fx === 'string' ? r.d.fx : '';
      const was = S.lastFx.get(uid);
      if (was === fx) continue;
      S.lastFx.set(uid, fx);
      if (was === undefined || !fx || r.oneWay || blocked(uid) || performance.now() - r.seen > 3000) continue;
      const m = /^([es])(\d{1,2})-/.exec(fx); if (!m) continue;
      const kind = m[1], i = +m[2];
      if (kind === 'e' ? !EMOTES[i] : !PHRASES[i]) continue;
      showBubble(uid, kind, i);
      if (kind === 'e') S.remFx.set(uid, {id:i, t:0, start:t});
      const h = headOf(uid), p = myPos();
      if (h && Math.hypot(h[0] - p.x, h[2] - p.z) < 40 && t - S.fxTone > .25){ S.fxTone = t; tone('triangle', 780, 1040, .07, .04); }   // 很多人一起发也只响一声
    }
  }

  /* emote wheel (Z): eight buttons round the middle of the screen */
  function openWheel(){
    if (!S.on) return; closeSheet(); closeMenu();
    const R = TOUCH ? 96 : 112;
    wheelEl.innerHTML = `<div class="wc"><b>表情</b>${TOUCH ? '点一个' : '按 1–8<br>Z 关'}</div>` + EMOTES.map((e, i) => {
      const a = -Math.PI / 2 + i / EMOTES.length * Math.PI * 2;
      return `<button type="button" data-e="${i}" style="left:${(Math.cos(a) * R).toFixed(1)}px;top:${(Math.sin(a) * R).toFixed(1)}px" aria-label="${e.name}"><i>${e.icon}</i><span>${e.name}</span>${KB(i + 1)}</button>`;
    }).join('');
    wheelEl.hidden = false; wheelEl.classList.toggle('cd', pnow() - S.fxAt < FX_CD);
  }
  function closeWheel(){ wheelEl.hidden = true; }
  wheelEl.addEventListener('pointerdown', e => { e.stopPropagation(); const b = e.target.closest('[data-e]'); if (b){ e.preventDefault(); ac(); doEmote(+b.dataset.e); } });
  function doEmote(i){ if (!fxSend('e', i)) toast('慢一点', '表情和喊话 2.5 秒一次', 1200); closeWheel(); closeSheet(); refocus(); }
  function doPhrase(i){ if (!fxSend('s', i)) toast('慢一点', '表情和喊话 2.5 秒一次', 1200); closeSheet(); refocus(); }
  /* the sheet (V, or the button on a phone): emotes, 20 phrases, 免打扰 and the block list */
  let sheetBl = false;
  function renderSheet(){
    const bl = Object.entries(store.block);
    sheetEl.innerHTML = `<div class="sm-h"><b>表情 · 喊话</b><span>${TOUCH ? '附近的人都看得到' : '附近的人都看得到 · 1–0 发前 10 句'}</span><button type="button" class="sm-x" data-x>关 ${KB('V')}</button></div>` +
      `<div class="ss-emo">${EMOTES.map((e, i) => `<button type="button" data-e="${i}" title="${e.name}" aria-label="${e.name}">${e.icon}</button>`).join('')}</div>` +
      `<div class="ss-ph">${PHRASES.map((p, i) => `<button type="button" data-p="${i}">${i < 10 ? KB((i + 1) % 10) : ''}${esc(p)}</button>`).join('')}</div>` +
      `<div class="ss-f"><label><input type="checkbox" data-dnd${store.dnd ? ' checked' : ''}> 免打扰（自动拒绝所有邀请）</label>` +
      (bl.length ? `<button type="button" data-bl>屏蔽了 ${bl.length} 人</button>` : '') + '</div>' +
      (sheetBl && bl.length ? `<div class="ss-bl">${bl.map(([u, n]) => `<span>${esc(n)}<button type="button" data-ub="${esc(u)}" aria-label="取消屏蔽 ${esc(n)}">×</button></span>`).join('')}</div>` : '');
    sheetEl.classList.toggle('cd', pnow() - S.fxAt < FX_CD);
  }
  function openSheet(){ if (!S.on) return; closeWheel(); closeMenu(); renderSheet(); sheetEl.hidden = false; actSoc.classList.add('on'); }
  function closeSheet(){ if (!sheetEl.hidden){ sheetEl.hidden = true; sheetBl = false; } actSoc.classList.remove('on'); }
  sheetEl.addEventListener('click', e => {
    ac();
    const b = e.target.closest('button,input'); if (!b) return;
    if (b.dataset.e != null) doEmote(+b.dataset.e);
    else if (b.dataset.p != null) doPhrase(+b.dataset.p);
    else if (b.dataset.x != null){ closeSheet(); refocus(); }
    else if (b.dataset.bl != null){ sheetBl = !sheetBl; renderSheet(); }
    else if (b.dataset.ub != null){ toggleBlock(b.dataset.ub, store.block[b.dataset.ub]); }
    else if (b.dataset.dnd != null){ store.dnd = b.checked; save(); toast(store.dnd ? '免打扰开了' : '免打扰关了', store.dnd ? '别人的邀请会自动拒绝，表情和喊话照常' : '可以收到搭车和挑战邀请了', 2000); if (store.dnd){ for (const q of S.queue) answer(q.from, q.data.k, false, 'dnd'); S.queue = []; } }
  });

  /* ---------- 打招呼 ---------- */
  function sayHi(p){
    const key = p.uid + ':hi', t = pnow();
    if (S.invCool[key] > t){ toast('刚打过招呼了', '', 1200); return; }
    S.invCool[key] = t + 10; send(p.uid, 'hi', {});
    S.fxAt = -99; fxSend('e', 0);
    if (!driving && !S.ride) nw.h = Math.atan2(p.G.x - nw.x, p.G.z - nw.z);
  }
  on('hi', from => {
    const p = peer(from); if (!p || store.dnd || cardBlocked()) return;
    toast(`${p.name} 向你挥手 👋`, TOUCH ? '点「表情 · 喊话」回一个' : '按 Z 回个表情', 2400);
  });

  /* ---------- 搭车 ---------- */
  function askRide(p){
    if (driving){ toast('你自己在开车', '下车再搭别人的车', 1600); return; }
    if (S.duel){ toast('比赛中不能搭车', '', 1400); return; }
    if (window.XQuest && XQuest.carLocked()){ XQuest.lockToast(); return; }   /* story chapter 1: no cars yet, not even a ride (js/89-quest.js) */
    invite(p.uid, 'ride', {}, {answer(ok, data){
      if (!ok) return;
      const q = peer(p.uid);
      if (!q || !q.car || distTo(q, nw.x, nw.z) > 12 || driving || S.duel || S.ride){ send(p.uid, 'bye', {}); toast('没赶上', '他开走了或者你走远了', 1600); return; }
      startRide(q, Math.max(1, Math.min(3, data.seat | 0 || 1)));
    }});
    toast('问问 ' + p.name, '等他同意就上车', 1500);
  }
  defineInvite('ride', {
    icon:'🚗', yes:'上来吧', no:'不行',
    title:name => `${name} 想搭你的车`,
    desc:() => { const cap = driving ? seatsOf(driving.kind).length : 0; return driving ? `还有 ${cap - S.pax.size} 个座 · 带人兜风` : ''; },
    check(from){
      if (!driving) return 'driving';
      if (S.duel) return 'duel';
      if (S.pax.has(from)) return '';
      if (S.pax.size >= seatsOf(driving.kind).length) return 'full';
      const p = peer(from); if (p && p.G && Math.hypot(p.G.x - driving.x, p.G.z - driving.z) > 16) return 'far';
      return '';
    },
    accept(from){
      const used = new Set([...S.pax.values()].map(x => x.seat)), cap = seatsOf(driving.kind).length;
      let seat = 1; while (used.has(seat) && seat < cap) seat++;
      const p = peer(from);
      S.pax.set(from, {seat, name:p ? p.name : '?', t0:pnow()}); renderStat();
      toast((p ? p.name : '乘客') + ' 上车了', '顶上的小条里点 × 可以请他下车', 2200);
      return {seat};
    },
    late(from, data){ if (data.ok) send(from, 'bye', {}); }
  });
  function startRide(p, seat){
    S.ride = {uid:p.uid, seat, name:p.name, t0:pnow(), lostAt:0};
    nw.state = 'sit'; nw.air = false; nw.vy = 0; S.prevCamDist = camDist; camDist = Math.max(camDist, 13);
    closeMenu(); updateActs(); renderStat(); sfx.ding();
    toast(`坐上 ${p.name} 的车了`, TOUCH ? '点「下车」随时下车' : '按 F 随时下车', 2400);
    g(() => { if (window.XRadio && typeof XRadio.follow === 'function') XRadio.follow(p.uid); });
  }
  function endRide(why, tell){
    const R = S.ride; if (!R) return;
    S.ride = null; window.RIDE_CAM = null;
    if (tell) send(R.uid, 'bye', {});
    const p = peer(R.uid), c = p && p.car;
    if (c){
      const h = c.h, rx = Math.cos(h), rz = -Math.sin(h); let placed = false;
      for (const s of [-1, 1, -2, 2]){ const x = c.x + rx * s * (c.T.W / 2 + 1.6), z = c.z + rz * s * (c.T.W / 2 + 1.6); if (!footBlocked(x, z)){ nw.x = x; nw.z = z; placed = true; break; } }
      if (!placed){ nw.x = c.x - Math.sin(h) * (c.T.L / 2 + 1.5); nw.z = c.z - Math.cos(h) * (c.T.L / 2 + 1.5); }
    }
    nw.y = groundAt(nw.x, nw.z); nw.state = 'idle'; nw.air = false;
    if (S.prevCamDist) camDist = S.prevCamDist;
    updateActs(); renderStat();
    if (why) toast(why, '', 1800);
    g(() => { if (window.XRadio && typeof XRadio.follow === 'function') XRadio.follow(null); });
  }
  function kick(uid){ if (S.pax.delete(uid)) send(uid, 'bye', {}); renderStat(); }
  on('bye', from => {
    if (S.ride && S.ride.uid === from) endRide(`${S.ride.name} 请你下车了`, false);
    if (S.pax.has(from)){ const x = S.pax.get(from); S.pax.delete(from); renderStat(); toast(x.name + ' 下车了', '', 1500); }
  });
  /* passenger: every frame, sit on the driver's ghost car (it is already smoothed by js/net.js) */
  const _sv = new THREE.Vector3();
  function rideFrame(dt){
    const R = S.ride, p = peer(R.uid);
    if (!p || !p.live || !p.car || p.d.mode !== 'naiwa'){ window.RIDE_CAM = null; const t = pnow(); R.lostAt = R.lostAt || t; if (t - R.lostAt > 1.2) endRide(p && p.live ? `${R.name} 下车了` : `${R.name} 掉线了`, false); return; }
    R.lostAt = 0;
    const c = p.car, s = seatsOf(c.kind)[Math.min(R.seat, seatsOf(c.kind).length) - 1], h = c.root.rotation.y, cs = Math.cos(h), sn = Math.sin(h);
    const cp = c.root.position;
    /* the car's speed from how far the (already smoothed) ghost moved, eased again so the readout and the camera don't flicker; js/90-main.js reads it */
    if (dt > 0 && R.lx != null){ const v = Math.min(120, Math.hypot(cp.x - R.lx, cp.z - R.lz) / dt); R.sp = (R.sp || 0) + (v - (R.sp || 0)) * Math.min(1, dt * 4); }
    R.lx = cp.x; R.lz = cp.z;
    window.RIDE_CAM = {car:c, sp:R.sp || 0};
    nw.x = cp.x + cs * s[0] + sn * s[2]; nw.z = cp.z - sn * s[0] + cs * s[2]; nw.y = cp.y + s[1]; nw.h = h;
    nw.state = 'sit'; nw.air = false; nw.spd = 0; nw.vy = 0; nw.bike = !!(c.T && c.T.bike);
    if (camYawHold <= 0) camYaw += wrapA(h + Math.PI - camYaw) * Math.min(1, dt * 3);
  }
  /* driver: drop passengers who left, went quiet, or never sat down */
  function paxTick(){
    if (!S.pax.size) return;
    if (!driving){ for (const u of S.pax.keys()) send(u, 'bye', {}); S.pax.clear(); renderStat(); return; }
    const t = pnow();
    for (const [u, x] of [...S.pax]){
      const p = peer(u);
      if (!p || !p.live || (t - x.t0 > 6 && p.d.ride !== XNet.uid)){ S.pax.delete(u); renderStat(); if (p && p.live) toast(x.name + ' 下车了', '', 1400); }
    }
  }
  /* everybody's view: ghosts riding in a car sit in it (in your own car when you drive) */
  const attached = new Map();       // uid -> naiwa root we moved into a car
  function cleanRiders(){
    const peers = XNet.peers();
    for (const [uid, root] of attached){
      const r = peers.get(uid), d = r && r.d, host = d && d.ride ? hostCar(uid, d) : null;
      const cur = r && r.g && r.g.n ? r.g.n.root : null;       // 远处的影子没有模型（js/net.js 分级显示），换级时模型也会换
      if (!r || !cur || cur !== root || !host){
        if (root.parent && root.parent !== scene){ root.parent.remove(root); if (cur === root) scene.add(root); }
        if (r && r.g){ r.g.socSeatW = null; if (r.g.n) restPose(r.g.n); }
        attached.delete(uid);
      }
    }
  }
  function placeRiders(){
    cleanRiders();
    for (const [uid, r] of XNet.peers()){
      const d = r.d; if (!d || !d.ride || !r.g || !r.g.vis) continue;
      const host = hostCar(uid, d); if (!host) continue;
      const G = r.g, root = G.n.root, s = seatsOf(host.kind)[Math.max(1, Math.min(seatsOf(host.kind).length, d.rs | 0 || 1)) - 1];
      if (root.parent !== host.body){ if (root.parent) root.parent.remove(root); host.body.add(root); attached.set(uid, root); }
      root.position.set(s[0], s[1], s[2]); root.rotation.set(0, 0, 0);
      nwSitPose(G.n, host.T && host.T.bike, S.remFx.has(uid));
      host.root.updateMatrixWorld(); _sv.set(s[0], s[1], s[2]); host.root.localToWorld(_sv);
      G.socSeatW = [_sv.x, _sv.y, _sv.z]; G.L.pos.set(_sv.x, _sv.y + 2.6, _sv.z);
    }
  }
  function hostCar(uid, d){
    if (d.ride === XNet.uid) return driving && S.pax.has(uid) ? driving : null;
    const p = peer(d.ride); return p && p.car ? p.car : null;
  }

  /* ---------- 当面挑战 ---------- */
  function askDuel(p, k){
    if (!GAMES[k]) return;
    if (S.duel){ toast('你已经在比赛了', '', 1400); return; }
    if (gx.busy() || mission.on){ toast('先把手上的任务做完', '', 1600); return; }
    invite(p.uid, 'duel', {g:k}, {answer(ok){
      if (!ok) return;
      const q = peer(p.uid);
      if (!q || !q.live || S.duel || S.ride || gx.busy() || mission.on || mode !== 'naiwa'){ send(p.uid, 'end', {cancel:1}); toast('比不了了', '你现在正忙', 1600); return; }
      hostDuel(q, k);
    }});
    toast(`向 ${p.name} 发起挑战`, GAMES[k].name + ' · 等他应战', 1600);
  }
  defineInvite('duel', {
    icon:'⚔️', yes:'应战', no:'算了', needFree:true,
    title:(name, d) => `${name} 向你挑战：${(GAMES[d.g] || GAMES.race).name}`,
    desc:(name, d, from) => (GAMES[d.g] || GAMES.race).desc + (pairLeft(from) > 0 ? ' · 赢了有改装零件' : ''),
    check(from, d){ if (!GAMES[d.g]) return 'unknown'; if (S.duel) return 'duel'; if (S.ride || gx.busy() || mission.on) return 'busy'; return ''; },
    accept(from, d){
      const p = peer(from);
      S.duel = {g:d.g, opp:from, oppName:p ? p.name : '?', host:false, phase:'wait', t0:pnow()}; renderStat();
      return {};
    }
  });
  /* the host picks the place and the start time, both sides start the same countdown */
  function hostDuel(q, k){
    const me = myPos(), qx = q.G ? q.G.x : +q.d.x || 0, qz = q.G ? q.G.z : +q.d.z || 0, mx = (me.x + qx) / 2, mz = (me.z + qz) / 2;
    const go = {g:k, id:Math.random().toString(36).slice(2, 8), at:snow() + 4200};
    if (k === 'race'){
      const pool = (typeof DESTS !== 'undefined' ? DESTS : []).filter(d => !d.far).map(d => [Math.hypot(d.x - mx, d.z - mz), d]).filter(([dd]) => dd > 220 && dd < 480);
      const pick = pool.length ? pool[(Math.random() * pool.length) | 0][1] : {name:'田径场', x:FIELD.x, z:FIELD.z};
      Object.assign(go, {tx:Math.round(pick.x * 10) / 10, tz:Math.round(pick.z * 10) / 10, tn:String(pick.name).slice(0, 20)});
    }
    if (k === 'tag'){ go.it = Math.random() < .5 ? XNet.uid : q.uid; go.cx = Math.round(mx); go.cz = Math.round(mz); }
    send(q.uid, 'go', go);
    startDuel(go, q.uid, q.name, true);
  }
  on('go', (from, d) => {
    const D = S.duel;
    if (!D || D.opp !== from || D.phase !== 'wait' || !GAMES[d.g] || !(+d.at > 0)){ send(from, 'end', {cancel:1}); return; }
    startDuel(d, from, D.oppName, false);
  });
  const duelMark = typeof gxMarker === 'function' ? gxMarker('#ffd24a', 1.15) : null;
  const duelLbl = addLabel('', 0, -999, 0, false); duelLbl.dead = true;
  function startDuel(go, opp, oppName, host){
    if (S.ride) endRide('', true);
    closeMenu(); closeSheet(); closeWheel(); closeShop(); resEl.hidden = true;
    const G = GAMES[go.g];
    S.duel = {g:go.g, id:String(go.id || ''), opp, oppName, host, phase:'count', at:+go.at, end:+go.at + G.dur * 1000, myS:0, opS:0, oppFinal:null, myT:null, oppT:null,
      target:go.tx != null ? {x:+go.tx, z:+go.tz, name:String(go.tn || '终点')} : null, it:go.it || null, tagN:0, lastTag:-1e9, frozen:0, lastPts:stunt.pts, cd:4, beep:-1, lostAt:0, t0:pnow()};
    if (G.car) needCar(); else if (driving) leaveCar();
    if (S.duel.target && duelMark){ duelMark.position.set(S.duel.target.x, 0, S.duel.target.z); duelMark.visible = true; duelLbl.el.textContent = '🏁 ' + S.duel.target.name; duelLbl.pos.set(S.duel.target.x, 9, S.duel.target.z); duelLbl.dead = false; }
    gxCallout(G.icon + ' ' + G.name, `对手：${oppName}`, '#ffd24a');
    renderStat();
  }
  /* race and stunt need a car: your own car is brought round, otherwise a rental Myvi */
  let rental = null;
  function needCar(){
    if (driving) return;
    const kind = myCar && !myCar.wrecked ? myCar.kind : 'myvi', [x, z, h] = spotNear(nw.x, nw.z, kind, nw.h);   /* facing the way you face */
    let c = myCar && !myCar.wrecked ? myCar : null;
    if (c){ c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.root.position.set(x, groundAt(x, z), z); c.root.rotation.set(0, h, 0); }
    else {
      if (rental && rental !== driving){ scene.remove(rental.root); const i = cars.indexOf(rental); if (i >= 0) cars.splice(i, 1); }
      c = rental = makeCar('myvi', '#e0a020', x, z, h);
    }
    enterCar(c); dustBurst(x, .5, z, 6, 3);
  }
  function duelTick(dt){
    const D = S.duel; if (!D) return;
    const t = pnow();
    if (D.phase === 'wait'){ if (t - D.t0 > 9){ S.duel = null; renderStat(); toast(`${D.oppName} 没开始`, '这局取消了', 1800); } return; }
    if (D.phase === 'done') return;
    const p = peer(D.opp), st = snow();
    /* opponent gone, or no longer in this duel: cancel (or a forfeit win once it has really started) */
    const gone = !p || !p.live || (st > D.at + 3000 && p.d.duel !== XNet.uid);
    if (!gone) D.lostAt = 0; else if (!D.lostAt) D.lostAt = t;          // wall clock: the game's dt is capped, so it runs slow on a slow phone
    if (D.lostAt && t - D.lostAt > (p && p.live ? 2 : 4)) return finishDuel(st - D.at > 15000 && p && p.live ? 'forfeit' : 'cancel', p && p.live ? `${D.oppName} 离开了比赛` : `${D.oppName} 掉线了`);
    if (D.phase === 'count'){
      const left = Math.ceil((D.at - st) / 1000);
      if (left !== D.beep && left >= 1 && left <= 3){ D.beep = left; gxCallout(String(left), GAMES[D.g].name, '#ffd24a'); tone('square', 520, 520, .12, .08); }
      if (driving){ driving.vx = driving.vz = 0; }
      if (st >= D.at){ D.phase = 'run'; D.lastPts = stunt.pts; gxCallout('开始！', D.g === 'tag' ? (D.it === XNet.uid ? '你是鬼，去抓他！' : '快跑！') : D.g === 'race' ? '冲向 ' + D.target.name : '拼特技！', '#ffd24a'); tone('square', 880, 880, .25, .1); }
      renderStat(); return;
    }
    const me = myPos();
    if (D.g === 'race'){
      D.myDist = Math.hypot(D.target.x - me.x, D.target.z - me.z);
      D.oppDist = p && p.G ? Math.hypot(D.target.x - p.G.x, D.target.z - p.G.z) : null;
      if (D.myT == null && D.myDist < 8){ D.myT = st - D.at; send(D.opp, 'end', {id:D.id, t:D.myT}); raceCheck(); }
    } else if (D.g === 'stunt'){
      if (stunt.pts > D.lastPts) D.myS += stunt.pts - D.lastPts;
      D.lastPts = stunt.pts;
      D.opS = Math.max(D.opS, p ? +p.d.ds || 0 : 0);
    } else if (D.g === 'tag'){
      if (D.it === XNet.uid && p && p.G && !driving && st - D.lastTag > 2000 && t > D.frozen && Math.hypot(p.G.x - nw.x, p.G.z - nw.z) < 2.4){
        D.tagN++; D.lastTag = st; D.it = D.opp; send(D.opp, 'tag', {id:D.id, n:D.tagN});
        gxCallout('抓到了！', `现在 ${D.oppName} 是鬼，快跑`, '#4fd18b'); sfx.boing();
      }
    }
    if (st >= D.end){
      if (D.g === 'race'){ if (D.myT == null && D.oppT == null) return finishDuel('draw', '都没开到'); if (D.myT == null) return finishDuel('lose', `${D.oppName} 先到了`); }
      if (D.g === 'stunt'){
        if (!D.sentFinal){ D.sentFinal = true; D.endWait = t; send(D.opp, 'end', {id:D.id, s:Math.round(D.myS)}); }
        if (D.oppFinal == null && t - D.endWait < 4) return renderStat();
        const o = D.oppFinal != null ? D.oppFinal : D.opS, m = Math.round(D.myS);
        return finishDuel(m > o ? 'win' : m < o ? 'lose' : 'draw', `你 ${m.toLocaleString()} 分 · ${D.oppName} ${Math.round(o).toLocaleString()} 分`);
      }
      if (D.g === 'tag'){
        if (!D.sentFinal){ D.sentFinal = true; D.endWait = t; send(D.opp, 'end', {id:D.id, n:D.tagN, it:D.it === XNet.uid ? 1 : 0}); }
        if (D.oppFinal == null && t - D.endWait < 2.5) return renderStat();
        if (D.oppFinal && D.oppFinal.n > D.tagN){ D.tagN = D.oppFinal.n; D.it = D.oppFinal.it ? D.opp : XNet.uid; }   // he saw a later tag than we did
        return finishDuel(D.it === XNet.uid ? 'lose' : 'win', D.it === XNet.uid ? '时间到时你是鬼' : `时间到时 ${D.oppName} 是鬼`);
      }
    }
    renderStat();
  }
  function raceCheck(){
    const D = S.duel; if (!D || D.phase !== 'run') return;
    if (D.myT != null && (D.oppT == null || D.myT <= D.oppT)) finishDuel('win', `${(D.myT / 1000).toFixed(1)} 秒开到 ${D.target.name}`);
    else if (D.oppT != null && (D.myT == null || D.oppT < D.myT)) finishDuel('lose', `${D.oppName} ${(D.oppT / 1000).toFixed(1)} 秒先到了`);
  }
  on('end', (from, d) => {
    const D = S.duel && S.duel.opp === from ? S.duel : S.lastDuel && S.lastDuel.opp === from ? S.lastDuel : null; if (!D) return;
    if (d.cancel){ if (D.phase !== 'done') finishDuel('cancel', `${D.oppName} 取消了`); return; }
    if (d.quit){ if (D.phase !== 'done') finishDuel(snow() - D.at > 15000 ? 'forfeit' : 'cancel', `${D.oppName} 认输了`); return; }
    if (D.phase === 'done'){
      /* a race finish that crossed ours on the wire: the faster time decides, even after the card is up */
      if (D.g === 'race' && +d.t >= 0 && D.result === 'win' && D.myT != null && +d.t < D.myT && pnow() - D.doneAt < 3){ D.oppT = +d.t; finishDuel('lose', `${D.oppName} ${(D.oppT / 1000).toFixed(1)} 秒，比你快一点点`, true); }
      return;
    }
    if (D.g === 'race' && +d.t >= 0){ D.oppT = +d.t; raceCheck(); }
    if (D.g === 'stunt' && d.s >= 0) D.oppFinal = Math.min(1e7, +d.s);
    if (D.g === 'tag' && d.n >= 0) D.oppFinal = {n:+d.n, it:+d.it};
  });
  on('tag', (from, d) => {
    const D = S.duel; if (!D || D.opp !== from || D.g !== 'tag' || D.phase !== 'run') return;
    if (+d.n === D.tagN + 1){ D.tagN = +d.n; D.it = XNet.uid; D.lastTag = snow(); D.frozen = pnow() + 1.5; gxCallout('被抓到了！', '你是鬼了 · 1.5 秒后去抓他', '#e74c3c'); sfx.thud(.5); }
  });
  function quitDuel(){
    const D = S.duel; if (!D) return;
    send(D.opp, 'end', D.phase === 'wait' ? {cancel:1} : {quit:1});
    if (D.phase === 'wait'){ S.duel = null; renderStat(); return; }
    finishDuel('quit', '你认输了');
  }
  function finishDuel(res, why, redo){
    const D = redo ? S.lastDuel : S.duel; if (!D) return;
    if (D.phase === 'done' && !redo) return;
    D.phase = 'done'; D.result = res; D.doneAt = pnow();
    if (duelMark) duelMark.visible = false; duelLbl.dead = true; itL.dead = true;
    const G = GAMES[D.g];
    const title = {win:'你赢了！', forfeit:'你赢了', lose:'输了', quit:'认输了', draw:'平局', cancel:'比赛取消'}[res];
    let loot = [], note = '';
    if (!redo && res !== 'cancel' && res !== 'quit' && window.XParts){
      const grade = res === 'win' ? 0 : res === 'forfeit' ? 1 : res === 'draw' ? 2 : 3;
      if (grade < 3){
        if (pairLeft(D.opp) <= 0) note = `今天和 ${D.oppName} 的有奖次数用完了（每个对手每天 ${PAIR_DAY} 次）`;
        else if (!XParts.ready('duel')) note = '今天挑战的零件拿满了，明天再来';
        else { loot = XParts.reward('duel', grade, '当面挑战 · ' + title.replace(/！$/, '')); if (loot.length) pairUse(D.opp); }
      }
    }
    if (redo && D.loot && D.loot.length) note = '零件已经发了，就当是运气好';
    if (!redo) D.loot = loot;
    if (res === 'win' || res === 'forfeit'){ sfx.sparkle(); g(() => unlock('duel1')); } else if (res !== 'cancel') sfx.fail();
    resEl.style.borderTopColor = res === 'win' || res === 'forfeit' ? 'var(--gold)' : res === 'cancel' ? 'var(--line)' : 'var(--tile)';
    resEl.innerHTML = `<div style="font-size:30px">${res === 'win' || res === 'forfeit' ? '🏆' : res === 'draw' ? '🤝' : res === 'cancel' ? '💨' : G.icon}</div><h2>${title}</h2><p>${esc(G.name)} · 对手 ${esc(D.oppName)}<br>${esc(why || '')}</p>` +
      (loot.length ? XParts.chips(loot) : '') + (note ? `<p style="margin-top:8px">${esc(note)}</p>` : '') +
      `<div class="hrow">${res !== 'cancel' && peer(D.opp) ? '<button type="button" class="btn" data-again>再来一局</button>' : ''}<button type="button" class="btn primary" data-ok>好</button></div>`;
    resEl.hidden = false; resEl._again = {uid:D.opp, g:D.g};
    clearTimeout(resEl._t); resEl._t = setTimeout(() => { resEl.hidden = true; }, 14000);
    S.lastDuel = D; S.duel = null; renderStat();
  }
  resEl.addEventListener('click', e => {
    ac();
    if (e.target.closest('[data-again]')){ const a = resEl._again, p = a && peer(a.uid); resEl.hidden = true; if (p && p.live) askDuel(p, a.g); else toast('他走了', '', 1400); }
    else if (e.target.closest('[data-ok]')) resEl.hidden = true;
    refocus();
  });

  /* ---------- presence 里多带的字段 ---------- */
  XNet.extra = () => {
    if (!S.on) return null;
    const o = {};
    if (S.fx && pnow() - S.fxAt < 8) o.fx = S.fx;
    if (S.ride){ o.ride = S.ride.uid; o.rs = S.ride.seat; }
    if (S.duel && S.duel.phase !== 'wait' && S.duel.phase !== 'done'){ o.duel = S.duel.opp; if (S.duel.g === 'stunt') o.ds = Math.min(1e7, Math.round(S.duel.myS)); }
    if (store.dnd) o.dnd = true;
    return o;
  };

  /* 这些人跑出附近几格也继续听他们的位置（js/net.js 只订阅附近的格子）：挑战对手、自己坐的车的司机、车上的乘客 */
  XNet.follow = () => {
    if (!S.on) return null;
    const o = [...S.pax.keys()];
    if (S.ride) o.push(S.ride.uid);
    if (S.duel && S.duel.opp) o.push(S.duel.opp);
    return o;
  };

  /* ---------- 接进游戏 ---------- */
  /* the player you can interact with: within 4 m, you on foot */
  function findTarget(){
    if (!S.on || mode !== 'naiwa' || driving || S.ride || gx.paused || indoorNow() || nw.state === 'fly' || (S.duel && S.duel.phase !== 'done')) return null;
    let best = null, bd = 4;
    for (const uid of XNet.peers().keys()){
      const p = peer(uid); if (!p || !p.live || !p.G || p.d.ride) continue;
      const d = distTo(p, nw.x, nw.z); if (d < bd){ bd = d; best = p; best.dist = d; }
    }
    if (best){ const nc = nearestCar(); if (nc && Math.hypot(nc.x - nw.x, nc.z - nw.z) - nc.T.L / 2 < best.dist) return null; }
    return best;
  }
  function socPrompt(){
    if (!S.on || TOUCH) return '';          // phones: the hint button, the 互动 button and the status bar say it; the prompt line would cover the buttons
    const D = S.duel;
    if (D && D.phase === 'run' && D.g === 'tag'){ if (pnow() < D.frozen) return '被抓了，等一下…'; return D.it === XNet.uid ? `你是鬼！碰到 ${D.oppName} 就换他当鬼（你跑得快一点）` : `别被 ${D.oppName} 碰到！`; }
    if (D && D.phase === 'run' && D.g === 'race') return `开到 ${D.target.name} 的金色光圈 · 指南针指着`;
    if (D && D.phase === 'run' && D.g === 'stunt') return '漂移、飞跃、撞树都算分，连起来翻倍';
    if (S.ride) return TOUCH ? `坐在 ${S.ride.name} 的车上 · 点「下车」下车` : `坐在 ${S.ride.name} 的车上 · F 下车 · Z 表情 · V 喊话`;
    if (!menuEl.hidden) return TOUCH ? '点一项 · 点「关」收起' : '按数字选一项 · X 关';
    if (S.target) return TOUCH ? `点「互动」和 ${S.target.name} 玩` : `F 和 ${S.target.name} 互动`;
    return '';
  }
  const _base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ _base.update(dt, px, pz); if (S.on){ duelTick(dt); paxTick(); } },
    prompt(){ return (S.duel && S.duel.phase === 'run' ? socPrompt() : '') || _base.prompt() || socPrompt(); },
    busy(){ return _base.busy() || !!(S.duel && S.duel.phase !== 'wait' && S.duel.phase !== 'done'); },
    extBusy(){ return _base.extBusy() || !!(S.duel && S.duel.phase !== 'done') || !!S.ride; },
    target(){
      const D = S.duel;
      if (D && D.phase !== 'done' && D.target) return {x:D.target.x, z:D.target.z, label:'🏁 ' + D.target.name};
      if (D && D.phase === 'run' && D.g === 'tag'){ const p = peer(D.opp); if (p && p.G) return {x:p.G.x, z:p.G.z, label:(D.it === XNet.uid ? '抓 ' : '躲开 ') + D.oppName}; }
      return _base.target();
    },
    mini(dot){
      _base.mini(dot);
      const D = S.duel; if (!D || D.phase === 'wait' || D.phase === 'done') return;
      if (D.target) dot(D.target.x, D.target.z, '#ffd24a', 10, {i:'🏁', t:D.target.name || '终点', s:'1v1', c:'main', p:0});
      const p = peer(D.opp); if (p && p.G) dot(p.G.x, p.G.z, D.g === 'tag' && D.it === D.opp ? '#e74c3c' : '#c46bff', 7);
    },
    leave(){ socLeave(); _base.leave(); },
    frame(dt, T){ if (_base.frame) _base.frame(dt, T); socFrame(dt, T); }
  });
  function socLeave(){
    if (S.duel) quitDuel();
    if (S.ride) endRide('', true);
    closeMenu(); closeSheet(); closeWheel(); closeCard();
  }
  /* every frame, any mode */
  function socFrame(dt){
    const on = S.on && mode === 'naiwa';
    if (actSoc.hidden !== !on) actSoc.hidden = !on;
    if (!S.on){ hintL.dead = true; return; }
    if (S.out && pnow() > S.out.exp){ toast(S.out.name + ' 没回应', '', 1600); S.out = null; renderStat(); }
    if (on) pumpCards(); else if (S.card){ S.queue.unshift(S.card); closeCard(); }
    if (!on){ closeMenu(); closeSheet(); closeWheel(); }
    watchFx(); placeBubbles(); if (attached.size) cleanRiders();
    S.target = on && !gx.paused ? findTarget() : null;
    const T = S.target;
    /* the 上车 button says 互动 while someone is in reach (it opens the same menu as F) */
    const fTxt = T && !driving ? '互动' : null;
    if (fTxt !== S.fTxt){ S.fTxt = fTxt; if (fTxt) actF.querySelector('b').textContent = fTxt; else updateActs(); }
    if (T){ const h = headOf(T.uid); if (h){ hintL.pos.set(h[0], h[1] - .7, h[2]); hintL.dead = false; } else hintL.dead = true; } else hintL.dead = true;
    if (S.menuFor){ const p = peer(S.menuFor); if (!p || !p.live || distTo(p, nw.x, nw.z) > 7 || driving || !on) closeMenu(); }
    /* the "it" marker in a game of tag */
    const D = S.duel;
    if (D && D.g === 'tag' && D.phase === 'run'){ const h = headOf(D.it); if (h){ itL.pos.set(h[0], h[1] - (D.it === XNet.uid ? .5 : -.3), h[2]); itL.dead = false; } } else itL.dead = true;
    if (!sheetEl.hidden) sheetEl.classList.toggle('cd', pnow() - S.fxAt < FX_CD);
    if (S.ride || S.pax.size || S.out || S.duel) renderStat(); else if (!statEl.hidden) renderStat();
    if (S.myFx){ S.myFx.t += dt; if (S.myFx.t > EMO_DUR){ S.myFx = null; restPose(NW); } }
  }
  /* ghosts: emote poses, then riders into their cars (js/net.js calls this after placing every ghost) */
  XNet.afterGhosts = dt => {
    if (!S.on) return;
    for (const [uid, f] of S.remFx){
      const r = XNet.peers().get(uid); f.t += dt;
      if (!r || !r.g || f.t > EMO_DUR){ if (r && r.g) restPose(r.g.n); S.remFx.delete(uid); continue; }
      if (!r.g.vis) continue;
      pose(r.g.n, f.id, f.t);
      if (r.g.lod === 'mid') continue;                                     // 中距离的简化影子不放表情粒子
      const G = r.g, w = G.socSeatW || [G.x, G.y, G.z]; fxParts(f.id, f.t, dt, w[0], w[1], w[2]);
    }
    placeRiders();
  };
  /* your own 奶娃: emote pose on top of the usual animation; riding instead of walking */
  { const orig = animNaiwa; animNaiwa = function(dt, T){ orig(dt, T); if (S.myFx && nw.state !== 'fly' && nw.state !== 'flop'){ pose(NW, S.myFx.id, S.myFx.t); if (nw.state === 'sit') NW.body.position.y -= NW_SIT_DROP; const p = myPos(); fxParts(S.myFx.id, S.myFx.t, dt, p.x, (driving ? driving.y : nw.y), p.z); } }; }
  { const orig = updateFoot; updateFoot = function(dt){
      if (S.ride) return rideFrame(dt);
      const D = S.duel;
      if (D && D.g === 'tag' && (D.phase === 'count' || pnow() < D.frozen)){ nw.spd = 0; nw.y = groundAt(nw.x, nw.z); return; }
      if (D && D.g === 'tag' && D.phase === 'run' && D.it === XNet.uid){    /* the chaser runs 18% faster, or nobody would ever be caught */
        const x0 = nw.x, z0 = nw.z; orig(dt);
        const dx = (nw.x - x0) * .18, dz = (nw.z - z0) * .18;
        if (!footBlocked(nw.x + dx, nw.z)) nw.x += dx; if (!footBlocked(nw.x, nw.z + dz)) nw.z += dz;
        return;
      }
      return orig(dt);
    }; }
  { const orig = footAction; footAction = function(k){
      if (S.ride) return;
      const before = nw.state; orig(k);
      if (S.on && (k === 'laugh' || k === 'pose') && nw.state === k && before !== k && pnow() - S.fxAt >= FX_CD){ S.fxAt = pnow(); S.fxSeq = (S.fxSeq + 1) % 10000; S.fx = 'e' + (k === 'laugh' ? 1 : 7) + '-' + S.fxSeq; showBubble(XNet.uid, 'e', k === 'laugh' ? 1 : 7); }
    }; }
  { const orig = updateActs; updateActs = function(){ orig(); if (S.ride){ actF.querySelector('b').textContent = '下车'; actQ.disabled = actSp.disabled = true; const aw = $('#act-w'); if (aw) aw.disabled = true; } else actSp.disabled = false; }; }
  if (typeof offerJob === 'function'){ const orig = offerJob; offerJob = function(a, b){ if (S.ride || (S.duel && S.duel.phase !== 'done')) return false; return orig(a, b); }; }
  /* F: invite card > getting off > the menu; capture phase, ahead of js/90-main.js */
  function onF(){
    if (S.card){ decide(true); return true; }
    if (pnow() - (S.cardGone || -9) < .7) return true;          // the card just timed out under your finger: don't jump out of the car
    if (S.ride){ endRide('', true); return true; }
    if (!menuEl.hidden){ closeMenu(); return true; }
    const D = S.duel;
    if (D && D.g === 'tag' && D.phase !== 'done' && !driving){ toast('抓人的时候不能上车', '', 1200); return true; }
    if (D && D.phase === 'count') return true;
    if (S.target){ openMenu(S.target); return true; }
    return false;
  }
  window.addEventListener('keydown', e => {
    if (!S.on || mode !== 'naiwa' || gx.paused || e.repeat || e.ctrlKey || e.metaKey || e.altKey || g(() => XMini.inside, false)) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || document.querySelector('dialog[open]')) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const digit = /^(Digit|Numpad)([0-9])$/.exec(e.code), n = digit ? +digit[2] : -1;
    if (!wheelEl.hidden){
      if (n >= 1 && n <= 8){ stop(); doEmote(n - 1); return; }
      if (e.code === 'KeyZ' || e.code === 'Escape'){ stop(); closeWheel(); return; }
    }
    if (!sheetEl.hidden){
      if (n >= 0){ stop(); doPhrase((n + 9) % 10); return; }
      if (e.code === 'KeyV' || e.code === 'Escape'){ stop(); closeSheet(); return; }
    }
    if (!menuEl.hidden){
      if (n >= 1 && menuEl._opts[n - 1]){ stop(); if (!menuEl._opts[n - 1].dis) pickMenu(menuEl._opts[n - 1].id); return; }
      if (e.code === 'KeyX' || e.code === 'Escape'){ stop(); closeMenu(); return; }
    }
    if (S.card && (e.code === 'KeyX' || e.code === 'Escape')){ stop(); decide(false); return; }
    if (S.card && e.code === 'Enter' && e.target.tagName !== 'BUTTON'){ stop(); decide(true); return; }
    if (e.code === 'KeyF' && !(typeof OFFER !== 'undefined' && OFFER.cur)){ if (onF()){ stop(); } return; }
    if (e.code === 'KeyZ'){ stop(); wheelEl.hidden ? openWheel() : closeWheel(); return; }
    if (e.code === 'KeyV'){ stop(); sheetEl.hidden ? openSheet() : closeSheet(); return; }
    if (S.ride && (e.code === 'KeyR' || e.code === 'KeyQ' || e.code === 'Space')) stop();   // sitting in someone's car: no jumping out of the seat
  }, true);
  /* the 上车 / 下车 button on a phone goes through the same F logic */
  actF.addEventListener('pointerdown', e => { if (S.on && mode === 'naiwa' && !gx.paused && !(typeof OFFER !== 'undefined' && OFFER.cur) && onF()){ e.stopImmediatePropagation(); e.preventDefault(); ac(); } }, true);
  window.addEventListener('pointerdown', e => {
    if (!wheelEl.hidden && !e.target.closest('#socWheel')) closeWheel();
    if (!sheetEl.hidden && !e.target.closest('#socSheet,#act-soc')) closeSheet();
  }, true);

  /* ---------- 开关：联机才有 ---------- */
  function setOn(v){
    if (v === S.on) return;
    S.on = v;
    if (v){ openInbox(); }
    else {
      closeInbox(); socLeave(); S.pax.clear(); S.queue = []; S.out = null; S.target = null; hintL.dead = true;
      for (const B of S.bubbles.values()) B.L.dead = true;
      actSoc.hidden = true; statEl.hidden = true;
    }
  }
  const check = () => setOn(!!(XNet.online && XNet.uid && !XNet.socialDenied && XNet.ref('social/' + XNet.uid)));
  XNet.ready.then(check); window.addEventListener('xnet', check);
  g(() => achAdd([['duel1', '当面单挑', '和别的玩家当面比一场并且赢了', 40]]));

  Object.assign(XSocial, {
    send, on, defineInvite, invite, answer, peer, emote:i => fxSend('e', i), say:i => fxSend('s', i),
    openMenu:uid => openMenu(peer(uid)), openSheet, openWheel, block:toggleBlock,
    blocked, addMenuItem, why:WHY,
    setDnd(v){ store.dnd = !!v; save(); },
    get target(){ return S.target ? S.target.uid : null; },
    _S:S
  });
})();
