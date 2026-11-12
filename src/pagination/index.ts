// The editor's pagination runtime: measuring laid-out blocks, laying the whole document out on
// pages, and keeping an editor on its pages as it changes.

export type { DecorationSource } from './canonical-decorations.js';
export { canonicalDecorations } from './canonical-decorations.js';
export type { CanonicalViewSource } from './canonical-view.js';
export { canonicalView } from './canonical-view.js';
export { FONT_TIMEOUT, loadTemplateFonts, templateFontFamilies } from './fonts.js';
export type { MeasuringView, MeasuringViewOptions } from './ghost-view.js';
export { mountMeasuringView } from './ghost-view.js';
export type {
  DocumentLayoutOptions,
  SectionLayoutRules,
  SectionPageHeight,
} from './layout-document.js';
export type { PageMetric } from './layout-document.js';
export { layoutDocument } from './layout-document.js';
export { LAYOUT_NOW_META, layoutNow, wantsLayoutNow } from './layout-latency.js';
export {
  isPaginationTransaction,
  layoutStats,
  pageMetrics,
  paginationKey,
} from './layout-marks.js';
export type { LayoutState } from './layout-readiness.js';
export type { PageOverflow } from './layout-validation.js';
export { findPageOverflow } from './layout-validation.js';
export { createListStarts, listStartsKey } from './list-starts.js';
export type { MeasureCache, MeasureOptions } from './measure-blocks.js';
export { createMeasureCache, measureBlock, measureChildBlocks } from './measure-blocks.js';
export type { FootnoteArea } from './measure-footnotes.js';
export { footnoteAreaHeight, measureFootnotes } from './measure-footnotes.js';
export type { PageDebugParts } from './page-debug.js';
export { createPageDebug, pageDebugKey } from './page-debug.js';
export type { PageBox } from './page-geometry.js';
export { pageAtPoint, pageBoxes, pageElements } from './page-geometry.js';
export type { LaidOutPage, PageMap } from './page-map.js';
export { createPageMap, pageMap } from './page-map.js';
export type { PageVariablesOptions, VariableValue } from './page-variables.js';
export { createPageVariables, pageVariablesKey, refreshPageVariables } from './page-variables.js';
export type { PaginationStats } from './pagination-stats.js';
export type { PagedProjection, PagedProjectionOptions, ProjectionStats } from './projection.js';
export { createPagedProjection } from './projection.js';
export type { ProjectionMap } from './projection-map.js';
export type { ProjectionView, ProjectionViewOptions } from './projection-view.js';
export { createProjectionView } from './projection-view.js';
