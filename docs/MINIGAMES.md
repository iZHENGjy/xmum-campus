# 怎么给 B1 游戏厅写一个小游戏

B1 学生活动中心里是一个游戏厅（`js/91-arcade.js`，对外是 `window.XMini`）。每个小游戏是 `js/minigames/` 下的一个文件，
调用一次 `XMini.register({...})` 就接进来了：游戏厅里会多一台街机，游戏列表和排行榜里也会多一项。
**不用改主循环，也不用改平台。**

现有的两个可以直接当模板抄：

| 文件 | 玩法 | 示范了什么 |
|---|---|---|
| `js/minigames/hoops.js` 奶娃投篮 | 一个键，看准时机出手 | `ctx.input.pressed`、固定镜头、抛物线、连击、加时 |
| `js/minigames/canteen.js` 食堂端盘子 | 摇杆，在人群里穿行 | `ctx.player.walk`、`ctx.camera.fit`、`InstancedMesh` 人群 |
| `js/minigames/kipmart.js` KIP 超市大乱斗 | 摇杆加一个键，和 AI 抢货、互撞 | 自己写的带惯性的移动、格子寻路的 AI、横竖屏换镜头方向、`ctx.ui` |

## 1. 最小示例

新建 `js/minigames/tap.js`：

```js
/* 小游戏 · 十秒狂点 */
'use strict';
XMini.register((() => {
  let S = null;                                   // 这一局的状态，start 里新建，stop 里丢掉
  return {
    id:'tap', name:'十秒狂点', icon:'👆', color:'#3fd6c6',
    desc:'十秒内点得越多越好',
    intro:'十秒内狂点屏幕（或按空格）。',
    controls:{a:'点', tap:true},                  // 一个按钮，点屏幕任何地方也算
    board:{fmt:v => Math.round(v) + ' 下'},       // 有这一项才有排行榜
    medals:[70, 50, 30],                          // 金、银、铜
    start(ctx){
      S = {n:0};
      S.cube = box(2, 2, 2, M('#3fd6c6'), 0, 1, 0, ctx.root);   // 所有东西都挂在 ctx.root 下
      ctx.camera.set([0, 5, 9], [0, 1, 0], 50);
      ctx.hud.score(0); ctx.hud.time(10);
    },
    update(dt, ctx){
      if (ctx.input.pressed('a')){ S.n++; ctx.hud.score(S.n); ctx.tone('square', 500 + S.n * 8, 500 + S.n * 8, .05, .06); S.cube.scale.setScalar(1.25); }
      S.cube.scale.setScalar(1 + (S.cube.scale.x - 1) * Math.max(0, 1 - dt * 10));   // 弹回原来大小
      ctx.hud.time(10 - ctx.elapsed);
      if (ctx.elapsed >= 10) ctx.finish(S.n);     // 结算：奖牌、纪录、RM、排行榜、结算面板，都是平台做
    },
    stop(){ S = null; }
  };
})());
```

然后在 `index.html` 里、`js/91-arcade.js` 之后加一行（`?v=` 跟旁边的一样，不要自己加一）：

```html
<script src="js/minigames/tap.js?v=20"></script>
```

打开 `test/offline.html`，从标题页点「小游戏」就能看到它。

## 2. `XMini.register(def)`

| 字段 | 说明 |
|---|---|
| `id` | **必填**。小写字母开头，只能有小写字母、数字、下划线，2 到 16 个字符（`^[a-z][a-z0-9_]{1,15}$`）。同时是排行榜路径 `/mini/{id}` 和存档里的键，**上线后不要改**。 |
| `name` `desc` `icon` `color` | 名字、一句话介绍、一个 emoji、主题色（街机机身、HUD 上边线）。 |
| `intro` | 开局前那张卡片上的玩法说明。一两句话，说清楚怎么得分、怎么输。 |
| `controls` | `{move, a, b, tap}`。`move:true` 显示摇杆；`a` / `b` 是右下两个按钮上的字，不写就不显示；`tap:true` 表示点屏幕任何地方也算按 `a`。 |
| `board` | 可选。`{fmt, lower, max}`：`fmt(v)` 把分数变成文字；`lower:true` 表示越小越好（比如用时）；`max` 是这个游戏分数的上限。不写 `board` 就不上榜、不显示排行榜按钮。 |
| `medals` | 可选。`[金, 银, 铜]` 三条线。 |
| `reward(score, medal)` | 可选。这一局发多少 RM，`medal` 是 0 金 / 1 银 / 2 铜 / 3 没有。不写就按奖牌发 30 / 18 / 10 / 4。**一局最多 RM 60**，平台会截断。 |
| `achievements` | 可选。`[[id, 名字, 说明, 奖励 RM], ...]`，和 `js/80-gta.js` 的 `ACH` 一样的格式，id 用 `mg_<游戏 id>_` 开头。用 `ctx.unlock(id)` 解锁。 |
| `sky` | 可选。背景色，默认深蓝。 |
| `shadow` | 可选。阴影覆盖的半径（米），默认 26。场景越小写得越小，阴影越清楚。 |
| `countdown` | 可选。写 `false` 就没有开局的 3、2、1。 |
| `minPlayers` `maxPlayers` | 预留。现在只支持单人，都按 1 处理。 |
| `start(ctx)` | **必填**。搭场景、重置状态。每一局（包括「再来一局」）都会调一次。 |
| `update(dt, ctx)` | **必填**。每帧调一次，`dt` 是秒，最大 0.05。倒计时和暂停的时候不调。 |
| `stop(ctx)` | 可选。这一局结束、要拆场景的时候调。`ctx.root` 下的东西平台会清，这里只管你自己在别处建的。 |
| `pause(on, ctx)` | 可选。暂停和继续的时候调。 |

一局的流程：玩法卡片 →「开始」→ `start(ctx)` → 3、2、1 → 每帧 `update` → 你调 `ctx.finish(score)` → 结算面板 →「再来一局」或「回游戏厅」→ `stop(ctx)`。

## 3. `ctx`

坐标都是**舞台坐标**：原点在舞台中心，`+x` 向右，`-z` 向远处（屏幕上方），`y` 向上，单位是米。

### 场景
- `ctx.root`：`THREE.Group`，你的所有东西都加到它下面。这一局结束时平台把它从场景里拿掉，并把下面所有几何体、材质、贴图 `dispose` 掉。
- `ctx.q`：画质档位，0 流畅 / 1 标准 / 2 高清。有画质接口 `window.XQ` 时就是 `XQ.tier`，没有时按设备估一个。**纯装饰的粒子按它减量**，例如 `const n = ctx.q > 0 ? 12 : 4`。
- `ctx.touch`（是不是触屏）、`ctx.reduced`（系统要求减少动画）、`ctx.aspect`（画面宽高比，竖屏手机约 0.46）。

### 镜头
- `ctx.camera.set([x, y, z], [lx, ly, lz], fov)`：固定镜头。
- `ctx.camera.fit({cx, cz, w, d, pitch, yaw, fov, margin})`：自动选距离，让地面上以 `(cx, cz)` 为中心、宽 `w` 深 `d` 的一块正好装进画面，横屏竖屏都行，转屏时会重算。`pitch` 是俯角（弧度，1.57 是正上方）。俯视类游戏用这个。
- `ctx.camera.follow(target, {dist, pitch, yaw, height, lerp})`：跟着一个 `{x, z}` 对象（例如 `ctx.player`）。
- `ctx.camera.shake(0.5)`：抖一下。`ctx.camera.snap()`：下一帧直接跳到位，不做平滑。

### 输入
**只用 `ctx.input`，不要读主游戏的 `keys`**（游戏厅里主游戏是暂停的，`keys` 不准）。
- `ctx.input.x` / `.y`：-1 到 1。键盘 WASD 或方向键、触屏摇杆合在一起；`y` 是「向前」为正。`ctx.input.run`：按着 Shift 或摇杆推到底。
- `ctx.input.a` / `.b`：按钮是不是按着。`a` 是空格 / F / 回车 / J，`b` 是 K / E。
- `ctx.input.pressed('a' | 'b' | 'tap')`：**这一帧刚按下**。`tap` 是点了画面，位置在 `ctx.input.tapX` / `.tapY`（-1 到 1，右和上为正）。
- 暂停键（P、Esc、HUD 上的暂停按钮）平台管，不用处理。

### 奶娃
默认不显示。要用就在 `start` 里 `ctx.player.show(x, z, h)`。
- `ctx.player.x` / `.z` / `.h`：位置和朝向，可读可写（`h = Math.PI` 是面朝远处）。`ctx.player.y` 只读（跳起来的高度）。`ctx.player.visible` 可读可写。
- `ctx.player.walk(dt, {speed, runSpeed, minX, maxX, minZ, maxZ, blocked(x, z)})`：按摇杆走一步，带走路动画。`blocked` 返回 `true` 的地方进不去。
- `ctx.player.act('jump' | 'laugh' | 'pose')`：跳一下、大笑、撩头。
- `ctx.player.hide()`。

### HUD
- `ctx.hud.score(v)`、`ctx.hud.time(秒)`：顶上的得分和时间。调了才显示。**最后 5 秒平台会自动滴答响**，10 秒内数字变红。
- `ctx.hud.info('♥♥♡ · 连击 ×3')`：得分旁边的一小段字，放生命、连击这类。
- `ctx.hud.hint('…')`：底部的提示条。传空字符串收起来。
- `ctx.hud.callout('+3', '空心！', '#ffc93c')`：屏幕上方盖章一样的大字，一秒多自己消失。得分、失误、升级都用它。
- `ctx.hud.toast(标题, 副标题, 毫秒)`：屏幕中间的提示。
- `ctx.ui`：一个盖在画面上的 `<div>`，纯网页界面的游戏（答题、翻牌）把自己的元素加进去，结束时平台会清空。

### 音效和粒子
- `ctx.sfx`：主游戏的音效，`ding()` `sparkle()` `fail()` `boing()` `thud(0.5)` `splash()` `laugh()`。
- `ctx.tone(波形, 起始频率, 结束频率, 时长, 音量, 延迟)`、`ctx.noise(时长, 音量, 频率, 滤波)`：自己合成。
- `ctx.part(kind, x, y, z, size, opts)`：主游戏的粒子，`kind` 是 `'dust'` `'heart'` `'ha'` `'leaf'`，`opts` 里有 `vx vy vz g life op color grow`。全场共用 160 个，不用自己回收。
- `ctx.rnd()`：0 到 1 的随机数。**不要调主游戏的 `rnd()`**，那是摆放校园用的固定序列。

### 时间
- `ctx.elapsed`：这一局已经玩了多少秒（不算倒计时和暂停）。
- `ctx.after(秒, fn)`：过一会儿调 `fn`，暂停时不走，这一局结束后不会再触发。**不要用 `setTimeout`**。
- `ctx.on(target, type, fn)`：加事件监听，结束时平台自动拿掉。

### 结算和奖励
- `ctx.finish(score, {kicker, title, sub})`：这一局结束。平台会算奖牌、记本机纪录、发 RM、解锁成就、提交排行榜、弹结算面板。`sub` 是结算面板上的一行统计，例如 `'投 30 进 21（70%）'`。没有成绩就 `ctx.finish(null, ...)`。
- `ctx.earn(rm)`：局中直接发钱（算进一局 RM 60 的上限）。`ctx.unlock(id)`：解锁成就。
- `ctx.best`：本机最好成绩，没玩过是 `null`。
- `ctx.board.top(n)`：`Promise<[{name, value, ts, uid}]>`，离线时是空数组。
- `ctx.store.get(k)` / `ctx.store.set(k, v)`：这个游戏自己的小存档（解锁了什么之类），存在 `localStorage` 的 `xmum-mini-v1` 里。
- `ctx.pause()`、`ctx.quit()`：暂停、直接回游戏厅（不结算）。

### 可以直接用的主游戏全局
小游戏和主游戏在同一个全局作用域里，这些可以直接用：`THREE`、`M(color, opts)`（标准材质）、`box(w, h, d, mat, x, y, z, parent)`、
`gxGlow(color, opacity)`（发光的叠加材质，做地上的光圈）、`ANISO`、`npcBodyGeo` / `npcHeadGeo` / `npcLegGeo`（同学的身体，用之前先 `typeof` 判断一下）。
**不要改主游戏的全局状态**（`mode`、`nw` 的位置、`money`、`camYaw` 等），奶娃用 `ctx.player`，钱用 `ctx.earn`。

## 4. `XMini` 的其他方法

| | |
|---|---|
| `XMini.games` | 注册了的游戏列表 |
| `XMini.enter()` / `XMini.leave()` | 进、出游戏厅 |
| `XMini.open()` | 进游戏厅并打开游戏列表（标题页的「小游戏」按钮） |
| `XMini.play(id)` | 打开某个游戏的玩法卡片 |
| `XMini.start(id)` | 跳过卡片直接开一局（测试用） |
| `XMini.startAt(id, door)` | 从地图上别的门口直接开一局，不经过游戏厅；这一局结束（不再来一局）时把奶娃放回 `door = {x, z, h, name}`。KIP 商场门口的「超市大乱斗」用的是这个 |
| `XMini.quit()` | 结束当前这一局，回游戏厅 |
| `XMini.inside` / `XMini.active` / `XMini.state` | 在不在游戏厅里 / 正在玩的游戏 id / `'out' 'hall' 'count' 'play' 'pause' 'result'` |
| `XMini.best(id)` | 本机最好成绩 |
| `XMini.sim` | 测试用，见第 7 节 |

## 5. 排行榜

- 路径 `/mini/{gameId}/{uid} = {name, value, ts}`，规则在 `database.rules.json`：`gameId` 要符合上面的格式，`value` 是 0 到 1,000,000 的数、只能变高，`name` 必须等于这个人注册的昵称。
- **新加一个游戏不用改规则**，也不用重新发布。
- 榜上只存「越大越好」的整数。`board.lower:true` 的游戏，平台存的是 `1000000 - 成绩`，读出来再换回去，你不用管。
- 分数不要超过 1,000,000，小数会被舍掉。用时类的游戏用毫秒或者 0.1 秒做单位。
- 离线（没有配置 Firebase，或者预览版）时成绩只存在本机，结算面板和排行榜会写明「联机未开启」。

## 6. 怎么让它好玩

这是平台最在意的事。示范游戏是按下面这几条做的，新游戏也照着来：

- **30 秒内玩起来**。规则一句话说得清，玩法卡片上写的就是全部规则。一局 45 到 90 秒。
- **一只手能玩**。最好只用一个按钮或只用摇杆。别同时要摇杆和两个按钮。
- **每个动作都有反应**。成功：`callout` 大字 + 音效 + 粒子。失败：也要有（抖屏、闷响、告诉玩家错在哪，例如「出手早了一点」）。
- **连击**。连续成功给加成，音调跟着连击数往上爬（`660 * Math.pow(1.122, streak)`），断了要让人心疼。
- **越玩越快**。难度随进度涨，并且用 `callout` 告诉玩家「加速了」。
- **让人想再来**。奖牌线要有意思：铜牌第一次玩就差不多能拿到，银牌要认真玩，金牌要练几局。平台会在结算面板上写「离银牌还差 12 分」。
- **用模拟玩家定数值**（第 7 节）：写一个按时机出手、带一点随机误差的脚本，新手水平大概拿铜牌，熟练拿银牌，高手拿金牌。

## 7. 测试

**不要连正式数据库**：一律用 `test/offline.html`（它把 `window.XMUM_FIREBASE` 设成 `null`）。
- `test/offline.html`：离线，成绩只存本机。
- `test/offline.html?mock`：换成内存里的假 Firebase，可以看提交成绩和排行榜列表，刷新就没了。
- `test/offline.html?run=XMini.start('hoops')`：打开后直接进某个游戏。
- 手机尺寸：浏览器开发者工具切到手机模式后**刷新**（触屏是加载时判断的）。

**标签页在后台时浏览器不跑动画**，游戏会像停住了一样。自动化测试（包括 AI 用内置浏览器测试）用 `XMini.sim` 一步一步推：

```js
XMini.start('hoops');
XMini.sim.step(2.5);                       // 推过倒计时
XMini.sim.step(60, dt => {                 // 推 60 秒，每一步之前调一次
  if (Math.random() < dt * 2) XMini.sim.press('a');   // 平均每秒按两次
});
XMini.state;                                // 'result'
document.querySelector('.mg-score b').textContent;   // 得分
```

`XMini.sim.move(x, y, run)` 是一直推着摇杆，`XMini.sim.move(0, 0)` 松开。`step` 最后会画一帧，可以接着截图。

每个新游戏至少过一遍：
1. 从街机和从游戏列表各进一次；完整玩一局到结算；「再来一局」；「回游戏厅」。
2. 玩到一半按 P 暂停、继续、重新开始、退出游戏；玩到一半点右上角切到别的模式，回来看世界是不是正常。
3. 手机竖屏：看得清、按得到、HUD 不挡东西。
4. 排行榜分页里有这个游戏，离线时显示本机最好成绩。
5. 控制台没有报错。小游戏里抛异常平台会接住并回到游戏厅，但那算 bug。

## 8. 性能

在游戏厅里平台把整个校园藏起来了，所以小游戏的画面预算很宽，但手机还是要省：

- **每局的东西在 `start` 里建，不要在 `update` 里 `new`**。`update` 里不要创建几何体、材质、`Vector3`、数组；临时对象放在模块顶上复用。
- **重复的东西用 `THREE.InstancedMesh`**（参考 `canteen.js` 的人群），不要一人一个 `Mesh`。
- 一个游戏控制在 **60 次绘制、5 万个三角形**以内。现有两个是 40 到 55 次、2 到 3.5 万个三角形。
- **不要加灯**（`PointLight` 等）：加灯会让全场材质重新编译，手机上会卡一下。要发光用 `MeshBasicMaterial` 或 `gxGlow`。
- 画布贴图不超过 512×512，文字招牌 1024×128 够了。
- 粒子用 `ctx.part`，并按 `ctx.q` 减量。
- 不要用 `setInterval` / `setTimeout` / 自己的 `requestAnimationFrame`，都走 `update` 和 `ctx.after`。
- HUD 的文字只在变了的时候才写（`ctx.hud.*` 已经这样做了）；自己的 `ctx.ui` 元素也一样，别每帧改 `innerHTML`。

## 9. 平台是怎么接进主游戏的

给要改平台的人看。

- 在游戏厅里（包括玩小游戏时）`gx.paused = true`，和奶娃衣橱是同一个办法：主循环不跑 `updateNaiwaMode`，外面的车、保安、外卖和挑战的计时、水枪、车行全部停住。
- 平台每帧的入口是 `gx.frame(dt, T)`，`js/90-main.js` 的 `frame()` 里每帧都调（暂停时也调）。别的功能要用，像包 `gx.update` 那样包一层。
- 门口按 F 是包了一层 `roomTryF`；P / Esc 是包了一层 `gx.togglePause`；切到别的模式时 `gx.leave` 会把人送出游戏厅。
- 游戏厅搭在地图外 `(0, -2700)`，小游戏舞台在 `(0, -2950)`。进去时设 `window.XINDOOR = 'arcade'`，出来清掉。
- 进去时把场景里其他顶层物体的 `visible` 关掉（记在 `ARC.hid` 里），出来时原样恢复；光照换成一套室内的（`ARC_LIGHT`），出来时按「白天 / 黄昏 / 夜晚」按钮恢复；里面不下雨。
- 街机是按注册表自动生成的，前 9 个游戏有机台，再多的只在游戏列表里。
