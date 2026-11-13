// What an agent reads before it edits: the document's elements in order, each once though the
// pages split it, with their text, the element holding them, the section they are in and the
// number the template gives them.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  catalogDocument,
  DEFAULT_CONTENTS_KINDS,
  isSectionNode,
  type TemplateFile,
} from '../model/index.js';
import { textOf } from './automation-address.js';

/** An element of the document as the automation API reads it. */
export interface DescribedBlock {
  readonly elementId: string;
  /** The element's node type, such as `paragraph` or `heading`. */
  readonly type: string;
  /** Its text, each inline object as a space; a container's is its blocks' text, by lines. */
  readonly text: string;
  readonly length: number;
  /** The id of the element holding it, or null at the top. */
  readonly parentId: string | null;
  /** The index of the document section it is in, from 0; null for content outside every section. */
  readonly section: number | null;
  /**
   * Its number as the template numbers it, such as `2.1` for a heading or `Figure 3` for a figure,
   * when the template is given and numbers it; else empty.
   */
  readonly number: string;
}

/** How the document is read. */
export interface DescribeOptions {
  /** The resolved template, which numbers headings and objects. */
  readonly template?: TemplateFile | undefined;
}

// The lists of the catalog that number blocks; the others list marks and inline nodes.
const { toc, figures, tables, codeBlocks, equations } = DEFAULT_CONTENTS_KINDS;
const NUMBERED_KINDS = { toc, figures, tables, codeBlocks, equations };

// The number of each numbered block, by where it starts.
function numbersOf(doc: ProseMirrorNode, template: TemplateFile | undefined) {
  const numbers = new Map<number, string>();
  if (!template) return numbers;
  for (const entries of Object.values(catalogDocument(doc, template, NUMBERED_KINDS))) {
    for (const entry of entries) if (entry.number) numbers.set(entry.pos, entry.number);
  }
  return numbers;
}

/**
 * The document's elements in order, with their text, section and number, each once though the
 * pages split it.
 */
export function describeBlocks(
  doc: ProseMirrorNode,
  { template }: DescribeOptions = {},
): DescribedBlock[] {
  const numbers = numbersOf(doc, template);
  const described = new Map<string, DescribedBlock>();
  let section: number | null = null;
  const visit = (node: ProseMirrorNode, pos: number, parentId: string | null) => {
    const id = typeof node.attrs.dataId === 'string' && node.isBlock ? node.attrs.dataId : null;
    if (id) {
      const text = node.isTextblock
        ? textOf({ node, pos }).text
        : node.textBetween(0, node.content.size, '\n', ' ');
      const known = described.get(id);
      const joined = known
        ? `${known.text}${known.type === node.type.name && node.isTextblock ? '' : '\n'}${text}`
        : text;
      described.set(id, {
        elementId: id,
        type: node.type.name,
        text: joined,
        length: joined.length,
        parentId,
        section,
        number: known?.number || (numbers.get(pos) ?? ''),
      });
    }
    if (node.isTextblock) return;
    node.forEach((child, offset) => visit(child, pos + 1 + offset, id ?? parentId));
  };
  let sections = 0;
  doc.forEach((child, offset) => {
    section = isSectionNode(child) ? sections++ : null;
    visit(child, offset, null);
  });
  return [...described.values()];
}
