from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from src.cross_compare import Project, find_overlaps


ROOT = Path(__file__).resolve().parents[2]


def company_projects(*names):
    return {
        name: {
            str(index): Project(
                project_id=str(index),
                name=f"Project {index}",
                stations=[(42.0, -85.0)],
                year_values={"2027"},
            )
        }
        for index, name in enumerate(names, start=1)
    }


class CrossCompareIdentityTest(unittest.TestCase):
    def test_metc_aliases_are_excluded_before_distance_calculation(self):
        groups = company_projects(
            "Michigan Electric Transmission Company",
            "Michigan Electric Transmission Company (ITC)",
        )
        with patch("src.cross_compare.project_distance_km") as distance:
            self.assertEqual(list(find_overlaps(groups)), [])
        distance.assert_not_called()

    def test_independent_company_pairs_preserve_source_labels_and_ids(self):
        metc = "Michigan Electric Transmission Company"
        alias = "Michigan Electric Transmission Company (ITC)"
        independent = "Consumers Energy"
        groups = company_projects(metc, alias, independent)
        results = list(find_overlaps(groups))

        self.assertEqual(len(results), 2)
        self.assertEqual({row["overlap_id"] for row in results}, {"OVL_1", "OVL_2"})
        self.assertEqual(
            {frozenset((row["utility_a"], row["utility_b"])) for row in results},
            {frozenset((metc, independent)), frozenset((alias, independent))},
        )
        for row in results:
            self.assertEqual(row["distance_mi"], "0.000000")
            for side in ("a", "b"):
                original = groups[row[f"utility_{side}"]][row[f"project_id_{side}"]]
                self.assertEqual(row[f"project_name_{side}"], original.name)
        self.assertEqual(set(groups), {metc, alias, independent})

    def test_legal_suffix_variants_do_not_create_cross_company_pairs(self):
        groups = company_projects("Evergy Kansas Central, Inc.", "Evergy Kansas Central")
        self.assertEqual(list(find_overlaps(groups)), [])

    def test_joint_owner_group_cannot_pair_with_shared_owner(self):
        groups = company_projects("Utility A; Utility B", "Utility B, LLC")
        with patch("src.cross_compare.project_distance_km") as distance:
            self.assertEqual(list(find_overlaps(groups)), [])
        distance.assert_not_called()

    def test_distinct_subsidiaries_are_not_merged_by_parent_annotation(self):
        groups = company_projects(
            "Michigan Electric Transmission Company (ITC)", "ITC Midwest LLC",
        )
        self.assertEqual(len(list(find_overlaps(groups))), 1)

    def test_module_and_direct_script_entry_points_support_help(self):
        for arguments in (("-m", "src.cross_compare", "--help"), ("src/cross_compare.py", "--help")):
            with self.subTest(arguments=arguments):
                result = subprocess.run(
                    [sys.executable, *arguments], cwd=ROOT,
                    capture_output=True, text=True, check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("Find cross-company project pairs", result.stdout)


if __name__ == "__main__":
    unittest.main()
