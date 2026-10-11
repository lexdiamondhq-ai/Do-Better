# Do Better data model

Migrations, applied oldest first:

| Migration | Adds |
|---|---|
| [20261010170000_do_better_core_schema.sql](../supabase/migrations/20261010170000_do_better_core_schema.sql) | The four core tables, both views and every RLS policy. |
| [20261010190000_deck_identity_fields.sql](../supabase/migrations/20261010190000_deck_identity_fields.sql) | Card design on `habits` (`color`, `anchor`, `when_where`, `why`, `recipe_key`, `position`) and `north_star` and `onboarded_at` on `profiles`. |
| [20261011120000_suits_and_calls.sql](../supabase/migrations/20261011120000_suits_and_calls.sql) | `habits.suit` and the `hand_calls` table for the card game. |

Written for its own Supabase project, using Dog Better's conventions: `owner_id` on every row, text columns with check constraints instead of enums, and RLS policies keyed on `(select auth.uid())`. Tested on Postgres 16 with a stubbed `auth` schema: check-ins, upserts, both views, and cross-user isolation all behave as described below.

## Tables

| Table | One row per | Serves |
|---|---|---|
| `profiles` | user | Stores the user's timezone so "today" means their local day. Created by a signup trigger, same as Dog Better. |
| `habits` | habit | Floor and Ceiling setup. Labels are required ("1 page" / "20 pages"); numeric targets and a unit are optional. `two_minute_label` holds the tiny version the recovery prompt offers. `identity` holds the optional onboarding line. |
| `habit_days` | habit per day | Daily check-in. `level` is `floor` or `ceiling`. Going from Floor to Ceiling later that day is an upsert on `(habit_id, day)`. |
| `recovery_prompts` | missed day | Never Twice. Records which day was missed, which day the user is asked to keep, when the prompt was shown, and what they tapped (`floor_only`, `two_minute`, `dismissed`, or nothing). |
| `hand_calls` | user per week | The hand a user calls on Monday (`pair` up to `royal-flush`). One per week, keyed on the week's Monday; making it or better by Sunday midnight pays the called hand's chips again. |

## Choices worth knowing

- **A miss is not stored.** A missed day is a day with no check-in once it has ended. The app never writes a "missed" row, so a late sync or a forgotten tap can't leave a fake miss behind. The app detects a miss by finding yesterday empty and then writes a `recovery_prompts` row when it shows the prompt.
- **"Kept the next day" is computed, not stored.** The `never_twice_outcomes` view joins each prompt to the check-in on its recovery day. `recovery_day_kept` is true when that day has a check-in, false once the day has passed without one, and empty while it is still today.
- **`day` is a plain local date.** The app writes the device's calendar date. `profiles.timezone` is used only by the views to work out today.
- **Check-ins can't land on someone else's habit.** `habit_days` and `recovery_prompts` reference `habits (id, owner_id)` together, so the owner on the row must match the habit's owner.
- **The card game is derived, not stored.** Day cards, weekly hands, chips, the Hall of Hands, the Court, card backs and tables are all dealt on the device from `habit_days`, `habits.suit` and `hand_calls`, using a shuffle seeded by the user's id. The same history always deals the same cards on every device, and nothing can drift from the check-ins. Changing a habit's suit re-deals its past days in the new suit. Which unlocked card back and table the user picked is saved on the phone, not in Supabase.
- **`habits.suit` can be empty.** Habits made before suits existed have no suit until the user picks one. Until then the app guesses it from the habit's name and identity.
- **30-day view.** `habit_floor_kept_30d` gives `floor_kept_days` and `days_in_window` for the last 30 days, starting no earlier than the day the habit began. Today counts in the window, so the number can only go up during the day. The day-by-day grid comes from selecting `habit_days` for the same 30 days and treating blanks as misses.

## Answering the validation question

Do users act on the Never Twice prompt, and does acting help?

```sql
select
  count(*)                                            as prompts,
  count(*) filter (where acted)                       as acted_on,
  round(avg(recovery_day_kept::int) filter (where acted), 2)     as kept_rate_when_acted,
  round(avg(recovery_day_kept::int) filter (where not acted), 2) as kept_rate_when_not
from never_twice_outcomes
where recovery_day_kept is not null;
```

## Left out on purpose

- No streak columns. Streaks are what the app is positioned against, and anything streak-like can be derived from `habit_days`.
- No reminder or notification tables yet. Those come with the Never Twice trigger in step 3.
- No tables for cards, hands, chips or unlocks. They are derived, as above.
