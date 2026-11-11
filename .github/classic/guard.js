/* Injected first into every page under /v1/ (the classic v1.0 game) by .github/workflows/pages.yml.
 * /v1/ is served from the same origin as the live game, and v1.0 only knows its own fields: if it saved over the
 * live save it would drop everything newer (new upgrades, achievements, tuning). So the classic game keeps its own
 * save under a "xmum-classic:" prefix. The first time it opens, it starts from a copy of the player's current
 * progress (every xmum-* key of the live game); after that the two saves are separate. It plays offline. */
(() => {
  'use strict';
  let real; try { real = window.localStorage; } catch(e){ return; }
  const P = 'xmum-classic:', SEEDED = P + '__seeded';
  try {
    if (!real.getItem(SEEDED)){
      const live = [];
      for (let i = 0; i < real.length; i++){ const k = real.key(i); if (k && k.startsWith('xmum-') && !k.startsWith('xmum-preview:') && !k.startsWith(P)) live.push(k); }
      for (const k of live) real.setItem(P + k, real.getItem(k));
      real.setItem(SEEDED, String(Date.now()));
    }
  } catch(e){}
  const keys = () => { const out = []; for (let i = 0; i < real.length; i++){ const k = real.key(i); if (k && k.startsWith(P) && k !== SEEDED) out.push(k.slice(P.length)); } return out; };
  const shim = {
    getItem: k => real.getItem(P + k),
    setItem: (k, v) => real.setItem(P + k, String(v)),
    removeItem: k => real.removeItem(P + k),
    clear: () => keys().forEach(k => real.removeItem(P + k)),
    key: i => { const k = keys()[i]; return k === undefined ? null : k; },
    get length(){ return keys().length; }
  };
  Object.defineProperty(window, 'localStorage', {value:shim, configurable:true});
  window.XMUM_CLASSIC = true;
  const tag = () => {
    const el = document.createElement('a');
    el.href = '../'; el.textContent = '经典版 v1.0 · 单机 · 存档和新版分开 · 回到新版 →';
    el.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:99;padding:2px 10px;border-radius:999px;background:#5b4a2e;color:#fff;font:600 11px/1.6 system-ui,sans-serif;text-decoration:none;opacity:.88';
    document.body.appendChild(el);
  };
  if (document.body) tag(); else document.addEventListener('DOMContentLoaded', tag);
})();
