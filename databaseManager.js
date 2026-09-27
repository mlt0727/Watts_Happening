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

   // If connection does not exist, create it
   if (!connections[database]) {
      connections[database] = mongoose.createConnection(
         `${baseURI}/${database}${options}`
      );
      // Handle connection errors
      connections[database].on("error", (err) => {
         console.error(`MongoDB connection error for ${database}:`, err);
      });
      connections[database].once("open", () => {
         console.log(`Connected to MongoDB database: ${database}`);
      });
   }
   return connections[database];
};

module.exports = getDatabaseConnection;
