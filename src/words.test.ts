import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Names and labels from habit books. Do Better says these things in its own words. */
const BORROWED = /atomic habits|tiny habits|power of habit|james clear|two-minute|2-minute|never (miss )?twice|\bvot(e|es|ing)\b|habit stack|keystone|deep work|temptation bundl|goldilocks|four laws|cue, routine/i;

/** Card words, never casino words: the game rewards keeping a habit, not risking something. */
const CASINO = /\b(odds|wagers?|jackpots?|bets?|betting|rake|high-rollers?|best value)\b/i;
/** Words from earlier drafts that the game no longer uses. */
const RETIRED = /\b(rescued|bounce-backs?|habit-days?|crowned)\b/i;
/** Streaks are gone. The only place the word may appear is the promise that there are none. */
const STREAK = /streak/i;
const NO_STREAKS = /\bno streaks\b/gi;
/** A plan looks ahead. Nothing on screen asks for an excuse or counts the days that got away. */
const SHAME = /\b(excuses?|days? missed|missed \d+)\b/i;

const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname);

/** Every piece of text in a file that could reach the screen: strings, template text and JSX text. */
function textIn(file: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, ts.sys.readFile(file) ?? '', ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) out.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const files = ['app', 'components', 'lib', 'engine'].flatMap((dir) => ts.sys.readDirectory(`${ROOT}${dir}`, ['.ts', '.tsx'])).filter((file) => !file.endsWith('.test.ts'));
const texts = files.flatMap((file) => textIn(file).map((text) => ({ file: file.slice(ROOT.length), text: text.trim() })));
const hits = (re: RegExp) => texts.filter(({ text }) => re.test(text)).map(({ file, text }) => `${file}: ${text}`);

describe('words on screen', () => {
  it('reads every file', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never name a book, an author, or their labels', () => {
    expect(hits(BORROWED)).toEqual([]);
  });

  it('never use casino words', () => {
    expect(hits(CASINO)).toEqual([]);
  });

  it('never use retired words', () => {
    expect(hits(RETIRED)).toEqual([]);
  });

  it('never ask for an excuse or count missed days', () => {
    expect(hits(SHAME)).toEqual([]);
    // The pattern itself catches what it is for.
    for (const line of ['No excuses today', 'What was your excuse?', '3 days missed', 'You missed 2 days']) expect(line).toMatch(SHAME);
    for (const line of ['What got in the way?', 'Yesterday got away', 'Missed a day? Keep the Floor.']) expect(line).not.toMatch(SHAME);
  });

  it('only mention streaks to say there are none', () => {
    const stray = texts.filter(({ text }) => STREAK.test(text.replace(NO_STREAKS, ''))).map(({ file, text }) => `${file}: ${text}`);
    expect(stray).toEqual([]);
  });
});
