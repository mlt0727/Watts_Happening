function normalizeSearchText(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchDashboard(companies, projects, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const matches = (value) => normalizeSearchText(value).includes(normalizedQuery);
  return [
    ...companies
      .filter((company) => [company.name, ...(company.aliases ?? [])].some(matches))
      .map((item) => ({ kind: "company", item })),
    ...projects
      .filter((project) => matches(project.title))
      .map((item) => ({ kind: "project", item })),
  ];
}
