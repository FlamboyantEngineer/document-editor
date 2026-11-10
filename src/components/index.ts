// The editor's components, built on the base component library.

export type { DocumentCommentsLabels, DocumentCommentsOptions } from './document-comments/index.js';
export { DEFAULT_COMMENTS_LABELS } from './document-comments/index.js';
export type {
  ContextKind,
  ContextMenuGroup,
  ContextMenuPlacement,
  ContextMenuProvider,
  ContextTarget,
  DocumentComparison,
  DocumentContextMenuOptions,
  DocumentEditorHandle,
  DocumentEditorLabels,
  DocumentEditorNotifications,
  DocumentEditorProps,
  DocumentLayout,
  DocumentMarkup,
  DocumentToolbarOptions,
  EditorContext,
  ToolbarButtonItem,
  ToolbarCustomItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarMenuItem,
} from './document-editor/index.js';
export {
  CONTEXT_MENU_GROUPS,
  DEFAULT_EDITOR_LABELS,
  DocumentEditor,
  EDITOR_MEASURES,
  isContentChange,
  TOOLBAR_GROUPS,
  useDocumentEditor,
  ZOOM_LEVELS,
} from './document-editor/index.js';
