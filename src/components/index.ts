// The editor's components, built on the base component library.

export type { DocumentCommentsLabels, DocumentCommentsOptions } from './document-comments/index.js';
export { DEFAULT_COMMENTS_LABELS } from './document-comments/index.js';
export type {
  DocumentComparison,
  DocumentEditorLabels,
  DocumentEditorProps,
  DocumentLayout,
  DocumentToolbarOptions,
  EditorContext,
  ToolbarButtonItem,
  ToolbarCustomItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarMenuItem,
} from './document-editor/index.js';
export {
  DEFAULT_EDITOR_LABELS,
  DocumentEditor,
  TOOLBAR_GROUPS,
  useDocumentEditor,
} from './document-editor/index.js';
