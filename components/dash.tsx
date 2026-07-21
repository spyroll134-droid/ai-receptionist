// Shared UI for the ops dashboard and client portals.
// Dark premium theme. Colors follow the validated dataviz palette:
// series blue #3987e5, status: critical #d03b3b / good #0ca30c / warning
// #fab219 — status colors always ship with a label, never color alone.

export type CallRow = {
  id: string;
  created_at: string;
  trade: string;
  caller_name: string | null;
  callback_number: string | null;
  emergency: boolean;
  standing_water: boolean | null;
  category: string | null;
  insurance_carrier: string | null;
  service_address: string | null;
  arrival_window: string | null;
  transferred_to_owner: boolean;
  booked: boolean;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  owner_notified_at: string | null;
  client_id: string | null;
};

export function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isAfterHours(ts: string) {
  const d = new Date(ts);
  const h = Number(
    d.toLocaleString("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false })
  );
  return h < 8 || h >= 18;
}

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "critical" | "good" | "warning" | "info" | "muted";
}) {
  const tones: Record<string, string> = {
    critical: "bg-[#d03b3b]/15 text-[#ff8a8a] ring-[#d03b3b]/40",
    good: "bg-[#0ca30c]/15 text-[#5ad65a] ring-[#0ca30c]/40",
    warning: "bg-[#fab219]/15 text-[#fac95e] ring-[#fab219]/40",
    info: "bg-[#3987e5]/15 text-[#7cb3f2] ring-[#3987e5]/40",
    muted: "bg-white/5 text-slate-400 ring-white/10",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "red" | "green";
}) {
  const bar =
    accent === "red" ? "bg-[#d03b3b]" : accent === "green" ? "bg-[#0ca30c]" : "bg-[#3987e5]";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${bar} opacity-80`} />
      <div className="text-4xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1.5 text-sm text-slate-400">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// 14-day single-series activity strip. Thin bars, rounded data-ends,
// 2px gaps, hover tooltip per mark; peak gets a direct label.
export function ActivityBars({ calls }: { calls: CallRow[] }) {
  const days: { key: string; label: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = d.toLocaleDateString("en-US", { timeZone: "America/Detroit" });
    days.push({
      key,
      label: d.toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" }),
      n: 0,
    });
  }
  for (const c of calls) {
    const key = new Date(c.created_at).toLocaleDateString("en-US", { timeZone: "America/Detroit" });
    const day = days.find((d) => d.key === key);
    if (day) day.n++;
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-slate-300">Calls — last 14 days</h3>
        <span className="text-xs text-slate-500">daily totals</span>
      </div>
      <div className="mt-4 flex h-24 items-end gap-[2px]">
        {days.map((d) => (
          <div key={d.key} className="group relative flex-1">
            <div
              className="w-full rounded-t bg-[#3987e5] transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(4, (d.n / max) * 88)}px`, opacity: d.n === 0 ? 0.15 : 1 }}
            />
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow-lg ring-1 ring-white/10 group-hover:block">
              {d.label}: {d.n} call{d.n === 1 ? "" : "s"}
            </div>
            {d.n === max && max > 0 && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-slate-300">
                {d.n}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>{days[0].label}</span>
        <span>{days[days.length - 1].label}</span>
      </div>
    </div>
  );
}

export function CallCard({ c }: { c: CallRow }) {
  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.03] transition-colors open:bg-white/[0.05] hover:border-white/20">
      <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 list-none">
        <span className={`h-2 w-2 flex-none rounded-full ${c.emergency ? "bg-[#d03b3b]" : "bg-[#3987e5]"}`} />
        <span className="font-medium text-white">{c.caller_name || "Unknown caller"}</span>
        <span className="text-sm text-slate-500">{fmt(c.created_at)}</span>
        {c.emergency ? <Badge tone="critical">▲ Emergency</Badge> : <Badge tone="muted">Routine</Badge>}
        {c.booked && <Badge tone="good">✓ Booked</Badge>}
        {c.transferred_to_owner && <Badge tone="info">→ Transferred</Badge>}
        {isAfterHours(c.created_at) && <Badge tone="warning">☾ After-hours</Badge>}
        <span className="ml-auto text-xs text-slate-500 transition-transform group-open:rotate-90">▸</span>
      </summary>
      <div className="border-t border-white/5 p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ["Callback", c.callback_number],
            ["Address", c.service_address],
            ["Standing water", c.standing_water == null ? null : c.standing_water ? "Yes" : "No"],
            ["Water category", c.category],
            ["Insurance", c.insurance_carrier],
            ["Arrival window", c.arrival_window],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between gap-4 sm:justify-start">
              <dt className="w-32 flex-none text-slate-500">{label}</dt>
              <dd className="text-slate-200">{(val as string) ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {c.summary && (
          <p className="mt-4 rounded-xl bg-[#3987e5]/10 p-3 text-sm leading-relaxed text-slate-200 ring-1 ring-[#3987e5]/20">
            {c.summary}
          </p>
        )}
        {c.transcript && (
          <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs leading-relaxed text-slate-300 ring-1 ring-white/5">
            {c.transcript}
          </pre>
        )}
        {c.recording_url && (
          <a
            href={c.recording_url}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#7cb3f2] hover:text-white"
          >
            ▶ Play recording
          </a>
        )}
      </div>
    </details>
  );
}

export function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-64 opacity-50"
        style={{ background: "radial-gradient(70% 100% at 50% 0%, rgba(57,135,229,0.18), transparent)" }}
      />
      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <span className="text-xs text-slate-600">refresh for latest · Detroit time</span>
        </header>
        {children}
      </main>
    </div>
  );
}
