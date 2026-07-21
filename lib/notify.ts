import { Resend } from "resend";
import { site } from "./site-config";

// All outbound email in one place. Previously the Vapi webhook had its own
// inline Resend call and the trial-signup route had none at all — which meant
// signups landed in the database and notified nobody.

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

/** (313) 555-0134 — E.164 is unreadable at a glance and not tappable. */
export function prettyPhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Send mail from the verified domain.
 *
 * Returns false rather than throwing: a failed notification must never take
 * down the caller (the Vapi webhook still has to save the call record even if
 * email is broken). Callers decide what to record.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping email:", opts.subject);
    return false;
  }

  // onboarding@resend.dev is Resend's sandbox sender and only delivers to the
  // account owner — fine as a fallback for our own alerts, useless for clients.
  const domain = process.env.RESEND_EMAIL_DOMAIN;
  const from = domain
    ? `${site.businessName} <notifications@${domain}>`
    : `${site.businessName} <onboarding@resend.dev>`;

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error) {
      console.error("Resend rejected:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

/**
 * A trial signup from the landing page.
 *
 * Speed-to-lead is the entire game on inbound: the business being sold here is
 * "never miss a call", so the signup form had better not sit silently in a
 * table. Phone number is in the subject so it's visible in the notification
 * preview, and replyTo is set so hitting reply goes to the prospect.
 */
export async function notifyTrialSignup(s: {
  companyName: string;
  contactName: string;
  phone: string;
  email?: string | null;
  trade?: string | null;
}) {
  const phone = prettyPhone(s.phone) ?? s.phone;

  return sendEmail({
    to: site.ownerEmail,
    replyTo: s.email || undefined,
    subject: `🔥 Trial signup — ${s.companyName} — ${phone}`,
    text: [
      "New trial signup from the landing page. Call them now.",
      "",
      `Company:  ${s.companyName}`,
      `Contact:  ${s.contactName}`,
      `Phone:    ${phone}`,
      `Email:    ${s.email || "not given"}`,
      `Trade:    ${s.trade || "not given"}`,
    ].join("\n"),
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="background:#fff4e5;color:#8a4b00;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">
    🔥 New trial signup — call them now
  </div>
  <div style="font-size:22px;font-weight:700">${escapeHtml(s.companyName)}</div>
  <div style="color:#666;margin-top:2px">${escapeHtml(s.contactName)}${s.trade ? " · " + escapeHtml(s.trade) : ""}</div>
  <a href="tel:${escapeHtml(s.phone)}" style="display:block;margin-top:14px;font-size:20px;color:#1d4ed8;text-decoration:none;font-weight:600">${escapeHtml(phone)}</a>
  ${s.email ? `<a href="mailto:${escapeHtml(s.email)}" style="display:block;margin-top:6px;color:#1d4ed8;text-decoration:none">${escapeHtml(s.email)}</a>` : ""}
  <div style="margin-top:28px;border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#888">
    From the ${escapeHtml(site.businessName)} landing page.
  </div>
</div>`.trim(),
  });
}
