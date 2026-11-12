#!/usr/bin/env python3
"""Draw the README player-stats charts from the anonymous play stats in Firebase.

    python scripts/stats_charts.py --out out                 # read the live database
    python scripts/stats_charts.py --input sample.json --out out --today 2026-11-30

Reads /stats/p and /stats/d (public, see database.rules.json) and writes
summary.svg, daily.svg, playtime.svg, modes.svg and README.md (the same numbers as a table)
into --out. Standard library only, so the GitHub Action needs no installs.
"""
import argparse, datetime as dt, html, json, math, os, re, sys, urllib.request

BOARDS = ('hole2', 'hole', 'stunt', 'rich')
MODES = [('naiwa', '开车 · 奶娃'), ('hole', '黑洞'), ('walk', '漫游'), ('orbit', '俯瞰'), ('menu', '标题画面 / 菜单')]
DEVICES = [('m', '手机'), ('d', '电脑'), ('t', '平板')]
MYT = dt.timezone(dt.timedelta(hours=8))
FONT = "system-ui,-apple-system,'PingFang SC','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC',sans-serif"

# reference palette (dataviz skill): light / dark steps, chrome & ink
STYLE = """
.bg{fill:#fcfcfb}.ring{fill:none;stroke:rgba(11,11,11,.10)}
.t1{fill:#0b0b0b}.t2{fill:#52514e}.mu{fill:#898781}
.grid{stroke:#e1e0d9;stroke-width:1}.base{stroke:#c3c2b7;stroke-width:1}
.s1{fill:#2a78d6}.s2{fill:#eb6834}.s0{fill:#c3c2b7}
@media (prefers-color-scheme: dark){
 .bg{fill:#1a1a19}.ring{stroke:rgba(255,255,255,.10)}
 .t1{fill:#f0efec}.t2{fill:#c3c2b7}
 .grid{stroke:#2c2c2a}.base{stroke:#383835}
 .s1{fill:#3987e5}.s2{fill:#d95926}.s0{fill:#5c5b57}
}
text{font-family:%s}
""" % FONT


def esc(s):
    return html.escape(str(s), quote=True)


def svg(w, h, body, title, desc):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" '
            f'aria-labelledby="t d"><title id="t">{esc(title)}</title><desc id="d">{esc(desc)}</desc>'
            f'<style>{STYLE}</style>'
            f'<rect class="bg" x="0.5" y="0.5" width="{w-1}" height="{h-1}" rx="12"/>'
            f'<rect class="ring" x="0.5" y="0.5" width="{w-1}" height="{h-1}" rx="12"/>{body}</svg>\n')


def text(x, y, s, cls='t1', size=13, anchor='start', weight=400):
    return (f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" font-size="{size}" text-anchor="{anchor}" '
            f'font-weight="{weight}">{esc(s)}</text>')


def bar_up(x, y_top, w, h, cls, r=4):
    """Vertical bar anchored at the bottom, rounded only at its data end (the top)."""
    if h <= 0:
        return ''
    r = min(r, w / 2, h)
    yb = y_top + h
    return (f'<path class="{cls}" d="M{x:.1f},{yb:.1f}V{y_top + r:.1f}Q{x:.1f},{y_top:.1f} {x + r:.1f},{y_top:.1f}'
            f'H{x + w - r:.1f}Q{x + w:.1f},{y_top:.1f} {x + w:.1f},{y_top + r:.1f}V{yb:.1f}Z"/>')


def bar_right(x, y, w, h, cls, r=4):
    """Horizontal bar anchored at the left, rounded only at its data end (the right)."""
    if w <= 0:
        return ''
    r = min(r, h / 2, w)
    xr = x + w
    return (f'<path class="{cls}" d="M{x:.1f},{y:.1f}H{xr - r:.1f}Q{xr:.1f},{y:.1f} {xr:.1f},{y + r:.1f}'
            f'V{y + h - r:.1f}Q{xr:.1f},{y + h:.1f} {xr - r:.1f},{y + h:.1f}H{x:.1f}Z"/>')


def nice_max(v, max_ticks=5):
    """Smallest friendly step that covers v in at most max_ticks steps; returns (top, step)."""
    v = max(v, 1)
    mag = 10 ** math.floor(math.log10(v / max_ticks)) if v > max_ticks else 1
    for m in (1, 2, 5, 10, 20):
        step = m * mag
        if math.ceil(v / step - 1e-9) <= max_ticks:
            return math.ceil(v / step - 1e-9) * step, step
    return v, v


def fmt_num(v):
    return f'{v:,.0f}' if v >= 100 or float(v).is_integer() else f'{v:,.1f}'


def fmt_hours(sec):
    h = sec / 3600
    return f'{h:,.0f}' if h >= 100 else f'{h:,.1f}'


# ---------------------------------------------------------------- data

def load(args):
    if args.input:
        with open(args.input, encoding='utf-8') as f:
            return json.load(f) or {}
    cfg = open(os.path.join(os.path.dirname(__file__), '..', 'js', 'firebase-config.js'), encoding='utf-8').read()
    m = re.search(r"databaseURL\s*:\s*['\"]([^'\"]+)['\"]", cfg)
    if not m:
        sys.exit('databaseURL not found in js/firebase-config.js')
    base = m.group(1).rstrip('/')

    def get(path):
        with urllib.request.urlopen(f'{base}/{path}.json', timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))

    # only the parts this script draws: /stats/h (per-hour, for stats.html) grows every day and is not needed here
    raw = {'p': get('stats/p') or {}, 'd': get('stats/d') or {}}
    raw['boards'] = {}
    for b in BOARDS:          # public since the stats-baseline rules; a refusal just means "no baseline"
        try:
            raw['boards'][b] = get('boards/' + b) or {}
        except Exception as e:
            print(f'boards/{b}: {e}', file=sys.stderr)
    return raw


def board_days(raw):
    """uid -> set of days (UTC+8) on which that uid set a leaderboard record.

    A record's ts is when the score last improved, so this is a lower bound on who played when:
    it covers the time before the stats existed and players still running a page without stats.js."""
    out = {}
    for b in BOARDS:
        for u, r in ((raw.get('boards') or {}).get(b) or {}).items():
            ts = isinstance(r, dict) and r.get('ts')
            if isinstance(ts, (int, float)) and ts > 0:
                out.setdefault(u, set()).add(dt.datetime.fromtimestamp(ts / 1000, MYT).date().isoformat())
    return out


def summarize(raw, today):
    players = {u: p for u, p in (raw.get('p') or {}).items() if isinstance(p, dict) and (p.get('s') or 0) > 0}
    days = raw.get('d') or {}
    bdays = board_days(raw)
    stats_since = min([p.get('f') for p in players.values() if p.get('f')] + [d for d in days], default=today)
    first_day = min([stats_since] + [d for ds in bdays.values() for d in ds])
    start = dt.date.fromisoformat(first_day)
    end = dt.date.fromisoformat(today)
    span = (end - start).days + 1
    n_days = max(7, min(30, span))
    window = [(end - dt.timedelta(days=i)).isoformat() for i in range(n_days - 1, -1, -1)]
    first_of = {u: p.get('f') for u, p in players.items()}
    by_board_day = {}
    for u, ds in bdays.items():
        for d in ds:
            by_board_day.setdefault(d, set()).add(u)
    daily = []
    for d in window:
        rec = days.get(d) or {}
        active = {u: s for u, s in rec.items() if isinstance(s, (int, float)) and s > 0}
        new = sum(1 for u in active if first_of.get(u) == d)
        extra = len(by_board_day.get(d, set()) - set(active))
        daily.append({'day': d, 'new': new, 'back': len(active) - new, 'extra': extra, 'sec': sum(active.values())})
    week = {(end - dt.timedelta(days=i)).isoformat() for i in range(7)}
    week_players = {u for d in week for u, s in (days.get(d) or {}).items() if isinstance(s, (int, float)) and s > 0}
    week_players |= {u for u, ds in bdays.items() if ds & week}
    mode_sec = {k: sum((p.get('m') or {}).get(k, 0) or 0 for p in players.values()) for k, _ in MODES}
    dev = {k: sum(1 for p in players.values() if p.get('d') == k) for k, _ in DEVICES}
    total = sum(p.get('s') or 0 for p in players.values())
    return {
        'players': len(set(players) | set(bdays)), 'timed': len(players), 'week': len(week_players),
        'total_sec': total, 'avg_min': total / len(players) / 60 if players else 0,
        'since': stats_since, 'daily': daily, 'modes': mode_sec, 'devices': dev,
    }


# ---------------------------------------------------------------- charts

def chart_summary(S, stamp):
    W, H = 820, 170
    tiles = [('累计玩家', fmt_num(S['players']), '人'), ('近 7 天玩家', fmt_num(S['week']), '人'),
             ('累计游戏时长', fmt_hours(S['total_sec']), '小时'), ('人均游戏时长', f"{S['avg_min']:.0f}", '分钟')]
    tw = (W - 48 - 3 * 12) / 4
    body = []
    for i, (label, val, unit) in enumerate(tiles):
        x = 24 + i * (tw + 12)
        body.append(text(x, 46, label, 't2', 13))
        body.append(f'<text x="{x:.1f}" y="92" class="t1" font-size="34" font-weight="700">{esc(val)}'
                    f'<tspan class="t2" font-size="14" font-weight="400" dx="6">{esc(unit)}</tspan></text>')
    body.append(text(24, H - 38, f"玩家数包含统计上线前上过排行榜的人；游戏时长从 {S['since']} 开始算，只算网页在前台且有操作的时间，人均按这 {S['timed']} 人算", 'mu', 11.5))
    body.append(text(24, H - 18, f"更新于 {stamp}（马来西亚时间）", 'mu', 11.5))
    desc = '；'.join(f'{a} {b} {c}' for a, b, c in tiles)
    return svg(W, H, ''.join(body), '玩家数据总览', desc)


def axis_frame(x0, y0, pw, ph, top, step, unit_fmt):
    out = []
    v = 0
    while v <= top + 1e-9:
        y = y0 + ph - v / top * ph
        out.append(f'<line class="{"base" if v == 0 else "grid"}" x1="{x0}" x2="{x0 + pw}" y1="{y:.1f}" y2="{y:.1f}"/>')
        out.append(text(x0 - 8, y + 4, unit_fmt(v), 'mu', 11, 'end'))
        v += step
    return out


def day_labels(daily, x0, bw, gap, y):
    out = []
    n = len(daily)
    every = 1 if n <= 10 else 5 if n <= 30 else 7
    for i, d in enumerate(daily):
        if (n - 1 - i) % every == 0:
            md = d['day'][5:].replace('-', '/')
            out.append(text(x0 + i * (bw + gap) + bw / 2, y, md.lstrip('0'), 'mu', 11, 'middle'))
    return out


def chart_daily(S):
    W, H = 820, 300
    x0, y0, pw, ph = 56, 70, W - 56 - 24, H - 70 - 44
    D = S['daily']
    SERIES = [('new', 's1', '新玩家（第一次来）'), ('back', 's2', '回访玩家'), ('extra', 's0', '排行榜补算（统计上线前或旧页面）')]
    tot = lambda d: d['new'] + d['back'] + d['extra']
    top, step = nice_max(max([tot(d) for d in D] + [1]))
    n = len(D)
    gap = 4 if n > 14 else 8
    bw = (pw - gap * (n - 1)) / n
    body = [text(24, 32, '每天有多少人在玩', 't1', 16, weight=700)]
    lx = 24
    for _, cls, label in SERIES:      # legend row: every series named, colour never alone
        body.append(f'<rect class="{cls}" x="{lx}" y="44" width="10" height="10" rx="2"/>')
        body.append(text(lx + 16, 53, label, 't2', 12))
        lx += 16 + len(label) * 12 + 22
    body += axis_frame(x0, y0, pw, ph, top, step, lambda v: f'{v:.0f}')
    for i, d in enumerate(D):
        x = x0 + i * (bw + gap)
        segs = [(cls, d[k] / top * ph) for k, cls, _ in SERIES if d[k] > 0]
        body.append(f'<g><title>{esc(d["day"])}：新玩家 {d["new"]}，回访 {d["back"]}，排行榜补算 {d["extra"]}</title>')
        y = y0 + ph
        for j, (cls, h) in enumerate(segs):
            if j:
                y -= 2                    # 2px surface gap between stacked segments
            if j == len(segs) - 1:
                body.append(bar_up(x, y - h, bw, h, cls))      # only the data end is rounded
            else:
                body.append(f'<rect class="{cls}" x="{x:.1f}" y="{y - h:.1f}" width="{bw:.1f}" height="{h:.1f}"/>')
            y -= h
        body.append('</g>')
    last = D[-1]
    body.append(text(W - 24, 32, f"今天至少 {tot(last)} 人", 't1', 13, 'end', 600))
    if not any(tot(d) for d in D):
        body.append(text(x0 + pw / 2, y0 + ph / 2, '还没有数据，有人玩了以后这里会自动更新', 'mu', 13, 'middle'))
    body += day_labels(D, x0, bw, gap, y0 + ph + 18)
    desc = '；'.join(f"{d['day']} 新玩家 {d['new']} 回访 {d['back']} 排行榜补算 {d['extra']}" for d in D)
    return svg(W, H, ''.join(body), '每天有多少人在玩', desc)


def chart_playtime(S):
    W, H = 820, 260
    x0, y0, pw, ph = 56, 52, W - 56 - 24, H - 52 - 44
    D = S['daily']
    mins = [d['sec'] / 60 for d in D]
    hours = max(mins) >= 120
    vals = [m / 60 for m in mins] if hours else mins
    unit = '小时' if hours else '分钟'
    top, step = nice_max(max(vals + [1]))
    n = len(D)
    gap = 4 if n > 14 else 8
    bw = (pw - gap * (n - 1)) / n
    body = [text(24, 32, f'每天大家一共玩了多久（{unit}）', 't1', 16, weight=700)]
    body += axis_frame(x0, y0, pw, ph, top, step, lambda v: fmt_num(v))
    for i, (d, v) in enumerate(zip(D, vals)):
        x = x0 + i * (bw + gap)
        h = v / top * ph
        body.append(f'<g><title>{esc(d["day"])}：{fmt_num(v)} {unit}</title>{bar_up(x, y0 + ph - h, bw, h, "s1")}</g>')
    i_max = max(range(n), key=lambda i: vals[i])
    if vals[i_max] <= 0:
        body.append(text(x0 + pw / 2, y0 + ph / 2, '还没有数据', 'mu', 13, 'middle'))
    else:
        x = x0 + i_max * (bw + gap) + bw / 2
        body.append(text(x, y0 + ph - vals[i_max] / top * ph - 6, f'{fmt_num(vals[i_max])}', 't1', 12, 'middle', 600))
    body += day_labels(D, x0, bw, gap, y0 + ph + 18)
    desc = '；'.join(f"{d['day']} {fmt_num(v)} {unit}" for d, v in zip(D, vals))
    return svg(W, H, ''.join(body), f'每天总游戏时长（{unit}）', desc)


def hbar_panel(x0, y0, w, title, rows, fmt):
    """rows: [(label, value)] sorted by the caller; one series, value labels at the bar end."""
    out = [text(x0, y0, title, 't1', 16, weight=700)]
    lab_w, val_w, rh, gap = 104, 64, 22, 12
    bx, bwmax = x0 + lab_w, w - lab_w - val_w
    top = max([v for _, v in rows] + [1e-9])
    for i, (label, v) in enumerate(rows):
        y = y0 + 20 + i * (rh + gap)
        out.append(text(x0, y + rh / 2 + 4.5, label, 't2', 13))
        bw = max(0, v / top * bwmax) if top > 0 else 0
        out.append(bar_right(bx, y, bw, rh, 's1') if v > 0 else
                   f'<line class="base" x1="{bx}" x2="{bx}" y1="{y}" y2="{y + rh}"/>')
        out.append(text(bx + bw + 8, y + rh / 2 + 4.5, fmt(v), 't1', 13, weight=600))
    return out


def chart_modes(S):
    W = 820
    total = sum(S['modes'].values()) or 0
    modes = sorted(((lab, S['modes'][k]) for k, lab in MODES), key=lambda r: -r[1])
    devs = sorted(((lab, S['devices'][k]) for k, lab in DEVICES), key=lambda r: -r[1])
    H = 32 + 20 + len(MODES) * 34 + 28
    pct = lambda v: f'{v / total * 100:.0f}%' if total else '0%'
    body = hbar_panel(24, 34, 430, '时间都花在哪个玩法', modes, pct)
    body += hbar_panel(486, 34, 310, '用什么设备玩（人）', devs, lambda v: f'{v:,}')
    desc = '玩法时长占比：' + '，'.join(f'{a} {pct(b)}' for a, b in modes) + '。设备：' + '，'.join(f'{a} {b} 人' for a, b in devs)
    return svg(W, H, ''.join(body), '玩法时长占比和设备分布', desc)


def table_md(S, stamp):
    L = [f'# XMUM 校园漫游 · 玩家数据', '',
         f'由 GitHub Actions 每 15 分钟自动生成，更新于 {stamp}（马来西亚时间），从 {S["since"]} 开始统计。', '',
         '| 指标 | 数值 |', '|---|---|',
         f'| 累计玩家（含统计上线前上过排行榜的人） | {S["players"]} 人 |', f'| 有游戏时长记录的玩家 | {S["timed"]} 人 |', f'| 近 7 天玩家 | {S["week"]} 人 |',
         f'| 累计游戏时长 | {fmt_hours(S["total_sec"])} 小时 |', f'| 人均游戏时长 | {S["avg_min"]:.0f} 分钟 |', '',
         '## 每天', '', '| 日期 | 新玩家 | 回访玩家 | 排行榜补算 | 总时长（分钟） |', '|---|---:|---:|---:|---:|']
    L += [f'| {d["day"]} | {d["new"]} | {d["back"]} | {d["extra"]} | {d["sec"] / 60:.0f} |' for d in reversed(S['daily'])]
    total = sum(S['modes'].values()) or 1
    L += ['', '## 玩法', '', '| 玩法 | 时长（小时） | 占比 |', '|---|---:|---:|']
    L += [f'| {lab} | {S["modes"][k] / 3600:.1f} | {S["modes"][k] / total * 100:.0f}% |' for k, lab in MODES]
    L += ['', '## 设备', '', '| 设备 | 玩家 |', '|---|---:|']
    L += [f'| {lab} | {S["devices"][k]} |' for k, lab in DEVICES]
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', help='read this JSON instead of the live database')
    ap.add_argument('--out', default='out')
    ap.add_argument('--today', help='YYYY-MM-DD (default: today in Malaysia)')
    args = ap.parse_args()
    now = dt.datetime.now(MYT)
    today = args.today or now.date().isoformat()
    stamp = now.strftime('%Y-%m-%d %H:%M')
    S = summarize(load(args), today)
    os.makedirs(args.out, exist_ok=True)
    files = {'summary.svg': chart_summary(S, stamp), 'daily.svg': chart_daily(S),
             'playtime.svg': chart_playtime(S), 'modes.svg': chart_modes(S), 'README.md': table_md(S, stamp)}
    for name, body in files.items():
        with open(os.path.join(args.out, name), 'w', encoding='utf-8', newline='\n') as f:
            f.write(body)
    print(f"players={S['players']} week={S['week']} hours={S['total_sec'] / 3600:.1f} since={S['since']}")


if __name__ == '__main__':
    main()
