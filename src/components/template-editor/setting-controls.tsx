// The fields of the template editor's rows, one for each kind of setting: the base library's field,
// holding the template's own value and showing the value it inherits while it has none.

import { BooleanField } from '@flamboyantengineer/ui-components/boolean-field';
import { ColorField } from '@flamboyantengineer/ui-components/color-field';
import {
  type Key,
  PageLandscapeGlyph,
  PagePortraitGlyph,
} from '@flamboyantengineer/ui-components/core';
import { defaultFieldMenu, type FieldMenuEntry } from '@flamboyantengineer/ui-components/field';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import type { ReactNode } from 'react';
import { FontControl, LengthControl, NumberingControl, TextControl } from './draft-controls.js';
import { templateEditorHooks as hooks } from './template-editor-hooks.js';
import {
  DEFAULT_TEMPLATE_SETTINGS_LABELS,
  type TemplateSetting,
  type TemplateSettingsLabels,
} from './template-settings.js';

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
  /** The fonts a font field offers. */
  readonly fonts?: readonly string[] | undefined;
  /** The fields' own text: the names of on and off, and why a typed length is not valid. */
  readonly fieldLabels?: TemplateSettingsLabels | undefined;
  readonly isDisabled?: boolean | undefined;
}

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
  // Rounded only past what a typed value holds, so 10.25pt and 0.125in keep their digits.
  return match && factor ? Number((Number(match[1]) * factor).toPrecision(12)) : null;
}

/** Whether a value is unset, so the field inherits. */
export const isUnset = (value: unknown) => value === undefined || value === null;

// Whether there is a value to show as inherited: an inherited empty value shows nothing.
const hasNothing = (value: unknown) => isUnset(value) || value === '';

const shown = (value: unknown) =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value);

/** What a field draws with. */
export interface ControlProps extends SettingRowProps {
  readonly fieldLabels: TemplateSettingsLabels;
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
    /** The field's context menu: its own, then inheriting again while it has a value of its own. */
    readonly menu: readonly FieldMenuEntry[];
    readonly onMenuAction: (key: Key) => void;
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

// A yes or no that may be unset, as a switch captioned on, off, or inherited with what it inherits;
// it goes from inherited to on, off and inherited again.
function BooleanControl(props: ControlProps) {
  const { value, onChange, inheritedLabel, inheritedFrom, common, placeholder, fieldLabels } =
    props;
  const inherited =
    placeholder === 'true' ? fieldLabels.on : placeholder === 'false' ? fieldLabels.off : '—';
  return (
    <BooleanField
      {...common}
      variant="switch"
      allowsUnset
      value={typeof value === 'boolean' ? value : null}
      trueLabel={fieldLabels.on}
      falseLabel={fieldLabels.off}
      unsetLabel={inheritedLabel(inherited, inheritedFrom)}
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

// A number, kept as typed within its bounds: a value outside them says so and is not written.
function NumberControl({ setting, value, onChange, common, placeholder }: ControlProps) {
  const range: { min?: number; max?: number; step?: number } =
    setting.kind.type === 'number' ? setting.kind : {};
  return (
    <NumberField
      {...common}
      value={typeof value === 'number' ? value : null}
      placeholder={placeholder}
      minValue={range.min}
      maxValue={range.max}
      step={range.step}
      commitBehavior="validate"
      onChange={(next: number | null) => {
        const inRange =
          next === null ||
          ((range.min === undefined || next >= range.min) &&
            (range.max === undefined || next <= range.max));
        if (inRange) onChange(next);
      }}
    />
  );
}

// A size in points, any non-negative decimal, written as one, such as `10.25pt`; one in another
// absolute unit shows in points, and one in a relative unit, such as `1.5em`, shows as typed in a
// length field.
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
      minValue={0}
      commitBehavior="validate"
      onChange={(points: number | null) => {
        if (points === null || points >= 0)
          onChange(points === null ? null : `${String(points)}pt`);
      }}
    />
  );
}

// The menu entry that inherits again.
const INHERIT = 'inherit';

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
  numbering: NumberingControl,
  // Four sides and strips have rows of their own (`SidesRow`, `StripRow`).
  sides: TextControl,
  strip: TextControl,
} as const;

/** A setting's field. */
export function SettingControl(props: SettingRowProps): ReactNode {
  const labels = props.fieldLabels ?? DEFAULT_TEMPLATE_SETTINGS_LABELS;
  const { inherited, value, setting } = props;
  const placeholder = hasNothing(inherited) ? undefined : shown(inherited);
  const inheritedText =
    setting.kind.type === 'points'
      ? `${String(toPoints(inherited) ?? '')}pt`
      : typeof inherited === 'boolean'
        ? inherited
          ? labels.on
          : labels.off
        : shown(inherited);
  const common = {
    label: setting.label,
    labelLayout: 'control-only' as const,
    tracksChanges: false as const,
    isDisabled: props.isDisabled,
    size: 'sm' as const,
    density: 'compact' as const,
    // While the field inherits, what it inherits and from where describe it, in its Help; a
    // switch says so in its caption.
    help:
      isUnset(value) && !hasNothing(inherited) && setting.kind.type !== 'boolean'
        ? props.inheritedLabel(inheritedText, props.inheritedFrom)
        : undefined,
    showHelpButton: false as const,
    menu: [
      ...defaultFieldMenu,
      ...(isUnset(value) || hasNothing(inherited)
        ? []
        : [{ id: INHERIT, label: labels.resetToInherited }]),
    ],
    onMenuAction: (key: Key) => {
      if (key === INHERIT) props.onChange(null);
    },
  };
  const Control = CONTROLS[props.setting.kind.type];
  const inherits = isUnset(value) && !hasNothing(inherited);
  return (
    // While it inherits, hovering the field says from where and how to override it.
    <span
      {...hooks.slot('setting', { inherited: inherits })}
      title={
        inherits && props.inheritedFrom ? labels.inheritedTitle(props.inheritedFrom) : setting.tip
      }
    >
      <Control {...props} fieldLabels={labels} common={common} placeholder={placeholder} />
    </span>
  );
}
