# Watts Happening ⚡

Watts Happening is an interactive dashboard designed to identify potential coordination opportunities between planned U.S. power grid projects owned by different utility companies.

Using nationwide transmission planning data spanning **163 utility companies**, Watts Happening analyzes geographic proximity, planned in-service timing, and project costs to surface projects where utilities may benefit from coordinating resources, equipment, crews, scheduling, and other construction activities.

## The Problem

Utility companies plan transmission infrastructure projects years in advance, but neighboring utilities may have limited visibility into projects being planned nearby.

This can result in missed opportunities to coordinate construction activities, share resources, reduce costs, and improve infrastructure planning.

Watts Happening addresses this problem by analyzing planned transmission projects across the United States and identifying projects from different utility companies that may benefit from coordination.

## Our Solution

Watts Happening analyzes nationwide planned transmission project data and identifies potential coordination opportunities between projects owned by different utility companies.

Geographic proximity serves as the primary signal. When a project contains multiple substations, the shortest substation-to-substation distance is used to represent the distance between two projects.

Projects within approximately **40 km (25 miles)** of one another may be considered potential coordination opportunities. Planned in-service timing and project costs provide additional context for evaluating and ranking these opportunities.

Through the interactive dashboard, users can explore planned projects geographically, investigate nearby projects, view ranked coordination opportunities, and examine potential cost impacts.

## Key Features

- **Interactive Project Map** — Explore planned transmission projects and substations across the United States using an interactive Leaflet map.
- **Cross-Utility Project Matching** — Identify geographically close projects owned by different utility companies.
- **Geographic Proximity Analysis** — Compare projects using their closest substation-to-substation distance and identify opportunities within approximately 40 km.
- **Timeline Analysis** — Use planned in-service years to identify projects whose development timelines may overlap.
- **Coordination Opportunity Ranking** — Rank potential project-to-project coordination opportunities using factors including geographic distance, project cost, and planned in-service timing.
- **Project Cost Estimation** — Estimate costs for projects without reported cost information using a Random Forest regression model trained on projects with known costs.
- **Cost Impact Estimation** — Provide a rough estimate of potential savings associated with coordinating nearby projects.
- **Coordination Insights** — Highlight potential areas of coordination such as shared crews, equipment, deliveries, laydown yards, permitting, access roads, and right-of-way activities.

## Data

Project data is sourced from the **Our Grid Future Planned Transmission Projects National Database**.

The June 2026 dataset contains planned transmission infrastructure projects from across the United States and includes projects associated with **163 utility companies**.

The source data was cleaned and processed before being loaded into the application's MongoDB database.

### Cost Estimation

Not every project in the source dataset includes reported cost information.

To provide cost information for a larger portion of the dataset, Watts Happening includes a machine-learning cost estimation pipeline developed in Python.

Projects with known costs were used as training data for a **Random Forest regression model** built with scikit-learn. The trained model was then used to estimate costs for projects where reported costs were unavailable.

The processed data maintains a distinction between known and model-estimated costs.

## Cost Impact Methodology

Watts Happening provides a prototype estimate of potential savings when two projects are geographically close enough to present a coordination opportunity.

The estimate applies a distance-based savings assumption to the cost of the smaller of the two projects:

| Project Distance | Prototype Savings Rate | Potential Coordination |
| --- | ---: | --- |
| Same/crossing location | 15% | Crossing coordination, outage timing, right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment |
| Less than 1 mile | 10% | Right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment |
| Less than 5 miles | 5% | Laydown yards, deliveries, crews, and equipment |
| Less than 25 miles (~40 km) | 3% | Crews and equipment |
| 25+ miles | 0% | No significant proximity-based coordination |

Potential savings are calculated as:

`estimated savings = smaller project cost × savings rate`

These values are intended as rough prototype estimates for identifying and illustrating potential coordination opportunities. They are not engineering assessments or guaranteed savings.

## How It Works

1. Nationwide planned transmission project data is cleaned and standardized.
2. Missing project costs are estimated using the trained Random Forest model.
3. The processed project and substation data is stored in MongoDB.
4. Projects owned by different utility companies are evaluated for geographic proximity.
5. For projects containing multiple substations, the closest substation pair determines the project-to-project distance.
6. Projects within approximately 40 km are identified as potential coordination opportunities.
7. Distance, planned in-service timing, and project cost are considered when ranking opportunities.
8. Users explore the results through the interactive dashboard.
9. Selected opportunities include potential coordination activities and a rough cost-impact estimate.

## Tech Stack

### Frontend
- React
- JavaScript
- Vite
- Tailwind CSS
- Leaflet

### Backend
- Python
- FastAPI
- PyMongo

### Database
- MongoDB Atlas

### Run Locally

See [the frontend and backend setup guide](backend/README.md) for environment configuration, development commands, and tests. The React dashboard reads live Atlas data through the FastAPI backend; database credentials stay on the server.

### Data Processing & Machine Learning
- Python
- Jupyter Notebook
- Pandas
- NumPy
- scikit-learn
- OpenPyXL

### Development & Code Quality
- ESLint

## Project Context

Watts Happening was developed for the **Sperry Tech Gridlock Challenge at ShellHacks 2026**.

The challenge focuses on a lack of visibility between utilities when planning future transmission infrastructure. Teams were asked to create an interactive tool that identifies potential geographic and timeline overlap between planned projects. Geographic proximity was designated as the primary signal, with timeline overlap serving as a strong secondary signal.

Watts Happening expands the challenge's two-utility example into a nationwide approach, analyzing planned projects associated with **163 utility companies** to surface potential project-to-project coordination opportunities.

## Limitations

- Project information depends on the completeness and accuracy of the underlying public planning data.
- Costs generated by the Random Forest model are estimates and should not be interpreted as reported or confirmed project costs.
- Potential savings are based on prototype distance-based assumptions and do not represent guaranteed financial savings.
- Geographic proximity alone does not establish that two projects can feasibly coordinate.
- Actual coordination would require engineering, regulatory, scheduling, operational, and financial review.

## Data Source

Project data:

**Our Grid Future — Planned Transmission Projects National Database**  
https://www.ourgridfuture.org/

## Project Contribution Team
Shirina Daniel, Monica Barbosa, Lingtong Meng & Kevin Wilson.
