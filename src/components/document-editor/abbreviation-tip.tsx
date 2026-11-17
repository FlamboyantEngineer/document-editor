// The tooltip of an abbreviation reached from the keyboard: while the writer has an abbreviation
// selected in the focused editor, or a reader tabs to one, it shows the abbreviation and its
// expansion below it, as hovering shows them in the abbreviation's title.

import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, useEffect, useState } from 'react';
import { getComposedActiveElement } from '../../utils/composed-focus.js';
import { createHooks } from '../../utils/hooks.js';
import { isElement } from '../../utils/is-element.js';

const hooks = createHooks('document-editor', ['abbreviation-tip']);

/** What the tooltip tells, and where it shows: below its abbreviation's left edge in the body. */
interface AbbreviationTipShown {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

const ABBREVIATION = '[data-abbreviation-ref]';

// The abbreviation the keyboard is on: the one focused, or the one selected while the view has
// focus.
function abbreviationOnKeyboard(view: EditorView): HTMLElement | null {
  const focused = getComposedActiveElement(view.dom.ownerDocument);
  const element = isElement(focused) ? focused.closest<HTMLElement>(ABBREVIATION) : null;
  if (element && view.dom.contains(element)) return element;
  if (!view.hasFocus()) return null;
  return view.dom.querySelector<HTMLElement>(`.ProseMirror-selectednode${ABBREVIATION}`);
}

function measureTip(view: EditorView): AbbreviationTipShown | null {
  const element = view.isDestroyed ? null : abbreviationOnKeyboard(view);
  const body = element?.closest('.de-document-editor__body');
  const text = element?.querySelector('[data-abbr-tooltip]')?.getAttribute('data-abbr-tooltip');
  if (!element || !body || !text) return null;
  const box = element.getBoundingClientRect();
  const frame = body.getBoundingClientRect();
  return { text, x: box.left - frame.left, y: box.bottom - frame.top };
}

/** The tooltip of the abbreviation the keyboard is on, measured again as the state changes. */
export function AbbreviationTip({
  view,
  state,
}: {
  readonly view: EditorView | null;
  readonly state: EditorState;
}) {
  const [tip, setTip] = useState<AbbreviationTipShown | null>(null);
  useEffect(() => {
    if (!view || view.isDestroyed) return undefined;
    const owner = view.dom.ownerDocument.defaultView;
    let frame = 0;
    const measure = () => {
      owner?.cancelAnimationFrame(frame);
      frame = owner?.requestAnimationFrame(() => setTip(measureTip(view))) ?? 0;
    };
    measure();
    const dom = view.dom;
    dom.addEventListener('focusin', measure);
    dom.addEventListener('focusout', measure);
    return () => {
      owner?.cancelAnimationFrame(frame);
      dom.removeEventListener('focusin', measure);
      dom.removeEventListener('focusout', measure);
    };
  }, [view, state]);
  if (!tip) return null;
  const style = {
    '--de-abbreviation-tip-x': `${String(tip.x)}px`,
    '--de-abbreviation-tip-y': `${String(tip.y)}px`,
  } as CSSProperties;
  return (
    <div {...hooks.slot('abbreviation-tip')} role="tooltip" style={style}>
      {tip.text}
    </div>
  );
}
