-- A group can have more than one primary teacher (agreed 30-10-2026).
--
--   * Drops the one_primary_teacher_per_group unique index, so several
--     teacher_groups rows for a group can have role = 'primary'.
--     groups.teacher_id stays pointing at one of them (the "lead") for the
--     older checks (RLS, notifications) that read that single field.
--   * primary_teacher_label(group_id) - the projector name for a group's
--     primary teachers: one teacher -> full name; several -> first name and
--     last initial, lead first, e.g. "Harpreet S., Jaspreet K. & Simran K.".
--     Mirrors primaryTeacherLabel() in src/lib/primaryTeachers.js.
--   * get_projector_seva() - uses primary_teacher_label(); the rota's own
--     teacher override (seva_rota.teacher_id) still wins. Everything else is
--     the live definition as fetched.
--
-- Function name checked free before creating (supabase/README.md item 2).
-- No rows change. Check: the seva slide output is the same before and after
-- (no group has two primaries yet).
--
-- Undo (only once every group is back to a single primary):
--   create unique index one_primary_teacher_per_group on teacher_groups (group_id) where role = 'primary';
--   run previous-versions/get_projector_seva-before-20261030.sql
--   drop function public.primary_teacher_label(uuid);
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

drop index if exists public.one_primary_teacher_per_group;

create or replace function public.primary_teacher_label(p_group_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_names text[];
  n int;
begin
  select array_agg(u.name order by (u.id = g.teacher_id) desc, u.name)
    into v_names
  from groups g
  join users u on u.id = g.teacher_id
     or u.id in (select tg.teacher_id from teacher_groups tg
                 where tg.group_id = g.id and tg.role = 'primary')
  where g.id = p_group_id;

  n := coalesce(array_length(v_names, 1), 0);
  if n = 0 then return null; end if;
  if n = 1 then return v_names[1]; end if;

  -- First name + last initial ("Harpreet Singh" -> "Harpreet S.")
  select array_agg(regexp_replace(trim(x), '^(\S+).*\s(\S)\S*$', '\1 \2.') order by i)
    into v_names
  from unnest(v_names) with ordinality as t(x, i);

  return array_to_string(v_names[1:n-1], ', ') || ' & ' || v_names[n];
end;
$$;

revoke all on function public.primary_teacher_label(uuid) from public, anon;

create or replace function public.get_projector_seva()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_dow   int  := extract(dow from v_today)::int;   -- 5 = Fri, 6 = Sat
  v_fri   date;
begin
  if not (user_has_role('dashboard') or user_has_role('admin')) then
    raise exception 'Unauthorized';
  end if;

  -- On a Friday/Saturday: next week's Fri/Sat. Otherwise: the coming Fri/Sat.
  if v_dow = 5 then v_fri := v_today + 7;
  elsif v_dow = 6 then v_fri := v_today + 6;
  else v_fri := v_today + ((5 - v_dow + 7) % 7);
  end if;

  return json_build_object(
    'today', v_today,
    'today_is_class_day', v_dow in (5, 6),
    'days', (
      select coalesce(json_agg(day order by (day->>'date')), '[]'::json) from (
        select json_build_object(
          'date', d.d,
          'groups', coalesce((
            select json_agg(json_build_object(
              'group', coalesce(g.name, r.group_label) || coalesce(' – ' || r.sub_label, ''),
              'teacher', coalesce(
                (select u.name from users u where u.id = r.teacher_id),
                primary_teacher_label(g.id))
            ) order by r.position)
            from seva_rota r left join groups g on g.id = r.group_id
            where r.seva_date = d.d), '[]'::json)
        ) as day
        from (select v_today as d where v_dow in (5, 6)
              union all select v_fri union all select v_fri + 1) d
      ) x
    )
  );
end;
$function$;

-- Expect: no rows (index gone)
select indexname from pg_indexes where indexname = 'one_primary_teacher_per_group';

commit;
