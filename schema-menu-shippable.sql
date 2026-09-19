-- schema-menu-shippable.sql — adds "shippable" as a third allowed
-- menu_items category, alongside the existing "staple" and "seasonal".
-- Run this manually against the live Render Postgres database, same way
-- as schema-admin.sql: `render psql <db-id>` then `\i schema-menu-shippable.sql`,
-- or paste it into Render's database Shell tab. Purely additive — existing
-- rows/values are untouched, this only widens what's allowed going forward.

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_category_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_check
  CHECK (category IN ('staple', 'seasonal', 'shippable'));
