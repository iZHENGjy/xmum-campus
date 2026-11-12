/* XMUM 校园漫游 · 大一收尾：第 8 章之后去 A3 大台阶，大家都在 → 过场 year1（js/89-cine.js）→「我的大一」回顾卡（能存图、能分享）
 *
 * 仓库主人：「奶娃，不要，大一收尾」。
 * 什么时候：主线八章都做完（XQuest.ph === 'done'），还没看过（flags.y1end）。任务条显示「尾声」（js/89-quest.js 的 yearStep），
 *   小满发消息叫你去；走路到 A3 台阶前 9 米内就开演（开着车先下车）。以后才做完第 8 章的、早就做完的存档都一样，只放一次。
 * 奖励：RM 88 + 称号「大一结业」，按 id 'y1end' 只发一次（平衡：小额、一次、刷不了）。
 * 回顾卡：从存档读——开学第几天、送了几单、总资产、车、章节、去过的地方、第一句和最后一句日记，画到一张 1080×1440 的图上：
 *   电脑「下载图片」；手机能「分享」（navigator.share 带文件，直接发微信、小红书）或长按图片保存。日记最后一章那页有「我的大一」能再看。
 * 对外：window.XYear = {card(), play(), stats(), image()}（测试用） */
'use strict';
(() => {
  if (!window.XQuest || !window.XQD) return;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const A3 = [105, 128];   /* the plaza in front of the A3 steps, where the film stands everyone */

  /* ---------- the trigger: on foot at the A3 steps, once ---------- */
  let busy = false;
  const due = () => XQuest.ready && XQuest.ph === 'done' && !XQuest.state.flags.y1end;
  function tick(){
    if (busy || !due() || mode !== 'naiwa' || XQuest.talking || g(() => XCine.busy, true) || g(() => gx.paused, true)
      || g(() => indoorNow(), false) || g(() => driving, null)) return;
    if (Math.hypot(nw.x - A3[0], nw.z - A3[1]) > 9) return;
    play();
  }
  function play(){
    busy = true;
    const done = () => { busy = false; finish(); };
    if (!(window.XCine && XCine.play && XCine.play('year1', {onDone:done}))) done();
  }
  function finish(){
    if (!XQuest.state.flags.y1end){
      XQuest.flag('y1end');
      g(() => XQuest.pay('y1end', {rm:88, title:'大一结业'}));
      g(() => XQuest.diaryAdd('y1_end', null, {c:XQD.chapters.length}));
      g(() => XQuest.save()); g(() => XQuest.emit && XQuest.emit('state'));
    }
    setTimeout(card, 350);
  }
  setInterval(tick, 500);

  /* ---------- what goes on the card ---------- */
  function stats(){
    const S = XQuest.state, Q = XQuest.Q, D = XQD;
    const lineOf = e => { let t = e.x || D.diary[e.s] || ''; if (e.v) t = t.replace(/\{(\w+)\}/g, (_, k) => e.v[k] != null ? e.v[k] : ''); return t.replace(/^（补记）/, ''); };
    const lived = S.diary.filter(e => !e.r && e.s !== 'intro' && e.s !== 'y1_end').map(lineOf).filter(Boolean);
    const lines = lived.length ? lived : S.diary.map(lineOf).filter(Boolean);
    const shop = g(() => SHOP, []);
    const cars = g(() => [...owned], []).map(k => (shop.find(s => s.kind === k) || {}).name).filter(Boolean);
    const d = id => !!S.done[id];
    const places = [
      ['KLIA 机场', d('c7_klia') || Q.ach('sukiya')],
      ['IOI 吃火锅', Q.ach('ioi1') || d('c8_suki')],
      ['夜市', d('c4_durian') || Q.best('pm_du')],
      ['嘛嘛档', d('c4_mamak')],
      ['麦当当', d('c4_dt') || g(() => Object.keys(mgSave.plays).some(k => /^mcd_/.test(k) && mgSave.plays[k] > 0), false)],
      ['KIP', d('c4_kip')],
      ['A3 图书馆', d('c3_study')],
      ['B1 游戏厅', d('c3_arcade')],
      ['卡丁车场', d('c5_seplap') || Q.best('kartLap') || Q.best('sepLap')],
      ['自己的家', Q.house() > 0]
    ].filter(p => p[1]).map(p => p[0]);
    return {
      name:String(g(() => XUI.playerName(), '') || '').slice(0, 16), day:g(() => XQuest.dayNo(), 1),
      deliv:Q.life('deliv'), worth:Math.round(Q.worth()), cars, places, cat:!!S.flags.q_cat,
      chs:D.chapters.filter(c => S.done[c.id + '_report']).length, of:D.chapters.length,
      first:lines[0] || '', last:lines[lines.length - 1] || '', title:S.title || ''
    };
  }

  /* ---------- the picture: 1080 × 1440, what you see is what you share ---------- */
  function image(){
    const s = stats(), W = 1080, H = 1440, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), css = getComputedStyle(document.body), FONT = css.fontFamily || 'sans-serif';
    const tile = (css.getPropertyValue('--tile') || '#c4522c').trim() || '#c4522c';
    const font = (w, px) => { c.font = `${w} ${px}px ${FONT}`; };
    const rr = (x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    /* wrap Chinese text by character (and English by width), at most n lines */
    const wrap = (t, x, y, maxW, lh, n) => {
      const out = []; let line = '';
      for (const ch of t){ if (c.measureText(line + ch).width > maxW && line){ out.push(line); line = ch; if (out.length === n) break; } else line += ch; }
      if (out.length < n && line) out.push(line);
      if (out.length === n && t.length > out.join('').length) out[n - 1] = out[n - 1].slice(0, -1) + '…';
      out.forEach((l, i) => c.fillText(l, x, y + i * lh)); return out.length * lh;
    };
    /* paper */
    c.fillStyle = '#fbf6ec'; c.fillRect(0, 0, W, H);
    c.fillStyle = tile; c.fillRect(0, 0, W, 16); c.fillRect(0, H - 16, W, 16);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    /* head */
    c.fillStyle = '#9a8f80'; font(700, 30); c.fillText('XMUM 校园漫游', 80, 104);
    c.fillStyle = '#1f2a33'; font(900, 108); c.fillText('我的大一', 76, 222);
    c.fillStyle = '#5b6670'; font(600, 34);
    c.fillText([s.name, `开学第 ${s.day} 天`, s.title ? '「' + s.title + '」' : ''].filter(Boolean).join(' · '), 80, 280);
    /* four tiles */
    const tiles = [['送出外卖', s.deliv.toLocaleString() + ' 单'], ['攒下的家底', 'RM ' + s.worth.toLocaleString()],
      ['我的车', s.cars.length ? s.cars.length + ' 辆' : '还没有'], ['主线', `${s.chs} / ${s.of} 章`]];
    tiles.forEach(([k, v], i) => {
      const x = 80 + (i % 2) * 470, y = 316 + Math.floor(i / 2) * 168;
      c.fillStyle = '#ffffff'; rr(x, y, 450, 150, 22); c.fill(); c.strokeStyle = '#eadfcd'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#9a8f80'; font(700, 28); c.fillText(k, x + 30, y + 50);
      c.fillStyle = '#1f2a33'; font(900, 56); c.fillText(v, x + 30, y + 118);
    });
    let y = 688;
    if (s.cars.length){ c.fillStyle = '#5b6670'; font(600, 30); wrap('车库里：' + s.cars.slice(0, 4).join('、') + (s.cars.length > 4 ? ' 等' : ''), 80, y, 920, 42, 1); y += 52; }
    /* places: at most two rows of chips */
    c.fillStyle = '#9a8f80'; font(700, 28); c.fillText('去过的地方', 80, y + 20); y += 40;
    font(700, 30); let x = 80, rows = 1;
    for (const p of (s.places.length ? s.places : ['学校']).concat(s.cat ? ['喂过小橘 🐱'] : [])){
      const w = c.measureText(p).width + 40; if (x + w > W - 80){ if (rows === 2) break; x = 80; y += 60; rows++; }
      c.fillStyle = '#fff1dc'; rr(x, y, w, 48, 24); c.fill(); c.fillStyle = '#8a5a1c'; c.fillText(p, x + 20, y + 34); x += w + 12;
    }
    y += 100;
    /* the first and the last diary line; the second only if it fits above the foot */
    const FOOT = H - 210;
    const quote = (k, t) => {
      if (!t || y + 112 > FOOT) return;
      c.fillStyle = '#9a8f80'; font(700, 26); c.fillText(k, 80, y); y += 16;
      c.fillStyle = tile; c.fillRect(80, y, 6, 92);
      c.fillStyle = '#2d3640'; font(600, 32); wrap(t, 106, y + 36, 890, 46, 2); y += 92 + 34;
    };
    quote('日记第一句', s.first); quote('日记最后一句', s.last !== s.first ? s.last : '');
    /* foot */
    c.fillStyle = '#eadfcd'; c.fillRect(80, FOOT + 20, W - 160, 3);
    c.fillStyle = tile; font(900, 64); c.textAlign = 'center'; c.fillText('大二见 👋', W / 2, H - 98);
    c.fillStyle = '#9a8f80'; font(600, 26); c.fillText('izhengjy.github.io/xmum-campus · #XMUM校园漫游', W / 2, H - 46);
    return cv;
  }

  /* ---------- the card on screen ---------- */
  const st = document.createElement('style'); st.textContent = `
#yrCard{position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;background:rgba(10,14,20,.6);padding:12px;box-sizing:border-box}
#yrCard[hidden]{display:none}
#yrCard .yr-box{background:var(--panel-solid,#fff);border-radius:18px;padding:12px 12px 14px;width:min(440px,100%);max-height:100%;display:flex;flex-direction:column;gap:10px;box-shadow:0 18px 50px rgba(0,0,0,.35);box-sizing:border-box}
#yrCard img{display:block;width:100%;min-height:0;flex:1 1 auto;object-fit:contain;border-radius:10px;background:#fbf6ec}
#yrCard p{margin:0;font-size:13px;color:var(--muted,#667);text-align:center}
#yrCard .yr-b{display:flex;gap:8px}
#yrCard .yr-b .btn{flex:1;min-height:44px}`;
  document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'yrCard'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '我的大一');
  box.innerHTML = `<div class="yr-box"><img alt="我的大一"><p></p><div class="yr-b"><button type="button" class="btn primary" data-a="share" hidden>分享</button>
    <button type="button" class="btn primary" data-a="save"></button><button type="button" class="btn" data-a="close">关闭</button></div></div>`;
  document.body.appendChild(box);
  let file = null, url = '', wasPaused = false;
  function card(){
    const cv = image(); url = cv.toDataURL('image/jpeg', .9); file = null;
    box.querySelector('img').src = url;
    box.querySelector('p').textContent = TOUCH ? '长按图片也能保存 · 发朋友圈、小红书记得带上 #XMUM校园漫游' : '发朋友圈、小红书记得带上 #XMUM校园漫游';
    box.querySelector('[data-a="save"]').textContent = TOUCH ? '保存' : '下载图片';
    const sb = box.querySelector('[data-a="share"]'); sb.hidden = true;
    cv.toBlob(b => {
      if (!b) return; file = new File([b], 'xmum-my-year1.jpg', {type:'image/jpeg'});
      try { if (navigator.canShare && navigator.canShare({files:[file]})) sb.hidden = false; } catch(e){}
    }, 'image/jpeg', .9);
    if (box.hidden){ wasPaused = !!g(() => gx.paused, false); g(() => { gx.paused = true; }); }
    box.hidden = false; g(() => box.querySelector('[data-a="close"]').focus({preventScroll:true}));
    g(() => tone('triangle', 784, 1046, .3, .1));
  }
  function close(){
    if (box.hidden) return; box.hidden = true;
    g(() => { gx.paused = wasPaused; }); g(() => canvas.focus({preventScroll:true}));
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b){ if (e.target === box) close(); return; }
    if (b.dataset.a === 'close') close();
    else if (b.dataset.a === 'save'){ const a = document.createElement('a'); a.href = file ? URL.createObjectURL(file) : url; a.download = 'xmum-my-year1.jpg'; document.body.appendChild(a); a.click(); a.remove(); if (file) setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    else if (b.dataset.a === 'share' && file) navigator.share({files:[file], title:'我的大一 · XMUM 校园漫游', text:'我的大一 #XMUM校园漫游'}).catch(() => {});
  });
  box.addEventListener('pointerdown', e => e.stopPropagation());
  window.addEventListener('keydown', e => { if (box.hidden) return; if (e.code === 'Escape' || e.code === 'KeyF'){ e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);

  window.XYear = {card, play, stats, image};
})();
