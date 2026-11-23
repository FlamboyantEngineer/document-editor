import type { Node } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import type { Decoration, DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { node, page, pagesDocument, stubEngine } from '../../test/pages-fixtures.js';
import { forcedLines } from './forced-lines.js';
import { forcedRegions } from './forced-regions.js';
import { createPageVariables } from './page-variables.js';
import type { DrawnLines, PagesTextEngine } from './text-engine-types.js';
import { pageTextLines } from './text-lines.js';

const footer = () => [
  node('paragraph', null, [
    documentSchema.text('Page '),
    node('template_variable', { variableKey: 'page.current' }),
  ]),
];

const twoPages = () =>
  pagesDocument(
    [1, 2].map((pageNumber) =>
      page([node('paragraph', null, [documentSchema.text('Body')])], {
        footer: footer(),
        pageNumber,
        totalPages: 2,
      }),
    ),
    'Body',
  );

// The stub engine, laying each region's text blocks out as it lays any block out, noting the texts
// its variables were given.
function regionEngine() {
  const calls: { scope: string | null; texts: [string, string][] }[] = [];
  const base = stubEngine();
  const engine: PagesTextEngine = {
    ...base,
    regionLines(region, scope, texts) {
      calls.push({ scope, texts: [...(texts ?? [])] });
      const lines = new Map<Node, DrawnLines>();
      region.forEach((child) => {
        const table = base.lines(child, { scope });
        if (table) lines.set(child, table);
      });
      return lines;
    },
  };
  return { engine, calls };
}

function stateWith(doc: Node, engine: PagesTextEngine) {
  const source = { engine: () => engine, version: () => 0 };
  const plugins = [forcedLines(source), forcedRegions(), createPageVariables()];
  return EditorState.create({ doc, plugins });
}

// The forced regions' decorations' attributes.
function regionAttrs(state: EditorState) {
  const plugin = state.plugins[1];
  const set = plugin?.props.decorations?.call(plugin, state) as DecorationSet | undefined;
  return (set?.find() ?? []).map(
    (each: Decoration) =>
      (each as unknown as { type: { attrs: Record<string, string> } }).type.attrs,
  );
}

describe('forcedRegions', () => {
  it("DOCE-PAGINATION-11.2 draws each page's footer on the lines laid out with its page's number", () => {
    const { engine, calls } = regionEngine();
    const state = stateWith(twoPages(), engine);
    const blocks = regionAttrs(state).filter((attrs) => attrs.class === 'de-forced-lines');
    expect(blocks.map((attrs) => attrs['data-lines'])).toEqual(['1', '1']);
    expect(calls).toEqual([
      { scope: 'Body', texts: [['page.current', '1']] },
      { scope: 'Body', texts: [['page.current', '2']] },
    ]);
    // The same state draws the same set again without laying anything out.
    regionAttrs(state);
    expect(calls).toHaveLength(2);
  });

  it('DOCE-PAGINATION-11.3 gives the computed lines of each footer block, marked with its region, with its values', () => {
    const { engine } = regionEngine();
    const pages = pageTextLines(stateWith(twoPages(), engine));
    const footers = pages.map(({ blocks }) =>
      blocks.filter((block) => block.region).map(({ region, lines }) => ({ region, lines })),
    );
    // A variable's value is on the line, as the page draws it.
    const line = (text: string) => ({ region: 'footer', lines: [{ from: 0, to: 7, text }] });
    expect(footers).toEqual([[line('Page 1')], [line('Page 2')]]);
  });
});
