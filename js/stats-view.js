/* Live player-stats page (stats.html): the same numbers and charts as scripts/stats_charts.py,
 * but computed in the browser straight from the database, so it is current every time it opens
 * instead of waiting for GitHub's scheduled run. Keep the two in step when changing either.
 * Reads only the public /stats and /boards paths; no login, writes nothing.
 * /stats/h (seconds per clock hour) is read for the last 7 days only, one small node per day.
 */
'use strict';
(() => {
  const BOARDS = ['hole2', 'hole', 'stunt', 'rich'];
  const MODES = [['naiwa', '开车 · 奶娃'], ['hole', '黑洞'], ['walk', '漫游'], ['orbit', '俯瞰'], ['menu', '标题画面 / 菜单']];
  const DEVICES = [['m', '手机'], ['d', '电脑'], ['t', '平板']];
  const MYT = 8 * 3600e3, DAY = 86400e3, REFRESH_MS = 60e3;
  const FONT = "system-ui,-apple-system,'PingFang SC','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC',sans-serif";
  const STYLE = `.bg{fill:#fcfcfb}.ring{fill:none;stroke:rgba(11,11,11,.10)}
.t1{fill:#0b0b0b}.t2{fill:#52514e}.mu{fill:#898781}
.grid{stroke:#e1e0d9;stroke-width:1}.base{stroke:#c3c2b7;stroke-width:1}
.s1{fill:#2a78d6}.s2{fill:#eb6834}.s0{fill:#c3c2b7}
@media (prefers-color-scheme: dark){
 .bg{fill:#1a1a19}.ring{stroke:rgba(255,255,255,.10)}
 .t1{fill:#f0efec}.t2{fill:#c3c2b7}
 .grid{stroke:#2c2c2a}.base{stroke:#383835}
 .s1{fill:#3987e5}.s2{fill:#d95926}.s0{fill:#5c5b57}
}
text{font-family:${FONT}}`;

  /* ---------- helpers (ports of the Python ones) ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;'}[c]));
  const f1 = n => n.toFixed(1);
  let uid = 0;
  function svg(w, h, body, title, desc){
    const id = 'c' + (++uid);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}t ${id}d">` +
      `<title id="${id}t">${esc(title)}</title><desc id="${id}d">${esc(desc)}</desc><style>${STYLE}</style>` +
      `<rect class="bg" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12"/>` +
      `<rect class="ring" x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12"/>${body}</svg>`;
  }
  const text = (x, y, s, cls = 't1', size = 13, anchor = 'start', weight = 400) =>
    `<text x="${f1(x)}" y="${f1(y)}" class="${cls}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
  function barUp(x, yTop, w, h, cls, r = 4){
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h); const yb = yTop + h;
    return `<path class="${cls}" d="M${f1(x)},${f1(yb)}V${f1(yTop + r)}Q${f1(x)},${f1(yTop)} ${f1(x + r)},${f1(yTop)}H${f1(x + w - r)}Q${f1(x + w)},${f1(yTop)} ${f1(x + w)},${f1(yTop + r)}V${f1(yb)}Z"/>`;
  }
  function barRight(x, y, w, h, cls, r = 4){
    if (w <= 0) return '';
    r = Math.min(r, h / 2, w); const xr = x + w;
    return `<path class="${cls}" d="M${f1(x)},${f1(y)}H${f1(xr - r)}Q${f1(xr)},${f1(y)} ${f1(xr)},${f1(y + r)}V${f1(y + h - r)}Q${f1(xr)},${f1(y + h)} ${f1(xr - r)},${f1(y + h)}H${f1(x)}Z"/>`;
  }
  function niceMax(v, maxTicks = 5){
    v = Math.max(v, 1);
    const mag = v > maxTicks ? 10 ** Math.floor(Math.log10(v / maxTicks)) : 1;
    for (const m of [1, 2, 5, 10, 20]){ const step = m * mag, n = Math.ceil(v / step - 1e-9); if (n <= maxTicks) return [n * step, step]; }
    return [v, v];
  }
  const fmtNum = v => (v >= 100 || Number.isInteger(v)) ? Math.round(v).toLocaleString('en') : v.toLocaleString('en', {minimumFractionDigits:1, maximumFractionDigits:1});
  const fmtHours = sec => { const h = sec / 3600; return h >= 100 ? Math.round(h).toLocaleString('en') : h.toLocaleString('en', {minimumFractionDigits:1, maximumFractionDigits:1}); };
  const dayOf = ms => new Date(ms + MYT).toISOString().slice(0, 10);
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const isNum = v => typeof v === 'number' && isFinite(v);

  /* ---------- data ---------- */
  function boardDays(raw){
    const out = new Map();
    for (const b of BOARDS) for (const [u, r] of Object.entries((raw.boards || {})[b] || {})){
      if (r && isNum(r.ts) && r.ts > 0){ if (!out.has(u)) out.set(u, new Set()); out.get(u).add(dayOf(r.ts)); }
    }
    return out;
  }
  function summarize(raw, today){
    const players = Object.fromEntries(Object.entries(raw.p || {}).filter(([, p]) => p && typeof p === 'object' && (p.s || 0) > 0));
    const days = raw.d || {}, bdays = boardDays(raw);
    const statsSince = [...Object.values(players).map(p => p.f).filter(Boolean), ...Object.keys(days)].sort()[0] || today;
    const firstDay = [statsSince, ...[...bdays.values()].flatMap(s => [...s])].sort()[0];
    const span = Math.round((Date.parse(today) - Date.parse(firstDay)) / DAY) + 1;
    const nDays = Math.max(7, Math.min(30, span));
    const window = Array.from({length:nDays}, (_, i) => addDays(today, i - nDays + 1));
    const byBoardDay = new Map();
    for (const [u, ds] of bdays) for (const d of ds){ if (!byBoardDay.has(d)) byBoardDay.set(d, new Set()); byBoardDay.get(d).add(u); }
    const daily = window.map(d => {
      const active = Object.entries(days[d] || {}).filter(([, s]) => isNum(s) && s > 0);
      const act = new Set(active.map(([u]) => u));
      const nw = active.filter(([u]) => players[u] && players[u].f === d).length;
      const extra = [...(byBoardDay.get(d) || [])].filter(u => !act.has(u)).length;
      return {day:d, new:nw, back:active.length - nw, extra, sec:active.reduce((a, [, s]) => a + s, 0)};
    });
    const week = new Set(Array.from({length:7}, (_, i) => addDays(today, -i)));
    const weekPlayers = new Set();
    for (const d of week) for (const [u, s] of Object.entries(days[d] || {})) if (isNum(s) && s > 0) weekPlayers.add(u);
    for (const [u, ds] of bdays) if ([...ds].some(d => week.has(d))) weekPlayers.add(u);
    const P = Object.values(players);
    const modes = Object.fromEntries(MODES.map(([k]) => [k, P.reduce((a, p) => a + ((p.m || {})[k] || 0), 0)]));
    const devices = Object.fromEntries(DEVICES.map(([k]) => [k, P.filter(p => p.d === k).length]));
    const total = P.reduce((a, p) => a + (p.s || 0), 0);
    return {players:new Set([...Object.keys(players), ...bdays.keys()]).size, timed:P.length, week:weekPlayers.size,
            totalSec:total, avgMin:P.length ? total / P.length / 60 : 0, since:statsSince, daily, modes, devices};
  }

  /* ---------- charts ---------- */
  function chartSummary(S, stamp){      // the README card; the live page shows tilesHTML instead

    const W = 820, H = 170;
    const tiles = [['累计玩家', fmtNum(S.players), '人'], ['近 7 天玩家', fmtNum(S.week), '人'],
                   ['累计游戏时长', fmtHours(S.totalSec), '小时'], ['人均游戏时长', S.avgMin.toFixed(0), '分钟']];
    const tw = (W - 48 - 36) / 4;
    let body = '';
    tiles.forEach(([label, val, unit], i) => {
      const x = 24 + i * (tw + 12);
      body += text(x, 46, label, 't2', 13) +
        `<text x="${f1(x)}" y="92" class="t1" font-size="34" font-weight="700">${esc(val)}<tspan class="t2" font-size="14" font-weight="400" dx="6">${esc(unit)}</tspan></text>`;
    });
    body += text(24, H - 38, `玩家数包含统计上线前上过排行榜的人；游戏时长从 ${S.since} 开始算，只算网页在前台且有操作的时间，人均按这 ${S.timed} 人算`, 'mu', 11.5);
    body += text(24, H - 18, stamp, 'mu', 11.5);
    return svg(W, H, body, '玩家数据总览', tiles.map(t => t.join(' ')).join('；'));
  }
  function tilesHTML(S, stamp){
    const tiles = [['累计玩家', fmtNum(S.players), '人'], ['近 7 天玩家', fmtNum(S.week), '人'],
                   ['累计游戏时长', fmtHours(S.totalSec), '小时'], ['人均游戏时长', S.avgMin.toFixed(0), '分钟']];
    return `<section class="tiles">${tiles.map(([l, v, u]) => `<div><span>${esc(l)}</span><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('')}` +
      `<p>玩家数包含统计上线前上过排行榜的人；游戏时长从 ${esc(S.since)} 开始算，只算网页在前台且有操作的时间，人均按这 ${S.timed} 人算。<br>${esc(stamp)}</p></section>`;
  }
  function axisFrame(x0, y0, pw, ph, top, step, fmt){
    let out = '';
    for (let v = 0; v <= top + 1e-9; v += step){
      const y = y0 + ph - v / top * ph;
      out += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${x0}" x2="${x0 + pw}" y1="${f1(y)}" y2="${f1(y)}"/>` + text(x0 - 8, y + 4, fmt(v), 'mu', 11, 'end');
    }
    return out;
  }
  function dayLabels(D, x0, bw, gap, y){
    const n = D.length, every = n <= 10 ? 1 : n <= 30 ? 5 : 7;
    return D.map((d, i) => (n - 1 - i) % every === 0 ? text(x0 + i * (bw + gap) + bw / 2, y, d.day.slice(5).replace('-', '/').replace(/^0/, ''), 'mu', 11, 'middle') : '').join('');
  }
  function chartDaily(S){
    const W = 820, H = 300, x0 = 56, y0 = 70, pw = W - 56 - 24, ph = H - 70 - 44, D = S.daily;
    const SERIES = [['new', 's1', '新玩家（第一次来）'], ['back', 's2', '回访玩家'], ['extra', 's0', '排行榜补算（统计上线前或旧页面）']];
    const tot = d => d.new + d.back + d.extra;
    const [top, step] = niceMax(Math.max(1, ...D.map(tot)));
    const n = D.length, gap = n > 14 ? 4 : 8, bw = (pw - gap * (n - 1)) / n;
    let body = text(24, 32, '每天有多少人在玩', 't1', 16, 'start', 700), lx = 24;
    for (const [, cls, label] of SERIES){
      body += `<rect class="${cls}" x="${lx}" y="44" width="10" height="10" rx="2"/>` + text(lx + 16, 53, label, 't2', 12);
      lx += 16 + label.length * 12 + 22;
    }
    body += axisFrame(x0, y0, pw, ph, top, step, v => v.toFixed(0));
    D.forEach((d, i) => {
      const x = x0 + i * (bw + gap);
      const segs = SERIES.filter(([k]) => d[k] > 0).map(([k, cls]) => [cls, d[k] / top * ph]);
      body += `<g><title>${esc(d.day)}：新玩家 ${d.new}，回访 ${d.back}，排行榜补算 ${d.extra}</title>`;
      let y = y0 + ph;
      segs.forEach(([cls, h], j) => {
        if (j) y -= 2;
        body += j === segs.length - 1 ? barUp(x, y - h, bw, h, cls) : `<rect class="${cls}" x="${f1(x)}" y="${f1(y - h)}" width="${f1(bw)}" height="${f1(h)}"/>`;
        y -= h;
      });
      body += '</g>';
    });
    body += text(W - 24, 32, `今天至少 ${tot(D[n - 1])} 人`, 't1', 13, 'end', 600);
    if (!D.some(tot)) body += text(x0 + pw / 2, y0 + ph / 2, '还没有数据，有人玩了以后这里会自动更新', 'mu', 13, 'middle');
    body += dayLabels(D, x0, bw, gap, y0 + ph + 18);
    return svg(W, H, body, '每天有多少人在玩', D.map(d => `${d.day} 新玩家 ${d.new} 回访 ${d.back} 排行榜补算 ${d.extra}`).join('；'));
  }
  function chartPlaytime(S){
    const W = 820, H = 260, x0 = 56, y0 = 52, pw = W - 56 - 24, ph = H - 52 - 44, D = S.daily;
    const mins = D.map(d => d.sec / 60), hours = Math.max(...mins) >= 120;
    const vals = hours ? mins.map(m => m / 60) : mins, unit = hours ? '小时' : '分钟';
    const [top, step] = niceMax(Math.max(1, ...vals));
    const n = D.length, gap = n > 14 ? 4 : 8, bw = (pw - gap * (n - 1)) / n;
    let body = text(24, 32, `每天大家一共玩了多久（${unit}）`, 't1', 16, 'start', 700) + axisFrame(x0, y0, pw, ph, top, step, fmtNum);
    D.forEach((d, i) => { const x = x0 + i * (bw + gap), h = vals[i] / top * ph; body += `<g><title>${esc(d.day)}：${fmtNum(vals[i])} ${unit}</title>${barUp(x, y0 + ph - h, bw, h, 's1')}</g>`; });
    const iMax = vals.indexOf(Math.max(...vals));
    if (vals[iMax] <= 0) body += text(x0 + pw / 2, y0 + ph / 2, '还没有数据', 'mu', 13, 'middle');
    else body += text(x0 + iMax * (bw + gap) + bw / 2, y0 + ph - vals[iMax] / top * ph - 6, fmtNum(vals[iMax]), 't1', 12, 'middle', 600);
    body += dayLabels(D, x0, bw, gap, y0 + ph + 18);
    return svg(W, H, body, `每天总游戏时长（${unit}）`, D.map((d, i) => `${d.day} ${fmtNum(vals[i])} ${unit}`).join('；'));
  }
  function hbarPanel(x0, y0, w, title, rows, fmt){
    let out = text(x0, y0, title, 't1', 16, 'start', 700);
    const labW = 104, valW = 64, rh = 22, gap = 12, bx = x0 + labW, bwmax = w - labW - valW;
    const top = Math.max(1e-9, ...rows.map(r => r[1]));
    rows.forEach(([label, v], i) => {
      const y = y0 + 20 + i * (rh + gap), bw = Math.max(0, v / top * bwmax);
      out += text(x0, y + rh / 2 + 4.5, label, 't2', 13);
      out += v > 0 ? barRight(bx, y, bw, rh, 's1') : `<line class="base" x1="${bx}" x2="${bx}" y1="${y}" y2="${y + rh}"/>`;
      out += text(bx + bw + 8, y + rh / 2 + 4.5, fmt(v), 't1', 13, 'start', 600);
    });
    return out;
  }
  function chartModes(S){
    const W = 820, total = Object.values(S.modes).reduce((a, b) => a + b, 0);
    const modes = MODES.map(([k, l]) => [l, S.modes[k]]).sort((a, b) => b[1] - a[1]);
    const devs = DEVICES.map(([k, l]) => [l, S.devices[k]]).sort((a, b) => b[1] - a[1]);
    const H = 32 + 20 + MODES.length * 34 + 28;
    const pct = v => total ? (v / total * 100).toFixed(0) + '%' : '0%';
    const body = hbarPanel(24, 34, 430, '时间都花在哪个玩法', modes, pct) + hbarPanel(486, 34, 310, '用什么设备玩（人）', devs, v => v.toLocaleString('en'));
    return svg(W, H, body, '玩法时长占比和设备分布', '玩法时长占比：' + modes.map(([a, b]) => `${a} ${pct(b)}`).join('，') + '。设备：' + devs.map(([a, b]) => `${a} ${b} 人`).join('，'));
  }
  /* ---------- time of day (/stats/h, recorded since the hour chart was added) and how long each player has played ---------- */
  const HDAYS = 7;
  function chartHours(H, today){
    const W = 820, HT = 280, x0 = 56, y0 = 70, pw = W - 56 - 24, ph = HT - 70 - 44;
    const days = Array.from({length:HDAYS}, (_, i) => addDays(today, -i)).filter(d => H[d] && typeof H[d] === 'object');
    const sec = Array(24).fill(0), ppl = Array.from({length:24}, () => new Set());
    for (const d of days) for (const [hh, us] of Object.entries(H[d] || {})){
      const h = +hh; if (!(h >= 0 && h < 24) || !us || typeof us !== 'object') continue;
      for (const [u, v] of Object.entries(us)) if (isNum(v) && v > 0){ sec[h] += v; ppl[h].add(d + u); }
    }
    const n = Math.max(1, days.length), mins = sec.map(v => v / 60 / n), people = ppl.map(p => p.size / n);
    const [top, step] = niceMax(Math.max(1, ...mins));
    const gap = 4, bw = (pw - gap * 23) / 24, nowH = +new Date(Date.now() + MYT).toISOString().slice(11, 13);
    let body = text(24, 32, '一天里大家几点在玩', 't1', 16, 'start', 700) +
      text(24, 52, days.length ? `马来西亚时间 · 最近 ${days.length} 天平均，每个钟点大家一共玩了多少分钟 · 深色是现在这个钟点` : '马来西亚时间', 't2', 12);
    body += axisFrame(x0, y0, pw, ph, top, step, v => v.toFixed(0));
    mins.forEach((m, h) => {
      const x = x0 + h * (bw + gap), hh = m / top * ph;
      body += `<g><title>${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00：平均 ${fmtNum(m)} 分钟，约 ${fmtNum(people[h])} 人</title>${barUp(x, y0 + ph - hh, bw, hh, h === nowH ? 's2' : 's1', 3)}</g>`;
      if (h % 3 === 0) body += text(x + bw / 2, y0 + ph + 18, String(h).padStart(2, '0') + ':00', 'mu', 11, 'middle');
    });
    if (!days.length) body += text(x0 + pw / 2, y0 + ph / 2, '从这次更新开始记录，过一两天就能看出大家几点在玩', 'mu', 13, 'middle');
    else { const iMax = mins.indexOf(Math.max(...mins)); body += text(W - 24, 32, `最热闹：${String(iMax).padStart(2, '0')}:00–${String(iMax + 1).padStart(2, '0')}:00`, 't1', 13, 'end', 600); }
    return svg(W, HT, body, '一天里大家几点在玩', mins.map((m, h) => `${h} 点 ${fmtNum(m)} 分钟`).join('；'));
  }
  const BUCKETS = [[0, 5, '5 分钟以内'], [5, 15, '5–15 分钟'], [15, 30, '15–30 分钟'], [30, 60, '半小时–1 小时'], [60, 120, '1–2 小时'], [120, 300, '2–5 小时'], [300, Infinity, '5 小时以上']];
  function chartPerPlayer(raw){
    const P = Object.values(raw.p || {}).filter(p => p && isNum(p.s) && p.s > 0);
    const rows = BUCKETS.map(([a, b, l]) => [l, P.filter(p => p.s / 60 >= a && p.s / 60 < b).length]);
    const W = 820, HT = 32 + 20 + rows.length * 34 + 28;
    const sorted = P.map(p => p.s / 60).sort((a, b) => a - b), med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    let body = hbarPanel(24, 34, 560, '每个玩家一共玩了多久（人）', rows, v => v.toLocaleString('en'));
    body += text(W - 24, 34, `一半的人玩了 ${med >= 60 ? (med / 60).toFixed(1) + ' 小时' : Math.round(med) + ' 分钟'} 以上`, 't1', 13, 'end', 600);
    return svg(W, HT, body, '每个玩家一共玩了多久', rows.map(([l, v]) => `${l} ${v} 人`).join('，'));
  }
  function table(S){
    const rows = [...S.daily].reverse().map(d => `<tr><td>${d.day}</td><td>${d.new}</td><td>${d.back}</td><td>${d.extra}</td><td>${(d.sec / 60).toFixed(0)}</td></tr>`).join('');
    return `<table><thead><tr><th>日期</th><th>新玩家</th><th>回访玩家</th><th>排行榜补算</th><th>总时长（分钟）</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------- page ---------- */
  const cfg = window.XMUM_FIREBASE, out = document.getElementById('charts'), status = document.getElementById('status');
  async function getJSON(base, path){
    const r = await fetch(`${base}/${path}.json`, {cache:'no-store'});
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }
  async function refresh(){
    if (!cfg || !cfg.databaseURL){ status.textContent = '这个版本没有开联机，没有数据可看。'; return; }
    const base = cfg.databaseURL.replace(/\/$/, '');
    try {
      const now0 = Date.now(), today0 = dayOf(now0);
      const [p, d, ...hs] = await Promise.all([getJSON(base, 'stats/p'), getJSON(base, 'stats/d'),
        ...Array.from({length:HDAYS}, (_, i) => getJSON(base, 'stats/h/' + addDays(today0, -i)).catch(() => null))]);
      const raw = {p:p || {}, d:d || {}, h:{}};
      hs.forEach((v, i) => { if (v) raw.h[addDays(today0, -i)] = v; });
      raw.boards = {};
      await Promise.all(BOARDS.map(async b => { try { raw.boards[b] = (await getJSON(base, 'boards/' + b)) || {}; } catch(e){ raw.boards[b] = {}; } }));
      const now = Date.now(), today = dayOf(now), hm = new Date(now + MYT).toISOString().slice(11, 19);
      const S = summarize(raw, today);
      uid = 0;
      const wrap = c => `<div class="scroll">${c}</div>`;
      out.innerHTML = tilesHTML(S, `${today} ${hm}（马来西亚时间）读取，每分钟自动刷新`) + wrap(chartDaily(S)) + wrap(chartPlaytime(S)) + wrap(chartHours(raw.h, today)) + wrap(chartPerPlayer(raw)) + wrap(chartModes(S)) +
        `<details><summary>看具体数字</summary>${table(S)}</details>`;
      status.textContent = '';
    } catch(e){
      status.textContent = '读取数据失败，稍后会自动重试。';
    }
  }
  refresh();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
})();
