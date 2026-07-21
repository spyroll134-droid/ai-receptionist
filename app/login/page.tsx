"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { site } from "@/lib/site-config";
import { signIn, requestPasswordReset, type AuthState } from "@/app/actions/auth";
import { Button, Card, Field } from "@/components/ui";

// Client sign-in. Email + password via Supabase Auth; the session lands in an
// httpOnly cookie and proxy.ts keeps it fresh. Accounts are provisioned by
// Trademark Web during setup (scripts/create-client-login.ts) — there is no
// public signup, because onboarding includes carrier forwarding we do by hand.

export default function Login() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signIn,
    undefined
  );
  const [showReset, setShowReset] = useState(false);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface-base px-6 py-16 text-content-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(59,130,246,0.13), transparent 70%)",
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
            {showReset ? "Reset your password" : "Client sign in"}
          </h1>
          <p className="mt-2 text-sm text-content-secondary">
            {showReset
              ? "We'll email you a link to set a new password."
              : "See every call your AI receptionist has caught."}
          </p>
        </div>

        <Card className="mt-8 p-6">
          {showReset ? (
            <ResetForm onBack={() => setShowReset(false)} />
          ) : (
            <form action={formAction} className="space-y-4">
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                placeholder="you@yourcompany.com"
              />
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />

              {state?.error && (
                <p
                  role="alert"
                  className="rounded-lg border border-critical-line bg-critical-surface px-3 py-2 text-sm text-critical-text"
                >
                  {state.error}
                </p>
              )}

              <Button type="submit" size="lg" disabled={pending} className="w-full">
                {pending ? "Signing in…" : "Sign in"}
              </Button>

              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="w-full text-center text-xs text-content-tertiary transition-colors hover:text-content-primary"
              >
                Forgot your password?
              </button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-content-tertiary">
          Don&apos;t have a login yet? Email{" "}
          <a
            href={`mailto:${site.contactEmail}`}
            className="text-content-secondary underline transition-colors hover:text-content-primary"
          >
            {site.contactEmail}
          </a>
        </p>
      </div>
    </div>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    undefined
  );
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="text-center">
        <p className="text-sm text-content-primary">
          If that email has an account, a reset link is on its way.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm font-medium text-accent-text hover:text-content-primary"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setSent(true)} className="space-y-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        autoFocus
        placeholder="you@yourcompany.com"
      />
      {state?.error && (
        <p role="alert" className="text-sm text-critical-text">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-content-tertiary transition-colors hover:text-content-primary"
      >
        Back to sign in
      </button>
    </form>
  );
}
