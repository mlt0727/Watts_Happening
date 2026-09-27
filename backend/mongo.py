"""Shared backend MongoDB client; credentials are loaded from .env only."""

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from backend.config import Settings


def create_client(settings=None):
    settings = settings if settings is not None else Settings.from_environment()
    if not settings.mongodb_uri:
        raise ValueError("MONGODB_URI is required in the backend environment")
    return MongoClient(
        settings.mongodb_uri,
        appname="WattsHappeningAPI",
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000,
        socketTimeoutMS=15000,
        maxPoolSize=20,
        connect=False,
    )


def main():
    settings = Settings.from_environment()
    try:
        with create_client(settings) as client:
            client.admin.command("ping")
            db = client[settings.database]
            print({
                "database": settings.database,
                "projects": db[settings.projects_collection].count_documents({}),
                "overlaps": db[settings.overlaps_collection].count_documents({}),
            })
    except (PyMongoError, ValueError, OSError) as exc:
        print(f"MongoDB connection failed ({type(exc).__name__}); check .env and Atlas access.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
