// The template's identity rows: its id, which may change until the host saves it, its name and its
// parent, with why a parent cannot be picked or could not be loaded.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type ReactNode, type Ref, useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { useTemplateDraft, useTextDraft } from './setting-drafts.js';
import { withSetting } from './template-settings.js';

/** The identity rows' text. */
export interface TemplateIdentityLabels {
  readonly identity: string;
  readonly id: string;
  /** Shows in the empty id field. */
  readonly idPlaceholder: string;
  /** Says an id needs a letter or digit. */
  readonly idEmpty: string;
  /** Says what an id is written with, while what is typed holds other characters. */
  readonly idCharacters: string;
  readonly name: string;
  /** Shows in the empty name field. */
  readonly namePlaceholder: string;
  /** Says what a name may hold, once a character typed was refused. */
  readonly nameCharacters: string;
  /** The name an emptied name field gives the template. */
  readonly defaultName: string;
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
  idPlaceholder: 'Type an id',
  idEmpty: 'An id needs a letter or a digit.',
  idCharacters:
    'An id starts with a letter, then letters, digits and _; other characters become _.',
  name: 'Name',
  namePlaceholder: 'Type a name',
  nameCharacters: 'A name holds up to 120 visible characters.',
  defaultName: 'New template',
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
interface TemplateIdentityProps {
  readonly template: TemplateFile;
  readonly onChange: (template: TemplateFile) => void;
  /** The parents to pick among; without them the parent has no row. */
  readonly parentOptions?: readonly TemplateParentOption[] | undefined;
  /** Why the parent could not be loaded, shown under its field. */
  readonly parentError?: string | undefined;
  /** Whether the host has never saved the template, so its id may still change. */
  readonly isNew?: boolean | undefined;
  /** Why the id cannot be saved, such as a save asked for while it is empty. */
  readonly idError?: string | undefined;
  /** The id field's input, which a host focuses, such as when a save needs an id. */
  readonly idInputRef?: Ref<HTMLInputElement> | undefined;
  /** Whether the name is shown and not edited. */
  readonly isNameReadOnly?: boolean | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly labels: TemplateIdentityLabels;
  /** Rows after the identity rows, such as a host's own. */
  readonly children?: ReactNode;
}

/**
 * A template id as a template writes one, from what was typed: a letter, then up to 63 letters,
 * digits and underscores. Other characters become underscores, and what comes before the first
 * letter is left out. Empty when no letter is left.
 */
export function templateIdOf(text: string): string {
  return text
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .slice(0, 64)
    .replace(/_+$/, '');
}

// The id while it may change, committed on Enter or on leaving the field; an emptied id empties
// the template's, so it cannot be saved until it has one. A saved template's id shows read-only.
function IdRow(props: TemplateIdentityProps) {
  const { template, onChange, isDisabled, labels } = props;
  const [draft, setDraft] = useState(template.id);
  const [shown, setShown] = useState(template.id);
  const [isRefused, setRefused] = useState(false);
  if (shown !== template.id) {
    setShown(template.id);
    setDraft(template.id);
  }
  const id = templateIdOf(draft);
  const commit = () => {
    setRefused(draft.trim() !== '' && !id);
    setDraft(id);
    if (id !== template.id) onChange({ ...template, id });
  };
  const problem =
    isRefused || (draft.trim() && !id) ? labels.idEmpty : id ? undefined : props.idError;
  const isSaved = !props.isNew;
  return (
    <PropertyRow label={labels.id} isRequired={!isSaved}>
      <TextField
        label={labels.id}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        value={draft}
        placeholder={labels.idPlaceholder}
        isDisabled={isDisabled}
        isReadOnly={isSaved}
        isRequired={!isSaved}
        inputRef={props.idInputRef}
        description={!isSaved && draft !== id && id ? labels.idCharacters : undefined}
        errorMessage={problem}
        onChange={(text) => {
          setDraft(text);
          setRefused(false);
        }}
        onBlur={isSaved ? undefined : commit}
        onKeyDown={(event) => {
          if (isSaved || event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(template.id);
        }}
      />
    </PropertyRow>
  );
}

// What a name may not hold: control and formatting characters.
const NOT_IN_NAME = /[\p{Cc}\p{Cf}]/gu;
const NAME_LENGTH = 120;

// The name, committed on Enter or on leaving the field and put back by Escape; a typed character
// it may not hold is refused, saying what it may hold, and an emptied name commits the default.
function NameRow(props: TemplateIdentityProps) {
  const { template, onChange, isDisabled, labels } = props;
  const name = template.name ?? '';
  const [text, setText] = useTextDraft(name);
  const [isRefused, setRefused] = useState(false);
  useTemplateDraft(text === name ? 'clean' : 'pending');
  return (
    <PropertyRow label={labels.name}>
      <TextField
        label={labels.name}
        labelLayout="control-only"
        density="compact"
        committedValue={name}
        value={text}
        changeLayout="hidden"
        placeholder={labels.namePlaceholder}
        isDisabled={isDisabled}
        isReadOnly={props.isNameReadOnly}
        description={isRefused ? labels.nameCharacters : undefined}
        onChange={(typed) => {
          const kept = typed.replace(NOT_IN_NAME, '').slice(0, NAME_LENGTH);
          setRefused(kept !== typed);
          setText(kept);
        }}
        onCommit={(typed) => {
          setRefused(false);
          const next = typed.trim() ? typed : labels.defaultName;
          if (next === name) setText(name);
          else onChange(withSetting(template, ['name'], next));
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

/** The identity rows: the id, read-only once saved, the name and the parent. */
export function TemplateIdentity(props: TemplateIdentityProps) {
  return (
    <PropertySection id="identity" title={props.labels.identity} defaultExpanded>
      <IdRow key={props.isNew ? 'new' : 'saved'} {...props} />
      <NameRow {...props} />
      {props.parentOptions ? <ParentRow {...props} /> : null}
      {props.children}
    </PropertySection>
  );
}
