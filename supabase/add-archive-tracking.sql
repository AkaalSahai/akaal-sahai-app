-- GDPR visibility for removed students and deleted staff accounts.
--
-- Students were already soft-deleted (active = false) on removal, but with
-- zero record of who archived them, when, or why — and no admin screen even
-- showed them. This adds that tracking.
--
-- Deleting a teacher/staff account, on the other hand, genuinely removes
-- their auth user and profile row entirely (true erasure) — so there was no
-- record left at all afterward. This adds a snapshot table, populated right
-- before deletion, so there's still a GDPR-visible record of who existed,
-- when they were removed, by whom, and why — without keeping their live
-- account around.
--
-- Depends on the user_has_role() helper function already used by
-- student_verifications / broadcast_acknowledgments.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

-- ── Students: who/when/why for the existing soft-delete ──
alter table public.students
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_id uuid references auth.users(id) on delete set null,
  add column if not exists archived_by_name text,
  add column if not exists deletion_requested_by_name text,
  add column if not exists deletion_reason text;

-- ── Deleted teacher/staff accounts: snapshot before true deletion ──
create table if not exists public.users_archive (
  id                uuid primary key default gen_random_uuid(),
  original_id       uuid,
  name              text,
  email             text,
  phone             text,
  role              text,
  extra_roles       text[],
  group_names       text[],
  last_login        timestamptz,
  deleted_at        timestamptz not null default now(),
  deleted_by_id     uuid references auth.users(id) on delete set null,
  deleted_by_name   text,
  deletion_reason   text
);

alter table public.users_archive enable row level security;

-- Read: admin/adminView/registrar only — this is a staff-facing GDPR record,
-- not something teachers need to see.
create policy "users_archive_select" on public.users_archive for select using (
  user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar')
);

-- Insert/delete: admin only, matching the existing admin-user-action edge
-- function's own restriction to admin for deleting a user.
create policy "users_archive_insert" on public.users_archive for insert with check (
  user_has_role('admin')
);
create policy "users_archive_delete" on public.users_archive for delete using (
  user_has_role('admin')
);
