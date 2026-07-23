"use client";

import { useActionState, useState } from "react";
import { updateAlertRetries } from "@/app/actions/portal";

// Settings-page control for how many times the emergency alert re-rings the
// owner after an unanswered call. Two radios + Save rather than save-on-click:
// this changes how a 2am emergency reaches them, so the commit should be
// deliberate, and the action result gives us a truthful "Saved" to announce.

export default function AlertRetriesPicker({
  retries,
}: {
  /** Current clients.alert_retries value (1 or 2). */
  retries: number;
}) {
  const [selected, setSelected] = useState(retries === 1 ? 1 : 2);
  const [state, formAction, pending] = useActionState(
    updateAlertRetries,
    undefined
  );

  const options = [
    {
      value: 1,
      label: "Call me back once",
      detail: "2 calls total if you don't pick up",
    },
    {
      value: 2,
      label: "Call me back twice",
      detail: "3 calls total if you don't pick up",
    },
  ];

  return (
    <form action={formAction}>
      <fieldset className="space-y-2">
        <legend className="sr-only">
          Emergency alert call-back attempts
        </legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-baseline gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
              selected === o.value
                ? "border-accent bg-accent-surface"
                : "border-line-default hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="alert_retries"
              value={o.value}
              checked={selected === o.value}
              onChange={() => setSelected(o.value)}
              className="translate-y-0.5 accent-[var(--color-accent)]"
            />
            <span className="text-sm font-medium text-content-primary">
              {o.label}
            </span>
            <span className="text-xs text-content-tertiary">{o.detail}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selected === retries}
          className="rounded-md bg-accent-button px-4 py-2 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-button-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {/* Derived from the action result, never assumed — same stance as the
            password-reset form. Cleared visually the moment they pick a new
            value (selected !== retries re-enables Save). */}
        <span role="status" aria-live="polite" className="text-xs">
          {state?.error ? (
            <span className="text-critical-text">{state.error}</span>
          ) : state?.ok && selected === retries ? (
            <span className="text-positive-text">Saved</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
