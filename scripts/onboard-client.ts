/**
 * Onboard a client end-to-end.
 *
 *   set -a && . ./.env.local && set +a
 *   npx tsx scripts/onboard-client.ts \
 *     --name "Acme Restoration" \
 *     --email owner@acme.com \
 *     --phone-number-id <vapi phone number id> \
 *     --transfer +13135551234 \
 *     --trade Restoration \
 *     --area "Metro Detroit" \
 *     --greeting "Acme Restoration"
 *
 * Does, in order:
 *   1. Points the Vapi phone number at /api/vapi/assistant-request and CLEARS
 *      its assistantId — that's what makes Vapi ask us per call which client
 *      owns the number, instead of using one hardcoded assistant. Also sets
 *      server.secret so our endpoints can authenticate Vapi's requests.
 *   2. Creates the portal auth user. BEFORE the client row: the auth user is
 *      the step most likely to fail (duplicate email), and failing here
 *      leaves no orphaned client row with a live number routed at it.
 *   3. Creates the client row and links it via client_users, cleaning up on
 *      failure so a partial run never leaves the database inconsistent.
 *   4. Prints the carrier forwarding codes and a one-time password-setup
 *      link to hand over (never a plaintext password — those live forever in
 *      shell history and scrollback).
 *
 * Buy the number in Telnyx and import it to Vapi first — automating that is
 * not worth it at this volume. This script takes the resulting Vapi phone
 * number id (`curl -H "Authorization: Bearer $VAPI_API_KEY" \
 * https://api.vapi.ai/phone-number` lists them).
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { site } from "../lib/site-config";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const name = arg("name");
const email = arg("email");
const phoneNumberId = arg("phone-number-id");
const transfer = arg("transfer");
const trade = arg("trade") ?? "Restoration";
const area = arg("area");
const greeting = arg("greeting") ?? name;
const notes = arg("notes");
// The E.164 of the AI line itself (the number bought in Telnyx and imported to
// Vapi). Stored so the emergency voice alert can ring the owner FROM their own
// business line — a caller ID they recognize — instead of the shared default.
// Optional because the alert degrades gracefully without it.
const number = arg("number");
if (number && !/^\+1\d{10}$/.test(number)) {
  console.error(`--number must be E.164 like +12485551234, got "${number}"`);
  process.exit(1);
}
// Ask during the setup call: "what's your average job worth?" Owners always
// know. Omit to fall back to the trade default (site.avgTicketByTrade).
const avgTicketArg = arg("avg-ticket");
const avgTicket = avgTicketArg ? Number(avgTicketArg.replace(/[$,]/g, "")) : null;
if (avgTicketArg && (!Number.isInteger(avgTicket) || avgTicket! < 50)) {
  console.error(`--avg-ticket must be a whole dollar amount, got "${avgTicketArg}"`);
  process.exit(1);
}

if (!name || !email || !phoneNumberId || !transfer) {
  console.error(
    "Required: --name, --email, --phone-number-id, --transfer\n" +
      "Optional: --trade --area --greeting --notes --avg-ticket --number"
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPI_KEY = process.env.VAPI_API_KEY;
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
// The live production domain is the single source of truth in site-config.
// NEXT_PUBLIC_SITE_URL may override it for a preview deploy, but the old
// hardcoded fallback pointed onboarding — password links, Vapi webhook URL —
// at a stale preview deployment whenever that env var was absent.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? site.deployedUrl;

if (!SUPABASE_URL || !SERVICE_KEY || !VAPI_KEY || !WEBHOOK_SECRET) {
  console.error(
    "Missing env (need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPI_API_KEY, VAPI_WEBHOOK_SECRET).\n" +
      "Run: set -a && . ./.env.local && set +a && npx tsx ..."
  );
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // ---- 1. Point the Vapi number at our resolver ---------------------------
  // assistantId must be null: with one set, Vapi uses it directly and never
  // asks us who owns the number, so every client would get the demo greeting.
  const vapiRes = await fetch(
    `https://api.vapi.ai/phone-number/${phoneNumberId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VAPI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId: null,
        server: {
          url: `${SITE_URL}/api/vapi/assistant-request`,
          // Echoed back as x-vapi-secret; our endpoints reject without it.
          secret: WEBHOOK_SECRET,
        },
      }),
    }
  );
  if (!vapiRes.ok) {
    console.error(`Vapi update failed: ${vapiRes.status}`);
    console.error(await vapiRes.text());
    process.exit(1);
  }
  const vapiNumber = (await vapiRes.json()) as { number?: string };
  // If anything below fails, the number resolves to no client and the
  // assistant-request route serves the demo assistant — degraded, not broken.

  // ---- 2. Portal auth user ------------------------------------------------
  // BEFORE the client row: duplicate email is the likeliest failure in the
  // whole script, and failing here leaves nothing behind to clean up. The
  // password is random and never shown — the client sets their own via the
  // one-time link printed at the end.
  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
  });
  if (userErr) {
    console.error("Auth user failed:", userErr.message);
    console.error("Nothing was written — safe to re-run after fixing this.");
    process.exit(1);
  }

  // ---- 3. Client row + link -----------------------------------------------
  const accessKey = randomBytes(12).toString("base64url");
  const { data: client, error: clientErr } = await db
    .from("clients")
    .insert({
      name,
      greeting_name: greeting,
      trade,
      owner_email: email,
      access_key: accessKey,
      vapi_phone_number_id: phoneNumberId,
      emergency_transfer_number: transfer,
      assigned_number: number ?? null,
      service_area: area ?? null,
      agent_notes: notes ?? null,
      avg_ticket_dollars: avgTicket,
    })
    .select("id")
    .single();
  if (clientErr) {
    console.error("Client insert failed:", clientErr.message);
    await db.auth.admin.deleteUser(created.user.id); // undo step 2
    console.error("Auth user rolled back — safe to re-run.");
    process.exit(1);
  }

  const { error: linkErr } = await db
    .from("client_users")
    .insert({
      auth_user_id: created.user.id,
      client_id: client.id,
      role: "owner",
    });
  if (linkErr) {
    console.error("Link failed:", linkErr.message);
    await db.from("clients").delete().eq("id", client.id); // undo step 3
    await db.auth.admin.deleteUser(created.user.id); // undo step 2
    console.error("Client row and auth user rolled back — safe to re-run.");
    process.exit(1);
  }

  // One-time recovery link instead of a password: a plaintext password in
  // terminal output persists in shell history/scrollback and stays valid
  // forever; this link expires, works once, and the client picks their own.
  const { data: linkData, error: linkGenErr } = await db.auth.admin.generateLink({
    type: "recovery",
    email: email!, // guarded non-empty at the top of the script
    options: { redirectTo: `${SITE_URL}/reset-password` },
  });
  const setupLink = linkGenErr
    ? `(link generation failed: ${linkGenErr.message} — use "Forgot your password?" on ${SITE_URL}/login)`
    : linkData.properties.action_link;

  // ---- 4. Handoff ---------------------------------------------------------
  const aiNumber = vapiNumber.number ?? "(see Vapi dashboard)";
  // GSM MMI codes want the destination in a dialable form; Verizon's *71
  // wants bare digits. Fall back to a placeholder if Vapi didn't return the
  // number, so the printed codes are obviously incomplete rather than wrong.
  const digits = aiNumber.replace(/\D/g, "");
  const dest = digits ? (digits.length === 10 ? `1${digits}` : digits) : "AI-NUMBER";
  const vzNoAnswer = digits ? `*71${digits.slice(-10)}` : "*71<AI-NUMBER>";
  const gsmNoAnswer = `**61*${dest}**20#`; // 20 = ring seconds before forwarding
  const gsmBusy = `**67*${dest}#`;
  const gsmUnreach = `**62*${dest}#`;
  const gsmAll = `**004*${dest}#`;
  console.log(`
  ${name} is onboarded
  ═══════════════════════════════════════════════

  AI number        ${aiNumber}
  Transfers to     ${transfer}
  Trade            ${trade}${area ? `\n  Service area     ${area}` : ""}

  PORTAL LOGIN — send the client this one-time link
  (expires; they set their own password there)
  ───────────────────────────────────────────────
  ${email}
  ${setupLink}
  Sign in after: ${SITE_URL}/login

  SET CONDITIONAL FORWARDING ON THEIR PHONE
  ───────────────────────────────────────────────
  Dial these once from the client's cell as if placing a call.
  Cover all THREE conditions so nothing slips past the AI — a call
  that only forwards on no-answer still hits carrier voicemail when
  the line is busy or the phone is off.

    No answer     ${vzNoAnswer}          (undo: *73)     [Verizon]
                  ${gsmNoAnswer}   (undo: ##61#)   [AT&T / T-Mobile]
    Busy          ${gsmBusy}   (undo: ##67#)   [AT&T / T-Mobile]
    Unreachable   ${gsmUnreach}   (undo: ##62#)   [phone off / no signal]

  Or set all three at once (GSM carriers):
    All           ${gsmAll}   (undo: ##004#)
  Verify no-answer is live:  *#61#

  RING TIMER: set no-answer forwarding to ring ~15–20 seconds before
  it kicks over. Too short and the owner never gets a chance to grab a
  real customer; too long and the caller gives up before the AI answers.
  On GSM the seconds go in the code (…**SS#, e.g. **20#); Verizon fixes
  it in the carrier's account settings.

  THEN PLACE A LIVE TEST CALL
  ───────────────────────────────────────────────
  Ring their published number, let it ring out, confirm:
    - the AI answers as "${greeting}"
    - a full intake completes
    - the owner email arrives
    - an emergency transfer connects to ${transfer}
  Then repeat with the line BUSY and with the phone OFF — each should
  reach the AI, not carrier voicemail.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
