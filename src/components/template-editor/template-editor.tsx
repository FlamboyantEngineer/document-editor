// The template editor: a template's settings in a filterable property panel, by section — its
// name and parent, page setup, text styles picked one at a time, header and footer with their
// content, lists, tables, code blocks, footnotes, the table of contents and change bars — for the
// whole document or one of its template sections. Each field holds the template's own value and
// shows the one it inherits while it has none; clearing a field inherits again. Every change hands
// the host a new template, so a document beside it restyles at once.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { PropertyFilter } from '@flamboyantengineer/ui-components/property-filter';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import type { RegionChange } from '../../engine/index.js';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type Rows, SettingSections, type Target } from './template-rows.js';
import {
  ScopePicker,
  SectionRows,
  type TemplateScopeLabels,
  withListedSections,
  withSection,
} from './template-scope.js';
import {
  DEFAULT_TEMPLATE_SETTINGS_LABELS,
  type TemplateSettingsLabels,
  withSetting,
} from './template-settings.js';

const hooks = createHooks('template-editor');

/** The template editor's own text. */
export interface TemplateEditorLabels extends TemplateScopeLabels, TemplateSettingsLabels {
  readonly panel: string;
  readonly filter: string;
  readonly identity: string;
  readonly name: string;
  readonly parent: string;
  readonly noParent: string;
  readonly textStyles: string;
  readonly numbering: string;
  readonly font: string;
  readonly size: string;
  /** Names the weight, slant and underline toggles and the alignment together. */
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
}

/** The template editor's English text. */
export const DEFAULT_TEMPLATE_EDITOR_LABELS: TemplateEditorLabels = {
  ...DEFAULT_TEMPLATE_SETTINGS_LABELS,
  panel: 'Template settings',
  filter: 'Filter settings',
  identity: 'Identity',
  name: 'Name',
  parent: 'Parent template',
  noParent: 'Base template',
  textStyles: 'Text styles',
  numbering: 'Numbering',
  font: 'Font',
  size: 'Size',
  face: 'Weight & align',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  alignment: 'Alignment',
  alignments: { left: 'Left', center: 'Centre', right: 'Right', justify: 'Justify' },
  colour: 'Colour',
  spacing: 'Spacing',
  spaceBefore: 'Space before',
  spaceAfter: 'Space after',
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
  inherited: (value, source) =>
    source ? `Inherited from ${source}: ${value}` : `Inherited: ${value}`,
  scope: 'Settings of',
  documentScope: 'The document',
  addSection: 'Add a section',
  deleteSection: 'Delete the section',
  section: 'Section',
};

/** What the template editor edits. */
export interface TemplateEditorProps {
  /** The template's own settings. */
  readonly template: TemplateFile;
  /** The template resolved with its parents, whose values show where the template sets none. */
  readonly resolved?: TemplateFile | undefined;
  /** Receives the template after each change. */
  readonly onChange: (template: TemplateFile) => void;
  /**
   * The templates the template may inherit from, by id; one that inherits from the template
   * itself is left out by the host, so a parent never makes a cycle.
   */
  readonly parentOptions?: readonly { readonly id: string; readonly label: string }[] | undefined;
  /** The fonts the font fields suggest; others may be typed. */
  readonly fonts?: readonly string[] | undefined;
  /** The fonts the code font fields suggest, monospace ones; others may be typed. */
  readonly codeFonts?: readonly string[] | undefined;
  readonly labels?: Partial<TemplateEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

// The name and the parent of the template.
function Identity({ props, labels }: { props: TemplateEditorProps; labels: TemplateEditorLabels }) {
  const { template, onChange, parentOptions } = props;
  const parents = (parentOptions ?? []).filter((option) => option.id !== template.id);
  return (
    <PropertySection id="identity" title={labels.identity} defaultExpanded>
      <PropertyRow label={labels.name}>
        <TextField
          label={labels.name}
          labelLayout="control-only"
          density="compact"
          tracksChanges={false}
          value={template.name ?? ''}
          onChange={(name) => onChange(withSetting(template, ['name'], name || null))}
        />
      </PropertyRow>
      {parentOptions ? (
        <PropertyRow label={labels.parent}>
          <SelectField
            label={labels.parent}
            labelLayout="control-only"
            density="compact"
            tracksChanges={false}
            options={[{ id: '', label: labels.noParent }, ...parents]}
            value={template.parent ?? ''}
            onChange={(key: Key | null) =>
              onChange(withSetting(template, ['parent'], typeof key === 'string' ? key : null))
            }
          />
        </PropertyRow>
      ) : null}
    </PropertySection>
  );
}

// The target of the rows: the template, or its section at an index over the resolved document.
function targetOf(
  props: TemplateEditorProps,
  scope: number | null,
  labels: TemplateEditorLabels,
): Target {
  const { template, resolved, onChange } = props;
  const listed = withListedSections(template, resolved);
  const section = scope === null ? undefined : listed.sections?.[scope];
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
        withSection(listed, scope, withSetting(own, path, value) as unknown as TemplateSection),
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
  const index = listed.sections?.findIndex((section) => section.name === change.section) ?? -1;
  const section = index >= 0 ? listed.sections?.[index] : undefined;
  const own = section?.[change.region];
  if (section && own && own.inherit !== true) {
    const own = withSetting(
      section as unknown as TemplateFile,
      [change.region, 'content'],
      change.content,
    );
    return withSection(listed, index, own as unknown as TemplateSection);
  }
  return withSetting(template, [change.region, 'content'], change.content);
}

/** Edits a template's settings, handing each change to the host. */
export function TemplateEditor(props: TemplateEditorProps) {
  const labels = { ...DEFAULT_TEMPLATE_EDITOR_LABELS, ...props.labels };
  const [picked, setScope] = useState<number | null>(null);
  const { onChange, isDisabled } = props;
  // The sections the picker and a section's rows show and change: the inherited ones too.
  const template = withListedSections(props.template, props.resolved);
  const scope = picked !== null && template.sections?.[picked] ? picked : null;
  const context: Rows = { props, labels, target: targetOf(props, scope, labels) };
  return (
    <PropertyFilter
      {...hooks.root({
        className: props.className,
        data: { scope: scope === null ? 'document' : 'section' },
      })}
      aria-label={labels.panel}
      placeholder={labels.filter}
      isDisabled={isDisabled}
    >
      <Identity props={props} labels={labels} />
      <PropertySection id="scope" title={labels.scope} defaultExpanded>
        <ScopePicker
          template={template}
          scope={scope}
          onScopeChange={setScope}
          onChange={onChange}
          labels={labels}
          isDisabled={isDisabled}
        />
      </PropertySection>
      {scope === null ? null : (
        <SectionRows
          template={template}
          index={scope}
          onChange={onChange}
          labels={labels}
          isDisabled={isDisabled}
        />
      )}
      <SettingSections context={context} inSection={scope !== null} />
    </PropertyFilter>
  );
}
