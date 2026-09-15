-- Seeds the site_settings row the "Require two-factor authentication"
-- toggle in Admin > Settings reads/writes. The app itself treats a
-- missing row the same as an empty one (2FA stays opt-in), so this isn't
-- strictly required before the first save - it's just here for the same
-- reason every other site_settings key is seeded up front, matching the
-- existing verification_required_since/reason convention.
--
-- Run manually in the Supabase SQL editor against the live project.

insert into public.site_settings (key, value) values
  ('mfa_required_since', '')
on conflict (key) do nothing;
