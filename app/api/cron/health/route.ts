import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/notify";
import { site } from "@/lib/site-config";

// Nightly health check.
//
// Every failure mode in this system is SILENT. A call still connects and sounds
// perfect to the caller while the webhook 500s, Resend rejects the send, or the
// Supabase project has paused — and nobody finds out until someone asks why
// they never heard about a job. The first six real calls sat with
// owner_notified_at = null for hours for exactly this reason.
//
// This route runs the checks a human would forget to run and emails only when
// something is actually wrong. A monitor that emails "all good" every day gets
// filtered within a week and then it isn't a monitor.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Check = { name: string; ok: boolean; detail: string };

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this the
  // endpoint is a public trigger for sending yourself email.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const checks: Check[] = [];
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  // 1. Did any call in the last 24h fail to notify its owner?
  //    This is the check that matters most — it's the actual product promise.
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("vapi_call_id, created_at, caller_name")
      .gte("created_at", since)
      .is("owner_notified_at", null);
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    checks.push({
      name: "Owner notifications",
      ok: n === 0,
      detail:
        n === 0
          ? "every call in the last 24h was notified"
          : `${n} call(s) saved but NOT notified: ${data!.map((c) => c.caller_name || c.vapi_call_id).join(", ")}`,
    });
  } catch (err) {
    checks.push({
      name: "Owner notifications",
      ok: false,
      detail: `could not query calls — ${String(err)}`,
    });
  }

  // 2. Is the database reachable at all? A paused Supabase free-tier project
  //    presents exactly like this.
  try {
    const { error } = await supabase.from("clients").select("id").limit(1);
    checks.push({
      name: "Database",
      ok: !error,
      detail: error ? error.message : "reachable",
    });
  } catch (err) {
    checks.push({ name: "Database", ok: false, detail: String(err) });
  }

  // 3. Is the sending domain still verified? If this drops, every lead email
  //    silently stops — no bounce, no error.
  try {
    const key = process.env.RESEND_API_KEY;
    const domain = process.env.RESEND_EMAIL_DOMAIN;
    if (!key || !domain) {
      checks.push({
        name: "Email domain",
        ok: false,
        detail: "RESEND_API_KEY or RESEND_EMAIL_DOMAIN missing",
      });
    } else {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const j = (await res.json()) as { data?: { name: string; status: string }[] };
      const d = j.data?.find((x) => x.name === domain);
      checks.push({
        name: "Email domain",
        ok: d?.status === "verified",
        detail: d ? `${d.name}: ${d.status}` : `${domain} not found in Resend`,
      });
    }
  } catch (err) {
    checks.push({ name: "Email domain", ok: false, detail: String(err) });
  }

  // 4. Is the Vapi number still pointed at us? A wrong server.url means calls
  //    connect and vanish.
  try {
    const key = process.env.VAPI_API_KEY;
    if (!key) {
      checks.push({ name: "Vapi routing", ok: false, detail: "VAPI_API_KEY missing" });
    } else {
      const res = await fetch("https://api.vapi.ai/phone-number", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const nums = (await res.json()) as {
        number?: string;
        assistantId?: string | null;
        server?: { url?: string };
      }[];
      const live = nums.filter((n) => n.number);
      const bad = live.filter(
        (n) => !n.assistantId && !n.server?.url?.includes(new URL(site.deployedUrl).host)
      );
      checks.push({
        name: "Vapi routing",
        ok: bad.length === 0,
        detail:
          bad.length === 0
            ? `${live.length} number(s) routed correctly`
            : `${bad.length} number(s) point somewhere else`,
      });
    }
  } catch (err) {
    checks.push({ name: "Vapi routing", ok: false, detail: String(err) });
  }

  // Housekeeping — rate_limits grows forever otherwise.
  try {
    await supabase.rpc("prune_rate_limits");
  } catch {
    /* non-critical */
  }

  const failures = checks.filter((c) => !c.ok);

  if (failures.length > 0) {
    await sendEmail({
      to: site.ownerEmail,
      subject: `⚠️ ${site.businessName} health check — ${failures.length} problem${failures.length === 1 ? "" : "s"}`,
      text: [
        "Something is wrong that would otherwise fail silently:",
        "",
        ...failures.map((f) => `  ✗ ${f.name}: ${f.detail}`),
        "",
        "Passing:",
        ...checks.filter((c) => c.ok).map((c) => `  ✓ ${c.name}`),
        "",
        `${site.deployedUrl}/dashboard`,
      ].join("\n"),
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    checked: checks.length,
    checks,
  });
}
