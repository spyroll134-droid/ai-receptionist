"use client";

import { useActionState, useEffect, useState } from "react";
import { updateAvgTicket } from "@/app/actions/portal";

// The sub-line of the "Revenue protected" tile, editable in place. The dollar
// figure is the client's own assumption about their business, so they get to
// set it — a number they chose is credible, a number we chose is arguable.

export default function AvgTicketEditor({
  booked,
  avgTicket,
  isOverride,
}: {
  booked: number;
  avgTicket: number;
  // Whether avg_ticket_dollars is set on their row (vs the trade default).
  isOverride: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateAvgTicket,
    undefined
  );

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <span>
        {booked} booked × ${avgTicket.toLocaleString()} avg job
        {!isOverride && " (industry avg)"}
        {" · "}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="underline decoration-dotted underline-offset-2 transition-colors hover:text-content-primary"
        >
          edit
        </button>
      </span>
    );
  }

  return (
    <form action={formAction} className="mt-1 flex items-center gap-1.5">
      <span aria-hidden>$</span>
      <input
        name="avg_ticket"
        inputMode="numeric"
        defaultValue={isOverride ? avgTicket : ""}
        placeholder={String(avgTicket)}
        autoFocus
        aria-label="Average job value in dollars"
        className="w-20 rounded border border-line-default bg-surface-base px-1.5 py-0.5 text-xs text-content-primary outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-default px-1.5 py-0.5 transition-colors hover:text-content-primary"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="transition-colors hover:text-content-primary"
      >
        Cancel
      </button>
      {state?.error && (
        <span role="alert" className="text-critical-text">
          {state.error}
        </span>
      )}
    </form>
  );
}
