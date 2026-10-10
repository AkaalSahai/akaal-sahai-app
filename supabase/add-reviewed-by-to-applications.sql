-- Track which admin/registrar approved or rejected each application, so it can
-- be shown on the application record (useful now that there are several
-- registrars/admins reviewing applications).
alter table public.parent_applications  add column if not exists reviewed_by uuid references public.users(id);
alter table public.teacher_applications add column if not exists reviewed_by uuid references public.users(id);
alter table public.transfer_requests    add column if not exists reviewed_by uuid references public.users(id);
