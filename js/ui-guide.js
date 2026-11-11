/* XMUM 校园漫游 · 游戏指南（P）和大地图（M）
 *
 * 游戏指南：电脑按 P，手机点暂停面板或标题页的「指南」。一页一个主题，像图画书一样翻：‹ › 按钮、← → 键、手机左右滑；P 或 Esc 关。
 *   内容照代码里的真实玩法写（送外卖 js/50-missions.js、警戒 js/80-gta.js、喷漆车间 js/88-wardrobe-ui.js、改装 js/42-tuning.js……）。
 *   「零件和配方去哪儿拿」那页直接读 js/42-tuning.js 的 TN_PARTS / TN_BPS 的 from，改了掉落表这里自动跟着变。
 * 大地图：电脑按 M，手机点右上角的小地图。拖动平移，滚轮 / 双指 / ＋ − 缩放，「回到我」重新跟着你；M 或 Esc 关。
 *   画法就是小地图那个函数（js/90-main.js drawMini 的第四个参数），外卖、喷漆车间、宿舍这些点和小地图一模一样，还写上楼名。
 *   在教学楼、宿舍里面显示那层楼的平面图（放大的小地图）；B1 游戏厅里没有地图。
 * 两个都是 <dialog>：打开时游戏暂停（js/90-main.js 的 uiHold，开车模式另外 gx.paused），关掉恢复；
 *   其他文件的按键处理看到 dialog[open] 都不动，这里在 window 捕获阶段先拿走按键，打开时游戏收不到任何键。
 *   所以这个文件要排在 js/88-wardrobe-ui.js 前面加载：衣橱、改装车间、校外面板的捕获监听会吞掉 Esc，必须让这里先拿到。
 *   用到的别的文件的东西（gx、mode、keys、mini、drawMini…）都是打开时才读。
 * 第一次进入游戏轻提示一次「按 P 看游戏指南」（localStorage 'xmum-guide-tip'）。
 * 对外：window.XGuide = {open(page), close(), map(), closeMap(), get on()} */
'use strict';
(function(){
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  const typing = t => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

  /* ---------- pause while a sheet is open ---------- */
  let holdN = 0, holdWas = false, holdMode = '';
  function hold(on){
    if (on){
      if (holdN++) return;
      holdMode = mode; holdWas = gx.paused; uiHold = true;
      if (mode === 'naiwa'){ gx.paused = true; g(() => engineUpdate(0, 0, false)); }
      for (const k in keys) keys[k] = false;
      g(() => XRadio.open(false));
    } else if (holdN > 0 && !--holdN){
      uiHold = false;
      if (holdMode === 'naiwa' && mode === 'naiwa') gx.paused = holdWas;
      g(() => canvas.focus({preventScroll:true}));
    }
  }
  /* each sheet holds once; released right when it closes (not on the async 'close' event, which can come after the next key) */
  const held = {};
  function grab(k){ if (!held[k]){ held[k] = true; hold(true); } }
  function release(k){ if (held[k]){ held[k] = false; hold(false); } }
  /* a mini-game in the B1 arcade runs from gx.frame even while paused: put it on its own pause first (js/91-arcade.js) */
  function pauseArcade(){ g(() => { if (ARC.in && arcPlaying()) mgPause(true); }); }

  /* ---------- little pictures (inline SVG, theme colours) ---------- */
  const ART = {
    hello:`<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="0" y="92" width="240" height="28" fill="#74a955" opacity=".55"/><path d="M16 92 C60 84 90 86 130 92" stroke="#e6dcc8" stroke-width="6" fill="none"/>
      <path d="M24 60 C40 52 52 38 62 30 C72 38 84 52 100 60 L94 64 H30 Z" fill="var(--tile)"/><rect x="34" y="64" width="56" height="28" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><path d="M56 92 V76 H68 V92" fill="none" stroke="var(--ink)" stroke-width="2"/>
      <ellipse cx="140" cy="78" rx="15" ry="17" fill="#f4d9b8" stroke="var(--ink)" stroke-width="2"/><ellipse cx="140" cy="84" rx="9" ry="8" fill="#fff6e6"/><circle cx="134" cy="72" r="2" fill="var(--ink)"/><circle cx="146" cy="72" r="2" fill="var(--ink)"/><path d="M136 79 Q140 82 144 79" stroke="var(--ink)" stroke-width="1.6" fill="none"/>
      <g fill="var(--gold)" stroke="var(--ink)" stroke-width="1.5"><ellipse cx="186" cy="88" rx="13" ry="4.5"/><ellipse cx="186" cy="82" rx="13" ry="4.5"/><ellipse cx="186" cy="76" rx="13" ry="4.5"/><ellipse cx="212" cy="88" rx="13" ry="4.5"/><ellipse cx="212" cy="82" rx="13" ry="4.5"/></g>
      <path d="M170 52 L186 40 L198 46 L222 22" stroke="var(--ok)" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M212 20 H223 V31" stroke="var(--ok)" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    earn:`<svg viewBox="0 0 240 120" aria-hidden="true"><ellipse cx="70" cy="96" rx="44" ry="12" fill="none" stroke="#ff8a3d" stroke-width="4" opacity=".8"/><rect x="58" y="22" width="24" height="74" fill="#ff8a3d" opacity=".18"/>
      <rect x="50" y="58" width="40" height="32" rx="4" fill="#ff8a3d" stroke="var(--ink)" stroke-width="2"/><path d="M60 58 V50 a10 10 0 0 1 20 0 V58" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M58 72 H82" stroke="#fff" stroke-width="3"/>
      <path d="M104 74 H140" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="5 5"/><path d="M136 68 L146 74 L136 80" fill="none" stroke="var(--muted)" stroke-width="2.5"/>
      <circle cx="180" cy="66" r="24" fill="var(--gold)" stroke="var(--ink)" stroke-width="2"/><text x="180" y="73" text-anchor="middle" font-size="19" font-weight="900" fill="var(--card-bg)" font-family="Arial,sans-serif">RM</text>
      <g fill="var(--gold)"><path d="M214 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/><path d="M146 28 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g></svg>`,
    rich:`<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="40" y="56" width="50" height="50" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/><rect x="95" y="34" width="50" height="72" fill="var(--tile-soft)" stroke="var(--ink)" stroke-width="2"/><rect x="150" y="70" width="50" height="36" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/>
      <g font-family="var(--display)" font-weight="900" text-anchor="middle" fill="var(--ink)"><text x="65" y="88" font-size="22">2</text><text x="120" y="80" font-size="28" fill="var(--tile)">1</text><text x="175" y="96" font-size="20">3</text></g>
      <path d="M106 8 h28 v8 a14 14 0 0 1 -28 0z" fill="var(--gold)" stroke="var(--ink)" stroke-width="2"/><path d="M106 12 h-6 a7 7 0 0 0 7 9 M134 12 h6 a7 7 0 0 1 -7 9" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M120 30 v4 M112 34 h16" stroke="var(--ink)" stroke-width="2.5"/></svg>`,
    cops:`<svg viewBox="0 0 240 120" aria-hidden="true"><g font-size="22" text-anchor="middle" fill="var(--gold)"><text x="40" y="28">★</text><text x="64" y="28">★</text><text x="88" y="28">★</text><text x="112" y="28" fill="var(--muted)" opacity=".5">☆</text><text x="136" y="28" fill="var(--muted)" opacity=".5">☆</text></g>
      <path d="M18 92 V80 L30 76 L40 62 H72 L84 76 L96 80 V92 Z" fill="#f4f2ec" stroke="var(--ink)" stroke-width="2"/><rect x="48" y="54" width="16" height="7" rx="2" fill="#e74c3c"/><rect x="56" y="54" width="8" height="7" rx="2" fill="#3f8ee6"/><circle cx="36" cy="93" r="8" fill="#2a3138"/><circle cx="80" cy="93" r="8" fill="#2a3138"/>
      <path d="M128 102 V58 L172 44 L216 58 V102" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><rect x="142" y="66" width="60" height="36" fill="#aab2ba" stroke="var(--ink)" stroke-width="2"/><g stroke="#7f878f" stroke-width="2"><path d="M142 74 H202 M142 82 H202 M142 90 H202"/></g><path d="M142 98 h8 v4 h-8z M158 98 h8 v4 h-8z M174 98 h8 v4 h-8z M190 98 h8 v4 h-8z" fill="#f2c230"/>
      <circle cx="210" cy="36" r="9" fill="#e84d8a"/><circle cx="196" cy="28" r="6" fill="#4aa3ff"/><circle cx="222" cy="22" r="5" fill="#ffd24a"/><path d="M100 72 H122" stroke="var(--muted)" stroke-width="2.5" stroke-dasharray="4 4"/></svg>`,
    tune:`<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M30 86 V74 L48 70 L64 54 H128 L150 70 L178 74 V86 Z" fill="var(--tile)" stroke="var(--ink)" stroke-width="2"/><path d="M150 60 H184 M170 60 V70" stroke="var(--ink)" stroke-width="3"/><path d="M70 58 H96 V68 H62 Z M102 58 H124 L138 68 H102 Z" fill="var(--card-bg)" opacity=".85"/>
      <circle cx="58" cy="88" r="12" fill="#2a3138"/><circle cx="58" cy="88" r="6" fill="var(--gold)"/><circle cx="150" cy="88" r="12" fill="#2a3138"/><circle cx="150" cy="88" r="6" fill="var(--gold)"/><path d="M34 100 H174" stroke="#c04ae0" stroke-width="3" opacity=".7"/>
      <g font-family="var(--display)" font-weight="900" font-size="13" text-anchor="middle" fill="#fff">${[['毂', '#7f93a8'], ['漆', '#e2714c'], ['碳', '#3b3f46'], ['涡', '#c39a3a'], ['氮', '#2aa9de']].map(([c, col], i) => `<rect x="${44 + i * 32}" y="10" width="24" height="24" rx="6" fill="${col}"/><text x="${56 + i * 32}" y="27">${c}</text>`).join('')}</g></svg>`,
    parts:`<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="34" y="14" width="150" height="96" rx="6" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><path d="M48 34 H150 M48 52 H170 M48 70 H140 M48 88 H160" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>
      <circle cx="176" cy="74" r="24" fill="none" stroke="var(--tile)" stroke-width="5"/><path d="M193 91 L214 112" stroke="var(--tile)" stroke-width="7" stroke-linecap="round"/><rect x="164" y="64" width="22" height="22" rx="5" fill="#8e9bc0"/><text x="175" y="80" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="var(--display)">钛</text></svg>`,
    house:`<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="0" y="100" width="240" height="20" fill="#74a955" opacity=".55"/>
      <path d="M40 46 L100 18 L160 46 Z" fill="#c4502a" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/><rect x="50" y="46" width="100" height="56" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/>
      <rect x="62" y="54" width="30" height="16" fill="#9cc3d9" stroke="var(--ink)" stroke-width="1.5"/><rect x="108" y="54" width="30" height="16" fill="#9cc3d9" stroke="var(--ink)" stroke-width="1.5"/>
      <rect x="60" y="80" width="14" height="22" fill="#6b4a33" stroke="var(--ink)" stroke-width="1.5"/><path d="M84 78 H150" stroke="var(--ink)" stroke-width="3"/><path d="M146 78 V102" stroke="var(--ink)" stroke-width="2"/>
      <rect x="92" y="88" width="38" height="12" rx="4" fill="var(--tile)" stroke="var(--ink)" stroke-width="1.5"/><circle cx="100" cy="101" r="3.5" fill="#2a3138"/><circle cx="122" cy="101" r="3.5" fill="#2a3138"/>
      <path d="M186 102 V60" stroke="var(--muted)" stroke-width="3"/><rect x="166" y="44" width="44" height="28" fill="#fff" stroke="#c62f27" stroke-width="3"/><rect x="166" y="44" width="44" height="10" fill="#c62f27"/>
      <text x="188" y="52.5" text-anchor="middle" font-size="7.5" font-weight="900" fill="#fff" font-family="Arial,sans-serif">FOR SALE</text><text x="188" y="66" text-anchor="middle" font-size="9" font-weight="800" fill="var(--ink)" font-family="Arial,sans-serif">RM 8,800</text></svg>`,
    map:`<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M30 20 L80 10 L130 20 L180 10 V100 L130 110 L80 100 L30 110 Z" fill="#74a955" stroke="var(--ink)" stroke-width="2"/><path d="M80 10 V100 M130 20 V110" stroke="var(--ink)" stroke-width="1" opacity=".3"/>
      <path d="M36 70 C70 60 100 74 130 58 S170 40 178 46" stroke="#e6dcc8" stroke-width="7" fill="none"/><ellipse cx="104" cy="36" rx="18" ry="10" fill="#3f8fb0"/><rect x="140" y="70" width="22" height="14" fill="#b9563d"/><rect x="50" y="34" width="16" height="12" fill="#b9563d"/>
      <circle cx="60" cy="86" r="6" fill="#ff8a3d" stroke="var(--ink)" stroke-width="1.5"/><circle cx="150" cy="40" r="6" fill="#ffd24a" stroke="var(--ink)" stroke-width="1.5"/><circle cx="160" cy="94" r="6" fill="#e84d8a" stroke="var(--ink)" stroke-width="1.5"/><circle cx="96" cy="88" r="6" fill="#4fd18b" stroke="var(--ink)" stroke-width="1.5"/>
      <path d="M118 74 L126 92 L118 87 L110 92 Z" fill="var(--ink)" stroke="#fff" stroke-width="2"/>
      <g transform="translate(196 30)"><rect x="0" y="0" width="30" height="30" rx="7" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><text x="15" y="21" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)" font-family="Arial,sans-serif">M</text></g></svg>`,
    radio:`<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="20" y="40" width="200" height="50" rx="12" fill="#151a22" stroke="#ff5fa8" stroke-width="2"/><text x="34" y="60" font-size="10" fill="#9aa3b2" font-family="Arial,sans-serif">FM</text><text x="34" y="80" font-size="20" font-weight="700" fill="#ff5fa8" font-family="Arial,sans-serif">88.6</text>
      <text x="96" y="62" font-size="14" font-weight="700" fill="#eef1f5" font-family="var(--body)">霓虹夜驾</text><text x="96" y="80" font-size="11" fill="#9aa3b2" font-family="var(--body)">♪ 点这里换台</text>
      <g fill="#ff5fa8">${[10, 18, 26, 14, 22, 8].map((h, i) => `<rect x="${176 + i * 6}" y="${78 - h}" width="4" height="${h}"/>`).join('')}</g>
      <path d="M60 22 q8 -10 16 0 M54 16 q14 -18 28 0" stroke="var(--muted)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M184 18 l6 -6 m-2 10 l9 -3" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    save:`<svg viewBox="0 0 240 120" aria-hidden="true"><path d="M86 52 a22 22 0 0 1 42 -10 a17 17 0 0 1 30 12 a14 14 0 0 1 -2 28 H90 a15 15 0 0 1 -4 -30 z" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/>
      <rect x="24" y="64" width="34" height="50" rx="6" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/><rect x="176" y="70" width="52" height="34" rx="3" fill="var(--chip)" stroke="var(--ink)" stroke-width="2"/><path d="M170 108 H234" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 82 C70 76 76 72 88 70" stroke="var(--tile)" stroke-width="2.5" fill="none" stroke-dasharray="4 4"/><path d="M158 74 C166 76 170 80 176 84" stroke="var(--tile)" stroke-width="2.5" fill="none" stroke-dasharray="4 4"/>
      <path d="M114 56 l6 6 12 -14" stroke="var(--ok)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    keys:`<svg viewBox="0 0 240 120" aria-hidden="true"><g font-family="Arial,sans-serif" font-weight="700" font-size="14" text-anchor="middle">${[['W', 56, 22], ['A', 30, 50], ['S', 56, 50], ['D', 82, 50], ['F', 128, 50], ['E', 128, 22], ['M', 170, 22, 1], ['P', 202, 22, 1]].map(([k, x, y, hi]) => `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" rx="5" fill="${hi ? 'var(--tile)' : 'var(--card-bg)'}" stroke="var(--ink)" stroke-width="2"/><text x="${x}" y="${y + 5}" fill="${hi ? 'var(--on-accent)' : 'var(--ink)'}">${k}</text>`).join('')}
      <rect x="40" y="76" width="120" height="22" rx="5" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><text x="100" y="92" font-size="12" fill="var(--muted)" font-family="var(--body)">空格</text><rect x="176" y="76" width="40" height="22" rx="5" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><text x="196" y="92" font-size="12" fill="var(--ink)">Esc</text></g></svg>`
  };

  /* ---------- pages: one topic each; text follows the game code ---------- */
  const K = (k, t) => TOUCH ? t : k;   /* say keys on a computer, buttons on a phone */
  const li = a => '<ul>' + a.map(x => `<li>${x}</li>`).join('') + '</ul>';
  function partsHTML(){
    const P = g(() => TN_PARTS, []), B = g(() => TN_BPS, []), R = g(() => TN_RAR, {});
    if (!P.length) return '<p>这个版本还没有改装道具。</p>';
    return '<h4>改装道具 · 不能用钱买</h4><div class="gd-parts">' + P.map(p => `<div class="gd-part"><i style="background:${p.color}">${esc(p.ch)}</i><div><b>${esc(p.name)}</b><em style="color:${(R[p.rar] || {}).c || 'inherit'}">${esc((R[p.rar] || {}).name || '')}</em><span>${esc(p.from)}</span></div></div>`).join('') + '</div>'
      + (B.length ? '<h4>改装配方 · 拿到一次永久解锁，重复的换成改装图纸</h4><div class="gd-parts">' + B.map(b => `<div class="gd-part"><i class="bp">${esc(b.ch)}</i><div><b>${esc(b.name)}</b><em>解锁 ${esc(b.for)}</em><span>${esc(b.from)}</span></div></div>`).join('') + '</div>' : '');
  }
  const PAGES = [
    {id:'hello', t:'欢迎来到 XMUM 校园', art:'hello', body:() => `
      <p class="gd-lead">这是一座照平面图搭出来的雪邦校园。主玩法是<b>「开车 · 奶娃」</b>：你是奶娃，在校园里走路、开车、到处找事做。</p>
      ${li(['做各种事攒 <b>RM</b> 和<b>改装道具</b>：送外卖、挑战赛、校门外打工、抓小偷、宿舍撤离、教学楼潜入、B1 游戏厅小游戏……',
        '钱拿去买车、改装、升级水枪、买衣服和喷漆，攒够了去校门外<b>买房装修</b>，<b>总资产</b>（钱加上买过的东西）越滚越大。',
        '冲<b>「总资产」排行榜</b>：全服前七名还会站上陈华春音乐厅门前的展台。',
        '不知道下一步干嘛？就去右上角小地图上的<b>橙色点</b>接一单外卖。'])}
      <p class="gd-hint">${K('← → 翻页 · P 或 Esc 关', '左右滑动翻页')}</p>`},
    {id:'earn', t:'赚钱的门路', art:'earn', body:() => `
      <dl class="gd-dl">
        <dt>送外卖</dt><dd>D6 食堂、LY3 食堂、B1 餐厅门口的<b>橙色光圈</b>挑一单${K('（F 或 1 2 3 接，X 跳过，J 关掉接单）', '')}，限时送到绿点。每天有一家「加急」，第一单双倍；校门外还有两个取餐点，出入校门的单按路程加钱。</dd>
        <dt>挑战赛和竞速</dt><dd>环湖赛、早八冲刺、田径场漂移、飞跃挑战按成绩给奖牌和钱；带格子旗的赛事点开车进圈，选人机赛、道具赛或影线 1v1。</dd>
        <dt>特技分</dt><dd>漂移、飞跃、撞车连成一串，连击结束换成钱（50 分 = RM 1）。</dd>
        <dt>校门外</dt><dd>麦当当得来速、蜜雪冰橙打工、KIP 超市大乱斗、山梁拉力；夜晚 Bell 后巷有夜市；傍晚起排屋南边的 Kota Warisan 大夜市开市，榴莲摊有猫山王挑战。</dd>
        <dt>坐小火车</dt><dd>开到 Salak Tinggi ERL 站（地图上的紫色点），站厅门口紫圈${K('按 F', '点「上车」')}坐车，一站到 KLIA 机场：问讯台接「送机赶时间」跑腿单，还有 24 小时的すき家。</dd>
        <dt>抓小偷</dt><dd>送单时有人抢外卖：追上去用水枪淋或开车撞倒，走到身边${K('按 F', '点「上车」')}拿回来。Bell 路口的通缉榜能直接接悬赏。</dd>
        <dt>大活</dt><dd>LY 宿舍门口紫圈「宿舍撤离」、A3 门口红圈蓝圈「教学楼潜入」、猴山山顶「猴子大战」、B1 游戏厅的小游戏（得分换钱），掉的改装道具最好。</dd>
        <dt>成就</dt><dd>解锁就给钱，还送一张改装图纸。暂停面板里能看全部成就。</dd>
      </dl>`},
    {id:'rich', t:'总资产和排行榜', art:'rich', body:() => `
      ${li(['<b>总资产</b> = 现金 + 买过的车、改装、水枪升级、衣橱、喷漆、宿舍周边、房子和装修，按原价算；改装道具和配方也有估值。',
        '所以花钱不会让总资产变少，现金只是换成了同样值钱的东西。<b>被保安抓到</b>才会真的少：罚走身上现金的 30%。',
        '标题页「排行榜」→「总资产」看全服排名；另外还有黑洞、特技和每个小游戏自己的榜。',
        '上榜要联网，并在标题页填好<b>昵称</b>：昵称先到先得，注册后只有你能用。'])}`},
    {id:'cops', t:'被保安通缉了怎么办', art:'cops', body:() => `
      <p class="gd-lead">撞东西、吓到同学会让<b>保安警戒</b>（右上角的星）升级，巡逻车会追你；五星时还会在前面设路障。</p>
      <ol class="gd-steps">
        <li><b>喷漆车间</b>：开着<b>自己的车</b>（车行买的）冲进正门对面 Bell 那排店屋西头的喷漆车间，卷帘门一关就换漆，警戒清零。每颗星 RM 50；同一间喷完要等 2 分钟。小地图上是<span class="gd-dot" style="--c:#e84d8a"></span>粉色的点，被通缉时会闪。</li>
        <li><b>跑远</b>：离巡逻车 150 米以上（钻进树林只要 70 米）待一会儿，星一颗颗往下掉；甩掉保安还会掉改装道具。</li>
        <li><b>躲进室内</b>：教学楼、宿舍里保安抓不了你，巡逻车只能在门口等。</li>
        <li><b>水枪</b>${K('（E）', '')}：淋湿巡逻车，它会停下来擦玻璃。</li>
      </ol>
      <p class="gd-note">被抓到：罚款身上现金的 30%，警戒解除，回到校园里接着玩。</p>`},
    {id:'tune', t:'改装车', art:'tune', body:() => `
      ${li([`先在<b>XMUM 车行</b>（${K('按 G，或', '点')}右上角「车行」）买一辆自己的车，最便宜的 Myvi 只要 RM 60。车行里点<b>「改装车间」</b>。`,
        '改装要钱 + <b>改装道具</b>。道具不能用钱买，只能玩出来；顶级改装还要先拿到<b>配方</b>。',
        '车间顶上那排<b>零件栏</b>（配 毂 漆 灯 碳 …）：点一个就写着你有几个、<b>去哪儿拿</b>；最左边的「配」是<b>配方页</b>，写着每张配方解锁什么、去哪儿拿。',
        '点一项改装预览时，缺东西会直接写<b>「缺的去哪儿拿」</b>。',
        '下单后按真实时间施工（轻改几分钟，顶级要跨天），车照样能开，完工后回车行提车。'])}
      <p class="gd-hint">下一页是全部道具和配方的来源速查。</p>`},
    {id:'parts', t:'零件和配方去哪儿拿', art:'parts', body:partsHTML},
    {id:'house', t:'买房装修', art:'house', body:() => `
      ${li(['出南门往南走，Bell Avenue 后面那排带车棚的排屋（Taman Warisan Megah）有四户挂着<b>「出售」</b>牌子，小地图上是<span class="gd-dot" style="--c:#38c6d9"></span>青色点。',
        `走到门口${K('按 F', '点「看房」')}看房：能先进去转一圈，买下要 RM 7,400–9,600（按附近真实成交价 ÷ 50）。买下后门牌写你的昵称，${K('按 F', '点「回家」')}进门。`,
        `家里${K('按 F', '点「装修」')}：先选风格（学生宿舍风、北欧原木、中式红木、电竞房、奶娃主题），九个位置的家具一件件买，墙面和地板另外换。走到沙发、椅子、床、灶台旁边${K('按 F', '点按钮')}能<b>坐下、躺下、做饭</b>。电竞房有几件要<b>改装道具</b>，奶娃主题要解锁够多<b>成就</b>。`,
        '房子、家具、墙面地板都按原价算进<b>总资产</b>。开着自己的车到车棚前下车，车自动停进车棚，下次上线还在。第一套房子自动设成<b>出生点</b>，打开游戏就在家门口（装修面板顶上能改）。'])}`},
    {id:'map', t:'看地图', art:'map', body:() => `
      ${li([`${K('按 <kbd>M</kbd> 打开大地图', '点右上角的小地图打开大地图')}：拖动平移，${K('滚轮或', '双指或')}「＋ −」缩放，「回到我」重新跟着你。${K('再按 M 或 Esc 关。', '')}`,
        '屏幕上方的<b>指南针</b>指着现在的目标，旁边写着还有多远。',
        '在教学楼、宿舍里面，小地图换成那层楼的平面图。'])}
      <div class="gd-legend">${LEGEND.map(([c, t, sq]) => `<span><i class="${sq ? 'sq' : ''}" style="--c:${c}"></i>${t}</span>`).join('')}</div>`},
    {id:'radio', t:'换电台', art:'radio', body:() => `
      ${li(['上车自动开电台。点<b>电台小条</b>（电脑在左下角，手机竖着拿在上方）打开面板：选台（霓虹夜驾、芙蓉湖 Lo-fi、赛道 EDM）、下一首、单曲循环、收藏到这辆车（下次坐进这辆车接着放）、音量。',
        '按钮栏里的<b>「电台」</b>一点换一个台，换到最后一个是关。',
        '<b>外放</b>：自己听免费；打开外放每分钟 RM 0.5，40 米内的玩家都听得到。',
        '可以勾「竞速和被保安追时自动切到赛道 EDM」。'])}`},
    {id:'save', t:'存档和登录', art:'save', body:() => `
      ${li(['进度自动存在这台设备的浏览器里。换手机、清缓存就没了。',
        '标题页昵称下面点<b>「用 Google 登录」</b>：进度存到云端，换设备登录同一个账号就同步回来；两边进度不一样时，以进度多的一边为准。',
        '在微信、QQ 里打开的用不了 Google 登录：点右上角「···」→「在浏览器打开」。',
        '昵称填好就会注册，先到先得；联网时排行榜和展台上显示的都是注册的昵称。'])}`},
    {id:'keys', t:'按键速查', art:'keys', body:() => TOUCH ? `
      <dl class="gd-dl">
        <dt>左下摇杆</dt><dd>走路、开车、移动黑洞，推到底是跑</dd>
        <dt>右下按钮</dt><dd>上车 / 下车、跳 / 漂移、大笑 / 喇叭、撩头（潜入和宿舍里是蹲下）、水枪（按住拖动瞄准）、电台</dd>
        <dt>拖动屏幕</dt><dd>转视角</dd>
        <dt>点小地图</dt><dd>大地图</dd>
        <dt>暂停</dt><dd>右上角「暂停」：这局战绩、成就，还有这本「游戏指南」</dd>
        <dt>车行 · 衣橱</dt><dd>右上角的按钮</dd>
      </dl>` : `
      <dl class="gd-dl">
        <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>走路 / 开车，<kbd>Shift</kbd> 跑</dd>
        <dt><kbd>空格</kbd></dt><dd>跳；开车时按住漂移</dd>
        <dt><kbd>F</kbd></dt><dd>上车、下车、进门、接单、按住翻找</dd>
        <dt><kbd>E</kbd></dt><dd>水枪（鼠标指哪喷哪）</dd>
        <dt><kbd>R</kbd> <kbd>Q</kbd> <kbd>H</kbd></dt><dd>大笑、撩头（潜入和宿舍里是蹲下）、喇叭</dd>
        <dt><kbd>G</kbd> <kbd>C</kbd></dt><dd>XMUM 车行、奶娃衣橱</dd>
        <dt><kbd>M</kbd></dt><dd>大地图</dd>
        <dt><kbd>P</kbd></dt><dd>这本游戏指南</dd>
        <dt><kbd>Esc</kbd></dt><dd>暂停 · 看战绩和成就；关掉打开的面板</dd>
        <dt><kbd>J</kbd></dt><dd>开 / 关接单卡片</dd>
        <dt>电台</dt><dd>点左下角的电台小条</dd>
      </dl>`}
  ];
  const LEGEND = [['#1f2a33', '你（箭头）'], ['#ff8a3d', '外卖取餐'], ['#4fd18b', '送达点'], ['#ffd24a', '打卡点'], ['#e84d8a', '喷漆车间'], ['#e74c3c', '巡逻车', 1], ['#c9a0ff', '宿舍门口'], ['#ffd27a', '教学楼门口'], ['#ff6f61', '抢救期末卷'], ['#ff5fa2', 'B1 游戏厅'], ['#38c6d9', '出售的房子'], ['#a774ff', 'ERL 火车站']];

  /* ---------- the guide sheet ---------- */
  const gd = document.createElement('dialog'); gd.id = 'guide'; gd.className = 'panel sheet gd'; gd.setAttribute('aria-labelledby', 'gdT');
  gd.innerHTML = `<div class="sheet-h"><h2 id="gdT">游戏指南</h2><span class="gd-no" id="gdNo"></span><button type="button" class="x" data-close aria-label="关闭">×</button></div>
    <div class="gd-book" id="gdBook"><div class="gd-track" id="gdTrack"></div></div>
    <div class="gd-nav"><button type="button" class="gd-arr" id="gdPrev" aria-label="上一页">‹</button><div class="gd-dots" id="gdDots" role="tablist" aria-label="翻到"></div><button type="button" class="gd-arr" id="gdNext" aria-label="下一页">›</button></div>`;
  document.body.appendChild(gd);
  const $g = id => gd.querySelector('#' + id), track = $g('gdTrack'), book = $g('gdBook');
  let cur = 0, built = false;
  function build(){
    track.innerHTML = PAGES.map((p, i) => `<section class="gd-page" role="tabpanel" id="gdp-${p.id}" aria-label="${esc(p.t)}" tabindex="-1"><div class="gd-art">${ART[p.art] || ''}</div><div class="gd-txt"><h3><small>${i + 1}</small>${esc(p.t)}</h3>${p.body()}</div></section>`).join('');
    $g('gdDots').innerHTML = PAGES.map((p, i) => `<button type="button" role="tab" aria-label="${i + 1}. ${esc(p.t)}" aria-controls="gdp-${p.id}"></button>`).join('');
    $g('gdDots').querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => go(i)));
    built = true;
  }
  function go(i, instant){
    cur = Math.max(0, Math.min(PAGES.length - 1, i));
    track.style.transition = instant ? 'none' : '';
    track.style.transform = `translateX(${-cur * 100}%)`;
    track.querySelectorAll('.gd-page').forEach((s, k) => { s.setAttribute('aria-hidden', String(k !== cur)); s.inert = k !== cur; if (k === cur) s.scrollTop = 0; });
    $g('gdDots').querySelectorAll('button').forEach((b, k) => { b.setAttribute('aria-selected', String(k === cur)); b.tabIndex = k === cur ? 0 : -1; });
    $g('gdNo').textContent = `${cur + 1} / ${PAGES.length}`;
    $g('gdPrev').disabled = cur === 0; $g('gdNext').disabled = cur === PAGES.length - 1;
    try { localStorage.setItem('xmum-guide-page', String(cur)); } catch(e){}
  }
  function openGuide(page){
    if (gd.open) return;
    if (bm.open) closeMap();
    pauseArcade(); grab('g');
    build();   /* rebuilt each time: the touch / computer wording and the parts table are read fresh */
    let i = 0;
    if (typeof page === 'string') i = Math.max(0, PAGES.findIndex(p => p.id === page));
    else if (typeof page === 'number') i = page;
    else { i = g(() => +localStorage.getItem('xmum-guide-page') || 0, 0); if (i >= PAGES.length - 1) i = 0; }   /* pick up where you stopped; read to the end = start over */
    go(i, true);
    gd.showModal ? gd.showModal() : gd.setAttribute('open', '');
    requestAnimationFrame(() => { track.style.transition = ''; $g('gdNext').disabled ? $g('gdPrev').focus({preventScroll:true}) : $g('gdNext').focus({preventScroll:true}); });
    try { localStorage.setItem(TIP_KEY, '1'); } catch(e){}
  }
  function closeGuide(){ if (!gd.open) return; gd.close ? gd.close() : gd.removeAttribute('open'); release('g'); }
  gd.addEventListener('close', () => release('g'));
  gd.addEventListener('cancel', e => { e.preventDefault(); closeGuide(); });
  gd.addEventListener('click', e => { if (e.target === gd || e.target.closest('[data-close]')) closeGuide(); });
  $g('gdPrev').addEventListener('click', () => go(cur - 1));
  $g('gdNext').addEventListener('click', () => go(cur + 1));
  /* swipe: a sideways drag turns the page; up / down still scrolls the page (touch-action: pan-y) */
  let sw = null;
  book.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; sw = {id:e.pointerId, x:e.clientX, y:e.clientY, dx:0, on:false}; });
  book.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.on && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2){ sw.on = true; track.style.transition = 'none'; }
    if (sw.on){ sw.dx = dx; const edge = (cur === 0 && dx > 0) || (cur === PAGES.length - 1 && dx < 0) ? .3 : 1; track.style.transform = `translateX(calc(${-cur * 100}% + ${dx * edge}px))`; }
  });
  const swEnd = e => {
    if (!sw || e.pointerId !== sw.id) return;
    const s = sw; sw = null; if (!s.on) return;
    track.style.transition = '';
    const w = book.clientWidth || 300;
    if (s.dx < -Math.min(60, w * .18)) go(cur + 1); else if (s.dx > Math.min(60, w * .18)) go(cur - 1); else go(cur);
  };
  book.addEventListener('pointerup', swEnd); book.addEventListener('pointercancel', swEnd);

  /* ---------- the big map ---------- */
  const bm = document.createElement('dialog'); bm.id = 'bigmap'; bm.className = 'panel sheet bm'; bm.setAttribute('aria-labelledby', 'bmT');
  bm.innerHTML = `<div class="sheet-h"><h2 id="bmT">地图</h2><span class="bm-sub" id="bmSub"></span><button type="button" class="x" data-close aria-label="关闭">×</button></div>
    <div class="bm-view" id="bmView"><canvas id="bmCv" aria-label="大地图：北在上"></canvas>
      <div class="bm-zoom" id="bmZoom"><button type="button" id="bmIn" aria-label="放大">＋</button><button type="button" id="bmOut" aria-label="缩小">−</button><button type="button" id="bmMe" class="bm-me">回到我</button></div>
      <span class="bm-n" aria-hidden="true">N ↑</span></div>
    <div class="bm-legend" id="bmLegend"></div>`;
  document.body.appendChild(bm);
  const $m = id => bm.querySelector('#' + id), cv = $m('bmCv'), view = $m('bmView'), cx2d = cv.getContext('2d');
  const MV = {span:720, cx:0, cz:0, follow:true, raf:0, last:0, dpr:1, ptr:new Map(), pinch:0, drag:null};
  const SPAN_MIN = 160, SPAN_MAX = 2600;
  const indoor = () => g(() => ROOM.in, false) || g(() => DORM.in, false) || !!g(() => XTrain.inside, null);
  function meNow(){
    if (mode === 'walk') return [player.x, player.z, player.yaw];
    if (mode === 'hole') return [hole.x, hole.z, camYaw];
    const c = driving; return [c ? c.x : nw.x, c ? c.z : nw.z, (c ? c.h : nw.h) + Math.PI];
  }
  function sizeMap(){
    const r = view.getBoundingClientRect(); MV.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * MV.dpr)), h = Math.max(1, Math.round(r.height * MV.dpr));
    if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  }
  function drawMap(){
    if (!bm.open) return;
    const [x, z, yaw] = meNow(), W = cv.width, H = cv.height;
    if (indoor()){
      /* the floor plan: the wrapped drawMini draws it on the minimap canvas, shown here big */
      g(() => drawMini(x, z, yaw));
      cx2d.fillStyle = '#262a31'; cx2d.fillRect(0, 0, W, H);
      const s = Math.min(W, H) * .96; cx2d.imageSmoothingEnabled = true; cx2d.drawImage(mini, (W - s) / 2, (H - s) / 2, s, s);
      return;
    }
    if (MV.follow){ MV.cx = x; MV.cz = z; }
    miniNames.minor = MV.span <= 460;
    g(() => drawMiniCampus(MV.cx, MV.cz, yaw, {g:cx2d, span:MV.span, u:MV.dpr * 1.15, names:MV.span <= 1500, me:[x, z], noN:true}));
  }
  function loop(t){
    if (!bm.open){ MV.raf = 0; return; }
    if (t - MV.last > 90){ MV.last = t; drawMap(); }
    MV.raf = requestAnimationFrame(loop);
  }
  function legend(){
    const inn = indoor();
    $m('bmZoom').hidden = inn;
    $m('bmSub').textContent = inn ? '这层楼的平面图' : mode === 'hole' ? '黑洞和道具' : (TOUCH ? '拖动平移 · 双指缩放' : '拖动平移 · 滚轮缩放 · M 或 Esc 关');
    const L = inn ? [] : mode === 'naiwa' ? LEGEND : mode === 'walk' ? [['#1f2a33', '你（箭头）'], ['#ffd24a', '打卡点']] : [['#1f2a33', '你（箭头）']];
    $m('bmLegend').innerHTML = L.map(([c, t, sq]) => `<span><i class="${sq ? 'sq' : ''}" style="--c:${c}"></i>${t}</span>`).join('');
    $m('bmLegend').hidden = !L.length;
  }
  function canMap(){
    if (g(() => titleOpen, false) || !(mode === 'walk' || mode === 'naiwa' || mode === 'hole')) return false;
    if (g(() => ARC.in, false)){ g(() => toast('游戏厅里没有地图', '出门再看', 1400)); return false; }
    return true;
  }
  function openMap(){
    if (bm.open || !canMap()) return;
    if (gd.open) closeGuide();
    grab('m'); MV.follow = true;
    bm.showModal ? bm.showModal() : bm.setAttribute('open', '');
    legend(); sizeMap(); drawMap();
    if (!MV.raf) MV.raf = requestAnimationFrame(loop);
    $m('bmMe').focus({preventScroll:true});
  }
  function closeMap(){ if (!bm.open) return; bm.close ? bm.close() : bm.removeAttribute('open'); MV.ptr.clear(); MV.drag = null; release('m'); }
  bm.addEventListener('close', () => { MV.ptr.clear(); MV.drag = null; release('m'); });
  bm.addEventListener('cancel', e => { e.preventDefault(); closeMap(); });
  bm.addEventListener('click', e => { if (e.target === bm || e.target.closest('[data-close]')) closeMap(); });
  window.addEventListener('resize', () => { if (bm.open){ sizeMap(); drawMap(); } });
  function zoom(f, px, py){
    const s0 = MV.span, s1 = Math.max(SPAN_MIN, Math.min(SPAN_MAX, s0 * f)); if (s1 === s0) return;
    /* keep the point under the cursor / fingers where it is */
    if (px != null){
      const k0 = Math.min(cv.width, cv.height) / s0, k1 = Math.min(cv.width, cv.height) / s1, ox = px * MV.dpr - cv.width / 2, oz = py * MV.dpr - cv.height / 2;
      if (MV.follow){ const [x, z] = meNow(); MV.cx = x; MV.cz = z; }
      MV.cx += ox / k0 - ox / k1; MV.cz += oz / k0 - oz / k1; MV.follow = false;
    }
    MV.span = s1; drawMap();
  }
  function pan(dxCss, dzCss){
    if (MV.follow){ const [x, z] = meNow(); MV.cx = x; MV.cz = z; MV.follow = false; }
    const k = Math.min(cv.width, cv.height) / MV.span;
    MV.cx = Math.max(-1300, Math.min(1300, MV.cx - dxCss * MV.dpr / k)); MV.cz = Math.max(-1300, Math.min(1300, MV.cz - dzCss * MV.dpr / k));
    drawMap();
  }
  $m('bmIn').addEventListener('click', () => zoom(1 / 1.4));
  $m('bmOut').addEventListener('click', () => zoom(1.4));
  $m('bmMe').addEventListener('click', () => { MV.follow = true; drawMap(); });
  cv.addEventListener('wheel', e => { e.preventDefault(); if (indoor()) return; const r = cv.getBoundingClientRect(); zoom(Math.exp(e.deltaY * .0016), e.clientX - r.left, e.clientY - r.top); }, {passive:false});
  cv.addEventListener('pointerdown', e => {
    if (indoor()) return;
    cv.setPointerCapture(e.pointerId); MV.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (MV.ptr.size === 2){ const [a, b] = [...MV.ptr.values()]; MV.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); MV.drag = null; }
    else MV.drag = [e.clientX, e.clientY];
  });
  cv.addEventListener('pointermove', e => {
    if (!MV.ptr.has(e.pointerId)) return;
    MV.ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (MV.ptr.size === 2 && MV.pinch){
      const [a, b] = [...MV.ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = cv.getBoundingClientRect();
      if (d > 0){ zoom(MV.pinch / d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); MV.pinch = d; }
    } else if (MV.drag){ pan(e.clientX - MV.drag[0], e.clientY - MV.drag[1]); MV.drag = [e.clientX, e.clientY]; }
  });
  const ptrEnd = e => { MV.ptr.delete(e.pointerId); if (MV.ptr.size < 2) MV.pinch = 0; if (!MV.ptr.size) MV.drag = null; else { const [p] = [...MV.ptr.values()]; MV.drag = [p[0], p[1]]; } };
  cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
  /* phones (and anyone with a mouse): tap the minimap for the big map. mini comes from js/90-main.js, which loads after this file */
  const hookMini = () => { const m = document.getElementById('mini'); if (!m) return; m.style.cursor = 'pointer'; m.title = '大地图（M）'; m.addEventListener('click', () => { g(() => ac()); openMap(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookMini); else hookMini();

  /* ---------- keys: P = guide, M = map; while either is open, every key stays here ---------- */
  window.addEventListener('keydown', e => {
    if (gd.open || bm.open){
      if (e.code === 'Tab') return;
      e.stopImmediatePropagation();
      const c = e.code;
      if (c === 'Escape' || (gd.open && c === 'KeyP' && !e.repeat) || (bm.open && c === 'KeyM' && !e.repeat)){ e.preventDefault(); gd.open ? closeGuide() : closeMap(); return; }
      if (gd.open){
        if (c === 'ArrowRight' || c === 'PageDown'){ e.preventDefault(); go(cur + 1); }
        else if (c === 'ArrowLeft' || c === 'PageUp'){ e.preventDefault(); go(cur - 1); }
        else if (c === 'Home'){ e.preventDefault(); go(0); }
        else if (c === 'End'){ e.preventDefault(); go(PAGES.length - 1); }
        else if (c === 'KeyM' && !e.repeat){ e.preventDefault(); closeGuide(); openMap(); }
      } else {
        const st = 60;
        if (c === 'ArrowLeft' || c === 'KeyA'){ e.preventDefault(); pan(st, 0); }
        else if (c === 'ArrowRight' || c === 'KeyD'){ e.preventDefault(); pan(-st, 0); }
        else if (c === 'ArrowUp' || c === 'KeyW'){ e.preventDefault(); pan(0, st); }
        else if (c === 'ArrowDown' || c === 'KeyS'){ e.preventDefault(); pan(0, -st); }
        else if (c === 'Equal' || c === 'NumpadAdd'){ e.preventDefault(); zoom(1 / 1.4); }
        else if (c === 'Minus' || c === 'NumpadSubtract'){ e.preventDefault(); zoom(1.4); }
        else if (c === 'KeyP' && !e.repeat){ e.preventDefault(); closeMap(); openGuide(); }
      }
      return;
    }
    if ((e.code !== 'KeyP' && e.code !== 'KeyM') || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return;
    if (e.code === 'KeyP'){ e.preventDefault(); e.stopImmediatePropagation(); openGuide(); }
    else if (canMap()){ e.preventDefault(); e.stopImmediatePropagation(); openMap(); }
  }, true);

  /* ---------- the other ways in: the pause panel and the title page ---------- */
  /* in the pause panel's header (its button row is already full on phones) */
  { const head = document.querySelector('#gxpause .shop-h');
    if (head){ const b = document.createElement('button'); b.type = 'button'; b.className = 'gd-pill'; b.id = 'gxpGuide';
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.2C6.6 3 4.6 2.6 2 2.8v9.6c2.6-.2 4.6.2 6 1.4 1.4-1.2 3.4-1.6 6-1.4V2.8c-2.6-.2-4.6.2-6 1.4zM8 4.2v9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>游戏指南';
      b.addEventListener('click', () => openGuide()); head.appendChild(b); } }
  { const t = document.getElementById('tHow');
    if (t){ const b = document.createElement('button'); b.type = 'button'; b.className = 't-btn'; b.id = 'tGuide';
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.2C6.6 3 4.6 2.6 2 2.8v9.6c2.6-.2 4.6.2 6 1.4 1.4-1.2 3.4-1.6 6-1.4V2.8c-2.6-.2-4.6.2-6 1.4zM8 4.2v9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>指南';
      b.addEventListener('click', () => openGuide()); t.parentNode.insertBefore(b, t); } }

  /* ---------- one light hint the first time you leave the title page ---------- */
  const TIP_KEY = 'xmum-guide-tip';
  const tipSeen = () => g(() => !!localStorage.getItem(TIP_KEY), true);
  if (!tipSeen()){
    const mo = new MutationObserver(() => {
      if (document.body.classList.contains('titled')) return;
      mo.disconnect();
      /* the toast has one slot and the first seconds are busy (the showcase, the daily rush order…): wait until it is free */
      const tryTip = n => {
        if (tipSeen() || gd.open || bm.open || document.body.classList.contains('titled')) return;
        const t = document.getElementById('toast');
        if (t && t.classList.contains('show') && n < 10){ setTimeout(tryTip, 1500, n + 1); return; }
        try { localStorage.setItem(TIP_KEY, '1'); } catch(e){}
        g(() => toast(TOUCH ? '不知道怎么玩？看游戏指南' : '按 P 看游戏指南', TOUCH ? '「暂停」和「菜单」里都有 · 点小地图看大地图' :'怎么赚钱、甩掉保安、改装车都写在里面 · M 打开大地图', 4200));
      };
      setTimeout(tryTip, 2500, 0);
    });
    mo.observe(document.body, {attributes:true, attributeFilter:['class']});
  }

  window.XGuide = {open:openGuide, close:closeGuide, map:openMap, closeMap, get on(){ return gd.open || bm.open; }, pages:PAGES.map(p => p.id)};
})();
