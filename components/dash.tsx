// Shared UI for the ops dashboard and client portals. Draws entirely from the
// tokens in globals.css so the portal and the marketing site read as one
// product. Status is never communicated by color alone — every status color
// ships with a text label or glyph, so it survives colorblindness and
// grayscale printing.

export type CallRow = {
  id: string;
  created_at: string;
  trade: string;
  caller_name: string | null;
  callback_number: string | null;
  caller_id: string | null;
  caller_cnam: string | null;
  caller_line_type: string | null;
  message_for_owner: string | null;
  emergency: boolean;
  standing_water: boolean | null;
  category: string | null;
  insurance_carrier: string | null;
  service_address: string | null;
  arrival_window: string | null;
  transferred_to_owner: boolean;
  booked: boolean;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  owner_notified_at: string | null;
  client_id: string | null;
  ended_reason: string | null;
  // Lead disposition (supabase/lead-lifecycle.sql). Seeded from intake on
  // insert — scheduled / contacted / new — and moved by the owner from there.
  // won / lost are only ever set by a human: no system knows if a job closed.
  lead_status: "new" | "contacted" | "scheduled" | "won" | "lost";
  // When a human last moved the disposition (or tapped Call back / Text).
  // Null = untouched since intake; the follow-up queue sorts on it.
  dispositioned_at: string | null;
  // Stored by the webhook since day one but never surfaced — the intake asks
  // for the loss date and it was only visible by querying Supabase by hand.
  loss_date: string | null;
  owner_notify_method: string | null;
  // When the owner tapped "I've got this" on an emergency (supabase/
  // emergency-ack.sql). Null = not yet acknowledged. Clears the call out of the
  // red "needs a callback" banner and stands as the response-time record.
  acknowledged_at: string | null;
  /** Vapi's all-in per-call cost. Ops-only — never shown in a client portal. */
  cost_usd: number | null;
};

/**
 * Did this call look like it wasn't a customer at all?
 *
 * Keyed off the agent's own runtime classification — it only fills in
 * message_for_owner once it has decided the caller isn't requesting service —
 * rather than off the CNAM record. Content beats metadata here: the agent
 * heard "this is Dr. Chen's office calling for John", where a carrier database
 * can only offer a stale name and is usually blank for mobiles.
 *
 * Used to SUGGEST routing the number to voicemail. Never to do it.
 */
export function looksPersonal(c: CallRow) {
  return Boolean(c.message_for_owner?.trim()) && !c.emergency && !c.booked;
}

/**
 * A call that never became a conversation: it silence-timed-out and no
 * caller detail was ever captured. Pocket dials and dead air land here.
 * Excluded from stat tiles (the numbers that justify the invoice) but still
 * listed in the call log — hiding rows entirely would undermine trust in
 * the log as a complete record.
 */
export function isDeadAir(c: CallRow) {
  return (
    c.ended_reason === "silence-timed-out" &&
    !c.caller_name &&
    !c.callback_number
  );
}

// A lead the owner still has to chase: captured, not yet won or lost, and not
// an emergency (those have their own act-now banner). Shared by the follow-up
// queue and the call-log filter so "needs follow-up" means the same thing in
// both places. A `scheduled` job is off the list — it's on the calendar.
export function needsFollowUp(c: CallRow) {
  return (
    !c.emergency && (c.lead_status === "new" || c.lead_status === "contacted")
  );
}

// A lead is "due for a nudge" this many days after it was last touched. Two
// days: chase a new estimate within 48h or it goes cold, but don't badge a
// lead that came in this morning. One knob, shared by the queue and the portal
// count so "due" means the same number everywhere.
export const NUDGE_AFTER_DAYS = 2;

// The last time anything happened to this lead: a human disposition or a
// tap-to-contact (dispositioned_at), else intake (created_at). This is the
// clock the nudge queue measures against — tapping Call back / Text resets it
// (mark_followed_up bumps dispositioned_at), so a lead the owner just chased
// stops being "due" without any separate last-nudged column.
export function lastLeadActivity(c: CallRow) {
  return c.dispositioned_at ?? c.created_at;
}

// Is this lead overdue for a proactive follow-up? A followable lead (see
// needsFollowUp) that has gone quiet for NUDGE_AFTER_DAYS. This is what the
// portal counts as "N due for a nudge" and what the queue flags — the send
// still happens from the owner's own phone via the existing sms:/tel: link.
export function isDueForNudge(c: CallRow, nowMs: number) {
  if (!needsFollowUp(c)) return false;
  const ageMs = nowMs - new Date(lastLeadActivity(c)).getTime();
  return ageMs >= NUDGE_AFTER_DAYS * 86400_000;
}

// A booked job this many days old is almost certainly past its service date —
// it either happened (won) or fell through (lost). We can't read that from
// arrival_window (it's free text: "Tuesday morning"), so age since booking is
// the trigger. Seven days: long enough that most jobs have run, short enough
// that the owner still remembers the call.
export const RECONCILE_AFTER_DAYS = 7;

// Does this booked job need the owner to confirm its outcome? Only `scheduled`
// leads (a job on the calendar) that are old enough to have happened. This is
// the other half of the lifecycle from needsFollowUp — chasing leads vs.
// closing them out — and it's what feeds real won/lost data back in, since no
// system can know whether a quote turned into a paid job. won / lost are
// already resolved, so they drop off.
export function needsReconcile(c: CallRow, nowMs: number) {
  if (c.lead_status !== "scheduled") return false;
  const ageMs = nowMs - new Date(c.created_at).getTime();
  return ageMs >= RECONCILE_AFTER_DAYS * 86400_000;
}

export function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Speed-to-lead: how long between the call landing and the first alert reaching
 * the owner (owner_notified_at − created_at). This is the real, stored latency
 * that matters — not "how fast did the AI pick up" (it answers instantly and we
 * don't clock it), but "how fast was the job in your hand." Returns null when
 * the call never triggered an alert, so callers can skip it rather than show a
 * meaningless zero. Formatted tight: seconds under 90s, else whole minutes.
 */
export function speedToLead(c: CallRow): { ms: number; label: string } | null {
  if (!c.owner_notified_at) return null;
  const ms = new Date(c.owner_notified_at).getTime() - new Date(c.created_at).getTime();
  // Clock skew or a backfilled row can make this negative; treat as "instant"
  // rather than printing a nonsensical "-3s".
  const clamped = Math.max(0, ms);
  const secs = Math.round(clamped / 1000);
  const label = secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
  return { ms: clamped, label };
}

/** Median speed-to-lead across the calls that actually alerted the owner. */
export function medianSpeedToLead(calls: CallRow[]): string | null {
  const spans = calls
    .map((c) => speedToLead(c)?.ms)
    .filter((ms): ms is number => ms != null)
    .sort((a, b) => a - b);
  if (spans.length === 0) return null;
  const mid = spans[Math.floor(spans.length / 2)];
  const secs = Math.round(mid / 1000);
  return secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
}

// The one outcome each call gets on the dashboard's 24-hour line strip and its
// recent-calls feed. A call can carry several truths at once (an emergency that
// booked); this collapses them to the single tick color, most-urgent first, so
// the strip reads at a glance. Deliberately NOT a "quote" bucket — no such
// outcome exists in the data (see SCOPE.md); a captured non-service message is
// its own gray tick.
export type CallOutcome = "emergency" | "booked" | "transferred" | "message" | "routine";

export function outcomeOf(c: CallRow): CallOutcome {
  if (c.emergency) return "emergency";
  if (c.booked) return "booked";
  if (c.transferred_to_owner) return "transferred";
  if (c.message_for_owner?.trim()) return "message";
  return "routine";
}

// Whole-number percent change of `current` against `previous`. Null when the
// prior period was empty — there is no honest percentage against zero, so the
// hero says "new this period" instead of printing a fake +100% or ∞.
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function isAfterHours(ts: string) {
  const d = new Date(ts);
  const h = Number(
    d.toLocaleString("en-US", {
      timeZone: "America/Detroit",
      hour: "numeric",
      hour12: false,
    })
  );
  return h < 8 || h >= 18;
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "critical" | "good" | "warning" | "info" | "muted";
}) {
  const tones: Record<string, string> = {
    critical: "bg-critical-surface text-critical-text ring-critical-line",
    good: "bg-positive-surface text-positive-text ring-positive-line",
    warning: "bg-caution-surface text-caution-text ring-caution-line",
    info: "bg-accent-surface text-accent-text ring-accent-line",
    muted: "bg-surface-overlay text-content-tertiary ring-line-default",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The status badges for one call — the single definition, used by the internal
 * call log, the internal detail panel, and the client portal's table.
 *
 * This exists because it was duplicated three times and the copies drifted.
 * The portal's copy omitted "Transferred" entirely, which hid the one outcome
 * that justifies the subscription: an emergency that reached a human. And
 * because its no-badges fallback also forgot to test `transferred_to_owner`, a
 * transferred-but-not-booked call during business hours rendered as "Routine"
 * — the most valuable call the system produces, labelled as the least. One
 * component means the next status added shows up in all three places or none.
 *
 * Every badge carries a glyph as well as a tone (▲ ✓ → ☾). That is load-bearing,
 * not decoration: critical red and caution amber are not separable under
 * deuteranopia, and the mitigation is that colour is never the only signal.
 * If you add a badge, give it a glyph.
 *
 * `fallback` is what to render when a call has no status at all:
 *   "dash"    — an em-dash, for dense internal tables where a badge on every
 *               row would flatten the ones that matter.
 *   "routine" — an explicit "Routine" badge, for the portal and the detail
 *               panel, where a bare dash reads as missing data rather than as
 *               "nothing needed doing."
 */
export function StatusBadges({
  c,
  fallback = "dash",
}: {
  c: CallRow;
  fallback?: "dash" | "routine";
}) {
  const afterHours = isAfterHours(c.created_at);
  const none =
    !c.emergency && !c.booked && !c.transferred_to_owner && !afterHours;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.emergency && <Badge tone="critical">▲ Emergency</Badge>}
      {c.booked && <Badge tone="good">✓ Booked</Badge>}
      {c.transferred_to_owner && <Badge tone="info">→ Transferred</Badge>}
      {afterHours && <Badge tone="warning">☾ After-hours</Badge>}
      {none &&
        (fallback === "routine" ? (
          <Badge tone="muted">Routine</Badge>
        ) : (
          <span className="text-content-faint">—</span>
        ))}
    </div>
  );
}

// 14-day single-series activity strip. One series, one color — the accent.
// Peak gets a direct label so the shape is readable without a y-axis.
//
// `nowMs` is passed in rather than read from Date.now() here: reading the
// clock during render is impure, so the server and the client would compute
// different 14-day windows and React would report a hydration mismatch.
// One timestamp, generated server-side per request, keeps both in agreement.
export function ActivityBars({
  calls,
  nowMs,
  windowDays = 14,
  title,
}: {
  calls: CallRow[];
  nowMs: number;
  /** How many days the strip spans. Callers with a date filter pass its
   *  value, so the chart and the table below it describe the same period —
   *  a chart that silently ignores the filter above it is a chart that lies. */
  windowDays?: number;
  title?: string;
}) {
  const span = Math.max(1, Math.min(90, Math.round(windowDays)));
  const days: { key: string; label: string; n: number }[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400_000);
    const key = d.toLocaleDateString("en-US", { timeZone: "America/Detroit" });
    days.push({
      key,
      label: d.toLocaleDateString("en-US", {
        timeZone: "America/Detroit",
        month: "short",
        day: "numeric",
      }),
      n: 0,
    });
  }
  for (const c of calls) {
    const key = new Date(c.created_at).toLocaleDateString("en-US", {
      timeZone: "America/Detroit",
    });
    const day = days.find((d) => d.key === key);
    if (day) day.n++;
  }
  const max = Math.max(1, ...days.map((d) => d.n));

  return (
    <div className="rounded-lg border border-line-default bg-surface-raised p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-content-secondary">
          {title ?? `Calls — last ${span} days`}
        </h3>
        <span className="text-xs text-content-tertiary">daily totals</span>
      </div>
      {/* Screen-reader path: the same daily counts as a real table, navigable
          with table commands. The visual bars are decorative (aria-hidden).
          Previously every bar was its own tab stop — up to 90 of them — so a
          keyboard user had to tab through the entire chart to get past it. The
          data lived only in a hover tooltip before that, unreachable without a
          mouse; this keeps the data reachable AND out of the tab sequence. */}
      <table className="sr-only">
        <caption>{title ?? `Calls — last ${span} days`}, daily totals</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Calls</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.n}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul
        aria-hidden
        className="mt-5 flex h-24 list-none items-end gap-[3px]"
      >
        {days.map((d) => (
          <li key={d.key} className="group relative flex-1 rounded-sm">
            <div
              className="w-full rounded-t-sm bg-accent transition-opacity group-hover:opacity-75"
              style={{
                height: `${Math.max(3, (d.n / max) * 88)}px`,
                opacity: d.n === 0 ? 0.14 : 1,
              }}
            />
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-default bg-surface-overlay px-2 py-1 text-xs text-content-primary shadow-raised group-hover:block">
              {d.label}: {d.n} call{d.n === 1 ? "" : "s"}
            </div>
            {d.n === max && max > 0 && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xs font-semibold text-content-secondary">
                {d.n}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div
        aria-hidden
        className="mt-2 flex justify-between text-2xs text-content-tertiary"
      >
        <span>{days[0].label}</span>
        <span>{days[days.length - 1].label}</span>
      </div>
    </div>
  );
}
