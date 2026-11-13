CREATE TABLE friend_requests (
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(requester_id, recipient_id),
  CHECK(requester_id <> recipient_id)
);
CREATE INDEX friend_requests_recipient_status ON friend_requests(recipient_id,status,created_at DESC);

CREATE TABLE saved_venues (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  venue_category TEXT,
  venue_photo_url TEXT,
  map_url TEXT,
  venue_lat REAL,
  venue_lng REAL,
  venue_address TEXT,
  venue_rating REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id,circle_id,place_id)
);
CREATE INDEX saved_venues_circle_created ON saved_venues(circle_id,created_at DESC);

CREATE TABLE live_events (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','live','ended','cancelled')),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  golden_window_data_json TEXT NOT NULL DEFAULT '{}',
  stops_json TEXT NOT NULL DEFAULT '[]',
  current_stop_index INTEGER NOT NULL DEFAULT 0,
  host_id TEXT NOT NULL REFERENCES users(id),
  sharing_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sharing_enabled IN (0,1)),
  arrival_radius_metres INTEGER NOT NULL DEFAULT 50 CHECK(arrival_radius_metres BETWEEN 10 AND 500),
  invited_member_ids_json TEXT NOT NULL DEFAULT '[]',
  activated_at TEXT,
  ended_at TEXT,
  cancelled_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(window_end > window_start)
);
CREATE INDEX live_events_circle_window ON live_events(circle_id,window_start DESC);
CREATE INDEX live_events_status_window ON live_events(status,window_start,window_end);

CREATE TABLE live_event_members (
  event_id TEXT NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(event_id,user_id)
);

CREATE TABLE live_locations (
  event_id TEXT NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy REAL,
  heading REAL,
  speed REAL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(event_id,user_id)
);

CREATE TABLE member_presence (
  event_id TEXT NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('travelling','arrived','running_late','offline','left_event')),
  current_stop_index INTEGER,
  distance_metres REAL,
  eta_minutes INTEGER CHECK(eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 1440),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(event_id,user_id)
);

CREATE TABLE event_notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX event_notifications_event_time ON event_notifications(event_id,created_at DESC);
CREATE INDEX event_notifications_target_time ON event_notifications(target_user_id,created_at DESC);

CREATE TABLE social_locations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy REAL,
  heading REAL,
  speed REAL,
  recorded_at TEXT NOT NULL
);
