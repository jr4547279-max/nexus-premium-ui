create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (requester_id <> addressee_id)
);

create unique index if not exists friend_requests_pending_pair_unique
  on public.friend_requests (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status = 'pending';
create index if not exists friend_requests_addressee_status_idx on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_status_idx on public.friend_requests (requester_id, status);
alter table public.friend_requests enable row level security;

drop policy if exists friend_requests_select_own on public.friend_requests;
drop policy if exists friend_requests_insert_own on public.friend_requests;
drop policy if exists friend_requests_update_own on public.friend_requests;

create or replace function public.get_friend_status(p_other_user_id uuid)
returns text language plpgsql security definer set search_path=public stable as $$
declare v_me uuid:=auth.uid(); v_status text; v_requester uuid; v_addressee uuid;
begin
  if v_me is null or p_other_user_id is null then return 'none'; end if;
  if p_other_user_id=v_me then return 'self'; end if;
  select fr.status,fr.requester_id,fr.addressee_id into v_status,v_requester,v_addressee
  from public.friend_requests fr
  where ((fr.requester_id=v_me and fr.addressee_id=p_other_user_id) or (fr.requester_id=p_other_user_id and fr.addressee_id=v_me))
    and fr.status in ('pending','accepted')
  order by case when fr.status='accepted' then 0 else 1 end,fr.updated_at desc limit 1;
  if v_status='accepted' then return 'friends'; end if;
  if v_status='pending' and v_requester=v_me then return 'request_sent'; end if;
  if v_status='pending' and v_addressee=v_me then return 'request_received'; end if;
  return 'none';
end; $$;
grant execute on function public.get_friend_status(uuid) to authenticated;

create or replace function public.send_friend_request(p_addressee_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_existing public.friend_requests%rowtype;
begin
  if v_me is null then return 'unauthenticated'; end if;
  if p_addressee_id is null or p_addressee_id=v_me then return 'invalid_target'; end if;
  if not exists(select 1 from public.profiles where id=p_addressee_id) then return 'user_not_found'; end if;
  select * into v_existing from public.friend_requests
  where ((requester_id=v_me and addressee_id=p_addressee_id) or (requester_id=p_addressee_id and addressee_id=v_me))
    and status in ('pending','accepted') limit 1;
  if v_existing.status='accepted' then return 'already_friends'; end if;
  if v_existing.status='pending' then
    if v_existing.requester_id=v_me then return 'request_sent'; end if;
    return 'request_received';
  end if;
  insert into public.friend_requests(requester_id,addressee_id,status) values(v_me,p_addressee_id,'pending');
  return 'sent';
exception when unique_violation then return 'request_exists';
end; $$;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.accept_friend_request(p_requester_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_updated integer;
begin
  if v_me is null then return false; end if;
  update public.friend_requests set status='accepted',updated_at=now()
  where requester_id=p_requester_id and addressee_id=v_me and status='pending';
  get diagnostics v_updated=row_count; return v_updated=1;
end; $$;
grant execute on function public.accept_friend_request(uuid) to authenticated;

create or replace function public.decline_friend_request(p_requester_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_updated integer;
begin
  if v_me is null then return false; end if;
  update public.friend_requests set status='declined',updated_at=now()
  where requester_id=p_requester_id and addressee_id=v_me and status='pending';
  get diagnostics v_updated=row_count; return v_updated=1;
end; $$;
grant execute on function public.decline_friend_request(uuid) to authenticated;

create or replace function public.cancel_friend_request(p_addressee_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_deleted integer;
begin
  if v_me is null then return false; end if;
  delete from public.friend_requests where requester_id=v_me and addressee_id=p_addressee_id and status='pending';
  get diagnostics v_deleted=row_count; return v_deleted=1;
end; $$;
grant execute on function public.cancel_friend_request(uuid) to authenticated;

create or replace function public.remove_friend(p_other_user_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_me uuid:=auth.uid(); v_deleted integer;
begin
  if v_me is null then return false; end if;
  delete from public.friend_requests
  where ((requester_id=v_me and addressee_id=p_other_user_id) or (requester_id=p_other_user_id and addressee_id=v_me)) and status='accepted';
  get diagnostics v_deleted=row_count; return v_deleted=1;
end; $$;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function public.get_my_friends()
returns table(user_id uuid,display_name text,username text,avatar_url text,bio text,formatted_address text,favourite_activities text[],created_at timestamptz)
language sql security definer set search_path=public stable as $$
  select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.formatted_address,p.favourite_activities,p.created_at
  from public.friend_requests fr join public.profiles p on p.id=case when fr.requester_id=auth.uid() then fr.addressee_id else fr.requester_id end
  where (fr.requester_id=auth.uid() or fr.addressee_id=auth.uid()) and fr.status='accepted'
  order by lower(coalesce(p.display_name,p.username,''));
$$;
grant execute on function public.get_my_friends() to authenticated;

create or replace function public.get_incoming_friend_requests()
returns table(user_id uuid,display_name text,username text,avatar_url text,bio text,formatted_address text,favourite_activities text[],created_at timestamptz,requested_at timestamptz)
language sql security definer set search_path=public stable as $$
  select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.formatted_address,p.favourite_activities,p.created_at,fr.created_at
  from public.friend_requests fr join public.profiles p on p.id=fr.requester_id
  where fr.addressee_id=auth.uid() and fr.status='pending' order by fr.created_at desc;
$$;
grant execute on function public.get_incoming_friend_requests() to authenticated;
