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
 *   XNet.sleeping        现在是不是断开着（后台 60 秒、开场画面 1 分钟没操作、满员排队）；XNet.seat() → {seat:'none'|'in'|'queue', maxOnline, lastCount}
 *   XNet.lod             影子分级显示的距离和封顶数（GHOST_CAP），调试用
 * 状态变化时会在 window 上派发 'xnet' 事件。
 *
 * 数据库路径：
 *   /pres/{格}/{uid} = {p, t, n, m, k?, c?, fx?, ride?, rs?, duel?, ds?, dnd?}   位置（新协议）：地图 100 米一格（格 = "列_行"，0–24，覆盖 -1200 ~ 1300 米），
 *                  只写自己所在的格、只订阅周围 3×3 格；p = "x,z,y,h,vx,vz,w"（0.1 米 / 0.01 弧度 / 0.1 米每秒 / 0.01 弧度每秒），
 *                  n 名字、m 模式（w 走路 / n 奶娃）、k 车型、c 颜色（默认黄色时不写）；只有 p 和变了的字段才 update。
 *                  只在走路/奶娃模式时存在；看开场画面、黑洞、俯瞰、后台时不写
 *   /on/{uid} = 服务器时间            在线人数：进了游戏（不在开场画面）才写，算一个座位；下线删掉（onDisconnect），只在有人进出时推送
 *   /config/maxOnline = 数字           在线人数上限（只读，在 Firebase 控制台改；没有就是 80）。满了的人单机玩、排队，见「在线人数上限」
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
    /* -1200…1300 米：校园加外面的 KIP、麦当当、汽车游乐园二园（地图南边到 z 1260）。以前是 24 格到 +1200；旧页面不认第 24 格，
       只是看不见站在 z / x 1200 以外的新页面玩家，不会出错 */
    const CELL = 100, ORG = -1200, NC = 25, MARGIN = 8;
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
    const encP = s => [q(s.x, 10, 13000), q(s.z, 10, 13000), q(s.y, 10, 7000), q(wrap(s.h), 100, 314), q(s.vx, 10, 999), q(s.vz, 10, 999), q(s.w, 100, 999)].join(',');
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
  const STALE_DRAW = 6000, STALE_COUNT = 15000, MAP = 1300, OLD_MAP = 700;   // 旧 /presence 的规则只认 ±700 米
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
    const key = name.toLowerCase(), uid = XNet.uid; borrowNet();
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
    const n = XNet.playersOnline, cap = gridOK ? maxOnline : 0;
    let t = '在线 ' + n + ' 人';
    if (cap && seat === 'queue') t = '满员排队 ' + n + '/' + cap;
    else if (cap && isTitle()){ t = '在线 ' + n + '/' + cap; if (n >= cap * .9) t += ' · 人多要排队'; }
    el.textContent = t; el.hidden = false;
  }
  /* 新协议：/on/{uid} 里的人（只在进出时各推一次）+ 还开着旧页面、在 /presence 里的人；退回旧协议时只数 /presence */
  function recount(){
    if (sleeping || (gridOK && seat === 'queue')){                                   // 断开、排队时显示上次的数
      if (seat === 'queue' && XNet.playersOnline !== lastCount){ XNet.playersOnline = lastCount; emit(); }
      pill(); return;
    }
    const now = Date.now() + serverOffset; let n = connected && (!gridOK || seat === 'in') ? 1 : 0;
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
    n = Math.max(1, Math.min(100, n | 0 || 10)); borrowNet();
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
    const name = playerName(), uid = XNet.uid; borrowNet();
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
    n = Math.max(1, Math.min(100, n | 0 || 10)); borrowNet();
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
    const name = playerName(), uid = XNet.uid; borrowNet();
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
    if (!XNet.online || (sleeping && sleepWhy !== 'queue')) return;   // 排队时成绩照常交（XNet.submit 会临时连上）
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
  /* inside a room built off the map (dorm, classroom, B1 arcade and its mini-games): you are not on the campus. Others must not see you there
     (everyone's dorm is laid out differently, so you would walk through their walls), and you do not need their positions either */
  const inRoom = () => g(() => indoorNow(), false) === true;

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
    if (!liveMode(g(() => mode, 'orbit')) || isTitle() || inRoom() || seat !== 'in'){ leaveCell(); return; }
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
    if (!XNet.online || !connected || hiddenPage || sleeping || isTitle() || inRoom() || seat !== 'in') return null;
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
    const wantLegacy = !!db && XNet.online && !hiddenPage && !sleeping && (gridOK ? !!c : true);
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
    const wantOn = !!db && XNet.online && !hiddenPage && !sleeping && gridOK;
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
  /* ---------- 影子分三级（LOD）：近处完整模型，中距离简化模型，远处只剩名字 ----------
     距离按镜头算：25 米内（走出去要到 30 米才换）用完整奶娃和车；150 米内（出去 160 米）用简化版：
     奶娃 3 个网格（身体 + 两条腿）、约 1,200–2,000 个三角形、顶点色、所有人共用一个材质，车是一个方盒子网格；再远只显示名字。
     数量按画质封顶（GHOST_CAP），从近到远排：完整模型最多 full 个，模型（完整 + 简化）最多 model 个，模型以外只剩名字的最多 label 个，再多的不画
     （名字标签是 DOM，每帧都要摆位置，总数压在 14 / 22 / 30 个以内）。
     挑战对手、自己坐的车的司机、自己车上的乘客（XNet.follow）至少画简化版。
     简化版照着同一个奶娃造型（js/30-naiwa.js 的 NW_PROFILE、nwShape）和这个人的装扮造：先在内存里搭一只完整的、穿好衣服的奶娃，
     皮肤、肚皮、手脚、眼睛的颜色取它的材质；衣服按离身体最近的布料涂到身体、胳膊、腿上；帽子、背包这类做成同样大小、同样颜色的小块。
     同一身装扮只造一次（liteCache）。完整模型、第一次见到的装扮都比较费时，每帧最多造一个，其余的先用名字或简化版顶着。 */
  const LOD_FULL = 25, LOD_FULL_OUT = 30, LOD_MID = 150, LOD_MID_OUT = 160;
  const GHOST_CAP = {low:{full:3, model:10, label:4}, mid:{full:5, model:16, label:6}, high:{full:8, model:24, label:6}};
  const LITE_MAT = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.66, metalness:0}); LITE_MAT.keep = true;
  const _lm = new THREE.Matrix4(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
  const avgCache = new Map();
  function avgOf(tex){                                   // 贴图的平均颜色（虹彩、星空、校徽这些皮肤）
    const img = tex && tex.image; if (!img) return null;
    if (avgCache.has(img)) return avgCache.get(img);
    let c = null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 8;
      const x = cv.getContext('2d'); x.drawImage(img, 0, 0, 8, 8);
      const px = x.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < px.length; i += 4){ r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
      const n = px.length / 4 * 255; c = new THREE.Color(r / n, gg / n, b / n);
      if (tex.encoding === THREE.sRGBEncoding) c.convertSRGBToLinear();
    } catch(e){}
    avgCache.set(img, c); return c;
  }
  function matCol(m){
    m = [].concat(m)[0];
    const c = m && m.color ? m.color.clone() : new THREE.Color('#cccccc'), a = m && avgOf(m.map);
    if (a) c.multiply(a);
    return c;
  }
  const paint = (geo, c) => {
    const n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++){ a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  /* 衣服的取样点：把每个布料三角形按 6 厘米撒点，放进 8.5 厘米的格子里，查「8.5 厘米内离这一点最近的布料是什么颜色」 */
  function clothSampler(meshes){
    const S = .085, R = .085, H = new Map();
    const key = (i, j, k) => ((i + 256) * 512 + (j + 256)) * 512 + (k + 256);
    const add = (x, y, z, c) => { const k = key(Math.floor(x / S), Math.floor(y / S), Math.floor(z / S)); let a = H.get(k); if (!a) H.set(k, a = []); a.push(x, y, z, c); };
    for (const M of meshes){
      const c = matCol(M.material), geo = M.geometry, p = geo && geo.attributes.position; if (!p) continue;
      const ix = geo.index, nt = Math.floor((ix ? ix.count : p.count) / 3); if (nt > 8000) continue;
      for (let t = 0; t < nt; t++){
        _va.fromBufferAttribute(p, ix ? ix.getX(t * 3) : t * 3).applyMatrix4(M.matrixWorld);
        _vb.fromBufferAttribute(p, ix ? ix.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(M.matrixWorld);
        _vc.fromBufferAttribute(p, ix ? ix.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(M.matrixWorld);
        const e = Math.max(_va.distanceTo(_vb), _vb.distanceTo(_vc), _vc.distanceTo(_va)), n = Math.max(1, Math.min(8, Math.ceil(e / .06)));
        for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++){
          const u = i / n, v = j / n, w = 1 - u - v;
          add(_va.x * w + _vb.x * u + _vc.x * v, _va.y * w + _vb.y * u + _vc.y * v, _va.z * w + _vb.z * u + _vc.z * v, c);
        }
      }
    }
    return (x, y, z) => {
      if (!H.size) return null;
      const cx = Math.floor(x / S), cy = Math.floor(y / S), cz = Math.floor(z / S); let best = R * R, out = null;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++){
        const a = H.get(key(cx + i, cy + j, cz + k)); if (!a) continue;
        for (let q = 0; q < a.length; q += 4){ const dx = a[q] - x, dy = a[q + 1] - y, dz = a[q + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < best){ best = d; out = a[q + 3]; } }
      }
      return out;
    };
  }
  /* 简化的一块：geo 在网格 M 自己的坐标里 → 搬到世界（内存里那只奶娃站在原点、不缩放）→ 按衣服涂色 → 搬到 frame（身体或腿）里 */
  function piece(geo, M, frame, col, cloth){
    geo.applyMatrix4(M.matrixWorld);
    if (col) paint(geo, col);
    if (cloth){                                           // 还没拆成三角形之前涂：共用的顶点只查一次
      const p = geo.attributes.position, c = geo.attributes.color;
      for (let i = 0; i < p.count; i++){ const k = cloth(p.getX(i), p.getY(i), p.getZ(i)); if (k) c.setXYZ(i, k.r, k.g, k.b); }
    }
    if (geo.index) geo = geo.toNonIndexed();
    return geo.applyMatrix4(_lm.copy(frame.matrixWorld).invert());
  }
  const liteCache = new Map();                          // 装扮字符串 -> {shape, s, legPos, body, legs, tris}
  const scratch = {};                                   // 每种身形一只内存里的奶娃，换衣服重复用（不放进场景）
  function liteGeo(lk){
    let L = liteCache.get(lk); if (L) return L;
    const look = g(() => wdLookParse(lk), null) || {}, shape = look.shape || 'std';
    const N = scratch[shape] || (scratch[shape] = makeNaiwa(shape));
    N.root.updateMatrixWorld(true);
    /* 第一遍只穿衣服（outfit）：取手脚颜色和布料；第二遍只穿配件：做成小块 */
    const only = keep => { const o = {}; for (const k in look) o[k] = (k === 'skin' || k === 'shape' || keep(k)) ? look[k] : null; return o; };
    g(() => nwDress(N, only(k => k === 'outfit'), {shadow:false})); N.root.updateMatrixWorld(true);
    const M = N.mats, skin = matCol(M.skin), belly = matCol(M.belly), hand = matCol(M.hand), foot = matCol(M.foot), iris = matCol(M.iris);
    const clothMeshes = []; for (const [, o] of N.worn || []) o.traverse(x => { if (x.isMesh && x.visible) clothMeshes.push(x); });
    const cloth = clothSampler(clothMeshes);
    const bodyParts = [], legParts = [[], []];
    /* 身子：同一条轮廓线，转 14 份、15 圈；肚皮那一块涂肚皮色 */
    const sk0 = N.skins[0];
    nwWith(N.shape, () => {
      const prof = NW_PROFILE.filter((p, i, a) => i % 4 === 0 || i === a.length - 1);
      const lg = new THREE.LatheGeometry(prof, 14), lp = lg.attributes.position, col = new Float32Array(lp.count * 3);
      for (let i = 0; i < lp.count; i++){
        const x = lp.getX(i) * nwW, y = lp.getY(i), z = lp.getZ(i) * nwW, th = Math.atan2(x, z), q = nwShape(x, y, z, Math.hypot(x, z));
        const c = Math.pow(th / 1.02, 2) + Math.pow((y - 1) / .305, 2) <= 1 ? belly : skin;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; lp.setXYZ(i, q[0], q[1], q[2]);
      }
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      smoothNormals(lg, 80);
      bodyParts.push(piece(lg, sk0, N.body, null, cloth));
    });
    /* 眼睛、胳膊、手（胳膊按休息姿势烤进身体里）、腿和脚 */
    for (const e of N.eyes || []){
      const ms = e.children.filter(x => x.isMesh);
      if (ms[0]) bodyParts.push(piece(geoAt(new THREE.SphereGeometry(.064, 6, 4), 0, 0, 0, 0, 0, 0, 1, 1, .62), ms[0], N.body, iris));
      if (ms[2]) bodyParts.push(piece(geoAt(new THREE.SphereGeometry(.033, 5, 3), 0, 0, 0, 0, 0, 0, 1, 1, .5), ms[2], N.body, new THREE.Color('#141210')));
    }
    for (let i = 0; i < 2; i++){
      const up = N.arms[i] && N.arms[i].children.find(x => x.isMesh), el = N.elbows && N.elbows[i];
      const em = el ? el.children.filter(x => x.isMesh) : [];
      if (up) bodyParts.push(piece(nwCapsule(.09, .078, .27, 8, 2), up, N.body, skin, cloth));
      if (em[0]) bodyParts.push(piece(nwCapsule(.078, .066, .22, 8, 2), em[0], N.body, skin, cloth));
      if (em[1]) bodyParts.push(piece(geoAt(new THREE.SphereGeometry(.074, 6, 4), 0, -.01, 0, 0, 0, 0, 1, .92, .72), em[1], N.body, hand));
      const lm = N.legs[i] ? N.legs[i].children.filter(x => x.isMesh) : [];
      if (lm[0]) legParts[i].push(piece(nwCapsule(.145, .112, .46, 8, 2), lm[0], N.legs[i], skin, cloth));
      if (lm[1]) legParts[i].push(piece(geoAt(new THREE.SphereGeometry(1, 8, 4), 0, -.56, .1, 0, 0, 0, .125, .062, .23), lm[1], N.legs[i], foot));
    }
    /* 配件：每个网格换成同样大小、同样颜色的小椭球（扁的用小方块），最多 16 块 */
    g(() => nwDress(N, only(k => k !== 'outfit'), {shadow:false})); N.root.updateMatrixWorld(true);
    const acc = [];
    for (const [, o] of N.worn || []) o.traverse(x => {
      if (!x.isMesh || !x.visible || !x.geometry || !x.geometry.attributes.position) return;
      if (!x.geometry.boundingBox) x.geometry.computeBoundingBox();
      const b = x.geometry.boundingBox, sz = b.getSize(new THREE.Vector3()), k = x.matrixWorld.getMaxScaleOnAxis();
      if (Math.max(sz.x, sz.y, sz.z) * k < .05) return;
      acc.push({x, b, sz, vol:sz.x * sz.y * sz.z * k * k * k});
    });
    acc.sort((a, b) => b.vol - a.vol);
    for (const a of acc.slice(0, 16)){
      const c = a.b.getCenter(new THREE.Vector3()), s = a.sz, flat = Math.min(s.x, s.y, s.z) < .3 * Math.max(s.x, s.y, s.z);
      const geo = flat ? new THREE.BoxGeometry(Math.max(s.x, .01), Math.max(s.y, .01), Math.max(s.z, .01)) : geoAt(new THREE.SphereGeometry(.5, 6, 4), 0, 0, 0, 0, 0, 0, s.x, s.y, s.z);
      geo.translate(c.x, c.y, c.z);
      let leg = -1; for (let p = a.x.parent; p; p = p.parent){ const i = N.legs.indexOf(p); if (i >= 0){ leg = i; break; } }
      (leg >= 0 ? legParts[leg] : bodyParts).push(piece(geo, a.x, leg >= 0 ? N.legs[leg] : N.body, matCol(a.x.material)));
    }
    const merge = list => { const m = geoMerge(list); m.computeBoundingSphere(); m.keep = true; return m; };
    L = {shape:N.shape, s:N.body.scale.x, legPos:N.legs.map(l => l.position.clone()), body:merge(bodyParts), legs:legParts.map(merge)};
    L.tris = (L.body.attributes.position.count + L.legs[0].attributes.position.count + L.legs[1].attributes.position.count) / 3;
    g(() => nwDress(N, {skin:'classic', shape}, {shadow:false}));     // 脱掉，配件的网格和材质由 nwDress 释放
    liteCache.set(lk, L);
    return L;
  }
  function liteNaiwa(lk){
    const L = liteGeo(lk), root = new THREE.Group(), body = new THREE.Group();
    root.add(body); root.scale.setScalar(g(() => NAI_S, 1.3)); body.scale.setScalar(L.s);
    const bm = new THREE.Mesh(L.body, LITE_MAT); bm.castShadow = false; body.add(bm);
    const legs = L.legs.map((geo, i) => { const l = new THREE.Group(); l.position.copy(L.legPos[i]); const m = new THREE.Mesh(geo, LITE_MAT); m.castShadow = false; l.add(m); body.add(l); return l; });
    /* 胳膊已经烤在身体里了：给 js/96-social.js 的表情姿势留两个空的组，摆了也不出错 */
    const arms = [new THREE.Group(), new THREE.Group()], elbows = [new THREE.Group(), new THREE.Group()];
    arms.forEach((a, i) => { body.add(a); a.add(elbows[i]); });
    return {root, body, arms, elbows, legs, lite:true, shape:L.shape};
  }
  /* 简化的车：车身、车窗、车顶、四个轮子，一个网格（按 CAR_T 的长宽高），同一车型同一颜色共用 */
  const liteCarCache = new Map();
  function liteCar(kind, color){
    const T = g(() => CAR_T[kind], null); if (!T) return null;
    const key = kind + color; let geo = liteCarCache.get(key);
    if (!geo){
      const P = new THREE.Color(color), Gl = new THREE.Color('#2b3440'), K = new THREE.Color('#1b1b1d'), parts = [];
      const box = (w, h, l, x, y, z, c) => parts.push(paint(new THREE.BoxGeometry(w, h, l).toNonIndexed().translate(x, y, z), c));
      const W = T.W, H = T.H, Lg = T.L, r = T.r || .35, low = r * .8, top = Math.max(H * .55, r * 2.1);
      box(T.bike ? W * .45 : W, top - low, Lg, 0, (top + low) / 2, 0, P);
      if (!T.bike && H > top + .15){ box(W * .86, H - top - .07, Lg * .5, 0, (H + top - .07) / 2, -Lg * .04, Gl); box(W * .88, .07, Lg * .52, 0, H - .035, -Lg * .04, P); }
      for (const sz of [1, -1]) for (const sx of T.bike ? [0] : [-1, 1]) box(.26, r * 2, r * 2, sx * (W / 2 - .08), r, sz * (T.wb || Lg * .6) / 2, K);
      geo = geoMerge(parts); geo.computeBoundingSphere(); geo.keep = true; liteCarCache.set(key, geo);
    }
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.rotation.order = 'YXZ';
    const m = new THREE.Mesh(geo, LITE_MAT); m.castShadow = false; body.add(m); scene.add(root);
    return {kind, T, root, body, wheels:[], lite:true};
  }
  XNet.lod = {LOD_FULL, LOD_FULL_OUT, LOD_MID, LOD_MID_OUT, GHOST_CAP, liteNaiwa, liteCar, liteGeo};   // 调试：比对简化版和完整版
  function makeGhost(r){
    const L = addLabel(r.d.name || '?', 0, -999, 0, false);
    L.el.style.borderColor = r.d.color || ''; L.el.style.boxShadow = '0 0 0 2px ' + (r.d.color || '#f1c84b');
    L.el.setAttribute('data-net', '1');
    /* n / car：现在的模型（远处为 null）；lod：'full' | 'mid' | 'far'；on：在画（至少有名字）；vis：模型在画（js/96-social.js 看这个） */
    return {n:null, car:null, carKey:'', lod:'', lk:null, L, x:r.d.x, y:r.d.y, z:r.d.z, h:r.d.h, ox:0, oy:0, oz:0, oh:0, pv:-1, walkT:0, spd:0, vis:false, on:false, hidAt:0};
  }
  /* 拆掉现在的模型：完整的要释放；简化的几何体和材质是共用的，只拿掉 */
  function dropModel(G){
    if (G.n){ const root = G.n.root; if (root.parent) root.parent.remove(root); if (!G.n.lite) disposeObj(root); G.n = null; }
    if (G.car){ if (G.car.root.parent) G.car.root.parent.remove(G.car.root); if (!G.car.lite) disposeObj(G.car.root); G.car = null; }
    G.carKey = ''; G.lk = null; G.vis = false;
  }
  /* 换到要的那一级。budget.n：这一帧还能造几个费时的（完整模型、没见过的装扮） */
  function ensureModel(G, uid, want, budget){
    const lk = looks.get(uid) || '';
    if (want === 'far'){ if (G.n || G.car) dropModel(G); G.lod = 'far'; return; }
    if (G.lod === want && G.n && G.lk === lk) return;
    if (G.lod === 'full' && want === 'full' && G.n && !G.n.lite){        // 只是换了衣服：原地重穿
      G.lk = lk; G.carKey = ''; g(() => nwDress(G.n, wdLookParse(lk), {shadow:false})); return;
    }
    const heavy = want === 'full' || !liteCache.has(lk);
    if (heavy && budget.n <= 0){
      if (G.n) return;                                                    // 先用现在的模型顶着，下一帧再换
      if (want === 'full' && liteCache.has(lk)) want = 'mid'; else { G.lod = 'far'; return; }
    } else if (heavy) budget.n--;
    dropModel(G); G.lod = want; G.lk = lk;
    if (want === 'full'){
      G.n = makeNaiwa(); G.n.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
      g(() => nwDress(G.n, wdLookParse(lk), {shadow:false}));
    } else G.n = liteNaiwa(lk);
    scene.add(G.n.root);
  }
  function setGhostCar(G, kind, color){
    const key = kind ? G.lod + kind + color + G.lk : '';
    if (key === G.carKey) return;
    if (G.car){ if (G.n.root.parent === G.car.body) G.car.body.remove(G.n.root); if (G.car.root.parent) G.car.root.parent.remove(G.car.root); if (!G.car.lite) disposeObj(G.car.root); G.car = null; }
    G.carKey = key;
    if (kind && g(() => CAR_T[kind], null)){
      let c;
      if (G.lod === 'full'){
        c = makeCar(kind, color, G.x, G.z, G.h);
        const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);    // 只是画面，不参与物理
        g(() => {                                                     // 自己的车的喷漆和贴花（look 里带着的话）
          const ids = (G.lk || '').split(','), p = ids.find(x => WD_PAINT[x]), d = ids.find(x => /^d_/.test(x));
          if (p || d) carPaint(c, p || 'stock', d ? d.slice(2) : 'none', color);
          tnApply(c, tnFromToken(G.lk || ''));                       // 改装件（js/42-tuning.js，look 里的 tk… 那一段）
        });
        c.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
        g(() => nwRingOn(c, G.n.shape));                              // 车顶的密封圈（js/40-vehicles.js）
      } else c = liteCar(kind, color);
      if (!c) return;
      if (G.n.root.parent) G.n.root.parent.remove(G.n.root);
      c.body.add(G.n.root); G.n.root.position.set(...c.T.seat); G.n.root.rotation.set(0, 0, 0);
      G.car = c;
    } else { if (G.n.root.parent !== scene) scene.add(G.n.root); G.n.root.scale.setScalar(g(() => NAI_S, 1.3)); }
  }
  function hideGhost(G){
    if (!G.on && !G.vis) return;
    G.on = G.vis = false; G.hidAt = performance.now();
    if (G.n) G.n.root.visible = false; if (G.car) G.car.root.visible = false; G.L.dead = true;
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
    dropModel(G);
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

  let lastFrame = performance.now(), sortT = 0, wantLod = new Map();
  /* 快走进中距离的人：趁浏览器空闲先把他那身装扮的简化版造好，到时候就不用在一帧里现造 */
  const preQ = [];
  let preBusy = false;
  function prebuild(lk){
    if (lk != null && !liteCache.has(lk) && !preQ.includes(lk)) preQ.push(lk);
    if (preBusy || !preQ.length) return;
    preBusy = true;
    const idle = window.requestIdleCallback ? f => requestIdleCallback(f, {timeout:600}) : f => setTimeout(f, 60);
    idle(() => { preBusy = false; const k = preQ.shift(); if (k != null && !liteCache.has(k)) g(() => liteGeo(k)); prebuild(); });
  }
  /* 每 0.4 秒按离镜头的远近排一次，定每个人画哪一级（见上面 GHOST_CAP） */
  function pickLods(){
    const cam = g(() => camera.position, null) || {x:0, y:0, z:0}, cap = GHOST_CAP[g(() => XQ.level, 'mid')] || GHOST_CAP.mid;
    const keep = new Set(typeof XNet.follow === 'function' ? (g(() => XNet.follow(), null) || []) : []);
    for (const [uid, r] of remotes) if (r.d && r.d.ride === XNet.uid) keep.add(uid);      // 坐我车的人
    const list = [];
    for (const [uid, r] of remotes){
      const d = r.d; if (!liveMode(d.mode) || !fresh(r)) continue;
      const G = r.g, x = G && G.on ? G.x : +d.x || 0, y = G && G.on ? G.y : +d.y || 0, z = G && G.on ? G.z : +d.z || 0;
      list.push([Math.hypot(x - cam.x, y - cam.y, z - cam.z), uid]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const out = new Map(); let nf = 0, nm = 0, nl = 0;
    for (const [dist, uid] of list){
      if (dist < LOD_MID + 80) prebuild(looks.get(uid) || '');
      const cur = remotes.get(uid).g ? remotes.get(uid).g.lod : '', k = keep.has(uid);
      let lod = dist < (cur === 'full' ? LOD_FULL_OUT : LOD_FULL) ? 'full' : dist < (cur === 'full' || cur === 'mid' ? LOD_MID_OUT : LOD_MID) ? 'mid' : 'far';
      if (k && lod === 'far') lod = 'mid';
      if (lod === 'full' && nf >= cap.full) lod = 'mid';
      if (lod !== 'far' && nm >= cap.model && !k) lod = 'far';
      if (lod === 'far' && nl >= cap.label) continue;
      if (lod === 'full') nf++;
      if (lod === 'far') nl++; else nm++;
      out.set(uid, lod);
    }
    wantLod = out;
  }
  function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!remotes.size) return;
    const m = g(() => mode, 'orbit'), showAll = m !== 'hole' && XNet.online;
    if (now - sortT > 400){ sortT = now; pickLods(); }
    const budget = {n:1};
    for (const [uid, r] of remotes){
      const d = r.d, lod = showAll && liveMode(d.mode) && fresh(r) ? wantLod.get(uid) : null;
      if (!lod){
        if (r.g){ hideGhost(r.g); if (r.g.n && !r.g.n.lite && now - r.g.hidAt > 15000) dropModel(r.g); }   // 藏了很久的完整模型放掉
        continue;
      }
      if (!r.g) r.g = makeGhost(r);
      const G = r.g, car = d.mode === 'naiwa' && d.car ? String(d.car) : null;
      ensureModel(G, uid, lod, budget);
      if (G.n) setGhostCar(G, car, /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#cccccc');
      /* 目标 = 最近一条往前推到现在；新的一条到了，画面上的位置不跳，差的那一点慢慢收掉 */
      const T = r.s ? PR.extrap(r.s, (now - r.at) / 1000) : {x:+d.x || 0, z:+d.z || 0, y:+d.y || 0, h:+d.h || 0};
      const px = G.x, pz = G.z;
      if (!G.on){ G.ox = G.oy = G.oz = G.oh = 0; G.pv = r.pv; }
      else if (G.pv !== r.pv){
        G.pv = r.pv; G.ox = G.x - T.x; G.oy = G.y - T.y; G.oz = G.z - T.z; G.oh = wrapA(G.h - T.h);
        if (Math.hypot(G.ox, G.oz) > 40) G.ox = G.oy = G.oz = G.oh = 0;
      }
      const dec = Math.exp(-dt * (r.legacy ? 8 : 7));
      G.ox *= dec; G.oy *= dec; G.oz *= dec; G.oh *= dec;
      G.x = T.x + G.ox; G.y = T.y + G.oy; G.z = T.z + G.oz; G.h = wrapA(T.h + G.oh);
      G.spd += (Math.hypot(G.x - px, G.z - pz) / Math.max(dt, 1e-3) - G.spd) * Math.min(1, dt * 6);
      if (!G.on){ G.on = true; G.spd = 0; G.L.dead = false; }
      G.vis = !!G.n;
      if (G.n){ G.n.root.visible = true; if (G.car) G.car.root.visible = true; }
      const CT = car ? g(() => CAR_T[car], null) : null;
      if (G.car){
        G.car.x = G.x; G.car.z = G.z; G.car.h = G.h;
        G.car.root.position.set(G.x, G.y, G.z); G.car.root.rotation.set(0, G.h, 0);
        const w = G.spd * dt / (G.car.T.r || .35); G.car.wheels.forEach(wh => { wh.rotation.x += w; });
        nwSitPose(G.n, G.car.T.bike);
      } else if (G.n){
        G.n.root.position.set(G.x, G.y, G.z); G.n.root.rotation.y = G.h;
        const moving = G.spd > .4; if (moving) G.walkT += dt * Math.min(14, 4 + G.spd * 1.1);
        const sw = moving ? Math.sin(G.walkT) : 0, [aL, aR] = G.n.arms, [lL, lR] = G.n.legs;
        lL.rotation.set(sw * .55, 0, 0); lR.rotation.set(-sw * .55, 0, 0); aL.rotation.set(-.35 - sw * .4, 0, .1); aR.rotation.set(-.35 + sw * .4, 0, -.1);
        G.n.body.position.y = moving ? Math.abs(sw) * .05 : 0; G.n.body.rotation.set(0, 0, sw * .09);
      }
      G.L.pos.set(G.x, G.y + (CT ? CT.H + 1.6 : 3.4), G.z);
    }
    if (typeof XNet.afterGhosts === 'function') g(() => XNet.afterGhosts(dt, now));
  }

  /* ---------- 给别的模块看的：服务器时间和别人的位置（画出来的平滑位置优先） ---------- */
  XNet.now = () => Date.now() + serverOffset;
  XNet.peer = uid => {
    const r = remotes.get(uid); if (!r || !r.d) return null;
    const d = r.d, G = r.g, vis = !!(G && G.on), T = !vis && r.s ? PR.extrap(r.s, (performance.now() - r.at) / 1000) : null;
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
      let vis = 0, lite = 0; for (const r of remotes.values()) if (r.g && r.g.vis){ vis++; if (r.g.lod === 'mid') lite++; }
      el.textContent = `↓ ${(rx / 1024).toFixed(2)} KB/s（平均 ${(avg / 1024).toFixed(2)}）  ↑ ${(tx / 1024).toFixed(2)} KB/s\n` +
        `累计 ↓ ${(TR.rx / 1024).toFixed(0)} KB ↑ ${(TR.tx / 1024).toFixed(0)} KB · ${gridOK ? '新协议 格 ' + (myCell || '-') + ' 订阅 ' + subs.size + ' 格' : '旧协议 /presence'}\n` +
        `听到 ${remotes.size} 人 画出 ${vis} 人（简化 ${lite}）· 在线 ${XNet.playersOnline}`;
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
    if (!XNet.online || !XNet.account.google || (sleeping && sleepWhy !== 'queue')) return;
    const o = localBlob(), str = JSON.stringify(o);
    if (str === lastPushed || str.length > 30000) return;
    borrowNet();
    try {
      await timeout(db.ref('saves/' + XNet.uid).set({data:str, score:Math.round(blobScore(o)), ts:firebase.database.ServerValue.TIMESTAMP}), 15000, '上传云存档');
      lastPushed = str;
    } catch(e){ console.warn('[XNet] 云存档上传失败', e); }
  }
  async function cloudSync(){                             // 返回 true 表示用云端进度覆盖了本机并刷新了页面
    if (!XNet.online || !XNet.account.google) return false;
    borrowNet();
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

  /* ---------- 省连接名额：Spark 免费档最多 100 个同时连接 ----------
     切到后台只是不收不发，WebSocket 还连着、照样占一个名额。后台超过 60 秒，或者停在开场画面 1 分钟没操作，就 db.goOffline()
     （服务器那边跟着执行 onDisconnect：/on、格子里的自己、电台外放都会删掉）。回到前台、或者有任何操作就 goOnline()：
     .info/connected 变回 true 时重新写 /on、整条重写自己的位置；syncSubs 重新订阅附近的格子；电台、互动收件箱的监听 Firebase 自己会续上。
     断开期间排行榜、云存档、成绩自动提交都先不发（要发的在切走那一刻已经发了）。 */
  const SLEEP = XNet.sleepAfter = {hidden:60000, title:60000};   // 测试时可以改短
  let sleeping = false, lastInput = performance.now(), hiddenAt = 0;
  XNet.sleeping = false;
  let sleepWhy = '';                                    // 'hidden' | 'title' | 'queue'
  function sleep(why, reason){
    if (sleeping || !db || quitting || !XNet.online) return;
    sleeping = XNet.sleeping = true; sleepWhy = reason || 'hidden';
    if (seat === 'in') seat = 'none';                   // 座位跟着连接走：断开以后回来要重新看一次人数
    syncSubs();
    try { db.goOffline(); } catch(e){}
    console.info('[XNet] 断开连接：' + why);
    recount(); emit();
  }
  /* force：排队时只有定时查空位、排行榜这些一次性的读写才连上，点屏幕不连 */
  function wake(force){
    lastInput = performance.now();
    if (!sleeping || !db) return;
    if (sleepWhy === 'queue' && force !== true) return;
    sleeping = XNet.sleeping = false;
    try { db.goOnline(); } catch(e){}
    console.info('[XNet] 重新连上');
    syncSubs(); emit();
  }
  XNet.wake = () => wake();
  /* 排队时临时借用一下连接（排行榜、昵称、云存档；玩家有操作时也借，留言墙这些直接读数据库），15 秒没人再用就断开 */
  let borrowT = 0;
  function borrowNet(){
    if (seat !== 'queue') return;
    if (sleeping) wake(true);
    clearTimeout(borrowT);
    borrowT = setTimeout(() => { if (seat === 'queue' && !sleeping && !seatBusy) sleep('排队中，用完了', 'queue'); }, 15000);
  }

  /* ---------- 在线人数上限（软上限，满了排队） ----------
     只有进了游戏（不在开场画面）才占一个座位（/on/{uid}）。进游戏时读一次 /config/maxOnline（没有就用 MAX_ONLINE）和 /on 的人数：
     没满就照常联机；满了就单机玩：不写位置、不收别人，断开连接，弹一张小卡片，每 30–60 秒（随机）连上看一眼有没有空位，有就自动连上。
     排队时排行榜、昵称、云存档照常：要用的时候临时连上，用完断开。几个人同时进来可能会稍微超出几个，这是允许的。
     默认 80：人群压测（80 个假人挤在一起）画面和流量都还顺；要调就在 Firebase 控制台改 /config/maxOnline，不用重新发布。 */
  const MAX_ONLINE = 80;
  let joinOn = () => {};                                // 占座位：写 /on/{uid}（start() 里连上数据库以后才有）
  const SEAT_RETRY = XNet.seatRetry = {min:30000, max:60000};     // 测试时可以改短
  let seat = 'none', maxOnline = MAX_ONLINE, lastCount = 0, seatBusy = false, seatRetryT = 0;
  XNet.seat = () => ({seat, maxOnline, lastCount});
  async function checkSeat(){
    if (seatBusy || !db) return;
    seatBusy = true;
    try {
      try { const v = +(await timeout(db.ref('config/maxOnline').once('value'), 10000, '读取人数上限')).val(); if (v >= 1 && v <= 100000) maxOnline = Math.floor(v); } catch(e){}
      let n = 0;
      try { (await timeout(db.ref('on').once('value'), 10000, '读取在线人数')).forEach(c => { if (c.key !== XNet.uid) n++; }); }
      catch(e){ n = -1; }                                // 读不到人数：照常进，不因为这个挡人
      if (isTitle() || hiddenPage || quitting) return;   // 读的时候又回开场画面、切走了：下次进游戏再看
      lastCount = Math.max(0, n) + 1;
      if (n < maxOnline){
        const was = seat === 'queue'; seat = 'in'; clearTimeout(seatRetryT); clearTimeout(borrowT); queueCard(false);
        if (sleeping) wake(true);
        if (connected) joinOn();
        if (was) g(() => toast('已连上', `校园里现在有 ${lastCount} 人`, 2600));
      } else {
        seat = 'queue';
        queueCard(true, n);
        sleep(`在线 ${n}/${maxOnline}，满员排队`, 'queue');
        clearTimeout(seatRetryT);
        seatRetryT = setTimeout(retrySeat, SEAT_RETRY.min + Math.random() * (SEAT_RETRY.max - SEAT_RETRY.min));
      }
      recount(); emit();
    } finally { seatBusy = false; }
  }
  function retrySeat(){
    if (seat !== 'queue') return;
    if (hiddenPage || isTitle()){ seatRetryT = setTimeout(retrySeat, SEAT_RETRY.min); return; }
    wake(true); checkSeat();
  }
  /* 满员时的小卡片：默认「单机先玩」（15 秒后自己收起来），或者「换个时间再来」回开场画面 */
  function queueCard(show, n){
    let el = document.getElementById('xnet-queue');
    if (!show){ if (el) el.hidden = true; return; }
    if (!el){
      el = document.createElement('div'); el.id = 'xnet-queue'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:60;width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;border-radius:12px;background:#fffdf7;color:#1d2733;box-shadow:0 6px 24px rgba(0,0,0,.25);font:14px/1.55 system-ui,sans-serif';
      el.innerHTML = '<div data-t style="margin-bottom:10px"></div><div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button type="button" data-later style="font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #c9ced6;background:#fff;color:#1d2733">换个时间再来</button>' +
        '<button type="button" data-solo style="font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#c0532c;color:#fff">单机先玩</button></div>';
      el.addEventListener('click', e => {
        if (e.target.closest('[data-solo]')) el.hidden = true;
        else if (e.target.closest('[data-later]')){
          el.hidden = true; g(() => XUI.openTitle());
          g(() => toast('换个时间再来', '晚上人最多，上午和深夜一般有空位；留在这里也会自动排队', 3600));
        }
      });
      document.body.appendChild(el);
    }
    el.querySelector('[data-t]').textContent = `现在校园里人太多了（${n}/${maxOnline}），你先单机逛逛，有空位会自动帮你连上`;
    el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 15000);
  }

  /* 下线：格子里的自己、/on、旧 /presence 都删掉（换账号、退出前） */
  async function leaveAll(){
    quitting = true; clearTimeout(seatRetryT);
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
      joinOn = () => quitting ? null : onRef.onDisconnect().remove().then(() => onRef.set(TS())).catch(e => { if (isDenied(e)) goLegacy('写入 /on 被拒绝', e); });
      db.ref('.info/connected').on('value', s => {
        connected = !!s.val();
        if (connected){
          if (gridOK){
            myCell = null; myMeta = null; snd.reset();      // 断线时服务器已经删掉了旧条目：整条重写
            if (!hiddenPage && seat === 'in') joinOn();       // 开场画面、排队中不占座位
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
        if (document.visibilityState === 'hidden'){ hiddenAt = performance.now(); away(); }
        else { wake(); if (hiddenPage){ hiddenPage = false; if (gridOK){ if (connected && seat === 'in') joinOn(); } else sendLegacy(); syncSubs(); } }
      });
      for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, () => {
        if (document.visibilityState === 'hidden'){ lastInput = performance.now(); return; }
        wake(); if (seat === 'queue') borrowNet();        // 排队时有操作就先连着（留言墙、展示区、赛车幽灵直接读数据库），停手 15 秒断开；不收不发位置
      }, {capture:true, passive:true});
      setInterval(() => {
        const t = performance.now();
        if (hiddenPage && document.visibilityState === 'hidden' && t - hiddenAt > SLEEP.hidden) sleep('切到后台超过 ' + SLEEP.hidden / 1000 + ' 秒', 'hidden');
        else if (!hiddenPage && isTitle() && t - lastInput > SLEEP.title) sleep('开场画面 ' + SLEEP.title / 1000 + ' 秒没操作', 'title');
        if (sleeping && sleepWhy === 'title' && !isTitle() && !hiddenPage) wake();   // 开场画面被代码关掉（没有点击）也要连回来
        /* 进了游戏还没座位：看一眼人数（排队中由 retrySeat 定时看） */
        if (gridOK && XNet.online && connected && !sleeping && !hiddenPage && !quitting && !isTitle() && seat === 'none') checkSeat();
      }, 2000);
      window.addEventListener('pagehide', away);
      requestAnimationFrame(frame);
      prebuild('');                                         // 趁空闲先把默认装扮的简化版造好
      recount(); emit();
      if (XNet.account.google){
        setInterval(cloudPush, 30000);                    // 断开时 cloudPush 自己会跳过
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
