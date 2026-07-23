import { NextRequest, NextResponse } from "next/server";
import { escapeHtml, prettyPhone, sendEmail } from "@/lib/notify";
import { site } from "@/lib/site-config";
import { owner } from "@/lib/owner-config";
import { verifyTelnyxSignature } from "@/lib/telnyx-auth";

// <Record> action callback: fires once the fallback voicemail in
// dial-status/route.ts finishes recording. Telnyx posts the recording URL
// here and plays whatever TeXML we return to the caller.
//
// This only ever runs when the Vapi bridge failed, so it is rare by design —
// and precisely because it's rare, it must be loud. A message that lands here
// is a lead the AI never got to handle.
//
// Addressed to the owner (lib/owner-config) rather than the client's own address on
// purpose: at this point the call never reached Vapi, so there is no assistant
// or phoneNumberId to attribute it by, and TeXML's To/From alone can't be
// trusted to identify the client. Better that Jordan gets every one of these
// and forwards it than that a real emergency is routed to the wrong inbox.
// (Revisit once a second live client makes To → client mapping worth building.)

function xml(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(req: NextRequest) {
  // FAILS CLOSED, unlike the two routes in the live call path.
  //
  // This endpoint's whole job is to send an email built out of From, To and
  // RecordingUrl — all attacker-supplied if the request isn't authenticated.
  // Unverified, it is a way to put an arbitrary link in the owner's inbox,
  // from our own verified Resend domain, as many times as someone likes.
  // Rejecting here costs at most one fallback-voicemail notification (already
  // logged below); allowing an unverified one costs a phishing primitive.
  const rawBody = await req.text();
  if (!verifyTelnyxSignature(req, rawBody)) {
    console.error(
      "[texml:recording] rejected — bad or missing Telnyx signature. If this " +
        "is a genuine callback, set TELNYX_PUBLIC_KEY (Telnyx portal → API keys)."
    );
    return new NextResponse("forbidden", { status: 403 });
  }

  let recordingUrl = "";
  let duration = "0";
  let from = "";
  let to = "";
  let callSid = "-";
  try {
    const params = new URLSearchParams(rawBody);
    recordingUrl =
      params.get("RecordingUrl") ?? params.get("PublicRecordingUrl") ?? "";
    duration = params.get("RecordingDuration") ?? "0";
    from = params.get("From") ?? "";
    to = params.get("To") ?? "";
    callSid = params.get("CallSid") ?? "-";
  } catch {
    console.error("[texml:recording] unparseable body");
  }

  const seconds = Number(duration) || 0;
  console.error(
    `[texml:recording] FALLBACK VOICEMAIL — From=${from || "-"} To=${to || "-"} ` +
      `duration=${seconds}s CallSid=${callSid} url=${recordingUrl || "-"}`
  );

  // A sub-2s "recording" is the caller hanging up at the beep, not a message.
  // Their number is still worth sending — someone tried to reach the client.
  const hasMessage = seconds >= 2 && Boolean(recordingUrl);
  const caller = prettyPhone(from) ?? from ?? "unknown number";

  try {
    await sendEmail({
      to: owner.email,
      subject: hasMessage
        ? `⚠️ Voicemail (AI was down) — ${caller}`
        : `⚠️ Missed call, no message (AI was down) — ${caller}`,
      text: [
        "The call could not reach the AI assistant, so the backup voicemail answered.",
        "",
        `From:     ${caller}`,
        `Called:   ${to || "unknown"}`,
        hasMessage
          ? `Message:  ${seconds} seconds — ${recordingUrl}`
          : "Message:  none (caller hung up at the beep)",
        "",
        "Call them back, then check why the bridge failed.",
      ].join("\n"),
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="background:#fff4e5;color:#8a4b00;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">
    ⚠️ The AI didn't answer this call — backup voicemail took it
  </div>
  <a href="tel:${escapeHtml(from)}" style="font-size:22px;color:#1d4ed8;text-decoration:none;font-weight:700">${escapeHtml(caller)}</a>
  <div style="margin-top:4px;font-size:13px;color:#666">called ${escapeHtml(to || "your line")}</div>
  ${
    hasMessage
      ? `<a href="${escapeHtml(recordingUrl)}" style="display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">▶ Play the ${seconds}-second message</a>`
      : `<div style="margin-top:20px;font-size:15px;color:#333">They hung up at the beep — no message. Call them back.</div>`
  }
  <div style="margin-top:28px;border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#888">
    ${escapeHtml(site.businessName)} — this only happens when the assistant can't be reached, so it's worth looking into.
  </div>
</div>`.trim(),
    });
  } catch (err) {
    console.error("[texml:recording] owner email failed:", err);
  }

  return xml(`<Response>
  <Say voice="Polly.Joanna">Got it — someone will call you right back. Goodbye.</Say>
  <Hangup/>
</Response>`);
}
