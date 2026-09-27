const mongoose = require("mongoose");
require("dotenv").config();
const connections = {}; // Cache for database connections

/**
* Manages MongoDB database connections.
* @param {string} database - The database name.
* @returns {mongoose.Connection} - Mongoose connection instance.
*/
const getDatabaseConnection = (database) => {
   const baseURI = process.env.MONGO_URI;
   const options = process.env.MONGO_OPTIONS || "";
   if (!baseURI) {
      throw new Error("MONGO_URI is not defined in .env file");
   }

   const normalizedDatabase = String(database || '').trim();
   const normalizedBaseURI = baseURI.replace(/\/+$/, '');

   if (!connections[normalizedDatabase]) {
      connections[normalizedDatabase] = mongoose.createConnection(
         `${normalizedBaseURI}${options}`,
         { dbName: normalizedDatabase }
      );

      connections[normalizedDatabase].on("error", (err) => {
         console.error(`MongoDB connection error for ${normalizedDatabase}:`, err);
      });
      connections[normalizedDatabase].once("open", () => {
         console.log(`Connected to MongoDB database: ${normalizedDatabase}`);
      });
   }
   return connections[normalizedDatabase];
};

module.exports = getDatabaseConnection;
