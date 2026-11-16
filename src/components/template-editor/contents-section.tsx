// The template editor's contents section: a list type picker, every list's settings or one kind's
// over them, with its custom title; and for every list and a table of contents, a heading level
// picker with that level's type, indentation, spacing and leader. The levels' indentation and spacing can be set all
// at once: each level indented one step past the one above it.

import type { Key } from '@flamboyantengineer/ui-components/core';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import {
  PropertyCard,
  PropertyRow,
  PropertySection,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { type ReactNode, useState } from 'react';
import { CONTENTS_KINDS, contentsSettings, hasLevels, withAllLevels } from './contents-catalog.js';
import { SettingCard } from './setting-card.js';
import { rows } from './setting-row.js';
import type { Rows } from './template-rows.js';
import { settingAt } from './template-settings.js';

// The picker's key for every list's settings: no kind's key has a `#`.
const ALL_LISTS = '#all';

const LEVEL_OPTIONS = [0, 1, 2, 3, 4, 5].map((index) => ({
  id: String(index),
  label: `Heading ${String(index + 1)}`,
}));

// A picker row of the section.
function Picker({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  isDisabled: boolean | undefined;
}) {
  return (
    <PropertyRow label={label}>
      <SelectField
        label={label}
        labelLayout="control-only"
        density="compact"
        tracksChanges={false}
        options={options}
        value={value}
        onChange={(key: Key | null) => {
          if (typeof key === 'string') onChange(key);
        }}
        isDisabled={isDisabled}
      />
    </PropertyRow>
  );
}

const STEPS = [
  ['indent', '→', 'Indent each level'],
  ['before', '↑', 'Space before each level'],
  ['after', '↓', 'Space after each level'],
] as const;

// The levels' indentation and spacing, set all at once in points when a field is edited: each
// level indented one step past the one above it.
function AllLevelsCard({ context, scope }: { context: Rows; scope: readonly string[] }) {
  const path = [...scope, 'levels'];
  return (
    <PropertyCard name="All levels">
      <PropertyRow label="Levels" unit="pt" hint="Sets every level when edited">
        <PropertyStrip>
          {STEPS.map(([key, letter, label]) => (
            <PropertyStripCell key={key} letter={letter} label={label}>
              <NumberField
                label={label}
                labelLayout="control-only"
                density="compact"
                tracksChanges={false}
                value={null}
                minValue={0}
                maxValue={400}
                step={0.5}
                isDisabled={context.props.isDisabled}
                onChange={(value: number | null) => {
                  if (value === null) return;
                  const own = settingAt(context.target.own, path);
                  context.target.set(path, withAllLevels(own, { [key]: value }));
                }}
              />
            </PropertyStripCell>
          ))}
        </PropertyStrip>
      </PropertyRow>
    </PropertyCard>
  );
}

/** The contents section: every list's settings, or one kind's, and a heading level's. */
export function ContentsSection({ context, extra }: { context: Rows; extra?: ReactNode }) {
  const [kind, setKind] = useState(ALL_LISTS);
  const [level, setLevel] = useState(0);
  const selected = kind === ALL_LISTS ? null : kind;
  const section = contentsSettings(selected, level);
  const { own, inherited } = context.target;
  return (
    <PropertySection id={section.id} title={section.title}>
      <Picker
        label="List type"
        options={[
          { id: ALL_LISTS, label: 'All lists' },
          ...CONTENTS_KINDS.map(([id, label]) => ({ id, label })),
        ]}
        value={kind}
        onChange={setKind}
        isDisabled={false}
      />
      {hasLevels(selected) ? (
        <Picker
          label="Heading level"
          options={LEVEL_OPTIONS}
          value={String(level)}
          onChange={(value) => setLevel(Number(value))}
          isDisabled={false}
        />
      ) : null}
      {rows(context, section.scope, section.settings)}
      {section.cards?.map((card) => {
        const path = [...section.scope, ...card.path];
        return (
          <SettingCard
            key={`${kind}-${card.id}`}
            context={context}
            scope={section.scope}
            card={card}
            own={settingAt(own, path)}
            inherited={inherited ? settingAt(inherited, path) : undefined}
          />
        );
      })}
      {hasLevels(selected) ? (
        <AllLevelsCard key={kind} context={context} scope={section.scope} />
      ) : null}
      {extra}
    </PropertySection>
  );
}
