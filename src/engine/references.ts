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
  catalogDocument,
  formatReference,
  readReferenceBaseline,
  type ReferenceBaseline,
  type TemplateFile,
} from '../model/index.js';
import { revealElement } from './reveal.js';

/** A target an internal reference may cite. */
export interface ReferenceTarget {
  /** The target's element id, which the reference keeps. */
  readonly id: string;
  /** `heading`, `figure`, `table`, `codeblock` or `equation`. */
  readonly kind: string;
  /** Its number as the stylesheet prints it, such as `2.1.` or `Table 1.1`. */
  readonly number: string;
  /** A heading's text, or an object's caption. */
  readonly title: string;
  /** How a picker names it: its number, then its title. */
  readonly label: string;
  readonly pos: number;
}

// The catalog's kinds and the reference kinds they hold.
const CATALOG_KINDS = {
  toc: 'heading',
  figures: 'figure',
  tables: 'table',
  codeBlocks: 'codeblock',
  equations: 'equation',
} as const;

/** The targets a document holds, by kind, in reading order: those with an element id. */
export function referenceTargets(doc: ProseMirrorNode, template: TemplateFile): ReferenceTarget[] {
  const catalog = catalogDocument(doc, template);
  const targets: ReferenceTarget[] = [];
  for (const [key, kind] of Object.entries(CATALOG_KINDS)) {
    for (const entry of catalog[key] ?? []) {
      const id = doc.nodeAt(entry.pos)?.attrs.dataId as unknown;
      if (typeof id !== 'string' || !id) continue;
      const number = entry.number.trim();
      const separator = kind === 'heading' ? ' ' : ' - ';
      const label = [number, entry.text].filter(Boolean).join(separator);
      targets.push({ id, kind, number, title: entry.text, label, pos: entry.pos });
    }
  }
  return targets;
}

/** The text an internal reference to a target reads, as the template formats its kind. */
export function internalReferenceText(target: ReferenceTarget, template: TemplateFile): string {
  const formats = Object.fromEntries(
    Object.entries(template.references?.formats ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const baseline: ReferenceBaseline = {
    version: 1,
    documentId: '',
    numbering: target.number,
    title: target.title,
    revision: null,
    revisionLabel: '',
    target: null,
    defaultLabel: target.label,
  };
  return formatReference({ refType: `internal-${target.kind}`, baseline, formats });
}

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

/** Whether a reference may go at the selection: in text that takes marks, not in code. */
export function canInsertReference(state: EditorState): boolean {
  const type = state.schema.marks.reference;
  const { $from, $to } = state.selection;
  if (!type || !$from.sameParent($to) || !$from.parent.isTextblock) return false;
  return !$from.parent.type.spec.code && $from.parent.type.allowsMarkType(type);
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
    return { refType: `internal-${source.target.kind}`, targetId: source.target.id, broken: false };
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

/** The citation an external reference keeps, or null. */
export function referenceBaselineOf(mark: Mark): ReferenceBaseline | null {
  return readReferenceBaseline(mark.attrs.referenceBaseline);
}

const referencesKey = new PluginKey('references');

/** Whether a transaction updates the internal references' text, rather than the writer's. */
export const isReferenceUpdate = (tr: Transaction): boolean => tr.getMeta(referencesKey) === true;

/**
 * Brings each internal reference up to date in a transaction: its text as its target reads now,
 * or marked broken, its text kept, when the target is gone. Returns whether any changed.
 */
export function updateReferences(tr: Transaction, template: TemplateFile): boolean {
  const references = listReferences(tr.doc).filter((each) => internalTargetId(each.mark));
  if (references.length === 0) return false;
  const targets = new Map(referenceTargets(tr.doc, template).map((each) => [each.id, each]));
  let changed = false;
  for (const reference of references.reverse()) {
    const target = targets.get(internalTargetId(reference.mark) ?? '');
    const broken = !target;
    const text = target ? internalReferenceText(target, template) : null;
    const current = tr.doc.textBetween(reference.from, reference.to);
    if (Boolean(reference.mark.attrs.broken) === broken && (text === null || text === current)) {
      continue;
    }
    const mark = reference.mark.type.create({ ...reference.mark.attrs, broken });
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

/** How the references plugin reads the template. */
export interface ReferencesOptions {
  readonly template: () => TemplateFile;
  /** Takes the reader to an element by its id; `revealElement` by default. */
  readonly reveal?: ((view: EditorView, id: string) => void) | undefined;
}

/**
 * Keeps internal references up to date after each change, out of the undo history, and follows
 * one to its target on a click in a read document, or a Ctrl or Cmd click in an edited one.
 */
export function createReferences({
  template,
  reveal = (view, id) => revealElement(view, id),
}: ReferencesOptions): Plugin {
  return new Plugin({
    key: referencesKey,
    appendTransaction(transactions, _before, after) {
      if (!transactions.some((tr) => tr.docChanged && !isReferenceUpdate(tr))) return null;
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
