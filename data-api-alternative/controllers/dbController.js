 /**
 * Contains the logic for all CRUD and aggregation operations.
 * Each method interacts with the database and handles errors gracefully.
 */
 const getModel = require("../models/dynamicModel");

 class DbController {
   async insertOne(req, res) {
      const { database, collection, document } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.insertOne(document);
         if (!result) {
            return res
            .status(400)
            .json({ success: false, message: "Insertion failed" });
         }
         res.status(201).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async insertMany(req, res) {
      const { database, collection, documents } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.insertMany(documents);
         if (!result || result.length === 0) {
            return res
            .status(400)
            .json({ success: false, message: "Insertion failed" });
         }
         res.status(201).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async findOne(req, res) {
      const { database, collection, filter, projection } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.findOne(filter, projection);
         if (!result) {
            return res
            .status(404)
            .json({ success: false, message: "No record found" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async find(req, res) {
      const { database, collection, filter, projection, sort, limit } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.find(filter, projection).sort(sort).limit(limit);
         if (!result || result.length === 0) {
            return res
            .status(404)
            .json({ success: false, message: "No records found" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
   }

   async updateOne(req, res) {
      const { database, collection, filter, update, upsert } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.updateOne(filter, update, { upsert });
         if (result.matchedCount === 0) {
            return res
            .status(404)
            .json({ success: false, message: "No records updated" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async updateMany(req, res) {
      const { database, collection, filter, update } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.updateMany(filter, update);
         if (result.matchedCount === 0) {
            return res
            .status(404)
            .json({ success: false, message: "No records updated" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async deleteOne(req, res) {
      const { database, collection, filter } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.deleteOne(filter);
         if (result.deletedCount === 0) {
            return res
            .status(404)
            .json({ success: false, message: "No records deleted" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async deleteMany(req, res) {
      const { database, collection, filter } = req.body;
      try {
      const Model = getModel(database, collection);
      const result = await Model.deleteMany(filter);
      if (result.deletedCount === 0) {
            return res
            .status(404).json({ success: false, message: "No records deleted" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }

   async aggregate(req, res) {
      const { database, collection, pipeline } = req.body;
      try {
         const Model = getModel(database, collection);
         const result = await Model.aggregate(pipeline);
         if (!result || result.length === 0) {
            return res
            .status(404)
            .json({ success: false, message: "No aggregation results found" });
         }
         res.status(200).json({ success: true, result });
      } catch (error) {
         res.status(500).json({ success: false, error: error.message });
      }
   }
 }

 module.exports = new DbController();
