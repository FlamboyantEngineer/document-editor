export { TEMPLATE_SECTIONS } from './settings-catalog.js';
export type { TemplateEditorLabels, TemplateEditorProps } from './template-editor.js';
export {
  DEFAULT_TEMPLATE_EDITOR_LABELS,
  TemplateEditor,
  withRegionChange,
} from './template-editor.js';
export type {
  TemplateExtensionField,
  TemplateExtensionPane,
  TemplateExtensionRow,
  TemplateExtensionSection,
  TemplateExtensionSlots,
} from './template-extensions.js';
export type { TemplateIdentityLabels, TemplateParentOption } from './template-identity.js';
export { templateIdOf } from './template-identity.js';
export type { TemplateJsonEditorLabels, TemplateJsonEditorProps } from './template-json-editor.js';
export { TemplateJsonEditor } from './template-json-editor.js';
export type { TemplateScopeLabels } from './template-scope.js';
export { SECTION_SETTINGS } from './template-scope.js';
export type { TemplateScope, TemplateScopeProps } from './template-scope-state.js';
export type { SectionNameProblem, SectionRename } from './template-section-list.js';
export {
  freshSectionName,
  renameSection,
  sectionNameOf,
  withNamedSection,
  withoutSection,
  withSectionAt,
  withSectionMoved,
} from './template-section-list.js';
export type {
  SettingKind,
  StylePart,
  TemplateSetting,
  TemplateSettingCard,
  TemplateSettingSection,
  TemplateSettingsLabels,
} from './template-settings.js';
export {
  DEFAULT_CODE_FONTS,
  DEFAULT_FONTS,
  DEFAULT_TEMPLATE_SETTINGS_LABELS,
  NUMBERING_HINT,
  PAGE_SIZES,
  settingAt,
  TEXT_STYLE_SETTINGS,
  TEXT_STYLES,
  withSetting,
} from './template-settings.js';
