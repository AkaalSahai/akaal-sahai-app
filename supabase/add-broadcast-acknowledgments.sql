-- Broadcast message read-receipts.
--
-- The teacher broadcast banner previously tracked "dismissed" purely in
-- each browser's localStorage — nobody server-side could tell who had
-- actually seen a message, and a teacher on a different device/browser
-- would see it again regardless of having dismissed it elsewhere.
--
-- This adds a real, server-side acknowledgment record: one row per
-- (broadcast, user) the moment they explicitly tick "I acknowledge" and
-- confirm — append-only, same pattern as audit_logs / student_verifications.
--
-- Depends on the user_has_role() helper function already used by
-- student_verifications (fix-student-verifications.sql) — if that
-- function doesn't exist in this project yet, this migration will error
-- on the policy statements; let me know and we'll add it first.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

CREATE TABLE IF NOT EXISTS broadcast_acknowledgments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id          text NOT NULL,
  acknowledged_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_by_name  text NOT NULL,
  acknowledged_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, acknowledged_by)
);

CREATE INDEX IF NOT EXISTS broadcast_ack_broadcast_id_idx ON broadcast_acknowledgments (broadcast_id);

ALTER TABLE broadcast_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Read: admin/adminView/registrar see everyone's acknowledgments (for the
-- report). A user can also always read their own rows, so the banner can
-- check "have I already acknowledged this one" without needing staff access.
CREATE POLICY "broadcast_ack_select" ON broadcast_acknowledgments FOR SELECT USING (
  user_has_role('admin') OR user_has_role('adminView') OR user_has_role('registrar')
  OR acknowledged_by = auth.uid()
);

-- Insert: anyone authenticated can acknowledge, but only ever as themselves
-- (same forgery protection already applied to audit_logs).
CREATE POLICY "broadcast_ack_insert" ON broadcast_acknowledgments FOR INSERT WITH CHECK (
  auth.uid() = acknowledged_by
);

-- No UPDATE/DELETE policy — append-only, matches audit_logs / student_verifications.
