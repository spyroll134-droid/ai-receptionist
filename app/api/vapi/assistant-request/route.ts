import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { verifyVapiSecret } from "@/lib/vapi-auth";
import { buildAssistant, DEMO_CLIENT, type AgentClient } from "@/lib/vapi-config";

// Multi-tenant assistant resolution.
//
// Each client forwards their published number to their OWN number, which is
// registered in Vapi with `assistantId` blank and `server.url` pointing here.
// On every inbound call Vapi POSTs an `assistant-request` and we return the
// assistant config for whichever client owns that number — so one prompt
// template in lib/vapi-config.ts serves every client, and onboarding is a row
// insert rather than cloning an assistant in the dashboard.
//
// ⚠️ HARD LIMIT: Vapi drops the call if this doesn't respond within 7.5
// seconds, end-to-end, and that timeout is not configurable. Keep this route
// to a single indexed lookup with no heavy imports. clients.vapi_phone_number_id
// is indexed in supabase/client-agent.sql for exactly this reason.

export const dynamic = "force-dynamic";
// Node runtime: the supabase-js client used here isn't edge-friendly, and a
// warm Node lambda comfortably fits the 7.5s budget.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // This endpoint returns each client's emergency transfer number and full
  // system prompt — without auth, anyone who learns a phone-number id can
  // pull a client's personal cell and the entire intake script. Vapi sends
  // the number's server.secret as x-vapi-secret; require it.
  if (!verifyVapiSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { message?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    // Malformed payload — still hand back a working assistant. A dropped call
    // is worse than a generically-greeted one.
    return NextResponse.json({ assistant: buildAssistant(DEMO_CLIENT) });
  }

  const message = body.message ?? {};
  if (message.type && message.type !== "assistant-request") {
    // Vapi points several event types at the same server URL. Acknowledge
    // anything that isn't an assistant-request rather than answering it.
    return NextResponse.json({ ok: true });
  }

  const phoneNumberId =
    (message.phoneNumber as { id?: string } | undefined)?.id ??
    (message.call as { phoneNumberId?: string } | undefined)?.phoneNumberId;

  let client: AgentClient | null = null;

  if (phoneNumberId) {
    try {
      const supabase = getSupabaseServerClient();
      const { data } = await supabase
        .from("clients")
        .select(
          "name, greeting_name, trade, service_area, emergency_transfer_number, agent_notes"
        )
        .eq("vapi_phone_number_id", phoneNumberId)
        .maybeSingle();
      client = data;
    } catch (err) {
      // Never let a database hiccup drop a live call. Log it and fall back.
      console.error("assistant-request client lookup failed:", err);
    }
  }

  if (!client) {
    console.warn(
      `assistant-request: no client for phone number ${phoneNumberId ?? "(none)"} — using demo assistant`
    );
  }

  return NextResponse.json({ assistant: buildAssistant(client ?? DEMO_CLIENT) });
}
