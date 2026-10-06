# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both confirmed:

- **Utility transmission planners** at one of the 163 U.S. utilities in the dataset. They need to see which planned projects owned by *other* utilities sit near their own projects, and when those projects are due in service, so they can judge whether coordinating is worth pursuing.
- **Evaluators of the work**: hackathon judges, and now portfolio visitors such as recruiters and engineers. In a short session they need to understand the problem, see the nationwide analysis working on real data, and trust the method.

The tool must hold up as a credible planning instrument and also read clearly in a few minutes of demo.

## Product Purpose

Watts Happening surfaces potential coordination opportunities between planned U.S. transmission projects owned by different utilities. It scores pairs of projects on geographic proximity (the primary signal), with planned in-service timing and cost as context for ranking. It also attaches a rough, distance-based estimate of potential savings and lists the activities the two projects could share.

The project was built for the Sperry Tech Gridlock Challenge at ShellHacks 2026 and is now maintained as a portfolio piece. Success means a visitor quickly grasps the problem (utilities lack visibility into each other's plans) and sees a believable, explorable answer.

## Positioning

The challenge brief used a two-utility example. Watts Happening applies the same idea nationwide, to every utility in the Our Grid Future June 2026 dataset (163 companies). It measures project-to-project distance as the closest substation-to-substation pair, and it fills in missing project costs with a Random Forest model while keeping estimated costs clearly separate from reported ones.

## Operating Context

- Users explore on a desktop web dashboard: a Leaflet map of substations and project endpoints, search across companies and projects, a ranked "Top Coordination Opportunities" list with tabs and pagination, and a detail panel for the selected opportunity.
- Live data comes from MongoDB Atlas through a FastAPI backend. The frontend is deployed on Vercel.
- The data pipeline (cleaning, cost model) lives in `notebooks/` and `src/`. Source utility filings are kept in `Project Listings/`.

## Capabilities and Constraints

- Opportunity threshold is about 40 km (25 mi) between the closest substations of two projects from different utilities.
- Prototype savings are the smaller project's cost × a distance-tier rate: same/crossing location 15%, under 1 mi 10%, under 5 mi 5%, under 25 mi 3%, 25 mi or more 0%. Each tier maps to specific shared activities (crews, equipment, laydown yards, deliveries, permitting, access roads, right-of-way, outage timing).
- Every cost carries a `cost_source` of `known` or model-estimated, and that distinction must stay visible wherever costs appear.
- Savings and model costs are prototype estimates, not engineering assessments or guaranteed figures. Proximity alone does not prove that coordination is feasible.
- Terminology: project, substation, utility/company, coordination opportunity, in-service year, change type (for example Rebuild).
- Stack (existing): React 19 + Vite + Tailwind CSS 4 + react-leaflet; FastAPI + PyMongo; MongoDB Atlas; Vercel.

## Brand Commitments

- Name: **Watts Happening**.
- The Pikachu walking GIF beside search (`frontend/public/pikachu-walking.gif`) is **not** a brand commitment. It is a third-party copyrighted character and may be removed or replaced with an original element.
- Credit the team: Shirina Daniel, Monica Barbosa, Lingtong Meng, Kevin Wilson.

## Evidence on Hand

- Real data: Our Grid Future Planned Transmission Projects National Database, June 2026 (`data/OurGridFuture_PlannedTransmissionProjects_Jun2026.csv`), plus cleaned and cost-estimated derivatives and `data/overlaps.csv`.
- Source filings: Dominion Energy and Georgia Power PDFs in `Project Listings/`.
- Method documentation: README cost-impact table and `data/main_data_cleaning_notes.md`. Notebooks for exploration and the cost model.
- Hackathon context: ShellHacks 2026, Sperry Tech Gridlock Challenge.
- **Absent, never fabricate:** utility adoption or customers, testimonials, validated or realized savings, competition placement or awards (not confirmed), and model accuracy figures unless taken from the notebook.

## Product Principles

1. **Honest about estimates.** Known and estimated costs, and prototype savings, are always labeled for what they are. Credibility is the product.
2. **Proximity first.** Distance is the primary signal. Timing and cost refine the ranking but never hide that distance drives it.
3. **The map is the argument.** Seeing two utilities' projects side by side makes the coordination case faster than any table.
4. **Legible in minutes, deep on demand.** A first-time visitor gets the point quickly, and a planner can still drill into specific pairs, substations, and years.

## Accessibility & Inclusion

No product-specific requirement established. Default to WCAG 2.2 AA.
