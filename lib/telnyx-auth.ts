import { createPublicKey, verify as edVerify } from "node:crypto";
import type { NextRequest } from "next/server";

// Shared auth for every endpoint Telnyx calls, mirroring lib/vapi-auth.ts.
//
// Telnyx signs each webhook with Ed25519 and sends two headers:
//   telnyx-signature-ed25519  base64 signature
//   telnyx-timestamp          unix seconds, and part of the signed payload
// The signed payload is `${timestamp}|${rawBody}` — so the body must be read
// as text ONCE and handed to this function verbatim. Re-serializing a parsed
// body changes the bytes and the signature will never match.
//
// ENVELOPE VERIFIED 2026-07-22 against Telnyx's own docs — header names, the
// pipe-separated `${timestamp}|${payload}` string, and the base64 signature
// encoding all confirmed by:
//   https://support.telnyx.com/en/articles/4334722-how-to-leverage-webhooks
// This was previously written from memory and flagged as such. It happened to
// be right, but it was checked, not assumed. TeXML callbacks arrive as
// application/x-www-form-urlencoded rather than JSON; the signature is over
// the raw body bytes either way, which is why this takes `rawBody` as text.
//
// The public key is on the Telnyx Mission Control portal under
// Account Settings → Keys & Credentials → Public Key.
//
// NOT verified, because the docs don't state it: that the portal renders that
// key as base64-encoded raw 32 bytes. Node won't import raw bytes — it wants
// SPKI DER — so the 12-byte Ed25519 SPKI header is prepended below. If the
// portal ever hands out a PEM or a hex string instead, this decode produces
// garbage. publicKey() therefore fails loudly and returns null rather than
// throwing on every inbound callback: a malformed key degrades to the same
// "not configured" path the routes already handle, instead of 500-ing a live
// call. Watch for the [telnyx-auth] error below the first time you set it.

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Replay window. Telnyx retries for a while; 5 minutes is their guidance. */
const MAX_SKEW_SECONDS = 300;

let cachedKey: ReturnType<typeof createPublicKey> | null = null;
let cachedFrom = "";

function publicKey() {
  const raw = process.env.TELNYX_PUBLIC_KEY;
  if (!raw) return null;
  if (cachedKey && cachedFrom === raw) return cachedKey;

  try {
    const decoded = Buffer.from(raw, "base64");
    // Ed25519 public keys are exactly 32 bytes. Buffer.from(_, "base64") is
    // famously permissive — it silently drops anything it can't decode rather
    // than throwing — so a PEM block or a hex string pasted in here would
    // otherwise sail through and produce a key that rejects every real
    // webhook. Checking the length turns "all your calls stopped" into one
    // legible startup error.
    if (decoded.length !== 32) {
      console.error(
        `[telnyx-auth] TELNYX_PUBLIC_KEY decoded to ${decoded.length} bytes, expected 32. ` +
          "Paste the raw base64 Public Key from Mission Control → Keys & Credentials, " +
          "not a PEM block. Verification is DISABLED until this is fixed."
      );
      return null;
    }
    const der = Buffer.concat([SPKI_ED25519_PREFIX, decoded]);
    cachedKey = createPublicKey({ key: der, format: "der", type: "spki" });
    cachedFrom = raw;
    return cachedKey;
  } catch (err) {
    console.error("[telnyx-auth] TELNYX_PUBLIC_KEY could not be imported:", err);
    return null;
  }
}

/**
 * True when a USABLE key is configured and verification can be enforced.
 *
 * Deliberately `publicKey()` and not `Boolean(process.env.TELNYX_PUBLIC_KEY)`.
 * The routes in the live call path use this to decide whether to enforce, so
 * keying it off the variable merely being *set* would mean a malformed key
 * flipped them into enforcing mode with a verifier that can never succeed —
 * every inbound call rejected, from a typo. A key that won't import is treated
 * as no key at all: log loudly, keep answering the phone.
 */
export function telnyxVerificationConfigured(): boolean {
  return publicKey() !== null;
}

/**
 * Verify a Telnyx webhook signature over the raw request body.
 *
 * Returns false for a missing key, missing headers, a stale timestamp, or a
 * bad signature — callers decide what a false means for their route, because
 * the cost of rejecting differs: dropping a live inbound call is worse than
 * dropping a notification email.
 */
export function verifyTelnyxSignature(req: NextRequest, rawBody: string): boolean {
  const key = publicKey();
  if (!key) return false;

  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) {
    console.error("[telnyx-auth] timestamp outside the replay window");
    return false;
  }

  try {
    return edVerify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`),
      key,
      Buffer.from(signature, "base64")
    );
  } catch (err) {
    console.error("[telnyx-auth] verification threw:", err);
    return false;
  }
}
