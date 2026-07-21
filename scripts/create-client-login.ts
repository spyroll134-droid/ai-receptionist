/**
 * Provision a portal login for a client.
 *
 *   npx tsx scripts/create-client-login.ts "Acme Restoration" owner@acme.com
 *
 * There is no public signup: onboarding is done-for-you (carrier forwarding,
 * test call, the $199 setup), so accounts are created here during that process.
 *
 * Creates the auth user, creates the client row if it doesn't exist, and
 * links the two via client_users. Prints a one-time password-setup link —
 * never a plaintext password, which would persist in shell history and
 * scrollback and stay valid indefinitely.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role is required
 * to create users and to write client_users, which RLS makes read-only).
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const [, , clientName, email, tradeArg] = process.argv;

if (!clientName || !email) {
  console.error(
    'Usage: npx tsx scripts/create-client-login.ts "<Client Name>" <email> [trade]'
  );
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with:  set -a && . ./.env.local && set +a && npx tsx ...");
  process.exit(1);
}

const trade = tradeArg ?? "Restoration";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://ai-receptionist-eight-umber.vercel.app";

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Auth user. The password is random and never shown anywhere — the
  //    client sets their own via the one-time link printed at the end.
  //    email_confirm skips the verification email since we provision this
  //    live during the setup call.
  const { data: created, error: userErr } = await db.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
  });
  if (userErr) {
    console.error("Could not create auth user:", userErr.message);
    process.exit(1);
  }
  const authUserId = created.user.id;

  // 2. Client row — reuse an existing one with this name rather than
  //    silently creating a duplicate.
  const { data: existing } = await db
    .from("clients")
    .select("id, name")
    .eq("name", clientName)
    .maybeSingle();

  let clientId = existing?.id as string | undefined;
  if (!clientId) {
    const accessKey = randomBytes(12).toString("base64url");
    const { data: newClient, error: clientErr } = await db
      .from("clients")
      .insert({
        name: clientName,
        trade,
        owner_email: email,
        access_key: accessKey,
      })
      .select("id")
      .single();
    if (clientErr) {
      console.error("Could not create client:", clientErr.message);
      process.exit(1);
    }
    clientId = newClient.id;
  }

  // 3. Link them.
  const { error: linkErr } = await db
    .from("client_users")
    .insert({ auth_user_id: authUserId, client_id: clientId, role: "owner" });
  if (linkErr) {
    console.error("Could not link user to client:", linkErr.message);
    process.exit(1);
  }

  // 4. One-time password-setup link — expires, works once, and the client
  //    picks their own password. Nothing durable lands in scrollback.
  const { data: linkData, error: linkGenErr } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/reset-password` },
  });
  const setupLink = linkGenErr
    ? `(link generation failed: ${linkGenErr.message} — use "Forgot your password?" on ${SITE_URL}/login)`
    : linkData.properties.action_link;

  console.log("\n  Portal login created");
  console.log("  ─────────────────────────────────────────");
  console.log(`  Client    ${clientName} (${trade})`);
  console.log(`  Email     ${email}`);
  console.log("  ─────────────────────────────────────────");
  console.log("  Send them this one-time link to set their password:");
  console.log(`  ${setupLink}`);
  console.log(`  Then they sign in at ${SITE_URL}/login\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
