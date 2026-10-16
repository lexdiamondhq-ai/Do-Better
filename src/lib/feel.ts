import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

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
