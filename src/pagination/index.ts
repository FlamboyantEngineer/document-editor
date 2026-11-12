// The editor's pagination runtime: measuring laid-out blocks, laying the whole document out on
// pages, and keeping an editor on its pages as it changes.

export type { DocumentLayoutOptions, SectionPageHeight } from './layout-document.js';
export type { PageMetric } from './layout-document.js';
export { layoutDocument } from './layout-document.js';
export type { LayoutState } from './layout-readiness.js';
export type { MeasureCache, MeasureOptions } from './measure-blocks.js';
export { createMeasureCache, measureBlock, measureChildBlocks } from './measure-blocks.js';
export type { FootnoteArea } from './measure-footnotes.js';
export { footnoteAreaHeight, measureFootnotes } from './measure-footnotes.js';
export type { PageDebugParts } from './page-debug.js';
export { createPageDebug, pageDebugKey } from './page-debug.js';
export type { PageVariablesOptions, VariableValue } from './page-variables.js';
export { createPageVariables, pageVariablesKey, refreshPageVariables } from './page-variables.js';
export type { Pagination, PaginationOptions } from './pagination.js';
export {
  createPagination,
  isPaginationTransaction,
  layoutStats,
  pageMetrics,
  paginationKey,
} from './pagination.js';
export type { PaginationStats } from './pagination-stats.js';
