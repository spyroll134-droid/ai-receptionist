"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentClient,
  getSupabaseSessionClient,
  requireAdmin,
} from "@/lib/supabase-auth";

// Self-service portal settings. Kept separate from auth.ts, which is only
// about signing in and out.

export type AvgTicketState = { ok?: boolean; error?: string } | undefined;

export async function updateAvgTicket(
  _prev: AvgTicketState,
  formData: FormData
): Promise<AvgTicketState> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };

  // Accept "6,000", "$6000", " 6000 " — owners type dollar amounts, not ints.
  const raw = String(formData.get("avg_ticket") ?? "").replace(/[$,\s]/g, "");
  const dollars = raw === "" ? null : Number(raw);
  if (
    dollars !== null &&
    (!Number.isInteger(dollars) || dollars < 50 || dollars > 1_000_000)
  ) {
    return { error: "Enter a whole dollar amount between $50 and $1,000,000." };
  }

  // set_avg_ticket (supabase/auth.sql) scopes the write to the signed-in
  // user's own client row and is the only write clients have on the table.
  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_avg_ticket", {
    p_dollars: dollars,
  });
  if (error) return { error: "Couldn't save that — try again." };

  revalidatePath("/portal");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lead lifecycle
// ---------------------------------------------------------------------------

const LEAD_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Set a lead's disposition from the portal. Called directly (not via a form)
 * from the disposition control, which owns its own optimistic state.
 *
 * set_lead_status (supabase/lead-lifecycle.sql) validates the status and scopes
 * the write to the signed-in client's own calls — a call id from another tenant
 * updates nothing and raises. Returns a plain object so the control can revert
 * its optimistic value on failure.
 */
export async function setLeadStatus(
  callId: string,
  status: string
): Promise<{ error?: string }> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };
  if (!callId) return { error: "This call has no id." };
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { error: "That isn't a valid status." };
  }

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_lead_status", {
    p_call_id: callId,
    p_status: status,
  });
  if (error) {
    console.error("[setLeadStatus] rpc failed:", error);
    return { error: "Couldn't save that — try again." };
  }

  revalidatePath("/portal");
  // The Outcomes tab is a second reader of lead_status — a won/lost filed from
  // the call log has to show up there without a hard refresh.
  revalidatePath("/portal/outcomes");
  return {};
}

/**
 * Log a follow-up touch when the owner taps Call back or Text on a lead.
 *
 * Fire-and-forget from the tap handler: the tel:/sms: link still opens the
 * dialer regardless. A `new` lead advances to `contacted`; a `contacted` lead
 * just has its follow-up clock (dispositioned_at) reset — so the moment the
 * owner chases a lead, it drops off the "due for a nudge" list instead of
 * nagging them about someone they just texted. won/lost/scheduled are a no-op,
 * so tapping Call back on a closed lead does nothing — hence no error surface.
 */
export async function markFollowedUp(callId: string): Promise<void> {
  const session = await getCurrentClient();
  if (!session || !callId) return;

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("mark_followed_up", {
    p_call_id: callId,
  });
  if (error) {
    console.error("[markFollowedUp] rpc failed:", error);
    return;
  }
  revalidatePath("/portal");
}

/**
 * Owner taps "I've got this" on a live emergency. Records who took it and when
 * (acknowledge_emergency, supabase/emergency-ack.sql), which drops the call out
 * of the red "still waiting on a callback" banner and stands as the response-
 * time record the service terms lean on.
 *
 * Called directly from the escalation card, which owns its own optimistic
 * state, so this returns a plain object it can revert on failure. Idempotent at
 * the DB — a double tap keeps the first acknowledgement time.
 */
export async function acknowledgeEmergency(
  callId: string
): Promise<{ error?: string }> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };
  if (!callId) return { error: "This call has no id." };

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("acknowledge_emergency", {
    p_call_id: callId,
  });
  if (error) {
    console.error("[acknowledgeEmergency] rpc failed:", error);
    return { error: "Couldn't save that — try again." };
  }

  revalidatePath("/portal");
  return {};
}

export type AlertRetriesState = { ok?: boolean; error?: string } | undefined;

/**
 * How many times the emergency alert calls the owner back after an unanswered
 * ring — 1 or 2, their choice. The webhook reads clients.alert_retries when it
 * places the alert; nothing else changes about how calls are answered.
 */
export async function updateAlertRetries(
  _prev: AlertRetriesState,
  formData: FormData
): Promise<AlertRetriesState> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };

  const retries = Number(formData.get("alert_retries"));
  if (retries !== 1 && retries !== 2) {
    return { error: "Choose 1 or 2 call-backs." };
  }

  // set_alert_retries (supabase/client-agent.sql) scopes the write to the
  // signed-in user's own client row, same as set_avg_ticket.
  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_alert_retries", {
    p_retries: retries,
  });
  if (error) {
    console.error("[updateAlertRetries] rpc failed:", error);
    return { error: "Couldn't save that — try again." };
  }

  revalidatePath("/portal/settings");
  return { ok: true };
}

export type VoicemailNumberState = { ok?: boolean; error?: string } | undefined;

/**
 * Route a number to voicemail instead of the intake agent — or undo it.
 *
 * Built as a one-click action on a call the client already received, rather
 * than a list collected at onboarding: nobody can recite their wife's and
 * their doctor's numbers on demand, and asking a new client to hand over
 * their family's phone numbers is a bad first impression. The list assembles
 * itself out of calls that actually came in.
 */
export async function setVoicemailNumber(
  _prev: VoicemailNumberState,
  formData: FormData
): Promise<VoicemailNumberState> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };

  const number = String(formData.get("number") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (number.replace(/\D/g, "").length < 10) {
    return { error: "No caller ID on this call to route." };
  }

  // set_voicemail_number (supabase/client-agent.sql) normalizes to 10 digits
  // and scopes the write to the signed-in user's own client row.
  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_voicemail_number", {
    p_number: number,
    p_enabled: enabled,
  });
  if (error) {
    // Logged, not just swallowed: the RPC and its grants both test clean, so
    // if this ever fires the message is the only way to find out why.
    console.error("[setVoicemailNumber] rpc failed:", error);
    return { error: "Couldn't save that — try again." };
  }

  revalidatePath("/portal");
  return { ok: true };
}

/**
 * Same thing from the ops dashboard, on a named client's behalf.
 *
 * Separate action rather than a branch inside setVoicemailNumber: this one
 * takes a client_id off the form, so it must never be reachable by a client
 * session. The admin check is enforced twice — here, and again in
 * set_voicemail_number_admin against the admins table, so a mistake in this
 * file alone can't write to an arbitrary client row.
 */
export async function setVoicemailNumberForClient(
  _prev: VoicemailNumberState,
  formData: FormData
): Promise<VoicemailNumberState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };

  const clientId = String(formData.get("client_id") ?? "");
  const number = String(formData.get("number") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!clientId) return { error: "This call isn't attached to a client." };
  if (number.replace(/\D/g, "").length < 10) {
    return { error: "No caller ID on this call to route." };
  }

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_voicemail_number_admin", {
    p_client_id: clientId,
    p_number: number,
    p_enabled: enabled,
  });
  if (error) {
    console.error("[setVoicemailNumberForClient] rpc failed:", error);
    return { error: "Couldn't save that — try again." };
  }

  revalidatePath("/dashboard/calls");
  return { ok: true };
}
