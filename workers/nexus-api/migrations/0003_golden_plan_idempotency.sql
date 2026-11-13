ALTER TABLE plans ADD COLUMN golden_window_key TEXT;
CREATE UNIQUE INDEX plans_golden_window_key
  ON plans(circle_id, golden_window_key)
  WHERE golden_window_key IS NOT NULL;
