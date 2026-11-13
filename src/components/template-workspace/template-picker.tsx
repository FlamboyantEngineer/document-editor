// The template picker: the host's stored templates in a select field, by name with the id below
// (by id alone without a name),
// such as for opening one in the template workspace or picking a document's template.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { TemplateSummary } from '../../host/adapters.js';
import { createHooks } from '../../utils/hooks.js';

const hooks = createHooks('template-picker');

/** What the template picker offers and picks. */
export interface TemplatePickerProps {
  /** The templates to pick among, as the template store lists them. */
  readonly templates: readonly TemplateSummary[];
  /** The id of the template picked; null for none. */
  readonly selectedKey: string | null;
  /** Called with the id of the template the reader picks. */
  readonly onSelectionChange: (templateId: string) => void;
  /** Names the field. */
  readonly label: string;
  /** The field's text while no template is picked. */
  readonly placeholder?: string | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

/** Picks a stored template, listed by name in alphabetical order, each with its id. */
export function TemplatePicker(props: TemplatePickerProps) {
  const options = [...props.templates]
    .sort((one, other) => (one.name ?? one.id).localeCompare(other.name ?? other.id))
    .map((template) =>
      template.name === null
        ? { id: template.id, label: template.id }
        : { id: template.id, label: template.name, description: template.id },
    );
  return (
    <SelectField
      {...hooks.root({ className: props.className })}
      label={props.label}
      labelLayout="control-only"
      density="compact"
      tracksChanges={false}
      options={options}
      placeholder={props.placeholder}
      value={props.selectedKey}
      isDisabled={props.isDisabled}
      onChange={(key: Key | null) => {
        if (typeof key === 'string' && key !== props.selectedKey) props.onSelectionChange(key);
      }}
    />
  );
}
