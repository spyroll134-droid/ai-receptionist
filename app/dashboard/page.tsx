import { requestNow } from "@/lib/now";
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

// Internal ops dashboard (owner view): all clients, all calls, all trial
// signups. Gated by DASHBOARD_KEY (?key=...). Client-facing views live at
// /portal/<client access_key> and are scoped to one client each.

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  trade: string;
  access_key: string;
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

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const expected = process.env.DASHBOARD_KEY;
  if (!expected || key !== expected) {
    return (
      <Shell title="Not authorized" subtitle="">
        <p className="mt-16 text-center text-sm text-content-tertiary">
          Append ?key=YOUR_KEY to the URL.
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

  const emergencies = callRows.filter((c) => c.emergency).length;
  const booked = callRows.filter((c) => c.booked).length;
  const afterHours = callRows.filter((c) => isAfterHours(c.created_at)).length;

  return (
    <Shell title={`${site.businessName} — Operations`} subtitle="All clients · live from the database">
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Calls answered" value={callRows.length} />
        <StatTile label="Emergencies" value={emergencies} accent="red" />
        <StatTile label="Jobs booked" value={booked} accent="green" />
        <StatTile label="After-hours saves" value={afterHours} />
        <StatTile label="Trial signups" value={signupRows.length} />
      </section>

      <section className="mt-6">
        <ActivityBars calls={callRows} nowMs={nowMs} />
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
                <div className="mt-2 text-sm text-content-tertiary">{n} calls logged</div>
                <a
                  href={`/portal/${c.access_key}`}
                  className="mt-3 inline-block break-all text-xs font-medium text-[#7cb3f2] hover:text-white"
                >
                  Client portal → /portal/{c.access_key}
                </a>
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
