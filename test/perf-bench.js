/* 渲染性能测量（只给测试页用，不进正式页面）。
   用法：起静态服务器，打开 /test/offline.html，等加载完，在控制台：
     await import('/test/perf-bench.js')   或者  fetch('test/perf-bench.js').then(r => r.text()).then(eval)
     PB.setup(1024, 768)          静音、固定画布大小、停掉自动降档
     await PB.run(['south', 'azone'], 30)   每个机位跑 30 帧，返回 [{scene, ms, renderMs, calls, tris}]
   浏览器面板隐藏时 requestAnimationFrame 不跑，这里直接调 frame()（临时换掉 requestAnimationFrame，免得排队）。
   每帧用 gl.readPixels 读 1 个像素强制等 GPU 画完，所以毫秒数是 CPU + GPU。 */
(function(){
  const SCENES = {
    south:    {x:110,  z:204, h:Math.PI},          /* 南门出生点 */
    azone:    {x:150,  z:168, h:Math.PI},          /* A 区，朝北看坡上的教学楼 */
    showcase: {x:-75,  z:214, h:Math.PI},          /* 音乐厅门前的豪车展台 */
    ly:       {x:-20,  z:-80, h:Math.PI + .5},     /* LY 宿舍区 */
    kip:      {x:-640, z:900, h:0}                 /* 校外 KIP 商场门口 */
  };
  const gl = renderer.getContext(), px = new Uint8Array(4);
  let fake = performance.now();
  function step(dt){
    const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    try { fake += (dt || 1 / 60) * 1000; frame(fake); } finally { window.requestAnimationFrame = raf; }
  }
  function sync(){ gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const PB = window.PB = {
    SCENES,
    setup(w, h, dpr){
      if (dpr){ try { Object.defineProperty(window, 'devicePixelRatio', {value:dpr, configurable:true}); } catch(e){} }
      try { soundOn = false; } catch(e){}
      try { QUAL.wait = 1e9; } catch(e){}
      try { window.AudioContext = window.webkitAudioContext = function(){ throw new Error('muted'); }; HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); }; } catch(e){}
      window.resize = function(){ renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      resize(); if (typeof applyQuality === 'function') applyQuality();
      return {w, h, pr:renderer.getPixelRatio(), level:XQ.level, scale:XQ.scale};
    },
    go(name, frames){
      const s = SCENES[name] || name;
      if (typeof titleOpen !== 'undefined' && titleOpen){ closeTitle(); const t = document.getElementById('title'); if (t) t.hidden = true; }
      if (mode !== 'naiwa') setMode('naiwa');
      if (driving) leaveCar();
      nw.x = s.x; nw.z = s.z; nw.vx = nw.vz = 0; nw.h = s.h; nw.y = typeof groundAt === 'function' ? Math.max(0, groundAt(s.x, s.z)) : 0;
      camYaw = nw.h + Math.PI; camPitch = .32; camDist = 9; camYawHold = 0;
      try { tgt = P3[PB.time || 'day']; applyTime(1); heat = 0; wx.rain = wx.target = 0; wx.wet = 0; } catch(e){}
      for (let i = 0; i < (frames || 40); i++) step();
    },
    /* one whole frame (game logic + render), counted by hand because r128 resets renderer.info after the shadow pass */
    measure(n){
      const info = renderer.info, ar = info.autoReset; info.autoReset = false;
      const sm = renderer.shadowMap, sr = sm.render; let sc = 0, st = 0;
      sm.render = function(){ const c0 = info.render.calls, t0 = info.render.triangles; sr.apply(this, arguments); sc += info.render.calls - c0; st += info.render.triangles - t0; };
      let ms = [], calls = 0, tris = 0;
      sync();
      for (let i = 0; i < n; i++){
        info.reset();
        const t = performance.now(); step(); sync(); ms.push(performance.now() - t);
        calls += info.render.calls; tris += info.render.triangles;
      }
      info.autoReset = ar; sm.render = sr;
      ms.sort((a, b) => a - b);
      const mean = ms.reduce((a, b) => a + b, 0) / n, med = ms[n >> 1];
      return {ms:+mean.toFixed(1), med:+med.toFixed(1), calls:Math.round(calls / n), tris:Math.round(tris / n), shCalls:Math.round(sc / n), shTris:Math.round(st / n)};
    },
    async run(names, n){
      const out = [];
      for (const k of names || Object.keys(SCENES)){
        PB.go(k);
        await new Promise(r => setTimeout(r, 50));
        out.push(Object.assign({scene:k, level:XQ.level}, PB.measure(n || 30)));
      }
      return out;
    },
    /* scene census: meshes, instanced meshes, triangles, shadow casters, how many have no frustum culling */
    /* 显卡计时（EXT_disjoint_timer_query_webgl2）：只算 GPU 执行这一帧花的时间，不含读像素同步的固定开销；
       再加上 renderer.render 自己在 CPU 上花的时间。返回 {gpu, cpu} 毫秒（各取 n 帧的中位数） */
    async gpu(n){
      const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); if (!ext) return null;
      const rr = renderer.render; let cpu = [];
      renderer.render = function(){ const t = performance.now(); rr.apply(this, arguments); cpu.push(performance.now() - t); };
      const qs = [];
      try {
        for (let i = 0; i < (n || 10); i++){
          const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled; gfxRender(1 / 60, 1 + i / 60);
          gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
        }
      } finally { renderer.render = rr; }
      const out = [];
      for (const q of qs){
        /* 隐藏的页面里 setTimeout 会被限速到很慢，用 MessageChannel 让出一下就行 */
        for (let k = 0; k < 4000 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) out.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
      const med = a => { a = a.slice().sort((x, y) => x - y); return +(a[a.length >> 1] || 0).toFixed(2); };
      const min = a => +Math.min(...a).toFixed(2);
      /* 别的程序抢显卡只会让时间变长，所以取最小值最接近这一帧本身的开销 */
      return {gpu:min(out), gpuMed:med(out), cpu:min(cpu), n:out.length};
    },
    async abGpu(name, rounds){
      PB.go(name, 6); const best = {on:null, off:null};
      for (let r = 0; r < (rounds || 3); r++) for (const k of ['off', 'on']){
        if (k === 'on') XPerf.on(); else XPerf.off();
        PB.go(name, 3); const g = await PB.gpu(8); const m = PB.measure(3);
        const v = Object.assign({calls:m.calls, tris:m.tris, shCalls:m.shCalls, shTris:m.shTris}, g);
        if (!best[k] || v.gpu + v.cpu < best[k].gpu + best[k].cpu) best[k] = v;
      }
      XPerf.on();
      return {scene:name, level:XQ.level, off:best.off, on:best.on};
    },
    /* 一张表：每个机位 [同步毫秒, GPU 最小, GPU 中位, render() 的 CPU, 调用(含阴影), 三角形(含阴影), 像素比, 缓冲尺寸] */
    async table(scenes, w, h, dpr){
      PB.setup(w, h, dpr); const out = {};
      for (const k of scenes){
        PB.go(k, 6); const g = await PB.gpu(8); const m = PB.measure(6); const gl = renderer.getContext();
        out[k] = [m.med, g.gpu, g.gpuMed, g.cpu, m.calls, m.tris, +renderer.getPixelRatio().toFixed(3), gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight];
      }
      return out;
    },
    /* 同一个页面里 XPerf 开 / 关 交替测 rounds 轮，各取最好的一轮（别的程序也在用显卡时，最好的一轮最接近真实） */
    ab(name, rounds, n){
      const best = {on:null, off:null};
      PB.go(name, 6);
      for (let r = 0; r < (rounds || 3); r++) for (const k of ['off', 'on']){
        if (k === 'on') XPerf.on(); else XPerf.off();
        PB.go(name, 3); const m = PB.measure(n || 8);
        if (!best[k] || m.ms < best[k].ms) best[k] = m;
      }
      XPerf.on();
      return {scene:name, level:XQ.level, off:best.off, on:best.on};
    },
    /* 同一帧（不推进游戏）分别在 XPerf 开 / 关时画一次，对比像素；show 为真时把 开 | 关 | 差异 铺满页面（截图用） */
    async compare(show){
      const grab = () => { renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled; gfxRender(0, PB.T || 1); return renderer.domElement.toDataURL('image/png'); };
      const was = XPerf.on; XPerf.on(); grab(); grab(); const a = grab();
      XPerf.off(); grab(); const b = grab(); if (was) XPerf.on(); else XPerf.off();
      const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [ia, ib] = await Promise.all([load(a), load(b)]), w = ia.width, h = ia.height;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h);
      const out = g.createImageData(w, h); let n = 0;
      for (let i = 0; i < da.data.length; i += 4){
        const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
        const v = (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 6;
        if (d > 60){ n++; out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; } else { out.data[i] = out.data[i + 1] = out.data[i + 2] = v; }
        out.data[i + 3] = 255;
      }
      g.putImageData(out, 0, 0); const c = cv.toDataURL('image/png');
      let ov = document.getElementById('pb-ov');
      if (ov) ov.remove();
      if (show){
        ov = document.createElement('div'); ov.id = 'pb-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2px';
        for (const [u, t] of [[a, 'XPerf 开'], [b, 'XPerf 关'], [c, '差异（红）']]){ const f = document.createElement('figure'); f.style.cssText = 'margin:0;position:relative;overflow:hidden'; f.innerHTML = `<img src="${u}" style="width:100%;height:100%;object-fit:contain"><figcaption style="position:absolute;left:6px;top:4px;color:#fff;font:600 14px sans-serif;text-shadow:0 0 3px #000">${t}</figcaption>`; ov.appendChild(f); }
        document.body.appendChild(ov);
      }
      return {diffPx:n, frac:+(n / (w * h)).toFixed(4)};
    },
    /* 改前（XPerf 关）| 改后（XPerf 开）左右拼成一张 JPEG，发给本地的收图小服务（sink），用来贴进 PR */
    async pair(name, sink){
      const grab = () => { renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled; gfxRender(0, PB.T || 1); return renderer.domElement.toDataURL('image/png'); };
      XPerf.off(); grab(); const b = grab(); XPerf.on(); grab(); grab(); const a = grab();
      const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [ib, ia] = await Promise.all([load(b), load(a)]);
      const W = Math.min(640, ib.width), H = Math.round(W * ib.height / ib.width), cv = document.createElement('canvas'); cv.width = W * 2 + 6; cv.height = H;
      const g = cv.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, H);
      g.drawImage(ib, 0, 0, W, H); g.drawImage(ia, W + 6, 0, W, H);
      g.font = '600 16px sans-serif'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4;
      g.fillText('改前 · ' + XQ.label, 10, 24); g.fillText('改后 · ' + XQ.label, W + 16, 24);
      const url = cv.toDataURL('image/jpeg', .82);
      await fetch((sink || 'http://127.0.0.1:8799') + '/save?name=' + encodeURIComponent(name), {method:'POST', body:url});
      return name;
    },
    /* 按屏幕尺寸放大以后，从中间偏上裁一块 1:1 的图发给收图服务（看分辨率降低以后糊不糊） */
    async crop(name, cw, ch, sink){
      renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled; gfxRender(0, PB.T || 1);
      const u = renderer.domElement.toDataURL('image/png');
      const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const sz = renderer.getSize(new THREE.Vector2()), dpr = window.devicePixelRatio || 1, W = Math.round(sz.x * dpr), H = Math.round(sz.y * dpr);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
      const sx = W / img.width, x0 = (W - cw) / 2, y0 = (H - ch) * .35;
      g.drawImage(img, x0 / sx, y0 / sx, cw / sx, ch / sx, 0, 0, cw, ch);
      g.font = '600 18px sans-serif'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4;
      g.fillText(XQ.label + ' · 渲染 ' + img.width + '×' + img.height + ' → 屏幕 ' + W + '×' + H, 12, 28);
      await fetch((sink || 'http://127.0.0.1:8799') + '/save?name=' + encodeURIComponent(name), {method:'POST', body:cv.toDataURL('image/jpeg', .85)});
      return name;
    },
    unshow(){ const ov = document.getElementById('pb-ov'); if (ov) ov.remove(); },
    /* 这一帧真正画了什么：按类别汇总（看图层，跟渲染器一样筛） */
    brk(shadow){
      const fr = new THREE.Frustum(), m = new THREE.Matrix4(), cam = shadow ? sun.shadow.camera : camera;
      if (shadow) sun.shadow.updateMatrices(sun);
      m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
      const mask = shadow ? (camera.layers.mask | 2) & ~4 : camera.layers.mask, agg = {};
      const vis = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      scene.traverse(o => {
        if (!o.isMesh || !vis(o) || !(o.layers.mask & mask)) return;
        if (shadow && !o.castShadow) return;
        if (o.isInstancedMesh && o.count === 0) return;
        if (o.frustumCulled && !fr.intersectsObject(o)) return;
        const g = o.geometry, n = o.isInstancedMesh ? o.count : 1, t = (g.index ? g.index.count : g.attributes.position.count) / 3 * n;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const k = o.userData.xp ? 'proxy' : o.userData.xpKid ? 'splitKid' : o.isInstancedMesh ? 'inst' : g.boundingSphere.radius > 150 ? 'big' : 'mesh';
        const a = agg[k] || (agg[k] = {n:0, t:0}); a.n++; a.t += Math.round(t);
      });
      return agg;
    },
    census(){
      let meshes = 0, inst = 0, tris = 0, cast = 0, noCull = 0, big = 0;
      scene.traverse(o => {
        if (!o.isMesh) return;
        meshes++; const g = o.geometry, n = o.isInstancedMesh ? o.count : 1;
        const t = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3 * n;
        tris += t; if (o.isInstancedMesh) inst++; if (o.castShadow) cast++; if (!o.frustumCulled) noCull++;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere && g.boundingSphere.radius > 150) big++;
      });
      return {meshes, inst, tris:Math.round(tris), cast, noCull, big};
    }
  };
})();
