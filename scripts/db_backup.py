#!/usr/bin/env python3
"""Back up the whole live Firebase Realtime Database, encrypted (see docs/backup.md).

    python3 scripts/db_backup.py --out DIR                 # what the GitHub Action runs
    python3 scripts/db_backup.py --input dump.json --out DIR   # skip the download (tests)

Environment:
    FIREBASE_BACKUP_SA   the service account's JSON key (GitHub secret). Only needed without --input.
    BACKUP_PUBLIC_KEY    the owner's ASCII-armored OpenPGP PUBLIC key (GitHub variable).
    BACKUP_REQUIRED_KEYS optional, comma-separated top-level nodes that must be present
                         (default: boards,names,users). Missing -> the run fails and no backup is kept,
                         so the good backups from earlier days are not pushed out by a broken one.

Steps: mint an OAuth token from the key (JWT signed with `openssl`), GET /.json?format=export,
check it is a non-empty JSON object, encrypt it with `gpg` to the public key and write
DIR/xmum-db-YYYYmmdd-HHMMSSZ.json.gpg. The plaintext only lives in this process's memory: it is
never written to disk, printed or uploaded. Logs only show sizes, top-level node names and counts.

Standard library + the `openssl` and `gpg` command line tools (both preinstalled on GitHub's
Ubuntu runners and shipped with Git for Windows), so the Action needs no installs and no
third-party actions.
"""
import argparse, base64, datetime as dt, gzip, json, os, shutil, subprocess, sys, tempfile, time
import urllib.error, urllib.parse, urllib.request

DB_URL = 'https://xmum-campus-default-rtdb.asia-southeast1.firebasedatabase.app'
TOKEN_URI = 'https://oauth2.googleapis.com/token'
SCOPES = ('https://www.googleapis.com/auth/firebase.database',
          'https://www.googleapis.com/auth/userinfo.email')
DEFAULT_REQUIRED = 'boards,names,users'
MIN_BYTES = 1024            # the live DB is far bigger; anything this small is a broken download
WARN_BYTES = 50 * 1024**2   # 50 MB x 60 runs = 3 GB/month, a third of the free 10 GB download quota
TIMEOUT = 120


class Fail(Exception):
    """A problem we report in one safe line (never contains data, tokens or keys)."""


def log(msg):
    print(msg, flush=True)


def gh_error(msg):
    # `::error::` makes GitHub show the message on the run's summary page.
    print(('::error::' if os.environ.get('GITHUB_ACTIONS') else 'ERROR: ') + msg, file=sys.stderr, flush=True)


def gh_warning(msg):
    print(('::warning::' if os.environ.get('GITHUB_ACTIONS') else 'WARNING: ') + msg, flush=True)


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode('ascii')


def safe_http_error(e):
    """Status code plus Google's short `error` fields; never the raw body."""
    detail = ''
    try:
        body = json.loads(e.read(4096).decode('utf-8', 'replace'))
        parts = [body.get('error'), body.get('error_description')]
        if isinstance(parts[0], dict):          # {"error": {"message": ...}} style
            parts = [parts[0].get('status'), parts[0].get('message')]
        detail = ' / '.join(str(p)[:120] for p in parts if isinstance(p, str) and p)
    except Exception:
        pass
    return f'HTTP {e.code}' + (f' ({detail})' if detail else '')


# ---------------------------------------------------------------- service account -> access token

def load_service_account(text):
    try:
        sa = json.loads(text)
    except ValueError:
        raise Fail('FIREBASE_BACKUP_SA 不是有效的 JSON（请把下载的整个 .json 密钥文件内容粘进 secret）')
    if not isinstance(sa, dict) or sa.get('type') != 'service_account' \
            or not sa.get('client_email') or 'PRIVATE KEY' not in str(sa.get('private_key', '')):
        raise Fail('FIREBASE_BACKUP_SA 不是服务账号密钥（缺 type / client_email / private_key）')
    return sa


def sign_rs256(data, private_key_pem):
    """RS256 with `openssl dgst`. The key goes to a 0600 file in a private temp dir, deleted right after."""
    tmp = tempfile.mkdtemp(prefix='sa-')
    try:
        key_path = os.path.join(tmp, 'k.pem')
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(private_key_pem)
        r = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', key_path],
                           input=data, capture_output=True)
        if r.returncode != 0 or not r.stdout:
            raise Fail('openssl 无法用服务账号私钥签名（密钥内容是否完整？）')
        return r.stdout
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def make_jwt(sa, token_uri, now=None):
    now = int(now if now is not None else time.time())
    header = {'alg': 'RS256', 'typ': 'JWT'}
    if sa.get('private_key_id'):
        header['kid'] = sa['private_key_id']
    claims = {'iss': sa['client_email'], 'scope': ' '.join(SCOPES), 'aud': token_uri,
              'iat': now, 'exp': now + 600}
    signing_input = (b64url(json.dumps(header, separators=(',', ':')).encode()) + '.' +
                     b64url(json.dumps(claims, separators=(',', ':')).encode())).encode('ascii')
    return signing_input.decode('ascii') + '.' + b64url(sign_rs256(signing_input, sa['private_key']))


def get_access_token(sa, token_uri=TOKEN_URI):
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                   'assertion': make_jwt(sa, token_uri)}).encode()
    req = urllib.request.Request(token_uri, data=body, method='POST',
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            tok = json.loads(r.read().decode('utf-8')).get('access_token')
    except urllib.error.HTTPError as e:
        raise Fail('换取访问令牌失败：' + safe_http_error(e) +
                   '。密钥可能已删除或停用，请在 Google Cloud 控制台重新创建密钥并更新 secret。')
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise Fail(f'换取访问令牌失败：{type(e).__name__}')
    if not tok:
        raise Fail('换取访问令牌失败：返回里没有 access_token')
    return tok


# ---------------------------------------------------------------- download

def fetch_export(db_url, token):
    """GET the whole DB. The token goes in a header, never in the URL (URLs end up in logs)."""
    url = db_url.rstrip('/') + '/.json?format=export'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token,
                                               'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            wire = len(raw)
            if r.headers.get('Content-Encoding', '').lower() == 'gzip':
                raw = gzip.decompress(raw)
    except urllib.error.HTTPError as e:
        hint = ''
        if e.code in (401, 403):
            hint = ('。服务账号没有读取权限：在 Google Cloud 控制台 › IAM 给它加上'
                    '「Firebase Realtime Database Viewer」角色（不行再换「Firebase Realtime Database Admin」），见 docs/backup.md')
        raise Fail('下载数据库失败：' + safe_http_error(e) + hint)
    except (urllib.error.URLError, OSError, EOFError) as e:
        raise Fail(f'下载数据库失败：{type(e).__name__}')
    return raw, wire


# ---------------------------------------------------------------- checks

def validate(raw, required):
    """The dump must be a non-empty JSON object with the core nodes. Returns {top-level node: child count}."""
    if len(raw) < MIN_BYTES:
        raise Fail(f'下载到的数据只有 {len(raw)} 字节，太小，不像整个数据库，本次不保存备份')
    try:
        data = json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, ValueError):
        raise Fail('下载到的数据不是有效的 JSON，本次不保存备份')
    if not isinstance(data, dict) or not data:
        raise Fail('下载到的数据库是空的（或不是对象），本次不保存备份')
    missing = [k for k in required if k not in data]
    if missing:
        raise Fail('数据库里缺少这些节点：' + ', '.join(missing) +
                   '。可能被误删或清空了！本次不保存备份，之前的备份还在，请尽快检查数据库')
    return {k: (len(v) if isinstance(v, dict) else 1) for k, v in sorted(data.items())}


# ---------------------------------------------------------------- encryption

def read_public_key(text):
    text = (text or '').strip()
    if 'PRIVATE KEY BLOCK' in text:
        raise Fail('BACKUP_PUBLIC_KEY 里放的是【私钥】！请立刻删掉这个变量，按 docs/backup.md 重新生成一对密钥，只放公钥')
    if 'BEGIN PGP PUBLIC KEY BLOCK' not in text:
        raise Fail('没有设置 BACKUP_PUBLIC_KEY（Settings › Secrets and variables › Actions › Variables），见 docs/backup.md')
    return text + '\n'


def encrypt(plaintext, public_key, out_path):
    """gpg-encrypt bytes from stdin to the key in `public_key`. Returns the primary key fingerprint."""
    home = tempfile.mkdtemp(prefix='gpg-')
    try:
        with open(os.path.join(home, 'recipient.asc'), 'w', encoding='ascii') as f:
            f.write(public_key)
        # Relative paths with cwd=home, so Git for Windows' gpg (an MSYS program) also understands them.
        base = ['gpg', '--batch', '--quiet', '--no-tty', '--homedir', '.']
        r = subprocess.run(base + ['--with-colons', '--show-keys', 'recipient.asc'],
                           capture_output=True, text=True, cwd=home)
        fprs = [l.split(':')[9] for l in r.stdout.splitlines() if l.startswith('fpr:')]
        if r.returncode != 0 or not fprs:
            raise Fail('BACKUP_PUBLIC_KEY 不是有效的 OpenPGP 公钥')
        if sum(1 for l in r.stdout.splitlines() if l.startswith('pub:')) != 1:
            raise Fail('BACKUP_PUBLIC_KEY 里应该只有一把公钥')
        r = subprocess.run(base + ['--trust-model', 'always', '--recipient-file', 'recipient.asc',
                                   '--compress-algo', 'zlib', '--output', '-', '--encrypt'],
                           input=plaintext, capture_output=True, cwd=home)
        if r.returncode != 0 or not r.stdout:
            # gpg's stderr only talks about keys, never the plaintext
            raise Fail('gpg 加密失败：' + r.stderr.decode('utf-8', 'replace').strip()[-300:])
        with open(out_path, 'wb') as f:
            f.write(r.stdout)
        return fprs[0]
    finally:
        shutil.rmtree(home, ignore_errors=True)


# ---------------------------------------------------------------- main

def write_github(name, summary_md):
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as f:
            f.write(f'name={name}\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(summary_md)


def human(n):
    return f'{n / 1024**2:.2f} MB' if n >= 1024**2 else f'{n / 1024:.1f} KB'


def run(args):
    required = [k.strip() for k in os.environ.get('BACKUP_REQUIRED_KEYS', DEFAULT_REQUIRED).split(',') if k.strip()]
    public_key = read_public_key(os.environ.get('BACKUP_PUBLIC_KEY'))   # check before spending quota

    if args.input:
        with open(args.input, 'rb') as f:
            raw = f.read()
        wire = len(raw)
    else:
        sa_text = os.environ.get('FIREBASE_BACKUP_SA', '')
        if not sa_text.strip():
            raise Fail('没有设置 FIREBASE_BACKUP_SA（Settings › Secrets and variables › Actions › Secrets），见 docs/backup.md')
        sa = load_service_account(sa_text)
        del sa_text
        token = get_access_token(sa, os.environ.get('BACKUP_TOKEN_URI', TOKEN_URI))
        del sa
        raw, wire = fetch_export(os.environ.get('BACKUP_DB_URL', DB_URL), token)
        del token

    counts = validate(raw, required)
    log(f'下载 {human(wire)}（解压后 {human(len(raw))}），{len(counts)} 个顶层节点：')
    for k, n in counts.items():
        log(f'  {k}: {n}')
    if wire > WARN_BYTES:
        gh_warning(f'这次下载了 {human(wire)}，每月 60 次约 {wire * 60 / 1024**3:.1f} GB，'
                   '接近 Spark 方案每月 10 GB 下载额度，请考虑改成每天一次（见 docs/backup.md）')

    os.makedirs(args.out, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%SZ')
    name = f'xmum-db-{stamp}'
    out_path = os.path.join(args.out, name + '.json.gpg')
    fpr = encrypt(raw, public_key, out_path)
    del raw
    size = os.path.getsize(out_path)
    log(f'已加密：{name}.json.gpg（{human(size)}），公钥指纹 {fpr}')

    write_github(name, f'### 数据库备份 {name}\n\n'
                       f'- 下载 {human(wire)}，加密后 {human(size)}\n'
                       f'- 公钥指纹 `{fpr}`\n'
                       f'- 每月 60 次约 {wire * 60 / 1024**2:.0f} MB（Spark 免费额度 10 GB）\n\n'
                       '| 顶层节点 | 子节点数 |\n|---|---:|\n' +
                       ''.join(f'| {k} | {n} |\n' for k, n in counts.items()))
    return out_path


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--out', required=True, help='folder for the encrypted .json.gpg')
    p.add_argument('--input', help='use this JSON file instead of downloading (tests)')
    args = p.parse_args(argv)
    try:
        run(args)
    except Fail as e:
        gh_error(str(e))
        return 1
    except Exception as e:
        # No message or traceback: they could quote data. The type and line are enough to debug.
        tb = e.__traceback__
        while tb.tb_next:
            tb = tb.tb_next
        gh_error(f'意外错误 {type(e).__name__}（db_backup.py 第 {tb.tb_lineno} 行）')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
