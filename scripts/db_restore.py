#!/usr/bin/env python3
"""Look inside a database backup and restore all or part of it (see docs/backup.md).

    python scripts/db_restore.py summary   BACKUP
    python scripts/db_restore.py find-name BACKUP 昵称
    python scripts/db_restore.py extract   BACKUP saves/UID  -o save.json
    python scripts/db_restore.py put       saves/UID --from save.json --key 有写权限的密钥.json

BACKUP can be the artifact .zip downloaded from GitHub, the .json.gpg inside it (decrypted with
your own gpg, which asks for the passphrase) or an already decrypted .json.

`extract` writes a JSON file you can import in the Firebase console (Realtime Database › Data ›
select the node › ⋮ › Import JSON). `put` writes it straight to the live database over REST with a
service account that has WRITE access (the backup's read-only account cannot write).
Both REPLACE everything under that path. Restoring the root replaces the whole database.

Decrypted backups hold players' data: delete them when you are done.
"""
import argparse, io, json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_backup as B  # noqa: E402  (token minting and error handling are shared with the backup)

BAD_KEY_CHARS = set('.#$[]')


def load_backup(path):
    with open(path, 'rb') as f:
        data = f.read()
    if path.lower().endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist() if n.endswith(('.gpg', '.json'))]
            if len(names) != 1:
                raise B.Fail(f'zip 里应该只有一个 .json.gpg，实际有：{names}')
            path, data = names[0], z.read(names[0])
    if path.lower().endswith('.gpg') or data[:1] not in (b'{', b'[', b'n', b' ', b'\n', b'\r', b'\t'):
        r = subprocess.run(['gpg', '--decrypt', '--quiet'], input=data, capture_output=True)
        if r.returncode != 0:
            raise B.Fail('gpg 解密失败（私钥导入了吗？口令对吗？）：' + r.stderr.decode('utf-8', 'replace').strip()[-300:])
        data = r.stdout
    try:
        return json.loads(data.decode('utf-8'))
    except (UnicodeDecodeError, ValueError):
        raise B.Fail('备份内容不是有效的 JSON')


def split_path(path):
    if path.strip().upper() == 'ROOT':      # Git Bash turns a bare "/" into a Windows path
        return []
    parts = [p for p in path.strip().strip('/').split('/') if p]
    for p in parts:
        if p in ('.', '..') or BAD_KEY_CHARS & set(p):
            raise B.Fail(f'路径里不能有 . # $ [ ] 或 ..：{path}')
    return parts


def get_path(data, parts):
    node = data
    for p in parts:
        if not isinstance(node, dict) or p not in node:
            return None
        node = node[p]
    return node


def count(v):
    return len(v) if isinstance(v, dict) else 1


def cmd_summary(a):
    data = load_backup(a.backup)
    if not isinstance(data, dict):
        raise B.Fail('备份不是 JSON 对象')
    for k in sorted(data):
        print(f'{k}: {count(data[k])}')


def cmd_find_name(a):
    data = load_backup(a.backup)
    entry = get_path(data, ['names', a.name.lower()])
    if not isinstance(entry, dict) or not entry.get('uid'):
        raise B.Fail(f'备份里没有昵称「{a.name}」')
    uid = entry['uid']
    print(f'昵称 {entry.get("name", a.name)} → uid {uid}')
    save = get_path(data, ['saves', uid])
    print(f'云存档 saves/{uid}：' + ('有' if save is not None else '没有（这个人没用 Google 登录过）'))


def cmd_extract(a):
    parts = split_path(a.path)
    node = get_path(load_backup(a.backup), parts)
    if node is None:
        raise B.Fail(f'备份里没有 /{"/".join(parts)}')
    with open(a.output, 'w', encoding='utf-8') as f:
        json.dump(node, f, ensure_ascii=False, indent=1)
    print(f'已写出 /{"/".join(parts)} → {a.output}（{count(node)} 个子节点）')


def cmd_put(a):
    parts = split_path(a.path)
    with open(a.from_file, 'rb') as f:
        body = f.read()
    try:
        value = json.loads(body.decode('utf-8'))
    except (UnicodeDecodeError, ValueError):
        raise B.Fail(f'{a.from_file} 不是有效的 JSON')
    if value is None:
        raise B.Fail('要写入的内容是 null，这会删除该路径，已拒绝')
    where = '/' + '/'.join(parts)
    print(f'将用 {a.from_file}（{count(value)} 个子节点）覆盖线上数据库的 {where}')
    if not parts:
        print('!!! 这是根节点：整个数据库（排行榜、昵称、存档、留言……）都会被替换成备份里的样子，'
              '备份之后的所有新数据都会丢失 !!!')
    if not a.yes:
        want = '覆盖整个数据库' if not parts else where
        if input(f'确认请输入「{want}」：').strip() != want:
            raise B.Fail('没有确认，已取消')
    with open(a.key, encoding='utf-8') as f:
        sa = B.load_service_account(f.read())
    token = B.get_access_token(sa, os.environ.get('BACKUP_TOKEN_URI', B.TOKEN_URI))
    url = (os.environ.get('BACKUP_DB_URL', B.DB_URL).rstrip('/') + '/' +
           '/'.join(urllib.parse.quote(p, safe='') for p in parts) + '.json?print=silent')
    req = urllib.request.Request(url, data=json.dumps(value, ensure_ascii=False).encode('utf-8'), method='PUT',
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=B.TIMEOUT) as r:
            r.read()
    except urllib.error.HTTPError as e:
        hint = '。这个服务账号没有写权限，见 docs/backup.md「用脚本恢复」' if e.code in (401, 403) else ''
        raise B.Fail('写入失败：' + B.safe_http_error(e) + hint)
    except (urllib.error.URLError, OSError) as e:
        raise B.Fail(f'写入失败：{type(e).__name__}')
    print(f'已恢复 {where}')


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('summary', help='每个顶层节点有多少条')
    s.add_argument('backup')
    s.set_defaults(fn=cmd_summary)
    s = sub.add_parser('find-name', help='按昵称查 uid')
    s.add_argument('backup')
    s.add_argument('name')
    s.set_defaults(fn=cmd_find_name)
    s = sub.add_parser('extract', help='取出一个路径存成 JSON（可在控制台导入）')
    s.add_argument('backup')
    s.add_argument('path', help='例如 saves/UID、boards/rich；ROOT 表示整个数据库')
    s.add_argument('-o', '--output', required=True)
    s.set_defaults(fn=cmd_extract)
    s = sub.add_parser('put', help='把 JSON 写回线上数据库的某个路径（覆盖）')
    s.add_argument('path')
    s.add_argument('--from', dest='from_file', required=True, help='extract 写出的 JSON')
    s.add_argument('--key', required=True, help='有写权限的服务账号 JSON 密钥文件')
    s.add_argument('--yes', action='store_true', help='不再询问确认')
    s.set_defaults(fn=cmd_put)
    a = p.parse_args(argv)
    try:
        a.fn(a)
    except B.Fail as e:
        print('错误：' + str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    sys.exit(main())
