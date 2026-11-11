/* XMUM 校园漫游 · 主线剧情的数据：人机奶蛙、七章步骤、支线、日记句子、手机消息、想家独白
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

  /* ---------- 发消息的人 ---------- */
  Object.assign(D.people, {
    mom:{name:'妈妈', icon:'妈', color:'#e8708a'},
    xiaoman:{name:'小满学姐', icon:'满', color:'#3f8fe6'}
  });

  /* ---------- 人机奶蛙（角色都是虚构的） ---------- */
  /* 南门：校碑在门外中轴线上（x≈96, z≈258），小满站在碑的东边、靠门这一侧，面朝北（进校的方向）。 */
  D.npcs.xiaoman = {name:'小满学姐', short:'小满', color:'#3f8fe6', place:'南门校碑旁', at:[104.5, 251, Math.PI],
    look:{skin:'classic', outfit:'shirt', neck:'badge', head:'buns'}, shape:'slim',
    chat:['迷路了就按 M 看地图，我画得可清楚了。', '今天的外卖单多不多？D6 那边最旺。', '有事就来南门找我，我天天在这儿。']};

  /* ================= 第 1 章 新生报到（核心，js/89-quest.js 的作者负责） ================= */
  D.chapters.push({n:1, id:'c1', title:'新生报到', npc:'xiaoman', place:'南门', unlock:'drive', unlockAt:'end',
    guide:['keys', 'map', 'hello'], report:'回南门找小满学姐', diaryStart:'c1_start', diaryEnd:'c1_end',
    recap:'（补记）那时候刚来，走路送外卖，跑得腿都软了。',
    intro:[
      ['xiaoman', '欢迎来到 XMUM！大巴一路晃过来累了吧？'],
      ['xiaoman', '你就是今年最后一个报到的吧？钱包里……就这么点？'],
      ['xiaoman', '这个迎新工作牌给你，挂上它大家就知道你是新来的，有事会帮你。'],
      ['xiaoman', '先别想着开车啦，走路把学校认熟。迷路了就打开地图，忘了怎么做就按 P 翻手册，我都写在里面了。'],
      ['xiaoman', '第一站：顺着屏幕上面的指南针，走到 A3 大台阶。去吧！']
    ],
    outro:[
      ['xiaoman', '五单全送到了？还荡了秋千？可以啊，比我当年强多了。'],
      ['xiaoman', '喏，这是一辆 Myvi 的钥匙，学长毕业留下的，旧是旧了点，跑得动。'],
      ['xiaoman', () => K('开车：W / S 油门刹车，A / D 转向，按住空格漂移，F 下车。车就停在你旁边。', '开车：左下摇杆推着走，右下「漂移」按住甩尾，「下车」下来。车就停在你旁边。')],
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
      {id:'c1_deliv1', text:'走路送出第一单外卖', rm:30,
        done:Q => Q.ach('deliv1'),
        hint:{pc:'走进橙色光圈，按 <kbd>F</kbd> 或 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 接单', touch:'走进橙色光圈，点卡片上的单子接单', flash:'#mini'},
        tip:'这一章的外卖只派校园里的单，时间也多给一半，走路跑步都来得及。', guide:'earn',
        nudge:'D6 食堂门口有橙色圈圈，从那儿接单最近。'},
      {id:'c1_deliv5', text:'再送四单（一共 5 单）', rm:60,
        done:Q => Q.life('deliv') >= 5, count:Q => [Math.min(5, Q.life('deliv')), 5],
        hint:{pc:'看屏幕上方的倒计时，跟着指南针跑', touch:'看屏幕上方的倒计时，跟着指南针跑'},
        tip:'送晚了顾客会给差评，跑起来！', guide:'earn',
        nudge:'送单的时候摇杆推到底跑，时间很宽裕的。'},
      {id:'c1_swing', text:'去音乐岛旁边荡一次秋千', rm:20, at:[-26, -58], r:5,
        done:Q => Q.ach('swing'),
        hint:{pc:'走到秋千旁按 <kbd>F</kbd> 坐上去，按住 <kbd>空格</kbd> 越荡越高', touch:'走到秋千旁点「上车」坐上去，按住「荡」越荡越高', flash:'#act-f'},
        tip:'秋千在音乐岛西边的草坪上，荡高了松手能飞出去。',
        nudge:'秋千在音乐岛西边，树林边的草坪上，地图上找「秋千」两个字。'}
    ]});

  D.diary.c1_start = '小满学姐塞给我一个工作牌，说先走路把学校认熟。';
  D.diary.c1_a3 = 'A3 的台阶好宽，站在上面能看到整条中轴线。';
  D.diary.c1_deliv1 = '送出了第一单外卖，手心全是汗。';
  D.diary.c1_late = '送第一单外卖的时候差点迟到，跑得腿都软了。';
  D.diary.c1_swing = '在音乐岛旁边荡秋千，荡到最高的时候好像能飞起来。';
  D.diary.c1_end = '学姐把一辆 Myvi 的钥匙交给我。我有车了！';
  D.diary.homesick = '{when}有一架黄色的飞机从头顶飞过去……我想家了。';
  D.diary.intro = '飞机落地的时候，窗外全是一排一排的油棕树。';

  D.msgs.mom_arrive = {from:'mom', text:'到学校了吗？到了跟妈说一声。'};
  D.msgs.mom_rain = {from:'mom', text:'刚看了天气，雪邦下雨了吗？记得带伞。'};
  D.msgs.mom_video = {from:'mom', text:'视频吗？你爸也在。'};
  D.msgs.mom_car = {from:'mom', text:'开车慢点！！'};
  D.msgs.mom_late = {from:'mom', text:'这么晚还不睡？'};
  D.msgs.xm_ch1done = {from:'xiaoman', text:'车开稳一点哦。老周在 D6 等你，他嘴硬心软。'};

  D.events.push(
    {id:'ev_late1', when:Q => Q.flag('lateDeliv'), diary:'c1_late'},
    {id:'ev_drive', when:Q => Q.driving() && Q.unlocked('drive'), msg:'mom_car'},
    {id:'ev_night', when:() => { const h = new Date().getHours(); return h >= 1 && h < 5; }, msg:'mom_late'}
  );

  D.homesick = {
    first:'……我想家了。',
    more:['不知道家里现在几点了。', '好想吃妈妈做的饭。', '下次放假，坐那班飞机回去。'],
    night:'家那边，现在也是晚上吗？'
  };

  /* ================= 第 2–7 章、支线、其余日记和消息（内容分工：只改这一段） ================= */
  /* CONTENT:BEGIN */
  /* CONTENT:END */

  return D;
})();
