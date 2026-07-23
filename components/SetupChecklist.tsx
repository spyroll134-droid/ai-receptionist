import Link from "next/link";

// The activation card. Nudges the owner to finish the few settings that make
// the rest of the dashboard accurate — but ONLY things the product actually
// does. No "connect your calendar" (there is no calendar integration; SCOPE.md)
// and nothing that implies a capability we don't ship.
//
// Every incomplete item links to where it's done. Once everything's set the
// card collapses to a single quiet "all set" line rather than nagging with a
// wall of checkmarks.

type Item = { label: string; done: boolean; href: string; optional?: boolean };

export default function SetupChecklist({
  avgTicketSet,
  alertRetriesSet,
  voicemailSet,
}: {
  /** avg_ticket_dollars overridden (vs the trade default). */
  avgTicketSet: boolean;
  /** alert_retries chosen (vs the default). */
  alertRetriesSet: boolean;
  /** At least one number routed to voicemail — optional, not everyone needs it. */
  voicemailSet: boolean;
}) {
  const items: Item[] = [
    {
      label: "Set your average job value",
      done: avgTicketSet,
      href: "/portal/settings",
    },
    {
      label: "Choose emergency call-back retries",
      done: alertRetriesSet,
      href: "/portal/settings",
    },
    {
      label: "Route any personal numbers to voicemail",
      done: voicemailSet,
      href: "/portal/settings",
      optional: true,
    },
  ];

  // Optional items don't count against "all done" — the required ones do.
  const required = items.filter((i) => !i.optional);
  const allRequiredDone = required.every((i) => i.done);

  if (allRequiredDone) {
    return (
      <section className="rounded-lg border border-line-default bg-surface-raised px-4 py-3">
        <p className="text-xs text-content-tertiary">
          <span className="text-positive-text" aria-hidden>
            ✓{" "}
          </span>
          You&apos;re set up. Adjust anything in{" "}
          <Link
            href="/portal/settings"
            className="font-medium text-accent-text hover:text-content-primary"
          >
            Settings
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line-default">
      <div className="flex h-10 items-center border-b border-line-subtle bg-surface-raised px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
          Finish setting up
        </h2>
      </div>
      <ul className="divide-y divide-line-subtle">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden
              className={
                i.done ? "text-positive-text" : "text-content-faint"
              }
            >
              {i.done ? "✓" : "○"}
            </span>
            <span
              className={`flex-1 text-sm ${
                i.done ? "text-content-tertiary line-through" : "text-content-primary"
              }`}
            >
              {i.label}
              {i.optional && !i.done && (
                <span className="ml-1.5 text-2xs uppercase tracking-wide text-content-faint">
                  optional
                </span>
              )}
            </span>
            {!i.done && (
              <Link
                href={i.href}
                className="text-xs font-medium text-accent-text hover:text-content-primary"
              >
                Set up →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
