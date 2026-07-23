import { getSupabaseServerClient } from "@/lib/supabase";
import { isAfterHours, isDeadAir, type CallRow } from "@/components/dash";
import { isUnnotified } from "@/lib/notified";

// Shared data access for the ops views (/dashboard/*). Every view needs some
// subset of the same three tables, and the calls filter has to behave
// identically wherever it appears, so both live here rather than being
// re-derived per page.

export type ClientRow = {
  id: string;
  name: string;
  trade: string;
  created_at: string;
  /** Numbers routed to voicemail instead of the intake agent, 10-digit. */
  voicemail_numbers: string[] | null;
};

export type SignupRow = {
  id: string;
  created_at: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  trade: string | null;
};

/**
 * An emergency that never reached a human and never became a job.
 *
 * This is the only call state that implies someone still has to *do* something,
 * which is why it gets its own filter and its own default view. Deliberately
 * not keyed off `owner_notified_at`: the notification going out is us doing our
 * job, not the contractor doing theirs — a call can be emailed about and still
 * be sitting there unanswered.
 *
 * Dead air is excluded. A pocket dial that timed out in silence is not an
 * outstanding obligation, and putting it in a work queue teaches you to ignore
 * the queue.
 */
export function isUnhandled(c: CallRow) {
  return c.emergency && !c.transferred_to_owner && !c.booked && !isDeadAir(c);
}

export type CallFilter = {
  q?: string;
  status?: string;
  client?: string;
  range?: string;
};

/** Read one search param, collapsing the string[] case the router allows. */
export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export async function loadOps({ callLimit = 500 }: { callLimit?: number } = {}) {
  const supabase = getSupabaseServerClient();
  const [{ data: calls, count: callCount }, { data: signups }, { data: clients }] =
    await Promise.all([
    supabase
      .from("calls")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(callLimit),
    supabase
      .from("trial_signups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("clients").select("*").order("name", { ascending: true }),
  ]);

  const rows = (calls ?? []) as CallRow[];
  return {
    calls: rows,
    signups: (signups ?? []) as SignupRow[],
    clients: (clients ?? []) as ClientRow[],
    /**
     * Total calls in the table, ignoring `callLimit`. Every count derived from
     * `calls` describes the loaded window only, so a view that shows numbers
     * has to be able to say when that window stopped being everything.
     *
     * The arithmetic that makes this urgent: at 30 calls a week per client,
     * five clients exhaust the 500 default in about 3.3 weeks and ten clients
     * in about 1.7 weeks. Until now the dashboard would have kept reporting
     * confident totals off a silently truncated slice.
     */
    callCount: callCount ?? rows.length,
    callLimit,
    truncated: (callCount ?? 0) > rows.length,
  };
}

/**
 * Apply the URL filters to a call list.
 *
 * Dead air is *included* here when explicitly asked for and excluded from the
 * headline counts elsewhere — the log stays a complete record even though the
 * stats only count real conversations.
 */
export function filterCalls(
  calls: CallRow[],
  f: CallFilter,
  nowMs: number
): CallRow[] {
  let rows = calls;

  if (f.range && f.range !== "all") {
    const days = Number(f.range);
    if (Number.isFinite(days) && days > 0) {
      const cutoff = nowMs - days * 86400_000;
      rows = rows.filter((c) => new Date(c.created_at).getTime() >= cutoff);
    }
  }

  if (f.client) rows = rows.filter((c) => c.client_id === f.client);

  switch (f.status) {
    case "emergency":
      rows = rows.filter((c) => c.emergency);
      break;
    case "booked":
      rows = rows.filter((c) => c.booked);
      break;
    case "transferred":
      rows = rows.filter((c) => c.transferred_to_owner);
      break;
    case "after-hours":
      rows = rows.filter((c) => isAfterHours(c.created_at));
      break;
    case "dead-air":
      rows = rows.filter((c) => isDeadAir(c));
      break;
    case "unhandled":
      rows = rows.filter(isUnhandled);
      break;
    case "unnotified":
      rows = rows.filter((c) => isUnnotified(c, nowMs));
      break;
    case "unassigned":
      rows = rows.filter((c) => !c.client_id);
      break;
  }

  const q = f.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((c) =>
      [
        c.caller_name,
        c.callback_number,
        c.caller_id,
        c.service_address,
        c.insurance_carrier,
        c.summary,
        // The transcript is the only place the *caller's own words* are
        // searchable — "sump pump", a street name they gave before the agent
        // captured an address, the name of a landlord. Everything above is a
        // field the agent successfully extracted; this is the fallback for
        // every call where it didn't.
        c.transcript,
        c.message_for_owner,
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }

  return rows;
}

// The "never notified" rule now lives in lib/notified.ts so the portal's
// client-side table can share it — importing lib/ops from a "use client" file
// would drag the Supabase server client into the browser bundle. Re-exported
// here so existing callers of ops.isUnnotified keep working, and so there is
// still one obvious place to look for it from the dashboard side.
export {
  isUnnotified,
  unnotifiedCutoff,
  NOTIFICATIONS_LIVE_SINCE,
} from "@/lib/notified";

/** Headline counts. Dead air never inflates a number that justifies an invoice. */
export function summarize(calls: CallRow[], nowMs?: number) {
  const connected = calls.filter((c) => !isDeadAir(c));

  // Calls the owner was never emailed about.
  //
  // Two floors, and the alert only counts a call that clears both. The rolling
  // 7-day window keeps the banner about the present. The absolute floor exists
  // because notifications could not physically fire before RESEND_* was
  // configured — six calls from 2026-07-20 failed for that reason, and no
  // action taken today can ever resolve them. The rolling window alone was not
  // enough: those calls were still inside it, so the banner read "3 calls never
  // triggered an owner notification email" and nothing you could click would
  // clear it. An alert that can't be resolved trains you to ignore the next
  // real one, which is the failure this number exists to prevent.
  //
  // This floor stops mattering on its own once it falls out of the 7-day
  // window; it does not need removing later.
  const now = nowMs ?? Date.now();

  return {
    connected,
    deadAir: calls.length - connected.length,
    emergencies: connected.filter((c) => c.emergency).length,
    booked: connected.filter((c) => c.booked).length,
    /**
     * Jobs the owner has confirmed closed. The only count that may ever be
     * translated into money — `booked` means the AI put an arrival window on
     * the books, which is a promise, not a sale. Keyed on `lead_status` alone
     * so a call that is both booked and won can never be counted twice.
     */
    won: connected.filter((c) => c.lead_status === "won").length,
    /** Booked and still open — the pipeline. Won/lost have left it. */
    scheduled: connected.filter(
      (c) => c.booked && c.lead_status !== "won" && c.lead_status !== "lost"
    ).length,
    afterHours: connected.filter((c) => isAfterHours(c.created_at)).length,
    unhandled: connected.filter(isUnhandled).length,
    unnotified: connected.filter((c) => isUnnotified(c, now)).length,
    /**
     * Calls the webhook could not attribute to a client.
     *
     * Counted over `calls` and not `connected`, unlike every other number here.
     * The rest describe service delivered and must not be inflated by dead air;
     * this one describes a *configuration* fault — a number Vapi is answering
     * that no client row claims — and a pocket dial on an unmapped number is
     * the same fault as a real lead on one. Matches the "unassigned" filter in
     * filterCalls, so the tile and the list it links to agree.
     */
    unassigned: calls.filter((c) => !c.client_id).length,
  };
}

export type ClientHealth = {
  client: ClientRow;
  /** Calls in the trailing 30 days, dead air excluded. */
  calls30: number;
  emergencies30: number;
  booked30: number;
  /**
   * Jobs this client confirmed closed in the window. Booked is a promise; won
   * is the outcome, and it is the only one that says the line made them money.
   * A client with calls and bookings but no wons is either coining it and not
   * telling us, or not closing — both are worth knowing before renewal.
   */
  won30: number;
  /** Vapi's all-in spend on this client over the same 30 days. */
  cost30: number;
  /** Subscription minus spend. Negative means the account loses money. */
  margin30: number;
  /**
   * Their most recent call within the window `loadOps` fetched, not all of
   * history. At current volume those are the same thing; past ~500 calls it
   * would silently become "recent enough to be in the last 500", which is
   * still the correct answer for a staleness signal.
   */
  lastCallAt: string | null;
  /** Whole days since that call. Null if they've had none. */
  daysSinceLastCall: number | null;
};

/**
 * Per-client operating numbers for the ops view.
 *
 * The two questions this answers are the two that decide whether a client is
 * still a client next month: are they getting calls, and are we making money on
 * them. Both were previously invisible — `cost_usd` has been written on every
 * call since the webhook was built and nothing rendered it, so margin was a
 * thing you could only learn by running SQL.
 *
 * Trailing 30 days rather than lifetime, because a client who was busy in
 * April and silent since is exactly the one you need to notice, and a lifetime
 * total hides that.
 */
export function clientHealth(
  calls: CallRow[],
  clients: ClientRow[],
  nowMs: number,
  monthlyPrice: number
): ClientHealth[] {
  const cutoff = nowMs - 30 * 86400_000;

  return clients
    .map((client) => {
      const mine = calls.filter((c) => c.client_id === client.id);
      const recent = mine.filter(
        (c) => !isDeadAir(c) && new Date(c.created_at).getTime() >= cutoff
      );
      // Cost is billed on every call Vapi answered, including the dead-air ones
      // we don't count as service. Excluding them here would understate spend.
      const cost30 = mine
        .filter((c) => new Date(c.created_at).getTime() >= cutoff)
        .reduce((sum, c) => sum + (c.cost_usd ?? 0), 0);

      // mine is already newest-first (loadOps orders by created_at desc).
      const lastCallAt = mine[0]?.created_at ?? null;

      return {
        client,
        calls30: recent.length,
        emergencies30: recent.filter((c) => c.emergency).length,
        booked30: recent.filter((c) => c.booked).length,
        won30: recent.filter((c) => c.lead_status === "won").length,
        cost30,
        margin30: monthlyPrice - cost30,
        lastCallAt,
        daysSinceLastCall: lastCallAt
          ? Math.floor((nowMs - new Date(lastCallAt).getTime()) / 86400_000)
          : null,
      };
    })
    // Quietest first: the top of this table should be the account you are
    // closest to losing, not the one that is doing fine.
    .sort((a, b) => a.calls30 - b.calls30);
}

/** Build a URL for this view with one param changed. */
export function hrefWith(
  basePath: string,
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null>
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = one(v);
    if (s) params.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
