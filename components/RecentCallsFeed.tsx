"use client";

import { useState } from "react";
import { StatusBadges, fmt, type CallRow } from "./dash";

// The trust layer. Numbers tell the owner the line is working; this is where
// they see it — the most recent calls, each with the AI's one-line summary and,
// one tap away, the recording and the full transcript. This is what turns "the
// dashboard says 3 booked" into "I listened to the call myself."
//
// Listen/Transcript reveal inline and lazily: the audio element is only mounted
// when the owner asks for it (preload="none" on top of that), so a feed of
// eight calls doesn't fetch eight recordings on load. The recording src goes
// through /api/recording, which mints a short-lived presigned URL behind the
// session — the raw R2 url would 400.

export default function RecentCallsFeed({
  calls,
  avgTicket,
}: {
  calls: CallRow[];
  avgTicket: number;
}) {
  return (
    <ul className="divide-y divide-line-subtle">
      {calls.map((c) => (
        <FeedRow key={c.id} c={c} avgTicket={avgTicket} />
      ))}
    </ul>
  );
}

function FeedRow({ c, avgTicket }: { c: CallRow; avgTicket: number }) {
  const [open, setOpen] = useState<"none" | "listen" | "transcript">("none");
  const toggle = (which: "listen" | "transcript") =>
    setOpen((cur) => (cur === which ? "none" : which));

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadges c={c} fallback="routine" />
            <span className="truncate font-medium text-content-primary">
              {c.caller_name || "Unknown caller"}
            </span>
            <span className="text-2xs text-content-faint">{fmt(c.created_at)}</span>
          </div>
          {c.summary && (
            <p className="mt-1.5 line-clamp-2 text-sm text-content-secondary">
              {c.summary}
            </p>
          )}
        </div>

        {c.booked && (
          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-positive-text">
            ~${avgTicket.toLocaleString()}
          </span>
        )}
      </div>

      {/* Proof, on demand. Rendered only when there's something to play or read,
          so a call with neither shows no dead buttons. */}
      {(c.recording_url || c.transcript) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {c.recording_url && (
            <button
              type="button"
              aria-expanded={open === "listen"}
              onClick={() => toggle("listen")}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-default px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
            >
              <span aria-hidden>▶</span> Listen
            </button>
          )}
          {c.transcript && (
            <button
              type="button"
              aria-expanded={open === "transcript"}
              onClick={() => toggle("transcript")}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-default px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
            >
              <span aria-hidden>≡</span> Transcript
            </button>
          )}
        </div>
      )}

      {open === "listen" && c.recording_url && (
        <audio
          controls
          preload="none"
          src={`/api/recording/${c.id}`}
          className="mt-2.5 h-9 w-full max-w-md"
        />
      )}
      {open === "transcript" && c.transcript && (
        <pre className="mt-2.5 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-line-subtle bg-surface-inset p-3 font-mono text-xs leading-relaxed text-content-secondary">
          {c.transcript}
        </pre>
      )}
    </li>
  );
}
