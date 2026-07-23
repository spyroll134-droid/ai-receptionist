import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/notify";
import { site } from "@/lib/site-config";
import { owner } from "@/lib/owner-config";
import { verifyCronSecret } from "@/lib/cron-auth";

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
  // endpoint is a public trigger for sending yourself email — and a public
  // read of every client name and call count below. Fails closed (lib/cron-auth).
  if (!verifyCronSecret(req)) {
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
  //
  // Parse the expected host OUTSIDE the try below: if deployedUrl is ever
  // malformed, new URL() throwing inside the check would report a generic
  // failure instead of the actual misconfiguration — the monitor built to
  // catch a bad deployedUrl would be disabled by the bad deployedUrl.
  let expectedHost: string;
  try {
    expectedHost = new URL(site.deployedUrl).host;
  } catch {
    expectedHost = site.deployedUrl.replace(/^https?:\/\//, "").split("/")[0];
    checks.push({
      name: "Site config",
      ok: false,
      detail: `site.deployedUrl is not a valid URL: ${site.deployedUrl}`,
    });
  }
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
        (n) => !n.assistantId && !n.server?.url?.includes(expectedHost)
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

  // 5. Is a paying client silently getting no calls at all?
  //    Every check above tests our own plumbing, but the likeliest real-world
  //    failure is on the client's side: forwarding never got set, got reset by
  //    a carrier, or was switched off after a family member picked up a
  //    telemarketer. From here it looks identical to a quiet week — the client
  //    keeps paying and hears nothing until they churn. Seven days of total
  //    silence on a live client is worth a phone call to check.
  //
  //    Only clients onboarded more than 7 days ago count: a brand-new client
  //    with no calls yet is expected, not broken.
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, created_at")
      .lt("created_at", weekAgo);
    if (error) throw new Error(error.message);

    // One query for every client's week, not one query per client. The loop
    // this replaced issued a round trip per established client, so the check
    // that exists to catch a silent outage got slower and more likely to hit
    // the function timeout exactly as the client list grew — failing first at
    // the scale where it matters most.
    const { data: recent, error: recentErr } = await supabase
      .from("calls")
      .select("client_id")
      .gte("created_at", weekAgo);
    if (recentErr) throw new Error(recentErr.message);

    const active = new Set((recent ?? []).map((r) => r.client_id));
    const silent = (clients ?? [])
      .filter((c) => !active.has(c.id))
      .map((c) => c.name);
    checks.push({
      name: "Client call flow",
      ok: silent.length === 0,
      detail:
        silent.length > 0
          ? `no calls in 7 days — check their forwarding: ${silent.join(", ")}`
          : (clients?.length ?? 0) === 0
            ? "no clients onboarded more than 7 days ago yet"
            : `${clients!.length} established client(s) receiving calls`,
    });
  } catch (err) {
    checks.push({ name: "Client call flow", ok: false, detail: String(err) });
  }

  // 6. Did an emergency in the last 24h never reach a human and never become
  //    a job? This is the only check about the *product* rather than the
  //    plumbing, and it is the one that ends a contract.
  //
  //    Every check above can pass while this fails: the call connected, the
  //    webhook fired, the email sent — and the transfer rang out, the owner
  //    was on a roof, and a flooded basement went to a competitor. The
  //    dashboard already surfaces this as "Needs follow-up", but a dashboard
  //    only works when someone opens it, and the hours after an emergency
  //    call are exactly when nobody is opening a dashboard.
  //
  //    Deliberately not keyed off owner_notified_at: the email going out is us
  //    doing our job, not the contractor doing theirs.
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("caller_name, callback_number, created_at")
      .gte("created_at", since)
      .eq("emergency", true)
      .eq("transferred_to_owner", false)
      .eq("booked", false);
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    checks.push({
      name: "Emergencies handled",
      ok: n === 0,
      detail:
        n === 0
          ? "every emergency in the last 24h reached someone or became a job"
          : `${n} emergency call(s) with no transfer and no booking: ${data!
              .map((c) => c.caller_name || c.callback_number || "unknown caller")
              .join(", ")}`,
    });
  } catch (err) {
    checks.push({ name: "Emergencies handled", ok: false, detail: String(err) });
  }

  // 7. Has a client's volume collapsed without going all the way to zero?
  //
  //    Check 5 only fires on total silence, which is the easy case. Partial
  //    failures are both more common and harder to see: forwarding set on the
  //    main line but not the rollover, one of two numbers ported away, an
  //    office manager who started answering during the day again. The client
  //    still gets calls, so nothing looks broken, and they quietly conclude
  //    the service isn't doing much.
  //
  //    Compares the last 7 days against the average of the 3 weeks before it.
  //    Needs a real baseline to fire — at least 6 calls a week historically —
  //    because a client averaging 2 calls a week will trip any percentage
  //    threshold on noise alone, and an alert that cries wolf gets muted.
  try {
    const weekAgoMs = Date.now() - 7 * 86400_000;
    const baselineStartMs = Date.now() - 28 * 86400_000;
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, created_at")
      .lt("created_at", new Date(baselineStartMs).toISOString());
    if (error) throw new Error(error.message);

    const { data: rows, error: rowsErr } = await supabase
      .from("calls")
      .select("client_id, created_at")
      .gte("created_at", new Date(baselineStartMs).toISOString());
    if (rowsErr) throw new Error(rowsErr.message);

    const dropped: string[] = [];
    for (const c of clients ?? []) {
      const mine = (rows ?? []).filter((r) => r.client_id === c.id);
      const thisWeek = mine.filter(
        (r) => new Date(r.created_at).getTime() >= weekAgoMs
      ).length;
      // The 21 days before last week, expressed as a per-week rate.
      const baseline =
        mine.filter((r) => new Date(r.created_at).getTime() < weekAgoMs).length /
        3;
      if (baseline < 6) continue;
      if (thisWeek < baseline * 0.5) {
        dropped.push(
          `${c.name} (${thisWeek} this week vs ${baseline.toFixed(1)}/wk)`
        );
      }
    }
    checks.push({
      name: "Client call volume",
      ok: dropped.length === 0,
      detail:
        dropped.length > 0
          ? `volume more than halved — check forwarding on every line: ${dropped.join(", ")}`
          : "no client's volume has collapsed against its own baseline",
    });
  } catch (err) {
    checks.push({ name: "Client call volume", ok: false, detail: String(err) });
  }

  // 8. Did a call arrive that no client row claimed?
  //
  //    The webhook attributes a call by matching Vapi's phoneNumberId against
  //    clients.vapi_phone_number_id, and there is no fallback — an unmatched
  //    call is saved with client_id = null rather than guessed at, because the
  //    old guess (oldest client) meant showing one contractor another
  //    contractor's leads. Null is the safe outcome, but only if someone
  //    notices: an unassigned call is invisible in every client portal, so the
  //    contractor whose number it actually was sees nothing and assumes the
  //    quiet week is real.
  //
  //    Normal causes are all configuration: a number provisioned outside
  //    scripts/onboard-client.ts, a number re-pointed in the Vapi dashboard, a
  //    client row deleted while its number kept answering. Fixing it is a
  //    one-column update, but the window between the misconfiguration and the
  //    fix is a window where a paying client's leads land nowhere.
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("vapi_call_id, caller_name, callback_number")
      .gte("created_at", since)
      .is("client_id", null);
    if (error) throw new Error(error.message);
    const n = data?.length ?? 0;
    checks.push({
      name: "Call attribution",
      ok: n === 0,
      detail:
        n === 0
          ? "every call in the last 24h was attributed to a client"
          : `${n} call(s) matched no client — check vapi_phone_number_id: ${data!
              .map((c) => c.caller_name || c.callback_number || c.vapi_call_id)
              .join(", ")}`,
    });
  } catch (err) {
    checks.push({ name: "Call attribution", ok: false, detail: String(err) });
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
      to: owner.email,
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
