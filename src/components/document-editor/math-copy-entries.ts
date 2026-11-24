// The context menu's entries for copying the math at the selection (DOCE-OBJECTS-1.12): as an
// equation, its typeset MathML with the LaTeX as its TeX annotation, which word processors paste
// as math; as its LaTeX source; and as a PNG of the drawing the math layout made, at the size the
// math has before it is scaled to fit its line.

import { copyText } from '@flamboyantengineer/ui-components/core';
import { copyMath, copyMathImage } from '@flamboyantengineer/ui-components/math-preview';
import type { MenuEntry } from '@flamboyantengineer/ui-components/menu';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { isElement } from '../../utils/is-element.js';
import type { DocumentEditorLabels } from './editor-labels.js';

const MATH_TYPES = new Set(['math_inline', 'math_display']);

// The math node selected or holding the selection, with its position.
function mathAt(view: EditorView) {
  const { selection } = view.state;
  if (selection instanceof NodeSelection && MATH_TYPES.has(selection.node.type.name))
    return { node: selection.node, pos: selection.from };
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1)
    if (MATH_TYPES.has($from.node(depth).type.name))
      return { node: $from.node(depth), pos: $from.before(depth) };
  return null;
}

// The drawing's size before it was scaled to fit its line (`--de-math-scale`).
function naturalSize(element: HTMLElement, drawing: SVGSVGElement) {
  const scale = Number.parseFloat(element.style.getPropertyValue('--de-math-scale')) || 1;
  const length = (name: string) =>
    (Number.parseFloat(drawing.getAttribute(name) ?? '') || 0) / scale;
  return { width: length('width'), height: length('height') };
}

// Runs a copy without letting a refused clipboard surface.
const run = (copy: () => Promise<unknown>) => () => {
  copy().catch(() => undefined);
};

/** Copy equation, Copy equation's LaTeX and Copy equation as image, at math; none elsewhere. */
export function mathCopyEntries(view: EditorView, labels: DocumentEditorLabels): MenuEntry[] {
  const math = mathAt(view);
  if (!math) return [];
  const source = math.node.textContent;
  const dom = view.nodeDOM(math.pos);
  const element = isElement(dom) ? (dom as HTMLElement) : null;
  const typeset = element?.querySelector('math') ?? null;
  const drawing = element?.querySelector<SVGSVGElement>('svg.de-math__drawing') ?? null;
  return [
    {
      id: 'copy-equation',
      label: labels.copyEquation,
      isDisabled: !typeset,
      onAction: run(async () => typeset && copyMath(typeset, { source, owner: view.dom })),
    },
    {
      id: 'copy-equation-latex',
      label: labels.copyEquationLatex,
      isDisabled: !source,
      onAction: run(() => copyText(source, { owner: view.dom })),
    },
    {
      id: 'copy-equation-image',
      label: labels.copyEquationImage,
      isDisabled: !drawing,
      onAction: run(
        async () =>
          element &&
          drawing &&
          copyMathImage(drawing, {
            ...naturalSize(element, drawing),
            source,
            display: math.node.type.name === 'math_display',
          }),
      ),
    },
  ];
}
