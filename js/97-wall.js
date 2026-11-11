/* XMUM 校园漫游 · 图书馆门口的留言墙
   A3 百姓大楼（图书馆）门前台阶西边的草坪边上立着一面软木留言墙，正对台阶下的广场：玩家贴便利贴，路过的人都能看到、点赞。
   - 走近按 F（手机点「留言」）打开留言墙面板：看全部便利贴、点开放大、点赞、隐藏、举报，或者自己贴一张。
     在墙前直接点墙上某一张，也能放大看。
   - 每人同时只有一张：新的替换旧的（旧的赞和举报一起清零），10 分钟能贴一次，最多 40 个字，可以选 6 种颜色。
     发之前过一遍敏感词：脏话、广告、链接、联系方式直接拦下（下面 WL_BAD_*）；服务器规则再拦一遍链接、@ 和长串数字。
   - 墙上画 30 张：赞最多的 6 张大号贴在正中间，其余按赞数和时间往两边排；自己那张一定在墙上，带金色「我」标记。
     整面墙（软木、页眉、所有便利贴）画在一张 canvas 贴图上，墙本身 4 个 draw call。夜里顶上的灯条亮起来，墙面自发光，地上有一圈光。
   - 联机（Firebase RTDB，规则在 database.rules.json）：
       /wall/{uid}             = {name, text, color, ts}   只能写自己的；name 必须是 users/{uid}/name 里注册的昵称；ts 必须是服务器时间；
                                                           换一张要等上一张贴出 10 分钟以后（规则里也查）
       /wallLikes/{作者}/{点赞人} = true                    只能写自己的 uid，只能新建（每人每张一次），不能给自己点
       /wallLikeN/{作者}        = 赞数                      别人只能在同一次写入里新建自己的赞时 +1；作者只能在贴新的一张时清零
       /wallFlags/{作者}/{举报人} = true，/wallFlagN/{作者} = 举报数   和赞一样；举报数到 WL_HIDE_AT 张自动从墙上隐藏
     读：最新 60 张（按 ts）+ 赞最多的 12 个计数 + 被举报够数的作者；离墙近的时候两分钟刷新一次，打开面板时也刷新。
   - 离线 / 预览版：几张「示范」便利贴加你本机的那张，发帖、点赞、隐藏、成就、「收到 N 个赞」提示都能完整试一遍
     （离线时你的那张会被示范玩家随机点几个赞，下次打开游戏提示）。
   - 本机还会记：赞过哪些、隐藏了哪些、上次贴的时间、上次看到自己有几个赞（xmum-wall-v1）。 */
'use strict';
const WL_X = 59, WL_Z = 145.6, WL_ROT = 0;          /* 墙的中心（世界坐标）和朝向：rot 0 = 正面朝南（+z），对着台阶下的广场 */
const WL_W = 10.4, WL_H = 3.0, WL_Y0 = .78;          /* 墙面宽、高（米），离地高度 */
const WL_HEAD = .42;                                 /* 墙面顶上一条页眉（「留言墙」） */
const WL_MAX = 40, WL_CD = 10 * 60 * 1000, WL_HIDE_AT = 3, WL_KEY = 'xmum-wall-v1';
const WL_COLORS = {
  yellow:{n:'柠檬黄', c:'#ffe27a'}, pink:{n:'樱花粉', c:'#ffb8cb'}, blue:{n:'天空蓝', c:'#aad7ff'},
  green:{n:'薄荷绿', c:'#bfeba5'}, orange:{n:'蜜桃橙', c:'#ffc58e'}, purple:{n:'香芋紫', c:'#d9c2ff'}
};
const WL_DEMOS = [
  {name:'阿杰', text:'期末周 A3 四楼靠窗的位置最好，记得早点来占座！', color:'yellow', likes:12, ago:26},
  {name:'Mei', text:'图书馆空调真的很冷，带件外套再进来～', color:'blue', likes:9, ago:50},
  {name:'小鹿', text:'今天在湖边看到超大的巨蜥，路过的同学小心点', color:'green', likes:7, ago:9},
  {name:'Haziq', text:'Selamat datang ke XMUM! 欢迎新同学', color:'orange', likes:5, ago:72},
  {name:'奶茶续命', text:'下课冲 LY3，今天的奶茶很好喝', color:'pink', likes:4, ago:4},
  {name:'学长', text:'考试加油，你们都会过的', color:'purple', likes:3, ago:30},
  {name:'夜猫子', text:'晚上中心湖的灯好好看，推荐散步', color:'blue', likes:2, ago:3},
  {name:'新生', text:'有人知道 B1 游戏厅几点关门吗？', color:'yellow', likes:0, ago:1}
].map((d, i) => Object.assign({uid:'demo' + i, demo:true, ts:Date.now() - d.ago * 3600e3}, d));

/* ---------- 敏感词：脏话、广告、链接、联系方式 ---------- */
/* 中文和其他整段匹配的词（去掉空格标点、全角转半角、小写以后查子串） */
const WL_BAD_ZH = ['傻逼','傻b','傻比','傻屄','煞笔','沙比','他妈','他媽','你妈','你媽','尼玛','泥马','草泥马','操你','肏','艹你','日你','干你娘','妈的','妈逼','逼样','婊','贱人','贱货',
  '狗日','狗娘养','王八蛋','杂种','畜生','去死','死全家','滚蛋','脑残','智障','弱智','废物','屌','鸡巴','屁眼','卧槽','我操','我草','丢你','扑街','仆街','冚家','含家','吃屎',
  'fuck','fuk','shit','bitch','cunt','pussy','asshole','bastard','whore','nigg','fagg','retard','motherf','pukimak','lancau','kimak','haramjadah'];
const WL_AD_ZH = ['微信','威信','薇信','v信','微x','weixin','wechat','whatsapp','telegram','电报群','扣扣','企鹅号','手机号','电话号','加我','私聊','私信我','联系我','discord',
  '代写','代考','代课','代购','刷单','兼职','日结','贷款','网贷','套现','博彩','赌博','菠菜','彩票','六合彩','娱乐城','百家乐','约炮','裸聊','援交','色情','黄网','成人视频',
  '加群','群号','返利','优惠券','免费领','招聘','招代理','扫码','二维码','办证','发票','出售','收购','抖音号','小红书号','instagram','tiktok','点com','dotcom'];
/* 很短的英文/马来文/拼音缩写只按整个单词查，免得误伤正常单词（special、online…） */
const WL_BAD_WORD = new Set(['sb','jb','tmd','cnm','nmsl','wcnm','wtf','stfu','dick','babi','bodoh','sial','celaka','butoh','puki','diu','sohai','fk','fck','fcuk','slut','kys']);
const WL_AD_WORD = new Set(['vx','wx','qq','ig','tg','wa','line','dm']);
const WL_DIGIT = {'零':0,'〇':0,'一':1,'壹':1,'二':2,'贰':2,'两':2,'三':3,'叁':3,'四':4,'肆':4,'五':5,'伍':5,'六':6,'陆':6,'七':7,'柒':7,'八':8,'捌':8,'九':9,'玖':9};
/* 返回 '' 表示可以贴，否则是拦下来的原因 */
function wlCheck(raw){
  const t = String(raw || '').normalize('NFKC').toLowerCase();
  if (!t.trim()) return '先写点什么';
  if (t.length > WL_MAX) return `最多 ${WL_MAX} 个字`;
  if (/[<>\u0000-\u001f\u007f]/.test(t)) return '不能用 < > 和控制字符';
  const flat = t.replace(/\s+/g, '');
  if (/https?:|www\.|:\/\/|\.(com|net|org|cn|my|io|cc|xyz|top|me|co|info|link|ly|gg|app|site|shop|vip)\b|t\.me|wa\.me|bit\.ly|点(com|net|cn)/.test(flat)) return '不能放链接';
  if (/@/.test(t)) return '不能留联系方式（邮箱、账号）';
  const sq = flat.replace(/[​-‏⁠﻿·.,，。!！?？~～\-_*#|\\/'"`^()（）\[\]【】{}《》:：;；、…+=]+/g, '');
  const digits = sq.replace(/./g, c => WL_DIGIT[c] != null ? WL_DIGIT[c] : c);
  if (/[0-9]{6,}/.test(digits)) return '不能留电话、QQ 之类的号码';
  for (const w of WL_BAD_ZH) if (sq.includes(w)) return '有不太友好的字眼，换个说法吧';
  for (const w of WL_AD_ZH) if (sq.includes(w)) return '不能打广告、留联系方式';
  for (const w of t.match(/[a-z0-9]+/g) || []){
    if (WL_BAD_WORD.has(w)) return '有不太友好的字眼，换个说法吧';
    if (WL_AD_WORD.has(w)) return '不能打广告、留联系方式';
  }
  if (/(.)\1{7,}/.test(sq)) return '别刷屏呀';
  return '';
}
/* 发出去之前整理一下：去掉换行和多余空格 */
const wlClean = s => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();

/* ---------- 本机存档 ---------- */
const WL = {local:{mine:null, last:0, liked:{}, hidden:{}, seen:null}, remote:null, likeN:{}, flagN:{}, list:[], placed:[], open:false, view:'list', sel:null,
  draft:{text:'', color:'yellow'}, near:false, prompt:'', fLbl:false, mode:'', vis:true, k:-1, fetchT:0, busy:false, warned:false, gotN:false};
try { const v = JSON.parse(localStorage.getItem(WL_KEY) || 'null'); if (v && typeof v === 'object') Object.assign(WL.local, v); } catch(e){}
for (const k of ['liked', 'hidden']) if (!WL.local[k] || typeof WL.local[k] !== 'object') WL.local[k] = {};
function wlSave(){ try { localStorage.setItem(WL_KEY, JSON.stringify(WL.local)); } catch(e){} }
const wlKey = n => n.demo ? n.uid : n.uid + ':' + n.ts;   /* demos: the same key every load */
const wlEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
const wlAgo = ts => { const m = Math.max(0, (Date.now() - ts) / 60000); return m < 1 ? '刚刚' : m < 60 ? Math.floor(m) + ' 分钟前' : m < 1440 ? Math.floor(m / 60) + ' 小时前' : Math.floor(m / 1440) + ' 天前'; };
const wlOnline = () => !!(window.XNet && XNet.online && window.firebase && firebase.app);
const wlDb = () => firebase.app().database();
const wlRegName = () => (window.XNet && XNet.claimedName && XNet.claimedName()) || '';
function wlMyName(){
  let n = wlRegName(); if (n) return n;
  try { n = (window.XUI && XUI.playerName && XUI.playerName()) || localStorage.getItem('xmum-name') || ''; } catch(e){}
  return String(n || '').slice(0, 12) || '我';
}
const wlHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
const wlSfx = k => { try { if (typeof sfx !== 'undefined' && sfx[k]) sfx[k](); else if (typeof tone === 'function') tone('square', 660, 660, .04, .03); } catch(e){} };

/* ---------- 3D：墙架、软木墙面、灯条、地上的光 ---------- */
const wlRoot = new THREE.Group(); wlRoot.name = 'messageWall';
const wlGY = Math.min(groundAt(WL_X - WL_W / 2, WL_Z), groundAt(WL_X + WL_W / 2, WL_Z), groundAt(WL_X, WL_Z), groundAt(WL_X, WL_Z + 1));
wlRoot.position.set(WL_X, wlGY, WL_Z); wlRoot.rotation.y = WL_ROT; scene.add(wlRoot);
{
  const P = [], top = WL_Y0 + WL_H, hx = WL_W / 2 + .1;
  const wood = '#5b3c25', dark = '#3a2817', slate = '#36434c', stone = '#cfc7b8', conc = '#9a9c98';
  P.push(geoTint(geoAt(roundBox(WL_W + .12, WL_H + .12, .08, .02), 0, WL_Y0 + WL_H / 2, -.02), '#6e4e33'));               /* back panel */
  P.push(geoTint(geoAt(roundBox(WL_W + .4, .16, .17, .04), 0, top + .08, .03), wood));                                    /* frame */
  P.push(geoTint(geoAt(roundBox(WL_W + .4, .16, .17, .04), 0, WL_Y0 - .08, .03), wood));
  for (const s of [-1, 1]) P.push(geoTint(geoAt(roundBox(.17, WL_H + .32, .17, .04), s * hx, WL_Y0 + WL_H / 2, .03), wood));
  const postH = top + .62;
  for (const s of [-1, 1]) P.push(geoTint(geoAt(roundBox(.2, postH + .3, .2, .04), s * (hx + .02), (postH + .3) / 2 - .3, -.06), dark));
  for (const x of [-WL_W / 4, WL_W / 4]) P.push(geoTint(geoAt(roundBox(.14, top + .3, .12, .03), x, (top + .3) / 2 - .3, -.12), dark));   /* back legs */
  /* canopy: a thin slate roof leaning forward, with a fascia; the light bar hangs under its front edge */
  P.push(geoTint(geoAt(roundBox(WL_W + 1.1, .1, 1.2, .03), 0, top + .5, .32, .2), slate));
  P.push(geoTint(geoAt(roundBox(WL_W + 1.1, .26, .07, .02), 0, top + .32, .9, .2), '#2b363d'));
  for (const s of [-1, 0, 1]) P.push(geoTint(geoAt(new THREE.BoxGeometry(.06, .06, .62), s * (WL_W / 2 - .3), top + .22, .36), dark));       /* light bar arms */
  /* ledge under the board (where the pens are) and two planters */
  P.push(geoTint(geoAt(roundBox(WL_W + .5, .12, .34, .03), 0, WL_Y0 - .2, .2), stone));
  P.push(geoTint(geoAt(new THREE.CylinderGeometry(.07, .06, .16, 8), WL_W / 2 - .7, WL_Y0 - .06, .2), '#2f6f8f'));
  P.push(geoTint(geoAt(new THREE.CylinderGeometry(.012, .012, .2, 4), WL_W / 2 - .72, WL_Y0 + .02, .21, .2), '#e2b13c'));
  P.push(geoTint(geoAt(new THREE.CylinderGeometry(.012, .012, .2, 4), WL_W / 2 - .68, WL_Y0 + .02, .19, -.25), '#c8443a'));
  for (const s of [-1, 1]){
    const x = s * (hx + .85);
    P.push(geoTint(geoAt(roundBox(1.0, .6, .75, .06), x, .3, .2), conc));
    P.push(geoTint(geoAt(new THREE.CylinderGeometry(.42, .42, .06, 10), x, .6, .2), '#4a3424'));
    P.push(geoTint(geoAt(new THREE.IcosahedronGeometry(.48, 0), x, .95, .2, 0, s, 0, 1, .85, .8), '#4b8a3a'));
    P.push(geoTint(geoAt(new THREE.IcosahedronGeometry(.3, 0), x + s * .2, 1.25, .1, .4, 0, 0), '#5a9c45'));
    for (let i = 0; i < 4; i++) P.push(geoTint(geoAt(new THREE.IcosahedronGeometry(.07, 0), x - .3 + i * .2, 1.0 + (i % 2) * .22, .55), ['#ff8fa3', '#ffd54f', '#ff8fa3', '#fff1c9'][i]));
  }
  const frame = new THREE.Mesh(geoMerge(P), decoMat); frame.castShadow = frame.receiveShadow = true; wlRoot.add(frame);
}
/* board: cork, header and every note on one canvas texture */
const wlCanvas = document.createElement('canvas'), wlCork = document.createElement('canvas');
const wlTex = new THREE.CanvasTexture(wlCanvas); wlTex.anisotropy = ANISO;
if (THREE.sRGBEncoding && renderer.outputEncoding === THREE.sRGBEncoding) wlTex.encoding = THREE.sRGBEncoding;
const wlBoardMat = new THREE.MeshStandardMaterial({map:wlTex, emissiveMap:wlTex, emissive:new THREE.Color('#ffffff'), emissiveIntensity:0, roughness:.92, metalness:0});
const wlBoard = new THREE.Mesh(new THREE.PlaneGeometry(WL_W, WL_H), wlBoardMat);
wlBoard.position.set(0, WL_Y0 + WL_H / 2, .025); wlBoard.receiveShadow = true; wlRoot.add(wlBoard);
const wlLampMat = new THREE.MeshBasicMaterial({color:'#d9d3c5'});
const wlLamp = new THREE.Mesh(new THREE.BoxGeometry(WL_W - .2, .05, .09), wlLampMat);
wlLamp.position.set(0, WL_Y0 + WL_H + .18, .66); wlRoot.add(wlLamp);
/* a warm pool of light on the paving in front, only after dark */
const wlPoolMat = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,226,170,1)'); gr.addColorStop(.55, 'rgba(255,214,150,.45)'); gr.addColorStop(1, 'rgba(255,210,140,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, opacity:0, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-16});
})();
const wlPool = new THREE.Mesh(new THREE.PlaneGeometry(WL_W + 3, 6), wlPoolMat);
wlPool.rotation.x = -Math.PI / 2; wlPool.position.set(0, .06, 2.4); wlPool.visible = false; wlRoot.add(wlPool);
const wlCols = [addBox(WL_X + Math.sin(WL_ROT) * .15, WL_Z + Math.cos(WL_ROT) * .15, WL_W / 2 + 1.4, .5, WL_ROT)];
function wlColliders(){
  const want = WL.mode !== 'hole';
  for (const c of wlCols){ const at = colliders.indexOf(c); if (want && at < 0) colliders.push(c); else if (!want && at >= 0) colliders.splice(at, 1); }
}

/* ---------- canvas: cork + header (cached), then the notes ---------- */
let WL_PPM = 0;
function wlSize(){
  const cw = XQ.pick(2048, 2560, 3072); if (cw / WL_W === WL_PPM) return false;
  WL_PPM = cw / WL_W; wlCanvas.width = wlCork.width = cw; wlCanvas.height = wlCork.height = Math.round(WL_H * WL_PPM);
  const g = wlCork.getContext('2d'), W = wlCork.width, H = wlCork.height, m = WL_PPM, hh = WL_HEAD * m, R = mkRng(97);
  g.fillStyle = '#c39566'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H / 260; i++){
    const x = R() * W, y = hh + R() * (H - hh), r = .6 + R() * 2.2 * m / 300, v = R();
    g.fillStyle = v < .5 ? `rgba(92,58,30,${.12 + R() * .2})` : v < .8 ? `rgba(230,196,150,${.15 + R() * .2})` : `rgba(60,36,18,${.2 + R() * .2})`;
    g.fillRect(x, y, r * 2, r * 1.4);
  }
  const vg = g.createRadialGradient(W / 2, H * .6, H * .3, W / 2, H * .6, W * .62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,5,.28)');
  g.fillStyle = vg; g.fillRect(0, hh, W, H - hh);
  /* header: dark wood strip with the name */
  const hg = g.createLinearGradient(0, 0, 0, hh); hg.addColorStop(0, '#4d321e'); hg.addColorStop(1, '#3a2515'); g.fillStyle = hg; g.fillRect(0, 0, W, hh);
  g.fillStyle = 'rgba(255,255,255,.06)'; for (let x = 0; x < W; x += m * .9) g.fillRect(x + R() * m * .3, 0, 2, hh);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, hh - 3, W, 3);
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fbe7c2';
  g.font = `900 ${Math.round(hh * .62)}px "Noto Serif SC","Songti SC","SimSun",serif`; g.fillText('留 言 墙', W / 2, hh * .53);
  g.font = `600 ${Math.round(hh * .3)}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`; g.fillStyle = 'rgba(251,231,194,.78)';
  g.textAlign = 'left'; g.fillText('图书馆 · A3 百姓大楼', m * .35, hh * .53);
  g.textAlign = 'right'; g.fillText((TOUCH ? '走近点「留言」' : '走近按 F') + ' · 贴一张便利贴', W - m * .35, hh * .53);
  return true;
}
/* slots in board metres (x from the left edge, y down from the top): 6 big ones in the middle, 24 small ones on the two wings */
const WL_SLOTS = (() => {
  const cy = WL_HEAD + (WL_H - WL_HEAD) / 2, cx = WL_W / 2, big = [], small = [];
  for (const [x, y] of [[0, -.6], [0, .6], [-1.2, -.6], [1.2, -.6], [-1.2, .6], [1.2, .6]]) big.push({x:cx + x, y:cy + y, s:1.06});
  for (let c = 0; c < 4; c++) for (const side of [-1, 1]) for (const r of [-1, 0, 1]) small.push({x:cx + side * (1.85 + .8 * (c + .5)), y:cy + r * .8, s:.72});
  small.sort((a, b) => Math.hypot(a.x - cx, (a.y - cy) * 1.6) - Math.hypot(b.x - cx, (b.y - cy) * 1.6));
  return {big, small};
})();
const WL_FONT = '"Kaiti SC","STKaiti","KaiTi","楷体","Noto Serif SC",serif';
function wlWrap(g, text, maxW){
  const toks = String(text).match(/[A-Za-z0-9'’]+|\s+|[\s\S]/gu) || [], lines = []; let cur = '';
  for (const t of toks){
    if (g.measureText(cur + t).width <= maxW){ cur += t; continue; }
    if (cur.trim()) lines.push(cur.trim());
    cur = /^\s+$/.test(t) ? '' : t;
    while (g.measureText(cur).width > maxW && cur.length > 1){   /* a word longer than the line */
      let i = cur.length - 1; while (i > 1 && g.measureText(cur.slice(0, i)).width > maxW) i--;
      lines.push(cur.slice(0, i)); cur = cur.slice(i);
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
function wlDrawNote(g, n, px, py, ps, ang){
  const C = (WL_COLORS[n.color] || WL_COLORS.yellow).c;
  g.save(); g.translate(px, py); g.rotate(ang);
  g.shadowColor = 'rgba(30,15,0,.42)'; g.shadowBlur = ps * .06; g.shadowOffsetX = ps * .02; g.shadowOffsetY = ps * .035;
  g.fillStyle = C; g.fillRect(-ps / 2, -ps / 2, ps, ps);
  g.shadowColor = 'transparent';
  const sh = g.createLinearGradient(0, -ps / 2, 0, ps / 2); sh.addColorStop(0, 'rgba(0,0,0,.07)'); sh.addColorStop(.18, 'rgba(0,0,0,0)'); sh.addColorStop(.85, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.08)');
  g.fillStyle = sh; g.fillRect(-ps / 2, -ps / 2, ps, ps);
  /* text: as big as fits */
  const pad = ps * .1, tw = ps - pad * 2, th = ps * .6; let fs = ps * .16, lines;
  for (;;){ g.font = `600 ${fs}px ${WL_FONT}`; lines = wlWrap(g, n.text, tw); if (lines.length * fs * 1.2 <= th || fs < ps * .07) break; fs *= .92; }
  g.fillStyle = '#2a2622'; g.textAlign = 'left'; g.textBaseline = 'top';
  const y0 = -ps / 2 + ps * .15 + Math.max(0, (th - lines.length * fs * 1.2) / 2 * .5);
  lines.slice(0, Math.floor(th / (fs * 1.2)) + 1).forEach((l, i) => g.fillText(l, -ps / 2 + pad, y0 + i * fs * 1.2));
  /* name, likes */
  const fy = ps / 2 - ps * .1, sf = ps * .085;
  g.font = `500 ${sf}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`; g.textBaseline = 'middle';
  g.textAlign = 'right'; g.fillStyle = 'rgba(40,30,20,.62)';
  let nm = '— ' + n.name; while (g.measureText(nm).width > ps * .58 && nm.length > 3) nm = nm.slice(0, -2) + '…';
  g.fillText(nm, ps / 2 - pad * .8, fy);
  if (n.likes > 0){ g.textAlign = 'left'; g.fillStyle = '#d23b4b'; g.fillText('♥ ' + n.likes, -ps / 2 + pad * .8, fy); }
  /* pin */
  const pr = ps * .045, pc = ['#d6453d', '#2f7fd0', '#2e9e5b', '#e0a21c'][(wlHash(n.uid) * 4) | 0];
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(pr * .35, -ps / 2 + ps * .07 + pr * .45, pr, 0, 7); g.fill();
  const pg = g.createRadialGradient(-pr * .3, -ps / 2 + ps * .07 - pr * .3, pr * .1, 0, -ps / 2 + ps * .07, pr); pg.addColorStop(0, '#fff'); pg.addColorStop(.3, pc); pg.addColorStop(1, '#222');
  g.fillStyle = pg; g.beginPath(); g.arc(0, -ps / 2 + ps * .07, pr, 0, 7); g.fill();
  /* mine: gold corner ribbon; demo: red stamp */
  if (n.mine){
    g.fillStyle = '#e3a92b'; g.beginPath(); g.moveTo(-ps / 2, -ps / 2); g.lineTo(-ps / 2 + ps * .3, -ps / 2); g.lineTo(-ps / 2, -ps / 2 + ps * .3); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = `800 ${ps * .085}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('我', -ps / 2 + ps * .085, -ps / 2 + ps * .085);
  }
  if (n.demo){
    g.save(); g.translate(ps / 2 - ps * .16, -ps / 2 + ps * .1); g.rotate(.22);
    g.strokeStyle = 'rgba(200,40,40,.75)'; g.lineWidth = Math.max(1.5, ps * .012); g.strokeRect(-ps * .12, -ps * .045, ps * .24, ps * .09);
    g.fillStyle = 'rgba(200,40,40,.8)'; g.font = `700 ${ps * .06}px "Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('示范', 0, 0);
    g.restore();
  }
  if (n.flagged){ g.fillStyle = 'rgba(80,80,80,.45)'; g.fillRect(-ps / 2, -ps / 2, ps, ps); }
  g.restore();
}
function wlDraw(){
  wlSize();
  const g = wlCanvas.getContext('2d'), m = WL_PPM;
  g.drawImage(wlCork, 0, 0);
  for (const p of WL.placed) wlDrawNote(g, p.n, p.x * m, p.y * m, p.s * m, p.a);
  if (!WL.placed.length){
    g.fillStyle = 'rgba(60,35,15,.55)'; g.font = `600 ${m * .22}px ${WL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('还没有人留言，来贴第一张吧', wlCanvas.width / 2, (WL_HEAD + (WL_H - WL_HEAD) / 2) * m);
  }
  wlTex.needsUpdate = true;
}

/* ---------- which notes go up, and where ---------- */
function wlMineNote(){
  if (wlOnline()) return WL.remote ? WL.remote.find(n => n.uid === XNet.uid) || null : null;
  const m = WL.local.mine; if (!m) return null;
  return {uid:'me', name:wlMyName(), text:m.text, color:m.color, ts:m.ts, likes:m.likes || 0};
}
function wlRebuild(){
  const online = wlOnline(), pool = [];
  if (online && WL.remote) for (const r of WL.remote){
    const mine = r.uid === XNet.uid, flagged = (WL.flagN[r.uid] || 0) >= WL_HIDE_AT;
    const n = Object.assign({}, r, {mine, flagged:mine && flagged, likes:WL.likeN[r.uid] || 0});
    if (!mine && (flagged || WL.local.hidden[wlKey(n)] || wlCheck(n.text))) continue;
    pool.push(n);
  }
  if (!online){ const m = wlMineNote(); if (m){ m.mine = true; pool.push(m); } }
  if (!online || pool.filter(n => !n.mine).length < 6)
    for (const d of WL_DEMOS){ const n = Object.assign({}, d, {likes:d.likes + (WL.local.liked[wlKey(d)] ? 1 : 0)}); if (!WL.local.hidden[wlKey(n)]) pool.push(n); }
  const byLikes = (a, b) => b.likes - a.likes || b.ts - a.ts, byNew = (a, b) => b.ts - a.ts;
  const big = pool.filter(n => n.likes > 0).sort(byLikes).slice(0, 6);
  let rest = pool.filter(n => !big.includes(n)).sort(byNew);
  while (big.length < 6 && rest.length) big.push(rest.shift());
  const liked = rest.filter(n => n.likes > 0).sort(byLikes).slice(0, 6);
  let small = liked.concat(rest.filter(n => !liked.includes(n))).slice(0, WL_SLOTS.small.length);
  const mine = pool.find(n => n.mine);
  if (mine && !big.includes(mine) && !small.includes(mine)){ if (small.length >= WL_SLOTS.small.length) small.pop(); small.push(mine); }
  big.sort(byLikes); small.sort(byLikes);
  WL.list = big.concat(small);
  const jit = (n, k) => wlHash(wlKey(n) + k) - .5;
  WL.placed = small.map((n, i) => ({n, ...WL_SLOTS.small[i], a:jit(n, 'a') * .12, dx:jit(n, 'x') * .05}))
    .concat(big.map((n, i) => ({n, ...WL_SLOTS.big[i], a:jit(n, 'a') * .08, dx:jit(n, 'x') * .04})));
  for (const p of WL.placed){ p.x += p.dx; p.y += jit(p.n, 'y') * .04; }
  wlDraw();
  if (WL.open) wlRender();
}

/* ---------- online ---------- */
const WL_TEXT_RE = /^[^<>]{1,40}$/;
async function wlFetch(){
  if (!wlOnline() || WL.busy) return;
  WL.busy = true; WL.fetchT = Date.now();
  try {
    const db = wlDb(), me = XNet.uid;
    const [recent, top, flags] = await Promise.all([
      db.ref('wall').orderByChild('ts').limitToLast(60).once('value'),
      db.ref('wallLikeN').orderByValue().limitToLast(12).once('value'),
      db.ref('wallFlagN').orderByValue().startAt(WL_HIDE_AT).once('value')
    ]);
    const notes = new Map(), likeN = {}, flagN = {};
    const take = (uid, v) => {
      if (!v || typeof v.text !== 'string' || !WL_TEXT_RE.test(v.text) || typeof v.name !== 'string' || !v.name || typeof v.ts !== 'number') return;
      notes.set(uid, {uid, name:v.name.slice(0, 16), text:v.text, color:WL_COLORS[v.color] ? v.color : 'yellow', ts:v.ts});
    };
    recent.forEach(c => { take(c.key, c.val()); });
    top.forEach(c => { likeN[c.key] = Math.max(0, +c.val() || 0); });
    flags.forEach(c => { flagN[c.key] = Math.max(0, +c.val() || 0); });
    /* the most liked notes that are not among the newest 60, and my own */
    const extra = Object.keys(likeN).concat([me]).filter(u => !notes.has(u));
    await Promise.all(extra.map(u => db.ref('wall/' + u).once('value').then(s => take(u, s.val())).catch(() => {})));
    /* like counts for the notes that will go up but were not in the top 12 */
    const need = [...notes.keys()].filter(u => likeN[u] == null).sort((a, b) => notes.get(b).ts - notes.get(a).ts).slice(0, 40);
    await Promise.all(need.map(u => db.ref('wallLikeN/' + u).once('value').then(s => { likeN[u] = Math.max(0, +s.val() || 0); }).catch(() => {})));
    if (notes.has(me) && flagN[me] == null) try { flagN[me] = +(await db.ref('wallFlagN/' + me).once('value')).val() || 0; } catch(e){}
    WL.remote = [...notes.values()]; WL.likeN = likeN; WL.flagN = flagN;
    wlRebuild();
    wlLikesNotice();
  } catch(e){ if (!WL.warned){ WL.warned = true; console.warn('[wall] 读取留言墙失败（规则还没发布？）', e); } }
  WL.busy = false;
}
const wlPermErr = e => String(e && (e.code || e.message) || e).toUpperCase().includes('PERMISSION');

/* ---------- actions: post, like, hide, report, tear down ---------- */
function wlCooldown(){
  const mine = wlMineNote(), last = Math.max(WL.local.last || 0, mine ? mine.ts : 0);
  return Math.max(0, WL_CD - (Date.now() - last));
}
const wlMMSS = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
async function wlPost(text, color){
  text = wlClean(text);
  const why = wlCheck(text); if (why) return why;
  if (!WL_COLORS[color]) color = 'yellow';
  const cd = wlCooldown(); if (cd > 0) return `还要等 ${wlMMSS(cd)} 才能再贴`;
  if (wlOnline()){
    const name = wlRegName(); if (!name) return '先在标题页注册昵称，才能在全服的留言墙上贴';
    const uid = XNet.uid, TS = firebase.database.ServerValue.TIMESTAMP, up = {};
    up['wall/' + uid] = {name, text, color, ts:TS};
    up['wallLikes/' + uid] = null; up['wallLikeN/' + uid] = 0; up['wallFlags/' + uid] = null; up['wallFlagN/' + uid] = 0;
    try { await wlDb().ref().update(up); }
    catch(e){ console.warn('[wall] 贴不上', e); return wlPermErr(e) ? '服务器拒绝了：可能还在冷却，或者内容不符合规则' : '网络不太好，没贴上，稍后再试'; }
    WL.local.last = Date.now(); WL.local.seen = {ts:0, n:0};
    const now = Date.now();
    WL.remote = (WL.remote || []).filter(n => n.uid !== uid).concat([{uid, name, text, color, ts:now}]);
    WL.likeN[uid] = 0; WL.flagN[uid] = 0;
    setTimeout(wlFetch, 1500);   /* pick up the server's timestamp */
  } else {
    WL.local.mine = {text, color, ts:Date.now(), likes:0}; WL.local.last = Date.now(); WL.local.seen = {ts:WL.local.mine.ts, n:0};
  }
  wlSave(); wlRebuild();
  if (typeof unlock === 'function') unlock('wall1');
  return '';
}
async function wlLike(n){
  const k = wlKey(n); if (WL.local.liked[k] || n.mine) return;
  if (n.demo || !wlOnline()){ WL.local.liked[k] = 1; wlSave(); wlRebuild(); return; }
  const db = wlDb(), me = XNet.uid;
  WL.local.liked[k] = 1; wlSave(); WL.likeN[n.uid] = (WL.likeN[n.uid] || 0) + 1; wlRebuild();   /* show it at once; undone below if the server says no */
  try {
    if ((await db.ref('wallLikes/' + n.uid + '/' + me).once('value')).exists()){ WL.likeN[n.uid]--; wlRebuild(); return; }
    for (let tries = 0; tries < 4; tries++){
      const cur = +(await db.ref('wallLikeN/' + n.uid).once('value')).val() || 0;
      try {
        await db.ref().update({['wallLikes/' + n.uid + '/' + me]:true, ['wallLikeN/' + n.uid]:cur + 1});
        WL.likeN[n.uid] = cur + 1; wlRebuild(); return;
      } catch(e){ if (!wlPermErr(e)) throw e; }   /* someone else liked it at the same moment: read again */
    }
    throw new Error('like failed');
  } catch(e){
    console.warn('[wall] 点赞失败', e); delete WL.local.liked[k]; wlSave(); WL.likeN[n.uid] = Math.max(0, (WL.likeN[n.uid] || 1) - 1); wlRebuild();
    if (typeof toast === 'function') toast('没赞上', '网络不太好，稍后再试');
  }
}
function wlHide(n){ WL.local.hidden[wlKey(n)] = 1; wlSave(); WL.sel = null; WL.view = 'list'; wlRebuild(); if (typeof toast === 'function') toast('这张不会再出现在你的墙上了'); }
async function wlReport(n){
  wlHide(n);
  if (n.demo || !wlOnline()) return;
  const db = wlDb(), me = XNet.uid;
  try {
    if ((await db.ref('wallFlags/' + n.uid + '/' + me).once('value')).exists()) return;
    for (let tries = 0; tries < 4; tries++){
      const cur = +(await db.ref('wallFlagN/' + n.uid).once('value')).val() || 0;
      try { await db.ref().update({['wallFlags/' + n.uid + '/' + me]:true, ['wallFlagN/' + n.uid]:cur + 1}); WL.flagN[n.uid] = cur + 1; return; }
      catch(e){ if (!wlPermErr(e)) throw e; }
    }
  } catch(e){ console.warn('[wall] 举报失败', e); }
}
async function wlTear(){
  if (wlOnline()){
    try { await wlDb().ref('wall/' + XNet.uid).remove(); } catch(e){ console.warn('[wall] 撕不掉', e); if (typeof toast === 'function') toast('没撕掉', '网络不太好，稍后再试'); return; }
    WL.remote = (WL.remote || []).filter(n => n.uid !== XNet.uid);
  } else WL.local.mine = null;
  wlSave(); WL.sel = null; WL.view = 'list'; wlRebuild();
}
/* 「你的留言收到 N 个赞」: compared with what this machine saw last time, shown once you are in the game */
function wlLikesNotice(){
  const m = wlMineNote(); if (!m) return;
  const n = wlOnline() ? WL.likeN[m.uid] || 0 : m.likes || 0, seen = WL.local.seen || {ts:0, n:0}, base = seen.ts === m.ts ? seen.n : 0;
  if (n >= 10 && typeof unlock === 'function') unlock('wall10');
  if (n <= base){ if (seen.ts !== m.ts || seen.n !== n){ WL.local.seen = {ts:m.ts, n}; wlSave(); } return; }
  const show = () => {
    if (typeof mode !== 'undefined' && mode === 'orbit') return setTimeout(show, 3000);   /* still on the title screen */
    if (typeof toast === 'function') toast(`你的留言收到 ${n - base} 个赞`, `「${m.text.length > 14 ? m.text.slice(0, 13) + '…' : m.text}」一共 ${n} 个赞 · 图书馆门口的留言墙` + (wlOnline() ? '' : '（离线：示范玩家点的）'), 4200);
    wlSfx('ding');
  };
  WL.local.seen = {ts:m.ts, n}; wlSave(); show();
}
/* offline: the demo players drop by while you are away and like your note now and then */
function wlOfflineVisitors(){
  const m = WL.local.mine; if (!m || wlOnline()) return;
  const away = Date.now() - Math.max(m.ts, WL.local.visit || 0);
  if (away > 60e3 && (m.likes || 0) < 15){ m.likes = (m.likes || 0) + 1 + ((Math.random() * 3) | 0); WL.local.visit = Date.now(); wlSave(); }
}
if (typeof achAdd === 'function') achAdd([['wall1', '留言墙上见', '第一次在图书馆门口的留言墙上贴便利贴', 10], ['wall10', '人气留言', '一张便利贴收到 10 个赞', 40]]);

/* ---------- panel ---------- */
{ const st = document.createElement('style'); st.textContent = `
#wlPanel{position:fixed;z-index:7;right:12px;top:calc(var(--safe-t, 0px) + 70px);width:360px;max-width:calc(100% - 24px);max-height:calc(100% - 180px);overflow:auto;box-sizing:border-box;
  padding:14px 16px;border-top:3px solid #c39566;background:var(--panel-solid);overscroll-behavior:contain}
#wlPanel[hidden]{display:none}
#wlPanel h2{font-family:var(--display);font-size:20px;margin:6px 34px 2px 0;letter-spacing:.03em}
#wlPanel .wl-sub{font-size:12.5px;color:var(--muted);margin:0 0 10px;line-height:1.55}
#wlPanel .wl-note{font-size:12px;color:var(--muted);line-height:1.6;margin:10px 0 0}
#wlPanel .wl-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center}
#wlPanel .wl-row .btn{min-height:36px}
#wlPanel .wl-back{position:absolute;top:8px;right:44px;height:32px;padding:0 10px;border:0;border-radius:16px;background:var(--chip);color:var(--ink);font:inherit;font-size:13px;cursor:pointer}
.wl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px 8px;margin-top:6px}
.wl-mini{position:relative;aspect-ratio:1;border:0;padding:12px 7px 18px;box-sizing:border-box;text-align:left;color:#2a2622;cursor:pointer;
  font:600 12.5px/1.35 "Kaiti SC","STKaiti","KaiTi",var(--body);box-shadow:1px 3px 6px rgba(40,20,0,.28);transform:rotate(var(--r,0deg));overflow:hidden;border-radius:2px}
.wl-mini:hover,.wl-mini:focus-visible{transform:rotate(0) scale(1.04);z-index:1}
.wl-mini .t{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
.wl-mini .n{position:absolute;right:6px;bottom:3px;font:500 10.5px var(--body);color:rgba(40,30,20,.6);max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wl-mini .h{position:absolute;left:6px;bottom:3px;font:600 10.5px var(--body);color:#d23b4b}
.wl-mini .me{position:absolute;left:0;top:0;width:0;height:0;border-style:solid;border-width:22px 22px 0 0;border-color:#e3a92b transparent transparent transparent}
.wl-mini .me::after{content:"我";position:absolute;left:2px;top:-22px;font:800 10px var(--body);color:#fff}
.wl-mini .dm,.wl-big .dm{position:absolute;right:5px;top:4px;font:700 10px var(--body);color:#c62828;border:1px solid rgba(198,40,40,.7);padding:0 3px;transform:rotate(10deg)}
#wlPanel h3{font-size:12px;letter-spacing:.06em;color:var(--muted);margin:12px 0 4px;font-weight:500}
.wl-big{position:relative;margin:4px auto 0;width:min(100%,280px);aspect-ratio:1;padding:26px 20px 34px;box-sizing:border-box;color:#2a2622;box-shadow:2px 6px 14px rgba(40,20,0,.3);
  font:600 21px/1.5 "Kaiti SC","STKaiti","KaiTi",var(--body);word-break:break-all;display:flex;align-items:center;transform:rotate(-1.2deg)}
.wl-big .n{position:absolute;right:14px;bottom:10px;font:500 13px var(--body);color:rgba(40,30,20,.65)}
.wl-big .w{position:absolute;left:14px;bottom:10px;font:500 12px var(--body);color:rgba(40,30,20,.5)}
.wl-big .pin{position:absolute;left:50%;top:8px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#d6453d 35%,#5a1010);box-shadow:2px 2px 2px rgba(0,0,0,.3)}
.wl-like{display:inline-flex;align-items:center;gap:6px}
.wl-like.on{background:#d23b4b;border-color:#d23b4b;color:#fff}
#wlPanel textarea{display:block;width:100%;box-sizing:border-box;min-height:104px;resize:none;border:0;border-radius:3px;padding:14px 14px 10px;font:600 18px/1.5 "Kaiti SC","STKaiti","KaiTi",var(--body);
  color:#2a2622;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08),1px 4px 10px rgba(40,20,0,.2);outline:none}
#wlPanel textarea:focus{box-shadow:inset 0 0 0 2px rgba(181,68,42,.55),1px 4px 10px rgba(40,20,0,.2)}
#wlPanel .wl-count{font-size:12px;color:var(--muted);text-align:right;margin-top:4px;font-variant-numeric:tabular-nums}
#wlPanel .wl-count.over{color:#d23b4b}
#wlPanel .wl-err{font-size:12.5px;color:#d23b4b;min-height:1.4em;margin:4px 0 0}
.wl-colors{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.wl-colors button{width:34px;height:34px;border-radius:50%;border:2px solid transparent;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);cursor:pointer;padding:0}
.wl-colors button.on{border-color:var(--ink);transform:scale(1.08)}
#wlPanel .wl-empty{font-size:13px;color:var(--muted);padding:16px 0;text-align:center}
@media (max-width:760px){
  #wlPanel{right:12px;left:12px;width:auto;max-width:none;top:auto;bottom:calc(var(--safe-b, 0px) + 200px);max-height:52vh;padding:12px 14px}
  #wlPanel h2{font-size:18px}
  #wlPanel.kb{top:var(--wl-top, 8px);bottom:auto;max-height:var(--wl-h, 50vh)}
  .wl-grid{grid-template-columns:repeat(auto-fill,minmax(76px,1fr))}
}`; document.head.appendChild(st); }
const wlEl = document.createElement('div'); wlEl.className = 'panel'; wlEl.id = 'wlPanel'; wlEl.hidden = true;
wlEl.setAttribute('role', 'dialog'); wlEl.setAttribute('aria-label', '留言墙'); document.body.appendChild(wlEl);
/* keys typed into the note never reach the game (WASD, F, Space…) */
for (const t of ['keydown', 'keyup', 'keypress']) wlEl.addEventListener(t, e => {
  if (e.target.tagName !== 'TEXTAREA') return;
  e.stopPropagation();
  if (t === 'keydown' && e.key === 'Escape'){ e.preventDefault(); e.target.blur(); }
  if (t === 'keydown' && e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); wlSubmit(); }
});
function wlPlace(){
  wlEl.classList.remove('kb');
  if (innerWidth > 760){ wlEl.style.bottom = ''; return; }
  const vv = window.visualViewport, ta = wlEl.querySelector('textarea');
  /* phone keyboard up: sit at the top of what is still visible, so the box you type in is never under the keyboard */
  if (vv && ta && document.activeElement === ta && vv.height < innerHeight * .86){
    wlEl.classList.add('kb'); wlEl.style.setProperty('--wl-top', Math.round(vv.offsetTop + 8) + 'px'); wlEl.style.setProperty('--wl-h', Math.round(vv.height - 16) + 'px'); wlEl.style.bottom = '';
    return;
  }
  const acts = document.getElementById('acts'), r = acts && !acts.hidden ? acts.getBoundingClientRect() : null;
  wlEl.style.bottom = r && r.height ? Math.round(innerHeight - r.top + 8) + 'px' : '';
}
if (window.visualViewport){ visualViewport.addEventListener('resize', () => { if (WL.open) wlPlace(); }); visualViewport.addEventListener('scroll', () => { if (WL.open) wlPlace(); }); }
window.addEventListener('resize', () => { if (WL.open) wlPlace(); });
let wlTick = 0;
function wlOpen(view, sel){
  if (typeof scClose === 'function') try { scClose(); } catch(e){}
  WL.open = true; WL.view = view || 'list'; WL.sel = sel || null; wlEl.hidden = false; wlRender(); wlPlace(); wlSfx('ding');
  if (wlOnline() && Date.now() - WL.fetchT > 30000) wlFetch();
  clearInterval(wlTick); wlTick = setInterval(() => { if (WL.open && (WL.view === 'post' || WL.view === 'list') && wlCooldown() > 0) wlCdText(); }, 1000);
}
function wlClose(){ if (!WL.open) return; const ta = wlEl.querySelector('textarea'); if (ta) ta.blur(); WL.open = false; wlEl.hidden = true; clearInterval(wlTick); }
function wlCdText(){ const el = wlEl.querySelector('[data-cd]'); if (el){ const cd = wlCooldown(); el.textContent = cd > 0 ? `${wlMMSS(cd)} 后可以再贴` : ''; if (!cd) wlRender(); } }
function wlMini(n){
  const C = (WL_COLORS[n.color] || WL_COLORS.yellow).c, i = WL.list.indexOf(n), r = ((wlHash(wlKey(n) + 'r') - .5) * 5).toFixed(1);
  return `<button type="button" class="wl-mini" data-i="${i}" style="background:${C};--r:${r}deg" aria-label="${wlEsc(n.name)}：${wlEsc(n.text)}">
    ${n.mine ? '<i class="me"></i>' : ''}${n.demo ? '<i class="dm">示范</i>' : ''}<span class="t">${wlEsc(n.text)}</span>${n.likes > 0 ? `<span class="h">♥ ${n.likes}</span>` : ''}<span class="n">${wlEsc(n.name)}</span></button>`;
}
function wlRender(){
  if (!WL.open) return;
  const online = wlOnline(), mine = WL.list.find(n => n.mine) || wlMineNote(), cd = wlCooldown(), top = wlEl.scrollTop;
  const x = '<button class="x" aria-label="关闭" data-a="close">×</button>', back = '<button type="button" class="wl-back" data-a="back">‹ 返回</button>';
  if (WL.view === 'note' && WL.sel){
    const n = WL.list.find(m => wlKey(m) === WL.sel) || (mine && wlKey(mine) === WL.sel ? mine : null);
    if (!n){ WL.view = 'list'; return wlRender(); }
    const C = (WL_COLORS[n.color] || WL_COLORS.yellow).c, liked = !!WL.local.liked[wlKey(n)];
    let acts, note = '';
    if (n.mine){
      acts = `<button type="button" class="btn buy" data-a="post">换一张</button><button type="button" class="btn" data-a="tear">${WL.tear ? '再点一次确认撕掉' : '撕掉'}</button>`;
      note = n.flagged ? '这张被好几个人举报，别人已经看不到了。换一张新的就会重新上墙。' : `一共 ${n.likes} 个赞。` + (online ? '有人点赞，下次上线会告诉你。' : '离线时示范玩家偶尔会来点赞，下次打开游戏告诉你。');
    } else {
      acts = `<button type="button" class="btn wl-like${liked ? ' on' : ''}" data-a="like" ${liked ? 'aria-pressed="true"' : ''}>${liked ? '♥ 已赞' : '♡ 点赞'} · ${n.likes}</button>`
        + `<button type="button" class="btn" data-a="hide">隐藏这张</button>` + (n.demo ? '' : `<button type="button" class="btn" data-a="report">举报</button>`);
      note = n.demo ? '这是示范便利贴，联机后会被真实玩家的留言挤下去。' : liked ? '每人每张只能赞一次。' : '';
      if (!n.demo && !online) note = '离线时举报只在本机隐藏。';
    }
    wlEl.innerHTML = `${x}${back}<span class="tag">留言墙</span>
      <div class="wl-big" style="background:${C}"><i class="pin"></i>${n.demo ? '<i class="dm">示范</i>' : ''}<span>${wlEsc(n.text)}</span><span class="w">${wlAgo(n.ts)}</span><span class="n">— ${wlEsc(n.name)}${n.mine ? '（我）' : ''}</span></div>
      <div class="wl-row" style="justify-content:center">${acts}</div>${note ? `<p class="wl-note" style="text-align:center">${note}</p>` : ''}`;
  } else if (WL.view === 'post'){
    const d = WL.draft, C = WL_COLORS[d.color].c, why = d.text ? wlCheck(wlClean(d.text)) : '', len = d.text.length;
    const blocked = !online ? '' : !wlRegName() ? '先在标题页注册昵称，才能在全服的留言墙上贴。' : '';
    wlEl.innerHTML = `${x}${back}<span class="tag">留言墙</span><h2>${mine ? '换一张便利贴' : '贴一张便利贴'}</h2>
      <p class="wl-sub">${mine ? '每人同时只有一张，新的会换掉旧的（旧的赞也会清零）。' : '写给路过图书馆的同学，大家都能看到、点赞。'}</p>
      <textarea maxlength="${WL_MAX}" rows="3" enterkeyhint="send" placeholder="想对路过的同学说点什么…（最多 ${WL_MAX} 字）" style="background:${C}" aria-label="便利贴内容">${wlEsc(d.text)}</textarea>
      <div class="wl-count${len > WL_MAX ? ' over' : ''}">${len} / ${WL_MAX}</div>
      <div class="wl-colors" role="radiogroup" aria-label="便利贴颜色">${Object.entries(WL_COLORS).map(([k, v]) => `<button type="button" role="radio" aria-checked="${k === d.color}" aria-label="${v.n}" title="${v.n}" data-c="${k}" class="${k === d.color ? 'on' : ''}" style="background:${v.c}"></button>`).join('')}</div>
      <p class="wl-err" data-err>${wlEsc(blocked || WL.err || why)}</p>
      <div class="wl-row"><button type="button" class="btn buy" data-a="send" ${blocked || cd > 0 || !d.text.trim() || why ? 'disabled' : ''}>贴上去</button><span class="wl-note" style="margin:0" data-cd>${cd > 0 ? `${wlMMSS(cd)} 后可以再贴` : ''}</span></div>
      <p class="wl-note">10 分钟能贴一次。不能留联系方式、链接、广告和脏话，会被直接拦下。</p>`;
  } else {
    WL.view = 'list';
    const shown = WL.list.length, real = WL.list.filter(n => !n.demo).length;
    const sub = online ? (WL.remote ? `墙上 ${shown} 张 · 赞多的在中间` : '正在读取全服的便利贴…') : `离线试玩：示范便利贴${mine ? '和你本机的那张' : ''} · 赞多的在中间`;
    let cta = mine ? `<button type="button" class="btn buy" data-a="mine">看我的那张</button><button type="button" class="btn" data-a="post" ${cd > 0 ? 'disabled' : ''}>换一张</button>`
      : `<button type="button" class="btn buy" data-a="post" ${cd > 0 ? 'disabled' : ''}>贴一张便利贴</button>`;
    cta += `<span class="wl-note" style="margin:0" data-cd>${cd > 0 ? `${wlMMSS(cd)} 后可以再贴` : ''}</span>`;
    const hid = Object.keys(WL.local.hidden).length, hot = WL.list.slice(0, 6).filter(n => n.likes > 0), fresh = WL.list.filter(n => !hot.includes(n)).sort((a, b) => b.ts - a.ts);
    wlEl.innerHTML = `${x}<span class="tag">图书馆 · A3 百姓大楼</span><h2>留言墙</h2><p class="wl-sub">${sub}</p><div class="wl-row" style="margin:0 0 10px">${cta}</div>
      ${shown ? (hot.length ? `<h3>最受欢迎 · 贴在墙中间</h3><div class="wl-grid">${hot.map(wlMini).join('')}</div><h3>最新</h3>` : '') + `<div class="wl-grid">${fresh.map(wlMini).join('')}</div>` : '<p class="wl-empty">还没有人留言，来贴第一张吧</p>'}
      <p class="wl-note">点一张放大看、点赞。每人同时只有一张，新的换掉旧的。${online && real < 6 && shown > real ? '人还少，先用几张示范填一填。' : ''}${hid ? ` 你隐藏了 ${hid} 张，<button type="button" class="wl-back" style="position:static;height:auto;padding:1px 8px" data-a="unhide">全部恢复</button>` : ''}</p>`;
  }
  wlEl.scrollTop = WL.view === 'list' ? top : 0;
  const ta = wlEl.querySelector('textarea');
  if (ta){
    ta.addEventListener('input', () => {
      WL.draft.text = ta.value.replace(/[\r\n]+/g, ' '); WL.err = '';
      const len = WL.draft.text.length, why = WL.draft.text ? wlCheck(wlClean(WL.draft.text)) : '', c = wlEl.querySelector('.wl-count'), err = wlEl.querySelector('[data-err]'), b = wlEl.querySelector('[data-a="send"]');
      c.textContent = `${len} / ${WL_MAX}`; c.classList.toggle('over', len > WL_MAX);
      if (!(online && !wlRegName())){ err.textContent = why; b.disabled = wlCooldown() > 0 || !WL.draft.text.trim() || !!why; }
    });
    ta.addEventListener('focus', () => setTimeout(wlPlace, 300)); ta.addEventListener('blur', () => setTimeout(wlPlace, 100));
  }
}
async function wlSubmit(){
  if (WL.view !== 'post' || WL.posting) return;
  const b = wlEl.querySelector('[data-a="send"]'); if (b && b.disabled) return;
  WL.posting = true; if (b){ b.disabled = true; b.textContent = '贴上去…'; }
  const err = await wlPost(WL.draft.text, WL.draft.color);
  WL.posting = false;
  if (err){ WL.err = err; wlRender(); return; }
  const ta = wlEl.querySelector('textarea'); if (ta) ta.blur();
  WL.err = ''; WL.draft.text = '';
  const mine = WL.list.find(n => n.mine);
  WL.view = mine ? 'note' : 'list'; WL.sel = mine ? wlKey(mine) : null; wlRender(); wlPlace();
  if (typeof toast === 'function') toast('贴上去了！', '路过图书馆门口的同学都能看到', 2400);
  wlSfx('ding');
}
wlEl.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const a = t.dataset.a;
  if (t.dataset.c){ WL.draft.color = t.dataset.c; const ta = wlEl.querySelector('textarea'); if (ta) ta.style.background = WL_COLORS[t.dataset.c].c;
    wlEl.querySelectorAll('.wl-colors button').forEach(x => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); wlSfx('click'); return; }
  if (t.dataset.i != null){ const n = WL.list[+t.dataset.i]; if (n){ WL.view = 'note'; WL.sel = wlKey(n); WL.tear = false; wlRender(); wlSfx('click'); } return; }
  if (a !== 'tear') WL.tear = false;
  if (a === 'close') wlClose();
  else if (a === 'back'){ WL.view = 'list'; WL.err = ''; wlRender(); wlPlace(); }
  else if (a === 'post'){ WL.view = 'post'; WL.err = ''; const m = wlMineNote(); if (m && !WL.draft.text) WL.draft.color = m.color; wlRender(); wlPlace(); if (!TOUCH){ const ta = wlEl.querySelector('textarea'); if (ta) ta.focus(); } }
  else if (a === 'mine'){ const m = WL.list.find(n => n.mine); if (m){ WL.view = 'note'; WL.sel = wlKey(m); wlRender(); } }
  else if (a === 'send') wlSubmit();
  else if (a === 'unhide'){ WL.local.hidden = {}; wlSave(); wlRebuild(); }
  else {
    const n = WL.list.find(m => wlKey(m) === WL.sel); if (!n) return;
    if (a === 'like'){ wlLike(n); wlSfx('ding'); }
    else if (a === 'hide') wlHide(n);
    else if (a === 'report') wlReport(n);
    else if (a === 'tear'){ if (WL.tear){ WL.tear = false; wlTear(); } else { WL.tear = true; wlRender(); } }
  }
});
document.addEventListener('keydown', e => { if (WL.open && e.code === 'Escape' && e.target.tagName !== 'TEXTAREA'){ e.preventDefault(); e.stopImmediatePropagation(); wlClose(); } }, true);

/* ---------- near the wall, F, and clicking a note on the board ---------- */
const wlLocal = (x, z) => { const dx = x - WL_X, dz = z - WL_Z, c = Math.cos(WL_ROT), s = Math.sin(WL_ROT); return [dx * c - dz * s, dx * s + dz * c]; };
function wlNear(){
  if (mode !== 'naiwa' || driving || nw.state === 'fly' || gx.paused) return false;
  const [lx, lz] = wlLocal(nw.x, nw.z);
  if (!(Math.abs(lx) < WL_W / 2 + 1.2 && lz > .2 && lz < 7.5)) return false;
  return !(typeof nearestCar === 'function' && nearestCar());   /* a car parked right here: F gets you in, as everywhere else */
}
{
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY}; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; down = null;
    if (mode !== 'naiwa' || !wlRoot.visible || driving || gx.paused) return;
    if (Math.hypot(nw.x - WL_X, nw.z - WL_Z) > 14) return;
    const r = renderer.domElement.getBoundingClientRect();
    v2.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(v2, camera);
    const hit = ray.intersectObject(wlBoard, false)[0]; if (!hit || !hit.uv) return;
    const mx = hit.uv.x * WL_W, my = (1 - hit.uv.y) * WL_H;
    for (let i = WL.placed.length - 1; i >= 0; i--){
      const p = WL.placed[i];
      if (Math.abs(mx - p.x) < p.s / 2 && Math.abs(my - p.y) < p.s / 2){ wlOpen('note', wlKey(p.n)); return; }
    }
    wlOpen('list');
  });
}

/* ---------- per frame: visibility, night lighting ---------- */
function wlFrame(){
  if (mode !== WL.mode){ WL.mode = mode; wlColliders(); if (mode !== 'naiwa') wlClose(); }
  const d = Math.hypot(camera.position.x - WL_X, camera.position.z - WL_Z), vis = mode !== 'hole' && d < XQ.pick(170, 240, 320);
  if (vis !== WL.vis){ WL.vis = vis; wlRoot.visible = vis; }
  if (!vis) return;
  const k = Math.round(Math.min(1, typeof cur !== 'undefined' ? cur.lamp || 0 : 0) * 40) / 40;
  if (k !== WL.k){
    WL.k = k;
    wlBoardMat.emissiveIntensity = .5 * k;
    wlLampMat.color.set('#d9d3c5').lerp(new THREE.Color('#fff4d8'), k).multiplyScalar(1 + .6 * k);
    wlPoolMat.opacity = .55 * k; wlPool.visible = k > .02;
  }
}
setInterval(() => {
  if (!wlOnline()) return;
  const near = Math.hypot(camera.position.x - WL_X, camera.position.z - WL_Z) < 300;
  if (!WL.remote || (near && Date.now() - WL.fetchT > 120000)) wlFetch();
}, 5000);
window.addEventListener('xnet', () => { if (wlOnline() && !WL.remote && !WL.busy) wlFetch(); else if (!wlOnline() && WL.remote){ WL.remote = null; wlRebuild(); } });
XQ.onChange(() => { if (wlSize()) wlDraw(); });

/* ---------- hook into the game (js/80-gta.js gx, js/90-main.js doF and frame) ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      WL.near = !base.prompt() && wlNear(); WL.prompt = '';
      if (WL.near){
        WL.prompt = (TOUCH ? '点「留言」' : '按 F ') + '打开留言墙：看看大家写了什么，也贴一张便利贴';
        const b = actF.querySelector('b'); if (b.textContent !== '留言') b.textContent = '留言';
      } else if (WL.fLbl) updateActs();
      WL.fLbl = WL.near;
      if (WL.open){ const [lx, lz] = wlLocal(nw.x, nw.z); if (driving || Math.abs(lx) > WL_W / 2 + 6 || lz < -2 || lz > 14) wlClose(); }
    },
    prompt(){ return base.prompt() || WL.prompt; },
    mini(dot){ base.mini(dot); dot(WL_X, WL_Z, '#c39566', 3); },
    leave(){ wlClose(); WL.prompt = ''; if (WL.fLbl){ WL.fLbl = false; updateActs(); } base.leave(); },
    frame(dt, T){ if (base.frame) base.frame(dt, T); wlFrame(); }
  });
  const baseF = typeof window.roomTryF === 'function' ? window.roomTryF : null;
  window.roomTryF = function(){
    if (wlNear() && !(base.prompt && base.prompt())){ if (WL.open) wlClose(); else wlOpen('list'); return true; }
    return baseF ? baseF() : false;
  };
}
wlColliders();
wlOfflineVisitors();
setTimeout(() => {
  wlRebuild();
  const go = () => { if (wlOnline()) wlFetch(); else wlLikesNotice(); };
  if (window.XNet && XNet.ready) XNet.ready.then(go, go); else go();
}, 0);

/* for testing (预览版和本地测试页): XWall.goto() puts 奶娃 in front of the wall, .open() the panel, .post(text, color), .check(text) runs the word filter */
window.XWall = {
  get list(){ return WL.list; }, get local(){ return WL.local; }, check:wlCheck, post:wlPost, open:wlOpen, close:wlClose, fetch:wlFetch, rebuild:wlRebuild,
  goto(){ const s = Math.sin(WL_ROT), c = Math.cos(WL_ROT); nw.x = WL_X + s * 4.5; nw.z = WL_Z + c * 4.5; nw.h = WL_ROT + Math.PI; if (typeof camYaw !== 'undefined') camYaw = WL_ROT; },
  visitors(){ WL.local.visit = 0; if (WL.local.mine) WL.local.mine.ts -= 120e3; wlOfflineVisitors(); wlLikesNotice(); }
};
