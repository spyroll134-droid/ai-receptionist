-- Trial signup pipeline. Run after schema.sql / auth.sql / client-agent.sql / ops.sql.
-- Safe to re-run (idempotent).
--
-- The form captured a lead and then forgot about it: no status, no record of
-- whether anyone called, and no link from a signup to the client it became.
-- After a dozen signups there'd be no way to tell who had been followed up
-- with — which is a bad look for a business whose pitch is "never miss a lead".

-- new -> contacted -> trialing -> won | lost
alter table trial_signups add column if not exists status text not null default 'new';
alter table trial_signups add column if not exists contacted_at timestamptz;
alter table trial_signups add column if not exists notes text;

-- Closes the loop: when a signup is onboarded, point it at the client row it
-- became. Lets us answer "how many landing-page signups turned into revenue",
-- which is the only way to know whether the form is worth keeping at all.
alter table trial_signups
  add column if not exists client_id uuid references clients(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trial_signups_status_check'
  ) then
    alter table trial_signups add constraint trial_signups_status_check
      check (status in ('new','contacted','trialing','won','lost'));
  end if;
end $$;

-- E-SIGN/MI UETA assent evidence: the signup form's terms checkbox is only
-- worth anything if we can later produce when it was ticked and from where.
alter table trial_signups add column if not exists tos_accepted_at timestamptz;
alter table trial_signups add column if not exists tos_accept_ip text;

-- The ops dashboard lists newest-first and cares about un-actioned leads.
create index if not exists trial_signups_status_idx
  on trial_signups (status, created_at desc);

-- RLS is already enabled with no policies, so clients can't read the lead
-- list. Only the service role (API routes, ops dashboard) touches it. Leave
-- it that way — this table is the sales pipeline, not customer data.

-- Verify:
-- select status, count(*) from trial_signups group by status;
