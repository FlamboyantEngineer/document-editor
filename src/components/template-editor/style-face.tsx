// A style's face toggles, its weight, slant and underline, and its alignment row: the alignment,
// justified for running text only, with the line height after it where the style has one.

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
import { Field, type StyleScope, styleValue } from './style-fields.js';

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

const asFlag = (value: unknown) => (typeof value === 'boolean' ? value : null);
const asBold = (value: unknown) => (typeof value === 'number' ? value >= 600 : null);

/** The weight and slant toggles, and the underline one unless left out. */
export function FaceToggles({
  scope,
  underline = true,
}: {
  scope: StyleScope;
  underline?: boolean | undefined;
}) {
  const { labels } = scope.context;
  return (
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
      {underline ? (
        <FaceToggle
          scope={scope}
          name="underline"
          label={labels.underline}
          icon={UnderlineGlyph}
          read={asFlag}
          write={(on) => on}
        />
      ) : null}
    </PropertyIconGroup>
  );
}

const ALIGNMENT_GLYPHS = {
  left: TextAlignLeftGlyph,
  center: TextAlignCenterGlyph,
  right: TextAlignRightGlyph,
  justify: TextAlignJustifyGlyph,
} as const;

const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

/**
 * The alignment, then the line height as a multiple of the size where the style has one. Text
 * that is not justified, such as a heading, keeps the justify segment as an inert placeholder,
 * so its row lines up with running text's.
 */
export function AlignRow({
  scope,
  align,
  lineHeight,
}: {
  scope: StyleScope;
  align: 'none' | 'plain' | 'justify';
  lineHeight: boolean;
}) {
  const { labels } = scope.context;
  const alignment = styleValue(scope, ['alignment']);
  const own = typeof alignment.own === 'string' ? alignment.own : null;
  const inherited = typeof alignment.inherited === 'string' ? alignment.inherited : null;
  const aligns = ALIGNMENTS.map((id) => ({
    value: id,
    label: labels.alignments[id],
    icon: ALIGNMENT_GLYPHS[id],
    ...(id === 'justify' && align !== 'justify' ? { isDisabled: true } : {}),
  }));
  return (
    <PropertyRow
      label={align === 'none' ? labels.lineHeight : labels.alignment}
      keywords={lineHeight && align !== 'none' ? [labels.lineHeight] : undefined}
    >
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
      {lineHeight ? (
        <PropertyStrip>
          <PropertyStripCell letter="×" label={labels.lineHeight}>
            <Field
              scope={scope}
              name="lineHeight"
              label={labels.lineHeight}
              kind={{ type: 'number', min: 0 }}
            />
          </PropertyStripCell>
        </PropertyStrip>
      ) : null}
    </PropertyRow>
  );
}
