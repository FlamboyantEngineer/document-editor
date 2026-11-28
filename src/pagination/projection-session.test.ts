import * as Y from '@y/y';
import type { Node } from 'prosemirror-model';
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import {
  canonicalState,
  edit,
  mount,
  positionOf,
  stubLayout,
  textOf,
} from '../../test/projection-fixtures.js';
import { readContent } from '../collab/delta.js';
import { resolveRoomScope } from '../collab/room-scope.js';
import { createCollabSync } from '../collab/sync.js';
import { suggestTransaction } from '../engine/suggestions.js';
import { BASE_TEMPLATE } from '../model/index.js';
import { createPagedProjection } from './projection.js';

// Counts the times a focused view of the pages scrolls to its selection.
function countScrolls(view: EditorView): () => number {
  let scrolls = 0;
  view.focus();
  view.setProps({
    handleScrollToSelection() {
      scrolls += 1;
      return true;
    },
  });
  return () => scrolls;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('scrolling to the selection on the pages', () => {
  it('DOCE-PAGINATION-7.12 shows a change no transaction asked to scroll for where the pages stand', () => {
    const { projection } = mount();
    const scrolls = countScrolls(projection.view);
    const far = (text: string) => positionOf(projection.state.doc, text);
    // As a collaborator's change comes: a canonical transaction that asks for nothing.
    projection.dispatch(projection.state.tr.insertText('x', far('Epsilon')));
    edit(projection, (state) => state.tr.insertText('y', far('Epsilon')));
    // As the host replaces the state.
    projection.update(projection.state.apply(projection.state.tr.insertText('z', far('Epsilon'))));
    expect(textOf(projection.projection.doc)).toContain('xyzEpsilon');
    expect(scrolls()).toBe(0);
  });

  it('DOCE-PAGINATION-7.12 scrolls to the selection for a canonical transaction that asks to', () => {
    const { projection } = mount();
    const scrolls = countScrolls(projection.view);
    const { doc } = projection.state;
    const caret = TextSelection.create(doc, positionOf(doc, 'Epsilon'));
    // A selection alone, as going to a place in the document makes.
    projection.dispatch(projection.state.tr.setSelection(caret).scrollIntoView());
    expect(scrolls()).toBe(1);
    projection.dispatch(projection.state.tr.insertText('x').scrollIntoView());
    expect(scrolls()).toBe(2);
    edit(projection, (state) => state.tr.insertText('y').scrollIntoView());
    expect(scrolls()).toBe(3);
  });
});

describe('starting the projection', () => {
  it('DOCE-PAGINATION-12.5 lays nothing out before the layout engine has loaded with the served fonts', () => {
    stubLayout({});
    const projection = createPagedProjection({
      element: document.body.appendChild(document.createElement('div')),
      state: canonicalState(),
      pageHeight: 1000,
      settle: 0,
      schedule: () => () => undefined,
      dispatch: () => undefined,
      onProjection: () => undefined,
      textLayout: { template: () => BASE_TEMPLATE, fonts: new Promise<never>(() => undefined) },
    });
    expect(projection.stats().layouts).toBe(0);
    expect(projection.layoutState()).toBe('pending');
    projection.destroy();
  });

  it('DOCE-PAGINATION-7.10 dispatches nothing as it starts, and keeps the canonical selection', () => {
    stubLayout({});
    const start = canonicalState();
    const at = positionOf(start.doc, 'Delta');
    const state = start.apply(start.tr.setSelection(TextSelection.create(start.doc, at)));
    const dispatched: Transaction[] = [];
    const projection = createPagedProjection({
      element: document.body.appendChild(document.createElement('div')),
      state,
      pageHeight: 1000,
      settle: 0,
      schedule: () => () => undefined,
      dispatch: (tr) => {
        dispatched.push(tr);
      },
      onProjection: () => undefined,
    });
    expect(dispatched).toHaveLength(0);
    expect(projection.state.selection.head).toBe(at);
    const { map } = projection;
    expect(map.toCanonical(projection.projection.selection.head)).toBe(at);
    projection.destroy();
  });
});

describe('a change the host rewrites', () => {
  // A room the pages' canonical state is bound to, and each update it receives, read back.
  async function suggestingInRoom() {
    const doc = new Y.Doc();
    const sent: (Node | null)[] = [];
    const mirror = new Y.Doc();
    doc.on('update', (update: Uint8Array) => {
      Y.applyUpdate(mirror, update);
      sent.push(readContent(documentSchema, resolveRoomScope(mirror).content));
    });
    const sync = createCollabSync({ doc });
    const taken: EditorState[] = [];
    // As the editor's dispatch body while suggesting: the change rewritten as a suggestion of its
    // reader's, applied to the state the pages applied the change to.
    const { projection, drain } = mount({
      state: canonicalState([sync]),
      dispatch: (tr, made) => {
        const suggested = suggestTransaction(tr, made.from, { author: 'grace' });
        if (!suggested || suggested === tr) return undefined;
        const result = made.from.applyTransaction(suggested);
        taken.push(result.state);
        return result;
      },
    });
    // The room takes the element ids the canonical state's seed gave it on the next microtask.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    drain();
    return { projection, drain, sent, taken };
  }

  const insertedBy = (doc: Node | null | undefined, text: string) => {
    let author: unknown;
    doc?.descendants((node) => {
      if (node.isText && node.text === text)
        author = node.marks.find((mark) => mark.type.name === 'insertion')?.attrs.dataAuthor;
      return author === undefined;
    });
    return author;
  };

  it('DOCE-PAGINATION-7.26 sends a suggester’s typed text to the room as one change with its mark and author', async () => {
    const { projection, drain, sent, taken } = await suggestingInRoom();
    const before = sent.length;
    const { view } = projection;
    view.dispatch(view.state.tr.insertText('x', positionOf(view.state.doc, 'Gamma')));
    drain();
    expect(textOf(projection.state.doc)).toContain('xGamma');
    expect(projection.state).toBe(taken.at(-1));
    const updates = sent.slice(before);
    expect(updates).toHaveLength(1);
    expect(insertedBy(updates[0], 'x')).toBe('grace');
    projection.destroy();
  });

  it('DOCE-PAGINATION-7.26 sends a suggester’s deletion as one change that keeps the text, marked deleted', async () => {
    const { projection, drain, sent } = await suggestingInRoom();
    const before = sent.length;
    const { view } = projection;
    const at = positionOf(view.state.doc, 'three');
    view.dispatch(view.state.tr.delete(at, at + 'three'.length));
    drain();
    const updates = sent.slice(before);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.textContent).toContain('three');
    let deleted = false;
    updates[0]?.descendants((node) => {
      if (node.isText && node.text === 'three')
        deleted = node.marks.some(
          (mark) => mark.type.name === 'deletion' && mark.attrs.dataAuthor === 'grace',
        );
      return !deleted;
    });
    expect(deleted).toBe(true);
    projection.destroy();
  });
});
