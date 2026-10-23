-- Part 1 of 2: one-time correction of past teacher attendance on days the
-- Teacher Register WAS taken. Registrars who also teach weren't listed in the
-- Teacher Register until 23-10-2026, so they were never marked.
--
--   * 25 unmarked days -> Present (Komal Kaur, Sehajpreet Kaur, Abhijit Sihra, Jai Simran Singh)
--   * 2 Absent -> Present (Arshdeep Singh, Damandeep Kaur on 16-10)
--   * Guneet Kaur Attwal 16-10 stays Holiday (decided 23-10-2026)
--
-- Where a teacher/registrar demonstrably did a student register on a Fri/Sat
-- class day - they started it (attendance_sessions.teacher_id) or marked
-- students in it during class hours (activity log, 17:00-21:30 that day) -
-- mark them Present. Late / Holiday marks are left untouched. Every row
-- touched gets a note starting "Corrected 23-10-2026 from student register"
-- and marked_by stays as it was (NULL for new rows), so they're identifiable.
-- Run in Supabase Dashboard -> SQL Editor -> New Query
--
-- Undo:
--   delete from teacher_attendance
--    where notes like 'Corrected 23-10-2026 from student register%' and marked_by is null
--      and session_date not in ('2026-08-07','2026-08-21','2026-08-22','2026-08-28','2026-09-04','2026-09-26','2026-10-02','2026-10-03');
--   update teacher_attendance set status = 'absent', notes = null
--    where session_date = '2026-10-16' and teacher_id in ('a3090ad2-103d-4685-af57-e40d71a6c25c'::uuid, 'e090819f-c35b-4002-a51c-170c39ba093a'::uuid);

begin;

with v(teacher_id, session_date, notes) as (values
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-08-15'::date, 'Corrected 23-10-2026 from student register: took student register for Ardaas Group, Baba Ajit Singh Ji Group, Bhai Dayala Ji, Pangat Group (before activity log started)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-08-15'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group (before activity log started)'),  -- Sehajpreet Kaur,
  ('6c080c75-e218-4dc2-82b0-0ad1a0c8a535'::uuid, '2026-09-05'::date, 'Corrected 23-10-2026 from student register: took student register for Khanda Group, Mata Gujri Ji Group, Sant Jarnail Singh Ji (marked 18:49–19:01)'),  -- Abhijit Sihra,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-05'::date, 'Corrected 23-10-2026 from student register: took student register for Ardaas Group, Bhai Dayala Ji, Bhai Jaita Ji Group, Bhai Mani Singh Ji Group, Chaur Sahib Group, Pangat Group (marked 18:46–19:50)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-05'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Himmat Singh Ji, Mata Sahib Kaur Ji Group (marked 18:45–20:02)'),  -- Sehajpreet Kaur,
  ('6c080c75-e218-4dc2-82b0-0ad1a0c8a535'::uuid, '2026-09-11'::date, 'Corrected 23-10-2026 from student register: took student register for Khanda Group (marked 19:15–19:15)'),  -- Abhijit Sihra,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-11'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Dayala Ji, Mai Bhago Ji Group, Mata Gujri Ji Group (marked 19:09–20:09)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-11'::date, 'Corrected 23-10-2026 from student register: took student register for Baba Karam Singh Ji Group, Mata Sahib Kaur Ji Group, Palki Group (marked 18:48–20:11)'),  -- Sehajpreet Kaur,
  ('6c080c75-e218-4dc2-82b0-0ad1a0c8a535'::uuid, '2026-09-12'::date, 'Corrected 23-10-2026 from student register: took student register for Khanda Group (marked 19:06–19:06)'),  -- Abhijit Sihra,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-12'::date, 'Corrected 23-10-2026 from student register: took student register for Ardaas Group, Bhai Dayala Ji, Khalsa Group, Mai Bhago Ji Group, Palki Group (marked 18:53–20:16)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-12'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group (marked 18:52–18:55)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-18'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Dayala Ji, Panth Group (marked 18:56–19:57)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-18'::date, 'Corrected 23-10-2026 from student register: took student register for Baba Ajit Singh Ji Group, Bhai Daya Singh Ji, Mata Sahib Kaur Ji Group (marked 18:44–19:58)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-19'::date, 'Corrected 23-10-2026 from student register: took student register for Baba Ajit Singh Ji Group, Bhai Dayala Ji (marked 18:52–20:07)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-19'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group (marked 18:45–19:00)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-09-25'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Dayala Ji, Chaur Sahib Group, Khalsa Group (marked 18:56–20:23)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-09-25'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group (marked 18:44–18:46)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-10-09'::date, 'Corrected 23-10-2026 from student register: took student register for Baba Ajit Singh Ji Group, Bhai Daya Singh Ji, Bhai Dayala Ji, Bhai Jaita Ji Group, Panth Group (marked 18:48–20:08)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-10-09'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group, Nishan Sahib Group (marked 18:42–19:51)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-10-10'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Dayala Ji, Mai Bhago Ji Group, Palki Group (marked 18:58–20:11)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-10-10'::date, 'Corrected 23-10-2026 from student register: took student register for Mata Sahib Kaur Ji Group (marked 18:42–18:49)'),  -- Sehajpreet Kaur,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-10-16'::date, 'Corrected 23-10-2026 from student register: took student register for Baba Ajit Singh Ji Group, Baba Banda Singh Bahadur Ji, Bhai Dayala Ji, GCSE Punjabi, Mai Bhago Ji Group, Palki Group, Pangat Group, Panth Group (marked 18:46–20:25)'),  -- Komal Kaur,
  ('f4fd383e-9edc-4ff1-9bc5-af1ae9efb630'::uuid, '2026-10-16'::date, 'Corrected 23-10-2026 from student register: took student register for Khalsa Group, Mata Sahib Kaur Ji Group (marked 18:49–19:12)'),  -- Sehajpreet Kaur,
  ('24707e14-114e-4f3b-82a1-75c97d260f6e'::uuid, '2026-10-17'::date, 'Corrected 23-10-2026 from student register: took student register for Sant Jarnail Singh Ji (marked 19:22–19:23)'),  -- Jai Simran Singh,
  ('9b086050-6eaa-4f90-a325-86066815a963'::uuid, '2026-10-17'::date, 'Corrected 23-10-2026 from student register: took student register for Bhai Dayala Ji, Bhai Himmat Singh Ji, Chaur Sahib Group, Mai Bhago Ji Group, Palki Group (marked 19:35–20:09)')   -- Komal Kaur
)
insert into teacher_attendance (teacher_id, session_date, status, notes)
select teacher_id, session_date, 'present', notes from v
on conflict (teacher_id, session_date) do nothing;

with v(teacher_id, session_date, notes) as (values
  ('a3090ad2-103d-4685-af57-e40d71a6c25c'::uuid, '2026-10-16'::date, 'Corrected 23-10-2026 from student register: took student register for Chaur Sahib Group (marked 20:02–20:03)'),  -- Arshdeep Singh,
  ('e090819f-c35b-4002-a51c-170c39ba093a'::uuid, '2026-10-16'::date, 'Corrected 23-10-2026 from student register: took student register for Sachkhand Group (marked 18:52–18:53)')   -- Damandeep Kaur
)
update teacher_attendance ta
set status = 'present', notes = v.notes
from v
where ta.teacher_id = v.teacher_id and ta.session_date = v.session_date and ta.status = 'absent';

-- Expected: 27
select count(*) as corrected_rows from teacher_attendance
where notes like 'Corrected 23-10-2026 from student register%';

commit;
