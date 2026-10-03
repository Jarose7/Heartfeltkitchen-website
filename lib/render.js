// lib/render.js — tiny template renderer for the public site.
// Reads an HTML file and replaces {{TOKEN}} placeholders with values from
// a data object. No new templating dependency needed for this small a job.

const fs = require("fs");

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTemplate(filePath, data) {
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key.startsWith("RAW_")) {
      // Pre-built HTML fragments (already escaped where needed) — inserted as-is.
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : "";
    }
    return Object.prototype.hasOwnProperty.call(data, key) ? escapeHtml(data[key]) : "";
  });
  return html;
}

// Turns plain text typed into an admin textarea into safe HTML, so editors
// never need to write HTML themselves:
//   - blank-line-separated chunks each become their own <p>
//   - a chunk where every line starts with "- " becomes a bullet list
//   - **text** becomes bold (a plain-text convention, not real HTML)
// Text is escaped BEFORE any of this runs, so nothing typed into the
// textarea can inject markup other than the ** bold convention above.
function textBlockToHtml(text, fallback) {
  const raw = (text === null || text === undefined || text === "") ? fallback : text;
  if (!raw) return "";
  const escaped = escapeHtml(raw).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const blocks = escaped.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
    if (isList) {
      return "<ul>" + lines.map((l) => `<li>${l.slice(2)}</li>`).join("") + "</ul>";
    }
    return `<p>${lines.join("<br>")}</p>`;
  }).join("\n");
}

// Fetch all site_content rows as a flat { key: value } object, with
// fallbacks so the site still renders sensibly even before the admin
// panel's schema/seed data has been applied.
async function getSiteContent(pool) {
  const fallback = {
    hours_fri: "Fri 2–7pm",
    hours_sat: "Sat 10am–7pm",
    hours_sun: "Sun 2–7pm",
    phone: "602-341-4511",
    email: "heartfeltkitchen@gmail.com",
    address: "261 South Ave., Canton, PA 17724",
    instagram_url: "https://instagram.com/heartfeltkitchen.co",
  };
  try {
    const result = await pool.query("SELECT key, value FROM site_content");
    const content = { ...fallback };
    result.rows.forEach((row) => { content[row.key] = row.value; });
    return content;
  } catch (err) {
    // Table may not exist yet (schema-admin.sql not run) — fall back
    // quietly so the public site keeps working either way.
    return fallback;
  }
}

async function getMenuItems(pool) {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price_text, category, updated_at
       FROM menu_items WHERE active = true ORDER BY sort_order, name`
    );
    return result.rows;
  } catch (err) {
    return null; // table doesn't exist yet — caller should show the old placeholder copy
  }
}

// The photo route is cached for an hour (see admin.js) since photos rarely
// change — but the URL is just /menu-photo/:id, so swapping a photo in the
// admin panel would otherwise keep showing the old cached one until the
// cache expires. Appending the row's updated_at as a ?v= query string
// makes the URL change whenever the photo does, so the browser fetches
// the new one immediately instead of serving a stale copy.
function photoUrl(item) {
  const v = item.updated_at ? new Date(item.updated_at).getTime() : "";
  return `/menu-photo/${item.id}${v ? `?v=${v}` : ""}`;
}

function menuItemCardHtml(item) {
  const photo = `<div class="menu-item-photo" style="background-image:url('${photoUrl(item)}')"></div>`;
  return `
    <div class="menu-item-card">
      ${photo}
      <div class="menu-item-body">
        <h3>${escapeHtml(item.name)}</h3>
        ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ""}
        <p class="price">${escapeHtml(item.price_text || "")}</p>
      </div>
    </div>`;
}

// ---- homepage photos -----------------------------------------------------
// A fixed set of named photo slots on the home page (category cards,
// pricing tiers, garden photos) that used to be hardcoded file paths in
// index.html's <style> block — changing any of them meant a code commit
// and a push. Each slot can now be overridden with a photo stored in the
// homepage_photos table (same BYTEA-in-Postgres approach as menu photos);
// until it is, the original hardcoded image keeps showing exactly as
// before, via `fallback`. The `selector` is the existing CSS selector
// each photo was already targeted by, so swapping the lookup doesn't
// change anything about the page's layout or styling.
const HOMEPAGE_PHOTO_SLOTS = [
  { slug: "cat-custom-cakes", page: "/", label: "Category card — Custom Cakes", aspect: 3 / 4, selector: ".cat-grid .cat-card:nth-child(1) .cat-photo", fallback: "/images/custom-cakes-castle.jpg" },
  { slug: "cat-cupcakes", page: "/", label: "Category card — Cupcakes", aspect: 3 / 4, selector: ".cat-grid .cat-card:nth-child(2) .cat-photo", fallback: "/images/cupcakes-card.jpg" },
  { slug: "cat-cookies", page: "/", label: "Category card — Cookies", aspect: 3 / 4, selector: ".cat-grid .cat-card:nth-child(3) .cat-photo", fallback: "/images/cookies-card.jpg" },
  { slug: "cat-classes", page: "/", label: "Category card — Classes", aspect: 3 / 4, selector: ".cat-grid .cat-card:nth-child(4) .cat-photo", fallback: "/images/classes-card.jpg" },
  { slug: "cat-catering", page: "/", label: "Category card — Catering", aspect: 3 / 4, selector: ".cat-grid .cat-card:nth-child(5) .cat-photo", fallback: "/images/catering-card.jpg" },
  { slug: "tier-everyday", page: "/", label: "Pricing tier — Cupcakes & Cookies", aspect: 5 / 4, selector: ".tier-grid .tier-card:nth-child(1) .tier-photo", fallback: "/images/cupcakes-cookies-tier.jpg" },
  { slug: "tier-custom-cakes", page: "/", label: "Pricing tier — Custom Cakes", aspect: 5 / 4, selector: ".tier-grid .tier-card:nth-child(2) .tier-photo", fallback: "/images/custom-cakes-tier.jpg" },
  { slug: "tier-weddings", page: "/", label: "Pricing tier — Weddings & Events", aspect: 5 / 4, selector: ".tier-grid .tier-card:nth-child(3) .tier-photo", fallback: null },
  { slug: "growing-1", page: "/", label: "Garden photo 1", aspect: 3 / 4, selector: ".growing-photo:nth-child(1)", fallback: "/images/garden-carrots.jpg" },
  { slug: "growing-2", page: "/", label: "Garden photo 2", aspect: 3 / 4, selector: ".growing-photo:nth-child(2)", fallback: "/images/garden-flower.jpg" },
  // About page's hero portrait — the exact photo that originally motivated
  // building the crop tool (it kept cutting off Becca's head with a plain
  // center-crop) but was never actually wired up to use it. No fixed
  // aspect-ratio in CSS here (the box is a flexible grid column at a fixed
  // 520px height), so this uses a representative ~1:1 crop target — cover
  // still fills whatever the real rendered box turns out to be.
  { slug: "about-portrait", page: "/about", label: "About page — Becca's portrait", aspect: 1, selector: ".about-hero-photo", fallback: "/images/becca-portrait.jpg", position: "center top" },
];

function homepagePhotoUrl(slug, updatedAt) {
  const v = updatedAt ? new Date(updatedAt).getTime() : "";
  return `/homepage-photo/${slug}${v ? `?v=${v}` : ""}`;
}

// Which slots currently have a photo stored in the database, keyed by
// slug -> updated_at. Empty object (not an error) if the table doesn't
// exist yet, same fallback-quietly pattern as getSiteContent/getMenuItems.
async function getHomepagePhotoOverrides(pool) {
  try {
    const result = await pool.query("SELECT slug, updated_at FROM homepage_photos WHERE photo IS NOT NULL");
    const map = {};
    result.rows.forEach((row) => { map[row.slug] = row.updated_at; });
    return map;
  } catch (err) {
    return {};
  }
}

async function getHomepagePhotosCss(pool, page) {
  const overrides = await getHomepagePhotoOverrides(pool);
  return HOMEPAGE_PHOTO_SLOTS.filter((slot) => slot.page === page).map((slot) => {
    const overrideAt = overrides[slot.slug];
    const url = overrideAt ? homepagePhotoUrl(slot.slug, overrideAt) : slot.fallback;
    if (!url) return ""; // no override yet and no original photo for this slot either
    return `${slot.selector}{background-image:url('${url}');background-size:cover;background-position:${slot.position || "center"};}`;
  }).filter(Boolean).join("\n  ");
}

module.exports = {
  renderTemplate, getSiteContent, getMenuItems, menuItemCardHtml, escapeHtml, textBlockToHtml, photoUrl,
  HOMEPAGE_PHOTO_SLOTS, homepagePhotoUrl, getHomepagePhotoOverrides, getHomepagePhotosCss,
};
