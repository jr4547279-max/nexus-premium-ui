-- Run this once in your Supabase SQL editor:
-- Dashboard → SQL Editor → New query → paste → Run

-- 1. Profiles table
create table if not exists public.profiles (
  id             uuid        references auth.users on delete cascade primary key,
  email          text,
  display_name   text,
  onboarding_completed boolean  default false not null,
  onboarding_answers   jsonb   default '{}'::jsonb not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

-- 2. Row-level security
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Auto-create a profile row the moment someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
