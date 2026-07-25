-- Phase 6: Live Event Engine
-- Real-time group events scheduled from Golden Windows.
-- Automatic activation/deactivation via pg_cron + client-side polling.
--
-- Run in Supabase SQL Editor → New query → Run

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.live_events (
  id                  uuid        primary key default gen_random_uuid(),
  group_id            uuid        not null references public.groups(id) on delete cascade,
  title               text        not null default 'Group Meetup'
                                  check (char_length(title) between 1 and 120),
  description         text,
  status              text        not null default 'pending'
                                  check (status in ('pending', 'active', 'completed', 'cancelled')),
  scheduled_start     timestamptz not null,
  scheduled_end       timestamptz not null,
  check (scheduled_end > scheduled_start),
  activated_at        timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  -- Snapshot of the GoldenWindow object that produced this event.
  golden_window_data  jsonb       not null default '{}',
  -- Snapshot of member IDs invited at scheduling time.
  invited_member_ids  uuid[]      not null default '{}',
  created_by          uuid        not null references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists live_events_group_idx    on public.live_events(group_id);
create index if not exists live_events_status_idx   on public.live_events(status);
create index if not exists live_events_schedule_idx on public.live_events(scheduled_start);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RSVPs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.live_event_rsvps (
  event_id      uuid        not null references public.live_events(id) on delete cascade,
  user_id       uuid        not null references auth.users(id)         on delete cascade,
  status        text        not null check (status in ('going', 'maybe', 'not_going')),
  responded_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists live_event_rsvps_event_idx on public.live_event_rsvps(event_id);
create index if not exists live_event_rsvps_user_idx  on public.live_event_rsvps(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists live_events_updated_at on public.live_events;
create trigger live_events_updated_at
  before update on public.live_events
  for each row execute procedure public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.live_events      enable row level security;
alter table public.live_event_rsvps enable row level security;

-- live_events ─────────────────────────────────────────────────────────────────

-- Members can read events for groups they belong to.
create policy "Members can view group live events"
  on public.live_events for select
  using (public.is_group_member(group_id));

-- Inserts go through the schedule_live_event() SECURITY DEFINER RPC.
-- The policy enforces that the row's created_by matches the caller.
create policy "Members can insert live events via RPC"
  on public.live_events for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Direct updates are restricted to group owners; the activation/deactivation
-- RPCs (SECURITY DEFINER) bypass RLS entirely so they always succeed.
create policy "Owners can update group live events"
  on public.live_events for update
  to authenticated
  using (public.is_group_owner(group_id));

-- live_event_rsvps ────────────────────────────────────────────────────────────

-- Group members can see all RSVPs for events in their groups.
create policy "Members can view event RSVPs"
  on public.live_event_rsvps for select
  using (
    exists (
      select 1
        from public.live_events le
        join public.group_members gm on gm.group_id = le.group_id
       where le.id = event_id
         and gm.user_id = auth.uid()
    )
  );

create policy "Users can insert own RSVP"
  on public.live_event_rsvps for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own RSVP"
  on public.live_event_rsvps for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete own RSVP"
  on public.live_event_rsvps for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. schedule_live_event — create an event from a Golden Window
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.schedule_live_event(
  p_group_id           uuid,
  p_scheduled_start    timestamptz,
  p_scheduled_end      timestamptz,
  p_golden_window_data jsonb       default '{}',
  p_title              text        default 'Group Meetup',
  p_description        text        default null,
  p_invited_member_ids uuid[]      default '{}'
)
returns public.live_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_status text;
  v_event  public.live_events;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated'
      using hint = 'User must be signed in to schedule events';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not_a_member'
      using hint = 'Only group members can schedule events';
  end if;

  if p_scheduled_end <= p_scheduled_start then
    raise exception 'invalid_schedule'
      using hint = 'scheduled_end must be after scheduled_start';
  end if;

  -- If the window has already started but not ended, activate immediately.
  v_status := case
    when p_scheduled_start <= now() and p_scheduled_end > now() then 'active'
    else 'pending'
  end;

  insert into public.live_events (
    group_id, title, description, status,
    scheduled_start, scheduled_end,
    activated_at,
    golden_window_data, invited_member_ids,
    created_by
  ) values (
    p_group_id,
    coalesce(nullif(trim(p_title), ''), 'Group Meetup'),
    p_description,
    v_status,
    p_scheduled_start,
    p_scheduled_end,
    case when v_status = 'active' then now() else null end,
    coalesce(p_golden_window_data, '{}'),
    coalesce(p_invited_member_ids, '{}'),
    v_uid
  )
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function public.schedule_live_event(uuid, timestamptz, timestamptz, jsonb, text, text, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. cancel_live_event — event creator or group owner can cancel
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_live_event(p_event_id uuid)
returns public.live_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_event public.live_events;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_event from public.live_events where id = p_event_id for update;

  if not found then
    raise exception 'not_found'
      using hint = 'No live event with that ID';
  end if;

  if v_event.created_by <> v_uid and not public.is_group_owner(v_event.group_id) then
    raise exception 'not_authorized'
      using hint = 'Only the event creator or group owner can cancel this event';
  end if;

  if v_event.status in ('completed', 'cancelled') then
    raise exception 'already_terminal'
      using hint = 'Event is already completed or cancelled';
  end if;

  update public.live_events
     set status = 'cancelled', cancelled_at = now()
   where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

grant execute on function public.cancel_live_event(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. activate_due_live_events — pending → active when window opens
--    Called by pg_cron every minute AND by the client hook on mount.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.activate_due_live_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.live_events
     set status = 'active', activated_at = now()
   where status = 'pending'
     and scheduled_start <= now()
     and scheduled_end   >  now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.activate_due_live_events() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. deactivate_expired_live_events — active → completed when window closes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.deactivate_expired_live_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.live_events
     set status = 'completed', completed_at = now()
   where status = 'active'
     and scheduled_end <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.deactivate_expired_live_events() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. rsvp_to_live_event — upsert an RSVP (group members only)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rsvp_to_live_event(
  p_event_id uuid,
  p_status   text   -- 'going' | 'maybe' | 'not_going'
)
returns public.live_event_rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_gid  uuid;
  v_rsvp public.live_event_rsvps;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_status not in ('going', 'maybe', 'not_going') then
    raise exception 'invalid_status'
      using hint = 'RSVP status must be going, maybe, or not_going';
  end if;

  select group_id into v_gid from public.live_events where id = p_event_id;
  if not found then
    raise exception 'not_found' using hint = 'Event not found';
  end if;

  if not public.is_group_member(v_gid) then
    raise exception 'not_a_member'
      using hint = 'Only group members can RSVP to this event';
  end if;

  insert into public.live_event_rsvps (event_id, user_id, status, responded_at)
  values (p_event_id, v_uid, p_status, now())
  on conflict (event_id, user_id)
  do update set status = excluded.status, responded_at = excluded.responded_at
  returning * into v_rsvp;

  return v_rsvp;
end;
$$;

grant execute on function public.rsvp_to_live_event(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. pg_cron: auto-activate/deactivate every minute
--     Only installs if the pg_cron extension is enabled on this Supabase project.
--     If not present, the client-side polling in useLiveEvent() covers it.
-- ─────────────────────────────────────────────────────────────────────────────

do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select from cron.job where jobname = 'nexus-activate-live-events') then
      perform cron.unschedule('nexus-activate-live-events');
    end if;
    if exists (select from cron.job where jobname = 'nexus-deactivate-live-events') then
      perform cron.unschedule('nexus-deactivate-live-events');
    end if;
    perform cron.schedule(
      'nexus-activate-live-events',
      '* * * * *',
      $cron$ select public.activate_due_live_events() $cron$
    );
    perform cron.schedule(
      'nexus-deactivate-live-events',
      '* * * * *',
      $cron$ select public.deactivate_expired_live_events() $cron$
    );
  end if;
end;
$outer$;
