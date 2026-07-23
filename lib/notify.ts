import { Resend } from "resend";
import { site } from "./site-config";
import { owner } from "./owner-config";

// All outbound email in one place. Previously the Vapi webhook had its own
// inline Resend call and the trial-signup route had none at all — which meant
// signups landed in the database and notified nobody.

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

// Moved to lib/phone.ts so the dashboard can format numbers without importing
// the Resend SDK. Imported (not just re-exported) because the templates below
// call it directly; re-exported because the webhook imports it from here.
import { prettyPhone } from "./phone";
export { prettyPhone };

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
    to: owner.email,
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

/**
 * Confirmation to the PROSPECT who filled in the trial form.
 *
 * Previously they submitted, saw a success message, and heard nothing until
 * Jordan happened to call — a silent gap on the exact promise the product is
 * sold on. Worse, this business's whole pitch is "you get an email the moment
 * a lead comes in", so the signup confirmation is the first live proof of it.
 * It has to arrive instantly and look right.
 *
 * It also hands them the demo number, so the wait for a callback is spent
 * talking to the product instead of cooling off.
 */
export async function confirmTrialSignup(s: {
  contactName: string;
  companyName: string;
  toEmail: string;
}) {
  const first = s.contactName.trim().split(/\s+/)[0] || "there";

  return sendEmail({
    to: s.toEmail,
    replyTo: owner.email,
    subject: `Got it — setting up ${s.companyName}`,
    text: [
      `${first} — got your request. I'll call you within one business day to get set up.`,
      "",
      "Setup takes about twenty minutes and it's all on my end. Your number",
      "doesn't change and nothing on your trucks or website changes.",
      "",
      `While you wait, call the line yourself: ${site.demoPhoneDisplay}`,
      "Act like a customer for your issue — that's exactly what your callers hear.",
      "",
      "— Jordan",
      site.businessName,
    ].join("\n"),
    html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="font-size:20px;font-weight:700">${escapeHtml(first)} — got your request.</div>
  <p style="margin-top:12px;font-size:15px;line-height:1.6;color:#333">
    I'll call you within one business day to get ${escapeHtml(s.companyName)} set up.
    It takes about twenty minutes and it's all on my end — your number doesn't
    change, and nothing on your trucks or website changes.
  </p>
  <div style="margin-top:24px;border:1px solid #e5e7eb;border-radius:12px;padding:18px;text-align:center">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666">Try it before we talk</div>
    <a href="${escapeHtml(site.demoPhoneHref)}" style="display:block;margin-top:8px;font-size:22px;font-weight:700;color:#1d4ed8;text-decoration:none">${escapeHtml(site.demoPhoneDisplay)}</a>
    <div style="margin-top:8px;font-size:13px;color:#666">
      Act like a customer for your issue — that's what your callers hear.
    </div>
  </div>
  <p style="margin-top:24px;font-size:15px;color:#333">— Jordan<br>
    <span style="color:#888;font-size:13px">${escapeHtml(site.businessName)}</span>
  </p>
</div>`.trim(),
  });
}
