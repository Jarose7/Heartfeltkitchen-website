-- schema-classes.sql — adds a real, admin-maintained class calendar.
-- Run this manually against the live Render Postgres database, same way
-- the other schema-*.sql files were run: `render psql <db-id>` then
-- `\i schema-classes.sql`, or paste into Render's database Shell tab.
-- Does NOT run automatically on server startup, by design.
--
-- Two tables:
--
-- class_presets — reusable "class types" Becca teaches over and over
-- (Foundations of Pastry, Sourdough & Lamination, etc.). Managed from the
-- admin panel's Classes > Presets section. These exist purely so Becca
-- doesn't have to retype the same title/description/price/photo every
-- time she schedules another date for a class she already runs.
--
-- class_events — the actual calendar entries visitors see on /classes.
-- Each event optionally points back at the preset it was created from
-- (preset_id), but carries its OWN copy of category/title/description/
-- price_text/photo rather than always joining to the preset live. That's
-- intentional: if Becca edits or deletes a preset later, past and already-
-- scheduled events shouldn't silently change — same "snapshot, not a
-- live reference" approach already used for menu item photos. Events not
-- based on any preset at all (a one-off private class, say) just leave
-- preset_id NULL and fill in every field directly.

CREATE TABLE IF NOT EXISTS class_presets (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL UNIQUE,
  description TEXT,
  price_text TEXT,
  photo BYTEA,
  photo_mime TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_events (
  id SERIAL PRIMARY KEY,
  preset_id INTEGER REFERENCES class_presets(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_text TEXT,
  photo BYTEA,
  photo_mime TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_events_date ON class_events(event_date);

-- Seed the 4 presets already shown on the old static Classes page, so
-- nothing has to be retyped — Becca can start scheduling real dates for
-- these immediately. Safe to run more than once (ON CONFLICT on the
-- unique title does nothing the second time).
INSERT INTO class_presets (category, title, description, sort_order) VALUES
  ('Baking', 'Foundations of Pastry', 'Hands-on, in the Canton kitchen', 10),
  ('Bread', 'Sourdough & Lamination', 'Hands-on, in the Canton kitchen', 20),
  ('Chocolate', 'Chocolate Work & Decorating', 'Hands-on, in the Canton kitchen', 30),
  ('Global', 'Pasta & Sushi', 'Hands-on, in the Canton kitchen', 40)
ON CONFLICT (title) DO NOTHING;
