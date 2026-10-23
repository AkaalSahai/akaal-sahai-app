-- Keep everything a teacher/registrar did when their account is deleted.
--
-- Deleting a user (Admin > Teachers > Delete) moves their details into
-- users_archive and removes their login. Until now the foreign keys pointing
-- at their account then either DELETED their history (teacher attendance,
-- announcement acknowledgements), BLANKED who did it (registers taken, notes,
-- verifications, messages, transfer requests, activity log) or BLOCKED the
-- delete entirely (if they'd ever marked the Teacher Register or approved
-- an application) - leaving them half-archived.
--
-- This removes those history links so the records stay, still carrying the
-- person's ID, which matches users_archive.original_id. Left as they are on
-- purpose: teacher_groups and groups.teacher_id (they stop being a group's
-- current teacher - users_archive.group_names records which groups they
-- taught) and notifications (their own inbox).
--
-- Also adds:
--   * users_archive.joined_at - so reports can show "Joined ... Left ..."
--   * get_former_staff()      - name / joined / left / groups of archived
--                               staff (no email/phone) for anyone who can see
--                               the Teacher Register, not just full admins
--   * erase_former_staff(id)  - admin-only GDPR erasure: removes or
--                               anonymises the person's data everywhere
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

-- 1. Stop deleting / blanking / blocking history ---------------------------
alter table public.teacher_attendance        drop constraint if exists teacher_attendance_teacher_id_fkey;
alter table public.teacher_attendance        drop constraint if exists teacher_attendance_marked_by_fkey;
alter table public.broadcast_acknowledgments drop constraint if exists broadcast_acknowledgments_acknowledged_by_fkey;
alter table public.attendance_sessions       drop constraint if exists attendance_sessions_teacher_id_fkey;
alter table public.student_notes             drop constraint if exists student_notes_teacher_id_fkey;
alter table public.student_verifications     drop constraint if exists student_verifications_verified_by_fkey;
alter table public.messages                  drop constraint if exists messages_from_user_id_fkey;
alter table public.transfer_requests         drop constraint if exists transfer_requests_requested_by_fkey;
alter table public.transfer_requests         drop constraint if exists transfer_requests_reviewed_by_fkey;
alter table public.teacher_applications      drop constraint if exists teacher_applications_reviewed_by_fkey;
alter table public.parent_applications       drop constraint if exists parent_applications_reviewed_by_fkey;
alter table public.audit_logs                drop constraint if exists audit_logs_user_id_fkey;

-- 2. Joining date in the archive ------------------------------------------
alter table public.users_archive add column if not exists joined_at timestamptz;

-- 3. Former staff names for Teacher Register viewers ------------------------
create or replace function public.get_former_staff()
returns table (original_id uuid, name text, joined_at timestamptz, left_at timestamptz, group_names text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar')
          or exists (select 1 from users u where u.id = auth.uid() and u.can_manage_teacher_register)) then
    raise exception 'Unauthorized';
  end if;

  return query
  select a.original_id, a.name, a.joined_at, a.deleted_at, a.group_names
  from users_archive a
  where a.original_id is not null;
end;
$$;

revoke all on function public.get_former_staff() from public, anon;
grant execute on function public.get_former_staff() to authenticated;

-- 4. GDPR erasure of a former staff member --------------------------------
create or replace function public.erase_former_staff(p_original_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_email  text;
  v_unique boolean;
begin
  if not user_has_role('admin') then
    raise exception 'Unauthorized';
  end if;

  select a.name, a.email into v_name, v_email
  from users_archive a where a.original_id = p_original_id
  limit 1;
  if not found then
    raise exception 'No archived staff member with that ID';
  end if;
  if exists (select 1 from users where id = p_original_id) then
    raise exception 'This person still has an active account - delete them first';
  end if;

  -- Their own records
  delete from teacher_attendance        where teacher_id = p_original_id;
  delete from broadcast_acknowledgments where acknowledged_by = p_original_id;
  delete from notifications             where user_id = p_original_id;
  delete from teacher_applications
   where auth_user_id = p_original_id
      or (v_email is not null and lower(email) = lower(v_email));

  -- Work they did that belongs to other records: keep it, remove who
  update teacher_attendance    set marked_by    = null where marked_by    = p_original_id;
  update attendance_sessions   set teacher_id   = null where teacher_id   = p_original_id;
  update student_notes         set teacher_id   = null where teacher_id   = p_original_id;
  update student_verifications set verified_by  = null, verified_by_name = null where verified_by = p_original_id;
  update messages              set from_user_id = null where from_user_id = p_original_id;
  update transfer_requests     set requested_by = null where requested_by = p_original_id;
  update transfer_requests     set reviewed_by  = null where reviewed_by  = p_original_id;
  update teacher_applications  set reviewed_by  = null where reviewed_by  = p_original_id;
  update parent_applications   set reviewed_by  = null where reviewed_by  = p_original_id;

  -- Activity log: anonymise their entries, and their name inside other
  -- entries - but only when no other current or archived person shares the
  -- exact same name, so nobody else's history is touched.
  update audit_logs set user_id = null, user_name = '[erased]' where user_id = p_original_id;
  select not exists (select 1 from users where name = v_name)
     and (select count(*) from users_archive where name = v_name) = 1
    into v_unique;
  if v_unique and v_name is not null and length(v_name) > 3 then
    update audit_logs set detail = replace(detail, v_name, '[erased]') where detail like '%' || v_name || '%';
  end if;

  delete from users_archive where original_id = p_original_id;

  insert into audit_logs (user_id, user_name, action, detail, success)
  select auth.uid(), u.name, 'Permanently erased teacher archive', 'GDPR erasure of a former staff member', true
  from users u where u.id = auth.uid();
end;
$$;

revoke all on function public.erase_former_staff(uuid) from public, anon;
grant execute on function public.erase_former_staff(uuid) to authenticated;

commit;
