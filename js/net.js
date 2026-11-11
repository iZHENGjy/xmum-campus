/* XMUM 校园漫游 · 联机与排行榜（Firebase Realtime Database + 匿名登录）
 *
 * 没有配置（window.XMUM_FIREBASE 为 null）时只定义一个离线的 XNet，不发任何网络请求。
 * 任何一步失败（CDN 被墙、没开匿名登录、规则拒绝……）都只 console.warn 一次，游戏照常单机玩。
 *
 * 对外接口（UI 按这个写）：
 *   XNet.online          boolean，已登录且数据库可用
 *   XNet.uid             匿名用户 id（离线时为 null）
 *   XNet.playersOnline   当前在线人数（含自己；离线时 0）
 *   XNet.top(board, n=10)    → Promise<[{name, value, ts}]>，最好的在前；离线返回 []
 *   XNet.submit(board, value) → Promise<boolean>，成绩比自己记录好才写入，写入成功为 true
 *   XNet.ready           Promise，联机初始化结束（成功或失败）后 resolve
 *   board: 'hole2'（黑洞 2.0 单局吞掉的 %）| 'hole'（旧版黑洞，只读保留）| 'stunt'（特技总分）| 'rich'（总资产 RM：现金 + 买过的东西，js/80-gta.js 的 netWorth()；以前只算现金，旧记录照常保留）
 *   XNet.miniTop(gameId, n=10)    → 同 top，读 B1 游戏厅某个小游戏的榜（js/91-arcade.js）
 *   XNet.miniSubmit(gameId, value) → 同 submit；gameId 要匹配 ^[a-z][a-z0-9_]{1,15}$，value 取整，0 到 1,000,000，越大越好
 *   XNet.account         {google:boolean, email, name}：是否已用 Google 登录
 *   XNet.signInGoogle()  → Promise<'linked'|'switched'>；游客身份直接升级成 Google 账号（uid 不变）；
 *                          这个 Google 账号以前在别的设备用过，就切换过去并拉取它的云存档（会刷新页面）
 *   XNet.signOut()       退出 Google，回到新的游客身份（会刷新页面）
 *   XNet.now()           服务器时间（ms，本机时钟 + 服务器时差；离线就是 Date.now()）
 *   XNet.peer(uid)       别的玩家现在在哪：{x, z, y, car:是否在开车, name, fresh:还在线}，没有这个人（或不在附近几格）为 null（车载电台 js/95-radio.js 用来算外放距离）
 *   XNet.fresh(r)        peers() 里的一条还算不算在线（新协议 75 秒、旧 /presence 6 秒没消息算掉线）
 *   XNet.proto           位置同步协议的纯函数（分格、编码、航位推算），test/net-traffic.html 用它模拟流量
 *   XNet.traffic         流量计 {rx, tx, rxN, txN}（网址加 ?netmeter 才统计，左下角显示每秒 KB）
 * 状态变化时会在 window 上派发 'xnet' 事件。
 *
 * 数据库路径：
 *   /pres/{格}/{uid} = {p, t, n, m, k?, c?, fx?, ride?, rs?, duel?, ds?, dnd?}   位置（新协议）：地图 100 米一格（格 = "列_行"，0–23，覆盖 ±1200 米），
 *                  只写自己所在的格、只订阅周围 3×3 格；p = "x,z,y,h,vx,vz,w"（0.1 米 / 0.01 弧度 / 0.1 米每秒 / 0.01 弧度每秒），
 *                  n 名字、m 模式（w 走路 / n 奶娃）、k 车型、c 颜色（默认黄色时不写）；只有 p 和变了的字段才 update。
 *                  只在走路/奶娃模式时存在；看开场画面、黑洞、俯瞰、后台时不写
 *   /on/{uid} = 服务器时间            在线人数：上线写一次、下线删掉（onDisconnect），只在有人进出时推送
 *   /presence/{uid} = {name, mode, x, z, y, h, car?, color, t}   旧协议：发布前的旧页面还在写；新页面只读（看得见旧页面的人，互动不找他们），
 *                  数据库还没发布新规则时新页面也退回这里写（和以前一样）。下个版本可以删掉
 *   /boards/{board}/{uid} = {name, value, ts}
 *   /mini/{gameId}/{uid} = {name, value, ts}   小游戏榜，每个小游戏一张，规则和 /boards 一样（名字必须是注册昵称，成绩只能变高）
 *   /saves/{uid} = {data, score, ts}   只有 Google 登录的人才有：本机所有 xmum-* 存档的 JSON，双向同步，进度多的一边为准
 *   /looks/{uid} = "pink,santa,melon,mblue,d_flames,tk0300…"   奶娃穿戴、自己车的喷漆和改装（js/88-wardrobe-ui.js 的 XWard.lookStr()，改装段由 js/93-tuning-ui.js 加上），
 *                  只在变化时写一次；单独一个节点，规则还没发布时写入失败也不影响 presence
 *   /radio/{uid} = {s, k, t, l}         车载电台外放：台号、曲目种子、这首开始的服务器时间、单曲循环；只在外放时存在（js/95-radio.js 读写，规则见 database.rules.json）
 *   /names/{昵称小写} = {uid, name, ts}  昵称先到先得，永久归主人：只有主人能改名放出或删掉（ts 是最近一次上线）
 *   /users/{uid} = {name, key}          自己现在注册的昵称；排行榜规则要求成绩上的名字和这里一致，防止冒充
 *   XNet.claimedName()   已注册的昵称（还没注册或离线时为 ''）
 *
 * 给玩家互动（js/96-social.js，接口写在 docs/social.md）用的几个钩子：
 *   XNet.extra = () => ({fx, ride, rs, duel, ds, dnd})   presence 里多带的字段（只认 SOCIAL_KEYS 里的，变了会马上同步）
 *   XNet.follow = () => [uid…]   这些人跑出附近几格也继续听（挑战对手、司机、乘客）
 *   XNet.peers()          Map uid -> {d:presence（旧格式展开）, seen, g:幽灵（没画出来时为 null）, oneWay:旧页面的人}，只读；只有附近几格的人
 *   XNet.ref(path)        数据库引用（离线时 null）
 *   XNet.afterGhosts(dt)  每帧所有幽灵摆好位置以后调一次，用来改姿势、把乘客放到车上
 */
'use strict';
(() => {
  const BOARDS = {hole2:{max:100, dp:1}, hole:{max:100, dp:1}, stunt:{max:1e7, dp:0}, rich:{max:1e7, dp:2}};
  const XNet = window.XNet = {
    online:false, uid:null, playersOnline:0, account:{google:false, email:null, name:null},
    top:async () => [], submit:async () => false, miniTop:async () => [], miniSubmit:async () => false,
    signInGoogle:async () => { throw new Error('联机未开启'); }, signOut:async () => {},
    now:() => Date.now(), peer:() => null, peers:() => new Map(), ref:() => null, fresh:() => false,
    ready:Promise.resolve(false)
  };

  /* ---------- 位置同步协议（纯函数；离线也定义，test/net-traffic.html 用同一套算流量） ----------
   * 地图按 100 米分格，/pres/{格}/{uid} 只写自己所在的格，只订阅视点所在格和周围 8 格（至少 100 米内的人一定看得到）。
   * p = "x,z,y,h,vx,vz,w"：坐标 0.1 米、朝向 0.01 弧度、速度 0.1 米/秒、转向速度 0.01 弧度/秒，都取整。
   * 发送端按「航位推算」决定发不发：接收端拿上一条的速度和转向往前推，推出来的位置和真实位置差得多了才发下一条。 */
  const PR = XNet.proto = (() => {
    const CELL = 100, ORG = -1200, NC = 24, MARGIN = 8;      // -1200…1200 米：校园加外面的 KIP、麦当当
    const wrap = a => { a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return isFinite(a) ? a : 0; };
    const ix = v => Math.max(0, Math.min(NC - 1, Math.floor(((+v || 0) - ORG) / CELL)));
    const key = (i, j) => i + '_' + j;
    const cellOf = (x, z) => key(ix(x), ix(z));
    const parse = k => { const m = /^(\d{1,2})_(\d{1,2})$/.exec(k || ''); return m && +m[1] < NC && +m[2] < NC ? [+m[1], +m[2]] : null; };
    /* 迟滞：越过格子边界 8 米才换格，免得在边上来回搬家 */
    function cellKeep(cur, x, z){
      const c = parse(cur);
      if (c){ const x0 = ORG + c[0] * CELL - MARGIN, z0 = ORG + c[1] * CELL - MARGIN, w = CELL + 2 * MARGIN; if (x >= x0 && x < x0 + w && z >= z0 && z < z0 + w) return cur; }
      return cellOf(x, z);
    }
    function around(k){
      const c = parse(k), out = []; if (!c) return out;
      for (let i = c[0] - 1; i <= c[0] + 1; i++) for (let j = c[1] - 1; j <= c[1] + 1; j++) if (i >= 0 && j >= 0 && i < NC && j < NC) out.push(key(i, j));
      return out;
    }
    const q = (v, s, lim) => { v = Math.round((+v || 0) * s); return Math.max(-lim, Math.min(lim, v)) || 0; };
    const encP = s => [q(s.x, 10, 12000), q(s.z, 10, 12000), q(s.y, 10, 7000), q(wrap(s.h), 100, 314), q(s.vx, 10, 999), q(s.vz, 10, 999), q(s.w, 100, 999)].join(',');
    const P_RE = /^-?[0-9]{1,5},-?[0-9]{1,5},-?[0-9]{1,4},-?[0-9]{1,3},-?[0-9]{1,3},-?[0-9]{1,3},-?[0-9]{1,3}$/;
    function decP(str){
      if (typeof str !== 'string' || !P_RE.test(str)) return null;
      const a = str.split(',').map(Number);
      return {x:a[0] / 10, z:a[1] / 10, y:a[2] / 10, h:a[3] / 100, vx:a[4] / 10, vz:a[5] / 10, w:a[6] / 100};
    }
    /* 往前推 tau 秒：速度方向跟着转向一起转（车转弯走圆弧），最多推 LIM.ext 秒（对方卡死了影子也不会一直跑） */
    function extrap(s, tau){
      tau = Math.max(0, Math.min(LIM.ext, tau || 0));
      const w = s.w || 0, th = w * tau;
      let S = tau, C = 0; if (Math.abs(th) > 1e-4){ S = Math.sin(th) / w; C = (1 - Math.cos(th)) / w; }
      return {x:s.x + (s.vx || 0) * S + (s.vz || 0) * C, z:s.z + (s.vz || 0) * S - (s.vx || 0) * C, y:s.y, h:wrap(s.h + th)};
    }
    /* 每 100 毫秒问一次要不要发。推算误差超过 err 米（或朝向超过 errH）才发，两条之间至少隔 gap 毫秒：
       走路最快约每秒 3 次、开车 3.3 次、开得快 4.5 次、挑战中 5 次；一停下马上发一条；
       还在动的话最多 3 秒补一条（接收端最多往前推 4 秒）；停着不动 30 秒一次心跳。
       附近（3×3 格里）超过 8 个人时精度按人数放宽，24 人放宽一倍，最多 2.5 倍 */
    const TUNE = {walk:{gap:330, err:.45, errH:.35}, car:{gap:300, err:.9, errH:.12}, fast:{gap:220, err:1.4, errH:.1}, duel:{gap:200, err:.3, errH:.2}};
    const LIM = {keep:3000, beat:30000, tbeat:15000, ext:4, crowd0:8, crowdK:16, crowdMax:2.5};
    function sender(){
      const S = {last:null, at:-1e9, tAt:-1e9, prev:null, vx:0, vz:0, w:0};
      S.reset = () => { S.last = null; S.at = S.tAt = -1e9; };
      /* s = {x, z, y, h, car}，t = 毫秒；算出速度和转向速度填进 s */
      S.sample = (s, t) => {
        const p = S.prev;
        if (p && t > p.t){
          const dt = (t - p.t) / 1000, k = Math.min(1, dt / .15);
          if (Math.hypot(s.x - p.x, s.z - p.z) > 40 || dt > 1){ S.vx = S.vz = S.w = 0; }
          else { S.vx += ((s.x - p.x) / dt - S.vx) * k; S.vz += ((s.z - p.z) / dt - S.vz) * k; S.w += (wrap(s.h - p.h) / dt - S.w) * k; }
        }
        S.prev = {x:s.x, z:s.z, h:s.h, t};
        const spd = Math.hypot(S.vx, S.vz);
        s.vx = spd < .3 ? 0 : S.vx; s.vz = spd < .3 ? 0 : S.vz;
        s.w = s.car && spd >= .3 && Math.abs(S.w) > .05 ? S.w : 0;    // 走路的人朝向说变就变，不推算转向
        return s;
      };
      /* 返回 'full'（还没发过）| 'pos' | 'beat'（只刷新时间）| null */
      S.decide = (s, t, metaChanged) => {
        const L = S.last, dt = t - S.at;
        if (!L) return 'full';
        if (metaChanged) return dt >= 100 ? 'pos' : null;
        const T = s.duel ? TUNE.duel : !s.car ? TUNE.walk : Math.hypot(s.vx, s.vz) > 18 ? TUNE.fast : TUNE.car;
        /* 附近人多时（流量 = 人数²），精度按人数放宽，最多放宽到 LIM.crowdMax 倍；挑战中不放宽 */
        const f = s.duel ? 1 : Math.min(LIM.crowdMax, Math.max(1, 1 + ((s.crowd || 0) - LIM.crowd0) / LIM.crowdK));
        const P = extrap(L, dt / 1000), e = Math.hypot(P.x - s.x, P.z - s.z) / f, eh = Math.abs(wrap(P.h - s.h)) / f, ey = Math.abs(s.y - L.y);
        const moving = !!(s.vx || s.vz || s.w), was = !!(L.vx || L.vz || L.w);
        if (e > 30) return 'pos';                                          // 瞬移
        if (was && !moving) return dt >= 100 ? 'pos' : null;               // 停下：马上说，免得影子继续往前滑
        if (dt >= T.gap * Math.min(f, 1.6) && (e > T.err || eh > T.errH || ey > .5)) return 'pos';
        if (moving && dt >= LIM.keep * f) return 'pos';
        if (t - S.tAt >= LIM.beat) return 'beat';
        return null;
      };
      S.sent = (s, t, pos, withT) => { if (pos){ S.last = decP(encP(s)); S.at = t; } if (withT) S.tAt = t; };
      S.needT = t => t - S.tAt >= LIM.tbeat;
      return S;
    }
    return {CELL, NC, wrap, cellOf, cellKeep, around, parse, encP, decP, extrap, sender, TUNE, LIM};
  })();

  /* ---------- 流量计：网址带 ?netmeter 或 localStorage「xmum-netmeter」=1 时，统计 WebSocket 收发的字节（真实 Firebase 也能量） ---------- */
  const TR = XNet.traffic = {rx:0, tx:0, rxN:0, txN:0, on:false};
  try { TR.on = /[?&]netmeter\b/.test(location.search) || localStorage.getItem('xmum-netmeter') === '1'; } catch(e){}
  if (TR.on && window.WebSocket && !window.WebSocket.xmMeter){
    const W = window.WebSocket, enc = window.TextEncoder ? new TextEncoder() : null;
    const size = d => typeof d === 'string' ? (enc ? enc.encode(d).length : d.length) : (d && (d.byteLength || d.size)) || 0;
    const XW = function(url, p){
      const ws = p === undefined ? new W(url) : new W(url, p);
      ws.addEventListener('message', e => { TR.rx += size(e.data); TR.rxN++; });
      const send = ws.send; ws.send = function(d){ TR.tx += size(d); TR.txN++; return send.call(this, d); };
      return ws;
    };
    XW.prototype = W.prototype; Object.assign(XW, {CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3, xmMeter:true});
    window.WebSocket = XW;
  }

  const cfg = window.XMUM_FIREBASE;
  if (!cfg || typeof cfg !== 'object') return;          // 单机模式：什么都不做

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const SEND_MS = 200, IDLE_HEARTBEAT = 2000, HIDDEN_HEARTBEAT = 4000;   // 旧协议（/presence）的节奏：只在退回旧协议时用
  const TICK = 100, STALE_GRID = 75000;                                   // 新协议：每 100 毫秒检查一次；心跳 30 秒，75 秒没消息算掉线（正常下线有 onDisconnect 马上删）
  const STALE_DRAW = 6000, STALE_COUNT = 15000, MAX_GHOSTS = 20, MAP = 1200, OLD_MAP = 700;   // 旧 /presence 的规则只认 ±700 米
  let db = null, me = null, warned = false, serverOffset = 0, connected = false;
  const SOCIAL_KEYS = ['fx', 'ride', 'rs', 'duel', 'ds', 'dnd'];   /* presence 里互动用的字段（js/96-social.js），规则在 database.rules.json */
  const best = {hole:-1, stunt:-1, rich:-1};            // 服务器上自己的最好成绩（-1 = 未知）
  const remotes = new Map();                            // uid -> {d, seen, g}
  const looks = new Map();                              // uid -> 穿戴字符串
  const emit = () => { try { window.dispatchEvent(new Event('xnet')); } catch(e){} };

  function fail(why, err){
    if (!warned){ warned = true; console.warn('[XNet] 联机不可用，继续单机：' + why, err || ''); }
    XNet.online = false; XNet.playersOnline = 0; connected = false;
    for (const uid of [...remotes.keys()]) dropRemote(uid);
    pill(); emit();
  }
  const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' 超时')), ms))]);
  function loadScript(src){
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('加载失败 ' + src)); document.head.appendChild(s);
    });
  }

  /* ---------- 名字 ---------- */
  function playerName(){
    if (XNet.online && claimed) return claimed;           // 联机时只用已注册的名字，别人冒充不了
    let n = '';
    try { if (window.XUI && typeof XUI.playerName === 'function') n = String(XUI.playerName() || ''); } catch(e){}
    if (!n) try { n = localStorage.getItem('xmum-name') || ''; } catch(e){}
    if (!n){
      try { n = localStorage.getItem('xmum-guest') || ''; } catch(e){}
      if (!n){ n = '游客' + String(1000 + Math.floor(Math.random() * 9000)); try { localStorage.setItem('xmum-guest', n); } catch(e){} }
    }
    n = n.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
    return [...n].slice(0, 16).join('').slice(0, 16) || '游客';
  }

  /* ---------- 昵称注册：先到先得 ---------- */
  const NAME_RE = /^[0-9A-Za-z一-龥 _·~!?-]{1,12}$/;
  const nameOk = n => NAME_RE.test(n) && n === n.trim() && !n.includes('  ');
  let claimed = '', claimedKey = '';
  XNet.claimedName = () => claimed;
  const hint = (t, tone) => g(() => XUI.setNameHint(t, tone));
  async function claimName(name){
    if (!nameOk(name)) return 'invalid';
    if (!XNet.online) return 'offline';
    const key = name.toLowerCase(), uid = XNet.uid;
    try {
      const cur = (await timeout(db.ref('names/' + key).once('value'), 10000, '读取昵称')).val();
      if (cur && cur.uid !== uid) return 'taken';
      const up = {};
      up['names/' + key] = {uid, name, ts:firebase.database.ServerValue.TIMESTAMP};
      up['users/' + uid] = {name, key};
      if (claimedKey && claimedKey !== key) up['names/' + claimedKey] = null;   // 改名：旧名字放出来
      await timeout(db.ref().update(up), 15000, '注册昵称');
      claimed = name; claimedKey = key; lastSent = null; emit();
      return 'ok';
    } catch(e){
      if (String(e && (e.code || e.message) || e).toUpperCase().includes('PERMISSION')) return 'taken';   // 刚好被别人抢先
      console.warn('[XNet] 昵称注册失败', e); return 'error';
    }
  }
  function useName(n){ try { localStorage.setItem('xmum-name', n); } catch(e){} g(() => XUI.setName(n)); }
  const numbered = (base, n) => (base || '游客').slice(0, 12 - String(n).length - 1).trim() + ' ' + n;
  const cleanName = n => String(n || '').replace(/[^0-9A-Za-z一-龥 _·~!?-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  /* 注册制之前已经有很多人重名（默认昵称只有 15 个）。按排行榜上最早一条成绩的时间排先后：
     最早的保留原名，后面的依次编为「名字 2」「名字 3」…；没有成绩记录的新玩家排在所有老玩家后面 */
  let legacy = null;
  async function legacyBoards(){
    if (legacy) return legacy;
    const m = new Map();                                    // uid -> {first, last, name}
    await Promise.all(Object.keys(BOARDS).map(async b => {
      try {
        const v = (await timeout(db.ref('boards/' + b).once('value'), 10000, '读取排行榜')).val() || {};
        for (const u in v){
          const r = v[u]; if (!r || typeof r.ts !== 'number') continue;
          const e = m.get(u) || {first:Infinity, last:-1, name:''};
          e.first = Math.min(e.first, r.ts); if (r.ts > e.last){ e.last = r.ts; e.name = String(r.name || ''); }
          m.set(u, e);
        }
      } catch(e){}
    }));
    return (legacy = m);
  }
  async function legacyRank(want){
    const key = want.toLowerCase(), m = await legacyBoards();
    const same = [...m.entries()].filter(([, e]) => cleanName(e.name).toLowerCase() === key)
      .sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1));
    const i = same.findIndex(([u]) => u === XNet.uid);
    return i < 0 ? same.length : i;
  }
  /* 排行榜上自己的旧成绩换成现在注册的名字（成绩本身不动） */
  async function fixBoardNames(){
    if (!claimed) return;
    const mini = g(() => [...new Set(XMini.games.map(x => x.id).concat(XMini.boards || []))].map(id => 'mini/' + id), []);   // 小游戏榜（包括宿舍搜刮）上的名字也一起换
    await Promise.all(Object.keys(BOARDS).map(b => 'boards/' + b).concat(mini).map(async path => {
      try {
        const ref = db.ref(path + '/' + XNet.uid), v = (await timeout(ref.once('value'), 10000, '读取成绩')).val();
        if (v && v.name !== claimed) await ref.update({name:claimed});
      } catch(e){}
    }));
  }
  /* 启动、改名、换账号后调用：把本机的昵称注册下来；被别人占了就保留自己原来的，或者自动加个编号 */
  async function settleName(fromUser){
    if (!XNet.online) return;
    if (!claimedKey){
      try { const mine = (await timeout(db.ref('users/' + XNet.uid).once('value'), 10000, '读取昵称')).val(); if (mine && mine.key){ claimed = mine.name; claimedKey = mine.key; } } catch(e){}
    }
    let want = ''; try { want = String(XUI.playerName() || localStorage.getItem('xmum-name') || ''); } catch(e){}
    if (want && want === claimed){
      db.ref('names/' + claimedKey + '/ts').set(firebase.database.ServerValue.TIMESTAMP).catch(() => {});   // 记一下最近上线时间（名字本身永久有效）
      if (fromUser) hint('名字已注册，只有你能用', 'ok');
      fixBoardNames();
      return;
    }
    if (!claimed && nameOk(want)){                          // 第一次注册：先看老玩家里有没有比你早用这个名字的
      const rank = await legacyRank(want);
      if (rank > 0){
        for (let n = rank + 1; n < rank + 40; n++){
          const cand = numbered(want, n), r2 = await claimName(cand);
          if (r2 === 'ok'){ useName(cand); hint(`「${want}」有更早的玩家在用，按先后给你编为「${cand}」。成绩和存档都还在，也可以在这里改名`, 'bad'); cloudPush(); fixBoardNames(); return; }
          if (r2 !== 'taken') return;
        }
      }
    }
    const r = await claimName(want);
    if (r === 'ok'){ if (fromUser) hint('名字已注册，只有你能用', 'ok'); cloudPush(); fixBoardNames(); return; }
    if (r === 'offline' || r === 'error'){ if (fromUser) hint('暂时连不上，名字还没注册，稍后会再试', 'warn'); return; }
    const why = r === 'taken' ? `「${want}」已经被别人注册了` : '名字只能用中文、字母、数字、空格和 _ - · ~ ! ?';
    if (claimed){ useName(claimed); hint(`${why}，继续用「${claimed}」`, 'bad'); return; }
    const base = nameOk(want) ? want : '游客';
    for (let n = 2; n < 60; n++){                            // 第一次上线就撞名：依次加编号
      const cand = numbered(base, n), r2 = await claimName(cand);
      if (r2 === 'ok'){ useName(cand); hint(`${why}，先给你用「${cand}」，可以在这里改`, 'bad'); cloudPush(); fixBoardNames(); return; }
      if (r2 !== 'taken') return;
    }
  }

  /* ---------- 在线人数 ---------- */
  function pill(){
    let el = document.getElementById('online');
    if (!el){
      if (!XNet.online) return;
      el = document.createElement('div'); el.id = 'online';
      el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:20;padding:3px 12px;border-radius:999px;background:rgba(20,28,36,.72);color:#fff;font:500 12px/1.6 system-ui,sans-serif;pointer-events:none';
      document.body.appendChild(el);
    }
    if (!XNet.online){ el.hidden = true; return; }
    el.textContent = '在线 ' + XNet.playersOnline + ' 人'; el.hidden = false;
  }
  /* 新协议：/on/{uid} 里的人（只在进出时各推一次）+ 还开着旧页面、在 /presence 里的人；退回旧协议时只数 /presence */
  function recount(){
    const now = Date.now() + serverOffset; let n = connected ? 1 : 0;
    const oldFresh = r => r.legacy && now - (r.d.t || 0) < STALE_COUNT;
    if (gridOK){
      for (const uid of onSet) if (uid !== XNet.uid) n++;
      for (const [uid, r] of remotes) if (uid !== XNet.uid && !onSet.has(uid) && oldFresh(r)) n++;
    } else for (const [uid, r] of remotes) if (uid !== XNet.uid && oldFresh(r)) n++;
    if (n !== XNet.playersOnline){ XNet.playersOnline = n; emit(); }
    pill();
  }

  /* ---------- 排行榜 ---------- */
  const clean = (board, v) => {
    const B = BOARDS[board]; if (!B) return NaN; v = +v; if (!isFinite(v)) return NaN;
    const k = Math.pow(10, B.dp); return Math.max(0, Math.min(B.max, Math.floor(v * k + 1e-6) / k));
  };
  XNet.top = async (board, n = 10) => {
    if (!BOARDS[board]) return [];
    await XNet.ready; if (!XNet.online) return [];
    n = Math.max(1, Math.min(100, n | 0 || 10));
    try {
      const snap = await timeout(db.ref('boards/' + board).orderByChild('value').limitToLast(n).once('value'), 10000, '读取排行榜');
      const out = [];
      snap.forEach(c => { const v = c.val() || {}; out.push({name:String(v.name || '?'), value:+v.value || 0, ts:+v.ts || 0, uid:c.key}); });
      return out.sort((a, b) => b.value - a.value || a.ts - b.ts);
    } catch(e){ console.warn('[XNet] 排行榜读取失败', e); return []; }
  };
  XNet.submit = async (board, value) => {
    const v = clean(board, value);
    if (!(v > 0)) return false;
    await XNet.ready; if (!XNet.online || !(v > best[board])) return false;
    const name = playerName(), uid = XNet.uid;
    try {
      const res = await timeout(db.ref('boards/' + board + '/' + uid).transaction(cur => {
        if (cur && typeof cur.value === 'number' && cur.value >= v) return;   // 已有更好的，放弃
        return {name, value:v, ts:Date.now()};
      }, undefined, false), 15000, '提交成绩');
      const now = res && res.snapshot && res.snapshot.val();
      if (now && typeof now.value === 'number') best[board] = Math.max(best[board], now.value);
      return !!(res && res.committed);
    } catch(e){ console.warn('[XNet] 成绩提交失败', board, e); return false; }
  };

  /* ---------- 小游戏榜：/mini/{gameId}/{uid}，小游戏结算时由 js/91-arcade.js 调用 ---------- */
  const MINI_ID = /^[a-z][a-z0-9_]{1,15}$/, MINI_MAX = 1e6, miniBest = {};
  XNet.miniTop = async (game, n = 10) => {
    if (!MINI_ID.test(String(game))) return [];
    await XNet.ready; if (!XNet.online) return [];
    n = Math.max(1, Math.min(100, n | 0 || 10));
    try {
      const snap = await timeout(db.ref('mini/' + game).orderByChild('value').limitToLast(n).once('value'), 10000, '读取排行榜');
      const out = [];
      snap.forEach(c => { const v = c.val() || {}; out.push({name:String(v.name || '?'), value:+v.value || 0, ts:+v.ts || 0, uid:c.key}); });
      return out.sort((a, b) => b.value - a.value || a.ts - b.ts);
    } catch(e){ console.warn('[XNet] 小游戏排行榜读取失败', game, e); return []; }
  };
  XNet.miniSubmit = async (game, value) => {
    const v = Math.max(0, Math.min(MINI_MAX, Math.floor(+value)));
    if (!MINI_ID.test(String(game)) || !(v > 0)) return false;
    await XNet.ready; if (!XNet.online || miniBest[game] >= v) return false;
    const name = playerName(), uid = XNet.uid;
    try {
      const res = await timeout(db.ref('mini/' + game + '/' + uid).transaction(cur => {
        if (cur && typeof cur.value === 'number' && cur.value >= v) return;   // 已有更好的，放弃
        return {name, value:v, ts:Date.now()};
      }, undefined, false), 15000, '提交成绩');
      const now = res && res.snapshot && res.snapshot.val();
      if (now && typeof now.value === 'number') miniBest[game] = Math.max(miniBest[game] || 0, now.value);
      return !!(res && res.committed);
    } catch(e){ console.warn('[XNet] 小游戏成绩提交失败', game, e); return false; }
  };

  /* ---------- 自动提交 ---------- */
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  let holeWasOn = false, lastAuto = -Infinity;
  function autoTick(force){
    if (!XNet.online) return;
    const on = g(() => HS.on, false);
    if (holeWasOn && !on && g(() => HS.t, 1) <= .01){       // 一局黑洞正常结束（时间到）
      const pct = g(() => hole.score / HS.total * 100, 0);
      if (pct > 0) XNet.submit('hole2', pct);              // 黑洞 2.0（有道具、连吞）单独一个榜，旧榜保留不动
    }
    holeWasOn = on;
    const t = performance.now();
    if (!force && t - lastAuto < 20000) return;
    const st = clean('stunt', g(() => stunt.total, 0)), rm = clean('rich', g(() => netWorth(), g(() => money, 0)));
    let sent = false;
    if (st > 0 && st > best.stunt){ XNet.submit('stunt', st); sent = true; }
    if (rm > 0 && rm > best.rich){ XNet.submit('rich', rm); sent = true; }
    if (sent || force) lastAuto = t;
  }

  /* ---------- 自己的位置 ---------- */
  const wrapA = PR.wrap;
  const clampM = v => (isFinite(v) ? Math.max(-MAP, Math.min(MAP, Math.round(v * 100) / 100)) : 0);
  const DEF_COLOR = '#f1c84b';
  function myState(){
    const m = g(() => mode, 'orbit');
    const s = {name:playerName(), mode:m, x:0, z:0, y:0, h:0, car:null, color:DEF_COLOR};
    if (m === 'naiwa'){
      const c = g(() => driving, null);
      if (c){ s.x = c.x; s.z = c.z; s.y = c.y || 0; s.h = c.h; s.car = c.kind; s.color = c.color0 || ('#' + c.paint.color.getHexString()); }
      else { const n = g(() => nw, null); if (n){ s.x = n.x; s.z = n.z; s.y = n.y || 0; s.h = n.h; } }
    } else if (m === 'walk'){
      const p = g(() => player, null);
      if (p){ s.x = p.x; s.z = p.z; s.y = g(() => groundAt(p.x, p.z), 0); s.h = p.yaw + Math.PI; }
    }
    s.x = clampM(s.x); s.z = clampM(s.z); s.y = clampM(s.y); s.h = Math.round(wrapA(s.h) * 1000) / 1000;
    if (!/^#[0-9a-fA-F]{6}$/.test(s.color)) s.color = DEF_COLOR;
    if (!s.car) delete s.car;
    const ex = typeof XNet.extra === 'function' && !XNet.socialDenied ? g(() => XNet.extra(), null) : null;
    if (ex && typeof ex === 'object') for (const k of SOCIAL_KEYS) if (ex[k] != null && ex[k] !== '' && ex[k] !== false) s[k] = ex[k];
    return s;
  }
  let lastSent = null, lastSentAt = 0, presRef = null, hiddenPage = false, lookRef = null, lastLook = null, onRef = null;
  const LOOK_RE = /^[a-z0-9_,]{0,120}$/;
  function sendLook(){
    const l = String(g(() => XWard.lookStr(), '') || '');
    if (l === lastLook || !LOOK_RE.test(l)) return;
    lastLook = l;
    lookRef.set(l || null).catch(() => {});             // 规则没发布时会被拒绝：只是别人看不到衣服
  }
  const isDenied = e => String(e && (e.code || e.message) || e).toUpperCase().includes('PERMISSION');
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  const liveMode = m => m === 'naiwa' || m === 'walk';
  const isTitle = () => g(() => titleOpen, false) === true;

  /* 旧协议：整条写进 /presence/{uid}，每秒最多 5 次。只在数据库还没发布新规则时用（和改版前一模一样，旧页面也看得见） */
  function sendLegacy(){
    if (!XNet.online || !connected || !presRef || hiddenPage || gridOK || quitting) return;
    const s = myState(), t = performance.now(), live = liveMode(s.mode);
    const changed = !lastSent || s.mode !== lastSent.mode || s.car !== lastSent.car || s.name !== lastSent.name || s.color !== lastSent.color
      || SOCIAL_KEYS.some(k => s[k] !== lastSent[k])
      || (live && (Math.abs(s.x - lastSent.x) + Math.abs(s.z - lastSent.z) + Math.abs(s.y - lastSent.y) > .05 || Math.abs(wrapA(s.h - lastSent.h)) > .02));
    if (!changed && t - lastSentAt < (live ? IDLE_HEARTBEAT : HIDDEN_HEARTBEAT)) return;
    lastSent = s; lastSentAt = t;
    const out = Object.assign({}, s, {t:TS()}), c7 = v => Math.max(-OLD_MAP, Math.min(OLD_MAP, v));
    out.x = c7(out.x); out.z = c7(out.z); out.y = c7(out.y);
    if (!live){ delete out.car; for (const k of SOCIAL_KEYS) if (k !== 'dnd') delete out[k]; }   // 其他模式只留心跳，别人不画
    presRef.set(out).catch(e => {
      if (!isDenied(e)) return;
      if (!XNet.socialDenied && SOCIAL_KEYS.some(k => k in out)){   // 规则还没发布互动字段：不带它们重来，互动功能关掉，联机照常
        XNet.socialDenied = true; lastSent = null; console.warn('[XNet] 数据库规则还不认识互动字段（需要重新发布 database.rules.json），先关掉玩家互动'); emit(); return;
      }
      fail('presence 写入被规则拒绝', e);
    });
  }

  /* 新协议：/pres/{格}/{uid} = {p, t, n, m, k?, c?, 互动字段…}
     位置 p 按航位推算发；名字 n、模式 m（w 走路 / n 奶娃）、车 k、颜色 c、互动字段只在变化时 update，别人只收到变了的那几个字段；
     t 是服务器时间，停着时 30 秒一次心跳，动着时 15 秒顺带一次。离开走路/奶娃模式就把自己从格子里删掉，只留在 /on 里算人数 */
  let gridOK = true, myCell = null, myMeta = null, viewCell = null, quitting = false;   // quitting：换账号、退出时已经下线，刷新前别再写回去
  const snd = PR.sender();
  const cellPath = c => 'pres/' + c + '/' + XNet.uid;
  function metaOf(s){
    const o = {n:s.name, m:s.mode === 'walk' ? 'w' : 'n'};
    if (s.car) o.k = s.car;
    if (s.color !== DEF_COLOR) o.c = s.color;
    for (const k of SOCIAL_KEYS) if (s[k] != null) o[k] = s[k];
    return o;
  }
  function metaDiff(a, b){                              // a 上次写的，b 现在的：要 update 的字段（没了的写 null），没变返回 null
    let out = null;
    for (const k in b) if (b[k] !== a[k]) (out = out || {})[k] = b[k];
    for (const k in a) if (!(k in b)) (out = out || {})[k] = null;
    return out;
  }
  function goLegacy(why, e){
    if (!gridOK) return;
    gridOK = false; myCell = null; myMeta = null; snd.reset();
    console.warn('[XNet] 数据库还没有新规则（/pres、/on，需要重新发布 database.rules.json），先用旧的 /presence 联机：' + why, e || '');
    syncSubs();
    if (connected && presRef) presRef.onDisconnect().remove().then(() => { lastSent = null; sendLegacy(); }).catch(err => fail('onDisconnect 失败', err));
    recount(); emit();
  }
  function leaveCell(){
    if (!myCell) return;
    const ref = db.ref(cellPath(myCell)); myCell = null; myMeta = null; snd.reset();
    ref.remove().catch(() => {}); ref.onDisconnect().cancel().catch(() => {});
  }
  /* 整条写：第一次、换格（旧格删掉、新格写入，一次原子更新）、条目被断线清掉以后 */
  function writeFull(cell, s, meta, t){
    const old = myCell, full = Object.assign({p:PR.encP(s), t:TS()}, meta), up = {};
    up[cellPath(cell)] = full; if (old && old !== cell) up[cellPath(old)] = null;
    myCell = cell; myMeta = meta; snd.sent(s, t, true, true);
    db.ref(cellPath(cell)).onDisconnect().remove().catch(() => {});
    db.ref().update(up).then(() => {
      if (old && old !== cell) db.ref(cellPath(old)).onDisconnect().cancel().catch(() => {});
    }, e => {
      if (!isDenied(e)) return;
      if (myCell === cell){ myCell = null; myMeta = null; snd.reset(); }
      if (!XNet.socialDenied && SOCIAL_KEYS.some(k => k in meta)){
        XNet.socialDenied = true; console.warn('[XNet] 数据库规则还不认识互动字段（需要重新发布 database.rules.json），先关掉玩家互动'); emit(); return;
      }
      goLegacy('写入 /pres 被拒绝', e);
    });
  }
  function gridTick(){
    if (!XNet.online || !connected || hiddenPage || !gridOK || !db || quitting) return;
    if (!liveMode(g(() => mode, 'orbit')) || isTitle()){ leaveCell(); return; }
    const t = performance.now(), s = snd.sample(myState(), t), meta = metaOf(s), cell = PR.cellKeep(myCell, s.x, s.z);
    let crowd = 0; for (const r of remotes.values()) if (r.cell && liveMode(r.d.mode) && fresh(r)) crowd++;
    s.crowd = crowd;
    if (cell !== myCell || !myMeta){ writeFull(cell, s, meta, t); return; }
    const diff = metaDiff(myMeta, meta), why = snd.decide(s, t, !!diff);
    if (!why) return;
    const up = diff || {};
    if (why !== 'beat') up.p = PR.encP(s);
    if (why === 'beat' || snd.needT(t)) up.t = TS();
    snd.sent(s, t, 'p' in up, 't' in up); myMeta = meta;
    db.ref(cellPath(myCell)).update(up).catch(e => { if (isDenied(e)){ myMeta = null; snd.reset(); } });   // 多半是自己的条目刚被断线清掉：下一轮整条重写
  }

  /* ---------- 只听附近的人：视点所在格 + 周围 8 格（挑战对手、司机、乘客所在的格也听着，跑远了也不断） ---------- */
  const subs = new Map();                               // 格 -> ref
  const pendingDrop = new Map();                        // uid -> 到点就删（换格时可能先收到旧格删除、再收到新格写入）
  const onSet = new Set();                              // /on 里的 uid：在线人数
  let legacyRef = null, onListen = null;
  function viewCenter(){
    if (!XNet.online || !connected || hiddenPage || isTitle()) return null;
    const m = g(() => mode, 'orbit');
    if (liveMode(m)){ if (myCell) return myCell; const s = myState(); return PR.cellOf(s.x, s.z); }
    if (m === 'orbit'){ const tg = g(() => controls.target, null); if (tg) return (viewCell = PR.cellKeep(viewCell, tg.x, tg.z)); }
    return null;                                        // 黑洞模式不画别人：什么都不订阅
  }
  function syncSubs(){
    const c = gridOK && db ? viewCenter() : null, want = new Set(c ? PR.around(c) : []);
    if (c && typeof XNet.follow === 'function'){
      const f = g(() => XNet.follow(), null);
      if (Array.isArray(f)) for (const u of f){ const r = remotes.get(u); if (r && r.cell) PR.around(r.cell).forEach(k => want.add(k)); }
    }
    for (const [k, ref] of subs) if (!want.has(k)){
      ref.off(); subs.delete(k);
      for (const [uid, r] of [...remotes]) if (r.cell === k) dropRemote(uid);
    }
    for (const k of want) if (!subs.has(k)){
      const ref = db.ref('pres/' + k), bad = e => goLegacy('读取 /pres 被拒绝', e);
      subs.set(k, ref);
      ref.on('child_added', s => onGrid(k, s, true), bad);
      ref.on('child_changed', s => onGrid(k, s, false), bad);
      ref.on('child_removed', s => onGridGone(k, s), bad);
    }
    /* 还开着旧页面的人（/presence）：看得见别人时才听；退回旧协议时一直听（人数靠它数） */
    const wantLegacy = !!db && XNet.online && !hiddenPage && (gridOK ? !!c : true);
    if (wantLegacy && !legacyRef){
      legacyRef = db.ref('presence');
      const denied = e => { if (!gridOK) fail('presence 读取被拒绝', e); };
      legacyRef.on('child_added', onLegacy, denied); legacyRef.on('child_changed', onLegacy, denied);
      legacyRef.on('child_removed', s => { const r = remotes.get(s.key); if (r && r.legacy){ dropRemote(s.key); recount(); } }, denied);
    } else if (!wantLegacy && legacyRef){
      legacyRef.off(); legacyRef = null;
      for (const [uid, r] of [...remotes]) if (r.legacy) dropRemote(uid);
      recount();
    }
    /* 在线人数：/on 只在有人进出时推一条 */
    const wantOn = !!db && XNet.online && !hiddenPage && gridOK;
    if (wantOn && !onListen){
      onListen = db.ref('on');
      onListen.on('child_added', s => { onSet.add(s.key); recount(); }, e => goLegacy('读取 /on 被拒绝', e));
      onListen.on('child_removed', s => {
        onSet.delete(s.key);
        if (s.key === XNet.uid && connected && !hiddenPage && gridOK && onRef) onRef.set(TS()).catch(() => {});   // 被断线清掉了：补回去
        recount();
      }, () => {});
    } else if (!wantOn && onListen){ onListen.off(); onListen = null; onSet.clear(); recount(); }
    const t = performance.now();
    for (const [uid, at] of pendingDrop) if (t >= at){ pendingDrop.delete(uid); const r = remotes.get(uid); if (r && !r.legacy && !r.cell) dropRemote(uid); }
  }

  /* ---------- 其他玩家（幽灵） ---------- */
  const sharedMats = new Set();
  g(() => [glassMat, tyreMat, headMat, tailMat, white].forEach(m => sharedMats.add(m)));
  function disposeObj(o){
    o.traverse(m => {
      if (m.geometry && !m.geometry.keep) m.geometry.dispose();
      if (m.material) [].concat(m.material).forEach(x => { if (!sharedMats.has(x) && !x.keep){ if (x.map && x.map.dispose && !x.map.keep) x.map.dispose(); x.dispose(); } });
    });
  }
  function makeGhost(r){
    const n = makeNaiwa(); n.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
    n.lookStr = '';
    scene.add(n.root);
    const L = addLabel(r.d.name || '?', 0, -999, 0, false);
    L.el.style.borderColor = r.d.color || ''; L.el.style.boxShadow = '0 0 0 2px ' + (r.d.color || '#f1c84b');
    L.el.setAttribute('data-net', '1');
    return {n, car:null, carKey:'', L, x:r.d.x, y:r.d.y, z:r.d.z, h:r.d.h, ox:0, oy:0, oz:0, oh:0, pv:-1, walkT:0, spd:0, vis:false};
  }
  function setGhostCar(G, kind, color){
    const key = kind ? kind + color + G.n.lookStr : '';
    if (key === G.carKey) return;
    if (G.car){ G.car.body.remove(G.n.root); scene.remove(G.car.root); disposeObj(G.car.root); G.car = null; }
    G.carKey = key;
    if (kind && g(() => CAR_T[kind], null)){
      const c = makeCar(kind, color, G.x, G.z, G.h);
      const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);    // 只是画面，不参与物理
      g(() => {                                                     // 自己的车的喷漆和贴花（look 里带着的话）
        const ids = G.n.lookStr.split(','), p = ids.find(x => WD_PAINT[x]), d = ids.find(x => /^d_/.test(x));
        if (p || d) carPaint(c, p || 'stock', d ? d.slice(2) : 'none', color);
        tnApply(c, tnFromToken(G.n.lookStr));                      // 改装件（js/42-tuning.js，look 里的 tk… 那一段）
      });
      c.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
      c.body.add(G.n.root); G.n.root.position.set(...c.T.seat); G.n.root.rotation.set(0, 0, 0);
      g(() => nwRingOn(c, G.n.shape));                              // 车顶的密封圈（js/40-vehicles.js）
      G.car = c;
    } else { scene.add(G.n.root); G.n.root.scale.setScalar(g(() => NAI_S, 1.3)); }
  }
  function hideGhost(G){
    if (!G.vis) return; G.vis = false;
    G.n.root.visible = false; if (G.car) G.car.root.visible = false; G.L.dead = true;
  }
  /* 穿戴：只听画面里这些人的 /looks/{uid}，不再监听整个 /looks */
  const lookSubs = new Map();                           // uid -> [ref, cb]
  function watchLook(uid){
    if (lookSubs.has(uid) || !db) return;
    const ref = db.ref('looks/' + uid), cb = s => { const v = s.val(); if (typeof v === 'string' && LOOK_RE.test(v)) looks.set(uid, v); else looks.delete(uid); };
    ref.on('value', cb, () => {}); lookSubs.set(uid, [ref, cb]);
  }
  function unwatchLook(uid){ const L = lookSubs.get(uid); if (L){ L[0].off('value', L[1]); lookSubs.delete(uid); } looks.delete(uid); }
  function dropRemote(uid){
    const r = remotes.get(uid); pendingDrop.delete(uid); unwatchLook(uid);
    if (!r) return; remotes.delete(uid);
    const G = r.g; if (!G) return;
    if (G.car){ scene.remove(G.car.root); disposeObj(G.car.root); } else scene.remove(G.n.root);
    disposeObj(G.n.root);
    G.L.dead = true; G.L.el.remove(); const i = labels.indexOf(G.L); if (i >= 0) labels.splice(i, 1);
  }
  /* remotes 里每个人：d（旧格式的展开：name, mode, x, z, y, h, car, color, t, 互动字段——js/96-social.js 读它），
     s（最近一条位置和速度），at（收到 s 的时间），pv（第几条位置），seen（最近收到消息的时间），cell（在哪个格；旧页面的人为 null），
     legacy（来自旧的 /presence），oneWay（他是旧页面、看不见我们：互动不找他） */
  function newRemote(uid){
    const r = {d:null, s:null, at:0, pv:0, seen:0, g:null, cell:null, legacy:false, oneWay:false, pstr:''};
    remotes.set(uid, r); watchLook(uid); return r;
  }
  const relabel = r => { if (r.g && r.g.L.el.textContent !== String(r.d.name || '?')) r.g.L.el.textContent = String(r.d.name || '?'); };
  function onGrid(cell, snap, added){
    const uid = snap.key, v = snap.val();
    if (uid === XNet.uid || !v || typeof v !== 'object') return;
    const P = PR.decP(v.p); if (!P) return;
    pendingDrop.delete(uid);
    const now = performance.now(); let r = remotes.get(uid);
    if (!r) r = newRemote(uid);
    r.legacy = false; r.oneWay = false; r.cell = cell;
    if (v.p !== r.pstr){ r.pstr = v.p; r.s = P; r.at = now; r.pv++; }
    const d = {name:String(v.n || '?').slice(0, 16), mode:v.m === 'w' ? 'walk' : 'naiwa', x:P.x, z:P.z, y:P.y, h:P.h,
      color:/^#[0-9a-fA-F]{6}$/.test(v.c) ? v.c : DEF_COLOR, t:+v.t || 0};
    if (typeof v.k === 'string' && v.k) d.car = v.k;
    for (const k of SOCIAL_KEYS) if (v[k] != null) d[k] = v[k];
    r.d = d;
    /* 刚订阅到的人：看他的 t 有多旧（心跳 30 秒一次）；之后每条消息都算「刚听到」 */
    r.seen = added && now - r.seen > 2000 ? now - Math.min(STALE_GRID, Math.max(0, Date.now() + serverOffset - d.t)) : now;
    relabel(r);
  }
  function onGridGone(cell, snap){
    const uid = snap.key;
    if (uid === XNet.uid){ if (cell === myCell){ myMeta = null; snd.reset(); } return; }   // 自己的条目被断线清掉了：下一轮整条重写
    const r = remotes.get(uid);
    if (r && !r.legacy && r.cell === cell){ r.cell = null; pendingDrop.set(uid, performance.now() + 500); }
  }
  function onLegacy(snap){
    const uid = snap.key, d = snap.val();
    if (uid === XNet.uid) return;
    let r = remotes.get(uid);
    if (r && !r.legacy) return;                         // 新协议里已经有他
    if (!d || typeof d !== 'object'){ if (r) dropRemote(uid); recount(); return; }
    if (!r){ r = newRemote(uid); r.legacy = true; }
    r.oneWay = gridOK;
    const age = Math.max(0, Date.now() + serverOffset - (+d.t || 0)), now = performance.now();
    r.d = d; r.seen = now - Math.min(age, 60000);
    r.s = {x:+d.x || 0, z:+d.z || 0, y:+d.y || 0, h:+d.h || 0, vx:0, vz:0, w:0}; r.at = now; r.pv++;
    relabel(r); recount();
  }
  const fresh = r => !!r && performance.now() - r.seen < (r.legacy ? STALE_DRAW : STALE_GRID);

  let lastFrame = performance.now(), sortT = 0, drawSet = new Set();
  function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!remotes.size) return;
    const m = g(() => mode, 'orbit'), showAll = m !== 'hole' && XNet.online;
    if (now - sortT > 500){                                 // 只画最近的 20 个
      sortT = now;
      const ref = g(() => (m === 'naiwa' ? (driving || nw) : m === 'walk' ? player : controls.target), {x:0, z:0});
      const list = [];
      for (const [uid, r] of remotes){
        const d = r.d;
        if (liveMode(d.mode) && fresh(r)) list.push([Math.hypot(d.x - ref.x, d.z - ref.z), uid]);
      }
      list.sort((a, b) => a[0] - b[0]); drawSet = new Set(list.slice(0, MAX_GHOSTS).map(e => e[1]));
    }
    for (const [uid, r] of remotes){
      const d = r.d, live = liveMode(d.mode) && fresh(r);
      if (!showAll || !live || !drawSet.has(uid)){ if (r.g) hideGhost(r.g); continue; }
      if (!r.g) r.g = makeGhost(r);
      const G = r.g, car = d.mode === 'naiwa' && d.car ? String(d.car) : null;
      const lk = looks.get(uid) || '';
      if (G.n.lookStr !== lk){ G.n.lookStr = lk; g(() => nwDress(G.n, wdLookParse(lk), {shadow:false})); }
      setGhostCar(G, car, /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#cccccc');
      /* 目标 = 最近一条往前推到现在；新的一条到了，画面上的位置不跳，差的那一点慢慢收掉 */
      const T = r.s ? PR.extrap(r.s, (now - r.at) / 1000) : {x:+d.x || 0, z:+d.z || 0, y:+d.y || 0, h:+d.h || 0};
      const px = G.x, pz = G.z;
      if (!G.vis){ G.ox = G.oy = G.oz = G.oh = 0; G.pv = r.pv; }
      else if (G.pv !== r.pv){
        G.pv = r.pv; G.ox = G.x - T.x; G.oy = G.y - T.y; G.oz = G.z - T.z; G.oh = wrapA(G.h - T.h);
        if (Math.hypot(G.ox, G.oz) > 40) G.ox = G.oy = G.oz = G.oh = 0;
      }
      const dec = Math.exp(-dt * (r.legacy ? 8 : 7));
      G.ox *= dec; G.oy *= dec; G.oz *= dec; G.oh *= dec;
      G.x = T.x + G.ox; G.y = T.y + G.oy; G.z = T.z + G.oz; G.h = wrapA(T.h + G.oh);
      G.spd += (Math.hypot(G.x - px, G.z - pz) / Math.max(dt, 1e-3) - G.spd) * Math.min(1, dt * 6);
      if (!G.vis){ G.vis = true; G.spd = 0; G.n.root.visible = true; if (G.car) G.car.root.visible = true; G.L.dead = false; }
      if (G.car){
        G.car.x = G.x; G.car.z = G.z; G.car.h = G.h;
        G.car.root.position.set(G.x, G.y, G.z); G.car.root.rotation.set(0, G.h, 0);
        const w = G.spd * dt / (G.car.T.r || .35); G.car.wheels.forEach(wh => { wh.rotation.x += w; });
        nwSitPose(G.n, G.car.T.bike);
        G.L.pos.set(G.x, G.y + G.car.T.H + 1.6, G.z);
      } else {
        G.n.root.position.set(G.x, G.y, G.z); G.n.root.rotation.y = G.h;
        const moving = G.spd > .4; if (moving) G.walkT += dt * Math.min(14, 4 + G.spd * 1.1);
        const sw = moving ? Math.sin(G.walkT) : 0, [aL, aR] = G.n.arms, [lL, lR] = G.n.legs;
        lL.rotation.set(sw * .55, 0, 0); lR.rotation.set(-sw * .55, 0, 0); aL.rotation.set(-.35 - sw * .4, 0, .1); aR.rotation.set(-.35 + sw * .4, 0, -.1);
        G.n.body.position.y = moving ? Math.abs(sw) * .05 : 0; G.n.body.rotation.set(0, 0, sw * .09);
        G.L.pos.set(G.x, G.y + 3.4, G.z);
      }
    }
    if (typeof XNet.afterGhosts === 'function') g(() => XNet.afterGhosts(dt, now));
  }

  /* ---------- 给别的模块看的：服务器时间和别人的位置（画出来的平滑位置优先） ---------- */
  XNet.now = () => Date.now() + serverOffset;
  XNet.peer = uid => {
    const r = remotes.get(uid); if (!r || !r.d) return null;
    const d = r.d, G = r.g, vis = !!(G && G.vis), T = !vis && r.s ? PR.extrap(r.s, (performance.now() - r.at) / 1000) : null;
    return {x:vis ? G.x : T ? T.x : +d.x || 0, z:vis ? G.z : T ? T.z : +d.z || 0, y:vis ? G.y : +d.y || 0, car:d.mode === 'naiwa' && !!d.car, name:String(d.name || '?'),
      fresh:liveMode(d.mode) && fresh(r)};
  };

  /* ---------- 流量计面板（只在打开流量计时显示） ---------- */
  function meterBox(){
    let el = document.getElementById('xnet-meter'), last = {rx:TR.rx, tx:TR.tx, t:performance.now()}, avg = 0;
    if (!el){
      el = document.createElement('div'); el.id = 'xnet-meter';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;padding:4px 8px;border-radius:6px;background:rgba(10,14,20,.78);color:#9fe;font:11px/1.45 ui-monospace,Consolas,monospace;pointer-events:none;white-space:pre';
      document.body.appendChild(el);
    }
    setInterval(() => {
      const t = performance.now(), s = Math.max(.001, (t - last.t) / 1000), rx = (TR.rx - last.rx) / s, tx = (TR.tx - last.tx) / s;
      avg = avg ? avg * .9 + rx * .1 : rx; last = {rx:TR.rx, tx:TR.tx, t};
      let vis = 0; for (const r of remotes.values()) if (r.g && r.g.vis) vis++;
      el.textContent = `↓ ${(rx / 1024).toFixed(2)} KB/s（平均 ${(avg / 1024).toFixed(2)}）  ↑ ${(tx / 1024).toFixed(2)} KB/s\n` +
        `累计 ↓ ${(TR.rx / 1024).toFixed(0)} KB ↑ ${(TR.tx / 1024).toFixed(0)} KB · ${gridOK ? '新协议 格 ' + (myCell || '-') + ' 订阅 ' + subs.size + ' 格' : '旧协议 /presence'}\n` +
        `听到 ${remotes.size} 人 画出 ${vis} 人 · 在线 ${XNet.playersOnline}`;
    }, 1000);
  }
  XNet.netInfo = () => ({gridOK, myCell, subs:[...subs.keys()], remotes:remotes.size, legacy:[...remotes.values()].filter(r => r.legacy).length, online:onSet.size, looks:lookSubs.size, traffic:Object.assign({}, TR)});

  /* ---------- 云存档（只给 Google 登录的人） ---------- */
  const SAVE_KEY = k => /^xmum-/.test(k) && k !== 'xmum-guest' && k !== 'xmum-restored';
  function localBlob(){
    const o = {};
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (SAVE_KEY(k)) o[k] = localStorage.getItem(k); } } catch(e){}
    return o;
  }
  function blobScore(o){                                  // 进度大致有多少：钱 + 车 + 特技 + 黑洞最好成绩
    let s = 0;
    try { const d = JSON.parse(o['xmum-gta-v1'] || 'null') || {}; s += (+d.money || 0) + (Array.isArray(d.owned) ? d.owned.length : 0) * 500 + (+d.stunt || 0) / 50; } catch(e){}
    try { s += +(JSON.parse(o['xmum-wardrobe-v1'] || 'null') || {}).spent || 0; } catch(e){}
    return s + (+o['xmum-hole2-best'] || 0) * 10 + (+o['xmum-hole-best'] || 0) * 10;
  }
  let lastPushed = '';
  async function cloudPush(){
    if (!XNet.online || !XNet.account.google) return;
    const o = localBlob(), str = JSON.stringify(o);
    if (str === lastPushed || str.length > 30000) return;
    try {
      await timeout(db.ref('saves/' + XNet.uid).set({data:str, score:Math.round(blobScore(o)), ts:firebase.database.ServerValue.TIMESTAMP}), 15000, '上传云存档');
      lastPushed = str;
    } catch(e){ console.warn('[XNet] 云存档上传失败', e); }
  }
  async function cloudSync(){                             // 返回 true 表示用云端进度覆盖了本机并刷新了页面
    if (!XNet.online || !XNet.account.google) return false;
    try {
      const v = (await timeout(db.ref('saves/' + XNet.uid).once('value'), 10000, '读取云存档')).val();
      if (v && typeof v.data === 'string'){
        let cloud = {}; try { cloud = JSON.parse(v.data) || {}; } catch(e){}
        /* 昵称跟着 Google 账号走：云端有昵称就用云端的（本机的可能只是这个网址上随机起的） */
        const cn = typeof cloud['xmum-name'] === 'string' ? cloud['xmum-name'] : '';
        if (cn && cn !== localStorage.getItem('xmum-name')){
          localStorage.setItem('xmum-name', cn); g(() => XUI.setName(cn)); lastSent = null;
          await settleName();
        }
        if (blobScore(cloud) > blobScore(localBlob()) + .5){
          for (const k of Object.keys(cloud)) if (SAVE_KEY(k) && typeof cloud[k] === 'string') localStorage.setItem(k, cloud[k]);
          try { sessionStorage.setItem('xmum-restored', '1'); } catch(e){}
          location.reload(); return true;
        }
      }
      await cloudPush();
    } catch(e){ console.warn('[XNet] 云存档同步失败', e); }
    return false;
  }
  function setAccount(u){
    const google = !!u && !u.isAnonymous && (u.providerData || []).some(p => p && p.providerId === 'google.com');
    const gp = google ? u.providerData.find(p => p.providerId === 'google.com') : null;
    XNet.account = {google, email:google ? (u.email || gp.email || null) : null, name:google ? (u.displayName || gp.displayName || null) : null};
  }

  /* ---------- Google 登录 ---------- */
  XNet.signInGoogle = async () => {
    await XNet.ready;
    if (!XNet.online) throw Object.assign(new Error('联机不可用'), {code:'xnet/offline'});
    const auth = firebase.auth(), prov = new firebase.auth.GoogleAuthProvider();
    prov.setCustomParameters({prompt:'select_account'});
    const cur = auth.currentUser;
    try {
      if (cur && cur.isAnonymous){
        const r = await cur.linkWithPopup(prov);         // 游客 → Google，uid 不变，排行榜记录跟着走
        await r.user.getIdToken(true); setAccount(r.user); emit();
        await cloudPush(); return 'linked';
      }
      const r = await auth.signInWithPopup(prov);
      setAccount(r.user); emit(); location.reload(); return 'switched';
    } catch(e){
      if (e && (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use')){
        /* 这个 Google 账号以前在别的设备上用过：切换过去，拉它的云存档 */
        const cred = e.credential || (firebase.auth.GoogleAuthProvider.credentialFromError && firebase.auth.GoogleAuthProvider.credentialFromError(e));
        if (!cred) throw e;
        await leaveAll();
        let r; try { r = await auth.signInWithCredential(cred); } catch(e2){ quitting = false; throw e2; }
        XNet.uid = r.user.uid; setAccount(r.user); emit();
        if (!(await cloudSync())) location.reload();
        return 'switched';
      }
      throw e;
    }
  };
  window.addEventListener('xmum-name', () => { if (XNet.online) settleName(true); else cloudPush(); });   // 改名：先注册，成功了再存云端
  XNet.signOut = async () => {
    if (!XNet.online) return;
    await cloudPush();
    await leaveAll();
    try { await firebase.auth().signOut(); } catch(e){ quitting = false; throw e; }
    location.reload();                                     // 刷新后自动成为新的游客
  };

  /* 下线：格子里的自己、/on、旧 /presence 都删掉（换账号、退出前） */
  async function leaveAll(){
    quitting = true;
    const ps = [];
    if (myCell && db){ const ref = db.ref(cellPath(myCell)); myCell = null; myMeta = null; snd.reset(); ps.push(ref.remove()); }
    if (onRef) ps.push(onRef.remove());
    if (presRef && !gridOK) ps.push(presRef.remove());
    await Promise.all(ps.map(p => p.catch(() => {})));
  }

  /* ---------- 启动 ---------- */
  async function start(){
    try {
      if (!(window.firebase && firebase.auth && firebase.database)){
        await timeout(loadScript(SDK + 'firebase-app-compat.js'), 20000, '加载 Firebase SDK');
        await timeout(Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-database-compat.js')]), 20000, '加载 Firebase SDK');
      }
      const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
      const auth = app.auth();
      me = await timeout(new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); }), 15000, '读取登录状态');
      if (!me){ const cred = await timeout(auth.signInAnonymously(), 15000, '匿名登录'); me = (cred && cred.user) || auth.currentUser; }
      if (!me) throw new Error('匿名登录没有返回用户');
      setAccount(me);
      XNet.uid = me.uid;
      db = app.database();
      /* 先读自己的最好成绩，顺便确认规则允许读写 */
      await timeout(Promise.all(Object.keys(BOARDS).map(b => db.ref('boards/' + b + '/' + me.uid).once('value').then(s => {
        const v = s.val(); best[b] = v && typeof v.value === 'number' ? v.value : 0;
      }))), 15000, '读取数据库');
      XNet.online = true;
      XNet.peers = () => remotes; XNet.now = () => Date.now() + serverOffset; XNet.fresh = fresh;
      XNet.ref = p => (XNet.online && db ? db.ref(p) : null);
      db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = +s.val() || 0; });
      await settleName();                                   // 先注册好昵称，再上线和交成绩
      presRef = db.ref('presence/' + me.uid); lookRef = db.ref('looks/' + me.uid); onRef = db.ref('on/' + me.uid);
      const joinOn = () => quitting ? null : onRef.onDisconnect().remove().then(() => onRef.set(TS())).catch(e => { if (isDenied(e)) goLegacy('写入 /on 被拒绝', e); });
      db.ref('.info/connected').on('value', s => {
        connected = !!s.val();
        if (connected){
          if (gridOK){
            myCell = null; myMeta = null; snd.reset();      // 断线时服务器已经删掉了旧条目：整条重写
            if (!hiddenPage) joinOn();
          } else presRef.onDisconnect().remove().then(() => { lastSent = null; sendLegacy(); }).catch(e => fail('onDisconnect 失败', e));
          lookRef.onDisconnect().remove().catch(() => {}); lastLook = null;
        }
        recount();
      });
      setInterval(() => { if (gridOK) gridTick(); syncSubs(); }, TICK);
      setInterval(() => { if (XNet.online && connected && !hiddenPage) sendLook(); sendLegacy(); }, SEND_MS);
      if (TR.on) meterBox();
      setInterval(() => { autoTick(false); recount(); }, 1000);
      setInterval(() => { const on = g(() => HS.on, false); if (on !== holeWasOn) autoTick(false); }, SEND_MS);
      const away = () => {
        if (!XNet.online) return;
        autoTick(true); cloudPush();
        hiddenPage = true;                                  // 后台：自己下线，也不再收别人的位置
        if (presRef && !gridOK) presRef.remove().catch(() => {}); lastSent = null;
        leaveCell(); if (onRef && gridOK) onRef.remove().catch(() => {});
        syncSubs();
        if (lookRef) lookRef.remove().catch(() => {}); lastLook = null;
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') away();
        else if (hiddenPage){ hiddenPage = false; if (gridOK){ if (connected) joinOn(); } else sendLegacy(); syncSubs(); }
      });
      window.addEventListener('pagehide', away);
      requestAnimationFrame(frame);
      recount(); emit();
      if (XNet.account.google){
        setInterval(cloudPush, 30000);
        cloudSync().then(reloaded => {
          let restored = false; try { restored = sessionStorage.getItem('xmum-restored') === '1'; sessionStorage.removeItem('xmum-restored'); } catch(e){}
          if (!reloaded && restored) g(() => toast('已从云端恢复进度', XNet.account.email || '', 2400));
        });
      }
      return true;
    } catch(e){
      fail(e && e.message || '初始化失败', e);
      return false;
    }
  }
  XNet.ready = start();
})();
