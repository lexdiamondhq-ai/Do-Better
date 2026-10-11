# Do Better

Most habit apps reward streaks, and streaks break. Do Better turns your habits into a card game where nothing ever resets to zero.

- **Floor and Ceiling.** Every habit has an ideal daily target (the Ceiling) and an emergency minimum (the Floor). Hitting the Floor still keeps the day.
- **Every kept day deals a playing card.** Keep some of your habits and the card is a 2 to a Queen. Keep all of them and it can be an Ace. Add a Ceiling and it is 9 or better, and a Ceiling on every habit deals 10 or better.
- **Your week is a poker hand.** Monday to Sunday, your best five cards make the hand. At Sunday midnight the Showdown pays chips, from 10 for a high card to 500 for a royal flush. Every new kind of hand goes into the Hall of Hands and unlocks a card back.
- **Suits are who you are.** Every habit belongs to a suit: ♠ Body, ♥ Heart, ♦ Craft or ♣ Mind. The suit is set once the habit's days are dealt, so old hands never change. A day's card carries the suits of the habits you kept. Every habit-day you keep is a vote in your Court, and enough votes earn a suit its Jack (10), Queen (30), King (100) and Ace (365). The day you earn a face card is dealt as a Joker, one a week at most.
- **Call your hand.** On Monday you can name the hand you're going for. Make it by Sunday and its chips pay twice.
- **Never Twice.** Miss a day and keep any habit the next day, and the missed day is still dealt a card. Miss twice and it stays empty.
- **Tables.** As your chip stack grows it opens new tables, which change the app's look.

The rules live in `src/engine` with tests next to each file: `deal.ts` (day cards), `poker.ts` (hands and chips), `court.ts` (identity votes and face cards) and `game.ts` (weeks, calls, unlocks and tips). Cards and hands are dealt on the device from your check-ins, so they are never stored.

## Running it

1. Create a Supabase project and apply every file in `supabase/migrations`, oldest first: `supabase link` then `supabase db push`, or paste each file into the SQL Editor and run it. [docs/DATA_MODEL.md](docs/DATA_MODEL.md) says what each one adds.
2. Copy `.env.example` to `.env` and fill in the project URL and publishable key.
3. `npm install`, then `npx expo start` to open it in Expo Go, or `npx expo run:ios` for a development build.
4. On the sign-in screen, **Just looking? Play a demo deck** opens a made-up player ten weeks into the game. It lives in memory and never touches Supabase.
5. For store builds, run `eas init` once to attach an EAS project.
