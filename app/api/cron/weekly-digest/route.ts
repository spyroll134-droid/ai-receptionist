import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { escapeHtml, sendEmail } from "@/lib/notify";
import { avgTicketFor, site } from "@/lib/site-config";
import { owner } from "@/lib/owner-config";
import { verifyCronSecret } from "@/lib/cron-auth";

// Weekly per-client digest, Monday morning.
//
// The retention problem with this product is that it works invisibly. The
// client sees a lead email now and then and slowly forgets what it's for —
// the same reason people cancel insurance. Once a week they should see the
// number of calls their own team didn't pick up, in their own inbox, without
// logging into anything.
//
// Unlike the health check this DOES send when everything is fine — that's the
// point. But it never sends to a client with zero calls that week: "we caught
// nothing for you" is an invoice with no argument behind it, and the health
// check already flags a silent client to Jordan as a probable forwarding
// failure worth a personal call instead.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirrors components/dash.tsx isDeadAir: a silence-timed-out call with no
// caller detail never became a conversation. Counting pocket dials as caught
// leads is the fastest way to make the whole digest untrustworthy.
function isDeadAir(c: {
  ended_reason: string | null;
  caller_name: string | null;
  callback_number: string | null;
}) {
  return (
    c.ended_reason === "silence-timed-out" && !c.caller_name && !c.callback_number
  );
}

function money(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

export async function GET(req: NextRequest) {
  // Fails closed (lib/cron-auth) — this route emails every client, so an open
  // endpoint is a way to spam your own customers from your verified domain.
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, trade, owner_email, avg_ticket_dollars");
  if (error) {
    console.error("[weekly-digest] client query failed:", error.message);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const results: { client: string; sent: boolean; calls: number }[] = [];

  for (const c of clients ?? []) {
    const { data: rows } = await supabase
      .from("calls")
      .select(
        "emergency, booked, transferred_to_owner, ended_reason, caller_name, callback_number, created_at"
      )
      .eq("client_id", c.id)
      .gte("created_at", since);

    const calls = (rows ?? []).filter((r) => !isDeadAir(r));
    if (calls.length === 0 || !c.owner_email) {
      results.push({ client: c.name, sent: false, calls: calls.length });
      continue;
    }

    const emergencies = calls.filter((r) => r.emergency).length;
    const booked = calls.filter((r) => r.booked).length;
    const transferred = calls.filter((r) => r.transferred_to_owner).length;
    const afterHours = calls.filter((r) => {
      const h = Number(
        new Date(r.created_at).toLocaleString("en-US", {
          timeZone: "America/Detroit",
          hour: "numeric",
          hour12: false,
        })
      );
      return h < 8 || h >= 18;
    }).length;
    const protectedRevenue =
      booked * avgTicketFor(c.trade, c.avg_ticket_dollars);

    const portalUrl = `${site.deployedUrl}/portal`;
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

    const sent = await sendEmail({
      to: c.owner_email,
      replyTo: owner.email,
      subject: `${plural(calls.length, "call")} caught last week — ${c.name}`,
      text: [
        `Here's what your answering line caught for ${c.name} in the last seven days.`,
        "",
        `Calls answered      ${calls.length}`,
        `After hours         ${afterHours}`,
        `Emergencies         ${emergencies}`,
        `Transferred to you  ${transferred}`,
        `Jobs booked         ${booked}`,
        `Est. value booked   ${money(protectedRevenue)}`,
        "",
        `Every call, with the recording and transcript: ${portalUrl}`,
        "",
        "— Jordan",
        site.businessName,
      ].join("\n"),
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="font-size:20px;font-weight:700">${plural(calls.length, "call")} caught last week</div>
  <div style="color:#666;margin-top:2px;font-size:14px">${escapeHtml(c.name)} · last seven days</div>

  <table style="width:100%;margin-top:22px;border-collapse:collapse;font-size:15px">
    ${[
      ["Calls answered", String(calls.length)],
      ["After hours", String(afterHours)],
      ["Emergencies", String(emergencies)],
      ["Transferred to you", String(transferred)],
      ["Jobs booked", String(booked)],
      ["Est. value of jobs booked", money(protectedRevenue)],
    ]
      .map(
        ([k, v]) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#555">${k}</td><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">${v}</td></tr>`
      )
      .join("")}
  </table>

  <a href="${portalUrl}" style="display:inline-block;margin-top:26px;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">See every call &rarr;</a>

  <div style="margin-top:28px;border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#888">
    Est. value of jobs booked is booked jobs times your average job value — an
    estimate, not a tally of jobs that closed. Reply to this email to change
    your average, or anything else about how the line answers.
  </div>
</div>`.trim(),
    });

    results.push({ client: c.name, sent, calls: calls.length });
  }

  return NextResponse.json({ ok: true, results });
}
