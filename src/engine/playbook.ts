/**
 * The Playbook: Do Better's own ideas about keeping a habit, plus ready-made habit cards built on
 * them. `recommend` picks which ideas matter for this person today, from their own deck and
 * history, so advice shows up where it can be used instead of in a reading list.
 *
 * Every idea is written in Do Better's words. Nothing here names a book or an author, or uses their labels.
 */

import type { Suit } from './cards';
import { daysBetween, type Day } from './day';

export type PrincipleKey =
  | 'identity'
  | 'first-move'
  | 'comeback'
  | 'when-it-plays'
  | 'when-where'
  | 'celebrate'
  | 'swap'
  | 'lead-card'
  | 'environment'
  | 'friction'
  | 'pair-up'
  | 'clean-page'
  | 'add-first'
  | 'pile'
  | 'obstacle'
  | 'stretch'
  | 'focus'
  | 'focus-block'
  | 'sleep'
  | 'commitment';

export type Principle = {
  key: PrincipleKey;
  title: string;
  /** One or two sentences in plain words. */
  idea: string;
  /** What to do about it in Do Better, right now. */
  tryThis: string;
};

export const PRINCIPLES: Record<PrincipleKey, Principle> = {
  identity: {
    key: 'identity',
    title: 'Who the card makes you',
    idea: 'A habit lasts when it is about who you are, not what you finish. Every day you keep says it a little louder.',
    tryThis: 'Give each card a line like "a reader". Every day you keep it counts for that person in your Court.',
  },
  'first-move': {
    key: 'first-move',
    title: 'The first move',
    idea: 'The hardest part of any habit is starting. Shrink the start until it takes no courage at all.',
    tryThis: 'Give each card a first move, like opening the book. It is what the Comeback card offers.',
  },
  comeback: {
    key: 'comeback',
    title: 'The comeback',
    idea: 'One missed day is not a pattern. What you do the next morning is what counts, so that is the morning the app makes easiest.',
    tryThis: 'When a card comes back turned over, swipe down for the Floor. If yesterday was empty, that still deals it a card.',
  },
  'when-it-plays': {
    key: 'when-it-plays',
    title: 'Play it after something you already do',
    idea: 'A new card is easy to forget. Tie it to a moment that already happens every day, and that moment becomes the reminder.',
    tryThis: 'Fill in "When it plays" on each card, like "after my first coffee".',
  },
  'when-where': {
    key: 'when-where',
    title: 'Give it a time and a place',
    idea: 'A plan with a time and a place gets done far more often than a good intention.',
    tryThis: 'Give the card a time and a place, like "7 am, kitchen table".',
  },
  celebrate: {
    key: 'celebrate',
    title: 'Enjoy the swipe',
    idea: 'Feeling good right after you do something is what makes you want to do it again.',
    tryThis: 'Every swipe deals a card. Let yourself enjoy it.',
  },
  swap: {
    key: 'swap',
    title: 'Keep the moment, change the move',
    idea: 'A habit you want to drop usually starts at the same moment each day. Keep the moment and do something else in it.',
    tryThis: 'Notice what sets off the habit you want to change, and put a card on that moment.',
  },
  'lead-card': {
    key: 'lead-card',
    title: 'Lead with one strong card',
    idea: 'Some habits pull others along with them. Moving your body and sleeping well are the usual ones.',
    tryThis: 'If you are starting out, make your first card a walk or lights out.',
  },
  environment: {
    key: 'environment',
    title: 'Let the room do the work',
    idea: 'What you can see and reach is what you end up doing. Put the good thing where you will trip over it.',
    tryThis: 'Leave the book on your pillow, the shoes by the door, the bottle on the desk.',
  },
  friction: {
    key: 'friction',
    title: 'Make the unwanted thing awkward',
    idea: 'A few extra seconds of effort is often enough to stop something you do without thinking.',
    tryThis: 'Charge your phone outside the bedroom. Log out of the app you keep opening.',
  },
  'pair-up': {
    key: 'pair-up',
    title: 'Pair it with something you love',
    idea: 'A habit is easier to start when a treat comes with it. Keep the treat for the habit only.',
    tryThis: 'Save your favourite podcast for walks, or your best coffee for the writing hour.',
  },
  'clean-page': {
    key: 'clean-page',
    title: 'Start on a clean page',
    idea: 'Mondays, new months and birthdays feel like clean pages, and it is easier to begin on one.',
    tryThis: 'Today is a good day to add one new card.',
  },
  'add-first': {
    key: 'add-first',
    title: 'Add before you take away',
    idea: 'Adding one good thing is easier than banning many. The bans can wait until the good thing is normal.',
    tryThis: 'Pick one small good thing to add today, and leave the rules for later.',
  },
  pile: {
    key: 'pile',
    title: 'Small days add up',
    idea: 'No single day looks like much. A year of small kept days is a different life.',
    tryThis: 'Look at your stack, not today. Chips never leave it, and face cards are never lost.',
  },
  obstacle: {
    key: 'obstacle',
    title: 'Plan for the thing that stops you',
    idea: 'Something will get in the way, and you usually know what it is. Decide now what you will do when it does.',
    tryThis: 'Name the thing most likely to stop you today, and decide your Floor for that moment.',
  },
  stretch: {
    key: 'stretch',
    title: 'Just hard enough',
    idea: 'A card is most fun when the Ceiling is a stretch you can reach on a good day: not every day, and not never.',
    tryThis: 'If you hit the Ceiling most days, raise it. If you never do, bring it closer.',
  },
  focus: {
    key: 'focus',
    title: 'Fewer, better',
    idea: 'A few cards kept well beat a big deck kept badly. Every extra card competes for the same attention.',
    tryThis: 'Keep the cards that matter most and archive the rest for now.',
  },
  'focus-block': {
    key: 'focus-block',
    title: 'Guard a block of focus',
    idea: 'Uninterrupted time does not happen by accident. It has to be booked, like a meeting with yourself.',
    tryThis: 'Add a focus card with a Floor of 10 focused minutes.',
  },
  sleep: {
    key: 'sleep',
    title: 'Sleep on a schedule',
    idea: 'Going to bed and getting up at the same times is one of the simplest things you can do for your energy and mood.',
    tryThis: 'Try a lights-out card with the same time every night.',
  },
  commitment: {
    key: 'commitment',
    title: 'Make a promise to future you',
    idea: 'A plan you have said out loud is harder to drop, especially with a little on the line.',
    tryThis: 'Call your hand on Monday. Make it by Sunday and its chips pay twice.',
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
  /** The first move: the smallest way to start, offered on a comeback morning. */
  twoMinute: string;
  /** When it plays, written to follow the word "Plays". */
  anchor: string;
  category: Category;
  /** The part of you it builds, which is the suit its days are dealt in. */
  suit: Suit;
  why: string;
  principle: PrincipleKey;
};

export const RECIPES: readonly Recipe[] = [
  { key: 'read', name: 'Read', identity: 'a reader', floor: '1 page', ceiling: '20 pages', twoMinute: 'Open the book to your bookmark', anchor: 'after getting into bed', category: 'growth', suit: 'clubs', why: 'A page a day still adds up to whole books over a year.', principle: 'pile' },
  { key: 'write', name: 'Write', identity: 'a writer', floor: '50 words', ceiling: '1,000 words', twoMinute: 'Write one sentence', anchor: 'after my first coffee', category: 'growth', suit: 'diamonds', why: 'Writers are people who write, a little, often.', principle: 'identity' },
  { key: 'language', name: 'Language', identity: 'a language learner', floor: '1 lesson card', ceiling: '20-minute lesson', twoMinute: 'Say one new word out loud', anchor: 'after brushing my teeth', category: 'growth', suit: 'clubs', why: 'Short daily practice beats long weekly sessions for memory.', principle: 'first-move' },
  { key: 'practice', name: 'Practise music', identity: 'a musician', floor: 'Play one song', ceiling: '30 minutes of practice', twoMinute: 'Pick up the instrument', anchor: 'after getting home', category: 'growth', suit: 'diamonds', why: 'Keeping the instrument out on its stand makes practice the default.', principle: 'environment' },
  { key: 'walk', name: 'Walk', identity: 'someone who moves every day', floor: 'Walk to the corner', ceiling: '30-minute walk', twoMinute: 'Put on your shoes', anchor: 'after lunch', category: 'body', suit: 'spades', why: 'A walk lifts mood, sleep and focus, so other cards get easier.', principle: 'lead-card' },
  { key: 'strength', name: 'Strength', identity: 'strong', floor: '5 push-ups', ceiling: '30-minute workout', twoMinute: 'Get down on the floor', anchor: 'after waking up', category: 'body', suit: 'spades', why: 'Five push-ups on a bad day keeps the door open for great days.', principle: 'first-move' },
  { key: 'run', name: 'Run', identity: 'a runner', floor: 'Run for 1 minute', ceiling: 'Run 5 km', twoMinute: 'Put on your running kit', anchor: 'after dropping the kids off', category: 'body', suit: 'spades', why: 'A runner is someone who runs, even for a minute.', principle: 'identity' },
  { key: 'stretch', name: 'Stretch', identity: 'flexible', floor: 'One stretch', ceiling: '10-minute routine', twoMinute: 'Touch your toes', anchor: 'after finishing work', category: 'body', suit: 'spades', why: 'Played at the end of the workday, it becomes the switch into evening.', principle: 'when-it-plays' },
  { key: 'water', name: 'Water', identity: 'someone who looks after their body', floor: 'One glass', ceiling: '2 litres', twoMinute: 'Fill a glass', anchor: 'after waking up', category: 'body', suit: 'spades', why: 'A full bottle on the desk is a reminder you cannot miss.', principle: 'environment' },
  { key: 'veg', name: 'Eat well', identity: 'a healthy eater', floor: 'One vegetable', ceiling: 'Home-cooked meals all day', twoMinute: 'Wash one piece of fruit', anchor: 'when planning dinner', category: 'body', suit: 'spades', why: 'Adding one good thing is easier than banning many.', principle: 'add-first' },
  { key: 'meditate', name: 'Meditate', identity: 'a calm person', floor: '1 mindful breath', ceiling: '10 minutes', twoMinute: 'Sit down and close your eyes', anchor: 'after pouring my coffee', category: 'mind', suit: 'clubs', why: 'One breath is a real practice. Ten minutes is a great day.', principle: 'first-move' },
  { key: 'journal', name: 'Journal', identity: 'someone who reflects', floor: 'One line', ceiling: 'A full page', twoMinute: 'Open the notebook', anchor: 'after dinner', category: 'mind', suit: 'clubs', why: 'Writing things down turns a blur of days into lessons.', principle: 'when-it-plays' },
  { key: 'gratitude', name: 'Gratitude', identity: 'grateful', floor: 'Name one good thing', ceiling: 'Write three good things', twoMinute: 'Think of one person you are glad of', anchor: 'after getting into bed', category: 'mind', suit: 'hearts', why: 'Noticing what went well trains your attention toward it.', principle: 'celebrate' },
  { key: 'deep-work', name: 'Focus block', identity: 'focused', floor: '10 focused minutes', ceiling: '90-minute block', twoMinute: 'Close every tab but one', anchor: 'at 9 am, at my desk', category: 'focus', suit: 'diamonds', why: 'Focus has to be booked like a meeting, or it gets eaten.', principle: 'focus-block' },
  { key: 'plan', name: 'Plan tomorrow', identity: 'organised', floor: 'Write one priority', ceiling: 'Plan the whole day', twoMinute: 'Open tomorrow in your calendar', anchor: 'before shutting the laptop', category: 'focus', suit: 'diamonds', why: 'Knowing your one thing before the day starts protects it.', principle: 'focus' },
  { key: 'phone-free', name: 'Phone-free morning', identity: 'in charge of my attention', floor: '10 minutes without the phone', ceiling: 'First hour phone-free', twoMinute: 'Leave the phone in another room', anchor: 'on waking up', category: 'focus', suit: 'clubs', why: 'A phone charging in the kitchen is extra effort that works for you.', principle: 'friction' },
  { key: 'morning-light', name: 'Morning light', identity: 'a morning person', floor: 'Step outside for a minute', ceiling: '10 minutes outside', twoMinute: 'Open the curtains', anchor: 'after my first glass of water', category: 'rest', suit: 'spades', why: 'Daylight early in the day helps set your body clock for the night.', principle: 'sleep' },
  { key: 'lights-out', name: 'Lights out', identity: 'well rested', floor: 'In bed by midnight', ceiling: 'In bed by 10:30, no screens', twoMinute: 'Plug the phone in outside the bedroom', anchor: 'after brushing my teeth', category: 'rest', suit: 'spades', why: 'A steady bedtime does more for energy and mood than almost anything.', principle: 'sleep' },
  { key: 'tidy', name: 'Reset the space', identity: 'tidy', floor: 'Put away 5 things', ceiling: '15-minute tidy', twoMinute: 'Clear one surface', anchor: 'after dinner', category: 'rest', suit: 'clubs', why: 'A clear room makes tomorrow\'s good habits easier to start.', principle: 'environment' },
  { key: 'reach-out', name: 'Reach out', identity: 'a good friend', floor: 'Send one message', ceiling: 'Call someone you love', twoMinute: 'Open your last chat', anchor: 'on my commute home', category: 'connection', suit: 'hearts', why: 'Relationships are kept up the same way as habits: a little, often.', principle: 'pile' },
  { key: 'kindness', name: 'One kind act', identity: 'kind', floor: 'Say one thank-you', ceiling: 'Do something thoughtful for someone', twoMinute: 'Smile at the next person you see', anchor: 'on getting to work', category: 'connection', suit: 'hearts', why: 'Kindness is a habit like any other, and it is contagious.', principle: 'identity' },
  { key: 'listen', name: 'Really listen', identity: 'a good listener', floor: 'Ask one real question', ceiling: 'A long talk, phone away', twoMinute: 'Put the phone face down', anchor: 'when we sit down to eat', category: 'connection', suit: 'hearts', why: 'Attention is the simplest gift there is, and the one people remember.', principle: 'when-it-plays' },
  { key: 'partner', name: 'Partner time', identity: 'a loving partner', floor: 'Ask about their day', ceiling: 'An evening together, phones away', twoMinute: 'Send them a kind message', anchor: 'after dinner', category: 'connection', suit: 'hearts', why: 'Small daily moments do more for a relationship than rare big gestures.', principle: 'pile' },
  { key: 'family', name: 'Present at home', identity: 'a present parent', floor: '5 minutes, phone away', ceiling: 'An hour of real time together', twoMinute: 'Put the phone face down', anchor: 'on walking in the door', category: 'connection', suit: 'hearts', why: 'The doorway is a reliable moment to switch from work to people.', principle: 'when-it-plays' },
  { key: 'save', name: 'Save', identity: 'good with money', floor: 'Move $1 to savings', ceiling: 'Review the week\'s spending', twoMinute: 'Open your banking app', anchor: 'after getting paid', category: 'money', suit: 'diamonds', why: 'The amount matters less than becoming someone who saves.', principle: 'identity' },
  { key: 'no-spend', name: 'Spend on purpose', identity: 'intentional with money', floor: 'Wait 24 hours on one purchase', ceiling: 'A no-spend day', twoMinute: 'Remove one saved card from a shop', anchor: 'before checking out', category: 'money', suit: 'diamonds', why: 'A small delay is enough to stop most impulse buys.', principle: 'friction' },
];

/** A card's "when it plays" line, such as "Plays after lunch". */
export function playsLine(when: string): string {
  const text = when.trim();
  const lowered = /^I\b/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
  return `Plays ${lowered}`;
}

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
  /** It is Monday and this week's hand hasn't been called yet. */
  callPending?: boolean;
};

export type Recommendation = { principle: Principle; reason: string };

/** Ideas that fit this person right now, most useful first. */
export function recommend(ctx: RecommendationContext): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (key: PrincipleKey, reason: string) => {
    if (!out.some((r) => r.principle.key === key)) out.push({ principle: PRINCIPLES[key], reason });
  };
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)));

  if (ctx.neverTwiceCount > 0) add('comeback', plural(ctx.neverTwiceCount, 'One card slipped yesterday.', '# cards slipped yesterday.'));
  if (ctx.habitCount === 0) {
    add('identity', 'You are building your first deck.');
    add('lead-card', 'A good first card pulls others along.');
  }
  if (ctx.keptRate30 !== null && ctx.keptRate30 < 0.5) {
    add('first-move', 'Fewer than half your days were kept this month. A smaller Floor fixes that.');
    add('environment', 'Make the habits easier to start where you are.');
  }
  if (ctx.habitsWithoutTwoMinute > 0) add('first-move', plural(ctx.habitsWithoutTwoMinute, 'One card has no first move.', '# cards have no first move.'));
  if (ctx.habitsWithoutIdentity > 0 && ctx.habitCount > 0) add('identity', plural(ctx.habitsWithoutIdentity, 'One card does not say who it makes you yet.', '# cards do not say who they make you yet.'));
  if (ctx.habitsWithoutAnchor > 0) add('when-it-plays', plural(ctx.habitsWithoutAnchor, 'One card does not say when it plays.', '# cards do not say when they play.'));
  if (ctx.habitsWithoutWhenWhere > 0) add('when-where', plural(ctx.habitsWithoutWhenWhere, 'One card has no time or place.', '# cards have no time or place.'));
  if (ctx.habitCount > 6) add('focus', `You have ${ctx.habitCount} cards in your deck.`);
  if (ctx.keptRate30 !== null && ctx.keptRate30 >= 0.7 && ctx.ceilingShare30 !== null) {
    if (ctx.ceilingShare30 >= 0.7) add('stretch', 'You hit the Ceiling most days. It might be time to raise it.');
    else if (ctx.ceilingShare30 < 0.1) add('stretch', 'You keep the Floor well but rarely reach the Ceiling. Try bringing it closer.');
  }
  if (ctx.callPending) add('commitment', 'Calls for this week close at midnight.');
  if (isCleanPage(ctx.today)) add('clean-page', isFirstOfMonth(ctx.today) ? 'A new month just started.' : 'It is Monday.');
  return out;
}

const EVERGREEN: readonly PrincipleKey[] = ['celebrate', 'pile', 'swap', 'pair-up', 'obstacle', 'friction', 'add-first', 'environment', 'focus-block', 'sleep', 'lead-card'];

/** One idea for today: the most useful recommendation, or a rotating favourite when nothing needs fixing. */
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

function isCleanPage(day: Day): boolean {
  const [y, m, d] = day.split('-').map(Number);
  return isFirstOfMonth(day) || new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

const SUIT_WORDS: readonly [Suit, RegExp][] = [
  ['hearts', /\b(call(s|ing)?\b|friend|family|partner|wife|husband|mom\b|mum\b|dad\b|parent|kids?\b|child|sons?\b|daughter|kind(ness)?\b|thank|gratitude|grateful|love\b|loved ones|date night|reach out|volunteer|giv(e|ing)\b|listen|communit|neighbo)/i],
  ['clubs', /\b(read(s|ing|er)?\b|books?\b|learn|language|study|meditat|journal|reflect|mind|calm|breath|course|podcast|phone|screen|think|tidy|clean|pray)/i],
  ['spades', /\b(walk|run(s|ner|ning)?\b|jog|gym\b|workout|work out|exercis|push-?ups?|squat|yoga|stretch|swim|bike|cycl|water\b|sleep|eat(ing)?\b|veg|fruit|cook|meal|diet|health|body|steps\b|move\b|moves\b|moving|strength|strong\b|lift|sport|hik(e|ing)|danc|fitness|lights? out|morning light|daylight|sunlight|outside|floss|teeth|skin|vitamin)/i],
  ['diamonds', /\b(work\b|focus|code|coding|writ(e|er|ing)\b|build|money|sav(e|es|ing)\b|budget|spend|invest|plan\b|planning|email|inbox|project|practi[cs]e|music|guitar|piano|draw(ing)?\b|paint|design|creat|business|career|tasks?\b|ship\b|sell)/i],
];

/** A best guess at the suit for a habit typed by hand, from its name and identity. Mind when nothing fits. */
export function inferSuit(name: string, identity: string | null = null): Suit {
  const text = `${name} ${identity ?? ''}`;
  return SUIT_WORDS.find(([, words]) => words.test(text))?.[0] ?? 'clubs';
}
