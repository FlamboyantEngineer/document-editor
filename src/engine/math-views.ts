// Math as it reads: each inline or display math node drawn as its typeset MathML, through the base
// library's KaTeX renderer, in every view the plugin runs in, the pages' measuring view too. The
// LaTeX source shows until the math is typeset; math that does not typeset says so instead, its
// renderer's reason as its title. A view whose math changes size asks the pages to measure again (`de-remeasure`). The
// plugin also writes math as it is typed and keeps the math edited in place (`math-input.ts`).

import {
  type MathRenderer,
  renderKatexMath,
  renderMathElement,
} from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { clusterCount, mathDrawnText } from '../utils/math-text.js';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import {
  cancelMath,
  commitMath,
  type MathEditing,
  mathEditingOf,
  mathInputField,
  mathInputProps,
  type MathInputState,
} from './math-input.js';
import {
  createMathTypesets,
  mathTree,
  type MathTypesets,
  type TypesetMath,
} from './math-typeset.js';

// The clusters typeset math draws, which its reserved box is as many ems wide as.
const MATH_CLUSTERS = '--de-math-clusters';

// What a math view draws with: the renderer, what invalid math shows, and where it keeps what it
// typeset.
interface MathDrawing {
  readonly render: MathRenderer;
  readonly invalid: InvalidMathText;
  readonly typesets: MathTypesets;
  readonly timeout: { readonly ms: number; readonly message: string };
}

// Draws one math node, typesetting its source and drawing it again when the source changes.
function mathView(
  node: ProseMirrorNode,
  view: EditorView,
  { render, invalid, typesets, timeout }: MathDrawing,
): NodeView {
  const display = node.type.name === 'math_display';
  const owner = view.dom.ownerDocument;
  const dom = owner.createElement(display ? 'div' : 'span');
  dom.className = 'de-math';
  dom.dataset.display = display ? 'display' : 'inline';
  dom.contentEditable = 'false';
  let source: string | null = null;
  let current = node;
  let deadline: number | undefined;
  const window = owner.defaultView;
  // Shows what the source typeset as, or what invalid math shows and why, and asks the pages to
  // measure it again.
  const show = (result: { ok: true; element: Element } | { ok: false; message: string }) => {
    if (result.ok) {
      dom.replaceChildren(result.element);
      // The box it takes where no face for MathML is served (DOCE-PAGINATION-12.9).
      dom.style.setProperty(MATH_CLUSTERS, String(clusterCount(mathDrawnText(result.element))));
    } else {
      dom.style.removeProperty(MATH_CLUSTERS);
      dom.textContent = display ? invalid.display : invalid.inline;
      dom.title = result.message;
    }
    dom.dataset.state = result.ok ? 'ready' : 'invalid';
    const Event = window?.CustomEvent;
    if (Event) dom.dispatchEvent(new Event(REMEASURE_EVENT, { bubbles: true }));
  };
  const draw = (next: ProseMirrorNode) => {
    current = next;
    const latex = next.textContent;
    if (latex === source) return;
    source = latex;
    dom.textContent = latex;
    dom.dataset.state = 'pending';
    dom.removeAttribute('title');
    window?.clearTimeout(deadline);
    // A renderer that has not answered by the deadline shows as invalid, so nothing waits on it
    // for good (DOCE-PAGINATION-10.8); a later answer is still drawn.
    deadline = window?.setTimeout(() => {
      if (source !== latex || dom.dataset.state !== 'pending') return;
      const message = `${timeout.message} (${String(timeout.ms / 1000)} s)`;
      const text = display ? invalid.display : invalid.inline;
      typesets.keep(display, latex, { state: 'invalid', text, message });
      show({ ok: false, message });
    }, timeout.ms);
    // The base library typesets and keeps only MathML's allowed parts; it never throws.
    void renderMathElement(latex, {
      displayMode: display,
      renderer: render,
      ownerDocument: dom.ownerDocument,
    }).then((result) => {
      if (result.ok)
        typesets.keep(display, latex, { state: 'ready', math: mathTree(result.element) });
      else {
        const text = display ? invalid.display : invalid.inline;
        typesets.keep(display, latex, { state: 'invalid', text, message: result.message });
      }
      if (source !== latex) return;
      window?.clearTimeout(deadline);
      show(result);
    });
  };
  draw(node);
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      draw(next);
      return true;
    },
    selectNode: () => dom.setAttribute('data-selected', 'true'),
    deselectNode: () => dom.removeAttribute('data-selected'),
    ignoreMutation: () => true,
    destroy: () => window?.clearTimeout(deadline),
  };
}

const mathViewsKey = new PluginKey<MathInputState>('math-views');

/** The math being edited in place, which the editor draws its field over, or null. */
export function mathEditingAt(state: EditorState): MathEditing | null {
  return mathEditingOf(mathViewsKey, state);
}

/** Commits the math edited in place with its LaTeX; empty LaTeX deletes it. */
export const commitMathEditing = (latex: string): Command => commitMath(mathViewsKey, latex);

/**
 * What a math node of a state was typeset as by the math views it runs, its MathML or what invalid
 * math shows; null before it is typeset or without the views (DOCE-PAGINATION-13.2).
 */
export function typesetMathOf(state: EditorState, node: ProseMirrorNode): TypesetMath | null {
  const spec = mathViewsKey.get(state)?.spec as { typesets?: MathTypesets } | undefined;
  return spec?.typesets?.of(node) ?? null;
}

/** Stops editing math in place, keeping its LaTeX; math left empty is deleted. */
export const cancelMathEditing: Command = cancelMath(mathViewsKey);

/** What math that does not typeset shows in place of its MathML, inline and as a block. */
export interface InvalidMathText {
  readonly inline: string;
  readonly display: string;
}

/** What invalid math shows by default. */
export const DEFAULT_INVALID_MATH_TEXT: InvalidMathText = {
  inline: 'Invalid math',
  display: 'Invalid math',
};

/** How math is typeset. */
export interface MathViewsOptions {
  /** Typesets LaTeX to MathML; the base library's KaTeX renderer by default. */
  readonly render?: MathRenderer | undefined;
  /** What invalid math shows; `DEFAULT_INVALID_MATH_TEXT` by default. */
  readonly invalid?: InvalidMathText | undefined;
  /**
   * How long the renderer is waited for, in milliseconds, before the math shows as invalid with
   * `timeoutMessage` as its reason; 30 seconds by default. An answer after it is still drawn.
   */
  readonly timeout?: number | undefined;
  /** The reason math the renderer did not answer for shows; English by default. */
  readonly timeoutMessage?: string | undefined;
}

/** How long math views wait for their renderer by default, in milliseconds. */
export const DEFAULT_MATH_TIMEOUT = 30_000;

/**
 * Draws math as typeset MathML in every view the plugin runs in, turns `$x$` and `$$` with Enter
 * into math as it is typed, and keeps the math edited in place (`mathEditingAt`).
 */
export function createMathViews({
  render = renderKatexMath,
  invalid = DEFAULT_INVALID_MATH_TEXT,
  timeout = DEFAULT_MATH_TIMEOUT,
  timeoutMessage = 'The math was not typeset in time',
}: MathViewsOptions = {}): Plugin {
  const drawing: MathDrawing = {
    render,
    invalid,
    typesets: createMathTypesets(),
    timeout: { ms: timeout, message: timeoutMessage },
  };
  return new Plugin<MathInputState>({
    key: mathViewsKey,
    typesets: drawing.typesets,
    state: mathInputField(mathViewsKey),
    props: {
      ...mathInputProps(mathViewsKey),
      nodeViews: {
        math_inline: (node, view) => mathView(node, view, drawing),
        math_display: (node, view) => mathView(node, view, drawing),
      },
    },
  });
}
