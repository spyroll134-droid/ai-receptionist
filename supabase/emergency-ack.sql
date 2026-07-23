-- Emergency acknowledgement. Run in the Supabase SQL editor. Idempotent.
--
-- The webhook already runs the escalation ladder for a live emergency (warm
-- transfer, then a ringing voice alert, then email) and stamps owner_notified_at
-- when any channel goes out. What it can't know is whether a human actually
-- PICKED IT UP. This column closes that gap: the owner taps "I've got this" in
-- the portal and we record when.
--
-- Two reasons it matters. (1) Product: an acknowledged emergency drops out of
-- the red "still waiting on a callback" banner, so that banner only ever shows
-- fires nobody has grabbed. (2) Liability: the service terms lean on the owner
-- monitoring alerts and responding within a stated time — a timestamped
-- acknowledgement is the record that they did, which is exactly what breaks the
-- causation chain if a missed emergency is ever disputed.
alter table calls
  add column if not exists acknowledged_at timestamptz;

-- The owner acknowledges an emergency from the portal. Same security model as
-- set_lead_status: security definer + current_client_id() means the write can
-- only ever touch the signed-in client's own calls. Idempotent — a second tap
-- keeps the FIRST acknowledgement time (coalesce), because the moment they took
-- responsibility is the moment that matters, not the moment they tapped twice.
create or replace function acknowledge_emergency(p_call_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ack timestamptz;
begin
  update calls
     set acknowledged_at = coalesce(acknowledged_at, now())
   where id = p_call_id
     and client_id = current_client_id()
     and emergency = true
   returning acknowledged_at into v_ack;

  if not found then
    raise exception 'emergency call not found for this client';
  end if;

  return v_ack;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_name = 'calls' and column_name = 'acknowledged_at';  -- 1 row
-- select proname from pg_proc where proname = 'acknowledge_emergency'; -- 1 row
