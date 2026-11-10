// The editor's handle, for a host that drives it from outside: focusing it, taking the reader to an
// element, selecting by element id, running a command or a batch of automation edits.

import { type Command, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type Ref, useImperativeHandle } from 'react';
import { type FoundElement, textRange } from '../../engine/automation-address.js';
import {
  applyEdits,
  type AutomationEdit,
  type AutomationOptions,
  type AutomationResult,
  type EditAddress,
} from '../../engine/index.js';

/** What a host can do with a mounted editor. */
export interface DocumentEditorHandle {
  /** The engine's view, once it is mounted. */
  readonly view: () => EditorView | null;
  /** Moves focus into the document. */
  focus(): void;
  /** Puts the caret at an element's start and scrolls it into view; false when it is not there. */
  scrollToElement(elementId: string): boolean;
  /** Selects a range of an element's text, or the whole element; false when it cannot. */
  select(address: EditAddress): boolean;
  /** Runs a command on the latest state; false when it does not apply. */
  run(command: Command): boolean;
  /** Applies a batch of automation edits (DOCE-AUTOMATION) and dispatches it when it is accepted. */
  applyEdits(edits: readonly AutomationEdit[], options: AutomationOptions): AutomationResult | null;
}

// The document range an address names in the view's document: a range of a text block's text, or
// the start of another element. An element the pages split is read in its first part.
function rangeOf(view: EditorView, address: EditAddress) {
  let found: FoundElement | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.dataId === address.elementId) found = { node, pos };
    return !found;
  });
  const element = found as FoundElement | null;
  if (!element) return null;
  if (!element.node.isTextblock) return { from: element.pos + 1, to: element.pos + 1 };
  return textRange(element, address);
}

// Selects what an address names in the view and scrolls it into view.
function selectIn(view: EditorView | null, address: EditAddress): boolean {
  if (!view) return false;
  const range = rangeOf(view, address);
  if (!range) return false;
  const { doc } = view.state;
  const selection =
    range.from === range.to
      ? TextSelection.near(doc.resolve(range.from))
      : TextSelection.create(doc, range.from, range.to);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
  return true;
}

/** Gives the host a handle on the editor through its `handleRef`. */
export function useEditorHandle(
  ref: Ref<DocumentEditorHandle> | undefined,
  view: EditorView | null,
) {
  useImperativeHandle(
    ref,
    () => ({
      view: () => view,
      focus: () => view?.focus(),
      scrollToElement: (elementId) => selectIn(view, { elementId, from: 0, to: 0 }),
      select: (address) => selectIn(view, address),
      run(command) {
        if (!view) return false;
        const ran = command(view.state, view.dispatch, view);
        view.focus();
        return ran;
      },
      applyEdits(edits, options) {
        if (!view) return null;
        const result = applyEdits(view.state, edits, options);
        if (result.ok) view.dispatch(result.tr);
        return result;
      },
    }),
    [view],
  );
}
