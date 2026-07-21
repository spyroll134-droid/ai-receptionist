import { connection } from "next/server";

/**
 * The current time, read once per request.
 *
 * Two reasons this exists instead of calling `Date.now()` inside a page:
 *
 * 1. `connection()` marks the render as dynamic, so the timestamp is never
 *    captured at build time and frozen into a prerendered page.
 * 2. Reading the clock during a component's render is impure — React's
 *    purity rules flag it, and rightly so: a server render and the client
 *    hydration would produce different values, so any relative time ("2h
 *    ago") would mismatch and warn. Reading it here, outside render, and
 *    passing the value down as a prop keeps both sides in agreement.
 *
 * Pass the result into anything that needs "now" rather than letting
 * components reach for the clock themselves.
 */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}
