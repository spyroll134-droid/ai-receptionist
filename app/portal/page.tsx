import { redirect } from "next/navigation";
import { site } from "@/lib/site-config";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";
import { requestNow } from "@/lib/now";
import { signOut } from "@/app/actions/auth";
import { ActivityBars, type CallRow, Shell, StatTile } from "@/components/dash";
import CallTable from "@/components/CallTable";

// Signed-in client portal. Replaces the /portal/<access_key> link scheme:
// the key used to be the whole credential, which meant it sat in browser
// history and in Vercel's access logs in plaintext. Now the session is a
// cookie and RLS (supabase/auth.sql) enforces isolation at the database.

export const dynamic = "force-dynamic";

export default async function Portal() {
  const session = await getCurrentClient();

  // proxy.ts already bounces signed-out users, but a signed-in user with no
  // client_users row would otherwise land on an empty page.
  if (!session) redirect("/login");
  const { client } = session;

  const nowMs = await requestNow();
  const supabase = await getSupabaseSessionClient();

  // No .eq("client_id", ...) needed — the "own calls" RLS policy scopes this
  // to the signed-in user's client. Defence in depth: even a mistake here
  // can't return another client's rows.
  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const calls = (data ?? []) as CallRow[];

  const emergencies = calls.filter((c) => c.emergency).length;
  const booked = calls.filter((c) => c.booked).length;
  const avgTicket = client.avg_ticket_dollars ?? 5000;
  const protectedRevenue = booked * avgTicket;

  return (
    <Shell
      title={client.name}
      subtitle={`Answered by your AI receptionist · ${client.trade}`}
    >
      <div className="mt-2 flex justify-end">
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-content-tertiary transition-colors hover:text-content-primary"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Calls caught"
          value={calls.length}
          sub="that would have hit voicemail"
        />
        <StatTile label="Emergencies handled" value={emergencies} accent="red" />
        <StatTile label="Jobs booked" value={booked} accent="green" />
        <StatTile
          label="Revenue protected"
          value={`$${protectedRevenue.toLocaleString()}`}
          sub={`${booked} booked × $${avgTicket.toLocaleString()} avg ticket`}
          accent="green"
        />
      </section>

      <section className="mt-6">
        <ActivityBars calls={calls} nowMs={nowMs} />
      </section>

      <CallTable
        calls={calls}
        nowMs={nowMs}
        avgTicket={avgTicket}
        clientName={client.name}
      />

      <footer className="mt-16 border-t border-line-subtle pt-6 text-xs text-content-secondary">
        Powered by {site.businessName} · questions? {site.contactEmail}
      </footer>
    </Shell>
  );
}
