// The fields of the template editor's rows, one for each kind of setting: the base library's field,
// holding the template's own value and showing the value it inherits while it has none.

import { BooleanField } from '@flamboyantengineer/ui-components/boolean-field';
import { ColorField } from '@flamboyantengineer/ui-components/color-field';
import { Combobox } from '@flamboyantengineer/ui-components/combobox';
import { PageLandscapeGlyph, PagePortraitGlyph } from '@flamboyantengineer/ui-components/core';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import { type ReactNode, useState } from 'react';
import type { TemplateSetting } from './template-settings.js';

/** What a row shows and changes. */
export interface SettingRowProps {
  readonly setting: TemplateSetting;
  /** The template's own value, or undefined while it inherits one. */
  readonly value: unknown;
  /** The value the template inherits, shown while it has none of its own. */
  readonly inherited: unknown;
  /** Sets the template's own value; null inherits again, and an empty string is its own empty value. */
  readonly onChange: (value: unknown) => void;
  /** Names the inherited value, such as `Inherited: 12pt`, and where it comes from. */
  readonly inheritedLabel: (value: string, source?: string) => string;
  /** Where the inherited value comes from, such as the parent template's name. */
  readonly inheritedFrom?: string | undefined;
  /** The fonts a font field suggests. */
  readonly fonts?: readonly string[] | undefined;
  readonly isDisabled?: boolean | undefined;
}

// A length: a number and a unit, such as `12pt` or `20mm`.
const LENGTH = /^\d+(\.\d+)?(pt|px|mm|cm|in|em|rem)$/;

// Points in each unit a size may be written in.
const POINTS: Readonly<Record<string, number>> = {
  pt: 1,
  px: 0.75,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};

/** A size in points, from a length in any absolute unit; null when it is not one. */
export function toPoints(value: unknown): number | null {
  const match = /^(\d+(?:\.\d+)?)(pt|px|mm|cm|in)$/.exec(String(value ?? '').trim());
  const factor = match ? POINTS[match[2] ?? ''] : undefined;
  return match && factor ? Math.round(Number(match[1]) * factor * 100) / 100 : null;
}

// What a numbering format may hold: a level's character and the separators between levels.
const NOT_NUMBERING = /[^1aAiI.\-):/]/g;

/** A numbering format with what it may not hold left out. */
export const cleanNumbering = (text: string) => text.replace(NOT_NUMBERING, '');

/** Whether a value is unset, so the field inherits. */
export const isUnset = (value: unknown) => value === undefined || value === null;

// Whether there is a value to show as inherited: an inherited empty value shows nothing.
const hasNothing = (value: unknown) => isUnset(value) || value === '';

const shown = (value: unknown) =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value);

interface ControlProps extends SettingRowProps {
  readonly common: {
    readonly label: string;
    readonly labelLayout: 'control-only';
    readonly tracksChanges: false;
    readonly isDisabled: boolean | undefined;
    readonly size: 'sm';
    readonly density: 'compact';
    /** Names the inherited value and where it comes from, while the field inherits one. */
    readonly help: string | undefined;
    readonly showHelpButton: false;
  };
  readonly placeholder: string | undefined;
}

const optionsOf = (setting: TemplateSetting) =>
  setting.kind.type === 'select' || setting.kind.type === 'choice' ? setting.kind.options : [];

function SelectControl(props: ControlProps) {
  const { setting, value, onChange, inheritedLabel, inheritedFrom, common, placeholder } = props;
  const options = optionsOf(setting);
  const inherited = options.find((each) => each.id === placeholder)?.label ?? placeholder ?? '—';
  return (
    <SelectField
      {...common}
      options={options}
      value={typeof value === 'string' ? value : null}
      emptyLabel={inheritedLabel(inherited, inheritedFrom)}
      onChange={(key) => onChange(key === null || key === '' ? null : String(key))}
    />
  );
}

// The glyphs of the choices that have one, by the choice's id.
const CHOICE_GLYPHS: Readonly<Record<string, typeof PagePortraitGlyph>> = {
  portrait: PagePortraitGlyph,
  landscape: PageLandscapeGlyph,
};

// A choice among a few, as segments: the inherited one shows picked until one is.
function ChoiceControl({ setting, value, onChange, common, placeholder }: ControlProps) {
  const own = typeof value === 'string' ? value : null;
  return (
    <SegmentedChoice
      aria-label={common.label}
      size="sm"
      isDisabled={common.isDisabled}
      options={optionsOf(setting).map(({ id, label }) => ({
        value: id,
        label,
        ...(CHOICE_GLYPHS[id] ? { icon: CHOICE_GLYPHS[id] } : {}),
      }))}
      value={own ?? placeholder ?? null}
      isInherited={own === null}
      isClearable
      onChange={(picked) => onChange(picked)}
    />
  );
}

function BooleanControl(props: ControlProps) {
  const { value, onChange, inheritedLabel, inheritedFrom, common, placeholder } = props;
  return (
    <BooleanField
      {...common}
      allowsUnset
      value={typeof value === 'boolean' ? value : null}
      unsetLabel={inheritedLabel(placeholder ?? '—', inheritedFrom)}
      onChange={onChange}
    />
  );
}

function ColorControl({ value, onChange, common, placeholder }: ControlProps) {
  return (
    <ColorField
      {...common}
      allowsTyping
      value={typeof value === 'string' ? value : null}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}

function NumberControl({ setting, value, onChange, common, placeholder }: ControlProps) {
  const range: { min?: number; max?: number; step?: number } =
    setting.kind.type === 'number' ? setting.kind : {};
  return (
    <NumberField
      {...common}
      value={typeof value === 'number' ? value : null}
      placeholder={placeholder}
      hideStepper
      minValue={range.min}
      maxValue={range.max}
      step={range.step}
      onChange={onChange}
    />
  );
}

// A size in points, written as one, such as `12pt`; one in another absolute unit shows in points,
// and one in a relative unit, such as `1.5em`, shows as typed in a length field.
function PointsControl(props: ControlProps) {
  const { value, inherited, onChange, common } = props;
  const own = toPoints(value);
  if (own === null && !hasNothing(value)) return <LengthControl {...props} />;
  const from = toPoints(inherited);
  return (
    <NumberField
      {...common}
      value={own}
      placeholder={from === null ? undefined : String(from)}
      hideStepper
      minValue={0}
      maxValue={400}
      step={0.5}
      onChange={(points: number | null) => onChange(points === null ? null : `${String(points)}pt`)}
    />
  );
}

// A font, from those suggested or typed.
function FontControl({ value, onChange, fonts = [], common, placeholder }: ControlProps) {
  return (
    <Combobox
      aria-label={common.label}
      size="sm"
      isDisabled={common.isDisabled}
      allowsCustomValue
      menuTrigger="focus"
      defaultItems={fonts.map((font) => ({ id: font, label: font }))}
      inputValue={shown(value)}
      placeholder={placeholder}
      onInputChange={(text) => onChange(text.trim() || null)}
    />
  );
}

function TextControl({ setting, value, onChange, common, placeholder }: ControlProps) {
  const numbering = setting.kind.type === 'numbering';
  return (
    <TextField
      {...common}
      value={shown(value)}
      // An own empty value shows empty, not the inherited value it replaces.
      placeholder={isUnset(value) ? placeholder : undefined}
      errorMessage={setting.check?.(value) ?? undefined}
      // A numbering format keeps what it may hold; text is kept as typed, spaces too.
      onChange={(text) => onChange(numbering ? cleanNumbering(text) : text)}
    />
  );
}

// A length, such as `12pt` or `20mm`: what is typed shows as it is, and is kept once it reads as
// a length, or cleared.
function LengthControl({ value, onChange, common, placeholder }: ControlProps) {
  const external = shown(value);
  const [draft, setDraft] = useState({ text: external, from: external });
  return (
    <TextField
      {...common}
      value={draft.from === external ? draft.text : external}
      placeholder={placeholder}
      onChange={(text) => {
        const length = text.trim();
        const valid = !length || LENGTH.test(length);
        setDraft({ text, from: valid ? length : external });
        if (valid) onChange(length || null);
      }}
    />
  );
}

const CONTROLS = {
  select: SelectControl,
  choice: ChoiceControl,
  boolean: BooleanControl,
  color: ColorControl,
  number: NumberControl,
  points: PointsControl,
  font: FontControl,
  text: TextControl,
  length: LengthControl,
  numbering: TextControl,
  // Four sides have a row of their own (`SidesRow`).
  sides: TextControl,
} as const;

/** A setting's field. */
export function SettingControl(props: SettingRowProps): ReactNode {
  const { inherited, value, setting } = props;
  const placeholder = hasNothing(inherited) ? undefined : shown(inherited);
  const inheritedText =
    setting.kind.type === 'points' ? `${String(toPoints(inherited) ?? '')}pt` : shown(inherited);
  const common = {
    label: setting.label,
    labelLayout: 'control-only' as const,
    tracksChanges: false as const,
    isDisabled: props.isDisabled,
    size: 'sm' as const,
    density: 'compact' as const,
    // While the field inherits, what it inherits and from where describe it, in its Help.
    help:
      isUnset(value) && !hasNothing(inherited)
        ? props.inheritedLabel(inheritedText, props.inheritedFrom)
        : undefined,
    showHelpButton: false as const,
  };
  const Control = CONTROLS[props.setting.kind.type];
  return <Control {...props} common={common} placeholder={placeholder} />;
}
