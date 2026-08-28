-- Add a last_seen timestamp, separate from last_login.
--
-- last_login only updates when someone actually submits their email/
-- password (see src/hooks/useAuth.jsx login()) - a persisted session
-- being restored on app open/reload never touches it, so it can look
-- stale for someone who logged in once and has stayed signed in since.
--
-- last_seen updates on every app open/reload with a valid session, as
-- well as on a fresh login, giving a genuine "last time this person
-- had the app open" signal alongside the existing "last time they
-- entered credentials" signal.
--
-- No RLS change needed - the existing users_update_own policy
-- (auth.uid() = id) already lets a user update this column on their
-- own row, the same way it already covers last_login today.
--
-- Run manually in the Supabase SQL editor (or via CLI) against the live project.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen timestamptz;
