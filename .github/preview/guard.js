/* Injected first into every page under /preview/ by .github/workflows/pages.yml (never into the live site).
 * The preview is served from the same origin as the live game (izhengjy.github.io), so without this
 * a tester's preview progress would overwrite their real save. Every localStorage key the preview
 * touches gets a "xmum-preview:" prefix instead; the live game never sees them. */
(() => {
  'use strict';
  let real; try { real = window.localStorage; } catch(e){ return; }
  const P = 'xmum-preview:';
  const keys = () => { const out = []; for (let i = 0; i < real.length; i++){ const k = real.key(i); if (k && k.startsWith(P)) out.push(k.slice(P.length)); } return out; };
  const shim = {
    getItem: k => real.getItem(P + k),
    setItem: (k, v) => real.setItem(P + k, String(v)),
    removeItem: k => real.removeItem(P + k),
    clear: () => keys().forEach(k => real.removeItem(P + k)),
    key: i => { const k = keys()[i]; return k === undefined ? null : k; },
    get length(){ return keys().length; }
  };
  Object.defineProperty(window, 'localStorage', {value:shim, configurable:true});
  window.XMUM_PREVIEW = true;
  /* a small tag so nobody mistakes the preview for the live game */
  const tag = () => {
    const el = document.createElement('div');
    el.textContent = '预览版 · 数据和正式版分开';
    el.style.cssText = 'position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:99;padding:2px 10px;border-radius:999px;background:#c0392b;color:#fff;font:600 11px/1.6 system-ui,sans-serif;pointer-events:none;opacity:.85';
    document.body.appendChild(el);
  };
  if (document.body) tag(); else document.addEventListener('DOMContentLoaded', tag);
})();
