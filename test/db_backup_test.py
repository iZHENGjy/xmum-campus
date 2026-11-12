#!/usr/bin/env python3
"""Offline tests for scripts/db_backup.py and scripts/db_restore.py. Never touches the live database.

    python test/db_backup_test.py

A fake Google token endpoint (checks the JWT signature with a throwaway RSA key) and a fake
database (serves a fixture, records PUTs) run on 127.0.0.1. A throwaway gpg key in a temp
GNUPGHOME stands in for the owner's key, so the encrypt -> decrypt round trip is real.
Needs python3, openssl and gpg (Git Bash on Windows has all three).
"""
import base64, contextlib, gzip, io, json, os, shutil, subprocess, sys, tempfile, threading, unittest, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import db_backup  # noqa: E402
import db_restore  # noqa: E402

MARKER = 'SECRET-PLAYER-DATA-7f3a'          # must never show up in any output
TOKEN = 'fake-access-token-ZZZ'
FIXTURE = {
    'boards': {'rich': {'uidA': {'name': 'Alice', 'value': 123, 'ts': 1}}},
    'names': {'alice': {'uid': 'uidA', 'name': 'Alice', 'ts': 1}},
    'users': {'uidA': {'name': 'Alice', 'key': 'alice'}},
    'saves': {'uidA': {'data': json.dumps({'note': MARKER, 'pad': 'x' * 2000}), 'score': 5, 'ts': 2}},
    'stats': {'p': {'uidA': {'f': '2026-11-09', 'l': '2026-11-12', 's': 60}}},
    '中文': {'.priority': 1, '.value': 'ok'},
}


def b64d(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


class Fake:
    db_body = json.dumps(FIXTURE).encode()
    db_status = 200
    token_status = 200
    gzip = False
    puts = []
    jwt_claims = None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, headers=()):
        self.send_response(code)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # token endpoint
        form = parse_qs(self.rfile.read(int(self.headers['Content-Length'])).decode())
        jwt = form['assertion'][0]
        h, c, s = jwt.split('.')
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, 'm'), 'wb').write(f'{h}.{c}'.encode())
            open(os.path.join(d, 's'), 'wb').write(b64d(s))
            ok = subprocess.run(['openssl', 'dgst', '-sha256', '-verify', Fake.pub_path, '-signature',
                                 os.path.join(d, 's'), os.path.join(d, 'm')], capture_output=True).returncode == 0
        Fake.jwt_claims = json.loads(b64d(c))
        if not ok or Fake.token_status != 200:
            return self.send(Fake.token_status if Fake.token_status != 200 else 400,
                             b'{"error":"invalid_grant","error_description":"Invalid JWT Signature."}')
        self.send(200, json.dumps({'access_token': TOKEN, 'expires_in': 3599}).encode())

    def do_GET(self):  # database export
        u = urlparse(self.path)
        if self.headers.get('Authorization') != 'Bearer ' + TOKEN or 'access_token' in u.query:
            return self.send(401, b'{"error":"Unauthorized request."}')
        if u.path != '/.json' or parse_qs(u.query).get('format') != ['export']:
            return self.send(400, b'{"error":"bad path"}')
        if Fake.db_status != 200:
            return self.send(Fake.db_status, b'{"error":"Permission denied"}')
        body, hdr = Fake.db_body, []
        if Fake.gzip and 'gzip' in self.headers.get('Accept-Encoding', ''):
            body, hdr = gzip.compress(body), [('Content-Encoding', 'gzip')]
        self.send(200, body, hdr)

    def do_PUT(self):
        if self.headers.get('Authorization') != 'Bearer ' + TOKEN:
            return self.send(401, b'{"error":"Unauthorized request."}')
        Fake.puts.append((self.path, json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
        self.send(204, b'')


def gpg_path(p):
    # Git for Windows' gpg is an MSYS program: C:\x\y -> /c/x/y
    if os.name == 'nt' and 'git' in (shutil.which('gpg') or '').lower():
        p = os.path.abspath(p)
        return '/' + p[0].lower() + p[2:].replace(os.sep, '/')
    return p


def gpg(home, *args, **kw):
    # cwd + relative --homedir: Git for Windows' gpg can't read native Windows paths
    return subprocess.run(['gpg', '--batch', '--quiet', '--homedir', '.', *args], capture_output=True, cwd=home, **kw)


class BackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='dbb-')
        key = os.path.join(cls.tmp, 'sa.pem')
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
                        '-out', key], check=True, capture_output=True)
        with open(key) as f:
            pem = f.read()
        Fake.pub_path = os.path.join(cls.tmp, 'sa.pub')
        subprocess.run(['openssl', 'pkey', '-in', key, '-pubout', '-out', Fake.pub_path], check=True, capture_output=True)
        cls.sa = json.dumps({'type': 'service_account', 'project_id': 'test', 'private_key_id': 'kid1',
                             'private_key': pem, 'client_email': 'backup@test.iam.gserviceaccount.com'})
        # throwaway owner key pair
        cls.home = os.path.join(cls.tmp, 'g')
        os.mkdir(cls.home)
        r = gpg(cls.home, '--passphrase', '', '--pinentry-mode', 'loopback',
                '--quick-generate-key', 'Test Owner <t@example.invalid>', 'default', 'default', 'never')
        assert r.returncode == 0, r.stderr
        cls.pub = gpg(cls.home, '--armor', '--export', 't@example.invalid').stdout.decode()
        cls.priv = gpg(cls.home, '--armor', '--pinentry-mode', 'loopback', '--passphrase', '',
                       '--export-secret-keys', 't@example.invalid').stdout.decode()
        assert 'PUBLIC KEY BLOCK' in cls.pub and 'PRIVATE KEY BLOCK' in cls.priv
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        subprocess.run(['gpgconf', '--homedir', '.', '--kill', 'all'], capture_output=True, cwd=cls.home)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        Fake.db_body, Fake.db_status, Fake.token_status, Fake.gzip, Fake.puts = \
            json.dumps(FIXTURE).encode(), 200, 200, False, []
        self.out = tempfile.mkdtemp(dir=self.tmp)
        self.env = {'FIREBASE_BACKUP_SA': self.sa, 'BACKUP_PUBLIC_KEY': self.pub,
                    'BACKUP_TOKEN_URI': self.base + '/token', 'BACKUP_DB_URL': self.base,
                    'GITHUB_ACTIONS': 'true',
                    'GITHUB_OUTPUT': os.path.join(self.out, 'gh_out'),
                    'GITHUB_STEP_SUMMARY': os.path.join(self.out, 'gh_summary')}

    def run_backup(self, extra_env=None, argv=None):
        env = dict(self.env, **(extra_env or {}))
        old = {k: os.environ.get(k) for k in list(env) + ['BACKUP_REQUIRED_KEYS']}
        os.environ.update({k: v for k, v in env.items() if v is not None})
        for k, v in env.items():
            if v is None:
                os.environ.pop(k, None)
        out, err = io.StringIO(), io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = db_backup.main(argv or ['--out', self.out])
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        logs = out.getvalue() + err.getvalue()
        files = [f for f in os.listdir(self.out) if f.endswith('.gpg')]
        # nothing sensitive in logs or summary, ever
        summary = open(self.env['GITHUB_STEP_SUMMARY'], encoding='utf-8').read() \
            if os.path.exists(self.env['GITHUB_STEP_SUMMARY']) else ''
        for secret in (MARKER, TOKEN, 'PRIVATE KEY', 'uidA', 'Alice'):
            self.assertNotIn(secret, logs + summary)
        # no plaintext file left anywhere in the output folder
        for f in os.listdir(self.out):
            if f.endswith('.gpg'):
                self.assertNotIn(MARKER.encode(), open(os.path.join(self.out, f), 'rb').read())
        return code, logs, files

    def decrypt(self, path):
        with open(path, 'rb') as f:
            r = gpg(self.home, '--pinentry-mode', 'loopback', '--passphrase', '', '--decrypt', input=f.read())
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout.decode())

    # ------------------------------------------------------------ happy paths

    def test_round_trip(self):
        code, logs, files = self.run_backup()
        self.assertEqual(code, 0, logs)
        self.assertEqual(len(files), 1)
        self.assertRegex(files[0], r'^xmum-db-\d{8}-\d{6}Z\.json\.gpg$')
        self.assertEqual(self.decrypt(os.path.join(self.out, files[0])), FIXTURE)
        self.assertIn('name=' + files[0][:-len('.json.gpg')], open(self.env['GITHUB_OUTPUT']).read())
        self.assertIn('saves: 1', logs)
        # JWT carried the right scopes, audience and a short expiry
        c = Fake.jwt_claims
        self.assertEqual(set(c['scope'].split()), set(db_backup.SCOPES))
        self.assertEqual(c['aud'], self.base + '/token')
        self.assertLessEqual(c['exp'] - c['iat'], 3600)

    def test_gzip_transfer(self):
        Fake.gzip = True
        code, logs, files = self.run_backup()
        self.assertEqual(code, 0, logs)
        self.assertEqual(self.decrypt(os.path.join(self.out, files[0])), FIXTURE)

    def test_input_file_mode(self):
        src = os.path.join(self.tmp, 'in.json')
        open(src, 'w').write(json.dumps(FIXTURE))
        code, logs, files = self.run_backup({'FIREBASE_BACKUP_SA': None}, ['--input', src, '--out', self.out])
        self.assertEqual(code, 0, logs)
        self.assertEqual(self.decrypt(os.path.join(self.out, files[0])), FIXTURE)

    # ------------------------------------------------------------ failures: job fails, nothing uploaded

    def assert_fails(self, needle, extra_env=None):
        code, logs, files = self.run_backup(extra_env)
        self.assertEqual(code, 1, logs)
        self.assertEqual(files, [])
        self.assertIn('::error::', logs)
        self.assertIn(needle, logs)

    def test_empty_object(self):
        Fake.db_body = b'{}' + b' ' * 2000
        self.assert_fails('空的')

    def test_null(self):
        Fake.db_body = b'null' + b' ' * 2000
        self.assert_fails('空的')

    def test_array(self):
        Fake.db_body = b'[1,2,3]' + b' ' * 2000
        self.assert_fails('空的')

    def test_tiny(self):
        Fake.db_body = b'{"boards":{}}'
        self.assert_fails('太小')

    def test_invalid_json(self):
        Fake.db_body = b'{"boards": ' + MARKER.encode() * 100
        self.assert_fails('不是有效的 JSON')

    def test_missing_core_node(self):
        d = dict(FIXTURE)
        del d['names']
        Fake.db_body = json.dumps(d).encode()
        self.assert_fails('names')

    def test_permission_denied(self):
        Fake.db_status = 403
        self.assert_fails('Firebase Realtime Database Viewer')

    def test_bad_token(self):
        Fake.token_status = 400
        self.assert_fails('invalid_grant')

    def test_no_secret(self):
        self.assert_fails('FIREBASE_BACKUP_SA', {'FIREBASE_BACKUP_SA': ''})

    def test_garbage_secret(self):
        self.assert_fails('不是有效的 JSON', {'FIREBASE_BACKUP_SA': 'not json'})

    def test_no_public_key(self):
        self.assert_fails('BACKUP_PUBLIC_KEY', {'BACKUP_PUBLIC_KEY': ''})

    def test_private_key_pasted_as_public(self):
        self.assert_fails('私钥', {'BACKUP_PUBLIC_KEY': self.priv})

    def test_broken_public_key(self):
        self.assert_fails('不是有效的 OpenPGP 公钥', {'BACKUP_PUBLIC_KEY':
                          '-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nAAAA\n-----END PGP PUBLIC KEY BLOCK-----'})

    # ------------------------------------------------------------ restore helper

    def restore(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        old = {k: os.environ.get(k) for k in ('BACKUP_TOKEN_URI', 'BACKUP_DB_URL', 'GNUPGHOME')}
        os.environ.update({'BACKUP_TOKEN_URI': self.base + '/token', 'BACKUP_DB_URL': self.base,
                           'GNUPGHOME': gpg_path(self.home)})
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                code = db_restore.main(list(argv))
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
        return code, out.getvalue() + err.getvalue()

    def test_restore_helper(self):
        code, logs, files = self.run_backup()
        self.assertEqual(code, 0, logs)
        gpg_path = os.path.join(self.out, files[0])
        # the artifact zip as GitHub serves it
        zip_path = os.path.join(self.out, 'artifact.zip')
        with zipfile.ZipFile(zip_path, 'w') as z:
            z.write(gpg_path, files[0])
        # the throwaway key has no passphrase, so gpg decrypts without a prompt
        for src in (zip_path, gpg_path):
            code, out = self.restore('summary', src)
            self.assertEqual(code, 0, out)
            self.assertIn('saves: 1', out)
        code, out = self.restore('find-name', zip_path, 'ALICE')
        self.assertEqual(code, 0, out)
        self.assertIn('uidA', out)
        save = os.path.join(self.out, 'save.json')
        code, out = self.restore('extract', zip_path, 'saves/uidA', '-o', save)
        self.assertEqual(code, 0, out)
        self.assertEqual(json.load(open(save, encoding='utf-8')), FIXTURE['saves']['uidA'])
        code, out = self.restore('extract', zip_path, 'saves/nobody', '-o', save + '2')
        self.assertEqual(code, 1)
        code, out = self.restore('extract', zip_path, '../x', '-o', save + '2')
        self.assertEqual(code, 1)
        key = os.path.join(self.tmp, 'sa.json')
        open(key, 'w').write(self.sa)
        code, out = self.restore('put', 'saves/uidA', '--from', save, '--key', key, '--yes')
        self.assertEqual(code, 0, out)
        self.assertEqual(Fake.puts, [('/saves/uidA.json?print=silent', FIXTURE['saves']['uidA'])])
        self.assertNotIn(TOKEN, out)
        # whole-database restore asks for an exact confirmation phrase
        full = os.path.join(self.out, 'full.json')
        open(full, 'w', encoding='utf-8').write(json.dumps(FIXTURE))
        import builtins
        real_input = builtins.input
        builtins.input = lambda prompt='': '/'
        try:
            code, out = self.restore('put', 'ROOT', '--from', full, '--key', key)
        finally:
            builtins.input = real_input
        self.assertEqual(code, 1)
        self.assertIn('整个数据库', out)
        self.assertEqual(len(Fake.puts), 1)
        # writing null (= delete) is refused
        open(full, 'w').write('null')
        code, out = self.restore('put', 'saves/uidA', '--from', full, '--key', key, '--yes')
        self.assertEqual(code, 1)
        self.assertEqual(len(Fake.puts), 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
