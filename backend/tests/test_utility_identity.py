import unittest

from src.utility_identity import companies_overlap, company_identities, company_keys


class UtilityIdentityTest(unittest.TestCase):
    def test_company_identities_preserve_individual_owner_names(self):
        value = "Independent Utility; Michigan Electric Transmission Company (ITC); Evergy Kansas Central, Inc."
        identities = company_identities(value)
        self.assertEqual(identities, (
            ("independent utility", "Independent Utility"),
            ("michigan electric transmission", "Michigan Electric Transmission Company (ITC)"),
            ("evergy kansas central", "Evergy Kansas Central, Inc."),
        ))
        self.assertEqual(company_keys(value), frozenset(key for key, _ in identities))
        self.assertEqual(company_identities(""), ())

    def test_confirmed_michigan_suffixes_refer_to_one_operator(self):
        base = "Michigan Electric Transmission Company"
        for variant in [base + " (ITC)", base + ", LLC (ITC Holdings)", "  MICHIGAN  ELECTRIC TRANSMISSION CO. ", "METC"]:
            with self.subTest(variant=variant):
                self.assertEqual(company_keys(base), company_keys(variant))
                self.assertTrue(companies_overlap(base, variant))

    def test_all_explicit_owners_are_compared_not_just_displayed_first(self):
        joint = "Independent Utility; Michigan Electric Transmission Company LLC; International Transmission Company (ITC Transmission)"
        self.assertTrue(companies_overlap(joint, "Michigan Electric Transmission Company (ITC)"))
        self.assertTrue(companies_overlap("Idaho Power, PacifiCorp", "Idaho Power Company; PacifiCorp"))
        self.assertTrue(companies_overlap("Xcel Energy / Xcel Energy, Dairyland Power Cooperative", "Dairyland Power Cooperative"))
        self.assertFalse(companies_overlap(joint, "Xcel Energy"))

    def test_ameren_atxi_alias_matches_plain_name_and_joint_owners(self):
        base = "Ameren Transmission Company of Illinois"
        for alias in [base + " (ATXI)", "ATXI", "atxi, LLC"]:
            with self.subTest(alias=alias):
                self.assertEqual(company_keys(base), company_keys(alias))
        self.assertTrue(companies_overlap(
            base + " (ATXI), Ameren Illinois",
            base + "; GridLiance Heartland LLC",
        ))
        self.assertFalse(companies_overlap("ATXI", "Ameren Illinois"))
        self.assertFalse(companies_overlap("ATXI", "Ameren Missouri"))

    def test_formatting_suffixes_and_known_abbreviations(self):
        for first, second in [
            ("Commonwealth Edison", "Commonwealth Edison Company (ComEd)"),
            ("AEP", "American Electric Power (AEP)"),
            ("American Transmission Company LLC", "ATC"),
            ("Duke Energy Indiana", "Duke Energy Indiana LLC"),
            ("WABASH VALLEY POWER ASSOCIATION, INC.", "Wabash Valley Power Association"),
            ("Virginia Electric & Power Company", "Virginia Electric and Power Company (Dominion Energy)"),
            ("Bonneville Power Administration (BPA) (terminal owner; developer unconfirmed)", "BPA"),
            ("NextEra Energy", "Nextera Energy"),
        ]:
            with self.subTest(first=first):
                self.assertTrue(companies_overlap(first, second))

    def test_similar_names_distinct_subsidiaries_and_unknown_acronyms_are_not_merged(self):
        for first, second in [
            ("ITC Midwest", "ITC Great Plains"),
            ("Michigan Electric Transmission Company", "International Transmission Company"),
            ("Ameren Illinois", "Ameren Missouri"),
            ("Duke Energy Indiana", "Duke Energy Ohio"),
            ("Entergy AR", "Entergy LA"),
            ("Evergy Kansas Central, Inc.", "Evergy Metro Inc."),
            ("APS", "Arizona Public Service"),
            ("Utility (VA)", "Utility (NC)"),
            ("Utility (East)", "Utility (West)"),
            ("Utility (EAST)", "Utility (WEST)"),
            ("Northern States Power (WIS)", "Northern States Power"),
            ("Southern Minnesota Municipal Power Agency (SMMPA Wisconsin LLC)", "Southern Minnesota Municipal Power Agency"),
        ]:
            with self.subTest(first=first, second=second):
                self.assertFalse(companies_overlap(first, second))

    def test_parent_scope_does_not_make_its_subsidiaries_the_same_company(self):
        self.assertTrue(companies_overlap("ITC", "Michigan Electric Transmission Company (ITC)"))
        self.assertTrue(companies_overlap("ITC Midwest", "ITC"))
        self.assertNotEqual(company_keys("ITC"), company_keys("Michigan Electric Transmission Company"))
        self.assertFalse(companies_overlap("ITC Midwest", "Michigan Electric Transmission Company"))
        self.assertFalse(companies_overlap("ITC", "Xcel Energy"))

    def test_legal_suffix_comma_and_parenthetical_commas_are_not_owner_separators(self):
        self.assertEqual(company_keys("Evergy Kansas Central, Inc."), frozenset({"evergy kansas central"}))
        self.assertEqual(len(company_keys("TransCanyon LLC (Berkshire Hathaway, Pinnacle West Capital Corporation)")), 1)
        self.assertEqual(company_keys("Utility A, L.L.C.; Utility B"), frozenset({"utility a", "utility b"}))
        self.assertFalse(companies_overlap("", ""))


if __name__ == "__main__":
    unittest.main()
