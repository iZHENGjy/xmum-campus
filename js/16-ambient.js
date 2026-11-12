/* XMUM 校园漫游 · 环境：午后阵雨（雨丝、积水、雨声）、飞鸟、校园小猫 */
'use strict';
const ambRng = mkRng(97531);   /* own random stream: the shared rnd() sequence stays untouched */

/* ---------- rain drops: line streaks in a box that follows the camera ---------- */
const RAIN_N = TOUCH ? 1100 : 2200, RAIN_R = 42, RAIN_H = 44;
const rainPos = new Float32Array(RAIN_N * 6), rainXYZ = new Float32Array(RAIN_N * 3);
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rainMat = new THREE.LineBasicMaterial({color:'#c8d4df', transparent:true, opacity:0, depthWrite:false});
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.visible = false; scene.add(rainLines);
for (let i = 0; i < RAIN_N; i++){ rainXYZ[i * 3] = (ambRng() - .5) * 2 * RAIN_R; rainXYZ[i * 3 + 1] = ambRng() * RAIN_H; rainXYZ[i * 3 + 2] = (ambRng() - .5) * 2 * RAIN_R; }
const _rc = new THREE.Vector3();

/* ---------- puddles on roads and paths: sky-tinted gloss that fades in as the ground gets wet ---------- */
const puddleMat = new THREE.MeshBasicMaterial({color:'#8a96a3', transparent:true, opacity:0, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-10, polygonOffsetUnits:-40});
const puddles = (() => {
  const spots = [], segs = [];
  for (const r of ROADS_W) for (let i = 0; i < r.p.length - 1; i++) segs.push([r.p[i], r.p[i + 1], r.w]);
  for (let k = 0; k < 90; k++){
    const [a, b, w] = segs[(ambRng() * segs.length) | 0], t = ambRng(), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, o = (ambRng() - .5) * (w - 2);
    spots.push([a[0] + dx * t - dz / l * o, a[1] + dz * t + dx / l * o, ambRng() * 3.14, .9 + ambRng() * 2.2, .5 + ambRng() * .5]);
  }
  const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), puddleMat, spots.length);
  spots.forEach(([x, z, h, s, e], i) => { _cm.compose(_cp.set(x, .056, z), _cq.setFromAxisAngle(UP, h), _cs.set(s, 1, s * e)); im.setMatrixAt(i, _cm); });
  im.frustumCulled = false; im.visible = false; scene.add(im); return im;
})();

/* ---------- birds: two small flocks wheeling over the lakes by day ---------- */
const BIRD_N = 16;
const birdIm = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .25, -.85, .12, -.1, 0, 0, -.2,  0, 0, .25, 0, 0, -.2, .85, .12, -.1,  0, 0, .3, -.06, -.05, -.3, .06, -.05, -.3], 3));
  g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({color:'#2a2a2e', side:THREE.DoubleSide}), BIRD_N);
  im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im;
})();
const birds = [];
for (let i = 0; i < BIRD_N; i++){ const f = i < 9 ? 0 : 1; birds.push({f, a:ambRng() * .9, r:(f ? 55 : 80) + ambRng() * 18, y:(f ? 30 : 42) + ambRng() * 8, ph:ambRng() * 6, sp:.11 + ambRng() * .03}); }
const FLOCKS = [P(1300, 330), P(1120, 290)];

/* ---------- campus cats: they sit, loaf in the sun, wander a little, and scamper off when someone comes close ---------- */
const catGeo = (() => {
  const c = '#ffffff', P2 = [
    geoTint(geoAt(new THREE.SphereGeometry(.2, 10, 7), 0, .25, 0, 0, 0, 0, .9, .85, 1.45), c),          /* body */
    geoTint(geoAt(new THREE.SphereGeometry(.13, 10, 7), 0, .44, .3, 0, 0, 0, 1.1, .95, 1), c),          /* head */
    geoTint(geoAt(new THREE.SphereGeometry(.06, 6, 4), 0, .41, .41, 0, 0, 0, 1.1, .8, .8), '#f2e6dc'),  /* muzzle */
    ...[-1, 1].map(s => geoTint(geoAt(new THREE.ConeGeometry(.05, .1, 4), s * .075, .56, .3, -.15, 0, s * -.25), c)),
    ...[-1, 1].map(s => geoTint(new THREE.SphereGeometry(.022, 6, 4).translate(s * .05, .47, .41), '#2a2418')),
    ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => geoTint(new THREE.CylinderGeometry(.035, .03, .2, 6).translate(sx * .09, .1, sz * .17), c))
  ];
  return geoMerge(P2);
})();
const tailGeo = geoMerge([rodGeo(.035, .03, [0, 0, 0], [0, .12, -.18], 5), rodGeo(.03, .025, [0, .12, -.18], [0, .32, -.24], 5)]);
const CAT_COLS = ['#e39a4c', '#2a2a2c', '#f2efe9', '#8d8a86', '#c98a4a', '#3b3532', '#e8d8c0', '#d9883b'];
const catHomes = [[57, -140], [100, -150], [365, -122], [395, -128], [92, 123], [140, 124], [160, 30], [230, 38], [30, 10], [-20, 128], [440, 6], [126, 182], [300, 100], [190, -60]];
const cats = [];
catHomes.forEach(([hx, hz], i) => {
  let x = hx, z = hz;
  for (let k = 0; k < 12 && blocked(x, z); k++){ x = hx + (ambRng() - .5) * 8; z = hz + (ambRng() - .5) * 8; }
  cats.push({hx:x, hz:z, x, z, h:ambRng() * 6.28, state:i % 3 === 0 ? 'loaf' : 'sit', t:2 + ambRng() * 6, tx:x, tz:z, sp:0, ph:ambRng() * 6, flee:0});
});
const catIm = new THREE.InstancedMesh(catGeo, M('#ffffff', {vertexColors:true, roughness:.85}), cats.length);
const catTailIm = new THREE.InstancedMesh(tailGeo, M('#ffffff', {roughness:.85}), cats.length);
cats.forEach((c, i) => { catIm.setColorAt(i, _gc.set(CAT_COLS[i % CAT_COLS.length])); catTailIm.setColorAt(i, _gc.set(CAT_COLS[i % CAT_COLS.length])); });
[catIm, catTailIm].forEach(im => { im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); });
const _cb = new THREE.Matrix4(), _ct = new THREE.Matrix4(), _cr = new THREE.Matrix4();
function catThreats(){
  const out = [];
  if (mode === 'naiwa'){ if (driving) out.push([driving.x, driving.z, Math.hypot(driving.vx, driving.vz) > 2 ? 9 : 3]); else out.push([nw.x, nw.z, 3.2]); }
  else if (mode === 'walk') out.push([player.x, player.z, 3.2]);
  return out;
}
function updateCats(dt, T){
  const threats = catThreats(), rain = wx.rain;
  cats.forEach((c, i) => {
    /* someone close: bolt the other way */
    for (const [ex, ez, r] of threats){
      const dx = c.x - ex, dz = c.z - ez, d = Math.hypot(dx, dz);
      if (d < r && c.flee <= 0){ c.flee = 1.6; c.state = 'walk'; c.sp = 5.5; const l = d || 1; c.tx = c.x + dx / l * 7; c.tz = c.z + dz / l * 7; }
    }
    c.t -= dt; c.flee -= dt;
    if (c.state === 'walk'){
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
      if (d < .2 || c.t < -8){ c.state = rain > .3 || ambRng() < .4 ? 'loaf' : 'sit'; c.t = 4 + ambRng() * 9; c.sp = 0; }
      else {
        const nx = c.x + dx / d * c.sp * dt, nz = c.z + dz / d * c.sp * dt;
        if (blocked(nx, nz) || onRoad(nx, nz, -1)){ c.tx = c.x; c.tz = c.z; }
        else { c.x = nx; c.z = nz; }
        const want = Math.atan2(dx, dz); let dh = want - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.h += dh * Math.min(1, dt * 8);
      }
    } else if (c.t <= 0){
      /* stroll to a new spot near home (rain sends them under the eaves of the nearest wall: they just loaf) */
      if (rain > .3){ c.state = 'loaf'; c.t = 5; }
      else { c.state = 'walk'; c.sp = .7 + ambRng() * .4; const a = ambRng() * 6.28, r = 1.5 + ambRng() * 5; c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r; c.t = 0; }
    }
    const walking = c.state === 'walk', loaf = c.state === 'loaf';
    const bob = walking ? Math.abs(Math.sin(T * c.sp * 7 + c.ph)) * .03 : 0, breathe = 1 + Math.sin(T * 2 + c.ph) * .015;
    _cp.set(c.x, bob + azY(c.x, c.z), c.z); _cq.setFromAxisAngle(UP, c.h);   /* on the A zone's podium and slopes too (js/09-azone.js) */
    if (!walking) _cq2.setFromAxisAngle(_ax.set(1, 0, 0), loaf ? 0 : -.38), _cq.multiply(_cq2);
    _cs.set(1.3, (loaf ? .62 : 1) * breathe * 1.3, loaf ? 1.36 : 1.3);
    _cb.compose(_cp, _cq, _cs); catIm.setMatrixAt(i, _cb);
    /* tail: curls up and sways when sitting, streams out when running */
    const sway = Math.sin(T * (walking ? 6 : 1.6) + c.ph) * (walking ? .25 : .5);
    _ct.multiplyMatrices(_cb, _cr.makeTranslation(0, .28, -.27)); _ct.multiply(_cr.makeRotationY(sway)); _ct.multiply(_cr.makeRotationX(walking && c.sp > 2 ? .9 : loaf ? 1.25 : 0));
    catTailIm.setMatrixAt(i, _ct);
  });
  catIm.instanceMatrix.needsUpdate = catTailIm.instanceMatrix.needsUpdate = true;
}

/* ---------- shower schedule: a button in the time switch, plus the odd afternoon shower by itself ---------- */
const rainBtn = (() => {
  const seg = document.querySelector('.seg-time'); if (!seg) return null;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'rainBtn'; b.textContent = '下雨'; b.setAttribute('aria-pressed', 'false'); b.title = '来一场午后阵雨';
  seg.appendChild(b); return b;
})();
const showers = {left:150 + ambRng() * 90, dur:0, manual:false};
function setRain(on, instant){
  wx.target = on ? 1 : 0; showers.manual = !!on; showers.dur = 0;
  if (!on) showers.left = 240 + ambRng() * 180;
  if (instant){ wx.rain = wx.target; wx.wet = wx.target; }
  if (rainBtn) rainBtn.setAttribute('aria-pressed', String(!!on));
}
if (rainBtn) rainBtn.addEventListener('click', () => setRain(wx.target < .5));
/* phones in a game hide the time switch to keep the top strip short; this one round button stands in for it:
   it shows the current sky (☀ 🌇 🌙, plus 🌧 while it rains) and opens the four choices under it */
const todBtn = (() => {
  const seg = document.querySelector('.seg-time'); if (!seg) return null;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'todBtn'; b.setAttribute('aria-label', '时间和天气'); b.setAttribute('aria-expanded', 'false');
  seg.parentNode.insertBefore(b, seg);
  const ICON = {day:'☀️', dusk:'🌇', night:'🌙'};
  const sync = () => { const on = seg.querySelector('[data-t][aria-pressed="true"]'); const w = typeof wxIcon === 'function' ? wxIcon() : rainBtn && rainBtn.getAttribute('aria-pressed') === 'true' ? '🌧' : ''; b.textContent = (ICON[on ? on.dataset.t : 'day'] || '☀️') + w; };
  b.sync = sync;   /* js/17-weather.js calls it when the weather changes */
  const panel = seg.closest('.panel');   /* the panels blur what is behind them, so each one paints as a layer of its own: lift ours while the choices are open */
  const setOpen = open => { seg.classList.toggle('pop', open); if (panel) panel.classList.toggle('tod-open', open); b.setAttribute('aria-expanded', String(open)); };
  const close = () => setOpen(false);
  b.addEventListener('click', e => { e.stopPropagation(); setOpen(!seg.classList.contains('pop')); });
  seg.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(() => { sync(); close(); }, 0); });
  document.addEventListener('pointerdown', e => { if (seg.classList.contains('pop') && !seg.contains(e.target) && e.target !== b) close(); });
  new MutationObserver(sync).observe(seg, {subtree:true, attributes:true, attributeFilter:['aria-pressed']});
  sync(); return b;
})();
/* Rain (was: 1 s of white noise looped, which ticked at the loop seam and repeated every second, at .07). Now a 6 s pink-noise bed (softer than white hiss, loops without a click, see loopNoise in js/20-fx.js) rolled off above ~3.6 kHz,
   with the low rumble cut, plus a faint, slowly drifting bright layer for the patter. The level follows wx.rain (which itself eases over
   5 s) through a 1.2 s smoothing, so it fades in when the shower starts and out when it stops. */
let rainSnd = null;
function rainSound(){
  if (typeof AC === 'undefined' || !AC || (!rainSnd && (AC.state !== 'running' || wx.rain < .01))) return;
  if (!rainSnd){
    const buf = loopNoise(AC, 6, true), g = AC.createGain(); g.gain.value = 0; g.connect(AC.destination);
    const bed = AC.createBufferSource(); bed.buffer = buf; bed.loop = true;
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = .5;
    bed.connect(hp); hp.connect(lp); lp.connect(g); bed.start();
    /* the patter: the same noise from another start point, narrow band, quiet, its level drifting so it does not sit like a hiss */
    const pat = AC.createBufferSource(); pat.buffer = buf; pat.loop = true; pat.playbackRate.value = .93;
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = .7;
    const pg = AC.createGain(); pg.gain.value = .35; pat.connect(bp); bp.connect(pg); pg.connect(g);
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .23; lg.gain.value = .2; lfo.connect(lg); lg.connect(pg.gain);
    pat.start(0, 2.7); lfo.start();
    rainSnd = g;
  }
  rainSnd.gain.setTargetAtTime(soundOn && !document.hidden ? wx.rain * .045 : 0, AC.currentTime, 1.2);      /* about 7 dB quieter than the old .07 white-noise rain */
}

function updateWeather(dt, T){
  /* the weather schedule lives in js/17-weather.js now (showers, thunderstorms, haze, overcast); the old shower timer stays as a fallback */
  if (typeof wxDirector === 'function') wxDirector(dt);
  else if (!showers.manual && !REDUCED && !document.hidden && tgt !== P3.night){
    if (wx.target > .5){ showers.dur -= dt; if (showers.dur <= 0){ wx.target = 0; showers.left = 240 + ambRng() * 180; if (rainBtn) rainBtn.setAttribute('aria-pressed', 'false'); } }
    else { showers.left -= dt; if (showers.left <= 0){ wx.target = 1; showers.dur = 45 + ambRng() * 30; if (rainBtn) rainBtn.setAttribute('aria-pressed', 'true'); toast('下雨了', '雪邦的午后阵雨，一会儿就停', 1800); } }
  }
  wx.rain += Math.sign(wx.target - wx.rain) * Math.min(Math.abs(wx.target - wx.rain), dt / 5);
  wx.wet = wx.rain > .3 ? Math.min(1, wx.wet + dt * .12) : Math.max(0, wx.wet - dt * .02);
  rainSound(); updatePlanes(dt, T);

  /* streaks */
  rainLines.visible = wx.rain > .01 && !(typeof indoorNow === 'function' && indoorNow());   /* no rain falling inside the house, dorm or classroom */
  if (rainLines.visible){
    rainMat.opacity = .42 * wx.rain * (1 + .45 * wx.storm);   /* a thunderstorm (js/17-weather.js) pours: denser, faster, slanting in the wind */
    camera.getWorldDirection(_rc); _rc.y = 0; _rc.normalize().multiplyScalar(RAIN_R * .55);
    const cx = camera.position.x + _rc.x, cz = camera.position.z + _rc.z, base = Math.max(0, camera.position.y - RAIN_H * .55);
    const fall = (REDUCED ? 0 : 30 + 16 * wx.storm) * dt, wxd = 2.4 + 6 * wx.storm, len = 1.3 + .7 * wx.storm;
    for (let i = 0; i < RAIN_N; i++){
      let x = rainXYZ[i * 3], y = rainXYZ[i * 3 + 1] - fall, z = rainXYZ[i * 3 + 2];
      if (y < 0) y += RAIN_H;
      rainXYZ[i * 3 + 1] = y;
      /* drops live in a box of fixed world-size that wraps round the view centre */
      const wxp = ((x + T * wxd - cx + RAIN_R) % (2 * RAIN_R) + 2 * RAIN_R) % (2 * RAIN_R) + cx - RAIN_R;
      const wzp = ((z - cz + RAIN_R) % (2 * RAIN_R) + 2 * RAIN_R) % (2 * RAIN_R) + cz - RAIN_R;
      const o = i * 6, wy = base + y;
      rainPos[o] = wxp; rainPos[o + 1] = wy; rainPos[o + 2] = wzp; rainPos[o + 3] = wxp - wxd * len / 30 * 3; rainPos[o + 4] = wy + len; rainPos[o + 5] = wzp;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  /* puddles mirror the (grey) sky */
  puddles.visible = wx.wet > .01;
  if (puddles.visible){ puddleMat.opacity = wx.wet * (.55 + .2 * wx.storm); puddleMat.color.copy(scene.background).multiplyScalar(.95); }

  /* birds wheel by day and roost at night or in heavy rain */
  const showBirds = cur.stars < .5 && wx.rain < .5;
  birdIm.visible = showBirds;
  if (showBirds){
    birds.forEach((b, i) => {
      const [fx, fz] = FLOCKS[b.f], a = T * b.sp * (b.f ? -1 : 1) + b.a, flap = Math.sin(T * 9 + b.ph);
      _cp.set(fx + Math.cos(a) * b.r, b.y + Math.sin(T * .7 + b.ph) * 2, fz + Math.sin(a) * b.r);
      _cq.setFromAxisAngle(UP, -a + (b.f ? Math.PI : 0)); _cs.set(1.6, 1.6 * (.25 + 2.6 * flap), 1.6);
      _cm.compose(_cp, _cq, _cs); birdIm.setMatrixAt(i, _cm);
    });
    birdIm.instanceMatrix.needsUpdate = true;
  }
  updateCats(dt, T); updateSwans(dt, T);
}

/* ---------- 奶娃航空: now and then an airliner in 奶娃 yellow crosses high overhead, trailing two contrails; at night its navigation lights blink ----------
   One at a time, a couple of minutes apart (XQ.cfg.planes stretches the gap; 流畅 flies fewer and without contrails). 4 draw calls while one is in the sky, none otherwise. */
const naiwaAir = (() => {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const P2 = [], Y = '#f6c63c', W = '#fbf7ec', O = '#e9742a', DK = '#2f3a46';
  const add = (g, c) => P2.push(geoTint(g.index ? g.toNonIndexed() : g, c));
  /* a flat panel (wing, tailplane, fin) from four corners, drawn on both sides */
  const panel = (a, b, c, e, col) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...e, ...a, ...c, ...b, ...a, ...e, ...c], 3)); g.computeVertexNormals(); P2.push(geoTint(g, col)); };
  /* fuselage along z, nose at +z: yellow above, cream belly stripe, dark cockpit glass */
  add(new THREE.CylinderGeometry(1.9, 1.9, 26, 12).rotateX(Math.PI / 2), Y);
  add(new THREE.SphereGeometry(1.9, 12, 8).scale(1, 1, 2.6).translate(0, 0, 13), Y);
  add(new THREE.CylinderGeometry(1.9, .5, 9, 12).rotateX(Math.PI / 2).translate(0, .55, -17.5), Y);
  add(new THREE.BoxGeometry(2.3, .5, 2.2).translate(0, .9, 15.2), DK);
  add(new THREE.BoxGeometry(1.2, .35, 30).translate(0, -1.72, -1), W);
  for (const s of [-1, 1]){
    panel([s * 1.6, -.5, 4], [s * 18, .6, -5.5], [s * 18, .6, -8.2], [s * 1.6, -.5, -4.5], Y);                 /* wing */
    panel([s * 18, .6, -5.5], [s * 18.6, 2.4, -7], [s * 18.6, 2.4, -8.6], [s * 18, .6, -8.2], O);                /* winglet */
    panel([s * .8, 1, -17], [s * 6.6, 1.4, -20.5], [s * 6.6, 1.4, -22.2], [s * .8, 1, -21], Y);                  /* tailplane */
    add(new THREE.CylinderGeometry(1.05, .95, 4.4, 10).rotateX(Math.PI / 2).translate(s * 6.2, -1.5, -.4), W);   /* engine */
    add(new THREE.CylinderGeometry(1.1, 1.1, .5, 10).rotateX(Math.PI / 2).translate(s * 6.2, -1.5, 1.9), O);
  }
  panel([0, 1.6, -15], [0, 8.2, -20.6], [0, 8.2, -22.6], [0, 1.6, -21.6], O);                                    /* fin */
  const body = new THREE.Mesh(geoMerge(P2), new THREE.MeshLambertMaterial({vertexColors:true, fog:false})); root.add(body);
  /* livery: 奶娃 (a round yellow chick-like face) and the airline name on a cream band, on both sides */
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d');
  const paint = () => {
    g.clearRect(0, 0, 512, 96); g.fillStyle = '#fbf7ec'; g.fillRect(0, 14, 512, 68);
    g.fillStyle = '#f6c63c'; g.beginPath(); g.ellipse(52, 48, 30, 32, 0, 0, 7); g.fill(); g.strokeStyle = '#c98f14'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(42, 42, 3.6, 0, 7); g.arc(62, 42, 3.6, 0, 7); g.fill();
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 3; g.beginPath(); g.arc(52, 50, 9, .15 * Math.PI, .85 * Math.PI); g.stroke();
    g.fillStyle = '#f29a9a'; g.beginPath(); g.arc(34, 54, 4.5, 0, 7); g.arc(70, 54, 4.5, 0, 7); g.fill();
    g.fillStyle = '#d2541c'; g.textBaseline = 'middle'; g.font = '900 44px "Noto Sans SC","Microsoft YaHei",sans-serif'; g.fillText('奶娃航空', 96, 44);
    g.fillStyle = '#7a5a1c'; g.font = '700 20px Arial, sans-serif'; g.fillText('NAIWA AIR', 290, 60); tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv); paint(); document.fonts && document.fonts.ready.then(paint);
  const dg = [];
  for (const s of [-1, 1]) dg.push(new THREE.PlaneGeometry(17, 3.2).rotateY(s * Math.PI / 2).translate(s * 1.93, .25, 1.5).toNonIndexed());
  const decal = new THREE.Mesh(geoMergeUV(dg), new THREE.MeshBasicMaterial({map:tex, transparent:true, fog:false, side:THREE.DoubleSide})); root.add(decal);
  /* contrails: two long ribbons fading out behind the engines */
  const tc = document.createElement('canvas'); tc.width = 8; tc.height = 128; const tg = tc.getContext('2d'), gr = tg.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.04, 'rgba(255,255,255,.9)'); gr.addColorStop(.35, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  tg.fillStyle = gr; tg.fillRect(0, 0, 8, 128);
  const trailMat = new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(tc), transparent:true, opacity:.8, depthWrite:false, fog:false, side:THREE.DoubleSide});
  const tgs = []; for (const s of [-1, 1]) tgs.push(new THREE.PlaneGeometry(2.6, 420).rotateX(-Math.PI / 2).translate(s * 6.2, -1.2, -216).toNonIndexed());
  const trail = new THREE.Mesh(geoMergeUV(tgs), trailMat); trail.renderOrder = 1; root.add(trail);
  /* navigation lights: red on the port wing tip, green on the starboard one, a white strobe under the belly */
  const lamp = (c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 6, 4), new THREE.MeshBasicMaterial({color:c, fog:false})); m.position.set(x, y, z); root.add(m); return m; };
  const red = lamp('#ff3b30', 18.6, 2.4, -7.6), green = lamp('#3bff6a', -18.6, 2.4, -7.6), strobe = lamp('#ffffff', 0, -2.1, -2);
  root.scale.setScalar(2.2);
  return {root, body, trail, trailMat, red, green, strobe, on:false, wait:40 + ambRng() * 45, t:0, dur:0, a:new THREE.Vector3(), b:new THREE.Vector3()};
})();
function updatePlanes(dt, T){
  const A = naiwaAir, k = typeof XQ !== 'undefined' ? XQ.cfg.planes : 1;
  if (!A.on){
    if (!k || document.hidden) return;
    A.wait -= dt; if (A.wait > 0) return;
    /* a straight line across the sky, passing within half a kilometre of the middle of campus */
    const h = ambRng() * Math.PI * 2, side = (ambRng() - .5) * 900, alt = 430 + ambRng() * 130, R = 3300, dx = Math.sin(h), dz = Math.cos(h);
    A.a.set(-dx * R + dz * side, alt, -dz * R - dx * side); A.b.set(dx * R + dz * side, alt, dz * R - dx * side);
    A.t = 0; A.dur = 2 * R / 105; A.on = true; A.root.visible = true; A.root.rotation.set(0, h, 0); A.trail.visible = k < 2;
  }
  A.t += dt / A.dur;
  if (A.t >= 1){ A.on = false; A.root.visible = false; A.wait = (95 + ambRng() * 150) * k; return; }
  A.root.position.lerpVectors(A.a, A.b, A.t);
  /* lights: small by day, bright and blinking after dark; contrails fade at both ends of the pass and dim at night */
  const night = Math.min(1, cur.lamp), s = .5 + night * 1.1;
  A.red.scale.setScalar(s); A.green.scale.setScalar(s); A.strobe.scale.setScalar(s * 1.3); A.strobe.visible = (T % 1.3) < .09 || (T % 1.3 > .22 && T % 1.3 < .3);
  A.trailMat.opacity = (.8 - night * .5) * Math.min(1, A.t * 12, (1 - A.t) * 12) * (1 - wx.rain * .7);
}

/* ---------- swans on 芙蓉湖: a few glide about the water, a pair rests on the bank; come close and they paddle away ----------
   One instanced mesh (about 260 triangles each). How many are out depends on the quality tier: 4 on 流畅, 7 on 标准, 9 on 高清. */
const swanGeo = (() => {
  const W = '#f7f5ee', P2 = [], add = (g, c) => P2.push(geoTint(g.index ? g.toNonIndexed() : g, c));
  /* origin on the water line, facing +z */
  add(new THREE.SphereGeometry(1, 10, 7).scale(.36, .26, .62).translate(0, .14, -.04), W);                 /* body */
  add(new THREE.ConeGeometry(.16, .42, 6).rotateX(-Math.PI / 2.6).translate(0, .3, -.66), W);              /* tail, tipped up */
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(1, 8, 5).scale(.09, .2, .46).translate(s * .3, .25, -.12), '#ffffff');   /* folded wings */
  /* the neck: an S from the breast up to the head */
  const N = [[0, .28, .46], [0, .52, .6], [0, .78, .6], [0, .98, .5], [0, 1.1, .56]];
  for (let i = 0; i < N.length - 1; i++) add(rodGeo(.085 - i * .008, .077 - i * .008, N[i], N[i + 1], 6), W);
  add(new THREE.SphereGeometry(.105, 8, 6).scale(1, .95, 1.25).translate(0, 1.12, .62), W);                /* head */
  add(new THREE.ConeGeometry(.055, .2, 6).rotateX(Math.PI / 2).translate(0, 1.09, .8), '#e8862a');         /* beak */
  add(new THREE.SphereGeometry(.045, 6, 4).translate(0, 1.15, .71), '#1f1f1f');                            /* the black knob at its base */
  return geoMerge(P2);
})();
const SWAN_MAX = 9;
const swanIm = new THREE.InstancedMesh(swanGeo, M('#ffffff', {vertexColors:true, roughness:.55}), SWAN_MAX);
swanIm.frustumCulled = false; swanIm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); swanIm.receiveShadow = true; scene.add(swanIm);
/* home points in map pixels: [x, y] on the water, or [x, y, bankX, bankY] for one that rests on the bank and takes to the water when disturbed.
   Ordered so that the first four (流畅) already show both kinds and both lakes. */
const swans = [[1330, 452, 1336, 484], [1400, 385], [1120, 296], [1296, 372], [1205, 286, 1152, 247], [1450, 430], [1350, 420], [1245, 300], [1490, 392]].map(([hx, hy, bx, by]) => {
  const h = P(hx, hy), b = bx != null ? P(bx, by) : null;
  return {hx:h[0], hz:h[1], bank:b, x:b ? b[0] : h[0], z:b ? b[1] : h[1], y:b ? .2 : 0, h:ambRng() * 6.28, tx:h[0], tz:h[1], wait:ambRng() * 5, state:b ? 'rest' : 'swim', calm:0, sp:0, ph:ambRng() * 6};
});
const swanWet = (x, z) => lakes.some(L => inPoly(x, z, L));
const _swq = new THREE.Quaternion(), _swe = new THREE.Euler();
function updateSwans(dt, T){
  const n = typeof XQ !== 'undefined' ? XQ.pick(4, 7, SWAN_MAX) : 7;
  if (swanIm.count !== n){ swanIm.count = n; swanIm.castShadow = typeof XQ !== 'undefined' && XQ.tier > 1; }
  const threats = catThreats();
  if (mode === 'hole' && typeof HOLES !== 'undefined') for (const h of HOLES) if (h.alive) threats.push([h.x, h.z, h.r + 2]);
  for (let i = 0; i < n; i++){
    const s = swans[i]; let fx = 0, fz = 0, scared = false;
    for (const [tx, tz, tr] of threats){ const dx = s.x - tx, dz = s.z - tz, d = Math.hypot(dx, dz), R = tr + 7; if (d < R){ scared = true; fx += dx / (d || 1) * (R - d); fz += dz / (d || 1) * (R - d); } }
    s.calm = scared ? 0 : s.calm + dt;
    let want = 0, gx = s.tx, gz = s.tz;
    if (s.state === 'rest'){
      if (scared){ s.state = 'swim'; s.tx = s.hx; s.tz = s.hz; s.wait = 0; }
    } else if (scared && swanWet(s.x, s.z)){
      /* paddle straight away from whatever came too close, as long as that keeps it on the water */
      const l = Math.hypot(fx, fz) || 1; gx = s.x + fx / l * 6; gz = s.z + fz / l * 6; want = 2.3;
      if (!swanWet(s.x + fx / l * 2.5, s.z + fz / l * 2.5)){ gx = s.hx; gz = s.hz; }
    } else {
      const d = Math.hypot(s.tx - s.x, s.tz - s.z);
      if (d < .6){
        if (s.bank && s.tx === s.bank[0] && s.tz === s.bank[1]){ s.state = 'rest'; }
        else if ((s.wait -= dt) <= 0){
          /* back to the bank after a quiet spell, otherwise drift to another spot near home */
          if (s.bank && s.calm > 22 && Math.hypot(s.x - s.hx, s.z - s.hz) < 16){ s.tx = s.bank[0]; s.tz = s.bank[1]; }
          else for (let k = 0; k < 6; k++){ const a = ambRng() * 6.28, r = 4 + ambRng() * 13, x = s.hx + Math.cos(a) * r, z = s.hz + Math.sin(a) * r; if (swanWet(x, z) && swanWet(x + Math.cos(a) * 2, z + Math.sin(a) * 2)){ s.tx = x; s.tz = z; break; } }
          s.wait = 2 + ambRng() * 7;
        }
      } else want = scared ? 1.8 : swanWet(s.x, s.z) ? .45 : 1;
    }
    s.sp += (want - s.sp) * Math.min(1, dt * 3);
    if (s.sp > .02){
      const hd = Math.atan2(gx - s.x, gz - s.z); let dh = hd - s.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      s.h += dh * Math.min(1, dt * (scared ? 5 : 2.2));
      s.x += Math.sin(s.h) * s.sp * dt; s.z += Math.cos(s.h) * s.sp * dt;
    }
    /* afloat it bobs a little; on the bank it sits on the sand */
    const wet = swanWet(s.x, s.z), ty = wet ? Math.sin(T * 1.7 + s.ph) * .018 : .2;
    s.y += (ty - s.y) * Math.min(1, dt * 4);
    _swe.set(wet ? Math.sin(T * 1.3 + s.ph) * .03 : 0, s.h, wet ? Math.sin(T * 1.1 + s.ph * 2) * .035 : 0, 'YXZ');
    _cm.compose(_cp.set(s.x, s.y + .1, s.z), _swq.setFromEuler(_swe), _cs.setScalar(1.25)); swanIm.setMatrixAt(i, _cm);
  }
  swanIm.instanceMatrix.needsUpdate = true;
}
