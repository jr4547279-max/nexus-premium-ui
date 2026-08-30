-- Flexible planning intent for future Golden Windows.
-- Intentionally committed for deployment review; DO NOT apply remotely as part of recovery.

create table if not exists public.availability_intent (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  horizon text not null check (horizon in ('this_week','next_week','week_after_next','next_2_4_weeks','flexible')),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.availability_intent enable row level security;

create policy "members can read planning intent"
  on public.availability_intent for select
  using (exists (
    select 1 from public.group_members gm
    where gm.group_id = availability_intent.group_id
      and gm.user_id = auth.uid()
  ));

create policy "members can insert own planning intent"
  on public.availability_intent for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.group_members gm
    where gm.group_id = availability_intent.group_id
      and gm.user_id = auth.uid()
  ));

create policy "members can update own planning intent"
  on public.availability_intent for update
  using (user_id = auth.uid() and exists (
    select 1 from public.group_members gm
    where gm.group_id = availability_intent.group_id
      and gm.user_id = auth.uid()
  ))
  with check (user_id = auth.uid());
