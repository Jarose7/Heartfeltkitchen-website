-- schema-admin-users.sql — adds multi-user login support to the admin
-- panel (previously a single hardcoded ADMIN_USERNAME/ADMIN_PASSWORD_HASH
-- pair in Render's environment). Run this manually against the live
-- Render Postgres database, same way schema-admin.sql was run:
-- `render psql <db-id>` then `\i schema-admin-users.sql`, or paste it into
-- Render's database Shell tab. This does NOT run automatically on server
-- startup, by design.
--
-- pgcrypto is a standard Postgres extension (not a new database, no
-- external service) that lets a bcrypt hash be computed right inside a
-- SQL statement — see the separate, not-committed-to-git file used to
-- actually add each account, which uses this same crypt()/gen_salt('bf')
-- pattern. Verified compatible with the app's bcryptjs library before
-- shipping this: a pgcrypto-generated hash correctly verifies (and
-- correctly rejects a wrong password) through bcrypt.compare().

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: the original single-account login (ADMIN_USERNAME /
-- ADMIN_PASSWORD_HASH env vars on Render) still works after this runs —
-- admin.js checks this table first, then falls back to those env vars.
-- Nobody's existing login breaks; this only adds the ability for more
-- accounts to exist.
