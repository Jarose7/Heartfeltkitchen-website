// lib/email.js — sends a notification email whenever someone submits the
// inquiry form, so Becca (and Jack) actually hear about it instead of it
// just sitting in the database until someone checks the admin panel.
//
// Uses Gmail SMTP via Nodemailer with an App Password — no new
// third-party service, no signup, no cost. Fine for this site's actual
// volume (a handful of inquiries a week, well under Gmail's own sending
// limits); Gmail SMTP isn't recommended for high-volume production
// mail, but that's not what this is.
//
// Fully optional and fails silently, same pattern as lib/flodesk.js:
// no-ops if GMAIL_USER/GMAIL_APP_PASSWORD aren't set, and any send error
// is caught and logged, never blocking or failing the actual inquiry
// submission (the database row is always the source of truth regardless
// of whether this email goes out).

const nodemailer = require("nodemailer");

// Who gets notified on every new inquiry. Plain constants, not secrets —
// edit this list directly if that ever needs to change.
const NOTIFY_RECIPIENTS = ["jackroseblue@gmail.com", "heartfeltkitchen@gmail.com"];

// Field key -> friendly label, in the order they should appear in the
// email. Matches exactly what the contact/inquiry form on the site
// collects (see public/contact.html and the /api/inquiries handler in
// server.js) — nothing here is invented beyond what the form asks for.
const FIELD_LABELS = [
  ["inquiry_type", "Inquiry Type"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["event_date", "Event / Need-by Date"],
  ["event_location", "Event Location"],
  ["guest_count", "Guest Count"],
  ["products_requested", "What They're Looking For"],
  ["budget_estimate", "Estimated Budget"],
  ["delivery_or_pickup", "Delivery or Pickup"],
  ["notes", "Additional Notes"],
];

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

function buildEmailBody(inquiry) {
  const rows = FIELD_LABELS
    .filter(([key]) => inquiry[key] !== undefined && inquiry[key] !== null && inquiry[key] !== "")
    .map(([key, label]) => ({ label, value: String(inquiry[key]) }));

  const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n")
    + (inquiry.id ? `\n\nInquiry #${inquiry.id}, submitted ${inquiry.created_at || ""}` : "");

  const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#3A2618;">
      <h2 style="font-family:sans-serif;">New Inquiry — Heartfelt Kitchen &amp; Co.</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        ${rows.map((r) => `
          <tr>
            <td style="font-weight:bold;vertical-align:top;padding-right:12px;white-space:nowrap;">${escapeHtml(r.label)}</td>
            <td style="vertical-align:top;">${escapeHtml(r.value).replace(/\n/g, "<br>")}</td>
          </tr>
        `).join("")}
      </table>
      ${inquiry.id ? `<p style="color:#8a7862;font-size:12.5px;margin-top:16px;">Inquiry #${inquiry.id}, submitted ${inquiry.created_at || ""}. View it any time in the <a href="https://heartfeltkitchen.co/admin">admin panel</a>.</p>` : ""}
    </div>
  `;

  return { text, html };
}

/**
 * Email jackroseblue@gmail.com and heartfeltkitchen@gmail.com with the
 * full details of a newly-submitted inquiry. Never throws — logs and
 * returns on any failure, since this must never affect the actual
 * inquiry submission.
 *
 * @param {object} inquiry - same shape as the row saved to the inquiries
 *   table (inquiry_type, name, email, phone, event_date, ... plus id and
 *   created_at from the INSERT ... RETURNING).
 */
async function sendInquiryNotification(inquiry) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("[email] GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping inquiry notification email.");
    return;
  }
  if (!inquiry) return;

  console.log(`[email] Sending inquiry notification to ${NOTIFY_RECIPIENTS.join(", ")}...`);

  try {
    const { text, html } = buildEmailBody(inquiry);
    const info = await getTransporter().sendMail({
      from: `"Heartfelt Kitchen & Co. Website" <${process.env.GMAIL_USER}>`,
      to: NOTIFY_RECIPIENTS.join(", "),
      subject: `New Inquiry: ${inquiry.inquiry_type || "General"} — ${inquiry.name || "Unknown"}`,
      text,
      html,
    });
    console.log(`[email] Sent OK — message id ${info.messageId}.`);
  } catch (err) {
    console.error("[email] Failed to send inquiry notification (non-fatal, inquiry is still saved in our DB):", err.message);
  }
}

console.log(
  "[email] Integration",
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? "configured (GMAIL_USER and GMAIL_APP_PASSWORD are set)."
    : "NOT configured (GMAIL_USER/GMAIL_APP_PASSWORD unset — inquiries will only save to the database, no email will be sent)."
);

module.exports = { sendInquiryNotification };
