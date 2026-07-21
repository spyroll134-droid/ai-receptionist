import { requestNow } from "@/lib/now";
import { getSupabaseServerClient } from "@/lib/supabase";
import { site } from "@/lib/site-config";
import {
  ActivityBars,
  type CallRow,
  Shell,
  StatTile,
} from "@/components/dash";
import CallTable from "@/components/CallTable";

// Client portal: each client's private link (/portal/<access_key>) shows
// ONLY their own calls. The access key is the whole credential — treat the
// link like a password. Upgrade path: real auth once client count justifies it.

export const dynamic = "force-dynamic";

export default async function Portal({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const supabase = getSupabaseServerClient();
  // Per-request clock read. connection() marks this render as dynamic so
  // the value is never captured at build time; the result is threaded into
  // children so server and client agree and hydration stays clean.
  const nowMs = await requestNow();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("access_key", key)
    .single();

  if (!client) {
    return (
      <Shell title="Portal" subtitle="">
        <p className="mt-16 text-center text-content-tertiary">
          Invalid link. Contact {site.businessName} for your portal address.
        </p>
      </Shell>
    );
  }

  const { data } = await supabase
    .from("calls")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const calls = (data ?? []) as CallRow[];

  const emergencies = calls.filter((c) => c.emergency).length;
  const booked = calls.filter((c) => c.booked).length;
  const protectedRevenue = booked * (client.avg_ticket_dollars ?? 5000);

  return (
    <Shell
      title={client.name}
      subtitle={`Answered by your AI receptionist · ${client.trade}`}
    >
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Calls caught" value={calls.length} sub="that would have hit voicemail" />
        <StatTile label="Emergencies handled" value={emergencies} accent="red" />
        <StatTile label="Jobs booked" value={booked} accent="green" />
        <StatTile
          label="Revenue protected"
          value={`$${protectedRevenue.toLocaleString()}`}
          sub={`${booked} booked × $${(client.avg_ticket_dollars ?? 5000).toLocaleString()} avg ticket`}
          accent="green"
        />
      </section>

      <section className="mt-6">
        <ActivityBars calls={calls} nowMs={nowMs} />
      </section>

      <CallTable
        calls={calls}
        nowMs={nowMs}
        avgTicket={client.avg_ticket_dollars ?? 5000}
        clientName={client.name}
      />

      <footer className="mt-16 border-t border-line-subtle pt-6 text-xs text-content-secondary">
        Powered by {site.businessName} · questions? {site.contactEmail}
      </footer>
    </Shell>
  );
}
