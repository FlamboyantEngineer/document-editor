// One setting of the template editor as a property row: the base library's field for its kind,
// holding the template's own value and showing the value it inherits while it has none, with
// where it comes from as the field's help. A row with its own value, even an empty one, over an
// inherited one offers to inherit again (the row's reset).

import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import { SidesRow } from './margins-row.js';
import { isUnset, SettingControl, type SettingRowProps } from './setting-controls.js';
import { fontsOf } from './style-fields.js';
import type { Rows } from './template-rows.js';
import { settingAt, type TemplateSetting } from './template-settings.js';

export type { SettingRowProps } from './setting-controls.js';

/** A setting's row. */
export function SettingRow(props: SettingRowProps) {
  const { setting, value, inherited } = props;
  const canInherit = !isUnset(value) && !isUnset(inherited) && !props.isDisabled;
  return (
    <PropertyRow
      label={setting.label}
      keywords={setting.keywords}
      hint={setting.hint}
      unit={setting.kind.type === 'points' ? 'pt' : undefined}
      isOverridden={!isUnset(value)}
      onReset={canInherit ? () => props.onChange(null) : undefined}
    >
      <SettingControl {...props} />
    </PropertyRow>
  );
}

/** Each setting at a scope of the rows' target as a row. */
export function rows(
  context: Rows,
  scope: readonly string[],
  settings: readonly TemplateSetting[],
): ReactNode[] {
  const { props, labels, target } = context;
  return settings.map((setting) => {
    const path = [...scope, ...setting.path];
    if (setting.kind.type === 'sides')
      return (
        <SidesRow
          key={setting.id}
          context={context}
          path={path}
          label={setting.label}
          side={setting.kind.side}
          unit={setting.kind.unit}
        />
      );
    return (
      <SettingRow
        key={setting.id}
        setting={setting}
        value={settingAt(target.own, path)}
        inherited={target.inherited ? settingAt(target.inherited, path) : undefined}
        onChange={(value) => target.set(path, value)}
        inheritedLabel={labels.inherited}
        inheritedFrom={target.source}
        fonts={fontsOf(context, setting.kind.type === 'font' && setting.kind.code)}
        isDisabled={props.isDisabled}
      />
    );
  });
}
