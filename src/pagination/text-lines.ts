// The lines the pages draw each forced block on, page by page, read from the layout engine's
// result rather than from the DOM (DOCE-PAGINATION-11.3): what a test compares the drawn lines with.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { footnoteNumberOf, footnoteNumbersKey } from '../engine/footnote-numbers.js';
import { type ForcedBlock, forcedBlocksOf } from './forced-blocks.js';
import { forcedLinesKey, type ForcedLinesState, sectionScope } from './forced-lines.js';
import { FORCED_REGIONS, type ForcedRegion, regionBlocksOf } from './forced-regions.js';
import { insertedTexts } from './inserted-texts.js';
import { pageVariablesKey } from './page-variables.js';

/** A computed line of a block: content offsets in the whole block, and the text between them. */
export interface ComputedLine {
  readonly from: number;
  readonly to: number;
  /**
   * The line's text as the page draws it: footnote markers' numbers and template variables' values
   * in it, other inline atoms and hard breaks as nothing, as their text is not the writer's.
   */
  readonly text: string;
}

/** A text block of a page, and the lines the engine computed for it. */
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
  /** Whether it is inside a top-level block, such as a paragraph in a table's cell. */
  readonly nested?: true | undefined;
  /** The page region it is in, when it is in a header, footer or footnote area. */
  readonly region?: ForcedRegion | undefined;
}

/** A page's top-level text blocks, in order. */
export interface PageTextLines {
  readonly blocks: readonly BlockTextLines[];
}

interface Reading {
  /** How much of each split element's content earlier parts hold. */
  readonly before: Map<string, number>;
  /** The number the pages draw for the footnote marker at a position, if any. */
  readonly markerAt: (pos: number) => string;
  /** The value the pages draw for the template variable at a position, if any. */
  readonly variableAt: (pos: number) => string;
}

function blockOf(reading: Reading, block: ForcedBlock, region?: ForcedRegion): BlockTextLines {
  const { node, pos, table, reason } = block;
  const id: unknown = node.attrs.dataId;
  const elementId = typeof id === 'string' ? id : '';
  // A header's, footer's or footnote area's block is whole on the page it is drawn on.
  const split = Boolean(elementId) && !region;
  const start = split ? (reading.before.get(elementId) ?? 0) : 0;
  if (split) reading.before.set(elementId, start + node.content.size);
  return {
    elementId,
    part: Number(node.attrs.splitPartIndex ?? 0),
    type: node.type.name,
    pos,
    start,
    lines:
      table?.lines.map(({ from, to }) => ({
        from: from + start,
        to: to + start,
        text: ownText(node, {
          from,
          to,
          marker: (offset) => reading.markerAt(pos + 1 + offset),
          variable: (offset) => reading.variableAt(pos + 1 + offset),
        }),
      })) ?? null,
    ...(reason ? { reason } : {}),
    ...(block.nested ? { nested: true as const } : {}),
    ...(region ? { region } : {}),
  };
}

interface TextBetween {
  readonly from: number;
  readonly to: number;
  /** The number drawn for the footnote marker at a content offset. */
  readonly marker: (offset: number) => string;
  /** The value drawn for the template variable at a content offset. */
  readonly variable: (offset: number) => string;
}

// A block's own text between two content offsets: its text nodes', its footnote markers' numbers
// and its template variables' values, as the page draws them, none of its other inline atoms'.
function ownText(node: ProseMirrorNode, { from, to, marker, variable }: TextBetween): string {
  let text = '';
  node.nodesBetween(from, to, (child, pos) => {
    if (child.isText) text += (child.text ?? '').slice(Math.max(0, from - pos), to - pos);
    else if (child.type.name === 'footnote_reference') text += marker(pos);
    else if (child.type.name === 'template_variable') text += variable(pos) + child.textContent;
    return !child.isAtom && child.type.name !== 'template_variable';
  });
  return text;
}

/**
 * The lines a pages' state draws its forced blocks on, top-level paragraphs and headings and those
 * in tables (`forcedBlocksOf`); none without forced lines.
 */
export function pageTextLines(state: EditorState): PageTextLines[] {
  const engine = (forcedLinesKey.getState(state) as ForcedLinesState | undefined)?.engine;
  if (!engine) return [];
  const { headings, paragraphs } = engine.numbering(state.doc);
  const numbers = footnoteNumbersKey.getState(state)?.set;
  const markerAt = (pos: number) => {
    const number = numbers
      ? footnoteNumberOf(numbers.find(pos, pos + 1).filter((each) => each.from === pos))
      : null;
    return number === null ? '' : String(number);
  };
  const shown = pageVariablesKey.getState(state);
  // A variable's value is a widget at its content's start.
  const variableAt = (pos: number) => {
    const widget = shown?.find(pos + 1, pos + 1).find((each) => each.from === pos + 1);
    const text: unknown = (widget?.spec as { text?: unknown } | undefined)?.text;
    return typeof text === 'string' ? text : '';
  };
  const inserted = insertedTexts(state, [forcedLinesKey]);
  const reading: Reading = { before: new Map(), markerAt, variableAt };
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
    const region = FORCED_REGIONS.get(name);
    if (region) {
      for (const block of regionBlocksOf(engine, node, { pos, scope, shown }))
        blocks.push(blockOf(reading, block, region));
      return false;
    }
    if (parent?.type.name !== 'page_content') return true;
    const place = { pos, scope, headings, numbered: paragraphs, inserted };
    for (const block of forcedBlocksOf(engine, node, place)) blocks.push(blockOf(reading, block));
    return false;
  });
  return pages;
}
