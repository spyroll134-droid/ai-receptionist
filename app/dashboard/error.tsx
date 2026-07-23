"use client";

import RouteError from "@/components/RouteError";

// Error boundary for the internal ops dashboard. See app/portal/error.tsx.
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <RouteError error={error} retry={unstable_retry} homeHref="/dashboard" />
  );
}
