-- Two real RLS gaps found while auditing every policy against pg_policies:
--
-- 1) messages: the "messages_insert" policy only checked
--    `auth.uid() IS NOT NULL` — meaning ANY logged-in user (including a
--    read-only adminView account) could insert a message row and set
--    from_user_id to any value at all, forging a message from someone
--    else. The two other insert paths already do this correctly
--    (messages_admin covers admin/registrar, messages_teacher_insert
--    already requires from_user_id = auth.uid()), so this policy is both
--    redundant and the one actually causing the hole — just drop it.
--
-- 2) users_archive: a policy named "admin view users_archive" (created
--    outside of any tracked migration — almost certainly added directly
--    via the Supabase dashboard's visual policy editor at some point)
--    separately grants adminView read access to this table. Since
--    Postgres OR's multiple permissive policies together, this silently
--    undermined the admin-only restriction added in
--    fix-archive-admin-only.sql. Drop it so admin-only actually holds.
--
-- Run manually in the Supabase SQL editor against the live project.

DROP POLICY IF EXISTS "messages_insert" ON public.messages;

DROP POLICY IF EXISTS "admin view users_archive" ON public.users_archive;

-- Verify — should show only messages_admin / messages_teacher_insert for
-- messages INSERT, and no adminView-granting policy left on users_archive.
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE (tablename = 'messages' AND cmd = 'INSERT')
   OR tablename = 'users_archive'
ORDER BY tablename, policyname;
