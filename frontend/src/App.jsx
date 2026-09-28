import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpportunityMap from "./components/OpportunityMap.jsx";
import { fetchDashboard } from "./lib/api.js";
import { searchDashboard } from "./lib/dashboardSearch.js";
import { rankOpportunities } from "./lib/opportunityMetrics.js";
import { firstCompany, formatDistance, relatedOpportunities, companyOpportunities, getNationalTopOpportunities, stationNames, mapRegionTitle } from "./lib/dashboardView.js";
import "./App.css";

const PAGE_SIZE = 5;
const NATIONAL_LIMIT = 20;
const OPPORTUNITY_TABS = [
  { id: "nationwide", label: "Top 20 Coordination Opportunities" },
  { id: "company", label: "Top Company Pairing" },
];
const EMPTY_PROJECTS = [];
const EMPTY_REFERENCE_AREAS = {};

function projectKey(project) {
  return project.id;
}

function formatDate(project) {
  const value = project.plannedDate;
  if (!value) {
    const years = project.plannedYearLabel ?? project.plannedYear;
    if (!years) return "Not publicly available";
    const yearCount = String(years).match(/\d{4}/g)?.length ?? 1;
    return `${years} (estimated ${yearCount > 1 ? "years" : "year"})`;
  }

  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatGap(value) {
  return value === null ? "Unavailable" : `${value} days`;
}

function formatCost(value) {
  if (value === null || value === undefined || value === "") {
    return "Not publicly available";
  }

  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  return value;
}

function formatProjectWithUtility(project) {
  return `${project.title} (${firstCompany(project.utility)})`;
}

function getProjectType(project) {
  return project.projectType ?? "Unknown";
}

function getPairTypes(opportunity) {
  return `${getProjectType(opportunity.descProject)} + ${getProjectType(
    opportunity.gpcProject,
  )}`;
}

function getTimelineOverlapLabel(opportunity) {
  if (!Number.isFinite(opportunity.daysApart)) {
    return "Timing unavailable";
  }

  const gap = `estimated ${formatGap(opportunity.daysApart)}`;

  if (opportunity.daysApart <= 365) {
    return `Strong overlap (${gap})`;
  }

  if (opportunity.daysApart <= 730) {
    return `Moderate overlap (${gap})`;
  }

  return `Limited overlap (${gap})`;
}

function paginationPages(current, total) {
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 1); page <= Math.min(total, current + 1); page += 1) {
    pages.add(page);
  }
  return [...pages].sort((first, second) => first - second).flatMap((page, index, all) =>
    index && page - all[index - 1] > 1 ? [`gap-${page}`, page] : [page],
  );
}

function ProjectComparison({ project, reference, comparisonClass, onChooseProject }) {
  return (
    <article className={`utility-comparison ${comparisonClass}`}>
      <div className="project-identity">
        <span className="project-identity-marker" aria-hidden="true" />

        <p className="utility-name">
          {firstCompany(project.utility)}
        </p>
      </div>

      <h3>{project.title}</h3>

      <dl>
        {reference && (
          <div>
            <dt>Station</dt>
            <dd>{reference.name}</dd>
          </div>
        )}
        <div>
          <dt>Area</dt>
          <dd>{project.area}</dd>
        </div>

        <div>
          <dt>Project Type(s)</dt>
          <dd>{getProjectType(project)}</dd>
        </div>

        <div>
          <dt>In-Service Date</dt>
          <dd>{formatDate(project)}</dd>
        </div>

        <div>
          <dt>Estimated Cost</dt>
          <dd>{formatCost(project.estimatedCost)}</dd>
        </div>

        {project.sourceProjectId && (
          <div>
            <dt>Project ID</dt>
            <dd>{project.sourceProjectId}</dd>
          </div>
        )}
      </dl>
      <button className="view-button project-matches-button" type="button" onClick={() => onChooseProject(project)}>
        Show This Project&apos;s Matches <span aria-hidden="true">↓</span>
      </button>
    </article>
  );
}

function PairingSummary({ opportunity }) {
  const descProject = opportunity.descProject;
  const gpcProject = opportunity.gpcProject;

  return (
    <section className="pairing-summary" aria-label="Overview">
      <h3 className="pairing-summary-label">Overview</h3>

      <dl className="pairing-summary-details">
        <div>
          <dt>Closest Endpoint Distance</dt>
          <dd>{formatDistance(opportunity.referenceDistanceMiles)}</dd>
        </div>

        <div>
          <dt>Time Gap</dt>
          <dd>{getTimelineOverlapLabel(opportunity)}</dd>
        </div>

        <div>
          <dt>{firstCompany(descProject.utility)} Estimated Cost</dt>
          <dd>{formatCost(descProject.estimatedCost)}</dd>
        </div>

        <div>
          <dt>{firstCompany(gpcProject.utility)} Estimated Cost</dt>
          <dd>{formatCost(gpcProject.estimatedCost)}</dd>
        </div>
        {/*<div>
          <dt>Cost Difference</dt>
          <dd>{formatCost(opportunity.costDifference)}</dd>
        </div>*/}
        <div>
          <dt>Estimated Savings</dt>
          <dd>{formatCost(opportunity.estimatedSavings)}</dd>
        </div>
      </dl>

      <p className="pairing-summary-text">
        {opportunity.impactSummary}
      </p>
    </section>
  );
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedReference, setSelectedReference] = useState(null);
  const [mapFocus, setMapFocus] = useState("pairing");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [opportunitiesTab, setOpportunitiesTab] = useState("company");
  const [scrollRequest, setScrollRequest] = useState(null);
  const detailsSection = useRef(null);
  const opportunitiesSection = useRef(null);

  useEffect(() => {
    if (!scrollRequest) return undefined;
    const frame = requestAnimationFrame(() => {
      const section = scrollRequest.target === "details"
        ? detailsSection.current : opportunitiesSection.current;
      if (!section) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.focus({ preventScroll: true });
      section.scrollIntoView({ behavior: reduceMotion ? "instant" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollRequest]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setDashboard(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [requestVersion]);

  const opportunities = useMemo(
    () => rankOpportunities(dashboard?.opportunities ?? EMPTY_PROJECTS)
      .map((opportunity, index) => ({ ...opportunity, mapNumber: index + 1 })),
    [dashboard],
  );
  const allProjects = dashboard?.projects ?? EMPTY_PROJECTS;
  const companies = dashboard?.companies ?? EMPTY_PROJECTS;
  const mapReferenceAreas = dashboard?.referenceAreas ?? EMPTY_REFERENCE_AREAS;
  const defaultOpportunity = opportunities[0];
  const isLoading = !dashboard && !loadError;

  function retryLoading() {
    setLoadError("");
    setDashboard(null);
    setRequestVersion((version) => version + 1);
  }

  const searchSuggestions = useMemo(
    () => searchDashboard(companies, allProjects, searchQuery),
    [searchQuery, companies, allProjects],
  );

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const activeProjectKey = selectedCompany ? null : selectedProjectKey ?? defaultOpportunity?.descProject.id ?? allProjects[0]?.id;
  const selectedProject = allProjects.find((project) => projectKey(project) === activeProjectKey);

  const filteredOpportunities = useMemo(
    () => selectedCompany
      ? companyOpportunities(opportunities, selectedCompany)
      : relatedOpportunities(opportunities, activeProjectKey, selectedReference),
    [activeProjectKey, selectedReference, selectedCompany, opportunities],
  );

  const nationalOpportunities = useMemo(
    () => getNationalTopOpportunities(opportunities, NATIONAL_LIMIT),
    [opportunities],
  );
  const isNationwide = opportunitiesTab === "nationwide";
  const displayedOpportunities = isNationwide ? nationalOpportunities : filteredOpportunities;
  const pageSize = isNationwide ? NATIONAL_LIMIT : PAGE_SIZE;

  const totalPages = Math.max(
    1,
    Math.ceil(displayedOpportunities.length / pageSize),
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOpportunities = displayedOpportunities.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  );

  const selectedOpportunity =
    displayedOpportunities.find((opportunity) => opportunity.id === selectedId) ??
    displayedOpportunities[0];
  const activeMapReference = isNationwide ? null : selectedReference ??
    (!selectedOpportunity ? mapReferenceAreas[selectedProject?.referenceAreaId] : null);
  const mapTitleReference = mapFocus === "station" || !selectedOpportunity ? activeMapReference : null;

  const highlightedOpportunityIds = useMemo(
    () => displayedOpportunities.map((opportunity) => opportunity.id),
    [displayedOpportunities],
  );

  const selectMapOpportunity = useCallback((id) => {
    const candidate = opportunities.find((item) => item.id === id);
    if (!candidate) return;
    setMapFocus("pairing");
    if (isNationwide && nationalOpportunities.some((item) => item.id === id)) {
      setSelectedId(id);
      setSuggestionsOpen(false);
      return;
    }
    setOpportunitiesTab("company");
    const visibleIndex = filteredOpportunities.findIndex((item) => item.id === id);
    const related = visibleIndex >= 0 ? filteredOpportunities : relatedOpportunities(opportunities, candidate.descProject.id);
    if (visibleIndex < 0) {
      setSelectedCompanyId(null);
      setSelectedProjectKey(candidate.descProject.id);
      setSelectedReference(null);
      setSearchQuery("");
    }
    setSelectedId(id);
    setSuggestionsOpen(false);
    setCurrentPage(Math.floor(Math.max(0, related.findIndex((item) => item.id === id)) / PAGE_SIZE) + 1);
  }, [filteredOpportunities, opportunities, isNationwide, nationalOpportunities]);

  const selectMapReference = useCallback((reference) => {
    const project = allProjects.find((item) => item.id === reference.projectId);
    const related = relatedOpportunities(opportunities, project?.id, reference);
    setMapFocus("station");
    setOpportunitiesTab("company");
    setSelectedReference(reference);
    setSelectedCompanyId(null);
    setSelectedProjectKey(project?.id ?? null);
    setSearchQuery("");
    setSelectedId(related[0]?.id ?? null);
    setCurrentPage(1);
    setSuggestionsOpen(false);
  }, [allProjects, opportunities]);

  function chooseProject(project) {
    const key = projectKey(project);
    setMapFocus("pairing");

    const firstRelatedOpportunity = opportunities.find(
      (opportunity) =>
        projectKey(opportunity.descProject) === key ||
        projectKey(opportunity.gpcProject) === key,
    );

    setOpportunitiesTab("company");
    setSearchQuery(project.title);
    setSelectedCompanyId(null);
    setSelectedProjectKey(key);
    setSelectedReference(null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);

    setSelectedId(firstRelatedOpportunity?.id ?? null);
  }

  function showProjectMatches(project) {
    chooseProject(project);
    setScrollRequest({ target: "opportunities" });
  }

  function chooseCompany(company) {
    const related = companyOpportunities(opportunities, company);
    setMapFocus("pairing");
    setOpportunitiesTab("company");
    setSelectedCompanyId(company.id);
    setSearchQuery(company.name);
    setSelectedProjectKey(null);
    setSelectedReference(null);
    setSelectedId(related[0]?.id ?? null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);
  }

  function chooseSearchResult(result) {
    if (result.kind === "company") {
      chooseCompany(result.item);
    } else {
      chooseProject(result.item);
    }
  }

  function clearSearch() {
    setMapFocus("pairing");
    setOpportunitiesTab("company");
    setSearchQuery("");
    setSelectedProjectKey(null);
    setSelectedCompanyId(null);
    setSelectedReference(null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);
    setSelectedId(defaultOpportunity?.id ?? null);
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }

    if (!suggestionsOpen || !searchSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveSuggestionIndex(
        (index) => (index + 1) % searchSuggestions.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveSuggestionIndex(
        (index) =>
          (index - 1 + searchSuggestions.length) %
          searchSuggestions.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      chooseSearchResult(searchSuggestions[activeSuggestionIndex]);
    }
  }

  function selectOpportunity(opportunity) {
    setMapFocus("pairing");
    setSelectedId(opportunity.id);
  }

  function viewOpportunityDetails(opportunity) {
    setMapFocus("pairing");
    setSelectedId(opportunity.id);
    setScrollRequest({ target: "details" });
  }

  function chooseOpportunitiesTab(tab) {
    setMapFocus("pairing");
    setOpportunitiesTab(tab);
    setCurrentPage(1);
    const candidates = tab === "nationwide" ? nationalOpportunities : filteredOpportunities;
    setSelectedId(candidates.find((item) => item.id === selectedId)?.id ?? candidates[0]?.id ?? null);
  }

  function handleTabKeyDown(event, index) {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % OPPORTUNITY_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + OPPORTUNITY_TABS.length) % OPPORTUNITY_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = OPPORTUNITY_TABS.length - 1;
    else return;
    event.preventDefault();
    chooseOpportunitiesTab(OPPORTUNITY_TABS[nextIndex].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex].focus();
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="header-decoration" aria-hidden="true">
          <span className="header-decoration-yellow" />
          <span className="header-decoration-cream" />
          <span className="header-decoration-lavender" />
        </div>

        <div className="brand">
          <p className="brand-kicker">Sperry Tech × ShellHacks 2026</p>

          <h1>Watts Happening</h1>

          <p className="brand-description">
            Find out what&apos;s happening with power grid companies
          </p>
        </div>

        <div className="header-search">
          <div className="search-with-pikachu">
            <div className="pikachu-walk-track" aria-hidden="true">
              <img
                className="pikachu-walking-gif"
                src="/pikachu-walking.gif"
                alt=""
              />
            </div>

            <div className="project-search">
              <label
                className="visually-hidden"
                htmlFor="dashboard-search-input"
              >
                Search companies or projects
              </label>

              <span className="search-icon" aria-hidden="true" />

              <input
                id="dashboard-search-input"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && Boolean(searchQuery.trim())}
                aria-controls="dashboard-search-suggestions"
                aria-activedescendant={
                  suggestionsOpen && searchSuggestions[activeSuggestionIndex]
                    ? `search-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
                autoComplete="off"
                disabled={isLoading || Boolean(loadError)}
                placeholder="Search companies or projects"
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery.trim()) {
                    setSuggestionsOpen(true);
                  }
                }}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSuggestionsOpen(true);
                  setActiveSuggestionIndex(0);
                  setCurrentPage(1);
                }}
                onKeyDown={handleSearchKeyDown}
              />

              {searchQuery && (
                <button
                  className="search-clear"
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </button>
              )}

              {suggestionsOpen && searchQuery.trim() && (
                <div
                  className="search-suggestions"
                  id="dashboard-search-suggestions"
                  role="listbox"
                >
                  {searchSuggestions.length ? (
                    searchSuggestions.map((result, index) => (
                      <button
                        className={`search-suggestion ${
                          index === activeSuggestionIndex
                            ? "active-suggestion"
                            : ""
                        }`}
                        id={`search-suggestion-${index}`}
                        key={`${result.kind}:${result.item.id}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeSuggestionIndex}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onClick={() => chooseSearchResult(result)}
                      >
                        <span className="suggestion-project-name">
                          {result.kind === "company" ? result.item.name : result.item.title}
                        </span>

                        <span className="suggestion-project-meta">
                          {result.kind === "company"
                            ? `Company · ${result.item.projectIds.length} ${result.item.projectIds.length === 1 ? "project" : "projects"}`
                            : `Project · ${firstCompany(result.item.utility)}`}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="no-search-results">
                      {isLoading ? "Loading companies and projects…" : "No matching companies or projects found."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="map-panel" aria-label="Project endpoint map">
          <div className="map-heading">
            <div>
              <p className="eyebrow">Project Overview</p>
              <h2>{mapRegionTitle(selectedOpportunity, mapTitleReference)}</h2>
            </div>
          </div>

          <OpportunityMap
            opportunity={selectedOpportunity}
            referenceAreas={mapReferenceAreas}
            opportunities={opportunities}
            highlightedOpportunityIds={highlightedOpportunityIds}
            selectedOpportunityId={selectedOpportunity?.id ?? null}
            onSelectOpportunity={selectMapOpportunity}
            selectedReference={activeMapReference}
            onSelectReference={selectMapReference}
          />

          <div className="map-legend" aria-label="Map legend">
            <div className="map-legend-item">
              <span className="legend-reference legend-reference-selected" />
              Selected Project Endpoint
            </div>

            <div className="map-legend-item">
              <span className="legend-reference legend-reference-other" />
              Other Project Endpoint
            </div>

            <div className="map-legend-item">
              <span className="legend-pairing-dot" />
              Other Opportunity
            </div>

            <div className="map-legend-item">
              <span className="legend-related-dot" />
              Related Pairing
            </div>

            <div className="map-legend-item">
              <span className="legend-selected-dot" />
              Selected Map Marker
            </div>

            <div className="map-legend-item">
              <span className="legend-line" />
              Endpoint Comparison
            </div>
          </div>

        </section>

        <aside className="side-panel">
          <section className="description-card" ref={detailsSection} tabIndex={-1} aria-labelledby="project-details-heading">
            {isNationwide ? (
              <div className="selected-project-banner">
                <span>Nationwide Selection</span>
                <strong>{selectedOpportunity ? `Rank ${selectedOpportunity.rank} · United States` : "United States"}</strong>
              </div>
            ) : (selectedProject || selectedCompany) && (
              <div className="selected-project-banner">
                <span>{selectedCompany ? "Selected Company" : selectedReference ? `Selected Station: ${selectedReference.name}` : "Selected Project"}</span>
                <strong>{selectedCompany?.name ?? selectedProject.title}</strong>
              </div>
            )}

            <div className="card-topline">
              <p className="eyebrow">{selectedOpportunity ? `Map Marker ${selectedOpportunity.mapNumber}` : "Selected Station / Project"}</p>
            </div>

            <div className="comparison-header">
              <h2 id="project-details-heading">{stationNames(selectedOpportunity) || (!isNationwide && (selectedReference?.name || selectedCompany?.name || selectedProject?.title)) || (isLoading ? "Loading cloud data…" : "Project Data")}</h2>
            </div>

            {selectedOpportunity ? (
              <div className="comparison-grid">
                <ProjectComparison
                  project={selectedOpportunity.descProject}
                  reference={selectedOpportunity.descReference}
                  comparisonClass="desc-comparison"
                  onChooseProject={showProjectMatches}
                />

                <ProjectComparison
                  project={selectedOpportunity.gpcProject}
                  reference={selectedOpportunity.gpcReference}
                  comparisonClass="gpc-comparison"
                  onChooseProject={showProjectMatches}
                />

                <PairingSummary opportunity={selectedOpportunity} />
              </div>
            ) : (
              <div className="comparison-grid">
                {!isNationwide && selectedProject && (
                  <ProjectComparison project={selectedProject} reference={selectedReference ?? mapReferenceAreas[selectedProject.referenceAreaId]} comparisonClass="desc-comparison" onChooseProject={showProjectMatches} />
                )}
                <p className="no-search-results" role={loadError ? "alert" : "status"}>
                  {isLoading
                    ? "Loading projects and coordination pairings…"
                    : loadError || (isNationwide
                      ? "No nationwide pairings have complete distance, timing, and cost data."
                      : selectedCompany
                      ? "No coordination pairings are available for this company."
                      : selectedReference
                      ? "No coordination pairings are available at this station. Show this project's matches to see its other stations."
                      : selectedProject
                      ? "No coordination pairings are available for this project."
                      : "No coordination pairings are available in the database.")}
                </p>
                {loadError && (
                  <button className="view-button" type="button" onClick={retryLoading}>
                    Retry
                  </button>
                )}
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="opportunities-card" ref={opportunitiesSection} tabIndex={-1} aria-labelledby="top-opportunities-heading">
        <h2 id="top-opportunities-heading">Top Coordination Opportunities</h2>
        <div className="opportunity-tabs" role="tablist" aria-label="Opportunity Rankings">
          {OPPORTUNITY_TABS.map((tab, index) => (
            <button
              key={tab.id}
              id={`${tab.id}-opportunities-tab`}
              className="opportunity-tab"
              type="button"
              role="tab"
              aria-selected={opportunitiesTab === tab.id}
              aria-controls={`${tab.id}-opportunities-panel`}
              tabIndex={opportunitiesTab === tab.id ? 0 : -1}
              onClick={() => chooseOpportunitiesTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {OPPORTUNITY_TABS.filter((tab) => tab.id !== opportunitiesTab).map((tab) => (
          <div key={tab.id} role="tabpanel" id={`${tab.id}-opportunities-panel`} aria-labelledby={`${tab.id}-opportunities-tab`} hidden />
        ))}
        <div className="opportunity-panel" role="tabpanel" id={`${opportunitiesTab}-opportunities-panel`} aria-labelledby={`${opportunitiesTab}-opportunities-tab`} tabIndex={0}>
        {!isNationwide && (selectedCompany || selectedProject || selectedReference) && (
          <p className="active-project-filter">
            Coordination pairings for: <strong>{selectedCompany?.name ?? selectedReference?.name ?? selectedProject?.title}</strong>
            {selectedReference && selectedProject && ` · ${selectedProject.title}`}
          </p>
        )}

        {isNationwide && (
          <p className="active-project-filter">
            The top {nationalOpportunities.length} eligible pairings across the United States, independent of your search.
          </p>
        )}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {isNationwide && <th scope="col">Rank</th>}
                <th>Project (Utility A)</th>
                <th>Project (Utility B)</th>
                <th>Distance</th>
                <th>Time Gap</th>
                {/*<th title="Absolute difference between the two projects' estimated costs">Cost Difference</th>*/}
                <th>Project Type(s)</th>
                <th>View</th>
              </tr>
            </thead>

            <tbody>
              {!paginatedOpportunities.length && (
                <tr>
                  <td colSpan={isNationwide ? 7 : 6}>
                    {isLoading ? "Loading pairings…" : loadError ? "Pairings could not be loaded." : "No matching pairings."}
                  </td>
                </tr>
              )}
              {paginatedOpportunities.map((opportunity) => (
                <tr
                  className={`${
                    selectedOpportunity?.id === opportunity.id
                      ? "active-row "
                      : ""
                  }selectable-row`}
                  key={opportunity.id}
                  onClick={() => selectOpportunity(opportunity)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectOpportunity(opportunity);
                    }
                  }}
                >
                  {isNationwide && <td className="national-rank">{opportunity.rank}</td>}
                  <td>
                    <strong>
                      {formatProjectWithUtility(opportunity.descProject)}
                    </strong>

                    <small className="table-area">
                      {opportunity.descProject.area}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {formatProjectWithUtility(opportunity.gpcProject)}
                    </strong>

                    <small className="table-area">
                      {opportunity.gpcProject.area}
                    </small>
                  </td>

                  <td>{formatDistance(opportunity.referenceDistanceMiles)}</td>

                  <td>{getTimelineOverlapLabel(opportunity)}</td>

                  {/*<td className="cost-difference">{formatCost(opportunity.costDifference)}</td>*/}

                  <td>{getPairTypes(opportunity)}</td>

                  <td>
                    <button
                      className="view-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        viewOpportunityDetails(opportunity);
                      }}
                      aria-label={`View details for ${opportunity.location}`}
                    >
                      View Details <span aria-hidden="true">→</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <nav
          className="table-pagination"
          aria-label="Top coordination opportunities pages"
        >
          <span className="pagination-summary">
            Showing {displayedOpportunities.length ? (safeCurrentPage - 1) * pageSize + 1 : 0}–
            {Math.min(
              safeCurrentPage * pageSize,
              displayedOpportunities.length,
            )}{" "}
            of {displayedOpportunities.length}
          </span>

          {!isNationwide && <div className="pagination-controls">
            <button
              className="pagination-button"
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              disabled={safeCurrentPage === 1}
              aria-label="Previous page"
            >
              Previous
            </button>

            {paginationPages(safeCurrentPage, totalPages).map((page) => {
              if (typeof page !== "number") {
                return <span key={page} aria-hidden="true">…</span>;
              }
              return (
                <button
                  className={`pagination-button pagination-number ${
                    page === safeCurrentPage ? "pagination-current" : ""
                  }`}
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Page ${page}`}
                  aria-current={page === safeCurrentPage ? "page" : undefined}
                >
                  {page}
                </button>
              );
            })}

            <button
              className="pagination-button"
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={safeCurrentPage === totalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>}
        </nav>

        <p className="data-disclaimer">
          Data is loaded from the shared cloud database. Distances and estimated
          timing gaps come from the overlap records; in-service years are source
          estimates, not verified exact dates. Reload to see database updates.
        </p>
        </div>
      </section>
    </main>
  );
}

export default App;
