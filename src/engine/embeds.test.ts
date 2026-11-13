import { undo } from 'prosemirror-history';
import type { Node } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { documentSchema, writeMarkup } from '../../test/document-markup.js';
import type { EmbedContent, EmbedSourceAdapter } from '../host/index.js';
import {
  LAYOUT_RULES,
  type LayoutBlock,
  layoutPages,
  readDocumentFile,
  type StoredContent,
  type StoredNode,
  writeDocumentFile,
} from '../model/index.js';
import { createDocumentEditing } from './document-editing.js';
import {
  applyEmbedUpdate,
  createEmbedStatus,
  embedStatusAt,
  pasteEmbedsOfKinds,
  refreshEmbedStatus,
  updateEmbed,
} from './embed-status.js';
import { insertEmbed, listEmbeds, touchesEmbed, unwrapPastedEmbeds } from './embeds.js';
import { markRemote } from './transaction-kind.js';

// A host kind of content, a data set, shown as a table of its rows.
const KIND = 'data-set';
const text = (value: string): StoredNode => ({ type: 'text', text: value });
const cell = (value: string): StoredNode => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [text(value)] }],
});
const rows = (...values: string[]): StoredContent => [
  {
    type: 'table',
    content: values.map((value) => ({ type: 'tableRow', content: [cell(value)] })),
  },
];

const embedded = (
  snapshot: string,
  content: StoredContent,
  attrs: Record<string, unknown> = {},
): StoredNode => ({
  type: 'embed',
  attrs: { id: 'e0000001', kind: KIND, source: 'set-7', snapshot, label: 'Set 7', ...attrs },
  content,
});

function stateWith(content: StoredNode[], plugins = createDocumentEditing(documentSchema)) {
  const file = { formatVersion: 1 as const, sections: [{ name: null, content }] };
  const doc = readDocumentFile(file, documentSchema).doc;
  return EditorState.create({ doc, plugins });
}

const STORED: StoredNode[] = [
  { type: 'paragraph', content: [text('Before')] },
  embedded('r1', rows('Pump', 'Valve')),
  { type: 'paragraph', content: [text('After')] },
];

// A node's text, its blocks run together.
const textOf = (node: Node) => node.textBetween(0, node.content.size);

function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing');
  return value;
}

const embedOf = (state: EditorState) => {
  const found = listEmbeds(state.doc)[0];
  if (!found) throw new Error('no embed');
  return found;
};

// The position of the first character of a text in the document.
function textPos(doc: Node, value: string): number {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(value)) at = pos + node.text.indexOf(value);
    return at < 0;
  });
  return at;
}

// A host's embeds adapter (DOCE-HOST-1.13): the kinds it embeds, resolving and loading content.
function source(answers: {
  resolve?: (EmbedContent | null | 'no-access')[];
  load?: EmbedContent;
}): EmbedSourceAdapter & { asked: number } {
  const adapter = {
    asked: 0,
    kinds: [KIND],
    resolve: () => {
      adapter.asked += 1;
      return Promise.resolve({ ok: true as const, value: answers.resolve ?? [] });
    },
    load: () =>
      Promise.resolve(
        answers.load
          ? { ok: true as const, value: answers.load }
          : { ok: false as const, error: { kind: 'not-found' as const } },
      ),
  };
  return adapter;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function viewOf(state: EditorState) {
  return new EditorView(document.createElement('div'), { state });
}

describe('embed nodes', () => {
  it('DOCE-EMBEDS-1.1 stores an embed with its kind, source, snapshot and label', () => {
    const state = stateWith(STORED);
    expect(writeDocumentFile(state.doc).sections[0]?.content).toEqual(STORED);
    const markup = writeMarkup(state.doc);
    expect(markup).toContain('class="de-embed"');
    expect(markup).toContain('data-embed-kind="data-set"');
    expect(markup).toContain('data-embed-snapshot="r1"');
    const node = embedOf(state).node;
    expect(node.attrs).toMatchObject({ kind: KIND, source: 'set-7', label: 'Set 7' });
    expect(textOf(node)).toBe('PumpValve');
  });

  it('DOCE-EMBEDS-1.2 inserts an embed of loaded content where a new block goes, selected', () => {
    const state = stateWith([{ type: 'paragraph', content: [text('Intro')] }]);
    const at = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
    const loaded = { kind: KIND, source: 'set-9', snapshot: 's1', label: 'Set 9' };
    let next = at;
    expect(
      insertEmbed({ ...loaded, content: rows('One') })(at, (tr) => (next = at.apply(tr))),
    ).toBe(true);
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect(embedOf(next).node.attrs).toMatchObject(loaded);
    expect(textOf(embedOf(next).node)).toBe('One');
  });
});

describe('embed lock', () => {
  it('DOCE-EMBEDS-2.1 refuses the writer’s changes to what an embedded table holds', () => {
    const state = stateWith(STORED);
    const inCell = textPos(state.doc, 'Pump');
    const typed = state.tr.insertText('x', inCell);
    expect(touchesEmbed(typed)).toBe(true);
    expect(state.apply(typed).doc.eq(state.doc)).toBe(true);
    const bold = state.tr.addMark(
      inCell,
      inCell + 4,
      defined(documentSchema.marks.strong).create(),
    );
    expect(state.apply(bold).doc.eq(state.doc)).toBe(true);
    const { pos, node } = embedOf(state);
    const relabel = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: 'Other' });
    expect(state.apply(relabel).doc.eq(state.doc)).toBe(true);
    // A row added to the embedded table.
    const table = defined(state.doc.nodeAt(pos + 1));
    const row = table.child(0);
    const added = state.tr.insert(pos + 1 + table.nodeSize - 1, row.copy(row.content));
    expect(state.apply(added).doc.eq(state.doc)).toBe(true);
    // Deleting from the paragraph before into the embed.
    const cut = state.tr.delete(textPos(state.doc, 'Before') + 2, inCell + 2);
    expect(state.apply(cut).doc.eq(state.doc)).toBe(true);
  });

  it('DOCE-EMBEDS-2.1 refuses a mark taken off across a whole embed, which would change what it holds', () => {
    const bold = (value: string): StoredNode => ({ ...text(value), marks: [{ type: 'strong' }] });
    const state = stateWith([
      { type: 'paragraph', content: [bold('Before')] },
      embedded('r1', [{ type: 'paragraph', content: [bold('Total 42')] }]),
      { type: 'paragraph', content: [bold('After')] },
    ]);
    const strong = defined(documentSchema.marks.strong);
    // One step from the text before the embed to the text after it: neither end is inside it.
    const across = state.tr.removeMark(0, state.doc.content.size, strong);
    expect(across.steps).toHaveLength(1);
    expect(touchesEmbed(across)).toBe(true);
    expect(state.apply(across).doc.eq(state.doc)).toBe(true);
    // Taken off the text before it alone, the mark goes.
    const before = textPos(state.doc, 'Before');
    const beside = state.tr.removeMark(before, before + 'Before'.length, strong);
    expect(touchesEmbed(beside)).toBe(false);
    expect(state.apply(beside).doc.eq(state.doc)).toBe(false);
    // A comment across the embed changes nothing it holds.
    const comment = defined(documentSchema.marks.comment_highlight).create({ commentId: 't1' });
    expect(touchesEmbed(state.tr.addMark(0, state.doc.content.size, comment))).toBe(false);
  });

  it('DOCE-EMBEDS-2.1 lets the writer comment on, move and delete a whole embed', () => {
    const state = stateWith(STORED);
    const inCell = textPos(state.doc, 'Pump');
    const comment = defined(documentSchema.marks.comment_highlight).create({ commentId: 't1' });
    const commented = state.apply(state.tr.addMark(inCell, inCell + 4, comment));
    expect(commented.doc.eq(state.doc)).toBe(false);
    const { pos, node } = embedOf(state);
    const deleted = state.apply(state.tr.delete(pos, pos + node.nodeSize));
    expect(listEmbeds(deleted.doc)).toHaveLength(0);
    // Deleting across it, from the text before into the text after.
    const across = state.tr.delete(
      textPos(state.doc, 'Before') + 2,
      textPos(state.doc, 'After') + 2,
    );
    expect(listEmbeds(state.apply(across).doc)).toHaveLength(0);
    const undone = deleted;
    let restored = undone;
    undo(undone, (tr) => (restored = undone.apply(tr)));
    expect(listEmbeds(restored.doc)).toHaveLength(1);
    // A remote change passes.
    const remote = state.apply(markRemote(state.tr.insertText('x', inCell)));
    expect(textOf(embedOf(remote).node)).toBe('xPumpValve');
  });

  it('DOCE-EMBEDS-2.2 pastes a copy of part of an embed as the content it holds', () => {
    const state = stateWith(STORED);
    const part = state.doc.slice(textPos(state.doc, 'Before') + 2, textPos(state.doc, 'Valve') + 2);
    const pasted = unwrapPastedEmbeds(part);
    let embeds = 0;
    pasted.content.descendants((node) => {
      if (node.type.name === 'embed') embeds += 1;
    });
    expect(embeds).toBe(0);
    expect(pasted.content.textBetween(0, pasted.content.size)).toContain('Pump');
    // The slice still fits: pasting it makes a valid document.
    const end = state.doc.content.size - 1;
    const tr = state.tr.replace(end, end, pasted);
    expect(() => tr.doc.check()).not.toThrow();
    // A whole embed is kept.
    const { pos, node } = embedOf(state);
    const whole = state.doc.slice(pos, pos + node.nodeSize);
    expect(unwrapPastedEmbeds(whole).eq(whole)).toBe(true);
  });

  it('DOCE-EMBEDS-2.2 pastes an embed of a kind the host does not embed as its content', () => {
    const plugins = createDocumentEditing(documentSchema, {
      pasteFilters: [pasteEmbedsOfKinds([KIND])],
    });
    const state = stateWith(
      [embedded('r1', rows('Pump'), { kind: 'other-kind' }), embedded('r1', rows('Kept'))],
      plugins,
    );
    const view = viewOf(state);
    const slice = state.doc.slice(
      embedOf(state).pos,
      defined(listEmbeds(state.doc)[1]).pos + defined(listEmbeds(state.doc)[1]).node.nodeSize,
    );
    let transformed = slice;
    view.someProp('transformPasted', (transform) => {
      transformed = transform(transformed, view, false);
    });
    const kinds: string[] = [];
    transformed.content.descendants((node) => {
      if (node.type.name === 'embed') kinds.push(String(node.attrs.kind));
    });
    expect(kinds).toEqual([KIND]);
    expect(transformed.content.textBetween(0, transformed.content.size)).toContain('Pump');
    view.destroy();
  });
});

describe('embed status and updates', () => {
  it('DOCE-EMBEDS-3.1 marks embeds whose content changed, is gone or is out of reach', async () => {
    const answers = [{ snapshot: 'r2', label: 'Set 7', content: [] }, null, 'no-access' as const];
    const adapter = source({ resolve: answers });
    const plugins = [
      ...createDocumentEditing(documentSchema),
      createEmbedStatus({ source: adapter, delay: 0 }),
    ];
    const view = viewOf(
      stateWith(
        [
          embedded('r1', rows('One')),
          embedded('r1', rows('Two'), { id: 'e2', source: 'gone' }),
          embedded('r1', rows('Three'), { id: 'e3', source: 'secret' }),
        ],
        plugins,
      ),
    );
    await settle();
    const statuses = [...view.dom.querySelectorAll('.de-embed')].map((element) =>
      element.getAttribute('data-embed-status'),
    );
    expect(statuses).toEqual(['update', 'unavailable', 'no-access']);
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, embedOf(view.state).pos)),
    );
    expect(embedStatusAt(view.state)).toBe('update');
    expect(adapter.asked).toBe(1);
    expect(refreshEmbedStatus(view.state, view.dispatch)).toBe(true);
    await settle();
    expect(adapter.asked).toBe(2);
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 takes an update: the content as it is now, with stable ids, undoable', async () => {
    const now: EmbedContent = {
      snapshot: 'r2',
      label: 'Set 7 (B)',
      content: rows('Pump', 'Valve', 'Tank'),
    };
    const adapter = source({ resolve: [now], load: now });
    const plugins = [
      ...createDocumentEditing(documentSchema),
      createEmbedStatus({ source: adapter, delay: 0 }),
    ];
    const view = viewOf(stateWith(STORED, plugins));
    await settle();
    expect(await updateEmbed(view, adapter, { pos: embedOf(view.state).pos })).toBe(true);
    const updated = embedOf(view.state).node;
    expect(textOf(updated)).toBe('PumpValveTank');
    expect(updated.attrs).toMatchObject({ snapshot: 'r2', label: 'Set 7 (B)' });
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, embedOf(view.state).pos)),
    );
    expect(embedStatusAt(view.state)).toBe('current');
    const ids: unknown[] = [];
    updated.descendants((node) => {
      ids.push(node.attrs.dataId);
    });
    // The same update again changes nothing, and its elements keep their ids.
    expect(applyEmbedUpdate(embedOf(view.state).pos, now)(view.state)).toBe(false);
    const again = applyEmbedUpdate(embedOf(view.state).pos, { ...now, snapshot: 'r3' });
    expect(again(view.state, view.dispatch)).toBe(true);
    const kept: unknown[] = [];
    embedOf(view.state).node.descendants((node) => {
      kept.push(node.attrs.dataId);
    });
    expect(kept).toEqual(ids);
    undo(view.state, view.dispatch);
    undo(view.state, view.dispatch);
    expect(textOf(embedOf(view.state).node)).toBe('PumpValve');
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 leaves an embed alone when the host fails to load it', async () => {
    const adapter = source({});
    const view = viewOf(stateWith(STORED));
    expect(await updateEmbed(view, adapter, { pos: embedOf(view.state).pos })).toBe(false);
    expect(embedOf(view.state).node.attrs.snapshot).toBe('r1');
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 takes an update where the embed is once the host loaded, the document changed around it', async () => {
    const now: EmbedContent = { snapshot: 'r2', label: 'Set 7', content: rows('Pump', 'Tank') };
    const view = viewOf(stateWith(STORED));
    const pending = updateEmbed(view, source({ load: now }), { pos: embedOf(view.state).pos });
    // A collaborator types above the embed while the host loads.
    const typed = view.state.tr.insertText('Well ', textPos(view.state.doc, 'Before'));
    view.dispatch(markRemote(typed));
    expect(await pending).toBe(true);
    expect(textOf(view.state.doc)).toBe('Well BeforePumpTankAfter');
    expect(embedOf(view.state).node.attrs.snapshot).toBe('r2');
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 leaves alone an embed that changed, or went, while the host loaded', async () => {
    const now: EmbedContent = { snapshot: 'r2', label: 'Set 7', content: rows('Pump', 'Tank') };
    const view = viewOf(stateWith(STORED));
    const { pos, node } = embedOf(view.state);
    let pending = updateEmbed(view, source({ load: now }), { pos });
    view.dispatch(markRemote(view.state.tr.setNodeAttribute(pos, 'label', 'Set 7 (C)')));
    expect(await pending).toBe(false);
    expect(embedOf(view.state).node.attrs).toMatchObject({ snapshot: 'r1', label: 'Set 7 (C)' });
    pending = updateEmbed(view, source({ load: now }), { pos });
    view.dispatch(markRemote(view.state.tr.delete(pos, pos + node.nodeSize)));
    expect(await pending).toBe(false);
    expect(textOf(view.state.doc)).toBe('BeforeAfter');
    view.destroy();
  });

  it('DOCE-EMBEDS-3.2 refuses content of the host that the document cannot read', async () => {
    const unreadable: EmbedContent = {
      snapshot: 'r2',
      label: 'Set 7',
      content: [{ type: 'gauge', content: [text('Pump')] }],
    };
    const view = viewOf(stateWith(STORED));
    const { pos } = embedOf(view.state);
    expect(applyEmbedUpdate(pos, unreadable)(view.state, view.dispatch)).toBe(false);
    expect(await updateEmbed(view, source({ load: unreadable }), { pos })).toBe(false);
    expect(embedOf(view.state).node.attrs.snapshot).toBe('r1');
    view.destroy();
  });
});

describe('embed pagination', () => {
  it('DOCE-EMBEDS-4.1 lays an embed out whole, on the next page when it does not fit', () => {
    const state = stateWith(STORED);
    const blocks: LayoutBlock[] = [];
    const content = embedOf(state).node;
    const paragraph = defined(state.doc.nodeAt(textPos(state.doc, 'Before') - 1));
    blocks.push({ node: paragraph, height: 60, marginTop: 0, marginBottom: 0 });
    blocks.push({ node: content, height: 80, marginTop: 0, marginBottom: 0 });
    const pages = layoutPages(blocks, { pageHeight: 100, rules: LAYOUT_RULES });
    expect(pages.map((page) => page.map((block) => block.node.type.name))).toEqual([
      ['paragraph'],
      ['embed'],
    ]);
    expect(pages[1]?.[0]?.height).toBe(80);
  });
});
