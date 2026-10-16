import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).with_name('deploy_render_nexus_release.py')
spec = importlib.util.spec_from_file_location('release', path)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class RenderReleaseContract(unittest.TestCase):
    def service(self, **changes):
        return dict(id=release.SERVICE, ownerId=release.WORKSPACE, repo=release.REPO, **changes)

    def test_pins_commit_and_health_without_altering_secrets_or_plan(self):
        self.assertEqual(release.DEPLOY['commitId'], '52fba8cc1bc971599d0badfe75e36aa593a6f8c3')
        self.assertEqual(release.PATCH['serviceDetails']['healthCheckPath'], '/healthz')
        self.assertNotIn('envVars', release.PATCH)
        self.assertNotIn('plan', release.PATCH['serviceDetails'])

    def test_wrong_destination_never_patches_or_deploys(self):
        with patch.object(release, 'request', return_value={'id': 'foreign'}) as api:
            with self.assertRaisesRegex(RuntimeError, 'Unexpected service'):
                release.deploy()
            self.assertEqual(api.call_count, 1)

    def test_settings_are_verified_before_deployment(self):
        with patch.object(release, 'request', side_effect=[self.service(), {}, self.service()]) as api:
            with self.assertRaisesRegex(RuntimeError, 'Settings verification'):
                release.deploy()
            self.assertEqual([call.args[0] for call in api.call_args_list], ['GET', 'PATCH', 'GET'])

    def test_success_uses_exact_service_and_commit(self):
        verified = self.service(branch=release.BRANCH, serviceDetails={'healthCheckPath': '/healthz'})
        with patch.object(release, 'request', side_effect=[self.service(), {}, verified, {'id': 'dep-synthetic', 'status': 'build_in_progress'}]) as api:
            with patch('builtins.print'):
                result = release.deploy()
            self.assertEqual(result['id'], 'dep-synthetic')
            self.assertEqual(api.call_args.args, ('POST', '/deploys', release.DEPLOY))

    def test_patch_failure_never_triggers_deploy(self):
        with patch.object(release, 'request', side_effect=[self.service(), RuntimeError('Synthetic API failure')]) as api:
            with self.assertRaises(RuntimeError):
                release.deploy()
            self.assertEqual(api.call_count, 2)

if __name__ == '__main__':
    unittest.main()
