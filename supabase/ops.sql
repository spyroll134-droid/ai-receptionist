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

-- Record a hit and return the caller's total in the window, atomically.
-- A read-then-insert from the API route races: N concurrent requests all see
-- the pre-burst count and all pass, making the limit unbounded under a
-- scripted burst. The advisory lock serializes concurrent hits on the same
-- (bucket, identifier) so each one counts the previous ones.
create or replace function rate_limit_hit(
  p_bucket text,
  p_identifier text,
  p_window_minutes int
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_identifier));
  insert into rate_limits (bucket, identifier) values (p_bucket, p_identifier);
  select count(*) into n
    from rate_limits
   where bucket = p_bucket
     and identifier = p_identifier
     and created_at > now() - make_interval(mins => p_window_minutes);
  return n;
end;
$$;

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
