-- Circle availability is expressed in one shared IANA timezone. Existing
-- Circles keep the product's UK default; new Circles save their creator's zone.
ALTER TABLE circles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/London';

-- Preserve existing rows while allowing a window to end after midnight.
-- The previous table-level CHECK required start_time < end_time, so rebuilding
-- is necessary; old rows migrate as same-day windows (offset 0).
CREATE TABLE availability_next (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_day_offset INTEGER NOT NULL DEFAULT 0 CHECK (end_day_offset IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((end_day_offset = 0 AND start_time < end_time) OR
         (end_day_offset = 1 AND end_time < start_time))
);
INSERT INTO availability_next(id,circle_id,user_id,day_of_week,start_time,end_time,end_day_offset,updated_at)
  SELECT id,circle_id,user_id,day_of_week,start_time,end_time,0,updated_at FROM availability;
DROP TABLE availability;
ALTER TABLE availability_next RENAME TO availability;
CREATE INDEX availability_circle_day ON availability(circle_id, day_of_week, start_time);
CREATE INDEX availability_user_circle ON availability(user_id, circle_id);
