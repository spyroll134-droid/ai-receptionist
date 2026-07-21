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
 *      owns the number, instead of using one hardcoded assistant.
 *   2. Creates the client row with its agent config.
 *   3. Creates the portal login and links it via client_users.
 *   4. Prints the carrier forwarding codes and the credentials to hand over.
 *
 * Buy the number in Telnyx and import it to Vapi first — automating that is
 * not worth it at this volume. This script takes the resulting Vapi phone
 * number id (`curl -H "Authorization: Bearer $VAPI_API_KEY" \
 * https://api.vapi.ai/phone-number` lists them).
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

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

if (!name || !email || !phoneNumberId || !transfer) {
  console.error(
    "Required: --name, --email, --phone-number-id, --transfer\n" +
      "Optional: --trade --area --greeting --notes"
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPI_KEY = process.env.VAPI_API_KEY;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-receptionist-eight-umber.vercel.app";

if (!SUPABASE_URL || !SERVICE_KEY || !VAPI_KEY) {
  console.error(
    "Missing env. Run: set -a && . ./.env.local && set +a && npx tsx ..."
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
        server: { url: `${SITE_URL}/api/vapi/assistant-request` },
      }),
    }
  );
  if (!vapiRes.ok) {
    console.error(`Vapi update failed: ${vapiRes.status}`);
    console.error(await vapiRes.text());
    process.exit(1);
  }
  const vapiNumber = (await vapiRes.json()) as { number?: string };

  // ---- 2. Client row ------------------------------------------------------
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
      service_area: area ?? null,
      agent_notes: notes ?? null,
    })
    .select("id")
    .single();
  if (clientErr) {
    console.error("Client insert failed:", clientErr.message);
    process.exit(1);
  }

  // ---- 3. Portal login ----------------------------------------------------
  const password = randomBytes(12).toString("base64url");
  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) {
    console.error("Auth user failed:", userErr.message);
    console.error("Client row was created — delete it before retrying.");
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
    process.exit(1);
  }

  // ---- 4. Handoff ---------------------------------------------------------
  const aiNumber = vapiNumber.number ?? "(see Vapi dashboard)";
  console.log(`
  ${name} is onboarded
  ═══════════════════════════════════════════════

  AI number        ${aiNumber}
  Transfers to     ${transfer}
  Trade            ${trade}${area ? `\n  Service area     ${area}` : ""}

  PORTAL LOGIN — give these to the client
  ───────────────────────────────────────────────
  ${SITE_URL}/login
  ${email}
  ${password}

  SET NO-ANSWER FORWARDING ON THEIR PHONE
  ───────────────────────────────────────────────
  Verizon     *71${aiNumber.replace(/\D/g, "")}      (disable: *73)
  AT&T        **61*1${aiNumber.replace(/\D/g, "")}#  (disable: ##61#)
  T-Mobile    **61*${aiNumber}**20#                  (disable: ##61#)

  THEN PLACE A LIVE TEST CALL
  ───────────────────────────────────────────────
  Ring their published number, let it ring out, confirm:
    - the AI answers as "${greeting}"
    - a full intake completes
    - the owner email arrives
    - an emergency transfer connects to ${transfer}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
