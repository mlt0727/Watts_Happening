import argparse
import csv
import math
import sys
import tempfile
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EARTH_RADIUS_KM = 6371.0088
KM_PER_MILE = 1.609344
OUTPUT_FIELDS = [
    "overlap_id", "distance_mi", "time_gap (day)",
    "utility_a", "project_id_a", "project_name_a",
    "utility_b", "project_id_b", "project_name_b",
]


@dataclass
class Project:
    project_id: str
    name: str
    stations: list[tuple[float, float]] = field(default_factory=list)
    year_values: set[str] = field(default_factory=set)


def load_projects(path: Path) -> dict[str, dict[str, Project]]:
    companies: dict[str, dict[str, Project]] = {}
    unassigned_rows = []
    name_conflicts = set()
    required = {"company_name", "project_id", "project_name", "latitude", "longitude",
                "estimated_in_service_year"}
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Missing input columns: {', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, start=2):
            company = (row["company_name"] or "").strip()
            project_id = (row["project_id"] or "").strip()
            name = (row["project_name"] or "").strip()
            if not project_id and not name:
                unassigned_rows.append(row_number)
                continue
            if not company or not project_id or not name:
                raise ValueError(f"Row {row_number}: company, project ID and name are required")
            try:
                latitude = float(row["latitude"])
                longitude = float(row["longitude"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Row {row_number}: invalid station coordinates") from exc
            if not (math.isfinite(latitude) and math.isfinite(longitude)
                    and -90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError(f"Row {row_number}: station coordinates are out of range")

            projects = companies.setdefault(company, {})
            project = projects.setdefault(project_id, Project(project_id, name))
            if project.name != name:
                name_conflicts.add((company, project_id))
            project.stations.append((latitude, longitude))
            project.year_values.add((row["estimated_in_service_year"] or "").strip())
    if unassigned_rows:
        print(f"Skipped {len(unassigned_rows)} rows missing project ID and name; "
              f"CSV record numbers: {', '.join(map(str, unassigned_rows))}", file=sys.stderr)
    for company, project_id in sorted(name_conflicts):
        print(f"Conflicting names for {company} / {project_id}; using the first name.", file=sys.stderr)
    return companies


def estimated_time_gap_days(project_a: Project, project_b: Project) -> int | str:
    """按唯一投运年份估算天数：abs(year_a - year_b) * 365，不计闰年。

    项目所有 station 行必须给出相同的四位年份；缺失、多年份或互相矛盾时返回 NaN。
    """
    years = []
    for project in (project_a, project_b):
        if len(project.year_values) != 1:
            return "NaN"
        value = next(iter(project.year_values))
        if len(value) != 4 or not value.isascii() or not value.isdigit():
            return "NaN"
        years.append(int(value))
    return abs(years[0] - years[1]) * 365


def station_distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat_a, lon_a = map(math.radians, a)
    lat_b, lon_b = map(math.radians, b)
    haversine = (math.sin((lat_b - lat_a) / 2) ** 2
                 + math.cos(lat_a) * math.cos(lat_b) * math.sin((lon_b - lon_a) / 2) ** 2)
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, max(0.0, haversine))))


def project_distance_km(project_a: Project, project_b: Project) -> float:
    return min(
        station_distance_km(station_a, station_b)
        for station_a in project_a.stations
        for station_b in project_b.stations
    )


def find_overlaps(companies: dict[str, dict[str, Project]], threshold_km: float = 40.0):
    if not math.isfinite(threshold_km) or threshold_km <= 0:
        raise ValueError("Distance threshold must be a positive finite number")
    overlap_id = 0
    for company_a, company_b in combinations(sorted(companies), 2):
        for project_id_a in sorted(companies[company_a]):
            for project_id_b in sorted(companies[company_b]):
                project_a = companies[company_a][project_id_a]
                project_b = companies[company_b][project_id_b]
                distance_km = project_distance_km(project_a, project_b)
                if distance_km < threshold_km:
                    overlap_id += 1
                    yield {
                        "overlap_id": f"OVL_{overlap_id}",
                        "distance_mi": f"{distance_km / KM_PER_MILE:.6f}",
                        "time_gap (day)": estimated_time_gap_days(project_a, project_b),
                        "utility_a": company_a,
                        "project_id_a": project_a.project_id,
                        "project_name_a": project_a.name,
                        "utility_b": company_b,
                        "project_id_b": project_b.project_id,
                        "project_name_b": project_b.name,
                    }


def read_output_header(template: Path) -> list[str]:
    with template.open("r", encoding="utf-8-sig", newline="") as source:
        header = next(csv.reader(source), [])
    if len(header) != len(OUTPUT_FIELDS) or set(header) != set(OUTPUT_FIELDS):
        raise ValueError(f"Unexpected overlap header in {template}")
    return header


def open_output_csv(path: Path):
    try:
        return path.open("w", encoding="utf-8", newline="")
    except PermissionError:
        # Excel 等程序可能占用原文件；保存到唯一的新文件名。
        destination = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", delete=False,
            dir=path.parent, prefix=f"{path.stem}_", suffix=path.suffix,
        )
        print(f"Cannot write to {path}; it may be open in another program. "
              f"Saving to {destination.name} instead.", file=sys.stderr)
        return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Find cross-company project pairs less than 40 km apart.")
    parser.add_argument("--input", type=Path, default=DATA_DIR / "projects.csv")
    parser.add_argument("--template", type=Path, default=DATA_DIR / "overlaps.csv")
    parser.add_argument("--output", type=Path, default=DATA_DIR / "cross_company_overlaps.csv")
    parser.add_argument("--threshold-km", type=float, default=40.0)
    args = parser.parse_args()
    if not math.isfinite(args.threshold_km) or args.threshold_km <= 0:
        parser.error("--threshold-km must be a positive finite number")
    if args.output.resolve() in {args.input.resolve(), args.template.resolve()}:
        parser.error("Output must be a new CSV, distinct from the input and header template")

    header = read_output_header(args.template)
    companies = load_projects(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    estimated_count = 0
    with open_output_csv(args.output) as destination:
        actual_output = Path(destination.name)
        writer = csv.DictWriter(destination, fieldnames=header)
        writer.writeheader()
        for overlap in find_overlaps(companies, args.threshold_km):
            writer.writerow(overlap)
            count += 1
            if overlap["time_gap (day)"] != "NaN":
                estimated_count += 1
    project_count = sum(len(projects) for projects in companies.values())
    print(f"Compared {len(companies)} company groups / {project_count} projects.")
    print(f"Saved {count} project pairs with distance < {args.threshold_km:g} km to {actual_output}")
    print("distance_mi is in miles; time_gap (day) = abs(year_a - year_b) * 365 (estimated).")
    print(f"Time gaps: {estimated_count} calculated; {count - estimated_count} NaN "
          "because a project has missing or multiple years.")


if __name__ == "__main__":
    main()
