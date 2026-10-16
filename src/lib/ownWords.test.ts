import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Sign-in, the tour, You, the rules and saving a deck: the screens a new player reads first. */
const FILES = [
  'app/(auth)/sign-in.tsx',
  'app/(app)/onboarding.tsx',
  'app/(app)/(tabs)/you.tsx',
  'lib/signIn.ts',
  'lib/review.ts',
  'components/RulesSheet.tsx',
  'components/SaveDeckCard.tsx',
  'components/ArrangeDeck.tsx',
];

/** Card words, never casino words: the game rewards keeping a habit, not risking something. */
const CASINO = /\b(odds|wagers?|jackpots?|bets?|betting|rake|high-rollers?|best value)\b/i;
/** Words from earlier drafts that the game no longer uses. */
const RETIRED = /\b(rescued|bounce-backs?|habit-days?|crowned)\b/i;
/** Labels from habit books. Do Better says these things in its own words. */
const BORROWED = /atomic habits|tiny habits|power of habit|james clear|two-minute|2-minute|never (miss )?twice|\bvot(e|es|ing)\b|habit stack|keystone|deep work|temptation bundl|goldilocks|four laws|cue, routine/i;
/** Streaks are gone. The only place the word may appear is the promise that there are none. */
const STREAK = /streak/i;
const NO_STREAKS = /\bno streaks\b/gi;

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);

function textIn(file: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const body = ts.sys.readFile(`${ROOT}${file}`);
  if (body === undefined) throw new Error(`Missing ${file}`);
  const source = ts.createSourceFile(file, body, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const texts = FILES.flatMap((file) => textIn(file).map((text) => ({ file, text: text.trim() })));
const hits = (re: RegExp) => texts.filter(({ text }) => re.test(text)).map(({ file, text }) => `${file}: ${text}`);

describe('first-run words', () => {
  it('reads every file', () => {
    expect(texts.length).toBeGreaterThan(200);
  });

  it('never uses casino words', () => {
    expect(hits(CASINO)).toEqual([]);
  });

  it('never uses retired words or borrowed labels', () => {
    expect(hits(RETIRED)).toEqual([]);
    expect(hits(BORROWED)).toEqual([]);
  });

  it('only mentions streaks to say there are none', () => {
    const stray = texts.filter(({ text }) => STREAK.test(text.replace(NO_STREAKS, ''))).map(({ file, text }) => `${file}: ${text}`);
    expect(stray).toEqual([]);
  });
});
