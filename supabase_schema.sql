-- ============================================================
-- Akaal Sahai Southall — Supabase Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- GROUPS
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  teacher_id  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

-- USERS (mirrors auth.users with role + profile data)
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null,
  role          text not null check (role in ('admin','registrar','teacher')),
  group_id      uuid references public.groups(id) on delete set null,
  phone         text,
  last_login    timestamptz,
  pw_changed_at timestamptz,
  created_at    timestamptz default now()
);

-- STUDENTS
create table public.students (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid references public.groups(id) on delete set null,
  first_name       text not null,
  middle_name      text,
  last_name        text not null,
  date_of_birth    date,
  medical_notes    text,
  house_no         text,
  street_name      text,
  town             text,
  postcode         text,
  parent_name      text,
  relationship     text,
  phone            text,
  secondary_phone  text,
  email            text,
  photo_consent    boolean default false,
  date_joined      date,
  active           boolean default true,
  created_at       timestamptz default now()
);

-- ATTENDANCE SESSIONS (one per group per day)
create table public.attendance_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  teacher_id   uuid references auth.users(id) on delete set null,
  session_date date not null,
  submitted_at timestamptz default now(),
  unique(group_id, session_date)
);

-- ATTENDANCE RECORDS (one per student per session)
create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  group_id     uuid not null references public.groups(id) on delete cascade,
  session_date date not null,
  status       text not null check (status in ('present','absent','late')),
  unique(session_id, student_id)
);

-- PARENT / STUDENT APPLICATIONS (public form submissions)
create table public.parent_applications (
  id               uuid primary key default gen_random_uuid(),
  first_name       text not null,
  middle_name      text,
  last_name        text not null,
  date_of_birth    date,
  medical_notes    text,
  house_no         text,
  street_name      text,
  town             text,
  postcode         text,
  parent_name      text,
  relationship     text,
  phone            text,
  secondary_phone  text,
  email            text,
  photo_consent    boolean default false,
  gdpr_consent     boolean default false,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at      timestamptz,
  created_at       timestamptz default now()
);

-- TEACHER APPLICATIONS (public form submissions)
create table public.teacher_applications (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text not null,
  phone           text,
  preferred_group text,
  experience      text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at     timestamptz,
  created_at      timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- All tables locked down — data is NEVER publicly readable
-- ============================================================

alter table public.groups              enable row level security;
alter table public.users               enable row level security;
alter table public.students            enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records  enable row level security;
alter table public.parent_applications enable row level security;
alter table public.teacher_applications enable row level security;

-- Helper: get current user's role
create or replace function public.current_user_role()
returns text language sql stable security definer as $$
  select role from public.users where id = auth.uid()
$$;

-- Helper: get current user's group_id
create or replace function public.current_user_group()
returns uuid language sql stable security definer as $$
  select group_id from public.users where id = auth.uid()
$$;

-- ── GROUPS ──
-- Admin/Registrar: full access. Teacher: read their own group.
create policy "groups_read" on public.groups for select using (
  current_user_role() in ('admin','registrar')
  or id = current_user_group()
);
create policy "groups_write" on public.groups for all using (
  current_user_role() in ('admin','registrar')
);

-- ── USERS ──
-- Admin: full access. Registrar: read. Teacher: read own row.
create policy "users_read_admin_reg" on public.users for select using (
  current_user_role() in ('admin','registrar')
);
create policy "users_read_own" on public.users for select using (
  auth.uid() = id
);
create policy "users_insert_admin" on public.users for insert with check (
  current_user_role() = 'admin'
);
create policy "users_update_admin" on public.users for update using (
  current_user_role() = 'admin'
);
create policy "users_update_own" on public.users for update using (
  auth.uid() = id
);
create policy "users_delete_admin" on public.users for delete using (
  current_user_role() = 'admin'
);

-- ── STUDENTS ──
-- Admin/Registrar: full access. Teacher: read own group only.
create policy "students_admin_reg" on public.students for all using (
  current_user_role() in ('admin','registrar')
);
create policy "students_teacher_read" on public.students for select using (
  current_user_role() = 'teacher' and group_id = current_user_group()
);

-- ── ATTENDANCE SESSIONS ──
-- Admin/Registrar: full access. Teacher: read/write own group.
create policy "sessions_admin_reg" on public.attendance_sessions for all using (
  current_user_role() in ('admin','registrar')
);
create policy "sessions_teacher_read" on public.attendance_sessions for select using (
  current_user_role() = 'teacher' and group_id = current_user_group()
);
create policy "sessions_teacher_insert" on public.attendance_sessions for insert with check (
  current_user_role() = 'teacher' and group_id = current_user_group()
);

-- ── ATTENDANCE RECORDS ──
create policy "records_admin_reg" on public.attendance_records for all using (
  current_user_role() in ('admin','registrar')
);
create policy "records_teacher_read" on public.attendance_records for select using (
  current_user_role() = 'teacher' and group_id = current_user_group()
);
create policy "records_teacher_insert" on public.attendance_records for insert with check (
  current_user_role() = 'teacher' and group_id = current_user_group()
);

-- ── PARENT APPLICATIONS ──
-- Anyone (anon) can INSERT (submit the form). Only admin/registrar can read/update.
create policy "parent_apps_public_insert" on public.parent_applications for insert with check (true);
create policy "parent_apps_staff_read" on public.parent_applications for select using (
  current_user_role() in ('admin','registrar')
);
create policy "parent_apps_staff_update" on public.parent_applications for update using (
  current_user_role() in ('admin','registrar')
);

-- ── TEACHER APPLICATIONS ──
-- Anyone (anon) can INSERT. Only admin can read/update.
create policy "teacher_apps_public_insert" on public.teacher_applications for insert with check (true);
create policy "teacher_apps_admin_read" on public.teacher_applications for select using (
  current_user_role() in ('admin','registrar')
);
create policy "teacher_apps_admin_update" on public.teacher_applications for update using (
  current_user_role() in ('admin','registrar')
);

-- ============================================================
-- Auto-create users row when auth user signs up
-- (used only for the first admin created manually)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Only create if not already inserted by admin panel
  if not exists (select 1 from public.users where id = new.id) then
    -- no-op: admin panel creates the row explicitly
    null;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- FIRST ADMIN SETUP
-- After running this schema, create your first admin user:
-- 1. Go to Supabase → Authentication → Users → Add User
-- 2. Enter email + password
-- 3. Copy the UUID shown
-- 4. Run: INSERT INTO public.users (id, name, email, role)
--    VALUES ('<uuid>', 'Admin Name', 'admin@example.com', 'admin');
-- ============================================================
