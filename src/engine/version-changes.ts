// Shows the changes from an older version of a document on the document: each changed block marked
// with its kind (`data-diff-change`) for a change bar beside it, and, in markup, the words a block
// gained and lost, and the blocks it lost, in place.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { compareVersions, type VersionChange } from './version-compare.js';

/** How changes show: change bars only, or bars with the changed text marked in place. */
export type VersionChangeDisplay = 'bars' | 'markup';

/** The older version a document is compared with, and how its changes show. */
export interface VersionChangesOptions {
  /** The older version, or null to show no changes. Read again on `refreshVersionChanges`. */
  previous: () => ProseMirrorNode | null;
  /** How changes show. Defaults to markup. */
  display?: (() => VersionChangeDisplay) | undefined;
}

interface VersionChangesState {
  readonly previous: ProseMirrorNode | null;
  readonly display: VersionChangeDisplay;
  readonly changes: readonly VersionChange[];
  readonly decorations: DecorationSet;
}

/** The version changes plugin's key; a transaction with it as meta reads the options again. */
export const versionChangesKey = new PluginKey<VersionChangesState>('versionChanges');

/** Marks a transaction that reads the older version and the display again. */
export function refreshVersionChanges(tr: Transaction): Transaction {
  return tr.setMeta(versionChangesKey, true).setMeta('addToHistory', false);
}

/** The changes a state shows, in the document's order; none without an older version. */
export function versionChanges(state: EditorState): readonly VersionChange[] {
  return versionChangesKey.getState(state)?.changes ?? [];
}

const CHANGE_ATTR = 'data-diff-change';

// A deleted run of text, or a deleted block's text (`data-diff-block`).
function deletedText(owner: Document, text: string, block = false): HTMLElement {
  const element = owner.createElement('del');
  element.setAttribute(CHANGE_ATTR, 'deletion');
  if (block) element.setAttribute('data-diff-block', 'true');
  element.textContent = text;
  return element;
}

// Runs of consecutive positions, as ranges.
function ranges(positions: readonly number[]): [number, number][] {
  const found: [number, number][] = [];
  for (const pos of positions) {
    const last = found.at(-1);
    if (last?.[1] === pos) last[1] = pos + 1;
    else found.push([pos, pos + 1]);
  }
  return found;
}

// The words a changed block gained, marked, and those it lost, in place before what follows them.
function textDecorations(change: VersionChange, decorations: Decoration[]) {
  let index = 0;
  const start = (change.parts[0]?.from ?? 0) + 1;
  for (const segment of change.segments) {
    const length = segment.text.length;
    if (segment.kind === 'deleted') {
      const at = change.positions[index] ?? (change.positions[index - 1] ?? start - 1) + 1;
      const text = segment.text;
      decorations.push(
        Decoration.widget(at, (view) => deletedText(view.dom.ownerDocument, text), {
          side: -1,
          key: `del-${String(at)}-${text}`,
        }),
      );
      continue;
    }
    if (segment.kind === 'inserted') {
      for (const [from, to] of ranges(change.positions.slice(index, index + length))) {
        decorations.push(Decoration.inline(from, to, { [CHANGE_ATTR]: 'insertion' }));
      }
    }
    index += length;
  }
}

// Marks the blocks before which, or after which, blocks were deleted; in markup, the deleted
// blocks' text shows inside them, first or last, so it is measured with them.
function deletionDecorations(changes: readonly VersionChange[], display: VersionChangeDisplay) {
  const decorations: Decoration[] = [];
  const marked = new Set<string>();
  for (const change of changes) {
    if (change.kind !== 'deletion' || !change.at) continue;
    const { from, to, after } = change.at;
    const key = `${String(from)}-${String(after)}`;
    if (!marked.has(key)) {
      marked.add(key);
      decorations.push(
        Decoration.node(from, to, { 'data-diff-deletion': after ? 'after' : 'before' }),
      );
    }
    if (display !== 'markup') continue;
    const text = change.text;
    const at = after ? to - 1 : from + 1;
    decorations.push(
      Decoration.widget(at, (view) => deletedText(view.dom.ownerDocument, text, true), {
        side: after ? 1 : -1,
        key: `deleted-${change.id ?? text}`,
      }),
    );
  }
  return decorations;
}

/** The decorations that show changes on a document. */
export function versionChangeDecorations(
  doc: ProseMirrorNode,
  changes: readonly VersionChange[],
  display: VersionChangeDisplay = 'markup',
): DecorationSet {
  const decorations = deletionDecorations(changes, display);
  for (const change of changes) {
    for (const part of change.parts) {
      decorations.push(Decoration.node(part.from, part.to, { [CHANGE_ATTR]: change.kind }));
    }
    if (display === 'markup' && change.segments.length) textDecorations(change, decorations);
  }
  return DecorationSet.create(doc, decorations);
}

function compute(options: VersionChangesOptions, doc: ProseMirrorNode): VersionChangesState {
  const previous = options.previous();
  const display = options.display?.() ?? 'markup';
  if (!previous) return { previous, display, changes: [], decorations: DecorationSet.empty };
  const changes = compareVersions(previous, doc);
  return {
    previous,
    display,
    changes,
    decorations: versionChangeDecorations(doc, changes, display),
  };
}

/**
 * Compares the document with an older version after each change and shows how it changed. Without
 * an older version it shows nothing.
 */
export function createVersionChanges(options: VersionChangesOptions): Plugin<VersionChangesState> {
  return new Plugin<VersionChangesState>({
    key: versionChangesKey,
    state: {
      init: (_, state) => compute(options, state.doc),
      apply: (tr, value) =>
        tr.docChanged || tr.getMeta(versionChangesKey) ? compute(options, tr.doc) : value,
    },
    props: {
      decorations: (state) => versionChangesKey.getState(state)?.decorations ?? null,
    },
  });
}
