"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSupabaseSessionClient } from "@/lib/supabase-auth";
import { site } from "@/lib/site-config";
import { rateLimit } from "@/lib/rate-limit";

// Server Actions for client sign-in. Credentials never reach the browser
// bundle — the form posts here and Supabase is called server-side.

export type AuthState = { error?: string } | undefined;

export async function signIn(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/portal");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Password guessing was otherwise unbounded here — Supabase applies no
  // per-IP limit to signInWithPassword, so a script could work a client's
  // email address at whatever rate the network allowed, and the only trace
  // would be Supabase auth logs nobody reads.
  //
  // 10 an hour per IP is far above any human: a real client who forgets their
  // password tries three or four times and clicks the reset link. It is far
  // below any useful guessing rate. Nothing about how sessions or isolation
  // work is touched — this only decides whether we call Supabase at all.
  //
  // rateLimit fails OPEN by design (lib/rate-limit.ts): if its own table is
  // unreachable, a real client can still sign in. That is the right trade for
  // a login form on a product whose whole promise is "you can see your calls."
  const limited = await rateLimit(await headers(), {
    key: "sign-in",
    max: 10,
    windowMinutes: 60,
  });
  if (!limited.ok) {
    return { error: "Too many sign-in attempts. Try again in an hour." };
  }

  const supabase = await getSupabaseSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" tells an attacker which emails are real.
    return { error: "That email and password don't match. Try again." };
  }

  // Where to land. `next` used to be read from a form field that the login
  // form never rendered, so it was always empty and everyone — admins
  // included — was sent to /portal. An admin would land on the client portal
  // and have no route to /dashboard, which reads as a failed sign-in.
  // Destination is now derived from who actually signed in.
  const { data: admin } = await supabase
    .from("admins")
    .select("auth_user_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  const home = admin ? "/dashboard" : "/portal";

  // Only same-origin paths, and never bounce straight back to /login.
  const dest =
    next.startsWith("/") && !next.startsWith("//") && next !== "/login"
      ? next
      : home;

  revalidatePath("/", "layout");
  redirect(dest);
}

export async function signOut() {
  const supabase = await getSupabaseSessionClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await getSupabaseSessionClient();
  // Supabase requires an absolute redirect URL. site-config is the single
  // source of truth for the deployed origin, so it updates with the domain.
  // /reset-password consumes the ?code= and shows the new-password form —
  // /login would silently swallow the link.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site.deployedUrl}/reset-password`,
  });

  // Always report success, whether or not the address exists — otherwise this
  // becomes a way to enumerate which clients have accounts.
  return { error: undefined };
}
