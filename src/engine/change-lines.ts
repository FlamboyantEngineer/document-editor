// The change bars beside the lines of a block whose text changed: one bar for each line that
// changed, in the color of the strongest kind of change on it, measured by the view that shows them
// and drawn inside the block (`de-change-lines`), each bar placed by its measured top and height.

import { type EditorState, Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** The kinds of change a line shows, strongest first. */
export const CHANGE_LINE_KINDS = ['modification', 'insertion', 'deletion', 'formatting'] as const;

/** A kind of change a line shows. */
export type ChangeLineKind = (typeof CHANGE_LINE_KINDS)[number];

/** A line of a block that changed: its kind, and its top and height from the block's top. */
export interface ChangeLine {
  readonly kind: ChangeLineKind;
  /** In CSS pixels from the block's top, unscaled. */
  readonly top: number;
  readonly height: number;
}

/** The lines that changed, by the position of the block they are in. */
export type ChangeLines = ReadonlyMap<number, readonly ChangeLine[]>;

/** The stronger of two kinds of change on one line, by `CHANGE_LINE_KINDS`'s order. */
export function strongerChange(
  one: ChangeLineKind | null,
  other: ChangeLineKind | null,
): ChangeLineKind | null {
  if (!one || !other) return one ?? other;
  return CHANGE_LINE_KINDS.indexOf(one) <= CHANGE_LINE_KINDS.indexOf(other) ? one : other;
}

const changeLinesKey = new PluginKey<ChangeLines>('changeLines');

const NO_LINES: ChangeLines = new Map();

/** The lines a state shows bars beside. */
export function changeLinesOf(state: EditorState): ChangeLines {
  return changeLinesKey.getState(state) ?? NO_LINES;
}

/** Whether a state draws the bars beside changed lines. */
export function drawsChangeLines(state: EditorState): boolean {
  return changeLinesKey.getState(state) !== undefined;
}

/** Sets the lines measured, out of the undo history. */
export function setChangeLines(tr: Transaction, lines: ChangeLines): Transaction {
  return tr.setMeta(changeLinesKey, lines).setMeta('addToHistory', false);
}

/** What a set of lines reads as, for telling whether it changed. */
export function changeLinesKeyOf(lines: ChangeLines): string {
  return [...lines]
    .map(
      ([pos, found]) =>
        `${String(pos)}:${found
          .map((line) => `${line.kind}@${line.top.toFixed(1)}+${line.height.toFixed(1)}`)
          .join(',')}`,
    )
    .join('|');
}

// The lines kept where their blocks went, until they are measured again.
function mapLines(lines: ChangeLines, tr: Transaction): ChangeLines {
  if (!lines.size) return lines;
  const mapped = new Map<number, readonly ChangeLine[]>();
  for (const [pos, found] of lines) {
    const result = tr.mapping.mapResult(pos, 1);
    if (!result.deletedAfter) mapped.set(result.pos, found);
  }
  return mapped;
}

function drawLines(owner: Document, lines: readonly ChangeLine[]): HTMLElement {
  const holder = owner.createElement('span');
  holder.className = 'de-change-lines';
  holder.setAttribute('aria-hidden', 'true');
  holder.contentEditable = 'false';
  for (const line of lines) {
    const bar = owner.createElement('span');
    bar.className = 'de-change-lines__line';
    bar.setAttribute('data-diff-line', line.kind);
    bar.style.setProperty('--de-change-line-top', `${String(line.top)}px`);
    bar.style.setProperty('--de-change-line-height', `${String(line.height)}px`);
    holder.append(bar);
  }
  return holder;
}

function decorate(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  for (const [pos, lines] of changeLinesOf(state)) {
    const node = pos < state.doc.content.size ? state.doc.nodeAt(pos) : null;
    if (!node?.isTextblock || !lines.length) continue;
    decorations.push(
      Decoration.widget(pos + 1, (view) => drawLines(view.dom.ownerDocument, lines), {
        side: -1,
        marks: [],
        ignoreSelection: true,
        key: `lines-${changeLinesKeyOf(new Map([[pos, lines]]))}`,
      }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

/**
 * Draws the bars beside the lines that changed, as `setChangeLines` sets them, kept where their
 * blocks go until they are set again.
 */
export function createChangeLines(): Plugin<ChangeLines> {
  return new Plugin<ChangeLines>({
    key: changeLinesKey,
    state: {
      init: () => NO_LINES,
      apply: (tr, value) => {
        const set = tr.getMeta(changeLinesKey) as ChangeLines | undefined;
        if (set) return set;
        return tr.docChanged ? mapLines(value, tr) : value;
      },
    },
    props: { decorations: decorate },
  });
}
