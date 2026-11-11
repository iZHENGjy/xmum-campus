# 玩家之间的当面互动（`js/96-social.js`）

只在联机时出现（`XNet.online`）。离线页面、预览版（离线）整套隐藏，R 大笑、Q 撩头照旧。

## 怎么玩

| 做什么 | 电脑 | 手机 |
|---|---|---|
| 和附近的人互动（4 米内，你在走路） | 他头上出现「F 互动」，按 **F** 弹菜单，数字键选 | 点他头上的「点我互动」，或右下角「上车」按钮（这时会变成「互动」） |
| 表情（8 个） | **Z** 开轮盘，1–8 选 | 「表情 · 喊话」按钮 |
| 喊话（20 句预设短句，不能自由打字） | **V** 开面板，1–0 发前 10 句，其余点 | 同上 |
| 回应邀请卡 | **F** 接 / **X** 不接 | 点卡片上的按钮 |
| 搭车时下车 | **F** | 「下车」按钮或顶上小条里的「下车」 |

- 菜单：**搭车**（他在开车、还有空座）、**打招呼**、**挑战 · 飙车抢点 / 特技比拼 / 抓人**、屏蔽这个人。
- 表情和喊话 2.5 秒冷却，头顶气泡显示 3 秒，70 米内的人看得到。R 大笑、Q 撩头也会让别人看到。
- 免打扰：「表情 · 喊话」面板底下的勾选框。打开后所有邀请自动拒绝，别人的菜单里显示「免打扰中」。表情和喊话照常。
- 屏蔽：菜单里「屏蔽这个人」。看不到他的气泡和表情，他的邀请和招呼直接忽略（不回音）。名单存在本机，面板里可以取消。

### 搭车
走到别人车边选「搭车」→ 司机收到卡片 → 接了你就坐上去，跟着他的车走（位置用 `js/net.js` 平滑过的幽灵车）。
司机顶上的小条里能看到车上是谁，点 × 请他下车；司机下车、掉线、换模式，乘客自动下车。

每辆车的座位在 `SEATS` 里（车身坐标，和 `CAR_T.seat` 一样）。司机坐在车中间，所以乘客坐后座、车顶、车尾：

| 车 | 座位 |
|---|---|
| 校巴、劳斯来斯、铁方越野 | 3 |
| 小车、Myvi、玛莎拉弟、高尔夫球车、保安巡逻车 | 2 |
| 保时洁 911、兰博鸡尼、摩托 | 1 |

车载电台（`js/95-radio.js`，另一个分支）：如果有 `window.XRadio.follow`，上车时调 `XRadio.follow(司机 uid)`，下车时 `XRadio.follow(null)`；没有就跳过。

### 当面挑战
发起的一方是「主持」：对方接受后，主持选好目标和开始时间（服务器时间 + 4.2 秒），发 `go`，两边同时倒数 3 秒。

| 玩法 | 规则 | 同步 |
|---|---|---|
| 飙车抢点 🏁 | 两边各开一辆车（自己的车开过来，没有就借一辆 Myvi），冲到同一个随机地标（`DESTS` 里离两人中点 220–480 米的一个）的金色光圈，先到的赢；150 秒都没到算平局 | 到了的一方发 `end {t}`（用时）；两边比用时，消息交叉时快的赢 |
| 特技比拼 🔥 | 60 秒，`stunt.pts` 涨了多少算多少 | 分数放在 presence 的 `ds`；时间到各发 `end {s}`，最多等 4 秒 |
| 抓人 👻 | 45 秒，走路（不能上车）。「鬼」碰到对方（2.4 米）就换他当鬼，被抓的人原地停 1.5 秒；鬼跑得快 18%。时间到时谁是鬼谁输 | 只有当鬼的那边判定抓到，发 `tag {n}`（第几次换鬼）；结束时互相核对 `n`，大的为准 |

- 对方掉线、离开比赛：没开始 15 秒算取消；15 秒以后算你赢（「对方认输」档）。认输按钮在顶上的小条里。
- 做任务、送外卖、在小游戏或室内时不能发起；收到的挑战邀请先排队，空下来再弹，20 秒没空就自动回「正忙」。

### 奖励
`XParts.reward('duel', 档位)`，表在 `js/42-tuning.js` 的 `TN_DROPS.duel`（`docs/tuning.md` 里也有一行）：

| 档 | 什么时候 | 掉什么 |
|---|---|---|
| 0 | 赢了 | 涡轮、氮气罐、碳纤维 40%、钛锭 5% |
| 1 | 对方中途认输或离开 | 氮气罐、漆料 |
| 2 | 平局 | 漆料 |
| 3 | 输了 | 没有 |

防刷：同一个对手每天最多 3 次有奖（本机 `xmum-social-v1` 里数），所有对手加起来每天 10 次（`TN_DROPS.duel.day`）。取消的、自己认输的不发。第一次赢解锁成就「当面单挑」。

## 数据库

**改了 `database.rules.json`，需要重新发布规则。** 没发布之前，presence 多带的字段会被拒绝：`js/net.js` 会去掉这些字段重写一次，把玩家互动整个关掉（`XNet.socialDenied`），联机和排行榜照常。最好还是**先发布规则，再发布代码**。

### presence 里多的字段（`/presence/{uid}`）
`js/net.js` 的 `XNet.extra` 钩子，变了马上同步，没变不多写。

| 字段 | 类型 | 意思 |
|---|---|---|
| `fx` | `"e3-17"` / `"s5-18"` | 最近的表情（e + 编号）或短句（s + 编号），后面是序号，同一个表情连发也认得出；8 秒后去掉 |
| `ride` | uid | 坐在谁的车上 |
| `rs` | 1–3 | 第几个座 |
| `duel` | uid | 正在和谁比赛（对方据此判断你还在不在） |
| `ds` | 数字 | 特技比拼的分数 |
| `dnd` | `true` | 免打扰 |

### 点对点通道 `/social/{收件人 uid}/{pushId}`
```
{from: 发件人 uid, type: 'hi' | 'inv' | 'ans' | 'bye' | 'go' | 'end' | 'tag' | 'ev', data: JSON 字符串（≤ 300 字）, ts: 服务器时间}
```
规则：
- 只有收件人能读自己的收件箱。
- 新建：`from` 必须是自己，`type` 在白名单里，`ts` 是服务器时间，收件人必须在线（`/presence/{收件人}` 存在）。不能改已有的消息。
- 删除：收件人、发件人，或者任何人删 2 分钟以前的（清理）。
- 收件人读到就删；45 秒以前的消息直接删掉不处理。

客户端限频：每人 10 秒最多发 12 条；同一个人同一种邀请 8 秒一次，被拒以后 25 秒；收到同一个人一分钟 5 次以上的邀请直接不理；同时只能有一个等回音的邀请（20 秒没回音作废）。

## 接口：`window.XSocial`（给以后的双人合作任务用）

```js
XSocial.active                    // 联机、通道可用
XSocial.send(uid, type, data)     // → Promise<boolean>；type 用 SOC_TYPES 里的，自定义的事件用 'ev'，data 里放 {k:'你的事件名', …}
XSocial.on(type, (fromUid, data) => {})   // 收消息；屏蔽的人的 hi / inv 不会到这里
XSocial.peer(uid)                 // {uid, name, d:presence, G:幽灵, live, car}，不在线为 null

// 邀请卡：定义一次，卡片、排队、超时、免打扰、屏蔽、限频都不用自己管
XSocial.defineInvite('coop', {
  icon:'🤝', yes:'一起干', no:'算了',
  title:(name, data, from) => `${name} 想和你一起送外卖`,
  desc:(name, data, from) => '两人分一单，报酬各拿 70%',
  needFree:true,                  // 做任务、小游戏、比赛中先排队
  check(from, data){ return mission.on ? 'busy' : ''; },   // 不能接的原因（WHY 里的键：busy / full / duel / far / dnd / no / timeout…）
  accept(from, data){ /* 开始 */ return {extra:1}; },      // 返回值会合进回给对方的 ans
  late(from, data){}              // 撤回以后才收到的回音
});
XSocial.invite(uid, 'coop', {route:3}, {answer(ok, data, why){ if (ok) 开始(); }});
XSocial.answer(uid, 'coop', ok, why, extra)   // 一般用不到：卡片会自动回
```
- 邀请在线上是 `inv {k, …}` 和 `ans {k, ok, why, …}`，新的邀请种类**不用改数据库规则**。
- 新的消息类型要加进规则的白名单和 `SOC_TYPES`，一般用 `ev` 就够了。
- 对局中途对方掉线：看 `XSocial.peer(uid)` 是否还 `live`，或在 presence 里放一个字段（要加规则）。
- 其他：`XSocial.emote(i)`、`XSocial.say(i)`、`XSocial.openMenu(uid)`、`XSocial.openSheet()`、`XSocial.openWheel()`、`XSocial.block(uid, name)`、`XSocial.setDnd(bool)`、`XSocial.riding`、`XSocial.passengers`、`XSocial.duel`、`XSocial.emotes / phrases / games / seats`。

`js/net.js` 为这个文件加的钩子：`XNet.extra`、`XNet.peers()`、`XNet.now()`、`XNet.ref(path)`、`XNet.afterGhosts(dt)`（见文件头注释）。

## 本地测试

不连任何服务器。项目根目录起静态服务器（例如 `python -m http.server 8770`），然后：

**一个人 + 本地假玩家**：打开 `/test/social.html?bots`。旁边多两个假玩家：
- 陪练小明（走路）：回招呼、接受三种挑战、时不时冒表情和喊话；
- 司机阿华（开车）：走到他车边选「搭车」，他会接你、绕圈兜风。

控制台：`XBots.challenge('race' | 'stunt' | 'tag')`（小明向你发起挑战，看收到邀请卡）、`XBots.askRide()`（你开车时小明来搭车，看司机那边）、`XBots.hi()`、`XBots.say(i)`、`XBots.emote(i)`、`XBots.come()`。

**两个人互测**：开两个浏览器**窗口**并排（不要用同一个窗口的两个标签页：看不见的标签页会自动下线）：
- `/test/social.html?p=a`（阿明）
- `/test/social.html?p=b`（小红）

两个页面共用一份假数据库（`test/firebase-shared.js`，同一个浏览器的页面之间用 BroadcastChannel 同步），存档也分开（`xmum-mock-{p}:` 前缀，不碰正式存档）。可以加 `&name=昵称`、`&frame=390x844`（手机尺寸）、`&title`（停在开场画面）。

**预览版**：`https://izhengjy.github.io/xmum-campus/preview/test/social.html?bots`（或两个窗口 `?p=a` / `?p=b`）。

假数据库不检查规则。要测规则，用测试用的 Firebase 项目（`js/firebase-config.preview.js`）或 Firebase 控制台的「规则模拟器」。
