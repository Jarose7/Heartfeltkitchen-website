-- seed-menu-items.sql — real menu items + pricing from Becca's email
-- "Website stuff pictures and menu" (2026-09-16).
--
-- Run this manually against the live Render Postgres database, same way
-- as schema-admin.sql: `render psql <db-id>` then `\i seed-menu-items.sql`,
-- or paste it into Render's database Shell tab.
--
-- IMPORTANT: this is a ONE-TIME seed. Running it twice will insert every
-- item twice, since menu_items rows aren't matched on name. Run once, then
-- manage these items going forward through the admin panel (heartfeltkitchen.co/admin).
--
-- Requires schema-menu-shippable.sql to have been run first (adds the
-- "shippable" category used below).
--
-- No photos are attached yet — Becca is still organizing those in a shared
-- folder. Items will show with a plain background until photos are added
-- through the admin panel's menu item photo/crop tool.

-- Menu staples
INSERT INTO menu_items (name, description, price_text, category, sort_order) VALUES
  ('Artisan Sourdough Loaf', NULL, '$12', 'staple', 10),
  ('Sandwich Bread', NULL, '$10', 'staple', 20),
  ('Baguette', NULL, '$10', 'staple', 30),
  ('Bagels', 'Plain, Everything, Cheddar', '$3 each', 'staple', 40),
  ('Cookies', 'Chocolate Chip, Peanut Butter, Triple Chocolate, Oatmeal Butterscotch', '$2 each', 'staple', 50),
  ('Brownies', 'Classic or Frosted', '$4 each', 'staple', 60),
  ('Cupcakes', 'Chocolate always available; other flavors rotate seasonally', '$3 each · 6 for $18 · 12 for $35', 'staple', 70),
  ('Macarons', 'Vanilla always available; other flavors rotate seasonally', '$3 each · 4 for $10', 'staple', 80),
  ('Cinnamon Rolls', NULL, '$4 each', 'staple', 90),
  ('Custom Cakes', 'Final pricing varies by flavor, filling, design, decoration, and complexity — submit an inquiry for a quote.', '6-inch from $65 · 8-inch from $85', 'staple', 100);

-- Seasonal / monthly specials
INSERT INTO menu_items (name, description, price_text, category, sort_order) VALUES
  ('Specialty / Seasonal Sourdough', 'Flavor rotates — ask in store or check back for what''s current.', '$12', 'seasonal', 10),
  ('Seasonal Brownie', 'Current flavor: Salted Caramel', '$4 each', 'seasonal', 20);

-- Shippable / online shop
INSERT INTO menu_items (name, description, price_text, category, sort_order) VALUES
  ('Cookie Box', 'Chocolate Chip, Peanut Butter, Triple Chocolate, or Oatmeal Butterscotch — pick one flavor or assorted.', '6 cookies $20 · 12 cookies $40', 'shippable', 10),
  ('Brownie Box', 'Classic, Salted Caramel, or Nut Brownie — pick one flavor or assorted. Frosted brownies aren''t available for shipping.', '6 brownies $20 · 12 brownies $40', 'shippable', 20);
