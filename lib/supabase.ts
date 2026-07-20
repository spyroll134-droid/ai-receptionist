import { createClient } from "@supabase/supabase-js";

// Service-role client: server-side only (used in API routes), never import
// this into a client component. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to be set (see .env.local.example).
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key);
}
