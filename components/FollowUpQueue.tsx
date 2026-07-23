"use client";

import { markFollowedUp } from "@/app/actions/portal";
import { prettyPhone, telHref, smsHref } from "@/lib/phone";
import LeadStatus from "./LeadStatus";
import { Badge, isDueForNudge, lastLeadActivity, type CallRow } from "./dash";

// The churn engine, inverted. A call log answers "what came in"; this answers
// "who still needs me to do something about it" — the non-emergency leads that
// are captured but not yet won, lost, or on the calendar, most-overdue first so
// the one closest to going cold is on top.
//
// It only renders when there's work in it (see portal/page.tsx). A queue that
// is permanently on screen at zero trains the owner to stop looking at it; one
// that appears only when there are leads to chase is a to-do list, and an empty
// one having quietly disappeared is itself the "all caught up" signal.
//
// "Due for a nudge" is the assisted-nudge feature: a lead gone quiet past
// NUDGE_AFTER_DAYS (see isDueForNudge) gets flagged, the text is pre-written,
// and the owner taps Text to send it from their own phone — no number to
// register, no automated SMS. Tapping Call back / Text calls mark_followed_up,
// which resets the lead's clock, so a lead the owner just chased drops off the
// due list instead of nagging them about someone they already texted.

function ageLabel(ts: string, nowMs: number) {
  const days = Math.floor((nowMs - new Date(ts).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const STATUS_WORD: Record<string, string> = {
  new: "New lead",
  contacted: "Contacted",
};

export default function FollowUpQueue({
  leads,
  nowMs,
  clientName,
}: {
  leads: CallRow[];
  nowMs: number;
  clientName: string;
}) {
  return (
    <ul className="divide-y divide-line-subtle">
      {leads.map((c) => {
        const reach = c.callback_number || c.caller_id;
        const call = telHref(reach);
        const text = smsHref(
          reach,
          `Hi${
            c.caller_name ? ` ${c.caller_name.split(" ")[0]}` : ""
          }, this is ${clientName} following up on your call.`
        );
        // The age reads off last activity, not intake: a lead you contacted
        // yesterday should say "yesterday", not "5 days ago" because that's
        // when it first rang. Same clock the due flag measures against.
        const activity = lastLeadActivity(c);
        const due = isDueForNudge(c, nowMs);

        return (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-content-primary">
                  {c.caller_name || "Unknown caller"}
                </span>
                {prettyPhone(reach) && (
                  <span className="truncate font-mono text-2xs text-content-tertiary">
                    {prettyPhone(reach)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-tertiary">
                <span>
                  {STATUS_WORD[c.lead_status] ?? "Lead"} ·{" "}
                  {ageLabel(activity, nowMs)}
                </span>
                {due && <Badge tone="warning">◷ Due for a nudge</Badge>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {call && (
                <a
                  href={call}
                  onClick={() => markFollowedUp(c.id)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-accent-button px-3 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-button-hover"
                >
                  <span aria-hidden>✆</span> Call back
                </a>
              )}
              {text && (
                <a
                  href={text}
                  onClick={() => markFollowedUp(c.id)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-default px-3 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
                >
                  <span aria-hidden>✉</span> Text
                </a>
              )}
              <LeadStatus callId={c.id} value={c.lead_status} compact />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
