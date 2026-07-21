"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge, fmt, isAfterHours, type CallRow } from "./dash";

// The client's system of record. A dashboard stops feeling like a toy the
// moment the data can be interrogated — searched, filtered, sorted, and taken
// with you. Everything here runs client-side over the rows the server already
// fetched, so filtering is instant and costs no round trip.

type SortKey = "created_at" | "caller_name" | "status" | "value";
type SortDir = "asc" | "desc";
type RangeKey = "7d" | "30d" | "90d" | "all";
type StatusKey = "all" | "emergency" | "booked" | "after_hours" | "missed_notify";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const STATUSES: { key: StatusKey; label: string }[] = [
  { key: "all", label: "All calls" },
  { key: "emergency", label: "Emergencies" },
  { key: "booked", label: "Booked" },
  { key: "after_hours", label: "After-hours" },
  { key: "missed_notify", label: "Not notified" },
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

function formatPhone(raw: string | null) {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function statusRank(c: CallRow) {
  if (c.emergency) return 3;
  if (c.booked) return 2;
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
}: {
  calls: CallRow[];
  avgTicket: number;
  clientName: string;
  /** Server-generated timestamp — see `relative()` for why this is a prop. */
  nowMs: number;
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

      if (status === "emergency" && !c.emergency) return false;
      if (status === "booked" && !c.booked) return false;
      if (status === "after_hours" && !isAfterHours(c.created_at)) return false;
      if (status === "missed_notify" && c.owner_notified_at) return false;

      if (!q) return true;
      // Search across everything a person would plausibly remember about a call.
      return [
        c.caller_name,
        c.callback_number,
        c.service_address,
        c.summary,
        c.category,
        c.insurance_carrier,
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
          formatPhone(c.callback_number),
          c.emergency ? "Yes" : "No",
          c.booked ? "Yes" : "No",
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
    <section className="mt-10">
      {/* ---- Toolbar ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
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

      <p className="mt-3 text-xs text-content-tertiary" aria-live="polite">
        {filtered.length} of {calls.length} call{calls.length === 1 ? "" : "s"}
        {query && <> matching “{query}”</>}
      </p>

      {/* ---- Table ------------------------------------------------------ */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-line-default bg-surface-raised shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-default text-left">
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
                      onClick={() => setOpenId(open ? null : c.id)}
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(open ? null : c.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-line-subtle transition-colors hover:bg-surface-overlay ${
                        open ? "bg-surface-overlay" : ""
                      }`}
                    >
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
                        <div className="flex flex-wrap gap-1.5">
                          {c.emergency && <Badge tone="critical">▲ Emergency</Badge>}
                          {c.booked && <Badge tone="good">✓ Booked</Badge>}
                          {isAfterHours(c.created_at) && (
                            <Badge tone="warning">☾ After-hours</Badge>
                          )}
                          {!c.emergency && !c.booked && !isAfterHours(c.created_at) && (
                            <Badge tone="muted">Routine</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-content-secondary">
                        {formatPhone(c.callback_number)}
                      </td>
                      <td className="px-4 py-3 text-right text-content-primary">
                        {c.booked ? `$${avgTicket.toLocaleString()}` : "—"}
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b border-line-subtle">
                        <td colSpan={5} className="bg-surface-inset px-4 py-4">
                          <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
                            {[
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
                            <audio
                              controls
                              preload="none"
                              src={c.recording_url}
                              className="mt-3 h-9 w-full max-w-md"
                            />
                          )}
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
