// The targets an internal reference may cite: the headings, figures, tables, code blocks and
// equations the catalog lists with an element id, and the text a reference to one reads.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  catalogDocument,
  formatReference,
  type ReferenceBaseline,
  type TemplateFile,
} from '../model/index.js';

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

// What an internal reference records of its target: its number, title and label as it cited them.
export const internalBaseline = (target: ReferenceTarget): ReferenceBaseline => ({
  version: 1,
  documentId: '',
  numbering: target.number,
  title: target.title,
  revision: null,
  revisionLabel: '',
  target: null,
  defaultLabel: target.label,
});

/** The text an internal reference to a target reads, as the template formats its kind. */
export function internalReferenceText(target: ReferenceTarget, template: TemplateFile): string {
  const formats = Object.fromEntries(
    Object.entries(template.references?.formats ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  const baseline = internalBaseline(target);
  return formatReference({ refType: `internal-${target.kind}`, baseline, formats });
}
