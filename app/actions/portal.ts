"use server";

import { revalidatePath } from "next/cache";
import { getCurrentClient, getSupabaseSessionClient } from "@/lib/supabase-auth";

// Self-service portal settings. Kept separate from auth.ts, which is only
// about signing in and out.

export type AvgTicketState = { ok?: boolean; error?: string } | undefined;

export async function updateAvgTicket(
  _prev: AvgTicketState,
  formData: FormData
): Promise<AvgTicketState> {
  const session = await getCurrentClient();
  if (!session) return { error: "Your session expired — sign in again." };

  // Accept "6,000", "$6000", " 6000 " — owners type dollar amounts, not ints.
  const raw = String(formData.get("avg_ticket") ?? "").replace(/[$,\s]/g, "");
  const dollars = raw === "" ? null : Number(raw);
  if (
    dollars !== null &&
    (!Number.isInteger(dollars) || dollars < 50 || dollars > 1_000_000)
  ) {
    return { error: "Enter a whole dollar amount between $50 and $1,000,000." };
  }

  // set_avg_ticket (supabase/auth.sql) scopes the write to the signed-in
  // user's own client row and is the only write clients have on the table.
  const supabase = await getSupabaseSessionClient();
  const { error } = await supabase.rpc("set_avg_ticket", {
    p_dollars: dollars,
  });
  if (error) return { error: "Couldn't save that — try again." };

  revalidatePath("/portal");
  return { ok: true };
}
