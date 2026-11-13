// A template as JSON text: edited in a code editor, checked as it is typed, and handed to the host
// once focus leaves the editor and the text reads as a valid template. The keys the host locks,
// the format and the id unless it names others, keep the host's values whatever the text says. A
// template changed elsewhere, such as in the settings panel, replaces the text while it holds no
// edit of its own, so the text never hands back a template older than the host's.

import { CodeEditor } from '@flamboyantengineer/ui-components/code-editor';
import { type FocusEvent, useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { createHooks } from '../../utils/hooks.js';
import { LOCKED_TEMPLATE_KEYS, readTemplateText, templateText } from './template-json-text.js';

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
  /** Receives the template the text reads as once focus leaves the editor, when it is valid. */
  readonly onChange: (template: TemplateFile) => void;
  /** Tells whether the text reads as a valid template, with its errors, as it is typed. */
  readonly onValidityChange?: ((errors: readonly string[]) => void) | undefined;
  /**
   * The keys the text cannot change: each keeps the host's value, or stays out while the host's
   * template has none. Defaults to `formatVersion` and `id`.
   */
  readonly lockedKeys?: readonly (keyof TemplateFile)[] | undefined;
  readonly labels?: Partial<TemplateJsonEditorLabels> | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly className?: string | undefined;
}

const NO_ERRORS: readonly string[] = [];

// The text as typed over the host's template's text, and its errors.
interface Draft {
  readonly text: string;
  readonly from: string;
  readonly errors: readonly string[];
}

/** Edits a template as JSON, handing a valid template to the host once focus leaves it. */
export function TemplateJsonEditor(props: TemplateJsonEditorProps) {
  const labels = { ...DEFAULT_LABELS, ...props.labels };
  const locked = props.lockedKeys ?? LOCKED_TEMPLATE_KEYS;
  const external = templateText(props.template);
  const reading = { held: props.template, locked, notJson: labels.notJson };
  const [draft, setDraft] = useState<Draft>({ text: external, from: external, errors: NO_ERRORS });
  // A draft without edits of its own follows the host's template.
  const edited = draft.text !== draft.from;
  const current = edited || draft.from === external ? draft : null;
  const shown = current ?? { text: external, from: external, errors: NO_ERRORS };
  const change = (text: string) => {
    const result = readTemplateText(text, reading);
    const errors = result.errors ?? NO_ERRORS;
    props.onValidityChange?.(errors);
    setDraft({ text, from: shown.from, errors });
  };
  const commit = (event: FocusEvent<HTMLDivElement>) => {
    // Focus moving within the editor, such as to its own buttons, is no commit.
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
    if (shown.text === shown.from) return;
    const { template } = readTemplateText(shown.text, reading);
    if (!template) return;
    // The text as the host's next template writes it, which the draft then follows.
    const text = templateText(template);
    setDraft({ text, from: text, errors: NO_ERRORS });
    if (text !== external) props.onChange(template);
  };
  return (
    <div {...hooks.root({ className: props.className })} onBlur={commit}>
      <CodeEditor
        label={labels.label}
        language="json"
        value={shown.text}
        onChange={change}
        tracksChanges={false}
        isDisabled={props.isDisabled}
        errorMessage={shown.errors.length ? shown.errors.join(' ') : undefined}
      />
    </div>
  );
}
