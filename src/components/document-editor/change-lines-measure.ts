// Measures the lines of the blocks whose text changed, as the view shows them, and gives each line
// that changed the strongest kind of change on it: a line holds the words marked on it
// (`data-diff-line`), and a block whose formatting changed too marks its other lines as formatted.
// A kind the template's change bars leave out never counts, so it never hides a shown one.

import type { ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useState } from 'react';
import {
  type ChangeInsets,
  changeInsetsKeyOf,
  changeInsetsOf,
  type ChangeLine,
  type ChangeLineKind,
  type ChangeLines,
  changeLinesKeyOf,
  changeLinesOf,
  drawsChangeLines,
  setChangeLines,
  strongerChange,
  versionChanges,
} from '../../engine/index.js';
import { findTemplateSection, sectionAt, type TemplateFile } from '../../model/index.js';
import { measureChangeInsets } from './change-bar-insets.js';
import type { DocumentMarkup } from './editor-context.js';

interface Band {
  top: number;
  bottom: number;
}

// A pending suggestion's text, which the change bars markup bars on each line it is on.
const SUGGESTED = 'ins[data-id], del[data-id]';

// The lines' own drawing is not part of the block's lines.
const isDrawn = (node: Node) => Boolean(node.parentElement?.closest('.de-change-lines'));

// The boxes of the block's text and of the words marked in it, as the view lays them out.
function textBoxes(block: HTMLElement, marks: string): DOMRect[] {
  const owner = block.ownerDocument;
  const boxes: DOMRect[] = [];
  const walker = owner.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = owner.createRange();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (isDrawn(text)) continue;
    range.selectNodeContents(text);
    boxes.push(...range.getClientRects());
  }
  for (const marked of block.querySelectorAll(marks)) {
    if (!isDrawn(marked)) boxes.push(...markedBoxes(marked));
  }
  return boxes.filter((box) => box.height > 0);
}

// A marked word's boxes, or, for where text was deleted or text that does not show, the place it
// marks: the caret's place just before it.
function markedBoxes(marked: Element): DOMRect[] {
  const boxes = [...marked.getClientRects()];
  if (boxes.length) return boxes;
  const range = marked.ownerDocument.createRange();
  range.setStartBefore(marked);
  range.collapse(true);
  const place = range.getBoundingClientRect();
  return [place.height > 0 ? place : marked.getBoundingClientRect()];
}

// The block's lines, top to bottom, each reaching halfway to the next so the bars meet.
function lineBands(block: HTMLElement, marks: string): Band[] {
  const outer = block.getBoundingClientRect();
  const lines: Band[] = [];
  for (const box of textBoxes(block, marks).sort((one, other) => one.top - other.top)) {
    const last = lines.at(-1);
    const overlap = last ? Math.min(last.bottom, box.bottom) - Math.max(last.top, box.top) : 0;
    if (last && overlap > Math.min(last.bottom - last.top, box.height) / 2) {
      last.top = Math.min(last.top, box.top);
      last.bottom = Math.max(last.bottom, box.bottom);
    } else lines.push({ top: box.top, bottom: box.bottom });
  }
  if (!lines.length) return [{ top: outer.top, bottom: outer.bottom }];
  return lines.map((line, index) => ({
    top: index === 0 ? outer.top : ((lines[index - 1]?.bottom ?? line.top) + line.top) / 2,
    bottom:
      index === lines.length - 1
        ? outer.bottom
        : (line.bottom + (lines[index + 1]?.top ?? line.bottom)) / 2,
  }));
}

// The line a box is on: the band holding its middle, or the nearest.
function bandOf(bands: readonly Band[], box: DOMRect): number {
  const middle = (box.top + box.bottom) / 2;
  let nearest = 0;
  bands.forEach((band, index) => {
    const distance = (band: Band) => Math.abs((band.top + band.bottom) / 2 - middle);
    if (middle >= band.top && middle < band.bottom) nearest = index;
    else if (distance(band) < distance(bands[nearest] ?? band)) nearest = index;
  });
  return nearest;
}

// What marks a line's change: a word marked by its kind, or a deleted block's text shown in it.
const MARKED = '[data-diff-line], del[data-diff-block]';

// What marks a line in the change bars markup: a comparison's marks and pending suggestions.
const MARKED_WITH_SUGGESTIONS = `${MARKED}, ${SUGGESTED}`;

const kindOf = (marked: Element): ChangeLineKind => {
  if (marked.hasAttribute('data-diff-block')) return 'deletion';
  return (marked.getAttribute('data-diff-line') as ChangeLineKind | null) ?? 'suggestion';
};

// The change bar setting of each kind of line.
const SETTINGS = {
  modification: 'modifications',
  insertion: 'insertions',
  deletion: 'deletions',
  formatting: 'formatting',
} as const;

/** Which kinds of change show a bar: by default every kind. */
type ShownChange = (kind: ChangeLineKind) => boolean;

const SHOW_ALL: ShownChange = () => true;

/**
 * The kinds of change the template shows bars for where a position is: a kind shows unless the
 * position's section, or else the template, turns it off.
 */
export function shownChangesAt(template: TemplateFile, $pos: ResolvedPos): ShownChange {
  const section = sectionAt($pos);
  const name = section ? (section.name ?? '') : null;
  const own = findTemplateSection(template, name)?.changeBars;
  return (kind) => {
    // A pending suggestion is not a comparison's change: the template's settings leave it shown.
    if (kind === 'suggestion') return true;
    const setting = SETTINGS[kind];
    const enabled = own?.[setting]?.enabled ?? template.changeBars?.[setting]?.enabled;
    return enabled !== false;
  };
}

// The kind of change on each line: the strongest shown kind marked on it, at least the block's own.
function lineKinds(
  block: HTMLElement,
  bands: readonly Band[],
  { shown, marks }: { shown: ShownChange; marks: string },
): (ChangeLineKind | null)[] {
  const formatted = block.getAttribute('data-diff-lines') === 'formatting' && shown('formatting');
  const kinds: (ChangeLineKind | null)[] = bands.map(() => (formatted ? 'formatting' : null));
  const mark = (index: number, kind: ChangeLineKind) => {
    if (shown(kind)) kinds[index] = strongerChange(kinds[index] ?? null, kind);
  };
  const marked = [...block.querySelectorAll(marks)].filter((element) => !isDrawn(element));
  for (const element of marked) {
    for (const box of markedBoxes(element)) mark(bandOf(bands, box), kindOf(element));
  }
  // Blocks deleted before or after it, whose text does not show, mark its first or last line.
  const deleted = block.getAttribute('data-diff-deletion');
  if (deleted && !block.querySelector('del[data-diff-block]')) {
    mark(deleted === 'after' ? bands.length - 1 : 0, 'deletion');
  }
  return kinds;
}

/**
 * Measures one block's changed lines, from its top, unscaled by the zoom `scale`; a line whose
 * changes are all of kinds not `shown` has none.
 */
export function measureBlockLines(
  block: HTMLElement,
  {
    scale,
    shown = SHOW_ALL,
    suggestions = false,
  }: {
    readonly scale: number;
    readonly shown?: ShownChange | undefined;
    /** Whether lines holding a pending suggestion's text are barred too, as change bars markup does. */
    readonly suggestions?: boolean | undefined;
  },
): ChangeLine[] {
  const marks = suggestions ? MARKED_WITH_SUGGESTIONS : MARKED;
  const bands = lineBands(block, marks);
  const kinds = lineKinds(block, bands, { shown, marks });
  const top = block.getBoundingClientRect().top;
  return bands.flatMap((band, index) => {
    const kind = kinds[index];
    if (!kind) return [];
    return [{ kind, top: (band.top - top) / scale, height: (band.bottom - band.top) / scale }];
  });
}

// The text blocks to measure: each whose text a comparison changed and, in the change bars
// markup, each holding a pending suggestion's text, by position.
function blocksToMeasure(view: EditorView, suggestions: boolean): Map<number, HTMLElement> {
  const blocks = new Map<number, HTMLElement>();
  const { doc } = view.state;
  for (const block of view.dom.querySelectorAll<HTMLElement>('[data-diff-lines]')) {
    const pos = view.posAtDOM(block, 0) - 1;
    if (doc.nodeAt(pos)?.isTextblock) blocks.set(pos, block);
  }
  if (!suggestions) return blocks;
  for (const marked of view.dom.querySelectorAll(SUGGESTED)) {
    if (isDrawn(marked)) continue;
    const $pos = doc.resolve(view.posAtDOM(marked, 0));
    if (!$pos.parent.isTextblock || $pos.depth === 0) continue;
    const pos = $pos.before();
    const block = view.nodeDOM(pos);
    if (!blocks.has(pos) && block?.nodeType === 1) blocks.set(pos, block as HTMLElement);
  }
  return blocks;
}

/**
 * Measures the changed lines of every block whose text changed and, with `suggestions`, of every
 * block holding a pending suggestion, by the block's position, and where every barred block sits
 * in its page's content.
 */
function measureChangeLines(
  view: EditorView,
  options: {
    readonly scale: number;
    readonly template?: TemplateFile | undefined;
    readonly suggestions: boolean;
  },
): { lines: ChangeLines; insets: ChangeInsets } {
  const { scale, template, suggestions } = options;
  const lines = new Map<number, readonly ChangeLine[]>();
  const { doc } = view.state;
  const lined = blocksToMeasure(view, suggestions);
  for (const [pos, block] of lined) {
    const shown = template ? shownChangesAt(template, doc.resolve(pos)) : SHOW_ALL;
    lines.set(pos, measureBlockLines(block, { scale, shown, suggestions }));
  }
  return { lines, insets: measureChangeInsets(view, { scale, lined }) };
}

const NOTHING = { lines: new Map(), insets: new Map() } as const;

const drawnKeyOf = ({ lines, insets }: { lines: ChangeLines; insets: ChangeInsets }) =>
  `${changeLinesKeyOf(lines)}#${changeInsetsKeyOf(insets)}`;

// A count that grows each time the view's box changes size, which reflows its lines: once laid out
// at first, as a frame that was hidden shows, and as its width changes.
function useLayoutCount(view: EditorView | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || typeof owner?.ResizeObserver !== 'function') return undefined;
    const observer = new owner.ResizeObserver(() => setCount((value) => value + 1));
    observer.observe(view.dom);
    return () => observer.disconnect();
  }, [view]);
  return count;
}

/**
 * Measures the changed lines after each render while the document shows changes, or in the change
 * bars markup (`simple`) pending suggestions, and draws them (DOCE-VERSIONS-2.4, DOCE-EDITOR-6.5),
 * again whenever the view's box changes size.
 */
export function useChangeLines(
  view: EditorView | null,
  state: EditorState,
  {
    zoom,
    template,
    markup,
  }: {
    readonly zoom: number;
    readonly template?: TemplateFile | undefined;
    readonly markup: DocumentMarkup;
  },
) {
  const changes = versionChanges(state);
  const suggestions = markup === 'simple';
  const laidOut = useLayoutCount(view);
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner || !drawsChangeLines(view.state)) return undefined;
    const frame = owner.requestAnimationFrame(() => {
      if (view.isDestroyed) return;
      const drawn =
        changes.length || suggestions
          ? measureChangeLines(view, { scale: zoom / 100, template, suggestions })
          : NOTHING;
      const now = { lines: changeLinesOf(view.state), insets: changeInsetsOf(view.state) };
      if (drawnKeyOf(drawn) === drawnKeyOf(now)) return;
      view.dispatch(setChangeLines(view.state.tr, drawn.lines, drawn.insets));
    });
    return () => owner.cancelAnimationFrame(frame);
  }, [view, state, changes, zoom, template, suggestions, laidOut]);
}
