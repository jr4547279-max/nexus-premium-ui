-- ============================================================
-- Nexus Social — Profile Identity Migration
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Add social identity columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username           TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT,
  ADD COLUMN IF NOT EXISTS bio                TEXT,
  ADD COLUMN IF NOT EXISTS favourite_activities TEXT[] DEFAULT '{}';

-- 2. Enforce unique usernames (NULL values are never considered equal,
--    so multiple users can have NULL username without violating uniqueness).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (lower(username))
  WHERE username IS NOT NULL;

-- 3. RLS — Social search: all authenticated users can read any profile.
--    The existing policy only allows users to read their own row; we need
--    a broader read so search and public profile views work.
--    (Safe to run multiple times — IF NOT EXISTS handles re-runs.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'profiles'
      AND policyname = 'authenticated_users_can_read_all_profiles'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "authenticated_users_can_read_all_profiles"
        ON profiles
        FOR SELECT
        TO authenticated
        USING (true)
    $pol$;
  END IF;
END $$;

-- 4. Supabase Storage bucket — run these in the SQL Editor OR create via
--    the Dashboard (Storage → New bucket → "avatars", Public = ON).
--    The INSERT is safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,           -- public so avatar URLs are accessible without a signed URL
  2097152,        -- 2 MB max per upload
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage RLS — authenticated users can upload/update their own avatar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'avatar_upload_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "avatar_upload_own"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'avatar_update_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "avatar_update_own"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'avatar_delete_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "avatar_delete_own"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'avatars'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'avatar_public_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "avatar_public_read"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'avatars')
    $pol$;
  END IF;
END $$;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'profiles'
--   AND column_name IN ('username','avatar_url','bio','favourite_activities');
