 // Import the mongoose library for MongoDB object modeling
 const mongoose = require("mongoose");
 // Import the function to get a database connection
 const getDatabaseConnection = require("../connection/databaseManager");

 // Initialize an empty object to cache models
 // This helps in reusing models and avoiding redundant model creation
 const modelsCache = {}; // Cache for models (database.collection -> Model)

 /**
 * Creates and retrieves a dynamic model for a given database and collection.
 * This function ensures that the same model is reused if it has already been created.
 *
 * @param {string} database - The name of the database.
 * @param {string} collection - The name of the collection.
 * @returns {mongoose.Model} - The Mongoose model instance for the specified collection.
 */
 const getModel = (database, collection) => {
   // Create a unique key for the model based on the database and collection names
   const modelKey = `${database}.${collection}`;

   // Check if the model already exists in the cache
   // If it does, return the cached model
   if (modelsCache[modelKey]) {
      return modelsCache[modelKey];
   }

   // Get the database connection for the specified database
   const dbConnection = getDatabaseConnection(database);

   // Define a flexible schema with no predefined structure
   // This allows the schema to accept any fields
   const schema = new mongoose.Schema({}, { strict: false });

   // Create the model using the database connection, collection name, and schema
   // Cache the model for future use
   const model = dbConnection.model(collection, schema, collection);
   modelsCache[modelKey] = model;

   // Return the newly created model
   return model;
 };

 // Export the getModel function as a module
 module.exports = getModel;
