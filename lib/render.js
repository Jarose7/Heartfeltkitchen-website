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
    if (key === "RAW_MENU_STAPLES" || key === "RAW_MENU_SEASONAL") {
      // Pre-built HTML fragments (already escaped where needed) — inserted as-is.
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : "";
    }
    return Object.prototype.hasOwnProperty.call(data, key) ? escapeHtml(data[key]) : "";
  });
  return html;
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
      `SELECT id, name, description, price_text, category
       FROM menu_items WHERE active = true ORDER BY sort_order, name`
    );
    return result.rows;
  } catch (err) {
    return null; // table doesn't exist yet — caller should show the old placeholder copy
  }
}

function menuItemCardHtml(item) {
  const photo = `<div class="menu-item-photo" style="background-image:url('/menu-photo/${item.id}')"></div>`;
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

module.exports = { renderTemplate, getSiteContent, getMenuItems, menuItemCardHtml, escapeHtml };
