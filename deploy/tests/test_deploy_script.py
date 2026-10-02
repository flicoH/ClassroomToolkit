"""Exercise deployment ordering and failures using a fake Docker CLI only."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_2c2g import ROOT, TAG, fixture

MOCK = r'''
import json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
directory = pathlib.Path(os.environ['MOCK_DIR'])
if name == 'uname':
    print('Linux'); sys.exit(0)
if name in ['flock', 'sleep']:
    sys.exit(0)
if name == 'df':
    print('Filesystem 1024-blocks Used Available Capacity Mounted on\nmock 999999 1 999998 1% /'); sys.exit(0)
if name == 'awk':
    if '/proc/meminfo' in args:
        print(2048); sys.exit(0)
    os.execv('/usr/bin/awk', ['awk'] + args)
if args[0] == 'info':
    if '--format' in args:
        field = args[-1]
        print({'{{.Architecture}}': 'amd64', '{{.MemTotal}}': str(2*1024**3), '{{.NCPU}}': '2', '{{.DockerRootDir}}': str(directory)}[field])
    sys.exit(0)
if args[0] == 'ps':
    if any(value.startswith('publish=') for value in args):
        if os.environ.get('MOCK_PORT_OWNER'):
            print(os.environ['MOCK_PORT_OWNER'])
    sys.exit(0)
if args[:2] == ['image', 'inspect']:
    print(args[2].split(':sha-')[-1]); sys.exit(0)
if args[0] == 'run':
    for value in args:
        if value.startswith('type=bind,src='):
            target = value.split('src=', 1)[1].split(',dst=', 1)[0]
            pathlib.Path(target, 'reports.tar.gz').write_bytes(b'mock archive')
    sys.exit(0)
if args[:2] == ['compose', 'version']:
    print('2.29.0'); sys.exit(0)
if args[0] == 'compose':
    command = next(value for value in args if value in ['config', 'pull', 'exec', 'stop', 'start', 'up', 'run', 'ps', 'logs'])
    tail = args[args.index(command)+1:]
    if command == 'config':
        print(pathlib.Path(directory, 'config.json').read_text()); sys.exit(0)
    with pathlib.Path(directory, 'events.jsonl').open('a') as stream:
        stream.write(json.dumps([command] + tail) + '\n')
    if command == 'pull' and os.environ.get('MOCK_FAIL') == 'pull':
        sys.exit(1)
    if command == 'run' and 'migrate' in tail and os.environ.get('MOCK_FAIL') == 'migrate':
        sys.exit(1)
    if command == 'exec' and any('mysqldump' in value for value in tail):
        if os.environ.get('MOCK_FAIL') == 'backup':
            sys.exit(1)
        print('-- fake SQL backup')
    if command == 'ps' and '--services' in tail:
        print('backend\nweb\nadmin')
    sys.exit(0)
sys.exit('Unexpected mock command')
'''


class DeploymentScriptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.deploy = self.directory / 'deploy'
        self.deploy.mkdir()
        for filename in ['2c2g-deploy.sh', 'validate-2c2g.py']:
            shutil.copy(ROOT / 'deploy' / filename, self.deploy / filename)
        (self.deploy / '.env.2c2g').write_text('# Fake environment; rendered JSON is injected by the mock.\n')
        config = fixture()
        for index, name in enumerate(['backend', 'web', 'admin']):
            config['services'][name]['ports'][0]['published'] = str(3000 + index)
        (self.directory / 'config.json').write_text(json.dumps(config))
        self.binary = self.directory / 'bin'
        self.binary.mkdir()
        script = self.binary / 'mock-command'
        script.write_text('#!' + sys.executable + '\n' + MOCK)
        script.chmod(0o700)
        for name in ['docker', 'uname', 'df', 'awk', 'flock', 'sleep']:
            (self.binary / name).symlink_to(script)
        self.env = {
            'PATH': str(self.binary) + ':' + os.environ['PATH'],
            'APP_DIR': str(self.directory),
            'MOCK_DIR': str(self.directory),
            'BACKEND_IMAGE_TAG': TAG,
            'FRONTEND_IMAGE_TAG': TAG,
        }

    def tearDown(self):
        self.temporary.cleanup()

    def release(self, name, tag):
        (self.deploy / name).write_text(f'IMAGE_NAMESPACE=ghcr.io/flicoh/classroomtoolkit\nBACKEND_IMAGE_TAG={tag}\nFRONTEND_IMAGE_TAG={tag}\n')

    def run_script(self, command, failure='', port_owner=''):
        return subprocess.run(['bash', str(self.deploy / '2c2g-deploy.sh'), command], env={**self.env, 'MOCK_FAIL': failure, 'MOCK_PORT_OWNER': port_owner}, capture_output=True, text=True)

    def events(self):
        path = self.directory / 'events.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def test_deploy_pulls_before_stopping_and_backs_up_before_migration(self):
        result = self.run_script('deploy')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        events = self.events()
        stop = next(i for i, event in enumerate(events) if event[0] == 'stop')
        pulls = [i for i, event in enumerate(events) if event[0] == 'pull']
        self.assertEqual(len(pulls), 4)
        self.assertLess(max(pulls), stop)
        dump = next(i for i, event in enumerate(events) if any('mysqldump' in word for word in event))
        migration = next(i for i, event in enumerate(events) if event[0] == 'run' and 'migrate' in event)
        backend = next(i for i, event in enumerate(events) if event[0] == 'up' and event[-1] == 'backend')
        self.assertLess(stop, dump)
        self.assertLess(dump, migration)
        self.assertLess(migration, backend)
        self.assertIn(TAG, (self.deploy / '.2c2g-release.env').read_text())
        self.assertEqual(list(self.deploy.glob('.2c2g-candidate.*')), [])

    def test_pull_failure_preserves_running_apps(self):
        result = self.run_script('deploy', 'pull')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(event[0] == 'stop' for event in self.events()))
        self.assertFalse((self.deploy / '.2c2g-release.env').exists())

    def test_old_frontend_port_conflict_fails_before_pulling(self):
        result = self.run_script('deploy', port_owner='classroom-frontend')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Stop the old deployment first', result.stderr)
        self.assertFalse(any(event[0] in ['pull', 'stop'] for event in self.events()))

    def test_failed_migration_keeps_previous_release_and_backup(self):
        old = 'sha-' + 'b' * 40
        self.release('.2c2g-release.env', old)
        result = self.run_script('deploy', 'migrate')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('stage: migrations', result.stdout)
        self.assertIn(old, (self.deploy / '.2c2g-release.env').read_text())
        self.assertTrue(list(self.deploy.glob('backups/*/mysql.sql.gz')))
        self.assertFalse(any(event[0] == 'up' and event[-1] == 'backend' for event in self.events()))
        self.assertEqual(list(self.deploy.glob('.2c2g-candidate.*')), [])

    def test_rollback_ignores_ambient_new_tags_and_does_not_migrate(self):
        old = 'sha-' + 'b' * 40
        self.release('.2c2g-release.env', TAG)
        self.release('.2c2g-previous.env', old)
        result = self.run_script('rollback')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(old, (self.deploy / '.2c2g-release.env').read_text())
        self.assertIn(TAG, (self.deploy / '.2c2g-previous.env').read_text())
        self.assertFalse(any(event[0] == 'run' and 'migrate' in event for event in self.events()))

    def test_backup_restarts_only_the_previously_running_apps(self):
        result = self.run_script('backup')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        starts = [event for event in self.events() if event[0] == 'start']
        self.assertEqual(starts, [['start', 'backend', 'web', 'admin']])
        self.assertFalse(any(event[0] == 'run' for event in self.events()))

    def test_backup_failure_still_restarts_apps_and_preserves_error(self):
        result = self.run_script('backup', 'backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('stage: backup', result.stdout)
        self.assertIn(['start', 'backend', 'web', 'admin'], self.events())


if __name__ == '__main__':
    unittest.main()
