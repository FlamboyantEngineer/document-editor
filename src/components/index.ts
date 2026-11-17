// The editor's components, built on the base component library.

export type { DocumentCommentsLabels, DocumentCommentsOptions } from './document-comments/index.js';
export type { CommentsFilter, DocumentCommentsPanelProps } from './document-comments/index.js';
export type {
  CommentActionTarget,
  CommentsAudience,
  MentionCardTarget,
  ThreadActionTarget,
} from './document-comments/index.js';
export { DEFAULT_COMMENTS_LABELS } from './document-comments/index.js';
export { DocumentCommentsPanel } from './document-comments/index.js';
export type {
  ContextKind,
  ContextMenuGroup,
  ContextMenuPlacement,
  ContextMenuProvider,
  ContextTarget,
  DialogProps,
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
  EditorContentsOptions,
  EditorContext,
  EditorSession,
  EditorSessionDocument,
  FindBarMode,
  HostDialogProps,
  MentionOptions,
  ObjectDialog,
  ReferenceKind,
  SelectionToolbarOptions,
  SlashMenuItem,
  SlashMenuOptions,
  ToolbarButtonItem,
  ToolbarCustomItem,
  ToolbarGroup,
  ToolbarItem,
  ToolbarMenuItem,
  ToolbarOverflow,
} from './document-editor/index.js';
export type { ChangeBar } from './document-editor/index.js';
export type { ContentChangeCause } from './document-editor/index.js';
export type { DocumentBanner } from './document-editor/index.js';
export type {
  DocumentStatusBarOptions,
  StatusBarItem,
  VisibleElement,
  VisiblePage,
} from './document-editor/index.js';
export type { ConnectionStatusLabels, ConnectionStatusProps } from './document-editor/index.js';
export type { LazyEditorSurface } from './document-editor/index.js';
export type {
  ScriptCheck,
  ScriptEditorProps,
  ScriptPreviewState,
  ScriptPreviewViews,
} from './document-editor/index.js';
export { EDITOR_BANNERS } from './document-editor/index.js';
export { preloadEditorSurfaces } from './document-editor/index.js';
export {
  SCRIPT_STANDARD_VOCABULARY,
  ScriptEditor,
  useScriptCheck,
} from './document-editor/index.js';
export {
  DocumentModeStatus,
  DocumentPageStatus,
  DocumentPresence,
  type DocumentPresenceProps,
  DocumentProofingLanguage,
  DocumentProofingStatus,
  DocumentWordStatus,
  STATUS_BAR_ITEMS,
} from './document-editor/index.js';
export { CONNECTION_STATUS_LABELS, ConnectionStatus } from './document-editor/index.js';
export {
  CODE_LANGUAGES,
  contentChangeCause,
  CONTEXT_MENU_GROUPS,
  DEFAULT_EDITOR_LABELS,
  DEFAULT_SYMBOLS,
  DocumentEditor,
  EDITOR_COUNTS,
  EDITOR_LAYOUT_PASS,
  EDITOR_MEASURES,
  EditorModal,
  inlineCompletionItem,
  isContentChange,
  menubarMenus,
  SELECTION_TOOLBAR_GROUPS,
  TOOLBAR_GROUPS,
  useDocumentEditor,
  ZOOM_LEVELS,
} from './document-editor/index.js';
export type {
  BuiltInPane,
  DocumentContributorsProps,
  DocumentOutlineProps,
  DocumentPane,
  DocumentPanelsLabels,
  DocumentPropertiesProps,
  DocumentSearchPaneProps,
  DocumentSidePanelProps,
  PropertiesSection,
  PropertiesSectionExtension,
  PropertiesSectionId,
  RevealPaneOptions,
} from './document-panels/index.js';
export type {
  DocumentHistoryBannerProps,
  DocumentHistoryLabels,
  DocumentHistoryProps,
  HistoricalEditorProps,
} from './document-panels/index.js';
export {
  DEFAULT_PANELS_LABELS,
  DocumentContributors,
  DocumentOutline,
  DocumentProperties,
  DocumentSearchPane,
  DocumentSidePanel,
} from './document-panels/index.js';
export {
  DEFAULT_HISTORY_LABELS,
  DocumentHistory,
  DocumentHistoryBanner,
  historicalEditorProps,
  useDocumentVersions,
} from './document-panels/index.js';
export type {
  DocumentSessionBoundaryProps,
  DocumentSessionEditorProps,
  MergeConflictsLabels,
  MergeConflictsProps,
  SessionLoadingLabels,
  SessionLoadingProps,
} from './document-session/index.js';
export {
  DEFAULT_SESSION_LOADING_LABELS,
  DocumentSessionBoundary,
  MergeConflicts,
  SESSION_MEASURES,
  SessionLoading,
  useDocumentSession,
  useSessionGuard,
  useSessionTelemetry,
  useSessionValue,
} from './document-session/index.js';
export type {
  SettingKind,
  StylePart,
  TemplateEditorLabels,
  TemplateEditorProps,
  TemplateJsonEditorLabels,
  TemplateJsonEditorProps,
  TemplateScopeLabels,
  TemplateSetting,
  TemplateSettingCard,
  TemplateSettingSection,
  TemplateSettingsLabels,
} from './template-editor/index.js';
export type {
  SectionNameProblem,
  SectionRename,
  TemplateExtensionField,
  TemplateExtensionPane,
  TemplateExtensionRow,
  TemplateExtensionSection,
  TemplateExtensionSlots,
  TemplateIdentityLabels,
  TemplateParentOption,
  TemplateScope,
  TemplateScopeProps,
} from './template-editor/index.js';
export {
  DEFAULT_CODE_FONTS,
  DEFAULT_TEMPLATE_EDITOR_LABELS,
  DEFAULT_TEMPLATE_SETTINGS_LABELS,
  PAGE_SIZES,
  SECTION_SETTINGS,
  settingAt,
  TEMPLATE_SECTIONS,
  TemplateEditor,
  TemplateJsonEditor,
  TEXT_STYLES,
  withRegionChange,
  withSetting,
} from './template-editor/index.js';
export {
  freshSectionName,
  renameSection,
  sectionNameOf,
  templateIdOf,
  withNamedSection,
  withoutSection,
  withSectionAt,
  withSectionMoved,
} from './template-editor/index.js';
export type {
  SaveAsFields,
  TemplateCatalog,
  TemplatePickerProps,
  TemplatePreview,
  TemplatePreviewEditorProps,
  TemplateWorkspaceLabels,
  TemplateWorkspaceParts,
  TemplateWorkspaceProps,
} from './template-workspace/index.js';
export {
  DEFAULT_TEMPLATE_WORKSPACE_LABELS,
  TEMPLATE_PREVIEW_STATUS_BAR,
  TEMPLATE_PREVIEW_TOOLBAR,
  TEMPLATE_PREVIEW_ZOOM_LEVELS,
  TemplatePicker,
  TemplatePreviewEditor,
  TemplateWorkspace,
} from './template-workspace/index.js';
