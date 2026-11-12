// A host's React view of a quote for the regression lab (`hostViews`): taller than the quote the
// schema draws, so pages laid out without it run past their bottom (DOCE-PAGINATION-7.17).

import type { RichTextNodeViewProps } from '@flamboyantengineer/ui-components/rich-text-editor';
import { useDocumentEditor } from '../../../src/components/index.js';

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
      style={{ paddingBlock: '96px' }}
    >
      {children}
    </blockquote>
  );
}

/** The lab's host views by node type name. */
export const HOST_VIEWS = { blockquote: HostQuoteView } as const;
