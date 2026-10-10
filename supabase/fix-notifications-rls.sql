-- The `notifications` table was created directly in the Supabase dashboard and
-- was never tracked here, so its RLS state was unknown. The bell was showing
-- nothing for teachers — most likely because no SELECT policy let a teacher
-- read their own rows. This (re)creates a clear, idempotent set of policies.
-- Run in Supabase Dashboard → SQL Editor → New Query

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (
  user_id = auth.uid()
);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update using (
  user_id = auth.uid()
);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete using (
  user_id = auth.uid()
);

-- Any signed-in staff member can notify another user (e.g. notifyTeachersOfGroup
-- notifying a group's teachers when a student is added/moved) — not just insert
-- notifications for themselves.
drop policy if exists "notifications_staff_insert" on public.notifications;
create policy "notifications_staff_insert" on public.notifications for insert with check (
  current_user_role() in ('admin','registrar','teacher')
);
