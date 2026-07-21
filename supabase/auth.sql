-- Client authentication + row-level security.
-- Run in the Supabase SQL editor AFTER schema.sql. Safe to re-run (idempotent).
--
-- Model: each client business has one or more login accounts. Supabase Auth
-- owns credentials (auth.users); we only store the link. A logged-in user can
-- read their own client row and that client's calls — nothing else. The Vapi
-- webhook keeps using the service-role key, which bypasses RLS by design.
--
-- This replaces the access_key-in-the-URL scheme as the security boundary.
-- access_key is kept for now so existing portal links don't break during
-- migration, but it is NO LONGER sufficient on its own once policies are on.

-- ---------------------------------------------------------------------------
-- 1. Link auth users to clients
-- ---------------------------------------------------------------------------

create table if not exists client_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- One auth account maps to exactly one client. A separate table (rather than
  -- a column on clients) so a business can later have several logins — an
  -- owner plus an office manager — without schema churn.
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  role text not null default 'owner',
  unique (auth_user_id)
);

create index if not exists client_users_client_id_idx on client_users(client_id);

alter table client_users enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Helper: which client does the current request belong to?
--    SECURITY DEFINER so the policy can read client_users without recursing
--    into client_users' own RLS policy.
-- ---------------------------------------------------------------------------

create or replace function current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from client_users where auth_user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Policies
--    Postgres has no "create policy if not exists", so drop-then-create keeps
--    this file re-runnable.
-- ---------------------------------------------------------------------------

drop policy if exists "own membership row" on client_users;
create policy "own membership row" on client_users
  for select using (auth_user_id = auth.uid());

drop policy if exists "own client row" on clients;
create policy "own client row" on clients
  for select using (id = current_client_id());

drop policy if exists "own calls" on calls;
create policy "own calls" on calls
  for select using (client_id = current_client_id());

-- trial_signups stays closed to end users: the public form writes via the
-- service role, and nobody should be able to read the lead list.
drop policy if exists "no client access" on trial_signups;

-- ---------------------------------------------------------------------------
-- 4. Verification — after running, this should return one row per policy.
--    calls + clients + client_users = 3 policies expected.
-- ---------------------------------------------------------------------------
-- select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename;
