// The template editor: a template's settings in a filterable property panel, by section — its
// identity, page setup, text styles picked one at a time, header and footer with their content,
// lists, tables, code blocks, footnotes, the table of contents and change bars, and a host's own
// settings in extension slots — for the whole document or one of its template sections, picked by
// name. Each field holds the template's own value and shows the one it inherits while it has none;
// clearing a field inherits again. Every change hands the host a new template, so a document beside
// it restyles at once.

import { PropertyPanel, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import type { Ref } from 'react';
import type { RegionChange } from '../../engine/index.js';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import type { DocumentLayout } from '../document-editor/document-editor.js';
import { TemplateDrafts, type TemplateDraftState } from './setting-drafts.js';
import type { TemplateReferenceType } from './settings-catalog.js';
import { templateEditorHooks as hooks } from './template-editor-hooks.js';
import {
  extensionRows,
  ExtensionSections,
  type TemplateExtensionSlots,
} from './template-extensions.js';
import {
  DEFAULT_TEMPLATE_IDENTITY_LABELS,
  TemplateIdentity,
  type TemplateIdentityLabels,
  type TemplateParentOption,
} from './template-identity.js';
import { type Rows, SettingSections, type Target } from './template-rows.js';
import {
  DEFAULT_TEMPLATE_SCOPE_LABELS,
  ScopePicker,
  SectionRows,
  type TemplateScopeLabels,
  withListedSections,
} from './template-scope.js';
import {
  type TemplateScope,
  type TemplateScopeProps,
  useTemplateScope,
} from './template-scope-state.js';
import { withNamedSection } from './template-section-list.js';
import {
  DEFAULT_TEMPLATE_SETTINGS_LABELS,
  type TemplateSettingsLabels,
  withSetting,
} from './template-settings.js';

/** The template editor's own text. */
export interface TemplateEditorLabels
  extends TemplateScopeLabels, TemplateIdentityLabels, TemplateSettingsLabels {
  readonly panel: string;
  readonly filter: string;
  readonly textStyles: string;
  /** Names a section's heading numbering rows. */
  readonly headingNumbering: string;
  readonly numbering: string;
  readonly font: string;
  readonly size: string;
  /** Names the weight, slant and underline toggles together. */
  readonly face: string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly alignment: string;
  readonly alignments: Readonly<Record<'left' | 'center' | 'right' | 'justify', string>>;
  readonly colour: string;
  readonly spacing: string;
  readonly spaceBefore: string;
  readonly spaceAfter: string;
  /** The short label of the space before, beside its field. */
  readonly before: string;
  /** The short label of the space after, beside its field. */
  readonly after: string;
  readonly lineHeight: string;
  readonly styleName: string;
  readonly overrideCustomStyle: string;
  /** Marks a custom style the template inherits. */
  readonly inheritedStyle: string;
  readonly noCustomStyles: string;
  readonly numberPrefix: string;
  readonly numberSuffix: string;
  /** Where a section's inherited values come from. */
  readonly documentSettings: string;
  readonly customStyle: string;
  readonly addCustomStyle: string;
  readonly deleteCustomStyle: string;
  /** Drops a scope's override of an inherited custom style, so the inherited one shows again. */
  readonly resetCustomStyle: string;
}

/** The template editor's English text. */
export const DEFAULT_TEMPLATE_EDITOR_LABELS: TemplateEditorLabels = {
  ...DEFAULT_TEMPLATE_SETTINGS_LABELS,
  ...DEFAULT_TEMPLATE_IDENTITY_LABELS,
  ...DEFAULT_TEMPLATE_SCOPE_LABELS,
  panel: 'Template settings',
  filter: 'Filter settings',
  textStyles: 'Text styles',
  headingNumbering: 'Heading numbering',
  numbering: 'Numbering',
  font: 'Font',
  size: 'Size',
  face: 'Bold, italic and underline',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  alignment: 'Alignment',
  alignments: { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' },
  colour: 'Colour',
  spacing: 'Spacing',
  spaceBefore: 'Space before',
  spaceAfter: 'Space after',
  before: 'Before',
  after: 'After',
  lineHeight: 'Line height',
  styleName: 'Name',
  overrideCustomStyle: 'Override the inherited style',
  inheritedStyle: 'inherited',
  noCustomStyles: 'No custom styles yet.',
  numberPrefix: 'Before the number',
  numberSuffix: 'After the number',
  documentSettings: 'the document settings',
  customStyle: 'Custom styles',
  addCustomStyle: 'Add a style',
  deleteCustomStyle: 'Delete the style',
  resetCustomStyle: 'Use the inherited style',
  inherited: (value, source) =>
    source ? `Inherited from ${source}: ${value}` : `Inherited: ${value}`,
};

/** What the template editor edits. */
export interface TemplateEditorProps extends TemplateScopeProps {
  /** The template's own settings. */
  readonly template: TemplateFile;
  /** The template resolved with its parents, whose values show where the template sets none. */
  readonly resolved?: TemplateFile | undefined;
  /** Receives the template after each change. */
  readonly onChange: (template: TemplateFile) => void;
  /**
   * Receives a template section's old and new name once a rename is committed, so the host can
   * follow it in what refers to the section by name.
   */
  readonly onSectionRename?: ((from: string, to: string) => void) | undefined;
  /**
   * The templates the template may inherit from, by id; one marked `cycle` inherits from the
   * template, so it is shown and cannot be picked.
   */
  readonly parentOptions?: readonly TemplateParentOption[] | undefined;
  /** Why the template's parent could not be loaded, shown under the parent field. */
  readonly parentError?: string | undefined;
  /** Whether the host has never saved the template, so its id is still a row to edit. */
  readonly isNew?: boolean | undefined;
  /** Why the id cannot be saved, shown under its field, such as a save asked for without one. */
  readonly idError?: string | undefined;
  /** The id field's input, which a host focuses, such as when a save needs an id. */
  readonly idInputRef?: Ref<HTMLInputElement> | undefined;
  /** Whether the template's name is shown read-only. */
  readonly isNameReadOnly?: boolean | undefined;
  /**
   * Whether the panel picks the scope itself, adding, moving and deleting sections. Defaults to
   * true; a host that draws the scopes as tabs, as the template workspace does, turns it off.
   */
  readonly showsScopePicker?: boolean | undefined;
  /** The host's own settings, kept in the template's `extensions`. */
  readonly extensions?: TemplateExtensionSlots | undefined;
  /**
   * The layout the template is for: on pages, or the web layout, which has no page size,
   * orientation, header or footer rows. Defaults to pages.
   */
  readonly layout?: DocumentLayout | undefined;
  /** The fonts the font fields suggest; others may be typed. */
  readonly fonts?: readonly string[] | undefined;
  /**
   * The host's reference types besides other documents, as the schema knows them
   * (`referenceTypes`), each with a format and a link switch in the references section.
   */
  readonly referenceTypes?: readonly TemplateReferenceType[] | undefined;
  /** The fonts the code font fields suggest, monospace ones; others may be typed. */
  readonly codeFonts?: readonly string[] | undefined;
  /**
   * Hears the state of the fields' drafts: `pending` while a field holds a draft it has not
   * committed, so a host can offer to save, and `invalid` while one is not valid, such as a length
   * that does not read as one, so the host can hold a save until it is corrected.
   */
  readonly onDraftsChange?: ((state: TemplateDraftState) => void) | undefined;
  readonly labels?: Partial<TemplateEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

// The target of the rows: the template, or its named section over the resolved document. The
// template lists the sections it inherits, so a change to one writes the whole list.
function targetOf(
  props: TemplateEditorProps,
  { listed, scope }: { listed: TemplateFile; scope: TemplateScope },
  labels: TemplateEditorLabels,
): Target {
  const { template, resolved, onChange } = props;
  const section = listed.sections?.find((entry) => entry.name === scope);
  if (scope === null || !section) {
    const parent = props.parentOptions?.find((option) => option.id === template.parent);
    return {
      own: template,
      inherited: resolved,
      source: parent?.label ?? labels.noParent,
      set: (path, value) => onChange(withSetting(template, path, value)),
    };
  }
  const own = section as unknown as TemplateFile;
  return {
    own,
    inherited: resolved ?? template,
    source: labels.documentSettings,
    set: (path, value) =>
      onChange(
        withNamedSection(
          listed,
          scope,
          () => withSetting(own, path, value) as unknown as TemplateSection,
        ),
      ),
  };
}

/**
 * A template with a region edited on the pages written into it, where the section's pages take the
 * region from (`resolveSectionRegion`): into the section's own region while it has one that does
 * not inherit, and into the document's otherwise. Given the resolved template, a section the
 * template inherits counts too, and the template takes the inherited sections with the edit.
 */
export function withRegionChange(
  template: TemplateFile,
  change: RegionChange,
  resolved?: TemplateFile,
): TemplateFile {
  const listed = withListedSections(template, resolved);
  const section = listed.sections?.find((entry) => entry.name === change.section);
  const own = section?.[change.region];
  if (section && own && own.inherit !== true) {
    return withNamedSection(
      listed,
      section.name,
      (entry) =>
        withSetting(
          entry as unknown as TemplateFile,
          [change.region, 'content'],
          change.content,
        ) as unknown as TemplateSection,
    );
  }
  return withSetting(template, [change.region, 'content'], change.content);
}

// The sections of the panel that start open.
const OPEN_SECTIONS = ['identity', 'scope', 'section'];

/** Edits a template's settings, handing each change to the host. */
export function TemplateEditor(props: TemplateEditorProps) {
  const labels = { ...DEFAULT_TEMPLATE_EDITOR_LABELS, ...props.labels };
  const { onChange, isDisabled, extensions } = props;
  // The sections the picker and a section's rows show and change: the inherited ones too.
  const template = withListedSections(props.template, props.resolved);
  const [scope, setScope] = useTemplateScope(props, template.sections);
  const context: Rows = {
    props,
    labels,
    target: targetOf(props, { listed: template, scope }, labels),
  };
  const scoped = {
    template,
    scope,
    onScopeChange: setScope,
    onChange,
    onSectionRename: props.onSectionRename,
    labels,
    isDisabled,
  };
  // A host's own settings are the document's: a template section has no `extensions`.
  const slots = scope === null ? extensions : undefined;
  return (
    <TemplateDrafts onDraftsChange={props.onDraftsChange} scope={scope ?? ''}>
      <PropertyPanel
        searchable
        {...hooks.root({
          className: props.className,
          // Each field locks itself while the editor is disabled, so the scope picker stays usable.
          data: { scope: scope === null ? 'document' : 'section', disabled: isDisabled },
        })}
        aria-label={labels.panel}
        searchPlaceholder={labels.filter}
        // Only the identity, the scope and a section's own rows start open.
        defaultExpandedKeys={OPEN_SECTIONS}
      >
        <TemplateIdentity
          template={props.template}
          onChange={onChange}
          parentOptions={props.parentOptions}
          parentError={props.parentError}
          isNew={props.isNew}
          idError={props.idError}
          idInputRef={props.idInputRef}
          isNameReadOnly={props.isNameReadOnly}
          isDisabled={isDisabled}
          labels={labels}
        >
          {slots?.rows?.identity ? extensionRows(context, slots.rows.identity) : null}
        </TemplateIdentity>
        {props.showsScopePicker === false ? null : (
          <PropertySection id="scope" title={labels.scope} defaultExpanded>
            <ScopePicker {...scoped} />
          </PropertySection>
        )}
        {/* A scope's own rows are its own: turning to another scope commits their drafts. */}
        <SectionRows key={`rows:${scope ?? ''}`} {...scoped} />
        <SettingSections
          context={context}
          inSection={scope !== null}
          onPages={props.layout !== 'web'}
          extra={(id) => (slots?.rows?.[id] ? extensionRows(context, slots.rows[id] ?? []) : null)}
        />
        {slots ? <ExtensionSections context={context} slots={slots} /> : null}
      </PropertyPanel>
    </TemplateDrafts>
  );
}

export type { TemplateDraftState } from './setting-drafts.js';
export { templateIdOf } from './template-identity.js';
export { DEFAULT_TEMPLATE_SCOPE_LABELS, withListedSections } from './template-scope.js';
export type { TemplateScope } from './template-scope-state.js';
export {
  freshSectionName,
  renameSection,
  type SectionNameProblem,
  withNamedSection,
  withoutSection,
  withSectionAt,
} from './template-section-list.js';
