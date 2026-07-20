// Single source of truth for editable business details.
// Update these and every page on the site updates with them.

export const site = {
  businessName: "Trademark Web",
  tagline: "The AI receptionist that catches what your team drops.",

  // Build order per the locked plan: restoration first, then roofing, then
  // plumbing. Order here controls display order across the site.
  trades: ["Restoration", "Roofing", "Plumbing"] as const,

  // Live demo line (Telnyx number routed to the Vapi assistant).
  // TODO: swap for a 313 Detroit-area number before heavy cold-calling.
  demoPhoneDisplay: "(918) 223-4411",
  demoPhoneHref: "tel:+19182234411",
  contactEmail: "hello@trademarkweb.com",
  contactPhoneDisplay: "(313) 555-0100",
  contactPhoneHref: "tel:+13135550100",
  calendarUrl: "https://cal.com/trademarkweb/demo",

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
  // etc). Update if the production domain changes.
  deployedUrl: "https://ai-receptionist-eight-umber.vercel.app",
} as const;

// "Restoration, Roofing & Plumbing"
export function tradesLabel(list: readonly string[] = site.trades) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}
