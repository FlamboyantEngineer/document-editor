// The editor's components, built on the base component library.

export type { DocumentCommentsLabels, DocumentCommentsOptions } from './document-comments/index.js';
export type { CommentsFilter, DocumentCommentsPanelProps } from './document-comments/index.js';
export type {
  CommentActionTarget,
  CommentsAudience,
  MentionCardTarget,
} from './document-comments/index.js';
export { DEFAULT_COMMENTS_LABELS } from './document-comments/index.js';
export { DocumentCommentsPanel } from './document-comments/index.js';
export type {
  ContextKind,
  ContextMenuGroup,
  ContextMenuPlacement,
  ContextMenuProvider,
  ContextTarget,
  DocumentComparison,
  DocumentContextMenuOptions,
  DocumentEditorDebug,
  DocumentEditorHandle,
  DocumentEditorLabels,
  DocumentEditorNotifications,
  DocumentEditorProps,
  DocumentLayout,
  DocumentMarkup,
  DocumentMenu,
  DocumentMenubarOptions,
  DocumentToolbarOptions,
  EditorContext,
  ObjectDialog,
  ToolbarButtonItem,
  ToolbarCustomItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarMenuItem,
} from './document-editor/index.js';
export type { ChangeBar } from './document-editor/index.js';
export {
  CODE_LANGUAGES,
  CONTEXT_MENU_GROUPS,
  DEFAULT_EDITOR_LABELS,
  DEFAULT_SYMBOLS,
  DocumentEditor,
  EDITOR_COUNTS,
  EDITOR_MEASURES,
  isContentChange,
  menubarMenus,
  TOOLBAR_GROUPS,
  useDocumentEditor,
  ZOOM_LEVELS,
} from './document-editor/index.js';
export type {
  BuiltInPane,
  DocumentOutlineProps,
  DocumentPane,
  DocumentPanelsLabels,
  DocumentPropertiesProps,
  DocumentSearchPaneProps,
  DocumentSidePanelProps,
} from './document-panels/index.js';
export {
  DEFAULT_PANELS_LABELS,
  DocumentOutline,
  DocumentProperties,
  DocumentSearchPane,
  DocumentSidePanel,
} from './document-panels/index.js';
export type {
  SettingKind,
  TemplateEditorLabels,
  TemplateEditorProps,
  TemplateJsonEditorLabels,
  TemplateJsonEditorProps,
  TemplateScopeLabels,
  TemplateSetting,
  TemplateSettingSection,
} from './template-editor/index.js';
export {
  DEFAULT_TEMPLATE_EDITOR_LABELS,
  PAGE_SIZES,
  SECTION_SETTINGS,
  settingAt,
  TEMPLATE_SECTIONS,
  TemplateEditor,
  TemplateJsonEditor,
  TEXT_STYLE_SETTINGS,
  TEXT_STYLES,
  withRegionChange,
  withSection,
  withSetting,
} from './template-editor/index.js';
