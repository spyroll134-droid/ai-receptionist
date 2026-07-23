-- Lead lifecycle: turn the call log into a CRM.
-- Run in the Supabase SQL editor AFTER schema.sql, auth.sql, client-agent.sql.
-- Safe to re-run (idempotent).
--
-- Context: until now a captured lead had exactly one bit of state — booked or
-- not — frozen by the end-of-call webhook. The contractor could not mark a
-- lead contacted / won / lost, so there was no way to see which estimate leads
-- still needed chasing. That gap is the month-4 churn engine: the calls kept
-- coming and nothing helped the owner work them. This adds a disposition the
-- owner can move, seeded automatically from what the AI already knew at
-- call-end, and advanced automatically when the owner taps Call back / Text.
--
-- What is NOT automated, on purpose: won / lost. No system knows whether a
-- quote turned into a paid job — the money changes hands offline. Auto-marking
-- it would put invented revenue on the dashboard, the same failure mode the
-- webhook's `booked` fix just removed. Those two are always a human tap.

-- ---------------------------------------------------------------------------
-- 1. Disposition column + the states it may hold
-- ---------------------------------------------------------------------------

-- text + a check constraint rather than a Postgres enum: enums can't drop a
-- value and need ALTER TYPE ceremony to add one, and this set will grow
-- (per-trade stages later). A check is one editable line.
alter table calls add column if not exists lead_status text not null default 'new';

-- When a human (or the tap-to-contact shortcut) last moved this lead. Null
-- means untouched since intake — the signal the follow-up queue sorts on and
-- the reason an auto-seeded 'scheduled' lead is not treated as "worked".
alter table calls add column if not exists dispositioned_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calls_lead_status_chk'
  ) then
    alter table calls add constraint calls_lead_status_chk
      check (lead_status in ('new', 'contacted', 'scheduled', 'won', 'lost'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Seed the initial status from intake — automatically, on insert only
-- ---------------------------------------------------------------------------
--
-- The AI already knows the answer at call-end, so the owner should never have
-- to set the opening state by hand:
--   arrival window booked           -> scheduled  (it's on the calendar)
--   emergency, transferred live     -> contacted  (the owner already spoke to them)
--   everything else                 -> new        (an unworked lead)
--
-- BEFORE INSERT, never on update: the webhook upserts on vapi_call_id conflict
-- and Vapi retries on a 500, so the same call can arrive twice. This trigger
-- fires only for the INSERT attempt; on a re-delivery the ON CONFLICT DO UPDATE
-- path runs instead and — because the webhook does not send lead_status — the
-- column is left untouched. A disposition the owner set by hand therefore
-- survives a redelivered webhook. The `= 'new'` guard also lets a future
-- explicit insert opt out.
create or replace function set_initial_lead_status()
returns trigger
language plpgsql
as $$
begin
  if new.lead_status = 'new' then
    if coalesce(btrim(new.arrival_window), '') <> '' then
      new.lead_status := 'scheduled';
    elsif new.emergency and new.transferred_to_owner then
      new.lead_status := 'contacted';
    else
      new.lead_status := 'new';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_initial_lead_status on calls;
create trigger trg_set_initial_lead_status
  before insert on calls
  for each row execute function set_initial_lead_status();

-- Backfill rows that predate this migration. Guarded to lead_status = 'new'
-- AND dispositioned_at is null so re-running never overwrites a status the
-- owner has since set by hand.
update calls
   set lead_status = case
     when coalesce(btrim(arrival_window), '') <> '' then 'scheduled'
     when emergency and transferred_to_owner then 'contacted'
     else 'new'
   end
 where lead_status = 'new' and dispositioned_at is null;

-- ---------------------------------------------------------------------------
-- 3. Client write paths (RLS-scoped, mirroring set_avg_ticket / set_voicemail)
-- ---------------------------------------------------------------------------

-- The owner sets a disposition from the portal. security definer + the
-- current_client_id() scope means the write can only ever touch the signed-in
-- client's own calls — a signed-out request, or a call id belonging to another
-- tenant, updates zero rows and raises. "own calls" RLS is SELECT-only; this
-- is the single, narrow write clients get on the table.
create or replace function set_lead_status(p_call_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('new', 'contacted', 'scheduled', 'won', 'lost') then
    raise exception 'invalid lead status';
  end if;

  update calls
     set lead_status = p_status,
         dispositioned_at = now()
   where id = p_call_id
     and client_id = current_client_id();

  if not found then
    raise exception 'call not found for this client';
  end if;
end;
$$;

-- Log a follow-up touch: fired when the owner taps Call back or Text on a
-- lead. A `new` lead advances to `contacted`; a `contacted` lead just resets
-- its follow-up clock (dispositioned_at) so the "due for a nudge" flag clears
-- the instant the owner actually chases someone. won / lost / scheduled are
-- left alone — the WHERE excludes them — so a tap on a closed lead is a
-- harmless no-op. This self-clearing behaviour is what lets the assisted-nudge
-- queue work with no separate "last nudged" column: last touch IS the clock.
drop function if exists mark_contacted_if_new(uuid);
create or replace function mark_followed_up(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update calls
     set lead_status = case
           when lead_status = 'new' then 'contacted'
           else lead_status
         end,
         dispositioned_at = now()
   where id = p_call_id
     and client_id = current_client_id()
     and lead_status in ('new', 'contacted');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Outbound follow-up opt-in (scaffold — the sender is a later change)
-- ---------------------------------------------------------------------------
--
-- Off by default and per-client: an automated text/call to a lead that has sat
-- 'new' for N days spends ~$0.10 of Vapi per call and puts an AI in front of
-- the client's OWN customer unprompted, so it is never on without the owner
-- turning it on. The column lands now so the setting and the queue can be built
-- against it; the cron that reads it and sends is a separate change.
alter table clients
  add column if not exists follow_up_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------
-- select lead_status, count(*) from calls group by 1 order by 2 desc;
-- select proname from pg_proc where proname in
--   ('set_lead_status', 'mark_followed_up', 'set_initial_lead_status');
-- mark_contacted_if_new should be gone (replaced by mark_followed_up):
-- select proname from pg_proc where proname = 'mark_contacted_if_new';  -- 0 rows
