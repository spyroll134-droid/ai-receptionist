// Single source of truth for editable business details.
// Update these and every page on the site updates with them.

export const site = {
  // Brand matches the domain deliberately: prospects hear "thebackupline.com"
  // on a cold call and land on a site that says the same thing back. If the
  // business ever incorporates as Greetova LLC, that's paperwork only —
  // customers should keep seeing one name.
  businessName: "The Backup Line",
  tagline: "The AI receptionist that catches what your team drops.",

  // Build order per the locked plan: restoration first, then roofing, then
  // plumbing. Order here controls display order across the site.
  trades: ["Restoration", "Roofing", "Plumbing"] as const,

  // Who the homepage speaks to. Deliberately broader than `trades`, with the
  // trade list demoted to examples.
  //
  // The old line concatenated `trades` into "Built for Restoration, Roofing
  // and Plumbing companies", which read as a membership test — an electrician
  // who got the link forwarded correctly concluded it wasn't for them, and the
  // product handles their calls fine. Naming examples keeps the concreteness
  // (a stranger still learns instantly what kind of business this is for)
  // without the exclusion. One page, no per-trade variants to maintain.
  audienceLabel: "home-service contractors",


  // Live demo line (Telnyx number routed to the Vapi assistant).
  // TODO: swap for a 313 Detroit-area number before heavy cold-calling.
  // Leading 1 shown deliberately: this number gets read aloud on cold calls and
  // dialled from job-site landlines and desk phones, where the 1 is required.
  // The href keeps E.164 (+1…) which mobile handles either way.
  demoPhoneDisplay: "1 (918) 223-4411",
  demoPhoneHref: "tel:+19182234411",
  contactEmail: "hello@thebackupline.com",
  // Same line as the demo, on purpose. (313) 555-0100 used to sit here and
  // rang nowhere — a dead number on a page whose only job is proving you're
  // real is worse than no number. Pointing contact at the AI line means it
  // always answers AND demos the product to anyone who calls it.
  // TODO: swap for a 313 Detroit-area number before heavy cold-calling.
  contactPhoneDisplay: "1 (918) 223-4411",
  contactPhoneHref: "tel:+19182234411",
  calendarUrl: "https://cal.com/thebackupline/demo",

  // The owner's cell and email USED to live here behind a "PRIVATE, never
  // render this publicly" comment. They now live in lib/owner-config.ts, which
  // is marked `server-only` so the build fails if a client component imports
  // it. They had to move: this object is imported by "use client" pages
  // (app/login, app/reset-password), and a single object literal can't be
  // tree-shaken property by property — so everything in here ships to the
  // browser whether it's rendered or not.
  //
  // Treat this file as PUBLIC. Anything added below is readable by anyone who
  // opens devtools. Secrets and personal contact details go in owner-config.

  pricing: {
    monthly: 297,
    setup: 199,
    trialDays: 7,
  },

  // Default average job value per trade, for the portal's "revenue protected"
  // tile. A client's avg_ticket_dollars column overrides this when set —
  // these only apply when that column is null.
  //
  // Sourced from 2025–26 national cost guides (Angi/HomeAdvisor/Modernize),
  // biased toward after-hours emergency work since that's what the AI
  // catches: restoration = mitigation avg ~$3.9k plus partial rebuild;
  // roofing = blend of storm repairs (~$4.3k) and replacements ($17k+);
  // plumbing = emergency visits $150–$500, complex jobs $500–$2k at
  // after-hours rates. Clients who quote a different number get it set in
  // avg_ticket_dollars instead of editing these.
  avgTicketByTrade: {
    Restoration: 6000,
    Roofing: 9000,
    Plumbing: 750,
  } as Record<string, number>,

  // Comparison figure from the buildup research — re-verify before quoting
  // publicly if this ever needs to survive a fact-check.
  humanAnsweringServiceMonthly: 4000,

  // Where the deployed backend lives, for webhook URLs (Vapi's server.url,
  // the assistant-request resolver, password-reset links).
  //
  // ⚠️ buildAssistant() hands this to Vapi as the post-call webhook URL on
  // EVERY call. If it stops resolving, calls still connect and sound fine but
  // nothing is saved and no owner email is sent — silently. Verify the domain
  // serves 200 before changing this, and PATCH the Vapi phone number's
  // server.url to match (that value lives on Vapi's side, not here).
  deployedUrl: "https://thebackupline.com",
} as const;

// Average ticket for a client: their own override if set, else their trade's
// default, else Restoration's (the founding trade) for unrecognized trades.
export function avgTicketFor(trade: string, override?: number | null) {
  return (
    override ??
    site.avgTicketByTrade[trade] ??
    site.avgTicketByTrade.Restoration
  );
}

// "Restoration, Roofing & Plumbing"
export function tradesLabel(list: readonly string[] = site.trades) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
