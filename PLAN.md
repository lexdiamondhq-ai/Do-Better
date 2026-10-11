# Plan: Printed cards

Alex picked the Printed direction on 2026-10-11 and said yes to this sentence:

> You swipe a habit, and a card for that day slides out and flips over, dated and numbered.
> A Floor prints matte, and a Ceiling prints foil that shines when you tilt the phone.

Alex also wants Do Better to stand on its own, with no book or author names and none of their labels.

## Steps

1. [ ] One moving sketch of the print moment, on Alex's iPhone in Expo Go.
   It is the swipe, the print, the flip, and the tilt, with sample cards and no saved data.
   Proof: the three checks pass, the bundle builds, the simulator shows the print and flip, and Alex opens `/sketch` from the QR code.
   The tilt shine is not proven until Alex sees it move on the phone, because the simulator has no motion sensor.
   Proven on 2026-10-11 in the iPhone 17 Pro simulator: the feed-out and the flip, the matte Floor and the foil Ceiling, two card colours, light and dark, and two held tilts.
   Still open: Alex opening it on the phone, a real finger swipe, and the phone's tilt moving the shine.
2. [ ] Alex says how the sketch feels.
   Proof: Alex's reply.
3. [ ] Own words everywhere.
   Remove every book and author name, rewrite the Playbook as Do Better's own short rules, and rename the borrowed labels on every screen, using words that fit how Printed landed.
   The labels to replace are "Never twice", "vote", "two-minute version", "After I...", and the idea titles in `src/engine/playbook.ts`.
   Also fix the wording in `README.md`, `CLAUDE.md`, and `docs/DATA_MODEL.md`.
   Internal names and database columns stay as they are.
   Proof: a search of `src/app`, `src/components`, `src/engine`, and the docs finds none of those names or labels in text a person can read, and the three checks pass.
4. [ ] Look directions for frames and finishes.
   Show 2-3 moving options on the phone, and build none of the art until Alex approves it.
   Proof: Alex picks one.
5. [ ] Build Printed for real, in this order.
   - Engine rules with tests: the finish, the number, and the rank of each card.
   - The print moment on the Today screen.
   - The binder, with blank slots and hints for hidden finishes.
   - The optional line or photo on a card.
   - Rank-up frames.
   Proof: engine tests for every rule, the three checks, and Alex's pass on the phone for each piece.

## Notes for whoever picks this up

- The finish can be worked out from data the app already has.
  The level gives matte or foil, a kept day after a miss gives the rare finish, and the number is a count.
  The only new columns are the optional line and photo.
- A miss must still cost that day's card, so missing on purpose is never worth it.
- The foil uses `@shopify/react-native-skia`, which runs in Expo Go.
  Any EAS build made before it was added needs a new build.
- The tilt uses Reanimated's own sensor hook, so there is no extra package and no permission prompt on iPhone.
- `src/app/sketch.tsx` and the sign-in exception for it in `src/app/_layout.tsx` are throwaway.
  Remove both when step 5 puts the print moment on the Today screen.
- The font wait in `src/app/_layout.tsx` (`screenLayout`) is a real fix and stays.
  Without it, a screen opened straight from a link drew its first text in the system font.
- In the simulator, use iPhone 17 Pro.
  The iPhone 17 simulator hung on installing and launching apps on 2026-10-11.
- The sketch opens without an account, and accepts `?auto=ceiling` or `?auto=floor` plus `tx`, `ty`, and `card` so it can be checked without touching the screen.
- The dev server runs with `npx expo start --tunnel --go --port 8082`.
