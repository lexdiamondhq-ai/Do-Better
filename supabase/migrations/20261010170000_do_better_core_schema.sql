-- Do Better core schema: habits with a Floor and a Ceiling, one check-in row per habit per day,
-- and Never Twice recovery prompts. Written for a fresh Supabase project, following the Dog Better
-- conventions (owner_id on every row, text + check enums, RLS keyed on (select auth.uid())).
--
-- A "day" is the user's local calendar date. The app computes it from the device clock and writes
-- it as a plain date; profiles.timezone lets the views agree on what "today" is.
-- A missed day is the absence of a Floor or Ceiling row once that day has ended. Nothing is
-- written for a miss, so the data never claims a miss the user did not have.

create schema if not exists private;

-- Profiles ------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "users read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Habits --------------------------------------------------------------------------------------
-- floor_label and ceiling_label are what the user sees ("1 page", "30 minutes").
-- The numeric targets are optional; a habit like "meditate" may only ever have labels.
-- two_minute_label is the tiny version offered by the Never Twice prompt.

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  identity text,
  floor_label text not null check (length(trim(floor_label)) > 0),
  ceiling_label text not null check (length(trim(ceiling_label)) > 0),
  two_minute_label text,
  unit text,
  floor_target numeric check (floor_target > 0),
  ceiling_target numeric check (ceiling_target > 0),
  started_on date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint habits_floor_not_above_ceiling
    check (floor_target is null or ceiling_target is null or floor_target <= ceiling_target),
  constraint habits_id_owner_key unique (id, owner_id)
);
create index habits_owner_idx on public.habits (owner_id) where archived_at is null;
alter table public.habits enable row level security;
create policy "owners manage habits" on public.habits
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Daily check-ins -----------------------------------------------------------------------------
-- One row per habit per day. Upgrading a Floor to a Ceiling later the same day is an upsert on
-- (habit_id, day). The composite foreign key keeps a check-in on a habit its owner owns.

create table public.habit_days (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  level text not null check (level in ('floor', 'ceiling')),
  amount numeric check (amount >= 0),
  note text,
  logged_at timestamptz not null default now(),
  constraint habit_days_habit_owner_fkey
    foreign key (habit_id, owner_id) references public.habits (id, owner_id) on delete cascade,
  constraint habit_days_one_per_day unique (habit_id, day)
);
create index habit_days_owner_day_idx on public.habit_days (owner_id, day desc);
alter table public.habit_days enable row level security;
create policy "owners manage habit days" on public.habit_days
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Never Twice recovery prompts ----------------------------------------------------------------
-- Written when the app shows the prompt for a missed day. recovery_day is the day the user is
-- being asked to keep (normally missed_day + 1, later if they were away).
-- response stays null until the user taps something; null after recovery_day means ignored.
-- Whether the recovery day was kept is not stored: it is read from habit_days in the view below,
-- so it can never drift from the check-ins.

create table public.recovery_prompts (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  missed_day date not null,
  recovery_day date not null,
  shown_at timestamptz not null default now(),
  response text check (response in ('floor_only', 'two_minute', 'dismissed')),
  responded_at timestamptz,
  constraint recovery_prompts_habit_owner_fkey
    foreign key (habit_id, owner_id) references public.habits (id, owner_id) on delete cascade,
  constraint recovery_prompts_one_per_miss unique (habit_id, missed_day),
  constraint recovery_prompts_recovery_after_miss check (recovery_day > missed_day),
  constraint recovery_prompts_response_time check ((response is null) = (responded_at is null))
);
create index recovery_prompts_owner_idx on public.recovery_prompts (owner_id, recovery_day desc);
alter table public.recovery_prompts enable row level security;
create policy "owners manage recovery prompts" on public.recovery_prompts
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Views ---------------------------------------------------------------------------------------
-- security_invoker makes each view run under the caller's RLS, so users only see their own rows.

create view public.never_twice_outcomes
with (security_invoker = true) as
select
  rp.id,
  rp.habit_id,
  rp.owner_id,
  rp.missed_day,
  rp.recovery_day,
  rp.shown_at,
  rp.response,
  rp.responded_at,
  coalesce(rp.response in ('floor_only', 'two_minute'), false) as acted,
  hd.level as recovery_level,
  case
    when hd.id is not null then true
    when rp.recovery_day < (now() at time zone coalesce(p.timezone, 'UTC'))::date then false
    else null
  end as recovery_day_kept
from public.recovery_prompts rp
left join public.habit_days hd on hd.habit_id = rp.habit_id and hd.day = rp.recovery_day
left join public.profiles p on p.id = rp.owner_id;

-- Rolling 30 days ending today, clipped to the day the habit started.
-- Today counts in days_in_window, so "kept" can rise during the day but a miss only shows tomorrow.
create view public.habit_floor_kept_30d
with (security_invoker = true) as
with bounds as (
  select
    h.id as habit_id,
    h.owner_id,
    (now() at time zone coalesce(p.timezone, 'UTC'))::date as today,
    greatest(h.started_on, (now() at time zone coalesce(p.timezone, 'UTC'))::date - 29) as window_start
  from public.habits h
  left join public.profiles p on p.id = h.owner_id
  where h.archived_at is null
)
select
  b.habit_id,
  b.owner_id,
  b.window_start,
  b.today,
  greatest(b.today - b.window_start + 1, 0) as days_in_window,
  count(hd.id) as floor_kept_days,
  count(hd.id) filter (where hd.level = 'ceiling') as ceiling_days
from bounds b
left join public.habit_days hd
  on hd.habit_id = b.habit_id and hd.day between b.window_start and b.today
group by b.habit_id, b.owner_id, b.window_start, b.today;
