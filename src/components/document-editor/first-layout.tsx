// Where the editor's pages stand against their first layout: awaited, failed, or shown. Until the
// pages first settle the document is covered, busy and out of reach; once they have, they stay
// shown through every later layout.

import { InlineError } from '@flamboyantengineer/ui-components/inline-error';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { LayoutState } from '../../pagination/index.js';
import type { LoadProgress } from '../../session/load-progress.js';
import { createHooks } from '../../utils/hooks.js';

const hooks = createHooks('document-editor', ['placeholder', 'layout-error']);

/** Whether the pages await their first layout, could not be laid out, or are shown. */
export type FirstLayout = 'awaiting' | 'failed' | 'shown';

/** Who hears how the first layout went, as the editor's props name them. */
interface FirstLayoutListeners {
  /** Told once when the first layout fails. */
  readonly onLayoutFailed?: (() => void) | undefined;
  /** The load the first layout ends: ready once the pages show, failed with them. */
  readonly loadProgress?: LoadProgress | undefined;
}

/**
 * The pages against their first layout, told to its listeners. The web layout is always shown.
 */
export function useFirstLayout(
  isPaged: boolean,
  layoutState: LayoutState,
  { onLayoutFailed, loadProgress: progress }: FirstLayoutListeners,
): FirstLayout {
  const [settled, setSettled] = useState(false);
  if (!settled && layoutState === 'settled') setSettled(true);
  const unsettled: FirstLayout = layoutState === 'failed' ? 'failed' : 'awaiting';
  const first = !isPaged || settled || layoutState === 'settled' ? 'shown' : unsettled;
  const latest = useRef(onLayoutFailed);
  useEffect(() => {
    latest.current = onLayoutFailed;
  });
  useEffect(() => {
    if (first === 'failed') {
      latest.current?.();
      progress?.fail();
    } else if (first === 'shown') {
      progress?.complete('layout');
      progress?.ready();
    }
  }, [first, progress]);
  return first;
}

/**
 * What stands before the document until its pages are shown: the host's placeholder while they
 * await their first layout, a busy status, or the error when that layout failed, an alert.
 */
export function FirstLayoutCover({
  firstLayout,
  placeholder,
  failedText,
}: {
  firstLayout: FirstLayout;
  placeholder: ReactNode;
  failedText: string;
}) {
  if (firstLayout === 'failed') {
    return <InlineError {...hooks.slot('layout-error')}>{failedText}</InlineError>;
  }
  if (firstLayout === 'shown' || !placeholder) return null;
  return (
    <div {...hooks.slot('placeholder')} role="status" aria-busy="true">
      {placeholder}
    </div>
  );
}
