import assert from "node:assert/strict";
import test from "node:test";
import { firstCompany, formatDistance, relatedOpportunities, companyOpportunities, getNationalTopOpportunities, mapRegionTitle } from "../src/lib/dashboardView.js";
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
  assert.equal(formatDistance(0), "Shared Station");
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

test("company, project, and station filters keep national cost percentiles, scores, and ranks", () => {
  const source = [
    { ...pair("1", "other-a", "other-b", 0, 0, otherStation, otherStation),
      gpcProject: { id: "other-b", estimatedCost: 100 } },
    { ...pair("2", "selected", "b", 0, 0), gpcProject: { id: "b", estimatedCost: 200 } },
    { ...pair("3", "selected", "c", 0, 0), gpcProject: { id: "c", estimatedCost: 1000 } },
  ];
  const before = structuredClone(source);
  const national = rankOpportunities(source);
  const expected = national.slice(1);
  assert.deepEqual(expected.map(({ rank, costFit, score }) => [rank, costFit, score]),
    [[2, 0.5, 85], [3, 0, 70]]);
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

test("national Top 20 takes only complete scored pairs, supports smaller sets, and does not mutate input", () => {
  const source = Array.from({ length: 25 }, (_, index) => ({
    ...pair(String(index + 1).padStart(2, "0"), "a", "b", 0, 0),
    gpcProject: { id: "b", estimatedCost: 100 + index },
  })).reverse();
  source.push({ ...pair("missing-cost", "a", "b", 0, 0), descProject: { id: "a", estimatedCost: null } });
  source.push(pair("missing-time", "a", "b", null, 0));
  const before = structuredClone(source);
  const top = getNationalTopOpportunities(source);
  assert.equal(top.length, 20);
  assert.deepEqual(top.map(({ rank }) => rank), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(top.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, "0")));
  assert.equal(getNationalTopOpportunities(source, 5).length, 5);
  assert.equal(getNationalTopOpportunities(source, 100).length, 25);
  assert.equal(getNationalTopOpportunities(source.slice(-3)).length, 1);
  assert.deepEqual(getNationalTopOpportunities([]), []);
  assert.deepEqual(getNationalTopOpportunities(source, 0), []);
  assert.deepEqual(getNationalTopOpportunities(source, -1), []);
  assert.deepEqual(getNationalTopOpportunities(source, NaN), []);
  assert.deepEqual(source, before);
});
