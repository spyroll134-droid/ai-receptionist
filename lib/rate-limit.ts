import type { NextRequest } from "next/server";
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

export async function rateLimit(
  req: NextRequest,
  opts: { key: string; max: number; windowMinutes: number }
): Promise<{ ok: boolean; remaining: number }> {
  // On Vercel, x-forwarded-for is set by the platform and its first entry is
  // the real client. Locally it's absent, so fall back to a constant — which
  // makes dev share one bucket, and that's fine.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  const since = new Date(Date.now() - opts.windowMinutes * 60_000).toISOString();

  try {
    const supabase = getSupabaseServerClient();

    const { count, error } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("bucket", opts.key)
      .eq("identifier", ip)
      .gte("created_at", since);

    if (error) {
      // Fail OPEN. A rate limiter that blocks real signups when its own table
      // is unreachable causes more damage than the spam it prevents.
      console.error("rate limit check failed, allowing:", error.message);
      return { ok: true, remaining: opts.max };
    }

    const used = count ?? 0;
    if (used >= opts.max) return { ok: false, remaining: 0 };

    await supabase
      .from("rate_limits")
      .insert({ bucket: opts.key, identifier: ip });

    return { ok: true, remaining: opts.max - used - 1 };
  } catch (err) {
    console.error("rate limit error, allowing:", err);
    return { ok: true, remaining: opts.max };
  }
}
