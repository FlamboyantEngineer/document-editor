// Typesets math ahead of the layout that sizes it (DOCE-PAGINATION-10.8): each source is typeset
// once, through the base library's renderer, and every view, the pages' measuring view among them,
// draws what it typeset. The pages wait for a document's math to be typeset before laying it out
// (`ready`), so an equation is sized from what it typeset as and nothing is laid out again when it
// arrives. A renderer that does not answer within the timeout gives invalid math, which stays: a
// later answer would change the equation's size after the pages were laid out.

import {
  type MathRenderer,
  renderMathElement,
} from '@flamboyantengineer/ui-components/math-preview';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  createMathTypesets,
  isMath,
  mathTree,
  type MathTypesets,
  type TypesetMath,
} from './math-typeset.js';

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
export interface MathTypesetter extends MathTypesets {
  /** What a source typesets as, typeset once and shared by every view that asks. */
  typeset(display: boolean, latex: string, ownerDocument: Document): Promise<TypesetAnswer>;
  /** Settles once every math node of a document is typeset; null when all of it is already. */
  ready(doc: ProseMirrorNode, ownerDocument: Document): Promise<void> | null;
}

/** How a typesetter typesets: its renderer, what invalid math shows, and how long it waits. */
interface MathTypesetterOptions {
  readonly render: MathRenderer;
  readonly invalid: InvalidMathText;
  readonly timeout: { readonly ms: number; readonly message: string };
}

const keyOf = (display: boolean, latex: string) => `${display ? 'display' : 'inline'}\n${latex}`;
const sourceOf = (key: string): [boolean, string] => [
  key.startsWith('display\n'),
  key.slice(key.indexOf('\n') + 1),
];

/** Typesets math with a renderer, at most `timeout.ms` for each source. */
export function createMathTypesetter({
  render,
  invalid,
  timeout,
}: MathTypesetterOptions): MathTypesetter {
  const kept = createMathTypesets();
  const asked = new Map<string, Promise<TypesetAnswer>>();
  const invalidAs = (display: boolean, message: string): TypesetAnswer => ({
    typeset: { state: 'invalid', text: display ? invalid.display : invalid.inline, message },
    element: null,
  });
  const answer = (display: boolean, latex: string, ownerDocument: Document) => {
    const owner = ownerDocument.defaultView;
    const late = new Promise<TypesetAnswer>((resolve) => {
      const message = `${timeout.message} (${String(timeout.ms / 1000)} s)`;
      owner?.setTimeout(() => resolve(invalidAs(display, message)), timeout.ms);
    });
    // The base library typesets and keeps only MathML's allowed parts; it never throws.
    const typeset = renderMathElement(latex, {
      displayMode: display,
      renderer: render,
      ownerDocument,
    }).then((result): TypesetAnswer =>
      result.ok
        ? { typeset: { state: 'ready', math: mathTree(result.element) }, element: result.element }
        : invalidAs(display, result.message),
    );
    return Promise.race([typeset, late]).then((settled) => {
      kept.keep(display, latex, settled.typeset);
      return settled;
    });
  };
  // The elements typeset, by source, as long as `kept` holds what they typeset as.
  const elements = new Map<string, Element | null>();
  const typeset = (display: boolean, latex: string, ownerDocument: Document) => {
    const key = keyOf(display, latex);
    const done = kept.find(display, latex);
    const element = elements.get(key);
    if (done && element !== undefined) return Promise.resolve({ typeset: done, element });
    let found = asked.get(key);
    if (!found) {
      found = answer(display, latex, ownerDocument).then((settled) => {
        asked.delete(key);
        elements.set(key, settled.element);
        for (const each of elements.keys())
          if (!kept.find(...sourceOf(each))) elements.delete(each);
        return settled;
      });
      asked.set(key, found);
    }
    return found;
  };
  return {
    keep: kept.keep,
    of: kept.of,
    find: kept.find,
    typeset,
    ready(doc, ownerDocument) {
      const waits: Promise<TypesetAnswer>[] = [];
      doc.descendants((node) => {
        if (!isMath(node)) return true;
        if (kept.of(node) === null)
          waits.push(typeset(node.type.name === 'math_display', node.textContent, ownerDocument));
        return false;
      });
      return waits.length ? Promise.all(waits).then(() => undefined) : null;
    },
  };
}
