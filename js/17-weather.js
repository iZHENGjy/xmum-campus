/* XMUM 校园漫游 · 天气：雪邦的午后阵雨照旧，另加午后雷阵雨、烟霾（jerebu）、阴天。
   对外 window.XWeather：
     XWeather.type          'clear' | 'shower' | 'storm' | 'haze' | 'overcast'
     XWeather.set(type, s)  马上换天气（测试用；s = 持续秒数，不给就随机）。玩家的「下雨」按钮还是 js/16-ambient.js 的 setRain
     XWeather.heavy()       0–1，雨有多大（阵雨约 .5，雷阵雨 1）；js/89-life.js 之类想知道"该不该躲雨"就读它
   wx（js/10-world.js）多了四个 0–1 的量，都是慢慢过渡的：wx.storm 雷雨、wx.haze 烟霾、wx.cloud 阴天、wx.flash 闪电那一下。
   怎么排：玩家没手动下雨时，隔 2.5–6 分钟来一场，按钟点挑：下午多雷阵雨，上午有时起烟霾（少见），晚上只会转阴，深夜不下雨。
   开了「减少动态效果」的系统设置：不自动下雨，也没有闪电（只有雷声）。
   对玩法的影响都很轻：
     - 路湿了开的车抓地力变小（js/89-roadevents.js 已经做了，最多 -30%，这里不再叠加），漂移显示「雨中漂移」（js/80-gta.js，分数不变）
     - 大雨时一部分路上的学生回室内（n.state = 'shelter'，只挑镜头看不到、没有「活的校园」任务的，雨停再出来；js/89-life.js 跳过它们）
     - 送外卖赶上自然下的大雨：小费 +RM 2，一天最多 8 次。自己点「下雨」不算，所以刷不了 */
'use strict';
const XWeather = window.XWeather = (() => {
  const rr = mkRng(424242);
  const TYPES = {
    clear:   {icon:'',   name:'晴'},
    shower:  {icon:'🌧', name:'阵雨',  dur:[45, 75]},
    storm:   {icon:'⛈', name:'雷阵雨', dur:[75, 115]},
    haze:    {icon:'🌫', name:'烟霾',  dur:[120, 180]},
    overcast:{icon:'☁️', name:'阴天',  dur:[90, 150]}
  };
  const S = {type:'clear', left:150 + rr() * 90, dur:0, manual:false, hazeCd:0, tgt:{storm:0, haze:0, cloud:0}, strike:6, bolt:0, flashT:-1, flashK:0, thunders:[]};
  /* outdoors: the clock's sky is on (not the train, arcade or a film) and we are not in a room (house, dorm, Sukiya, classroom: indoorNow() in js/40-vehicles.js) */
  const outside = () => (tgt === P3.day || tgt === P3.dusk || tgt === P3.night) && !(typeof indoorNow === 'function' && indoorNow());
  const say = (a, b) => { if (typeof toast === 'function' && outside() && !(typeof titleOpen !== 'undefined' && titleOpen)) toast(a, b, 2400); };
  function pressRain(on){ if (typeof rainBtn !== 'undefined' && rainBtn) rainBtn.setAttribute('aria-pressed', String(!!on)); }
  function start(type, dur, quiet){
    const T = TYPES[type] || TYPES.clear;
    S.type = type; S.dur = dur || (T.dur ? T.dur[0] + rr() * (T.dur[1] - T.dur[0]) : 0);
    S.tgt.storm = type === 'storm' ? 1 : 0; S.tgt.haze = type === 'haze' ? 1 : 0; S.tgt.cloud = type === 'overcast' ? 1 : type === 'shower' ? .45 : 0;
    const rain = type === 'shower' || type === 'storm';
    wx.target = rain ? 1 : 0; pressRain(rain);
    if (quiet){}
    else if (type === 'storm'){ S.strike = 5 + rr() * 5; say('雷阵雨来了 ⛈', '雪邦的午后雷雨：路面湿滑，开车慢点'); }
    else if (type === 'shower') say('下雨了', '雪邦的午后阵雨，一会儿就停');
    else if (type === 'haze'){ S.hazeCd = 1800; say('起烟霾了 🌫', 'Jerebu：空气灰黄，远处看不清，太阳成了个橙色的圆'); }
    else if (type === 'overcast') say('转阴了 ☁️', '云压下来了，说不定待会儿要下雨');
    if (typeof XClock !== 'undefined') XClock.paint();
    if (typeof todBtn !== 'undefined' && todBtn && todBtn.sync) todBtn.sync();
  }
  function end(){
    const was = S.type; start('clear');
    S.left = (was === 'haze' ? 260 : 170) + rr() * 190;
  }
  /* what comes next depends on the hour */
  function pick(){
    const h = typeof XClock !== 'undefined' ? XClock.hour() : 14, wet = !REDUCED;
    const roll = rr();
    if (h >= 13.5 && h < 19) return !wet ? 'overcast' : roll < .38 ? 'storm' : roll < .82 ? 'shower' : 'overcast';
    if (h >= 7.5 && h < 13.5){ if (roll < .12 && S.hazeCd <= 0) return 'haze'; return !wet ? 'overcast' : roll < .55 ? 'shower' : 'overcast'; }
    if (h >= 19 && h < 22) return roll < .3 && wet ? 'shower' : roll < .75 ? 'overcast' : 'clear';
    return roll < .5 ? 'overcast' : 'clear';
  }
  /* replaces the old shower timer in updateWeather (js/16-ambient.js) */
  function director(dt){
    S.hazeCd -= dt;
    /* the player's 下雨 button (setRain): a shower for as long as they want it */
    if (showers.manual){ if (!S.manual){ S.manual = true; S.type = 'shower'; S.tgt.storm = S.tgt.haze = 0; S.tgt.cloud = .45; XClock.paint(); } return; }
    if (S.manual){ S.manual = false; end(); return; }
    /* rain switched off by the 下雨 button: the storm goes with it. (A film or the train also zero the rain, but they swap tgt to their own sky first and put it back after) */
    if (outside()){
      if ((S.type === 'shower' || S.type === 'storm') && wx.target < .5){ end(); return; }
      /* rain started by someone else: the road-event shower (js/89-roadevents.js sets wx.target and showers.dur) becomes ours; rain a film or the train hands back after it ended is dropped */
      if (S.type !== 'shower' && S.type !== 'storm' && wx.target > .5){ if (showers.dur > 0){ start('shower', showers.dur, true); showers.dur = 0; } else wx.target = 0; }
    }
    if (document.hidden) return;
    if (S.type === 'clear'){ S.left -= dt; if (S.left <= 0){ const t = pick(); if (t === 'clear') S.left = 120 + rr() * 120; else start(t); } }
    else { S.dur -= dt; if (S.dur <= 0) end(); }
  }

  /* ---------- lightning: a jagged bolt far off, two or three flickers of light, and thunder after the distance in sound ---------- */
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 6), 3));
  const boltMat = new THREE.LineBasicMaterial({color:'#e4ecff', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false, toneMapped:false});
  const bolt = new THREE.LineSegments(boltGeo, boltMat); bolt.frustumCulled = false; bolt.visible = false; bolt.renderOrder = 101; scene.add(bolt);
  function makeBolt(x, z){
    const p = boltGeo.attributes.position.array; let n = 0, px = x, py = 520, pz = z;
    const seg = (ax, ay, az, bx, by, bz) => { if (n >= 30) return; const o = n++ * 6; p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz; };
    while (py > 0 && n < 24){
      const nx = px + (rr() - .5) * 60, ny = Math.max(0, py - 30 - rr() * 40), nz = pz + (rr() - .5) * 60; seg(px, py, pz, nx, ny, nz);
      if (rr() < .22 && n < 26){ const bx = nx + (rr() - .5) * 110, by = ny - 40 - rr() * 60, bz = nz + (rr() - .5) * 110; seg(nx, ny, nz, bx, Math.max(0, by), bz); }
      px = nx; py = ny; pz = nz;
    }
    boltGeo.setDrawRange(0, n * 2); boltGeo.attributes.position.needsUpdate = true;
  }
  let thunderBuf = null;
  function thunder(dist){
    if (typeof AC === 'undefined' || !AC || AC.state !== 'running' || !soundOn || document.hidden) return;
    if (!thunderBuf) thunderBuf = loopNoise(AC, 6, true);
    const t = AC.currentTime + .02, near = dist < 700, dur = 3 + Math.min(4, dist / 450), vol = Math.max(.05, Math.min(.22, 160 / dist));
    const src = AC.createBufferSource(); src.buffer = thunderBuf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(near ? 1400 : 520, t); lp.frequency.exponentialRampToValueAtTime(110, t + dur);
    const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (near ? .03 : .25));
    /* a rolling rumble: a couple of swells on the way down */
    g.gain.setTargetAtTime(vol * .45, t + .35, .25); g.gain.setTargetAtTime(vol * .8, t + .9 + rr() * .5, .2); g.gain.setTargetAtTime(.0001, t + 1.6, dur / 4);
    src.connect(lp); lp.connect(g); g.connect(AC.destination); src.start(t, rr() * 4); src.stop(t + dur + 1);
  }
  function lightning(dt){
    const on = S.type === 'storm' && wx.storm > .6 && wx.rain > .5 && outside();
    if (on){
      S.strike -= dt;
      if (S.strike <= 0){
        S.strike = 4.5 + rr() * 9;
        const a = rr() * Math.PI * 2, d = 450 + rr() * 1300, cx = camera.position.x, cz = camera.position.z;
        S.thunders.push({t:Math.max(.25, d / 343), d});   /* sound takes about 3 s a kilometre */
        if (!REDUCED){ makeBolt(cx + Math.cos(a) * d, cz + Math.sin(a) * d); S.flashT = 0; S.flashK = .55 + .45 * (1 - d / 1750); }
      }
    }
    for (let i = S.thunders.length - 1; i >= 0; i--){ const th = S.thunders[i]; th.t -= dt; if (th.t <= 0){ thunder(th.d); S.thunders.splice(i, 1); } }
    /* flash: three quick pulses over ~0.45 s */
    let f = 0;
    if (S.flashT >= 0){
      S.flashT += dt; const t = S.flashT;
      f = (t < .07 ? 1 : t < .12 ? .25 : t < .2 ? .8 : t < .3 ? .2 : t < .45 ? .45 * (1 - (t - .3) / .15) : 0) * S.flashK;
      if (t > .45) S.flashT = -1;
    }
    wx.flash = f; bolt.visible = f > .05; boltMat.opacity = Math.min(1, f * 1.4);
  }

  /* ---------- the sky: applied on top of applyTime (js/10-world.js), every frame ---------- */
  const C = h => new THREE.Color(h);
  const HAZE = C('#c9a77c'), HAZE_SUN = C('#ff8a3c'), HAZE_HEMI = C('#e8cfa8'), FLASH = C('#dfe6ff'), _g = new THREE.Color(), _h = new THREE.Color();
  const lum = c => c.r * .3 + c.g * .59 + c.b * .11, DAY_L = lum(P3.day.bg);
  function sky(){
    if (!outside()){ return; }
    const s = wx.storm, hz = wx.haze, oc = Math.max(wx.cloud, s, wx.rain * .5), fl = wx.flash, bg = scene.background;
    if (oc > .002){
      const l = lum(bg); _g.setRGB(l * .94, l * .98, l * 1.04);
      bg.lerp(_g, .7 * oc); skyU.top.value.lerp(_g.multiplyScalar(.86), .8 * oc); skyU.glow.value *= 1 - .85 * oc;
      /* a lid of cloud: hardly any direct sun (soft, faint shadows), a little more light from the whole sky. The rain itself already dimmed the sun */
      const o2 = Math.max(0, oc - wx.rain * .5); sun.intensity *= 1 - .86 * o2; hemi.intensity *= 1 + .2 * o2;
      _h.setScalar(lum(hemi.color)); hemi.color.lerp(_h, .5 * o2); _h.setScalar(lum(hemi.groundColor)); hemi.groundColor.lerp(_h, .35 * o2);   /* flat, greyer light */
      cloudMat.opacity = Math.max(cloudMat.opacity, cur.cloud + (1 - cur.cloud) * oc); cloudMat.color.lerp(_h.copy(cur.cc).multiplyScalar(.7), oc * .8);
      scene.fog.far *= 1 - .2 * oc;
      starMat.opacity *= 1 - oc; stars.visible = starMat.opacity > .01; moonMat.opacity *= 1 - .85 * oc;
    }
    if (s > .002){
      const d = s * (.35 + .65 * Math.min(1, lum(cur.bg) / DAY_L));   /* by night it is dark already: darken less */
      bg.multiplyScalar(1 - .32 * d); skyU.top.value.multiplyScalar(1 - .45 * d);
      hemi.intensity *= 1 - .2 * d; sun.intensity *= 1 - .75 * s;
      scene.fog.near *= 1 - .45 * s; scene.fog.far *= 1 - .3 * s;
      cloudMat.color.multiplyScalar(1 - .35 * s);
      bulbMat.emissiveIntensity = Math.max(bulbMat.emissiveIntensity, s * 1.1); furLampMat.emissiveIntensity = bulbMat.emissiveIntensity;
      for (const m of wallMats) m.emissiveIntensity = Math.max(m.emissiveIntensity, s * .55);
    }
    if (hz > .002){
      const k = Math.min(1, lum(cur.bg) / DAY_L * 1.1);
      _g.copy(HAZE).multiplyScalar(.25 + .75 * k);
      bg.lerp(_g, .8 * hz); skyU.top.value.lerp(_h.copy(_g).multiplyScalar(.9), .7 * hz);
      scene.fog.near += (35 - scene.fog.near) * hz; scene.fog.far += (620 - scene.fog.far) * hz;
      sun.color.lerp(HAZE_SUN, .65 * hz); sun.intensity *= 1 - .4 * hz; hemi.color.lerp(HAZE_HEMI, .45 * hz);
      skyU.sunCol.value.lerp(HAZE_SUN, .8 * hz); skyU.glow.value = skyU.glow.value * (1 - hz) + 1.25 * hz;
      cloudMat.opacity *= 1 - .7 * hz; starMat.opacity *= 1 - hz; stars.visible = starMat.opacity > .01;
    }
    if (fl > .002){ hemi.intensity += fl * 1.25; bg.lerp(FLASH, .45 * fl); skyU.top.value.lerp(FLASH, .35 * fl); }
    scene.fog.color.copy(bg); skyU.hor.value.copy(bg);
  }

  /* ---------- students head indoors in heavy rain (only the ones out of sight leave or come back, so nobody pops) ---------- */
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _pt = new THREE.Vector3(); let shelterT = 0;
  function shelter(dt){
    if ((shelterT -= dt) > 0 || typeof npcs === 'undefined') return;
    shelterT = 1;
    const want = tgt === P3.day || tgt === P3.dusk || tgt === P3.night ? Math.max(0, api.heavy() - .35) / .65 * .6 : 0;   /* up to 60 % of the walkers in a thunderstorm, ~10 % in a shower */
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    const cam = camera.position;
    for (let i = 0; i < npcs.length; i++){
      const n = npcs[i]; if (n.grp || (n.life && n.life.role)) continue;   /* walkers on an errand for js/89-life.js (queues, class, guard rounds) carry on */
      const out = (i * 0.618034) % 1 < want, unseen = !_fr.containsPoint(_pt.set(n.x, 1, n.z)) || Math.hypot(n.x - cam.x, n.z - cam.z) > 140;
      if (!unseen) continue;
      if (out && n.state === 'walk') n.state = 'shelter';
      else if (!out && n.state === 'shelter') n.state = 'walk';
    }
  }

  const api = {
    get type(){ return S.type; },
    types:TYPES,
    set(type, dur){ if (!TYPES[type]) return S.type; if (showers.manual) setRain(false); S.manual = false; if (type === 'clear') end(); else start(type, dur); return S.type; },
    heavy:() => wx.rain * (.5 + .5 * wx.storm),
    director, sky, state:S, outside,
    tick(dt){ if (!(dt > 0)) return; for (const k of ['storm', 'haze', 'cloud']){ const g = S.tgt[k], r = k === 'haze' ? 10 : 7; wx[k] += Math.sign(g - wx[k]) * Math.min(Math.abs(g - wx[k]), dt / r); } lightning(dt); shelter(dt); }
  };
  return api;
})();
function wxDirector(dt){ XWeather.director(dt); }
/* small icon for the clock button and the phone's round time button */
function wxIcon(){ return XWeather.types[XWeather.type].icon; }
/* rain tip for a delivery (js/50-missions.js): RM 2 in real, heavy, natural rain; at most 8 a day; the player's own 下雨 button does not count */
function wxTip(){
  if (XWeather.state.manual || wx.rain < .6 || !(XWeather.type === 'shower' || XWeather.type === 'storm')) return 0;
  const K = 'xmum-rain-tip', day = typeof dayKey === 'function' ? dayKey() : new Date().toDateString();
  let n = 0; try { const v = (localStorage.getItem(K) || '').split('|'); n = v[0] === day ? +v[1] || 0 : 0; } catch(e){}
  if (n >= 8) return 0;
  try { localStorage.setItem(K, day + '|' + (n + 1)); } catch(e){}
  return 2;
}
{ const base = applyTime; applyTime = function(k){ base(k); XWeather.sky(); }; }
{ const base = updateWeather; updateWeather = function(dt, T){ XWeather.tick(dt); base(dt, T); }; }
