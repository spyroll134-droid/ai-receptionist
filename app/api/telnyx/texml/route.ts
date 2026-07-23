import { NextRequest, NextResponse } from "next/server";
import { site } from "@/lib/site-config";
import {
  telnyxVerificationConfigured,
  verifyTelnyxSignature,
} from "@/lib/telnyx-auth";

// Telnyx TeXML webhook: every inbound call to the Telnyx number hits this
// endpoint, and we answer with instructions to bridge the call to the
// assistant's Vapi SIP address. This keeps call routing observable (this
// route's logs prove whether Telnyx processed the call) instead of relying
// on opaque SIP-trunk IP matching.

const VAPI_SIP_URI = "sip:trademarkweb-demo@sip.vapi.ai";

function xml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Authenticate a Telnyx callback that sits in the LIVE CALL PATH.
 *
 * Deliberately not symmetric with texml/recording/route.ts, which fails
 * closed. Here a rejected request is a dropped inbound call — a caller
 * standing in water hearing nothing — and this endpoint has no side effect
 * beyond returning routing XML. So: enforce whenever TELNYX_PUBLIC_KEY is
 * configured, and when it isn't, serve the call but say so loudly on every
 * request. Set the env var and this becomes fail-closed with no code change.
 *
 * Returns the raw body so the caller parses the exact bytes that were signed.
 */
async function authenticate(
  req: NextRequest,
  label: string
): Promise<{ ok: boolean; rawBody: string }> {
  const rawBody = await req.text();
  if (!telnyxVerificationConfigured()) {
    console.error(
      `[texml:${label}] TELNYX_PUBLIC_KEY is not set — serving this call ` +
        "UNAUTHENTICATED. Set it (Telnyx portal → API keys) to enforce."
    );
    return { ok: true, rawBody };
  }
  if (!verifyTelnyxSignature(req, rawBody)) {
    console.error(`[texml:${label}] rejected — bad or missing Telnyx signature`);
    return { ok: false, rawBody };
  }
  return { ok: true, rawBody };
}

function logParams(rawBody: string, label: string) {
  try {
    const params = new URLSearchParams(rawBody);
    const interesting = [
      "From", "To", "CallStatus", "DialCallStatus", "SipResponseCode",
      "HangupCause", "CallSid", "DialCallSid",
    ];
    const entries = interesting
      .map((k) => `${k}=${params.get(k) ?? "-"}`)
      .join(" ");
    console.log(`[texml:${label}] ${entries}`);
    return params;
  } catch {
    console.log(`[texml:${label}] (unparseable body)`);
    return new URLSearchParams();
  }
}

export async function POST(req: NextRequest) {
  const { ok, rawBody } = await authenticate(req, "inbound");
  if (!ok) return new NextResponse("forbidden", { status: 403 });
  logParams(rawBody, "inbound");
  return xml(`<Response>
  <Dial timeout="20" action="${site.deployedUrl}/api/telnyx/texml/dial-status" method="POST">
    <Sip>${VAPI_SIP_URI}</Sip>
  </Dial>
</Response>`);
}

export async function GET() {
  console.log("[texml:inbound-get]");
  return xml(`<Response>
  <Dial timeout="20" action="${site.deployedUrl}/api/telnyx/texml/dial-status" method="POST">
    <Sip>${VAPI_SIP_URI}</Sip>
  </Dial>
</Response>`);
}
