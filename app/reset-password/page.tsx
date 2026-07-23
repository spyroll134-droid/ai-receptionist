"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { site } from "@/lib/site-config";
import { Button, Card, Field } from "@/components/ui";

// Lands here from two kinds of Supabase recovery links:
//
//   1. "Forgot your password?" emails (app/actions/auth.ts) — PKCE flow, the
//      link arrives with ?code=... and the verifier lives in a cookie set
//      when the email was requested, so the exchange must happen in the same
//      browser via exchangeCodeForSession.
//   2. Admin-generated one-time links (scripts/onboard-client.ts,
//      scripts/create-client-login.ts) — implicit flow, tokens arrive in the
//      URL #fragment and are claimed with setSession.
//
// Before this page existed the links redirected to /login, which consumed
// nothing — the reset flow looked like it worked and silently did nothing.
//
// createBrowserClient shares cookie storage with the server clients
// (lib/supabase-auth.ts), so the session established here is visible to
// /portal and /dashboard immediately after redirect.

type Phase = "verifying" | "ready" | "saving" | "done" | "error";

export default function ResetPassword() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [phase, setPhase] = useState<Phase>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));

      // Supabase reports expired/used links as error params on the redirect.
      const errDesc =
        params.get("error_description") ?? hash.get("error_description");
      if (errDesc) {
        setError(errDesc.replace(/\+/g, " "));
        setPhase("error");
        return;
      }

      const tokenHash = params.get("token_hash");
      const code = params.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (tokenHash) {
          // token_hash links (email template using {{ .TokenHash }}) verify
          // directly against Supabase — no PKCE verifier cookie required, so
          // they work from any browser or device, and survive the email being
          // requested in one place and opened in another.
          const { error: err } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (err) throw err;
        } else if (code) {
          const { error: err } = await supabase.auth.exchangeCodeForSession(code);
          if (err) throw err;
        } else if (accessToken && refreshToken) {
          const { error: err } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (err) throw err;
        } else {
          // No token in the URL — usable only if already signed in (e.g. a
          // signed-in user changing their password on purpose).
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            setError(
              "This link is missing its sign-in token — it may have been used already."
            );
            setPhase("error");
            return;
          }
        }

        // Scrub tokens out of the URL so they don't sit in history.
        window.history.replaceState(null, "", "/reset-password");
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setPhase("saving");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setPhase("ready");
      return;
    }
    setPhase("done");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface-base px-6 py-16 text-content-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--color-accent) 13%, transparent), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="text-center">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-content-primary"
          >
            {site.businessName}
          </Link>
          <h1 className="mt-8 text-2xl font-semibold text-content-primary">
            Set your password
          </h1>
        </div>

        <Card className="mt-8 p-6">
          {phase === "verifying" && (
            <p className="text-center text-sm text-content-secondary">
              Checking your link…
            </p>
          )}

          {phase === "error" && (
            <div className="text-center">
              <p
                role="alert"
                className="rounded-lg border border-critical-line bg-critical-surface px-3 py-2 text-sm text-critical-text"
              >
                {error ?? "This link didn't work."}
              </p>
              <p className="mt-4 text-sm text-content-secondary">
                Links expire and only work once. Request a fresh one from the
                sign-in page.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-accent-text hover:text-content-primary"
              >
                Back to sign in →
              </Link>
            </div>
          )}

          {(phase === "ready" || phase === "saving") && (
            <form onSubmit={save} className="space-y-4">
              <Field
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {error && (
                <p role="alert" className="text-sm text-critical-text">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={phase === "saving"}
                className="w-full"
              >
                {phase === "saving" ? "Saving…" : "Save password"}
              </Button>
            </form>
          )}

          {phase === "done" && (
            <div className="text-center">
              <p className="text-sm text-content-primary">
                Password saved — you&apos;re signed in.
              </p>
              <div className="mt-5 space-y-2">
                <Link
                  href="/portal"
                  className="block text-sm font-medium text-accent-text hover:text-content-primary"
                >
                  Open your call portal →
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
