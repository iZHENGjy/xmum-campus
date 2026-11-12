/* 仅供本地测试：好友（js/96-friends.js）的假玩家，走 test/firebase-shared.js 的假数据库。和 test/social-bots.js 一起加载（test/social.html?bots）。
 *   陪练小明：你向他「加好友」，他 1 秒后同意（写他自己的 /friends 和 /fst，像真玩家一样）
 *   司机阿华：会婉拒好友请求（看被拒的样子）
 *   加 &friends：再放三个远处的假好友（KIP 购物中心走路的、Bell Suites 开兰博鸡尼的、两个离线的），看列表、大地图和导航
 * 控制台：
 *   XFriendBots.seed()                 手动放远处的假好友（&friends 时自动放）
 *   XFriendBots.ask()                  小明向你发好友请求（看收到的邀请卡）
 *   XFriendBots.online('f3', true)     让某个假好友上线 / 下线（看上线提醒）；id：f1 f2 f3 f4、a（小明）
 *   XFriendBots.unfriend('a')          小明解除和你的好友（他在线时会通知你，你的列表里也会删掉）
 *   XFriendBots.drive('f1', 'myvi')    让某个假好友上车（车型）或下车（null）
 */
'use strict';
(() => {
  const TS = {'.sv':'timestamp'};
  const Q = new URLSearchParams(location.search);
  const M = () => window.__mock;
  const me = () => XNet.uid;
  const myName = () => { try { return localStorage.getItem('xmum-name') || '玩家'; } catch(e){ return '玩家'; } };
  const send = (uid, to, type, data) => M().ref('social/' + to).push({from:uid, type, ts:TS, data:JSON.stringify(data || {})});
  const FAR = {
    f1:{name:'丨塔公会丨阿杰', x:-640, z:900, on:true, car:'', vx:.6},
    f2:{name:'DDL战士', x:522, z:300, on:true, car:'lambo', vx:-1.4},
    f3:{name:'图书馆钉子户', x:-60, z:-140, on:false, ago:3 * 3600e3},
    f4:{name:'早八困困', x:200, z:60, on:false, ago:2 * 86400e3}
  };
  for (const id in FAR) FAR[id].x0 = FAR[id].x;
  const uidOf = id => 'bot-' + id;
  const posStr = (x, z) => Math.round(x / 10) * 10 + ',' + Math.round(z / 10) * 10;
  function fst(id, o){ M().put('fst/' + uidOf(id), o); }
  function setOn(id, on){
    const u = uidOf(id);
    if (on){ M().put('on/' + u, TS); M().botDisc.set('on/' + u, 1); }
    else { M().put('on/' + u, null); M().botDisc.delete('on/' + u); M().update('fst/' + u, {t:TS}); }
  }
  function seed(){
    if (!me()) return '还没联机';
    for (const id in FAR){
      const f = FAR[id], u = uidOf(id);
      M().put('friends/' + me() + '/' + u, {n:f.name, t:Date.now() - 86400e3});
      M().put('friends/' + u + '/' + me(), {n:myName(), t:Date.now() - 86400e3});
      const o = {n:f.name, t:f.on ? TS : Date.now() - (f.ago || 0), p:posStr(f.x, f.z)}; if (f.car) o.k = f.car;
      fst(id, o);
      if (f.on) setOn(id, true);
    }
    return '放好了：' + Object.values(FAR).map(f => f.name).join('、');
  }
  /* 在线的远处好友慢慢挪（每 3 秒写一次，真玩家是挪了 60 米才写） */
  setInterval(() => {
    if (!window.XNet || !XNet.online || !me()) return;
    for (const id in FAR){
      const f = FAR[id]; if (!f.on || !M().get('friends/' + uidOf(id) + '/' + me())) continue;
      if (f.vx){ f.x += f.vx * 3 * (f.car ? 8 : 1); if (Math.abs(f.x - f.x0) > 120) f.vx = -f.vx; }
      const o = {n:f.name, t:TS, p:posStr(f.x, f.z)}; o.k = f.car || null;
      M().update('fst/' + uidOf(id), o);
    }
    /* 小明、阿华：和你是好友时也写 /fst（他们就在你旁边，列表里用的是实时位置） */
    for (const b of [XBots.A, XBots.B]){
      if (!M().get('friends/' + b.uid + '/' + me())) continue;
      const o = {n:b.name, t:TS, p:posStr(b.x, b.z)}; o.k = b.car && !b.ride ? b.car : null;
      M().update('fst/' + b.uid, o);
    }
  }, 3000);
  /* 收到的消息（test/social-bots.js 的 onMsg 转过来） */
  (window.XBotHooks = window.XBotHooks || []).push((b, type, d) => {
    if (type === 'inv' && d.k === 'friend'){
      setTimeout(() => {
        if (b === XBots.B) return send(b.uid, me(), 'ans', {k:'friend', ok:0, why:'no'});
        M().put('friends/' + b.uid + '/' + me(), {n:String(d.n || myName()).slice(0, 16), t:TS});
        M().put('fst/' + b.uid, {n:b.name, t:TS, p:posStr(b.x, b.z)});
        send(b.uid, me(), 'ans', {k:'friend', ok:1});
        setTimeout(() => { b.fxSeq = (b.fxSeq + 1) % 10000; b.fx = 'e2-' + b.fxSeq; b.fxAt = Date.now(); }, 600);
      }, 1100);
    }
    if (type === 'ans' && d.k === 'friend' && b.pendingFriend){ b.pendingFriend = false; }
    if (type === 'ev' && d.k === 'unfriend') M().put('friends/' + b.uid + '/' + me(), null);
  });
  XNet.ready.then(() => { if (Q.has('friends')) setTimeout(() => console.info('[FriendBots]', seed()), 1500); });
  window.XFriendBots = {
    FAR, seed,
    ask(){ const b = XBots.A; b.pendingFriend = true; M().put('freq/' + me() + '/' + b.uid, {t:TS}); send(b.uid, me(), 'inv', {k:'friend', n:b.name}); },
    online(id, on){
      if (id === 'a'){ const u = XBots.A.uid; if (on){ M().put('on/' + u, TS); M().botDisc.set('on/' + u, 1); } else M().put('on/' + u, null); return; }
      if (!FAR[id]) return '没有这个 id'; FAR[id].on = !!on; setOn(id, !!on); if (on) M().update('fst/' + uidOf(id), {t:TS});
    },
    unfriend(id){
      const u = id === 'a' ? XBots.A.uid : id === 'b' ? XBots.B.uid : uidOf(id);
      M().put('friends/' + u + '/' + me(), null);
      if (M().get('on/' + u)) send(u, me(), 'ev', {k:'unfriend'});
    },
    drive(id, kind){ if (FAR[id]){ FAR[id].car = kind || ''; } }
  };
})();
