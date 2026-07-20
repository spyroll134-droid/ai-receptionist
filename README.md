# Trademark Web — AI receptionist

The whole product lives in this one repo: marketing site, ops dashboard,
Vapi voice-agent config, and the webhook backend that ties calls to the
database and owner notifications.

## Architecture — how the layers connect

```
Caller dials client's published number
  └─ client's team rings first (their phones, unchanged)
       └─ no answer after ~20s → carrier conditional forwarding kicks in
            └─ +1 918 223-4411 (Telnyx number)
                 └─ Telnyx FQDN SIP connection → Vapi BYO trunk
                      └─ Vapi assistant "restoration-intake-v1"
                           ├─ runs the intake script (lib/vapi-config.ts)
                           ├─ EMERGENCY → live warm-transfer to owner cell
                           └─ call ends → webhook → /api/vapi/webhook
                                ├─ saves call + intake data to Supabase
                                ├─ emails the owner (Resend)
                                └─ visible at /dashboard?key=...
```

The AI is a **second layer**, never a replacement: it only ever receives
calls the human team didn't answer. Uninstalling = one carrier code;
the client's published number is never touched.

## Overflow install (per client — this is the "20-minute setup")

Set **no-answer conditional forwarding** on the client's phone to the AI
number. Codes vary by carrier:

| Carrier | Enable | Disable |
|---|---|---|
| Verizon | `*71` + AI number | `*73` |
| AT&T | `**61*1<AI number>#` | `##61#` |
| T-Mobile | `**61*+1<AI number>**20#` (20 = ring seconds) | `##61#` |

Always place a live test call after install (playbook Phase 6): call the
client's number, let it ring out, confirm the AI answers, complete an
intake, verify the owner notification arrives, and test the emergency
transfer connects.

Known failure modes to test on every install (from the launch playbook):
- Google Voice clients: the forward must fire before GV's ~25s voicemail.
- Caller-ID passthrough: notifications must show the caller's real number.

## Key pieces

| Piece | Where |
|---|---|
| Site content, pricing, phone numbers | `lib/site-config.ts` (single source of truth) |
| AI agent script/prompt/voice | `lib/vapi-config.ts` → synced via `scripts/sync-vapi-assistant.ts` |
| Call webhook (DB + email) | `app/api/vapi/webhook/route.ts` |
| Trial signup API | `app/api/trial-signup/route.ts` |
| Ops dashboard | `app/dashboard/page.tsx` (gated by `DASHBOARD_KEY`) |
| DB schema | `supabase/schema.sql` |
| Telnyx TeXML fallback route (unused, kept as backup) | `app/api/telnyx/texml/` |

## Environment variables

See `.env.local.example`. Supabase vars are auto-provisioned via the
Vercel Marketplace integration. `RESEND_API_KEY` requires accepting the
Resend integration terms once. `VAPI_API_KEY` comes from the Vapi
dashboard. `DASHBOARD_KEY` gates `/dashboard`.

## Updating the AI agent

Edit `lib/vapi-config.ts`, then:

```bash
npx tsx scripts/sync-vapi-assistant.ts
```

Changes go live on the phone number immediately. Per the playbook: once
the agent passes its torture test, the demo line never gets experimental
changes — test tweaks in a second assistant first.

## Local development

```bash
npm install
npm run dev
```

## Deploying

`vercel --prod` from this directory (or push to `main` once the GitHub
integration is connected in Vercel).
