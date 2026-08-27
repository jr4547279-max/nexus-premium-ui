-- ============================================================
-- Nexus — Location + Preferences Migration
-- Run once in Supabase SQL Editor.
-- All statements are safe to re-run.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"theme":"dark","language":"en","notifications":true}'::jsonb;

-- Existing profile RLS policies should continue to protect these columns:
-- users can only read/update their own profile row.

UPDATE profiles
SET preferences = '{"theme":"dark","language":"en","notifications":true}'::jsonb
WHERE preferences IS NULL;
