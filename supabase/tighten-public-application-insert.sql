-- B7 (health check 27-11-2026): the public sign-up form may only create a
-- NEW, UNREVIEWED application. Until now the rule only checked
-- status = 'pending', so someone tampering with the form's request could
-- pre-fill assigned_group_id / reviewed_by / reviewed_at. The real form
-- (StudentRegistration.jsx) never sends those fields, so parents notice no
-- difference.
--
-- UNDO:
--   alter policy parent_apps_insert on public.parent_applications
--     with check (status = 'pending'::text);

begin;

alter policy parent_apps_insert on public.parent_applications
  with check (
    status = 'pending'::text
    and assigned_group_id is null
    and reviewed_by is null
    and reviewed_at is null
  );

-- Expected: the new check
select policyname, with_check from pg_policies
where tablename = 'parent_applications' and policyname = 'parent_apps_insert';

commit;
