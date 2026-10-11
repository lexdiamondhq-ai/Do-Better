# Plan: Printed cards

Alex picked the Printed direction on 2026-10-11 and said yes to this sentence:

> You swipe a habit, and a card for that day slides out and flips over, dated and numbered.
> A Floor prints matte, and a Ceiling prints foil that shines when you tilt the phone.

Alex also wants Do Better to stand on its own, with no book or author names and none of their labels.

## The game Alex said yes to (2026-10-11)

You are building a deck that is you: every day you show up prints a card, and the cards add up to who you are.

Six rules that never bend:

1. A card is only earned by doing something, never bought.
2. Nothing you earn is ever lost, so levels come from totals.
3. A miss leaves no mark, so the pile holds only days you showed up.
4. A Floor is a whole card.
5. The harder the day, the rarer the card.
6. Nothing on a card is made up: real date, real count, your own words.

A day in the game:

1. Open: the deck is dealt with one card face down on top, and a tap flips today's idea.
2. Swipe: down for the Floor, up for the Ceiling.
3. Print: each keep prints that day's card.
4. Land: the card drops onto the stack of the identity it belongs to, and you see how close the next rank is.
5. Close: when everything is kept, today's prints fan out together.
6. Comeback: the morning after a miss, the card returns flipped with an easier way in, and keeping it prints the rarest finish.

Identities at the front:

- Every identity gets its own large card, which leads the You tab.
- Each printed card is stamped with who it makes you.
- Identity rank is the level you win: the four ranks that exist today, at 0, 10, 30, and 100 cards.
- Build these with type and shapes only, and Alex supplies or approves any portrait or emblem first.

Do Better's own words:

| The app said | Do Better's word |
|---|---|
| Never twice | Comeback |
| Votes | Cards ("34 cards say I'm a reader") |
| Two-minute version | First move |
| After I... | When it plays |
| Poker suits, Full house, Royal flush | Its own marks: ↓ Floor, ↑ Ceiling, ↺ Comeback |

Pile, Today, and Playbook keep their layout.
The words inside Playbook change: each idea is rewritten in Do Better's voice with no book or author names.

## Steps

1. [ ] One moving sketch of the print moment, on Alex's iPhone in Expo Go.
   It is the swipe, the print, the flip, and the tilt, with sample cards and no saved data.
   Proven on 2026-10-11 in the iPhone 17 Pro simulator: the feed-out and the flip, the matte Floor and the foil Ceiling, two card colours, light and dark, and two held tilts.
   Alex said "I really like this game" but has not yet said whether the phone's tilt moves the shine.
2. [ ] One moving sketch of the landing moment, added to the same `/sketch` screen.
   After a card prints, it is stamped with who it makes you and drops onto that identity's stack, and a bar shows how many cards are left to the next rank.
   Proven on 2026-10-11 in the simulator: a plain landing (28 to 29 cards) and a rank-up (29 to 30, "Becoming"), in light and dark.
   Still open: Alex opening it on the phone, and a real finger swiping the card down onto the stack.
   The stamp was moved slightly after the last simulator look, so its final position has not been seen.
3. [x] Own words everywhere, using the table above (done 2026-10-11).
   Remove every book and author name, rewrite each Playbook idea in Do Better's voice, and rename the borrowed labels on every screen.
   Also fix the wording in `README.md`, `CLAUDE.md`, and `docs/DATA_MODEL.md`.
   Internal names and database columns stay as they are.
   Proven: a search of the project finds those names only in internal code names and database names, the three checks pass, and two engine tests now fail if a borrowed label comes back.
   Not proven: the reworded screens were not viewed while signed in.
   `cliclick` is installed on this Mac and can tap a visible Simulator window, but it was not tried.
   Look first at the one-line idea preview in Playbook, the "Plays ..." line on a habit card, and a long identity on the You tab.
   Left alone on purpose: comments inside the two applied migrations in `supabase/migrations`.
4. [ ] The idea card on top of the morning deal.
   This waits for step 3, so the ideas are already in Do Better's words.
   Proof: one moving sketch first, then Alex's yes.
5. [ ] Look options for frames, finishes, and identity cards.
   Show 2-3 moving prototypes on the phone, and build none of the art until Alex approves it.
   Proof: Alex picks one.
6. [ ] Build Printed for real, in this order.
   - Engine rules with tests: the finish, the number, and the rank of each card.
   - The print and landing moments on the Today screen.
   - Identity cards leading the You tab.
   - The pile sorted by identity, with blank slots and hints for hidden finishes.
   - The optional line or photo on a card.
   Proof: engine tests for every rule, the three checks, and Alex's pass on the phone for each piece.
7. [ ] Later: a line from your good day, dealt back on a comeback morning, and today's prints fanning out when everything is kept.

## Notes for whoever picks this up

- The finish can be worked out from data the app already has.
  The level gives matte or foil, a kept day after a miss gives the rare finish, and the number is a count.
  The only new columns are the optional line and photo.
- A miss must still cost that day's card, so missing on purpose is never worth it.
- The foil uses `@shopify/react-native-skia`, which runs in Expo Go.
  Any EAS build made before it was added needs a new build.
- The tilt uses Reanimated's own sensor hook, so there is no extra package and no permission prompt on iPhone.
- `src/app/sketch.tsx` and the sign-in exception for it in `src/app/_layout.tsx` are throwaway.
  Remove both when step 6 puts the print moment on the Today screen.
- The font wait in `src/app/_layout.tsx` (`screenLayout`) is a real fix and stays.
  Without it, a screen opened straight from a link drew its first text in the system font.
- In the simulator, use iPhone 17 Pro.
  The iPhone 17 simulator hung on installing and launching apps on 2026-10-11.
  After several boots and shutdowns the iPhone 17 Pro one also hung on `simctl terminate`, so boot it once and leave it running.
- The sketch opens without an account, and accepts `?auto=ceiling` or `?auto=floor`, `land=1`, `tx`, `ty`, and `card` so it can be checked without touching the screen.
- The dev server runs with `npx expo start --tunnel --go --port 8082`.
