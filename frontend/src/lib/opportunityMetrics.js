const MILES_PER_EARTH_RADIUS = 3958.7613;
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

// Mirrors get_savings_rate in src/impact_estimator.py: the same proximity tiers
// set the prototype savings rate and lead the ranking (distance is the primary signal).
export const DISTANCE_TIERS = [
  { rate: 0.15, label: "Shared station", work: "Crossing coordination, outage timing, right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment" },
  { rate: 0.1, label: "Under 1 mi", work: "Right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment" },
  { rate: 0.05, label: "Under 5 mi", work: "Laydown yards, deliveries, crews, and equipment" },
  { rate: 0.03, label: "Under 25 mi", work: "Crews and equipment" },
  { rate: 0, label: "25 mi or more", work: "No significant proximity-based coordination" },
];

export function distanceTier(referenceDistanceMiles) {
  const miles = referenceDistanceMiles;
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (miles === 0) return 0;
  if (miles < 1) return 1;
  if (miles < 5) return 2;
  if (miles < SCREENING_RADIUS_MILES) return 3;
  return 4;
}

// In-service timing is recorded by year only, so gaps are whole years.
export function yearsApart(daysApart) {
  return Number.isFinite(daysApart) && daysApart >= 0 ? Math.round(daysApart / 365) : null;
}

export function rankOpportunities(opportunities) {
  const compareIdentity = (first, second) =>
    String(first.location ?? "").localeCompare(String(second.location ?? "")) ||
    String(first.id ?? "").localeCompare(String(second.id ?? ""));

  return opportunities
    .map((opportunity) => ({
      ...opportunity,
      distanceTier: distanceTier(opportunity.referenceDistanceMiles),
      yearsApart: yearsApart(opportunity.daysApart),
    }))
    .map((opportunity) => ({
      ...opportunity,
      complete: opportunity.distanceTier !== null && opportunity.yearsApart !== null,
    }))
    .sort((first, second) => {
      if (!first.complete || !second.complete) {
        return Number(second.complete) - Number(first.complete) || compareIdentity(first, second);
      }
      return (
        first.distanceTier - second.distanceTier ||
        first.yearsApart - second.yearsApart ||
        first.referenceDistanceMiles - second.referenceDistanceMiles ||
        compareIdentity(first, second)
      );
    })
    .map(({ complete, ...opportunity }, index) => ({
      ...opportunity,
      rank: complete ? index + 1 : null,
    }));
}
