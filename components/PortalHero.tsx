import Link from "next/link";

// The one number the invoice has to justify. Two rules decide its whole shape:
//
// 1. THE COUNT IS THE TRUTH, THE DOLLARS ARE THE TRANSLATION. The hero number
//    is jobs *won* — a count the owner can verify call by call and cannot
//    argue with. The money sits underneath as an explicitly estimated figure,
//    because it is the won count times the owner's OWN average ticket. Naming
//    him as the source of the multiplier ("you set this") is what keeps it from
//    reading as our marketing claim; nobody disputes their own arithmetic.
//
// 2. ONLY WON COUNTS AS MONEY. `booked` means the AI put an arrival window on
//    the books — a promise, not a sale. Booked jobs appear as a separate
//    pipeline line, never folded into the headline. Keyed on `lead_status`
//    alone so booked+won cannot double-count.
//
// Degradation matters more than the happy path here. On day one nothing is won,
// and a giant "0 jobs won" reads as "this earns you nothing" — the exact
// opposite of the message. So the hero steps down: won → scheduled (with a
// prompt to close them out) → answering. It only ever shows a zero when there
// is genuinely nothing to show.

export default function PortalHero({
  won,
  wonValue,
  scheduled,
  scheduledValue,
  avgTicket,
  ticketIsOwn,
  callsCaught,
  delta,
  periodLabel,
}: {
  /** Jobs with lead_status = 'won' in the period — the headline count. */
  won: number;
  /** won × avgTicket. An estimate, always labelled as one. */
  wonValue: number;
  /** Booked and still open. Pipeline, never revenue. */
  scheduled: number;
  scheduledValue: number;
  avgTicket: number;
  /** True when the owner set their own average ticket rather than the trade default. */
  ticketIsOwn: boolean;
  /** Connected calls in the period — the "calls you'd have missed" count. */
  callsCaught: number;
  /** Percent change in *won* vs the previous period, or null when there's no baseline. */
  delta: number | null;
  periodLabel: string;
}) {
  const stage = won > 0 ? "won" : scheduled > 0 ? "scheduled" : "answering";

  return (
    <section className="rounded-lg border border-line-default bg-surface-raised px-5 py-6 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-content-tertiary">
          {stage === "scheduled" ? "Jobs on the books" : "Jobs won"}
        </span>
        {stage === "won" && delta !== null && <DeltaBadge delta={delta} />}
        {stage === "won" && delta === null && (
          <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-2xs font-medium text-content-tertiary ring-1 ring-line-default">
            New this {periodLabel}
          </span>
        )}
      </div>

      {stage === "answering" ? (
        <>
          <div className="mt-2 text-5xl font-semibold leading-none text-content-primary">
            0
          </div>
          <p className="mt-3 max-w-prose text-sm text-content-secondary">
            Your line is live and answering every call. The first job it books
            for you shows up right here.
          </p>
        </>
      ) : (
        <>
          <div
            className={`mt-2 flex items-baseline gap-2 leading-none ${
              stage === "won" ? "text-positive-text" : "text-content-primary"
            }`}
          >
            <span className="text-5xl font-semibold tabular-nums">
              {stage === "won" ? won : scheduled}
            </span>
            <span className="text-lg font-medium">
              {stage === "won"
                ? won === 1
                  ? "job won"
                  : "jobs won"
                : scheduled === 1
                  ? "job scheduled"
                  : "jobs scheduled"}
            </span>
          </div>

          {/* The money line. Always prefixed with ≈ and the word "estimated" —
              it is a multiplication, not a reconciled figure, and saying so is
              what earns the right to show a number this big. */}
          <p className="mt-3 text-sm text-content-secondary">
            <span className="font-medium text-content-primary tabular-nums">
              ≈ ${(stage === "won" ? wonValue : scheduledValue).toLocaleString()}
            </span>{" "}
            estimated, at your ${avgTicket.toLocaleString()} average job
            {ticketIsOwn ? (
              <span className="text-content-tertiary"> · you set this</span>
            ) : (
              <>
                {" "}
                <Link
                  href="/portal/settings"
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  set your own →
                </Link>
              </>
            )}
          </p>

          {callsCaught > 0 && (
            <p className="mt-1 text-sm text-content-tertiary">
              from {callsCaught} call{callsCaught === 1 ? "" : "s"} you&apos;d
              have missed
            </p>
          )}
        </>
      )}

      {/* Pipeline sits below the fold of the headline, visually quieter, and
          only when there is something in it. On the "scheduled" step it would
          just restate the hero, so it's suppressed there. */}
      {stage === "won" && scheduled > 0 && (
        <Link
          href="/portal/bookings"
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line-subtle pt-3 text-xs transition-colors hover:text-content-primary"
        >
          <span aria-hidden className="text-content-tertiary">
            ◷
          </span>
          <span className="text-content-secondary">
            <strong className="font-semibold tabular-nums">{scheduled}</strong>{" "}
            more on the books · ≈${scheduledValue.toLocaleString()} not counted
            yet
          </span>
          <span aria-hidden className="ml-auto text-content-faint">
            →
          </span>
        </Link>
      )}

      {stage === "scheduled" && (
        <Link
          href="/portal/bookings"
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line-subtle pt-3 text-xs transition-colors hover:text-content-primary"
        >
          <span className="text-content-secondary">
            Mark which ones closed and this becomes your jobs-won total
          </span>
          <span aria-hidden className="ml-auto text-content-faint">
            →
          </span>
        </Link>
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
