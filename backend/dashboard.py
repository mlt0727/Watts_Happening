"""Convert imported MongoDB records into the dashboard's public JSON contract.

This module deliberately has no database dependency or I/O. Project rows describe
substations, so costs must never be summed across rows of the same project.
"""

from collections import defaultdict
from collections.abc import Mapping
from hashlib import sha256
import json
import math
import re

from src import impact_estimator
from src.utility_identity import companies_overlap, company_identities


_SIMPLE_NUMBER = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)\Z")
_YEAR = re.compile(r"\d{4}\Z")
_MISSING = {"", "nan", "null", "none", "n/a"}


def _text(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError("Expected a string or numeric source value")
    result = str(value).strip()
    return None if result.casefold() in _MISSING else result


def _identifier(value):
    # BSON integer IDs and CSV string IDs should resolve to the same project.
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        value = int(value)
    result = _text(value)
    return " ".join(result.split()) if result else None


def _project_key(utility, project_id):
    utility = _identifier(utility)
    project_id = _identifier(project_id)
    return (utility.casefold(), project_id.casefold()) if utility and project_id else None


def _stable_id(prefix, *parts):
    identity = json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    return prefix + ":" + sha256(identity.encode("utf-8")).hexdigest()


def _distinct(values):
    return list(dict.fromkeys(value for value in values if value is not None))


def _number(value, field, *, optional=False, minimum=None, maximum=None):
    text = _text(value)
    if text is None and optional:
        return None
    try:
        result = float(text)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{field} must be a finite number") from exc
    if not math.isfinite(result):
        raise ValueError(f"{field} must be a finite number")
    if (minimum is not None and result < minimum) or (maximum is not None and result > maximum):
        raise ValueError(f"{field} is out of range")
    return int(result) if result.is_integer() else result


def _source_values(rows, field):
    return _distinct(_text(row.get(field)) for row in rows)


def _cost(rows):
    values = _source_values(rows, "cost")
    if not values:
        return None
    # Preserve source ranges and qualifications; do not parse their first number.
    if not all(_SIMPLE_NUMBER.fullmatch(value) for value in values):
        return " / ".join(values)
    numbers = _distinct(_number(value, "cost") for value in values)
    return numbers[0] if len(numbers) == 1 else " / ".join(values)


def _area(rows):
    stations = _source_values(rows, "substation_name")
    states = _distinct(_text(row.get("state_name")) or _text(row.get("state_code")) for row in rows)
    station_label = " / ".join(stations[:3])
    if len(stations) > 3:
        station_label += f" (+{len(stations) - 3} substations)"
    return ", ".join(part for part in (station_label, " / ".join(states)) if part) or "Area not provided"


def _reference(row, project):
    lat = _number(row.get("latitude"), "latitude", optional=True, minimum=-90, maximum=90)
    lon = _number(row.get("longitude"), "longitude", optional=True, minimum=-180, maximum=180)
    if lat is None or lon is None:
        return None
    station_id = _identifier(row.get("substation_id"))
    station = _text(row.get("substation_name")) or (f"Substation {station_id}" if station_id else project["title"])
    state = _text(row.get("state_name")) or _text(row.get("state_code"))
    name = ", ".join(part for part in (station, state) if part)
    return {
        "id": _stable_id("substation", project["id"], station_id, lat, lon),
        "projectId": project["id"],
        "name": name,
        "label": name,
        "lat": lat,
        "lon": lon,
        "source": "Substation coordinates from the projects collection",
    }


def _distance(first, second):
    first_lat, second_lat = math.radians(first["lat"]), math.radians(second["lat"])
    lat_gap = second_lat - first_lat
    lon_gap = math.radians(second["lon"] - first["lon"])
    haversine = math.sin(lat_gap / 2) ** 2 + math.cos(first_lat) * math.cos(second_lat) * math.sin(lon_gap / 2) ** 2
    return 2 * 3958.7613 * math.asin(math.sqrt(min(1.0, max(0.0, haversine))))


def _closest_pair(first, second):
    if not first or not second:
        return (first[0] if first else None, second[0] if second else None)
    return min(((a, b) for a in first for b in second), key=lambda pair: (_distance(*pair), pair[0]["id"], pair[1]["id"]))


def _impact_summary(first, second, distance):
    costs = (first["estimatedCost"], second["estimatedCost"])
    if all(isinstance(cost, (int, float)) and not isinstance(cost, bool)
           and math.isfinite(cost) and cost >= 0 for cost in costs):
        return impact_estimator.generate_impact_explanation(
            first["title"], second["title"], *costs, distance,
        )
    return (
        f"{impact_estimator.describe_endpoint_proximity(first['title'], second['title'], distance)} "
        f"Potential coordination includes {impact_estimator.get_coordination_type(distance)}. "
        "Estimated savings are unavailable because both projects need a single valid, "
        "nonnegative numeric cost estimate. Proximity-based savings are a prototype "
        "assumption, not a verified forecast."
    )


def build_dashboard(project_rows, overlap_rows):
    """Return all assigned projects and eligible cross-company opportunities.

    Unassigned substation rows remain counted in metadata. Missing coordinates
    yield null map references; absent dates never become invented calendar dates.
    Raw overlap joins are validated even when shared owners make them ineligible.
    """
    project_rows, overlap_rows = list(project_rows), list(overlap_rows)
    groups = defaultdict(list)
    station_ids = set()
    unassigned = 0
    for index, row in enumerate(project_rows, 1):
        if not isinstance(row, Mapping):
            raise ValueError(f"Project row {index} must be an object")
        station_id = _identifier(row.get("substation_id"))
        if station_id:
            if station_id in station_ids:
                raise ValueError(f"Duplicate substation_id: {station_id}")
            station_ids.add(station_id)
        project_id = _identifier(row.get("project_id"))
        if project_id is None:
            unassigned += 1
            continue
        key = _project_key(row.get("company_name"), project_id)
        if key is None:
            raise ValueError(f"Project row {index} has a project_id but no company_name")
        groups[key].append(row)

    projects_by_key = {}
    references_by_key = {}
    reference_areas = {}
    for key, rows in groups.items():
        names = _source_values(rows, "project_name")
        year_values = _source_values(rows, "estimated_in_service_year")
        project = {
            "id": _stable_id("project", *key),
            "sourceProjectId": _identifier(rows[0].get("project_id")),
            "utility": _identifier(rows[0].get("company_name")),
            "title": names[0] if names else f"Project {_identifier(rows[0].get('project_id'))}",
            "aliases": names,
            "projectType": " / ".join(_source_values(rows, "change_type")) or "Unknown",
            "area": _area(rows),
            "plannedDate": None,
            "plannedYear": int(year_values[0]) if len(year_values) == 1 and _YEAR.fullmatch(year_values[0]) else None,
            "plannedYearLabel": " / ".join(year_values) or None,
            "estimatedCost": _cost(rows),
            "costSource": " / ".join(_source_values(rows, "cost_source")) or None,
            "sourceStatus": "Imported project record; exact in-service date not provided",
            "referenceAreaId": None,
        }
        references = {}
        for row in rows:
            reference = _reference(row, project)
            if reference:
                references[reference["id"]] = reference
                reference_areas[reference["id"]] = reference
        points = list(references.values())
        project["referenceAreaId"] = points[0]["id"] if points else None
        projects_by_key[key] = project
        references_by_key[key] = points

    companies_by_key = {}
    for project in projects_by_key.values():
        for company_key, owner_name in company_identities(project["utility"]):
            company = companies_by_key.setdefault(company_key, {
                "id": _stable_id("company", company_key),
                "name": owner_name,
                "aliases": [],
                "projectIds": [],
            })
            if owner_name not in company["aliases"]:
                company["aliases"].append(owner_name)
            if project["id"] not in company["projectIds"]:
                company["projectIds"].append(project["id"])
    for company in companies_by_key.values():
        # Prefer the shortest actual owner label over a longer annotated variant.
        company["name"] = min(company["aliases"], key=lambda name: (len(name), name.casefold(), name))

    opportunities = []
    overlap_ids = set()
    for index, row in enumerate(overlap_rows, 1):
        if not isinstance(row, Mapping):
            raise ValueError(f"Overlap row {index} must be an object")
        overlap_id = _identifier(row.get("overlap_id"))
        if not overlap_id or overlap_id in overlap_ids:
            raise ValueError(f"Overlap row {index} has a missing or duplicate overlap_id")
        overlap_ids.add(overlap_id)
        keys = []
        for side in ("a", "b"):
            key = _project_key(row.get(f"utility_{side}"), row.get(f"project_id_{side}"))
            if key not in projects_by_key:
                raise ValueError(f"Overlap {overlap_id} references an unknown project ({side})")
            keys.append(key)
        distance = _number(row.get("distance_mi"), f"Overlap {overlap_id} distance_mi", minimum=0)
        days_apart = _number(row.get("time_gap (day)"), f"Overlap {overlap_id} time_gap (day)", optional=True, minimum=0)
        first, second = (projects_by_key[key] for key in keys)
        # Source company labels remain the join keys. Canonical owner identity
        # only determines whether this is an independent-company opportunity.
        if companies_overlap(first["utility"], second["utility"]):
            continue
        first_point, second_point = _closest_pair(*(references_by_key[key] for key in keys))
        location = " / ".join(_distinct((first_point["name"] if first_point else first["area"], second_point["name"] if second_point else second["area"])))
        opportunities.append({
            "id": overlap_id,
            "location": location,
            "descProject": first,
            "gpcProject": second,
            "descReference": first_point,
            "gpcReference": second_point,
            "daysApart": days_apart,
            "referenceDistanceMiles": distance,
            "impactSummary": _impact_summary(first, second, distance),
        })

    return {
        "opportunities": opportunities,
        "projects": list(projects_by_key.values()),
        "companies": sorted(companies_by_key.values(), key=lambda company: (company["name"].casefold(), company["id"])),
        "referenceAreas": reference_areas,
        "meta": {
            "projectRows": len(project_rows),
            "projectCount": len(projects_by_key),
            "overlapCount": len(overlap_rows),
            "eligibleOverlapCount": len(opportunities),
            "excludedSameCompanyCount": len(overlap_rows) - len(opportunities),
            "unassignedProjectRows": unassigned,
        },
    }
