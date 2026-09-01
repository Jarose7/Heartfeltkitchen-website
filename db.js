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

// node-postgres emits 'error' on the pool when an already-connected, idle
// client hits a problem (e.g. the backend restarts it). Without a listener
// here, that event has no handler and can crash the whole Node process.
// This just logs it so a transient DB blip degrades gracefully instead of
// taking the server down.
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle Postgres client:", err);
});

console.log(
  "[db] Pool configured — DATABASE_URL set:",
  !!process.env.DATABASE_URL,
  process.env.DATABASE_URL
    ? `(host: ${new URL(process.env.DATABASE_URL).hostname})`
    : ""
);

module.exports = pool;
