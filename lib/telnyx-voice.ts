import "server-only";
import { site } from "./site-config";

// Outbound emergency voice alert to the business owner — the loud channel that
// backs up the email in lib/notify.
//
// Why voice and not SMS: the Telnyx account has no messaging profile (checked —
// messaging_profile_id is null on the only number), which means no A2P 10DLC
// registration, which means texts to US mobiles are carrier-filtered and
// unreliable. A voice call needs no registration at all. And for the call this
// exists to cover — a 2am emergency the owner has NOT already handled live — a
// phone that RINGS beats a text that buzzes unseen on a nightstand.
//
// It reuses the existing TeXML application (the same connection that bridges
// inbound calls to Vapi) to place an outbound call. Telnyx fetches the spoken
// script from /api/telnyx/alert-texml the moment the owner answers.

const TELNYX_CALLS_URL = "https://api.telnyx.com/v2/texml/calls";

// Neither of these is a secret: the app id is an opaque identifier that does
// nothing without the API key, and the From number is the public demo line.
// Env-overridable so a second Telnyx account or number is a config change, not
// a code change — but they default to the live values so no env wiring is
// needed for the current single-number setup.
const ALERT_APP_ID = process.env.TELNYX_ALERT_APP_ID || "3008493782703277112";
const ALERT_FROM = process.env.TELNYX_ALERT_FROM || "+19182234411";

// A single ring is best-effort: if the owner doesn't answer and has no
// voicemail, it dies silently (the email is the durable backstop). For a 2am
// emergency that isn't good enough, so a no-answer redials — back to back, up
// to MAX_ALERT_ATTEMPTS total — until a human picks up. The retry is driven by
// Telnyx's StatusCallback firing our /api/telnyx/alert-status route when a call
// ends unanswered; see that route for the redial decision.
export const MAX_ALERT_ATTEMPTS = 3;
// Seconds to ring before Telnyx gives up and reports no-answer. Long enough for
// a sleeping owner to reach the phone, short enough that three attempts don't
// drag on — ~3×20s of ringing across the whole sequence.
const ALERT_RING_TIMEOUT_SECONDS = 20;

/**
 * Ring the owner with a spoken emergency alert. Returns true if Telnyx accepted
 * the call for delivery (not that the owner answered — that's a later webhook
 * we don't yet consume).
 *
 * Never throws — mirrors sendEmail. A failed alert must not take down the Vapi
 * webhook, which still has to save the call record. Returns false when the API
 * key or the destination cell is missing, or Telnyx rejects the request.
 */
export async function callOwnerEmergency(opts: {
  toCell?: string | null;
  callerName?: string | null;
  callbackNumber?: string | null;
  /** 1 for the first ring; the status-callback route bumps it on each redial. */
  attempt?: number;
  /**
   * Caller ID the ring shows up as — the client's own AI line
   * (clients.assigned_number), so the owner sees their business number, not
   * The Backup Line's shared one. Must be a number this Telnyx account owns;
   * if Telnyx rejects it the call is retried once from ALERT_FROM, because a
   * wrong caller ID is annoying and a silenced 2am alert is a disaster.
   */
  fromNumber?: string | null;
  /**
   * Total rings before giving up — 1 + the client's alert_retries setting.
   * Defaults to MAX_ALERT_ATTEMPTS for callers with no per-client config.
   */
  maxAttempts?: number;
}): Promise<boolean> {
  const apiKey = process.env.TELNYX_API_KEY;
  const to = opts.toCell?.trim();
  const attempt = opts.attempt ?? 1;
  const maxAttempts = opts.maxAttempts ?? MAX_ALERT_ATTEMPTS;
  const from = opts.fromNumber?.trim() || ALERT_FROM;
  if (!apiKey) {
    console.warn(
      "[telnyx-voice] TELNYX_API_KEY not set — skipping emergency voice alert"
    );
    return false;
  }
  if (!to) {
    console.warn(
      "[telnyx-voice] no owner cell on file — skipping emergency voice alert"
    );
    return false;
  }

  // The spoken script lives at /api/telnyx/alert-texml; the caller name and
  // callback number ride along as query params, which Telnyx echoes back when
  // it fetches the TeXML on answer. Kept in the URL rather than a DB token
  // because the payload is trivial and the route has no other state to load.
  const name = opts.callerName?.trim();
  const num = opts.callbackNumber?.trim();

  const params = new URLSearchParams();
  if (name) params.set("name", name);
  if (num) params.set("num", num);
  const texmlUrl = `${site.deployedUrl}/api/telnyx/alert-texml?${params.toString()}`;

  // Telnyx POSTs this URL when the call ends. It carries everything needed to
  // redial (who, the spoken payload, and which attempt this was) so the retry
  // decision is stateless — no DB row to track an in-flight alert.
  const statusParams = new URLSearchParams();
  statusParams.set("to", to);
  if (name) statusParams.set("name", name);
  if (num) statusParams.set("num", num);
  statusParams.set("attempt", String(attempt));
  statusParams.set("max", String(maxAttempts));
  if (from !== ALERT_FROM) statusParams.set("from", from);
  const statusUrl = `${site.deployedUrl}/api/telnyx/alert-status?${statusParams.toString()}`;

  async function placeCall(fromNumber: string): Promise<Response> {
    return fetch(`${TELNYX_CALLS_URL}/${ALERT_APP_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        To: to,
        From: fromNumber,
        Url: texmlUrl,
        Timeout: ALERT_RING_TIMEOUT_SECONDS,
        StatusCallback: statusUrl,
        StatusCallbackMethod: "POST",
      }),
    });
  }

  try {
    let res = await placeCall(from);
    if (!res.ok && from !== ALERT_FROM) {
      // A client's assigned_number the Telnyx account doesn't own gets the
      // whole call rejected. Degrade to the default caller ID rather than
      // letting a config mistake silence the alert.
      const detail = await res.text().catch(() => "");
      console.error(
        `[telnyx-voice] call from ${from} rejected (${res.status}): ${detail.slice(0, 300)} — retrying from ${ALERT_FROM}`
      );
      res = await placeCall(ALERT_FROM);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[telnyx-voice] call rejected (${res.status}, attempt ${attempt}/${maxAttempts}): ${detail.slice(0, 300)}`
      );
      return false;
    }
    console.log(
      `[telnyx-voice] emergency ring placed (attempt ${attempt}/${maxAttempts})`
    );
    return true;
  } catch (err) {
    console.error("[telnyx-voice] call failed:", err);
    return false;
  }
}
