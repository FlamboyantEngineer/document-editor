// The layout debugging's pane beside the pages: the measuring view the pages are laid out from, or
// the pages' markup, resized by the handle before it. The pane's element is there in page layout
// whether it shows or not, since it holds the measuring view, which must stay mounted as it is.

import { ResizeHandle } from '@flamboyantengineer/ui-components/split-view';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { type CSSProperties, lazy, type RefObject, Suspense, useState } from 'react';
import { createHooks } from '../../utils/hooks.js';
import type { DebuggingLabels } from './debugging-labels.js';
import type { DocumentEditorDebug } from './document-editor.js';

/** What the debugging pane shows: the measuring view, the pages' markup, or nothing. */
type DebugPaneView = 'measure' | 'source' | null;

const hooks = createHooks('document-editor', ['debug', 'measure']);

// The measuring view is hidden from assistive technology and out of the keyboard's reach.
const MEASURE_SLOT = { 'aria-hidden': 'true', inert: true, spellCheck: false } as const;

// The pane's width in CSS pixels, at first and at most.
const PANE_WIDTH = { initial: 480, min: 200, max: 1600 } as const;

// The markup view loads the first time it shows, with the code block only it uses.
const DebugSource = /* @__PURE__ */ lazy(async () => ({
  default: (await import('./debug-source.js')).DebugSource,
}));

/**
 * What the debugging pane shows for the parts of the debugging shown: the markup first, then the
 * measuring view when there is one, in page layout.
 */
export function debugPaneView(debug: DocumentEditorDebug, isMeasured: boolean): DebugPaneView {
  if (debug.source) return 'source';
  return debug.measure && isMeasured ? 'measure' : null;
}

/** What the debugging pane shows and reads. */
interface DebugPaneProps {
  /** What the pane shows (`debugPaneView`). */
  readonly shown: DebugPaneView;
  /** The view of the pages, whose markup the pane prints. */
  readonly view: EditorView | null;
  /** The pages shown, which the markup follows. */
  readonly pages: EditorState | null | undefined;
  readonly labels: DebuggingLabels;
  /** Where the pages are measured, in page layout: the element the pane holds. */
  readonly measureIn: RefObject<HTMLDivElement | null> | null;
}

/**
 * The debugging pane: while it shows, a region at its own width (`--de-debug-width`) with the
 * measuring view or the pages' markup, after a handle that resizes it by pointer and keyboard.
 */
export function DebugPane({ shown, view, pages, labels, measureIn }: DebugPaneProps) {
  const [width, setWidth] = useState<number>(PANE_WIDTH.initial);
  const style = shown ? ({ '--de-debug-width': `${String(width)}px` } as CSSProperties) : undefined;
  return (
    <>
      {shown ? (
        <ResizeHandle
          orientation="vertical"
          sizedPane="after"
          value={width}
          minValue={PANE_WIDTH.min}
          maxValue={PANE_WIDTH.max}
          extent={PANE_WIDTH.max}
          onChange={setWidth}
          aria-label={labels.debugPaneResize}
        />
      ) : null}
      <div
        {...hooks.slot('debug', { view: shown ?? undefined })}
        role={shown ? 'region' : undefined}
        aria-label={shown ? labels.debugPane : undefined}
        style={style}
      >
        {measureIn ? <div {...hooks.slot('measure')} {...MEASURE_SLOT} ref={measureIn} /> : null}
        {shown === 'source' ? (
          <Suspense fallback={null}>
            <DebugSource view={view} pages={pages} />
          </Suspense>
        ) : null}
      </div>
    </>
  );
}
