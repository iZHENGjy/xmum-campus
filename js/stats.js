/* Anonymous play statistics for the README charts (scripts/stats_charts.py reads them hourly).
 *
 * What is recorded, per anonymous Firebase uid (the same id the leaderboards already use):
 *   /stats/p/{uid} = {f: first day, l: last day, s: total seconds, m: {mode: seconds}, d: 'm'|'t'|'d'}
 *   /stats/d/{day}/{uid} = seconds played that day            (day = YYYY-MM-DD, Malaysia time)
 *   /stats/h/{day}/{hh}/{uid} = seconds played in that clock hour (hh = 00–23, Malaysia time), for the
 *                               "what time of day do people play" chart on stats.html
 * Nothing else: no nickname, no e-mail, no position, no scores.
 *
 * Only time with the page visible and someone actually touching it counts: after IDLE_S
 * seconds with no key or finger held down and no key, click, touch, pointer move or wheel, the clock stops (a tab left open on the
 * auto-rotating campus is not "playing"). Only the live site counts, so local testing and
 * forks don't pollute the numbers. Any failure is silent; the game never waits on this.
 */
'use strict';
(() => {
  const LIVE_HOST = 'izhengjy.github.io';
  if (location.hostname !== LIVE_HOST || !window.XNet) return;
  const FIRST_FLUSH_S = 15, FLUSH_S = 60, IDLE_S = 180, MAX_DELTA = 600;   // rules allow +900 s per write
  const MODES = ['naiwa', 'hole', 'walk', 'orbit', 'menu'];

  const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);   // UTC+8
  const hourKey = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 13);   // 'YYYY-MM-DDTHH', UTC+8
  const device = (() => {
    const ua = navigator.userAgent, touch = navigator.maxTouchPoints > 0;
    if (/iPhone|iPod/.test(ua) || /Android.*Mobile/.test(ua)) return 'm';
    if (/iPad|Android/.test(ua) || (/Macintosh/.test(ua) && touch)) return 't';
    return touch && Math.min(screen.width, screen.height) < 600 ? 'm' : 'd';
  })();
  const mode = () => {
    if (document.body.classList.contains('titled')) return 'menu';
    const m = document.body.dataset.mode; return MODES.includes(m) ? m : 'menu';
  };

  /* ---------- counting (runs offline too; flushed once XNet is online) ---------- */
  const pend = {s:0, m:{}, h:{}};           // seconds not yet written (h: per 'YYYY-MM-DDTHH')
  let hOff = false;                         // the database refused /stats/h (rules not published yet): stop trying this visit
  let lastInput = performance.now(), lastTick = performance.now(), sinceFlush = 0, flushedOnce = false, busy = false;
  const poke = () => { lastInput = performance.now(); };
  /* A held key or finger is input too: a phone player can hold the joystick still at full
     throttle for minutes without a new event, and that is still playing. */
  const heldKeys = new Set(), heldPtrs = new Set(), opt = {passive:true, capture:true};
  window.addEventListener('keydown', e => { heldKeys.add(e.code); poke(); }, opt);
  window.addEventListener('keyup', e => { heldKeys.delete(e.code); poke(); }, opt);
  window.addEventListener('pointerdown', e => { heldPtrs.add(e.pointerId); poke(); }, opt);
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, e => { heldPtrs.delete(e.pointerId); poke(); }, opt);
  for (const ev of ['pointermove', 'touchstart', 'touchmove', 'wheel']) window.addEventListener(ev, poke, opt);
  const letGo = () => { heldKeys.clear(); heldPtrs.clear(); };   // a key-up can be lost when the window loses focus
  window.addEventListener('blur', letGo);
  const active = now => heldKeys.size > 0 || heldPtrs.size > 0 || now - lastInput <= IDLE_S * 1000;

  function tick(){
    const now = performance.now(), dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    if (document.visibilityState !== 'visible' || !active(now)) return;
    const m = mode();
    pend.s += dt; pend.m[m] = (pend.m[m] || 0) + dt; sinceFlush += dt;
    if (!hOff){ const k = hourKey(); pend.h[k] = (pend.h[k] || 0) + dt; }
    if (sinceFlush >= (flushedOnce ? FLUSH_S : FIRST_FLUSH_S)) flush();
  }

  /* ---------- writing ---------- */
  async function flush(){
    if (busy || !XNet.online || !XNet.uid || pend.s < 1 || !window.firebase) return;
    busy = true;
    const add = Math.min(MAX_DELTA, Math.floor(pend.s)), scale = add / pend.s, today = day();
    const addM = {};
    for (const k in pend.m){ const v = Math.floor(pend.m[k] * scale); if (v > 0) addM[k] = v; }
    try {
      const db = firebase.database(), uid = XNet.uid;
      const rp = await db.ref('stats/p/' + uid).transaction(cur => {
        cur = cur && typeof cur === 'object' ? cur : {f:today, s:0, m:{}};
        cur.l = today; cur.d = device; cur.s = (+cur.s || 0) + add; cur.m = cur.m || {};
        for (const k in addM) cur.m[k] = (+cur.m[k] || 0) + addM[k];
        return cur;
      }, undefined, false);
      if (!rp.committed) throw new Error('stats/p not committed');
      await db.ref('stats/d/' + today + '/' + uid).transaction(cur => (+cur || 0) + add, undefined, false);
      /* only now take the written seconds off the pending pile */
      pend.s = Math.max(0, pend.s - add);
      for (const k in addM) pend.m[k] = Math.max(0, (pend.m[k] || 0) - addM[k]);
      sinceFlush = 0; flushedOnce = true;
      /* the hour chart: separate and best-effort, so it can never hold up the numbers above */
      if (!hOff) for (const k of Object.keys(pend.h)){
        const v = Math.min(MAX_DELTA, Math.floor(pend.h[k] * scale));
        if (v < 1){ if (k !== hourKey()) delete pend.h[k]; continue; }
        try {
          await db.ref('stats/h/' + k.slice(0, 10) + '/' + k.slice(11, 13) + '/' + uid).transaction(cur => Math.min(3600, (+cur || 0) + v), undefined, false);
          pend.h[k] = Math.max(0, pend.h[k] - v); if (pend.h[k] < 1 && k !== hourKey()) delete pend.h[k];
        } catch(e){ hOff = true; pend.h = {}; break; }
      }
    } catch(e){
      sinceFlush = FLUSH_S / 2;           // try again in about half a minute
    } finally { busy = false; }
  }

  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { tick(); if (document.visibilityState === 'hidden'){ letGo(); flush(); } });
  window.addEventListener('pagehide', () => { tick(); flush(); });
})();
