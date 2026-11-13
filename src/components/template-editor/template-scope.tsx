// What the template editor edits: the document's settings, or one template section's, which a
// section sets over the document's, picked by the section's name. The picker adds a section after
// the one shown, moves the one shown earlier or later, and deletes it once confirmed; a section's
// own rows set its name, label and flags.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  ArrowDownGlyph,
  ArrowUpGlyph,
  DeleteGlyph,
  type Key,
  PlusGlyph,
} from '@flamboyantengineer/ui-components/core';
import { Modal } from '@flamboyantengineer/ui-components/modal';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import type { TemplateFile, TemplateSection } from '../../model/index.js';
import { SettingRow } from './setting-row.js';
import type { TemplateScope } from './template-scope-state.js';
import {
  freshSectionName,
  renameSection,
  type SectionNameProblem,
  withNamedSection,
  withoutSection,
  withSectionAt,
  withSectionMoved,
} from './template-section-list.js';
import { settingAt, type TemplateSetting, withSetting } from './template-settings.js';

/** The scope's text. */
export interface TemplateScopeLabels {
  readonly scope: string;
  readonly documentScope: string;
  readonly addSection: string;
  readonly moveSectionUp: string;
  readonly moveSectionDown: string;
  readonly deleteSection: string;
  /** Asks to confirm deleting the named section. */
  readonly deleteSectionTitle: (label: string) => string;
  /** Says what deleting a section does. */
  readonly deleteSectionMessage: string;
  readonly section: string;
  readonly sectionName: string;
  /** Says why a typed name cannot rename the section. */
  readonly sectionNameProblems: Readonly<Record<SectionNameProblem, string>>;
  /** Names an inherited value, and where it comes from when known. */
  readonly inherited: (value: string, source?: string) => string;
}

/** The scope's English text. */
export const DEFAULT_TEMPLATE_SCOPE_LABELS: Omit<TemplateScopeLabels, 'inherited'> = {
  scope: 'Settings of',
  documentScope: 'The document',
  addSection: 'Add a section',
  moveSectionUp: 'Move the section earlier',
  moveSectionDown: 'Move the section later',
  deleteSection: 'Delete the section',
  deleteSectionTitle: (label) => `Delete the section “${label}”?`,
  deleteSectionMessage:
    'The template no longer defines it. Documents keep their content, without the section’s settings.',
  section: 'Section',
  sectionName: 'Section name',
  sectionNameProblems: {
    empty: 'A name needs a letter or a digit.',
    taken: 'Another section has this name.',
  },
};

/** The settings of a section only, after its name. */
export const SECTION_SETTINGS: readonly TemplateSetting[] = [
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

/**
 * A template with the sections its documents take: its own, or those it inherits while it has no
 * list of its own. A template's list replaces its parent's whole (DOCE-FORMAT-3.1), so the editor
 * shows the inherited sections, and its first change to one writes the whole list into the
 * template: a list of the changed section alone would drop every other inherited section.
 */
export function withListedSections(
  template: TemplateFile,
  resolved: TemplateFile | undefined,
): TemplateFile {
  if (template.sections || !resolved?.sections) return template;
  return { ...template, sections: resolved.sections };
}

// The picker's key for the document's settings: no section name has a `#`.
const DOCUMENT_KEY = '#document';

/** What the scope picker and a section's rows change. */
export interface ScopeProps {
  readonly template: TemplateFile;
  readonly scope: TemplateScope;
  readonly onScopeChange: (scope: TemplateScope) => void;
  readonly onChange: (template: TemplateFile) => void;
  /** Receives a section's old and new name once a rename is committed. */
  readonly onSectionRename?: ((from: string, to: string) => void) | undefined;
  readonly labels: TemplateScopeLabels;
  readonly isDisabled?: boolean | undefined;
}

const labelOf = (section: TemplateSection) => section.label || section.name;

// Asks to confirm deleting the shown section, then deletes it and shows the document's settings.
function DeleteSection({
  template,
  scope,
  onScopeChange,
  onChange,
  labels,
  isDisabled,
}: ScopeProps) {
  const [isOpen, setOpen] = useState(false);
  const section = template.sections?.find((entry) => entry.name === scope);
  if (!section || scope === null) return null;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon={DeleteGlyph}
        label={labels.deleteSection}
        tooltip={labels.deleteSection}
        isDisabled={isDisabled}
        onPress={() => setOpen(true)}
      />
      <Modal
        role="alertdialog"
        isOpen={isOpen}
        onOpenChange={setOpen}
        tone="danger"
        size="sm"
        title={labels.deleteSectionTitle(labelOf(section))}
        description={labels.deleteSectionMessage}
        primaryAction={{
          label: labels.deleteSection,
          onPress: (close) => {
            close();
            onScopeChange(null);
            onChange(withoutSection(template, scope));
          },
        }}
      />
    </>
  );
}

/**
 * Picks the scope: the document, or a section by name. Adds a section after the one shown, or at
 * the end from the document's settings; moves the one shown; deletes it once confirmed.
 */
export function ScopePicker(props: ScopeProps) {
  const { template, scope, onScopeChange, onChange, labels, isDisabled } = props;
  const sections = template.sections ?? [];
  const index = sections.findIndex((section) => section.name === scope);
  const move = (by: number) => {
    if (scope !== null) onChange(withSectionMoved(template, scope, by));
  };
  return (
    <PropertyRow label={labels.scope}>
      <SelectField
        label={labels.scope}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        options={[
          { id: DOCUMENT_KEY, label: labels.documentScope },
          ...sections.map((section) => ({ id: section.name, label: labelOf(section) })),
        ]}
        value={scope ?? DOCUMENT_KEY}
        onChange={(key: Key | null) =>
          onScopeChange(typeof key === 'string' && key !== DOCUMENT_KEY ? key : null)
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
          const name = freshSectionName(template);
          onChange(withSectionAt(template, { name }, index < 0 ? undefined : index + 1));
          onScopeChange(name);
        }}
      />
      {index < 0 ? null : (
        <>
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowUpGlyph}
            label={labels.moveSectionUp}
            tooltip={labels.moveSectionUp}
            isDisabled={isDisabled || index === 0}
            onPress={() => move(-1)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowDownGlyph}
            label={labels.moveSectionDown}
            tooltip={labels.moveSectionDown}
            isDisabled={isDisabled || index === sections.length - 1}
            onPress={() => move(1)}
          />
          <DeleteSection {...props} />
        </>
      )}
    </PropertyRow>
  );
}

// The section's name, renamed once committed on Enter or on leaving the field, with why a typed
// name cannot be one.
function SectionNameRow({ section, props }: { section: TemplateSection; props: ScopeProps }) {
  const { template, onChange, onScopeChange, onSectionRename, labels, isDisabled } = props;
  const [draft, setDraft] = useState(section.name);
  const [problem, setProblem] = useState<SectionNameProblem | null>(null);
  const commit = () => {
    const renamed = renameSection(template, section.name, draft);
    if ('problem' in renamed) {
      setProblem(renamed.problem);
      return;
    }
    setProblem(null);
    setDraft(renamed.name);
    if (renamed.name === section.name) return;
    onChange(renamed.template);
    onSectionRename?.(section.name, renamed.name);
    onScopeChange(renamed.name);
  };
  return (
    <PropertyRow label={labels.sectionName}>
      <TextField
        label={labels.sectionName}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        value={draft}
        isDisabled={isDisabled}
        errorMessage={problem ? labels.sectionNameProblems[problem] : undefined}
        onChange={(text) => {
          setDraft(text);
          setProblem(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(section.name);
            setProblem(null);
          }
        }}
      />
    </PropertyRow>
  );
}

/** The shown section's own rows: its name, label and flags. */
export function SectionRows(props: ScopeProps) {
  const { template, scope, onChange, labels, isDisabled } = props;
  const section = template.sections?.find((entry) => entry.name === scope);
  if (!section || scope === null) return null;
  const own = section as unknown as TemplateFile;
  return (
    <PropertySection id="section" title={labels.section} defaultExpanded>
      <SectionNameRow key={section.name} section={section} props={props} />
      {SECTION_SETTINGS.map((setting) => (
        <SettingRow
          key={setting.id}
          setting={setting}
          value={settingAt(own, setting.path)}
          inherited={undefined}
          onChange={(value) => {
            const next = withSetting(own, setting.path, value) as unknown as TemplateSection;
            onChange(withNamedSection(template, scope, () => next));
          }}
          inheritedLabel={labels.inherited}
          isDisabled={isDisabled}
        />
      ))}
    </PropertySection>
  );
}
