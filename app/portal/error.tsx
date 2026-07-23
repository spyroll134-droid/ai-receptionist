"use client";

import RouteError from "@/components/RouteError";

// Error boundary for the client portal. `unstable_retry` is this Next
// version's retry API (v16.2.0) — it re-fetches and re-renders the segment.
export default function PortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError error={error} retry={unstable_retry} homeHref="/portal" />
  );
}
