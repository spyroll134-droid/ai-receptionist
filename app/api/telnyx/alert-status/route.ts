import { NextRequest, NextResponse } from "next/server";
import {
  telnyxVerificationConfigured,
  verifyTelnyxSignature,
} from "@/lib/telnyx-auth";
import { callOwnerEmergency, MAX_ALERT_ATTEMPTS } from "@/lib/telnyx-voice";

// Telnyx POSTs here when an emergency alert call ends (see the StatusCallback
// wired in lib/telnyx-voice). Its whole job: if the ring reached no human,
// redial — back to back, up to MAX_ALERT_ATTEMPTS total — so a 2am emergency
// doesn't die on a single unanswered call.
//
// Everything needed to redial rides in the query string (owner cell, caller
// name, callback number, which attempt this was), so the decision is stateless:
// no DB row tracking an in-flight alert, nothing to clean up if a callback is
// dropped or duplicated.

// Terminal call outcomes that mean a human never picked up. `completed` is
// deliberately absent — a call answered by the owner (or by their voicemail,
// which at least captures the spoken message) is a success, not a retry. We
// only redial when the phone rang out, was busy, failed, or was cancelled.
const NO_HUMAN_REACHED = new Set([
  "no-answer",
  "busy",
  "failed",
  "canceled",
  "cancelled",
]);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Same stance as the alert-texml route: verify when a key is configured, but
  // a failed/absent signature only logs — it does NOT block the redial. A
  // silenced emergency alert is worse than an unauthenticated callback, and the
  // only action this endpoint can take is to ring a number that the request
  // itself must already carry in its query string.
  if (telnyxVerificationConfigured() && !verifyTelnyxSignature(req, rawBody)) {
    console.warn(
      "[alert-status] signature check failed — proceeding anyway (delivery > strict auth)"
    );
  }

  const form = new URLSearchParams(rawBody);
  const callStatus = (form.get("CallStatus") || "").toLowerCase();

  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const name = url.searchParams.get("name");
  const num = url.searchParams.get("num");
  const from = url.searchParams.get("from");
  const attempt = Number(url.searchParams.get("attempt") || "1");
  // Per-client ring budget (1 + the client's alert_retries portal setting),
  // carried in the query string like everything else so the redial stays
  // stateless. Callbacks from before the setting existed have no `max` and
  // keep the old MAX_ALERT_ATTEMPTS behavior.
  const maxRaw = Number(url.searchParams.get("max") || "");
  const maxAttempts =
    Number.isFinite(maxRaw) && maxRaw >= 1 && maxRaw <= MAX_ALERT_ATTEMPTS
      ? maxRaw
      : MAX_ALERT_ATTEMPTS;

  if (!NO_HUMAN_REACHED.has(callStatus)) {
    // Answered, still ringing, or an intermediate event — nothing to do.
    return new NextResponse(null, { status: 204 });
  }

  if (!to || !Number.isFinite(attempt) || attempt >= maxAttempts) {
    console.warn(
      `[alert-status] gave up after attempt ${attempt} (status ${callStatus}) — no human reached`
    );
    return new NextResponse(null, { status: 204 });
  }

  console.warn(
    `[alert-status] attempt ${attempt} ended '${callStatus}' — redialing (${
      attempt + 1
    }/${maxAttempts})`
  );
  await callOwnerEmergency({
    toCell: to,
    callerName: name,
    callbackNumber: num,
    fromNumber: from,
    attempt: attempt + 1,
    maxAttempts,
  });

  return new NextResponse(null, { status: 204 });
}
