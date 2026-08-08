-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add planning location fields to the groups table
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in your Supabase SQL editor (Project → SQL Editor → New Query).
-- Idempotent: uses ADD COLUMN IF NOT EXISTS so it is safe to run twice.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS planning_location_lat     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS planning_location_lng     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS planning_location_name    TEXT,
  ADD COLUMN IF NOT EXISTS planning_location_address TEXT,
  ADD COLUMN IF NOT EXISTS planning_location_source  TEXT;

-- Optional: index for any future geospatial queries
-- CREATE INDEX IF NOT EXISTS groups_planning_location_idx
--   ON groups (planning_location_lat, planning_location_lng)
--   WHERE planning_location_lat IS NOT NULL;

COMMENT ON COLUMN groups.planning_location_lat     IS 'WGS84 latitude of the group planning location';
COMMENT ON COLUMN groups.planning_location_lng     IS 'WGS84 longitude of the group planning location';
COMMENT ON COLUMN groups.planning_location_name    IS 'Human-readable place name, e.g. Brighton Station';
COMMENT ON COLUMN groups.planning_location_address IS 'Full formatted address string';
COMMENT ON COLUMN groups.planning_location_source  IS 'How the location was set: gps | search | map | saved | system';
