// admin.js — Heartfelt Kitchen & Co. admin panel routes.
// Single admin login (no multi-user management, per Jack's scope decision
// on 2026-09-01). Credentials live in Render environment variables, never
// in code or the database: ADMIN_USERNAME, ADMIN_PASSWORD_HASH.
//
// All schema changes this file depends on live in schema-admin.sql, which
// Jack runs manually against the live database. Nothing here creates or
// alters tables automatically.

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
});

function buildAdminRouter(pool) {
  const router = express.Router();
  const viewsDir = path.join(__dirname, "views", "admin");

  // Public (unauthenticated) route so menu photos can actually display on
  // the live site — no admin data is exposed, just the image bytes.
  // Registered BEFORE the session middleware below, so it never touches
  // sessions at all and stays up even if the session store has issues.
  router.get("/menu-photo/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT photo, photo_mime FROM menu_items WHERE id=$1 AND photo IS NOT NULL",
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).end();
      const { photo, photo_mime } = result.rows[0];
      res.set("Content-Type", photo_mime || "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(photo);
    } catch (err) {
      console.error("Failed to load menu photo:", err);
      res.status(500).end();
    }
  });

  // Sessions live ONLY on admin/API-admin routes from here down, scoped to
  // this router — not mounted globally on the app. That way, if anything
  // ever goes wrong with the session store, only admin routes are
  // affected; the public site (home, menu, about, etc.) never touches
  // sessions at all and keeps working regardless. This is the fix for the
  // 2026-09-01 incident where logging in broke the entire public site.
  router.use(
    session({
      store: new pgSession({ pool, createTableIfMissing: false }),
      secret: process.env.SESSION_SECRET || "dev-only-secret-change-in-render-env",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
    })
  );

  // ---- auth helpers ----------------------------------------------------

  function requireAdminPage(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.redirect("/admin/login");
  }

  function requireAdminApi(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    return res.status(401).json({ error: "Not logged in." });
  }

  // ---- login / logout ----------------------------------------------------

  router.get("/admin/login", (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect("/admin");
    res.sendFile(path.join(viewsDir, "login.html"));
  });

  router.post("/admin/login", express.urlencoded({ extended: true }), async (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminUser || !adminHash) {
      return res.redirect("/admin/login?error=not_configured");
    }
    if (!username || !password || username !== adminUser) {
      return res.redirect("/admin/login?error=1");
    }

    try {
      const ok = await bcrypt.compare(password, adminHash);
      if (!ok) return res.redirect("/admin/login?error=1");
      req.session.isAdmin = true;
      req.session.username = username;
      res.redirect("/admin");
    } catch (err) {
      console.error("Login error:", err);
      res.redirect("/admin/login?error=1");
    }
  });

  router.post("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
  });

  // ---- admin dashboard page ----------------------------------------------

  router.get("/admin", requireAdminPage, (req, res) => {
    res.sendFile(path.join(viewsDir, "dashboard.html"));
  });

  // Static assets for the admin UI (CSS/JS) — no sensitive data, safe to
  // serve unauthenticated so the login page itself can be styled.
  router.use("/admin-assets", express.static(path.join(__dirname, "admin-assets")));

  // ---- menu items API ------------------------------------------------

  router.get("/api/admin/menu-items", requireAdminApi, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, price_text, category, active, sort_order,
                (photo IS NOT NULL) AS has_photo, created_at, updated_at
         FROM menu_items ORDER BY category, sort_order, name`
      );
      res.json({ items: result.rows });
    } catch (err) {
      console.error("Failed to list menu items:", err);
      res.status(500).json({ error: "Failed to load menu items." });
    }
  });

  router.post("/api/admin/menu-items", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { name, description, price_text, category, active, sort_order } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: "Name and category are required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO menu_items (name, description, price_text, category, photo, photo_mime, active, sort_order, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         RETURNING id`,
        [
          name,
          description || null,
          price_text || null,
          category === "seasonal" ? "seasonal" : "staple",
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null,
          active === "false" ? false : true,
          sort_order ? parseInt(sort_order, 10) : 0,
        ]
      );
      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error("Failed to create menu item:", err);
      res.status(500).json({ error: "Failed to save menu item." });
    }
  });

  router.put("/api/admin/menu-items/:id", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { id } = req.params;
    const { name, description, price_text, category, active, sort_order } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: "Name and category are required." });
    }
    try {
      if (req.file) {
        await pool.query(
          `UPDATE menu_items SET name=$1, description=$2, price_text=$3, category=$4,
             photo=$5, photo_mime=$6, active=$7, sort_order=$8, updated_at=now()
           WHERE id=$9`,
          [
            name,
            description || null,
            price_text || null,
            category === "seasonal" ? "seasonal" : "staple",
            req.file.buffer,
            req.file.mimetype,
            active === "false" ? false : true,
            sort_order ? parseInt(sort_order, 10) : 0,
            id,
          ]
        );
      } else {
        await pool.query(
          `UPDATE menu_items SET name=$1, description=$2, price_text=$3, category=$4,
             active=$5, sort_order=$6, updated_at=now()
           WHERE id=$7`,
          [
            name,
            description || null,
            price_text || null,
            category === "seasonal" ? "seasonal" : "staple",
            active === "false" ? false : true,
            sort_order ? parseInt(sort_order, 10) : 0,
            id,
          ]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to update menu item:", err);
      res.status(500).json({ error: "Failed to update menu item." });
    }
  });

  router.delete("/api/admin/menu-items/:id", requireAdminApi, async (req, res) => {
    try {
      await pool.query("DELETE FROM menu_items WHERE id=$1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete menu item:", err);
      res.status(500).json({ error: "Failed to delete menu item." });
    }
  });

  // ---- site content API ------------------------------------------------

  router.get("/api/admin/site-content", requireAdminApi, async (req, res) => {
    try {
      const result = await pool.query("SELECT key, value FROM site_content ORDER BY key");
      const content = {};
      result.rows.forEach((row) => { content[row.key] = row.value; });
      res.json({ content });
    } catch (err) {
      console.error("Failed to load site content:", err);
      res.status(500).json({ error: "Failed to load site content." });
    }
  });

  router.put("/api/admin/site-content", requireAdminApi, express.json(), async (req, res) => {
    const updates = req.body || {};
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ error: "No fields to update." });
    }
    try {
      for (const key of keys) {
        await pool.query(
          `INSERT INTO site_content (key, value, updated_at) VALUES ($1,$2,now())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
          [key, updates[key]]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to update site content:", err);
      res.status(500).json({ error: "Failed to update site content." });
    }
  });

  // ---- inquiries (read-only view of the existing table) -----------------

  router.get("/api/admin/inquiries", requireAdminApi, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 200"
      );
      res.json({ inquiries: result.rows });
    } catch (err) {
      console.error("Failed to load inquiries:", err);
      res.status(500).json({ error: "Failed to load inquiries." });
    }
  });

  return router;
}

module.exports = buildAdminRouter;
