// Streaming text into a live document as an agent writes it: each piece goes in after the text
// streamed so far, directly or as one suggestion by the agent. The stream finds its place again by
// element id and offset before each piece, and stops when the writer has changed the text it
// streamed, so it never writes somewhere else.

import type { EditorView } from 'prosemirror-view';
import { type Actor, applyEdits } from './automation.js';
import { type EditAddress, textOf, textRange, wholeElement } from './automation-address.js';
import { createElementId } from './element-ids.js';

/** A stream of text going into a document. */
export interface TextStream {
  /** Adds a piece after the text streamed so far; false once the stream has stopped. */
  append(text: string): boolean;
  /** Ends the stream, keeping what it wrote. */
  finish(): void;
  /** Ends the stream, taking out what it wrote while it is still there. */
  cancel(): void;
}

/** How a stream writes. */
export interface StreamOptions {
  readonly actor: Actor;
  readonly mode: 'direct' | 'suggest';
}

// Whether the element still holds the streamed text where the stream put it.
function holds(view: EditorView, place: { elementId: string; from: number }, written: string) {
  const block = wholeElement(view.state.tr, place.elementId);
  if (!block?.node.isTextblock) return false;
  return textRange(block, { from: place.from, to: place.from + written.length })?.text === written;
}

/**
 * Starts streaming text into a view's document at an address: at its `from` offset, or the end of
 * the element's text. Each piece is its own change; in suggest mode they make one suggestion.
 */
export function streamText(view: EditorView, at: EditAddress, options: StreamOptions): TextStream {
  const suggestion = createElementId();
  const block = wholeElement(view.state.tr, at.elementId);
  const from = at.from ?? (block ? textOf(block).text.length : 0);
  let written = '';
  let open = block !== null;
  return {
    append(text) {
      if (!open || !text) return open;
      if (!holds(view, { elementId: at.elementId, from }, written)) {
        open = false;
        return false;
      }
      const offset = from + written.length;
      const result = applyEdits(
        view.state,
        [{ op: 'insertText', at: { elementId: at.elementId, from: offset }, text }],
        { ...options, newId: () => suggestion },
      );
      if (!result.ok) {
        open = false;
        return false;
      }
      view.dispatch(result.tr);
      // A plugin may drop the change: a piece that did not go in ends the stream.
      if (!holds(view, { elementId: at.elementId, from }, written + text)) {
        open = false;
        return false;
      }
      written += text;
      return true;
    },
    finish() {
      open = false;
    },
    cancel() {
      open = false;
      if (!written || !holds(view, { elementId: at.elementId, from }, written)) return;
      const range = { elementId: at.elementId, from, to: from + written.length, expect: written };
      const result = applyEdits(view.state, [{ op: 'deleteText', at: range }], {
        ...options,
        mode: 'direct',
      });
      if (result.ok) view.dispatch(result.tr);
    },
  };
}
