/**
 * Reminders, worked out ahead of time. Pure: no notification API, no React, no clock of its own.
 *
 * The phone can only fire what was scheduled before, so the app rebuilds the whole plan every time the
 * deck changes and every time it opens. A day still to come is planned as if nothing more gets kept
 * before it. That is exactly true until the player opens the app again, and opening it replans.
 *
 * Two kinds of cue:
 * - The app's own (last call, the morning after, Monday, Sunday night, calls): at most two a day, never
 *   between 21:30 and 07:30, fewer the longer the app stays closed, and only the Monday ones after a week.
 * - The player's own "When it plays" times: exactly when they asked, every day the card is still open.
 *
 * No cue ever counts missed days.
 */
import { addDays, daysBetween, weekday, weekStart, type Day } from './day';
import type { PartOfDay } from './playbook';

/** A wall-clock time, 'HH:MM' in 24 hours. */
export type Clock = string;

export type CueHabit = {
  id: string;
  name: string;
  floor: string;
  firstMove: string | null;
  startedOn: Day;
  part: PartOfDay;
  /** Checked in today, at either level. */
  keptToday: boolean;
  /** The player's own reminder for this card, if they set one. */
  remindAt: Clock | null;
};

/** What the plan needs to know about the deck right now. */
export type CueSnapshot = {
  today: Day;
  /** Active cards, in deck order. */
  habits: readonly CueHabit[];
  /** Yesterday was blank and keeping anything today saves it. */
  rescue: boolean;
  /** Calls are open this week and none has been made. */
  callWaiting: boolean;
  /** This is the warm-up week: no hand, no Showdown. */
  warmup: boolean;
  /** This week already holds a hand, so next Monday has a Showdown. */
  handThisWeek: boolean;
  /** The Monday of last week when its Showdown hasn't been seen yet. */
  showdownWaiting: Day | null;
  /** A face card one kept day away, for a suit with nothing kept today. */
  faceSoon: { name: string; habitIds: readonly string[] } | null;
};

export type CueSettings = {
  /** When the evening cue goes out. Pulled inside quiet hours if set later. */
  lastCall: Clock;
  /** The morning-after cue, when yesterday can still get its card. */
  morning: boolean;
};

export type CueKind = 'showdown' | 'new-week' | 'sunday' | 'morning-after' | 'last-call' | 'call' | 'plays';

/** Where a tap goes. */
export type CueUrl = '/' | '/call' | `/showdown?week=${string}`;

export type Cue = {
  /** Stable for the same cue on the same day, so a replan can tell nothing changed. */
  id: string;
  kind: CueKind;
  day: Day;
  at: Clock;
  /** The instant it fires, in epoch milliseconds. */
  fireAt: number;
  title: string;
  body: string;
  url: CueUrl;
  habitId?: string;
};

export const QUIET = { from: '21:30', until: '07:30' } as const;
/** App-chosen cues a day, at most. */
export const DAILY_CAP = 2;
/** Days planned ahead in full. Mondays go further. */
export const WINDOW_DAYS = 7;
/** Mondays planned ahead, so a player who stops opening the app still hears about a new week. */
export const MONDAYS_AHEAD = 4;
/** From this many days after the app was last opened, one quiet cue a day and no morning-after. */
export const TAPER_FROM = 3;
/** iOS keeps 64 pending notifications per app. Leave room. */
export const MAX_CUES = 60;

export const TIMES = { showdown: '08:00', morning: '09:00', call: '12:00', sunday: '19:00' } as const;

export const MORNING_COPY = { title: 'Did it yesterday? Log it.', body: 'If not, keep anything today and yesterday still gets its card.' } as const;

/** Lower comes first when a day has more than its share. */
const PRIORITY: Record<Exclude<CueKind, 'plays'>, number> = { showdown: 0, 'new-week': 0, sunday: 1, 'morning-after': 2, 'last-call': 3, call: 4 };

/** Minutes after midnight for 'HH:MM', or null when it isn't a time. */
export function clockMinutes(at: Clock): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function clockOf(minutes: number): Clock {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** True between 21:30 and 07:30, the edges themselves allowed. */
export function isQuiet(at: Clock): boolean {
  const m = clockMinutes(at);
  if (m === null) return true;
  return m > clockMinutes(QUIET.from)! || m < clockMinutes(QUIET.until)!;
}

/** The evening cue's time: the player's choice, pulled back inside the day when it falls in quiet hours. */
export function lastCallAt(at: Clock): Clock {
  const m = clockMinutes(at);
  if (m === null) return '20:30';
  if (m > clockMinutes(QUIET.from)!) return QUIET.from;
  if (m < clockMinutes(QUIET.until)!) return QUIET.from;
  return clockOf(m);
}

// One formatter per time zone, as building them is slow.
const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(t: number, timeZone: string): number {
  let f = wallFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    wallFormatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
}

/**
 * The instant a local wall-clock time happens on `day` in `timeZone`. Across a clock change it lands on
 * the time as the clock shows it afterwards; a time the clocks skip lands just after the jump.
 */
export function atLocal(day: Day, at: Clock, timeZone: string): number {
  const [y, mo, d] = day.split('-').map(Number);
  const minutes = clockMinutes(at) ?? 0;
  const wall = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = wall - (wallClock(wall, timeZone) - wall);
  t = wall - (wallClock(t, timeZone) - t);
  // In a skipped hour the guess lands before the jump. Move past it.
  if (wallClock(t, timeZone) < wall) t += wall - wallClock(t, timeZone);
  return t;
}

function firstLower(text: string): string {
  return /^[A-Z][a-z]/.test(text) && !/^I\b/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

function stop(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The one card to name in an evening cue: an evening card first, then any card, rotating by day. */
function pick(open: readonly CueHabit[], dayIndex: number): CueHabit {
  const evening = open.filter((h) => h.part === 'evening');
  const pool = evening.length ? evening : open.filter((h) => h.part === 'any').length ? open.filter((h) => h.part === 'any') : open;
  return pool[dayIndex % pool.length];
}

/** "Walk: Walk to the corner still counts." */
function floorLine(h: CueHabit): string {
  const floor = (h.floor.trim() || 'The Floor').replace(/[.!?]+$/, '');
  return floor.toLowerCase() === h.name.trim().toLowerCase() ? `${floor} still counts.` : `${h.name}: ${floor} still counts.`;
}

type Draft = Omit<Cue, 'fireAt' | 'id'>;

/**
 * Every cue to schedule from `now`, soonest first. `timeZone` is the phone's, the same one that decides
 * what day it is.
 */
export function cuesFor(snapshot: CueSnapshot, settings: CueSettings, now: Date, timeZone: string): Cue[] {
  const { today, habits } = snapshot;
  if (!habits.length) return [];
  const nowMs = now.getTime();
  const evening = lastCallAt(settings.lastCall);
  const drafts: Draft[] = [];

  // Whether a day ends blank, if nothing more is kept from now on. A card's first day only counts once kept.
  const running = (day: Day) => habits.some((h) => h.startedOn < day);
  const blank = (day: Day) => (day < today ? false : day === today ? !habits.some((h) => h.keptToday) && running(day) : running(day));
  // Yesterday gets its card back when it was blank and isn't a Sunday.
  const saveable = (day: Day) => weekday(day) !== 0 && (day === today ? snapshot.rescue : blank(addDays(day, -1)));
  const openOn = (day: Day) => habits.filter((h) => h.startedOn <= day && (day !== today || !h.keptToday));
  const keptAnyOn = (day: Day) => day === today && habits.some((h) => h.keptToday);

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(today, i);
    const open = openOn(day);
    const dow = weekday(day);

    // Sunday night, while Sunday still has no card: the week's last chance.
    const sundayOpen = dow === 6 && !keptAnyOn(day) && open.length > 0 && !(snapshot.warmup && weekStart(day) === weekStart(today));
    if (sundayOpen) {
      const h = pick(open, i);
      drafts.push({ kind: 'sunday', day, at: TIMES.sunday, title: 'Last card of the week', body: `Showdown at midnight. ${floorLine(h)}`, url: '/', habitId: h.id });
    }

    // The morning after a blank day, while that day can still get its card.
    if (settings.morning && saveable(day)) {
      drafts.push({ kind: 'morning-after', day, at: TIMES.morning, title: MORNING_COPY.title, body: MORNING_COPY.body, url: '/' });
    }

    // Last call, while some card is still open. Sunday night already has its cue.
    if (open.length && !sundayOpen) drafts.push(lastCall(day, i, open, evening, snapshot, saveable(day), keptAnyOn(day)));

    // Calls, today only: on a Monday, or once something kept today means they close at midnight.
    if (i === 0 && snapshot.callWaiting && (dow === 0 || keptAnyOn(day))) {
      drafts.push(
        keptAnyOn(day)
          ? { kind: 'call', day, at: TIMES.call, title: 'Calls close at midnight', body: 'Call this week’s hand. Make it by Sunday and it pays extra.', url: '/call' }
          : { kind: 'call', day, at: TIMES.call, title: 'Calls are open', body: 'Call this week’s hand before your first kept day is over.', url: '/call' },
      );
    }

    // The player's own times, on every day the card is open.
    for (const h of open) {
      if (!h.remindAt || clockMinutes(h.remindAt) === null) continue;
      drafts.push({ kind: 'plays', day, at: clockOf(clockMinutes(h.remindAt)!), title: h.name, body: h.firstMove?.trim() ? `First move: ${firstLower(stop(h.firstMove))}` : `Floor: ${firstLower(stop(h.floor.trim() || h.name))}`, url: '/', habitId: h.id });
    }
  }

  // Monday mornings: last week's Showdown when there is one to see, otherwise a fresh start. Four of them,
  // well past the window, so a quiet week still ends with a way back in.
  const showdown = (day: Day, week: Day): Draft => ({ kind: 'showdown', day, at: TIMES.showdown, title: 'Your Showdown is ready', body: 'See what last week paid, then call this week’s hand.', url: `/showdown?week=${week}` });
  if (weekday(today) === 0 && snapshot.showdownWaiting) drafts.push(showdown(today, snapshot.showdownWaiting));
  const thisWeek = weekStart(today);
  for (let n = 1; n <= MONDAYS_AHEAD; n++) {
    const monday = addDays(thisWeek, 7 * n);
    if (n === 1 && !snapshot.warmup && snapshot.handThisWeek) drafts.push(showdown(monday, thisWeek));
    else drafts.push(newWeek(monday, habits, n));
  }

  // Keep what is still ahead, then hold each day to its share of app-chosen cues.
  const timed = drafts.map((d) => ({ ...d, id: `${d.kind}:${d.day}${d.habitId ? `:${d.habitId}` : ''}`, fireAt: atLocal(d.day, d.at, timeZone) })).filter((c) => c.fireAt > nowMs + 30_000);
  const byDay = new Map<Day, Cue[]>();
  for (const c of timed) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const kept: Cue[] = [];
  for (const [day, cues] of byDay) {
    const away = daysBetween(today, day);
    const own = cues.filter((c) => c.kind === 'plays');
    let chosen = cues.filter((c) => c.kind !== 'plays' && !isQuiet(c.at));
    if (away >= WINDOW_DAYS) chosen = chosen.filter((c) => c.kind === 'new-week' || c.kind === 'showdown');
    if (away >= TAPER_FROM) chosen = chosen.filter((c) => c.kind !== 'morning-after');
    chosen.sort((a, b) => PRIORITY[a.kind as Exclude<CueKind, 'plays'>] - PRIORITY[b.kind as Exclude<CueKind, 'plays'>]);
    kept.push(...chosen.slice(0, away >= TAPER_FROM ? 1 : DAILY_CAP), ...own);
  }
  // The Monday mornings (a Showdown, or a new week) always fit: a deck full of the player's own times only
  // trims the rest of the week ahead, never the way back in.
  const order = (a: Cue, b: Cue) => a.fireAt - b.fireAt || a.id.localeCompare(b.id);
  const monday = (c: Cue) => c.kind === 'new-week' || c.kind === 'showdown';
  const mondays = kept.filter(monday);
  const rest = kept.filter((c) => !monday(c)).sort(order);
  return [...rest.slice(0, MAX_CUES - mondays.length), ...mondays].sort(order);
}

function newWeek(day: Day, habits: readonly CueHabit[], n: number): Draft {
  const h = habits[(n - 1) % habits.length];
  const move = h.firstMove?.trim() || h.floor.trim();
  return { kind: 'new-week', day, at: TIMES.showdown, title: 'A new week. One card starts it.', body: move ? `${h.name}: ${firstLower(stop(move))}` : 'Pick one card and keep it today.', url: '/', habitId: h.id };
}

function lastCall(day: Day, i: number, open: readonly CueHabit[], at: Clock, snapshot: CueSnapshot, rescue: boolean, keptAny: boolean): Draft {
  const base = { kind: 'last-call' as const, day, at, url: '/' as const };
  if (rescue) {
    const h = pick(open, i);
    return { ...base, title: 'Last call for two cards', body: `Keep anything tonight and yesterday gets its card too. ${floorLine(h)}`, habitId: h.id };
  }
  const face = i === 0 && snapshot.faceSoon ? open.find((h) => snapshot.faceSoon!.habitIds.includes(h.id)) : undefined;
  if (face && snapshot.faceSoon) return { ...base, title: `${snapshot.faceSoon.name} is one day away`, body: floorLine(face), habitId: face.id };
  const h = pick(open, i);
  if (keptAny) return { ...base, title: `Last call for ${h.name}`, body: `${(h.floor.trim() || 'The Floor').replace(/[.!?]+$/, '')} still counts tonight.`, habitId: h.id };
  return { ...base, title: 'Last call for today’s card', body: floorLine(h), habitId: h.id };
}

/** What tonight's last call would say with nothing kept yet, for showing the player before they say yes. */
export function previewLastCall(habits: readonly CueHabit[]): { title: string; body: string } {
  if (!habits.length) return { title: 'Last call for today’s card', body: 'Your Floor still counts.' };
  const h = pick(habits, 0);
  return { title: 'Last call for today’s card', body: floorLine(h) };
}
