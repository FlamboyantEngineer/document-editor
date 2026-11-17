// The template editor's custom styles, each a card: one of the scope's own renames, or deletes it
// with what refers to it; one it inherits is read-only until overridden, field by field, and an
// override goes back to the inherited style.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  DeleteGlyph,
  EditGlyph,
  PlusGlyph,
  UndoGlyph,
} from '@flamboyantengineer/ui-components/core';
import { EmptyState } from '@flamboyantengineer/ui-components/empty-state';
import {
  PropertyCard,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import { customStyleNameError, withCustomStyleRenamed } from './custom-style-names.js';
import { type StyleScope, styleSummary } from './style-fields.js';
import { StyleRows } from './style-rows.js';
import type { Rows } from './template-rows.js';
import { settingAt, type StylePart } from './template-settings.js';

// A custom style's rows: running text's, without a colour.
const CUSTOM_PARTS: readonly StylePart[] = ['font', 'face', 'justify', 'spacing', 'lineHeight'];

/** What a new custom style sets. */
const NEW_CUSTOM_STYLE: Readonly<Record<string, unknown>> = Object.freeze({
  font: 'Arial',
  size: '12pt',
  lineHeight: 1.5,
  spaceBefore: '6pt',
  spaceAfter: '6pt',
  alignment: 'left',
});

const namesIn = (source: unknown) =>
  source && typeof source === 'object' ? Object.keys(source) : [];

// The names of the custom styles the target has, those it inherits, and all of them. The
// document's resolved template holds its own styles too, so only a section tells the styles it
// overrides from those it has alone.
function customNames({ target, props }: Rows) {
  const own = namesIn(settingAt(target.own, ['styles', 'custom']));
  const resolved = namesIn(
    target.inherited ? settingAt(target.inherited, ['styles', 'custom']) : undefined,
  );
  const inherited =
    target.own === props.template ? resolved.filter((name) => !own.includes(name)) : resolved;
  return { own, inherited, all: [...new Set([...own, ...resolved])] };
}

// A custom style name the scope has not used: `custom_style_1`, then the next free number.
function freshStyle(taken: readonly string[]): string {
  let index = 1;
  while (taken.includes(`custom_style_${String(index)}`)) index += 1;
  return `custom_style_${String(index)}`;
}

// The template, or the section, with a custom style renamed or deleted, and what refers to it.
function renameStyle(context: Rows, from: string, to: string | null) {
  const { props, target } = context;
  if (target.own === props.template) {
    props.onChange(withCustomStyleRenamed(props.template, from, to));
    return;
  }
  // A section's own: its custom styles, and its overrides of them.
  const styles = settingAt(target.own, ['styles']);
  target.set(['styles'], withCustomStyleRenamed(styles, from, to));
}

// Renames a custom style, keeping its settings, unless the name is taken or not a name.
function rename(context: Rows, from: string, to: string) {
  const name = to.trim();
  const { own, all } = customNames(context);
  if (
    !own.includes(from) ||
    customStyleNameError(name, { current: from, taken: all, labels: context.labels }) !== null
  )
    return;
  if (name !== from) renameStyle(context, from, name);
}

/**
 * A name, kept as typed and committed on Enter or on leaving the field; Escape puts the name back.
 * Give it a `key` of the name, so a committed name starts a new draft.
 */
function NameField({
  name,
  label,
  isDisabled,
  check,
  onCommit,
}: {
  name: string;
  label: string;
  isDisabled: boolean;
  /** Why the name typed may not be committed, shown on the field; null while it may. */
  check: (name: string) => string | null;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <TextField
      errorMessage={check(draft.trim()) ?? undefined}
      label={label}
      labelLayout="control-only"
      density="compact"
      tracksChanges={false}
      maxLength={16}
      value={draft}
      isDisabled={isDisabled}
      onChange={setDraft}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(draft);
        if (event.key === 'Escape') setDraft(name);
      }}
    />
  );
}

// The action in a custom style's header: delete one of the scope's alone, go back to the inherited
// style from an override, or override an inherited one.
function StyleAction({
  context,
  name,
  state,
  onOverride,
}: {
  context: Rows;
  name: string;
  state: 'own' | 'override' | 'inherited';
  onOverride: () => void;
}) {
  const { labels, props } = context;
  const [label, icon, press] =
    state === 'own'
      ? [labels.deleteCustomStyle, DeleteGlyph, () => renameStyle(context, name, null)]
      : state === 'override'
        ? [
            labels.resetCustomStyle,
            UndoGlyph,
            () => context.target.set(['styles', 'custom', name], null),
          ]
        : [labels.overrideCustomStyle, EditGlyph, onOverride];
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={icon}
      label={label}
      tooltip={label}
      isDisabled={props.isDisabled}
      onPress={press}
    />
  );
}

// A custom style's card: its name, which renames one of the scope's own once committed, and its
// rows, read-only while it is inherited and not overridden.
function CustomStyleCard({
  context,
  name,
  state,
}: {
  context: Rows;
  name: string;
  state: 'own' | 'override' | 'inherited';
}) {
  const { labels, props } = context;
  const [isOverriding, setOverriding] = useState(false);
  const isReadOnly = state === 'inherited' && !isOverriding;
  const rowsContext = isReadOnly ? { ...context, props: { ...props, isDisabled: true } } : context;
  const scope: StyleScope = { context: rowsContext, path: ['styles', 'custom', name] };
  return (
    <PropertyCard
      name={name}
      summary={
        state === 'own' ? styleSummary(scope) : `${styleSummary(scope)} · ${labels.inheritedStyle}`
      }
      isOverridden={state !== 'inherited'}
      actions={
        isOverriding && state === 'inherited' ? null : (
          <StyleAction
            context={context}
            name={name}
            state={state}
            onOverride={() => setOverriding(true)}
          />
        )
      }
    >
      <PropertyRow label={labels.styleName}>
        <NameField
          key={name}
          name={name}
          label={labels.styleName}
          isDisabled={Boolean(props.isDisabled) || state !== 'own'}
          check={(next) =>
            customStyleNameError(next, { current: name, taken: customNames(context).all, labels })
          }
          onCommit={(next) => rename(context, name, next)}
        />
      </PropertyRow>
      <StyleRows scope={scope} parts={CUSTOM_PARTS} />
    </PropertyCard>
  );
}

/** The custom styles, each a card, with adding one in the section's header. */
export function CustomStyleSection({ context }: { context: Rows }) {
  const { labels, props } = context;
  const { own, inherited, all } = customNames(context);
  const add = (
    <Button
      size="sm"
      variant="ghost"
      icon={PlusGlyph}
      label={labels.addCustomStyle}
      tooltip={labels.addCustomStyle}
      isDisabled={props.isDisabled}
      onPress={() => context.target.set(['styles', 'custom', freshStyle(all)], NEW_CUSTOM_STYLE)}
    />
  );
  const stateOf = (name: string) =>
    !own.includes(name) ? 'inherited' : inherited.includes(name) ? 'override' : 'own';
  return (
    <PropertySection id="custom-styles" title={labels.customStyle} actions={add} count={all.length}>
      {all.length ? (
        all.map((name) => (
          <CustomStyleCard key={name} context={context} name={name} state={stateOf(name)} />
        ))
      ) : (
        <EmptyState size="sm" description={labels.noCustomStyles} />
      )}
    </PropertySection>
  );
}
