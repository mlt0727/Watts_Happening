import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpportunityMap from "./components/OpportunityMap.jsx";
import { fetchDashboard } from "./lib/api.js";
import { searchDashboard } from "./lib/dashboardSearch.js";
import { DISTANCE_TIERS, rankOpportunities } from "./lib/opportunityMetrics.js";
import { firstCompany, formatDistance, formatYearsApart, possibleAffiliates, orientPair, relatedOpportunities, companyOpportunities, getNationalTopOpportunities, stationNames, mapRegionTitle } from "./lib/dashboardView.js";
import "./App.css";

const PAGE_SIZE = 10;
const NATIONAL_LIMIT = 20;
const SUGGESTION_LIMIT = 8;
const OPPORTUNITY_TABS = [
  { id: "nationwide", label: "Top 20 nationwide" },
  { id: "company", label: "Your selection" },
];
const EMPTY_PROJECTS = [];
const EMPTY_REFERENCE_AREAS = {};
const SOURCE_URL = "https://www.ourgridfuture.org/";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function projectKey(project) {
  return project.id;
}

function formatDate(project) {
  const value = project.plannedDate;
  if (!value) {
    const years = project.plannedYearLabel ?? project.plannedYear;
    return years ? `${years} (planned year)` : "Not publicly available";
  }

  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function hasCost(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function CostValue({ project }) {
  if (!hasCost(project.estimatedCost)) return "Not publicly available";
  const reported = project.costSource === "known";
  return (
    <>
      {money.format(project.estimatedCost)}{" "}
      <span
        className={`cost-source ${reported ? "cost-source-reported" : "cost-source-model"}`}
        title={reported ? "Cost reported in the Our Grid Future dataset" : "Cost predicted by the Random Forest model; no reported cost exists"}
      >
        {reported ? "Reported" : "Model estimate"}
      </span>
    </>
  );
}

function smallerProject(opportunity) {
  const costs = [opportunity.descProject, opportunity.gpcProject].filter((project) => hasCost(project.estimatedCost));
  return costs.length === 2
    ? costs.reduce((smaller, project) => (project.estimatedCost < smaller.estimatedCost ? project : smaller))
    : null;
}

function formatSavings(opportunity) {
  return hasCost(opportunity.estimatedSavings) ? `≈ ${money.format(opportunity.estimatedSavings)}` : "Not available";
}

function anchorLabel(selectedCompany, selectedReference, selectedProject) {
  if (selectedCompany) return selectedCompany.name;
  if (selectedReference) return `${selectedReference.name} station`;
  return selectedProject?.title;
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

// Original line art: lattice towers carrying three-phase wires across the header.
const TOWERS = [150, 470, 790, 1110];
const WIRE_POINTS = [-170, ...TOWERS, 1370];
const ARMS = [[-24, 32], [24, 32], [-18, 48], [18, 48]];

function wirePath(offset, height) {
  const start = `M${WIRE_POINTS[0] + offset} ${height + 4}`;
  return start + WIRE_POINTS.slice(1).map((x, index) => {
    const from = WIRE_POINTS[index] + offset;
    const to = x + offset;
    return ` Q${(from + to) / 2} ${height + 26} ${to} ${height + 4}`;
  }).join("");
}

function TransmissionLines() {
  return (
    <svg className="header-lines" viewBox="0 0 1200 96" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      {ARMS.map(([offset, height]) => (
        <path key={`${offset}:${height}`} className="header-wire" d={wirePath(offset, height)} />
      ))}
      {TOWERS.map((x) => (
        <g key={x} className="header-tower" transform={`translate(${x} 0)`}>
          <path d="M-14 96 L-4 20 L0 6 L4 20 L14 96 M-24 32 H24 M-18 48 H18 M-4 20 H4 M-11 76 L8 62 M11 76 L-8 62 M-8 62 L6 48 M8 62 L-6 48 M-6 48 L4 32 M6 48 L-4 32" />
          {ARMS.map(([offset, height]) => (
            <path key={`${offset}:${height}`} d={`M${offset} ${height} v4`} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function ProjectComparison({ project, reference, onChooseProject }) {
  return (
    <article className="utility-comparison">
      <p className="utility-name">{firstCompany(project.utility)}</p>
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
          <dt>Project type</dt>
          <dd>{project.projectType ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>In service</dt>
          <dd>{formatDate(project)}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd><CostValue project={project} /></dd>
        </div>
        {project.sourceProjectId && (
          <div>
            <dt>Source ID</dt>
            <dd>{project.sourceProjectId}</dd>
          </div>
        )}
      </dl>
      <button className="text-button" type="button" onClick={() => onChooseProject(project)}>
        Show all matches for this project <span aria-hidden="true">↓</span>
      </button>
    </article>
  );
}

function PairingFacts({ opportunity }) {
  const tier = DISTANCE_TIERS[opportunity.distanceTier];
  const smaller = smallerProject(opportunity);

  return (
    <>
      <dl className="pairing-facts">
        <div>
          <dt>Closest substations</dt>
          <dd>
            {formatDistance(opportunity.referenceDistanceMiles)}
            {tier && opportunity.distanceTier > 0 && <span className="fact-note">{tier.label} tier</span>}
          </dd>
        </div>
        <div>
          <dt>Planned in service</dt>
          <dd>{formatYearsApart(opportunity.yearsApart)}</dd>
        </div>
        <div className="fact-savings">
          <dt>Prototype savings</dt>
          <dd>
            {formatSavings(opportunity)}
            {tier && (
              <span className="fact-note">
                {Math.round(tier.rate * 100)}% of the smaller project&apos;s cost
                {smaller && smaller.costSource !== "known" && " (a model estimate)"}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {possibleAffiliates(opportunity) && (
        <p className="affiliate-note" role="note">
          <strong>Possible affiliates.</strong> {firstCompany(opportunity.descProject.utility)} and{" "}
          {firstCompany(opportunity.gpcProject.utility)} may share a parent company. Confirm they plan
          separately before treating this as a cross-utility opportunity.
        </p>
      )}

      <p className="pairing-summary-text">{opportunity.impactSummary}</p>
    </>
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
  const [opportunitiesTab, setOpportunitiesTab] = useState("nationwide");
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
  const reportedCostCount = allProjects.filter((project) => project.costSource === "known").length;

  function retryLoading() {
    setLoadError("");
    setDashboard(null);
    setRequestVersion((version) => version + 1);
  }

  const searchMatches = useMemo(
    () => searchDashboard(companies, allProjects, searchQuery),
    [searchQuery, companies, allProjects],
  );
  const searchSuggestions = searchMatches.slice(0, SUGGESTION_LIMIT);

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
  const isOverview = isNationwide && selectedId === null;
  const anchorProjectIds = useMemo(
    () => isNationwide ? null : new Set(selectedCompany?.projectIds ?? (activeProjectKey ? [activeProjectKey] : [])),
    [isNationwide, selectedCompany, activeProjectKey],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(displayedOpportunities.length / PAGE_SIZE),
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOpportunities = displayedOpportunities.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  const selectedOpportunity =
    displayedOpportunities.find((opportunity) => opportunity.id === selectedId) ??
    displayedOpportunities[0];
  const activeMapReference = isNationwide ? null : selectedReference ??
    (!selectedOpportunity ? mapReferenceAreas[selectedProject?.referenceAreaId] : null);
  const mapTitleReference = mapFocus === "station" || !selectedOpportunity ? activeMapReference : null;
  const mapTitle = isOverview
    ? "Top 20 pairings nationwide"
    : mapRegionTitle(selectedOpportunity, mapTitleReference);
  const selectionLabel = anchorLabel(selectedCompany, selectedReference, selectedProject);

  const highlightedOpportunityIds = useMemo(
    () => displayedOpportunities.map((opportunity) => opportunity.id),
    [displayedOpportunities],
  );

  const selectMapOpportunity = useCallback((id) => {
    const candidate = opportunities.find((item) => item.id === id);
    if (!candidate) return;
    setMapFocus("pairing");
    const nationalIndex = nationalOpportunities.findIndex((item) => item.id === id);
    if (isNationwide && nationalIndex >= 0) {
      setSelectedId(id);
      setSuggestionsOpen(false);
      setCurrentPage(Math.floor(nationalIndex / PAGE_SIZE) + 1);
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
    setOpportunitiesTab("nationwide");
    setSearchQuery("");
    setSelectedProjectKey(null);
    setSelectedCompanyId(null);
    setSelectedReference(null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);
    setSelectedId(null);
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
      setActiveSuggestionIndex((index) => (index + 1) % searchSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index - 1 + searchSuggestions.length) % searchSuggestions.length);
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
    selectOpportunity(opportunity);
    setScrollRequest({ target: "details" });
  }

  function chooseOpportunitiesTab(tab) {
    setMapFocus("pairing");
    setOpportunitiesTab(tab);
    setCurrentPage(1);
    const candidates = tab === "nationwide" ? nationalOpportunities : filteredOpportunities;
    setSelectedId(candidates.find((item) => item.id === selectedId)?.id ?? (tab === "nationwide" ? null : candidates[0]?.id ?? null));
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

  const detailsContext = !selectedOpportunity
    ? null
    : isNationwide
      ? `#${selectedOpportunity.mapNumber} of the top ${nationalOpportunities.length} nationwide`
      : `#${selectedOpportunity.mapNumber} nationally · matching ${selectionLabel}`;
  const pairSides = selectedOpportunity ? orientPair(selectedOpportunity, anchorProjectIds) : [];

  return (
    <>
      <header className="site-header">
        <TransmissionLines />

        <div className="brand">
          <h1>Watts Happening</h1>
          <p className="brand-description">
            Utilities plan transmission projects years ahead without seeing each other&apos;s plans.
            This map finds planned projects from different utilities close enough to coordinate.
          </p>
          {dashboard && (
            <p className="brand-stats">
              <strong>{allProjects.length.toLocaleString("en-US")}</strong> planned projects ·{" "}
              <strong>{opportunities.length.toLocaleString("en-US")}</strong> cross-utility pairings within 25 mi
            </p>
          )}
        </div>

        <div className="header-search">
          <div className="project-search">
            <label className="visually-hidden" htmlFor="dashboard-search-input">
              Search companies or projects
            </label>

            <svg className="search-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <circle cx="8.5" cy="8.5" r="5.75" />
              <path d="M13 13l4.25 4.25" />
            </svg>

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
              placeholder="Search a utility or project"
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
                aria-label="Clear search and show the nationwide top 20"
                title="Clear search"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}

            {suggestionsOpen && searchQuery.trim() && (
              <div
                className="search-suggestions"
                id="dashboard-search-suggestions"
                role="listbox"
                aria-label="Matching utilities and projects"
              >
                {searchSuggestions.length ? (
                  <>
                    {searchSuggestions.map((result, index) => (
                      <button
                        className={`search-suggestion ${index === activeSuggestionIndex ? "active-suggestion" : ""}`}
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
                            ? `Utility · ${result.item.projectIds.length} ${result.item.projectIds.length === 1 ? "project" : "projects"}`
                            : `Project · ${firstCompany(result.item.utility)}`}
                        </span>
                      </button>
                    ))}
                    {searchMatches.length > SUGGESTION_LIMIT && (
                      <p className="suggestion-overflow">
                        Showing {SUGGESTION_LIMIT} of {searchMatches.length} matches. Keep typing to narrow them.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="no-search-results">
                    {isLoading ? "Loading utilities and projects…" : "No utility or project matches that search."}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-shell">
        <section className="dashboard-grid">
          <section className="map-panel" aria-labelledby="map-heading">
            <div className="panel-heading">
              <h2 id="map-heading">{mapTitle}</h2>
              <a className="skip-link" href="#pairing-details">Skip map</a>
            </div>

            <OpportunityMap
              opportunity={selectedOpportunity}
              referenceAreas={mapReferenceAreas}
              opportunities={opportunities}
              highlightedOpportunityIds={highlightedOpportunityIds}
              selectedOpportunityId={selectedOpportunity?.id ?? null}
              onSelectOpportunity={selectMapOpportunity}
              selectedReference={activeMapReference}
              overview={isOverview}
              onSelectReference={selectMapReference}
            />

            <ul className="map-legend" aria-label="Map legend">
              <li><span className="legend-marker legend-marker-selected" aria-hidden="true" />Selected pairing</li>
              <li><span className="legend-marker legend-marker-related" aria-hidden="true" />{isNationwide ? "Top 20 pairing" : "Matches your selection"}</li>
              <li><span className="legend-marker legend-marker-other" aria-hidden="true" />Other pairing</li>
              <li><span className="legend-station" aria-hidden="true" />Substation</li>
              <li><span className="legend-line" aria-hidden="true" />Straight-line gap (not a route)</li>
            </ul>
          </section>

          <section
            className="details-card"
            id="pairing-details"
            ref={detailsSection}
            tabIndex={-1}
            aria-labelledby="pairing-heading"
          >
            {detailsContext && <p className="details-context">{detailsContext}</p>}
            <h2 id="pairing-heading">
              {stationNames(selectedOpportunity) ||
                (!isNationwide && selectionLabel) ||
                (isLoading ? "Loading pairings…" : "Pairing details")}
            </h2>

            {selectedOpportunity ? (
              <>
                <PairingFacts opportunity={selectedOpportunity} />
                <div className="comparison-grid">
                  {pairSides.map(({ project, reference }) => (
                    <ProjectComparison
                      key={project.id}
                      project={project}
                      reference={reference}
                      onChooseProject={showProjectMatches}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="details-empty">
                {!isNationwide && selectedProject && (
                  <div className="comparison-grid">
                    <ProjectComparison
                      project={selectedProject}
                      reference={selectedReference ?? mapReferenceAreas[selectedProject.referenceAreaId]}
                      onChooseProject={showProjectMatches}
                    />
                  </div>
                )}
                <p className="status-message" role={loadError ? "alert" : "status"}>
                  {isLoading
                    ? "Loading projects and coordination pairings…"
                    : loadError || (isNationwide
                      ? "No pairing has complete distance and timing data yet."
                      : selectedCompany
                      ? "None of this utility's projects is within 25 mi of another utility's project."
                      : selectedReference
                      ? "No other utility has a project at this station. Show all matches for the project to check its other stations."
                      : selectedProject
                      ? "No other utility has a project within 25 mi of this one."
                      : "No coordination pairings are available.")}
                </p>
                {loadError && (
                  <button className="primary-button" type="button" onClick={retryLoading}>
                    Try again
                  </button>
                )}
              </div>
            )}
          </section>

          <section
            className="opportunities-card"
            ref={opportunitiesSection}
            tabIndex={-1}
            aria-labelledby="top-opportunities-heading"
          >
            <div className="opportunities-header">
              <h2 id="top-opportunities-heading">Coordination opportunities</h2>
              <div className="opportunity-tabs" role="tablist" aria-label="Opportunity lists">
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
            </div>

            {OPPORTUNITY_TABS.filter((tab) => tab.id !== opportunitiesTab).map((tab) => (
              <div key={tab.id} role="tabpanel" id={`${tab.id}-opportunities-panel`} aria-labelledby={`${tab.id}-opportunities-tab`} hidden />
            ))}
            <div className="opportunity-panel" role="tabpanel" id={`${opportunitiesTab}-opportunities-panel`} aria-labelledby={`${opportunitiesTab}-opportunities-tab`}>
              <p className="list-context">
                {isNationwide
                  ? `The ${nationalOpportunities.length} closest cross-utility pairings in the United States, ranked by distance tier, then by years between planned in-service dates.`
                  : selectionLabel
                    ? <>Pairings that include <strong>{selectionLabel}</strong>, in national rank order.</>
                    : "Search a utility or project, or pick a station on the map."}
              </p>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" title="Position in the national ranking">#</th>
                      <th scope="col">{isNationwide ? "Project A" : "Selected side"}</th>
                      <th scope="col">{isNationwide ? "Project B" : "Paired project"}</th>
                      <th scope="col">Distance</th>
                      <th scope="col">In service</th>
                      <th scope="col">Prototype savings</th>
                      <th scope="col"><span className="visually-hidden">Details</span></th>
                    </tr>
                  </thead>

                  <tbody>
                    {!paginatedOpportunities.length && (
                      <tr>
                        <td colSpan={7}>
                          {isLoading ? "Loading pairings…" : loadError ? "Pairings could not be loaded." : "No pairings match this selection."}
                        </td>
                      </tr>
                    )}
                    {paginatedOpportunities.map((opportunity) => {
                      const [first, second] = orientPair(opportunity, anchorProjectIds);
                      const active = selectedOpportunity?.id === opportunity.id;
                      return (
                        <tr
                          className={`selectable-row${active ? " active-row" : ""}`}
                          key={opportunity.id}
                          onClick={() => selectOpportunity(opportunity)}
                        >
                          <td className="rank-cell" data-label="#">{opportunity.mapNumber}</td>
                          {[first, second].map(({ project }, index) => (
                            <td key={project.id} data-label={index ? "Paired with" : "Project"}>
                              <span className="table-utility">{firstCompany(project.utility)}</span>
                              <span className="table-project">{project.title}</span>
                              <span className="table-area">{project.area}</span>
                              {index === 1 && possibleAffiliates(opportunity) && (
                                <span className="tag" title="The owners share a parent name. Confirm they plan separately.">Possible affiliates</span>
                              )}
                            </td>
                          ))}
                          <td className="numeric" data-label="Distance">{formatDistance(opportunity.referenceDistanceMiles)}</td>
                          <td data-label="In service">{formatYearsApart(opportunity.yearsApart)}</td>
                          <td className="numeric" data-label="Savings">{formatSavings(opportunity)}</td>
                          <td className="action-cell">
                            <button
                              className={active ? "row-button row-button-active" : "row-button"}
                              type="button"
                              aria-current={active ? "true" : undefined}
                              onClick={(event) => {
                                event.stopPropagation();
                                viewOpportunityDetails(opportunity);
                              }}
                              aria-label={`Show details for #${opportunity.mapNumber}: ${stationNames(opportunity)}`}
                            >
                              Details <span aria-hidden="true">→</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <nav className="table-pagination" aria-label="Opportunity list pages">
                <span className="pagination-summary">
                  Showing {displayedOpportunities.length ? (safeCurrentPage - 1) * PAGE_SIZE + 1 : 0}–
                  {Math.min(safeCurrentPage * PAGE_SIZE, displayedOpportunities.length)} of {displayedOpportunities.length}
                </span>

                {totalPages > 1 && (
                  <div className="pagination-controls">
                    <button
                      className="pagination-button"
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safeCurrentPage === 1}
                    >
                      Previous
                    </button>

                    {paginationPages(safeCurrentPage, totalPages).map((page) => {
                      if (typeof page !== "number") {
                        return <span className="pagination-gap" key={page} aria-hidden="true">…</span>;
                      }
                      return (
                        <button
                          className={`pagination-button pagination-number${page === safeCurrentPage ? " pagination-current" : ""}`}
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
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safeCurrentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </nav>

              <details className="method">
                <summary>How pairings are ranked and estimated</summary>
                <ul>
                  <li><strong>Distance</strong> is the straight line between the two projects&apos; closest substations. Pairings up to 25 mi apart are screened.</li>
                  <li><strong>Ranking</strong> sorts by distance tier first, then by years between planned in-service dates, then by exact distance.</li>
                  <li><strong>Timing</strong> uses planned in-service years from the source data. Exact dates are not published.</li>
                  <li>
                    <strong>Costs</strong> marked <span className="cost-source cost-source-reported">Reported</span> come from the source dataset.
                    Costs marked <span className="cost-source cost-source-model">Model estimate</span> were predicted by a Random Forest model trained on the reported ones
                    {dashboard ? ` (${reportedCostCount} of ${allProjects.length} projects have a reported cost)` : ""}.
                  </li>
                  <li><strong>Prototype savings</strong> apply the tier&apos;s rate to the smaller project&apos;s cost. They illustrate scale only; they are not engineering assessments or guaranteed savings.</li>
                </ul>
                <table className="tier-table">
                  <thead>
                    <tr>
                      <th scope="col">Distance tier</th>
                      <th scope="col">Rate</th>
                      <th scope="col">Work the projects could share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DISTANCE_TIERS.slice(0, -1).map((tier) => (
                      <tr key={tier.label}>
                        <td>{tier.label}</td>
                        <td className="numeric">{Math.round(tier.rate * 100)}%</td>
                        <td>{tier.work}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          </section>
        </section>
      </main>

      <footer className="site-footer">
        <p>
          Built for the Sperry Tech Gridlock Challenge at ShellHacks 2026 by Shirina Daniel, Monica Barbosa,
          Lingtong Meng and Kevin Wilson.
        </p>
        <p>
          Project data: <a href={SOURCE_URL} target="_blank" rel="noreferrer">Our Grid Future Planned Transmission Projects</a>, June 2026.
          Proximity does not establish that two projects can feasibly coordinate.
        </p>
      </footer>
    </>
  );
}

export default App;
