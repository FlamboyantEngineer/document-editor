// Measures the lines of the blocks whose text changed, as the view shows them, and gives each line
// that changed the strongest kind of change on it: a line holds the words marked on it
// (`data-diff-line`), and a block whose formatting changed too marks its other lines as formatted.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect } from 'react';
import {
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

interface Band {
  top: number;
  bottom: number;
}

// The lines' own drawing is not part of the block's lines.
const isDrawn = (node: Node) => Boolean(node.parentElement?.closest('.de-change-lines'));

// The boxes of the block's text and of the words marked in it, as the view lays them out.
function textBoxes(block: HTMLElement): DOMRect[] {
  const owner = block.ownerDocument;
  const boxes: DOMRect[] = [];
  const walker = owner.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = owner.createRange();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (isDrawn(text)) continue;
    range.selectNodeContents(text);
    boxes.push(...range.getClientRects());
  }
  for (const marked of block.querySelectorAll(MARKED)) {
    if (!isDrawn(marked)) boxes.push(...markedBoxes(marked));
  }
  return boxes.filter((box) => box.height > 0);
}

// A marked word's boxes, or, for where text was deleted, the place it marks.
function markedBoxes(marked: Element): DOMRect[] {
  const boxes = [...marked.getClientRects()];
  return boxes.length ? boxes : [marked.getBoundingClientRect()];
}

// The block's lines, top to bottom, each reaching halfway to the next so the bars meet.
function lineBands(block: HTMLElement): Band[] {
  const outer = block.getBoundingClientRect();
  const lines: Band[] = [];
  for (const box of textBoxes(block).sort((one, other) => one.top - other.top)) {
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

const kindOf = (marked: Element): ChangeLineKind =>
  marked.hasAttribute('data-diff-block')
    ? 'deletion'
    : (marked.getAttribute('data-diff-line') as ChangeLineKind);

// The kind of change on each line: the strongest marked on it, at least the block's own.
function lineKinds(block: HTMLElement, bands: readonly Band[]): (ChangeLineKind | null)[] {
  const base = block.getAttribute('data-diff-lines') === 'formatting' ? 'formatting' : null;
  const kinds: (ChangeLineKind | null)[] = bands.map(() => base);
  const mark = (index: number, kind: ChangeLineKind) => {
    kinds[index] = strongerChange(kinds[index] ?? null, kind);
  };
  const marked = [...block.querySelectorAll(MARKED)].filter((element) => !isDrawn(element));
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

/** Measures one block's changed lines, from its top, unscaled by the zoom `scale`. */
export function measureBlockLines(block: HTMLElement, scale: number): ChangeLine[] {
  const bands = lineBands(block);
  const kinds = lineKinds(block, bands);
  const top = block.getBoundingClientRect().top;
  return bands.flatMap((band, index) => {
    const kind = kinds[index];
    if (!kind) return [];
    return [{ kind, top: (band.top - top) / scale, height: (band.bottom - band.top) / scale }];
  });
}

/** Measures the changed lines of every block whose text changed, by the block's position. */
export function measureChangeLines(view: EditorView, scale: number): ChangeLines {
  const lines = new Map<number, readonly ChangeLine[]>();
  for (const block of view.dom.querySelectorAll<HTMLElement>('[data-diff-lines]')) {
    const pos = view.posAtDOM(block, 0) - 1;
    if (view.state.doc.nodeAt(pos)?.isTextblock) lines.set(pos, measureBlockLines(block, scale));
  }
  return lines;
}

/** Measures the changed lines after each render while the document shows changes, and draws them. */
export function useChangeLines(view: EditorView | null, state: EditorState, zoom: number) {
  const changes = versionChanges(state);
  useEffect(() => {
    const owner = view?.dom.ownerDocument.defaultView;
    if (!view || !owner || !drawsChangeLines(view.state)) return undefined;
    const frame = owner.requestAnimationFrame(() => {
      if (view.isDestroyed) return;
      const lines = changes.length ? measureChangeLines(view, zoom / 100) : new Map();
      if (changeLinesKeyOf(lines) === changeLinesKeyOf(changeLinesOf(view.state))) return;
      view.dispatch(setChangeLines(view.state.tr, lines));
    });
    return () => owner.cancelAnimationFrame(frame);
  }, [view, state, changes, zoom]);
}
