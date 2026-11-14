// The editor root's data attributes: how it shows the document, and what its debugging shows.

import type { LayoutState } from '../../pagination/index.js';
import type { DocumentEditorDebug, DocumentEditorProps } from './document-editor.js';

/** The parts of the layout debugging shown: `true` shows the pages'. */
export function debugParts(debug: DocumentEditorProps['debug']): DocumentEditorDebug {
  return typeof debug === 'object' ? debug : { pages: debug ?? false };
}

/** The editor root's hook values. */
export function rootData(props: DocumentEditorProps, layoutState: LayoutState) {
  const { layout = 'page', editable = true, suggesting = false, compare } = props;
  const debug = debugParts(props.debug);
  return {
    markup: props.markup ?? 'all',
    layout,
    mode: editable ? 'authoring' : 'reading',
    suggesting: editable && suggesting,
    comparing: compare ? (compare.display ?? 'markup') : undefined,
    scrollable: props.scrollable ?? false,
    authorship: props.authorship ?? false,
    debug: debug.pages ?? false,
    debugBlocks: debug.blocks ?? false,
    debugMeasure: debug.measure ?? false,
    formattingMarks: props.formattingMarks ?? false,
    layoutState,
  };
}
