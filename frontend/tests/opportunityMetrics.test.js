import assert from "node:assert/strict";
import test from "node:test";
import {
  DISTANCE_TIERS,
  daysBetweenDates,
  distanceBetweenPointsMiles,
  distanceTier,
  rankOpportunities,
  yearsApart,
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

test("distance tiers match the backend savings rates", () => {
  const cases = [[0, 0.15], [0.4, 0.1], [1, 0.05], [4.99, 0.05], [5, 0.03], [24.9, 0.03], [25, 0], [80, 0]];
  for (const [miles, rate] of cases) {
    assert.equal(DISTANCE_TIERS[distanceTier(miles)].rate, rate, `${miles} mi`);
  }
  for (const invalid of [null, undefined, NaN, -1, "3"]) {
    assert.equal(distanceTier(invalid), null);
  }
});

test("timing gaps are whole years because source dates are years", () => {
  assert.equal(yearsApart(0), 0);
  assert.equal(yearsApart(365), 1);
  assert.equal(yearsApart(730), 2);
  assert.equal(yearsApart(null), null);
  assert.equal(yearsApart(-1), null);
});

const pair = (id, daysApart, referenceDistanceMiles) => ({
  id, location: id, daysApart, referenceDistanceMiles,
  descProject: { id: `${id}-a` }, gpcProject: { id: `${id}-b` },
});

test("proximity tier outranks timing, then years, then exact distance", () => {
  const ranked = rankOpportunities([
    pair("near-late", 1460, 0.5),
    pair("far-same-year", 0, 20),
    pair("shared-late", 730, 0),
    pair("near-soon", 365, 0.9),
    pair("near-soon-closer", 365, 0.2),
    pair("incomplete", null, 0),
  ]);

  assert.deepEqual(
    ranked.map(({ id, rank, distanceTier: tier, yearsApart: years }) => [id, rank, tier, years]),
    [
      ["shared-late", 1, 0, 2],
      ["near-soon-closer", 2, 1, 1],
      ["near-soon", 3, 1, 1],
      ["near-late", 4, 1, 4],
      ["far-same-year", 5, 3, 0],
      ["incomplete", null, 0, null],
    ],
  );
  assert.ok(ranked.every((opportunity) => !("complete" in opportunity)));
});

test("tie order is deterministic, and ranking preserves source objects and map numbers", () => {
  const source = [
    Object.freeze({ ...pair("b", 0, 0), location: "Same", mapNumber: 7 }),
    Object.freeze({ ...pair("a", 0, 0), location: "Same", mapNumber: 42 }),
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
