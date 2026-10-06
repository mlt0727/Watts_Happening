import assert from "node:assert/strict";
import test from "node:test";
import { firstCompany, formatDistance, formatYearsApart, possibleAffiliates, orientPair, relatedOpportunities, companyOpportunities, getNationalTopOpportunities, mapRegionTitle } from "../src/lib/dashboardView.js";
import { rankOpportunities } from "../src/lib/opportunityMetrics.js";

test("shows the first company without cutting legal suffixes or company names", () => {
  assert.equal(firstCompany("AEP, Dominion Energy"), "AEP");
  assert.equal(firstCompany("Idaho Power Company; PacifiCorp"), "Idaho Power Company");
  assert.equal(firstCompany("Xcel Energy / Central Minnesota Municipal Power Agency"), "Xcel Energy");
  assert.equal(firstCompany("Evergy Kansas Central, Inc."), "Evergy Kansas Central, Inc.");
  assert.equal(firstCompany("Example, LLC, Another Utility"), "Example, LLC");
  assert.equal(firstCompany("TransCanyon LLC (Berkshire Hathaway, Pinnacle West Capital Corporation)"), "TransCanyon LLC (Berkshire Hathaway, Pinnacle West Capital Corporation)");
  assert.equal(firstCompany("Virginia Electric and Power Company"), "Virginia Electric and Power Company");
  assert.equal(firstCompany(null), "Unknown Utility");
  assert.equal(firstCompany("   "), "Unknown Utility");
});

test("only exact zero distance is labeled shared station", () => {
  assert.equal(formatDistance(0), "Shared station");
  assert.equal(formatDistance(0.01), "<0.1 mi");
  assert.equal(formatDistance(9.63), "9.6 mi");
  assert.equal(formatDistance(null), "Unavailable");
});

test("map heading combines explicit pair regions and removes duplicate regions", () => {
  assert.equal(mapRegionTitle({
    descReference: { region: "Maryland", name: "Station A" },
    gpcReference: { region: "Virginia", name: "Station B" },
  }), "Maryland / Virginia");
  assert.equal(mapRegionTitle({
    descReference: { region: " Indiana ", name: "Station A" },
    gpcReference: { region: "Indiana", name: "Station B" },
  }), "Indiana");
});

test("map heading prioritizes the clicked station's region or intact station name", () => {
  const opportunity = {
    descReference: { region: "Maryland", name: "Station A" },
    gpcReference: { region: "Virginia", name: "Station B" },
  };
  assert.equal(mapRegionTitle(opportunity, { region: "West Virginia", name: "Selected Station" }), "West Virginia");
  assert.equal(mapRegionTitle(opportunity, { region: null, name: "Selected Station, East Yard" }), "Selected Station, East Yard");
});

test("map heading falls back to station names or an exploration prompt without guessing regions", () => {
  assert.equal(mapRegionTitle({
    descReference: { name: "Station A, East Yard" },
    gpcReference: { region: null, name: "Station B" },
  }), "Station A, East Yard ↔ Station B");
  assert.equal(mapRegionTitle({ descReference: { region: "MD" }, gpcReference: null }), "MD");
  assert.equal(mapRegionTitle(null), "Select a Pin to Explore");
  assert.equal(mapRegionTitle({}, { region: " ", name: " " }), "Select a Pin to Explore");
});

const station = { id: "station-a", lat: 38, lon: -78 };
const otherStation = { id: "station-b", lat: 39, lon: -77 };
const pair = (id, first, second, daysApart, referenceDistanceMiles, descReference = station, gpcReference = otherStation) => ({
  id, location: id, mapNumber: Number(id), descProject: { id: first, estimatedCost: 100 }, gpcProject: { id: second, estimatedCost: 100 },
  daysApart, referenceDistanceMiles, descReference, gpcReference,
});
const opportunities = [
  pair("433", "selected", "nearby", 365, 5),
  pair("12", "unrelated-a", "unrelated-b", 0, 0, otherStation, otherStation),
  pair("55", "closest", "selected", 0, 0, { ...station, id: "other-project-same-station" }, station),
  pair("66", "selected", "unknown-date", null, 1, otherStation, otherStation),
];

test("selected project pairings preserve national ranks and map identity", () => {
  const related = relatedOpportunities(opportunities, "selected");
  assert.deepEqual(related.map(({ id, rank, mapNumber }) => [id, rank, mapNumber]), [["55", 2, 55], ["433", 3, 433], ["66", null, 66]]);
  assert.deepEqual(relatedOpportunities(opportunities, "unpaired"), []);
  assert.deepEqual(relatedOpportunities(opportunities, null), []);
});

test("station selection excludes unrelated endpoints even within the same project", () => {
  assert.deepEqual(relatedOpportunities(opportunities, "selected", station).map(({ id }) => id), ["55", "433"]);
  assert.deepEqual(relatedOpportunities(opportunities, "selected", { id: "empty", lat: 40, lon: -76 }), []);
});

test("company selection includes all its projects on either side and excludes unrelated pairs", () => {
  const company = { projectIds: ["selected", "other-owned-project"] };
  const all = [...opportunities, pair("90", "third-party", "other-owned-project", 10, 1)];
  assert.deepEqual(companyOpportunities(all, company).map(({ id }) => id), ["55", "90", "433", "66"]);
  assert.deepEqual(companyOpportunities(all, { projectIds: ["no-matches"] }), []);
});

test("company, project, and station filters keep national ranks", () => {
  const source = [
    pair("1", "other-a", "other-b", 0, 0, otherStation, otherStation),
    pair("2", "selected", "b", 0, 0),
    pair("3", "selected", "c", 365, 0),
  ];
  const before = structuredClone(source);
  const national = rankOpportunities(source);
  const expected = national.slice(1);
  assert.deepEqual(expected.map(({ id, rank, distanceTier, yearsApart }) => [id, rank, distanceTier, yearsApart]),
    [["2", 2, 0, 0], ["3", 3, 0, 1]]);
  for (const input of [source, national]) {
    assert.deepEqual(companyOpportunities(input, { projectIds: ["selected"] }), expected);
    assert.deepEqual(relatedOpportunities(input, "selected"), expected);
    assert.deepEqual(relatedOpportunities(input, "selected", station), expected);
  }
  // Passing an already ranked subset must not promote national #2 to #1.
  assert.deepEqual(companyOpportunities(expected, { projectIds: ["selected"] }), expected);
  assert.deepEqual(getNationalTopOpportunities(national, 2), national.slice(0, 2));
  assert.deepEqual(source, before);
});

test("national Top 20 takes only complete ranked pairs, supports smaller sets, and does not mutate input", () => {
  const source = Array.from({ length: 25 }, (_, index) => ({
    ...pair(String(index + 1).padStart(2, "0"), "a", "b", 0, 0),
    gpcProject: { id: "b", estimatedCost: 100 + index },
  })).reverse();
  source.push(pair("missing-time", "a", "b", null, 0));
  const before = structuredClone(source);
  const top = getNationalTopOpportunities(source);
  assert.equal(top.length, 20);
  assert.deepEqual(top.map(({ rank }) => rank), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(top.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")));
  assert.equal(getNationalTopOpportunities(source, 5).length, 5);
  assert.equal(getNationalTopOpportunities(source, 100).length, 25);
  assert.equal(getNationalTopOpportunities(source.slice(-3)).length, 2);
  assert.deepEqual(getNationalTopOpportunities([]), []);
  assert.deepEqual(getNationalTopOpportunities(source, 0), []);
  assert.deepEqual(getNationalTopOpportunities(source, -1), []);
  assert.deepEqual(getNationalTopOpportunities(source, NaN), []);
  assert.deepEqual(source, before);
});

test("year gaps read as plain language", () => {
  assert.equal(formatYearsApart(0), "Same year");
  assert.equal(formatYearsApart(1), "1 year apart");
  assert.equal(formatYearsApart(3), "3 years apart");
  assert.equal(formatYearsApart(null), "Timing unavailable");
});

const owners = (first, second) => ({ descProject: { utility: first }, gpcProject: { utility: second } });

test("flags owners that share a parent name prefix, not unrelated companies", () => {
  assert.equal(possibleAffiliates(owners("Duke Energy", "Duke Energy Indiana")), true);
  assert.equal(possibleAffiliates(owners("Evergy Metro Inc.", "Evergy")), true);
  assert.equal(possibleAffiliates(owners("AEP Texas", "AEP, Dominion Energy")), true);
  assert.equal(possibleAffiliates(owners("Duke Energy", "Dominion Energy")), false);
  assert.equal(possibleAffiliates(owners("Public Service Company of Colorado", "Public Service Company of New Mexico")), false);
  assert.equal(possibleAffiliates(owners(null, "Xcel Energy")), false);
});

test("anchors the searched side first without reordering unrelated pairs", () => {
  const opportunity = { descProject: { id: "a" }, gpcProject: { id: "b" }, descReference: "ra", gpcReference: "rb" };
  assert.deepEqual(orientPair(opportunity, new Set(["b"])).map(({ project, reference }) => [project.id, reference]), [["b", "rb"], ["a", "ra"]]);
  assert.deepEqual(orientPair(opportunity, new Set(["a"])).map(({ project }) => project.id), ["a", "b"]);
  assert.deepEqual(orientPair(opportunity, new Set(["a", "b"])).map(({ project }) => project.id), ["a", "b"]);
  assert.deepEqual(orientPair(opportunity, null).map(({ project }) => project.id), ["a", "b"]);
});
