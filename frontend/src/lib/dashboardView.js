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
  return name || "Unknown utility";
}

export function formatDistance(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value === 0) return "shared station";
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

export function relatedOpportunities(opportunities, projectId, station = null) {
  return rankOpportunities(opportunities.filter((opportunity) => station
    ? sameStation(station, opportunity.descReference) || sameStation(station, opportunity.gpcReference)
    : Boolean(projectId) && (opportunity.descProject.id === projectId || opportunity.gpcProject.id === projectId)));
}

export function companyOpportunities(opportunities, company) {
  const projectIds = new Set(company?.projectIds ?? []);
  return rankOpportunities(opportunities.filter((opportunity) =>
    projectIds.has(opportunity.descProject.id) || projectIds.has(opportunity.gpcProject.id)));
}

export function stationNames(opportunity) {
  return [...new Set([opportunity?.descReference?.name, opportunity?.gpcReference?.name].filter(Boolean))].join(" ↔ ");
}
