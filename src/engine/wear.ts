/**
 * Worn in: a card wears in with its own kept days, the way a real card softens in the hand. Corners
 * soften at 10, a crease and a thumb mark come at 30 (where your thumb grabs the card), a gilt edge at
 * 100 and an Heirloom's foil suit at a year. Every layer is faint and sits under the card's words.
 *
 * Wear is worked out from kept days and never stored. Only the thumb position is kept, on this phone,
 * as a running average of real swipes (`prefs.grips`); with none saved it comes from a seeded default.
 * Nothing can buy wear, and nothing takes it off except undoing a keep.
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

/** The faintest a layer may ever be drawn: no layer goes above this. */
export const WEAR_MAX = 0.25;

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

/**
 * A layer's opacity along its own path: nothing before the first stop, then straight lines between the
 * stops, then the last stop's value for good. Each stop is [kept days, opacity], rising, so a layer only
 * ever deepens as kept days come in.
 */
function ramp(kept: number, stops: readonly (readonly [number, number])[]): number {
  if (!Number.isFinite(kept) || kept < stops[0][0]) return 0;
  for (let i = 1; i < stops.length; i++) {
    const [k0, a0] = stops[i - 1];
    const [k1, a1] = stops[i];
    if (kept < k1) return round3(a0 + ((a1 - a0) * (kept - k0)) / (k1 - k0));
  }
  return stops[stops.length - 1][1];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Corners soften from Worn in and keep softening to a year. */
const CORNERS = [[WEAR_AT.worn, 0.09], [WEAR_AT.played, 0.12], [WEAR_AT.gilt, 0.18], [WEAR_AT.heirloom, 0.22]] as const;
/** The crease comes with Well played and settles in by a year. */
const CREASE = [[WEAR_AT.played, 0.06], [WEAR_AT.gilt, 0.12], [WEAR_AT.heirloom, 0.15]] as const;
/** The thumb mark: 0.06 at Well played, deepening to 0.22 by the gilt edge, then held there. */
const THUMB = [[WEAR_AT.played, 0.06], [WEAR_AT.gilt, 0.22]] as const;
/** The gilt edge catches more light as the card heads for a year. */
const GILT = [[WEAR_AT.gilt, 0.16], [WEAR_AT.heirloom, 0.25]] as const;

/** How worn a card with `kept` kept days looks. Every layer grows with kept days and never drops back. */
export function wearOf(kept: number): Wear {
  const k = Math.max(0, Math.floor(Number.isFinite(kept) ? kept : 0));
  return {
    stage: stageOf(k),
    corners: Math.min(WEAR_MAX, ramp(k, CORNERS)),
    crease: Math.min(WEAR_MAX, ramp(k, CREASE)),
    thumb: Math.min(WEAR_MAX, ramp(k, THUMB)),
    gilt: Math.min(WEAR_MAX, ramp(k, GILT)),
    foil: k >= WEAR_AT.heirloom,
  };
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

/** Said under the wear line once the card has a thumb mark (from Well played) and a swipe has placed it: it lives only on this phone. */
export const GRIP_NOTE = 'Its thumb mark is saved on this phone.';

/** Said instead while the thumb mark still sits where the card seeds it (`defaultGrip`): no swipe has placed it yet. */
export const GRIP_SETTLES = 'Swipe it and its thumb mark settles where you hold it, saved only on this phone.';

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

// The shapes ---------------------------------------------------------------------------------------------

export type Corner = 'tl' | 'tr' | 'br' | 'bl';
export const CORNER_ORDER: readonly Corner[] = ['tl', 'tr', 'br', 'bl'];

/**
 * A softened corner: a broken dash along the card's rounded edge. `dash` is the stroke's dash pattern (in
 * points), `reach` how far past the curve it runs along the straight edges (as a share of the corner's
 * radius), `inset` how far in from the edge it sits, and `width` its stroke.
 */
export type Scuff = { corner: Corner; dash: number[]; reach: number; inset: number; width: number };

/** The fold a card takes once it is broken in: a soft curve from edge to edge, in 0..1 card units. */
export type Crease = { from: Grip; to: Grip; bend: Grip };

/** One ridge of the thumb mark: an elliptical arc `r` thumb-radii out, from `start` degrees for `sweep` degrees. */
export type Ridge = { r: number; start: number; sweep: number };

/**
 * The thumb mark: a soft oval at the grip, tilted `angle` degrees, `size` card widths across its short
 * radius, with five ridges drawn round it, the way a thumb leaves its print on a card it holds.
 */
export type Thumb = { at: Grip; angle: number; size: number; ridges: Ridge[] };

export type WearArt = { scuffs: Scuff[]; crease: Crease | null; thumb: Thumb | null; gilt: boolean; foil: boolean };

/** Ridges in a thumb mark. */
export const RIDGES = 5;

/**
 * The seeded shapes behind a card's wear, so the same card always wears the same way: its scuffs, its
 * crease and the swirl of its thumb mark. Layers that haven't arrived yet are empty. `grip` is where the
 * thumb mark sits (saved swipes, or `defaultGrip`).
 */
export function wearArt(habitId: string, wear: Wear, grip: Grip): WearArt {
  const u = (what: string) => unit(`${habitId}:wear:${what}`);
  const scuffs: Scuff[] =
    wear.corners > 0
      ? CORNER_ORDER.map((corner) => {
          // Broken dashes, longer and shorter, so the edge reads as softened by hands, not drawn with a ruler.
          const dash = Array.from({ length: 6 }, (_, i) => round2((i % 2 === 0 ? 2.5 + 7 * u(`${corner}:dash:${i}`) : 1.2 + 3 * u(`${corner}:gap:${i}`))));
          // The corners your hand meets most (the lower ones) wear a little further along the edges.
          const lower = corner === 'bl' || corner === 'br';
          return { corner, dash, reach: round2(0.25 + 0.45 * u(`${corner}:reach`) + (lower ? 0.2 : 0)), inset: round2(1.2 + 0.8 * u(`${corner}:inset`)), width: round2(1.6 + 1.2 * u(`${corner}:width`)) };
        })
      : [];

  let crease: Crease | null = null;
  if (wear.crease > 0) {
    // Across the middle third, tipped a little: where a card bends when it is held and swiped.
    const y1 = 0.36 + 0.26 * u('crease:y1');
    const y2 = clamp(y1 + (u('crease:tilt') - 0.5) * 0.22, 0.3, 0.7);
    crease = {
      from: { x: -0.02, y: round3(y1) },
      to: { x: 1.02, y: round3(y2) },
      bend: { x: round3(0.35 + 0.3 * u('crease:bx')), y: round3((y1 + y2) / 2 + (u('crease:by') - 0.5) * 0.08) },
    };
  }

  let thumb: Thumb | null = null;
  if (wear.thumb > 0) {
    const ridges = Array.from({ length: RIDGES }, (_, i) => ({
      r: round3(0.3 + 0.17 * i),
      start: Math.round(360 * u(`ridge:${i}:start`)),
      sweep: Math.round(150 + 140 * u(`ridge:${i}:sweep`)),
    }));
    // A thumb lies along the card, tipped toward the hand that holds it.
    thumb = { at: { x: clamp01(grip.x), y: clamp01(grip.y) }, angle: Math.round(-55 + 45 * u('whorl')), size: 0.12, ridges };
  }

  return { scuffs, crease, thumb, gilt: wear.gilt > 0, foil: wear.foil };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Size = { w: number; h: number };

const f1 = (v: number) => Math.round(v * 10) / 10;

/**
 * A scuff as an SVG path on a card `size` points across with corners of `radius`: down the curve of its
 * corner, `inset` in from the edge, and `reach` of the radius along each straight edge beside it.
 */
export function scuffPath(s: Pick<Scuff, 'corner' | 'reach' | 'inset'>, size: Size, radius: number): string {
  const r = Math.max(2, Math.min(radius, size.w / 2, size.h / 2));
  const i = s.inset;
  const ext = r * s.reach;
  const a = Math.max(1, r - i);
  const { w, h } = size;
  switch (s.corner) {
    case 'tl':
      return `M${f1(i)} ${f1(r + ext)}L${f1(i)} ${f1(r)}A${f1(a)} ${f1(a)} 0 0 1 ${f1(r)} ${f1(i)}L${f1(r + ext)} ${f1(i)}`;
    case 'tr':
      return `M${f1(w - r - ext)} ${f1(i)}L${f1(w - r)} ${f1(i)}A${f1(a)} ${f1(a)} 0 0 1 ${f1(w - i)} ${f1(r)}L${f1(w - i)} ${f1(r + ext)}`;
    case 'br':
      return `M${f1(w - i)} ${f1(h - r - ext)}L${f1(w - i)} ${f1(h - r)}A${f1(a)} ${f1(a)} 0 0 1 ${f1(w - r)} ${f1(h - i)}L${f1(w - r - ext)} ${f1(h - i)}`;
    default:
      return `M${f1(r + ext)} ${f1(h - i)}L${f1(r)} ${f1(h - i)}A${f1(a)} ${f1(a)} 0 0 1 ${f1(i)} ${f1(h - r)}L${f1(i)} ${f1(h - r - ext)}`;
  }
}

/** The crease as a quadratic curve on a card `size` points across, moved down by `dy` (for its shadow line). */
export function creasePath(c: Crease, size: Size, dy = 0): string {
  const p = (g: Grip) => `${f1(g.x * size.w)} ${f1(g.y * size.h + dy)}`;
  return `M${p(c.from)}Q${p(c.bend)} ${p(c.to)}`;
}

/** Where the thumb mark sits on a card `size` points across: its centre and its two radii, the long one down the thumb. */
export function thumbOval(t: Thumb, size: Size): { cx: number; cy: number; rx: number; ry: number } {
  const rx = t.size * size.w;
  return { cx: f1(t.at.x * size.w), cy: f1(t.at.y * size.h), rx: f1(rx), ry: f1(rx * 1.3) };
}

/** One ridge of a thumb mark as an SVG arc, round the oval of `thumbOval`, turned with the thumb. */
export function ridgePath(t: Thumb, ridge: Ridge, size: Size): string {
  const o = thumbOval(t, size);
  const rx = o.rx * ridge.r;
  const ry = o.ry * ridge.r;
  const turn = (t.angle * Math.PI) / 180;
  const at = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return `${f1(o.cx + x * Math.cos(turn) - y * Math.sin(turn))} ${f1(o.cy + x * Math.sin(turn) + y * Math.cos(turn))}`;
  };
  const sweep = Math.min(359, Math.max(1, ridge.sweep));
  return `M${at(ridge.start)}A${f1(rx)} ${f1(ry)} ${t.angle} ${sweep > 180 ? 1 : 0} 1 ${at(ridge.start + sweep)}`;
}
