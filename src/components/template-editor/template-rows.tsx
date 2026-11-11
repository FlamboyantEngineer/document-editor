// The template editor's rows: each setting of a scope as a property row holding the target's own
// value and showing the one it inherits, and the text styles, built-in and custom, picked one at
// a time.

import { Button } from '@flamboyantengineer/ui-components/button';
import type { Key } from '@flamboyantengineer/ui-components/core';
import { PropertyRow, PropertySection } from '@flamboyantengineer/ui-components/property-panel';
import { SelectField } from '@flamboyantengineer/ui-components/select-field';
import { useState } from 'react';
import type { TemplateFile } from '../../model/index.js';
import { SettingRow } from './setting-row.js';
import type { TemplateEditorLabels, TemplateEditorProps } from './template-editor.js';
import {
  settingAt,
  type TemplateSetting,
  TEXT_STYLE_SETTINGS,
  TEXT_STYLES,
} from './template-settings.js';

// What the rows read and change: the document's settings, or a section's over them.
export interface Target {
  readonly own: TemplateFile;
  readonly inherited: TemplateFile | undefined;
  readonly set: (path: readonly string[], value: unknown) => void;
}

export interface Rows {
  readonly props: TemplateEditorProps;
  readonly labels: TemplateEditorLabels;
  readonly target: Target;
}

export function rows(
  { props, labels, target }: Rows,
  scope: readonly string[],
  settings: readonly TemplateSetting[],
) {
  return settings.map((setting) => {
    const path = [...scope, ...setting.path];
    return (
      <SettingRow
        key={setting.id}
        setting={setting}
        value={settingAt(target.own, path)}
        inherited={target.inherited ? settingAt(target.inherited, path) : undefined}
        onChange={(value) => target.set(path, value)}
        inheritedLabel={labels.inherited}
        isDisabled={props.isDisabled}
      />
    );
  });
}

// The names of the custom styles the target has or inherits.
function customNames({ target }: Rows): string[] {
  const names = (source: unknown) =>
    source && typeof source === 'object' ? Object.keys(source) : [];
  return [
    ...new Set([
      ...names(settingAt(target.own, ['styles', 'custom'])),
      ...names(target.inherited ? settingAt(target.inherited, ['styles', 'custom']) : undefined),
    ]),
  ];
}

// A custom style name the template has not used.
function freshStyle(taken: readonly string[]): string {
  let index = taken.length + 1;
  while (taken.includes(`style_${String(index)}`)) index += 1;
  return `style_${String(index)}`;
}

// Adds a custom style and deletes the one picked.
function CustomStyleActions({
  context,
  style,
  onPick,
}: {
  context: Rows;
  style: string;
  onPick: (style: string) => void;
}) {
  const { labels, target, props } = context;
  const custom = style.startsWith('custom.') ? style.slice('custom.'.length) : null;
  return (
    <PropertyRow label={labels.customStyle}>
      <Button
        size="sm"
        isDisabled={props.isDisabled}
        onPress={() => {
          const name = freshStyle(customNames(context));
          target.set(['styles', 'custom', name], { size: '11pt' });
          onPick(`custom.${name}`);
        }}
      >
        {labels.addCustomStyle}
      </Button>
      {custom ? (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={props.isDisabled}
          onPress={() => {
            target.set(['styles', 'custom', custom], null);
            onPick('paragraph');
          }}
        >
          {labels.deleteCustomStyle}
        </Button>
      ) : null}
    </PropertyRow>
  );
}

// The text styles: a picker, then the picked style's settings.
export function TextStyles(context: Rows) {
  const [style, setStyle] = useState<string>('paragraph');
  const { labels } = context;
  const custom = customNames(context);
  const options = [
    ...TEXT_STYLES,
    ...custom.map((name) => ({ id: `custom.${name}`, label: name })),
  ];
  const scope = style.startsWith('custom.')
    ? ['styles', 'custom', style.slice('custom.'.length)]
    : ['styles', style];
  const numbering: TemplateSetting = {
    id: 'numbering',
    path: ['numbering', 'format'],
    label: labels.numbering,
    kind: { type: 'text' },
  };
  return (
    <PropertySection id="text-styles" title={labels.textStyles} defaultExpanded>
      <PropertyRow label={labels.style}>
        <SelectField
          label={labels.style}
          labelLayout="control-only"
          density="compact"
          tracksChanges={false}
          options={options}
          value={style}
          onChange={(key: Key | null) => {
            if (typeof key === 'string') setStyle(key);
          }}
        />
      </PropertyRow>
      <CustomStyleActions context={context} style={style} onPick={setStyle} />
      {rows(
        context,
        scope,
        style.startsWith('heading') ? [...TEXT_STYLE_SETTINGS, numbering] : TEXT_STYLE_SETTINGS,
      )}
    </PropertySection>
  );
}
