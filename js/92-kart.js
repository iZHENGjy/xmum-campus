/* XMUM 校园漫游 · 卡丁车：汽车游乐园二园卡丁车赛道的维修区可以免费租一辆（js/92-f1park.js 的 XKart）
 *
 * 维修区车道起点那头有个黄圈「租卡丁车」，走过去按 F（手机点「租卡丁车」）就把卡丁车摆在车道上并坐进去；再租一次就把它挪回来。
 * 卡丁车：小、低、抓地很好（侧向抓地按 js/94-f1-drive.js 的公式约 16.6）、极速 130 km/h，弯里比跑车好开，直道跑不过跑车。
 * 和方程式赛车一样只能在汽车游乐园里开（js/94-f1-paddock.js 的园区限制，开到边上会被挡回来），不在车行里，叫车叫不来。
 * 不存档：每次来租一辆新的。对外 window.XKartRent = {spot, rent(), kart()}。 */
'use strict';
(() => {
  const K = window.XKart, F = window.XF1; if (!K || !F || typeof makeCar !== 'function' || typeof CAR_T === 'undefined') return;
  CAR_T.kart = {L:2.2, W:1.5, H:.9, wb:1.4, r:.22, maxV:36, acc:20, grip:12, steer:.7, mass:.5, seat:[0, .16, -.3], name:'卡丁车', kart:true};
  if (typeof carParts === 'function'){
    const base = carParts;
    carParts = function(kind, T){
      if (kind !== 'kart') return base(kind, T);
      if (carGeoCache.kart) return carGeoCache.kart;
      const P = {paint:[], trim:[], white:[]}, put = (k, g) => { P[k].push(g); return g; };
      const rb = (k, w, h, d, r, x, y, z, rx) => put(k, geoAt(roundBox(w, h, d, r, 2), x, y, z, rx || 0, 0, 0));
      rb('trim', 1.1, .05, 1.9, .02, 0, .1, 0);                               /* the frame */
      rb('paint', .8, .14, .5, .06, 0, .2, .95, -.2);                         /* nose fairing */
      for (const sx of [-1, 1]) rb('paint', .22, .16, 1.0, .06, sx * .62, .2, 0);   /* side pods */
      rb('paint', 1.35, .12, .22, .05, 0, .2, -1.0);                          /* rear bumper */
      rb('trim', .46, .35, .4, .08, 0, .32, -.25);                            /* the seat */
      rb('white', .32, .26, .3, .05, .42, .3, -.62);                          /* the engine */
      put('trim', rodGeo(.02, .02, [0, .2, .45], [0, .48, .25]));            /* steering column */
      put('trim', geoAt(new THREE.TorusGeometry(.13, .02, 5, 14), 0, .5, .24, -.9, 0, 0));
      const out = {}; for (const k in P) out[k] = geoMerge(P[k]);
      return carGeoCache.kart = out;
    };
  }
  /* the hire spot: on the pit lane, at the start-line end */
  const N = F.N, wi = i => ((i % N) + N) % N, s = F.PIT.side, ri = wi(F.PIT.i0 + 6);
  const spot = (() => { const [x, z] = F.PT[ri], [nx, nz] = F.NOR[ri], o = s * (F.HW + 9); return {x:x + nx * o, z:z + nz * o, h:Math.atan2(F.TAN[ri][0], F.TAN[ri][1])}; })();
  const mark = gxMarker('#ffd23a', .3); mark.position.set(spot.x, .05, spot.z);
  const lbl = addLabel('租卡丁车（免费）', spot.x, 3, spot.z, true);
  let kart = null, fL = '';
  const COLS = ['#ffd23a', '#2f86d6', '#e8412c', '#2e9d5b', '#e48aa8'];
  function rent(){
    if (driving) leaveCar();
    if (!kart){ kart = makeCar('kart', COLS[(Math.random() * COLS.length) | 0], spot.x, spot.z, spot.h); kart.T = Object.assign({}, CAR_T.kart); }
    Object.assign(kart, {x:spot.x, z:spot.z, h:spot.h, vx:0, vz:0, y:0, vy:0, air:false, steer:0, pitch:0, hp:100, wrecked:false});
    kart.root.position.set(spot.x, 0, spot.z); kart.root.rotation.set(0, spot.h, 0); kart.root.visible = true; if (!cars.includes(kart)) cars.push(kart);
    nw.x = spot.x; nw.z = spot.z; enterCar(kart); camYaw = spot.h + Math.PI;
    sfx.ding(); toast('卡丁车', '抓地好、弯里灵，只能在汽车游乐园里开', 2400);
  }
  const near = () => !driving && nw.state !== 'fly' && !window.XINDOOR && Math.hypot(nw.x - spot.x, nw.z - spot.z) < 3.2;
  function tryF(){ if (mode !== 'naiwa' || gx.paused || !near()) return false; rent(); return true; }
  if (typeof roomTryF === 'function'){ const b = roomTryF; roomTryF = function(){ return tryF() || b(); }; } else window.roomTryF = tryF;
  const setF = t => { if (t === fL) return; fL = t; const b = actF.querySelector('b'); if (t) b.textContent = t; else updateActs(); };
  { const base = Object.assign({}, gx);
    let t = 0;
    Object.assign(gx, {
      update(dt, px, pz){ base.update(dt, px, pz); t += dt;
        const vis = Math.hypot(px - spot.x, pz - spot.z) < 80; mark.visible = vis; lbl.dead = !vis; if (vis) mark.userData.ring.scale.y = 1 + Math.sin(t * 3) * .15;
        setF(near() ? '租卡丁车' : ''); },
      prompt(){ return near() ? (TOUCH ? '点「租卡丁车」：免费，只能在游乐园里开' : '按 F 租一辆卡丁车（免费，只能在游乐园里开）') : base.prompt(); }
    });
  }
  window.XKartRent = {spot, rent, kart:() => kart};
})();
