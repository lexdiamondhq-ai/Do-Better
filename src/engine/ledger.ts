/**
 * The ledger: changes that show at once and still tell the truth.
 *
 * A swipe shows on screen the moment it's made and is saved in the background. If a save fails, only
 * that change is taken back, and only while it is still the newest change to its key: a later swipe on
 * the same card wins, and one failure never wipes another card's check-in. Saves to the same key (one
 * habit on one day, one week's call) go out one after another, so an upsert and then a delete reach the
 * server in that order.
 *
 * The caller owns the state and the network and hands both in. Nothing here knows about React or
 * Supabase, so the rules can be tested on their own.
 */

import type { Day } from './day';
import type { CheckInRow, Level } from './kept';

/** One piece of state a change writes, such as a habit's level on one day. */
export type Lane<S, V> = {
  key: string;
  read: (state: S) => V;
  write: (state: S, value: V) => S;
};

/** A value about to be written to a lane. */
export type Step<S> = {
  key: string;
  apply: (state: S) => S;
  /** What `state` holds in this lane now, as a step that puts it back. */
  keep: (state: S) => (state: S) => S;
};

export function step<S, V>(lane: Lane<S, V>, value: V): Step<S> {
  return {
    key: lane.key,
    apply: (s) => lane.write(s, value),
    keep: (s) => {
      const was = lane.read(s);
      return (t) => lane.write(t, was);
    },
  };
}

/**
 * How a save ended. A failure carries `revert` when the change was still the newest for at least one of
 * its keys: apply it to the current state to put back what the server holds. Null means newer changes
 * own every key, so the failure changes nothing on screen.
 */
export type Outcome<S> = { ok: true } | { ok: false; error: unknown; revert: ((state: S) => S) | null };

export type Ledger<S> = {
  /**
   * Applies the steps to `state` and saves them once every earlier save to the same keys has settled.
   * Show `next` straight away; `done` never rejects.
   */
  change: (state: S, steps: Step<S> | readonly Step<S>[], save: () => Promise<void>) => { next: S; done: Promise<Outcome<S>> };
  /** Records a change the server already holds, so a fetch that started before it can't lose it. */
  note: (apply: (state: S) => S) => void;
  /** A point in time to pass to `replay`: take it just before a fetch starts. */
  mark: () => number;
  /** Fetched data with every unsettled change, and every change saved since `since`, applied on top, oldest first. */
  replay: (fetched: S, since: number) => S;
  /** Changes still waiting for the server. */
  pending: () => number;
  /**
   * `state` as the server holds it: every change still waiting for the server taken back. For anything
   * kept on the phone, so a swipe that never reached the server can't come back as kept after a restart.
   */
  held: (state: S) => S;
};

type Entry<S> = { seq: number; apply: (state: S) => S; status: 'pending' | 'saved' | 'failed'; settledAt: number };

/** `keep` is how many saved changes to remember for `replay`. A fetch never spans more than a few. */
export function createLedger<S>(keep = 100): Ledger<S> {
  let clock = 0;
  // For each key with a change in flight: the newest change, and how to put back what the server holds.
  const owner = new Map<string, number>();
  const onServer = new Map<string, (state: S) => S>();
  // The last save queued for each key, so the next one waits for it.
  const tails = new Map<string, Promise<unknown>>();
  let log: Entry<S>[] = [];

  function prune() {
    const saved = log.filter((e) => e.status === 'saved');
    const old = new Set(saved.slice(0, Math.max(0, saved.length - keep)));
    log = log.filter((e) => e.status !== 'failed' && !old.has(e));
  }

  function change(state: S, given: Step<S> | readonly Step<S>[], save: () => Promise<void>) {
    const steps: readonly Step<S>[] = Array.isArray(given) ? given : [given as Step<S>];
    const seq = ++clock;
    let next = state;
    for (const s of steps) {
      // With nothing in flight for this key, the screen shows what the server holds.
      if (!owner.has(s.key)) onServer.set(s.key, s.keep(state));
      owner.set(s.key, seq);
      next = s.apply(next);
    }
    const entry: Entry<S> = { seq, apply: (x) => steps.reduce((acc, s) => s.apply(acc), x), status: 'pending', settledAt: 0 };
    log.push(entry);

    const earlier = steps.map((s) => tails.get(s.key)?.catch(() => undefined));
    const run = Promise.all(earlier).then(() => save());
    for (const s of steps) tails.set(s.key, run);

    const settle = (status: 'saved' | 'failed') => {
      entry.status = status;
      entry.settledAt = ++clock;
      for (const s of steps) if (tails.get(s.key) === run) tails.delete(s.key);
    };

    const done = run.then(
      (): Outcome<S> => {
        settle('saved');
        for (const s of steps) {
          if (owner.get(s.key) === seq) {
            owner.delete(s.key);
            onServer.delete(s.key);
          } else {
            // A newer change is still on its way; the server now holds this one.
            onServer.set(s.key, s.apply);
          }
        }
        prune();
        return { ok: true };
      },
      (error: unknown): Outcome<S> => {
        settle('failed');
        const back: ((state: S) => S)[] = [];
        for (const s of steps) {
          if (owner.get(s.key) !== seq) continue;
          back.push(onServer.get(s.key) ?? ((x: S) => x));
          owner.delete(s.key);
          onServer.delete(s.key);
        }
        prune();
        return { ok: false, error, revert: back.length ? (x) => back.reduce((acc, put) => put(acc), x) : null };
      },
    );
    return { next, done };
  }

  return {
    change,
    note(apply) {
      const at = ++clock;
      log.push({ seq: at, apply, status: 'saved', settledAt: at });
      prune();
    },
    mark: () => clock,
    replay(fetched, since) {
      return log
        .filter((e) => e.status === 'pending' || (e.status === 'saved' && e.settledAt > since))
        .sort((a, b) => a.seq - b.seq)
        .reduce((s, e) => e.apply(s), fetched);
    },
    pending: () => log.filter((e) => e.status === 'pending').length,
    held(state) {
      // Each key in flight has one way back to what the server holds, and each touches only its own key.
      let s = state;
      for (const put of onServer.values()) s = put(s);
      return s;
    },
  };
}

/** The level a habit was kept at on a day, or null. */
export function levelIn(rows: readonly CheckInRow[], habitId: string, day: Day): Level | null {
  return rows.find((r) => r.habitId === habitId && r.day === day)?.level ?? null;
}

/** A check-in row that may have been logged after its day: `loggedOn` is set only then, to the day it was logged. */
export type LoggedRow = CheckInRow & { loggedOn?: Day };

/**
 * Check-in rows with one habit's day set to `level`, or removed when it's null. Every other row is
 * untouched. Pass `loggedOn` for a day logged late ("Did it, forgot to log"): the row remembers it.
 */
export function withLevel(rows: readonly LoggedRow[], habitId: string, day: Day, level: Level | null, loggedOn?: Day): LoggedRow[] {
  const i = rows.findIndex((r) => r.habitId === habitId && r.day === day);
  if (level === null) return i < 0 ? [...rows] : [...rows.slice(0, i), ...rows.slice(i + 1)];
  const row: LoggedRow = loggedOn && loggedOn > day ? { habitId, day, level, loggedOn } : { habitId, day, level };
  return i < 0 ? [...rows, row] : [...rows.slice(0, i), row, ...rows.slice(i + 1)];
}

/**
 * One habit's check-in on one day, in any state that keeps its check-ins as rows under `days`. `loggedOn`
 * marks a check-in logged after its day, so the game knows it was logged late.
 */
export function checkInLane<S extends { days: readonly LoggedRow[] }>(habitId: string, day: Day, loggedOn?: Day): Lane<S, Level | null> {
  return {
    key: `day:${habitId}:${day}`,
    read: (s) => levelIn(s.days, habitId, day),
    write: (s, level) => ({ ...s, days: withLevel(s.days, habitId, day, level, loggedOn) }),
  };
}

/** The check-ins logged after their day, by habit then day, with the day each was logged. For `GameInput.late`. */
export function lateIndex(rows: readonly LoggedRow[]): Map<string, Map<Day, Day>> {
  const out = new Map<string, Map<Day, Day>>();
  for (const r of rows) {
    if (!r.loggedOn || r.loggedOn <= r.day) continue;
    let days = out.get(r.habitId);
    if (!days) out.set(r.habitId, (days = new Map()));
    days.set(r.day, r.loggedOn);
  }
  return out;
}
