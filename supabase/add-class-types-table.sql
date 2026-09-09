-- Admin-manageable "extra class" types (Gatka, Kirtan, and any future ones
-- like GCSE Punjabi) - previously these were hardcoded in two separate
-- places in the code (src/lib/classTypes.js and a second list inside
-- AdminGroups.jsx), so adding a new one always needed a developer.
--
-- Punjabi itself is NOT part of this table on purpose - it's the
-- foundational class the whole app is built around (fixed Friday/Saturday
-- schedule hardcoded in the teacher daily register, default class_type on
-- new groups, etc.) and isn't something this feature is meant to let admin
-- edit or delete. This table is only for the optional extra classes.
--
-- Run manually in the Supabase SQL editor against the live project.

create table if not exists public.class_types (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,   -- matches groups.class_type, e.g. 'gatka'
  label      text not null,          -- 'Gatka'
  color      text not null default '#1e1a6e',
  bg         text not null default '#eef2ff',
  days       int[] not null default '{}',  -- day-of-week, 0=Sunday..6=Saturday
  day_names  text not null default '',      -- 'Sundays' - human-readable, derived from days at write time
  created_at timestamptz not null default now()
);

alter table public.class_types enable row level security;

-- Read: any authenticated user (teachers/registrar need labels+colors too,
-- same as every other reference table in this app).
create policy "class_types_select" on public.class_types for select using (
  auth.uid() is not null
);

-- Write: admin only.
create policy "class_types_admin_manage" on public.class_types for all using (
  user_has_role('admin')
) with check (
  user_has_role('admin')
);

-- Seed the two existing extra classes so nothing changes for current
-- Gatka/Kirtan groups - exact same label/color/day values as the old
-- hardcoded CLASS_META. Two separate statements (rather than one
-- multi-row insert) so no single line is long enough to get cut off
-- when copying into the SQL editor.
insert into public.class_types (key, label, color, bg, days, day_names)
values ('gatka', 'Gatka', '#15803d', '#f0fdf4', '{0}', 'Sundays')
on conflict (key) do nothing;

insert into public.class_types (key, label, color, bg, days, day_names)
values ('kirtan', 'Kirtan', '#7c3aed', '#f5f3ff', '{3}', 'Wednesdays')
on conflict (key) do nothing;
