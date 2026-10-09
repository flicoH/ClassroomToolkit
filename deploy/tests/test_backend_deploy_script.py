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
    if args[:1] == ['rev-parse']: print('aaaaaaa')
    sys.exit(0)
with pathlib.Path(os.environ['MOCK_DIR'],'events.jsonl').open('a') as f: f.write(json.dumps(args)+'\n')
if args[:2] == ['compose','version']: print('2.29.0')
elif args[0] == 'compose':
    if 'config' in args and '--format' in args:
        print(json.dumps({'services':{'backend':{'environment':{'SEMESTER_REPORT_PARSER_PROVIDER':os.environ['MOCK_PROVIDER']}}}}))
    elif 'ps' in args: print('container-id')
elif args[0] == 'inspect': print('ghcr.io/flicoh/classroomtoolkit-backend:'+os.environ['BACKEND_IMAGE_TAG'])
elif args[:2] == ['image','inspect']: print(os.environ['BACKEND_IMAGE_TAG'][4:])
elif args[0] == 'exec': print('403' if any('reset-password' in a for a in args) else '401')
sys.exit(0)
'''

class BackendDeploymentTests(unittest.TestCase):
    def run_deploy(self, provider):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / '.git').mkdir()
            (work / 'deploy').mkdir()
            (work / 'deploy/.env.backend').write_text('# mock only\n')
            binary = work / 'bin'; binary.mkdir()
            script = binary / 'mock'
            script.write_text('#!' + sys.executable + '\n' + MOCK); script.chmod(0o700)
            for name in ['docker','git']: (binary / name).symlink_to(script)
            env = {**os.environ, 'PATH':str(binary)+':'+os.environ['PATH'], 'APP_DIR':str(work), 'BACKEND_IMAGE_TAG':TAG, 'MOCK_DIR':str(work), 'MOCK_PROVIDER':provider}
            result = subprocess.run(['bash',str(ROOT/'deploy/backend-deploy.sh')],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            return [json.loads(line) for line in (work/'events.jsonl').read_text().splitlines()]

    def test_default_cloud_deploy_does_not_pull_or_start_docling(self):
        events = self.run_deploy('kimi')
        self.assertFalse(any('pull' in e and 'docling-parser' in e for e in events))
        self.assertFalse(any('up' in e and 'docling-parser' in e for e in events))
        self.assertTrue(any('stop' in e and 'docling-parser' in e for e in events))

    def test_explicit_docling_deploy_retains_the_parser_service(self):
        events = self.run_deploy('docling')
        self.assertTrue(any('pull' in e and 'docling-parser' in e for e in events))
        self.assertTrue(any('up' in e and 'docling-parser' in e for e in events))
