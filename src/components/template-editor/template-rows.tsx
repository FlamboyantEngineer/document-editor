// The template editor's rows: each setting of a scope as a property row holding the target's own
// value and showing the one it inherits.

import type { TemplateFile } from '../../model/index.js';
import { SettingRow } from './setting-row.js';
import type { TemplateEditorLabels, TemplateEditorProps } from './template-editor.js';
import { DEFAULT_FONTS, settingAt, type TemplateSetting } from './template-settings.js';

// What the rows read and change: the document's settings, or a section's over them.
export interface Target {
  readonly own: TemplateFile;
  readonly inherited: TemplateFile | undefined;
  /** Where the inherited values come from: the parent template, or the document's settings. */
  readonly source: string;
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
        inheritedFrom={target.source}
        useInheritedLabel={labels.useInherited}
        fonts={props.fonts ?? DEFAULT_FONTS}
        isDisabled={props.isDisabled}
      />
    );
  });
}
