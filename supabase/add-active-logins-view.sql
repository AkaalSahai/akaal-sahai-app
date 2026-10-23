-- Admin "Logins" tab: who is logged in, on which devices, from which IP
-- address, and ending a single login. Approved 23-10-2026.
--
-- IP addresses are personal data (GDPR), so both functions are restricted to
-- full admins (not adminView), and the app logs each view of the tab.
--
--   * list_active_logins() - one row per login (auth.sessions): person,
--     role, device/browser string, IP, first logged in, last active
--   * end_login(session_id) - end one login (one device); writes an
--     Activity log entry
--
-- end_idle_logins(days) is also defined for an optional nightly clean-up of
-- logins unused for N days, but NOT scheduled - that needs a separate go-ahead.
--
-- Function names checked free before creating (supabase/README.md item 2).
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.list_active_logins()
returns table (
  session_id uuid, user_id uuid, name text, role text,
  user_agent text, ip text, logged_in_at timestamptz, last_active_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not user_has_role('admin') then
    raise exception 'Unauthorized';
  end if;

  return query
  select s.id, s.user_id, coalesce(u.name, '(unknown account)'), coalesce(u.role, ''),
         s.user_agent, host(s.ip), s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC')
  from auth.sessions s
  left join public.users u on u.id = s.user_id
  where s.not_after is null or s.not_after > now();
end;
$$;

create or replace function public.end_login(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_agent text;
begin
  if not user_has_role('admin') then
    raise exception 'Unauthorized';
  end if;

  select u.name, s.user_agent into v_name, v_agent
  from auth.sessions s left join public.users u on u.id = s.user_id
  where s.id = p_session_id;
  if not found then
    return;  -- already ended
  end if;

  delete from auth.sessions where id = p_session_id;

  insert into public.audit_logs (user_id, user_name, action, detail, success)
  select auth.uid(), u.name, 'Ended a login',
         coalesce(v_name, 'unknown') || ' – ' || left(coalesce(v_agent, 'unknown device'), 120), true
  from public.users u where u.id = auth.uid();
end;
$$;

-- Optional clean-up, not scheduled. Projector/dashboard account excluded.
create or replace function public.end_idle_logins(p_days int)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  if p_days is null or p_days < 7 then
    raise exception 'Use at least 7 days';
  end if;

  delete from auth.sessions s
  where greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') < now() - make_interval(days => p_days)
    and not exists (select 1 from public.users u
                    where u.id = s.user_id and (u.role = 'dashboard' or 'dashboard' = any(u.extra_roles)));
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.audit_logs (user_id, user_name, action, detail, success)
    values (null, 'System', 'Ended idle logins', v_count || ' logins unused for over ' || p_days || ' days', true);
  end if;
  return v_count;
end;
$$;

revoke all on function public.list_active_logins() from public, anon;
revoke all on function public.end_login(uuid) from public, anon;
revoke all on function public.end_idle_logins(int) from public, anon, authenticated;
grant execute on function public.list_active_logins() to authenticated;
grant execute on function public.end_login(uuid) to authenticated;
