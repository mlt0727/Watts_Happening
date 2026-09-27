import csv
from copy import deepcopy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from backend.dashboard import build_dashboard
from src import impact_estimator


def project(project_id="1", station_id="s1", utility="Utility A", **changes):
    return {
        "project_id": project_id,
        "substation_id": station_id,
        "company_name": utility,
        "project_name": "Shared title",
        "substation_name": station_id,
        "state_code": "SC",
        "state_name": "South Carolina",
        "latitude": 33,
        "longitude": -80,
        "cost": "1000000",
        "cost_source": "estimated",
        "change_type": "Rebuild",
        "estimated_in_service_year": "2027",
        **changes,
    }


def overlap(**changes):
    return {
        "overlap_id": "OVL_1",
        "utility_a": "Utility A",
        "project_id_a": "1",
        "utility_b": "Utility B",
        "project_id_b": "2",
        "project_name_a": "An old title",
        "project_name_b": "An old title",
        "distance_mi": "2.5",
        "time_gap (day)": "365",
        **changes,
    }


class DashboardTest(unittest.TestCase):
    def test_projects_join_by_utility_and_id_not_title(self):
        rows = [project(), project("2", "s2", "Utility B"), project("1", "s3", "Utility B")]
        data = build_dashboard(rows, [overlap(utility_a="  UTILITY   A ", project_id_b=2)])
        candidate = data["opportunities"][0]
        self.assertEqual(len(data["projects"]), 3)
        self.assertEqual(candidate["descProject"]["utility"], "Utility A")
        self.assertEqual(candidate["gpcProject"]["sourceProjectId"], "2")
        self.assertNotEqual(candidate["descProject"]["id"], candidate["gpcProject"]["id"])
        self.assertEqual(candidate["daysApart"], 365)
        self.assertEqual(candidate["referenceDistanceMiles"], 2.5)
        self.assertNotIn("score", candidate)

    def test_repeated_rows_do_not_add_cost_and_keep_title_variations(self):
        rows = [project(), project(station_id="s2", project_name="Alternate title", cost="1000000.00")]
        result = build_dashboard(rows, [])["projects"][0]
        self.assertEqual(result["estimatedCost"], 1000000)
        self.assertEqual(result["aliases"], ["Shared title", "Alternate title"])
        self.assertEqual(result["costSource"], "estimated")
        self.assertEqual(result["plannedYear"], 2027)
        self.assertIsNone(result["plannedDate"])
        self.assertIn("s1 / s2", result["area"])

    def test_closest_endpoints_are_selected_instead_of_first_rows(self):
        rows = [
            project(latitude=0, longitude=0),
            project(station_id="s2", latitude=30, longitude=40),
            project("2", "s3", "Utility B", latitude=-20, longitude=-30),
            project("2", "s4", "Utility B", latitude=30.01, longitude=40.01),
        ]
        result = build_dashboard(rows, [overlap()])
        candidate = result["opportunities"][0]
        self.assertEqual(candidate["descReference"]["lat"], 30)
        self.assertEqual(candidate["gpcReference"]["lat"], 30.01)
        self.assertEqual(candidate["referenceDistanceMiles"], 2.5)  # Stored screening distance remains authoritative.
        self.assertEqual(len(result["referenceAreas"]), 4)
        # Every station must resolve to its project, including endpoints not used
        # by the closest-pair line, so station clicks can find relevant pairings.
        project_ids = {item["sourceProjectId"]: item["id"] for item in result["projects"]}
        for reference in result["referenceAreas"].values():
            expected_project = "1" if reference["name"].startswith(("s1,", "s2,")) else "2"
            self.assertEqual(reference["projectId"], project_ids[expected_project])
        self.assertEqual(candidate["descReference"]["projectId"], candidate["descProject"]["id"])
        self.assertEqual(candidate["gpcReference"]["projectId"], candidate["gpcProject"]["id"])

    def test_station_of_unpaired_project_keeps_owning_project_id(self):
        result = build_dashboard([project()], [])
        reference = next(iter(result["referenceAreas"].values()))
        self.assertEqual(reference["projectId"], result["projects"][0]["id"])
        self.assertEqual(result["opportunities"], [])

    def test_ranges_and_disagreements_are_not_simplified(self):
        result = build_dashboard([project(cost="1500000000-1700000000", estimated_in_service_year="2027 | 2028")], [])["projects"][0]
        self.assertEqual(result["estimatedCost"], "1500000000-1700000000")
        self.assertIsNone(result["plannedYear"])
        self.assertEqual(result["plannedYearLabel"], "2027 | 2028")
        rows = [project(cost="10", estimated_in_service_year="2027"), project(station_id="s2", cost="20", estimated_in_service_year="2029")]
        result = build_dashboard(rows, [])["projects"][0]
        self.assertEqual(result["estimatedCost"], "10 / 20")
        self.assertIsNone(result["plannedYear"])
        self.assertEqual(result["plannedYearLabel"], "2027 / 2029")

    def test_zero_decimal_unknown_cost_and_missing_year_values(self):
        for source, expected in [("0", 0), ("125.50", 125.5), ("", None), (None, None), ("NaN", None), (">1000000000", ">1000000000"), ("$1,000", "$1,000")]:
            with self.subTest(source=source):
                result = build_dashboard([project(cost=source, estimated_in_service_year="NaN")], [])["projects"][0]
                self.assertEqual(result["estimatedCost"], expected)
                self.assertIsNone(result["plannedYear"])
                self.assertIsNone(result["plannedYearLabel"])
        rows = [project(estimated_in_service_year="2027"), project(station_id="s2", estimated_in_service_year="NaN")]
        self.assertEqual(build_dashboard(rows, [])["projects"][0]["plannedYear"], 2027)

    def test_missing_coordinates_and_dates_are_null_and_overlap_is_retained(self):
        rows = [project(latitude=None, longitude="NaN"), project("2", "s2", "Utility B")]
        result = build_dashboard(rows, [overlap(**{"time_gap (day)": ""})])
        candidate = result["opportunities"][0]
        self.assertIsNone(candidate["descReference"])
        self.assertIsNone(candidate["descProject"]["referenceAreaId"])
        self.assertIsNotNone(candidate["gpcReference"])
        self.assertIsNone(candidate["daysApart"])
        self.assertEqual(result["meta"]["overlapCount"], 1)
        json.dumps(result, allow_nan=False)

    def test_unassigned_stations_are_counted_without_fake_projects(self):
        result = build_dashboard([project(), project("", "s2"), project(None, "s3")], [])
        self.assertEqual(result["meta"], {
            "projectRows": 3, "projectCount": 1, "overlapCount": 0,
            "eligibleOverlapCount": 0, "excludedSameCompanyCount": 0,
            "unassignedProjectRows": 2,
        })

    def test_stable_project_id_survives_source_order_and_renaming(self):
        first = build_dashboard([project()], [])["projects"][0]["id"]
        second = build_dashboard([project(project_name="New name", utility=" utility A ")], [])["projects"][0]["id"]
        self.assertEqual(first, second)

    def test_invalid_overlap_data_fails_instead_of_silently_disappearing(self):
        rows = [project(), project("2", "s2", "Utility B")]
        for changes in [
            {"project_id_a": "missing"}, {"utility_b": "another utility"},
            {"overlap_id": ""}, {"distance_mi": None}, {"distance_mi": -1},
            {"distance_mi": "Infinity"}, {"time_gap (day)": "yesterday"}, {"time_gap (day)": -1},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                build_dashboard(rows, [overlap(**changes)])
        with self.assertRaisesRegex(ValueError, "duplicate overlap_id"):
            build_dashboard(rows, [overlap(), overlap()])

    def test_duplicate_substations_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate substation_id"):
            build_dashboard([project(), project()], [])

    def test_same_owners_are_excluded_without_merging_projects_or_changing_sources(self):
        base = "Michigan Electric Transmission Company"
        alias = "Michigan Electric Transmission Company (ITC)"
        legal = "Michigan Electric Transmission Company LLC (ITC Holdings)"
        joint = "Michigan Electric Transmission Company LLC; International Transmission Company (ITC Transmission)"
        distinct = "Utility B"
        rows = [
            project("1", "s1", base),
            project("1", "s2", alias),
            project("2", "s3", legal),
            project("3", "s4", joint),
            project("4", "s5", distinct),
            project("5", "s6", "ITC"),
        ]
        candidates = [
            overlap(overlap_id="same-alias", utility_a=base, utility_b=alias, project_id_b="1"),
            overlap(overlap_id="same-legal", utility_a=base, utility_b=legal, project_id_b="2"),
            overlap(overlap_id="shared-owner", utility_a=alias, utility_b=joint, project_id_b="3"),
            overlap(overlap_id="parent-scope", utility_a="ITC", project_id_a="5", utility_b=alias, project_id_b="1"),
            overlap(overlap_id="eligible-base", utility_a=base, utility_b=distinct, project_id_b="4"),
            overlap(overlap_id="eligible-alias", utility_a=alias, utility_b=distinct, project_id_b="4"),
        ]
        before = deepcopy((rows, candidates))
        before_ids = {item["utility"]: item["id"] for item in build_dashboard(rows, [])["projects"]}
        result = build_dashboard(rows, candidates)
        self.assertEqual((rows, candidates), before)
        self.assertEqual({item["utility"]: item["id"] for item in result["projects"]}, before_ids)
        self.assertNotEqual(before_ids[base], before_ids[alias])
        self.assertEqual(len(result["referenceAreas"]), 6)
        self.assertEqual({item["projectId"] for item in result["referenceAreas"].values()}, set(before_ids.values()))
        self.assertEqual([item["id"] for item in result["opportunities"]], ["eligible-base", "eligible-alias"])
        self.assertEqual(result["opportunities"][0]["descProject"]["utility"], base)
        self.assertEqual(result["opportunities"][1]["descProject"]["utility"], alias)
        self.assertEqual(result["meta"]["projectCount"], 6)
        self.assertEqual(result["meta"]["overlapCount"], 6)
        self.assertEqual(result["meta"]["eligibleOverlapCount"], 2)
        self.assertEqual(result["meta"]["excludedSameCompanyCount"], 4)

    def test_same_company_filter_does_not_hide_invalid_source_records(self):
        base = "Michigan Electric Transmission Company"
        alias = "Michigan Electric Transmission Company (ITC)"
        rows = [project("1", "s1", base), project("2", "s2", alias)]
        valid = overlap(utility_a=base, utility_b=alias)
        for changes in [{"project_id_b": "missing"}, {"distance_mi": None}, {"time_gap (day)": -1}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                build_dashboard(rows, [{**valid, **changes}])

    def test_company_search_groups_aliases_and_includes_every_joint_owner(self):
        base = "Michigan Electric Transmission Company"
        alias = base + " (ITC)"
        legal = base + " LLC"
        joint = "Independent Utility; " + legal
        international = "International Transmission Company (ITC Transmission)"
        rows = [
            project("1", "s1", alias),
            project("2", "s2", base),
            project("3", "s3", joint),
            project("4", "s4", international),
            project("5", "s5", "ITC"),
        ]
        result = build_dashboard(rows, [])
        projects = {item["utility"]: item["id"] for item in result["projects"]}
        companies = {item["name"]: item for item in result["companies"]}
        self.assertEqual(set(companies), {base, "Independent Utility", international, "ITC"})
        self.assertEqual(set(companies[base]["aliases"]), {base, alias, legal})
        self.assertEqual(set(companies[base]["projectIds"]), {projects[base], projects[alias], projects[joint]})
        self.assertEqual(companies["Independent Utility"]["projectIds"], [projects[joint]])
        self.assertEqual(companies[international]["projectIds"], [projects[international]])
        self.assertEqual(companies["ITC"]["projectIds"], [projects["ITC"]])
        self.assertEqual(len({item["id"] for item in result["companies"]}), 4)
        # Source ordering cannot change the company identifier or preferred name.
        reversed_companies = {item["name"]: item["id"] for item in build_dashboard(reversed(rows), [])["companies"]}
        self.assertEqual(reversed_companies, {name: item["id"] for name, item in companies.items()})

    def test_impact_summary_reuses_estimator_with_deduplicated_project_costs(self):
        rows = [
            project(project_name="First project", cost="2000000"),
            project(station_id="s3", project_name="First project", cost="2000000.00"),
            project("2", "s2", "Utility B", project_name="Second project", cost="10000000"),
        ]
        with patch("backend.dashboard.impact_estimator.generate_impact_explanation", wraps=impact_estimator.generate_impact_explanation) as generate:
            summary = build_dashboard(rows, [overlap()])["opportunities"][0]["impactSummary"]
        generate.assert_called_once_with("First project", "Second project", 2000000, 10000000, 2.5)
        self.assertIn("nearest recorded endpoints", summary)
        self.assertIn("2.5 miles apart", summary)
        self.assertIn("combined project cost is $12,000,000", summary)
        self.assertIn("5% prototype savings assumption on the smaller project", summary)
        self.assertIn("savings are approximately $100,000", summary)

    def test_impact_summary_keeps_zero_cost_valid_and_calls_shared_station(self):
        rows = [project(cost="0"), project("2", "s2", "Utility B", cost="1000000")]
        summary = build_dashboard(rows, [overlap(distance_mi="0")])["opportunities"][0]["impactSummary"]
        self.assertIn("shared station", summary)
        self.assertNotIn("0.0 miles", summary)
        self.assertIn("15% prototype savings assumption", summary)
        self.assertIn("savings are approximately $0", summary)

    def test_impact_summary_does_not_invent_savings_for_unusable_costs(self):
        invalid_costs = [None, "", "NaN", "1500000-1700000", ">1000000", "$1,000,000", "unknown", -1, float("inf"), float("nan")]
        for cost in invalid_costs:
            for invalid_side in (0, 1):
                with self.subTest(cost=cost, side=invalid_side):
                    rows = [project(), project("2", "s2", "Utility B")]
                    rows[invalid_side]["cost"] = cost
                    with patch("backend.dashboard.impact_estimator.generate_impact_explanation") as generate:
                        summary = build_dashboard(rows, [overlap()])["opportunities"][0]["impactSummary"]
                    generate.assert_not_called()
                    self.assertIn("laydown yards, deliveries, crews, and equipment", summary)
                    self.assertIn("Estimated savings are unavailable", summary)
                    self.assertIn("both projects need a single valid, nonnegative numeric cost estimate", summary)
                    self.assertIn("prototype assumption", summary)
                    self.assertNotIn("$", summary)

        rows = [project(cost="1000"), project(station_id="s3", cost="2000"), project("2", "s2", "Utility B")]
        summary = build_dashboard(rows, [overlap(distance_mi=0)])["opportunities"][0]["impactSummary"]
        self.assertIn("Estimated savings are unavailable", summary)
        self.assertIn("shared station", summary)
        self.assertNotIn("$", summary)

    def test_impact_summary_uses_existing_distance_thresholds(self):
        rows = [project(cost="1000000"), project("2", "s2", "Utility B", cost="2000000")]
        for distance, rate, savings in [
            (0, "15%", "$150,000"), (0.999, "10%", "$100,000"),
            (1, "5%", "$50,000"), (4.999, "5%", "$50,000"),
            (5, "3%", "$30,000"), (24.999, "3%", "$30,000"),
            (25, "0%", "$0"),
        ]:
            with self.subTest(distance=distance):
                summary = build_dashboard(rows, [overlap(distance_mi=distance)])["opportunities"][0]["impactSummary"]
                self.assertIn(f"Using a {rate} prototype savings assumption", summary)
                self.assertIn(f"savings are approximately {savings}.", summary)

    def test_repository_csv_contract_and_serialization(self):
        data_dir = Path(__file__).resolve().parents[2] / "data"
        with (data_dir / "projects.csv").open(encoding="utf-8-sig", newline="") as source:
            project_rows = list(csv.DictReader(source))
        with (data_dir / "overlaps.csv").open(encoding="utf-8-sig", newline="") as source:
            overlap_rows = list(csv.DictReader(source))
        result = build_dashboard(project_rows, overlap_rows)
        self.assertEqual(result["meta"], {
            "projectRows": 1315, "projectCount": 635, "overlapCount": 799,
            "eligibleOverlapCount": 615, "excludedSameCompanyCount": 184,
            "unassignedProjectRows": 26,
        })
        returned_ids = {item["id"] for item in result["opportunities"]}
        self.assertEqual(len(returned_ids), 615)
        self.assertTrue(returned_ids < {row["overlap_id"] for row in overlap_rows})
        # AEC vs independent companies remain; Michigan source-name variants and
        # the jointly owned Michigan record no longer produce opportunities.
        self.assertTrue({"OVL_1", "OVL_2"}.issubset(returned_ids))
        self.assertTrue({"OVL_656", "OVL_657", "OVL_658", "OVL_659", "OVL_662"}.isdisjoint(returned_ids))
        # ATXI is the plain Ameren Transmission name even in joint-owner lists.
        self.assertNotIn("OVL_255", returned_ids)
        ameren = [company for company in result["companies"] if company["name"].startswith("Ameren Transmission Company of Illinois")]
        self.assertEqual(len(ameren), 1)
        self.assertEqual(set(ameren[0]["aliases"]), {
            "Ameren Transmission Company of Illinois",
            "Ameren Transmission Company of Illinois (ATXI)",
        })
        self.assertEqual(len(ameren[0]["projectIds"]), 5)
        self.assertTrue(all(item["descReference"] and item["gpcReference"] for item in result["opportunities"]))
        self.assertTrue(all(isinstance(item["impactSummary"], str) and item["impactSummary"].strip() for item in result["opportunities"]))
        json.dumps(result, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
