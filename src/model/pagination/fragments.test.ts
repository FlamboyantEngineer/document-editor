import type { Node } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../../test/document-markup.js';
import { continuesFragment, FRAGMENT_RULES, isFragment, joinFragments } from '../index.js';

type Attrs = Record<string, unknown>;

function node(name: string, attrs: Attrs | null = null, content: Node[] | string = []): Node {
  const type = documentSchema.nodes[name];
  if (!type) throw new Error(name);
  return type.create(attrs, typeof content === 'string' ? documentSchema.text(content) : content);
}

const paragraph = (attrs: Attrs | null, text: string) => node('paragraph', attrs, text);
const item = (attrs: Attrs | null, content: Node[]) => node('list_item', attrs, content);
const row = (cell: string, text: string) =>
  node('table_row', null, [node(cell, null, [paragraph(null, text)])]);

describe('split block fragments', () => {
  it('DOCE-PAGINATION-1.1 tells a fragment from a whole block by its part attributes', () => {
    expect(isFragment(paragraph({ dataId: 'p1' }, 'Whole'))).toBe(false);
    expect(isFragment(paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Part'))).toBe(true);
    expect(isFragment(node('toc_block', { entryStart: 4 }))).toBe(true);
    expect(isFragment(node('heading', { level: 1 }, 'Never split'))).toBe(false);
  });

  it('DOCE-PAGINATION-1.2 joins the fragments of a paragraph that share an id or follow on', () => {
    const head = paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Split ');
    const tail = paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'across');
    const unnamed = [paragraph({ splitPartIndex: 0 }, 'A'), paragraph({ splitPartIndex: 1 }, 'B')];
    const [joined] = joinFragments([head, tail]);
    expect(joined?.textContent).toBe('Split across');
    expect(joined?.attrs).toMatchObject({ dataId: 'p1', splitPartIndex: null });
    expect(joinFragments(unnamed).map((block) => block.textContent)).toEqual(['AB']);
    const twins = [paragraph({ dataId: 'p2' }, 'One'), paragraph({ dataId: 'p2' }, 'Two')];
    expect(joinFragments(twins)).toHaveLength(2);
    expect(continuesFragment(head, node('heading', { dataId: 'p1' }, 'Other'))).toBe(false);
  });

  it('DOCE-PAGINATION-1.3 puts back the line break a code block was split at', () => {
    const head = node('code_block', { dataId: 'c1', splitPartIndex: 0 }, 'one');
    const tail = node(
      'code_block',
      { dataId: 'c1', splitPartIndex: 1, codeBlockContinued: true, codeLineStart: 2 },
      'two',
    );
    const [joined] = joinFragments([head, tail]);
    expect(joined?.textContent).toBe('one\ntwo');
    expect(joined?.attrs).toMatchObject({ codeBlockContinued: false, codeLineStart: 1 });
    const linked = joinFragments([
      node('linked_code_block', { dataId: 'l1', code: 'a', splitPartIndex: 0 }),
      node('linked_code_block', {
        dataId: 'l1',
        code: 'b',
        splitPartIndex: 1,
        codeBlockContinued: true,
      }),
    ]);
    expect(linked.map((block) => block.attrs.code)).toEqual(['a\nb']);
  });

  it('DOCE-PAGINATION-1.4 keeps a split table header once', () => {
    const fragment = (index: number, text: string) =>
      node('table', { dataId: 't1', splitPartIndex: index }, [
        row('table_header', 'Name'),
        row('table_cell', text),
      ]);
    const [joined] = joinFragments([fragment(0, 'One'), fragment(1, 'Two')]);
    expect(joined?.childCount).toBe(3);
    expect(joined?.textContent).toBe('NameOneTwo');
  });

  it('DOCE-PAGINATION-1.5 joins a split list item by item and child by child', () => {
    const head = node('ordered_list', { dataId: 'l1', order: 3, splitPartIndex: 0 }, [
      item({ dataId: 'i1' }, [paragraph(null, 'First')]),
      item({ dataId: 'i2', splitPartIndex: 0 }, [
        paragraph({ dataId: 'p1', splitPartIndex: 0 }, 'Sec'),
      ]),
    ]);
    const tail = node('ordered_list', { dataId: 'l1', order: 4, splitPartIndex: 1 }, [
      item({ dataId: 'i2', splitPartIndex: 1, orphanedListContinuation: true }, [
        paragraph({ dataId: 'p1', splitPartIndex: 1 }, 'ond'),
      ]),
      item({ dataId: 'i3' }, [paragraph(null, 'Third')]),
    ]);
    const [joined] = joinFragments([head, tail]);
    expect(joined?.attrs).toMatchObject({ order: 3, splitPartIndex: null });
    expect(joined?.childCount).toBe(3);
    expect(joined?.child(1).attrs).toMatchObject({
      splitPartIndex: null,
      orphanedListContinuation: false,
    });
    expect(joined?.child(1).textContent).toBe('Second');
  });

  it('DOCE-PAGINATION-1.6 joins the parts of a table of contents with the same settings', () => {
    const part = (attrs: Attrs) => node('toc_block', { tocType: 'toc', minLevel: 3, ...attrs });
    const joined = joinFragments([
      part({ entryEnd: 5 }),
      part({ entryStart: 5, showTitle: false }),
      part({ tocType: 'figures', entryStart: 2 }),
    ]);
    expect(joined.map((block) => block.attrs)).toMatchObject([
      { tocType: 'toc', entryStart: 0, entryEnd: null, showTitle: true },
      { tocType: 'figures', entryStart: 0 },
    ]);
  });

  it('DOCE-PAGINATION-1.7 joins a type only by the rule it has', () => {
    const { blockquote: rule, ...withoutQuotes } = FRAGMENT_RULES;
    if (!rule) throw new Error('blockquote rule');
    const quote = (index: number, text: string) =>
      node('blockquote', { dataId: 'q1', splitPartIndex: index }, [paragraph(null, text)]);
    expect(joinFragments([quote(0, 'A'), quote(1, 'B')], withoutQuotes)).toHaveLength(2);
    const [joined] = joinFragments([quote(0, 'A'), quote(1, 'B')], {
      ...withoutQuotes,
      blockquote: rule,
    });
    expect(joined?.childCount).toBe(2);
  });

  it('DOCE-PAGINATION-1.8 joins script block and layout section fragments column by column', () => {
    const script = (part: number, text: string) =>
      node('script_block', { dataId: 's1', script: 'run()', splitPartIndex: part }, [
        paragraph({ dataId: `sp${String(part)}` }, text),
      ]);
    const [output] = joinFragments([script(0, 'Head'), script(1, 'Tail')]);
    expect(output?.childCount).toBe(2);
    expect(output?.attrs).toMatchObject({ script: 'run()', splitPartIndex: null });
    const column = (id: string, content: Node[]) => node('layout_column', { dataId: id }, content);
    const empty = () => node('paragraph');
    const section = (part: number, columns: Node[]) =>
      node('layout_section', { dataId: 'ls1', splitPartIndex: part }, columns);
    const head = section(0, [
      column('c1', [
        paragraph({ dataId: 'a' }, 'A'),
        paragraph({ dataId: 'b', splitPartIndex: 0 }, 'B1 '),
      ]),
      column('c2', [empty()]),
    ]);
    const tail = section(1, [
      column('c1', [paragraph({ dataId: 'b', splitPartIndex: 1 }, 'B2')]),
      column('c2', [paragraph({ dataId: 'c' }, 'C')]),
    ]);
    const [joined] = joinFragments([head, tail]);
    expect(joined?.attrs.splitPartIndex).toBeNull();
    expect(joined?.childCount).toBe(2);
    expect(joined?.child(0).childCount).toBe(2);
    expect(joined?.child(0).lastChild?.textContent).toBe('B1 B2');
    expect(joined?.child(0).lastChild?.attrs.splitPartIndex).toBeNull();
    expect(joined?.child(1).textContent).toBe('C');
    expect(joined?.child(1).childCount).toBe(1);
  });
});
