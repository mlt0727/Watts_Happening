"""Backend-only configuration. Database credentials never enter the Vite bundle."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    mongodb_uri: str = field(default="", repr=False)
    database: str = "utility_projects_db"
    projects_collection: str = "projects"
    overlaps_collection: str = "overlaps"
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    )

    @classmethod
    def from_environment(cls):
        load_dotenv(ROOT / ".env", override=False)
        defaults = cls()
        return cls(
            mongodb_uri=os.environ.get("MONGODB_URI", "").strip(),
            database=os.environ.get("MONGODB_DATABASE", defaults.database).strip(),
            projects_collection=os.environ.get("MONGODB_PROJECTS_COLLECTION", defaults.projects_collection).strip() or defaults.projects_collection,
            overlaps_collection=os.environ.get("MONGODB_OVERLAPS_COLLECTION", defaults.overlaps_collection).strip() or defaults.overlaps_collection,
            cors_origins=tuple(origin.strip() for origin in os.environ.get(
                "CORS_ORIGINS", ",".join(defaults.cors_origins)
            ).split(",") if origin.strip()),
        )
