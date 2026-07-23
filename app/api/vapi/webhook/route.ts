import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { escapeHtml, prettyPhone, sendEmail } from "@/lib/notify";
import { callOwnerEmergency } from "@/lib/telnyx-voice";
import { verifyVapiSecret } from "@/lib/vapi-auth";
import { site } from "@/lib/site-config";
import { owner } from "@/lib/owner-config";

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

// The assistant is asked to fill in a callback number, but it does not reliably
// know the caller's own digits — when a caller says "use the number I'm calling
// from", the model has emitted the LITERAL prompt template ("{{caller_phone_number}}")
// instead of a number it never actually had. That junk then got stored, emailed,
// and read aloud on the emergency alert. Keep the structured value only when it
// genuinely looks like a phone number; otherwise discard it so every downstream
// consumer falls back to callerId, which telephony always provides correctly.
function cleanCallbackNumber(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Any letter or brace means it's a template token or prose, never a number.
  if (/[a-zA-Z{}]/.test(raw)) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return undefined;
  return raw.trim();
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
  callerId?: string;
  messageForOwner?: string;
  serviceAddress?: string;
  emergency?: boolean;
  transferMissed?: boolean;
  transferConnected?: boolean;
  summary?: string;
  toEmail?: string | null;
}) {
  // Deliberately NOT falling back to the carrier's CNAM record. Measured
  // against known numbers it returned a previous owner's name for a live
  // mobile and a rate-center city for a landline — plausible-looking and
  // wrong. "Unknown caller" is honest; "BROWN,JOE" in an emergency subject
  // line is a lie the owner would act on. See scripts/cnam-probe.ts.
  const name = call.callerName || "Unknown caller";
  // Prefer what the caller asked to be called back on, but never leave the
  // owner with nothing to dial: caller ID is always there and is always
  // correct, where a transcribed number can be garbled by a panicking caller.
  const dialable = call.callbackNumber?.trim() || call.callerId;
  const phone = prettyPhone(dialable);
  // Worth showing separately only when it adds information.
  const callerIdPretty = prettyPhone(call.callerId);
  const showCallerId =
    callerIdPretty && callerIdPretty !== phone ? callerIdPretty : null;
  const reason = call.summary?.trim() || "No summary captured for this call.";
  const portalUrl = `${site.deployedUrl}/portal`;

  const subject = [
    call.transferMissed
      ? "🚨 MISSED EMERGENCY TRANSFER — call back NOW"
      : call.emergency
        ? "🚨 EMERGENCY"
        : call.messageForOwner
          ? "Message"
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
        ? call.transferConnected
          ? "EMERGENCY — transferred to you live."
          : "EMERGENCY — we couldn't reach you live, so we took the details. Call them now."
        : null,
    name,
    phone ?? "No callback number captured",
    showCallerId ? `Called from: ${showCallerId}` : null,
    "",
    call.messageForOwner ? "Message they left:" : "Why they called:",
    call.messageForOwner || reason,
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
        ? call.transferConnected
          ? `<div style="background:#fdecec;color:#b42318;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">🚨 EMERGENCY — transferred to you live</div>`
          : `<div style="background:#fdecec;color:#b42318;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:20px">🚨 EMERGENCY — we couldn't reach you live, so we took the details. Call them now.</div>`
        : ""
  }
  <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escapeHtml(name)}</div>
  ${
    phone
      ? `<a href="tel:${escapeHtml(dialable ?? "")}" style="font-size:20px;color:#1d4ed8;text-decoration:none;font-weight:600">${escapeHtml(phone)}</a>`
      : `<div style="color:#666">No callback number captured</div>`
  }
  ${
    showCallerId
      ? `<div style="margin-top:4px;font-size:13px;color:#666">Called from ${escapeHtml(showCallerId)}</div>`
      : ""
  }

  <div style="margin-top:24px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666">${
    call.messageForOwner ? "Message they left" : "Why they called"
  }</div>
  <div style="margin-top:6px;font-size:15px;line-height:1.55">${escapeHtml(call.messageForOwner || reason)}</div>

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
    to: call.toEmail || owner.email,
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

  // Telephony caller ID — the number the call actually originated from. Always
  // present, always correct, and independent of what the assistant managed to
  // hear. Vapi has kept this on the customer object across versions; the call
  // object is checked as a fallback.
  const callerId =
    (message.customer as { number?: string } | undefined)?.number ??
    (message.call as { customer?: { number?: string } } | undefined)?.customer
      ?.number;

  const callerName = structuredData.callerName as string | undefined;
  const callbackNumber = cleanCallbackNumber(
    structuredData.callbackNumber as string | undefined
  );
  const messageForOwner = structuredData.messageForOwner as string | undefined;
  const serviceAddress = structuredData.serviceAddress as string | undefined;
  const arrivalWindow = structuredData.arrivalWindow as string | undefined;
  const transferAttempted = didAttemptTransfer(message);
  const transferConnected = didConnectTransfer(endedReason);
  // Emergency is what arms the backup voice alert, so it must not hinge on the
  // post-call extractor alone — that field has been narrowly worded and has
  // returned false for real cross-trade emergencies (a roof torn off with no
  // standing water). A transfer attempt is ground truth: the assistant only
  // ever fires transferCall for a live emergency, so treat that as emergency
  // regardless of what the extractor decided. Belt (widened schema) and
  // suspenders (this) — a missed alert on a real 2am emergency is the one
  // failure this whole feature exists to prevent.
  const emergency = Boolean(structuredData.emergency) || transferAttempted;
  // An emergency where the assistant tried to hand off and nobody picked up —
  // the one situation the owner must hear about loudly.
  const transferMissed = emergency && transferAttempted && !transferConnected;

  if (!call?.id) {
    console.error("end-of-call-report with no call id", message);
    return NextResponse.json({ error: "missing call id" }, { status: 400 });
  }

  // Attribute the call to a client by which phone number received it.
  //
  // There is deliberately NO fallback. This used to fall back to the oldest
  // client row "so no call is ever dropped for lack of a match", which sounds
  // safe and is not: an unattributable call was not dropped, it was delivered
  // to the wrong business. `client_id` drives the portal's RLS policy, so a
  // wrong id shows one contractor another contractor's caller name, callback
  // number, service address, transcript and recording — and `owner_email`
  // sends them the lead email, while the contractor who actually earned the
  // call gets nothing and never learns there was something to miss. Their
  // "revenue protected" absorbs a job that was never theirs.
  //
  // It looked correct in testing only because the oldest row is the operator's
  // own client record, so every unmatched call landed harmlessly on us. The
  // failure appears the first time a paying client is the oldest row, which is
  // a function of onboarding order — nothing you would notice changing.
  //
  // This is not an attacker path: lib/vapi-auth verifyVapiSecret fails closed
  // and the secret is never given to clients. It is an operational one — a
  // number provisioned outside scripts/onboard-client.ts, a number re-pointed
  // in the Vapi dashboard, or any call with no phone number at all (web and
  // dashboard test calls have none, and hit this every time).
  //
  // Unmatched now means client_id = null. The call is still saved in full and
  // the lead email still goes out, to the operator rather than to a guess —
  // notifyOwner falls back to owner.email when toEmail is null. An orphan is
  // visible: the "Unassigned" filter and stat tile on /dashboard/calls, and
  // check 8 in the nightly health cron.
  const phoneNumberId =
    (message.phoneNumber as { id?: string } | undefined)?.id ??
    (call as { phoneNumberId?: string }).phoneNumberId;
  const supabase = getSupabaseServerClient();
  let client: {
    id: string;
    trade: string;
    owner_email: string | null;
    // The owner's emergency cell — the same number the Vapi agent warm-transfers
    // to (set by --transfer in scripts/onboard-client.ts). This is the field
    // onboarding actually populates; owner_cell exists in the schema but nothing
    // writes it, so the voice alert reads this to reach the RIGHT owner per
    // client instead of falling back to the operator on every real client.
    emergency_transfer_number: string | null;
    // The client's own AI line (E.164) — used as the alert's caller ID so the
    // emergency ring shows up as their business number, not ours.
    assigned_number: string | null;
    // Portal setting: how many redials after an unanswered alert ring (1 or 2).
    alert_retries: number | null;
  } | null = null;
  try {
    if (phoneNumberId) {
      const { data } = await supabase
        .from("clients")
        .select(
          "id, trade, owner_email, emergency_transfer_number, assigned_number, alert_retries"
        )
        .eq("vapi_phone_number_id", phoneNumberId)
        .maybeSingle();
      client = data;
    }
  } catch (err) {
    console.error("Client lookup failed:", err);
  }
  if (!client) {
    // Loud, because the alternative is a call sitting unattributed until
    // someone happens to open the dashboard.
    console.error(
      `[vapi-webhook] call ${call.id} could not be attributed to a client ` +
        `(phoneNumberId=${phoneNumberId ?? "absent"}). Saving with client_id = null.`
    );
  }

  // NO CNAM LOOKUP HERE — measured against numbers we could verify, the
  // carrier's caller-name data was wrong every time (a previous owner's name
  // on a live mobile, a rate-center city on a landline). It was removed rather
  // than displayed with a caveat: an owner acting on a lead has no way to tell
  // a stale record from a real one, and a per-call lookup costs money for the
  // privilege. lib/cnam.ts and scripts/cnam-probe.ts are kept so this can be
  // re-measured cheaply if Telnyx's data ever improves.

  let notified = false;
  try {
    notified = await notifyOwner({
      callerName,
      callbackNumber,
      callerId,
      messageForOwner,
      serviceAddress,
      emergency,
      transferMissed,
      transferConnected,
      summary,
      toEmail: client?.owner_email,
    });
  } catch (err) {
    console.error("Owner notification failed:", err);
  }

  // Loud second channel for an emergency the owner has NOT already handled
  // live. Email can sit unread on a nightstand at 2am; a ringing phone can't.
  // Fires only when the warm transfer did not connect — if they already spoke
  // to the caller, ringing them again is noise. Falls back to the operator's
  // cell for an unattributed call (same policy as the email). No 10DLC needed:
  // it's a voice call, not a text (lib/telnyx-voice explains why that matters).
  let voiceAlerted = false;
  if (emergency && !transferConnected) {
    try {
      voiceAlerted = await callOwnerEmergency({
        toCell: client?.emergency_transfer_number ?? owner.cellE164,
        callerName,
        // The email prefers callbackNumber but always has caller ID to fall
        // back on; the voice alert wants the same best-available number to read
        // aloud, since a panicking caller's spoken number can be garbled.
        callbackNumber: callbackNumber?.trim() || callerId,
        // Ring from the client's own AI line so the owner sees a number they
        // recognize (and have saved); falls back to the shared line inside.
        fromNumber: client?.assigned_number,
        // 1 initial ring + the client's chosen redials (portal setting).
        maxAttempts: client?.alert_retries != null ? 1 + client.alert_retries : undefined,
      });
    } catch (err) {
      console.error("Emergency voice alert failed:", err);
    }
  }

  // Record every channel that actually went out, so the portal's "notified"
  // column tells the truth about how the owner was reached (or wasn't).
  const channels = [
    notified ? "email" : null,
    voiceAlerted ? "voice" : null,
  ].filter(Boolean) as string[];
  const anyNotified = channels.length > 0;

  try {
    const { error } = await supabase.from("calls").upsert(
      {
        vapi_call_id: call.id,
        client_id: client?.id ?? null,
        trade: client?.trade ?? "Restoration",
        caller_name: callerName,
        callback_number: callbackNumber,
        caller_id: callerId,
        message_for_owner: messageForOwner,
        emergency,
        standing_water: structuredData.standingWater as boolean | undefined,
        category: structuredData.category as string | undefined,
        loss_date: structuredData.lossDate as string | undefined,
        insurance_carrier: structuredData.insuranceCarrier as string | undefined,
        service_address: serviceAddress,
        arrival_window: arrivalWindow,
        // Booked = the agent committed to an arrival window. A warm-transferred
        // emergency is NOT counted here: a phone handoff is not a won job, and
        // folding it into `booked` multiplied every forwarded call into the
        // customer-facing "revenue protected" figure (booked × avg ticket),
        // producing dollars the owner knows he never earned. The transfer stays
        // fully visible via `transferred_to_owner` and its "→ Transferred" badge.
        booked: Boolean(arrivalWindow?.trim()),
        // Connected, not attempted: a transfer that rang out to voicemail
        // must not show as "→ Transferred" in the portal or count as booked.
        transferred_to_owner: transferConnected,
        ended_reason: endedReason,
        transcript,
        summary,
        recording_url: recordingUrl,
        owner_notified_at: anyNotified ? new Date().toISOString() : null,
        owner_notify_method: anyNotified ? channels.join("+") : null,
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
