import { describe, expect, it } from 'vitest';

import type { CheckInRow } from './kept';
import { checkInLane, createLedger, levelIn, step, withLevel, type Lane, type Outcome } from './ledger';

type State = { days: CheckInRow[]; positions: Record<string, number> };

const empty: State = { days: [], positions: {} };

/** A save the test finishes by hand, to put completions in any order. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued promise callback run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const lane = (habitId: string, day = '2026-10-14') => checkInLane<State>(habitId, day);

const position = (id: string): Lane<State, number | undefined> => ({
  key: `pos:${id}`,
  read: (s) => s.positions[id],
  write: (s, v) => {
    const positions = { ...s.positions };
    if (v === undefined) delete positions[id];
    else positions[id] = v;
    return { ...s, positions };
  },
});

/** Applies a failure's revert to the state, as the data layer does. */
function settle(state: State, out: Outcome<State>): State {
  return !out.ok && out.revert ? out.revert(state) : state;
}

describe('the ledger', () => {
  it('keeps two quick check-ins made before the screen catches up', async () => {
    const ledger = createLedger<State>();
    const a = ledger.change(empty, step(lane('read'), 'floor'), async () => {});
    const b = ledger.change(a.next, step(lane('walk'), 'ceiling'), async () => {});
    expect(levelIn(b.next.days, 'read', '2026-10-14')).toBe('floor');
    expect(levelIn(b.next.days, 'walk', '2026-10-14')).toBe('ceiling');
    expect(await a.done).toEqual({ ok: true });
    expect(await b.done).toEqual({ ok: true });
    expect(ledger.pending()).toBe(0);
  });

  it('takes back only the failed check-in, never another card saved meanwhile', async () => {
    const ledger = createLedger<State>();
    const saveA = deferred();
    const saveB = deferred();
    const a = ledger.change(empty, step(lane('read'), 'floor'), () => saveA.promise);
    const b = ledger.change(a.next, step(lane('walk'), 'floor'), () => saveB.promise);
    let state = b.next;
    saveB.resolve();
    expect(await b.done).toEqual({ ok: true });
    saveA.reject(new Error('offline'));
    const out = await a.done;
    expect(out.ok).toBe(false);
    state = settle(state, out);
    expect(levelIn(state.days, 'read', '2026-10-14')).toBeNull();
    expect(levelIn(state.days, 'walk', '2026-10-14')).toBe('floor');
  });

  it('takes back several failures in any order without bringing any of them back', async () => {
    // Four slow swipes that all fail, oldest first: the screen must end with nothing kept.
    const ledger = createLedger<State>();
    const saves = ['a', 'b', 'c', 'd'].map(() => deferred());
    let state = empty;
    const changes = ['a', 'b', 'c', 'd'].map((id, i) => {
      const c = ledger.change(state, step(lane(id), 'floor'), () => saves[i].promise);
      state = c.next;
      return c;
    });
    for (const [i, s] of saves.entries()) {
      s.reject(new Error('timeout'));
      state = settle(state, await changes[i].done);
    }
    expect(state.days).toEqual([]);
  });

  it('never lets an older failure undo a newer change to the same card', async () => {
    const ledger = createLedger<State>();
    const first = deferred();
    const second = deferred();
    let secondStarted = false;
    const a = ledger.change(empty, step(lane('read'), 'floor'), () => first.promise);
    const b = ledger.change(a.next, step(lane('read'), 'ceiling'), () => {
      secondStarted = true;
      return second.promise;
    });
    let state = b.next;
    await flush();
    expect(secondStarted).toBe(false);
    first.reject(new Error('offline'));
    const outA = await a.done;
    expect(outA).toMatchObject({ ok: false, revert: null });
    state = settle(state, outA);
    await flush();
    expect(secondStarted).toBe(true);
    second.resolve();
    expect(await b.done).toEqual({ ok: true });
    expect(levelIn(state.days, 'read', '2026-10-14')).toBe('ceiling');
  });

  it('puts back what the server last saved when the newest change fails', async () => {
    const ledger = createLedger<State>();
    const a = ledger.change(empty, step(lane('read'), 'floor'), async () => {});
    const b = ledger.change(a.next, step(lane('read'), null), async () => {
      throw new Error('offline');
    });
    let state = b.next;
    expect(levelIn(state.days, 'read', '2026-10-14')).toBeNull();
    expect(await a.done).toEqual({ ok: true });
    state = settle(state, await b.done);
    expect(levelIn(state.days, 'read', '2026-10-14')).toBe('floor');
  });

  it('sends an upsert and then a delete for the same card in that order', async () => {
    const ledger = createLedger<State>();
    const calls: string[] = [];
    const upsert = deferred();
    const a = ledger.change(empty, step(lane('read'), 'floor'), () => {
      calls.push('upsert');
      return upsert.promise;
    });
    const b = ledger.change(a.next, step(lane('read'), null), async () => {
      calls.push('delete');
    });
    await flush();
    expect(calls).toEqual(['upsert']);
    upsert.resolve();
    await a.done;
    await b.done;
    expect(calls).toEqual(['upsert', 'delete']);
    expect(levelIn(b.next.days, 'read', '2026-10-14')).toBeNull();
  });

  it('keeps saving a card after one of its saves failed', async () => {
    const ledger = createLedger<State>();
    const a = ledger.change(empty, step(lane('read'), 'floor'), async () => {
      throw new Error('offline');
    });
    const b = ledger.change(a.next, step(lane('read'), 'ceiling'), async () => {});
    expect((await a.done).ok).toBe(false);
    expect(await b.done).toEqual({ ok: true });
  });

  it('lets saves to different cards finish in any order', async () => {
    const ledger = createLedger<State>();
    const saveA = deferred();
    const saveB = deferred();
    const a = ledger.change(empty, step(lane('read'), 'floor'), () => saveA.promise);
    const b = ledger.change(a.next, step(lane('walk'), 'ceiling'), () => saveB.promise);
    saveB.resolve();
    expect(await b.done).toEqual({ ok: true });
    expect(ledger.pending()).toBe(1);
    saveA.resolve();
    expect(await a.done).toEqual({ ok: true });
    expect(ledger.pending()).toBe(0);
  });

  it('takes back a change to several keys only where nothing newer replaced it', async () => {
    const ledger = createLedger<State>();
    const start: State = { ...empty, positions: { a: 0, b: 1 } };
    const slow = deferred();
    const swap = ledger.change(start, [step(position('a'), 1), step(position('b'), 0)], () => slow.promise);
    const again = ledger.change(swap.next, step(position('a'), 5), async () => {});
    let state = again.next;
    slow.reject(new Error('offline'));
    state = settle(state, await swap.done);
    await again.done;
    expect(state.positions).toEqual({ a: 5, b: 1 });
  });

  it('replays unsettled and freshly saved changes over fetched data', async () => {
    const ledger = createLedger<State>();
    const before = ledger.mark();
    const slow = deferred();
    const saved = ledger.change(empty, step(lane('read'), 'floor'), async () => {});
    await saved.done;
    const inFlight = ledger.change(saved.next, step(lane('walk'), 'ceiling'), () => slow.promise);
    const failed = ledger.change(inFlight.next, step(lane('plan'), 'floor'), async () => {
      throw new Error('offline');
    });
    await failed.done;
    ledger.note((s) => ({ ...s, positions: { ...s.positions, read: 3 } }));

    // A fetch that started before all of this has none of it.
    const merged = ledger.replay(empty, before);
    expect(levelIn(merged.days, 'read', '2026-10-14')).toBe('floor');
    expect(levelIn(merged.days, 'walk', '2026-10-14')).toBe('ceiling');
    expect(levelIn(merged.days, 'plan', '2026-10-14')).toBeNull();
    expect(merged.positions).toEqual({ read: 3 });

    // A fetch that started after them only needs what is still in flight.
    const later = ledger.replay(empty, ledger.mark());
    expect(later.days).toEqual([{ habitId: 'walk', day: '2026-10-14', level: 'ceiling' }]);
    slow.resolve();
    await inFlight.done;
  });
});

describe('check-in rows', () => {
  const rows: CheckInRow[] = [
    { habitId: 'read', day: '2026-10-13', level: 'floor' },
    { habitId: 'walk', day: '2026-10-13', level: 'ceiling' },
  ];

  it('sets, upgrades and removes one day without touching the others', () => {
    expect(withLevel(rows, 'read', '2026-10-13', 'ceiling')).toEqual([
      { habitId: 'read', day: '2026-10-13', level: 'ceiling' },
      { habitId: 'walk', day: '2026-10-13', level: 'ceiling' },
    ]);
    expect(withLevel(rows, 'read', '2026-10-14', 'floor')).toHaveLength(3);
    expect(withLevel(rows, 'walk', '2026-10-13', null)).toEqual([{ habitId: 'read', day: '2026-10-13', level: 'floor' }]);
    expect(withLevel(rows, 'walk', '2026-10-12', null)).toEqual(rows);
    expect(rows).toHaveLength(2);
  });
});
