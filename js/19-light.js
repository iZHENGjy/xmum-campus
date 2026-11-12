/* XMUM 校园漫游 · 光照：调色（ACES 电影感色调映射 + 按时间的曝光）。标准 / 高清才开，流畅不变。
   怎么做的：游戏里几百个颜色都是按"屏幕上看到的颜色"手调的（材质、顶点色、setRGB、天空着色器……），直接把渲染器换成线性 + sRGB 输出
   就得把它们全部换算一遍，漏一个就发白。所以这里在每个像素最后一步（three.js 的 tonemapping_fragment）里做：
     屏幕色 → 近似线性（平方）→ 乘曝光 → ACES Filmic → 再编码回屏幕色（开方），和原色按 TONE_K 混合。
   效果：晒得过亮的白墙、夜里的窗和灯不再一片死白（有肩部压缩），暗部稍微沉一点，颜色更"电影"。不加渲染通道，每像素几次乘法和开方。
   曝光跟着时钟走（js/17-clock.js 关键帧里的 ex），室内和过场的特殊天色用 1。 */
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
