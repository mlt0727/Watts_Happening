import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOpportunityScore,
  calculateCostDifference,
  daysBetweenDates,
  distanceBetweenPointsMiles,
  rankOpportunities,
} from "../src/lib/opportunityMetrics.js";

test("calculates absolute calendar-day gaps in UTC", () => {
  assert.equal(daysBetweenDates("2025-06-01", "2026-06-01"), 365);
  assert.equal(daysBetweenDates("2027-06-01", "2025-06-01"), 730);
  assert.equal(daysBetweenDates("2025-02-30", "2025-03-01"), null);
  assert.equal(daysBetweenDates(null, "2025-03-01"), null);
});

test("calculates great-circle distances and rejects invalid coordinates", () => {
  const distance = distanceBetweenPointsMiles(
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
  );

  assert.ok(Math.abs(distance - 69.09) < 0.1);
  assert.equal(
    distanceBetweenPointsMiles({ lat: 91, lon: 0 }, { lat: 0, lon: 0 }),
    null,
  );
});

test("weights timing, distance, and national cost percentile 40/30/30", () => {
  assert.equal(calculateOpportunityScore(0, 0, 1), 100);
  assert.equal(calculateOpportunityScore(1825, 25, 0), 0);
  assert.equal(calculateOpportunityScore(1825, 25, 1), 30);
  assert.equal(calculateOpportunityScore(0, 25, 0), 40);
  assert.equal(calculateOpportunityScore(1825, 0, 0), 30);
  assert.equal(calculateOpportunityScore(2000, 30, 0.5), 15);
  assert.equal(calculateOpportunityScore(null, 5, 1), null);
  assert.equal(calculateOpportunityScore(10, null, 1), null);
  for (const costFit of [undefined, null, NaN, Infinity, -0.1, 1.1, "1"]) {
    assert.equal(calculateOpportunityScore(0, 0, costFit), null);
  }
});

test("ranks scored pairings first and leaves incomplete pairings unranked", () => {
  const ranked = rankOpportunities([
    { location: "Later", daysApart: 365, referenceDistanceMiles: 10 },
    { location: "Incomplete", daysApart: null, referenceDistanceMiles: 2 },
    { location: "Earlier", daysApart: 100, referenceDistanceMiles: 10 },
  ].map((opportunity) => ({
    ...opportunity, descProject: { estimatedCost: 100 }, gpcProject: { estimatedCost: 100 },
  })));

  assert.deepEqual(
    ranked.map(({ location, rank }) => [location, rank]),
    [
      ["Earlier", 1],
      ["Later", 2],
      ["Incomplete", null],
    ],
  );
});

const pair = (id, firstCost, secondCost, daysApart = 0, distance = 0) => ({
  id, location: id, daysApart, referenceDistanceMiles: distance,
  descProject: { id: `${id}-a`, estimatedCost: firstCost },
  gpcProject: { id: `${id}-b`, estimatedCost: secondCost },
});

test("cost differences accept zero and reject missing, textual, negative, and nonfinite estimates", () => {
  assert.equal(calculateCostDifference(0, 0), 0);
  assert.equal(calculateCostDifference(100, 0), 100);
  assert.equal(calculateCostDifference(0, 100), 100);
  for (const invalid of [undefined, null, "", "100", "100–200", -1, NaN, Infinity]) {
    assert.equal(calculateCostDifference(invalid, 100), null);
    assert.equal(calculateCostDifference(100, invalid), null);
    const [ranked] = rankOpportunities([pair("invalid", invalid, 100)]);
    assert.equal(ranked.costDifference, null);
    assert.equal(ranked.costFit, null);
    assert.equal(ranked.score, null);
    assert.equal(ranked.rank, null);
  }
});

test("equal timing and distance favor smaller absolute USD gaps using national percentiles", () => {
  const ranked = rankOpportunities([
    pair("large", 100, 1000),
    pair("medium", 100, 200),
    pair("small", 110, 100),
  ]);
  assert.deepEqual(ranked.map(({ id, costDifference, costFit, score }) =>
    [id, costDifference, costFit, score]), [
    ["small", 10, 1, 100],
    ["medium", 100, 0.5, 85],
    ["large", 900, 0, 70],
  ]);
});

test("cost percentiles use all complete-cost pairs and give tied gaps the same average rank", () => {
  const ranked = rankOpportunities([
    pair("tied-a", 0, 0),
    pair("tied-b", 50, 50),
    pair("middle", 0, 100),
    pair("missing-date", 0, 200, null),
    pair("missing-cost", null, 200),
  ]);
  const byId = Object.fromEntries(ranked.map((opportunity) => [opportunity.id, opportunity]));
  assert.equal(byId["tied-a"].costFit, 1 - 0.5 / 3);
  assert.equal(byId["tied-b"].costFit, byId["tied-a"].costFit);
  assert.equal(byId.middle.costFit, 1 - 2 / 3);
  assert.equal(byId["missing-date"].costFit, 0);
  assert.equal(byId["missing-date"].rank, null);
  assert.equal(byId["missing-cost"].costFit, null);
  assert.equal(rankOpportunities([pair("single", 0, 0)])[0].score, 100);
});

test("tie order is deterministic, and ranking preserves source objects and map numbers", () => {
  const source = [
    Object.freeze({ ...pair("b", 10, 20), location: "Same", mapNumber: 7 }),
    Object.freeze({ ...pair("a", 10, 20), location: "Same", mapNumber: 42 }),
  ];
  const before = structuredClone(source);
  Object.freeze(source);
  const ranked = rankOpportunities(source);
  assert.deepEqual(ranked.map(({ id, rank, mapNumber }) => [id, rank, mapNumber]),
    [["a", 1, 42], ["b", 2, 7]]);
  assert.deepEqual(rankOpportunities([...source].reverse()).map(({ id }) => id), ["a", "b"]);
  assert.deepEqual(source, before);
  assert.notEqual(ranked[0], source[1]);
});
