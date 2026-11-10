# XMUM 校园漫游 · 开发规则

线上：https://izhengjy.github.io/xmum-campus/（`main`）
预览：https://izhengjy.github.io/xmum-campus/preview/（`dev`，只给自己和测试同学）

## 分支
- `main` = 线上版本，有分支保护，只接受 PR。只合并 bug 修复和紧急优化。
- `dev` = 下一个版本，攒新功能。新功能的 PR 一律开到 `dev`。
- 线上修 bug：PR 开到 `main`，合并后再把 `main` 合并回 `dev`，让 `dev` 也拿到修复。
- 统一发布：把 `dev` 合并进 `main`（发 PR），打版本标签，在 Releases 写更新说明。
- **任何 PR 都要等仓库主人说「可以」再合并**，合并前先说清楚测了什么。
- 解决冲突时两边的改动都保留。

## 部署（`.github/workflows/pages.yml`）
- 推送到 `main` 或 `dev` 都会重新部署：`main` 放在根目录，`dev` 放在 `/preview/`。
- 预览版**永远不连正式数据库**：部署时把 `js/firebase-config.js` 换成离线配置；如果 `dev` 里有 `js/firebase-config.preview.js`（测试用的 Firebase 项目），就用它。
- 预览版和正式版在同一个域名下，所以部署时会给预览页面注入 `preview-guard.js`，把所有 localStorage 键加上 `xmum-preview:` 前缀，预览进度不会覆盖正式存档。

## 代码约定
- 原生 Three.js r128，没有构建步骤；`index.html` 按顺序加载 `js/*.js`，全局作用域共享。
- 改了 JS 或 CSS，`index.html` 里所有 `?v=` 加一。合并到 `dev` 的 PR 不用改，发布时统一改。
- 本地测试用离线页面或 `window.XMUM_FIREBASE = null`，不要把测试成绩写进正式排行榜。
- 数据库规则在 `database.rules.json`，改了要在 PR 里写明「需要重新发布规则」。
- 回复仓库主人用中文。
