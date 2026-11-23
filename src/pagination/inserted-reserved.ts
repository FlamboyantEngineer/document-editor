// The clusters of a word another plugin draws in the pages' text, such as a comparison's deleted
// word, that take a reserved width (DOCE-PAGINATION-12.4): the engine lays the word out with the
// measurer's reserve, so the pages draw each such cluster of the word in a box of that width, as
// the forced lines draw the content's (DOCE-PAGINATION-11.11). The boxes are found when the pages'
// decorations are built and are part of the widget's key, so a word whose boxes change, as when
// the engine is made, a face is served or its block's font changes, is drawn again.

import type { EditorState } from 'prosemirror-state';
import { Decoration, type DecorationSet, type EditorView } from 'prosemirror-view';
import type { ReservedBox } from '../layout-engine/reserved-boxes.js';
import { isElement } from '../utils/is-element.js';
import { forcedLinesKey, sectionScope } from './forced-lines.js';
import type { PagesTextEngine } from './text-engine-types.js';

/**
 * The reserved boxes of a word drawn at a position of the pages, by offset in the word; none
 * outside a text block, or when the pages are not laid out by the engine.
 */
export function insertedReservedBoxes(
  state: EditorState,
  pos: number,
  word: string,
): readonly ReservedBox[] {
  const engine = forcedLinesKey.getState(state)?.engine;
  if (!engine) return [];
  const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
  if (!$pos.parent.isTextblock) return [];
  let scope: string | null = null;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === 'page_section') scope = sectionScope(node);
  }
  return engine.insertedReserved($pos.parent, scope, word);
}

/** A word's text, each reserved cluster in a box of its width, as the forced lines draw one. */
export function drawReservedText(
  owner: Document,
  word: string,
  boxes: readonly ReservedBox[],
): Node[] {
  const nodes: Node[] = [];
  let at = 0;
  for (const box of boxes) {
    if (box.from > at) nodes.push(owner.createTextNode(word.slice(at, box.from)));
    const element = owner.createElement('span');
    element.className = 'de-forced-lines__reserved';
    element.style.setProperty('--de-reserved-width', `${box.width.toFixed(3)}px`);
    element.textContent = word.slice(box.from, box.to);
    nodes.push(element);
    at = box.to;
  }
  if (at < word.length) nodes.push(owner.createTextNode(word.slice(at)));
  return nodes;
}

type ToDom = (view: EditorView, getPos: () => number | undefined) => Node;

// What ProseMirror keeps of a widget and does not type: how it draws its element.
interface WidgetParts {
  readonly type: { readonly toDOM?: unknown };
}

const insertedWord = (spec: { insertedText?: unknown }) => typeof spec.insertedText === 'string';

// An inserted word's widget drawn again with its reserved clusters in boxes: its element keeps
// its text, the clusters inside spans of it, and the widget's key names the boxes.
function reservedWidget(widget: Decoration, boxes: readonly ReservedBox[]): Decoration | null {
  const toDOM = (widget as unknown as WidgetParts).type.toDOM;
  if (typeof toDOM !== 'function') return null;
  const spec = widget.spec as { insertedText: string; key?: unknown };
  const word = spec.insertedText;
  const token = boxes.map((box) => `${String(box.from)}:${box.width.toFixed(3)}`).join(',');
  const draw: ToDom = (view, getPos) => {
    const element = (toDOM as ToDom)(view, getPos);
    if (isElement(element) && element.textContent === word)
      element.replaceChildren(...drawReservedText(element.ownerDocument, word, boxes));
    return element;
  };
  const key = `${typeof spec.key === 'string' ? spec.key : word}|reserved:${token}`;
  return Decoration.widget(widget.from, draw, { ...spec, key });
}

// The sets drawn with their reserved words, by the engine they were found with.
const drawn = new WeakMap<DecorationSet, { engine: PagesTextEngine; set: DecorationSet }>();

/** A pages' set with each inserted word that has reserved clusters drawn with their boxes. */
export function withReservedWords(state: EditorState, set: DecorationSet): DecorationSet {
  const engine = forcedLinesKey.getState(state)?.engine;
  if (!engine) return set;
  const kept = drawn.get(set);
  if (kept?.engine === engine) return kept.set;
  const old: Decoration[] = [];
  const made: Decoration[] = [];
  for (const widget of set.find(undefined, undefined, insertedWord)) {
    const word = (widget.spec as { insertedText: string }).insertedText;
    const boxes = insertedReservedBoxes(state, widget.from, word);
    const redrawn = boxes.length ? reservedWidget(widget, boxes) : null;
    if (!redrawn) continue;
    old.push(widget);
    made.push(redrawn);
  }
  const result = made.length ? set.remove(old).add(state.doc, made) : set;
  drawn.set(set, { engine, set: result });
  return result;
}
