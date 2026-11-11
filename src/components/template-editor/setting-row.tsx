// One setting of the template editor as a property row: the base library's field for its kind,
// holding the template's own value and showing the value it inherits while it has none, with
// where it comes from as the field's help.

import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { isUnset, SettingControl, type SettingRowProps } from './setting-controls.js';

export type { SettingRowProps } from './setting-controls.js';

/** A setting's row. */
export function SettingRow(props: SettingRowProps) {
  const { setting, value } = props;
  return (
    <PropertyRow
      label={setting.label}
      keywords={setting.keywords}
      hint={setting.hint}
      unit={setting.kind.type === 'points' ? 'pt' : undefined}
      isOverridden={!isUnset(value)}
    >
      <SettingControl {...props} />
    </PropertyRow>
  );
}
