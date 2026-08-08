-- ============================================================
-- Nexus — Activity System Migration
-- Run once in the Supabase SQL Editor:
--   Dashboard → SQL Editor → paste → Run
-- ============================================================

-- Add activity_id to the groups table.
-- Stores the registry activity ID (e.g. 'jogging', 'cinema') or
-- 'custom:<label>' for user-typed custom activities.
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS activity_id TEXT;

-- Verify:
-- SELECT id, name, activity_id FROM groups LIMIT 5;
