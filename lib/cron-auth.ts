import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Shared auth for the Vercel Cron endpoints, matching the posture of
// lib/vapi-auth.ts.
//
// FAILS CLOSED. The previous gate was `if (secret && header !== ...)`, which
// meant an unset CRON_SECRET made the condition false and left the endpoints
// PUBLIC — /api/cron/health enumerates client names, call counts and
// operational state, and invokes prune_rate_limits(). A missing env var is
// exactly the case that has to be denied, not waved through: losing a cron run
// is visible in Vercel's dashboard, an open endpoint is visible to nobody.
export function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(
      "CRON_SECRET is not set — rejecting cron request. Set it in the " +
        "deployment environment; Vercel Cron sends it as `Authorization: Bearer`."
    );
    return false;
  }
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${expected}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
