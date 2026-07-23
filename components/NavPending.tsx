"use client";

import { useLinkStatus } from "next/link";

// Instant click feedback for the sidebar/tab nav. With the full-page loading
// skeleton removed (it flashed the whole shell out on every click), a client
// navigation keeps the current page on screen until the destination's data
// resolves — seamless, but a fast click can otherwise feel like nothing
// happened. This fills the destination tab's left accent rail the moment it's
// clicked, so the tap always registers. Must live inside a <Link> (that's what
// useLinkStatus reads); pending flips false once the new route commits.
//
// The slot is always rendered at a fixed size and only its paint changes, so
// there is no layout shift when it turns on (per the useLinkStatus docs).
export function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity duration-150 ${
        pending ? "animate-pulse opacity-100" : "opacity-0"
      }`}
    />
  );
}
