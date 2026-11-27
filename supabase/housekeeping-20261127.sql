-- B9a + B9b (health check 27-11-2026)
--
-- B9a: primary_teacher_label(group_id) returns teacher names and could be
-- called directly by ANY logged-in account (incl. the projector 'dashboard'
-- login). Nothing in the app calls it directly - only get_projector_seva()
-- does, and that runs as its owner (SECURITY DEFINER, owner postgres), so it
-- keeps working after this. Remove direct access for logged-in accounts.
-- (A role check inside the function was NOT used: it would see the
-- projector's dashboard login and blank the seva slide.)
--
-- B9b: cron.job_run_details (timer-job log) grows forever - 791 rows since
-- July. Clear entries older than 30 days now, and add a weekly job that does
-- the same (Sunday 03:00 GMT, outside class times).
--
-- UNDO:
--   grant execute on function public.primary_teacher_label(uuid) to authenticated;
--   select cron.unschedule('purge-cron-history');

begin;

revoke execute on function public.primary_teacher_label(uuid) from authenticated;

-- Preview: rows that will be cleared
select count(*) as old_cron_log_rows from cron.job_run_details
where end_time < now() - interval '30 days';

delete from cron.job_run_details where end_time < now() - interval '30 days';

select cron.schedule(
  'purge-cron-history',
  '0 3 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '30 days'$$
);

-- Expected: authenticated no longer listed; new job present
select proacl::text from pg_proc where proname = 'primary_teacher_label';
select jobname, schedule from cron.job where jobname = 'purge-cron-history';

commit;
