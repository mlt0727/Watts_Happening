 /**
 * Defines the routes for all API endpoints and maps them to the corresponding functions in the dbController class.
 */
 const express = require('express');
 const path = require('node:path');
 const mongoose = require('mongoose');
 const { pathToFileURL } = require('node:url');
 const dbController = require('../controllers/dbController');
 const getDatabaseConnection = require('../connection/databaseManager');
 const { buildOpportunitiesIndex, searchProjects } = require('../opportunityCatalog');

 const router = express.Router();

 router.get('/health', (req, res) => {
   res.json({ ok: true, service: 'watts-happening-api' });
 });

 async function loadFallbackOpportunities() {
   const opportunitiesPath = path.join(__dirname, '../../frontend/src/data/opportunities.js');
   const moduleUrl = pathToFileURL(opportunitiesPath).href;
   const module = await import(moduleUrl);
   return module.opportunities ?? [];
 }

 function sortOpportunities(opportunities) {
   return [...opportunities].sort((first, second) => {
     const firstDistance = first.referenceDistanceMiles ?? Number.POSITIVE_INFINITY;
     const secondDistance = second.referenceDistanceMiles ?? Number.POSITIVE_INFINITY;
     const firstTiming = first.daysApart ?? Number.POSITIVE_INFINITY;
     const secondTiming = second.daysApart ?? Number.POSITIVE_INFINITY;

     if (firstDistance !== secondDistance) {
       return firstDistance - secondDistance;
     }

     if (firstTiming !== secondTiming) {
       return firstTiming - secondTiming;
     }

     return String(first.location ?? '').localeCompare(String(second.location ?? ''));
   });
 }

 function normalizeProjectName(value) {
   return String(value ?? '')
     .trim()
     .toLocaleLowerCase()
     .normalize('NFD')
     .replace(/[\u0300-\u036f]/g, '')
     .replace(/[^a-z0-9]+/g, ' ')
     .trim();
 }

 function averageCoordinates(points) {
   if (!Array.isArray(points) || points.length === 0) {
     return null;
   }

   const total = points.reduce(
     (accumulator, point) => ({
       lat: accumulator.lat + Number(point.lat),
       lon: accumulator.lon + Number(point.lon),
     }),
     { lat: 0, lon: 0 },
   );

   return {
     lat: total.lat / points.length,
     lon: total.lon / points.length,
   };
 }

 function parseNumericCost(candidate) {
   if (candidate == null || candidate === '') {
     return null;
   }

   if (typeof candidate === 'number' && Number.isFinite(candidate)) {
     return candidate;
   }

   if (typeof candidate === 'string') {
     const cleaned = candidate.trim().replace(/[$,_\s]/g, '').toUpperCase();
     if (!cleaned) {
       return null;
     }

     const normalized = cleaned.replace(/[<>~]/g, '');
     if (normalized.endsWith('B')) {
       const value = Number(normalized.slice(0, -1));
       return Number.isFinite(value) ? value * 1_000_000_000 : null;
     }

     if (normalized.endsWith('M')) {
       const value = Number(normalized.slice(0, -1));
       return Number.isFinite(value) ? value * 1_000_000 : null;
     }

     const match = normalized.match(/-?\d+(?:\.\d+)?/);
     if (!match) {
       return null;
     }

     const numericValue = Number(match[0]);
     return Number.isFinite(numericValue) ? numericValue : null;
   }

   return null;
 }

 function getProjectCost(project) {
   const costCandidates = [
     project.cost,
     project.estimated_cost,
     project.project_cost,
     project.total_cost,
     project.estimatedCost,
   ];

   for (const candidate of costCandidates) {
     const numericCost = parseNumericCost(candidate);
     if (numericCost != null && Number.isFinite(numericCost)) {
       return numericCost;
     }
   }

   return null;
 }

 function buildProjectReferenceLookup(projects = []) {
   const byProjectId = new Map();
   const byProjectName = new Map();
   const byProjectIdCost = new Map();
   const byProjectNameCost = new Map();

   projects.forEach((project) => {
     const latitude = Number(project.latitude);
     const longitude = Number(project.longitude);
     const projectId = project.project_id ?? project.projectId ?? null;
     const projectName = normalizeProjectName(
       project.project_name ?? project.name ?? project.title ?? project.projectName ?? '',
     );
     const cost = getProjectCost(project);

     if (projectId != null) {
       const key = String(projectId);
       const matching = byProjectId.get(key) ?? [];
       if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
         matching.push({ lat: latitude, lon: longitude });
       }
       byProjectId.set(key, matching);

       if (cost != null) {
         byProjectIdCost.set(key, cost);
       }
     }

     if (projectName) {
       const matching = byProjectName.get(projectName) ?? [];
       if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
         matching.push({ lat: latitude, lon: longitude });
       }
       byProjectName.set(projectName, matching);

       if (cost != null) {
         byProjectNameCost.set(projectName, cost);
       }
     }
   });

   return {
     byProjectId: new Map(
       [...byProjectId.entries()].map(([key, points]) => [key, averageCoordinates(points)]),
     ),
    byProjectName: new Map(
       [...byProjectName.entries()].map(([key, points]) => [key, averageCoordinates(points)]),
     ),
    byProjectIdCost,
    byProjectNameCost,
   };
 }

 function resolveReferenceFromLookup(projectId, projectName, lookup) {
   if (projectId != null) {
     const byProjectId = lookup?.byProjectId?.get?.(String(projectId));
     if (byProjectId) {
       return byProjectId;
     }
   }

   const normalizedProjectName = normalizeProjectName(projectName);
   if (normalizedProjectName && lookup?.byProjectName?.has?.(normalizedProjectName)) {
     return lookup.byProjectName.get(normalizedProjectName);
   }

   return null;
 }

 function getSavingsRate(distanceMiles) {
   if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) {
     return 0.15;
   }
   if (distanceMiles < 1.0) return 0.10;
   if (distanceMiles < 5.0) return 0.05;
   if (distanceMiles < 25.0) return 0.03;
   return 0.0;
 }

 function getCoordinationType(distanceMiles) {
   if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) {
     return 'crossing coordination, outage timing, right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment';
   }
   if (distanceMiles < 1.0) return 'right-of-way, access roads, permitting, laydown yards, deliveries, crews, and equipment';
   if (distanceMiles < 5.0) return 'laydown yards, deliveries, crews, and equipment';
   if (distanceMiles < 25.0) return 'crews and equipment';
   return 'no significant proximity-based coordination';
 }

 function estimateImpactForPair(costA, costB, distanceMiles) {
   const numericDistance = Number.isFinite(Number(distanceMiles)) ? Number(distanceMiles) : 0;
   const firstCost = parseNumericCost(costA) ?? 0;
   const secondCost = parseNumericCost(costB) ?? 0;
   const validCosts = [firstCost, secondCost].filter((value) => Number.isFinite(value) && value > 0);
   const combinedCost = firstCost + secondCost;
   const smallerProjectCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;
   const savingsRate = getSavingsRate(numericDistance);
   const estimatedSavings = smallerProjectCost * savingsRate;

   return {
     combinedCost,
     savingsRate,
     estimatedSavings,
     coordinationType: getCoordinationType(numericDistance),
   };
 }

 function normalizeOpportunityMongoRecord(doc, projectLookup = {}) {
   const rawDistance = doc.distance_mi ?? doc.referenceDistanceMiles ?? null;
   const rawGap = doc['time_gap (day)'] ?? doc.daysApart ?? doc.timelineGapDays ?? null;
   const descUtility = doc.utility_a ?? doc.utilityA ?? doc.utility ?? 'Unknown';
   const descTitle = doc.project_name_a ?? doc.projectA ?? doc.projectName ?? 'Unknown project';
   const gpcUtility = doc.utility_b ?? doc.utilityB ?? doc.utility ?? 'Unknown';
   const gpcTitle = doc.project_name_b ?? doc.projectB ?? doc.projectName ?? 'Unknown project';

   const descKnownCost =
     doc.cost_a ??
     projectLookup.byProjectIdCost?.get?.(String(doc.project_id_a)) ??
     projectLookup.byProjectNameCost?.get?.(normalizeProjectName(descTitle)) ??
     null;
   const gpcKnownCost =
     doc.cost_b ??
     projectLookup.byProjectIdCost?.get?.(String(doc.project_id_b)) ??
     projectLookup.byProjectNameCost?.get?.(normalizeProjectName(gpcTitle)) ??
     null;

   const descReference =
     resolveReferenceFromLookup(doc.project_id_a, descTitle, projectLookup) ??
     doc.descReference ??
     null;
   const gpcReference =
     resolveReferenceFromLookup(doc.project_id_b, gpcTitle, projectLookup) ??
     doc.gpcReference ??
     null;

   const referenceDistanceMiles = Number.isFinite(Number(rawDistance)) ? Number(rawDistance) : null;
   const impact = estimateImpactForPair(descKnownCost, gpcKnownCost, referenceDistanceMiles);

   return {
     ...doc,
     id: doc.id ?? doc._id?.toString?.() ?? doc.overlap_id ?? Math.random().toString(36).slice(2),
     referenceDistanceMiles,
     daysApart: Number.isFinite(Number(rawGap)) ? Number(rawGap) : null,
     location: doc.location ?? doc.state_name ?? doc.project_name_a ?? 'Overlapping project area',
     impact,
     descProject: {
       utility: descUtility,
       title: descTitle,
       area: doc.area_a ?? doc.state_name ?? 'Unknown area',
       plannedDate: doc.planned_date_a ?? null,
       estimatedCost: descKnownCost ?? null,
       latitude: descReference?.lat ?? null,
       longitude: descReference?.lon ?? null,
       projectType: 'Transmission Line',
       sourceStatus: 'Matched in Mongo records',
       sourceProjectId: doc.project_id_a ?? null,
     },
     gpcProject: {
       utility: gpcUtility,
       title: gpcTitle,
       area: doc.area_b ?? doc.state_name ?? 'Unknown area',
       plannedDate: doc.planned_date_b ?? null,
       estimatedCost: gpcKnownCost ?? null,
       latitude: gpcReference?.lat ?? null,
       longitude: gpcReference?.lon ?? null,
       projectType: 'Transmission Line',
       sourceStatus: 'Matched in Mongo records',
       sourceProjectId: doc.project_id_b ?? null,
     },
     descReference,
     gpcReference,
   };
 }

 async function loadOpportunitiesFromMongo() {
   const databaseName = process.env.MONGO_DATABASE || 'utility_projects_db';
   const collectionName = 'overlapping_projects';
   const db = getDatabaseConnection(databaseName);

   const model = db.models[collectionName]
     ?? db.model(collectionName, new mongoose.Schema({}, { strict: false }), collectionName);

   const utilityProjectModel = db.models.utility_projects
     ?? db.model(
       'utility_projects',
       new mongoose.Schema({}, { strict: false }),
       'utility_projects',
     );

   const [docs, utilityProjects] = await Promise.all([
     model.find({}).lean(),
     utilityProjectModel.find({}).lean(),
   ]);

   const projectLookup = buildProjectReferenceLookup(utilityProjects);
   return sortOpportunities(docs.map((doc) => normalizeOpportunityMongoRecord(doc, projectLookup)));
 }

 async function loadOpportunities() {
   try {
     const mongoOpportunities = await loadOpportunitiesFromMongo();
     if (Array.isArray(mongoOpportunities) && mongoOpportunities.length > 0) {
       return mongoOpportunities;
     }
   } catch (error) {
     console.warn('MongoDB overlapping_projects not available, falling back to frontend mock data:', error.message);
   }

   return loadFallbackOpportunities();
 }

 router.get('/opportunities', async (req, res) => {
   try {
     const opportunities = await loadOpportunities();
     const q = String(req.query.q ?? '').trim();

     if (!q) {
       return res.json({ results: sortOpportunities(opportunities) });
     }

     const matches = searchProjects(q, opportunities);
     const index = buildOpportunitiesIndex(opportunities);
     const relatedIds = new Set();

     matches.forEach((project) => {
       opportunities.forEach((opportunity) => {
         if (
           project.utility === opportunity.descProject.utility &&
           project.title === opportunity.descProject.title
         ) {
           relatedIds.add(opportunity.id);
         }

         if (
           project.utility === opportunity.gpcProject.utility &&
           project.title === opportunity.gpcProject.title
         ) {
           relatedIds.add(opportunity.id);
         }
       });
     });

     res.json({
       results: sortOpportunities(opportunities.filter((opportunity) => relatedIds.has(opportunity.id))),
       total: opportunities.length,
       index: {
         projectCount: index.projects.length,
         matches: matches.length,
       },
     });
   } catch (error) {
     console.error('Failed to load opportunities data:', error);
     res.status(500).json({ error: 'Could not load opportunities data' });
   }
 });

 router.get('/projects/search', async (req, res) => {
   try {
     const opportunities = await loadOpportunities();
     const query = String(req.query.q ?? '');
     const results = searchProjects(query, opportunities).map((project) => ({
       utility: project.utility,
       title: project.title,
       area: project.area,
       aliases: project.aliases ?? [],
       sourceProjectId: project.sourceProjectId ?? null,
       key: `${project.utility}:${project.title}`,
     }));

     res.json({ results });
   } catch (error) {
     console.error('Failed to search projects:', error);
     res.status(500).json({ error: 'Could not search project list' });
   }
 });

 router.get('/projects/:projectKey', async (req, res) => {
   try {
     const { projectKey } = req.params;
     const opportunities = await loadOpportunities();
     const project = opportunities
       .flatMap((opportunity) => [opportunity.descProject, opportunity.gpcProject])
       .find((candidate) => `${candidate.utility}:${candidate.title}` === decodeURIComponent(projectKey));

     if (!project) {
       return res.status(404).json({ error: 'Project not found' });
     }

     const relatedOpportunities = opportunities.filter(
       (opportunity) =>
         `${opportunity.descProject.utility}:${opportunity.descProject.title}` === `${project.utility}:${project.title}` ||
         `${opportunity.gpcProject.utility}:${opportunity.gpcProject.title}` === `${project.utility}:${project.title}`,
     );

     res.json({
       project,
       relatedOpportunities,
       results: relatedOpportunities,
     });
   } catch (error) {
     console.error('Failed to resolve project details:', error);
     res.status(500).json({ error: 'Could not resolve project details' });
   }
 });

 router.get('/utility-projects', async (req, res) => {
  try {
    const databaseName = process.env.MONGO_DATABASE || 'utility_projects_db';
    const db = getDatabaseConnection(databaseName);

    const UtilityProject = db.models.utility_projects
      ?? db.model(
        'utility_projects',
        new mongoose.Schema({}, { strict: false }),
        'utility_projects'
      );

    const docs = await UtilityProject.find({}).lean();

    res.json({
      results: docs,
      total: docs.length,
      collection: 'utility_projects',
      database: databaseName,
    });
  } catch (error) {
    console.error('Failed to load utility_projects:', error);
    res.status(500).json({
      error: 'Could not load utility_projects',
      details: error.message,
    });
  }
});

 router.post('/insertOne', dbController.insertOne);
 router.post('/insertMany', dbController.insertMany);
 router.post('/findOne', dbController.findOne);
 router.post('/find', dbController.find);
 router.post('/updateOne', dbController.updateOne);
 router.post('/deleteOne', dbController.deleteOne);
 router.post('/deleteMany', dbController.deleteMany);
 router.post('/aggregate', dbController.aggregate);


 module.exports = router;
