import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('validator', ROOT / 'deploy/validate-2c2g.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
TAG = 'sha-' + 'a' * 40


def environment():
    return {
        'MYSQL_ROOT_PASSWORD': 'test-root-password',
        'MYSQL_PASSWORD': 'test-app-password',
        'REPORT_SHARE_ENCRYPTION_KEY': base64.b64encode(b'x' * 32).decode(),
        'REPORT_PUBLIC_BASE_URL': 'https://classroom.school.test',
        'SEMESTER_REPORT_PARSER_URL': 'https://parser.school.test/parse',
        'SEMESTER_REPORT_PARSER_API_KEY': 'test-parser-key',
        'ADMIN_INITIAL_PASSWORD': 'test-admin-password',
        'REPORT_GENERATION_MODE': 'template',
        'BACKEND_IMAGE_TAG': TAG,
        'FRONTEND_IMAGE_TAG': TAG,
        'DOCLING_IMAGE_TAG': TAG,
    }


def fixture():
    services = {}
    for name, memory, cpu in [('mysql', 512, .6), ('backend', 384, .5), ('web', 384, .7), ('admin', 64, .1)]:
        services[name] = {
            'mem_limit': memory * 1024 * 1024,
            'cpus': cpu,
            'image': f'ghcr.io/test/classroom-{name}:{TAG}',
            'environment': environment(),
            'ports': [] if name == 'mysql' else [{'host_ip': '127.0.0.1'}],
        }
    return {'services': services}


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.config = fixture()
        self.env = self.config['services']['backend']['environment']

    def rejects(self):
        with self.assertRaises(ValueError):
            validator.validate(self.config)

    def test_memory_budget_and_private_parser(self):
        self.assertEqual(validator.validate(self.config), 1344 * 1024 * 1024)
        self.env['SEMESTER_REPORT_PARSER_URL'] = 'http://10.0.0.2:18000/parse'
        validator.validate(self.config)

    def test_budget_overflow(self):
        self.config['services']['web']['mem_limit'] = 1024 * 1024 * 1024
        self.rejects()

    def test_cpu_overflow(self):
        self.config['services']['web']['cpus'] = 2
        self.rejects()

    def test_docling_on_small_host_rejected(self):
        self.config['services']['docling-parser'] = {}
        self.rejects()

    def test_exposed_service_and_database_rejected(self):
        self.config['services']['web']['ports'][0]['host_ip'] = '0.0.0.0'
        self.rejects()
        self.config = fixture()
        self.config['services']['mysql']['ports'] = [{'host_ip': '127.0.0.1'}]
        self.rejects()

    def test_report_key_and_secrets(self):
        for key in ['', 'CHANGE_ME_REPORT_KEY', 'bad base64!', base64.b64encode(b'short').decode()]:
            with self.subTest(key_length=len(key)):
                self.env['REPORT_SHARE_ENCRYPTION_KEY'] = key
                self.rejects()
        self.config = fixture()
        self.config['services']['mysql']['environment']['MYSQL_ROOT_PASSWORD'] = 'test-app-password'
        self.rejects()

    def test_public_url_must_be_real_https_root(self):
        for url in ['http://school.test', 'https://classroom.example.com', 'https://example.com', 'https://school.test/path', 'https://user:pass@school.test']:
            with self.subTest(url=url):
                self.env['REPORT_PUBLIC_BASE_URL'] = url
                self.rejects()

    def test_parser_not_public_http_or_loopback(self):
        for url in ['http://8.8.8.8/parse', 'https://localhost/parse', 'https://127.0.0.2/parse', 'http://0.0.0.0/parse', 'http://169.254.1.2/parse', 'https://parser.school.test/other', 'https://parser.school.test/parse?key=secret']:
            with self.subTest(url=url):
                self.env['SEMESTER_REPORT_PARSER_URL'] = url
                self.rejects()

    def test_mutable_image_and_ai_mode_rejected(self):
        self.config['services']['web']['image'] = 'test:latest'
        self.rejects()
        self.config = fixture()
        self.config['services']['backend']['environment']['REPORT_GENERATION_MODE'] = 'ai'
        self.rejects()

    def test_initialization_cannot_replace_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            validator.initialize(ROOT / 'deploy/.env.2c2g.example', path)
            original = path.read_text()
            self.assertNotIn('CHANGE_ME', original)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                validator.initialize(ROOT / 'deploy/.env.2c2g.example', path)
            self.assertEqual(path.read_text(), original)


@unittest.skipUnless(shutil.which('docker'), 'Docker CLI is required for Compose rendering')
class ComposeTests(unittest.TestCase):
    def render(self, filename, extra=None):
        # Render only; never access daemon, run containers or read real .env files.
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / '.env'
            env_path.write_text('')
            env = {'PATH': os.environ['PATH'], 'HOME': os.environ.get('HOME', ''), **environment(), **(extra or {})}
            result = subprocess.run(['docker', 'compose', '--profile', 'tools', '--env-file', str(env_path), '-f', str(ROOT / filename), 'config', '--format', 'json'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, 'Docker Compose configuration rendering failed')
            return json.loads(result.stdout)

    def test_actual_compose_budget_ports_volumes_and_migration(self):
        config = self.render('deploy/compose.2c2g.yml')
        self.assertEqual(validator.validate(config), 1344 * 1024 * 1024)
        self.assertEqual(config['volumes']['classroom_mysql_data']['name'], 'classroom_mysql_data')
        self.assertEqual(config['volumes']['classroom_reports_data']['name'], 'classroom_reports_data')
        services = config['services']
        self.assertIn('tools', services['migrate']['profiles'])
        self.assertIn('migration:run', services['migrate']['command'])
        self.assertEqual(services['backend']['environment']['TYPEORM_MIGRATIONS_RUN'], 'false')
        self.assertEqual(services['web']['environment']['BACKEND_URL'], 'http://backend:3000')

    def test_remote_parser_auth_and_loopback_default(self):
        services = self.render('deploy/compose.docling.remote.yml')['services']
        parser = services['docling-parser']
        self.assertEqual(parser['ports'][0]['host_ip'], '127.0.0.1')
        self.assertEqual(parser['environment']['SEMESTER_REPORT_PARSER_API_KEY'], 'test-parser-key')
        self.assertNotIn('build', parser)


if __name__ == '__main__':
    unittest.main()
