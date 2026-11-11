/* XMUM 校园漫游 · 地图边缘：快到边上时出现警戒线，车慢慢减速停下，不再一头撞上看不见的墙
 *
 * 地图外圈是一个矩形（js/12-terrain.js 的 MAP.x0 / x1 / z0 / z1），以前到了边上就是一堵看不见的墙：
 * 开快车撞上去算撞车，80 km/h 以上还会把奶娃甩出去。现在：
 *   - 离边缘 EDGE_SHOW 米以内，边上出现红白警戒带（越近越清楚），远了就隐藏，不占画面；
 *   - 离边缘 EDGE_SLOW 米以内，往外开的那部分速度慢慢减掉，到边上正好停住；往回开不受影响；
 *   - 第一次靠近时提示一句「前面是地图边缘」。
 * 只管外圈矩形；校园绿篱和大门（MAP.wall）照旧。 */
'use strict';
(() => {
  if (typeof MAP === 'undefined' || typeof gx === 'undefined' || typeof THREE === 'undefined') return;
  const EDGE_SHOW = 70, EDGE_SLOW = 45, H = 2.4;
  /* red and white diagonal stripes, with a thin dark band top and bottom */
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#d6392b'; for (let i = -2; i < 6; i++){ g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 16, 32); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 32, 0); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(30,30,30,.55)'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 29, 128, 3);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
  const sides = [
    {ax:'z', at:MAP.z0, a:MAP.x0, b:MAP.x1, out:-1},
    {ax:'z', at:MAP.z1, a:MAP.x0, b:MAP.x1, out:1},
    {ax:'x', at:MAP.x0, a:MAP.z0, b:MAP.z1, out:-1},
    {ax:'x', at:MAP.x1, a:MAP.z0, b:MAP.z1, out:1}
  ];
  /* each side is a short segment of tape that slides along with you (60 m wide), so there is no 2 km strip to draw */
  const SEG = 120;
  for (const s of sides){
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(SEG / 4, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SEG, H), new THREE.MeshBasicMaterial({map:t, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false, fog:true}));
    m.visible = false; m.renderOrder = 2; scene.add(m);
    if (s.ax === 'x') m.rotation.y = Math.PI / 2;
    s.m = m; s.t = t;
  }
  let told = false, toldT = 0;
  const pos = () => {
    if (typeof driving !== 'undefined' && driving) return {x:driving.x, z:driving.z, car:driving};
    if (typeof nw !== 'undefined' && nw) return {x:nw.x, z:nw.z, car:null};
    return null;
  };
  const base = Object.assign({}, gx);
  Object.assign(gx, {
    update(dt, px, pz){
      base.update(dt, px, pz);
      const p = (typeof mode === 'undefined' || mode === 'naiwa') && !(typeof indoorNow === 'function' && indoorNow()) ? pos() : null;
      let nearest = 1e9;
      for (const s of sides){
        if (!p){ s.m.visible = false; continue; }
        const along = s.ax === 'z' ? p.x : p.z, across = s.ax === 'z' ? p.z : p.x;
        const d = Math.abs(s.at - across); nearest = Math.min(nearest, d);
        const k = Math.max(0, Math.min(1, (EDGE_SHOW - d) / (EDGE_SHOW - 8)));
        s.m.visible = k > 0;
        if (!s.m.visible) continue;
        const ca = Math.max(s.a + SEG / 2, Math.min(s.b - SEG / 2, along));
        const gy = typeof groundAt === 'function' ? groundAt(s.ax === 'z' ? ca : s.at, s.ax === 'z' ? s.at : ca) : 0;
        if (s.ax === 'z') s.m.position.set(ca, gy + H / 2 + .3, s.at - s.out * .5); else s.m.position.set(s.at - s.out * .5, gy + H / 2 + .3, ca);
        s.t.offset.x = (ca / 4) % 1;   /* stripes stay put on the ground while the segment slides */
        s.m.material.opacity = .25 + .7 * k;
        /* slow the outward part of the car's speed: the closer, the harder, so it stops at the edge instead of crashing */
        if (p.car && d < EDGE_SLOW){
          const c = p.car, vo = (s.ax === 'z' ? c.vz : c.vx) * s.out;
          if (vo > 0){
            const f = Math.pow(Math.max(0, d - 2) / EDGE_SLOW, .8), lim = Math.max(1.5, 34 * f);
            const nv = vo > lim ? lim + (vo - lim) * Math.exp(-6 * dt) : vo;
            if (s.ax === 'z') c.vz = nv * s.out; else c.vx = nv * s.out;
          }
        }
      }
      if (p && nearest < 40){
        if (!told && typeof toast === 'function'){ told = true; toldT = 0; toast('前面是地图边缘', '再往外就出不去了，掉头回去吧', 2200); }
      } else if (told && (toldT += dt) > 20) told = false;
    }
  });
})();
