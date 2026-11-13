// Shows the changes from an older version of a document on the document, as the decorations of
// `version-decorations.ts`. The baseline may be the document as opened; a document equal to it shows
// no change without a comparison. A comparison scoped to some blocks and headed sections shows only
// the changes inside them and marks the blocks outside. The older version is read once. A
// transaction that only follows the layout (out of the history, derived, or typing outside the
// scope) maps the changes rather than comparing again, and one that only types in a few blocks
// compares those blocks alone, so typing costs the same however long the document is.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { DecorationSet } from 'prosemirror-view';
import {
  isDerivedTransaction,
  isInlineTextOnly,
  isRemoteTransaction,
  isSystemChange,
} from './transaction-kind.js';
import {
  compareBlockWithOlder,
  type CompareSuggestions,
  compareWithOlder,
  type OlderVersion,
  placeOfVersionChange,
  readOlderVersion,
  type VersionChange,
} from './version-compare.js';
import {
  blockChangeDecorations,
  shownBlockChange,
  versionChangeDecorations,
  type VersionChangeDisplay,
} from './version-decorations.js';
import {
  countVersionChanges,
  isInVersionScope,
  mapVersionChange,
  mapVersionSpan,
  outsideScopeDecorations,
  resolveVersionScope,
  type VersionChangeCounts,
  type VersionSpan,
} from './version-scope.js';

export type { VersionChangeDisplay } from './version-decorations.js';

/** The older version a document is compared with, and how its changes show. */
export interface VersionChangesOptions {
  /**
   * The older version, `opened` for the document as it was when the plugin started, or null to
   * show no changes. Read again on `refreshVersionChanges`.
   */
  previous: () => ProseMirrorNode | 'opened' | null;
  /** How changes show. Defaults to markup. */
  display?: (() => VersionChangeDisplay) | undefined;
  /** How the versions' suggestions count. Defaults to rejected. */
  suggestions?: (() => CompareSuggestions) | undefined;
  /**
   * The element ids the comparison covers: a heading covers its headed section. Null or empty
   * covers the whole document.
   */
  scope?: (() => readonly string[] | null) | undefined;
}

interface VersionChangesState {
  readonly opened: ProseMirrorNode;
  /** The older version as it was read to compare with; null while none was read. */
  readonly older: OlderVersion | null;
  readonly display: VersionChangeDisplay;
  readonly scope: readonly VersionSpan[] | null;
  readonly changes: readonly VersionChange[];
  readonly decorations: DecorationSet;
}

// The document changes are shown on.
interface Shown {
  readonly doc: ProseMirrorNode;
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

/** How many changes of each kind a state shows. */
export function versionChangeCounts(state: EditorState): VersionChangeCounts {
  return countVersionChanges(versionChanges(state));
}

// A change that types in more blocks than this, such as one replacing every match of a search, is
// compared whole: following it block by block would cost more.
const MAX_TYPED_BLOCKS = 8;

// What the options ask for now: the older version, how suggestions count, how changes show and
// the scope's spans in the document.
function askedBy(
  options: VersionChangesOptions,
  { doc, opened }: Shown & { opened: ProseMirrorNode },
) {
  const previous = options.previous();
  const ids = options.scope?.() ?? [];
  return {
    previous: previous === 'opened' ? opened : previous,
    suggestions: options.suggestions?.() ?? 'rejected',
    display: options.display?.() ?? 'markup',
    scope: ids.length ? resolveVersionScope(doc, ids) : null,
  };
}

function compute(
  options: VersionChangesOptions,
  { doc, opened, older: read }: Pick<VersionChangesState, 'opened' | 'older'> & Shown,
): VersionChangesState {
  const { previous, suggestions, display, scope } = askedBy(options, { doc, opened });
  const outside = scope ? outsideScopeDecorations(doc, scope) : [];
  // The older version is read again only when another is asked for, or its suggestions count
  // otherwise.
  const kept = read?.doc === previous && read.options.suggestions === suggestions ? read : null;
  // A document equal to the older version, as one just opened is, needs no comparison.
  if (!previous || previous === doc || previous.eq(doc)) {
    const decorations = DecorationSet.create(doc, outside);
    return { opened, older: kept, display, scope, changes: [], decorations };
  }
  const older = kept ?? readOlderVersion(previous, { suggestions });
  const all = compareWithOlder(older, doc);
  const changes = scope ? all.filter((change) => isInVersionScope(change, scope)) : all;
  const decorations = versionChangeDecorations(doc, changes, display).add(doc, outside);
  return { opened, older, display, scope, changes, decorations };
}

// Whether a local transaction only follows the layout or types outside the scope, so the changes
// shown stay as they were, mapped.
function followsOnly(tr: Transaction, scope: readonly VersionSpan[] | null): boolean {
  if (tr.getMeta('addToHistory') === false || isDerivedTransaction(tr)) return true;
  if (!scope || !isInlineTextOnly(tr)) return false;
  let outside = true;
  tr.mapping.maps.forEach((map, index) => {
    const before = scope.map((span) => mapVersionSpan(span, tr.mapping.slice(0, index)));
    map.forEach((from, to) => {
      outside &&= !before.some((span) => from <= span.to && to >= span.from);
    });
  });
  return outside;
}

function mapState(value: VersionChangesState, tr: Transaction): VersionChangesState {
  return {
    ...value,
    scope: value.scope?.map((span) => mapVersionSpan(span, tr.mapping)) ?? null,
    changes: value.changes.map((change) => mapVersionChange(change, tr.mapping)),
    decorations: value.decorations.map(tr.mapping, tr.doc),
  };
}

// Where the text blocks a transaction that only types text typed in start, in its document.
function typedBlocks(tr: Transaction): number[] {
  const blocks = new Set<number>();
  tr.mapping.maps.forEach((map, index) => {
    map.forEach((_from, _to, start) => {
      blocks.add(tr.doc.resolve(tr.mapping.slice(index + 1).map(start, -1)).before());
    });
  });
  return [...blocks];
}

// The state with the block at a position compared alone with the older version: its change among
// the others, in their order, and its own decorations drawn again. Null when the block cannot be
// compared alone.
function withBlockCompared(
  value: VersionChangesState,
  { doc, pos }: Shown & { pos: number },
): VersionChangesState | null {
  const index = value.changes.findIndex((each) => each.parts[0]?.from === pos);
  const shown = value.changes[index];
  const change = value.older ? compareBlockWithOlder(value.older, doc, { pos, shown }) : undefined;
  if (change === undefined) return null;
  const visible = change && (!value.scope || isInVersionScope(change, value.scope)) ? [change] : [];
  const after = value.changes.findIndex((each) => placeOfVersionChange(each) > pos);
  const changes = [...value.changes];
  if (shown) changes.splice(index, 1, ...visible);
  else changes.splice(after < 0 ? changes.length : after, 0, ...visible);
  const block = { from: pos, to: pos + (doc.nodeAt(pos)?.nodeSize ?? 0) };
  const decorations = value.decorations.remove(shownBlockChange(value.decorations, block)).add(
    doc,
    visible.flatMap((each) => blockChangeDecorations(each, value.display)),
  );
  return { ...value, changes, decorations };
}

// The changes after a transaction that only typed text: the blocks typed in compared alone, the
// other changes mapped. Null when it typed in too many blocks, or in one not compared alone.
function afterTyping(value: VersionChangesState, tr: Transaction): VersionChangesState | null {
  const blocks = typedBlocks(tr);
  if (blocks.length > MAX_TYPED_BLOCKS) return null;
  let next: VersionChangesState | null = mapState(value, tr);
  for (const pos of blocks) next = next && withBlockCompared(next, { doc: tr.doc, pos });
  return next;
}

/**
 * Shows how the document changed from an older version, and keeps showing it after each change: a
 * change that only types in a few blocks compares those blocks, another compares the versions.
 * Without an older version it shows nothing.
 */
export function createVersionChanges(options: VersionChangesOptions): Plugin<VersionChangesState> {
  return new Plugin<VersionChangesState>({
    key: versionChangesKey,
    state: {
      init: (_, state) => compute(options, { doc: state.doc, opened: state.doc, older: null }),
      apply: (tr, value) => {
        const whole = () => compute(options, { ...value, doc: tr.doc });
        if (tr.getMeta(versionChangesKey)) return whole();
        if (!tr.docChanged) return value;
        // A remote change and a system change are always compared whole.
        if (isRemoteTransaction(tr) || isSystemChange(tr)) return whole();
        if (followsOnly(tr, value.scope)) return mapState(value, tr);
        return (isInlineTextOnly(tr) ? afterTyping(value, tr) : null) ?? whole();
      },
    },
    props: {
      decorations: (state) => versionChangesKey.getState(state)?.decorations ?? null,
    },
  });
}
