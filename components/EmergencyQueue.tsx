"use client";

import { useState, useTransition } from "react";
import { acknowledgeEmergency } from "@/app/actions/portal";
import { fmt, speedToLead, type CallRow } from "@/components/dash";
import { prettyPhone } from "@/lib/phone";

// The emergencies-waiting queue. Built compact-first so it scans whether one
// fire is burning or six: each open emergency is a single tight row — who,
// number, one line of what's happening, Call back, and a quiet "mark handled".
// The full escalation trace (how we reached you, how fast) is the differentiator
// and the liability record, but it's NOT what you need mid-triage, so it's
// tucked behind a per-row expand instead of shoved in your face.
//
// "Open" = an emergency nobody has reached yet (the parent filters to
// !transferred && !booked && !acknowledged_at). Marking handled acknowledges it
// (acknowledge_emergency, supabase/emergency-ack.sql) — a deliberate tap, never
// auto-fired by Call back, so the timestamp means "I actually took this".

type RungTone = "critical" | "positive" | "neutral";

function Rung({
  glyph,
  label,
  detail,
  tone = "neutral",
  last,
}: {
  glyph: string;
  label: string;
  detail?: string;
  tone?: RungTone;
  last?: boolean;
}) {
  const dot =
    tone === "critical"
      ? "text-critical-text"
      : tone === "positive"
        ? "text-positive-text"
        : "text-content-tertiary";
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span aria-hidden className={`text-sm leading-5 ${dot}`}>
          {glyph}
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-line-default" />}
      </div>
      <div className={`min-w-0 ${last ? "" : "pb-3"}`}>
        <div className="text-sm text-content-primary">{label}</div>
        {detail && (
          <div className="mt-0.5 text-xs text-content-tertiary">{detail}</div>
        )}
      </div>
    </li>
  );
}

function EmergencyRow({ call }: { call: CallRow }) {
  const [expanded, setExpanded] = useState(false);
  // Optimistic hide on "mark handled". The server action revalidates /portal,
  // which drops the row for good (acknowledged_at is now set); until that
  // returns we hide locally so the tap feels instant. A failed write un-hides
  // the row and surfaces the error — never leave a lie on screen.
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reach = call.callback_number || call.caller_id;
  const method = call.owner_notify_method ?? "";
  const calledPhone = method.includes("voice");
  const emailed = method.includes("email");
  const speed = speedToLead(call);

  function markHandled() {
    if (pending) return;
    setError(null);
    setHidden(true);
    startTransition(async () => {
      const res = await acknowledgeEmergency(call.id);
      if (res.error) {
        setHidden(false);
        setError(res.error);
      }
    });
  }

  if (hidden) return null;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide how we reached you" : "Show how we reached you"}
          className="mt-0.5 flex-none rounded text-content-tertiary transition-colors hover:text-content-primary"
        >
          <span
            aria-hidden
            className={`inline-block text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▸
          </span>
        </button>

        <span aria-hidden className="mt-0.5 flex-none text-critical-text">
          ▲
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-medium text-content-primary">
              {call.caller_name || "Unknown caller"}
            </span>
            {prettyPhone(reach) && (
              <span className="truncate font-mono text-2xs text-content-tertiary">
                {prettyPhone(reach)}
              </span>
            )}
          </div>
          {call.summary && (
            <p className="mt-0.5 line-clamp-1 text-xs text-content-secondary">
              {call.summary}
            </p>
          )}
        </div>

        <div className="flex flex-none items-center gap-1.5">
          {reach && (
            <a
              href={`tel:${reach}`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-critical-line bg-critical-surface px-2.5 text-xs font-medium text-critical-text transition-shadow hover:ring-2 hover:ring-critical-line"
            >
              <span aria-hidden>☎</span>
              <span className="hidden sm:inline">Call back</span>
            </a>
          )}
          <button
            type="button"
            onClick={markHandled}
            disabled={pending}
            title="Mark handled — clears this alert and logs that you took it"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-default px-2.5 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary disabled:opacity-50"
          >
            <span aria-hidden>✓</span>
            <span className="hidden sm:inline">Handled</span>
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-1.5 pl-8 text-xs text-critical-text">
          {error}
        </p>
      )}

      {/* On-demand escalation trace — the proof of how we reached you and how
          fast, kept out of the way until you ask for it. Only truthful rungs
          render (we store the notify method, a connected transfer, and the
          alert time), so a rung is never drawn for a step we can't stand behind. */}
      {expanded && (
        <ol className="mt-3 pl-8">
          <Rung
            glyph="▲"
            tone="critical"
            label="Emergency came in"
            detail={fmt(call.created_at)}
          />
          {call.transferred_to_owner && (
            <Rung
              glyph="✓"
              tone="positive"
              label="Connected to you live on the call"
            />
          )}
          {calledPhone && (
            <Rung glyph="☎" label="Called your phone with the details" />
          )}
          {emailed && <Rung glyph="✉" label="Emailed you the full intake" />}
          {speed && (
            <Rung
              glyph="◔"
              label={`Alert reached you in ${speed.label}`}
              detail="From the moment the call landed"
            />
          )}
          <Rung
            glyph="○"
            label="Waiting on you — nobody has reached this caller yet"
            last
          />
        </ol>
      )}
    </li>
  );
}

export default function EmergencyQueue({ calls }: { calls: CallRow[] }) {
  if (calls.length === 0) return null;
  const n = calls.length;

  return (
    <div className="overflow-hidden rounded-lg border border-critical-line">
      {/* Loud header — this is the on-fire signal, so it carries the count and
          the urgency in one line. The list below is the triage surface. */}
      <div className="flex items-center gap-2 border-b border-critical-line bg-critical-surface px-4 py-2.5 text-sm">
        <span aria-hidden className="text-critical-text">
          ▲
        </span>
        <span className="text-content-primary">
          <strong className="font-semibold tabular-nums">{n}</strong>{" "}
          {n === 1 ? "emergency" : "emergencies"} waiting on a callback — no one
          has reached {n === 1 ? "them" : "these callers"} yet.
        </span>
      </div>
      <ul className="divide-y divide-line-subtle">
        {calls.map((c) => (
          <EmergencyRow key={c.id} call={c} />
        ))}
      </ul>
    </div>
  );
}
