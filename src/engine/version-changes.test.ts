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
    const spy = vi.mocked(compare.compareVersions);
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
    const spy = vi.mocked(compare.compareVersions);
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
    // Typing inside the scope, a remote change and a system change compare again.
    state = state.apply(state.tr.insertText('!', inside(state, 'Beta')));
    state = state.apply(markRemote(state.tr.insertText('!', inside(state, 'Gamma'))));
    state.apply(markSystemChange(state.tr.insertText('!', inside(state, '!Beta'))));
    expect(spy).toHaveBeenCalledTimes(3);
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
