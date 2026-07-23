import { StatusBadges, fmt, type CallRow } from "./dash";

// A compact glance for the Dashboard — the few most recent calls as living proof
// the line is working: outcome badge, caller, a one-line AI summary, the time,
// and the est. $ when a job was booked. Intentionally SHALLOW: no recordings or
// transcripts here. That depth (players, full transcript, the whole log) lives
// in the Calls tab, which this panel links straight to. Keeping it a summary is
// the point — the Dashboard should never become a second call log.

export default function RecentCallsFeed({
  calls,
  avgTicket,
}: {
  calls: CallRow[];
  avgTicket: number;
}) {
  return (
    <ul className="divide-y divide-line-subtle">
      {calls.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadges c={c} fallback="routine" />
              <span className="truncate font-medium text-content-primary">
                {c.caller_name || "Unknown caller"}
              </span>
              <span className="text-2xs text-content-faint">{fmt(c.created_at)}</span>
            </div>
            {c.summary && (
              <p className="mt-1 line-clamp-1 text-sm text-content-secondary">
                {c.summary}
              </p>
            )}
          </div>

          {c.booked && (
            <span className="whitespace-nowrap text-sm font-medium tabular-nums text-positive-text">
              ~${avgTicket.toLocaleString()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
