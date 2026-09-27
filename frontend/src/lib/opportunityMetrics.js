const MILES_PER_EARTH_RADIUS = 3958.7613;
const MAX_TIMING_WINDOW_DAYS = 1825;
const SCREENING_RADIUS_MILES = 25;

function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return timestamp;
}

export function daysBetweenDates(firstDate, secondDate) {
  const firstTimestamp = parseIsoDate(firstDate);
  const secondTimestamp = parseIsoDate(secondDate);

  if (firstTimestamp === null || secondTimestamp === null) {
    return null;
  }

  return Math.abs(secondTimestamp - firstTimestamp) / 86_400_000;
}

function validatePoint(point) {
  return (
    point &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

export function distanceBetweenPointsMiles(firstPoint, secondPoint) {
  if (!validatePoint(firstPoint) || !validatePoint(secondPoint)) {
    return null;
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDifference = toRadians(secondPoint.lat - firstPoint.lat);
  const longitudeDifference = toRadians(secondPoint.lon - firstPoint.lon);
  const firstLatitude = toRadians(firstPoint.lat);
  const secondLatitude = toRadians(secondPoint.lat);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 2 * MILES_PER_EARTH_RADIUS * Math.asin(Math.sqrt(haversine));
}

export function calculateCostDifference(firstCost, secondCost) {
  if (
    !Number.isFinite(firstCost) || firstCost < 0 ||
    !Number.isFinite(secondCost) || secondCost < 0
  ) {
    return null;
  }
  return Math.abs(firstCost - secondCost);
}

export function calculateOpportunityScore(daysApart, referenceDistanceMiles, costFit) {
  if (
    !Number.isFinite(daysApart) ||
    daysApart < 0 ||
    !Number.isFinite(referenceDistanceMiles) ||
    referenceDistanceMiles < 0 ||
    !Number.isFinite(costFit) ||
    costFit < 0 ||
    costFit > 1
  ) {
    return null;
  }

  const timingFit = Math.max(0, 1 - daysApart / MAX_TIMING_WINDOW_DAYS);
  const geographicFit = Math.max(
    0,
    1 - referenceDistanceMiles / SCREENING_RADIUS_MILES,
  );

  return Math.round((timingFit * 40 + geographicFit * 30 + costFit * 30) * 10) / 10;
}

export function rankOpportunities(opportunities) {
  const withCosts = opportunities.map((opportunity) => ({
    ...opportunity,
    costDifference: calculateCostDifference(
      opportunity.descProject?.estimatedCost,
      opportunity.gpcProject?.estimatedCost,
    ),
  }));
  const gaps = withCosts.map(({ costDifference }) => costDifference)
    .filter((gap) => gap !== null)
    .sort((first, second) => first - second);
  const costFits = new Map();
  // National empirical percentile: smaller gaps rank higher. Ties share their
  // average sorted position; a single complete pair has no larger competitor.
  // Compute this before company/station filtering to keep scores comparable.
  for (let start = 0; start < gaps.length;) {
    let end = start + 1;
    while (end < gaps.length && gaps[end] === gaps[start]) end += 1;
    const averagePosition = (start + end - 1) / 2;
    costFits.set(gaps[start], gaps.length === 1
      ? 1
      : 1 - averagePosition / (gaps.length - 1));
    start = end;
  }

  const compareIdentity = (first, second) =>
    String(first.location ?? "").localeCompare(String(second.location ?? "")) ||
    String(first.id ?? "").localeCompare(String(second.id ?? ""));

  return withCosts
    .map((opportunity) => {
      const costFit = costFits.get(opportunity.costDifference) ?? null;
      return {
        ...opportunity,
        costFit,
        score: calculateOpportunityScore(
          opportunity.daysApart,
          opportunity.referenceDistanceMiles,
          costFit,
        ),
      };
    })
    .sort((first, second) => {
      if (first.score === null && second.score === null) {
        return compareIdentity(first, second);
      }
      if (first.score === null) return 1;
      if (second.score === null) return -1;
      return (
        second.score - first.score ||
        first.daysApart - second.daysApart ||
        first.referenceDistanceMiles - second.referenceDistanceMiles ||
        first.costDifference - second.costDifference ||
        compareIdentity(first, second)
      );
    })
    .map((opportunity, index) => ({
      ...opportunity,
      rank: opportunity.score === null ? null : index + 1,
    }));
}
