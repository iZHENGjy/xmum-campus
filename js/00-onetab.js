/* XMUM 校园漫游 · 同一个浏览器只让一个窗口写存档
 *
 * 仓库主人：「我刚才开了两个窗口，但是只在玩一个，然后进度丢失了，我本来主线做完了」。
 * 每个窗口都把进度（主线、钱、车……）放在自己的内存里，存档时整份写进同一个 localStorage。没在玩的那个窗口
 * 内存里还是打开时的旧进度，它一存档就把另一个窗口的新进度盖掉了；登录了 Google 的话，旧进度还会被传到云存档。
 *
 * 现在：新打开（或刷新）的窗口一出现，别的窗口就停下来：不再写任何 xmum-* 存档，声音暂停，盖一层提示
 * 「游戏在另一个窗口打开了」，点「在这个窗口继续」会重新加载，读到最新的存档，再由它接管（另一个窗口停下来）。
 * 用 BroadcastChannel；老浏览器没有的话用 localStorage 的 storage 事件（键名 xtab-*，不是 xmum- 开头，不会被挡）。
 * 正式版和预览版在同一个域名下，频道名分开，开着预览不会让正式版停下来。
 * 这个文件要在所有会写存档的脚本之前加载（index.html 里紧跟在 three.js 后面）。 */
'use strict';
(() => {
  const SIDE = window.XMUM_PREVIEW ? 'preview' : 'live', CH = 'xmum-tab-' + SIDE, KEY = 'xtab-' + SIDE;
  const me = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let stale = false, bc = null;
  const mine = k => /^xmum/.test(String(k));      /* xmum-… and the preview's xmum-preview:xmum-… */

  function goStale(){
    if (stale) return; stale = true;
    /* no more writes to the save from this window: the newer one owns it */
    const P = Storage.prototype, set = P.setItem, rem = P.removeItem, clr = P.clear;
    P.setItem = function(k, v){ if (mine(k)) return; return set.call(this, k, v); };
    P.removeItem = function(k){ if (mine(k)) return; return rem.call(this, k); };
    P.clear = function(){ return; };
    window.XMUM_STALE = true;
    try { if (typeof AC !== 'undefined' && AC && AC.suspend) AC.suspend(); } catch(e){}
    try { if (typeof gx !== 'undefined' && gx) gx.paused = true; } catch(e){}
    show();
  }
  function show(){
    const put = () => {
      if (document.getElementById('xtab')) return;
      const el = document.createElement('div'); el.id = 'xtab'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true');
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(18,20,24,.78);' +
        'font:15px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1b18';
      el.innerHTML = '<div style="max-width:420px;width:100%;box-sizing:border-box;padding:20px 22px;border-radius:16px;background:#fffdf8;box-shadow:0 12px 40px rgba(0,0,0,.35);text-align:center">' +
        '<div style="font-size:30px;line-height:1">🪟</div>' +
        '<h2 style="margin:8px 0 6px;font-size:19px">游戏在另一个窗口打开了</h2>' +
        '<p style="margin:0 0 14px;color:#5e5a52">为了不让两个窗口互相覆盖进度，这个窗口已经暂停，不会再保存。</p>' +
        '<button type="button" id="xtabGo" style="all:unset;cursor:pointer;display:inline-block;padding:10px 20px;border-radius:999px;background:#b8432f;color:#fff;font-weight:700">在这个窗口继续玩</button>' +
        '<p style="margin:10px 0 0;font-size:12.5px;color:#8a857b">点了会重新加载这个窗口，读最新的进度；另一个窗口会停下来。</p></div>';
      document.body.appendChild(el);
      const b = el.querySelector('#xtabGo'); b.addEventListener('click', () => location.reload()); try { b.focus(); } catch(e){}
      /* keys pressed here must not reach the game underneath */
      el.addEventListener('keydown', e => { if (e.key !== 'Tab') e.stopPropagation(); });
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  const hear = m => { if (m && m.t === 'hi' && m.id !== me) goStale(); };
  try { bc = new BroadcastChannel(CH); bc.onmessage = e => hear(e.data); } catch(e){ bc = null; }
  window.addEventListener('storage', e => { if (e.key && (e.key === KEY || e.key.endsWith(':' + KEY)) && e.newValue){   /* the preview's guard prefixes the key */ try { hear(JSON.parse(e.newValue)); } catch(err){} } });
  /* say hello: every other window of the game in this browser stops writing */
  const hi = {t:'hi', id:me, at:Date.now()};
  try { if (bc) bc.postMessage(hi); } catch(e){}
  try { localStorage.setItem(KEY, JSON.stringify(hi)); } catch(e){}
  window.XOneTab = {get stale(){ return stale; }, id:me};
})();
