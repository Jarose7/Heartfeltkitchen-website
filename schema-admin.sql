-- schema-admin.sql — Heartfelt Kitchen & Co. admin panel tables.
-- Run this manually against the live Render Postgres database (same way
-- schema.sql was run): `render psql <db-id>` then `\i schema-admin.sql`,
-- or paste it into Render's database Shell tab.
-- This does NOT run automatically on server startup, by design.

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_text TEXT,
  category TEXT NOT NULL DEFAULT 'staple' CHECK (category IN ('staple', 'seasonal')),
  photo BYTEA,
  photo_mime TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the real values already live on the site, so nothing changes
-- until Becca actually edits something in the admin panel.
INSERT INTO site_content (key, value) VALUES
  ('hours_fri', 'Fri 2–7pm'),
  ('hours_sat', 'Sat 10am–7pm'),
  ('hours_sun', 'Sun 2–7pm'),
  ('phone', '602-341-4511'),
  ('email', 'heartfeltkitchen@gmail.com'),
  ('address', '261 South Ave., Canton, PA 17724'),
  ('instagram_url', 'https://instagram.com/heartfeltkitchen.co')
ON CONFLICT (key) DO NOTHING;

-- Session store table for express-session (connect-pg-simple), so admin
-- logins survive server restarts. Standard fixed schema for that library.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
