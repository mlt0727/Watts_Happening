import { rankOpportunities } from "./opportunityMetrics.js";

const COMPANY_SUFFIX = /^(?:incorporated|inc\.?|llc|l\.l\.c\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|lp|l\.p\.?)(?=\s*(?:$|[,;/]))/i;

export function firstCompany(value) {
  const name = String(value ?? "").trim();
  let depth = 0;
  for (let index = 0; index < name.length; index += 1) {
    const character = name[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (depth) continue;
    const isSeparator = character === ";" ||
      (character === "/" && /\s/.test(name[index - 1] ?? "") && /\s/.test(name[index + 1] ?? "")) ||
      (character === "," && !COMPANY_SUFFIX.test(name.slice(index + 1).trim()));
    if (isSeparator) return name.slice(0, index).trim();
  }
  return name || "Unknown Utility";
}

export function formatDistance(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value === 0) return "Shared Station";
  return value < 0.05 ? "<0.1 mi" : `${value.toFixed(1)} mi`;
}

export function sameStation(first, second) {
  if (!first || !second) return false;
  if (first.id && first.id === second.id) return true;
  return Number.isFinite(first.lat) && Number.isFinite(first.lon) &&
    Number.isFinite(second.lat) && Number.isFinite(second.lon) &&
    Math.abs(first.lat - second.lat) < 0.000001 &&
    Math.abs(first.lon - second.lon) < 0.000001;
}

function globallyRanked(opportunities) {
  // App supplies the national ranking. Raw standalone inputs are ranked across
  // their entire input once, before filtering; pre-ranked subsets retain rank.
  const rankingFields = ["score", "rank", "costDifference", "costFit"];
  return opportunities.every((opportunity) =>
    rankingFields.every((field) => Object.hasOwn(opportunity, field)))
    ? opportunities
    : rankOpportunities(opportunities);
}

export function relatedOpportunities(opportunities, projectId, station = null) {
  return globallyRanked(opportunities).filter((opportunity) => station
    ? sameStation(station, opportunity.descReference) || sameStation(station, opportunity.gpcReference)
    : Boolean(projectId) && (opportunity.descProject.id === projectId || opportunity.gpcProject.id === projectId));
}

export function companyOpportunities(opportunities, company) {
  const projectIds = new Set(company?.projectIds ?? []);
  return globallyRanked(opportunities).filter((opportunity) =>
    projectIds.has(opportunity.descProject.id) || projectIds.has(opportunity.gpcProject.id));
}

export function getNationalTopOpportunities(opportunities, limit = 20) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return globallyRanked(opportunities)
    .filter((opportunity) => Number.isFinite(opportunity.score) &&
      Number.isFinite(opportunity.rank))
    .slice(0, Math.floor(limit));
}

export function stationNames(opportunity) {
  return [...new Set([opportunity?.descReference?.name, opportunity?.gpcReference?.name].filter(Boolean))].join(" ↔ ");
}

export function mapRegionTitle(opportunity, selectedReference = null) {
  const selectedTitle = [selectedReference?.region, selectedReference?.name]
    .find((value) => typeof value === "string" && value.trim());
  if (selectedTitle) return selectedTitle.trim();

  const regions = [...new Set(
    [opportunity?.descReference?.region, opportunity?.gpcReference?.region]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim()),
  )];
  return regions.join(" / ") || stationNames(opportunity).trim() || "Select a Pin to Explore";
}
