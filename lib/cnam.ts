import { normalizePhone } from "./vapi-config";

// Caller-name (CNAM) lookup via Telnyx.
//
// Every US number has a caller-name record in a carrier database. Business
// lines — a doctor's office, a supplier, a school — usually carry a real name
// ("BEAUMONT HOSP"). It's the cheapest way to tell a contractor WHO called
// without making them recognize a number.
//
// Two things this is NOT:
//
// 1. It is not run before the call. assistant-request has a hard,
//    non-configurable 7.5s budget, and adding an external HTTP call to the
//    hottest path in the system means a Telnyx slowdown becomes a dropped
//    call. This runs in the end-of-call webhook, where a failure costs
//    nothing and there's no caller waiting.
//
// 2. It never routes a call by itself. US mobile CNAM coverage is poor and
//    the records go stale, so this is shown to the owner as context and used
//    to SUGGEST the voicemail toggle — never to demote a caller
//    automatically. A stale database entry must not be able to silently send
//    a real customer to voicemail.

export type CnamResult = { name: string | null; lineType: string | null };

const EMPTY: CnamResult = { name: null, lineType: null };

// CNAM commonly returns filler instead of a name, especially for cells.
// Storing "WIRELESS CALLER" as if it were an identity is worse than storing
// nothing — it looks like real information in the portal.
const JUNK = new Set([
  "WIRELESS CALLER",
  "UNAVAILABLE",
  "NOT AVAILABLE",
  "UNKNOWN",
  "TOLL FREE",
  "TOLLFREE",
  "CELLULAR CALLER",
  "NO NAME",
  "ANONYMOUS",
  "RESTRICTED",
  "PRIVATE",
  "V CALLER",
]);

/**
 * Look up the caller name for a number. Always resolves — never throws and
 * never rejects, so a webhook can await it without a try/catch and a Telnyx
 * outage can't stop a call from being saved.
 */
export async function lookupCnam(raw?: string | null): Promise<CnamResult> {
  const key = process.env.TELNYX_API_KEY;
  const ten = normalizePhone(raw);
  if (!key || !ten) return EMPTY;

  try {
    const res = await fetch(
      `https://api.telnyx.com/v2/number_lookup/+1${ten}?type=caller-name`,
      {
        headers: { Authorization: `Bearer ${key}` },
        // Bounded: this runs while an owner is waiting on a lead email.
        signal: AbortSignal.timeout(2500),
      }
    );
    if (!res.ok) {
      console.warn(`[cnam] lookup failed ${res.status} for +1${ten}`);
      return EMPTY;
    }

    const j = (await res.json()) as {
      data?: {
        caller_name?: { caller_name?: string };
        carrier?: { type?: string };
      };
    };

    const rawName = j.data?.caller_name?.caller_name?.trim() ?? "";
    const upper = rawName.toUpperCase();
    const name = rawName && !JUNK.has(upper) ? rawName : null;

    return { name, lineType: j.data?.carrier?.type ?? null };
  } catch (err) {
    // Timeout, DNS, malformed JSON — all the same here: no name, move on.
    console.warn("[cnam] lookup error:", String(err));
    return EMPTY;
  }
}
