import { NextRequest, NextResponse } from "next/server";

// Dial action callback: Telnyx reports here after the <Dial> attempt
// completes or fails. DialCallStatus + SipResponseCode tell us exactly why
// a bridge to Vapi failed. Whatever TeXML we return executes next for the
// still-connected caller.

export async function POST(req: NextRequest) {
  let status = "-";
  let sipCode = "-";
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);
    status = params.get("DialCallStatus") ?? "-";
    sipCode = params.get("SipResponseCode") ?? "-";
    console.log(
      `[texml:dial-status] DialCallStatus=${status} SipResponseCode=${sipCode} ` +
        `HangupCause=${params.get("HangupCause") ?? "-"} From=${params.get("From") ?? "-"}`
    );
  } catch {
    console.log("[texml:dial-status] (unparseable body)");
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We could not connect you to the assistant. Status ${status}, code ${sipCode}. Please try again shortly.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
