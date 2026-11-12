import { history, undo } from 'prosemirror-history';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { joinDocumentPages, readDocumentFile, sameStructure } from '../model/index.js';
import { createProjectionView, type ProjectionViewOptions } from './projection-view.js';

const PARAGRAPH_HEIGHT = 400;
const TEXTS = ['Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five'];

// The test DOM lays nothing out: ranges measure as empty, and each paragraph is 400 pixels tall,
// so pages 1,000 pixels tall hold two paragraphs each.
function stubLayout() {
  Object.assign(Range.prototype, {
    getBoundingClientRect: () => new DOMRect(),
    getClientRects: (): DOMRect[] => [],
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, 0, 100, this.tagName === 'P' ? PARAGRAPH_HEIGHT : 0);
  });
}

function canonicalState(): EditorState {
  const doc = readDocumentFile(
    {
      formatVersion: 1,
      sections: [
        {
          content: TEXTS.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
        },
      ],
    },
    documentSchema,
  ).doc;
  return EditorState.create({ doc, plugins: [history()] });
}

function mount(options: Partial<ProjectionViewOptions> = {}) {
  stubLayout();
  const queue: (() => void)[] = [];
  const projection = createProjectionView({
    mount: document.body.appendChild(document.createElement('div')),
    measureIn: document.body.appendChild(document.createElement('div')),
    state: canonicalState(),
    pageHeight: 1000,
    settle: 0,
    schedule: (run) => {
      queue.push(run);
      return () => queue.splice(queue.indexOf(run), 1);
    },
    ...options,
  });
  const drain = () => {
    while (queue.length) queue.shift()?.();
  };
  return { projection, drain };
}

const pageCount = (doc: ProseMirrorNode) => doc.child(0).childCount;
const textOf = (doc: ProseMirrorNode) => doc.textContent;

// The position just before some text.
function positionOf(doc: ProseMirrorNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return found < 0;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) found = pos + index;
    return false;
  });
  if (found < 0) throw new Error(text);
  return found;
}

// Whether the projection's pages join into the canonical document.
const inSync = ({ view, state }: { view: { state: EditorState }; state: EditorState }) =>
  sameStructure(joinDocumentPages(view.state.doc).doc, state.doc);

afterEach(() => {
  document.body.replaceChildren();
});

describe('projection view', () => {
  it('DOCE-PAGINATION-7.10 shows the canonical state on pages, which join into it', () => {
    const { projection } = mount();
    expect(pageCount(projection.state.doc)).toBe(1);
    expect(pageCount(projection.view.state.doc)).toBe(3);
    expect(inSync(projection)).toBe(true);
    expect(projection.stats()).toEqual({ layouts: 1, refused: 0, relaid: 0 });
  });

  it('DOCE-PAGINATION-7.10 refuses a change to the pages that is not an edit of the canonical state', () => {
    const { projection } = mount();
    const { doc } = projection.view.state;
    const before = projection.state;
    // From the end of the first page's content to the start of the second's: the pages joined.
    const firstPage = doc.child(0).child(0);
    const contentEnd = 1 + 1 + firstPage.child(0).nodeSize + firstPage.child(1).nodeSize - 1;
    const secondContent = 1 + firstPage.nodeSize + 1 + firstPage.child(0).nodeSize + 1;
    const join = projection.view.state.tr.step(
      new ReplaceStep(contentEnd, secondContent, doc.slice(0, 0)),
    );
    projection.view.dispatch(join);
    expect(projection.view.state.doc).toBe(doc);
    expect(projection.state).toBe(before);
    expect(projection.stats().refused).toBe(1);
  });

  it('DOCE-PAGINATION-7.11 routes an edit made on the pages to the canonical state', () => {
    const sent: Transaction[] = [];
    const { projection, drain } = mount({ dispatch: (tr) => sent.push(tr) });
    const { view } = projection;
    const at = positionOf(view.state.doc, 'Gamma');
    view.dispatch(view.state.tr.insertText('New ', at));
    expect(sent).toHaveLength(1);
    expect(textOf(projection.state.doc)).toContain('New Gamma three');
    expect(textOf(view.state.doc)).toContain('New Gamma three');
    expect(inSync(projection)).toBe(true);
    drain();
    expect(projection.stats()).toMatchObject({ layouts: 2, refused: 0, relaid: 0 });
    expect(inSync(projection)).toBe(true);
  });

  it('DOCE-PAGINATION-7.11 runs keys and commands on the canonical state, with the selection mirrored', () => {
    const { projection } = mount({ keys: { 'Mod-z': undo } });
    const { view } = projection;
    const at = positionOf(view.state.doc, 'Delta') + 'Delta'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const { selection } = projection.state;
    expect(projection.state.doc.textBetween(selection.from - 5, selection.from)).toBe('Delta');
    projection.run((state, dispatch) => {
      dispatch?.(state.tr.insertText('!'));
      return true;
    });
    expect(textOf(view.state.doc)).toContain('Delta! four');
    expect(inSync(projection)).toBe(true);
    projection.run(undo);
    expect(textOf(view.state.doc)).not.toContain('!');
    expect(inSync(projection)).toBe(true);
  });

  it('DOCE-PAGINATION-7.12 mirrors a canonical state made elsewhere, by its steps or by the difference', () => {
    const { projection } = mount();
    const { state } = projection;
    const tr = state.tr.insertText('Remote ', positionOf(state.doc, 'Epsilon'));
    projection.update(state.apply(tr), tr);
    expect(textOf(projection.view.state.doc)).toContain('Remote Epsilon');
    expect(inSync(projection)).toBe(true);
    const replaced = projection.state.apply(
      projection.state.tr.delete(
        positionOf(projection.state.doc, 'Beta'),
        positionOf(projection.state.doc, 'Beta') + 4,
      ),
    );
    projection.update(replaced);
    expect(textOf(projection.view.state.doc)).not.toContain('Beta');
    expect(inSync(projection)).toBe(true);
    expect(projection.stats().relaid).toBe(0);
  });

  it('DOCE-PAGINATION-7.12 takes back the state the host made from its own transaction without mirroring it again', () => {
    const sent: Transaction[] = [];
    const { projection } = mount({ dispatch: (tr) => sent.push(tr) });
    const { view } = projection;
    view.dispatch(view.state.tr.insertText('Typed ', positionOf(view.state.doc, 'Alpha')));
    const shown = view.state.doc;
    const [tr] = sent;
    if (!tr) throw new Error('no transaction');
    projection.update(canonicalStateAfter(projection.state, tr), tr);
    expect(view.state.doc).toBe(shown);
    expect(inSync(projection)).toBe(true);
  });
});

// The host's own state after a transaction it received: the same document.
function canonicalStateAfter(state: EditorState, tr: Transaction): EditorState {
  return EditorState.create({ doc: tr.doc, selection: tr.selection, plugins: state.plugins });
}
