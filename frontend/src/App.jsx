import { useEffect, useMemo, useState } from "react";
import OpportunityMap from "./components/OpportunityMap.jsx";
import {
  mapReferenceAreas,
  opportunities as fallbackOpportunities,
} from "./data/opportunities.js";
import { rankOpportunities } from "./lib/opportunityMetrics.js";
import "./App.css";

const PAGE_SIZE = 20;

function projectKey(project) {
  return `${project.utility}:${project.title}`;
}

function normalizeSearchText(value) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDate(value) {
  if (!value) return "Not source-verified";

  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDistance(value) {
  return value === null ? "Unavailable" : `${value.toFixed(1)} mi`;
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

function utilityAbbreviation(utility) {
  const abbreviations = {
    "Dominion Energy South Carolina": "DESC",
    "Georgia Power": "GPC",
  };

  const normalizedUtility = String(utility ?? "").trim();
  return abbreviations[normalizedUtility] ?? truncateText(normalizedUtility, 75);
}

function truncateText(value, maxLength = 75) {
  if (value == null) {
    return "";
  }

  const text = String(value).trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}…`;
}

function formatProjectWithUtility(project) {
  return `${truncateText(project.title, 75)} (${utilityAbbreviation(project.utility)})`;
}

function getProjectType(project) {
  return project.projectType ?? "Transmission Line";
}

function getPairTypes(opportunity) {
  return `${getProjectType(opportunity.descProject)} + ${getProjectType(
    opportunity.gpcProject,
  )}`;
}

function getTimelineOverlapLabel(opportunity) {
  const hasBothDates =
    opportunity.descProject.plannedDate !== null &&
    opportunity.gpcProject.plannedDate !== null;

  if (!hasBothDates || opportunity.daysApart === null) {
    return "Needs date verification";
  }

  if (opportunity.daysApart <= 365) {
    return `Strong overlap (${formatGap(opportunity.daysApart)})`;
  }

  if (opportunity.daysApart <= 730) {
    return `Moderate overlap (${formatGap(opportunity.daysApart)})`;
  }

  return `Limited overlap (${formatGap(opportunity.daysApart)})`;
}

function ProjectComparison({ project, comparisonClass }) {
  const isVerified = project.plannedDate !== null;

  return (
    <article className={`utility-comparison ${comparisonClass}`}>
      <div className="project-identity">
        <span className="project-identity-marker" aria-hidden="true" />

        <p className="utility-name">
          {truncateText(project.utility, 75)} ({utilityAbbreviation(project.utility)})
        </p>
      </div>

      <h3>{truncateText(project.title, 75)}</h3>

      <dl>
        <div>
          <dt>Area</dt>
          <dd>{project.area}</dd>
        </div>

        <div>
          <dt>Project type</dt>
          <dd>{getProjectType(project)}</dd>
        </div>

        <div>
          <dt>In-service date</dt>
          <dd>{formatDate(project.plannedDate)}</dd>
        </div>

        <div>
          <dt>Estimated cost</dt>
          <dd>{formatCost(project.estimatedCost)}</dd>
        </div>

        <div>
          <dt>Source check</dt>
          <dd className={isVerified ? "source-verified" : "source-pending"}>
            {project.sourceStatus}
          </dd>
        </div>

        {project.sourceProjectId && (
          <div>
            <dt>Project ID</dt>
            <dd>{project.sourceProjectId}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function PairingSummary({ opportunity }) {
  const descProject = opportunity.descProject;
  const gpcProject = opportunity.gpcProject;
  const impact = opportunity.impact ?? {
    combinedCost: Number(descProject.estimatedCost ?? 0) + Number(gpcProject.estimatedCost ?? 0),
    estimatedSavings: 0,
    savingsRate: 0,
    coordinationType: "project coordination",
  };
  const distanceMiles = Number(opportunity.referenceDistanceMiles ?? 0);
  const combinedCost = Number(impact.combinedCost ?? 0);
  const estimatedSavings = Number(impact.estimatedSavings ?? 0);
  const savingsRate = Number(impact.savingsRate ?? 0);
  const coordinationType = impact.coordinationType ?? "project coordination";

  const summaryText = `${descProject.title} and ${gpcProject.title} are ${distanceMiles.toFixed(1)} miles apart and have an estimated combined project cost of ${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(combinedCost)}. Potential coordination includes ${coordinationType}. Using a ${(savingsRate * 100).toFixed(1)}% prototype savings assumption on the smaller project, the estimated potential savings are approximately ${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(estimatedSavings)}.`;

  return (
    <section className="pairing-summary" aria-label="Overview">
      <p className="pairing-summary-label">Overview</p>

      <p className="pairing-summary-text">{summaryText}</p>

      <dl className="pairing-summary-details">
        <div>
          <dt>Reference distance</dt>
          <dd>{formatDistance(opportunity.referenceDistanceMiles)}</dd>
        </div>

        <div>
          <dt>Timeline overlap</dt>
          <dd>{getTimelineOverlapLabel(opportunity)}</dd>
        </div>

        <div>
          <dt>{`${truncateText(descProject.title, 75)} estimated cost`}</dt>
          <dd>{formatCost(descProject.estimatedCost)}</dd>
        </div>

        <div>
          <dt>{`${truncateText(gpcProject.title, 75)} estimated cost`}</dt>
          <dd>{formatCost(gpcProject.estimatedCost)}</dd>
        </div>
      </dl>
    </section>
  );
}

function App() {
  const [opportunities, setOpportunities] = useState(fallbackOpportunities);
  const [selectedId, setSelectedId] = useState(
    fallbackOpportunities[0]?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [projectSuggestions, setProjectSuggestions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/opportunities")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const rawOpportunities = data.results ?? fallbackOpportunities;
        const nextOpportunities = rankOpportunities(rawOpportunities);

        if (isMounted) {
          setOpportunities(nextOpportunities);
          if (!nextOpportunities.some((opportunity) => opportunity.id === selectedId)) {
            setSelectedId(nextOpportunities[0]?.id ?? null);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setOpportunities(rankOpportunities(fallbackOpportunities));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedId]);

  const allProjects = useMemo(
    () =>
      Array.from(
        new Map(
          opportunities.flatMap((opportunity) =>
            [opportunity.descProject, opportunity.gpcProject].map((project) => [
              projectKey(project),
              project,
            ]),
          ),
        ).values(),
      ),
    [opportunities],
  );

  const rankedOpportunities = useMemo(
    () =>
      [...opportunities].sort((first, second) => {
        const firstScore = Number.isFinite(first.score) ? first.score : Number.POSITIVE_INFINITY;
        const secondScore = Number.isFinite(second.score) ? second.score : Number.POSITIVE_INFINITY;

        if (firstScore !== secondScore) {
          return firstScore - secondScore;
        }

        const firstDistance = first.referenceDistanceMiles ?? Number.POSITIVE_INFINITY;
        const secondDistance = second.referenceDistanceMiles ?? Number.POSITIVE_INFINITY;
        const firstTiming = first.daysApart ?? Number.POSITIVE_INFINITY;
        const secondTiming = second.daysApart ?? Number.POSITIVE_INFINITY;

        if (firstDistance !== secondDistance) {
          return firstDistance - secondDistance;
        }

        if (firstTiming !== secondTiming) {
          return firstTiming - secondTiming;
        }

        return String(first.location ?? "").localeCompare(String(second.location ?? ""));
      }),
    [opportunities],
  );

  const defaultOpportunity = rankedOpportunities[0] ?? opportunities[0] ?? null;

  const normalizedQuery = normalizeSearchText(searchQuery);

  useEffect(() => {
    if (!normalizedQuery) {
      setProjectSuggestions([]);
      return undefined;
    }

    let isActive = true;

    fetch(`/api/projects/search?q=${encodeURIComponent(normalizedQuery)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const nextSuggestions = payload.results ?? [];

        if (isActive) {
          setProjectSuggestions(nextSuggestions);
        }
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        const fallbackSuggestions = allProjects.filter((project) => {
          const searchValues = [
            project.title,
            project.utility,
            project.area,
            project.sourceProjectId,
            ...(project.aliases ?? []),
          ]
            .filter(Boolean)
            .map(normalizeSearchText);

          return searchValues.some((value) => value.includes(normalizedQuery));
        });

        setProjectSuggestions(fallbackSuggestions);
      });

    return () => {
      isActive = false;
    };
  }, [normalizedQuery, allProjects]);

  const selectedProject = allProjects.find(
    (project) => projectKey(project) === selectedProjectKey,
  );

  const filteredOpportunities = useMemo(() => {
    const baseOpportunities = rankedOpportunities.length
      ? rankedOpportunities
      : opportunities;

    if (!selectedProject) {
      return baseOpportunities;
    }

    return baseOpportunities.filter(
      (opportunity) =>
        projectKey(opportunity.descProject) === selectedProjectKey ||
        projectKey(opportunity.gpcProject) === selectedProjectKey,
    );
  }, [rankedOpportunities, selectedProject, selectedProjectKey, opportunities]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredOpportunities.length / PAGE_SIZE),
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOpportunities = filteredOpportunities.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  const selectedOpportunity =
    opportunities.find((opportunity) => opportunity.id === selectedId) ??
    defaultOpportunity ??
    null;

  const selectedOpportunityMap = selectedOpportunity
    ? {
        ...selectedOpportunity,
        descReference:
          selectedOpportunity.descReference ?? Object.values(mapReferenceAreas)[0],
        gpcReference:
          selectedOpportunity.gpcReference ??
          Object.values(mapReferenceAreas)[1] ??
          Object.values(mapReferenceAreas)[0],
      }
    : null;

  const highlightedOpportunityIds = useMemo(() => {
    if (!selectedOpportunity) {
      return [];
    }

    if (selectedProject) {
      return filteredOpportunities.map((opportunity) => opportunity.id);
    }

    return [selectedOpportunity.id];
  }, [selectedProject, filteredOpportunities, selectedOpportunity]);

  function chooseProject(project) {
    const key = project.key ?? projectKey(project);

    const firstRelatedOpportunity = opportunities.find(
      (opportunity) =>
        projectKey(opportunity.descProject) === key ||
        projectKey(opportunity.gpcProject) === key,
    );

    setSearchQuery(project.title ?? project.utility ?? "");
    setSelectedProjectKey(key);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);

    if (firstRelatedOpportunity) {
      setSelectedId(firstRelatedOpportunity.id);
    }
  }

  function clearProjectSearch() {
    setSearchQuery("");
    setSelectedProjectKey(null);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
    setCurrentPage(1);
    setSelectedId(defaultOpportunity.id);
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }

    if (!suggestionsOpen || !projectSuggestions.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveSuggestionIndex(
        (index) => (index + 1) % projectSuggestions.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setActiveSuggestionIndex(
        (index) =>
          (index - 1 + projectSuggestions.length) %
          projectSuggestions.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      chooseProject(projectSuggestions[activeSuggestionIndex]);
    }
  }

  function selectOpportunity(opportunity) {
    setSelectedId(opportunity.id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (!selectedOpportunity) {
    return (
      <main className="app-shell">
        <header className="site-header">
          <div className="header-decoration" aria-hidden="true">
            <span className="header-decoration-yellow" />
            <span className="header-decoration-cream" />
            <span className="header-decoration-lavender" />
          </div>

          <div className="brand">
            <p className="brand-kicker">Sperry Tech × Shell Hacks 2026</p>
            <h1>Watts Happening</h1>
            <p className="brand-description">
              Loading coordination opportunities from the live backend…
            </p>
          </div>
        </header>

        <section className="dashboard-grid">
          <div className="empty-state" style={{ padding: "2rem", color: "#355a63" }}>
            No opportunity data is available yet. Check that the API is running on port 3000.
          </div>
        </section>
      </main>
    );
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
          <p className="brand-kicker">Sperry Tech × Shell Hacks 2026</p>

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
                htmlFor="project-search-input"
              >
                Search a project or candidate
              </label>

              <span className="search-icon" aria-hidden="true" />

              <input
                id="project-search-input"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && Boolean(searchQuery.trim())}
                aria-controls="project-search-suggestions"
                aria-activedescendant={
                  suggestionsOpen && projectSuggestions[activeSuggestionIndex]
                    ? `project-suggestion-${activeSuggestionIndex}`
                    : undefined
                }
                autoComplete="off"
                placeholder="Search a project or candidate"
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery.trim()) {
                    setSuggestionsOpen(true);
                  }
                }}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedProjectKey(null);
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
                  onClick={clearProjectSearch}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ×
                </button>
              )}

              {suggestionsOpen && searchQuery.trim() && (
                <div
                  className="search-suggestions"
                  id="project-search-suggestions"
                  role="listbox"
                >
                  {projectSuggestions.length ? (
                    projectSuggestions.map((project, index) => (
                      <button
                        className={`search-suggestion ${
                          index === activeSuggestionIndex
                            ? "active-suggestion"
                            : ""
                        }`}
                        id={`project-suggestion-${index}`}
                        key={projectKey(project)}
                        type="button"
                        role="option"
                        aria-selected={index === activeSuggestionIndex}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onClick={() => chooseProject(project)}
                      >
                        <span className="suggestion-project-name">
                          {project.title}
                        </span>

                        <span className="suggestion-project-meta">
                          {utilityAbbreviation(project.utility)} ·{" "}
                          {project.area}
                          {project.sourceProjectId &&
                            ` · ID ${project.sourceProjectId}`}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="no-search-results">
                      No matching projects found.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="map-panel" aria-label="Regional reference map">
          <div className="map-heading">
            <div>
              <p className="eyebrow">Regional overview</p>
              <h2>South Carolina · Georgia</h2>
            </div>
          </div>

          <OpportunityMap
            opportunity={selectedOpportunityMap}
            referenceAreas={mapReferenceAreas}
            opportunities={opportunities}
            highlightedOpportunityIds={highlightedOpportunityIds}
            selectedOpportunityId={selectedOpportunity?.id ?? null}
            onSelectOpportunity={setSelectedId}
          />

          <div className="map-legend" aria-label="Map legend">
            <div className="map-legend-item">
              <span className="legend-reference legend-reference-selected" />
              Selected area reference
            </div>

            <div className="map-legend-item">
              <span className="legend-reference legend-reference-other" />
              Other area reference
            </div>

            <div className="map-legend-item">
              <span className="legend-pairing-dot" />
              Other opportunity
            </div>

            <div className="map-legend-item">
              <span className="legend-related-dot" />
              Search match
            </div>

            <div className="map-legend-item">
              <span className="legend-selected-dot" />
              Selected pairing
            </div>

            <div className="map-legend-item">
              <span className="legend-line" />
              Reference distance
            </div>
          </div>

          <p className="map-note">
            Pins show public city or county reference areas, not substations,
            transmission lines, or project sites. The dashed connector is an
            area-reference comparison only.
          </p>
        </section>

        <aside className="side-panel">
          <section className="description-card">
            {selectedProject && (
              <div className="selected-project-banner">
                <span>Selected project</span>
                <strong>{truncateText(selectedProject.title, 75)}</strong>
              </div>
            )}

            <div className="card-topline">
              <p className="eyebrow">Selected pairings</p>
            </div>

            <div className="comparison-header">
              <h2>{selectedOpportunity.location}</h2>
            </div>

            <div className="comparison-grid">
              <ProjectComparison
                project={selectedOpportunity.descProject}
                comparisonClass="desc-comparison"
              />

              <ProjectComparison
                project={selectedOpportunity.gpcProject}
                comparisonClass="gpc-comparison"
              />

              <PairingSummary opportunity={selectedOpportunity} />
            </div>
          </section>
        </aside>
      </section>

      <section className="opportunities-card">
        {selectedProject && (
          <p className="active-project-filter">
            Coordination pairings for: <strong>{truncateText(selectedProject.title, 75)}</strong>
          </p>
        )}

        <div className="section-heading">
          <div>
            <p className="eyebrow">Ranked coordination view</p>
            <h2>Top Coordination Opportunities</h2>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Project (Utility A)</th>
                <th>Project (Utility B)</th>
                <th>Distance</th>
                <th>Timeline Overlap</th>
                <th>Type(s)</th>
                <th>View</th>
              </tr>
            </thead>

            <tbody>
              {paginatedOpportunities.map((opportunity) => (
                <tr
                  className={`${
                    selectedOpportunity.id === opportunity.id
                      ? "active-row "
                      : ""
                  }selectable-row`}
                  key={opportunity.id}
                  onClick={() => selectOpportunity(opportunity)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectOpportunity(opportunity);
                    }
                  }}
                >
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

                  <td>{getPairTypes(opportunity)}</td>

                  <td>
                    <button
                      className="view-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        selectOpportunity(opportunity);
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
            Showing {(safeCurrentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(
              safeCurrentPage * PAGE_SIZE,
              filteredOpportunities.length,
            )}{" "}
            of {filteredOpportunities.length}
          </span>

          <div className="pagination-controls">
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

            {Array.from({ length: totalPages }, (_, index) => {
              const page = index + 1;

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
          </div>
        </nav>

        <p className="data-disclaimer">
          Distances are calculated between public municipality or regional
          reference points, not between utility assets. This prototype uses
          public-source records and intentionally leaves unmatched project
          details unverified.
        </p>
      </section>
    </main>
  );
}

export default App;