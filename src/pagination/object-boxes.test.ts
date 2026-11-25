import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../../test/canvas-fixtures.js';
import { parseMarkup } from '../../test/document-markup.js';
import { page, pagesDocument, pagesState as laidOutState } from '../../test/pages-fixtures.js';
import { BASE_TEMPLATE } from '../model/templates/base-template.js';
import { sectionContentWidth } from './content-width.js';
import {
  bindViewPages,
  contentRoomAt,
  contentRoomOf,
  objectBoxAt,
  objectBoxOf,
  rowBoxOf,
} from './object-boxes.js';
import { createPagesTextEngine } from './text-engine.js';
import type { PagesTextEngine } from './text-engine-types.js';

const FIGURE =
  '<figure data-figure-width="300" data-figure-height="150" data-object-layout="fit-page-width"><img src="a.png"><figcaption>Pump</figcaption></figure>';
const TABLE =
  '<table><tr><td><p>Pump</p></td><td><p>Valve</p></td></tr><tr><td data-row-height="40"><p>a</p></td><td data-row-height="40"><p>b</p></td></tr></table>';

let engine: PagesTextEngine;

beforeEach(() => {
  installFakeCanvas();
  engine = createPagesTextEngine({
    template: BASE_TEMPLATE,
    measureIn: document.createElement('div'),
    onAtomsSettled: () => undefined,
  });
});

afterEach(() => {
  engine.destroy();
});

// A pages' document of one page holding the blocks of some markup, laid out by the engine or not.
function pagesState(html: string, laidOut = true): EditorState {
  const blocks: Parameters<typeof page>[0] = [];
  parseMarkup(html).forEach((block) => blocks.push(block));
  return laidOutState(pagesDocument([page(blocks)]), laidOut ? engine : null);
}

function positionOf(state: EditorState, type: string): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos;
    return found < 0;
  });
  return found;
}

describe('objectBoxAt', () => {
  it('DOCE-PAGINATION-10.12 gives a figure the image box the engine laid it out at', () => {
    const state = pagesState(FIGURE);
    const room = sectionContentWidth(BASE_TEMPLATE, null);
    const box = objectBoxAt(state, positionOf(state, 'figure'));
    expect(box).toEqual({ kind: 'figure', width: room, height: room / 2, room });
  });

  it("DOCE-PAGINATION-10.12 gives a table the engine's column widths and row heights", () => {
    const state = pagesState(TABLE);
    const box = objectBoxAt(state, positionOf(state, 'table'));
    if (box?.kind !== 'table') throw new Error('no table box');
    expect(box.columns).toHaveLength(2);
    expect(box.columns[0]).toBeCloseTo(box.columns[1] ?? 0);
    expect(box.room).toBe(sectionContentWidth(BASE_TEMPLATE, null));
    expect(box.rows).toHaveLength(2);
    // A row's set height is its content's; the row takes its cells' padding and borders beyond it.
    expect(box.rows[1]).toBeCloseTo(40 + 2 * box.edge);
  });

  it('DOCE-PAGINATION-10.12 gives none where the pages are not laid out by the engine', () => {
    const state = pagesState(FIGURE, false);
    expect(objectBoxAt(state, positionOf(state, 'figure'))).toBeNull();
    expect(contentRoomAt(state, 1)).toBeNull();
  });

  it("DOCE-PAGINATION-10.12 gives the section's content width as the room for a new figure", () => {
    const state = pagesState('<p>Pump</p>');
    expect(contentRoomAt(state, positionOf(state, 'paragraph') + 1)).toBe(
      sectionContentWidth(BASE_TEMPLATE, null),
    );
  });
});

describe('objectBoxOf', () => {
  it("DOCE-PAGINATION-10.12 finds a box through the pages a view stands in for, as the projection's view does for the canonical state", () => {
    const pages = pagesState(`<p>Pump</p>${FIGURE}`);
    const canonical = pagesState(FIGURE, false);
    const view = { state: canonical } as EditorView;
    const offset = positionOf(pages, 'figure') - positionOf(canonical, 'figure');
    const unbind = bindViewPages(view, {
      state: () => pages,
      toPages: (pos) => pos + offset,
    });
    const room = sectionContentWidth(BASE_TEMPLATE, null);
    expect(objectBoxOf(view, positionOf(canonical, 'figure'))).toMatchObject({ width: room });
    expect(contentRoomOf(view, 1)).toBe(room);
    unbind();
    expect(objectBoxOf(view, positionOf(canonical, 'figure'))).toBeNull();
  });

  it("DOCE-PAGINATION-10.12 gives a cell's row height in its table, with what its cells take beyond it", () => {
    const state = pagesState(TABLE);
    const view = { state } as EditorView;
    const box = objectBoxAt(state, positionOf(state, 'table'));
    if (box?.kind !== 'table') throw new Error('no table box');
    let second = -1;
    state.doc.descendants((node, pos) => {
      if (second < 0 && node.type.name === 'table_cell' && node.textContent === 'a') second = pos;
      return second < 0;
    });
    expect(rowBoxOf(view, second)).toEqual({ height: box.rows[1], edges: 2 * box.edge });
  });
});
