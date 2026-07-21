import Link from "next/link";
import { site } from "@/lib/site-config";

// Shared UI for the ops dashboard and client portals. Draws entirely from the
// tokens in globals.css so the portal and the marketing site read as one
// product. Status is never communicated by color alone — every status color
// ships with a text label or glyph, so it survives colorblindness and
// grayscale printing.

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
    d.toLocaleString("en-US", {
      timeZone: "America/Detroit",
      hour: "numeric",
      hour12: false,
    })
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
    critical: "bg-critical-surface text-critical-text ring-critical-line",
    good: "bg-positive-surface text-positive-text ring-positive-line",
    warning: "bg-caution-surface text-caution-text ring-caution-line",
    info: "bg-accent-surface text-accent-text ring-accent-line",
    muted: "bg-surface-overlay text-content-tertiary ring-line-default",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase ring-1 ${tones[tone]}`}
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
    accent === "red"
      ? "bg-critical"
      : accent === "green"
        ? "bg-positive"
        : "bg-accent";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-default bg-surface-raised p-5 shadow-card">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} />
      <div className="text-3xl font-semibold text-content-primary">{value}</div>
      <div className="mt-1.5 text-sm text-content-secondary">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-content-tertiary">{sub}</div>}
    </div>
  );
}

// 14-day single-series activity strip. One series, one color — the accent.
// Peak gets a direct label so the shape is readable without a y-axis.
//
// `nowMs` is passed in rather than read from Date.now() here: reading the
// clock during render is impure, so the server and the client would compute
// different 14-day windows and React would report a hydration mismatch.
// One timestamp, generated server-side per request, keeps both in agreement.
export function ActivityBars({
  calls,
  nowMs,
}: {
  calls: CallRow[];
  nowMs: number;
}) {
  const days: { key: string; label: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400_000);
    const key = d.toLocaleDateString("en-US", { timeZone: "America/Detroit" });
    days.push({
      key,
      label: d.toLocaleDateString("en-US", {
        timeZone: "America/Detroit",
        month: "short",
        day: "numeric",
      }),
      n: 0,
    });
  }
  for (const c of calls) {
    const key = new Date(c.created_at).toLocaleDateString("en-US", {
      timeZone: "America/Detroit",
    });
    const day = days.find((d) => d.key === key);
    if (day) day.n++;
  }
  const max = Math.max(1, ...days.map((d) => d.n));

  return (
    <div className="rounded-2xl border border-line-default bg-surface-raised p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-content-secondary">
          Calls — last 14 days
        </h3>
        <span className="text-xs text-content-tertiary">daily totals</span>
      </div>
      <div className="mt-5 flex h-24 items-end gap-[3px]">
        {days.map((d) => (
          <div key={d.key} className="group relative flex-1">
            <div
              className="w-full rounded-t-sm bg-accent transition-opacity group-hover:opacity-75"
              style={{
                height: `${Math.max(3, (d.n / max) * 88)}px`,
                opacity: d.n === 0 ? 0.14 : 1,
              }}
            />
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line-default bg-surface-overlay px-2 py-1 text-xs text-content-primary shadow-raised group-hover:block">
              {d.label}: {d.n} call{d.n === 1 ? "" : "s"}
            </div>
            {d.n === max && max > 0 && (
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xs font-semibold text-content-secondary">
                {d.n}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-2xs text-content-faint">
        <span>{days[0].label}</span>
        <span>{days[days.length - 1].label}</span>
      </div>
    </div>
  );
}

export function CallCard({ c }: { c: CallRow }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-line-default bg-surface-raised shadow-card transition-colors hover:border-line-strong open:border-line-strong">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
        <span
          aria-hidden
          className={`h-2 w-2 flex-none rounded-full ${
            c.emergency ? "bg-critical" : "bg-accent"
          }`}
        />
        <span className="font-medium text-content-primary">
          {c.caller_name || "Unknown caller"}
        </span>
        <span className="text-sm text-content-tertiary">{fmt(c.created_at)}</span>
        {c.emergency ? (
          <Badge tone="critical">▲ Emergency</Badge>
        ) : (
          <Badge tone="muted">Routine</Badge>
        )}
        {c.booked && <Badge tone="good">✓ Booked</Badge>}
        {c.transferred_to_owner && <Badge tone="info">→ Transferred</Badge>}
        {isAfterHours(c.created_at) && <Badge tone="warning">☾ After-hours</Badge>}
        <span
          aria-hidden
          className="ml-auto text-xs text-content-tertiary transition-transform duration-200 group-open:rotate-90"
        >
          ▸
        </span>
      </summary>

      <div className="border-t border-line-subtle p-4">
        <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
          {[
            ["Callback", c.callback_number],
            ["Address", c.service_address],
            [
              "Standing water",
              c.standing_water == null ? null : c.standing_water ? "Yes" : "No",
            ],
            ["Water category", c.category],
            ["Insurance", c.insurance_carrier],
            ["Arrival window", c.arrival_window],
          ].map(([label, val]) => (
            <div
              key={label as string}
              className="flex justify-between gap-4 sm:justify-start"
            >
              <dt className="w-32 flex-none text-content-tertiary">{label}</dt>
              <dd className="text-content-primary">{(val as string) ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {c.summary && (
          <p className="mt-4 rounded-xl border border-accent-line bg-accent-surface p-3.5 text-sm leading-relaxed text-content-primary">
            {c.summary}
          </p>
        )}

        {c.transcript && (
          <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line-subtle bg-surface-inset p-3.5 font-mono text-xs leading-relaxed text-content-secondary">
            {c.transcript}
          </pre>
        )}

        {c.recording_url && (
          <a
            href={c.recording_url}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition-colors hover:text-content-primary"
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
    // The product surface owns the dark theme locally — the marketing site
    // stays light. Everything inside here draws from the tokens.
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(70% 100% at 50% 0%, rgba(59,130,246,0.10), transparent 70%)",
        }}
      />

      <div className="relative border-b border-line-subtle">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-content-primary"
          >
            {site.businessName}
          </Link>
          <span className="text-xs text-content-faint">Detroit time</span>
        </div>
      </div>

      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-content-primary">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-sm text-content-tertiary">{subtitle}</p>
            )}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
