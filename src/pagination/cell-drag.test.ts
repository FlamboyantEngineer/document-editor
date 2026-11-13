import { EditorState, type Transaction } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { holdCellSelection } from './cell-drag.js';

const node = (name: string, content: Parameters<typeof documentSchema.node>[2] = []) =>
  documentSchema.node(name, null, content);
const cell = (text: string) => node('table_cell', [node('paragraph', [documentSchema.text(text)])]);

// A table of one row of two cells, and the position inside each.
function tableState() {
  const doc = node('doc', [
    node('page_section', [
      node('page', [
        node('page_header'),
        node('page_content', [node('table', [node('table_row', [cell('A'), cell('B')])])]),
        node('page_footnotes'),
        node('page_footer'),
      ]),
    ]),
  ]);
  const cells: number[] = [];
  doc.descendants((child, pos) => {
    if (child.type.name === 'table_cell') cells.push(pos);
    return true;
  });
  return { state: EditorState.create({ doc }), cells };
}

// A drag on a fake view: the cell under the pointer is the one an event names in `detail`.
function dragOn() {
  const { state, cells } = tableState();
  const selected: Transaction[] = [];
  const hold = holdCellSelection();
  const view = { dom: document.body } as unknown as EditorView;
  const at = (index: number, buttons: number) =>
    new MouseEvent('mousemove', { detail: index, buttons, bubbles: true });
  hold.drag(view, new MouseEvent('mousedown', { detail: 0, button: 0 }), {
    cellAt: (event) => cells[event.detail] ?? null,
    canonical: () => state,
    select: (tr) => selected.push(tr),
  });
  return { hold, selected, at };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('a cell drag across the pages', () => {
  it('DOCE-PAGINATION-7.11 selects the cells the pressed pointer moves over', () => {
    const { hold, selected, at } = dragOn();
    document.dispatchEvent(at(1, 1));
    expect(selected.at(-1)?.selection).toBeInstanceOf(CellSelection);
    expect(hold.held()).toBe(true);
  });

  it.each([
    ['a native drag starts', new Event('dragstart')],
    ['the pointer moves with no button down', new MouseEvent('mousemove', { buttons: 0 })],
  ])('DOCE-PAGINATION-7.11 stops following the press once %s', (_name, ending) => {
    const { hold, selected, at } = dragOn();
    document.dispatchEvent(ending);
    document.dispatchEvent(at(1, 1));
    expect(selected).toHaveLength(0);
    expect(hold.held()).toBe(false);
  });

  it('DOCE-PAGINATION-7.11 stops following the press when the selection is let go', () => {
    const { hold, selected, at } = dragOn();
    hold.release();
    document.dispatchEvent(at(1, 1));
    expect(selected).toHaveLength(0);
  });
});
