// server.js — Heartfelt Kitchen & Co. website backend
// This is a starter/skeleton app whose only job right now is to prove the
// deploy pipeline works end to end: GitHub -> Render -> Postgres -> custom
// domain. Real pages (home, menu, about, etc.) get built out from here.

require("dotenv").config();
const express = require("express");
const path = require("path");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clean URLs: redirect any request ending in ".html" to the extensionless
// version (e.g. /about.html -> /about), so the address bar never shows
// ".html" and there's one canonical URL per page.
app.use((req, res, next) => {
  if (req.path.endsWith(".html") && req.path !== "/index.html") {
    const cleanPath = req.path.slice(0, -".html".length);
    return res.redirect(301, cleanPath + req.url.slice(req.path.length));
  }
  next();
});

// Serve static files (HTML/CSS/images) from a "public" folder, resolving
// extensionless routes to their .html file (e.g. /about -> about.html).
// Drop the finished site pages in there once they're ready.
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Simple health check — visiting this confirms the server AND the database
// connection are both working. Good first thing to check after deploying.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", database: "not connected", error: err.message });
  }
});

// Real inquiry-form submission endpoint. The site's wedding/custom cake/
// catering/event/class inquiry forms should all POST here.
app.post("/api/inquiries", async (req, res) => {
  const {
    inquiry_type,
    name,
    email,
    phone,
    event_date,
    event_location,
    guest_count,
    products_requested,
    budget_estimate,
    delivery_or_pickup,
    notes,
  } = req.body;

  if (!inquiry_type || !name || !email) {
    return res.status(400).json({ error: "inquiry_type, name, and email are required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO inquiries
        (inquiry_type, name, email, phone, event_date, event_location, guest_count, products_requested, budget_estimate, delivery_or_pickup, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, created_at`,
      [
        inquiry_type,
        name,
        email,
        phone || null,
        event_date || null,
        event_location || null,
        guest_count || null,
        products_requested || null,
        budget_estimate || null,
        delivery_or_pickup || null,
        notes || null,
      ]
    );
    res.status(201).json({ success: true, inquiry: result.rows[0] });
  } catch (err) {
    console.error("Failed to save inquiry:", err);
    res.status(500).json({ error: "Something went wrong saving your inquiry. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`Heartfelt Kitchen & Co. server running on port ${PORT}`);
});
