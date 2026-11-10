/* XMUM 校园漫游 · 画面：每帧的远近模型切换、阴影刷新节奏、行人细节，以及最后那一下 render。
   档位参数在 js/quality.js（XQ.cfg），主循环（js/90-main.js）每帧调一次 gfxRender(dt, T)。 */
'use strict';

/* ---------- students: which parts cast shadows (js/60-details.js already draws limbs, hair and backpacks only for the nearby ones) ---------- */
function gfxNpcDetail(){
  if (typeof npcBodyIm === 'undefined') return;
  const close = !lodOverview, sh = XQ.cfg.shadow > 0, t = XQ.tier;
  npcBodyIm.castShadow = sh && (close || t > 1); npcLegIm.castShadow = sh && close;
  npcHeadIm.castShadow = npcGearIm.castShadow = npcSleeveIm.castShadow = npcForeIm.castShadow = npcSkirtIm.castShadow = npcHairIm.castShadow = sh && close && t > 1;
  npcUmbIm.castShadow = sh && close;
}

/* ---------- cars: trim, chrome and wheels only within sight ---------- */
let gfxCarTick = 0;
function gfxCarDetail(){
  if (typeof cars === 'undefined' || ++gfxCarTick < 6) return;
  gfxCarTick = 0;
  const cam = camera.position, d = 160 * XQ.cfg.lod, dd = d * d;
  for (const c of cars){
    const on = !lodOverview && (c.x - cam.x) * (c.x - cam.x) + (c.z - cam.z) * (c.z - cam.z) < dd;
    if (on !== c.fineOn){ c.fineOn = on; for (const m of c.fine) m.visible = on; }
  }
}

/* ---------- shadows: redrawn every frame at street level, but from high above only when something changed or a few times a second ---------- */
renderer.shadowMap.autoUpdate = false;
const gfxSh = {d:new THREE.Vector3(), tx:1e9, tz:1e9, half:0, n:0};
function gfxShadowTick(){
  if (!renderer.shadowMap.enabled) return;
  const tp = sun.target.position; let need = true;
  if (mode === 'orbit'){
    const moved = gfxSh.d.distanceToSquared(cur.d) > 1e-7 || tp.x !== gfxSh.tx || tp.z !== gfxSh.tz || shadowHalf !== gfxSh.half;
    const every = camera.position.distanceTo(controls.target) > 420 ? 20 : 3;
    need = moved || ++gfxSh.n >= every;
  }
  if (need){ gfxSh.n = 0; gfxSh.d.copy(cur.d); gfxSh.tx = tp.x; gfxSh.tz = tp.z; gfxSh.half = shadowHalf; renderer.shadowMap.needsUpdate = true; }
}
XQ.onChange(() => { renderer.shadowMap.needsUpdate = true; });

/* ---------- the frame ---------- */
function gfxRender(dt, T){
  updateLod(); gfxNpcDetail(); gfxCarDetail(); gfxShadowTick();
  renderer.render(scene, camera);
}
