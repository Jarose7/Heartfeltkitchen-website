// db.js — Postgres connection pool
// Render automatically provides a DATABASE_URL environment variable when you
// link a Postgres database to a Web Service, so no manual config is needed
// once both are set up on Render. Locally, put DATABASE_URL in a .env file
// (see .env.example) for testing against a local/dev database.

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render's internal Postgres connections don't require SSL, but Render's
  // *external* connection strings do. This handles both safely.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;
