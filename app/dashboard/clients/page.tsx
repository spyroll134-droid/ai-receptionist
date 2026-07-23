import Link from "next/link";
import { requireAdmin } from "@/lib/supabase-auth";
import { requestNow } from "@/lib/now";
import { fmt } from "@/components/dash";
import { clientHealth, loadOps } from "@/lib/ops";
import { site } from "@/lib/site-config";
import {
  Empty,
  NotAuthorized,
  OpsShell,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/ops";

// One row per client with the numbers that come up on a renewal call.
// "Last call" is the health signal: a client whose line has been silent for
// days is either quiet or misconfigured, and the difference matters.
//
// Every figure comes from clientHealth() (lib/ops), the same function the
// overview uses. This page used to compute its own lifetime totals inline, so
// the two views quoted different numbers for the same client — the overview
// trailing-30-day, this one all-time — with nothing on either screen saying
// which window it meant. On a renewal call that is not a cosmetic difference:
// a client's lifetime count keeps looking healthy for months after their
// forwarding breaks, which is exactly when you need the number to drop.
//
// Rows come back quietest-first, so the account closest to churning is at the
// top rather than buried alphabetically.

export const dynamic = "force-dynamic";

export default async function Clients() {
  if (!(await requireAdmin())) return <NotAuthorized />;

  const nowMs = await requestNow();
  const { calls, signups, clients } = await loadOps();
  const health = clientHealth(calls, clients, nowMs, site.pricing.monthly);

  return (
    <OpsShell
      badge="Internal"
      active="/dashboard/clients"
      title="Clients"
      counts={{
        "/dashboard/calls": calls.length,
        "/dashboard/clients": clients.length,
        "/dashboard/signups": signups.length,
      }}
    >
      <Panel title={`${clients.length} active`}>
        {clients.length === 0 ? (
          <Empty>No clients provisioned yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Trade</Th>
                <Th className="text-right">Calls 30d</Th>
                <Th className="text-right">Emergency</Th>
                <Th className="text-right">Booked</Th>
                <Th className="text-right">Margin 30d</Th>
                <Th>Last call</Th>
              </tr>
            </thead>
            <tbody>
              {health.map((h) => {
                const c = h.client;
                // Negative margin means Vapi spend exceeded the subscription:
                // this client costs money to keep. Worth seeing next to their
                // call volume, because the two causes look identical on the
                // overview — a heavy user and a runaway loop both spend.
                const losing = h.margin30 < 0;
                // Four days of silence on an established client is the same
                // signal the nightly health check escalates at seven. Showing
                // it here means it is visible before the email fires.
                const stale = h.daysSinceLastCall != null && h.daysSinceLastCall >= 4;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-line-subtle last:border-0 hover:bg-surface-raised"
                  >
                    <Td className="font-medium text-content-primary">
                      <Link
                        href={`/dashboard/calls?client=${c.id}&range=all`}
                        className="transition-colors hover:text-accent-text"
                      >
                        {c.name}
                      </Link>
                    </Td>
                    <Td className="text-content-secondary">{c.trade}</Td>
                    <Td className="text-right tabular-nums">
                      {h.calls30 || <span className="text-content-faint">—</span>}
                    </Td>
                    <Td className="text-right tabular-nums text-critical-text">
                      {h.emergencies30 || (
                        <span className="text-content-faint">—</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums text-positive-text">
                      {h.booked30 || <span className="text-content-faint">—</span>}
                    </Td>
                    {/* Glyph, not colour alone: ▼ carries the "losing money"
                        reading for anyone who can't separate the red from the
                        amber elsewhere in this table. */}
                    <Td
                      className={`text-right tabular-nums ${
                        losing ? "text-critical-text" : "text-content-secondary"
                      }`}
                    >
                      {losing && <span aria-hidden="true">▼ </span>}
                      {h.margin30 < 0 ? "-" : ""}$
                      {Math.abs(Math.round(h.margin30)).toLocaleString()}
                    </Td>
                    <Td className="whitespace-nowrap text-content-tertiary">
                      {h.lastCallAt ? (
                        <>
                          {stale && (
                            <span
                              className="text-critical-text"
                              aria-hidden="true"
                            >
                              ▲{" "}
                            </span>
                          )}
                          <span className={stale ? "text-critical-text" : ""}>
                            {fmt(h.lastCallAt)}
                            {stale && ` (${h.daysSinceLastCall}d)`}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </OpsShell>
  );
}
