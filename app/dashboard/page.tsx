import Link from "next/link";
import { requestNow } from "@/lib/now";
import { requireAdmin } from "@/lib/supabase-auth";
import { ActivityBars } from "@/components/dash";
import { clientHealth, loadOps, summarize } from "@/lib/ops";
import { site } from "@/lib/site-config";
import {
  CallRowLine,
  Empty,
  NotAuthorized,
  OpsShell,
  Panel,
  StatStrip,
  Table,
  Td,
  Th,
} from "@/components/ops";

// Overview: the "is anything on fire" view. Everything here is a summary that
// links into a filtered Calls view rather than a place to do work — drilling
// down is one click and the URL carries the filter.

export const dynamic = "force-dynamic";

export default async function Overview() {
  if (!(await requireAdmin())) return <NotAuthorized />;

  const nowMs = await requestNow();
  const { calls, signups, clients } = await loadOps({ callLimit: 200 });
  const s = summarize(calls, nowMs);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const health = clientHealth(calls, clients, nowMs, site.pricing.monthly);
  const recent = calls.slice(0, 8);

  return (
    <OpsShell
      badge="Internal"
      active="/dashboard"
      title="Overview"
      counts={{
        "/dashboard/calls": calls.length,
        "/dashboard/clients": clients.length,
        "/dashboard/signups": signups.length,
      }}
      actions={
        <span className="text-2xs text-content-faint">live from the database</span>
      }
    >
      <StatStrip
        items={[
          {
            label: "Needs follow-up",
            value: s.unhandled,
            tone: s.unhandled > 0 ? "critical" : undefined,
            glyph: s.unhandled > 0 ? "▲" : undefined,
            sub: s.unhandled > 0 ? "emergencies with no human" : "all clear",
            href: "/dashboard/calls?status=unhandled&range=all",
          },
          {
            label: "Calls answered",
            value: s.connected.length,
            sub: s.deadAir > 0 ? `${s.deadAir} dead-air excluded` : undefined,
          },
          { label: "Emergencies", value: s.emergencies, tone: "critical", glyph: "▲" },
          // Booked and won are separate numbers on purpose. Booked is what the
          // AI delivered; won is what the client confirmed became money. The
          // gap between them is the single best read on whether clients are
          // actually dispositioning their leads — if won stays at zero while
          // booked climbs, every client dashboard is showing a soft number and
          // the renewal conversation has nothing to stand on.
          { label: "Jobs booked", value: s.booked, sub: "AI put on the books" },
          {
            label: "Jobs won",
            value: s.won,
            tone: "positive",
            glyph: "✓",
            sub: "confirmed by the client",
          },
          { label: "Trial signups", value: signups.length },
        ]}
      />

      {/* The notification bug surfaced as a first-class alert: a call the
          owner was never emailed about is a missed job, and it was only
          discoverable by reading the database before. */}
      {s.unnotified > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-critical-line bg-critical-surface px-4 py-2.5 text-sm">
          <span aria-hidden className="text-critical-text">
            ▲
          </span>
          <span className="text-content-primary">
            <strong className="font-semibold tabular-nums">{s.unnotified}</strong>{" "}
            {s.unnotified === 1 ? "call" : "calls"} never triggered an owner
            notification email.
          </span>
          <Link
            href="/dashboard/calls?status=unnotified&range=all"
            className="text-critical-text underline-offset-2 hover:underline"
          >
            Review
          </Link>
        </div>
      )}

      <div className="mt-4">
        <ActivityBars calls={s.connected} nowMs={nowMs} />
      </div>

      <div className="mt-4">
        <Panel
          title="Recent calls"
          action={
            <Link
              href="/dashboard/calls"
              className="text-xs text-content-tertiary transition-colors hover:text-content-primary"
            >
              View all →
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty>No calls yet — call the demo line and it lands here.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-0" />
                  <Th>Time</Th>
                  <Th>Caller</Th>
                  <Th>Callback</Th>
                  <Th>Caller ID</Th>
                  {clients.length > 1 && <Th>Client</Th>}
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <CallRowLine
                    key={c.id}
                    c={c}
                    clientName={
                      clients.length > 1
                        ? (clientName.get(c.client_id ?? "") ?? "")
                        : undefined
                    }
                    href={`/dashboard/calls?call=${c.id}`}
                  />
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>

      {/* Client health, not a client list. Sorted quietest-first: the account
          at the top is the one closest to churning. Margin is subscription
          minus Vapi spend — it has been recorded on every call since the
          webhook was written and was never once displayed. */}
      <div className="mt-4">
        <Panel
          title="Client health"
          action={
            <span className="text-2xs text-content-faint">
              trailing 30 days · quietest first
            </span>
          }
        >
          {health.length === 0 ? (
            <Empty>No clients provisioned yet.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Trade</Th>
                  <Th className="text-right">Calls</Th>
                  <Th className="text-right">Emerg.</Th>
                  <Th className="text-right">Booked</Th>
                  <Th className="text-right">Won</Th>
                  <Th className="text-right">Spend</Th>
                  <Th className="text-right">Margin</Th>
                  <Th className="text-right">Last call</Th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr
                    key={h.client.id}
                    className="border-b border-line-subtle last:border-0 hover:bg-surface-raised"
                  >
                    <Td className="font-medium text-content-primary">
                      <Link
                        href={`/dashboard/calls?client=${h.client.id}&range=30`}
                        className="transition-colors hover:text-accent-text"
                      >
                        {h.client.name}
                      </Link>
                    </Td>
                    <Td className="text-content-secondary">{h.client.trade}</Td>
                    <Td className="text-right tabular-nums text-content-secondary">
                      {h.calls30}
                    </Td>
                    <Td className="text-right tabular-nums text-content-secondary">
                      {h.emergencies30}
                    </Td>
                    <Td className="text-right tabular-nums text-content-secondary">
                      {h.booked30}
                    </Td>
                    {/* A client with bookings but no wons isn't closing them
                        out — their own dashboard is showing them nothing, which
                        is a churn signal well before the calls stop. Marked
                        with ◷ + muted, not red: it's a nudge, not a fault. */}
                    <Td className="text-right tabular-nums">
                      {h.won30 > 0 ? (
                        <span className="text-positive-text">
                          <span aria-hidden="true">✓ </span>
                          {h.won30}
                        </span>
                      ) : h.booked30 > 0 ? (
                        <span className="text-caution-text">
                          <span aria-hidden="true">◷ </span>0
                        </span>
                      ) : (
                        <span className="text-content-faint">0</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums text-content-secondary">
                      ${h.cost30.toFixed(2)}
                    </Td>
                    {/* A negative margin is impossible at current call volume,
                        but it is the number that decides whether $297 is the
                        right price, so it is shown with a sign rather than
                        assumed positive. */}
                    <Td
                      className={`text-right tabular-nums ${
                        h.margin30 < 0 ? "text-critical-text" : "text-content-secondary"
                      }`}
                    >
                      {/* ▼ glyph, not colour alone — same churn signal as the
                          clients page, so the two admin tables agree. */}
                      {h.margin30 < 0 && <span aria-hidden="true">▼ </span>}
                      {h.margin30 < 0 ? "−" : ""}${Math.abs(h.margin30).toFixed(2)}
                    </Td>
                    <Td className="whitespace-nowrap text-right text-content-tertiary">
                      {h.daysSinceLastCall == null ? (
                        <span className="text-content-faint">never</span>
                      ) : h.daysSinceLastCall === 0 ? (
                        "today"
                      ) : h.daysSinceLastCall >= 4 ? (
                        // Stale account (≥4 days): the clients-page threshold,
                        // red + ▲ so a going-quiet client reads the same here.
                        <span className="text-critical-text">
                          <span aria-hidden="true">▲ </span>
                          {h.daysSinceLastCall}d ago
                        </span>
                      ) : (
                        `${h.daysSinceLastCall}d ago`
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </div>
    </OpsShell>
  );
}
