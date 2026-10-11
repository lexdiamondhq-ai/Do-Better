import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** Names and labels from habit books. Do Better says these things in its own words. */
const BORROWED = /atomic habits|tiny habits|power of habit|james clear|two-minute|2-minute|never (miss )?twice|\bvot(e|es|ing)\b|habit stack|keystone|deep work|temptation bundl|goldilocks|four laws|cue, routine/i;

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

describe('words on screen', () => {
  it('never name a book, an author, or their labels', () => {
    const files = ['app', 'components', 'lib', 'engine'].flatMap((dir) => ts.sys.readDirectory(`${ROOT}${dir}`, ['.ts', '.tsx'])).filter((file) => !file.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(20);
    const found = files.flatMap((file) => textIn(file).filter((text) => BORROWED.test(text)).map((text) => `${file.slice(ROOT.length)}: ${text.trim()}`));
    expect(found).toEqual([]);
  });
});
