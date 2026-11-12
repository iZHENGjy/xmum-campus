/* XMUM 校园漫游 · 主线界面：对话框、任务条、操作提示、手机通知、指南针和地图上的黄星、地上的黄圈、
 * 奶蛙日记（游戏指南 P 的第一页）、便利贴（支线，第二页）、老玩家欢迎卡、章节完成卡
 *
 * 状态和规则在 js/89-quest.js（window.XQuest），数据在 js/89-quest-data.js（window.XQD）。这里只画。样式在 css/style.css 的「主线」一段（q- 前缀）。
 * 原则（docs/quests.md「怎么展示、怎么引导」）：不另开面板、不挡视线，都放在玩家熟悉的位置；正在送单或比赛时主线让位。
 *   任务条：右上角钱包面板，送单那一行下面多一行「主线 1/7 · 走到 A3 大台阶 · 1/9」，点一下打开日记。
 *   操作提示：电脑在屏幕下方写按键；手机不写按键，对应的按钮闪一圈黄边。做完就消失。
 *   对话框：屏幕下方，左边头像，右边名字和一句话；空格 / 回车 / F / 点一下翻下一句，Esc 或「跳过」直接跳完。对话时游戏不暂停，奶蛙站住。
 *   手机通知：右上角，图标 + 名字 + 一句话，3 秒收起；过场、对话、比赛、被保安追的时候先攒着。
 *   日记页底下的开关「不显示操作提示」：只收起屏幕下方那条按键提示，任务条和指南针照常显示。 */
'use strict';
(() => {
  const XQ = window.XQuest; if (!XQ) return;
  const D = XQ.data, g = (f, d) => { try { return f(); } catch(e){ return d; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const S = () => XQ.state;
  const quiet = () => !!S().quiet;
  const person = id => D.people[id] || (D.npcs[id] ? {name:D.npcs[id].name, icon:(D.npcs[id].short || D.npcs[id].name)[0], color:D.npcs[id].color} : {name:id, icon:'?', color:'#888'});
  const hintText = h => h ? (TOUCH ? h.touch || '' : h.pc || '') : '';

  /* ================= dialog box ================= */
  const box = el('div', 'panel q-talk'); box.id = 'qtalk'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite');
  box.innerHTML = '<div class="q-av" aria-hidden="true"></div><div class="q-tx"><b class="q-who"></b><p class="q-line"></p></div><button type="button" class="q-skip">跳过</button><span class="q-next" aria-hidden="true">▸</span>';
  document.body.appendChild(box);
  const T = {lines:null, i:0, shown:0, full:'', opt:null, t0:0};
  function talkShow(){
    const l = T.lines[T.i], p = person(l.who);
    const av = box.querySelector('.q-av'); av.textContent = p.icon; av.style.background = p.color || '#888';
    box.querySelector('.q-who').textContent = p.name;
    T.full = l.text || ''; T.shown = 0; T.t0 = performance.now();
    box.querySelector('.q-line').textContent = '';
    /* say which key goes on: F on a computer, a tap on a phone; the last line says it closes */
    const last = T.i >= T.lines.length - 1;
    box.querySelector('.q-next').innerHTML = TOUCH ? (last ? '点一下关闭 ✓' : '点一下继续 ▸') : (last ? '<kbd>F</kbd> 好的' : '<kbd>F</kbd> 继续');
    if (T.opt && T.opt.onLine) T.opt.onLine(l.who);
    g(() => tone('triangle', 520 + (T.i % 3) * 60, 560, .05, .04));
  }
  function talkFrame(){
    if (box.hidden || T.shown >= T.full.length) return;
    const n = Math.min(T.full.length, Math.floor((performance.now() - T.t0) / 1000 * (REDUCED ? 999 : 38)));
    if (n !== T.shown){ T.shown = n; box.querySelector('.q-line').textContent = T.full.slice(0, n); }
  }
  function talkNext(){
    if (box.hidden) return;
    if (T.shown < T.full.length){ T.shown = T.full.length; box.querySelector('.q-line').textContent = T.full; return; }   /* first tap: the whole line */
    if (++T.i >= T.lines.length) return talkEnd();
    talkShow();
  }
  function talkEnd(){
    if (box.hidden) return;
    box.hidden = true; document.body.classList.remove('q-talking');
    const o = T.opt; T.lines = null; T.opt = null;
    if (o && o.onDone) o.onDone();
    hintSync(true);
  }
  function sayUI(lines, opt){
    if (!lines || !lines.length){ if (opt && opt.onDone) opt.onDone(); return; }
    T.lines = lines; T.i = 0; T.opt = opt || {};
    box.hidden = false; document.body.classList.add('q-talking');
    g(() => { for (const k in keys) keys[k] = false; joy.x = joy.y = 0; });
    talkShow();
  }
  box.addEventListener('pointerdown', e => { e.stopPropagation(); });
  box.addEventListener('click', e => { if (e.target.closest('.q-skip')) talkEnd(); else talkNext(); });
  window.addEventListener('keydown', e => {
    if (box.hidden || document.querySelector('dialog[open]')) return;
    if (e.code === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); talkEnd(); return; }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF' || e.code === 'NumpadEnter'){ e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) talkNext(); return; }
    if (/^Key[WASD]$|^Arrow|^Shift/.test(e.code)){ e.stopImmediatePropagation(); }   /* stand still while talking */
  }, true);

  /* ================= phone notifications ================= */
  const ph = el('div', 'panel q-phone'); ph.id = 'qphone'; ph.hidden = true; ph.setAttribute('role', 'status'); ph.setAttribute('aria-live', 'polite');
  ph.innerHTML = '<i class="q-av"></i><div><b></b><span></span></div>';
  document.body.appendChild(ph);
  const phQ = []; let phT = 0, phBusy = false;
  const holdNotes = () => g(() => XCine.busy, false) || !box.hidden || g(() => heat > 0, false) || g(() => gx.extBusy(), false) || g(() => XGuide.on, false) || mode !== 'naiwa' || !!document.querySelector('.q-welcome:not([hidden])');
  function phShow(){
    if (phBusy || !phQ.length || holdNotes()) return;
    const e = phQ.shift(), m = D.msgs[e.m]; if (!m) return;
    const p = person(m.from); phBusy = true;
    const av = ph.querySelector('.q-av'); av.textContent = p.icon; av.style.background = p.color || '#888';
    ph.querySelector('b').textContent = p.name; ph.querySelector('span').textContent = m.text;
    ph.hidden = false; ph.classList.remove('in'); void ph.offsetWidth; ph.classList.add('in');
    g(() => { tone('sine', 1180, 1180, .07, .06); tone('sine', 1480, 1480, .09, .06, .09); });
    clearTimeout(phT); phT = setTimeout(() => { ph.classList.remove('in'); phT = setTimeout(() => { ph.hidden = true; phBusy = false; }, 300); }, 3000);
  }
  ph.addEventListener('click', () => { view = null; g(() => XGuide.open('diary')); });
  XQ.on('msg', e => { phQ.push(e); phShow(); });

  /* ================= the quest bar (under the delivery line in the wallet panel) ================= */
  const bar = el('button', 'mission q-bar'); bar.type = 'button'; bar.id = 'qbar'; bar.hidden = true;
  { const m = document.getElementById('mission'); if (m) m.after(bar); }
  bar.addEventListener('click', () => { g(() => ac()); view = null; g(() => XGuide.open('diary')); });
  function barSync(){
    const c = XQ.chapter(), st = XQ.step();
    const show = mode === 'naiwa' && !!c && S().ph !== 'done';   /* always: the 收起 box only hides the operation tips */
    bar.hidden = !show; if (!show) return;
    const all = XQ.steps(), i = Math.max(0, all.findIndex(s => s.id === (st && st.id))), cnt = st && st.count ? g(() => st.count(XQ.Q), null) : null;
    const why = st ? XQ.waitWhy(st).split('。')[0] : '';   /* the bar gets the first sentence; the diary's list has the whole of it */
    const t = `主线 ${c.n}/${XQ.chapters.length} · ${st ? st.text.replace(/（.*?）/g, '') : ''}` + (why ? `（${why}）` : cnt ? ` ${cnt[0]}/${cnt[1]}` : st && !st.meet && !st.solo ? ` · ${i + 1}/${all.length}` : '');
    if (bar.textContent !== t){ bar.textContent = t; bar.title = t + '（点开日记）'; }
    bar.classList.toggle('q-bang', !!st && (st.meet || st.report));
  }

  /* ================= operation hints: one per step, until it is done ================= */
  const hint = el('div', 'panel q-hint'); hint.id = 'qhint'; hint.hidden = true; document.body.appendChild(hint);
  let flashEl = null, hintId = '';
  function hintSync(force){
    const st = XQ.step(), h = st && st.hint, busy = !box.hidden || g(() => XCine.busy, false) || mode !== 'naiwa' || quiet() || g(() => gx.paused, false) || (S().ph !== 'steps' && !(st && st.solo));
    const want = !busy && h && !XQ.stepDone(st.id) ? st : null;
    const id = want ? want.id : '';
    if (id === hintId && !force) return;
    hintId = id;
    if (flashEl){ flashEl.classList.remove('q-flash'); flashEl = null; }
    if (!want){ hint.hidden = true; return; }
    hint.innerHTML = hintText(h); hint.hidden = !hint.innerHTML;
    if (!hint.hidden){ hint.classList.remove('in'); void hint.offsetWidth; hint.classList.add('in'); }
    if (TOUCH && h.flash){ flashEl = document.querySelector(h.flash); if (flashEl) flashEl.classList.add('q-flash'); }
  }

  /* ================= chapter cards, step callouts ================= */
  const card = el('div', 'panel q-card'); card.id = 'qcard'; card.hidden = true; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
  document.body.appendChild(card);
  const cardQ = []; let cardT = 0;
  function cardShow(o){
    cardQ.push(o); if (cardQ.length > 1) return;
    cardNext();
  }
  function cardNext(){
    const o = cardQ[0]; if (!o){ card.hidden = true; return; }
    card.innerHTML = `<i>${esc(o.tag)}</i><b>${esc(o.title)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`;
    card.hidden = false; card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
    g(() => { tone('triangle', 659, 659, .14, .13); tone('triangle', 880, 880, .14, .13, .13); tone('triangle', 1175, 1175, .5, .15, .26); });
    clearTimeout(cardT); cardT = setTimeout(() => { card.classList.remove('show'); cardT = setTimeout(() => { cardQ.shift(); cardNext(); }, 350); }, o.ms || 3600);
  }
  XQ.on('step', ({st, got, quiet:q}) => {
    if (q) return;
    g(() => gx.callout('✓ ' + st.text.replace(/（.*?）/g, ''), got ? '+' + got : '', '#ffc21a'));
    g(() => sfx.ding());
    hintSync(true);
  });
  XQ.on('report', c => {
    const n = D.npcs[c.npc] || {};
    cardShow({tag:'主线', title:`第 ${c.n} 章 · 都做完了`, sub:`${c.report || '回去找' + n.name}，听听结尾`});
  });
  XQ.on('chapter', o => {
    const c = o.c; view = null;
    if (o.start) g(() => gx.callout(`第 ${c.n} 章 · ${c.title}`, '主线开始', '#ffc21a'));
    if (o.end){
      cardShow({tag:'主线完成', title:`第 ${c.n} 章 ${c.title}`, sub:o.got ? '奖励：' + o.got : '', ms:4600});
      const nx = XQ.chapter();
      if (nx){ const n = D.npcs[nx.npc] || {}; setTimeout(() => cardShow({tag:'下一章', title:`第 ${nx.n} 章 · ${nx.title}`, sub:`去${nx.place || ''}找${n.name || ''}，指南针会带你去`}), 400); }
      else setTimeout(() => cardShow({tag:'主线', title:'第一年，完。', sub:'以后的新章节会接在后面', ms:5200}), 400);
    }
  });
  XQ.on('side', ({s, got, quiet:q}) => { if (!q) g(() => gx.callout('✓ 支线 · ' + s.text, got ? '+' + got : '', '#ffc21a')); });
  XQ.on('unlock', k => {
    if (k === 'drive'){
      setTimeout(() => {
        g(() => toast('可以开车了！', TOUCH ? '走到 Myvi 旁边，点「上车」' : '走到 Myvi 旁边按 F 上车，WASD 开，空格漂移', 4200));
        hint.innerHTML = TOUCH ? '走到车旁边，点「上车」' : '走到车旁边按 <kbd>F</kbd> 上车 · <kbd>W</kbd><kbd>S</kbd> 油门刹车 · <kbd>A</kbd><kbd>D</kbd> 转向 · 按住 <kbd>空格</kbd> 漂移';
        hint.hidden = quiet(); hint.classList.remove('in'); void hint.offsetWidth; hint.classList.add('in'); hintId = '_drive';
        if (TOUCH){ flashEl = document.getElementById('act-f'); if (flashEl) flashEl.classList.add('q-flash'); }
        const off = setInterval(() => { if (g(() => driving, null) || hintId !== '_drive'){ clearInterval(off); if (hintId === '_drive'){ hintId = 'x'; hintSync(true); } } }, 500);
      }, 600);
    } else if (k === 'park') g(() => toast('汽车游乐园的比赛开放了', '一园、二园的计时和纪录从现在开始算', 3200));
    else if (k === 'train') g(() => toast('小火车开通了', '去 Salak Tinggi ERL 站，站厅门口上车', 3200));
  });

  /* ================= returning players: one welcome card ================= */
  const wel = el('div', 'q-welcome'); wel.hidden = true; wel.setAttribute('role', 'dialog'); wel.setAttribute('aria-modal', 'true'); wel.setAttribute('aria-labelledby', 'qwT');
  wel.innerHTML = `<div class="panel q-wbox"><div class="q-whead"><i class="q-av" style="background:${D.npcs.xiaoman ? D.npcs.xiaoman.color : '#3f8fe6'}">满</i><div><b id="qwT">欢迎回来！</b><span>小满学姐</span></div><button type="button" class="x" aria-label="关闭">×</button></div>
    <p class="q-wp"></p><p class="q-wgift"></p><div class="q-wbtns"><button type="button" class="btn buy" data-a="diary">翻翻日记</button><button type="button" class="btn" data-a="intro">看开场</button></div></div>`;
  document.body.appendChild(wel);
  function welcomeTry(){
    const w = S().welcome; if (!w || !XQ.ready || mode !== 'naiwa' || !wel.hidden || g(() => XCine.busy, false) || g(() => XGuide.on, false) || document.querySelector('dialog[open]')) return;
    const chs = w.chs || [], last = chs.length ? chs[chs.length - 1] : 0, nx = XQ.chapter();
    wel.querySelector('.q-wp').textContent = `学校新开了主线：${'零一二三四五六七八九十'[XQ.chapters.length] || XQ.chapters.length}章，从报到、过生日、当车手，一路到带下一届新生。你来得早，${last > 1 ? `第 1–${last} 章` : '第 1 章'}已经算你完成了` + (nx ? `，接着从第 ${nx.n} 章「${nx.title}」开始。` : '。')
      + (w.part && nx && w.part.n === nx.n && w.part.done ? `这一章 ${w.part.of} 件事你已经做过 ${w.part.done} 件，还差：${w.part.left.join('、')}。` : '');
    wel.querySelector('.q-wgift').textContent = '补发：' + ['RM ' + (w.rm || 0).toLocaleString()].concat(w.items ? [w.items] : []).join(' + ');
    wel.hidden = false; g(() => { gx.paused = true; }); wel.querySelector('[data-a="diary"]').focus({preventScroll:true});
    g(() => tone('triangle', 784, 784, .14, .14));
  }
  function welcomeClose(then){
    if (wel.hidden) return;
    wel.hidden = true; S().welcome = null; XQ.save(); g(() => { gx.paused = false; canvas.focus({preventScroll:true}); });
    if (then === 'diary') setTimeout(() => g(() => XGuide.open('diary')), 50);
    if (then === 'intro') setTimeout(() => XQ.playIntro(true), 50);
  }
  wel.addEventListener('click', e => { const b = e.target.closest('button'); if (b) welcomeClose(b.dataset.a); else if (e.target === wel) welcomeClose(); });
  wel.addEventListener('keydown', e => { if (e.code === 'Escape'){ e.preventDefault(); e.stopPropagation(); welcomeClose(); } });
  window.addEventListener('keydown', e => { if (!wel.hidden && e.code !== 'Tab' && e.code !== 'Enter' && e.code !== 'Space'){ e.stopImmediatePropagation(); if (e.code === 'Escape') welcomeClose(); } }, true);

  /* ================= the ground ring for "go there" steps, the star on the maps ================= */
  const ring = (() => {
    if (typeof ringGeo === 'undefined') return null;
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({color:'#ffc21a', transparent:true, opacity:.5, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending}));
    m.visible = false; scene.add(m); return m;
  })();
  const stepAt = st => { if (!st || !st.at) return null; const a = typeof st.at === 'function' ? g(() => st.at(XQ.Q), null) : st.at; return a && isFinite(a[0]) ? a : null; };
  function star(G, x, y, r, col){
    G.beginPath(); for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * .45 : r; G.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } G.closePath();
    G.fillStyle = col; G.strokeStyle = '#1f2a33'; G.lineWidth = Math.max(1.5, r * .18); G.fill(); G.stroke();
  }
  function overlay(cx, cz, o){
      if (mode !== 'naiwa' || g(() => indoorNow(), false) || quiet()) return;
      const G = o && o.g || mini.getContext('2d'), Sw = G.canvas.width, Sh = G.canvas.height, u = o && o.u || 1, k = Math.min(Sw, Sh) / (o && o.span || 520);
      const X = x => Sw / 2 + (x - cx) * k, Z = z => Sh / 2 + (z - cz) * k, e = 10 * u, clamp = (v, m) => Math.max(e, Math.min(m - e, v));
      /* npcs with something to give: a yellow "!" */
      for (const id in D.npcs){
        if (XQ.npcMark(id) !== '!') continue; const a = XQ.npcAt(id); if (!a) continue;
        const px = clamp(X(a[0]), Sw), pz = clamp(Z(a[1]), Sh);
        G.fillStyle = '#ffc21a'; G.strokeStyle = '#1f2a33'; G.lineWidth = 2 * u; G.beginPath(); G.arc(px, pz, 8 * u, 0, 7); G.fill(); G.stroke();
        G.fillStyle = '#1f2a33'; G.font = `900 ${Math.round(12 * u)}px sans-serif`; G.textAlign = 'center'; G.textBaseline = 'middle'; G.fillText('!', px, pz + .5 * u); G.textAlign = 'start'; G.textBaseline = 'alphabetic';
      }
      if (g(() => mission.on, false)) return;
      const a = stepAt(XQ.step()); if (!a) return;
      star(G, clamp(X(a[0]), Sw), clamp(Z(a[1]), Sh), 10 * u, '#ffc21a');
  }
  if (typeof drawMini === 'function'){ const base = drawMini; drawMini = function(cx, cz, yaw, o){ base(cx, cz, yaw, o); if (!(o && o.g)) overlay(cx, cz, o); }; }
  g(() => XGuide.mapLayers.push(overlay));

  /* ================= the diary: page 1 of the game guide ================= */
  const WEATHER = () => {
    const t = g(() => document.querySelector('[data-t][aria-pressed="true"]').dataset.t, 'day'), rain = g(() => wx.rain > .3, false);
    return rain ? '🌧 下雨' : t === 'night' ? '🌙 夜晚' : t === 'dusk' ? '🌇 黄昏' : '☀️ 晴';
  };
  var view = null;   /* which chapter page the diary shows; null = the current one */
  const diaryArt = `<svg viewBox="0 0 240 120" aria-hidden="true"><rect x="40" y="10" width="160" height="104" rx="6" fill="var(--card-bg)" stroke="var(--ink)" stroke-width="2"/><path d="M120 12 V112" stroke="var(--line)" stroke-width="2"/>
    <path d="M54 34 H108 M54 48 H104 M54 62 H110 M54 76 H96" stroke="var(--muted)" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <rect x="132" y="26" width="54" height="30" rx="6" fill="#3f8fe6" opacity=".9"/><rect x="138" y="62" width="48" height="24" rx="6" fill="#e8708a" opacity=".9"/><path d="M140 36 H178 M140 44 H168 M144 72 H178" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="66" cy="100" rx="13" ry="12" fill="#f2c64a" stroke="var(--ink)" stroke-width="1.5"/><circle cx="61" cy="96" r="2" fill="var(--ink)"/><circle cx="71" cy="96" r="2" fill="var(--ink)"/><path d="M62 103 Q66 106 70 103" stroke="var(--ink)" stroke-width="1.4" fill="none"/>
    <path d="M196 8 l6 10 -4 2 z" fill="var(--tile)"/></svg>`;
  function lineOf(e){
    let t = e.x || D.diary[e.s] || ''; if (e.v) t = t.replace(/\{(\w+)\}/g, (_, k) => e.v[k] != null ? e.v[k] : '');
    return t;
  }
  function diaryBody(){
    const st = S(), CH = XQ.chapters, curN = Math.min(st.ch, CH.length);
    const pages = [0].concat(CH.filter(c => c.n <= curN).map(c => c.n));   /* 0 = the flight in */
    let n = view == null ? (st.ph === 'done' ? CH.length : curN) : view; if (!pages.includes(n)) n = pages[pages.length - 1];
    view = n;
    const c = CH.find(x => x.n === n), entries = st.diary.filter(e => (e.c | 0) === n);
    const firstDay = entries.length ? entries[0].d : XQ.dayNo(), isCur = c && n === curN && st.ph !== 'done';
    const head = n === 0 ? `<span>开学前一天 · ✈️ 飞往吉隆坡</span><b>开场 · 飞往吉隆坡</b>`
      : `<span>开学第 ${isCur ? XQ.dayNo() : firstDay} 天 · ${isCur ? WEATHER() : '—'}</span><b>第 ${n} 章 · ${esc(c.title)}</b>`;
    let h = `<div class="q-dh">${head}<div class="q-dnav"><button type="button" class="q-dprev" ${pages.indexOf(n) <= 0 ? 'disabled' : ''} aria-label="上一页日记">‹</button><button type="button" class="q-dnext" ${pages.indexOf(n) >= pages.length - 1 ? 'disabled' : ''} aria-label="下一页日记">›</button></div></div>`;
    h += '<div class="q-dcols"><div class="q-dleft">';
    /* the writing */
    const lines = entries.map(e => `<p class="q-dl${e.r ? ' q-recap' : ''}">${esc(lineOf(e))}${e.r ? '<i>补记</i>' : ''}</p>`).join('');
    h += `<div class="q-dtext">${lines || `<p class="q-dl q-dim">${n === 0 ? '（还没写）' : isCur && st.ph === 'meet' ? '（还没开始。先去找' + esc((D.npcs[c.npc] || {}).name || '') + '。）' : '（这一页还空着。）'}</p>`}</div>`;
    if (n === 0) h += `<button type="button" class="btn q-replay">▶ 重看开场</button>`;
    else if (XQ.chFinished(c)) h += `<button type="button" class="btn q-replay" data-ch="${n}">▶ 重温这一章${c.endCine || c.replayCine ? '（含动画）' : ''}</button>`;
    /* today's list */
    if (c){
      const all = c.steps.concat([{id:c.id + '_report', text:c.report || '回去找' + ((D.npcs[c.npc] || {}).name || ''), report:true}]);
      const now = XQ.step(), meet = isCur && st.ph === 'meet';
      h += `<h4 class="q-dh4">${isCur ? '今天要做的事' : '那时候做的事'}</h4><ul class="q-todo">`;
      if (meet) h += `<li class="q-now"><span class="q-box">☐</span><div><b>去找${esc((D.npcs[c.npc] || {}).name || '')}</b><small>在${esc(c.place || '')}。指南针会带你去，${TOUCH ? '走近了点「说话」' : '走近了按 F 说话'}。</small></div></li>`;
      for (const s of all){
        const done = XQ.stepDone(s.id), cur = isCur && !meet && now && now.id === s.id;
        const cnt = s.count && cur ? g(() => s.count(XQ.Q), null) : null;
        const why = isCur && !done ? XQ.waitWhy(s) : '';
        h += `<li class="${done ? 'q-done' : cur ? 'q-now' : 'q-later'}"><span class="q-box">${done ? '☑' : '☐'}</span><div><b>${esc(s.text)}${s.opt && !done ? ' <em class="q-opt">可选</em>' : ''}${cnt ? ` <em>${cnt[0]}/${cnt[1]}</em>` : ''}${s.rm && !done ? ` <em class="q-rm">RM ${s.rm}</em>` : ''}</b>`;
        if (why) h += `<small class="q-how">${esc(why)}</small>`;
        else if (s.opt && !done && !cur && s.hint) h += `<small>${hintText(s.hint)}</small>`;
        if (cur){
          const ht = hintText(s.hint);
          if (ht) h += `<small class="q-how">${ht}</small>`;
          if (s.tip) h += `<small>${esc(s.tip)}</small>`;
          const gp = s.guide || (c.guide || [])[0];
          if (gp && g(() => XGuide.pages.includes(gp), false)) h += `<button type="button" class="q-more" data-g="${esc(gp)}">看说明 ›</button>`;
        }
        h += '</div></li>';
      }
      h += '</ul>';
      if (c.reward && !XQ.stepDone(c.id + '_report')) h += `<p class="q-drew">本章奖励：${esc(c.reward.note || [c.reward.rm ? 'RM ' + c.reward.rm : '', c.reward.title ? '称号「' + c.reward.title + '」' : ''].filter(Boolean).join(' + '))}</p>`;
    }
    h += '</div>';
    /* the phone messages stuck on the right */
    const ms = st.msgs.filter(e => (e.c | 0) === n || (n === 0 && !e.c)).slice(-3);
    h += `<aside class="q-dphone"><span class="q-dph">手机</span>${ms.length ? ms.map(e => { const m = D.msgs[e.m]; if (!m) return ''; const p = person(m.from); return `<div class="q-msg"><i class="q-av" style="background:${p.color || '#888'}">${esc(p.icon)}</i><div><b>${esc(p.name)}</b><span>${esc(m.text)}</span></div></div>`; }).join('') : '<p class="q-dim">还没有消息</p>'}</aside>`;
    h += '</div>';
    h += `<label class="q-quiet"><input type="checkbox" ${st.quiet ? 'checked' : ''}> 不显示操作提示（任务条和指南针照常显示）</label>`;
    return h;
  }
  function diaryMount(sec){
    const q = s => sec.querySelector(s);
    const flip = d => { const st = S(), curN = Math.min(st.ch, XQ.chapters.length), pages = [0].concat(XQ.chapters.filter(c => c.n <= curN).map(c => c.n)); view = pages[Math.max(0, Math.min(pages.length - 1, pages.indexOf(view) + d))]; XGuide.refresh(); };
    const p = q('.q-dprev'), n = q('.q-dnext');
    if (p) p.addEventListener('click', () => flip(-1));
    if (n) n.addEventListener('click', () => flip(1));
    const r = q('.q-replay'); if (r) r.addEventListener('click', () => { const ch = +r.dataset.ch || 0; XGuide.close(); setTimeout(() => ch ? XQ.replay(ch) : XQ.playIntro(true), 80); });
    sec.querySelectorAll('.q-more').forEach(b => b.addEventListener('click', () => XGuide.open ? (() => { const id = b.dataset.g, i = XGuide.pages.indexOf(id); if (i >= 0) XGuide.go(i); })() : 0));
    const cb = q('.q-quiet input'); if (cb) cb.addEventListener('change', () => { S().quiet = cb.checked; XQ.save(); barSync(); hintSync(true); });
  }
  /* the sticky notes: side jobs, grouped by who gave them */
  function notesBody(){
    const st = S(), rows = [];
    for (const id in D.npcs){
      const list = XQ.sidesOf(id); if (!list.length) continue;
      const n = D.npcs[id];
      rows.push(`<div class="q-note" style="--nc:${n.color || '#ffd24a'}"><b>${esc(n.name)}<small>${esc(n.place || '')}</small></b><ul>` + list.map(s => {
        const v = st.sides[s.id];
        return `<li class="${v === 'done' ? 'q-done' : v === 'open' ? '' : 'q-later'}"><span class="q-box">${v === 'done' ? '☑' : '☐'}</span>${esc(s.text)}${v ? '' : ' <em>（去找' + esc(n.short || n.name) + '接）</em>'}${s.rm && v !== 'done' ? ` <em class="q-rm">RM ${s.rm}</em>` : ''}</li>`;
      }).join('') + '</ul></div>');
    }
    return rows.length ? `<p class="gd-lead">做完一个人的那一章，他就会托你几件小事。头上有黄色「!」就是有新的，走过去说话就接下来了。</p><div class="q-notes">${rows.join('')}</div>`
      : '<p class="gd-lead">这里会贴支线任务：做完一个人的那一章，他会托你几件小事。现在还没有。</p>';
  }
  const notesArt = `<svg viewBox="0 0 240 120" aria-hidden="true"><g transform="rotate(-4 70 60)"><rect x="34" y="20" width="72" height="72" fill="#ffd24a"/><path d="M44 40 H96 M44 54 H90 M44 68 H94" stroke="#7a5a10" stroke-width="3" stroke-linecap="round" opacity=".6"/></g>
    <g transform="rotate(5 160 56)"><rect x="124" y="16" width="72" height="72" fill="#9fe0a8"/><path d="M134 36 H186 M134 50 H176 M134 64 H182" stroke="#2c6a36" stroke-width="3" stroke-linecap="round" opacity=".6"/></g><circle cx="70" cy="22" r="5" fill="var(--tile)"/><circle cx="160" cy="18" r="5" fill="#3f8fe6"/></svg>`;
  if (window.XGuide && XGuide.addPage){
    XGuide.addPage({id:'diary', t:'奶蛙日记', art:diaryArt, home:true, body:diaryBody, mount:diaryMount}, 0);
    XGuide.addPage({id:'notes', t:'便利贴 · 支线', art:notesArt, body:notesBody}, 1);
  }

  /* ================= every frame (from gx.frame in js/89-quest.js) ================= */
  let syncT = 0;
  function frame(dt, Tm){
    talkFrame();
    if (ring){
      const st = XQ.step(), a = mode === 'naiwa' && S().ph !== 'meet' && st && st.r !== 0 && !g(() => mission.on, false) ? stepAt(st) : null;
      ring.visible = !!a && !quiet();
      if (a){ const r = (st.r || 6) / 4.5; ring.position.set(a[0], g(() => groundAt(a[0], a[1]), 0) + .1, a[1]); ring.scale.set(r, 1 + Math.sin(Tm * 3) * .15, r); }
    }
    if ((syncT += dt) > .25){
      syncT = 0; barSync(); hintSync(false); phShow(); welcomeTry();
      if (g(() => XGuide.mapOn, false)) XQ.flag('map');
      if (g(() => XGuide.guideOn && XGuide.page >= 1, false)) XQ.flag('guide2');
    }
  }
  XQ.on('state', () => { barSync(); hintSync(true); if (g(() => XGuide.guideOn && XGuide.pageId === 'diary', false)) XGuide.refresh(); });
  XQ.on('diary', () => { if (g(() => XGuide.guideOn && (XGuide.pageId === 'diary'), false)) XGuide.refresh(); });

  /* first time in 奶娃 mode as a new player: one light hint about the diary, after the first talk */
  XQ.on('chapter', o => {
    if (!o.start || o.c.n !== 1 || g(() => localStorage.getItem('xmum-guide-tip'), '1')) return;
    try { localStorage.setItem('xmum-guide-tip', '1'); } catch(e){}
    setTimeout(() => g(() => toast(TOUCH ? '要做的事都写在日记里' : '按 P 看日记', TOUCH ? '点钱包下面那行「主线」打开' : '要做的事、操作说明都在里面 · M 打开大地图', 3600)), 2600);
  });

  /* ================= button guide: the step says which buttons to press (step.press, deepest first); the first one on screen
     glows and gets a small 「点这里」 label beside it. Runs while panels are open too (they pause the game), so it walks the
     player from the HUD button into the panel and on to the button inside. ================= */
  const point = el('div', 'q-point'); point.hidden = true; point.setAttribute('aria-hidden', 'true'); document.body.appendChild(point);
  let pressEl = null;
  const shown = e => { if (!e || e.hidden || e.disabled) return false; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false;
    for (let p = e; p && p !== document.body; p = p.parentElement){ if (p.hidden) return false; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  function pressSync(){
    const st = XQ.step(), list = st && st.press && !XQ.stepDone(st.id) && S().ph === 'steps' && mode === 'naiwa' && box.hidden && !g(() => XCine.busy, false) ? st.press : null;
    let tgt = null, label = '';
    if (list) for (const [sel, lab, only] of list){ if (only === 'touch' && !TOUCH) continue; const e = document.querySelector(sel); if (shown(e)){ tgt = e; label = lab; break; } }
    if (pressEl !== tgt){ if (pressEl) pressEl.classList.remove('q-flash'); pressEl = tgt; if (tgt){ tgt.classList.add('q-flash'); if (tgt.closest('.panel')) g(() => tgt.scrollIntoView({block:'nearest', inline:'nearest'})); } }
    if (!tgt){ point.hidden = true; return; }
    if (point.textContent !== label) point.textContent = label;
    point.hidden = false;
    const r = tgt.getBoundingClientRect(), pw = point.offsetWidth, ph = point.offsetHeight, vw = innerWidth;
    let x = r.left + r.width / 2 - pw / 2, y = r.top - ph - 10;
    if (y < 6){ y = r.bottom + 10; point.classList.add('below'); } else point.classList.remove('below');
    point.style.left = Math.max(6, Math.min(vw - pw - 6, x)) + 'px'; point.style.top = y + 'px';
  }
  setInterval(() => g(pressSync), 250);
  /* the tuning list: mark the parts that can be ordered right now (materials, blueprint and money all there), and the tabs holding one,
     so the guide can point at something that will actually start (js/93-tuning-ui.js decides the same things for its order button) */
  function tuneMark(){
    if (typeof tn === 'undefined' || !tn.on || typeof myCar === 'undefined' || !myCar) return;
    const kind = myCar.kind, fit = g(() => tnCar(kind).fit, {});
    const can = it => g(() => tnItemOk(kind, it) && tnBpOk(it) && !tnShort(it.need).length && money >= it.rm && !tnOwns(kind, it.key) && fit[it.slot] !== it.id && !tnJobOf(kind, it.key), false);
    document.querySelectorAll('#tune .tn-it[data-k]').forEach(b => { const it = TN.byKey[b.dataset.k]; b.classList.toggle('q-can', !!it && can(it)); });
    const tabs = new Set(); g(() => TN_SLOTS.forEach(s => { if (TN.bySlot[s.id].some(it => can(Object.assign({slot:s.id}, it)))) tabs.add(s.tab); }));
    document.querySelectorAll('#tuneTabs [data-tab]').forEach(b => b.classList.toggle('q-cantab', tabs.has(b.dataset.tab) && b.getAttribute('aria-selected') !== 'true'));
  }
  if (typeof tnRender === 'function'){ const base = tnRender; tnRender = function(){ const r = base.apply(this, arguments); g(tuneMark); return r; }; }
  { const st = document.createElement('style'); st.textContent = `
.q-point{position:fixed;z-index:80;max-width:min(260px,70vw);padding:6px 10px;border-radius:10px;background:#ffc21a;color:#3a2a00;font:700 13px/1.35 var(--body, sans-serif);
  box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;animation:qPoint 1.2s ease-in-out infinite}
.q-point::after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#ffc21a}
.q-point.below::after{bottom:auto;top:-6px;border-top:0;border-bottom:6px solid #ffc21a}
@keyframes qPoint{50%{transform:translateY(-3px)}}
@media (prefers-reduced-motion: reduce){ .q-point{animation:none} }`; document.head.appendChild(st); }

  /* ================= first visit to the car shop and to the tuning workshop: what this place is, in three lines ================= */
  const INTRO = {
    shop:{sel:'#shop', after:'.shop-h', title:'XMUM 车行能做什么',
      lines:['<b>买车</b>：挑一辆点「买下」，钱从钱包里扣。买过的车随时点「开出来 / 叫来修好」，车会开到你身边，顺便修好。',
        '<b>改装车间</b>、<b>喷漆店</b>：就是下面这排按钮。改装只给你自己的车：换轮毂、尾翼、涡轮……车会变快、变样子。',
        '<b>水枪工坊</b>：往下翻到底，花钱升级水枪的水量和射程，打保安、赶猴子都用得上。']},
    tune:{sel:'#tune', after:'.shop-h', title:'改装车间怎么用',
      lines:['<b>① 道具</b>：最上面一排是你的改装道具（轮毂坯件、赛车漆料、碳纤维板……）。送外卖、挑战拿牌、每天打卡都会掉。',
        '<b>② 下单施工</b>：下面选一个部位（轮毂、车身、尾翼……）、挑一个零件，点「下单施工」：花一点钱，用掉道具，零件进施工位。普通改装几十秒完工，越好的越久。',
        '<b>③ 提车</b>：完工后回到这里点「提车」，零件就装到车上了。可以先下单，去送几单外卖再回来提车。']}
  };
  function introShow(k){
    const I = INTRO[k], st = S(); if (!I || st.flags['intro_' + k]) return;
    const panel = document.querySelector(I.sel); if (!panel || panel.querySelector('.q-intro')) return;
    const box = el('div', 'q-intro'); box.setAttribute('role', 'note');
    box.innerHTML = `<b class="q-ih">${esc(I.title)}</b>` + I.lines.map(l => `<p>${l}</p>`).join('') + '<button type="button" class="btn">知道了</button>';
    box.querySelector('button').addEventListener('click', () => { XQ.flag('intro_' + k); box.remove(); g(() => ac()); });
    const after = panel.querySelector(I.after); if (after) after.after(box); else panel.prepend(box);
  }
  { const st = document.createElement('style'); st.textContent = `
.q-intro{margin:6px 0 10px;padding:10px 12px;border-radius:12px;background:rgba(255,210,58,.16);border:1px solid rgba(201,150,20,.4);font-size:13px;line-height:1.55;color:var(--ink)}
.q-intro .q-ih{display:block;font-size:14px;margin-bottom:4px}
.q-intro p{margin:2px 0}
.q-intro .btn{margin-top:6px;min-height:34px;padding:4px 14px}
#tune .q-intro{flex:none;max-height:none}
.q-intro{flex-shrink:0}`; document.head.appendChild(st); }
  if (typeof openShop === 'function'){ const base = openShop; openShop = function(){ const r = base.apply(this, arguments); g(() => introShow('shop')); return r; }; }
  if (typeof tnOpen === 'function'){ const base = tnOpen; tnOpen = function(){ const r = base.apply(this, arguments); g(() => { if (tn.on) introShow('tune'); }); return r; }; }

  XQ.ui = {say:sayUI, frame, card:cardShow, get talkOpen(){ return !box.hidden; }, end:talkEnd, next:talkNext};
})();
