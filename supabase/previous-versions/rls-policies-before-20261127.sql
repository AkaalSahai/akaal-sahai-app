-- UNDO for faster-rls-role-checks.sql: the live RLS policy expressions as
-- they were on 27-11-2026 (from pg_policies), before the (SELECT ...) wrapping.

begin;

ALTER POLICY "records_admin_manage" ON public."attendance_records"
  USING (user_has_role('admin'::text));

ALTER POLICY "records_admin_reg" ON public."attendance_records"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "records_block_adminview_write" ON public."attendance_records"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "records_select" ON public."attendance_records"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR (user_has_role('teacher'::text) AND (session_id IN ( SELECT s.id
   FROM attendance_sessions s
  WHERE (s.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid()))))))));

ALTER POLICY "records_teacher_manage" ON public."attendance_records"
  USING ((user_has_role('teacher'::text) AND (session_id IN ( SELECT s.id
   FROM attendance_sessions s
  WHERE (s.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid())))))));

ALTER POLICY "sessions_admin_manage" ON public."attendance_sessions"
  USING (user_has_role('admin'::text));

ALTER POLICY "sessions_admin_reg" ON public."attendance_sessions"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "sessions_block_adminview_write" ON public."attendance_sessions"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "sessions_select" ON public."attendance_sessions"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR (user_has_role('teacher'::text) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid())
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = auth.uid()))))));

ALTER POLICY "sessions_teacher_insert" ON public."attendance_sessions"
  WITH CHECK ((user_has_role('teacher'::text) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid())
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = auth.uid())))));

ALTER POLICY "sessions_teacher_manage" ON public."attendance_sessions"
  USING ((user_has_role('teacher'::text) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid())
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = auth.uid())))));

ALTER POLICY "audit_logs_admin" ON public."audit_logs"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "audit_logs_admin_select" ON public."audit_logs"
  USING (user_has_role('admin'::text));

ALTER POLICY "audit_logs_authenticated_insert" ON public."audit_logs"
  WITH CHECK ((auth.uid() = user_id));

ALTER POLICY "broadcast_ack_insert" ON public."broadcast_acknowledgments"
  WITH CHECK ((auth.uid() = acknowledged_by));

ALTER POLICY "broadcast_ack_select" ON public."broadcast_acknowledgments"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR (acknowledged_by = auth.uid())));

ALTER POLICY "class_types_admin_manage" ON public."class_types"
  USING (user_has_role('admin'::text))
  WITH CHECK (user_has_role('admin'::text));

ALTER POLICY "class_types_select" ON public."class_types"
  USING ((auth.uid() IS NOT NULL));

ALTER POLICY "groups_block_adminview_write" ON public."groups"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "groups_manage" ON public."groups"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "groups_select" ON public."groups"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR user_has_role('teacher'::text)));

ALTER POLICY "messages_admin" ON public."messages"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "messages_select" ON public."messages"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "messages_teacher_insert" ON public."messages"
  WITH CHECK (((current_user_role() = 'teacher'::text) AND (from_user_id = auth.uid())));

ALTER POLICY "messages_teacher_read" ON public."messages"
  USING (((current_user_role() = 'teacher'::text) AND (from_user_id = auth.uid())));

ALTER POLICY "messages_update" ON public."messages"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "notifications_delete_own" ON public."notifications"
  USING ((user_id = auth.uid()));

ALTER POLICY "notifications_select_own" ON public."notifications"
  USING ((user_id = auth.uid()));

ALTER POLICY "notifications_staff_insert" ON public."notifications"
  WITH CHECK ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text, 'teacher'::text])));

ALTER POLICY "notifications_update_own" ON public."notifications"
  USING ((user_id = auth.uid()));

ALTER POLICY "parent_apps_adminview" ON public."parent_applications"
  USING ((current_user_role() = 'adminView'::text));

ALTER POLICY "parent_apps_manage" ON public."parent_applications"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "parent_apps_select" ON public."parent_applications"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "seva_rota_admin_write" ON public."seva_rota"
  USING (user_has_role('admin'::text))
  WITH CHECK (user_has_role('admin'::text));

ALTER POLICY "seva_rota_read" ON public."seva_rota"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR user_has_role('dashboard'::text)));

ALTER POLICY "Admin can write settings" ON public."site_settings"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));

ALTER POLICY "projector_settings_manager_insert" ON public."site_settings"
  WITH CHECK ((user_can_manage_projector() AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))));

ALTER POLICY "projector_settings_manager_update" ON public."site_settings"
  USING ((user_can_manage_projector() AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))))
  WITH CHECK ((user_can_manage_projector() AND (key = ANY (ARRAY['projector_dates'::text, 'projector_thought'::text, 'projector_headings'::text, 'projector_images'::text, 'projector_images_per_slide'::text, 'projector_timings'::text]))));

ALTER POLICY "sc_delete" ON public."student_classes"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "sc_insert" ON public."student_classes"
  WITH CHECK ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "sc_select" ON public."student_classes"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = student_classes.group_id) AND (groups.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = student_classes.group_id) AND (teacher_groups.teacher_id = auth.uid())))) OR teacher_teaches_students_home_group(student_id)));

ALTER POLICY "notes_admin_reg" ON public."student_notes"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "notes_adminview" ON public."student_notes"
  USING (user_has_role('adminView'::text));

ALTER POLICY "notes_teacher_own" ON public."student_notes"
  USING ((user_has_role('teacher'::text) AND (student_id IN ( SELECT st.id
   FROM students st
  WHERE (st.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid())))))));

ALTER POLICY "student_notes_admin" ON public."student_notes"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "student_notes_teacher_insert" ON public."student_notes"
  WITH CHECK (((current_user_role() = 'teacher'::text) AND (teacher_id = auth.uid())));

ALTER POLICY "student_notes_teacher_read" ON public."student_notes"
  USING (((current_user_role() = 'teacher'::text) AND (teacher_id = auth.uid())));

ALTER POLICY "student_notes_teacher_update" ON public."student_notes"
  USING (((current_user_role() = 'teacher'::text) AND (teacher_id = auth.uid())))
  WITH CHECK (((current_user_role() = 'teacher'::text) AND (teacher_id = auth.uid()) AND (student_id IN ( SELECT st.id
   FROM students st
  WHERE (st.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid())))))));

ALTER POLICY "verifications_admin_manage" ON public."student_verifications"
  USING (user_has_role('admin'::text));

ALTER POLICY "verifications_select" ON public."student_verifications"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR (user_has_role('teacher'::text) AND (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid()))))))));

ALTER POLICY "verifications_teacher_insert" ON public."student_verifications"
  WITH CHECK (((auth.uid() = verified_by) AND user_has_role('teacher'::text) AND (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.group_id IN ( SELECT groups.id
           FROM groups
          WHERE (groups.teacher_id = auth.uid())
        UNION
         SELECT teacher_groups.group_id
           FROM teacher_groups
          WHERE (teacher_groups.teacher_id = auth.uid())))))));

ALTER POLICY "students_admin_reg" ON public."students"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "students_adminview" ON public."students"
  USING ((current_user_role() = 'adminView'::text));

ALTER POLICY "students_block_adminview_write" ON public."students"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "students_manage" ON public."students"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "students_select" ON public."students"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "students_select_teacher" ON public."students"
  USING ((user_has_role('teacher'::text) AND ((group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = students.group_id) AND (teacher_groups.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (student_classes sc
     JOIN groups g ON ((g.id = sc.group_id)))
  WHERE ((sc.student_id = students.id) AND ((g.teacher_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM teacher_groups tg
          WHERE ((tg.group_id = g.id) AND (tg.teacher_id = auth.uid())))))))))));

ALTER POLICY "students_teacher_insert" ON public."students"
  WITH CHECK ((user_has_role('teacher'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.can_edit_students = true)))) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid())
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = auth.uid())))));

ALTER POLICY "students_teacher_update" ON public."students"
  USING ((user_has_role('teacher'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.can_edit_students = true)))) AND (group_id IN ( SELECT groups.id
   FROM groups
  WHERE (groups.teacher_id = auth.uid())
UNION
 SELECT teacher_groups.group_id
   FROM teacher_groups
  WHERE (teacher_groups.teacher_id = auth.uid())))));

ALTER POLICY "teachers_read_group_students" ON public."students"
  USING (((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = students.group_id) AND (groups.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = students.group_id) AND (teacher_groups.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text, 'adminView'::text])))))));

ALTER POLICY "teacher_apps_adminview" ON public."teacher_applications"
  USING ((current_user_role() = 'adminView'::text));

ALTER POLICY "teacher_apps_manage" ON public."teacher_applications"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "teacher_apps_select" ON public."teacher_applications"
  USING ((user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "admin_read_teacher_attendance" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text, 'adminView'::text]))))));

ALTER POLICY "admin_write_teacher_attendance" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))));

ALTER POLICY "teacher_att_admin" ON public."teacher_attendance"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "teacher_att_teacher_read" ON public."teacher_attendance"
  USING ((teacher_id = auth.uid()));

ALTER POLICY "teacher_attendance_class_manager" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (teacher_attendance.class_type = ANY (u.register_manager_classes))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (teacher_attendance.class_type = ANY (u.register_manager_classes))))));

ALTER POLICY "teacher_attendance_register_manager" ON public."teacher_attendance"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.can_manage_teacher_register = true)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.can_manage_teacher_register = true)))));

ALTER POLICY "tg_admin_all" ON public."teacher_groups"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'registrar'::text]))))));

ALTER POLICY "tg_teacher_read" ON public."teacher_groups"
  USING ((teacher_id = auth.uid()));

ALTER POLICY "transfer_req_admin" ON public."transfer_requests"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "transfer_req_block_adminview" ON public."transfer_requests"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "transfer_req_teacher_insert" ON public."transfer_requests"
  WITH CHECK (((current_user_role() = 'teacher'::text) AND (requested_by = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = transfer_requests.from_group_id) AND (groups.teacher_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM teacher_groups
  WHERE ((teacher_groups.group_id = transfer_requests.from_group_id) AND (teacher_groups.teacher_id = auth.uid())))))));

ALTER POLICY "transfer_req_teacher_read" ON public."transfer_requests"
  USING (((current_user_role() = 'teacher'::text) AND (requested_by = auth.uid())));

ALTER POLICY "transfers_admin_reg" ON public."transfer_requests"
  USING ((user_has_role('admin'::text) OR user_has_role('registrar'::text)));

ALTER POLICY "transfers_adminview" ON public."transfer_requests"
  USING (user_has_role('adminView'::text));

ALTER POLICY "users_adminview" ON public."users"
  USING ((current_user_role() = 'adminView'::text));

ALTER POLICY "users_block_adminview_write" ON public."users"
  USING ((current_user_role() <> 'adminView'::text))
  WITH CHECK ((current_user_role() <> 'adminView'::text));

ALTER POLICY "users_delete_admin" ON public."users"
  USING ((current_user_role() = 'admin'::text));

ALTER POLICY "users_insert_admin" ON public."users"
  WITH CHECK (user_has_role('admin'::text));

ALTER POLICY "users_read_admin_reg" ON public."users"
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'registrar'::text])));

ALTER POLICY "users_read_own" ON public."users"
  USING ((auth.uid() = id));

ALTER POLICY "users_select_all" ON public."users"
  USING (((auth.uid() = id) OR user_has_role('admin'::text) OR user_has_role('adminView'::text) OR user_has_role('registrar'::text) OR user_has_role('teacher'::text)));

ALTER POLICY "users_update_admin" ON public."users"
  USING (user_has_role('admin'::text));

ALTER POLICY "users_update_own" ON public."users"
  USING ((auth.uid() = id));

ALTER POLICY "admin manage users_archive" ON public."users_archive"
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));

ALTER POLICY "users_archive_admin" ON public."users_archive"
  USING ((current_user_role() = 'admin'::text));

ALTER POLICY "users_archive_delete" ON public."users_archive"
  USING (user_has_role('admin'::text));

ALTER POLICY "users_archive_insert" ON public."users_archive"
  WITH CHECK (user_has_role('admin'::text));

ALTER POLICY "users_archive_select" ON public."users_archive"
  USING (user_has_role('admin'::text));

commit;
