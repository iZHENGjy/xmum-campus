/* XMUM 校园漫游 · 「小红帽」保安：全游戏共用的保安造型
 *
 * 造型参考马来西亚校园常见的保安制服（只参考服装，图案和徽章都是自己画的）：
 *   鲜红色贝雷帽和左前方的圆帽徽 · 白色短袖衬衫，两个胸袋，黑色名牌 · 黑肩章上两颗银星 · 两臂的圆形臂章
 *   橙红色领带 · 右肩垂到胸袋的橙红色绶带绳 · 左耳的耳机线连到胸前的对讲机 · 粉色挂绳和胸卡 · 口袋里的笔
 *   深蓝长裤、黑皮带、黑皮鞋。远处看是三个色块：红帽、白衣、橙领带。
 * 用法：
 *   const G = guardFig({s:1.35});          // {g, body, arms:[左, 右], legs:[左, 右]}，自己把 G.g 加到场景里、摆位置和朝向
 *   guardPose(G, dt, {walk, run, seated, wet, down, steer});   // 每帧调一次：走、跑、坐着开车、擦脸（被淋湿）、被冲倒
 *   guardRadio(G, 1.6);                    // 抬起左手按住胸前的对讲机说话
 * 性能：一个保安 5 个网格（身体连同所有配饰合并成一个，两臂两腿各一个），几何体和材质全员共用，颜色都是顶点色。
 * 这个文件自己做的事：给每辆巡逻车（js/80-gta.js 的 patrols 和路障车 blockers）的座位上放一个保安；
 *   你开走巡逻车时他不在车上；车被水枪淋了他擦脸；警戒升星时他按对讲机叫增援；离远了跟车上的小零件一起隐藏。
 * 教学楼里的保安在 js/87-heist.js，用的是同一个造型。
 */
'use strict';
/* ---------- parts shared by the little people (保安 here, 宿管 and the thief in js/89-dorm.js, the people in js/87-heist.js,
   the outskirts thief in js/89-outskirts-play.js). All of them are built from the students' parts in js/60-details.js. ---------- */
/* the hip joint: the legs (npcLegGeo) hang from here; with the shoe soles then just on the floor (lower and the shoes sink in) */
const PPL_HIP = .92;
/* radius of the 8-sided torso (npcBodyGeo, before its .62 squash front to back) at height y */
const PPL_TORSO = [[.17, .87], [.18, .95], [.165, 1.08], [.185, 1.25], [.2, 1.36], [.15, 1.44]];
function pplTorsoR(y){
  const P = PPL_TORSO; if (y <= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) if (P[i][1] >= y){ const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
  return P[P.length - 1][0];
}
/* a band that hugs the torso (stripes, belts, an apron when th0 / th1 cut it to the front), lined up with its eight sides */
const pplBand = (y, h, off, th0, th1) => new THREE.CylinderGeometry(pplTorsoR(y + h / 2) + off, pplTorsoR(y - h / 2) + off, h, 8, 1, true, th0 || 0, th1 != null ? th1 - (th0 || 0) : Math.PI * 2)
  .scale(1, 1, .62 + off * 1.2).translate(0, y, 0);
/* a band round the head (npcHeadGeo: a ball of .14 at y 1.62, a little taller than wide): eye masks, face masks, hat bands */
const pplHeadBand = (y, h, off, th0, th1) => new THREE.CylinderGeometry(.14 + off, .14 + off, h, 14, 1, true, th0 || 0, th1 != null ? th1 - (th0 || 0) : Math.PI * 2).translate(0, y, 0);
/* a soft cap: a dome over the crown and a short stiff peak at the front */
const pplCapGeo = (() => geoMerge([
  new THREE.SphereGeometry(.158, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .76, 1.05).translate(0, 1.66, -.005),
  new THREE.CylinderGeometry(.15, .15, .018, 14, 1, false, -1.15, 2.3).scale(1, 1, .95).translate(0, 1.665, .055)]))();
/* two arms hanging from the shoulders like the students' (sleeve in the shirt colour, bare forearm and hand) */
function pplArms(g, shirt, skin){
  return [-1, 1].map(s => {
    const a = new THREE.Group(); a.position.set(s * .215, 1.39, 0); a.rotation.z = s * .1;
    for (const [geo, mat] of [[npcSleeveGeo, shirt], [npcForeGeo, skin]]){ const m = new THREE.Mesh(geo, mat); m.castShadow = true; a.add(m); }
    g.add(a); return a;
  });
}
const guardMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.75});
const guardWetMat = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.3, color:'#a9c9e8'});      /* soaked: darker, bluish, shiny */
const guardGeo = (() => {
  const P = [], T = (g, c) => P.push(geoTint(g, c)), bx = (w, h, d, x, y, z, c) => T(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
  const tube = (pts, r, c) => T(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), 6, r, 4), c);
  const RED = '#d81f26', ORANGE = '#ff5a1f', WHITE = '#f7f6f1', BLACK = '#15151a', SKIN = '#c98f65';
  /* he faces +z; his left is +x */
  T(npcBodyGeo.clone(), WHITE);                                                                                   /* short-sleeved white shirt */
  T(new THREE.CylinderGeometry(.178, .178, .05, 8, 1, true).scale(1, 1, .63).translate(0, .9, 0), BLACK);          /* belt */
  T(npcHeadGeo.clone(), SKIN);
  T(geoAt(new THREE.SphereGeometry(.165, 9, 5), -.02, 1.775, 0, 0, 0, .2, 1.2, .42, 1.14), RED);                   /* beret, drooping to his right */
  T(new THREE.CylinderGeometry(.146, .149, .04, 9, 1, true).translate(0, 1.708, 0), '#a8151b');                    /* its band */
  T(new THREE.CylinderGeometry(.034, .034, .014, 8).rotateX(Math.PI / 2).translate(.078, 1.752, .128), '#e8c04a'); /* cap badge, front left */
  bx(.075, .31, .014, 0, 1.265, .127, ORANGE); bx(.07, .05, .022, 0, 1.435, .118, ORANGE);                         /* tie and knot */
  for (const s of [-1, 1]){
    bx(.092, .085, .008, s * .1, 1.3, .117, '#e2e1db'); bx(.092, .022, .012, s * .1, 1.345, .118, '#d3d2cb');     /* chest pockets with flaps */
    bx(.078, .016, .105, s * .168, 1.457, 0, BLACK);                                                              /* epaulettes, two silver stars each */
    for (const z of [-.026, .026]) bx(.016, .012, .016, s * .168, 1.468, z, '#dfe3e8');
  }
  bx(.085, .028, .01, -.1, 1.372, .122, BLACK);                                                                   /* name tag over the right pocket */
  tube([[-.168, 1.455, .03], [-.205, 1.31, .07], [-.16, 1.235, .115], [-.1, 1.315, .124]], .012, ORANGE);         /* cord from the right shoulder to the pocket */
  bx(.06, .1, .036, .108, 1.325, .135, '#1b1b20'); bx(.008, .075, .008, .13, 1.41, .135, '#1b1b20');              /* radio on the left chest, with its aerial */
  tube([[.142, 1.63, .0], [.158, 1.52, .04], [.135, 1.43, .1], [.112, 1.385, .132]], .007, '#ececec');            /* earpiece wire from the left ear */
  tube([[.055, 1.462, .085], [.02, 1.33, .128], [-.03, 1.215, .136]], .006, '#ff86b4'); tube([[-.055, 1.462, .085], [-.045, 1.33, .128], [-.03, 1.215, .136]], .006, '#ff86b4');   /* pink lanyard */
  bx(.05, .068, .006, -.03, 1.175, .137, '#ffd9e6'); bx(.011, .05, .011, .076, 1.36, .124, '#2a5bd7');            /* its card · a pen in the left pocket */
  const body = geoMerge(P.splice(0));
  /* an arm hangs from the shoulder at the origin: white sleeve, a round badge on it, bare forearm and hand */
  T(npcSleeveGeo.clone(), WHITE); T(npcForeGeo.clone(), SKIN);
  for (const s of [-1, 1]){ T(new THREE.CylinderGeometry(.043, .043, .012, 8).rotateZ(Math.PI / 2).translate(s * .072, -.09, 0), '#1f5fd0'); T(new THREE.CylinderGeometry(.024, .024, .014, 6).rotateZ(Math.PI / 2).translate(s * .075, -.09, 0), '#ffd23a'); }
  const arm = geoMerge(P.splice(0));
  /* a leg hangs from the hip: dark trousers, black shoe */
  T(nwCapsule(.085, .07, .74, 6, 2), '#1b2238'); bx(.17, .14, .19, -.005, -.05, 0, '#1b2238'); bx(.12, .08, .25, 0, -.875, .035, '#0e0e10');
  return {body, arm, leg:geoMerge(P.splice(0))};
})();
function guardFig(o){
  o = o || {}; const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const mk = (geo, x, y) => { const m = new THREE.Mesh(geo, guardMat); m.position.set(x, y, 0); m.castShadow = true; inner.add(m); return m; };
  const body = mk(guardGeo.body, 0, 0), arms = [1, -1].map(s => mk(guardGeo.arm, s * .215, 1.39)), legs = [1, -1].map(s => mk(guardGeo.leg, s * .09, PPL_HIP));
  g.scale.setScalar(o.s || 1.2); g.visible = false;
  return {g, inner, body, arms, legs, parts:[body].concat(arms, legs), t:0, radio:0, radioLen:1, wet:false};
}
function guardRadio(G, sec){ G.radio = G.radioLen = sec || 1.6; }
/* one frame of body language. o.walk = stride phase (omit when standing), o.run, o.seated (driving; o.steer leans the hands),
   o.wet (wiping his face with both hands), o.down (flat on his back, shoved over) */
function guardPose(G, dt, o){
  G.t += dt; G.radio = Math.max(0, G.radio - dt);
  let aL = 0, aR = 0, zL = .09, zR = -.09, lL = 0, lR = 0, lean = 0;
  if (o.seated){ lL = lR = -1.15; aL = aR = -1.05;      /* thighs on the bench, feet down in the footwell (flat out they went through the dashboard) */ zL = -.12 + (o.steer || 0) * .25; zR = .12 + (o.steer || 0) * .25; }
  else if (o.walk != null){ const s = Math.sin(o.walk), k = o.run ? .85 : .5; lL = s * k; lR = -s * k; aL = -s * k * .8; aR = s * k * .8; lean = o.run ? .16 : 0; }
  if (o.wet){ aL = aR = -2.5 + Math.sin(G.t * 14) * .3; zL = -.36; zR = .36; }
  else if (G.radio > 0){ const k = Math.min(1, G.radio * 5, (G.radioLen - G.radio) * 7); aL += (-2.3 - aL) * k; zL += (-.6 - zL) * k; }      /* left hand up to the radio */
  G.arms[0].rotation.set(aL, 0, zL); G.arms[1].rotation.set(aR, 0, zR); G.legs[0].rotation.x = lL; G.legs[1].rotation.x = lR;
  if (o.down){ G.inner.rotation.x = -1.45; G.inner.position.y = .25; G.legs[0].rotation.x = -.5 + Math.sin(G.t * 9) * .3; G.legs[1].rotation.x = -.5 - Math.sin(G.t * 9) * .3; }
  else { G.inner.rotation.x = lean; G.inner.position.y = 0; }
  if (!!o.wet !== G.wet){ G.wet = !!o.wet; for (const m of G.parts) m.material = G.wet ? guardWetMat : guardMat; }
}

/* ---------- a guard at the wheel of every patrol cart ---------- */
const guardCars = typeof patrols !== 'undefined' ? patrols.concat(typeof blockers !== 'undefined' ? blockers : []) : [];
for (const c of guardCars){
  const G = guardFig({s:1}), seat = c.T.seat || [.24, .5, -.3];
  G.g.position.set(seat[0], -.02, seat[2] - .1); G.g.visible = true; c.body.add(G.g); c.guard = G;
  if (c.fine) for (const m of G.parts){ c.fine.push(m); m.visible = c.fineOn !== false; }      /* hidden with the car's small parts when it is far away (js/18-gfx.js) */
}
{
  const base = Object.assign({}, gx); let stars = 0;
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      const now = Math.min(5, Math.floor(heat)), call = now > stars && now >= 2; stars = now;      /* the alert went up: they call it in */
      for (const c of guardCars){
        const G = c.guard; if (!c.root.visible) continue;
        G.g.visible = c !== driving; if (!G.g.visible) continue;
        if (call && c.active) guardRadio(G, 1.4 + rnd() * .6);
        guardPose(G, dt, {seated:true, steer:c.steer || 0, wet:c.soakT > 0});
      }
    }
  });
}
