import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { escapeHtml, prettyPhone, sendEmail } from "@/lib/notify";
import { verifyVapiSecret } from "@/lib/vapi-auth";
import { site } from "@/lib/site-config";

// Vapi posts every call-lifecycle event to this single URL, distinguished
// by message.type. We only act on end-of-call-report for v1 — that's the
// point a call is finished and has a transcript + extracted structured
// data available.

// The assistant invoked the transferCall tool — the transfer was *attempted*.
function didAttemptTransfer(message: Record<string, unknown>): boolean {
  const artifact = message.artifact as { messages?: unknown[] } | undefined;
  const msgs = artifact?.messages ?? [];
  return JSON.stringify(msgs).includes('"transferCall"');
}

// The transfer actually *connected*: Vapi ends the assistant's leg with
// endedReason "assistant-forwarded-call" only when the bridge completed.
// With the warm-transfer fallbackPlan, a missed transfer keeps the call
// going and it ends with a normal reason instead.
function didConnectTransfer(endedReason: string | undefined): boolean {
  return endedReason === "assistant-forwarded-call";
}

/**
 * The owner alert. Deliberately minimal: who called, the number to call back,
 * and why. An owner reading this on a phone at 2am needs to act, not study —
 * so the callback number is in the subject line (visible in the notification
 * preview without opening) and is a tap-to-call link in the body. Everything
 * else lives in the portal, one link away.
 */
async function notifyOwner(call: {
  callerName?: string;
  callbackNumber?: string;
  serviceAddress?: string;
  emergency?: boolean;
  transferMissed?: boolean;
  summary?: string;
  toEmail?: string | null;
}) {
  const name = call.callerName || "Unknown caller";
  const phone = prettyPhone(call.callbackNumber);
  const reason = call.summary?.trim() || "No summary captured for this call.";
  const portalUrl = `${site.deployedUrl}/portal`;

  const subject = [
    call.transferMissed
      ? "🚨 MISSED EMERGENCY TRANSFER — call back NOW"
      : call.emergency
        ? "🚨 EMERGENCY"
        : "New lead",
    name,
    phone,
  ]
    .filter(Boolean)
    .join(" — ");

  const text = [
    call.transferMissed
      ? "EMERGENCY — we tried to transfer them to you live and you didn't pick up. They were told you'd call right back."
      : call.emergency
        ? "EMERGENCY — transferred to you live."
        : null,
    name,
    phone ?? "No callback number captured",
    "",
    "Why they called:",
    reason,
    call.serviceAddress ? `\nAddress: ${call.serviceAddress}` : null,
    "",
    `See the full call and transcript: ${portalUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // Inline styles only — every email client strips <style> blocks.
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  ${
    call.transferMissed
      ? `<div style="background:#fdecec;color:#b42318;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">🚨 MISSED EMERGENCY TRANSFER — they were told you'd call right back. Call them now.</div>`
      : call.emergency
        ? `<div style="background:#fdecec;color:#b42318;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">🚨 EMERGENCY — transferred to you live</div>`
        : ""
  }
  <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escapeHtml(name)}</div>
  ${
    phone
      ? `<a href="tel:${escapeHtml(call.callbackNumber ?? "")}" style="font-size:20px;color:#1d4ed8;text-decoration:none;font-weight:600">${escapeHtml(phone)}</a>`
      : `<div style="color:#666">No callback number captured</div>`
  }

  <div style="margin-top:24px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666">Why they called</div>
  <div style="margin-top:6px;font-size:15px;line-height:1.55">${escapeHtml(reason)}</div>

  ${
    call.serviceAddress
      ? `<div style="margin-top:18px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666">Address</div>
         <div style="margin-top:4px;font-size:15px">${escapeHtml(call.serviceAddress)}</div>`
      : ""
  }

  <a href="${portalUrl}" style="display:inline-block;margin-top:28px;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">See the full call &rarr;</a>

  <div style="margin-top:28px;border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#888">
    Caught by your ${escapeHtml(site.businessName)} AI receptionist.
  </div>
</div>`.trim();

  // Sender/API-key handling lives in lib/notify's sendEmail — one place owns
  // the verified-domain / sandbox-fallback logic for all outbound mail.
  return sendEmail({
    to: call.toEmail || site.ownerEmail,
    subject,
    text,
    html,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyVapiSecret(req)) {
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

  // Why the call ended (silence-timed-out, customer-ended-call, …). Stored
  // so stat tiles can exclude pocket-dials and dead air from "Calls caught".
  const endedReason = message.endedReason as string | undefined;

  // Vapi has moved this between the envelope and the call object across
  // versions — read both rather than silently storing null.
  const callCost =
    (message.cost as number | undefined) ??
    (message.call as { cost?: number } | undefined)?.cost ??
    null;

  const callerName = structuredData.callerName as string | undefined;
  const callbackNumber = structuredData.callbackNumber as string | undefined;
  const serviceAddress = structuredData.serviceAddress as string | undefined;
  const arrivalWindow = structuredData.arrivalWindow as string | undefined;
  const emergency = Boolean(structuredData.emergency);
  const transferAttempted = didAttemptTransfer(message);
  const transferConnected = didConnectTransfer(endedReason);
  // An emergency where the assistant tried to hand off and nobody picked up —
  // the one situation the owner must hear about loudly.
  const transferMissed = emergency && transferAttempted && !transferConnected;

  if (!call?.id) {
    console.error("end-of-call-report with no call id", message);
    return NextResponse.json({ error: "missing call id" }, { status: 400 });
  }

  // Attribute the call to a client by which phone number received it;
  // fall back to the oldest client (single-tenant case) so no call is
  // ever dropped for lack of a match.
  const phoneNumberId =
    (message.phoneNumber as { id?: string } | undefined)?.id ??
    (call as { phoneNumberId?: string }).phoneNumberId;
  const supabase = getSupabaseServerClient();
  let client: { id: string; trade: string; owner_email: string | null } | null = null;
  try {
    if (phoneNumberId) {
      const { data } = await supabase
        .from("clients")
        .select("id, trade, owner_email")
        .eq("vapi_phone_number_id", phoneNumberId)
        .maybeSingle();
      client = data;
    }
    if (!client) {
      const { data } = await supabase
        .from("clients")
        .select("id, trade, owner_email")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      client = data;
    }
  } catch (err) {
    console.error("Client lookup failed:", err);
  }

  let notified = false;
  try {
    notified = await notifyOwner({
      callerName,
      callbackNumber,
      serviceAddress,
      emergency,
      transferMissed,
      summary,
      toEmail: client?.owner_email,
    });
  } catch (err) {
    console.error("Owner notification failed:", err);
  }

  try {
    const { error } = await supabase.from("calls").upsert(
      {
        vapi_call_id: call.id,
        client_id: client?.id ?? null,
        trade: client?.trade ?? "Restoration",
        caller_name: callerName,
        callback_number: callbackNumber,
        emergency,
        standing_water: structuredData.standingWater as boolean | undefined,
        category: structuredData.category as string | undefined,
        loss_date: structuredData.lossDate as string | undefined,
        insurance_carrier: structuredData.insuranceCarrier as string | undefined,
        service_address: serviceAddress,
        arrival_window: arrivalWindow,
        // Booked = the agent committed to an arrival window, or a live
        // emergency was warm-transferred to the owner — being handed the
        // customer mid-crisis is a booked job in all but paperwork.
        booked: Boolean(arrivalWindow?.trim()) || (emergency && transferConnected),
        // Connected, not attempted: a transfer that rang out to voicemail
        // must not show as "→ Transferred" in the portal or count as booked.
        transferred_to_owner: transferConnected,
        ended_reason: endedReason,
        transcript,
        summary,
        recording_url: recordingUrl,
        owner_notified_at: notified ? new Date().toISOString() : null,
        owner_notify_method: notified ? "email" : null,
        // Vapi's all-in per-call cost (model + TTS + transcription). Stored so
        // margin per client is visible as volume grows — measured ~$0.099/min
        // on a realistic intake call against $297/mo revenue.
        cost_usd: callCost,
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
// (getSupabaseServerClient is instantiated once above and reused for both
// the client lookup and the call upsert.)
