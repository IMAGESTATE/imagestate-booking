// Vercel serverless function: validates a booking, emails you + the client,
// and forwards the record to Google Sheets. Secrets stay server-side here.

const PACKAGE_LABELS = {
  essential: "Essential — Photos only",
  standard: "Standard — Photos + Floor Plan",
  premium: "Premium — Photos + Video + Floor Plan",
};

const ADDON_LABELS = {
  drone: "Aerial / drone photos",
  twilight: "Twilight photos",
  video: "Walkthrough video",
  floorplan: "2D floor plan",
  virtualtour: "360° virtual tour",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildSummaryRows(booking) {
  const addons = (booking.addons || [])
    .map((a) => ADDON_LABELS[a] || a)
    .join(", ") || "None";
  return [
    ["Name", booking.name],
    ["Email", booking.email],
    ["Phone", booking.phone],
    ["Property address", booking.address],
    ["Property type", booking.propertyType],
    ["Approx. size (sq ft)", booking.squareFeet || "Not provided"],
    ["Package", PACKAGE_LABELS[booking.package] || booking.package],
    ["Add-ons", addons],
    ["Preferred date", booking.preferredDate],
    ["Preferred time", booking.preferredTime || "Flexible"],
    ["Notes", booking.notes || "None"],
  ];
}

function summaryHtml(booking) {
  const rows = buildSummaryRows(booking)
    .map(
      ([label, val]) =>
        `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;">${escapeHtml(
          label
        )}</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${escapeHtml(
          val
        )}</td></tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${rows}</table>`;
}

async function sendEmail({ apiKey, from, to, replyTo, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
  return res.json();
}

async function saveToSheet(webhookUrl, booking) {
  if (!webhookUrl) return; // Sheets logging is optional
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...booking,
      addons: (booking.addons || []).join(", "),
      submittedAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Sheets webhook ${res.status}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { RESEND_API_KEY, NOTIFY_EMAIL, GOOGLE_SHEETS_WEBHOOK_URL } =
    process.env;

  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.error("Missing required environment variables");
    return res.status(500).json({ error: "Server is not configured." });
  }

  const booking = req.body || {};

  // Validate required fields at the boundary
  const required = ["name", "email", "phone", "address", "propertyType", "package", "preferredDate"];
  const missing = required.filter((f) => !booking[f] || String(booking[f]).trim() === "");
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  if (!isEmail(booking.email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const table = summaryHtml(booking);

  const clientHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
      <h2 style="color:#111827;">Thanks for your booking request, ${escapeHtml(
        booking.name
      )}!</h2>
      <p style="color:#374151;line-height:1.6;">We've received your request and will confirm your appointment shortly. Here's a summary of what you booked:</p>
      ${table}
      <p style="color:#374151;line-height:1.6;margin-top:24px;">If anything looks off, just reply to this email and we'll sort it out.</p>
      <p style="color:#6b7280;font-size:13px;margin-top:32px;">— The IMAGESTATE Team</p>
    </div>`;

  const ownerHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;margin:0 auto;">
      <h2 style="color:#111827;">New booking request</h2>
      <p style="color:#374151;">A new booking just came in via the website form:</p>
      ${table}
    </div>`;

  try {
    // Notify yourself — reply-to set to the client so you can respond directly
    await sendEmail({
      apiKey: RESEND_API_KEY,
      from: 'IMAGESTATE Bookings <cesar@imagestate.homes>',
      to: NOTIFY_EMAIL,
      replyTo: booking.email,
      subject: `New booking: ${booking.name} — ${booking.address}`,
      html: ownerHtml,
    });

    // Confirm to the client
    await sendEmail({
      apiKey: RESEND_API_KEY,
      from: 'IMAGESTATE <cesar@imagestate.homes>',
      to: booking.email,
      replyTo: NOTIFY_EMAIL,
      subject: "Your IMAGESTATE booking request",
      html: clientHtml,
    });
  } catch (err) {
    console.error("Email send failed:", err.message);
    return res.status(502).json({ error: "Could not send confirmation emails." });
  }

  // Sheets logging must not block a successful booking — log error, keep going
  try {
    await saveToSheet(GOOGLE_SHEETS_WEBHOOK_URL, booking);
  } catch (err) {
    console.error("Sheet logging failed:", err.message);
  }

  return res.status(200).json({ ok: true });
}
