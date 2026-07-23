import { getSupabaseServerClient } from "./supabase";

// Postgres-backed rate limiting.
//
// Deliberately not Redis: this guards a landing-page form doing single-digit
// requests an hour, and adding Upstash would mean another vendor, another key,
// and another thing to break. Supabase is already a hard dependency.
//
// In-memory counters would NOT work here — serverless functions scale to many
// instances, so each would keep its own count and the limit would be
// effectively N times higher than configured.

/**
 * Takes anything with a `headers` bag — a NextRequest in a route handler, or
 * the `await headers()` result inside a Server Action, which has no request
 * object to hand around.
 */
type HasHeaders = { headers: { get(name: string): string | null } };

export async function rateLimit(
  source: HasHeaders | Headers,
  opts: { key: string; max: number; windowMinutes: number }
): Promise<{ ok: boolean; remaining: number }> {
  const h = source instanceof Headers ? source : source.headers;

  // On Vercel, x-forwarded-for is set by the platform and its first entry is
  // the real client. Locally it's absent, so fall back to a constant — which
  // makes dev share one bucket, and that's fine.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local";

  try {
    const supabase = getSupabaseServerClient();

    // One atomic round trip (supabase/ops.sql): insert the hit and count the
    // window under an advisory lock. A separate count-then-insert here would
    // race — N concurrent requests all see the pre-burst count and all pass.
    const { data: used, error } = await supabase.rpc("rate_limit_hit", {
      p_bucket: opts.key,
      p_identifier: ip,
      p_window_minutes: opts.windowMinutes,
    });

    if (error) {
      // Fail OPEN. A rate limiter that blocks real signups when its own table
      // is unreachable causes more damage than the spam it prevents.
      console.error("rate limit check failed, allowing:", error.message);
      return { ok: true, remaining: opts.max };
    }

    // `used` includes this request. Over-limit hits are still recorded, so a
    // sustained abuser stays locked out rather than sliding back in.
    const n = Number(used ?? 1);
    if (n > opts.max) return { ok: false, remaining: 0 };
    return { ok: true, remaining: opts.max - n };
  } catch (err) {
    console.error("rate limit error, allowing:", err);
    return { ok: true, remaining: opts.max };
  }
}
