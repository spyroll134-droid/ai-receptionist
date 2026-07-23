"use client";

import { Fragment, useMemo, useState } from "react";
import {
  StatusBadges,
  fmt,
  isAfterHours,
  looksPersonal,
  needsFollowUp,
  type CallRow,
} from "./dash";
import { prettyPhone, telHref, smsHref } from "@/lib/phone";
import { isUnnotified } from "@/lib/notified";
import { markFollowedUp } from "@/app/actions/portal";
import VoicemailToggle from "./VoicemailToggle";
import LeadStatus from "./LeadStatus";

// The client's system of record. A dashboard stops feeling like a toy the
// moment the data can be interrogated — searched, filtered, sorted, and taken
// with you. Everything here runs client-side over the rows the server already
// fetched, so filtering is instant and costs no round trip.

type SortKey = "created_at" | "caller_name" | "status" | "value";
type SortDir = "asc" | "desc";
type RangeKey = "7d" | "30d" | "90d" | "all";
type StatusKey =
  | "all"
  | "needs_followup"
  | "emergency"
  | "booked"
  | "transferred"
  | "after_hours"
  | "missed_notify"
  | "won"
  | "lost";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const STATUSES: { key: StatusKey; label: string }[] = [
  { key: "all", label: "All calls" },
  // Same predicate as the follow-up queue above the log (dash needsFollowUp),
  // so filtering the log to "needs follow-up" shows exactly that queue's leads.
  { key: "needs_followup", label: "Needs follow-up" },
  { key: "emergency", label: "Emergencies" },
  { key: "booked", label: "Booked" },
  // Matches the `transferred` case in filterCalls (lib/ops.ts) — the badge is
  // rendered, so it has to be filterable too.
  { key: "transferred", label: "Transferred" },
  { key: "after_hours", label: "After-hours" },
  { key: "missed_notify", label: "Never notified" },
  // Closed dispositions. The Outcomes tab is the full ledger; these exist so
  // the log itself can also answer "which of these calls did I win?"
  { key: "won", label: "✓ Won" },
  { key: "lost", label: "✕ Lost" },
];

/**
 * "2h ago" / "3d ago" — precise timestamp stays available on hover.
 * Takes `nowMs` rather than reading the clock: this renders on the server
 * first, and a second clock read on the client would hydrate to different
 * text ("2h ago" vs "3h ago") and mismatch.
 */
function relative(ts: string, nowMs: number) {
  const diff = nowMs - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Ranked to match the badge order rendered below, so sorting by Status groups
// rows the same way the eye already groups them.
function statusRank(c: CallRow) {
  if (c.emergency) return 4;
  if (c.booked) return 3;
  if (c.transferred_to_owner) return 2;
  if (isAfterHours(c.created_at)) return 1;
  return 0;
}

/** RFC-4180-ish escaping: wrap in quotes, double any inner quote. */
function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export default function CallTable({
  calls,
  avgTicket,
  clientName,
  nowMs,
  voicemailNumbers,
}: {
  calls: CallRow[];
  avgTicket: number;
  clientName: string;
  /** Server-generated timestamp — see `relative()` for why this is a prop. */
  nowMs: number;
  /**
   * Numbers already routed to voicemail, normalized to 10 digits. Omitted on
   * the internal ops dashboard, which has no client session to write as —
   * the toggle only renders when this is provided.
   */
  voicemailNumbers?: string[];
}) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<RangeKey>("30d");
  const [status, setStatus] = useState<StatusKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const cutoff = days ? nowMs - days * 86400_000 : null;
    const q = query.trim().toLowerCase();

    const rows = calls.filter((c) => {
      if (cutoff && new Date(c.created_at).getTime() < cutoff) return false;

      if (status === "needs_followup" && !needsFollowUp(c)) return false;
      if (status === "emergency" && !c.emergency) return false;
      if (status === "booked" && !c.booked) return false;
      if (status === "transferred" && !c.transferred_to_owner) return false;
      if (status === "after_hours" && !isAfterHours(c.created_at)) return false;
      // Same rule the dashboard banner uses (lib/notified), not a looser local
      // one. `!owner_notified_at` alone also matches every call from before
      // Resend was configured and every pocket dial that timed out in silence
      // — rows nothing you click will ever clear. A filter that always has
      // results is indistinguishable from a filter that is broken.
      if (status === "missed_notify" && !isUnnotified(c, nowMs)) return false;
      if (status === "won" && c.lead_status !== "won") return false;
      if (status === "lost" && c.lead_status !== "lost") return false;

      if (!q) return true;
      // Search across everything a person would plausibly remember about a call.
      return [
        c.caller_name,
        c.callback_number,
        c.service_address,
        c.summary,
        c.category,
        c.insurance_carrier,
        // The transcript is the fallback for every call where extraction missed
        // a detail the caller mentioned (a street name, "sump pump") — the ops
        // search covers it (lib/ops.ts), so the portal must too.
        c.transcript,
        c.message_for_owner,
      ]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "caller_name":
          return dir * (a.caller_name ?? "").localeCompare(b.caller_name ?? "");
        case "status":
          return dir * (statusRank(a) - statusRank(b));
        case "value":
          return dir * ((a.booked ? avgTicket : 0) - (b.booked ? avgTicket : 0));
        default:
          return (
            dir *
            (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          );
      }
    });
  }, [calls, query, range, status, sortKey, sortDir, avgTicket, nowMs]);

  // If a filter change excludes the expanded row, drop the expansion —
  // otherwise the stale openId silently collapses the view AND pops the row
  // back open if it's ever re-included. Adjusting state during render is
  // React's sanctioned pattern for deriving state from props/other state.
  if (openId && !filtered.some((c) => c.id === openId)) {
    setOpenId(null);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "caller_name" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const header = [
      "Date",
      "Caller",
      "Callback",
      "Emergency",
      "Booked",
      "Transferred",
      "After hours",
      "Address",
      "Category",
      "Insurance",
      "Arrival window",
      "Owner notified",
      "Summary",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...filtered.map((c) =>
        [
          fmt(c.created_at),
          c.caller_name ?? "",
          prettyPhone(c.callback_number) ?? "",
          c.emergency ? "Yes" : "No",
          c.booked ? "Yes" : "No",
          c.transferred_to_owner ? "Yes" : "No",
          isAfterHours(c.created_at) ? "Yes" : "No",
          c.service_address ?? "",
          c.category ?? "",
          c.insurance_carrier ?? "",
          c.arrival_window ?? "",
          c.owner_notified_at ? fmt(c.owner_notified_at) : "",
          c.summary ?? "",
        ]
          .map(csvCell)
          .join(",")
      ),
    ];
    // BOM so Excel opens UTF-8 correctly — otherwise accented names mangle.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientName.replace(/\s+/g, "-").toLowerCase()}-calls-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasAnyCalls = calls.length > 0;

  return (
    // Rendered inside <Panel title="Call log">, which supplies the header and
    // the framing border. So no card of our own here — a full-bleed table
    // framed by the Panel, with only the toolbar and count row padded in to
    // match the panel header's inset. (Standalone this component would need its
    // own border back; it has exactly one call site — the portal.)
    <section className="pb-4 pt-4">
      {/* ---- Toolbar ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 px-4">
        <div className="relative min-w-55 flex-1">
          <label htmlFor="call-search" className="sr-only">
            Search calls
          </label>
          <input
            id="call-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, address, summary…"
            className="h-10 w-full rounded-lg border border-line-default bg-surface-inset px-3 text-sm text-content-primary placeholder:text-content-faint focus:border-accent focus:outline-none"
          />
        </div>

        <select
          aria-label="Date range"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className="h-10 rounded-lg border border-line-default bg-surface-inset px-3 text-sm text-content-primary focus:border-accent focus:outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusKey)}
          className="h-10 rounded-lg border border-line-default bg-surface-inset px-3 text-sm text-content-primary focus:border-accent focus:outline-none"
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="h-10 rounded-lg border border-line-default bg-surface-raised px-4 text-sm font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <p className="mt-3 px-4 text-xs text-content-tertiary" aria-live="polite">
        {filtered.length} of {calls.length} call{calls.length === 1 ? "" : "s"}
        {query && <> matching “{query}”</>}
      </p>

      {/* ---- Table ------------------------------------------------------ */}
      <div className="mt-3 overflow-hidden border-t border-line-default">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-default text-left">
                {/* Caret column — holds the real disclosure button per row. */}
                <th className="w-0" aria-hidden />
                <Th
                  label="Caller"
                  active={sortKey === "caller_name"}
                  dir={sortDir}
                  onClick={() => toggleSort("caller_name")}
                />
                <Th
                  label="When"
                  active={sortKey === "created_at"}
                  dir={sortDir}
                  onClick={() => toggleSort("created_at")}
                />
                <Th
                  label="Status"
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <th className="px-4 py-3 text-2xs font-semibold uppercase text-content-tertiary">
                  Callback
                </th>
                <Th
                  label="Value"
                  align="right"
                  active={sortKey === "value"}
                  dir={sortDir}
                  onClick={() => toggleSort("value")}
                />
              </tr>
            </thead>

            <tbody>
              {filtered.map((c) => {
                const open = openId === c.id;
                return (
                  // Key belongs on the Fragment — it's the mapped element.
                  <Fragment key={c.id}>
                    <tr
                      // Mouse convenience only — the accessible disclosure is
                      // the caret button in the first cell. The row used to be
                      // role="button" with tabIndex, but it contains links
                      // (the callback number), and a button may not contain
                      // interactive descendants — screen readers couldn't reach
                      // them. The real button carries aria-expanded instead.
                      onClick={() => setOpenId(open ? null : c.id)}
                      className={`cursor-pointer border-b border-line-subtle transition-colors hover:bg-surface-overlay ${
                        open ? "bg-surface-overlay" : ""
                      }`}
                    >
                      <td className="py-3 pl-4 pr-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={
                            open
                              ? `Collapse details for ${c.caller_name || "unknown caller"}`
                              : `Expand details for ${c.caller_name || "unknown caller"}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(open ? null : c.id);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-content-tertiary transition-colors hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <span
                            aria-hidden
                            className={`inline-block transition-transform ${
                              open ? "rotate-90" : ""
                            }`}
                          >
                            ›
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 flex-none rounded-full ${
                              c.emergency ? "bg-critical" : "bg-accent"
                            }`}
                          />
                          <span className="font-medium text-content-primary">
                            {c.caller_name || "Unknown caller"}
                          </span>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-content-secondary"
                        title={fmt(c.created_at)}
                      >
                        {relative(c.created_at, nowMs)}
                      </td>
                      <td className="px-4 py-3">
                        {/* One definition, shared with the internal call log
                            and detail panel (components/dash StatusBadges).
                            The copy that used to live here had drifted: it
                            omitted Transferred, so a transferred emergency —
                            the outcome this product exists to produce — showed
                            up in the portal as "Routine". */}
                        <StatusBadges c={c} fallback="routine" />
                      </td>
                      {/* Tappable, like PhoneLink in ops.tsx. This is read on a
                          phone on a job site, and calling the lead back is the
                          entire point of the row — plain text made the operator
                          retype a number they were already looking at. */}
                      <td className="px-4 py-3 font-mono text-xs text-content-secondary">
                        {(() => {
                          const pretty = prettyPhone(c.callback_number);
                          const href = telHref(c.callback_number);
                          if (!pretty)
                            return <span className="text-content-faint">—</span>;
                          if (!href) return pretty;
                          return (
                            <a
                              href={href}
                              onClick={(e) => e.stopPropagation()}
                              className="underline decoration-dotted underline-offset-2 transition-colors hover:text-content-primary"
                            >
                              {pretty}
                            </a>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right text-content-primary">
                        {c.booked ? `$${avgTicket.toLocaleString()}` : "—"}
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b border-line-subtle">
                        <td colSpan={6} className="bg-surface-inset px-4 py-4">
                          {/* The two things anyone does next with a lead —
                              call them or text them — with the follow-up
                              message pre-written. These lived only in the
                              admin detail panel; the person on the job site
                              who has to make the call got a bare number. */}
                          {(() => {
                            const reach = c.callback_number || c.caller_id;
                            if (!reach) return null;
                            const call = telHref(reach);
                            const text = smsHref(
                              reach,
                              `Hi${
                                c.caller_name
                                  ? ` ${c.caller_name.split(" ")[0]}`
                                  : ""
                              }, this is ${clientName} following up on your call.`,
                            );
                            return (
                              <div className="mb-4 flex gap-2">
                                {call && (
                                  <a
                                    href={call}
                                    // Tapping Call back is the owner working
                                    // the lead, so advance new -> contacted and
                                    // let the follow-up queue drop it. Fire-and-
                                    // forget: the dialer still opens; the RPC
                                    // only moves a lead that's still `new`.
                                    onClick={() => markFollowedUp(c.id)}
                                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent-button px-3 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-button-hover"
                                  >
                                    <span aria-hidden>✆</span> Call back
                                  </a>
                                )}
                                {text && (
                                  <a
                                    href={text}
                                    onClick={() => markFollowedUp(c.id)}
                                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-default px-3 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
                                  >
                                    <span aria-hidden>✉</span> Text
                                  </a>
                                )}
                              </div>
                            );
                          })()}

                          {/* Where this lead sits in the pipeline. Seeded from
                              intake, moved by the owner. This is the write that
                              makes the log a CRM. */}
                          <LeadStatus callId={c.id} value={c.lead_status} />

                          <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
                            {[
                              // Number only. The carrier's caller-name record
                              // was measured as wrong on every number we could
                              // verify, and a stale name shown next to a real
                              // number reads as fact. See scripts/cnam-probe.ts.
                              ["Called from", c.caller_id],
                              ["Address", c.service_address],
                              [
                                "Standing water",
                                c.standing_water == null
                                  ? null
                                  : c.standing_water
                                    ? "Yes"
                                    : "No",
                              ],
                              ["Water category", c.category],
                              ["Insurance", c.insurance_carrier],
                              ["Arrival window", c.arrival_window],
                              [
                                "Owner notified",
                                c.owner_notified_at
                                  ? fmt(c.owner_notified_at)
                                  : "Not sent",
                              ],
                            ].map(([label, val]) => (
                              <div key={label as string} className="flex gap-4">
                                <dt className="w-32 flex-none text-content-tertiary">
                                  {label}
                                </dt>
                                <dd className="text-content-primary">
                                  {(val as string) ?? "—"}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          {/* A non-customer's message is the point of that
                              call — it outranks the generic summary. */}
                          {c.message_for_owner && (
                            <div className="mt-4 rounded-xl border border-caution-line bg-caution-surface p-3.5">
                              <div className="text-2xs font-semibold uppercase text-content-tertiary">
                                Message for you
                              </div>
                              <p className="mt-1 text-sm leading-relaxed text-content-primary">
                                {c.message_for_owner}
                              </p>
                            </div>
                          )}

                          {c.summary && (
                            <p className="mt-4 rounded-xl border border-accent-line bg-accent-surface p-3.5 text-sm leading-relaxed text-content-primary">
                              {c.summary}
                            </p>
                          )}

                          {c.transcript && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-medium text-content-secondary hover:text-content-primary">
                                Full transcript
                              </summary>
                              <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line-subtle bg-surface-base p-3.5 font-mono text-xs leading-relaxed text-content-secondary">
                                {c.transcript}
                              </pre>
                            </details>
                          )}

                          {c.recording_url && (
                            // Not c.recording_url — that's a private R2 object
                            // and won't play. /api/recording mints a fresh
                            // presigned URL behind the session on each play.
                            <audio
                              controls
                              preload="none"
                              src={`/api/recording/${c.id}`}
                              className="mt-3 h-9 w-full max-w-md"
                            />
                          )}

                          {/* Routing keys off the number the call actually
                              came from, so it needs caller_id — a spoken
                              callback number would never match an inbound
                              call and the setting would look applied while
                              doing nothing. Web-demo calls have no caller_id
                              at all, so say why instead of showing nothing. */}
                          {voicemailNumbers &&
                            (c.caller_id ? (
                              <VoicemailToggle
                                number={c.caller_id}
                                enabled={voicemailNumbers.includes(
                                  c.caller_id.replace(/\D/g, "").slice(-10)
                                )}
                                suggested={looksPersonal(c)}
                              />
                            ) : (
                              <p className="mt-4 text-xs text-content-tertiary">
                                No caller ID on this call, so it can&apos;t be
                                routed to voicemail. Calls that come in over the
                                phone always have one.
                              </p>
                            ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Two genuinely different empty states — "you have no calls" and
            "your filters excluded everything" need different responses. */}
        {filtered.length === 0 && (
          <div className="px-6 py-16 text-center">
            {hasAnyCalls ? (
              <>
                <p className="text-sm text-content-secondary">
                  No calls match these filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setRange("all");
                    setStatus("all");
                  }}
                  className="mt-3 text-sm font-medium text-accent-text hover:text-content-primary"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-content-secondary">No calls yet.</p>
                <p className="mt-1.5 text-xs text-content-tertiary">
                  The moment your AI catches one, it appears here with the full
                  transcript and recording.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={align === "right" ? "text-right" : "text-left"}
    >
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-1 px-4 py-3 text-2xs font-semibold uppercase transition-colors hover:text-content-primary ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-content-primary" : "text-content-tertiary"}`}
      >
        {label}
        <span aria-hidden className={active ? "opacity-100" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}
