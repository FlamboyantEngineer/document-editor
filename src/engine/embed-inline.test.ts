import { undo, undoDepth } from 'prosemirror-history';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import type { EmbedContent, EmbedSourceAdapter } from '../host/index.js';
import { readDocumentFile, type StoredNode, writeDocumentFile } from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import { touchesEmbedSources } from './embed-sources.js';
import { createEmbedStatus, setEmbedPinned, updateEmbed } from './embed-status.js';
import { embedAt, insertEmbed, listEmbeds } from './embeds.js';
import { suggestionsKey } from './suggestions.js';

// A host kind of content, a spreadsheet's cells, and one cell's content as the host loads it.
const KIND = 'sheet-cell';
const loaded = (
  value: string,
  snapshot: string,
): EmbedContent & { kind: string; source: string } => ({
  kind: KIND,
  source: 'book-1!B2',
  snapshot,
  label: 'B2',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});

const text = (value: string): StoredNode => ({ type: 'text', text: value });

function stateWith(content: StoredNode[], plugins = createDocumentEditing(documentSchema)) {
  const file = { formatVersion: 1 as const, sections: [{ name: null, content }] };
  return EditorState.create({ doc: readDocumentFile(file, documentSchema).doc, plugins });
}

const inlineEmbed = (attrs: Record<string, unknown> = {}): StoredNode => ({
  type: 'embed_inline',
  attrs: {
    id: 'e0000009',
    kind: KIND,
    source: 'book-1!B2',
    snapshot: 'r1',
    label: 'B2',
    text: '42',
    ...attrs,
  },
});

const STORED: StoredNode[] = [
  { type: 'paragraph', content: [text('Total '), inlineEmbed(), text(' units')] },
  { type: 'paragraph', content: [text('After')] },
];

function onlyEmbed(state: EditorState) {
  const found = listEmbeds(state.doc)[0];
  if (!found) throw new Error('no embed');
  return found;
}

function adapter(answers: { resolve?: (EmbedContent | null)[]; load?: EmbedContent }) {
  const host = {
    asked: 0,
    kinds: [KIND],
    resolve: () => {
      host.asked += 1;
      return Promise.resolve({ ok: true as const, value: answers.resolve ?? [] });
    },
    load: () =>
      Promise.resolve(
        answers.load
          ? { ok: true as const, value: answers.load }
          : { ok: false as const, error: { kind: 'not-found' as const } },
      ),
  } satisfies EmbedSourceAdapter & { asked: number };
  return host;
}

// The position just after the text of the first paragraph.
function paragraphEnd(state: EditorState): number {
  let end = -1;
  state.doc.descendants((node, pos) => {
    if (end < 0 && node.type.name === 'paragraph') end = pos + node.nodeSize - 1;
    return end < 0;
  });
  return end;
}

// A document's text, its blocks run together, an inline embed's read as its text.
const textOf = (doc: EditorState['doc']) =>
  doc.textBetween(0, doc.content.size, '', (leaf) => leaf.type.spec.leafText?.(leaf) ?? '');

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing');
  return value;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const viewOf = (state: EditorState) => new EditorView(document.createElement('div'), { state });

describe('inline embeds', () => {
  it('DOCE-EMBEDS-1.4 inserts one cell inline as its text, stored with its source and state', () => {
    let state = stateWith([{ type: 'paragraph', content: [text('Total ')] }]);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, paragraphEnd(state))),
    );
    expect(
      insertEmbed(loaded('42', 'r1'), { inline: true })(state, (tr) => (state = state.apply(tr))),
    ).toBe(true);
    const { node } = onlyEmbed(state);
    expect(node.type.name).toBe('embed_inline');
    expect(node.attrs).toMatchObject({ kind: KIND, snapshot: 'r1', text: '42', pinned: false });
    expect(state.selection.from).toBe(onlyEmbed(state).pos + 1);
    const selected = state.apply(
      state.tr.setSelection(NodeSelection.create(state.doc, onlyEmbed(state).pos)),
    );
    expect(embedAt(selected)?.node).toBe(node);
    expect(textOf(state.doc)).toBe('Total 42');
    const stored = writeDocumentFile(state.doc);
    expect(stored.sections[0]?.content[0]?.content?.[1]).toMatchObject({
      type: 'embed_inline',
      attrs: { kind: KIND, source: 'book-1!B2', snapshot: 'r1', label: 'B2', text: '42' },
    });
    expect(readDocumentFile(stored, documentSchema).doc.eq(state.doc)).toBe(true);
  });

  it('DOCE-EMBEDS-1.4 draws an inline embed as a span with its text and source', () => {
    const view = viewOf(stateWith(STORED));
    const span = view.dom.querySelector('.de-embed-inline');
    expect(span).toHaveTextContent('42');
    expect(span).toHaveAttribute('data-embed-kind', KIND);
    expect(span).toHaveAttribute('data-embed-source', 'book-1!B2');
    expect(span).toHaveAttribute('data-embed-snapshot', 'r1');
    view.destroy();
  });

  it('DOCE-EMBEDS-2.1 refuses the writer’s change to what an inline embed shows, and lets it go', () => {
    const state = stateWith(STORED);
    const { pos, node } = onlyEmbed(state);
    const changed = state.applyTransaction(state.tr.setNodeAttribute(pos, 'text', '99'));
    expect(changed.transactions).toHaveLength(0);
    const deleted = state.applyTransaction(state.tr.delete(pos, pos + node.nodeSize));
    expect(listEmbeds(deleted.state.doc)).toHaveLength(0);
  });

  it('DOCE-EMBEDS-3.1 marks an inline embed whose content changed', async () => {
    const host = adapter({ resolve: [loaded('43', 'r2')] });
    const plugins = [
      ...createDocumentEditing(documentSchema),
      createEmbedStatus({ source: host, delay: 0 }),
    ];
    const view = viewOf(stateWith(STORED, plugins));
    await settle();
    expect(view.dom.querySelector('.de-embed-inline')).toHaveAttribute(
      'data-embed-status',
      'update',
    );
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 takes an update into an inline embed as its text, undoable', async () => {
    const host = adapter({ load: loaded('43', 'r2') });
    const view = viewOf(stateWith(STORED));
    const { pos } = onlyEmbed(view.state);
    expect(await updateEmbed(view, host, { pos })).toBe(true);
    expect(onlyEmbed(view.state).node.attrs).toMatchObject({ text: '43', snapshot: 'r2' });
    expect(textOf(view.state.doc)).toBe('Total 43 unitsAfter');
    undo(view.state, view.dispatch);
    expect(onlyEmbed(view.state).node.attrs).toMatchObject({ text: '42', snapshot: 'r1' });
    view.destroy();
  });
});

describe('pinned embeds', () => {
  it('DOCE-EMBEDS-3.4 pins an embed to the state it shows and lets it follow again, undoable', () => {
    let state = stateWith(STORED);
    const { pos } = onlyEmbed(state);
    let suggested: unknown = null;
    expect(
      setEmbedPinned(pos, true)(state, (tr) => {
        suggested = tr.getMeta(suggestionsKey);
        state = state.apply(tr);
      }),
    ).toBe(true);
    expect(suggested).toBe('embed');
    expect(onlyEmbed(state).node.attrs.pinned).toBe(true);
    expect(writeDocumentFile(state.doc).sections[0]?.content[0]?.content?.[1]?.attrs).toMatchObject(
      {
        pinned: true,
      },
    );
    expect(setEmbedPinned(pos, true)(state)).toBe(false);
    undo(state, (tr) => (state = state.apply(tr)));
    expect(onlyEmbed(state).node.attrs.pinned).toBe(false);
  });

  it('DOCE-EMBEDS-3.4 repins an embed at the state it takes, or lets it follow its content', async () => {
    const host = adapter({ load: loaded('43', 'r2') });
    const view = viewOf(
      stateWith([{ type: 'paragraph', content: [inlineEmbed({ pinned: true })] }]),
    );
    const { pos } = onlyEmbed(view.state);
    expect(await updateEmbed(view, host, { pos })).toBe(true);
    expect(onlyEmbed(view.state).node.attrs).toMatchObject({ snapshot: 'r2', pinned: true });
    undo(view.state, view.dispatch);
    expect(await updateEmbed(view, host, { pos, pinned: false })).toBe(true);
    expect(onlyEmbed(view.state).node.attrs).toMatchObject({ snapshot: 'r2', pinned: false });
    view.destroy();
  });
});

describe('embed status cost', () => {
  it('DOCE-EMBEDS-3.1 marks embeds without changing the document or adding an undo step', async () => {
    const host = adapter({ resolve: [loaded('43', 'r2')] });
    const plugins = [
      ...createDocumentEditing(documentSchema),
      createEmbedStatus({ source: host, delay: 0 }),
    ];
    const view = viewOf(stateWith(STORED, plugins));
    const before = view.state.doc;
    await settle();
    expect(host.asked).toBe(1);
    expect(view.dom.querySelector('[data-embed-status]')).not.toBeNull();
    expect(view.state.doc).toBe(before);
    expect(undoDepth(view.state)).toBe(0);
    view.destroy();
  });

  it('DOCE-EMBEDS-3.1 asks nothing after a change away from embeds, and asks after one adds an embed', async () => {
    const host = adapter({ resolve: [loaded('43', 'r2')] });
    const plugins = [
      ...createDocumentEditing(documentSchema),
      createEmbedStatus({ source: host, delay: 0 }),
    ];
    const view = viewOf(stateWith(STORED, plugins));
    await settle();
    expect(host.asked).toBe(1);
    // A paragraph split and joined away from the embed: no embed's source can change.
    let after = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'After') after = pos + 2;
    });
    const split = view.state.tr.split(after);
    expect(touchesEmbedSources(split)).toBe(false);
    view.dispatch(split);
    await settle();
    expect(host.asked).toBe(1);
    expect(view.dom.querySelector('[data-embed-status]')).not.toBeNull();
    // A second embed of another source is asked about.
    const added = view.state.tr.insert(
      paragraphEnd(view.state),
      defined(view.state.schema.nodes.embed_inline).create({
        kind: KIND,
        source: 'book-1!C3',
        text: '7',
      }),
    );
    expect(touchesEmbedSources(added)).toBe(true);
    view.dispatch(added);
    await settle();
    expect(host.asked).toBe(2);
    view.destroy();
  });
});
