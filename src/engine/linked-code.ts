// Linked code's text, which its view draws from the block's attributes (`codeTrees`): its tokens as
// elements marked for the stylesheet, and, on forced lines (DOCE-PAGINATION-11.2), inside the hooks
// that draw it on the lines the engine laid its code out on, as a code block's line marks draw its
// own.

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { linkedCodeFigure } from '../layout-engine/blocks/linked-code.js';
import { lineMarks } from '../layout-engine/line-marks.js';
import type { LineTable } from '../layout-engine/line-table.js';
import { codeElements, codeTrees } from './code-drawing.js';

/**
 * Draws linked code's text in its code element as its tokens; on the lines given, inside the line
 * marks of the code it is laid out as (`lineMarks`).
 */
export function drawLinkedCode(
  code: HTMLElement,
  node: ProseMirrorNode,
  lines: LineTable | null,
): void {
  const text = String(node.attrs.code ?? '');
  const laid = lines ? linkedCodeFigure(node)?.code : undefined;
  const marks = laid && lines ? lineMarks(laid, { ...lines, justify: false }) : [];
  const owner = code.ownerDocument;
  const content = owner.createDocumentFragment();
  for (const child of codeElements(owner, codeTrees(text, node.attrs.language, marks)))
    content.appendChild(child);
  code.replaceChildren(content);
}
