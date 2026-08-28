-- Let a teacher specify which group a student should transfer to at
-- submission time (previously only the admin/registrar chose a
-- destination, at approval time, via to_group_id).
--
-- requested_to_group_id / requested_to_group_name mirror the existing
-- from_group_id / from_group_name denormalization pattern already used
-- on this table. to_group_id is left untouched - it still records the
-- actual approved destination, which may differ from what was requested.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS requested_to_group_id uuid REFERENCES groups(id);
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS requested_to_group_name text;
