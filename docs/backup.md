# 数据库自动备份

线上 Firebase Realtime Database（项目 `xmum-campus`，区域 asia-southeast1）每 12 小时自动整库备份一次，加密后存成 GitHub Actions 的 Artifact，保留 14 天（约 28 份）。

- 工作流：[`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml)，马来西亚时间每天 **11:41** 和 **23:41** 左右（GitHub 的定时任务常会晚几分钟到几十分钟）。
- 备份脚本：[`scripts/db_backup.py`](../scripts/db_backup.py)；查看 / 恢复脚本：[`scripts/db_restore.py`](../scripts/db_restore.py)。
- 测试：`python test/db_backup_test.py`（全离线：假的 Google 令牌服务器、假的数据库、临时密钥，不碰线上数据）。

## 它做了什么

1. 用服务账号的 JSON 密钥（GitHub secret `FIREBASE_BACKUP_SA`）换一个 Google 访问令牌（权限范围 `firebase.database` + `userinfo.email`）。
2. `GET https://xmum-campus-default-rtdb.asia-southeast1.firebasedatabase.app/.json?format=export` 下载整个数据库（令牌放在请求头里，不进网址、不进日志）。
3. 检查：必须是有效的 JSON、不是空的、至少 1 KB，并且 `boards`、`names`、`users` 这几个核心节点都在。**任何一项不对，这次运行就失败，不保存备份**，GitHub 发邮件提醒你。这样数据库被误删或清空时，坏备份不会把前几天的好备份挤掉。
4. 用你的 **公钥** 加密（gpg），得到 `xmum-db-年月日-时分秒Z.json.gpg`（时间是 UTC，比马来西亚时间慢 8 小时），上传成 Artifact，14 天后 GitHub 自动删除。

明文只在脚本的内存里，不写硬盘、不打印、不上传。日志里只有大小、顶层节点名（`boards`、`saves`……）和每个节点下有多少条，没有任何玩家数据。

## 为什么这样存（隐私）

这个仓库是**公开**的，公开仓库的 Artifact 任何登录了 GitHub 的人都能下载。所以：

- 备份**绝不**提交进仓库，**绝不**明文上传；
- 上传的是用你的公钥加密的文件，只有握着私钥（并知道口令）的你能解开。别人下载到也只是一堆乱码。

备份里有玩家 uid、昵称、云存档、留言、游戏统计。（数据库里不存邮箱，Google 邮箱只在 Firebase Authentication 里，不在备份里。）

### Artifact 还是私有仓库？

| | **Artifact（现在用的）** | 推到另一个私有仓库 |
|---|---|---|
| 费用 | 免费（公开仓库的 Actions 和 Artifact 存储都免费） | 免费 |
| 保留 | `retention-days: 14`，到期 GitHub 自动删，不用写清理逻辑 | 永久，git 历史只增不减；想删旧备份得改写历史 |
| 谁能拿到 | 任何登录用户都能下载**加密文件**，没有私钥打不开 | 只有你（和你加的协作者） |
| 要多管的凭据 | 不用（上传 Artifact 不需要额外权限） | 还要一个能写私有仓库的 Deploy key 或令牌，多一个泄露点 |
| 缺点 | 只留 14 天；仓库删了备份也没了 | 配置多一步；仓库会越来越大 |

选 Artifact：更简单、少一个密钥、自动清理。加密之后“谁都能下载”不是问题。想长期留档的话，**每个月手动下载一份**放到自己的硬盘或网盘（文件本身是加密的）。

## 流量（Spark 免费额度每月下载 10 GB）

每次备份都会下载整个数据库，每月约 60 次。

- 现在大约 420 名玩家（见 `stats` 分支的玩家数据）。最大头是云存档 `/saves`（每份上限 3 万字符），其余节点每人只有几十到几百字节。估计整库 **1～5 MB**，每月 **60～300 MB**，占免费额度 **1%～3%**。
- 最坏情况：每个玩家都有满额云存档，约 13 MB × 60 = **约 0.8 GB/月（8%）**。
- 请求带了 `Accept-Encoding: gzip`，实际传输一般比上面更小。
- 每次运行的 Summary 页面都会写出这次实际下载了多少、按每月 60 次算一共多少。第一次手动运行后看一眼就知道真实数字。
- 单次下载超过 50 MB（每月约 3 GB）时，运行会出黄色警告。那时把 `db-backup.yml` 里的 `cron: '41 3,15 * * *'` 改成 `'41 15 * * *'`（每天一次）就能减半。

`docs/FIREBASE.md` 里写线上版已经换成 Blaze 方案；不管是 Spark 还是 Blaze，每月前 10 GB 下载都免费，上面的估算一样适用。

## 第一次设置（仓库主人自己操作）

> 密钥和私钥**只由你自己经手**：不要发给任何人，不要粘到聊天里，不要提交进仓库。

### 1. 创建只读的服务账号，下载 JSON 密钥

1. 打开 Google Cloud 控制台的服务账号页面：<https://console.cloud.google.com/iam-admin/serviceaccounts?project=xmum-campus>（用 Firebase 项目所有者的 Google 账号登录；顶部项目选择器确认是 `xmum-campus`）。
2. 点上方 **「+ 创建服务账号」（+ CREATE SERVICE ACCOUNT）**。
3. 「服务账号名称」填 `db-backup`，说明可写「GitHub Actions 每 12 小时只读备份」，点 **「创建并继续」**。
4. 「向此服务账号授予对项目的访问权限」→ **选择角色**，搜索 `Realtime Database`，选 **「Firebase Realtime Database Viewer」（Firebase Realtime Database 查看者，`roles/firebasedatabase.viewer`）**，点 **「继续」**，再点 **「完成」**。
5. 在列表里点刚建的 `db-backup@xmum-campus.iam.gserviceaccount.com` → 顶部 **「密钥」（KEYS）** 标签 → **「添加密钥」 › 「创建新密钥」** → 选 **JSON** → **「创建」**。浏览器会下载一个 `xmum-campus-xxxxxxxx.json`。

> 如果第 5 步提示「已停用服务账号密钥创建」，说明组织策略禁止了密钥，个人 Gmail 建的项目一般不会遇到。
>
> 角色说明：只给读取级别的 **Viewer**，这个账号不能改、不能删数据。Google 文档没有写清 Viewer 能不能通过 REST 读数据内容；如果第一次运行报 `HTTP 401` / `HTTP 403`（日志会提示），回到 **IAM**（<https://console.cloud.google.com/iam-admin/iam?project=xmum-campus>）点这个账号右边的铅笔，把角色换成 **「Firebase Realtime Database Admin」**，再跑一次。这个角色能写数据，所以密钥更要保管好（它只放在 GitHub secret 里）。

### 2. 把密钥加进 GitHub Secret

1. 打开 <https://github.com/iZHENGjy/xmum-campus/settings/secrets/actions>（仓库 › **Settings** › 左侧 **Secrets and variables** › **Actions**），停在 **Secrets** 标签。
2. 点 **「New repository secret」**。
3. **Name** 填 `FIREBASE_BACKUP_SA`。
4. **Secret**：用记事本打开刚下载的 `.json` 文件，`Ctrl+A` 全选、`Ctrl+C` 复制，粘进来（整个文件，包括开头的 `{` 和结尾的 `}`）。
5. 点 **「Add secret」**。
6. 回到「下载」文件夹，**删除**这个 `.json` 文件并清空回收站。以后需要新密钥就在第 1 步的页面再建一个，旧的删掉。

### 3. 在自己电脑上生成加密用的密钥对

用 Git 自带的 **Git Bash**（开始菜单搜 “Git Bash”），里面已经有 `gpg`，不用另外安装。下面导出的文件会放在你的用户文件夹 `C:\Users\你的用户名` 里（`~` 就是它；不放桌面，免得被 OneDrive 同步上云）。

1. 生成密钥（会弹窗让你设一个**口令**，请设一个够长、你记得住的，并记到密码管理器里）：

   ```bash
   gpg --quick-generate-key "XMUM DB Backup" default default never
   ```

2. 导出**公钥**（给 GitHub 用，可以公开）：

   ```bash
   gpg --armor --export "XMUM DB Backup" > ~/xmum-backup-public.asc
   ```

3. 导出**私钥**做离线备份（解密全靠它，丢了所有备份就都打不开了）：

   ```bash
   gpg --armor --export-secret-keys "XMUM DB Backup" > ~/xmum-backup-PRIVATE.asc
   ```

   把 `xmum-backup-PRIVATE.asc` 拷到 **U 盘**（再存一份到密码管理器的安全笔记里也行，它本身有口令保护），然后**删掉用户文件夹里这份**。不要放进这个仓库，不要发给任何人。

4. 记下指纹，用来核对：

   ```bash
   gpg --fingerprint "XMUM DB Backup"
   ```

私钥同时留在这台电脑的 gpg 里（`~/.gnupg`），以后在这台电脑上解密不用再导入。换电脑时：`gpg --import xmum-backup-PRIVATE.asc`。

### 4. 把公钥加进 GitHub Variable

1. 还是 <https://github.com/iZHENGjy/xmum-campus/settings/variables/actions>（**Secrets and variables › Actions**），切到 **Variables** 标签。
2. 点 **「New repository variable」**。
3. **Name** 填 `BACKUP_PUBLIC_KEY`。
4. **Value**：用记事本打开用户文件夹里的 `xmum-backup-public.asc`，全选复制粘进来（从 `-----BEGIN PGP PUBLIC KEY BLOCK-----` 到 `-----END PGP PUBLIC KEY BLOCK-----` 整段）。
5. 点 **「Add variable」**。

> 公钥不是秘密，所以放在 Variable 里。万一不小心粘成了私钥（`PRIVATE KEY BLOCK`），工作流会直接失败并提醒你：那就立刻删掉这个变量，从第 3 步重新生成一对。

### 5. 打开失败邮件提醒

1. GitHub 右上角头像 › **Settings** › **Notifications**（<https://github.com/settings/notifications>）。
2. 往下找到 **System › Actions**，勾上 **Email**，并勾 **「Only notify for failed workflows」**。

定时工作流失败时，GitHub 会发邮件给最后修改这个工作流 `cron` 那一行的人（合并这个 PR 后就是你）。

### 6. 合并后手动跑一次

1. 打开 <https://github.com/iZHENGjy/xmum-campus/actions/workflows/db-backup.yml>（**Actions** › 左侧 **数据库备份**）。
2. 右边 **「Run workflow」** › 分支选 `main` › 绿色 **「Run workflow」**。
3. 一两分钟后刷新，应该是绿色 ✓。点进去：
   - **Summary** 里有这次下载了多少、每月约多少流量、各顶层节点的条数，以及**公钥指纹**——和第 3 步第 4 条看到的指纹对一下，要一模一样；
   - 页面底部 **Artifacts** 有一个 `xmum-db-…`，下载下来按下一节解密试试，确认能打开。
4. 如果是红色 ✗：点进去看红字。常见的有：
   - `没有设置 FIREBASE_BACKUP_SA` / `BACKUP_PUBLIC_KEY`：第 2 / 4 步没做或名字拼错；
   - `换取访问令牌失败 … invalid_grant`：密钥粘贴不完整，或者在控制台被删了，重新建一个；
   - `HTTP 401` / `HTTP 403`：角色不够，见第 1 步最后的说明。

## 下载和解密一份备份

1. **Actions › 数据库备份** › 点某一次成功的运行 › 底部 **Artifacts** › 下载 `xmum-db-…`，得到一个 `.zip`。
2. 解压到一个**仓库以外**的文件夹（例如「下载」，别放进 `xmum-campus` 文件夹，免得被误提交），得到 `xmum-db-20261112-034100Z.json.gpg`（文件名里是 UTC 时间）。
3. 在 Git Bash 里进到那个文件夹（例如 `cd ~/Downloads`），解密（会弹窗问口令）：

   ```bash
   gpg --output backup.json --decrypt xmum-db-20261112-034100Z.json.gpg
   ```

4. 看个大概。先告诉 Git Bash 脚本在哪（仓库放在别处就改一下路径），之后的命令都用 `$R`：

   ```bash
   R=~/Documents/xmum-campus/scripts/db_restore.py
   ```

   ```bash
   python $R summary backup.json
   ```

> 解密出来的 `backup.json` 是全体玩家的明文数据。**用完就删**，不要上传、不要发给别人。

`db_restore.py` 也能直接读下载的 `.zip` 或 `.json.gpg`（它会调用 gpg 解密）。如果没弹出输入口令的窗口、报解密失败，就按上面第 3 步先手动解密，再用 `backup.json`。

## 恢复

> ⚠️ **恢复是“覆盖”，不是“合并”。** 恢复某个路径，会把线上这个路径下的**所有**内容替换成备份里的样子，备份之后这里新产生的数据都会丢失。恢复**整个数据库**会覆盖**全部**数据：备份之后所有人的新成绩、新昵称、新存档、新留言都会没有。
>
> 动手前：先手动跑一次「数据库备份」，把**现在**的状态也存一份，万一恢复错了还能回来。

### 恢复一个玩家的云存档（最常见）

1. 先让这个玩家**关掉游戏**（游戏开着时会自动同步存档，可能把你恢复的内容又覆盖掉）。
2. 按昵称查 uid：

   ```bash
   python $R find-name backup.json 他的昵称
   ```

3. 取出他的存档：

   ```bash
   python $R extract backup.json saves/这里填uid -o save.json
   ```

4. 写回线上，二选一：
   - **控制台（推荐，不需要额外的密钥）**：Firebase 控制台 › Realtime Database › **数据**，点 `saves`，再点这个 uid 的名字，让它变成数据面板最上面显示的节点（网址末尾会变成 `…saves~2F这个uid`）。确认最上面显示的**就是这个 uid**，再点数据面板右上角的 **⋮** › **「导入 JSON」** › 选 `save.json` › 导入。
     ⚠️ 千万别停在 `saves` 这一层导入，那会把**所有人**的存档换成这一个人的。如果线上已经找不到这个 uid（整个被删了），就用下面的脚本方法。
   - **脚本**：见下面「用脚本恢复」。
5. 让玩家重新打开游戏登录。删掉 `save.json` 和 `backup.json`。

其他路径同理，例如某个排行榜 `boards/rich`、某个人的榜单记录 `boards/rich/uid`、留言墙 `wall`。

### 恢复整个数据库

只在数据库被大面积删除或破坏时才这样做。

- **控制台**：Realtime Database › **数据**，停在最上面的根节点（不点进任何子节点），右上角 **⋮** › **「导入 JSON」** › 选解密后的 `backup.json`。这会**替换整个数据库**。
- **脚本**：`python $R put ROOT --from backup.json --key 写权限密钥.json`，它会要求你输入「覆盖整个数据库」才继续。（Git Bash 会把单独的 `/` 改成 Windows 路径，所以根节点写 `ROOT`。）

恢复后：在线人数、附近玩家这些实时节点（`on`、`pres`、`presence`、`social`）会是备份那一刻的旧状态，玩家重新连线后会自动刷新，旧的会在断线清理时消失，不用管。

### 用脚本恢复（REST PUT）

备份用的账号是只读的，不能写。用脚本写回需要一个**有写权限**的临时密钥：

1. 在服务账号页面再建一个账号，例如 `db-restore`，角色选 **「Firebase Realtime Database Admin」**，按第 1 步建一个 JSON 密钥下载到电脑。
2. 运行（先 `extract` 出要恢复的那部分）：

   ```bash
   python $R put saves/这里填uid --from save.json --key ~/Downloads/xmum-campus-xxxx.json
   ```

   它会显示要覆盖的路径，让你再输入一遍路径确认。
3. 用完立刻到控制台**删除这个密钥**（服务账号 › 密钥 › 垃圾桶），删掉下载的 `.json`。**写权限的密钥永远不要放进 GitHub。**

## 日常维护

- **失败邮件**：说明那一次没有备份成功，但之前的备份都还在。点邮件里的链接看红字原因。如果写着「缺少这些节点」，说明线上数据库可能被误删了，**先别急着修**，去控制台看一眼，需要的话按上面恢复。
- **60 天没动静会停**：公开仓库连续 60 天没有任何提交，GitHub 会自动停用定时工作流（停用前会发邮件）。收到后到 **Actions › 数据库备份** 点 **「Enable workflow」** 即可。
- **长期留档**：Artifact 只留 14 天。想留更久，就每个月下载一份 `.zip` 存到自己的硬盘或网盘（加密的，放网盘也安全）。
- **换密钥**：建议每年换一次服务账号密钥：建新密钥 → 更新 `FIREBASE_BACKUP_SA` → 手动跑一次确认 → 在控制台删旧密钥。怀疑泄露时立刻删除旧密钥。
- **换 gpg 密钥对**：生成新的、更新 `BACKUP_PUBLIC_KEY`。**旧私钥要继续留着**，否则旧备份打不开（14 天后旧备份全部过期，那时旧私钥才可以不要）。
- **改频率**：改 `db-backup.yml` 里的 `cron`（UTC 时间），按 `CLAUDE.md` 的分支规则发 PR 到 `main`。
