/* XMUM 校园漫游 · 主线剧情的数据：人机奶蛙、八章步骤、支线、采购单、日记句子、手机消息、想家独白
 *
 * 设计依据 docs/quests.md。这里只放数据和判断条件，状态、轮询、奖励、存档都在 js/89-quest.js，界面在 js/89-quest-ui.js。
 * 玩家看得见的文字尽量用「我 / 你」，非写不可时用「奶蛙」（主角名字还没定是否全改，不要批量改「奶娃」）。
 *
 * ---------- 格式 ----------
 * XQD.people[id] = {name, icon, color}                  发手机消息的人（妈妈、小满……），icon 是一个字或 emoji
 * XQD.npcs[id]   = {name, short, color, at:[x, z, h] 或 () => [x, z, h], look:{wardrobe slot: item id}, shape, chat:[闲聊句子], place:'南门'}
 *                  人机奶蛙：makeNaiwa + nwDress，60 米外隐藏；at 是函数时运行时再读（场景是别的文件建的）。
 * XQD.chapters   = [{n, id, title, npc, place, intro:[[who, 台词]], outro:[[who, 台词]], report:'回南门找小满',
 *                    reward:{rm, car, parts:{id:n}, items:[wardrobe id], title, note:'奖励卡上的一句'}, unlock:'drive'|'park'|'train',
 *                    unlockAt:'start'|'end'（默认 start：见到这一章的人就解锁；drive 是第 1 章 end）,
 *                    guide:[XGuide 页 id]（「看说明 ›」跳去的旧页面）, diaryStart, diaryEnd, recap（老玩家补记的一句）,
 *                    steps:[步骤]}]
 *   步骤 = {id, text, rm, done:Q => bool, count:Q => [现在, 目标]（可选，任务条上显示 3/5）,
 *           at:[x, z] 或 Q => [x, z]（可选：指南针、小地图黄星、地上黄圈指这里）, r:黄圈半径（可选，默认 6，0 = 不画圈）,
 *           hint:{pc:'电脑的操作提示（可以有 <kbd>）', touch:'手机的提示', flash:'手机上闪黄边的按钮选择器'},
 *           tip:'日记里展开写的一句', guide:'看说明 › 跳去的页 id', isNew:true（代码里原本没有这个判断：老玩家迁移时直接算完成）,
 *           nudge:'卡 10 分钟还没做完，引路人发的一条提示', parts:{id:n}（额外的改装道具奖励）}
 *   Q（判断条件拿到的工具，见 js/89-quest.js qTools）：
 *     Q.ach(id) Q.best(k) Q.life(k) Q.owned(kind) Q.worth() Q.money() Q.flag(k) Q.near(x, z, r) Q.driving() Q.night()
 *     Q.ward(slot) 现在穿的  Q.mini(id) 小游戏有成绩  Q.house() 买过几套房  Q.deco() 一套房最多几件家具  Q.parts(id)  Q.tunedRare()
 * XQD.sides      = [{id, npc, after:'c2'（这一章做完才出现）, text, done:Q => bool, rm, parts:{}}]
 * XQD.diary[id]  = '日记句子，{name} 这样的空位从记录里的 v 填'；按章节放，句子 id 不要改（存档里记的是 id）
 * XQD.msgs[id]   = {from:'mom'|'xiaoman'|npc id, text}
 * XQD.events     = [{id, when:Q => bool, diary:id, msg:id, minCh:章（可选）}]  「第一次」这类事：条件第一次成立时记一句日记 / 发一条消息，只一次
 * XQD.homesick   = {first:'……我想家了。', more:[...], night:'...'}
 * XQD.watch      = [(Q, flag, dt) => {...}]  每 0.5 秒调一次，给需要计时的「新」条件用：自己判断，满足了 flag('sofa5')，步骤里写 done:Q => Q.flag('sofa5')
 * 章节还可以写 endCine:'ending'（结尾台词说完播这段过场，播完或跳过才发这一章的奖励）、startMsg / endMsg（消息 id）
 * 改了步骤 id 会让老存档里的打勾对不上，只加不改。 */
'use strict';
window.XQD = (() => {
  const D = {people:{}, npcs:{}, chapters:[], sides:[], diary:{}, msgs:{}, events:[], homesick:{}, watch:[]};
  const K = (pc, touch) => (typeof TOUCH !== 'undefined' && TOUCH) ? touch : pc;
  const npcAt0 = id => window.XQuest && XQuest.npcAt ? XQuest.npcAt(id) : null;

  /* ---------- 发消息的人 ---------- */
  Object.assign(D.people, {
    mom:{name:'妈妈', icon:'妈', color:'#e8708a'},
    xiaoman:{name:'小满学姐', icon:'满', color:'#3f8fe6'},
    memo:{name:'日记', icon:'📖', color:'#a07a52'},   /* the voice of 「重温这一章」 (js/89-quest.js replay) */
    cat:{name:'小橘', icon:'🐱', color:'#e39a4c'}       /* the campus cat (js/89-kitty.js) */
  });

  /* ---------- 人机奶蛙（角色都是虚构的） ---------- */
  /* 南门：校碑在门外中轴线上（x≈96, z≈258，铁门关着）；小满站在门里中轴线东边一点（新玩家开场后就出生在她旁边，x 96 z 242），面朝南门。 */
  D.npcs.xiaoman = {name:'小满学姐', short:'小满', color:'#3f8fe6', place:'南门', at:[101, 238.5, 0],
    look:{skin:'classic', outfit:'shirt', neck:'badge', head:'buns'}, shape:'slim',
    chat:['迷路了就按 M 看地图，我画得可清楚了。', '今天的外卖单多不多？D6 那边最旺。', '有事就来南门找我，我天天在这儿。']};

  /* ================= 第 1 章 新生报到（核心，js/89-quest.js 的作者负责） ================= */
  D.chapters.push({n:1, id:'c1', title:'新生报到', npc:'xiaoman', place:'南门', unlock:'drive', unlockAt:'end',
    guide:['keys', 'map', 'hello'], report:'回南门找小满学姐', diaryStart:'c1_start', diaryEnd:'c1_end', endMsg:'xm_ch1done',
    recap:'（补记）那时候刚来，走路送外卖，跑得腿都软了。',
    intro:[
      ['xiaoman', '欢迎来到 XMUM！大巴一路晃过来累了吧？'],
      ['xiaoman', '你就是今年最后一个报到的吧？钱包里……就这么点？'],
      ['xiaoman', '这个迎新工作牌给你，挂上它大家就知道你是新来的，有事会帮你。'],
      ['xiaoman', '先别想着开车啦，走路把学校认熟。迷路了就打开地图，忘了怎么做就按 P 翻手册，我都写在里面了。'],
      ['xiaoman', '第一站：顺着屏幕上面的指南针，走到 A3 大台阶。去吧！']
    ],
    outro:[
      ['xiaoman', '两单都送到了？还荡了秋千？可以啊，比我当年强多了。'],
      ['xiaoman', '喏，这是一辆 Myvi 的钥匙，学长毕业留下的，旧是旧了点，跑得动。'],
      ['xiaoman', () => K('开车：W / S 油门刹车，A / D 转向，按住空格漂移，F 下车。车就停在你旁边。', '开车：左下摇杆推着走，右下「漂移」按住甩尾，「下车」下来。车就停在你旁边。')],
      ['xiaoman', '还有，学校里那些发光的圈——比赛、潜入委托、宿舍搜刮、B1 游戏厅——从今天起都对你开放了，地图上都标着，想玩哪个去哪个。'],
      ['xiaoman', '有车了就去 D6 食堂找站长老周，他那儿缺人跑单。我在南门，有事来找我！']
    ],
    reward:{rm:200, car:'myvi', note:'一辆 Myvi，从此能开车'},
    steps:[
      {id:'c1_a3', text:'跟着指南针走到 A3 大台阶', rm:20, at:[105, 120], r:7, isNew:true,
        done:Q => Q.near(105, 120, 9),
        hint:{pc:'<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走路，跟着屏幕上方的指南针', touch:'左下摇杆走路，跟着指南针', flash:'#joy'},
        tip:'A3 是学校正中间那栋最高的楼，台阶很宽，顺着中轴线一直往北走就到了。', guide:'keys',
        nudge:'找不到 A3？出南门往回走，沿着中轴线一直往北，最高那栋就是。'},
      {id:'c1_run', text:'跑起来（连续跑 3 秒）', rm:10, isNew:true,
        done:Q => Q.flag('run3'),
        hint:{pc:'走路时按住 <kbd>Shift</kbd> 就是跑', touch:'把摇杆推到最边上就是跑', flash:'#joy'},
        tip:'跑步比走路快一倍，送外卖赶时间全靠它。', guide:'keys'},
      {id:'c1_map', text:'打开大地图，找到 D6 食堂', rm:10, isNew:true,
        done:Q => Q.flag('map'),
        hint:{pc:'按 <kbd>M</kbd> 打开大地图，找到 D6 食堂', touch:'点右上角的小地图，打开大地图', flash:'#mini'},
        tip:'大地图能拖、能缩放；橙色的点是外卖取餐，D6 食堂在东边。', guide:'map'},
      {id:'c1_guide', text:'翻一翻游戏指南', rm:10, isNew:true,
        done:Q => Q.flag('guide2'),
        hint:{pc:'按 <kbd>P</kbd> 打开游戏指南，往后翻一页', touch:'点「暂停」，再点「指南」，往左滑一页', flash:'#gxPauseBtn'},
        tip:'第一页就是这本日记，往后翻是各种玩法的说明。', guide:'hello'},
      {id:'c1_badge', text:'打开衣橱，戴上迎新工作牌', rm:20, isNew:true,
        done:Q => Q.ward('neck') === 'badge',
        hint:{pc:'按 <kbd>C</kbd> 打开衣橱，在「颈部」里选迎新工作牌', touch:'点右上角「奶娃衣橱」，在「颈部」里选迎新工作牌', flash:'#wardBtn'},
        tip:'工作牌是开学那天学姐给的，在衣橱「颈部」那一栏，不要钱。'},
      /* 送外卖之前先回南门：小满讲怎么接单（橙色光圈、接单卡、接单开关），说完把接单开关打开 */
      {id:'c1_xm', text:'回南门找小满学姐，学怎么接外卖', rm:10, isNew:true, at:() => npcAt0('xiaoman'), r:0,
        talkTo:'xiaoman', talkFlag:'q_c1xm', done:Q => Q.flag('q_c1xm'),
        lines:[
          ['xiaoman', '学校认得差不多了吧？接下来教你挣钱。'],
          ['xiaoman', 'D6 食堂、LY3 食堂、B1 餐厅门口都有橙色的光圈。走进去会弹一张单子，挑一单就接。'],
          ['xiaoman', () => K('接单开关在屏幕上面指南针的旁边，按 J 也能开关。要开着才会弹单子哦。', '接单开关在屏幕上面指南针的旁边，点一下就能开关。要开着才会弹单子哦。')],
          ['xiaoman', '这个月只派校园里的单，时间也多给你一半，走路跑步都来得及。去吧！']
        ],
        onTalk:() => { if (typeof offerToggle === 'function' && typeof OFFER !== 'undefined' && !OFFER.on) offerToggle(true); },
        hint:{pc:'回南门，走到小满学姐旁边按 <kbd>F</kbd> 说话', touch:'回南门，走到小满学姐旁边点「说话」', flash:'#act-f'},
        tip:'小满在南门里面，校碑旁边。'},
      {id:'c1_deliv1', text:'走路送出第一单外卖', rm:30,
        done:Q => Q.ach('deliv1'),
        hint:{pc:'走进橙色光圈，按 <kbd>F</kbd> 或 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 接单', touch:'走进橙色光圈，点卡片上的单子接单', flash:'#mini'},
        tip:'这一章的外卖只派校园里的单，时间也多给一半，走路跑步都来得及。', guide:'earn',
        nudge:'D6 食堂门口有橙色圈圈，从那儿接单最近。'},
      /* 仓库主人：走路送两单意思一下就够了（id 还叫 c1_deliv5，存档里记的是 id，不改） */
      {id:'c1_deliv5', text:'再送一单（一共 2 单）', rm:60,
        done:Q => Q.life('deliv') >= 2, count:Q => [Math.min(2, Q.life('deliv')), 2],
        hint:{pc:'看屏幕上方的倒计时，跟着指南针跑', touch:'看屏幕上方的倒计时，跟着指南针跑'},
        tip:'送晚了顾客会给差评，跑起来！', guide:'earn',
        nudge:'送单的时候摇杆推到底跑，时间很宽裕的。'},
      {id:'c1_swing', text:'去音乐岛旁边荡一次秋千', rm:20, at:[-26, -58], r:5,
        done:Q => Q.ach('swing'),
        hint:{pc:'走到秋千旁按 <kbd>F</kbd> 坐上去，按住 <kbd>空格</kbd> 越荡越高', touch:'走到秋千旁点「上车」坐上去，按住「荡」越荡越高', flash:'#act-f'},
        tip:'秋千在音乐岛西边的草坪上，荡高了松手能飞出去。',
        nudge:'秋千在音乐岛西边，树林边的草坪上，地图上找「秋千」两个字。'},
      /* 遇到校园里的小猫（js/89-kitty.js）：慢慢走过去，按 F 喂小鱼干，拍张照发给妈妈 */
      {id:'c1_cat', text:'喂喂校园里的小猫，拍张照发给妈妈', rm:20, isNew:true, kitty:true, at:() => window.XKitty ? XKitty.nearestAt() : null, r:0,
        done:Q => Q.flag('q_cat'),
        hint:{pc:'慢慢走过去（别按 <kbd>Shift</kbd> 跑），走到它旁边按 <kbd>F</kbd>', touch:'摇杆轻轻推，慢慢走过去，走到它旁边点「喂猫」', flash:'#act-f'},
        tip:'校园里到处都有小猫，晒太阳、打盹。一跑过去它们就溜了。',
        nudge:'指南针指着最近的一只小猫，慢慢走过去就不会把它吓跑。'}
    ]});

  D.diary.c1_start = '小满学姐塞给我一个工作牌，说先走路把学校认熟。';
  D.diary.c1_a3 = 'A3 的台阶好宽，站在上面能看到整条中轴线。';
  D.diary.c1_deliv1 = '送出了第一单外卖，手心全是汗。';
  D.diary.c1_late = '送第一单外卖的时候差点迟到，跑得腿都软了。';
  D.diary.c1_swing = '在音乐岛旁边荡秋千，荡到最高的时候好像能飞起来。';
  D.diary.c1_cat = '学校里有一只橘猫，喂了它两块小鱼干，拍了张照发给妈妈。妈妈说它比我可爱。';
  D.diary.c1_cat_keep = '学校里有一只橘猫，喂了它两块小鱼干。照片没发，自己留着看。';
  D.diary.c1_end = '学姐把一辆 Myvi 的钥匙交给我。我有车了！';
  D.diary.homesick = '{when}有一架黄色的飞机从头顶飞过去……我想家了。';
  D.diary.intro = '飞机落地的时候，窗外全是一排一排的油棕树。';

  D.msgs.mom_arrive = {from:'mom', text:'到学校了吗？到了跟妈说一声。'};
  D.msgs.mom_cat = {from:'mom', text:'好可爱！！是学校里的猫吗？你也要按时吃饭，别光喂猫。'};
  D.msgs.mom_rain = {from:'mom', text:'刚看了天气，雪邦下雨了吗？记得带伞。'};
  D.msgs.mom_video = {from:'mom', text:'视频吗？你爸也在。'};
  D.msgs.mom_car = {from:'mom', text:'开车慢点！！'};
  D.msgs.mom_late = {from:'mom', text:'这么晚还不睡？'};
  D.msgs.xm_ch1done = {from:'xiaoman', text:'车开稳一点哦。老周在 D6 等你，他嘴硬心软。'};

  D.events.push(
    {id:'ev_late1', when:Q => Q.flag('lateDeliv'), diary:'c1_late'},
    {id:'ev_drive', when:Q => Q.driving() && Q.unlocked('drive'), msg:'mom_car'},
    {id:'ev_night', when:() => { const h = new Date().getHours(); return h >= 1 && h < 5 && performance.now() > 600000; }, msg:'mom_late'}   /* 凌晨还玩了 10 分钟以上 */
  );

  D.homesick = {
    first:'……我想家了。',
    more:['不知道家里现在几点了。', '好想吃妈妈做的饭。', '下次放假，坐那班飞机回去。'],
    night:'家那边，现在也是晚上吗？'
  };

  /* ================= 第 2–7 章、支线、其余日记和消息（内容分工：只改这一段） ================= */
  /* CONTENT:BEGIN */
  /* 这一段只放数据。判断条件里读的全局（tune、TN、mgSave、XHouse、XTrain、XPark、XF1、SC_X……）都是前面的文件建好的，
     这个文件在它们后面加载；条件都在 js/89-quest.js 的 qDone 里 try 着跑，读不到就当没完成。
     Q.mini / Q.house / Q.deco 现在读不到真实数据（xmum-mini-v1 的成绩在 best / plays 下面，XHouse 没有 owned() / decoMax()），所以这里自己读。 */
  const G = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  /* B1 小游戏玩过没有：榜 id 是「游戏id」或「游戏id_模式id」（js/91-arcade.js），plays 记局数，best 记成绩 */
  const mgSaved = () => G(() => mgSave, null) || G(() => JSON.parse(localStorage.getItem('xmum-mini-v1') || 'null'), null) || {};
  const played = id => { const s = mgSaved(); return Object.keys(s.plays || {}).concat(Object.keys(s.best || {})).some(k => k === id || k.indexOf(id + '_') === 0); };
  const bigeatWon = () => (+G(() => mgSaved().store.bigeat.won, 0) || 0) > 0;
  /* 房子（js/89-house.js）：XHouse.save = 存档 hz，XHouse.state = HZ（在哪套房里、坐着没有） */
  const hzS = () => G(() => XHouse.save, null) || {own:{}};
  const houseFirst = () => G(() => XHouse.houses.find(h => hzS().own[h.id]), null);
  const decoMost = () => Math.max(0, ...Object.values(hzS().own || {}).map(o => Object.keys(o.s || {}).length));
  /* 改装（js/93-tuning-ui.js 的 tune、js/42-tuning.js 的 TN）：任意一辆车装着一件中改（tier r）以上、自己做出来的零件 */
  const tunedRare = () => G(() => Object.keys(tune.cars).some(k => {
    const c = tune.cars[k];
    return Object.keys(c.fit).some(s => { const it = TN.byKey[s + '.' + c.fit[s]]; return !!it && !!it.tier && it.tier !== 'n' && c.own.includes(it.key); });
  }), false);
  const SHOWROOM_AT = () => G(() => [SHOWROOM[0], SHOWROOM[1]], [42, 196]);
  const stationDoor = () => G(() => XTrain.station.door, {x:950, z:520});

  /* ---------- 发消息的人机奶蛙 ---------- */
  Object.assign(D.people, {
    laozhou:{name:'站长老周', icon:'周', color:'#e67e22'},
    juanjuan:{name:'卷卷', icon:'卷', color:'#8e6bd8'},
    aming:{name:'阿明', icon:'明', color:'#2e9e6a'},
    ben:{name:'Ben 师傅', icon:'B', color:'#d0453a'},
    lim:{name:'Uncle Lim', icon:'林', color:'#3a6f9a'}
  });

  /* ---------- 人机奶蛙：坐标都在浏览器里用 hitsBuilding(x, z, 1) / footBlocked 验过，站在路边、不挡门口的圈 ---------- */
  /* D6 食堂外卖取餐点（js/50-missions.js PICKUPS，342, −146.4）东北边几步，面朝取餐点 */
  D.npcs.laozhou = {name:'站长老周', short:'老周', color:'#e67e22', place:'D6 食堂外卖点', at:[347, -141, -Math.PI / 2],
    look:{skin:'orange', outfit:'redvest', head:'melon'}, shape:'chubby',
    chat:['单子又爆了，你还站在这儿聊天？', '下雨天单价高，别怕湿。', '送晚了别找借口，顾客只看时间。']};
  /* A3 大台阶东边（台阶顶上，潜入委托的两个蓝圈在 x 91 / 105、z 128，离她 7 米以上） */
  D.npcs.juanjuan = {name:'卷卷', short:'卷卷', color:'#8e6bd8', place:'A3 图书馆大台阶', at:[112, 121, 0],
    look:{skin:'white', face:'glasses', back:'bag', hand:'coffee'}, shape:'std',
    chat:['我今天背了三章，忘了两章半……', '图书馆四楼的空调最冷，适合清醒。', '你说，DDL 是第一生产力还是第一杀手？']};
  /* Al-Hajeera 嘛嘛档：外卖取餐圈（130, 313.2）北边、顶棚西边的大排档里 */
  D.npcs.aming = {name:'阿明', short:'阿明', color:'#2e9e6a', place:'Bell 嘛嘛档 Al-Hajeera', at:[133, 319, -Math.PI / 2],
    look:{skin:'blue', hand:'boba'}, shape:'std',
    chat:['拉茶要拉得高，泡泡才多 lah。', '雪邦晚上比白天好玩，夜市一开整条后巷都是烟。', '你吃过 Roti Canai 没有？没有就太可惜了 lah。']};
  /* 汽车游乐园一园：入口拱门（x −935 / −905，z 240）东边柱子外面，不在大跳台助跑道（x −927 ~ −913）上 */
  D.npcs.ben = {name:'Ben 师傅', short:'Ben', color:'#d0453a', place:'汽车游乐园一园入口', at:[-901, 245, 0],
    look:{skin:'galaxy', outfit:'hero', neck:'chain'}, shape:'big',
    chat:['车价是给别人看的，圈速才是给自己看的。', '轮胎热了才抓地，第一圈别太猛。', '改车先改脑子，再改引擎。']};
  /* Taman Warisan Megah：8 号（正对校门那户，门口 117.2, 415.1）前面的人行道上，面朝北边的校门 */
  D.npcs.lim = {name:'Uncle Lim', short:'Uncle Lim', color:'#3a6f9a', place:'Taman Warisan Megah 排屋', at:[114.5, 407, Math.PI],
    look:{skin:'classic', outfit:'shirt', face:'shades'}, shape:'chubby',
    chat:['老板，今天看房吗？这个价钱很好 already。', '走路两分钟到南门，下雨都不怕。', '买房子不急，可是好房子不等人哦。']};
  /* 第 7 章：小满到 Salak Tinggi ERL 站门口（XTrain.station.door 紫圈的东边几步），别的时候还在南门 */
  { const xmAt = D.npcs.xiaoman.at;
    D.npcs.xiaoman.at = () => {
      if (window.XQuest && XQuest.ch === 7){ const d = stationDoor(); return [d.x + 5, d.z - 2, Math.PI]; }
      return typeof xmAt === 'function' ? xmAt() : xmAt;
    }; }

  /* ================= 第 2 章 校园打工人 ================= */
  D.chapters.push({n:2, id:'c2', title:'校园打工人', npc:'laozhou', place:'D6 食堂', guide:['earn', 'cops', 'tune'],
    report:'回 D6 食堂找老周', diaryStart:'c2_start', diaryEnd:'c2_end', endMsg:'lz_end',
    recap:'（补记）有了车以后在 D6 跟着老周跑单，被保安追过，也第一次改了车。',
    intro:[
      ['laozhou', '你就是小满说的那个新生？有车了？'],
      ['laozhou', '有车了那就别给我磨蹭。先跑个早八冲刺练练手，再给我把单子跑够。'],
      ['laozhou', '开着车被保安追，就冲进 Bell 那间喷漆车间，门一关，谁也认不出你。'],
      ['laozhou', '车想跑快点，去车行里的改装车间改一改。去吧，单子不等人。']
    ],
    outro:[
      ['laozhou', '十五单，没超时几单……行吧，比我想的快一点点。'],
      ['laozhou', '别得意。这包改装零件拿着，轮毂、漆、涡轮，够你折腾一阵子。'],
      ['laozhou', '对了，你那个室友卷卷在 A3 台阶上转圈，好像快哭了，去看看她。']
    ],
    reward:{rm:300, parts:{rim:4, lacq:4, turbo:2}, note:'一包改装道具：轮毂坯件、赛车漆料、涡轮'},
    steps:[
      {id:'c2_early8', text:'开车跑一次早八冲刺', rm:30, at:G(() => GX_ACTS.find(a => a.id === 'early8').start.slice(0, 2), [-48, -109.2]), r:0,
        done:Q => Q.ach('early8'),
        hint:{pc:'开车进蓝色光圈开始，跟着指南针在时限内冲到终点', touch:'开车进蓝色光圈开始，跟着指南针冲到终点'},
        tip:'早八冲刺的起点在 LY 宿舍区西边，从宿舍一路冲到教学楼，迟到了也能重来。', guide:'earn',
        nudge:'早八冲刺的蓝圈在 LY 宿舍区西头，开车进圈就开始。'},
      {id:'c2_deliv15', text:'累计送 15 单外卖', rm:50,
        done:Q => Q.life('deliv') >= 15, count:Q => [Math.min(15, Q.life('deliv')), 15],
        hint:{pc:'开车进橙色光圈，<kbd>F</kbd> 或 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 接单', touch:'开车进橙色光圈，点卡片上的单子接单', flash:'#mini'},
        tip:'开车送比走路快多了，远一点的单子钱也多。', guide:'earn',
        nudge:'D6 食堂门口的橙圈单子最多，接了就跟着指南针开。'},
      {id:'c2_tea', text:'去蜜雪冰橙打一次工', rm:30, at:G(() => [TEA.S.x, TEA.S.z], [307.35, 313.2]), r:0,
        done:Q => Q.best('o_tea'),
        hint:{pc:'出南门到 Bell Avenue，走进蜜雪冰橙门口的粉圈按 <kbd>F</kbd>', touch:'出南门到 Bell Avenue，走进蜜雪冰橙门口的粉圈点「打工」', flash:'#act-f'},
        tip:'摇奶茶要按顺序加料，手快就有金牌。', guide:'earn',
        nudge:'蜜雪冰橙在南门外 Bell Avenue 往东，门口有个粉色的圈。'},
      {id:'c2_wg1', text:'在水枪工坊升级一次', rm:30, at:SHOWROOM_AT(), r:0,
        done:Q => Q.ach('wg1'),
        hint:{pc:'在车行旁边按 <kbd>G</kbd> 打开车行，往下翻到「水枪工坊」', touch:'点右上角「车行」，往下翻到「水枪工坊」', flash:'#garageBtn'},
        tip:'水枪射程远一点，保安和猴子都好对付。', guide:'cops',
        nudge:'水枪工坊在车行面板最下面，最便宜的回水泵 RM 80。'},
      {id:'c2_repaint', text:'被通缉时开车冲进喷漆车间', rm:50, at:G(() => [XSPRAY.door.x, XSPRAY.door.z], [115, 316]), r:0,
        done:Q => Q.ach('repaint'),
        hint:{pc:'被保安盯上（屏幕上有星星）时，开着自己的车冲进 Bell 的喷漆车间', touch:'被保安盯上（屏幕上有星星）时，开着自己的车冲进 Bell 的喷漆车间'},
        tip:'卷帘门一落，自动换漆，警戒清零，每颗星收 RM 50。', guide:'cops',
        nudge:'先在校园里撞两下保安车让它追你，再开去南门外 Bell 那间喷漆车间。'},
      {id:'c2_car', text:'买一辆 RM 500 以上的车', rm:0, parts:{rim:3, lacq:3}, at:SHOWROOM_AT(), r:0,
        done:Q => Q.ownedAny(['p911', 'mase', 'moto', 'lambo', 'gwag', 'rr']),
        hint:{pc:'攒够 RM 500，按 <kbd>G</kbd> 打开车行买一辆保时洁 911 或更好的', touch:'攒够 RM 500，点右上角「车行」买一辆保时洁 911 或更好的', flash:'#garageBtn'},
        tip:'保时洁 911 只要 RM 500，过弯比 Myvi 灵多了。买车送一包零件。', guide:'earn'},
      {id:'c2_tune1', text:'提到第一件改装（轻改）', rm:50, at:SHOWROOM_AT(), r:0,
        done:Q => Q.ach('tune1'),
        hint:{pc:'车行里点「改装车间」，挑一件轻改开工，做好了点「提车」', touch:'点「车行」里的「改装车间」，挑一件轻改开工，做好了点「提车」', flash:'#garageBtn'},
        tip:'第一件改装 30 秒就完工，零件包里的东西够用。', guide:'tune',
        nudge:'改装车间在车行面板顶上，第一单 30 秒完工，记得回来点「提车」。'}
    ]});
  D.diary.c2_start = '站长老周嫌我慢，说有车了就别磨蹭。我觉得他就是嘴硬。';
  D.diary.c2_early8 = '跑了一次早八冲刺，原来每天早上大家都是这么拼的。';
  D.diary.c2_deliv15 = '十五单了！D6 门口的阿姨都认得我了。';
  D.diary.c2_tea = '在蜜雪冰橙摇了一下午奶茶，手腕好酸，可是好好玩。';
  D.diary.c2_repaint = '被保安追得心都快跳出来，冲进喷漆车间那一刻，卷帘门落下，世界安静了。';
  D.diary.c2_car = '我买了第一辆自己挣钱买的车。坐进去的时候，手在方向盘上摸了好久。';
  D.diary.c2_tune1 = '第一次改车，提车的时候看着新轮毂傻笑了半天。';
  D.diary.c2_end = '老周说「比我想的快一点点」，我决定把这句话当成表扬。';

  /* ================= 第 3 章 期末周 ================= */
  D.chapters.push({n:3, id:'c3', title:'期末周', npc:'juanjuan', place:'A3 图书馆', guide:['earn'],
    report:'回 A3 大台阶找卷卷', diaryStart:'c3_start', diaryEnd:'c3_end', startMsg:'mom_exam', endMsg:'jj_end',
    recap:'（补记）期末周帮室友卷卷交作业、抢卷子，还溜进宿舍拿东西，心惊胆战。',
    intro:[
      ['juanjuan', '你可算来了！完了完了，DDL 今晚十二点，我作业还没交上去……'],
      ['juanjuan', '还有更惨的：我的期末卷被老师锁在 A3 的办公室里，明天就要用！'],
      ['juanjuan', '你身手好，帮我一把？A3 门口那两个蓝圈就是，一个交作业，一个抢卷子。'],
      ['juanjuan', '事成了请你去 B1 游戏厅放松一下。宿舍那边还有好东西，就是别被宿管阿姨看见。']
    ],
    outro:[
      ['juanjuan', '作业交了，卷子拿到了，我还活着……你是我的救命恩人！'],
      ['juanjuan', '这张改装配方是我在图书馆一本旧杂志里夹着的，宽体套件，我用不上，送你。'],
      ['juanjuan', '期末考完了，你也出校门走走吧。阿明说他在 Bell 的嘛嘛档等你，就在南门外面。']
    ],
    reward:{rm:400, parts:{bp_wide:1}, note:'一张宽体套件配方（第 5 章用得上）'},
    steps:[
      {id:'c3_hw1', text:'赶 DDL 交作业', rm:40, at:G(() => [HW_START.x, HW_START.z], [91, 128.1]), r:0,
        done:Q => Q.ach('hw1'),
        hint:{pc:'走进 A3 门口的蓝圈按 <kbd>F</kbd> 接「交作业」，在倒计时内送到指定教室', touch:'走进 A3 门口的蓝圈点「接」，在倒计时内送到指定教室', flash:'#act-f'},
        tip:'教学楼里有保安巡逻，被看见了就跑，水枪能把他们淋得停一下。', guide:'earn',
        nudge:'交作业的蓝圈在 A3 正门西边，F 接委托。'},
      {id:'c3_exam', text:'抢救期末卷', rm:60, at:G(() => [EX_START.x, EX_START.z], [105, 128.1]), r:0,
        done:Q => Q.ach('exam'),
        hint:{pc:'A3 正门的蓝圈接「抢救期末卷」，从办公室的抽屉里拿出卷子再跑出来', touch:'A3 正门的蓝圈接「抢救期末卷」，拿到卷子再跑出来', flash:'#act-f'},
        tip:'卷子锁在办公室抽屉里，拿到以后保安会更警觉，原路跑出来最稳。', guide:'earn',
        nudge:'期末卷的蓝圈就在 A3 正门口，进去以后找亮着的抽屉。'},
      {id:'c3_arcade', text:'去 B1 游戏厅玩一局投篮或端盘子', rm:30, at:G(() => [ARC_DOOR.x, ARC_DOOR.z], [432, 11]), r:0,
        done:() => played('hoops') || played('canteen'),
        hint:{pc:'B1 学生活动中心门口的粉圈按 <kbd>F</kbd> 进游戏厅，挑投篮或食堂端盘子', touch:'B1 学生活动中心门口的粉圈点一下进游戏厅，挑投篮或端盘子', flash:'#act-f'},
        tip:'游戏厅在 B1 学生活动中心，投篮和端盘子拿金牌还掉改装零件。', guide:'earn',
        nudge:'B1 游戏厅在校园东边的学生活动中心门口，粉色的圈。'},
      {id:'c3_dorm1', text:'从宿舍带着东西撤离', rm:60, at:G(() => [DM_DOORS[4].x, DM_DOORS[4].z], [-3, -126.8]), r:0,
        done:Q => Q.ach('dorm1'),
        hint:{pc:'走到 LY 宿舍门口的紫圈按 <kbd>F</kbd> 进去，搜点东西再从门口撤出来', touch:'走到 LY 宿舍门口的紫圈点一下进去，搜点东西再撤出来', flash:'#act-f'},
        tip:'宿管阿姨在走廊里巡，躲在门后等她走过去再出来。', guide:'earn',
        nudge:'LY 宿舍门口都有紫圈，LY2 离中轴线最近。'},
      {id:'c3_gold', text:'任意挑战拿一块金牌', rm:60,
        done:Q => Q.ach('gold'),
        hint:{pc:'挑战赛、潜入委托、蜜雪冰橙打工……任何一样拿到金牌都算', touch:'挑战赛、潜入委托、蜜雪冰橙打工……任何一样拿到金牌都算'},
        tip:'早八冲刺和蜜雪冰橙打工都比较容易拿金牌，多试几次。', guide:'earn',
        nudge:'蜜雪冰橙打工的金牌最好拿：按顺序加料，别手忙脚乱。'}
    ]});
  D.diary.c3_start = '卷卷抓着我的手说「救命」。期末周的室友比保安还可怕。';
  D.diary.c3_hw1 = '帮卷卷把作业送到了，离 DDL 还剩几十秒，我的心跳比秒针还快。';
  D.diary.c3_exam = '从办公室抽屉里摸出期末卷的时候，走廊里有脚步声。我一辈子没跑这么快过。';
  D.diary.c3_arcade = '在 B1 游戏厅玩了一局，期末周最快乐的十分钟。';
  D.diary.c3_dorm1 = '溜进宿舍拿东西，差点被宿管阿姨看见，躲在门后大气都不敢出。';
  D.diary.c3_gold = '拿了一块金牌！发给卷卷看，她回了一串感叹号。';
  D.diary.c3_end = '期末周总算过去了。卷卷说要请我吃饭，我记下了。';

  /* ================= 第 4 章 校外生活 ================= */
  D.chapters.push({n:4, id:'c4', title:'校外生活', npc:'aming', place:'Bell 嘛嘛档', guide:['earn'],
    report:'回 Bell 嘛嘛档找阿明', diaryStart:'c4_start', diaryEnd:'c4_end', startMsg:'am_start', endMsg:'am_end',
    recap:'（补记）阿明带我认识了雪邦：嘛嘛档、得来速、KIP、夜市，还抓过偷外卖的小偷。',
    intro:[
      ['aming', '你就是卷卷说的那个室友 ah？来这么久还没出过校门？不行 lah。'],
      ['aming', '雪邦好吃的好玩的多的是。先坐下来喝杯拉茶，Roti Canai 也要试。'],
      ['aming', '然后我带你去夜市。听说榴莲哥那边有人在卖假的猫山王，你去帮我看看 lah。'],
      ['aming', '还有麦当当的得来速、KIP 的超市，都去一遍。路上小心偷外卖的。']
    ],
    outro:[
      ['aming', '得来速、夜市、KIP 都去过了？跑得不错嘛！'],
      ['aming', '我表哥 Ben 在汽车游乐园开改装铺，只认圈速不认车价。'],
      ['aming', '他在一园入口等你，出校园往西开就到。别给我丢脸 lah。']
    ],
    reward:{rm:500, note:'阿明介绍你去见他表哥 Ben 师傅'},
    steps:[
      {id:'c4_mamak', text:'在嘛嘛档坐下点一样东西', rm:30, at:[127, 330], r:0, isNew:true,
        /* 点餐：prog.best.o_mk 是吃过哪几样的位掩码（js/89-mamak.js），坐着放空 45 秒的成就也算 */
        done:Q => (+Q.bestV('o_mk') || 0) > 0 || Q.ach('chill'),
        hint:{pc:'走到大排档的空椅子旁按 <kbd>F</kbd> 坐下点餐', touch:'走到大排档的空椅子旁点「坐下」点餐', flash:'#act-f'},
        tip:'拉茶 RM 2.5，Roti Canai RM 1.8，坐着放空一会儿也挺好。',
        nudge:'嘛嘛档在南门外 Bell Avenue 西头，露天座位的空椅子旁按 F。'},
      {id:'c4_dt', text:'麦当当得来速送达一单', rm:40, at:G(() => [DT.x, DT.z], [-747, 1149]), r:0,
        done:Q => Q.best('o_dt'),
        hint:{pc:'开车到 KIP 那边的麦当当，从得来速窗口取餐再送出去', touch:'开车到 KIP 那边的麦当当，从得来速窗口取餐再送出去'},
        tip:'得来速的单子在麦当当窗口取，开车经过窗口就拿到。', guide:'earn',
        nudge:'麦当当在 KIP 那片的西南边，开车从得来速车道进去。'},
      {id:'c4_kip', text:'KIP 超市大乱斗玩一局', rm:40, at:G(() => [KM.door.x, KM.door.z], [-640, 929.6]), r:0,
        done:() => played('kipmart'),
        hint:{pc:'走到 KIP 购物中心门口按 <kbd>F</kbd> 开始', touch:'走到 KIP 购物中心门口点一下开始', flash:'#act-f'},
        tip:'推着购物车抢特价，撞翻别人的车也行。', guide:'earn',
        nudge:'KIP 购物中心在学校西南边，商场门口按 F 就开始。'},
      {id:'c4_durian', text:'猫山王挑战走一遍', rm:50, at:G(() => XPasar.SPOT.durian.slice(0, 2), [499.8, 560.3]), r:0,
        done:Q => Q.best('pm_du'),
        hint:{pc:'夜市东头榴莲摊前的绿圈按 <kbd>F</kbd>，挑一颗真的猫山王再砍价', touch:'夜市东头榴莲摊前的绿圈点一下，挑一颗真的猫山王再砍价', flash:'#act-f'},
        tip:'看底部的星纹、看蒂头、摇一摇、闻一闻，五次机会别浪费。', guide:'earn',
        nudge:'夜市在 Bell 后巷往东南，榴莲摊在最东头，地上有绿圈。'},
      {id:'c4_thief', text:'抓住一个偷外卖的小偷', rm:50,
        done:Q => Q.ach('thief1'),
        hint:{pc:'送校外的单子时小偷会来抢，追上去用水枪淋他，走到身边按 <kbd>F</kbd> 拿回来', touch:'送校外的单子时小偷会来抢，追上去用水枪淋他，走到身边点一下拿回来'},
        tip:'车速 54 以上小偷抢不到你；被抢了就追，他跑不远。', guide:'earn',
        nudge:'接 Bell 或 KIP 那边的外卖单，开慢一点，小偷就会出来。'},
      {id:'c4_race', text:'去格子旗跑完一场竞速', rm:40, at:G(() => XRace.tracks[0].start.slice(0, 2), [192, 246.6]), r:0,
        done:Q => Q.ach('race1'),
        hint:{pc:'开车到地图上的格子旗，进圈开始比赛', touch:'开车到地图上的格子旗，进圈开始比赛', flash:'#mini'},
        tip:'地图上有五个格子旗，校园环线离得最近。', guide:'earn',
        nudge:'校园环线的格子旗在南门里面不远，开车进去就开始。'}
    ]});
  D.diary.c4_start = '阿明说我来这么久还没出过校门，「不行 lah」。他说得对。';
  D.diary.c4_mamak = '第一次在嘛嘛档喝拉茶，甜得我一激灵，可是停不下来。';
  D.diary.c4_dt = '在麦当当得来速取了一单，窗口的姐姐还跟我说了声「terima kasih」。';
  D.diary.c4_kip = 'KIP 超市大乱斗，推着购物车横冲直撞，好久没笑得这么大声了。';
  D.diary.c4_durian = '在夜市挑了一颗猫山王，榴莲哥说我眼光不错，我也不知道他是不是在客气。';
  D.diary.c4_thief = '有人抢我的外卖！我追了三条街把它拿了回来。';
  D.diary.c4_race = '第一次跑竞速，过终点线的时候手都在抖。';
  D.diary.c4_end = '原来学校外面这么热闹。阿明说要带我去见他表哥。';

  /* ================= 第 5 章 车手（开始时解锁汽车游乐园的比赛） ================= */
  D.chapters.push({n:5, id:'c5', title:'车手', npc:'ben', place:'汽车游乐园一园', unlock:'park', guide:['tune', 'parts'],
    report:'回汽车游乐园一园入口找 Ben 师傅', diaryStart:'c5_start', diaryEnd:'c5_end', startMsg:'ben_start', endMsg:'ben_end',
    recap:'（补记）在汽车游乐园跟着 Ben 师傅改车、飞大跳台、跑雪邦赛道。',
    intro:[
      ['ben', '阿明说你会开车？车好不好不重要，圈速才重要。'],
      ['ben', '来，园子里的比赛给你开了：大跳台、8 字赛道，二园还有雪邦赛道。'],
      ['ben', '先把车改一改，提一件中改，别开着原厂车来丢人。'],
      ['ben', '再去二园跑一圈雪邦赛道，跑完回来我给你看真正的好东西。']
    ],
    outro:[
      ['ben', '圈速还行。人机赛也赢了，影线也跑赢了，有点车手的样子了。'],
      ['ben', '这块航空钛锭是我压箱底的，再加一张鹅颈尾翼配方。宽体加尾翼，你的车就不一样了。'],
      ['ben', '车改好了，人也该有个窝。Uncle Lim 在南门外的排屋卖房子，你去看看。']
    ],
    reward:{rm:600, parts:{ti:1, bp_swan:1}, note:'一件航空钛锭 + 鹅颈尾翼配方'},
    steps:[
      {id:'c5_midtune', text:'提到一件中改（稀有）', rm:60, at:SHOWROOM_AT(), r:0, isNew:true,
        done:() => tunedRare(),
        hint:{pc:'改装车间里挑一件标「中改」的零件开工，做好了点「提车」', touch:'「车行」里的「改装车间」挑一件「中改」开工，做好了点「提车」', flash:'#garageBtn'},
        tip:'中改要稀有零件（碳纤维板、涡轮……），挑战赛金牌、抓小偷都会掉。', guide:'tune',
        nudge:'中改要几十分钟才完工，可以先开工再去跑大跳台，回来提车。'},
      {id:'c5_bigjump', text:'一园大跳台飞一次', rm:40, at:[-920, 200], r:0,
        done:Q => Q.best('bigjump'),
        hint:{pc:'从入口拱门下往北全速冲上红白跳台', touch:'从入口拱门下往北全速冲上红白跳台'},
        tip:'越快飞得越远，落地区每 25 米一条线。', guide:'tune',
        nudge:'大跳台就在入口拱门正下方，往北一路冲。'},
      {id:'c5_parklap', text:'一园 8 字赛道跑一圈', rm:40, at:G(() => [XPark.F8.x, XPark.F8.z - XPark.F8.A], [-900, -458]), r:0,
        done:Q => Q.best('parkLap'),
        hint:{pc:'开过 8 字赛道北头的方格线开始计时，五个检查点都过一遍再回来', touch:'开过 8 字赛道北头的方格线开始计时，五个检查点都过一遍再回来'},
        tip:'8 字赛道在一园最北边，交叉口小心对面来车。', guide:'tune',
        nudge:'8 字赛道在一园最北头，从入口一直往北开就看到了。'},
      {id:'c5_seplap', text:'二园雪邦赛道跑一圈', rm:60, at:G(() => XF1.PT[XF1.SF].slice(0, 2), [258.9, 912.2]), r:0,
        done:Q => Q.best('sepLap'),
        hint:{pc:'开到二园的雪邦赛道，从主直道的起点线出发跑一整圈', touch:'开到二园的雪邦赛道，从主直道的起点线出发跑一整圈'},
        tip:'一圈大约 3 公里、15 个弯，发卡弯前早点刹车。', guide:'tune',
        nudge:'二园在 Bell Avenue 东南边的油棕园公路两边，起点线在主看台前面。'},
      {id:'c5_racewin', text:'赢一场人机赛或道具赛', rm:60,
        done:Q => Q.ach('racewin'),
        hint:{pc:'格子旗进圈后选「人机赛」或「道具赛」，跑第一', touch:'格子旗进圈后选「人机赛」或「道具赛」，跑第一'},
        tip:'道具赛里护盾能挡水弹，加速留到直道再用。', guide:'tune',
        nudge:'校园环线最短，在那儿开人机赛最容易赢。'},
      {id:'c5_ghostwin', text:'在影线 1v1 里跑赢对手', rm:40,
        done:Q => Q.ach('ghostwin'),
        hint:{pc:'格子旗进圈后选「影线 1v1」，跑赢那条半透明的影子', touch:'格子旗进圈后选「影线 1v1」，跑赢那条半透明的影子'},
        tip:'影线是别人跑过的最快一圈，跟紧它学走线。', guide:'tune'}
    ]});
  D.diary.c5_start = 'Ben 师傅说车价是给别人看的，圈速才是给自己看的。我记在本子第一页了。';
  D.diary.c5_midtune = '提了第一件中改，Ben 师傅瞄了一眼，说「嗯」。这是他最高的评价吧。';
  D.diary.c5_bigjump = '从大跳台飞出去的那几秒，什么都听不见，只看见天。';
  D.diary.c5_parklap = '8 字赛道的交叉口，每次都觉得要撞上，每次都擦过去了。';
  D.diary.c5_seplap = '跑完一整圈雪邦赛道，手心全是汗，可是想再跑一圈。';
  D.diary.c5_racewin = '赢了一场比赛！冲线的时候我在车里喊出了声。';
  D.diary.c5_ghostwin = '跑赢了影线，不知道那个影子的主人是谁，谢谢你带我跑。';
  D.diary.c5_end = 'Ben 师傅给了我一块航空钛锭，说车改好了，人也该有个窝。';

  /* ================= 第 6 章 安家 ================= */
  /* 设计是 RM 500 + 一件奶蛙主题家具。js/89-house.js 没有直接发家具的接口（XHouse 没有 grant，家具要先有房子、买进 it 才算），
     所以按奶蛙主题里最便宜的一件（巨型公仔 / 奶瓶餐桌，RM 420）折成钱：RM 500 + 420 = 920。 */
  D.chapters.push({n:6, id:'c6', title:'安家', npc:'lim', place:'Taman Warisan Megah 排屋', guide:['house', 'rich'],
    report:'回排屋门口找 Uncle Lim', diaryStart:'c6_start', diaryEnd:'c6_end', startMsg:'lim_start', endMsg:'lim_end',
    recap:'（补记）在南门外的 Taman Warisan Megah 买了房子，有了自己的家。',
    intro:[
      ['lim', '老板，你好你好！Ben 介绍来的？'],
      ['lim', '住宿舍有什么意思？Taman Warisan Megah，走路两分钟到南门，这个价钱很好 already。'],
      ['lim', '挂着「出售」牌子的那几户，先进去看看，不买也没关系。'],
      ['lim', '总资产到了五千再来，我给你留着。真的，这个价钱很好 already。']
    ],
    outro:[
      ['lim', '房子买了，家具摆了，车也停进车棚了。老板，以后就是邻居啦。'],
      ['lim', '这是我的一点心意，本来想送你一件大公仔，搬不动，折成钱给你，自己去装修里挑。'],
      ['lim', '对了，小满在找你，好像是迎新的事。她说在 Salak Tinggi 的火车站等你。']
    ],
    reward:{rm:920, note:'RM 500 + 一件家具的钱（RM 420，自己去装修里挑）'},
    steps:[
      {id:'c6_tour', text:'进去看一次房', rm:30, at:G(() => { const h = XHouse.houses.find(x => x.id === 'h8'); return [h.door.x, h.door.z]; }, [117.2, 415.1]), r:0, isNew:true,
        done:Q => Q.flag('q_tour'),
        hint:{pc:'走到挂着「出售」牌子的门口按 <kbd>F</kbd> 看房', touch:'走到挂着「出售」牌子的门口点「看房」', flash:'#act-f'},
        tip:'看房不要钱，一楼客厅饭厅厨房，二楼三个房间。', guide:'house',
        nudge:'排屋在南门正南，Bell Avenue 后面，挂着 FOR SALE 牌子的门口按 F。'},
      {id:'c6_worth', text:'总资产到 RM 5,000', rm:200,
        done:Q => Q.worth() >= 5000, count:Q => [Math.min(5000, Math.floor(Q.worth())), 5000],
        hint:{pc:'送外卖、打工、比赛都能挣钱；车、改装、家具都算进总资产', touch:'送外卖、打工、比赛都能挣钱；车、改装、家具都算进总资产'},
        tip:'总资产 = 现金 + 车 + 改装 + 房子和家具，买东西不会让它变少。', guide:'rich',
        nudge:'挣钱最快的是跨区外卖和挑战赛金牌，晚上的夜宵单价也高。'},
      {id:'c6_house1', text:'买下第一套房', rm:0,
        done:Q => Q.ach('house1'),
        hint:{pc:'看房时按 <kbd>F</kbd>「买下」', touch:'看房时点「买下」', flash:'#act-f'},
        tip:'最便宜的是 4 号，RM 7,400；8 号正对校门。', guide:'house'},
      {id:'c6_deco3', text:'摆上 3 件家具', rm:100, isNew:true,
        done:() => decoMost() >= 3, count:() => [Math.min(3, decoMost()), 3],
        hint:{pc:'在家里按 <kbd>F</kbd> 打开装修，挑三件摆上', touch:'在家里点「装修」，挑三件摆上', flash:'#act-f'},
        tip:'九个位置，五种风格，学生宿舍风最便宜。', guide:'house'},
      {id:'c6_carport', text:'开自己的车停进车棚', rm:30, r:0, isNew:true,
        at:() => { const h = houseFirst(); return h ? [h.park.x, h.park.z] : null; },
        done:() => { const s = hzS(); return !!(s.park && s.own[s.park]); },
        hint:{pc:'开着自己的车到自家门口的车棚，停稳按 <kbd>F</kbd> 下车', touch:'开着自己的车到自家门口的车棚，停稳点「下车」', flash:'#act-f'},
        tip:'车停进车棚，下次上线车还在家门口。', guide:'house'},
      {id:'c6_sofa', text:'在自家沙发上坐一会儿', rm:20, isNew:true,
        done:Q => Q.flag('q_sofa5'),
        hint:{pc:'在家里走到沙发旁按 <kbd>F</kbd> 坐下，坐 5 秒', touch:'在家里走到沙发旁点「坐下」，坐 5 秒', flash:'#act-f'},
        tip:'先在装修里摆一张沙发，再坐上去发会儿呆。', guide:'house'}
    ]});
  D.diary.c6_start = 'Uncle Lim 戴着墨镜说「这个价钱很好 already」，说了三遍。';
  D.diary.c6_tour = '去看了一套排屋，站在空空的客厅里，想象沙发放哪儿。';
  D.diary.c6_worth = '数了数，我的总资产到五千了。刚来的时候钱包里才几十块。';
  D.diary.c6_house1 = '我买房了。拿到钥匙的时候，手比第一次送外卖还抖。';
  D.diary.c6_deco3 = '摆了三件家具，屋子一下就有了人住的样子。';
  D.diary.c6_carport = '把车停进自家车棚，熄火，坐了一会儿才下车。';
  D.diary.c6_sofa = '坐在自己的沙发上，外面在下雨，屋里很安静。这是我的家。';
  D.diary.c6_end = '今天开始，我在这边也有家了。';

  /* ================= 第 7 章 出远门（开始时开通小火车） ================= */
  D.chapters.push({n:7, id:'c7', title:'出远门', npc:'xiaoman', place:'Salak Tinggi ERL 站', unlock:'train', guide:['earn'], endCine:'ending',
    report:'回 Salak Tinggi 站门口找小满学姐', diaryStart:'c7_start', diaryEnd:'c7_end', startMsg:'xm_ch7', endMsg:'mom_end',
    recap:'（补记）坐 ERL 去 KLIA 接了下一届新生。',
    intro:[
      ['xiaoman', '来啦！还记得你报到那天吗？钱包里就几十块，走路送外卖。'],
      ['xiaoman', '明天又有一批新生到 KLIA，迎新的人手不够……'],
      ['xiaoman', '这次换你去接。小火车已经通了，坐一站就到机场。'],
      ['xiaoman', '到了先去问讯台帮帮忙，饿了すき家的牛丼不错。接到新生，坐车回来找我。']
    ],
    outro:[
      ['xiaoman', '接到了？他是不是一路东张西望，跟你当年一模一样？'],
      ['xiaoman', '一年了。从今天起，你就是学长学姐啦。'],
      ['xiaoman', '走吧，我们一起送他回南门。']
    ],
    reward:{rm:800, title:'学长 / 学姐', note:'称号「学长 / 学姐」'},
    steps:[
      {id:'c7_erl', text:'坐 ERL 去 KLIA', rm:40, r:0, at:() => { const d = stationDoor(); return [d.x, d.z]; },
        done:Q => Q.ach('erl1'),
        hint:{pc:'进站走到站台，车门边按 <kbd>F</kbd> 开门上车', touch:'进站走到站台，车门边点「开门」上车', flash:'#act-f'},
        tip:'Salak Tinggi 坐 KLIA Transit 一站，大约 7 分钟。', guide:'earn',
        nudge:'站门口有紫色的圈，走进去再上二楼站台。'},
      {id:'c7_klia', text:'问讯台的送机单拿一块奖牌', rm:60,
        done:Q => Q.best('klia'),
        hint:{pc:'KLIA 大厅中间的问讯台按 <kbd>F</kbd> 接一单，按住 <kbd>Shift</kbd> 跑', touch:'KLIA 大厅中间的问讯台点一下接单，摇杆推到底跑', flash:'#act-f'},
        tip:'旅客拖着行李车，撞到会扣时间，绕着走。', guide:'earn',
        nudge:'问讯台在 KLIA 大厅正中间，航班屏下面。'},
      {id:'c7_sukiya', text:'在すき家吃碗牛丼', rm:20,
        done:Q => Q.ach('sukiya'),
        hint:{pc:'KLIA 大厅西边的すき家门口按 <kbd>F</kbd>', touch:'KLIA 大厅西边的すき家门口点一下', flash:'#act-f'},
        tip:'牛丼（并）RM 12.90，热乎乎的。'},
      /* 设计：第一版用一次送机单代替「新生跟着你坐车回南门」。这里多走一步：送机单做完以后坐 ERL 回到 Salak Tinggi 才算接回来 */
      {id:'c7_back', text:'接到新生，坐 ERL 回 Salak Tinggi', rm:0, isNew:true,
        done:Q => Q.flag('q_erlback'),
        hint:{pc:'KLIA 大厅南边下去是 ERL 站台，坐车回 Salak Tinggi', touch:'KLIA 大厅南边下去是 ERL 站台，坐车回 Salak Tinggi'},
        tip:'回程也是一站。新生第一次坐，让他坐窗边。',
        nudge:'KLIA 大厅南边有往下的 ERL 站台，坐车回去就行。'}
    ]});
  D.diary.c7_start = '小满学姐说，这次换我去接新生。我突然想起报到那天她冲我挥手的样子。';
  D.diary.c7_erl = '坐上小火车，窗外的油棕树往后跑，和来的那天一样。';
  D.diary.c7_klia = '在 KLIA 帮问讯台跑了一单，大厅好大，屋顶像一把把伞。';
  D.diary.c7_sukiya = '在すき家吃了碗牛丼，想起第一天落地也是饿着肚子。';
  D.diary.c7_back = '接到新生了。他一直东张西望，问我学校大不大。我说，很大，慢慢来。';
  D.diary.c7_end = '第一年，完。';

  /* ---------- 「第一次」 ---------- */
  D.diary.ev_bust = '第一次被保安抓住，罚了钱，还被教育了半天。丢人。';
  D.diary.ev_lake = '开车飞进了湖里。车和我都湿透了，我决定不告诉妈妈。';
  D.diary.ev_eject = '车祸把我整个甩出了车外，在空中转了好几圈，居然没事。';
  D.diary.ev_star5 = '五颗星通缉！全校的保安车都在追我，我到底干了什么。';
  D.diary.ev_rich = '钱包第一次超过 RM 2,000，盯着那个数字看了好久。';
  D.diary.ev_monkey = '被猴子抢了东西。马来西亚的猴子真的不讲武德。';
  D.diary.ev_arcade = '发现 B1 有个游戏厅，进去就不想出来。';
  D.diary.ev_swingfar = '从秋千上飞出去三十多米，落地的时候草都被我压扁了。';

  /* ---------- 手机消息 ---------- */
  Object.assign(D.msgs, {
    mom_bust:{from:'mom', text:'学校怎么打电话来了？？'},
    mom_exam:{from:'mom', text:'考试加油，别熬太晚。'},
    mom_house:{from:'mom', text:'你哪来的钱买房？？'},
    mom_end:{from:'mom', text:'一年了，长大了。放假回来妈给你做好吃的。'},
    lz_hi:{from:'laozhou', text:'小满说你有车了？D6 外卖点，过来，别让我等。'},
    lz_mid:{from:'laozhou', text:'十五单了？还行，没我当年快。'},
    lz_end:{from:'laozhou', text:'单子还多，有空就回来跑。别跟别人说我夸过你。'},
    jj_hi:{from:'juanjuan', text:'室友救命！！！A3 大台阶，快来！！'},
    jj_mid:{from:'juanjuan', text:'卷子拿到了？？？我哭了真的'},
    jj_end:{from:'juanjuan', text:'考完了！！这学期欠你一顿饭，不，三顿。'},
    am_hi:{from:'aming', text:'卷卷说你考完了？出来 lah，Bell 嘛嘛档，我请你喝拉茶。'},
    am_start:{from:'aming', text:'夜市在 Bell 后巷那边，晚上才热闹 lah，白天去只有几个摊。'},
    am_end:{from:'aming', text:'我表哥说你会来，他人很凶，其实还好 lah。'},
    ben_hi:{from:'ben', text:'阿明说的那个就是你？一园入口，开你最快的车来。'},
    ben_start:{from:'ben', text:'园子里的比赛开了。先改车，再跑圈。'},
    ben_end:{from:'ben', text:'钛锭别乱用。双涡轮配上它，才知道什么叫推背。'},
    lim_hi:{from:'lim', text:'老板你好，我是 Uncle Lim，Ben 介绍的。排屋有空房，这个价钱很好 already。'},
    lim_start:{from:'lim', text:'看房随时来，钥匙在我这里。'},
    lim_end:{from:'lim', text:'恭喜老板！以后有朋友要买房，记得介绍给我。'},
    xm_ch7hi:{from:'xiaoman', text:'有空吗？来 Salak Tinggi 火车站门口找我，有件事想拜托你。'},
    xm_ch7:{from:'xiaoman', text:'新生的航班下午到，不急，先吃点东西再去。'}
  });

  const chIs = n => window.XQuest && XQuest.ch === n;
  D.events.push(
    {id:'ev_bust', when:Q => Q.ach('busted'), diary:'ev_bust', msg:'mom_bust'},
    {id:'ev_lake', when:Q => Q.ach('lake'), diary:'ev_lake'},
    {id:'ev_eject', when:Q => Q.ach('eject'), diary:'ev_eject'},
    {id:'ev_star5', when:Q => Q.ach('star5'), diary:'ev_star5'},
    {id:'ev_rich', when:Q => Q.ach('rich'), diary:'ev_rich'},
    {id:'ev_monkey', when:Q => Q.ach('monkey1'), diary:'ev_monkey'},
    {id:'ev_arcade', when:Q => Q.ach('arcade1'), diary:'ev_arcade'},
    {id:'ev_swingfar', when:Q => Q.ach('swingfar'), diary:'ev_swingfar'},
    {id:'ev_house', when:Q => Q.ach('house1'), msg:'mom_house'},
    /* 下一章的人在你到这一章时先发一条，告诉你去哪儿找他 */
    {id:'ev_lz_hi', when:() => chIs(2), msg:'lz_hi'},
    {id:'ev_lz_mid', when:() => chIs(2) && XQuest.stepDone('c2_deliv15'), msg:'lz_mid'},
    {id:'ev_jj_hi', when:() => chIs(3), msg:'jj_hi'},
    {id:'ev_jj_mid', when:() => chIs(3) && XQuest.stepDone('c3_exam'), msg:'jj_mid'},
    {id:'ev_am_hi', when:() => chIs(4), msg:'am_hi'},
    {id:'ev_ben_hi', when:() => chIs(5), msg:'ben_hi'},
    {id:'ev_lim_hi', when:() => chIs(6), msg:'lim_hi'},
    {id:'ev_xm_ch7hi', when:() => chIs(7), msg:'xm_ch7hi'}
  );

  /* ---------- 支线：那一章做完才出现，在同一个人那里接 ---------- */
  D.sides.push(
    {id:'xm_wall', npc:'xiaoman', after:'c1', text:'在留言墙贴一张便利贴', rm:50, done:Q => Q.ach('wall1')},
    {id:'xm_show', npc:'xiaoman', after:'c1', text:'去音乐厅前面看一眼豪车展台', rm:50,
      done:Q => Q.near(G(() => SC_X, -88.2), G(() => SC_Z, 174.9), 16)},
    {id:'xm_hole', npc:'xiaoman', after:'c1', text:'黑洞模式玩一局', rm:80, parts:{cf:1},
      done:() => (+G(() => localStorage.getItem('xmum-hole2-best'), 0) || 0) > 0},
    /* 联机时发一个表情或喊话（XNet.extra 里带着刚发的 fx，8 秒内），而且附近有真人在线 */
    {id:'xm_hi', npc:'xiaoman', after:'c1', text:'联机时和真人玩家打个招呼（发个表情）', rm:50,
      done:() => { const x = XNet.extra && XNet.extra(); return !!(x && x.fx) && XNet.peers().size > 0; }},
    {id:'lz_taxi5', npc:'laozhou', after:'c2', text:'顺风车拿一次五星好评', rm:80, done:Q => Q.ach('taxi5')},
    {id:'lz_cross', npc:'laozhou', after:'c2', text:'送满 10 单跨区外卖', rm:120, done:Q => Q.ach('cross')},
    {id:'lz_supper', npc:'laozhou', after:'c2', text:'夜里送一单夜宵', rm:60, parts:{neon:2}, done:Q => Q.ach('supper')},
    {id:'lz_dthru', npc:'laozhou', after:'c2', text:'得来速送达 5 单', rm:100, done:Q => Q.ach('dthru')},
    {id:'jj_exall', npc:'juanjuan', after:'c3', text:'四种潜入委托各做一次', rm:120, done:Q => Q.ach('exall')},
    {id:'jj_arcade', npc:'juanjuan', after:'c3', text:'B1 游戏厅每个小游戏都玩一局', rm:80, done:Q => Q.ach('arcadeall')},
    {id:'jj_duel', npc:'juanjuan', after:'c3', text:'投篮斗牛赢一局', rm:60, parts:{ecu:1}, done:Q => Q.ach('mg_hoops_duel')},
    {id:'jj_five', npc:'juanjuan', after:'c3', text:'食堂叠盘一次送 5 盘', rm:60, done:Q => Q.ach('mg_canteen_five')},
    {id:'am_nmkt', npc:'aming', after:'c4', text:'一晚吃遍夜市五种小吃', rm:80, done:Q => Q.ach('nmkt')},
    {id:'am_bigeat', npc:'aming', after:'c4', text:'大胃王争霸赛赢一局', rm:100, done:() => bigeatWon()},
    {id:'am_monkey', npc:'aming', after:'c4', text:'打赢猴子大战', rm:100, parts:{cf:2}, done:Q => Q.ach('monkeywar')},
    {id:'am_wanted', npc:'aming', after:'c4', text:'清空 Bell 路口的通缉榜', rm:150, done:Q => Q.ach('wanted')},
    {id:'ben_raceall', npc:'ben', after:'c5', text:'五条格子旗赛道都跑完', rm:120, done:Q => Q.ach('raceall')},
    {id:'ben_combo', npc:'ben', after:'c5', text:'一次特技连击超过 5,000 分', rm:80, parts:{nos:2}, done:Q => Q.ach('combo5k')},
    {id:'ben_wide', npc:'ben', after:'c5', text:'同一辆车装上宽体和尾翼', rm:100, done:Q => Q.ach('tunewide')},
    {id:'ben_top', npc:'ben', after:'c5', text:'提到一件顶级改装', rm:150, done:Q => Q.ach('tunetop')},
    {id:'ben_bp', npc:'ben', after:'c5', text:'集齐 5 张改装配方', rm:100, parts:{plan:2}, done:Q => Q.ach('tunebp')},
    {id:'ben_cars', npc:'ben', after:'c5', text:'把车行里的车全部买下', rm:150, done:Q => Q.ach('allcars')},
    {id:'lim_deco9', npc:'lim', after:'c6', text:'一套房九个位置都摆上家具', rm:120, done:Q => Q.ach('deco9')},
    {id:'lim_set', npc:'lim', after:'c6', text:'整屋换成同一种风格', rm:150, done:Q => Q.ach('decoset')}
  );

  /* ---------- 计时的「新」条件 ---------- */
  /* 看房：进了任意一套房（看房或回自己家都算） */
  D.watch.push((Q, flag) => { if (!Q.flag('q_tour') && G(() => XHouse.state.in, null)) flag('q_tour'); });
  /* 在自家（不是看房）的沙发上连续坐 5 秒 */
  { let t = 0;
    D.watch.push((Q, flag, dt) => {
      if (Q.flag('q_sofa5')) return;
      const S = G(() => XHouse.state, null), p = S && S.pose;
      const ok = !!(p && p.kind === 'sit' && p.sp && /_sofa$/.test(p.sp.id) && S.in && !S.tour && hzS().own[S.in.id]);
      t = ok ? t + dt : 0; if (t >= 5) flag('q_sofa5');
    }); }
  /* 第 7 章：送机单做完以后在 KLIA 里（XTrain.inside === 'klia'），再坐车回到 Salak Tinggi（不在里面、也不在坐车过场里） */
  { let sawK = false;
    D.watch.push((Q, flag) => {
      if (Q.flag('q_erlback') || !G(() => XQuest.stepDone('c7_klia'), false)) return;
      const ins = G(() => XTrain.inside, null), riding = G(() => XTrain.on, false);
      if (ins === 'klia') sawK = true;
      else if (sawK && !ins && !riding) flag('q_erlback');
    }); }

  /* ================= 第二期：采购单、新角色、生日火锅局、搬家、第 8 章（docs/quests.md「第二期」） ================= */
  /* ---------- 新的人机奶蛙（都是虚构的）：店里的人，从第 4 章起站在店门口；第 8 章的新生阿豆 ---------- */
  Object.assign(D.people, {
    rose:{name:'罗丝阿姨', icon:'罗', color:'#e0609a'},
    durian:{name:'榴莲哥', icon:'榴', color:'#8a9a2c'},
    kumar:{name:'库马叔', icon:'库', color:'#b5651d'},
    adi:{name:'阿弟', icon:'弟', color:'#1f86c8'},
    adou:{name:'阿豆', icon:'豆', color:'#f08a3c'}
  });
  /* KIP 商场北面：超市那段墙（x −704 ~ −656，墙在 z 936）前面的停车场边上，面朝北边来的人 */
  D.npcs.rose = {name:'罗丝阿姨', short:'罗丝阿姨', color:'#e0609a', place:'KIP 超市门口', appear:4, at:[-671, 932, Math.PI],
    look:{skin:'pink', head:'pearl', outfit:'shirt'}, shape:'chubby',
    chat:['今天青菜特价，买一送一哦。', '冷冻的东西最后买，路上化了阿姨可不管。', '大乱斗那几个顾客，推车比开车还凶。']};
  /* 夜市东头的榴莲摊（js/89-pasar-malam.js 的 SPOT.durian 是猫山王挑战的绿圈），站在圈的东边 */
  D.npcs.durian = {name:'榴莲哥', short:'榴莲哥', color:'#8a9a2c', place:'夜市榴莲摊', appear:4,
    at:() => { const s = G(() => XPasar.SPOT.durian, null); return s ? [s[0] + 3.6, s[1] + 1.2, -Math.PI / 2] : [503.4, 561.5, -Math.PI / 2]; },
    look:{skin:'gold', head:'fedora', neck:'chain'}, shape:'big',
    chat:['猫山王今天刚到，包甜！', '看星纹、看蒂头，别光闻。', '白天收摊，天黑再来 lah。']};
  /* Al-Hajeera 嘛嘛档：店屋最西头（x 142 起），站在露天座位和店门之间 */
  D.npcs.kumar = {name:'库马叔', short:'库马叔', color:'#b5651d', place:'Bell 嘛嘛档 Al-Hajeera', appear:4, at:[139.5, 311, Math.PI / 2],
    look:{skin:'orange', face:'meh', neck:'bowtie'}, shape:'chubby',
    chat:['拉茶要拉三尺高，泡泡才香。', '二十四小时开，半夜饿了就来。', 'Roti 要趁热吃，冷了就硬了。']};
  /* 麦当当旁边的加油站，便利店门口 */
  D.npcs.adi = {name:'阿弟', short:'阿弟', color:'#1f86c8', place:'KIP 那边的加油站', appear:5, at:[-694, 1136, Math.PI],
    look:{skin:'xmumblue', head:'policecap', outfit:'redvest'}, shape:'slim',
    chat:['不能加油哦，泵是坏的，便利店可以。', '冰水要不要？天气这么热。', '晚上这条路很多人飙车，你小心。']};
  /* 第 8 章的新生：平时站在南门小满旁边，第 8 章做任务时跟着你走（js/89-quest.js 的 follow） */
  D.npcs.adou = {name:'新生阿豆', short:'阿豆', color:'#f08a3c', place:'南门', appear:8, at:[97.5, 240.5, 0],
    follow:() => !!(window.XQuest && XQuest.ch === 8 && (XQuest.ph === 'steps' || XQuest.ph === 'report')),
    look:{skin:'orange', back:'bag', neck:'badge'}, shape:'std',
    chat:['学长，那栋最高的是 A3 对吧？我记住了！', '学长开车好稳，我以后也要学。', '学长，拉茶真的好甜……再来一杯。']};

  /* ---------- 采购单用的店：at 是站的地方（离店门两三步），open() 不开门时买不了（夜市白天收摊） ---------- */
  const bellAt = (name, dx) => G(() => { const i = BELL_SIGN.n.findIndex(si => OUT_SIGNS[si][0] === name); return i >= 0 ? [BELL_UNITS[i] + (dx || 0), 309.5] : null; }, null);
  const lyDoor = () => G(() => { const d = DM_DOORS.find(x => x.name === 'LY2') || DM_DOORS[0]; return [d.x + Math.sin(d.h) * 7, d.z + Math.cos(d.h) * 7]; }, [975, 230]);
  D.shops = {
    kipmart:{name:'KIP 超市', at:[-680, 931.5]},
    diy:{name:'DIY 五金百货', at:[-735, 931.5]},
    kfc:{name:'上校炸鸡', at:[-760, 935]},
    cake:{name:'秘方蛋糕', at:() => bellAt('秘方蛋糕') || [368.25, 309.5]},
    bellfruit:{name:'Bell 鲜果蔬菜', at:() => bellAt('鲜果蔬菜') || [153.25, 309.5]},
    mamak:{name:'Al-Hajeera 嘛嘛档', at:() => bellAt('Nasi Kandar Al-Hajeera') || [145.75, 309.5]},
    pasar:{name:'夜市水果摊', at:() => { const s = G(() => XPasar.SPOT.fruit || XPasar.SPOT.durian, null); return s ? [s[0], s[1]] : [499.8, 560.3]; },
      open:() => G(() => XPasar.openG.visible, true), shut:'夜市天黑才开。水果也可以去 Bell 的「鲜果蔬菜」买。'},
    petrol:{name:'加油站便利店', at:[-690, 1131]},
    lydorm:{name:'LY 宿舍楼下', at:lyDoor, verb:'搬上车'}
  };
  /* ---------- 采购单（js/89-errand.js）：买齐 → 送到 to → 报销（refund）→ onDone
     item = {id, name, icon, rm, shops:[店 id], cold:秒（买了以后多久内要送到，过了就坏，要重买）, spoil:'坏了的说法'}
     gift = {店 id:[[谁, 台词]]} 在这家店买这一单的东西时，店里的人说的话（送东西） */
  const houseDoor = () => { const h = houseFirst(); return h ? [h.door.x, h.door.z] : [117.2, 415.1]; };
  D.errands = {
    bday:{title:'生日火锅局', from:'aming', refund:'大家 AA 了，钱转回给你', to:{name:'LY 宿舍楼下', at:lyDoor}, onDone:'birthday',
      items:[
        {id:'meat', name:'火锅肉片', icon:'🥩', rm:28, shops:['kipmart'], cold:600, spoil:'化冻了'},
        {id:'balls', name:'丸子拼盘', icon:'🍢', rm:16, shops:['kipmart'], cold:600, spoil:'化冻了'},
        {id:'veg', name:'青菜和菇', icon:'🥬', rm:9, shops:['kipmart', 'bellfruit']},
        {id:'fruit', name:'一袋水果', icon:'🍉', rm:15, shops:['pasar', 'bellfruit']},
        {id:'tea', name:'一大壶拉茶', icon:'🧋', rm:12, shops:['mamak']},
        {id:'pot', name:'电磁炉和鸳鸯锅', icon:'🍲', rm:89, shops:['diy']},
        {id:'chicken', name:'一桶炸鸡', icon:'🍗', rm:35, shops:['kfc']},
        {id:'cake', name:'生日蛋糕', icon:'🎂', rm:45, shops:['cake']}
      ],
      gift:{kipmart:[['rose', '买这么多肉？生日啊？阿姨送你一包火锅底料，生日快乐！']],
        pasar:[['durian', '寿星公？这块猫山王送你尝，不要钱 lah！']],
        mamak:[['kumar', '拉茶我多加了一勺炼奶。生日嘛，甜一点。']],
        diy:[['memo', '店员说：「鸳鸯锅？宿舍偷偷用的吧。」我假装没听见。']]}},
    move:{title:'搬家', from:'lim', to:{name:'新家门口', at:houseDoor},
      items:[{id:'boxes', name:'宿舍的行李', icon:'📦', rm:0, shops:['lydorm']}, {id:'table', name:'火锅圆桌和小板凳', icon:'🪑', rm:0, shops:['lydorm']}],
      gift:{lydorm:[['juanjuan', '我们来帮你搬！……搬完了能在新家吃顿饭吗？'], ['aming', '圆桌带走 lah，以后火锅局在你家开。']]}},
    rice:{title:'罗丝阿姨的米', from:'rose', to:{name:'Taman Warisan Megah 8 号门口', at:[117.2, 412]},
      items:[{id:'rice', name:'一袋 10 公斤的米', icon:'🍚', rm:0, shops:['kipmart']}]},
    durian:{title:'给老周的猫山王', from:'durian', refund:'老周把钱给你了，还说「下次挑熟一点的」', to:{name:'D6 外卖点（老周）', at:[344, -143]},
      items:[{id:'du', name:'一颗猫山王', icon:'🍈', rm:40, shops:['pasar'], cold:420, spoil:'在车里熏太久了，老周说不要'}]},
    supper:{title:'给卷卷的夜宵', from:'kumar', refund:'卷卷把钱转给你了', to:{name:'A3 大台阶（卷卷）', at:[110, 123]},
      items:[{id:'teh', name:'拉茶', icon:'🧋', rm:3, shops:['mamak'], cold:360, spoil:'凉了'}, {id:'roti', name:'Roti Canai', icon:'🫓', rm:2, shops:['mamak'], cold:360, spoil:'凉了'}]},
    ice:{title:'给 Ben 师傅的冰水', from:'adi', refund:'Ben 师傅把钱给你了', to:{name:'汽车游乐园一园入口（Ben）', at:[-903, 249]},
      items:[{id:'ice', name:'一箱冰水', icon:'🧊', rm:12, shops:['petrol'], cold:300, spoil:'冰都化了'}]}
  };
  const erAt = id => G(() => XErrand.nextAt(id), null);
  const erCount = id => G(() => XErrand.count(id), null);

  /* ---------- 第 4 章：结尾加生日火锅局 ---------- */
  { const c4 = D.chapters.find(c => c.n === 4);
    c4.replayCine = 'birthday';
    c4.recap = '（补记）阿明带我认识了雪邦：嘛嘛档、得来速、KIP、夜市，还在 LY 宿舍给我过了生日，吃了火锅。';
    c4.outro = [
      ['aming', '生日过得开心吧？宿管阿姨吃了三碗，我数着的 lah。'],
      ['aming', '得来速、夜市、KIP 都跑熟了，你现在比我还像本地人。'],
      ['aming', '我表哥 Ben 在汽车游乐园开改装铺，只认圈速不认车价。'],
      ['aming', '他在一园入口等你，出校园往西开就到。别给我丢脸 lah。']
    ];
    c4.steps.push(
      {id:'c4_shop', text:'生日火锅局：照采购单买齐东西', rm:50, isNew:true, errand:'bday', at:() => erAt('bday'), r:0,
        done:Q => Q.flag('er_bday_all'), count:() => erCount('bday'),
        hint:{pc:'走到店门口，卡片弹出来按 <kbd>F</kbd> 买下；买到的东西在任务条下面', touch:'走到店门口，点卡片买下；买到的东西在任务条下面'},
        tip:'肉片和丸子是冷冻的，买了十分钟内要送到，最后再去 KIP。水果夜市天黑才开，白天去 Bell 的鲜果蔬菜。',
        nudge:'采购单上的店：KIP 超市、DIY 五金、上校炸鸡（都在 KIP 那边），嘛嘛档、秘方蛋糕、鲜果蔬菜（都在 Bell）。'},
      {id:'c4_party', text:'把东西送到 LY 宿舍楼下', rm:0, isNew:true, errand:'bday', at:() => erAt('bday'), r:0,
        done:Q => Q.flag('q_bday'),
        hint:{pc:'到 LY 宿舍楼下的黄圈，按 <kbd>F</kbd> 送到', touch:'到 LY 宿舍楼下的黄圈，点卡片送到'},
        tip:'大家都在楼上等着了。'}
    ); }
  D.diary.c4_shop = '照着阿明的采购单跑了半个雪邦：KIP、五金店、炸鸡、嘛嘛档，还有蛋糕。';
  D.diary.c4_party = '我的生日。小小的宿舍挤了五个人和一个鸳鸯锅，宿管阿姨来敲门，最后也坐下来吃了一碗。';
  Object.assign(D.msgs, {
    mom_bday:{from:'mom', text:'下礼拜你生日，一个人在那边记得吃好一点。'},
    am_bday:{from:'aming', text:'生日？？那必须在宿舍搞火锅局！采购单发你了，买齐送到 LY 楼下 lah。'},
    mom_bday2:{from:'mom', text:'生日快乐。吃火锅了？别吃太辣。红包收一下。'}
  });
  const stepIs = id => G(() => XQuest.step().id === id, false);
  D.events.push(
    {id:'ev_bday_mom', when:() => chIs(4) && stepIs('c4_shop'), msg:'mom_bday'},
    {id:'ev_bday_am', when:() => chIs(4) && stepIs('c4_shop') && G(() => XQuest.state.msgs.some(e => e.m === 'mom_bday'), false), msg:'am_bday'}
  );

  /* ---------- 第 3 章：陪卷卷在 A3 图书馆自习一整天（过场 library：大窗外的天从白天变成粉红色） ---------- */
  const libAt = [112, 116.5];
  { const c3 = D.chapters.find(c => c.n === 3), i = c3.steps.findIndex(s => s.id === 'c3_exam');
    c3.replayCine = 'library';
    c3.steps.splice(i + 1, 0, {id:'c3_study', text:'陪卷卷在 A3 图书馆自习一整天', rm:40, isNew:true, at:libAt, r:5,
      done:Q => Q.flag('q_study'),
      hint:{pc:'走到 A3 大台阶东边卷卷那里的黄圈', touch:'走到 A3 大台阶东边卷卷那里的黄圈'},
      tip:'图书馆北面是一整面落地大窗，傍晚的天会变成粉红色。'}); }
  D.diary.c3_study = '陪卷卷在 A3 图书馆自习了一整天。抬头的时候，大窗户外面的天整个变成了粉红色。';
  { let busy = false;
    D.watch.push((Q, flag) => {
      if (busy || Q.flag('q_study') || !stepIs('c3_study') || !Q.near(libAt[0], libAt[1], 6) || Q.driving() || G(() => XCine.busy, true)) return;
      if (window.XCine && XCine.play && XCine.play('library', {onDone:() => { busy = false; flag('q_study'); }})) busy = true; else flag('q_study');
    }); }
  /* ---------- 第 5 章：先跟 Ben 师傅去二园看一场比赛（过场 f1），发誓要当车手，后面的步骤是特训和改装 ---------- */
  const gsAt = () => G(() => { const F = XF1, i = F.SF + 60, p = F.PT[i], n = F.NOR[i]; return [p[0] - n[0] * 11, p[1] - n[1] * 11]; }, [88, 973]);
  { const c5 = D.chapters.find(c => c.n === 5);
    c5.replayCine = 'f1';
    c5.recap = '（补记）跟 Ben 师傅在二园看了一场比赛，发誓要当车手；后来天天改车、飞大跳台、跑雪邦赛道。';
    c5.intro = [
      ['ben', '阿明说你会开车？先别急着改车。'],
      ['ben', '这个周末二园有比赛。跟我去主看台看一场，看完你就知道车是拿来干什么的。'],
      ['ben', '二园在 Bell Avenue 东南边，主看台在主直道旁边。我先过去，你自己开过来。']
    ];
    c5.outro.splice(2, 0, ['ben', '还有这套雪邦赛道涂装，是我们车队以前的。贴上它，你就是车队的人了。']);
    c5.reward = Object.assign({}, c5.reward, {decal:'sepang', note:'一件航空钛锭 + 鹅颈尾翼配方 + 雪邦赛道涂装'});
    for (const s of c5.steps) if (!/^特训/.test(s.text)) s.text = '特训：' + s.text;
    c5.steps.unshift({id:'c5_watch', text:'跟 Ben 师傅去二园主看台看一场比赛', rm:40, isNew:true, at:gsAt, r:6,
      done:Q => Q.flag('q_f1'),
      hint:{pc:'开车到二园，主直道旁边的主看台前，走进黄圈', touch:'开车到二园，主直道旁边的主看台前，走进黄圈'},
      tip:'二园就是雪邦赛道那一园，在 Bell Avenue 东南边的油棕园公路两边。',
      nudge:'二园在 Bell Avenue 东南边，顺着油棕园公路开，看到大看台就到了。'}); }
  D.diary.c5_watch = '跟 Ben 师傅在二园看了一场比赛。赛车从面前冲过去，地都在抖。我跟自己说：总有一天，我也要在这条赛道上拿第一。';
  /* 走进主看台前的黄圈就开演（走路、开车都行；做完这一步就不再放） */
  { let busy = false;
    D.watch.push((Q, flag) => {
      if (busy || Q.flag('q_f1') || !stepIs('c5_watch')) return;
      const a = gsAt(); if (!a || !Q.near(a[0], a[1], 14) || G(() => XCine.busy, true)) return;
      if (window.XCine && XCine.play && XCine.play('f1', {onDone:() => { busy = false; flag('q_f1'); }})) busy = true; else flag('q_f1');
    }); }

  /* ---------- 第 6 章：买了房就搬出宿舍 ---------- */
  { const c6 = D.chapters.find(c => c.n === 6), i = c6.steps.findIndex(s => s.id === 'c6_house1');
    c6.steps.splice(i + 1, 0,
      {id:'c6_move', text:'搬家：把宿舍的行李搬到新家', rm:50, isNew:true, errand:'move', at:() => erAt('move'), r:0,
        done:Q => Q.flag('er_move_done'), count:() => erCount('move'),
        hint:{pc:'先到 LY 宿舍楼下把行李搬上车，再开到新家门口按 <kbd>F</kbd>', touch:'先到 LY 宿舍楼下把行李搬上车，再开到新家门口点卡片'},
        tip:'卷卷和阿明说来帮忙，其实是来蹭饭的。'}); }
  D.diary.c6_move = '最后一次从 LY 宿舍搬东西下楼。那张火锅圆桌和小板凳，我也带走了。';

  /* ---------- 第 8 章 新学期：换你当学长，带新生阿豆走一遍第 1 章的路（步骤不标 isNew：老玩家也要自己走一遍） ---------- */
  D.chapters.push({n:8, id:'c8', title:'新学期', npc:'xiaoman', place:'南门', guide:['map'],
    report:'带阿豆回南门找小满学姐', diaryStart:'c8_start', diaryEnd:'c8_end', startMsg:'xm_ch8', endMsg:'mom_y2',
    recap:'（补记）带新生阿豆走了一遍我第一天走过的路。',
    intro:[
      ['adou', '学、学长好！我叫阿豆，是今年最后一个报到的……'],
      ['xiaoman', '今年的最后一个，我不带了，交给你。'],
      ['xiaoman', '先别想着开车啦，走路带他把学校认熟——这句话耳熟吧？'],
      ['adou', '学长，A3 在哪？我在飞机上就听说 A3 的台阶很宽……']
    ],
    outro:[
      ['adou', '学长，学校好大……可是我好像不怕了。'],
      ['xiaoman', '一年前，我也是站在这儿，看着你一路走远的。'],
      ['xiaoman', '以后他就交给你啦。第二年，好好过。'],
      ['adou', '谢谢学长！我以后也要像你一样！']
    ],
    reward:{rm:600, title:'靠谱学长 / 学姐', note:'称号「靠谱学长 / 学姐」'},
    steps:[
      {id:'c8_a3', text:'带阿豆走到 A3 大台阶', rm:40, at:[105, 120], r:7,
        done:Q => Q.near(105, 120, 9) && Q.withMe('adou'),
        hint:{pc:'阿豆跟在你后面走；开车也行，他会坐上来', touch:'阿豆跟在你后面走；开车也行，他会坐上来'},
        tip:'阿豆走得慢，回头看看他跟上没有。', nudge:'沿着中轴线往北走，阿豆会跟着你。'},
      {id:'c8_d6', text:'带阿豆去 D6 食堂认认外卖点', rm:40, at:[342, -146.4], r:6,
        done:Q => Q.near(342, -146.4, 9) && Q.withMe('adou'),
        tip:'老周在那儿。阿豆有点怕他。'},
      {id:'c8_swing', text:'带阿豆去音乐岛的秋千', rm:40, at:[-26, -58], r:5,
        done:Q => Q.near(-26, -58, 8) && Q.withMe('adou'),
        tip:'就是你第一天荡过的那架秋千。'},
      {id:'c8_mamak', text:'带阿豆去嘛嘛档喝一杯拉茶', rm:40, at:[127, 330], r:5,
        done:Q => Q.near(127, 330, 9) && Q.withMe('adou'),
        tip:'他第一次喝拉茶，看他会不会也被甜得一激灵。'}
    ]});
  D.diary.c8_start = '小满学姐把今年最后一个新生交给我，他叫阿豆。';
  D.diary.c8_a3 = '阿豆站在 A3 台阶上说「好宽」，跟我第一天说的一模一样。';
  D.diary.c8_d6 = '带阿豆认了 D6 的外卖点，老周瞪了他一眼，他吓得躲到我身后。';
  D.diary.c8_swing = '阿豆荡秋千荡到最高的时候喊了一声，我好像听见了一年前的自己。';
  D.diary.c8_mamak = '请阿豆喝了第一杯拉茶，他被甜得一激灵。我笑出了声。';
  D.diary.c8_end = '第二年，开始了。';
  Object.assign(D.msgs, {
    xm_ch8hi:{from:'xiaoman', text:'回南门一趟？今年最后一个新生到了，我想交给你带。'},
    xm_ch8:{from:'xiaoman', text:'别走太快，他还不认路。'},
    mom_y2:{from:'mom', text:'听说你当学长了？妈妈很骄傲。'}
  });
  D.events.push({id:'ev_xm_ch8hi', when:() => chIs(8), msg:'xm_ch8hi'});

  /* ---------- 新角色的支线（采购单） ---------- */
  const erDone = id => Q => Q.flag('er_' + id + '_done');
  D.sides.push(
    {id:'rose_rice', npc:'rose', after:'c4', text:'帮罗丝阿姨给 Taman Warisan Megah 8 号送一袋米', rm:60, errand:'rice', done:erDone('rice')},
    {id:'rose_kip', npc:'rose', after:'c4', text:'KIP 超市大乱斗打到「大促场」', rm:100, done:() => G(() => XKipMart.tier() >= 2, false)},
    {id:'du_send', npc:'durian', after:'c4', text:'挑一颗猫山王送到 D6 给老周', rm:80, errand:'durian', done:erDone('durian')},
    {id:'km_supper', npc:'kumar', after:'c4', text:'夜宵：拉茶和 Roti 趁热送到 A3 给卷卷', rm:60, errand:'supper', done:erDone('supper')},
    {id:'adi_ice', npc:'adi', after:'c5', text:'一箱冰水送去汽车游乐园给 Ben 师傅', rm:100, errand:'ice', done:erDone('ice')}
  );
  /* CONTENT:END */

  return D;
})();
