# Running the Frontend with the Atlas Backend

Data flow: React frontend in the browser → FastAPI `/api/dashboard` → the MongoDB Atlas cluster configured in `MONGODB_URI`.

The page reads only the configured cloud-hosted collections. The defaults are database `utility_projects_db`, projects collection `projects`, and overlaps collection `overlaps`. It does not read local CSV files and does not fall back to sample data.

## Local Development

Install the backend dependencies from the repository root:

```powershell
python -m pip install -r backend/requirements.txt
```

For the initial setup, copy `.env.example` in the repository root to `.env` and fill in your own Atlas Database User connection string.

Use an Atlas Database User with read access to the chosen database. Set `MONGODB_DATABASE` to the database name and configure its collection names when they differ from the defaults. For the team's `utility_projects` and `overlapping_projects` collections, use:

```dotenv
MONGODB_DATABASE=utility_projects_db
MONGODB_PROJECTS_COLLECTION=utility_projects
MONGODB_OVERLAPS_COLLECTION=overlapping_projects
```

These settings select existing collections without renaming or copying data. The dashboard, health check, and `python -m backend.mongo` diagnostic all use the same collection settings. Restart the backend after changing `.env`.

The `.env` file is ignored by Git. It must never be exposed to the frontend, and its values must not be configured as any `VITE_` variables. Teammates should use their own database accounts.

In the first terminal, start the backend from the repository root:

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

In the second terminal:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open the address displayed by Vite, usually `http://127.0.0.1:5173`.

Do not use a static file server on port 5500 to open the JSX project.

Vite proxies `/api` requests to `http://127.0.0.1:8000`. If you need to change the backend port, set `BACKEND_URL` before starting Vite.

If the frontend and backend are deployed on different domains, set the frontend `VITE_API_BASE_URL` to the backend URL and add the allowed frontend origin to the backend `CORS_ORIGINS`.

## Running the Built Frontend in a Single Process

First run the following inside `frontend`:

```powershell
npm run build
```

Then return to the repository root and run:

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

The backend will serve both the built frontend at `http://127.0.0.1:8000/` and the `/api` endpoints.

After the frontend build is complete, the backend must be restarted so that it can mount `frontend/dist`.

## API and Data Semantics

| API | Purpose |
| --- | --- |
| `GET /api/health` | Checks the Atlas connection and returns the current document counts for both collections |
| `GET /api/dashboard` | Reads both collections and returns projects, project pairs, map endpoints, and data-source information |
| `/docs` | FastAPI API documentation |

Every time the page loads or refreshes, it reads the data from Atlas again. If a teammate modifies the cloud data, refreshing the page is enough to retrieve the latest version. Changes are never written back to local CSV files.

The current API is read-only and does not provide any endpoints for modifying the database.

- Multiple substations are combined into one searchable project, and the project cost is not counted repeatedly for each substation.
- The map displays the closest valid substation endpoints for each project pair. The connecting lines do not represent actual transmission lines.
- If the CSV contains only an in-service year, the interface displays an estimated year instead of fabricating a month/day or a source-verification conclusion.
- Cost ranges, textual descriptions, and multiple years preserve their original meaning. Missing distance or time values are not converted to zero and do not receive misleading rankings.
- Each opportunity includes `impactSummary` for the Overview, generated on the backend using `src/impact_estimator.py`. The existing prototype savings rates apply to the smaller project's cost: 15% at zero distance, 10% below 1 mile, 5% from 1 to below 5 miles, 3% from 5 to below 25 miles, and 0% at 25 miles or more. Each project cost is counted once regardless of its substation count. These are prototype assumptions, not verified savings forecasts.
- Impact summaries describe the nearest recorded endpoints, with zero distance shown as a shared station. If either cost is missing, negative, nonfinite, a range, a textual qualification, or conflicting across rows, coordination suggestions are still shown but numeric savings are unavailable. A zero cost is valid. The frontend displays the backend summary without duplicating the Python formulas.
- Cloud data errors, network failures, or permission issues display an error and retry option. Hardcoded fake data is never shown.
- Cross-company pairing uses `src/utility_identity.py` to determine utility identities consistently. It handles capitalization, punctuation, legal suffixes, and confirmed abbreviations instead of relying on whether company-name strings are exactly equal. Records involving the same company or a shared owner are excluded from the map and recommendation list. For multi-company projects, the full owner list is used for comparison, while the frontend displays only the first company.
- Original company names, project IDs, CSV records, and Atlas records are preserved. `meta.overlapCount` is the number of original records, `eligibleOverlapCount` is the number of candidates remaining after filtering, and `excludedSameCompanyCount` is the number excluded because of overlapping company identities. The offline `src/cross_compare.py` process uses the same rules.
- Subsidiaries in different regions are not merged merely because their names are spelled similarly, and ambiguous abbreviations are not guessed. ITC's group-level names and confirmed subsidiaries are not treated as independent collaboration partners relative to one another, while each subsidiary's own identity remains distinct, based on [ITC's official information](https://www.itc-holdings.com/itc-michigan/about-itc-michigan/).

Backend credentials and the connection pool are managed by `backend/config.py` and `backend/mongo.py`.

The runtime reads only the configured `MONGODB_URI`; changing clusters does not bypass company identity normalization or pairing filters.

## Verification

```powershell
python -m unittest discover -s backend/tests -v
python -m backend.mongo
cd frontend
npm test
npm run lint
npm run build
```

The current startup method is intended for local development only.

If the project is later deployed to AWS, Vercel, or another platform, deployment environment variables, access control, and the corresponding Atlas network access rules must be configured.
