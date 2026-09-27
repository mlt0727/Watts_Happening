# Deploy to Vercel

Deploy this repository as one **FastAPI** project, with the project **Root Directory set to the repository root**. FastAPI serves `/api/*` and the built Vite app from `frontend/dist` on the same origin. The frontend already uses relative `/api` URLs, so it needs no production API URL or database credentials.

## Project configuration

Use the committed configuration without dashboard overrides for Install Command, Build Command, or Output Directory. Select a current Node.js version supported by Vite 8 (Node.js 22.12 or later; Node.js 24 is suitable).

- `pyproject.toml` declares `backend.app:app`, the API's Python dependencies, and the build command: `npm ci --prefix frontend && npm run build --prefix frontend`.
- Vercel uses `pyproject.toml` for Python dependencies. The root `requirements.txt` remains the optional local analysis setup and is excluded from CLI uploads.
- Static CDN promotion is enabled explicitly because the application has CORS and GZip middleware. The built frontend stays in the function bundle so its existing static mount also works at startup.
- `.vercelignore` limits CLI uploads to the application and build inputs. `vercel.json` also excludes analysis datasets, notebooks, tests, and frontend dependencies from the Python function bundle. The runtime modules `src/utility_identity.py` and `src/impact_estimator.py` remain included.

## Server environment

Set these in Vercel Project Settings → Environment Variables for each intended deployment environment. Use the Atlas connection string as a server secret; do not prefix it with `VITE_` or commit it.

| Variable | Value for the current Atlas dataset |
| --- | --- |
| `MONGODB_URI` | Atlas connection string, including the database user's credentials |
| `MONGODB_DATABASE` | `utility_projects_db` |
| `MONGODB_PROJECTS_COLLECTION` | `utility_projects` |
| `MONGODB_OVERLAPS_COLLECTION` | `overlapping_projects` |

The Atlas network access list must permit the deployment's outbound connections. A domain's DNS A record is an inbound website address, not the API's outbound database IP. Same-origin production requests do not require changing `CORS_ORIGINS`.

## Verify and connect the domain

After deploying, check `/api/health` returns `status: "ok"` and the expected collection counts, then open `/api/dashboard` and the home page. Confirm that company search, station selection, pairings, and Overview summaries load from Atlas.

Add `wattshappening.us` in Vercel Project Settings → Domains. Copy the **exact A record displayed for that domain** into the registrar's DNS settings. If adding `www.wattshappening.us`, use the CNAME target Vercel displays for it. Wait for Vercel to verify the records and issue HTTPS. Do not substitute a remembered Vercel IP for the project's current instructions.

## Local checks

The existing development commands in [backend/README.md](backend/README.md) are unchanged. Before deploying, run from the repository root:

```text
npm ci --prefix frontend
npm run build --prefix frontend
python -m unittest discover -s backend/tests
```

## Official references

- [Vercel FastAPI entrypoints, build commands, static files, and lifespan](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Python runtime and dependency manifests](https://vercel.com/docs/functions/runtimes/python)
- [Deployment upload exclusions](https://vercel.com/docs/deployments/vercel-ignore)
- [Domain A record instructions](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)
