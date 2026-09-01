-- schema.sql
-- Run this once against the Render Postgres database to create the starting
-- tables. (Instructions for how to run this are in README.md.)

CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  inquiry_type TEXT NOT NULL,        -- 'wedding', 'custom_cake', 'catering', 'event', 'class'
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_date DATE,
  event_location TEXT,
  guest_count INTEGER,
  products_requested TEXT,
  budget_estimate TEXT,
  delivery_or_pickup TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
