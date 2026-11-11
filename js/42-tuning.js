/* XMUM 校园漫游 · 改装车：改装道具（分稀有度）、配方、零件目录，以及把零件真正装到车上（轮毂、宽体、尾翼、霓虹、排气、姿态、越野件、摩托件）。
   界面、施工队列、存档和道具发放在 js/93-tuning-ui.js；氮气、技能、尾焰这些开车时的效果在 js/94-tuning-drive.js；接口说明见 docs/tuning.md。
   性能改装（TN_PERF = 1）：每件零件的 perf 字段（加速 acc、极速 maxV、抓地 grip、操控 steer）按比例加在车的数值上。
   不同车型能改的东西不一样：TN_CLASS 把车分成 c 普通车、s 跑车、u 越野、m 摩托，槽位和零件用 cls 限定车型。
   所有几何体按车型缓存、材质共用，换零件只是换几个 mesh，手机上一辆改装车多 4~6 个 draw call。
   车型借的是"夸张宽体碳纤维"那一路风格，不出现任何真实改装厂、车厂的名字和标志。 */
'use strict';

/* ---------- 改装道具（不能用钱买，只能玩出来；js/93-tuning-ui.js 的 XParts.grant / XParts.reward 发放） ----------
   rar 稀有度：n 普通、r 稀有、l 传说。rm 是总资产里一件道具的估值（js/80-gta.js netWorth），from 是背包里告诉玩家去哪儿拿 */
const TN_RAR = {n:{name:'普通', c:'#8d98a5'}, r:{name:'稀有', c:'#3f8ee6'}, l:{name:'传说', c:'#e6a53a'}, b:{name:'配方', c:'#b45ee6'}};
const TN_PARTS = [
  {id:'rim',   name:'轮毂坯件', ch:'毂', color:'#7f93a8', rar:'n', rm:6,   from:'送外卖、得来速、每天第一次打卡；投篮和食堂端盘子按奖牌给'},
  {id:'lacq',  name:'赛车漆料', ch:'漆', color:'#e2714c', rar:'n', rm:5,   from:'得来速、蜜雪冰橙打工、挑战赛、顺风车、喷漆车间甩警戒、惊险擦车和大跳慢动作、特技连击、每天第一次打卡'},
  {id:'neon',  name:'霓虹灯管', ch:'灯', color:'#c04ae0', rar:'n', rm:8,   from:'宿舍撤离、送夜宵、蜜雪冰橙打工、顺风车好评'},
  {id:'cf',    name:'碳纤维板', ch:'碳', color:'#3b3f46', rar:'r', rm:12,  from:'猴子大战、黑洞模式、秋千飞跃 30 米以上、宿舍撤离带出 RM 150 以上、挑战赛金牌'},
  {id:'turbo', name:'涡轮',     ch:'涡', color:'#c39a3a', rar:'r', rm:20,  from:'竞速前三、抓住偷外卖的小偷、B1 小游戏金牌'},
  {id:'nos',   name:'氮气罐',   ch:'氮', color:'#2aa9de', rar:'r', rm:22,  from:'竞速（名次越好越多）、影线 1v1 跑赢、甩掉保安（星越多越多）、特技大连击'},
  {id:'tyre',  name:'热熔胎皮', ch:'胎', color:'#5b5048', rar:'r', rm:18,  from:'挑战赛和山梁拉力、KIP 大乱斗、猴子大战金牌、特技大连击'},
  {id:'ecu',   name:'调校芯片', ch:'芯', color:'#2fa36f', rar:'r', rm:20,  from:'教学楼潜入、奶娃投篮金牌'},
  {id:'susp',  name:'避震套件', ch:'震', color:'#7c5bd0', rar:'r', rm:18,  from:'KIP 大乱斗、宿舍撤离'},
  {id:'plan',  name:'改装图纸', ch:'图', color:'#3c80e0', rar:'r', rm:30,  from:'每解锁一个成就、清空 Bell 通缉榜、拿到已经有的配方'},
  {id:'ti',    name:'航空钛锭', ch:'钛', color:'#8e9bc0', rar:'l', rm:80,  from:'宿舍撤离一次带出 RM 300 以上（一定给）、RM 150 以上（50%）；黑洞第 1 名 12%、猴子大战金牌 12%、竞速第 1 名 10%、奶娃投篮金牌 8%'},
  {id:'core',  name:'赛道引擎核心', ch:'核', color:'#e0543c', rar:'l', rm:120, from:'清空 Bell 路口的通缉榜（六个小偷全抓完，一定给）；教学楼潜入金牌 25%、竞速第 1 名 8%、从 4 星以上甩掉保安 5%、黑洞第 1 名 4%'}
];
const TN_PART = {}; for (const p of TN_PARTS) TN_PART[p.id] = p;
/* 改装配方：拿到一次就永久解锁对应的顶级改装（还要配稀有零件）。重复拿到的换成 1 张改装图纸 */
const TN_BPS = [
  {id:'bp_nitro',   name:'氮气系统配方',   ch:'氮', for:'双罐氮气、直喷赛级氮气', from:'竞速第一次在一条赛道拿冠军'},
  {id:'bp_twin',    name:'双涡轮配方',     ch:'涡', for:'双涡轮引擎', from:'教学楼潜入（任意委托金牌）'},
  {id:'bp_race',    name:'赛道引擎配方',   ch:'擎', for:'赛道级引擎（顶级）', from:'五条赛道都跑完（一定给）、抢救期末卷成功（30%）'},
  {id:'bp_wide',    name:'宽体套件配方',   ch:'宽', for:'宽体轮眉（跑车）', from:'宿舍撤离带出 RM 150 以上'},
  {id:'bp_swan',    name:'鹅颈尾翼配方',   ch:'翼', for:'鹅颈双层尾翼（跑车）', from:'宿舍撤离带出 RM 150 以上、秋千飞跃 40 米以上（小几率）'},
  {id:'bp_plasma',  name:'等离子尾焰配方', ch:'焰', for:'等离子尾焰', from:'宿舍撤离、Bell 大胃王争霸赛冠军'},
  {id:'bp_drift',   name:'漂移增压配方',   ch:'漂', for:'漂移增压技能', from:'宿舍撤离、猴子大战金牌'},
  {id:'bp_launch',  name:'弹射起步配方',   ch:'弹', for:'弹射起步技能', from:'教学楼潜入、得来速完美送达、顺风车连续三单五星'},
  {id:'bp_offroad', name:'越野套件配方',   ch:'越', for:'37 寸泥地胎、绞盘防撞杠（越野车）', from:'KIP 大乱斗第 1 名、教学楼潜入'},
  {id:'bp_moto',    name:'赛道摩托配方',   ch:'摩', for:'赛道整流罩、钛蝎排气（摩托）', from:'教学楼潜入、影线 1v1 跑赢'}
];
/* 配方在总资产里一张算 RM 60（道具和配方的估值跟着改装价格一起调低了，见 docs/tuning.md「价格和车价」） */
const TN_BP = {}; for (const b of TN_BPS){ b.rar = 'b'; b.color = TN_RAR.b.c; b.rm = 60; TN_BP[b.id] = b; }
/* 施工时间按档：轻改几分钟、中改几十分钟、高级几小时、顶级跨天 */
const TN_TIER = {n:'轻改', r:'中改', l:'高级', x:'顶级'};
const TN_TIERC = {n:'普通', r:'稀有', l:'传说', x:'顶级'};

/* 车型分类：c 普通车、s 跑车、u 越野、m 摩托。槽位 / 零件的 cls 写哪几类能装（不写 = 普通车和跑车） */
const TN_CLASS = {myvi:'c', rr:'c', p911:'s', mase:'s', lambo:'s', gwag:'u', moto:'m'};
const TN_ALL = 'csum';

/* ---------- 零件目录 ----------
   槽位顺序就是联机外观字符串里的顺序（每个槽一个 36 进制字符），只能在末尾追加，不能改顺序；槽里的零件也只能往后加。
   每个槽的第一件是原厂件：免费、自带。min = 施工分钟数，need = 要消耗的道具，bp = 要先有的配方，rm = 金币，
   tier = n 轻改（几分钟）/ r 中改（几十分钟）/ l 高级（几小时）/ x 顶级（跨天）。 */
const TN_SLOTS = [
  {id:'rim',    name:'轮毂造型', tab:'wheel', cls:'csu'},
  {id:'rimc',   name:'轮毂颜色', tab:'wheel', cls:TN_ALL},
  {id:'size',   name:'尺寸 · 低扁胎', tab:'wheel'},
  {id:'wide',   name:'宽体', tab:'body', cls:'s'},
  {id:'lip',    name:'前铲', tab:'body'},
  {id:'skirt',  name:'侧裙', tab:'body'},
  {id:'diff',   name:'扩散器', tab:'body'},
  {id:'hood',   name:'引擎盖', tab:'body'},
  {id:'aero',   name:'套件材质', tab:'body'},
  {id:'wing',   name:'尾翼', tab:'wing'},
  {id:'neon',   name:'底盘霓虹', tab:'light', cls:'csu'},
  {id:'neonc',  name:'霓虹颜色', tab:'light', cls:'csu'},
  {id:'drl',    name:'日行灯', tab:'light', cls:'csu'},
  {id:'exh',    name:'排气', tab:'exh', cls:'csu'},
  {id:'low',    name:'降低车身', tab:'stance'},
  {id:'camber', name:'外倾角', tab:'stance'},
  /* 第二轮：性能、氮气和技能、尾焰（所有车型），越野车和摩托车的专属件 */
  {id:'eng',    name:'引擎', tab:'perf', cls:TN_ALL},
  {id:'tyre',   name:'轮胎', tab:'perf', cls:TN_ALL},
  {id:'susp',   name:'悬挂', tab:'perf', cls:TN_ALL},
  {id:'nos',    name:'氮气加速', tab:'skill', cls:TN_ALL},
  {id:'skill',  name:'驾驶技能', tab:'skill', cls:TN_ALL},
  {id:'trail',  name:'尾焰', tab:'trail', cls:TN_ALL},
  {id:'trailc', name:'尾焰颜色', tab:'trail', cls:TN_ALL},
  {id:'lift',   name:'升高', tab:'stance', cls:'u'},
  {id:'otyre',  name:'越野轮胎', tab:'wheel', cls:'u'},
  {id:'rack',   name:'车顶行李架', tab:'body', cls:'u'},
  {id:'winch',  name:'防撞杠 · 绞盘', tab:'body', cls:'u'},
  {id:'mexh',   name:'排气', tab:'exh', cls:'m'},
  {id:'fair',   name:'整流罩', tab:'body', cls:'m'},
  {id:'mrim',   name:'轮圈', tab:'wheel', cls:'m'}
];
const TN_TABS = [['perf', '性能'], ['skill', '氮气技能'], ['trail', '尾焰'], ['wheel', '轮毂'], ['body', '车身'], ['wing', '尾翼'], ['light', '灯光'], ['exh', '排气'], ['stance', '姿态']];
const TN_NEONC = {cyan:'#35e0ff', pink:'#ff5fb4', purple:'#a35cff', green:'#7dff5a', orange:'#ff8a2a', red:'#ff3344', white:'#f2f6ff'};
const TN_ITEMS = [
  /* 轮毂 */
  {slot:'rim', id:'stock', name:'原厂轮毂', desc:'出厂的五辐轮毂'},
  {slot:'rim', id:'mesh', name:'多辐轮毂', desc:'十四根细辐条，转起来像一张网', rm:70, need:{rim:2}, min:6, style:'mesh'},
  {slot:'rim', id:'dish', name:'深唇轮毂', desc:'镀铬外唇往外翻，轮辐缩在很深的位置', rm:100, need:{rim:3, lacq:1}, min:10, style:'dish'},
  {slot:'rim', id:'forged', name:'锻造 Y 辐', desc:'六组 Y 形辐条，又轻又凶', rm:150, need:{rim:3, cf:1}, min:40, style:'forged', tier:'r', perf:{acc:.01}},
  {slot:'rim', id:'turbine', name:'涡扇轮毂', desc:'十二片扭转叶片，开起来像涡轮在转', rm:140, need:{rim:3, turbo:1}, min:40, style:'turbine', tier:'r'},
  {slot:'rim', id:'glow', name:'发光轮毂', desc:'轮圈内侧一圈灯带，颜色跟霓虹走，夜里最显眼', rm:200, need:{rim:2, neon:2}, min:120, style:'glow', tier:'l'},
  {slot:'rimc', id:'stock', name:'原厂银', col:'#c4c8cc'},
  {slot:'rimc', id:'black', name:'亮黑', col:'#202226', rm:20, need:{lacq:1}, min:2},
  {slot:'rimc', id:'gun', name:'枪灰', col:'#4d525a', rm:20, need:{lacq:1}, min:2},
  {slot:'rimc', id:'bronze', name:'古铜', col:'#8f6b38', rm:30, need:{lacq:1}, min:3},
  {slot:'rimc', id:'red', name:'赛车红', col:'#c8302a', rm:30, need:{lacq:1}, min:3},
  {slot:'rimc', id:'white', name:'珍珠白', col:'#eeece6', rm:30, need:{lacq:1}, min:3},
  {slot:'rimc', id:'gold', name:'香槟金', col:'#d2b06a', rm:50, need:{lacq:2}, min:20, tier:'r'},
  {slot:'size', id:'stock', name:'原厂尺寸', s:1, lp:.66},
  {slot:'size', id:'s1', name:'大一寸', desc:'轮毂更大、胎壁更薄', rm:50, need:{rim:1}, min:4, s:1.04, lp:.74},
  {slot:'size', id:'s2', name:'大两寸 · 低扁胎', desc:'轮毂撑满轮拱，胎壁薄得像一条线', rm:110, need:{rim:2}, min:30, s:1.08, lp:.82, tier:'r', perf:{grip:.01}},
  /* 车身 */
  {slot:'wide', id:'stock', name:'原厂车身'},
  {slot:'wide', id:'wide', name:'宽体轮眉', desc:'四个轮眉外扩，轮距每边加宽 12 厘米', rm:300, need:{cf:4}, bp:'bp_wide', min:240, tier:'l', perf:{grip:.04}},
  {slot:'lip', id:'none', name:'不装'},
  {slot:'lip', id:'lip', name:'前铲', desc:'车头下面一块贴地的平板', rm:80, need:{cf:1}, min:8},
  {slot:'lip', id:'canard', name:'前铲 + 风刀', desc:'前铲再加车头两侧的四片风刀', rm:130, need:{cf:2}, min:30, tier:'r', perf:{grip:.01}},
  {slot:'skirt', id:'none', name:'不装'},
  {slot:'skirt', id:'skirt', name:'侧裙', desc:'两侧车门下面的裙边，车身看起来更低', rm:80, need:{cf:1}, min:8},
  {slot:'diff', id:'none', name:'不装'},
  {slot:'diff', id:'diff', name:'扩散器', desc:'车尾下面一排导流片', rm:100, need:{cf:2}, min:12, perf:{grip:.01}},
  {slot:'hood', id:'stock', name:'原厂引擎盖'},
  {slot:'hood', id:'vents', name:'双进气口', desc:'引擎盖上两个带格栅的散热口', rm:90, need:{cf:1, turbo:1}, min:12},
  {slot:'hood', id:'scoop', name:'顶置大进气', desc:'引擎盖正中一个大进气口', rm:130, need:{cf:2, turbo:1}, min:35, tier:'r', perf:{acc:.01}},
  {slot:'aero', id:'body', name:'车身同色', desc:'前铲、侧裙、尾翼、轮眉跟车漆一个颜色'},
  {slot:'aero', id:'black', name:'亮黑套件', desc:'所有外挂件刷成钢琴黑', rm:50, need:{lacq:2}, min:5},
  {slot:'aero', id:'carbon', name:'碳纤维套件', desc:'所有外挂件换成裸碳，看得见编织纹', rm:170, need:{cf:4}, min:50, tier:'r'},
  /* 尾翼：大尾翼和鹅颈只给跑车 */
  {slot:'wing', id:'none', name:'不装'},
  {slot:'wing', id:'duck', name:'鸭尾', desc:'车尾翘起一道小边', rm:80, need:{cf:1}, min:8},
  {slot:'wing', id:'gt', name:'大尾翼', desc:'两根立柱撑起一片大翼板，带端板', rm:220, need:{cf:3, plan:1}, min:55, tier:'r', cls:'s', perf:{grip:.03}},
  {slot:'wing', id:'swan', name:'鹅颈双层尾翼', desc:'立柱从上面吊住翼板，再加一层襟翼，最夸张的一款', rm:280, need:{cf:4, turbo:1}, bp:'bp_swan', min:300, tier:'l', cls:'s', perf:{grip:.05}},
  /* 灯光 */
  {slot:'neon', id:'none', name:'不装'},
  {slot:'neon', id:'kit', name:'底盘霓虹', desc:'车底一圈灯管，地上映出一片光，天黑以后更亮', rm:110, need:{neon:3}, min:12},
  {slot:'neonc', id:'cyan', name:'冰蓝', col:TN_NEONC.cyan},
  {slot:'neonc', id:'pink', name:'樱粉', col:TN_NEONC.pink, rm:25, need:{neon:1}, min:3},
  {slot:'neonc', id:'purple', name:'电紫', col:TN_NEONC.purple, rm:25, need:{neon:1}, min:3},
  {slot:'neonc', id:'green', name:'酸绿', col:TN_NEONC.green, rm:25, need:{neon:1}, min:3},
  {slot:'neonc', id:'orange', name:'熔橙', col:TN_NEONC.orange, rm:25, need:{neon:1}, min:3},
  {slot:'neonc', id:'red', name:'警灯红', col:TN_NEONC.red, rm:25, need:{neon:1}, min:3},
  {slot:'neonc', id:'white', name:'极光白', col:TN_NEONC.white, rm:25, need:{neon:1}, min:3},
  {slot:'drl', id:'none', name:'不装'},
  {slot:'drl', id:'bar', name:'贯穿灯带', desc:'车头一整条白光', rm:60, need:{neon:1}, min:5},
  {slot:'drl', id:'fang', name:'獠牙灯', desc:'两侧各一道折线，像獠牙', rm:70, need:{neon:1}, min:6},
  {slot:'drl', id:'quad', name:'四眼点阵', desc:'每边两颗方灯', rm:65, need:{neon:1}, min:5},
  /* 排气 */
  {slot:'exh', id:'stock', name:'原厂排气'},
  {slot:'exh', id:'dual', name:'双边双出', desc:'左右各一根镀铬尾喉，大脚油门会喷火', rm:80, need:{turbo:1}, min:8, n:2},
  {slot:'exh', id:'quad', name:'钛烤蓝四出', desc:'四根烧成蓝紫色的钛尾喉，喷火更猛，松油门还会放炮', rm:150, need:{turbo:2}, min:40, n:4, ti:true, tier:'r', perf:{acc:.02}},
  /* 姿态 */
  {slot:'low', id:'stock', name:'原厂高度', drop:0},
  {slot:'low', id:'l1', name:'降低 4 厘米', rm:60, need:{rim:1}, min:6, drop:.04, perf:{steer:.01}},
  {slot:'low', id:'l2', name:'趴地 8 厘米', desc:'轮胎吃进轮拱里', rm:130, need:{rim:2, turbo:1}, min:35, drop:.08, tier:'r', perf:{grip:.01, steer:.02}},
  {slot:'camber', id:'stock', name:'原厂外倾', deg:0},
  {slot:'camber', id:'c3', name:'外倾 3°', desc:'轮胎上沿往里收', rm:40, need:{rim:1}, min:4, deg:3},
  {slot:'camber', id:'c7', name:'外倾 7°', desc:'八字脚，停着都很嚣张', rm:80, need:{rim:2}, min:25, deg:7, tier:'r'},
  /* 性能（第二轮）：数值看改装界面上的「改前 → 改后」 */
  {slot:'eng', id:'stock', name:'原厂引擎'},
  {slot:'eng', id:'ecu', name:'进气 + 芯片调校', desc:'换高流量进气，重刷一遍发动机电脑', rm:120, need:{ecu:1}, min:8, perf:{acc:.05}},
  {slot:'eng', id:'turbo', name:'单涡轮增压', desc:'一颗大涡轮，二档以后推背感明显', rm:300, need:{turbo:2, ecu:1}, min:45, tier:'r', perf:{acc:.10, maxV:.05}},
  {slot:'eng', id:'twin', name:'双涡轮', desc:'两颗涡轮轮流顶上来，全转速都有劲', rm:600, need:{turbo:3, ecu:2, ti:1}, bp:'bp_twin', min:240, tier:'l', perf:{acc:.16, maxV:.09}},
  {slot:'eng', id:'race', name:'赛道级引擎', desc:'整颗换成赛车用的引擎核心，顶级改装，要等差不多一天', rm:800, need:{core:1, ti:2, turbo:4, plan:2}, bp:'bp_race', min:1320, tier:'x', perf:{acc:.24, maxV:.14}},
  {slot:'tyre', id:'stock', name:'原厂轮胎'},
  {slot:'tyre', id:'street', name:'街道性能胎', desc:'软一点的胎，过弯没那么飘', rm:80, need:{rim:2, lacq:1}, min:6, perf:{grip:.05}},
  {slot:'tyre', id:'semi', name:'半热熔胎', desc:'热起来以后黏地，漂移也更好控', rm:200, need:{tyre:2}, min:30, tier:'r', perf:{grip:.10, steer:.03}},
  {slot:'tyre', id:'slick', name:'赛道热熔胎', desc:'几乎没有花纹，抓地像粘在地上', rm:350, need:{tyre:4, ti:1}, min:180, tier:'l', perf:{grip:.16, steer:.05, acc:.03}},
  {slot:'susp', id:'stock', name:'原厂悬挂'},
  {slot:'susp', id:'spring', name:'运动弹簧', desc:'短一点硬一点，转向更跟手', rm:70, need:{rim:1, lacq:1}, min:5, perf:{steer:.05}},
  {slot:'susp', id:'coil', name:'绞牙避震', desc:'软硬高低都能调', rm:200, need:{susp:2}, min:35, tier:'r', perf:{steer:.09, grip:.03}},
  {slot:'susp', id:'race', name:'赛道级悬挂', desc:'整套赛车用的连杆和避震', rm:320, need:{susp:3, ti:1}, min:150, tier:'l', perf:{steer:.13, grip:.05}},
  /* 氮气和技能：开车时用，见 js/94-tuning-drive.js。cap = 一罐能喷几秒，pow = 喷的时候极速多几成，fill = 几秒回满 */
  {slot:'nos', id:'none', name:'不装'},
  {slot:'nos', id:'n1', name:'单罐氮气', desc:'按住氮气键喷 2.5 秒，开着车慢慢回满', rm:250, need:{nos:2, turbo:1}, min:30, tier:'r', cap:2.5, pow:.3, fill:28, col:'#4fb8ff'},
  {slot:'nos', id:'n2', name:'双罐氮气', desc:'两罐串联，能喷 4 秒，推力更大', rm:450, need:{nos:4, turbo:2}, bp:'bp_nitro', min:200, tier:'l', cap:4, pow:.36, fill:24, col:'#58d2ff'},
  {slot:'nos', id:'n3', name:'直喷赛级氮气', desc:'直接喷进燃烧室，紫色火焰，5.5 秒，回得最快', rm:700, need:{nos:6, core:1, ti:1}, bp:'bp_nitro', min:1260, tier:'x', cap:5.5, pow:.45, fill:20, col:'#b36bff'},
  {slot:'skill', id:'none', name:'不装'},
  {slot:'skill', id:'launch', name:'弹射起步', desc:'停稳以后踩油门，一秒内猛地窜出去（8 秒冷却）', rm:180, need:{ecu:1, nos:1}, bp:'bp_launch', min:40, tier:'r'},
  {slot:'skill', id:'drift', name:'漂移增压', desc:'漂得越久，出弯那一下推得越猛，还给氮气回能', rm:180, need:{tyre:1, nos:1}, bp:'bp_drift', min:40, tier:'r'},
  /* 尾焰：开起来车尾拖一道光，夜里更亮；画质「流畅」档只画简化版，也可以在尾焰页关掉 */
  {slot:'trail', id:'none', name:'不装'},
  {slot:'trail', id:'streak', name:'光轨', desc:'尾灯拖出两道光带，越快越长', rm:60, need:{neon:2}, min:8},
  {slot:'trail', id:'flame', name:'火焰尾焰', desc:'排气口一直喷着火苗，踩油门窜得更高', rm:160, need:{neon:2, turbo:1}, min:30, tier:'r'},
  {slot:'trail', id:'plasma', name:'等离子尾焰', desc:'一整条发光的等离子带，边上飞火星，最帅的一款', rm:280, need:{neon:4, ti:1}, bp:'bp_plasma', min:180, tier:'l'},
  {slot:'trailc', id:'auto', name:'原色', desc:'光轨跟尾灯一样红，火焰是橙色，等离子是冰蓝'},
  {slot:'trailc', id:'cyan', name:'冰蓝', col:TN_NEONC.cyan, rm:20, need:{neon:1}, min:2},
  {slot:'trailc', id:'pink', name:'樱粉', col:TN_NEONC.pink, rm:20, need:{neon:1}, min:2},
  {slot:'trailc', id:'purple', name:'电紫', col:TN_NEONC.purple, rm:20, need:{neon:1}, min:2},
  {slot:'trailc', id:'green', name:'酸绿', col:TN_NEONC.green, rm:20, need:{neon:1}, min:2},
  {slot:'trailc', id:'gold', name:'鎏金', col:'#ffc94a', rm:20, need:{neon:1}, min:2},
  {slot:'trailc', id:'white', name:'极光白', col:TN_NEONC.white, rm:20, need:{neon:1}, min:2},
  /* 越野车：升高、大轮胎、行李架、防撞杠和绞盘 */
  {slot:'lift', id:'stock', name:'原厂高度', lift:0},
  {slot:'lift', id:'l1', name:'升高 6 厘米', desc:'车身抬高，轮拱里空出一截', rm:80, need:{rim:2}, min:8, lift:.06},
  {slot:'lift', id:'l2', name:'升高 14 厘米', desc:'高到要爬着上车，过坎不怕刮底', rm:220, need:{susp:2}, min:40, lift:.14, tier:'r', perf:{grip:.02}},
  {slot:'otyre', id:'stock', name:'原厂公路胎', s:1, knob:0},
  {slot:'otyre', id:'at', name:'全地形胎', desc:'粗一圈的块状花纹', rm:90, need:{rim:2}, min:8, s:1.06, knob:1, perf:{grip:.02}},
  {slot:'otyre', id:'mt', name:'37 寸泥地胎', desc:'又宽又高的大花纹泥地胎，把轮拱撑满', rm:380, need:{tyre:2, rim:3}, bp:'bp_offroad', min:150, s:1.15, knob:2, tier:'l', perf:{grip:.05}},
  {slot:'rack', id:'none', name:'不装'},
  {slot:'rack', id:'rack', name:'车顶行李架', desc:'整片铝合金行李架，四周一圈护栏', rm:80, need:{rim:2}, min:8},
  {slot:'rack', id:'lights', name:'行李架 + 灯排', desc:'行李架前沿一排射灯，夜里像白天', rm:170, need:{neon:2, cf:1}, min:30, tier:'r'},
  {slot:'winch', id:'none', name:'不装'},
  {slot:'winch', id:'bar', name:'前防撞杠', desc:'粗钢管焊的前杠', rm:90, need:{rim:1, lacq:1}, min:8},
  {slot:'winch', id:'winch', name:'防撞杠 + 绞盘', desc:'钢杠中间嵌一台电动绞盘，挂着红色拖钩', rm:320, need:{turbo:1, susp:1, ti:1}, bp:'bp_offroad', min:120, tier:'l'},
  /* 摩托车：排气、整流罩、轮圈 */
  {slot:'mexh', id:'stock', name:'原厂排气'},
  {slot:'mexh', id:'high', name:'高位排气', desc:'座位下面翘起来的双出尾段', rm:80, need:{rim:1, lacq:1}, min:8},
  {slot:'mexh', id:'ti', name:'钛蝎排气', desc:'烧成蓝紫色的钛管，声音像撕布', rm:350, need:{ti:1, turbo:1}, bp:'bp_moto', min:150, tier:'l', perf:{acc:.04}},
  {slot:'fair', id:'stock', name:'原厂整流罩'},
  {slot:'fair', id:'naked', name:'街车裸露', desc:'拆掉整流罩，露出车架和引擎', rm:50, need:{lacq:1}, min:5, perf:{steer:.03}},
  {slot:'fair', id:'wing', name:'碳纤维小翼', desc:'车头两侧各一对小翼，高速压得更稳', rm:170, need:{cf:2}, min:30, tier:'r', perf:{grip:.03}},
  {slot:'fair', id:'race', name:'赛道整流罩', desc:'碳纤维整流罩加高风挡，趴下去风阻最小', rm:380, need:{cf:4}, bp:'bp_moto', min:160, tier:'l', perf:{maxV:.05, grip:.02}},
  {slot:'mrim', id:'stock', name:'原厂轮圈'},
  {slot:'mrim', id:'spoke', name:'细辐轮圈', desc:'十四根细辐条', rm:70, need:{rim:2}, min:6, style:'mesh'},
  {slot:'mrim', id:'forged', name:'锻造 Y 辐', desc:'六组 Y 形辐条', rm:170, need:{rim:3, cf:1}, min:30, style:'forged', tier:'r', perf:{acc:.01}},
  {slot:'mrim', id:'carbon', name:'碳纤维轮圈', desc:'整只碳纤维，轻得能单手拎起来', rm:350, need:{cf:4, ti:1}, min:120, style:'turbine', col:'#2a2c31', tier:'l', perf:{acc:.03, steer:.02}}
];
const TN = {byKey:{}, bySlot:{}, stock:{}};
for (const s of TN_SLOTS){ TN.bySlot[s.id] = []; s.cls = s.cls || 'cs'; }
for (const it of TN_ITEMS){
  it.key = it.slot + '.' + it.id; it.rm = it.rm || 0; it.need = it.need || {}; it.min = it.min || 0; it.tier = it.tier || 'n';
  it.perf = Object.assign({acc:0, maxV:0, grip:0, steer:0}, it.perf || {});
  TN.byKey[it.key] = it; TN.bySlot[it.slot].push(it); if (!TN.stock[it.slot]) TN.stock[it.slot] = it.id;
}
/* only the cars the 车行 sells can be tuned */
const TN_KINDS = ['myvi', 'p911', 'mase', 'lambo', 'rr', 'gwag', 'moto'];
const tnCls = kind => TN_CLASS[kind] || 'c';
/* can this car kind fit this slot / item? (items with their own cls: 大尾翼和鹅颈只给跑车) */
const tnSlotOk = (kind, s) => (typeof s === 'string' ? TN_SLOTS.find(x => x.id === s) : s).cls.includes(tnCls(kind));
const tnItemOk = (kind, it) => tnSlotOk(kind, it.slot) && (!it.cls || it.cls.includes(tnCls(kind)));
/* a full fit: every slot gets an id; unknown or missing ones fall back to stock */
function tnFit(f){
  const o = {}; for (const s of TN_SLOTS){ const id = f && f[s.id]; o[s.id] = id && TN.byKey[s.id + '.' + id] ? id : TN.stock[s.id]; }
  return o;
}
/* what an item is worth in 总资产: coins plus the parts it used (配方不会用掉，不算进去) */
const tnWorth = it => it.rm + Object.keys(it.need).reduce((s, p) => s + (TN_PART[p] ? TN_PART[p].rm * it.need[p] : 0), 0);
/* 性能改装：开着。零件的 perf 字段按比例加在 tunedT 上（js/93-tuning-ui.js 包在 tunedT 外面） */
const TN_PERF = 1;
/* the perf of a whole fit on one car kind, as fractions: {acc:.12} = 加速 +12 % */
function tnPerfOf(kind, fit){
  const o = {acc:0, maxV:0, grip:0, steer:0}; fit = tnFit(fit);
  for (const s of TN_SLOTS){ if (!tnSlotOk(kind, s)) continue; const it = TN.byKey[s.id + '.' + fit[s.id]]; for (const k in o) o[k] += it.perf[k]; }
  return o;
}
/* 改装价值（单辆车）：这辆车现在装着的零件（每个槽一件），按「金币 + 用掉的道具估值」算。
   给「豪车展示区」按「车价 + 改装价值」排序：tuneCarValue('lambo') → RM；改装存档还没读（js/93-tuning-ui.js 没加载）时是 0。
   只算装着的，所以同一个槽买过好几档也只算一件；兰博鸡尼全部顶配约 RM 6,400，是车价的 4 倍（docs/tuning.md「价格和车价」）。
   总资产（netWorth）另算：买过的全部零件和施工中的都算，见 tnCarAssets */
function tuneCarValue(carId){
  if (typeof tune === 'undefined' || !tune.cars) return 0;
  const c = tune.cars[carId]; if (!c) return 0; let s = 0;
  const fit = tnFit(c.fit);
  for (const sl of TN_SLOTS){ if (!tnSlotOk(carId, sl)) continue; const it = TN.byKey[sl.id + '.' + fit[sl.id]]; if (it && c.own.includes(it.key)) s += tnWorth(it); }
  return s;
}
/* 总资产里的一辆车：造好的全部零件 + 正在施工的 */
function tnCarAssets(carId){
  if (typeof tune === 'undefined' || !tune.cars) return 0;
  const c = tune.cars[carId]; let s = 0;
  if (c) for (const key of c.own) if (TN.byKey[key]) s += tnWorth(TN.byKey[key]);
  for (const j of tune.jobs) if (j.kind === carId && TN.byKey[j.k]) s += tnWorth(TN.byKey[j.k]);
  return s;
}

/* ---------- 每个玩法掉什么：XParts.reward(game, grade) 按这张表发（js/93-tuning-ui.js），说明见 docs/tuning.md ----------
   grade：0 最好（金牌 / 第 1 名）、1、2、3 没名次。每档是 [道具 id, 个数, 几率（不写 = 一定给）]；
   bp_xxx 是一张配方，'bp_*' 是从这个玩法的配方池（TN_BP_POOL）里随机一张还没有的；'rim|lacq' 是二选一。
   cd = 两次掉落至少隔几秒，day = 每天最多掉几次（只有真掉了东西才算一次）：给打卡、擦车、特技、喷漆这些随手就能刷的玩法用。 */
const TN_DROPS = {
  race:    {name:'竞速', g:[[['turbo', 1], ['nos', 2], ['ti', 1, .1], ['core', 1, .08]], [['turbo', 1], ['nos', 1]], [['nos', 1]], [['lacq', 1]]]},
  ghost:   {name:'影线 1v1', g:[[['nos', 1], ['turbo', 1], ['bp_moto', 1, .25]], [], [], [['lacq', 1]]]},
  hoops:   {name:'奶娃投篮', g:[[['rim', 3], ['ecu', 1], ['ti', 1, .08]], [['rim', 2], ['lacq', 1]], [['rim', 1]], []]},
  canteen: {name:'食堂端盘子', g:[[['rim', 3], ['lacq', 2]], [['rim', 2], ['lacq', 1]], [['rim', 1]], []]},
  kipmart: {name:'KIP 大乱斗', g:[[['susp', 1], ['tyre', 1], ['bp_offroad', 1, .35]], [['susp', 1]], [['tyre', 1]], []]},
  monkey:  {name:'猴子大战', g:[[['cf', 3], ['tyre', 1], ['ti', 1, .12], ['bp_drift', 1, .3]], [['cf', 2]], [['cf', 1]], []]},
  dorm:    {name:'宿舍撤离', g:[[['neon', 1], ['cf', 1], ['susp', 1], ['ti', 1], ['bp_*', 1]], [['neon', 1], ['cf', 1], ['ti', 1, .5], ['bp_*', 1, .6]], [['neon', 1], ['susp', 1, .3]], []]},
  heist:   {name:'教学楼潜入', g:[[['ecu', 2], ['core', 1, .25], ['bp_*', 1]], [['ecu', 1], ['bp_*', 1, .5]], [['ecu', 1]], []]},
  drive:   {name:'得来速', g:[[['rim', 1], ['lacq', 1], ['nos', 1, .3], ['bp_launch', 1, .15]], [['rim', 1], ['lacq', 1]], [['rim', 1]], []]},
  tea:     {name:'蜜雪冰橙打工', g:[[['lacq', 2], ['neon', 2]], [['lacq', 1], ['neon', 1]], [['lacq', 1]], []]},
  thief:   {name:'抓小偷', g:[[['turbo', 1], ['plan', 1], ['core', 1]], [['turbo', 1]], [], []]},
  activity:{name:'挑战赛', g:[[['tyre', 1], ['cf', 1], ['lacq', 1]], [['tyre', 1], ['lacq', 1]], [['lacq', 1]], []]},
  arcade:  {name:'B1 小游戏', g:[[['turbo', 1]], [['cf', 1]], [['lacq', 1]], []]},
  klia:    {name:'KLIA 送机', day:12, g:[[['nos', 1], ['lacq', 1], ['ti', 1, .08]], [['lacq', 1], ['nos', 1, .35]], [['lacq', 1]], []]},
  bell:    {name:'大胃王争霸赛', g:[[['neon', 2], ['nos', 1], ['bp_plasma', 1, .5]], [['neon', 2]], [['neon', 1]], []]},
  /* 补充的 8 个玩法 */
  hole:    {name:'黑洞模式', g:[[['cf', 2], ['ti', 1, .12], ['core', 1, .04]], [['cf', 1], ['ti', 1, .05]], [['cf', 1, .5]], []]},
  swing:   {name:'秋千飞跃', cd:120, day:6, g:[[['cf', 1], ['bp_swan', 1, .08]], [['cf', 1, .5]], [['lacq', 1]], []]},
  taxi:    {name:'顺风车', day:20, g:[[['neon', 1], ['lacq', 1]], [['neon', 1]], [['lacq', 1]], []]},
  escape:  {name:'甩掉保安', cd:180, day:10, g:[[['nos', 2], ['core', 1, .05]], [['nos', 1]], [['nos', 1, .4]], []]},
  spray:   {name:'喷漆车间', cd:300, day:3, g:[[['lacq', 1]], [], [], []]},
  stunt:   {name:'特技连击', cd:90, day:8, g:[[['lacq', 1], ['tyre', 1, .5], ['nos', 1, .3]], [['lacq', 1], ['tyre', 1, .15]], [['lacq', 1]], []]},
  nearmiss:{name:'惊险擦车', cd:90, day:6, g:[[['lacq', 1]], [], [], []]},
  checkin: {name:'每日打卡', day:1, g:[[['rim|lacq', 1]], [], [], []]},
  /* 当面挑战（js/96-social.js）：0 = 赢，1 = 对方认输或中途跑了，2 = 平局，3 = 输了。同一个对手每天最多 3 次有奖（js/96-social.js 里数），全部对手加起来每天 10 次 */
  duel:    {name:'当面挑战', day:10, g:[[['turbo', 1], ['nos', 1], ['cf', 1, .4], ['ti', 1, .05]], [['nos', 1], ['lacq', 1]], [['lacq', 1]], []]}
};
const TN_BP_POOL = {
  dorm:['bp_wide', 'bp_swan', 'bp_plasma', 'bp_drift'],
  heist:['bp_twin', 'bp_launch', 'bp_offroad', 'bp_moto']
};
/* online look: 'tk' + one base-36 char per slot (index of the item in its slot); [a-z0-9] only, fits the /looks rule */
function tnToken(fit){
  fit = tnFit(fit); let s = 'tk', any = false;
  for (const sl of TN_SLOTS){ const i = Math.max(0, TN.bySlot[sl.id].findIndex(it => it.id === fit[sl.id])); if (i) any = true; s += i.toString(36); }
  return any ? s : '';
}
function tnFromToken(str){
  const t = String(str || '').split(',').find(x => /^tk[0-9a-z]+$/.test(x)); if (!t) return null;
  const o = {}; TN_SLOTS.forEach((sl, i) => { const it = TN.bySlot[sl.id][parseInt(t[2 + i] || '0', 36)]; if (it) o[sl.id] = it.id; });
  return tnFit(o);
}

/* ---------- materials (shared, never disposed by the online ghosts) ---------- */
const tnCarbonTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  /* 2x2 twill: tows of 8 px, alternating direction, each with a soft highlight */
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
    const along = ((x + y) >> 1) % 2 === 0, gr = along ? g.createLinearGradient(x * 8, 0, x * 8 + 8, 0) : g.createLinearGradient(0, y * 8, 0, y * 8 + 8);
    gr.addColorStop(0, '#1a1c20'); gr.addColorStop(.5, along ? '#4a4f58' : '#363a42'); gr.addColorStop(1, '#16181b');
    g.fillStyle = gr; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; t.keep = true; return t;
})();
const tnNeonTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), im = g.createImageData(128, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++){
    const dx = Math.max(0, Math.abs(x - 63.5) - 36) / 28, dy = Math.max(0, Math.abs(y - 31.5) - 10) / 22, d = Math.min(1, Math.hypot(dx, dy)), k = (y * 128 + x) * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.pow(1 - d, 1.8) * (d < .02 ? .8 : 1));
  }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.keep = true; return t;
})();
const TN_MAT = {
  black:M('#141518', {roughness:.22, metalness:.35}),
  carbon:new THREE.MeshStandardMaterial({map:tnCarbonTex, roughness:.3, metalness:.35}),
  chrome:CAR_MAT.chrome,
  ti:M('#8d86cc', {roughness:.22, metalness:.85}),
  dark:M('#0d0e10', {roughness:.6}),
  drl:new THREE.MeshBasicMaterial({color:'#eef6ff'}),
  red:M('#c8302a', {roughness:.4, metalness:.2})
};
for (const k in TN_MAT) TN_MAT[k].keep = true;
const tnNeonMats = {};
/* per neon colour: the tubes, the glow on the ground (opacity follows day / night, js/93-tuning-ui.js), the glowing rim ring */
function tnNeonMat(col){
  if (tnNeonMats[col]) return tnNeonMats[col];
  const tube = new THREE.MeshBasicMaterial({color:col}), pool = new THREE.MeshBasicMaterial({map:tnNeonTex, color:col, transparent:true, opacity:.5, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
    polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48});
  tube.keep = pool.keep = true;
  return tnNeonMats[col] = {tube, pool};
}

/* ---------- where things go on each car: sampled once from the car's own body shell ---------- */
const tnAnc = {};
function tnAnchors(kind){
  if (tnAnc[kind]) return tnAnc[kind];
  /* the shells are extruded profiles with big flat faces (few vertices), so probe them with rays instead of reading vertices */
  const T = CAR_T[kind], geo = carParts(kind, T).paint, p = geo.attributes.position;
  let zf = -1e9, zr = 1e9;
  /* the ends of the body at bumper height: the 越野车's spare wheel cover (also paint) hangs further back, and the exhausts,
     diffuser and under-glow hung off it floated in the air behind the car */
  for (let i = 0; i < p.count; i++){ if (p.getY(i) > T.r * 1.6) continue; const z = p.getZ(i); if (z > zf) zf = z; if (z < zr) zr = z; }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({side:THREE.DoubleSide})); mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
  const hit = () => { rc.set(o, d); const h = rc.intersectObject(mesh, false); return h.length ? h[0].point : null; };
  const topY = (z, x) => { o.set(x || 0, 6, z); d.set(0, -1, 0); const h = hit(); return h ? h.y : T.H * .6; };
  const botY = (z, x) => { o.set(x || 0, -2, z); d.set(0, 1, 0); const h = hit(); return h ? h.y : .25; };
  /* the outermost point of the nose (s = 1) or tail (s = -1) at (x, y) */
  const endZ = (x, y, s) => { o.set(x, y, s * 20); d.set(0, 0, -s); const h = hit(); return h ? h.z : s > 0 ? zf - .05 : zr + .05; };
  /* the flat part of the roof (越野车's roof rack): where the top is within 15 cm of the highest point */
  let roofY = 0, ra = 0, rb = 0; for (let z = zr; z <= zf; z += .1) roofY = Math.max(roofY, topY(z));
  for (let z = zr; z <= zf; z += .1) if (topY(z) > roofY - .15){ if (!rb) rb = z; ra = z; }
  return tnAnc[kind] = {T, zf, zr, ybF:botY(zf - .2), ybR:botY(zr + .2), ybM:botY(0, T.W / 2 - .12), noseTop:topY(zf - .08), deck:topY(zr + .3),
    hoodA:topY(zf - .95), hoodB:topY(zf - .55), endZ, roofY, roofF:ra, roofR:rb};
}
/* planar texture coordinates from the dominant normal, so the carbon weave shows on any shape */
function tnUV(g, k){
  const p = g.attributes.position, nm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++){
    const ax = Math.abs(nm.getX(i)), ay = Math.abs(nm.getY(i)), az = Math.abs(nm.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/* ---------- wheels: tyre + rim in one vertex-coloured geometry, like carWheelGeo in js/40-vehicles.js ---------- */
const tnWheelCache = {};
/* knob: 越野胎 1 全地形 / 2 泥地胎, a wider tyre with tread blocks round the outside */
function tnWheelGeo(r, style, col, lp, knob){
  knob = knob || 0;
  if (style === 'stock' && col === TN.byKey['rimc.stock'].col && lp === .66 && !knob) return carWheelGeo(r);
  const key = [r.toFixed(3), style, col, lp, knob].join('|');
  if (tnWheelCache[key]) return tnWheelCache[key];
  const h = Math.max(.12, Math.min(.17, r * .4)) * (1 + .16 * knob), a = lp * r, b = a + (r - a) * .7, dd = style === 'dish' ? .1 : style === 'forged' ? .03 : .045;
  const pr = [[0, -h], [a, -h], [b, -h], [r, -h + .04], [r, h - .04], [b, h], [a + .015, h],
    [a, h - .012], [a * .95, h - .022], [a * .9, h - dd], [a * .34, h - dd - .012], [a * .18, h - .03], [0, h - .03]];
  const lg = new THREE.LatheGeometry(pr.map(([x, y]) => new THREE.Vector2(x, y)), 20), n = lg.attributes.position.count, cl = new Float32Array(n * 3);
  const rimC = new THREE.Color(col), lipC = style === 'dish' ? new THREE.Color('#e9ecef') : rimC, hubC = rimC.clone().multiplyScalar(.7), tyre = new THREE.Color('#1b1b1d');
  for (let i = 0; i < n; i++){ const j = i % pr.length, c = j < 7 ? tyre : j < 9 ? lipC : j < 11 ? rimC : hubC; cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b; }
  lg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  const parts = [lg], yf = h - dd - .006;
  /* one spoke on the rim face: from radius r0 to r1, w wide, twisted by tw (turbine blades), at angle ang */
  const spoke = (ang, r0, r1, w, t, tw, c) => parts.push(geoTint(geoAt(new THREE.BoxGeometry(w, t, r1 - r0), 0, yf, (r0 + r1) / 2, 0, 0, tw || 0).rotateY(ang), c || col));
  if (style === 'mesh') for (let k = 0; k < 14; k++) spoke(k * Math.PI * 2 / 14, a * .2, a * .93, .022, .026);
  else if (style === 'dish') for (let k = 0; k < 5; k++) spoke(k * Math.PI * 2 / 5, a * .2, a * .9, .085, .03);
  else if (style === 'forged') for (let k = 0; k < 6; k++){
    const A = k * Math.PI / 3; spoke(A, a * .18, a * .58, .05, .032);
    for (const s of [-1, 1]) parts.push(geoTint(geoAt(new THREE.BoxGeometry(.034, .03, a * .42), s * a * .05, yf, a * .74, 0, s * .2, 0).rotateY(A), col));
  }
  else if (style === 'turbine') for (let k = 0; k < 12; k++) spoke(k * Math.PI / 6, a * .24, a * .92, .1, .012, .75);
  else for (let k = 0; k < 5; k++) spoke(k * Math.PI * 2 / 5, a * .2, a * .9, .055, .03);   /* glow: plain five-spoke, the ring does the talking */
  if (knob){
    /* tread blocks, staggered left / right like a mud tyre */
    const N = 18, bh = .03 + .015 * knob;
    for (let k = 0; k < N; k++) for (const s of [-1, 1])
      parts.push(geoTint(geoAt(new THREE.BoxGeometry(bh, h * .78, .1 + .02 * knob), r + bh * .3, s * h * .42 + (k % 2 ? .03 : -.03), 0).rotateY((k + (s > 0 ? .5 : 0)) * Math.PI * 2 / N), '#1b1b1d'));
  }
  const g = geoMerge(parts); g.rotateZ(-Math.PI / 2); g.keep = true;
  return tnWheelCache[key] = g;
}
const tnRingGeo = {};
function tnRing(r, lp){
  const key = r.toFixed(3) + '|' + lp; if (tnRingGeo[key]) return tnRingGeo[key];
  const h = Math.max(.12, Math.min(.17, r * .4)), g = new THREE.TorusGeometry(lp * r * .965, .017, 6, 36).rotateY(Math.PI / 2).translate(h - .02, 0, 0); g.keep = true;
  return tnRingGeo[key] = g;
}

/* ---------- body parts, per car kind and combination (cached) ---------- */
const tnBodyCache = {};
function tnBody(kind, fit){
  const key = kind + '|' + ['wide', 'lip', 'skirt', 'diff', 'hood', 'wing', 'drl', 'exh', 'size', 'rack', 'winch'].map(s => fit[s]).join(',');
  if (tnBodyCache[key]) return tnBodyCache[key];
  const A = tnAnchors(kind), T = A.T, W = T.W, W2 = W / 2, wide = fit.wide === 'wide', P = {aero:[], black:[], metal:[], drl:[], red:[]}, tips = [];
  const put = (k, g) => { P[k].push(g); return g; };
  const box = (k, w, h, d, x, y, z, rx, ry, rz) => put(k, geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz));
  const rbx = (k, w, h, d, r, x, y, z, rx, ry, rz) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx, ry, rz));
  const sym = f => { f(-1); f(1); };
  /* 宽体：bolted-on arches over every wheel, extruded outward from the body side */
  if (wide){
    const sz = TN.byKey['size.' + fit.size].s, ri = T.r * sz + .1, ro = ri + .11;
    for (const zc of [-T.wb / 2, T.wb / 2]) sym(s => {
      const sh = new THREE.Shape(), a0 = .08, a1 = Math.PI - .08;
      for (let i = 0; i <= 14; i++){ const t = a0 + (a1 - a0) * i / 14; sh[i ? 'lineTo' : 'moveTo'](Math.cos(t) * ro, Math.sin(t) * ro); }
      for (let i = 14; i >= 0; i--){ const t = a0 + (a1 - a0) * i / 14; sh.lineTo(Math.cos(t) * ri, Math.sin(t) * ri); }
      const g = new THREE.ExtrudeGeometry(sh, {depth:.24, bevelEnabled:true, bevelThickness:.02, bevelSize:.02, bevelSegments:1, curveSegments:4});
      g.rotateY(-Math.PI / 2); g.translate(s > 0 ? W2 + .14 : -(W2 - .1), T.r, zc);
      put('aero', g);
      /* a strip of exposed bolts along the arch */
      for (let i = 1; i < 8; i++){ const t = a0 + (a1 - a0) * i / 8; box('black', .02, .025, .025, s * (W2 + .165), T.r + Math.sin(t) * (ri + ro) / 2, zc + Math.cos(t) * (ri + ro) / 2); }
    });
  }
  /* 前铲 (+ 风刀) */
  if (fit.lip !== 'none'){
    const y = A.ybF - .012, w = W * .9 + (wide ? .2 : 0), zb = A.endZ(0, A.ybF + .05, 1);   /* the nose is often rounded: hang it under the bumper, not the bonnet tip */
    rbx('aero', w, .032, .3, .014, 0, y, zb - .1);
    rbx('black', w * .9, .05, .05, .015, 0, y + .035, zb - .22);
    if (fit.lip === 'canard') sym(s => { for (const k of [0, 1]){ const y = A.ybF + .09 + k * .09, x = s * (W2 - .05 + (wide ? .06 : 0)); rbx('aero', .025, .028, .17, .01, x, y, A.endZ(x, y, 1) - .09, 0, -s * .22, s * .2); } });
  }
  /* 侧裙 */
  if (fit.skirt !== 'none'){
    const L = T.wb - 2 * (T.r + .14), x = W2 + (wide ? .13 : .03);
    sym(s => { rbx('aero', .07, .11, L, .02, s * x, A.ybM + .03, 0); rbx('aero', .16, .025, L, .01, s * (x - .03), A.ybM - .02, 0); });
  }
  /* 扩散器 */
  if (fit.diff !== 'none'){
    const y = A.ybR + .01, z = A.endZ(0, A.ybR + .05, -1) + .2;
    box('black', W * .74, .03, .48, 0, y, z, -.16);
    for (let i = 0; i < 5; i++) box('aero', .02, .13, .44, (i - 2) * W * .15, y + .05, z - .02, -.16);
  }
  /* 引擎盖：follow the slope of the bonnet */
  if (fit.hood !== 'stock'){
    const z = A.zf - .75, y = (A.hoodA + A.hoodB) / 2, rx = Math.atan2(A.hoodA - A.hoodB, .4);
    if (fit.hood === 'vents') sym(s => {
      rbx('aero', .3, .06, .38, .025, s * .3, y + .02, z, rx);
      for (let i = 0; i < 4; i++) box('black', .24, .012, .03, s * .3, y + .055, z - .12 + i * .08, rx);
    });
    else { rbx('aero', .52, .13, .62, .05, 0, y + .05, z - .05, rx); rbx('black', .4, .07, .03, .02, 0, y + .07, z + .25, rx); }
  }
  /* 尾翼 */
  if (fit.wing !== 'none'){
    const roof = A.deck > T.H * .85, d = A.deck, z = A.zr + (roof ? .32 : .3);
    if (fit.wing === 'duck'){
      const sh = new THREE.Shape([new THREE.Vector2(.2, 0), new THREE.Vector2(-.05, 0), new THREE.Vector2(-.11, .1), new THREE.Vector2(.2, .015)]);
      const g = new THREE.ExtrudeGeometry(sh, {depth:W * .82, bevelEnabled:false}); g.rotateY(-Math.PI / 2); g.translate(W * .41, d - .01, A.zr + .2); put('aero', g);
    } else {
      const swan = fit.wing === 'swan', hh = (swan ? .44 : .34) * (roof ? .5 : 1), ww = W * (swan ? 1.04 : .96) + (wide ? .2 : 0), y = d + hh;
      rbx('aero', ww, .045, .32, .018, 0, y, z, .12);
      const ep = roof ? .55 : 1;   /* a roof spoiler on a hatchback gets small end plates */
      sym(s => rbx('aero', .022, .22 * ep, .4 * ep, .01, s * ww / 2, y + .02 * ep, z, 0));
      if (swan){
        rbx('aero', ww * .97, .03, .16, .012, 0, y + .085, z - .15, .45);
        sym(s => { put('aero', rodGeo(.022, .022, [s * W * .26, d, z + .18], [s * W * .26, y + .1, z + .02], 6)); put('aero', rodGeo(.022, .022, [s * W * .26, y + .1, z + .02], [s * W * .26, y + .03, z - .06], 6)); });
      } else sym(s => box('aero', .04, hh, .14, s * W * .28, d + hh / 2, z + .03));
    }
  }
  /* 日行灯：thin light tubes laid on the nose */
  if (fit.drl !== 'none'){
    const y = A.ybF + (A.noseTop - A.ybF) * .58, at = (x, yy) => [x, yy, A.endZ(x, yy, 1) + .012];
    const line = pts => { for (let i = 0; i + 1 < pts.length; i++) put('drl', rodGeo(.014, .014, pts[i], pts[i + 1], 5)); };
    if (fit.drl === 'bar'){ const pts = []; for (let i = 0; i <= 12; i++) pts.push(at(-W * .38 + W * .76 * i / 12, y)); line(pts); }
    else if (fit.drl === 'fang') sym(s => line([at(s * W * .2, y), at(s * W * .3, y), at(s * W * .4, y), at(s * W * .43, y - .07), at(s * W * .41, y - .14)]));
    else sym(s => { for (const x of [.28, .38]){ const [px, py, pz] = at(s * W * x, y); box('drl', .07, .045, .02, px, py, pz); } });
  }
  /* 排气 */
  if (fit.exh !== 'stock'){
    const it = TN.byKey['exh.' + fit.exh], xs = it.n === 4 ? [.24, .34] : [.3], y = A.ybR + .1;
    sym(s => xs.forEach(x => {
      const px = s * W * x, z = A.endZ(px, y, -1);
      put('metal', geoAt(new THREE.CylinderGeometry(.058, .052, .22, 14, 1, true), px, y, z, Math.PI / 2));
      put('metal', geoAt(new THREE.TorusGeometry(.055, .008, 5, 14), px, y, z - .11));
      box('black', .08, .08, .01, px, y, z - .07);
      tips.push([px, y, z - .12]);
    }));
  }
  /* 越野车：车顶行李架（+ 灯排） */
  if (fit.rack !== 'none'){
    const y = A.roofY + .07, z0 = A.roofR + .08, z1 = A.roofF - .08, L = z1 - z0, zc = (z0 + z1) / 2, w = W * .82;
    sym(s => { put('black', rodGeo(.022, .022, [s * w / 2, y + .1, z0], [s * w / 2, y + .1, z1], 6)); for (const z of [z0 + .1, z1 - .1]) box('black', .05, .1, .05, s * w / 2, y + .03, z); });
    for (const z of [z0, z1]) put('black', rodGeo(.022, .022, [-w / 2, y + .1, z], [w / 2, y + .1, z], 6));
    for (let i = 0; i <= 6; i++) box('black', w, .025, .04, 0, y, z0 + L * i / 6);
    box('black', .03, .025, L, 0, y, zc);
    if (fit.rack === 'lights'){
      box('black', w * .86, .1, .08, 0, y + .17, z1 + .02);
      for (let i = 0; i < 6; i++) box('drl', .1, .06, .02, -w * .36 + w * .72 * i / 5, y + .17, z1 + .065);
    }
  }
  /* 越野车：前防撞杠（+ 绞盘） */
  if (fit.winch !== 'none'){
    const yb = A.ybF + .05, z = A.endZ(0, yb + .15, 1) + .06, w = W * .86, tube = (a, b) => put('black', rodGeo(.035, .035, a, b, 8));
    tube([-w / 2, yb + .34, z + .08], [w / 2, yb + .34, z + .08]); tube([-w / 2, yb + .06, z + .04], [w / 2, yb + .06, z + .04]);
    sym(s => { tube([s * w / 2, yb + .06, z + .04], [s * w / 2, yb + .34, z + .08]); tube([s * w * .22, yb + .06, z + .04], [s * w * .22, yb + .48, z + .14]); });
    tube([-w * .22, yb + .48, z + .14], [w * .22, yb + .48, z + .14]);
    if (fit.winch === 'winch'){
      box('black', w * .4, .16, .16, 0, yb + .2, z + .06);
      put('metal', geoAt(new THREE.CylinderGeometry(.065, .065, w * .3, 12), 0, yb + .2, z + .14, 0, 0, Math.PI / 2));
      box('red', .06, .1, .04, 0, yb + .12, z + .25); box('red', .1, .025, .05, 0, yb + .08, z + .26);
    }
  }
  const out = {tips};
  for (const k in P) if (P[k].length){ const g = geoMergeUV(P[k].map(g => tnUV(g.index ? g.toNonIndexed() : g, 7))); g.keep = true; out[k] = g; }
  return tnBodyCache[key] = out;
}

let tnNeonGeo = {};
function tnNeonParts(kind){
  if (tnNeonGeo[kind]) return tnNeonGeo[kind];
  const A = tnAnchors(kind), T = A.T, W2 = T.W / 2, tubes = [];
  for (const s of [-1, 1]) tubes.push(geoAt(new THREE.CylinderGeometry(.02, .02, T.L * .62, 6), s * (W2 - .2), A.ybM - .015, 0, Math.PI / 2));
  for (const z of [A.zf - .45, A.zr + .45]) tubes.push(geoAt(new THREE.CylinderGeometry(.02, .02, T.W * .62, 6), 0, Math.min(A.ybF, A.ybR) - .01, z, 0, 0, Math.PI / 2));
  const tube = geoMerge(tubes), pool = new THREE.PlaneGeometry(T.L * 1.35, T.W * 2.1).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  /* the canvas is wide, the car is long: turned a quarter so the long side of the glow runs along the car */
  tube.keep = pool.keep = true;
  return tnNeonGeo[kind] = {tube, pool};
}

/* ---------- 摩托车的改装件：坐标对着 js/40-vehicles.js 里 moto 的模型（前轴 z = +0.71，后轴 z = -0.71） ---------- */
const tnMotoCache = {};
const TN_MOTO_TIPS = {stock:[[.15, .38, -.5]], high:[[-.09, .9, -.86], [.09, .9, -.86]], ti:[[.21, .58, -.86]]};
function tnMoto(fit){
  const key = fit.mexh + ',' + fit.fair; if (tnMotoCache[key]) return tnMotoCache[key];
  const P = {aero:[], black:[], metal:[], ti:[], glass:[], head:[]};
  const put = (k, g) => { P[k].push(g); return g; };
  const rbx = (k, w, h, d, r, x, y, z, rx, ry, rz) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx, ry, rz));
  const cyl = (k, r0, r1, len, x, y, z, rx, ry, rz) => put(k, geoAt(new THREE.CylinderGeometry(r0, r1, len, 14), x, y, z, rx, ry, rz));
  if (fit.mexh === 'high'){
    for (const s of [-1, 1]){
      put('metal', rodGeo(.03, .03, [s * .05, .42, .05], [s * .09, .8, -.5], 6));
      cyl('metal', .05, .045, .36, s * .09, .86, -.68, Math.PI / 2 - .35);
      cyl('black', .03, .03, .02, s * .09, .9, -.86, Math.PI / 2 - .35);
    }
  } else if (fit.mexh === 'ti'){
    put('ti', rodGeo(.034, .034, [.08, .36, .2], [.19, .45, -.25], 6));
    cyl('ti', .075, .07, .52, .21, .55, -.6, Math.PI / 2 - .25);
    cyl('black', .078, .078, .05, .21, .58, -.86, Math.PI / 2 - .25);
  }
  if (fit.fair === 'naked'){
    /* the cowl is gone (hidden in tnApply): a round lamp and a short fly screen on the forks */
    put('head', geoAt(new THREE.CylinderGeometry(.09, .09, .06, 16), 0, .9, .78, Math.PI / 2));
    put('black', geoAt(new THREE.CylinderGeometry(.11, .11, .1, 16, 1, true), 0, .9, .74, Math.PI / 2));
  } else if (fit.fair === 'wing'){
    for (const s of [-1, 1]) for (const k of [0, 1]) rbx('aero', .16, .015, .12, .006, s * (.23 + k * .02), .74 + k * .08, .62 - k * .05, 0, 0, s * .18);
  } else if (fit.fair === 'race'){
    rbx('glass', .34, .3, .025, .01, 0, 1.17, .74, -1.05);                 /* tall bubble screen */
    for (const s of [-1, 1]) rbx('aero', .05, .4, .7, .02, s * .21, .62, .32, 0, s * .05);
    rbx('aero', .32, .12, .62, .04, 0, .33, .18);                           /* carbon belly pan */
    rbx('aero', .24, .1, .3, .03, 0, 1.06, -.78, .35);                       /* seat cowl hump */
    for (const s of [-1, 1]) rbx('aero', .14, .014, .1, .006, s * .25, .78, .6, 0, 0, s * .2);
  }
  const sc = p => p.map(v => v * MOTO_S), out = {tips:(TN_MOTO_TIPS[fit.mexh] || TN_MOTO_TIPS.stock).map(sc), tail:[sc([0, .98, -.86])]};
  for (const k in P) if (P[k].length){ const g = geoMergeUV(P[k].map(g => tnUV(g.index ? g.toNonIndexed() : g, 7))); g.scale(MOTO_S, MOTO_S, MOTO_S); g.keep = true; out[k] = g; }
  return tnMotoCache[key] = out;
}

/* ---------- put a fit on a car (personal car, the showroom car, or an online ghost) ---------- */
function tnApply(c, fit){
  if (!c || !TN_KINDS.includes(c.kind)) return;
  fit = tnFit(fit);
  /* slots this kind of car cannot take stay stock (an old save, someone else's look string) */
  for (const s of TN_SLOTS) if (!tnSlotOk(c.kind, s)) fit[s.id] = TN.stock[s.id];
  const cls = tnCls(c.kind), key = TN_SLOTS.map(s => fit[s.id]).join(',') + '|' + (fit.aero === 'body' || cls === 'm' ? c.paint.uuid : '');
  if (c.tn && c.tn.key === key) return;
  const T = CAR_T[c.kind], it = s => TN.byKey[s + '.' + fit[s]];
  if (c.tn){
    for (const m of c.tn.meshes){ m.parent && m.parent.remove(m); const i = c.fine.indexOf(m); if (i >= 0) c.fine.splice(i, 1); }
  }
  const meshes = [], add = (parent, geo, mat, fine) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; parent.add(m); meshes.push(m); if (fine !== false){ c.fine.push(m); m.visible = c.fineOn !== false; } return m; };
  const neonCol = it('neonc').col;
  if (cls === 'm'){
    /* motorbike: wheels stay on the centre line, the cowl can come off, its own exhausts and fairings */
    const mr = it('mrim'), wg = tnWheelGeo(T.r, mr.style || 'stock', mr.col || it('rimc').col, .66, 0);
    for (const w of c.wheels) w.geometry = wg;
    for (const m of c.body.children) if (m.userData.fair) m.visible = fit.fair !== 'naked';
    const B = tnMoto(fit);
    if (B.aero) add(c.body, B.aero, TN_MAT.carbon, false);
    if (B.black) add(c.body, B.black, TN_MAT.black);
    if (B.metal) add(c.body, B.metal, TN_MAT.chrome);
    if (B.ti) add(c.body, B.ti, TN_MAT.ti);
    if (B.glass) add(c.body, B.glass, CAR_MAT.glass);
    if (B.head) add(c.body, B.head, CAR_MAT.head);
    c.tn = {key, fit, meshes, cls, tips:fit.mexh === 'stock' ? [] : B.tips, rear:B.tips, tail:B.tail, pool:null, exh:fit.mexh === 'ti' ? 'quad' : fit.mexh === 'high' ? 'dual' : 'stock'};
    return;
  }
  /* stance: lower the body, keep the wheels on the ground, push them out under the arches, tilt them in at the top.
     越野车 instead: bigger tyres lift the body by the extra radius, a lift kit raises it further and the wheels hang lower */
  const suv = cls === 'u', sz = suv ? {s:it('otyre').s, lp:.66} : it('size'), knob = suv ? it('otyre').knob : 0;
  const r = T.r * sz.s, cam = suv ? 0 : it('camber').deg * Math.PI / 180, out = fit.wide === 'wide' ? .12 : knob * .05;
  /* big wheels leave less room in the arch: lower only as far as the tyre still (just about) fits */
  const drop = suv ? 0 : Math.max(0, Math.min(it('low').drop, Math.max(.025, 2 * T.r + (out ? .17 : .1) - 2 * r)));
  const lift = suv ? (r - T.r) + it('lift').lift : -drop;
  c.body.position.y = lift;
  const wg = tnWheelGeo(r, it('rim').style || 'stock', it('rimc').col, sz.lp, knob);
  for (const w of c.wheels){
    const piv = w.parent, sx = Math.sign(piv.position.x) || 1;
    w.geometry = wg; piv.position.x = sx * (T.W / 2 - .08 + out); piv.position.y = r - lift; piv.rotation.z = sx * cam;
    if (fit.rim === 'glow') add(w, tnRing(r, sz.lp), tnNeonMat(neonCol).tube);
  }
  for (const m of c.body.children) if (m.userData.stockWing) m.visible = fit.wing === 'none';   /* the 兰博's own wing makes way for a tuned one */
  const B = tnBody(c.kind, fit), aero = fit.aero === 'carbon' ? TN_MAT.carbon : fit.aero === 'black' ? TN_MAT.black : c.paint;
  if (B.aero) add(c.body, B.aero, aero, false);
  if (B.black) add(c.body, B.black, TN_MAT.black);
  if (B.metal) add(c.body, B.metal, TN.byKey['exh.' + fit.exh].ti ? TN_MAT.ti : TN_MAT.chrome);
  if (B.drl) add(c.body, B.drl, TN_MAT.drl);
  if (B.red) add(c.body, B.red, TN_MAT.red);
  let pool = null;
  if (fit.neon === 'kit'){
    const N = tnNeonParts(c.kind), nm = tnNeonMat(neonCol);
    add(c.body, N.tube, nm.tube);
    pool = add(c.root, N.pool, nm.pool); pool.position.y = .06; pool.renderOrder = 2;
  }
  const A = tnAnchors(c.kind), ty = A.ybR + (A.deck - A.ybR) * .55;
  c.tn = {key, fit, meshes, cls, tips:B.tips, pool, exh:fit.exh, tail:[[-T.W * .36, ty, A.zr + .02], [T.W * .36, ty, A.zr + .02]],
    rear:B.tips.length ? B.tips : [[-T.W * .3, A.ybR + .1, A.zr - .02], [T.W * .3, A.ybR + .1, A.zr - .02]]};
}
/* the stock look again (used when a ghost changes car or the save is wiped) */
const tnStrip = c => tnApply(c, null);
