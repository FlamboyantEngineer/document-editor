import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, pagesState, stubEngine } from '../../test/pages-fixtures.js';
import { readPagesDocument } from '../document/pages-layout.js';
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

  it('DOCE-PAGINATION-13.2 holds the pages document and each variable as the pages show it', () => {
    const footer = [
      node('paragraph', null, [
        node('template_variable', { variableKey: 'page.current' }),
        text(' of '),
        node('template_variable', { variableKey: 'document.name' }),
      ]),
    ];
    const doc = pagesDocument([page([paragraph('One')], { footer })]);
    const layout = pagesLayout(pagesState(doc, stubEngine()));
    expect(layout && readPagesDocument(layout, documentSchema).eq(doc)).toBe(true);
    expect(layout?.variables.map((each) => each.text)).toEqual(['1', '<document.name>']);
    const first = layout?.variables[0]?.pos ?? 0;
    expect(doc.nodeAt(first - 1)?.type.name).toBe('template_variable');
    expect(JSON.parse(JSON.stringify(layout))).toEqual(layout);
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
