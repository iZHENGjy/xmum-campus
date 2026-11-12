/* XMUM 校园漫游 · 校园时钟：太阳从东边升起、西边落下，天色连续走过清晨、白天、傍晚金光、黄昏、蓝调和夜晚。
   对外 window.XClock（全游戏唯一的时钟，别的文件要知道几点就读它）：
     XClock.hour()          现在几点，0–24 的小数（18.5 = 18:30）
     XClock.set(h)          跳到 h 点（锁定时也能跳）
     XClock.paused          true = 时间停住不走（时间条上的 🔒 按钮；玩家的选择会记住）
     XClock.speed           倍速。1 = 白天每现实 1 分钟走 1 游戏小时，夜里（21:00–05:30）快一倍，一整天约 20 分钟
     XClock.phase()         'day' | 'dusk' | 'night'：7–17 白天，17–20 黄昏，20–7 夜晚（和三个按钮、tgt 一致）
     XClock.text()          'HH:MM'
     XClock.onPhase(fn)     换到另一段时调用 fn(phase, hour)
     XClock.live            按时间混合出来的天色（和 P3.day 同样的字段，外加 ex = 曝光，js/19-light.js 用）
   兼容：
     - 白天 / 黄昏 / 夜晚三个按钮（data-t）照旧，点了跳到 10:00 / 18:45 / 21:00，之后时间接着走。按钮的 aria-pressed 跟着时间自己变，
       所以读它的代码（js/89-quest.js、js/89-quest-ui.js、过场、火车、街机厅恢复天色）都不用改。
     - tgt 仍然只会是 P3.day / P3.dusk / P3.night 之一（别的文件用 tgt === P3.night 判断夜里、夜市开没开）；真正往哪个天色过渡由
       clockTarget()（js/10-world.js 的 applyTime 调）换成 XClock.live。tgt 被室内、过场换成别的预设时，时钟不碰它。
     - 宿舍搜刮的 22:30–23:00 门禁是那一局自己的倒计时，和这里无关。 */
'use strict';
const XClock = window.XClock = (() => {
  const K = 'xmum-clock';
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch(e){ return {}; } };
  const save = o => { try { localStorage.setItem(K, JSON.stringify(o)); } catch(e){} };
  const saved = load();
  const JUMP = {day:10, dusk:18.75, night:21};
  const C = h => new THREE.Color(h);
  /* key frames: hour -> sky. DAY, DUSK and NIGHT are the old three presets, so jumping with a button looks just like before */
  const mk = o => { const p = Object.assign({}, o); P3_COL.forEach(f => p[f] = p[f] && p[f].isColor ? p[f].clone() : C(p[f])); return p; };
  const from = (b, o) => { const p = {}; P3_COL.forEach(f => p[f] = b[f].clone()); P3_NUM.forEach(f => p[f] = b[f]); return Object.assign(p, mk(Object.assign({}, p, o || {}))); };
  const NIGHT = from(P3.night, {ex:1}), DAY = from(P3.day, {ex:1}), DUSK = from(P3.dusk, {ex:1});
  const DAWN = mk({bg:'#56608c', top:'#1d2752', glow:.7, hs:'#6f7aa6', hg:'#1d2026', hi:.42, sc:'#d8b4c8', si:.28, win:1, lamp:1.3, stars:.3, moon:.25, cloud:.4, cc:'#8a86a2', water:'#2e3a5c', fn:600, ff:2000, ex:1});
  const RISE = mk({bg:'#f3b88f', top:'#5878b8', glow:1.45, hs:'#ffd6b6', hg:'#4a4238', hi:.5, sc:'#ffb478', si:.78, win:.35, lamp:.4, stars:0, moon:0, cloud:.82, cc:'#ffd4c0', water:'#7a7c96', fn:760, ff:2300, ex:1});
  const MORN = mk({bg:'#b0d9ee', top:'#4590de', glow:1, hs:'#e6f0fc', hg:'#58683e', hi:.64, sc:'#fff0d6', si:1.04, win:0, lamp:0, stars:0, moon:0, cloud:.93, cc:'#fff6ee', water:'#4f857a', fn:880, ff:2550, ex:1});
  const GOLD = mk({bg:'#f4c898', top:'#4a84cc', glow:1.3, hs:'#ffe4c6', hg:'#566038', hi:.6, sc:'#ffc884', si:1.06, win:.1, lamp:0, stars:0, moon:0, cloud:.9, cc:'#ffe6d0', water:'#5f857e', fn:820, ff:2450, ex:1});
  const BLUE = mk({bg:'#5c6298', top:'#1b2452', glow:.75, hs:'#7a82b8', hg:'#22212a', hi:.44, sc:'#b8a8e0', si:.3, win:1.1, lamp:1.4, stars:.45, moon:.45, cloud:.35, cc:'#6c7096', water:'#2a3458', fn:620, ff:2000, ex:1});
  const KEYS = [[0, NIGHT], [5.6, NIGHT], [6.3, DAWN], [7.1, RISE], [8.3, MORN], [9.3, DAY], [16.2, DAY], [17.6, GOLD], [18.75, DUSK], [19.55, BLUE], [20.4, NIGHT], [24, NIGHT]];
  const NUMS = P3_NUM.concat(['ex']);
  const live = from(P3.day, {ex:1}); live.d = P3.day.d.clone();
  /* where the light comes from: the sun from about 07:05 to 19:20 (Sepang, near the equator: it climbs almost straight up and leans a little south),
     the full moon the rest of the night. The light never drops below ~12° so shadows stay sane; the swap happens in the blue hour when it is faint */
  function lightDir(h, out){
    if (h > 6.55 && h < 19.75){
      const a = Math.max(-1, Math.min(1, (h - 13.175) / 6.125)) * Math.PI / 2;
      out.set(-Math.sin(a), Math.max(.2, Math.cos(a) * .93), .3);
    } else {
      const hm = h < 12 ? h + 24 : h, a = Math.max(-1, Math.min(1, (hm - 25.3) / 6.1)) * Math.PI / 2;
      out.set(-Math.sin(a), Math.max(.3, Math.cos(a) * .85), -.4);
    }
    return out.normalize();
  }
  function blend(h){
    let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
    const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], t0 = Math.max(0, Math.min(1, (h - h0) / (h1 - h0 || 1))), t = t0 * t0 * (3 - 2 * t0);
    for (const f of P3_COL) live[f].copy(a[f]).lerp(b[f], t);
    for (const f of NUMS) live[f] = a[f] + (b[f] - a[f]) * t;
    lightDir(h, live.d);
  }
  const phaseOf = h => h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
  const fmt = h => { const m = Math.floor(((h % 24) + 24) % 24 * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const S = {h:saved.lock && typeof saved.h === 'number' ? saved.h : JUMP.day, paused:!!saved.lock, speed:1, phase:'', fns:[]};
  const isPhase = t => t === P3.day || t === P3.dusk || t === P3.night;

  /* ---------- UI: the three buttons follow the clock; one more button shows the time and locks it ---------- */
  const seg = document.querySelector('.seg-time');
  const press = ph => { if (!seg) return; seg.querySelectorAll('[data-t]').forEach(x => { const on = String(x.dataset.t === ph); if (x.getAttribute('aria-pressed') !== on) x.setAttribute('aria-pressed', on); }); };
  const btn = (() => {
    if (!seg) return null;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'clkBtn'; b.className = 'clk-btn';
    b.setAttribute('aria-pressed', 'false'); seg.appendChild(b); return b;
  })();
  let shown = '';
  function paint(){
    if (!btn) return;
    const icon = typeof wxIcon === 'function' ? wxIcon() : '';
    const s = (S.paused ? '🔒 ' : '🕒 ') + fmt(S.h) + (icon ? ' ' + icon : '');
    if (s !== shown){ shown = s; btn.textContent = s; }
    const p = String(S.paused); if (btn.getAttribute('aria-pressed') !== p){
      btn.setAttribute('aria-pressed', p);
      btn.title = S.paused ? '时间锁定了；点一下让时间继续走' : '时间在走（一天约 20 分钟）；点一下锁定在现在';
      btn.setAttribute('aria-label', (S.paused ? '时间已锁定，' : '时间在走，') + '现在 ' + fmt(S.h) + '，点一下' + (S.paused ? '继续' : '锁定'));
    }
  }
  if (btn) btn.addEventListener('click', () => {
    api.paused = !S.paused;
    if (typeof toast === 'function') toast(S.paused ? '时间锁定在 ' + fmt(S.h) : '时间继续走', S.paused ? '想换时间就点白天 / 黄昏 / 夜晚，再点 🔒 解锁' : '一天大约 20 分钟，夜里走得快一些', 1800);
  });
  /* the old click handler (js/10-world.js) sets tgt; this one moves the clock there */
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { if (JUMP[b.dataset.t] != null) api.set(JUMP[b.dataset.t]); }));

  function sync(){
    blend(S.h);
    const ph = phaseOf(S.h);
    if (ph !== S.phase){
      const first = !S.phase; S.phase = ph; press(ph);
      if (!first) for (const fn of S.fns.slice()){ try { fn(ph, S.h); } catch(e){ console.error(e); } }
    }
    if (isPhase(tgt) && tgt !== P3[ph]) tgt = P3[ph];
    paint();
  }
  function tick(dt){
    if (!S.paused && dt > 0 && !(window.XPhoto && XPhoto.on)){   /* photo mode (js/89-photo.js) freezes the world, the sun too */
      const night = S.h >= 21 || S.h < 5.5;
      S.h = (S.h + dt / 60 * S.speed * (night ? 2 : 1)) % 24;
    }
    sync();
  }
  const api = {
    hour:() => S.h,
    set(h){ S.h = ((+h % 24) + 24) % 24; if (S.paused) save({lock:true, h:S.h}); sync(); return fmt(S.h); },
    get paused(){ return S.paused; },
    set paused(v){ S.paused = !!v; save(S.paused ? {lock:true, h:S.h} : {}); paint(); },
    get speed(){ return S.speed; },
    set speed(v){ S.speed = Math.max(0, +v || 0); },
    phase:() => phaseOf(S.h),
    text:() => fmt(S.h),
    onPhase(fn){ S.fns.push(fn); return () => { const i = S.fns.indexOf(fn); if (i >= 0) S.fns.splice(i, 1); }; },
    live, keys:KEYS, jump:JUMP, lightDir, tick, paint
  };
  sync();
  return api;
})();
/* applyTime (js/10-world.js) asks this which preset to ease toward: the clock's live sky while outdoors, any special preset (train, arcade, film) as it is */
function clockTarget(t){ return t === P3.day || t === P3.dusk || t === P3.night ? XClock.live : t; }
/* the clock runs off the weather update, which js/60-details.js calls every frame in every mode */
{ const base = updateWeather; updateWeather = function(dt, T){ XClock.tick(dt); base(dt, T); }; }
