// One setting of the template editor as a property row: the base library's field for its kind,
// holding the template's own value and showing the value it inherits while it has none.

import { BooleanField } from '@flamboyantengineer/ui-components/boolean-field';
import { ColorField } from '@flamboyantengineer/ui-components/color-field';
import { NumberField } from '@flamboyantengineer/ui-components/number-field';
import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { TextField } from '@flamboyantengineer/ui-components/text-field';
import type { ReactNode } from 'react';
import type { TemplateSetting } from './template-settings.js';

/** What a row shows and changes. */
export interface SettingRowProps {
  readonly setting: TemplateSetting;
  /** The template's own value, or undefined while it inherits one. */
  readonly value: unknown;
  /** The value the template inherits, shown while it has none of its own. */
  readonly inherited: unknown;
  /** Sets the template's own value; null inherits again. */
  readonly onChange: (value: unknown) => void;
  /** Names the inherited value, such as `Inherited: 12pt`. */
  readonly inheritedLabel: (value: string) => string;
  readonly isDisabled?: boolean | undefined;
}

// A length: a number and a unit, such as `12pt` or `20mm`.
const LENGTH = /^\d+(\.\d+)?(pt|px|mm|cm|in|em|rem)$/;

const shown = (value: unknown) =>
  value === undefined || value === null ? '' : typeof value === 'string' ? value : String(value);

interface ControlProps extends SettingRowProps {
  readonly common: {
    readonly label: string;
    readonly labelLayout: 'control-only';
    readonly tracksChanges: false;
    readonly isDisabled: boolean | undefined;
    readonly density: 'compact';
  };
  readonly placeholder: string | undefined;
}

function SelectControl({
  setting,
  value,
  onChange,
  inheritedLabel,
  common,
  placeholder,
}: ControlProps) {
  const options = setting.kind.type === 'select' ? setting.kind.options : [];
  const inherited = options.find((each) => each.id === placeholder)?.label ?? placeholder ?? '—';
  return (
    <SelectField
      {...common}
      options={options}
      value={typeof value === 'string' ? value : null}
      emptyLabel={inheritedLabel(inherited)}
      onChange={(key) => onChange(key === null || key === '' ? null : String(key))}
    />
  );
}

function BooleanControl({ value, onChange, inheritedLabel, common, placeholder }: ControlProps) {
  return (
    <BooleanField
      {...common}
      allowsUnset
      value={typeof value === 'boolean' ? value : null}
      unsetLabel={inheritedLabel(placeholder ?? '—')}
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
      minValue={range.min}
      maxValue={range.max}
      step={range.step}
      onChange={onChange}
    />
  );
}

function TextControl({ setting, value, onChange, common, placeholder }: ControlProps) {
  const isLength = setting.kind.type === 'length';
  return (
    <TextField
      {...common}
      value={shown(value)}
      placeholder={placeholder}
      onChange={(text) => {
        // A length is kept once it reads as one, such as 12pt or 20mm.
        if (!isLength || !text || LENGTH.test(text.trim())) onChange(text.trim());
      }}
    />
  );
}

const CONTROLS = {
  select: SelectControl,
  boolean: BooleanControl,
  color: ColorControl,
  number: NumberControl,
  text: TextControl,
  length: TextControl,
} as const;

function control(props: SettingRowProps): ReactNode {
  const common = {
    label: props.setting.label,
    labelLayout: 'control-only' as const,
    tracksChanges: false as const,
    isDisabled: props.isDisabled,
    density: 'compact' as const,
  };
  const { inherited } = props;
  const placeholder = inherited === undefined || inherited === null ? undefined : shown(inherited);
  const Control = CONTROLS[props.setting.kind.type];
  return <Control {...props} common={common} placeholder={placeholder} />;
}

/** A setting's row. */
export function SettingRow(props: SettingRowProps) {
  return (
    <PropertyRow label={props.setting.label} keywords={props.setting.keywords}>
      {control(props)}
    </PropertyRow>
  );
}
