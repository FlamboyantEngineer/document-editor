// The template editor's typed fields: text, a length, a font and a numbering format. What is typed
// stays a draft of the field until Enter or leaving the field commits it, so a document beside the
// editor restyles once per edit rather than per key; Escape puts the template's value back, a draft
// that is not valid shows why and is never committed, and an emptied field inherits again.

import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type CSSProperties, useEffect, useRef } from 'react';
import { NUMBERING_OPTIONS } from './numbering-presets.js';
import type { ControlProps } from './setting-controls.js';
import { useTemplateDraft, useTextDraft } from './setting-drafts.js';
import { templateEditorHooks as hooks } from './template-editor-hooks.js';

const shown = (value: unknown) =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value);

// A length: a non-negative number and a unit, such as `12pt` or `20mm`.
const LENGTH = /^\d+(\.\d+)?(pt|px|mm|cm|in|em|rem)$/;
// A number without a unit, read as pixels.
const PIXELS = /^\d+(\.\d+)?$/;

/** A typed length as a template writes it: a number alone in pixels; null when it is not one. */
function lengthOf(text: string): string | null {
  const length = text.trim().replace(/\s+/g, '');
  if (PIXELS.test(length)) return `${length}px`;
  return LENGTH.test(length) ? length : null;
}

// What a numbering format may hold: a level's character and the separators between levels.
const NOT_NUMBERING = /[^1aAiI.\-) _]/g;

/** A numbering format with what it may not hold left out. */
const cleanNumbering = (text: string) => text.replace(NOT_NUMBERING, '');

// The props of a typed field that commits a draft: the field's value, kept until it is committed,
// whether the field is dirty, and the committed value.
interface DraftField {
  readonly committedValue: string;
  readonly value: string;
  readonly tracksChanges: true;
  readonly changeLayout: 'hidden';
}

// The draft of a typed field: its text, the props that make the field commit it, and the commit,
// which writes a valid text, an emptied one inheriting again; an invalid draft is reported.
function useDraftField(
  props: ControlProps,
  read: (text: string) => { value: unknown; problem?: string | null | undefined },
) {
  const committed = shown(props.value);
  const [text, setText] = useTextDraft(committed);
  const problem = text === committed ? null : (read(text).problem ?? null);
  useTemplateDraft(problem !== null ? 'invalid' : text === committed ? 'clean' : 'pending');
  const commit = (next: string) => {
    if (next === committed) return;
    const { value, problem: wrong } = read(next);
    if (!wrong) props.onChange(next.trim() === '' ? null : value);
  };
  const field: DraftField = {
    committedValue: committed,
    value: text,
    tracksChanges: true,
    changeLayout: 'hidden',
  };
  return { text, setText, problem, commit, field };
}

/** Text, such as the text before a number. */
export function TextControl(props: ControlProps) {
  const { setting, value, common, placeholder } = props;
  const check = (text: string) => setting.check?.(text) ?? null;
  const draft = useDraftField(props, (text) => ({ value: text, problem: check(text) }));
  return (
    <TextField
      {...common}
      {...draft.field}
      placeholder={draft.text === '' ? placeholder : undefined}
      errorMessage={draft.problem ?? check(shown(value)) ?? undefined}
      // Text is kept as typed, spaces too.
      onChange={draft.setText}
      onCommit={draft.commit}
    />
  );
}

/** A length, such as `12pt` or `20mm`, or a number alone, in pixels. */
export function LengthControl(props: ControlProps) {
  const { common, placeholder, fieldLabels } = props;
  const draft = useDraftField(props, (text) => {
    const length = lengthOf(text);
    return { value: length, problem: text.trim() && !length ? fieldLabels.lengthInvalid : null };
  });
  return (
    <TextField
      {...common}
      {...draft.field}
      placeholder={draft.text === '' ? placeholder : undefined}
      errorMessage={draft.problem ?? undefined}
      onChange={draft.setText}
      onCommit={draft.commit}
    />
  );
}

// Commits a combobox's text on Enter and puts the value back on Escape, unless its list took the
// key, and commits the text once focus leaves the input; the combobox takes no key or focus props,
// so its input is listened to.
function useComboboxDraft(
  draft: { text: string; commit: (text: string) => void },
  revert: () => void,
) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ draft, revert });
  useEffect(() => {
    latest.current = { draft, revert };
  });
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // An open list takes Enter and Escape: it picks or closes.
      const isOpen = element.getAttribute('aria-expanded') === 'true';
      if (event.isComposing || event.defaultPrevented || isOpen) return;
      const now = latest.current;
      if (event.key === 'Enter') now.draft.commit(now.draft.text);
      if (event.key === 'Escape') now.revert();
    };
    const onBlur = () => {
      latest.current.draft.commit(latest.current.draft.text);
    };
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('blur', onBlur);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('blur', onBlur);
    };
  }, []);
  return input;
}

/** A numbering format, typed or picked from the formats offered with the numbers each gives. */
export function NumberingControl(props: ControlProps) {
  const { setting, value, common, placeholder } = props;
  const check = (text: string) => setting.check?.(text) ?? null;
  const draft = useDraftField(props, (text) => ({ value: text, problem: check(text) }));
  const input = useComboboxDraft(draft, () => draft.setText(shown(value)));
  return (
    <Combobox
      inputRef={input}
      aria-label={common.label}
      size="sm"
      isDisabled={common.isDisabled}
      allowsCustomValue
      menuTrigger="focus"
      defaultItems={NUMBERING_OPTIONS}
      inputValue={draft.text}
      placeholder={draft.text === '' ? placeholder : undefined}
      description={common.help}
      errorMessage={draft.problem ?? check(shown(value)) ?? undefined}
      onInputChange={(text, { reason }) => {
        const clean = cleanNumbering(text);
        draft.setText(clean);
        // A format picked from the list is committed at once.
        if (reason === 'sync') draft.commit(clean);
      }}
    />
  );
}

// A font's name drawn in that font, through the reference stylesheet.
const inFont = (font: string): CSSProperties =>
  ({ '--de-font-option': JSON.stringify(font) }) as CSSProperties;

/** A font, picked from those offered, each drawn in its own font; picking commits it at once. */
export function FontControl(props: ControlProps) {
  const { value, onChange, fonts = [], common, inheritedLabel, inheritedFrom, placeholder } = props;
  const own = typeof value === 'string' && value ? value : null;
  // A font the template names that is not offered stays listed, so it shows.
  const listed = own && !fonts.includes(own) ? [own, ...fonts] : fonts;
  return (
    <SelectField
      {...common}
      options={listed.map((font) => ({ id: font, label: font }))}
      value={own}
      emptyLabel={inheritedLabel(placeholder ?? '—', inheritedFrom)}
      renderOption={(option) => (
        <span {...hooks.slot('font-option')} style={inFont(option.label)}>
          {option.label}
        </span>
      )}
      onChange={(key) => onChange(key === null || key === '' ? null : String(key))}
    />
  );
}
