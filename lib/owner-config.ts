import "server-only";

// The owner's personal contact details, used server-side only.
//
// These lived in lib/site-config.ts behind a comment that said "PRIVATE —
// never render these anywhere on the public site." The comment was accurate
// about intent and wrong about outcome: app/login/page.tsx and
// app/reset-password/page.tsx are both "use client" and both import `site`.
// Because `site` is one object literal, no bundler can tree-shake individual
// properties off it, so the whole object — owner cell and owner email
// included — was emitted into the client JS chunks and the prerendered HTML.
// Verified by grepping .next/static/chunks before this split.
//
// A comment cannot enforce this. `import "server-only"` can: any client
// component that reaches into this module now fails the BUILD rather than
// quietly publishing a phone number. That is the whole point of the split —
// the next value added here is protected by default instead of by memory.
//
// Values are unchanged. Nothing about who gets called or emailed moved.
export const owner = {
  /** Emergency warm-transfer destination for the Vapi agent. */
  cellE164: "+12484023630",
  /** Where call notifications, trial signups and health alerts land. */
  email: "spyroll134@gmail.com",
} as const;
