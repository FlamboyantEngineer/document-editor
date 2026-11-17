// The targets an internal reference may cite: the headings, figures, tables, code blocks and
// equations the catalog lists with an element id, and the text a reference to one reads.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  catalogDocument,
  deriveLinkedCodeBlockCaption,
  ELEMENT_KINDS,
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

// A target's title: an equation has none, its number names it; linked code is named by its source.
function titleOf(node: ProseMirrorNode, text: string): string {
  if (node.type.name === 'math_display') return '';
  if (node.type.name === 'linked_code_block') return deriveLinkedCodeBlockCaption(node.attrs.url);
  return text;
}

/** The targets a document holds, by kind, in reading order: those with an element id. */
export function referenceTargets(doc: ProseMirrorNode, template: TemplateFile): ReferenceTarget[] {
  const catalog = catalogDocument(doc, template, ELEMENT_KINDS);
  const targets: ReferenceTarget[] = [];
  for (const [key, kind] of Object.entries(CATALOG_KINDS)) {
    for (const entry of catalog[key] ?? []) {
      const node = doc.nodeAt(entry.pos);
      const id = node?.attrs.dataId as unknown;
      if (!node || typeof id !== 'string' || !id) continue;
      const number = entry.number.trim();
      const title = titleOf(node, entry.text);
      const separator = kind === 'heading' ? ' ' : ' - ';
      const label = [number, title].filter(Boolean).join(separator);
      targets.push({ id, kind, number, title, label, pos: entry.pos });
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
