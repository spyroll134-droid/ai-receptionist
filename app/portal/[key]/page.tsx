import { getSupabaseServerClient } from "@/lib/supabase";
import { site } from "@/lib/site-config";
import {
  ActivityBars,
  Badge,
  CallCard,
  type CallRow,
  isAfterHours,
  Shell,
  StatTile,
} from "@/components/dash";

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

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("access_key", key)
    .single();

  if (!client) {
    return (
      <Shell title="Portal" subtitle="">
        <p className="mt-16 text-center text-slate-500">
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
  const afterHours = calls.filter((c) => isAfterHours(c.created_at)).length;
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
        <ActivityBars calls={calls} />
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Your calls</h2>
          {afterHours > 0 && <Badge tone="warning">☾ {afterHours} after-hours</Badge>}
        </div>
        {calls.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No calls yet — as soon as your AI catches one, it appears here
            with the full transcript.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {calls.map((c) => (
              <CallCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-16 border-t border-white/5 pt-6 text-xs text-slate-600">
        Powered by {site.businessName} · questions? {site.contactEmail}
      </footer>
    </Shell>
  );
}
