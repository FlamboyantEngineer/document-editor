// The rows of a style's card, by its parts: its font, size, weight, slant and underline, its
// colour and its spacing before and after (the alignment and line height are `style-face.tsx`).
// Each field holds the style's own value and shows the one it inherits while it has none.

import {
  PropertyRow,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import type { ReactNode } from 'react';
import { SettingControl, type SettingRowProps, toPoints } from './setting-controls.js';
import { templateEditorHooks as hooks } from './template-editor-hooks.js';
import type { Rows } from './template-rows.js';
import {
  DEFAULT_CODE_FONTS,
  DEFAULT_FONTS,
  settingAt,
  type SettingKind,
} from './template-settings.js';

/** What a style's rows edit: the rows' context and the path of the style in the template. */
export interface StyleScope {
  readonly context: Rows;
  readonly path: readonly string[];
}

/** The fonts a font field suggests: the editor's code fonts for code, or its fonts. */
export const fontsOf = ({ props }: Rows, code: boolean | undefined) =>
  code ? (props.codeFonts ?? DEFAULT_CODE_FONTS) : (props.fonts ?? DEFAULT_FONTS);

/** The style's own value at a key, and the one it inherits. */
export function styleValue({ context, path }: StyleScope, key: readonly string[]) {
  const at = [...path, ...key];
  const { own, inherited } = context.target;
  return {
    own: settingAt(own, at),
    inherited: inherited ? settingAt(inherited, at) : undefined,
    set: (value: unknown) => context.target.set(at, value),
  };
}

/** A field of the style, by its key, kind and label. */
export function Field({
  scope,
  name,
  label,
  kind,
  tip,
}: {
  scope: StyleScope;
  name: string;
  label: string;
  kind: SettingKind;
  /** The field's hover text while it has a value of its own. */
  tip?: string | undefined;
}): ReactNode {
  const { context } = scope;
  const value = styleValue(scope, name.split('.'));
  const props: SettingRowProps = {
    setting: { id: name, path: name.split('.'), label, kind, ...(tip ? { tip } : {}) },
    value: value.own,
    inherited: value.inherited,
    onChange: value.set,
    inheritedLabel: context.labels.inherited,
    fieldLabels: context.labels,
    inheritedFrom: context.target.source,
    fonts: fontsOf(context, kind.type === 'font' && kind.code),
    isDisabled: context.props.isDisabled,
  };
  return <SettingControl {...props} />;
}

/** The size in points alone. */
export function SizeRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyRow label={labels.size} unit="pt">
      <Field scope={scope} name="size" label={labels.size} kind={{ type: 'points' }} />
    </PropertyRow>
  );
}

/**
 * The font, its size in points and, given them, the toggles of its weight, slant and underline,
 * on one row that wraps.
 */
export function FontRow({
  scope,
  code,
  toggles,
}: {
  scope: StyleScope;
  code?: boolean | undefined;
  toggles?: ReactNode;
}) {
  const { labels } = scope.context;
  return (
    <PropertyRow
      label={labels.font}
      keywords={[labels.size, labels.bold, labels.italic, labels.underline]}
    >
      <Field scope={scope} name="font" label={labels.font} kind={{ type: 'font', code }} />
      <Field scope={scope} name="size" label={labels.size} kind={{ type: 'points' }} />
      <span {...hooks.slot('unit')}>pt</span>
      {toggles}
    </PropertyRow>
  );
}

/** The colour. */
export function ColourRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyRow label={labels.colour}>
      <Field scope={scope} name="color" label={labels.colour} kind={{ type: 'color' }} />
    </PropertyRow>
  );
}

/** The space before and after, in points, each with a short label. */
export function SpacingRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyRow
      label={labels.spacing}
      unit="pt"
      keywords={[labels.spaceBefore, labels.spaceAfter]}
    >
      <PropertyStrip>
        <PropertyStripCell letter={labels.before} label={labels.spaceBefore}>
          <Field
            scope={scope}
            name="spaceBefore"
            label={labels.spaceBefore}
            kind={{ type: 'points' }}
          />
        </PropertyStripCell>
        <PropertyStripCell letter={labels.after} label={labels.spaceAfter}>
          <Field
            scope={scope}
            name="spaceAfter"
            label={labels.spaceAfter}
            kind={{ type: 'points' }}
          />
        </PropertyStripCell>
      </PropertyStrip>
    </PropertyRow>
  );
}

/** What a style reads as in its card's header: its font and size, and its spacing. */
export function styleSummary(scope: StyleScope): string {
  const read = (key: string) => {
    const value = styleValue(scope, [key]);
    return value.own ?? value.inherited;
  };
  // A size in points, or as written when it is in a relative unit; a dash when unset.
  const points = (key: string) => {
    const value = read(key);
    const converted = toPoints(value);
    if (converted !== null) return { text: String(converted), unit: 'pt' };
    return { text: typeof value === 'string' && value ? value : '–', unit: '' };
  };
  const font = typeof read('font') === 'string' ? String(read('font')) : '';
  const size = points('size');
  const spacing = `${points('spaceBefore').text}/${points('spaceAfter').text}`;
  return `${font} ${size.text}${size.text === '–' ? 'pt' : size.unit} · ${spacing}`.trim();
}

/** Whether the style sets anything of its own. */
export function isStyleOverridden(scope: StyleScope): boolean {
  const own = settingAt(scope.context.target.own, scope.path);
  return Boolean(own && typeof own === 'object' && Object.keys(own).length);
}
