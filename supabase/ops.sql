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

-- Lock it to the service role. Same reasoning as prune_rate_limits() below,
-- but a sharper attack, because BOTH arguments are caller-supplied.
--
-- Exposed to `anon` (the PostgREST default for a function PUBLIC can execute)
-- this is a remote lockout primitive, not just a nuisance. Anyone could POST
-- to /rest/v1/rpc/rate_limit_hit with p_bucket='sign-in' and p_identifier set
-- to a paying client's IP, eleven times, and that client can no longer sign in
-- to their own portal for an hour — with no failed-login trail anywhere,
-- because no login was ever attempted. The same trick against 'trial-signup'
-- blocks a prospect from converting.
--
-- It is also an unauthenticated INSERT loop into rate_limits: rows are only
-- pruned after two days, so the table is writable storage for anyone who finds
-- the endpoint.
--
-- Safe to revoke because every caller goes through lib/rate-limit.ts, which
-- uses the service-role client (lib/supabase.ts). No anon or authenticated
-- session ever calls this legitimately. RLS on the table does not help here —
-- security definer runs as the owner and bypasses it, which is the whole point
-- of the function.
revoke execute on function rate_limit_hit(text, text, int) from public;
revoke execute on function rate_limit_hit(text, text, int) from anon;
revoke execute on function rate_limit_hit(text, text, int) from authenticated;
grant execute on function rate_limit_hit(text, text, int) to service_role;

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

-- Lock it to the service role.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and PostgREST
-- exposes anything the `anon` role can execute as an RPC — so this was callable
-- unauthenticated at /rest/v1/rpc/prune_rate_limits. It is security definer,
-- so it ran regardless of RLS. Truncating this table is not destructive to
-- customer data, but it silently resets the ONLY rate limit in the system
-- (/api/trial-signup), which is exactly what someone would call it for.
--
-- Deliberately a grant change rather than an `admins` check inside the body:
-- the sole legitimate caller is the nightly health cron going through the
-- service-role client, where auth.uid() is null — an admins check would reject
-- the one caller that is supposed to work and let nothing else through either.
revoke execute on function prune_rate_limits() from public;
revoke execute on function prune_rate_limits() from anon;
revoke execute on function prune_rate_limits() from authenticated;
grant execute on function prune_rate_limits() to service_role;
