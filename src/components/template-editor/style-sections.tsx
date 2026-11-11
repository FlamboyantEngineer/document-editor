// The template editor's text styles, one card each: the title, the headings and the paragraph;
// and its custom styles, each a card that renames or deletes it, or overrides one inherited.

import { Button } from '@flamboyantengineer/ui-components/button';
import { DeleteGlyph, EditGlyph, PlusGlyph } from '@flamboyantengineer/ui-components/core';
import { EmptyState } from '@flamboyantengineer/ui-components/empty-state';
import {
  PropertyCard,
  PropertyRow,
  PropertySection,
} from '@flamboyantengineer/ui-components/property-panel';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { useState } from 'react';
import { isStyleOverridden, StyleRows, type StyleScope, styleSummary } from './style-fields.js';
import type { Rows } from './template-rows.js';
import { settingAt, TEXT_STYLES } from './template-settings.js';

/** The built-in text styles' cards, in the order a document reads them: title, headings, text. */
export function TextStyleSection({ context }: { context: Rows }) {
  const { labels } = context;
  return (
    <PropertySection id="text-styles" title={labels.textStyles}>
      {TEXT_STYLES.map(({ id, label }) => {
        const scope: StyleScope = { context, path: ['styles', id] };
        return (
          <PropertyCard
            key={id}
            name={label}
            summary={styleSummary(scope)}
            isOverridden={isStyleOverridden(scope)}
          >
            <StyleRows
              scope={scope}
              heading={id.startsWith('heading')}
              running={id === 'paragraph'}
            />
          </PropertyCard>
        );
      })}
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

/** What a custom style's name may be: a letter, then letters, digits, `_` or `-`, 16 at most. */
export const CUSTOM_STYLE_NAME = /^[a-z][a-z0-9_-]{0,15}$/i;

// Renames a custom style, keeping its settings, unless the name is taken or not a name.
function rename(context: Rows, from: string, to: string) {
  const name = to.trim();
  const { own, all } = customNames(context);
  if (name === from || !CUSTOM_STYLE_NAME.test(name) || all.includes(name) || !own.includes(from))
    return;
  const style = settingAt(context.target.own, ['styles', 'custom', from]);
  const custom = settingAt(context.target.own, ['styles', 'custom']) as Record<string, unknown>;
  const renamed = Object.fromEntries(
    Object.entries(custom).map(([key, value]) => (key === from ? [name, style] : [key, value])),
  );
  context.target.set(['styles', 'custom'], renamed);
}

// A style's name, kept as typed and committed on Enter or on leaving the field; Escape puts the
// name back.
function NameField({
  name,
  label,
  isDisabled,
  onCommit,
}: {
  name: string;
  label: string;
  isDisabled: boolean;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <TextField
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
      onPress={() => context.target.set(['styles', 'custom', name], null)}
    />
  ) : (
    <Button
      size="sm"
      variant="ghost"
      icon={EditGlyph}
      label={labels.overrideCustomStyle}
      tooltip={labels.overrideCustomStyle}
      isDisabled={props.isDisabled}
      onPress={() => context.target.set(['styles', 'custom', name, 'size'], '11pt')}
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
          onCommit={(next) => rename(context, name, next)}
        />
      </PropertyRow>
      <StyleRows scope={scope} heading={false} running />
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
