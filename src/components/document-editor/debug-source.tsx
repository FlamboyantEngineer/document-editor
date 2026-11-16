// The pages' markup, read-only, pretty-printed and highlighted, for the layout debugging's pane. It
// follows the pages a moment after they change, so typing never waits for it to print them.

import { CodeBlock } from '@flamboyantengineer/ui-components/code-block';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { useEffect, useState } from 'react';
import { formatMarkup, tokenizeMarkup } from './debug-markup.js';

// How long after the pages change their markup is printed again.
const FOLLOW_DELAY = 120;

/** What the pages' markup follows. */
interface DebugSourceProps {
  /** The view of the pages, whose element is printed. */
  readonly view: EditorView | null;
  /** The pages shown, which the markup follows. */
  readonly pages: EditorState | null | undefined;
}

/** The pages' markup, printed again shortly after each change of the pages. */
export function DebugSource({ view, pages }: DebugSourceProps) {
  const [markup, setMarkup] = useState('');
  useEffect(() => {
    if (!view || view.isDestroyed) return undefined;
    const owner = view.dom.ownerDocument.defaultView;
    const timer = owner?.setTimeout(() => setMarkup(formatMarkup(view.dom)), FOLLOW_DELAY);
    return () => {
      if (timer !== undefined) owner?.clearTimeout(timer);
    };
  }, [view, pages]);
  return <CodeBlock code={markup} language="html" tokenize={tokenizeMarkup} />;
}
