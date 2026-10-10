-- fix-notifications-rls.sql added new, clearly-named policies
-- (notifications_select_own, notifications_update_own, notifications_delete_own,
-- notifications_staff_insert) without realizing the table already had working
-- policies under different names (notifications_select, notifications_update,
-- notifications_delete, notifications_insert, users_own_notifications). Both
-- sets are functionally compatible (multiple permissive policies for the same
-- command are OR'd together), so nothing was broken, but it's redundant.
-- notifications_staff_insert is a strict superset of notifications_insert
-- (any admin/registrar/teacher, not just self or admin/registrar), so it's
-- safe to drop the old ones entirely.
-- Run in Supabase Dashboard → SQL Editor → New Query

drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
drop policy if exists "notifications_delete" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "users_own_notifications" on public.notifications;
