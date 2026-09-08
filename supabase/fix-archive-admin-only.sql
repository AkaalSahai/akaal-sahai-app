-- Restrict users_archive visibility to admin only.
--
-- The Archive tab in the app was already admin-only (same gate as
-- Activity/Settings — registrar and adminView never see it). But the
-- database policy underneath it was looser than that, allowing
-- adminView and registrar to read users_archive directly. This closes
-- that gap so the database matches what the app actually exposes.
--
-- Run manually in the Supabase SQL editor against the live project.

drop policy if exists "users_archive_select" on public.users_archive;
create policy "users_archive_select" on public.users_archive for select using (
  user_has_role('admin')
);
