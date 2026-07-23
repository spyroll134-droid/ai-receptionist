# CHANGES.md — Portal `/portal` redesign

A **visual/layout redesign within the existing stack** (Next 16 + Tailwind v4 +
Supabase RLS, server components). **No backend, schema, migration, dependency,
token, or font changes.** Every visible element traces to a real SCOPE
deliverable — nothing implies a capability the product doesn't ship today.

Branch: `redesign/portal-dashboard`
Commits: `94aea49` (discovery) → `895d050` (nav+helpers+redirect) →
`c0a1458` (tab split) → `bd32f6a` (new components) → `7f577b1` (dashboard rewrite)
\+ a focus-ring polish on the calls feed (this pass).

---

## What changed, mapped to AUDIT problems

| Change | Fixes | Deliverable |
|---|---|---|
| **Standalone hero block** — `text-5xl` tabular number, "Est. value of jobs booked", delta vs previous 30 days, "from N calls you'd have missed" subtext (`components/PortalHero.tsx`) | P5 (hero not dominant), P2 (honest label) | D6 |
| **4-item KPI strip** — Calls caught · Jobs booked by AI · Emergencies flagged (+ median alert) · Median speed-to-lead. Dropped "answer rate" (~100% by design) and "avg answer speed" (unmeasured); used the real stored `medianSpeedToLead` | P3 (KPIs without a deliverable) | D6/D7/D8/D9 |
| **24-hour line strip** — signature element, one rail, ticks by outcome: green=booked · red=emergency · blue=transferred · gray=message/routine. Legend (color+word) + sr-only table (`components/DayLineStrip.tsx`) | P4 (missing signature element) | D2–D8 |
| **Recent-calls feed** — proof layer: per-row status badges + caller + AI summary + est. $, with Listen/Transcript revealed inline & lazily (`components/RecentCallsFeed.tsx`) | P9 (proof layer), G4 (kept recordings/transcripts) | D2–D5 |
| **Booked-jobs snapshot** — "Booked by your AI line" with source attribution, links to full Bookings ledger | P9 | D6 |
| **Setup checklist** — real fields only: avg job value, emergency-alert retries, route personal numbers to voicemail. **No "calendar connect"** (no such integration) (`components/SetupChecklist.tsx`) | P8 (non-deliverable in checklist) | D8/D15/D16 |
| **Nav split** — Dashboard · Calls · Leads · Bookings · Settings; Reports dropped (`components/portal-nav.ts`) | P6 (tab naming) | — |
| **Calls / Leads / Bookings pages** — the old home's call log, work queues, and outcomes ledger each moved to their own tab so the home stops being a to-do list | P9 (hierarchy) | D2–D14 |
| **`/portal/outcomes` → redirect** to `/portal/bookings` — old links preserved | (route safety) | — |
| **Focus-visible rings** on Listen/Transcript buttons, matching the OpsShell pattern | G3 (a11y floor) | — |

## Kept deliberately (AUDIT G1–G7 — did not churn)
Honest metrics + zero-states (G1); color **+ glyph + word** status system (G2);
a11y floor — sr-only chart tables, focus rings, `prefers-reduced-motion`,
`nowMs` threading (G3); recordings/transcripts/detail panel (G4);
emergency-first triage + "Needs you" index (G5); the single shared `OpsShell`
(G6); tabular-nums scoped to tables (G7).

## Deviations from the DESIGN SPEC (flagged, per "don't silently deviate")
1. **Kept the dark, CVD-validated tokens + Geist** — did *not* adopt the spec's
   light / `#FF5A1F` orange / Barlow theme. The dark palette is measured against
   deuteranopia; re-skinning would discard that. *(Resolved with you: AUDIT P1.)*
2. **Hero label stays "Est. value of jobs booked"** — not the mockup's "revenue
   captured," which SCOPE/corpus deliberately removed. SCOPE wins. *(AUDIT P2.)*
3. **No "quote" tick color** in the strip — that outcome doesn't exist; remapped
   to real outcomes. *(AUDIT P4.)*
4. **No Reports tab, no loss-aversion stat** — neither has a SCOPE deliverable /
   cited source. *(AUDIT P6/P7.)*

## Data note
No schema/migration/webhook changes. The one new computation is a second
in-memory aggregate over the already-fetched `calls` (previous-period booked
count, for the hero delta). All pages read `calls` via the existing RLS
"own calls" policy — same as before.

## Verification (this pass)
- `tsc --noEmit` clean · `eslint` clean on all portal files
- Token grep (`text-white` / `bg-[#` / `text-[#`) → **zero** hits
- All 6 `/portal/*` routes resolve; `/portal/outcomes` redirects to
  `/portal/bookings` for signed-in users
- CVD: every colored status also carries a glyph + word (static review)
- Keyboard focus: no new element removes the browser focus ring; feed buttons
  now carry the design-system focus-visible ring

## Not delivered this session
**After-screenshots (1280 / 375) and the visual critique loop.** The screenshot
tool could not run: the Chrome window was minimized/off-screen (`resize_window`
reported bounds "must be at least 50% within visible screen space" and screenshot
capture timed out on `document_idle`). The page itself is verified healthy via
server-side HTML (all sections render; hero math correct: 5 booked × $6,000 =
$30,000, +150% vs prior period). Re-run the screenshot loop once Chrome is
on-screen.
