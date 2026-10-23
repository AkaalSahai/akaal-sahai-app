-- The 9:30pm register auto-submit (add-register-submit-and-cutoff.sql) was
-- scheduled as '30 21 * * *', but pg_cron runs in GMT - so during British
-- Summer Time it actually fired at 22:30 UK time, an hour after the app
-- locks registers at 21:30. Registers nobody submitted were stamped an hour
-- late, and the projector showed them as unsubmitted until then.
--
-- Same behaviour, but driven by UK local time: the job runs every 15 minutes
-- between 20:00 and 21:59 GMT and the function only acts in the 21:30-21:44
-- UK-time window, so it fires once at 21:30 UK time all year round.
--
-- Named stamp_unsubmitted_registers so it doesn't collide with the older,
-- unused auto_submit_registers() from the July setup (that one also marked
-- unmarked students absent) - which is left untouched.
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.stamp_unsubmitted_registers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamp := now() at time zone 'Europe/London';
begin
  if not (v_now::time >= '21:30' and v_now::time < '21:45') then
    return;
  end if;

  update attendance_sessions
  set submitted_at = now()
  where session_date = v_now::date
    and submitted_at is null;
end;
$$;

revoke all on function public.stamp_unsubmitted_registers() from public, anon, authenticated;

select cron.unschedule('auto-submit-registers-2130');

select cron.schedule(
  'auto-submit-registers-uk-2130',
  '*/15 20-21 * * *',
  $$ select public.stamp_unsubmitted_registers(); $$
);
