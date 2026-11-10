// A template as JSON text: edited in a code editor, checked as it is typed, and handed to the
// host once it reads as a valid template.

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

// The errors of a text as a template: not JSON, or the template's own.
function errorsOf(text: string, labels: TemplateJsonEditorLabels): string[] {
  try {
    return validateTemplateFile(JSON.parse(text));
  } catch {
    return [labels.notJson];
  }
}

/** Edits a template as JSON, handing each valid template to the host. */
export function TemplateJsonEditor(props: TemplateJsonEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  const [text, setText] = useState(() => JSON.stringify(props.template, null, 2));
  const [errors, setErrors] = useState<readonly string[]>([]);
  const change = (next: string) => {
    setText(next);
    const errors = errorsOf(next, labels);
    setErrors(errors);
    props.onValidityChange?.(errors);
    if (errors.length === 0) props.onChange(JSON.parse(next) as TemplateFile);
  };
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
