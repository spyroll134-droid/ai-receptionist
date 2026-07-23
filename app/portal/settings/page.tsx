import { redirect } from "next/navigation";
import { avgTicketFor, site } from "@/lib/site-config";
import { getCurrentClient } from "@/lib/supabase-auth";
import { prettyPhone } from "@/lib/phone";
import { Empty, OpsShell, Panel } from "@/components/ops";
import { PORTAL_NAV } from "@/components/portal-nav";
import AlertRetriesPicker from "@/components/AlertRetriesPicker";
import AvgTicketEditor from "@/components/AvgTicketEditor";
import VoicemailToggle from "@/components/VoicemailToggle";

// The portal's second tab. Exists mostly to give the voicemail list a home:
// numbers could be routed to voicemail from a call row, but the only way to
// undo it was to find another call from that same number — so a number routed
// by mistake was effectively stuck. A setting you can turn on and not off is
// worse than no setting.

export const dynamic = "force-dynamic";

export default async function PortalSettings() {
  const session = await getCurrentClient();
  if (!session) redirect("/login");
  const { client } = session;

  const numbers: string[] = client.voicemail_numbers ?? [];
  const avgTicket = avgTicketFor(client.trade, client.avg_ticket_dollars);

  return (
    <OpsShell
      active="/portal/settings"
      nav={PORTAL_NAV}
      brandHref="/portal"
      brandLabel={client.name}
      title="Settings"
      counts={{ "/portal/settings": numbers.length }}
    >
      <Panel title="Numbers routed to voicemail">
        <div className="p-4">
          <p className="max-w-prose text-sm text-content-secondary">
            These callers get a short message-taking greeting instead of the
            usual intake questions. They&apos;re still answered, still recorded,
            and you still get the message — the AI just doesn&apos;t treat them
            as a service call.
          </p>

          {numbers.length === 0 ? (
            <div className="mt-4">
              <Empty>
                Nothing routed to voicemail. Open a call under Calls and use
                &ldquo;Send this number to voicemail instead&rdquo; to add one.
              </Empty>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line-subtle border-y border-line-subtle">
              {numbers.map((n) => (
                <li
                  key={n}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <span className="font-mono text-sm tabular-nums text-content-primary">
                    {prettyPhone(n) ?? n}
                  </span>
                  {/* enabled -> the button reads "answer normally again", so
                      this list is the undo that was missing. */}
                  <VoicemailToggle number={n} enabled />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="mt-4">
        <Panel title="Emergency call-backs">
          <div className="p-4">
            <p className="max-w-prose text-sm text-content-secondary">
              When an emergency comes in that you didn&apos;t take live, your AI
              line calls you with the details. If you don&apos;t pick up, it
              tries again — choose how many times.
            </p>
            <div className="mt-4">
              <AlertRetriesPicker retries={client.alert_retries ?? 2} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Average job value">
          <div className="p-4">
            <p className="max-w-prose text-sm text-content-secondary">
              Used only to work out the &ldquo;revenue protected&rdquo; figure
              on your calls page. It changes nothing about how calls are
              answered.
            </p>
            <div className="mt-3">
              <AvgTicketEditor
                avgTicket={avgTicket}
                isOverride={client.avg_ticket_dollars != null}
              />
            </div>
          </div>
        </Panel>
      </div>

      <p className="mt-6 text-xs text-content-tertiary">
        Need something changed? {site.contactEmail}
      </p>
    </OpsShell>
  );
}
