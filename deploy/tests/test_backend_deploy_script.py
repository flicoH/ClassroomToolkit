"""Legacy deployment must not launch the optional OCR service in cloud mode."""
import json
import os
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest
from test_2c2g import ROOT, TAG

MOCK = r'''
import sys, os, json, pathlib
args=sys.argv[1:]
if pathlib.Path(sys.argv[0]).name == 'git':
    if args[:1] == ['rev-parse']: print(os.environ['MOCK_GIT_SHA'] if args == ['rev-parse','HEAD'] else 'aaaaaaa')
    sys.exit(0)
with pathlib.Path(os.environ['MOCK_DIR'],'events.jsonl').open('a') as f: f.write(json.dumps(args)+'\n')
if args[:2] == ['compose','version']: print('2.29.0')
elif args[0] == 'compose':
    has_parser = os.environ['MOCK_HAS_DOCLING'] == '1'
    if 'docling-parser' in args and not has_parser:
        print('no such service: docling-parser', file=sys.stderr)
        sys.exit(1)
    if 'config' in args and os.environ['MOCK_CONFIG_FAILURE'] == '1':
        print('invalid Compose configuration', file=sys.stderr)
        sys.exit(1)
    if 'stop' in args and os.environ['MOCK_STOP_FAILURE'] == '1':
        print('Docker permission denied', file=sys.stderr)
        sys.exit(1)
    if 'config' in args and '--format' in args:
        print(json.dumps({'services':{'backend':{'environment':{'SEMESTER_REPORT_PARSER_PROVIDER':os.environ['MOCK_PROVIDER']}}}}))
    elif 'config' in args and '--services' in args:
        print('mysql\nbackend')
        if has_parser and '--profile' in args and args[args.index('--profile')+1] == 'docling':
            print('docling-parser')
    elif 'run' in args and 'migrate' in args:
        remaining_script = sys.stdin.read()
        if remaining_script:
            print('migration consumed deployment script', file=sys.stderr)
            sys.exit(1)
    elif 'ps' in args: print('container-id')
elif args[0] == 'inspect':
    if args[-1] == '{{.Image}}': print(os.environ['MOCK_CONTAINER_IMAGE_ID'])
    elif 'org.opencontainers.image.revision' in args[-1]: print(os.environ['MOCK_CONTAINER_REVISION'])
    else: print('ghcr.io/flicoh/classroomtoolkit-backend:'+os.environ['BACKEND_IMAGE_TAG'])
elif args[:2] == ['image','inspect']:
    print('sha256:candidate' if args[-1] == '{{.Id}}' else os.environ['BACKEND_IMAGE_TAG'][4:])
elif args[0] == 'exec': print('403' if any('reset-password' in a for a in args) else '401')
sys.exit(0)
'''

class BackendDeploymentTests(unittest.TestCase):
    def run_deploy(self, provider, has_parser=True, stop_failure=False, config_failure=False, expected_status=0,
                   container_revision=TAG[4:], container_image_id='sha256:candidate', git_sha=TAG[4:], ci=True,
                   streamed=False):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / '.git').mkdir()
            (work / 'deploy').mkdir()
            (work / 'deploy/.env.backend').write_text('# mock only\n')
            release = work / 'deploy/.backend-release.env'
            release.write_text('BACKEND_IMAGE_TAG=previous-release\n')
            binary = work / 'bin'; binary.mkdir()
            script = binary / 'mock'
            script.write_text('#!' + sys.executable + '\n' + MOCK); script.chmod(0o700)
            for name in ['docker','git','sleep']: (binary / name).symlink_to(script)
            env = {**os.environ, 'PATH':str(binary)+':'+os.environ['PATH'], 'APP_DIR':str(work), 'BACKEND_IMAGE_TAG':TAG, 'MOCK_DIR':str(work), 'MOCK_PROVIDER':provider,
                   'MOCK_HAS_DOCLING':'1' if has_parser else '0', 'MOCK_STOP_FAILURE':'1' if stop_failure else '0', 'MOCK_CONFIG_FAILURE':'1' if config_failure else '0',
                   'MOCK_CONTAINER_REVISION':container_revision, 'MOCK_CONTAINER_IMAGE_ID':container_image_id, 'MOCK_GIT_SHA':git_sha,
                   'DEPLOY_COMMIT':TAG[4:] if ci else ''}
            command = ['bash','-s'] if streamed else ['bash',str(ROOT/'deploy/backend-deploy.sh')]
            result = subprocess.run(command, input=(ROOT/'deploy/backend-deploy.sh').read_text() if streamed else '',
                                    env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,expected_status,result.stdout+result.stderr)
            self.assertFalse((work / 'deploy/.backend-candidate.env').exists())
            if expected_status == 0:
                self.assertIn(TAG, release.read_text())
            else:
                self.assertEqual(release.read_text(), 'BACKEND_IMAGE_TAG=previous-release\n')
            events = work/'events.jsonl'
            return [json.loads(line) for line in events.read_text().splitlines()] if events.exists() else []

    def test_default_cloud_deploy_does_not_pull_or_start_docling(self):
        events = self.run_deploy('kimi')
        self.assertFalse(any('pull' in e and 'docling-parser' in e for e in events))
        self.assertFalse(any('up' in e and 'docling-parser' in e for e in events))
        self.assertTrue(any('stop' in e and 'docling-parser' in e for e in events))

    def test_explicit_docling_deploy_retains_the_parser_service(self):
        events = self.run_deploy('docling')
        self.assertTrue(any('pull' in e and 'docling-parser' in e for e in events))
        self.assertTrue(any('up' in e and 'docling-parser' in e for e in events))

    def test_cloud_deploy_succeeds_when_the_parser_service_was_removed(self):
        events = self.run_deploy('kimi', has_parser=False)
        self.assertFalse(any('docling-parser' in event for event in events))
        self.assertTrue(any('run' in event and 'migrate' in event for event in events))
        self.assertTrue(any('up' in event and 'backend' in event for event in events))

    def test_empty_provider_defaults_to_cloud_without_a_parser_service(self):
        events = self.run_deploy('', has_parser=False)
        self.assertFalse(any('docling-parser' in event for event in events))
        self.assertTrue(any('up' in event and 'backend' in event for event in events))

    def test_explicit_docling_without_its_service_fails_before_pulling_or_migrating(self):
        events = self.run_deploy('docling', has_parser=False, expected_status=1)
        self.assertFalse(any('pull' in event or 'up' in event or 'run' in event for event in events))

    def test_a_real_parser_stop_error_is_not_ignored(self):
        events = self.run_deploy('kimi', stop_failure=True, expected_status=1)
        self.assertTrue(any('stop' in event and 'docling-parser' in event for event in events))
        self.assertFalse(any('up' in event or 'run' in event for event in events))

    def test_invalid_configuration_fails_before_changing_services(self):
        for provider, failure in [('invalid', False), ('kimi', True)]:
            with self.subTest(provider=provider):
                events = self.run_deploy(provider, config_failure=failure, expected_status=1)
                self.assertFalse(any('pull' in event or 'up' in event or 'run' in event or 'stop' in event for event in events))

    def test_matching_image_tag_cannot_hide_a_stale_running_backend(self):
        for revision, image_id in [('b'*40, 'sha256:candidate'), (TAG[4:], 'sha256:old')]:
            with self.subTest(revision=revision, image_id=image_id):
                self.run_deploy('kimi', container_revision=revision, container_image_id=image_id, expected_status=1)

    def test_old_workflow_cannot_replace_a_newer_branch_release(self):
        events = self.run_deploy('kimi', git_sha='b'*40, expected_status=1)
        self.assertFalse(any('pull' in event or 'up' in event or 'run' in event for event in events))

    def test_migration_cannot_consume_a_streamed_deployment_script(self):
        events = self.run_deploy('kimi', streamed=True)
        self.assertTrue(any('up' in event and 'backend' in event for event in events))

    def test_manual_pinned_image_rollback_is_still_allowed(self):
        self.run_deploy('kimi', git_sha='b'*40, ci=False)
