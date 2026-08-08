-- Golden Window persistence columns for the groups table.
-- Run this in your Supabase SQL editor (safe to run multiple times).
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS golden_window_data         JSONB,
  ADD COLUMN IF NOT EXISTS golden_window_computed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS golden_window_stale        BOOLEAN NOT NULL DEFAULT false;
