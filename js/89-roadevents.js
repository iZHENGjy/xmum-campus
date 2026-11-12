/* XMUM 校园漫游 · 路上的随机小事（GTA 那种「开着车总能碰到点什么」）
 *
 * 奶娃模式里自由逛的时候（没在送外卖、没在挑战 / 比赛 / 小游戏、没被通缉、不在室内、不是主线第 1 章、没在和主线角色说话），
 * 每 30–60 秒在前面 60–130 米的路边冒出一件小事，小地图上一个点，头顶一个标签；离开 260 米或者超时就悄悄收掉：
 *   - 招手搭车：路边同学招手，就是原来的「顺风车」（js/85-activities.js），这里只是把人放到你前面；
 *   - 保安追小偷：两个保安在追一个偷了外卖的小偷（原来的小偷系统 thSpawn，js/89-outskirts-play.js，悬赏照给），
 *     你帮忙抓住，保安再给 RM 15「见义勇为」；
 *   - 猴子抢包：猴子抢了同学的包往外跑，水枪淋它或者追上去碰到它，包就掉了，捡起来还给同学：RM 20；
 *   - 社团摆摊：路边一个摊位，停下来（离摊位 6 米内、慢下来）领一份小礼物：奶茶社灌满水枪、车友会修车、动漫社送贴纸钱；
 *   - 外卖小哥翻车：电动车倒在路边，餐盒撒了一地，45 秒内捡回来（走过去或慢慢开过去碰到就算），每盒 RM 3，捡齐再加 RM 6；
 *   - 阵雨：下一场 40–55 秒的阵雨。路面湿了以后你开的车抓地力下降最多 30%（比赛里不算）。
 * 不会出现在主线目标 120 米以内。同一时间只有一件。
 * 对外：window.XEvents = {now(), force(id), clear(), list}（测试用） */
'use strict';
(() => {
  if (typeof gx === 'undefined' || typeof roadSegs === 'undefined') return;
  const g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const pick = a => a[(rnd() * a.length) | 0];
  const EV = {cd:35 + rnd() * 20, cur:null, last:'', msg:'', lbl:addLabel('', 0, 0, 0, true)};
  EV.lbl.dead = true;

  /* ---------- when may something happen ---------- */
  function canSpawn(){
    if (mode !== 'naiwa' || gx.paused || document.body.classList.contains('titled')) return false;
    if (g(() => indoorNow(), true) || mission.on || gx.busy() || gx.extBusy() || heat >= 1) return false;
    if (window.XQuest && (g(() => XQuest.calm(), false) || XQuest.talking)) return false;
    if (window.XCine && XCine.busy) return false;
    if (typeof spray !== 'undefined' && spray.run) return false;
    if (typeof gxTaxi !== 'undefined' && gxTaxi.on) return false;
    const q = window.XQuest && g(() => XQuest.target(), null), me = driving || nw;
    if (q && Math.hypot(q.x - me.x, q.z - me.z) < 60) return false;   /* doing the story right here */
    return true;
  }
  /* a roadside spot ahead of you (or round you on foot), clear of buildings, water, pickups, challenge rings and the story's target */
  function spotAhead(minD, maxD){
    const me = driving || nw, sp = driving ? Math.hypot(driving.vx, driving.vz) : 0;
    const fx = sp > 3 ? driving.vx / sp : Math.sin(nw.h), fz = sp > 3 ? driving.vz / sp : Math.cos(nw.h);
    const q = window.XQuest && g(() => XQuest.target(), null);
    for (let k = 0; k < 80; k++){
      const s = roadSegs[(rnd() * roadSegs.length) | 0], t = .15 + rnd() * .7;
      const ax = s.a[0], az = s.a[1], bx = s.b[0], bz = s.b[1], L = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / L, dz = (bz - az) / L;
      const side = rnd() < .5 ? 1 : -1, off = (s.h || 3) + 2.2;
      const x = ax + (bx - ax) * t - dz * off * side, z = az + (bz - az) * t + dx * off * side;
      const d = Math.hypot(x - me.x, z - me.z); if (d < minD || d > maxD) continue;
      if (sp > 3 && ((x - me.x) * fx + (z - me.z) * fz) / d < .35) continue;
      if (hitsBuilding(x, z, 3) || outOfMap(x, z, 3) || lakes.some(L2 => inPoly(x, z, L2))) continue;
      if (q && Math.hypot(q.x - x, q.z - z) < 120) continue;
      if (PICKUPS.some(p => Math.hypot(p.x - x, p.z - z) < 28)) continue;
      if (typeof GX_ACTS !== 'undefined' && GX_ACTS.some(a => Math.hypot(a.start[0] - x, a.start[1] - z) < 28)) continue;
      if (typeof XSPRAY !== 'undefined' && Math.hypot(XSPRAY.x - x, XSPRAY.z - z) < 30) continue;
      return {x, z, h:Math.atan2(dx, dz), side, road:[ax + (bx - ax) * t, az + (bz - az) * t]};
    }
    return null;
  }
  const free = (x, z, r) => !hitsBuilding(x, z, r) && !outOfMap(x, z, r) && !lakes.some(L => inPoly(x, z, L));
  function steer(want, x, z, look, r){
    for (const a of [0, .5, -.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]){
      const h = want + a; if (free(x + Math.sin(h) * look * .5, z + Math.cos(h) * look * .5, r) && free(x + Math.sin(h) * look, z + Math.cos(h) * look, r)) return h;
    }
    return want;
  }

  /* ---------- little figures (built once, reused) ---------- */
  function student(shirt){
    const G = new THREE.Group(), body = new THREE.Group(); G.add(body);
    const sk = M('#e8b98f', {roughness:.7}), sh = M(shirt, {roughness:.8});
    if (typeof npcBodyGeo !== 'undefined'){
      body.add(new THREE.Mesh(npcBodyGeo, sh), new THREE.Mesh(npcHeadGeo, sk), new THREE.Mesh(npcGearGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true})));
      const legs = [-1, 1].map(s => { const m = new THREE.Mesh(npcLegGeo, new THREE.MeshStandardMaterial({roughness:.8, vertexColors:true, color:'#2e3a52'})); m.position.set(s * .09, .92, 0); body.add(m); return m; });
      const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * .215, 1.39, 0); a.rotation.z = s * .1; a.add(new THREE.Mesh(npcSleeveGeo, sh), new THREE.Mesh(npcForeGeo, sk)); body.add(a); return a; });
      G.traverse(m => { if (m.isMesh) m.castShadow = true; }); G.scale.setScalar(1.2); G.visible = false; scene.add(G);
      return {g:G, body, legs, arms};
    }
    body.add(box(.5, 1.7, .3, sh, 0, .85, 0)); G.scale.setScalar(1.2); G.visible = false; scene.add(G);
    return {g:G, body, legs:[], arms:[]};
  }
  const lazy = f => { let v = null; return () => v || (v = f()); };
  const victimFig = lazy(() => student('#ff8fab'));
  const riderFig = lazy(() => student('#f2c230'));
  const clubFigs = lazy(() => [student('#2d5d8a'), student('#27ae60')]);
  const guardFigs = lazy(() => typeof guardFig === 'function' ? [0, 1].map(() => { const G = guardFig({s:1.2}); scene.add(G.g); return G; }) : []);
  const monkeyFig = lazy(() => {
    const G = new THREE.Group();
    if (typeof mkBodyGeo !== 'undefined' && typeof mkMat !== 'undefined'){
      const body = new THREE.Mesh(mkBodyGeo, mkMat); body.castShadow = true; G.add(body);
      G.userData.arms = [-1, 1].map(s => { const a = new THREE.Mesh(mkArmGeo, mkMat); a.position.set(s * .25, .62, .04); a.rotation.z = s * .22; G.add(a); return a; });
    } else G.add(box(.5, .9, .4, M('#93714d'), 0, .45, 0));
    const bag = new THREE.Mesh(new THREE.BoxGeometry(.42, .36, .2).translate(0, .18, 0), M('#ff6fa3', {roughness:.6})); bag.position.set(0, 1.0, .12); bag.castShadow = true; G.add(bag);
    G.userData.bag = bag; G.scale.setScalar(1.25); G.visible = false; scene.add(G); return G;
  });
  const looseBag = lazy(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .42, .24).translate(0, .21, 0), M('#ff6fa3', {roughness:.6})); m.castShadow = true; m.visible = false; scene.add(m); return m; });
  /* the stall: a table, a striped canopy on four poles and a banner (its text is drawn per club) */
  const stall = lazy(() => {
    const G = new THREE.Group(), wood = M('#a57a4f', {roughness:.8}), pole = M('#d9d9d9', {roughness:.4, metalness:.4});
    G.add(box(2.6, .08, 1.1, wood, 0, .95, 0), box(2.5, .9, .05, M('#f4f1ea', {roughness:.8}), 0, .48, .52));
    for (const [x, z] of [[-1.4, -.9], [1.4, -.9], [-1.4, .9], [1.4, .9]]) G.add(box(.06, 2.4, .06, pole, x, 1.2, z));
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const q = c.getContext('2d'); for (let i = 0; i < 8; i++){ q.fillStyle = i % 2 ? '#ffffff' : '#e84d8a'; q.fillRect(i * 8, 0, 8, 8); }
    const tex = new THREE.CanvasTexture(c); G.add(box(3.1, .12, 2.2, new THREE.MeshStandardMaterial({map:tex, roughness:.7}), 0, 2.45, 0));
    const bc = document.createElement('canvas'); bc.width = 512; bc.height = 96;
    const btex = new THREE.CanvasTexture(bc), banner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .52), new THREE.MeshBasicMaterial({map:btex, transparent:true, side:THREE.DoubleSide}));
    banner.position.set(0, 2.1, .95); G.add(banner);
    G.userData.paint = text => { const b = bc.getContext('2d'); b.clearRect(0, 0, 512, 96); b.fillStyle = '#fffaf0'; b.fillRect(0, 0, 512, 96); b.strokeStyle = '#e84d8a'; b.lineWidth = 8; b.strokeRect(4, 4, 504, 88);
      b.fillStyle = '#1f2a33'; b.font = '700 46px "Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillText(text, 256, 50); btex.needsUpdate = true; };
    G.traverse(m => { if (m.isMesh) m.castShadow = true; }); G.visible = false; scene.add(G); return G;
  });
  /* the crash: a scooter on its side and six takeaway boxes */
  const crashKit = lazy(() => {
    const G = new THREE.Group(), body = M('#f2c230', {roughness:.5}), tyre = M('#1c1c1e', {roughness:.7});
    G.add(box(.34, .12, 1.3, body, 0, .2, 0), box(.36, .55, .35, body, 0, .45, -.45), box(.4, .45, .45, M('#c0392b', {roughness:.6}), 0, .55, -.5));
    for (const z of [-.6, .6]){ const w = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .1, 12), tyre); w.rotation.z = Math.PI / 2; w.position.set(0, .24, z); G.add(w); }
    G.rotation.z = Math.PI / 2 * .95; G.traverse(m => { if (m.isMesh) m.castShadow = true; }); G.visible = false; scene.add(G);
    const geo = new THREE.BoxGeometry(.38, .26, .3).translate(0, .13, 0), mat = M('#ff8a3d', {roughness:.55, emissive:'#7a3008', emissiveIntensity:.35});
    const boxes = []; for (let i = 0; i < 6; i++){ const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.visible = false; scene.add(m); boxes.push(m); }
    return {g:G, boxes};
  });
  const place = (o, x, z, h) => { o.position.set(x, groundAt(x, z), z); if (h != null) o.rotation.y = h; o.visible = true; };

  /* ---------- the events ---------- */
  const CLUBS = [
    {name:'奶茶社 · 免费试喝', gift(){ if (typeof WG !== 'undefined' && typeof wgShow === 'function'){ WG.ammo = WG.max; wgShow(); } earn(3); return ['奶茶社请你喝了一杯', '水枪也顺手灌满了 · +RM 3']; }},
    {name:'车友会 · 免费检修', gift(){ const c = driving; if (c && !c.wrecked && c.hp < 100){ c.hp = 100; return ['车友会帮你检修了一下', '车况回到 100%']; } earn(8); return ['车友会送你一张洗车券', '+RM 8']; }},
    {name:'动漫社 · 送贴纸', gift(){ earn(10); const loot = window.XParts ? g(() => XParts.reward('activity', 3, '社团摆摊'), []) : []; return ['动漫社送你一张限定贴纸', '+RM 10' + (loot && loot.length ? ' · 改装：' + XParts.text(loot) : '')]; }}
  ];
  const TYPES = {
    lift:{name:'招手搭车', icon:'🙋', color:'#3fd6c6',
      can:() => !!driving && typeof gxTaxi !== 'undefined' && !gxTaxi.on && !gxTaxi.pk && typeof GX_PAX !== 'undefined',
      start(s){
        gxTaxi.pk = [s.x, s.z]; gxTaxi.type = pick(GX_PAX); gxTaxi.ask = null; gxTaxi.spawnCd = 6;
        gx.callout('有人招手', '前面路边的同学想搭车', '#3fd6c6'); return {done:true};
      }},
    thief:{name:'保安追小偷', icon:'🚨', color:'#e84d8a',
      can:() => typeof thSpawn === 'function' && typeof TH !== 'undefined' && !TH.on && guardFigs().length === 2,
      start(s){
        const me = driving || nw, n0 = typeof opN === 'function' ? opN('o_thief') : 0;
        if (!thSpawn('shop', me.x, me.z, {x:s.x, z:s.z, name:'路边'})) return null;
        const G = guardFigs(); G.forEach((F, i) => { F.x = TH.x - Math.sin(TH.h) * (7 + i * 2) + (i ? 1.5 : -1.5); F.z = TH.z - Math.cos(TH.h) * (7 + i * 2); F.walk = 0; F.g.visible = true; guardRadio(F, 1.2); });
        toast('两个保安在追小偷', '帮他们一把：水枪淋他、开车撞倒他，走到身边按 F', 3000);
        return {n0, G, end:0, label:'保安：站住！'};
      },
      tick(E, dt){
        const G = E.G;
        if (TH.on && !E.end){
          for (const [i, F] of G.entries()){
            const tx = TH.x - Math.sin(TH.h) * (3 + i * 2.2) + (i ? 1.2 : -1.2), tz = TH.z - Math.cos(TH.h) * (3 + i * 2.2), dx = tx - F.x, dz = tz - F.z, d = Math.hypot(dx, dz);
            const v = Math.min(d, (TH.mode === 'bike' ? 9 : 7.4) * dt), h = steer(Math.atan2(dx, dz), F.x, F.z, 3, .6);
            if (d > .5){ F.x += Math.sin(h) * v; F.z += Math.cos(h) * v; F.g.rotation.y = h; }
            F.walk += dt * 11; F.g.position.set(F.x, groundAt(F.x, F.z), F.z); guardPose(F, dt, {walk:F.walk, run:true});
          }
          E.x = TH.x; E.z = TH.z; return false;
        }
        if (!E.end){
          E.end = 1; const won = typeof opN === 'function' && opN('o_thief') > E.n0;
          if (won){ earn(15); setTimeout(() => toast('保安：多谢帮忙！', '见义勇为奖 +RM 15', 2600), 2200); for (const F of G) guardRadio(F, 2); E.label = '保安：谢谢！'; }
          else { toast('小偷跑掉了', '保安追不动了', 2000); E.label = '保安：唉，跑了'; }
        }
        E.end += dt; for (const F of G){ guardPose(F, dt, {}); F.g.rotation.y += dt * .5; }
        return E.end > 4.5;
      },
      clear(E){ for (const F of guardFigs()) F.g.visible = false; }},
    monkey:{name:'猴子抢包', icon:'🐒', color:'#93714d',
      can:() => true,
      start(s){
        const V = victimFig(), Mk = monkeyFig(); place(V.g, s.x, s.z, s.h + Math.PI / 2 * s.side);
        Mk.userData.bag.visible = true; const a = rnd() * 6.28;
        const E = {st:'run', mx:s.x + Math.cos(a) * 2, mz:s.z + Math.sin(a) * 2, mh:a, t:0, rest:0, run:0, label:'我的包被猴子抢了！', vx:s.x, vz:s.z};
        place(Mk, E.mx, E.mz, E.mh); toast('猴子抢了同学的包！', '水枪淋它，或者追上去碰到它，包就掉了', 3000);
        gx.callout('猴子抢包！', '帮同学抢回来', '#93714d'); return E;
      },
      tick(E, dt, px, pz){
        const V = victimFig(), Mk = monkeyFig(), me = driving || nw; E.t += dt;
        V.arms[1] && (V.arms[1].rotation.x = E.st === 'done' ? -.4 : -2.4 + Math.sin(E.t * 12) * .4);
        if (E.st === 'run'){
          E.run += dt; E.x = E.mx; E.z = E.mz;
          if (E.rest > 0){ E.rest -= dt; Mk.rotation.y = Math.atan2(px - E.mx, pz - E.mz); }
          else {
            const away = Math.atan2(E.mx - px, E.mz - pz), h = steer(away, E.mx, E.mz, 3, .5); Mk.rotation.y = h;
            const v = 5.6 * dt; E.mx += Math.sin(h) * v; E.mz += Math.cos(h) * v;
            if (E.run > 3.5){ E.run = 0; E.rest = 1.2; }   /* stops to pull a face: that is the moment */
          }
          Mk.position.set(E.mx, groundAt(E.mx, E.mz) + (E.rest > 0 ? 0 : Math.abs(Math.sin(E.t * 14)) * .25), E.mz);
          const d = Math.hypot(me.x - E.mx, me.z - E.mz);
          if (d < (driving ? 3.2 : 1.9)) drop(E, '碰到猴子了');
          else if (E.t > 32){ E.st = 'lost'; E.t = 0; toast('猴子带着包上树了', '同学只好自己去找保安', 2200); }
          if (E.st === 'run' && d > 70){ E.msg = '猴子跑远了，快追'; }
          return false;
        }
        if (E.st === 'drop'){
          E.t2 = (E.t2 || 0) + dt; const B = looseBag(); E.x = B.position.x; E.z = B.position.z;
          if (Mk.visible){ const h = Mk.rotation.y; E.mx += Math.sin(h) * 6 * dt; E.mz += Math.cos(h) * 6 * dt; Mk.position.set(E.mx, groundAt(E.mx, E.mz) + Math.abs(Math.sin(E.t * 16)) * .3, E.mz); if (E.t2 > 2){ Mk.visible = false; if (typeof mkLeaves === 'function') g(() => mkLeaves(E.mx, 1, E.mz, 5)); } }
          if (Math.hypot(me.x - B.position.x, me.z - B.position.z) < (driving ? 3 : 2)){
            B.visible = false; E.st = 'done'; E.t = 0; earn(20); sfx.ding(); E.label = '谢谢你！';
            for (let i = 0; i < 6; i++) spawnPart('heart', E.vx + (rnd() - .5) * 2, 2.4 + rnd(), E.vz + (rnd() - .5) * 2, .8, {vy:2, life:1.3, op:1, color:'#ff6fa3'});
            toast('同学：我的包！谢谢你！', '+RM 20 · 包里的电脑和作业都还在', 2600); if (typeof unlock === 'function') unlock('monkey1');
          }
          return false;
        }
        E.x = E.vx; E.z = E.vz;
        return E.t > (E.st === 'done' ? 3 : 2.5);
      },
      hit(E){ if (E.st === 'run') drop(E, '淋到猴子了'); },
      clear(){ victimFig().g.visible = false; monkeyFig().visible = false; looseBag().visible = false; }},
    stall:{name:'社团摆摊', icon:'🎪', color:'#e84d8a',
      can:() => true,
      start(s){
        const club = pick(CLUBS), S = stall(), F = clubFigs(), h = s.h + Math.PI / 2 * s.side + Math.PI;
        S.userData.paint(club.name.split(' · ')[0] + ' 招新'); place(S, s.x, s.z, h);
        F.forEach((P, i) => { const ox = (i ? .7 : -.7), x = s.x + Math.cos(h) * ox - Math.sin(h) * .9, z = s.z - Math.sin(h) * ox - Math.cos(h) * .9; place(P.g, x, z, h); });
        return {club, x:s.x, z:s.z, t:0, got:false, label:club.name};
      },
      tick(E, dt){
        const me = driving || nw, sp = driving ? Math.hypot(driving.vx, driving.vz) : 0, d = Math.hypot(me.x - E.x, me.z - E.z); E.t += dt;
        clubFigs().forEach((P, i) => { if (P.arms[1]) P.arms[1].rotation.x = E.got ? -.2 : -2.2 + Math.sin(E.t * 6 + i) * .5; });
        if (!E.got){
          if (d < 6.5){ if (sp > 3) E.msg = '停一下，社团有小礼物送'; else { E.got = true; E.t = 0; const [a, b] = E.club.gift(); sfx.sparkle(); toast(a, b, 2600); E.label = '欢迎来玩！'; } }
          return E.t > 100;
        }
        return E.t > 20 && d > 40;
      },
      clear(){ stall().visible = false; for (const P of clubFigs()) P.g.visible = false; }},
    crash:{name:'外卖小哥翻车', icon:'📦', color:'#ff8a3d',
      can:() => true,
      start(s){
        const K = crashKit(), R = riderFig(); place(K.g, s.road[0] * .3 + s.x * .7, s.road[1] * .3 + s.z * .7, s.h); K.g.rotation.z = Math.PI / 2 * .95;
        place(R.g, s.x + Math.cos(s.h) * 1.6, s.z - Math.sin(s.h) * 1.6, s.h + Math.PI);
        const got = []; K.boxes.forEach((b, i) => {
          let x = s.x, z = s.z;
          for (let k = 0; k < 12; k++){ const a = s.h + (rnd() - .5) * 2.2, r = 2.5 + rnd() * 7.5; x = s.x + Math.sin(a) * r; z = s.z + Math.cos(a) * r; if (free(x, z, .4)) break; }
          place(b, x, z, rnd() * 6.28); got.push(false);
        });
        toast('外卖小哥翻车了', '餐盒撒了一地：45 秒内帮他捡回来（碰到就算）', 3000);
        return {x:s.x, z:s.z, t:0, got, n:0, done:false, label:'帮忙捡餐盒 0/6'};
      },
      tick(E, dt){
        const K = crashKit(), R = riderFig(), me = driving || nw, sp = driving ? Math.hypot(driving.vx, driving.vz) : 0; E.t += dt;
        if (R.arms[0]) R.arms[0].rotation.x = E.done ? -.3 : -2.6 + Math.sin(E.t * 4) * .2;
        if (E.done) return E.t > 4;
        K.boxes.forEach((b, i) => {
          if (E.got[i]) return; b.rotation.y += dt;
          if (Math.hypot(me.x - b.position.x, me.z - b.position.z) < (driving ? (sp < 14 ? 2.8 : 0) : 1.8)){ E.got[i] = true; E.n++; b.visible = false; tone('triangle', 660 + E.n * 90, 660 + E.n * 90, .12, .1); spawnPart('heart', b.position.x, 1.6, b.position.z, .6, {vy:1.6, life:.8, op:1, color:'#ff8a3d'}); }
        });
        if (driving && sp >= 14) E.msg = '开慢点才捡得起餐盒';
        E.label = `帮忙捡餐盒 ${E.n}/6 · ${Math.max(0, Math.ceil(45 - E.t))} 秒`;
        if (E.n >= 6 || E.t > 45){
          E.done = true; const pay = E.n * 3 + (E.n >= 6 ? 6 : 0); E.t = 0;
          if (pay){ earn(pay); sfx.ding(); toast('外卖小哥：太感谢了！', `捡回 ${E.n} 盒 · 小费 RM ${pay}`, 2600); E.label = '谢谢！'; }
          else { toast('外卖小哥自己收拾好走了', '', 1600); }
        }
        return false;
      },
      clear(){ const K = crashKit(); K.g.visible = false; K.boxes.forEach(b => { b.visible = false; }); riderFig().g.visible = false; }},
    rain:{name:'阵雨', icon:'🌧', color:'#4aa3ff',
      can:() => typeof wx !== 'undefined' && typeof showers !== 'undefined' && wx.target < .5 && wx.rain < .1 && !REDUCED && !(typeof tgt !== 'undefined' && typeof P3 !== 'undefined' && tgt === P3.night),
      start(){
        wx.target = 1; showers.manual = false; showers.dur = 40 + rnd() * 15; const b = document.getElementById('rainBtn'); if (b) b.setAttribute('aria-pressed', 'true');
        toast('下阵雨了', '路面一湿车就打滑，过弯慢一点', 2400); return {done:true};
      }}
  };
  function drop(E, why){
    const Mk = monkeyFig(), B = looseBag(); Mk.userData.bag.visible = false;
    B.position.set(E.mx, groundAt(E.mx, E.mz), E.mz); B.visible = true; E.st = 'drop'; E.t2 = 0; E.label = '捡起包还给同学';
    sfx.sparkle(); gx.callout(why, '包掉了，捡起来', '#93714d'); addStunt('抢回包', 120);
  }

  /* ---------- running the current one ---------- */
  function clear(silent){
    const E = EV.cur; if (!E) return;
    try { TYPES[E.type].clear && TYPES[E.type].clear(E); } catch(e){}
    EV.cur = null; EV.lbl.dead = true; EV.msg = ''; EV.cd = 30 + rnd() * 30;
  }
  function start(id){
    const T = TYPES[id]; if (!T || !T.can()) return false;
    const s = id === 'rain' ? {x:0, z:0} : spotAhead(id === 'thief' ? 45 : 60, id === 'thief' ? 110 : 130); if (!s) return false;
    let E = null; try { E = T.start(s); } catch(e){ E = null; }
    if (!E) return false;
    EV.last = id;
    if (E.done){ EV.cd = 30 + rnd() * 30; return true; }
    E.type = id; E.T = 0; if (E.x == null){ E.x = s.x; E.z = s.z; }
    EV.cur = E; return true;
  }
  function update(dt, px, pz){
    EV.msg = '';
    const E = EV.cur;
    if (E){
      E.T += dt; E.msg = '';
      let over = false; try { over = TYPES[E.type].tick(E, dt, px, pz); } catch(e){ over = true; }
      const far = Math.hypot(px - E.x, pz - E.z) > 260;
      if (over || far || E.T > 150 || (E.type !== 'thief' && (mission.on || gx.busy() || g(() => indoorNow(), false)))){ clear(); return; }
      EV.msg = E.msg || '';
      const L = EV.lbl; L.dead = false; L.el.textContent = `${TYPES[E.type].icon} ${E.label || TYPES[E.type].name}`; L.pos.set(E.x, groundAt(E.x, E.z) + 4.2, E.z);
      return;
    }
    if (!canSpawn()) return;
    EV.cd -= dt; if (EV.cd > 0) return;
    const ids = Object.keys(TYPES).filter(k => k !== EV.last && g(() => TYPES[k].can(), false));
    for (let k = 0; k < 3 && ids.length; k++){ const i = (rnd() * ids.length) | 0; if (start(ids[i])) return; ids.splice(i, 1); }
    EV.cd = 6;   /* nothing fitted here: try again soon */
  }

  /* ---------- wiring ---------- */
  { const b = Object.assign({}, gx);
    Object.assign(gx, {
      update(dt, px, pz){ b.update.call(this, dt, px, pz); try { update(dt, px, pz); } catch(e){ clear(); } },
      prompt(){ return b.prompt.call(this) || EV.msg; },
      mini(dot){ b.mini.call(this, dot); const E = EV.cur; if (E) dot(E.x, E.z, TYPES[E.type].color, 7); },
      leave(){ clear(); return b.leave.apply(this, arguments); }
    }); }
  /* the monkey can be soaked */
  if (typeof wgAddTarget === 'function') wgAddTarget(() => { const E = EV.cur; return E && E.type === 'monkey' && E.st === 'run' ? [{x:E.mx, z:E.mz, r:.9, hit:() => TYPES.monkey.hit(E)}] : null; });
  /* wet roads: the car you drive grips up to 30 % less (not in races, which have their own rules) */
  if (typeof updateCar === 'function'){
    const u0 = updateCar;
    updateCar = function(c, dt, inp){
      if (c !== driving || typeof wx === 'undefined' || wx.wet < .05 || c.wet || gx.extBusy()) return u0.call(this, c, dt, inp);
      const T = c.T, g0 = T.grip; T.grip = g0 * (1 - .3 * Math.min(1, wx.wet));
      try { return u0.call(this, c, dt, inp); } finally { T.grip = g0; }
    };
  }

  window.XEvents = {now:() => EV.cur && EV.cur.type, force(id){ clear(); EV.last = ''; return start(id); }, clear, list:Object.keys(TYPES), state:EV};
})();
