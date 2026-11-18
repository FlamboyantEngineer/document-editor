// Inserting a code block after its empty caption, from the text selected or where a new block goes.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import { createCodeFigure } from '../model/schema/caption-content.js';
import { placeBlockAt } from './block-place.js';
import { newBlockRange } from './tables.js';

// The text blocks the selection covers, as one range of the page's body, when they are all
// top-level or in the same parent; null otherwise.
function selectedBlocks(state: EditorState) {
  const { $from, $to, empty } = state.selection;
  if (empty || !$from.parent.isTextblock || !$to.parent.isTextblock) return null;
  const from = $from.before();
  const to = $to.after();
  const shared = $from.node($from.depth - 1) === $to.node($to.depth - 1);
  return shared ? { from, to } : null;
}

// Puts a code block in place of the blocks selected, or where a new block goes; where it starts.
function placeCode(state: EditorState, figure: ProseMirrorNode, selected: boolean) {
  const { from, to } = state.selection;
  const tr = selected ? state.tr.delete(from, to) : state.tr;
  if (selected) return { tr, at: placeBlockAt(tr, tr.mapping.map(from), figure) };
  const range = newBlockRange(state);
  if (range) tr.replaceWith(range.from, range.to, figure);
  return { tr, at: range?.from ?? null };
}

/**
 * Inserts a code block after its empty caption: holding exactly the text selected, line by line,
 * which leaves the text it came from, or empty where a new block goes, with the caret at the end of
 * its code.
 */
export function insertCodeBlock(language = 'plaintext'): Command {
  return (state, dispatch) => {
    const selected = selectedBlocks(state) !== null;
    const { from, to } = state.selection;
    const text = selected ? state.doc.textBetween(from, to, '\n', ' ') : '';
    const code = state.schema.nodes.code_block?.create(
      { language },
      text ? state.schema.text(text) : null,
    );
    const figure = code && createCodeFigure(state.schema, code);
    if (!figure) return false;
    const { tr, at } = placeCode(state, figure, selected);
    if (at === null) return false;
    if (dispatch) {
      // Inside the code block, after the caption: the holder, its caption, then the code's start.
      const inside = at + 1 + (figure.firstChild?.nodeSize ?? 0) + 1;
      tr.setSelection(TextSelection.create(tr.doc, inside + text.length));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
