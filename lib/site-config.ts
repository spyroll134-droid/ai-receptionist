// Single source of truth for editable business details.
// Update these and every page on the site updates with them.

export const site = {
  businessName: "Trademark Web",
  tagline: "The AI receptionist that catches what your team drops.",

  // TODO: replace before launch
  demoPhoneDisplay: "(313) 555-0182",
  demoPhoneHref: "tel:+13135550182",
  contactEmail: "hello@trademarkweb.com",
  contactPhoneDisplay: "(313) 555-0100",
  contactPhoneHref: "tel:+13135550100",
  calendarUrl: "https://cal.com/trademarkweb/demo",

  pricing: {
    monthly: 297,
    setup: 199,
    trialDays: 7,
  },

  // Comparison figure from the buildup research — re-verify before quoting
  // publicly if this ever needs to survive a fact-check.
  humanAnsweringServiceMonthly: 4000,
} as const;
