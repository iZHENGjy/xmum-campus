/* XMUM 校园漫游 · 车载电台：三个台、全部浏览器现场合成（没有音频文件），可以外放给附近的人听
 *
 * 玩法：
 *   上车自动开电台，下车淡出。换台、开关都在电台小条点开的面板里（按钮栏原来的「电台」按钮已去掉）。M 键现在是大地图（js/ui-guide.js），电台没有快捷键了。
 *   左下角（手机在上方）的小条显示台名、曲名、段落；点它打开面板：选台、下一首、单曲循环、收藏到这辆车、外放、音量、自动切 EDM。
 *   每首 32 小节（约 1 到 1 分半），播完自动接下一首；单曲循环打开时一直放这首。
 *   收藏：把这首的编号（种子）记在这款车上，下次坐进同款车接着循环放。
 *   竞速（js/92-racing.js 的 RC.st 不是 idle）和有通缉星（js/80-gta.js 的 heat ≥ 1）时自动切到赛道 EDM，结束 3 秒后切回原来的台；
 *   面板里可以关掉。比赛 / 被追时自己手动换了台，就不再自动切回。
 *   天气版（曲风）：每个台都能放 6 种心情的歌：雨天（钢琴、玻璃上的雨声）、雷雨（暗色合成器、远处的闷雷）、烟霾（朦胧的氛围铺底、低低的风）、
 *     阴天（柔和）、夜色（chill）、黄昏（暖色大调）。心情写在种子里（moodOf），所以外放、收藏、自动接下一首都带着它，联机不用加字段。
 *   智能选歌（默认开）：按天气、钟点、车速、在不在校园自动选台和曲风，规则见下面「智能选歌」一节；一首放完才换（两台交叉淡入淡出），
 *     只有比赛 / 被追切 EDM 是马上换。手动点了台或曲风就关掉智能选歌，面板里再勾上才回来。面板和小条显示理由，比如「下雨了 · 雨天 Lo-fi」。
 *   外放：自己听免费；打开外放每分钟 RM 0.5（开的时候先扣一分钟，钱不够自动关）。只在车上、电台在响的时候计时。
 *   别人听到：40 米以内，越远越小声、越闷，左右声道跟方向走；同时只听最近的 2 辆（手机和流畅档 1 辆）。
 *
 * 一首歌 = (台号 s, 种子 k)。songOf(s, k) 决定调、速度、和弦走向、两段旋律、歌名，所以联机只要同步几个数字，
 * 别人的电脑按同样的种子合成同一首。下一首的种子 = nextSeed(k)，别人也能自己往下接。
 *   联机：/radio/{uid} = {s:台 0–2, k:种子, t:这首开始的服务器时间(ms), l:单曲循环}，只在外放时存在，断线自动删除
 *         （规则见 database.rules.json：只能写自己的，字段和范围有限制）。位置用 presence 里已有的（XNet.peer）；
 *         只订阅附近 150 米内开着车的人的 /radio/{uid}，不监听整个 /radio。
 *   离线（预览版没有数据库）：同一个浏览器里开两个窗口，用 BroadcastChannel 互相听（只为测试外放）。
 *
 * 音量：走 js/20-fx.js 的同一个 AudioContext 和 soundOn（标题页的声音开关）；总音量比引擎低一点，
 *   提示音（tone / noise）响的时候电台让一让（压低约 5 dB，0.4 秒回来）；室内、小游戏、暂停、页面隐藏时淡出并停止合成。
 * 性能：只在有声音时排音符（25 ms 一次，提前 0.15 秒）；画质「流畅」或手机非高清档时不开混响、和弦少一个音、齐奏声部减半；
 *   别人的外放永远用简化版（没有混响和延迟），最多 2 路。
 *   车速越快电台略大声一点（最多 +1.7 dB，像真车的随速音量），盖得过高速时的引擎声。过场动画有自己的配乐时（js/89-cine-audio.js）电台淡出。
 * 存档：localStorage 'xmum-radio-v1' = {on, st, vol, auto, smart, md:手选的曲风, fav:{车型:{s, k}}}。旧存档没有 smart / md：智能选歌开、原味。
 * 调试：window.XRadio（state、smart、pick、pickMood、setSmart、next、songOf、moodOf、decks）。 */
'use strict';
(() => {
  /* ---------- stations and songs (from the listening demo the owner approved) ---------- */
  const STATIONS = [
    {id:'wave', name:'霓虹夜驾', short:'霓虹', freq:'88.6', acc:'#ff5fa8', bpm:[94, 104], keys:[45, 47, 48, 50, 52], minor:true, tone:15000,
     progs:[[[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']]],
     dens:[.7, .45, .12], maxLen:4, w1:['霓虹', '午夜', '镀铬', '湖心', '雷达', '长堤', '零点'], w2:['环线', '回声', '尾灯', '星港', '海岸', '信号', '航线']},
    {id:'lofi', name:'芙蓉湖 Lo-fi', short:'Lo-fi', freq:'92.3', acc:'#ffb44d', bpm:[76, 86], keys:[48, 50, 51, 53, 55], minor:false, tone:3800,
     progs:[[[2, 'm7'], [7, '7'], [0, 'M7'], [9, 'm7']], [[5, 'M7'], [4, 'm7'], [9, 'm7'], [0, 'M7']], [[0, 'M7'], [9, 'm7'], [2, 'm7'], [7, '7']], [[5, 'M7'], [7, '7'], [4, 'm7'], [9, 'm7']]],
     dens:[.45, .3, .07], maxLen:6, w1:['图书馆', '午后', '下雨的', '自习室', 'D6', '湖边', '周五'], w2:['窗边', '咖啡', '微风', '便利贴', '慢车', '发呆', '长椅']},
    {id:'edm', name:'赛道 EDM', short:'EDM', freq:'104.8', acc:'#46d6ff', bpm:[124, 128], keys:[45, 46, 48, 50, 52], minor:true, tone:18000,
     progs:[[[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], [[0, 'm'], [8, 'M'], [10, 'M'], [0, 'm']], [[8, 'M'], [10, 'M'], [0, 'm'], [0, 'm']], [[0, 'm'], [3, 'M'], [10, 'M'], [8, 'M']]],
     dens:[.6, .5, .15], maxLen:3, w1:['氮气', '山梁', '极速', '全油门', '弯心', '红线', '发车'], w2:['冲刺', '点火', '超车', '连击', '漂移', '终点', '狂飙']}
  ];
  const EDM = 2, STEPS = 32 * 16;
  const TAG = [' 霓虹', ' Lo-fi', ' EDM'];      /* 「雨天」+ TAG = 雨天 Lo-fi */
  /* ---------- moods (天气版): every station can play a song in one of these moods ----------
     A mood changes the song itself (chords, tempo, melody density, title words) and how it is played (drums quieter, darker tone,
     more reverb, a pad underneath, a texture bed: rain on the glass, wind in the haze, a low rumble in a storm).
     The mood lives inside the seed (see moodOf), so a broadcast, a favourite and the next-song chain all carry it with no new field. */
  const MOODS = [null,
    {id:'rain', name:'雨天', why:'下雨了', minor:false, bpm:.88, tone:.8, dr:.6, rev:1.5, pad:3, tex:'rain', dens:[.4, .25, .05], maxLen:6,
     progs:[[[5, 'M7'], [4, 'm7'], [2, 'm7'], [0, 'M7']], [[0, 'M7'], [9, 'm7'], [2, 'm7'], [7, '7']], [[9, 'm7'], [2, 'm7'], [5, 'M7'], [4, 'm7']], [[2, 'm7'], [7, '7'], [4, 'm7'], [9, 'm7']]],
     w1:['窗上的', '雨夜', '伞下', '湿漉漉的', '屋檐', '雨刷', '积水'], w2:['雨滴', '车窗', '慢行', '路灯', '水花', '回家', '涟漪']},
    {id:'storm', name:'雷雨', why:'雷阵雨', minor:true, bpm:.9, tone:.55, dr:.9, rev:1.3, pad:1, tex:'storm', keys:[43, 44, 45, 46, 47], dens:[.55, .35, .1],
     progs:[[[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']], [[0, 'm'], [1, 'M'], [8, 'M'], [7, 'M']], [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], [[0, 'm7'], [5, 'm7'], [3, 'M7'], [8, 'M7']]],
     w1:['雷声', '暗涌', '闪电', '乌云', '暴雨', '低气压', '夜航'], w2:['边缘', '脉冲', '回响', '地平线', '警报', '长夜', '暗流']},
    {id:'haze', name:'烟霾', why:'起烟霾了', minor:false, bpm:.78, tone:.55, dr:.3, rev:1.9, pad:2, tex:'air', dens:[.3, .12, .02], maxLen:8,
     progs:[[[0, 'M7'], [2, 'M'], [0, 'M7'], [2, 'M']], [[2, 'm7'], [0, 'M7'], [2, 'm7'], [0, 'M7']], [[0, 'M7'], [4, 'm7'], [5, 'M7'], [7, '7']], [[9, 'm7'], [5, 'M7'], [0, 'M7'], [7, '7']]],
     w1:['朦胧', '灰黄', '远方的', '橙色', '雾里', '慢镜头', '模糊'], w2:['太阳', '轮廓', '呼吸', '航标', '天际', '低语', '光晕']},
    {id:'overcast', name:'阴天', why:'阴天', minor:false, bpm:.94, tone:.8, dr:.75, rev:1.2, pad:0, tex:'', dens:[.45, .28, .06],
     progs:[[[9, 'm7'], [5, 'M7'], [0, 'M7'], [7, '7']], [[0, 'M7'], [4, 'm7'], [9, 'm7'], [5, 'M7']], [[2, 'm7'], [5, 'M7'], [9, 'm7'], [7, '7']], [[5, 'M7'], [0, 'M7'], [9, 'm7'], [2, 'm7']]],
     w1:['阴天', '灰色', '午后', '云层', '安静的', '没带伞', '发呆'], w2:['电台', '公路', '心事', '窗外', '慢歌', '长街', '等雨']},
    {id:'night', name:'夜色', why:'夜里', minor:true, bpm:.94, tone:.85, dr:.8, rev:1.3, pad:0, tex:'', dens:[.45, .28, .06],
     progs:[[[0, 'm7'], [5, 'm7'], [10, '7'], [3, 'M7']], [[0, 'm7'], [8, 'M7'], [5, 'm7'], [7, '7']], [[0, 'm7'], [3, 'M7'], [8, 'M7'], [7, 'm7']], [[0, 'm7'], [10, 'M7'], [8, 'M7'], [10, '7']]],
     w1:['深夜', '月光', '路灯下', '宿舍楼', '凌晨', '星空', '夜风'], w2:['慢车', '归途', '耳机', '晚安', '空街', '湖面', '微光']},
    {id:'golden', name:'黄昏', why:'黄昏', minor:false, bpm:1, tone:1.15, dr:.95, rev:1.1, pad:0, tex:'',
     progs:[[[0, 'M7'], [5, 'M7'], [9, 'm7'], [7, '7']], [[5, 'M7'], [7, '7'], [0, 'M7'], [9, 'm7']], [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], [[0, 'M7'], [2, 'm7'], [5, 'M7'], [7, '7']]],
     w1:['夕阳', '金色', '傍晚', '晚霞', '橙子', '落日', '暖风'], w2:['海岸', '回家', '操场', '慢跑', '余晖', '车窗', '长堤']}
  ];
  const mixName = (s, m) => m ? MOODS[m].name + TAG[s] : STATIONS[s].name;
  const QL = {m:[0, 3, 7], M:[0, 4, 7], m7:[0, 3, 7, 10], M7:[0, 4, 7, 11], '7':[0, 4, 7, 10]};
  const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SEC_NAME = {intro:'前奏', a:'主歌', b:'副歌', brk:'间奏', drop:'高潮'};
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const section = b => b < 4 ? 'intro' : b < 12 ? 'a' : b < 20 ? 'b' : b < 24 ? 'brk' : 'drop';
  const SEED_MAX = 999999999;
  /* the mood is in the seed: k = q × 100003 + m (m = 1–6, q = 0–9999 → 10 000 songs per mood and station).
     Every other seed is a plain song, exactly as before. Old random seeds land on a mood residue 6 times in 100 003 (0.006 %);
     new plain seeds skip those. So /radio/{uid} = {s, k, t, l}, the rules (database.rules.json) and old favourites stay as they were. */
  const MP = 100003, MQ = 10000;
  const moodOf = k => { const r = k % MP; return r >= 1 && r <= 6 ? r : 0; };
  const hash = k => { let h = Math.imul((k | 0) ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x165667b1); h ^= h >>> 13; return h >>> 0; };
  const newSeed = m => {
    if (m) return Math.floor(Math.random() * MQ) * MP + m;
    let k; do k = 1 + Math.floor(Math.random() * SEED_MAX); while (moodOf(k)); return k;
  };
  /* the next song keeps the station and the mood (listeners chain the same way on their own) */
  const nextSeed = k => {
    const m = moodOf(k);
    if (m){ let q = hash(k) % MQ; if (q * MP + m === k) q = (q + 1) % MQ; return q * MP + m; }
    let n = 1 + hash(k) % SEED_MAX, i = 0; while (moodOf(n) && i++ < 8) n = 1 + hash(n) % SEED_MAX; return n;
  };
  const validSong = (s, k) => (s === 0 || s === 1 || s === 2) && Number.isInteger(k) && k >= 1 && k <= SEED_MAX;

  function motif(R, st){
    const at = new Array(32).fill(null); let deg = 2 + (R() * 3 | 0);
    for (let s = 0; s < 32; s++){
      const p = s % 4 === 0 ? st.dens[0] : s % 2 === 0 ? st.dens[1] : st.dens[2];
      if (R() < p){ deg = Math.max(0, Math.min(7, deg + [-2, -1, -1, 0, 1, 1, 2][R() * 7 | 0])); at[s] = {deg, len:1, s}; }
    }
    const ev = at.filter(Boolean); ev.forEach((e, i) => { e.len = Math.max(1, Math.min(st.maxLen, (i + 1 < ev.length ? ev[i + 1].s : 32) - e.s)); });
    return at;
  }
  /* one song from (station, seed): everything a listener needs to play the same tune */
  const songCache = new Map();
  function songOf(s, k){
    const id = s + ':' + k; let S = songCache.get(id); if (S) return S;
    /* a plain song (m = 0) draws the same random numbers in the same order as before, so it sounds exactly as it did */
    const m = moodOf(k), mo = MOODS[m], st = STATIONS[s], R = rng(k * 7919 + s * 104729);
    const P = mo ? {keys:mo.keys || st.keys, progs:mo.progs, dens:mo.dens || st.dens, maxLen:mo.maxLen || st.maxLen, w1:mo.w1, w2:mo.w2} : st;
    const key = P.keys[R() * P.keys.length | 0];
    let bpm = st.bpm[0] + Math.round(R() * (st.bpm[1] - st.bpm[0])); if (mo) bpm = Math.round(bpm * mo.bpm);
    S = {s, k, m, mo, key, bpm, prog:P.progs[R() * P.progs.length | 0], mA:motif(R, P), mB:motif(R, P),
      title:P.w1[R() * P.w1.length | 0] + P.w2[R() * P.w2.length | 0], sd:60 / bpm / 4};
    S.dur = STEPS * S.sd;
    if (songCache.size > 40) songCache.clear();
    songCache.set(id, S); return S;
  }

  /* ---------- settings ---------- */
  const RD_KEY = 'xmum-radio-v1';
  const R = {on:true, st:0, vol:.8, auto:true, fav:{}, smart:true, md:0,
    seed:0, t0:0, loop:false, playing:false, prev:null, autoOn:false, autoOffT:0, manual:false,
    air:false, airLeft:0, carKind:'', hear:[]};
  try {
    const d = JSON.parse(localStorage.getItem(RD_KEY) || 'null');
    if (d && typeof d === 'object'){
      if (typeof d.on === 'boolean') R.on = d.on;
      if (d.st === 0 || d.st === 1 || d.st === 2) R.st = d.st;
      if (typeof d.vol === 'number' && d.vol >= 0 && d.vol <= 1) R.vol = d.vol;
      if (typeof d.auto === 'boolean') R.auto = d.auto;
      if (typeof d.smart === 'boolean') R.smart = d.smart;         /* older saves have no smart / md: smart mode on, plain songs */
      if (Number.isInteger(d.md) && d.md >= 0 && d.md < MOODS.length) R.md = d.md;
      if (d.fav && typeof d.fav === 'object') for (const c in d.fav){ const f = d.fav[c]; if (f && validSong(f.s, f.k) && /^[a-z0-9]{1,12}$/.test(c)) R.fav[c] = {s:f.s, k:f.k}; }
    }
  } catch(e){}
  const save = () => { try { localStorage.setItem(RD_KEY, JSON.stringify({on:R.on, st:R.st, vol:R.vol, auto:R.auto, smart:R.smart, md:R.md, fav:R.fav})); } catch(e){} };
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };

  /* ---------- audio graph ----------
     every deck: music + drums → tone (low-pass) → compressor → [far away: distance low-pass → distance gain → pan] → out → bus
     bus (local or remote) → master → speakers. master carries soundOn, the user's volume and the duck under game sounds. */
  /* the whole radio at 100% volume. Measured in the game (RMS after this gain, all three stations, verse and drop): .033–.039 at 100%,
     .027–.031 at the default 80%; the engine is .044 idling and up to about .09 flat out, a ding is about .14 (peaks .2+).
     So at 80% the radio sits about 3 dB under an idling engine and well under every prompt sound; turning it up to 100% still stays under the engine. */
  const LEVEL = .22;
  const REMOTE_LEVEL = 1.25;        /* someone else's car at arm's length is a touch louder than your own radio at 100% (the distance curve starts at .75) */
  const lite = () => typeof XQ === 'undefined' ? !!(typeof TOUCH !== 'undefined' && TOUCH) : XQ.tier === 0 || (XQ.touch && XQ.tier < 2);
  let A = null, master = null, localBus = null, remoteBus = null, duckG = null, nbuf = null, analyser = null, revIn = null;
  function graph(){
    if (A) return A;
    if (typeof AC === 'undefined' || !AC) return null;
    A = AC;
    nbuf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate);
    const nd = nbuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    master = A.createGain(); master.gain.value = 0; duckG = A.createGain();
    localBus = A.createGain(); remoteBus = A.createGain(); remoteBus.gain.value = REMOTE_LEVEL;
    analyser = A.createAnalyser(); analyser.fftSize = 64; analyser.smoothingTimeConstant = .75;
    localBus.connect(analyser); localBus.connect(duckG); remoteBus.connect(duckG); duckG.connect(master); master.connect(A.destination);
    return A;
  }
  /* reverb (local deck only, not on the lite tier): one decaying stereo noise impulse, built the first time it is needed */
  function reverb(){
    if (revIn) return revIn;
    const rv = A.createConvolver(), len = Math.floor(A.sampleRate * 2.2), ib = A.createBuffer(2, len, A.sampleRate);
    for (let c = 0; c < 2; c++){ const d = ib.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    rv.buffer = ib; revIn = A.createGain(); revOut = A.createGain(); revOut.gain.value = .55; revIn.connect(rv); rv.connect(revOut);
    revTo = null; revFollow(local);
    return revIn;
  }
  /* there are two local decks (for crossfades); the one reverb returns into whichever is playing now */
  let revOut = null, revTo = null;
  function revFollow(D){ if (!revOut || !D || revTo === D) return; try { revOut.disconnect(); } catch(e){} revOut.connect(D.tone); revTo = D; }

  function makeDeck(remote){
    const D = {remote, song:null, s:0, k:0, t0:0, loop:false, stepN:0, nextT:0, live:false, marks:[], beds:[], rvM:1, dead:false, id:'', fadeEnd:0};
    D.music = A.createGain(); D.drums = A.createGain();
    D.tone = A.createBiquadFilter(); D.tone.type = 'lowpass'; D.tone.frequency.value = 15000; D.tone.Q.value = .5;
    D.comp = A.createDynamicsCompressor(); D.comp.threshold.value = -16; D.comp.ratio.value = 4; D.comp.attack.value = .005; D.comp.release.value = .2;
    D.out = A.createGain(); D.out.gain.value = 0;
    D.music.connect(D.tone); D.drums.connect(D.tone); D.tone.connect(D.comp);
    if (remote){
      D.lp = A.createBiquadFilter(); D.lp.type = 'lowpass'; D.lp.frequency.value = 3000;
      D.dist = A.createGain(); D.dist.gain.value = 0;
      D.comp.connect(D.lp); D.lp.connect(D.dist); D.dist.connect(D.out);
      if (A.createStereoPanner){ D.pan = A.createStereoPanner(); D.out.connect(D.pan); D.pan.connect(remoteBus); } else D.out.connect(remoteBus);
    } else {
      D.comp.connect(D.out); D.out.connect(localBus);
      /* dotted-eighth echo */
      D.dlyIn = A.createGain(); D.dly = A.createDelay(2); const fb = A.createGain(); fb.gain.value = .34; const dOut = A.createGain(); dOut.gain.value = .5;
      const dLP = A.createBiquadFilter(); dLP.type = 'lowpass'; dLP.frequency.value = 3200;
      D.dlyIn.connect(D.dly); D.dly.connect(dLP); dLP.connect(fb); fb.connect(D.dly); dLP.connect(dOut); dOut.connect(D.tone);
    }
    return D;
  }
  function killDeck(D){
    if (D.dead) return; D.dead = true; D.live = false; stopBed(D);
    const t = A.currentTime; D.out.gain.cancelScheduledValues(t); D.out.gain.setTargetAtTime(0, t, .15);
    setTimeout(() => { try { D.out.disconnect(); if (D.pan) D.pan.disconnect(); } catch(e){} }, 1500);
  }

  /* ---------- instruments ---------- */
  function route(D, node, bus, rev, d){
    node.connect(bus);
    if (rev && !D.remote && !lite()){ const s = A.createGain(); s.gain.value = rev * D.rvM; node.connect(s); s.connect(reverb()); }
    if (d && D.dlyIn){ const s = A.createGain(); s.gain.value = d; node.connect(s); s.connect(D.dlyIn); }
  }
  function synth(D, {t, f, dur, wave = 'sawtooth', det = [0], v = .1, a = .01, sus = 1, r = .2, cut = 4000, cutEnd = 0, q = .7, bus = D.music, rev = 0, d = 0, vib = 0}){
    if (det.length > 2 && (D.remote || lite())) det = [det[0], det[det.length - 1]];   /* thinner unison on the cheap tier */
    const end = t + Math.max(dur, a + .01), gn = A.createGain(), fl = A.createBiquadFilter();
    fl.type = 'lowpass'; fl.Q.value = q; fl.frequency.setValueAtTime(cut, t); if (cutEnd) fl.frequency.exponentialRampToValueAtTime(cutEnd, end);
    gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(v, t + a); gn.gain.exponentialRampToValueAtTime(Math.max(v * sus, .0001), end); gn.gain.exponentialRampToValueAtTime(.0001, end + r);
    const stop = end + r + .05, og = A.createGain(); og.gain.value = 1 / Math.sqrt(det.length); og.connect(fl);
    let lg = null;
    if (vib && !D.remote){ const lfo = A.createOscillator(); lfo.frequency.value = 5.4; lg = A.createGain(); lg.gain.value = vib; lfo.connect(lg); lfo.start(t); lfo.stop(stop); }
    for (const dt of det){ const o = A.createOscillator(); o.type = wave; o.frequency.value = f; o.detune.value = dt; if (lg) lg.connect(o.detune); o.connect(og); o.start(t); o.stop(stop); }
    fl.connect(gn); route(D, gn, bus, rev, d);
  }
  function epiano(D, t, f, dur, v){
    const gn = A.createGain(); gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(v, t + .006); gn.gain.exponentialRampToValueAtTime(v * .3, t + dur * .7); gn.gain.exponentialRampToValueAtTime(.0001, t + dur + .5);
    const o1 = A.createOscillator(); o1.type = 'sine'; o1.frequency.value = f; o1.detune.value = (Math.random() - .5) * 10;
    const o2 = A.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = A.createGain(); g2.gain.setValueAtTime(.35, t); g2.gain.exponentialRampToValueAtTime(.01, t + .35);
    o1.connect(gn); o2.connect(g2); g2.connect(gn); const os = [o1, o2];
    if (!D.remote && !lite()){ const o3 = A.createOscillator(); o3.type = 'triangle'; o3.frequency.value = f * 4; const g3 = A.createGain(); g3.gain.setValueAtTime(.08, t); g3.gain.exponentialRampToValueAtTime(.001, t + .12); o3.connect(g3); g3.connect(gn); os.push(o3); }
    for (const o of os){ o.start(t); o.stop(t + dur + .6); }
    route(D, gn, D.music, .3, .08);
  }
  function nz(D, t, type, freq, q, v, decay, bus, rev){
    const s = A.createBufferSource(); s.buffer = nbuf; const f = A.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = A.createGain(); gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.001, t + decay);
    s.connect(f); f.connect(gn); route(D, gn, bus || D.drums, rev || 0, 0); s.start(t, Math.random() * 1.4); s.stop(t + decay + .02);
  }
  function kick(D, t, v = 1, len = .42){
    const o = A.createOscillator(), gn = A.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(43, t + .13);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.001, t + len);
    o.connect(gn); gn.connect(D.drums); o.start(t); o.stop(t + len + .02);
  }
  function snare(D, t, v, rev){
    nz(D, t, 'highpass', 1300, .7, v, .2, D.drums, rev);
    const o = A.createOscillator(), gn = A.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + .08);
    gn.gain.setValueAtTime(v * .6, t); gn.gain.exponentialRampToValueAtTime(.001, t + .11); o.connect(gn); gn.connect(D.drums); o.start(t); o.stop(t + .13);
  }
  const hat = (D, t, v, open) => nz(D, t, 'highpass', 7800, .7, v, open ? .26 : .045);
  function clap(D, t, v){ const n = D.remote || lite() ? 2 : 3; for (let i = 0; i < n; i++) nz(D, t + i * .011, 'bandpass', 1400, 1.1, v, i === n - 1 ? .17 : .02, D.drums, .3); }
  function riser(D, t, dur){
    const s = A.createBufferSource(); s.buffer = nbuf; s.loop = true; const f = A.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7500, t + dur);
    const gn = A.createGain(); gn.gain.setValueAtTime(.001, t); gn.gain.exponentialRampToValueAtTime(.16, t + dur); gn.gain.linearRampToValueAtTime(0, t + dur + .03);
    s.connect(f); f.connect(gn); route(D, gn, D.drums, .3, 0); s.start(t); s.stop(t + dur + .05);
  }
  function duck(D, t, sd){ D.music.gain.setValueAtTime(.28, t); D.music.gain.linearRampToValueAtTime(1, t + sd * 3.2); }
  function staticBurst(D){ const t = A.currentTime; nz(D, t, 'bandpass', 1800, .6, .14, .45); nz(D, t + .05, 'highpass', 4000, .5, .06, .3); }
  /* texture beds under the music (local deck only, they are noise): the Lo-fi station's vinyl hiss, and the mood's texture:
     rain on the windscreen, a low wind in the haze, a slow rumble in a storm. One looping noise source each, so cheap on phones too. */
  function bed(D, type, f, q, v, lfoHz, lfoAmt){
    const s = A.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = A.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = A.createGain(); gn.gain.value = v; s.connect(fl); fl.connect(gn); gn.connect(D.comp); s.start(0, Math.random() * 1.5); D.beds.push(s);
    if (lfoHz){ const o = A.createOscillator(), og = A.createGain(); o.frequency.value = lfoHz; og.gain.value = lfoAmt; o.connect(og); og.connect(lfoAmt < 1 ? gn.gain : fl.frequency); o.start(); D.beds.push(o); }
  }
  function startBed(D){
    stopBed(D); if (D.remote) return;
    if (STATIONS[D.s].id === 'lofi') bed(D, 'bandpass', 3000, .4, .012);
    const tex = D.song && D.song.mo ? D.song.mo.tex : '';
    if (tex === 'rain') bed(D, 'bandpass', 5200, .35, .022, .23, .006);           /* fine rain on the glass, breathing a little */
    else if (tex === 'air') bed(D, 'lowpass', 520, .7, .03, .07, 260);            /* a slow, low wind */
    else if (tex === 'storm') bed(D, 'lowpass', 150, .9, .06, .045, .035);        /* distant rumble, swelling */
  }
  function stopBed(D){ for (const s of D.beds){ try { s.stop(); } catch(e){} } D.beds.length = 0; }
  /* rain on the glass: a tiny high plink now and then (local deck only) */
  function drop(D, t){
    const o = A.createOscillator(), gn = A.createGain(), f = 2300 + Math.random() * 3200, v = .008 + Math.random() * .02;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .82, t + .05);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(.0005, t + .07);
    o.connect(gn); route(D, gn, D.music, .5, 0); o.start(t); o.stop(t + .09);
  }
  /* the mood's pad under any station: storm = low dark saw, haze = airy triangle, rain = soft sine; one chord every two bars */
  function moodPad(D, t, sd, ch){
    const p = D.song.mo.pad, cheap = D.remote || lite();
    const o = p === 1 ? {oct:0, wave:'sawtooth', det:cheap ? [0] : [-9, 9], v:.035, cut:620}
      : p === 2 ? {oct:12, wave:'triangle', det:cheap ? [0] : [-12, 12], v:.045, cut:1500}
      : {oct:12, wave:'sine', det:[0], v:.04, cut:1800};
    for (const m of chordVoice(D, ch, o.oct)) synth(D, {t, f:mf(m), dur:32 * sd - .1, wave:o.wave, det:o.det, v:o.v, a:1.4, sus:.8, r:1.6, cut:o.cut, rev:.6});
  }

  function chordVoice(D, ch, oct, add9){
    let base = D.song.key + ch[0] + oct; if (ch[0] >= 6) base -= 12;
    let iv = QL[ch[1]].slice(); if (add9 && iv.length === 4) iv.push(14);
    if (D.remote || lite()) iv = iv.filter((x, i) => i !== 2);    /* one note fewer: drop the fifth */
    return iv.map(i => base + i);
  }
  function leadNote(D, ch, deg){
    let base = D.song.key + ch[0] + 24; if (ch[0] >= 6) base -= 12;
    const iv = QL[ch[1]], tones = iv.concat(iv.map(x => x + 12), [24]);
    return base + tones[Math.max(0, Math.min(tones.length - 1, deg))];
  }
  function playLead(D, t, bar, s, ch, o){
    const half = bar % 2, m = bar % 8 >= 6 ? D.song.mB : D.song.mA, e = m[half * 16 + s];
    if (!e) return;
    synth(D, Object.assign({t, f:mf(leadNote(D, ch, e.deg)), dur:D.song.sd * e.len * .9}, o));
  }
  const PLAY = {
    wave(D, t, s, sd, bar, sec, ch){
      const root = D.song.key + ch[0] - (ch[0] >= 6 ? 12 : 0), groove = sec !== 'intro' && sec !== 'brk';
      if (s === 0) chordVoice(D, ch, 12).forEach(m => synth(D, {t, f:mf(m), dur:16 * sd - .05, det:[-10, 0, 10], v:.05, a:.35, r:.7, cut:sec === 'drop' ? 2600 : 1500, rev:.35}));
      if (groove){ if (s === 0 || s === 8) kick(D, t, .95); if (s === 4 || s === 12) snare(D, t, .45, .5); }
      if (s % 2 === 0) hat(D, t, sec === 'intro' ? .04 : .08, false); else if (sec === 'drop') hat(D, t, .035, false);
      if (groove && (sec === 'drop' || s % 2 === 0)){
        const oct = sec === 'drop' && s % 2 ? 12 : 0;
        synth(D, {t, f:mf(root - 12 + oct), dur:sd * (sec === 'drop' ? .8 : 1.6), v:.22, a:.004, r:.06, cut:1000, cutEnd:230, q:5});
      }
      if (sec === 'b' || sec === 'drop'){ const v = chordVoice(D, ch, 24), pat = [0, 1, 2, 1, 0, 2, 1, 2]; synth(D, {t, f:mf(v[pat[s % 8] % v.length]), dur:sd * .5, v:.04, a:.003, sus:.2, r:.1, cut:3500, cutEnd:700, d:.3, rev:.15}); }
      if (sec === 'brk' || sec === 'drop') playLead(D, t, bar, s, ch, {det:[-6, 6], v:.065, a:.02, vib:10, cut:3000, d:.4, rev:.3});
    },
    lofi(D, t, s, sd, bar, sec, ch){
      if (s % 2) t += sd * .2;
      const root = D.song.key + ch[0] - (ch[0] >= 6 ? 12 : 0), groove = sec !== 'intro' && sec !== 'brk';
      if (s === 0) chordVoice(D, ch, 12, true).forEach((m, i) => epiano(D, t + i * .03, mf(m), 16 * sd * .9, .06));
      if (s === 10 && sec !== 'intro' && bar % 2) chordVoice(D, ch, 12, true).forEach((m, i) => epiano(D, t + i * .02, mf(m), 5 * sd, .03));
      if (groove){
        if (s === 0) kick(D, t, .75, .32); if (s === 10 || (s === 7 && bar % 4 === 3)) kick(D, t, .5, .28);
        if (s === 4 || s === 12) snare(D, t, .2, .2);
      }
      if (s % 2 === 0 && sec !== 'intro') hat(D, t, .025 + Math.random() * .035, false);
      if (sec !== 'intro'){
        if (s === 0) synth(D, {t, f:mf(root - 12), dur:6 * sd, wave:'sine', v:.34, a:.01, r:.15, cut:700});
        if (s === 10) synth(D, {t, f:mf(root - 12 + (bar % 2 ? 7 : 0)), dur:4 * sd, wave:'sine', v:.28, a:.01, r:.15, cut:700});
      }
      if (sec === 'b' || sec === 'drop' || sec === 'brk') playLead(D, t, bar, s, ch, {wave:'triangle', v:.08, a:.025, vib:7, cut:2400, rev:.35, d:.25});
      if (!D.remote && Math.random() < .2) nz(D, t + Math.random() * sd, 'highpass', 1500, .5, .04 + Math.random() * .08, .006);   /* vinyl crackle */
    },
    edm(D, t, s, sd, bar, sec, ch){
      const root = D.song.key + ch[0] - (ch[0] >= 6 ? 12 : 0);
      if (sec !== 'brk' && s % 4 === 0){ kick(D, t, 1, .36); duck(D, t, sd); }
      if (sec !== 'intro' && sec !== 'brk' && (s === 4 || s === 12)) clap(D, t, .32);
      if (s % 4 === 2) hat(D, t, .09, true); if ((sec === 'b' || sec === 'drop') && s % 2) hat(D, t, .03, false);
      if (sec !== 'intro' && sec !== 'brk' && s % 4 === 2) synth(D, {t, f:mf(root - 12), dur:sd * 1.5, v:.24, a:.004, r:.06, cut:1400, cutEnd:300, q:6});
      if ((sec === 'b' || sec === 'drop') && [0, 3, 6, 10, 13].includes(s)) chordVoice(D, ch, 12).forEach(m => synth(D, {t, f:mf(m), dur:sd * 1.2, det:[-16, -7, 0, 7, 16], v:.04, a:.004, sus:.4, r:.12, cut:5200, cutEnd:1600, rev:.2}));
      if ((sec === 'intro' || sec === 'brk') && s === 0) chordVoice(D, ch, 12).forEach(m => synth(D, {t, f:mf(m), dur:16 * sd, det:[-16, -7, 0, 7, 16], v:.035, a:.5, r:.8, cut:2200, rev:.4}));
      if (bar % 32 === 23 && s === 0) riser(D, t, 16 * sd);
      if (sec === 'brk' || sec === 'drop') playLead(D, t, bar, s, ch, {wave:'square', det:[-5, 5], v:.05, a:.005, cut:4200, d:.3, rev:.2});
    }
  };

  /* ---------- deck clock: a song is (s, k) started at wall time t0 (ms, this computer's clock) ---------- */
  function deckSet(D, s, k, t0, loop){
    D.s = s; D.k = k; D.t0 = t0; D.loop = !!loop;
    let S = songOf(s, k), el = (Date.now() - t0) / 1000, n = 0;
    while (el >= S.dur && n++ < 400){ el -= S.dur; D.t0 += S.dur * 1000; if (!D.loop){ D.k = nextSeed(D.k); S = songOf(s, D.k); } }
    if (el >= S.dur){ el = 0; D.t0 = Date.now(); }
    D.song = S; D.marks.length = 0;
    const now = A.currentTime;
    if (el < 0){ D.stepN = 0; D.nextT = now - el; }
    else { D.stepN = Math.ceil(el / S.sd - 1e-6); D.nextT = now + D.stepN * S.sd - el; }
    if (D.stepN >= STEPS){ D.stepN = 0; }
    const mo = S.mo;
    D.tone.frequency.setTargetAtTime(Math.min(19000, STATIONS[s].tone * (mo ? mo.tone : 1)) * (D.remote ? .6 : 1), now, .1);
    D.music.gain.cancelScheduledValues(now); D.music.gain.setValueAtTime(1, now);
    D.drums.gain.setValueAtTime(mo ? mo.dr : 1, now); D.rvM = mo ? mo.rev : 1;
    if (D.dly) D.dly.delayTime.setValueAtTime(Math.min(1.9, S.sd * 3), now);
    startBed(D);
  }
  function deckTick(D, horizon){
    const now = A.currentTime;
    if (D.nextT < now - .5){ deckSet(D, D.s, D.k, D.t0, D.loop); }   /* fell far behind (the tab stalled): jump back onto the clock */
    while (D.nextT < horizon){
      const S = D.song, sd = S.sd, bar = D.stepN >> 4, s = D.stepN & 15, sec = section(bar % 32), ch = S.prog[bar % 4];
      if (s === 0) D.marks.push({t:D.nextT, bar, sec});
      if (D.nextT >= now - .02){
        PLAY[STATIONS[D.s].id](D, D.nextT, s, sd, bar, sec, ch);
        const mo = S.mo;
        if (mo){
          if (mo.pad && s === 0 && !(bar & 1)) moodPad(D, D.nextT, sd, ch);
          if (mo.tex === 'rain' && !D.remote && Math.random() < (lite() ? .05 : .13)) drop(D, D.nextT + Math.random() * sd);
        }
      }
      D.stepN++; D.nextT += sd;
      if (D.stepN >= STEPS){
        D.stepN = 0; D.t0 += S.dur * 1000;
        if (!D.loop){ D.k = nextSeed(D.k); D.song = songOf(D.s, D.k); if (D.dly) D.dly.delayTime.setValueAtTime(Math.min(1.9, D.song.sd * 3), D.nextT); }
        if (D.onSong) D.onSong(D);
      }
    }
    while (D.marks.length > 1 && D.marks[1].t <= now) D.marks.shift();
  }
  function deckFade(D, on, tc){ const t = A.currentTime; D.out.gain.cancelScheduledValues(t); D.out.gain.setTargetAtTime(on ? 1 : 0, t, tc || .12); }

  /* ---------- the local radio ---------- */
  let local = null, spare = null, sched = 0;     /* spare = the other local deck, fading out after a crossfade */
  const localNow = () => local && local.live;
  function startScheduler(){ if (!sched) sched = setInterval(tickAll, 25); }
  function tickAll(){
    if (!A) return;
    const h = A.currentTime + .15; let any = false;
    if (local && local.live){ deckTick(local, h); any = true; }
    if (spare && spare.live){ if (A.currentTime > spare.fadeEnd){ spare.live = false; stopBed(spare); } else { deckTick(spare, h); any = true; } }
    for (const D of remoteDecks.values()) if (D.live){ deckTick(D, h); any = true; }
    if (!any){ clearInterval(sched); sched = 0; }
  }
  function ensureLocal(){
    if (!graph()) return null;
    if (!local){ local = makeDeck(false); local.onSong = onLocalSong; }
    return local;
  }
  function onLocalSong(D){
    if (D !== local) return;
    R.seed = local.k; R.t0 = local.t0;
    if (smartAtBoundary()) return;        /* smart mode changes the music here, at the end of a song */
    hud(); publish();
  }
  /* (re)start what the radio should be playing now: R.st / R.seed / R.t0 / R.loop */
  function playLocal(fresh){
    const D = ensureLocal(); if (!D) return;
    deckSet(D, R.st, R.seed, R.t0, R.loop); R.seed = D.k; R.t0 = D.t0;
    if (!D.live){ D.live = true; deckFade(D, true, .25); }
    if (fresh) staticBurst(D);
    startScheduler(); hud(); publish();
  }
  function stopLocal(){
    if (local && local.live){ local.live = false; deckFade(local, false, .3); stopBed(local); }
    if (spare && spare.live){ spare.live = false; deckFade(spare, false, .2); stopBed(spare); }
    publish();
  }
  /* a new song on station s (or a given seed; m = mood, default: the mood playing now), starting right now with a burst of static */
  function tune(s, seed, loop, m){
    R.st = s; R.seed = seed || newSeed(m === undefined ? moodOf(R.seed) : m); R.t0 = Date.now() + 120; R.loop = !!loop;
    save(); if (localNow()) playLocal(true); else hud();
  }
  /* crossfade to a new song (s, k) on the other local deck: the new one fades in over ~2 s while the old one keeps playing and fades out.
     t0 = when the new song starts (wall ms); at a song boundary that is the moment the old song ended */
  function crossTo(s, k, t0){
    R.st = s; R.seed = k; R.t0 = t0; R.loop = false;
    if (!localNow()){ hud(); return; }
    const old = local;
    if (!spare){ spare = makeDeck(false); spare.onSong = onLocalSong; }
    if (spare.live){ spare.live = false; stopBed(spare); deckFade(spare, false, .05); }
    local = spare; spare = old;
    deckSet(local, s, k, t0, false); R.seed = local.k; R.t0 = local.t0;
    local.live = true; local.out.gain.cancelScheduledValues(A.currentTime); local.out.gain.setValueAtTime(0, A.currentTime); deckFade(local, true, .55);
    old.fadeEnd = A.currentTime + 3.2; deckFade(old, false, .7);
    revFollow(local);
    startScheduler(); hud(); publish();
  }

  /* ---------- what is going on in the game ---------- */
  const inCar = () => typeof mode !== 'undefined' && mode === 'naiwa' && typeof driving !== 'undefined' && !!driving;
  const blockedNow = () => g(() => indoorNow(), false) || g(() => XMini.inside || !!XMini.active, false) || g(() => gx.paused, false) || document.hidden
    || g(() => document.body.classList.contains('wd-open') || document.body.classList.contains('titled'), false)
    || (!!window.XCineAudio && document.body.classList.contains('cine'));   /* a cutscene with its own music (js/89-cine-audio.js, when it is there): fade out, no two songs at once */
  const racing = () => g(() => RC.st !== 'idle', false);
  const wanted = () => g(() => heat >= 1, false);
  const listenerPos = () => g(() => mode === 'naiwa' ? (driving || nw) : mode === 'walk' ? player : null, null);

  /* ---------- duck under the game's own sounds (dings, horn, crashes) ---------- */
  let duckUntil = 0;
  function duckNow(){
    if (!A || !duckG) return;
    const t = A.currentTime;
    if (t < duckUntil - .3) return;
    duckUntil = t + .4; duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(.55, t, .02); duckG.gain.setTargetAtTime(1, t + .25, .15);
  }
  for (const name of ['tone', 'noise']){
    const f = window[name];
    if (typeof f === 'function') window[name] = function(){ if (soundOn && R.playing) duckNow(); return f.apply(this, arguments); };
  }
  /* (function declarations in other classic scripts are writable globals: sfx.* look tone / noise up by name, so they get the wrapped ones) */

  /* ---------- broadcasting: paid per minute, others within 40 m hear it ---------- */
  const AIR_FEE = .5, AIR_SEC = 60, HEAR_R = 40;
  function airSet(on){
    if (on === R.air) return;
    if (on){
      if (R.airLeft <= 0){
        if (!(g(() => money, 0) >= AIR_FEE)){ g(() => toast('钱不够开外放', `外放每分钟 RM ${AIR_FEE.toFixed(2)}，自己听是免费的`, 2200)); hud(); return; }
        money -= AIR_FEE; g(() => moneyChanged()); R.airLeft = AIR_SEC;
      }
      R.air = true;
      g(() => toast('外放打开了', `每分钟 RM ${AIR_FEE.toFixed(2)} · ${HEAR_R} 米内的人都听得到${online() ? '' : '（离线：只有本机开的其他窗口听得到）'}`, 2200));
    } else R.air = false;
    hud(); publish();
  }
  function airTick(dt){
    if (!R.air || !localNow()) return;
    R.airLeft -= dt;
    if (R.airLeft > 0) return;
    if (g(() => money, 0) >= AIR_FEE){ money -= AIR_FEE; g(() => moneyChanged()); R.airLeft += AIR_SEC; }
    else { R.air = false; R.airLeft = 0; g(() => toast('外放关了', '钱不够下一分钟了，电台照常自己听', 2200)); hud(); publish(); }
  }

  /* ---------- transport: Firebase /radio when online, BroadcastChannel between windows when offline ---------- */
  const online = () => g(() => XNet.online, false);
  const srvOff = () => g(() => typeof XNet.now === 'function' ? XNet.now() - Date.now() : 0, 0);
  const peers = new Map();          /* id -> {s, k, t (local ms), l, x?, z?, seen, name?} */
  let fbRef = null, lastPub = '';
  const myId = 'w' + Math.random().toString(36).slice(2, 10);
  let bc = null;
  try { if (window.BroadcastChannel) bc = new BroadcastChannel('xmum-radio:' + location.pathname); } catch(e){ bc = null; }
  function pubData(){
    if (!R.air || !localNow() || !local) return null;
    return {s:local.s, k:local.k, t:Math.round(local.t0 + srvOff()), l:local.loop};
  }
  function publish(){
    const d = pubData(), key = d ? JSON.stringify(d) : '';
    if (online()){
      if (!fbRef || key === lastPub) return;
      lastPub = key;
      (d ? fbRef.set(d) : fbRef.remove()).catch(e => console.warn('[XRadio] /radio 写入失败（规则还没发布？）', e));
    } else lastPub = key;
  }
  /* offline: post where we are and what plays, five times a second, while broadcasting */
  let bcT = 0;
  function bcTick(dt){
    if (!bc || online()) return;
    bcT -= dt; if (bcT > 0) return; bcT = .2;
    const d = pubData(), p = listenerPos();
    if (d && p) bc.postMessage(Object.assign({id:myId, x:p.x, z:p.z, name:g(() => XUI.playerName(), '') || '另一个窗口'}, d));
    else if (lastBc) bc.postMessage({id:myId, off:true});
    lastBc = !!d;
  }
  let lastBc = false;
  if (bc) bc.onmessage = e => {
    const m = e.data; if (!m || typeof m !== 'object' || m.id === myId || online()) return;
    if (m.off){ peers.delete(m.id); return; }
    if (!validSong(m.s, m.k) || !isFinite(m.t) || !isFinite(m.x) || !isFinite(m.z)) return;
    peers.set(m.id, {s:m.s, k:m.k, t:m.t, l:!!m.l, x:m.x, z:m.z, seen:performance.now(), name:String(m.name || '').slice(0, 16)});
  };
  window.addEventListener('pagehide', () => { if (bc) bc.postMessage({id:myId, off:true}); if (fbRef) fbRef.remove().catch(() => {}); });
  /* js/net.js loads after this file: wait for XNet, then for it to connect */
  const hookNet = (n = 0) => { if (window.XNet && XNet.ready) XNet.ready.then(netUp); else if (n < 60) setTimeout(() => hookNet(n + 1), 250); };
  setTimeout(hookNet, 0);
  /* 只听附近开着车的人的 /radio/{uid}（以前监听整个 /radio）：XNet.peers() 本来就只有附近几格的人，再限 150 米内 */
  const LISTEN_R = 150;
  const netUp = ok => g(() => {
    if (!ok || !XNet.online || !window.firebase || !firebase.database) return;
    const db = firebase.database(), subs = new Map();   /* uid -> [ref, cb] */
    fbRef = db.ref('radio/' + XNet.uid);
    db.ref('.info/connected').on('value', s => { if (s.val()){ fbRef.onDisconnect().remove().catch(() => {}); lastPub = null; publish(); } });
    const put = s => {
      const v = s.val(); if (s.key === XNet.uid) return;
      if (!v || typeof v !== 'object' || !validSong(v.s, v.k) || typeof v.t !== 'number'){ peers.delete(s.key); return; }
      peers.set(s.key, {s:v.s, k:v.k, t:v.t - srvOff(), l:v.l === true, fb:true});
    };
    setInterval(() => g(() => {
      const want = new Set(), me = online() ? listenerPos() : null;
      if (me) for (const uid of XNet.peers().keys()){
        const q = XNet.peer(uid);
        if (q && q.fresh && q.car && Math.hypot(q.x - me.x, q.z - me.z) < LISTEN_R) want.add(uid);
      }
      for (const [uid, S] of subs) if (!want.has(uid)){ S[0].off('value', S[1]); subs.delete(uid); peers.delete(uid); }
      for (const uid of want) if (!subs.has(uid)){ const ref = db.ref('radio/' + uid); subs.set(uid, [ref, ref.on('value', put, () => {})]); }
    }), 1000);
  });

  /* ---------- hearing other cars ---------- */
  const remoteDecks = new Map();    /* id -> deck */
  let pickT = 0;
  function peerPos(id, P){
    if (P.fb){
      const q = g(() => XNet.peer(id), null);
      if (!q || !q.fresh || !q.car) return null;
      P.name = q.name; return q;
    }
    return performance.now() - P.seen < 1500 ? P : null;
  }
  function remoteTick(dt, canHear){
    const me = listenerPos(), max = lite() ? 1 : 2;
    pickT -= dt;
    if (pickT <= 0){
      pickT = .25;
      const list = [];
      if (canHear && me) for (const [id, P] of peers){
        const q = peerPos(id, P); if (!q) continue;
        const d = Math.hypot(q.x - me.x, q.z - me.z);
        if (d < HEAR_R) list.push([d, id]);
      }
      list.sort((a, b) => a[0] - b[0]);
      const keep = new Set(list.slice(0, max).map(e => e[1]));
      for (const [id, D] of remoteDecks) if (!keep.has(id)){ killDeck(D); remoteDecks.delete(id); }
      if (keep.size && graph()) for (const id of keep){
        const P = peers.get(id); let D = remoteDecks.get(id);
        if (!D){ D = makeDeck(true); D.id = id; remoteDecks.set(id, D); deckSet(D, P.s, P.k, P.t, P.l); D.live = true; deckFade(D, true, .4); startScheduler(); }
        else if (D.src !== P.s + ':' + P.k + ':' + P.t + ':' + P.l){
          /* the owner republishes at every song change; this deck has usually chained to the same song already, so leave it playing */
          if (!(D.s === P.s && D.k === P.k && D.loop === P.l && Math.abs(D.t0 - P.t) < 120)) deckSet(D, P.s, P.k, P.t, P.l);
        }
        D.src = P.s + ':' + P.k + ':' + P.t + ':' + P.l;
      }
      R.hear = [...remoteDecks.keys()].map(id => { const P = peers.get(id); const S = P && songOf(P.s, remoteDecks.get(id).k); return P ? {name:P.name || '附近的车', s:P.s, m:S.m, title:S.title} : null; }).filter(Boolean);
    }
    /* distance: quieter and duller with distance, nothing past 40 m; pan follows the direction from the camera */
    if (!remoteDecks.size || !me) return;
    const t = A.currentTime, cy = g(() => { const v = new THREE.Vector3(); camera.getWorldDirection(v); return Math.atan2(v.x, v.z); }, 0);
    for (const [id, D] of remoteDecks){
      const P = peers.get(id), q = P && peerPos(id, P); if (!q) continue;
      const d = Math.hypot(q.x - me.x, q.z - me.z);
      const gain = d >= HEAR_R ? 0 : .75 / (1 + d / 7) * (1 - Math.max(0, d - 32) / 8);
      const lp = Math.max(450, 7000 * Math.exp(-d / 14));
      D.dist.gain.setTargetAtTime(gain, t, .12); D.lp.frequency.setTargetAtTime(lp, t, .12);
      if (D.pan){ const a = Math.atan2(q.x - me.x, q.z - me.z) - cy; D.pan.pan.setTargetAtTime(-Math.sin(a) * .6 * Math.min(1, d / 6), t, .12); }
    }
  }

  /* ---------- auto EDM for races and chases ---------- */
  function autoTick(dt){
    const want = R.auto && R.on && (racing() || wanted());
    if (want){
      R.autoOffT = 0;
      if (!R.autoOn){
        R.autoOn = true; R.manual = false; SM.showT = 0;
        if (R.st !== EDM || moodOf(R.seed)){ R.prev = {st:R.st, seed:R.seed, loop:R.loop}; tune(EDM, 0, false, 0); g(() => toast('📻 赛道 EDM', racing() ? '比赛开始，电台切到赛道 EDM' : '保安追上来了，电台切到赛道 EDM', 1400)); }
        else R.prev = null;
      }
    } else if (R.autoOn){
      R.autoOffT += dt;
      if (R.autoOffT > 3){
        R.autoOn = false;
        const p = R.prev; R.prev = null;
        if (p && !R.manual && R.on){
          if (R.smart && !p.loop){ smartTick(true); smartSwitch(SM.want, Date.now() + 150); }    /* back to whatever fits now, crossfaded */
          else tune(p.st, p.loop ? p.seed : 0, p.loop, moodOf(p.seed));
        }
      }
    }
  }

  /* ---------- 智能选歌: pick the station and the mood from the weather, the time, the speed and where you are ----------
     The rules (in order):
       racing / chased (auto EDM above)          → 赛道 EDM at once, with static: the only urgent change
       storm                                     → 雷雨 霓虹 (dark synth)
       shower / haze / overcast                  → 雨天 / 烟霾 / 阴天 Lo-fi; flat out → the same mood on 霓虹
       clear: golden hour 17:00–19:35, 6:20–7:20 → 黄昏, night 19:35–6:20 → 夜色, else plain
              on campus → Lo-fi, off campus or flat out → 霓虹; plain daytime flat out off campus → 赛道 EDM
     No flip-flop: speed is smoothed over ~3 s with two thresholds (fast above 86 km/h, back below 61 km/h), the campus edge has
     a 25 m margin, a new pick has to hold for 8 s, and the change itself waits for the end of the song (crossfaded), at least 40 s
     after the last one. While a song loops, or the player chose a station or mood by hand (smart mode turns off), nothing changes. */
  const SM = {spd:0, fast:false, campus:true, cand:-1, candT:0, want:-1, cause:0, wantCause:0, lastSw:-1e9, tickT:0, showT:0, key:-1, line:''};
  const W_IDX = {shower:1, storm:2, haze:3, overcast:4};
  const W_WHY = ['', '下雨了', '雷阵雨', '起烟霾了', '阴天'], T_WHY = ['白天', '黄昏', '夜里'];
  const cur = () => R.st * 8 + moodOf(R.seed);
  function smartPick(){
    const w = (window.XWeather && W_IDX[XWeather.type]) || 0, h = window.XClock ? XClock.hour() : 12;
    const t = (h >= 17 && h < 19.6) || (h >= 6.33 && h < 7.33) ? 1 : (h >= 19.6 || h < 6.33) ? 2 : 0;
    const fast = SM.fast, campus = SM.campus;
    let s, m;
    if (w === 2){ s = 0; m = 2; }
    else if (w){ m = w === 1 ? 1 : w === 3 ? 3 : 4; s = fast ? 0 : 1; }
    else { m = t === 1 ? 6 : t === 2 ? 5 : 0; s = fast ? (m === 0 && !campus ? EDM : 0) : campus ? 1 : 0; }
    SM.cause = w | t << 3 | (campus ? 32 : 0) | (fast ? 64 : 0);
    return s * 8 + m;
  }
  /* 10 times a second in the car: just smooth the speed (no closures here: this runs all the time) */
  function smartRead(dt){
    const v = driving ? Math.hypot(driving.vx, driving.vz) || 0 : 0;
    SM.spd += (v - SM.spd) * Math.min(1, dt / 3);
    if (SM.fast ? SM.spd < 17 : SM.spd > 24) SM.fast = !SM.fast;
  }
  /* once a second (or now, when forced): where are we, what fits, has it held long enough */
  function smartTick(force){
    const p = driving;
    if (p && typeof CAMPUS_R !== 'undefined'){ const e = SM.campus ? 25 : -25; SM.campus = p.x > CAMPUS_R.x0 - e && p.x < CAMPUS_R.x1 + e && p.z > CAMPUS_R.z0 - e && p.z < CAMPUS_R.z1 + e; }
    const c = smartPick();
    if (c !== SM.cand){ SM.cand = c; SM.candT = 0; } else SM.candT++;
    if (force || SM.want < 0 || SM.candT >= 8 || (c === SM.want)){ SM.want = c; SM.wantCause = SM.cause; }
    smartLine();
  }
  /* at the end of a song (called from onLocalSong): change now if the pick differs */
  function smartAtBoundary(){
    if (!R.smart || R.loop || R.autoOn || !R.on || SM.want < 0 || SM.want === cur()) return false;
    if (performance.now() / 1000 - SM.lastSw < 40) return false;
    smartSwitch(SM.want, local.t0); return true;
  }
  function smartSwitch(c, t0){
    if (c < 0) return;
    SM.lastSw = performance.now() / 1000;
    crossTo(c >> 3, newSeed(c & 7), t0);
    SM.showT = 4.5; smartLine(); hud(); flash();
  }
  /* the line the panel shows (and the strip for a few seconds after a change), e.g. 「下雨了 · 雨天 Lo-fi」; rebuilt only when something changed */
  function smartLine(){
    const st = !R.smart ? 1 : R.autoOn ? 2 : R.loop ? 3 : 0;
    const key = ((st * 64 + SM.want) * 128 + SM.wantCause) * 64 + cur() + (st === 2 && racing() ? 1 << 24 : 0);
    if (key === SM.key) return SM.line;
    SM.key = key;
    if (st === 1) SM.line = '智能选歌关着 · 手动选台';
    else if (st === 2) SM.line = (racing() ? '比赛中' : '被保安追') + ' · 赛道 EDM';
    else if (st === 3) SM.line = '单曲循环中 · 智能选歌先不换';
    else if (SM.want < 0) SM.line = '智能选歌';
    else {
      const k = SM.wantCause, w = k & 7, t = k >> 3 & 3, fast = !!(k & 64), name = mixName(SM.want >> 3, SM.want & 7);
      const why = w ? W_WHY[w] + (fast ? ' · 开得正快' : '') : T_WHY[t] + (fast ? ' · 开得正快' : k & 32 ? ' · 在校园里' : ' · 出了校门');
      SM.line = why + ' · ' + name + (SM.want === cur() ? '' : '（这首放完换）');
    }
    if (!panel.hidden) $r('rdWhy').textContent = SM.line;
    return SM.line;
  }
  function setSmart(on){
    R.smart = !!on; save();
    if (on && inCar()){
      smartTick(true);
      if (R.on && !R.autoOn){ R.loop = false; if (local) local.loop = false; if (SM.want !== cur()){ if (localNow()) smartSwitch(SM.want, Date.now() + 150); else { R.st = SM.want >> 3; R.seed = newSeed(SM.want & 7); R.t0 = Date.now() + 300; } } }
    }
    smartLine(); hud();
  }

  /* ---------- per frame (10 times a second is plenty) ---------- */
  let lastT = performance.now(), wasCar = false, wasSound = true;
  function frame(){
    const now = performance.now(), dt = Math.min(.5, (now - lastT) / 1000); lastT = now;
    const car = inCar();
    if (car && !wasCar) enterCarRadio();
    if (!car && wasCar) leaveCarRadio();
    wasCar = car;
    if (car){ smartRead(dt); SM.tickT -= dt; if (SM.tickT <= 0){ SM.tickT = 1; smartTick(false); } } else SM.spd = 0;
    const want = car && R.on && !blockedNow() && soundOn && !!(typeof AC !== 'undefined' && AC);
    if (want && !localNow()){
      if (graph()){
        /* coming back (out of a building, a mini game, a cutscene…): smart mode starts straight on what fits now */
        if (R.smart && !R.loop && !R.autoOn && SM.want >= 0 && SM.want !== cur()){ R.st = SM.want >> 3; R.seed = newSeed(SM.want & 7); R.t0 = Date.now() + 300; R.loop = false; }
        R.playing = true; playLocal(false);
      }
    }
    else if (!want && localNow()){ R.playing = car && R.on; stopLocal(); }
    if (car) autoTick(dt);
    airTick(dt); bcTick(dt);
    const canHear = !blockedNow() && soundOn && (mode === 'naiwa' || mode === 'walk');
    if (A || (canHear && peers.size && typeof AC !== 'undefined' && AC)) remoteTick(dt, canHear);   /* on foot without having driven yet: the graph is built when someone's broadcast is in range */
    if (A && master){
      const audible = soundOn && !document.hidden;
      /* a touch louder at speed, like a real car's speed-dependent volume: +0 at 30 km/h, up to +22 % (+1.7 dB) from 110 km/h,
         where the engine is about 6 dB louder than idling */
      const sp = Math.max(0, Math.min(1, (SM.spd - 8) / 22));
      master.gain.setTargetAtTime(audible ? LEVEL * R.vol * (1 + .22 * sp) : 0, A.currentTime, audible ? .3 : .03);
      if (soundOn !== wasSound){ wasSound = soundOn; }
    }
    hudTick(car);
  }
  setInterval(frame, 100);
  document.addEventListener('visibilitychange', () => { if (document.hidden){ frame(); for (const [id, D] of remoteDecks){ killDeck(D); remoteDecks.delete(id); } } });

  function enterCarRadio(){
    R.carKind = g(() => String(driving.kind || ''), '');
    const f = R.fav[R.carKind];
    SM.spd = g(() => Math.hypot(driving.vx, driving.vz), 0) || 0; SM.fast = SM.spd > 24; SM.campus = true; SM.cand = SM.want = -1; SM.lastSw = -1e9; SM.tickT = 1;
    smartTick(true);
    if (f){ R.st = f.s; R.seed = f.k; R.t0 = Date.now() + 400; R.loop = true; }
    else if (R.smart){ R.st = SM.want >> 3; R.seed = newSeed(SM.want & 7); R.t0 = Date.now() + 400; R.loop = false; SM.showT = 4.5; }
    else { R.seed = newSeed(R.md); R.t0 = Date.now() + 400; R.loop = false; }
    R.autoOn = false; R.prev = null; R.playing = R.on;
    smartLine();
    hud();
    if (R.on && f) g(() => toast('📻 ' + STATIONS[f.s].name, `接着放收藏的「${songOf(f.s, f.k).title}」`, 1600));
  }
  function leaveCarRadio(){
    R.playing = false; panelOpen(false);
    if (R.air){ R.air = false; publish(); }
    if (R.autoOn && R.prev){ R.st = R.prev.st; }
    R.autoOn = false; R.prev = null;
    save(); hud();
  }

  /* ---------- controls ---------- */
  /* M / the 电台 button: 霓虹夜驾 → 芙蓉湖 Lo-fi → 赛道 EDM → 关 → 霓虹夜驾 … */
  function cycle(){
    if (!inCar()) return;
    g(() => ac());
    if (!R.on){ R.on = true; R.playing = true; tune(0); save(); flash(); return; }
    if (R.st === STATIONS.length - 1){ setPower(false); flash(); return; }
    if (R.autoOn) R.manual = true;
    R.smart = false; tune(R.st + 1); flash(); smartLine();
  }
  function setPower(on){
    R.on = on; save();
    if (!on){ if (R.air) airSet(false); R.playing = false; stopLocal(); }
    else { R.playing = true; if (!R.seed) tune(R.st); }
    hud();
  }
  /* choosing a station or a mood by hand turns smart mode off (the toggle in the panel turns it back on) */
  function pick(s){ g(() => ac()); if (R.autoOn) R.manual = true; if (!R.on){ R.on = true; R.playing = true; } R.smart = false; R.md = moodOf(R.seed); tune(s, 0, false, R.md); smartLine(); hud(); }
  function pickMood(m){ g(() => ac()); if (R.autoOn) R.manual = true; if (!R.on){ R.on = true; R.playing = true; } R.smart = false; R.md = m; tune(R.st, 0, false, m); smartLine(); hud(); }
  /* 下一首 keeps smart mode on; if smart mode wants something else by now, the next song is that */
  function next(){
    g(() => ac()); if (!R.on) return pick(R.st); if (R.autoOn) R.manual = true;
    if (R.smart && !R.autoOn && SM.want >= 0){ SM.lastSw = performance.now() / 1000; tune(SM.want >> 3, 0, false, SM.want & 7); }
    else tune(R.st, 0, false);
    smartLine(); hud();
  }
  function setLoop(on){
    R.loop = on;
    if (local && local.live){ local.loop = on; R.seed = local.k; R.t0 = local.t0; }
    hud(); publish();
  }
  function toggleFav(){
    const c = R.carKind; if (!c || !R.seed) return;
    const f = R.fav[c];
    if (f && f.s === R.st && f.k === R.seed){ delete R.fav[c]; g(() => toast('取消收藏', '这辆车下次上车随机放', 1400)); }
    else { R.fav[c] = {s:R.st, k:R.seed}; if (!R.loop) setLoop(true); g(() => toast('★ 收藏到这辆车', `下次坐进这辆车接着放「${songOf(R.st, R.seed).title}」`, 1800)); }
    save(); hud();
  }

  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Escape' && !panel.hidden){ e.stopImmediatePropagation(); e.preventDefault(); panelOpen(false); }
  }, true);

  /* ---------- HUD: a small head unit strip; tap it for the panel ---------- */
  const hudEl = document.createElement('div'); hudEl.id = 'radio'; hudEl.hidden = true;
  hudEl.innerHTML = `<button type="button" class="rd-strip" id="rdStrip" aria-expanded="false" aria-controls="rdPanel" aria-label="车载电台，点开设置">
      <span class="rd-fq"><small>FM</small><b id="rdFq">88.6</b></span>
      <span class="rd-txt"><b id="rdSt">霓虹夜驾</b><span id="rdTr">—</span></span>
      <canvas id="rdViz" width="48" height="24" aria-hidden="true"></canvas>
      <span class="rd-tags"><i id="rdSmTag" hidden title="智能选歌">✨</i><i id="rdLoopTag" hidden title="单曲循环">🔁</i><i id="rdAirTag" hidden title="外放中">📢</i></span>
    </button>
    <div class="rd-hear" id="rdHear" hidden></div>`;
  const panel = document.createElement('div'); panel.id = 'rdPanel'; panel.className = 'rd-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '车载电台');
  panel.innerHTML = `<div class="rd-ph"><b>车载电台</b><button type="button" class="rd-x" id="rdX" aria-label="收起">×</button></div>
    <div class="rd-presets" role="group" aria-label="选台">${STATIONS.map((s, i) => `<button type="button" class="rd-pre" data-i="${i}" style="--pc:${s.acc}" aria-pressed="false"><small>${s.freq}</small><b>${s.name}</b></button>`).join('')}</div>
    <div class="rd-smart">
      <label class="rd-chk"><input type="checkbox" id="rdSmart"><span><b>✨ 智能选歌</b> 按天气、时间、车速、地点自动选，一首放完再换</span></label>
      <div class="rd-why" id="rdWhy" aria-live="polite"></div>
    </div>
    <div class="rd-moods" role="group" aria-label="曲风（天气版）">${MOODS.map((m, i) => `<button type="button" class="rd-md" data-m="${i}" aria-pressed="false">${m ? m.name : '原味'}</button>`).join('')}</div>
    <div class="rd-now"><span id="rdNow">—</span><span id="rdSec"></span></div>
    <div class="rd-row">
      <button type="button" class="rd-btn" id="rdNext">下一首 ⏭</button>
      <button type="button" class="rd-btn" id="rdLoop" aria-pressed="false">🔁 单曲循环</button>
      <button type="button" class="rd-btn" id="rdFav" aria-pressed="false">☆ 收藏到这辆车</button>
    </div>
    <div class="rd-air">
      <button type="button" class="rd-btn rd-airbtn" id="rdAir" aria-pressed="false">📢 外放</button>
      <span id="rdAirTxt">自己听免费。外放每分钟 RM ${AIR_FEE.toFixed(2)}，${HEAR_R} 米内的人按距离听到</span>
    </div>
    <label class="rd-vol"><span>音量</span><input type="range" id="rdVol" min="0" max="100" step="5"><output id="rdVolOut"></output></label>
    <label class="rd-chk"><input type="checkbox" id="rdAuto"><span>竞速和被保安追时自动切到赛道 EDM</span></label>
    <div class="rd-row"><button type="button" class="rd-btn rd-off" id="rdPow">⏻ 关电台</button></div>`;
  document.body.appendChild(hudEl); document.body.appendChild(panel);
  const $r = id => document.getElementById(id);
  /* the old 电台 button of the button bar: no longer shown (the strip's panel does everything); kept detached so the code that updates it stays simple */
  const actBtn = document.createElement('button'); actBtn.type = 'button'; actBtn.id = 'act-m'; actBtn.hidden = true;
  actBtn.innerHTML = '<b>电台</b>'; actBtn.setAttribute('aria-label', '电台：换台，换到最后一个是关');
  actBtn.addEventListener('pointerdown', e => { e.preventDefault(); cycle(); });
  actBtn.addEventListener('contextmenu', e => e.preventDefault());

  /* the panel is used while driving: opened with a tap or a click it leaves the keyboard on the game (WASD / arrows / space keep
     driving the car) and only a keyboard user (Enter / Space on the strip) is moved into it */
  const backToGame = () => g(() => { const a = document.activeElement; if (a && (panel.contains(a) || hudEl.contains(a))) canvas.focus({preventScroll:true}); });
  function panelOpen(on, kb){
    if (on && !inCar()) return;
    panel.hidden = !on; $r('rdStrip').setAttribute('aria-expanded', String(on));
    if (on){ hud(); topY = -1; hudTick(true); if (kb){ const b = panel.querySelector('.rd-pre[aria-pressed="true"]') || $r('rdX'); b.focus({preventScroll:true}); } else backToGame(); }
    else backToGame();
  }
  $r('rdStrip').addEventListener('click', e => { g(() => ac()); panelOpen(panel.hidden, e.detail === 0); });
  $r('rdX').addEventListener('click', () => panelOpen(false));
  panel.querySelectorAll('.rd-pre').forEach(b => b.addEventListener('click', () => pick(+b.dataset.i)));
  $r('rdNext').addEventListener('click', next);
  $r('rdLoop').addEventListener('click', () => setLoop(!R.loop));
  $r('rdFav').addEventListener('click', toggleFav);
  $r('rdAir').addEventListener('click', () => { g(() => ac()); if (!R.on) setPower(true); airSet(!R.air); });
  $r('rdPow').addEventListener('click', () => setPower(!R.on));
  $r('rdVol').addEventListener('input', e => { R.vol = Math.max(0, Math.min(1, e.target.value / 100)); $r('rdVolOut').textContent = Math.round(R.vol * 100) + '%'; save(); });
  $r('rdAuto').addEventListener('change', e => { R.auto = e.target.checked; save(); });
  $r('rdSmart').addEventListener('change', e => { g(() => ac()); setSmart(e.target.checked); });
  panel.querySelectorAll('.rd-md').forEach(b => b.addEventListener('click', () => pickMood(+b.dataset.m)));
  /* a tap or click on a panel control hands the keyboard straight back to the car (a slider or checkbox would otherwise keep
     the arrows / space); a keyboard user keeps focus. Only the volume slider and checkboxes hold their own keys */
  panel.addEventListener('pointerup', () => setTimeout(backToGame, 0));
  panel.addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' && e.code !== 'Escape' && e.code !== 'Tab') e.stopPropagation(); });
  /* driving with the panel open: the stick, the action buttons and the 3D view (camera drag) don't close it; × , the strip,
     Esc, getting out of the car or any other button / panel does */
  const DRIVE_UI = '#joy,#acts,#c';
  document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target) && !hudEl.contains(e.target) && e.target !== actBtn && !actBtn.contains(e.target) && !(e.target.closest && e.target.closest(DRIVE_UI))) panelOpen(false); }, true);

  let flashT = 0;
  function flash(){ flashT = 1.6; hudEl.classList.add('rd-flash'); }
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function hud(){
    const st = STATIONS[R.st], S = R.seed ? songOf(R.st, R.seed) : null, md = S ? S.m : 0;
    hudEl.style.setProperty('--rd', R.on ? st.acc : '#8a93a3'); panel.style.setProperty('--rd', st.acc);
    $r('rdFq').textContent = R.on ? st.freq : 'OFF';
    $r('rdSt').textContent = R.on ? mixName(R.st, md) : '电台关了';
    $r('rdTr').textContent = !R.on ? '点这里打开' : SM.showT > 0 && R.smart && !R.autoOn ? '✨ ' + smartLine() : S ? '♪ ' + S.title + ' #' + String(S.k % 1000).padStart(3, '0') : '—';
    $r('rdLoopTag').hidden = !(R.on && R.loop); $r('rdAirTag').hidden = !(R.on && R.air); $r('rdSmTag').hidden = !(R.on && R.smart);
    hudEl.classList.toggle('rd-off', !R.on); hudEl.classList.toggle('rd-onair', R.on && R.air);
    actBtn.querySelector('b').textContent = R.on ? st.short : '电台';
    actBtn.classList.toggle('rd-act-on', R.on); actBtn.style.setProperty('--rd', st.acc);
    if (panel.hidden) return;
    panel.querySelectorAll('.rd-pre').forEach(b => b.setAttribute('aria-pressed', String(R.on && +b.dataset.i === R.st)));
    panel.querySelectorAll('.rd-md').forEach(b => b.setAttribute('aria-pressed', String(R.on && +b.dataset.m === md)));
    $r('rdSmart').checked = R.smart; $r('rdWhy').textContent = smartLine();
    const minor = S && S.mo ? S.mo.minor : st.minor;
    $r('rdNow').textContent = S && R.on ? `♪ ${S.title} #${String(S.k % 1000).padStart(3, '0')} · ${NOTE[S.key % 12]}${minor ? ' 小调' : ' 大调'} · ${S.bpm} BPM` : '电台关着';
    $r('rdLoop').setAttribute('aria-pressed', String(R.loop)); $r('rdLoop').textContent = '🔁 单曲循环：' + (R.loop ? '开' : '关');
    const f = R.fav[R.carKind], isFav = !!(f && f.s === R.st && f.k === R.seed);
    $r('rdFav').setAttribute('aria-pressed', String(isFav)); $r('rdFav').textContent = isFav ? '★ 已收藏到这辆车' : '☆ 收藏到这辆车';
    $r('rdAir').setAttribute('aria-pressed', String(R.air)); $r('rdAir').textContent = '📢 外放：' + (R.air ? '开' : '关');
    $r('rdAirTxt').textContent = R.air ? `外放中 · 这一分钟还剩 ${Math.ceil(R.airLeft)} 秒，到时再扣 RM ${AIR_FEE.toFixed(2)}${online() ? '' : '（离线：只有本机其他窗口听得到）'}`
      : `自己听免费。外放每分钟 RM ${AIR_FEE.toFixed(2)}，${HEAR_R} 米内的人按距离听到`;
    $r('rdVol').value = Math.round(R.vol * 100); $r('rdVolOut').textContent = Math.round(R.vol * 100) + '%';
    $r('rdAuto').checked = R.auto;
    $r('rdPow').textContent = R.on ? '⏻ 关电台' : '⏻ 开电台';
  }
  const vz = $r('rdViz').getContext('2d'), vbins = new Uint8Array(32);
  let secShown = '', hearShown = '', topY = -1, wasFlat = false;
  const LANDSCAPE = matchMedia('(max-height:520px) and (min-width:561px)');
  function hudTick(car){
    const show = car && !g(() => document.body.classList.contains('titled'), false);
    actBtn.hidden = !car; document.body.classList.toggle('rd-car', car);
    if (!car && !panel.hidden) panelOpen(false);
    if (flashT > 0){ flashT -= .1; if (flashT <= 0) hudEl.classList.remove('rd-flash'); }
    if (SM.showT > 0){ SM.showT -= .1; if (SM.showT <= 0) hud(); }
    /* who you are hearing (in the car or on foot) */
    const h = R.hear.length ? '🔊 ' + R.hear.map(x => `${x.name} 的外放 · ${x.m ? mixName(x.s, x.m) : STATIONS[x.s].short}「${x.title}」`).join('　') : '';
    if (h !== hearShown){ hearShown = h; const el = $r('rdHear'); el.textContent = h; el.hidden = !h; }
    hudEl.classList.toggle('rd-hearonly', !show && !!h);
    const vis = show || !!h; if (hudEl.hidden === vis) hudEl.hidden = !vis;
    /* phones: just under the top card (its height changes with what it shows), the panel under the strip;
       computers: the panel right above the strip (the strip moves up when the 🔊 line shows under it) */
    /* phones held sideways (css/style.css「手机横屏 2.0」): the strip sits at the bottom next to the stick, so the panel opens above it like on a computer */
    const flat = TOUCH && LANDSCAPE.matches;
    if (flat !== wasFlat){ wasFlat = flat; topY = -1; hudEl.style.top = panel.style.top = panel.style.bottom = panel.style.maxHeight = ''; }
    if (vis && TOUCH && !flat){
      const tb = document.querySelector('.topbar'), y = Math.round(tb ? tb.getBoundingClientRect().bottom + 8 : 120);
      if (y !== topY){ topY = y; hudEl.style.top = y + 'px'; panel.style.top = (y + 52) + 'px'; panel.style.maxHeight = `calc(100% - ${y + 64}px)`; }
    } else if (show && !panel.hidden){
      const y = Math.round(innerHeight - $r('rdStrip').getBoundingClientRect().top + 8);
      if (y !== topY){ topY = y; panel.style.bottom = y + 'px'; panel.style.maxHeight = `calc(100% - ${y + 16}px)`; }
    }
    if (!show) return;
    /* the little meter and the section line */
    vz.clearRect(0, 0, 48, 24);
    const live = localNow() && analyser;
    if (live) analyser.getByteFrequencyData(vbins);
    const col = getComputedStyle(hudEl).getPropertyValue('--rd') || '#ff5fa8';
    for (let i = 0; i < 8; i++){
      const v = live ? vbins[1 + i * 3] / 255 : 0, n = Math.max(1, Math.round(v * 6));
      for (let k = 0; k < 6; k++){ vz.fillStyle = k < n && live ? col : 'rgba(255,255,255,.12)'; vz.fillRect(i * 6, 24 - (k + 1) * 4, 4, 3); }
    }
    if (!panel.hidden && localNow() && local.marks.length){
      const m = local.marks[0], el = (Date.now() - local.t0) / 1000;
      const s = SEC_NAME[m.sec] + ' · ' + fmtT(Math.max(0, el)) + ' / ' + fmtT(local.song.dur);
      if (s !== secShown){ secShown = s; $r('rdSec').textContent = s; }
      if (R.air) $r('rdAirTxt').textContent = `外放中 · 这一分钟还剩 ${Math.max(0, Math.ceil(R.airLeft))} 秒，到时再扣 RM ${AIR_FEE.toFixed(2)}${online() ? '' : '（离线：只有本机其他窗口听得到）'}`;
    }
  }
  hud();

  window.XRadio = {
    stations:STATIONS, moods:MOODS, songOf, nextSeed, newSeed, moodOf, mixName, state:R, smart:SM, peers, get decks(){ return {local, spare, remote:remoteDecks}; },
    cycle, pick, pickMood, next, setLoop, toggleFav, setPower, setSmart, air:airSet, open:panelOpen,
    level:{get master(){ return LEVEL; }, get remote(){ return REMOTE_LEVEL; }}
  };
})();
