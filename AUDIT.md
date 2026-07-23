# AUDIT.md — Current `/portal` vs. the DESIGN SPEC

Audited: `app/portal/page.tsx` (Calls), `app/portal/outcomes/page.tsx`,
`app/portal/settings/page.tsx`, `components/ops.tsx` (shell + `StatStrip`),
`components/dash.tsx` (`StatusBadges`, `ActivityBars`), `app/globals.css`
(tokens). Stack: Next 16 + Tailwind v4 + Supabase, server components, RLS.

## Current structure (map)
- **Shell** (`OpsShell`): left sidebar (collapses to top tab-strip < md),
  wordmark + surface badge, nav list, "Detroit time" + sign-out.
- **Portal nav (3 tabs):** Calls (`/portal`) · Outcomes (`/portal/outcomes`) ·
  Settings (`/portal/settings`). **Zero nested sub-tabs.** ✅
- **Calls page (home), top→bottom:** TrialProof (trial only) → "Needs you"
  jump-bar → EmergencyQueue → `StatStrip` (Est. value booked *emphasis* +
  Calls caught + Emergencies + Jobs booked) → reliability line → FollowUp queue
  → Reconcile queue → AvgTicket editor → `ActivityBars` (30-day) → Call log table.

## What is already GOOD — keep it (improve, don't churn)
- **G1. Honest metrics + zero-states.** "Est. value of jobs booked", $0 zero-state
  that points forward, "Didn't book" never a loss. This is hard-won and correct.
- **G2. Colorblind-safe status system.** Every badge = color **+ glyph + word**
  (`▲ ✓ → ☾`). Measured against deuteranopia (`globals.css` note). Load-bearing.
- **G3. Accessibility floor.** `ActivityBars` has an sr-only data table; visible
  focus ring; `prefers-reduced-motion`; keyboard-reachable stat tiles.
- **G4. Trust/proof layer already exists** — recordings (presigned), transcripts,
  summaries, per-call detail panel with call-back/text actions.
- **G5. Emergency-first triage** and the "Needs you" index.
- **G6. Shared shell** (one shell, two nav lists) — don't fork it.
- **G7. Tabular-nums scoped correctly** (tables only, not display numbers).

## Problems vs. the spec — ranked by impact

### P1 — THEME CONFLICT (blocking decision, not a bug) 🔴
Spec tokens are a **light** theme (ink `#101820`, bg `#F5F6F8`, cards `#FFF`,
accent **`#FF5A1F` orange**, green money, blue). The product is a deliberate
**dark** theme (`#0b0b0e`, blue `#3b82f6`) with a **measured CVD-validated**
palette (`globals.css`). Adopting the light/orange spec is a full re-skin that
discards the validated palette. **This is a fork the user must choose** — see
questions. Sub-conflict: fonts — spec wants **Barlow Semi Condensed + Inter**;
current uses **Geist**.

### P2 — HERO LABEL conflicts with a locked product decision 🔴
Spec hero: *"Estimated revenue captured … from N calls you would have missed."*
SCOPE D6 / corpus: the "revenue protected/**captured**" framing was **deliberately
removed** in favor of "Est. value of jobs booked." **SCOPE wins** (task rule).
Recommendation: keep the honest label; adopt the spec's *hierarchy* (one big
~56px number, delta vs last period) but not the misleading word "captured."

### P3 — SPEC KPI CARDS partly have no deliverable 🟠
Spec's four KPIs = answer rate · jobs booked by AI · emergencies flagged
(+time-to-alert) · **avg answer speed**. Per SCOPE:
- "**Answer rate**" ≈ 100% by design → not a moving KPI. Cut/replace.
- "**Avg answer speed**" (ring→pickup) is **not measured**. Replace with the real,
  stored metric: **speed-to-lead** (D9, `medianSpeedToLead`).
- ✅ jobs booked by AI (D6) and emergencies + time-to-alert (D7/D8/D9) are real.
Recommendation for the 4 cards: **Jobs booked by AI · Emergencies flagged
(+ median time-to-alert) · Calls caught · Median speed-to-lead.** Optional single
loss-aversion stat only if sourced (see P7).

### P4 — MISSING SIGNATURE ELEMENT: the 24-hour "line" strip 🟠
Spec's brand moment doesn't exist. `ActivityBars` is a 30-day daily-count chart,
not a same-day tick strip. Gap to add — but the spec legend (green=booked,
orange=emergency, blue=**quote**, gray=message) references a **"quote" outcome
that doesn't exist** (SCOPE). Remap ticks to real outcomes:
**green=booked · red/orange=emergency · blue=transferred · gray=message/routine.**

### P5 — HERO NOT VISUALLY DOMINANT ENOUGH 🟠
Current hero is one *emphasis* tile inside `StatStrip` at `text-3xl` (~2.25rem),
sharing a bordered rail with 3 peers. Spec wants a **standalone ~56px** number
with delta-vs-last-period and the "from N missed calls" subtext. Delta-vs-period
is **not currently computed** — needs a second query (previous window). Flag:
small data addition, no schema change.

### P6 — TAB NAMING / SPEC TABS vs. deliverables 🟡
Spec suggests Dashboard · Calls · Leads · Bookings · Reports · Settings.
- **Reports** → no deliverable (SCOPE) → **do not add.**
- **Leads** ≈ the follow-up queue; **Bookings** ≈ booked/outcomes. These are
  currently *sections on the Calls page*, not tabs. Current 3-tab structure
  (Calls/Outcomes/Settings) already satisfies "≤6 tabs, zero sub-tabs." Minimal
  churn: keep 3 tabs; optionally rename Calls→Dashboard. Don't invent Reports.

### P7 — LOSS-AVERSION STAT needs a source 🟡
Spec allows one ("62% of missed calls never call back"). Governed by
`corpus/RESEARCH-PROTOCOL.md` → must cite `corpus/SOURCES.md` before display.
Flag; don't hard-code an unsourced number.

### P8 — SETUP CHECKLIST references a non-deliverable 🟡
Spec's activation checklist lists "calendar connect" — **no calendar integration
exists** (SCOPE). Valid checklist items that map to real deliverables: set
average job value (D16), set emergency-alert retries (D8), route personal
numbers to voicemail (D15). Build the checklist from those only.

### P9 — DENSITY / HIERARCHY polish 🟡
Home page is a long single scroll of stacked panels at fairly even weight.
Against the Jobber/Housecall-Pro bar: hero should own the top; KPI row second;
the line-strip + recent-calls feed as the proof layer; queues and editors
lower. Mostly a re-ordering + spacing/emphasis pass, not new data.

## Screenshot status (Step 0.2)
The portal is auth-gated (Supabase session + RLS) with only ~10 test calls and
one client. A "before" screenshot needs either login creds or a seed. **Blocked
pending your input** (see questions) — I did not fabricate a screenshot.
