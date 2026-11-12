/* XMUM 校园漫游 · 雪邦赛道的维修区车库（雪邦车队）：F1 改装材料从这里来
 *
 * 入口：主直道边上维修区的一间车库门口（js/92-f1park.js 的维修区那排车库），走路过去按 F 进去；开着车先下车。
 *   汽车游乐园跟着主线第 5 章开放（XPark.qLock('park')），之前进不去。
 * 场景：一间车库搭在地图外（x 0, z -4700，KLIA −2600、吉隆坡 / 布城 −3100 / −3600、IOI −3950、房子 −4100 之外的空位），第一次进去才生成。
 *   车库中间架着一辆 F1 赛车，左边轮胎架，右边工具墙和遥测台（屏幕上画着雪邦赛道），车队经理 Ken 站在遥测台边。
 * 三个活（都掉新材料，掉落表 TN_DROPS.f1pit / f1test / f1run 在 js/92-f1-tuning.js）：
 *   1. 换胎挑战：赛车前按 F。四个轮子按随机顺序亮起，每个轮子点三下（松螺母、换胎、上紧），最后点「放车」。
 *      手机上是四个大按钮（摆成车的四个角），键盘 Q W / A S 对应左前 右前 / 左后 右后，空格放车。点错罚 0.5 秒。
 *      金牌 4.5 秒、银牌 6 秒、铜牌 8 秒以内；第一次金牌一定给 F1 空力套件配方。
 *   2. 测试车手：经理给一个目标圈速（按你开的车算），出去在雪邦赛道上跑一圈干净的计时圈（出界的圈不算），达标按档给风洞数据。
 *      第一次金牌一定给 F1 引擎模式配方。10 分钟内有效，没达标可以接着跑。
 *   3. 车队跑腿：去赛道边某个地方（1 号弯救援车、控制塔、东直道尽头、12 号弯轮胎墙……）拿一样东西，再送回车库门口，限时，剩的时间越多越好。
 *   另外：雪邦赛道上每跑完一圈干净的计时圈也有一点几率掉赛车胎胶料（TN_DROPS.f1lap，有冷却和每日上限）。
 * 平衡（仓库主人：「不能一下出一堆」）：每样活每天最多 3 次给材料（计时圈 2 次），同一天第 2、3 次的几率乘 0.6、0.35；
 *   测试车手的金 / 银 / 铜三个目标，每辆车每个目标每天只领一次；领完了照样能玩、刷纪录，结算时写明「今天领完了」。
 *   材料只在一局结束时发一次：中途退出、重开、回赛道都不会再发。
 * 赛车改装店（车库左边的柜台）：只改赛车。方程式赛车 RM 3,500 在这里买，F1 赛道件在这里装（改装界面借用改装车间的）；
 *   赛车停在维修区车道上，「开赛车出去」把它摆到车库门口。赛车只能在雪邦赛道（二园整块）和汽车游乐园一园里开：
 *   开到园区边上会被挡回来并提示「赛车不能上公路」；它不在车行里，叫车叫不来。
 * 存档 localStorage 'xmum-paddock-v1' = {pitBest, pitGold, testGold, n, rc, paid}。
 * 对外：window.XPaddock（测试用），window.XF1Tune（给主线等其他功能接：店的位置、有没有赛车、装没装 F1 件、材料数）。 */
'use strict';
(() => {
  const F = window.XF1, P = window.XPark; if (!F || !P || typeof gx === 'undefined') return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const OX = 0, OZ = -4700, W2 = 13, D2 = 9, WH = 3.4;
  const L = (x, z) => [OX + x, OZ + z];
  const SAVE = {pitBest:null, pitGold:false, testGold:false, n:0, rc:false, paid:{d:'', k:{}}};
  try { Object.assign(SAVE, JSON.parse(localStorage.getItem('xmum-paddock-v1') || '{}')); } catch(e){}
  const save = () => { try { localStorage.setItem('xmum-paddock-v1', JSON.stringify(SAVE)); } catch(e){} };
  const locked = () => !!(P.qLock && P.qLock('park'));
  const fmt2 = t => t == null ? '—' : Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');

  /* ---------- the door outside: the garage behind the pit lane next to the 维修区 label ---------- */
  const N = F.N, wi = i => ((i % N) + N) % N, s = F.PIT.side;
  const DI = F.PITM != null ? F.PITM : wi(F.SF + 60), DOOR = (() => { const [x, z] = F.PT[DI], [nx, nz] = F.NOR[DI], o = s * (F.HW + 13); return {x:x + nx * o, z:z + nz * o, h:Math.atan2(-nx * s, -nz * s)}; })();
  const doorMark = gxMarker('#ff8a3d', .3); doorMark.position.set(DOOR.x, .05, DOOR.z);
  doorMark.children.forEach(c => { if (c !== doorMark.userData.ring) c.scale.y = .5; });
  const doorLbl = addLabel('维修区车库 · 雪邦车队', DOOR.x, 4.2, DOOR.z, true);

  /* ---------- the garage (built on first entry) ---------- */
  const G = new THREE.Group(); G.position.set(OX, 0, OZ); G.visible = false; scene.add(G);
  const cols = [], spots = {exit:{x:0, z:7.6, r:1.9, label:'出去'}, boss:{x:8.6, z:-4.6, r:2.2, label:'车队经理'}, pit:{x:0, z:3.2, r:2.2, label:'换胎挑战'}, shop:{x:-8.2, z:4.4, r:2.2, label:'赛车改装店'}};
  const marks = {}, lbls = [];
  let built = false, boss = null, screens = null;
  function canvasTex(w, h, draw){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.anisotropy = typeof ANISO !== 'undefined' ? ANISO : 1; return t; }
  function build(){
    built = true;
    const parts = [], box = (w, h, d, x, y, z, c, ry, rx) => parts.push(geoTint(geoAt(new THREE.BoxGeometry(w, h, d), x, y, z, rx || 0, ry || 0, 0), c));
    const cyl = (r, h, x, y, z, c, rz, rx, seg) => parts.push(geoTint(geoAt(new THREE.CylinderGeometry(r, r, h, seg || 14), x, y, z, rx || 0, 0, rz || 0), c));
    /* floor: grey epoxy, the yellow pit box, the apron and the pit lane outside the open front */
    box(2 * W2, .1, 2 * D2, 0, -.05, 0, '#9ea4aa');
    for (const [w, d, x, z] of [[6.4, .12, 0, -5.6], [6.4, .12, 0, 2], [.12, 7.6, -3.2, -1.8], [.12, 7.6, 3.2, -1.8]]) box(w, .02, d, x, .01, z, '#ffd23a');
    box(2 * W2 + 6, .08, 7, 0, -.04, D2 + 3.5, '#55595e'); box(2 * W2 + 6, .02, .2, 0, .01, D2 + 5.6, '#f4f1ea');
    /* walls: back, sides, the header over the open front, team colours */
    box(2 * W2, WH, .3, 0, WH / 2, -D2, '#e8e4dc'); box(2 * W2, .5, .32, 0, 1.2, -D2 + .01, '#c8322a');
    for (const sx of [-1, 1]){ box(.3, WH, 2 * D2, sx * W2, WH / 2, 0, '#e8e4dc'); box(.32, .5, 2 * D2, sx * (W2 - .01), 1.2, 0, '#1b5aa6'); box(1.2, WH, .4, sx * (W2 - .6), WH / 2, D2, '#d9d4c8'); }
    /* the F1 car on its stands in the middle, facing the pit lane */
    const C = '#c8322a', K = '#1c1c1e', CF = '#2b2e33';
    box(.9, .32, 3.2, 0, .5, -1.6, C); box(.5, .22, 1.3, 0, .45, .55, C, 0, -.08); box(.32, .14, .5, 0, .38, 1.35, C);
    for (const sx of [-1, 1]){ box(.42, .34, 1.5, sx * .62, .48, -1.7, C); }
    box(.7, .5, .9, 0, .82, -2.6, C); box(.5, .32, .5, 0, .78, -1.1, K);                                    /* engine cover, cockpit */
    box(2.1, .05, .5, 0, .2, 1.7, CF); box(1.9, .04, .25, 0, .3, 1.55, CF, 0, -.4); for (const sx of [-1, 1]) box(.04, .28, .55, sx * 1.05, .3, 1.68, CF);   /* front wing */
    box(1.3, .05, .4, 0, 1.15, -3.3, CF); box(1.25, .04, .22, 0, 1.28, -3.45, CF, 0, .5); for (const sx of [-1, 1]) box(.04, .6, .65, sx * .66, 1.0, -3.35, CF); box(.08, .55, .1, 0, .86, -3.2, CF);
    parts.push(geoTint(geoAt(new THREE.TorusGeometry(.32, .035, 6, 16, Math.PI), 0, 1.02, -1.15, 0, 0, 0), K));   /* the halo */
    for (const [x, z] of [[-.95, .75], [.95, .75], [-.95, -2.55], [.95, -2.55]]){
      cyl(.34, .38, x, .52, z, K, Math.PI / 2, 0, 18); parts.push(geoTint(geoAt(new THREE.TorusGeometry(.27, .028, 5, 20), x + Math.sign(x) * .195, .52, z, 0, Math.PI / 2, 0), '#ffd23a')); cyl(.2, .4, x, .52, z, '#8d9196', Math.PI / 2, 0, 10);
      box(.12, .18, .12, x * .7, .09, z, '#ffb13b');                                                         /* the stands */
    }
    /* tyre racks along the left wall: sets with coloured bands (soft red, medium yellow, hard white) */
    const tyres = [];
    for (let r = 0; r < 3; r++) for (let st = 0; st < 4; st++) for (let k = 0; k < 4; k++) tyres.push([-W2 + .9, .25 + k * .4, -6.5 + r * 4.2 + st * .78, ['#c8322a', '#ffd23a', '#f4f1ea'][r]]);
    for (let r = 0; r < 3; r++){ box(.9, 1.9, 3.3, -W2 + .8, .95, -5.3 + r * 4.2, '#5d6166'); }
    /* right wall: tool board, workbench, the telemetry desk and its screens */
    box(.08, 1.6, 6, W2 - .2, 2, 3, '#3b3f44'); box(1, .9, 5, W2 - .7, .45, 3, '#7b7f85'); box(1.05, .06, 5.1, W2 - .7, .92, 3, '#2b2e33');
    for (let k = 0; k < 9; k++) box(.06, .1 + (k % 3) * .12, .5, W2 - .26, 1.6 + (k % 3) * .4, .8 + (k / 3 | 0) * 1.8, ['#c8322a', '#ffd23a', '#8d9196'][k % 3]);
    box(3.6, .8, 1.2, 8.6, .4, -7.4, '#2b2e33'); for (const k of [-1, 0, 1]){ box(1.1, .7, .06, 8.6 + k * 1.15, 1.3, -7.75, '#111214'); box(.08, .45, .08, 8.6 + k * 1.15, .9, -7.75, '#3b3f44'); }
    box(1.4, .45, .7, -4, .23, -7.6, '#1b5aa6'); box(1.4, .45, .7, -2.4, .23, -7.6, '#1b5aa6');                 /* flight cases */
    box(.8, 1, 2.6, -10.1, .5, 4.4, '#2b2e33'); box(.9, .06, 2.7, -10.1, 1.02, 4.4, '#c8322a'); box(.5, .3, .4, -10.1, 1.2, 3.8, '#111214');   /* 赛车改装店 counter, a till */
    const geo = geoMerge(parts), mesh = new THREE.Mesh(geo, M('#ffffff', {vertexColors:true, roughness:.6})); mesh.receiveShadow = true; G.add(mesh);
    { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.33, .33, .36, 14).rotateZ(Math.PI / 2), M('#1c1c1e', {roughness:.85}), tyres.length), m4 = new THREE.Matrix4();
      tyres.forEach(([x, y, z], i) => { im.setMatrixAt(i, m4.makeRotationY(Math.PI / 2).setPosition(x, y, z)); }); G.add(im);
      const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(.335, .335, .04, 14).rotateZ(Math.PI / 2), M('#ffffff', {roughness:.6}), tyres.length), c = new THREE.Color();
      tyres.forEach(([x, y, z, col], i) => { bands.setMatrixAt(i, m4.makeRotationY(Math.PI / 2).setPosition(x, y, z + .19)); bands.setColorAt(i, c.set(col)); }); G.add(bands); }
    /* banners: the team name over the front, a sign on the back wall */
    const ban = canvasTex(1024, 128, (cx, w, h) => { cx.fillStyle = '#1f2a33'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#c8322a'; cx.fillRect(0, h - 14, w, 14);
      cx.fillStyle = '#ffffff'; cx.font = '900 66px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('雪邦车队 · XMUM RACING', w / 2, h / 2 - 4, w - 40); });
    for (const [z, ry, y] of [[D2 - .2, Math.PI, WH - .5], [-D2 + .17, 0, 2.6]]){ const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.25), new THREE.MeshStandardMaterial({map:ban, roughness:.6, emissive:'#ffffff', emissiveMap:ban, emissiveIntensity:.2})); m.position.set(0, y, z); m.rotation.y = ry; G.add(m); }
    box(2 * W2, .6, .5, 0, WH - .3, D2, '#1f2a33');
    { const t = canvasTex(512, 128, (cx, w, h) => { cx.fillStyle = '#c8322a'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#ffffff'; cx.font = '900 60px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('赛车改装店 · 只改赛车', w / 2, h / 2, w - 30); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({map:t, roughness:.6, emissive:'#ffffff', emissiveMap:t, emissiveIntensity:.2})); m.position.set(-W2 + .17, 2.6, 4.4); m.rotation.y = Math.PI / 2; G.add(m); }
    /* telemetry screens: the circuit, a speed trace, the wind-tunnel numbers */
    const scr = canvasTex(768, 256, (cx, w, h) => {
      cx.fillStyle = '#0d1420'; cx.fillRect(0, 0, w, h);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of F.PT){ x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const k = Math.min(220 / (x1 - x0), 220 / (z1 - z0)); cx.strokeStyle = '#9fd3ff'; cx.lineWidth = 4; cx.beginPath();
      F.PT.forEach(([x, z], i) => { const px = 16 + (x - x0) * k, pz = 18 + (z - z0) * k; i ? cx.lineTo(px, pz) : cx.moveTo(px, pz); }); cx.closePath(); cx.stroke();
      cx.strokeStyle = '#ffd23a'; cx.lineWidth = 3; cx.beginPath(); for (let i = 0; i < 240; i++){ const v = 140 + 70 * Math.sin(i / 13) * Math.cos(i / 31); i ? cx.lineTo(268 + i, 256 - v * .9) : cx.moveTo(268, 256 - v * .9); } cx.stroke();
      cx.fillStyle = '#7dff5a'; cx.font = '700 22px monospace'; ['下压力 +62%', '阻力 0.81', '前后平衡 41:59', '胎温 98°C'].forEach((t, i) => cx.fillText(t, 530, 50 + i * 46)); });
    screens = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .66), new THREE.MeshBasicMaterial({map:scr, toneMapped:false})); screens.position.set(8.6, 1.3, -7.71); G.add(screens);
    /* the team manager: red team shirt, headset */
    { const b = new THREE.Group(), red = M('#c8322a', {roughness:.7}), dark = M('#2b2e33', {roughness:.8}), skin = M('#d9a77e', {roughness:.8});
      const part = (w, h, d, x, y, z, m) => { const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); q.position.set(x, y, z); b.add(q); return q; };
      part(.18, .8, .2, -.12, .4, 0, dark); part(.18, .8, .2, .12, .4, 0, dark); part(.56, .7, .32, 0, 1.15, 0, red); part(.14, .62, .14, -.36, 1.12, 0, red); part(.14, .62, .14, .36, 1.12, 0, red);
      part(.36, .38, .34, 0, 1.72, 0, skin); part(.4, .08, .38, 0, 1.92, 0, dark); part(.06, .16, .1, -.21, 1.74, 0, dark); part(.06, .16, .1, .21, 1.74, 0, dark);
      b.position.set(8.6, 0, -5.9); b.rotation.y = Math.PI * .9; G.add(b); boss = b; }
    /* colliders (switched off while you are outside) */
    const C2 = (x, z, hx, hz) => { const [wx, wz] = L(x, z), c = addBox(wx, wz, hx, hz, 0); c.dead = true; cols.push(c); };
    C2(0, -D2, W2, .3); C2(-W2, 0, .3, D2); C2(W2, 0, .3, D2); C2(0, -1.4, 1.2, 2.6); C2(-W2 + .8, -1.1, .6, 6); C2(W2 - .7, 3, .6, 2.6); C2(8.6, -7.4, 1.9, .7); C2(-3.2, -7.6, 1.5, .45); C2(-10.1, 4.4, .45, 1.35);
    C2(-W2 - 1, D2 + 3, .4, 4); C2(W2 + 1, D2 + 3, .4, 4); C2(0, D2 + 6.6, W2 + 1, .4);   /* keep you on the apron */
    for (const k in spots){ const S = spots[k], [x, z] = L(S.x, S.z), m = gxMarker(k === 'exit' ? '#4fd18b' : k === 'pit' ? '#ffd23a' : '#ff8a3d', .26); m.position.set(x, .05, z);
      m.children.forEach(c => { if (c !== m.userData.ring) c.visible = false; }); marks[k] = m; const lb = addLabel(S.label, x, 2.5, z, true); lb.dead = true; lbls.push(lb); }
  }

  /* ---------- in and out ---------- */
  const PD = {in:false, keep:null, job:null, pit:null, near:null, card:false, fL:''};
  function enter(){
    if (PD.in) return;
    if (!built) build();
    if (mode !== 'naiwa') setMode('naiwa');
    if (driving) leaveCar();
    PD.in = true; PD.keep = {dist:camDist, pitch:camPitch};
    window.XINDOOR = 'paddock'; window.XINDOOR_AT = {x:DOOR.x, z:DOOR.z, h:DOOR.h};
    G.visible = true; for (const c of cols) c.dead = false; for (const k in marks) marks[k].visible = true; for (const l of lbls) l.dead = false;
    const [x, z] = L(0, 9.5); Object.assign(nw, {x, z, y:0, h:Math.PI, air:false, state:'idle', vx:0, vz:0}); camYaw = 0; camDist = 13; camPitch = 1.0;
    sfx.ding(); gx.callout('维修区车库', '雪邦车队 · XMUM RACING', '#c8322a');
    if (!SAVE.n){ toast('车队经理 Ken 在遥测台边', '找他接活：换胎挑战、测试车手、车队跑腿。F1 改装的材料都从这里来', 4400); }
    SAVE.n++; save();
  }
  function leave(quiet){
    if (!PD.in) return;
    pitClose(true); cardClose();
    PD.in = false; G.visible = false; window.XINDOOR = null; window.XINDOOR_AT = null;
    for (const c of cols) c.dead = true; for (const k in marks) marks[k].visible = false; for (const l of lbls) l.dead = true;
    if (PD.keep){ camDist = PD.keep.dist; camPitch = PD.keep.pitch; }
    nw.x = DOOR.x + Math.sin(DOOR.h) * 1.5; nw.z = DOOR.z + Math.cos(DOOR.h) * 1.5; nw.h = DOOR.h; nw.y = groundAt(nw.x, nw.z); nw.air = false; nw.state = 'idle'; camYaw = DOOR.h + Math.PI;
    setF(''); if (!quiet) sfx.ding();
  }

  /* ---------- the team manager's card ---------- */
  const css = document.createElement('style');
  css.textContent = `
#pdCard,#pdPit{position:fixed;z-index:30;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 32px);overflow:auto;padding:16px 16px 14px;box-sizing:border-box}
#pdCard h2,#pdPit h2{margin:2px 0 4px;font-size:21px} #pdCard p{margin:4px 0;font-size:14px;line-height:1.5}
#pdCard .pd-acts{display:grid;gap:8px;margin:10px 0}
#pdCard .pd-act{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;text-align:left;padding:10px 12px;border-radius:var(--r-lg,14px);border:1px solid var(--line);background:var(--panel);color:inherit;cursor:pointer;font:inherit}
#pdCard .pd-act b{font-size:15px} #pdCard .pd-act small{grid-column:1;color:var(--muted);font-size:12.5px;line-height:1.4} #pdCard .pd-act em{grid-row:1/3;grid-column:2;font-style:normal;font-size:12px;color:var(--muted)}
#pdCard .pd-act[disabled]{opacity:.5;cursor:default}
#pdCard .pd-mats{font-size:12.5px;color:var(--muted);line-height:1.5;margin-top:6px}
#pdPit .pd-time{font-family:var(--display,inherit);font-size:34px;font-weight:900;font-variant-numeric:tabular-nums;text-align:center;margin:2px 0}
#pdPit .pd-car{display:grid;grid-template-columns:1fr 92px 1fr;grid-template-rows:1fr 1fr;gap:10px;margin:8px 0;height:min(300px,46vh)}
#pdPit .pd-body{grid-column:2;grid-row:1/3;border-radius:40px 40px 18px 18px;background:linear-gradient(#c8322a,#8f1f1a);position:relative}
#pdPit .pd-body::after{content:'';position:absolute;left:30%;right:30%;top:42%;height:18%;border-radius:12px;background:#1c1c1e}
#pdPit .pd-w{border-radius:16px;border:2px solid var(--line);background:#2b2e33;color:#fff;font:inherit;font-size:16px;font-weight:800;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}
#pdPit .pd-w.on{background:#ffd23a;color:#1f2a33;border-color:#ffd23a;box-shadow:0 0 0 4px rgba(255,210,58,.35)}
#pdPit .pd-w.done{background:#2e9d5b;border-color:#2e9d5b}
#pdPit .pd-w.bad{animation:pdBad .3s}
#pdPit .pd-w kbd{font-size:10px;opacity:.7}
#pdPit .pd-go{width:100%;min-height:56px;font-size:18px;font-weight:900}
#pdPit .pd-msg{text-align:center;font-size:13.5px;color:var(--muted);min-height:20px}
@keyframes pdBad{0%,100%{transform:none}30%{transform:translateX(-6px)}60%{transform:translateX(6px)}}
@media (pointer:coarse){#pdPit .pd-w kbd{display:none}}
`;
  document.head.appendChild(css);
  const card = document.createElement('div'); card.id = 'pdCard'; card.className = 'panel'; card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'pdCardT');
  document.body.appendChild(card);
  const RUN = [];   /* errand spots, built from the circuit: [name, x, z, item] */
  { const ITEMS = ['一套雨胎', '前翼备件', '轮胎温度计', '车手的头盔', '一桶赛车汽油', '一卷胶带', '对讲机电池'];
    const clearOf = (x, z) => { for (let k = 0; k < F.N; k += 2) if (Math.hypot(F.PT[k][0] - x, F.PT[k][1] - z) < F.HWI[k] + 8) return false; return x > F.PAD.x0 + 8 && x < F.PAD.x1 - 8 && z > F.PAD.z0 + 8 && z < F.PAD.z1 - 8; };
    const T = F.turnIdx, step = Math.max(1, Math.ceil(T.length / 7));
    for (let k = 0, q = 0; k < T.length; k += step){ const [n, i] = T[k], sd = F.CURV[i] > 0 ? -1 : 1, [x, z] = F.PT[i], [nx, nz] = F.NOR[i];
      for (const d of [24, 18, -14]){ const o = sd * (F.HWI[i] + d), px = x + nx * o, pz = z + nz * o; if (clearOf(px, pz)){ RUN.push([n + ' 号弯' + (d < 0 ? '弯心' : '边'), px, pz, ITEMS[q++ % ITEMS.length]]); break; } } }
    RUN.push(['控制塔', ...(() => { const [x, z] = F.PT[wi(F.SF + 20)], [nx, nz] = F.NOR[wi(F.SF + 20)], o = s * (F.HW + 26); return [x + nx * o, z + nz * o]; })(), '遥测电脑']);
    if (window.XKart) RUN.push(['看台', XKart.stand[0], XKart.stand[1], '冰镇饮料（给车手）']);
    for (const r of RUN){ const [x, z] = [r[1], r[2]]; if (typeof hitsBuilding === 'function' && hitsBuilding(x, z, 1.2)) for (let k = 1; k < 12 && hitsBuilding(r[1], r[2], 1.2); k++){ r[1] = x + Math.cos(k * 2.3) * k * 1.5; r[2] = z + Math.sin(k * 2.3) * k * 1.5; } } }
  /* the target lap for test-driver jobs, per car: a bot that brakes for the advisory speeds, standing start, on the 1.8 km kart circuit (lambo 48.9 s, 911 50.5, 玛莎 51.0, Myvi 58.6, 卡丁车 59.8, 方程式赛车 37.9);
     gold = that + 2 %, silver + 10 %, bronze + 22 % */
  const TEST_BASE = {f1car:38, lambo:49, p911:51, mase:51, moto:51, rr:54, gwag:54, sedan:56, myvi:59, kart:60, patrol:62, cart:72, bus:78};
  const testTargets = c => { const b = TEST_BASE[c.kind] || 100; return [b * 1.02, b * 1.1, b * 1.22].map(v => Math.round(v)); };
  function cardOpen(){
    PD.card = true; gx.paused = true; engineUpdate(0, 0, false);
    const j = PD.job, c = myCar, tg = c ? testTargets(c) : null;
    card.innerHTML = `<button class="x" type="button" id="pdX" aria-label="关闭">×</button>
      <div class="eyebrow">维修区车库 · 雪邦车队</div><h2 id="pdCardT">车队经理 Ken</h2>
      <p>「欢迎！我们车队缺人手。帮我干点活，我拿车队的碳纤维布、赛车胎胶料和风洞数据给你，在车库左边的赛车改装店给方程式赛车装 F1 赛道件。」</p>
      <div class="pd-acts">
        <button class="pd-act" type="button" data-a="pit"><b>换胎挑战</b><em>${SAVE.pitBest != null ? '最好 ' + SAVE.pitBest.toFixed(2) + ' 秒' : '还没试过'}</em><small>赛车前按 F 也行。四个轮子按亮的顺序各点三下，再放车。掉赛车胎胶料、碳纤维布（每天 3 次有材料）${SAVE.pitGold ? '' : '；第一次金牌送 F1 空力套件配方'}</small></button>
        <button class="pd-act" type="button" data-a="test"${j && j.type === 'test' ? ' disabled' : ''}><b>测试车手</b><em>${j && j.type === 'test' ? '进行中' : tg ? `${fmt2(tg[0])} / ${fmt2(tg[1])} / ${fmt2(tg[2])}` : '要有自己的车'}</em><small>开${c ? '你的 ' + c.T.name : '自己的车'}出去跑一圈干净的计时圈，按目标圈速给风洞数据（金 / 银 / 铜，每个目标每天领一次）。出界的圈不算${SAVE.testGold ? '' : '；第一次金牌送 F1 引擎模式配方'}</small></button>
        ${SAVE.rc ? `<button class="pd-act" type="button" data-a="testrc"${j && j.type === 'test' ? ' disabled' : ''}><b>测试车手 · 方程式赛车</b><em>${(t => `${fmt2(t[0])} / ${fmt2(t[1])} / ${fmt2(t[2])}`)(testTargets({kind:'f1car'}))}</em><small>开你的赛车跑同样的计时圈，目标更快；和普通车的目标分开算</small></button>` : ''}
        <button class="pd-act" type="button" data-a="run"${j && j.type === 'run' ? ' disabled' : ''}><b>车队跑腿</b><em>${j && j.type === 'run' ? '进行中' : '限时'}</em><small>去赛道边拿一样东西，再送回车库门口。开车走路都行，剩的时间越多越好。掉碳纤维布</small></button>
      </div>
      ${j ? `<p class="pd-mats">现在的活：${j.type === 'test' ? `测试车手（${j.car}，目标 ${fmt2(j.tg[0])}）` : `跑腿：${j.phase ? '把' + j.item + '送回车库' : '去' + j.name + '拿' + j.item}`} · <a href="#" id="pdDrop">不干了</a></p>` : ''}
      <p class="pd-mats">这三种材料别的玩法不掉，掉得慢：每样活每天最多 3 次有材料，同一天越刷越少。F1 件在车库左边的「赛车改装店」装，只给方程式赛车。</p>`;
    card.hidden = false;
    card.querySelector('#pdX').addEventListener('click', () => cardClose());
    const dr = card.querySelector('#pdDrop'); if (dr) dr.addEventListener('click', e => { e.preventDefault(); PD.job = null; cardClose(); toast('不干了', 'Ken 说下次再来', 1600); });
    card.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { ac(); const a = b.dataset.a; cardClose(); if (a === 'pit') pitOpen(); else if (a === 'test') testStart(); else if (a === 'testrc') testStart(true); else runStart(); }));
    card.querySelector('[data-a="pit"]').focus({preventScroll:true});
  }
  function cardClose(){ if (!PD.card) return; PD.card = false; card.hidden = true; gx.paused = false; canvas.focus({preventScroll:true}); }

  /* ---------- 1. the pit stop ---------- */
  const pitEl = document.createElement('div'); pitEl.id = 'pdPit'; pitEl.className = 'panel'; pitEl.hidden = true; pitEl.setAttribute('role', 'dialog'); pitEl.setAttribute('aria-modal', 'true'); pitEl.setAttribute('aria-labelledby', 'pdPitT');
  pitEl.innerHTML = `<button class="x" type="button" id="pdPx" aria-label="关闭">×</button><div class="eyebrow">维修区 · 换胎挑战</div><h2 id="pdPitT">赛车进站！</h2>
    <div class="pd-time" id="pdT">0.00</div><div class="pd-msg" id="pdM"></div>
    <div class="pd-car"><button type="button" class="pd-w" data-w="0" style="grid-column:1;grid-row:1"><span>左前</span><kbd>Q</kbd></button><div class="pd-body" aria-hidden="true"></div>
      <button type="button" class="pd-w" data-w="1" style="grid-column:3;grid-row:1"><span>右前</span><kbd>W</kbd></button>
      <button type="button" class="pd-w" data-w="2" style="grid-column:1;grid-row:2"><span>左后</span><kbd>A</kbd></button><button type="button" class="pd-w" data-w="3" style="grid-column:3;grid-row:2"><span>右后</span><kbd>S</kbd></button></div>
    <button type="button" class="btn primary pd-go" id="pdGo" disabled>放车 <kbd>空格</kbd></button>`;
  document.body.appendChild(pitEl);
  const PIT_MEDAL = [4.5, 6, 8], STEP = ['松螺母', '换胎', '上紧'];
  const wEls = [...pitEl.querySelectorAll('.pd-w')], goEl = pitEl.querySelector('#pdGo'), tEl = pitEl.querySelector('#pdT'), mEl = pitEl.querySelector('#pdM');
  function pitOpen(){
    if (PD.pit) return;
    gx.paused = true; engineUpdate(0, 0, false);
    const order = [0, 1, 2, 3].sort(() => Math.random() - .5);
    PD.pit = {order, k:0, step:0, t:0, cd:1.6, pen:0, done:false, raf:0, last:performance.now()};
    wEls.forEach(b => { b.className = 'pd-w'; b.querySelector('span').textContent = ['左前', '右前', '左后', '右后'][+b.dataset.w]; });
    goEl.disabled = true; tEl.textContent = '0.00'; mEl.textContent = '准备…'; pitEl.querySelector('#pdPitT').textContent = '赛车进站！';
    pitEl.hidden = false; tone('square', 520, 520, .12, .08);
    const tick = now => { const P2 = PD.pit; if (!P2) return; const dt = Math.min(.1, (now - P2.last) / 1000); P2.last = now; pitTick(dt); P2.raf = requestAnimationFrame(tick); };
    PD.pit.raf = requestAnimationFrame(tick);
  }
  function pitShow(){
    const P2 = PD.pit;
    wEls.forEach(b => { const w = +b.dataset.w, i = P2.order.indexOf(w); b.classList.toggle('done', i < P2.k); b.classList.toggle('on', P2.cd <= 0 && i === P2.k && !P2.done);
      b.querySelector('span').textContent = i < P2.k ? '好了' : i === P2.k && P2.cd <= 0 ? STEP[P2.step] : ['左前', '右前', '左后', '右后'][w]; });
    goEl.disabled = !(P2.k >= 4 && !P2.done);
  }
  function pitTick(dt){
    const P2 = PD.pit;
    if (P2.cd > 0){ const n0 = Math.ceil(P2.cd); P2.cd -= dt; const n1 = Math.ceil(P2.cd); if (P2.cd <= 0){ mEl.textContent = '开始！点亮的轮子'; tone('square', 1046, 1046, .18, .1); pitShow(); } else if (n1 !== n0) tone('square', 660, 660, .1, .07); else mEl.textContent = '准备… ' + n1; return; }
    if (!P2.done){ P2.t += dt; tEl.textContent = (P2.t + P2.pen).toFixed(2); }
  }
  function pitTap(w){
    const P2 = PD.pit; if (!P2 || P2.done) return;
    if (P2.cd > 0) return;
    if (w === 'go'){ if (P2.k >= 4) pitEnd(); return; }
    if (P2.k >= 4) return;
    if (P2.order[P2.k] !== w){ P2.pen += .5; const b = wEls[w]; b.classList.remove('bad'); void b.offsetWidth; b.classList.add('bad'); tone('square', 180, 120, .12, .07); mEl.textContent = '点错了 +0.5 秒'; return; }
    P2.step++; tone('triangle', 700 + P2.step * 160, 900 + P2.step * 160, .05, .06); if (P2.step === 1) noise(.12, .12, 2600, 'highpass');
    if (P2.step >= 3){ P2.step = 0; P2.k++; mEl.textContent = P2.k >= 4 ? '四个都好了，放车！' : '下一个'; }
    pitShow();
  }
  function pitEnd(){
    const P2 = PD.pit; P2.done = true; const t = Math.round((P2.t + P2.pen) * 100) / 100, gr = t <= PIT_MEDAL[0] ? 0 : t <= PIT_MEDAL[1] ? 1 : t <= PIT_MEDAL[2] ? 2 : 3;
    const rec = SAVE.pitBest == null || t < SAVE.pitBest; if (rec) SAVE.pitBest = t;
    const G2 = give('f1pit', gr, '维修区换胎' + (GX_MEDAL[gr] || '')); let loot = G2.loot;
    if (gr === 0 && !SAVE.pitGold && window.XParts){ SAVE.pitGold = true; loot = loot.concat(XParts.roll('bp_f1aero', 1, 1, '换胎挑战第一次金牌')); }
    save(); const pay = [20, 12, 6, 0][gr]; if (pay) earn(pay);
    tEl.textContent = t.toFixed(2); pitEl.querySelector('#pdPitT').textContent = gr < 3 ? '换胎' + GX_MEDAL[gr] + '！' : '太慢了';
    mEl.innerHTML = `${rec ? '新纪录！' : '最好 ' + SAVE.pitBest.toFixed(2) + ' 秒'}${P2.pen ? ` · 点错罚了 ${P2.pen.toFixed(1)} 秒` : ''}${pay ? ` · 奖金 RM ${pay}` : ''}${G2.note ? '<br>' + G2.note : ''}` + (window.XParts ? XParts.chips(loot) : '');
    goEl.disabled = false; goEl.innerHTML = '再来一次'; goEl.onclick = () => { goEl.onclick = null; goEl.innerHTML = '放车 <kbd>空格</kbd>'; pitClose(true); pitOpen(); };
    if (gr < 3) sfx.sparkle ? sfx.sparkle() : sfx.ding(); else sfx.fail && sfx.fail();
  }
  function pitClose(quiet){ const P2 = PD.pit; if (!P2) return; cancelAnimationFrame(P2.raf); PD.pit = null; pitEl.hidden = true; goEl.onclick = null; goEl.innerHTML = '放车 <kbd>空格</kbd>'; gx.paused = false; if (!quiet) canvas.focus({preventScroll:true}); }
  wEls.forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); ac(); pitTap(+b.dataset.w); }));
  goEl.addEventListener('pointerdown', e => { if (goEl.onclick) return; e.preventDefault(); ac(); pitTap('go'); });
  pitEl.querySelector('#pdPx').addEventListener('click', () => pitClose());
  window.addEventListener('keydown', e => {
    if (PD.pit){
      const k = {KeyQ:0, KeyW:1, KeyA:2, KeyS:3}[e.code];
      if (k != null && !e.repeat) pitTap(k); else if (e.code === 'Space' && !e.repeat){ if (goEl.onclick) goEl.onclick(); else pitTap('go'); } else if (e.code === 'Escape') pitClose();
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (PD.card && e.code === 'Escape'){ cardClose(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* ---------- rewards: slow, capped per day, less each time the same day ----------
     Uses the drop tables (TN_DROPS.f1pit / f1test / f1run / f1lap, js/92-f1-tuning.js) and their day / cd limits (XParts.ready).
     The n-th rewarded run of the day multiplies every chance (also the sure ones) by DIM[n]; a run where nothing rolled still counts. */
  const DIM = [1, .6, .35];
  const today = () => typeof dayKey === 'function' ? dayKey() : new Date().toDateString();
  function give(game, grade, why, quiet){
    const D = typeof TN_DROPS !== 'undefined' && TN_DROPS[game]; if (!window.XParts || !D || grade > 2 || !D.g[grade] || !D.g[grade].length) return {loot:[], note:''};
    const lim = () => tnLim(game);
    if (!XParts.ready(game)){
      const capped = D.day && lim().n >= D.day;
      return {loot:[], note:capped ? `今天「${D.name}」的材料领完了（每天 ${D.day} 次），照样能玩、刷纪录，明天再来` : `「${D.name}」冷却中，过一会儿再给材料`};
    }
    const k = DIM[Math.min(lim().n, DIM.length - 1)], g0 = D.g;
    D.g = g0.map(row => row.map(([id, n, p]) => [id, n, (p == null ? 1 : p) * k]));
    let loot = []; try { loot = XParts.reward(game, grade, why); } finally { D.g = g0; }
    if (!loot.length){ const l = lim(); l.n++; l.t = Date.now(); tuneWrite(); }
    const left = Math.max(0, (D.day || 99) - lim().n);
    if (quiet) return {loot, note:''};
    return {loot, note:(loot.length ? '' : '这次没出材料 · ') + (left ? `今天还能领 ${left} 次` : `今天「${D.name}」的材料领完了`)};
  }

  /* ---------- the race car (方程式赛车): bought and tuned at the 赛车改装店, only driven inside the parks ---------- */
  const RK = 'f1car', RC_PRICE = 3500;
  /* 总资产: the race car counts at what it cost, like the cars in the showroom (buying it used to drop the total by RM 3,500) */
  if (typeof assetSource === 'function') assetSource('f1car', () => SAVE.rc ? RC_PRICE : 0);
  let rc = null, rcSaved = null, rcShop = false, rcWarn = 0;
  const inParks = (x, z) => !!(P.inPark && P.inPark(x, z));
  const pitSpot = () => { const i = wi(DI + 3), [x, z] = F.PT[i], [nx, nz] = F.NOR[i], o = s * (F.HW + 9); return [x + nx * o, z + nz * o, Math.atan2(F.TAN[i][0], F.TAN[i][1])]; };
  function rcSpawn(){
    if (!SAVE.rc || !CAR_T[RK]) return null;
    const [x, z, h] = pitSpot();
    if (!rc){ rc = makeCar(RK, '#c8322a', x, z, h); rc.raceCar = true; }
    else if (driving !== rc){ Object.assign(rc, {x, z, h, vx:0, vz:0, y:0, vy:0, air:false, airT:0, lastVy:0, steer:0, pitch:0, hp:100, wrecked:false}); rc.root.position.set(x, 0, z); rc.root.rotation.set(0, h, 0); rc.root.visible = true; if (!cars.includes(rc)) cars.push(rc); }
    rc.T = typeof tunedT === 'function' ? tunedT(RK) : Object.assign({}, CAR_T[RK]);
    if (typeof tnApply === 'function' && typeof tnCar === 'function') tnApply(rc, tnCar(RK).fit);
    return rc;
  }
  /* inside the parks only: at the edge the car is stopped and bounced back */
  { const base = updateCar;
    updateCar = function(c, dt, inp){
      if (c.kind !== RK && c.kind !== 'kart') return base(c, dt, inp);
      const ox = c.x, oz = c.z, was = inParks(ox, oz), r = base(c, dt, inp);
      if (!inParks(c.x, c.z)){
        if (was){ c.x = ox; c.z = oz; c.vx *= -.25; c.vz *= -.25; c.root.position.x = ox; c.root.position.z = oz; }
        else if (c === rc || c.kind === 'kart'){ const [x, z, h] = pitSpot(); Object.assign(c, {x, z, h, vx:0, vz:0}); c.root.position.set(x, c.y, z); c.root.rotation.y = h; }
        if (c === driving && performance.now() - rcWarn > 2500){ rcWarn = performance.now(); gx.callout(c.kind === 'kart' ? '卡丁车不能上公路' : '赛车不能上公路', c.kind === 'kart' ? '只能在汽车游乐园里开' : '只能在汽车游乐园（一园、二园卡丁车场）里开', '#d0473b'); tone('square', 300, 200, .2, .07); }
      }
      return r;
    };
  }
  const f1Fitted = () => { if (typeof tnCar !== 'function' || !SAVE.rc) return 0; const f = tnCar(RK).fit; return TN_SLOTS.filter(q => q.tab === 'f1' && f[q.id] !== TN.stock[q.id]).length; };
  const mats = () => typeof tune === 'undefined' ? {cfc:0, rcomp:0, wtd:0} : {cfc:tune.inv.cfc || 0, rcomp:tune.inv.rcomp || 0, wtd:tune.inv.wtd || 0};
  function shopOpen(){
    PD.card = true; gx.paused = true; engineUpdate(0, 0, false);
    const own = SAVE.rc, m = mats();
    card.innerHTML = `<button class="x" type="button" id="pdX" aria-label="关闭">×</button>
      <div class="eyebrow">维修区车库 · 只改赛车</div><h2 id="pdCardT">赛车改装店</h2>
      <p>方程式赛车在这里买，F1 前后翼、光头胎、碳陶刹车这些赛道件也只在这里装。赛车只能在汽车游乐园（一园、二园卡丁车场）里开，开不上公路，叫车也叫不来。普通车回 XMUM 车行改，照样能上赛道跑。</p>
      <div class="pd-acts">${own ? `
        <button class="pd-act" type="button" data-s="drive"><b>开赛车出去</b><em>停在车库门口</em><small>方程式赛车摆到维修区车道上，直接坐进去</small></button>
        <button class="pd-act" type="button" data-s="tune"><b>改装赛车</b><em>赛道件 ${f1Fitted()}/5</em><small>前翼、前后翼套件、光头胎、碳陶刹车、轻量化、排位赛模式。施工要等，和车行一样</small></button>` : `
        <button class="pd-act" type="button" data-s="buy"${money < RC_PRICE ? ' disabled' : ''}><b>买方程式赛车</b><em>${fmtRM(RC_PRICE)}</em><small>${money < RC_PRICE ? `还差 ${fmtRM(RC_PRICE - money)}` : '开轮赛车，赛道上比任何跑车都抓地；只能在园区里开'}</small></button>`}
      </div>
      <p class="pd-mats">材料：碳纤维布 ${m.cfc} · 赛车胎胶料 ${m.rcomp} · 风洞数据 ${m.wtd}（找车队经理 Ken 接活拿，每样活每天最多 3 次）</p>`;
    card.hidden = false;
    card.querySelector('#pdX').addEventListener('click', () => cardClose());
    card.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { ac(); const a = b.dataset.s; cardClose();
      if (a === 'buy'){ if (money < RC_PRICE) return; money -= RC_PRICE; moneyChanged(); SAVE.rc = true; save(); sfx.sparkle ? sfx.sparkle() : sfx.ding(); gx.callout('方程式赛车到手', '「开赛车出去」坐进去，或者先改装', '#c8322a'); shopOpen(); }
      else if (a === 'drive'){ leave(true); const c = rcSpawn(); if (!c) return; nw.x = c.x; nw.z = c.z; enterCar(c); camYaw = c.h + Math.PI; toast('方程式赛车', '只能在汽车游乐园（一园、二园卡丁车场）里开', 2600); }
      else if (a === 'tune'){ const c = rcSpawn(); if (!c || typeof XTune === 'undefined') return; rcSaved = myCar; myCar = c; rcShop = true; XTune.open(); if (!tn.on){ myCar = rcSaved; rcShop = false; } } }));
  }
  /* the workshop UI is shared: while it is open for the race car, myCar points at it; put the road car back when it closes */
  setInterval(() => { if (rcShop && !(typeof tn !== 'undefined' && tn.on)){ rcShop = false; myCar = rcSaved; rcSaved = null; if (typeof saveGame === 'function') saveGame(); if (rc) tnApply(rc, tnCar(RK).fit); } }, 250);
  if (typeof tnRender === 'function'){ const base = tnRender; tnRender = function(){ base.apply(this, arguments); if (rcShop){ const t = $('#tuneT'); if (t) t.textContent = '赛车改装店 · 方程式赛车'; } }; }

  /* ---------- 2. test-driver laps ---------- */
  function testStart(race){
    const c = race ? rcSpawn() : myCar; if (!c){ toast('要有自己的车', '去 XMUM 车行买一辆，或者在赛车改装店买方程式赛车', 2400); return; }
    PD.job = {type:'test', kind:c.kind, car:c.T.name, tg:testTargets(c), t0:performance.now(), tries:0};
    toast('测试车手', `开 ${c.T.name} 出去，跑一圈干净的计时圈：金 ${fmt2(PD.job.tg[0])} · 银 ${fmt2(PD.job.tg[1])} · 铜 ${fmt2(PD.job.tg[2])}（10 分钟内）`, 4200);
  }
  function testLap(t){
    const j = PD.job; if (!j || j.type !== 'test') return false;
    const c = driving; if (!c || c.kind !== j.kind || (c !== myCar && c !== rc)){ gx.callout('测试车手', `要开你的 ${j.car}`, '#ffb13b'); return false; }
    const gr = t <= j.tg[0] ? 0 : t <= j.tg[1] ? 1 : t <= j.tg[2] ? 2 : 3; j.tries++;
    if (gr === 3){ gx.callout('没达标', `${fmt2(t)} · 铜牌要 ${fmt2(j.tg[2])}，再跑一圈`, '#d0473b'); return true; }
    PD.job = null;
    /* each target (gold / silver / bronze) pays once per car per day: the best one this lap reaches that is still open today */
    const day = today(); if (SAVE.paid.d !== day) SAVE.paid = {d:day, k:{}};
    let g2 = -1; for (let q = gr; q <= 2; q++) if (!SAVE.paid.k[j.kind + ':' + q]){ g2 = q; break; }
    if (g2 < 0){ save(); gx.callout('测试车手' + GX_MEDAL[gr], `${fmt2(t)} · 这辆车今天的三个目标都领过了，明天再来`, '#ffb13b'); return true; }
    SAVE.paid.k[j.kind + ':' + g2] = 1;
    const G2 = give('f1test', g2, '测试车手' + GX_MEDAL[g2] + '目标'); let loot = G2.loot;
    if (g2 === 0 && !SAVE.testGold && window.XParts){ SAVE.testGold = true; loot = loot.concat(XParts.roll('bp_f1eng', 1, 1, '测试车手第一次金牌')); }
    save(); const pay = [40, 25, 15][g2]; earn(pay);
    gx.callout('测试车手 · ' + GX_MEDAL[g2] + '目标', `${fmt2(t)} · RM ${pay}` + (loot.length ? ' · ' + XParts.text(loot) : '') + (G2.note ? ' · ' + G2.note : ''), '#2e9d5b');
    return true;
  }
  /* every clean timed lap: the drop table f1lap; a job in progress grades it */
  { const prev = F.onLap; F.onLap = (t, rec) => { if (prev) prev(t, rec); const tested = testLap(t);
      if (!tested && !locked()) give('f1lap', rec ? 0 : 1, rec ? '卡丁车赛道新纪录' : '卡丁车赛道干净的一圈', true); }; }

  /* ---------- 3. errands ---------- */
  function runStart(){
    const r = RUN[(Math.random() * RUN.length) | 0], d = Math.hypot(r[1] - DOOR.x, r[2] - DOOR.z), lim = Math.round(d * 2 / 16 + 30);
    PD.job = {type:'run', name:r[0], x:r[1], z:r[2], item:r[3], phase:0, left:lim, lim};
    toast('车队跑腿', `去「${r[0]}」拿${r[3]}，送回车库门口 · 限时 ${lim} 秒`, 3600);
  }
  function runTick(dt){
    const j = PD.job; if (!j || j.type !== 'run' || PD.in) return;
    j.left -= dt;
    const px = driving ? driving.x : nw.x, pz = driving ? driving.z : nw.z;
    if (!j.phase && Math.hypot(px - j.x, pz - j.z) < 7){ j.phase = 1; gx.callout('拿到了', j.item + ' · 送回车库门口', '#ffb13b'); sfx.ding(); }
    else if (j.phase && Math.hypot(px - DOOR.x, pz - DOOR.z) < 8){
      PD.job = null; const k = j.left / j.lim, gr = k >= .45 ? 0 : k >= .2 ? 1 : 2, G2 = give('f1run', gr, '车队跑腿' + GX_MEDAL[gr]), loot = G2.loot, pay = [25, 15, 8][gr];
      earn(pay); gx.callout('跑腿' + GX_MEDAL[gr], `剩 ${Math.ceil(j.left)} 秒 · RM ${pay}` + (loot.length ? ' · ' + XParts.text(loot) : '') + (G2.note ? ' · ' + G2.note : ''), '#2e9d5b'); sfx.ding();
    }
    if (PD.job === j && j.left <= 0){ PD.job = null; gx.callout('超时了', '跑腿没赶上，回车库再接一单', '#d0473b'); }
  }

  /* ---------- per frame, F, prompts, the map ---------- */
  function setF(t){ if (t === PD.fL) return; PD.fL = t; const b = actF.querySelector('b'); if (t) b.textContent = t; else updateActs(); }
  function nearSpot(){ let best = null, bd = 1e9; for (const k in spots){ const S = spots[k], [x, z] = L(S.x, S.z), d = Math.hypot(nw.x - x, nw.z - z); if (d < S.r && d < bd){ bd = d; best = k; } } return best; }
  const atDoor = () => !driving && !PD.in && nw.state !== 'fly' && Math.hypot(nw.x - DOOR.x, nw.z - DOOR.z) < 3.2;
  function tryF(){
    if (mode !== 'naiwa' || gx.paused) return false;
    if (PD.in){ if (driving) return false; const k = nearSpot(); if (!k) return false; if (k === 'exit') leave(); else if (k === 'boss') cardOpen(); else if (k === 'shop') shopOpen(); else pitOpen(); return true; }
    if (!atDoor()) return false;
    if (locked()){ toast('维修区车库', '比赛主线第 5 章开放：先找 Ben 师傅报到', 2600); return true; }
    if (mission.on){ toast('维修区车库', '先把手上的外卖送完', 2000); return true; }
    enter(); return true;
  }
  if (typeof roomTryF === 'function'){ const base = roomTryF; roomTryF = function(){ return tryF() || base(); }; } else window.roomTryF = tryF;
  let msg = '', tAcc = 0;
  {
    const base = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){
        base.update(dt, px, pz);
        tAcc += dt; msg = '';
        const near = !PD.in && Math.hypot(px - DOOR.x, pz - DOOR.z) < 70;
        doorMark.visible = near && !locked(); doorLbl.dead = !near;
        if (doorMark.visible) doorMark.userData.ring.scale.y = 1 + Math.sin(tAcc * 3) * .15;
        if (PD.in){
          const k = driving ? null : nearSpot(); setF(k ? spots[k].label : '');
          msg = k === 'shop' ? (TOUCH ? '点「赛车改装店」：买赛车、装 F1 件' : '按 F 进赛车改装店：买赛车、装 F1 件') : k === 'pit' ? (TOUCH ? '点「换胎挑战」' : '按 F 换胎挑战') : k === 'boss' ? (TOUCH ? '点「车队经理」接活' : '按 F 找车队经理接活') : k === 'exit' ? (TOUCH ? '点「出去」回维修区' : '按 F 出去') : '车库里：经理 Ken 在遥测台边（右后），赛车前可以练换胎';
          if (boss){ boss.position.y = Math.abs(Math.sin(tAcc * 2)) * .03; boss.rotation.y = Math.PI * .9 + Math.sin(tAcc * .7) * .25; }
          for (const m of Object.values(marks)) m.userData.ring.scale.y = 1 + Math.sin(tAcc * 3) * .15;
        } else {
          if (atDoor()){ setF('进车库'); msg = locked() ? '维修区车库：主线第 5 章开放' : (TOUCH ? '点「进车库」找雪邦车队接活' : '按 F 进维修区车库，雪邦车队有活干'); }
          else { setF(''); if (driving && Math.hypot(px - DOOR.x, pz - DOOR.z) < 10 && Math.hypot(driving.vx, driving.vz) < 4 && !locked()) msg = '维修区车库：下车走到门口进去'; }
          runTick(dt);
          const j = PD.job;
          if (j && j.type === 'run') msg = `跑腿：${j.phase ? '把' + j.item + '送回维修区车库' : '去「' + j.name + '」拿' + j.item} · 剩 ${Math.max(0, Math.ceil(j.left))} 秒`;
          else if (j && j.type === 'test'){ if (performance.now() - j.t0 > 600000){ PD.job = null; toast('测试车手', '10 分钟到了，回车库再接', 2000); } }
        }
      },
      prompt(){
        const j = PD.job, b = base.prompt();
        if (j && j.type === 'test' && !PD.in) return `测试车手 · 目标 ${fmt2(j.tg[0])}` + (b ? ' · ' + b : '');
        return msg && (PD.in || (j && j.type === 'run') || atDoor()) ? msg : b || msg;
      },
      busy(){ return !!(PD.job && PD.job.type === 'run') || base.busy(); },
      target(){ const j = PD.job; if (j && j.type === 'run' && !PD.in) return j.phase ? {x:DOOR.x, z:DOOR.z, label:'维修区车库'} : {x:j.x, z:j.z, label:j.name}; return base.target(); },
      mini(dot){ base.mini(dot); const j = PD.job; if (j && j.type === 'run'){ if (j.phase) dot(DOOR.x, DOOR.z, '#ff8a3d', 7); else dot(j.x, j.z, '#ffb13b', 7); } else if (!PD.in && !locked()) dot(DOOR.x, DOOR.z, '#c8322a', 4); },
      leave(){ pitClose(true); cardClose(); leave(true); PD.job = null; base.leave(); },
      togglePause(){ if (PD.pit){ pitClose(); return; } if (PD.card){ cardClose(); return; } base.togglePause(); }
    });
  }
  window.XPaddock = {state:PD, save:SAVE, door:DOOR, enter, leave, cardOpen, shopOpen, pitOpen, pitTap, testStart, runStart, testLap, give, RUN, testTargets, origin:[OX, OZ], rcSpawn, get rc(){ return rc; }};
  /* for other features (the story's 特训 steps): read-only facts, no rewards here */
  window.XF1Tune = {
    door:{x:DOOR.x, z:DOOR.z},                         /* the paddock garage door on the pit lane (world) */
    shop:{x:DOOR.x, z:DOOR.z, inside:L(spots.shop.x, spots.shop.z)},   /* the 赛车改装店 is inside that garage */
    enterPaddock:enter, inPaddock:() => PD.in,
    hasRaceCar:() => !!SAVE.rc, raceCar:() => rc, isRaceCar:c => !!c && c.kind === RK,
    f1Parts:f1Fitted, anyF1Part:() => f1Fitted() > 0,  /* F1 parts fitted on the race car (0–5) */
    mats, inParks, RK
  };
})();
