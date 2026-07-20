-- Run this once in the Supabase SQL editor for your project.

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

-- Row-Level Security: table is only written to via the server-side API
-- route (service role key), never directly from the browser.
alter table trial_signups enable row level security;
