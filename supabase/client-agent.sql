-- Per-client agent configuration + call cost tracking.
-- Run in the Supabase SQL editor AFTER schema.sql and auth.sql.
-- Safe to re-run (idempotent).
--
-- Context: the intake agent used to be a single hand-built assistant with the
-- business name and transfer number baked in. To serve more than one client,
-- those values move into the database and get injected per call by
-- /api/vapi/assistant-request. Adding a client becomes a row insert instead of
-- cloning an assistant in the Vapi dashboard.

-- ---------------------------------------------------------------------------
-- 1. Per-client agent config
-- ---------------------------------------------------------------------------

-- What the AI says out loud. Often differs from the legal entity name —
-- "Precision Restoration", not "Precision Restoration Services LLC".
alter table clients add column if not exists greeting_name text;

-- Lets the agent politely decline callers outside the service area instead of
-- booking a job the client can't take.
alter table clients add column if not exists service_area text;

-- Where a live emergency warm-transfers. Was hardcoded to The Backup Line's
-- owner cell in lib/vapi-config.ts; every client needs their own.
alter table clients add column if not exists emergency_transfer_number text;

-- Free-text appended to the system prompt for client-specific quirks
-- ("we don't do mold remediation", "ask if it's a rental or owner-occupied").
alter table clients add column if not exists agent_notes text;

-- Backfill greeting_name from name so no existing client has a null greeting.
update clients set greeting_name = name where greeting_name is null;

-- The webhook attributes calls by this; make the lookup indexed since it runs
-- on every completed call, and now also on every assistant-request (which has
-- a hard 7.5s budget).
create index if not exists clients_vapi_phone_number_id_idx
  on clients (vapi_phone_number_id);

-- ---------------------------------------------------------------------------
-- 2. Cost tracking
-- ---------------------------------------------------------------------------

-- Vapi returns a per-call cost. Without storing it there's no way to see
-- margin per client as volume grows — measured at ~$0.099/min for a realistic
-- intake call, against $297/mo revenue.
alter table calls add column if not exists cost_usd numeric(10, 4);

-- Why the call ended, straight from Vapi's endedReason (silence-timed-out,
-- customer-ended-call, assistant-ended-call, …). Lets the dashboards exclude
-- pocket-dials and dead-air calls from client-facing stats.
alter table calls add column if not exists ended_reason text;

-- The caller's REAL number from telephony caller ID, as distinct from
-- callback_number, which is whatever the assistant heard and transcribed. A
-- panicking caller reciting digits over running water produced
-- "2488888888888" on a live test — the network knew the actual number the
-- whole time. Both are kept: the caller may deliberately give a different
-- callback number than the line they're calling from.
alter table calls add column if not exists caller_id text;

-- The message a non-customer asked to have passed along. The agent has been
-- extracting this into analysis.structuredData and putting it in the owner
-- email, but it was never persisted — so the portal showed a call from a
-- supplier with no indication of what they wanted. Also the signal used to
-- suggest routing a number to voicemail.
alter table calls add column if not exists message_for_owner text;

-- Caller-name (CNAM) lookup results, filled in by the end-of-call webhook.
-- Business lines carry a real name ("BEAUMONT HOSP"); mobile coverage is poor
-- and often returns nothing, which is exactly why these are displayed as
-- context and never used to route a call automatically. See lib/cnam.ts.
alter table calls add column if not exists caller_cnam text;
alter table calls add column if not exists caller_line_type text;

-- ---------------------------------------------------------------------------
-- 3. Voicemail-only numbers
-- ---------------------------------------------------------------------------

-- Numbers that reach a plain voicemail greeting instead of the intake agent.
-- Most clients run their business off a personal cell, so the same line takes
-- their doctor, their kid's school, and their wife. Those callers shouldn't be
-- asked about standing water — but they must NOT be blocked either: the call
-- is still answered, still recorded, still emailed. Only the greeting changes.
--
-- Stored as the last 10 digits, normalized, so "+1 (248) 402-3630", "248-402-
-- 3630" and "2484023630" all match the same entry.
alter table clients
  add column if not exists voicemail_numbers text[] not null default '{}';

-- Clients manage this themselves from the portal, one call at a time, so no
-- one has to hand over a list of family phone numbers during onboarding.
-- security definer + current_client_id() keeps the write scoped to their own
-- row, matching set_avg_ticket.
create or replace function set_voicemail_number(p_number text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
begin
  n := right(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), 10);
  if length(n) <> 10 then
    raise exception 'need a 10-digit number';
  end if;

  if p_enabled then
    -- array_append would happily store duplicates on a double-click.
    update clients
       set voicemail_numbers = (
             select array_agg(distinct x)
               from unnest(voicemail_numbers || n) as x
           )
     where id = current_client_id();
  else
    update clients
       set voicemail_numbers = array_remove(voicemail_numbers, n)
     where id = current_client_id();
  end if;
end;
$$;

-- The same control from the ops dashboard, where the operator is an admin
-- rather than the client. current_client_id() is null for an admin — they have
-- no client_users row — so the client-facing function above would silently
-- update zero rows there. This one takes the client explicitly and gates on
-- the admins table instead. Kept as a separate function on purpose: adding an
-- optional client_id to the client-facing one would mean a bug there could let
-- a client write to another client's row.
create or replace function set_voicemail_number_admin(
  p_client_id uuid,
  p_number text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
begin
  if not exists (select 1 from admins where auth_user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  n := right(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), 10);
  if length(n) <> 10 then
    raise exception 'need a 10-digit number';
  end if;

  if p_enabled then
    update clients
       set voicemail_numbers = (
             select array_agg(distinct x)
               from unnest(voicemail_numbers || n) as x
           )
     where id = p_client_id;
  else
    update clients
       set voicemail_numbers = array_remove(voicemail_numbers, n)
     where id = p_client_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Emergency voice alert preferences
-- ---------------------------------------------------------------------------

-- The E.164 number of the AI line this client's customers call. Used as the
-- caller ID on the outbound emergency alert, so the ring shows up on the
-- owner's phone as THEIR business line — a number they recognize and have
-- saved — not The Backup Line's shared number. Must be a number the Telnyx
-- account owns or Telnyx rejects the call (lib/telnyx-voice falls back to the
-- default From when that happens, so a bad value degrades, not silences).
alter table clients add column if not exists assigned_number text;

-- How many times the emergency alert redials after an unanswered ring —
-- the portal lets the owner pick 1 or 2 (total rings = this + 1). Default 2
-- matches the behavior shipped before the setting existed (3 rings total).
alter table clients add column if not exists alert_retries integer
  not null default 2;
alter table clients drop constraint if exists clients_alert_retries_check;
alter table clients add constraint clients_alert_retries_check
  check (alert_retries in (1, 2));

-- Portal write, mirroring set_avg_ticket: security definer +
-- current_client_id() scopes the update to the signed-in client's own row.
create or replace function set_alert_retries(p_retries integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_retries is null or p_retries not in (1, 2) then
    raise exception 'alert retries must be 1 or 2';
  end if;
  update clients
     set alert_retries = p_retries
   where id = current_client_id();
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_name = 'clients' order by ordinal_position;
-- select column_name from information_schema.columns
--   where table_name = 'calls' and column_name = 'cost_usd';
