import Link from "next/link";
import { redirect } from "next/navigation";
import { avgTicketFor, site } from "@/lib/site-config";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";
import { requestNow } from "@/lib/now";
import {
  Badge,
  deltaPct,
  fmt,
  isDeadAir,
  isDueForNudge,
  medianSpeedToLead,
  needsFollowUp,
  needsReconcile,
  type CallRow,
} from "@/components/dash";
import { OpsShell, Panel, StatStrip } from "@/components/ops";
import { PORTAL_NAV } from "@/components/portal-nav";
import EmergencyQueue from "@/components/EmergencyQueue";
import TrialProof, { pickTrialProof } from "@/components/TrialProof";
import PortalHero from "@/components/PortalHero";
import DayLineStrip from "@/components/DayLineStrip";
import RecentCallsFeed from "@/components/RecentCallsFeed";
import SetupChecklist from "@/components/SetupChecklist";

// The Dashboard — the portal's home and the answer to the only question a
// paying contractor really has: is this line paying for itself? Everything here
// serves that in five seconds — the estimated value of booked jobs at hero
// weight, four supporting KPIs, the 24-hour line strip as the brand moment, and
// the recent-calls feed as living proof. The full record (Calls), the work
// queue (Leads) and the booking ledger (Bookings) each moved to their own tab
// so this page never becomes a to-do list.

const CALL_LIMIT = 200;
// The hero and KPI row describe a rolling 30 days (one billing cycle), with the
// delta measured against the prior 30 — "this month vs last month" is the frame
// that answers the invoice question.
const PERIOD_DAYS = 30;

export const dynamic = "force-dynamic";

export default async function Portal() {
  const session = await getCurrentClient();
  if (!session) redirect("/login");
  const { client } = session;

  const nowMs = await requestNow();
  const supabase = await getSupabaseSessionClient();

  // RLS scopes to the signed-in client's own calls (defence in depth — no .eq).
  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(CALL_LIMIT);
  const calls = (data ?? []) as CallRow[];
  // Stat tiles count real conversations only; dead air is excluded.
  const connected = calls.filter((c) => !isDeadAir(c));

  const avgTicket = avgTicketFor(client.trade, client.avg_ticket_dollars);

  // Period windows for the hero + KPIs.
  const periodStart = nowMs - PERIOD_DAYS * 86_400_000;
  const prevStart = nowMs - 2 * PERIOD_DAYS * 86_400_000;
  const inPeriod = (c: CallRow) => new Date(c.created_at).getTime() >= periodStart;
  const inPrevPeriod = (c: CallRow) => {
    const t = new Date(c.created_at).getTime();
    return t >= prevStart && t < periodStart;
  };

  const period = connected.filter(inPeriod);
  const bookedNow = period.filter((c) => c.booked).length;
  const bookedPrev = connected.filter(inPrevPeriod).filter((c) => c.booked).length;
  const heroValue = bookedNow * avgTicket;
  const heroDelta = deltaPct(bookedNow, bookedPrev);

  const emergenciesNow = period.filter((c) => c.emergency).length;
  const alertSpeed = medianSpeedToLead(period);
  const emergencyAlertSpeed = medianSpeedToLead(period.filter((c) => c.emergency));

  // "Is anything on fire right now?" — emergencies still waiting on a human
  // (not transferred, not booked, not acknowledged). All-time, not period-
  // scoped: an open emergency is open regardless of when it rang.
  const openEmergencies = connected.filter(
    (c) => c.emergency && !c.transferred_to_owner && !c.booked && !c.acknowledged_at,
  );
  const needsCallback = openEmergencies.length;

  // Cheap counts for the "needs you" link into the Leads tab (the queues live
  // there now). Same predicates the Leads page sorts on.
  const dueForNudge = connected.filter(
    (c) => needsFollowUp(c) && isDueForNudge(c, nowMs),
  ).length;
  const toConfirm = connected.filter((c) => needsReconcile(c, nowMs)).length;

  // The proof feed and the booked snapshot: newest first (calls arrive desc).
  const recent = connected.slice(0, 8);
  const recentBooked = connected.filter((c) => c.booked).slice(0, 3);

  // Trial proof, hoisted while the trial is live.
  const trialEndsMs =
    new Date(client.created_at).getTime() + site.pricing.trialDays * 86_400_000;
  const trialDaysLeft = Math.ceil((trialEndsMs - nowMs) / 86_400_000);
  const trialProof = trialDaysLeft > 0 ? pickTrialProof(connected) : null;

  return (
    <OpsShell
      active="/portal"
      nav={PORTAL_NAV}
      brandHref="/portal"
      brandLabel={client.name}
      title="Dashboard"
      actions={
        <span className="whitespace-nowrap text-2xs uppercase tracking-wide text-content-faint">
          {client.trade}
        </span>
      }
    >
      {trialProof && (
        <TrialProof call={trialProof} daysLeft={trialDaysLeft} avgTicket={avgTicket} />
      )}

      {/* "Needs you" — a quiet link into the work queue, only when there's work.
          The loud act-now emergency banner is separate, right below. */}
      {dueForNudge + toConfirm > 0 && (
        <Link
          href="/portal/leads"
          className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line-default bg-surface-raised px-4 py-2.5 text-xs transition-colors hover:border-line-strong"
        >
          <span className="font-semibold uppercase tracking-wide text-content-tertiary">
            Needs you
          </span>
          {dueForNudge > 0 && (
            <span className="text-caution-text">
              <span aria-hidden>◷ </span>
              {dueForNudge} to nudge
            </span>
          )}
          {dueForNudge > 0 && toConfirm > 0 && (
            <span className="text-content-faint">·</span>
          )}
          {toConfirm > 0 && (
            <span className="text-content-secondary">{toConfirm} to confirm</span>
          )}
          <span aria-hidden className="ml-auto text-content-faint">
            →
          </span>
        </Link>
      )}

      {/* Is anything on fire? Surfaced above everything else. */}
      {needsCallback > 0 && (
        <div id="needs-callback" className="mb-4 scroll-mt-16">
          <EmergencyQueue calls={openEmergencies} />
        </div>
      )}

      {/* HERO — the estimated value of booked jobs, this period. */}
      <PortalHero
        value={heroValue}
        booked={bookedNow}
        avgTicket={avgTicket}
        callsCaught={period.length}
        delta={heroDelta}
        periodLabel="period"
      />

      {/* FOUR KPIs — each a real, measured deliverable. No "answer rate" (~100%
          by design) and no "answer speed" (unclocked); the honest responsiveness
          metric is speed-to-lead (alert-to-phone). */}
      <div className="mt-4">
        <StatStrip
          items={[
            { label: "Calls caught", value: period.length },
            {
              label: "Jobs booked by AI",
              value: bookedNow,
              tone: "positive",
              glyph: "✓",
            },
            {
              label: "Emergencies flagged",
              value: emergenciesNow,
              tone: "critical",
              glyph: "▲",
              sub: emergencyAlertSpeed
                ? `median alert in ${emergencyAlertSpeed}`
                : undefined,
            },
            {
              label: "Median speed-to-lead",
              value: alertSpeed ?? "—",
              sub: alertSpeed ? "call to your phone" : "once a call alerts you",
            },
          ]}
        />
      </div>

      <p className="mt-2 px-1 text-2xs text-content-tertiary">
        <span className="text-positive-text" aria-hidden>
          ✓{" "}
        </span>
        Answered 24/7 · every call · never a voicemail · last {PERIOD_DAYS} days
      </p>

      {/* Signature element — the 24-hour line strip. */}
      <div className="mt-4">
        <DayLineStrip calls={connected} nowMs={nowMs} />
      </div>

      {/* Proof layer — recent calls with recording + transcript on demand. */}
      <div className="mt-4">
        <Panel
          title="Recent calls"
          action={
            <Link
              href="/portal/calls"
              className="text-2xs font-medium text-accent-text hover:text-content-primary"
            >
              All calls →
            </Link>
          }
        >
          {recent.length > 0 ? (
            <RecentCallsFeed calls={recent} avgTicket={avgTicket} />
          ) : (
            <p className="px-4 py-10 text-center text-sm text-content-tertiary">
              No calls yet. The moment your AI catches one, it appears here with
              the recording and full transcript.
            </p>
          )}
        </Panel>
      </div>

      {/* Booked-jobs snapshot — source attribution, links to the full ledger. */}
      {recentBooked.length > 0 && (
        <div className="mt-4">
          <Panel
            title="Booked by your AI line"
            action={
              <Link
                href="/portal/bookings"
                className="text-2xs font-medium text-accent-text hover:text-content-primary"
              >
                All bookings →
              </Link>
            }
          >
            <ul className="divide-y divide-line-subtle">
              {recentBooked.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-content-primary">
                      {c.caller_name || "Unknown caller"}
                    </span>
                    <Badge tone="good">✓ Booked by your AI line</Badge>
                    <span className="text-2xs text-content-faint">
                      {fmt(c.created_at)}
                    </span>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-positive-text">
                    ~${avgTicket.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {/* Activation driver — real settings only. */}
      <div className="mt-4">
        <SetupChecklist
          avgTicketSet={client.avg_ticket_dollars != null}
          alertRetriesSet={client.alert_retries != null}
          voicemailSet={(client.voicemail_numbers?.length ?? 0) > 0}
        />
      </div>
    </OpsShell>
  );
}
