// The editor root's data attributes: how it shows the document, and what its debugging shows.

import type { CSSProperties } from 'react';
import { resolveFontStack } from '../../model/templates/template-css-values.js';
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
    debugMeasure: debug.measure ?? false,
    debugSource: debug.source ?? false,
  };
}

// How the root lays its text out. Only the pages lay text out with the engine, and only with the
// fonts the host serves; the web layout keeps the browser's lines, and the reason says why the
// browser lays them out. Under the engine, whether the host serves a face MathML is drawn in
// (DOCE-PAGINATION-12.9).
function textData(pretext: boolean, text: Pick<PagesFontsState, 'reason' | 'mathFamily'>) {
  return {
    textLayout: pretext ? 'pretext' : 'dom',
    textLayoutReason: text.reason ?? undefined,
    mathFont: pretext ? (text.mathFamily ? 'served' : 'unserved') : undefined,
  };
}

/** The editor root's hook values. */
export function rootData(
  props: DocumentEditorProps,
  layoutState: LayoutState,
  text: Pick<PagesFontsState, 'textLayout' | 'reason' | 'mathFamily'>,
) {
  const { layout = 'page', editable = true, suggesting = false, compare } = props;
  const pretext = layout === 'page' && text.textLayout === 'pretext';
  return {
    ...textData(pretext, text),
    markup: props.markup ?? 'all',
    layout,
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
 * The root's style: the template's properties, the zoom (`--de-zoom`) and the served family MathML
 * is drawn in (`--de-math-font-family`, DOCE-PAGINATION-12.9), none while no face for `math` is
 * served.
 */
export function rootStyle(
  template: Readonly<Record<string, string>>,
  zoom: number | undefined,
  mathFamily: string | null,
): CSSProperties {
  const stack = mathFamily ? resolveFontStack(mathFamily) : '';
  return {
    ...template,
    '--de-zoom': String((zoom ?? 100) / 100),
    ...(stack ? { '--de-math-font-family': stack } : {}),
  } as CSSProperties;
}
