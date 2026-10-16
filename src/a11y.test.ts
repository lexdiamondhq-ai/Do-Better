import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = decodeURIComponent(new URL('.', import.meta.url).pathname);

/** Things you tap. Each must tell VoiceOver what it is: a button, a tab, a link, a switch. */
const TAPPABLE = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']);

/**
 * Every tappable element in a source file that doesn't say what it is: no `accessibilityRole`, no
 * `role`, and no spread props that could carry one. Returns "line: <Tag>" for each.
 */
function unlabelled(name: string, text: string): string[] {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && TAPPABLE.has(node.tagName.getText(source))) {
      const props = node.attributes.properties;
      const says = props.some((p) => ts.isJsxSpreadAttribute(p) || (ts.isJsxAttribute(p) && ['accessibilityRole', 'role'].includes(p.name.getText(source))));
      if (!says) out.push(`${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: <${node.tagName.getText(source)}>`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe('the pressable scan', () => {
  it('finds a Pressable with no role and passes one with a role, a web role or spread props', () => {
    const text = [
      'const a = <Pressable onPress={go}><Text>Go</Text></Pressable>;',
      'const b = <Pressable accessibilityRole="button" onPress={go} />;',
      'const c = <Pressable role="link" onPress={go} />;',
      'const d = <Pressable {...rest} />;',
      'const e = <TouchableOpacity onPress={go} />;',
      'const f = <View onPress={go} />;',
    ].join('\n');
    expect(unlabelled('fixture.tsx', text)).toEqual(['1: <Pressable>', '5: <TouchableOpacity>']);
  });
});

// The integration step turns this on, once every workstream has given its tappable things a role.
describe.skip('every tappable thing says what it is', () => {
  it('has an accessibilityRole on every Pressable', () => {
    const files = ['app', 'components'].flatMap((dir) => ts.sys.readDirectory(`${ROOT}${dir}`, ['.tsx']));
    expect(files.length).toBeGreaterThan(10);
    const found = files.flatMap((file) => unlabelled(file, ts.sys.readFile(file) ?? '').map((hit) => `${file.slice(ROOT.length)}:${hit}`));
    expect(found).toEqual([]);
  });
});
