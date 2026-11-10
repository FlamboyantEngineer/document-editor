// The template editor: a template's settings in a filterable property panel, by section — its
// name, page setup, text styles picked one at a time, header and footer, lists, tables, code
// blocks, footnotes, the table of contents and change bars. Each field holds the template's own
// value and shows the one it inherits from its parent while it has none; clearing a field inherits
// again. Every change hands the host a new template, so a document beside it restyles at once.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { PropertyFilter } from '@flamboyantengineer/ui-components/property-filter';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { SettingRow } from './setting-row.js';
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
export interface TemplateEditorLabels {
  readonly panel: string;
  readonly filter: string;
  readonly identity: string;
  readonly name: string;
  readonly textStyles: string;
  readonly style: string;
  readonly numbering: string;
  /** Names an inherited value. */
  readonly inherited: (value: string) => string;
}

/** The template editor's English text. */
export const DEFAULT_TEMPLATE_EDITOR_LABELS: TemplateEditorLabels = {
  panel: 'Template settings',
  filter: 'Filter settings',
  identity: 'Identity',
  name: 'Name',
  textStyles: 'Text styles',
  style: 'Style',
  numbering: 'Numbering format',
  inherited: (value) => `Inherited: ${value}`,
};

/** What the template editor edits. */
export interface TemplateEditorProps {
  /** The template's own settings. */
  readonly template: TemplateFile;
  /** The template resolved with its parents, whose values show where the template sets none. */
  readonly resolved?: TemplateFile | undefined;
  /** Receives the template after each change. */
  readonly onChange: (template: TemplateFile) => void;
  readonly labels?: Partial<TemplateEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

interface Rows {
  readonly props: TemplateEditorProps;
  readonly labels: TemplateEditorLabels;
}

function rows(
  { props, labels }: Rows,
  scope: readonly string[],
  settings: readonly TemplateSetting[],
) {
  const { template, resolved, onChange, isDisabled } = props;
  return settings.map((setting) => {
    const path = [...scope, ...setting.path];
    return (
      <SettingRow
        key={setting.id}
        setting={setting}
        value={settingAt(template, path)}
        inherited={resolved ? settingAt(resolved, path) : undefined}
        onChange={(value) => onChange(withSetting(template, path, value))}
        inheritedLabel={labels.inherited}
        isDisabled={isDisabled}
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

/** Edits a template's settings, handing each change to the host. */
export function TemplateEditor(props: TemplateEditorProps) {
  const labels = { ...DEFAULT_TEMPLATE_EDITOR_LABELS, ...props.labels };
  const context = { props, labels };
  const { template, onChange, isDisabled } = props;
  return (
    <PropertyFilter
      {...hooks.root({ className: props.className })}
      aria-label={labels.panel}
      placeholder={labels.filter}
      isDisabled={isDisabled}
    >
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
      </PropertySection>
      <TextStyles {...context} />
      {TEMPLATE_SECTIONS.map((section) => (
        <PropertySection key={section.id} id={section.id} title={section.title}>
          {rows(context, section.scope, section.settings)}
        </PropertySection>
      ))}
    </PropertyFilter>
  );
}
