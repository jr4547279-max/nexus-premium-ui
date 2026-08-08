-- ─────────────────────────────────────────────────────────────────────────────
-- Nexus Location Intelligence — groups table extension
-- Run AFTER group_planning_location.sql (which adds the base 5 columns).
-- Safe to run multiple times — all statements use ADD COLUMN IF NOT EXISTS.
-- Does not modify or destroy existing data.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE groups
  -- Computed venue-search radius in metres.
  -- Values: 800 (urban-core) | 2000 (suburban) | 3500 (town) | 8000 (rural)
  ADD COLUMN IF NOT EXISTS planning_radius_metres  INTEGER,

  -- Area density class derived from Nominatim address hierarchy.
  -- Values: 'urban-core' | 'suburban' | 'town' | 'rural'
  ADD COLUMN IF NOT EXISTS planning_area_type      TEXT,

  -- Fine-grained area name (suburb, neighbourhood, quarter).
  -- e.g. 'Soho', 'Kemptown', 'Northern Quarter'
  ADD COLUMN IF NOT EXISTS planning_neighborhood   TEXT,

  -- Settlement name (city or town).
  -- e.g. 'London', 'Brighton', 'Manchester'
  ADD COLUMN IF NOT EXISTS planning_city           TEXT;

-- Optional: index for analytics queries grouping by area type.
-- Uncomment if you run queries like GROUP BY planning_area_type.
-- CREATE INDEX IF NOT EXISTS groups_planning_area_type_idx
--   ON groups (planning_area_type)
--   WHERE planning_area_type IS NOT NULL;
