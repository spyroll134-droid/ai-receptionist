// The one card grammar every panel in the app shares: a hairline-bordered
// section with a short uppercase title bar and an optional right-aligned action
// slot. Pulled into its own module (out of ops.tsx, which carries server-only
// imports) so client components can render the same chrome — a panel that looks
// different from its neighbours is the fastest way for a tool to feel amateur.
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line-default">
      <div className="flex h-10 items-center justify-between border-b border-line-subtle bg-surface-raised px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-content-secondary">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
