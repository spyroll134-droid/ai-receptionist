import { redirect } from "next/navigation";
import { avgTicketFor } from "@/lib/site-config";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";
import { requestNow } from "@/lib/now";
import {
  isDeadAir,
  isDueForNudge,
  lastLeadActivity,
  needsFollowUp,
  needsReconcile,
  type CallRow,
} from "@/components/dash";
import { Empty, OpsShell, Panel } from "@/components/ops";
import { PORTAL_NAV } from "@/components/portal-nav";
import FollowUpQueue from "@/components/FollowUpQueue";
import ReconcileQueue from "@/components/ReconcileQueue";
import AvgTicketEditor from "@/components/AvgTicketEditor";

// The Leads tab — the work queue, moved off the home page so the Dashboard can
// answer "is this paying for itself?" without also being a to-do list. Two
// halves of the same lifecycle live here: chasing captured leads that haven't
// closed (FollowUpQueue, with the assisted-nudge prompt) and closing out booked
// jobs old enough to have happened (ReconcileQueue → real won/lost data).
//
// Emergencies are deliberately NOT here — they get the loud act-now banner on
// the Dashboard, because "someone is waiting on a callback right now" is a
// different urgency than "this estimate is going cold."

export const dynamic = "force-dynamic";

export default async function PortalLeads() {
  const session = await getCurrentClient();
  if (!session) redirect("/login");
  const { client } = session;

  const nowMs = await requestNow();
  const supabase = await getSupabaseSessionClient();

  const { data } = await supabase
    .from("calls")
    .select("*")
    .order("created_at", { ascending: false });
  const connected = ((data ?? []) as CallRow[]).filter((c) => !isDeadAir(c));

  const avgTicket = avgTicketFor(client.trade, client.avg_ticket_dollars);
  const booked = connected.filter((c) => c.booked).length;

  // Non-emergency leads not yet won, lost, or scheduled — most overdue first, so
  // the lead closest to going cold sits on top.
  const followUps = connected
    .filter(needsFollowUp)
    .sort(
      (a, b) =>
        new Date(lastLeadActivity(a)).getTime() -
        new Date(lastLeadActivity(b)).getTime(),
    );
  const dueForNudge = followUps.filter((c) => isDueForNudge(c, nowMs)).length;

  // Booked jobs old enough to have happened, waiting to be marked won/lost.
  const reconcile = connected
    .filter((c) => needsReconcile(c, nowMs))
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const nothingToDo = followUps.length === 0 && reconcile.length === 0;

  return (
    <OpsShell
      active="/portal/leads"
      nav={PORTAL_NAV}
      brandHref="/portal"
      brandLabel={client.name}
      title="Leads"
      counts={{ "/portal/leads": followUps.length + reconcile.length }}
    >
      {followUps.length > 0 && (
        <div id="followups" className="scroll-mt-16">
          <Panel
            title="Needs follow-up"
            action={
              dueForNudge > 0 ? (
                <span className="text-2xs">
                  <span className="font-semibold text-caution-text">
                    <span aria-hidden>◷ </span>
                    {dueForNudge} due for a nudge
                  </span>
                  <span className="text-content-faint">
                    {" "}
                    · {followUps.length} total
                  </span>
                </span>
              ) : (
                <span className="text-2xs text-content-faint">
                  {followUps.length} {followUps.length === 1 ? "lead" : "leads"}{" "}
                  · oldest first
                </span>
              )
            }
          >
            <FollowUpQueue
              leads={followUps}
              nowMs={nowMs}
              clientName={client.name}
            />
          </Panel>
        </div>
      )}

      {/* Owns its own Panel and its own presence — nothing on a fresh empty
          load, a short "all caught up" beat when you clear the last item. */}
      <div id="reconcile" className="mt-4 scroll-mt-16">
        <ReconcileQueue leads={reconcile} avgTicket={avgTicket} nowMs={nowMs} />
      </div>

      {nothingToDo && (
        <Panel title="Your work queue">
          <div className="p-4">
            <Empty>
              Nothing needs you right now. When a new lead comes in that hasn&apos;t
              been reached, or a booked job is old enough to confirm, it shows up
              here — most overdue first.
            </Empty>
          </div>
        </Panel>
      )}

      <div className="mt-4">
        <AvgTicketEditor
          booked={booked}
          avgTicket={avgTicket}
          isOverride={client.avg_ticket_dollars != null}
        />
      </div>
    </OpsShell>
  );
}
