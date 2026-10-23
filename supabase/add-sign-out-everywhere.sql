-- "Log out everywhere" for admins, approved 23-10-2026.
--
-- A login is a row in auth.sessions (its refresh tokens are deleted with it,
-- ON DELETE CASCADE). Deleting the sessions means no device can renew; the
-- app also re-checks its login every few minutes and on returning to the tab,
-- so open devices drop to the login page within minutes rather than at the
-- next hourly renewal.
--
--   * sign_out_user_everywhere(user_id) - one person, every device
--     (Admin > Teachers > "Log out everywhere")
--   * sign_out_all_users() - everyone, including the admin who runs it,
--     EXCEPT the projector/dashboard account so the screen keeps working
--     (Admin > Settings > "Log out all users")
-- Both are admin-only and write their own Activity log entry. (People logging
-- themselves out of all their own devices use Supabase's built-in global
-- sign-out from the account menu - no SQL needed.)
--
-- Function names checked free before creating (supabase/README.md item 2).
-- Run in Supabase Dashboard -> SQL Editor -> New Query

create or replace function public.sign_out_user_everywhere(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
  v_name  text;
begin
  if not user_has_role('admin') then
    raise exception 'Unauthorized';
  end if;

  select name into v_name from public.users where id = p_user_id;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (user_id, user_name, action, detail, success)
  select auth.uid(), u.name, 'Logged a user out everywhere',
         coalesce(v_name, p_user_id::text) || ' (' || v_count || ' device logins ended)', true
  from public.users u where u.id = auth.uid();

  return v_count;
end;
$$;

create or replace function public.sign_out_all_users()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  if not user_has_role('admin') then
    raise exception 'Unauthorized';
  end if;

  -- Logged before the delete, since the admin's own login goes too
  insert into public.audit_logs (user_id, user_name, action, detail, success)
  select auth.uid(), u.name, 'Logged out all users',
         'Everyone except the projector/dashboard account', true
  from public.users u where u.id = auth.uid();

  delete from auth.sessions s
  where not exists (
    select 1 from public.users u
    where u.id = s.user_id
      and (u.role = 'dashboard' or 'dashboard' = any(u.extra_roles))
  );
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke all on function public.sign_out_user_everywhere(uuid) from public, anon;
revoke all on function public.sign_out_all_users() from public, anon;
grant execute on function public.sign_out_user_everywhere(uuid) to authenticated;
grant execute on function public.sign_out_all_users() to authenticated;
