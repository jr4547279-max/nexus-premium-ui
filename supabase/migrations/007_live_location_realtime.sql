-- Live meetup location updates are consumed by the existing useLiveEvent hook.
-- Keep this migration idempotent so environments that already enabled these
-- tables in the Supabase dashboard are unaffected.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'live_events'
  ) then
    alter publication supabase_realtime add table public.live_events;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'live_locations'
  ) then
    alter publication supabase_realtime add table public.live_locations;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'member_presence'
  ) then
    alter publication supabase_realtime add table public.member_presence;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'event_notifications'
  ) then
    alter publication supabase_realtime add table public.event_notifications;
  end if;
end
$$;
