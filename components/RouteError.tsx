"use client";

import Link from "next/link";
import { useEffect } from "react";
import { site } from "@/lib/site-config";

// Shared body for the signed-in error boundaries (portal + dashboard). Error
// boundaries must be Client Components, so this is where the "use client" lives
// and each segment's error.tsx is a thin wrapper that passes this version's
// `unstable_retry` in as `retry`.
//
// The default Next error overlay is a developer artifact; a contractor who hits
// a transient Supabase blip should see something calm, a working Try again
// (which re-runs the server render — often the blip is gone), and a way to
// reach a human. The digest is shown small: it's the only handle that ties
// what they saw to our server logs.

export default function RouteError({
  error,
  retry,
  homeHref,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
}) {
  useEffect(() => {
    // Server-component errors arrive here already scrubbed of their message in
    // production; the digest is what matches this to the server-side log.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <div
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full border border-critical-line bg-critical-surface text-critical-text"
      >
        ▲
      </div>
      <h1 className="mt-5 text-lg font-semibold text-content-primary">
        Something went wrong loading this page
      </h1>
      <p className="mt-2 text-sm text-content-secondary">
        This is usually temporary. Try again — if it keeps happening, your data
        is safe and we can help.
      </p>

      <div className="mt-6 flex items-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-accent-button px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-button-hover"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="rounded-md border border-line-default px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:border-line-strong hover:text-content-primary"
        >
          Back to start
        </Link>
      </div>

      <p className="mt-6 text-xs text-content-tertiary">
        Still stuck? Email{" "}
        <a
          href={`mailto:${site.contactEmail}`}
          className="text-content-secondary underline transition-colors hover:text-content-primary"
        >
          {site.contactEmail}
        </a>
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-2xs text-content-faint">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
