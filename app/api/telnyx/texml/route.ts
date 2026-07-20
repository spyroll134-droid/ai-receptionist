import { NextRequest, NextResponse } from "next/server";
import { site } from "@/lib/site-config";

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

async function logParams(req: NextRequest, label: string) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
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
  await logParams(req, "inbound");
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
