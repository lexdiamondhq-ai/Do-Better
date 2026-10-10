import type { Day } from '@/engine/day';
import type { Level } from '@/engine/kept';
import { isCardColor, type CardColor } from '@/theme/tokens';

export type Habit = {
  id: string;
  name: string;
  identity: string | null;
  floorLabel: string;
  ceilingLabel: string;
  twoMinuteLabel: string | null;
  color: CardColor;
  anchor: string | null;
  whenWhere: string | null;
  why: string | null;
  recipeKey: string | null;
  position: number;
  startedOn: Day;
  archivedAt: string | null;
};

export type HabitDay = { habitId: string; day: Day; level: Level };

export type RecoveryResponse = 'floor_only' | 'two_minute' | 'dismissed';

export type RecoveryPrompt = { habitId: string; missedDay: Day; recoveryDay: Day; response: RecoveryResponse | null };

export type Profile = {
  id: string;
  displayName: string | null;
  timezone: string;
  northStar: string | null;
  onboardedAt: string | null;
};

/** What a person types when making or editing a card. */
export type HabitDraft = {
  name: string;
  identity: string;
  floorLabel: string;
  ceilingLabel: string;
  twoMinuteLabel: string;
  color: CardColor;
  anchor: string;
  whenWhere: string;
  why: string;
  recipeKey: string | null;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function habitFromRow(r: Row): Habit {
  return {
    id: String(r.id),
    name: String(r.name),
    identity: str(r.identity),
    floorLabel: String(r.floor_label),
    ceilingLabel: String(r.ceiling_label),
    twoMinuteLabel: str(r.two_minute_label),
    color: isCardColor(r.color) ? r.color : 'tomato',
    anchor: str(r.anchor),
    whenWhere: str(r.when_where),
    why: str(r.why),
    recipeKey: str(r.recipe_key),
    position: typeof r.position === 'number' ? r.position : 0,
    startedOn: String(r.started_on),
    archivedAt: str(r.archived_at),
  };
}

/** Empty strings become nulls so optional columns stay empty rather than blank. */
export function draftToRow(d: HabitDraft) {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  return {
    name: d.name.trim(),
    identity: opt(d.identity),
    floor_label: d.floorLabel.trim(),
    ceiling_label: d.ceilingLabel.trim(),
    two_minute_label: opt(d.twoMinuteLabel),
    color: d.color,
    anchor: opt(d.anchor),
    when_where: opt(d.whenWhere),
    why: opt(d.why),
    recipe_key: d.recipeKey,
  };
}

export function draftFromHabit(h: Habit): HabitDraft {
  return {
    name: h.name,
    identity: h.identity ?? '',
    floorLabel: h.floorLabel,
    ceilingLabel: h.ceilingLabel,
    twoMinuteLabel: h.twoMinuteLabel ?? '',
    color: h.color,
    anchor: h.anchor ?? '',
    whenWhere: h.whenWhere ?? '',
    why: h.why ?? '',
    recipeKey: h.recipeKey,
  };
}

/** A draft is ready to save when it has a name, a Floor and a Ceiling. */
export function draftProblem(d: HabitDraft): string | null {
  if (!d.name.trim()) return 'Give the card a name.';
  if (!d.floorLabel.trim()) return 'Set a Floor: the smallest version that still counts.';
  if (!d.ceilingLabel.trim()) return 'Set a Ceiling: what a great day looks like.';
  return null;
}
