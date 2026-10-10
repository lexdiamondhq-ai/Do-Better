# Do Better

Most habit apps reward streaks, and streaks break. Do Better tracks a non-negotiable minimum so one bad day doesn't end the habit.

- **Floor and Ceiling.** Every habit has an ideal daily target (the Ceiling) and an emergency minimum (the Floor). Hitting the Floor counts as a kept day.
- **Never Twice.** After a missed day the app offers a small recovery action, such as doing only the Floor or a 2-minute version, and tracks whether the next day was kept.
- **30 days.** A simple view of how many of the last 30 days hit at least the Floor.

## Running it

1. Create a Supabase project and apply `supabase/migrations` (`supabase link` then `supabase db push`).
2. Copy `.env.example` to `.env` and fill in the project URL and publishable key.
3. `npm install`, then `npx expo start` or `npx expo run:ios`.
4. For store builds, run `eas init` once to attach an EAS project.
