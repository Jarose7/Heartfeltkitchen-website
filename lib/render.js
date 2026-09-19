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

module.exports = { renderTemplate, getSiteContent, getMenuItems, menuItemCardHtml, escapeHtml, textBlockToHtml, photoUrl };
