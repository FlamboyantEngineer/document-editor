// One setting of the template editor as a property row: the base library's field for its kind,
// holding the template's own value and showing the value it inherits while it has none, with
// where it comes from as the row's tooltip.

import { PropertyRow } from '@flamboyantengineer/ui-components/property-panel';
import { createHooks } from '../../utils/hooks.js';
import { SettingControl, type SettingRowProps, toPoints } from './setting-controls.js';

export type { SettingRowProps } from './setting-controls.js';

const hooks = createHooks('template-editor', ['field']);

const isUnset = (value: unknown) => value === undefined || value === null || value === '';

/** A setting's row. */
export function SettingRow(props: SettingRowProps) {
  const { setting, value, inherited, inheritedLabel, inheritedFrom } = props;
  const inherits = isUnset(value) && !isUnset(inherited);
  const shown =
    setting.kind.type === 'points' ? `${String(toPoints(inherited) ?? '')}pt` : String(inherited);
  return (
    <PropertyRow
      label={setting.label}
      keywords={setting.keywords}
      hint={setting.hint}
      unit={setting.kind.type === 'points' ? 'pt' : undefined}
      isOverridden={!isUnset(value)}
    >
      <div
        {...hooks.slot('field')}
        title={inherits ? inheritedLabel(shown, inheritedFrom) : undefined}
      >
        <SettingControl {...props} />
      </div>
    </PropertyRow>
  );
}
