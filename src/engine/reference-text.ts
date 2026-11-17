// The text a reference reads and how it is written: a citation of another document as the template
// formats its type, or as the library writes it when the template has no format, and a reference's
// new text written over its old one, rewriting only what changed, so the unchanged parts keep their
// own marks.

import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import {
  EXTERNAL_DOCUMENT_REFERENCE_TYPE,
  formatReference,
  readReferenceBaseline,
  type ReferenceBaseline,
  type TemplateFile,
} from '../model/index.js';

/** A citation of another document, as a reference records it. */
export interface CitationText {
  /** The reference type, such as `external-document`. */
  readonly refType: string;
  readonly baseline: ReferenceBaseline;
  /** Whether the text shows the cited revision. */
  readonly includeRevision?: boolean | undefined;
}

// An equation's number without the brackets the stylesheet prints around it.
const bare = (number: string) => number.replace(/^\((.*)\)$/, '$1');

/**
 * How a citation of another document reads without a template format: the document's number, or
 * its id without one, and its title, its revision when shown, then the target it names: a heading
 * after a section sign, an equation's number after `Eq.`, an object's number. A host's own
 * reference type reads its recorded label.
 */
export function citationLabel({ refType, baseline, includeRevision }: CitationText): string {
  if (refType !== EXTERNAL_DOCUMENT_REFERENCE_TYPE) return baseline.defaultLabel;
  const name = [baseline.numbering || baseline.documentId, baseline.title].filter(Boolean);
  const revision = includeRevision && baseline.revisionLabel ? ` ${baseline.revisionLabel}` : '';
  const document = `${name.join(' - ')}${revision}`;
  const { target } = baseline;
  if (!target) return document || baseline.defaultLabel;
  if (target.kind === 'heading') return `${document} § ${target.label || target.numbering}`;
  if (target.kind === 'equation') return `${document} Eq. ${bare(target.numbering)}`;
  return `${document} ${target.numbering}`;
}

/** A citation's text as the template formats its type, or its label without a format. */
export function citationText(citation: CitationText, template: TemplateFile): string {
  const formats = Object.fromEntries(
    Object.entries(template.references?.formats ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  return formatReference({ ...citation, formats, fallback: citationLabel(citation) });
}

/**
 * Writes a reference's new text and mark over the range it holds, rewriting only the part between
 * the start and end the old and new text share: those keep their own marks, and a change of the
 * mark alone leaves the text as it is. The rewritten part takes the marks at its start.
 */
export function rewriteReference(
  tr: Transaction,
  { from, to, text, mark }: { from: number; to: number; text: string; mark: Mark },
): void {
  const current = tr.doc.textBetween(from, to, '￼', '￼');
  let start = 0;
  while (start < current.length && start < text.length && current[start] === text[start]) {
    start += 1;
  }
  let end = 0;
  const most = Math.min(current.length, text.length) - start;
  while (end < most && current.at(-1 - end) === text.at(-1 - end)) end += 1;
  const changed = { from: from + start, to: to - end };
  const inserted = text.slice(start, text.length - end);
  if (inserted) {
    const marks = tr.doc
      .resolve(Math.min(changed.from + 1, to))
      .marks()
      .filter((each) => each.type !== mark.type);
    tr.replaceWith(changed.from, changed.to, tr.doc.type.schema.text(inserted, marks));
  } else if (changed.from < changed.to) {
    tr.delete(changed.from, changed.to);
  }
  const length = text.length;
  tr.removeMark(from, from + length, mark.type);
  tr.addMark(from, from + length, mark);
}

/** A reference in the text: its range and its mark. */
interface MarkedRange {
  readonly from: number;
  readonly to: number;
  readonly mark: Mark;
}

/**
 * Renders the citations of other documents among the references given again as the template
 * formats them, from what each recorded when it was cited; a reference that recorded nothing keeps
 * its text. Returns whether any changed.
 */
export function renderCitations(
  tr: Transaction,
  { template, references }: { template: TemplateFile; references: readonly MarkedRange[] },
): boolean {
  let changed = false;
  for (const reference of [...references].reverse()) {
    const { attrs } = reference.mark;
    const refType = String(attrs.refType ?? '');
    const baseline = readReferenceBaseline(attrs.referenceBaseline);
    if (refType.startsWith('internal-') || !baseline) continue;
    const text = citationText(
      { refType, baseline, includeRevision: attrs.includeRevision === true },
      template,
    );
    if (!text || text === tr.doc.textBetween(reference.from, reference.to)) continue;
    rewriteReference(tr, { ...reference, text });
    changed = true;
  }
  return changed;
}

// The citations of other documents in a range of a document, each as the run of text carrying it.
function citationsBetween(doc: ProseMirrorNode, from: number, to: number): MarkedRange[] {
  const found: MarkedRange[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    const mark = node.marks.find(
      (each) =>
        each.type.name === 'reference' && !String(each.attrs.refType).startsWith('internal-'),
    );
    if (!node.isText || !mark) return true;
    const last = found.at(-1);
    if (last && last.to === pos && last.mark.eq(mark))
      found[found.length - 1] = { ...last, to: pos + node.nodeSize };
    else found.push({ from: pos, to: pos + node.nodeSize, mark });
    return false;
  });
  return found;
}

/**
 * Renders the citations of other documents that pasted text brings in as the template formats
 * them, from what each recorded when cited (`renderCitations`). Returns whether any changed.
 */
export function renderPastedCitations(
  tr: Transaction,
  { template, transactions }: { template: TemplateFile; transactions: readonly Transaction[] },
): boolean {
  const ranges: { from: number; to: number }[] = [];
  transactions.forEach((each, index) => {
    if (each.getMeta('uiEvent') !== 'paste') return;
    const later = transactions.slice(index + 1).map((next) => next.mapping);
    each.steps.forEach((step, at) => {
      const rest = [each.mapping.slice(at + 1), ...later];
      const map = (pos: number, bias: number) =>
        rest.reduce((mapped, mapping) => mapping.map(mapped, bias), pos);
      step.getMap().forEach((...[, , from, to]) => {
        ranges.push({ from: map(from, -1), to: map(to, 1) });
      });
    });
  });
  const references = ranges.flatMap(({ from, to }) =>
    from < to ? citationsBetween(tr.doc, from, to) : [],
  );
  return renderCitations(tr, { template, references });
}
