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

  // Live demo line (Telnyx number routed to the Vapi assistant).
  // TODO: swap for a 313 Detroit-area number before heavy cold-calling.
  demoPhoneDisplay: "(918) 223-4411",
  demoPhoneHref: "tel:+19182234411",
  contactEmail: "hello@thebackupline.com",
  // TODO: still a placeholder — swap for a real line before cold-calling, or
  // remove it from the site rather than publish a number that doesn't ring.
  contactPhoneDisplay: "(313) 555-0100",
  contactPhoneHref: "tel:+13135550100",
  calendarUrl: "https://cal.com/thebackupline/demo",

  // PRIVATE — used server-side / in the Vapi agent only.
  // Never render these anywhere on the public site.
  ownerCellE164: "+12484023630", // emergency warm-transfer destination
  ownerEmail: "spyroll134@gmail.com", // call notifications land here

  pricing: {
    monthly: 297,
    setup: 199,
    trialDays: 7,
  },

  // Comparison figure from the buildup research — re-verify before quoting
  // publicly if this ever needs to survive a fact-check.
  humanAnsweringServiceMonthly: 4000,

  // Where the deployed backend lives, for webhook URLs (Vapi's server.url,
  // the assistant-request resolver, password-reset links).
  //
  // ⚠️ Do not point this at thebackupline.com until that domain actually
  // resolves. buildAssistant() hands this to Vapi as the post-call webhook
  // URL on EVERY call — if it 404s, calls complete but nothing is saved and
  // no owner email is sent, silently.
  //
  // Flip to https://thebackupline.com once DNS is verified, then also PATCH
  // the Vapi phone number's server.url (stored on Vapi's side, not here).
  deployedUrl: "https://ai-receptionist-eight-umber.vercel.app",
} as const;

// "Restoration, Roofing & Plumbing"
export function tradesLabel(list: readonly string[] = site.trades) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
