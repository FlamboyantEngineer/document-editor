// References: text citing a heading, figure, table, code block or equation of this document, or a
// target a host resolves in another document. Internal references keep their text as the template
// formats it, following their target's number and title after each change, and are marked broken
// when their target is gone, keeping their text. A reference is inserted, edited or removed at the
// selection, and followed to its target.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  type Transaction,
} from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import {
  readReferenceBaseline,
  type ReferenceBaseline,
  type TemplateFile,
} from '../model/index.js';
import { isReferencePlace } from './reference-places.js';
import {
  internalBaseline,
  internalReferenceText,
  type ReferenceTarget,
  referenceTargets,
} from './reference-targets.js';
import { touchesReferences } from './reference-updates.js';
import { revealElement } from './reveal.js';

export type { ReferenceTarget } from './reference-targets.js';
export { internalReferenceText, referenceTargets } from './reference-targets.js';

/** A reference in the text: its range and its mark. */
export interface ReferenceAt {
  readonly from: number;
  readonly to: number;
  readonly mark: Mark;
}

// Each reference of a text block, as the runs of text carrying the same mark.
function referencesIn(block: ProseMirrorNode, start: number): ReferenceAt[] {
  const found: ReferenceAt[] = [];
  let pos = start;
  block.forEach((child) => {
    const end = pos + child.nodeSize;
    const mark = child.marks.find((each) => each.type.name === 'reference');
    const last = found.at(-1);
    if (mark && last && last.to === pos && last.mark.eq(mark)) {
      found[found.length - 1] = { ...last, to: end };
    } else if (mark) found.push({ from: pos, to: end, mark });
    pos = end;
  });
  return found;
}

/** Every reference of a document, in reading order. */
export function listReferences(doc: ProseMirrorNode): ReferenceAt[] {
  const found: ReferenceAt[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    found.push(...referencesIn(node, pos + 1));
    return false;
  });
  return found;
}

/** The reference holding the selection, or the caret at its edge, or null. */
export function referenceAt(state: EditorState): ReferenceAt | null {
  const { $from, from, to } = state.selection;
  if (!$from.parent.isTextblock) return null;
  return (
    referencesIn($from.parent, $from.start()).find(
      (reference) => reference.from <= from && to <= reference.to,
    ) ?? null
  );
}

/**
 * Whether a reference may go at the selection: in body text that takes marks
 * (`isReferencePlace`), not in a heading, a header cell, code or a page header or footer.
 */
export function canInsertReference(state: EditorState): boolean {
  const type = state.schema.marks.reference;
  const { $from, $to } = state.selection;
  if (!type || !$from.sameParent($to) || !isReferencePlace($from)) return false;
  return $from.parent.type.allowsMarkType(type);
}

/** What a reference cites: a target of this document, or a citation a host resolved. */
export type ReferenceSource =
  | { readonly kind: 'internal'; readonly target: ReferenceTarget; readonly text: string }
  | {
      readonly kind: 'external';
      /** The reference type, such as `external-document`. */
      readonly refType: string;
      readonly baseline: ReferenceBaseline;
      readonly text: string;
      readonly includeRevision?: boolean | undefined;
    };

function referenceAttrs(source: ReferenceSource): Record<string, unknown> {
  if (source.kind === 'internal') {
    return {
      refType: `internal-${source.target.kind}`,
      targetId: source.target.id,
      referenceBaseline: JSON.stringify(internalBaseline(source.target)),
      broken: false,
    };
  }
  const { baseline } = source;
  return {
    refType: source.refType,
    targetId: baseline.target?.id ?? baseline.documentId,
    referenceBaseline: JSON.stringify(baseline),
    includeRevision: source.includeRevision ?? false,
    broken: false,
    docNumber: baseline.numbering || null,
    docTitle: baseline.title || null,
    docRevision: baseline.revisionLabel || null,
  };
}

/**
 * Inserts a reference at the selection, in place of the selected text, or changes the reference
 * holding the selection. Refused where a reference may not go (`canInsertReference`).
 */
export function insertReference(source: ReferenceSource): Command {
  return (state, dispatch) => {
    const type = state.schema.marks.reference;
    if (!type || !canInsertReference(state) || !source.text) return false;
    if (dispatch) {
      const current = referenceAt(state);
      const { from, to } = current ?? state.selection;
      const marks = state.doc
        .resolve(from)
        .marks()
        .filter((mark) => mark.type !== type);
      const mark = type.create(referenceAttrs(source));
      const tr = state.tr.replaceWith(from, to, state.schema.text(source.text, [...marks, mark]));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Removes the reference holding the selection, keeping its text. */
export const removeReference: Command = (state, dispatch) => {
  const reference = referenceAt(state);
  const type = state.schema.marks.reference;
  if (!reference || !type) return false;
  dispatch?.(state.tr.removeMark(reference.from, reference.to, type));
  return true;
};

/** The element id an internal reference cites, or null for another reference. */
export function internalTargetId(mark: Mark): string | null {
  const type = String(mark.attrs.refType ?? '');
  const id = mark.attrs.targetId as unknown;
  return type.startsWith('internal-') && typeof id === 'string' && id ? id : null;
}

/** What a reference records of what it cites, or null: a citation, or an internal target. */
export function referenceBaselineOf(mark: Mark): ReferenceBaseline | null {
  return readReferenceBaseline(mark.attrs.referenceBaseline);
}

const referencesKey = new PluginKey('references');

/** Whether a transaction updates the internal references' text, rather than the writer's. */
export const isReferenceUpdate = (tr: Transaction): boolean => tr.getMeta(referencesKey) === true;

// The mark an internal reference carries once up to date: broken without a target, else recording
// the target as it reads now.
function currentMark(reference: ReferenceAt, target: ReferenceTarget | undefined): Mark {
  const { attrs } = reference.mark;
  const referenceBaseline = target
    ? JSON.stringify(internalBaseline(target))
    : (attrs.referenceBaseline as unknown);
  return reference.mark.type.create({ ...attrs, broken: !target, referenceBaseline });
}

/**
 * Brings each internal reference in body text up to date in a transaction: its text as its target
 * reads now, recording the target's number and title, or marked broken, its text kept, when the
 * target is gone. A reference where none may go (`isReferencePlace`), as in a heading, is left as
 * it reads, so a heading that cites itself never grows. Returns whether any changed.
 */
export function updateReferences(tr: Transaction, template: TemplateFile): boolean {
  const references = listReferences(tr.doc).filter(
    (each) => internalTargetId(each.mark) && isReferencePlace(tr.doc.resolve(each.from)),
  );
  if (references.length === 0) return false;
  const targets = new Map(referenceTargets(tr.doc, template).map((each) => [each.id, each]));
  let changed = false;
  for (const reference of references.reverse()) {
    const target = targets.get(internalTargetId(reference.mark) ?? '');
    const text = target ? internalReferenceText(target, template) : null;
    const current = tr.doc.textBetween(reference.from, reference.to);
    const mark = currentMark(reference, target);
    if (mark.eq(reference.mark) && (text === null || text === current)) continue;
    if (text !== null && text !== current) {
      const marks = tr.doc.resolve(reference.from + 1).marks();
      const kept = marks.filter((each) => each.type !== mark.type);
      tr.replaceWith(reference.from, reference.to, tr.doc.type.schema.text(text, [...kept, mark]));
    } else {
      tr.removeMark(reference.from, reference.to, mark.type);
      tr.addMark(reference.from, reference.to, mark);
    }
    changed = true;
  }
  return changed;
}

/**
 * Renders every internal reference again as the template formats it now, out of the undo history,
 * such as after the template changed; false when none changed.
 */
export function refreshReferences(template: TemplateFile): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    if (!updateReferences(tr, template)) return false;
    dispatch?.(tr.setMeta(referencesKey, true).setMeta('addToHistory', false));
    return true;
  };
}

/** How the references plugin reads the template. */
export interface ReferencesOptions {
  readonly template: () => TemplateFile;
  /** Takes the reader to an element by its id; `revealElement` by default. */
  readonly reveal?: ((view: EditorView, id: string) => void) | undefined;
}

/**
 * Keeps internal references up to date after each change that may change one (`touchesReferences`),
 * out of the undo history, and follows
 * one to its target on a click in a read document, or a Ctrl or Cmd click in an edited one.
 */
export function createReferences({
  template,
  reveal = (view, id) => revealElement(view, id),
}: ReferencesOptions): Plugin {
  return new Plugin({
    key: referencesKey,
    appendTransaction(transactions, _before, after) {
      if (!transactions.some((tr) => !isReferenceUpdate(tr) && touchesReferences(tr))) return null;
      const tr = after.tr;
      if (!updateReferences(tr, template())) return null;
      return tr.setMeta(referencesKey, true).setMeta('addToHistory', false);
    },
    props: {
      handleClick(view, pos, event) {
        if (view.editable && !event.ctrlKey && !event.metaKey) return false;
        const $pos = view.state.doc.resolve(pos);
        const mark = [...$pos.marks(), ...($pos.nodeAfter?.marks ?? [])].find(
          (each) => each.type.name === 'reference',
        );
        const id = mark ? internalTargetId(mark) : null;
        if (!id) return false;
        reveal(view, id);
        return true;
      },
    },
  });
}
