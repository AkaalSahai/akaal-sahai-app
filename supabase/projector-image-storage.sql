-- Storage for projector pictures (agreed 06-11-2026). Settings -> Projector
-- Screen -> Images uploads here; the list, captions, dates and pictures per
-- slide live in site_settings (projector_images, projector_images_per_slide).
--
-- Anyone can view (they're shown on a public screen, and a public bucket is
-- how the projector loads them); only admins can upload, change or delete.
-- Max 5 MB, JPEG/PNG/WebP. The app shrinks pictures before upload.
--
-- Undo (after deleting the pictures in Settings):
--   drop policy projector_images_admin_insert on storage.objects;
--   drop policy projector_images_admin_update on storage.objects;
--   drop policy projector_images_admin_delete on storage.objects;
--   delete from storage.buckets where id = 'projector-images';
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projector-images', 'projector-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy projector_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'projector-images' and public.user_has_role('admin'));
create policy projector_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'projector-images' and public.user_has_role('admin'));
create policy projector_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'projector-images' and public.user_has_role('admin'));

insert into audit_logs (user_id, user_name, action, detail, success)
values (null, 'Admin (database fix)', 'Set up projector image storage',
        'Storage for projector pictures: public view, admin-only upload/delete, 5 MB, JPEG/PNG/WebP', true);

-- Expect: 1 bucket, 3 policies
select (select count(*) from storage.buckets where id = 'projector-images') buckets,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'projector_images_%') policies;

commit;
