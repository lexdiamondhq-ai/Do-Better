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
  | 'return'
  | 'when-it-plays'
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
    tryThis: 'Give each card a line like “a reader”. Every day you keep it counts for that person in your Court.',
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
    tryThis: 'When a card comes back dark, swipe it down for the Floor or do just its first move. Either keeps today.',
  },
  return: {
    key: 'return',
    title: 'Start with one card',
    idea: 'After time away, the whole deck can feel like a debt. It isn’t. Nothing you kept has gone anywhere, and one card today is a real day.',
    tryThis: 'Start with one card. The rest can wait.',
  },
  'when-it-plays': {
    key: 'when-it-plays',
    title: 'Play it after something you already do',
    idea: 'A new card is easy to forget. Tie it to a moment that already happens every day, and that moment becomes the reminder.',
    tryThis: 'Fill in “When it plays” on each card, like “after my first coffee”. Give it a time too, and the card can come and find you.',
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
    tryThis: 'Leave the book on your pillow, the shoes by the door, the bottle where you can see it.',
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
    tryThis: 'Call this week’s hand before your first kept day is over. Make it by Sunday and it pays extra: twice for a Stretch, three times for a Long shot.',
  },
};

export type IdeaGroupKey = 'floor' | 'plays' | 'ceiling' | 'comeback';

export type IdeaGroup = { key: IdeaGroupKey; title: string; about: string; principles: readonly PrincipleKey[] };

/**
 * Every idea, sorted by the part of a card it helps with: the Floor, When it plays, the Ceiling and the
 * Comeback. Each idea sits in exactly one group.
 */
export const IDEA_GROUPS: readonly IdeaGroup[] = [
  { key: 'floor', title: 'Start small', about: 'For the Floor: a start so small it always happens.', principles: ['first-move', 'add-first', 'obstacle', 'lead-card', 'clean-page'] },
  { key: 'plays', title: 'Make it easy to play', about: 'For When it plays: let the day remind you.', principles: ['when-it-plays', 'environment', 'friction', 'pair-up', 'swap', 'sleep'] },
  { key: 'ceiling', title: 'Reach higher', about: 'For the Ceiling: somewhere for your best days to go.', principles: ['stretch', 'celebrate', 'commitment', 'focus-block', 'focus'] },
  { key: 'comeback', title: 'Keep coming back', about: 'For the Comeback, and for who the cards make you.', principles: ['comeback', 'return', 'pile', 'identity'] },
];

/** When in the day a card usually plays. `any` when nothing says. */
export type PartOfDay = 'morning' | 'midday' | 'evening' | 'any';

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
  /** The idea behind this card, in the app's voice. Never put in the player's own "why". */
  why: string;
  /** A first-person example for "Why it matters to you", shown as the empty field's placeholder. */
  prompt: string;
  /** When in the day its anchor falls. */
  part: Exclude<PartOfDay, 'any'>;
  principle: PrincipleKey;
};

/**
 * Ready-made cards. Every anchor and every Floor holds on any day of the week: nothing waits for a
 * payday, a commute, a desk or a school run, so a sensible pick never fails on a Saturday.
 */
export const RECIPES: readonly Recipe[] = [
  { key: 'read', name: 'Read', identity: 'a reader', floor: '1 page', ceiling: '20 pages', twoMinute: 'Open the book to your bookmark', anchor: 'after getting into bed', part: 'evening', category: 'growth', suit: 'clubs', why: 'A page a day still adds up to whole books over a year.', prompt: 'I want to finish whole books again.', principle: 'pile' },
  { key: 'write', name: 'Write', identity: 'a writer', floor: '50 words', ceiling: '1,000 words', twoMinute: 'Write one sentence', anchor: 'after my first coffee', part: 'morning', category: 'growth', suit: 'diamonds', why: 'Writers are people who write, a little, often.', prompt: 'I have things I want to say.', principle: 'identity' },
  { key: 'language', name: 'Language', identity: 'a language learner', floor: '1 lesson card', ceiling: '20-minute lesson', twoMinute: 'Say one new word out loud', anchor: 'after breakfast', part: 'morning', category: 'growth', suit: 'clubs', why: 'Short daily practice beats long weekly sessions for memory.', prompt: 'I want to talk with people in their own language.', principle: 'first-move' },
  { key: 'practice', name: 'Practise music', identity: 'a musician', floor: 'Play one song', ceiling: '30 minutes of practice', twoMinute: 'Pick up the instrument', anchor: 'after dinner', part: 'evening', category: 'growth', suit: 'diamonds', why: 'Keeping the instrument out on its stand makes practice the default.', prompt: 'Playing makes me feel like myself.', principle: 'environment' },
  { key: 'walk', name: 'Walk', identity: 'someone who moves every day', floor: 'Walk to the corner', ceiling: '30-minute walk', twoMinute: 'Put on your shoes', anchor: 'after lunch', part: 'midday', category: 'body', suit: 'spades', why: 'A walk lifts mood, sleep and focus, so other cards get easier.', prompt: 'I think and sleep better when I move.', principle: 'lead-card' },
  { key: 'strength', name: 'Strength', identity: 'strong', floor: '5 push-ups', ceiling: '30-minute workout', twoMinute: 'Get down on the floor', anchor: 'after waking up', part: 'morning', category: 'body', suit: 'spades', why: 'Five push-ups on a bad day keeps the door open for great days.', prompt: 'I want to stay strong as I get older.', principle: 'first-move' },
  { key: 'run', name: 'Run', identity: 'a runner', floor: 'Run for 1 minute', ceiling: 'Run 5 km', twoMinute: 'Put on your running kit', anchor: 'after waking up', part: 'morning', category: 'body', suit: 'spades', why: 'A runner is someone who runs, even for a minute.', prompt: 'I love how I feel after a run.', principle: 'identity' },
  { key: 'stretch', name: 'Stretch', identity: 'flexible', floor: 'One stretch', ceiling: '10-minute routine', twoMinute: 'Touch your toes', anchor: 'before dinner', part: 'evening', category: 'body', suit: 'spades', why: 'Played before dinner, it becomes the switch into evening.', prompt: 'I want to move without aches.', principle: 'when-it-plays' },
  { key: 'water', name: 'Water', identity: 'someone who looks after their body', floor: 'One glass', ceiling: '2 litres', twoMinute: 'Fill a glass', anchor: 'after waking up', part: 'morning', category: 'body', suit: 'spades', why: 'A full glass in sight is a reminder you cannot miss.', prompt: 'I feel better when I’m not running on empty.', principle: 'environment' },
  { key: 'veg', name: 'Eat well', identity: 'a healthy eater', floor: 'One vegetable', ceiling: 'Home-cooked meals all day', twoMinute: 'Wash one piece of fruit', anchor: 'when planning dinner', part: 'evening', category: 'body', suit: 'spades', why: 'Adding one good thing is easier than banning many.', prompt: 'I want food that gives me energy.', principle: 'add-first' },
  { key: 'meditate', name: 'Meditate', identity: 'a calm person', floor: '1 mindful breath', ceiling: '10 minutes', twoMinute: 'Sit down and close your eyes', anchor: 'after pouring my coffee', part: 'morning', category: 'mind', suit: 'clubs', why: 'One breath is a real practice. Ten minutes is a great day.', prompt: 'I want a calmer head.', principle: 'first-move' },
  { key: 'journal', name: 'Journal', identity: 'someone who reflects', floor: 'One line', ceiling: 'A full page', twoMinute: 'Open the notebook', anchor: 'after dinner', part: 'evening', category: 'mind', suit: 'clubs', why: 'Writing things down turns a blur of days into lessons.', prompt: 'Writing it down helps me make sense of things.', principle: 'when-it-plays' },
  { key: 'gratitude', name: 'Gratitude', identity: 'grateful', floor: 'Name one good thing', ceiling: 'Write three good things', twoMinute: 'Think of one person you are glad of', anchor: 'when I turn off the light', part: 'evening', category: 'mind', suit: 'hearts', why: 'Noticing what went well trains your attention toward it.', prompt: 'I want to notice the good stuff.', principle: 'celebrate' },
  { key: 'deep-work', name: 'Focus block', identity: 'focused', floor: '10 focused minutes', ceiling: '90-minute block', twoMinute: 'Close every tab but one', anchor: 'after my first coffee', part: 'morning', category: 'focus', suit: 'diamonds', why: 'Focus has to be booked like a meeting, or it gets eaten.', prompt: 'The things I care about need time without interruptions.', principle: 'focus-block' },
  { key: 'plan', name: 'Plan tomorrow', identity: 'organised', floor: 'Write one priority', ceiling: 'Plan the whole day', twoMinute: 'Open tomorrow in your calendar', anchor: 'after dinner', part: 'evening', category: 'focus', suit: 'diamonds', why: 'Knowing your one thing before the day starts protects it.', prompt: 'I want my days to go where I mean them to.', principle: 'focus' },
  { key: 'phone-free', name: 'Phone-free morning', identity: 'in charge of my attention', floor: '10 minutes without the phone', ceiling: 'First hour phone-free', twoMinute: 'Leave the phone in another room', anchor: 'on waking up', part: 'morning', category: 'focus', suit: 'clubs', why: 'A phone charging in the kitchen is extra effort that works for you.', prompt: 'I want my mornings back.', principle: 'friction' },
  { key: 'morning-light', name: 'Morning light', identity: 'a morning person', floor: 'Step outside for a minute', ceiling: '10 minutes outside', twoMinute: 'Open the curtains', anchor: 'after my first glass of water', part: 'morning', category: 'rest', suit: 'spades', why: 'Daylight early in the day helps set your body clock for the night.', prompt: 'I want to wake up properly.', principle: 'sleep' },
  { key: 'lights-out', name: 'Lights out', identity: 'well rested', floor: 'In bed by midnight', ceiling: 'In bed by 10:30, no screens', twoMinute: 'Plug the phone in outside the bedroom', anchor: 'after brushing my teeth at night', part: 'evening', category: 'rest', suit: 'spades', why: 'A steady bedtime does more for energy and mood than almost anything.', prompt: 'I’m better at everything when I’ve slept.', principle: 'sleep' },
  { key: 'tidy', name: 'Reset the space', identity: 'tidy', floor: 'Put away 5 things', ceiling: '15-minute tidy', twoMinute: 'Clear one surface', anchor: 'before I sit down for the evening', part: 'evening', category: 'rest', suit: 'clubs', why: 'A clear room makes tomorrow’s good habits easier to start.', prompt: 'A clear room clears my head.', principle: 'environment' },
  { key: 'reach-out', name: 'Reach out', identity: 'a good friend', floor: 'Send one message', ceiling: 'Call someone you love', twoMinute: 'Open your last chat', anchor: 'after lunch', part: 'midday', category: 'connection', suit: 'hearts', why: 'Relationships are kept up the same way as habits: a little, often.', prompt: 'I don’t want to drift from the people I love.', principle: 'pile' },
  { key: 'kindness', name: 'One kind act', identity: 'kind', floor: 'Say one thank-you', ceiling: 'Do something thoughtful for someone', twoMinute: 'Smile at the next person you see', anchor: 'at lunch', part: 'midday', category: 'connection', suit: 'hearts', why: 'Kindness is a habit like any other, and it is contagious.', prompt: 'I want to be someone who makes a day better.', principle: 'identity' },
  { key: 'listen', name: 'Really listen', identity: 'a good listener', floor: 'Ask one real question', ceiling: 'A long talk, phone away', twoMinute: 'Put the phone face down', anchor: 'when we sit down to eat', part: 'evening', category: 'connection', suit: 'hearts', why: 'Attention is the simplest gift there is, and the one people remember.', prompt: 'I want the people I love to feel heard.', principle: 'when-it-plays' },
  { key: 'partner', name: 'Partner time', identity: 'a loving partner', floor: 'Ask about their day', ceiling: 'An evening together, phones away', twoMinute: 'Send them a kind message', anchor: 'after dinner', part: 'evening', category: 'connection', suit: 'hearts', why: 'Small daily moments do more for a relationship than rare big gestures.', prompt: 'I want us to stay close.', principle: 'pile' },
  { key: 'family', name: 'Present at home', identity: 'a present parent', floor: '5 minutes, phone away', ceiling: 'An hour of real time together', twoMinute: 'Put the phone face down', anchor: 'when everyone is home', part: 'evening', category: 'connection', suit: 'hearts', why: 'The moment everyone is home is a reliable switch from the day to people.', prompt: 'I want them to remember me being there.', principle: 'when-it-plays' },
  { key: 'save', name: 'Save', identity: 'good with money', floor: 'Check your balance', ceiling: 'Review the week’s spending', twoMinute: 'Open your banking app', anchor: 'after my morning coffee', part: 'morning', category: 'money', suit: 'diamonds', why: 'The amount matters less than becoming someone who saves.', prompt: 'I want to stop worrying about money.', principle: 'identity' },
  { key: 'no-spend', name: 'Spend on purpose', identity: 'a careful spender', floor: 'Skip one thing I don’t need', ceiling: 'A no-spend day', twoMinute: 'Remove one saved card from a shop', anchor: 'before lunch', part: 'midday', category: 'money', suit: 'diamonds', why: 'A small delay is enough to stop most impulse buys.', prompt: 'I want my money to go on what matters.', principle: 'friction' },
];

/** Earlier wording of ready-made anchors and app lines, so cards made from them are still recognised. */
const FORMER: Record<string, { anchors?: string[]; whys?: string[] }> = {
  language: { anchors: ['after brushing my teeth'] },
  practice: { anchors: ['after getting home'] },
  run: { anchors: ['after dropping the kids off'] },
  stretch: { anchors: ['after finishing work'], whys: ['Played at the end of the workday, it becomes the switch into evening.'] },
  water: { whys: ['A full bottle on the desk is a reminder you cannot miss.'] },
  gratitude: { anchors: ['after getting into bed'] },
  'deep-work': { anchors: ['at 9 am, at my desk'] },
  plan: { anchors: ['before shutting the laptop'] },
  'lights-out': { anchors: ['after brushing my teeth'] },
  tidy: { anchors: ['after dinner'], whys: ["A clear room makes tomorrow's good habits easier to start."] },
  'reach-out': { anchors: ['on my commute home'] },
  kindness: { anchors: ['on getting to work'] },
  family: { anchors: ['on walking in the door'], whys: ['The doorway is a reliable moment to switch from work to people.'] },
  save: { anchors: ['after getting paid'] },
  'no-spend': { anchors: ['before checking out'] },
};

const same = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export function recipeFor(key: string | null | undefined): Recipe | undefined {
  return key ? RECIPES.find((r) => r.key === key) : undefined;
}

/** Where a ready-made card stands for this player: in the deck, or only among the cards they archived. */
export type RecipePlace = { kind: 'in' | 'out'; habitId: string };

/**
 * Where each ready-made card the player has made stands, by recipe key. A copy in the deck wins; a recipe
 * that is only archived is `out`, pointing at the copy that left last, so the Playbook can bring that one
 * back instead of making a second card.
 */
export function recipePlaces(habits: readonly { id: string; recipeKey: string | null; archivedAt: string | null }[]): Map<string, RecipePlace> {
  const places = new Map<string, RecipePlace>();
  const leftAt = new Map<string, string>();
  for (const h of habits) {
    if (!h.recipeKey) continue;
    const had = places.get(h.recipeKey);
    if (!h.archivedAt) {
      if (had?.kind !== 'in') places.set(h.recipeKey, { kind: 'in', habitId: h.id });
    } else if (!had || (had.kind === 'out' && h.archivedAt > (leftAt.get(h.recipeKey) ?? ''))) {
      places.set(h.recipeKey, { kind: 'out', habitId: h.id });
      leftAt.set(h.recipeKey, h.archivedAt);
    }
  }
  return places;
}

/** The ready-made card each suit's examples come from, for a card that isn't ready-made. */
const SUIT_EXAMPLE: Record<Suit, string> = { spades: 'walk', hearts: 'reach-out', diamonds: 'write', clubs: 'read' };

/**
 * Where a card's empty fields take their examples from: its own ready-made card, or else a ready-made
 * card of its suit. A walking card is never shown "a reader".
 */
export function exampleRecipe(recipeKey: string | null | undefined, suit: Suit): Recipe {
  return recipeFor(recipeKey) ?? recipeFor(SUIT_EXAMPLE[suit])!;
}

/**
 * The player's own "why", or null. Ready-made cards used to fill the field with the app's own line (and
 * may still arrive with it, or with the placeholder): that is the app talking, not the player, so it
 * counts as empty and the screens ask for their own line instead.
 */
export function ownWhy(habit: { why: string | null; recipeKey: string | null }): string | null {
  const why = habit.why?.trim();
  if (!why) return null;
  const r = recipeFor(habit.recipeKey);
  if (r && [r.why, r.prompt, ...(FORMER[r.key]?.whys ?? [])].some((line) => same(why, line))) return null;
  return why;
}

/** Whether an anchor is still the ready-made one (current or earlier wording) for its recipe. */
function stockAnchor(r: Recipe, anchor: string | null): boolean {
  if (!anchor?.trim()) return true;
  return [r.anchor, ...(FORMER[r.key]?.anchors ?? [])].some((a) => same(anchor, a));
}

/** Minutes after midnight for a clock time written anywhere in `text`: "7 am", "7:30pm", "19:00", "noon". */
export function clockIn(text: string): number | null {
  const t = text.toLowerCase();
  if (/\bnoon\b|\bmidday\b/.test(t)) return 12 * 60;
  if (/\bmidnight\b/.test(t)) return 0;
  const twelve = /\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/.exec(t);
  if (twelve) {
    const h = Number(twelve[1]) % 12;
    const pm = twelve[3].startsWith('p');
    return (h + (pm ? 12 : 0)) * 60 + Number(twelve[2] ?? 0);
  }
  const day = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/.exec(t);
  if (day) return Number(day[1]) * 60 + Number(day[2]);
  return null;
}

/** The part of the day a clock time falls in: morning from 4 am, midday from 11, evening from 5 pm. */
export function partAt(minutes: number): Exclude<PartOfDay, 'any'> {
  const h = Math.floor(minutes / 60) % 24;
  if (h >= 4 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'midday';
  return 'evening';
}

/** Words that place a moment in the day. The earliest one in the text wins. */
const PART_WORDS: readonly [Exclude<PartOfDay, 'any'>, RegExp][] = [
  ['evening', /finish(?:ing)? work|after work|leav(?:e|ing) work|end of the (?:work)?day|teeth at night|turn(?:ing)? off the light|lights? out/g],
  ['morning', /get(?:ting)? to work|start(?:ing)? work|wak(?:e|es|ing)|woke|morning|breakfast|coffee|sunrise|alarm|get(?:ting)? up|out of bed|first glass/g],
  ['midday', /lunch|noon|midday|afternoon/g],
  ['evening', /dinner|supper|evening|night|bed\b|bedtime|sleep|get(?:ting)? home|walk(?:ing)? in the door|everyone is home|sit down to eat|sunset|tonight/g],
];

function partFromWords(text: string): Exclude<PartOfDay, 'any'> | null {
  const t = text.toLowerCase();
  let best: { part: Exclude<PartOfDay, 'any'>; at: number } | null = null;
  for (const [part, words] of PART_WORDS) {
    words.lastIndex = 0;
    for (let m = words.exec(t); m; m = words.exec(t)) {
      if (!best || m.index < best.at) best = { part, at: m.index };
    }
  }
  return best?.part ?? null;
}

/**
 * When in the day a card plays, so the deck can lead with the card whose moment is now. In order: the
 * reminder time the player set for it, a clock time written in When it plays, the ready-made card's own
 * moment while its anchor is still the stock one, words in the anchor, then the ready-made moment anyway.
 */
export function partOfDay(habit: { anchor: string | null; whenWhere?: string | null; recipeKey: string | null }, reminder?: string | null): PartOfDay {
  const set = reminder ? clockIn(reminder) : null;
  if (set !== null) return partAt(set);
  const text = [habit.anchor, habit.whenWhere].filter(Boolean).join(' ');
  const clock = clockIn(text);
  if (clock !== null) return partAt(clock);
  const r = recipeFor(habit.recipeKey);
  if (r && stockAnchor(r, habit.anchor) && !habit.whenWhere?.trim()) return r.part;
  return partFromWords(text) ?? r?.part ?? 'any';
}


/** A card's "when it plays" line, such as "Plays after lunch", or "Plays at 7 am" for a bare time. */
export function playsLine(when: string): string {
  const text = when.trim();
  const lowered = /^I\b/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
  return /^\d/.test(lowered) ? `Plays at ${lowered}` : `Plays ${lowered}`;
}

/** One card's last 30 days and what it's missing, so advice can name the card it's about. */
export type HabitFacts = {
  id: string;
  name: string;
  /** Kept days, Ceiling days and days that counted, over the 30 days ending yesterday. */
  kept30: number;
  ceilings30: number;
  days30: number;
  hasFirstMove: boolean;
  hasAnchor: boolean;
  hasIdentity: boolean;
  /** Its Comeback card is waiting today. */
  comeback: boolean;
  /** Kept nearly every day for a month with plenty of Ceilings (`masteryOf`). */
  mastered: boolean;
  /** Brought back from the archive this session. The coach never asks to rest a card the player just chose to keep. */
  justBack?: boolean;
  /** A plan for its next Comeback is saved on this phone (`prefs.plans`). */
  hasPlan?: boolean;
  /** Comebacks kept on this card in the last 30 days. */
  comebacks30?: number;
  /** The ready-made card it was made from, if any, so an idea never suggests a card the deck already has. */
  recipeKey?: string | null;
};

export type RecommendationContext = {
  today: Day;
  habitCount: number;
  habitsWithoutTwoMinute: number;
  habitsWithoutAnchor: number;
  habitsWithoutIdentity: number;
  /** Habits with a missed yesterday and nothing yet today. */
  neverTwiceCount: number;
  /** Kept days ÷ days in window over the last 30 days, across habits. Null with under 7 days of data. */
  keptRate30: number | null;
  /** Ceiling days ÷ kept days over the last 30 days. Null when nothing was kept. */
  ceilingShare30: number | null;
  /** Calls are open and this week's hand hasn't been called yet. */
  callPending?: boolean;
  /** Something is kept today, so calls close at midnight. */
  callClosesTonight?: boolean;
  /** Back after three or more days with nothing kept. */
  away?: boolean;
  /** Every card in the deck, in deck order. With them, advice names the card and opens the right field. */
  habits?: readonly HabitFacts[];
};

/** A field on the edit screen a recommendation can open, ready to type in. */
export type EditField = 'name' | 'identity' | 'floorLabel' | 'ceilingLabel' | 'twoMinuteLabel' | 'anchor' | 'why';

/** Where the edit screen can open: a field ready to type in, or its Archive button, ringed. */
export type EditFocus = EditField | 'archive';

/** Where a recommendation goes when it isn't about one card's field. */
export type RecommendationHref = '/' | '/call' | '/habit/edit' | '/you?sheet=arrange' | `/plan?habit=${string}`;

export type Recommendation = {
  principle: Principle;
  /** Why it's showing now, short enough for an eyebrow, with no full stop. */
  reason: string;
  /** The line under the title. The principle's own `tryThis` when left out. */
  text?: string;
  /** The card it's about. With `field`, tapping opens that card's edit screen on that field (or its Archive button). */
  habitId?: string;
  field?: EditFocus;
  /** What tapping does, in a few words, without the arrow. Advice with nothing to tap has none. */
  cta?: string;
  href?: RecommendationHref;
};

/** Days of data a card needs before its rate means anything. */
const MIN_DAYS = 7;

const rate = (h: HabitFacts) => (h.days30 >= MIN_DAYS ? h.kept30 / h.days30 : null);
const share = (h: HabitFacts) => (h.kept30 > 0 ? h.ceilings30 / h.kept30 : null);

/**
 * Ideas that fit this person right now, most useful first. Each one that can be acted on says how
 * (`cta`) and where (`habitId` and `field`, or `href`), naming the card it's about when it knows. It
 * never counts missed days: it talks about days kept.
 */
export function recommend(ctx: RecommendationContext): Recommendation[] {
  const out: Recommendation[] = [];
  const add = (key: PrincipleKey, reason: string, extra: Omit<Recommendation, 'principle' | 'reason'> = {}) => {
    if (!out.some((r) => r.principle.key === key)) out.push({ principle: PRINCIPLES[key], reason, ...extra });
  };
  const habits = ctx.habits ?? [];
  const named = habits.length > 0;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)));

  if (ctx.away && ctx.habitCount > 0) add('return', 'Welcome back', { cta: 'Pick one card', href: '/' });

  if (ctx.neverTwiceCount > 0) {
    const first = habits.find((h) => h.comeback);
    const reason = ctx.neverTwiceCount === 1 && first ? `${first.name} is ready for a comeback` : 'Comebacks are waiting';
    add('comeback', reason, { cta: 'Go to today’s cards', href: '/' });
  }

  if (ctx.habitCount === 0) {
    add('identity', 'You are building your first deck', { cta: 'Make a card', href: '/habit/edit' });
    add('lead-card', 'A good first card pulls others along');
  }

  // The card kept least, when it's kept on fewer than half its days: a smaller Floor keeps more of them.
  const struggling = habits
    .map((h) => ({ h, r: rate(h) }))
    .filter((x): x is { h: HabitFacts; r: number } => x.r !== null && x.r < 0.5)
    .reduce<{ h: HabitFacts; r: number } | null>((low, x) => (!low || x.r < low.r ? x : low), null);
  if (struggling) {
    const { h } = struggling;
    add('first-move', `${h.name} was kept ${h.kept30} of ${h.days30} days`, {
      text: 'A Floor so small it takes no courage keeps far more days. You can raise it again whenever you like.',
      cta: 'Try a smaller Floor',
      habitId: h.id,
      field: 'floorLabel',
    });
  } else if (!named && ctx.keptRate30 !== null && ctx.keptRate30 < 0.5) {
    add('first-move', 'Fewer than half your days were kept lately', { text: 'A Floor so small it takes no courage keeps far more days.' });
  }

  // A card that came back twice or more this month with no plan saved: a plan makes its next Comeback easier.
  // Never says how often: every comeback follows a missed day, so a count of them is a count of misses.
  const again = habits.find((h) => (h.comebacks30 ?? 0) >= 2 && h.hasPlan === false);
  if (again) {
    add('obstacle', `${again.name} has no plan for next time yet`, {
      text: `A plan for next time makes ${again.name}’s next Comeback easier.`,
      cta: `Make a plan for ${again.name}`,
      habitId: again.id,
      href: `/plan?habit=${again.id}`,
    });
  }

  if (ctx.callPending) add('commitment', ctx.callClosesTonight ? 'Calls close at midnight' : 'Calls are open', { cta: 'Call your hand', href: '/call' });

  const missing = (n: number, has: (h: HabitFacts) => boolean) => (n > 0 ? (habits.find((h) => !has(h)) ?? null) : null);
  const noMove = missing(ctx.habitsWithoutTwoMinute, (h) => h.hasFirstMove);
  if (ctx.habitsWithoutTwoMinute > 0) {
    add('first-move', noMove && ctx.habitsWithoutTwoMinute === 1 ? `${noMove.name} has no first move yet` : plural(ctx.habitsWithoutTwoMinute, 'One card has no first move yet', '# cards have no first move yet'), {
      ...(noMove ? { cta: `Add a first move to ${noMove.name}`, habitId: noMove.id, field: 'twoMinuteLabel' as const } : {}),
    });
  }
  const noWho = missing(ctx.habitsWithoutIdentity, (h) => h.hasIdentity);
  if (ctx.habitsWithoutIdentity > 0 && ctx.habitCount > 0) {
    add('identity', noWho && ctx.habitsWithoutIdentity === 1 ? `${noWho.name} doesn’t say who it makes you yet` : plural(ctx.habitsWithoutIdentity, 'One card doesn’t say who it makes you yet', '# cards don’t say who they make you yet'), {
      ...(noWho ? { cta: `Name who ${noWho.name} makes you`, habitId: noWho.id, field: 'identity' as const } : {}),
    });
  }
  const noWhen = missing(ctx.habitsWithoutAnchor, (h) => h.hasAnchor);
  if (ctx.habitsWithoutAnchor > 0) {
    add('when-it-plays', noWhen && ctx.habitsWithoutAnchor === 1 ? `${noWhen.name} doesn’t say when it plays` : plural(ctx.habitsWithoutAnchor, 'One card doesn’t say when it plays', '# cards don’t say when they play'), {
      ...(noWhen ? { cta: `Say when ${noWhen.name} plays`, habitId: noWhen.id, field: 'anchor' as const } : {}),
    });
  }

  // Growing: a card that has become part of you, then a Ceiling that is too easy or too far.
  const master = habits.find((h) => h.mastered);
  if (master) {
    add('stretch', `${master.name} is part of you now`, {
      text: `Kept ${master.kept30} of the last 30 days. The Floor stays where it is; a higher Ceiling gives your best days somewhere to go.`,
      cta: 'Raise the Ceiling',
      habitId: master.id,
      field: 'ceilingLabel',
    });
  }
  for (const h of habits) {
    const r = rate(h);
    const s = share(h);
    if (r === null || r < 0.7 || s === null) continue;
    if (s >= 0.7) add('stretch', `${h.name}’s Ceiling is reached most days`, { cta: `Raise ${h.name}’s Ceiling`, habitId: h.id, field: 'ceilingLabel' });
    else if (s < 0.1) add('stretch', `${h.name}’s Ceiling is rarely reached`, { cta: `Bring ${h.name}’s Ceiling closer`, habitId: h.id, field: 'ceilingLabel' });
  }
  if (!named && ctx.keptRate30 !== null && ctx.keptRate30 >= 0.7 && ctx.ceilingShare30 !== null) {
    if (ctx.ceilingShare30 >= 0.7) add('stretch', 'You hit the Ceiling most days');
    else if (ctx.ceilingShare30 < 0.1) add('stretch', 'The Ceiling is rarely reached');
  }

  // A big deck that isn't being kept: rest the card kept least, on the screen that can archive it, but
  // never a card whose Comeback is waiting today. A small deck kept well: a clean page for one more.
  if (ctx.habitCount > 4 && ctx.keptRate30 !== null && ctx.keptRate30 < 0.7) {
    const rest = keptLeast(habits.filter((h) => !h.comeback && !h.justBack));
    add(
      'focus',
      `${ctx.habitCount} cards in your deck`,
      rest
        ? {
            text: `${rest.name} was kept ${rest.kept30} of ${rest.days30} days. Archive it for now: its kept days still count in your Court, and it can come back any time.`,
            cta: `Archive ${rest.name} for now`,
            habitId: rest.id,
            field: 'archive',
          }
        : // Without the cards to name, the deck can still be put in order, best cards first.
          { cta: 'Put your best cards first', href: '/you?sheet=arrange' },
    );
  }
  if (ctx.habitCount > 0 && ctx.habitCount < 3 && (ctx.keptRate30 === null || ctx.keptRate30 >= 0.7) && isCleanPage(ctx.today)) {
    add('clean-page', isFirstOfMonth(ctx.today) ? 'A new month just started' : 'It’s Monday', { cta: 'Add a card', href: '/habit/edit' });
  }
  return out;
}

/**
 * The card kept least over the last 30 days, among cards with enough days to say. On a tie, the one
 * further down the deck, since the player put the cards that matter most first.
 */
export function keptLeast(habits: readonly HabitFacts[]): HabitFacts | null {
  let least: { h: HabitFacts; r: number } | null = null;
  for (const h of habits) {
    const r = rate(h);
    if (r !== null && (!least || r <= least.r)) least = { h, r };
  }
  return least?.h ?? null;
}

const EVERGREEN: readonly PrincipleKey[] = ['celebrate', 'pile', 'swap', 'pair-up', 'obstacle', 'friction', 'add-first', 'environment', 'focus-block', 'sleep', 'lead-card'];

/** Ideas that suggest making a card, and how to tell the deck already has one like it. */
const SUGGESTS: Partial<Record<PrincipleKey, { recipes: readonly string[]; name: RegExp }>> = {
  'focus-block': { recipes: ['deep-work'], name: /\bfocus/i },
  sleep: { recipes: ['lights-out'], name: /\blights?[\s-]?out\b|\bbedtime\b|\bsleep/i },
  // "Make your first card a walk or lights out": a deck already leading with either has its strong card.
  'lead-card': { recipes: ['walk', 'lights-out'], name: /\bwalk|\blights?[\s-]?out\b|\bbedtime\b|\bsleep/i },
};

/** Whether the deck already has the card an idea would suggest making. */
function suggestsCardHeld(key: PrincipleKey, habits: readonly HabitFacts[]): boolean {
  const like = SUGGESTS[key];
  return !!like && habits.some((h) => (!!h.recipeKey && like.recipes.includes(h.recipeKey)) || like.name.test(h.name));
}

/**
 * One idea for today: the most useful recommendation, or a rotating favourite when nothing needs fixing.
 * The favourite never suggests a card the deck already has (a focus card, a lights-out card, a walk).
 */
export function ideaOfTheDay(ctx: RecommendationContext): Recommendation {
  const [top] = recommend(ctx);
  if (top) return top;
  const habits = ctx.habits ?? [];
  const start = ((daysBetween('2026-01-01', ctx.today) % EVERGREEN.length) + EVERGREEN.length) % EVERGREEN.length;
  const key = Array.from({ length: EVERGREEN.length }, (_, i) => EVERGREEN[(start + i) % EVERGREEN.length]).find((k) => !suggestsCardHeld(k, habits)) ?? EVERGREEN[start];
  return { principle: PRINCIPLES[key], reason: 'Today’s idea' };
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
  // The word that comes first wins, so "Stretch before bed and breathe slowly" is Body, not Mind.
  let best: { suit: Suit; at: number } | null = null;
  for (const [suit, words] of SUIT_WORDS) {
    const at = text.search(words);
    if (at >= 0 && (!best || at < best.at)) best = { suit, at };
  }
  return best?.suit ?? 'clubs';
}
