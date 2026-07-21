"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { site } from "@/lib/site-config";
import { Button, Card, Field } from "@/components/ui";

// Client sign-in. NOTE: still the interim access-code flow — the code is
// exchanged for the portal URL client-side. Being replaced by Supabase Auth
// (email + password) against the client_users table; see supabase/auth.sql.
// Until that lands, treat the access code as a password.

export default function Login() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your access code.");
      return;
    }
    router.push(`/portal/${encodeURIComponent(trimmed)}`);
  }

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
            Client sign in
          </h1>
          <p className="mt-2 text-sm text-content-secondary">
            Enter the access code we gave you at setup.
          </p>
        </div>

        <Card className="mt-8 p-6">
          <form onSubmit={submit} noValidate>
            <Field
              label="Access code"
              name="accessCode"
              autoFocus
              autoComplete="one-time-code"
              spellCheck={false}
              value={code}
              placeholder="e.g. lrqKAu_PIJ0I-g"
              className="font-mono"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "code-error" : undefined}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
            />

            {error && (
              <p
                id="code-error"
                role="alert"
                className="mt-2 text-sm text-critical-text"
              >
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-4 w-full">
              View my dashboard
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-content-tertiary">
            Lost your code? Email{" "}
            <a
              href={`mailto:${site.contactEmail}`}
              className="text-content-secondary underline transition-colors hover:text-content-primary"
            >
              {site.contactEmail}
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
