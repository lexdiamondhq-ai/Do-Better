import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { comebackExit } from '@/engine/comeback';
import type { Beat } from '@/engine/rhythm';

/**
 * What the app feels like in the hand: one tap you can feel for each thing that happens, named for the
 * moment rather than the motor pattern, so every screen feels the same.
 *
 * Haptics follow the player's setting (`setFeelSettings`) and do nothing in a browser. A tap that
 * can't play is never worth an error, so every failure is swallowed.
 */

let hapticsOn = true;
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Called whenever the setting changes. */
export function setFeelSettings({ haptics }: { haptics: boolean }) {
  hapticsOn = haptics;
}

function play(pattern: () => Promise<void>) {
  if (!hapticsOn || !supported) return;
  try {
    pattern().catch(() => {});
  } catch {
    // The haptics module can be missing on a simulator or an old build.
  }
}

function later(ms: number, pattern: () => Promise<void>) {
  setTimeout(() => play(pattern), ms);
}

/** A dragged card crossed the line: let go now and it counts. */
export function arm() {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** The card was pulled back over the line: letting go now springs it back. */
export function disarm() {
  play(() => Haptics.selectionAsync());
}

/** A Floor kept: a short, solid thud the moment the card leaves. Never the warning buzz. */
export function floor() {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** A Ceiling reached: the bright double tap of a success. */
export function ceiling() {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A Joker or a face card: a success, then a firm knock as it lands. */
export function joker() {
  play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  later(160, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

/** A card turning over. */
export function flip() {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

let lastTick = 0;
const TICK_GAP_MS = 40;

/** A small step: a choice picked, a tab changed, a counter ticking up. Fast runs are thinned out. */
export function tick() {
  const now = Date.now();
  if (now - lastTick < TICK_GAP_MS) return;
  lastTick = now;
  play(() => Haptics.selectionAsync());
}

/** Chips landing on the stack: two quick clacks. */
export function chips() {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  later(90, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * The dark Comeback card turning back over in your hand (`comebackExit`): three knocks that grow, light,
 * medium and heavy, while the warm light spreads and the turn begins, then a success at the turn's midpoint,
 * the moment the bright side shows.
 */
export function turnover() {
  const { lightMs, flipMs } = comebackExit({ firstMove: false, reduced: false });
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  later(Math.round(lightMs / 2), () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  later(lightMs, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  later(lightMs + Math.round(flipMs / 2), () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** How hard each beat of a rhythm knocks. A success is the double tap, not a knock. */
const KNOCK: Record<Exclude<Beat['weight'], 'success'>, Haptics.ImpactFeedbackStyle> = {
  soft: Haptics.ImpactFeedbackStyle.Soft,
  firm: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
};

function knock(weight: Beat['weight']): () => Promise<void> {
  return weight === 'success' ? () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : () => Haptics.impactAsync(KNOCK[weight]);
}

/**
 * The Showdown result's rhythm, one tap per beat, so a hand taps out its own shape: a pair twice, a full
 * house three then two, a straight a run that hardens. Each beat checks the setting as it lands, so
 * turning haptics off mid-rhythm stops the rest.
 */
export function rhythm(beats: readonly Beat[]) {
  for (const beat of beats) {
    if (beat.at > 0) later(beat.at, knock(beat.weight));
    else play(knock(beat.weight));
  }
}
