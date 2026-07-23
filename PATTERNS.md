# PATTERNS.md — Reference patterns to borrow

Skills: no standalone `frontend-design` skill installed, but **`dataviz`** and
**`artifact-design`** skills ARE available and will be used during execution
(dataviz governs the KPI/line-strip/chart work). To add the Anthropic set:
`npx @anthropic-ai/skills add anthropics/skills` (not required — dataviz covers this).

Reference repos studied (license-checked). We are on a **dark** token system;
we borrow **layout/spacing/hierarchy**, re-tokenized to `globals.css` — never hex.

| Repo | Stars | License | Borrow | Serves (SCOPE) |
|---|---|---|---|---|
| **shadcn-ui/ui** | 119k | **MIT** (liftable) | Dashboard-01 block: hero-metric + KPI card grid proportions, card padding/gap rhythm, section spacing. `apps/www` dashboard blocks. | P5 hero, P3 KPI row |
| **tremorlabs/tremor** | 3.5k | **Apache-2.0** (liftable) | KPI "Card + Metric + delta badge" anatomy (big number, label, ▲/▼ delta vs period), category-bar. tremor.so live demos. | P5 delta-vs-period, P3 KPIs |
| **tabler/tabler** | 41k | **MIT** (liftable) | Clean admin **table density** + list-row rhythm; sidebar nav proportions. tabler.io demo. | Call log, follow-up/outcome lists |
| **twentyhq/twenty** | 53k | **AGPL — UX ONLY, never copy code** | CRM record-list & record-detail UX (calm nav, one-record-focus). Study interaction only. | Nav depth, call-detail panel |

## Signature element (P4) — the 24-hour line strip
No single repo ships it. Compose from: tremor **category-bar** (proportional
colored segments on one horizontal rail) as the mental model, executed as a
custom SVG/flex tick strip in our own tokens. Ticks colored by real outcome
(green=booked / red=emergency / blue=transferred / gray=message), each a
focusable element carrying its time+outcome as `aria-label` (mirrors the
existing `ActivityBars` a11y pattern in `dash.tsx`). Everything around it stays
quiet — it's the only brand moment on the page.

## Non-negotiables carried into every borrow
- Re-tokenize to `globals.css`; `grep bg-\[# / text-white` must stay at zero.
- Every status color also carries a glyph + word (keep the `Badge`/`StatusBadges` rule).
- Keep `nowMs` threaded (no `Date.now()` in render).
- Keep the sr-only data-table pattern for any new chart/strip.
