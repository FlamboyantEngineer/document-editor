// The layout of a document editor: its pages, or its web layout, from the editor's props and
// served fonts, the view its chrome acts on, and what the surface shows around the document.

import { type RefObject, useEffect, useMemo, useState } from 'react';
import type { LayoutState } from '../../pagination/index.js';
import type { DocumentEditorProps } from './document-editor.js';
import { useFirstLayout } from './first-layout.js';
import { debugParts } from './root-data.js';
import { useDocumentLayout } from './use-document-layout.js';
import { useDispatchBody, type useEngineView } from './use-editor-engine.js';
import { type useLayoutTap, useMountTelemetry } from './use-editor-telemetry.js';
import { usePagedEditor, usePagedView } from './use-paged-projection.js';
import type { useShownFonts } from './use-pages-fonts.js';
import { useVisibleElementsFeed } from './visible-elements.js';

// The editor's root element, in the document the pages show in.
interface EditorLayoutRefs {
  readonly root: RefObject<HTMLElement | null>;
  readonly fonts: Omit<ReturnType<typeof useShownFonts>, 'props'>;
  /** Signalled once the web layout shows the document. */
  readonly ready: ReturnType<typeof useLayoutTap>['ready'];
}

/** The editor's layout, and the view its chrome acts on: the engine's, or, while the pages are a
projection of the state, the engine's view as a view of the state. */
export function useEditorLayout(
  props: DocumentEditorProps,
  engine: ReturnType<typeof useEngineView>,
  { root, fonts, ready }: EditorLayoutRefs,
) {
  const { state, editable = true } = props;
  const paging = usePagedEditor({
    state,
    onStateChange: props.onStateChange,
    body: useDispatchBody(props, editable && (props.suggesting ?? false), props.author ?? null),
    events: engine.events,
  });
  const [layoutState, setLayoutState] = useState<LayoutState>('pending');
  const { reported, text } = fonts;
  const progress = useDocumentLayout(root, {
    ...props,
    fonts: reported.fonts,
    text,
    layout: props.layout ?? 'page',
    compare: props.compare ?? null,
    debug: debugParts(props.debug),
    onLayoutStateChange: setLayoutState,
    onCanonical: paging.onCanonical,
    onLayout: paging.onLayout,
  });
  const view = usePagedView(progress.paged, engine.view, { state, ...paging });
  useEffect(() => {
    if (view && (props.layout ?? 'page') === 'web') ready.signal();
  }, [view, props.layout, ready]);
  useMountTelemetry(props.telemetry, engine.view, progress.paged?.projection ?? null);
  useVisibleElementsFeed(view, props.onVisibleElementsChange);
  // Pages that wait for template fonts are not shown without them: their first layout fails.
  const firstLayout = useFirstLayout(
    (props.layout ?? 'page') === 'page',
    reported.missing.length > 0 ? 'failed' : layoutState,
    props,
  );
  // What the surface shows around the document: the fonts that did not load or that no host file
  // serves, drawn in the served body family instead, and the cover.
  const missingFonts = useMemo(
    () =>
      text.unserved.length
        ? [...new Set([...reported.missing, ...text.unserved])]
        : reported.missing,
    [reported.missing, text.unserved],
  );
  const surface = { missingFonts, pagesUnavailable: text.reason, firstLayout };
  return { progress, view, layoutState, surface };
}
