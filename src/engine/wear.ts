/**
 * Worn in: a card wears in with its own kept days, the way a real card softens in the hand. Corners
 * soften at 10, a crease and a thumb mark come at 30 (where your thumb grabs the card), a gilt edge at
 * 100 and an Heirloom's foil suit at a year. Every layer is faint and sits under the card's words.
 *
 * Wear is worked out from kept days and never stored. Only the thumb position is kept, on this phone,
 * as a running average of real swipes (`prefs.grips`); with none saved it comes from a seeded default.
 */

import { unit } from './deal';

/** 0..1 across and down the card face. */
export type Grip = { x: number; y: number };
/** A running average of up to 50 swipes. */
export type HeldGrip = Grip & { n: number };
export type WearStage = 'new' | 'worn' | 'played' | 'gilt' | 'heirloom';

/** The kept days on a card at which each stage arrives. */
export const WEAR_AT: Readonly<Record<WearStage, number>> = { new: 0, worn: 10, played: 30, gilt: 100, heirloom: 365 };

/** Each layer's opacity, 0 to 0.25. */
export type Wear = { stage: WearStage; corners: number; crease: number; thumb: number; gilt: number; foil: boolean };

/** The stages from the first to the last. */
const STAGES: readonly WearStage[] = ['new', 'worn', 'played', 'gilt', 'heirloom'];

const STAGE_NAME: Readonly<Record<WearStage, string>> = { new: 'Fresh from the deck', worn: 'Worn in', played: 'Well played', gilt: 'Gilt edge', heirloom: 'Heirloom' };

/** Swipes the thumb position averages over, at most. */
const GRIP_CAP = 50;

function stageOf(kept: number): WearStage {
  let stage: WearStage = 'new';
  for (const s of STAGES) if (kept >= WEAR_AT[s]) stage = s;
  return stage;
}

/** How worn a card with `kept` kept days looks. Stream 4 draws the layers; until then every layer is clear. */
export function wearOf(kept: number): Wear {
  return { stage: stageOf(kept), corners: 0, crease: 0, thumb: 0, gilt: 0, foil: false };
}

/** The next stage this card will reach, and how many kept days away it is. Null for an Heirloom. */
export function nextWear(kept: number): { stage: WearStage; name: string; at: number; left: number } | null {
  const stage = STAGES.find((s) => WEAR_AT[s] > kept);
  return stage ? { stage, name: STAGE_NAME[stage], at: WEAR_AT[stage], left: WEAR_AT[stage] - kept } : null;
}

/** The wear line on a card's page: "Worn in · 12 kept days. Well played at 30." */
export function wearLine(kept: number): { title: string; line: string } {
  const stage = stageOf(kept);
  const days = `${kept} ${kept === 1 ? 'kept day' : 'kept days'}`;
  const after: Record<WearStage, string> = {
    new: 'It wears in at 10.',
    worn: 'Well played at 30.',
    played: 'Broken in where your thumb holds it.',
    gilt: 'An heirloom at a year.',
    heirloom: 'A year of kept days and more.',
  };
  return { title: STAGE_NAME[stage], line: `${STAGE_NAME[stage]} · ${days}. ${after[stage]}` };
}

/** Where a card's thumb mark sits before any swipe is saved: seeded by the card, in the lower right. */
export function defaultGrip(habitId: string): Grip {
  return { x: 0.6 + 0.25 * unit(`${habitId}:grip`), y: 0.6 + 0.25 * unit(`${habitId}:grip:y`) };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** One more swipe folded into the running average. Past `cap` swipes each new one moves it by 1/cap. */
export function blendGrip(prev: HeldGrip | null, point: Grip, cap: number = GRIP_CAP): HeldGrip {
  const at = { x: clamp01(point.x), y: clamp01(point.y) };
  if (!prev) return { ...at, n: 1 };
  const n = Math.max(1, Math.min(Math.floor(cap), prev.n + 1));
  return { x: clamp01(prev.x + (at.x - prev.x) / n), y: clamp01(prev.y + (at.y - prev.y) / n), n };
}
