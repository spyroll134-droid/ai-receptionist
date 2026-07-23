"use client";

import { useState, useTransition } from "react";
import { setLeadStatus } from "@/app/actions/portal";
import { prettyPhone } from "@/lib/phone";
import { Panel } from "./Panel";
import { type CallRow } from "./dash";

// The close-the-loop queue. FollowUpQueue chases leads that haven't been
// reached; this one closes out jobs that were put on the calendar and have
// since come and gone. A `scheduled` lead older than RECONCILE_AFTER_DAYS
// (see needsReconcile) has almost certainly happened or fallen through, and
// only the owner knows which — so we ask, once, with two taps.
//
// Why this matters beyond tidiness: won/lost is the only real revenue signal
// the product ever gets. Everything upstream is estimated (booked × average
// ticket). Nothing automated can watch money change hands offline, so if the
// owner never marks outcomes, the pipeline's most valuable column stays empty
// forever. This queue is the prompt that fills it.
//
// Marking won or lost does NOT move the revenue hero — that reads the `booked`
// flag, which is untouched here — so confirming outcomes can never regress the
// headline number to $0. It just files the job where it belongs.
//
// This component owns its own Panel and its own presence. When there is nothing
// to confirm on a fresh load it renders NOTHING — a queue that sits at zero all
// day teaches the owner to ignore it, and its absence is itself the "all caught
// up" signal. But the instant the owner clears the LAST item, the server
// revalidates and would otherwise yank the whole panel out from under the tap —
// no confirmation, just a vanish that reads as "did my click even register?".
// So once it has shown work this session (`everHad`), it stays put and shows a
// short "all caught up" beat instead of disappearing mid-interaction. The clean
// steady state returns on the next visit.

function bookedAgo(ts: string, nowMs: number) {
  const days = Math.floor((nowMs - new Date(ts).getTime()) / 86_400_000);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "about a week ago";
  return `about ${weeks} weeks ago`;
}

function Row({
  lead,
  avgTicket,
  nowMs,
  onResolved,
}: {
  lead: CallRow;
  avgTicket: number;
  nowMs: number;
  onResolved: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reach = lead.callback_number || lead.caller_id;

  function resolve(outcome: "won" | "lost") {
    if (pending) return;
    setError(null);
    onResolved(lead.id); // optimistic hide
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, outcome);
      if (res.error) {
        onResolved(lead.id); // toggle back into view — never leave a lie on screen
        setError(res.error);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-content-primary">
            {lead.caller_name || "Unknown caller"}
          </span>
          {prettyPhone(reach) && (
            <span className="truncate font-mono text-2xs text-content-tertiary">
              {prettyPhone(reach)}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-content-tertiary">
          Booked {bookedAgo(lead.created_at, nowMs)} · about $
          {avgTicket.toLocaleString()}
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-critical-text">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("won")}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-positive-line bg-positive-surface px-3 text-xs font-medium text-positive-text transition-colors hover:ring-2 hover:ring-positive-line disabled:opacity-60"
        >
          <span aria-hidden>✓</span> Won
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("lost")}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-default px-3 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary disabled:opacity-60"
        >
          <span aria-hidden>✕</span> Didn&apos;t book
        </button>
      </div>
    </li>
  );
}

export default function ReconcileQueue({
  leads,
  avgTicket,
  nowMs,
}: {
  leads: CallRow[];
  avgTicket: number;
  nowMs: number;
}) {
  // Resolved rows vanish immediately on tap. Kept in local state rather than
  // re-fetched so the confirmation feels instant; the server write reconciles
  // the real row, and a failed write puts the row back (see Row.resolve).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Did the owner just clear an item here? Set the instant they tap Won/Lost,
  // and it survives the resulting revalidation because the parent renders us
  // ungated (same mounted instance, state preserved). That's what lets us hold
  // a "done" beat when the last item clears instead of the panel evaporating
  // under their finger. Resets on a full reload — clean steady state next visit.
  const [cleared, setCleared] = useState(false);

  const toggle = (id: string) => {
    setCleared(true);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = leads.filter((c) => !hidden.has(c.id));

  // Nothing to confirm and the owner didn't just clear the last one here:
  // render nothing at all (a queue idling at zero teaches the eye to skip it).
  if (visible.length === 0 && !cleared) return null;

  return (
    <div id="reconcile" className="mt-4 scroll-mt-16">
      <Panel
        title="Confirm job outcomes"
        action={
          visible.length > 0 ? (
            <span className="text-2xs text-content-faint">
              {visible.length} {visible.length === 1 ? "job" : "jobs"} · oldest
              first
            </span>
          ) : undefined
        }
      >
        {visible.length > 0 ? (
          <ul className="divide-y divide-line-subtle">
            {visible.map((c) => (
              <Row
                key={c.id}
                lead={c}
                avgTicket={avgTicket}
                nowMs={nowMs}
                onResolved={toggle}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-content-secondary">
            <span aria-hidden className="text-positive-text">
              ✓{" "}
            </span>
            All caught up — every booked job is filed.{" "}
            <a
              href="/portal/outcomes"
              className="font-medium text-accent-text underline-offset-2 hover:underline"
            >
              See them in Outcomes →
            </a>
          </p>
        )}
      </Panel>
    </div>
  );
}
