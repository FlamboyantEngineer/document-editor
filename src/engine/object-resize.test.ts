import { EditorState, NodeSelection, type Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { installEditorDom } from '../../test/editor-dom.js';
import { baseEngine, engineHeld } from '../../test/engine-plugin.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { sectionContentWidth } from '../pagination/content-width.js';
import { objectBoxAt } from '../pagination/object-boxes.js';
import type { PagesTextEngine } from '../pagination/text-engine-types.js';
import { setObjectLayout } from './figure-commands.js';
import { laidOutFigureSize } from './figure-measure.js';
import { distributeRows } from './table-format.js';
import { createColumnResize } from './table-resize.js';
import { createRowResize } from './table-row-resize.js';

installEditorDom();

const ROOM = sectionContentWidth(BASE_TEMPLATE, null);
// The whole-pixel size of a 2:1 figure fitted to the page's content.
const FITTED = { width: Math.floor(ROOM), height: Math.round(Math.floor(ROOM) / 2) };

const cell = (value: string, attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'tableCell',
  attrs,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
const row = (...cells: StoredNode[]): StoredNode => ({ type: 'tableRow', content: cells });
const TABLE: StoredNode = {
  type: 'table',
  attrs: { layout: 'fit-page-width' },
  content: [row(cell('Pump'), cell('P-1')), row(cell('Valve'), cell('V-1'))],
};
const FIGURE: StoredNode = {
  type: 'figure',
  attrs: { src: 'https://example.com/a.png', width: 300, height: 150, layout: 'fit-page-width' },
};

let engine: PagesTextEngine;

beforeEach(() => {
  engine = baseEngine();
});

afterEach(() => {
  engine.destroy();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function stateOf(content: StoredNode[], plugins: Plugin[]): EditorState {
  const { doc } = readDocumentFile(
    { formatVersion: 1, sections: [{ name: null, content }] },
    documentSchema,
  );
  return EditorState.create({ doc, plugins });
}

// A view drawn at `zoom` on screen, every element drawn 100 by 20 screen pixels whatever the
// engine laid it out at, so only the engine's numbers can give the sizes the tests expect.
function zoomedView(content: StoredNode[], plugins: Plugin[], zoom = 2): EditorView {
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: stateOf(content, [engineHeld(engine), ...plugins]),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 20, 100, 20),
  );
  Object.defineProperty(view.dom, 'offsetWidth', { configurable: true, value: 100 / zoom });
  return view;
}

function positionOf(state: EditorState, type: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos;
    return found < 0;
  });
  return found;
}

const cellElement = (view: EditorView, text: string) =>
  [...view.dom.querySelectorAll('td')].find((each) => each.textContent === text) as HTMLElement;

function cellAttrs(state: EditorState, name: 'colwidth' | 'rowHeight'): unknown[] {
  const values: unknown[] = [];
  state.doc.descendants((node) => {
    if (node.type.name === 'table_cell') values.push(node.attrs[name]);
  });
  return values;
}

function tableBox(state: EditorState) {
  const box = objectBoxAt(state, positionOf(state, 'table'));
  if (box?.kind !== 'table') throw new Error('no table box');
  return box;
}

describe('resizing from the layout engine', () => {
  it('DOCE-PAGINATION-10.12 DOCE-OBJECTS-1.11 keeps the image box a figure was fitted at when it leaves the fit', () => {
    let state = stateOf([FIGURE], [engineHeld(engine)]);
    const pos = positionOf(state, 'figure');
    expect(laidOutFigureSize({ state } as EditorView, pos)).toEqual(FITTED);
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    const view = { state } as EditorView;
    setObjectLayout('left')(state, (tr) => (state = state.apply(tr)), view);
    expect(state.doc.nodeAt(pos)?.attrs).toMatchObject({
      objectLayout: 'left',
      ...FITTED,
    });
  });

  it('DOCE-PAGINATION-10.12 gives a figure its stored size where the engine does not lay it out', () => {
    const state = stateOf([FIGURE], []);
    expect(laidOutFigureSize({ state } as EditorView, positionOf(state, 'figure'))).toEqual({
      width: 300,
      height: 150,
    });
  });

  it("DOCE-PAGINATION-10.12 DOCE-TABLES-3.12 keeps the engine's column widths when a fitted table is aligned", () => {
    let state = stateOf([TABLE], [engineHeld(engine)]);
    const columns = tableBox(state).columns.map((width) => Math.round(width));
    const inside = TextSelection.near(state.doc.resolve(positionOf(state, 'table') + 4));
    state = state.apply(state.tr.setSelection(inside));
    const view = { state } as EditorView;
    setObjectLayout('center')(state, (tr) => (state = state.apply(tr)), view);
    expect(cellAttrs(state, 'colwidth')).toEqual([
      [columns[0]],
      [columns[1]],
      [columns[0]],
      [columns[1]],
    ]);
  });

  it("DOCE-PAGINATION-10.12 DOCE-TABLES-2.4 drags a column border from the engine's widths, the pointer's movement unzoomed", () => {
    const view = zoomedView([TABLE], [createColumnResize()]);
    const [first = 0, second = 0] = tableBox(view.state).columns.map((width) => Math.round(width));
    const pressed = cellElement(view, 'Pump');
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(pressed.querySelector('p'));
    const at = (type: string, clientX: number, target: EventTarget = pressed) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 30 }),
      );
    at('mousemove', 98);
    at('mousedown', 98);
    at('mousemove', 158, document);
    at('mouseup', 158, document);
    // 60 screen pixels at a zoom of 2 are 30 of the document's.
    expect(cellAttrs(view.state, 'colwidth')).toEqual([
      [first + 30],
      [second - 30],
      [first + 30],
      [second - 30],
    ]);
    view.destroy();
  });

  it("DOCE-PAGINATION-10.12 DOCE-TABLES-3.6 drags a row border from the engine's height, setting the height of the row's content", () => {
    const view = zoomedView([TABLE], [createRowResize()]);
    const box = tableBox(view.state);
    const pressed = cellElement(view, 'Pump');
    pressed.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 39 }));
    pressed.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientY: 39 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 79 }));
    // 40 screen pixels at a zoom of 2 are 20 of the document's.
    const set = Math.round((box.rows[0] ?? 0) + 20) - 2 * box.edge;
    expect(cellAttrs(view.state, 'rowHeight')).toEqual([set, set, null, null]);
    const after = tableBox(view.state);
    expect(after.rows[0]).toBeCloseTo((box.rows[0] ?? 0) + 20, 0);
    view.destroy();
  });

  it("DOCE-PAGINATION-10.12 DOCE-TABLES-3.10 distributes rows from the engine's heights", () => {
    const tall = {
      ...TABLE,
      content: [
        row(cell('Pump', { rowHeight: 60 }), cell('P-1', { rowHeight: 60 })),
        row(cell('Valve'), cell('V-1')),
      ],
    };
    let state = stateOf([tall], [engineHeld(engine)]);
    const box = tableBox(state);
    const contents = box.rows.map((height) => Math.round(height - 2 * box.edge));
    const inside = TextSelection.near(state.doc.resolve(positionOf(state, 'table') + 4));
    state = state.apply(state.tr.setSelection(inside));
    const view = { state } as EditorView;
    expect(distributeRows(state, (tr) => (state = state.apply(tr)), view)).toBe(true);
    const even = Math.round(((contents[0] ?? 0) + (contents[1] ?? 0)) / 2);
    expect(cellAttrs(state, 'rowHeight')).toEqual([even, even, even, even]);
  });
});
