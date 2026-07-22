-- Create site_settings table
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read settings" ON site_settings
  FOR SELECT USING (true);

CREATE POLICY "Admin can write settings" ON site_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

INSERT INTO site_settings (key, value) VALUES
  ('phone',            '07471 122007'),
  ('class_schedule',   'Every Friday & Saturday, 6:15PM – 8:30PM'),
  ('dress_code_girls', 'Girls MUST wear Keski/Dastar'),
  ('dress_code_boys',  'Boys MUST wear Patka/Dastar at ALL times'),
  ('website',          'www.karamishersar.com'),
  ('whatsapp_url',     ''),
  ('facebook_url',     ''),
  ('instagram_url',    ''),
  ('youtube_url',      ''),
  ('donate_url',       'https://karamishersar.com/donate')
ON CONFLICT (key) DO NOTHING;
