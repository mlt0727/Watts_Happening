import { useMemo, useState } from "react";
import OpportunityMap from "./components/OpportunityMap.jsx";
import { mapReferenceAreas, opportunities } from "./data/opportunities.js";
import "./App.css";

const PAGE_SIZE = 5;

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

  return abbreviations[utility] ?? utility;
}

function formatProjectWithUtility(project) {
  return `${project.title} (${utilityAbbreviation(project.utility)})`;
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

const allProjects = Array.from(
  new Map(
    opportunities.flatMap((opportunity) =>
      [opportunity.descProject, opportunity.gpcProject].map((project) => [
        projectKey(project),
        project,
      ]),
    ),
  ).values(),
);

const rankedOpportunities = opportunities.filter(
  (opportunity) => opportunity.score !== null,
);

const defaultOpportunity = rankedOpportunities[0] ?? opportunities[0];

function ProjectComparison({ project, comparisonClass }) {
  const isVerified = project.plannedDate !== null;

  return (
    <article className={`utility-comparison ${comparisonClass}`}>
      <div className="project-identity">
        <span className="project-identity-marker" aria-hidden="true" />

        <p className="utility-name">
          {project.utility} ({utilityAbbreviation(project.utility)})
        </p>
      </div>

      <h3>{project.title}</h3>

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

  return (
    <section className="pairing-summary" aria-label="Overview">
      <p className="pairing-summary-label">Overview</p>

      <p className="pairing-summary-text">
        This pairing compares{" "}
        <strong>{utilityAbbreviation(descProject.utility)}</strong> and{" "}
        <strong>{utilityAbbreviation(gpcProject.utility)}</strong> projects
        near <strong>{opportunity.location}</strong>.
      </p>

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
          <dt>DESC estimated cost</dt>
          <dd>{formatCost(descProject.estimatedCost)}</dd>
        </div>

        <div>
          <dt>GPC estimated cost</dt>
          <dd>{formatCost(gpcProject.estimatedCost)}</dd>
        </div>
      </dl>
    </section>
  );
}

function App() {
  const [selectedId, setSelectedId] = useState(defaultOpportunity.id);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const normalizedQuery = normalizeSearchText(searchQuery);

  const projectSuggestions = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return allProjects.filter((project) => {
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
  }, [normalizedQuery]);

  const selectedProject = allProjects.find(
    (project) => projectKey(project) === selectedProjectKey,
  );

  const filteredOpportunities = useMemo(() => {
    if (!selectedProject) {
      return opportunities;
    }

    return opportunities.filter(
      (opportunity) =>
        projectKey(opportunity.descProject) === selectedProjectKey ||
        projectKey(opportunity.gpcProject) === selectedProjectKey,
    );
  }, [selectedProject, selectedProjectKey]);

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
    defaultOpportunity;

  const highlightedOpportunityIds = useMemo(() => {
    if (selectedProject) {
      return filteredOpportunities.map((opportunity) => opportunity.id);
    }

    return [selectedOpportunity.id];
  }, [selectedProject, filteredOpportunities, selectedOpportunity.id]);

  function chooseProject(project) {
    const key = projectKey(project);

    const firstRelatedOpportunity = opportunities.find(
      (opportunity) =>
        projectKey(opportunity.descProject) === key ||
        projectKey(opportunity.gpcProject) === key,
    );

    setSearchQuery(project.title);
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
            opportunity={selectedOpportunity}
            referenceAreas={mapReferenceAreas}
            opportunities={opportunities}
            highlightedOpportunityIds={highlightedOpportunityIds}
            selectedOpportunityId={selectedOpportunity.id}
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
                <strong>{selectedProject.title}</strong>
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
            Coordination pairings for: <strong>{selectedProject.title}</strong>
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