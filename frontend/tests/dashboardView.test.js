import assert from "node:assert/strict";
import test from "node:test";
import { firstCompany, formatDistance, relatedOpportunities, companyOpportunities } from "../src/lib/dashboardView.js";

test("shows the first company without cutting legal suffixes or company names", () => {
  assert.equal(firstCompany("AEP, Dominion Energy"), "AEP");
  assert.equal(firstCompany("Idaho Power Company; PacifiCorp"), "Idaho Power Company");
  assert.equal(firstCompany("Xcel Energy / Central Minnesota Municipal Power Agency"), "Xcel Energy");
  assert.equal(firstCompany("Evergy Kansas Central, Inc."), "Evergy Kansas Central, Inc.");
  assert.equal(firstCompany("Example, LLC, Another Utility"), "Example, LLC");
  assert.equal(firstCompany("TransCanyon LLC (Berkshire Hathaway, Pinnacle West Capital Corporation)"), "TransCanyon LLC (Berkshire Hathaway, Pinnacle West Capital Corporation)");
  assert.equal(firstCompany("Virginia Electric and Power Company"), "Virginia Electric and Power Company");
});

test("only exact zero distance is labeled shared station", () => {
  assert.equal(formatDistance(0), "shared station");
  assert.equal(formatDistance(0.01), "<0.1 mi");
  assert.equal(formatDistance(9.63), "9.6 mi");
  assert.equal(formatDistance(null), "Unavailable");
});

const station = { id: "station-a", lat: 38, lon: -78 };
const otherStation = { id: "station-b", lat: 39, lon: -77 };
const pair = (id, first, second, daysApart, referenceDistanceMiles, descReference = station, gpcReference = otherStation) => ({
  id, location: id, mapNumber: Number(id), descProject: { id: first }, gpcProject: { id: second },
  daysApart, referenceDistanceMiles, descReference, gpcReference,
});
const opportunities = [
  pair("433", "selected", "nearby", 365, 5),
  pair("12", "unrelated-a", "unrelated-b", 0, 0, otherStation, otherStation),
  pair("55", "closest", "selected", 0, 0, { ...station, id: "other-project-same-station" }, station),
  pair("66", "selected", "unknown-date", null, 1, otherStation, otherStation),
];

test("ranks only the selected project's pairings on either side and preserves map identity", () => {
  const related = relatedOpportunities(opportunities, "selected");
  assert.deepEqual(related.map(({ id, rank, mapNumber }) => [id, rank, mapNumber]), [["55", 1, 55], ["433", 2, 433], ["66", null, 66]]);
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
