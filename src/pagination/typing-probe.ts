// Whether typing changed the height of the blocks it typed in, as the layout engine lays them out
// now: a keystroke that grew or shrank its block lays the pages out on the next frame, not once
// the writer pauses, so a paragraph that gained a line never runs past its page box for long; and
// typing that left every block it reached at its height, unsplit, needs no layout at the pause.
// Nothing drawn is read.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Step } from 'prosemirror-transform';
import { type ChangedRange, changedRanges, isTextStep } from '../utils/changed-ranges.js';
import { forcedLinesKey } from './forced-lines.js';
import { insertedTexts } from './inserted-texts.js';
import { frameIn } from './layout-triggers.js';
import type { ProjectionMap } from './projection-map.js';
import type { PagesTextEngine } from './text-engine-types.js';

// A block moved when its height differs from the laid-out one by more than this many pixels.
const MOVED = 0.5;

/**
 * The pages typing reads: their document, their map onto the canonical one, the state the pages are
 * laid out from moved onto the canonical document, and the engine.
 */
interface TypedPages {
  readonly projection: ProseMirrorNode;
  readonly map: ProjectionMap;
  readonly source: EditorState;
  readonly engine: PagesTextEngine | null;
}

/** What a typing probe reads: the pages, and what moved asks. */
interface TypingProbeOptions {
  readonly pages: () => TypedPages | null;
  /** Lays the pages out at once. */
  readonly moved: () => void;
  /** When the probe reads, by default on the next animation frame of the container's window. */
  readonly schedule?: ((run: () => void) => () => void) | undefined;
}

/** Follows the height of the blocks typing changes on the pages. */
export interface TypingProbe {
  /** Records how the pages were just laid out; what was typed before is forgotten. */
  laidOut(layout: { readonly heights: readonly (readonly number[])[] }): void;
  /** Takes a typed change of the pages, and reads on the next frame whether a block it reached moved. */
  request(tr: Transaction): void;
  /**
   * Whether everything typed since the latest layout was text inside paragraphs that kept their
   * text, are not split across pages, and are laid out at the height the latest layout gave them.
   */
  unchanged(): boolean;
  stop(): void;
}

/** A block of a page's content, or a part of one, and where it is on the pages. */
interface PageBlock {
  readonly node: ProseMirrorNode;
  readonly pos: number;
}

// The block of a page's content a range lies in, or null when it reaches past one.
function blockOf(doc: ProseMirrorNode, { from, to }: ChangedRange): PageBlock | null {
  const $from = doc.resolve(Math.min(from, doc.content.size));
  for (let depth = $from.depth; depth > 1; depth -= 1) {
    if ($from.node(depth).type.name !== 'page_content') continue;
    const index = $from.index(depth);
    const pos = $from.posAtIndex(index, depth);
    const node = $from.node(depth).maybeChild(index);
    if (!node || to > pos + node.nodeSize) return null;
    return { node, pos };
  }
  return null;
}

/** The pages as typing reads them, with the heights the latest layout gave each block, whole. */
interface Typed extends TypedPages {
  readonly engine: PagesTextEngine;
  readonly laid: readonly (readonly number[])[];
}

// The top-level block of a section's page content that holds a position: its node, its index among
// the section's blocks, its section's among the document's, and the section's scope.
function contentBlockAt(doc: ProseMirrorNode, pos: number) {
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  for (let depth = $pos.depth; depth > 1; depth -= 1) {
    if ($pos.node(depth).type.name !== 'page_content') continue;
    const index = $pos.index(depth);
    const node = $pos.node(depth).maybeChild(index);
    const scope = ($pos.node(1).attrs.sectionName as string | null | undefined) ?? null;
    let section = 0;
    for (let child = 0; child < $pos.index(0); child += 1) {
      if (doc.child(child).type.name === 'page_section') section += 1;
    }
    return node ? { node, index, section, scope } : null;
  }
  return null;
}

// Whether the canonical block a block of the pages is part of is laid out now at another height
// than the latest layout gave it, whole, beyond half a pixel: the whole block is compared whether
// or not it is split, since a split block's parts repeat its caption, header row or edges.
// It is laid out as the next layout lays it out, from the layout's source, which keeps it.
function heightMoved({ map, source, engine, laid }: Typed, block: PageBlock): boolean {
  const at = map.toCanonical(block.pos + 1, 1);
  const found = at === null ? null : contentBlockAt(source.doc, at);
  const before = found ? laid[found.section]?.[found.index] : undefined;
  if (!found || before === undefined) return true;
  engine.number(source.doc);
  const inserted = insertedTexts(source, [forcedLinesKey]);
  const now = engine.measureBlock(found.node, found.scope, inserted).height;
  return Math.abs(now - before) > MOVED;
}

// Whether a step types or deletes text inside a paragraph that has text before and after it, so it
// gains or loses no number and stays the block it was.
function typesText(step: Step, before: ProseMirrorNode | undefined, after: ProseMirrorNode) {
  if (!before || !isTextStep(step, before)) return false;
  const was = before.resolve(step.from).parent;
  const now = after.resolve(step.getMap().map(step.from)).parent;
  return was.type.name === 'paragraph' && was.textContent !== '' && now.textContent !== '';
}

/** A probe of the typed blocks' heights, on the frames of the window `container` is in. */
export function createTypingProbe(
  container: HTMLElement,
  options: TypingProbeOptions,
): TypingProbe {
  const schedule = options.schedule ?? frameIn(container);
  let laid: readonly (readonly number[])[] | null = null;
  let cancel: (() => void) | null = null;
  const typed = { ranges: [] as ChangedRange[], text: true };
  // Each block typed in, or null when one is past a page's content; and the pages they are on.
  const reached = () => {
    const pages = options.pages();
    if (!pages?.engine || !laid) return null;
    const blocks = typed.ranges.map((range) => blockOf(pages.projection, range));
    return { blocks, typed: { ...pages, engine: pages.engine, laid } };
  };
  const moved = () => {
    const read = reached();
    return read?.blocks.some((block) => !block || heightMoved(read.typed, block));
  };
  const probe = () => {
    cancel = null;
    if (moved()) options.moved();
  };
  return {
    laidOut(next) {
      laid = next.heights;
      Object.assign(typed, { ranges: [], text: true });
    },
    request(tr) {
      typed.ranges = typed.ranges.map(({ from, to }) => ({
        from: tr.mapping.map(from, -1),
        to: tr.mapping.map(to, 1),
      }));
      typed.ranges.push(...changedRanges([tr]));
      typed.text &&= tr.steps.every((step, index) =>
        typesText(step, tr.docs[index], tr.docs[index + 1] ?? tr.doc),
      );
      cancel ??= schedule(probe);
    },
    unchanged() {
      const read = reached();
      if (!read || !typed.text || typed.ranges.length === 0) return false;
      return read.blocks.every(
        (block) =>
          block !== null &&
          block.node.attrs.splitPartIndex == null &&
          !heightMoved(read.typed, block),
      );
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}
