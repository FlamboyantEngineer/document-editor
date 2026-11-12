// The paged projection spike (PG-40, P0-9): the canonical state holds the whole document, with no
// view, and takes every edit and the undo history. A read-only projection view shows it on pages;
// its dispatch takes only layouts and edits mirrored from the canonical state. A hidden ghost view
// renders the canonical document to measure it.
//
// Input on the projection reaches the canonical state two ways. Keys that edit (Enter, Backspace,
// Delete, undo, redo, marks) and paste run as commands on the canonical state, with its selection
// mirrored from the projection's. Changes the browser makes in the DOM (typing, IME composition,
// spellcheck replacements, drag and drop) arrive as projection transactions: each step is mapped to
// the canonical state through the page transform, and paired with it, so the DOM is never redrawn
// under the writer. Every canonical change is mirrored back onto the projection at once; the pages
// are laid out again once the writer pauses.

import { baseKeymap, chainCommands, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keydownHandler } from 'prosemirror-keymap';
import type { Node as ProseMirrorNode, Slice } from 'prosemirror-model';
import {
  AllSelection,
  type Command,
  EditorState,
  NodeSelection,
  Plugin,
  type Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { cellAround, CellSelection, columnResizing, TableMap } from 'prosemirror-tables';
import { ReplaceAroundStep, type Step } from 'prosemirror-transform';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { projectDocument, repaginate, sameStructure } from '../../../src/model/index.js';
import { createMeasureCache, layoutDocument } from '../../../src/pagination/index.js';
import { readDomSelection } from '../../../src/utils/dom-selection.js';
import { ProjectionMap } from './projection-map.js';

/** How the projection editor is set up. */
export interface ProjectionEditorOptions {
  /** Where the projection view mounts. */
  readonly mount: HTMLElement;
  /** Where the hidden ghost view that measures mounts, at the page content's width. */
  readonly measureIn: HTMLElement;
  /** The document, paged or whole. */
  readonly doc: ProseMirrorNode;
  readonly pageHeight: number;
  /** Milliseconds without an edit before the pages are laid out again; 150 by default. */
  readonly settle?: number;
  /** Called after each layout. */
  readonly onLayout?: (editor: ProjectionEditor) => void;
}

/** What the spike counts, for its findings. */
export interface SpikeStats {
  layouts: number;
  layoutMs: number[];
  /** Canonical transactions from commands, and from mapped DOM changes. */
  commands: number;
  domChanges: number;
  /** Edits whose steps could not be mirrored, which laid the pages out at once instead. */
  resyncs: number;
  /** Layouts after which the projection's pages did not join into the canonical document. */
  outOfSync: number;
  /** Edits refused on the projection because a step did not map. */
  refused: number;
  /** Selections mirrored from the projection to the canonical state. */
  selections: number;
  /** The longest the map grew between layouts, in steps. */
  longestMap: number;
  /** Maps rebuilt from the page transform after an edit at a page break, and their times. */
  rebuilds: number;
  rebuildMs: number[];
}

/** The spike's editor: the canonical state, the projection and the ghost. */
export interface ProjectionEditor {
  readonly canonical: EditorState;
  readonly projection: EditorView;
  readonly ghost: EditorView;
  readonly map: ProjectionMap;
  readonly stats: SpikeStats;
  /** Lays the pages out now. */
  layout(): void;
  destroy(): void;
}

const MIRROR = 'projection-spike';

type Origin = 'layout' | 'mirror';

// Moves the ghost onto the canonical document by the smallest replacement, so unchanged blocks
// keep their rendering and cached measurements.
function follow(ghost: EditorView, whole: ProseMirrorNode): void {
  const { state } = ghost;
  const current = state.doc;
  const start = current.content.findDiffStart(whole.content);
  if (start === null) return;
  const end = current.content.findDiffEnd(whole.content);
  let endA = end?.a ?? current.content.size;
  let endB = end?.b ?? whole.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  const tr = state.tr.replace(start, endA, whole.slice(start, endB));
  ghost.updateState(
    tr.doc.eq(whole) ? state.apply(tr) : EditorState.create({ doc: whole, plugins: state.plugins }),
  );
}

// Deletes the character before or after an empty selection inside a textblock, which the browser
// would do natively; the canonical state has no DOM to do it.
function deleteCharacter(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const { $cursor } = state.selection as TextSelection;
    if (!$cursor) return false;
    const pos = $cursor.pos;
    const edge = direction < 0 ? $cursor.start() : $cursor.end();
    if (pos === edge) return false;
    const text = state.doc.textBetween(
      Math.min(pos, pos + direction * 2),
      Math.max(pos, pos + direction * 2),
    );
    const pair = text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text);
    const width = pair ? 2 : 1;
    const [from, to] = direction < 0 ? [pos - width, pos] : [pos, pos + width];
    dispatch?.(state.tr.delete(from, to).scrollIntoView());
    return true;
  };
}

// Whether a position is at the start or end of a split block's part, where both sides of a page
// break are one canonical position. Edits there rebuild the map rather than extend it: two edits at
// one canonical position, one on each side of the break, leave their order to the edges of the
// extended map's ranges, which do not keep it.
function atBreak(doc: ProseMirrorNode, pos: number): boolean {
  if (pos < 0 || pos > doc.content.size) return false;
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return false;
  if ($pos.parentOffset !== 0 && $pos.parentOffset !== $pos.parent.content.size) return false;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (typeof $pos.node(depth).attrs.splitPartIndex === 'number') return true;
  }
  return false;
}

const stepRange = (step: Step): { from: number; to: number } | null => {
  const range = step as unknown as { from?: unknown; to?: unknown };
  return typeof range.from === 'number' && typeof range.to === 'number'
    ? { from: range.from, to: range.to }
    : null;
};

const touchesBreak = (step: Step, doc: ProseMirrorNode): boolean => {
  const range = stepRange(step);
  return Boolean(range && (atBreak(doc, range.from) || atBreak(doc, range.to)));
};

const isColumnWidthChange = (tr: Transaction): boolean =>
  tr.steps.length > 0 &&
  tr.steps.every((step) => {
    if (!(step instanceof ReplaceAroundStep)) return false;
    const { from } = step as unknown as { from: number };
    const before = tr.before.nodeAt(from);
    return before?.type.spec.tableRole === 'cell' || before?.type.spec.tableRole === 'header_cell';
  });

/** Creates the spike's editor on a document. */
export function createProjectionEditor(options: ProjectionEditorOptions): ProjectionEditor {
  const settle = options.settle ?? 150;
  const cache = createMeasureCache();
  const stats: SpikeStats = {
    layouts: 0,
    layoutMs: [],
    commands: 0,
    domChanges: 0,
    resyncs: 0,
    outOfSync: 0,
    refused: 0,
    selections: 0,
    longestMap: 0,
    rebuilds: 0,
    rebuildMs: [],
  };

  const initial = ProjectionMap.of(options.doc);
  let map = initial.map;
  let canonical = EditorState.create({ doc: initial.whole, plugins: [history()] });
  // After a cell drag, the canonical cell selection stands until the next press: the projection's
  // own selection, which the browser moves during the drag, does not reach the canonical state.
  let cellsHeld = false;

  const ghost = new EditorView(options.measureIn, {
    state: EditorState.create({ doc: canonical.doc }),
    editable: () => false,
  });

  const selectionPlugin = new Plugin({
    props: {
      decorations(state) {
        const selection = canonical.selection;
        if (!(selection instanceof CellSelection) || state.doc !== map.projection) return null;
        const decorations: Decoration[] = [];
        selection.forEachCell((cell, pos) => {
          const at = map.toProjection(pos, 1);
          const node = at === null ? null : state.doc.nodeAt(at);
          if (at !== null && node?.type === cell.type) {
            decorations.push(Decoration.node(at, at + node.nodeSize, { class: 'selectedCell' }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });

  // The projection position of a canonical one nearest `near`, where a page break gives two.
  const nearest = (pos: number, near: number): number | null => {
    const before = map.toProjection(pos, -1);
    const after = map.toProjection(pos, 1);
    if (before === null || after === null) return before ?? after;
    return Math.abs(before - near) <= Math.abs(after - near) ? before : after;
  };

  // The canonical selection as a projection selection, near where the projection's was.
  function projectionSelection(doc: ProseMirrorNode, near: Selection): Selection {
    const selection = canonical.selection;
    if (selection instanceof AllSelection) return new AllSelection(doc);
    if (selection instanceof CellSelection) {
      const head = map.toProjection(selection.$headCell.pos + 1, 1);
      return TextSelection.near(doc.resolve(head ?? near.head));
    }
    if (selection instanceof NodeSelection) {
      const at = map.toProjection(selection.from, 1);
      if (at !== null && doc.nodeAt(at)?.type === selection.node.type) {
        return NodeSelection.create(doc, at);
      }
    }
    const anchor = nearest(selection.anchor, near.anchor);
    const head = nearest(selection.head, near.head);
    if (anchor === null || head === null) return TextSelection.near(doc.resolve(near.head));
    return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
  }

  // The projection selection as a canonical one.
  function canonicalSelection(selection: Selection, doc: ProseMirrorNode): Selection | null {
    if (selection instanceof AllSelection) return new AllSelection(doc);
    if (selection instanceof NodeSelection) {
      const at = map.toCanonical(selection.from, 1);
      const node = at === null ? null : doc.nodeAt(at);
      return at !== null && node?.type === selection.node.type
        ? NodeSelection.create(doc, at)
        : null;
    }
    const anchor = map.toCanonical(selection.anchor, 1);
    const head = map.toCanonical(selection.head, 1);
    if (anchor === null || head === null) return null;
    return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
  }

  const dispatchProjection = (tr: Transaction, origin: Origin) => {
    projection.dispatch(tr.setMeta(MIRROR, origin));
  };

  // Mirrors a canonical transaction onto the projection, step by step; false when a step cannot be
  // mirrored, and the pages are then laid out at once.
  function commitCanonical(tr: Transaction): void {
    canonical = canonical.apply(tr);
    if (!tr.docChanged) {
      dispatchProjection(projection.state.tr, 'mirror');
      return;
    }
    const ptr = projection.state.tr;
    let mirrored = true;
    let rebuild = false;
    tr.steps.forEach((step, index) => {
      if (!mirrored) return;
      const after = tr.docs[index + 1] ?? tr.doc;
      const result = map.mirror(step, after);
      if (!result) {
        mirrored = false;
        return;
      }
      for (const each of result.steps) {
        rebuild ||= touchesBreak(each, ptr.doc);
        ptr.step(each);
      }
      map = result.map;
    });
    if (mirrored && rebuild) rebuildMap(ptr.doc);
    if (!mirrored) {
      stats.resyncs += 1;
      layout();
      return;
    }
    stats.longestMap = Math.max(stats.longestMap, map.length);
    const near = projection.state.selection.map(ptr.doc, ptr.mapping);
    ptr.setSelection(projectionSelection(ptr.doc, near));
    dispatchProjection(ptr.scrollIntoView(), 'mirror');
    requestLayout();
  }

  function rebuildMap(doc: ProseMirrorNode): void {
    const started = performance.now();
    map = ProjectionMap.of(doc).map;
    stats.rebuilds += 1;
    stats.rebuildMs.push(performance.now() - started);
  }

  // Runs a command on the canonical state, with the projection's selection mirrored there first.
  function runCanonical(command: Command): boolean {
    readDomSelection(projection);
    syncSelection(projection.state.selection);
    cellsHeld = false;
    let ran = false;
    command(canonical, (tr) => {
      ran = true;
      stats.commands += 1;
      commitCanonical(tr);
    });
    return ran;
  }

  function syncSelection(selection: Selection): void {
    if (cellsHeld) return;
    const mapped = canonicalSelection(selection, canonical.doc);
    if (!mapped || mapped.eq(canonical.selection)) return;
    stats.selections += 1;
    canonical = canonical.apply(canonical.tr.setSelection(mapped));
  }

  // A projection edit made by the browser in the DOM: each step mapped onto the canonical state and
  // paired with it. A step in a repeated header row is mirrored back instead, so every copy and the
  // first part's row take it.
  function routeDomChange(tr: Transaction): void {
    if (isColumnWidthChange(tr)) {
      routeColumnWidth(tr);
      return;
    }
    // The browser may have moved the caret without a selection change reaching the canonical state,
    // as at the end of a composition.
    syncSelection(projection.state.selection);
    const ctr = canonical.tr;
    const ptr = projection.state.tr;
    let failed = false;
    let rebuild = false;
    tr.steps.forEach((step, index) => {
      if (failed) return;
      const routed = map.mapStep(step, 'toCanonical');
      if (!routed || ctr.maybeStep(routed).failed) {
        failed = true;
        return;
      }
      rebuild ||= touchesBreak(step, tr.docs[index] ?? tr.before);
      const target = tr.docs[index + 1] ?? tr.doc;
      const echo = map.mirror(routed, ctr.doc);
      const applied = step.apply(ptr.doc);
      if (echo && (echo.projection.eq(target) || echo.steps.length > 1)) {
        for (const each of echo.steps) ptr.step(each);
        map = echo.map;
      } else if (applied.doc) {
        ptr.step(step);
        map = map.advance(step, ptr.doc, routed, ctr.doc);
      } else failed = true;
    });
    if (failed) {
      stats.refused += 1;
      // The DOM shows an edit the canonical state did not take: draw the projection again.
      dispatchProjection(projection.state.tr, 'mirror');
      projection.updateState(projection.state);
      return;
    }
    stats.domChanges += 1;
    if (rebuild) rebuildMap(ptr.doc);
    const selection = ptr.doc.eq(tr.doc)
      ? TextSelection.between(
          ptr.doc.resolve(tr.selection.anchor),
          ptr.doc.resolve(tr.selection.head),
        )
      : tr.selection.map(ptr.doc, ptr.mapping);
    ptr.setSelection(selection);
    // A selection that only followed the edit, as typing's does, follows it on the canonical state
    // too; at a page break, mapping it across could put it on the wrong side of the new text.
    const followed = tr.selection.eq(projection.state.selection.map(tr.doc, tr.mapping));
    const mapped = followed ? null : canonicalSelection(selection, ctr.doc);
    if (mapped) ctr.setSelection(mapped);
    canonical = canonical.apply(ctr);
    stats.longestMap = Math.max(stats.longestMap, map.length);
    for (const [key, value] of Object.entries(
      (tr as unknown as { meta: Record<string, unknown> }).meta,
    )) {
      ptr.setMeta(key, value);
    }
    dispatchProjection(ptr, 'mirror');
    requestLayout();
  }

  // A column resized on one part of a split table: the canonical table's column takes the width, so
  // every part does.
  function routeColumnWidth(tr: Transaction): void {
    const { from } = tr.steps[0] as unknown as { from: number };
    const before = tr.before.nodeAt(from);
    const after = tr.doc.nodeAt(from);
    const $cell = tr.doc.resolve(from);
    const fragment = $cell.parent.type.spec.tableRole === 'row' ? $cell.node(-1) : null;
    if (!before || !after || fragment?.type.spec.tableRole !== 'table') return;
    const widths = (node: ProseMirrorNode) => (node.attrs.colwidth as number[] | null) ?? [];
    const changed = widths(after).findIndex((width, index) => width !== widths(before)[index]);
    const width = widths(after)[changed];
    if (changed < 0 || width === undefined) return;
    const column = TableMap.get(fragment).findCell(from - $cell.start(-1)).left + changed;
    const at = map.toCanonical(from + 1, 1);
    if (at === null) return;
    const $canonical = canonical.doc.resolve(at);
    let depth = $canonical.depth;
    while (depth > 0 && $canonical.node(depth).type.spec.tableRole !== 'table') depth -= 1;
    const table = $canonical.node(depth);
    const start = $canonical.start(depth);
    const tableMap = TableMap.get(table);
    const ctr = canonical.tr;
    for (let row = 0; row < tableMap.height; row += 1) {
      const index = row * tableMap.width + column;
      if (row && tableMap.map[index] === tableMap.map[index - tableMap.width]) continue;
      const pos = tableMap.map[index];
      const node = pos === undefined ? null : table.nodeAt(pos);
      if (!node || pos === undefined) continue;
      const span = node.attrs.colspan as number;
      const colwidth = [...(widths(node).length ? widths(node) : Array<number>(span).fill(0))];
      colwidth[column - tableMap.colCount(pos)] = width;
      ctr.setNodeMarkup(start + pos, null, { ...node.attrs, colwidth });
    }
    stats.commands += 1;
    commitCanonical(ctr);
  }

  // Starts a cell selection that may cross the parts of a split table, on the canonical table.
  function cellAt(view: EditorView, event: MouseEvent): number | null {
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!found) return null;
    const $cell = cellAround(view.state.doc.resolve(found.pos));
    if (!$cell) return null;
    const at = map.toCanonical($cell.pos + 1, 1);
    const $canonical = at === null ? null : cellAround(canonical.doc.resolve(at));
    return $canonical ? $canonical.pos : null;
  }

  function startCellDrag(view: EditorView, event: MouseEvent): void {
    const anchor = cellAt(view, event);
    if (anchor === null || event.button !== 0) return;
    const owner = view.dom.ownerDocument;
    let dragging = false;
    const move = (moved: MouseEvent) => {
      const head = cellAt(view, moved);
      if (head === null || (!dragging && head === anchor)) return;
      const $anchor = canonical.doc.resolve(anchor);
      const $head = canonical.doc.resolve(head);
      if ($anchor.node(-1) !== $head.node(-1)) return;
      dragging = true;
      cellsHeld = true;
      moved.preventDefault();
      owner.getSelection()?.removeAllRanges();
      canonical = canonical.apply(canonical.tr.setSelection(new CellSelection($anchor, $head)));
      dispatchProjection(projection.state.tr, 'mirror');
    };
    const up = () => {
      owner.removeEventListener('mousemove', move);
      owner.removeEventListener('mouseup', up);
    };
    owner.addEventListener('mousemove', move);
    owner.addEventListener('mouseup', up);
  }

  const onCanonical =
    (command: Command): Command =>
    () =>
      runCanonical(command);
  const { schema } = canonical;
  const keys = keydownHandler({
    Enter: onCanonical(baseKeymap.Enter ?? (() => false)),
    Backspace: onCanonical(
      chainCommands(baseKeymap.Backspace ?? (() => false), deleteCharacter(-1)),
    ),
    Delete: onCanonical(chainCommands(baseKeymap.Delete ?? (() => false), deleteCharacter(1))),
    'Mod-z': onCanonical(undo),
    'Mod-y': onCanonical(redo),
    'Shift-Mod-z': onCanonical(redo),
    ...(schema.marks.bold ? { 'Mod-b': onCanonical(toggleMark(schema.marks.bold)) } : {}),
    ...(schema.marks.italic ? { 'Mod-i': onCanonical(toggleMark(schema.marks.italic)) } : {}),
    ArrowLeft: () => crossBreak(-1, false),
    ArrowRight: () => crossBreak(1, false),
    'Shift-ArrowLeft': () => crossBreak(-1, true),
    'Shift-ArrowRight': () => crossBreak(1, true),
  });

  // An arrow key at a page break inside a split block: both sides of the break are one canonical
  // position, so the browser's move would not move the canonical caret. Moves it a character on.
  function crossBreak(direction: -1 | 1, extend: boolean): boolean {
    // The browser may not have reported the caret an earlier key moved yet.
    readDomSelection(projection);
    const { state } = projection;
    const { head } = state.selection;
    if (!extend && !state.selection.empty) return false;
    const $head = state.doc.resolve(head);
    const atEdge = direction > 0 ? $head.pos === $head.end() : $head.pos === $head.start();
    if (!atEdge || !$head.parent.isTextblock) return false;
    const at = map.toCanonical(head, 1);
    if (at === null) return false;
    const twin = map.toProjection(at, direction);
    if (twin === null || twin === head) return false;
    const $at = canonical.doc.resolve(at);
    const next = at + direction;
    if (next < $at.start() || next > $at.end()) return false;
    const target = map.toProjection(next, direction);
    if (target === null) return false;
    const anchor = extend ? state.selection.anchor : target;
    projection.dispatch(
      state.tr.setSelection(
        TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(target)),
      ),
    );
    return true;
  }

  const projection: EditorView = new EditorView(options.mount, {
    state: EditorState.create({
      doc: options.doc,
      plugins: [selectionPlugin, columnResizing({ cellMinWidth: 40, View: null })],
    }),
    handleKeyDown(view, event) {
      if (view.composing || event.isComposing) return false;
      const handled = keys(view, event);
      if (!handled && !event.shiftKey && event.key.startsWith('Arrow')) cellsHeld = false;
      return handled;
    },
    handlePaste(_view, _event, slice: Slice) {
      return runCanonical((state, dispatch) => {
        dispatch?.(state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      });
    },
    handleDOMEvents: {
      mousedown(view, event) {
        cellsHeld = false;
        startCellDrag(view, event);
        return false;
      },
    },
    dispatchTransaction(tr) {
      const origin = tr.getMeta(MIRROR) as Origin | undefined;
      if (!origin && tr.docChanged) {
        routeDomChange(tr);
        return;
      }
      const before = projection.state.selection;
      projection.updateState(projection.state.apply(tr));
      if (!origin && !projection.state.selection.eq(before))
        syncSelection(projection.state.selection);
    },
  });

  // Lays the pages out from the ghost, steps the projection onto them and starts the map over.
  function layout(): void {
    timer.cancel();
    if (projection.isDestroyed) return;
    if (projection.composing) {
      requestLayout();
      return;
    }
    const started = performance.now();
    follow(ghost, canonical.doc);
    const sections = layoutDocument(ghost, { pageHeight: options.pageHeight, cache });
    const target = projectDocument(ghost.state.doc, sections);
    const ptr = projection.state.tr;
    repaginate(ptr, target);
    const rebuilt = ProjectionMap.of(ptr.doc);
    map = rebuilt.map;
    if (!sameStructure(rebuilt.whole, canonical.doc)) stats.outOfSync += 1;
    ptr.setSelection(
      projectionSelection(ptr.doc, projection.state.selection.map(ptr.doc, ptr.mapping)),
    );
    dispatchProjection(ptr, 'layout');
    stats.layouts += 1;
    stats.layoutMs.push(performance.now() - started);
    options.onLayout?.(editor);
  }

  const timer = (() => {
    const edits = { first: 0, handle: 0 };
    const check = () => {
      const now = performance.now();
      edits.handle = 0;
      if (now - edits.first >= settle * 4 || now - last >= settle) {
        edits.first = 0;
        requestAnimationFrame(layout);
      } else edits.handle = window.setTimeout(check, settle - (now - last));
    };
    let last = 0;
    return {
      request() {
        last = performance.now();
        if (!edits.first) edits.first = last;
        if (!edits.handle) edits.handle = window.setTimeout(check, settle);
      },
      cancel() {
        if (edits.handle) window.clearTimeout(edits.handle);
        edits.handle = 0;
        edits.first = 0;
      },
    };
  })();

  function requestLayout(): void {
    timer.request();
  }

  const editor: ProjectionEditor = {
    get canonical() {
      return canonical;
    },
    projection,
    ghost,
    get map() {
      return map;
    },
    stats,
    layout,
    destroy() {
      timer.cancel();
      projection.destroy();
      ghost.destroy();
    },
  };
  layout();
  return editor;
}
