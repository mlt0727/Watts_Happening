import ast
from contextlib import redirect_stdout
from io import StringIO
import unittest
from unittest.mock import MagicMock, patch

from backend.config import Settings
from backend.mongo import main


class MongoDiagnosticTests(unittest.TestCase):
    def test_diagnostic_counts_the_configured_collections(self):
        settings = Settings(projects_collection='utility_projects', overlaps_collection='overlapping_projects')
        client, database, projects, overlaps = (MagicMock() for _ in range(4))
        client.__enter__.return_value = client
        client.__getitem__.return_value = database
        database.__getitem__.side_effect = {
            'utility_projects': projects, 'overlapping_projects': overlaps,
        }.__getitem__
        projects.count_documents.return_value = 1315
        overlaps.count_documents.return_value = 799
        output = StringIO()
        with patch('backend.mongo.Settings.from_environment', return_value=settings), patch('backend.mongo.create_client', return_value=client), redirect_stdout(output):
            result = main()
        self.assertEqual(result, 0)
        self.assertEqual(ast.literal_eval(output.getvalue()), {
            'database': 'utility_projects_db', 'projects': 1315, 'overlaps': 799,
        })
        client.admin.command.assert_called_once_with('ping')
        client.__getitem__.assert_called_once_with('utility_projects_db')
        projects.count_documents.assert_called_once_with({})
        overlaps.count_documents.assert_called_once_with({})


if __name__ == '__main__':
    unittest.main()
