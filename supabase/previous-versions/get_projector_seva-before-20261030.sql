CREATE OR REPLACE FUNCTION public.get_projector_seva()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                (select u.name from users u where u.id = g.teacher_id),
                (select string_agg(u.name, ', ') from teacher_groups tg join users u on u.id = tg.teacher_id
                  where tg.group_id = g.id and tg.role = 'primary'))
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
