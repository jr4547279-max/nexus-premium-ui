-- ============================================================
-- Nexus — Group Messaging Migration
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Core messages table
CREATE TABLE IF NOT EXISTS group_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  message      TEXT        NOT NULL,
  -- message_type drives rendering:
  --   'text'     → normal chat bubble
  --   'system'   → centred event notice (join, create, route, golden window)
  --   'route'    → future: shared route card
  --   'location' → future: shared pin
  --   'poll'     → future: group poll
  --   'image'    → future: photo share
  message_type TEXT        NOT NULL DEFAULT 'text'
                           CHECK (message_type IN ('text','system','route','location','poll','image')),
  -- metadata holds future-ready structured payloads:
  --   reactions  JSONB  e.g. {"❤️": ["user-id-1", ...]}
  --   route_id   TEXT   → links to a generated route
  --   location   JSONB  → {lat, lng, label}
  --   poll       JSONB  → {question, options: [{text, votes: []}]}
  --   event      TEXT   → system event key ('group_created', 'member_joined', etc.)
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Efficient lookup: latest messages per group
CREATE INDEX IF NOT EXISTS group_messages_group_created
  ON group_messages (group_id, created_at ASC);

-- 3. Enable Row Level Security
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS — Group members can read messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'group_messages'
      AND policyname = 'group_members_can_read_messages'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "group_members_can_read_messages"
        ON group_messages
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = group_messages.group_id
              AND gm.user_id  = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;

-- 5. RLS — Group members can send messages (only as themselves)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'group_messages'
      AND policyname = 'group_members_can_send_messages'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "group_members_can_send_messages"
        ON group_messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          user_id = auth.uid()
          AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = group_messages.group_id
              AND gm.user_id  = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;

-- 6. RLS — Users can edit their own messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'group_messages'
      AND policyname = 'users_can_edit_own_messages'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "users_can_edit_own_messages"
        ON group_messages
        FOR UPDATE
        TO authenticated
        USING    (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;
END $$;

-- 7. RLS — Users can delete their own messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'group_messages'
      AND policyname = 'users_can_delete_own_messages'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "users_can_delete_own_messages"
        ON group_messages
        FOR DELETE
        TO authenticated
        USING (user_id = auth.uid())
    $pol$;
  END IF;
END $$;

-- 8. Enable real-time for this table (required for Supabase Realtime)
--    If the publication already includes all tables this is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname   = 'supabase_realtime'
      AND tablename = 'group_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE group_messages;
  END IF;
END $$;

-- Verify:
-- SELECT table_name, column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name = 'group_messages'
-- ORDER  BY ordinal_position;
