function normalizeProjectKey(project) {
  const normalizedUtility = String(project?.utility ?? '').trim();
  const normalizedTitle = String(project?.title ?? '').trim();

  return `${normalizedUtility.toLowerCase()}:${normalizedTitle.toLowerCase()}`;
}

function buildOpportunitiesIndex(opportunities = []) {
  const projects = [];
  const byKey = new Map();

  opportunities.forEach((opportunity) => {
    const pair = [opportunity.descProject, opportunity.gpcProject].filter(Boolean);

    pair.forEach((project) => {
      const key = normalizeProjectKey(project);
      if (!byKey.has(key)) {
        byKey.set(key, project);
        projects.push(project);
      }
    });
  });

  return { projects, byKey };
}

function normalizeQuery(value) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function searchProjects(query, opportunities = []) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches = new Map();

  opportunities.forEach((opportunity) => {
    [opportunity.descProject, opportunity.gpcProject].forEach((project) => {
      const searchableValues = [
        project?.title,
        project?.utility,
        project?.area,
        project?.sourceProjectId,
        ...(project?.aliases ?? []),
      ].filter(Boolean).map((value) => normalizeQuery(value));

      const hit = searchableValues.some((value) => value.includes(normalizedQuery));
      if (hit && !matches.has(projectKey(project))) {
        matches.set(projectKey(project), project);
      }
    });
  });

  return Array.from(matches.values());
}

function projectKey(project) {
  return `${project.utility}:${project.title}`;
}

module.exports = {
  normalizeProjectKey,
  buildOpportunitiesIndex,
  searchProjects,
  projectKey,
};
