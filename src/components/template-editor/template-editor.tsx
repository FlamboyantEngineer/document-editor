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
import type { StoredContent, TemplateFile, TemplateSection } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { type RegionContentLabels, RegionContentRow } from './region-content-editor.js';
import { SettingRow } from './setting-row.js';
import {
  ScopePicker,
  SECTION_SCOPED,
  SectionRows,
  type TemplateScopeLabels,
  withSection,
} from './template-scope.js';
import {
  settingAt,
  TEMPLATE_SECTIONS,
  type TemplateSetting,
  TEXT_STYLE_SETTINGS,
  TEXT_STYLES,
  withSetting,
} from './template-settings.js';

const hooks = createHooks('template-editor');

/** The template editor's own text. */
export interface TemplateEditorLabels extends TemplateScopeLabels, RegionContentLabels {
  readonly panel: string;
  readonly filter: string;
  readonly identity: string;
  readonly name: string;
  readonly parent: string;
  readonly noParent: string;
  readonly textStyles: string;
  readonly style: string;
  readonly numbering: string;
}

/** The template editor's English text. */
export const DEFAULT_TEMPLATE_EDITOR_LABELS: TemplateEditorLabels = {
  panel: 'Template settings',
  filter: 'Filter settings',
  identity: 'Identity',
  name: 'Name',
  parent: 'Parent template',
  noParent: 'Base template',
  textStyles: 'Text styles',
  style: 'Style',
  numbering: 'Numbering format',
  inherited: (value) => `Inherited: ${value}`,
  scope: 'Settings of',
  documentScope: 'The document',
  addSection: 'Add a section',
  deleteSection: 'Delete the section',
  section: 'Section',
  regionContent: (region) => (region === 'header' ? 'Header content' : 'Footer content'),
  apply: 'Apply',
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
  readonly labels?: Partial<TemplateEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

// What the rows read and change: the document's settings, or a section's over them.
interface Target {
  readonly own: TemplateFile;
  readonly inherited: TemplateFile | undefined;
  readonly set: (path: readonly string[], value: unknown) => void;
}

interface Rows {
  readonly props: TemplateEditorProps;
  readonly labels: TemplateEditorLabels;
  readonly target: Target;
}

function rows(
  { props, labels, target }: Rows,
  scope: readonly string[],
  settings: readonly TemplateSetting[],
) {
  return settings.map((setting) => {
    const path = [...scope, ...setting.path];
    return (
      <SettingRow
        key={setting.id}
        setting={setting}
        value={settingAt(target.own, path)}
        inherited={target.inherited ? settingAt(target.inherited, path) : undefined}
        onChange={(value) => target.set(path, value)}
        inheritedLabel={labels.inherited}
        isDisabled={props.isDisabled}
      />
    );
  });
}

// The text styles: a picker, then the picked style's settings.
function TextStyles(context: Rows) {
  const [style, setStyle] = useState<string>('paragraph');
  const { labels } = context;
  const scope = ['styles', style];
  const numbering: TemplateSetting = {
    id: 'numbering',
    path: ['numbering', 'format'],
    label: labels.numbering,
    kind: { type: 'text' },
  };
  return (
    <PropertySection id="text-styles" title={labels.textStyles} defaultExpanded>
      <PropertyRow label={labels.style}>
        <SelectField
          label={labels.style}
          labelLayout="control-only"
          density="compact"
          tracksChanges={false}
          options={TEXT_STYLES}
          value={style}
          onChange={(key: Key | null) => {
            if (typeof key === 'string') setStyle(key);
          }}
        />
      </PropertyRow>
      {rows(
        context,
        scope,
        style.startsWith('heading') ? [...TEXT_STYLE_SETTINGS, numbering] : TEXT_STYLE_SETTINGS,
      )}
    </PropertySection>
  );
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
          onChange={(name) => onChange(withSetting(template, ['name'], name))}
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
function targetOf(props: TemplateEditorProps, scope: number | null): Target {
  const { template, resolved, onChange } = props;
  const section = scope === null ? undefined : template.sections?.[scope];
  if (scope === null || !section) {
    return {
      own: template,
      inherited: resolved,
      set: (path, value) => onChange(withSetting(template, path, value)),
    };
  }
  const own = section as unknown as TemplateFile;
  return {
    own,
    inherited: resolved ?? template,
    set: (path, value) =>
      onChange(
        withSection(template, scope, withSetting(own, path, value) as unknown as TemplateSection),
      ),
  };
}

// The header's and footer's content, edited as a document.
function RegionRows({ context }: { context: Rows }) {
  const { props, labels, target } = context;
  const template = props.resolved ?? props.template;
  return (['header', 'footer'] as const).map((region) => (
    <RegionContentRow
      key={region}
      region={region}
      content={settingAt(target.own, [region, 'content']) as StoredContent | undefined}
      template={template}
      labels={labels}
      onChange={(content) => target.set([region, 'content'], content)}
      isDisabled={props.isDisabled}
    />
  ));
}

/** Edits a template's settings, handing each change to the host. */
export function TemplateEditor(props: TemplateEditorProps) {
  const labels = { ...DEFAULT_TEMPLATE_EDITOR_LABELS, ...props.labels };
  const [picked, setScope] = useState<number | null>(null);
  const scope = picked !== null && props.template.sections?.[picked] ? picked : null;
  const context: Rows = { props, labels, target: targetOf(props, scope) };
  const { template, onChange, isDisabled } = props;
  const sections = TEMPLATE_SECTIONS.filter(
    (section) => scope === null || SECTION_SCOPED.has(section.id),
  );
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
      <TextStyles {...context} />
      {sections.map((section) => (
        <PropertySection key={section.id} id={section.id} title={section.title}>
          {rows(context, section.scope, section.settings)}
          {section.id === 'regions' ? <RegionRows context={context} /> : null}
        </PropertySection>
      ))}
    </PropertyFilter>
  );
}
