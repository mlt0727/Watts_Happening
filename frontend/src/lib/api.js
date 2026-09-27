const DEFAULT_TIMEOUT_MS = 20_000;

function validateDashboard(data) {
  if (
    !data ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.companies) ||
    !Array.isArray(data.opportunities) ||
    !data.referenceAreas ||
    typeof data.referenceAreas !== "object" ||
    Array.isArray(data.referenceAreas)
  ) {
    throw new Error("The backend returned an invalid dashboard response.");
  }

  const validProject = (project) =>
    project &&
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    typeof project.utility === "string";

  if (
    !data.projects.every(validProject) ||
    !data.opportunities.every(
      (opportunity) =>
        opportunity &&
        typeof opportunity.id === "string" &&
        typeof opportunity.location === "string" &&
        validProject(opportunity.descProject) &&
        validProject(opportunity.gpcProject),
    )
  ) {
    throw new Error("The backend returned incomplete project data.");
  }

  if (!data.opportunities.every((opportunity) =>
    typeof opportunity.impactSummary === "string" && opportunity.impactSummary.trim().length > 0,
  )) {
    throw new Error("The backend returned an invalid impact summary.");
  }

  const projectIds = new Set(data.projects.map((project) => project.id));
  if (!data.companies.every((company) =>
    company &&
    typeof company.id === "string" &&
    typeof company.name === "string" &&
    Array.isArray(company.aliases) &&
    company.aliases.every((alias) => typeof alias === "string") &&
    Array.isArray(company.projectIds) &&
    company.projectIds.every((id) => typeof id === "string" && projectIds.has(id)),
  )) {
    throw new Error("The backend returned invalid company search data.");
  }

  return data;
}

export async function fetchDashboard({
  signal,
  baseUrl = import.meta.env?.VITE_API_BASE_URL ?? "",
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  let timedOut = false;

  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/$/, "")}/api/dashboard`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error(
        response.status === 503
          ? "Cloud data is temporarily unavailable. Please retry shortly."
          : `Unable to load cloud data (HTTP ${response.status}).`,
      );
    }

    return validateDashboard(await response.json());
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new Error("The data request timed out. Please try again.", { cause: error });
    }
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the data service. Please try again.", { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new Error("The data service did not return a valid response.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
