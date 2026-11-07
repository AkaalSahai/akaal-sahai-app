-- Projector Manager permission (agreed 07-11-2026)
--
-- Why: admins want to let chosen staff (teachers/registrars) run the projector
-- - Settings -> Projector Screen and Projector Pictures - without giving them
-- admin or access to any other setting.
--
-- What it does:
--   1. users.can_manage_projector (boolean, default false - every existing
--      user starts without it). Switched on/off by admins on the Users page.
--   2. protect_privileged_user_columns: only admins can change the new column
--      (same as can_manage_teacher_register).
--   3. user_can_manage_projector(): true for admins and projector managers.
--   4. site_settings: projector managers may insert/update ONLY the 6 projector
--      keys. The existing admin-only "Admin can write settings" is untouched.
--   5. storage projector-images bucket: projector managers may upload / replace
--      / delete pictures; plus a SELECT policy (admins + managers) because
--      Supabase storage only deletes files the caller can also select -
--      without it a delete removed the picture from the list but left the file.
--
-- No existing rows change (new column defaults to false), so no backup needed.
--
-- Undo:
--   drop policy if exists projector_settings_manager_insert on public.site_settings;
--   drop policy if exists projector_settings_manager_update on public.site_settings;
--   drop policy if exists projector_images_manager_insert on storage.objects;
--   drop policy if exists projector_images_manager_update on storage.objects;
--   drop policy if exists projector_images_manager_delete on storage.objects;
--   drop policy if exists projector_images_manager_select on storage.objects;
--   drop function if exists public.user_can_manage_projector();
--   (re-run protect_privileged_user_columns below without the new line)
--   alter table public.users drop column if exists can_manage_projector;

begin;

alter table public.users add column can_manage_projector boolean not null default false;

create or replace function public.protect_privileged_user_columns()
 returns trigger
 language plpgsql
as $function$
begin
  if not user_has_role('admin') then
    new.role := old.role;
    new.extra_roles := old.extra_roles;
    new.can_edit_students := old.can_edit_students;
    new.can_manage_teacher_register := old.can_manage_teacher_register;
    new.mfa_required := old.mfa_required;
    new.register_classes := old.register_classes;
    new.register_manager_classes := old.register_manager_classes;
    new.can_manage_projector := old.can_manage_projector;
  end if;
  return new;
end;
$function$;

-- Name checked free 07-11-2026. NULL-safe: logged-out callers get false.
create function public.user_can_manage_projector()
 returns boolean
 language sql
 stable
 security definer
 set search_path = public
as $$
  select coalesce(user_has_role('admin'), false) or exists (
    select 1 from public.users where id = auth.uid() and can_manage_projector = true
  )
$$;
revoke execute on function public.user_can_manage_projector() from public, anon;
grant execute on function public.user_can_manage_projector() to authenticated;

create policy projector_settings_manager_insert on public.site_settings
  for insert to authenticated
  with check (user_can_manage_projector() and key in ('projector_dates', 'projector_thought', 'projector_headings',
    'projector_images', 'projector_images_per_slide', 'projector_timings'));

create policy projector_settings_manager_update on public.site_settings
  for update to authenticated
  using (user_can_manage_projector() and key in ('projector_dates', 'projector_thought', 'projector_headings',
    'projector_images', 'projector_images_per_slide', 'projector_timings'))
  with check (user_can_manage_projector() and key in ('projector_dates', 'projector_thought', 'projector_headings',
    'projector_images', 'projector_images_per_slide', 'projector_timings'));

create policy projector_images_manager_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'projector-images' and user_can_manage_projector());

create policy projector_images_manager_update on storage.objects
  for update to authenticated
  using (bucket_id = 'projector-images' and user_can_manage_projector());

create policy projector_images_manager_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'projector-images' and user_can_manage_projector());

create policy projector_images_manager_select on storage.objects
  for select to authenticated
  using (bucket_id = 'projector-images' and user_can_manage_projector());

-- Let projector managers open the projector screen to check their changes:
-- its two data functions allowed only the projector account and admins. They
-- return only what the projector already shows the whole hall (group-level
-- counts, seva rota). Only the permission line is changed - the rest of each
-- function is re-created exactly as it is live (fails if the line isn't found
-- exactly once). Undo: same replace the other way round.
do $$
declare
  f text;
  def text;
  old_check constant text := 'if not (user_has_role(''dashboard'') or user_has_role(''admin'')) then';
  new_check constant text := 'if not (user_has_role(''dashboard'') or user_can_manage_projector()) then';
begin
  foreach f in array array['get_projector_dashboard_stats', 'get_projector_seva'] loop
    def := pg_get_functiondef(('public.' || f)::regproc);
    if (length(def) - length(replace(def, old_check, ''))) / length(old_check) <> 1 then
      raise exception 'Permission line not found exactly once in %', f;
    end if;
    execute replace(def, old_check, new_check);
  end loop;
end $$;

-- Expected: 0 users with it, the 6 new policies, function present, both
-- projector functions now using it
select
  (select count(*) from public.users where can_manage_projector) as managers,
  (select count(*) from pg_policies where policyname like 'projector_%manager%') as new_policies,
  (select count(*) from pg_proc where proname = 'user_can_manage_projector') as fn,
  (select count(*) from pg_proc where proname in ('get_projector_dashboard_stats', 'get_projector_seva')
     and prosrc like '%user_can_manage_projector()%') as projector_fns_updated;

commit;
