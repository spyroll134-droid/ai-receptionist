"use client";

import { useState, useTransition } from "react";
import { setLeadStatus, type LeadStatus as LeadStatusValue } from "@/app/actions/portal";

// The one control that turns the call log into a CRM: where a lead is in the
// owner's pipeline. Rendered in the expanded call row and in the follow-up
// queue, so both places write the same way.
//
// Why these five, and why won/lost are hand-set: `new`, `contacted` and
// `scheduled` describe what happened on the call, and the AI seeds them at
// intake (supabase/lead-lifecycle.sql). `won` and `lost` describe what
// happened AFTER — money changing hands offline — which no system can observe.
// Marking them is the one judgement only the owner can make, so the control
// makes them a deliberate tap, never a default the dashboard drifts into.

const OPTIONS: {
  key: LeadStatusValue;
  label: string;
  glyph: string;
  // Tone is backup to the word, never the only signal (the red/amber pair
  // collides under deuteranopia — measured — so every state is also a word).
  tone: "neutral" | "accent" | "positive" | "muted";
}[] = [
  { key: "new", label: "New", glyph: "•", tone: "neutral" },
  { key: "contacted", label: "Contacted", glyph: "↩", tone: "neutral" },
  { key: "scheduled", label: "Scheduled", glyph: "◷", tone: "accent" },
  { key: "won", label: "Won", glyph: "✓", tone: "positive" },
  // DB value stays "lost"; the owner-facing word is "Didn't book" — a captured
  // lead that didn't close is not a job lost (without this line the call went to
  // voicemail and they'd never have seen it). Same reframe as the Outcomes tab.
  { key: "lost", label: "Didn't book", glyph: "✕", tone: "muted" },
];

function toneClass(tone: string, active: boolean) {
  if (!active) {
    return "border-line-default text-content-tertiary hover:border-line-strong hover:text-content-primary";
  }
  switch (tone) {
    case "positive":
      return "border-positive-line bg-positive-surface text-positive-text";
    case "accent":
      return "border-accent-line bg-accent-surface text-accent-text";
    case "muted":
      return "border-line-strong bg-surface-overlay text-content-secondary";
    default:
      return "border-content-tertiary bg-surface-overlay text-content-primary";
  }
}

export default function LeadStatus({
  callId,
  value,
  compact = false,
}: {
  callId: string;
  value: LeadStatusValue;
  /** Drops the "Lead status" label — used inline in the follow-up queue. */
  compact?: boolean;
}) {
  const [current, setCurrent] = useState<LeadStatusValue>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: LeadStatusValue) {
    if (next === current || pending) return;
    const previous = current;
    setError(null);
    setCurrent(next); // optimistic
    startTransition(async () => {
      const res = await setLeadStatus(callId, next);
      if (res.error) {
        setCurrent(previous); // revert on failure — never leave a lie on screen
        setError(res.error);
      }
    });
  }

  return (
    <div className={compact ? "" : "mt-4"}>
      {!compact && (
        <div className="mb-2 text-2xs font-semibold uppercase text-content-tertiary">
          Lead status
        </div>
      )}
      <div
        role="group"
        aria-label="Lead status"
        className="flex flex-wrap gap-1.5"
      >
        {OPTIONS.map((o) => {
          const active = o.key === current;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => choose(o.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${toneClass(
                o.tone,
                active
              )}`}
            >
              <span aria-hidden>{o.glyph}</span>
              {o.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-critical-text">
          {error}
        </p>
      )}
    </div>
  );
}
