import { fmt, type CallRow } from "@/components/dash";

// The trial's single most important job is to turn a skeptic into a believer,
// and the thing that does that isn't a stat — it's the moment they see their
// OWN line catch a real call they'd otherwise have lost. PROMPT.md names this
// as the top conversion lever: proof, not claims. So during the trial window we
// hoist the best call the line has caught so far to the top of the portal and
// say, plainly, "this already happened — this is what you're paying for."
//
// Shown only while trialing AND only once there's a call worth showing. Picking
// order (best proof first): a live emergency it caught, else a booked job, else
// just that it answered. Nothing to show → the whole thing renders null, so a
// quiet trial never displays an empty brag.

export function pickTrialProof(connected: CallRow[]): CallRow | null {
  // `connected` arrives newest-first; .at(-1) is therefore the EARLIEST match —
  // the first time the line proved itself, which is the more honest "look what
  // it did on day one" story than surfacing whatever happened most recently.
  return (
    connected.filter((c) => c.emergency).at(-1) ??
    connected.filter((c) => c.booked).at(-1) ??
    connected.at(-1) ??
    null
  );
}

export default function TrialProof({
  call,
  daysLeft,
  avgTicket,
}: {
  call: CallRow;
  daysLeft: number;
  avgTicket: number;
}) {
  const kind = call.emergency ? "emergency" : call.booked ? "booked" : "answered";
  const headline =
    kind === "emergency"
      ? "Your line already caught a live emergency"
      : kind === "booked"
        ? "Your line already booked you a job"
        : "Your line is already answering for you";
  const value =
    kind === "emergency"
      ? "A call like this goes to voicemail without you here — and voicemail doesn't call restoration back."
      : kind === "booked"
        ? `That's about $${avgTicket.toLocaleString()} of work it put on your calendar while you were busy.`
        : "Every one of these would have rung out unanswered before.";

  return (
    <div className="mb-4 rounded-lg border border-accent-line bg-accent-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-accent-line bg-surface-raised px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-accent-text">
          Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
        </span>
        <span className="text-sm font-semibold text-content-primary">
          {headline}
        </span>
      </div>
      <div className="mt-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className={call.emergency ? "text-critical-text" : "text-positive-text"}>
            {call.emergency ? "▲" : "✓"}
          </span>
          <span className="truncate text-sm font-medium text-content-primary">
            {call.caller_name || "A caller"}
          </span>
          <span className="whitespace-nowrap text-2xs text-content-tertiary">
            {fmt(call.created_at)}
          </span>
        </div>
        {call.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-content-secondary">
            {call.summary}
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-content-tertiary">{value}</p>
    </div>
  );
}
