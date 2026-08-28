-- Two audit_logs improvements:
--
-- 1. Add a `success` column so failed actions can be logged and
--    distinguished from successful ones, not just successes as before.
--    Defaults to true so all existing rows remain valid.
--
-- 2. Close a real gap in the INSERT policy: previously ANY authenticated
--    user could insert a row claiming to be ANY other user (user_id/
--    user_name were never checked against who was actually calling it),
--    meaning a malicious or compromised client could forge a log entry
--    attributing an action to someone else. Now a client can only ever
--    insert a row for themselves.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "audit_logs_authenticated_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_authenticated_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
