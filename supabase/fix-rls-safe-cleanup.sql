-- Safe cleanup: a handful of policies that are provable, zero-risk subsets of
-- another policy already covering the exact same (or broader) set of users -
-- verified by comparing which role names each one actually checks, not just
-- "looks similar". Several OTHER pairs that looked redundant at a glance
-- turned out NOT to be safe to drop (they check different role combinations -
-- e.g. one checks admin+registrar, its "duplicate" checks admin only) and are
-- deliberately left alone here rather than risk narrowing someone's access.
--
-- (An earlier draft of this file also "fixed" student_notes write policies,
-- based on a wrong assumption carried over from an old, abandoned branch with
-- a different design. The current, live app design has one shared note per
-- student (student_notes.upsert uses onConflict: 'student_id', not
-- 'student_id,teacher_id'), meant to be editable by any co-teacher in that
-- student's group - not a forgery bug. That change has been removed here.)
--
-- Run manually in the Supabase SQL editor against the live project.

-- adminview-only SELECT policies that are fully covered by a broader
-- "admin OR adminView OR registrar OR teacher(-scoped)" SELECT policy already
-- on the same table.
DROP POLICY IF EXISTS "records_adminview"  ON attendance_records;
DROP POLICY IF EXISTS "sessions_adminview" ON attendance_sessions;
DROP POLICY IF EXISTS "groups_adminview"   ON groups;

-- groups_read (admin/registrar OR own group) is fully covered by groups_select
-- (admin/adminView/registrar/teacher, with no per-group narrowing - already
-- the broadest grant on this table).
DROP POLICY IF EXISTS "groups_read" ON groups;

-- groups_write checks the exact same two roles (admin, registrar) as
-- groups_manage, just via the older role-check function - groups_manage is a
-- confirmed superset for that identical role set.
DROP POLICY IF EXISTS "groups_write" ON groups;

-- Exact duplicate (byte-for-byte identical check) of audit_logs_authenticated_insert.
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

-- References a 'teacherAdmin' extra_role that is never assigned anywhere in
-- the app (confirmed: no code path sets or checks it) - dead policy.
DROP POLICY IF EXISTS "teacherAdmin can manage teacher_attendance" ON teacher_attendance;

-- ── Verify ──────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE tablename IN ('attendance_records','attendance_sessions','groups','audit_logs','teacher_attendance')
ORDER BY tablename, cmd, policyname;
