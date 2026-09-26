import { useState } from "react";
import "./App.css";

const opportunities = [
  {
    id: "OVL_1",
    rank: 1,
    location: "Thurmond Dam / Augusta Area",
    descProject: "Hooks - Thurmond 115 kV Tie: Rebuild",
    descArea: "Hooks Sub → Thurmond Sub, South Carolina",
    descDate: "December 31, 2024",
    descDescription:
      "Dominion Energy South Carolina 115 kV tie rebuild serving the Hooks and Thurmond area.",
    gpcProject: "EVANS PRIMARY - THURMOND DAM (USA) #5 115KV REBUILD",
    gpcArea: "Evans Primary → Thurmond Dam #5, Georgia",
    gpcDate: "June 1, 2033",
    gpcDescription:
      "Georgia Power 115 kV rebuild between Evans Primary and Thurmond Dam.",
    distance: "4.09 mi",
    timeGap: "3,074 days",
    opportunity: "High: nearby physical work",
    dotClass: "overlap-one",
  },
  {
    id: "OVL_2",
    rank: 2,
    location: "Jasper / McIntosh Area",
    descProject: "Jasper - Okatie 230 kV #2: Construct",
    descArea: "Jasper Sub → Okatie Sub, South Carolina",
    descDate: "December 31, 2025",
    descDescription:
      "New 230 kV transmission construction project connecting Jasper and Okatie.",
    gpcProject: "SAV: MCINTOSH - PURRYSBURG 230KV REACTORS",
    gpcArea: "McIntosh → Purrysburg, Georgia",
    gpcDate: "June 1, 2026",
    gpcDescription:
      "Georgia Power 230 kV reactor project in the McIntosh and Purrysburg area.",
    distance: "5.65 mi",
    timeGap: "152 days",
    opportunity: "High: share site logistics",
    dotClass: "overlap-two",
  },
  {
    id: "OVL_3",
    rank: 3,
    location: "Goshen / McIntosh Area",
    descProject: "Jasper - Okatie 230 kV #2: Construct",
    descArea: "Jasper Sub → Okatie Sub, South Carolina",
    descDate: "December 31, 2025",
    descDescription:
      "New 230 kV transmission construction project connecting Jasper and Okatie.",
    gpcProject: "SAV: GOSHEN (SAV) - MCINTOSH 115KV LINE REBUILD",
    gpcArea: "Goshen → McIntosh, Georgia",
    gpcDate: "June 1, 2027",
    gpcDescription:
      "Georgia Power 115 kV line rebuild connecting Goshen and McIntosh.",
    distance: "7.55 mi",
    timeGap: "517 days",
    opportunity: "High: share crews and logistics",
    dotClass: "overlap-three",
  },
  {
    id: "OVL_4",
    rank: 4,
    location: "Stevens Creek / Thurmond Area",
    descProject:
      "Stevens Creek - Hooks 115 kV / LR Plumb Branch 46 kV Rebuilds",
    descArea: "Stevens Creek Sub → Hooks Sub, South Carolina",
    descDate: "December 31, 2024",
    descDescription:
      "Dominion Energy South Carolina transmission rebuild work in the Stevens Creek and Hooks area.",
    gpcProject: "EVANS PRIMARY - THURMOND DAM (USA) #5 115KV REBUILD",
    gpcArea: "Evans Primary → Thurmond Dam #5, Georgia",
    gpcDate: "June 1, 2033",
    gpcDescription:
      "Georgia Power 115 kV rebuild between Evans Primary and Thurmond Dam.",
    distance: "8.01 mi",
    timeGap: "3,074 days",
    opportunity: "Medium: crew coordination",
    dotClass: "overlap-four",
  },
  {
    id: "OVL_5",
    rank: 5,
    location: "Okatie / McIntosh Area",
    descProject: "Okatie-Bluffton 115 kV: Rebuild",
    descArea: "Okatie Sub → Bluffton Sub, South Carolina",
    descDate: "June 1, 2025",
    descDescription:
      "Dominion Energy South Carolina 115 kV rebuild connecting Okatie and Bluffton.",
    gpcProject: "SAV: MCINTOSH - PURRYSBURG 230KV REACTORS",
    gpcArea: "McIntosh → Purrysburg, Georgia",
    gpcDate: "June 1, 2026",
    gpcDescription:
      "Georgia Power 230 kV reactor project in the McIntosh and Purrysburg area.",
    distance: "14.34 mi",
    timeGap: "365 days",
    opportunity: "Medium: share equipment",
    dotClass: "overlap-five",
  },
  {
    id: "OVL_6",
    rank: 6,
    location: "Bluffton / Goshen Area",
    descProject: "Okatie-Bluffton 115 kV: Rebuild",
    descArea: "Okatie Sub → Bluffton Sub, South Carolina",
    descDate: "June 1, 2025",
    descDescription:
      "Dominion Energy South Carolina 115 kV rebuild connecting Okatie and Bluffton.",
    gpcProject: "SAV: GOSHEN (SAV) - MCINTOSH 115KV LINE REBUILD",
    gpcArea: "Goshen → McIntosh, Georgia",
    gpcDate: "June 1, 2027",
    gpcDescription:
      "Georgia Power 115 kV line rebuild connecting Goshen and McIntosh.",
    distance: "14.81 mi",
    timeGap: "730 days",
    opportunity: "Medium: share crews and equipment",
    dotClass: "overlap-six",
  },
];

function App() {
  const [selectedOpportunity, setSelectedOpportunity] = useState(
    opportunities[1],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Watts Happening</h1>
          <p>Find out what&apos;s happening with power grid companies</p>
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="map-placeholder">
          <div className="map-water" />
          <div className="map-river" />

          <p className="map-status">
            Coordination opportunities
            <strong>Click an overlap area to compare projects</strong>
          </p>

          <span className="state-label georgia">GEORGIA</span>
          <span className="state-label carolina">SOUTH CAROLINA</span>
          <span className="city-label augusta">Augusta</span>
          <span className="city-label savannah">Savannah</span>

          {opportunities.map((opportunity) => (
            <button
              aria-label={`View overlap in ${opportunity.location}`}
              className={`overlap-dot ${opportunity.dotClass} ${
                selectedOpportunity.id === opportunity.id ? "selected" : ""
              }`}
              key={opportunity.id}
              onClick={() => setSelectedOpportunity(opportunity)}
              title={`${opportunity.descProject} and ${opportunity.gpcProject}`}
            />
          ))}

          <div className="map-legend">
            <div>
              <span className="legend-overlap-dot" />
              Coordination opportunity
            </div>
            <div>
              <span className="legend-ring" />
              Selected opportunity
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <section className="description-card">
            <p className="eyebrow">Description</p>

            <div className="comparison-header">
              <div>
                <h2>{selectedOpportunity.location}</h2>
                <p>
                  {selectedOpportunity.distance} apart ·{" "}
                  {selectedOpportunity.timeGap} apart
                </p>
              </div>

              <span className="overlap-badge">Overlap</span>
            </div>

            <div className="comparison-grid">
              <article className="utility-comparison desc-comparison">
                <span className="comparison-label">
                  Dominion Energy South Carolina
                </span>

                <h3>{selectedOpportunity.descProject}</h3>

                <dl>
                  <div>
                    <dt>Area</dt>
                    <dd>{selectedOpportunity.descArea}</dd>
                  </div>

                  <div>
                    <dt>In-service</dt>
                    <dd>{selectedOpportunity.descDate}</dd>
                  </div>

                  <div>
                    <dt>Description</dt>
                    <dd>{selectedOpportunity.descDescription}</dd>
                  </div>
                </dl>
              </article>

              <article className="utility-comparison gpc-comparison">
                <span className="comparison-label">Georgia Power</span>

                <h3>{selectedOpportunity.gpcProject}</h3>

                <dl>
                  <div>
                    <dt>Area</dt>
                    <dd>{selectedOpportunity.gpcArea}</dd>
                  </div>

                  <div>
                    <dt>In-service</dt>
                    <dd>{selectedOpportunity.gpcDate}</dd>
                  </div>

                  <div>
                    <dt>Description</dt>
                    <dd>{selectedOpportunity.gpcDescription}</dd>
                  </div>
                </dl>
              </article>
            </div>

            <div className="coordination-note">
              <strong>Why coordinate?</strong>
              <span>{selectedOpportunity.opportunity}</span>
            </div>
          </section>
        </aside>
      </section>

      <section className="opportunities-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ranked by distance</p>
            <h2>Top Coordination Opportunities</h2>
          </div>

          <p className="threshold">
            Projects within the 25-mile threshold
          </p>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Dominion Energy SC Project</th>
                <th>Georgia Power Project</th>
                <th>Distance</th>
                <th>Time Gap</th>
                <th>Coordination Opportunity</th>
                <th>View</th>
              </tr>
            </thead>

            <tbody>
              {opportunities.map((opportunity) => (
                <tr
                  className={
                    selectedOpportunity.id === opportunity.id ? "active-row" : ""
                  }
                  key={opportunity.id}
                >
                  <td>{opportunity.rank}</td>
                  <td>{opportunity.descProject}</td>
                  <td>{opportunity.gpcProject}</td>
                  <td>{opportunity.distance}</td>
                  <td>{opportunity.timeGap}</td>
                  <td>{opportunity.opportunity}</td>
                  <td>
                    <button
                      className="view-button"
                      onClick={() => setSelectedOpportunity(opportunity)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default App;