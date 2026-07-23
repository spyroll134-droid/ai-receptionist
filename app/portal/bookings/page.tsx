import { redirect } from "next/navigation";
import { avgTicketFor } from "@/lib/site-config";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";
import { fmt, isDeadAir, type CallRow } from "@/components/dash";
import { Badge } from "@/components/dash";
import { Empty, OpsShell, Panel, StatStrip } from "@/components/ops";
import { PORTAL_NAV } from "@/components/portal-nav";
import { prettyPhone } from "@/lib/phone";
import LeadStatus from "@/components/LeadStatus";

// The Bookings tab — jobs the AI put on the books, and how they closed out.
// This is the source-attribution layer the spec asks for ("Booked by your AI
// line"): every booked job the owner can point at and say "that one came from
// the line." It supersedes the old Outcomes tab, folding the won / didn't-book
// ledger in beneath the live pipeline so the whole booking lifecycle lives in
// one place.
//
// Honest framing preserved from Outcomes: a "lost" lead is "Didn't book", never
// a loss and never rolled into a win-rate scorecard — without this line the
// call would have gone to voicemail and the owner would never have known the
// lead existed.

export const dynamic = "force-dynamic";

export default async function PortalBookings() {
  const session = await getCurrentClient();
  if (!session) redirect("/login");
  const { client } = session;

  const supabase = await getSupabaseSessionClient();

  // RLS scopes this to the signed-in client's own calls. No row cap: booked
  // jobs and closed leads accumulate slowly (a human files each outcome), and a
  // ledger that silently truncates isn't a ledger.
  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false });
  const calls = ((data ?? []) as CallRow[]).filter((c) => !isDeadAir(c));

  const avgTicket = avgTicketFor(client.trade, client.avg_ticket_dollars);

  const booked = calls.filter((c) => c.booked);
  const won = calls.filter((c) => c.lead_status === "won");
  const didntBook = calls.filter((c) => c.lead_status === "lost");
  // The live pipeline: booked jobs not yet closed out. The closed ones drop
  // into the Won / Didn't-book ledger below, so nothing appears twice.
  const pipeline = booked.filter(
    (c) => c.lead_status !== "won" && c.lead_status !== "lost",
  );

  const bookedValue = booked.length * avgTicket;
  const wonValue = won.length * avgTicket;

  const nothing = booked.length === 0 && won.length === 0 && didntBook.length === 0;

  return (
    <OpsShell
      active="/portal/bookings"
      nav={PORTAL_NAV}
      brandHref="/portal"
      brandLabel={client.name}
      title="Bookings"
      counts={{ "/portal/bookings": booked.length }}
    >
      {nothing ? (
        <Panel title="Booked by your AI line">
          <div className="p-4">
            <Empty>
              No jobs booked yet. The moment your AI line books one, it appears
              here tagged as its own — and once the job has happened, you mark it{" "}
              <strong>✓ Won</strong> or <strong>Didn&apos;t book</strong> to turn
              the estimate into your real revenue from this line.
            </Empty>
          </div>
        </Panel>
      ) : (
        <>
          <StatStrip
            items={[
              {
                label: "Jobs booked by your AI",
                value: booked.length,
                tone: "positive",
                glyph: "✓",
                sub: "Booked by your line to date",
                emphasis: true,
              },
              {
                label: "Est. value booked",
                value: `$${bookedValue.toLocaleString()}`,
                tone: "positive",
                glyph: "✓",
                sub: `${booked.length} × $${avgTicket.toLocaleString()} avg job`,
              },
              {
                label: "Confirmed won",
                value: `$${wonValue.toLocaleString()}`,
                sub: `${won.length} job${won.length === 1 ? "" : "s"} closed`,
              },
              {
                label: "Didn't book",
                value: didntBook.length,
                sub: "Captured, didn't turn into a job",
              },
            ]}
          />

          <BookingList
            title="Booked by your AI line"
            subtitle="Waiting to confirm the outcome"
            leads={pipeline}
            value={avgTicket}
            attributed
          />
          <BookingList title="Won" leads={won} value={avgTicket} />
          <BookingList title="Didn't book" leads={didntBook} />
        </>
      )}
    </OpsShell>
  );
}

function BookingList({
  title,
  subtitle,
  leads,
  value,
  attributed,
}: {
  title: string;
  subtitle?: string;
  leads: CallRow[];
  /** Estimated dollars per row. Omitted for the "didn't book" list. */
  value?: number;
  /** Show the "Booked by your AI line" source tag on each row. */
  attributed?: boolean;
}) {
  if (leads.length === 0) return null;
  return (
    <div className="mt-4">
      <Panel
        title={title}
        action={
          <span className="text-2xs text-content-faint">
            {subtitle ? `${subtitle} · ` : ""}
            {leads.length} {leads.length === 1 ? "job" : "jobs"}
          </span>
        }
      >
        <ul className="divide-y divide-line-subtle">
          {leads.map((c) => {
            const reach = c.callback_number || c.caller_id;
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-content-primary">
                      {c.caller_name || "Unknown caller"}
                    </span>
                    {prettyPhone(reach) && (
                      <span className="truncate font-mono text-2xs text-content-tertiary">
                        {prettyPhone(reach)}
                      </span>
                    )}
                    {attributed && (
                      <Badge tone="good">✓ Booked by your AI line</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-content-tertiary">
                    Called {fmt(c.created_at)}
                    {value != null && (
                      <>
                        {" · "}
                        <span className="text-positive-text">
                          about ${value.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* The close-out control — mark won / didn't-book right where the
                    job is seen, not by hunting the call down in the log. Moving
                    it off won/lost re-files the row on revalidation. */}
                <LeadStatus callId={c.id} value={c.lead_status} compact />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
