"""Run from the repository root: python -m uvicorn backend.app:app --reload."""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo.errors import PyMongoError

from .config import ROOT, Settings
from .dashboard import build_dashboard
from .mongo import create_client

LOGGER = logging.getLogger("watts_happening.api")


def get_database(request: Request):
    database = request.app.state.database
    if database is None:
        raise HTTPException(
            status_code=503,
            detail="Database connection is not configured. Check the backend .env settings and restart the API.",
        )
    return database


def create_app(*, database=None, settings=None, serve_frontend=True):
    settings = settings if settings is not None else Settings.from_environment()

    @asynccontextmanager
    async def lifespan(application):
        client = None
        application.state.database = database
        if database is None and settings.mongodb_uri:
            try:
                client = create_client(settings)
                application.state.database = client[settings.database]
            except (PyMongoError, ValueError, OSError) as exc:
                # Never log the connection string or raw driver exception.
                LOGGER.error("MongoDB client configuration failed (%s)", type(exc).__name__)
        try:
            yield
        finally:
            if client is not None:
                client.close()

    application = FastAPI(title="Watts Happening API", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )
    application.add_middleware(GZipMiddleware, minimum_size=1000)

    @application.exception_handler(PyMongoError)
    async def database_error(_request, exc):
        LOGGER.warning("MongoDB request failed (%s)", type(exc).__name__)
        return JSONResponse(status_code=503, content={
            "detail": "Database is unavailable. Check the Atlas connection and try again."
        }, headers={"Cache-Control": "no-store"})

    @application.get("/api/health")
    def health(response: Response, db=Depends(get_database)):
        db.command("ping")
        response.headers["Cache-Control"] = "no-store"
        return {
            "status": "ok", "database": settings.database,
            "source": "MongoDB Atlas",
            "collections": {
                "projects": db[settings.projects_collection].count_documents({}),
                "overlaps": db[settings.overlaps_collection].count_documents({}),
            },
        }

    @application.get("/api/dashboard")
    def dashboard(response: Response, db=Depends(get_database)):
        # Fetch current cloud data on each request; no local CSV or sample fallback.
        project_rows = list(db[settings.projects_collection].find({}, {"_id": 0}).max_time_ms(10000))
        overlap_rows = list(db[settings.overlaps_collection].find({}, {"_id": 0}).max_time_ms(10000))
        try:
            result = build_dashboard(project_rows, overlap_rows)
        except (ValueError, TypeError, KeyError) as exc:
            LOGGER.warning("Atlas dataset validation failed (%s)", type(exc).__name__)
            raise HTTPException(
                status_code=502,
                detail="Database records are inconsistent. Review project references and data types in Atlas.",
            ) from None
        result["meta"].update({
            "source": "MongoDB Atlas",
            "database": settings.database,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        })
        response.headers["Cache-Control"] = "no-store"
        return result

    @application.get("/api/{path:path}", include_in_schema=False)
    def unknown_api(path: str):
        raise HTTPException(status_code=404, detail="API endpoint not found")

    # A built frontend can share the API's origin. In development Vite proxies /api.
    frontend_dist = ROOT / "frontend" / "dist"
    if serve_frontend and (frontend_dist / "index.html").is_file():
        application.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    return application


app = create_app()
