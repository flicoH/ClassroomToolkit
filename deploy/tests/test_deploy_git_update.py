"""Use real local Git repositories: deployment must not merge a stale tracking ref."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_2c2g import ROOT


class DeploymentGitUpdateTests(unittest.TestCase):
    def git(self, directory, *args):
        return subprocess.run(['git', '-C', str(directory), *args], env=self.env,
                              check=True, capture_output=True, text=True).stdout.strip()

    def exercise(self, app, failure=None):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            # Keep fixtures independent of the developer's identity, hooks and signing.
            self.env = {**os.environ, 'GIT_CONFIG_NOSYSTEM': '1',
                        'GIT_CONFIG_GLOBAL': os.devnull,
                        'GIT_AUTHOR_NAME': 'Deployment test', 'GIT_AUTHOR_EMAIL': 'test@example.invalid',
                        'GIT_COMMITTER_NAME': 'Deployment test', 'GIT_COMMITTER_EMAIL': 'test@example.invalid'}
            origin, source, server = [work / name for name in ['origin.git', 'source', 'server']]
            self.git(work, 'init', '--bare', str(origin))
            self.git(work, 'init', '-b', 'main', str(source))
            (source / 'version.txt').write_text('old\n')
            self.git(source, 'add', '.')
            self.git(source, 'commit', '-m', 'old release')
            old = self.git(source, 'rev-parse', 'HEAD')
            self.git(source, 'branch', 'unrelated')
            self.git(source, 'remote', 'add', 'origin', str(origin))
            self.git(source, 'push', 'origin', 'main', 'unrelated')
            self.git(work, 'clone', '--single-branch', '--branch', 'main', str(origin), str(server))
            # The server maps another branch, so fetching main only updates FETCH_HEAD.
            self.git(server, 'config', 'remote.origin.fetch',
                     '+refs/heads/unrelated:refs/remotes/origin/unrelated')
            (source / 'version.txt').write_text('new\n')
            self.git(source, 'commit', '-am', 'new release')
            latest = self.git(source, 'rev-parse', 'HEAD')
            self.git(source, 'push', 'origin', 'main')
            expected = old if failure == 'stale-ci' else latest
            initial = old
            if failure == 'diverged':
                (server / 'local.txt').write_text('preserve this local commit\n')
                self.git(server, 'add', 'local.txt')
                self.git(server, 'commit', '-m', 'local commit')
                initial = self.git(server, 'rev-parse', 'HEAD')
            if failure == 'fetch':
                self.git(server, 'remote', 'set-url', 'origin', str(work / 'missing.git'))
            (server / 'deploy').mkdir()
            private_env = server / f'deploy/.env.{app}'
            private_env.write_text('PRIVATE_TEST_VALUE=preserved\n')
            self.env.update({'APP_DIR': str(server), 'BRANCH': 'main', 'DEPLOY_COMMIT': expected,
                             f'{app.upper()}_IMAGE_TAG': 'sha-' + expected})
            # Execute the actual preflight through its Git update and CI version guard.
            prefix = (ROOT / f'deploy/{app}-deploy.sh').read_text().split('if [[ ! -f "$ENV_FILE" ]]', 1)[0]
            result = subprocess.run(['bash', '-c', prefix], env=self.env, capture_output=True, text=True)
            self.assertEqual(private_env.read_text(), 'PRIVATE_TEST_VALUE=preserved\n')
            if failure:
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                if failure == 'stale-ci':
                    self.assertIn('Release mismatch', result.stdout)
                    self.assertEqual(self.git(server, 'rev-parse', 'HEAD'), latest)
                else:
                    self.assertEqual(self.git(server, 'rev-parse', 'HEAD'), initial)
            else:
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual(self.git(server, 'rev-parse', 'HEAD'), latest)
                self.assertEqual(self.git(server, 'rev-parse', 'origin/main'), latest)
                self.assertEqual((server / 'version.txt').read_text(), 'new\n')
            self.assertEqual(self.git(server, 'config', 'remote.origin.fetch'),
                             '+refs/heads/unrelated:refs/remotes/origin/unrelated')

    def test_restrictive_fetch_mapping_cannot_leave_the_deployed_branch_stale(self):
        for app in ['backend', 'frontend']:
            with self.subTest(app=app):
                self.exercise(app)

    def test_an_older_ci_run_still_fails_after_fetching_the_current_branch(self):
        for app in ['backend', 'frontend']:
            with self.subTest(app=app):
                self.exercise(app, 'stale-ci')

    def test_diverged_history_is_not_reset_or_overwritten(self):
        for app in ['backend', 'frontend']:
            with self.subTest(app=app):
                self.exercise(app, 'diverged')

    def test_fetch_failure_preserves_the_checkout(self):
        for app in ['backend', 'frontend']:
            with self.subTest(app=app):
                self.exercise(app, 'fetch')
