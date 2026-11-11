/* XMUM 校园漫游 · 画质档位：流畅 / 标准 / 高清。最先加载（渲染器要按档位决定开不开抗锯齿）。
   对外：window.XQ
     XQ.level            'low' | 'mid' | 'high'（流畅 / 标准 / 高清）
     XQ.tier             0 | 1 | 2
     XQ.manual           玩家是不是自己选的（自己选的不会被自动降档）
     XQ.cfg              这一档的参数表（见下面 CFG）
     XQ.pick(a, b, c)    按档位三选一：XQ.pick(40, 120, 300)
     XQ.atLeast('mid')   是不是至少这一档
     XQ.onChange(fn)     注册回调，立刻用当前档位调一次，之后每次换档再调：fn(level, XQ)。返回取消函数
     XQ.set(level)       换档并记住（玩家手动）；XQ.set(level, {auto:true}) 是自动降档，不算手动
   用法（别的文件按档位决定粒子数、要不要阴影）：
     XQ.onChange(() => { sparks.count = XQ.pick(20, 60, 120); lampLight.castShadow = XQ.atLeast('high'); });
     if (XQ.cfg.particles < .5) return;   // 流畅档跳过纯装饰的效果 */
'use strict';
const XQ = window.XQ = (() => {
  const NAMES = ['low', 'mid', 'high'], LABELS = {low:'流畅', mid:'标准', high:'高清'};
  const K_MANUAL = 'xmum-gfx', K_AUTO = 'xmum-gfx-auto';
  const get = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch(e){} };
  const touch = matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  /* pr: 像素比上限；aa: 抗锯齿（只在打开页面时生效）；shadow: 0 关 / 1 普通 / 2 柔和；smap: 阴影贴图边长；
     lod: 近处精细模型的距离倍数；props: 小物件多远以内才画（米）；particles: 粒子密度倍数；
     bloom: 泛光；water: 水面波纹和反光；wind: 树叶摆动；glow: 夜晚路灯光斑；npcDetail: 行人四肢多远以内才画（米）；
     detail: 地面的草纹、路面颗粒和铺装缝；tex: 外墙贴图边长；planes: 奶娃航班间隔倍数（0 = 不飞） */
  const CFG = {
    low:  {pr:1,   aa:false, shadow:0, smap:0,                   lod:.6,              props:260, particles:.35, bloom:false, water:false, wind:false, glow:false, npcDetail:120, detail:false, tex:256, planes:2.5},
    mid:  {pr:touch ? 1.5 : 1.25, aa:true,  shadow:1, smap:touch ? 1536 : 2048, lod:touch ? .85 : 1, props:420, particles:.7,  bloom:false, water:true,  wind:false, glow:true,  npcDetail:220, detail:true,  tex:touch ? 256 : 512, planes:1},
    high: {pr:2,   aa:true,  shadow:2, smap:touch ? 2048 : 4096, lod:1.4,             props:650, particles:1,   bloom:true,  water:true,  wind:true,  glow:true,  npcDetail:400, detail:true,  tex:512, planes:1}
  };
  /* 显卡名字（认不出来就是空串）。只在没选过画质的时候查一次：临时开一个 WebGL 上下文，问完就释放 */
  function gpuName(){
    try {
      const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return '';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      return name;
    } catch(e){ return ''; }
  }
  /* 独显：NVIDIA、AMD 的 RX / Pro 系列、Intel Arc。核显（Intel UHD / Iris / HD、AMD "Radeon Graphics" / Vega）和认不出来的都不算 */
  const DISCRETE = /nvidia|geforce|quadro|\brtx\b|\bgtx\b|radeon(\(tm\))? (rx|pro|r9|vii)|intel\(r\) arc|\barc\(tm\) a\d/i;
  /* 没选过的时候：手机默认标准，内存小的手机默认流畅；
     电脑只有认出是独显才默认高清，核显和认不出来的默认标准（同学的笔记本大多是 Intel 核显 + 高分屏，高清太重），内存小的默认流畅 */
  let gpu = '';
  function guess(){
    const small = mem && mem <= 4;
    if (touch) return small ? 'low' : 'mid';
    if (small || (cores && cores <= 2)) return small ? 'low' : 'mid';
    gpu = gpuName();
    return DISCRETE.test(gpu) ? 'high' : 'mid';
  }
  const ok = v => NAMES.indexOf(v) >= 0;
  const saved = get(K_MANUAL), auto = get(K_AUTO);
  const fns = [];
  const q = {
    names:NAMES, labels:LABELS, touch,
    get gpu(){ return gpu; },
    level: ok(saved) ? saved : ok(auto) ? auto : guess(),
    manual: ok(saved),
    scale: 1,   /* 流畅档还卡的时候，再把分辨率降到 3/4（js/90-main.js 的 adaptQuality） */
    get tier(){ return NAMES.indexOf(q.level); },
    get label(){ return LABELS[q.level]; },
    get cfg(){ return CFG[q.level]; },
    pick(a, b, c){ return q.level === 'low' ? a : q.level === 'mid' ? b : c; },
    atLeast(l){ return q.tier >= NAMES.indexOf(l); },
    onChange(fn){ fns.push(fn); try { fn(q.level, q); } catch(e){ console.error(e); } return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
    set(level, o){
      if (!ok(level)) return;
      const isAuto = !!(o && o.auto);
      if (isAuto){ put(K_AUTO, level); } else { q.manual = true; put(K_MANUAL, level); put(K_AUTO, null); }
      if (level === q.level && q.scale === 1) return;
      q.level = level; q.scale = 1; q.emit();
    },
    setScale(s){ if (s === q.scale) return; q.scale = s; q.emit(); },
    emit(){ for (const fn of fns.slice()){ try { fn(q.level, q); } catch(e){ console.error(e); } } }
  };
  /* 抗锯齿在创建渲染器时就定了，换档以后要重新打开页面才变 */
  q.aa = CFG[q.level].aa;
  return q;
})();
