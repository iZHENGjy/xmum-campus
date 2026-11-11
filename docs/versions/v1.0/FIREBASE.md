# 开启联机和全球排行榜（Firebase）

不配置也能玩：`js/firebase-config.js` 里保持 `window.XMUM_FIREBASE = null;`，游戏就是单机模式，不会连任何服务器。

想让大家在校园里看到彼此、在排行榜上比分，按下面的步骤做一次就行，大约 15 分钟，全程用浏览器点点点，不用写代码。

---

## 0. 你需要准备

- 一个 Google 账号。
- 游戏已经放在 GitHub Pages 上，记下网址，例如 `https://你的用户名.github.io/xmum-campus/`。

## 1. 创建 Firebase 项目

1. 打开 <https://console.firebase.google.com/>，用 Google 账号登录。
2. 点 **创建项目 / Add project**，名字随便起，例如 `xmum-campus`。
3. 问你要不要开启 Google Analytics：不需要，关掉即可。点 **创建项目**，等它转完。

## 2. 添加 Web 应用，拿到配置

1. 在项目首页点 **`</>`（Web）** 图标添加应用。
2. 应用昵称随便填，例如 `xmum-web`。**不要**勾选 Firebase Hosting（我们用 GitHub Pages）。点 **注册应用**。
3. 页面会显示一段代码，里面有 `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`。先留着这个页面，等第 5 步建好数据库后再复制（那时配置里才会有 `databaseURL`）。
   以后要再找：左上角齿轮 ⚙ › **项目设置 / Project settings** › 往下拉到 **你的应用 / Your apps** › 选 **配置 / Config**。

## 3. 开启匿名登录

1. 左侧菜单 **构建 / Build › Authentication**，点 **开始使用 / Get started**。
2. 在 **登录方法 / Sign-in method** 标签里点 **匿名 / Anonymous**，打开开关，**保存**。

玩家不需要注册，打开网页时会自动拿到一个匿名身份，用来区分“这是谁的分数”。

### 3b.（可选）开启 Google 登录，用来云存档

想让玩家换设备也能接着玩，再开一个 Google 登录：

1. 还在 **登录方法 / Sign-in method**，点 **添加新的提供方 / Add new provider** › **Google**，打开开关。
2. **项目的公开名称** 填玩家在 Google 授权弹窗里会看到的名字，例如 `XMUM 校园漫游`；**支持电子邮件** 选你自己的邮箱。点 **保存**。

游戏里的做法是：玩家先是匿名身份，在开场画面点「用 Google 登录」后，把 Google 账号绑到这个匿名身份上，排行榜成绩不会丢。如果这个 Google 账号以前在别的设备绑过，就直接切到那个账号。登录后，钱、车、改装、成就、最好成绩和昵称会存到 `/saves/{uid}`，哪边进度多就用哪边的。

不开 Google 登录也没关系，按钮点了会提示失败，其他功能照常。

## 4. 把 GitHub Pages 域名加入授权网域

1. 还在 **Authentication**，切到 **设置 / Settings** 标签 › **授权网域 / Authorized domains**。
2. 点 **添加网域 / Add domain**，填 `你的用户名.github.io`（只填域名，不要 `https://`，不要后面的路径）。
3. `localhost` 默认已在列表里，本地测试也能用。

## 5. 创建 Realtime Database（选新加坡）

1. 左侧菜单 **构建 / Build › Realtime Database**，点 **创建数据库 / Create Database**。
   注意是 **Realtime Database**，不是 Firestore。
2. 位置选 **新加坡 Singapore (asia-southeast1)**——玩家主要在马来西亚，延迟最低。位置建好后不能改。
3. 安全规则先选 **锁定模式 / Start in locked mode**，下一步我们会换成自己的规则。点 **启用**。
4. 建好后页面顶部会显示数据库地址，形如
   `https://xmum-campus-default-rtdb.asia-southeast1.firebasedatabase.app`

## 6. 粘贴安全规则

1. 在 Realtime Database 页面切到 **规则 / Rules** 标签。
2. 把编辑框里的内容**全部删掉**，打开本仓库根目录的 `database.rules.json`，复制全部内容粘进去。
3. 点 **发布 / Publish**。

这套规则做了这些事：
- 必须登录（匿名也算）才能读写。
- 每个人只能写自己的位置 `/presence/{uid}` 和自己的成绩 `/boards/{榜}/{uid}`，改不了别人的。
- 云存档 `/saves/{uid}` 只有本人能读，只有用 Google 登录的本人能写，匿名身份写不进去。
- 排行榜 `/boards` 和游戏时长统计 `/stats` 所有人都能读（排行榜本来就是打开游戏就能看到的），这样 GitHub Actions 不用密钥就能画图。每个人只能写自己的那条；秒数只能往上加，每次最多加 900 秒。
- 检查数据格式：名字最多 16 个字；黑洞榜（`hole2`、`hole`）0–100（%），特技榜和富豪榜 0–10,000,000；坐标限制在地图 ±700 米内；不许多塞别的字段。
- 成绩只能往上涨，不能被改低。
- 其他路径一律禁止读写。

## 7. 把配置填进游戏

1. 回到第 2 步的配置页面（齿轮 › 项目设置 › 你的应用），现在配置里应该有 `databaseURL` 一行了。如果没有，手动加上第 5 步看到的数据库地址。
2. 打开本仓库的 `js/firebase-config.js`，把
   ```js
   window.XMUM_FIREBASE = null;
   ```
   换成（数值用你自己的）：
   ```js
   window.XMUM_FIREBASE = {
     apiKey: "AIzaSy……",
     authDomain: "xmum-campus.firebaseapp.com",
     databaseURL: "https://xmum-campus-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "xmum-campus",
     storageBucket: "xmum-campus.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456"
   };
   ```
   注意：是 `window.XMUM_FIREBASE = { ... };`，不是 `const firebaseConfig = ...`。
3. 提交并推送到 GitHub，等 GitHub Pages 更新（一两分钟）。

## 8. 测试

1. 用两个浏览器（或者电脑 + 手机）打开游戏网址，都切到 **奶娃** 或 **漫游** 模式。
2. 屏幕上应出现「在线 2 人」，并且能看到对方的奶娃（开车时是车）和头顶的名字。
3. 玩一局黑洞、做几个特技或赚点钱，打开排行榜看看自己的名字。
4. 在 Firebase 控制台 › Realtime Database › **数据 / Data** 标签里能看到 `presence` 和 `boards` 两个节点。

如果没反应：按 F12 打开浏览器控制台，找以 `[XNet]` 开头的黄色警告，它会说明是哪一步失败了：
- `加载 Firebase SDK 超时 / 加载失败`：网络连不上 `www.gstatic.com`（例如在中国大陆没有翻墙）。游戏会自动退回单机，这是正常的。
- `匿名登录` 相关：第 3 步没开匿名登录，或第 4 步没加授权网域。
- `PERMISSION_DENIED` / `读取数据库` 失败：第 6 步规则没发布，或 `databaseURL` 填错了。

---

## 常见疑问

**配置里的 apiKey 放在公开的网页里安全吗？**
安全。Firebase 的 Web 配置本来就是公开的，任何打开网页的人都能看到，它只是告诉浏览器“连哪个项目”，不是密码。真正保护数据的是第 6 步的安全规则。千万不要把规则改成 `".read": true, ".write": true`。

**分数能作弊吗？**
能。分数是在玩家自己的浏览器里算出来再上传的，懂技术的人可以伪造请求提交一个假分数（规则只能保证格式和范围合理、只能改自己的、只能往上涨）。对粉丝小游戏来说这是可以接受的。真看到离谱的记录，可以在控制台 › Realtime Database › 数据 里直接删掉那一条。

**要花钱吗？**
默认的免费 **Spark 方案** 足够：Realtime Database 免费额度大约是 同时在线连接 100 个、存储 1 GB、每月下载流量 10 GB。一个玩家在线时大约每秒同步 5 次位置，几十人同时玩没问题。超出额度服务会暂停到下个月，不会自动扣钱（除非你主动升级到付费的 Blaze 方案）。可以在控制台 › Realtime Database › **用量 / Usage** 里看。

**数据库里存了什么？**
- `/presence/{uid}`：在线玩家的名字、模式、位置、朝向、开的车和颜色。关掉网页或断网时会自动删除。
- `/boards/hole2|hole|stunt|rich/{uid}`：每人每个榜一条最好成绩（名字、分数、时间）。`hole` 是旧版黑洞榜，已停止更新，记录保留。
- `/saves/{uid}`：Google 登录玩家的云存档（游戏进度和昵称）。
- `/stats/p/{uid}`：这个匿名身份第一次和最近一次玩的日期、总秒数、各玩法秒数、设备类型（手机、平板、电脑）。
- `/stats/d/{日期}/{uid}`：这个身份当天玩了几秒。README 里的「玩家数据」图就是用这两项算出来的。
不存邮箱、IP 之类的个人信息（Google 登录时邮箱只在 Firebase Authentication 里，数据库里没有）。

**想关掉联机？**
把 `js/firebase-config.js` 改回 `window.XMUM_FIREBASE = null;` 再推送即可。
