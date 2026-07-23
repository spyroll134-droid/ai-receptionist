import { NextRequest, NextResponse } from "next/server";
import { site } from "@/lib/site-config";
import {
  telnyxVerificationConfigured,
  verifyTelnyxSignature,
} from "@/lib/telnyx-auth";

// Spoken script for the outbound emergency alert placed by lib/telnyx-voice.
// Telnyx fetches this the instant the owner answers and reads the <Say> lines
// aloud. The caller name and callback number arrive as query params (see
// callOwnerEmergency) — this route holds no state and touches no database.

function escapeXml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[
        c
      ]!
  );
}

// Read a phone number aloud digit-by-digit ("2 4 8 …") so the TTS voice doesn't
// pronounce it as one enormous cardinal number. Non-digits are dropped and a
// leading US country code is stripped so the owner hears the ten-digit number
// they actually dial. Empty input -> null.
function spokenDigits(num: string | null): string | null {
  const digits = (num ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const local =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.split("").join(" ");
}

function xml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function script(req: NextRequest): string {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() || "an unknown caller";
  const digits = spokenDigits(url.searchParams.get("num"));

  // This message often plays partly INTO a voicemail greeting before the beep,
  // so whatever's said first may never get recorded. Two defences: a lead pause
  // so a live answerer has a beat to focus (and a little of the greeting burns
  // off), and heavy repetition — the customer's name and callback number are
  // each said several times, spread through the message, so at least one pass
  // lands in the recorded portion no matter where the beep falls. Every line is
  // self-contained: heard alone, it still tells the owner who to call and why.
  const lines = [
    `Urgent. This is an emergency alert from ${site.businessName}.`,
    `${name} just called your line with an emergency and is waiting for a call back right now.`,
    digits
      ? `Call the customer back now at, ${digits}.`
      : `No callback number was captured — open your portal right now for the caller's details.`,
    digits
      ? `Again, ${name} has an emergency. Their callback number is ${digits}.`
      : `Open your portal now to reach ${name}.`,
    digits
      ? `To repeat one more time: call ${name} back at ${digits}. That number again, ${digits}. The full details are in your portal. Goodbye.`
      : `The full details are waiting in your portal. Goodbye.`,
  ];

  // A one-second pause between lines so each number lands clearly and the owner
  // has a beat to grab a pen; a leading pause so the opening isn't swallowed by
  // the first moment of a voicemail pickup.
  const say = lines
    .map((l) => `  <Say>${escapeXml(l)}</Say>`)
    .join('\n  <Pause length="1"/>\n');

  return `<Response>\n  <Pause length="1"/>\n${say}\n</Response>`;
}

// This route sits in a live-call path (a ringing emergency alert), so it takes
// the same stance as the inbound bridge: verify the Telnyx signature when the
// key is configured, but never 403 a call for a *missing* key — a silenced
// alert is worse than an unauthenticated one, and the route leaks nothing (the
// name/number are echoed from our own request, not read from the database).
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (telnyxVerificationConfigured() && !verifyTelnyxSignature(req, rawBody)) {
    console.error("[texml:alert] rejected — bad or missing Telnyx signature");
    return new NextResponse("forbidden", { status: 403 });
  }
  return xml(script(req));
}

export async function GET(req: NextRequest) {
  return xml(script(req));
}
