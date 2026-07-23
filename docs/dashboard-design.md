# Dashboard design spec

Applies to `/portal` (client-facing) and `/dashboard` (ops). Written against the
`dataviz` skill — **every color below was computed by its validator, not chosen by
eye.** Re-run before changing any of them:

```bash
SKILL="$(ls -d /private/tmp/claude-*/bundled-skills/*/*/dataviz | head -1)"
node "$SKILL/scripts/validate_palette.js" "#3987e5,#d03b3b,#199e70,#c2870a" \
  --mode dark --surface "#0b0b0e"
```

---

## 1. Palette — replace the current values

The palette currently in `app/globals.css` **fails validation on two checks**:

```
[FAIL] Lightness band   #f5a524 at L 0.782 — dark band is L 0.48–0.67
[FAIL] CVD separation   #30a46c ↔ #e5484d  ΔE 4.9 (deutan)
```

That second one is the classic failure: **the green and red are effectively the
same color to a deuteranope.** "Jobs booked" and "Emergencies" are the two tiles a
client looks at most, and for ~6% of men they're indistinguishable by color.

Note `dash.tsx` originally used `#3987e5` — the reference palette's validated dark
blue. My token refactor replaced it with Tailwind's `#3b82f6`, which drifted off
the validated set. Going back.

| Token | Current | **Use** | OKLCH L |
|---|---|---|---|
| `--color-accent` | `#3b82f6` | **`#3987e5`** | 0.61 |
| `--color-critical` | `#e5484d` | **`#d03b3b`** | 0.56 |
| `--color-positive` | `#30a46c` | **`#199e70`** | 0.60 |
| `--color-caution` | `#f5a524` | **`#c2870a`** | 0.65 |

Validator result: **ALL CHECKS PASS**, with one WARN — deutan ΔE 7.2 between
positive and critical, which sits in the 6–8 floor band. That band is legal
**only with secondary encoding** (a label, icon, or gap alongside the color).
Section 2 is how we satisfy that; it is not optional.

The `-text` variants (used for type on dark) keep their higher lightness — they're
text contrast, a different check than categorical separation. Leave them.

---

## 2. Color is never the only signal

Red/green at ΔE 7.2 means **nothing may depend on hue alone.**

- ✅ `Badge` already complies — `▲ Emergency`, `✓ Booked`, `☾ After-hours` all
  pair the color with a glyph and a word. Don't change it.
- ❌ **`StatTile`'s accent bar is color-alone.** The 2px top rule is the only thing
  distinguishing an emergency tile from a booked tile. Add a small glyph beside
  the label (`▲` critical, `✓` positive) so the tile reads without color.
- ❌ **`CallTable`'s leading dot is color-alone** at the row level. It's redundant
  with the badge in the same row, so either drop the dot or give it a `title`.

---

## 3. Anti-patterns currently in the code

Checked against the skill's catalog. Each of these is a named violation, not taste.

**`tabular-nums` on stat-tile values.** `globals.css` sets
`font-variant-numeric: tabular-nums` on `body`, so it inherits into StatTile's
3xl numbers. The rule: *proportional figures on hero and stat-tile values;
tabular only where digits align vertically.* Equal-width digits make `121` look
loose at display size. **Fix:** move the declaration off `body` onto `table`,
`.tabular`, and axis ticks. (My regression — I added it globally.)

**Filters scope the table but not the chart.** `CallTable` owns a date-range and
status filter; `ActivityBars` above it ignores them. The rule: *one filter row
above everything it scopes; all charts re-render against the same slice.* Right
now selecting "7 days" leaves a 14-day chart sitting above a 7-day table, which
reads as a bug. **Fix:** lift filter state to the page, pass the filtered set to
both, and move the filter row above the chart.

**Chart values reachable only by hover.** `ActivityBars` direct-labels the peak
and hides everything else in a hover tooltip. The rule: *tooltips enhance, never
gate; keyboard focus shows the same as hover.* **Fix:** make each bar a focusable
element with the same tooltip on `:focus-visible`, and label the last bar (today)
in addition to the peak.

**Hit target is the bar, not the column.** A zero-call day renders a 3px-tall bar
and that's the entire hover target. The rule: *hit area meets ~24px minimum.*
**Fix:** make the full-height column the hover/focus target, not the drawn bar.

**Five equal-weight tiles with no emphasis.** Both dashboards render every tile at
the same size. The rule: *emphasis — highlight one, gray the rest.* Nothing tells
the eye where to start. **Fix:** section 4.

**No loading or error state.** There is data or there is nothing. On refetch the
rule is *hold the previous render at reduced opacity, no skeleton flash.*

---

## 4. Layout

### `/portal` — the client's view

One job: **make the invoice feel obviously worth it in under five seconds.**

```
┌────────────────────────────────────────────────┐
│  REVENUE PROTECTED            ← hero, 2-col    │
│  $18,000                        span, 5xl      │
│  3 jobs booked × $6,000 avg ticket             │
├──────────────┬──────────────┬──────────────────┤
│ Calls caught │ Emergencies  │ After-hours      │
│ 47           │ ▲ 3          │ ☾ 12             │
└──────────────┴──────────────┴──────────────────┘
   [ filters: range · status · search · export ]
   [ 14-day activity ]
   [ call table ]
```

Revenue protected becomes the hero and the other three drop to secondary. That
number is the retention argument — it should not be one of four equal boxes.

⚠️ **This is blocked on `calls.booked` actually being set.** Until then the hero
reads `$0`, which is worse than burying it. Do not ship the hero tile before the
booked fix lands.

### `/dashboard` — ops

Currently one long scroll with no grouping, and two different treatments for
similar data (calls as cards, signups as a table). Group into three bands:

1. **Today** — calls in last 24h, unnotified count, trial signups today
2. **Clients** — one row each: name, calls this month, cost, last call
3. **Log** — calls and signups, both as tables, same visual treatment

Add **cost per client** — `cost_usd` is now populated and margin is invisible
without it.

---

## 5. Component contracts

```ts
StatTile({ label, value, sub?, accent?, glyph?, emphasis? })
// emphasis: renders 5xl in a 2-col span. Exactly one per row.
// glyph: satisfies §2 — required whenever accent is set.

ActivityBars({ calls, nowMs, days? })   // days defaults 14
// Column is the hit target. Focusable. Peak AND today direct-labeled.
```

Keep `nowMs` threaded — reading the clock in render is impure and desyncs
server/client (see `lib/now.ts`).

---

## 6. Verification

1. Re-run the validator — must print `ALL CHECKS PASS`.
2. `grep -rn "text-white\|bg-\[#" app components` → zero hits (tokens only).
3. Tab through the chart: every bar reachable, focus shows the tooltip.
4. Grayscale the portal screenshot — every status still readable.
5. `npm run build` + `npx eslint app components lib proxy.ts --ext .ts,.tsx`.
6. Run `/vercel:react-best-practices` over the changed TSX.

---

## Correction (2026-07-22, verified by measurement)

Section 1's palette findings were re-tested with a Vienot deuteranopia simulation
and CIE76 dE in Lab. Two claims in this document do not hold:

1. **`#30a46c` (positive) vs `#e5484d` (critical) is not a failure.** Measured
   deutan dE is **83.7** — comfortably distinguishable. The claimed 4.9 is wrong.
   "Jobs booked" and "Emergencies" are fine as they stand.

2. **The real collision is `#e5484d` (critical) vs `#f5a524` (caution)**, deutan
   dE **9.5**. The prescribed replacements (`#d03b3b` / `#c2870a`) score **8.1** —
   marginally *worse*. Red and amber converge to the same hue under deuteranopia
   and no repick of red and amber separates them.

The correct remedy is not a palette swap but a rule, now recorded in
`app/globals.css`: critical and caution may never be the only difference between
two things. Today they always co-occur with a glyph and a word (the Emergency /
After-hours badges in `CallTable`), so the app is not currently broken.

Also already done, contrary to §3: `tabular-nums` is no longer on `body` — it is
scoped to `table, .tabular` at `app/globals.css:143`.

Still genuinely open from this document: `StatTile` `glyph`/`emphasis` props,
keyboard-reachable `ActivityBars`, filters scoping the chart as well as the
table, and the §4 revenue hero (no longer blocked — `calls.booked` now fires).

### Implemented 2026-07-22

- `StatTile` → `StatItem` now takes `glyph`, `emphasis`, and `href`. Every toned
  tile passes a glyph, so tone is never the only signal.
- `ActivityBars` bars are `<li tabIndex={0}>` with an `aria-label` carrying the
  value; the tooltip shows on `:focus-visible` as well as hover.
- `ActivityBars` takes `windowDays`; `/dashboard/calls` derives it from the range
  filter, so the chart and the table describe the same period.
- Portal hero: "Revenue protected" leads at `emphasis` weight with its own
  derivation as a subtitle.

Still open: nothing from this document. Remaining work is operational, tracked
separately.
