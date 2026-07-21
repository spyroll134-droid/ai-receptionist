/**
 * Reset the admin account's password and print it once.
 *
 *   set -a && . ./.env.local && set +a && npx tsx scripts/reset-admin-password.ts <email>
 *
 * For the owner's own admin account when the email reset flow is unavailable
 * (e.g. Supabase Site URL still points at localhost). Change the password
 * after signing in if this output lands anywhere durable.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/reset-admin-password.ts <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with:  set -a && . ./.env.local && set +a && npx tsx ...");
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await db.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No auth user with email ${email}`);
    process.exit(1);
  }

  const password = randomBytes(15).toString("base64url");
  const { error: updErr } = await db.auth.admin.updateUserById(user.id, {
    password,
  });
  if (updErr) throw updErr;

  console.log(`\n  Password reset for ${email}`);
  console.log(`  New password: ${password}`);
  console.log("  Sign in at https://thebackupline.com/login\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
