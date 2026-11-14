-- A saved empty schedule is different from a member who has not submitted.
CREATE TABLE circle_availability_submissions (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(circle_id, user_id)
);

-- Preserve historical intent for members who already have saved time rows.
INSERT INTO circle_availability_submissions(circle_id,user_id,submitted_at)
  SELECT circle_id,user_id,MAX(updated_at) FROM availability GROUP BY circle_id,user_id;
