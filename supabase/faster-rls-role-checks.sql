-- B2 (health check 27-11-2026): make the security rules (RLS policies) check
-- "who is this user / what role do they have" ONCE per query instead of once
-- per row. Postgres re-runs user_has_role('admin') etc. for every row it looks
-- at; wrapping the call as (SELECT user_has_role('admin')) lets it work it
-- out once and reuse the answer (Supabase's documented RLS performance fix).
-- users_pkey had 114M index lookups from these checks by 27-11-2026.
--
-- WHO CAN SEE OR CHANGE WHAT DOES NOT CHANGE: each rule below is the live
-- rule exactly as it was (pg_policies, 27-11-2026), with only the helper
-- calls wrapped. Roles, commands and permissive/restrictive are untouched
-- (ALTER POLICY only replaces USING / WITH CHECK).
-- Not wrapped: teacher_teaches_students_home_group(student_id) - it takes
-- the row's student_id, so it genuinely has to run per row.
--
-- 91 of 94 policies are rewritten.
-- Verified with a before/after visible-row comparison for a user of each role
-- (supabase/../scratchpad rls-role-check), run inside the same transaction.
--
-- UNDO: supabase/previous-versions/rls-policies-before-20261127.sql
-- re-applies every rule exactly as it was.

begin;

-- attendance_records / records_admin_manage (ALL, permissive)
ALTER POLICY "records_admin_manage" ON public."attendance_records"
  USING ((SELECT user_has_role('admin'::text)));

-- attendance_records / records_admin_reg (ALL, permissive)
ALTER POLICY "records_admin_reg" ON public."attendance_records"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- attendance_records / records_block_adminview_write (ALL, restrictive)
ALTER POLICY "records_block_adminview_write" ON public."attendance_records"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- attendance_records / records_select (SELECT, permissive)
ALTER POLICY "records_select" ON public."attendance_records"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR ((SELECT user_has_role('teacher'::text)) AND (session_id IN ( SELECT s.id
   FROM attendance_sessions s
  WHERE (s.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid())))))))));

-- attendance_records / records_teacher_manage (ALL, permissive)
ALTER POLICY "records_teacher_manage" ON public."attendance_records"
  USING (((SELECT user_has_role('teacher'::text)) AND (session_id IN ( SELECT s.id
   FROM attendance_sessions s
  WHERE (s.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))))));

-- attendance_sessions / sessions_admin_manage (ALL, permissive)
ALTER POLICY "sessions_admin_manage" ON public."attendance_sessions"
  USING ((SELECT user_has_role('admin'::text)));

-- attendance_sessions / sessions_admin_reg (ALL, permissive)
ALTER POLICY "sessions_admin_reg" ON public."attendance_sessions"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- attendance_sessions / sessions_block_adminview_write (ALL, restrictive)
ALTER POLICY "sessions_block_adminview_write" ON public."attendance_sessions"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- attendance_sessions / sessions_select (SELECT, permissive)
ALTER POLICY "sessions_select" ON public."attendance_sessions"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR ((SELECT user_has_role('teacher'::text)) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid()))
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = (SELECT auth.uid())))))));

-- attendance_sessions / sessions_teacher_insert (INSERT, permissive)
ALTER POLICY "sessions_teacher_insert" ON public."attendance_sessions"
  WITH CHECK (((SELECT user_has_role('teacher'::text)) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid()))
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))));

-- attendance_sessions / sessions_teacher_manage (UPDATE, permissive)
ALTER POLICY "sessions_teacher_manage" ON public."attendance_sessions"
  USING (((SELECT user_has_role('teacher'::text)) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid()))
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))));

-- audit_logs / audit_logs_admin (SELECT, permissive)
ALTER POLICY "audit_logs_admin" ON public."audit_logs"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- audit_logs / audit_logs_admin_select (SELECT, permissive)
ALTER POLICY "audit_logs_admin_select" ON public."audit_logs"
  USING ((SELECT user_has_role('admin'::text)));

-- audit_logs / audit_logs_authenticated_insert (INSERT, permissive)
ALTER POLICY "audit_logs_authenticated_insert" ON public."audit_logs"
  WITH CHECK (((SELECT auth.uid()) = user_id));

-- broadcast_acknowledgments / broadcast_ack_insert (INSERT, permissive)
ALTER POLICY "broadcast_ack_insert" ON public."broadcast_acknowledgments"
  WITH CHECK (((SELECT auth.uid()) = acknowledged_by));

-- broadcast_acknowledgments / broadcast_ack_select (SELECT, permissive)
ALTER POLICY "broadcast_ack_select" ON public."broadcast_acknowledgments"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR (acknowledged_by = (SELECT auth.uid()))));

-- class_types / class_types_admin_manage (ALL, permissive)
ALTER POLICY "class_types_admin_manage" ON public."class_types"
  USING ((SELECT user_has_role('admin'::text)))
  WITH CHECK ((SELECT user_has_role('admin'::text)));

-- class_types / class_types_select (SELECT, permissive)
ALTER POLICY "class_types_select" ON public."class_types"
  USING (((SELECT auth.uid()) IS NOT NULL));

-- groups / groups_block_adminview_write (ALL, restrictive)
ALTER POLICY "groups_block_adminview_write" ON public."groups"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- groups / groups_manage (ALL, permissive)
ALTER POLICY "groups_manage" ON public."groups"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- groups / groups_select (SELECT, permissive)
ALTER POLICY "groups_select" ON public."groups"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR (SELECT user_has_role('teacher'::text))));

-- messages / messages_admin (ALL, permissive)
ALTER POLICY "messages_admin" ON public."messages"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- messages / messages_select (SELECT, permissive)
ALTER POLICY "messages_select" ON public."messages"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- messages / messages_teacher_insert (INSERT, permissive)
ALTER POLICY "messages_teacher_insert" ON public."messages"
  WITH CHECK ((((SELECT current_user_role()) = 'teacher'::text) AND (from_user_id = (SELECT auth.uid()))));

-- messages / messages_teacher_read (SELECT, permissive)
ALTER POLICY "messages_teacher_read" ON public."messages"
  USING ((((SELECT current_user_role()) = 'teacher'::text) AND (from_user_id = (SELECT auth.uid()))));

-- messages / messages_update (UPDATE, permissive)
ALTER POLICY "messages_update" ON public."messages"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- notifications / notifications_delete_own (DELETE, permissive)
ALTER POLICY "notifications_delete_own" ON public."notifications"
  USING ((user_id = (SELECT auth.uid())));

-- notifications / notifications_select_own (SELECT, permissive)
ALTER POLICY "notifications_select_own" ON public."notifications"
  USING ((user_id = (SELECT auth.uid())));

-- notifications / notifications_staff_insert (INSERT, permissive)
ALTER POLICY "notifications_staff_insert" ON public."notifications"
  WITH CHECK (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text, 'teacher'::text])));

-- notifications / notifications_update_own (UPDATE, permissive)
ALTER POLICY "notifications_update_own" ON public."notifications"
  USING ((user_id = (SELECT auth.uid())));

-- parent_applications / parent_apps_adminview (SELECT, permissive)
ALTER POLICY "parent_apps_adminview" ON public."parent_applications"
  USING (((SELECT current_user_role()) = 'adminView'::text));

-- parent_applications / parent_apps_manage (ALL, permissive)
ALTER POLICY "parent_apps_manage" ON public."parent_applications"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- parent_applications / parent_apps_select (SELECT, permissive)
ALTER POLICY "parent_apps_select" ON public."parent_applications"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text))));

-- seva_rota / seva_rota_admin_write (ALL, permissive)
ALTER POLICY "seva_rota_admin_write" ON public."seva_rota"
  USING ((SELECT user_has_role('admin'::text)))
  WITH CHECK ((SELECT user_has_role('admin'::text)));

-- seva_rota / seva_rota_read (SELECT, permissive)
ALTER POLICY "seva_rota_read" ON public."seva_rota"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR (SELECT user_has_role('dashboard'::text))));

-- site_settings / Admin can write settings (ALL, permissive)
ALTER POLICY "Admin can write settings" ON public."site_settings"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = 'admin'::text)))));

-- site_settings / projector_settings_manager_insert (INSERT, permissive)
ALTER POLICY "projector_settings_manager_insert" ON public."site_settings"
  WITH CHECK (((SELECT user_can_manage_projector()) AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))));

-- site_settings / projector_settings_manager_update (UPDATE, permissive)
ALTER POLICY "projector_settings_manager_update" ON public."site_settings"
  USING (((SELECT user_can_manage_projector()) AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))))
  WITH CHECK (((SELECT user_can_manage_projector()) AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))));

-- student_classes / sc_delete (DELETE, permissive)
ALTER POLICY "sc_delete" ON public."student_classes"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- student_classes / sc_insert (INSERT, permissive)
ALTER POLICY "sc_insert" ON public."student_classes"
  WITH CHECK (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- student_classes / sc_select (SELECT, permissive)
ALTER POLICY "sc_select" ON public."student_classes"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = student_classes.group_id) AND (groups.teacher_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = student_classes.group_id) AND (teacher_groups.teacher_id = (SELECT auth.uid()))))) OR teacher_teaches_students_home_group(student_id)));

-- student_notes / notes_admin_reg (ALL, permissive)
ALTER POLICY "notes_admin_reg" ON public."student_notes"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- student_notes / notes_adminview (SELECT, permissive)
ALTER POLICY "notes_adminview" ON public."student_notes"
  USING ((SELECT user_has_role('adminView'::text)));

-- student_notes / notes_teacher_own (ALL, permissive)
ALTER POLICY "notes_teacher_own" ON public."student_notes"
  USING (((SELECT user_has_role('teacher'::text)) AND (student_id IN ( SELECT st.id
   FROM students st
  WHERE (st.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))))));

-- student_notes / student_notes_admin (ALL, permissive)
ALTER POLICY "student_notes_admin" ON public."student_notes"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- student_notes / student_notes_teacher_insert (INSERT, permissive)
ALTER POLICY "student_notes_teacher_insert" ON public."student_notes"
  WITH CHECK ((((SELECT current_user_role()) = 'teacher'::text) AND (teacher_id = (SELECT auth.uid()))));

-- student_notes / student_notes_teacher_read (SELECT, permissive)
ALTER POLICY "student_notes_teacher_read" ON public."student_notes"
  USING ((((SELECT current_user_role()) = 'teacher'::text) AND (teacher_id = (SELECT auth.uid()))));

-- student_notes / student_notes_teacher_update (UPDATE, permissive)
ALTER POLICY "student_notes_teacher_update" ON public."student_notes"
  USING ((((SELECT current_user_role()) = 'teacher'::text) AND (teacher_id = (SELECT auth.uid()))))
  WITH CHECK ((((SELECT current_user_role()) = 'teacher'::text) AND (teacher_id = (SELECT auth.uid())) AND (student_id IN ( SELECT st.id
   FROM students st
  WHERE (st.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))))));

-- student_verifications / verifications_admin_manage (ALL, permissive)
ALTER POLICY "verifications_admin_manage" ON public."student_verifications"
  USING ((SELECT user_has_role('admin'::text)));

-- student_verifications / verifications_select (SELECT, permissive)
ALTER POLICY "verifications_select" ON public."student_verifications"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR ((SELECT user_has_role('teacher'::text)) AND (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid())))))))));

-- student_verifications / verifications_teacher_insert (INSERT, permissive)
ALTER POLICY "verifications_teacher_insert" ON public."student_verifications"
  WITH CHECK ((((SELECT auth.uid()) = verified_by) AND (SELECT user_has_role('teacher'::text)) AND (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = (SELECT auth.uid()))
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))))));

-- students / students_admin_reg (ALL, permissive)
ALTER POLICY "students_admin_reg" ON public."students"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- students / students_adminview (SELECT, permissive)
ALTER POLICY "students_adminview" ON public."students"
  USING (((SELECT current_user_role()) = 'adminView'::text));

-- students / students_block_adminview_write (ALL, restrictive)
ALTER POLICY "students_block_adminview_write" ON public."students"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- students / students_manage (ALL, permissive)
ALTER POLICY "students_manage" ON public."students"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- students / students_select (SELECT, permissive)
ALTER POLICY "students_select" ON public."students"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text))));

-- students / students_select_teacher (SELECT, permissive)
ALTER POLICY "students_select_teacher" ON public."students"
  USING (((SELECT user_has_role('teacher'::text)) AND ((group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid())))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = students.group_id) AND (teacher_groups.teacher_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM (student_classes sc
     JOIN groups g ON ((g.id = sc.group_id)))
  WHERE ((sc.student_id = students.id) AND ((g.teacher_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
           FROM teacher_groups tg
          WHERE ((tg.group_id = g.id) AND (tg.teacher_id = (SELECT auth.uid()))))))))))));

-- students / students_teacher_insert (INSERT, permissive)
ALTER POLICY "students_teacher_insert" ON public."students"
  WITH CHECK (((SELECT user_has_role('teacher'::text)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.can_edit_students = true)))) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid()))
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))));

-- students / students_teacher_update (UPDATE, permissive)
ALTER POLICY "students_teacher_update" ON public."students"
  USING (((SELECT user_has_role('teacher'::text)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.can_edit_students = true)))) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = (SELECT auth.uid()))
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = (SELECT auth.uid()))))));

-- students / teachers_read_group_students (SELECT, permissive)
ALTER POLICY "teachers_read_group_students" ON public."students"
  USING (((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = students.group_id) AND (groups.teacher_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = students.group_id) AND (teacher_groups.teacher_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text, 'adminView'::text])))))));

-- teacher_applications / teacher_apps_adminview (SELECT, permissive)
ALTER POLICY "teacher_apps_adminview" ON public."teacher_applications"
  USING (((SELECT current_user_role()) = 'adminView'::text));

-- teacher_applications / teacher_apps_manage (ALL, permissive)
ALTER POLICY "teacher_apps_manage" ON public."teacher_applications"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- teacher_applications / teacher_apps_select (SELECT, permissive)
ALTER POLICY "teacher_apps_select" ON public."teacher_applications"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text))));

-- teacher_attendance / admin_read_teacher_attendance (SELECT, permissive)
ALTER POLICY "admin_read_teacher_attendance" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text, 'adminView'::text]))))));

-- teacher_attendance / admin_write_teacher_attendance (ALL, permissive)
ALTER POLICY "admin_write_teacher_attendance" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))));

-- teacher_attendance / teacher_att_admin (ALL, permissive)
ALTER POLICY "teacher_att_admin" ON public."teacher_attendance"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- teacher_attendance / teacher_att_teacher_read (SELECT, permissive)
ALTER POLICY "teacher_att_teacher_read" ON public."teacher_attendance"
  USING ((teacher_id = (SELECT auth.uid())));

-- teacher_attendance / teacher_attendance_class_manager (ALL, permissive)
ALTER POLICY "teacher_attendance_class_manager" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (SELECT auth.uid())) AND (teacher_attendance.class_type = ANY (u.register_manager_classes))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (SELECT auth.uid())) AND (teacher_attendance.class_type = ANY (u.register_manager_classes))))));

-- teacher_attendance / teacher_attendance_register_manager (ALL, permissive)
ALTER POLICY "teacher_attendance_register_manager" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.can_manage_teacher_register = true)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.can_manage_teacher_register = true)))));

-- teacher_groups / tg_admin_all (ALL, permissive)
ALTER POLICY "tg_admin_all" ON public."teacher_groups"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))));

-- teacher_groups / tg_teacher_read (SELECT, permissive)
ALTER POLICY "tg_teacher_read" ON public."teacher_groups"
  USING ((teacher_id = (SELECT auth.uid())));

-- transfer_requests / transfer_req_admin (ALL, permissive)
ALTER POLICY "transfer_req_admin" ON public."transfer_requests"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- transfer_requests / transfer_req_block_adminview (ALL, restrictive)
ALTER POLICY "transfer_req_block_adminview" ON public."transfer_requests"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- transfer_requests / transfer_req_teacher_insert (INSERT, permissive)
ALTER POLICY "transfer_req_teacher_insert" ON public."transfer_requests"
  WITH CHECK ((((SELECT current_user_role()) = 'teacher'::text) AND (requested_by = (SELECT auth.uid())) AND ((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = transfer_requests.from_group_id) AND (groups.teacher_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = transfer_requests.from_group_id) AND (teacher_groups.teacher_id = (SELECT auth.uid()))))))));

-- transfer_requests / transfer_req_teacher_read (SELECT, permissive)
ALTER POLICY "transfer_req_teacher_read" ON public."transfer_requests"
  USING ((((SELECT current_user_role()) = 'teacher'::text) AND (requested_by = (SELECT auth.uid()))));

-- transfer_requests / transfers_admin_reg (ALL, permissive)
ALTER POLICY "transfers_admin_reg" ON public."transfer_requests"
  USING (((SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('registrar'::text))));

-- transfer_requests / transfers_adminview (SELECT, permissive)
ALTER POLICY "transfers_adminview" ON public."transfer_requests"
  USING ((SELECT user_has_role('adminView'::text)));

-- users / users_adminview (SELECT, permissive)
ALTER POLICY "users_adminview" ON public."users"
  USING (((SELECT current_user_role()) = 'adminView'::text));

-- users / users_block_adminview_write (ALL, restrictive)
ALTER POLICY "users_block_adminview_write" ON public."users"
  USING (((SELECT current_user_role()) <> 'adminView'::text))
  WITH CHECK (((SELECT current_user_role()) <> 'adminView'::text));

-- users / users_delete_admin (DELETE, permissive)
ALTER POLICY "users_delete_admin" ON public."users"
  USING (((SELECT current_user_role()) = 'admin'::text));

-- users / users_insert_admin (INSERT, permissive)
ALTER POLICY "users_insert_admin" ON public."users"
  WITH CHECK ((SELECT user_has_role('admin'::text)));

-- users / users_read_admin_reg (SELECT, permissive)
ALTER POLICY "users_read_admin_reg" ON public."users"
  USING (((SELECT current_user_role()) = ANY (ARRAY['admin'::text, 'registrar'::text])));

-- users / users_read_own (SELECT, permissive)
ALTER POLICY "users_read_own" ON public."users"
  USING (((SELECT auth.uid()) = id));

-- users / users_select_all (SELECT, permissive)
ALTER POLICY "users_select_all" ON public."users"
  USING ((((SELECT auth.uid()) = id) OR (SELECT user_has_role('admin'::text)) OR (SELECT user_has_role('adminView'::text)) OR (SELECT user_has_role('registrar'::text)) OR (SELECT user_has_role('teacher'::text))));

-- users / users_update_admin (UPDATE, permissive)
ALTER POLICY "users_update_admin" ON public."users"
  USING ((SELECT user_has_role('admin'::text)));

-- users / users_update_own (UPDATE, permissive)
ALTER POLICY "users_update_own" ON public."users"
  USING (((SELECT auth.uid()) = id));

-- users_archive / admin manage users_archive (ALL, permissive)
ALTER POLICY "admin manage users_archive" ON public."users_archive"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (SELECT auth.uid())) AND (users.role = 'admin'::text)))));

-- users_archive / users_archive_admin (ALL, permissive)
ALTER POLICY "users_archive_admin" ON public."users_archive"
  USING (((SELECT current_user_role()) = 'admin'::text));

-- users_archive / users_archive_delete (DELETE, permissive)
ALTER POLICY "users_archive_delete" ON public."users_archive"
  USING ((SELECT user_has_role('admin'::text)));

-- users_archive / users_archive_insert (INSERT, permissive)
ALTER POLICY "users_archive_insert" ON public."users_archive"
  WITH CHECK ((SELECT user_has_role('admin'::text)));

-- users_archive / users_archive_select (SELECT, permissive)
ALTER POLICY "users_archive_select" ON public."users_archive"
  USING ((SELECT user_has_role('admin'::text)));

commit;
