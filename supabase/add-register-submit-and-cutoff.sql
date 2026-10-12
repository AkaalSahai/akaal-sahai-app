-- Teachers previously had no explicit "done" signal - a register counted as
-- "submitted" the moment a session row existed, even if only one student had
-- been marked. Now there's a real Submit button that stamps submitted_at,
-- and teachers can keep editing/re-submitting until 9:30pm, at which point
-- the register locks for the day regardless.
--
-- Replaces the old redundant 9pm+10pm auto-submit pair (same no-op-once-set
-- UPDATE run twice) with a single job at the new 9:30pm cutoff, so a
-- register nobody explicitly submitted still gets finalized rather than
-- left in limbo.
-- Run in Supabase Dashboard → SQL Editor → New Query

select cron.unschedule('auto-submit-registers-2100');
select cron.unschedule('auto-submit-registers-2200');

select cron.schedule(
  'auto-submit-registers-2130',
  '30 21 * * *',
  $$
    UPDATE attendance_sessions
    SET submitted_at = now()
    WHERE session_date = CURRENT_DATE
      AND submitted_at IS NULL;
  $$
);
