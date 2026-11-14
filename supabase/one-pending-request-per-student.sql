-- One waiting transfer/removal request per student, visible to every teacher
-- of the group (agreed 14-11-2026).
--
-- Why: teachers could send the same transfer/removal request again and again
-- (the register had no marker and nothing stopped a repeat), and admins then
-- saw several requests for one child - history has children with 2-5
-- requests, some a minute apart. Teachers could only see requests they sent
-- themselves, so a second teacher of the same group couldn't tell one was
-- already waiting.
--
-- 1. A unique index: a student can have only ONE pending request (transfer
--    or removal) at a time. Approved/rejected history is untouched. Once an
--    admin approves or rejects, a new request can be sent.
-- 2. pending_student_requests(p_group_id): the waiting requests for students
--    in that group, for the register's "⏳ requested" label. Only the type,
--    destination group, who asked and when - never the reason. Admins and
--    registrars get any group; teachers only groups they teach.
--
-- Students with a waiting request stay on the register as normal (marked,
-- auto-absent at 21:30) - user decision 14-11-2026.
--
-- Checked before writing: 0 pending requests exist (so the index can't clash);
-- the name pending_student_requests was free.
--
-- Undo:
--   drop function if exists public.pending_student_requests(uuid);
--   drop index if exists public.transfer_requests_one_pending_per_student;

begin;

create unique index if not exists transfer_requests_one_pending_per_student
  on public.transfer_requests (student_id)
  where status = 'pending';

create function public.pending_student_requests(p_group_id uuid)
returns table (
  student_id      uuid,
  request_type    text,
  to_group_name   text,
  requested_by    text,
  requested_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.student_id,
         r.request_type,
         r.requested_to_group_name,
         coalesce(u.name, 'a teacher'),
         r.created_at
  from transfer_requests r
  join students s on s.id = r.student_id
  left join users u on u.id = r.requested_by
  where r.status = 'pending'
    and (s.group_id = p_group_id or r.from_group_id = p_group_id)
    and (
      user_has_role('admin') or user_has_role('registrar')
      or exists (select 1 from groups g where g.id = p_group_id and g.teacher_id = auth.uid())
      or exists (select 1 from teacher_groups tg where tg.group_id = p_group_id and tg.teacher_id = auth.uid())
    )
$$;

revoke all on function public.pending_student_requests(uuid) from public, anon;
grant execute on function public.pending_student_requests(uuid) to authenticated;

-- Expect: the index exists, the function exists, 0 pending requests
select
  (select count(*) from pg_indexes where indexname = 'transfer_requests_one_pending_per_student') as index_ok,
  (select count(*) from pg_proc where proname = 'pending_student_requests') as function_ok,
  (select count(*) from transfer_requests where status = 'pending') as pending_now;

commit;
