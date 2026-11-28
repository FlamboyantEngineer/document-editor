// A host's React view of a quote for the regression lab (`hostViews`): taller than the quote the
// schema draws, so its layout rule sizes it from its text before it is drawn (DOCE-PAGINATION-7.17,
// DOCE-PAGINATION-14.1).

import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import { useDocumentEditor } from '../../../src/components/index.js';
import type { LayoutRules, RuleSize, SizeInput } from '../../../src/model/index.js';

// The room the view adds above and below the quote's text.
const PADDING = 96;
// How far the reference stylesheet indents a quote's text (`--de-quote-indent`).
const INDENT = 40;

/**
 * Draws a quote with room above and below its text that the schema's markup does not have, marked
 * with whether it reads the editor it is drawn in (`data-in-editor`).
 */
export function HostQuoteView({ nodeProps, children, ...props }: RichTextNodeViewProps) {
  void nodeProps;
  const editor = useDocumentEditor();
  return (
    <blockquote
      {...props}
      data-host-view=""
      data-in-editor={editor ? 'true' : 'false'}
      style={{ paddingBlock: `${String(PADDING)}px` }}
    >
      {children}
    </blockquote>
  );
}

/** The lab's host views by node type name. */
export const HOST_VIEWS = { blockquote: HostQuoteView } as const;

// The quote's box: each of its blocks' text wrapped at the quote's width, and the view's padding.
function sizeQuote({ node, width, text }: SizeInput): RuleSize {
  let height = 2 * PADDING;
  node.forEach((child) => {
    height += text.lines(child.textContent, { width: width - INDENT }).height;
  });
  return { height };
}

/** The layout rules that size the lab's host views. */
export const HOST_RULES: LayoutRules = { blockquote: { size: sizeQuote } };
