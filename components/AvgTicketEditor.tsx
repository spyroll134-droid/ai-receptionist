"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateAvgTicket } from "@/app/actions/portal";

// The sub-line of the "Revenue protected" tile, editable in place. The dollar
// figure is the client's own assumption about their business, so they get to
// set it — a number they chose is credible, a number we chose is arguable.

export default function AvgTicketEditor({
  booked,
  avgTicket,
  isOverride,
}: {
  /**
   * Booked calls the figure is multiplied by. Omitted on the settings page,
   * where there is no call list in scope — passing 0 there rendered a
   * permanent "0 booked × $6,000 avg job", so the client edited the input to
   * a revenue number while being shown zero. With it absent we state the rate
   * on its own instead of previewing a total we can't compute.
   */
  booked?: number;
  avgTicket: number;
  // Whether avg_ticket_dollars is set on their row (vs the trade default).
  isOverride: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState(
    updateAvgTicket,
    undefined
  );

  // Close the editor once the action reports success. Adjusting state during
  // render rather than in an effect — React's sanctioned pattern for deriving
  // state, and the same one used in CallTable.tsx. `handled` tracks the result
  // object we've already reacted to, so re-opening the editor after a save
  // doesn't immediately close it again on the next render.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state?.ok) {
      setEditing(false);
      setJustSaved(true);
    }
  }

  // When the editor closes on save, the Save button it was on unmounts and
  // focus falls to <body> — a keyboard or screen-reader user loses their
  // place. Return focus to the trigger they opened it from. The aria-live
  // region below is what actually announces the save.
  useEffect(() => {
    if (justSaved && !editing) editBtnRef.current?.focus();
  }, [justSaved, editing]);

  if (!editing) {
    return (
      <span>
        {booked != null && `${booked} booked × `}${avgTicket.toLocaleString()}{" "}
        avg job
        {!isOverride && " (industry avg)"}
        {" · "}
        <button
          ref={editBtnRef}
          type="button"
          onClick={() => {
            setJustSaved(false);
            setEditing(true);
          }}
          className="underline decoration-dotted underline-offset-2 transition-colors hover:text-content-primary"
        >
          edit
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {justSaved
            ? `Average job value saved: $${avgTicket.toLocaleString()}.`
            : ""}
        </span>
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
