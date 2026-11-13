// The template editor's text styles, one card each: the title, the headings and the paragraph;
// and its custom styles, each a card that renames or deletes it with what refers to it, or
// overrides one inherited.

import { Button } from '@flamboyantengineer/ui-components/button';
import { DeleteGlyph, EditGlyph, PlusGlyph } from '@flamboyantengineer/ui-components/core';
import { EmptyState } from '@flamboyantengineer/ui-components/empty-state';
import {
  PropertyCard,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { memo, useState } from 'react';
import { customStyleNameError, withCustomStyleRenamed } from './custom-style-names.js';
import { RUNNING_PARTS } from './object-settings.js';
import { isSameRows, type ShownRows } from './same-rows.js';
import { rows } from './setting-row.js';
import { isStyleOverridden, type StyleScope, styleSummary } from './style-fields.js';
import { StyleRows } from './style-rows.js';
import type { Rows } from './template-rows.js';
import { setting, settingAt, type StylePart, TEXT_STYLES } from './template-settings.js';

// A text style's rows: running text's for the paragraph, a heading's with its numbering.
const TEXT_PARTS: readonly StylePart[] = [
  'font',
  'face',
  'align',
  'colour',
  'spacing',
  'lineHeight',
];
const partsOf = (id: string): readonly StylePart[] =>
  id === 'paragraph'
    ? RUNNING_PARTS
    : id.startsWith('heading')
      ? [...TEXT_PARTS, 'numbering']
      : TEXT_PARTS;

const INDENTATION = setting('indentation', 'Indentation', { type: 'length' });

// A built-in text style's card. It renders again only when what it shows changes.
const TextStyleCard = memo(
  function TextStyleCard({ context, id, label }: ShownRows & { id: string; label: string }) {
    const scope: StyleScope = { context, path: ['styles', id] };
    return (
      <PropertyCard
        name={label}
        summary={styleSummary(scope)}
        isOverridden={isStyleOverridden(scope)}
      >
        <StyleRows scope={scope} parts={partsOf(id)} />
        {id === 'paragraph' ? rows(context, scope.path, [INDENTATION]) : null}
      </PropertyCard>
    );
  },
  (before, after) => before.id === after.id && isSameRows(before, after),
);

/** The built-in text styles' cards, in the order a document reads them: title, headings, text. */
export function TextStyleSection({ context }: { context: Rows }) {
  const { labels, target } = context;
  return (
    <PropertySection id="text-styles" title={labels.textStyles}>
      {TEXT_STYLES.map(({ id, label }) => (
        <TextStyleCard
          key={id}
          context={context}
          id={id}
          label={label}
          own={settingAt(target.own, ['styles', id])}
          inherited={target.inherited ? settingAt(target.inherited, ['styles', id]) : undefined}
        />
      ))}
    </PropertySection>
  );
}

// The names of the custom styles the target has, and those it inherits.
function customNames({ target }: Rows) {
  const names = (source: unknown) =>
    source && typeof source === 'object' ? Object.keys(source) : [];
  const own = names(settingAt(target.own, ['styles', 'custom']));
  const inherited = names(
    target.inherited ? settingAt(target.inherited, ['styles', 'custom']) : undefined,
  );
  return { own, all: [...new Set([...own, ...inherited])] };
}

// A custom style name the template has not used.
function freshStyle(taken: readonly string[]): string {
  let index = taken.length + 1;
  while (taken.includes(`style_${String(index)}`)) index += 1;
  return `style_${String(index)}`;
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
export function NameField({
  name,
  label,
  isDisabled,
  maxLength,
  check,
  onCommit,
}: {
  name: string;
  label: string;
  isDisabled: boolean;
  maxLength?: number | undefined;
  /** Why the name typed may not be committed, shown on the field; null while it may. */
  check?: ((name: string) => string | null) | undefined;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <TextField
      errorMessage={check?.(draft.trim()) ?? undefined}
      label={label}
      labelLayout="control-only"
      density="compact"
      tracksChanges={false}
      maxLength={maxLength}
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

// A copy of the custom style a target inherits, which overriding it starts from.
function inheritedStyle({ target }: Rows, name: string): Record<string, unknown> {
  const style = target.inherited ? settingAt(target.inherited, ['styles', 'custom', name]) : null;
  return style && typeof style === 'object'
    ? structuredClone(style as Record<string, unknown>)
    : {};
}

// A custom style's card: its name, which renames it once committed, and its rows; deleted, or,
// while inherited, overridden from its card's header.
function CustomStyleCard({
  context,
  name,
  owned,
}: {
  context: Rows;
  name: string;
  owned: boolean;
}) {
  const { labels, props } = context;
  const scope: StyleScope = { context, path: ['styles', 'custom', name] };
  const action = owned ? (
    <Button
      size="sm"
      variant="ghost"
      icon={DeleteGlyph}
      label={labels.deleteCustomStyle}
      tooltip={labels.deleteCustomStyle}
      isDisabled={props.isDisabled}
      onPress={() => renameStyle(context, name, null)}
    />
  ) : (
    <Button
      size="sm"
      variant="ghost"
      icon={EditGlyph}
      label={labels.overrideCustomStyle}
      tooltip={labels.overrideCustomStyle}
      isDisabled={props.isDisabled}
      onPress={() => context.target.set(['styles', 'custom', name], inheritedStyle(context, name))}
    />
  );
  return (
    <PropertyCard
      name={name}
      summary={owned ? styleSummary(scope) : `${styleSummary(scope)} · ${labels.inheritedStyle}`}
      isOverridden={owned}
      actions={action}
    >
      <PropertyRow label={labels.styleName}>
        <NameField
          key={name}
          name={name}
          label={labels.styleName}
          isDisabled={Boolean(props.isDisabled) || !owned}
          maxLength={16}
          check={(next) =>
            customStyleNameError(next, { current: name, taken: customNames(context).all, labels })
          }
          onCommit={(next) => rename(context, name, next)}
        />
      </PropertyRow>
      <StyleRows scope={scope} parts={RUNNING_PARTS} />
    </PropertyCard>
  );
}

/** The custom styles, each a card, with adding one in the section's header. */
export function CustomStyleSection({ context }: { context: Rows }) {
  const { labels, props } = context;
  const { own, all } = customNames(context);
  const add = (
    <Button
      size="sm"
      variant="ghost"
      icon={PlusGlyph}
      label={labels.addCustomStyle}
      tooltip={labels.addCustomStyle}
      isDisabled={props.isDisabled}
      onPress={() => context.target.set(['styles', 'custom', freshStyle(all)], { size: '11pt' })}
    />
  );
  return (
    <PropertySection id="custom-styles" title={labels.customStyle} actions={add} count={all.length}>
      {all.length ? (
        all.map((name) => (
          <CustomStyleCard key={name} context={context} name={name} owned={own.includes(name)} />
        ))
      ) : (
        <EmptyState size="sm" description={labels.noCustomStyles} />
      )}
    </PropertySection>
  );
}
