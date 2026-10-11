-- The card game: suits on habits, and the hand a user calls for each week.
-- Additive only, so existing rows stay valid.
--
-- Day cards, weekly hands, chips, the Hall of Hands and the Court are not stored. They are dealt
-- on the device from habit_days with a seeded shuffle, so they can never drift from the check-ins.

-- The part of you a habit builds, which is the suit its days are dealt in:
-- spades = Body, hearts = Heart, diamonds = Craft, clubs = Mind.
-- Null for habits made before suits existed; the app guesses one from the name until it is set.
alter table public.habits
  add column suit text check (suit in ('spades', 'hearts', 'diamonds', 'clubs'));

-- A called hand: on Monday the user names the hand they're going for that week. Making it (or
-- better) by the Sunday night showdown pays the called hand's chips as a bonus. Missing it costs
-- nothing. Calls lock when Monday ends on the device; one call per week, changeable until then.
create table public.hand_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  hand text not null check (hand in (
    'pair', 'two-pair', 'three-of-a-kind', 'straight', 'flush',
    'full-house', 'four-of-a-kind', 'straight-flush', 'royal-flush'
  )),
  called_at timestamptz not null default now(),
  constraint hand_calls_one_per_week unique (owner_id, week_start)
);
alter table public.hand_calls enable row level security;
create policy "owners manage hand calls" on public.hand_calls
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
