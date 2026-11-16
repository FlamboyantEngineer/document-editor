// Whether typing changed the height of the blocks it typed in, read on the pages: a keystroke that
// grew or shrank its block lays the pages out on the next frame, not once the writer pauses, so a
// paragraph that gained a line never runs past its page box for long; and typing that left every
// block it reached at its height, unsplit, needs no layout at the pause.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { Step } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { type ChangedRange, changedRanges, isTextStep } from '../utils/changed-ranges.js';
import type { PageMetric } from './layout-document.js';
import { frameIn } from './layout-triggers.js';

// A drawn block moved when its height differs from the laid-out one by more than this many pixels.
const MOVED = 0.5;

/** What a typing probe reads: the pages' view, how much it is scaled, and what moved asks. */
interface TypingProbeOptions {
  readonly view: () => EditorView | null;
  readonly scale?: (() => number) | undefined;
  /** Lays the pages out at once. */
  readonly moved: () => void;
  /** When the probe reads, by default on the next animation frame of the container's window. */
  readonly schedule?: ((run: () => void) => () => void) | undefined;
}

/** Follows the height of the blocks typing changes on the pages. */
export interface TypingProbe {
  /** Records how the pages were just laid out; what was typed before is forgotten. */
  laidOut(metrics: readonly PageMetric[]): void;
  /** Takes a typed change of the pages, and reads on the next frame whether a block it reached moved. */
  request(tr: Transaction): void;
  /**
   * Whether everything typed since the latest layout was text inside paragraphs that kept their
   * text, are not split across pages, and are drawn at the height the layout gave them.
   */
  unchanged(): boolean;
  stop(): void;
}

/** A block of a page's content: the page's index among all pages, and its own on that page. */
interface PageBlock {
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly page: number;
  readonly index: number;
}

// The index, among every page of the document, of the page at a position.
function pageIndexAt(doc: ProseMirrorNode, pagePos: number): number {
  let index = 0;
  let found = -1;
  doc.forEach((section, sectionOffset) => {
    if (found >= 0) return;
    section.forEach((page, pageOffset) => {
      if (found >= 0 || page.type.name !== 'page') return;
      if (sectionOffset + 1 + pageOffset === pagePos) found = index;
      index += 1;
    });
  });
  return found;
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
    return { node, pos, page: pageIndexAt(doc, $from.before(depth - 1)), index };
  }
  return null;
}

/** The pages as typing reads them: their view, how they were laid out and how much they are scaled. */
interface Drawn {
  readonly view: EditorView;
  readonly laid: readonly PageMetric[];
  readonly scale: number;
}

// Whether a block is drawn at another height than the layout gave it, beyond half a pixel.
function drawnMoved({ view, laid, scale }: Drawn, block: PageBlock): boolean {
  const height = laid[block.page]?.blocks[block.index];
  const element = view.nodeDOM(block.pos);
  if (height === undefined || element?.nodeType !== 1) return true;
  const drawn = (element as HTMLElement).getBoundingClientRect().height / scale;
  return Math.abs(drawn - height) > MOVED;
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
  let metrics: readonly PageMetric[] | null = null;
  let cancel: (() => void) | null = null;
  const typed = { ranges: [] as ChangedRange[], text: true };
  // Each block typed in, or null when one is past a page's content; and how much the view is scaled.
  const reached = () => {
    const view = options.view();
    if (!view || view.isDestroyed || !metrics) return null;
    const blocks = typed.ranges.map((range) => blockOf(view.state.doc, range));
    const scale = options.scale?.() ?? 1;
    return { view, blocks, laid: metrics, scale: scale > 0 ? scale : 1 };
  };
  const moved = () => {
    const read = reached();
    return read?.blocks.some((block) => !block || drawnMoved(read, block));
  };
  const probe = () => {
    cancel = null;
    if (moved()) options.moved();
  };
  return {
    laidOut(next) {
      metrics = next;
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
          block !== null && block.node.attrs.splitPartIndex == null && !drawnMoved(read, block),
      );
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}
