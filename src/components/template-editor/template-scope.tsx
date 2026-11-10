// What the template editor edits: the document's settings, or one template section's, which a
// section sets over the document's. A picker chooses among them, adds a section and deletes the
// one shown; a section's own rows set its name, label and flags.

import { Button } from '@flamboyantengineer/ui-components/button';
import { type Key, PlusGlyph } from '@flamboyantengineer/ui-components/core';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import { SettingRow } from './setting-row.js';
import { settingAt, type TemplateSetting, withSetting } from './template-settings.js';

/** The scope's text. */
export interface TemplateScopeLabels {
  readonly scope: string;
  readonly documentScope: string;
  readonly addSection: string;
  readonly deleteSection: string;
  readonly section: string;
  readonly inherited: (value: string) => string;
}

/** The settings of a section only. */
export const SECTION_SETTINGS: readonly TemplateSetting[] = [
  { id: 'name', path: ['name'], label: 'Name', kind: { type: 'text' } },
  { id: 'label', path: ['label'], label: 'Label', kind: { type: 'text' } },
  { id: 'required', path: ['required'], label: 'Every document has it', kind: { type: 'boolean' } },
  { id: 'editable', path: ['editable'], label: 'Writers may edit it', kind: { type: 'boolean' } },
  {
    id: 'insertable',
    path: ['insertable'],
    label: 'Writers may add and remove it',
    kind: { type: 'boolean' },
  },
  {
    id: 'restartNumbering',
    path: ['restartNumbering'],
    label: 'Restarts the numbering',
    kind: { type: 'boolean' },
  },
];

/** The ids of the editor's sections a template section may set. */
export const SECTION_SCOPED = new Set([
  'page',
  'regions',
  'lists',
  'tables',
  'code',
  'footnotes',
  'change-bars',
]);

/** A template with one of its sections changed, or taken out for null. */
export function withSection(
  template: TemplateFile,
  index: number,
  section: TemplateSection | null,
): TemplateFile {
  const sections = [...(template.sections ?? [])];
  if (section) sections[index] = section;
  else sections.splice(index, 1);
  return { ...template, sections };
}

// A name no section of the template has yet.
function freshName(template: TemplateFile): string {
  const names = new Set((template.sections ?? []).map((section) => section.name));
  let index = names.size + 1;
  while (names.has(`section_${String(index)}`)) index += 1;
  return `section_${String(index)}`;
}

/** Picks the scope: the document, or a section; adds a section and deletes the one shown. */
export function ScopePicker({
  template,
  scope,
  onScopeChange,
  onChange,
  labels,
  isDisabled,
}: {
  template: TemplateFile;
  scope: number | null;
  onScopeChange: (scope: number | null) => void;
  onChange: (template: TemplateFile) => void;
  labels: TemplateScopeLabels;
  isDisabled?: boolean | undefined;
}) {
  const sections = template.sections ?? [];
  const options = [
    { id: 'document', label: labels.documentScope },
    ...sections.map((section, index) => ({
      id: String(index),
      label: section.label || section.name,
    })),
  ];
  return (
    <PropertyRow label={labels.scope}>
      <SelectField
        label={labels.scope}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        options={options}
        value={scope === null ? 'document' : String(scope)}
        onChange={(key: Key | null) =>
          onScopeChange(key === 'document' || key === null ? null : Number(key))
        }
        isDisabled={isDisabled}
      />
      <Button
        size="sm"
        icon={PlusGlyph}
        label={labels.addSection}
        tooltip={labels.addSection}
        isDisabled={isDisabled}
        onPress={() => {
          onChange({ ...template, sections: [...sections, { name: freshName(template) }] });
          onScopeChange(sections.length);
        }}
      />
      {scope === null ? null : (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={isDisabled}
          onPress={() => {
            onScopeChange(null);
            onChange(withSection(template, scope, null));
          }}
        >
          {labels.deleteSection}
        </Button>
      )}
    </PropertyRow>
  );
}

/** A section's own rows: its name, label and flags. */
export function SectionRows({
  template,
  index,
  onChange,
  labels,
  isDisabled,
}: {
  template: TemplateFile;
  index: number;
  onChange: (template: TemplateFile) => void;
  labels: TemplateScopeLabels;
  isDisabled?: boolean | undefined;
}) {
  const section = template.sections?.[index];
  if (!section) return null;
  const own = section as unknown as TemplateFile;
  return (
    <PropertySection id="section" title={labels.section} defaultExpanded>
      {SECTION_SETTINGS.map((setting) => (
        <SettingRow
          key={setting.id}
          setting={setting}
          value={settingAt(own, setting.path)}
          inherited={undefined}
          onChange={(value) => {
            const next = withSetting(own, setting.path, value) as unknown as TemplateSection;
            // A section keeps a name: clearing it keeps the one it had.
            onChange(withSection(template, index, { ...next, name: next.name || section.name }));
          }}
          inheritedLabel={labels.inherited}
          isDisabled={isDisabled}
        />
      ))}
    </PropertySection>
  );
}
