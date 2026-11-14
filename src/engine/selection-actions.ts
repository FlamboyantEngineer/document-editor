// Actions on the selected text through the host's provider: the selection is read as passages of
// element text, by element id and offsets, the provider is asked, and its answer goes in as one
// batch by the agent, its replacements as suggestions by default and its comments as threads. A
// replacement names the text it was asked about, so a passage the writer changed while the
// provider answered refuses the whole answer instead of writing over the change.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type {
  HostError,
  SelectionActionAnswer,
  SelectionActionChange,
  SelectionActionsAdapter,
  SelectionPassage,
} from '../host/index.js';
import {
  type Actor,
  applyEdits,
  type AutomationEdit,
  type AutomationError,
  type CreatedThread,
} from './automation.js';
import { textOf } from './automation-address.js';

/**
 * The passages a selection covers: the selected part of each text block with an element id, in
 * document order, or the whole of the caret's block when nothing is selected. Blocks without an
 * element id and empty parts are left out.
 */
export function selectionPassages(state: EditorState): SelectionPassage[] {
  const { selection } = state;
  const passages: SelectionPassage[] = [];
  for (const range of selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      const elementId = node.attrs.dataId as unknown;
      if (typeof elementId !== 'string') return false;
      const { text, positions } = textOf({ node, pos });
      const offset = (at: number) => positions.filter((each) => each < at).length;
      const start = selection.empty ? 0 : offset(from);
      const end = selection.empty ? text.length : offset(to);
      if (end > start) {
        const blockType = node.type.name;
        passages.push({ elementId, from: start, to: end, text: text.slice(start, end), blockType });
      }
      return false;
    });
  }
  return passages;
}

/** Why an action wrote nothing. */
export type SelectionActionFailure =
  | { readonly reason: 'empty' }
  | { readonly reason: 'aborted' }
  | { readonly reason: 'host'; readonly error: HostError }
  | { readonly reason: 'outside'; readonly index: number }
  | { readonly reason: 'refused'; readonly error: AutomationError };

/** How an action ended: the threads its comments opened, for the host to store, or why not. */
export type SelectionActionResult =
  | { readonly ok: true; readonly threads: readonly CreatedThread[] }
  | ({ readonly ok: false } & SelectionActionFailure);

// The passage a change lies within, or null.
const passageOf = (passages: readonly SelectionPassage[], change: SelectionActionChange) =>
  passages.find(
    (each) =>
      each.elementId === change.elementId &&
      change.from >= each.from &&
      change.to <= each.to &&
      change.from <= change.to,
  ) ?? null;

/**
 * The batch of edits an answer makes to the passages it was asked about: each replacement and
 * comment by its range, expecting the text the passage held; the index of the first change that
 * lies outside the passages when one does.
 */
export function selectionActionEdits(
  passages: readonly SelectionPassage[],
  answer: SelectionActionAnswer,
): AutomationEdit[] | { outside: number } {
  const changes = [
    ...(answer.comments ?? []).map((change) => ({ op: 'comment' as const, change })),
    ...(answer.replacements ?? []).map((change) => ({ op: 'replaceText' as const, change })),
  ];
  const edits: AutomationEdit[] = [];
  for (const [index, { op, change }] of changes.entries()) {
    const passage = passageOf(passages, change);
    if (!passage) return { outside: index };
    const expect = passage.text.slice(change.from - passage.from, change.to - passage.from);
    const at = { elementId: change.elementId, from: change.from, to: change.to, expect };
    edits.push({ op, at, text: change.text });
  }
  // In each element, later ranges first, so a replacement never moves the offsets of one before it.
  const elements = passages.map((passage) => passage.elementId);
  const rank = (edit: AutomationEdit) =>
    'at' in edit ? [elements.indexOf(edit.at.elementId), -(edit.at.from ?? 0)] : [0, 0];
  return edits.toSorted((a, b) => {
    const [elementA = 0, fromA = 0] = rank(a);
    const [elementB = 0, fromB = 0] = rank(b);
    return elementA - elementB || fromA - fromB;
  });
}

/** How an action is asked for. */
export interface SelectionActionOptions {
  /** The host's name for the action, such as `shorten` or `review`. */
  readonly action: string;
  readonly instruction?: string | undefined;
  /** `suggest`, the default, records the replacements as the agent's suggestions. */
  readonly mode?: 'direct' | 'suggest' | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Makes fresh ids for comment threads and suggestions; random by default. */
  readonly newId?: (() => string) | undefined;
}

/**
 * Asks the host's provider to act on the selected text (`selectionPassages`) and dispatches its
 * answer as one change by its agent: the replacements as suggestions unless `mode` is `direct`,
 * the comments as threads the result gives for the host to store. Writes nothing when nothing is
 * selected, the provider fails, the signal aborts, a change lies outside the passages, or a passage
 * no longer holds the text it was asked about.
 */
export async function runSelectionAction(
  view: EditorView,
  adapter: SelectionActionsAdapter,
  options: SelectionActionOptions,
): Promise<SelectionActionResult> {
  const passages = selectionPassages(view.state);
  if (passages.length === 0) return { ok: false, reason: 'empty' };
  const { action, instruction, signal } = options;
  const answered = await adapter.run({ action, instruction, passages, signal });
  if (signal?.aborted || view.isDestroyed) return { ok: false, reason: 'aborted' };
  if (!answered.ok) return { ok: false, reason: 'host', error: answered.error };
  const edits = selectionActionEdits(passages, answered.value);
  if (!Array.isArray(edits)) return { ok: false, reason: 'outside', index: edits.outside };
  if (edits.length === 0) return { ok: true, threads: [] };
  const actor: Actor = { id: adapter.agent, kind: 'agent', session: answered.value.session };
  const result = applyEdits(view.state, edits, {
    actor,
    mode: options.mode ?? 'suggest',
    ...(options.newId ? { newId: options.newId } : {}),
  });
  if (!result.ok) return { ok: false, reason: 'refused', error: result.error };
  view.dispatch(result.tr);
  return { ok: true, threads: result.threads };
}
