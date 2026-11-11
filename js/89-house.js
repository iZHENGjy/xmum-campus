/* XMUM 校园漫游 · 买房装修：校门正南 Bell Avenue 后面的 Taman Warisan Megah 排屋
 *
 * 房子：js/13-outskirts.js 的 TWM 那一排（十二户 6 米宽的双层排屋，门口带车棚）。HZ_HOUSES 里的四户挂着「出售 FOR SALE」牌子，
 *   走到门口按 F 看房（能先进去转一圈）和买；买下以后门牌写你的昵称（只有你自己看得到，不上传），按 F 回家。
 *   价格按附近同款排屋的真实成交价（约 RM 37–45 万，EdgeProp / list.my 的挂牌和成交记录）除以 50：RM 7,400–9,600，
 *   跟车行最贵的劳斯来斯（RM 3,000）、改装和财富榜前几名（RM 6,000–30,000）比，是个要攒一阵子的大目标。
 *   自己的车（myCar）停进自家车棚下车，下次上线车还停在那里。
 * 室内：搭在地图外（z = -4100，x 0 一楼、x 30 二楼，隔开一点免得两层同时入镜），没有屋顶，镜头从上往下看，跟宿舍一样。进门才生成，出门隐藏、家具释放。
 *   一楼：客厅、楼梯、饭厅、厨房、卫生间、后院；二楼：主卧、次卧、小房间。楼梯口按 F 上下楼。
 *   静态部分合并成一个 mesh（墙、门窗、楼梯、卫生间），地板一个，家具两个（普通 + 发光），换东西时整批重建。
 * 装修：五套风格（学生宿舍风、北欧原木、中式红木、电竞房、奶娃主题），每套九件，放在九个固定位置上（不做自由摆放），
 *   一件件买，买过的随时换上、收起；墙面和地板颜色另买。电竞房的部分家具要改装道具（XParts，js/93-tuning-ui.js），
 *   奶娃主题按解锁的成就数开放。界面在 js/89-house-ui.js。
 * 总资产（js/80-gta.js netWorth）：房价 + 家具原价 + 用掉的改装道具估值 + 墙面地板。
 * 存档：localStorage 'xmum-house-v1'（Google 登录的人由 js/net.js 跟其他 xmum-* 键一起云同步），很小：每户只存买过的 id。
 * 室内开关：window.XINDOOR = 'house'（indoorNow() 在 js/40-vehicles.js），巡逻车在门口等，抓不了你。
 * 对外：window.XHouse（测试和控制台用）。
 */
'use strict';
const HZ_KEY = 'xmum-house-v1', HZ_OX = 0, HZ_OZ = -4100, HZ_UP = 30, HZ_W = 4.5, HZ_WALL = 2.8, HZ_D = 16.5, HZ_YARD = 21.5;

/* ---------- the four houses for sale (unit = which of the twelve, counted from the west end) ---------- */
const HZ_HOUSES = [
  {id:'h1', u:0, no:'1', price:9600, real:48, tag:'角头屋', desc:'整排最西头的角头屋，侧面挨着小路，采光最好。'},
  {id:'h4', u:3, no:'4', price:7400, real:37, tag:'原屋况', desc:'老屋主住了十几年，墙皮有点旧，整排最便宜。'},
  {id:'h8', u:7, no:'8', price:8800, real:44, tag:'正对校门', desc:'出门往北走两分钟就是南门，赶早八最方便。'},
  {id:'h11', u:10, no:'11', price:8200, real:41, tag:'翻新过', desc:'前屋主换过厨房和地砖，拎包入住。'}
].map(h => {
  const ux = TWM.x0 + h.u * TWM.unit, zf = TWM.z0 + TWM.porch;
  return Object.assign(h, {ux, zf, name:'No. ' + h.no + ', Jalan Warisan Megah', door:{x:ux + 1.2, z:zf - 1.4, h:Math.PI, name:'No. ' + h.no},
    park:{x:ux + 3.55, z:TWM.z0 + 2.75, h:0}});
});
const hzById = id => HZ_HOUSES.find(h => h.id === id) || null;

/* ---------- catalogue: styles, the nine fixed spots, items, wall paints, floors ---------- */
const HZ_STYLES = [
  {id:'dm', name:'学生宿舍风', col:'#4f86d6', desc:'省钱第一，能用就行'},
  {id:'nd', name:'北欧原木', col:'#c9a273', desc:'浅木色加白，干净通透'},
  {id:'cn', name:'中式红木', col:'#9a3322', desc:'红木家具、青花瓷、锦鲤池'},
  {id:'es', name:'电竞房', col:'#b53bd8', desc:'黑色加霓虹灯，部分要改装道具'},
  {id:'nw', name:'奶娃主题', col:'#f2c64a', desc:'全屋奶娃黄，按解锁的成就数开放'}
];
/* x, z: local metres (x across the house, z from the front door to the back); fl 0 downstairs, 1 upstairs; r: which way the front of the piece faces */
const HZ_SLOTS = [
  {id:'sofa', name:'客厅沙发', room:'客厅', fl:0, x:1.25, z:4, r:-Math.PI / 2, w:2.8, d:1.2},
  {id:'tv', name:'电视墙', room:'客厅', fl:0, x:-4.05, z:4, r:Math.PI / 2, w:2.6, d:.6},
  {id:'deco', name:'客厅摆件', room:'客厅', fl:0, x:-3.7, z:1.05, r:Math.PI / 4, w:.9, d:.9},
  {id:'dine', name:'餐桌', room:'饭厅', fl:0, x:1.4, z:10.2, r:0, w:2, d:1.3},
  {id:'kit', name:'厨房', room:'厨房', fl:0, x:3.0, z:16.05, r:Math.PI, w:2.8, d:.75},
  {id:'yard', name:'后院', room:'后院', fl:0, x:1.4, z:19.3, r:Math.PI, w:2.4, d:1.6},
  {id:'bed', name:'主卧大床', room:'主卧', fl:1, x:-2.85, z:3.6, r:Math.PI / 2, w:2.3, d:2.9},
  {id:'desk', name:'次卧书桌', room:'次卧', fl:1, x:3.95, z:9.4, r:-Math.PI / 2, w:2, d:.8},
  {id:'hobby', name:'第三间房', room:'小房间', fl:1, x:2.6, z:15.15, r:Math.PI, w:2.4, d:2}
];
/* [style, slot, name, RM, need, desc]: need = {part id: n} (改装道具) or {ach: n}（解锁的成就数） */
const HZ_ITEMS = [
  ['dm', 'sofa', '懒人沙发', 80, null, '两个豆袋，一坐就陷进去'], ['dm', 'tv', '小电视 + 塑料柜', 100, null, '二手 32 寸，柜子是三层塑料抽屉'],
  ['dm', 'deco', '落地风扇', 40, null, '会摇头，开到三档'], ['dm', 'dine', '折叠桌 + 塑料凳', 60, null, '吃完能收起来'],
  ['dm', 'kit', '电煮锅小厨房', 90, null, '一张桌子、一个电煮锅、一箱泡面'], ['dm', 'bed', '铁架上下铺', 120, null, '宿舍同款，上铺堆杂物'],
  ['dm', 'desk', '宿舍书桌 + 台灯', 70, null, '桌上一摞二手课本'], ['dm', 'hobby', '行李箱 + 泡面箱', 50, null, '搬家那天的箱子还没拆'],
  ['dm', 'yard', '晾衣杆 + 辣椒盆', 30, null, '衣服晒在后院，两盆指天椒'],
  ['nd', 'sofa', '北欧布艺沙发', 420, null, '浅灰三人位，原木腿，配一张圆茶几'], ['nd', 'tv', '原木电视柜', 300, null, '矮柜加一台 55 寸'],
  ['nd', 'deco', '龟背竹 + 落地灯', 160, null, '晚上灯一开很暖'], ['nd', 'dine', '原木餐桌', 340, null, '四人位，配温莎椅'],
  ['nd', 'kit', '白色橱柜', 580, null, '白柜门、原木台面、嵌入式冰箱'], ['nd', 'bed', '原木双人床', 540, null, '白被子，床头两盏小灯'],
  ['nd', 'desk', '原木书桌 + 书架', 360, null, '笔记本电脑和一整架书'], ['nd', 'hobby', '阅读角', 300, null, '一面书墙、一张单人沙发'],
  ['nd', 'yard', '木平台 + 吊椅', 380, null, '下午坐在吊椅上晃'],
  ['cn', 'sofa', '红木罗汉床', 750, null, '雕花靠背，中间一张小炕几'], ['cn', 'tv', '红木电视柜 + 屏风', 560, null, '旁边立一扇四折山水屏风'],
  ['cn', 'deco', '青花瓷瓶 + 盆景', 420, null, '红木几架上一只大青花瓶'], ['cn', 'dine', '红木圆桌', 680, null, '带转盘，六张圆凳'],
  ['cn', 'kit', '红木橱柜', 820, null, '红木柜门、石台面、铜把手'], ['cn', 'bed', '红木架子床', 1100, null, '四根床柱，顶上挂帷幔'],
  ['cn', 'desk', '书法桌', 560, null, '笔架、砚台、一张宣纸'], ['cn', 'hobby', '茶室', 620, null, '茶台、紫砂壶、两把官帽椅、一幅字'],
  ['cn', 'yard', '锦鲤池 + 假山', 900, null, '一池锦鲤，旁边几根竹子'],
  ['es', 'sofa', '电竞沙发', 520, {neon:1}, '黑色皮面，底下一圈灯带'], ['es', 'tv', '75 寸大屏 + 主机', 700, {ecu:1}, '屏幕后面一圈氛围灯'],
  ['es', 'deco', 'RGB 灯柱', 260, {neon:2}, '两根灯柱，粉蓝交替'], ['es', 'dine', '吧台 + 高脚凳', 400, null, '台面上摆着能量饮料'],
  ['es', 'kit', '黑色橱柜 + 发光冰箱', 650, {neon:1}, '玻璃门冰箱里一排饮料'], ['es', 'bed', '电竞床', 760, {neon:2}, '床底一圈灯带'],
  ['es', 'desk', '三屏电竞桌', 900, {neon:2, ecu:1, cf:1}, '三块曲面屏，一把碳纤维电竞椅'],
  ['es', 'hobby', '赛车模拟器', 1200, {tyre:2, turbo:1, ecu:1}, '方向盘、踏板、桶形座椅，三块屏'],
  ['es', 'yard', '霓虹招牌 + 烧烤架', 450, {neon:3}, '后院墙上一块霓虹招牌'],
  ['nw', 'sofa', '奶娃沙发', 560, {ach:8}, '靠背是一张奶娃脸'], ['nw', 'tv', '奶娃剧场', 480, {ach:10}, '电视框是奶娃黄，天天放奶娃动画'],
  ['nw', 'deco', '巨型奶娃公仔', 420, {ach:12}, '比你还高一点'], ['nw', 'dine', '奶瓶餐桌', 420, {ach:8}, '桌腿是一个大奶瓶'],
  ['nw', 'kit', '奶黄色厨房', 620, {ach:12}, '冰箱里全是牛奶'], ['nw', 'bed', '奶娃床', 720, {ach:15}, '床头是一个大奶娃头'],
  ['nw', 'desk', '奶娃书桌', 460, {ach:15}, '台灯是奶娃造型'], ['nw', 'hobby', '奶娃球池', 760, {ach:20}, '满满一池彩色小球'],
  ['nw', 'yard', '奶娃充气泳池', 520, {ach:18}, '泳池里漂着一只奶娃小黄鸭']
].map(([st, slot, name, price, need, desc]) => ({id:st + '_' + slot, st, slot, name, price, need, desc}));
const HZ_IT = {}; for (const it of HZ_ITEMS) HZ_IT[it.id] = it;
const HZ_WALLS = [['white', '白墙', '#f1ede4', 0], ['cream', '奶油黄', '#f3e2b3', 60], ['mint', '薄荷绿', '#cfe6d6', 60], ['blue', '雾霾蓝', '#c4d3e0', 60],
  ['pink', '樱花粉', '#f2d4dc', 60], ['grey', '高级灰', '#9a9fa2', 80], ['red', '中国红', '#a8322a', 100], ['black', '电竞黑', '#2c2d33', 100]].map(([id, name, col, price]) => ({id, name, col, price}));
const HZ_FLOORS = [['terr', '水磨石', '#d6d1c6', 0], ['tile', '白瓷砖', '#eceae4', 150], ['oak', '原木地板', '#d2ad7c', 260], ['walnut', '深色木地板', '#6e4a32', 300],
  ['marble', '大理石', '#f2f0ec', 450], ['carpet', '灰色地毯', '#8d9093', 200]].map(([id, name, col, price]) => ({id, name, col, price}));
const hzWallOf = id => HZ_WALLS.find(w => w.id === id) || HZ_WALLS[0];
const hzFloorOf = id => HZ_FLOORS.find(f => f.id === id) || HZ_FLOORS[0];

/* ---------- save ---------- */
/* hz.own[houseId] = {t: bought (ms), s: {slot: item id placed}, it: [item ids bought], w / f: wall / floor in use, ow / of: wall / floor ids bought};
   hz.park = the house whose carport your car was left in; hz.spent = RM spent here in all (for the cloud save's progress score) */
const hz = {own:{}, park:null, spent:0, seen:false};
function hzWrite(){ try { localStorage.setItem(HZ_KEY, JSON.stringify(hz)); } catch(e){} }
(function hzLoad(){
  try {
    const d = JSON.parse(localStorage.getItem(HZ_KEY) || 'null'); if (!d || typeof d !== 'object') return;
    if (d.own && typeof d.own === 'object') for (const h of HZ_HOUSES){
      const o = d.own[h.id]; if (!o || typeof o !== 'object') continue;
      const it = (Array.isArray(o.it) ? o.it : []).filter(id => HZ_IT[id]), s = {};
      if (o.s && typeof o.s === 'object') for (const sl of HZ_SLOTS){ const id = o.s[sl.id]; if (it.includes(id) && HZ_IT[id].slot === sl.id) s[sl.id] = id; }
      const ow = (Array.isArray(o.ow) ? o.ow : []).filter(id => HZ_WALLS.some(w => w.id === id && w.price)), of = (Array.isArray(o.of) ? o.of : []).filter(id => HZ_FLOORS.some(f => f.id === id && f.price));
      hz.own[h.id] = {t:+o.t || Date.now(), s, it:[...new Set(it)], ow:[...new Set(ow)], of:[...new Set(of)],
        w:ow.includes(o.w) ? o.w : 'white', f:of.includes(o.f) ? o.f : 'terr'};
    }
    hz.park = hz.own[d.park] ? d.park : null; hz.spent = Math.max(0, +d.spent || 0); hz.seen = !!d.seen;
  } catch(e){}
})();
const hzMine = id => hz.own[id] || null;
const hzOwnedList = () => HZ_HOUSES.filter(h => hz.own[h.id]);

/* ---------- what things are worth (总资产) and whether you can have them ---------- */
const hzPartRM = need => { let s = 0; if (need && window.XParts) for (const k in need) if (k !== 'ach'){ const p = XParts.list.find(q => q.id === k); if (p) s += p.rm * need[k]; } return s; };
const hzItemWorth = it => it.price + hzPartRM(it.need);
function hzHouseWorth(id){
  const o = hz.own[id], h = hzById(id); if (!o || !h) return 0;
  let s = h.price;
  for (const i of o.it) s += hzItemWorth(HZ_IT[i]);
  for (const w of o.ow) s += hzWallOf(w).price;
  for (const f of o.of) s += hzFloorOf(f).price;
  return s;
}
assetSource('house', () => HZ_HOUSES.reduce((s, h) => s + hzHouseWorth(h.id), 0));
const hzAchN = () => Object.keys(prog.ach).length;
const hzPartName = id => { const p = window.XParts && XParts.list.find(q => q.id === id); return p ? p.name : id; };
/* what is missing for an item (besides money): [] when nothing; each entry {txt, part?} */
function hzMissing(it){
  const out = []; if (!it.need) return out;
  if (it.need.ach){ const n = hzAchN(); if (n < it.need.ach) out.push({txt:`成就 ${n} / ${it.need.ach}`, ach:it.need.ach - n}); return out; }
  for (const k in it.need){ const have = window.XParts ? XParts.count(k) : 0; if (have < it.need[k]) out.push({txt:`${hzPartName(k)} ${have} / ${it.need[k]}`, part:k}); }
  return out;
}
const hzNeedText = need => !need ? '' : need.ach ? `解锁 ${need.ach} 个成就` : Object.keys(need).map(k => `${hzPartName(k)} ×${need[k]}`).join('、');
/* the parts an item uses are taken from the 改装 backpack (js/93-tuning-ui.js keeps it in `tune`) */
function hzTakeParts(need){
  if (!need || need.ach) return true;
  if (typeof tune === 'undefined' || !tune.inv) return false;
  for (const k in need) if ((tune.inv[k] || 0) < need[k]) return false;
  for (const k in need) tune.inv[k] -= need[k];
  if (typeof tuneWrite === 'function') tuneWrite();
  return true;
}

/* ---------- achievements ---------- */
const HZ_ACH = [['house1', '有房一族', '在校门外买下第一套房子', 100], ['deco9', '装修达人', '一套房子的九个位置都摆上家具', 200],
  ['decoset', '整屋同款', '一套房子九件家具全是同一种风格', 150]];
if (typeof achAdd === 'function') achAdd(HZ_ACH); else ACH.push(...HZ_ACH);
function hzCheckAch(id){
  const o = hz.own[id]; if (!o) return;
  unlock('house1');
  const placed = HZ_SLOTS.map(s => o.s[s.id]).filter(Boolean);
  if (placed.length === HZ_SLOTS.length){ unlock('deco9'); if (placed.every(i => HZ_IT[i].st === HZ_IT[placed[0]].st)) unlock('decoset'); }
}

/* ---------- outside: FOR SALE boards and door plates, all on one canvas and one mesh ---------- */
const hzSignCv = document.createElement('canvas'); hzSignCv.width = hzSignCv.height = 512;
const hzSignTex = new THREE.CanvasTexture(hzSignCv); hzSignTex.anisotropy = typeof ANISO !== 'undefined' ? ANISO : 1;
const hzSignMat = new THREE.MeshBasicMaterial({map:hzSignTex, vertexColors:true});
const HZ_FONT = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
const hzMyName = () => { let n = ''; try { n = (window.XUI && XUI.playerName && XUI.playerName()) || localStorage.getItem('xmum-name') || ''; } catch(e){} return String(n || '我').slice(0, 12); };
function hzPaintSigns(){
  const g = hzSignCv.getContext('2d'); g.clearRect(0, 0, 512, 512);
  g.fillStyle = '#ffffff'; g.fillRect(480, 480, 32, 32);   /* plain white cell for posts (tinted by vertex colour) */
  HZ_HOUSES.forEach((h, i) => {
    const sx = (i % 2) * 256, sy = Math.floor(i / 2) * 160;
    /* sale board: red header, white body, price */
    g.fillStyle = '#ffffff'; g.fillRect(sx + 4, sy + 4, 248, 152); g.fillStyle = '#c62f27'; g.fillRect(sx + 4, sy + 4, 248, 58);
    g.strokeStyle = '#c62f27'; g.lineWidth = 6; g.strokeRect(sx + 7, sy + 7, 242, 146);
    g.fillStyle = '#ffffff'; g.font = `900 34px ${HZ_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('出售 FOR SALE', sx + 128, sy + 34);
    g.fillStyle = '#1f2a33'; g.font = `800 34px ${HZ_FONT}`; g.fillText('RM ' + h.price.toLocaleString(), sx + 128, sy + 92);
    g.font = `500 20px ${HZ_FONT}`; g.fillStyle = '#5b6670'; g.fillText(`${h.tag} · 按 F 看房`, sx + 128, sy + 130, 236);
    /* door plate */
    const px = (i % 2) * 256, py = 320 + Math.floor(i / 2) * 80, mine = !!hz.own[h.id];
    g.fillStyle = mine ? '#1f3a5c' : '#e8e2d4'; g.fillRect(px + 4, py + 4, 248, 72); g.strokeStyle = mine ? '#d2b06a' : '#9a8f7c'; g.lineWidth = 4; g.strokeRect(px + 6, py + 6, 244, 68);
    g.fillStyle = mine ? '#f6e7c1' : '#3a3530'; g.font = `800 ${mine ? 24 : 30}px ${HZ_FONT}`;
    if (mine){ g.fillText('No. ' + h.no, px + 128, py + 26); g.font = `700 22px ${HZ_FONT}`; g.fillText(hzMyName() + ' 的家', px + 128, py + 55, 230); }
    else g.fillText('No. ' + h.no, px + 128, py + 40);
  });
  hzSignTex.needsUpdate = true;
}
let hzSignMesh = null;
function hzBuildSigns(){
  const parts = [], uvq = (geo, u0, v0, u1, v1) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0); return geo; };
  const white = (geo, col) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 496 / 512, 16 / 512); return geoTint(geo, col); };
  HZ_HOUSES.forEach((h, i) => {
    const sx = (i % 2) * 256, sy = Math.floor(i / 2) * 160, px = (i % 2) * 256, py = 320 + Math.floor(i / 2) * 80;
    if (!hz.own[h.id]){
      const bx = h.ux + 4.9, bz = TWM.z0 - .75, by = 3.1;
      /* the board faces the street (north, -z): a plane turned half round */
      parts.push(geoTint(geoAt(uvq(new THREE.PlaneGeometry(1.6, 1), (sx + 4) / 512, 1 - (sy + 156) / 512, (sx + 252) / 512, 1 - (sy + 4) / 512), bx, by, bz - .04, 0, Math.PI, 0), '#ffffff'));
      parts.push(white(geoAt(new THREE.BoxGeometry(1.7, 1.1, .05), bx, by, bz), '#f2efe8'));
      parts.push(white(geoAt(new THREE.BoxGeometry(.09, by + .5, .09), bx - .7, (by + .5) / 2, bz + .05), '#6d7378'), white(geoAt(new THREE.BoxGeometry(.09, by + .5, .09), bx + .7, (by + .5) / 2, bz + .05), '#6d7378'));
    }
    parts.push(geoTint(geoAt(uvq(new THREE.PlaneGeometry(.95, .3), (px + 4) / 512, 1 - (py + 76) / 512, (px + 252) / 512, 1 - (py + 4) / 512), h.ux + 2.25, 2.3, h.zf - .03, 0, Math.PI, 0), '#ffffff'));
  });
  const geo = geoMergeUV(parts);
  if (hzSignMesh){ hzSignMesh.geometry.dispose(); hzSignMesh.geometry = geo; }
  else { hzSignMesh = new THREE.Mesh(geo, hzSignMat); scene.add(hzSignMesh); }
  hzPaintSigns();
}
hzBuildSigns();
window.addEventListener('xmum-name', () => { if (hzOwnedList().length) hzPaintSigns(); });
/* floating labels over the boards, only when you are near (phones would drown in them otherwise) */
const hzLbls = HZ_HOUSES.map(h => { const l = addLabel('', h.ux + 3, 4.2, TWM.z0 + 1.2, true); l.dead = true; return l; });
function hzLblText(h){ return hz.own[h.id] ? `${hzMyName()} 的家 · No. ${h.no}` : `出售 · No. ${h.no} · RM ${h.price.toLocaleString()}`; }

/* ---------- inside: one shell for both floors, built the first time you walk in ---------- */
const hzG = new THREE.Group(); hzG.visible = false; scene.add(hzG);
const HX = (x, fl) => HZ_OX + x + (fl ? HZ_UP : 0), HZZ = z => HZ_OZ + z;
const hzSolidMat = M('#ffffff', {vertexColors:true, roughness:.85, emissive:'#fff1d8', emissiveIntensity:0});
/* at night the lights are on inside: emissive times the vertex colour, so things glow in their own colour instead of washing out */
hzSolidMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif'); };
const hzGlowMat = new THREE.MeshBasicMaterial({vertexColors:true});
/* walls and fixtures: the same, a little self-lit so the walls in shade do not go dark grey next to the sunlit floor */
const hzShellMat = hzSolidMat.clone(); hzShellMat.onBeforeCompile = hzSolidMat.onBeforeCompile; hzShellMat.emissiveIntensity = .22;
const hzFloorMat = M('#c4bfb6', {roughness:.75, emissive:'#fff1d8', emissiveIntensity:0});
/* the floor plan: walls (local x0, z0, x1, z1, floor, height); doorways are gaps. Colliders are made from the same list. */
const HZ_WALLS_PLAN = (() => {
  const W = HZ_W, D = HZ_D, H = HZ_WALL, w = [];
  const wall = (x0, z0, x1, z1, fl, h) => w.push({x0, z0, x1, z1, fl, h:h || H});
  for (const fl of [0, 1]){
    wall(-W - .1, -.1, W + .1, .1, fl); wall(-W - .1, 0, -W + .1, D, fl); wall(W - .1, 0, W + .1, D, fl);
  }
  /* downstairs: back wall with the yard door, the bathroom behind the stairs, yard walls */
  wall(-W, D - .1, -1.3, D + .1, 0); wall(1.5, D - .1, W, D + .1, 0);
  wall(-1.7, 12.8, -1.5, D, 0); wall(-W, 12.7, -1.5, 12.9, 0);
  wall(-W - .1, D, -W + .1, HZ_YARD, 0, 2.1); wall(W - .1, D, W + .1, HZ_YARD, 0, 2.1); wall(-W - .1, HZ_YARD - .1, W + .1, HZ_YARD + .1, 0, 2.1);
  /* upstairs: master bedroom across the front, corridor beside the stairwell, two bedrooms on the east side */
  wall(-W, D - .1, W, D + .1, 1);
  wall(-W, 6.9, -2.6, 7.1, 1); wall(.6, 6.9, W, 7.1, 1);
  wall(.5, 7, .7, 8.2, 1); wall(.5, 11, .7, 12.6, 1); wall(.5, 15.4, .7, D, 1);
  wall(.6, 11.7, W, 11.9, 1);
  return w;
})();
const HZ_STAIRS = [{x:-3.55, z:7.1, fl:0, to:1, label:'上楼'}, {x:-3.55, z:13.75, fl:1, to:0, label:'下楼'}];
const HZ_EXIT = {x:2.6, z:1.3};
/* solid blocks you cannot walk into: the stair flight, the bathroom, the stairwell upstairs, the master wardrobe */
const HZ_BLOCKS = [[-HZ_W, 8, -2.6, 12.8, 0], [-HZ_W, 12.8, -1.6, HZ_D, 0], [-HZ_W, 7, -2.6, 12.8, 1], [3.85, 1, HZ_W, 5.2, 1], [-HZ_W, 16.6, -2.7, 18.2, 0]];
const hzCols = [];
(function hzMakeCols(){
  for (const w of HZ_WALLS_PLAN){ const c = addBox(HX((w.x0 + w.x1) / 2, w.fl), HZZ((w.z0 + w.z1) / 2), (w.x1 - w.x0) / 2, (w.z1 - w.z0) / 2, 0); c.dead = true; hzCols.push(c); }
  for (const [x0, z0, x1, z1, fl] of HZ_BLOCKS){ const c = addBox(HX((x0 + x1) / 2, fl), HZZ((z0 + z1) / 2), (x1 - x0) / 2, (z1 - z0) / 2, 0); c.dead = true; hzCols.push(c); }
})();
let hzShell = null, hzFloor = null, hzShellWall = '';
const hzBox = (P, w, h, d, x, y, z, col, ry) => P.push(geoTint(geoAt(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, 0, ry || 0, 0), col));
function hzBuildShell(wallId){
  const P = [], wc = hzWallOf(wallId).col, dark = new THREE.Color(wc).multiplyScalar(.82).getStyle();
  for (const w of HZ_WALLS_PLAN){
    const cx = HX((w.x0 + w.x1) / 2, w.fl), cz = HZZ((w.z0 + w.z1) / 2), lx = w.x1 - w.x0, lz = w.z1 - w.z0, yard = w.h < HZ_WALL;
    hzBox(P, lx, w.h, lz, cx, 0, cz, yard ? '#c9c2b4' : wc);
    hzBox(P, lx + .02, .05, lz + .02, cx, w.h, cz, '#4a4f55');
    if (!yard) hzBox(P, lx + .04, .14, lz + .04, cx, 0, cz, dark);    /* skirting */
  }
  const B = (fl, x0, y0, z0, x1, y1, z1, col) => hzBox(P, x1 - x0, y1 - y0, z1 - z0, HX((x0 + x1) / 2, fl), y0, HZZ((z0 + z1) / 2), col);
  /* front door, windows (both floors), the yard door */
  B(0, 1.6, 0, .1, 3.6, 2.5, .2, '#6b4a33'); B(0, 3.25, 1.1, .2, 3.4, 1.3, .3, '#d9b45a');
  for (const fl of [0, 1]){
    const xs = fl ? [[-3.6, -.6], [1, 3.6]] : [[-3.4, .6]];
    for (const [a, b] of xs){ B(fl, a, 1, .1, b, 2.3, .16, '#9cc3d9'); B(fl, a - .08, .95, .1, b + .08, 1, .22, '#f4f1ea'); }
    B(fl, -3, 1.1, HZ_D - .16, -1.4 + (fl ? 3 : 0), 2.3, HZ_D - .1, '#9cc3d9');
  }
  B(1, 1.6, 1.1, HZ_D - .16, 3.6, 2.3, HZ_D - .1, '#9cc3d9');
  /* stairs: eight steps up to the south downstairs; upstairs a dark stairwell with the top steps and a rail */
  for (let i = 0; i < 8; i++) B(0, -HZ_W + .1, 0, 8 + i * .6, -2.65, .3 + i * .3, 8.6 + i * .6, i % 2 ? '#b89a76' : '#c7a985');
  B(0, -2.68, 0, 8, -2.58, 1.1, 12.8, '#7a5a3e');
  B(1, -HZ_W + .1, 0, 7.1, -2.65, .02, 12.8, '#3a3631');
  for (let i = 0; i < 4; i++) B(1, -HZ_W + .1, .02, 12.8 - (i + 1) * .6, -2.65, .04, 12.8 - i * .6 - .08, '#b89a76');
  B(1, -2.68, 0, 7.1, -2.58, 1.1, 12.8, '#7a5a3e'); B(1, -2.7, 1.05, 7.1, -2.56, 1.15, 12.8, '#5a3f2b');
  /* bathroom: tiled floor, toilet, basin, shower glass; its door faces the kitchen */
  B(0, -HZ_W + .1, .01, 12.9, -1.7, .03, HZ_D - .1, '#cfdbe0');
  B(0, -3.9, 0, 15.2, -3.3, .5, 15.9, '#f4f4f2'); B(0, -3.95, .5, 15.75, -3.25, 1.1, 16.25, '#f4f4f2');
  B(0, -2.4, .9, 15.8, -1.8, 1, 16.3, '#f4f4f2'); B(0, -4.4, 0, 13, -3.2, 2.2, 13.05, '#cfe6ef');
  B(0, -1.62, 0, 13.6, -1.5, 2.4, 14.9, '#d9c7a8');
  /* yard: concrete, a drain, the washing machine and a tap; master wardrobe upstairs */
  B(0, -HZ_W, 0, HZ_D, HZ_W, .02, HZ_YARD, '#a9a59c'); B(0, -HZ_W + .2, .021, HZ_YARD - .5, HZ_W - .2, .03, HZ_YARD - .3, '#7d7a73');
  B(0, -4.2, 0, 16.9, -3.1, 1.15, 17.9, '#eef0f1'); B(0, -3.95, .7, 17.9, -3.35, 1.05, 17.92, '#9fb6c3');
  B(1, 3.9, 0, 1.05, 4.4, 2.3, 5.15, '#d6cfc2'); B(1, 3.88, 1.1, 3.05, 3.9, 1.3, 3.15, '#8a7a62');
  const geo = geoMerge(P);
  if (hzShell){ hzShell.geometry.dispose(); hzShell.geometry = geo; } else { hzShell = new THREE.Mesh(geo, hzShellMat); hzShell.receiveShadow = true; hzShell.castShadow = true; hzG.add(hzShell); }
  hzShellWall = wallId;
}
/* floors: one canvas texture per kind, made when first used */
const hzFloorTex = {};
function hzFloorTexOf(id){
  if (hzFloorTex[id]) return hzFloorTex[id];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), R = mkRng(911 + id.length * 7), f = hzFloorOf(id);
  g.fillStyle = f.col; g.fillRect(0, 0, 256, 256);
  if (id === 'terr'){ for (let i = 0; i < 900; i++){ g.fillStyle = ['#8f8a80', '#b7b0a3', '#efe9de', '#a77e5c', '#6f7a7e'][i % 5]; g.globalAlpha = .55; const s = 1 + R() * 3.5; g.fillRect(R() * 256, R() * 256, s, s * (.6 + R())); } g.globalAlpha = 1; }
  else if (id === 'tile' || id === 'marble'){
    if (id === 'marble'){ g.strokeStyle = 'rgba(120,120,128,.35)'; g.lineWidth = 1.2; for (let i = 0; i < 9; i++){ g.beginPath(); let x = R() * 256, y = R() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++){ x += (R() - .3) * 60; y += (R() - .5) * 50; g.lineTo(x, y); } g.stroke(); } }
    g.strokeStyle = id === 'tile' ? '#c9c6be' : 'rgba(200,198,192,.9)'; g.lineWidth = 3; for (let i = 0; i <= 256; i += id === 'tile' ? 64 : 128){ g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  } else if (id === 'oak' || id === 'walnut'){
    for (let r = 0; r < 8; r++){ const y = r * 32, off = R() * 256; g.fillStyle = `rgba(0,0,0,${.04 + R() * .08})`; g.fillRect(0, y, 256, 32);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, 256, 1.5); g.fillRect(off, y, 1.5, 32);
      g.strokeStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 4; k++){ g.beginPath(); g.moveTo(0, y + 5 + k * 7); g.bezierCurveTo(80, y + 3 + k * 7 + R() * 4, 170, y + 8 + k * 7, 256, y + 5 + k * 7); g.stroke(); } }
  } else if (id === 'carpet'){ for (let i = 0; i < 4000; i++){ g.fillStyle = R() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(R() * 256, R() * 256, 1.5, 1.5); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = typeof ANISO !== 'undefined' ? ANISO : 1;
  return hzFloorTex[id] = t;
}
function hzSetFloor(id){
  if (!hzFloor){
    const P = [];
    for (const fl of [0, 1]){
      const g = new THREE.PlaneGeometry(HZ_W * 2, HZ_D); g.rotateX(-Math.PI / 2); g.translate(HX(0, fl), 0, HZZ(HZ_D / 2));
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * HZ_W * 2 / 2.4, uv.getY(i) * HZ_D / 2.4);
      P.push(g);
    }
    hzFloor = new THREE.Mesh(geoMergeUV(P), hzFloorMat); hzFloor.receiveShadow = true; hzG.add(hzFloor);
  }
  hzFloorMat.map = hzFloorTexOf(id); hzFloorMat.needsUpdate = true;
}

/* ---------- furniture: every model is a handful of boxes, cylinders and balls, merged; glowing parts go to a second mesh ---------- */
function hzKit(){
  const S = [], G = [], put = (geo, col, o) => (o && o.glow ? G : S).push(geoTint(geo, col));
  return {S, G,
    /* y is the bottom of the piece */
    box(w, h, d, x, y, z, col, o){ o = o || {}; put(geoAt(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, o.rx, o.ry, o.rz), col, o); },
    cyl(r0, r1, h, x, y, z, col, o){ o = o || {}; put(geoAt(new THREE.CylinderGeometry(r0, r1, h, o.seg || 14), x, y + h / 2, z, o.rx, o.ry, o.rz), col, o); },
    ball(r, x, y, z, col, o){ o = o || {}; put(geoAt(new THREE.SphereGeometry(r, o.ws || 14, o.hs || 10), x, y, z, o.rx, o.ry, o.rz, o.sx || 1, o.sy || 1, o.sz || 1), col, o); }
  };
}
const HZ_C = {oak:'#d9b98c', oak2:'#c9a273', wht:'#f3f1ec', gry:'#b9bcbf', rw:'#6b2418', rw2:'#7d2c1d', gold:'#c9a24a', blk:'#1c1d22', blk2:'#2b2d34',
  pink:'#ff2fd2', cyan:'#28e0ff', red:'#e5303a', yel:'#f2c64a', crm:'#fff3d6', pnk:'#f6a7c1', milk:'#fffdf8', eye:'#2a1d16', mtl:'#9aa5b1', blu:'#3d6fb6'};
/* a chair facing +z at (x, z); kind changes the back */
function hzChair(k, x, z, ry, seat, back, h){
  h = h || .55; const c = Math.cos(ry), s = Math.sin(ry), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = P(0, 0); k.box(.56, .07, .56, p[0], h, p[1], seat, {ry});
  for (const [lx, lz] of [[-.24, -.24], [.24, -.24], [-.24, .24], [.24, .24]]){ p = P(lx, lz); k.box(.06, h, .06, p[0], 0, p[1], back); }
  p = P(0, -.25); k.box(.56, .6, .06, p[0], h + .07, p[1], back, {ry});
}
const hzEyes = (k, x, y, z, s, ry) => { const c = Math.cos(ry || 0), sn = Math.sin(ry || 0); for (const e of [-1, 1]) k.ball(.07 * s, x + e * .22 * s * c, y, z - e * .22 * s * sn, HZ_C.eye); };
const HZ_MODEL = {
  /* ---- 客厅沙发: faces +z, coffee table at z +1.6 ---- */
  dm_sofa(k){ k.ball(.6, -.75, .42, 0, HZ_C.blu, {sy:.72}); k.ball(.6, .75, .42, .2, '#e2a03f', {sy:.72}); k.box(2.6, .02, 1.8, 0, 0, .7, '#c7c0b0'); },
  nd_sofa(k){
    k.box(2.8, .4, 1.1, 0, .16, 0, '#b4b8bb'); k.box(2.8, .62, .28, 0, .56, -.42, '#aeb2b5'); for (const s of [-1, 1]) k.box(.26, .36, 1.1, s * 1.27, .56, 0, '#aeb2b5');
    for (const x of [-.82, 0, .82]) k.box(.8, .13, .82, x, .56, .08, '#c4c8cb');
    for (const [x, z] of [[-1.25, -.4], [1.25, -.4], [-1.25, .4], [1.25, .4]]) k.cyl(.04, .03, .16, x, 0, z, HZ_C.oak);
    k.cyl(.48, .48, .06, 0, .44, 1.6, HZ_C.oak, {seg:24}); k.cyl(.05, .05, .44, 0, 0, 1.6, HZ_C.oak); k.box(3, .02, 2.2, 0, 0, .9, '#e8e2d6');
  },
  cn_sofa(k){
    k.box(3, .5, 1.3, 0, 0, 0, HZ_C.rw); k.box(3.02, .05, 1.32, 0, .45, 0, HZ_C.gold); k.box(3, .75, .12, 0, .5, -.6, HZ_C.rw2);
    for (const s of [-1, 1]) k.box(.12, .45, 1.3, s * 1.45, .5, 0, HZ_C.rw2);
    for (const x of [-.95, .95]) k.box(.95, .12, .95, x, .5, .05, '#c8a14e');
    k.box(.7, .26, .6, 0, .5, .05, '#5a1d13'); k.cyl(.06, .05, .08, 0, .76, .05, '#f2f2ee'); k.box(1.3, .46, .75, 0, 0, 1.65, HZ_C.rw);
  },
  es_sofa(k){
    k.box(2.8, .4, 1.1, 0, .16, 0, HZ_C.blk); k.box(2.8, .7, .3, 0, .56, -.42, HZ_C.blk2); for (const s of [-1, 1]) k.box(.28, .4, 1.1, s * 1.26, .56, 0, HZ_C.blk2);
    for (const x of [-.82, 0, .82]) k.box(.8, .13, .82, x, .56, .08, '#2f3038'); k.box(2.2, .06, .03, 0, 1.0, -.27, HZ_C.red);
    k.box(2.9, .05, .05, 0, .06, .57, HZ_C.pink, {glow:1}); for (const s of [-1, 1]) k.box(.05, .05, 1.1, s * 1.42, .06, 0, HZ_C.pink, {glow:1});
    k.box(1.3, .38, .7, 0, 0, 1.65, '#22242b'); for (const s of [-1, 1]){ k.box(1.32, .04, .04, 0, .36, 1.65 + s * .35, HZ_C.cyan, {glow:1}); k.box(.04, .04, .72, s * .65, .36, 1.65, HZ_C.cyan, {glow:1}); }
  },
  nw_sofa(k){
    k.box(2.8, .45, 1.15, 0, .12, 0, HZ_C.yel); k.ball(1.5, 0, .85, -.45, HZ_C.yel, {sx:1, sy:.55, sz:.22});
    for (const s of [-1, 1]){ k.ball(.36, s * 1.3, .72, 0, HZ_C.yel, {sz:1.5}); k.ball(.13, s * .55, 1.12, -.12, HZ_C.pnk, {sy:.7}); }
    hzEyes(k, 0, 1.28, -.13, 1.2); k.box(2.3, .12, .85, 0, .57, .08, HZ_C.crm);
    k.cyl(.55, .55, .45, 0, 0, 1.65, HZ_C.crm, {seg:24}); k.cyl(.56, .56, .05, 0, .45, 1.65, HZ_C.yel, {seg:24});
  },
  /* ---- 电视墙: back against the wall (z -0.3), faces +z ---- */
  dm_tv(k){ k.box(.9, .82, .5, 0, 0, 0, '#e8e4da'); for (const y of [.27, .54]) k.box(.86, .02, .51, 0, y, 0, '#bdb7aa'); k.box(1.25, .78, .08, 0, .84, -.05, '#18191c'); k.box(1.12, .66, .02, 0, .9, 0, '#2f4a6b', {glow:1}); },
  nd_tv(k){
    k.box(2.6, .45, .5, 0, .14, 0, HZ_C.oak); for (const x of [-1.15, 1.15]) k.box(.06, .14, .4, x, 0, 0, HZ_C.oak2);
    k.box(2.05, 1.18, .07, 0, .72, -.12, '#1b1c1f'); k.box(1.95, 1.08, .02, 0, .77, -.08, '#4e6a80', {glow:1});
    k.cyl(.1, .07, .35, -1.0, .59, .05, '#e3ddd2'); k.box(.4, .12, .28, .95, .59, .05, '#7b8f6a');
  },
  cn_tv(k){
    k.box(2.6, .6, .55, 0, 0, 0, HZ_C.rw); for (const x of [-.65, .65]) k.box(.1, .06, .02, x, .32, .28, HZ_C.gold);
    k.box(2.05, 1.18, .07, 0, .85, -.12, '#1b1c1f'); k.box(1.95, 1.08, .02, 0, .9, -.08, '#4b5b52', {glow:1});
    for (let i = 0; i < 4; i++){ const z = -.1 + i * .48, ry = i % 2 ? .5 : -.5; k.box(.06, 1.95, .5, 1.75 + (i % 2) * .1, 0, z + .3, HZ_C.rw2, {ry}); k.box(.07, 1.5, .4, 1.75 + (i % 2) * .1, .25, z + .3, '#e9d9b0', {ry}); }
  },
  es_tv(k){
    k.box(2.8, .42, .55, 0, .1, 0, HZ_C.blk); k.box(2.82, .03, .57, 0, .1, 0, HZ_C.cyan, {glow:1});
    k.box(2.9, 1.65, .07, 0, .7, -.14, '#111215'); k.box(2.8, 1.55, .02, 0, .75, -.1, '#3b2a7a', {glow:1}); k.box(3.2, 1.95, .02, 0, .55, -.2, HZ_C.pink, {glow:1});
    k.box(.42, .1, .32, -.8, .52, .05, '#f2f2f2'); for (const s of [-1, 1]) k.box(.3, 1.1, .3, s * 1.65, 0, 0, HZ_C.blk2), k.box(.04, .9, .04, s * 1.65, .1, .16, HZ_C.cyan, {glow:1});
  },
  nw_tv(k){
    k.box(2.4, .5, .5, 0, .1, 0, HZ_C.crm); k.box(2.42, .1, .52, 0, .6, 0, HZ_C.yel);
    k.ball(1.2, 0, 1.45, -.12, HZ_C.yel, {sx:1, sy:.62, sz:.08}); k.box(1.6, .9, .02, 0, 1.0, -.03, '#7ec7e8', {glow:1});
    for (const s of [-1, 1]) k.ball(.2, s * .95, 2.1, -.12, HZ_C.yel);
    k.ball(.32, 0, 1.4, .02, HZ_C.yel, {sy:1.2, sz:.2}); hzEyes(k, 0, 1.55, .06, .5);
  },
  /* ---- 客厅摆件 ---- */
  dm_deco(k){ k.cyl(.3, .33, .06, 0, 0, 0, '#e8e4da'); k.cyl(.04, .04, 1.3, 0, .06, 0, '#d8d3c8'); k.cyl(.42, .42, .16, 0, 1.3, .05, '#e8e4da', {rx:Math.PI / 2}); k.cyl(.36, .36, .02, 0, 1.3, .14, '#7fb0d8', {rx:Math.PI / 2}); },
  nd_deco(k){
    k.cyl(.3, .24, .55, -.15, 0, -.1, HZ_C.wht);
    for (const [x, y, z, s] of [[-.15, .9, -.1, .38], [-.4, 1.15, .1, .32], [.1, 1.25, -.25, .3], [-.25, 1.45, -.2, .26], [.05, 1.0, .15, .3]]) k.ball(s, x, y, z, '#4f7a4a', {sy:.55, rx:.4});
    k.cyl(.2, .22, .05, .55, 0, .45, '#2f3a40'); k.cyl(.025, .025, 1.6, .55, 0, .45, '#2f3a40'); k.cyl(.22, .32, .35, .55, 1.55, .45, '#ffe9b8', {glow:1});
  },
  cn_deco(k){
    k.box(.7, .5, .7, 0, 0, 0, HZ_C.rw); k.box(.74, .05, .74, 0, .5, 0, HZ_C.gold);
    k.ball(.33, 0, 1.0, 0, '#f2f2ee', {sy:1.45}); k.cyl(.33, .33, .18, 0, .88, 0, '#2f56a6'); k.cyl(.2, .26, .14, 0, 1.22, 0, '#2f56a6'); k.cyl(.12, .16, .2, 0, 1.42, 0, '#f2f2ee');
    k.box(.55, .2, .38, .75, 0, .55, '#2f56a6'); k.cyl(.04, .07, .5, .75, .2, .55, '#5a3f2b', {rz:.3}); k.ball(.28, .82, .78, .55, '#3f6b3a', {sy:.5}); k.ball(.2, .6, .62, .5, '#46783f', {sy:.5});
  },
  es_deco(k){
    for (const [x, z, c] of [[-.25, 0, HZ_C.cyan], [.3, .25, HZ_C.pink]]){ k.cyl(.14, .16, .08, x, 0, z, HZ_C.blk); k.cyl(.12, .12, 2.1, x, .08, z, HZ_C.blk2); k.cyl(.07, .07, 1.95, x, .14, z + .01, c, {glow:1}); }
    k.box(.3, .4, .3, .05, 0, -.3, HZ_C.blk); k.ball(.13, .05, .55, -.3, '#7cf03a', {glow:1});
  },
  nw_deco(k){
    k.ball(.62, 0, .78, 0, HZ_C.yel, {sy:1.3}); k.ball(.42, 0, .62, .25, HZ_C.crm, {sy:1.1, sz:.7}); k.ball(.36, 0, 1.75, .08, HZ_C.yel, {sy:.9});
    hzEyes(k, 0, 1.8, .38, .9); for (const s of [-1, 1]){ k.ball(.1, s * .3, 1.66, .34, HZ_C.pnk, {sy:.6}); k.ball(.2, s * .55, .12, .22, HZ_C.yel, {sz:1.6, sy:.5}); k.ball(.15, s * .6, 1.0, .1, HZ_C.yel, {sy:1.6, rz:s * .5}); }
  },
  /* ---- 餐桌 ---- */
  dm_dine(k){
    k.box(1.4, .05, .8, 0, .76, 0, '#c9b28f'); for (const [x, z] of [[-.62, -.32], [.62, -.32], [-.62, .32], [.62, .32]]) k.box(.04, .76, .04, x, 0, z, HZ_C.mtl);
    for (const [x, z, c] of [[-.4, .75, '#d64545'], [.45, .7, HZ_C.blu], [0, -.75, '#2f9a5b']]){ k.cyl(.21, .17, .45, x, 0, z, c); k.cyl(.22, .22, .04, x, .45, z, c); }
    k.cyl(.12, .1, .14, .3, .81, -.05, '#f0ece2'); k.box(.25, .1, .2, -.35, .81, .1, '#e2a03f');
  },
  nd_dine(k){
    k.box(2.0, .07, 1.15, 0, .93, 0, HZ_C.oak); for (const [x, z] of [[-.88, -.45], [.88, -.45], [-.88, .45], [.88, .45]]) k.box(.08, .93, .08, x, 0, z, HZ_C.oak2);
    for (const [x, z, ry] of [[-.5, -.85, 0], [.5, -.85, 0], [-.5, .85, Math.PI], [.5, .85, Math.PI]]) hzChair(k, x, z, ry, HZ_C.oak, HZ_C.oak2);
    k.cyl(.12, .08, .18, 0, 1.0, 0, HZ_C.wht); k.ball(.13, 0, 1.25, 0, '#7b8f6a', {sy:.6});
  },
  cn_dine(k){
    k.cyl(.3, .45, .1, 0, 0, 0, HZ_C.rw2, {seg:20}); k.cyl(.18, .22, .85, 0, .1, 0, HZ_C.rw); k.cyl(1.05, 1.05, .08, 0, .95, 0, HZ_C.rw, {seg:28}); k.cyl(1.06, 1.06, .02, 0, .96, 0, HZ_C.gold, {seg:28});
    k.cyl(.5, .5, .04, 0, 1.03, 0, '#5a1d13', {seg:24});
    for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; k.cyl(.25, .21, .55, Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45, HZ_C.rw2, {seg:12}); k.cyl(.16, .16, .03, Math.cos(a) * .75, 1.03, Math.sin(a) * .75, '#f2f2ee'); }
    k.cyl(.18, .18, .06, 0, 1.07, 0, '#2f56a6');
  },
  es_dine(k){
    k.box(2.1, 1.12, .62, 0, 0, 0, HZ_C.blk); k.box(2.2, .06, .75, 0, 1.12, .05, HZ_C.blk2); k.box(2.1, .04, .04, 0, .1, .32, HZ_C.cyan, {glow:1});
    for (const x of [-.7, 0, .7]){ k.cyl(.04, .04, .9, x, .1, .75, '#8a8f96'); k.cyl(.2, .26, .06, x, 0, .75, '#8a8f96'); k.cyl(.23, .23, .09, x, 1.0, .75, HZ_C.red, {seg:18}); }
    for (const x of [-.5, -.35, .6]) k.cyl(.045, .045, .17, x, 1.18, 0, '#7cf03a', {glow:1});
  },
  nw_dine(k){
    k.cyl(.45, .5, .1, 0, 0, 0, HZ_C.yel, {seg:20}); k.cyl(.28, .28, .6, 0, .1, 0, HZ_C.milk); k.cyl(.3, .3, .08, 0, .45, 0, HZ_C.yel); k.cyl(.12, .2, .2, 0, .7, 0, '#f3d79a');
    k.cyl(.95, .95, .08, 0, .9, 0, HZ_C.crm, {seg:28}); k.cyl(.96, .96, .03, 0, .88, 0, HZ_C.yel, {seg:28});
    for (let i = 0; i < 4; i++){ const a = i / 4 * Math.PI * 2 + .78, x = Math.cos(a) * 1.35, z = Math.sin(a) * 1.35; k.cyl(.26, .24, .52, x, 0, z, HZ_C.yel); k.ball(.08, x - .12, .58, z, HZ_C.yel); k.ball(.08, x + .12, .58, z, HZ_C.yel); }
  },
  /* ---- 厨房: along the back wall (z -0.35), 2.8 m wide ---- */
  dm_kit(k){
    k.box(1.5, .06, .65, -.5, .9, 0, '#c9b28f'); for (const x of [-1.2, .2]) for (const z of [-.28, .28]) k.box(.05, .9, .05, x, 0, z, HZ_C.mtl);
    k.cyl(.2, .18, .26, -.75, .96, 0, '#f0ece2'); k.cyl(.21, .21, .03, -.75, 1.22, 0, '#a7b0b7'); k.box(.42, .34, .32, -.2, .96, .05, '#e2a03f');
    for (let i = 0; i < 3; i++) k.box(.5, .3, .38, -.4 + (i % 2) * .1, i * .3, .55, i % 2 ? '#d6463d' : '#e2a03f');
    k.box(.65, 1.05, .62, .95, 0, 0, '#e8e4da'); k.box(.04, .3, .03, .7, .6, .32, '#9aa1a8');
  },
  nd_kit(k){
    k.box(2.0, 1.02, .7, -.4, 0, 0, HZ_C.wht); k.box(2.05, .06, .74, -.4, 1.02, 0, HZ_C.oak); k.box(2.0, .7, .38, -.4, 1.85, -.17, HZ_C.wht);
    k.box(.55, .02, .38, -.8, 1.08, .02, '#b8bfc4'); k.box(.55, .02, .4, .1, 1.08, .02, '#26282b'); for (const x of [-1.2, -.6, 0, .4]) k.box(.02, .7, .02, x, .2, .36, '#d4d0c8');
    k.box(.8, 2.1, .72, 1.0, 0, 0, '#e9ecee'); k.box(.03, .5, .03, .65, 1.1, .37, '#9aa1a8'); k.ball(.13, -1.2, 1.18, .1, '#4f7a4a', {sy:.6});
  },
  cn_kit(k){
    k.box(2.0, 1.02, .7, -.4, 0, 0, HZ_C.rw); k.box(2.05, .06, .74, -.4, 1.02, 0, '#e8dfcf'); k.box(2.0, .7, .38, -.4, 1.85, -.17, HZ_C.rw2);
    for (const x of [-1.15, -.65, -.15, .35]) k.box(.08, .04, .03, x, .85, .36, HZ_C.gold);
    k.box(.55, .02, .38, -.8, 1.08, .02, '#b8bfc4'); k.box(.55, .02, .4, .1, 1.08, .02, '#26282b'); k.cyl(.22, .16, .16, .1, 1.1, .02, '#3a3a3a');
    k.box(.8, 2.1, .72, 1.0, 0, 0, '#d9d2c3'); k.box(.04, .5, .03, .65, 1.1, .37, HZ_C.gold);
  },
  es_kit(k){
    k.box(2.0, 1.02, .7, -.4, 0, 0, HZ_C.blk); k.box(2.05, .06, .74, -.4, 1.02, 0, HZ_C.blk2); k.box(2.0, .7, .38, -.4, 1.85, -.17, HZ_C.blk);
    k.box(2.0, .03, .03, -.4, 1.82, .03, HZ_C.pink, {glow:1}); k.box(.55, .02, .4, .1, 1.08, .02, '#111');
    k.box(.8, 2.1, .72, 1.0, 0, 0, HZ_C.blk2); k.box(.66, 1.8, .02, 1.0, .15, .37, '#1e5f72', {glow:1});
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) k.cyl(.045, .045, .17, .78 + i * .14, .25 + r * .44, .2, ['#7cf03a', HZ_C.cyan, '#ffd23f', HZ_C.pink][r], {glow:1});
  },
  nw_kit(k){
    k.box(2.0, 1.02, .7, -.4, 0, 0, HZ_C.crm); k.box(2.05, .06, .74, -.4, 1.02, 0, HZ_C.yel); k.box(2.0, .7, .38, -.4, 1.85, -.17, HZ_C.yel);
    for (const x of [-1.15, -.65, -.15, .35]) k.ball(.05, x, .85, .36, HZ_C.pnk);
    k.box(.8, 2.1, .72, 1.0, 0, 0, HZ_C.milk); for (const s of [-1, 1]) k.ball(.14, 1.0 + s * .25, 2.12, 0, HZ_C.yel);
    hzEyes(k, 1.0, 1.75, .37, .7); for (let i = 0; i < 3; i++) k.box(.18, .32, .18, -1.1 + i * .3, 1.08, .05, HZ_C.milk), k.box(.19, .08, .19, -1.1 + i * .3, 1.4, .05, '#4f86d6');
  },
  /* ---- 后院: faces the house ---- */
  dm_yard(k){
    for (const x of [-1.4, 1.4]) k.cyl(.04, .04, 1.9, x, 0, -.2, HZ_C.mtl); k.box(2.8, .03, .03, 0, 1.85, -.2, '#d8d3c8');
    for (const [x, c, h] of [[-1, '#e45a5a', .7], [-.45, HZ_C.blu, .9], [.1, '#f0ece2', .6], [.6, '#4fae6f', .8], [1.05, '#f2c64a', .5]]) k.box(.42, h, .03, x, 1.82 - h, -.2, c);
    for (const x of [-.8, .9]){ k.cyl(.22, .17, .32, x, 0, .9, '#b5653d'); k.ball(.24, x, .5, .9, '#3f7a3a', {sy:.8}); for (let i = 0; i < 3; i++) k.ball(.04, x - .1 + i * .1, .55 + i * .05, .98, '#d8261e'); }
  },
  nd_yard(k){
    k.box(4, .12, 3, 0, 0, 0, '#c39a6b'); for (let i = 0; i < 9; i++) k.box(4, .01, .02, 0, .12, -1.4 + i * .35, '#9c7651');
    k.cyl(.04, .04, 2.3, -.9, .12, -.6, '#2f3a40'); k.box(.9, .05, .05, -.55, 2.4, -.6, '#2f3a40'); k.ball(.55, -.25, 1.35, -.6, '#e8e2d6', {sy:1.1}); k.ball(.45, -.25, 1.3, -.42, '#f6f3ee', {sy:.95});
    for (const [x, z] of [[1.4, -1.0], [1.6, .6]]){ k.cyl(.26, .2, .45, x, .12, z, HZ_C.wht); k.ball(.32, x, .8, z, '#4f7a4a', {sy:.8}); }
  },
  cn_yard(k){
    k.cyl(1.3, 1.35, .32, .3, 0, 0, '#8b8a83', {seg:22}); k.cyl(1.18, 1.18, .02, .3, .28, 0, '#2f6b7a', {seg:22});
    for (const [x, z, c] of [[.0, .3, '#ef7d2d'], [.6, -.4, '#f4f2ec'], [.5, .5, '#ef7d2d'], [-.2, -.3, '#e04a2a']]) k.ball(.13, x, .31, z, c, {sx:.45, sy:.25, ry:x * 3});
    for (const [x, y, s] of [[-1.55, .35, .55], [-1.4, .9, .42], [-1.65, 1.35, .32], [-1.2, .45, .35]]) k.ball(s, x, y, -.6, '#8b8f8a', {sy:1.2, rx:.3});
    for (let i = 0; i < 4; i++){ k.cyl(.05, .05, 2.4 + i * .2, 1.8 + i * .15, 0, -.8 + (i % 2) * .2, '#6c9a4a'); k.ball(.25, 1.8 + i * .15, 2.3 + i * .2, -.8 + (i % 2) * .2, '#5f8f3f', {sy:.5}); }
  },
  es_yard(k){
    k.box(2.6, 1.1, .1, 0, 1.0, -1.95, HZ_C.blk); k.box(2.6, .04, .04, 0, 1.0, -1.88, HZ_C.pink, {glow:1}); k.box(2.6, .04, .04, 0, 2.08, -1.88, HZ_C.pink, {glow:1});
    for (const [x, w] of [[-.8, .12], [-.45, .12], [-.1, .5], [.45, .12], [.8, .12]]) k.box(w, .6, .04, x, 1.25, -1.88, HZ_C.cyan, {glow:1});
    k.box(.95, .14, .55, .8, .85, .2, '#222'); for (const x of [.45, 1.15]) k.box(.05, .85, .05, x, 0, .2, '#555'); k.box(.95, .02, .55, .8, .99, .2, '#ff6a2a', {glow:1});
    for (const x of [-.9, -.3]){ k.cyl(.24, .24, .05, x, .45, .6, HZ_C.red); k.cyl(.03, .03, .45, x, 0, .6, '#555'); }
  },
  nw_yard(k){
    k.cyl(1.4, 1.45, .5, 0, 0, 0, HZ_C.yel, {seg:24}); k.cyl(1.25, 1.25, .02, 0, .45, 0, '#7fd3e8', {seg:24}); k.cyl(1.42, 1.42, .1, 0, .5, 0, HZ_C.pnk, {seg:24});
    k.ball(.3, .3, .58, .1, HZ_C.yel, {sy:.75}); k.ball(.18, .45, .86, .1, HZ_C.yel); k.box(.12, .05, .08, .6, .84, .1, '#ef8b2c'); hzEyes(k, .52, .92, .2, .35, Math.PI / 2);
    k.cyl(.3, .3, .1, -.6, .48, -.4, HZ_C.pnk, {seg:16});
  },
  /* ---- 主卧大床: head at z -1.4 ---- */
  dm_bed(k){
    for (const [x, z] of [[-.68, -1.38], [.68, -1.38], [-.68, 1.38], [.68, 1.38]]) k.box(.07, 2.3, .07, x, 0, z, HZ_C.mtl);
    for (const y of [.42, 1.5]){ k.box(1.4, .06, 2.8, 0, y, 0, HZ_C.mtl); k.box(1.3, .16, 2.7, 0, y + .06, 0, '#ece8dd'); k.box(1.32, .05, 1.8, 0, y + .22, .4, HZ_C.blu); k.box(.6, .1, .35, 0, y + .22, -1.1, '#f6f3ee'); }
    for (let i = 0; i < 4; i++) k.box(.5, .04, .04, .55, .5 + i * .3, 1.4, HZ_C.mtl); k.box(.7, .3, .5, 0, 1.78, -.6, '#c9b28f');
  },
  nd_bed(k){
    k.box(2.2, .4, 2.85, 0, 0, 0, HZ_C.oak); k.box(2.1, .26, 2.75, 0, .4, 0, HZ_C.wht); k.box(2.14, .08, 1.9, 0, .66, .45, '#e3e7ea');
    for (const x of [-.5, .5]) k.box(.75, .16, .42, x, .66, -1.05, '#f6f3ee'); k.box(2.3, 1.05, .1, 0, 0, -1.47, HZ_C.oak2);
    for (const s of [-1, 1]){ k.box(.5, .5, .45, s * 1.5, 0, -1.15, HZ_C.oak); k.cyl(.12, .16, .25, s * 1.5, .5, -1.15, '#ffe9b8', {glow:1}); }
    k.box(2.6, .02, 1.6, 0, 0, 1.6, '#e8e2d6');
  },
  cn_bed(k){
    k.box(2.4, .55, 3.0, 0, 0, 0, HZ_C.rw); k.box(2.3, .2, 2.9, 0, .55, 0, '#d8b45a'); k.box(2.34, .08, 2.0, 0, .75, .45, '#a8322a');
    for (const x of [-.55, .55]) k.box(.8, .16, .42, x, .75, -1.1, '#e9d9b0');
    for (const [x, z] of [[-1.15, -1.45], [1.15, -1.45], [-1.15, 1.45], [1.15, 1.45]]) k.box(.12, 2.5, .12, x, 0, z, HZ_C.rw2);
    for (const s of [-1, 1]){ k.box(2.4, .16, .14, 0, 2.4, s * 1.45, HZ_C.rw2); k.box(.14, .16, 3, s * 1.15, 2.4, 0, HZ_C.rw2); k.box(.04, 1.0, 1.0, s * 1.15, 1.4, -.9, '#e9d9b0'); }
    k.box(2.3, 1.2, .08, 0, .55, -1.45, HZ_C.rw2); k.box(2.3, .06, .1, 0, 2.3, 1.45, HZ_C.gold);
  },
  es_bed(k){
    k.box(2.2, .4, 2.85, 0, .06, 0, HZ_C.blk); k.box(2.1, .26, 2.75, 0, .46, 0, HZ_C.blk2); k.box(2.14, .08, 1.9, 0, .72, .45, '#30323a'); k.box(.2, .081, 1.9, -.6, .72, .45, HZ_C.red);
    for (const x of [-.5, .5]) k.box(.75, .16, .42, x, .72, -1.05, '#3a3c45');
    for (const s of [-1, 1]) k.box(.04, .05, 2.85, s * 1.12, .04, 0, HZ_C.pink, {glow:1}); k.box(2.2, .05, .04, 0, .04, 1.44, HZ_C.pink, {glow:1});
    k.box(2.3, 1.2, .12, 0, 0, -1.48, HZ_C.blk); k.box(1.2, .5, .02, 0, .7, -1.41, '#2a5bd7', {glow:1});
  },
  nw_bed(k){
    k.box(2.3, .45, 2.9, 0, 0, 0, HZ_C.yel); k.box(2.1, .26, 2.75, 0, .45, 0, HZ_C.milk); k.box(2.16, .1, 1.9, 0, .7, .45, HZ_C.crm);
    for (let i = 0; i < 5; i++) k.ball(.09, -.8 + i * .4, .8, .2 + (i % 2) * .5, HZ_C.yel, {sy:.3});
    for (const x of [-.5, .5]) k.box(.75, .16, .42, x, .7, -1.05, HZ_C.pnk);
    k.ball(1.1, 0, 1.3, -1.45, HZ_C.yel, {sy:.95, sz:.22}); for (const s of [-1, 1]){ k.ball(.25, s * .85, 2.15, -1.45, HZ_C.yel, {sz:.6}); k.ball(.12, s * .45, 1.15, -1.25, HZ_C.pnk, {sy:.6}); }
    hzEyes(k, 0, 1.45, -1.2, 1.3);
  },
  /* ---- 次卧书桌: against the wall at z -0.4 ---- */
  dm_desk(k){
    k.box(1.4, .05, .7, 0, .95, 0, '#c9b28f'); for (const [x, z] of [[-.65, -.3], [.65, -.3], [-.65, .3], [.65, .3]]) k.box(.04, .95, .04, x, 0, z, HZ_C.mtl);
    k.box(.4, .5, .6, .45, .3, 0, '#e8e4da'); k.cyl(.1, .12, .04, -.5, 1.0, -.15, '#f0ece2'); k.cyl(.02, .02, .45, -.5, 1.0, -.15, '#f0ece2', {rz:.4}); k.cyl(.06, .14, .14, -.38, 1.38, -.05, '#fff1c9', {glow:1});
    for (let i = 0; i < 4; i++) k.box(.3, .05, .22, .0, 1.0 + i * .05, -.1, ['#d64545', HZ_C.blu, '#2f9a5b', '#e2a03f'][i]);
    k.cyl(.22, .2, .5, 0, 0, .7, '#d64545'); k.cyl(.23, .23, .04, 0, .5, .7, '#d64545');
  },
  nd_desk(k){
    k.box(1.6, .06, .75, -.15, .95, 0, HZ_C.oak); for (const [x, z] of [[-.88, -.3], [.58, -.3], [-.88, .3], [.58, .3]]) k.box(.06, .95, .06, x, 0, z, HZ_C.oak2);
    k.box(.5, .02, .35, -.2, 1.01, .02, '#c9c9c9'); k.box(.5, .32, .02, -.2, 1.02, -.15, '#b8b8b8', {rx:-.3}); k.box(.47, .29, .01, -.2, 1.03, -.13, '#9fc3e0', {glow:1, rx:-.3});
    k.box(.9, 2.1, .4, .95, 0, -.15, HZ_C.oak); for (let r = 0; r < 4; r++){ k.box(.84, .03, .36, .95, .45 + r * .48, -.13, HZ_C.oak2); for (let i = 0; i < 5; i++) k.box(.1, .32, .25, .65 + i * .14, .48 + r * .48, -.1, ['#c0392b', '#2f5f8f', '#e2a03f', '#4f7a4a', '#7a5a9e'][(i + r) % 5]); }
    hzChair(k, -.2, .7, Math.PI, HZ_C.gry, HZ_C.oak2);
  },
  cn_desk(k){
    k.box(1.9, .08, .8, 0, .9, 0, HZ_C.rw); for (const [x, z] of [[-.85, -.32], [.85, -.32], [-.85, .32], [.85, .32]]) k.box(.08, .9, .08, x, 0, z, HZ_C.rw2);
    k.box(1.85, .1, .04, 0, .78, .36, HZ_C.rw2); k.box(.8, .01, .45, -.1, .98, .05, '#f6f1e2'); for (let i = 0; i < 3; i++) k.box(.12, .01, .04, -.3 + i * .2, .99, .1, '#222');
    k.box(.22, .05, .3, .6, .98, .05, '#2a2a2a'); k.cyl(.07, .07, .2, -.75, .98, -.2, '#6b8f5a'); for (let i = 0; i < 4; i++) k.cyl(.01, .01, .3, -.78 + i * .02, 1.1, -.2, '#3a2a1e');
    hzChair(k, 0, .75, Math.PI, HZ_C.rw, HZ_C.rw2);
  },
  es_desk(k){
    k.box(2.2, .06, .85, 0, .95, 0, HZ_C.blk); for (const x of [-1.0, 1.0]) k.box(.1, .95, .7, x, 0, 0, HZ_C.blk2); k.box(2.2, .03, .03, 0, .92, .42, HZ_C.cyan, {glow:1});
    for (const [x, ry] of [[-.75, .4], [0, 0], [.75, -.4]]){ k.box(.72, .44, .04, x, 1.25, -.22 + Math.abs(x) * .12, '#0e0f12', {ry}); k.box(.68, .4, .01, x, 1.27, -.19 + Math.abs(x) * .12, '#2a5bd7', {glow:1, ry}); }
    k.box(.04, .3, .04, 0, 1.0, -.3, '#333'); k.box(.6, .03, .2, 0, 1.01, .15, '#22242b'); k.box(.56, .01, .16, 0, 1.04, .15, HZ_C.pink, {glow:1});
    k.box(.62, .12, .62, 0, .55, .8, HZ_C.blk); k.box(.62, 1.1, .14, 0, .67, 1.08, HZ_C.blk, {rx:.12}); for (const s of [-1, 1]) k.box(.08, 1.05, .15, s * .28, .69, 1.07, HZ_C.red, {rx:.12});
    k.cyl(.04, .04, .5, 0, .05, .8, '#555'); k.cyl(.35, .35, .05, 0, 0, .8, '#333', {seg:5});
  },
  nw_desk(k){
    k.box(1.6, .08, .75, 0, .92, 0, HZ_C.yel); for (const s of [-1, 1]) k.cyl(.12, .12, .92, s * .65, 0, 0, HZ_C.crm);
    k.ball(.18, -.55, 1.18, -.12, HZ_C.yel, {sy:1.2}); k.ball(.2, -.55, 1.45, -.12, '#fff1c9', {glow:1, sy:.8}); hzEyes(k, -.55, 1.2, .04, .4);
    k.box(.5, .02, .35, .25, 1.0, .02, '#f6f3ee'); k.cyl(.25, .23, .5, .1, 0, .75, HZ_C.yel); for (const s of [-1, 1]) k.ball(.08, .1 + s * .14, .56, .75, HZ_C.yel);
  },
  /* ---- 第三间房 ---- */
  dm_hobby(k){
    for (const [x, z, c, h] of [[-.6, -.2, HZ_C.blu, .75], [-.05, -.15, '#e2a03f', .65]]){ k.box(.5, h, .3, x, .06, z, c); k.box(.18, .05, .05, x, h + .06, z, '#333'); for (const s of [-1, 1]) k.cyl(.05, .05, .06, x + s * .18, 0, z, '#222'); }
    for (let i = 0; i < 4; i++) k.box(.55, .32, .4, .7, i * .32, -.1 + (i % 2) * .06, i % 2 ? '#d6463d' : '#c9a273');
    k.box(1.4, .03, .5, -.2, 0, .7, '#8aa0b0');
  },
  nd_hobby(k){
    k.box(2.4, 2.2, .4, 0, 0, -.6, HZ_C.oak); for (let r = 0; r < 5; r++){ k.box(2.3, .03, .36, 0, .2 + r * .42, -.58, HZ_C.oak2); for (let i = 0; i < 10; i++) if ((i * 7 + r * 3) % 9) k.box(.13, .32, .26, -1.0 + i * .22, .23 + r * .42, -.55, ['#c0392b', '#2f5f8f', '#e2a03f', '#4f7a4a', '#7a5a9e', '#e8e2d6'][(i + r * 2) % 6]); }
    k.box(.9, .4, .85, -.3, .12, .55, '#9aa0a5'); k.box(.9, .6, .2, -.3, .52, .2, '#8f959a'); for (const s of [-1, 1]) k.box(.16, .3, .85, -.3 + s * .45, .52, .55, '#8f959a');
    k.cyl(.025, .025, 1.5, .55, 0, .5, '#2f3a40'); k.cyl(.18, .26, .3, .55, 1.45, .5, '#ffe9b8', {glow:1});
  },
  cn_hobby(k){
    k.box(1.2, .42, .7, 0, 0, .25, HZ_C.rw); k.box(1.24, .04, .74, 0, .42, .25, HZ_C.gold);
    k.ball(.12, -.1, .56, .25, '#7a3b2a', {sy:.8}); k.cyl(.02, .02, .1, .02, .56, .25, '#7a3b2a', {rz:1.2}); for (const x of [.2, .35]) k.cyl(.05, .04, .06, x, .46, .3, '#f2f2ee');
    for (const s of [-1, 1]) hzChair(k, s * 1.0, .25, -s * Math.PI / 2, HZ_C.rw, HZ_C.rw2, .5);
    k.box(.75, 1.45, .03, 0, .7, -.75, '#f6f1e2'); k.box(.8, .06, .05, 0, 2.15, -.74, HZ_C.rw2); for (let i = 0; i < 4; i++) k.box(.04, .9, .01, -.2 + i * .13, 1.0, -.73, '#2a2a2a');
  },
  es_hobby(k){
    k.box(1.1, .12, 2.0, 0, 0, 0, HZ_C.blk2); k.box(.62, .5, .7, 0, .12, .35, HZ_C.red); k.box(.62, .9, .18, 0, .5, .7, HZ_C.red, {rx:.2}); k.box(.5, .7, .05, 0, .62, .6, HZ_C.blk, {rx:.2});
    k.box(.06, .7, .06, 0, .12, -.4, '#555'); k.cyl(.2, .2, .05, 0, .82, -.32, '#222', {rx:Math.PI / 2 - .3, seg:18}); k.box(.36, .1, .25, 0, .12, -.75, '#444');
    for (const [x, ry] of [[-.85, .7], [0, 0], [.85, -.7]]){ k.box(.8, .48, .04, x, 1.0, -1.05 + Math.abs(x) * .3, '#0e0f12', {ry}); k.box(.76, .44, .01, x, 1.02, -1.02 + Math.abs(x) * .3, '#d9542b', {glow:1, ry}); }
    k.box(1.12, .03, .03, 0, .13, .99, HZ_C.cyan, {glow:1});
  },
  nw_hobby(k){
    k.cyl(1.2, 1.25, .6, 0, 0, 0, HZ_C.pnk, {seg:24}); k.cyl(1.22, 1.22, .08, 0, .6, 0, HZ_C.yel, {seg:24});
    const R = mkRng(42), cols = [HZ_C.yel, '#4f86d6', '#e45a5a', '#4fae6f', HZ_C.milk, '#ff9f43'];
    for (let i = 0; i < 46; i++){ const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 1.0; k.ball(.14, Math.cos(a) * r, .48 + R() * .12, Math.sin(a) * r, cols[i % cols.length], {ws:6, hs:4}); }
    k.ball(.3, .5, .72, -.3, HZ_C.yel, {sy:1.2}); hzEyes(k, .5, .82, -.03, .5);
  }
};
let hzFur = null, hzGlow = null;
const hzFurCols = []; let hzFurColN = 0;
function hzFurCol(cx, cz, hx, hz_, rot){
  let c = hzFurCols[hzFurColN]; if (!c){ c = addBox(cx, cz, hx, hz_, rot); hzFurCols.push(c); }
  Object.assign(c, {cx, cz, hx, hz:hz_, c:Math.cos(rot), s:Math.sin(rot), dead:false}); hzFurColN++;
}
/* build all the furniture of a house into two meshes. place = {slot: item id} (what is in each spot, saved or previewed) */
function hzBuildFurniture(place){
  const S = [], G = []; hzFurColN = 0;
  for (const sl of HZ_SLOTS){
    const id = place[sl.id], fn = id && HZ_MODEL[id]; if (!fn) continue;
    const k = hzKit(); fn(k);
    const ax = HX(sl.x, sl.fl), az = HZZ(sl.z);
    for (const g of k.S) S.push(geoAt(g, ax, 0, az, 0, sl.r, 0)); for (const g of k.G) G.push(geoAt(g, ax, 0, az, 0, sl.r, 0));
    /* a collider a bit smaller than the piece: you can walk right up to it but not through it */
    const sw = Math.abs(Math.sin(sl.r)) > .5, hx = Math.max(.1, (sw ? sl.d : sl.w) / 2 - .5), hz_ = Math.max(.1, (sw ? sl.w : sl.d) / 2 - .5);
    if (sl.id !== 'deco') hzFurCol(ax, az, hx, hz_, 0);
  }
  for (let i = hzFurColN; i < hzFurCols.length; i++) hzFurCols[i].dead = true;
  const mk = (list, mat, old) => {
    if (old){ old.geometry.dispose(); }
    if (!list.length){ if (old) hzG.remove(old); return null; }
    const geo = geoMerge(list);
    if (old){ old.geometry = geo; hzG.add(old); return old; }
    const m = new THREE.Mesh(geo, mat); m.castShadow = mat === hzSolidMat; m.receiveShadow = true; hzG.add(m); return m;
  };
  hzFur = mk(S, hzSolidMat, hzFur); hzGlow = mk(G, hzGlowMat, hzGlow);
}
function hzFreeFurniture(){
  for (const m of [hzFur, hzGlow]) if (m){ m.geometry.dispose(); hzG.remove(m); }
  hzFur = hzGlow = null; for (const c of hzFurCols) c.dead = true;
}
/* wall paint and floor of what is shown right now (a preview may differ from the save) */
function hzDress(look){
  if (!hzShell || hzShellWall !== look.w) hzBuildShell(look.w);
  hzSetFloor(look.f); hzBuildFurniture(look.s);
}
const hzLookOf = id => { const o = hz.own[id]; return o ? {w:o.w, f:o.f, s:Object.assign({}, o.s)} : {w:'white', f:'terr', s:{}}; };

/* ---------- markers inside: the way out and the stairs ---------- */
const hzExitMark = gxMarker('#4fd18b', .28); hzExitMark.position.set(HX(HZ_EXIT.x, 0), .05, HZZ(HZ_EXIT.z));
const hzStairMarks = HZ_STAIRS.map(s => { const m = gxMarker('#9fd8ff', .24); m.position.set(HX(s.x, s.fl), .05, HZZ(s.z)); return m; });
const hzInLbls = [addLabel('出门', HX(HZ_EXIT.x, 0), 2.6, HZZ(HZ_EXIT.z), true)].concat(HZ_STAIRS.map(s => addLabel(s.label, HX(s.x, s.fl), 2.4, HZZ(s.z), true)));
for (const l of hzInLbls) l.dead = true;
/* indoors the tall light beam of a marker would cut across the whole room: keep only the ring */
for (const m of [hzExitMark, ...hzStairMarks]) m.children.forEach(c => { if (c !== m.userData.ring) c.visible = false; });

/* ---------- state, going in, coming out ---------- */
const HZ = {in:null, tour:false, fl:0, keep:null, near:null, act:null, parkT:0, told:{}};
const hzBusyWhy = () => mission.on ? '先把手上的外卖送完' : gx.busy() ? '先把手上的挑战做完' : '';
function hzEnter(h, tour){
  if (HZ.in || !h) return;
  if (mode !== 'naiwa') setMode('naiwa');
  if (driving) leaveCar();
  HZ.in = h; HZ.tour = !!tour && !hz.own[h.id]; HZ.fl = 0; HZ.keep = {dist:camDist, pitch:camPitch}; HZ.act = null;
  window.XINDOOR = 'house'; window.XINDOOR_AT = h.door;
  hzDress(hzLookOf(h.id));
  for (const c of hzCols) c.dead = false;
  hzG.visible = true; hzExitMark.visible = true; for (const m of hzStairMarks) m.visible = true; for (const l of hzInLbls) l.dead = false;
  Object.assign(nw, {x:HX(HZ_EXIT.x, 0), z:HZZ(HZ_EXIT.z + 2.1), y:0, h:0, air:false, state:'idle', vx:0, vz:0}); camYaw = Math.PI; camDist = 12; camPitch = 1.0;
  document.body.classList.add('hz-in'); sfx.ding();
  gxCallout(HZ.tour ? '看房' : '到家了', `${h.name}`, '#38c6d9');
  if (HZ.tour) toast('随便看看', `两层：一楼客厅、饭厅、厨房、后院，楼梯口按 F 上二楼看三间卧室。${TOUCH ? '点「买下」' : '按 F'}买下这套`, 4200);
  else if (!hz.seen){ hz.seen = true; hzWrite(); toast('这是你的家了', `${TOUCH ? '点「装修」' : '按 F'}挑风格买家具，九个位置一件件摆。楼梯口上二楼`, 4600); }
}
function hzLeave(quiet){
  const h = HZ.in; if (!h) return;
  if (typeof hzUiClose === 'function') hzUiClose(true);
  HZ.in = null; HZ.tour = false; hzG.visible = false; window.XINDOOR = null; window.XINDOOR_AT = null;
  for (const c of hzCols) c.dead = true; hzFreeFurniture();
  hzExitMark.visible = false; for (const m of hzStairMarks) m.visible = false; for (const l of hzInLbls) l.dead = true;
  if (HZ.keep){ camDist = HZ.keep.dist; camPitch = HZ.keep.pitch; }
  const d = h.door; nw.x = d.x; nw.z = d.z - 1; nw.h = d.h; camYaw = d.h + Math.PI;
  nw.y = groundAt(nw.x, nw.z); nw.air = false; if (nw.state !== 'idle') nw.state = 'idle';
  document.body.classList.remove('hz-in'); hzSetF('');
  if (!quiet) sfx.ding();
}
function hzStairs(s){
  HZ.fl = s.to; const t = HZ_STAIRS.find(q => q.fl === s.to);
  nw.x = HX(t.x + 1.3, t.fl); nw.z = HZZ(t.z + (t.fl ? .2 : -.4)); nw.h = t.fl ? 0 : Math.PI; nw.state = 'idle';
  tone('triangle', s.to ? 520 : 660, s.to ? 660 : 520, .12, .07);
  gxCallout(s.to ? '二楼' : '一楼', s.to ? '主卧 · 次卧 · 小房间' : '客厅 · 饭厅 · 厨房 · 后院', '#9fd8ff');
}
/* buying: called by the panel (js/89-house-ui.js) */
function hzBuy(h){
  if (!h || hz.own[h.id] || money < h.price) return false;
  money -= h.price; hz.spent += h.price; hz.own[h.id] = {t:Date.now(), s:{}, it:[], ow:[], of:[], w:'white', f:'terr'};
  hzWrite(); moneyChanged(); hzBuildSigns(); if (HZ.in === h) HZ.tour = false;
  sfx.sparkle(); camShake = Math.max(camShake, .2);
  gxCallout('有房了！', `${h.name} · RM ${h.price.toLocaleString()}`, '#38c6d9');
  hzCheckAch(h.id);
  return true;
}

/* ---------- the F button and the line above it ---------- */
let hzFL = '';
function hzSetF(t){
  if (t === hzFL) return; hzFL = t;
  const b = actF.querySelector('b'); if (t) b.textContent = t; else updateActs();
}
const hzNearDoor = () => !driving && !HZ.in && nw.state !== 'fly' && HZ_HOUSES.find(h => Math.hypot(nw.x - h.door.x, nw.z - h.door.z) < 2.3) || null;
/* inside: what F does where you stand */
function hzActNow(){
  const lx = nw.x - HZ_OX - (HZ.fl ? HZ_UP : 0), lz = nw.z - HZ_OZ;
  if (!HZ.fl && Math.hypot(lx - HZ_EXIT.x, lz - HZ_EXIT.z) < 1.9) return {label:'出门', go:() => hzLeave()};
  for (const s of HZ_STAIRS) if (s.fl === HZ.fl && Math.hypot(lx - s.x, lz - s.z) < 1.7) return {label:s.label, go:() => hzStairs(s)};
  if (HZ.tour) return {label:'买下', go:() => hzUiOpen('view', HZ.in)};
  return {label:'装修', go:() => hzUiOpen('deco', HZ.in)};
}
function hzTryF(){
  if (mode !== 'naiwa' || gx.paused) return false;
  if (HZ.in){ if (driving) return false; const a = hzActNow(); a.go(); return true; }
  const h = hzNearDoor(); if (!h) return false;
  const why = hzBusyWhy(); if (why){ toast(h.name, why, 2200); return true; }
  if (hz.own[h.id]) hzEnter(h); else hzUiOpen('view', h);
  return true;
}
if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ return hzTryF() || base(); }; } else window.roomTryF = hzTryF;

/* ---------- per frame ---------- */
let hzPrompt = '';
function hzUpdate(dt, px, pz){
  hzPrompt = '';
  if (HZ.in){
    if (driving){ hzSetF(''); return; }
    HZ.fl = nw.x - HZ_OX > HZ_UP / 2 ? 1 : 0;
    const a = hzActNow(); HZ.act = a; hzSetF(a.label);
    hzPrompt = a.label === '出门' ? (TOUCH ? '点「出门」' : '按 F 出门') : a.label === '上楼' || a.label === '下楼' ? (TOUCH ? `点「${a.label}」` : `按 F ${a.label}`)
      : HZ.tour ? `看房中 · ${HZ.in.name} · RM ${HZ.in.price.toLocaleString()} · ${TOUCH ? '点「买下」' : '按 F 买下'}` : `${TOUCH ? '点「装修」' : '按 F 装修'} · 楼梯口上下楼 · 门口绿圈出门`;
    const T = performance.now() / 300; hzExitMark.userData.ring.scale.y = 1 + Math.sin(T) * .15; for (const m of hzStairMarks) m.userData.ring.scale.y = 1 + Math.sin(T + 1) * .15;
    const lit = Math.min(1, cur.lamp) * .3; if (Math.abs(hzSolidMat.emissiveIntensity - lit) > .005){ hzSolidMat.emissiveIntensity = lit; hzShellMat.emissiveIntensity = .22 + lit * .5; hzFloorMat.emissiveIntensity = lit * .5; }
    return;
  }
  /* outside: labels near the houses, the F button at a door, your car in your carport */
  const near = Math.abs(px - (TWM.x0 + TWM.x1) / 2) < 90 && Math.abs(pz - TWM.z0) < 70;
  HZ_HOUSES.forEach((h, i) => { const l = hzLbls[i], on = near && Math.hypot(px - h.ux - 3, pz - TWM.z0) < 40; l.dead = !on; if (on){ const t = hzLblText(h); if (l.el.textContent !== t) l.el.textContent = t; } });
  const d = hzNearDoor();
  if (d){
    const why = hzBusyWhy(); hzSetF(hz.own[d.id] ? '回家' : '看房');
    hzPrompt = why ? `${d.name} · ${why}` : hz.own[d.id] ? `${TOUCH ? '点「回家」' : '按 F 回家'} · ${d.name}` : `${TOUCH ? '点「看房」' : '按 F 看房'} · ${d.name} · ${d.tag} · RM ${d.price.toLocaleString()}`;
  } else hzSetF('');
  HZ.parkT -= dt;
  if (HZ.parkT <= 0 && myCar){
    HZ.parkT = .5;
    const still = driving !== myCar && Math.hypot(myCar.vx, myCar.vz) < .5;
    if (still){
      const h = hzOwnedList().find(q => Math.abs(myCar.x - q.park.x) < 2.2 && myCar.z > TWM.z0 - .5 && myCar.z < q.zf);
      const id = h ? h.id : null;
      if (id !== hz.park){ hz.park = id; hzWrite(); if (h && !HZ.told.park){ HZ.told.park = 1; toast('停进自家车棚了', '下次上线车还停在这里', 2600); } }
    }
  }
}
/* your car comes back where you left it, if that was your carport (js/80-gta.js put it by the car park when the save loaded) */
(function hzParkOnLoad(){
  const h = hz.park && hzById(hz.park); if (!h || !myCar || !hz.own[h.id]) return;
  Object.assign(myCar, {x:h.park.x, z:h.park.z, h:h.park.h, vx:0, vz:0}); myCar.root.position.set(myCar.x, 0, myCar.z); myCar.root.rotation.y = myCar.h;
})();

/* ---------- minimap: the floor you are on while inside, the houses on the campus map ---------- */
function hzMini(){
  const Sz = mini.width, k = (Sz - 18) / (HZ_YARD + 1), fl = HZ.fl, X = x => Sz / 2 + x * k, Z = z => 9 + z * k;
  mg.fillStyle = '#262a31'; mg.fillRect(0, 0, Sz, Sz);
  mg.fillStyle = '#d6d0c4'; mg.fillRect(X(-HZ_W), Z(0), HZ_W * 2 * k, HZ_D * k);
  if (!fl){ mg.fillStyle = '#a9a59c'; mg.fillRect(X(-HZ_W), Z(HZ_D), HZ_W * 2 * k, (HZ_YARD - HZ_D) * k); }
  mg.fillStyle = '#8d8579'; for (const [x0, z0, x1, z1, f] of HZ_BLOCKS) if (f === fl) mg.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
  const o = HZ.in && hz.own[HZ.in.id], place = typeof hzUiPlace === 'function' && hzUiPlace() || (o ? o.s : {});
  for (const sl of HZ_SLOTS) if (sl.fl === fl){ const it = place[sl.id] && HZ_IT[place[sl.id]]; mg.fillStyle = it ? HZ_STYLES.find(s => s.id === it.st).col : 'rgba(255,255,255,.18)'; mg.beginPath(); mg.arc(X(sl.x), Z(sl.z), it ? 4.5 : 3, 0, 7); mg.fill(); }
  mg.fillStyle = '#1f2a33'; for (const w of HZ_WALLS_PLAN) if (w.fl === fl) mg.fillRect(X(w.x0) - .5, Z(w.z0) - .5, Math.max(2, (w.x1 - w.x0) * k) + 1, Math.max(2, (w.z1 - w.z0) * k) + 1);
  const dot = (x, z, col, r) => { mg.fillStyle = col; mg.beginPath(); mg.arc(X(x), Z(z), r, 0, 7); mg.fill(); mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2; mg.stroke(); };
  if (!fl) dot(HZ_EXIT.x, HZ_EXIT.z, '#4fd18b', 6);
  for (const s of HZ_STAIRS) if (s.fl === fl) dot(s.x, s.z, '#9fd8ff', 5);
  mg.font = `700 ${Math.round(Sz / 16)}px ${HZ_FONT}`; mg.textAlign = 'center'; mg.fillStyle = 'rgba(31,42,51,.75)';
  const rooms = fl ? [['主卧', 0, 3.4], ['次卧', 2.5, 9.4], ['小房间', 2.5, 14.2]] : [['客厅', 0, 4], ['饭厅', 1.4, 10.4], ['厨房', 2.6, 14.6], ['后院', 0, 19]];
  for (const [t, x, z] of rooms) mg.fillText(t, X(x), Z(z) + 4);
  mg.save(); mg.translate(X(nw.x - HZ_OX - (fl ? HZ_UP : 0)), Z(nw.z - HZ_OZ)); mg.rotate(-(nw.h + Math.PI));
  mg.fillStyle = '#f2c64a'; mg.strokeStyle = '#1f2a33'; mg.lineWidth = 2.5; mg.beginPath(); mg.moveTo(0, -11); mg.lineTo(7.5, 8); mg.lineTo(0, 4); mg.lineTo(-7.5, 8); mg.closePath(); mg.stroke(); mg.fill(); mg.restore();
}
{ const base = drawMini; drawMini = function(cx, cz, yaw){ if (HZ.in && mode === 'naiwa') hzMini(); else base(cx, cz, yaw); }; }

/* ---------- hook into the game loop, the way js/89-dorm.js does ---------- */
{
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){ base.update(dt, px, pz); hzUpdate(dt, px, pz); },
    busy(){ return base.busy() || !!HZ.in; },
    extBusy(){ return base.extBusy() || !!HZ.in; },
    prompt(){ return hzPrompt || base.prompt(); },
    target(){ return HZ.in ? (HZ.fl ? {x:HX(HZ_STAIRS[1].x, 1), z:HZZ(HZ_STAIRS[1].z), label:'下楼'} : {x:HX(HZ_EXIT.x, 0), z:HZZ(HZ_EXIT.z), label:'出门'}) : base.target(); },
    mini(dot){ base.mini(dot); if (!HZ.in) for (const h of HZ_HOUSES) dot(h.ux + 3, TWM.z0 + 3, hz.own[h.id] ? '#ffffff' : '#38c6d9', hz.own[h.id] ? 5 : 4); },
    onBust(){ if (HZ.in) hzLeave(true); base.onBust(); },
    leave(){ if (HZ.in) hzLeave(true); for (const l of hzLbls) l.dead = true; hzSetF(''); base.leave(); }
  });
}
hzG.traverse(o => { if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending) o.renderOrder = 2; });
hzExitMark.visible = false; for (const m of hzStairMarks) m.visible = false;

/* for tests and the console */
window.XHouse = {
  houses:HZ_HOUSES, items:HZ_ITEMS, slots:HZ_SLOTS, save:hz, state:HZ, worth:hzHouseWorth,
  enter(id, tour){ const h = hzById(id) || HZ_HOUSES[0]; if (HZ.in) hzLeave(true); hzEnter(h, tour != null ? tour : !hz.own[h.id]); return h; },
  leave(){ hzLeave(); }, buy(id){ return hzBuy(hzById(id)); },
  goDoor(id){ const h = hzById(id) || HZ_HOUSES[0]; if (HZ.in) hzLeave(true); if (driving) leaveCar(); nw.x = h.door.x; nw.z = h.door.z - .6; nw.h = 0; camYaw = Math.PI; return h; }
};
