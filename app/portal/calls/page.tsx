import { redirect } from "next/navigation";
import { avgTicketFor } from "@/lib/site-config";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";
import { requestNow } from "@/lib/now";
import { ActivityBars, isDeadAir, type CallRow } from "@/components/dash";
import { OpsShell, Panel } from "@/components/ops";
import { PORTAL_NAV } from "@/components/portal-nav";
import CallTable from "@/components/CallTable";

// The Calls tab — the client's complete system of record. The Dashboard shows
// the proof-worthy handful; this is every call, searchable and filterable, with
// the recording and full transcript one tap away on each row. Moved off the
// home page so the Dashboard stays a five-second "is it worth it?" glance and
// this stays the place you interrogate the data.

const CALL_LIMIT = 200;

export const dynamic = "force-dynamic";

export default async function PortalCalls() {
  const session = await getCurrentClient();
  if (!session) redirect("/login");
  const { client } = session;

  const nowMs = await requestNow();
  const supabase = await getSupabaseSessionClient();

  // `count: "exact"` on the same round trip buys the difference between "you
  // have 200 calls" and "we are showing 200 of your 431." RLS scopes the rows.
  const { data, count } = await supabase
    .from("calls")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(CALL_LIMIT);
  const calls = (data ?? []) as CallRow[];
  const totalCalls = count ?? calls.length;
  // The chart counts real conversations; the table below shows every call so
  // the log stays a complete record.
  const connected = calls.filter((c) => !isDeadAir(c));
  const avgTicket = avgTicketFor(client.trade, client.avg_ticket_dollars);

  return (
    <OpsShell
      active="/portal/calls"
      nav={PORTAL_NAV}
      brandHref="/portal"
      brandLabel={client.name}
      title="Calls"
      counts={{ "/portal/calls": calls.length }}
      actions={
        <span className="whitespace-nowrap text-2xs uppercase tracking-wide text-content-faint">
          {client.trade}
        </span>
      }
    >
      <ActivityBars calls={connected} nowMs={nowMs} windowDays={30} />

      <div className="mt-4">
        <Panel title="Call log">
          <CallTable
            calls={calls}
            nowMs={nowMs}
            avgTicket={avgTicket}
            clientName={client.name}
            voicemailNumbers={client.voicemail_numbers ?? []}
          />
          {totalCalls > calls.length && (
            <p className="border-t border-line-subtle px-4 pb-4 pt-3 text-2xs text-content-secondary">
              Showing your {calls.length.toLocaleString()} most recent calls of{" "}
              {totalCalls.toLocaleString()}. Email us if you need your full
              history.
            </p>
          )}
        </Panel>
      </div>
    </OpsShell>
  );
}
