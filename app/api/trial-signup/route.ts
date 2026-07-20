import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = String(body.companyName ?? "").trim();
  const contactName = String(body.contactName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  const trade = String(body.trade ?? "").trim();

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

  return NextResponse.json({ ok: true });
}
