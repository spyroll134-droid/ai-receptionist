"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseSessionClient } from "@/lib/supabase-auth";
import { site } from "@/lib/site-config";

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

  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" tells an attacker which emails are real.
    return { error: "That email and password don't match. Try again." };
  }

  revalidatePath("/portal");
  redirect(next.startsWith("/") ? next : "/portal");
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
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site.deployedUrl}/login`,
  });

  // Always report success, whether or not the address exists — otherwise this
  // becomes a way to enumerate which clients have accounts.
  return { error: undefined };
}
