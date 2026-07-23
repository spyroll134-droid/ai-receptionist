"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Filter toolbar for the calls view. Filters live in the URL, not component
// state: a filtered view is then linkable, survives refresh, and the back
// button walks the operator's own history. The trade-off is a server round
// trip per change, which is why the search box is debounced and every
// navigation is wrapped in a transition so the table dims instead of blanking.

type Option = { value: string; label: string };

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
  // Any filter change invalidates the open row — the selected call may not
  // survive the new filter, which would leave a detail panel pinned open
  // next to a table that no longer lists it.
  params.delete("call");
}

export function CallFilters({
  basePath,
  clients,
}: {
  basePath: string;
  clients: Option[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const q = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState(q);

  // Keep the box in sync when the URL changes from anywhere but this input
  // (back button, a "clear filters" link) without clobbering what's being
  // typed right now.
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(q);
  }, [q]);

  function push(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    });
  }

  // Debounce the text field so a five-letter name is one navigation, not five.
  useEffect(() => {
    if (draft === q) return;
    const t = setTimeout(() => push((p) => setParam(p, "q", draft)), 300);
    return () => clearTimeout(t);
    // push/searchParams intentionally excluded: this effect fires on the
    // draft settling, and re-running it when the URL updates would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, q]);

  const status = searchParams.get("status") ?? "";
  const client = searchParams.get("client") ?? "";
  const range = searchParams.get("range") ?? "30";
  const hasFilters = Boolean(q || status || client || searchParams.get("range"));

  const select =
    "h-7 rounded-md border border-line-default bg-surface-raised px-2 text-xs text-content-secondary outline-none transition-colors hover:border-line-strong focus:border-accent-line focus:text-content-primary";

  return (
    // aria-busy tells assistive tech a filter change is in flight; the visible
    // "Filtering…" cue at the end of the row is the sighted equivalent. The old
    // data-pending attribute was styled nowhere, so a filter change on a slow
    // connection looked like nothing had happened.
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={isPending}
    >
      <label className="relative">
        <span className="sr-only">Search calls</span>
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-content-faint"
        >
          ⌕
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          placeholder="Name, number, address, transcript…"
          className="h-7 w-56 rounded-md border border-line-default bg-surface-raised pl-6 pr-2 text-xs text-content-primary outline-none transition-colors placeholder:text-content-faint hover:border-line-strong focus:border-accent-line"
        />
      </label>

      <select
        aria-label="Status"
        value={status}
        onChange={(e) => push((p) => setParam(p, "status", e.target.value))}
        className={select}
      >
        <option value="">All calls</option>
        {/* First, and above the descriptive states, because it's the only one
            that is a to-do list rather than a description. */}
        <option value="unhandled">Needs follow-up</option>
        {/* Target of the overview's "never notified" banner — same definition
            (lib/ops.ts isUnnotified), so the count and this list agree. */}
        <option value="unnotified">Never notified</option>
        <option value="emergency">Emergency</option>
        <option value="booked">Booked</option>
        <option value="transferred">Transferred</option>
        <option value="after-hours">After-hours</option>
        {/* A call no client row claimed. A status rather than a client-select
            entry on purpose: the client select is hidden below two clients,
            which is exactly when an unmapped number is most likely and least
            noticed. */}
        <option value="unassigned">Unassigned</option>
        <option value="dead-air">Dead air</option>
      </select>

      {clients.length > 1 && (
        <select
          aria-label="Client"
          value={client}
          onChange={(e) => push((p) => setParam(p, "client", e.target.value))}
          className={select}
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}

      <select
        aria-label="Date range"
        value={range}
        onChange={(e) => push((p) => setParam(p, "range", e.target.value))}
        className={select}
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="all">All time</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() =>
            push((p) => {
              p.delete("q");
              p.delete("status");
              p.delete("client");
              p.delete("range");
              p.delete("call");
            })
          }
          className="h-7 rounded-md px-2 text-xs text-content-tertiary transition-colors hover:text-content-primary"
        >
          Clear
        </button>
      )}

      <span
        role="status"
        aria-live="polite"
        className={`text-xs text-content-tertiary transition-opacity ${
          isPending ? "opacity-100" : "opacity-0"
        }`}
      >
        Filtering…
      </span>
    </div>
  );
}
