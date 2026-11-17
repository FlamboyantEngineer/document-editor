// One setting of the template editor as a property row: the base library's field for its kind,
// holding the template's own value and showing the value it inherits while it has none, with
// where it comes from as the field's help and hover text. A field with its own value over an
// inherited one inherits again from its context menu, or once it is cleared.

import {
  PropertyGroup,
  PropertyRow,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import { SidesRow } from './margins-row.js';
import { isUnset, SettingControl, type SettingRowProps } from './setting-controls.js';
import { Field, fontsOf } from './style-fields.js';
import { templateEditorHooks as hooks } from './template-editor-hooks.js';
import type { Rows } from './template-rows.js';
import { settingAt, type TemplateSetting } from './template-settings.js';

export type { SettingRowProps } from './setting-controls.js';

/** A setting's row. */
export function SettingRow(props: SettingRowProps) {
  const { setting, value, inherited } = props;
  return (
    <PropertyRow
      label={setting.label}
      keywords={setting.keywords}
      hint={setting.hint}
      unit={setting.kind.type === 'points' ? 'pt' : undefined}
      isOverridden={!isUnset(value)}
      data-inherited={isUnset(value) && !isUnset(inherited) ? true : undefined}
    >
      <SettingControl {...props} />
    </PropertyRow>
  );
}

// Fields on one row, each with its short label before it.
function StripRow({
  context,
  path,
  setting,
}: {
  context: Rows;
  path: readonly string[];
  setting: TemplateSetting;
}) {
  const cells = setting.kind.type === 'strip' ? setting.kind.cells : [];
  const isOverridden = cells.some(
    (each) => !isUnset(settingAt(context.target.own, [...path, ...each.path])),
  );
  return (
    <PropertyRow
      label={setting.label}
      keywords={setting.keywords}
      hint={setting.hint}
      isOverridden={isOverridden}
    >
      <PropertyStrip className={hooks.slot('strip').className}>
        {cells.map((each) => (
          <PropertyStripCell key={each.id} letter={each.letter ?? ''} label={each.label}>
            <Field
              scope={{ context, path }}
              name={each.path.join('.')}
              label={each.label}
              kind={each.kind}
              tip={each.tip}
            />
          </PropertyStripCell>
        ))}
      </PropertyStrip>
    </PropertyRow>
  );
}

/** Each setting at a scope of the rows' target as a row. */
export function rows(
  context: Rows,
  scope: readonly string[],
  settings: readonly TemplateSetting[],
): ReactNode[] {
  const { props, labels, target, inSection } = context;
  const rowOf = (given: TemplateSetting) => {
    const setting =
      inSection && given.sectionLabel ? { ...given, label: given.sectionLabel } : given;
    const path = [...scope, ...setting.path];
    if (setting.kind.type === 'strip')
      return <StripRow key={setting.id} context={context} path={path} setting={setting} />;
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
        fieldLabels={labels}
        inheritedFrom={target.source}
        fonts={fontsOf(context, setting.kind.type === 'font' && setting.kind.code)}
        isDisabled={props.isDisabled}
      />
    );
  };
  // A run of rows of one group goes under its heading.
  const headingOf = (setting: TemplateSetting | undefined) =>
    setting?.group && (inSection ? setting.group.section : setting.group.document);
  const shown: ReactNode[] = [];
  settings.forEach((setting, index) => {
    const heading = headingOf(setting);
    if (!heading) shown.push(rowOf(setting));
    else if (heading !== headingOf(settings[index - 1])) {
      const run = settings.slice(index);
      const end = run.findIndex((each) => headingOf(each) !== heading);
      shown.push(
        <PropertyGroup key={`group:${heading}`} heading={heading}>
          {run.slice(0, end < 0 ? run.length : end).map(rowOf)}
        </PropertyGroup>,
      );
    }
  });
  return shown;
}
