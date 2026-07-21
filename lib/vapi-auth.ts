import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Shared auth for every endpoint Vapi calls. Vapi sends the `secret` from the
// phone number's / assistant's `server` config as an `x-vapi-secret` header on
// every request. scripts/onboard-client.ts sets it on each number, and
// lib/vapi-config.ts sets it on the assistant's webhook config.
//
// FAILS CLOSED. The old behavior ("allow if VAPI_WEBHOOK_SECRET is unset")
// meant a missing env var silently turned both endpoints public — forgeable
// call reports, and any client's transfer number + prompt retrievable by
// POSTing a phone-number id. If the secret is unset, nothing is served until
// it's set in BOTH the deployment env and Vapi.
export function verifyVapiSecret(req: NextRequest): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) {
    console.error(
      "VAPI_WEBHOOK_SECRET is not set — rejecting Vapi request. Set it in the " +
        "environment AND as server.secret on the Vapi number/assistant " +
        "(scripts/onboard-client.ts does this)."
    );
    return false;
  }
  const got = Buffer.from(req.headers.get("x-vapi-secret") ?? "");
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}
