import { Transform } from 'prosemirror-transform';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { mathOf, standInMathLayouter } from '../../test/math-layout-fixtures.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { readPagesDocument } from '../document/pages-layout.js';
import { placeMath } from '../layout-engine/math-atoms.js';
import { forcedLinesKey } from './forced-lines.js';
import { pagesLayout } from './pages-layout.js';

const text = (value: string) => documentSchema.text(value);
const paragraph = (value: string, attrs: Record<string, unknown> = {}) =>
  node('paragraph', attrs, value ? [text(value)] : []);

// The forced lines' decorations of a block, by offset in its content.
function decorationsOf(state: ReturnType<typeof pagesState>, pos: number) {
  const set = forcedLinesKey.getState(state)?.decorations;
  const size = state.doc.nodeAt(pos)?.nodeSize ?? 0;
  return (set?.find(pos + 1, pos + size - 1) ?? [])
    .filter((each) => each.from > pos)
    .map((each) => {
      const attrs = (each as unknown as { type: { attrs: Record<string, string> } }).type.attrs;
      return { from: each.from - pos - 1, to: each.to - pos - 1, ...attrs };
    });
}

describe('pagesLayout', () => {
  it('DOCE-PAGINATION-13.2 gives each forced block with the marks the pages draw it with', () => {
    const doc = pagesDocument([
      page([paragraph('aaaaaaaaaabbbbbbbbbbcc', { dataId: 'p1' })]),
      page([node('heading', { level: 1, dataId: 'h1' }, [text('Scope of the plan')])]),
    ]);
    let headingPos = -1;
    doc.descendants((child, pos) => {
      if (child.type.name === 'heading') headingPos = pos;
      return headingPos < 0;
    });
    const engine = stubEngine({ headings: new Map([[headingPos, '1 ']]) });
    const state = pagesState(doc, engine);
    const layout = pagesLayout(state, { footnoteNumbering: 'page' });
    expect(layout?.footnoteNumbering).toBe('page');
    expect(layout?.blocks.map(({ pos, lines, number }) => ({ pos, lines, number }))).toEqual([
      { pos: 5, lines: 3, number: undefined },
      { pos: headingPos, lines: 2, number: '1 ' },
    ]);
    for (const block of layout?.blocks ?? []) {
      expect(block.marks).toEqual(decorationsOf(state, block.pos));
    }
  });

  it('DOCE-PAGINATION-13.2 gives linked code with the marks of its code, and code beside a gutter with it', () => {
    const doc = pagesDocument([
      page([
        paragraph('aaaaaaaaaabb', { dataId: 'p1' }),
        node('linked_code_block', { dataId: 'lk', code: 'abcdefghijklmn' }),
      ]),
    ]);
    const plain = pagesLayout(pagesState(doc, stubEngine()));
    const blocks = plain?.blocks.map(({ pos, lines, gutter }) => ({
      type: doc.nodeAt(pos)?.type.name,
      lines,
      gutter,
    }));
    expect(blocks).toEqual([
      { type: 'paragraph', lines: 2, gutter: undefined },
      { type: 'linked_code_block', lines: 2, gutter: undefined },
    ]);
    const code = plain?.blocks[1]?.marks.filter((mark) => /de-forced-lines__end/u.test(mark.class));
    // Its first line wraps at the tenth character, as the engine laid it out.
    expect(code?.map(({ to }) => to)).toEqual([10]);
    const inset = pagesLayout(pagesState(doc, stubEngine({ inset: 24 })));
    expect(inset?.blocks[1]?.gutter).toBe(true);
  });

  it('DOCE-PAGINATION-13.2 holds the pages document and each variable as the pages show it', () => {
    const footer = [
      node('paragraph', null, [
        node('template_variable', { variableKey: 'page.current' }),
        text(' of '),
        node('template_variable', { variableKey: 'document.name' }),
      ]),
    ];
    const values = { 'document.name': 'Interface notes' };
    const doc = new Transform(
      pagesDocument([page([paragraph('One')], { footer })]),
    ).setDocAttribute('values', values).doc;
    const layout = pagesLayout(pagesState(doc, stubEngine()));
    // The pages document keeps the texts it stores, which the variables show.
    expect(layout && readPagesDocument(layout, documentSchema).eq(doc)).toBe(true);
    expect(layout?.variables.map((each) => each.text)).toEqual(['1', 'Interface notes']);
    const first = layout?.variables[0]?.pos ?? 0;
    expect(doc.nodeAt(first - 1)?.type.name).toBe('template_variable');
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
  });

  it('DOCE-PAGINATION-12.11 carries each equation where the engine placed it as it laid the pages out', () => {
    const laid = standInMathLayouter().layouter.layout(mathOf(['x']), false, 20);
    if (!laid) throw new Error('the stand-in refused');
    const placed = placeMath({ math: laid }, 600);
    const atom = node('math_inline', null, [text('x')]);
    const doc = pagesDocument([page([node('paragraph', null, [text('a'), atom])])]);
    let placing = false;
    const engine = { ...stubEngine(), mathOf: () => (placing ? placed : null) };
    const state = pagesState(doc, engine);
    // Placed after the state was made, as the pages are laid out after a transaction.
    placing = true;
    const layout = pagesLayout(state, {
      typesetOf: () => ({ state: 'ready', math: mathOf(['x']) }),
    });
    expect(layout?.math).toEqual([expect.objectContaining({ drawing: placed })]);
  });

  it('DOCE-PAGINATION-13.10 holds the language the engine laid the pages out in', () => {
    const doc = pagesDocument([page([paragraph('One')])]);
    expect(pagesLayout(pagesState(doc, { ...stubEngine(), language: 'tr' }))?.language).toBe('tr');
    expect(pagesLayout(pagesState(doc, stubEngine()))?.language).toBe('');
  });

  it('DOCE-PAGINATION-13.2 gives no layout when the pages are not drawn on the engine', () => {
    const doc = pagesDocument([page([paragraph('One')])]);
    expect(pagesLayout(pagesState(doc, null))).toBeNull();
  });

  it('DOCE-PAGINATION-13.2 says the layout is provisional until the pages settle and atoms load', () => {
    const doc = pagesDocument([page([paragraph('One')])]);
    const engine = stubEngine();
    expect(pagesLayout(pagesState(doc, engine), { settled: true })?.provisional).toBe(false);
    expect(pagesLayout(pagesState(doc, engine), { settled: false })?.provisional).toBe(true);
    const loading = { ...engine, provisional: () => true };
    expect(pagesLayout(pagesState(doc, loading), { settled: true })?.provisional).toBe(true);
  });
});
