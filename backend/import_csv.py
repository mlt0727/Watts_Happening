"""Validate the two CSVs locally; use --apply for an explicit Atlas import."""

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HEADERS = {
    "projects": "project_id,substation_id,substation_name,state_code,state_name,latitude,longitude,project_name,cost,length_mi,estimated_in_service_year,change_type,estimate_quality,cost_source,company_name".split(","),
    "overlaps": "overlap_id,distance_mi,time_gap (day),utility_a,project_id_a,project_name_a,utility_b,project_id_b,project_name_b".split(","),
}


def number(value, *, integer=False, optional=False):
    if optional and value.strip().lower() in {"", "nan"}:
        return None
    result = float(value)
    if not math.isfinite(result) or (integer and not result.is_integer()):
        raise ValueError("Expected a finite integer" if integer else "Expected a finite number")
    return int(result) if integer else result


def load_csv(path, collection):
    documents = []
    seen = set()
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != HEADERS[collection]:
            raise ValueError(f"{path.name}: unexpected CSV header")
        for row_number, row in enumerate(reader, 2):
            try:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError("Wrong number of columns")
                if collection == "projects":
                    key = row["substation_id"].strip()
                    row["_id"] = "substation:" + key
                    row["company_name"] = row["company_name"].strip()
                    row["project_id"] = row["project_id"].strip()
                    row["substation_id"] = key
                    row["latitude"] = number(row["latitude"])
                    row["longitude"] = number(row["longitude"])
                    if not (-90 <= row["latitude"] <= 90 and -180 <= row["longitude"] <= 180):
                        raise ValueError("Coordinates out of range")
                else:
                    key = row["overlap_id"].strip()
                    row["overlap_id"] = row["_id"] = key
                    for field in ("utility_a", "utility_b", "project_id_a", "project_id_b"):
                        row[field] = row[field].strip()
                    row["distance_mi"] = number(row["distance_mi"])
                    row["time_gap (day)"] = number(row["time_gap (day)"], integer=True, optional=True)
                    if row["distance_mi"] < 0 or (row["time_gap (day)"] is not None and row["time_gap (day)"] < 0):
                        raise ValueError("Negative distance or time gap")
                if not key or key in seen:
                    raise ValueError("Empty or duplicate row identifier")
                seen.add(key)
                documents.append(row)
            except (ValueError, TypeError) as exc:
                raise ValueError(f"{path.name}, record {row_number}: {exc}") from exc
    if not documents:
        raise ValueError(f"{path.name}: no records")
    return documents


def load_data(data_dir):
    data = {name: load_csv(data_dir / f"{name}.csv", name) for name in HEADERS}
    project_keys = {(row["company_name"], row["project_id"]) for row in data["projects"] if row["project_id"]}
    for row in data["overlaps"]:
        for side in ("a", "b"):
            if (row[f"utility_{side}"], row[f"project_id_{side}"]) not in project_keys:
                raise ValueError(f"Overlap {row['_id']} references an unknown project ({side})")
    return data


def chunks(items, size=200):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def preflight(db, data):
    """Check both collections before writing; never replace existing team data."""
    for name, documents in data.items():
        expected = {doc["_id"]: doc for doc in documents}
        for batch in chunks(list(expected)):
            for actual in db[name].find({"_id": {"$in": batch}}):
                if actual != expected[actual["_id"]]:
                    raise ValueError(f"{name}: existing document {actual['_id']} differs; import stopped without overwriting it")
        if db[name].count_documents({"_id": {"$nin": list(expected)}}, limit=1):
            raise ValueError(f"{name}: contains documents outside this import; choose a separate database or review existing data first")


def apply_import(data, database):
    # Credentials must be supplied by the operator, never embedded in this file.
    uri = os.environ.get("MONGODB_URI", "").strip()
    if not uri:
        raise ValueError("Set MONGODB_URI in your environment before using --apply")
    from pymongo import MongoClient, UpdateOne

    with MongoClient(uri, serverSelectionTimeoutMS=15000, appname="watts-happening-import") as client:
        db = client[database]
        client.admin.command("ping")
        preflight(db, data)
        for name, documents in data.items():
            inserted = 0
            for batch in chunks(documents):
                result = db[name].bulk_write([
                    UpdateOne({"_id": doc["_id"]}, {"$setOnInsert": doc}, upsert=True)
                    for doc in batch
                ], ordered=True)
                inserted += result.upserted_count
            print(f"{database}.{name}: {inserted} inserted, {len(documents) - inserted} already present")
        # Read back every source document and compare field values, including nulls.
        preflight(db, data)
        for name, documents in data.items():
            if db[name].count_documents({}) != len(documents):
                raise ValueError(f"{name}: verification count mismatch")
        db.projects.create_index([("company_name", 1), ("project_id", 1)])
        db.overlaps.create_index([("utility_a", 1), ("project_id_a", 1)])
        db.overlaps.create_index([("utility_b", 1), ("project_id_b", 1)])
        print("Verified all rows against the CSV import and created query indexes.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--database", default=os.environ.get("MONGODB_DATABASE", "utility_projects_db"))
    parser.add_argument("--apply", action="store_true", help="Connect to Atlas and insert missing records")
    parser.add_argument("--export-json", type=Path, help="Export validated arrays for plugin import; does not connect")
    args = parser.parse_args()
    try:
        data = load_data(args.data_dir)
        print(json.dumps({"database": args.database, "validated_rows": {name: len(rows) for name, rows in data.items()}}, indent=2))
        if args.export_json:
            args.export_json.mkdir(parents=True, exist_ok=True)
            for name, documents in data.items():
                destination = args.export_json / f"{name}.json"
                destination.write_text(json.dumps(documents, ensure_ascii=False, allow_nan=False), encoding="utf-8")
            print(f"Exported validated JSON to {args.export_json}")
        if args.apply:
            apply_import(data, args.database)
        else:
            print("Local validation only; no database connection or cloud changes.")
    except (ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        # Driver exception text may include credentials or full document contents.
        print(f"Atlas import failed ({type(exc).__name__}). Check credentials, network access and database permissions. An interrupted import may be partially complete; rerun after resolving the issue.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
