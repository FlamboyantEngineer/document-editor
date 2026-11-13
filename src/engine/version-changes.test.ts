import { EditorState, type Plugin } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import { describe, expect, it, vi } from 'vitest';
import { documentSchema } from '../../test/document-markup.js';
import { readDocumentFile, type StoredNode } from '../model/index.js';
import { markDerived, markRemote, markSystemChange } from './transaction-kind.js';
import {
  createVersionChanges,
  refreshVersionChanges,
  versionChangeCounts,
  versionChanges,
} from './version-changes.js';
import * as compare from './version-compare.js';

vi.mock('./version-compare.js', { spy: true });

const node = (type: string, id: string, value: string, attrs: object = {}): StoredNode => ({
  type,
  attrs: { id, ...attrs },
  content: [{ type: 'text', text: value }],
});
const read = (...content: StoredNode[]) =>
  readDocumentFile({ formatVersion: 1, sections: [{ name: null, content }] }, documentSchema).doc;

const older = read(
  node('heading', 'h0000001', 'Scope', { level: 1 }),
  node('paragraph', 'a0000001', 'Alpha'),
  node('heading', 'h0000002', 'Detail', { level: 1 }),
  node('paragraph', 'a0000002', 'Beta'),
);
const newer = read(
  node('heading', 'h0000001', 'Scope', { level: 1 }),
  node('paragraph', 'a0000001', 'Alpha one'),
  node('heading', 'h0000002', 'Detail', { level: 1 }),
  node('paragraph', 'a0000002', 'Beta two'),
  node('paragraph', 'a0000003', 'Gamma'),
);

// The position just inside the block holding a text.
function inside(state: EditorState, text: string): number {
  let found = -1;
  state.doc.descendants((each, pos) => {
    if (found < 0 && each.isTextblock && each.textContent.startsWith(text)) found = pos + 1;
    return found < 0;
  });
  return found;
}

const stateWith = (plugin: Plugin, doc = newer) => EditorState.create({ doc, plugins: [plugin] });

describe('following the document', () => {
  it('DOCE-VERSIONS-2.5 compares with the document as opened, and not while it is unchanged', () => {
    const spy = vi.mocked(compare.compareWithOlder);
    spy.mockClear();
    let state = stateWith(createVersionChanges({ previous: () => 'opened' }));
    expect(versionChanges(state)).toEqual([]);
    state = state.apply(refreshVersionChanges(state.tr));
    expect(spy).not.toHaveBeenCalled();
    state = state.apply(state.tr.insertText('!', inside(state, 'Gamma')));
    expect(versionChanges(state).map((change) => [change.kind, change.text])).toEqual([
      ['modification', '!Gamma'],
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('DOCE-VERSIONS-2.5 does not compare again on a change that only follows the layout', () => {
    const spy = vi.mocked(compare.compareWithOlder);
    let state = stateWith(
      createVersionChanges({ previous: () => older, scope: () => ['h0000002'] }),
    );
    spy.mockClear();
    const before = versionChanges(state);
    // Out of the history, derived, and typing outside the scope: mapped, not compared.
    state = state.apply(
      state.tr.insertText('x', inside(state, 'Alpha')).setMeta('addToHistory', false),
    );
    state = state.apply(markDerived(state.tr.insertText('y', inside(state, 'xAlpha'))));
    state = state.apply(state.tr.insertText('z', inside(state, 'yxAlpha')));
    expect(spy).not.toHaveBeenCalled();
    expect(versionChanges(state).map((change) => change.parts[0]?.from)).toEqual(
      before.map((change) => (change.parts[0]?.from ?? 0) + 3),
    );
    // A remote change and a system change compare the versions again, even when they only type.
    state = state.apply(markRemote(state.tr.insertText('!', inside(state, 'Gamma'))));
    state.apply(markSystemChange(state.tr.insertText('!', inside(state, 'Beta'))));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// What a state shows: its changes, and its decorations by where they are and what they mark.
function shownBy(state: EditorState) {
  const plugin = state.plugins[0];
  const set = plugin?.props.decorations?.call(plugin, state);
  const decorations = set instanceof DecorationSet ? set.find() : [];
  const marks = decorations.map((decoration) => {
    const { type, spec } = decoration as unknown as {
      type: { attrs?: Record<string, string> };
      spec: { key?: string };
    };
    return `${String(decoration.from)}-${String(decoration.to)} ${JSON.stringify(type.attrs ?? spec.key)}`;
  });
  return { changes: versionChanges(state), decorations: marks.sort() };
}

// The older version with a block the newer lacks before "Beta", and its last block first in the
// newer, so typing happens beside a deleted block and in a moved one.
const longer = read(
  node('heading', 'h0000001', 'Scope', { level: 1 }),
  node('paragraph', 'a0000001', 'Alpha'),
  node('heading', 'h0000002', 'Detail', { level: 1 }),
  node('paragraph', 'a0000009', 'Omitted'),
  node('paragraph', 'a0000002', 'Beta'),
  node('paragraph', 'a0000004', 'Delta'),
);
const reordered = read(
  node('paragraph', 'a0000004', 'Delta'),
  node('heading', 'h0000001', 'Scope', { level: 1 }),
  node('paragraph', 'a0000001', 'Alpha one'),
  node('heading', 'h0000002', 'Detail', { level: 1 }),
  node('paragraph', 'a0000002', 'Beta two'),
  node('paragraph', 'a0000003', 'Gamma'),
);

// Types a text at the start of each block named by its text, one transaction a block.
const typeIn = (state: EditorState, blocks: readonly string[]) =>
  blocks.reduce(
    (current, text) => current.apply(current.tr.insertText('New ', inside(current, text))),
    state,
  );

describe('typing while changes show', () => {
  it('DOCE-VERSIONS-2.5 compares only the blocks typed in, and reads the older version once', () => {
    const whole = vi.mocked(compare.compareWithOlder);
    const reads = vi.mocked(compare.readOlderVersion);
    whole.mockClear();
    reads.mockClear();
    let state = stateWith(createVersionChanges({ previous: () => older }));
    // In a block whose text changed, one that did not change, and one the newer version added.
    state = typeIn(state, ['Beta two', 'Scope', 'Gamma']);
    expect(versionChanges(state).map((change) => [change.kind, change.text])).toEqual([
      ['modification', 'New Scope'],
      ['modification', 'Alpha one'],
      ['modification', 'New Beta two'],
      ['insertion', 'New Gamma'],
    ]);
    expect(whole).toHaveBeenCalledTimes(1);
    // A change that is not only typed text compares the versions, the older one as it was read.
    state.apply(state.tr.split(inside(state, 'Alpha one') + 5));
    expect(whole).toHaveBeenCalledTimes(2);
    expect(reads).toHaveBeenCalledTimes(1);
    // Another older version, or its suggestions counted otherwise, is read.
    const asked = { previous: longer };
    state = stateWith(createVersionChanges({ previous: () => asked.previous }));
    asked.previous = older;
    state.apply(refreshVersionChanges(state.tr));
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it.each(['markup', 'bars'] as const)(
    'DOCE-VERSIONS-2.5 shows after typing what comparing the versions shows, in %s',
    (display) => {
      const plugin = () => createVersionChanges({ previous: () => longer, display: () => display });
      let state = stateWith(plugin(), reordered);
      // Beside a deleted block, in a moved block, an added one and an unchanged one, then back.
      state = typeIn(state, ['Beta two', 'Delta', 'Gamma', 'Detail']);
      expect(shownBy(state)).toEqual(shownBy(stateWith(plugin(), state.doc)));
      const at = inside(state, 'New Detail');
      state = state.apply(state.tr.delete(at, at + 4));
      const back = inside(state, 'Alpha one') + 5;
      state = state.apply(state.tr.delete(back, back + 4));
      expect(shownBy(state)).toEqual(shownBy(stateWith(plugin(), state.doc)));
      expect(versionChanges(state).map((change) => [change.kind, change.text])).toEqual([
        ['move', 'New Delta'],
        ['deletion', 'Omitted'],
        ['modification', 'New Beta two'],
        ['insertion', 'New Gamma'],
      ]);
    },
  );

  it('DOCE-VERSIONS-2.6 shows after typing in the scope what comparing the versions shows', () => {
    const whole = vi.mocked(compare.compareWithOlder);
    const plugin = () =>
      createVersionChanges({ previous: () => longer, scope: () => ['h0000002'] });
    let state = stateWith(plugin(), reordered);
    whole.mockClear();
    state = typeIn(state, ['Beta two', 'Detail', 'Gamma']);
    expect(whole).not.toHaveBeenCalled();
    expect(shownBy(state)).toEqual(shownBy(stateWith(plugin(), state.doc)));
    expect(versionChangeCounts(state).total).toBe(4);
  });

  it('DOCE-VERSIONS-2.5 compares the versions for typing it cannot follow block by block', () => {
    const whole = vi.mocked(compare.compareWithOlder);
    const loose: StoredNode = { type: 'paragraph', content: [{ type: 'text', text: 'Loose' }] };
    const many = Array.from({ length: 9 }, (_, index) =>
      node('paragraph', `b000000${String(index)}`, `Item ${String(index)}`),
    );
    const plugin = () => createVersionChanges({ previous: () => older });
    let state = stateWith(plugin(), read(node('paragraph', 'a0000001', 'Alpha'), loose, ...many));
    whole.mockClear();
    // A block without an element id pairs by its text, so its version is compared whole.
    state = state.apply(state.tr.insertText('New ', inside(state, 'Loose')));
    expect(whole).toHaveBeenCalledTimes(1);
    // One change typing in more blocks than are followed one by one, as replacing all does.
    const tr = state.tr;
    for (const each of many) {
      tr.insertText('!', tr.mapping.map(inside(state, each.content?.[0]?.text ?? '')));
    }
    state = state.apply(tr);
    expect(whole).toHaveBeenCalledTimes(2);
    expect(shownBy(state)).toEqual(shownBy(stateWith(plugin(), state.doc)));
  });
});

describe('scoped comparisons', () => {
  it('DOCE-VERSIONS-2.6 shows only the changes in the scope, marks the blocks outside and counts', () => {
    let scope: string[] = ['h0000002'];
    let state = stateWith(createVersionChanges({ previous: () => older, scope: () => scope }));
    expect(versionChanges(state).map((change) => change.text)).toEqual(['Beta two', 'Gamma']);
    expect(versionChangeCounts(state)).toEqual({
      insertion: 1,
      deletion: 0,
      modification: 1,
      formatting: 0,
      move: 0,
      total: 2,
    });
    const dimmed = (current: EditorState) =>
      versionChangesDecorations(current).filter((attrs) => attrs['data-diff-scope'] === 'outside')
        .length;
    expect(dimmed(state)).toBe(2);
    scope = ['a0000001'];
    state = state.apply(refreshVersionChanges(state.tr));
    expect(versionChanges(state).map((change) => change.text)).toEqual(['Alpha one']);
    expect(dimmed(state)).toBe(4);
    scope = [];
    state = state.apply(refreshVersionChanges(state.tr));
    expect(versionChangeCounts(state).total).toBe(3);
    expect(dimmed(state)).toBe(0);
  });
});

// The decorations' attributes a state shows.
function versionChangesDecorations(state: EditorState): Record<string, string>[] {
  const plugin = state.plugins[0];
  const set = plugin?.props.decorations?.call(plugin, state);
  if (!(set instanceof DecorationSet)) return [];
  return set
    .find()
    .map(
      (decoration) =>
        (decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs,
    );
}
