"""A successful frontend release must match the running Web and Admin images."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_2c2g import ROOT, TAG

MOCK = r'''
import json, os, pathlib, sys
args = sys.argv[1:]
if pathlib.Path(sys.argv[0]).name == 'git':
    if args[:1] == ['rev-parse']: print(os.environ['MOCK_GIT_SHA'] if args == ['rev-parse','HEAD'] else 'server-checkout')
    sys.exit(0)
with pathlib.Path(os.environ['MOCK_DIR'], 'events.jsonl').open('a') as stream:
    stream.write(json.dumps(args) + '\n')
if args[:2] == ['compose', 'version']: print('2.29.0')
elif args[0] == 'compose' and 'ps' in args:
    print(args[-1] + '-container')
elif args[0] == 'inspect':
    service = args[1].split('-')[0]
    if os.environ['MOCK_INSPECT_FAILURE'] == '1':
        print('Docker permission denied', file=sys.stderr); sys.exit(1)
    if '.Config.Env' in args[-1]: print('BACKEND_URL=http://classroom-backend-backend-1:3000')
    elif '.Config.Image' in args[-1]:
        print('ghcr.io/flicoh/classroomtoolkit-' + service + ':' + os.environ['FRONTEND_IMAGE_TAG'])
    elif 'org.opencontainers.image.revision' in args[-1]:
        print(os.environ['MOCK_' + service.upper() + '_REVISION'])
    elif args[-1] == '{{.Image}}':
        print(os.environ['MOCK_' + service.upper() + '_IMAGE_ID'])
elif args[:2] == ['image', 'inspect']:
    service = 'web' if '-web:' in args[2] else 'admin'
    print('sha256:' + service + '-candidate' if args[-1] == '{{.Id}}' else os.environ['FRONTEND_IMAGE_TAG'][4:])
elif args[0] == 'exec': print('401')
elif args[0] == 'run': print('candidate-container' if '-d' in args else '401')
sys.exit(0)
'''


class FrontendDeploymentTests(unittest.TestCase):
    def run_deploy(self, overrides=None, expected_status=0):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / '.git').mkdir()
            (work / 'deploy').mkdir()
            (work / 'deploy/.env.frontend').write_text('# mock only\n')
            release = work / 'deploy/.frontend-release.env'
            release.write_text('FRONTEND_IMAGE_TAG=previous-release\n')
            binary = work / 'bin'
            binary.mkdir()
            script = binary / 'mock'
            script.write_text('#!' + sys.executable + '\n' + MOCK)
            script.chmod(0o700)
            for name in ['docker', 'git', 'sleep']:
                (binary / name).symlink_to(script)
            env = {
                **os.environ,
                'PATH': str(binary) + ':' + os.environ['PATH'],
                'APP_DIR': str(work), 'FRONTEND_IMAGE_TAG': TAG, 'MOCK_DIR': str(work),
                'MOCK_WEB_REVISION': TAG[4:], 'MOCK_ADMIN_REVISION': TAG[4:],
                'MOCK_WEB_IMAGE_ID': 'sha256:web-candidate', 'MOCK_ADMIN_IMAGE_ID': 'sha256:admin-candidate',
                'MOCK_INSPECT_FAILURE': '0', 'MOCK_GIT_SHA':TAG[4:], 'DEPLOY_COMMIT':TAG[4:], **(overrides or {}),
            }
            result = subprocess.run(['bash', str(ROOT / 'deploy/frontend-deploy.sh')], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, expected_status, result.stdout + result.stderr)
            self.assertFalse((work / 'deploy/.frontend-candidate.env').exists())
            if expected_status == 0:
                self.assertIn(TAG, release.read_text())
            else:
                self.assertEqual(release.read_text(), 'FRONTEND_IMAGE_TAG=previous-release\n')
            return result.stdout

    def test_promotes_a_release_when_both_running_images_match(self):
        self.run_deploy()

    def test_matching_tags_cannot_hide_old_web_or_admin_content(self):
        for service in ['WEB', 'ADMIN']:
            for revision in ['b' * 40, '']:
                with self.subTest(service=service, revision=revision):
                    self.run_deploy({'MOCK_' + service + '_REVISION': revision}, expected_status=1)

    def test_a_running_container_must_use_the_pulled_image_id(self):
        for service in ['WEB', 'ADMIN']:
            with self.subTest(service=service):
                self.run_deploy({'MOCK_' + service + '_IMAGE_ID': 'sha256:old'}, expected_status=1)

    def test_docker_permission_failure_preserves_the_previous_release(self):
        self.run_deploy({'MOCK_INSPECT_FAILURE': '1'}, expected_status=1)

    def test_logs_the_deployed_revision_instead_of_only_the_server_git_head(self):
        output = self.run_deploy()
        self.assertIn('Web deployed revision: ' + TAG[4:], output)
        self.assertIn('Admin deployed revision: ' + TAG[4:], output)

    def test_old_workflow_cannot_replace_a_newer_branch_release(self):
        self.run_deploy({'MOCK_GIT_SHA':'b'*40}, expected_status=1)

    def test_manual_pinned_image_rollback_is_still_allowed(self):
        self.run_deploy({'MOCK_GIT_SHA':'b'*40, 'DEPLOY_COMMIT':''})
