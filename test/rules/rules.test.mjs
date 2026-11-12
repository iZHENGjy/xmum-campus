// 数据库规则测试：在本机的 Firebase 模拟器上，把正常玩法和各种攻击都跑一遍，检查 database.rules.json 是允许还是拒绝。
// 不连线上数据库。需要 Node 18+ 和 Java 11+。
//
//   cd test/rules
//   npm install
//   npx firebase emulators:exec --only database --project demo-xmum "node rules.test.mjs"
//
// 想和旧规则对比：先 `git show origin/main:database.rules.json > old.json`，命令最后改成 "node rules.test.mjs old.json"。
// 结果写在 results.md；有一条不符合预期就以非 0 退出。改规则、加新节点（好友等）时，在 cases 里加对应的正常 / 攻击用例。
import fs from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

const TS = firebase.database.ServerValue.TIMESTAMP;
const P = '12,34,5,100,0,0,0';
const anon = {firebase:{sign_in_provider:'anonymous'}};

/* each case: {id, what, kind:'normal'|'attack', setup(admin), run(ctx)} ; ctx = {as(uid), guest} */
const cases = [];
const C = (id, kind, what, setup, run) => cases.push({id, kind, what, setup, run});

async function seedUser(db, uid, name){
  await db.ref().update({['names/' + name.toLowerCase()]:{uid, name, ts:1}, ['users/' + uid]:{name, key:name.toLowerCase()}});
}
const baseSeed = async db => {
  await seedUser(db, 'alice', 'Alice');
  await seedUser(db, 'bob', 'Bob');
  await seedUser(db, 'evil', 'Evil');
  await db.ref('on/bob').set(Date.now());
  await db.ref('wall/bob').set({name:'Bob', text:'hello', color:'yellow', ts:Date.now() - 3600e3});
};
const banEvil = async db => { await db.ref('ban/evil').set(true); };

/* ---------- normal play (must be allowed in both) ---------- */
C('N1', 'normal', '第一次注册昵称（names + users 一次写）', null, A => A('newbie').ref().update({'names/newbie':{uid:'newbie', name:'Newbie', ts:TS}, 'users/newbie':{name:'Newbie', key:'newbie'}}));
C('N2', 'normal', '刷新自己昵称的上线时间 names/{名}/ts', null, A => A('alice').ref('names/alice/ts').set(TS));
C('N3', 'normal', '改名（新名 + users + 旧名删掉，一次写）', null, A => A('alice').ref().update({'names/alice2':{uid:'alice', name:'Alice2', ts:TS}, 'users/alice':{name:'Alice2', key:'alice2'}, 'names/alice':null}));
C('N4', 'normal', '进格子：/pres 整条写（注册昵称）', null, A => A('alice').ref().update({'pres/12_12/alice':{p:P, t:TS, n:'Alice', m:'w'}}));
C('N5', 'normal', '只更新位置 p', async db => db.ref('pres/12_12/alice').set({p:P, t:Date.now(), n:'Alice', m:'w'}), A => A('alice').ref('pres/12_12/alice').update({p:'13,34,5,100,0,0,0'}));
C('N6', 'normal', '换格（新格写、旧格删，一次写）', async db => db.ref('pres/12_12/alice').set({p:P, t:Date.now(), n:'Alice', m:'w'}), A => A('alice').ref().update({'pres/12_13/alice':{p:P, t:TS, n:'Alice', m:'n', k:'myvi'}, 'pres/12_12/alice':null}));
C('N7', 'normal', '没注册上昵称的人用「游客1234」写位置', null, A => A('guest').ref('pres/12_12/guest').set({p:P, t:TS, n:'游客1234', m:'w'}));
C('N8', 'normal', '下线删掉自己的位置', async db => db.ref('pres/12_12/alice').set({p:P, t:Date.now(), n:'Alice', m:'w'}), A => A('alice').ref('pres/12_12/alice').remove());
C('N9', 'normal', '改名后位置里换成新名字', async db => { await db.ref('pres/12_12/alice').set({p:P, t:Date.now(), n:'Alice', m:'w'}); await db.ref().update({'names/alice2':{uid:'alice', name:'Alice2', ts:1}, 'users/alice':{name:'Alice2', key:'alice2'}, 'names/alice':null}); }, A => A('alice').ref('pres/12_12/alice').update({n:'Alice2'}));
C('N10', 'normal', '旧协议 /presence 整条写', null, A => A('alice').ref('presence/alice').set({name:'Alice', mode:'walk', x:1, z:2, y:0, h:0, color:'#f1c84b', t:TS}));
C('N11', 'normal', '交总榜成绩', null, A => A('alice').ref('boards/stunt/alice').set({name:'Alice', value:1234, ts:Date.now()}));
C('N12', 'normal', '交小游戏成绩', null, A => A('alice').ref('mini/canteen_rush/alice').set({name:'Alice', value:88, ts:Date.now()}));
C('N13', 'normal', '交赛车影子（campus）', null, A => A('alice').ref('ghosts/campus/alice').set({name:'Alice', time:60000, car:'myvi', color:'#ff0000', d:'abcdefgh12', ts:Date.now()}));
C('N13k', 'normal', '交卡丁车赛影子（kart，js/92-kart-race.js）', null, A => A('alice').ref('ghosts/kart/alice').set({name:'Alice', time:52000, car:'kart', color:'#ffd23a', d:'abcdefgh12', ts:Date.now()}));
C('N14', 'normal', '贴便利贴', null, A => A('alice').ref('wall/alice').set({name:'Alice', text:'你好', color:'pink', ts:TS}));
C('N15', 'normal', '删掉自己的便利贴', async db => db.ref('wall/alice').set({name:'Alice', text:'你好', color:'pink', ts:Date.now()}), A => A('alice').ref('wall/alice').remove());
C('N16', 'normal', '给在线的人发互动消息', null, A => A('alice').ref('social/bob').push({from:'alice', type:'inv', data:'{"k":"ride"}', ts:TS}));
C('N17', 'normal', '收件人读到就删', async db => db.ref('social/bob/m1').set({from:'alice', type:'hi', ts:Date.now()}), A => A('bob').ref('social/bob/m1').remove());
C('N18', 'normal', '布置展位', null, A => A('alice').ref('showcase/alice').set({name:'Alice', car:'myvi', look:'pink', wear:'', pose:'wave', value:5000, ts:TS}));
C('N19', 'normal', '给别人的便利贴点赞（likes + 计数一次写）', null, A => A('alice').ref().update({'wallLikes/bob/alice':true, 'wallLikeN/bob':1}));
C('N20', 'normal', '举报别人的便利贴（flags + 计数一次写）', null, A => A('alice').ref().update({'wallFlags/bob/alice':true, 'wallFlagN/bob':1}));
C('N21', 'normal', '不登录读公开总榜', null, (A, G) => G().ref('boards/stunt').once('value'));
C('N22', 'normal', '读自己的 users', null, A => A('alice').ref('users/alice').once('value'));

/* ---------- attacks ---------- */
C('A1', 'attack', '影子写到编出来的赛道 /ghosts/fake1', null, A => A('evil').ref('ghosts/fake1/evil').set({name:'Evil', time:60000, car:'myvi', color:'#ff0000', d:'x'.repeat(40000), ts:Date.now()}));
C('A2', 'attack', '位置里冒充别人的名字（/pres n = Bob）', null, A => A('evil').ref('pres/12_12/evil').set({p:P, t:TS, n:'Bob', m:'w'}));
C('A3', 'attack', '已有位置，只把名字改成别人的', async db => db.ref('pres/12_12/evil').set({p:P, t:Date.now(), n:'Evil', m:'w'}), A => A('evil').ref('pres/12_12/evil').update({n:'Bob'}));
C('A4', 'attack', '旧协议 /presence 冒名', null, A => A('evil').ref('presence/evil').set({name:'Bob', mode:'walk', x:1, z:2, y:0, h:0, color:'#f1c84b', t:TS}));
C('A5', 'attack', '没注册的人用不像游客的名字写位置', null, A => A('guest').ref('pres/12_12/guest').set({p:P, t:TS, n:'管理员', m:'w'}));
C('A6', 'attack', '已有昵称，再抢注第二个（不改 users）', null, A => A('evil').ref('names/carol').set({uid:'evil', name:'Carol', ts:TS}));
C('A7', 'attack', '抢别人已注册的昵称', null, A => A('evil').ref('names/bob').set({uid:'evil', name:'Bob', ts:TS}));
C('A8', 'attack', '自己给自己解封 / 写 /ban', null, A => A('evil').ref('ban/evil').set(null));
C('A9', 'attack', '读 /ban', null, A => A('evil').ref('ban').once('value'));
C('A10', 'attack', '被封的人交总榜成绩', banEvil, A => A('evil').ref('boards/stunt/evil').set({name:'Evil', value:9999999, ts:Date.now()}));
C('A11', 'attack', '被封的人交小游戏成绩', banEvil, A => A('evil').ref('mini/canteen_rush/evil').set({name:'Evil', value:999999, ts:Date.now()}));
C('A12', 'attack', '被封的人交影子（真赛道）', banEvil, A => A('evil').ref('ghosts/campus/evil').set({name:'Evil', time:5000, car:'myvi', color:'#ff0000', d:'abcdefgh12', ts:Date.now()}));
C('A13', 'attack', '被封的人写位置', banEvil, A => A('evil').ref('pres/12_12/evil').set({p:P, t:TS, n:'Evil', m:'w'}));
C('A14', 'attack', '被封的人发互动消息', banEvil, A => A('evil').ref('social/bob').push({from:'evil', type:'hi', ts:TS}));
C('A15', 'attack', '被封的人贴便利贴', banEvil, A => A('evil').ref('wall/evil').set({name:'Evil', text:'spam', color:'pink', ts:TS}));
C('A16', 'attack', '被封的人举报别人', banEvil, A => A('evil').ref().update({'wallFlags/bob/evil':true, 'wallFlagN/bob':1}));
C('A17', 'attack', '被封的人上展台', banEvil, A => A('evil').ref('showcase/evil').set({name:'Evil', car:'myvi', look:'', wear:'', pose:'wave', value:9999999, ts:TS}));
C('A18', 'attack', '被封的人改名 / 注册新昵称', banEvil, A => A('evil').ref().update({'names/evil2':{uid:'evil', name:'Evil2', ts:TS}, 'users/evil':{name:'Evil2', key:'evil2'}, 'names/evil':null}));
/* banned users may still clean up after themselves */
C('B1', 'normal', '被封的人删掉自己的位置（onDisconnect）', async db => { await banEvil(db); await db.ref('pres/12_12/evil').set({p:P, t:Date.now(), n:'Evil', m:'w'}); }, A => A('evil').ref('pres/12_12/evil').remove());
C('B2', 'normal', '被封的人删掉自己的便利贴', async db => { await banEvil(db); await db.ref('wall/evil').set({name:'Evil', text:'spam', color:'pink', ts:Date.now()}); }, A => A('evil').ref('wall/evil').remove());
C('B3', 'normal', '被封的人删掉自己的展位', async db => { await banEvil(db); await db.ref('showcase/evil').set({name:'Evil', car:'myvi', look:'', wear:'', pose:'wave', value:1, ts:Date.now()}); }, A => A('evil').ref('showcase/evil').remove());

async function runAll(label, rulesFile){
  const env = await initializeTestEnvironment({projectId:'demo-xmum', database:{host:'127.0.0.1', port:9000, rules:fs.readFileSync(rulesFile, 'utf8')}});
  const out = {};
  for (const c of cases){
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async ctx => { const db = ctx.database(); await baseSeed(db); if (c.setup) await c.setup(db); });
    const A = uid => env.authenticatedContext(uid, anon).database();
    const G = () => env.unauthenticatedContext().database();
    try { await assertSucceeds(c.run(A, G)); out[c.id] = 'allow'; }
    catch(e){ out[c.id] = /PERMISSION_DENIED|permission_denied/i.test(String(e && e.message)) ? 'deny' : 'ERROR ' + String(e && e.message).slice(0, 120); }
  }
  await env.cleanup();
  return out;
}

const NEW = new URL('../../database.rules.json', import.meta.url), OLD = process.argv[2];
const newR = await runAll('new', NEW);
const oldR = OLD ? await runAll('old', OLD) : {};
let bad = 0;
const rows = cases.map(c => {
  const want = c.kind === 'normal' ? 'allow' : 'deny', ok = newR[c.id] === want;
  if (!ok) bad++;
  return `| ${c.id} | ${c.what} | ${oldR[c.id] || '-'} | ${newR[c.id]} | ${ok ? '✅' : '❌ 应为 ' + want} |`;
});
const md = ['| # | 情况 | 旧规则 | 当前规则 | 符合预期 |', '|---|---|---|---|---|', ...rows].join('\n');
fs.writeFileSync('results.md', md + '\n');
console.log(md);
console.log(bad ? `\n${bad} case(s) NOT as expected` : '\nALL CASES AS EXPECTED');
process.exit(bad ? 1 : 0);
