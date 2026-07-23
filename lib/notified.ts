import { isDeadAir, type CallRow } from "@/components/dash";

// The "was the owner ever told about this call?" predicate, and the floor it
// counts from.
//
// This lives in its own module rather than in lib/ops.ts because lib/ops.ts
// imports the Supabase server client at module scope, and components/CallTable
// is a "use client" component that needs the exact same definition. Two copies
// of this rule is how the portal and the dashboard end up disagreeing about
// how many calls went unnotified — which is worse than either number alone,
// because then neither can be trusted.

/**
 * When owner-notification emails started actually being deliverable.
 *
 * RESEND_API_KEY was configured on 2026-07-21; every call before this timestamp
 * failed to notify for a reason no longer present. Used as a floor so the
 * "never notified" count only ever includes calls that genuinely should have
 * sent. Without it the alert opens on a permanent backlog of calls nobody can
 * do anything about, and an alert you can't clear is an alert you stop reading.
 */
export const NOTIFICATIONS_LIVE_SINCE = Date.parse("2026-07-21T00:00:00-04:00");

/**
 * The floor the "never notified" view counts from: whichever is later, seven
 * days ago or the day notifications started working. The rolling window keeps
 * the list actionable; the absolute floor keeps pre-Resend history out of it.
 */
export function unnotifiedCutoff(nowMs: number) {
  return Math.max(nowMs - 7 * 86400_000, NOTIFICATIONS_LIVE_SINCE);
}

/**
 * A call the owner was never emailed about.
 *
 * Dead air is excluded: a pocket dial that timed out in silence is not a lead
 * anyone failed to follow up on, and counting it makes the number look like a
 * problem when nothing is wrong.
 */
export function isUnnotified(c: CallRow, nowMs: number) {
  return (
    !isDeadAir(c) &&
    !c.owner_notified_at &&
    new Date(c.created_at).getTime() >= unnotifiedCutoff(nowMs)
  );
}
