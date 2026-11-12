/* XMUM 校园漫游 · 多语言（目前：中文 / English）
 *
 * 做法：游戏代码照旧写中文，这个文件在「写到屏幕上」的那一刻换成别的语言。
 *   - 文字和 HTML：Node.textContent、Element.innerHTML / innerText、setAttribute('title'|'aria-label'|'placeholder'|'alt')、document.title、alert/confirm
 *   - 画在 canvas 上的字（路牌、招牌、小地图）：CanvasRenderingContext2D.fillText / strokeText / measureText
 *   - index.html 里写死的文字：页面解析完以后整页翻一遍
 * 读回来的时候还给原文：el.textContent / innerHTML 读到的仍是代码写进去的中文，所以 `if (el.textContent !== t) el.textContent = t`
 * 这种「变了才写」的判断照常成立，不会每帧重写。
 *
 * 词典：js/i18n/<lang>.js 调 XI18N.add({ '中文原文':'译文', '在线 {0} 人':'{0} online', ... })
 *   - 完全相同的原文直接换；带 {0} {1} 的是模板，占位的部分本身也会再查一次词典（比如赛道名）
 *   - 查不到时：按「 · 」「\n」拆开分别查；还是查不到就保持中文（所以没翻完的地方显示中文，不会坏）
 * 中文（默认）时什么都不装，零开销。
 *
 * 选语言：标题页右上角的「EN / 中」按钮，或网址加 ?lang=en；存在 localStorage 'xmum-lang'，换语言会刷新页面。
 * 调试：XI18N.lang、XI18N.t(s)、XI18N.missing() → 这次运行里出现过但没翻译的中文（按出现次数排序），补词典用。
 * 这个文件要在所有画界面的脚本之前加载（index.html 里紧跟 quality.js）。
 */
'use strict';
(() => {
  const LANGS = {zh:'中文', en:'English'};
  let lang = 'zh';
  try {
    const q = /[?&]lang=([a-z]{2})\b/.exec(location.search);
    if (q && LANGS[q[1]]){ lang = q[1]; localStorage.setItem('xmum-lang', lang); }
    else { const s = localStorage.getItem('xmum-lang'); if (s && LANGS[s]) lang = s; }
  } catch(e){}

  const exact = new Map(), pats = [];
  const CJK = /[㐀-鿿！-～　-〿]/;
  const missing = new Map();
  const cache = new Map(); const CACHE_MAX = 4000;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function add(dict){
    for (const k in dict){
      const v = dict[k]; if (typeof v !== 'string') continue;
      if (/\{\d\}/.test(k)){
        const order = [];
        const re = new RegExp('^' + k.split(/(\{\d\})/).map(p => { const m = /^\{(\d)\}$/.exec(p); if (m){ order.push(+m[1]); return '([\\s\\S]+?)'; } return esc(p); }).join('') + '$');
        pats.push({re, order, out:v, lit:k.replace(/\{\d\}/g, '').length});
      } else exact.set(k, v);
    }
    pats.sort((a, b) => b.lit - a.lit);
    cache.clear();
  }
  function fill(out, order, m){
    return out.replace(/\{(\d)\}/g, (_, i) => { const j = order.indexOf(+i); const v = j >= 0 ? m[j + 1] : ''; return tr(v, 1); });
  }
  function tr(s, depth){
    if (lang === 'zh' || typeof s !== 'string' || !s || !CJK.test(s)) return s;
    const c = cache.get(s); if (c !== undefined) return c;
    let r = exact.get(s);
    if (r === undefined){
      const t = s.trim();
      if (t !== s){ const inner = tr(t, depth); if (inner !== t){ const lead = s.slice(0, s.indexOf(t)); r = lead + inner + s.slice(lead.length + t.length); } }
    }
    if (r === undefined && (depth | 0) < 3){
      for (const p of pats){ const m = p.re.exec(s); if (m){ r = fill(p.out, p.order, m); break; } }
      if (r === undefined){
        for (const sep of ['\n', ' · ', '　', '：', '，', '。']){
          if (s.indexOf(sep) < 0) continue;
          const parts = s.split(sep), outp = parts.map(p => tr(p, (depth | 0) + 1));
          if (outp.some((p, i) => p !== parts[i])){ r = outp.join(sep === '：' ? ': ' : sep === '，' ? ', ' : sep === '。' ? '. ' : sep === '　' ? ' ' : sep); break; }
        }
      }
    }
    if (r === undefined){ r = s; if (!depth) missing.set(s, (missing.get(s) || 0) + 1); }
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(s, r);
    return r;
  }

  window.XI18N = {
    lang, langs:LANGS, add, t:s => tr(s, 0),
    set(l){ if (!LANGS[l]) return; try { localStorage.setItem('xmum-lang', l); } catch(e){} location.reload(); },
    missing:() => [...missing.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => n + '× ' + s)
  };
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  /* 标题页的语言按钮（index.html 的 #tLang）：显示「另一种」语言，点了切过去 */
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('tLang'); if (!b) return;
    const next = lang === 'zh' ? 'en' : 'zh', sp = b.querySelector('span');
    if (sp){ sp.lang = next === 'zh' ? 'zh-CN' : next; sp.firstChild.nodeValue = next === 'zh' ? '中文' : 'English'; }
    b.addEventListener('click', () => XI18N.set(next));
  }, {once:true});
  if (lang === 'zh') return;                              // 中文：什么都不改

  /* 词典按需加载（同版本号），只有选了别的语言的人才下载 */
  { const me = document.currentScript, v = me && /\?v=([^&]+)/.exec(me.src);
    document.write('<script src="js/i18n/' + lang + '.js' + (v ? '?v=' + v[1] : '') + '"><\/script>'); }

  /* ---------- 写入时翻译，读回时还原 ---------- */
  const SRC = Symbol('i18n');
  const wrap = (proto, prop, toOut, readBack) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable:true, enumerable:d.enumerable,
      get(){ const v = d.get.call(this); const m = this[SRC]; return m && m[prop] && m[prop].out === v ? m[prop].src : readBack ? readBack(v) : v; },
      set(v){
        const src = v == null ? '' : String(v), out = toOut(src);
        d.set.call(this, out);
        if (out !== src){ const m = this[SRC] || (this[SRC] = {}); m[prop] = {src, out:d.get.call(this)}; }
        else if (this[SRC] && this[SRC][prop]) this[SRC][prop] = null;
      }
    });
  };
  wrap(Node.prototype, 'textContent', s => tr(s, 0));
  wrap(HTMLElement.prototype, 'innerText', s => tr(s, 0));
  wrap(Element.prototype, 'innerHTML', html => (CJK.test(html) ? trHTML(html) : html));

  /* HTML 字符串：只翻标签之间的文字和几个属性，标签本身不动 */
  const ATTRS = /(\s(?:title|aria-label|placeholder|alt|data-tip)=")([^"]*)"/g;
  function trHTML(html){
    return html.replace(/<[^>]+>|[^<]+/g, seg => {
      if (seg[0] === '<') return CJK.test(seg) ? seg.replace(ATTRS, (_, a, v) => a + attrEsc(tr(attrUn(v), 0)) + '"') : seg;
      if (!CJK.test(seg)) return seg;
      const raw = seg.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const out = tr(raw, 0);
      return out === raw ? seg : out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });
  }
  const attrUn = v => v.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const attrEsc = v => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const TA = new Set(['title', 'aria-label', 'placeholder', 'alt', 'data-tip']);
  { const sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(n, v){ return sa.call(this, n, TA.has(String(n).toLowerCase()) ? tr(String(v), 0) : v); }; }
  for (const [proto, prop] of [[HTMLElement.prototype, 'title'], [HTMLInputElement.prototype, 'placeholder'], [HTMLTextAreaElement.prototype, 'placeholder']]) wrap(proto, prop, s => tr(s, 0));
  { const d = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    if (d && d.set) Object.defineProperty(document, 'title', {configurable:true, get(){ return d.get.call(document); }, set(v){ d.set.call(document, tr(String(v), 0)); }}); }
  for (const f of ['alert', 'confirm', 'prompt']){ const o = window[f]; if (o) window[f] = function(m, ...a){ return o.call(window, tr(String(m == null ? '' : m), 0), ...a); }; }

  /* canvas 上的字 */
  { const C = CanvasRenderingContext2D.prototype;
    for (const f of ['fillText', 'strokeText', 'measureText']){ const o = C[f]; C[f] = function(s, ...a){ return o.call(this, typeof s === 'string' ? tr(s, 0) : s, ...a); }; }
    if (window.OffscreenCanvasRenderingContext2D){ const O = OffscreenCanvasRenderingContext2D.prototype;
      for (const f of ['fillText', 'strokeText', 'measureText']){ const o = O[f]; O[f] = function(s, ...a){ return o.call(this, typeof s === 'string' ? tr(s, 0) : s, ...a); }; } } }

  /* index.html 里写死的文字：解析完翻一遍 */
  function walk(root){
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.currentNode; n; n = it.nextNode()){
      if (n.nodeType === 3){
        const p = n.parentNode; if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE') continue;
        const v = n.nodeValue; if (CJK.test(v)){ const o = tr(v, 0); if (o !== v) n.nodeValue = o; }
      } else for (const a of TA){ const v = n.getAttribute(a); if (v && CJK.test(v)) n.setAttribute(a, v); }
    }
  }
  document.addEventListener('DOMContentLoaded', () => { walk(document.documentElement); document.title = document.title; }, {once:true});
})();
