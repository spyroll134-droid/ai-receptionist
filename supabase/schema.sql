-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists trial_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  contact_name text not null,
  phone text not null,
  email text,
  trade text,
  source text default 'landing_page'
);

alter table trial_signups enable row level security;

-- Calls answered by the Vapi agent, with the structured intake data it
-- extracted during the call. One row per call.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vapi_call_id text unique not null,
  trade text not null default 'Restoration',

  caller_number text,
  caller_name text,
  callback_number text,

  -- Restoration intake fields (trade-specific fields added as JSON until
  -- roofing/plumbing variants exist, to avoid a wide sparse table).
  emergency boolean default false,
  standing_water boolean,
  category text,
  loss_date text,
  insurance_carrier text,
  service_address text,
  intake_extra jsonb default '{}'::jsonb,

  transferred_to_owner boolean default false,
  booked boolean default false,
  arrival_window text,

  transcript text,
  summary text,
  recording_url text,

  owner_notified_at timestamptz,
  owner_notify_method text
);

alter table calls enable row level security;
