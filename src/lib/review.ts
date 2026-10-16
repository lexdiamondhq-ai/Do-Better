import * as StoreReview from 'expo-store-review';
import { useRef } from 'react';

import { addDays, type Day } from '@/engine/day';
import { lastShowdown, unlocksFor, type FaceEarned, type Game, type Week } from '@/engine/game';

import { useAuth } from './auth';
import { useData } from './data';
import { useDeck, type Deck } from './deck';
import { usePrefs } from './prefs';

/**
 * Asks for an App Store review at a good moment, and almost never. `const ask = useReviewAsk()`, then
 * ask('face') after a Queen or better, ask('showdown') when the Showdown closes, ask('call') after a
 * made call, ask('back') after a new card back. It checks the moment itself before asking.
 */
export type ReviewTrigger = 'face' | 'showdown' | 'call' | 'back';

/** Days between two asks. */
export const REVIEW_GAP_DAYS = 120;
/** Played weeks (finished, not the warm-up) before the first ask. */
export const REVIEW_AFTER_WEEKS = 2;
/** Sunday evening from this hour is the run-up to the Showdown: never a time to ask. */
const SUNDAY_NIGHT_HOUR = 18;
/** The system sheet comes up a beat after the moment closes, never on top of it. */
const DELAY_MS = 600;

export type ReviewMoment = {
  trigger: ReviewTrigger;
  demo: boolean;
  /** Finished weeks that weren't the warm-up. */
  playedWeeks: number;
  /** The newest face card in the Court and the day it was earned. */
  newestFace: { face: 'jack' | 'queen' | 'king' | 'ace'; day: Day } | null;
  /** The Showdown that just closed: whether its call was made and whether it unlocked a card back. */
  showdown: { madeCall: boolean; newBack: boolean } | null;
  /** A missed day is being won back: a Comeback card is up, or yesterday is waiting to be saved. */
  comeback: boolean;
  today: Day;
  /** The phone's local time now. */
  now: Date;
  /** When this player was last asked, as an ISO timestamp. */
  lastAsked: string | null;
};

/** Whether this is a moment worth asking for a review. Pure, so the rules can be tested. */
export function shouldAskForReview(m: ReviewMoment): boolean {
  if (m.demo) return false;
  if (m.playedWeeks < REVIEW_AFTER_WEEKS) return false;
  if (m.comeback) return false;
  if (m.now.getDay() === 0 && m.now.getHours() >= SUNDAY_NIGHT_HOUR) return false;
  if (m.lastAsked) {
    const last = Date.parse(m.lastAsked);
    if (Number.isFinite(last) && m.now.getTime() - last < REVIEW_GAP_DAYS * 86_400_000) return false;
  }
  return qualifies(m);
}

/** The moment itself is a high point: a Queen or better earned in the last day, a made call or a new card back. */
function qualifies(m: ReviewMoment): boolean {
  switch (m.trigger) {
    case 'face':
      return !!m.newestFace && m.newestFace.face !== 'jack' && m.newestFace.day >= addDays(m.today, -1);
    case 'call':
      return !!m.showdown?.madeCall;
    case 'back':
      return !!m.showdown?.newBack;
    case 'showdown':
      return !!m.showdown && (m.showdown.madeCall || m.showdown.newBack);
  }
}

/** Weeks that have been played to their Showdown: finished, with a hand, and not the warm-up. The live week doesn't count yet. */
export function playedWeeks(weeks: readonly Pick<Week, 'warmup' | 'live' | 'hand'>[]): number {
  return weeks.filter((w) => !w.warmup && !w.live && w.hand).length;
}

/** What the latest Showdown brought, from the game. */
export function showdownMoment(game: Game): ReviewMoment['showdown'] {
  const week = lastShowdown(game);
  if (!week) return null;
  return { madeCall: week.madeCall, newBack: unlocksFor(game, week).backs.length > 0 };
}

function momentOf(trigger: ReviewTrigger, deck: Deck, demo: boolean, lastAsked: string | null, now: Date): ReviewMoment {
  const { game } = deck;
  // Faces come oldest first; of those earned on the newest day, the highest counts.
  const newest = game.faces.at(-1)?.day;
  const face = game.faces.filter((f) => f.day === newest).reduce<FaceEarned | null>((best, f) => (!best || f.face.votes > best.face.votes ? f : best), null);
  return {
    trigger,
    demo,
    playedWeeks: playedWeeks(game.weeks),
    newestFace: face ? { face: face.face.face, day: face.day } : null,
    showdown: showdownMoment(game),
    comeback: game.rescue !== null || deck.cards.some((c) => c.neverTwice),
    today: deck.today,
    now,
    lastAsked,
  };
}

export function useReviewAsk(): (trigger: ReviewTrigger) => void {
  const deck = useDeck();
  const { demo } = useAuth();
  const { seed } = useData();
  const { prefs, ready, setPrefs } = usePrefs();
  const pending = useRef(false);

  return (trigger: ReviewTrigger) => {
    if (!deck || !ready || pending.current) return;
    const now = new Date();
    if (!shouldAskForReview(momentOf(trigger, deck, !!demo, prefs.reviewAskedAt[seed] ?? null, now))) return;
    pending.current = true;
    setTimeout(() => {
      void (async () => {
        try {
          if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
          await StoreReview.requestReview();
          // Apple decides whether the sheet really shows; either way, this was the ask.
          setPrefs((p) => ({ reviewAskedAt: { ...p.reviewAskedAt, [seed]: now.toISOString() } }));
        } catch {
          // No store on this phone or build: nothing to ask.
        } finally {
          pending.current = false;
        }
      })();
    }, DELAY_MS);
  };
}
