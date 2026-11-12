// The clipboard: one paste pipeline every paste and drop goes through, and the plain text a copy
// writes. A paste, or a drop that copies, brings in a copy: what a copy leaves behind is left out
// (`copyPastedSlice`). Content dragged within the document is moved, not copied, and keeps what it
// is. Then the registered filters fit what is pasted to where it lands, such as the rules of a
// footnote entry or the places a reference may go, for pastes and drops alike.

import type { Slice } from 'prosemirror-model';
import { type EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { cleanWordHtml, isWordHtml, type TemplateFile } from '../model/index.js';
import { copyPastedSlice } from './clipboard-copies.js';
import { copiedText, parsePastedText } from './clipboard-text.js';

/**
 * Fits a pasted slice to where it lands, given the state with the selection at that place; returns
 * the slice as it is when nothing needs to change.
 */
export type PasteFilter = (slice: Slice, state: EditorState) => Slice;

/** What the clipboard depends on. */
export interface ClipboardOptions {
  /** Filters run, in order, on every pasted and dropped slice. */
  readonly filters?: readonly PasteFilter[] | undefined;
  /** The resolved template, which numbers the headings copied text carries. */
  readonly template?: (() => TemplateFile) | undefined;
}

// Whether a drop of content dragged within the editor moves it: unless the platform's copy
// modifier is held, as ProseMirror decides.
function dropMoves(view: EditorView, event: DragEvent): boolean {
  const platform = view.dom.ownerDocument.defaultView?.navigator.platform ?? '';
  return !(/Mac|iP(hone|[oa]d)/.test(platform) ? event.altKey : event.ctrlKey);
}

// The state with the selection where a drop lands, which the filters read.
function stateAtDrop(view: EditorView, event: DragEvent): EditorState {
  const { state } = view;
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!at) return state;
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(at.pos))));
}

/**
 * The clipboard (DOCE-EDITING-5.1): one `transformPasted` pipeline for pastes and drops, word
 * processor HTML cleaned (DOCE-FORMAT-6.2), plain text read one paragraph per line, and copied
 * text with the numbers the reader sees.
 */
export function createClipboard({ filters = [], template }: ClipboardOptions = {}): Plugin {
  // The drop being handled, so the pipeline tells a drop from a paste and knows where it lands.
  let drop: DragEvent | null = null;
  return new Plugin({
    key: new PluginKey('clipboard'),
    props: {
      handleDOMEvents: {
        drop: (_view, event) => {
          drop = event;
          return false;
        },
        paste: () => {
          drop = null;
          return false;
        },
      },
      transformPastedHTML: (html, view) =>
        isWordHtml(html) ? cleanWordHtml(html, view.dom.ownerDocument) : html,
      clipboardTextParser: (text, $context) => parsePastedText(text, $context),
      clipboardTextSerializer: (slice, view) =>
        slice.eq(view.state.selection.content()) ? copiedText(view.state, { template }) : '',
      transformPasted: (slice, view) => {
        const dropped = drop;
        drop = null;
        const moved = Boolean(view.dragging && dropped && dropMoves(view, dropped));
        const state = dropped ? stateAtDrop(view, dropped) : view.state;
        const pasted = moved ? slice : copyPastedSlice(slice);
        return filters.reduce((current, filter) => filter(current, state), pasted);
      },
    },
  });
}
