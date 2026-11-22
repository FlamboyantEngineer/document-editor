// The lines the pages draw each forced block on, page by page, read from the layout engine's
// result rather than from the DOM (DOCE-PAGINATION-11.3): what a test compares the drawn lines with.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import {
  FORCED_TYPES,
  forcedLinesKey,
  type ForcedLinesState,
  isContinued,
  sectionScope,
} from './forced-lines.js';
import type { PagesTextEngine } from './text-engine-types.js';

/** A computed line of a block: content offsets in the whole block, and the text between them. */
export interface ComputedLine {
  readonly from: number;
  readonly to: number;
  /** The line's text, inline atoms and hard breaks as nothing, as their text is not the writer's. */
  readonly text: string;
}

/** A top-level text block of a page, and the lines the engine computed for it. */
export interface BlockTextLines {
  readonly elementId: string;
  /** Which part of a split block it is, from 0. */
  readonly part: number;
  readonly type: string;
  /** Where it is in the pages' document. */
  readonly pos: number;
  /** Where its content starts in the whole block. */
  readonly start: number;
  /** Its lines on this page; null when the browser draws it on its own lines. */
  readonly lines: readonly ComputedLine[] | null;
  /** Why the browser draws it, when it does. */
  readonly reason?: string | undefined;
}

/** A page's top-level text blocks, in order. */
export interface PageTextLines {
  readonly blocks: readonly BlockTextLines[];
}

interface Reading {
  readonly engine: PagesTextEngine;
  readonly headings: ReadonlyMap<number, string>;
  readonly numbered: ReadonlySet<number>;
  /** How much of each split element's content earlier parts hold. */
  readonly before: Map<string, number>;
}

function linesOf(
  reading: Reading,
  node: ProseMirrorNode,
  at: { pos: number; scope: string | null },
) {
  if (reading.numbered.has(at.pos)) return { lines: null, reason: 'numbered paragraph' };
  const prefix = isContinued(node) ? undefined : reading.headings.get(at.pos);
  const table = reading.engine.lines(node, { scope: at.scope, prefix });
  if (!table) return { lines: null, reason: 'not laid out by the engine' };
  return { lines: table.lines.map(({ from, to }) => ({ from, to })) };
}

function blockOf(
  reading: Reading,
  node: ProseMirrorNode,
  at: { pos: number; scope: string | null },
): BlockTextLines {
  const id: unknown = node.attrs.dataId;
  const elementId = typeof id === 'string' ? id : '';
  const start = elementId ? (reading.before.get(elementId) ?? 0) : 0;
  if (elementId) reading.before.set(elementId, start + node.content.size);
  const { lines, reason } = linesOf(reading, node, at);
  return {
    elementId,
    part: Number(node.attrs.splitPartIndex ?? 0),
    type: node.type.name,
    pos: at.pos,
    start,
    lines:
      lines?.map(({ from, to }) => ({
        from: from + start,
        to: to + start,
        text: ownText(node, from, to),
      })) ?? null,
    ...(reason ? { reason } : {}),
  };
}

// A block's own text between two content offsets: its text nodes', none of its inline atoms'.
function ownText(node: ProseMirrorNode, from: number, to: number): string {
  let text = '';
  node.nodesBetween(from, to, (child, pos) => {
    if (child.isText) text += (child.text ?? '').slice(Math.max(0, from - pos), to - pos);
    return !child.isAtom;
  });
  return text;
}

/** The lines a pages' state draws its top-level paragraphs and headings on; none without forced lines. */
export function pageTextLines(state: EditorState): PageTextLines[] {
  const engine = (forcedLinesKey.getState(state) as ForcedLinesState | undefined)?.engine;
  if (!engine) return [];
  const { headings, paragraphs } = engine.numbering(state.doc);
  const reading: Reading = { engine, headings, numbered: paragraphs, before: new Map() };
  const pages: PageTextLines[] = [];
  let scope: string | null = null;
  let blocks: BlockTextLines[] = [];
  state.doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === 'page_section') scope = sectionScope(node);
    if (name === 'page') {
      blocks = [];
      pages.push({ blocks });
    }
    if (parent?.type.name !== 'page_content')
      return name !== 'page_header' && name !== 'page_footer';
    if (FORCED_TYPES.has(name)) blocks.push(blockOf(reading, node, { pos, scope }));
    return false;
  });
  return pages;
}
