// A template as JSON text: edited in a code editor, checked as it is typed, and handed to the
// host once it reads as a valid template. A template changed elsewhere, such as in the settings
// panel, replaces the text, so the text never hands back a template older than the host's.

import { CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { useState } from 'react';
import { type TemplateFile, validateTemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';

const hooks = createHooks('template-json-editor');

/** The JSON editor's text. */
export interface TemplateJsonEditorLabels {
  readonly label: string;
  /** Says the text is not JSON. */
  readonly notJson: string;
}

const DEFAULT_LABELS: TemplateJsonEditorLabels = {
  label: 'Template JSON',
  notJson: 'The text is not valid JSON.',
};

/** What the JSON editor edits. */
export interface TemplateJsonEditorProps {
  readonly template: TemplateFile;
  /** Receives each valid template the text reads as. */
  readonly onChange: (template: TemplateFile) => void;
  /** Tells whether the text reads as a valid template, with its errors. */
  readonly onValidityChange?: ((errors: readonly string[]) => void) | undefined;
  readonly labels?: Partial<TemplateJsonEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

const NO_ERRORS: readonly string[] = [];

// The errors of a text as a template: not JSON, or the template's own.
function errorsOf(text: string, labels: TemplateJsonEditorLabels): readonly string[] {
  try {
    return validateTemplateFile(JSON.parse(text));
  } catch {
    return [labels.notJson];
  }
}

/** Edits a template as JSON, handing each valid template to the host. */
export function TemplateJsonEditor(props: TemplateJsonEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  const external = JSON.stringify(props.template, null, 2);
  // The text as typed, and the template's JSON it was typed over or hands the host.
  const [draft, setDraft] = useState({ text: external, from: external, errors: NO_ERRORS });
  const current = draft.from === external ? draft : { text: external, errors: NO_ERRORS };
  const change = (next: string) => {
    const errors = errorsOf(next, labels);
    props.onValidityChange?.(errors);
    if (errors.length) {
      setDraft({ text: next, from: external, errors });
      return;
    }
    const template = JSON.parse(next) as TemplateFile;
    setDraft({ text: next, from: JSON.stringify(template, null, 2), errors });
    props.onChange(template);
  };
  const { text, errors } = current;
  return (
    <div {...hooks.root({ className: props.className })}>
      <CodeEditor
        label={labels.label}
        language="json"
        value={text}
        onChange={change}
        tracksChanges={false}
        isDisabled={props.isDisabled}
        errorMessage={errors.length ? errors.join(' ') : undefined}
      />
    </div>
  );
}
