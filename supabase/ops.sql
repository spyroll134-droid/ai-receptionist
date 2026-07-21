-- Rate limiting + admin access. Run after schema.sql, auth.sql, client-agent.sql.
-- Safe to re-run (idempotent).

-- ---------------------------------------------------------------------------
-- 1. Rate limiting
-- ---------------------------------------------------------------------------
-- One row per request against a throttled endpoint. Postgres rather than Redis
-- on purpose: serverless functions scale to many instances, so in-memory
-- counters would let through N times the configured limit.

create table if not exists rate_limits (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  bucket text not null,      -- which endpoint, e.g. 'trial-signup'
  identifier text not null   -- client IP
);

-- The lookup is always (bucket, identifier, recent) — index accordingly.
create index if not exists rate_limits_lookup_idx
  on rate_limits (bucket, identifier, created_at desc);

alter table rate_limits enable row level security;
-- No policies: only the service role (API routes) touches this. RLS on with
-- zero policies means clients get nothing, which is what we want.

-- ---------------------------------------------------------------------------
-- 2. Admin access
-- ---------------------------------------------------------------------------
-- The ops dashboard was gated by ?key=<secret> in the URL — the same weakness
-- the client portals had, where the credential lands in browser history and
-- Vercel's access logs in plaintext. Admins are now real auth users.

create table if not exists admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text
);

alter table admins enable row level security;

drop policy if exists "own admin row" on admins;
create policy "own admin row" on admins
  for select using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Housekeeping
-- ---------------------------------------------------------------------------
-- rate_limits grows forever otherwise. Called by the nightly health cron.
create or replace function prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where created_at < now() - interval '2 days';
$$;
