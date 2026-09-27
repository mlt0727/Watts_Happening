/**
 * projectRoutes.js
 *
 * Express routes + MongoDB Atlas aggregation pipelines for:
 *   1. Search-bar partial match (project name / utility)
 *   2. Map area selection -> project details for the projects in that area
 *   3. "View in table" -> paginated/refreshable version of #2
 *   4. Selecting a project -> ranked list of overlapping projects
 *
 * ASSUMPTIONS (adjust field names to match your actual schema):
 *
 * projects collection document shape:
 * {
 *   _id: ObjectId,
 *   projectName: String,
 *   utility: String,
 *   plannedInServiceDate: Date,
 *   description: String,
 *   source: String,
 *   projectType: String,
 *   startDate: Date,
 *   endDate: Date,
 *   location: {
 *     type: "Point",
 *     coordinates: [lng, lat]   // GeoJSON order: [longitude, latitude]
 *   }
 * }
 *
 * Requires a 2dsphere index on `location`:
 *   db.projects.createIndex({ location: "2dsphere" })
 *
 * For fast partial-match search at scale, an Atlas Search index is strongly
 * recommended over regex (see note in endpoint #1). A minimal Atlas Search
 * index definition is included below as a comment.
 */

const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// getDb() should return your already-connected MongoDB Atlas database handle,
// e.g. from a shared db.js module: const client = await MongoClient.connect(uri);
// module.exports = { getDb: () => client.db("wattsHappening") };
const { getDb } = require("../db");

const PROJECTS_COLLECTION = "projects";

/* ------------------------------------------------------------------------ *
 * 1. SEARCH BAR — partial match on projectName or utility
 * GET /api/projects/search?q=<text>
 * ------------------------------------------------------------------------ */

router.get("/projects/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.json({ results: [] });
    }

    const db = getDb();

    // ---- OPTION A: regex-based partial match (no extra setup required) ----
    // Fine for small-to-medium collections. Case-insensitive, matches
    // anywhere in the string (like SQL's `LIKE '%q%'`).
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex chars
    const regex = new RegExp(escaped, "i");

    const results = await db
      .collection(PROJECTS_COLLECTION)
      .aggregate([
        {
          $match: {
            $or: [{ projectName: regex }, { utility: regex }],
          },
        },
        {
          $project: {
            _id: 1,
            projectName: 1,
            utility: 1,
          },
        },
        { $limit: 25 },
      ])
      .toArray();

    res.json({ results });

    /* ---- OPTION B: MongoDB Atlas Search autocomplete (recommended at scale) ----
     * Regex scans every document and can't use a normal index efficiently.
     * If you have Atlas Search enabled, create an index like:
     *
     * {
     *   "mappings": {
     *     "dynamic": false,
     *     "fields": {
     *       "projectName": { "type": "autocomplete" },
     *       "utility": { "type": "autocomplete" }
     *     }
     *   }
     * }
     * (Atlas UI: Database > Search > Create Search Index, name it e.g. "projectAutocomplete")
     *
     * Then replace the pipeline above with:
     *
     * const results = await db.collection(PROJECTS_COLLECTION).aggregate([
     *   {
     *     $search: {
     *       index: "projectAutocomplete",
     *       compound: {
     *         should: [
     *           { autocomplete: { query: q, path: "projectName" } },
     *           { autocomplete: { query: q, path: "utility" } },
     *         ],
     *       },
     *     },
     *   },
     *   { $limit: 25 },
     *   { $project: { _id: 1, projectName: 1, utility: 1, score: { $meta: "searchScore" } } },
     *   { $sort: { score: -1 } },
     * ]).toArray();
     */
  } catch (err) {
    console.error("Error in /projects/search:", err);
    res.status(500).json({ error: "Failed to search projects" });
  }
});

/* ------------------------------------------------------------------------ *
 * 2. MAP AREA SELECTION — details for the project(s) inside a highlighted area
 * GET /api/projects/area?lng=<num>&lat=<num>&radiusKm=<num>
 *
 * Uses $geoWithin + $centerSphere: a circle defined by a center point
 * (where the user clicked / the centroid of the highlighted shape) and a
 * radius. Simpler for the frontend than sending a full polygon, and a
 * natural fit for "highlighted area on the map" style interactions.
 * ------------------------------------------------------------------------ */

router.get("/projects/area", async (req, res) => {
  try {
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const radiusKm = parseFloat(req.query.radiusKm);

    if ([lng, lat, radiusKm].some((n) => Number.isNaN(n))) {
      return res
        .status(400)
        .json({ error: "lng, lat, and radiusKm query params are required numbers" });
    }

    const EARTH_RADIUS_KM = 6371;
    const radiusRadians = radiusKm / EARTH_RADIUS_KM; // $centerSphere expects radius in radians

    const db = getDb();

    const results = await db
      .collection(PROJECTS_COLLECTION)
      .aggregate([
        {
          $match: {
            location: {
              $geoWithin: {
                $centerSphere: [[lng, lat], radiusRadians],
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            utility: 1,
            projectName: 1,
            plannedInServiceDate: 1,
            description: 1,
            source: 1,
          },
        },
      ])
      .toArray();

    res.json({ results }); // frontend renders whichever come back (typically 2 for an overlap area)

    /* ---- ALTERNATIVE: polygon-based $geoWithin ----
     * If your highlighted areas are actually drawn/fixed polygon shapes
     * (not a radius around a click point), use this instead, sent as
     * POST /api/projects/area with body { polygon: [[lng,lat], ...] }
     * (closed ring, first and last point identical):
     *
     * $match: {
     *   location: {
     *     $geoWithin: {
     *       $geometry: { type: "Polygon", coordinates: [polygon] },
     *     },
     *   },
     * }
     */
  } catch (err) {
    console.error("Error in /projects/area:", err);
    res.status(500).json({ error: "Failed to fetch projects in area" });
  }
});

/* ------------------------------------------------------------------------ *
 * 3. "VIEW IN TABLE" — same shape as #2, paginated so the panel can refresh
 * GET /api/projects/table?page=1&limit=20&sortBy=plannedInServiceDate&sortDir=asc
 * ------------------------------------------------------------------------ */

router.get("/projects/table", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const sortBy = ["projectName", "utility", "plannedInServiceDate"].includes(req.query.sortBy)
      ? req.query.sortBy
      : "plannedInServiceDate";
    const sortDir = req.query.sortDir === "desc" ? -1 : 1;

    const db = getDb();
    const collection = db.collection(PROJECTS_COLLECTION);

    const [results, totalCount] = await Promise.all([
      collection
        .aggregate([
          { $sort: { [sortBy]: sortDir } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              utility: 1,
              projectName: 1,
              plannedInServiceDate: 1,
              description: 1,
              source: 1,
            },
          },
        ])
        .toArray(),
      collection.countDocuments({}),
    ]);

    res.json({
      results,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err) {
    console.error("Error in /projects/table:", err);
    res.status(500).json({ error: "Failed to fetch project table" });
  }
});

/* ------------------------------------------------------------------------ *
 * 4. SELECT A PROJECT — ranked list of overlapping projects
 * GET /api/projects/:projectId/overlaps?maxDistanceKm=50
 *
 * "Overlapping" = within maxDistanceKm of the selected project AND has a
 * date range that overlaps the selected project's [startDate, endDate].
 * Self-join via $lookup, computes Haversine distance + day overlap, then
 * ranks by distance ascending (closest / most relevant first).
 * ------------------------------------------------------------------------ */

router.get("/projects/:projectId/overlaps", async (req, res) => {
  try {
    const { projectId } = req.params;
    const maxDistanceKm = parseFloat(req.query.maxDistanceKm) || 50;

    if (!ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: "Invalid projectId" });
    }

    const db = getDb();

    const results = await db
      .collection(PROJECTS_COLLECTION)
      .aggregate([
        // Start from the selected project only
        { $match: { _id: new ObjectId(projectId) } },

        // Self-join: pair it with every OTHER project
        {
          $lookup: {
            from: PROJECTS_COLLECTION,
            let: {
              selfId: "$_id",
              selfLng: { $arrayElemAt: ["$location.coordinates", 0] },
              selfLat: { $arrayElemAt: ["$location.coordinates", 1] },
              selfStart: "$startDate",
              selfEnd: "$endDate",
            },
            pipeline: [
              { $match: { $expr: { $ne: ["$_id", "$$selfId"] } } }, // exclude itself
              {
                $addFields: {
                  distanceKm: {
                    $let: {
                      vars: {
                        lat1: { $degreesToRadians: "$$selfLat" },
                        lon1: { $degreesToRadians: "$$selfLng" },
                        lat2: {
                          $degreesToRadians: { $arrayElemAt: ["$location.coordinates", 1] },
                        },
                        lon2: {
                          $degreesToRadians: { $arrayElemAt: ["$location.coordinates", 0] },
                        },
                      },
                      in: {
                        $multiply: [
                          6371, // Earth's radius in km
                          {
                            $acos: {
                              $min: [
                                1, // guard against floating-point rounding pushing acos out of [-1,1]
                                {
                                  $max: [
                                    -1,
                                    {
                                      $add: [
                                        { $multiply: [{ $sin: "$$lat1" }, { $sin: "$$lat2" }] },
                                        {
                                          $multiply: [
                                            { $cos: "$$lat1" },
                                            { $cos: "$$lat2" },
                                            { $cos: { $subtract: ["$$lon2", "$$lon1"] } },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                  // Overlap in days between [selfStart, selfEnd] and [this.startDate, this.endDate]
                  overlapDays: {
                    $let: {
                      vars: {
                        overlapStart: { $max: ["$$selfStart", "$startDate"] },
                        overlapEnd: { $min: ["$$selfEnd", "$endDate"] },
                      },
                      in: {
                        $max: [
                          0,
                          {
                            $divide: [
                              { $subtract: ["$$overlapEnd", "$$overlapStart"] },
                              1000 * 60 * 60 * 24, // ms -> days
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              },
              // Keep only genuinely nearby AND time-overlapping projects
              {
                $match: {
                  distanceKm: { $lt: maxDistanceKm },
                  overlapDays: { $gt: 0 },
                },
              },
              {
                $project: {
                  _id: 1,
                  utility: 1,
                  projectType: 1,
                  distanceKm: { $round: ["$distanceKm", 2] },
                  overlapDays: { $round: ["$overlapDays", 0] },
                },
              },
            ],
            as: "overlaps",
          },
        },

        // Flatten into one row per overlapping pair
        { $unwind: "$overlaps" },

        {
          $project: {
            _id: 0,
            utilityA: "$utility",
            utilityB: "$overlaps.utility",
            distanceKm: "$overlaps.distanceKm",
            overlapDays: "$overlaps.overlapDays",
            projectType: "$overlaps.projectType",
            overlappingProjectId: "$overlaps._id",
          },
        },

        // Rank: closest first, ties broken by longest overlap
        { $sort: { distanceKm: 1, overlapDays: -1 } },
      ])
      .toArray();

    res.json({ results });
  } catch (err) {
    console.error("Error in /projects/:projectId/overlaps:", err);
    res.status(500).json({ error: "Failed to fetch overlapping projects" });
  }
});

module.exports = router;