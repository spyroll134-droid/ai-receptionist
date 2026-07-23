# SCOPE.md — What The Backup Line actually delivers today

Source of truth: `corpus/01-CURRENT-STATE.md` (last updated 2026-07-23),
`lib/site-config.ts`, the data model in `components/dash.tsx` (`CallRow`), and
the webhook/route code. The dashboard may surface **only** items in the
"Delivered today" column below. Every widget must map to one of these.

## Delivered today (portal may show these)

| # | Deliverable | Where it lives in code / data |
|---|---|---|
| D1 | **AI answers every call, 24/7, trade-aware intake** | `lib/vapi-config.ts` `tradeProfile()`; every `calls` row |
| D2 | **Never-a-voicemail capture** — caller name, callback #, caller ID, CNAM | `caller_name`, `callback_number`, `caller_id`, `caller_cnam` |
| D3 | **Call recordings** (presigned, per-play) | `recording_url` → `/api/recording/[id]` |
| D4 | **Transcripts** | `transcript` |
| D5 | **AI one-line summary per call** | `summary` |
| D6 | **Jobs booked by the AI** (flag) + **est. $ value** = booked × avg ticket | `booked`; `avgTicketFor()` in `lib/site-config.ts` |
| D7 | **Emergency detection** + **unhandled-emergency queue** (still waiting on a human) | `emergency`, `transferred_to_owner`, `acknowledged_at`; `EmergencyQueue` |
| D8 | **Outbound VOICE-call alert** to owner's cell on unhandled emergency, with retry count | `alert_retries`; `AlertRetriesPicker`; telnyx alert routes |
| D9 | **Speed-to-lead** — median time from call landing → owner alerted | `owner_notified_at − created_at`; `medianSpeedToLead()` |
| D10 | **Live transfer to owner** during a call | `transferred_to_owner` |
| D11 | **Lead lifecycle** new/contacted/scheduled/won/lost | `lead_status`; `LeadStatus` |
| D12 | **Assisted nudge** — system flags a stale lead, **pre-writes the text, owner sends from their own phone** | `needsFollowUp`, `isDueForNudge`, `FollowUpQueue` |
| D13 | **Reconcile / close-out queue** — booked jobs old enough to mark won/lost | `needsReconcile`, `ReconcileQueue` |
| D14 | **Outcomes ledger** — won jobs + est. value won, "didn't book" (never framed as loss) | `/portal/outcomes` |
| D15 | **Voicemail routing** per number (non-service callers), reversible | `voicemail_numbers`; `VoicemailToggle` |
| D16 | **Owner-set average job value** (drives the $ estimates) | `avg_ticket_dollars`; `AvgTicketEditor` |
| D17 | **7-day trial + best-call trial proof** | `site.pricing.trialDays`; `TrialProof` |

## Roadmap / NOT delivered (dashboard must NOT imply these)

| Item | Status |
|---|---|
| **Fully-automated outbound texter** | Deferred behind 10DLC brand/campaign + TCPA/STOP. Only *assisted* nudge (D12) exists. |
| **Calendar integration / "connect your calendar"** | **Not built.** No calendar sync anywhere in the tree. Booking = the AI books via intake; there is no Google/Outlook connect. |
| **Auto-declared won/lost / auto revenue reconciliation** | Never. won/lost is *always* manual (corpus decision, do-not-re-litigate). |
| **"Answer rate" as a variable metric** | Not meaningful — every call is answered. It is ~100% by design, not a KPI that moves. |
| **"Answer speed" (ring→pickup seconds)** | **Not measured.** AI answers instantly and the ring is not clocked. The real latency metric is D9 (speed-to-lead), which is alert-to-phone, not answer speed. |
| **"Quote" as a distinct call outcome** | No `quote` status exists. Outcomes are: Emergency, Booked, Transferred, After-hours, Routine, + message-for-owner. |
| **Reporting / analytics module** | No reports feature. Only the 14/30-day activity strip + stat tiles. |

## Framing rules baked into the product (must be preserved)

- Hero label is **"Est. value of jobs booked"**, NOT "revenue protected/captured".
  The corpus records that the inflated framing was *deliberately removed*. (Conflicts with the DESIGN SPEC hero label — see AUDIT.md.)
- "Lost" leads are labelled **"Didn't book"**, never rolled into a win-rate score.
- Any statistical marketing claim (e.g. "62% of missed calls never call back")
  is governed by `corpus/RESEARCH-PROTOCOL.md` — needs a cited source before display.
- Ops-only fields (`cost_usd`) are **never** shown in the portal.

## Reality check on data
Only ~10 test calls in the DB, one client (the founder). Any "our calls"
claim is anecdotal. Screenshots of a populated portal require auth + seed data.
