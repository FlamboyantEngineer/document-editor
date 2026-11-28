// Typesets math ahead of the layout that sizes it (DOCE-PAGINATION-10.8): each source is typeset
// once, through the base library's renderer, and every view draws what it typeset. The pages wait for a document's math to be typeset before laying it out
// (`ready`), so an equation is sized from what it typeset as and nothing is laid out again when it
// arrives. A renderer that does not answer within the timeout gives invalid math, which stays: a
// later answer would change the equation's size after the pages were laid out.

import {
  type MathRenderer,
  renderMathElement,
} from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { isMath, mathTree, type TypesetMath } from './math-typeset.js';

/** What math that does not typeset shows in place of its MathML, inline and as a block. */
export interface InvalidMathText {
  readonly inline: string;
  readonly display: string;
}

/** What a source typeset as, with the MathML element the views draw a copy of. */
export interface TypesetAnswer {
  readonly typeset: TypesetMath;
  /** The typeset `<math>` element, null for invalid math. */
  readonly element: Element | null;
}

/** Typesets math once per source, keeping what it typeset as. */
export interface MathTypesetter {
  /** What a math node's source was typeset as, or null before it is. */
  of(node: ProseMirrorNode): TypesetMath | null;
  /** What a source typesets as, typeset once and shared by every view that asks. */
  typeset(display: boolean, latex: string, ownerDocument: Document): Promise<TypesetAnswer>;
  /**
   * Settles once every math node of a document is typeset; null when all of it is already. What
   * the document's math typeset as is kept until another document is readied, whatever its count.
   */
  ready(doc: ProseMirrorNode, ownerDocument: Document): Promise<void> | null;
}

/** How a typesetter typesets: its renderer, what invalid math shows, and how long it waits. */
interface MathTypesetterOptions {
  readonly render: MathRenderer;
  readonly invalid: InvalidMathText;
  readonly timeout: { readonly ms: number; readonly message: string };
}

// How many sources are kept besides those of the document readied last: the latest typeset, as
// math is typed and edited.
const KEPT = 2000;

const keyOf = (display: boolean, latex: string) => `${display ? 'display' : 'inline'}\n${latex}`;
const keyOfNode = (node: ProseMirrorNode) =>
  keyOf(node.type.name === 'math_display', node.textContent);

/** Typesets math with a renderer, at most `timeout.ms` for each source. */
export function createMathTypesetter({
  render,
  invalid,
  timeout,
}: MathTypesetterOptions): MathTypesetter {
  const answers = new Map<string, TypesetAnswer>();
  const asked = new Map<string, Promise<TypesetAnswer>>();
  // The sources of the document readied last, which are never let go, and that document once all
  // of its math was found typeset, which a layout pass of the same document need not walk again.
  let held = new Set<string>();
  let whole: ProseMirrorNode | null = null;
  const keep = (key: string, settled: TypesetAnswer) => {
    answers.delete(key);
    answers.set(key, settled);
    for (const each of answers.keys()) {
      if (answers.size <= KEPT + held.size) break;
      if (!held.has(each)) answers.delete(each);
    }
  };
  const invalidAs = (display: boolean, message: string): TypesetAnswer => ({
    typeset: { state: 'invalid', text: display ? invalid.display : invalid.inline, message },
    element: null,
  });
  const answer = (display: boolean, latex: string, ownerDocument: Document) => {
    const owner = ownerDocument.defaultView;
    let deadline: number | undefined;
    const late = new Promise<TypesetAnswer>((resolve) => {
      const message = `${timeout.message} (${String(timeout.ms / 1000)} s)`;
      deadline = owner?.setTimeout(() => resolve(invalidAs(display, message)), timeout.ms);
    });
    // The base library typesets and keeps only MathML's allowed parts; it never throws.
    const typeset = renderMathElement(latex, {
      displayMode: display,
      renderer: render,
      ownerDocument,
    }).then((result): TypesetAnswer => {
      owner?.clearTimeout(deadline);
      return result.ok
        ? { typeset: { state: 'ready', math: mathTree(result.element) }, element: result.element }
        : invalidAs(display, result.message);
    });
    return Promise.race([typeset, late]);
  };
  const typeset = (display: boolean, latex: string, ownerDocument: Document) => {
    const key = keyOf(display, latex);
    const done = answers.get(key);
    if (done) return Promise.resolve(done);
    let found = asked.get(key);
    if (!found) {
      found = answer(display, latex, ownerDocument).then((settled) => {
        asked.delete(key);
        keep(key, settled);
        return settled;
      });
      asked.set(key, found);
    }
    return found;
  };
  return {
    of: (node) => (isMath(node) ? (answers.get(keyOfNode(node))?.typeset ?? null) : null),
    typeset,
    ready(doc, ownerDocument) {
      if (doc === whole) return null;
      const sources = new Set<string>();
      const waits: Promise<TypesetAnswer>[] = [];
      doc.descendants((node) => {
        if (!isMath(node)) return true;
        const key = keyOfNode(node);
        if (sources.has(key)) return false;
        sources.add(key);
        if (!answers.has(key))
          waits.push(typeset(node.type.name === 'math_display', node.textContent, ownerDocument));
        return false;
      });
      held = sources;
      whole = waits.length ? null : doc;
      return waits.length ? Promise.all(waits).then(() => undefined) : null;
    },
  };
}
