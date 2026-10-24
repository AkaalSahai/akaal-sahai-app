-- Seva rota for the projector, from "Seva Timetable 2026" (approved 24-10-2026).
--
-- The timetable gives two groups per Friday/Saturday class day (one on the
-- 18th day of each 18-day cycle). Rows point at the app's own groups, so the
-- projector shows the app's current group name and primary teacher. For the
-- Santhiya sub-groups (Group 1-3 on the timetable, one group in the app) and
-- the two inactive groups, the timetable's teacher is stored as an override,
-- matched to their app account. tt_source keeps the timetable's own wording.
--
--   * seva_rota                - one row per group per seva day
--   * get_projector_seva()     - today's groups plus next Fri/Sat (projector
--                                and admin only; null-safe role check)
-- Run in Supabase Dashboard -> SQL Editor -> New Query

begin;

create table public.seva_rota (
  id          uuid primary key default gen_random_uuid(),
  seva_date   date not null,
  position    smallint not null,
  group_id    uuid,            -- app group (no FK: rota history must survive group changes)
  group_label text not null,   -- app group name at the time, used if the group is ever removed
  sub_label   text,            -- e.g. 'Group 2' for Santhiya
  teacher_id  uuid,            -- override for sub-groups / inactive groups
  tt_source   text,            -- the timetable's own wording
  created_at  timestamptz default now(),
  unique (seva_date, position)
);
create index seva_rota_date_idx on public.seva_rota (seva_date);

alter table public.seva_rota enable row level security;
create policy seva_rota_read on public.seva_rota for select
  using (user_has_role('admin') or user_has_role('adminView') or user_has_role('registrar') or user_has_role('dashboard'));
create policy seva_rota_admin_write on public.seva_rota for all
  using (user_has_role('admin')) with check (user_has_role('admin'));

with v(seva_date, position, app_group, sub_label, teacher_name, tt_source) as (values
  ('2026-01-02'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-01-02'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-01-03'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-01-03'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-01-09'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-01-09'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-01-10'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-01-10'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-01-16'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-01-16'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-01-17'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-01-17'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-01-23'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-01-23'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-01-24'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-01-24'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-01-30'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-01-30'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-01-31'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-01-31'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-02-06'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-02-06'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-02-07'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-02-07'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-02-13'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-02-13'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-02-14'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-02-14'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur'),
  ('2026-02-20'::date, 1, 'Bhai Dayala Ji', null, null, 'Bhai Dayala Singh Ji – Komal Kaur'),
  ('2026-02-20'::date, 2, 'Santhiya Girls', 'Group 2', 'Ramnik Kaur Attwal', 'Santhiya Girls Group 2 – Ramnik Kaur'),
  ('2026-02-21'::date, 1, 'Pangat Group', null, null, 'Pangat Group – Mandeep Kaur'),
  ('2026-02-21'::date, 2, 'Santhiya Girls', 'Group 1', 'Guneet Kaur Attwal', 'Santhiya Girls Group 1 – Guneet Kaur'),
  ('2026-02-27'::date, 1, 'Ransingah Group', null, null, 'Ransingha Group – Harbaksh Singh'),
  ('2026-02-27'::date, 2, 'Sant Jarnail Singh Ji', null, null, 'Sant Jarnail Singh Ji – Jai Simran Singh'),
  ('2026-02-28'::date, 1, 'Sachkhand Group', null, null, 'Sachkhand Group – Damandeep Kaur'),
  ('2026-03-06'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-03-06'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-03-07'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-03-07'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-03-13'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-03-13'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-03-14'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-03-14'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-03-20'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-03-20'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-03-21'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-03-21'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-03-27'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-03-27'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-03-28'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-03-28'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-04-03'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-04-03'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-04-04'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-04-04'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-04-10'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-04-10'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-04-11'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-04-11'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-04-17'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-04-17'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-04-18'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-04-18'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur'),
  ('2026-04-24'::date, 1, 'Bhai Dayala Ji', null, null, 'Bhai Dayala Singh Ji – Komal Kaur'),
  ('2026-04-24'::date, 2, 'Santhiya Girls', 'Group 2', 'Ramnik Kaur Attwal', 'Santhiya Girls Group 2 – Ramnik Kaur'),
  ('2026-04-25'::date, 1, 'Pangat Group', null, null, 'Pangat Group – Mandeep Kaur'),
  ('2026-04-25'::date, 2, 'Santhiya Girls', 'Group 1', 'Guneet Kaur Attwal', 'Santhiya Girls Group 1 – Guneet Kaur'),
  ('2026-05-01'::date, 1, 'Ransingah Group', null, null, 'Ransingha Group – Harbaksh Singh'),
  ('2026-05-01'::date, 2, 'Sant Jarnail Singh Ji', null, null, 'Sant Jarnail Singh Ji – Jai Simran Singh'),
  ('2026-05-02'::date, 1, 'Sachkhand Group', null, null, 'Sachkhand Group – Damandeep Kaur'),
  ('2026-05-08'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-05-08'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-05-09'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-05-09'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-05-15'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-05-15'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-05-16'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-05-16'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-05-22'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-05-22'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-05-23'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-05-23'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-05-29'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-05-29'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-05-30'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-05-30'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-06-05'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-06-05'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-06-06'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-06-06'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-06-12'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-06-12'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-06-13'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-06-13'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-06-19'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-06-19'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-06-20'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-06-20'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur'),
  ('2026-06-26'::date, 1, 'Bhai Dayala Ji', null, null, 'Bhai Dayala Singh Ji – Komal Kaur'),
  ('2026-06-26'::date, 2, 'Santhiya Girls', 'Group 2', 'Ramnik Kaur Attwal', 'Santhiya Girls Group 2 – Ramnik Kaur'),
  ('2026-06-27'::date, 1, 'Pangat Group', null, null, 'Pangat Group – Mandeep Kaur'),
  ('2026-06-27'::date, 2, 'Santhiya Girls', 'Group 1', 'Guneet Kaur Attwal', 'Santhiya Girls Group 1 – Guneet Kaur'),
  ('2026-07-03'::date, 1, 'Ransingah Group', null, null, 'Ransingha Group – Harbaksh Singh'),
  ('2026-07-03'::date, 2, 'Sant Jarnail Singh Ji', null, null, 'Sant Jarnail Singh Ji – Jai Simran Singh'),
  ('2026-07-04'::date, 1, 'Sachkhand Group', null, null, 'Sachkhand Group – Damandeep Kaur'),
  ('2026-07-10'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-07-10'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-07-11'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-07-11'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-07-17'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-07-17'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-07-18'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-07-18'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-07-24'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-07-24'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-07-25'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-07-25'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-07-31'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-07-31'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-08-01'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-08-01'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-08-07'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-08-07'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-08-08'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-08-08'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-08-14'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-08-14'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-08-15'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-08-15'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-08-21'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-08-21'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-08-22'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-08-22'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur'),
  ('2026-08-28'::date, 1, 'Bhai Dayala Ji', null, null, 'Bhai Dayala Singh Ji – Komal Kaur'),
  ('2026-08-28'::date, 2, 'Santhiya Girls', 'Group 2', 'Ramnik Kaur Attwal', 'Santhiya Girls Group 2 – Ramnik Kaur'),
  ('2026-08-29'::date, 1, 'Pangat Group', null, null, 'Pangat Group – Mandeep Kaur'),
  ('2026-08-29'::date, 2, 'Santhiya Girls', 'Group 1', 'Guneet Kaur Attwal', 'Santhiya Girls Group 1 – Guneet Kaur'),
  ('2026-09-04'::date, 1, 'Ransingah Group', null, null, 'Ransingha Group – Harbaksh Singh'),
  ('2026-09-04'::date, 2, 'Sant Jarnail Singh Ji', null, null, 'Sant Jarnail Singh Ji – Jai Simran Singh'),
  ('2026-09-05'::date, 1, 'Sachkhand Group', null, null, 'Sachkhand Group – Damandeep Kaur'),
  ('2026-09-11'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-09-11'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-09-12'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-09-12'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-09-18'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-09-18'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-09-19'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-09-19'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-09-25'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-09-25'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-09-26'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-09-26'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-10-02'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-10-02'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-10-03'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-10-03'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-10-09'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-10-09'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-10-10'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-10-10'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-10-16'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-10-16'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-10-17'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-10-17'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-10-23'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-10-23'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-10-24'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-10-24'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur'),
  ('2026-10-30'::date, 1, 'Bhai Dayala Ji', null, null, 'Bhai Dayala Singh Ji – Komal Kaur'),
  ('2026-10-30'::date, 2, 'Santhiya Girls', 'Group 2', 'Ramnik Kaur Attwal', 'Santhiya Girls Group 2 – Ramnik Kaur'),
  ('2026-10-31'::date, 1, 'Pangat Group', null, null, 'Pangat Group – Mandeep Kaur'),
  ('2026-10-31'::date, 2, 'Santhiya Girls', 'Group 1', 'Guneet Kaur Attwal', 'Santhiya Girls Group 1 – Guneet Kaur'),
  ('2026-11-06'::date, 1, 'Ransingah Group', null, null, 'Ransingha Group – Harbaksh Singh'),
  ('2026-11-06'::date, 2, 'Sant Jarnail Singh Ji', null, null, 'Sant Jarnail Singh Ji – Jai Simran Singh'),
  ('2026-11-07'::date, 1, 'Sachkhand Group', null, null, 'Sachkhand Group – Damandeep Kaur'),
  ('2026-11-13'::date, 1, 'Ardaas Group', null, null, 'Ardaas Group – Sandip Kaur'),
  ('2026-11-13'::date, 2, 'Bhai Subheg Singh Ji', null, null, 'Bhai Subheg Singh Ji – Balraj Singh'),
  ('2026-11-14'::date, 1, 'Baba Banda Singh Bahadur Ji', null, null, 'Baba Banda Singh Bahadur – Sukhbir Singh'),
  ('2026-11-14'::date, 2, 'Bhai Dharam Singh Ji', null, null, 'Bhai Dharam Singh Ji – Navdeep Kaur'),
  ('2026-11-20'::date, 1, 'Baba Zorawar Singh Ji', null, null, 'Baba Zorawar Singh Ji – Ekpreet Singh'),
  ('2026-11-20'::date, 2, 'Bhai Himmat Singh Ji', null, null, 'Bhai Himmat Singh Ji Group – Aman Kaur'),
  ('2026-11-21'::date, 1, 'Baba Ajit Singh Ji Group', null, null, 'Baba Ajit Singh Ji – Sharanjit Kaur'),
  ('2026-11-21'::date, 2, 'Nishan Sahib Group', null, null, 'Nishaan Sahib – Jaskirat Singh'),
  ('2026-11-27'::date, 1, 'Palki Group', null, null, 'Palki Group – Navjot Singh'),
  ('2026-11-27'::date, 2, 'Bhai Daya Singh Ji', null, null, 'Bhai Daya Singh Ji – Kiranjeet Kaur'),
  ('2026-11-28'::date, 1, 'Bhai Jaita Ji Group', null, null, 'Bhai Jaita Ji – Abhjot Singh'),
  ('2026-11-28'::date, 2, 'Panth Group', null, null, 'Panth Group – Veerpal Kaur'),
  ('2026-12-04'::date, 1, 'Bhai Mani Singh Ji Group', null, null, 'Bhai Mani Singh Ji – Satkaran Singh'),
  ('2026-12-04'::date, 2, 'Baba Karam Singh Ji Group', null, null, 'Bhai Karam Singh Ji Group – Muskan Kaur'),
  ('2026-12-05'::date, 1, 'Bhai Mokham Singh Ji Group', null, 'Parminder Singh', 'Bhai Mokham Singh Ji – Parminder Singh'),
  ('2026-12-05'::date, 2, 'Chaur Sahib Group', null, null, 'Chaur Sahib Group – Arshdeep Singh'),
  ('2026-12-11'::date, 1, 'Bhai Sahib Singh Ji', null, null, 'Bhai Sahib Singh Ji – Jaskaran Singh'),
  ('2026-12-11'::date, 2, 'Simran', null, null, 'Simran Group – Sundeep Singh'),
  ('2026-12-12'::date, 1, 'Khalsa Group', null, null, 'Khalsa Group – Karamjeet Singh'),
  ('2026-12-12'::date, 2, 'Sikhi Group', null, null, 'Sikhi Group – Manvir Singh'),
  ('2026-12-18'::date, 1, 'Khanda Group', null, null, 'Khanda Group – Abhijit Singh'),
  ('2026-12-18'::date, 2, 'Santhiya Boys', 'Group 3', 'Rajan Singh', 'Santhiya Boys Group 3 – Rajan Singh'),
  ('2026-12-19'::date, 1, 'Mai Bhago Ji Group', null, null, 'Mai Bhago Ji – Ekjot Singh'),
  ('2026-12-19'::date, 2, 'Santhiya Boys', 'Group 2', 'Amanpreet Singh', 'Santhiya Boys Group 2 – Amanpreet Singh'),
  ('2026-12-25'::date, 1, 'Mata Gujri Ji Group', null, null, 'Mata Gujri Ji – Harpreet Singh'),
  ('2026-12-25'::date, 2, 'Santhiya Boys', 'Group 1', 'Tarnvir singh', 'Santhiya Boys Group 1 – Taran Singh'),
  ('2026-12-26'::date, 1, 'Mata Sahib Kaur Ji Group', null, null, 'Mata Sahib Kaur Ji – Sehajpreet Kaur'),
  ('2026-12-26'::date, 2, 'Santhiya Girls', 'Group 3', 'Guneet Kaur Attwal', 'Santhiya Girls Group 3 – Guneet Kaur')
)
insert into public.seva_rota (seva_date, position, group_id, group_label, sub_label, teacher_id, tt_source)
select v.seva_date, v.position, g.id, v.app_group, v.sub_label,
       (select u.id from public.users u where u.name = v.teacher_name),
       v.tt_source
from v left join public.groups g on g.name = v.app_group;

create or replace function public.get_projector_seva()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.get_projector_seva() from public, anon;
grant execute on function public.get_projector_seva() to authenticated;

-- Expected: 203 rows, 0 without an app group, 0 sub-groups/overrides without a teacher
select
  (select count(*) from public.seva_rota) as rows,
  (select count(*) from public.seva_rota where group_id is null) as without_app_group,
  (select count(*) from public.seva_rota r where r.sub_label is not null and r.teacher_id is null) as subgroup_without_teacher;

commit;
