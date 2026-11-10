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
  ObjectDialog,
  ToolbarButtonItem,
  ToolbarCustomItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarMenuItem,
} from './document-editor/index.js';
export {
  CODE_LANGUAGES,
  CONTEXT_MENU_GROUPS,
  DEFAULT_EDITOR_LABELS,
  DEFAULT_SYMBOLS,
  DocumentEditor,
  EDITOR_MEASURES,
  isContentChange,
  TOOLBAR_GROUPS,
  useDocumentEditor,
  ZOOM_LEVELS,
} from './document-editor/index.js';
export type {
  RegionContentLabels,
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
  withSection,
  withSetting,
} from './template-editor/index.js';
