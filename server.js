// server.js — Heartfelt Kitchen & Co. website backend
// This is a starter/skeleton app whose only job right now is to prove the
// deploy pipeline works end to end: GitHub -> Render -> Postgres -> custom
// domain. Real pages (home, menu, about, etc.) get built out from here.

require("dotenv").config();
const express = require("express");
const path = require("path");
const pool = require("./db");
const buildAdminRouter = require("./admin");
const { renderTemplate, getSiteContent, getMenuItems, menuItemCardHtml, textBlockToHtml } = require("./lib/render");
const { sendInquiryToFlodesk } = require("./lib/flodesk");
const { sendInquiryNotification } = require("./lib/email");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin panel routes (login, dashboard, /api/admin/*, /menu-photo/:id).
// Sessions are scoped inside this router (see admin.js) rather than
// mounted globally, so a session-store issue can never take down the
// public site pages below — only admin routes depend on sessions.
app.use(buildAdminRouter(pool));

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

// Dynamic public pages: these read live hours/contact/address (and, for
// /menu, the actual menu items) from the database and inject them into
// the static HTML templates. Falls back to sensible defaults if the
// admin schema hasn't been applied yet, so the site never breaks.
const dynamicPages = {
  "/": "index.html",
  "/about": "about.html",
  "/contact": "contact.html",
  "/events": "events.html",
  "/catering": "catering.html",
  "/classes": "classes.html",
  "/policies": "policies.html",
};

// Fallback copy for the About and Policies paragraphs that are now
// editable from Site Content — this is exactly what each page already
// said, so nothing changes visually until Jack actually edits a field.
const ABOUT_FALLBACKS = {
  about_hero_text: "Heartfelt Kitchen & Co. is a working bakery kitchen inside a historic home in Canton, Pennsylvania, run by Becca Horton.",
  about_story_p1: "Becca has been baking for about 12 years, entirely self-taught. She started Heartfelt Kitchen & Co. in 2021 around five things: custom cakes, cupcakes, cookies, classes, and catering; the 5 C's.",
  about_story_p2: "She also teaches culinary programs at the college level, and that experience carries straight into the kitchen. It's part of why there's a full class schedule running alongside the wedding cakes and catering orders.",
  about_story_p3: "Selling baked goods was never really the point. Becca built Heartfelt Kitchen to be a place where people gather, celebrate, learn, and create around food.",
  about_philosophy_text: "Every cake, cookie box, and hands-on class comes from the same idea: food is better shared. Whether it's a wedding cake, a Saturday baking class, or a full catering spread, the goal is the same — bring people into the kitchen, not just send them home with a box.",
};
const POLICY_FALLBACKS = {
  policy_deposit_text: "This policy applies to custom cakes, wedding cakes, and event orders booked directly with Becca.\n\n- A 50% deposit is required to book and confirm your order.\n- The remaining balance is due at pickup or delivery.\n- Your deposit is **non-refundable**, regardless of when you cancel — it covers ingredient costs secured for your order as soon as it's booked.",
  policy_allergen_text: "Our products are made in a kitchen that also handles wheat, dairy, eggs, tree nuts, peanuts, and soy. While we take care in preparing every order, we cannot guarantee that any item is completely free of allergens due to shared equipment and the possibility of cross-contact.\n\nIf you have a food allergy or dietary restriction, please let us know before ordering so we can talk through what will and won't work for you.",
};

// Builds the extra {{RAW_...}} fragments a given route's template needs,
// on top of the plain site_content fields every page already gets.
function buildPageExtras(route, content) {
  if (route === "/about") {
    return {
      RAW_ABOUT_HERO: textBlockToHtml(content.about_hero_text, ABOUT_FALLBACKS.about_hero_text),
      RAW_ABOUT_STORY_P1: textBlockToHtml(content.about_story_p1, ABOUT_FALLBACKS.about_story_p1),
      RAW_ABOUT_STORY_P2: textBlockToHtml(content.about_story_p2, ABOUT_FALLBACKS.about_story_p2),
      RAW_ABOUT_STORY_P3: textBlockToHtml(content.about_story_p3, ABOUT_FALLBACKS.about_story_p3),
      RAW_ABOUT_PHILOSOPHY: textBlockToHtml(content.about_philosophy_text, ABOUT_FALLBACKS.about_philosophy_text),
    };
  }
  if (route === "/policies") {
    return {
      RAW_POLICY_DEPOSIT: textBlockToHtml(content.policy_deposit_text, POLICY_FALLBACKS.policy_deposit_text),
      RAW_POLICY_ALLERGEN: textBlockToHtml(content.policy_allergen_text, POLICY_FALLBACKS.policy_allergen_text),
    };
  }
  return {};
}

Object.entries(dynamicPages).forEach(([route, file]) => {
  app.get(route, async (req, res, next) => {
    try {
      const content = await getSiteContent(pool);
      const html = renderTemplate(path.join(PUBLIC_DIR, file), { ...content, ...buildPageExtras(route, content) });
      res.send(html);
    } catch (err) {
      next(); // fall through to static file serving as a last resort
    }
  });
});

app.get("/menu", async (req, res, next) => {
  try {
    const content = await getSiteContent(pool);
    const items = await getMenuItems(pool);

    let staples, seasonal;
    if (items === null) {
      // Admin schema not applied yet — keep the site working with a
      // friendly placeholder instead of an empty page.
      const placeholder = '<p style="color:#8a7862;font-size:14px;grid-column:1/-1;">Menu items coming soon — <a href="/contact" style="text-decoration:underline;">submit an inquiry</a> in the meantime.</p>';
      staples = placeholder;
      seasonal = placeholder;
    } else {
      const staplesItems = items.filter((i) => i.category === "staple");
      const seasonalItems = items.filter((i) => i.category === "seasonal");
      staples = staplesItems.length
        ? staplesItems.map(menuItemCardHtml).join("")
        : '<p style="color:#8a7862;font-size:14px;grid-column:1/-1;">Staples are being added — check back soon.</p>';
      seasonal = seasonalItems.length
        ? seasonalItems.map(menuItemCardHtml).join("")
        : '<p style="color:#8a7862;font-size:14px;grid-column:1/-1;">No seasonal specials posted yet — check back soon.</p>';
    }

    const html = renderTemplate(path.join(PUBLIC_DIR, "menu.html"), {
      ...content,
      RAW_MENU_STAPLES: staples,
      RAW_MENU_SEASONAL: seasonal,
    });
    res.send(html);
  } catch (err) {
    console.error("Failed to render menu page:", err);
    next();
  }
});

// Serve static files (CSS/images/etc.) from the "public" folder, resolving
// any remaining extensionless routes to their .html file as a fallback.
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

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

    // Fire-and-forget: also push this inquiry into Flodesk (if configured)
    // so Becca can see/act on it there. Intentionally not awaited — this
    // must never slow down or affect the response above, which is already
    // sent. Any failure here is logged inside sendInquiryToFlodesk and
    // never surfaces to the visitor; the database row above is always the
    // source of truth regardless of whether this succeeds.
    sendInquiryToFlodesk({
      inquiry_type,
      name,
      email,
      event_date,
      guest_count,
      budget_estimate,
      notes,
    });

    // Also fire-and-forget an email notification with the full inquiry —
    // every field the visitor filled out, not just a subset — to both
    // Jack and Becca. Same non-blocking, never-fails-the-request pattern
    // as the Flodesk call above.
    sendInquiryNotification({
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
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
    });
  } catch (err) {
    console.error("Failed to save inquiry:", err);
    res.status(500).json({ error: "Something went wrong saving your inquiry. Please try again." });
  }
});

// Catch-all error handler — last resort so an unexpected error anywhere
// (including inside session/auth middleware) logs clearly on the server
// and shows a plain but non-broken message, instead of a bare crash page.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).send("Something went wrong on our end. Please try again in a moment.");
});

app.listen(PORT, () => {
  console.log(`Heartfelt Kitchen & Co. server running on port ${PORT}`);
});
