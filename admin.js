// admin.js — Heartfelt Kitchen & Co. admin panel routes.
//
// Login checks two places, in order:
//   1. The admin_users table (multi-user support, added when Jack asked
//      for a second login — see schema-admin-users.sql). Each row is a
//      username + a bcrypt password hash.
//   2. The original single-account env vars (ADMIN_USERNAME,
//      ADMIN_PASSWORD_HASH), kept as a fallback so whoever was already
//      logging in before multi-user support existed keeps working
//      without needing a new row created for them.
// If admin_users doesn't exist yet (schema-admin-users.sql hasn't been
// run), the table lookup fails safely and login falls through to #2 — so
// deploying this code is safe before or after that SQL file gets run.
//
// All schema changes this file depends on live in schema-admin.sql and
// schema-admin-users.sql, which Jack runs manually against the live
// database. Nothing here creates or alters tables automatically.

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { HOMEPAGE_PHOTO_SLOTS, getHomepagePhotoOverrides, homepagePhotoUrl } = require("./lib/render");

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

// Turns a "YYYY-MM" month string into a [start, end] date range (as
// "YYYY-MM-DD" strings) padded a week on either side — enough to cover
// every cell a 6-row calendar grid could ever show for that month,
// including leading/trailing days that belong to the previous/next month.
// Falls back to the current month if the input is missing or malformed,
// so a bad query param can't produce an error or an empty-looking calendar.
function monthRangeWithPadding(monthStr) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr || "");
  const now = new Date();
  const year = match ? parseInt(match[1], 10) : now.getFullYear();
  const month = match ? parseInt(match[2], 10) - 1 : now.getMonth(); // JS months are 0-indexed

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0));
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(lastOfMonth);
  end.setUTCDate(end.getUTCDate() + 7);

  const toISODate = (d) => d.toISOString().slice(0, 10);
  return { start: toISODate(start), end: toISODate(end) };
}

async function checkAdminCredentials(pool, username, password) {
  if (!username || !password) return false;

  // 1. admin_users table.
  try {
    const result = await pool.query(
      "SELECT password_hash FROM admin_users WHERE username = $1",
      [username]
    );
    if (result.rows[0]) {
      return await bcrypt.compare(password, result.rows[0].password_hash);
    }
  } catch (lookupErr) {
    // Most likely admin_users doesn't exist yet (schema-admin-users.sql
    // not run yet) — that's fine, fall through to the legacy check below.
    console.warn("[admin] admin_users lookup failed, falling back to legacy env var login:", lookupErr.message);
  }

  // 2. Legacy single-account env vars.
  const legacyUser = process.env.ADMIN_USERNAME;
  const legacyHash = process.env.ADMIN_PASSWORD_HASH;
  if (legacyUser && legacyHash && username === legacyUser) {
    return await bcrypt.compare(password, legacyHash);
  }

  return false;
}

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

  // Same pattern as /menu-photo/:id above — public, unauthenticated, ahead
  // of the session middleware, so it keeps working even if sessions ever
  // break. Serves a homepage photo override (see schema-homepage-photos.sql
  // and HOMEPAGE_PHOTO_SLOTS in lib/render.js); slots with no override use
  // the original hardcoded image directly and never hit this route.
  router.get("/homepage-photo/:slug", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT photo, photo_mime FROM homepage_photos WHERE slug=$1 AND photo IS NOT NULL",
        [req.params.slug]
      );
      if (result.rows.length === 0) return res.status(404).end();
      const { photo, photo_mime } = result.rows[0];
      res.set("Content-Type", photo_mime || "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(photo);
    } catch (err) {
      console.error("Failed to load homepage photo:", err);
      res.status(500).end();
    }
  });

  // Same pattern again, for class calendar photos (see schema-classes.sql).
  // Two separate routes since presets and events are two separate tables —
  // an event's photo is its own copy (possibly inherited from a preset at
  // creation time, possibly a custom upload), while a preset's photo is
  // only ever seen in the admin panel's preset picker.
  router.get("/class-photo/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT photo, photo_mime FROM class_events WHERE id=$1 AND photo IS NOT NULL",
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).end();
      const { photo, photo_mime } = result.rows[0];
      res.set("Content-Type", photo_mime || "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(photo);
    } catch (err) {
      console.error("Failed to load class event photo:", err);
      res.status(500).end();
    }
  });

  router.get("/class-preset-photo/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT photo, photo_mime FROM class_presets WHERE id=$1 AND photo IS NOT NULL",
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).end();
      const { photo, photo_mime } = result.rows[0];
      res.set("Content-Type", photo_mime || "image/jpeg");
      res.set("Cache-Control", "public, max-age=3600");
      res.send(photo);
    } catch (err) {
      console.error("Failed to load class preset photo:", err);
      res.status(500).end();
    }
  });

  // Public, unauthenticated: powers the real calendar on /classes. Returns
  // only active events, and only the fields a visitor should see (no
  // internal flags). `month` is a "YYYY-MM" string for the month currently
  // shown; the range is padded a week on each side so the calendar grid's
  // leading/trailing days (from the previous/next month, shown grayed out)
  // can show their events too without a second request.
  router.get("/api/class-events", async (req, res) => {
    try {
      const { start, end } = monthRangeWithPadding(req.query.month);
      const result = await pool.query(
        `SELECT id, category, title, description, price_text, to_char(event_date, 'YYYY-MM-DD') AS event_date, start_time, end_time, updated_at,
                (photo IS NOT NULL) AS has_photo
         FROM class_events
         WHERE active = true AND event_date BETWEEN $1 AND $2
         ORDER BY event_date, start_time NULLS LAST, title`,
        [start, end]
      );
      res.json({ events: result.rows });
    } catch (err) {
      console.error("Failed to load public class events:", err);
      res.status(500).json({ error: "Failed to load classes." });
    }
  });

  // Sessions live ONLY on admin/API-admin routes from here down, scoped to
  // this router — not mounted globally on the app. That way, if anything
  // ever goes wrong with the session store, only admin routes are
  // affected; the public site (home, menu, about, etc.) never touches
  // sessions at all and keeps working regardless. This is the fix for the
  // 2026-09-01 incident where logging in broke the entire public site.
  const sessionStore = new pgSession({
    pool,
    createTableIfMissing: false,
    errorLog: (...args) => {
      console.error("[connect-pg-simple]", ...args);
    },
  });

  router.use(
    session({
      store: sessionStore,
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
    try {
      const ok = await checkAdminCredentials(pool, username, password);
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
          ["seasonal", "shippable"].includes(category) ? category : "staple",
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
            ["seasonal", "shippable"].includes(category) ? category : "staple",
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
            ["seasonal", "shippable"].includes(category) ? category : "staple",
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

  // Moves an item up or down within its own category (staple/seasonal),
  // renumbering sort_order for the whole category so the move always
  // takes effect even if every item currently shares the same sort_order.
  router.post("/api/admin/menu-items/:id/move", requireAdminApi, express.json(), async (req, res) => {
    const { id } = req.params;
    const { direction } = req.body || {};
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ error: "direction must be 'up' or 'down'." });
    }
    try {
      const itemResult = await pool.query("SELECT category FROM menu_items WHERE id=$1", [id]);
      if (itemResult.rows.length === 0) {
        return res.status(404).json({ error: "Item not found." });
      }
      const { category } = itemResult.rows[0];

      const listResult = await pool.query(
        "SELECT id FROM menu_items WHERE category=$1 ORDER BY sort_order, name, id",
        [category]
      );
      const ids = listResult.rows.map((row) => row.id);
      const index = ids.findIndex((rowId) => String(rowId) === String(id));
      if (index === -1) {
        return res.status(404).json({ error: "Item not found." });
      }

      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= ids.length) {
        // Already at the top/bottom of its category — nothing to do.
        return res.json({ success: true });
      }
      [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];

      for (let i = 0; i < ids.length; i++) {
        await pool.query("UPDATE menu_items SET sort_order=$1 WHERE id=$2", [(i + 1) * 10, ids[i]]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to reorder menu item:", err);
      res.status(500).json({ error: "Failed to reorder menu item." });
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

  // ---- homepage photos API ----------------------------------------------
  // A fixed list of named slots (see HOMEPAGE_PHOTO_SLOTS) rather than a
  // free-form list like menu items — each slot either has a database
  // override or falls back to its original hardcoded photo.

  router.get("/api/admin/homepage-photos", requireAdminApi, async (req, res) => {
    try {
      const overrides = await getHomepagePhotoOverrides(pool);
      const slots = HOMEPAGE_PHOTO_SLOTS.map((slot) => {
        const overrideAt = overrides[slot.slug];
        return {
          slug: slot.slug,
          label: slot.label,
          aspect: slot.aspect,
          hasOverride: Boolean(overrideAt),
          photoUrl: overrideAt ? homepagePhotoUrl(slot.slug, overrideAt) : slot.fallback,
        };
      });
      res.json({ slots });
    } catch (err) {
      console.error("Failed to load homepage photo status:", err);
      res.status(500).json({ error: "Failed to load homepage photos." });
    }
  });

  router.put("/api/admin/homepage-photos/:slug", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { slug } = req.params;
    if (!HOMEPAGE_PHOTO_SLOTS.some((slot) => slot.slug === slug)) {
      return res.status(404).json({ error: "Unknown homepage photo slot." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "A photo is required." });
    }
    try {
      await pool.query(
        `INSERT INTO homepage_photos (slug, photo, photo_mime, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (slug) DO UPDATE SET photo=EXCLUDED.photo, photo_mime=EXCLUDED.photo_mime, updated_at=now()`,
        [slug, req.file.buffer, req.file.mimetype]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to save homepage photo:", err);
      res.status(500).json({ error: "Failed to save homepage photo." });
    }
  });

  // Clears a slot's override so it goes back to showing its original,
  // hardcoded photo (or, for the one slot that never had one, back to the
  // "photo pending" placeholder).
  router.delete("/api/admin/homepage-photos/:slug", requireAdminApi, async (req, res) => {
    try {
      await pool.query("DELETE FROM homepage_photos WHERE slug=$1", [req.params.slug]);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to revert homepage photo:", err);
      res.status(500).json({ error: "Failed to revert homepage photo." });
    }
  });

  // ---- class presets API -------------------------------------------------
  // Reusable "class types" (see schema-classes.sql) so scheduling another
  // date for a class Becca already runs doesn't mean retyping its title,
  // description, price, and photo every time.

  router.get("/api/admin/class-presets", requireAdminApi, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, category, title, description, price_text, sort_order,
                (photo IS NOT NULL) AS has_photo, updated_at
         FROM class_presets ORDER BY sort_order, title`
      );
      res.json({ presets: result.rows });
    } catch (err) {
      console.error("Failed to list class presets:", err);
      res.status(500).json({ error: "Failed to load class presets." });
    }
  });

  router.post("/api/admin/class-presets", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { category, title, description, price_text, sort_order } = req.body;
    if (!category || !title) {
      return res.status(400).json({ error: "Category and title are required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO class_presets (category, title, description, price_text, photo, photo_mime, sort_order, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         RETURNING id`,
        [
          category,
          title,
          description || null,
          price_text || null,
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null,
          sort_order ? parseInt(sort_order, 10) : 0,
        ]
      );
      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(400).json({ error: "A preset with that title already exists." });
      }
      console.error("Failed to create class preset:", err);
      res.status(500).json({ error: "Failed to save class preset." });
    }
  });

  router.put("/api/admin/class-presets/:id", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { id } = req.params;
    const { category, title, description, price_text, sort_order } = req.body;
    if (!category || !title) {
      return res.status(400).json({ error: "Category and title are required." });
    }
    try {
      if (req.file) {
        await pool.query(
          `UPDATE class_presets SET category=$1, title=$2, description=$3, price_text=$4,
             photo=$5, photo_mime=$6, sort_order=$7, updated_at=now()
           WHERE id=$8`,
          [category, title, description || null, price_text || null, req.file.buffer, req.file.mimetype, sort_order ? parseInt(sort_order, 10) : 0, id]
        );
      } else {
        await pool.query(
          `UPDATE class_presets SET category=$1, title=$2, description=$3, price_text=$4,
             sort_order=$5, updated_at=now()
           WHERE id=$6`,
          [category, title, description || null, price_text || null, sort_order ? parseInt(sort_order, 10) : 0, id]
        );
      }
      res.json({ success: true });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(400).json({ error: "A preset with that title already exists." });
      }
      console.error("Failed to update class preset:", err);
      res.status(500).json({ error: "Failed to update class preset." });
    }
  });

  // Deleting a preset never deletes events created from it — preset_id on
  // those rows just goes to NULL (see the ON DELETE SET NULL in
  // schema-classes.sql) since each event already carries its own copy of
  // everything. Already-scheduled classes keep showing on the calendar
  // exactly as they did before.
  router.delete("/api/admin/class-presets/:id", requireAdminApi, async (req, res) => {
    try {
      await pool.query("DELETE FROM class_presets WHERE id=$1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete class preset:", err);
      res.status(500).json({ error: "Failed to delete class preset." });
    }
  });

  // ---- class calendar events API -----------------------------------------
  // Unlike the public /api/class-events above, this returns EVERY event in
  // range regardless of `active`, so the admin calendar can show (and let
  // Becca re-enable) a hidden event instead of it just disappearing.

  router.get("/api/admin/class-events", requireAdminApi, async (req, res) => {
    try {
      const { start, end } = monthRangeWithPadding(req.query.month);
      const result = await pool.query(
        `SELECT id, preset_id, category, title, description, price_text, to_char(event_date, 'YYYY-MM-DD') AS event_date, start_time, end_time,
                active, (photo IS NOT NULL) AS has_photo, updated_at
         FROM class_events
         WHERE event_date BETWEEN $1 AND $2
         ORDER BY event_date, start_time NULLS LAST, title`,
        [start, end]
      );
      res.json({ events: result.rows });
    } catch (err) {
      console.error("Failed to list class events:", err);
      res.status(500).json({ error: "Failed to load class events." });
    }
  });

  router.post("/api/admin/class-events", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { preset_id, category, title, description, price_text, event_date, start_time, end_time, active } = req.body;
    if (!category || !title || !event_date) {
      return res.status(400).json({ error: "Category, title, and date are required." });
    }
    try {
      const result = await pool.query(
        `INSERT INTO class_events
           (preset_id, category, title, description, price_text, photo, photo_mime, event_date, start_time, end_time, active, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         RETURNING id`,
        [
          preset_id || null,
          category,
          title,
          description || null,
          price_text || null,
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null,
          event_date,
          start_time || null,
          end_time || null,
          active === "false" ? false : true,
        ]
      );
      res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error("Failed to create class event:", err);
      res.status(500).json({ error: "Failed to save class event." });
    }
  });

  router.put("/api/admin/class-events/:id", requireAdminApi, upload.single("photo"), async (req, res) => {
    const { id } = req.params;
    const { preset_id, category, title, description, price_text, event_date, start_time, end_time, active } = req.body;
    if (!category || !title || !event_date) {
      return res.status(400).json({ error: "Category, title, and date are required." });
    }
    try {
      if (req.file) {
        await pool.query(
          `UPDATE class_events SET preset_id=$1, category=$2, title=$3, description=$4, price_text=$5,
             photo=$6, photo_mime=$7, event_date=$8, start_time=$9, end_time=$10, active=$11, updated_at=now()
           WHERE id=$12`,
          [
            preset_id || null, category, title, description || null, price_text || null,
            req.file.buffer, req.file.mimetype, event_date, start_time || null, end_time || null,
            active === "false" ? false : true, id,
          ]
        );
      } else {
        await pool.query(
          `UPDATE class_events SET preset_id=$1, category=$2, title=$3, description=$4, price_text=$5,
             event_date=$6, start_time=$7, end_time=$8, active=$9, updated_at=now()
           WHERE id=$10`,
          [
            preset_id || null, category, title, description || null, price_text || null,
            event_date, start_time || null, end_time || null, active === "false" ? false : true, id,
          ]
        );
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to update class event:", err);
      res.status(500).json({ error: "Failed to update class event." });
    }
  });

  router.delete("/api/admin/class-events/:id", requireAdminApi, async (req, res) => {
    try {
      await pool.query("DELETE FROM class_events WHERE id=$1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete class event:", err);
      res.status(500).json({ error: "Failed to delete class event." });
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

  router.delete("/api/admin/inquiries/:id", requireAdminApi, async (req, res) => {
    try {
      await pool.query("DELETE FROM inquiries WHERE id=$1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete inquiry:", err);
      res.status(500).json({ error: "Failed to delete inquiry." });
    }
  });

  return router;
}

module.exports = buildAdminRouter;
