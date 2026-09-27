/**
* This file initializes the Express server, validates locally defined API keys,
* applies basic rate limiting, and routes incoming requests to API controller methods.
*/
const rateLimit = require("express-rate-limit");
const express = require("express");
const apiRoutes = require("./routes/api");
const logger = require("./utils/logging");
require("dotenv").config();

// Load local shared secrets from environment variables
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const app = express();

// Middleware for rate limiting
const limiter = rateLimit({
   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10), // 15 minutes
   max: parseInt(process.env.RATE_LIMIT_MAX, 10), // Limit each IP to 100 requests per windowMs
   message: { message: process.env.RATE_LIMIT_MESSAGE },
});
// Apply the rate limiter to all requests
app.use(limiter);

// Middleware for parsing requests
app.use(express.json());

// Middleware for basic API key authentication
// NOTE: Replace this with your preferred authentication method in production
app.use((req, res, next) => {
   logger.info({
      method: req.method,
      url: req.originalUrl,
      body: req.body,
      headers: req.headers,
   });
   const apiKey = req.headers["x-api-key"];
   const apiSecret = req.headers["x-api-secret"];
   if (apiKey === API_KEY && apiSecret === API_SECRET) {
      next(); // Authorized
   } else {
      res.status(403).json({ message: "Forbidden: Invalid API Key or Secret" });
   }
});

// Middleware for API routing
app.use("/api", apiRoutes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});
