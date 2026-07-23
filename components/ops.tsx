import Link from "next/link";
import { site } from "@/lib/site-config";
import { signOut } from "@/app/actions/auth";
import { hasClientPortal, requireAdmin } from "@/lib/supabase-auth";
import { prettyPhone, smsHref, telHref } from "@/lib/phone";
import {
  StatusBadges,
  fmt,
  looksPersonal,
  type CallRow,
} from "@/components/dash";
import VoicemailToggle from "@/components/VoicemailToggle";
import { NavPending } from "@/components/NavPending";

// Chrome for both signed-in surfaces: the internal ops app (/dashboard/*) and
// the client portal (/portal/*). It started as ops-only, with dash.tsx dressing
// the portal — but keeping two shells meant every fix had to be made twice, and
// one of them silently didn't get made (the recording player was repaired in
// dash.tsx while the view people actually used lived here). One shell, two nav
// lists.
//
// What still differs is CONTENT, not layout: the portal never shows cost_usd or
// anything about other clients. That's enforced at the page, not here.
//
// The visual grammar here is management software, not marketing: full-bleed
// width, hairline borders instead of shadows, small radii, dense rows,
// tabular numerals. No decorative gradients — every pixel is either data or
// a boundary between data.

export type NavItem = { href: string; label: string };

const OPS_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/signups", label: "Signups" },
];

export async function OpsShell({
  active,
  title,
  actions,
  counts,
  nav = OPS_NAV,
  brandHref = "/",
  brandLabel,
  badge,
  children,
}: {
  active: string;
  title: string;
  actions?: React.ReactNode;
  counts?: Partial<Record<string, number>>;
  /** Defaults to the internal ops views; the client portal passes its own. */
  nav?: NavItem[];
  /**
   * Where the wordmark goes. The ops app sends you to the marketing site,
   * but in the portal that's a trapdoor out of the product — a signed-in
   * contractor clicking their own business name expects to land back on
   * their calls, not on a sales page.
   */
  brandHref?: string;
  /** Defaults to our business name; the portal shows the client's. */
  brandLabel?: string;
  /**
   * Marks which surface you're on. The two views share a shell, so without
   * this an operator who is also a client user — which is everyone testing
   * the product — can't tell at a glance whether they're looking at one
   * client's data or everyone's.
   *
   * Opt-in rather than defaulted to "Internal": if a future portal page
   * forgets to set it the client sees no badge, which is harmless. A default
   * would mean forgetting shows "Internal" to a paying customer.
   */
  badge?: string;
  children: React.ReactNode;
}) {
  // Which surface this is, and whether the viewer can reach the other one.
  // Anyone who is both an admin and a client user — which is everyone while
  // the product is being built and tested — otherwise has to retype the URL
  // to cross between them.
  const onOps = active.startsWith("/dashboard");
  const canCross = onOps ? await hasClientPortal() : await requireAdmin();
  const cross = onOps
    ? { href: "/portal", label: "Client view" }
    : { href: "/dashboard", label: "Ops view" };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div className="flex min-h-screen">
        {/* Sidebar. Fixed width, its own darker plane so the eye reads the
            content area as the workspace and this as the frame. */}
        <aside className="hidden w-56 flex-none flex-col border-r border-line-subtle bg-surface-inset md:flex">
          <div className="flex h-12 items-center gap-2 border-b border-line-subtle px-4">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-[2px] ${badge ? "bg-caution" : "bg-accent"}`}
            />
            <Link
              href={brandHref}
              className="truncate text-sm font-semibold tracking-tight text-content-primary"
            >
              {brandLabel ?? site.businessName}
            </Link>
          </div>

          {badge && (
            // Amber, and stated in words — the colour alone would be the only
            // signal for anyone who can't distinguish it from the accent.
            <div className="border-b border-line-subtle px-4 py-2">
              <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ring-1 ring-caution-line bg-caution-surface text-caution-text">
                {badge}
              </span>
            </div>
          )}

          <nav className="flex-1 p-2">
            {nav.map((item) => {
              const isActive = item.href === active;
              const n = counts?.[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-surface-overlay font-medium text-content-primary"
                      : "text-content-secondary hover:bg-surface-raised hover:text-content-primary"
                  }`}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent"
                    />
                  ) : (
                    // Non-active tabs light this rail the instant they're
                    // clicked, so a fast client navigation still feels tapped.
                    <NavPending />
                  )}
                  <span>{item.label}</span>
                  {n != null && n > 0 && (
                    <span className="text-2xs tabular-nums text-content-faint">
                      {n}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {canCross && (
            <div className="border-t border-line-subtle p-2">
              <Link
                href={cross.href}
                className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-content-secondary transition-colors hover:bg-surface-raised hover:text-content-primary"
              >
                <span>{cross.label}</span>
                <span aria-hidden className="text-content-faint">
                  ↗
                </span>
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-line-subtle p-3">
            <span className="text-2xs uppercase text-content-faint">Detroit time</span>
            <SignOutButton />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile nav — the sidebar collapses to a scrollable tab strip
              rather than a hamburger; four items don't earn a menu. */}
          {/* The sidebar badge is hidden below md, so it has to be restated
              here or the two surfaces become indistinguishable on a phone —
              which is where this gets checked most. */}
          {badge && (
            <div className="border-b border-line-subtle px-3 py-1.5 md:hidden">
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ring-1 ring-caution-line bg-caution-surface text-caution-text">
                {badge}
              </span>
            </div>
          )}

          <nav className="flex gap-1 overflow-x-auto border-b border-line-subtle px-3 py-2 md:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === active ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-md px-2.5 py-1 text-sm ${
                  item.href === active
                    ? "bg-surface-overlay font-medium text-content-primary"
                    : "text-content-secondary"
                }`}
              >
                {item.href !== active && <NavPending />}
                {item.label}
              </Link>
            ))}
          </nav>

          <header className="flex h-12 flex-none items-center justify-between gap-4 border-b border-line-subtle px-5">
            <h1 className="truncate text-sm font-semibold text-content-primary">
              {title}
            </h1>
            <div className="flex items-center gap-4">
              {actions}
              {/* The sidebar (and its sign-out) is hidden below md, so the
                  control has to exist here too or small screens strand you
                  signed in with no way out. */}
              {canCross && (
                <Link
                  href={cross.href}
                  className="whitespace-nowrap text-2xs uppercase tracking-wide text-content-tertiary transition-colors hover:text-content-primary md:hidden"
                >
                  {cross.label} ↗
                </Link>
              )}
              <span className="md:hidden">
                <SignOutButton />
              </span>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-5">{children}</main>
        </div>
      </div>
    </div>
  );
}

/**
 * Sign out. A form posting to the server action rather than a link, because
 * signing out is a state change — a GET would let any page prefetch or any
 * crawler log you out.
 */
function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="text-2xs uppercase tracking-wide text-content-tertiary transition-colors hover:text-content-primary"
      >
        Sign out
      </button>
    </form>
  );
}

/** Shown in place of any ops view to a signed-out or non-admin visitor.
 *  Deliberately says nothing about what the view contains. */
export function NotAuthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-6 text-content-primary">
      <div className="text-center">
        <p className="text-sm text-content-tertiary">
          Sign in with an admin account to view this.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-block text-sm font-medium text-accent-text hover:text-content-primary"
        >
          Go to sign in →
        </Link>
      </div>
    </div>
  );
}

/**
 * Compact metric strip. One bordered rail split by dividers rather than
 * detached cards — it reads as a single status bar, which is what it is.
 * Numbers are text-xl, not text-3xl: in an internal tool the operator
 * already knows what they're looking at, so the label carries as much
 * weight as the figure.
 */
export type StatItem = {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "critical" | "positive";
  /**
   * A character rendered before the value. This is what keeps a toned tile
   * legible when the color isn't: critical and caution are the same hue under
   * deuteranopia (see the measured note in app/globals.css), so a tile whose
   * only distinguishing mark is its color is a tile some readers can't read.
   * Pass one whenever `tone` is set.
   */
  glyph?: string;
  /** Promote to the headline figure — larger, and spanning two columns. */
  emphasis?: boolean;
  /** Make the tile a link into a filtered view. */
  href?: string;
};

export function StatStrip({ items }: { items: StatItem[] }) {
  // Column count follows the number of column *units*, not the number of
  // items — an emphasised tile occupies two. Counting items instead leaves the
  // last tile stranded alone on a second row.
  const units = items.length + items.filter((i) => i.emphasis).length;
  const cols =
    units <= 3
      ? "sm:grid-cols-3"
      : units === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-3 lg:grid-cols-5";

  return (
    <div
      className={`grid grid-cols-2 divide-x divide-y divide-line-subtle overflow-hidden rounded-lg border border-line-default lg:divide-y-0 ${cols}`}
    >
      {items.map((s) => {
        const toneText =
          s.tone === "critical"
            ? "text-critical-text"
            : s.tone === "positive"
              ? "text-positive-text"
              : "text-content-primary";

        const body = (
          <>
            <div className="text-2xs uppercase tracking-wide text-content-tertiary">
              {s.label}
            </div>
            <div
              className={`mt-1 font-semibold tabular-nums ${toneText} ${
                s.emphasis ? "text-3xl" : "text-xl"
              }`}
            >
              {s.glyph && (
                <span aria-hidden className="mr-1.5 font-normal">
                  {s.glyph}
                </span>
              )}
              {s.value}
            </div>
            {s.sub && (
              <div className="truncate text-2xs text-content-tertiary">{s.sub}</div>
            )}
          </>
        );

        const span = s.emphasis ? "sm:col-span-2 lg:col-span-2" : "";

        return s.href ? (
          <Link
            key={s.label}
            href={s.href}
            // Focus-visible ring: these tiles were keyboard-reachable (they're
            // links) but showed no focus outline, so a keyboard user tabbing the
            // strip couldn't tell which tile they were on. ring-inset because
            // the tile sits flush inside the bordered grid.
            className={`min-w-0 px-4 py-3 outline-none transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${span}`}
          >
            {body}
          </Link>
        ) : (
          <div key={s.label} className={`min-w-0 px-4 py-3 ${span}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

// Panel now lives in its own module so client components can share the chrome;
// re-exported here so existing `import { Panel } from "@/components/ops"` sites
// keep working.
export { Panel } from "./Panel";

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-sm text-content-tertiary">
      {children}
    </p>
  );
}

/** Table scaffolding. Shared so every table in the app has identical
 *  row height, padding and header treatment — inconsistency between two
 *  tables is the fastest way for a tool to feel amateur. */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full min-w-[44rem] text-left text-sm"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`h-8 border-b border-line-subtle bg-surface-raised px-4 text-2xs font-medium uppercase tracking-wide text-content-tertiary ${className}`}
    >
      {children}
    </th>
  );
}

/**
 * A tappable phone number. Raw E.164 and bare digit strings are what the
 * webhook stores; nobody reads those at a glance, and on a laptop with a
 * paired phone the tel: link is how a callback actually gets made.
 *
 * z-10 keeps it clickable above the row's stretched overlay link — otherwise
 * clicking the number would open the detail panel instead of dialling.
 */
export function PhoneLink({
  value,
  muted,
}: {
  value?: string | null;
  muted?: boolean;
}) {
  const pretty = prettyPhone(value);
  const href = telHref(value);
  if (!pretty) return <span className="text-content-faint">—</span>;
  if (!href)
    return (
      <span className={muted ? "text-content-tertiary" : "text-content-secondary"}>
        {pretty}
      </span>
    );
  return (
    <a
      href={href}
      className={`relative z-10 transition-colors hover:text-accent-text ${
        muted ? "text-content-tertiary" : "text-content-secondary"
      }`}
    >
      {pretty}
    </a>
  );
}

export function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}

/**
 * One call as a table row. The whole row is a link to ?call=<id>, which
 * opens the detail panel — so a row is deep-linkable and can be pasted to
 * someone else. The link wraps a cell's content rather than the <tr> because
 * an <a> cannot legally contain <td>s; the row-level affordance comes from
 * the hover state and the stretched overlay on the first cell.
 */
export function CallRowLine({
  c,
  clientName,
  selected,
  href,
}: {
  c: CallRow;
  clientName?: string;
  selected?: boolean;
  href: string;
}) {
  return (
    <tr
      className={`group border-b border-line-subtle transition-colors last:border-0 hover:bg-surface-raised ${
        selected ? "bg-surface-overlay" : ""
      }`}
    >
      <Td className="relative w-0 pr-0">
        <Link
          href={href}
          scroll={false}
          className="absolute inset-0 z-10"
          aria-label={`Open call from ${c.caller_name || "unknown caller"}`}
        />
        <span
          aria-hidden
          className={`block h-1.5 w-1.5 rounded-full ${
            c.emergency ? "bg-critical" : "bg-content-faint"
          }`}
        />
      </Td>
      <Td className="whitespace-nowrap text-content-tertiary">{fmt(c.created_at)}</Td>
      <Td className="font-medium text-content-primary">
        {c.caller_name || <span className="text-content-faint">Unknown</span>}
        {/* Carrier CNAM when we have it — a name the caller didn't have to
            give us, which is the one worth trusting on a callback. */}
        {c.caller_cnam && (
          <span className="ml-1.5 text-2xs font-normal text-content-faint">
            {c.caller_cnam}
          </span>
        )}
      </Td>
      <Td className="whitespace-nowrap">
        <PhoneLink value={c.callback_number} />
      </Td>
      {/* The number the carrier says they dialled from, as distinct from the
          one they read out loud. When the assistant mis-hears a spoken digit
          this is the only way back to the caller. */}
      <Td className="whitespace-nowrap">
        {c.caller_id && c.caller_id !== c.callback_number ? (
          <PhoneLink value={c.caller_id} muted />
        ) : (
          <span className="text-content-faint">—</span>
        )}
      </Td>
      {clientName !== undefined && (
        <Td className="truncate text-content-secondary">{clientName || "—"}</Td>
      )}
      <Td>
        <StatusBadges c={c} />
      </Td>
    </tr>
  );
}

/**
 * Detail panel for one call. Rendered server-side from ?call=<id> rather than
 * client state, so it survives refresh and can be linked to. On wide screens
 * it docks to the right of the table; on narrow ones it stacks above it.
 */
export function CallDetail({
  c,
  clientName,
  closeHref,
  voicemailNumbers,
}: {
  c: CallRow;
  clientName?: string;
  closeHref: string;
  /** This call's client's numbers already routed to voicemail, 10-digit. */
  voicemailNumbers?: string[];
}) {
  // Grouped rather than one flat list. A call record answers three different
  // questions — who called, what happened to them, what we did about it — and
  // a single 11-row dl makes you read all of it to answer any one of them.
  const groups: { heading: string; rows: [string, React.ReactNode][] }[] = [
    {
      heading: "Caller",
      rows: [
        ["Name", c.caller_name],
        ["Carrier name", c.caller_cnam],
        ["Callback", <PhoneLink key="cb" value={c.callback_number} />],
        ["Called from", <PhoneLink key="cid" value={c.caller_id} />],
        ["Line type", c.caller_line_type],
        ["Client", clientName ?? null],
      ],
    },
    {
      heading: "Incident",
      rows: [
        ["Trade", c.trade],
        ["Address", c.service_address],
        [
          "Standing water",
          c.standing_water == null ? null : c.standing_water ? "Yes" : "No",
        ],
        ["Water category", c.category],
        ["Loss date", c.loss_date],
        ["Insurance", c.insurance_carrier],
      ],
    },
    {
      heading: "Outcome",
      rows: [
        ["Arrival window", c.arrival_window],
        ["Booked", c.booked ? "Yes" : null],
        ["Transferred", c.transferred_to_owner ? "Yes" : null],
        ["Message for you", c.message_for_owner],
        ["Ended", c.ended_reason],
      ],
    },
    {
      heading: "System",
      rows: [
        [
          "Owner notified",
          c.owner_notified_at
            ? `${fmt(c.owner_notified_at)}${c.owner_notify_method ? ` · ${c.owner_notify_method}` : ""}`
            : null,
        ],
        // Ops-only. Never rendered in the client portal — a client seeing
        // that their $297/mo call cost 15 cents is a conversation nobody
        // needs to have.
        ["Call cost", c.cost_usd == null ? null : `$${c.cost_usd.toFixed(4)}`],
      ],
    },
  ];

  // Reaching the caller back: whichever number we actually have. The number
  // they read out loud is the better one when it exists, because it is the one
  // they chose to be reached on — caller ID can be an office trunk or a
  // spoofed outbound. Fall back to caller ID when they never gave one.
  const reach = c.callback_number || c.caller_id;
  const call = telHref(reach);
  const text = smsHref(
    reach,
    `Hi${c.caller_name ? ` ${c.caller_name.split(" ")[0]}` : ""}, this is ${
      clientName ?? site.businessName
    } following up on your call.`
  );

  return (
    <aside className="flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-line-default">
      <div className="flex h-10 flex-none items-center justify-between gap-2 border-b border-line-subtle bg-surface-raised px-4">
        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-content-secondary">
          {c.caller_name || "Unknown caller"}
        </h2>
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close detail"
          className="-mr-1 rounded px-1.5 text-sm text-content-tertiary hover:text-content-primary"
        >
          ✕
        </Link>
      </div>

      {/* Acting on a call used to mean reading it here, then finding the number
          again somewhere else. These are the two things anyone actually does
          next, docked above the record rather than buried inside it. */}
      {reach && (
        <div className="flex flex-none gap-2 border-b border-line-subtle px-4 py-2.5">
          {call && (
            <a
              href={call}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-accent-button px-3 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-button-hover"
            >
              <span aria-hidden>✆</span> Call back
            </a>
          )}
          {text && (
            <a
              href={text}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-default px-3 text-xs font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
            >
              <span aria-hidden>✉</span> Text
            </a>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* fallback="routine" so a call with no status still says so out loud.
            Previously this panel showed "Routine" alongside "Booked" whenever
            the call wasn't an emergency, which read as a contradiction — a
            booked job is not routine-and-nothing-else. */}
        <StatusBadges c={c} fallback="routine" />
        <div className="mt-2 text-xs text-content-tertiary">{fmt(c.created_at)}</div>

        {groups.map((g) => {
          // Drop a whole section when every field in it is empty rather than
          // printing six em-dashes. Absent data should take up no space.
          const rows = g.rows.filter(([, v]) => v != null && v !== "");
          if (rows.length === 0) return null;
          return (
            <section key={g.heading} className="mt-4">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-content-faint">
                {g.heading}
              </h3>
              <dl className="mt-1.5 divide-y divide-line-subtle border-y border-line-subtle text-sm">
                {rows.map(([label, val]) => (
                  <div key={label} className="flex gap-4 py-1.5">
                    <dt className="w-28 flex-none text-content-tertiary">{label}</dt>
                    <dd className="min-w-0 break-words text-content-primary">{val}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        {c.summary && (
          <p className="mt-4 rounded-md border border-accent-line bg-accent-surface p-3 text-sm leading-relaxed text-content-primary">
            {c.summary}
          </p>
        )}

        {c.recording_url && (
          // Not c.recording_url — Vapi stores artifacts in a private R2 bucket
          // and a browser gets 400 from it. /api/recording mints a short-lived
          // presigned URL per play.
          <audio
            controls
            preload="none"
            src={`/api/recording/${c.id}`}
            className="mt-3 h-9 w-full"
          />
        )}

        {c.transcript && (
          <pre className="mt-3 whitespace-pre-wrap rounded-md border border-line-subtle bg-surface-inset p-3 font-mono text-xs leading-relaxed text-content-secondary">
            {c.transcript}
          </pre>
        )}

        {/* Routing needs the number the call actually came from. */}
        {c.caller_id && c.client_id && (
          <VoicemailToggle
            number={c.caller_id}
            clientId={c.client_id}
            enabled={(voicemailNumbers ?? []).includes(
              c.caller_id.replace(/\D/g, "").slice(-10)
            )}
            suggested={looksPersonal(c)}
          />
        )}
      </div>
    </aside>
  );
}
