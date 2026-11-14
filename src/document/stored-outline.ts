// A stored document's outline without the editor's view: its headings, numbered as the template
// numbers them, each with the top-level elements its span holds, so a server scopes a review or a
// comparison to a heading on the stored file alone.

import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { documentOutline, headingSectionSpan } from '../engine/outline.js';
import {
  type DocumentFile,
  readDocumentFile,
  regionKind,
  type TemplateFile,
} from '../model/index.js';

/** How `storedOutline` reads a stored document. */
export interface StoredOutlineOptions {
  readonly schema: Schema;
  /** The resolved template, to number the headings; without one, each number is empty. */
  readonly template?: TemplateFile | undefined;
}

/** A heading of a stored document's outline. */
export interface StoredOutlineEntry {
  readonly elementId: string | null;
  readonly level: number;
  readonly text: string;
  readonly number: string;
  /** The ids of the top-level elements the heading's span holds, the heading first. */
  readonly span: readonly string[];
}

// The ids of the blocks directly in a content region between two positions.
function spanIds(doc: ProseMirrorNode, from: number, to: number): string[] {
  const ids: string[] = [];
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (parent && regionKind(parent) === 'content') {
      if (typeof node.attrs.dataId === 'string' && node.attrs.dataId) ids.push(node.attrs.dataId);
      return false;
    }
    return true;
  });
  return ids;
}

/**
 * A stored document's headings in reading order, as the editor's outline lists them
 * (`documentOutline`), each with the top-level elements of the span it heads
 * (`headingSectionSpan`).
 */
export function storedOutline(
  file: DocumentFile,
  { schema, template }: StoredOutlineOptions,
): StoredOutlineEntry[] {
  const { doc } = readDocumentFile(file, schema, { unknown: 'keep' });
  return documentOutline(EditorState.create({ doc }), template).map(
    ({ elementId, level, text, number, pos }) => {
      const span = headingSectionSpan(doc, pos - 1);
      return { elementId, level, text, number, span: span ? spanIds(doc, span.from, span.to) : [] };
    },
  );
}
