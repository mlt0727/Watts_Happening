/**
 * apiClient.js
 *
 * Frontend fetch wrappers for the four project endpoints defined in
 * projectRoutes.js. Adjust BASE_URL to match your backend's deployed
 * location (or leave relative if frontend + backend share an origin).
 */

const BASE_URL = "/api";

/* 1. Search bar — call this on each keystroke (debounce in the component) */
export async function searchProjects(query) {
  const res = await fetch(`${BASE_URL}/projects/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("Search request failed");
  const data = await res.json();
  return data.results; // [{ _id, projectName, utility }, ...]
}

/* 2. Map area selection — call when the user clicks a highlighted map area */
export async function getProjectsInArea({ lng, lat, radiusKm }) {
  const params = new URLSearchParams({ lng, lat, radiusKm });
  const res = await fetch(`${BASE_URL}/projects/area?${params.toString()}`);
  if (!res.ok) throw new Error("Area lookup failed");
  const data = await res.json();
  return data.results; // [{ _id, utility, projectName, plannedInServiceDate, description, source }, ...]
}

/* 3. "View in table" — paginated refresh of the same detail panel */
export async function getProjectsTable({ page = 1, limit = 20, sortBy, sortDir } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (sortBy) params.set("sortBy", sortBy);
  if (sortDir) params.set("sortDir", sortDir);

  const res = await fetch(`${BASE_URL}/projects/table?${params.toString()}`);
  if (!res.ok) throw new Error("Table fetch failed");
  return res.json(); // { results: [...], pagination: { page, limit, totalCount, totalPages } }
}

/* 4. Selecting a project from search results — ranked overlap list */
export async function getOverlappingProjects(projectId, maxDistanceKm = 50) {
  const res = await fetch(
    `${BASE_URL}/projects/${projectId}/overlaps?maxDistanceKm=${maxDistanceKm}`
  );
  if (!res.ok) throw new Error("Overlap lookup failed");
  const data = await res.json();
  return data.results; // [{ utilityA, utilityB, distanceKm, overlapDays, projectType, overlappingProjectId }, ...]
}