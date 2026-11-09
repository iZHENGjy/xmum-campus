# XMUM 校园漫游

照着厦门大学马来西亚分校（XMUM）2025 年 9 月的校园平面图，用 Three.js 搭的一个 3D 校园小游戏。打开网页就能玩，不用安装，手机电脑都行。

### 👉 [点这里在线开玩：izhengjy.github.io/xmum-campus](https://izhengjy.github.io/xmum-campus/)

> 粉丝作品，不是学校官方项目。建筑外观根据公开照片简化，楼层数是估计。

[![开场画面](docs/screenshots/title.jpg)](https://izhengjy.github.io/xmum-campus/)

## 游戏截图

| | |
|---|---|
| ![奶娃在 A3 百姓大楼前](docs/screenshots/naiwa.jpg) | ![开着兰博鸡尼冲上跳台](docs/screenshots/drive.jpg) |
| **奶娃模式**：在 A3 百姓大楼前摆姿势，旁边走过去的是同学 | **开车**：开着兰博鸡尼冲上东边的跳台飞出去 |
| ![黑洞模式](docs/screenshots/hole.jpg) | ![校园夜景](docs/screenshots/night.jpg) |
| **黑洞模式**：和「DDL」「早八」「期末周」抢着吞树林 | **夜景**：一主四从和宿舍楼的窗户都会亮灯 |
| ![校园全景](docs/screenshots/overview.jpg) | ![XMUM 车行](docs/screenshots/shop.jpg) |
| **俯瞰**：照平面图摆的整个校园，点楼能看介绍 | **XMUM 车行**：送外卖、玩特技攒钱买车 |

## 怎么玩

| 模式 | 玩法 |
|---|---|
| 奶娃 | 奶娃在校园里走路、抢车、开车。送外卖赚钱，漂移和飞跃攒特技分，撞东西会被保安追。攒够钱去「XMUM 车行」买车。 |
| 黑洞 | 控制地上的黑洞，跟「DDL」「早八」「期末周」三个 AI 黑洞抢着吞校园，150 秒结算。 |
| 漫游 | 第一人称在校园里走，找 8 个打卡点。 |
| 俯瞰 | 转着看整个校园，点楼看介绍。 |

**电脑**：WASD 移动，Shift 跑，空格跳/漂移，F 上下车，R 大笑/喇叭，Q 撩头，G 车行，拖动鼠标转视角。
**手机**：左下摇杆移动，右下按钮做动作，拖动屏幕转视角。

## 本地运行

需要一个静态文件服务器（直接双击 `index.html` 打不开，浏览器会拦截本地脚本）：

```bash
python -m http.server 8000
```

然后打开 http://localhost:8000 。

## 联机和排行榜

默认是单机模式。按 [docs/FIREBASE.md](docs/FIREBASE.md) 配好 Firebase 并填进 `js/firebase-config.js` 后，就能看到其他在线玩家，并上全球排行榜。

## 代码结构

没有构建步骤，`index.html` 按顺序加载 `js/` 里的普通脚本，它们共享同一个全局作用域。

| 文件 | 内容 |
|---|---|
| `js/00-core.js` | 渲染器、相机、材质、建筑生成器 |
| `js/10-world.js` | 地面、道路、湖、所有楼、植物、天空、昼夜 |
| `js/20-fx.js` | 粒子、刹车痕、合成音效 |
| `js/30-naiwa.js` | 奶娃模型和动画 |
| `js/40-vehicles.js` | 跳台、车辆模型与物理、上下车、步行 |
| `js/50-missions.js` | 外卖任务、指南针、打卡 |
| `js/60-details.js` | 长椅、停车场、喷泉、学生 |
| `js/70-hole.js` | 黑洞模式 |
| `js/80-gta.js` | 保安追捕、特技、撞车判定、车行 |
| `js/90-main.js` | 模式切换、输入、镜头、小地图、主循环 |
| `js/net.js` | 联机与排行榜（Firebase） |

## 致谢与声明

- [three.js](https://threejs.org/)（MIT）
- 字体：Noto Sans SC / Noto Serif SC（Google Fonts, OFL）
- 「奶娃」形象致敬原作者，游戏里的模型是用代码拼出来的低多边形二创，不是原作素材。本项目是非商业的粉丝作品，原作者如有异议请开 issue，我们会撤下。
- 车行里的车名都是谐音恶搞名，与任何真实汽车品牌无关。
- 校名、楼名仅用于还原校园，本项目与厦门大学马来西亚分校无官方关系。
