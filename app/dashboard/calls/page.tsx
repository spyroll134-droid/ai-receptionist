import { requestNow } from "@/lib/now";
import { requireAdmin } from "@/lib/supabase-auth";
import { CallFilters } from "@/components/ops-filters";
import { ActivityBars, isDeadAir } from "@/components/dash";
import { filterCalls, hrefWith, loadOps, one, summarize } from "@/lib/ops";
import {
  CallDetail,
  CallRowLine,
  Empty,
  NotAuthorized,
  OpsShell,
  Panel,
  StatStrip,
  Table,
  Th,
} from "@/components/ops";

// The working view: every call, filterable, with a detail panel docked beside
// the table. Filter state and the open row both live in the URL (see
// components/ops-filters.tsx for why).

export const dynamic = "force-dynamic";

const BASE = "/dashboard/calls";

export default async function Calls({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!(await requireAdmin())) return <NotAuthorized />;

  const sp = await searchParams;
  const nowMs = await requestNow();
  const { calls, signups, clients, callCount, truncated } = await loadOps();

  const filter = {
    q: one(sp.q),
    status: one(sp.status),
    client: one(sp.client),
    range: one(sp.range) || "30",
  };
  const rows = filterCalls(calls, filter, nowMs);
  const s = summarize(rows, nowMs);

  // The chart follows the range filter. "All time" has no bounded window, so
  // it falls back to 90 — the widest span the strip can render legibly, and
  // wide enough that "all time" doesn't visibly shrink the picture.
  const chartDays =
    filter.range === "7" ? 7 : filter.range === "90" || filter.range === "all" ? 90 : 30;
  const chartLabel =
    filter.range === "all" ? "last 90 days" : `last ${chartDays} days`;

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  // The Client column earns its width with more than one client — or with even
  // one unattributed call, which is the case where the column is the only
  // place the problem is visible per-row.
  const showClient = clients.length > 1 || s.unassigned > 0;
  const clientVoicemail = new Map(
    clients.map((c) => [c.id, c.voicemail_numbers ?? []])
  );
  const openId = one(sp.call);
  // Resolve against the unfiltered list: a link someone was sent should open
  // even if the recipient's default range doesn't include that call.
  const open = openId ? calls.find((c) => c.id === openId) : undefined;

  return (
    <OpsShell
      badge="Internal"
      active={BASE}
      title="Calls"
      counts={{
        [BASE]: calls.length,
        "/dashboard/clients": clients.length,
        "/dashboard/signups": signups.length,
      }}
      actions={
        <span className="whitespace-nowrap text-2xs tabular-nums text-content-faint">
          {rows.length} of {calls.length}
        </span>
      }
    >
      <CallFilters
        basePath={BASE}
        clients={clients.map((c) => ({ value: c.id, label: c.name }))}
      />

      <div className="mt-4">
        <StatStrip
          items={[
            {
              label: "Needs follow-up",
              value: s.unhandled,
              tone: s.unhandled > 0 ? "critical" : undefined,
              glyph: s.unhandled > 0 ? "▲" : undefined,
              href: hrefWith(BASE, sp, { status: "unhandled", call: null }),
            },
            { label: "Answered", value: s.connected.length },
            { label: "Emergencies", value: s.emergencies, tone: "critical", glyph: "▲" },
            { label: "Booked", value: s.booked, tone: "positive", glyph: "✓" },
            { label: "After-hours", value: s.afterHours },
            // Only when there are any. Unlike "Needs follow-up", which is a
            // work queue whose emptiness is itself worth showing, a permanent
            // "Unassigned 0" is a tile that trains you to stop reading tiles.
            ...(s.unassigned > 0
              ? [
                  {
                    label: "Unassigned",
                    value: s.unassigned,
                    tone: "critical" as const,
                    glyph: "▲",
                    href: hrefWith(BASE, sp, { status: "unassigned", call: null }),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* Same rows the table below is showing, over the same date range the
          filter selected. Previously the only chart lived on the overview and
          ignored every filter on this page. */}
      <div className="mt-4">
        <ActivityBars
          calls={rows.filter((c) => !isDeadAir(c))}
          nowMs={nowMs}
          windowDays={chartDays}
          title={`Calls — ${chartLabel}`}
        />
      </div>

      <div
        className={`mt-4 grid gap-4 ${open ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}
      >
        <Panel title="Call log">
          {rows.length === 0 ? (
            <Empty>
              {calls.length === 0
                ? "No calls yet — call the demo line and it lands here."
                : filter.status === "unhandled"
                  ? "Nothing outstanding — every emergency reached someone or became a job."
                  : filter.status === "unassigned"
                    ? "Every call is attributed to a client."
                    : "No calls match these filters."}
            </Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-0" />
                  <Th>Time</Th>
                  <Th>Caller</Th>
                  <Th>Callback</Th>
                  <Th>Caller ID</Th>
                  {showClient && <Th>Client</Th>}
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <CallRowLine
                    key={c.id}
                    c={c}
                    clientName={
                      showClient
                        ? (clientName.get(c.client_id ?? "") ?? "Unassigned")
                        : undefined
                    }
                    selected={c.id === openId}
                    href={
                      c.id === openId
                        ? hrefWith(BASE, sp, { call: null })
                        : hrefWith(BASE, sp, { call: c.id })
                    }
                  />
                ))}
              </tbody>
            </Table>
          )}
          {/* The filters, the tiles and the chart above all describe `calls`,
              which is the newest 500 rows — not the table. Once that cap binds,
              every number on this page silently becomes "of the last 500" while
              still reading as "total". Saying so is cheap; discovering it from a
              number that disagrees with a client's own count is not. */}
          {truncated && (
            <p className="mt-3 border-t border-line-subtle pt-3 text-2xs text-content-secondary">
              Loaded the {calls.length.toLocaleString()} most recent calls of{" "}
              {callCount.toLocaleString()}. Filters and totals on this page cover
              that window only.
            </p>
          )}
        </Panel>

        {open && (
          <CallDetail
            c={open}
            clientName={clientName.get(open.client_id ?? "")}
            voicemailNumbers={clientVoicemail.get(open.client_id ?? "")}
            closeHref={hrefWith(BASE, sp, { call: null })}
          />
        )}
      </div>
    </OpsShell>
  );
}
