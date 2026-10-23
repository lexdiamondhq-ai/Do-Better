/**
 * The Showdown's result as a rhythm you can feel and see: one haptic beat per card, grouped the way the
 * hand is made (a pair taps twice, a full house three then two), and each card lifts on its own beat.
 * Beats within a group are 90 ms apart, groups 260 ms apart, never closer than 70 ms, and the whole
 * rhythm ends within 1300 ms.
 */

import type { HandKind } from './poker';

/**
 * One beat: when it lands, how hard, and which card of `hand.cards` lifts on it. A closing beat that
 * belongs to the whole hand (a straight flush's success) has `card` -1, so no single card lifts.
 */
export type Beat = { at: number; weight: 'soft' | 'firm' | 'heavy' | 'rigid' | 'success'; card: number };

const BEAT_MS = 90;
const GROUP_MS = 260;
const RUN_MS = 70;

type Weight = Beat['weight'];

/** The groups of each kind of hand, as the weights of their beats. */
const GROUPS: Record<HandKind, Weight[][]> = {
  'high-card': [['soft']],
  pair: [['firm', 'firm']],
  'two-pair': [
    ['firm', 'firm'],
    ['firm', 'firm'],
  ],
  'three-of-a-kind': [['heavy', 'heavy', 'heavy']],
  straight: [],
  flush: [],
  'full-house': [
    ['heavy', 'heavy', 'heavy'],
    ['firm', 'firm'],
  ],
  'four-of-a-kind': [['heavy', 'heavy', 'heavy', 'heavy']],
  'straight-flush': [],
  'royal-flush': [],
  'five-of-a-kind': [['heavy', 'heavy', 'heavy', 'heavy', 'heavy'], ['success']],
};

/** A straight runs up its five cards from soft to rigid, 70 ms apart. */
const RUN: Weight[] = ['soft', 'firm', 'firm', 'heavy', 'rigid'];
/** What closes a run, by kind. The retired Flush, which no week makes, runs soft all the way. */
const RUN_CLOSE: Partial<Record<HandKind, Weight[]>> = { straight: [], 'straight-flush': ['success'], 'royal-flush': ['success', 'rigid'] };

/** The rhythm the result taps out for a hand of `kind`. */
export function handRhythm(kind: HandKind): Beat[] {
  const beats: Beat[] = [];
  if (kind === 'flush' || kind in RUN_CLOSE) {
    const run = kind === 'flush' ? RUN.map((): Weight => 'soft') : RUN;
    run.forEach((weight, i) => beats.push({ at: i * RUN_MS, weight, card: i }));
    let at = beats[beats.length - 1].at + GROUP_MS;
    for (const weight of RUN_CLOSE[kind] ?? []) {
      beats.push({ at, weight, card: -1 });
      at += BEAT_MS;
    }
    return beats;
  }
  let at = 0;
  let card = 0;
  GROUPS[kind].forEach((group, g) => {
    if (g > 0) at += GROUP_MS - BEAT_MS;
    for (const weight of group) {
      const closing = weight === 'success';
      beats.push({ at, weight, card: closing ? -1 : card });
      if (!closing) card++;
      at += BEAT_MS;
    }
  });
  return beats;
}
