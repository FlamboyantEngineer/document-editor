// The editor's pagination runtime: laying the whole document out on pages with the layout engine,
// and keeping an editor on its pages as it changes.

export type { CanonicalChange, CanonicalTaken } from './canonical-change.js';
export type { DecorationSource } from './canonical-decorations.js';
export { canonicalDecorations } from './canonical-decorations.js';
export type { CanonicalViewSource } from './canonical-view.js';
export { canonicalView } from './canonical-view.js';
export { FONT_TIMEOUT, loadTemplateFonts, templateFontFamilies } from './fonts.js';
export type { FootnoteArea } from './footnote-area.js';
export { footnoteAreaHeight } from './footnote-area.js';
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
export type { LayoutTrace, LayoutTraceSink } from './layout-trace.js';
export type { PageOverflow, WrappedBlock } from './layout-validation.js';
export { findPageOverflow, findWrappedLines } from './layout-validation.js';
export { createListStarts, listStartsKey } from './list-starts.js';
export type { PageDebugOptions, PageDebugParts, PageDebugSheet } from './page-debug.js';
export { createPageDebug, debugLength, pageDebugKey } from './page-debug.js';
export type { PageBox } from './page-geometry.js';
export { pageAtPoint, pageBoxes, pageElements } from './page-geometry.js';
export type { LaidOutPage, PageMap } from './page-map.js';
export { createPageMap, pageMap } from './page-map.js';
export { createPageVariables, pageVariablesKey, refreshPageVariables } from './page-variables.js';
export type { PaginationStats } from './pagination-stats.js';
export type { PagedProjection, PagedProjectionOptions, ProjectionStats } from './projection.js';
export { createPagedProjection } from './projection.js';
export type { ProjectionMap } from './projection-map.js';
export type { ProjectionView, ProjectionViewOptions } from './projection-view.js';
export { createProjectionView } from './projection-view.js';
export {
  type BrowserLayoutReason,
  loadPagesFonts,
  type PagesFonts,
  type ServedFonts,
} from './served-fonts.js';
export { PAGE_GENERICS, renameTemplateFonts, resolveServedTemplate } from './served-template.js';
export type { TextLayoutSetting } from './text-engine-holder.js';
export type { TextEngineStats, TextLayoutMode } from './text-engine-types.js';
export type { BlockTextLines, ComputedLine, PageTextLines } from './text-lines.js';
