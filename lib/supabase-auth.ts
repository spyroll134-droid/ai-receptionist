import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Session-aware Supabase clients for client logins.
//
// Distinct from lib/supabase.ts, which is the SERVICE-ROLE client used by the
// Vapi webhook — that one bypasses RLS on purpose. These use the anon key plus
// the signed-in user's session, so the RLS policies in supabase/auth.sql do the
// access control. A bug in a query here cannot leak another client's calls.

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return { url, key };
}

/** For Server Components, Server Actions, and Route Handlers. */
export async function getSupabaseSessionClient() {
  const { url, key } = env();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. That's fine — proxy.ts
          // refreshes the session on every request, so the token stays fresh.
        }
      },
    },
  });
}

/**
 * The signed-in user's client row, or null.
 * Goes through client_users -> clients, and RLS restricts both to this user.
 */
export async function getCurrentClient() {
  const supabase = await getSupabaseSessionClient();

  // getUser() revalidates the JWT against Supabase. Never trust getSession()
  // for authorization — it reads the cookie without verifying it.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!membership) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", membership.client_id)
    .maybeSingle();

  return client ? { client, user } : null;
}

/**
 * Is the current session an admin (ops dashboard)?
 *
 * Checked against the `admins` table rather than a shared secret, so access is
 * revocable per-person and never travels in a URL. Reads through the user's own
 * session, so RLS ("own admin row") applies.
 */
export async function requireAdmin(): Promise<boolean> {
  const supabase = await getSupabaseSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("admins")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return Boolean(data);
}
