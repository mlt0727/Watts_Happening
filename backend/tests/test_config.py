import os
import unittest
from unittest.mock import patch

from backend.config import Settings


class SettingsTests(unittest.TestCase):
    def test_default_collection_names_remain_compatible_with_original_import(self):
        with patch.dict(os.environ, {}, clear=True), patch('backend.config.load_dotenv'):
            settings = Settings.from_environment()
        self.assertEqual(settings.projects_collection, 'projects')
        self.assertEqual(settings.overlaps_collection, 'overlaps')

    def test_collection_names_can_be_configured_without_changing_the_database(self):
        environment = {
            'MONGODB_DATABASE': 'team_database',
            'MONGODB_PROJECTS_COLLECTION': ' utility_projects ',
            'MONGODB_OVERLAPS_COLLECTION': ' overlapping_projects ',
        }
        with patch.dict(os.environ, environment, clear=True), patch('backend.config.load_dotenv'):
            settings = Settings.from_environment()
        self.assertEqual(settings.database, 'team_database')
        self.assertEqual(settings.projects_collection, 'utility_projects')
        self.assertEqual(settings.overlaps_collection, 'overlapping_projects')

    def test_blank_optional_collection_settings_keep_the_defaults(self):
        environment = {'MONGODB_PROJECTS_COLLECTION': ' ', 'MONGODB_OVERLAPS_COLLECTION': ''}
        with patch.dict(os.environ, environment, clear=True), patch('backend.config.load_dotenv'):
            settings = Settings.from_environment()
        self.assertEqual(settings.projects_collection, 'projects')
        self.assertEqual(settings.overlaps_collection, 'overlaps')


if __name__ == '__main__':
    unittest.main()
