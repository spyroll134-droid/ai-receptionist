// The one number the invoice has to justify: the estimated value of the jobs
// the AI line booked. Given hero weight (~text-5xl) and its own block, not one
// of four equal tiles — this is the retention argument.
//
// Deliberately labelled "Est. value of jobs booked", NOT "revenue captured":
// it's booked × the owner's own average ticket, an estimate, never reconciled
// money. The corpus records that the inflated "captured/protected" framing was
// removed on purpose (SCOPE.md); the mockup's wording loses to that here.
//
// Zero state: on day one nothing is booked, and a big green $0 reads as "this
// earns you nothing." So at zero the number goes quiet and the subtext points
// forward instead of celebrating.

export default function PortalHero({
  value,
  booked,
  avgTicket,
  callsCaught,
  delta,
  periodLabel,
}: {
  /** Estimated dollars: booked × avgTicket. */
  value: number;
  booked: number;
  avgTicket: number;
  /** Connected calls in the period — the "calls you'd have missed" count. */
  callsCaught: number;
  /** Percent change vs the previous period, or null when there's no baseline. */
  delta: number | null;
  periodLabel: string;
}) {
  const live = value > 0;

  return (
    <section className="rounded-lg border border-line-default bg-surface-raised px-5 py-6 sm:px-6 sm:py-7">
      <div className="flex items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-content-tertiary">
          Est. value of jobs booked
        </span>
        {live && delta !== null && <DeltaBadge delta={delta} />}
        {live && delta === null && (
          <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-2xs font-medium text-content-tertiary ring-1 ring-line-default">
            New this {periodLabel}
          </span>
        )}
      </div>

      <div
        className={`mt-2 text-5xl font-semibold leading-none ${
          live ? "text-positive-text" : "text-content-primary"
        }`}
      >
        ${value.toLocaleString()}
      </div>

      {live ? (
        <p className="mt-3 text-sm text-content-secondary">
          {booked} {booked === 1 ? "job" : "jobs"} booked × $
          {avgTicket.toLocaleString()} average job
          {callsCaught > 0 && (
            <span className="text-content-tertiary">
              {" "}
              · from {callsCaught} call{callsCaught === 1 ? "" : "s"} you&apos;d
              have missed
            </span>
          )}
        </p>
      ) : (
        <p className="mt-3 max-w-prose text-sm text-content-secondary">
          Your line is live and answering every call. The estimated value of your
          first booked job shows up right here.
        </p>
      )}
    </section>
  );
}

// ▲/▼ + a word, never color alone — critical/positive are separable but the
// arrow + sign carries the meaning without hue, same rule as the badges.
function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-2xs font-medium text-content-tertiary ring-1 ring-line-default">
        Flat vs last period
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${
        up
          ? "bg-positive-surface text-positive-text ring-positive-line"
          : "bg-surface-overlay text-content-secondary ring-line-default"
      }`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {up ? "+" : ""}
      {delta}% vs last period
    </span>
  );
}
