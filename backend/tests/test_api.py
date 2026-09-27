import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from backend.app import create_app
from backend.config import Settings


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.projects.find.return_value.max_time_ms.return_value = []
        self.db.overlaps.find.return_value.max_time_ms.return_value = []
        self.db.projects.count_documents.return_value = 1315
        self.db.overlaps.count_documents.return_value = 799
        self.db.__getitem__.side_effect = {
            'projects': self.db.projects, 'overlaps': self.db.overlaps,
        }.__getitem__

    def client(self):
        return TestClient(create_app(database=self.db, settings=Settings(), serve_frontend=False))

    def test_health_checks_database_and_reports_counts(self):
        with self.client() as client:
            response = client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['collections'], {'projects': 1315, 'overlaps': 799})
        self.db.command.assert_called_once_with('ping')
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_empty_database_is_an_empty_dashboard_not_sample_records(self):
        with self.client() as client:
            response = client.get('/api/dashboard')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['projects'], [])
        self.assertEqual(response.json()['opportunities'], [])
        self.assertEqual(response.json()['meta']['source'], 'MongoDB Atlas')

    def test_custom_collection_names_are_used_for_health_and_dashboard(self):
        projects, overlaps = MagicMock(), MagicMock()
        self.db.__getitem__.side_effect = {
            'utility_projects': projects, 'overlapping_projects': overlaps,
        }.__getitem__
        projects.find.return_value.max_time_ms.return_value = [{
            'project_id': 'cloud-1', 'substation_id': 'station-1',
            'project_name': 'Custom collection project', 'company_name': 'Cloud Utility',
        }]
        overlaps.find.return_value.max_time_ms.return_value = []
        projects.count_documents.return_value = 1
        overlaps.count_documents.return_value = 0
        settings = Settings(projects_collection='utility_projects', overlaps_collection='overlapping_projects')
        with TestClient(create_app(database=self.db, settings=settings, serve_frontend=False)) as client:
            health = client.get('/api/health')
            dashboard = client.get('/api/dashboard')
        self.assertEqual(health.json()['collections'], {'projects': 1, 'overlaps': 0})
        self.assertEqual(dashboard.status_code, 200)
        self.assertEqual(dashboard.json()['projects'][0]['title'], 'Custom collection project')
        projects.find.assert_called_once_with({}, {'_id': 0})
        overlaps.find.assert_called_once_with({}, {'_id': 0})
        self.db.projects.find.assert_not_called()
        self.db.overlaps.find.assert_not_called()

    def test_every_refresh_reads_current_cloud_records(self):
        first = {'project_id': '1', 'project_name': 'Before'}
        second = {'project_id': '1', 'project_name': 'After'}
        self.db.projects.find.return_value.max_time_ms.side_effect = [[first], [second]]
        mapped = {'opportunities': [], 'projects': [], 'referenceAreas': {}, 'meta': {}}
        with patch('backend.app.build_dashboard', return_value=mapped) as transform:
            with self.client() as client:
                self.assertEqual(client.get('/api/dashboard').status_code, 200)
                self.assertEqual(client.get('/api/dashboard').status_code, 200)
        self.assertEqual(transform.call_args_list[0].args[0], [first])
        self.assertEqual(transform.call_args_list[1].args[0], [second])
        self.assertEqual(self.db.projects.find.call_count, 2)

    def test_driver_failure_returns_safe_503(self):
        private = 'mongodb+srv://test:do-not-disclose@example.invalid/'
        self.db.projects.find.side_effect = ServerSelectionTimeoutError(private)
        with self.client() as client:
            response = client.get('/api/dashboard')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('do-not-disclose', response.text)
        self.assertIn('unavailable', response.json()['detail'])

    def test_inconsistent_dataset_returns_502_without_private_details(self):
        with patch('backend.app.build_dashboard', side_effect=ValueError('private detail')):
            with self.client() as client:
                response = client.get('/api/dashboard')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('private detail', response.text)

    def test_missing_configuration_does_not_fall_back_to_old_cluster(self):
        with TestClient(create_app(settings=Settings(), serve_frontend=False)) as client:
            response = client.get('/api/dashboard')
        self.assertEqual(response.status_code, 503)
        self.assertIn('not configured', response.json()['detail'])

    def test_api_is_read_only_and_has_explicit_cors_origins(self):
        with self.client() as client:
            self.assertEqual(client.post('/api/dashboard').status_code, 405)
            self.assertEqual(client.get('/api/not-a-route').status_code, 404)
            allowed = client.get('/api/health', headers={'Origin': 'http://localhost:5173'})
            denied = client.get('/api/health', headers={'Origin': 'https://untrusted.example'})
        self.assertEqual(allowed.headers['access-control-allow-origin'], 'http://localhost:5173')
        self.assertNotIn('access-control-allow-origin', denied.headers)


if __name__ == '__main__':
    unittest.main()
