/**
 * The Comeback, after it is kept: the dark card turning back over in your hand, and Your plan, one line
 * about what got in the way and what you'll do next time. A plan's "then" is always a keep: the card's
 * First move or its Floor. One plan per card, kept on this phone (`prefs.plans`), never a history.
 */

import { daysBetween, type Day } from './day';

/** A point in window coordinates. */
export type Point = { x: number; y: number };

/**
 * The Comeback card's exit once it is kept: warm light spreads from the finger, the card turns to its
 * bright side, holds, then leaves the normal way. With Reduce Motion it is a short crossfade, no turn.
 */
export function comebackExit(o: { firstMove: boolean; reduced: boolean }): { lightMs: number; flipMs: number; holdMs: number; crossfadeMs: number; totalMs: number } {
  if (o.reduced) return { lightMs: 0, flipMs: 0, holdMs: 0, crossfadeMs: 200, totalMs: 200 };
  const lightMs = 320;
  const flipMs = 380;
  const holdMs = 250;
  return { lightMs, flipMs, holdMs, crossfadeMs: 0, totalMs: lightMs + flipMs + holdMs };
}

/** How much of the light's radius is full colour; the rest is its soft edge. */
export const LIGHT_SOLID = 0.72;

/**
 * Where a turnover's warm light starts on a card `w` wide and `h` tall, in the card's own coordinates: the
 * point given (a button's centre or the finger), kept on the card, or else the edge the card was swiped
 * toward (the bottom for a Floor, the top for a Ceiling), at `x` across (the thumb) or the middle.
 */
export function lightOrigin(o: { w: number; h: number; dir: 'up' | 'down'; at?: Point | null; x?: number | null }): Point {
  'worklet';
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  if (o.at && Number.isFinite(o.at.x) && Number.isFinite(o.at.y)) return { x: clamp(o.at.x, o.w), y: clamp(o.at.y, o.h) };
  const x = o.x !== null && o.x !== undefined && Number.isFinite(o.x) ? clamp(o.x, o.w) : o.w / 2;
  return { x, y: o.dir === 'down' ? o.h : 0 };
}

/** The light's radius once grown: its full colour reaches the card's farthest corner from `from`. */
export function lightReach(from: Point, w: number, h: number): number {
  'worklet';
  const far = Math.max(Math.hypot(from.x, from.y), Math.hypot(w - from.x, from.y), Math.hypot(from.x, h - from.y), Math.hypot(w - from.x, h - from.y));
  return far / LIGHT_SOLID;
}

/** What the bright side says while it holds after a Floor or the first move. A Ceiling keeps its stamp. */
export const FLOOR_KEPT_NOTE = 'Floor kept. Today is kept.';

/** The bright side's note: the one the keep brought ("First move done. Today is kept."), or the Floor's own. */
export function turnNote(dir: 'up' | 'down', note?: string | null): string | null {
  return note?.trim() || (dir === 'down' ? FLOOR_KEPT_NOTE : null);
}

export type PlanWhen = 'late' | 'time' | 'tired' | 'away' | 'forgot';

/** `when` is a PlanWhen key or the player's own words. */
export type Plan = { when: string; then: 'first' | 'floor'; made: Day };

/** What got in the way, as the plan sheet offers it. */
export const PLAN_WHENS: readonly { key: PlanWhen; chip: string }[] = [
  { key: 'late', chip: 'Late night' },
  { key: 'time', chip: 'No time' },
  { key: 'tired', chip: 'Too tired' },
  { key: 'away', chip: 'Away from home' },
  { key: 'forgot', chip: 'Forgot' },
];

type PlanHabit = { floorLabel: string; twoMinuteLabel: string | null };

/** What next time can be: the First move (only when the card has one), then the Floor. Only ever keeps. */
export function planThens(habit: PlanHabit): { key: Plan['then']; label: string }[] {
  const first = habit.twoMinuteLabel?.trim();
  return [...(first ? [{ key: 'first' as const, label: `Do the first move: ${first}` }] : []), { key: 'floor', label: `Keep the Floor: ${habit.floorLabel}` }];
}

/** A plan as the Comeback card says it: "Too tired? Put on your shoes." Own words are used as typed. */
export function planLine(plan: Plan, habit: PlanHabit): string {
  const when = PLAN_WHENS.find((w) => w.key === plan.when)?.chip ?? plan.when.trim();
  const first = habit.twoMinuteLabel?.trim();
  const then = (plan.then === 'first' && first ? first : habit.floorLabel).trim().replace(/[.!?]+$/, '');
  return `${when.replace(/[?.!]+$/, '')}? ${then}.`;
}

/** This card's Comeback was answered by a keep today (Done it, the Floor or the Ceiling), not dismissed. */
export function comebackKeptToday(prompts: readonly { habitId: string; recoveryDay: Day; response: string | null }[], habitId: string, today: Day): boolean {
  return prompts.some((p) => p.habitId === habitId && p.recoveryDay === today && (p.response === 'floor_only' || p.response === 'two_minute'));
}

/** The longest a plan's own words can be. */
export const PLAN_WORDS_MAX = 40;

/** Days a plan stands before the sheet offers to make a new one. */
const PLAN_REST_DAYS = 14;

/** "Plan for next time" shows only after a kept Comeback, and never within 14 days of that card's last plan. */
export function planOffered(o: { keptComebackToday: boolean; plan: Plan | null; today: Day }): boolean {
  return o.keptComebackToday && (!o.plan || daysBetween(o.plan.made, o.today) >= PLAN_REST_DAYS);
}

/** A plan's own words kept as typed: trimmed, spaces collapsed, control characters gone, at most 40 characters. */
export function cleanPlanWords(text: string): string {
  const control = (ch: string) => {
    const c = ch.codePointAt(0) ?? 0;
    return c < 0x20 || (c >= 0x7f && c <= 0x9f);
  };
  const plain = Array.from(text, (ch) => (control(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(plain).slice(0, PLAN_WORDS_MAX).join('').trim();
}
