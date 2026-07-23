import { NextResponse } from "next/server";
import {
  getSupabaseSessionClient,
  requireAdmin,
} from "@/lib/supabase-auth";

// Plays back a call recording.
//
// The recording_url stored on the row is a private R2 object — fetching it
// directly returns 400 InvalidArgument, which is why the portal's audio player
// has never worked. The Vapi org has HIPAA mode on, so artifacts are never
// public. The only playable form is a presigned URL that Vapi mints on request
// and expires in about 30 minutes, so it can't be stored on the row; it has to
// be minted per play. This route does that, behind the session.
//
// Redirecting (rather than streaming the bytes through the function) hands
// range requests straight to R2, so scrubbing the player works and we don't
// pay egress for every replay.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const key = process.env.VAPI_API_KEY;
  if (!key) {
    console.error("[recording] VAPI_API_KEY missing");
    return new NextResponse("Recording unavailable", { status: 503 });
  }

  // Read through the user's own session, so the "own calls" RLS policy decides
  // whether this row is theirs. An admin has no client_users row and would be
  // filtered out by RLS, so the ops dashboard falls back to a service-role read
  // only after requireAdmin() passes.
  const supabase = await getSupabaseSessionClient();
  const { data: own } = await supabase
    .from("calls")
    .select("vapi_call_id")
    .eq("id", id)
    .maybeSingle();

  let vapiCallId = own?.vapi_call_id as string | undefined;

  if (!vapiCallId && (await requireAdmin())) {
    const { getSupabaseServerClient } = await import("@/lib/supabase");
    const { data } = await getSupabaseServerClient()
      .from("calls")
      .select("vapi_call_id")
      .eq("id", id)
      .maybeSingle();
    vapiCallId = data?.vapi_call_id as string | undefined;
  }

  if (!vapiCallId) {
    // Same response whether the call doesn't exist or isn't yours — a 403 here
    // would confirm the id belongs to someone.
    return new NextResponse("Not found", { status: 404 });
  }

  let presigned: string | undefined;
  try {
    const res = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[recording] vapi ${res.status} for call ${vapiCallId}`);
      return new NextResponse("Recording unavailable", { status: 502 });
    }
    const call = (await res.json()) as {
      artifact?: { presignedMonoUrl?: string; presignedStereoUrl?: string };
    };
    presigned =
      call.artifact?.presignedMonoUrl ?? call.artifact?.presignedStereoUrl;
  } catch (err) {
    console.error(`[recording] vapi fetch failed for ${vapiCallId}:`, err);
    return new NextResponse("Recording unavailable", { status: 502 });
  }

  if (!presigned) {
    // Recordings appear a beat after the call ends, so this is normal briefly.
    return new NextResponse("Recording not ready yet", { status: 404 });
  }

  // Never cached at the edge: the target expires, and the response is
  // per-user authorized.
  return NextResponse.redirect(presigned, {
    status: 302,
    headers: { "Cache-Control": "no-store, private" },
  });
}
