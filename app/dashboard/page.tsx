import { getSupabaseServerClient } from "@/lib/supabase";
import { site } from "@/lib/site-config";

// Internal ops dashboard: every call the AI answers and every trial signup,
// in one place. Gated by DASHBOARD_KEY (?key=...) — not linked anywhere
// public. Server-rendered fresh on every load.

export const dynamic = "force-dynamic";

type CallRow = {
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

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/Detroit",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "red" | "green" | "slate" | "blue" }) {
  const tones = {
    red: "bg-red-100 text-red-800",
    green: "bg-green-100 text-green-800",
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
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
      <main className="mx-auto max-w-md px-6 py-32 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Not authorized</h1>
        <p className="mt-2 text-sm text-slate-500">
          Append ?key=YOUR_KEY to the URL.
        </p>
      </main>
    );
  }

  const supabase = getSupabaseServerClient();
  const [{ data: calls }, { data: signups }] = await Promise.all([
    supabase
      .from("calls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("trial_signups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const callRows = (calls ?? []) as CallRow[];
  const signupRows = (signups ?? []) as SignupRow[];
  const emergencies = callRows.filter((c) => c.emergency).length;
  const booked = callRows.filter((c) => c.booked).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          {site.businessName} — Operations
        </h1>
        <span className="text-sm text-slate-500">
          Live from the database · refresh for latest
        </span>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Calls answered", callRows.length],
          ["Emergencies", emergencies],
          ["Jobs booked", booked],
          ["Trial signups", signupRows.length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-semibold text-slate-900">{n}</div>
            <div className="mt-1 text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-900">Calls</h2>
        {callRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No calls logged yet. Call the demo line — every completed call
            lands here automatically with its transcript and intake data.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {callRows.map((c) => (
              <details key={c.id} className="rounded-xl border border-slate-200 p-4">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 list-none">
                  <span className="font-medium text-slate-900">
                    {c.caller_name || "Unknown caller"}
                  </span>
                  <span className="text-sm text-slate-500">{fmt(c.created_at)}</span>
                  {c.emergency ? <Badge tone="red">EMERGENCY</Badge> : <Badge tone="slate">routine</Badge>}
                  {c.booked && <Badge tone="green">booked</Badge>}
                  {c.transferred_to_owner && <Badge tone="blue">transferred</Badge>}
                  <span className="ml-auto text-sm text-slate-500">{c.trade}</span>
                </summary>
                <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <div>Callback: {c.callback_number ?? "—"}</div>
                  <div>Address: {c.service_address ?? "—"}</div>
                  <div>Standing water: {c.standing_water == null ? "—" : c.standing_water ? "yes" : "no"}</div>
                  <div>Category: {c.category ?? "—"}</div>
                  <div>Insurance: {c.insurance_carrier ?? "—"}</div>
                  <div>Arrival window: {c.arrival_window ?? "—"}</div>
                  <div>Owner notified: {c.owner_notified_at ? fmt(c.owner_notified_at) : "not yet"}</div>
                  {c.recording_url && (
                    <div>
                      <a href={c.recording_url} className="text-blue-600 underline">
                        Recording
                      </a>
                    </div>
                  )}
                </div>
                {c.summary && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{c.summary}</p>
                )}
                {c.transcript && (
                  <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                    {c.transcript}
                  </pre>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-900">Trial signups</h2>
        {signupRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No signups yet. Submissions from the website form land here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Company</th>
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Trade</th>
                </tr>
              </thead>
              <tbody>
                {signupRows.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{fmt(s.created_at)}</td>
                    <td className="py-2 pr-4 font-medium text-slate-900">{s.company_name}</td>
                    <td className="py-2 pr-4">{s.contact_name}</td>
                    <td className="py-2 pr-4">{s.phone}</td>
                    <td className="py-2 pr-4">{s.trade ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
