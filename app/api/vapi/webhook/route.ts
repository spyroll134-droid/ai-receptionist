import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseServerClient } from "@/lib/supabase";
import { site } from "@/lib/site-config";

// Vapi posts every call-lifecycle event to this single URL, distinguished
// by message.type. We only act on end-of-call-report for v1 — that's the
// point a call is finished and has a transcript + extracted structured
// data available.

function verifySecret(req: NextRequest) {
  const expected = process.env.VAPI_WEBHOOK_SECRET;
  if (!expected) return true; // not configured yet — allow during initial setup
  return req.headers.get("x-vapi-secret") === expected;
}

function didTransferToOwner(message: Record<string, unknown>): boolean {
  const artifact = message.artifact as { messages?: unknown[] } | undefined;
  const msgs = artifact?.messages ?? [];
  return JSON.stringify(msgs).includes('"transferCall"');
}

async function notifyOwner(call: {
  callerName?: string;
  callbackNumber?: string;
  serviceAddress?: string;
  emergency?: boolean;
  summary?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — skipping owner notification");
    return false;
  }
  const resend = new Resend(apiKey);
  const subject = call.emergency
    ? `EMERGENCY call caught — ${call.callerName ?? "unknown caller"}`
    : `New call caught — ${call.callerName ?? "unknown caller"}`;

  await resend.emails.send({
    from: `${site.businessName} <onboarding@resend.dev>`,
    to: [site.contactEmail],
    subject,
    text: [
      call.emergency ? "EMERGENCY — warm-transferred live." : "Non-emergency call.",
      `Caller: ${call.callerName ?? "unknown"}`,
      `Callback: ${call.callbackNumber ?? "unknown"}`,
      `Address: ${call.serviceAddress ?? "unknown"}`,
      "",
      call.summary ?? "",
    ].join("\n"),
  });
  return true;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { message?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const message = body.message;
  if (!message) {
    return NextResponse.json({ ok: true }); // nothing to do
  }

  if (message.type !== "end-of-call-report") {
    // Other event types (status-update, transcript partials, etc.) — not
    // acted on in v1, just acknowledge.
    return NextResponse.json({ ok: true });
  }

  const call = message.call as { id?: string } | undefined;
  const structuredData =
    (message.analysis as { structuredData?: Record<string, unknown> } | undefined)
      ?.structuredData ?? {};
  const summary = (message.analysis as { summary?: string } | undefined)?.summary;
  const transcript = message.transcript as string | undefined;
  const recordingUrl = (message.artifact as { recordingUrl?: string } | undefined)
    ?.recordingUrl;

  const callerName = structuredData.callerName as string | undefined;
  const callbackNumber = structuredData.callbackNumber as string | undefined;
  const serviceAddress = structuredData.serviceAddress as string | undefined;
  const emergency = Boolean(structuredData.emergency);
  const transferred = didTransferToOwner(message);

  if (!call?.id) {
    console.error("end-of-call-report with no call id", message);
    return NextResponse.json({ error: "missing call id" }, { status: 400 });
  }

  let notified = false;
  try {
    notified = await notifyOwner({
      callerName,
      callbackNumber,
      serviceAddress,
      emergency,
      summary,
    });
  } catch (err) {
    console.error("Owner notification failed:", err);
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("calls").upsert(
      {
        vapi_call_id: call.id,
        trade: "Restoration",
        caller_name: callerName,
        callback_number: callbackNumber,
        emergency,
        standing_water: structuredData.standingWater as boolean | undefined,
        category: structuredData.category as string | undefined,
        loss_date: structuredData.lossDate as string | undefined,
        insurance_carrier: structuredData.insuranceCarrier as string | undefined,
        service_address: serviceAddress,
        arrival_window: structuredData.arrivalWindow as string | undefined,
        transferred_to_owner: transferred,
        transcript,
        summary,
        recording_url: recordingUrl,
        owner_notified_at: notified ? new Date().toISOString() : null,
        owner_notify_method: notified ? "email" : null,
      },
      { onConflict: "vapi_call_id" }
    );
    if (error) {
      console.error("Supabase upsert failed:", error.message);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
  } catch (err) {
    console.error("Webhook DB error:", err);
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
