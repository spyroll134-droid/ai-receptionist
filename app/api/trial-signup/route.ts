import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { notifyTrialSignup } from "@/lib/notify";
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

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("trial_signups").insert({
      company_name: companyName,
      contact_name: contactName,
      phone,
      email: email || null,
      trade: trade || null,
      source: "landing_page",
    });
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
  notifyTrialSignup({ companyName, contactName, phone, email, trade }).catch(
    (err) => console.error("Trial signup notification failed:", err)
  );

  return NextResponse.json({ ok: true });
}
