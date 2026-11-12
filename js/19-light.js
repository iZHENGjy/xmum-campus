/* XMUM 校园漫游 · 光照：调色（ACES 电影感色调映射 + 按时间的曝光）。标准 / 高清才开，流畅不变。
   怎么做的：游戏里几百个颜色都是按"屏幕上看到的颜色"手调的（材质、顶点色、setRGB、天空着色器……），直接把渲染器换成线性 + sRGB 输出
   就得把它们全部换算一遍，漏一个就发白。所以这里在每个像素最后一步（three.js 的 tonemapping_fragment）里做：
     屏幕色 → 近似线性（平方）→ 乘曝光 → ACES Filmic → 再编码回屏幕色（开方），和原色按 K 混合。
   效果：晒得过亮的白墙、夜里的窗和灯不再一片死白（有肩部压缩），暗部稍微沉一点，颜色更"电影"。不加渲染通道，每像素几次乘法和开方。
   曝光跟着时钟走（js/17-clock.js 关键帧里的 ex），室内和过场的特殊天色用 1.08。
   细节（便宜的那种，不加真灯）：
     - 云影：地面着色器里一张慢慢飘的云影贴图，只压太阳直射那部分（标准 / 高清，和地面细节一起开）
     - 湿路倒影：下雨后的夜里，每盏路灯在地上拉出一道朝着镜头的光带（顶点着色器里摆，和路灯光斑共用实例矩阵，零 CPU）；车灯光斑在湿路上更亮
     - 月亮的光晕（标准 / 高清）；星星和月亮本来就有，阴天、烟霾时会被遮住（js/17-weather.js）
     - 流畅没有阴影贴图：学生脚下补一个软的圆影子（和学生身体共用实例矩阵，一次绘制） */
'use strict';
const XTone = (() => {
  const K = .6;   /* how much of the filmic curve is mixed in: 1 = full ACES (too contrasty for this bright cartoon look), 0 = off */
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    /vec3 CustomToneMapping\( vec3 color \) \{[^}]*\}/,
    `vec3 CustomToneMapping( vec3 color ) {
      vec3 c = max( color, vec3( 0.0 ) );
      vec3 f = sqrt( ACESFilmicToneMapping( c * c ) );
      f = max( mix( vec3( dot( f, vec3( .2126, .7152, .0722 ) ) ), f, 1.1 ), vec3( 0.0 ) );   /* ACES greys out bright colours a little: give some back */
      return mix( min( c, vec3( 1.0 ) ), f, ${K.toFixed(3)} );
    }`);
  const T = {on:false, ex:1.08, K};
  const mats = () => { scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); };
  XQ.onChange(() => {
    const on = XQ.tier > 0;
    if (on === T.on && renderer.toneMapping === (on ? THREE.CustomToneMapping : THREE.NoToneMapping)) return;
    T.on = on; renderer.toneMapping = on ? THREE.CustomToneMapping : THREE.NoToneMapping; mats();
  });
  /* exposure: from the clock outdoors, 1 indoors; eased so a time jump or a door does not pop */
  T.tick = dt => {
    const out = tgt === P3.day || tgt === P3.dusk || tgt === P3.night;
    const want = out && typeof XClock !== 'undefined' ? XClock.live.ex : 1.08;
    T.ex += (want - T.ex) * Math.min(1, dt * 2.5);
    renderer.toneMappingExposure = T.ex;
  };
  return T;
})();
{ const base = gfxRender; gfxRender = function(dt, T){ XTone.tick(dt); base(dt, T); }; }

/* ---------- the details ---------- */
const XLight = (() => {
  const rr = mkRng(31337);
  /* cloud shadows: soft blobs on a tile that wraps, ~650 m across */
  const cloudTex = (() => {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    for (let k = 0; k < 16; k++){
      const x = rr() * N, y = rr() * N, r = 10 + rr() * 22, a = .45 + rr() * .4;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]){
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.6, `rgba(255,255,255,${a * .55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const cloudU = {tex:{value:cloudTex}, k:{value:new THREE.Vector4(0, 0, 1 / 650, 0)}};
  const cloudPatch = sh => {
    sh.uniforms.uCloudTex = cloudU.tex; sh.uniforms.uCloud = cloudU.k;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uCloudTex; uniform vec4 uCloud;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #ifdef XQ_DETAIL
          reflectedLight.directDiffuse *= 1.0 - uCloud.w * texture2D(uCloudTex, vDPos * uCloud.z + uCloud.xy).r;
        #endif`);
  };
  /* ride on the ground-detail patch (js/18-gfx.js), which already has the world position (vDPos) and the 标准 / 高清 switch (XQ_DETAIL) */
  const wrap = m => { if (!m || m.userData.xlCloud) return; const base = m.onBeforeCompile; m.userData.xlCloud = true; m.onBeforeCompile = sh => { base(sh); cloudPatch(sh); }; m.needsUpdate = true; };
  gfxDetailMats.forEach(wrap);
  { const base = gfxDetail; gfxDetail = function(m){ const r = base.apply(this, arguments); wrap(m); return r; }; }

  /* wet-road reflections: a streak from each lamp's pool toward the camera */
  const streakMat = new THREE.MeshBasicMaterial({map:glowTex, color:'#ffc890', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
    polygonOffset:true, polygonOffsetFactor:-12, polygonOffsetUnits:-48});
  streakMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 xlC = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float xlS = length(instanceMatrix[0].xyz);
      vec2 xlTo = cameraPosition.xz - xlC.xz; float xlD = max(length(xlTo), 1.0); vec2 xlDir = xlTo / xlD, xlSide = vec2(-xlDir.y, xlDir.x);
      float xlL = min(xlS * 2.4, xlD * .55);
      vec2 xlP = xlC.xz + xlSide * position.x * xlS * .17 + xlDir * (.5 - position.z * .5) * xlL;
      vec4 mvPosition = viewMatrix * vec4(xlP.x, xlC.y + .02, xlP.y, 1.0);
      gl_Position = projectionMatrix * mvPosition;`);
  };
  const streaks = glowSets.map(g => {
    const m = new THREE.InstancedMesh(glowGeo, streakMat, g.im.count); m.instanceMatrix = g.im.instanceMatrix;
    m.frustumCulled = false; m.visible = false; m.renderOrder = 2; m.userData.xp = true; scene.add(m); return m;
  });

  /* the moon's halo */
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex, color:'#c9d4ff', transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false, fog:false}));
  halo.scale.setScalar(1300); halo.visible = false; halo.renderOrder = 99; halo.userData.xp = true; scene.add(halo);

  /* 流畅: a soft shadow under each student */
  let npcBlob = null;
  const npcBlobInit = () => {
    if (npcBlob || typeof npcBodyIm === 'undefined') return;
    const mat = new THREE.MeshBasicMaterial({map:blobTex, color:'#000000', transparent:true, opacity:.34, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-11, polygonOffsetUnits:-44});
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
        vec4 xlC = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float xlS = length(instanceMatrix[0].xyz);
        vec4 mvPosition = viewMatrix * vec4(xlC.x + position.x * xlS * .95, xlC.y + .06, xlC.z + position.z * xlS * .95, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    };
    npcBlob = new THREE.InstancedMesh(glowGeo, mat, npcBodyIm.count); npcBlob.instanceMatrix = npcBodyIm.instanceMatrix;
    npcBlob.frustumCulled = false; npcBlob.visible = false; npcBlob.renderOrder = 1; npcBlob.userData.xp = true; scene.add(npcBlob);
  };

  function tick(dt){
    const t1 = XQ.tier > 0, out = tgt === P3.day || tgt === P3.dusk || tgt === P3.night;
    /* clouds drift east with the cloud meshes (js/90-main.js moves them 5 m/s) */
    const v = cloudU.k.value, sunK = Math.min(1, Math.max(0, (sun.intensity - .25) / .8));
    v.x = (v.x + dt * 5 / 650) % 1; v.y = (v.y + dt * 1.2 / 650) % 1;
    v.w = t1 && out && !REDUCED ? .32 * sunK * (1 - Math.max(wx.cloud, wx.storm, wx.haze * .7)) : 0;
    /* streaks: wet ground and lamps on */
    const lamp = Math.min(1, bulbMat.emissiveIntensity), st = XQ.cfg.glow && out && wx.wet > .05 && lamp > .1;
    streakMat.opacity = st ? lamp * wx.wet * .42 : 0;
    for (const m of streaks) m.visible = st;
    halo.visible = t1 && moonMat.opacity > .02 && moon.visible;
    if (halo.visible){ halo.position.copy(moon.position); halo.material.opacity = moonMat.opacity * .32; }
    npcBlobInit();
    if (npcBlob) npcBlob.visible = !renderer.shadowMap.enabled && mode !== 'orbit';
  }
  return {tick, cloudU, streaks, halo, get npcBlob(){ return npcBlob; }};
})();
{ const base = gfxRender; gfxRender = function(dt, T){ XLight.tick(dt); base(dt, T); }; }
