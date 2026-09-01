// lib/flodesk.js — pushes new website inquiries into Becca's existing
// Flodesk account so she can see/notify on them there, alongside the
// admin-panel inquiries list this site already has.
//
// Design, per the 2026-08-31 planning call + Flodesk's own API docs
// (https://developers.flodesk.com/): Flodesk's own embedded FORM builder
// caps out at 6 plain-text fields, which can't hold the full inquiry
// (event date, guest count, budget, notes, etc.). So instead of routing
// the form itself through Flodesk, our own form (already built) keeps
// collecting the full inquiry, and this file uses Flodesk's REST API to
// create/update the inquirer as a subscriber there — tagged into a
// "Website Inquiries" segment, with the key inquiry details as custom
// fields — right after we save the inquiry to our own database.
//
// This is entirely optional and fails silently: if FLODESK_API_KEY isn't
// set, or any Flodesk call errors, it's logged and swallowed. It must
// never block or fail an inquiry submission — the site's own database
// (see /api/inquiries in server.js) is always the source of truth.
//
// One-time setup Becca/Jack still need to do in Flodesk itself: build a
// workflow that triggers on "subscriber added to segment: Website
// Inquiries" (or the subscriber.created webhook) and sends Becca a
// notification email. This file only gets the subscriber INTO Flodesk
// with that segment tag — it doesn't (and can't, via this API) make
// Flodesk email her; that's configured inside Flodesk's own workflow
// builder, on her account.

const FLODESK_BASE = "https://api.flodesk.com/v1";
const SEGMENT_NAME = "Website Inquiries";

// Custom fields we push, keyed by the label we create/look up in Flodesk.
// Values are extracted from the inquiry payload the site already collects
// (see the /api/inquiries handler in server.js).
const CUSTOM_FIELD_LABELS = [
  "Inquiry Type",
  "Event Date",
  "Guest Count",
  "Budget Estimate",
  "Inquiry Notes",
];

// In-memory caches so we're not re-listing/re-creating the segment and
// custom fields on every single inquiry — populated on first use per
// server process. Fine to lose on restart; everything here is idempotent
// (look-up-or-create) so it just re-populates itself.
let cachedSegmentId = null;
let cachedFieldKeys = null; // { "Inquiry Type": "inquiry_type", ... }

function authHeader() {
  const key = process.env.FLODESK_API_KEY;
  const encoded = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${encoded}`;
}

async function flodeskRequest(path, options = {}) {
  const res = await fetch(`${FLODESK_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Heartfelt Kitchen & Co. website (heartfeltkitchen.co)",
      Authorization: authHeader(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Flodesk ${options.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  // Some endpoints (e.g. add-to-segment) return 204 with no body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureSegmentId() {
  if (cachedSegmentId) return cachedSegmentId;

  const list = await flodeskRequest(`/segments?per_page=100`);
  const existing = (list.data || []).find((s) => s.name === SEGMENT_NAME);
  if (existing) {
    cachedSegmentId = existing.id;
    return cachedSegmentId;
  }

  const created = await flodeskRequest(`/segments`, {
    method: "POST",
    body: JSON.stringify({ name: SEGMENT_NAME }),
  });
  cachedSegmentId = created.id;
  return cachedSegmentId;
}

async function ensureFieldKeys() {
  if (cachedFieldKeys) return cachedFieldKeys;

  const all = await flodeskRequest(`/custom-fields/all`);
  const byLabel = {};
  (all || []).forEach((f) => {
    byLabel[f.label] = f.key;
  });

  const keys = {};
  for (const label of CUSTOM_FIELD_LABELS) {
    if (byLabel[label]) {
      keys[label] = byLabel[label];
      continue;
    }
    const created = await flodeskRequest(`/custom-fields`, {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    keys[label] = created.key;
  }
  cachedFieldKeys = keys;
  return cachedFieldKeys;
}

/**
 * Push a newly-submitted inquiry into Flodesk as a subscriber, tagged into
 * the "Website Inquiries" segment. Never throws — logs and returns on any
 * failure, since this must never affect the actual inquiry submission.
 *
 * @param {object} inquiry - same shape as the row saved to the inquiries
 *   table (inquiry_type, name, email, event_date, guest_count,
 *   budget_estimate, notes, etc.)
 */
async function sendInquiryToFlodesk(inquiry) {
  if (!process.env.FLODESK_API_KEY) return; // integration not configured yet
  if (!inquiry || !inquiry.email) return;

  try {
    const [segmentId, fieldKeys] = await Promise.all([ensureSegmentId(), ensureFieldKeys()]);

    const customFields = {};
    const maybeSet = (label, value) => {
      if (value !== undefined && value !== null && value !== "") {
        customFields[fieldKeys[label]] = String(value);
      }
    };
    maybeSet("Inquiry Type", inquiry.inquiry_type);
    maybeSet("Event Date", inquiry.event_date);
    maybeSet("Guest Count", inquiry.guest_count);
    maybeSet("Budget Estimate", inquiry.budget_estimate);
    maybeSet("Inquiry Notes", inquiry.notes);

    await flodeskRequest(`/subscribers`, {
      method: "POST",
      body: JSON.stringify({
        email: inquiry.email,
        first_name: inquiry.name || undefined,
        custom_fields: customFields,
        segment_ids: [segmentId],
      }),
    });
  } catch (err) {
    console.error("[flodesk] Failed to sync inquiry (non-fatal, inquiry is still saved in our DB):", err.message);
  }
}

module.exports = { sendInquiryToFlodesk };
