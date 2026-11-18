// Why suggest mode refused a change. A change a suggestion cannot record is not made
// (DOCE-SUGGESTIONS-1.5); the editor records why in the state, so it can tell the writer instead of
// doing nothing, until the writer's next change.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from 'prosemirror-transform';

/**
 * Why a change could not be made as a suggestion: a change of structure around blocks (wrapping
 * them in a list, nesting or lifting them), a split of a block a suggestion cannot split (a list
 * item, or a block laid out across pages), the insertion of a block that cannot be suggested, a
 * change of formatting a suggestion cannot record, the deletion of a whole object nothing in it
 * names as the writer's, or another change.
 */
export type SuggestionRefusalReason =
  'structure' | 'split' | 'block' | 'formatting' | 'object' | 'other';

/** The change suggest mode refused last, until the writer's next change. */
export interface SuggestionRefusal {
  readonly reason: SuggestionRefusalReason;
  /** Counts the refusals, so a new one is told apart from the last. */
  readonly count: number;
}

// The last refusal, while the document has not changed since, and how many there were.
interface RefusalState {
  readonly reason: SuggestionRefusalReason | null;
  readonly count: number;
}

const refusalKey = new PluginKey<RefusalState>('suggestion-refusal');

const FORMATTING_STEPS = [
  AddMarkStep,
  RemoveMarkStep,
  AddNodeMarkStep,
  RemoveNodeMarkStep,
  AttrStep,
];

// Whether a range of a document covers a whole block that holds other blocks, such as a table.
function coversObject(doc: ProseMirrorNode, from: number, to: number): boolean {
  let found = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (found || node.isTextblock || node.isInline) return false;
    if (pos >= from && pos + node.nodeSize <= to) found = true;
    return !found;
  });
  return found;
}

function reasonOfStep(step: Step, doc: ProseMirrorNode): SuggestionRefusalReason | null {
  if (step instanceof ReplaceAroundStep) return 'structure';
  if (FORMATTING_STEPS.some((type) => step instanceof type)) return 'formatting';
  if (!(step instanceof ReplaceStep)) return null;
  const { slice, from, to } = step;
  if (slice.openStart > 0 && slice.openEnd > 0 && slice.content.childCount > 1) return 'split';
  let block = false;
  slice.content.descendants((node) => {
    block ||= node.isBlock && !node.isTextblock;
    return !block;
  });
  if (block) return 'block';
  return from < to && coversObject(doc, from, to) ? 'object' : null;
}

/** Why a local change could not be made as a suggestion, from what its steps do. */
export function suggestionRefusalReason(tr: Transaction): SuggestionRefusalReason {
  for (const [index, step] of tr.steps.entries()) {
    const reason = reasonOfStep(step, tr.docs[index] ?? tr.doc);
    if (reason) return reason;
  }
  return 'other';
}

/** The change suggest mode refused last, or null once the writer has changed the document since. */
export function suggestionRefusalOf(state: EditorState): SuggestionRefusal | null {
  const kept = refusalKey.getState(state);
  return kept?.reason ? { reason: kept.reason, count: kept.count } : null;
}

/**
 * A change that records why suggest mode refused a local change, to dispatch in its place: it
 * changes nothing but what the editor tells the writer.
 */
export function markSuggestionRefused(state: EditorState, refused: Transaction): Transaction {
  return state.tr
    .setMeta(refusalKey, suggestionRefusalReason(refused))
    .setMeta('addToHistory', false);
}

/** Keeps the change suggest mode refused last, until the document changes. */
export function createSuggestionRefusal(): Plugin<RefusalState> {
  return new Plugin<RefusalState>({
    key: refusalKey,
    state: {
      init: () => ({ reason: null, count: 0 }),
      apply(tr, current) {
        const reason = tr.getMeta(refusalKey) as SuggestionRefusalReason | undefined;
        if (reason) return { reason, count: current.count + 1 };
        return tr.docChanged && current.reason ? { reason: null, count: current.count } : current;
      },
    },
  });
}
