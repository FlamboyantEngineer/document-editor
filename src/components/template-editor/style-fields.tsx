// The rows of a style's card, by its parts: its font and size, its weight, slant, underline and
// alignment, its colour, its spacing before and after, its line height and its numbering.
// Each field holds the style's own value and shows the one it inherits while it has none.

import { Button } from '@flamboyantengineer/ui-components/button';
import {
  BoldGlyph,
  ItalicGlyph,
  TextAlignCenterGlyph,
  TextAlignJustifyGlyph,
  TextAlignLeftGlyph,
  TextAlignRightGlyph,
  UnderlineGlyph,
} from '@flamboyantengineer/ui-components/core';
import type { IconSource } from '@flamboyantengineer/ui-components/icon';
import {
  PropertyIconGroup,
  PropertyRow,
  PropertyStrip,
  PropertyStripCell,
} from '@flamboyantengineer/ui-components/property-panel';
import { SegmentedChoice } from '@flamboyantengineer/ui-components/segmented-choice';
import type { ReactNode } from 'react';
import { SettingControl, type SettingRowProps, toPoints } from './setting-controls.js';
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
}: {
  scope: StyleScope;
  name: string;
  label: string;
  kind: SettingKind;
}): ReactNode {
  const { context } = scope;
  const value = styleValue(scope, name.split('.'));
  const props: SettingRowProps = {
    setting: { id: name, path: name.split('.'), label, kind },
    value: value.own,
    inherited: value.inherited,
    onChange: value.set,
    inheritedLabel: context.labels.inherited,
    inheritedFrom: context.target.source,
    fonts: fontsOf(context, kind.type === 'font' && kind.code),
    isDisabled: context.props.isDisabled,
  };
  return <SettingControl {...props} />;
}

/** The font and its size in points, on one row. */
export function FontRow({ scope, code }: { scope: StyleScope; code?: boolean | undefined }) {
  const { labels } = scope.context;
  return (
    <PropertyRow label={labels.font} keywords={[labels.size]} unit="pt">
      <Field scope={scope} name="font" label={labels.font} kind={{ type: 'font', code }} />
      <Field scope={scope} name="size" label={labels.size} kind={{ type: 'points' }} />
    </PropertyRow>
  );
}

// A face toggle that cycles inherited, on, off and inherited again; while inherited it shows the
// inherited state as mixed.
function FaceToggle({
  scope,
  name,
  label,
  icon,
  read,
  write,
}: {
  scope: StyleScope;
  name: string;
  label: string;
  icon: IconSource;
  read: (value: unknown) => boolean | null;
  write: (on: boolean) => unknown;
}) {
  const value = styleValue(scope, [name]);
  const own = read(value.own);
  const shown = own ?? read(value.inherited) ?? false;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={icon}
      label={label}
      tooltip={label}
      isDisabled={scope.context.props.isDisabled}
      isSelected={shown}
      aria-pressed={own === null ? 'mixed' : own}
      onPress={() => value.set(own === null ? write(true) : own ? write(false) : null)}
    />
  );
}

const ALIGNMENT_GLYPHS = {
  left: TextAlignLeftGlyph,
  center: TextAlignCenterGlyph,
  right: TextAlignRightGlyph,
  justify: TextAlignJustifyGlyph,
} as const;

const asFlag = (value: unknown) => (typeof value === 'boolean' ? value : null);
const asBold = (value: unknown) => (typeof value === 'number' ? value >= 600 : null);

/**
 * The weight, slant and underline, and the alignment, justified for running text only; a font
 * alone has no alignment.
 */
export function FaceRow({
  scope,
  align,
}: {
  scope: StyleScope;
  align: 'none' | 'plain' | 'justify';
}) {
  const { labels } = scope.context;
  const alignment = styleValue(scope, ['alignment']);
  const own = typeof alignment.own === 'string' ? alignment.own : null;
  const inherited = typeof alignment.inherited === 'string' ? alignment.inherited : null;
  const ids: readonly ('left' | 'center' | 'right' | 'justify')[] =
    align === 'justify' ? ['left', 'center', 'right', 'justify'] : ['left', 'center', 'right'];
  const aligns = ids.map((id) => ({
    value: id,
    label: labels.alignments[id],
    icon: ALIGNMENT_GLYPHS[id],
  }));
  return (
    <PropertyRow label={labels.face}>
      <PropertyIconGroup variant="separate" aria-label={labels.face}>
        <FaceToggle
          scope={scope}
          name="weight"
          label={labels.bold}
          icon={BoldGlyph}
          read={asBold}
          write={(on) => (on ? 700 : 400)}
        />
        <FaceToggle
          scope={scope}
          name="italic"
          label={labels.italic}
          icon={ItalicGlyph}
          read={asFlag}
          write={(on) => on}
        />
        <FaceToggle
          scope={scope}
          name="underline"
          label={labels.underline}
          icon={UnderlineGlyph}
          read={asFlag}
          write={(on) => on}
        />
      </PropertyIconGroup>
      {align === 'none' ? null : (
        <SegmentedChoice
          aria-label={labels.alignment}
          size="sm"
          sizing="content"
          iconOnly
          isDisabled={scope.context.props.isDisabled}
          options={aligns}
          value={own ?? inherited}
          isInherited={own === null}
          isClearable
          onChange={(picked) => alignment.set(picked)}
        />
      )}
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

/** The space before and after, in points. */
export function SpacingRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyRow label={labels.spacing} unit="pt">
      <PropertyStrip>
        <PropertyStripCell letter="↑" label={labels.spaceBefore}>
          <Field
            scope={scope}
            name="spaceBefore"
            label={labels.spaceBefore}
            kind={{ type: 'points' }}
          />
        </PropertyStripCell>
        <PropertyStripCell letter="↓" label={labels.spaceAfter}>
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

/** The line height, as a multiple of the size. */
export function LineHeightRow({ scope }: { scope: StyleScope }) {
  const { labels } = scope.context;
  return (
    <PropertyRow label={labels.lineHeight} unit="×">
      <Field
        scope={scope}
        name="lineHeight"
        label={labels.lineHeight}
        kind={{ type: 'number', min: 0.8, max: 3, step: 0.05 }}
      />
    </PropertyRow>
  );
}

/** What a style reads as in its card's header: its font and size, and its spacing. */
export function styleSummary(scope: StyleScope): string {
  const read = (key: string) => {
    const value = styleValue(scope, [key]);
    return value.own ?? value.inherited;
  };
  const points = (key: string) => {
    const value = toPoints(read(key));
    return value === null ? '–' : String(value);
  };
  const font = typeof read('font') === 'string' ? String(read('font')) : '';
  return `${font} ${points('size')}pt · ${points('spaceBefore')}/${points('spaceAfter')}`.trim();
}

/** Whether the style sets anything of its own. */
export function isStyleOverridden(scope: StyleScope): boolean {
  const own = settingAt(scope.context.target.own, scope.path);
  return Boolean(own && typeof own === 'object' && Object.keys(own).length);
}
