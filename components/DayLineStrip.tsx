import { fmt, outcomeOf, type CallOutcome, type CallRow } from "@/components/dash";

// The signature element: the last 24 hours as a single horizontal line, every
// call a colored tick placed at the hour it came in. It's the brand moment, so
// everything around it stays quiet — one rail, four colors, a light legend.
//
// Color maps to real outcomes only (SCOPE.md — there is no "quote" bucket):
//   green  = booked      red = emergency
//   blue   = transferred  gray = message / routine
//
// Accessibility mirrors ActivityBars: the ticks are decorative (aria-hidden)
// and the same data is exposed as an sr-only table, so a screen-reader user
// gets every call's time and outcome without tabbing through N ticks, and the
// data is never mouse-only.

const WINDOW_MS = 24 * 60 * 60 * 1000;

const TICK: Record<CallOutcome, { cls: string; label: string }> = {
  emergency: { cls: "bg-critical", label: "Emergency" },
  booked: { cls: "bg-positive", label: "Booked" },
  transferred: { cls: "bg-accent", label: "Transferred" },
  message: { cls: "bg-content-faint", label: "Message" },
  routine: { cls: "bg-content-faint", label: "Answered" },
};

// Legend order: the two outcomes a client cares about most, then the rest.
const LEGEND: { outcome: CallOutcome; label: string }[] = [
  { outcome: "booked", label: "Booked" },
  { outcome: "emergency", label: "Emergency" },
  { outcome: "transferred", label: "Transferred" },
  { outcome: "message", label: "Message" },
];

export default function DayLineStrip({
  calls,
  nowMs,
}: {
  calls: CallRow[];
  /** Server-generated timestamp — the window is [now − 24h, now]. */
  nowMs: number;
}) {
  const start = nowMs - WINDOW_MS;
  const today = calls
    .filter((c) => new Date(c.created_at).getTime() >= start)
    .map((c) => {
      const t = new Date(c.created_at).getTime();
      return {
        id: c.id,
        // Clamp so a row a few ms outside the window still lands on the rail.
        pct: Math.min(100, Math.max(0, ((t - start) / WINDOW_MS) * 100)),
        outcome: outcomeOf(c),
        at: c.created_at,
        who: c.caller_name || "Unknown caller",
      };
    });

  return (
    <section className="rounded-lg border border-line-default bg-surface-raised p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-content-secondary">
          Your last 24 hours
        </h3>
        <span className="text-xs text-content-tertiary">
          {today.length} call{today.length === 1 ? "" : "s"}
        </span>
      </div>

      {today.length === 0 ? (
        <p className="mt-5 text-sm text-content-tertiary">
          No calls in the last 24 hours. Every one that comes in lands here the
          moment your line catches it.
        </p>
      ) : (
        <>
          {/* The rail. Ticks are decorative; the sr-only table below carries the
              data. Track lines mark the quarter-day boundaries as quiet
              orientation, nothing more. */}
          <div
            aria-hidden
            className="relative mt-6 h-12 rounded-md bg-surface-inset"
          >
            <div className="absolute inset-y-0 left-1/4 w-px bg-line-subtle" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-line-subtle" />
            <div className="absolute inset-y-0 left-3/4 w-px bg-line-subtle" />
            {today.map((t) => (
              <span
                key={t.id}
                className={`absolute top-2 bottom-2 w-1 -translate-x-1/2 rounded-full ${TICK[t.outcome].cls}`}
                style={{ left: `${t.pct}%` }}
                title={`${fmt(t.at)} — ${TICK[t.outcome].label}`}
              />
            ))}
          </div>
          <div
            aria-hidden
            className="mt-1.5 flex justify-between text-2xs text-content-faint"
          >
            <span>24h ago</span>
            <span>now</span>
          </div>

          {/* Legend — color + word, so a tick is never color-alone. */}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGEND.map((l) => (
              <li
                key={l.outcome}
                className="inline-flex items-center gap-1.5 text-2xs text-content-tertiary"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${TICK[l.outcome].cls}`}
                />
                {l.label}
              </li>
            ))}
          </ul>

          <table className="sr-only">
            <caption>Calls in the last 24 hours, in order</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Caller</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {today.map((t) => (
                <tr key={t.id}>
                  <th scope="row">{fmt(t.at)}</th>
                  <td>{t.who}</td>
                  <td>{TICK[t.outcome].label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
