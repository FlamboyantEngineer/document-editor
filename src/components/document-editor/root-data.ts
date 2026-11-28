// The editor root's data attributes: how it shows the document, and what its debugging shows.

import type { CSSProperties } from 'react';
import type { LayoutState } from '../../pagination/index.js';
import type { DocumentEditorDebug, DocumentEditorProps } from './document-editor.js';
import type { PagesFontsState } from './use-pages-fonts.js';

/** The parts of the layout debugging shown: `true` shows the pages'. */
export function debugParts(debug: DocumentEditorProps['debug']): DocumentEditorDebug {
  return typeof debug === 'object' ? debug : { pages: debug ?? false };
}

// The root's debugging states: which parts of the layout debugging show.
function debugData(props: DocumentEditorProps) {
  const debug = debugParts(props.debug);
  return {
    debug: debug.pages ?? false,
    debugBlocks: debug.blocks ?? false,
    debugSource: debug.source ?? false,
  };
}

/** The editor root's hook values. */
export function rootData(
  props: DocumentEditorProps,
  layoutState: LayoutState,
  text: Pick<PagesFontsState, 'textLayout' | 'reason'>,
) {
  const { layout = 'page', editable = true, suggesting = false, compare } = props;
  return {
    markup: props.markup ?? 'all',
    layout,
    // Only the pages lay text out with the engine; the web layout keeps the browser's lines.
    // and only with the fonts the host serves; the reason says why the browser lays them out.
    textLayout: layout === 'page' ? text.textLayout : 'dom',
    textLayoutReason: text.reason ?? undefined,
    webWidth: props.webWidth ?? 'fill',
    mode: editable ? 'authoring' : 'reading',
    suggesting: editable && suggesting,
    comparing: compare ? (compare.display ?? 'markup') : undefined,
    scrollable: props.scrollable ?? false,
    authorship: props.authorship ?? false,
    ...debugData(props),
    formattingMarks: props.formattingMarks ?? false,
    layoutState,
  };
}

/**
 * The editor root's custom properties: its template's, the zoom as a factor and, when the host
 * gives one, the widest an endless page shows.
 */
export function rootStyle(
  props: DocumentEditorProps,
  templateStyle: Readonly<Record<string, string>>,
): CSSProperties {
  const style: Record<string, string> = {
    ...templateStyle,
    '--de-zoom': String((props.zoom ?? 100) / 100),
  };
  if (props.webMaxWidth) style['--de-web-max-width'] = props.webMaxWidth;
  return style as CSSProperties;
}
