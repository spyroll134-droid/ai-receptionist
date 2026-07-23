// Phone formatting, shared by the email templates and the dashboard.
//
// Lived in lib/notify.ts, which pulls in the Resend SDK — importing that from
// a UI component to format a number would drag an email client into the page
// bundle graph. Same function, no dependencies.

/** (313) 555-0134 — E.164 is unreadable at a glance and not tappable. */
export function prettyPhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Digits-only href for tel: links. */
export function telHref(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

/**
 * sms: href, optionally prefilled.
 *
 * `?&body=` rather than `?body=` — iOS Messages ignores a lone `?body`, and
 * Android ignores a lone `&body`. The `?&` form is the one both accept, and
 * getting it wrong means the app opens with an empty message and the operator
 * silently retypes it every time.
 */
export function smsHref(raw?: string | null, body?: string) {
  if (!raw) return null;
  const d = raw.replace(/[^\d+]/g, "");
  if (!d) return null;
  return body ? `sms:${d}?&body=${encodeURIComponent(body)}` : `sms:${d}`;
}
