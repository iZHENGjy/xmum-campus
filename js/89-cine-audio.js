/* XMUM 校园漫游 · 过场的配乐、环境音和「说话声」
 *
 * 仓库主人：「剧情的视频没有配音配乐」。游戏里没有音频文件，全部用 Web Audio 现场合成（和电台 js/95-radio.js 一个思路），
 * 走 js/20-fx.js 的同一个 AudioContext：ac() 在声音关掉时返回 null，所以标题页的声音开关一关，这里就不出声。手机上音量减半。
 *
 * 配乐：每段过场一种心情，和弦进行 + 电钢琴 / 贝斯 / 轻鼓，循环到过场结束，淡出。
 *   开场 intro：路上的期待（C G Am F，琶音）· 生日 birthday：轻快（F C Dm G，反拍和弦 + 沙锤）
 *   比赛 f1：带劲（Am F C G，八分贝斯 + 底鼓）· 自习 library：安静（Dmaj7 Bm7 Gmaj7 A，稀疏）
 *   结尾 ending / 大一收尾 year1：主题（Cmaj7 Am7 Fmaj7 G7，加一句旋律）· 想家 home：一个铺底和弦
 * 环境音：按过场和镜头换：机舱的嗡嗡声、降落的风声、到达大厅的人声和「叮咚」、校巴的发动机、校园的鸟叫、
 *   夜里的虫鸣、火锅咕嘟、看台的人群、图书馆的钟声、傍晚的蝉。
 * 说话声：不配音（做不了也不用 TTS），每个角色一个音高，对话框逐字打出来时「叽叽咕咕」（动森那样）；过场字幕整句出来时按字数响一串。
 *   日记里能关（localStorage xmum-voice = '0'）。
 * 对外：window.XCineAudio = {mood(id), amb(name), stop(), state}（测试用），window.XVoice = {type(who, text, from, to), line(who, text), on, set(v)} */
'use strict';
(() => {
  if (typeof ac !== 'function') return;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch(e){ return d; } };
  const PHONE = typeof TOUCH !== 'undefined' && TOUCH;
  const LEVEL = PHONE ? .5 : 1;            /* phones: half as loud */
  const MUSIC = .32 * LEVEL, AMB = .55 * LEVEL;
  const N = n => 440 * Math.pow(2, (n - 69) / 12);

  /* ---------- the bus: music and ambience each into their own gain, both into a gentle compressor ---------- */
  let A = null, mBus = null, aBus = null, nz = null;
  function bus(){
    const a = ac(); if (!a) return null;
    if (A !== a){
      A = a; const comp = a.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.connect(a.destination);
      mBus = a.createGain(); mBus.gain.value = 0; mBus.connect(comp);
      aBus = a.createGain(); aBus.gain.value = 0; aBus.connect(comp);
      nz = typeof loopNoise === 'function' ? {w:loopNoise(a, 2, false), p:loopNoise(a, 2, true)} : null;
    }
    return a;
  }
  const fadeTo = (G, v, s) => { if (!G || !A) return; const t = A.currentTime; G.gain.cancelScheduledValues(t); G.gain.setValueAtTime(G.gain.value, t); G.gain.linearRampToValueAtTime(v, t + (s || 1)); };

  /* ---------- instruments ---------- */
  function ep(note, t, dur, vol){   /* a soft electric piano: sine + a quiet octave, fast attack, long decay */
    const a = A, f = N(note), o1 = a.createOscillator(), o2 = a.createOscillator(), gg = a.createGain();
    o1.type = 'sine'; o2.type = 'triangle'; o1.frequency.value = f; o2.frequency.value = f * 2; o2.detune.value = 4;
    const g2 = a.createGain(); g2.gain.value = .18;
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(vol, t + .012); gg.gain.exponentialRampToValueAtTime(vol * .35, t + .35); gg.gain.exponentialRampToValueAtTime(.0005, t + dur + .4);
    o1.connect(gg); o2.connect(g2).connect(gg); gg.connect(mBus);
    o1.start(t); o2.start(t); o1.stop(t + dur + .45); o2.stop(t + dur + .45);
  }
  function bass(note, t, dur, vol){
    const a = A, o = a.createOscillator(), f = a.createBiquadFilter(), gg = a.createGain();
    o.type = 'triangle'; o.frequency.value = N(note); f.type = 'lowpass'; f.frequency.value = 420;
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(vol, t + .02); gg.gain.exponentialRampToValueAtTime(.0005, t + dur);
    o.connect(f).connect(gg).connect(mBus); o.start(t); o.stop(t + dur + .05);
  }
  function pad(notes, t, dur, vol){
    const a = A, f = a.createBiquadFilter(), gg = a.createGain(); f.type = 'lowpass'; f.frequency.value = 900;
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(vol, t + dur * .35); gg.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(gg).connect(mBus);
    for (const n of notes){ const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = N(n); o.detune.value = (Math.random() - .5) * 10; o.connect(f); o.start(t); o.stop(t + dur + .05); }
  }
  function kick(t, vol){
    const a = A, o = a.createOscillator(), gg = a.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .14);
    gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(.0005, t + .2); o.connect(gg).connect(mBus); o.start(t); o.stop(t + .22);
  }
  function hat(t, vol, len){
    if (!nz) return; const a = A, s = a.createBufferSource(), f = a.createBiquadFilter(), gg = a.createGain();
    s.buffer = nz.w; f.type = 'highpass'; f.frequency.value = 7000;
    gg.gain.setValueAtTime(vol, t); gg.gain.exponentialRampToValueAtTime(.0005, t + (len || .05)); s.connect(f).connect(gg).connect(mBus); s.start(t, Math.random()); s.stop(t + (len || .05) + .02);
  }

  /* ---------- the moods ---------- */
  const MOODS = {
    journey:{bpm:84, style:'arp', prog:[[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], bass:[48, 43, 45, 41]},
    party:{bpm:100, style:'bounce', prog:[[65, 69, 72], [60, 64, 67], [62, 65, 69], [67, 71, 74]], bass:[41, 36, 38, 43]},
    race:{bpm:124, style:'drive', prog:[[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], bass:[45, 41, 48, 43]},
    study:{bpm:64, style:'sparse', prog:[[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]], bass:[50, 47, 43, 45]},
    theme:{bpm:72, style:'arp', prog:[[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], bass:[48, 45, 41, 43],
      mel:[76, 0, 74, 72, 74, 0, 67, 0, 72, 0, 71, 69, 71, 0, 67, 0]},
    home:{bpm:56, style:'pad', prog:[[57, 60, 64, 67], [53, 57, 60, 64]], bass:[45, 41]}
  };
  const FILM = {intro:'journey', ending:'theme', birthday:'party', f1:'race', library:'study', year1:'theme'};
  const M = {mood:null, beat:0, next:0, tick:null};
  function playBeat(md, b, t){
    const spb = 60 / md.bpm, bar = Math.floor(b / 4), k = b % 4, ch = md.prog[bar % md.prog.length], bn = md.bass[bar % md.bass.length];
    if (md.style === 'arp'){
      ep(ch[(k * 2) % ch.length], t, spb * .9, .07); ep(ch[(k * 2 + 1) % ch.length] + (k === 3 ? 12 : 0), t + spb / 2, spb * .9, .055);
      if (k === 0 || k === 2) bass(bn, t, spb * 1.8, .16);
      if (md.mel){ const m = md.mel[(b * 1) % md.mel.length]; if (m) ep(m, t, spb * 1.2, .06); }
    } else if (md.style === 'bounce'){
      bass(k % 2 ? bn + 7 : bn, t, spb * .8, .16); if (k === 0 || k === 2) kick(t, .14); hat(t + spb / 2, .03); hat(t, .015);
      for (const n of ch) ep(n, t + spb / 2, spb * .35, .035);
    } else if (md.style === 'drive'){
      kick(t, .18); bass(bn, t, spb * .45, .16); bass(bn, t + spb / 2, spb * .45, .13);
      for (let i = 0; i < 4; i++) hat(t + spb * i / 4, i % 2 ? .012 : .02);
      if (k === 0) for (const n of ch) ep(n + 12, t, spb * 1.5, .03);
      if (k === 0 && bar % 2 === 0) pad(ch, t, spb * 8, .018);
    } else if (md.style === 'sparse'){
      if (k === 0){ pad(ch, t, spb * 4.2, .02); bass(bn, t, spb * 3.5, .1); }
      ep(ch[(b * 3) % ch.length] + 12, t + spb * .1, spb * 1.5, .04);
    } else {   /* pad */
      if (k === 0){ pad(ch, t, spb * 4.4, .03); bass(bn, t, spb * 4, .08); }
    }
  }
  function mood(id){
    const md = MOODS[id] || null; if (M.mood === md) return;
    M.mood = md; if (!md){ fadeTo(mBus, 0, 1.4); return; }
    if (!bus()) return;
    M.beat = 0; M.next = A.currentTime + .15; fadeTo(mBus, MUSIC, 1.6);
  }
  function musicTick(){
    if (!M.mood || !A || A.state !== 'running') return;
    const md = M.mood, spb = 60 / md.bpm;
    while (M.next < A.currentTime + .35){ g(() => playBeat(md, M.beat, M.next)); M.beat++; M.next += spb; }
  }

  /* ---------- ambience: loops (filtered noise) plus little events (birds, chimes, ticks, pops) ---------- */
  const AM = {name:null, loops:[], left:0};
  function loop(buf, type, freq, q, vol){
    const a = A, s = a.createBufferSource(), f = a.createBiquadFilter(), gg = a.createGain();
    s.buffer = buf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q || .7; gg.gain.value = vol;
    s.connect(f).connect(gg).connect(aBus); s.start(A.currentTime + .02, Math.random() * 1.5); AM.loops.push(s); return gg;
  }
  function chirp(t){
    const a = A, n = 2 + (Math.random() * 4 | 0), f0 = 2400 + Math.random() * 1600, p = a.createStereoPanner ? a.createStereoPanner() : null;
    if (p){ p.pan.value = Math.random() * 1.6 - .8; p.connect(aBus); }
    for (let i = 0; i < n; i++){
      const o = a.createOscillator(), gg = a.createGain(), ti = t + i * (.07 + Math.random() * .04);
      o.type = 'sine'; o.frequency.setValueAtTime(f0 * (1 + Math.random() * .1), ti); o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * .3), ti + .05);
      gg.gain.setValueAtTime(0, ti); gg.gain.linearRampToValueAtTime(.03, ti + .008); gg.gain.exponentialRampToValueAtTime(.0005, ti + .06);
      o.connect(gg).connect(p || aBus); o.start(ti); o.stop(ti + .08);
    }
  }
  function chime(t){ for (const [f, d] of [[659, 0], [523, .45]]){ const o = A.createOscillator(), gg = A.createGain(); o.type = 'sine'; o.frequency.value = f;
    gg.gain.setValueAtTime(0, t + d); gg.gain.linearRampToValueAtTime(.05, t + d + .02); gg.gain.exponentialRampToValueAtTime(.0005, t + d + 1.2); o.connect(gg).connect(aBus); o.start(t + d); o.stop(t + d + 1.3); } }
  function click(t, f, v){ const o = A.createOscillator(), gg = A.createGain(); o.type = 'square'; o.frequency.value = f; gg.gain.setValueAtTime(v, t); gg.gain.exponentialRampToValueAtTime(.0005, t + .025); o.connect(gg).connect(aBus); o.start(t); o.stop(t + .03); }
  function pop(t){ if (!nz) return; const s = A.createBufferSource(), f = A.createBiquadFilter(), gg = A.createGain(); s.buffer = nz.w; f.type = 'bandpass'; f.frequency.value = 280 + Math.random() * 380; f.Q.value = 6;
    gg.gain.setValueAtTime(.12, t); gg.gain.exponentialRampToValueAtTime(.0005, t + .07); s.connect(f).connect(gg).connect(aBus); s.start(t, Math.random()); s.stop(t + .08); }
  function cricket(t){   /* a chirp of 5–8 tiny pulses */
    const f = 4300 + Math.random() * 500, n = 5 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++){ const ti = t + i * .035, o = A.createOscillator(), gg = A.createGain(); o.type = 'sine'; o.frequency.value = f;
      gg.gain.setValueAtTime(0, ti); gg.gain.linearRampToValueAtTime(.012, ti + .004); gg.gain.exponentialRampToValueAtTime(.0005, ti + .025); o.connect(gg).connect(aBus); o.start(ti); o.stop(ti + .03); }
  }
  const AMBS = {
    cabin:{loops:[['p', 'lowpass', 160, .7, .5], ['w', 'bandpass', 500, .6, .02]]},
    wind:{loops:[['p', 'bandpass', 600, .5, .22], ['p', 'lowpass', 140, .7, .35]]},
    hall:{loops:[['p', 'bandpass', 480, 1.1, .12]], ev:[[9, 14, chime]]},
    bus:{loops:[['p', 'lowpass', 110, .8, .45], ['p', 'bandpass', 900, .8, .015]]},
    birds:{loops:[['p', 'bandpass', 700, .4, .03]], ev:[[.8, 3, chirp]]},
    night:{loops:[['p', 'lowpass', 300, .6, .04]], ev:[[.5, 1.6, cricket]]},
    room:{loops:[['p', 'lowpass', 220, .7, .05]], ev:[[.15, .55, pop]]},
    crowd:{loops:[['p', 'bandpass', 900, .9, .14], ['p', 'lowpass', 200, .7, .1]]},
    library:{loops:[['p', 'lowpass', 400, .5, .02]], ev:[[1, 1, t => click(t, 2100, .02)]]},
    evening:{loops:[['w', 'bandpass', 4600, 3, .015]], ev:[[1.5, 4, chirp], [.7, 2, cricket]]}
  };
  /* film → the ambience of each shot (by shot index; the last one carries on) */
  const SHOTS = {intro:['cabin', 'cabin', 'wind', 'hall', 'bus', 'birds'], ending:['hall', 'bus', 'birds'], birthday:['night', 'room'],
    f1:['crowd'], library:['library'], year1:['evening']};
  function amb(name){
    if (AM.name === name) return;
    AM.name = name;
    const old = AM.loops; AM.loops = []; if (A){ const t = A.currentTime; for (const s of old) try { s.stop(t + 1.2); } catch(e){} }
    const def = AMBS[name]; if (!def){ fadeTo(aBus, 0, 1.2); return; }
    if (!bus() || !nz) return;
    for (const [b, type, f, q, v] of def.loops) loop(b === 'p' ? nz.p : nz.w, type, f, q, v);
    AM.ev = (def.ev || []).map(([lo, hi, fn]) => ({lo, hi, fn, at:A.currentTime + lo * Math.random()}));
    fadeTo(aBus, AMB, 1.2);
  }
  function ambTick(){
    if (!AM.name || !A || A.state !== 'running' || !AM.ev) return;
    for (const e of AM.ev) while (e.at < A.currentTime + .3){ g(() => e.fn(Math.max(e.at, A.currentTime))); e.at += e.lo + Math.random() * (e.hi - e.lo); }
  }
  function stop(){ mood(null); amb(null); }

  /* ---------- follow the films ---------- */
  setInterval(() => {
    if (typeof soundOn !== 'undefined' && !soundOn){ if (M.mood || AM.name) stop(); return; }
    const st = g(() => window.XCine && XCine.state, null);
    if (!st || !st.on){ if (M.mood || AM.name) stop(); return; }
    if (st.kind === 'home'){ mood('home'); amb(null); }
    else if (st.kind === 'film'){
      mood(FILM[st.id] || 'journey');
      const list = SHOTS[st.id] || [];
      amb(list.length ? list[Math.max(0, Math.min(list.length - 1, st.shot | 0))] : null);
    }
    musicTick(); ambTick();
  }, 120);

  /* ---------- 说话声: a pitch per character, a blip every other letter as the line types out ---------- */
  const VOICE = {xiaoman:640, juanjuan:600, aming:430, laozhou:290, ben:250, lim:340, rose:520, durian:360, kumar:320, adi:470, adou:560, mom:540, me:480, cat:900};
  const key = 'xmum-voice';
  let vOn = g(() => localStorage.getItem(key) !== '0', true), lastB = 0;
  const idOf = who => { if (VOICE[who]) return who; const P = g(() => XQD.people, {}), Nn = g(() => XQD.npcs, {});
    for (const id in P) if (P[id].name === who) return id; for (const id in Nn) if (Nn[id].name === who || Nn[id].short === who) return id; return who === '我' ? 'me' : ''; };
  function blip(id, ch, t){
    const a = A, base = VOICE[id]; if (!base) return;
    const h = ((ch || 'a').codePointAt(0) * 2654435761) >>> 0, f = base * (.88 + (h % 1000) / 1000 * .3);
    const o = a.createOscillator(), fl = a.createBiquadFilter(), gg = a.createGain();
    o.type = id === 'cat' ? 'sine' : 'square'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (id === 'cat' ? 1.4 : .92), t + .05);
    fl.type = 'lowpass'; fl.frequency.value = 1700; const v = .035 * LEVEL;
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(v, t + .006); gg.gain.exponentialRampToValueAtTime(.0005, t + .05);
    o.connect(fl).connect(gg).connect(A.destination); o.start(t); o.stop(t + .06);
  }
  const quiet = c => /[\s，。！？、；：…—「」『』（）,.!?;:'"()\-~～]/.test(c);
  window.XVoice = {
    get on(){ return vOn; },
    set(v){ vOn = !!v; g(() => localStorage.setItem(key, vOn ? '1' : '0')); },
    /* the dialog box typed text[from..to): one blip per two letters, never closer than 50 ms */
    type(who, text, from, to){
      if (!vOn || !bus()) return; const id = idOf(who); if (!id || id === 'memo') return;
      const now = performance.now(); if (now - lastB < 50) return;
      for (let i = from; i < to; i++){ const c = text[i]; if (c && !quiet(c) && i % 2 === 0){ lastB = now; blip(id, c, A.currentTime); return; } }
    },
    /* a whole subtitle at once (the films): a short run, about one blip per two letters, at most 12 */
    line(who, text){
      if (!vOn || !bus()) return; const id = idOf(who); if (!id) return;
      const cs = [...String(text)].filter(c => !quiet(c)); const n = Math.min(12, Math.ceil(cs.length / 2));
      for (let i = 0; i < n; i++) blip(id, cs[i * 2], A.currentTime + .03 + i * .065);
    }
  };
  /* the films' subtitles: <b>who</b> text, written by js/89-cine.js sub() */
  { const sub = document.getElementById('cine-sub');
    if (sub && typeof MutationObserver === 'function') new MutationObserver(() => {
      const b = sub.querySelector('b'); if (!b || !sub.classList.contains('on')) return;
      const text = [...sub.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      XVoice.line(b.textContent, text);
    }).observe(sub, {childList:true}); }

  window.XCineAudio = {mood, amb, stop, get state(){ return {mood:Object.keys(MOODS).find(k => MOODS[k] === M.mood) || null, amb:AM.name, ctx:A && A.state}; }};
})();
