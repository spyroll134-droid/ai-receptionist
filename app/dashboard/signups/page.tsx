import { requireAdmin } from "@/lib/supabase-auth";
import { fmt } from "@/components/dash";
import { loadOps } from "@/lib/ops";
import {
  Empty,
  NotAuthorized,
  OpsShell,
  Panel,
  Table,
  Td,
  Th,
} from "@/components/ops";

// Trial signups from the marketing form. This is a call list, so the phone
// number is a tel: link and the newest row is on top — the whole view exists
// to be worked top to bottom.

export const dynamic = "force-dynamic";

export default async function Signups() {
  if (!(await requireAdmin())) return <NotAuthorized />;

  const { calls, signups, clients } = await loadOps();

  return (
    <OpsShell
      badge="Internal"
      active="/dashboard/signups"
      title="Trial signups"
      counts={{
        "/dashboard/calls": calls.length,
        "/dashboard/clients": clients.length,
        "/dashboard/signups": signups.length,
      }}
    >
      <Panel title={`${signups.length} total`}>
        {signups.length === 0 ? (
          <Empty>Website form submissions land here.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Trade</Th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-line-subtle last:border-0 hover:bg-surface-raised"
                >
                  <Td className="whitespace-nowrap text-content-tertiary">
                    {fmt(s.created_at)}
                  </Td>
                  <Td className="font-medium text-content-primary">
                    {s.company_name}
                  </Td>
                  <Td className="text-content-secondary">{s.contact_name}</Td>
                  <Td className="whitespace-nowrap">
                    <a
                      href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}
                      className="text-accent-text transition-colors hover:text-content-primary"
                    >
                      {s.phone}
                    </a>
                  </Td>
                  <Td className="text-content-secondary">
                    {s.email ? (
                      <a
                        href={`mailto:${s.email}`}
                        className="transition-colors hover:text-content-primary"
                      >
                        {s.email}
                      </a>
                    ) : (
                      <span className="text-content-faint">—</span>
                    )}
                  </Td>
                  <Td className="text-content-secondary">
                    {s.trade ?? <span className="text-content-faint">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </OpsShell>
  );
}
