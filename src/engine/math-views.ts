// Math as it reads: each inline or display math node drawn as its typeset MathML, through the base
// library's KaTeX renderer, in every view the plugin runs in, the pages' measuring view too. Each
// source is typeset once, by the plugin's typesetter (`math-typesetter.ts`), which the pages wait
// for before laying math out (`mathTypesetReady`). The LaTeX source shows until the math is
// typeset; math that does not typeset says so instead, its renderer's reason as its title. A view
// whose math changes size asks the pages to measure again (`de-remeasure`), where they measure it
// as drawn. The plugin also writes math as it is typed and keeps the math edited in place
// (`math-input.ts`).

import { type MathRenderer, renderKatexMath } from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey } from 'prosemirror-state';
import type { Decoration, EditorView, NodeView, NodeViewConstructor } from 'prosemirror-view';
import { REMEASURE_EVENT } from '../utils/remeasure.js';
import { drawnMathIn } from './math-drawing.js';
import {
  cancelMath,
  commitMath,
  type MathEditing,
  mathEditingOf,
  mathInputField,
  mathInputProps,
  type MathInputState,
} from './math-input.js';
import type { TypesetMath } from './math-typeset.js';
import {
  createMathTypesetter,
  type InvalidMathText,
  type MathTypesetter,
  type TypesetAnswer,
} from './math-typesetter.js';

export type { InvalidMathText } from './math-typesetter.js';

// What a math view draws with: the typesetter every view of the plugin shares.
interface MathDrawing {
  readonly typesets: MathTypesetter;
}

// Draws one math node as its source typeset, and again when the source changes.
function mathView(
  node: ProseMirrorNode,
  view: EditorView,
  { typesets, decorations }: MathDrawing & Placing,
): NodeView {
  const display = node.type.name === 'math_display';
  const owner = view.dom.ownerDocument;
  const dom = owner.createElement(display ? 'div' : 'span');
  dom.className = 'de-math';
  dom.dataset.display = display ? 'display' : 'inline';
  dom.contentEditable = 'false';
  let source: string | null = null;
  let current = node;
  const drawing = drawnMathIn(dom, decorations);
  const window = owner.defaultView;
  // Shows what the source typeset as, or what invalid math shows and why, and asks the pages to
  // measure it again where they measure it as drawn.
  const show = ({ typeset, element }: TypesetAnswer) => {
    drawing.show(element ? owner.importNode(element, true) : null);
    if (typeset.state === 'invalid') {
      dom.textContent = typeset.text;
      dom.title = typeset.message;
    }
    dom.dataset.state = typeset.state;
    const Event = window?.CustomEvent;
    if (Event) dom.dispatchEvent(new Event(REMEASURE_EVENT, { bubbles: true }));
  };
  const draw = (next: ProseMirrorNode) => {
    current = next;
    const latex = next.textContent;
    if (latex === source) return;
    source = latex;
    drawing.show(null);
    dom.textContent = latex;
    dom.dataset.state = 'pending';
    dom.removeAttribute('title');
    void typesets.typeset(display, latex, owner).then((answer) => {
      if (source === latex) show(answer);
    });
  };
  draw(node);
  return {
    dom,
    update(next, decorations) {
      if (next.type !== current.type) return false;
      draw(next);
      drawing.place(decorations);
      return true;
    },
    selectNode: () => dom.setAttribute('data-selected', 'true'),
    deselectNode: () => dom.removeAttribute('data-selected'),
    ignoreMutation: () => true,
  };
}

// The decorations a math node is drawn with, which may place it (DOCE-PAGINATION-12.11).
interface Placing {
  readonly decorations: readonly Decoration[];
}

// The node view constructor drawing math with a plugin's drawing.
const mathViewOf =
  (drawing: MathDrawing): NodeViewConstructor =>
  (...[node, view, , decorations]: Parameters<NodeViewConstructor>) =>
    mathView(node, view, { ...drawing, decorations });

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
  return typesetterOf(state)?.of(node) ?? null;
}

// The typesetter of a state's math views, if it runs them.
const typesetterOf = (state: EditorState) =>
  (mathViewsKey.get(state)?.spec as { typesets?: MathTypesetter } | undefined)?.typesets ?? null;

/**
 * Settles once the math views of a state have typeset every math node of a document, which the
 * pages wait for before laying it out (DOCE-PAGINATION-10.8); null when all of it is typeset, or
 * the state runs no math views.
 */
export function mathTypesetReady(
  state: EditorState,
  doc: ProseMirrorNode,
  ownerDocument: Document,
): Promise<void> | null {
  return typesetterOf(state)?.ready(doc, ownerDocument) ?? null;
}

/** Stops editing math in place, keeping its LaTeX; math left empty is deleted. */
export const cancelMathEditing: Command = cancelMath(mathViewsKey);

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
   * `timeoutMessage` as its reason; 30 seconds by default. An answer after it is not drawn: the
   * pages were laid out with the invalid math.
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
    typesets: createMathTypesetter({
      render,
      invalid,
      timeout: { ms: timeout, message: timeoutMessage },
    }),
  };
  return new Plugin<MathInputState>({
    key: mathViewsKey,
    typesets: drawing.typesets,
    state: mathInputField(mathViewsKey),
    props: {
      ...mathInputProps(mathViewsKey),
      nodeViews: {
        math_inline: mathViewOf(drawing),
        math_display: mathViewOf(drawing),
      },
    },
  });
}
