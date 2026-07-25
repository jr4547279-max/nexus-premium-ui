-- =============================================================================
-- Phase 1A: Live Event Engine — Full Schema
-- =============================================================================
--
-- Tables:    live_events, live_locations, member_presence, event_notifications
-- RPCs:      schedule, activate, deactivate, cancel, host actions,
--            location upsert, presence upsert, notification create
-- RLS:       strict row-level security on all tables
-- pg_cron:   automatic state transitions every minute (optional, graceful)
--
-- Run once in Supabase SQL Editor → New query → Run
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  live_events
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.live_events (
  id                    uuid        primary key default gen_random_uuid(),
  group_id              uuid        not null
                                    references public.groups(id) on delete cascade,

  -- Identity
  title                 text        not null default 'Group Meetup'
                                    check (char_length(title) between 1 and 120),
  description           text,

  -- Status machine: pending → live → ended  (cancelled at any point)
  status                text        not null default 'pending'
                                    check (status in ('pending','live','ended','cancelled')),

  -- Golden Window bounds (used for automatic activation / deactivation)
  window_start          timestamptz not null,
  window_end            timestamptz not null,
  check (window_end > window_start),

  -- Full GoldenWindow snapshot at scheduling time
  golden_window_data    jsonb       not null default '{}',

  -- Ordered array of EventStop objects:
  -- [{ id, name, address, latitude, longitude, duration_minutes, notes, order }]
  stops                 jsonb       not null default '[]',
  current_stop_index    integer     not null default 0 check (current_stop_index >= 0),

  -- Host (may differ from creator, e.g. after handoff)
  host_id               uuid        not null references auth.users(id) on delete cascade,

  -- Settings
  sharing_enabled       boolean     not null default true,
  arrival_radius_metres integer     not null default 50 check (arrival_radius_metres > 0),

  -- Invited member snapshot
  invited_member_ids    uuid[]      not null default '{}',

  -- Lifecycle timestamps
  activated_at          timestamptz,
  ended_at              timestamptz,
  cancelled_at          timestamptz,

  -- Audit
  created_by            uuid        not null references auth.users(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists live_events_group_idx      on public.live_events(group_id);
create index if not exists live_events_status_idx     on public.live_events(status);
create index if not exists live_events_window_idx     on public.live_events(window_start, window_end);
create index if not exists live_events_created_by_idx on public.live_events(created_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  live_locations  (one row per update; latest is authoritative)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.live_locations (
  id            uuid            primary key default gen_random_uuid(),
  event_id      uuid            not null
                                references public.live_events(id) on delete cascade,
  user_id       uuid            not null
                                references auth.users(id)         on delete cascade,

  -- GPS data
  latitude      double precision not null,
  longitude     double precision not null,
  accuracy      double precision,           -- metres
  heading       double precision,           -- degrees 0-360, null if stationary
  speed         double precision,           -- m/s, null if unknown

  -- When the device recorded this fix (may differ from created_at)
  recorded_at   timestamptz     not null default now(),
  created_at    timestamptz     not null default now()
);

create index if not exists live_locations_event_idx      on public.live_locations(event_id);
create index if not exists live_locations_event_user_idx on public.live_locations(event_id, user_id);
create index if not exists live_locations_user_idx       on public.live_locations(user_id);
create index if not exists live_locations_recorded_idx   on public.live_locations(event_id, user_id, recorded_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  member_presence  (one row per member per event, upserted on change)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.member_presence (
  event_id           uuid    not null
                             references public.live_events(id) on delete cascade,
  user_id            uuid    not null
                             references auth.users(id)         on delete cascade,
  primary key (event_id, user_id),

  -- Computed status
  status             text    not null default 'travelling'
                             check (status in (
                               'travelling','arrived','running_late','offline','left_event'
                             )),

  -- Which stop this presence record relates to
  current_stop_index integer,

  -- Computed distance to the current stop (metres)
  distance_metres    double precision,

  -- Estimated minutes until arrival (null if arrived or unknown)
  eta_minutes        integer,

  -- Audit
  last_seen_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists member_presence_event_idx  on public.member_presence(event_id);
create index if not exists member_presence_status_idx on public.member_presence(event_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  event_notifications  (append-only log, broadcast to group)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.event_notifications (
  id              uuid    primary key default gen_random_uuid(),
  event_id        uuid    not null
                          references public.live_events(id) on delete cascade,

  -- Notification type
  type            text    not null check (type in (
                    'event_started',
                    'event_ended',
                    'member_arrived',
                    'member_late',
                    'next_stop_soon',
                    'stop_skipped',
                    'stop_delayed',
                    'member_left',
                    'plan_shared'
                  )),

  -- null for system-generated events
  actor_user_id   uuid    references auth.users(id) on delete set null,

  -- null for group-wide notifications
  target_user_id  uuid    references auth.users(id) on delete set null,

  -- Arbitrary additional data (member name, ETA, stop details, etc.)
  payload         jsonb   not null default '{}',

  created_at      timestamptz not null default now()
);

create index if not exists event_notifications_event_idx      on public.event_notifications(event_id);
create index if not exists event_notifications_event_time_idx on public.event_notifications(event_id, created_at desc);
create index if not exists event_notifications_type_idx       on public.event_notifications(event_id, type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  updated_at trigger (live_events + member_presence)
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

drop trigger if exists live_events_set_updated_at on public.live_events;
create trigger live_events_set_updated_at
  before update on public.live_events
  for each row execute procedure public.touch_updated_at();

drop trigger if exists member_presence_set_updated_at on public.member_presence;
create trigger member_presence_set_updated_at
  before update on public.member_presence
  for each row execute procedure public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.live_events          enable row level security;
alter table public.live_locations        enable row level security;
alter table public.member_presence       enable row level security;
alter table public.event_notifications   enable row level security;

-- live_events ──────────────────────────────────────────────────────────────────

create policy "Members can view group live events"
  on public.live_events for select
  using (public.is_group_member(group_id));

-- Inserts go through schedule_live_event() SECURITY DEFINER RPC.
-- Policy enforces created_by = caller as a safety net.
create policy "Members can insert live events via RPC"
  on public.live_events for insert
  to authenticated
  with check (auth.uid() = created_by and public.is_group_member(group_id));

-- Direct updates restricted to group owners; activation RPCs bypass RLS.
create policy "Owners can update live events"
  on public.live_events for update
  to authenticated
  using (public.is_group_owner(group_id));

-- live_locations ───────────────────────────────────────────────────────────────

-- Members can view locations for events in their groups when sharing is enabled.
create policy "Members can view live locations"
  on public.live_locations for select
  using (
    exists (
      select 1
        from public.live_events le
        join public.group_members gm on gm.group_id = le.group_id
       where le.id = event_id
         and le.sharing_enabled = true
         and gm.user_id = auth.uid()
    )
  );

-- Users insert their own location updates.
create policy "Users can insert own location"
  on public.live_locations for insert
  to authenticated
  with check (auth.uid() = user_id);

-- member_presence ──────────────────────────────────────────────────────────────

create policy "Members can view presence"
  on public.member_presence for select
  using (
    exists (
      select 1
        from public.live_events le
        join public.group_members gm on gm.group_id = le.group_id
       where le.id = event_id
         and gm.user_id = auth.uid()
    )
  );

create policy "Users can upsert own presence"
  on public.member_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own presence"
  on public.member_presence for update
  to authenticated
  using (auth.uid() = user_id);

-- event_notifications ──────────────────────────────────────────────────────────

create policy "Members can view event notifications"
  on public.event_notifications for select
  using (
    exists (
      select 1
        from public.live_events le
        join public.group_members gm on gm.group_id = le.group_id
       where le.id = event_id
         and gm.user_id = auth.uid()
    )
  );

-- Notifications are created via SECURITY DEFINER RPCs only.
create policy "Authenticated users can insert notifications via RPC"
  on public.event_notifications for insert
  to authenticated
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  schedule_live_event — create an event from a Golden Window
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.schedule_live_event(
  p_group_id            uuid,
  p_window_start        timestamptz,
  p_window_end          timestamptz,
  p_golden_window_data  jsonb       default '{}',
  p_title               text        default 'Group Meetup',
  p_description         text        default null,
  p_stops               jsonb       default '[]',
  p_invited_member_ids  uuid[]      default '{}',
  p_arrival_radius_m    integer     default 50
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

  if p_window_end <= p_window_start then
    raise exception 'invalid_window'
      using hint = 'window_end must be after window_start';
  end if;

  -- Activate immediately if the window is already open.
  v_status := case
    when p_window_start <= now() and p_window_end > now() then 'live'
    when p_window_end   <= now()                          then 'ended'
    else 'pending'
  end;

  insert into public.live_events (
    group_id, title, description, status,
    window_start, window_end, golden_window_data,
    stops, current_stop_index,
    host_id, sharing_enabled, arrival_radius_metres,
    invited_member_ids,
    activated_at,
    created_by
  ) values (
    p_group_id,
    coalesce(nullif(trim(p_title), ''), 'Group Meetup'),
    p_description,
    v_status,
    p_window_start, p_window_end,
    coalesce(p_golden_window_data, '{}'),
    coalesce(p_stops, '[]'), 0,
    v_uid, true, coalesce(p_arrival_radius_m, 50),
    coalesce(p_invited_member_ids, '{}'),
    case when v_status = 'live' then now() else null end,
    v_uid
  )
  returning * into v_event;

  -- Emit event_started notification if activated immediately.
  if v_event.status = 'live' then
    insert into public.event_notifications (event_id, type, payload)
    values (v_event.id, 'event_started', jsonb_build_object('title', v_event.title));
  end if;

  return v_event;
end;
$$;

grant execute on function public.schedule_live_event(uuid,timestamptz,timestamptz,jsonb,text,text,jsonb,uuid[],integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  activate_due_live_events — pending → live when window opens
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.activate_due_live_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    update public.live_events
       set status       = 'live',
           activated_at = now()
     where status       = 'pending'
       and window_start <= now()
       and window_end   >  now()
    returning id, title
  loop
    insert into public.event_notifications (event_id, type, payload)
    values (v_row.id, 'event_started', jsonb_build_object('title', v_row.title));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.activate_due_live_events() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  deactivate_expired_live_events — live → ended when window closes
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.deactivate_expired_live_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    update public.live_events
       set status   = 'ended',
           ended_at = now()
     where status     = 'live'
       and window_end <= now()
    returning id, title
  loop
    insert into public.event_notifications (event_id, type, payload)
    values (v_row.id, 'event_ended', jsonb_build_object('title', v_row.title));
    -- Mark all non-departed members as offline.
    update public.member_presence
       set status = 'offline'
     where event_id = v_row.id
       and status not in ('left_event');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.deactivate_expired_live_events() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. cancel_live_event — creator or group owner
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.live_events where id = p_event_id for update;
  if not found then
    raise exception 'not_found' using hint = 'No live event with that ID';
  end if;

  if v_event.created_by <> v_uid and not public.is_group_owner(v_event.group_id) then
    raise exception 'not_authorized'
      using hint = 'Only the creator or group owner can cancel this event';
  end if;

  if v_event.status in ('ended', 'cancelled') then
    raise exception 'already_terminal'
      using hint = 'Event is already ended or cancelled';
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
-- 11. upsert_live_location — store a GPS fix; caller must be event member
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_live_location(
  p_event_id    uuid,
  p_latitude    double precision,
  p_longitude   double precision,
  p_accuracy    double precision default null,
  p_heading     double precision default null,
  p_speed       double precision default null,
  p_recorded_at timestamptz      default now()
)
returns public.live_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_gid  uuid;
  v_row  public.live_locations;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select group_id into v_gid
    from public.live_events
   where id = p_event_id and status = 'live' and sharing_enabled = true;

  if not found then
    raise exception 'event_not_found_or_sharing_disabled'
      using hint = 'Event must be live and have sharing enabled';
  end if;

  if not public.is_group_member(v_gid) then
    raise exception 'not_a_member';
  end if;

  insert into public.live_locations
    (event_id, user_id, latitude, longitude, accuracy, heading, speed, recorded_at)
  values
    (p_event_id, v_uid, p_latitude, p_longitude, p_accuracy, p_heading, p_speed,
     coalesce(p_recorded_at, now()))
  returning * into v_row;

  -- Keep last_seen_at current in member_presence.
  update public.member_presence
     set last_seen_at = now()
   where event_id = p_event_id and user_id = v_uid;

  return v_row;
end;
$$;

grant execute on function public.upsert_live_location(uuid,double precision,double precision,double precision,double precision,double precision,timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. upsert_member_presence
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.upsert_member_presence(
  p_event_id           uuid,
  p_status             text,
  p_current_stop_index integer         default null,
  p_distance_metres    double precision default null,
  p_eta_minutes        integer         default null
)
returns public.member_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_gid  uuid;
  v_row  public.member_presence;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_status not in ('travelling','arrived','running_late','offline','left_event') then
    raise exception 'invalid_status'
      using hint = 'Status must be travelling | arrived | running_late | offline | left_event';
  end if;

  select group_id into v_gid from public.live_events where id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
  if not public.is_group_member(v_gid) then raise exception 'not_a_member'; end if;

  insert into public.member_presence
    (event_id, user_id, status, current_stop_index, distance_metres, eta_minutes, last_seen_at)
  values
    (p_event_id, v_uid, p_status, p_current_stop_index, p_distance_metres, p_eta_minutes, now())
  on conflict (event_id, user_id) do update
    set status             = excluded.status,
        current_stop_index = excluded.current_stop_index,
        distance_metres    = excluded.distance_metres,
        eta_minutes        = excluded.eta_minutes,
        last_seen_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.upsert_member_presence(uuid,text,integer,double precision,integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. create_event_notification (SECURITY DEFINER — called from services)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_event_notification(
  p_event_id       uuid,
  p_type           text,
  p_actor_user_id  uuid    default null,
  p_target_user_id uuid    default null,
  p_payload        jsonb   default '{}'
)
returns public.event_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_gid  uuid;
  v_row  public.event_notifications;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select group_id into v_gid from public.live_events where id = p_event_id;
  if not found then raise exception 'event_not_found'; end if;
  if not public.is_group_member(v_gid) then raise exception 'not_a_member'; end if;

  insert into public.event_notifications
    (event_id, type, actor_user_id, target_user_id, payload)
  values
    (p_event_id, p_type, p_actor_user_id, p_target_user_id, coalesce(p_payload, '{}'))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_event_notification(uuid,text,uuid,uuid,jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. HOST ACTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- host_skip_stop — advance to the next stop
create or replace function public.host_skip_stop(p_event_id uuid)
returns public.live_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid;
  v_event      public.live_events;
  v_stop_count integer;
  v_new_idx    integer;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.live_events where id = p_event_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_event.host_id <> v_uid then
    raise exception 'not_host' using hint = 'Only the host can skip stops';
  end if;
  if v_event.status <> 'live' then
    raise exception 'event_not_live';
  end if;

  v_stop_count := jsonb_array_length(v_event.stops);
  if v_stop_count = 0 then
    raise exception 'no_stops' using hint = 'Event has no stops defined';
  end if;

  v_new_idx := least(v_event.current_stop_index + 1, v_stop_count - 1);

  update public.live_events
     set current_stop_index = v_new_idx
   where id = p_event_id
  returning * into v_event;

  insert into public.event_notifications (event_id, type, actor_user_id, payload)
  values (p_event_id, 'stop_skipped',
          v_uid,
          jsonb_build_object('stop_index', v_new_idx, 'stop_name',
            (v_event.stops -> v_new_idx) ->> 'name'));

  return v_event;
end;
$$;

grant execute on function public.host_skip_stop(uuid) to authenticated;

-- host_delay_stop — push the next-stop notification by N minutes
create or replace function public.host_delay_stop(p_event_id uuid, p_delay_minutes integer)
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if p_delay_minutes <= 0 then
    raise exception 'invalid_delay' using hint = 'delay_minutes must be positive';
  end if;

  select * into v_event from public.live_events where id = p_event_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_event.host_id <> v_uid then
    raise exception 'not_host' using hint = 'Only the host can delay stops';
  end if;
  if v_event.status <> 'live' then
    raise exception 'event_not_live';
  end if;

  -- Extend window_end to give members more time at the current stop.
  update public.live_events
     set window_end = window_end + (p_delay_minutes || ' minutes')::interval
   where id = p_event_id
  returning * into v_event;

  insert into public.event_notifications (event_id, type, actor_user_id, payload)
  values (p_event_id, 'stop_delayed', v_uid,
          jsonb_build_object('delay_minutes', p_delay_minutes,
                             'stop_index', v_event.current_stop_index));

  return v_event;
end;
$$;

grant execute on function public.host_delay_stop(uuid, integer) to authenticated;

-- host_end_event — force end before window_end
create or replace function public.host_end_event(p_event_id uuid)
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
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.live_events where id = p_event_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_event.host_id <> v_uid then
    raise exception 'not_host' using hint = 'Only the host can end the event';
  end if;
  if v_event.status in ('ended', 'cancelled') then
    raise exception 'already_terminal';
  end if;

  update public.live_events
     set status = 'ended', ended_at = now()
   where id = p_event_id
  returning * into v_event;

  insert into public.event_notifications (event_id, type, actor_user_id, payload)
  values (p_event_id, 'event_ended', v_uid,
          jsonb_build_object('title', v_event.title));

  update public.member_presence
     set status = 'offline'
   where event_id = p_event_id
     and status not in ('left_event');

  return v_event;
end;
$$;

grant execute on function public.host_end_event(uuid) to authenticated;

-- host_share_plan — broadcast the event plan to all members
create or replace function public.host_share_plan(p_event_id uuid)
returns public.event_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_event public.live_events;
  v_notif public.event_notifications;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_event from public.live_events where id = p_event_id;
  if not found then raise exception 'not_found'; end if;
  if v_event.host_id <> v_uid then
    raise exception 'not_host' using hint = 'Only the host can share the plan';
  end if;

  insert into public.event_notifications (event_id, type, actor_user_id, payload)
  values (p_event_id, 'plan_shared', v_uid,
          jsonb_build_object('title', v_event.title, 'stops', v_event.stops))
  returning * into v_notif;

  return v_notif;
end;
$$;

grant execute on function public.host_share_plan(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. get_latest_locations — one row per user, most recent fix
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_latest_locations(p_event_id uuid)
returns table (
  user_id     uuid,
  latitude    double precision,
  longitude   double precision,
  accuracy    double precision,
  heading     double precision,
  speed       double precision,
  recorded_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct on (ll.user_id)
         ll.user_id, ll.latitude, ll.longitude,
         ll.accuracy, ll.heading, ll.speed, ll.recorded_at
    from public.live_locations ll
    join public.live_events le on le.id = ll.event_id
    join public.group_members gm on gm.group_id = le.group_id
                                and gm.user_id = auth.uid()
   where ll.event_id = p_event_id
     and le.sharing_enabled = true
   order by ll.user_id, ll.recorded_at desc;
$$;

grant execute on function public.get_latest_locations(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. pg_cron — automatic activation / deactivation every minute
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
      'nexus-activate-live-events', '* * * * *',
      $cron$ select public.activate_due_live_events() $cron$
    );
    perform cron.schedule(
      'nexus-deactivate-live-events', '* * * * *',
      $cron$ select public.deactivate_expired_live_events() $cron$
    );
  end if;
end;
$outer$;
