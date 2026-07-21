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

-- Where a live emergency warm-transfers. Was hardcoded to the Trademark Web
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

-- ---------------------------------------------------------------------------
-- 3. Verify
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--   where table_name = 'clients' order by ordinal_position;
-- select column_name from information_schema.columns
--   where table_name = 'calls' and column_name = 'cost_usd';
