import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { confirmTrialSignup, notifyTrialSignup } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Public unauthenticated write — throttle before touching the database.
  const limited = await rateLimit(req, { key: "trial-signup", max: 5, windowMinutes: 60 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many signups from this address. Try again shortly." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = String(body.companyName ?? "").trim().slice(0, 200);
  const contactName = String(body.contactName ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const trade = String(body.trade ?? "").trim().slice(0, 60);

  if (!companyName || !contactName || !phone) {
    return NextResponse.json(
      { error: "companyName, contactName, and phone are required" },
      { status: 400 }
    );
  }

  // E-SIGN/UETA wants an affirmative act we can later evidence. The form
  // can't submit without the box, so a request missing it didn't come from
  // the form.
  if (!body.tosAccepted) {
    return NextResponse.json(
      { error: "Terms must be accepted" },
      { status: 400 }
    );
  }
  const assentIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  try {
    const supabase = getSupabaseServerClient();
    const row = {
      company_name: companyName,
      contact_name: contactName,
      phone,
      email: email || null,
      trade: trade || null,
      source: "landing_page",
      tos_accepted_at: new Date().toISOString(),
      tos_accept_ip: assentIp,
    };
    let { error } = await supabase.from("trial_signups").insert(row);
    if (error && /tos_accept/.test(error.message)) {
      // Migration not run yet (signups.sql). A lead lost over a missing
      // audit column is the exact failure this product sells against —
      // save the lead, log the gap loudly.
      console.error("tos columns missing — run supabase/signups.sql:", error.message);
      const { tos_accepted_at, tos_accept_ip, ...legacy } = row;
      void tos_accepted_at;
      void tos_accept_ip;
      ({ error } = await supabase.from("trial_signups").insert(legacy));
    }
    if (error) {
      console.error("Supabase insert failed:", error.message);
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
  } catch (err) {
    console.error("Trial signup error:", err);
    return NextResponse.json(
      { error: "Server not configured yet" },
      { status: 500 }
    );
  }

  // Alert AFTER the row is safely saved, and never let a mail failure turn a
  // captured lead into an error the prospect sees. Speed-to-lead is the whole
  // pitch of this product — a signup sitting unseen in a table is the exact
  // failure we sell against.
  //
  // after() and not a floating promise: on Vercel the function can be frozen
  // the moment the response returns, silently dropping an in-flight Resend
  // call. after() keeps the instance alive until the callback settles.
  after(async () => {
    try {
      await notifyTrialSignup({ companyName, contactName, phone, email, trade });
    } catch (err) {
      console.error("Trial signup notification failed:", err);
    }

    // Confirm to the prospect too — separately, so a failure here can never
    // stop the alert that actually drives revenue. Only when they gave an
    // email; the field is optional and phone is the primary contact.
    if (email) {
      try {
        await confirmTrialSignup({ contactName, companyName, toEmail: email });
      } catch (err) {
        console.error("Trial signup confirmation failed:", err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}
