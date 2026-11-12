"""Leaderboard snapshot for players who cannot reach Firebase (mainland China without a VPN).

Run by .github/workflows/pages.yml on every deploy (and every 15 minutes on a schedule):
    python3 boards-snapshot.py <firebase-config.js> <out.json>
Reads the public leaderboards over the REST API (the rules let anyone read /boards and /mini,
no key or login needed) and writes the top 20 of each into the site as data/boards.json.
js/net.js shows it when the live database cannot be reached. Uids are left out.

A new board (a new mini-game mode, race track, ...) needs its id added to MINI below,
otherwise its tab says there is no snapshot yet. Never fails the deploy: on any error it
writes what it has, or nothing.
"""
import json, re, sys, time, urllib.parse, urllib.request

BOARDS = ['hole2', 'hole', 'stunt', 'rich']
MINI = ['dorm', 'kipmart',
        'canteen', 'canteen_stack', 'canteen_rush', 'canteen_table', 'canteen_endless',
        'hoops_rush', 'hoops_duel',
        'bigeat_senior', 'bigeat_boss', 'bigeat_legend',
        'mcd_classic', 'mcd_rush', 'mcd_drive',
        'sukiya', 'sukiya_spicy',
        'race_campus', 'race_bell', 'race_ridge', 'race_offroad', 'race_estate', 'race_kart']
TOP = 20


def fetch(db, path):
    q = urllib.parse.urlencode({'orderBy': '"value"', 'limitToLast': TOP})
    with urllib.request.urlopen(f'{db}/{path}.json?{q}', timeout=15) as r:
        data = json.load(r) or {}
    rows = []
    for v in data.values():
        if not isinstance(v, dict):
            continue
        try:
            rows.append({'name': str(v.get('name') or '?')[:16], 'value': float(v.get('value') or 0), 'ts': int(v.get('ts') or 0)})
        except (TypeError, ValueError):
            continue
    rows.sort(key=lambda r: (-r['value'], r['ts']))
    return rows[:TOP]


def main(cfg_path, out_path):
    m = re.search(r'databaseURL\s*:\s*"(https://[^"]+)"', open(cfg_path, encoding='utf-8').read())
    if not m:
        print('snapshot: no databaseURL (offline build), skipped')
        return
    db = m.group(1).rstrip('/')
    out = {'ts': int(time.time() * 1000), 'boards': {}, 'mini': {}}
    ok = 0
    for kind, ids, prefix in (('boards', BOARDS, 'boards/'), ('mini', MINI, 'mini/')):
        for b in ids:
            try:
                out[kind][b] = fetch(db, prefix + b); ok += 1
            except Exception as e:  # one bad board must not cost the others
                print(f'snapshot: {prefix}{b} failed: {e}')
    if not ok:
        print('snapshot: nothing read, no file written')
        return
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'snapshot: {ok} boards -> {out_path}')


if __name__ == '__main__':
    try:
        main(sys.argv[1], sys.argv[2])
    except Exception as e:
        print('snapshot: skipped:', e)
