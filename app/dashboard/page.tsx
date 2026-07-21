import Link from "next/link";
import { requestNow } from "@/lib/now";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/supabase-auth";
import { site } from "@/lib/site-config";
import {
  ActivityBars,
  Badge,
  CallCard,
  type CallRow,
  isAfterHours,
  isDeadAir,
  Shell,
  StatTile,
} from "@/components/dash";

// Internal ops dashboard (owner view): all clients, all calls, all trial
// signups. Gated by requireAdmin() — a real Supabase auth session checked
// against the admins table (supabase/ops.sql). Client-facing views live at
// /portal behind their own sessions, scoped to one client each by RLS.

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  trade: string;
  created_at: string;
};

type SignupRow = {
  id: string;
  created_at: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  trade: string | null;
};

function fmtShort(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function Dashboard() {
  // Was gated by ?key=<secret> in the URL — the same weakness the client
  // portals had: the credential lands in browser history, in anything you
  // screenshot, and in Vercel's access logs in plaintext. Admins are now real
  // auth users (supabase/ops.sql), checked against the admins table.
  const isAdmin = await requireAdmin();
  if (!isAdmin) {
    return (
      <Shell title="Not authorized" subtitle="">
        <p className="mt-16 text-center text-sm text-content-tertiary">
          Sign in with an admin account to view this.
        </p>
        <p className="mt-3 text-center">
          <Link
            href="/login"
            className="text-sm font-medium text-accent-text hover:text-content-primary"
          >
            Go to sign in →
          </Link>
        </p>
      </Shell>
    );
  }

  const supabase = getSupabaseServerClient();
  // Per-request clock read. connection() marks this render as dynamic so
  // the value is never captured at build time; the result is threaded into
  // children so server and client agree and hydration stays clean.
  const nowMs = await requestNow();
  const [{ data: calls }, { data: signups }, { data: clients }] = await Promise.all([
    supabase.from("calls").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("trial_signups").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("clients").select("*").order("created_at", { ascending: true }),
  ]);

  const callRows = (calls ?? []) as CallRow[];
  const signupRows = (signups ?? []) as SignupRow[];
  const clientRows = (clients ?? []) as ClientRow[];
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));

  const connected = callRows.filter((c) => !isDeadAir(c));
  const deadAir = callRows.length - connected.length;
  const emergencies = connected.filter((c) => c.emergency).length;
  const booked = connected.filter((c) => c.booked).length;
  const afterHours = connected.filter((c) => isAfterHours(c.created_at)).length;

  return (
    <Shell title={`${site.businessName} — Operations`} subtitle="All clients · live from the database">
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile
          label="Calls answered"
          value={connected.length}
          sub={deadAir > 0 ? `+${deadAir} dead-air excluded` : undefined}
        />
        <StatTile label="Emergencies" value={emergencies} accent="red" />
        <StatTile label="Jobs booked" value={booked} accent="green" />
        <StatTile label="After-hours saves" value={afterHours} />
        <StatTile label="Trial signups" value={signupRows.length} />
      </section>

      <section className="mt-6">
        <ActivityBars calls={connected} nowMs={nowMs} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Clients</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {clientRows.map((c) => {
            const n = callRows.filter((r) => r.client_id === c.id).length;
            return (
              <div key={c.id} className="rounded-2xl border border-line-default bg-surface-raised p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{c.name}</span>
                  <Badge tone="info">{c.trade}</Badge>
                </div>
                {/* No portal link: /portal/<access_key> was removed with the
                    URL-key scheme — clients now sign in at /login and see
                    only their own rows via RLS. */}
                <div className="mt-2 text-sm text-content-tertiary">{n} calls logged</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Calls</h2>
        {callRows.length === 0 ? (
          <p className="mt-4 text-sm text-content-tertiary">
            No calls yet — call the demo line and it lands here automatically.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {callRows.map((c) => (
              <div key={c.id}>
                {clientRows.length > 1 && (
                  <div className="mb-1 pl-1 text-xs text-content-secondary">
                    {clientName.get(c.client_id ?? "") ?? "Unassigned"}
                  </div>
                )}
                <CallCard c={c} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Trial signups</h2>
        {signupRows.length === 0 ? (
          <p className="mt-4 text-sm text-content-tertiary">
            Website form submissions land here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line-default bg-surface-raised">
            <table className="w-full text-left text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
              <thead>
                <tr className="border-b border-line-default text-xs uppercase tracking-wide text-content-tertiary">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {signupRows.map((s) => (
                  <tr key={s.id} className="border-b border-line-subtle last:border-0">
                    <td className="px-4 py-3 text-content-tertiary">{fmtShort(s.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-white">{s.company_name}</td>
                    <td className="px-4 py-3">{s.contact_name}</td>
                    <td className="px-4 py-3">{s.phone}</td>
                    <td className="px-4 py-3">{s.trade ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}
