/**
 * The Playbook: the ideas behind Do Better, drawn from the best-known work on habits, plus ready-made
 * habit cards built on them. `recommend` picks which ideas matter for this person today, from their
 * own deck and history, so advice shows up where it can be used instead of in a reading list.
 *
 * Sources are credited by book and author. The summaries are our own words.
 */

import { daysBetween, type Day } from './day';

export type PrincipleKey =
  | 'identity'
  | 'two-minute'
  | 'never-miss-twice'
  | 'habit-stacking'
  | 'when-where'
  | 'celebrate'
  | 'habit-loop'
  | 'keystone'
  | 'environment'
  | 'friction'
  | 'temptation-bundling'
  | 'fresh-start'
  | 'four-laws'
  | 'compound'
  | 'woop'
  | 'goldilocks'
  | 'focus'
  | 'deep-work'
  | 'sleep';

export type Principle = {
  key: PrincipleKey;
  title: string;
  /** One or two sentences in plain words. */
  idea: string;
  /** What to do about it in Do Better, right now. */
  tryThis: string;
  source: string;
};

export const PRINCIPLES: Record<PrincipleKey, Principle> = {
  identity: {
    key: 'identity',
    title: 'Start with who, not what',
    idea: 'Lasting change comes from deciding who you want to be. Every time you keep a habit, you cast a vote for that person.',
    tryThis: 'Give each card an identity, like "a reader". Every kept day adds a vote.',
    source: 'Atomic Habits, James Clear',
  },
  'two-minute': {
    key: 'two-minute',
    title: 'The two-minute rule',
    idea: 'Shrink a habit until it takes two minutes. You have to show up before you can get good.',
    tryThis: 'Make your Floor something you could do on your worst day, and add a two-minute version for rescue days.',
    source: 'Atomic Habits, James Clear',
  },
  'never-miss-twice': {
    key: 'never-miss-twice',
    title: 'Never miss twice',
    idea: 'Missing once is an accident. Missing twice is the start of a new habit. The day after a miss matters more than any other.',
    tryThis: 'When a card turns dark, swipe down for the Floor. That is all it takes.',
    source: 'Atomic Habits, James Clear',
  },
  'habit-stacking': {
    key: 'habit-stacking',
    title: 'Stack it on something you already do',
    idea: 'Tie a new habit to one you never forget: "After I pour my coffee, I will…". The old habit becomes the reminder.',
    tryThis: 'Add an "After I…" anchor to each card.',
    source: 'Atomic Habits, James Clear, building on Tiny Habits, BJ Fogg',
  },
  'when-where': {
    key: 'when-where',
    title: 'Decide when and where',
    idea: 'People who plan exactly when and where they will act follow through far more often than people who only intend to.',
    tryThis: 'Give the card a time and a place, like "7 am, kitchen table".',
    source: 'Implementation intentions research, Peter Gollwitzer',
  },
  celebrate: {
    key: 'celebrate',
    title: 'Celebrate straight away',
    idea: 'Feeling good right after an action is what wires it in. A small "yes!" counts.',
    tryThis: 'Every swipe is a little win. Let yourself enjoy it.',
    source: 'Tiny Habits, BJ Fogg',
  },
  'habit-loop': {
    key: 'habit-loop',
    title: 'Cue, routine, reward',
    idea: 'Every habit runs on a loop. Keep the cue and the reward, and you can swap the routine in the middle.',
    tryThis: 'Notice what sets off a habit you want to change, and put a card on that moment.',
    source: 'The Power of Habit, Charles Duhigg',
  },
  keystone: {
    key: 'keystone',
    title: 'Keystone habits',
    idea: 'Some habits pull others along with them. Moving your body and sleeping well are the classic examples.',
    tryThis: 'If you are starting out, make your first card a keystone like a walk or lights out.',
    source: 'The Power of Habit, Charles Duhigg',
  },
  environment: {
    key: 'environment',
    title: 'Let the room do the work',
    idea: 'Most habits are triggered by surroundings, not willpower. Make the good thing the easy thing to see and reach.',
    tryThis: 'Leave the book on your pillow, the shoes by the door, the bottle on the desk.',
    source: 'Good Habits, Bad Habits, Wendy Wood',
  },
  friction: {
    key: 'friction',
    title: 'Add friction to what you want less of',
    idea: 'A few extra seconds of effort is enough to stop a habit you do on autopilot.',
    tryThis: 'Charge your phone outside the bedroom. Log out of the app you keep opening.',
    source: 'Good Habits, Bad Habits, Wendy Wood',
  },
  'temptation-bundling': {
    key: 'temptation-bundling',
    title: 'Bundle it with something you love',
    idea: 'Pair a habit you should do with something you want to do, and only allow the treat during the habit.',
    tryThis: 'Save your favourite podcast for walks, or your best coffee for the writing hour.',
    source: 'How to Change, Katy Milkman',
  },
  'fresh-start': {
    key: 'fresh-start',
    title: 'Use a fresh start',
    idea: 'Mondays, new months and birthdays feel like clean pages, and people start more successfully on them.',
    tryThis: 'Today is a good day to add one new card.',
    source: 'How to Change, Katy Milkman',
  },
  'four-laws': {
    key: 'four-laws',
    title: 'Obvious, attractive, easy, satisfying',
    idea: 'To build a habit, make it obvious, make it attractive, make it easy and make it satisfying. To break one, do the opposite.',
    tryThis: 'Pick your hardest card and fix whichever of the four is missing.',
    source: 'Atomic Habits, James Clear',
  },
  compound: {
    key: 'compound',
    title: 'Small wins compound',
    idea: 'Getting a little better every day adds up to something huge over a year, even when no single day feels like much.',
    tryThis: 'Look at your pile, not today. Every card in it counts forever.',
    source: 'Atomic Habits, James Clear',
  },
  woop: {
    key: 'woop',
    title: 'Plan for the obstacle',
    idea: 'Picture what you want, then picture what will get in the way, then decide in advance what you will do when it happens.',
    tryThis: 'Name the thing most likely to stop you today, and decide your Floor for that moment.',
    source: 'Rethinking Positive Thinking, Gabriele Oettingen',
  },
  goldilocks: {
    key: 'goldilocks',
    title: 'Just hard enough',
    idea: 'We stay motivated when a task sits right at the edge of what we can do: not too easy, not too hard.',
    tryThis: 'If you hit the Ceiling most days, raise it. If you never do, bring it closer.',
    source: 'Atomic Habits, James Clear',
  },
  focus: {
    key: 'focus',
    title: 'Fewer, better',
    idea: 'Doing a few things well beats doing many things badly. Extra habits compete for the same attention.',
    tryThis: 'Keep the cards that matter most and archive the rest for now.',
    source: 'The ONE Thing, Gary Keller',
  },
  'deep-work': {
    key: 'deep-work',
    title: 'Protect deep work',
    idea: 'Focused, uninterrupted work is rare and valuable. It has to be scheduled, or it never happens.',
    tryThis: 'Add a deep work card with a Floor of 10 focused minutes.',
    source: 'Deep Work, Cal Newport',
  },
  sleep: {
    key: 'sleep',
    title: 'Sleep on a schedule',
    idea: 'Going to bed and waking at the same times is one of the simplest things you can do for your energy and mood.',
    tryThis: 'Try a lights-out card with the same time every night.',
    source: 'Why We Sleep, Matthew Walker',
  },
};

export type Category = 'body' | 'mind' | 'focus' | 'connection' | 'money' | 'rest' | 'growth';

export const CATEGORIES: Record<Category, string> = {
  body: 'Body',
  mind: 'Mind',
  focus: 'Focus',
  connection: 'People',
  money: 'Money',
  rest: 'Rest',
  growth: 'Growth',
};

export type Recipe = {
  key: string;
  name: string;
  identity: string;
  floor: string;
  ceiling: string;
  twoMinute: string;
  anchor: string;
  category: Category;
  why: string;
  principle: PrincipleKey;
};

export const RECIPES: readonly Recipe[] = [
  { key: 'read', name: 'Read', identity: 'a reader', floor: '1 page', ceiling: '20 pages', twoMinute: 'Open the book to your bookmark', anchor: 'After I get into bed', category: 'growth', why: 'A page a day still adds up to whole books over a year.', principle: 'compound' },
  { key: 'write', name: 'Write', identity: 'a writer', floor: '50 words', ceiling: '1,000 words', twoMinute: 'Write one sentence', anchor: 'After my first coffee', category: 'growth', why: 'Writers are people who write, a little, often.', principle: 'identity' },
  { key: 'language', name: 'Language', identity: 'a language learner', floor: '1 lesson card', ceiling: '20-minute lesson', twoMinute: 'Say one new word out loud', anchor: 'After I brush my teeth', category: 'growth', why: 'Short daily practice beats long weekly sessions for memory.', principle: 'two-minute' },
  { key: 'practice', name: 'Practise music', identity: 'a musician', floor: 'Play one song', ceiling: '30 minutes of practice', twoMinute: 'Pick up the instrument', anchor: 'After I get home', category: 'growth', why: 'Keeping the instrument out on its stand makes practice the default.', principle: 'environment' },
  { key: 'walk', name: 'Walk', identity: 'someone who moves every day', floor: 'Walk to the corner', ceiling: '30-minute walk', twoMinute: 'Put on your shoes', anchor: 'After lunch', category: 'body', why: 'Walking is a keystone habit that lifts mood, sleep and focus.', principle: 'keystone' },
  { key: 'strength', name: 'Strength', identity: 'strong', floor: '5 push-ups', ceiling: '30-minute workout', twoMinute: 'Get down on the floor', anchor: 'After I wake up', category: 'body', why: 'Five push-ups on a bad day keeps the door open for great days.', principle: 'two-minute' },
  { key: 'run', name: 'Run', identity: 'a runner', floor: 'Run for 1 minute', ceiling: 'Run 5 km', twoMinute: 'Put on your running kit', anchor: 'After I drop the kids off', category: 'body', why: 'A runner is someone who runs, even for a minute.', principle: 'identity' },
  { key: 'stretch', name: 'Stretch', identity: 'flexible', floor: 'One stretch', ceiling: '10-minute routine', twoMinute: 'Touch your toes', anchor: 'After I finish work', category: 'body', why: 'Stacked on the end of the workday, it becomes the switch into evening.', principle: 'habit-stacking' },
  { key: 'water', name: 'Water', identity: 'someone who looks after their body', floor: 'One glass', ceiling: '2 litres', twoMinute: 'Fill a glass', anchor: 'After I wake up', category: 'body', why: 'A full bottle on the desk is a reminder you cannot miss.', principle: 'environment' },
  { key: 'veg', name: 'Eat well', identity: 'a healthy eater', floor: 'One vegetable', ceiling: 'Home-cooked meals all day', twoMinute: 'Wash one piece of fruit', anchor: 'When I plan dinner', category: 'body', why: 'Adding one good thing is easier than banning many.', principle: 'four-laws' },
  { key: 'meditate', name: 'Meditate', identity: 'a calm person', floor: '1 mindful breath', ceiling: '10 minutes', twoMinute: 'Sit down and close your eyes', anchor: 'After I pour my coffee', category: 'mind', why: 'One breath is a real practice. Ten minutes is a great day.', principle: 'two-minute' },
  { key: 'journal', name: 'Journal', identity: 'someone who reflects', floor: 'One line', ceiling: 'A full page', twoMinute: 'Open the notebook', anchor: 'After dinner', category: 'mind', why: 'Writing things down turns a blur of days into lessons.', principle: 'habit-stacking' },
  { key: 'gratitude', name: 'Gratitude', identity: 'grateful', floor: 'Name one good thing', ceiling: 'Write three good things', twoMinute: 'Think of one person you are glad of', anchor: 'After I get into bed', category: 'mind', why: 'Noticing what went well trains your attention toward it.', principle: 'celebrate' },
  { key: 'deep-work', name: 'Deep work', identity: 'focused', floor: '10 focused minutes', ceiling: '90-minute block', twoMinute: 'Close every tab but one', anchor: 'At 9 am at my desk', category: 'focus', why: 'Focus has to be booked like a meeting, or it gets eaten.', principle: 'deep-work' },
  { key: 'plan', name: 'Plan tomorrow', identity: 'organised', floor: 'Write one priority', ceiling: 'Plan the whole day', twoMinute: 'Open tomorrow in your calendar', anchor: 'Before I shut the laptop', category: 'focus', why: 'Knowing your one thing before the day starts protects it.', principle: 'focus' },
  { key: 'phone-free', name: 'Phone-free morning', identity: 'in charge of my attention', floor: '10 minutes without the phone', ceiling: 'First hour phone-free', twoMinute: 'Leave the phone in another room', anchor: 'When I wake up', category: 'focus', why: 'A phone charging in the kitchen is friction that works for you.', principle: 'friction' },
  { key: 'morning-light', name: 'Morning light', identity: 'a morning person', floor: 'Step outside for a minute', ceiling: '10 minutes outside', twoMinute: 'Open the curtains', anchor: 'After my first glass of water', category: 'rest', why: 'Daylight early in the day helps set your body clock for the night.', principle: 'sleep' },
  { key: 'lights-out', name: 'Lights out', identity: 'well rested', floor: 'In bed by midnight', ceiling: 'In bed by 10:30, no screens', twoMinute: 'Plug the phone in outside the bedroom', anchor: 'After I brush my teeth', category: 'rest', why: 'A steady bedtime is a keystone for energy and mood.', principle: 'sleep' },
  { key: 'tidy', name: 'Reset the space', identity: 'tidy', floor: 'Put away 5 things', ceiling: '15-minute tidy', twoMinute: 'Clear one surface', anchor: 'After dinner', category: 'rest', why: 'A clear room makes tomorrow\'s good habits easier to start.', principle: 'environment' },
  { key: 'reach-out', name: 'Reach out', identity: 'a good friend', floor: 'Send one message', ceiling: 'Call someone you love', twoMinute: 'Open your last chat', anchor: 'On my commute home', category: 'connection', why: 'Relationships are kept up the same way as habits: a little, often.', principle: 'compound' },
  { key: 'kindness', name: 'One kind act', identity: 'kind', floor: 'Say one thank-you', ceiling: 'Do something thoughtful for someone', twoMinute: 'Smile at the next person you see', anchor: 'When I get to work', category: 'connection', why: 'Kindness is a habit like any other, and it is contagious.', principle: 'identity' },
  { key: 'family', name: 'Present at home', identity: 'a present parent', floor: '5 minutes, phone away', ceiling: 'An hour of real time together', twoMinute: 'Put the phone face down', anchor: 'When I walk in the door', category: 'connection', why: 'The doorway is a reliable cue to switch from work to people.', principle: 'habit-stacking' },
  { key: 'save', name: 'Save', identity: 'good with money', floor: 'Move $1 to savings', ceiling: 'Review the week\'s spending', twoMinute: 'Open your banking app', anchor: 'After I get paid', category: 'money', why: 'The amount matters less than becoming someone who saves.', principle: 'identity' },
  { key: 'no-spend', name: 'Spend on purpose', identity: 'intentional with money', floor: 'Wait 24 hours on one purchase', ceiling: 'A no-spend day', twoMinute: 'Remove one saved card from a shop', anchor: 'Before I check out', category: 'money', why: 'A small delay is enough friction to stop most impulse buys.', principle: 'friction' },
];

export type RecommendationContext = {
  today: Day;
  habitCount: number;
  habitsWithoutTwoMinute: number;
  habitsWithoutAnchor: number;
  habitsWithoutWhenWhere: number;
  habitsWithoutIdentity: number;
  /** Habits with a missed yesterday and nothing yet today. */
  neverTwiceCount: number;
  /** Kept days ÷ days in window over the last 30 days, across habits. Null with under 7 days of data. */
  keptRate30: number | null;
  /** Ceiling days ÷ kept days over the last 30 days. Null when nothing was kept. */
  ceilingShare30: number | null;
};

export type Recommendation = { principle: Principle; reason: string };

/** Ideas that fit this person right now, most useful first. */
export function recommend(ctx: RecommendationContext): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (key: PrincipleKey, reason: string) => {
    if (!out.some((r) => r.principle.key === key)) out.push({ principle: PRINCIPLES[key], reason });
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)));

  if (ctx.neverTwiceCount > 0) add('never-miss-twice', plural(ctx.neverTwiceCount, 'One card slipped yesterday.', '# cards slipped yesterday.'));
  if (ctx.habitCount === 0) {
    add('identity', 'You are building your first deck.');
    add('keystone', 'A good first card pulls others along.');
  }
  if (ctx.keptRate30 !== null && ctx.keptRate30 < 0.5) {
    add('two-minute', 'Fewer than half your days were kept this month. A smaller Floor fixes that.');
    add('environment', 'Make the habits easier to start where you are.');
  }
  if (ctx.habitsWithoutTwoMinute > 0) add('two-minute', plural(ctx.habitsWithoutTwoMinute, 'One card has no two-minute version.', '# cards have no two-minute version.'));
  if (ctx.habitsWithoutIdentity > 0 && ctx.habitCount > 0) add('identity', plural(ctx.habitsWithoutIdentity, 'One card has no identity yet.', '# cards have no identity yet.'));
  if (ctx.habitsWithoutAnchor > 0) add('habit-stacking', plural(ctx.habitsWithoutAnchor, 'One card has no anchor.', '# cards have no anchor.'));
  if (ctx.habitsWithoutWhenWhere > 0) add('when-where', plural(ctx.habitsWithoutWhenWhere, 'One card has no time or place.', '# cards have no time or place.'));
  if (ctx.habitCount > 6) add('focus', `You have ${ctx.habitCount} cards in your deck.`);
  if (ctx.keptRate30 !== null && ctx.keptRate30 >= 0.7 && ctx.ceilingShare30 !== null) {
    if (ctx.ceilingShare30 >= 0.7) add('goldilocks', 'You hit the Ceiling most days. It might be time to raise it.');
    else if (ctx.ceilingShare30 < 0.1) add('goldilocks', 'You keep the Floor well but rarely reach the Ceiling. Try bringing it closer.');
  }
  if (isFreshStart(ctx.today)) add('fresh-start', isFirstOfMonth(ctx.today) ? 'A new month just started.' : 'It is Monday.');
  return out;
}

const EVERGREEN: readonly PrincipleKey[] = ['celebrate', 'compound', 'habit-loop', 'temptation-bundling', 'woop', 'friction', 'four-laws', 'environment', 'deep-work', 'sleep', 'keystone'];

/** One idea for today: the most useful recommendation, or a rotating classic when nothing needs fixing. */
export function ideaOfTheDay(ctx: RecommendationContext): Recommendation {
  const [top] = recommend(ctx);
  if (top) return top;
  const index = ((daysBetween('2026-01-01', ctx.today) % EVERGREEN.length) + EVERGREEN.length) % EVERGREEN.length;
  return { principle: PRINCIPLES[EVERGREEN[index]], reason: 'Today\'s idea.' };
}

/** Recipes for the given identities first, then the rest, skipping cards already in the deck. */
export function suggestRecipes(wantedIdentities: readonly string[], existingNames: readonly string[], limit: number): Recipe[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const wanted = wantedIdentities.map((i) => i.toLowerCase());
  const fresh = RECIPES.filter((r) => !have.has(r.name.toLowerCase()));
  const matches = fresh.filter((r) => wanted.some((w) => r.identity.toLowerCase().includes(w) || w.includes(r.identity.toLowerCase())));
  const rest = fresh.filter((r) => !matches.includes(r));
  return [...matches, ...rest].slice(0, limit);
}

function isFirstOfMonth(day: Day): boolean {
  return day.endsWith('-01');
}

function isFreshStart(day: Day): boolean {
  const [y, m, d] = day.split('-').map(Number);
  return isFirstOfMonth(day) || new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}
