// The template's identity rows: its id while the host has not saved it yet, its name and its
// parent, with why a parent cannot be picked or could not be loaded.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type ReactNode, useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { withSetting } from './template-settings.js';

/** The identity rows' text. */
export interface TemplateIdentityLabels {
  readonly identity: string;
  readonly id: string;
  /** Says an id needs a letter or digit. */
  readonly idEmpty: string;
  readonly name: string;
  readonly parent: string;
  readonly noParent: string;
  /** Says why a parent that inherits from the template cannot be picked. */
  readonly parentCycle: string;
  /** Says the template's parent is not among those the host offers. */
  readonly parentMissing: string;
}

/** The identity rows' English text. */
export const DEFAULT_TEMPLATE_IDENTITY_LABELS: TemplateIdentityLabels = {
  identity: 'Identity',
  id: 'Id',
  idEmpty: 'An id needs a letter or a digit.',
  name: 'Name',
  parent: 'Parent template',
  noParent: 'Base template',
  parentCycle: 'Inherits from this template',
  parentMissing: 'The parent template is not available.',
};

/** A template the template may inherit from. */
export interface TemplateParentOption {
  readonly id: string;
  readonly label: string;
  /** Whether it inherits from the template, so picking it would make a cycle: shown, not picked. */
  readonly cycle?: boolean | undefined;
}

/** What the identity rows read and change. */
export interface TemplateIdentityProps {
  readonly template: TemplateFile;
  readonly onChange: (template: TemplateFile) => void;
  /** The parents to pick among; without them the parent has no row. */
  readonly parentOptions?: readonly TemplateParentOption[] | undefined;
  /** Why the parent could not be loaded, shown under its field. */
  readonly parentError?: string | undefined;
  /** Whether the host has never saved the template, so its id may still change. */
  readonly isNew?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly labels: TemplateIdentityLabels;
  /** Rows after the identity rows, such as a host's own. */
  readonly children?: ReactNode;
}

/**
 * A template id as a template writes one, letters, digits, underscores and hyphens, from what was
 * typed: other characters become hyphens. Empty when nothing is left.
 */
export function templateIdOf(text: string): string {
  return text
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The id while it may change, committed on Enter or on leaving the field.
function IdRow({ template, onChange, isDisabled, labels }: TemplateIdentityProps) {
  const [draft, setDraft] = useState(template.id);
  const [shown, setShown] = useState(template.id);
  if (shown !== template.id) {
    setShown(template.id);
    setDraft(template.id);
  }
  const id = templateIdOf(draft);
  const commit = () => {
    if (!id) return;
    setDraft(id);
    if (id !== template.id) onChange({ ...template, id });
  };
  return (
    <PropertyRow label={labels.id}>
      <TextField
        label={labels.id}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        value={draft}
        isDisabled={isDisabled}
        errorMessage={id ? undefined : labels.idEmpty}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(template.id);
        }}
      />
    </PropertyRow>
  );
}

// The parent, among the host's options, with a cycle shown and not picked.
function ParentRow(props: TemplateIdentityProps) {
  const { template, onChange, parentOptions = [], parentError, isDisabled, labels } = props;
  const parents = parentOptions.filter((option) => option.id !== template.id);
  const missing =
    template.parent && !parents.some((option) => option.id === template.parent)
      ? labels.parentMissing
      : undefined;
  return (
    <PropertyRow label={labels.parent}>
      <SelectField
        label={labels.parent}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        options={[
          { id: '', label: labels.noParent },
          ...parents.map((option) => ({
            id: option.id,
            label: option.label,
            ...(option.cycle ? { isDisabled: true, description: labels.parentCycle } : {}),
          })),
        ]}
        value={template.parent ?? ''}
        isDisabled={isDisabled}
        errorMessage={parentError ?? missing}
        onChange={(key: Key | null) =>
          onChange(withSetting(template, ['parent'], typeof key === 'string' && key ? key : null))
        }
      />
    </PropertyRow>
  );
}

/** The identity rows: the id before the first save, the name and the parent. */
export function TemplateIdentity(props: TemplateIdentityProps) {
  const { template, onChange, isDisabled, labels } = props;
  return (
    <PropertySection id="identity" title={labels.identity} defaultExpanded>
      {props.isNew ? <IdRow key="id" {...props} /> : null}
      <PropertyRow label={labels.name}>
        <TextField
          label={labels.name}
          labelLayout="control-only"
          density="compact"
          tracksChanges={false}
          value={template.name ?? ''}
          isDisabled={isDisabled}
          onChange={(name) => onChange(withSetting(template, ['name'], name || null))}
        />
      </PropertyRow>
      {props.parentOptions ? <ParentRow {...props} /> : null}
      {props.children}
    </PropertySection>
  );
}
