-- schema-homepage-photos.sql — adds admin-editable homepage photos
-- (category cards, pricing tiers, garden section). These used to be
-- hardcoded file paths in public/index.html; each now optionally has a
-- row here instead. Run this manually against the live Render Postgres
-- database, same way the other schema-*.sql files were run. Does NOT run
-- automatically on server startup, by design.
--
-- A slot with no row here (or a row with photo IS NULL) just keeps
-- showing its original hardcoded photo — see HOMEPAGE_PHOTO_SLOTS in
-- lib/render.js for the fallback path per slot. Nothing on the live site
-- changes until a photo is actually uploaded through the admin panel.

CREATE TABLE IF NOT EXISTS homepage_photos (
  slug TEXT PRIMARY KEY,
  photo BYTEA,
  photo_mime TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
