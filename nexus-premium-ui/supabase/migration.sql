-- ============================================================
-- Nexus — Location System Migration
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS latitude           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS formatted_address  TEXT,
  ADD COLUMN IF NOT EXISTS place_id           TEXT,
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- The existing RLS policies on `profiles` already cover these new columns:
--   SELECT: each user can read their own row (auth.uid() = id)
--   UPDATE: each user can update their own row (auth.uid() = id)
-- No new policies are required.

-- Verify:
-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name = 'profiles'
--   AND  column_name IN (
--          'latitude','longitude','formatted_address','place_id','location_updated_at'
--        );
