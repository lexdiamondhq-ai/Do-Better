-- The Deck: the fields the app needs for card colours, habit design and identity.
-- All additive and nullable, so existing rows stay valid.
--
-- Achievements, identity votes and recommendations are not stored. They are derived from
-- habit_days on the device, the same way misses are, so they can never drift from the check-ins.

alter table public.habits
  add column color text not null default 'tomato'
    check (color in ('tomato', 'pine', 'lilac', 'sun', 'sky', 'rose')),
  -- Habit stacking: the existing habit this one follows ("After I pour my coffee").
  add column anchor text,
  -- Implementation intention: when and where ("7 am, kitchen table").
  add column when_where text,
  -- Why this habit matters to the user, shown on the card's back.
  add column why text,
  -- The Playbook recipe the card was made from, if any.
  add column recipe_key text,
  -- Order in the deck. Lower comes first.
  add column position integer not null default 0;

alter table public.profiles
  -- "Who I'm becoming": the one sentence the user writes for themselves.
  add column north_star text,
  add column onboarded_at timestamptz;
