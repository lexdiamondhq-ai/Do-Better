# Do Better

Native iOS habit app (Expo SDK 57, Expo Router, React Native New Architecture, React Compiler). Each habit has a Floor (the emergency minimum that still counts as a kept day) and a Ceiling (the ideal). Never Twice offers a small recovery action after a missed day.
Backend is Supabase (Postgres with RLS, Auth). Setup mirrors Dog Better.

## Layout

- `src/app/` routes (Expo Router). `(auth)` sign-in, `(app)` signed-in screens.
- `src/engine/` pure logic with no React, Supabase, or native imports. Every engine rule that matters gets a `*.test.ts` next to it.
- `src/lib/` Supabase client, auth, and data hooks.
- `src/theme/` tokens and `ThemeProvider`.
- `supabase/migrations/` schema and policies.

Import app code through the `@/` alias (`@/engine/...`, `@/lib/...`).

## Checks

Run all three before committing. They must stay clean.

```bash
npx vitest run
npx tsc --noEmit
npx expo lint       # includes React Compiler rules
```

Cloud sessions have no iOS simulator, so device journeys cannot be run here. Say so rather than claiming a UI change was verified on device.

## Conventions

- A day is the user's local calendar date (`@/engine/day`). Never derive it from a UTC timestamp.
- A miss is never written. It is a finished day with no Floor or Ceiling check-in.
- No streaks anywhere in the UI or data. The app counts kept days, not runs.
- React Compiler rules: no synchronous `setState` in effect bodies, no reading or writing `ref.current` during render.
- Commit subjects are one plain sentence describing what the user gets.
