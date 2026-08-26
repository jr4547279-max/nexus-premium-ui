ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

DO $$
DECLARE r record; base text; candidate text; suffix integer;
BEGIN
  FOR r IN SELECT id, display_name, email FROM public.profiles WHERE username IS NULL OR btrim(username) = '' ORDER BY created_at, id LOOP
    base := lower(regexp_replace(coalesce(nullif(btrim(r.display_name), ''), split_part(coalesce(r.email, ''), '@', 1), 'user'), '[^a-z0-9]+', '', 'g'));
    IF base = '' THEN base := 'user'; END IF;
    base := left(base, 24); candidate := base; suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username)=lower(candidate) AND p.id<>r.id) LOOP
      suffix := suffix + 1;
      candidate := left(base, greatest(1,24-length(suffix::text)-1)) || '_' || suffix::text;
    END LOOP;
    UPDATE public.profiles SET username=candidate, updated_at=now() WHERE id=r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (lower(username)) WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_public_profile_by_username(p_username text)
RETURNS TABLE (user_id uuid, username text, display_name text, avatar_url text, bio text, favourite_activities text[])
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.favourite_activities
  FROM public.profiles p WHERE p.username IS NOT NULL AND lower(p.username)=lower(trim(p_username)) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profile_by_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_group_member_candidates(p_group_id uuid,p_query text)
RETURNS TABLE (user_id uuid,username text,display_name text,avatar_url text)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT p.id,p.username,p.display_name,p.avatar_url FROM public.profiles p
  WHERE public.is_group_member(p_group_id)
    AND length(trim(coalesce(p_query,''))) >= 2
    AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id=p_group_id AND gm.user_id=p.id)
    AND (lower(coalesce(p.username,'')) LIKE lower(trim(p_query)) || '%' OR lower(coalesce(p.display_name,'')) LIKE lower(trim(p_query)) || '%')
  ORDER BY CASE WHEN lower(coalesce(p.username,''))=lower(trim(p_query)) THEN 0 ELSE 1 END, lower(coalesce(p.username,p.display_name,'')) LIMIT 8;
$$;
GRANT EXECUTE ON FUNCTION public.search_group_member_candidates(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_group_member_by_username(p_group_id uuid,p_username text)
RETURNS TABLE (success boolean,already_member boolean,user_id uuid,error_message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user_id uuid;
BEGIN
  IF NOT public.is_group_owner(p_group_id) THEN RETURN QUERY SELECT false,false,null::uuid,'Only the group owner can add members directly.'::text; RETURN; END IF;
  SELECT p.id INTO v_user_id FROM public.profiles p WHERE lower(p.username)=lower(trim(p_username)) LIMIT 1;
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false,false,null::uuid,'Username not found.'::text; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id=p_group_id AND gm.user_id=v_user_id) THEN RETURN QUERY SELECT true,true,v_user_id,null::text; RETURN; END IF;
  INSERT INTO public.group_members(group_id,user_id,role) VALUES(p_group_id,v_user_id,'member');
  RETURN QUERY SELECT true,false,v_user_id,null::text;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT true,true,v_user_id,null::text;
WHEN OTHERS THEN RETURN QUERY SELECT false,false,v_user_id,SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_group_member_by_username(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_member_profiles(p_group_id uuid)
RETURNS TABLE (user_id uuid,display_name text,avatar_url text,email text)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT p.id,p.display_name,p.avatar_url,p.email FROM public.profiles p JOIN public.group_members gm ON gm.user_id=p.id
  WHERE gm.group_id=p_group_id AND EXISTS (SELECT 1 FROM public.get_my_group_ids() gid WHERE gid=p_group_id);
$$;
GRANT EXECUTE ON FUNCTION public.get_group_member_profiles(uuid) TO authenticated;
