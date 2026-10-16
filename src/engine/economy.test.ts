/**
 * The economy as a contract. Simulated players keep their habits for 52 weeks, 50 decks each, through the
 * real engine, and the averages have to keep the game's promises: more effort always pays more, weeks vary,
 * Jokers are never lost, the top hands stay rare and the tables open at a steady pace.
 *
 * Calls follow an average player: the Safe, Stretch and Long shot choices in turn, week by week.
 *
 * Run `ECONOMY=print npx vitest run src/engine/economy.test.ts` to print what the tuning uses: each player's
 * chips and hands, the week each table opens, and the CALL_BASELINE table.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { Suit } from './cards';
import { addDays, weekday, type Day } from './day';
import { dealWeek, riverCard, type DealHabit } from './deal';
import { CALL_BASELINE, CALLABLE, callChoices, callPrices, placeJokers, playPastWeeks, TABLES, weekTotal, type GameInput, type Week } from './game';
import type { Level } from './kept';
import { atLeast, bestHand, HAND_LADDER, HANDS, makesCall, SUITED_BONUS, type HandKind } from './poker';

const WEEKS = 52;
const SEEDS = 50;
const START: Day = '2025-01-06'; // a Monday
const PRINT = process.env.ECONOMY === 'print';

/** A small, fast, seeded generator, so every run simulates the same players. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How one habit goes on a day: its weekday (0 is Monday), its place in the deck and the dice. */
type Keep = (wd: number, habit: number, r: () => number) => Level | null;
type Player = { name: string; suits: Suit[]; keep: Keep };

const S4: Suit[] = ['spades', 'clubs', 'hearts', 'diamonds'];
const chance = (keep: number, ceiling: number): Keep => (_w, _h, r) => (r() < keep ? (r() < ceiling ? 'ceiling' : 'floor') : null);
const daily = (level: Level, habits = 4): Keep => (_w, h) => (h < habits ? level : null);

const PLAYERS = {
  lazy: { name: 'lazy 3h 40%/15%', suits: S4.slice(0, 3), keep: chance(0.4, 0.15) },
  patchy: { name: 'patchy 3h 60%/20%', suits: S4.slice(0, 3), keep: chance(0.6, 0.2) },
  steady: { name: 'steady 4h 85%/30%', suits: S4, keep: chance(0.85, 0.3) },
  ceiling: { name: 'Ceiling 4h 95%/70%', suits: S4, keep: chance(0.95, 0.7) },
  solo: { name: 'solo 1h 85%/40%', suits: ['clubs'], keep: chance(0.85, 0.4) },
  soloCeiling: { name: 'solo 1h every Ceiling', suits: ['clubs'], keep: daily('ceiling', 1) },
  allCeiling: { name: '4h every Ceiling', suits: S4, keep: daily('ceiling') },
  threeCeilings: { name: '4h, 3 at the Ceiling, 1 skipped', suits: S4, keep: daily('ceiling', 3) },
  everyOtherDay: { name: '4h every other day', suits: S4, keep: (w) => (w % 2 === 0 ? 'floor' : null) },
  single: { name: '3h one suit 85%/30%', suits: ['spades', 'spades', 'spades'], keep: chance(0.85, 0.3) },
  balanced: { name: '3h three suits 85%/30%', suits: S4.slice(0, 3), keep: chance(0.85, 0.3) },
  floor1: { name: '4h, 1 at the Floor', suits: S4, keep: daily('floor', 1) },
  floor2: { name: '4h, 2 at the Floor', suits: S4, keep: daily('floor', 2) },
  floor3: { name: '4h, 3 at the Floor', suits: S4, keep: daily('floor', 3) },
  floor4: { name: '4h, all 4 at the Floor', suits: S4, keep: daily('floor') },
  ceiling1: { name: '4h all kept, 1 at the Ceiling', suits: S4, keep: (_w, h) => (h < 1 ? 'ceiling' : 'floor') },
  ceiling2: { name: '4h all kept, 2 at the Ceiling', suits: S4, keep: (_w, h) => (h < 2 ? 'ceiling' : 'floor') },
  ceiling3: { name: '4h all kept, 3 at the Ceiling', suits: S4, keep: (_w, h) => (h < 3 ? 'ceiling' : 'floor') },
  steadyLess: { name: 'steady, without its 4th habit', suits: S4, keep: (w, h, r) => (h === 3 ? (r(), r(), null) : chance(0.85, 0.3)(w, h, r)) },
} satisfies Record<string, Player>;

type Name = keyof typeof PLAYERS;

function history(p: Player, seed: number, weeks = WEEKS): GameInput {
  const r = rng(seed * 13 + 7);
  const habits: DealHabit[] = p.suits.map((suit, i) => ({ id: `h${i}`, suit, startedOn: START, archivedOn: null }));
  const checkIns = new Map<string, Map<Day, Level>>(habits.map((h) => [h.id, new Map()]));
  for (let d = 0; d < weeks * 7; d++) {
    const day = addDays(START, d);
    for (let i = 0; i < p.suits.length; i++) {
      const level = p.keep(weekday(day), i, r);
      if (level) checkIns.get(`h${i}`)!.set(day, level);
    }
  }
  return { seed: `player-${seed}`, today: addDays(START, weeks * 7), habits, checkIns, calls: new Map() };
}

/** The average player's call for each week, and what it paid. Hands never depend on calls, so this follows the engine. */
function averageCalls(weeks: readonly Week[], deckSize: number): { calls: Map<Day, HandKind>; bonus: number[] } {
  const calls = new Map<Day, HandKind>();
  const bonus = weeks.map((w, i) => {
    const choices = callChoices({ callOdds: callPrices(weeks.slice(0, i), deckSize) });
    const turn = [choices.safe, choices.stretch, choices.longShot];
    const pick = turn[i % 3] ?? turn.find((c) => c !== null) ?? null;
    if (!pick) return 0;
    calls.set(w.start, pick.kind);
    return makesCall(w.hand, pick.kind) ? HANDS[pick.kind].chips * pick.multiplier : 0;
  });
  return { calls, bonus };
}

type Result = {
  /** Average chips a week from hands alone, and with the average player's calls. */
  hands: number;
  total: number;
  /** Share of weeks ending on each kind. */
  share: Partial<Record<HandKind, number>>;
  suited: number;
  /** The average stack at the end of each week, calls included. */
  stack: number[];
  /** The week each deck's stack reached each table. */
  opened: (number | null)[][];
  jokers: { faces: number; dealt: number; waiting: number; stuck: number };
};

function simulate(p: Player, seeds = SEEDS): Result {
  let hands = 0;
  let total = 0;
  let suited = 0;
  let n = 0;
  const kinds: Partial<Record<HandKind, number>> = {};
  const stack = new Array<number>(WEEKS).fill(0);
  const opened: (number | null)[][] = [];
  const jokers = { faces: 0, dealt: 0, waiting: 0, stuck: 0 };
  for (let seed = 0; seed < seeds; seed++) {
    const input = history(p, seed);
    const weeks = playPastWeeks(input);
    const { bonus } = averageCalls(weeks, p.suits.length);
    let sum = 0;
    const reached = TABLES.map(() => null as number | null);
    weeks.forEach((w, i) => {
      n++;
      hands += weekTotal(w);
      total += weekTotal(w) + bonus[i];
      sum += weekTotal(w) + bonus[i];
      stack[i] += sum / seeds;
      TABLES.forEach((t, k) => {
        if (reached[k] === null && sum >= t.chips) reached[k] = i + 1;
      });
      if (w.hand) kinds[w.hand.kind] = (kinds[w.hand.kind] ?? 0) + 1;
      if (w.hand?.suited) suited++;
      jokers.dealt += w.slots.filter((s) => s.card?.kind === 'joker').length;
    });
    opened.push(reached);
    const placed = placeJokers(input);
    jokers.faces += placed.faces.length;
    jokers.waiting += placed.waiting.length;
    // A Joker still waiting is only fine for a face card earned in the last four weeks.
    jokers.stuck += placed.waiting.filter((f) => f.day < addDays(input.today, -28)).length;
  }
  const share = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v / n]));
  return { hands: hands / n, total: total / n, share, suited: suited / n, stack, opened, jokers };
}

const results = new Map<Name, Result>();
const run = (name: Name) => results.get(name)!;

/** How often turning one Floor check-in into a Ceiling lowers what that week pays, over steady players' weeks. */
function upgradeLowers(seeds: number): { tried: number; lower: number; lowerScore: number } {
  const out = { tried: 0, lower: 0, lowerScore: 0 };
  for (let seed = 0; seed < seeds; seed++) {
    const input = history(PLAYERS.steady, 500 + seed);
    const { days: jokerDays } = placeJokers(input);
    const r = rng(9000 + seed);
    for (let w = 0; w < WEEKS; w++) {
      const start = addDays(START, 7 * w);
      const floors: [string, Day][] = [];
      for (const h of input.habits) for (const [day, level] of input.checkIns.get(h.id)!) if (level === 'floor' && day >= start && day < addDays(start, 7)) floors.push([h.id, day]);
      if (!floors.length) continue;
      const [id, day] = floors[Math.floor(r() * floors.length)];
      const pays = (checkIns: GameInput['checkIns']) => {
        const slots = dealWeek(start, input.today, input.habits, checkIns, input.seed, jokerDays);
        const river = riverCard(start, slots, input.seed);
        const hand = bestHand([...slots.flatMap((s) => (s.card ? [s.card] : [])), ...(river ? [river] : [])]);
        return { chips: hand ? HANDS[hand.kind].chips : 0, score: hand?.score ?? 0 };
      };
      const before = pays(input.checkIns);
      const upgraded = new Map(input.checkIns);
      upgraded.set(id, new Map(input.checkIns.get(id)!).set(day, 'ceiling'));
      const after = pays(upgraded);
      out.tried++;
      if (after.chips < before.chips) out.lower++;
      if (after.score < before.score) out.lowerScore++;
    }
  }
  return out;
}

/** How often a typical deck of `n` habits makes each callable hand or better: the table CALL_BASELINE holds. */
function baseline(n: number, seeds: number): Record<string, number> {
  const suits = Array.from({ length: n }, (_, i) => S4[i % 4]);
  const made: Record<string, number> = {};
  let weeks = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const w of playPastWeeks(history({ name: '', suits, keep: chance(0.8, 0.3) }, 1000 + seed))) {
      weeks++;
      for (const kind of CALLABLE) if (w.hand && atLeast(w.hand.kind, kind)) made[kind] = (made[kind] ?? 0) + 1;
    }
  }
  return Object.fromEntries(CALLABLE.map((k) => [k, (made[k] ?? 0) / weeks]));
}

const started = Date.now();

beforeAll(() => {
  for (const name of Object.keys(PLAYERS) as Name[]) results.set(name, simulate(PLAYERS[name]));
  if (!PRINT) return;
  const pct = (x = 0) => `${(100 * x).toFixed(1)}%`;
  for (const name of Object.keys(PLAYERS) as Name[]) {
    const r = run(name);
    const hands = HAND_LADDER.filter((k) => r.share[k]).map((k) => `${HANDS[k].name} ${pct(r.share[k])}`).join(', ');
    console.log(`${PLAYERS[name].name.padEnd(32)} ${r.hands.toFixed(1).padStart(6)} a week, ${r.total.toFixed(1).padStart(6)} with calls, Suited ${pct(r.suited)}. ${hands}`);
  }
  const steady = run('steady');
  const median = (k: number) => {
    const weeks = steady.opened.map((o) => o[k] ?? Infinity).sort((a, b) => a - b);
    return weeks[Math.floor(weeks.length / 2)];
  };
  console.log(`Steady stack by week: ${steady.stack.map((x, w) => `${w + 1}: ${x.toFixed(0)}`).join(', ')}. Weekly from week 27: ${((steady.stack[51] - steady.stack[25]) / 26).toFixed(0)}`);
  console.log(`Tables, median week a steady deck opens them: ${TABLES.map((t, k) => `${t.name} ${median(k)}`).join(', ')}`);
  for (let n = 1; n <= 6; n++) {
    const b = baseline(n, 60);
    console.log(`  ${n}: { ${CALLABLE.map((k) => `${k.includes('-') ? `'${k}'` : k}: ${b[k] < 0.1 ? b[k].toFixed(3) : b[k].toFixed(2)}`).join(', ')} },`);
  }
  console.log(`Upgrades: ${JSON.stringify(upgradeLowers(SEEDS))}`);
  // What each kind of call is worth to a steady player, on average, once they have 8 weeks behind them.
  const worth = { safe: [0, 0], stretch: [0, 0], longShot: [0, 0] };
  for (let seed = 0; seed < 20; seed++) {
    const weeks = playPastWeeks(history(PLAYERS.steady, seed));
    for (let i = 8; i < weeks.length; i++) {
      const choices = callChoices({ callOdds: callPrices(weeks.slice(0, i), 4) });
      for (const key of ['safe', 'stretch', 'longShot'] as const) {
        const c = choices[key];
        if (!c) continue;
        worth[key][0] += c.p * c.payout;
        worth[key][1]++;
      }
    }
  }
  console.log(`Steady calls, expected bonus a week: ${Object.entries(worth).map(([k, [sum, n]]) => `${k} ${(sum / Math.max(1, n)).toFixed(0)} (${n} weeks)`).join(', ')}`);
}, 120_000);

describe('more effort pays more', () => {
  it('pays more for keeping more of the deck, Floor by Floor and Ceiling by Ceiling', () => {
    const floors = (['floor1', 'floor2', 'floor3', 'floor4'] as Name[]).map((n) => run(n).total);
    const ceilings = (['floor4', 'ceiling1', 'ceiling2', 'ceiling3', 'allCeiling'] as Name[]).map((n) => run(n).total);
    for (let i = 1; i < floors.length; i++) expect(floors[i]).toBeGreaterThanOrEqual(floors[i - 1]);
    for (let i = 1; i < ceilings.length; i++) expect(ceilings[i]).toBeGreaterThanOrEqual(ceilings[i - 1]);
    expect(run('steady').total).toBeGreaterThanOrEqual(run('steadyLess').total);
    // And from hands alone, before any call.
    expect(run('floor4').hands).toBeGreaterThanOrEqual(run('floor1').hands);
    expect(run('steady').hands).toBeGreaterThanOrEqual(run('steadyLess').hands);
  });

  it('pays every day at least 1.3 times every other day', () => {
    expect(run('floor4').total).toBeGreaterThanOrEqual(1.3 * run('everyOtherDay').total);
  });

  it('pays all four at the Floor more than three of four at the Ceiling', () => {
    expect(run('floor4').total).toBeGreaterThan(run('threeCeilings').total);
  });

  it('ranks lazy below patchy below steady below Ceiling', () => {
    const totals = (['lazy', 'patchy', 'steady', 'ceiling'] as Name[]).map((n) => run(n).total);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    expect(new Set(totals).size).toBe(4);
  });

  it('almost never lowers a week when a Floor becomes a Ceiling', () => {
    const { tried, lower } = upgradeLowers(SEEDS);
    expect(tried).toBeGreaterThan(SEEDS * WEEKS * 0.9);
    expect(lower / tried).toBeLessThan(0.02);
  });
});

describe('weeks vary', () => {
  it('ends no more than 40% of a steady player’s weeks on the same hand', () => {
    expect(Math.max(...Object.values(run('steady').share))).toBeLessThanOrEqual(0.4);
  });

  it('keeps the Royal flush to 5% of weeks and Five of a kind to 2%, for every player', () => {
    for (const name of Object.keys(PLAYERS) as Name[]) {
      expect(run(name).share['royal-flush'] ?? 0, PLAYERS[name].name).toBeLessThanOrEqual(0.05);
      expect(run(name).share['five-of-a-kind'] ?? 0, PLAYERS[name].name).toBeLessThanOrEqual(0.02);
    }
  });
});

describe('Suited', () => {
  it('pays only if it shows up in 15% to 50% of steady weeks and a balanced deck still earns at least as much as one suit', () => {
    const steady = run('steady').suited;
    if (SUITED_BONUS > 0) {
      expect(steady).toBeGreaterThanOrEqual(0.15);
      expect(steady).toBeLessThanOrEqual(0.5);
    }
    expect(run('balanced').total).toBeGreaterThanOrEqual(run('single').total);
    expect(run('balanced').hands).toBeGreaterThanOrEqual(run('single').hands);
  });
});

describe('Jokers', () => {
  it('never loses one: every face card’s Joker is dealt, or waits at most a few weeks', () => {
    for (const name of Object.keys(PLAYERS) as Name[]) {
      const { faces, dealt, waiting, stuck } = run(name).jokers;
      expect(dealt + waiting, PLAYERS[name].name).toBe(faces);
      expect(stuck, PLAYERS[name].name).toBe(0);
    }
    expect(run('steady').jokers.faces).toBeGreaterThan(0);
  });
});

describe('tables', () => {
  /** The median week a steady deck reaches table `k`. */
  const median = (k: number) => {
    const weeks = run('steady').opened.map((o) => o[k] ?? Infinity).sort((a, b) => a - b);
    return weeks[Math.floor(weeks.length / 2)];
  };
  const at = (key: string) => median(TABLES.findIndex((t) => t.key === key));

  it('opens the Gold room for a steady player within the year', () => {
    const gold = TABLES.findIndex((t) => t.key === 'gold-room');
    const within = run('steady').opened.filter((o) => o[gold] !== null && o[gold]! <= WEEKS).length;
    expect(within / SEEDS).toBeGreaterThanOrEqual(0.9);
  });

  it('opens the Card room around week 2 to 3, Velvet around 7, Midnight around 16 and Gold around 36', () => {
    expect(at('card-room')).toBeGreaterThanOrEqual(2);
    expect(at('card-room')).toBeLessThanOrEqual(3);
    expect(at('velvet-room')).toBeGreaterThanOrEqual(6);
    expect(at('velvet-room')).toBeLessThanOrEqual(8);
    expect(at('midnight')).toBeGreaterThanOrEqual(14);
    expect(at('midnight')).toBeLessThanOrEqual(18);
    expect(at('gold-room')).toBeGreaterThanOrEqual(33);
    expect(at('gold-room')).toBeLessThanOrEqual(39);
  });

  it('spaces the tables after Gold about 10 to 13 weeks of steady chips apart', () => {
    const steady = run('steady');
    const weekly = (steady.stack[WEEKS - 1] - steady.stack[25]) / 26;
    const after = TABLES.slice(TABLES.findIndex((t) => t.key === 'gold-room'));
    for (let i = 1; i < after.length; i++) {
      const weeks = (after[i].chips - after[i - 1].chips) / weekly;
      expect(weeks, after[i].name).toBeGreaterThanOrEqual(10);
      expect(weeks, after[i].name).toBeLessThanOrEqual(13);
    }
  });
});

describe('calls', () => {
  it('prices a new player from how often a deck their size makes each hand', () => {
    for (let n = 1; n <= 6; n++) {
      const sim = baseline(n, 25);
      for (const kind of CALLABLE) expect(Math.abs(sim[kind] - (CALL_BASELINE[n][kind] ?? 0)), `${n} habits, ${kind}`).toBeLessThan(0.05);
    }
  });

  it('follows the engine: the same calls through playGame pay the same', () => {
    const input = history(PLAYERS.steady, 3);
    const weeks = playPastWeeks(input);
    const { calls, bonus } = averageCalls(weeks, 4);
    const played = playPastWeeks({ ...input, calls });
    expect(played.map((w) => w.bonus)).toEqual(bonus);
  });
});

describe('the simulation', () => {
  it('runs in under 30 seconds', () => {
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});
