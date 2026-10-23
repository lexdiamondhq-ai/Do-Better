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
