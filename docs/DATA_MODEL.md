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
| `habits` | habit | Floor and Ceiling setup. Labels are required ("1 page" / "20 pages"); numeric targets and a unit are optional. `two_minute_label` holds the first move the Comeback card offers. `identity` holds the optional onboarding line. `archived_at` is set when the card leaves the deck (see Archived day below). |
| `habit_days` | habit per day | Daily check-in. `level` is `floor` or `ceiling`. Going from Floor to Ceiling later that day is an upsert on `(habit_id, day)`. The app writes today, and yesterday only as a back-fill (below). |
| `recovery_prompts` | missed day | The comeback. Records which day was missed, which day the user is asked to keep, when the prompt was shown, and what they tapped (`floor_only`, `two_minute`, `dismissed`, or nothing). Undoing the check-in that answered it sets `response` and `responded_at` back to empty. |
| `hand_calls` | user per week | The hand a user calls on Monday. One per week, keyed on the week's Monday; making it or better by Sunday midnight pays a bonus, worked out on the device. The check constraint still allows `flush`, which the app no longer offers as a call (Flush became the Suited bonus), so older rows stay valid. |

## Choices worth knowing

- **A miss is not stored.** A missed day is a day with no check-in once it has ended. The app never writes a "missed" row, so a late sync or a forgotten tap can't leave a fake miss behind. The app detects a miss by finding yesterday empty and then writes a `recovery_prompts` row when it shows the prompt. If yesterday is then logged late, the app deletes that row, because the day was not missed after all.
- **Back-fill is yesterday only.** A card can get a check-in for yesterday, once, while yesterday's week is still being played (so never Sunday from Monday), for a habit that had started by then and is not archived, and only if yesterday has no check-in yet. It is an insert like any other `habit_days` row and it counts as a kept day. Its `logged_at` holds the local day it was logged on, as midnight UTC like `archived_at` (a check-in made on its own day holds the real moment), so every device can tell it was logged late whatever time zone it is in. The game uses that so a back-fill never moves a Joker: a day logged late counts toward a face card from the day it was logged, and never takes a Joker itself. Only the phone that logged it can take it back, and only that same day, so a day kept yesterday can never be cleared and logged again at a higher level.
- **"Kept the next day" is computed, not stored.** The `never_twice_outcomes` view joins each prompt to the check-in on its recovery day. `recovery_day_kept` is true when that day has a check-in, false once the day has passed without one, and empty while it is still today.
- **Some names are older than the app's words.** `two_minute_label`, the `two_minute` response and the `never_twice_outcomes` view keep the names they were made with, so migrations that have already run stay valid. On screen they are the first move and the comeback.
- **`day` is a plain local date.** The app writes the device's calendar date. `profiles.timezone` is used only by the views to work out today.
- **Check-ins can't land on someone else's habit.** `habit_days` and `recovery_prompts` reference `habits (id, owner_id)` together, so the owner on the row must match the habit's owner.
- **The card game is derived, not stored.** Day cards, weekly hands, chips, the Hall of Hands, the Court, card backs and tables are all dealt on the device from `habit_days`, `habits.suit` and `hand_calls`, using a shuffle seeded by the user's id. The same history always deals the same cards on every device, and nothing can drift from the check-ins. Because past days are dealt in their habit's current suit, the app stops a suit from changing once a day before today has been kept with it, so old hands never change. Which unlocked card back and table each player picked is saved on the phone, not in Supabase.
- **Saved days have no row.** A blank day followed by a kept day in the same week is dealt a card when the week is dealt. Nothing is written for it, and it carries no suit: it counts for pairs and straights, never for Suited, and never as a kept day or in the Court. Logging the day late (back-fill) replaces the saved card with the day's own card.
- **The warm-up week is derived too.** When a player's first week has fewer than five playable days, its days still deal cards and count as kept days, but it has no Showdown and no call, so no `hand_calls` row is expected for it.
- **Archived day.** `archived_at` is a `timestamptz`, but the app writes the user's local day of archiving as midnight UTC (`2026-10-12T00:00:00.000Z` means the card left the deck on 12 October, wherever the user is). The card stops counting from that day. Rows archived before this rule hold the real moment and are read in the profile's timezone. Bringing a card back on the day it was archived clears `archived_at`; on a later day it starts a new card from the same design, so its old days stay where they were.
- **Check-ins are read in pages.** Supabase returns at most 1,000 rows per select, so `habit_days` is fetched in pages ordered by `day` and then `habit_id`. That order has no ties, so no row is skipped or read twice.
- **The phone keeps a copy of the rows.** To open straight onto the deck, the app saves each player's rows (profile, habits, check-ins, prompts and calls) in AsyncStorage under `do-better:rows:v1:<player>`, then refreshes them from Supabase. Only rows are kept, never cards, hands or chips, and only as the server holds them: a check-in still saving is left out, so a swipe that never reached Supabase can't open as kept. Signing out clears every copy. Preferences that live only on the phone (reminder times, haptics, one-time hints, review asks, the last Showdown seen) are kept separately under `do-better:prefs:v1`.
- **Delete my deck uses the owner deletes RLS already allows.** It deletes the user's `habits` (their `habit_days` and `recovery_prompts` go with them by cascade) and `hand_calls`, and sets `north_star` and `onboarded_at` back to empty, so the account starts again at onboarding. The `profiles` row and the auth user stay.
- **`habits.suit` can be empty.** Habits made before suits existed have no suit until the user next saves the card. Until then the app guesses it from the habit's name and identity, and the user can pick a different one that one time.
- **30-day view.** `habit_floor_kept_30d` gives `floor_kept_days` and `days_in_window` for the last 30 days, starting no earlier than the day the habit began. Today counts in the window, so the number can only go up during the day. The day-by-day grid comes from selecting `habit_days` for the same 30 days and treating blanks as misses.

## Answering the validation question

Do users act on the comeback prompt, and does acting help?

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

- No streak columns, and no streaks anywhere in the app. It counts kept days, which only add up. Streaks are what the app is positioned against.
- No reminder or notification tables. Reminder times are a preference kept on the phone.
- No tables for cards, hands, chips or unlocks, and no flags for saved days, back-fills or warm-up weeks. They are derived, as above (a back-fill from its `logged_at`).
