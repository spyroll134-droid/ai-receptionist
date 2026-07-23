import { NextRequest, NextResponse } from "next/server";
import { site } from "@/lib/site-config";
import {
  telnyxVerificationConfigured,
  verifyTelnyxSignature,
} from "@/lib/telnyx-auth";

// Dial action callback: Telnyx reports here once the <Dial> to Vapi finishes,
// whether it connected or never got off the ground. Whatever TeXML we return
// executes next for the caller, who is still on the line.
//
// This is the bottom of the stack. The caller has already been forwarded off
// the client's own line, so their carrier voicemail is no longer reachable —
// if the bridge failed and we hang up here, the lead is simply lost. So on
// failure we take the message ourselves.
//
// Deliberately NOT dialing the client's real number as a fallback: they
// didn't answer a moment ago, so their conditional forwarding would catch it
// again and send it right back here. Recording locally cannot loop, and the
// message lands in their email instead of a carrier mailbox they have to
// remember to dial into.

function xml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// Telnyx sends this callback for successful calls too. A caller who just
// finished talking to the assistant must not be handed a voicemail beep.
const CONNECTED = new Set(["completed", "answered"]);

export async function POST(req: NextRequest) {
  // Live call path — same staged posture as texml/route.ts, and for the same
  // reason: the caller is still on the line, so a rejection here strands them.
  // Enforced once TELNYX_PUBLIC_KEY is set; loud and permissive until then.
  // (texml/recording/route.ts fails closed — it sends mail, nobody's waiting.)
  const rawBody = await req.text();
  if (telnyxVerificationConfigured()) {
    if (!verifyTelnyxSignature(req, rawBody)) {
      console.error("[texml:dial-status] rejected — bad or missing signature");
      return new NextResponse("forbidden", { status: 403 });
    }
  } else {
    console.error(
      "[texml:dial-status] TELNYX_PUBLIC_KEY is not set — handling this " +
        "callback UNAUTHENTICATED. Set it to enforce."
    );
  }

  let status = "";
  let sipCode = "-";
  let hangupCause = "-";
  let from = "-";
  try {
    const params = new URLSearchParams(rawBody);
    status = params.get("DialCallStatus") ?? "";
    sipCode = params.get("SipResponseCode") ?? "-";
    hangupCause = params.get("HangupCause") ?? "-";
    from = params.get("From") ?? "-";
  } catch {
    console.error("[texml:dial-status] unparseable body");
  }

  if (CONNECTED.has(status)) {
    console.log(`[texml:dial-status] connected — DialCallStatus=${status} From=${from}`);
    return xml(`<Response>\n  <Hangup/>\n</Response>`);
  }

  console.error(
    `[texml:dial-status] BRIDGE FAILED — falling back to voicemail. ` +
      `DialCallStatus=${status || "-"} SipResponseCode=${sipCode} ` +
      `HangupCause=${hangupCause} From=${from}`
  );

  // The caller hears an apology and a prompt, never a status code. Diagnostics
  // belong in the logs above, not read aloud to somebody standing in an inch
  // of water.
  return xml(`<Response>
  <Say voice="Polly.Joanna">Sorry — our answering system is briefly unavailable. Please leave your name, number, and address after the tone, and someone will call you right back.</Say>
  <Record maxLength="120" playBeep="true" trim="trim-silence" action="${site.deployedUrl}/api/telnyx/texml/recording" method="POST"/>
  <Say voice="Polly.Joanna">We didn't get a message. Please try calling again.</Say>
  <Hangup/>
</Response>`);
}
